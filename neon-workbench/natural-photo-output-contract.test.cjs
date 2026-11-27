const assert = require("node:assert/strict");
const test = require("node:test");
const { naturalPhotoFidelity: photo } = require("../host-sources/app/canvas-agent-conversation");

const references = [{ nodeId: "clear-case", type: "image", role: "product", url: "/output/original.jpg", sha256: "a".repeat(64) }];
const candidate = {
  version: 2,
  analysis: "透明壳缘、镜头开孔与背部圆环应同时清晰。",
  images: [{ nodeId: "clear-case", subjectInventory: {
    targetObjects: [{ id: "case", name: "透明手机壳", count: 1, appearance: "浅灰透明壳缘", structure: "背部圆环、上部镜头区域", markings: "原壳 NILLKIN" }],
  } }],
  visualFeatures: [
    { nodeId: "clear-case", targetId: "case", observation: "浅灰透明壳缘", importance: "边缘用侧逆光揭示厚薄" },
    { nodeId: "clear-case", targetId: "case", observation: "背部圆环", importance: "焦平面保留圆环完整" },
    { nodeId: "clear-case", targetId: "case", observation: "上部镜头区域", importance: "暗部用中性回光补亮" },
  ],
  creativeDirections: { recommendedId: "window", reason: "第一案可同时读清壳边和镜头区域", options: [
    { id: "window", name: "窗光侧缘", concept: "借斜光突出透明壳缘", scene: "浅灰连续矿物台面和退后的墙",
      placement: "手机壳背面朝上平放于台面", composition: "右下偏心，影线引向边缘", camera: "略俯视，焦点覆盖开孔和壳缘",
      light: "左后侧漫射日光，右前白面回光", color: "微暖灰台面衬托中性壳缘", method: "自然窗光静物",
      use: "商务受众的产品传播", reason: "侧逆光能看清透明壳缘", featureIndices: [1, 3], references: [{ id: "REF-035", borrow: "借窗影组织视线" }] },
    { id: "arch", name: "建筑折面", concept: "以几何边界建立秩序", scene: "一体哑面折墙和墨灰台面",
      placement: "保留原视角，壳背朝上平放", composition: "上三分位主体，左侧折墙引向圆环", camera: "同侧中焦，焦平面覆盖整个组合",
      light: "上方窄缝日光直射，暗侧微补", color: "灰白与墨灰的明度差", method: "几何空间静物",
      use: "商务受众的产品传播", reason: "明暗边界凸显圆环和相机区域", featureIndices: [2, 3], references: [{ id: "REF-036", borrow: "以低明度面衬轮廓" }] },
    { id: "glass", name: "细腻折射", concept: "用宽柔反光展示边缘通透度", scene: "蓝灰细哑台面，背后的光线从半透明隔面透出",
      placement: "背面朝上，原组合平放", composition: "渐变背景横向展开，主体向左偏移", camera: "接近原图可见面，适度收小景深",
      light: "右后大面漫射，左前窄面柔和补光", color: "低饱和蓝灰过渡到浅灰", method: "透明材质静物",
      use: "商务受众的产品传播", reason: "柔亮来自边缘透射，能保留实际质感", featureIndices: [1, 2], references: [{ id: "REF-037", borrow: "让高光边界保持连贯" }] },
  ] },
};
const read = value => photo.readBrief(JSON.stringify(value), ["clear-case"], null, references,
  { modelSubmission: true, photoOnly: true, artDirection: true, referenceIds: ["REF-035", "REF-036", "REF-037"] });

test("真实原图的视觉特征与独立摄影方向保存到方案，生成提示词保留实物标识并限制新增版式", () => {
  const brief = read(candidate);
  assert.equal(brief.visualFeatures.length, 3);
  assert.equal(brief.creativeDirections.options.length, 3);
  const selected = photo.selectCreativeDirection(brief, "glass");
  const lock = photo.nodeLock(brief.images, brief.references, selected.creative, { compact: true });
  assert.match(lock.prompt, /细腻折射/);
  assert.match(lock.prompt, /No typography, no text overlay, no infographic, no feature icons/i);
  assert.match(lock.prompt, /原有.*(?:Logo|标识)/u);
  assert.match(lock.prompt, /浅灰透明壳缘/u);
  assert.deepEqual(photo.readNodeLock(JSON.stringify(lock)), lock);
});

test("拒绝未看见的素材来源、固定少量方向、以及实际失败节点中的海报用途与标题指令", () => {
  const wrong = structuredClone(candidate);
  wrong.visualFeatures[0].nodeId = "not-an-original";
  assert.throws(() => read(wrong), /产品原图/u);
  const few = structuredClone(candidate);
  few.creativeDirections.options.pop();
  assert.throws(() => read(few), /3–5/u);
  const bad = structuredClone(candidate);
  bad.creativeDirections.options[0].use = "用于面向30多岁商务人士的NILLKIN竖版产品海报，预留标题排版空间";
  assert.throws(() => read(bad), /纯摄影/u);
  const raw = "【艺术指导】\n窗光·灰石商务主视觉。用于面向30多岁商务人士的NILLKIN竖版产品海报，预留标题排版空间。";
  const brief = read(candidate);
  const oldLock = photo.nodeLock(brief.images, brief.references, raw, { compact: true });
  assert.deepEqual(photo.readNodeLock(JSON.stringify(oldLock)), oldLock);
  assert.throws(() => photo.verifyRequest(oldLock, oldLock.prompt, [{ sourceNodeId: "clear-case", url: references[0].url }]), /纯摄影/u);
});

test("允许专业方案说明产品海报用途，生成提示仍只描述照片", () => {
  const downstream = structuredClone(candidate);
  downstream.creativeDirections.options[0].use = "用于面向商务人士的产品海报的纯摄影底图";
  const brief = read(downstream);
  const plan = photo.selectCreativeDirection(brief, "window");
  assert.match(plan.summary, /产品海报的纯摄影底图/);
  assert.doesNotMatch(plan.creative, /产品海报/);
  downstream.creativeDirections.options[0].composition = "给产品海报预留标题排版空间";
  assert.throws(() => read(downstream), error => error.field?.endsWith(".composition") && /纯摄影/.test(error.message));
});
