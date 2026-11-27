(function initCanvasAgentCapabilities(root, factory) {
  const policy = typeof module === "object" && module.exports ? require('./canvas-feature-registry.js') : root.CanvasNodeCreationPolicy;
  const api = factory(policy);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasAgentCapabilities = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasAgentCapabilities(creationPolicy) {
  const MAX_BATCH_TARGETS = 40;
  // Kept in sync with canvas-director3d.js; the director stage check asserts
  // that these two catalogs never drift apart.
  const DIRECTOR3D_SHOT_PRESETS = Object.freeze([
    "current", "front-full", "front-medium", "front-close", "side-medium", "side-close", "back-medium",
    "overhead-full", "overhead-45", "low-medium", "low-wide", "shoulder-left", "shoulder-right",
    "bird-eye", "dutch",
  ]);
  const DIRECTOR3D_CAMERA_MOTIONS = Object.freeze([
    "follow", "orbit-follow", "fps-orbit", "handheld-follow", "dolly-in", "dolly-out", "crane-up",
    "hitchcock", "static",
  ]);
  const IMAGE_RESOLUTION_DESCRIPTION = "图片输出档位；必须传标准值 512/1/2/4/auto，用户要求 2K 时传“2”，未指定时传 null";
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
    upscale_canvas_image: "图片超清",
    remove_canvas_image_background: "AI 抠图",
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
    save_h3_commerce_package: "保存 H3 带货方案文件",
    fill_h3_commerce_node: "填充选中的 H3 带货节点",
    delete_nodes: "删除节点",
    request_design_brief: "确认设计需求",
    request_creative_batch_confirmation: "确认十种创意方案",
    activate_canvas_skill: "启用专业 Skill",
    read_skill_reference: "读取流程参考文档",
    canvas_director3d_apply_animation: "编排 3D 导演台",
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
      title: nullableStringSchema("文字节点名称；不指定时使用默认名称"),
      x: nullableNumberSchema("画布 X 坐标"),
      y: nullableNumberSchema("画布 Y 坐标"),
    }),
    defineCapability("node.image.create", "create_image_node", "创建图片生成或编辑节点，可连接当前画布参考节点。", "safe", {
      prompt: stringSchema("完整图片提示词"),
      title: nullableStringSchema("最终节点名称；不指定时传 null"),
      model: nullableStringSchema("图片模型；使用画布默认值时传 null"),
      size: nullableStringSchema("尺寸或比例；使用默认值时传 null"),
      resolution: nullableStringSchema(IMAGE_RESOLUTION_DESCRIPTION),
      node_key: nullableStringSchema("同一工作流重试时保持稳定的节点标识"),
      reference_node_ids: stringArraySchema("参考节点 ID"),
      x: nullableNumberSchema("画布 X 坐标"),
      y: nullableNumberSchema("画布 Y 坐标"),
    }),
    defineCapability("image.generate-to-gallery", "generate_image_to_gallery", "根据明确的直接生图要求创建图片节点、执行一次生成并把真实结果加入图集。", "paid", {
      prompt: stringSchema("完整图片提示词"),
      model: nullableStringSchema("用户明确指定的图片模型；未指定时传 null，由执行层选择 image2"),
      size: nullableStringSchema("尺寸或比例；自动选择时传 null"),
      resolution: nullableStringSchema(IMAGE_RESOLUTION_DESCRIPTION),
      reference_node_ids: stringArraySchema("当前画布参考节点 ID"),
      title: nullableStringSchema("图集标题；使用默认值时传 null"),
    }),
    defineCapability("image.existing-node-choice", "request_image_node_choice", "定位并高亮当前画布中的相关生图节点，让用户决定修改后生成或新建生成。", "safe", {
      node_id: stringSchema("当前画布中相关图片生成节点 ID"),
      suggested_prompt: stringSchema("根据用户当前需求整理出的新提示词"),
    }),
    defineCapability("design.brief.request", "request_design_brief", "在创建设计节点前展示结构化需求确认卡；只收集必要信息，不创建节点，也不产生费用。", "safe", {
      workflow: enumSchema("设计流程", ["poster", "natural-aesthetic-product-photography", "skill"]),
      poster_type: nullableEnumSchema("海报类型；信息不足时传 null", ["product", "brand", "promotion", "festival", "event", "other"]),
      source_node_ids: stringArraySchema("本轮已读取并对应实际图片附件的素材节点 ID，按视觉附件顺序给出；无参考图时传空数组", 8),
      image_prompt: stringSchema("当前创作流程最终需要写入图片生成节点的完整提示词；不创建图片节点时传空字符串"),
      known_context: stringSchema("已从用户和当前画布确认的信息，使用简洁中文分点"),
      questions: designBriefQuestionsSchema("只列真正影响结果且尚缺失的问题；信息已经完整时传空数组"),
      summary: stringSchema("面向用户的设计方案摘要；没有额外建议时传空字符串"),
    }),
    defineCapability("creative.batch.confirm", "request_creative_batch_confirmation",
      "为商业产品摄影十种创意方案提交严格十项的可编辑预览；只保存方案并展示确认卡，不创建画布节点、不生成图片、不产生费用。仅该 Skill 的明确工作流可用。",
      "safe", {
        product_name: stringSchema("从产品原图识别的产品名称；不确定时标注未知，不猜品牌或型号"),
        product_analysis: stringSchema("基于本轮产品参考图识别商品外观，列出必须保真的结构、颜色、材质、标识及可见配件；未知事实明确标未知"),
        source_node_ids: stringArraySchema("同一真实产品原图的当前画布来源节点，必须对应本轮视觉附件", 1),
        items: {
          type: "array",
          description: "严格十种、顺序编号的差异化摄影创意；每项单独预览及绑定一个独立生图节点",
          minItems: 10,
          maxItems: 10,
          items: {
            type: "object",
            properties: {
              slot: integerSchema("稳定序号", 1, 10),
              direction: stringSchema("创意方向名称，不含序号"),
              summary: stringSchema("该方向的简要设计说明"),
              prompt: stringSchema("对应完整中文生图提示词，包含摄影参数和产品保真约束；不得截断"),
            },
            required: ["slot", "direction", "summary", "prompt"],
            additionalProperties: false,
          },
        },
      }, 10),
    defineCapability("node.llm.create", "create_llm_node", "创建 LLM 文本处理节点。", "safe", {
      prompt: stringSchema("LLM 任务提示词"),
      model: nullableStringSchema("LLM 模型；使用画布默认值时传 null"),
      reference_node_ids: stringArraySchema("参考节点 ID"),
      x: nullableNumberSchema("画布 X 坐标"),
      y: nullableNumberSchema("画布 Y 坐标"),
    }),
    defineCapability("node.comfy.create", "create_comfy_node", "创建 ComfyUI 工作流节点，不执行。扩图可使用 outpaint 模式，连接原图和配置边距后再按授权执行节点。", "safe", {
      mode: nullableStringSchema("ComfyUI 模式；扩图传 outpaint，使用默认值时传 null"),
      resolution: nullableStringSchema("ComfyUI 输出尺寸；使用默认值时传 null"),
      padding: nullableComfyPaddingSchema("扩图边距；不设置时传 null"),
      qwen_angle: nullableComfyAngleSchema("Qwen 镜头角度；不设置时传 null"),
      prompt: nullableStringSchema("Flux2 Klein 图片编辑提示词；其他工作流传 null"),
      reference_node_ids: stringArraySchema("参考节点 ID"),
      x: nullableNumberSchema("画布 X 坐标"),
      y: nullableNumberSchema("画布 Y 坐标"),
    }),
    defineCapability("node.video.create", "create_video_node", "创建现有视频生成节点，不执行生成。通用视频工作流使用 engine=api；流程明确采用 H3 时使用 comfyui。完整提示词直接保存在节点中。reference_node_ids 自动建立真实连线，支持连接尚未出图的图片生成节点，此时等待上游真实结果，不能用商品图冒充模特图。", "safe", {
      engine: nullableEnumSchema("api 为现有 API 视频节点，comfyui 为 MiniMax H3，h3-commerce 为独立带货模式；旧调用未指定时兼容 H3", ["api", "comfyui", "h3-commerce"]),
      title: nullableStringSchema("最终节点名称；不指定时传 null"),
      model: nullableStringSchema("API 视频模型 ID；使用现有默认接入时传 null，不得编造模型 ID"),
      resolution: nullableStringSchema("API 视频清晰度；按所选模型能力设置，使用默认值时传 null"),
      prompt: stringSchema("完整的视频动作、镜头和一致性提示词，直接保存在该生成节点中"),
      aspect_ratio: enumSchema("视频比例", ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"]),
      duration: nullableNumberSchema("单次生成片段秒数；API 按实际模型范围设置，null 使用默认值；H3 支持 5-15 秒。不得按 H3 上限拆分其它模型的项目", 1),
      reference_node_ids: stringArraySchema("输入节点 ID；API 接受一张首帧图片或一个待出图的图片生成节点；H3 支持图片、视频、音频参考。传入后自动连线"),
      x: nullableNumberSchema("画布 X 坐标"),
      y: nullableNumberSchema("画布 Y 坐标"),
    }),
    defineCapability("video.h3-commerce.package.save", "save_h3_commerce_package", "将通过事实和素材核对的 H3 带货方案保存为四个 UTF-8 文件，关联选中的带货节点和按槽排列的四个图片节点。", "safe", {
      node_id: stringSchema("当前唯一选中的 H3 带货视频节点 ID"),
      image_node_ids: {
        type: "array",
        description: "按开场场景、商品主图、补充图、细节图顺序的四个当前画布图片节点 ID",
        minItems: 4,
        maxItems: 4,
        items: { type: "string" },
      },
      prompt_a: stringSchema("完整 prompt-a.txt 内容"),
      prompt_b: stringSchema("完整 prompt-b.txt 内容"),
      package_md: stringSchema("完整 package.md 内容"),
      result_json: stringSchema("正式 result.json 的 JSON 对象字符串，包含 Skill 规定的结构化字段。prompt_a、prompt_b 由服务直接填入，避免重复输出。"),
    }),
    defineCapability("video.h3-commerce.node.fill", "fill_h3_commerce_node", "把已保存带货方案的两段原文和四张有序参考图填入当前唯一选中的目标节点；仅填充并保存画布。", "safe", {
      node_id: stringSchema("当前唯一选中的 H3 带货视频节点 ID"),
      package_id: stringSchema("save_h3_commerce_package 成功返回、且绑定此节点的方案编号"),
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
    defineCapability("image.upscale", "upscale_canvas_image", "调用画布超清插件放大一张已有图片，保留原图和来源连线，不重绘。使用已选或引用的图片节点 ID。未给出目标长边时传 null，由插件返回当前规格并收集选择；用户明确给出 2K 或 4K 时分别传 2048 或 4096，进入执行确认。", args => args?.node_id && [2048, 4096].includes(args.resolution) ? "paid" : "safe", {
      node_id: nullableStringSchema("当前画布中有真实图片输出的目标节点 ID；没有明确目标时传 null"),
      resolution: { type: ["integer", "null"], enum: [2048, 4096, null], description: "目标长边像素；未指定传 null" },
    }, 1, { baseline: true, openWorld: true }),
    defineCapability("image.mask.edit", "open_canvas_mask_editor", "定位当前画布图片并打开遮罩编辑器，供用户手绘需要编辑的区域。", "safe", {
      node_id: stringSchema("目标图片节点 ID"),
    }),
    defineCapability("image.remove-background", "remove_canvas_image_background", "执行抠图、去背景、提取主体或导出透明 PNG。优先使用用户明确引用或唯一选中的图片节点。要求抠出画面中的主要产品时使用 subject，它按原尺寸保留自动识别的主要前景，并将透明 PNG 保存到与原图相连的新节点。自动模式不接受主体名称或区域作为分割提示。指定主体与主要前景不一致、画面有多个主体且无法可靠区分，或用户要求手动细修时用 interactive。", "safe", {
      node_id: stringSchema("用户明确引用或唯一选中的图片节点 ID；目标不明确时先询问"),
      mode: enumSchema("subject 自动主体抠图；effect 特效颜色键控；interactive 打开工作台细修", ["subject", "effect", "interactive"]),
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
    defineCapability("skill.reference.read", "read_skill_reference", "读取专业流程自带的参考文档。", "safe", {
      skill_id: stringSchema("业务 Skill ID"),
      path: stringSchema("参考文档路径，例如 references/base-en.txt"),
    }),
    defineCapability("director3d.animate", "canvas_director3d_apply_animation", "在当前画布的 3D 导演台上摆机位、编排相机运动并返回场景内容；画布上没有导演台时会自动创建一个。", "safe", {
      node_id: nullableStringSchema("已有 3D 导演台节点 ID；不指定时使用当前打开的导演台"),
      shot_preset: nullableEnumSchema("机位预设；不调整机位时传 null", DIRECTOR3D_SHOT_PRESETS),
      camera_motion: nullableEnumSchema("相机动画预设；不添加运镜时传 null", DIRECTOR3D_CAMERA_MOTIONS),
      x: nullableNumberSchema("画布 X 坐标"),
      y: nullableNumberSchema("画布 Y 坐标"),
    }),
  ]);

  const enabledCapabilities = CAPABILITY_REGISTRY.filter(item => creationPolicy?.isCapabilityAvailable?.(item.tool.name) !== false);
  const CAPABILITY_BY_ID = new Map(enabledCapabilities.map((item) => [item.id, item]));
  const CAPABILITY_BY_TOOL = new Map(enabledCapabilities.map((item) => [item.tool.name, item]));

  function defineCapability(id, toolName, description, risk, properties, maxTargets = 1, options = {}) {
    const destructive = !options.openWorld && (typeof risk === "function" || risk === "destructive" || risk === "bulk-overwrite");
    return Object.freeze({
      id,
      risk,
      maxTargets,
      ...(options.baseline ? { baseline: true } : {}),
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
          openWorldHint: options.openWorld === true || risk === "paid",
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

  function nullableEnumSchema(description, values) {
    return { type: ["string", "null"], enum: [...values, null], description };
  }

  function booleanSchema(description) {
    return { type: "boolean", description };
  }

  function stringArraySchema(description, maxItems = MAX_BATCH_TARGETS) {
    return { type: "array", description, items: { type: "string" }, maxItems };
  }

  function designBriefQuestionsSchema(description) {
    return {
      type: "array",
      description,
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          id: stringSchema("问题标识，使用简短英文，例如 poster_type、subject、channel"),
          label: stringSchema("向用户展示的问题"),
          kind: enumSchema("回答方式", ["single", "text"]),
          options: {
            type: "array",
            description: "single 类型的候选答案；text 类型传空数组",
            items: { type: "string" },
            maxItems: 8,
          },
          required: booleanSchema("是否必须回答"),
          recommended: stringSchema("按专业判断给出的推荐值；没有推荐时传空字符串"),
        },
        required: ["id", "label", "kind", "options", "required", "recommended"],
        additionalProperties: false,
      },
    };
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
        resolution: nullableStringSchema(IMAGE_RESOLUTION_DESCRIPTION),
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
    DIRECTOR3D_SHOT_PRESETS,
    DIRECTOR3D_CAMERA_MOTIONS,
    CAPABILITY_REGISTRY: Object.freeze(enabledCapabilities),
    getCapability,
    getCapabilityByToolName,
    getMcpTools,
    getToolDefinitions,
    getRisk,
    getCapabilityIdsForToolNames,
  });
});
