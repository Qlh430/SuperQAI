const fs = require("node:fs");
const path = require("node:path");
const CanvasAgentCore = require("./canvas-agent-core");
const CanvasAgentCapabilities = require("./canvas-agent-capabilities");

const skillDocumentCache = new Map();

function parseSkillDocument(markdown, source = "SKILL.md") {
  const text = String(markdown || "").replace(/^\uFEFF/, "");
  const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)([\s\S]*)$/);
  if (!match) throw new Error(`Skill ${source} is missing YAML frontmatter.`);
  const frontmatter = parseSkillFrontmatter(match[1], source);
  const name = String(frontmatter.name || "").trim();
  const description = String(frontmatter.description || "").trim();
  if (!name) throw new Error(`Skill ${source} is missing name.`);
  if (!description) throw new Error(`Skill ${source} is missing description.`);
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) {
    throw new Error(`Skill ${source} has an invalid name: ${name}`);
  }
  const canvas = frontmatter.canvas && typeof frontmatter.canvas === "object" ? frontmatter.canvas : {};
  const declaredTools = Array.isArray(canvas.tools) ? canvas.tools.map(String) : [];
  const unknownTools = declaredTools.filter((tool) => !CanvasAgentCore.TOOL_NAME_SET.has(tool));
  if (unknownTools.length) throw new Error(`Skill ${name} declares unknown tools: ${unknownTools.join(", ")}`);
  const declaredCapabilities = Array.isArray(canvas.capabilities)
    ? canvas.capabilities.map(String)
    : CanvasAgentCapabilities.getCapabilityIdsForToolNames(declaredTools);
  const unknownCapabilities = declaredCapabilities.filter((id) => !CanvasAgentCapabilities.getCapability(id));
  if (unknownCapabilities.length) throw new Error(`Skill ${name} declares unknown capabilities: ${unknownCapabilities.join(", ")}`);
  const tools = CanvasAgentCapabilities.getToolDefinitions(declaredCapabilities).map((tool) => tool.name);
  return {
    id: name,
    name,
    description,
    canvas: {
      label: String(canvas.label || name),
      category: String(canvas.category || "general"),
      icon: String(canvas.icon || "sparkles"),
      hidden: Boolean(canvas.hidden),
      core: Boolean(canvas.core),
      required_context: String(canvas.required_context || canvas.required_selection || "none"),
      required_selection: String(canvas.required_selection || canvas.required_context || "none"),
      approval: String(canvas.approval || "before-paid-generation"),
      triggers: Array.isArray(canvas.triggers) ? canvas.triggers.map(String).filter(Boolean) : [],
      capabilities: declaredCapabilities,
      tools,
    },
    instructions: match[2].trim(),
    source,
  };
}

function parseSkillFrontmatter(source, filename) {
  const result = {};
  let section = null;
  let listKey = null;
  String(source || "").split(/\r?\n/).forEach((rawLine, index) => {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) return;
    const indent = rawLine.match(/^\s*/)[0].length;
    const line = rawLine.trim();
    if (indent === 0) {
      const pair = splitYamlPair(line, filename, index);
      if (pair.value === "") {
        result[pair.key] = {};
        section = result[pair.key];
      } else {
        result[pair.key] = parseYamlScalar(pair.value);
        section = null;
      }
      listKey = null;
      return;
    }
    if (!section || typeof section !== "object" || Array.isArray(section)) {
      throw new Error(`Skill ${filename} has unsupported indentation on line ${index + 1}.`);
    }
    if (line.startsWith("- ")) {
      if (!listKey || !Array.isArray(section[listKey])) {
        throw new Error(`Skill ${filename} has an unexpected list item on line ${index + 1}.`);
      }
      section[listKey].push(parseYamlScalar(line.slice(2).trim()));
      return;
    }
    const pair = splitYamlPair(line, filename, index);
    if (pair.value === "") {
      section[pair.key] = [];
      listKey = pair.key;
    } else {
      section[pair.key] = parseYamlScalar(pair.value);
      listKey = null;
    }
  });
  return result;
}

function splitYamlPair(line, filename, index) {
  const separator = line.indexOf(":");
  if (separator <= 0) throw new Error(`Skill ${filename} has malformed YAML on line ${index + 1}.`);
  return { key: line.slice(0, separator).trim(), value: line.slice(separator + 1).trim() };
}

function parseYamlScalar(value) {
  const text = String(value || "").trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  if (text === "true") return true;
  if (text === "false") return false;
  if (text === "null") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  if (text.startsWith("[") && text.endsWith("]")) {
    return text.slice(1, -1).split(",").map((item) => parseYamlScalar(item)).filter((item) => item !== "");
  }
  return text;
}

function loadCanvasSkills(directory) {
  if (!fs.existsSync(directory)) return { core: createFallbackCoreSkill(), business: [] };
  const skills = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const filename = path.join(directory, entry.name, "SKILL.md");
      if (!fs.existsSync(filename)) return null;
      return readCachedSkillDocument(filename, path.relative(directory, filename));
    })
    .filter(Boolean)
    .sort((left, right) => left.canvas.label.localeCompare(right.canvas.label, "zh-CN"));
  const core = skills.find((skill) => skill.canvas.core) || createFallbackCoreSkill();
  return { core, business: skills.filter((skill) => !skill.canvas.core && !skill.canvas.hidden) };
}

function readCachedSkillDocument(filename, source) {
  const mtimeMs = fs.statSync(filename).mtimeMs;
  const cached = skillDocumentCache.get(filename);
  if (cached?.mtimeMs === mtimeMs) return cached.skill;
  const skill = parseSkillDocument(fs.readFileSync(filename, "utf8"), source);
  skillDocumentCache.set(filename, { mtimeMs, skill });
  return skill;
}

function createFallbackCoreSkill(capabilityIds = CanvasAgentCapabilities.CAPABILITY_REGISTRY.map((item) => item.id)) {
  return {
    id: "canvas-agent-core",
    name: "canvas-agent-core",
    description: "Use when the canvas Agent handles the current canvas.",
    canvas: {
      label: "画布 Agent 核心",
      category: "system",
      icon: "sparkles",
      hidden: true,
      core: true,
      required_context: "current-canvas",
      required_selection: "current-canvas",
      approval: "risk-based",
      triggers: [],
      capabilities: [...capabilityIds],
      tools: CanvasAgentCapabilities.getToolDefinitions(capabilityIds).map((tool) => tool.name),
    },
    instructions: [
      "一次任务只操作发起时的当前画布。",
      "普通交流和头脑风暴不要调用工具；出现明确可执行意图后，安全操作直接执行。",
      "全权委托时自行补全合理细节；除明确直接单张生图的一次任务授权外，付费生成、删除和批量覆盖必须等待确认。",
      "用户明确要求直接生成一张图片且没有相关旧生成节点时，优先调用 generate_image_to_gallery；默认 model 传 null，由执行层只在 gpt-image-2（image2）接口中择优。只有用户明确指定模型时才传模型名，指定模型不可用时停止，不得替换成其他模型。",
      "发现与当前需求明显相关的旧图片生成节点时，不得直接运行；先调用 request_image_node_choice 定位并高亮，然后等待用户选择原样再生成、修改后生成或新建生成。用户已经明确点击选择时直接按选择执行，不要再次请求选择。",
      "用户要求定位节点时调用 focus_canvas_nodes；它只移动视图和高亮，不移动节点。用户要求整理当前画布或把节点排整齐时，调用 organize_canvas_nodes；有选中节点时仅整理选中节点，否则整理当前画布中未打组的独立节点，默认 direction 为 auto 且 center_view 为 true。自动整理必须保持连线关系，按上游在左、下游在右、同层纵向对齐的方式排布工作流。",
      "用户明确图片裁切比例时调用 crop_canvas_image，默认保留原图并创建裁切副本；未给出裁切比例时也可调用它打开交互裁切器。用户要求绘制遮罩时调用 open_canvas_mask_editor，遮罩形状必须由用户手绘。",
      "用户说模型不可用、太慢或要换一个可用模型时，先定位当前画布相关生成节点；未指定模型时优先保留模型系列并使用已启用的可用候选。换模型不得修改全局 Agent 路由、API、密钥或其他画布。",
      "run_canvas_node 返回 gallery_node_id 和正数 image_count 代表结果已经写入图集，不得再调用 update_gallery。询问、比较、只讨论或只创建节点时不得调用付费生成。",
      "工具失败时保留成功结果并安全恢复，不重复付费操作，不虚构结果。",
    ].join("\n"),
    source: "built-in",
  };
}

function normalizeSkillCatalog(value) {
  if (value && !Array.isArray(value) && value.core && Array.isArray(value.business)) return value;
  const business = (Array.isArray(value) ? value : []).filter((skill) => !skill?.canvas?.core && !skill?.canvas?.hidden);
  const ids = Array.from(new Set(business.flatMap((skill) => skill?.canvas?.capabilities || [])));
  return { core: createFallbackCoreSkill(ids.length ? [...ids, "skill.activate"] : undefined), business };
}

function getPublicSkillMetadata(skills) {
  return normalizeSkillCatalog(skills).business.map((skill) => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    label: skill.canvas.label,
    category: skill.canvas.category,
    icon: skill.canvas.icon,
    required_selection: skill.canvas.required_selection,
    approval: skill.canvas.approval,
    triggers: [...skill.canvas.triggers],
    capabilities: [...skill.canvas.capabilities],
    tools: [...skill.canvas.tools],
  }));
}

function buildResponsesRequest(payload = {}, options = {}) {
  const step = Number(payload.step || 0);
  if (!Number.isSafeInteger(step) || step < 0 || step >= CanvasAgentCore.MAX_STEPS) {
    throw new Error(`Canvas Agent allows ${CanvasAgentCore.MAX_STEPS} turns; step must be between 0 and ${CanvasAgentCore.MAX_STEPS - 1}.`);
  }
  const skillContext = resolveCanvasAgentSkillContext(payload, normalizeSkillCatalog(options.skills));

  const model = String(options.model || "gpt-5.6-terra").trim();
  const reasoningEffort = normalizeReasoningEffort(options.reasoningEffort);
  const tools = CanvasAgentCapabilities.getMcpTools(skillContext.capabilityIds).map(toResponsesTool);
  const request = {
    model,
    instructions: skillContext.instructions,
    tools,
    parallel_tool_calls: false,
    reasoning: { effort: reasoningEffort },
    text: { verbosity: "low" },
    max_output_tokens: 4096,
    store: true,
  };

  const previousResponseId = String(payload.previous_response_id || "").trim();
  const contextTranscript = normalizeResponsesTranscript(options.contextTranscript || payload.conversation_context);
  const transcript = normalizeResponsesTranscript(options.transcript || payload.transcript);
  const forceStateless = Boolean(options.forceStateless || contextTranscript.length || transcript.length);
  if (previousResponseId && !forceStateless) {
    const toolOutputs = normalizeToolOutputs(payload.tool_outputs);
    if (!toolOutputs.length) throw new Error("Canvas Agent continuation requires tool outputs.");
    request.previous_response_id = previousResponseId;
    request.input = toolOutputs;
    return request;
  }

  request.input = [...contextTranscript];
  const prompt = String(payload.prompt || "").trim();
  if (prompt) {
    const canvas = payload.canvas && typeof payload.canvas === "object" ? payload.canvas : {};
    const content = [{
      type: "input_text",
      text: `${prompt}\n\n当前画布上下文（JSON）：\n${JSON.stringify(canvas)}`,
    }];
    normalizeVisionImages(payload.vision_images).forEach((imageUrl) => {
      content.push({ type: "input_image", image_url: imageUrl });
    });
    request.input.push({ role: "user", content });
  }
  request.input.push(...transcript);
  if (forceStateless) request.input.push(...normalizeToolOutputs(payload.tool_outputs));
  if (!request.input.length) throw new Error("Canvas Agent prompt or transcript is required.");
  return request;
}

function resolveCanvasAgentSkillContext(payload = {}, skills = {}) {
  const catalog = normalizeSkillCatalog(skills);
  const requestedSkillId = String(payload.skill_id || "").trim();
  const manualId = payload.skill_mode === "manual" || payload.skill_mode !== "auto" && requestedSkillId
    ? requestedSkillId
    : "";
  const activeId = manualId || String(payload.active_skill_id || "").trim();
  const activeSkill = activeId ? catalog.business.find((skill) => skill.id === activeId) : null;
  if (activeId && !activeSkill) throw new Error(`Unknown Canvas Agent skill: ${activeId}.`);
  const coreCapabilities = new Set(catalog.core.canvas.capabilities);
  const capabilityIds = activeSkill
    ? activeSkill.canvas.capabilities.filter((id) => coreCapabilities.has(id))
    : [...coreCapabilities];
  if (!activeSkill && coreCapabilities.has("skill.activate")) capabilityIds.push("skill.activate");
  return {
    mode: manualId ? "manual" : activeSkill ? "activated" : "auto",
    activeSkill,
    capabilityIds: Array.from(new Set(capabilityIds)),
    instructions: buildCoreInstructions(catalog.core, activeSkill, catalog.business),
  };
}

function buildCoreInstructions(core, activeSkill, businessSkills) {
  const routing = (Array.isArray(businessSkills) ? businessSkills : []).map((skill) => [
    `- ${skill.id}（${skill.canvas.label}）`,
    `适用：${skill.description}`,
    `触发词：${skill.canvas.triggers.join("、") || "无"}`,
    `能力：${skill.canvas.capabilities.join(", ")}`,
  ].join("；")).join("\n");
  return [
    "你是无限画布中的工具型设计 Agent。",
    core.instructions,
    activeSkill
      ? `\n--- 当前业务 Skill：${activeSkill.id}（${activeSkill.canvas.label}）---\n${activeSkill.instructions}`
      : `\n--- 可选业务 Skill 路由目录 ---\n${routing || "当前没有可用业务 Skill。"}\n专业需求先调用 activate_canvas_skill；普通聊天和常规画布操作不要激活 Skill。`,
  ].join("\n");
}

function normalizeToolOutputs(value) {
  return (Array.isArray(value) ? value : []).slice(0, 16).map((item) => {
    const callId = String(item?.call_id || "").trim();
    if (!callId) throw new Error("Canvas Agent tool output is missing call_id.");
    return {
      type: "function_call_output",
      call_id: callId,
      output: typeof item.output === "string" ? item.output : JSON.stringify(item.output ?? null),
    };
  });
}

function normalizeResponsesTranscript(value) {
  return (Array.isArray(value) ? value : []).slice(-CanvasAgentCore.MAX_STEPS * 3).flatMap((item) => {
    const role = String(item?.role || "").toLowerCase();
    if (role === "user") {
      const content = typeof item.content === "string" ? item.content : "";
      return content ? [{ role: "user", content: [{ type: "input_text", text: content }] }] : [];
    }
    if (role === "assistant") {
      const output = [];
      const content = typeof item.content === "string" ? item.content : "";
      if (content) output.push({ role: "assistant", content: [{ type: "output_text", text: content }] });
      (Array.isArray(item.tool_calls) ? item.tool_calls : []).forEach((call) => {
        const callId = String(call.call_id || call.id || "").trim();
        const name = String(call.name || call.function?.name || "").trim();
        if (!callId || !name) return;
        output.push({
          type: "function_call",
          call_id: callId,
          name,
          arguments: typeof call.arguments === "string"
            ? call.arguments
            : JSON.stringify(call.arguments || call.function?.arguments || {}),
        });
      });
      return output;
    }
    if (role === "tool") {
      const callId = String(item.call_id || item.tool_call_id || "").trim();
      if (!callId) return [];
      return [{
        type: "function_call_output",
        call_id: callId,
        output: typeof item.content === "string" ? item.content : JSON.stringify(item.content ?? null),
      }];
    }
    return [];
  });
}

function normalizeVisionImages(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item || ""))
    .filter((item) => /^data:image\/(?:png|jpeg|webp);base64,/i.test(item) || /^https:\/\//i.test(item))
    .slice(0, 3);
}

function normalizeReasoningEffort(value) {
  const effort = String(value || "medium").toLowerCase();
  return ["none", "low", "medium", "high", "xhigh", "max"].includes(effort) ? effort : "medium";
}

function selectAgentReasoningEffort(payload = {}, configured = "medium") {
  const effort = normalizeReasoningEffort(configured);
  const step = Math.max(0, Number(payload.step || 0));
  const manualSkill = payload.skill_mode === "manual" && String(payload.skill_id || "").trim();
  const continuation = step > 0
    || String(payload.previous_response_id || "").trim()
    || Array.isArray(payload.tool_outputs) && payload.tool_outputs.length;
  return manualSkill || continuation ? effort : "low";
}

function buildChatCompletionsRequest(payload = {}, options = {}) {
  const step = Number(payload.step || 0);
  if (!Number.isSafeInteger(step) || step < 0 || step >= CanvasAgentCore.MAX_STEPS) {
    throw new Error(`Canvas Agent allows ${CanvasAgentCore.MAX_STEPS} turns; step must be between 0 and ${CanvasAgentCore.MAX_STEPS - 1}.`);
  }
  const skillContext = resolveCanvasAgentSkillContext(payload, normalizeSkillCatalog(options.skills));
  const tools = CanvasAgentCapabilities.getMcpTools(skillContext.capabilityIds).map(toChatTool);
  const messages = [{
    role: "system",
    content: skillContext.instructions,
  }];
  normalizeChatTranscript(options.contextTranscript || payload.conversation_context).forEach((message) => messages.push(message));

  const prompt = String(payload.prompt || "").trim();
  if (prompt) {
    const canvas = payload.canvas && typeof payload.canvas === "object" ? payload.canvas : {};
    const content = [{
      type: "text",
      text: `${prompt}\n\n当前画布上下文（JSON）：\n${JSON.stringify(canvas)}`,
    }];
    normalizeVisionImages(payload.vision_images).forEach((imageUrl) => {
      content.push({ type: "image_url", image_url: { url: imageUrl } });
    });
    messages.push({ role: "user", content });
  }

  normalizeChatTranscript(options.transcript || payload.transcript).forEach((message) => messages.push(message));

  normalizeToolOutputs(payload.tool_outputs).forEach((item) => {
    messages.push({ role: "tool", tool_call_id: item.call_id, content: item.output });
  });
  if (messages.length === 1) throw new Error("Canvas Agent prompt or transcript is required.");

  return {
    model: String(options.model || "gpt-5.6-terra").trim(),
    messages,
    tools,
    tool_choice: "auto",
    parallel_tool_calls: false,
    stream: true,
    max_tokens: 4096,
  };
}

function buildProviderTurnRequest(payload = {}, options = {}) {
  const request = buildChatCompletionsRequest(payload, {
    ...options,
    model: "provider-selected",
  });
  const systemIndex = request.messages.findIndex((message) => message.role === "system");
  const systemMessage = systemIndex >= 0 ? request.messages[systemIndex] : null;
  return {
    system: String(systemMessage?.content || ""),
    messages: request.messages.filter((_message, index) => index !== systemIndex),
    tools: request.tools,
    toolChoice: request.tool_choice || "auto",
    needsVision: normalizeVisionImages(payload.vision_images).length > 0,
    params: {
      max_tokens: Number(request.max_tokens || 4096),
      reasoning_effort: normalizeReasoningEffort(options.reasoningEffort),
      parallel_tool_calls: request.parallel_tool_calls !== false,
    },
  };
}

function normalizeChatTranscript(value) {
  return (Array.isArray(value) ? value : []).slice(-CanvasAgentCore.MAX_STEPS * 3).flatMap((item) => {
    const role = String(item?.role || "").toLowerCase();
    if (role === "user" || role === "system") {
      const content = typeof item.content === "string" ? item.content : "";
      return content ? [{ role, content }] : [];
    }
    if (role === "assistant") {
      const content = typeof item.content === "string" ? item.content : "";
      const toolCalls = (Array.isArray(item.tool_calls) ? item.tool_calls : []).map((call) => ({
        id: String(call.call_id || call.id || ""),
        type: "function",
        function: {
          name: String(call.name || call.function?.name || ""),
          arguments: typeof call.arguments === "string"
            ? call.arguments
            : JSON.stringify(call.arguments || call.function?.arguments || {}),
        },
      })).filter((call) => call.id && call.function.name);
      return content || toolCalls.length ? [{ role: "assistant", content: content || null, tool_calls: toolCalls }] : [];
    }
    if (role === "tool") {
      const callId = String(item.call_id || item.tool_call_id || "").trim();
      if (!callId) return [];
      return [{
        role: "tool",
        tool_call_id: callId,
        content: typeof item.content === "string" ? item.content : JSON.stringify(item.content ?? null),
      }];
    }
    return [];
  });
}

function extractResponsesTurn(response = {}) {
  const messages = [];
  const toolCalls = [];
  (Array.isArray(response.output) ? response.output : []).forEach((item) => {
    if (item?.type === "message") {
      (Array.isArray(item.content) ? item.content : []).forEach((content) => {
        if (content?.type === "output_text" && content.text) messages.push(String(content.text));
      });
    }
    if (item?.type === "function_call") {
      const args = parseToolArguments(item.arguments, item.name);
      toolCalls.push({
        call_id: String(item.call_id || item.id || ""),
        name: String(item.name || ""),
        arguments: args && typeof args === "object" ? args : {},
      });
    }
  });
  return {
    response_id: String(response.id || ""),
    model: String(response.model || ""),
    message: messages.join("\n").trim(),
    tool_calls: toolCalls,
    usage: response.usage || null,
  };
}

function extractChatCompletionsTurn(response = {}) {
  const choice = Array.isArray(response.choices) ? response.choices[0] : null;
  const message = choice?.message || {};
  const text = Array.isArray(message.content)
    ? message.content.map((item) => typeof item === "string" ? item : item?.text || "").join("")
    : String(message.content || "");
  const toolCalls = (Array.isArray(message.tool_calls) ? message.tool_calls : []).map((call) => ({
    call_id: String(call?.id || call?.call_id || ""),
    name: String(call?.function?.name || call?.name || ""),
    arguments: parseToolArguments(call?.function?.arguments ?? call?.arguments, call?.function?.name || call?.name),
  })).filter((call) => call.call_id && call.name);
  return {
    response_id: String(response.id || ""),
    model: String(response.model || ""),
    message: text.trim(),
    tool_calls: toolCalls,
    usage: response.usage || null,
  };
}

function parseToolArguments(value, name) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(String(value || "{}"));
  } catch {
    const error = new Error(`Canvas Agent returned invalid arguments for ${name || "unknown tool"}.`);
    error.code = "INVALID_AGENT_RESPONSE";
    throw error;
  }
}

async function consumeResponsesStream(stream, callbacks = {}) {
  let responseId = "";
  let model = "";
  let message = "";
  let usage = null;
  let completedTurn = null;
  const toolItems = new Map();
  let firstEventSeen = false;
  const markFirstEvent = () => {
    if (firstEventSeen) return;
    firstEventSeen = true;
    callbacks.onFirstEvent?.();
  };

  await consumeSseData(stream, (data) => {
    const event = parseStreamJson(data);
    responseId ||= String(event.response?.id || event.id || "");
    model ||= String(event.response?.model || event.model || "");
    if (event.type === "response.output_text.delta" && event.delta) {
      markFirstEvent();
      message += String(event.delta);
      callbacks.onTextDelta?.(String(event.delta));
    }
    if (event.type === "response.output_item.added" && event.item?.type === "function_call") {
      markFirstEvent();
      const key = String(event.item.id || event.item.call_id || event.output_index || toolItems.size);
      toolItems.set(key, {
        call_id: String(event.item.call_id || event.item.id || ""),
        name: String(event.item.name || ""),
        arguments: String(event.item.arguments || ""),
      });
    }
    if (event.type === "response.function_call_arguments.delta") {
      markFirstEvent();
      const key = String(event.item_id || event.call_id || event.output_index || "");
      const item = toolItems.get(key) || { call_id: String(event.call_id || key), name: String(event.name || ""), arguments: "" };
      item.arguments += String(event.delta || "");
      toolItems.set(key, item);
    }
    if (event.type === "response.output_item.done" && event.item?.type === "function_call") {
      markFirstEvent();
      const key = String(event.item.id || event.item.call_id || event.output_index || toolItems.size);
      toolItems.set(key, {
        call_id: String(event.item.call_id || event.item.id || ""),
        name: String(event.item.name || ""),
        arguments: typeof event.item.arguments === "string" ? event.item.arguments : JSON.stringify(event.item.arguments || {}),
      });
    }
    if (event.type === "response.completed" && event.response) {
      markFirstEvent();
      completedTurn = extractResponsesTurn(event.response);
      usage = event.response.usage || usage;
    }
    if (event.type === "error" || event.error) throw makeStreamError(event.error || event);
  });

  if (completedTurn) return completedTurn;
  const toolCalls = [...toolItems.values()].map((item) => ({
    call_id: item.call_id,
    name: item.name,
    arguments: parseToolArguments(item.arguments, item.name),
  })).filter((item) => item.call_id && item.name);
  if (!message && !toolCalls.length) throw makeInvalidStreamError("Canvas Agent Responses stream ended without output.");
  return { response_id: responseId, model, message: message.trim(), tool_calls: toolCalls, usage };
}

async function consumeChatCompletionsStream(stream, callbacks = {}) {
  let responseId = "";
  let model = "";
  let message = "";
  let usage = null;
  let firstEventSeen = false;
  const toolItems = new Map();
  const markFirstEvent = () => {
    if (firstEventSeen) return;
    firstEventSeen = true;
    callbacks.onFirstEvent?.();
  };
  await consumeSseData(stream, (data) => {
    const chunk = parseStreamJson(data);
    responseId ||= String(chunk.id || "");
    model ||= String(chunk.model || "");
    usage = chunk.usage || usage;
    const delta = Array.isArray(chunk.choices) ? chunk.choices[0]?.delta || {} : {};
    if (delta.content) {
      markFirstEvent();
      message += String(delta.content);
      callbacks.onTextDelta?.(String(delta.content));
    }
    (Array.isArray(delta.tool_calls) ? delta.tool_calls : []).forEach((call, fallbackIndex) => {
      markFirstEvent();
      const key = Number.isInteger(call.index) ? call.index : fallbackIndex;
      const item = toolItems.get(key) || { call_id: "", name: "", arguments: "" };
      item.call_id ||= String(call.id || "");
      item.name += String(call.function?.name || "");
      item.arguments += String(call.function?.arguments || "");
      toolItems.set(key, item);
    });
    if (chunk.error) throw makeStreamError(chunk.error);
  });
  const toolCalls = [...toolItems.values()].map((item) => ({
    call_id: item.call_id,
    name: item.name,
    arguments: parseToolArguments(item.arguments, item.name),
  })).filter((item) => item.call_id && item.name);
  if (!message && !toolCalls.length) throw makeInvalidStreamError("Canvas Agent chat stream ended without output.");
  return { response_id: responseId, model, message: message.trim(), tool_calls: toolCalls, usage };
}

async function consumeSseData(stream, onData) {
  if (!stream || typeof stream.getReader !== "function") throw makeInvalidStreamError("Canvas Agent upstream did not return a readable stream.");
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    if (buffer.length > 1024 * 1024) throw makeInvalidStreamError("Canvas Agent stream event exceeded 1 MiB.");
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = done ? "" : events.pop() || "";
    for (const block of events) {
      const data = block.split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n")
        .trim();
      if (!data || data === "[DONE]") continue;
      onData(data);
    }
    if (done) {
      const data = buffer.trim().replace(/^data:\s*/, "");
      if (data && data !== "[DONE]") onData(data);
      break;
    }
  }
}

function parseStreamJson(value) {
  try {
    return JSON.parse(String(value || ""));
  } catch {
    throw makeInvalidStreamError("Canvas Agent upstream returned invalid stream JSON.");
  }
}

function makeInvalidStreamError(message) {
  const error = new Error(message);
  error.code = "INVALID_SSE";
  return error;
}

function makeStreamError(value) {
  const message = value?.message || value?.error?.message || value?.error || "Canvas Agent upstream stream failed.";
  const error = new Error(String(message));
  error.httpStatus = Number(value?.status || value?.code || 0) || 0;
  return error;
}

function normalizeResponsesApiUrl(value) {
  const cleanUrl = String(value || "").trim().replace(/\/+$/, "");
  if (!cleanUrl) return "https://api.openai.com/v1/responses";
  if (/\/responses$/i.test(cleanUrl)) return cleanUrl;
  if (/\/chat\/completions$/i.test(cleanUrl)) return cleanUrl.replace(/\/chat\/completions$/i, "/responses");
  if (/\/v1$/i.test(cleanUrl)) return `${cleanUrl}/responses`;
  return `${cleanUrl}/v1/responses`;
}

function toResponsesTool(tool = {}) {
  return {
    type: "function",
    name: String(tool.name || ""),
    description: String(tool.description || ""),
    strict: true,
    parameters: tool.inputSchema || { type: "object", properties: {}, additionalProperties: false },
  };
}

function toChatTool(tool = {}) {
  const providerTool = toResponsesTool(tool);
  const { type: _type, ...definition } = providerTool;
  return { type: "function", function: definition };
}

module.exports = {
  parseSkillDocument,
  loadCanvasSkills,
  getPublicSkillMetadata,
  resolveCanvasAgentSkillContext,
  buildResponsesRequest,
  buildChatCompletionsRequest,
  buildProviderTurnRequest,
  extractResponsesTurn,
  extractChatCompletionsTurn,
  selectAgentReasoningEffort,
  consumeResponsesStream,
  consumeChatCompletionsStream,
  normalizeResponsesApiUrl,
  toResponsesTool,
  toChatTool,
};
