"use strict";

const IMAGE_NODE_IDS = Object.freeze(["705", "704", "703", "701"]);
const PROMPT_NODE_IDS = Object.freeze(["254", "454"]);
const ASPECT_RATIOS = Object.freeze({
  "1:1": "1:1 (Square)",
  "2:3": "2:3 (Portrait Photo)",
  "3:2": "3:2 (Photo)",
  "3:4": "3:4 (Portrait Standard)",
  "4:3": "4:3 (Standard)",
  "9:16": "9:16 (Portrait Widescreen)",
  "16:9": "16:9 (Widescreen)",
  "21:9": "21:9 (Ultrawide)",
});
const REQUIRED_CLASSES = Object.freeze({
  115: "ResolutionSelector",
  254: "MiniMaxH3ReferenceToVideo",
  269: "SelfLiftH3Sampler",
  454: "MiniMaxH3ReferenceToVideo",
  469: "SelfLiftH3Sampler",
  501: "MiniMaxH3AddGuide",
  502: "TrimAudioDuration",
  604: "VHS_VideoCombine",
  705: "LoadImage",
  704: "LoadImage",
  703: "LoadImage",
  701: "LoadImage",
});

function normalizeCommerceParameters(value = {}) {
  const aspectRatio = value.aspect_ratio;
  const megapixels = value.megapixels;
  if (aspectRatio !== undefined && !Object.hasOwn(ASPECT_RATIOS, aspectRatio)) throw new Error("H3 带货画幅无效。");
  if (megapixels !== undefined && megapixels !== 0.6 && megapixels !== 1) throw new Error("H3 带货分辨率仅支持 0.6 MP 或 1.0 MP。");
  return { aspect_ratio: aspectRatio, megapixels };
}

function normalizeCommerceRequest(value = {}) {
  const promptA = String(value.prompt_a ?? value.promptA ?? "").trim();
  const promptB = String(value.prompt_b ?? value.promptB ?? "").trim();
  if (!promptA || !promptB) throw new Error("H3 带货需要完整的提示词 A 和提示词 B。");
  if (!Array.isArray(value.images) || value.images.length !== 4) {
    throw new Error("H3 带货需要按顺序提供四张独立参考图片。");
  }
  const images = value.images.map((item, index) => {
    const url = String(typeof item === "string" ? item : item?.url || item?.src || "").trim();
    const name = String(typeof item === "object" ? item?.name || "" : "").trim();
    if (!url || !name) throw new Error(`H3 带货图片 ${index + 1} 缺少有效的媒体地址或文件名。`);
    if (/^(?:file:|data:|javascript:)/i.test(url) || /(?:^|[/\\])\.\.(?:[/\\]|$)/.test(url)) {
      throw new Error(`H3 带货图片 ${index + 1} 的媒体地址无效。`);
    }
    return { url, name };
  });
  return { promptA, promptB, images, ...normalizeCommerceParameters(value) };
}

function assertCommerceWorkflowContract(template) {
  if (!template || typeof template !== "object" || Array.isArray(template)) {
    throw new Error("H3 带货工作流格式无效。");
  }
  const ids = Object.keys(template);
  if (ids.length !== 40 || ids.some(id => !/^\d+$/.test(id))) {
    throw new Error("H3 带货工作流节点结构与已校验模板不一致。");
  }
  for (const [id, classType] of Object.entries(REQUIRED_CLASSES)) {
    const node = template[id];
    if (node?.class_type !== classType || !node.inputs || typeof node.inputs !== "object") {
      throw new Error(`H3 带货工作流节点 ${id} 缺失或类型不符。`);
    }
  }
  const connections = [
    ...PROMPT_NODE_IDS.flatMap(id => [[id, "width", ["115", 0]], [id, "height", ["115", 1]]]),
    ["254", "ref_images.ref_image_0", ["705", 0]],
    ["254", "ref_images.ref_image_1", ["704", 0]],
    ["254", "ref_images.ref_image_2", ["703", 0]],
    ["254", "ref_images.ref_image_3", ["701", 0]],
    ["454", "ref_images.ref_image_0", ["705", 0]],
    ["454", "ref_images.ref_image_1", ["704", 0]],
    ["454", "ref_images.ref_image_2", ["703", 0]],
    ["454", "ref_images.ref_image_3", ["701", 0]],
    ["454", "ref_audios.ref_audio_0", ["502", 0]],
    ["502", "audio", ["235", 0]],
    ["501", "image", ["500", 0]],
    ["469", "positive", ["501", 0]],
    ["604", "images", ["602", 0]],
    ["604", "audio", ["603", 0]],
  ];
  if (template["115"].inputs.multiple !== 32) throw new Error("H3 带货工作流节点 115 的尺寸对齐配置无效。");
  for (const [nodeId, input, expected] of connections) {
    if (JSON.stringify(template[nodeId].inputs[input]) !== JSON.stringify(expected)) {
      throw new Error(`H3 带货工作流节点 ${nodeId}.${input} 关键连接缺失。`);
    }
  }
  for (const id of ids) {
    const node = template[id];
    for (const [name, value] of Object.entries(node?.inputs || {})) {
      if (!Array.isArray(value)) continue;
      const sourceId = String(value[0] ?? "");
      if (!template[sourceId]) throw new Error(`H3 带货工作流节点 ${id}.${name} 引用了缺失节点 ${sourceId}。`);
    }
  }
  return true;
}

function prepareCommerceWorkflow(template, value, outputPrefix) {
  assertCommerceWorkflowContract(template);
  const request = normalizeCommerceRequest(value);
  const workflow = JSON.parse(JSON.stringify(template));
  if (request.aspect_ratio !== undefined) workflow["115"].inputs.aspect_ratio = ASPECT_RATIOS[request.aspect_ratio];
  if (request.megapixels !== undefined) workflow["115"].inputs.megapixels = request.megapixels;
  workflow["254"].inputs.prompt = request.promptA;
  workflow["454"].inputs.prompt = request.promptB;
  IMAGE_NODE_IDS.forEach((id, index) => {
    workflow[id].inputs.image = request.images[index].name;
  });
  workflow["604"].inputs.filename_prefix = String(outputPrefix || "").trim();
  if (!workflow["604"].inputs.filename_prefix) throw new Error("H3 带货最终视频输出名称无效。");
  return workflow;
}

module.exports = Object.freeze({
  IMAGE_NODE_IDS,
  PROMPT_NODE_IDS,
  REQUIRED_CLASSES,
  assertCommerceWorkflowContract,
  normalizeCommerceRequest,
  normalizeCommerceParameters,
  prepareCommerceWorkflow,
});
