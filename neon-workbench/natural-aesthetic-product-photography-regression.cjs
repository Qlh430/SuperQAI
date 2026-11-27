"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const vm = require("node:vm");
const { test } = require("node:test");

const featureRegistry = path.resolve(__dirname, "design-sources/canvas-feature-registry.js");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function resolveCanvasFeature(request, parent, ...rest) {
  if (request === "./canvas-feature-registry.js" && parent?.filename?.includes("host-sources\\app")) {
    return featureRegistry;
  }
  return originalResolve.call(this, request, parent, ...rest);
};

const Runtime = require("../host-sources/app/canvas-agent-runtime");
const Capabilities = require("../host-sources/app/canvas-agent-capabilities");
const SkillContract = require("../host-sources/app/canvas-agent-skill-contract");
const Conversation = require("../host-sources/app/canvas-agent-conversation");
const { createSkillRegistry } = require("../host-sources/app/skill-registry");
const { createSkillImportManager } = require("../host-sources/app/skill-import-manager");

const skillRoot = path.resolve(__dirname, "../host-sources/app/skill-packages/natural-aesthetic-product-photography");
const referenceFiles = [
  "references/case-library.md",
  "references/photography-methods.md",
  "references/source-notes.md",
  "references/visual-index.md",
  ...["NA-01", "NA-02", "NA-03", "NA-04", "NA-05", "NA-06", "NA-07"]
    .map((id) => `references/cases/${id}.md`),
];
const requiredPlanningReads = ["references/case-library.md"];

function collectPackageFiles(directory, prefix = "") {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectPackageFiles(absolute, relative);
    return [{ path: relative, content: fs.readFileSync(absolute) }];
  });
}

function tempFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aios-natural-photo-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dataDir = path.join(root, "data");
  const systemDir = path.join(root, "system");
  const registry = createSkillRegistry({ dataDir, systemDir });
  const manager = createSkillImportManager({
    registry,
    dataDir,
    fetchImpl: async () => { throw new Error("Unexpected network request in isolated Skill test."); },
    validateRemoteUrl: async (url) => new URL(url),
    tokenFactory: () => crypto.randomBytes(24).toString("hex"),
  });
  return { root, dataDir, registry, manager };
}

function encodeFile(file) {
  return { path: file.path, content: file.content.toString("base64") };
}

function validPendingWorkflow(overrides = {}) {
  return {
    workflow: "natural-aesthetic-product-photography",
    skillId: "natural-aesthetic-product-photography",
    boardId: "board-a",
    status: "awaiting-confirmation",
    analysis: "可见为透明磨砂玻璃瓶；液体颜色与瓶身标签可辨。",
    proposal: "采用柔和透射侧光，保留标签和瓶型，避免改变品牌标识。",
    imagePrompt: "真实商品摄影，保留玻璃瓶的原始比例、磨砂质感、液体颜色与标签。",
    sourceNodeIds: ["product-image-1"],
    sourceFingerprint: "a".repeat(64),
    workflowId: "proposal-123",
    questions: [{ id: "ratio", label: "画幅", kind: "single", options: ["1:1", "4:3"], required: true, recommended: "1:1" }],
    updatedAt: "2026-11-09T00:00:00.000Z",
    ...overrides,
  };
}

test("the Skill package has an executable contract and traceable original planning cases", () => {
  const files = collectPackageFiles(skillRoot);
  const paths = files.map((file) => file.path).sort();
  assert.deepEqual(paths, ["SKILL.md", "agent.skill.json", "interaction.json", ...referenceFiles].sort());
  const markdown = fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");
  const skill = Runtime.parseSkillDocument(markdown);
  assert.equal(skill.id, "natural-aesthetic-product-photography");
  assert.match(skill.description, /^Use when /);
  assert.equal(skill.canvas.required_selection, "image");
  assert.equal(skill.canvas.category, "image");
  assert.ok(skill.canvas.tools.includes("request_design_brief"));
  assert.ok(skill.canvas.tools.includes("create_image_node"));

  const catalog = Runtime.loadCanvasSkillCatalog([{ directory: path.dirname(skillRoot), origin: "custom" }]);
  const loaded = catalog.business.find((item) => item.id === skill.id);
  assert.ok(loaded);
  assert.deepEqual(loaded.references.map((item) => item.path).sort(), referenceFiles.slice().sort());
  assert.equal(loaded.execution.mode, "guided");
  assert.equal(loaded.execution.exposure, "manual");
  assert.ok(loaded.execution.stages.some((stage) => stage.id === "planning"));
  assert.ok(loaded.execution.stages.some((stage) => stage.id === "confirmed-execution"));

  const cases = fs.readFileSync(path.join(skillRoot, "references/case-library.md"), "utf8");
  for (const id of ["NA-01", "NA-02", "NA-03", "NA-04"]) assert.ok(cases.includes(id));
  assert.ok(cases.length < 3_500, "the initial case index stays small enough for first-pass retrieval");
  assert.doesNotMatch(cases, /^## NA-\d{2} /m, "full case records are stored separately from the index");
  assert.match(cases, /原创策划方法/);
  const originalCase = fs.readFileSync(path.join(skillRoot, "references/cases/NA-05.md"), "utf8");
  assert.match(originalCase, /不是真实拍摄/);
  assert.match(originalCase, /只有手机壳时保持空壳.*手机已经装入壳体时保留手机、壳体、包覆关系/);
  assert.match(skill.instructions, /逐图产品保真清单/);
  assert.ok(!files.some((file) => /\.(?:png|jpe?g|webp|mp4)$/i.test(file.path)), "the package must not imply fabricated portfolio media");
  const manifest = JSON.parse(fs.readFileSync(path.join(skillRoot, "agent.skill.json"), "utf8"));
  assert.deepEqual(manifest.stages.find((stage) => stage.id === "planning").mustRead, requiredPlanningReads);
});

test("the bundled photography interaction overrides only that Skill while retaining the installed Skill files", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "aios-natural-photo-installed-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const skillDirectory = path.join(directory, "natural-aesthetic-product-photography");
  fs.mkdirSync(skillDirectory);
  fs.copyFileSync(path.join(skillRoot, "SKILL.md"), path.join(skillDirectory, "SKILL.md"));
  const installedInteraction = {
    version: 1,
    title: "用户已安装的旧表单",
    steps: [
      { id: "request", title: "旧输入", fields: [{ id: "request", type: "text", label: "旧字段" }] },
      { id: "proposal", kind: "proposal", title: "旧确认" },
    ],
  };
  const installedInteractionPath = path.join(skillDirectory, "interaction.json");
  fs.writeFileSync(installedInteractionPath, JSON.stringify(installedInteraction));

  const catalog = Runtime.loadCanvasSkillCatalog([{ directory, origin: "custom" }]);
  const loaded = catalog.business.find(skill => skill.id === "natural-aesthetic-product-photography");
  const activeInteraction = JSON.parse(loaded.metadata.canvas_agent_wizard);
  assert.equal(activeInteraction.title, "产品视觉大片信息收集");
  assert.equal(activeInteraction.steps.filter(step => step.kind !== "proposal").length, 6);
  assert.deepEqual(JSON.parse(fs.readFileSync(installedInteractionPath, "utf8")), installedInteraction,
    "the installed user Skill file remains intact");
});

test("case records expose matching, composition, transfer and provenance fields through the reference API", (t) => {
  const fixture = tempFixture(t);
  const id = "natural-aesthetic-product-photography";
  fixture.registry.installPersonalSkill("isolated-user-a", id, collectPackageFiles(skillRoot), { source: "isolated" });
  const index = fixture.registry.readReference(id, "references/case-library.md", "isolated-user-a").content;
  assert.match(index, /NA-05/);
  assert.ok(!index.includes("来源与授权 AI OS 原创"), "the index does not load full provenance records");
  const fields = [
    "创意主题", "适用产品", "材质线索", "使用场景", "风格标签", "目标受众",
    "构图与留白", "光线与色彩", "场景与层次", "可迁移方法", "保真重点", "不适用与风险", "来源与授权",
  ];
  for (const caseId of ["NA-01", "NA-05", "NA-06"]) {
    const content = fixture.registry.readReference(
      id,
      `references/cases/${caseId}.md`,
      "isolated-user-a",
    ).content;
    for (const field of fields) {
      assert.match(content, new RegExp(`^- ${field} .+`, "m"), `${caseId} requires ${field}`);
    }
    assert.match(content, /来源与授权 .*AI OS 原创/);
  }
  const hill = fixture.registry.readReference(id, "references/cases/NA-05.md", "isolated-user-a").content;
  assert.match(hill, /低位主体/);
  assert.match(hill, /天空.*留白/);
  assert.match(hill, /前景.*中景.*远景/);
  assert.match(hill, /黄金时段/);
  assert.match(hill, /RunningHub.*未核实/);
});

test("existing personal importer keeps the package private and does not write before confirmation", async (t) => {
  const fixture = tempFixture(t);
  const preview = await fixture.manager.preview("isolated-user-a", {
    files: collectPackageFiles(skillRoot).map(encodeFile),
    source: { type: "upload", label: "自然美学产品摄影 Skill" },
  });
  assert.equal(preview.id, "natural-aesthetic-product-photography");
  assert.equal(fs.existsSync(path.join(fixture.dataDir, "users")), false);
  assert.equal(preview.compatibility.status, "可直接使用");
  const installed = await fixture.manager.confirm("isolated-user-a", preview.previewToken);
  assert.equal(installed.id, preview.id);
  assert.ok(fixture.registry.loadAgentCatalog("isolated-user-a").business.some((item) => item.id === preview.id));
  assert.ok(!fixture.registry.loadAgentCatalog("isolated-user-b").business.some((item) => item.id === preview.id));
  const references = fixture.registry.loadAgentCatalog("isolated-user-a").business.find((item) => item.id === preview.id).references;
  assert.deepEqual(references.map((item) => item.path).sort(), referenceFiles.slice().sort());
});

test("photography guidance reaches Agent requests and existing installs reload content without reinstalling", (t) => {
  const fixture = tempFixture(t);
  const id = "natural-aesthetic-product-photography";
  fixture.registry.installPersonalSkill("isolated-user-a", id, collectPackageFiles(skillRoot), { source: "isolated" });
  const before = fixture.registry.loadAgentCatalog("isolated-user-a").business.find((item) => item.id === id);
  assert.ok(before.instructions.includes("保留产品，而不是保留原始照片"));
  const priorities = ["第一层", "第二层", "第三层", "第四层"].map((label) => before.instructions.indexOf(label));
  assert.ok(priorities[0] >= 0 && priorities.every((position, index) => index === 0 || position > priorities[index - 1]),
    "the model receives ordered product, creative, photography and quality priorities");
  assert.match(before.instructions, /首轮.*索引/);
  assert.match(before.instructions, /方向选定后.*完整提示词/);
  assert.doesNotMatch(before.execution.stages.find((stage) => stage.id === "planning").mustRead.join(" "), /photography-methods/);
  const contractBefore = fs.readFileSync(path.join(before.directory, "agent.skill.json"));
  fs.appendFileSync(path.join(before.directory, "SKILL.md"), "\n隔离热加载标记，保持方案确认后只建节点。\n");
  fs.appendFileSync(path.join(before.directory, "references/photography-methods.md"), "\n隔离摄影参考热加载标记。\n");
  const after = fixture.registry.loadAgentCatalog("isolated-user-a").business.find((item) => item.id === id);
  const core = Runtime.parseSkillDocument(fs.readFileSync(
    path.resolve(__dirname, "../host-sources/app/skills/canvas-agent-core/SKILL.md"), "utf8"));
  const request = Runtime.buildChatCompletionsRequest({
    skill_mode: "manual", skill_id: id, prompt: "产品摄影策划", canvas: { nodes: [], connections: [] },
  }, { skills: { core, business: [after] } });
  assert.ok(request.messages[0].content.includes("隔离热加载标记"));
  assert.ok(request.messages[0].content.includes("保留产品，而不是保留原始照片"));
  assert.ok(fixture.registry.readReference(id, "references/photography-methods.md", "isolated-user-a")
    .content.includes("隔离摄影参考热加载标记"));
  assert.deepEqual(after.install, before.install, "content reload preserves installation metadata");
  assert.deepEqual(after.execution, before.execution, "content reload preserves execution permissions");
  assert.deepEqual(fs.readFileSync(path.join(after.directory, "agent.skill.json")), contractBefore);
  assert.ok(!fixture.registry.loadAgentCatalog("isolated-user-b").business.some((item) => item.id === id));
});

test("design brief capability keeps poster compatibility and supports configured Skill workflows", () => {
  const capability = Capabilities.getCapabilityByToolName("request_design_brief");
  assert.ok(capability);
  const workflow = capability.tool.inputSchema.properties.workflow.enum;
  assert.deepEqual(workflow, ["poster", "natural-aesthetic-product-photography", "skill"]);
  assert.ok(capability.tool.inputSchema.properties.source_node_ids);
  assert.deepEqual(
    capability.tool.inputSchema.properties.poster_type.enum,
    ["product", "brand", "promotion", "festival", "event", "other", null],
  );
});

test("manually selected planning skill receives the confirmation tool for node-only requests", () => {
  const core = Runtime.parseSkillDocument(
    fs.readFileSync(path.resolve(__dirname, "../host-sources/app/skills/canvas-agent-core/SKILL.md"), "utf8"),
  );
  const skill = Runtime.loadCanvasSkillCatalog([{ directory: path.dirname(skillRoot), origin: "custom" }])
    .business.find((item) => item.id === "natural-aesthetic-product-photography");
  const payload = {
    skill_mode: "manual",
    skill_id: skill.id,
    prompt: "请依据当前已选择的 Skill 执行工作流。仅搭建所需节点、连接、提示词与参数，不执行任何付费图片生成。",
    step: 0,
    canvas: { nodes: [], connections: [] },
  };
  const request = Runtime.buildChatCompletionsRequest(payload, { skills: { core, business: [skill] } });
  const names = request.tools.map((tool) => tool.function.name);
  assert.ok(names.includes("request_design_brief"), "the selected Skill must be able to request confirmation");
  assert.ok(names.includes("read_skill_reference"), "the selected Skill must be able to read its knowledge");
  assert.ok(!names.includes("run_canvas_node"), "the Skill must not gain paid execution");
  const confirmedRequest = Runtime.buildChatCompletionsRequest({
    ...payload,
    prompt: "用户已确认策划。仅创建一个尚未执行的图片节点。\n自然美学产品摄影，保留产品外观。",
  }, { skills: { core, business: [skill] } });
  assert.match(confirmedRequest.messages[0].content, /当前阶段：用户确认后的节点创建（confirmed-execution）/);
  const confirmedTools = confirmedRequest.tools.map((tool) => tool.function.name);
  assert.ok(confirmedTools.includes("create_image_node"), "the confirmed request exposes node creation");
  assert.ok(!confirmedTools.includes("run_canvas_node"), "confirmation does not grant paid execution");
});

test("confirmed photography prompts keep the execution-stage create-image permission", () => {
  const skill = Runtime.loadCanvasSkillCatalog([{ directory: path.dirname(skillRoot), origin: "custom" }])
    .business.find((item) => item.id === "natural-aesthetic-product-photography");
  const planningContract = SkillContract.createContract(skill, {
    manualActivated: true,
    prompt: "请完成产品摄影策划并提交确认方案。",
  });
  assert.equal(planningContract.stage, "planning");
  assert.equal(
    SkillContract.inspectToolCall(planningContract, { name: "create_image_node" }).violation.code,
    "skill_tool_not_allowed",
  );
  const contract = SkillContract.createContract(skill, {
    manualActivated: true,
    prompt: [
      "用户已确认策划。仅创建一个可编辑、尚未执行的图片生成节点。",
      "已确认的完整生图提示词：自然美学产品摄影，保留产品轮廓、标签和材质。",
    ].join("\n"),
  });
  assert.equal(contract.stage, "confirmed-execution");
  assert.equal(SkillContract.inspectToolCall(contract, {
    name: "create_image_node",
    arguments: { prompt: "自然美学产品摄影" },
  }).violation, null);
  const restrictedSkill = structuredClone(skill);
  restrictedSkill.execution.stages.find((stage) => stage.id === "confirmed-execution").tools = ["read_skill_reference"];
  assert.equal(SkillContract.inspectToolCall(SkillContract.createContract(restrictedSkill, {
    prompt: "用户已确认策划。仅创建图片节点。\n自然美学产品摄影",
  }), { name: "create_image_node" }).violation.code, "skill_tool_not_allowed",
  "confirmation preserves an explicit prohibition in the execution stage");
  const otherSkill = { ...skill, id: "other-photography-skill" };
  assert.equal(SkillContract.classifySkillStage(otherSkill,
    "用户已确认策划。\n自然美学产品摄影"), "planning",
  "other Skills retain their configured stage matching");
});

test("natural photography failures distinguish permission, connection, and save errors", () => {
  const ui = fs.readFileSync(path.resolve(__dirname, "../host-sources/app/canvas-agent-ui.js"), "utf8");
  const helpers = ui.slice(ui.indexOf("  function getNaturalPhotographyCreationFailureMessage("),
    ui.indexOf("  async function executeCanvasAgentTerminalToolRun("));
  const { message, status } = vm.runInNewContext(`${helpers}
    ({ message: getNaturalPhotographyCreationFailureMessage, status: getNaturalPhotographyFailureStatus })`);
  for (const [code, expected] of [
    ["skill_tool_not_allowed", "权限拒绝"],
    ["workflow_tool_not_allowed", "权限拒绝"],
    ["reference_connection_failed", "源图片连接失败"],
    ["canvas_save_failed", "画布保存失败"],
    ["tool_failed", "节点创建失败"],
  ]) {
    assert.ok(message({ code, error: "具体原因" }).includes(expected), code);
    assert.ok(status({ code }).includes(expected), code);
    assert.match(message({ code, error: "具体原因" }), /具体原因.*方案和素材已保留，可以重试/);
    if (code !== "canvas_save_failed") assert.doesNotMatch(message({ code }), /保存失败/);
  }
});

test("pending workflow checkpoints are board-scoped, bounded, and contain no media or unknown fields", () => {
  const absent = Conversation.normalize({ boardId: "board-a", items: [] }, "board-a");
  assert.equal(absent.pendingWorkflow, null);

  const valid = Conversation.normalize({
    boardId: "board-a",
    items: [],
    pendingWorkflow: validPendingWorkflow({ privateExtra: "discard this" }),
  }, "board-a");
  assert.equal(valid.pendingWorkflow.status, "awaiting-confirmation");
  assert.equal(valid.pendingWorkflow.imagePrompt, "真实商品摄影，保留玻璃瓶的原始比例、磨砂质感、液体颜色与标签。");
  assert.deepEqual(valid.pendingWorkflow.sourceNodeIds, ["product-image-1"]);
  assert.equal(valid.pendingWorkflow.workflowId, "proposal-123");
  assert.deepEqual(valid.pendingWorkflow.questions, validPendingWorkflow().questions);
  assert.equal(Object.hasOwn(valid.pendingWorkflow, "privateExtra"), false);
  assert.equal(Conversation.normalize(valid, "board-b").pendingWorkflow, null);

  const serialized = JSON.stringify(valid);
  assert.doesNotMatch(serialized, /data:image|https?:\/\//i);
  assert.equal(Conversation.normalize({
    boardId: "board-a",
    pendingWorkflow: validPendingWorkflow({ sourceFingerprint: "short" }),
  }, "board-a").pendingWorkflow, null);
  assert.equal(Conversation.normalize({
    boardId: "board-a",
    pendingWorkflow: validPendingWorkflow({ proposal: "x".repeat(20_001) }),
  }, "board-a").pendingWorkflow, null);
  assert.equal(Conversation.normalize({
    boardId: "board-a",
    pendingWorkflow: validPendingWorkflow({ sourceNodeIds: Array.from({ length: 9 }, (_, index) => `image-${index}`) }),
  }, "board-a").pendingWorkflow, null);
});
