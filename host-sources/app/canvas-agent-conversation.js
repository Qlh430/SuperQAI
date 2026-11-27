(function initCanvasAgentConversation(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasAgentConversation = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasAgentConversationApi() {
  const MAX_ITEMS = 200;
  const MAX_TRANSCRIPT_ITEMS = 24;
  const MAX_ITEM_TEXT_LENGTH = 12000;
  const MAX_WORKFLOW_TEXT_LENGTH = 12000;
  const ALLOWED_ROLES = new Set(["user", "assistant", "notice", "error", "tool"]);
  const ALLOWED_STATUSES = new Set(["running", "completed", "failed", "recoverable", "stopped", "declined"]);
  const ALLOWED_SKILL_SOURCES = new Set(["manual", "activated", "auto"]);
  const NATURAL_PHOTO_WORKFLOW = "natural-aesthetic-product-photography";
  const CREATIVE_PRODUCT_BATCH_WORKFLOW = "creative-product-photography-10";
  const CREATIVE_PRODUCT_BATCH_SKILL = "commercial-product-photography-10";
  const ALLOWED_WORKFLOW_STATUSES = new Set([
    "awaiting-confirmation", "confirmed", "workflow-created", "generation-pending",
    "generation-running", "generation-failed", "generation-unknown", "completed", "cancelled",
  ]);
  const ALLOWED_EXECUTION_CHOICES = new Set(["create_manually", "create_and_generate"]);
  const ALLOWED_GENERATION_STATES = new Set(["not-started", "submitting", "running", "failed", "unknown", "completed"]);
  const ALLOWED_TASK_STATES = new Set(["collecting", "planning", "awaiting_confirmation", "confirmed", "executing", "verifying", "completed", "failed", "cancelled"]);
  const ALLOWED_SKILL_EVENT_TYPES = new Set(["invocation", "reference_read", "tool_invocation", "cross_skill_request", "cross_skill_grant", "cross_skill_denial", "task_status", "error"]);

  function create(boardId) {
    return {
      boardId: String(boardId || ""),
      conversationId: makeConversationId(),
      revision: 0,
      items: [],
      generationSettings: defaultGenerationSettings(),
      updatedAt: new Date().toISOString(),
    };
  }

  function normalize(value, boardId = value?.boardId) {
    const source = value && typeof value === "object" ? value : {};
    const storedConversationId = typeof source.conversationId === "string" ? source.conversationId : "";
    const conversationId = String(storedConversationId || makeConversationId()).slice(0, 120);
    const activeBoardId = String(boardId || source.boardId || "");
    const wizardDraft = normalizeWizardDraft(source.wizardDraft, activeBoardId);
    const items = [];
    const seen = new Set();
    (Array.isArray(source.items) ? source.items : []).slice(-MAX_ITEMS).forEach((item) => {
      const normalized = normalizeItem(item);
      if (!normalized || seen.has(normalized.id)) return;
      seen.add(normalized.id);
      items.push(normalized);
    });
    return {
      boardId: String(boardId || source.boardId || "").slice(0, 120),
      conversationId,
      ...(typeof source.activeSkillId === "string" ? {
        activeSkillId: /^[a-z0-9][a-z0-9-]{0,119}$/.test(source.activeSkillId) ? source.activeSkillId : "",
      } : {}),
      taskContext: normalizeTaskContext(source.taskContext, { boardId: activeBoardId, conversationId }),
      skillEvents: normalizeSkillEvents(source.skillEvents),
      revision: Math.max(0, Number(source.revision || 0)),
      items,
      generationSettings: normalizeGenerationSettings(source.generationSettings),
      pendingWorkflow: normalizePendingWorkflow(source.pendingWorkflow, activeBoardId, conversationId, storedConversationId, wizardDraft),
      wizardDraft,
      updatedAt: normalizeDate(source.updatedAt),
    };
  }

  function normalizeTaskContext(value, owner) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const taskId = String(value.taskId || "");
    const primary = value.primary && typeof value.primary === "object" ? value.primary : {};
    const skillId = String(primary.id || "");
    if (!/^[a-zA-Z0-9:_-]{1,120}$/.test(taskId)
      || value.boardId !== owner.boardId || value.conversationId !== owner.conversationId
      || skillId && !/^[a-z0-9][a-z0-9-]{0,119}$/.test(skillId)
      || !ALLOWED_TASK_STATES.has(value.status)) return null;
    return {
      taskId, boardId: owner.boardId, conversationId: owner.conversationId,
      primary: {
        id: skillId, name: String(primary.name || skillId).slice(0, 120),
        source: ["manual", "named", "auto", "recovered"].includes(primary.source) ? primary.source : "manual",
        origin: ["system", "personal", "shared"].includes(primary.origin) ? primary.origin : "",
        version: String(primary.version || "").slice(0, 120),
        fingerprint: /^[a-f0-9]{64}$/.test(primary.fingerprint || "") ? primary.fingerprint : "",
        validationStatus: String(primary.validationStatus || "unverified").slice(0, 40),
      },
      status: value.status, selectionReason: String(value.selectionReason || "").slice(0, 80),
      startedAt: normalizeDate(value.startedAt), updatedAt: normalizeDate(value.updatedAt),
      invocationId: String(value.invocationId || "").slice(0, 120),
      approvedSkills: (Array.isArray(value.approvedSkills) ? value.approvedSkills : []).slice(0, 8).flatMap(item => {
        if (!item || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(item.id || "")) return [];
        return [{ id: item.id, name: String(item.name || item.id).slice(0, 120),
          version: String(item.version || "").slice(0, 120),
          fingerprint: /^[a-f0-9]{64}$/.test(item.fingerprint || "") ? item.fingerprint : "",
          operationId: String(item.operationId || "").slice(0, 120) }];
      }),
      pendingSkill: value.pendingSkill && /^[a-z0-9][a-z0-9-]{0,119}$/.test(value.pendingSkill.id || "")
        ? { id: value.pendingSkill.id, name: String(value.pendingSkill.name || value.pendingSkill.id).slice(0, 120),
            reason: String(value.pendingSkill.reason || "").slice(0, 500), operationId: String(value.pendingSkill.operationId || "").slice(0, 120) }
        : null,
    };
  }

  function normalizeSkillEvents(value) {
    const seen = new Set();
    return (Array.isArray(value) ? value : []).slice(-500).flatMap(event => {
      if (!event || typeof event !== "object" || !ALLOWED_SKILL_EVENT_TYPES.has(event.type)
        || !/^[a-zA-Z0-9:_-]{1,120}$/.test(event.eventId || "")
        || !/^[a-zA-Z0-9:_-]{1,120}$/.test(event.taskId || "")
        || event.skillId && !/^[a-z0-9][a-z0-9-]{0,119}$/.test(event.skillId)
        || seen.has(event.eventId)) return [];
      seen.add(event.eventId);
      return [{
        eventId: event.eventId, taskId: event.taskId, type: event.type, skillId: event.skillId || "",
        source: String(event.source || "").slice(0, 40),
        ...(event.relatedSkillId && /^[a-z0-9][a-z0-9-]{0,119}$/.test(event.relatedSkillId)
          ? { relatedSkillId: event.relatedSkillId } : {}),
        ...(event.name ? { name: String(event.name).slice(0, 120) } : {}),
        ...(typeof event.path === "string" && event.path.startsWith("references/") && !/[\\\u0000-\u001f]/u.test(event.path)
          && event.path.length <= 240
          && !event.path.split("/").includes("..") ? { path: event.path } : {}),
        ...(event.reason ? { reason: String(event.reason).slice(0, 240) } : {}),
        ...(event.status ? { status: String(event.status).slice(0, 40) } : {}),
        ...(event.code ? { code: String(event.code).slice(0, 100) } : {}),
        at: normalizeDate(event.at),
      }];
    });
  }

  function appendSkillEvent(value, event) {
    const conversation = normalize(value, value?.boardId);
    const normalized = normalizeSkillEvents([event])[0];
    if (!normalized || conversation.skillEvents.some(item => item.eventId === normalized.eventId)) return conversation;
    conversation.skillEvents = [...conversation.skillEvents, normalized].slice(-500);
    conversation.updatedAt = new Date().toISOString();
    return conversation;
  }

  function normalizeWizardDraft(value, boardId) {
    if (!value || typeof value !== "object" || Array.isArray(value)
      || value.boardId !== boardId
      || !/^[a-zA-Z0-9:_-]{1,120}$/.test(String(value.taskId || ""))
      || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(String(value.skillId || ""))
      || !["collecting", "editing", "analyzing", "waiting-confirmation", "creating", "completed", "cancelled", "failed"].includes(value.status)) return null;
    const values = {};
    Object.entries(value.values || {}).slice(0, 40).forEach(([key, text]) => {
      if (!isInteractionId(key)) return;
      if (typeof text === "string") values[key] = text.slice(0, 2000);
      if (Array.isArray(text) && text.every(item => typeof item === "string")) {
        values[key] = [...new Set(text.slice(0, 16).map(item => item.slice(0, 160)))];
      }
    });
    return {
      taskId: value.taskId,
      skillId: value.skillId,
      boardId,
      status: value.status,
      step: Math.max(0, Math.min(19, Math.floor(Number(value.step) || 0))),
      values,
      sourceNodeIds: [...new Set((Array.isArray(value.sourceNodeIds) ? value.sourceNodeIds : [])
        .map(String).filter(id => /^[a-zA-Z0-9:_-]{1,120}$/.test(id)))].slice(0, 8),
      parameters: normalizeParameters(value.parameters),
      error: String(value.error || "").slice(0, 300),
      updatedAt: normalizeDate(value.updatedAt),
    };
  }

  function normalizeParameters(value) {
    const result = {};
    for (const key of ["model", "size", "resolution", "width", "height", "aspectRatio", "type"]) {
      if (typeof value?.[key] === "string" && value[key].length <= 160) result[key] = value[key];
    }
    if (typeof value?.automatic === "boolean") result.automatic = value.automatic;
    return result;
  }

  function defaultGenerationSettings() {
    return { mode: "agent", automatic: true, type: "image", model: "", size: "auto", resolution: "" };
  }

  function normalizeGenerationSettings(value) {
    const next = defaultGenerationSettings();
    if (!value || typeof value !== "object" || Array.isArray(value)) return next;
    next.mode = ["agent", "image", "video"].includes(value.mode) ? value.mode : "agent";
    next.automatic = value.automatic !== false;
    next.type = ["image", "video"].includes(value.type) ? value.type : "image";
    if (next.mode === "image" || next.mode === "video") next.type = next.mode;
    for (const key of ["model", "size", "resolution"]) {
      if (typeof value[key] === "string" && value[key].length <= 160) next[key] = value[key];
    }
    return next;
  }

  function isInteractionId(value) {
    return typeof value === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(value)
      && !["__proto__", "constructor", "prototype"].includes(value);
  }

  function isInteractionCondition(condition, fieldIds, depth = 0) {
    if (condition === undefined) return true;
    if (!condition || typeof condition !== "object" || Array.isArray(condition) || depth > 3) return false;
    const keys = Object.keys(condition);
    if (keys.length === 1 && ["all", "any"].includes(keys[0])) {
      const children = condition[keys[0]];
      return Array.isArray(children) && children.length > 0 && children.length <= 8
        && children.every(child => isInteractionCondition(child, fieldIds, depth + 1));
    }
    if (keys.length !== 2 || !fieldIds.has(condition.field)) return false;
    if (Object.hasOwn(condition, "exists")) return typeof condition.exists === "boolean";
    if (Object.hasOwn(condition, "in")) return Array.isArray(condition.in) && condition.in.length <= 16
      && condition.in.every(value => typeof value === "string" && value.length <= 160);
    return ["equals", "not_equals", "includes"].some(key => typeof condition[key] === "string" && condition[key].length <= 160);
  }

  function matchesInteractionCondition(condition, values = {}) {
    if (!condition) return true;
    if (condition.all) return condition.all.every(child => matchesInteractionCondition(child, values));
    if (condition.any) return condition.any.some(child => matchesInteractionCondition(child, values));
    const value = values[condition.field];
    if (Object.hasOwn(condition, "exists")) return condition.exists === (Array.isArray(value) ? value.length > 0 : Boolean(value?.trim()));
    if (Object.hasOwn(condition, "equals")) return value === condition.equals;
    if (Object.hasOwn(condition, "not_equals")) return value !== condition.not_equals;
    if (condition.in) return condition.in.includes(value);
    return Array.isArray(value) && value.includes(condition.includes);
  }

  function parseInteraction(value) {
    try {
      const config = typeof value === "string" ? JSON.parse(value) : value;
      if (config?.version !== 1 || !Array.isArray(config.steps) || config.steps.length < 2 || config.steps.length > 20
        || config.title !== undefined && (typeof config.title !== "string" || config.title.length > 200)
        || config.show_cancel !== undefined && typeof config.show_cancel !== "boolean"
        || config.steps.at(-1)?.kind !== "proposal" || config.steps.at(-1)?.visible_when !== undefined) return null;
      if (config.execution && (!["skill", "image", "video", "text"].includes(config.execution.target)
        || config.execution.instructions !== undefined && (typeof config.execution.instructions !== "string" || config.execution.instructions.length > 2000))) return null;
      const stepIds = new Set();
      const fieldIds = new Set();
      for (const [index, step] of config.steps.entries()) {
        if (!isInteractionId(step.id) || typeof step.title !== "string" || !step.title.trim() || step.title.length > 200
          || stepIds.has(step.id) || ![undefined, "image", "proposal"].includes(step.kind)
          || step.kind === "proposal" && index !== config.steps.length - 1
          || !isInteractionCondition(step.visible_when, fieldIds)
          || step.fields !== undefined && !Array.isArray(step.fields)
          || step.description !== undefined && (typeof step.description !== "string" || step.description.length > 2000)
          || step.show_description !== undefined && typeof step.show_description !== "boolean"
          || step.skip_label !== undefined && (typeof step.skip_label !== "string" || step.skip_label.length > 80)
          || step.image_slot !== undefined && (step.kind !== "image" || !isInteractionId(step.image_slot))
          || step.submit_label !== undefined && (typeof step.submit_label !== "string" || step.submit_label.length > 80)
          || step.summary_title !== undefined && (typeof step.summary_title !== "string" || step.summary_title.length > 200)
          || step.sources !== undefined && (step.kind !== "image" || !Array.isArray(step.sources)
            || !step.sources.length || step.sources.length > 4 || new Set(step.sources).size !== step.sources.length
            || step.sources.some(source => !["selected", "canvas", "library", "upload"].includes(source)))
          || step.required !== undefined && typeof step.required !== "boolean" && !isInteractionCondition(step.required, fieldIds)) return null;
        stepIds.add(step.id);
        for (const field of step.fields || []) {
          if (!isInteractionId(field.id) || fieldIds.has(field.id) || fieldIds.size >= 39
            || !["text", "textarea", "choice", "number"].includes(field.type) || typeof field.label !== "string" || !field.label.trim()
            || field.label.length > 200 || !isInteractionCondition(field.visible_when, fieldIds)
            || field.required !== undefined && typeof field.required !== "boolean" && !isInteractionCondition(field.required, fieldIds)
            || field.show_label !== undefined && typeof field.show_label !== "boolean"
            || field.show_description !== undefined && typeof field.show_description !== "boolean"
            || field.layout !== undefined && (field.type !== "choice" || !["grid", "vertical"].includes(field.layout))
            || field.multiple !== undefined && (field.type !== "choice" || typeof field.multiple !== "boolean")
            || field.prefill !== undefined && !["prompt", "ai"].includes(field.prefill)
            || field.capability !== undefined && !["image_aspect_ratio", "image_output_size", "image_resolution"].includes(field.capability)
            || field.capability === "image_aspect_ratio" && field.type !== "choice"
            || field.capability === "image_output_size" && field.type !== "choice"
            || field.capability === "image_resolution" && field.type !== "choice"
            || field.type === "number" && ["min", "max", "step"].some(key => field[key] !== undefined
              && (!Number.isFinite(field[key]) || field[key] < 0))
            || field.type === "number" && (
              field.min !== undefined && field.max !== undefined && field.min > field.max
              || field.step !== undefined && field.step <= 0
            )
            || field.type !== "number" && ["min", "max", "step"].some(key => field[key] !== undefined)) return null;
          if (["description", "example", "placeholder"].some(key => field[key] !== undefined && (typeof field[key] !== "string" || field[key].length > 2000))) return null;
          if (field.prefill_prefixes && (field.type === "choice" || !Array.isArray(field.prefill_prefixes) || field.prefill_prefixes.length > 8
            || field.prefill_prefixes.some(text => typeof text !== "string" || !text || text.length > 40))) return null;
          if (["min_items", "max_items", "min_length", "max_length"].some(key => field[key] !== undefined
            && (!Number.isInteger(field[key]) || field[key] < 0 || field[key] > (key.endsWith("items") ? 16 : 2000)))
            || (field.min_items || 0) > (field.max_items ?? 16) || (field.min_length || 0) > (field.max_length ?? 2000)) return null;
          if (field.type === "choice") {
            if (!Array.isArray(field.options) || !field.options.length || field.options.length > 16) return null;
            const optionValues = new Set();
            for (const option of field.options) {
              if (typeof option.value !== "string" || !option.value || option.value.length > 160 || optionValues.has(option.value)
                || typeof option.label !== "string" || !option.label || option.label.length > 200
                || option.description !== undefined && (typeof option.description !== "string" || option.description.length > 2000)
                || !isInteractionCondition(option.visible_when, fieldIds)
                || option.match && (!Array.isArray(option.match) || option.match.length > 16
                  || option.match.some(text => typeof text !== "string" || !text || text.length > 160))) return null;
              optionValues.add(option.value);
            }
          }
          if (field.default !== undefined && getInteractionFieldError({ ...field, required: false, min_items: 0, min_length: 0 }, field.default, {})) return null;
          fieldIds.add(field.id);
        }
      }
      const summaryFields = config.steps.at(-1).summary_fields;
      if (summaryFields !== undefined && (
        !Array.isArray(summaryFields)
        || summaryFields.length > 8
        || summaryFields.some(item => !item || typeof item !== "object"
          || !fieldIds.has(item.field)
          || typeof item.label !== "string" || !item.label.trim() || item.label.length > 80)
        || new Set(summaryFields.map(item => item.field)).size !== summaryFields.length
      )) return null;
      return config;
    } catch {
      return null;
    }
  }

  function getInteractionSteps(config, values) {
    return config.steps.filter(step => matchesInteractionCondition(step.visible_when, values));
  }

  function getInteractionImageIds(step, draft) {
    if (!step?.image_slot) return draft.sourceNodeIds;
    const id = draft.values[`image_${step.image_slot}`];
    return id ? [id] : [];
  }

  function parseInteractionReview(message) {
    const raw = String(message || "").trim();
    const json = raw.replace(/^```(?:json)?\s*\n([\s\S]+?)\n```$/i, "$1");
    try {
      const review = JSON.parse(json);
      if (!review || typeof review.analysis !== "string" || typeof review.proposal !== "string"
        || (review.missing != null && typeof review.missing !== "string")) return null;
      const analysis = review.analysis.trim().slice(0, MAX_WORKFLOW_TEXT_LENGTH);
      const proposal = review.proposal.trim().slice(0, MAX_WORKFLOW_TEXT_LENGTH);
      const reportedMissing = String(review.missing ?? "").trim();
      const missing = /^(?:无(?:缺项|缺失)?|没有(?:缺项|缺失)?|无需补充|资料齐全|none|n\/?a)[。.!！\s]*$/i.test(reportedMissing)
        ? "" : reportedMissing.slice(0, 300);
      const fact = review.missing_fact;
      const image = review.invalid_image;
      const question = typeof fact?.question === "string" ? fact.question.trim().slice(0, 200) : "";
      const reason = typeof image?.reason === "string" ? image.reason.trim().slice(0, 200) : "";
      if (fact != null && (!question || !["product_name", "audience_usage", "selling_facts"].includes(fact.field))) return null;
      if (image != null && (!reason || !["opening", "main", "evidence", "detail"].includes(image.slot))) return null;
      if (!missing && !fact && !image && !(analysis && proposal)) return null;
      return {
        analysis, proposal, missing,
        ...(fact ? { missingFact: { field: fact.field, question } } : {}),
        ...(image ? { invalidImage: { slot: image.slot, reason } } : {}),
      };
    } catch {
      return null;
    }
  }

  function hasCompleteH3Prompts(promptA, promptB) {
    const fields = ["subject_definitions", "summary", "retention_analysis", "detailed_description", "overall_soundscape", "non_diegetic_music"];
    return [promptA, promptB].every(prompt => {
      const text = String(prompt || "").trim();
      const headings = [...text.matchAll(/^([a-z_]+):[ \t]*\r?$/gm)];
      return headings.length === fields.length && headings[0].index === 0
        && headings.every((heading, index) => heading[1] === fields[index]
          && text.slice(heading.index + heading[0].length, headings[index + 1]?.index).trim())
        && /<d>\s*\[Chinese\]\s*[^<]+<\/d>/u.test(text);
    });
  }

  function hasCompleteH3Package(input, presentationMode) {
    if (!hasCompleteH3Prompts(input.prompt_a, input.prompt_b) || !String(input.package_md || "").trim()) return false;
    try {
      const result = JSON.parse(input.result_json);
      const text = value => String(value || "").replace(/\r\n/g, "\n").trim();
      return result?.presentation_mode === presentationMode
        && ["status", "input_mapping", "facts", "limitations", "immutable_identity_block", "dialogue_hanzi_counts",
          "selling_plan", "storyboard", "full_script", "script_hanzi_count"].every(key => Object.hasOwn(result, key))
        && text(result.prompt_a) === text(input.prompt_a) && text(result.prompt_b) === text(input.prompt_b)
        && Array.isArray(result.storyboard)
        && ["A", "B"].every(segment => [2, 3].includes(result.storyboard.filter(row => row?.segment === segment).length));
    } catch {
      return false;
    }
  }

  function updateInteractionImages(config, step, draft, sourceNodeIds) {
    if (!step?.image_slot) return { sourceNodeIds };
    if (sourceNodeIds.length > 1) throw new Error("每个图位请选择一张图片。");
    const slot = `image_${step.image_slot}`;
    const id = sourceNodeIds[0];
    const values = { ...draft.values, [slot]: id || "" };
    return { values, sourceNodeIds: [...new Set(getInteractionImageSlots(config, values))] };
  }

  function getInteractionImageSlots(config, values) {
    const slots = [...new Set(config.steps.filter(item => item.image_slot).map(item => `image_${item.image_slot}`))];
    return slots.map(key => values[key]).filter(Boolean);
  }

  function getInteractionFields(step, values) {
    return (step.fields || []).filter(field => matchesInteractionCondition(field.visible_when, values));
  }

  function getInteractionFieldError(field, value, values) {
    const required = typeof field.required === "object" ? matchesInteractionCondition(field.required, values) : field.required === true;
    const empty = value === undefined || value === "" || Array.isArray(value) && !value.length
      || typeof value === "string" && !value.trim();
    if (empty) return required || field.min_items > 0 ? `请填写或选择${field.label}。` : "";
    if (field.type === "number") {
      const number = Number(value);
      const min = field.min ?? 0;
      const max = field.max ?? Number.MAX_SAFE_INTEGER;
      const step = field.step || 1;
      const stepOffset = (number - min) / step;
      if (!Number.isFinite(number) || number < min || number > max
        || Math.abs(stepOffset - Math.round(stepOffset)) > 1e-8) {
        return `${field.label}需为 ${min} 至 ${max} 之间且符合步进要求的数值。`;
      }
      return "";
    }
    if (field.type !== "choice") {
      if (typeof value !== "string" || value.trim().length < (field.min_length || 0) || value.length > (field.max_length ?? 2000)) return `${field.label}的长度不符合要求。`;
      return "";
    }
    const choices = field.multiple ? value : [value];
    if (!Array.isArray(choices) || !field.multiple && typeof value !== "string"
      || choices.length < (field.min_items || 0) || choices.length > (field.max_items ?? 16)
      || choices.some(choice => !field.options.some(option => option.value === choice && matchesInteractionCondition(option.visible_when, values)))) return `请检查${field.label}的选项与选择数量。`;
    return "";
  }

  function validateInteractionStep(step, values) {
    for (const field of getInteractionFields(step, values)) {
      const error = getInteractionFieldError(field, values[field.id], values);
      if (error) return error;
    }
    return "";
  }

  function parseInteractionIntakeResponse(config, message) {
    if (!config || typeof message !== "string") throw new Error("Skill 理解结果无效。");
    const text = message.trim();
    const fenced = /^```(?:json)?\s*([\s\S]+?)\s*```$/iu.exec(text);
    let result;
    try { result = JSON.parse(fenced ? fenced[1] : text); } catch {
      throw new Error("Skill 理解结果格式无效。");
    }
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Skill 理解结果格式无效。");
    const fieldById = new Map(config.steps.flatMap(step => step.fields || []).map(field => [field.id, field]));
    const imageStepIds = new Set(config.steps.filter(step => step.kind === "image").map(step => step.id));
    const fieldsToCollect = [];
    for (const id of Array.isArray(result.collectFields) ? result.collectFields : []) {
      if (!fieldById.has(id)) throw new Error(`Skill 理解结果引用了未声明字段：${String(id).slice(0, 64)}。`);
      if (!fieldsToCollect.includes(id)) fieldsToCollect.push(id);
    }
    const imageStepsToCollect = [];
    for (const id of Array.isArray(result.missingImageSteps) ? result.missingImageSteps : []) {
      if (!imageStepIds.has(id)) throw new Error(`Skill 理解结果引用了未声明图片步骤：${String(id).slice(0, 64)}。`);
      if (!imageStepsToCollect.includes(id)) imageStepsToCollect.push(id);
    }
    const knownValues = {};
    if (result.knownValues !== undefined && (!result.knownValues || typeof result.knownValues !== "object"
      || Array.isArray(result.knownValues))) throw new Error("Skill 已知信息格式无效。");
    for (const [id, candidate] of Object.entries(result.knownValues || {})) {
      const field = fieldById.get(id);
      if (!field || typeof candidate !== "string" && !(field.multiple && Array.isArray(candidate))) {
        throw new Error(`Skill 已知信息包含不支持的字段：${id}。`);
      }
      const value = typeof candidate === "string" ? candidate.trim().slice(0, field.max_length ?? 2000) : candidate;
      if (!value || getInteractionFieldError(field, value, { ...knownValues, ...(result.knownValues || {}) })) {
        throw new Error(`Skill 已知信息不符合「${field.label}」的字段要求。`);
      }
      knownValues[id] = value;
    }
    const imageMatches = (Array.isArray(result.imageMatches) ? result.imageMatches : []).filter(item =>
      imageStepIds.has(item?.stepId) && Number.isInteger(item.candidateIndex) && item.candidateIndex > 0 && item.certain === true);
    const directions = (Array.isArray(result.directions) ? result.directions : []).map(item => {
      if (!item || typeof item.label !== "string" || typeof item.description !== "string"
        || !item.label.trim() || item.label.trim().length > 32
        || item.description.trim().length < 12 || item.description.trim().length > 500) {
        throw new Error("Skill 专业推荐结果不完整。");
      }
      return { label: item.label.trim(), description: item.description.trim() };
    });
    return { knownValues, fieldsToCollect, imageStepsToCollect, imageMatches,
      analysis: String(result.analysis || "").trim().slice(0, 2000),
      summary: String(result.summary || "").trim().slice(0, 1200), directions };
  }

  function createInteractionIntakePlan(config, response, {
    values = {}, userProvidedFieldIds = [], candidateNodeIds = [], completeImageStepIds = [],
    requireUserProvidedFieldIds = [], allowModelValue = () => true,
  } = {}) {
    const parsed = parseInteractionIntakeResponse(config, response);
    const fields = new Map(config.steps.flatMap(step => step.fields || []).map(field => [field.id, field]));
    const userFields = new Set((Array.isArray(userProvidedFieldIds) ? userProvidedFieldIds : []).filter(id => fields.has(id)));
    const requiredUserChoiceFields = new Set(
      (Array.isArray(requireUserProvidedFieldIds) ? requireUserProvidedFieldIds : []).filter(id => fields.has(id)),
    );
    const completeImages = new Set((Array.isArray(completeImageStepIds) ? completeImageStepIds : []).filter(id =>
      config.steps.some(step => step.id === id && step.kind === "image")));
    const knownValues = {};
    for (const [id, proposed] of Object.entries(parsed.knownValues)) {
      const current = String(values[id] || "").trim();
      const field = fields.get(id);
      if (requiredUserChoiceFields.has(id) || !allowModelValue(id, proposed) || current && userFields.has(id)
        && !getInteractionFieldError(field, values[id], values)) continue;
      knownValues[id] = proposed;
    }
    const collectionValues = { ...values, ...knownValues };
    const fieldsToCollect = parsed.fieldsToCollect.filter(id => {
      const field = fields.get(id);
      return matchesInteractionCondition(field.visible_when, collectionValues)
        && !(userFields.has(id) && !getInteractionFieldError(field, collectionValues[id], collectionValues));
    });
    for (const id of requiredUserChoiceFields) {
      const field = fields.get(id);
      if (!userFields.has(id) && matchesInteractionCondition(field.visible_when, collectionValues)
        && !fieldsToCollect.includes(id)) fieldsToCollect.push(id);
    }
    for (const [id, field] of fields) {
      const required = field.required === true
        || typeof field.required === "object" && matchesInteractionCondition(field.required, collectionValues);
      if (required && matchesInteractionCondition(field.visible_when, collectionValues)
        && getInteractionFieldError(field, collectionValues[id], collectionValues)
        && !fieldsToCollect.includes(id)) fieldsToCollect.push(id);
    }
    const imageStepsToCollect = parsed.imageStepsToCollect.filter(id => !completeImages.has(id));
    for (const step of getInteractionSteps(config, collectionValues).filter(item => item.kind === "image")) {
      const required = step.required === undefined || typeof step.required === "object"
        ? matchesInteractionCondition(step.required, collectionValues) : step.required;
      if (required && !completeImages.has(step.id) && !imageStepsToCollect.includes(step.id)) imageStepsToCollect.push(step.id);
    }
    const imageMatches = parsed.imageMatches.filter(item => !completeImages.has(item.stepId)
      && Array.isArray(candidateNodeIds) && item.candidateIndex <= candidateNodeIds.length);
    return { ...parsed, knownValues, fieldsToCollect, imageStepsToCollect, imageMatches,
      requiresCollection: fieldsToCollect.length > 0 || imageStepsToCollect.length > 0 };
  }

  function createInteractionCollection(config, plan) {
    if (!config || !plan) return config;
    const collectFields = new Set(plan.fieldsToCollect || []);
    const collectImageSteps = new Set(plan.imageStepsToCollect || []);
    const steps = config.steps.flatMap(step => {
      if (step.kind === "proposal") return [step];
      if (step.kind === "image") return collectImageSteps.has(step.id) ? [step] : [];
      const fields = (step.fields || []).filter(field => collectFields.has(field.id));
      if (!fields.length) return [];
      const fieldsWithDependencies = step.fields.filter(field => fields.includes(field)
        || fields.some(parent => field.visible_when?.field === parent.id));
      return [{ ...step, fields: fieldsWithDependencies }];
    });
    return { ...config, steps };
  }

  function getInteractionValueLabel(field, value, options = field.options || []) {
    const label = selected => options.find(option => option.value === selected)?.label || String(selected || "");
    return Array.isArray(value) ? value.map(label).join("、") : label(value);
  }

  function buildWorkflowNodeArguments({ workflowId, title, prompt, sourceNodeIds = [], parameters = {} } = {}) {
    const id = String(workflowId || "");
    const cleanPrompt = String(prompt || "").trim();
    if (!/^[a-zA-Z0-9:_-]{1,120}$/.test(id) || !cleanPrompt) {
      throw new Error("工作流标识或最终提示词无效。");
    }
    const normalized = normalizeParameters(parameters);
    let size = normalized.size || "";
    if (size === "custom") {
      if (!/^\d{2,5}$/.test(normalized.width || "") || !/^\d{2,5}$/.test(normalized.height || "")) {
        throw new Error("自定义尺寸缺少有效宽度或高度。");
      }
      size = `${normalized.width}x${normalized.height}`;
    }
    const references = [...new Set((Array.isArray(sourceNodeIds) ? sourceNodeIds : [])
      .map(value => String(value || "").trim())
      .filter(value => /^[a-zA-Z0-9:_-]{1,120}$/.test(value)))].slice(0, 8);
    return {
      node_key: `workflow:${id}`,
      title: String(title || "创作生成").slice(0, 160),
      prompt: cleanPrompt.slice(0, MAX_WORKFLOW_TEXT_LENGTH),
      ...(normalized.model ? { model: normalized.model } : {}),
      ...(size ? { size } : {}),
      ...(normalized.resolution ? { resolution: normalized.resolution } : {}),
      reference_node_ids: references,
    };
  }

  function buildConfirmedWizardWorkflow({
    pending,
    draft,
    imagePrompt,
    updatedAt = new Date().toISOString(),
    requiresImagePrompt = false,
    executionChoice = "create_manually",
    allowsAutoGenerate = false,
  } = {}) {
    const boardId = String(pending?.boardId || "");
    const normalizedDraft = normalizeWizardDraft(draft, boardId);
    if (pending?.workflow !== "skill" || !normalizedDraft
      || pending.workflowId !== normalizedDraft.taskId
      || pending.skillId !== normalizedDraft.skillId
      || pending.boardId !== normalizedDraft.boardId) {
      throw new Error("当前任务或 Skill 已变化，请重新检查方案。");
    }

    const pendingSources = Array.isArray(pending.sourceNodeIds) ? pending.sourceNodeIds.map(String) : [];
    if (pendingSources.length !== normalizedDraft.sourceNodeIds.length
      || pendingSources.some((id, index) => id !== normalizedDraft.sourceNodeIds[index])) {
      throw new Error("方案引用素材已变化，请返回重新选择素材。");
    }

    const cleanPrompt = String(imagePrompt ?? pending.imagePrompt ?? "").trim();
    const parameters = normalizedDraft.parameters;
    if (requiresImagePrompt && !cleanPrompt) throw new Error("图片生成提示词不能为空。");
    if (requiresImagePrompt && (!parameters.model || !parameters.size)) {
      throw new Error("确认方案缺少已选图片模型或画幅参数。");
    }
    if (requiresImagePrompt && parameters.size === "custom"
      && (!/^\d{2,5}$/.test(parameters.width || "")
        || !/^\d{2,5}$/.test(parameters.height || ""))) {
      throw new Error("自定义尺寸缺少有效宽度或高度。");
    }
    if (!ALLOWED_EXECUTION_CHOICES.has(executionChoice)) throw new Error("确认卡执行选项无效。");
    if (executionChoice === "create_and_generate" && !allowsAutoGenerate) {
      throw new Error("当前流程不支持自动生成。");
    }
    if (executionChoice === "create_and_generate" && (!parameters.model || !parameters.size)) {
      throw new Error("自动生成缺少已校验的模型或输出比例。");
    }

    return {
      ...pending,
      imagePrompt: cleanPrompt.slice(0, MAX_WORKFLOW_TEXT_LENGTH),
      parameters,
      executionChoice,
      generationState: "not-started",
      status: "confirmed",
      updatedAt: normalizeDate(updatedAt),
    };
  }

  function prefillInteraction(config, prompt = "", suggestions = {}, existing = {}) {
    const values = { ...existing };
    if (prompt) values.request = prompt;
    for (const field of config.steps.flatMap(step => step.fields || [])) {
      if (Object.hasOwn(existing, field.id)) continue;
      if (field.default !== undefined) values[field.id] = Array.isArray(field.default) ? [...field.default] : field.default;
      if (field.prefill === "prompt" && prompt && field.type !== "choice") values[field.id] = prompt.slice(0, 2000);
      const suggestion = suggestions[field.id];
      if (field.prefill === "ai" && suggestion !== undefined && !getInteractionFieldError(field, suggestion, values)) values[field.id] = suggestion;
      if (field.type === "choice" && prompt) {
        const matches = field.options.map(option => ({
          value: option.value,
          length: Math.max(0, ...(option.match || [option.label, option.value])
            .filter(text => prompt.includes(text)).map(text => text.length)),
        })).filter(option => option.length);
        const longest = Math.max(0, ...matches.map(option => option.length));
        const best = matches.filter(option => option.length === longest);
        if (field.multiple && matches.length) values[field.id] = matches.map(option => option.value);
        else if (best.length === 1) values[field.id] = best[0].value;
      }
      for (const prefix of field.prefill_prefixes || []) {
        const start = prompt.indexOf(prefix);
        if (start < 0) continue;
        const delimiter = field.type === "textarea" ? /\r?\n/u : /[，,。；;\n]/u;
        const text = prompt.slice(start + prefix.length).split(delimiter)[0].trim();
        if (text) values[field.id] = text.slice(0, 2000);
        break;
      }
    }
    return values;
  }

  function recoverPhotoWorkflowIdentity(value, boardId, storedConversationId, wizardDraft) {
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(storedConversationId)
      || wizardDraft?.skillId !== NATURAL_PHOTO_WORKFLOW || wizardDraft.boardId !== boardId
      || wizardDraft.taskId !== value.workflowId || !value.sourceNodeIds?.length
      || JSON.stringify(wizardDraft.sourceNodeIds) !== JSON.stringify(value.sourceNodeIds)
      || !value.parameters?.model || value.parameters.model !== wizardDraft.parameters.model
      || !value.parameters.size || value.parameters.size !== wizardDraft.parameters.size) return null;
    return { conversationId: storedConversationId, executionTarget: "image" };
  }

  function normalizePendingWorkflow(value, boardId, ownerConversationId, storedConversationId, wizardDraft) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    if (value.workflow === "node-edit") {
      const { operationId, nodeId, field, key, original, candidate, photoValue, prompt, nodeLabel, originalFingerprint } = value;
      if (value.boardId !== boardId || value.conversationId !== ownerConversationId
        || ![operationId, nodeId].every(id => typeof id === "string" && /^[\w-]{1,120}$/.test(id))
        || !["prompt", "content"].includes(field) || !["prompt", "llmPrompt", "minimaxH3Prompt", "apiVideoPrompt", "text"].includes(key)
        || (field === "content") !== (key === "text")
        || typeof original !== "string" || original.length > 12000
        || typeof candidate !== "string" || !candidate.trim() || candidate.length > 12000
        || !/^[a-f0-9]{64}$/.test(originalFingerprint)
        || typeof photoValue !== "string" || photoValue.length > 65536
        || !Array.isArray(value.mentions) || value.mentions.length > 64) return null;
      return {
        workflow: "node-edit", boardId, conversationId: ownerConversationId, operationId, nodeId, field, key,
        original, candidate, photoValue, originalFingerprint, mentions: value.mentions,
        messageId: /^[\w-]{1,160}$/.test(value.messageId || "") ? value.messageId : "",
        prompt: String(prompt || "").slice(0, 12000), nodeLabel: String(nodeLabel || "").slice(0, 240),
      };
    }
    const workflow = String(value.workflow || "");
    const skillId = String(value.skillId || "");
    const storedBoardId = String(value.boardId || "");
    const status = String(value.status || "");
    const analysis = String(value.analysis || "");
    const proposal = String(value.proposal || "");
    const imagePrompt = String(value.imagePrompt || "");
    const sourceNodeIds = Array.isArray(value.sourceNodeIds)
      ? value.sourceNodeIds.map((id) => String(id || "").trim())
      : [];
    const sourceFingerprint = String(value.sourceFingerprint || "").toLowerCase();
    const outputNodeId = String(value.outputNodeId || "");
    const workflowId = String(value.workflowId || "");
    if (workflow === CREATIVE_PRODUCT_BATCH_WORKFLOW) {
      try {
        const batch = normalizeCreativeProductPhotoBatch(value, {
          boardId,
          conversationId: storedConversationId,
        });
        if (!ALLOWED_WORKFLOW_STATUSES.has(status)
          || !["awaiting-confirmation", "creating", "partial-failed", "created", "text-only"].includes(batch.batchState)) return null;
        return {
          workflow,
          skillId: CREATIVE_PRODUCT_BATCH_SKILL,
          boardId: batch.boardId,
          conversationId: batch.conversationId,
          workflowId: batch.workflowId,
          status,
          batchState: batch.batchState,
          sourceNodeIds: batch.sourceNodeIds,
          sourceFingerprint: batch.sourceFingerprint,
          productName: batch.productName,
          productAnalysis: batch.productAnalysis,
          parameters: batch.parameters,
          items: batch.items,
          layout: batch.layout,
          updatedAt: normalizeDate(value.updatedAt),
        };
      } catch {
        return null;
      }
    }
    // Legacy hosts save the H3 plan but omit these two fields in their response.
    const h3Plan = workflow === "skill" && skillId === "h3-commerce-video";
    const naturalPhotography = workflow === NATURAL_PHOTO_WORKFLOW;
    const recoveredPhoto = naturalPhotography && !value.photoReconfirmationRequired
      && (!value.conversationId || !value.executionTarget)
      ? recoverPhotoWorkflowIdentity(value, boardId, storedConversationId, wizardDraft)
      : null;
    const conversationId = String(value.conversationId || recoveredPhoto?.conversationId || (h3Plan ? ownerConversationId : ""));
    const executionChoice = ALLOWED_EXECUTION_CHOICES.has(value.executionChoice)
      ? value.executionChoice
      : "create_manually";
    const executionTarget = ["image", "video", "text", "skill"].includes(value.executionTarget)
      ? value.executionTarget
      : recoveredPhoto?.executionTarget || (h3Plan ? "skill" : "");
    const generationState = ALLOWED_GENERATION_STATES.has(value.generationState)
      ? value.generationState
      : "not-started";
    const generationError = String(value.generationError || "").slice(0, 300);
    const questions = (Array.isArray(value.questions) ? value.questions : []).slice(0, 5).map((question) => ({
      id: String(question?.id || "").slice(0, 64),
      label: String(question?.label || "").slice(0, 200),
      kind: question?.kind === "text" ? "text" : "single",
      options: (Array.isArray(question?.options) ? question.options : []).slice(0, 8)
        .map((option) => String(option || "").slice(0, 120)),
      required: question?.required !== false,
      recommended: String(question?.recommended || "").slice(0, 200),
    })).filter((question) => /^[a-zA-Z0-9_-]{1,64}$/.test(question.id) && question.label);
    const unsafeText = /data:[^,\s]{1,120};base64,|bearer\s+[a-z0-9._~-]+|(?:api[_-]?key|access[_-]?token)\s*[:=]\s*\S|sk-[a-z0-9_-]{20,}/i;
    if (!naturalPhotography && workflow !== "skill"
      || naturalPhotography && skillId !== NATURAL_PHOTO_WORKFLOW
      || naturalPhotography && value.canvasId !== undefined && value.canvasId !== boardId
      || naturalPhotography && conversationId && conversationId !== storedConversationId
      || naturalPhotography && value.executionTarget !== undefined && value.executionTarget !== "image"
      || !/^[a-z0-9][a-z0-9-]{0,119}$/.test(skillId)
      || !storedBoardId
      || storedBoardId !== String(boardId || "")
      || !ALLOWED_WORKFLOW_STATUSES.has(status)
      || !analysis.trim()
      || !proposal.trim()
      || analysis.length > MAX_WORKFLOW_TEXT_LENGTH
      || proposal.length > MAX_WORKFLOW_TEXT_LENGTH
      || naturalPhotography && !imagePrompt.trim()
      || imagePrompt.length > MAX_WORKFLOW_TEXT_LENGTH
      || unsafeText.test(analysis)
      || unsafeText.test(proposal)
      || unsafeText.test(imagePrompt)
      || naturalPhotography && !sourceNodeIds.length
      || sourceNodeIds.length > 8
      || sourceNodeIds.some((id) => !/^[a-zA-Z0-9:_-]{1,120}$/.test(id))
      || new Set(sourceNodeIds).size !== sourceNodeIds.length
      || (naturalPhotography || sourceNodeIds.length) && !/^[a-f0-9]{64}$/.test(sourceFingerprint)
      || outputNodeId && !/^[a-zA-Z0-9:_-]{1,120}$/.test(outputNodeId)
      || conversationId && !/^[a-zA-Z0-9_-]{1,120}$/.test(conversationId)) {
      return null;
    }
    if (workflowId && !/^[a-zA-Z0-9:_-]{1,120}$/.test(workflowId)) return null;
    return {
      workflow,
      skillId,
      boardId: storedBoardId,
      ...(naturalPhotography ? { canvasId: storedBoardId } : {}),
      ...(conversationId ? { conversationId } : {}),
      ...(naturalPhotography && (!conversationId || !executionTarget || value.photoReconfirmationRequired)
        ? { photoReconfirmationRequired: true } : {}),
      status,
      analysis,
      proposal,
      imagePrompt,
      parameters: normalizeParameters(value.parameters),
      ...(executionTarget ? { executionTarget } : {}),
      executionChoice,
      generationState,
      generationError,
      sourceNodeIds,
      sourceFingerprint,
      ...(workflowId ? { workflowId } : {}),
      questions,
      updatedAt: normalizeDate(value.updatedAt),
      ...(outputNodeId ? { outputNodeId } : {}),
    };
  }

  function normalizeCreativeProductPhotoBatch(value, owner = {}) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("十种创意批次格式无效。");
    const boardId = String(value.boardId || "");
    const conversationId = String(value.conversationId || "");
    const workflowId = String(value.workflowId || "");
    if (!/^[A-Za-z0-9:_-]{1,120}$/u.test(boardId) || boardId !== String(owner.boardId || "")) {
      throw new Error("十种创意批次不属于当前画布。");
    }
    if (!/^[A-Za-z0-9_-]{1,120}$/u.test(conversationId)
      || owner.conversationId && conversationId !== String(owner.conversationId)) {
      throw new Error("十种创意批次不属于当前对话。");
    }
    if (!/^[A-Za-z0-9:_-]{1,120}$/u.test(workflowId)) throw new Error("十种创意任务标识无效。");
    const sourceNodeIds = Array.from(new Set((Array.isArray(value.sourceNodeIds) ? value.sourceNodeIds : [])
      .map(id => String(id || "").trim())));
    if (sourceNodeIds.length !== 1 || !/^[A-Za-z0-9:_-]{1,120}$/u.test(sourceNodeIds[0] || "")
      || !/^[a-f0-9]{64}$/u.test(String(value.sourceFingerprint || "").toLowerCase())) {
      throw new Error("十种创意方案必须绑定一个已核验的产品原图。");
    }
    const productName = String(value.productName || "").trim();
    const productAnalysis = String(value.productAnalysis || "").trim();
    if (!productName || productName.length > 160 || !productAnalysis || productAnalysis.length > 6000) {
      throw new Error("产品识别资料缺失或过长。");
    }
    if (!Array.isArray(value.items) || value.items.length !== 10) throw new Error("十种创意方案必须恰好包含十项。");
    const normalizedNames = new Set();
    const normalizedPrompts = new Set();
    let totalChars = productName.length + productAnalysis.length;
    const items = value.items.map((entry, index) => {
      const slot = Number(entry?.slot);
      const direction = String(entry?.direction || "").trim();
      const summary = String(entry?.summary || "").trim();
      const prompt = String(entry?.prompt || "").trim();
      const status = ["pending", "created", "failed"].includes(String(entry?.status || ""))
        ? String(entry.status) : "pending";
      const nodeId = String(entry?.nodeId || "");
      const error = String(entry?.error || "").slice(0, 500);
      if (slot !== index + 1 || !direction || direction.length > 160 || !summary || summary.length > 1600
        || !prompt || prompt.length > MAX_ITEM_TEXT_LENGTH - 160) {
        throw new Error(`第 ${index + 1} 项方向或完整提示词不完整。`);
      }
      const directionKey = direction.toLocaleLowerCase("zh-CN");
      const promptKey = prompt.replace(/\s+/gu, "").toLocaleLowerCase("zh-CN");
      if (normalizedNames.has(directionKey)) throw new Error("创意方向名称重复。");
      if (normalizedPrompts.has(promptKey)) throw new Error("创意提示词重复，十项必须分别编写。");
      normalizedNames.add(directionKey);
      normalizedPrompts.add(promptKey);
      if (status === "created" && !/^[A-Za-z0-9:_-]{1,120}$/u.test(nodeId)) {
        throw new Error(`第 ${index + 1} 项没有可核验的节点 ID。`);
      }
      if (status !== "created" && nodeId) throw new Error(`第 ${index + 1} 项状态与节点 ID 不一致。`);
      totalChars += direction.length + summary.length + prompt.length + error.length;
      return { slot, direction, summary, prompt, status, nodeId, error };
    });
    if (totalChars > 140000) throw new Error("十种完整提示词合计过长，无法可靠保存。");
    const batchState = String(value.batchState || "awaiting-confirmation");
    if (!["awaiting-confirmation", "creating", "partial-failed", "created", "text-only"].includes(batchState)) {
      throw new Error("十种创意批次状态无效。");
    }
    const layout = Array.isArray(value.layout) ? value.layout.map((point, index) => ({
      slot: Number(point?.slot),
      x: Number(point?.x),
      y: Number(point?.y),
    })) : [];
    if (layout.length && (layout.length !== 10 || layout.some((point, index) =>
      point.slot !== index + 1 || !Number.isFinite(point.x) || !Number.isFinite(point.y)))) {
      throw new Error("十个图片节点布局未能完整保存。");
    }
    if (batchState === "created" && items.some(item => item.status !== "created")) {
      throw new Error("仅全部十个节点已保存时，批次才能标记为创建完成。");
    }
    return {
      workflowId, boardId, conversationId, sourceNodeIds,
      sourceFingerprint: String(value.sourceFingerprint).toLowerCase(),
      productName, productAnalysis, parameters: normalizeParameters(value.parameters),
      items, batchState, layout,
    };
  }

  function appendItems(value, newItems) {
    const next = normalize(value, value?.boardId);
    const seen = new Set(next.items.map((item) => item.id));
    (Array.isArray(newItems) ? newItems : []).forEach((item) => {
      const normalized = normalizeItem(item);
      if (!normalized || seen.has(normalized.id)) return;
      seen.add(normalized.id);
      next.items.push(normalized);
    });
    next.items = next.items.slice(-MAX_ITEMS);
    next.updatedAt = new Date().toISOString();
    return next;
  }

  function markInterrupted(value) {
    const next = normalize(value, value?.boardId);
    next.items = next.items.map((item) => item.status === "running"
      ? {
          ...item,
          status: "recoverable",
          text: appendRecoveryHint(item.text),
          deliveryStatus: item.deliveryStatus === "sending" ? "failed" : item.deliveryStatus,
          executionStatus: "failed",
        }
      : item);
    next.updatedAt = new Date().toISOString();
    return next;
  }

  function buildTranscript(value) {
    return normalize(value, value?.boardId).items
      .filter((item) => ["user", "assistant", "tool"].includes(item.role) && item.text)
      .slice(-MAX_TRANSCRIPT_ITEMS)
      .map((item) => ({
        role: item.role,
        content: buildTranscriptContent(item),
        ...(item.toolName ? { tool_name: item.toolName } : {}),
        ...(item.nodeId ? { node_id: item.nodeId } : {}),
      }));
  }

  function buildTranscriptContent(item) {
    if (!item.skillLabel) return item.text;
    const skillId = item.skillId ? `（${item.skillId}）` : "";
    return `[本次专业流程：${item.skillLabel}${skillId}]\n${item.text}`;
  }

  function normalizeMessageAttachments(value) {
    return (Array.isArray(value) ? value : []).slice(0, 15).flatMap(item => {
      const nodeId = String(item?.nodeId || "").trim().slice(0, 120);
      const url = String(item?.url || "").trim();
      const mimeType = String(item?.mimeType || "");
      const type = ["document", "video", "audio"].includes(item?.type) ? item.type : "image";
      const validUrl = url.length <= 4000 && !/[\\\s\u0000-\u001f]/u.test(url) && /^(?:\/(?!\/)|https?:\/\/)/iu.test(url);
      if (!nodeId || type !== "document" && !validUrl || type === "image" && !/^image\/(?:jpeg|png|webp)$/u.test(mimeType)) return [];
      return [{
        nodeId, url: type === "document" ? "" : url, mimeType,
        ...(type === "image" ? {} : { type }),
        name: String(item.name || "素材").trim().slice(0, 240),
        source: ["canvas", "library", "upload"].includes(item.source) ? item.source : "canvas",
        ...(["canvas_node", "conversation_upload", "skill_output"].includes(item.origin) ? { origin: item.origin } : {}),
        ...(["product", "detail", "style", "person", "scene", "other"].includes(item.role) ? { role: item.role } : {}),
        ...(Array.isArray(item.aliases) ? { aliases: [...new Set(item.aliases.filter(alias =>
          typeof alias === "string" && /^@(图|视频|音频|文档|素材)\d{1,3}$/.test(alias)))].slice(0, 5) } : {}),
      }];
    });
  }

  function normalizeItem(value) {
    if (!value || typeof value !== "object") return null;
    const role = ALLOWED_ROLES.has(String(value.role || "")) ? String(value.role) : "notice";
    const text = String(value.text || "").slice(0, MAX_ITEM_TEXT_LENGTH);
    if (!text && role !== "tool") return null;
    const skillSource = ALLOWED_SKILL_SOURCES.has(String(value.skillSource || ""))
      ? String(value.skillSource)
      : "";
    return {
      id: String(value.id || makeConversationId()).slice(0, 160),
      role,
      text,
      status: ALLOWED_STATUSES.has(String(value.status || "")) ? String(value.status) : "completed",
      toolName: String(value.toolName || "").slice(0, 120),
      nodeId: String(value.nodeId || "").slice(0, 120),
      skillId: String(value.skillId || "").slice(0, 120),
      skillLabel: String(value.skillLabel || "").slice(0, 80),
      skillSource,
      requestId: String(value.requestId || "").slice(0, 160),
      deliveryStatus: ["sending", "sent", "failed"].includes(String(value.deliveryStatus || ""))
        ? String(value.deliveryStatus) : "",
      executionStatus: ["queued", "running", "awaiting_confirmation", "completed", "failed", "cancelled"].includes(String(value.executionStatus || ""))
        ? String(value.executionStatus) : "",
      ...(role === "user" && Array.isArray(value.attachments) && value.attachments.length
        ? { attachments: normalizeMessageAttachments(value.attachments) } : {}),
      createdAt: normalizeDate(value.createdAt),
    };
  }

  function appendRecoveryHint(text) {
    const clean = String(text || "").replace(/\s*可以继续。?\s*$/u, "").trim();
    return `${clean ? `${clean}；` : ""}上次任务已中断，可以继续。`;
  }

  function normalizeDate(value) {
    const timestamp = Date.parse(String(value || ""));
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString();
  }

  function makeConversationId() {
    if (typeof crypto === "object" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    return `agent_item_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  // Keep the versioned photography brief in the existing analysis string so
  // an already-running host can round-trip it through the conversation store.
  const naturalPhotoFidelity = (() => {
    const visionLimit = 3;
    const editLimit = 4;
    const idPattern = /^[a-zA-Z0-9:_-]{1,120}$/;
    const objectGroups = {
      targetObjects: "目标商品", components: "商品部件", accessories: "配件", packaging: "包装", props: "场景道具",
    };
    const aspects = {
      identity: "身份", count: "数量", appearance: "外观", color: "颜色",
      material: "材质", structure: "形状与结构", markings: "可见文字和标识", relationship: "相对位置与物理关系",
    };
    const relations = {
      attached: "连接到", "wrapped-by": "被包覆于", inside: "位于内部",
      aligned: "对位于", "paired-with": "配套使用", "displayed-with": "共同陈列",
    };
    const transforms = {
      placement: "整体在画面中的位置", scale: "整体画面占比与透视尺度", rotation: "完整组合的整体旋转与朝向",
      camera: "机位、视角、焦距和透视", composition: "构图、留白和视觉引导",
      arrangement: "独立商品之间的陈列位置，保持各自完整及配套关系",
      environment: "前中后景、背景、环境与承托", lighting: "光线、阴影、反射和景深",
      props: "与商品独立的摄影道具，保持关键特征可见",
    };
    const actions = {
      add: "增加额外实例", remove: "删除", duplicate: "复制", merge: "擅自合并", replace: "替换",
      "change-count": "改变数量", reshape: "改变形状或结构", recolor: "改变本色",
      relabel: "改写文字或标识", detach: "拆开物理连接", "move-relative": "改变连接结构的相对位置",
      obscure: "遮挡关键可见特征", invent: "补造未知信息",
    };
    const textCases = {
      "NA-01": "透光层幕", "NA-02": "窗边触感", "NA-03": "反射雕塑", "NA-04": "移动工作站",
      "NA-05": "草丘与天空", "NA-06": "建筑光廊", "NA-07": "色面舞台",
    };

    function readTextCases(value) {
      return [...new Set(String(value || "").match(/\bNA-0[1-7]\b/gu) || [])]
        .map(caseId => ({ caseId, title: textCases[caseId] }));
    }

    function text(value, max = 360) {
      const clean = typeof value === "string" ? value.trim() : "";
      if (!clean || clean.length > max) throw new Error(`产品保真字段为空或超过 ${max} 字，请精简后重新提交。`);
      return clean;
    }

    function list(value, max, label) {
      if (!Array.isArray(value) || value.length > max) throw new Error(`产品保真清单的${label}格式或数量不正确。`);
      return value;
    }

    function enumValue(values, key, label) {
      if (typeof key !== "string" || !Object.hasOwn(values, key)) throw new Error(`${label}无效：${String(key)}。`);
      return key;
    }

    function inventoryId(value) {
      if (typeof value !== "string" || !idPattern.test(value)) throw new Error("商品对象或关系 ID 无效。");
      return value;
    }

    function briefFieldError(field, message, code = "photo_brief_schema") {
      return Object.assign(new Error(`${field}：${message}`), { field, code });
    }

    function requireFields(value, keys, path) {
      for (const key of keys) {
        if (!value || !Object.hasOwn(value, key) || value[key] === undefined) {
          throw briefFieldError(`${path}.${key}`, "缺少必填字段。");
        }
      }
    }

    function readInventoryImage(item, nodeId, path) {
      const source = item.subjectInventory;
      if (path) {
        requireFields(item, ["subjectInventory"], path);
        requireFields(source, ["targetObjects"], `${path}.subjectInventory`);
      }
      const objectById = new Map();
      const visualMaterialIds = new Set();
      const protectedIds = new Set();
      const inventory = Object.fromEntries(Object.entries(objectGroups).map(([group, label]) => [
        group, list(path && !Object.hasOwn(source, group) ? [] : source?.[group], 15, label).map((object, index) => {
          if (path) requireFields(object, ["id", "name", "count", "appearance", "structure"],
            `${path}.subjectInventory.${group}[${index}]`);
          const id = inventoryId(object?.id);
          if (objectById.has(id)) throw new Error("同图商品对象 ID 重复。");
          if (!Number.isInteger(object.count) || object.count < 1 || object.count > 9999) throw new Error("商品数量无效。");
          const next = {
            id, name: text(object.name, 90), count: object.count, appearance: text(object.appearance, 180),
            color: object.color == null ? null : text(object.color, 100),
            material: object.material == null ? null : text(object.material, 100),
            structure: text(object.structure, 220), markings: object.markings ? text(object.markings, 180) : "",
          };
          objectById.set(id, next);
          if (group !== "props") protectedIds.add(id);
          return next;
        }),
      ]));
      if (!inventory.targetObjects.length) throw new Error("清单必须包含至少一个目标商品。");
      const relationById = new Map();
      const physicalIds = new Set();
      inventory.relationships = list(path && !Object.hasOwn(source, "relationships") ? [] : source.relationships, 18, "关系").map(rule => {
        const id = inventoryId(rule?.id);
        if (objectById.has(id) || relationById.has(id) || !objectById.has(rule.from) || !objectById.has(rule.to)
          || rule.from === rule.to) throw new Error("商品关系的对象或关系 ID 无效。");
        const kind = enumValue(relations, rule.kind, "商品关系");
        if (!["displayed-with", "paired-with"].includes(kind)) {
          if (!protectedIds.has(rule.from) || !protectedIds.has(rule.to)) throw new Error("场景道具不能被用作商品的固定物理部件。");
          physicalIds.add(id);
        }
        const next = { id, from: rule.from, to: rule.to, kind, detail: text(rule.detail, 180) };
        relationById.set(id, next);
        return next;
      });
      inventory.unknowns = list(path && !Object.hasOwn(source, "unknowns") ? [] : source.unknowns, 15, "未知项").map((rule, index) => {
        if (!protectedIds.has(rule?.targetId) || typeof rule.required !== "boolean") throw new Error("未知项的对象或 required 无效。");
        let field = enumValue({ ...aspects, internal: true, interface: true, function: true, category: true,
          "unreadable-markings": true }, rule.field, "未知字段");
        const object = objectById.get(rule.targetId);
        if (path && field === "markings" && object.markings && rule.required === false
          && /(?:其余|其他|剩余|部分|细小|微小|小字|未见|不可见|看不清|无法辨认)/u.test(String(rule.detail))
          && !/(?:所有|全部|任何|没有|均|全都|无标识|无文字)/u.test(String(rule.detail))) field = "unreadable-markings";
        if (path && field === "material" && object.material
          && /^(?:[\p{L}\p{N}、·\s-]{1,45})(?:观感|质感|外观|视觉效果)$/u.test(object.material)
          && !/(?:实际|确认为|证实|采用|制成|成分|材质为)/u.test(object.material)) {
          const appearance = object.appearance.includes(object.material)
            ? object.appearance : `${object.appearance}，${object.material}`;
          if (appearance.length > 180) throw briefFieldError(`${path}.subjectInventory.unknowns[${index}].field`,
            `对象 ${rule.targetId} 的材质观感需移入 appearance，完整保留原有外观。`, "photo_brief_conflict");
          object.appearance = appearance;
          object.material = null;
          visualMaterialIds.add(rule.targetId);
        }
        if (["color", "material", "markings"].includes(field) && object[field]) {
          throw briefFieldError(`${path || "images"}.subjectInventory.unknowns[${index}].field`,
            `对象 ${rule.targetId}（${object.name}）的 ${field} 已声明可见事实，与未知项冲突。`, "photo_brief_conflict");
        }
        return { targetId: rule.targetId, field, detail: text(rule.detail, 160), required: rule.required };
      });
      const declared = list(path && !Object.hasOwn(item, "mustPreserve") ? [] : item.mustPreserve, 100, "必须保留").map((rule, index) => {
        const targetId = rule?.targetId;
        const aspect = rule?.aspect === "material" && visualMaterialIds.has(targetId)
          ? "appearance" : enumValue(aspects, rule?.aspect, "保留字段");
        const relation = relationById.get(targetId);
        if (relation ? aspect !== "relationship" || !physicalIds.has(targetId) && relation.kind !== "paired-with"
          : !protectedIds.has(targetId) || aspect === "relationship") {
          throw new Error("保留规则与对象类别或关系冲突。");
        }
        if (inventory.unknowns.some(unknown => unknown.targetId === targetId && unknown.field === aspect)) {
          throw briefFieldError(`${path || "images"}.mustPreserve[${index}].aspect`,
            `对象 ${targetId} 的 ${aspect} 同时要求保留已确认值和保持未知。`, "photo_brief_conflict");
        }
        return { targetId, aspect };
      });
      for (const targetId of protectedIds) {
        const object = objectById.get(targetId);
        for (const aspect of ["identity", "count", "appearance", "structure", "color", "material", "markings"]) {
          if (object[aspect] !== null && object[aspect] !== ""
            && !inventory.unknowns.some(unknown => unknown.targetId === targetId && unknown.field === aspect)) {
            declared.push({ targetId, aspect });
          }
        }
      }
      for (const [targetId, relation] of relationById) {
        if (physicalIds.has(targetId) || relation.kind === "paired-with") declared.push({ targetId, aspect: "relationship" });
      }
      const mustPreserve = [...new Map(declared.map(rule => [`${rule.targetId}:${rule.aspect}`, rule])).values()];
      const allowedTransformations = [...new Set(list(path && !Object.hasOwn(item, "allowedTransformations")
        ? Object.keys(transforms).filter(key => key !== "props") : item.allowedTransformations, 9, "允许调整")
        .map(key => enumValue(transforms, key, "摄影调整项")))];
      if (!allowedTransformations.length) throw new Error("至少需要一项允许调整的摄影内容。");
      const prohibitedChanges = list(path && !Object.hasOwn(item, "prohibitedChanges") ? [] : item.prohibitedChanges, 45, "禁止改变").map(rule => {
        const action = enumValue(actions, rule?.action, "禁止改变的操作");
        const targetId = rule.targetId;
        if (["detach", "move-relative"].includes(action) ? !physicalIds.has(targetId) : !protectedIds.has(targetId)) {
          throw new Error("禁止改变的操作与对象或物理关系不适用。");
        }
        return { targetId, action };
      });
      return { nodeId, subjectInventory: inventory, mustPreserve, allowedTransformations, prohibitedChanges };
    }

    function normalizePhotoReferences(items) {
      const refs = list(items, visionLimit, "引用").map(item => {
        if (item?.type !== "image") throw new Error("摄影模型只接受图片；请移除音频或视频引用。");
        if (!idPattern.test(item.nodeId) || !/^(?:\/[^/]|https?:\/\/)/i.test(item.url) || item.url.length > 2048
          || !/^[a-f0-9]{64}$/.test(item.sha256) || !["product", "style"].includes(item.role)) {
          throw new Error("摄影引用缺少有效原图、角色或文件指纹，请重新选择素材。");
        }
        return {
          nodeId: item.nodeId, url: item.url, type: item.type, role: item.role, sha256: item.sha256,
          name: String(item.name || "").slice(0, 160),
          assetId: String(item.assetId || "").slice(0, 160),
          resultId: String(item.resultId || "").slice(0, 160),
          ...(item.role === "style" && item.libraryAssetId ? {
            libraryAssetId: inventoryId(item.libraryAssetId),
            ...(item.refId ? { refId: inventoryId(item.refId) } : {}),
          } : {}),
        };
      });
      if (new Set(refs.map(ref => ref.nodeId)).size !== refs.length || new Set(refs.map(ref => ref.url)).size !== refs.length) {
        throw new Error("摄影引用包含重复素材，请调整后重新提交。");
      }
      if (!refs.some(ref => ref.role === "product")) throw new Error("请至少选择一张产品参考图。");
      return refs;
    }

    const photoOutputRules = [
      "只交付一张真实商业产品照片。留白属于摄影构图。可辨的原有 Logo 和标识只保留在实物原位置。保持产品组成、开合状态和实际连接。",
      "No typography, no text overlay, no infographic, no feature icons, no promotional copy, no fabricated branding, no product specification labels.",
    ].join("\n");

    function assertPhotoOnly(value, { field, distribution = false } = {}) {
      const clauses = String(value || "").replace(photoOutputRules, "").split(/[，,。！？!?；;\n]/u);
      if (clauses.some(clause => {
        const content = distribution && /(?:用于|作为|用作|适合|供|面向|投放|传播|场景|底图|后期|后续)/u.test(clause)
          && !/(?:做成|制作|设计|生成|排成|输出|完成).{0,5}(?:产品海报|促销海报|电商详情页)/u.test(clause)
          ? clause.replace(/产品海报|促销海报|电商详情页/g, "") : clause;
        return !/不要|禁止|不得|不添加|不出现|不生成|不烧录|无新增|不含|留给后期|\bno\b|\bwithout\b/iu.test(content)
          && /产品海报|促销海报|海报(?:版式|排版)|电商详情页|信息图|标题(?:安全区|排版空间)|预留(?:标题|文案|标语)|(?:添加|加入|展示|排布|绘制|叠加|印上).{0,12}(?:标题|宣传语|卖点|图标|品牌字样)|\b(?:poster layout|promotional copy|feature icons|text overlay)\b/iu.test(content);
      })) {
        const detail = "纯摄影方案包含海报版式或画面叠字。请仅描述摄影构图、光线和实物标识。";
        throw field ? briefFieldError(field, detail) : new Error(detail);
      }
    }

    function readBrief(value, sourceIds, previousImages, liveReferences, { modelSubmission = false, requireCreativeDirections = false, requireCreativeComparison = false, artDirection = false, referenceIds, photoOnly = false } = {}) {
      let parsed;
      try {
        if (modelSubmission && typeof value !== "string") throw new Error();
        const raw = String(value || "").trim();
        const wrapped = !modelSubmission && raw.match(/^```(?:json)?[ \t]*\r?\n([\s\S]+)\r?\n```$/iu);
        parsed = JSON.parse(wrapped ? wrapped[1] : raw);
        if (!modelSubmission && typeof parsed === "string") parsed = JSON.parse(parsed);
        if (modelSubmission && (!parsed || typeof parsed !== "object" || Array.isArray(parsed))) throw new Error();
      } catch {
        throw briefFieldError("known_context", '必须是完整的 JSON 对象文本。使用一次序列化，去掉 Markdown 围栏和解释，保留 version、analysis 与完整 images。', "photo_brief_json");
      }
      if (modelSubmission) {
        requireFields(parsed, ["version", "analysis", "images"], "known_context");
        if (parsed.version !== 2) throw briefFieldError("known_context.version", "必须为 2。");
        if (typeof parsed.analysis !== "string" || !parsed.analysis.trim() || parsed.analysis.trim().length > 4000) {
          throw briefFieldError("known_context.analysis", "必须为 1–4000 字符的分析文本。");
        }
        if (!Array.isArray(parsed.images)) throw briefFieldError("known_context.images", "必须为产品原图清单数组。");
        parsed.images.forEach((item, index) => requireFields(item, ["nodeId"], `known_context.images[${index}]`));
      }
      if (![1, 2].includes(parsed?.version) || !sourceIds.length || sourceIds.length > visionLimit) {
        throw new Error("产品保真清单版本或素材数量不正确。");
      }
      const references = liveReferences || parsed.references;
      const bound = references ? normalizePhotoReferences(references) : null;
      if (bound && JSON.stringify(bound.map(item => item.nodeId)) !== JSON.stringify(sourceIds)) {
        throw new Error("摄影引用及顺序与原图快照不一致，请重新选择。");
      }
      const productIds = bound ? bound.filter(item => item.role === "product").map(item => item.nodeId) : sourceIds;
      const items = list(previousImages || parsed.images, visionLimit, "图片");
      const version = previousImages?.length ? (previousImages[0].subjectInventory ? 2 : 1) : parsed.version;
      if (items.length !== productIds.length || new Set(items.map(item => item?.nodeId)).size !== productIds.length) {
        throw new Error("产品保真清单必须逐张对应已分析的产品素材。");
      }
      const images = productIds.map(nodeId => {
        const item = items.find(image => image?.nodeId === nodeId);
        if (!item) throw new Error(`产品保真清单缺少素材 ${nodeId}。`);
        if (version === 2) {
          const path = modelSubmission ? `known_context.images[${items.indexOf(item)}]` : undefined;
          try { return readInventoryImage(item, nodeId, path); }
          catch (error) { throw !path || error.field ? error : briefFieldError(path, error.message); }
        }
        const objects = list(item.objects, 12, "对象").map(object => {
          if (!Number.isInteger(object?.count) || object.count < 1 || object.count > 9999) {
            throw new Error("产品保真清单的对象数量必须是正整数。");
          }
          return {
            name: text(object.name, 90),
            count: object.count,
            appearance: text(object.appearance),
            material: text(object.material, 150),
            structure: text(object.structure),
          };
        });
        const relationships = list(item.relationships, 12, "关系").map(value => text(value));
        const prohibitedChanges = list(item.prohibitedChanges, 12, "禁止项").map(value => text(value));
        const unresolved = list(item.unresolved, 5, "待确认项").map(value => {
          if (typeof value?.required !== "boolean") throw new Error("待确认项必须标明是否影响保真。");
          return { detail: text(value.detail, 160), required: value.required };
        });
        if (!objects.length || !prohibitedChanges.length || objects.length > 1 && !relationships.length) {
          throw new Error(`素材 ${nodeId} 的保真清单须写明对象、禁止项和多个对象间的组合关系。`);
        }
        return { nodeId, objects, relationships, prohibitedChanges, unresolved };
      });
      const brief = { version, analysis: text(parsed.analysis, 4000), images, ...(bound ? { references: bound } : {}),
        ...(Array.isArray(parsed.textReferences) ? { textReferences: readTextCases(parsed.textReferences.map(ref => ref?.caseId).join(" ")) } : {}),
        ...(parsed.presentation ? { presentation: readPresentation(parsed.presentation, images) } : {}),
      };
      photoOnly ||= !modelSubmission && parsed.photoOnly === true;
      if (photoOnly) {
        const features = parsed.visualFeatures;
        if (!Array.isArray(features) || features.length < 3 || features.length > 5) {
          throw briefFieldError("known_context.visualFeatures", "请提供 3–5 个有原图依据的产品视觉特征。");
        }
        brief.photoOnly = true;
        brief.visualFeatures = features.map((feature, index) => {
          const field = `known_context.visualFeatures[${index}]`;
          const inventory = images.find(image => image.nodeId === feature?.nodeId)?.subjectInventory;
          if (!inventory || !["targetObjects", "components", "accessories", "packaging"].some(
            key => inventory[key].some(item => item.id === feature.targetId))) {
            throw briefFieldError(field, "视觉特征须引用产品原图中已识别的对象，风格图不能作为产品证据。");
          }
          const { nodeId, targetId } = feature;
          for (const key of ["observation", "importance"]) {
            if (typeof feature[key] !== "string" || !feature[key].trim() || feature[key].length > 120 || /[\r\n【】]/u.test(feature[key])) {
              throw briefFieldError(`${field}.${key}`, "须填写简洁的可见证据及其拍摄价值。");
            }
            assertPhotoOnly(feature[key], { field: field + "." + key });
          }
          return { nodeId, targetId, observation: feature.observation.trim(), importance: feature.importance.trim() };
        });
        if (new Set(brief.visualFeatures.map(feature => feature.observation.replace(/[\p{P}\s]/gu, ""))).size !== features.length) {
          throw briefFieldError("known_context.visualFeatures", "请分别描述不同的产品细节。");
        }
      }
      if (parsed.creativeDirections || requireCreativeDirections || requireCreativeComparison || photoOnly) {
        brief.creativeDirections = readCreativeDirections(parsed.creativeDirections, brief, requireCreativeComparison,
          modelSubmission ? artDirection : parsed.creativeDirections?.artDirection === true, referenceIds);
        brief.presentation = selectCreativeDirection(brief, brief.creativeDirections.selectedId).presentation;
      }
      if (JSON.stringify(brief).length > MAX_WORKFLOW_TEXT_LENGTH) {
        throw new Error("产品保真清单和分析超过保存容量，请精简分析及措辞后重新提交，保留全部对象与关系。");
      }
      return brief;
    }

    function readCreativeDirections(value, brief, requireComparison, artDirection, referenceIds) {
      const field = "known_context.creativeDirections";
      const plans = value?.options;
      if (!Array.isArray(plans) || plans.length < (brief.photoOnly ? 3 : requireComparison ? 2 : 1) || plans.length > (brief.photoOnly ? 5 : 3)) {
        throw briefFieldError(field, brief.photoOnly ? "请提供 3–5 个可独立执行的摄影方向。" : "自主策划须提供 2–3 个方向；用户指定方向时可提交一案。");
      }
      const line = (input, key, max = 240) => {
        if (typeof input !== "string" || !input.trim() || input.trim().length > max || /[\r\n【】]/u.test(input)) {
          throw briefFieldError(key, `须填写一行具体说明（最多 ${max} 字）。`);
        }
        return input.trim();
      };
      const fields = ["name", "concept", "scene", "placement", "composition", "camera", "light", "color", "method", "use"];
      const options = plans.map((plan, index) => {
        const path = `${field}.options[${index}]`;
        if (!/^[a-z][a-z0-9-]{0,23}$/u.test(plan?.id || "")) throw briefFieldError(`${path}.id`, "请使用短英文编号。");
        const option = { id: plan.id };
        for (const key of fields) option[key] = line(plan[key], `${path}.${key}`, key === "name" ? 32 : 240);
        if (brief.photoOnly) {
          option.reason = line(plan.reason, `${path}.reason`, 120);
          if (!Array.isArray(plan.featureIndices) || !plan.featureIndices.length || plan.featureIndices.length > 3
            || new Set(plan.featureIndices).size !== plan.featureIndices.length
            || plan.featureIndices.some(number => !Number.isInteger(number) || number < 1 || number > brief.visualFeatures.length)) {
            throw briefFieldError(`${path}.featureIndices`, "请关联 1–3 项实际用于本方向的产品视觉特征。");
          }
          option.featureIndices = [...plan.featureIndices];
          for (const key of [...fields, "reason"]) {
            assertPhotoOnly(option[key], { field: path + "." + key, distribution: key === "use" });
          }
        }
        if (!artDirection) option.risk = line(plan.risk, `${path}.risk`);
        if (artDirection) {
          const picks = plan.references;
          if (!Array.isArray(picks) || !picks.length || picks.length > 2 || new Set(picks.map(pick => pick?.id)).size !== picks.length) {
            throw briefFieldError(`${path}.references`, "每案选 1–2 条不同的摄影参考方法并说明迁移方式。");
          }
          option.references = picks.map(pick => {
            if (!/^REF-\d{3,}$/u.test(pick?.id || "") || (referenceIds && !referenceIds.includes(pick.id))) {
              throw briefFieldError(`${path}.references`, `未在本次读取的摄影索引中找到 ${pick?.id || "该参考"}。`);
            }
            return { id: pick.id, borrow: line(pick.borrow, `${path}.references.borrow`, 120) };
          });
        }
        if (plan.support) option.support = readPresentation({ ...plan.support, placement: option.placement, compositionChange: option.composition }, brief.images);
        return option;
      });
      const ids = new Set(options.map(item => item.id));
      const selectedId = value.selectedId ?? value.recommendedId;
      if (ids.size !== options.length || !ids.has(value.recommendedId) || !ids.has(selectedId)) {
        throw briefFieldError(field, "方向编号须唯一，推荐与当前选择必须指向实际方向。");
      }
      const comparable = value => value.replace(/[\p{P}\s]/gu, "");
      options.forEach((option, index) => {
        if (options.slice(0, index).some(other => ["scene", "composition", "light"]
          .filter(key => comparable(option[key]) !== comparable(other[key])).length < 2)) {
          throw briefFieldError(field, "方向须在场景、构图与布光中至少有两项实质区别。");
        }
      });
      const directions = { recommendedId: value.recommendedId, selectedId, reason: line(value.reason, `${field}.reason`), options,
        ...(artDirection ? { artDirection: true } : {}) };
      for (const option of options) selectCreativeDirection({ ...brief, creativeDirections: directions }, option.id);
      return directions;
    }

    function selectCreativeDirection(brief, id) {
      const plan = brief.creativeDirections?.options.find(option => option.id === id);
      if (!plan) throw briefFieldError("known_context.creativeDirections.selectedId", "所选摄影方向已失效。");
      const presentation = readPresentation({ support: "surface", ...plan.support,
        placement: plan.placement, compositionChange: plan.composition }, brief.images);
      const summary = `${plan.name} · ${plan.concept}。${plan.method}。适用：${plan.use}。`;
      const sentences = (...parts) => parts.map(part => `${part.replace(/[。；.!;]+$/u, "")}。`).join("");
      const creative = brief.photoOnly ? [
        "【艺术指导】", sentences(`${plan.name} · ${plan.concept}`),
        "【产品视觉特征】", sentences(...plan.featureIndices.map(index => brief.visualFeatures[index - 1].observation)),
        "【场景与构图】", sentences(plan.scene, plan.composition, plan.placement),
        "【光线、色彩与材质】", sentences(plan.light, plan.color),
        "【镜头与真实质感】", sentences(plan.camera, "保留符合表面材质的高光、折射与反射，以及真实接触阴影"),
        "【纯摄影交付】", photoOutputRules,
      ].join("\n") : brief.creativeDirections.artDirection ? ["【艺术指导】", sentences(`${plan.name} · ${plan.concept}`, `用于${plan.use}`),
        "【构图与空间】", sentences(plan.composition, plan.placement, plan.scene),
        "【光色与镜头】", sentences(plan.light, plan.color, plan.camera)].join("\n")
        : ["【创意设计】", `${plan.name} · ${plan.concept}。${plan.scene}。${plan.placement}。${plan.composition}。用于${plan.use}。`,
        "【摄影执行】", `${plan.camera}。${plan.light}。${plan.color}。`, "【产品保护】", `${plan.risk}。`].join("\n");
      preparePresentation({ ...brief, presentation }, creative, summary, { required: true, compact: true });
      const prepared = preparePrompt(brief.images, creative, brief.references, { compact: true });
      if (prepared.shortened) throw briefFieldError("known_context.creativeDirections", "所选方向的提示词超出容量，请精简场景与布光描述。");
      return { directions: { ...brief.creativeDirections, selectedId: id }, presentation, summary, creative };
    }

    function readPresentation(value, images) {
      const field = "known_context.presentation";
      requireFields(value, ["support", "placement", "compositionChange"], field);
      if (value.support !== "surface" && value.support !== "original") {
        throw briefFieldError(`${field}.support`, "承托只能来自连续场景表面或原图已有的展示辅助件。新增可见装置须另行征得用户确认。");
      }
      for (const key of ["placement", "compositionChange"]) {
        if (typeof value[key] !== "string" || !value[key].trim() || value[key].trim().length > 240
          || /[\r\n]/u.test(value[key])) {
          throw briefFieldError(`${field}.${key}`, "必须是一行具体描述（最多 240 字）。");
        }
      }
      const placement = value.placement.trim();
      const compositionChange = value.compositionChange.trim();
      if (value.support === "surface") return { support: value.support, placement, compositionChange };
      const item = images.find(image => image.nodeId === value.sourceNodeId)?.subjectInventory;
      const original = [...(item?.props || []), ...(item?.accessories || []), ...(item?.components || [])]
        .find(object => object.id === value.supportObjectId);
      if (!original) throw briefFieldError(`${field}.supportObjectId`, "须绑定原图清单中已观察到的承托结构。");
      return { support: value.support, placement, compositionChange, sourceNodeId: value.sourceNodeId,
        supportObjectId: value.supportObjectId, supportName: original.name };
    }

    function preparePresentation(brief, creative, proposal, { required = false, compact = false } = {}) {
      const presentation = brief.presentation && readPresentation(brief.presentation, brief.images);
      if (required && !presentation) throw briefFieldError("known_context.presentation", "请填写承托来源、稳定摆放和构图变化。");
      const body = String(creative || "").trim().replace(/^【承托与构图】[^\n]*\n(?:禁止新增展示辅助件[^\n]*\n)?/u, "");
      const supportPattern = /(?:支座|支架|展示架|展示托|展示台座|独立底座|透明卡槽|固定夹具|固定装置|悬挂装置|鱼线吊挂|亚克力托|亚克力(?:板|块).{0,12}(?:托住|夹持|垫高|支撑)|(?:垫高|托住|夹持|垫在).{0,12}亚克力(?:板|块)|\bacrylic (?:stand|holder|riser)\b)/iu;
      const originalName = presentation?.supportName;
      for (const [field, value] of [["image_prompt", body], ["summary", proposal],
        ["known_context.presentation.placement", presentation?.placement]]) {
        const clauses = String(value || "").split(/[，。；！\n;,!]/u);
        if (clauses.some(clause => {
          const line = clause.trim().replace(/^[-\s]*(?:负面约束[：:]?\s*)?/u, "");
          const unbound = originalName ? line.split(originalName).join("") : line;
          return supportPattern.test(unbound) && !/^(?:不(?:得|要|使用|添|加|放|设|依赖|需要)|无|禁止|避免|拒绝|去除|移除)/u.test(line);
        })) {
          throw briefFieldError(field, "方案包含未经确认的展示辅助件。请选择可直接接触真实表面的姿态，额外装置需先单独征得同意。");
        }
      }
      if (!presentation) return creative;
      if (!body) throw briefFieldError("image_prompt", "缺少摄影执行说明。");
      if (compact) return body;
      const placementLine = `【承托与构图】${presentation.placement}。${presentation.compositionChange}。`;
      const policy = "禁止新增展示辅助件，包括支架、支座、独立底座、固定夹具及悬挂装置。";
      return `${placementLine}\n${policy}\n${body}`;
    }

    function describe(images, references) {
      if (images[0]?.subjectInventory) {
        return images.map((image, index) => describeInventoryImage(image,
          references ? references.findIndex(ref => ref.nodeId === image.nodeId) + 1 : index + 1)).join("\n\n");
      }
      return images.flatMap((image, index) => [
        references ? `第 ${references.findIndex(ref => ref.nodeId === image.nodeId) + 1} 张附件，以下对象和特征全部保留：`
          : `参考图 ${index + 1}（${image.nodeId}），以下对象和特征全部保留：`,
        ...image.objects.map(item => `- ${item.name} × ${item.count}。外观：${item.appearance}。材质：${item.material}。结构：${item.structure}。`),
        ...image.relationships.map(value => `- 组合关系：${value}`),
        ...image.prohibitedChanges.map(value => `- 原保真条款：${value}`),
        ...image.unresolved.map(item => `- ${item.required ? "待确认" : "保持未知，不得补造"}：${item.detail}`),
      ]).join("\n");
    }

    function describeInventoryImage(image, index) {
      const inventory = image.subjectInventory;
      const names = Object.keys(objectGroups).flatMap(group => inventory[group]).map(object => [object.id, object.name]);
      const lookup = new Map(names);
      const relationName = rule => `${lookup.get(rule.from)} ${relations[rule.kind]} ${lookup.get(rule.to)}`;
      const relationById = new Map(inventory.relationships.map(rule => [rule.id, rule]));
      const activeAspects = new Map();
      image.mustPreserve.forEach(({ targetId, aspect }) => {
        if (!activeAspects.has(targetId)) activeAspects.set(targetId, new Set());
        activeAspects.get(targetId).add(aspect);
      });
      return [
        `第 ${index} 张附件 · 产品依据`, "【必须保留】",
        ...Object.entries(objectGroups).filter(([group]) => group !== "props").flatMap(([group, label]) =>
          inventory[group].map(object => {
            const fields = activeAspects.get(object.id);
            const facts = ["appearance", "color", "material", "structure", "markings"]
              .filter(field => fields?.has(field) && object[field]).map(field => `${aspects[field]}：${object[field]}`);
            return `- 保留${label} ${object.name} × ${object.count}。${facts.join("；")}`;
          })),
        ...inventory.relationships.filter(rule => activeAspects.has(rule.id))
          .map(rule => `- 保持 ${relationName(rule)}，${rule.detail}。`),
        "【允许调整】", ...image.allowedTransformations.map(key => `- ${transforms[key]}。`),
        ...(inventory.props.length ? [`- 原场景道具：${inventory.props.map(item => item.name).join("、")}。`] : []),
        "【禁止改变】", ...image.prohibitedChanges.map(rule => {
          const subject = lookup.get(rule.targetId) || relationName(relationById.get(rule.targetId));
          return `- 不得${actions[rule.action]}（${subject}）。`;
        }),
        "【未知信息】", ...(inventory.unknowns.length
          ? inventory.unknowns.map(rule => `- ${lookup.get(rule.targetId)}：${rule.detail}（${rule.required ? "待确认" : "保持未知"}）。`)
          : ["- 新角度未见的结构保持未知。"]),
      ].join("\n");
    }

    function assertResolved(images) {
      const issues = images.flatMap(image => (image.subjectInventory?.unknowns || image.unresolved).filter(item => item.required));
      if (issues.length) throw new Error(`请通过修改方案明确以下产品信息后再确认：${issues.map(item => item.detail).join("、")}。`);
    }

    function productNames(images) {
      return [...new Set(images.flatMap(image => {
        const inventory = image.subjectInventory;
        return (inventory ? [...inventory.targetObjects, ...inventory.components, ...inventory.accessories, ...inventory.packaging]
          : image.objects || []).map(item => `${item.name} × ${item.count}`);
      }))].join("、");
    }

    function recoveredBriefIds(items) {
      const failures = new Map();
      const recovered = new Set();
      for (const item of items) {
        if (item.role !== "tool" || item.toolName !== "request_design_brief") continue;
        const runId = item.id.match(/^tool_(canvas_agent_\d+_[a-z0-9]+)_/u)?.[1];
        if (!runId) continue;
        if (item.status === "failed" && /^known_context(?:[.： ]|$)/u.test(item.text)) {
          if (!failures.has(runId)) failures.set(runId, []);
          failures.get(runId).push(item.id);
        } else if (item.status === "completed") {
          for (const id of failures.get(runId) || []) recovered.add(id);
          failures.delete(runId);
        }
      }
      return recovered;
    }

    function preparePrompt(images, creative, references, { preview = false, compact = false } = {}) {
      const raw = String(creative || "").trim();
      const clean = compact ? raw.replace(/\n禁止新增展示辅助件，包括支架、支座、独立底座、固定夹具及悬挂装置。\n/u, "\n") : raw;
      const creativeSections = compact && clean.startsWith("【创意设计】\n");
      const artDirection = compact && clean.startsWith("【艺术指导】\n");
      if (artDirection && !references?.some(ref => ref.role === "product")) throw new Error("请为摄影方案添加真实原图。");
      if (references && /@(?:图片?|音频|视频)\d+/u.test(clean)) {
        throw new Error("摄影执行段含独立 @ 文本。请使用确认卡绑定的素材引用，执行段只写摄影安排。");
      }
      const purePhoto = artDirection && clean.endsWith(photoOutputRules);
      if (purePhoto) assertPhotoOnly(clean);
      const prefix = (artDirection && !purePhoto ? ["【产品依据】", ...references.map((ref, index) => `@图${index + 1} ${ref.role === "style"
        ? "摄影语言参考。" : "以此图中的商品为主体。"}`), ""] : compact ? [
        "【产品依据】",
        ...(references || []).map((ref, index) => `@图${index + 1} ${ref.role === "style" ? "仅参考布光、色彩与构图。" : "产品原图。"}`),
        `保留原图商品的外形、颜色、材质观感、数量、关键结构、可见标识及原有连接。${productNames(images)}。在原图支持的可见角度内调整整体摆放。商品和展示辅助件均不得擅自增删。`,
        ...new Set(images.flatMap(image => {
          const inventory = image.subjectInventory;
          if (!inventory) return [];
          return [
            ...(creativeSections || purePhoto ? [...inventory.targetObjects, ...inventory.components, ...inventory.accessories, ...inventory.packaging]
              .map(item => `${item.name}：${[...new Set([item.appearance, item.color, item.material, item.structure].filter(Boolean))].join("，")}。`) : []),
            ...inventory.relationships.filter(rule => rule.kind !== "displayed-with")
              .map(rule => `${rule.detail.replace(/[。；]+$/u, "")}。`),
            ...[...inventory.targetObjects, ...inventory.components, ...inventory.packaging]
              .filter(item => item.markings).map(item => `${item.name}的可辨标识：${item.markings.replace(/[。；]+$/u, "")}。`),
          ];
        })),
        ...(creativeSections || purePhoto ? [""] : ["", "【摄影执行】"]),
      ] : [
        "【产品保真｜硬约束】以对应原图为产品依据。必须保留下列对象、数量、可见标识及物理关系。不得增删、替换或拆开。不同参考图中同一件商品不重复计数。摄影描述只能调整画面，冲突时以此清单为准。",
        ...(references ? references.map((ref, index) => `@图${index + 1} ${ref.role === "style"
          ? "仅参考摄影光线、布局和空间，禁止迁移其中商品的外观、配件或标识。"
          : "用于产品结构与外观保真。产品组合允许整体移动、缩放、旋转和重新取景，部件间关系保持原样。"}`) : []),
        describe(images, references), "", "【摄影执行】",
      ]).join("\n");
      const size = MAX_WORKFLOW_TEXT_LENGTH - prefix.length - 96;
      if (size < 100) throw new Error("产品保真约束超过当前提示词容量，无法完整提交。请精简措辞或分批处理。");
      if (!clean) throw new Error("请补充摄影场景与执行提示词。");
      if ((creativeSections || artDirection) && clean.length > size) throw new Error("摄影方案超出提示词容量，请精简场景和布光后重新确认。");
      const shortened = clean.length > size
        ? clean.slice(0, size).replace(/[\uD800-\uDBFF]$/u, "").trimEnd()
        : clean;
      const visiblePrefix = preview ? prefix.replace(/^@图(\d+) /gmu, "第 $1 张素材：") : prefix;
      return { creative: shortened, prompt: `${visiblePrefix}\n${shortened}`, shortened: clean !== shortened };
    }

    function composePrompt(images, creative, references) {
      return preparePrompt(images, creative, references).prompt;
    }

    function verifyAnalysisSources(items, pendingLabel = "产品素材") {
      if (!items.length || items.some(item => !item)) {
        throw new Error(`${pendingLabel}必须可以打开原始图片，每个已选节点只保留一张可独立确认的图片；请拆分多图节点或重新选图。`);
      }
      if (items.length > visionLimit) {
        const excluded = items.slice(visionLimit).map(item => item.name || item.nodeId);
        throw new Error(`当前策划最多可分析 ${visionLimit} 张图片；本次尚未发送。超出容量的素材：${excluded.join("、")}。请选择最多 ${visionLimit} 张素材或分批策划。`);
      }
      return items;
    }

    function nodeLock(images, items, creative, { compact = false } = {}) {
      assertResolved(images);
      if (items.some(item => item?.sha256)) {
        const references = normalizePhotoReferences(items);
        const products = references.filter(ref => ref.role === "product");
        if (images.length !== products.length || images.some((image, index) => image.nodeId !== products[index].nodeId)) {
          throw new Error("产品保真清单与当前 @ 素材不一致，请重新确认。");
        }
        const prepared = preparePrompt(images, creative, references, { compact });
        const { prompt } = prepared;
        return { version: images[0]?.subjectInventory ? 2 : 1, sources: references, images, prompt,
          ...(compact ? { compact: true } : {}),
          ...(prepared.creative.endsWith(photoOutputRules) ? { photoOnly: true } : {}),
          ...(images[0]?.subjectInventory ? { creative: prepared.creative } : {}),
          mentions: photoPromptMentions(prompt, references) };
      }
      const sources = verifyAnalysisSources(items).map(({nodeId, url}) => {
        if (!idPattern.test(nodeId) || !/^(?:\/[^/]|https?:\/\/)/i.test(url) || url.length > 2048) {
          throw new Error("产品素材缺少可持久化的图片地址，请重新选择并确认。");
        }
        return { nodeId, url };
      });
      if (images.length !== sources.length || images.some((image, index) => image.nodeId !== sources[index].nodeId)) {
        throw new Error("产品保真清单与素材不一致，请重新确认。");
      }
      return { version: 1, sources, images, prompt: composePrompt(images, creative) };
    }

    function photoPromptMentions(prompt, references) {
      return [...prompt.matchAll(/@图([1-9]\d*)/gu)].map(match => {
        const ref = references[Number(match[1]) - 1];
        if (!ref) throw new Error("摄影提示词的 @ 引用超出已确认素材，请重新确认。");
        const { nodeId, ...properties } = ref;
        return { ...properties, sourceNodeId: nodeId, sourcePort: "output", label: match[0], offset: match.index };
      });
    }

    function readNodeLock(value) {
      let lock;
      try { lock = JSON.parse(value); } catch { throw new Error("摄影节点的产品保真快照无法读取，请重新确认。"); }
      const sources = lock?.sources;
      const products = lock?.mentions && Array.isArray(sources) ? sources.filter(ref => ref.role === "product") : sources;
      if (![1, 2].includes(lock?.version) || !Array.isArray(sources) || !sources.length || sources.length > visionLimit
        || sources.some(item => !idPattern.test(item?.nodeId) || typeof item?.url !== "string" || !item.url)
        || new Set(sources.map(item => item.nodeId)).size !== sources.length
        || !Array.isArray(lock.images) || lock.images.length !== products.length
        || lock.images.some((image, index) => image.nodeId !== products[index].nodeId)
        || typeof lock.prompt !== "string" || !lock.prompt.startsWith(lock.compact ? "【产品依据】" : "【产品保真｜硬约束】")
        || lock.prompt.length > MAX_WORKFLOW_TEXT_LENGTH) {
        throw new Error("摄影节点的产品保真快照不完整，请重新确认。");
      }
      if (lock.mentions && JSON.stringify(lock.mentions) !== JSON.stringify(photoPromptMentions(lock.prompt, normalizePhotoReferences(sources)))) {
        throw new Error("摄影节点的 @ 引用快照不完整，请重新确认。");
      }
      if (lock.version === 2) {
        const images = lock.images.map(item => readInventoryImage(item, item.nodeId));
        assertResolved(images);
        if (!lock.mentions || JSON.stringify(images) !== JSON.stringify(lock.images)
          || preparePrompt(images, lock.creative, normalizePhotoReferences(sources), { compact: lock.compact === true }).prompt !== lock.prompt) {
          throw new Error("摄影节点的结构化清单与提示词不一致，请重新确认。");
        }
      }
      if (lock.photoOnly && !lock.prompt.endsWith(photoOutputRules)) {
        throw new Error("摄影节点缺少已确认的纯摄影交付要求，请重新确认。");
      }
      if (lock.revisedPrompt !== undefined) {
        const revised = lock.revisedPrompt;
        const labels = text => [...text.matchAll(/@图[1-9]\d*/gu)].map(match => match[0]).sort().join(",");
        if (typeof revised !== "string" || !revised.trim() || revised.length > MAX_WORKFLOW_TEXT_LENGTH
          || labels(revised) !== labels(lock.prompt) || lock.photoOnly && !revised.endsWith(photoOutputRules)) {
          throw new Error("摄影节点的修订提示词或原图引用不完整。");
        }
        return { ...lock, prompt: revised, ...(lock.mentions ? {
          mentions: photoPromptMentions(revised, normalizePhotoReferences(sources)),
        } : {}) };
      }
      return lock;
    }

    function reviseNodeLock(value, revisedPrompt) {
      const revised = JSON.stringify({ ...JSON.parse(value), revisedPrompt });
      readNodeLock(revised);
      return revised;
    }

    function verifyRequest(lock, prompt, refs) {
      assertPhotoOnly(prompt);
      if (refs.length > editLimit) {
        throw new Error(`当前编辑接口最多发送 ${editLimit} 张图片。超出容量的素材：${refs.slice(editLimit).map(ref => ref.name || ref.sourceNodeId || ref.url).join("、")}。请返回方案选图或分批处理。`);
      }
      const ordered = lock.sources.map(source => refs.find(ref => ref.sourceNodeId === source.nodeId && ref.url === source.url
        && (ref.sourcePort || "output") === "output" && !ref.maskUrl && !ref.openaiMaskUrl && !ref.maskBaseUrl));
      if (prompt !== lock.prompt || refs.length !== ordered.length || ordered.some((ref, index) => !ref || lock.mentions && ref !== refs[index])) {
        throw new Error("摄影提示词或原始产品参考已变化。请返回摄影方案重新确认后再生成。");
      }
      return ordered;
    }

    return Object.freeze({ readBrief, readTextCases, describe, productNames, recoveredBriefIds, assertResolved, assertPhotoOnly, preparePrompt, preparePresentation, composePrompt, selectCreativeDirection, verifyAnalysisSources,
      normalizePhotoReferences, nodeLock, readNodeLock, reviseNodeLock, verifyRequest });
  })();

  return {
    MAX_ITEMS,
    MAX_TRANSCRIPT_ITEMS,
    create,
    normalize,
    normalizeCreativeProductPhotoBatch,
    CREATIVE_PRODUCT_BATCH_WORKFLOW,
    CREATIVE_PRODUCT_BATCH_SKILL,
    naturalPhotoFidelity,
    defaultGenerationSettings,
    normalizeGenerationSettings,
    appendItems,
    appendSkillEvent,
    markInterrupted,
    buildTranscript,
    parseInteraction,
    parseInteractionIntakeResponse,
    createInteractionIntakePlan,
    createInteractionCollection,
    matchesInteractionCondition,
    getInteractionSteps,
    getInteractionImageIds,
    getInteractionImageSlots,
    parseInteractionReview,
    hasCompleteH3Prompts,
    hasCompleteH3Package,
    updateInteractionImages,
    getInteractionFields,
    validateInteractionStep,
    getInteractionValueLabel,
    buildWorkflowNodeArguments,
    buildConfirmedWizardWorkflow,
    prefillInteraction,
  };
});
