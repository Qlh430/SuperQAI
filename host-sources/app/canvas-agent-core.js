(function initCanvasAgentCore(root, factory) {
  const capabilities = typeof module === "object" && module.exports
    ? require("./canvas-agent-capabilities")
    : root?.CanvasAgentCapabilities;
  const api = factory(capabilities);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasAgentCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasAgentCore(CanvasAgentCapabilities) {
  if (!CanvasAgentCapabilities) throw new Error("CanvasAgentCapabilities is required before CanvasAgentCore.");
  const MAX_STEPS = 24;
  const MAX_TOOL_CALLS = 48;
  const MAX_CONTINUATIONS = 2;
  const MAX_CANVAS_NODES = 80;
  const MAX_TEXT_LENGTH = 2000;
  const COMPACT_TEXT_LENGTH = 320;
  const CANVAS_AGENT_RECOVERY_DELAYS_MS = Object.freeze([1000, 3000, 8000]);
  const CANVAS_AGENT_RECOVERABLE_CATEGORIES = new Set([
    "network",
    "timeout",
    "rate-limit",
    "server",
    "protocol",
    "busy",
    "unavailable",
  ]);
  const TERMINAL_TOOL_NAMES = new Set([
    "generate_image_to_gallery",
    "run_canvas_node",
    "organize_canvas_nodes",
    "connect_nodes",
    "disconnect_nodes",
    "canvas_director3d_apply_animation",
    "remove_canvas_image_background",
  ]);
  const DISCUSSION_IMAGE_TOOL_NAMES = new Set([
    "generate_image_to_gallery",
    "request_image_node_choice",
    "run_canvas_node",
    "upscale_canvas_image",
    "remove_canvas_image_background",
  ]);

  const TOOL_DEFINITIONS = Object.freeze(CanvasAgentCapabilities.CAPABILITY_REGISTRY.map((item) => item.tool));

  const TOOL_NAME_SET = new Set(TOOL_DEFINITIONS.map((tool) => tool.name));

  function requiresApproval(toolName, args = {}) {
    return CanvasAgentCapabilities.getRisk(toolName, args) !== "safe";
  }

  function buildApprovalPlan(calls, options = {}) {
    const counts = { paid: 0, destructive: 0, "bulk-overwrite": 0 };
    const riskyCalls = [];
    const authorizedCalls = [];
    const allowances = { ...(options.paidAllowances || {}) };
    (Array.isArray(calls) ? calls : []).forEach((call) => {
      const risk = CanvasAgentCapabilities.getRisk(call?.name, call?.arguments || {});
      if (risk === "safe") return;
      const toolName = String(call?.name || "");
      if (risk === "paid" && Number(allowances[toolName] || 0) > 0) {
        allowances[toolName] = Number(allowances[toolName]) - 1;
        authorizedCalls.push({ ...call, risk });
        return;
      }
      const targetCount = countRiskTargets(call, risk);
      counts[risk] += targetCount;
      riskyCalls.push({ ...call, risk });
    });
    const fragments = [];
    if (counts.paid) fragments.push(`${counts.paid} 次付费生成`);
    if (counts.destructive) fragments.push(`删除 ${counts.destructive} 个节点`);
    if (counts["bulk-overwrite"]) fragments.push(`覆盖 ${counts["bulk-overwrite"]} 个节点`);
    return {
      requiresApproval: riskyCalls.length > 0,
      calls: riskyCalls,
      authorizedCalls,
      counts,
      summary: fragments.length ? `需要确认：${fragments.join("、")}` : "无需确认",
    };
  }

  function classifyAgentRequest(prompt) {
    const text = String(prompt || "").trim();
    // Only the request envelope can authorize execution, not quoted examples or source text.
    const instruction = text.replace(/```[\s\S]*?```|「[^」]*」|“[^”]*”|『[^』]*』/gu, " ");
    const canvasObject = /(?:画布|节点|连线|端口|工作流|图集)/u;
    const imageObject = /(?:图片|图像|照片|画面|图中|图里|(?:这张|该|选中的|这幅|原|参考|素材)图|背景|光影|清晰度)/u;
    const imageActionVerb = /(?:修改|编辑|替换|改成|变成|换成|放在|放到|放进|置入|添加|加上|去掉|删除|移除|扩图|裁[切剪]|重绘|修复|美化|增强|放大|超分|超清|高清化|提升|提高|抠图|去背)/u;
    const textDeliverable = /(?:润色|改写|重写|扩写|缩写|翻译|优化|修改|调整|编辑|改一下|写)[^，,。！？\n:：]{0,30}(?:提示词|文案|文字|文本|台词|脚本)/u;
    const scope = textDeliverable.test(instruction.split(/[:：\n]/u)[0])
      ? instruction.split(/[:：\n]/u)[0] : instruction;
    const hold = /(?:先(?:讨论|聊|别执行|不执行|只看|给我建议|说一下)|只(?:讨论|聊|提供建议)|等(?:我|用户)确认(?:后|再)?(?:执行|生成|出图)?|尚未授权)/u.test(scope);
    const noImage = /(?:不要|不需要|无需|不用|别|禁止|不得|不能|不执行|暂不|先不|不提交)(?:实际|真实|自动|直接|立即|任何|付费|图片|图像|视频|的|执行|运行|调用|触发|进行|开始|提交|[/／\s])*(?:生成|生图|出图|编辑(?:图片|图像))/u.test(scope)
      || /只(?:创建|新建|建|搭建)(?:必要|所需)?节点/u.test(scope);
    const clauses = scope.split(/[，,。！？!?；;\n]/u).filter(clause => (
      !/(?:不要|不想|不需要|无需|不用|请勿|禁止|切勿|暂不|先不|不执行|别执行|等我确认)/u.test(clause)
      && !/(?:^(?:请|帮我|我想|我想先|想|先|只|仅|\s)*(?:讨论|聊聊|解释|介绍|分析|请教|了解|讲讲)|应该|应当|如何|怎么|为什么|什么是|有什么|是否(?:支持|可行|合适)|能否说明|建议如何)/u.test(clause)
    ));
    const actionable = clauses.join("，");
    const canvasWritePrompt = clauses.some(clause => /提示词/u.test(clause) && (
      /(?:写入|填入|保存到|应用到|更新到|替换到)[^，。]{0,18}(?:画布|节点)/u.test(clause)
      || /(?:这个|该|当前|选中的?).{0,12}节点.{0,12}提示词/u.test(clause)
        && /修改|更新|调整|编辑|改写|改一下|改成|改为|删掉|去掉/u.test(clause)
        && !/(?:发|给|返回|贴)[^，。]{0,14}(?:聊天|看看|我看)/u.test(clause)
    ));
    const canvas = !hold && (canvasWritePrompt || clauses.some(clause =>
      /(?:创建|新建|建|新增|添加|搭建|配置|整理|排列|移动|拖动|连接|断开|连线|删除|移除|复制|重命名|改名|修改|更新|编辑|填充|执行|运行|定位|查找|搜索|聚焦|高亮|选中|选择|复核|核对|检查).{0,22}(?:画布|节点|连线|端口|工作流|图集)|(?:画布|节点|图集).{0,18}(?:创建|移动|连接|删除|更新|修改|编辑|整理|聚焦|定位|改[成为名]|重命名|设[为置])/u.test(clause)
      && (!textDeliverable.test(clause) || /(?:在|到|入|当前|选中)[^，。]{0,10}(?:画布|节点)/u.test(clause))));
    const workflow = !hold && (canvas && /工作流|流程/u.test(actionable)
      || /(?:启动|执行|运行|开始|按).{0,28}(?:专业流程|标准工作流|(?:Skill|技能).{0,12}(?:流程|工作流))|(?:调用|使用|按|按照|根据|依据).{0,45}(?:Skill|技能).{0,35}(?:策划|交付|完成.{0,10}方案)/iu.test(actionable));
    const requestsOnlyText = /(?:只(?:是|需|要)?|仅)(?:让|请|给我|想让|需要|帮我|做|\s)*(?:修改|改写|优化|润色|翻译|写|返回|输出)[^，。]{0,26}(?:提示词|文字|文本|文案|脚本)/u.test(scope);
    const imageClauses = clauses.filter(clause => (!textDeliverable.test(clause) || /(?:然后|之后|再|并)(?:帮我|用它|直接|据此|\s)*(?:生成|出图)/u.test(clause))
      && !/(?:生成|图片|图像|视频|海报|插画)(?:生成器?)?(?:节点|工作流|流程|参数|教程|说明|技巧|方案)|(?:编写|撰写|给我|讨论)[^，。]{0,22}(?:提示词|教程|说明|建议|方案)/u.test(clause));
    const imageAction = imageClauses.join("，");
    const standaloneImageAction = /^(?:请|帮我|直接|现在|\s)*(?:抠图|去背|换背景|扩图|裁[切剪]|重绘|放大|超分|超清|提高清晰度)(?:吧|一下)?$/u.test(imageAction.trim());
    const isCutoutClause = clause => (
      /抠图|抠(?:取|出|一下)|去背|(?:去掉|去除|移除|删除|清除).{0,18}背景|(?:图片|图像|照片|画面|这张图)的?背景.{0,8}(?:去掉|去除|移除|删除|清除)/u.test(clause)
      || /(?:提取|分离|分割).{0,10}(?:主体|产品|商品)|(?:主体|产品|商品).{0,10}(?:单独|独立)(?:提取|分离|保留)|(?:只|仅)保留.{0,6}(?:主体|产品|商品)/u.test(clause)
      || /(?:做成|处理成|导出|保存|转成|转换为|改成|变成).{0,12}(?:透明背景|透明\s*PNG)/iu.test(clause));
    const imageCutout = !hold && !noImage && !requestsOnlyText && imageClauses.some(clause =>
      isCutoutClause(clause) && !/(?:教程|教学|示例|技巧|方法|步骤|原理|是否|能不能|可不可以|能.{0,22}吗\s*$|(?:别|不用|不必|无需)(?:再|给我|帮我|\s)*(?:抠|去背|去掉|移除|提取))/u.test(clause));
    const imageUtility = imageCutout || !hold && !noImage && !requestsOnlyText
      && (standaloneImageAction || imageObject.test(imageAction) || /抠图|去背|扩图|超分/u.test(imageAction))
      && /放大|超分|超清|高清化|提(?:升|高).{0,12}清晰度|裁[切剪]|扩图/u.test(imageAction)
      && !/生成|生图|出图|设计|策划|创作|工作流/u.test(imageAction);
    const edit = !hold && !noImage && !requestsOnlyText && (
      imageUtility || imageClauses.some(clause => imageObject.test(clause) && imageActionVerb.test(clause)
        && !canvasObject.test(clause) && !isCutoutClause(clause))
      || standaloneImageAction && !isCutoutClause(imageAction));
    const generate = !hold && !noImage && !requestsOnlyText && (
      /(?:生成|绘制|画一张|创作一张|做一张|做一套|出一张|出图|生图).{0,38}(?:图|图像|图片|照片|海报|主视觉|插画|壁纸)/u.test(imageAction)
      || imageClauses.some(clause => /^(?:请|帮我|就|直接|现在|开始|继续|\s)*(?:生成|出图|生图)\s*$/u.test(clause)
        || /^(?:请|帮我|就|直接|现在|开始|\s)*按.{0,24}(?:方案|方向|上面|刚才|这个).{0,16}(?:生成|出图|生图)\s*$/u.test(clause))
      || imageClauses.some(clause => /(?:用|把|让)(?:这个|当前|选中|上传的)?(?:产品|商品|素材|图片|照片|参考图)?.{0,18}(?:直接|现在|立即)?(?:生成|出图|生图)\s*$/u.test(clause))
      || /(?:我)?(?:想要|要)(?:一张|1\s*张|一幅).{0,22}(?:图|照片|海报|插画)/u.test(imageAction));
    const video = !hold && !noImage && !requestsOnlyText && imageClauses.some(clause =>
      /(?:生成|制作|创作|做|执行|运行|提交|配置|搭建).{0,26}(?:视频|短片|出片)|(?:h3|带货视频).{0,14}(?:生成|制作|配置|出片)/iu.test(clause));
    const skillReference = !isSkillInvocationProhibited(text)
      && /(?:参考|借鉴|借助|按|按照|使用|调用|根据|依据|结合).{0,55}(?:Skill\b|技能)/iu.test(scope);
    const professional = !isSkillInvocationProhibited(text) && (workflow || edit && !imageUtility || generate || video);
    return { canvas, canvasWritePrompt, workflow, edit, imageUtility, imageCutout, generate, video, professional, skillReference, noImage, hold,
      textRevision: textDeliverable.test(scope),
      visual: !canvas && !professional && /图片|图像|照片|这张图|图中|图里|看图|识图|截图/u.test(scope),
      execution: canvas || professional || edit || generate || video,
    };
  }

  function getCanvasExecutionOutcome(outputs = []) {
    const results = outputs.filter(Boolean);
    for (const state of ["waiting-input", "waiting-confirmation", "running", "unavailable", "cancelled"]) {
      if (results.some(result => result.state === state
        || state === "waiting-input" && result.editor_open
        || state === "waiting-confirmation" && result.decision_required
        || state === "running" && ["queued", "submitted"].includes(result.state)
        || state === "unavailable" && ["unsupported_tool", "plugin_unavailable", "model_unavailable"].includes(result.code)
        || state === "cancelled" && ["user_declined", "cancelled"].includes(result.code))) return state;
    }
    if (results.some(result => result.ok === false)) return "failed";
    const completed = results.some(result => {
      if (result.ok !== true) return false;
      if (result.tool === "upscale_canvas_image") return result.state === "succeeded" && result.persisted === true
        && Boolean(result.node_id && result.task_id) && result.width > 0 && result.height > 0;
      if (result.tool === "remove_canvas_image_background") return result.state === "succeeded" && result.persisted === true
        && Boolean(result.node_id && result.source_node_id && result.result_url) && result.width > 0 && result.height > 0;
      if (["activate_canvas_skill", "read_skill_reference", "request_design_brief"].includes(result.tool)) return false;
      if (result.tool === "run_canvas_node") return Boolean(result.output?.url || result.output?.text || result.image_count > 0);
      return Boolean(result.persisted === true || result.node_id || result.node_ids?.length
        || result.from_id && result.to_id || result.group_id || result.organized_count > 0);
    });
    return completed ? "completed" : "not-executed";
  }

  function isPosterDesignRequest(prompt) {
    const text = String(prompt || "").replace(/```[\s\S]*?```|「[^」]*」|“[^”]*”/gu, " ");
    const route = classifyAgentRequest(text);
    if (route.hold || route.textRevision || route.video || isSkillInvocationProhibited(text)) return false;
    return text.split(/[，,。！？!?；;\n]/u).some(clause =>
      !/如何|怎么|是否|为什么|什么是|对比|介绍|不要|不想|无需|别/u.test(clause)
      && /(?:设计|策划|制作|创作|生成|做一张|画一张).{0,32}(?:海报|活动主视觉)/u.test(clause)
      && !/(?:用(?:作|于)|适用于|供后期|作为).{0,12}(?:海报|活动主视觉)|海报(?:风格|提示词|教程|工作流|节点|用|的?(?:摄影|产品照|纯摄影|底图))/u.test(clause));
  }

  function resolveSkillInvocation(catalog, { selectedId = "", lockedId = "", prompt = "", canvas } = {}) {
    const skills = Array.isArray(catalog) ? catalog.filter(skill => skill?.id && skill.enabled !== false) : [];
    const text = String(prompt).trim().toLowerCase().replace(/```[\s\S]*?```|“[^”]*”|『[^』]*』/gu, " ");
    if (!lockedId && isSkillInvocationProhibited(text)) return { skill: null, reason: "general" };
    const normalize = value => String(value || "").toLowerCase().replace(/\s+/gu, "");
    const compact = normalize(text);
    if (lockedId) {
      const lockedSkill = skills.find(skill => skill.id === lockedId) || null;
      if (!text) return { skill: lockedSkill, reason: "locked", unavailable: !lockedSkill };
    } else if (selectedId && !text) {
      const selected = skills.find(skill => skill.id === selectedId) || null;
      return { skill: selected, reason: "selected", unavailable: !selected };
    }
    const aliasesFor = skill => [skill.id, skill.label, skill.canvas?.label,
      /^#\s+(.{1,80})$/m.exec(skill.instructions || "")?.[1]?.trim(), ...(skill.aliases || [])];
    const explicitAliasMatch = skill => aliasesFor(skill).some(alias => {
      const name = normalize(alias);
      if (!name || !compact.includes(name)) return false;
      const index = compact.indexOf(name);
      const before = compact.slice(Math.max(0, index - 24), index);
      return /(?:用|按|调用|启用|切换到|改用|选择|结合|搭配)[^，。；]{0,18}$/u.test(before)
        && !/(?:不要|不用|不使用|别用|不调用|不用切换)/u.test(before)
        && (/(?:skill\b|技能|专业流程)/iu.test(text) || before.length > 0 && name.length >= 4);
    });
    const named = skills.filter(explicitAliasMatch);
    const switchRequested = /(?:切换|改用|换成|转到|更换).{0,16}(?:skill|技能|流程)/iu.test(text);
    const combinationRequested = /(?:同时|一起|组合|结合).{0,32}(?:skill|技能|工作流|流程)/iu.test(text)
      || /(?:skill|技能|工作流|流程).{0,24}(?:同时|一起|组合|结合)/iu.test(text);
    if (lockedId) {
      const lockedSkill = skills.find(skill => skill.id === lockedId) || null;
      const requested = named.find(skill => skill.id !== lockedId) || null;
      return {
        skill: lockedSkill, reason: "locked", unavailable: !lockedSkill,
        ...(switchRequested && requested ? { requestedSwitch: requested } : {}),
        ...(combinationRequested && named.length > 1 ? { combination: named } : {}),
      };
    }
    if (selectedId && !switchRequested && !combinationRequested) {
      const selected = skills.find(skill => skill.id === selectedId) || null;
      return { skill: selected, reason: "selected", unavailable: !selected };
    }
    if (selectedId && switchRequested && named.length === 1) return { skill: named[0], reason: "switch_requested" };
    if (selectedId && combinationRequested && named.length) {
      const selected = skills.find(skill => skill.id === selectedId) || null;
      const candidates = [...new Map([selected, ...named].filter(Boolean).map(skill => [skill.id, skill])).values()];
      if (candidates.length > 1) return { skill: selected, reason: "combination_requested", combination: candidates };
    }
    if (selectedId) {
      const selected = skills.find(skill => skill.id === selectedId) || null;
      return { skill: selected, reason: "selected", unavailable: !selected };
    }
    if (named.length === 1) return { skill: named[0], reason: "named" };
    if (named.length > 1) return { skill: null, reason: "ambiguous", candidates: named };
    const route = classifyAgentRequest(text);
    const planningRequest = /(?:设计|策划|制作|制定|创作).{0,32}(?:产品摄影|商业摄影|海报设计|主视觉).{0,10}(?:方案|创意|策划)/u.test(text);
    if (!(route.professional && route.execution || planningRequest) || route.hold
      || (route.canvas && !route.generate && !route.edit && !route.video)
      || /^(?:如何|怎么|什么是|是否|能不能|介绍|讨论)/u.test(text)) return { skill: null, reason: "general" };
    const inputKinds = new Set([...(canvas?.agent_materials || []), ...(canvas?.nodes || [])].map(item => item?.type || item?.kind));
    const matches = skills.filter(skill => skill.execution?.exposure === "agent").map(skill => {
      const triggers = skill.triggers || skill.canvas?.triggers || [];
      const phrases = [skill.label || skill.canvas?.label, ...triggers].map(normalize)
        .filter(trigger => trigger.length >= 4 && compact.includes(trigger));
      const category = skill.category || skill.canvas?.category;
      const requirement = skill.required_selection || skill.canvas?.required_selection;
      if (inputKinds.size && ["image", "video", "audio"].includes(requirement) && !inputKinds.has(requirement)) return null;
      if (category === "video" && !route.video || category !== "video" && route.video) return null;
      if (!phrases.length) return null;
      const description = normalize(skill.description);
      return { skill, score: Math.max(...phrases.map(trigger => trigger.length))
        + Number(phrases.some(trigger => description.includes(trigger))) + Number(inputKinds.has(requirement)) };
    }).filter(Boolean).sort((a, b) => b.score - a.score);
    const scored = matches.filter(({ skill }) => canAutoInvokeSkill(skill));
    if (!scored.length) {
      const recommendations = matches.filter(({ skill }) => ["unverified", "partial"].includes(skill.validation_status)
        && !skill.unresolvedDependencies?.length && !skill.unresolved_dependencies?.length)
        .slice(0, 3).map(({ skill }) => skill);
      return { skill: null, reason: "general", ...(recommendations.length ? { recommendations } : {}) };
    }
    if (scored[1] && scored[0].score - scored[1].score < 2) {
      return { skill: null, reason: "ambiguous", candidates: scored.filter(item => scored[0].score - item.score < 2).map(item => item.skill) };
    }
    return { skill: scored[0].skill, reason: "matched" };
  }

  function canAutoInvokeSkill(skill) {
    return skill?.enabled === true && skill.validation_status === "verified" && !skill.unresolvedDependencies?.length
      && !skill.unresolved_dependencies?.length
      && skill.compatibility?.status !== "缺少外部依赖"
      && skill.execution?.exposure === "agent" && skill.execution.allowImplicitInvocation === true;
  }

  function inspectSkillInvocation(lock, tool, targetId) {
    if (tool === "read_skill_reference") return lock?.skillId && (targetId === lock.skillId
      || lock.approvedSkillIds?.includes(targetId)) ? "allow" : "deny";
    if (tool === "activate_canvas_skill") return targetId === lock?.skillId ? "allow"
      : lock?.approvedSkillIds?.includes(targetId) ? "allow" : "approval";
    return "allow";
  }

  function classifyImageGenerationIntent(prompt) {
    const route = classifyAgentRequest(prompt);
    if (route.noImage || route.hold) return "discussion";
    if (route.generate) return "execute";
    return "neutral";
  }

  function shouldBlockCanvasToolForDiscussion(intent, toolName) {
    return intent === "discussion" && DISCUSSION_IMAGE_TOOL_NAMES.has(String(toolName || ""));
  }

  function getCanvasAgentRecoveryDelay(attempt) {
    const index = Math.trunc(Number(attempt)) - 1;
    return index >= 0 && index < CANVAS_AGENT_RECOVERY_DELAYS_MS.length
      ? CANVAS_AGENT_RECOVERY_DELAYS_MS[index]
      : null;
  }

  function shouldAutoRecoverCanvasAgent(input = {}) {
    const category = String(input.category || "").trim().toLowerCase();
    const attempt = Math.max(0, Math.trunc(Number(input.attempt || 0)));
    return input.boardMatches === true
      && input.tokenMatches === true
      && attempt < CANVAS_AGENT_RECOVERY_DELAYS_MS.length
      && CANVAS_AGENT_RECOVERABLE_CATEGORIES.has(category);
  }

  function getCanvasAgentRecoveryPaidAllowances(allowances = {}, paidAttempted = false) {
    if (paidAttempted) return { generate_image_to_gallery: 0, run_canvas_node: 0 };
    return {
      generate_image_to_gallery: Math.max(0, Math.min(1, Number(allowances.generate_image_to_gallery || 0))),
      run_canvas_node: Math.max(0, Math.min(1, Number(allowances.run_canvas_node || 0))),
    };
  }

  function getDirectImageGenerationAllowance(prompt) {
    const text = String(prompt || "").trim();
    if (classifyImageGenerationIntent(text) !== "execute") return 0;
    if (/几张|多张|一批|批量|若干|套图|组图|系列/.test(text)) return 0;
    if (/(?:[2-9]|[二两三四五六七八九十])\s*张/.test(text)) return 0;
    return 1;
  }

  function getSelectedImageEditGenerationAllowance(prompt, hasSelectedImage = false) {
    const route = classifyAgentRequest(prompt);
    return hasSelectedImage && route.edit && !route.imageUtility ? 1 : 0;
  }

  function parseDirectImageFallbackIntent(prompt, canvas = {}, options = {}) {
    const text = trimText(prompt, 12000).trim();
    if (!text || !getDirectImageGenerationAllowance(text)) return null;
    const hasReusableGenerator = (Array.isArray(canvas?.nodes) ? canvas.nodes : []).some((node) => (
      String(node?.kind || "") === "image" && node?.is_upload_only !== true
    ));
    if (hasReusableGenerator && options.allowNewWithReusableGenerator !== true) return null;
    return { prompt: text };
  }

  function consumePaidAllowances(run, calls) {
    const paidAllowances = { ...(run?.paidAllowances || {}) };
    (Array.isArray(calls) ? calls : []).forEach((call) => {
      const toolName = String(call?.name || "");
      if (Number(paidAllowances[toolName] || 0) > 0) paidAllowances[toolName] -= 1;
    });
    return { ...run, paidAllowances, updatedAt: Date.now() };
  }

  function countRiskTargets(call, risk) {
    const args = call?.arguments || {};
    if (risk === "destructive") {
      if (Array.isArray(args.node_ids)) return Math.max(1, args.node_ids.length);
      if (Array.isArray(args.remove_image_ids)) return Math.max(1, args.remove_image_ids.length);
    }
    if (risk === "bulk-overwrite") {
      if (Array.isArray(args.node_ids)) return Math.max(1, args.node_ids.length);
      return 1;
    }
    return 1;
  }

  function summarizeCanvasBoard(board = {}, selectedIds = [], options = {}) {
    const sourceNodes = Array.isArray(board.nodes) ? board.nodes : [];
    const sourceById = new Map(sourceNodes.map((node) => [String(node?.id || ""), node]));
    const requestedSelected = Array.from(new Set((Array.isArray(selectedIds) ? selectedIds : []).map(String)))
      .filter((id) => sourceById.has(id));
    const selectedSet = new Set(requestedSelected);
    const connectedIds = [];
    (Array.isArray(board.connections) ? board.connections : []).forEach((item) => {
      const from = String(item?.from || "");
      const to = String(item?.to || "");
      if (selectedSet.has(from) && sourceById.has(to)) connectedIds.push(to);
      if (selectedSet.has(to) && sourceById.has(from)) connectedIds.push(from);
    });
    const relatedIds = new Set([...requestedSelected, ...connectedIds]);
    const groupRelatedIds = [];
    sourceNodes.filter((node) => node?.kind === "group").forEach((group) => {
      const groupId = String(group.id || "");
      const members = Array.isArray(group.groupMembers) ? group.groupMembers.map(String) : [];
      if (selectedSet.has(groupId)) members.forEach((id) => { if (sourceById.has(id)) groupRelatedIds.push(id); });
      else if (members.some((id) => relatedIds.has(id))) {
        groupRelatedIds.push(groupId);
        members.forEach((id) => { if (sourceById.has(id)) groupRelatedIds.push(id); });
      }
    });
    const orderedIds = [...new Set([
      ...requestedSelected,
      ...connectedIds,
      ...groupRelatedIds,
      ...sourceNodes.map((node) => String(node?.id || "")),
    ])].filter((id) => sourceById.has(id)).slice(0, MAX_CANVAS_NODES);
    const detailedIds = new Set([...requestedSelected, ...connectedIds]);
    const nodes = orderedIds.map(id => summarizeCanvasNode(sourceById.get(id),
      detailedIds.has(id), options.fullSelectedText === true && selectedSet.size === 1 && selectedSet.has(id)));
    const nodeIds = new Set(nodes.map((node) => node.id));
    const selected = requestedSelected.filter((id) => nodeIds.has(id));
    const connections = (Array.isArray(board.connections) ? board.connections : [])
      .filter((item) => nodeIds.has(String(item?.from)) && nodeIds.has(String(item?.to)))
      .slice(0, 160)
      .map((item) => ({
        from: String(item.from),
        to: String(item.to),
        from_port: String(item.fromPort || item.from_port || "output"),
        to_port: String(item.toPort || item.to_port || "input"),
      }));
    return {
      id: String(board.id || ""),
      title: trimText(board.title, 160),
      total_node_count: sourceNodes.length,
      omitted_node_count: Math.max(0, sourceNodes.length - nodes.length),
      selected_node_ids: selected,
      nodes,
      connections,
    };
  }

  function summarizeCanvasNode(node = {}, detailed = false, fullText = false) {
    const textLimit = fullText ? 12000 : detailed ? MAX_TEXT_LENGTH : COMPACT_TEXT_LENGTH;
    const kind = String(node.kind || "unknown");
    const summary = {
      id: String(node.id || ""),
      kind,
      title: trimText(node.nodeTitle || node.textName || node.imageName || node.mediaName || node.groupTitle || node.galleryTitle || "", 160),
      x: finiteNumber(node.x),
      y: finiteNumber(node.y),
    };
    if (kind === "text") {
      summary.text = trimText(node.text, textLimit);
      summary.text_name = trimText(node.textName, 120);
      if (node.llmPrompt || node.llmModel || node.llmImages?.length) {
        summary.llm_prompt = trimText(node.llmPrompt, textLimit);
        summary.llm_model = trimText(node.llmModel, 160);
        summary.reference_images = compactReferences(node.llmImages);
      }
    }
    if (kind === "note") summary.text = trimText(node.text, textLimit);
    if (kind === "image") {
      summary.image_name = trimText(node.imageName || "图片", 240);
      summary.material_available = Boolean(node.resultSrc || node.imageSrc);
      summary.result_available = Boolean(node.resultSrc);
      summary.image_url = safeAssetUrl(node.resultSrc || node.imageSrc);
      summary.original_image_url = safeAssetUrl(node.originalSrc || node.imageSrc);
      summary.prompt = trimText(node.prompt, textLimit);
      summary.model = trimText(node.model, 240);
      summary.size = trimText(node.size, 80);
      summary.resolution = trimText(node.resolution, 80);
      summary.is_upload_only = Boolean(node.uploadOnly);
      summary.job_state = trimText(node.imageJobState, 40);
    }
    if (kind === "gallery") {
      summary.title = trimText(node.galleryTitle || "生成图集", 240);
      summary.image_count = Array.isArray(node.galleryImages) ? node.galleryImages.length : 0;
    }
    if (kind === "llm") {
      summary.prompt = trimText(node.llmPrompt, textLimit);
      summary.output = trimText(node.llmOutput, textLimit);
      summary.model = trimText(node.llmModel, 240);
      summary.reference_images = compactReferences(node.llmImages);
    }
    if (kind === "minimax-h3") {
      summary.prompt = trimText(node.minimaxH3Prompt, textLimit);
      summary.aspect_ratio = trimText(node.minimaxH3AspectRatio, 32);
      summary.duration = finiteNumber(node.minimaxH3Duration);
      summary.steps = finiteNumber(node.minimaxH3Steps);
      summary.mode = trimText(node.minimaxH3Mode, 40);
      summary.reference_counts = { images: countItems(node.minimaxH3ImageOrder), videos: countItems(node.minimaxH3VideoOrder), audios: countItems(node.minimaxH3AudioOrder) };
      if (node.minimaxH3Model === "h3-commerce") {
        summary.model = "h3-commerce";
        summary.prompt_a_filled = Boolean(String(node.h3CommercePromptA || "").trim());
        summary.prompt_b_filled = Boolean(String(node.h3CommercePromptB || "").trim());
        summary.commerce_images = Array.from({ length: 4 }, (_, index) => {
          const image = node.h3CommerceImages?.[index];
          return image?.url ? { name: trimText(image.name, 120), source_node_id: String(image.sourceNodeId || "") } : null;
        });
      }
    }
    if (kind === "audio-generator") {
      const audio = node.audioGeneration || {};
      const result = audio.result || {};
      const reference = audio.qwenDrafts?.clone?.referenceAudio;
      summary.mode = trimText(audio.mode || "", 60);
      summary.qwen_mode = trimText(audio.qwenMode || "", 40);
      summary.model = trimText(audio.modelId || audio.model || "", 160);
      summary.prompt = trimText(audio.prompt, textLimit);
      summary.lyrics = trimText(audio.lyrics, textLimit);
      summary.parameters = compactObject(audio.parameters);
      summary.reference_audio = compactMaterial(reference);
      summary.result = { available: Boolean(result.url || result.src), name: trimText(result.name, 120), duration: finiteNumber(result.duration), mime_type: trimText(result.mimeType || result.contentType, 80) };
    }
    if (kind === "video-api") {
      summary.prompt = trimText(node.apiVideoPrompt, textLimit);
      summary.model = trimText(node.apiVideoModel, 160);
      summary.aspect_ratio = trimText(node.apiVideoRatio, 32);
      summary.resolution = trimText(node.apiVideoResolution, 40);
      summary.duration = finiteNumber(node.apiVideoDuration);
      summary.task_active = Boolean(node.apiVideoTaskId);
    }
    if (kind === "video-output") {
      const history = Array.isArray(node.videoHistory) ? node.videoHistory : Array.isArray(node.history) ? node.history : [];
      const activeId = String(node.videoActiveId || node.activeId || "");
      const active = history.find((item) => String(item?.id || "") === activeId) || history[history.length - 1] || null;
      summary.result_count = history.length || Number(Boolean(node.videoSrc || node.mediaSrc || node.generationVideoSrc));
      summary.active_result = active ? { name: trimText(active.name || node.videoName || node.mediaName, 120), available: Boolean(active.src || active.url), duration: finiteNumber(active.duration), mime_type: trimText(active.mimeType, 80), prompt_summary: trimText(active.promptSummary || node.videoPromptSummary, textLimit) } : { name: trimText(node.videoName || node.mediaName, 120), available: Boolean(node.videoSrc || node.mediaSrc || node.generationVideoSrc), duration: finiteNumber(node.videoDuration || node.mediaDuration), mime_type: trimText(node.videoMimeType || node.mediaMimeType, 80), prompt_summary: trimText(node.videoPromptSummary, textLimit) };
    }
    if (kind === "grid-editor") {
      const grid = node.gridEditorState || {};
      summary.source_node_id = trimText(grid.sourceNodeId, 120);
      summary.rows = finiteNumber(grid.rows);
      summary.columns = finiteNumber(grid.columns);
      summary.source_size = { width: finiteNumber(grid.sourceWidth || grid.width), height: finiteNumber(grid.sourceHeight || grid.height) };
      summary.cell_count = Array.isArray(grid.regions) ? grid.regions.length : summary.rows * summary.columns;
      summary.source_name = trimText(grid.sourceName, 120);
      summary.aspect = trimText(grid.aspect, 24);
      summary.gap = finiteNumber(grid.uniformGap);
      summary.selected_cell = trimText(grid.selectedCellKey, 32);
      summary.has_source = Boolean(grid.sourceSrc || grid.sourceNodeId);
    }
    if (kind === "group") {
      summary.title = trimText(node.groupTitle || node.nodeTitle || "图片组", 160);
      summary.member_ids = (Array.isArray(node.groupMembers) ? node.groupMembers : []).map(String).slice(0, 80);
      summary.member_count = Array.isArray(node.groupMembers) ? node.groupMembers.length : 0;
      summary.layout = trimText(node.groupLayout, 80);
    }
    if (kind === "gallery-container") {
      const gallery = node.galleryContainer || {};
      const members = Array.isArray(gallery.members) ? gallery.members : [];
      summary.member_ids = members.map((item) => String(item?.id || item?.nodeId || "")).filter(Boolean).slice(0, 40);
      summary.member_count = members.length;
      summary.layout = trimText(gallery.layoutMode, 80);
    }
    if (kind === "asset-collection") {
      const collection = node.assetCollection || {};
      const members = Array.isArray(collection.members) ? collection.members : [];
      summary.mode = trimText(collection.mode, 40);
      summary.member_count = members.length;
      summary.members = members.slice(0, 20).map((item) => ({ kind: trimText(item?.kind, 40), name: trimText(item?.name || item?.title, 120), available: Boolean(item?.src || item?.url) }));
    }
    if (kind === "video" || kind === "audio") {
      summary.material_name = trimText(node.mediaName, 160);
      summary.mime_type = trimText(node.mediaMimeType, 80);
      summary.duration = finiteNumber(node.mediaDuration);
      summary.material_available = Boolean(node.mediaSrc || node.videoSrc || node.audioSrc);
    }
    if (kind === "director-3d") {
      summary.scene_name = trimText(node.directorSceneName, 120);
      summary.project_available = Boolean(node.directorProject);
      summary.preview_available = Boolean(node.directorPreviewSrc);
    }
    if (kind === "loop") summary.reference_count = countItems(node.refOrder);
    if (kind === "midjourney") {
      summary.prompt = trimText(node.midjourneyPrompt, textLimit);
      summary.operation = trimText(node.midjourneyOperation || "imagine", 32);
      summary.model = trimText(node.midjourneyModel, 240);
      summary.size = trimText(node.midjourneySize, 32);
      summary.version = trimText(node.midjourneyVersion, 32);
      summary.speed = trimText(node.midjourneySpeed, 32);
    }
    if (kind === "comfy") {
      summary.mode = trimText(node.comfyMode, 120);
      summary.prompt = trimText(node.canvasGenerationPrompt || node.comfyPrompt, textLimit);
      summary.model = trimText(node.comfyTier || node.comfyResolution, 40);
      summary.result_available = Boolean(node.resultSrc || node.resultDownloadUrl);
      summary.reference_count = countItems(node.refOrder);
    }
    return summary;
  }

  function compactMaterial(item = {}) {
    if (!item || typeof item !== "object") return { available: false };
    return { available: Boolean(item.url || item.src || item.sourceNodeId), name: trimText(item.name, 120), source_node_id: trimText(item.sourceNodeId, 120) };
  }

  function compactObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).slice(0, 16).map(([key, item]) => [trimText(key, 48), typeof item === "string" ? trimText(item, 120) : typeof item === "number" || typeof item === "boolean" ? item : null]));
  }

  function compactReferences(value) {
    const items = Array.isArray(value) ? value : [];
    return { count: items.length, names: items.slice(0, 12).map((item) => trimText(item?.name || item?.title, 120)).filter(Boolean), available_count: items.filter((item) => Boolean(item?.url || item?.src || item?.savedUrl)).length };
  }

  function countItems(value) {
    if (Array.isArray(value)) return value.length;
    if (typeof value === "string" && value) { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.length : 0; } catch { return 0; } }
    return 0;
  }

  function trimText(value, limit) {
    return String(value || "").slice(0, limit);
  }

  function safeAssetUrl(value) {
    const text = String(value || "");
    if (!text || text.startsWith("data:")) return text ? "[inline-image]" : "";
    return trimText(text, 1200);
  }

  function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function isFiniteCoordinate(value) {
    return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
  }

  function shouldUseTerminalToolRun(prompt, calls = []) {
    const list = Array.isArray(calls) ? calls : [];
    if (list.length !== 1 || !String(prompt || "").trim()) return false;
    return TERMINAL_TOOL_NAMES.has(String(list[0]?.name || ""));
  }

  function isSkillInvocationProhibited(prompt) {
    return /(?:不要|不需要|无需|请勿|禁止|切勿|暂不|先不)\s*(?:调用|使用|启用|选择)?\s*(?:当前|任何|这个)?\s*(?:业务)?Skill\b/i
      .test(String(prompt || ""));
  }

  function isCanvasOperationRequested(prompt) {
    return classifyAgentRequest(prompt).canvas;
  }

  function isReadOnlyImageQuestion(prompt, imageCount) {
    const route = classifyAgentRequest(prompt);
    return Number(imageCount) > 0 && !route.execution && route.visual;
  }

  function normalizeAgentReferences(candidates, limit = 15) {
    const maximum = Math.max(0, Math.min(40, Number(limit) || 0));
    const references = [];
    const seen = new Set();

    (Array.isArray(candidates) ? candidates : []).forEach((candidate) => {
      if (references.length >= maximum || !candidate) return;
      const nodeId = String(candidate.nodeId || candidate.node_id || "");
      const output = candidate.output && typeof candidate.output === "object" ? candidate.output : candidate;
      const outputType = String(output.type || candidate.kind || "unknown");
      if ((outputType === "group" || outputType === "loop") && Array.isArray(output.images)) {
        output.images.forEach((image, index) => {
          appendReference({
            key: `${nodeId}:${index}`,
            nodeId,
            type: "image",
            name: image?.name || `${output.name || "图片组"} ${index + 1}`,
            url: image?.savedUrl || image?.src || image?.url || "",
            originalUrl: image?.src || image?.url || image?.savedUrl || "",
          });
        });
        return;
      }
      appendReference({
        key: String(output.key || nodeId),
        nodeId,
        type: outputType === "grid-editor" ? "image" : outputType,
        name: output.name || candidate.name || getReferenceFallbackName(outputType),
        url: output.url || output.savedUrl || output.src || "",
        originalUrl: output.originalUrl || output.original_url || output.url || output.src || "",
        text: output.text || "",
      });
    });

    function appendReference(value) {
      if (references.length >= maximum || !value.key || seen.has(value.key)) return;
      seen.add(value.key);
      references.push({
        key: String(value.key),
        nodeId: String(value.nodeId || ""),
        type: String(value.type || "unknown"),
        name: trimText(value.name || "画布节点", 240),
        url: String(value.url || ""),
        originalUrl: String(value.originalUrl || value.url || ""),
        text: trimText(value.text || "", MAX_TEXT_LENGTH),
      });
    }

    return references;
  }

  function getReferenceFallbackName(type) {
    return ({
      image: "图片",
      video: "视频",
      audio: "音频",
      text: "文字",
      llm: "文本结果",
      generator: "生成节点",
      "video-generator": "视频生成节点",
      "grid-editor": "宫格编辑节点",
    })[type] || "画布节点";
  }

  function planArrangementOffsets(items, direction = "row", gap = 80) {
    const sizes = (Array.isArray(items) ? items : []).map((item) => ({
      width: Math.max(1, Number(item?.width) || 320),
      height: Math.max(1, Number(item?.height) || 260),
    }));
    if (!sizes.length) return [];
    const layout = ["row", "column", "grid"].includes(direction) ? direction : "row";
    const safeGap = Math.max(0, Number(gap) || 0);
    const cellWidth = Math.max(...sizes.map((item) => item.width)) + safeGap;
    const cellHeight = Math.max(...sizes.map((item) => item.height)) + safeGap;
    const columns = layout === "grid" ? Math.max(1, Math.ceil(Math.sqrt(sizes.length))) : sizes.length;
    return sizes.map((item, index) => {
      const column = layout === "column" ? 0 : layout === "grid" ? index % columns : index;
      const row = layout === "row" ? 0 : layout === "grid" ? Math.floor(index / columns) : index;
      return { x: column * cellWidth, y: row * cellHeight };
    });
  }

  function planGridOffsets(items, columns = 2, gap = 90) {
    const sizes = (Array.isArray(items) ? items : []).map(item => ({
      width: Math.max(1, Number(item?.width) || 320),
      height: Math.max(1, Number(item?.height) || 380),
    }));
    const count = Math.max(1, Math.min(sizes.length || 1, Math.trunc(Number(columns) || 2)));
    const cellWidth = Math.max(...sizes.map(size => size.width), 320) + Math.max(0, Number(gap) || 0);
    const cellHeight = Math.max(...sizes.map(size => size.height), 380) + Math.max(0, Number(gap) || 0);
    return sizes.map((_, index) => ({
      x: (index % count) * cellWidth,
      y: Math.floor(index / count) * cellHeight,
    }));
  }

  function planWorkflowArrangement(items, connections, gap = 80) {
    const nodes = (Array.isArray(items) ? items : []).map((item, index) => ({
      id: String(item?.id || index),
      width: Math.max(1, Number(item?.width) || 320),
      height: Math.max(1, Number(item?.height) || 260),
      x: Number(item?.x) || 0,
      y: Number(item?.y) || 0,
      index,
    }));
    if (!nodes.length) return [];

    const safeGap = Math.max(0, Number(gap) || 0);
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const outgoing = new Map(nodes.map((node) => [node.id, []]));
    const incomingCount = new Map(nodes.map((node) => [node.id, 0]));
    const seenEdges = new Set();
    (Array.isArray(connections) ? connections : []).forEach((connection) => {
      const from = String(connection?.from || "");
      const to = String(connection?.to || "");
      const edgeKey = `${from}->${to}`;
      if (!nodeById.has(from) || !nodeById.has(to) || from === to || seenEdges.has(edgeKey)) return;
      seenEdges.add(edgeKey);
      outgoing.get(from).push(to);
      incomingCount.set(to, incomingCount.get(to) + 1);
    });

    const byOriginalPosition = (left, right) => left.y - right.y || left.x - right.x || left.index - right.index;
    const queue = nodes.filter((node) => incomingCount.get(node.id) === 0).sort(byOriginalPosition);
    const depthById = new Map(nodes.map((node) => [node.id, 0]));
    const processed = new Set();
    while (queue.length) {
      const node = queue.shift();
      if (processed.has(node.id)) continue;
      processed.add(node.id);
      (outgoing.get(node.id) || []).forEach((targetId) => {
        depthById.set(targetId, Math.max(depthById.get(targetId) || 0, (depthById.get(node.id) || 0) + 1));
        incomingCount.set(targetId, incomingCount.get(targetId) - 1);
        if (incomingCount.get(targetId) === 0) {
          queue.push(nodeById.get(targetId));
          queue.sort(byOriginalPosition);
        }
      });
    }

    const unresolved = nodes.filter((node) => !processed.has(node.id)).sort(byOriginalPosition);
    const lastDepth = Math.max(0, ...Array.from(depthById.values()));
    unresolved.forEach((node) => depthById.set(node.id, lastDepth + 1));

    const layers = new Map();
    nodes.forEach((node) => {
      const depth = depthById.get(node.id) || 0;
      if (!layers.has(depth)) layers.set(depth, []);
      layers.get(depth).push(node);
    });
    const orderedLayers = [...layers.entries()].sort((left, right) => left[0] - right[0]);
    orderedLayers.forEach(([, layer]) => layer.sort(byOriginalPosition));
    const layerHeights = orderedLayers.map(([, layer]) => (
      layer.reduce((sum, node) => sum + node.height, 0) + safeGap * Math.max(0, layer.length - 1)
    ));
    const maxHeight = Math.max(...layerHeights);
    const result = new Array(nodes.length);
    let x = 0;
    orderedLayers.forEach(([, layer], layerIndex) => {
      let y = (maxHeight - layerHeights[layerIndex]) / 2;
      layer.forEach((node) => {
        result[node.index] = { x, y };
        y += node.height + safeGap;
      });
      x += Math.max(...layer.map((node) => node.width)) + safeGap;
    });
    return result;
  }

  function planCenteredRowLayout(center, items, gap = 80) {
    const sizes = (Array.isArray(items) ? items : []).map((item) => ({
      width: Math.max(1, Number(item?.width) || 320),
      height: Math.max(1, Number(item?.height) || 260),
    }));
    if (!sizes.length) return [];
    const safeGap = Math.max(0, Number(gap) || 0);
    const centerX = Number(center?.x) || 0;
    const centerY = Number(center?.y) || 0;
    const totalWidth = sizes.reduce((sum, item) => sum + item.width, 0) + safeGap * (sizes.length - 1);
    let nextX = centerX - totalWidth / 2;
    return sizes.map((item) => {
      const point = { x: nextX, y: centerY - item.height / 2 };
      nextX += item.width + safeGap;
      return point;
    });
  }

  function createRunState(input = {}) {
    const prompt = trimText(input.prompt, 12000);
    const imageGenerationIntent = classifyImageGenerationIntent(prompt);
    const maxSteps = Number.isSafeInteger(input.maxSteps) && input.maxSteps > 0
      ? Math.min(MAX_STEPS, input.maxSteps)
      : MAX_STEPS;
    const maxToolCalls = Number.isSafeInteger(input.maxToolCalls) && input.maxToolCalls > 0
      ? Math.min(64, input.maxToolCalls)
      : MAX_TOOL_CALLS;
    return {
      id: String(input.id || `agent_${Date.now()}`),
      requestId: String(input.requestId || ""),
      messageId: String(input.messageId || ""),
      prompt,
      skillId: String(input.skillId || ""),
      imageGenerationIntent,
      status: "running",
      step: 0,
      totalSteps: Math.max(0, Number(input.totalSteps) || 0),
      maxSteps,
      maxToolCalls,
      toolCallsUsed: 0,
      totalToolCalls: Math.max(0, Number(input.totalToolCalls) || 0),
      approvedPaidTools: false,
      paidAllowances: input.paidAllowances && typeof input.paidAllowances === "object"
        ? {
            generate_image_to_gallery: Math.max(0, Math.min(1, Number(input.paidAllowances.generate_image_to_gallery || 0))),
            run_canvas_node: Math.max(0, Math.min(1, Number(input.paidAllowances.run_canvas_node || 0))),
          }
        : { generate_image_to_gallery: getDirectImageGenerationAllowance(prompt), run_canvas_node: 0 },
      previousResponseId: "",
      pendingToolCalls: [],
      events: [],
      createdAt: Number(input.createdAt || Date.now()),
      updatedAt: Date.now(),
    };
  }

  function advanceRunState(run, turn = {}) {
    const current = { ...run };
    const maxSteps = Math.max(1, Number(current.maxSteps || MAX_STEPS));
    if (Number(current.step || 0) >= maxSteps) {
      throw new Error(`Agent reached the ${maxSteps} step limit.`);
    }
    const toolCalls = Array.isArray(turn.toolCalls) ? turn.toolCalls : [];
    const toolCallsUsed = Math.max(0, Number(current.toolCallsUsed || 0));
    const maxToolCalls = Number.isSafeInteger(current.maxToolCalls) && current.maxToolCalls > 0
      ? current.maxToolCalls
      : null;
    if (maxToolCalls && toolCallsUsed + toolCalls.length > maxToolCalls) {
      throw new Error(`Agent reached the ${maxToolCalls} tool-call limit.`);
    }
    const events = Array.isArray(current.events) ? [...current.events] : [];
    if (turn.message) events.push({ type: "assistant", text: String(turn.message), at: Date.now() });
    if (toolCalls.length) events.push({ type: "tool_calls", calls: toolCalls, at: Date.now() });
    return {
      ...current,
      step: Number(current.step || 0) + 1,
      totalSteps: Number(current.totalSteps || 0) + 1,
      toolCallsUsed: toolCallsUsed + toolCalls.length,
      totalToolCalls: Number(current.totalToolCalls || 0) + toolCalls.length,
      status: toolCalls.length ? "running" : "completed",
      previousResponseId: String(turn.responseId || turn.response_id || current.previousResponseId || ""),
      pendingToolCalls: toolCalls,
      events,
      updatedAt: Date.now(),
    };
  }

  function getToolDefinition(name) {
    return TOOL_DEFINITIONS.find((tool) => tool.name === name) || null;
  }

  return {
    MAX_STEPS,
    MAX_TOOL_CALLS,
    MAX_CONTINUATIONS,
    MAX_CANVAS_NODES,
    CANVAS_AGENT_RECOVERY_DELAYS_MS,
    TOOL_DEFINITIONS,
    TOOL_NAME_SET,
    requiresApproval,
    buildApprovalPlan,
    classifyAgentRequest,
    isPosterDesignRequest,
    resolveSkillInvocation,
    canAutoInvokeSkill,
    inspectSkillInvocation,
    classifyImageGenerationIntent,
    shouldBlockCanvasToolForDiscussion,
    getCanvasAgentRecoveryDelay,
    shouldAutoRecoverCanvasAgent,
    getCanvasAgentRecoveryPaidAllowances,
    getDirectImageGenerationAllowance,
    getSelectedImageEditGenerationAllowance,
    parseDirectImageFallbackIntent,
    consumePaidAllowances,
    isFiniteCoordinate,
    normalizeAgentReferences,
    planArrangementOffsets,
    planGridOffsets,
    planWorkflowArrangement,
    planCenteredRowLayout,
    summarizeCanvasBoard,
    shouldUseTerminalToolRun,
    getCanvasExecutionOutcome,
    isSkillInvocationProhibited,
    isCanvasOperationRequested,
    isReadOnlyImageQuestion,
    createRunState,
    advanceRunState,
    getToolDefinition,
  };
});
