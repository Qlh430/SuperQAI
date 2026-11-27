"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const test = require("node:test");
const { EventEmitter } = require("node:events");

const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveCanvasFeature(request, parent, ...args) {
  if (request === "./canvas-feature-registry.js" && parent?.filename.startsWith(path.resolve(__dirname, "../host-sources/app") + path.sep)) {
    return path.resolve(__dirname, "design-sources/canvas-feature-registry.js");
  }
  return resolveFilename.call(this, request, parent, ...args);
};
const CanvasAgentCore = require("../host-sources/app/canvas-agent-core");
const CanvasAgentRuntime = require("../host-sources/app/canvas-agent-runtime");
const CanvasAgentCapabilities = require("../host-sources/app/canvas-agent-capabilities");
const { createBroker } = require("../host-sources/app/canvas-agent-broker");
const { createCanvasMcpSession } = require("../host-sources/app/canvas-agent-mcp-server");
const { create: createToolAdapters } = require("../host-sources/app/canvas-agent-tool-adapters");
const { createCanvasAgentHttpApi } = require("../host-sources/app/canvas-agent-http-api");
const CanvasAgentConversation = require("../host-sources/app/canvas-agent-conversation");
Module._resolveFilename = resolveFilename;

const photoId = "natural-aesthetic-product-photography";

test("画布只读查找只允许查询，明确的后续修改仍能调用写工具", () => {
  const skills = CanvasAgentRuntime.loadCanvasSkills(path.join(__dirname, "../host-sources/app/skills"));
  const names = prompt => CanvasAgentRuntime.buildProviderTurnRequest({ prompt }, { skills }).tools.map(tool => tool.function.name);
  assert.deepEqual(names("列出当前画布的图片节点"), ["query_canvas_nodes"]);
  assert.deepEqual(names("只查看画布节点的历史版本"), ["query_canvas_nodes"]);
  assert.deepEqual(names("当前选择了哪些节点"), ["query_canvas_nodes"]);
  assert.ok(names("查看并定位当前节点").includes("focus_canvas_nodes"));
  assert.ok(names("请绑定图片节点历史版本为参考").includes("bind_canvas_image_history"));
  const write = names("找出名称为封面的画布节点，然后修改节点名称");
  assert.ok(write.includes("query_canvas_nodes"));
  assert.ok(write.includes("update_node"));
});

test("抠图意图提供本地抠图工具，图片分析和教程保持只读", () => {
  const skills = CanvasAgentRuntime.loadCanvasSkills(path.join(__dirname, "../host-sources/app/skills"));
  const canvas = { selected_node_ids: ["image-a"], nodes: [{ id: "image-a", kind: "image", has_image: true }] };
  const vision_images = ["data:image/png;base64,AA=="];
  for (const prompt of ["把图中手机抠出来", "去掉这张图片的背景", "把产品单独提取出来",
    "将这张图片处理成透明背景 PNG", "帮我把这张照片的背景移除", "请抠图"]) {
    const route = CanvasAgentCore.classifyAgentRequest(prompt);
    assert.equal(route.imageCutout, true, prompt);
    assert.equal(route.imageUtility, true, prompt);
    assert.equal(CanvasAgentCore.isReadOnlyImageQuestion(prompt, 1), false, prompt);
    for (const request of [
      CanvasAgentRuntime.buildProviderTurnRequest({ prompt, canvas, vision_images }, { skills }),
      CanvasAgentRuntime.buildResponsesRequest({ prompt, canvas, vision_images }, { skills }),
    ]) {
      assert.deepEqual(request.tools.map(tool => tool.function?.name || tool.name), ["remove_canvas_image_background"], prompt);
    }
  }
  for (const prompt of ["图中是什么手机？", "怎么把图中手机抠出来？", "不要抠图", "能把这张图片抠出来吗？",
    "只讨论怎么去掉这张图片的背景", "检查这张图是否有透明背景", "把图中手机抠出来的教程"]) {
    assert.equal(CanvasAgentCore.classifyAgentRequest(prompt).execution, false, prompt);
    assert.deepEqual(CanvasAgentRuntime.buildProviderTurnRequest({ prompt, canvas, vision_images }, { skills }).tools, [], prompt);
  }
});

test("抠图只有在新节点与结果保存通过后才完成", () => {
  const tool = "remove_canvas_image_background";
  const result = { ok: true, tool, state: "succeeded", node_id: "cutout", source_node_id: "source",
    result_url: "/output/cutout.png", width: 800, height: 500 };
  assert.equal(CanvasAgentCore.shouldUseTerminalToolRun("把图中手机抠出来", [{ name: tool }]), true);
  assert.equal(CanvasAgentCore.getCanvasExecutionOutcome([result]), "not-executed");
  assert.equal(CanvasAgentCore.getCanvasExecutionOutcome([{ ...result, persisted: true }]), "completed");
});

test("连续请求的第一步抠图或超清不能结束整轮", () => {
  const prompt = "把选中的商品图抠图、超清到4K，然后生成三张产品摄影图";
  assert.equal(CanvasAgentCore.shouldUseTerminalToolRun(prompt, [{ name: "remove_canvas_image_background" }]), false);
  assert.equal(CanvasAgentCore.shouldUseTerminalToolRun(prompt, [{ name: "upscale_canvas_image" }]), false);
  assert.equal(CanvasAgentCore.shouldUseTerminalToolRun("图片超清到4K", [{ name: "upscale_canvas_image" }]), true);
  assert.equal(CanvasAgentCore.shouldUseTerminalToolRun("请整理当前画布，然后把这个节点改名", [{ name: "organize_canvas_nodes" }]), false);
});

test("系统基础工具不因未验证的 Skill 或图像措辞而被裁掉", () => {
  const skills = CanvasAgentRuntime.loadCanvasSkills(path.join(__dirname, "../host-sources/app/skills"));
  const canvas = { selected_node_ids: ["image-a"], nodes: [{ id: "image-a", kind: "image", has_image: true }] };
  for (const prompt of ["放大图片", "把这张图放大到4K", "请把这张照片做超分", "把选中的图提升到4K清晰度",
    "裁切图片", "扩图", "生成一张图片"]) {
    const request = CanvasAgentRuntime.buildProviderTurnRequest({ prompt, canvas }, { skills });
    const names = request.tools.map(tool => tool.function.name);
    for (const tool of ["upscale_canvas_image", "remove_canvas_image_background", "crop_canvas_image", "create_comfy_node", "create_image_node", "run_canvas_node"]) {
      assert.ok(names.includes(tool), `${prompt}: ${tool}`);
    }
    assert.equal(names.includes("generate_image_to_gallery"), false, prompt);
    assert.equal(CanvasAgentCore.getSelectedImageEditGenerationAllowance(prompt, true), 0, prompt);
  }
  for (const prompt of ["请修改当前画布节点标题", "把当前节点标题改成示例"]) {
    const request = CanvasAgentRuntime.buildProviderTurnRequest({ prompt, canvas }, { skills });
    assert.ok(request.tools.some(tool => tool.function.name === "update_node"), prompt);
    assert.ok(!request.tools.some(tool => tool.function.name === "run_canvas_node"), prompt);
  }
  for (const prompt of ["如何把图片放大到4K？", "先讨论怎么超分，别执行", "不要超清图片，只给我建议"]) {
    assert.deepEqual(CanvasAgentRuntime.buildProviderTurnRequest({ prompt, canvas }, { skills }).tools, [], prompt);
  }
});

test("超清契约通过既有 MCP 校验参数、反馈失败并去重", async () => {
  for (const implementation of [
    () => ({ state: "succeeded", task_id: "implementation-a", persisted: true, width: 4096, height: 2400 }),
    () => ({ state: "succeeded", task_id: "implementation-b", persisted: true, width: 4096, height: 2048 }),
    () => ({ ok: false, state: "unavailable", code: "plugin_unavailable", error: "图片超清暂不可用。" }),
    () => { throw new Error("插件执行失败。"); },
  ]) {
    let submissions = 0;
    const args = { node_id: "image-a", resolution: 4096 };
    const adapters = createToolAdapters({ canvasApi: {
      upscaleImage(actual) { assert.deepEqual(actual, args); submissions++; return implementation(); },
      focusNodes: ids => ({ focused: true, node_ids: ids }),
    } });
    const broker = createBroker({ adapters, getCurrentBoardId: () => "board-a" });
    const scope = broker.beginRun({ boardId: "board-a", runId: "run-a" });
    const session = createCanvasMcpSession({ broker, getScope: () => scope, getRunContext: () => scope,
      getCapabilityIds: () => ["image.upscale", "canvas.node.focus"] });
    const { tools } = await session.listTools();
    assert.equal(tools[0].name, "upscale_canvas_image");
    assert.equal(CanvasAgentCapabilities.getRisk(tools[0].name, { ...args, resolution: null }), "safe");
    assert.equal(CanvasAgentCapabilities.getRisk(tools[0].name, args), "paid");
    const invalid = await session.callTool({ call_id: "bad", name: tools[0].name, arguments: { ...args, resolution: 3072 } });
    assert.equal(invalid.structuredContent.code, "invalid_arguments");
    assert.equal(submissions, 0);
    const call = { call_id: "one", name: tools[0].name, arguments: args };
    const result = await session.callTool(call);
    assert.deepEqual(await session.callTool(call), result);
    assert.equal(submissions, 1);
    if (result.isError) assert.match(result.structuredContent.code, /^(plugin_unavailable|tool_failed)$/);
    else assert.equal(result.structuredContent.width, args.resolution);
    assert.equal((await session.callTool({ call_id: "focus", name: "focus_canvas_nodes",
      arguments: { node_ids: ["image-a"] } })).isError, false);
    session.close();
  }
});

test("模型收尾、查询、编辑器、提交回执不构成操作成功", () => {
  const conclude = CanvasAgentCore.getCanvasExecutionOutcome;
  for (const [outputs, expected] of [
    [[], "not-executed"],
    [[{ ok: true, tool: "read_skill_reference" }], "not-executed"],
    [[{ ok: true, tool: "crop_canvas_image", editor_open: true }], "waiting-input"],
    [[{ ok: true, tool: "upscale_canvas_image", state: "queued", task_id: "task-a" }], "running"],
    [[{ ok: false, state: "unavailable" }], "unavailable"],
    [[{ ok: false, state: "cancelled" }], "cancelled"],
    [[{ ok: false, code: "tool_failed" }], "failed"],
    [[{ ok: true, tool: "upscale_canvas_image", state: "succeeded", task_id: "task-a" }], "not-executed"],
    [[{ ok: true, tool: "upscale_canvas_image", state: "succeeded", task_id: "a", node_id: "b", persisted: true, width: 4096, height: 2048 }], "completed"],
    [[{ ok: true, tool: "update_node", node_ids: ["image-a"], persisted: true }], "completed"],
  ]) assert.equal(conclude(outputs), expected);
});
test("显式选择优先于另一 Skill 的显式名称和海报关键词", () => {
  const skills = [
    { id: photoId, label: "自然美学产品摄影", enabled: true },
    { id: "poster-design", label: "海报设计", enabled: true },
  ];
  const selected = CanvasAgentCore.resolveSkillInvocation(skills, {
    selectedId: photoId, prompt: "根据海报设计 Skill 制作春节海报",
  });
  assert.equal(selected.skill.id, photoId);
  assert.equal(selected.reason, "selected");
  const named = CanvasAgentCore.resolveSkillInvocation(skills, { prompt: "使用海报设计 Skill 制作春节海报" });
  assert.equal(named.skill.id, "poster-design");
  const held = CanvasAgentCore.resolveSkillInvocation(skills, {
    lockedId: photoId, prompt: "切换到海报设计 Skill",
  });
  assert.equal(held.skill.id, photoId);
  assert.equal(held.requestedSwitch.id, "poster-design");
  const switched = CanvasAgentCore.resolveSkillInvocation(skills, {
    selectedId: photoId, prompt: "明确切换到海报设计 Skill",
  });
  assert.equal(switched.skill.id, "poster-design");
  const combined = CanvasAgentCore.resolveSkillInvocation(skills, {
    selectedId: photoId, prompt: "同时结合海报设计 Skill",
  });
  assert.equal(combined.skill.id, photoId);
  assert.equal(combined.combination.length, 2);
  const ambiguous = CanvasAgentCore.resolveSkillInvocation([
    { ...skills[0], triggers: ["春节主题照片"], validation_status: "verified", execution: { exposure: "agent", allowImplicitInvocation: true } },
    { ...skills[1], triggers: ["春节主题照片"], validation_status: "verified", execution: { exposure: "agent", allowImplicitInvocation: true } },
  ], { prompt: "生成一张春节主题照片" });
  assert.equal(ambiguous.reason, "ambiguous");
  const unavailable = CanvasAgentCore.resolveSkillInvocation(skills, { selectedId: "missing-skill" });
  assert.equal(unavailable.unavailable, true);
});

test("专业 Skill 激活和异域引用在工具执行前得到不同裁决", () => {
  const lock = { skillId: photoId };
  assert.equal(CanvasAgentCore.inspectSkillInvocation(lock, "read_skill_reference", photoId), "allow");
  assert.equal(CanvasAgentCore.inspectSkillInvocation(lock, "update_node", ""), "allow");
  assert.equal(CanvasAgentCore.inspectSkillInvocation(lock, "read_skill_reference", "poster-design"), "deny");
  assert.equal(CanvasAgentCore.inspectSkillInvocation(lock, "activate_canvas_skill", "poster-design"), "approval");
});

test("符合专业需求的部分验证 Skill 只推荐，通用请求仍走基础能力", () => {
  const skill = { id: photoId, label: "自然美学产品摄影", triggers: ["产品摄影"], enabled: true,
    validation_status: "partial", execution: { exposure: "agent", allowImplicitInvocation: true } };
  const result = CanvasAgentCore.resolveSkillInvocation([skill], { prompt: "为手机保护壳制作产品摄影方案" });
  assert.equal(result.skill, null);
  assert.deepEqual(result.recommendations.map(item => item.id), [photoId]);
  for (const prompt of ["你好", "分析这张图片", "把当前节点标题改成示例"]) {
    const route = CanvasAgentCore.resolveSkillInvocation([skill], { prompt });
    assert.equal(route.reason, "general");
    assert.equal(route.recommendations, undefined);
  }
});

test("HTTP 保持主 Skill 并只接受绑定本轮的跨 Skill 授权", async () => {
  const [photo, poster] = [photoId, "poster-design"].map(id => ({
    id, name: id, enabled: true, instructions: `专业资料 ${id}`,
    canvas: { label: id, category: "image", capabilities: ["skill.reference.read"], tools: ["read_skill_reference"], toolBindingDeclared: true, triggers: [] },
  }));
  let calls = 0;
  const tasks = new Map();
  const options = {
    CanvasAgentConversation, normalizeBoardId: String,
    conversationStore: {
      get: () => ({ conversationId: "dialog-a", activeSkillId: photoId, taskContext: { taskId: "task-a" } }),
      skillTask(board, owner, dialog, task, value) {
        const key = [board, owner, dialog, task].join("/");
        if (value !== undefined) tasks.set(key, structuredClone(value));
        return tasks.get(key) || null;
      },
    },
    CanvasAgentRuntime, skillRegistry: { loadAgentCatalog: () => ({
      core: { instructions: "", canvas: { capabilities: ["skill.reference.read"] } }, business: [photo, poster],
    }) },
    agentModelSettings: { getRoute: () => ({ candidateOrder: [], autoFallback: false }) },
    ensureReferencedResource: async () => ({ id: "board-a" }),
    resourceAccess: { async assertRead() {}, async assertWrite() {} },
    maxSessions: 8, sessionTtlMs: 60000, readJson: async req => req.body,
    sendJson: (res, status, body) => Object.assign(res, { status, body }),
    canvasAgentProviderBridge: { async runTurn({ system }) {
      assert.ok(system.includes(photo.instructions));
      calls++;
      assert.equal(system.includes(poster.instructions), calls === 2);
      return { selection: {}, attempts: [], turn: calls === 1 ? { tool_calls: [{
        call_id: "foreign-reference", name: "read_skill_reference",
        arguments: { skill_id: poster.id, path: "references/creative-brief.md" },
      }] } : { message: "继续摄影策划。", tool_calls: [] } };
    } },
  };
  let api = createCanvasAgentHttpApi(options);
  async function submit(body, owner = "owner", method = "POST", url = "/api/canvas-agent/turn") {
    const req = Object.assign(new EventEmitter(), { method, headers: {}, url,
      auth: { user: { id: owner } }, body: { run_id: "run-a", task_id: "task-a", board_id: "board-a",
        conversation_id: "dialog-a", ...body } });
    const res = new EventEmitter();
    await api.handle(req, res);
    return res;
  }
  const first = await submit({ skill_id: poster.id, skill_mode: "manual", skill_workflow: true, prompt: "制作春节海报" });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.primary_skill.id, photoId);
  assert.deepEqual(first.body.tool_calls, []);
  const request = first.body.skill_approval;
  assert.equal(request.id, poster.id);
  const readApproval = () => submit({}, "owner", "GET", "/api/canvas-agent/conversation?board_id=board-a&conversation_id=dialog-a");
  assert.equal((await readApproval()).body.skillReferenceApproval.pending.operationId, request.operationId);
  const approval = { action: "skill_approval", operation_id: request.operationId, decision: "approve" };
  assert.equal((await submit(approval, "different-account")).status, 403);
  assert.equal((await submit({ ...approval, operation_id: "wrong" })).status, 409);
  assert.equal((await submit(approval)).body.approved.id, poster.id);
  assert.equal((await submit(approval)).status, 409);
  assert.equal((await readApproval()).body.skillReferenceApproval.resume.decision, "approve");
  api = createCanvasAgentHttpApi(options);
  const continuation = { skill_id: poster.id, skill_mode: "manual", prompt: "继续当前方案", skill_approval_resume: request.operationId };
  const next = await submit(continuation);
  assert.equal(next.status, 200);
  assert.equal(next.body.primary_skill.id, photoId);
  assert.equal((await submit(continuation)).status, 409);
  assert.equal((await readApproval()).body.skillReferenceApproval.resume, null);
  assert.equal(calls, 2);
});
test("明确的海报委托与摄影底图的投放用途分别识别", () => {
  for (const text of ["帮我制作一张产品海报", "帮我为发布会设计一张活动主视觉"]) {
    assert.equal(CanvasAgentCore.isPosterDesignRequest(text), true, text);
  }
  for (const text of ["帮我生成用于产品海报的自然美学产品摄影", "生成一张产品海报摄影底图", "拍一张产品照片，用作海报"]) {
    assert.equal(CanvasAgentCore.isPosterDesignRequest(text), false, text);
  }
});
const exampleSkills = [{
  id: photoId, name: "自然美学产品摄影", description: "摄影策划",
  instructions: "参考知识：保持手机壳材质和真实轮廓。",
  canvas: { label: "自然美学产品摄影", triggers: ["产品摄影", "修改"], capabilities: [], toolBindingDeclared: false },
}];

const readOnlyCases = [
  "我只是让修改一下我上传的提示词。",
  "修改我上传的提示词",
  "帮我优化这段摄影提示词",
  "帮我润色这段文字：生成图片，将背景改成森林。",
  "分析这张产品图片",
  "这张图片的光影应该怎么调整",
  "不要执行图片生成，只修改文字",
  "先讨论方案，暂时别执行",
  "先讨论如何创建图片生成工作流，等我确认再执行。",
  "什么是 H3 带货视频？",
  "能解释一下柔光和硬光的区别吗？",
  "先说一下把照片背景改成白色是否可行",
  "我想了解图片生成",
  "把当前节点的提示词给我看看",
  "把当前节点的提示词发到聊天里",
  "我不想创建任何画布节点，只需要文字建议",
];

for (const prompt of readOnlyCases) {
  test(`typed requests do not inherit a selected Skill or image action: ${prompt}`, () => {
    assert.equal(CanvasAgentCore.getSelectedImageEditGenerationAllowance(prompt, true), 0);
    assert.equal(CanvasAgentCore.getDirectImageGenerationAllowance(prompt), 0);
    const built = CanvasAgentRuntime.buildProviderTurnRequest({
      prompt, skill_mode: "manual", skill_id: photoId, active_skill_id: photoId,
      canvas: { selected_node_ids: ["image-a"] },
      conversation_context: [{ role: "user", content: "上一轮请生成一张产品摄影图。" }],
    }, { skills: exampleSkills });
    assert.deepEqual(built.tools, []);
    assert.doesNotMatch(built.system, /当前业务 Skill/);
    assert.match(built.system, /完整.{0,12}提示词/);
  });
}

test("explicit Skill reference supplies knowledge without opening its workflow", () => {
  const built = CanvasAgentRuntime.buildProviderTurnRequest({
    prompt: "参考自然美学摄影 Skill 改写提示词",
  }, { skills: exampleSkills });
  assert.deepEqual(built.tools, []);
  assert.match(built.system, /保持手机壳材质和真实轮廓/);
  assert.doesNotMatch(built.system, /当前业务 Skill/);
});

test("an explicitly selected text source is not shortened to the canvas summary budget", () => {
  const prompt = "保留材质和侧光。".repeat(320);
  const board = { nodes: [{ id: "target", kind: "image", prompt }, { id: "other", kind: "image", prompt }] };
  const summary = CanvasAgentCore.summarizeCanvasBoard(board, ["target"], { fullSelectedText: true });
  assert.equal(summary.nodes[0].prompt, prompt);
  assert.ok(summary.nodes[1].prompt.length < prompt.length);
});

test("generation, editing, canvas writes and workflow creation retain their tools", () => {
  const cases = [
    ["根据这段提示词生成图片", "generate_image_to_gallery"],
    ["用这个产品直接生成", "generate_image_to_gallery"],
    ["帮我设计一个春节产品海报", null],
    ["先讨论方案，等我确认后用这个产品直接生成", null],
    ["把这张图片的背景改成自然场景", "generate_image_to_gallery"],
    ["把修改后的提示词写入当前节点", "update_node"],
    ["帮我创建一套图片生成工作流", "create_image_node"],
    ["只建图片节点，不要生成图片", "create_image_node"],
    ["把修改后的提示词写入当前节点，不要生成图片", "update_node"],
    ["按照自然美学产品摄影 Skill，帮我生成一张产品图", "generate_image_to_gallery"],
  ];
  for (const [prompt, expectedTool] of cases) {
    const built = CanvasAgentRuntime.buildProviderTurnRequest({ prompt }, { skills: exampleSkills });
    if (expectedTool) assert.ok(built.tools.some(tool => tool.function.name === expectedTool), prompt);
    else assert.equal(built.tools.some(tool => tool.function.name === "generate_image_to_gallery"), false, prompt);
    if (prompt === "用这个产品直接生成") {
      assert.equal(CanvasAgentCore.getDirectImageGenerationAllowance(prompt), 1);
      assert.equal(built.tools.some(tool => tool.function.name === "generate_image_to_gallery"), true);
    }
  }
  assert.ok(CanvasAgentCapabilities.CAPABILITY_REGISTRY.some(item => item.tool.name === "generate_image_to_gallery"));
  assert.equal(CanvasAgentCore.getSelectedImageEditGenerationAllowance(cases[4][0], true), 1);
  assert.equal(CanvasAgentCore.getSelectedImageEditGenerationAllowance("把选中的图片放到森林里", true), 1);
});

test("选中图片后的图中编辑请求进入生成式编辑工具路径", () => {
  const prompt = "把图中人物的大衣换成红色。";
  const canvas = { selected_node_ids: ["image-a"], nodes: [{ id: "image-a", kind: "image", has_image: true }] };
  const route = CanvasAgentCore.classifyAgentRequest(prompt);
  assert.equal(route.edit, true);
  assert.equal(route.execution, true);
  assert.equal(CanvasAgentCore.isReadOnlyImageQuestion(prompt, 1), false);
  assert.equal(CanvasAgentCore.getSelectedImageEditGenerationAllowance(prompt, true), 1);
  const built = CanvasAgentRuntime.buildProviderTurnRequest({ prompt, canvas, vision_images: ["[image omitted]"] }, { skills: exampleSkills });
  const toolNames = built.tools.map(tool => tool.function.name);
  assert.ok(toolNames.includes("create_image_node"));
  assert.ok(toolNames.includes("run_canvas_node"));
  const approval = CanvasAgentCore.buildApprovalPlan([{
    call_id: "run-new-image",
    name: "run_canvas_node",
    arguments: { node_id: "new-image-node" },
  }], { paidAllowances: { run_canvas_node: 1 } });
  assert.equal(approval.requiresApproval, false);
  assert.equal(approval.authorizedCalls.length, 1);
});

test("ordinary multimodal image questions are recognized as read-only and do not opt into a Skill", () => {
  const prompt = "请识别这张商品图片的颜色、材质和可见结构。不要调用 Skill，不要执行画布操作。";
  assert.equal(CanvasAgentCore.isReadOnlyImageQuestion(prompt, 1), true);
  assert.equal(CanvasAgentCore.isSkillInvocationProhibited(prompt), true);
  assert.equal(CanvasAgentCore.isCanvasOperationRequested(prompt), false);
});

test("explicit canvas-node instructions remain operational requests", () => {
  const prompt = "请定位当前商品节点，并仅选中该节点，不要移动、修改或创建节点。";
  assert.equal(CanvasAgentCore.isReadOnlyImageQuestion(prompt, 1), false);
  assert.equal(CanvasAgentCore.isCanvasOperationRequested(prompt), true);
});

test("filename-only values are never forwarded as provider image content", () => {
  const built = CanvasAgentRuntime.buildProviderTurnRequest({
    skill_mode: "auto",
    prompt: "请识别图片中的商品并说明颜色和材质，不要调用 Skill，不要执行画布操作，不要创建画布节点。",
    vision_images: ["[image omitted]"],
    board_id: "board-a",
    canvas: {},
  }, { skills: { business: [] } });
  assert.equal(built.needsVision, false);
  const content = built.messages.find(message => Array.isArray(message.content)).content;
  assert.equal(content.some(part => part.type === "image_url"), false);
});

test("focusing a canvas node does not terminate a task before the final assistant answer", () => {
  assert.equal(CanvasAgentCore.shouldUseTerminalToolRun("分析这张商品图。", [
    { name: "focus_canvas_nodes" },
  ]), false);
  assert.equal(CanvasAgentCore.shouldUseTerminalToolRun("请立即运行当前生成节点。", [
    { name: "run_canvas_node" },
  ]), true);
});

test("manually requested product photography retains its planning and reference-reading tools", () => {
  const skillId = "natural-aesthetic-product-photography";
  const ids = CanvasAgentCapabilities.getCapabilityIdsForToolNames([
    "activate_canvas_skill", "read_skill_reference", "request_design_brief",
  ]);
  const selected = CanvasAgentRuntime.selectAdaptiveCapabilityIds({
    prompt: "请调用自然美学产品摄影 Skill，为这张商品图策划摄影方案，不创建节点。",
    skill_mode: "manual",
    skill_id: skillId,
    active_skill_id: skillId,
    vision_images: ["[image omitted]"],
  }, {
    mode: "manual",
    manualActivated: true,
    activeSkill: { id: skillId, execution: { mode: "guided" } },
    capabilityIds: ids,
  });
  assert.deepEqual(selected, ids);
  assert.ok(ids.includes(CanvasAgentCapabilities.getCapabilityByToolName("read_skill_reference").id));
  assert.ok(ids.includes(CanvasAgentCapabilities.getCapabilityByToolName("request_design_brief").id));
  assert.equal(ids.includes(CanvasAgentCapabilities.getCapabilityByToolName("create_image_node").id), false);
});

test("HTTP image recognition request keeps its request id, forwards pixels, and does not load or expose a Skill", async () => {
  const image = "data:image/jpeg;base64,/9j/2Q==";
  let providerCall;
  const api = createCanvasAgentHttpApi({
    CanvasAgentConversation,
    conversationStore: { get() {} },
    normalizeBoardId: String,
    CanvasAgentRuntime,
    skillRegistry: { loadAgentCatalog: () => ({ business: [] }) },
    agentModelSettings: { getRoute: () => ({ candidateOrder: [], autoFallback: false }) },
    ensureReferencedResource: async () => ({ id: "board-a" }),
    resourceAccess: { async assertRead() {}, async assertWrite() {} },
    maxSessions: 8, sessionTtlMs: 60000,
    readJson: async req => req.body,
    sendJson: (res, status, body) => Object.assign(res, { status, body }),
    canvasAgentProviderBridge: { async runTurn(input) {
      providerCall = input;
      return { selection: {}, attempts: [], turn: { response_id: "response-a", message: "识别结果", tool_calls: [] } };
    } },
  });
  const request = Object.assign(new EventEmitter(), {
    method: "POST",
    headers: {},
    url: "/api/canvas-agent/turn",
    auth: { user: { id: "owner" } },
    body: {
      run_id: "task-a", request_id: "message-a-request", board_id: "board-a",
      message_id: "message-a",
      skill_mode: "manual",
      skill_id: "natural-aesthetic-product-photography",
      active_skill_id: "natural-aesthetic-product-photography",
      prompt: "识别这张商品图片的颜色、材质和结构，不要调用 Skill，不要执行画布操作。",
      vision_images: [image],
      canvas: { agent_image_attachments: [{ node_id: "node-a", name: "1600_01.jpg", source: "canvas", mime_type: "image/jpeg" }] },
    },
  });
  const response = new EventEmitter();
  await api.handle(request, response);
  assert.equal(response.status, 200);
  assert.equal(response.body.request_id, "message-a-request");
  assert.equal(response.body.message_id, "message-a");
  assert.equal(response.body.vision_receipt.count, 1);
  assert.equal(providerCall.needsVision, true);
  assert.deepEqual(providerCall.tools, []);
  const content = providerCall.messages.find(message => Array.isArray(message.content)).content;
  assert.equal(content.filter(part => part.type === "image_url")[0].image_url.url, image);
});

test("an explicit node-focus request retains its canvas tool", async () => {
  let providerCall;
  let providerCalls = 0;
  const api = createCanvasAgentHttpApi({
    CanvasAgentConversation,
    conversationStore: { get() {} },
    normalizeBoardId: String,
    CanvasAgentRuntime,
    skillRegistry: { loadAgentCatalog: () => ({ business: [] }) },
    agentModelSettings: { getRoute: () => ({ candidateOrder: [], autoFallback: false }) },
    ensureReferencedResource: async () => ({ id: "board-a" }),
    resourceAccess: { async assertRead() {}, async assertWrite() {} },
    maxSessions: 8, sessionTtlMs: 60000,
    readJson: async req => req.body,
    sendJson: (res, status, body) => Object.assign(res, { status, body }),
    canvasAgentProviderBridge: { async runTurn(input) {
      providerCalls++;
      providerCall = input;
      return { selection: {}, attempts: [], turn: { response_id: "response-c", message: "", tool_calls: [{
        call_id: "focus-a", name: "focus_canvas_nodes", arguments: { node_ids: ["node-a"] },
      }] } };
    } },
  });
  const request = Object.assign(new EventEmitter(), {
    method: "POST", headers: {}, url: "/api/canvas-agent/turn", auth: { user: { id: "owner" } },
    body: { run_id: "task-c", request_id: "message-c-request", message_id: "message-c", board_id: "board-a",
      prompt: "请定位当前商品节点，并仅选中该节点，不要移动、修改或创建节点。",
      vision_images: [],
    },
  });
  const response = new EventEmitter();
  await api.handle(request, response);
  assert.ok(providerCall.tools.some(tool => tool.function.name === "focus_canvas_nodes"),
    JSON.stringify(providerCall.tools.map(tool => tool.function.name)));
  assert.equal(response.body.request_id, "message-c-request");
  assert.equal(response.body.message_id, "message-c");
  const mismatch = Object.assign(new EventEmitter(), {
    method: "POST", headers: {}, url: "/api/canvas-agent/turn", auth: { user: { id: "owner" } },
    body: { run_id: "task-c", request_id: "message-c-request", message_id: "message-other",
      board_id: "board-a", prompt: "继续当前节点定位操作。", vision_images: [] },
  });
  const mismatchResponse = new EventEmitter();
  await api.handle(mismatch, mismatchResponse);
  assert.equal(mismatchResponse.status, 409);
  assert.equal(mismatchResponse.body.code, "message_id_mismatch");
  assert.equal(providerCalls, 1);
});

test("HTTP uses the latest user request, ignores instructions appended by the browser and rejects a proposed write", async () => {
  const skills = { core: { instructions: "", canvas: {
    capabilities: CanvasAgentCapabilities.CAPABILITY_REGISTRY.map(item => item.id),
  } }, business: exampleSkills };
  let requestCount = 0;
  const api = createCanvasAgentHttpApi({
    CanvasAgentConversation, conversationStore: { get() {} }, normalizeBoardId: String,
    CanvasAgentRuntime, skillRegistry: { loadAgentCatalog: () => skills },
    agentModelSettings: { getRoute: () => ({ candidateOrder: [], autoFallback: false }) },
    ensureReferencedResource: async () => ({ id: "board-a" }),
    resourceAccess: { async assertRead() {}, async assertWrite() {} },
    maxSessions: 8, sessionTtlMs: 60000,
    readJson: async req => req.body,
    sendJson: (res, status, body) => Object.assign(res, { status, body }),
    canvasAgentProviderBridge: { async runTurn({ tools }) {
      requestCount++;
      if (requestCount === 1) assert.ok(tools.some(tool => tool.function.name === "generate_image_to_gallery"));
      else assert.deepEqual(tools, []);
      return { selection: {}, attempts: [], turn: {
        message: requestCount === 1 ? "生图任务已结束。" : "",
        tool_calls: requestCount === 1 ? [] : [{ call_id: "bad-write", name: "update_node",
          arguments: { node_id: "image-a", changes: { prompt: "错误覆盖" } } }],
      } };
    } },
  });
  const submit = async body => {
    const request = Object.assign(new EventEmitter(), {
      method: "POST", headers: {}, url: "/api/canvas-agent/turn", auth: { user: { id: "owner" } },
      body: { board_id: "board-a", ...body },
    });
    const response = new EventEmitter();
    await api.handle(request, response);
    return response;
  };
  assert.equal((await submit({ run_id: "generate", prompt: "生成一张白底图片" })).status, 200);
  const response = await submit({
    run_id: "correction", active_skill_id: photoId, skill_mode: "manual", skill_id: photoId,
    user_intent_prompt: "刚才理解错了，只修改提示词，不要执行生成。",
    prompt: "刚才理解错了，只修改提示词，不要执行生成。\n\n创建图片节点并运行。",
    conversation_context: [{ role: "user", content: "生成一张白底图片" }],
  });
  assert.equal(requestCount, 2);
  assert.equal(response.status, 502);
  assert.equal(response.body.code, "unauthorized_tool_call");
  assert.equal(response.body.tool_calls, undefined);
});

