const assert = require("node:assert/strict");
const builder = require("../comfyui-background-removal");

// 贴近真实 /object_info 的片段：数组形态是需要连线的输入，对象形态是带默认值的控件。
const objectInfo = {
  LoadImage: {
    input: { required: { image: [["example.png"], { image_upload: true }] } },
    output: ["IMAGE", "MASK"],
  },
  SaveImage: {
    input: { required: { images: ["IMAGE"], filename_prefix: ["STRING", { default: "ComfyUI" }] } },
    output: [],
  },
  JoinImageWithAlpha: {
    input: { required: { image: ["IMAGE"], alpha: ["MASK"] } },
    output: ["IMAGE"],
  },
  ImageRemoveBackground: {
    input: {
      required: {
        image: ["IMAGE"],
        model: [["RMBG-2.0", "RMBG-1.4"], { default: "RMBG-2.0" }],
        sensitivity: ["FLOAT", { default: 1, min: 0, max: 1 }],
        process_res: ["INT", { default: 1024 }],
        mask_blur: ["INT", { default: 0 }],
        invert_output: ["BOOLEAN", { default: false }],
      },
    },
    output: ["IMAGE", "MASK"],
  },
  KSampler: {
    input: { required: { model: ["MODEL"], positive: ["CONDITIONING"], seed: ["INT", { default: 0 }] } },
    output: ["LATENT"],
  },
};

// ── 1. 能识别常见抠图节点 ────────────────────────────────────────
const node = builder.findRemovalNode(objectInfo);
assert.ok(node, "应该认出 ImageRemoveBackground");
assert.equal(node.classType, "ImageRemoveBackground");
assert.equal(node.imageInput, "image");
assert.equal(node.imageOutputIndex, 0);
assert.equal(node.maskOutputIndex, 1);

// ── 2. 生成的工作流结构正确、控件默认值照抄节点定义 ────────────────
const built = builder.buildBackgroundRemovalWorkflow(objectInfo, { imageName: "cutout_input.png", outputPrefix: "aios_cutout_1" });
assert.equal(built.nodeClass, "ImageRemoveBackground");
assert.equal(built.hasAlpha, true, "有 MASK 输出时必须合成透明通道");
assert.equal(built.workflow["1"].class_type, "LoadImage");
assert.equal(built.workflow["1"].inputs.image, "cutout_input.png");
assert.deepEqual(built.workflow["2"].inputs.image, ["1", 0]);
assert.equal(built.workflow["2"].inputs.model, "RMBG-2.0", "控件默认值直接跟随节点定义");
assert.equal(built.workflow["2"].inputs.process_res, 1024);
assert.deepEqual(built.workflow["3"].inputs, { image: ["2", 0], alpha: ["2", 1] });
assert.equal(built.workflow["3"].class_type, builder.JOIN_NODE_CLASS);
assert.deepEqual(built.workflow["4"].inputs.images, ["3", 0]);
assert.equal(built.workflow["4"].inputs.filename_prefix, "aios_cutout_1");
assert.equal(Object.values(built.workflow).some((item) => item.class_type === "KSampler"), false, "不会把无关节点带进工作流");

// ── 3. 只有 IMAGE 输出的节点直接保存，不硬拼透明通道 ───────────────
const imageOnly = { ...objectInfo, RmBgOnly: { input: { required: { image: ["IMAGE"] } }, output: ["IMAGE"] } };
const onlyNode = builder.findRemovalNode({ ...imageOnly, ImageRemoveBackground: undefined });
assert.equal(onlyNode.classType, "RmBgOnly", "精确命中失败时退回通用识别");
const onlyBuilt = builder.buildBackgroundRemovalWorkflow({ ...imageOnly, ImageRemoveBackground: undefined }, { imageName: "a.png" });
assert.equal(onlyBuilt.hasAlpha, false);
assert.deepEqual(onlyBuilt.workflow["4"].inputs.images, ["2", 0]);

// ── 4. 节点输出顺序颠倒时按真实索引接线 ──────────────────────────
const reversed = {
  ...objectInfo,
  BiRefNet: { input: { required: { image: ["IMAGE"], model: [["a"], { default: "a" }] } }, output: ["MASK", "IMAGE"] },
};
const reversedBuilt = builder.buildBackgroundRemovalWorkflow(reversed, { imageName: "a.png" });
assert.equal(reversedBuilt.nodeClass, "BiRefNet", "BiRefNet 也要能识别");
assert.deepEqual(reversedBuilt.workflow["3"].inputs.image, ["2", 1], "IMAGE 在第 2 个输出");
assert.deepEqual(reversedBuilt.workflow["3"].inputs.alpha, ["2", 0], "MASK 在第 1 个输出");

// ── 5. 没有可用节点时给出可执行的安装建议，而不是崩溃 ──────────────
assert.equal(builder.findRemovalNode({ LoadImage: objectInfo.LoadImage, SaveImage: objectInfo.SaveImage }), null);
assert.throws(
  () => builder.buildBackgroundRemovalWorkflow({ LoadImage: objectInfo.LoadImage }, { imageName: "a.png" }),
  (error) => error.code === "comfy_removal_node_missing" && /ComfyUI-RMBG/.test(error.message) && /安装/.test(error.message),
  "缺节点时必须提示安装哪个插件",
);
assert.throws(() => builder.buildBackgroundRemovalWorkflow(objectInfo, {}), (error) => error.code === "comfy_image_missing");
assert.match(builder.describeInstallOptions(), /ComfyUI-RMBG/);

console.log("ComfyUI background removal checks passed.");
