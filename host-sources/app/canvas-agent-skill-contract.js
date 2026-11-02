(function initCanvasAgentSkillContract(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasAgentSkillContract = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasAgentSkillContract() {
  const MAX_CORRECTION_ATTEMPTS = 2;
  const MAX_EVIDENCE_CHARS = 120000;
  const TEXT_DELIVERABLE_TOOLS = new Set(["create_text_node", "update_node"]);

  const SCRIPT_RULES = Object.freeze([
    {
      key: "confirmed_inputs",
      label: "已确认输入、暂定假设和待确认项",
      groups: [["已确认输入"], ["暂定假设"], ["待确认项", "待确认"]],
    },
    {
      key: "nine_part_foundation",
      label: "九项脚本骨架",
      groups: [["九项脚本骨架"]],
    },
    {
      key: "core_expression",
      label: "一句话核心表达",
      groups: [["核心表达"]],
    },
    {
      key: "story_engine_and_causality",
      label: "故事发动机与因果链",
      groups: [["故事发动机"], ["因果链"]],
    },
    {
      key: "timed_script_table",
      label: "带段落时间的脚本表（行动、可见变化、声音、功能动机、段落任务）",
      groups: [["段落时间", "时间"], ["行动"], ["可见变化"], ["声音"], ["功能动机"], ["段落任务"]],
      requiresTable: true,
    },
    {
      key: "audio_visual_division",
      label: "视听分工",
      groups: [["视听分工"]],
    },
    {
      key: "emotion_and_motif",
      label: "情绪曲线与视觉母题变化",
      groups: [["情绪曲线"], ["视觉母题"]],
    },
    {
      key: "opening_climax_ending",
      label: "开头、高潮和结尾闭环说明",
      groups: [["开头"], ["高潮"], ["结尾"], ["闭环"]],
    },
    {
      key: "delete_test_and_feasibility",
      label: "删除测试与可执行性检查",
      groups: [["删除测试"], ["可执行性"]],
    },
    {
      key: "script_status",
      label: "脚本确认结论",
      groups: [["脚本确认结论", "确认结论", "已批准并锁定", "有条件批准", "需要修改", "暂时阻塞"]],
    },
    {
      key: "stage_handoff",
      label: "唯一的阶段交接问题",
      groups: [["阶段交接", "交接", "下一阶段", "是否满意", "请确认"]],
      requiresQuestion: true,
      messageAllowed: true,
    },
  ]);

  function normalizeStringArray(value) {
    return (Array.isArray(value) ? value : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }

  function normalizeRule(rule) {
    if (!rule || typeof rule !== "object") return null;
    const groups = (Array.isArray(rule.groups) ? rule.groups : [])
      .map((group) => normalizeStringArray(group))
      .filter((group) => group.length);
    const label = String(rule.label || "").trim();
    if (!label || !groups.length) return null;
    return {
      key: String(rule.key || label).trim(),
      label,
      groups,
      requiresTable: rule.requiresTable === true,
      requiresQuestion: rule.requiresQuestion === true,
      messageAllowed: rule.messageAllowed === true,
    };
  }

  function normalizeDeliverable(value, requiredReferences) {
    if (!value || typeof value !== "object") return null;
    const rules = (Array.isArray(value.rules) ? value.rules : [])
      .map(normalizeRule)
      .filter(Boolean);
    return {
      code: String(value.code || "").trim(),
      label: String(value.label || "Skill 交付物").trim(),
      toolNames: normalizeStringArray(value.toolNames),
      requiredReference: requiredReferences[0] || "",
      requiredReferences: [...requiredReferences],
      requireCanvasTextNode: value.requireCanvasTextNode !== false,
      rules,
    };
  }

  function getExecutionStages(skill) {
    const stages = skill?.execution?.stages;
    return Array.isArray(stages) ? stages : [];
  }

  function getExecutionStage(skill, stageId) {
    const id = String(stageId || "").trim();
    if (!id) return null;
    return getExecutionStages(skill).find((stage) => String(stage?.id || "") === id) || null;
  }

  function matchesStage(stage, prompt) {
    const text = String(prompt || "").trim();
    const whenAll = normalizeStringArray(stage?.whenAll);
    const whenAny = normalizeStringArray(stage?.whenAny);
    const whenNone = normalizeStringArray(stage?.whenNone);
    if (stage?.always === true) return true;
    if (!text || (!whenAll.length && !whenAny.length)) return false;
    if (whenNone.some((term) => text.includes(term))) return false;
    if (whenAll.length && !whenAll.every((term) => text.includes(term))) return false;
    if (whenAny.length && !whenAny.some((term) => text.includes(term))) return false;
    return true;
  }

  function extractDeliverableText(call) {
    const args = call?.arguments && typeof call.arguments === "object" ? call.arguments : {};
    const changes = args.changes && typeof args.changes === "object" ? args.changes : {};
    return String(args.content ?? changes.content ?? args.text ?? changes.text ?? "");
  }

  function getDeliverableToolNames(contract) {
    const configured = normalizeStringArray(contract?.deliverable?.toolNames);
    return configured.length ? configured : Array.from(TEXT_DELIVERABLE_TOOLS);
  }

  function getRequiredReferences(contract) {
    const configured = normalizeStringArray(contract?.requiredReferences);
    if (configured.length) return configured;
    const requiredReference = String(contract?.deliverable?.requiredReference || "").trim();
    return requiredReference ? [requiredReference] : [];
  }

  function hasReadRequiredReferences(contract) {
    const required = getRequiredReferences(contract);
    if (!required.length) return true;
    const read = normalizeStringArray(contract?.readReferences).map(normalizeReferencePath);
    return required.every((referencePath) => read.includes(normalizeReferencePath(referencePath)));
  }

  function createContract(skill, options = {}) {
    const skillId = String(skill?.id || options.skillId || "").trim();
    const stage = classifySkillStage(skill || skillId, options.prompt);
    const stageDefinition = getExecutionStage(skill, stage);
    const references = Array.isArray(skill?.references)
      ? skill.references.map((item) => String(item?.path || "").trim()).filter(Boolean)
      : [];
    const manifestRequiredReferences = normalizeStringArray(stageDefinition?.mustRead);
    const requiredReferences = manifestRequiredReferences.length
      ? manifestRequiredReferences
      : stage === "script" && skillId === "ai-video-director"
        ? ["references/script-and-story.md"]
        : [];
    const manifestDeliverable = normalizeDeliverable(stageDefinition?.deliverable, requiredReferences);
    const fallbackDeliverable = stage === "script" && skillId === "ai-video-director"
      ? normalizeDeliverable({
          code: "ai-video-director-script",
          label: "AI 视频导演 · 脚本阶段",
          toolNames: Array.from(TEXT_DELIVERABLE_TOOLS),
          requireCanvasTextNode: true,
          rules: SCRIPT_RULES,
        }, requiredReferences)
      : null;
    const deliverable = manifestDeliverable || fallbackDeliverable;
    const configuredToolNames = normalizeStringArray(stageDefinition?.tools);
    if (deliverable && configuredToolNames.length) {
      deliverable.toolNames = configuredToolNames;
    }
    const requiresReferenceBeforeTextDeliverable = options.manualActivated === true
      && (requiredReferences.length > 0 || !skill?.execution && references.length > 0);
    return {
      skillId,
      skillLabel: String(skill?.label || skill?.canvas?.label || skillId),
      manual: options.manualActivated === true,
      stage,
      references,
      requiredReferences,
      readReferences: [],
      requiresReferenceBeforeTextDeliverable,
      textDeliverableAttempted: false,
      deliverable,
      lastDeliverableText: "",
      deliverableCompleted: false,
      toolViolations: 0,
      correctionAttempts: 0,
      lastViolation: null,
      createdAt: Number(options.createdAt || Date.now()),
      updatedAt: Date.now(),
    };
  }

  function classifySkillStage(skillOrId, prompt) {
    const skill = skillOrId && typeof skillOrId === "object" ? skillOrId : null;
    const skillId = String(skill?.id || skillOrId || "");
    const stages = getExecutionStages(skill);
    if (stages.length) {
      const matched = stages.find((stage) => matchesStage(stage, prompt));
      return String(matched?.id || "general");
    }
    if (String(skillId || "") !== "ai-video-director") return "general";
    const text = String(prompt || "").trim();
    if (!text) return "general";
    const explicitlyOtherStage = /(分镜|主镜头|镜头表|图片提示词|视频提示词|剪辑|粗剪|复盘|风格测试|视觉连续性)/.test(text);
    const scriptStage = /(脚本|故事|剧情|创意方向|核心表达|因果链|情绪曲线|视觉母题|跑通|跑一下|改写|评审)/.test(text);
    return scriptStage && !explicitlyOtherStage ? "script" : "general";
  }

  function recordToolResult(contract, call, output) {
    if (!contract || typeof contract !== "object") return contract;
    const next = cloneContract(contract);
    const name = String(call?.name || "").trim();
    if (name === "read_skill_reference" && output?.ok !== false) {
      const path = normalizeReferencePath(output?.path || call?.arguments?.path);
      if (path && !next.readReferences.includes(path)) next.readReferences.push(path);
    }
    if (next.deliverable && getDeliverableToolNames(next).includes(name) && output?.ok !== false) {
      next.textDeliverableAttempted = true;
      const content = extractDeliverableText(call);
      if (content.trim()) {
        next.lastDeliverableText = content.slice(0, MAX_EVIDENCE_CHARS);
        next.deliverableCompleted = validateDeliverable(next, next.lastDeliverableText, {
          requireCanvasTextNode: false,
        }).ok;
      }
    }
    next.updatedAt = Date.now();
    return next;
  }

  function inspectToolResult(contract, call, output) {
    const isTextDeliverable = getDeliverableToolNames(contract).includes(String(call?.name || ""));
    if (!contract || !isTextDeliverable) {
      return { contract, violation: null };
    }
    const next = cloneContract(contract);
    next.textDeliverableAttempted = true;
    const content = extractDeliverableText(call);
    const validation = next.deliverable
      ? validateDeliverable(next, content, {
          requireCanvasTextNode: false,
          hasCanvasTextNode: true,
        })
      : validateReferenceGate(next);
    if (validation.ok) {
      next.lastDeliverableText = content.slice(0, MAX_EVIDENCE_CHARS);
      next.deliverableCompleted = true;
      next.lastViolation = null;
      next.updatedAt = Date.now();
      return { contract: next, violation: null };
    }
    next.toolViolations = Number(next.toolViolations || 0) + 1;
    next.lastViolation = validation;
    next.updatedAt = Date.now();
    return { contract: next, violation: validation };
  }

  function inspectToolCall(contract, call) {
    const name = String(call?.name || "").trim();
    if (!contract || !getDeliverableToolNames(contract).includes(name)) {
      return { contract, violation: null };
    }
    const referenceGate = validateReferenceGate(contract);
    if (!referenceGate.ok) return { contract, violation: referenceGate };
    if (!contract.deliverable) return { contract, violation: null };
    const validation = validateDeliverable(contract, extractDeliverableText(call), {
      requireCanvasTextNode: false,
      hasCanvasTextNode: true,
    });
    return {
      contract,
      violation: validation.ok ? null : { ...validation, blockedBeforeExecution: true },
    };
  }

  function inspectCompletion(contract, message = "") {
    if (!contract?.deliverable) {
      if (contract?.requiresReferenceBeforeTextDeliverable && contract?.textDeliverableAttempted) {
        return validateReferenceGate(contract);
      }
      return { ok: true, code: "", missing: [] };
    }
    const nodeText = String(contract.lastDeliverableText || "").trim();
    const missing = [];
    if (!nodeText) missing.push("把完整交付物写入画布文字节点");
    const requiredReferences = getRequiredReferences(contract);
    const readReferences = normalizeStringArray(contract?.readReferences).map(normalizeReferencePath);
    requiredReferences.forEach((referencePath) => {
      if (!readReferences.includes(normalizeReferencePath(referencePath))) {
        missing.push(`读取参考文档 ${referencePath}`);
      }
    });
    if (requiredReferences.length && !hasReadRequiredReferences(contract)) {
      missing.push("先读取当前阶段全部必读参考文档");
    }
    const rules = Array.isArray(contract?.deliverable?.rules) ? contract.deliverable.rules : [];
    rules.forEach((rule) => {
      const evidence = rule?.messageAllowed ? `${nodeText}\n${String(message || "")}` : nodeText;
      if (!matchesRule(evidence, rule)) missing.push(rule.label);
    });
    if (!missing.length) return { ok: true, code: "", missing: [] };
    return {
      ok: false,
      code: "skill_deliverable_incomplete",
      skillId: String(contract?.skillId || ""),
      stage: String(contract?.stage || ""),
      requiredReference: requiredReferences[0] || "",
      requiredReferences,
      deliverableLabel: String(contract?.deliverable?.label || ""),
      ruleLabels: rules.map((rule) => String(rule?.label || "")).filter(Boolean),
      missing: Array.from(new Set(missing)),
      message: `“${String(contract?.skillLabel || contract?.skillId || "当前 Skill")}”的规定交付物不完整。`,
    };
  }

  function validateDeliverable(contract, text, options = {}) {
    const missing = [];
    const hasCanvasTextNode = options.hasCanvasTextNode !== false
      && Boolean(String(contract?.lastDeliverableText || "").trim());
    if (contract?.deliverable?.requireCanvasTextNode && options.requireCanvasTextNode !== false && !hasCanvasTextNode) {
      missing.push("把完整交付物写入画布文字节点");
    }
    const requiredReferences = getRequiredReferences(contract);
    const readReferences = normalizeStringArray(contract?.readReferences).map(normalizeReferencePath);
    requiredReferences.forEach((referencePath) => {
      if (!readReferences.includes(normalizeReferencePath(referencePath))) {
        missing.push(`读取参考文档 ${referencePath}`);
      }
    });
    if (requiredReferences.length && !hasReadRequiredReferences(contract)) {
      missing.push("先读取当前阶段全部必读参考文档");
    }
    const rules = Array.isArray(contract?.deliverable?.rules) ? contract.deliverable.rules : [];
    const value = String(text || "");
    rules.forEach((rule) => {
      if (!matchesRule(value, rule)) missing.push(rule.label);
    });
    if (!missing.length) return { ok: true, code: "", missing: [] };
    return {
      ok: false,
      code: "skill_deliverable_incomplete",
      skillId: String(contract?.skillId || ""),
      stage: String(contract?.stage || ""),
      requiredReference: requiredReferences[0] || "",
      requiredReferences,
      deliverableLabel: String(contract?.deliverable?.label || ""),
      ruleLabels: rules.map((rule) => String(rule?.label || "")).filter(Boolean),
      missing: Array.from(new Set(missing)),
      message: `“${String(contract?.skillLabel || contract?.skillId || "当前 Skill")}”的规定交付物不完整。`,
    };
  }

  function validateReferenceGate(contract) {
    const readReferences = normalizeStringArray(contract?.readReferences).map(normalizeReferencePath);
    const requiredReferences = getRequiredReferences(contract);
    const requiredRead = requiredReferences.length
      ? requiredReferences.every((referencePath) => readReferences.includes(normalizeReferencePath(referencePath)))
      : readReferences.length > 0;
    if (!contract?.requiresReferenceBeforeTextDeliverable || requiredRead) {
      return { ok: true, code: "", missing: [] };
    }
    return {
      ok: false,
      code: "skill_reference_required",
      skillId: String(contract?.skillId || ""),
      stage: String(contract?.stage || ""),
      requiredReference: requiredReferences[0] || "",
      requiredReferences,
      missing: requiredReferences.length
        ? requiredReferences.map((referencePath) => `读取参考文档 ${referencePath}`)
        : ["读取当前阶段相关参考文档"],
      message: `“${String(contract?.skillLabel || contract?.skillId || "当前 Skill")}”要求先读取当前阶段相关参考文档。`,
    };
  }

  function matchesRule(text, rule) {
    const groups = Array.isArray(rule?.groups) ? rule.groups : [];
    if (!groups.every((group) => (Array.isArray(group) ? group : []).some((term) => text.includes(String(term))))) {
      return false;
    }
    if (rule?.requiresTable && !/\|[\s\S]*\|/.test(text)) return false;
    if (rule?.requiresQuestion && !/[?？]/.test(text)) return false;
    return true;
  }

  function buildToolViolationOutput(output, violation, options = {}) {
    if (!violation) return output;
    return {
      ...(output && typeof output === "object" ? output : { tool: "" }),
      skill_contract: {
        ok: false,
        code: violation.code,
        skill_id: violation.skillId,
        stage: violation.stage,
        missing: violation.missing,
        instruction: buildCorrectionInstruction(violation, "", {
          toolResult: true,
          blocked: options.blocked === true,
        }),
      },
    };
  }

  function buildCorrectionInstruction(violation, previousText = "", options = {}) {
    const missing = Array.isArray(violation?.missing) ? violation.missing : [];
    const requiredReferences = normalizeStringArray(
      violation?.requiredReferences || [violation?.requiredReference],
    );
    const lines = [
      "【Skill 执行闸门未通过】",
      `用户明确选择了“${String(violation?.skillId || "当前 Skill")}”，本次交付尚未满足该 Skill 规定的完成条件。`,
    ];
    if (missing.length) {
      lines.push(`必须补齐：${missing.map((item) => `“${item}”`).join("、")}。`);
    }
    if (requiredReferences.length) {
      lines.push(`必须先成功调用 read_skill_reference 读取：${requiredReferences.join("、")}。`);
    }
    if (options.toolResult) {
      lines.push(options.blocked
        ? "本次节点操作没有执行，画布中没有留下半成品节点。先补齐缺项，再重新提交完整内容。"
        : "当前节点操作已经执行，但这次不能视为完整交付。继续补齐，不要重复创建无关节点。");
    } else {
      lines.push("上一轮没有工具调用，不能把聊天摘要当作交付完成。");
    }
    lines.push("如果是脚本阶段，必须用 create_text_node 或 update_node 把完整脚本交付物写入画布文字节点，聊天回复只说明节点状态和阶段交接。");
    lines.push("不得省略字段、不得只写标题、不得以“有条件批准”或风险摘要代替完整交付物。");
    const deliverableLabel = String(violation?.deliverableLabel || "").trim();
    const ruleLabels = normalizeStringArray(violation?.ruleLabels);
    if (deliverableLabel && ruleLabels.length) {
      lines.push(`完整交付“${deliverableLabel}”必须逐项覆盖：${ruleLabels.join("、")}。`);
    }
    if (violation?.skillId === "ai-video-director" && violation?.stage === "script") {
      lines.push("脚本阶段必须完整覆盖：已确认输入/暂定假设/待确认项、九项脚本骨架、一句话核心表达、故事发动机与因果链、带段落时间的脚本表、视听分工、情绪曲线与视觉母题变化、开头/高潮/结尾闭环、删除测试与可执行性检查、脚本确认结论、唯一阶段交接问题。");
    }
    lines.push("补齐后再给出简短的阶段状态、下一步和唯一交接问题。");
    const excerpt = String(previousText || "").trim();
    if (excerpt) {
      lines.push("以下是上一轮未通过的内容摘录，可基于它补齐，不要照抄空泛摘要：");
      lines.push(excerpt.slice(0, 12000));
    }
    return lines.join("\n");
  }

  function canRetry(contract) {
    return (contract?.deliverable || contract?.requiresReferenceBeforeTextDeliverable)
      && Number(contract.correctionAttempts || 0) < MAX_CORRECTION_ATTEMPTS;
  }

  function markCorrectionAttempt(contract) {
    const next = cloneContract(contract);
    next.correctionAttempts = Number(next.correctionAttempts || 0) + 1;
    next.updatedAt = Date.now();
    return next;
  }

  function normalizeReferencePath(value) {
    const path = String(value || "").replace(/\\/g, "/").replace(/^\.?\//, "").trim();
    if (!path) return "";
    if (path.startsWith("references/")) return path;
    const marker = path.indexOf("references/");
    return marker >= 0 ? path.slice(marker) : path;
  }

  function cloneContract(contract) {
    return {
      ...contract,
      references: Array.isArray(contract?.references) ? [...contract.references] : [],
      requiredReferences: Array.isArray(contract?.requiredReferences) ? [...contract.requiredReferences] : [],
      readReferences: Array.isArray(contract?.readReferences) ? [...contract.readReferences] : [],
      deliverable: contract?.deliverable
        ? {
            ...contract.deliverable,
            toolNames: Array.isArray(contract.deliverable.toolNames) ? [...contract.deliverable.toolNames] : [],
            requiredReferences: Array.isArray(contract.deliverable.requiredReferences)
              ? [...contract.deliverable.requiredReferences]
              : [],
            rules: Array.isArray(contract.deliverable.rules)
              ? contract.deliverable.rules.map((rule) => ({
                  ...rule,
                  groups: Array.isArray(rule.groups) ? rule.groups.map((group) => [...group]) : [],
                }))
              : [],
          }
        : null,
      lastViolation: contract?.lastViolation ? { ...contract.lastViolation } : null,
    };
  }

  return Object.freeze({
    MAX_CORRECTION_ATTEMPTS,
    SCRIPT_RULES,
    createContract,
    classifySkillStage,
    recordToolResult,
    inspectToolCall,
    inspectToolResult,
    inspectCompletion,
    validateDeliverable,
    validateReferenceGate,
    buildToolViolationOutput,
    buildCorrectionInstruction,
    canRetry,
    markCorrectionAttempt,
    normalizeReferencePath,
  });
});
