"use strict";

// ComfyUI 抠图工作流的自动组装。
//
// AI OS 不绑定某一家 ComfyUI 抠图插件：先读目标 ComfyUI 的 /object_info，
// 从已安装节点里挑出真正可用的抠图节点，再按它的真实输入输出拼工作流。
// 找不到时给出明确的中文安装建议，而不是抛一个看不懂的报错。

const JOIN_NODE_CLASS = "JoinImageWithAlpha";
const SAVE_NODE_CLASS = "SaveImage";

// 常见抠图节点的显示名与所属插件，用于给出「装哪个插件」的提示。
const REMOVAL_NODE_HINTS = Object.freeze([
  { pattern: /^ImageRemoveBackground$/, label: "RMBG 抠图（ComfyUI-RMBG）", pack: "ComfyUI-RMBG" },
  { pattern: /^RMBG/, label: "RMBG 抠图", pack: "ComfyUI-RMBG / comfyui-rmbg" },
  { pattern: /^BiRefNet/, label: "BiRefNet 抠图", pack: "ComfyUI-BiRefNet" },
  { pattern: /^BRIA_RMBG/, label: "BRIA RMBG 抠图", pack: "ComfyUI-BRIA_AI-RMBG" },
  { pattern: /^LayerMask:\s*RemBg/, label: "LayerStyle 抠图", pack: "ComfyUI_LayerStyle" },
  { pattern: /^AILab_RemoveBackground$/, label: "AILab 抠图", pack: "ComfyUI-AILab" },
  { pattern: /RemoveBackground|RemBg|RemoveBg|Matting|BackgroundRemoval/i, label: "图像抠图节点", pack: "任意提供抠图节点的插件" },
]);

const GENERIC_REMOVAL_PATTERN = /remove.?background|rembg|remove.?bg|birefnet|rmbg|matting|foreground.?(segment|extract)/i;

function definitionsOf(spec, group) {
  const section = spec?.[group];
  return section && typeof section === "object" ? section : {};
}

function outputTypes(spec) {
  return Array.isArray(spec?.output) ? spec.output.map((item) => String(item)) : [];
}

// ComfyUI 的输入定义区分两种情况：
//   需要连线：["IMAGE"]
//   带默认值的控件：["INT", { default: 1024 }] 或 [["RMBG-2.0"], { default: "RMBG-2.0" }]
// 两者都是数组且 [0] 是字符串/数组，所以要靠第二个元素是否是元数据对象来判断。
function isWidgetInput(definition) {
  return Array.isArray(definition)
    && definition.length > 1
    && definition[1] !== null
    && typeof definition[1] === "object"
    && !Array.isArray(definition[1]);
}

function isLinkInput(definition) {
  return Array.isArray(definition) && !isWidgetInput(definition) && typeof definition[0] === "string";
}

function isImageLinkInput(definition) {
  return isLinkInput(definition) && String(definition[0]).toUpperCase() === "IMAGE";
}

function hintFor(classType) {
  return matchHint(classType) || { label: classType, pack: "任意提供抠图节点的插件" };
}

function matchHint(classType) {
  return REMOVAL_NODE_HINTS.find((item) => item.pattern.test(classType)) || null;
}

// 在 /object_info 里挑抠图节点：先精确命中常见类名，再退回「名字像抠图且能接受一张图」的节点。
function findRemovalNode(objectInfo = {}) {
  const usable = [];
  for (const [classType, spec] of Object.entries(objectInfo || {})) {
    const required = definitionsOf(spec, "input").required;
    const optional = definitionsOf(spec, "input").optional;
    const all = { ...required, ...optional };
    const imageInput = Object.keys(all).find((name) => isImageLinkInput(all[name]));
    if (!imageInput) continue;
    const outputs = outputTypes(spec);
    const imageOutputIndex = outputs.findIndex((type) => type.toUpperCase() === "IMAGE");
    const maskOutputIndex = outputs.findIndex((type) => type.toUpperCase() === "MASK");
    if (imageOutputIndex < 0 && maskOutputIndex < 0) continue;
    usable.push({
      classType,
      spec,
      inputs: all,
      imageInput,
      imageOutputIndex,
      maskOutputIndex,
      exact: Boolean(matchHint(classType)),
      generic: GENERIC_REMOVAL_PATTERN.test(classType),
    });
  }
  const preferred = usable.filter((item) => item.exact).sort((a, b) => a.classType.localeCompare(b.classType));
  if (preferred.length) return preferred[0];
  const generic = usable.filter((item) => item.generic).sort((a, b) => a.classType.localeCompare(b.classType));
  return generic.length ? generic[0] : null;
}

function describeInstallOptions() {
  const packs = [...new Set(REMOVAL_NODE_HINTS.map((item) => item.pack))];
  return `请在 ComfyUI 里安装任意一个提供抠图节点的插件（推荐 ComfyUI-RMBG 或 ComfyUI-BiRefNet），然后重启 ComfyUI。可选：${packs.join("、")}。`;
}

function buildInputValues(node) {
  const values = {};
  for (const [name, definition] of Object.entries(node.inputs)) {
    if (name === node.imageInput) continue;
    if (definition && !Array.isArray(definition) && typeof definition === "object" && Object.hasOwn(definition, "default")) {
      values[name] = definition.default;
      continue;
    }
    if (!isWidgetInput(definition)) continue;
    const options = definition[0];
    const meta = definition[1] || {};
    if (Object.hasOwn(meta, "default")) values[name] = meta.default;
    else if (Array.isArray(options) && options.length) values[name] = options[0];
  }
  return values;
}

// 组装 API 格式工作流：抠图节点 → 合成透明通道 → 保存 PNG。
function buildBackgroundRemovalWorkflow(objectInfo, options = {}) {
  const imageName = String(options.imageName || "").trim();
  if (!imageName) throw Object.assign(new Error("缺少已上传到 ComfyUI 的图片名。"), { code: "comfy_image_missing", statusCode: 400 });
  const node = options.node || findRemovalNode(objectInfo);
  if (!node) {
    throw Object.assign(new Error(`当前 ComfyUI 没有可用的抠图节点。${describeInstallOptions()}`), {
      code: "comfy_removal_node_missing",
      statusCode: 409,
    });
  }
  const outputPrefix = String(options.outputPrefix || `aios_cutout_${Date.now()}`);
  const workflow = {};

  workflow["1"] = {
    class_type: "LoadImage",
    inputs: { image: imageName, upload: "image" },
    _meta: { title: "输入图片" },
  };
  workflow["2"] = {
    class_type: node.classType,
    inputs: { ...buildInputValues(node), [node.imageInput]: ["1", 0] },
    _meta: { title: "抠图" },
  };

  let source = ["2", Math.max(0, node.imageOutputIndex)];
  if (node.maskOutputIndex >= 0 && objectInfo?.[JOIN_NODE_CLASS]) {
    workflow["3"] = {
      class_type: JOIN_NODE_CLASS,
      inputs: { image: ["2", node.imageOutputIndex], alpha: ["2", node.maskOutputIndex] },
      _meta: { title: "套上透明通道" },
    };
    source = ["3", 0];
  }
  workflow["4"] = {
    class_type: SAVE_NODE_CLASS,
    inputs: { images: source, filename_prefix: outputPrefix },
    _meta: { title: "保存透明 PNG" },
  };

  return {
    workflow,
    nodeClass: node.classType,
    hasAlpha: Boolean(workflow["3"]),
    label: hintFor(node.classType).label,
  };
}

module.exports = {
  JOIN_NODE_CLASS,
  SAVE_NODE_CLASS,
  REMOVAL_NODE_HINTS,
  findRemovalNode,
  describeInstallOptions,
  buildInputValues,
  buildBackgroundRemovalWorkflow,
};
