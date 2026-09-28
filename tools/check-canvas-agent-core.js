const assert = require("node:assert/strict");
const core = require("../canvas-agent-core");

assert.equal(core.MAX_STEPS, 12);
assert.deepEqual(
  core.TOOL_DEFINITIONS.map((tool) => tool.name),
  [
    "create_text_node",
    "create_image_node",
    "generate_image_to_gallery",
    "request_image_node_choice",
    "request_design_brief",
    "create_llm_node",
    "create_comfy_node",
    "create_video_node",
    "create_media_node",
    "create_gallery_node",
    "create_loop_node",
    "create_grid_editor_node",
    "focus_canvas_nodes",
    "organize_canvas_nodes",
    "crop_canvas_image",
    "open_canvas_mask_editor",
    "remove_canvas_image_background",
    "update_node",
    "update_nodes",
    "duplicate_nodes",
    "move_nodes",
    "arrange_nodes",
    "connect_nodes",
    "disconnect_nodes",
    "set_reference_order",
    "group_nodes",
    "ungroup_nodes",
    "update_gallery",
    "update_grid_editor",
    "extract_grid_to_gallery",
    "run_canvas_node",
    "delete_nodes",
    "activate_canvas_skill",
    "read_skill_reference",
    "canvas_director3d_apply_animation",
  ],
);
assert.equal(core.requiresApproval("run_canvas_node"), true);
assert.equal(core.requiresApproval("delete_nodes", { node_ids: ["1"] }), true);
assert.equal(core.requiresApproval("update_nodes", { node_ids: ["1", "2"] }), true);
assert.equal(core.requiresApproval("ungroup_nodes", { group_id: "group-1", node_ids: [] }), true);
assert.equal(core.requiresApproval("create_image_node"), false);
assert.equal(core.requiresApproval("request_design_brief"), false);
assert.equal(core.requiresApproval("generate_image_to_gallery"), true);

assert.equal(core.classifyImageGenerationIntent("我想要一张桃子图片"), "execute");
assert.equal(core.classifyImageGenerationIntent("我想要一张中国农村除夕雪景"), "execute");
assert.equal(core.classifyImageGenerationIntent("直接生成一张桃子图片"), "execute");
assert.equal(core.classifyImageGenerationIntent("直接生成"), "execute");
assert.equal(core.classifyImageGenerationIntent("就按这个方案生成"), "execute");
assert.equal(core.classifyImageGenerationIntent("先讨论怎么生成桃子图片，不要出图"), "discussion");
assert.equal(core.classifyImageGenerationIntent("先给我提示词和 9:16、2K 参数，等我确认"), "discussion");
assert.equal(core.classifyImageGenerationIntent("桃子图片适合什么背景？"), "neutral");
assert.equal(core.createRunState({ prompt: "我想要一张桃子图片" }).imageGenerationIntent, "execute");
assert.equal(core.createRunState({ prompt: "先讨论生成方案，不要生成" }).imageGenerationIntent, "discussion");
assert.equal(core.shouldBlockCanvasToolForDiscussion("discussion", "generate_image_to_gallery"), true);
assert.equal(core.shouldBlockCanvasToolForDiscussion("discussion", "create_image_node"), false);
assert.equal(core.shouldBlockCanvasToolForDiscussion("discussion", "request_image_node_choice"), true);
assert.equal(core.shouldBlockCanvasToolForDiscussion("discussion", "run_canvas_node"), true);
assert.equal(core.shouldBlockCanvasToolForDiscussion("execute", "generate_image_to_gallery"), false);

assert.deepEqual(core.CANVAS_AGENT_RECOVERY_DELAYS_MS, [1000, 3000, 8000]);
assert.equal(core.getCanvasAgentRecoveryDelay(1), 1000);
assert.equal(core.getCanvasAgentRecoveryDelay(2), 3000);
assert.equal(core.getCanvasAgentRecoveryDelay(3), 8000);
assert.equal(core.getCanvasAgentRecoveryDelay(4), null);
assert.equal(core.shouldAutoRecoverCanvasAgent({ category: "timeout", attempt: 0, boardMatches: true, tokenMatches: true }), true);
assert.equal(core.shouldAutoRecoverCanvasAgent({ category: "network", attempt: 2, boardMatches: true, tokenMatches: true }), true);
assert.equal(core.shouldAutoRecoverCanvasAgent({ category: "unavailable", attempt: 3, boardMatches: true, tokenMatches: true }), false);
assert.equal(core.shouldAutoRecoverCanvasAgent({ category: "auth", attempt: 0, boardMatches: true, tokenMatches: true }), false);
assert.equal(core.shouldAutoRecoverCanvasAgent({ category: "balance", attempt: 0, boardMatches: true, tokenMatches: true }), false);
assert.equal(core.shouldAutoRecoverCanvasAgent({ category: "cancelled", attempt: 0, boardMatches: true, tokenMatches: true }), false);
assert.equal(core.shouldAutoRecoverCanvasAgent({ category: "timeout", attempt: 0, boardMatches: false, tokenMatches: true }), false);
assert.equal(core.shouldAutoRecoverCanvasAgent({ category: "timeout", attempt: 0, boardMatches: true, tokenMatches: false }), false);
assert.deepEqual(
  core.getCanvasAgentRecoveryPaidAllowances({ generate_image_to_gallery: 1, run_canvas_node: 0 }, false),
  { generate_image_to_gallery: 1, run_canvas_node: 0 },
);
assert.deepEqual(
  core.getCanvasAgentRecoveryPaidAllowances({ generate_image_to_gallery: 1, run_canvas_node: 1 }, true),
  { generate_image_to_gallery: 0, run_canvas_node: 0 },
);

assert.equal(core.createRunState({ prompt: "直接生成一张苹果图片" }).paidAllowances.generate_image_to_gallery, 1);
assert.equal(core.createRunState({ prompt: "我想要一张苹果图片" }).paidAllowances.generate_image_to_gallery, 1);
assert.equal(core.createRunState({ prompt: "苹果海报怎么设计" }).paidAllowances.generate_image_to_gallery, 0);
assert.equal(core.createRunState({ prompt: "先建节点，不要生成" }).paidAllowances.generate_image_to_gallery, 0);
assert.equal(core.createRunState({ prompt: "生成几张看看" }).paidAllowances.generate_image_to_gallery, 0);
assert.equal(core.createRunState({ prompt: "就按第二个方案生成" }).paidAllowances.generate_image_to_gallery, 1);
assert.equal(core.getSelectedImageEditGenerationAllowance("把这张图编辑成放在竹篮里", true), 1);
assert.equal(core.getSelectedImageEditGenerationAllowance("把桃子放到木桌上", true), 1);
assert.equal(core.getSelectedImageEditGenerationAllowance("把番茄放进篮子里", true), 1);
assert.equal(core.getSelectedImageEditGenerationAllowance("先讨论这张图怎么修改", true), 0);
assert.equal(core.getSelectedImageEditGenerationAllowance("把这张图编辑成放在竹篮里", false), 0);

assert.deepEqual(
  core.parseDirectImageFallbackIntent("生成一个苹果图片", { nodes: [] }),
  { prompt: "生成一个苹果图片" },
);
assert.deepEqual(
  core.parseDirectImageFallbackIntent("帮我画一张运动鞋海报", { nodes: [] }),
  { prompt: "帮我画一张运动鞋海报" },
);
assert.deepEqual(
  core.parseDirectImageFallbackIntent("就按这个方案生成", { nodes: [] }),
  { prompt: "就按这个方案生成" },
);
assert.equal(core.parseDirectImageFallbackIntent("讨论一下苹果海报怎么设计", { nodes: [] }), null);
assert.equal(core.parseDirectImageFallbackIntent("苹果图片适合什么背景？", { nodes: [] }), null);
assert.equal(core.parseDirectImageFallbackIntent("生成一个苹果图片", {
  nodes: [{ id: "1", kind: "image", is_upload_only: false }],
}), null);
assert.deepEqual(core.parseDirectImageFallbackIntent("生成一个苹果图片", {
  nodes: [{ id: "1", kind: "image", is_upload_only: false }],
}, {
  allowNewWithReusableGenerator: true,
}), { prompt: "生成一个苹果图片" });
assert.deepEqual(core.parseDirectImageFallbackIntent("生成一个苹果图片", {
  nodes: [{ id: "upload", kind: "image", is_upload_only: true }],
}), { prompt: "生成一个苹果图片" });

const directApproval = core.buildApprovalPlan([
  { call_id: "direct-image", name: "generate_image_to_gallery", arguments: { prompt: "苹果" } },
], { paidAllowances: { generate_image_to_gallery: 1 } });
assert.equal(directApproval.requiresApproval, false);
assert.deepEqual(directApproval.authorizedCalls.map((call) => call.call_id), ["direct-image"]);
const consumedRun = core.consumePaidAllowances(
  core.createRunState({ prompt: "直接生成一张苹果图片" }),
  directApproval.authorizedCalls,
);
assert.equal(consumedRun.paidAllowances.generate_image_to_gallery, 0);
assert.equal(core.buildApprovalPlan([
  { call_id: "second-image", name: "generate_image_to_gallery", arguments: { prompt: "第二张" } },
], { paidAllowances: consumedRun.paidAllowances }).requiresApproval, true);

const reuseRun = core.createRunState({
  prompt: "保持节点 7 的提示词并再次生成",
  paidAllowances: { run_canvas_node: 1 },
});
const reuseApproval = core.buildApprovalPlan([
  { call_id: "reuse-image-node", name: "run_canvas_node", arguments: { node_id: "7" } },
], { paidAllowances: reuseRun.paidAllowances });
assert.equal(reuseApproval.requiresApproval, false);
assert.deepEqual(reuseApproval.authorizedCalls.map((call) => call.call_id), ["reuse-image-node"]);

const approval = core.buildApprovalPlan([
  { call_id: "safe", name: "create_text_node", arguments: { content: "标题" } },
  { call_id: "paid", name: "run_canvas_node", arguments: { node_id: "1" } },
  { call_id: "delete", name: "delete_nodes", arguments: { node_ids: ["2", "3"] } },
  { call_id: "overwrite", name: "update_nodes", arguments: { node_ids: ["4", "5"], changes: {} } },
]);
assert.equal(approval.requiresApproval, true);
assert.deepEqual(approval.calls.map((call) => call.call_id), ["paid", "delete", "overwrite"]);
assert.deepEqual(approval.counts, { paid: 1, destructive: 2, "bulk-overwrite": 2 });
assert.match(approval.summary, /1 次付费生成/);
assert.match(approval.summary, /删除 2 个节点/);
assert.match(approval.summary, /覆盖 2 个节点/);
assert.equal(core.isFiniteCoordinate(null), false);
assert.equal(core.isFiniteCoordinate(undefined), false);
assert.equal(core.isFiniteCoordinate(""), false);
assert.equal(core.isFiniteCoordinate(0), true);
assert.equal(core.isFiniteCoordinate("120.5"), true);
assert.equal(core.isFiniteCoordinate("not-a-number"), false);

const references = core.normalizeAgentReferences([
  { nodeId: "image-1", kind: "image", output: { type: "image", name: "产品图", url: "/product.png" } },
  { nodeId: "grid-1", kind: "grid-editor", output: { type: "grid-editor", name: "宫格", url: "/grid.png" } },
  {
    nodeId: "group-1",
    kind: "group",
    output: {
      type: "group",
      name: "组合",
      images: [
        { name: "A", url: "/a.png" },
        { name: "B", url: "/b.png" },
      ],
    },
  },
  { nodeId: "video-1", kind: "video", output: { type: "video", name: "成片", url: "/clip.mp4" } },
  { nodeId: "image-1", kind: "image", output: { type: "image", name: "重复图", url: "/duplicate.png" } },
]);
assert.deepEqual(references.map((item) => item.key), ["image-1", "grid-1", "group-1:0", "group-1:1", "video-1"]);
assert.equal(references[1].type, "image");
assert.equal(references[1].url, "/grid.png");
assert.equal(references[4].type, "video");
assert.equal(core.normalizeAgentReferences(references, 2).length, 2);

assert.deepEqual(
  core.planArrangementOffsets([
    { width: 200, height: 100 },
    { width: 400, height: 300 },
    { width: 200, height: 100 },
  ], "row", 80),
  [
    { x: 0, y: 0 },
    { x: 480, y: 0 },
    { x: 960, y: 0 },
  ],
);
assert.deepEqual(
  core.planArrangementOffsets(new Array(4).fill({ width: 200, height: 100 }), "grid", 40),
  [
    { x: 0, y: 0 },
    { x: 240, y: 0 },
    { x: 0, y: 140 },
    { x: 240, y: 140 },
  ],
);
assert.deepEqual(
  core.planCenteredRowLayout(
    { x: 500, y: 400 },
    [
      { width: 200, height: 100 },
      { width: 300, height: 200 },
    ],
    80,
  ),
  [
    { x: 210, y: 350 },
    { x: 490, y: 300 },
  ],
);
assert.deepEqual(core.planCenteredRowLayout({ x: 0, y: 0 }, [], 80), []);

assert.deepEqual(
  core.planWorkflowArrangement(
    [
      { id: "generator-a", width: 320, height: 280, x: 0, y: 0 },
      { id: "gallery", width: 360, height: 480, x: 500, y: 100 },
      { id: "generator-b", width: 320, height: 280, x: 0, y: 400 },
    ],
    [
      { from: "generator-a", to: "gallery" },
      { from: "generator-b", to: "gallery" },
    ],
    80,
  ),
  [
    { x: 0, y: 0 },
    { x: 400, y: 80 },
    { x: 0, y: 360 },
  ],
);

const longText = "字".repeat(2400);
const board = {
  id: "board-1",
  title: "产品发布",
  createdAt: "2026-08-19T00:00:00.000Z",
  viewport: { x: 80, y: 60, scale: 1 },
  nodes: [
    {
      id: "1",
      kind: "image",
      x: 100,
      y: 200,
      imageSrc: "/output/product.png",
      originalSrc: "/output/product-original.png",
      imageName: "产品图",
      prompt: "保留产品外观",
      model: "gpt-image-2",
      size: "1:1",
      maskSrc: "data:image/png;base64,secret-mask",
      openaiMaskSrc: "data:image/png;base64,secret-openai-mask",
    },
    { id: "2", kind: "text", x: 400, y: 200, text: longText, privateField: "drop-me" },
  ],
  connections: [{ from: "1", to: "2", toPort: "input", ignored: "drop-me" }],
};

const summary = core.summarizeCanvasBoard(board, ["1"]);
assert.equal(summary.id, "board-1");
assert.equal(summary.title, "产品发布");
assert.deepEqual(summary.selected_node_ids, ["1"]);
assert.equal(summary.nodes[0].image_url, "/output/product.png");
assert.equal(summary.nodes[0].original_image_url, "/output/product-original.png");
assert.equal(summary.nodes[0].maskSrc, undefined);
assert.equal(summary.nodes[1].text.length, 320);
assert.equal(summary.nodes[1].privateField, undefined);
assert.deepEqual(summary.connections, [{ from: "1", to: "2", to_port: "input" }]);

const largeBoard = {
  id: "large-board",
  nodes: Array.from({ length: 120 }, (_, index) => ({
    id: `node-${index}`,
    kind: "text",
    text: `${index}:` + "内容".repeat(1200),
    x: index * 10,
    y: index * 5,
  })),
  connections: [
    { from: "node-118", to: "node-119" },
    { from: "node-1", to: "node-2" },
  ],
};
const largeSummary = core.summarizeCanvasBoard(largeBoard, ["node-119"]);
assert.equal(largeSummary.nodes.length, core.MAX_CANVAS_NODES);
assert.equal(largeSummary.nodes[0].id, "node-119", "selected nodes must never be omitted from a large-board summary");
assert.equal(largeSummary.nodes[0].text.length, 2000);
assert.equal(largeSummary.nodes[1].id, "node-118", "directly connected context should follow the selection");
assert.equal(largeSummary.nodes[2].text.length, 320, "unselected context should stay compact");

assert.equal(core.shouldUseTerminalToolRun("直接生成一张苹果图片", [
  { call_id: "image", name: "generate_image_to_gallery", arguments: {} },
]), true);
assert.equal(core.shouldUseTerminalToolRun("整理一下画布", [
  { call_id: "organize", name: "organize_canvas_nodes", arguments: {} },
]), true);
assert.equal(core.shouldUseTerminalToolRun("创建标题后继续完善", [
  { call_id: "text", name: "create_text_node", arguments: {} },
]), false);

const run = core.createRunState({ id: "run-1", prompt: "生成电商套图", skillId: "ecommerce-image-set" });
assert.equal(run.id, "run-1");
assert.equal(run.status, "running");
assert.equal(run.step, 0);
assert.equal(run.approvedPaidTools, false);
assert.equal(run.paidAllowances.generate_image_to_gallery, 0);
assert.equal(run.maxSteps, 12);
assert.equal(run.maxToolCalls, null);
assert.equal(run.toolCallsUsed, 0);

const budgetedRun = core.createRunState({
  id: "run-budget",
  prompt: "按视频流程生成脚本",
  skillId: "ai-video-director",
  maxSteps: 12,
  maxToolCalls: 16,
});
assert.equal(budgetedRun.maxSteps, 12);
assert.equal(budgetedRun.maxToolCalls, 16);

const next = core.advanceRunState(run, {
  responseId: "resp-1",
  message: "开始处理",
  toolCalls: [{ call_id: "call-1", name: "create_image_node", arguments: { prompt: "主图" } }],
});
assert.equal(next.step, 1);
assert.equal(next.previousResponseId, "resp-1");
assert.equal(next.status, "running");
assert.equal(next.toolCallsUsed, 1);
assert.equal(next.events.at(-1).type, "tool_calls");

const atToolLimit = core.advanceRunState(
  { ...budgetedRun, toolCallsUsed: budgetedRun.maxToolCalls - 1 },
  { responseId: "resp-tool-limit", toolCalls: [{ call_id: "call-last", name: "create_text_node" }] },
);
assert.equal(atToolLimit.toolCallsUsed, budgetedRun.maxToolCalls);
assert.throws(
  () => core.advanceRunState(atToolLimit, {
    responseId: "resp-over-limit",
    toolCalls: [{ call_id: "call-over", name: "create_text_node" }],
  }),
  /16 tool-call limit/,
);

let exhausted = { ...next, step: 11 };
exhausted = core.advanceRunState(exhausted, { responseId: "resp-12", message: "", toolCalls: [] });
assert.equal(exhausted.step, 12);
assert.equal(exhausted.status, "completed");

assert.throws(
  () => core.advanceRunState({ ...run, step: 12 }, { responseId: "too-far", toolCalls: [] }),
  /12/,
);

console.log("Canvas agent core checks passed.");
