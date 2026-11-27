const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const Conversation = require("../host-sources/app/canvas-agent-conversation");
const app = path.resolve(__dirname, "../host-sources/app");
const ui = fs.readFileSync(path.join(app, "canvas-agent-ui.js"), "utf8");
const capabilityContext = {
  CanvasNodeCreationPolicy: require("./design-sources/canvas-feature-registry"),
};
vm.runInNewContext(fs.readFileSync(path.join(app, "canvas-agent-capabilities.js"), "utf8"), capabilityContext);
function loadFunction(name, context = {}) {
  const start = ui.indexOf("  function " + name + "(");
  assert.ok(start >= 0, name);
  const end = ui.indexOf("\n  }", start) + 4;
  return vm.runInNewContext("(" + ui.slice(start, end) + ")", context);
}

test("摄影方向仅接受三至五项说明完整、互异的模型建议", () => {
  const parse = loadFunction("parseCanvasAgentPhotoSuggestions");
  const directions = [
    { label: "透光边缘", description: "逆向侧光表现透明壳的薄边，保留组合实物的接触影。" },
    { label: "纵深灰廊", description: "借长廊斜光和远近墙的明度差，留出竖版构图空间。" },
    { label: "砂岩浅影", description: "中性石面衬托浅色壳体，柔侧光显出轮廓与标识。" },
  ];
  const payload = { analysis: "半透明壳、手机组合和闭合镜盖", directions };
  const parsed = parse(JSON.stringify(payload));
  assert.deepEqual(JSON.parse(JSON.stringify(parsed)), payload);
  assert.throws(() => parse(JSON.stringify({ ...payload, directions: directions.slice(0, 2) })));
  assert.throws(() => parse(JSON.stringify({ ...payload, directions: [directions[0], ...directions] })));
  assert.deepEqual(JSON.parse(JSON.stringify(parse(
    "以下是摄影方向：\n```json\n" + JSON.stringify({ directions }) + "\n```", payload.analysis,
  ))), payload);
});

test("摄影建议可以在向导切步后回填，修改产品、受众或用途后拒绝旧结果", () => {
  const skillId = "natural-aesthetic-product-photography";
  const key = loadFunction("getCanvasAgentPhotoSuggestionKey");
  const current = loadFunction("isCanvasAgentPhotoSuggestionCurrent", {
    NATURAL_PHOTO_SKILL_ID: skillId, getCanvasAgentPhotoSuggestionKey: key,
  });
  const draft = { taskId: "photo-task", boardId: "canvas", skillId, step: 2, status: "collecting",
    sourceNodeIds: ["real-image"], values: { photo_selection: "real-image", product_positioning: "透明手机壳", audience_usage: "商务主视觉" } };
  assert.equal(current(draft, { ...draft, step: 3, values: { ...draft.values, creative_direction: "custom" } }), true);
  assert.equal(current(draft, { ...draft, values: { ...draft.values, audience_usage: "校园电商" } }), false);
  assert.equal(current(draft, { ...draft, sourceNodeIds: ["different-image"] }), false);
  assert.equal(current(draft, { ...draft, status: "cancelled" }), false);
});

test("动态信息计划只接受 Skill 已声明且值域有效的字段与图片槽", () => {
  const config = Conversation.parseInteraction(JSON.parse(fs.readFileSync(path.resolve(app,
    "skill-packages/natural-aesthetic-product-photography/interaction.json"), "utf8")));
  const plan = Conversation.createInteractionIntakePlan(config, JSON.stringify({
    knownValues: { product_positioning: "白色透明手机壳" },
    collectFields: ["audience_usage", "creative_direction"],
    missingImageSteps: [],
    imageMatches: [{ stepId: "unrecognized", candidateIndex: 1, certain: true }],
    analysis: "银灰透明壳体与手机组合可见",
    directions: [
      { label: "清透石面", description: "中性石面衬托透明壳边，侧光沿外缘保留柔和反射。" },
      { label: "窗影几何", description: "利用矩形窗光和背景留白，保持镜头与背部结构清晰。" },
      { label: "暗底显边", description: "深灰连续台面配合冷侧光，分离透明外框和背板纹样。" },
    ],
  }), {
    taskId: "photo-task", boardId: "canvas", skillId: "natural-aesthetic-product-photography",
    values: { product_positioning: "原始用户提示", audience_usage: "商务主视觉", creative_direction: "recommend", size: "3:4", resolution: "1" },
    userProvidedFieldIds: ["audience_usage"], sourceNodeIds: ["source-image"],
    completeImageStepIds: ["image"], sourceSignature: "a".repeat(64),
  });

  assert.deepEqual([...plan.fieldsToCollect], ["creative_direction"]);
  assert.deepEqual([...plan.imageStepsToCollect], []);
  assert.equal(plan.knownValues.product_positioning, "白色透明手机壳");
  assert.deepEqual([...plan.imageMatches], []);
  assert.equal(plan.directions.length, 3);

  const collection = Conversation.createInteractionCollection(config, plan);
  assert.deepEqual(collection.steps.map(step => step.id), ["creative", "proposal"]);
  assert.deepEqual(collection.steps[0].fields.map(field => field.id), ["creative_direction", "custom_photo_direction"]);

  assert.throws(() => Conversation.createInteractionIntakePlan(config, JSON.stringify({
    collectFields: ["host_prompt"],
  }), { taskId: "photo-task", boardId: "canvas", skillId: config.id, sourceSignature: "a".repeat(64) }));
  assert.throws(() => Conversation.createInteractionIntakePlan(config, JSON.stringify({
    knownValues: { creative_direction: "not-a-declared-choice" },
  }), { taskId: "photo-task", boardId: "canvas", skillId: config.id, sourceSignature: "a".repeat(64) }));
});

test("完整且已填写的信息可以按 schema 产生零问题计划", () => {
  const config = Conversation.parseInteraction(JSON.parse(fs.readFileSync(path.resolve(app,
    "skill-packages/natural-aesthetic-product-photography/interaction.json"), "utf8")));
  const existing = {
    request: "给产品拍摄商品图",
    product_positioning: "白色透明手机壳",
    audience_usage: "面向商务人士",
    creative_direction: "recommend",
    size: "3:4",
    resolution: "1",
    brand_limits: "保留现有品牌标识和闭合结构",
  };
  const plan = Conversation.createInteractionIntakePlan(config, JSON.stringify({
    knownValues: {},
    collectFields: [],
    missingImageSteps: [],
  }), {
    taskId: "photo-task", boardId: "canvas", skillId: config.id,
    values: existing, userProvidedFieldIds: Object.keys(existing),
    sourceNodeIds: ["source-image"], completeImageStepIds: ["image"], sourceSignature: "b".repeat(64),
  });
  assert.equal(plan.requiresCollection, false);
  assert.deepEqual([...plan.fieldsToCollect], []);
  assert.deepEqual([...plan.imageStepsToCollect], []);
});

test("仅保留真实聊天入口的用户文字，进度卡和审计栏退出聊天主界面", () => {
  assert.match(ui, /const userEntry = options\.submission\?\.userInitiated/);
  assert.doesNotMatch(ui, /id="canvasAgentSkillActivity"|正在分析素材并策划方案/);
  assert.doesNotMatch(ui, /input\.value = message\.enteredPrompt|input\.value = state\.recoveryPrompt/);
  assert.doesNotMatch(ui, /querySelector\("#canvasAgentPrompt"\)\.value = \[/);
});

test("摄影方案使用原图绑定，并将界面提示留在确认工具参数之外", () => {
  const skillId = "natural-aesthetic-product-photography";
  const references = [{ role: "product", nodeId: "original" }];
  const readProposal = loadFunction("readCanvasAgentPhotoProposal", {
    NATURAL_PHOTO_SKILL_ID: skillId,
    bindCanvasAgentPhotoInventory: loadFunction("bindCanvasAgentPhotoInventory"),
    photoFidelity: {
      readBrief: JSON.parse,
      preparePresentation: (_brief, prompt) => prompt,
      preparePrompt: (_images, prompt) => ({ creative: prompt, shortened: true }),
    },
  });
  const proposal = readProposal({
    known_context: JSON.stringify({
      images: [{ nodeId: "provider-placeholder" }],
      visualFeatures: [{ nodeId: "provider-placeholder", observation: "透明边" }],
    }),
    image_prompt: "以柔侧光照亮透明壳边。",
    summary: "透明边摄影方案",
    unexpected: "模型额外字段",
  }, { photoSources: references, workflowSourceNodeIds: ["original"] });
  const { tool } = capabilityContext.CanvasAgentCapabilities.getCapabilityByToolName("request_design_brief");
  assert.ok(proposal.arguments, "只有合法工具字段可以发给确认工具");
  assert.deepEqual(Object.keys(proposal.arguments).sort(), Object.keys(tool.inputSchema.properties).sort());
  assert.equal(proposal.shortened, true);
  assert.equal(proposal.arguments.source_node_ids[0], "original");
  const brief = JSON.parse(proposal.arguments.known_context);
  assert.equal(brief.images[0].nodeId, "original");
  assert.equal(brief.visualFeatures[0].nodeId, "original");
});
