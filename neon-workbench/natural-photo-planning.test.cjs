const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { naturalPhotoFidelity: photo } = require("../host-sources/app/canvas-agent-conversation");
const skillContracts = require("../host-sources/app/canvas-agent-skill-contract");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveHostFeature(request, parent, ...args) {
  if (request === "./canvas-feature-registry.js" && parent?.filename.startsWith(path.resolve(__dirname, "../host-sources/app") + path.sep)) {
    return path.resolve(__dirname, "design-sources/canvas-feature-registry.js");
  }
  return resolveFilename.call(this, request, parent, ...args);
};
const { createSkillRegistry } = require("../host-sources/app/skill-registry");
Module._resolveFilename = resolveFilename;

const packageRoot = path.resolve(__dirname, "../host-sources/app/skill-packages/natural-aesthetic-product-photography");
const read = file => fs.readFileSync(path.join(packageRoot, file), "utf8");
const cases = [
  {
    name: "T16 青绿色半透明手机壳",
    method: "A + B",
    reason: "单张已见面覆盖镜头和铰链。右侧展开环需要横向空间，侧后窗光让壳缘透光，细哑背景让轮廓读得清楚。",
    product: ["半透明手机壳", "青绿色半透明，保留可辨 NILLKIN 标识", "手机装在壳内，三枚镜头，右侧原铰点连接展开矩形环"],
    placement: "原图近直立姿态，底缘直接接触连续暖灰米色灰泥台面",
    composition: "3:4 竖幅，产品偏左，右侧预留展开环及留白",
    creative: "自然窗光数码静物。3:4 画面保留原图近直立姿态与同侧观察视角，偏左取景，右侧展开环周围留空。底缘接触连续暖灰米色细哑灰泥台面，墙面退后柔化。左后方画外窗光擦过青绿壳缘，前侧中性回光照清镜头与铰链，短接触影落在右前方。镜头、壳边和展开环同时清晰。",
  },
  {
    name: "透明香水瓶",
    method: "A + D",
    reason: "瓶身对称，中心构图保持标签读序。窗面的柔边反射可以说明玻璃厚度，并显出液面。",
    product: ["香水瓶", "透明玻璃和浅金液体", "矩形瓶体、镜面金属盖与原有正标"],
    placement: "瓶底直接落在浅灰石灰岩连续台面",
    composition: "居中保留上方版位，前景压低",
    creative: "以液体透射为视觉重点的窗边静物。让香水瓶正面居中，顶部留出品牌版位。瓶底与细纹浅灰石灰岩台面相接，浅墙后退。右侧高窗经薄布漫射，瓶右缘和厚底微透，左侧白墙回光保持浅金液面与正标可辨，镜面盖仅有一道连贯柔高光，焦点覆盖瓶盖和标签。",
  },
  {
    name: "哑面护肤瓶",
    method: "C",
    reason: "浅色哑面靠柔侧光显出弧度。背景植物置远可带出生活氛围，同时保持正标与泵头清楚。",
    product: ["护肤瓶", "浅色哑面瓶体", "原有泵头与正标"],
    placement: "瓶底落在白蜡木台面",
    composition: "主体放在右三分位，近处虚叶让出左下角",
    creative: "清透生活静物。竖幅右三分位摆放浅色护肤瓶，瓶底接触淡色白蜡木。左下角仅有一片低对比虚叶，背景灰绿植物退远。画外左上长窗的柔侧光形成浅亮弧面和短接触影。中性回光保留瓶身原色，正标和泵头清楚，边缘柔和。",
  },
  {
    name: "银色金属电子品",
    method: "B + F",
    reason: "连续窗面反射能表现深浅变化与倒角。深色哑石提供纹理和明度差，侧重展示接口和精度。",
    product: ["金属电子品", "银色拉丝表面", "原有倒角、端口与接口排列"],
    placement: "依原来的姿态在深灰细纹板岩平面落位",
    composition: "下方偏心，画外遮挡的斜投影引向可见端口",
    creative: "冷中性色的金属商业静物，横幅主体落在画面下方偏左。按原姿态置于深灰板岩连续面，石纹延伸向后方。右上大窗在银色倒角留下连贯宽反射，左前方暗面压出接口轮廓，画外遮挡在背景产生一处斜影。保持拉丝方向，机位从已见面取景，接口和倒角均清晰。",
  },
  {
    name: "白色包装产品",
    method: "D",
    reason: "用中明度有色背景保留白盒边界，柔侧光避免正标变灰。横版左留白满足电商投放。",
    product: ["白色包装盒", "原白哑光纸面与可辨印字", "原有折线与盒体厚度"],
    placement: "白盒正标朝向镜头，底部直接接触哑光纸面",
    composition: "横幅主体偏右，左留完整文字版位",
    creative: "横版电商首图。白色包装偏右且保持正标朝向，底部接触浅雾紫哑光纸面，背景同色纸向后转折，左侧留白以便排版。左上漫射窗光照清原白纸面，右侧留一度侧边影和贴地短影，包装外边及折线清楚，背景低对比，不加道具。",
  },
];

test("私人摄影 Skill 只加载摄影方法及经筛选的作品观察", (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "aios-photo-method-only-"));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const id = "natural-aesthetic-product-photography";
  const owner = "photo-method-test";
  const registry = createSkillRegistry({ dataDir, systemDir: path.join(dataDir, "system") });
  const files = fs.readdirSync(packageRoot, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => {
      const relative = path.relative(packageRoot, path.join(entry.parentPath, entry.name)).split(path.sep).join("/");
      return { path: relative, content: fs.readFileSync(path.join(packageRoot, relative)) };
    });
  registry.installPersonalSkill(owner, id, files, { source: "test" });
  const loaded = registry.loadAgentCatalog(owner).all.find(item => item.id === id);
  const methodFile = "references/photography-methods.md";
  const indexFile = "references/visual-method-catalog.md";
  assert.deepEqual(loaded.references.map(item => item.path), [methodFile, indexFile]);
  for (const retired of ["references/case-library.md", "references/visual-index.md", "references/cases/NA-05.md"]) {
    assert.throws(() => registry.readReference(id, retired, owner), { code: "unknown_reference" });
  }
  const methods = registry.readReference(id, methodFile, owner).content;
  const index = registry.readReference(id, indexFile, owner).content;
  assert.match(index, /^### REF-035$/mu);
  assert.doesNotMatch(index, /\.png|[A-Z]:[\\\/]/u);
  const { stages } = JSON.parse(read("agent.skill.json"));
  assert.deepEqual(stages[0].mustRead, [methodFile, indexFile]);
  assert.deepEqual([...methods.matchAll(/^\| ([A-G]) /gm)].map(match => match[1]),
    ["A", "B", "C", "D", "E", "F", "G"]);
  const techniques = methods.split("### 可跨预设组合的七种技法")[1].split("## 质量核验")[0];
  assert.equal([...techniques.matchAll(/^\*\*.+?\*\*/gm)].length, 7);
  assert.doesNotMatch(loaded.instructions + methods, /case-library|visual-index|source-notes\.md|案例库索引|案例检索/u);
  const contract = skillContracts.createContract({ id, execution: { stages } },
    { manualActivated: true, prompt: "自然美学产品摄影" });
  assert.equal(skillContracts.validateReferenceGate(contract).code, "skill_reference_required");
  const withReading = skillContracts.recordToolResult(contract, { name: "read_skill_reference", arguments: { path: methodFile } },
    { ok: true, path: methodFile, content: methods });
  assert.equal(skillContracts.validateReferenceGate(withReading).code, "skill_reference_required");
  const withIndex = skillContracts.recordToolResult(withReading, { name: "read_skill_reference", arguments: { path: indexFile } },
    { ok: true, path: indexFile, content: index });
  assert.equal(skillContracts.validateReferenceGate(withIndex).ok, true);
});

function prepare(scene) {
  const nodeId = "product";
  const [name, appearance, structure] = scene.product;
  const reference = { nodeId, type: "image", role: "product", url: "/output/fixture.png", sha256: "a".repeat(64) };
  const knownContext = { version: 2, analysis: `${scene.method}。 ${scene.reason}`,
    images: [{ nodeId, subjectInventory: { targetObjects: [{ id: "item", name, count: 1, appearance, structure }] } }],
    presentation: { support: "surface", placement: scene.placement, compositionChange: scene.composition },
  };
  const brief = photo.readBrief(JSON.stringify(knownContext), [nodeId], null, [reference], { modelSubmission: true });
  const creative = photo.preparePresentation(brief, scene.creative, scene.reason, { required: true, compact: true });
  return photo.nodeLock(brief.images, brief.references, creative, { compact: true });
}

test("艺术指导模式只发送简短商品引用，保留旧节点提示词和真实素材身份", () => {
  const nodeId = "product";
  const references = [{ nodeId, name: "商品", type: "image", role: "product", url: "/output/fixture.png", sha256: "a".repeat(64) }];
  const source = { version: 2, analysis: "青绿色组合商品", images: [{ nodeId, subjectInventory: { targetObjects: [{ id: "item", name: "商品", count: 1, appearance: "青绿半透明", structure: "独特五边轮廓及连接扣" }] } }],
    creativeDirections: { artDirection: true, recommendedId: "arc", reason: "弧影提供画面节奏", options: [{ id: "arc", name: "浴光", concept: "借白色大弧影与有色侧壁做明暗递进", scene: "近处白色亚麻，中景青色纸面，远处暗红墙", placement: "整个组合斜放在连续实面", composition: "对角线布局，右下主体，左上留白", camera: "斜俯视，中焦透视，焦点落在亮暗交界", light: "左后方向硬光，右前白面回光，投影往右下延伸", color: "低明度酒红衬托青绿和奶白", method: "编辑摄影", use: "横版品牌海报", references: [{ id: "REF-035", borrow: "迁移帘影分割和前中远明度层次" }] }] } };
  const brief = photo.readBrief(JSON.stringify(source), [nodeId], null, references, { modelSubmission: true, artDirection: true, referenceIds: ["REF-035"] });
  const creative = photo.selectCreativeDirection(brief, "arc").creative;
  const locked = photo.nodeLock(brief.images, references, creative, { compact: true });
  assert.match(locked.prompt, /^【产品依据】\n@图1[^\n]*\n\n【艺术指导】/u);
  assert.doesNotMatch(locked.prompt, /产品保护|独特五边轮廓|REF-035|必须|禁止/u);
  assert.ok(locked.prompt.includes("对角线布局") && locked.prompt.includes("方向硬光"));
  assert.deepEqual(photo.readNodeLock(JSON.stringify(locked)), locked);
  assert.equal(photo.verifyRequest(locked, locked.prompt, [{ sourceNodeId: nodeId, url: references[0].url }]).length, 1);
  assert.throws(() => photo.readBrief(JSON.stringify(source), [nodeId], null, references, { modelSubmission: true, artDirection: true, referenceIds: ["REF-039"] }), /REF-035/u);
});

test("摄影方向可独立构建完整提示词，切换时保留商品与实物承托", () => {
  const nodeId = "product";
  const references = [{ nodeId, name: "商品", type: "image", role: "product", url: "/output/fixture.png", sha256: "b".repeat(64) }];
  const scene = (id, values) => ({ id, ...values, camera: "同侧中焦，正标与边缘均清楚", method: "利用方向光分离边缘", risk: "保留原标识，主体接触影贴底", use: "品牌电商首屏" });
  const hills = scene("hills", { name: "旷野", concept: "天际留白突出长轮廓", scene: "近处草坡，远处是开阔天空", placement: "商品靠近左下，底部接触实地", composition: "主体约占画幅一半，右上留白", light: "右后低角度暖日光，前侧用中性回光", color: "麦绿与淡天蓝分离青绿商品" });
  const optics = scene("optics", { name: "净透", concept: "用高反差剪影突出薄边", scene: "前侧窄哑纹，中景连续玻璃台面，远处暗色织物", placement: "商品右移，底部接触连续实面", composition: "商品约占三分之二，左上留暗区", light: "左侧窄硬光透过远景纹理，右前弱补光", color: "中性暗背景与淡琥珀亮斑衬托商品" });
  const value = { version: 2, analysis: "保持原图商品", images: [{ nodeId, subjectInventory: { targetObjects: [{ id: "item", name: "青绿保护壳", count: 1, appearance: "青绿半透明", structure: "三枚镜头与展开环", markings: "NILLKIN" }] } }], creativeDirections: { recommendedId: "optics", reason: "边缘透光与标识可读性同时成立", options: [hills, optics] } };
  const read = value => photo.readBrief(JSON.stringify(value), [nodeId], null, references, { modelSubmission: true, requireCreativeComparison: true });
  const brief = read(value);
  for (const direction of [hills, optics]) {
    const selected = photo.selectCreativeDirection(brief, direction.id);
    const prompt = photo.preparePrompt(brief.images, selected.creative, references, { compact: true }).prompt;
    assert.deepEqual([...prompt.matchAll(/^【(.+?)】/gmu)].map(match => match[1]), ["产品依据", "创意设计", "摄影执行", "产品保护"]);
    assert.match(prompt, /@图1[\s\S]+三枚镜头[\s\S]+NILLKIN/u);
    assert.ok(prompt.includes(direction.scene) && prompt.includes(direction.light));
    assert.deepEqual(read({ ...value, creativeDirections: selected.directions }).creativeDirections.selectedId, direction.id);
  }
  assert.throws(() => read({ ...value, creativeDirections: undefined }), /提供 2–3 个/u);
  assert.throws(() => read({ ...value, creativeDirections: { ...value.creativeDirections, options: [hills, { ...hills, id: "optics", name: "改名" }] } }), /场景、构图与布光/u);
  assert.throws(() => read({ ...value, creativeDirections: { ...value.creativeDirections, options: [hills, { ...optics, placement: "商品放在独立底座上" }] } }), /展示辅助件/u);
});

for (const scene of cases) {
  test(`${scene.name}的策划和商品原图可进入同一节点请求`, () => {
    const lock = prepare(scene);
    assert.deepEqual(photo.readNodeLock(JSON.stringify(lock)), lock);
    assert.deepEqual(lock.mentions.map(item => [item.label, item.role]), [["@图1", "product"]]);
    assert.match(lock.prompt, /^【产品依据】[\s\S]+【摄影执行】/u);
    assert.ok(lock.prompt.includes(scene.product[0]));
    assert.ok(lock.prompt.includes(scene.creative));
    assert.equal(photo.verifyRequest(lock, lock.prompt, [{ url: lock.sources[0].url, sourceNodeId: "product" }]).length, 1);
  });
}

test("白盒用户指定竖版正中及冷色时可修改方向并保留商品清单", () => {
  const original = cases.at(-1);
  const changed = prepare({ ...original, composition: "竖版居中，顶端留白",
    reason: "按用户要求改为竖版居中，石蓝环境与白盒形成明度差。",
    creative: "竖版居中。将白盒保持正标朝向镜头，直接置于低饱和石蓝纸面。左侧画外窗光经过漫射，清楚表现白色纸面与折线。后方同色背景退远，上部保留版位，箱底保留轻短接触影。" });
  assert.deepEqual(changed.images, prepare(original).images);
  assert.match(changed.creative, /竖版居中/);
  assert.doesNotMatch(changed.creative, /横版|雾紫/);
});
