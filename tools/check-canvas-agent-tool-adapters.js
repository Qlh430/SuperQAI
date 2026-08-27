const assert = require("node:assert/strict");
const CanvasAgentCapabilities = require("../canvas-agent-capabilities");
const CanvasAgentToolAdapters = require("../canvas-agent-tool-adapters");

const calls = [];
const canvasApi = new Proxy({}, {
  get(_target, name) {
    return async (...args) => {
      calls.push({ name, args });
      return { method: name };
    };
  },
});

const adapters = CanvasAgentToolAdapters.create({ canvasApi });
const expectedNames = CanvasAgentCapabilities.CAPABILITY_REGISTRY.map((item) => item.tool.name);
assert.deepEqual(Object.keys(adapters), expectedNames);

async function run() {
  const context = { scope: { boardId: "board-1" } };
  assert.equal((await adapters.create_text_node({ content: "标题" }, context)).method, "createNode");
  assert.equal(calls.at(-1).args[0], "text");
  assert.equal((await adapters.generate_image_to_gallery({
    prompt: "苹果",
    size: null,
    resolution: null,
    reference_node_ids: [],
    title: "生成图集",
  }, context)).method, "generateImageToGallery");
  assert.equal(calls.at(-1).name, "generateImageToGallery");
  assert.equal((await adapters.request_image_node_choice({
    node_id: "7",
    suggested_prompt: "新的苹果产品图",
  }, context)).method, "requestImageNodeChoice");
  assert.equal(calls.at(-1).name, "requestImageNodeChoice");
  assert.equal((await adapters.create_llm_node({ prompt: "总结" }, context)).method, "createNode");
  assert.equal(calls.at(-1).args[0], "llm");
  assert.equal((await adapters.create_comfy_node({ mode: "upscale2" }, context)).method, "createNode");
  assert.equal(calls.at(-1).args[0], "comfy");
  assert.equal((await adapters.create_media_node({ media_type: "audio" }, context)).method, "createNode");
  assert.equal(calls.at(-1).args[0], "audio");

  await adapters.focus_canvas_nodes({ node_ids: ["1"] }, context);
  assert.deepEqual(calls.at(-1), { name: "focusNodes", args: [["1"], context] });
  await adapters.organize_canvas_nodes({ node_ids: [], direction: "auto", gap: 80, center_view: true }, context);
  assert.equal(calls.at(-1).name, "organizeNodes");
  await adapters.crop_canvas_image({ node_id: "1", aspect_ratio: "1:1", position: "center", create_copy: true }, context);
  assert.equal(calls.at(-1).name, "cropImage");
  await adapters.open_canvas_mask_editor({ node_id: "1" }, context);
  assert.deepEqual(calls.at(-1), { name: "openMaskEditor", args: ["1", context] });

  await adapters.update_node({ node_id: "1", changes: { prompt: "新提示" } }, context);
  assert.deepEqual(calls.at(-1), { name: "updateNode", args: ["1", { prompt: "新提示" }, context] });
  await adapters.update_nodes({ node_ids: ["1", "2"], changes: { title: "统一" } }, context);
  assert.deepEqual(calls.at(-1).args[0], ["1", "2"]);
  await adapters.disconnect_nodes({ from_id: "1", to_id: "2" }, context);
  assert.equal(calls.at(-1).name, "disconnect");
  await adapters.delete_nodes({ node_ids: ["1"] }, context);
  assert.equal(calls.at(-1).name, "deleteNodes");

  const activated = await adapters.activate_canvas_skill({ skill_id: "poster-design", reason: "海报" }, context);
  assert.deepEqual(activated, { activated_skill_id: "poster-design", reason: "海报" });
  assert.equal(calls.at(-1).name, "deleteNodes", "skill activation must not touch the canvas API");

  console.log("Canvas agent tool adapter checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
