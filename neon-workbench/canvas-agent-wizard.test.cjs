const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Conversation = require("../host-sources/app/canvas-agent-conversation");
const moduleDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "aios-wizard-modules-"));
for (const name of ["canvas-agent-runtime.js", "canvas-agent-core.js", "canvas-agent-capabilities.js", "canvas-agent-skill-contract.js", "canvas-agent-conversation.js"]) {
  fs.copyFileSync(path.join(__dirname, "../host-sources/app", name), path.join(moduleDirectory, name));
}
fs.copyFileSync(path.join(__dirname, "design-sources/canvas-feature-registry.js"), path.join(moduleDirectory, "canvas-feature-registry.js"));
const Runtime = require(path.join(moduleDirectory, "canvas-agent-runtime.js"));
const { createCanvasAgentConversationStore } = require("../host-sources/app/canvas-agent-conversation-store");

test("向导字段与确认参数经实际会话存储恢复，旧客户端写入受修订号保护", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aios-wizard-store-"));
  const store = createCanvasAgentConversationStore({ filePath: path.join(directory, "conversations.json") });
  const initial = store.get("isolated-board");
  const generationSettings = {
    mode: "agent", automatic: false, type: "image", model: "available-model", size: "3:4", resolution: "2",
  };
  const draft = {
    taskId: "task-1", skillId: "sample-skill", boardId: "isolated-board",
    status: "collecting", step: 3, values: { product: "青绿色手机壳", audience: "城市通勤人群", channels: ["web", "social"] },
    sourceNodeIds: ["source-1"], parameters: {
      model: "available-model", size: "custom", width: "1024", height: "1536", resolution: "2",
    },
  };
  const saved = store.upsert({ ...initial, wizardDraft: draft, generationSettings });
  assert.equal(saved.revision, 1);
  assert.deepEqual(store.get("isolated-board").wizardDraft.values, draft.values);
  assert.equal(store.get("isolated-board").wizardDraft.step, 3);
  assert.deepEqual(store.get("isolated-board").wizardDraft.sourceNodeIds, ["source-1"]);
  assert.deepEqual(store.get("isolated-board").wizardDraft.parameters, draft.parameters);
  assert.deepEqual(store.get("isolated-board").generationSettings, generationSettings);
  assert.throws(() => store.upsert({ ...initial, wizardDraft: { ...draft, step: 0 } }), { code: "CONVERSATION_REVISION_CONFLICT" });
  const checkpoint = {
    workflow: "natural-aesthetic-product-photography", skillId: "natural-aesthetic-product-photography",
    boardId: "isolated-board", status: "confirmed", analysis: "产品事实",
    proposal: "草丘与天空", imagePrompt: "低位主体，天空留白，保留可见结构",
    sourceNodeIds: ["source-1"], sourceFingerprint: "a".repeat(64),
    parameters: { model: "available-model", size: "4:5", resolution: "1" },
  };
  const confirmed = store.upsert({ ...saved, pendingWorkflow: checkpoint });
  assert.deepEqual(confirmed.pendingWorkflow.parameters, checkpoint.parameters);
  const genericCheckpoint = {
    ...checkpoint, workflow: "skill", skillId: "sample-skill", workflowId: draft.taskId,
    imagePrompt: "", sourceNodeIds: [], sourceFingerprint: "",
  };
  const generic = store.upsert({ ...confirmed, pendingWorkflow: genericCheckpoint });
  assert.equal(generic.pendingWorkflow.skillId, "sample-skill");
  assert.equal(generic.pendingWorkflow.workflowId, draft.taskId);
  assert.equal(generic.pendingWorkflow.status, "confirmed");
  assert.equal(Conversation.normalize({
    ...generic, pendingWorkflow: { ...genericCheckpoint, workflow: "natural-aesthetic-product-photography" },
  }).pendingWorkflow, null, "摄影流程的原有素材与提示词校验保持有效");
  assert.equal(store.get("other-board").wizardDraft, undefined);
  assert.equal(Conversation.normalize({ wizardDraft: draft }, "other-board").wizardDraft, null);
});

test("确认的节点参数使用稳定工作流标识、最终提示词和素材引用", () => {
  const args = Conversation.buildWorkflowNodeArguments({
    workflowId: "task-1",
    title: "商品主视觉",
    prompt: "青绿色手机壳置于自然草丘上",
    sourceNodeIds: ["source-1"],
    parameters: { model: "image-model", size: "custom", width: "1024", height: "1536", resolution: "2" },
  });
  assert.deepEqual(args, {
    node_key: "workflow:task-1",
    title: "商品主视觉",
    prompt: "青绿色手机壳置于自然草丘上",
    model: "image-model",
    size: "1024x1536",
    resolution: "2",
    reference_node_ids: ["source-1"],
  });
});

test("通用图片向导确认会保存最终提示词、模型参数和原素材引用", () => {
  const pending = {
    workflow: "skill",
    workflowId: "task-1",
    skillId: "sample-skill",
    boardId: "isolated-board",
    status: "awaiting-confirmation",
    analysis: "产品结构与颜色已核对",
    proposal: "自然光下的产品广告",
    imagePrompt: "初始提示词",
    sourceNodeIds: ["source-1"],
    sourceFingerprint: "a".repeat(64),
    parameters: { model: "old-model", size: "1:1" },
  };
  const draft = {
    taskId: "task-1",
    skillId: "sample-skill",
    boardId: "isolated-board",
    status: "waiting-confirmation",
    sourceNodeIds: ["source-1"],
    parameters: {
      model: "selected-model",
      size: "custom",
      width: "1024",
      height: "1536",
      resolution: "2",
    },
  };
  const confirmed = Conversation.buildConfirmedWizardWorkflow({
    pending,
    draft,
    imagePrompt: "已编辑并确认的最终提示词",
    updatedAt: "2026-11-11T00:00:00.000Z",
    requiresImagePrompt: true,
  });

  assert.equal(confirmed.status, "confirmed");
  assert.equal(confirmed.workflowId, pending.workflowId);
  assert.equal(confirmed.imagePrompt, "已编辑并确认的最终提示词");
  assert.deepEqual(confirmed.parameters, draft.parameters);
  assert.deepEqual(confirmed.sourceNodeIds, pending.sourceNodeIds);
  assert.equal(confirmed.sourceFingerprint, pending.sourceFingerprint);
  assert.equal(confirmed.updatedAt, "2026-11-11T00:00:00.000Z");

  const autoGenerate = Conversation.buildConfirmedWizardWorkflow({
    pending,
    draft,
    imagePrompt: "已编辑并确认的最终提示词",
    requiresImagePrompt: true,
    executionChoice: "create_and_generate",
    allowsAutoGenerate: true,
  });
  assert.equal(autoGenerate.executionChoice, "create_and_generate");
  assert.equal(autoGenerate.generationState, "not-started");
  const autoVideo = Conversation.buildConfirmedWizardWorkflow({
    pending: { ...pending, imagePrompt: "", executionTarget: "video" },
    draft: { ...draft, parameters: { model: "video-model", size: "9:16", resolution: "720p" } },
    requiresImagePrompt: false,
    executionChoice: "create_and_generate",
    allowsAutoGenerate: true,
  });
  assert.equal(Conversation.normalize({ boardId: "isolated-board", pendingWorkflow: autoVideo }, "isolated-board")
    .pendingWorkflow.executionTarget, "video");
  assert.equal(autoVideo.executionChoice, "create_and_generate");
  assert.throws(() => Conversation.buildConfirmedWizardWorkflow({
    pending, draft, imagePrompt: "最终提示词", requiresImagePrompt: false,
    executionChoice: "create_and_generate",
  }), /当前流程不支持自动生成/);
});

test("确认卡执行选项与生成状态可安全恢复且默认保持手动", () => {
  assert.deepEqual(Conversation.normalizeGenerationSettings({
    mode: "video", type: "image", automatic: true,
  }), {
    mode: "video", automatic: true, type: "video", model: "", size: "auto", resolution: "",
  });
  const pending = {
    workflow: "skill", workflowId: "task-1", skillId: "sample-skill", boardId: "isolated-board",
    status: "awaiting-confirmation", analysis: "已核对", proposal: "方案摘要",
    imagePrompt: "图片提示词", sourceNodeIds: [], sourceFingerprint: "",
  };
  const restored = Conversation.normalize({
    boardId: "isolated-board",
    pendingWorkflow: {
      ...pending, status: "generation-pending", executionChoice: "create_and_generate",
      generationState: "failed", outputNodeId: "node-1",
      generationError: "上游暂时不可用",
    },
  }, "isolated-board");
  assert.equal(restored.pendingWorkflow.executionChoice, "create_and_generate");
  assert.equal(restored.pendingWorkflow.generationState, "failed");
  assert.equal(restored.pendingWorkflow.outputNodeId, "node-1");
  assert.equal(restored.pendingWorkflow.generationError, "上游暂时不可用");
  assert.deepEqual(restored.generationSettings, {
    mode: "agent", automatic: true, type: "image", model: "", size: "auto", resolution: "",
  });
});

test("通用图片向导确认拒绝错配任务、素材及缺失的执行参数", () => {
  const pending = {
    workflow: "skill",
    workflowId: "task-1",
    skillId: "sample-skill",
    boardId: "isolated-board",
    status: "awaiting-confirmation",
    analysis: "产品结构与颜色已核对",
    proposal: "自然光下的产品广告",
    imagePrompt: "初始提示词",
    sourceNodeIds: ["source-1"],
    sourceFingerprint: "a".repeat(64),
  };
  const draft = {
    taskId: "task-1",
    skillId: "sample-skill",
    boardId: "isolated-board",
    status: "waiting-confirmation",
    sourceNodeIds: ["source-1"],
    parameters: { model: "selected-model", size: "3:4", resolution: "1" },
  };
  const confirm = overrides => Conversation.buildConfirmedWizardWorkflow({
    pending,
    draft,
    imagePrompt: "可执行的最终提示词",
    requiresImagePrompt: true,
    ...overrides,
  });

  assert.throws(() => confirm({ draft: { ...draft, taskId: "other-task" } }), /任务或 Skill/);
  assert.throws(() => confirm({ draft: { ...draft, sourceNodeIds: ["other-source"] } }), /素材/);
  assert.throws(() => confirm({ imagePrompt: "  " }), /提示词/);
  assert.throws(() => confirm({ draft: { ...draft, parameters: { size: "3:4" } } }), /模型或画幅/);
  assert.throws(() => confirm({
    draft: { ...draft, parameters: { model: "selected-model", size: "custom", width: "1024" } },
  }), /自定义尺寸/);
});

test("Schema 单选多选、默认值、AI 建议与条件步骤共用同一套规则", () => {
  const config = Conversation.parseInteraction({
    version: 1, title: "通用验收",
    execution: { target: "image", instructions: "创建一个未执行的图片节点" },
    steps: [
      { id: "brief", title: "需求", fields: [
        { id: "name", type: "text", label: "名称", prefill: "prompt", required: true, min_length: 2 },
        { id: "channels", type: "choice", label: "渠道", multiple: true, default: ["web"], min_items: 1, max_items: 2,
          options: [{ value: "web", label: "官网" }, { value: "social", label: "社交" }, { value: "poster", label: "海报" }] },
        { id: "copy", type: "choice", label: "文案", default: "no",
          options: [{ value: "yes", label: "需要" }, { value: "no", label: "不需要" }] },
        { id: "copy_text", type: "textarea", label: "准确文案", visible_when: { field: "copy", equals: "yes" },
          required: { field: "copy", equals: "yes" }, max_length: 20 },
        { id: "audience", type: "text", label: "受众", prefill: "ai" },
      ] },
      { id: "social", title: "社交补充", visible_when: { field: "channels", includes: "social" }, fields: [
        { id: "social_notes", type: "text", label: "社交要求", required: true },
      ] },
      { id: "proposal", kind: "proposal", title: "检查方案" },
    ],
  });
  assert.ok(config, "合法的可选配置能够加载");
  const values = Conversation.prefillInteraction(config, "手机壳");
  assert.deepEqual(values.channels, ["web"]);
  assert.equal(values.copy, "no");
  assert.equal(values.name, "手机壳");
  assert.deepEqual(Conversation.getInteractionSteps(config, values).map(step => step.id), ["brief", "proposal"]);
  assert.equal(Conversation.validateInteractionStep(config.steps[0], values), "");
  assert.match(Conversation.validateInteractionStep(config.steps[0], { ...values, copy: "yes" }), /准确文案/);
  assert.match(Conversation.validateInteractionStep(config.steps[0], { ...values, channels: ["web", "social", "poster"] }), /渠道/);
  assert.match(Conversation.validateInteractionStep(config.steps[0], { ...values, channels: ["unknown"] }), /渠道/);
  assert.match(Conversation.validateInteractionStep(config.steps[0], { ...values, name: "  " }), /名称/);
  assert.deepEqual(Conversation.getInteractionSteps(config, { ...values, channels: ["social"] }).map(step => step.id), ["brief", "social", "proposal"]);
  const ai = Conversation.prefillInteraction(config, "", { audience: "城市通勤人群", name: "模型不应覆盖手填名称" }, values);
  assert.equal(ai.audience, "城市通勤人群");
  assert.equal(ai.name, values.name);
  assert.equal(Conversation.getInteractionValueLabel(config.steps[0].fields[1], ["web", "social"]), "官网、社交");
  assert.equal(Conversation.parseInteraction({ ...config, steps: [config.steps[0], { ...config.steps[0], id: "duplicate-fields" }, config.steps[2]] }), null);
  assert.equal(Conversation.parseInteraction({ ...config, steps: [{ ...config.steps[0], visible_when: { field: "missing", equals: "yes" } }, config.steps[2]] }), null);
  assert.equal(Conversation.parseInteraction({ ...config, execution: { target: "shell" } }), null);
});

test("Schema 支持显隐元信息、模型尺寸能力与受限数值输入", () => {
  const config = Conversation.parseInteraction({
    version: 1,
    steps: [
      { id: "output", title: "画面尺寸与比例", fields: [
        { id: "size", type: "choice", label: "画面比例", capability: "image_output_size", options: [
          { value: "3:4", label: "3:4" }, { value: "custom", label: "自定义" },
        ] },
        { id: "width", type: "number", label: "宽度", min: 64, max: 3840, step: 16,
          visible_when: { field: "size", equals: "custom" }, required: true },
        { id: "height", type: "number", label: "高度", min: 64, max: 3840, step: 16,
          visible_when: { field: "size", equals: "custom" }, required: true },
        { id: "resolution", type: "choice", label: "分辨率", capability: "image_resolution", options: [
          { value: "1", label: "标准" }, { value: "2", label: "高" },
        ] },
      ] },
      { id: "proposal", kind: "proposal", title: "确认方案" },
    ],
  });
  assert.ok(config, "新字段类型与能力字段应可解析");
  assert.equal(config.steps[0].fields[0].capability, "image_output_size");
  assert.equal(Conversation.validateInteractionStep(config.steps[0], { size: "custom", width: "1024", height: "1536" }), "");
  assert.match(Conversation.validateInteractionStep(config.steps[0], { size: "custom", width: "1024", height: "bad" }), /高度/);
  assert.match(Conversation.validateInteractionStep(config.steps[0], { size: "custom", width: "33", height: "1536" }), /宽度/);
  assert.equal(Conversation.parseInteraction({
    ...config,
    steps: [{ ...config.steps[0], fields: [{ id: "width", type: "number", label: "宽度", min: 1, max: 0 }] }, config.steps[1]],
  }), null, "数值范围颠倒的字段应被拒绝");
  assert.equal(Conversation.parseInteraction({
    ...config,
    steps: [{ ...config.steps[0], fields: [{ id: "size", type: "choice", label: "尺寸", capability: "arbitrary", options: [] }] }, config.steps[1]],
  }), null, "未注册的能力标识应被拒绝");
});

test("普通 Skill 保持原工具权限，可选交互文件只增加展示配置", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aios-wizard-catalog-"));
  for (const name of ["plain-skill", "wizard-skill", "invalid-skill"]) {
    fs.mkdirSync(path.join(directory, name));
    fs.writeFileSync(path.join(directory, name, "SKILL.md"), `---\nname: ${name}\ndescription: isolated test\nallowed-tools: read_skill_reference\n---\n# 隔离验收\n`);
  }
  fs.writeFileSync(path.join(directory, "wizard-skill", "interaction.json"), JSON.stringify({
    version: 1, steps: [
      { id: "brief", title: "创作要求", fields: [{ id: "request", type: "text", label: "要求" }] },
      { id: "proposal", kind: "proposal", title: "确认" },
    ],
  }));
  fs.writeFileSync(path.join(directory, "invalid-skill", "interaction.json"), "{ invalid");
  const catalog = Runtime.loadCanvasSkillCatalog([{ directory, origin: "custom" }]);
  const plain = catalog.all.find(skill => skill.id === "plain-skill");
  const wizard = catalog.all.find(skill => skill.id === "wizard-skill");
  const invalid = catalog.all.find(skill => skill.id === "invalid-skill");
  assert.equal(plain.metadata.canvas_agent_wizard, undefined);
  assert.equal(JSON.parse(wizard.metadata.canvas_agent_wizard).steps[0].id, "brief");
  assert.equal(invalid.metadata.canvas_agent_wizard, undefined);
  assert.deepEqual(plain.allowedTools, ["read_skill_reference"]);
  assert.equal(plain.allowedToolsDeclared, true);
  assert.deepEqual(wizard.allowedTools, plain.allowedTools);
  assert.equal(wizard.allowedToolsDeclared, plain.allowedToolsDeclared);
  fs.mkdirSync(path.join(moduleDirectory, "skill-interactions"));
  fs.writeFileSync(path.join(moduleDirectory, "skill-interactions/plain-skill.json"), JSON.stringify({
    version: 1, steps: [{ id: "request", title: "需求" }, { id: "proposal", kind: "proposal", title: "确认" }],
  }));
  const refreshed = Runtime.loadCanvasSkillCatalog([{ directory, origin: "custom" }]);
  assert.equal(JSON.parse(refreshed.all.find(skill => skill.id === "plain-skill").metadata.canvas_agent_wizard).steps.length, 2);
  assert.equal(fs.existsSync(path.join(directory, "plain-skill", "interaction.json")), false, "应用随附表单配置无需修改用户安装目录");
});

test("自然美学 Skill 将图片素材和尺寸参数配置交给通用 Schema", () => {
  const configPath = path.join(__dirname, "../host-sources/app/skill-packages/natural-aesthetic-product-photography/interaction.json");
  const config = Conversation.parseInteraction(fs.readFileSync(configPath, "utf8"));
  assert.ok(config);
  assert.equal(config.title, "产品视觉大片信息收集");
  assert.equal(config.show_cancel, false);
  const collectionSteps = config.steps.filter(step => step.kind !== "proposal");
  assert.deepEqual(collectionSteps.map(step => step.id), ["product", "image", "audience", "creative", "output", "brand"]);
  assert.deepEqual(collectionSteps.map(step => step.title), [
    "产品主体与材质",
    "产品参考图",
    "目标受众与用途",
    "摄影视觉方向",
    "画幅比例",
    "实物标识与保真要求",
  ]);
  const productField = collectionSteps[0].fields[0];
  assert.equal(productField.type, "textarea");
  assert.equal(productField.show_label, false);
  assert.match(productField.example, /^一瓶透明玻璃香水/);
  assert.equal(productField.placeholder, "例如：一瓶透明玻璃香水，琥珀色液体、银色金属盖；或一只哑光黑色无线耳机充电盒。");
  assert.deepEqual(collectionSteps[1].sources, ["canvas", "upload"]);
  assert.equal(collectionSteps[1].required, true);
  assert.equal(collectionSteps[2].fields[0].type, "text");
  assert.equal(collectionSteps[3].fields[0].default, "recommend");
  assert.equal(collectionSteps[3].fields[0].layout, "vertical");
  assert.deepEqual(collectionSteps[3].fields[0].options.map(option => option.value), ["recommend", "custom"]);
  assert.deepEqual(Conversation.getInteractionFields(collectionSteps[3], { creative_direction: "custom" }).map(field => field.id),
    ["creative_direction", "custom_photo_direction"]);
  assert.equal(collectionSteps[4].fields[0].default, "3:4");
  assert.deepEqual(collectionSteps[4].fields[0].options.map(option => option.value), ["3:4", "9:16", "16:9", "custom"]);
  assert.equal(collectionSteps[4].fields[0].capability, "image_output_size");
  assert.equal(collectionSteps[4].fields.find(field => field.id === "resolution").capability, "image_resolution");
  assert.equal(collectionSteps[5].skip_label, "跳过，交给 AI");
  assert.equal(collectionSteps[5].submit_label, "提交创作信息");
  assert.equal(config.steps.at(-1).kind, "proposal");
  const defaults = Conversation.prefillInteraction(config, "");
  assert.equal(defaults.creative_direction, "recommend");
  assert.equal(defaults.size, "3:4");
  assert.equal(Conversation.parseInteraction({ ...config, show_cancel: "false" }), null,
    "global button visibility stays boolean in the shared schema");
  const invalidSkip = structuredClone(config);
  invalidSkip.steps[1].skip_label = "跳过".repeat(50);
  assert.equal(Conversation.parseInteraction(invalidSkip), null, "schema skip labels stay bounded");
  const invalidLayout = structuredClone(config);
  invalidLayout.steps[3].fields[0].layout = "floating";
  assert.equal(Conversation.parseInteraction(invalidLayout), null, "choice layouts use registered values");
});
