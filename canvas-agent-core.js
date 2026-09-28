(function initCanvasAgentCore(root, factory) {
  const capabilities = typeof module === "object" && module.exports
    ? require("./canvas-agent-capabilities")
    : root?.CanvasAgentCapabilities;
  const api = factory(capabilities);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasAgentCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasAgentCore(CanvasAgentCapabilities) {
  if (!CanvasAgentCapabilities) throw new Error("CanvasAgentCapabilities is required before CanvasAgentCore.");
  const MAX_STEPS = 12;
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
    "focus_canvas_nodes",
    "connect_nodes",
    "disconnect_nodes",
    "canvas_director3d_apply_animation",
  ]);
  const DISCUSSION_IMAGE_TOOL_NAMES = new Set([
    "generate_image_to_gallery",
    "request_image_node_choice",
    "run_canvas_node",
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

  function classifyImageGenerationIntent(prompt) {
    const text = String(prompt || "").trim();
    if (!text) return "neutral";
    if (/不要生成|别生成|先不生成|暂不生成|不要出图|先别出图|只讨论|先讨论|先聊|先给我提示词|先看参数|先优化提示词|等我确认|先确认|只建节点|自己再调/.test(text)) {
      return "discussion";
    }
    if (/怎么|如何|为什么|能不能|是否|可以吗|可不可以|[?？]\s*$/.test(text)) return "neutral";
    const explicitExecute = /(?:我)?(?:想要|要)(?:一张|1\s*张)|(?:直接|现在|开始)(?:生成|出图|画)|(?:生成|出图|画一张)\s*[。！!]*$/.test(text);
    const directImage = /(想要|要|生成|画|绘制|出图|做)(?:一张|1\s*张|一个)?[^。！？]{0,28}(图|图片|海报|主视觉|插画)/.test(text);
    const contextualExecute = /(?:就|直接|现在|开始|请)?按[^。！？]{0,24}(方案|方向|刚才|上面|这个)[^。！？]{0,16}(生成|出图|做)/.test(text);
    return explicitExecute || directImage || contextualExecute ? "execute" : "neutral";
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
    if (!hasSelectedImage || classifyImageGenerationIntent(prompt) === "discussion") return 0;
    const text = String(prompt || "").trim();
    if (!text) return 0;
    return /(编辑|修改|替换|改成|变成|换成|放在|放到|放进|置入|移到|添加|加上|去掉|删除|移除|扩图|裁切|重绘|修复|美化|增强)/.test(text) ? 1 : 0;
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

  function summarizeCanvasBoard(board = {}, selectedIds = []) {
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
    const orderedIds = [...new Set([
      ...requestedSelected,
      ...connectedIds,
      ...sourceNodes.map((node) => String(node?.id || "")),
    ])].filter((id) => sourceById.has(id)).slice(0, MAX_CANVAS_NODES);
    const nodes = orderedIds.map((id) => summarizeCanvasNode(sourceById.get(id), selectedSet.has(id)));
    const nodeIds = new Set(nodes.map((node) => node.id));
    const selected = requestedSelected.filter((id) => nodeIds.has(id));
    const connections = (Array.isArray(board.connections) ? board.connections : [])
      .filter((item) => nodeIds.has(String(item?.from)) && nodeIds.has(String(item?.to)))
      .slice(0, 160)
      .map((item) => ({
        from: String(item.from),
        to: String(item.to),
        to_port: String(item.toPort || item.to_port || "input"),
      }));
    return {
      id: String(board.id || ""),
      title: trimText(board.title, 160),
      selected_node_ids: selected,
      nodes,
      connections,
    };
  }

  function summarizeCanvasNode(node = {}, detailed = false) {
    const textLimit = detailed ? MAX_TEXT_LENGTH : COMPACT_TEXT_LENGTH;
    const kind = String(node.kind || "unknown");
    const summary = {
      id: String(node.id || ""),
      kind,
      x: finiteNumber(node.x),
      y: finiteNumber(node.y),
    };
    if (kind === "text") summary.text = trimText(node.text, textLimit);
    if (kind === "note") summary.text = trimText(node.text, textLimit);
    if (kind === "image") {
      summary.image_name = trimText(node.imageName || "图片", 240);
      summary.image_url = safeAssetUrl(node.resultSrc || node.imageSrc);
      summary.original_image_url = safeAssetUrl(node.originalSrc || node.imageSrc);
      summary.prompt = trimText(node.prompt, textLimit);
      summary.model = trimText(node.model, 240);
      summary.size = trimText(node.size, 80);
      summary.resolution = trimText(node.resolution, 80);
      summary.is_upload_only = Boolean(node.uploadOnly);
    }
    if (kind === "gallery") {
      summary.title = trimText(node.galleryTitle || "生成图集", 240);
      summary.image_count = Array.isArray(node.galleryImages) ? node.galleryImages.length : 0;
    }
    if (kind === "llm") {
      summary.prompt = trimText(node.llmPrompt, textLimit);
      summary.output = trimText(node.llmOutput, textLimit);
      summary.model = trimText(node.llmModel, 240);
    }
    if (kind === "minimax-h3") {
      summary.prompt = trimText(node.minimaxH3Prompt, textLimit);
      summary.aspect_ratio = trimText(node.minimaxH3AspectRatio, 32);
      summary.duration = finiteNumber(node.minimaxH3Duration);
    }
    if (kind === "midjourney") {
      summary.prompt = trimText(node.midjourneyPrompt, textLimit);
      summary.operation = trimText(node.midjourneyOperation || "imagine", 32);
      summary.model = trimText(node.midjourneyModel, 240);
      summary.size = trimText(node.midjourneySize, 32);
      summary.version = trimText(node.midjourneyVersion, 32);
      summary.speed = trimText(node.midjourneySpeed, 32);
    }
    if (kind === "comfy") summary.mode = trimText(node.comfyMode, 120);
    return summary;
  }

  function safeAssetUrl(value) {
    const text = String(value || "");
    if (!text || text.startsWith("data:")) return text ? "[inline-image]" : "";
    return trimText(text, 1200);
  }

  function trimText(value, limit) {
    return String(value || "").slice(0, limit);
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
      ? Math.min(24, input.maxSteps)
      : MAX_STEPS;
    const maxToolCalls = Number.isSafeInteger(input.maxToolCalls) && input.maxToolCalls > 0
      ? Math.min(64, input.maxToolCalls)
      : null;
    return {
      id: String(input.id || `agent_${Date.now()}`),
      prompt,
      skillId: String(input.skillId || ""),
      imageGenerationIntent,
      status: "running",
      step: 0,
      maxSteps,
      maxToolCalls,
      toolCallsUsed: 0,
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
      toolCallsUsed: toolCallsUsed + toolCalls.length,
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
    MAX_CANVAS_NODES,
    CANVAS_AGENT_RECOVERY_DELAYS_MS,
    TOOL_DEFINITIONS,
    TOOL_NAME_SET,
    requiresApproval,
    buildApprovalPlan,
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
    planWorkflowArrangement,
    planCenteredRowLayout,
    summarizeCanvasBoard,
    shouldUseTerminalToolRun,
    createRunState,
    advanceRunState,
    getToolDefinition,
  };
});
