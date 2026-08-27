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
  ],
);
assert.equal(core.requiresApproval("run_canvas_node"), true);
assert.equal(core.requiresApproval("delete_nodes", { node_ids: ["1"] }), true);
assert.equal(core.requiresApproval("update_nodes", { node_ids: ["1", "2"] }), true);
assert.equal(core.requiresApproval("ungroup_nodes", { group_id: "group-1", node_ids: [] }), true);
assert.equal(core.requiresApproval("create_image_node"), false);
assert.equal(core.requiresApproval("generate_image_to_gallery"), true);

assert.equal(core.createRunState({ prompt: "直接生成一张苹果图片" }).paidAllowances.generate_image_to_gallery, 1);
assert.equal(core.createRunState({ prompt: "苹果海报怎么设计" }).paidAllowances.generate_image_to_gallery, 0);
assert.equal(core.createRunState({ prompt: "先建节点，不要生成" }).paidAllowances.generate_image_to_gallery, 0);
assert.equal(core.createRunState({ prompt: "生成几张看看" }).paidAllowances.generate_image_to_gallery, 0);
assert.equal(core.createRunState({ prompt: "就按第二个方案生成" }).paidAllowances.generate_image_to_gallery, 1);

assert.deepEqual(
  core.parseDirectImageFallbackIntent("生成一个苹果图片", { nodes: [] }),
  { prompt: "生成一个苹果图片" },
);
assert.deepEqual(
  core.parseDirectImageFallbackIntent("帮我画一张运动鞋海报", { nodes: [] }),
  { prompt: "帮我画一张运动鞋海报" },
);
assert.equal(core.parseDirectImageFallbackIntent("讨论一下苹果海报怎么设计", { nodes: [] }), null);
assert.equal(core.parseDirectImageFallbackIntent("苹果图片适合什么背景？", { nodes: [] }), null);
assert.equal(core.parseDirectImageFallbackIntent("生成一个苹果图片", {
  nodes: [{ id: "1", kind: "image", is_upload_only: false }],
}), null);
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
assert.equal(summary.nodes[1].text.length, 2000);
assert.equal(summary.nodes[1].privateField, undefined);
assert.deepEqual(summary.connections, [{ from: "1", to: "2", to_port: "input" }]);

const run = core.createRunState({ id: "run-1", prompt: "生成电商套图", skillId: "ecommerce-image-set" });
assert.equal(run.id, "run-1");
assert.equal(run.status, "running");
assert.equal(run.step, 0);
assert.equal(run.approvedPaidTools, false);
assert.equal(run.paidAllowances.generate_image_to_gallery, 0);
assert.equal(run.maxSteps, 12);

const next = core.advanceRunState(run, {
  responseId: "resp-1",
  message: "开始处理",
  toolCalls: [{ call_id: "call-1", name: "create_image_node", arguments: { prompt: "主图" } }],
});
assert.equal(next.step, 1);
assert.equal(next.previousResponseId, "resp-1");
assert.equal(next.status, "running");
assert.equal(next.events.at(-1).type, "tool_calls");

let exhausted = { ...next, step: 11 };
exhausted = core.advanceRunState(exhausted, { responseId: "resp-12", message: "", toolCalls: [] });
assert.equal(exhausted.step, 12);
assert.equal(exhausted.status, "completed");

assert.throws(
  () => core.advanceRunState({ ...run, step: 12 }, { responseId: "too-far", toolCalls: [] }),
  /12/,
);

console.log("Canvas agent core checks passed.");
