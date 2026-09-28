const assert = require("node:assert/strict");
const capabilities = require("../canvas-agent-capabilities");

assert.equal(capabilities.getCapability("node.text.create")?.tool?.name, "create_text_node");
assert.equal(capabilities.getCapability("image.generate-to-gallery")?.tool?.name, "generate_image_to_gallery");
assert.equal(capabilities.getCapability("image.existing-node-choice")?.tool?.name, "request_image_node_choice");
assert.equal(capabilities.getCapability("design.brief.request")?.tool?.name, "request_design_brief");
assert.equal(capabilities.getCapability("canvas.node.focus")?.tool?.name, "focus_canvas_nodes");
assert.equal(capabilities.getCapability("canvas.node.organize")?.tool?.name, "organize_canvas_nodes");
assert.equal(capabilities.getCapability("image.crop")?.tool?.name, "crop_canvas_image");
assert.equal(capabilities.getCapability("image.mask.edit")?.tool?.name, "open_canvas_mask_editor");
assert.equal(capabilities.getRisk("request_image_node_choice", {}), "safe");
assert.equal(capabilities.getRisk("focus_canvas_nodes", { node_ids: ["1"] }), "safe");
assert.equal(capabilities.getRisk("organize_canvas_nodes", { node_ids: [], direction: "auto", gap: 80, center_view: true }), "safe");
assert.equal(capabilities.getRisk("generate_image_to_gallery", {}), "paid");
assert.deepEqual(
  capabilities.getCapabilityByToolName("generate_image_to_gallery").tool.inputSchema.properties.model.type,
  ["string", "null"],
);
assert.equal(capabilities.getCapability("node.run")?.risk, "paid");
assert.equal(capabilities.getCapability("node.delete")?.risk, "destructive");
assert.equal(capabilities.getCapabilityByToolName("connect_nodes")?.id, "node.connect");
assert.equal(capabilities.getRisk("update_nodes", { node_ids: ["1", "2"] }), "bulk-overwrite");
assert.equal(capabilities.getRisk("update_node", { node_id: "1", changes: { x: 20 } }), "safe");
assert.equal(capabilities.getRisk("update_node", { node_id: "1", changes: { result_url: "new" } }), "bulk-overwrite");
assert.equal(capabilities.getRisk("update_gallery", { node_id: "1", image_ids: ["keep-one"], remove_image_ids: [] }), "bulk-overwrite");
assert.equal(capabilities.getRisk("update_gallery", { node_id: "1", image_ids: [], remove_image_ids: ["remove-one"] }), "destructive");
assert.equal(capabilities.getRisk("update_gallery", { node_id: "1", image_ids: [], remove_image_ids: [], add_node_ids: ["source-one"] }), "safe");
assert.equal(capabilities.getRisk("ungroup_nodes", { group_id: "group-1", node_ids: [] }), "destructive");

const galleryUpdate = capabilities.getCapabilityByToolName("update_gallery").tool.inputSchema.properties;
assert.ok(galleryUpdate.add_node_ids, "update_gallery must support adding current-canvas image outputs");
assert.ok(galleryUpdate.active_image_id, "update_gallery must support switching the active gallery image");
assert.equal(galleryUpdate.add_node_ids.maxItems, 40);

const cropImage = capabilities.getCapabilityByToolName("crop_canvas_image").tool.inputSchema.properties;
assert.deepEqual(cropImage.aspect_ratio.type, ["string", "null"]);
assert.equal(cropImage.position.enum.includes("center"), true);
assert.equal(cropImage.create_copy.type, "boolean");

const textTools = capabilities.getToolDefinitions(["node.text.create"]);
assert.equal(textTools.length, 1);
assert.equal(textTools[0].type, "function");
assert.equal(textTools[0].strict, true);
assert.equal(textTools[0].parameters.additionalProperties, false);
assert.equal(textTools[0].parameters.properties.title.type[1], "null");
assert.equal(textTools[0].parameters.required.includes("title"), true);
assert.equal(textTools[0].parameters.required.includes("x"), true);
assert.equal(textTools[0].parameters.required.includes("y"), true);

const updateChanges = capabilities.getCapabilityByToolName("update_node").tool.inputSchema.properties.changes.properties;
assert.match(updateChanges.resolution.description, /2K.*[“"]2[”"]/, "Agent schema must explain the canonical 2K value");
["comfy_mode", "comfy_resolution", "comfy_padding", "comfy_qwen_angle"].forEach((field) => {
  assert.ok(updateChanges[field], `update_node must expose ${field}`);
});
assert.ok(capabilities.getCapabilityByToolName("create_comfy_node").tool.inputSchema.properties.prompt, "Comfy prompt must remain an executable contract");

const toolNames = capabilities.CAPABILITY_REGISTRY.map((item) => item.tool.name);
assert.equal(new Set(toolNames).size, toolNames.length, "tool names must be unique");
assert.equal(new Set(capabilities.CAPABILITY_REGISTRY.map((item) => item.id)).size, capabilities.CAPABILITY_REGISTRY.length, "capability ids must be unique");
assert.deepEqual(
  capabilities.getCapabilityIdsForToolNames(["create_text_node", "run_canvas_node", "missing"]),
  ["node.text.create", "node.run"],
);

const nodeArrayTools = ["focus_canvas_nodes", "update_nodes", "duplicate_nodes", "move_nodes", "arrange_nodes", "organize_canvas_nodes", "group_nodes", "delete_nodes"];
nodeArrayTools.forEach((name) => {
  const tool = capabilities.getCapabilityByToolName(name)?.tool;
  assert.ok(tool, `${name} must be registered`);
  const nodeIds = tool.inputSchema.properties.node_ids;
  assert.equal(nodeIds.maxItems, 40, `${name} must cap target nodes at 40`);
});

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
].forEach((name) => assert.ok(capabilities.getCapabilityByToolName(name), `${name} must be available`));

assert.equal(capabilities.getCapability("skill.reference.read")?.tool?.name, "read_skill_reference");
assert.equal(capabilities.getRisk("read_skill_reference", { skill_id: "poster-design", path: "references/a.md" }), "safe");
const skillReferenceSchema = capabilities.getCapabilityByToolName("read_skill_reference").tool.inputSchema;
assert.ok(skillReferenceSchema.required.includes("path"), "reading a skill reference should require an explicit path");

console.log("Canvas agent capability registry checks passed.");
