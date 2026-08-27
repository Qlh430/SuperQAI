(function initCanvasAgentToolAdapters(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasAgentToolAdapters = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasAgentToolAdaptersApi() {
  function create(options = {}) {
    const canvasApi = options.canvasApi;
    if (!canvasApi) throw new Error("Canvas Agent tool adapters require canvasApi.");
    return Object.freeze({
      create_text_node: (args, context) => canvasApi.createNode("text", args, context),
      create_image_node: (args, context) => canvasApi.createNode("image", args, context),
      generate_image_to_gallery: (args, context) => canvasApi.generateImageToGallery(args, context),
      request_image_node_choice: (args, context) => canvasApi.requestImageNodeChoice(args, context),
      create_llm_node: (args, context) => canvasApi.createNode("llm", args, context),
      create_comfy_node: (args, context) => canvasApi.createNode("comfy", args, context),
      create_video_node: (args, context) => canvasApi.createNode("minimax-h3", args, context),
      create_media_node: (args, context) => canvasApi.createNode(String(args.media_type || "image"), args, context),
      create_gallery_node: (args, context) => canvasApi.createNode("gallery", args, context),
      create_loop_node: (args, context) => canvasApi.createNode("loop", args, context),
      create_grid_editor_node: (args, context) => canvasApi.createNode("grid-editor", args, context),
      focus_canvas_nodes: (args, context) => canvasApi.focusNodes(args.node_ids, context),
      organize_canvas_nodes: (args, context) => canvasApi.organizeNodes(args, context),
      crop_canvas_image: (args, context) => canvasApi.cropImage(args, context),
      open_canvas_mask_editor: (args, context) => canvasApi.openMaskEditor(args.node_id, context),
      update_node: (args, context) => canvasApi.updateNode(args.node_id, normalizeChanges(args), context),
      update_nodes: (args, context) => canvasApi.updateNode(args.node_ids, normalizeChanges(args), context),
      duplicate_nodes: (args, context) => canvasApi.duplicateNodes(args, context),
      move_nodes: (args, context) => canvasApi.moveNodes(args, context),
      arrange_nodes: (args, context) => canvasApi.arrangeNodes(args, context),
      connect_nodes: (args, context) => canvasApi.connect(args, context),
      disconnect_nodes: (args, context) => canvasApi.disconnect(args, context),
      set_reference_order: (args, context) => canvasApi.setReferenceOrder(args, context),
      group_nodes: (args, context) => canvasApi.group(args, context),
      ungroup_nodes: (args, context) => canvasApi.ungroup(args, context),
      update_gallery: (args, context) => canvasApi.updateGallery(args, context),
      update_grid_editor: (args, context) => canvasApi.updateGrid(args, context),
      extract_grid_to_gallery: (args, context) => canvasApi.extractGrid(args, context),
      run_canvas_node: (args, context) => canvasApi.runNode(args.node_id, context),
      delete_nodes: (args, context) => canvasApi.deleteNodes(args.node_ids, context),
      activate_canvas_skill: async (args) => ({
        activated_skill_id: String(args.skill_id || ""),
        reason: String(args.reason || ""),
      }),
    });
  }

  function normalizeChanges(args = {}) {
    if (args.changes && typeof args.changes === "object") return args.changes;
    const changes = { ...args };
    delete changes.node_id;
    delete changes.node_ids;
    return changes;
  }

  return Object.freeze({ create });
});
