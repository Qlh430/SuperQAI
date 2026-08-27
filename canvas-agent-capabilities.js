(function initCanvasAgentCapabilities(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasAgentCapabilities = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasAgentCapabilities() {
  const MAX_BATCH_TARGETS = 40;
  const TOOL_TITLES = Object.freeze({
    create_text_node: "创建文字节点",
    create_image_node: "创建图片节点",
    generate_image_to_gallery: "生成图片并创建图集",
    request_image_node_choice: "定位相关生图节点",
    create_llm_node: "创建 LLM 节点",
    create_comfy_node: "创建 ComfyUI 节点",
    create_video_node: "创建视频节点",
    create_media_node: "创建媒体节点",
    create_gallery_node: "创建图集节点",
    create_loop_node: "创建循环节点",
    create_grid_editor_node: "创建宫格编辑节点",
    focus_canvas_nodes: "定位画布节点",
    organize_canvas_nodes: "整理画布节点",
    crop_canvas_image: "裁切图片",
    open_canvas_mask_editor: "打开遮罩编辑器",
    update_node: "更新节点",
    update_nodes: "批量更新节点",
    duplicate_nodes: "复制节点",
    move_nodes: "移动节点",
    arrange_nodes: "排列节点",
    connect_nodes: "连接节点",
    disconnect_nodes: "断开节点",
    set_reference_order: "调整参考顺序",
    group_nodes: "分组节点",
    ungroup_nodes: "解散节点分组",
    update_gallery: "更新图集",
    update_grid_editor: "更新宫格编辑器",
    extract_grid_to_gallery: "提取宫格到图集",
    run_canvas_node: "执行画布节点",
    delete_nodes: "删除节点",
    activate_canvas_skill: "启用专业 Skill",
  });
  const MCP_TOOL_OUTPUT_SCHEMA = Object.freeze({
    type: "object",
    properties: Object.freeze({
      ok: Object.freeze({ type: "boolean" }),
      tool: Object.freeze({ type: "string" }),
      code: Object.freeze({ type: ["string", "null"] }),
      error: Object.freeze({ type: ["string", "null"] }),
    }),
    required: Object.freeze(["ok", "tool"]),
    additionalProperties: true,
  });

  const CAPABILITY_REGISTRY = Object.freeze([
    defineCapability("node.text.create", "create_text_node", "在当前画布创建文字节点。", "safe", {
      content: stringSchema("文字内容"),
      x: nullableNumberSchema("画布 X 坐标"),
      y: nullableNumberSchema("画布 Y 坐标"),
    }),
    defineCapability("node.image.create", "create_image_node", "创建图片生成或编辑节点，可连接当前画布参考节点。", "safe", {
      prompt: stringSchema("完整图片提示词"),
      model: nullableStringSchema("图片模型；使用画布默认值时传 null"),
      size: nullableStringSchema("尺寸或比例；使用默认值时传 null"),
      resolution: nullableStringSchema("清晰度；使用默认值时传 null"),
      reference_node_ids: stringArraySchema("参考节点 ID"),
      x: nullableNumberSchema("画布 X 坐标"),
      y: nullableNumberSchema("画布 Y 坐标"),
    }),
    defineCapability("image.generate-to-gallery", "generate_image_to_gallery", "根据明确的直接生图要求创建图片节点、执行一次生成并把真实结果加入图集。", "paid", {
      prompt: stringSchema("完整图片提示词"),
      model: nullableStringSchema("用户明确指定的图片模型；未指定时传 null，由执行层选择 image2"),
      size: nullableStringSchema("尺寸或比例；自动选择时传 null"),
      resolution: nullableStringSchema("清晰度；自动选择时传 null"),
      reference_node_ids: stringArraySchema("当前画布参考节点 ID"),
      title: nullableStringSchema("图集标题；使用默认值时传 null"),
    }),
    defineCapability("image.existing-node-choice", "request_image_node_choice", "定位并高亮当前画布中的相关生图节点，让用户决定原样再生成、修改后生成或新建生成。", "safe", {
      node_id: stringSchema("当前画布中相关图片生成节点 ID"),
      suggested_prompt: stringSchema("根据用户当前需求整理出的新提示词"),
    }),
    defineCapability("node.llm.create", "create_llm_node", "创建 LLM 文本处理节点。", "safe", {
      prompt: stringSchema("LLM 任务提示词"),
      model: nullableStringSchema("LLM 模型；使用画布默认值时传 null"),
      reference_node_ids: stringArraySchema("参考节点 ID"),
      x: nullableNumberSchema("画布 X 坐标"),
      y: nullableNumberSchema("画布 Y 坐标"),
    }),
    defineCapability("node.comfy.create", "create_comfy_node", "创建 ComfyUI 工作流节点。", "safe", {
      mode: nullableStringSchema("ComfyUI 模式；使用默认值时传 null"),
      resolution: nullableStringSchema("ComfyUI 输出尺寸；使用默认值时传 null"),
      padding: nullableComfyPaddingSchema("扩图边距；不设置时传 null"),
      qwen_angle: nullableComfyAngleSchema("Qwen 镜头角度；不设置时传 null"),
      prompt: nullableStringSchema("Flux2 Klein 图片编辑提示词；其他工作流传 null"),
      reference_node_ids: stringArraySchema("参考节点 ID"),
      x: nullableNumberSchema("画布 X 坐标"),
      y: nullableNumberSchema("画布 Y 坐标"),
    }),
    defineCapability("node.video.create", "create_video_node", "创建 MiniMax H3 视频生成节点。", "safe", {
      prompt: stringSchema("视频动作、镜头和氛围提示词"),
      aspect_ratio: enumSchema("视频比例", ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"]),
      duration: numberSchema("视频时长", 5, 15),
      reference_node_ids: stringArraySchema("参考节点 ID"),
      x: nullableNumberSchema("画布 X 坐标"),
      y: nullableNumberSchema("画布 Y 坐标"),
    }),
    defineCapability("node.media.create", "create_media_node", "使用当前画布已有素材创建图片、视频或音频节点。", "safe", {
      media_type: enumSchema("媒体类型", ["image", "video", "audio"]),
      source_node_id: stringSchema("当前画布素材来源节点 ID"),
      name: nullableStringSchema("节点名称"),
      x: nullableNumberSchema("画布 X 坐标"),
      y: nullableNumberSchema("画布 Y 坐标"),
    }),
    defineCapability("node.gallery.create", "create_gallery_node", "创建图集节点。", "safe", {
      title: stringSchema("图集标题"),
      x: nullableNumberSchema("画布 X 坐标"),
      y: nullableNumberSchema("画布 Y 坐标"),
    }),
    defineCapability("node.loop.create", "create_loop_node", "创建循环节点。", "safe", pointProperties()),
    defineCapability("node.grid.create", "create_grid_editor_node", "从当前画布图片创建宫格编辑节点。", "safe", {
      source_node_id: stringSchema("来源图片节点 ID"),
      rows: integerSchema("行数", 1, 12),
      columns: integerSchema("列数", 1, 12),
      x: nullableNumberSchema("画布 X 坐标"),
      y: nullableNumberSchema("画布 Y 坐标"),
    }),
    defineCapability("canvas.node.focus", "focus_canvas_nodes", "定位、高亮并将当前画布节点居中显示；不会移动节点。", "safe", {
      node_ids: stringArraySchema("要定位的当前画布节点 ID", MAX_BATCH_TARGETS),
    }, MAX_BATCH_TARGETS),
    defineCapability("canvas.node.organize", "organize_canvas_nodes", "将当前画布或指定节点按清晰布局自动整理，并可将视图居中到整理结果。未提供节点时整理当前画布的普通节点。", "safe", {
      node_ids: stringArraySchema("要整理的节点 ID；传空数组时整理当前画布", MAX_BATCH_TARGETS),
      direction: enumSchema("排列方式", ["auto", "row", "column", "grid"]),
      gap: numberSchema("节点间距", 24, 800),
      center_view: booleanSchema("整理后是否定位到这些节点"),
    }, MAX_BATCH_TARGETS),
    defineCapability("image.crop", "crop_canvas_image", "按比例裁切当前画布图片；默认保留原图并创建裁切副本。未指定比例时打开交互裁切器。", "safe", {
      node_id: stringSchema("目标图片节点 ID"),
      aspect_ratio: nullableStringSchema("裁切比例，例如 1:1、4:5、16:9；需要手动裁切时传 null"),
      position: enumSchema("裁切构图位置", ["center", "top", "bottom", "left", "right"]),
      create_copy: booleanSchema("是否保留原图并创建裁切副本"),
    }),
    defineCapability("image.mask.edit", "open_canvas_mask_editor", "定位当前画布图片并打开遮罩编辑器，供用户手绘需要编辑的区域。", "safe", {
      node_id: stringSchema("目标图片节点 ID"),
    }),
    defineCapability("node.update", "update_node", "更新当前画布中的一个节点。", getUpdateRisk, {
      node_id: stringSchema("目标节点 ID"),
      changes: changesSchema("需要修改的字段"),
    }),
    defineCapability("node.batch.update", "update_nodes", "批量更新当前画布节点。", "bulk-overwrite", {
      node_ids: stringArraySchema("目标节点 ID", MAX_BATCH_TARGETS),
      changes: changesSchema("应用到各节点的字段"),
    }, MAX_BATCH_TARGETS),
    defineCapability("node.duplicate", "duplicate_nodes", "复制当前画布节点。", "safe", {
      node_ids: stringArraySchema("要复制的节点 ID", MAX_BATCH_TARGETS),
      offset_x: numberSchema("副本横向偏移", -4000, 4000),
      offset_y: numberSchema("副本纵向偏移", -4000, 4000),
    }, MAX_BATCH_TARGETS),
    defineCapability("node.move", "move_nodes", "移动当前画布节点。", "safe", {
      node_ids: stringArraySchema("要移动的节点 ID", MAX_BATCH_TARGETS),
      delta_x: numberSchema("横向移动距离", -100000, 100000),
      delta_y: numberSchema("纵向移动距离", -100000, 100000),
    }, MAX_BATCH_TARGETS),
    defineCapability("node.arrange", "arrange_nodes", "按行、列或宫格排列当前画布节点。", "safe", {
      node_ids: stringArraySchema("节点 ID，保持期望顺序", MAX_BATCH_TARGETS),
      direction: enumSchema("排列方式", ["row", "column", "grid"]),
      gap: numberSchema("节点间距", 24, 800),
      start_x: nullableNumberSchema("起始 X 坐标"),
      start_y: nullableNumberSchema("起始 Y 坐标"),
    }, MAX_BATCH_TARGETS),
    defineCapability("node.connect", "connect_nodes", "连接两个当前画布节点。", "safe", {
      from_id: stringSchema("上游节点 ID"),
      to_id: stringSchema("下游节点 ID"),
      to_port: enumSchema("下游端口", ["input", "prompt"]),
    }),
    defineCapability("node.disconnect", "disconnect_nodes", "断开两个当前画布节点。", "safe", {
      from_id: stringSchema("上游节点 ID"),
      to_id: stringSchema("下游节点 ID"),
    }),
    defineCapability("node.reference.order", "set_reference_order", "调整节点参考素材顺序。", "safe", {
      node_id: stringSchema("目标节点 ID"),
      reference_node_ids: stringArraySchema("新的参考节点顺序", MAX_BATCH_TARGETS),
    }, MAX_BATCH_TARGETS),
    defineCapability("node.group", "group_nodes", "创建分组或把节点加入现有分组。", "safe", {
      node_ids: stringArraySchema("成员节点 ID", MAX_BATCH_TARGETS),
      group_id: nullableStringSchema("已有分组 ID；新建分组时传 null"),
      title: nullableStringSchema("新分组标题"),
    }, MAX_BATCH_TARGETS),
    defineCapability("node.ungroup", "ungroup_nodes", "解散分组或移出分组成员。", "destructive", {
      group_id: stringSchema("分组节点 ID"),
      node_ids: stringArraySchema("要移出的成员；解散全部时传空数组", MAX_BATCH_TARGETS),
    }, MAX_BATCH_TARGETS),
    defineCapability("gallery.update", "update_gallery", "更新图集标题、布局、图片、顺序或当前展示图。", getGalleryRisk, {
      node_id: stringSchema("图集节点 ID"),
      title: nullableStringSchema("新标题"),
      columns: nullableIntegerSchema("列数", 1, 12),
      gap: nullableNumberSchema("间距"),
      image_ids: stringArraySchema("保留并排序后的图片 ID；不改变时传空数组", MAX_BATCH_TARGETS),
      remove_image_ids: stringArraySchema("要移除的图片 ID", MAX_BATCH_TARGETS),
      add_node_ids: stringArraySchema("要追加到图集的当前画布图片节点 ID", MAX_BATCH_TARGETS),
      active_image_id: nullableStringSchema("要设为当前展示图的图片 ID；也可传刚追加的来源节点 ID；不改变时传 null"),
    }, MAX_BATCH_TARGETS),
    defineCapability("grid.update", "update_grid_editor", "更新宫格规格、间距和单格缩放。", getGridRisk, {
      node_id: stringSchema("宫格节点 ID"),
      rows: nullableIntegerSchema("行数", 1, 12),
      columns: nullableIntegerSchema("列数", 1, 12),
      uniform_gap: nullableNumberSchema("统一间距"),
      cell_key: nullableStringSchema("单格键"),
      cell_zoom: nullableNumberSchema("单格缩放"),
    }),
    defineCapability("grid.extract", "extract_grid_to_gallery", "把宫格切片提取到图集。", "safe", oneNodeProperties()),
    defineCapability("node.run", "run_canvas_node", "执行当前画布生成节点，该操作可能产生费用。", "paid", oneNodeProperties()),
    defineCapability("node.delete", "delete_nodes", "删除当前画布节点。", "destructive", {
      node_ids: stringArraySchema("要删除的节点 ID", MAX_BATCH_TARGETS),
    }, MAX_BATCH_TARGETS),
    defineCapability("skill.activate", "activate_canvas_skill", "按需激活一个业务 Skill。", "safe", {
      skill_id: stringSchema("业务 Skill ID"),
      reason: stringSchema("激活原因"),
    }),
  ]);

  const CAPABILITY_BY_ID = new Map(CAPABILITY_REGISTRY.map((item) => [item.id, item]));
  const CAPABILITY_BY_TOOL = new Map(CAPABILITY_REGISTRY.map((item) => [item.tool.name, item]));

  function defineCapability(id, toolName, description, risk, properties, maxTargets = 1) {
    const destructive = typeof risk === "function" || risk === "destructive" || risk === "bulk-overwrite";
    return Object.freeze({
      id,
      risk,
      maxTargets,
      tool: Object.freeze({
        name: toolName,
        title: TOOL_TITLES[toolName] || description.replace(/[。.!！]+$/, ""),
        description,
        inputSchema: Object.freeze({
          type: "object",
          properties: Object.freeze(properties),
          required: Object.freeze(Object.keys(properties)),
          additionalProperties: false,
        }),
        outputSchema: MCP_TOOL_OUTPUT_SCHEMA,
        annotations: Object.freeze({
          readOnlyHint: false,
          destructiveHint: destructive,
          idempotentHint: false,
          openWorldHint: risk === "paid",
        }),
      }),
    });
  }

  function stringSchema(description) {
    return { type: "string", description };
  }

  function nullableStringSchema(description) {
    return { type: ["string", "null"], description };
  }

  function numberSchema(description, minimum = -100000, maximum = 100000) {
    return { type: "number", description, minimum, maximum };
  }

  function nullableNumberSchema(description, minimum = -100000, maximum = 100000) {
    return { type: ["number", "null"], description, minimum, maximum };
  }

  function integerSchema(description, minimum, maximum) {
    return { type: "integer", description, minimum, maximum };
  }

  function nullableIntegerSchema(description, minimum, maximum) {
    return { type: ["integer", "null"], description, minimum, maximum };
  }

  function enumSchema(description, values) {
    return { type: "string", enum: values, description };
  }

  function booleanSchema(description) {
    return { type: "boolean", description };
  }

  function stringArraySchema(description, maxItems = MAX_BATCH_TARGETS) {
    return { type: "array", description, items: { type: "string" }, maxItems };
  }

  function pointProperties() {
    return {
      x: nullableNumberSchema("画布 X 坐标"),
      y: nullableNumberSchema("画布 Y 坐标"),
    };
  }

  function oneNodeProperties() {
    return { node_id: stringSchema("目标节点 ID") };
  }

  function changesSchema(description) {
    return {
      type: "object",
      description,
      properties: {
        content: nullableStringSchema("文字内容"),
        prompt: nullableStringSchema("提示词"),
        title: nullableStringSchema("标题"),
        model: nullableStringSchema("模型"),
        size: nullableStringSchema("尺寸或比例"),
        resolution: nullableStringSchema("清晰度"),
        aspect_ratio: nullableStringSchema("画面比例"),
        duration: nullableNumberSchema("时长", 1, 300),
        comfy_mode: nullableStringSchema("ComfyUI 工作流模式"),
        comfy_resolution: nullableStringSchema("ComfyUI 输出尺寸"),
        comfy_padding: nullableComfyPaddingSchema("ComfyUI 扩图边距"),
        comfy_qwen_angle: nullableComfyAngleSchema("ComfyUI Qwen 镜头角度"),
        x: nullableNumberSchema("绝对 X 坐标"),
        y: nullableNumberSchema("绝对 Y 坐标"),
        result_url: nullableStringSchema("替换生成结果地址"),
      },
      required: ["content", "prompt", "title", "model", "size", "resolution", "aspect_ratio", "duration", "comfy_mode", "comfy_resolution", "comfy_padding", "comfy_qwen_angle", "x", "y", "result_url"],
      additionalProperties: false,
    };
  }

  function nullableComfyPaddingSchema(description) {
    return {
      type: ["object", "null"],
      description,
      properties: {
        left: numberSchema("左侧扩展", 0, 1600),
        top: numberSchema("顶部扩展", 0, 1600),
        right: numberSchema("右侧扩展", 0, 1600),
        bottom: numberSchema("底部扩展", 0, 1600),
      },
      required: ["left", "top", "right", "bottom"],
      additionalProperties: false,
    };
  }

  function nullableComfyAngleSchema(description) {
    return {
      type: ["object", "null"],
      description,
      properties: {
        horizontal: numberSchema("水平角", -180, 180),
        vertical: numberSchema("垂直角", -30, 60),
        zoom: numberSchema("缩放", 0, 10),
      },
      required: ["horizontal", "vertical", "zoom"],
      additionalProperties: false,
    };
  }

  function getUpdateRisk(args = {}) {
    const changes = args.changes && typeof args.changes === "object" ? args.changes : args;
    return changes.result_url ? "bulk-overwrite" : "safe";
  }

  function getGalleryRisk(args = {}) {
    if (Array.isArray(args.remove_image_ids) && args.remove_image_ids.length) return "destructive";
    return Array.isArray(args.image_ids) && args.image_ids.length ? "bulk-overwrite" : "safe";
  }

  function getGridRisk(args = {}) {
    return Number.isInteger(args.rows) || Number.isInteger(args.columns) ? "bulk-overwrite" : "safe";
  }

  function getCapability(id) {
    return CAPABILITY_BY_ID.get(String(id || "")) || null;
  }

  function getCapabilityByToolName(name) {
    return CAPABILITY_BY_TOOL.get(String(name || "")) || null;
  }

  function getMcpTools(ids) {
    return Array.from(new Set(Array.isArray(ids) ? ids.map(String) : []))
      .map((id) => getCapability(id)?.tool)
      .filter(Boolean);
  }

  function getToolDefinitions(ids) {
    return getMcpTools(ids).map((tool) => Object.freeze({
      type: "function",
      name: tool.name,
      description: tool.description,
      strict: true,
      parameters: tool.inputSchema,
    }));
  }

  function getRisk(toolName, args = {}) {
    const capability = getCapabilityByToolName(toolName);
    if (!capability) return "safe";
    return typeof capability.risk === "function" ? capability.risk(args) : capability.risk;
  }

  function getCapabilityIdsForToolNames(names) {
    return Array.from(new Set(Array.isArray(names) ? names.map(String) : []))
      .map((name) => getCapabilityByToolName(name)?.id)
      .filter(Boolean);
  }

  return Object.freeze({
    MAX_BATCH_TARGETS,
    CAPABILITY_REGISTRY,
    getCapability,
    getCapabilityByToolName,
    getMcpTools,
    getToolDefinitions,
    getRisk,
    getCapabilityIdsForToolNames,
  });
});
