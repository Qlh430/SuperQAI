const fs = require("node:fs");
const path = require("node:path");
const CanvasAgentCore = require("./canvas-agent-core");
const CanvasAgentCapabilities = require("./canvas-agent-capabilities");
const CanvasAgentSkillContract = require("./canvas-agent-skill-contract");

const skillDocumentCache = new Map();
const skillExecutionManifestCache = new Map();
const SKILL_EXECUTION_FORMAT = "canvas-agent-skill/v1";
const MINIMAX_H3_SKILL_PACK_LABEL = "MiniMax H3 Skills";
const MINIMAX_H3_SKILL_PACK_MARKER = "MiniMax H3 Skills 官方技能包";
const MINIMAX_H3_SKILL_PACK_IDS = new Set([
  "3d-animation-short-generator",
  "brand-promo-video-generator",
  "co-op-game-intro-generator",
  "h3-prompt-writing",
  "handdrawn-live-video-generator",
  "minimalist-product-ad-generator",
  "music-video-subtitle-generator",
  "paper-collage-explainer-generator",
  "papercraft-stop-motion-explainer",
]);

function normalizeSkillPackId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "") || "custom";
}

/**
 * 功能 Skill 的安装包归属。优先采用 Skill frontmatter 里声明的 metadata.pack，
 * 官方 MiniMax 包再加一层兼容识别，避免旧安装包升级后回落到大类分组。
 */
function resolveSkillPackage(skill, origin = skill?.origin) {
  if (String(origin || "") !== "custom") return null;
  const metadata = skill?.metadata && typeof skill.metadata === "object" ? skill.metadata : {};
  const canvas = skill?.canvas && typeof skill.canvas === "object" ? skill.canvas : {};
  const declaredLabel = String(
    canvas.pack
      || metadata.pack
      || metadata.package
      || metadata["skill-pack"]
      || "",
  ).trim();
  const instructions = String(skill?.instructions || "");
  const label = declaredLabel
    || (MINIMAX_H3_SKILL_PACK_IDS.has(String(skill?.id || "")) || instructions.includes(MINIMAX_H3_SKILL_PACK_MARKER)
      ? MINIMAX_H3_SKILL_PACK_LABEL
      : "");
  if (!label) {
    return {
      id: "custom:standalone",
      label: "独立功能 Skill",
      standalone: true,
    };
  }
  return {
    id: `custom-pack:${normalizeSkillPackId(label)}`,
    label,
    standalone: false,
  };
}

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
  const metadata = frontmatter.metadata && typeof frontmatter.metadata === "object" ? { ...frontmatter.metadata } : {};
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
    metadata,
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

function readSkillExecutionManifest(skill, skillDirectory, references = []) {
  const filename = path.join(skillDirectory, "agent.skill.json");
  if (!fs.existsSync(filename)) return null;
  const mtimeMs = fs.statSync(filename).mtimeMs;
  const cached = skillExecutionManifestCache.get(filename);
  if (cached?.mtimeMs === mtimeMs) return cloneSkillExecution(cached.execution);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filename, "utf8"));
  } catch (error) {
    throw new Error(`Skill ${skill.id} has invalid agent.skill.json: ${error.message}`);
  }
  const execution = normalizeSkillExecutionManifest(skill, parsed, references);
  skillExecutionManifestCache.set(filename, { mtimeMs, execution });
  return cloneSkillExecution(execution);
}

function normalizeSkillExecutionManifest(skill, value, references = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Skill ${skill.id} agent.skill.json must be a JSON object.`);
  }
  if (String(value.format || "") !== SKILL_EXECUTION_FORMAT) {
    throw new Error(`Skill ${skill.id} agent.skill.json format must be ${SKILL_EXECUTION_FORMAT}.`);
  }
  const mode = String(value.mode || "").trim();
  if (!["procedure", "guided"].includes(mode)) {
    throw new Error(`Skill ${skill.id} agent.skill.json declares unsupported mode: ${mode || "(empty)"}.`);
  }
  const exposure = String(value.exposure || "manual").trim();
  if (!["manual", "agent"].includes(exposure)) {
    throw new Error(`Skill ${skill.id} agent.skill.json declares unsupported exposure: ${exposure}.`);
  }
  const referencePaths = new Set((Array.isArray(references) ? references : [])
    .map((item) => String(item?.path || "").trim())
    .filter(Boolean));
  const skillTools = new Set(Array.isArray(skill?.canvas?.tools) ? skill.canvas.tools.map(String) : []);
  const stages = (Array.isArray(value.stages) ? value.stages : []).map((stage, index) => {
    const id = String(stage?.id || "").trim();
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) {
      throw new Error(`Skill ${skill.id} agent.skill.json stage ${index + 1} has an invalid id.`);
    }
    const mustRead = uniqueStrings(stage?.mustRead);
    mustRead.forEach((referencePath) => {
      if (!referencePaths.has(referencePath)) {
        throw new Error(`Skill ${skill.id} stage ${id} requires undeclared reference: ${referencePath}.`);
      }
    });
    const tools = uniqueStrings(stage?.tools);
    tools.forEach((toolName) => {
      if (!skillTools.has(toolName)) {
        throw new Error(`Skill ${skill.id} stage ${id} uses a tool outside canvas.tools: ${toolName}.`);
      }
    });
    const deliverable = normalizeSkillDeliverable(stage?.deliverable, id, skill.id);
    return {
      id,
      label: String(stage?.label || id).trim(),
      always: stage?.always === true,
      whenAll: uniqueStrings(stage?.whenAll),
      whenAny: uniqueStrings(stage?.whenAny),
      whenNone: uniqueStrings(stage?.whenNone),
      mustRead,
      tools,
      deliverable,
    };
  });
  if (!stages.length) {
    throw new Error(`Skill ${skill.id} agent.skill.json must declare at least one stage.`);
  }
  if (new Set(stages.map((stage) => stage.id)).size !== stages.length) {
    throw new Error(`Skill ${skill.id} agent.skill.json contains duplicate stage ids.`);
  }
  const limits = value.limits && typeof value.limits === "object" ? value.limits : {};
  return {
    format: SKILL_EXECUTION_FORMAT,
    mode,
    exposure,
    allowImplicitInvocation: exposure === "agent" && value.allowImplicitInvocation === true,
    limits: {
      maxRounds: clampInteger(limits.maxRounds, 1, 24, 12),
      maxToolCalls: clampInteger(limits.maxToolCalls, 1, 64, 16),
    },
    stages,
  };
}

function normalizeSkillDeliverable(value, stageId, skillId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rules = (Array.isArray(value.rules) ? value.rules : []).map((rule, index) => {
    const groups = (Array.isArray(rule?.groups) ? rule.groups : [])
      .map(uniqueStrings)
      .filter((group) => group.length);
    const label = String(rule?.label || "").trim();
    if (!label || !groups.length) {
      throw new Error(`Skill ${skillId} stage ${stageId} deliverable rule ${index + 1} is invalid.`);
    }
    return {
      key: String(rule?.key || label).trim(),
      label,
      groups,
      requiresTable: rule?.requiresTable === true,
      requiresQuestion: rule?.requiresQuestion === true,
      messageAllowed: rule?.messageAllowed === true,
    };
  });
  return {
    code: String(value.code || "").trim(),
    label: String(value.label || `${skillId} · ${stageId}`).trim(),
    toolNames: uniqueStrings(value.toolNames),
    requireCanvasTextNode: value.requireCanvasTextNode !== false,
    rules,
  };
}

function uniqueStrings(value) {
  return Array.from(new Set((Array.isArray(value) ? value : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)));
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function cloneSkillExecution(execution) {
  if (!execution || typeof execution !== "object") return null;
  return {
    ...execution,
    limits: execution.limits && typeof execution.limits === "object" ? { ...execution.limits } : {},
    stages: (Array.isArray(execution.stages) ? execution.stages : []).map((stage) => ({
      ...stage,
      whenAll: [...(stage.whenAll || [])],
      whenAny: [...(stage.whenAny || [])],
      whenNone: [...(stage.whenNone || [])],
      mustRead: [...(stage.mustRead || [])],
      tools: [...(stage.tools || [])],
      deliverable: stage.deliverable
        ? {
            ...stage.deliverable,
            toolNames: [...(stage.deliverable.toolNames || [])],
            rules: (stage.deliverable.rules || []).map((rule) => ({
              ...rule,
              groups: (rule.groups || []).map((group) => [...group]),
            })),
          }
        : null,
    })),
  };
}

/**
 * 读取多个 Skill 目录并合并成一个目录树。
 * `specs` 每项形如 `{ directory, origin }`；同一 id 后面的来源覆盖前面的（功能 Skill 覆盖同名系统 Skill）。
 * `options.enabledIds`（Set）只用于过滤 business，`all` 始终包含全部 Skill，供管理界面展示。
 */
function loadCanvasSkillCatalog(specs = [], options = {}) {
  const normalized = (Array.isArray(specs) ? specs : [])
    .map((spec) => (typeof spec === "string" ? { directory: spec } : spec))
    .filter((spec) => spec && String(spec.directory || "").trim());
  const byId = new Map();
  for (const spec of normalized) {
    const directory = String(spec.directory);
    const origin = String(spec.origin || "system");
    if (!fs.existsSync(directory)) continue;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const filename = path.join(directory, entry.name, "SKILL.md");
      if (!fs.existsSync(filename)) continue;
      const skill = readCachedSkillDocument(filename, path.relative(directory, filename));
      const skillDirectory = path.dirname(filename);
      const references = listSkillReferences(skillDirectory);
      const execution = readSkillExecutionManifest(skill, skillDirectory, references);
      // 参考文档清单不进缓存：目录里新增/删除文件要立刻反映到 Agent 的工具说明里。
      byId.set(skill.id, {
        ...skill,
        origin,
        directory: skillDirectory,
        references,
        execution,
      });
    }
  }
  const skills = [...byId.values()]
    .sort((left, right) => left.canvas.label.localeCompare(right.canvas.label, "zh-CN"));
  const core = skills.find((skill) => skill.canvas.core) || createFallbackCoreSkill();
  const enabledIds = options.enabledIds instanceof Set ? options.enabledIds : null;
  return {
    core,
    business: skills.filter((skill) => !skill.canvas.core && !skill.canvas.hidden && (!enabledIds || enabledIds.has(skill.id))),
    all: skills,
  };
}

function loadCanvasSkills(directory, options = {}) {
  return loadCanvasSkillCatalog([{ directory, origin: options.origin || "system" }], options);
}

const MAX_SKILL_REFERENCE_FILES = 40;
const MAX_SKILL_REFERENCE_BYTES = 2 * 1024 * 1024;

/**
 * 列出 Skill 目录下 `references/` 里的参考文档。
 * 功能 Skill 常常把大块规范、模板、示例放在这里，按需读取比塞进提示词更省 token。
 */
function listSkillReferences(skillDirectory) {
  const root = path.join(skillDirectory, "references");
  if (!fs.existsSync(root)) return [];
  const files = [];
  let totalBytes = 0;
  const walk = (directory, prefix) => {
    if (files.length >= MAX_SKILL_REFERENCE_FILES || totalBytes > MAX_SKILL_REFERENCE_BYTES) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(target, relative);
        continue;
      }
      if (!entry.isFile()) continue;
      const bytes = fs.statSync(target).size;
      if (totalBytes + bytes > MAX_SKILL_REFERENCE_BYTES) continue;
      totalBytes += bytes;
      files.push({ path: `references/${relative}`, bytes });
      if (files.length >= MAX_SKILL_REFERENCE_FILES) return;
    }
  };
  walk(root, "");
  return files.sort((left, right) => left.path.localeCompare(right.path));
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
      "用户给的是模糊的创作目标、连主体都没说清（做哪个产品、用哪张素材、成片给谁看）时，先用一两句话问清楚，这一轮不要创建节点；不要拿默认值替用户决定创作对象。",
      "创建下游节点（视频、LLM、ComfyUI 或生成节点）时必须同时连线：把提供提示词的文字节点和参考素材节点的 ID 写进 reference_node_ids，让它自动连线；已经建好却没连线的，立刻用 connect_nodes 补上，不要把没连线的节点说成完成。",
      "用户明确要求直接生成一张图片且没有相关旧生成节点时，优先调用 generate_image_to_gallery；默认 model 传 null，由执行层只在 gpt-image-2（image2）接口中择优。只有用户明确指定模型时才传模型名，指定模型不可用时停止，不得替换成其他模型。",
      "canvas.selected_node_ids 中可输出图片的节点（包括独立图片节点和生成图集当前图片）默认是本次编辑源图。创建或生成图片时必须把这些节点 ID 合并到 reference_node_ids，形成到新生成节点的输入连线；用户已用编辑动作明确目标时优先调用 generate_image_to_gallery 一步完成编辑生成；不要因为这些源图本身是旧节点而弹出复用旧节点的选择。",
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
  if (value && !Array.isArray(value) && value.core && Array.isArray(value.business)) {
    return Array.isArray(value.all) ? value : { ...value, all: value.business };
  }
  const business = (Array.isArray(value) ? value : []).filter((skill) => !skill?.canvas?.core && !skill?.canvas?.hidden);
  const ids = Array.from(new Set(business.flatMap((skill) => skill?.canvas?.capabilities || [])));
  return { core: createFallbackCoreSkill(ids.length ? [...ids, "skill.activate"] : undefined), business, all: business };
}

function getPublicSkillMetadata(skills) {
  return normalizeSkillCatalog(skills).business.map((skill) => {
    const skillPackage = resolveSkillPackage(skill);
    return {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      label: skill.canvas.label,
      category: skill.canvas.category,
      icon: skill.canvas.icon,
      origin: skill.origin === "custom" ? "custom" : "system",
      required_selection: skill.canvas.required_selection,
      approval: skill.canvas.approval,
      triggers: [...skill.canvas.triggers],
      capabilities: [...skill.canvas.capabilities],
      tools: [...skill.canvas.tools],
      ...(skillPackage
        ? {
          packageId: skillPackage.id,
          packageLabel: skillPackage.label,
          standalone: skillPackage.standalone,
        }
        : {}),
      ...(Array.isArray(skill.references) && skill.references.length
        ? { references: skill.references.map((item) => ({ path: item.path, bytes: item.bytes })) }
        : {}),
      ...(skill.execution ? { execution: cloneSkillExecution(skill.execution) } : {}),
    };
  });
}

function buildResponsesRequest(payload = {}, options = {}) {
  const step = Number(payload.step || 0);
  if (!Number.isSafeInteger(step) || step < 0 || step >= CanvasAgentCore.MAX_STEPS) {
    throw new Error(`Canvas Agent allows ${CanvasAgentCore.MAX_STEPS} turns; step must be between 0 and ${CanvasAgentCore.MAX_STEPS - 1}.`);
  }
  const skillContext = resolveCanvasAgentSkillContext(payload, normalizeSkillCatalog(options.skills));

  const model = String(options.model || "gpt-5.6-sol").trim();
  const reasoningEffort = normalizeReasoningEffort(options.reasoningEffort);
  const capabilityIds = selectAdaptiveCapabilityIds(payload, skillContext);
  const tools = CanvasAgentCapabilities.getMcpTools(capabilityIds).map(toResponsesTool);
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
  // 自动模式先按 Skill 自己声明的触发词确定性地预加载专业流程。模型不能保证每次都主动
  // 调用 activate_canvas_skill，预加载让「生成图片」「放大图片」这类需求一定走上对应工作流。
  // 预加载是"软"的：路由目录和 activate_canvas_skill 仍然保留，模型判断不匹配时可以切换。
  const preloadedSkill = activeSkill ? null : inferCanvasAgentBusinessSkill(payload.prompt, catalog.business);
  const softActivated = Boolean(
    preloadedSkill
    || activeSkill && !manualId && payload.skill_auto === true,
  );
  const skill = activeSkill || preloadedSkill;
  const coreCapabilities = new Set(catalog.core.canvas.capabilities);
  const capabilityIds = skill
    ? skill.canvas.capabilities.filter((id) => coreCapabilities.has(id))
    : [...coreCapabilities];
  // 任何专业流程都可能要把素材或文字节点接到自己新建的节点上。连线本身是安全操作，
  // 一旦被能力集裁掉，画布就会出现「节点建好了但没有连线」的半成品，用户只能手工补。
  if (skill && coreCapabilities.has("node.connect") && !capabilityIds.includes("node.connect")) {
    capabilityIds.push("node.connect");
  }
  if ((!skill || softActivated) && coreCapabilities.has("skill.activate")) capabilityIds.push("skill.activate");
  return {
    mode: manualId ? "manual" : skill && !softActivated ? "activated" : "auto",
    activeSkill: skill,
    softActivated,
    manualActivated: Boolean(manualId && skill),
    capabilityIds: Array.from(new Set(capabilityIds)),
    instructions: buildCoreInstructions(catalog.core, skill, catalog.business, {
      softActivated,
      manualActivated: Boolean(manualId && skill),
      prompt: payload.prompt,
    }),
  };
}

/**
 * 问候、讨论和提问不应该被当成"要干活"。能力挑选和 Skill 预加载共用这一套判断，
 * 免得同样的输入在两条路径上得到相反的结论。
 */
function isCanvasAgentDiscussionPrompt(prompt) {
  const text = String(prompt || "").trim();
  if (!text) return false;
  if (/^(?:你好|您好|嗨|hi|hello|在吗)[！!。.]?$/i.test(text)) return true;
  return /(讨论|聊聊|分析|建议|思路|怎么设计|如何设计|为什么|是否|能不能|可不可以|[?？]\s*$)/.test(text)
    && !/(直接|立即|现在|开始|执行|创建|新建|添加|生成|整理|排列|连接|断开|定位|移动)/.test(text);
}

// 触发词短于两个字（例如单个「图」）命中率太高，不参与确定性预加载。
const MIN_SKILL_TRIGGER_LENGTH = 2;

function normalizeSkillIntentText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

/**
 * 用触发词做确定性匹配，决定自动模式下预加载哪种专业流程。
 * 只在"唯一最高分"时命中：触发词完全没命中、或者两个流程并列命中（例如「换背景」
 * 同时属于编辑图片和抠图）都交回模型自己路由，避免把需求塞进错误的流程。
 */
function inferCanvasAgentBusinessSkill(prompt, businessSkills, options = {}) {
  const text = normalizeSkillIntentText(prompt);
  if (!text || isCanvasAgentDiscussionPrompt(prompt)) return null;
  const excludedIds = options.excludeIds instanceof Set ? options.excludeIds : null;
  const matches = [];
  for (const skill of Array.isArray(businessSkills) ? businessSkills : []) {
    if (!skill?.canvas || excludedIds?.has(skill.id)) continue;
    if (skill.execution && (
      skill.execution.exposure !== "agent"
      || skill.execution.allowImplicitInvocation !== true
    )) continue;
    let score = 0;
    for (const trigger of skill.canvas.triggers) {
      const keyword = normalizeSkillIntentText(trigger);
      if (keyword.length < MIN_SKILL_TRIGGER_LENGTH || !text.includes(keyword)) continue;
      score = Math.max(score, keyword.length);
    }
    if (score) matches.push({ skill, score });
  }
  if (!matches.length) return null;
  matches.sort((left, right) => right.score - left.score || String(left.skill.id).localeCompare(String(right.skill.id)));
  if (matches.length > 1 && matches[1].score === matches[0].score) return null;
  return matches[0].skill;
}

function selectAdaptiveCapabilityIds(payload = {}, skillContext = {}) {
  const allowed = Array.from(new Set(Array.isArray(skillContext.capabilityIds) ? skillContext.capabilityIds.map(String) : []));
  // 预加载已经把能力集锁定到该流程声明的范围，不再用正则二次改写。
  if (skillContext.softActivated) return allowed;
  if (skillContext.mode !== "auto" || String(payload.active_skill_id || "").trim()) return allowed;
  const prompt = String(payload.prompt || "").trim();
  if (!prompt) return allowed;
  const allowedSet = new Set(allowed);
  // 自动模式下始终保留「激活业务 Skill」这一步，专业需求（生图、编辑图片、放大图片、识图）
  // 才有机会先激活对应 Skill 再执行，而不是绕过 Skill 直接调用底层工具。
  const pick = (ids) => Array.from(new Set([
    ...ids.filter((id) => allowedSet.has(id)),
    ...(allowedSet.has("skill.activate") ? ["skill.activate"] : []),
  ]));
  if (isCanvasAgentDiscussionPrompt(prompt)) return [];
  if (/(生成|出图|画一张|绘制|做一张)[^。！？]{0,36}(图|图片|海报|主视觉|插画)|(?:图|图片|海报|主视觉|插画)[^。！？]{0,20}(生成|出图)/.test(prompt)) {
    return pick([
      "node.image.create",
      "image.generate-to-gallery",
      "image.existing-node-choice",
      "canvas.node.focus",
      "node.update",
      "node.connect",
      "node.gallery.create",
      "node.run",
    ]);
  }
  if (/(创建|新建|添加|建)[^。！？]{0,20}(生图|图片)节点/.test(prompt)) {
    return pick(["node.image.create", "image.existing-node-choice", "node.connect", "node.update", "canvas.node.focus"]);
  }
  if (/(放大|超分|高清化|提高清晰度|无损放大|变清晰)/.test(prompt)) {
    return pick(["node.comfy.create", "node.run", "node.connect", "node.arrange", "canvas.node.focus"]);
  }
  if (/(识别|读图|看图|描述)(这张|该|一下这)?(图|图片)|反推(提示词|文案)|图里(有什么|是什么)/.test(prompt)) {
    return pick(["node.llm.create", "node.text.create", "node.update", "canvas.node.focus", "node.run"]);
  }
  if (/(抠图|去背景|去掉背景|透明(底|背景)|去背|抠出主体|换背景)/.test(prompt)) {
    return pick(["image.remove-background", "node.comfy.create", "node.run", "node.connect", "node.arrange", "canvas.node.focus"]);
  }
  if (/(整理|排整齐|自动布局|重新布局|排列).{0,16}(画布|节点|工作流)?/.test(prompt)) {
    return pick(["canvas.node.organize", "canvas.node.focus", "node.arrange", "node.move"]);
  }
  if (/(连接|连线|断开|解除连接|参考顺序)/.test(prompt)) {
    return pick(["node.connect", "node.disconnect", "node.reference.order", "canvas.node.focus"]);
  }
  if (/(定位|找到|聚焦|看一下).{0,20}(节点|图片|图集)/.test(prompt)) {
    return pick(["canvas.node.focus"]);
  }
  return allowed;
}

function buildCoreInstructions(core, activeSkill, businessSkills, options = {}) {
  const routableSkills = (Array.isArray(businessSkills) ? businessSkills : []).filter((skill) => (
    !skill?.execution
    || skill.execution.exposure === "agent" && skill.execution.allowImplicitInvocation === true
  ));
  const routing = routableSkills.map((skill) => [
    `- ${skill.id}（${skill.canvas.label}）`,
    `适用：${skill.description}`,
    `触发词：${skill.canvas.triggers.join("、") || "无"}`,
    `能力：${skill.canvas.capabilities.join(", ")}`,
  ].join("；")).join("\n");
  const routingList = routing || "当前没有可用业务 Skill。";
  const routingSection = `\n--- 可选业务 Skill 路由目录 ---\n${routingList}\n专业需求先调用 activate_canvas_skill；普通聊天和常规画布操作不要激活 Skill。`;
  const sections = ["你是无限画布中的工具型设计 Agent。", core.instructions];
  if (activeSkill) {
    sections.push(`\n--- 当前业务 Skill：${activeSkill.id}（${activeSkill.canvas.label}）---\n${activeSkill.instructions}`);
    const referenceSection = buildSkillReferenceSection(activeSkill);
    if (referenceSection) sections.push(referenceSection);
    if (options.manualActivated) {
      sections.push(
        "\n--- 手动专业流程优先级 ---\n"
        + "当前流程由用户明确选择，是本轮最高优先级的专业约束。"
        + "历史对话中与它冲突的结论全部作废，尤其是关于模型生成上限、时长拆分、镜头数量、已确认事实和制作状态的旧结论。"
        + "必须按当前 Skill 重新判断，不得直接沿用历史回答。",
      );
    }
    sections.push(buildSkillExecutionContract(activeSkill, options));
    sections.push(options.softActivated
      ? `\n--- 本次需求已预加载上述专业流程 ---\n直接按它的工作流程执行，不要为同一个流程再调用 activate_canvas_skill。只有这次需求明显属于下面另一个专业流程时，才调用 activate_canvas_skill 切换（一次任务只能有一个）。\n--- 可选业务 Skill 路由目录 ---\n${routingList}`
      : "");
  } else {
    sections.push(routingSection);
  }
  return sections.filter(Boolean).join("\n");
}

function buildSkillExecutionContract(skill, options = {}) {
  const hasReferences = Array.isArray(skill?.references) && skill.references.length > 0;
  const execution = skill?.execution && typeof skill.execution === "object" ? skill.execution : null;
  const stageId = execution
    ? CanvasAgentSkillContract.classifySkillStage(skill, options.prompt)
    : "general";
  const stage = execution
    ? execution.stages.find((item) => item.id === stageId) || null
    : null;
  const mustRead = Array.isArray(stage?.mustRead) ? stage.mustRead : [];
  const stageTools = Array.isArray(stage?.tools) ? stage.tools : [];
  const deliverableRules = Array.isArray(stage?.deliverable?.rules) ? stage.deliverable.rules : [];
  return [
    `\n--- 当前 Skill 的执行契约（强制） ---`,
    execution
      ? `执行模式：${execution.mode}；调用边界：${execution.exposure === "manual" ? "仅限用户手动选择" : "可由 Agent 路由"}。`
      : "",
    execution
      ? `当前阶段：${stage ? `${stage.label}（${stage.id}）` : `未匹配专项阶段（${stageId}）`}。`
      : "",
    execution
      ? `执行预算：最多 ${execution.limits.maxRounds} 个模型回合、${execution.limits.maxToolCalls} 次工具调用；超出后本轮会停止，不能靠重复调用绕过。`
      : "",
    mustRead.length
      ? `当前阶段写任何交付节点之前，必须先调用 read_skill_reference 成功读取：${mustRead.join("、")}。`
      : "",
    stageTools.length
      ? `当前阶段允许的节点工具：${stageTools.join("、")}。`
      : "",
    deliverableRules.length
      ? `当前阶段完整交付必须逐项覆盖：${deliverableRules.map((rule) => rule.label).join("、")}。缺少任一项时，节点写入会在执行前被拒绝。`
      : "",
    `Skill 正文和已读取的参考文档共同构成当前阶段的事实来源；不得只做概念性总结或借 Skill 名称制造“已使用”的错觉。`,
    hasReferences
      ? "开始专业交付前，先从 Skill 的 Reference routing 中选择与当前阶段直接相关的文档，调用 read_skill_reference 读取原文。普通澄清或当前阶段没有对应参考时除外。"
      : "",
    "若 Skill 或参考文档规定了默认交付物、字段、表格、检查项或阶段交接格式，最终回答必须逐项覆盖；不得省略后再宣称当前阶段已完成。",
    execution?.mode === "procedure"
      ? "这是声明式 procedure Skill：按阶段顺序执行，每一步先完成实际读写，再进入下一步；工具失败会作为观察结果返回，不能伪装成成功。"
      : "",
    "交付前做一次静默核对：已确认输入、暂定假设、待确认项、当前阶段全部必需产出、阶段状态、尚待事项，以及唯一的交接问题是否齐全。缺项先补齐；无法补齐时明确标记“需要修改”或“暂时阻塞”，不得标记为已批准并结束。",
    options.manualActivated
      ? "这是用户明确选择的专业流程，上述检查不可跳过；若历史回答或旧交付物缺项，本轮必须按当前 Skill 重新生成完整版本。"
      : "这是当前已激活的专业流程，上述检查不可跳过；若当前阶段缺少必需产出，先补齐再结束。",
  ].filter(Boolean).join("\n");
}

/**
 * 参考文档只列清单，不注入正文：一份规范动辄几十 KB，塞进每一轮提示词会挤掉真正需要的上下文。
 * 模型需要细节时用 read_skill_reference 读原文。
 */
function buildSkillReferenceSection(skill) {
  const references = Array.isArray(skill?.references) ? skill.references : [];
  if (!references.length) return "";
  const list = references
    .map((item) => `- ${item.path}（${item.bytes} 字节）`)
    .join("\n");
  return [
    `\n--- 本流程的参考文档 ---`,
    `需要结构规范、模板或完整示例时，调用 read_skill_reference 读取对应文件（skill_id 传 ${skill.id}），不要凭记忆编造里面的字段名和格式：`,
    list,
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
  const manualSkill = payload.skill_mode === "manual" && String(payload.skill_id || "").trim();
  const activeSkill = String(payload.active_skill_id || "").trim();
  return manualSkill || activeSkill ? effort : "low";
}

function buildChatCompletionsRequest(payload = {}, options = {}) {
  const step = Number(payload.step || 0);
  if (!Number.isSafeInteger(step) || step < 0 || step >= CanvasAgentCore.MAX_STEPS) {
    throw new Error(`Canvas Agent allows ${CanvasAgentCore.MAX_STEPS} turns; step must be between 0 and ${CanvasAgentCore.MAX_STEPS - 1}.`);
  }
  const skillContext = resolveCanvasAgentSkillContext(payload, normalizeSkillCatalog(options.skills));
  const capabilityIds = selectAdaptiveCapabilityIds(payload, skillContext);
  const tools = CanvasAgentCapabilities.getMcpTools(capabilityIds).map(toChatTool);
  const messages = [{
    role: "system",
    content: skillContext.instructions,
  }];
  const flattenToolHistory = options.flattenToolHistory === true;
  normalizeChatTranscript(options.contextTranscript || payload.conversation_context, {
    flattenToolHistory,
  }).forEach((message) => messages.push(message));

  const prompt = String(payload.prompt || "").trim();
  if (prompt) {
    const canvas = payload.canvas && typeof payload.canvas === "object" ? payload.canvas : {};
    const manualSkillReminder = skillContext.manualActivated
      ? "\n\n【本轮手动专业流程优先级】"
        + "历史回答与本轮 Skill 冲突时，一律以本轮 Skill 为准。"
        + "不得沿用历史中的模型生成上限、时长拆分、镜头数量或旧制作状态。"
      : "";
    const content = [{
      type: "text",
      text: `${prompt}${manualSkillReminder}\n\n当前画布上下文（JSON）：\n${JSON.stringify(canvas)}`,
    }];
    normalizeVisionImages(payload.vision_images).forEach((imageUrl) => {
      content.push({ type: "image_url", image_url: { url: imageUrl } });
    });
    messages.push({ role: "user", content });
  }

  normalizeChatTranscript(options.transcript || payload.transcript, {
    flattenToolHistory,
  }).forEach((message) => messages.push(message));

  const toolOutputs = normalizeToolOutputs(payload.tool_outputs);
  if (flattenToolHistory && toolOutputs.length) {
    // Compatibility path for thinking models that reject native tool-call
    // history produced by another provider. The tool results stay available,
    // but the old assistant turn is no longer replayed as a native tool call.
    messages.push({
      role: "user",
      content: [
        "以下是刚才执行的工具结果。请基于这些结果继续完成原任务；不要重复已经成功的操作。",
        ...toolOutputs.map((item) => `[工具结果 ${item.call_id}]\n${item.output}`),
      ].join("\n\n"),
    });
  } else {
    toolOutputs.forEach((item) => {
      messages.push({ role: "tool", tool_call_id: item.call_id, content: item.output });
    });
  }
  if (messages.length === 1) throw new Error("Canvas Agent prompt or transcript is required.");

  const request = {
    model: String(options.model || "gpt-5.6-sol").trim(),
    messages,
    tools,
    stream: true,
    max_tokens: 4096,
  };
  // Strict OpenAI-compatible gateways reject `tool_choice` (and
  // `parallel_tool_calls`) when the request carries no tools at all — the
  // greeting/discussion path intentionally selects none, so the fields have to
  // disappear with them instead of being sent as `tool_choice: "auto"`.
  if (tools.length) {
    request.tool_choice = "auto";
    request.parallel_tool_calls = false;
  }
  return request;
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
    toolChoice: request.tools.length ? (request.tool_choice || "auto") : "",
    needsVision: normalizeVisionImages(payload.vision_images).length > 0,
    params: {
      max_tokens: Number(request.max_tokens || 4096),
      reasoning_effort: normalizeReasoningEffort(options.reasoningEffort),
      ...(request.tools.length ? { parallel_tool_calls: request.parallel_tool_calls !== false } : {}),
    },
  };
}

function normalizeChatTranscript(value, options = {}) {
  const flattenToolHistory = options.flattenToolHistory === true;
  return (Array.isArray(value) ? value : []).slice(-CanvasAgentCore.MAX_STEPS * 3).flatMap((item) => {
    const role = String(item?.role || "").toLowerCase();
    if (role === "user" || role === "system") {
      const content = typeof item.content === "string" ? item.content : "";
      return content ? [{ role, content }] : [];
    }
    if (role === "assistant") {
      const content = typeof item.content === "string" ? item.content : "";
      const reasoningContent = typeof item.reasoning_content === "string"
        ? item.reasoning_content
        : typeof item.reasoningContent === "string" ? item.reasoningContent : "";
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
      if (flattenToolHistory) {
        const callLines = toolCalls.map((call) => (
          `[历史工具调用] ${call.function.name} ${call.function.arguments}`
        ));
        const flattened = [content, ...callLines].filter(Boolean).join("\n");
        return flattened ? [{ role: "assistant", content: flattened }] : [];
      }
      // An empty `tool_calls` array is not the same as no tool calls: strict
      // gateways answer `Invalid 'messages[N].tool_calls': empty array.` when a
      // transcript replayed the assistant turn without any.
      return content || toolCalls.length
        ? [{
            role: "assistant",
            content: content || null,
            ...(reasoningContent ? { reasoning_content: reasoningContent } : {}),
            ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
          }]
        : [];
    }
    if (role === "tool") {
      const callId = String(item.call_id || item.tool_call_id || "").trim();
      if (!callId) return [];
      const content = typeof item.content === "string" ? item.content : JSON.stringify(item.content ?? null);
      if (flattenToolHistory) {
        return [{ role: "assistant", content: `[历史工具结果 ${callId}]\n${content}` }];
      }
      return [{
        role: "tool",
        tool_call_id: callId,
        content,
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
    reasoning_content: String(message.reasoning_content ?? message.reasoningContent ?? ""),
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
  let reasoningContent = "";
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
    reasoningContent += String(delta.reasoning_content ?? delta.reasoningContent ?? "");
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
  return {
    response_id: responseId,
    model,
    message: message.trim(),
    reasoning_content: reasoningContent,
    tool_calls: toolCalls,
    usage,
  };
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
  loadCanvasSkillCatalog,
  listSkillReferences,
  resolveSkillPackage,
  getPublicSkillMetadata,
  resolveCanvasAgentSkillContext,
  inferCanvasAgentBusinessSkill,
  isCanvasAgentDiscussionPrompt,
  selectAdaptiveCapabilityIds,
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
