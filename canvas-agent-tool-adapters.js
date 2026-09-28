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
      create_image_node: (args, context) => canvasApi.createNode("image", normalizeImageArguments(args), context),
      generate_image_to_gallery: (args, context) => canvasApi.generateImageToGallery(normalizeImageArguments(args), context),
      request_image_node_choice: (args, context) => canvasApi.requestImageNodeChoice(args, context),
      request_design_brief: (args, context) => canvasApi.requestDesignBrief(args, context),
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
      remove_canvas_image_background: (args, context) => canvasApi.removeBackground(args, context),
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
      read_skill_reference: (args, context) => canvasApi.readSkillReference(args, context),
      canvas_director3d_apply_animation: (args, context) => canvasApi.director3dApplyAnimation(args, context),
    });
  }

  function normalizeChanges(args = {}) {
    const changes = args.changes && typeof args.changes === "object"
      ? { ...args.changes }
      : { ...args };
    delete changes.node_id;
    delete changes.node_ids;
    if (Object.prototype.hasOwnProperty.call(changes, "resolution") || changes.prompt) {
      const resolution = normalizeImageResolutionIntent(changes.resolution, changes.prompt);
      if (resolution) changes.resolution = resolution;
    }
    return changes;
  }

  function normalizeImageArguments(args = {}) {
    const normalized = { ...args };
    const resolution = normalizeImageResolutionIntent(normalized.resolution, normalized.prompt);
    if (resolution) normalized.resolution = resolution;
    return normalized;
  }

  function normalizeImageResolutionIntent(value, prompt = "") {
    const explicit = normalizeImageResolutionValue(value);
    if (explicit) return explicit;
    if (value !== null && value !== undefined && String(value).trim()) return "";
    return inferImageResolutionFromPrompt(prompt);
  }

  function normalizeImageResolutionValue(value) {
    const raw = String(value ?? "").trim().toLowerCase();
    if (!raw) return "";
    if (raw === "auto" || raw === "自动" || raw === "自动尺寸") return "auto";
    const exact = raw.match(/^exact:(\d{2,5})x(\d{2,5})$/);
    if (exact) return `exact:${Number(exact[1])}x${Number(exact[2])}`;
    const standard = raw.match(/^(512|[124])\s*(?:k)?\s*(?:清晰度|分辨率|画质)?$/i);
    if (!standard) return "";
    return standard[1] === "512" ? "512" : standard[1];
  }

  function inferImageResolutionFromPrompt(prompt) {
    const text = String(prompt || "");
    const matches = [...text.matchAll(/(?:^|[\s，,。；;：:（(])((?:512)|[124])\s*[kK](?:\s*(?:清晰度|分辨率|画质))?(?=$|[\s，,。；;：:）)])/g)];
    if (!matches.length) return "";
    return matches.at(-1)[1] === "512" ? "512" : matches.at(-1)[1];
  }

  return Object.freeze({ create, normalizeImageResolutionIntent });
});
