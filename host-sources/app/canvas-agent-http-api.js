"use strict";

const crypto = require("node:crypto");
const CanvasAgentCore = require("./canvas-agent-core.js");
const H3_COMMERCE_CONTINUATION_TIMEOUT_MS = 300_000;

function requestPathname(req) {
  try {
    return new URL(req?.url || "/", `http://${req?.headers?.host || "localhost"}`).pathname;
  } catch {
    return "/";
  }
}

function attemptError(message, details = {}) {
  const error = new Error(String(message || "Canvas Agent upstream failed."));
  Object.assign(error, details);
  return error;
}

const { isSkillInvocationProhibited, isReadOnlyImageQuestion } = CanvasAgentCore;

function verifyPreparedVision(prepared, payload) {
  const attachments = payload.canvas?.agent_image_attachments;
  if (!Array.isArray(attachments)) return null;
  const input = payload.vision_images;
  const forwarded = prepared.messages
    .filter(message => message.role === "user" && Array.isArray(message.content))
    .flatMap(message => message.content.filter(part => part.type === "image_url").map(part => part.image_url?.url));
  const fail = message => attemptError(message, { category: "input", code: "vision_input_unavailable", statusCode: 400 });
  if (!attachments.length || !Array.isArray(input) || attachments.length !== input.length
    || forwarded.length !== input.length || forwarded.some((url, index) => url !== input[index])) {
    throw fail("图片附件数量或顺序与模型输入不一致。请检查选择的素材后重试。");
  }
  for (const [index, attachment] of attachments.entries()) {
    const encoded = /^data:image\/jpeg;base64,([a-z0-9+/]+={0,2})$/i.exec(input[index]);
    const header = encoded ? Buffer.from(encoded[1].slice(0, 16), "base64") : null;
    if (!attachment?.node_id || attachment.mime_type !== "image/jpeg"
      || !header || header.length < 3 || !header.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
      throw fail(`第 ${index + 1} 张图片“${String(attachment?.name || "素材").slice(0, 80)}”无法作为 JPEG 视觉输入。请替换这张图片。`);
    }
  }
  return { count: forwarded.length, mime_type: "image/jpeg" };
}

function isReasoningReplayError(error) {
  return /reasoning_content|thinking mode/i.test(String(error?.message || error?.safeMessage || error || ""));
}

function normalizeConversationContext(value) {
  return (Array.isArray(value) ? value : []).slice(-24).flatMap((item) => {
    const role = String(item?.role || "").toLowerCase();
    const content = String(item?.content || item?.text || "").trim().slice(0, 12000);
    if ((role === "user" || role === "assistant") && content) return [{ role, content }];
    if (role === "tool") {
      const label = String(item?.tool_name || item?.name || "画布操作").trim().slice(0, 80);
      const nodeId = String(item?.node_id || "").trim().slice(0, 120);
      const summary = content || `${label}已完成`;
      return [{ role: "assistant", content: `[已完成 ${label}${nodeId ? ` · 节点 ${nodeId}` : ""}] ${summary}` }];
    }
    return [];
  });
}

function createCanvasAgentHttpApi({
  CanvasAgentConversation,
  conversationStore,
  normalizeBoardId,
  CanvasAgentRuntime,
  skillRegistry,
  agentModelSettings,
  canvasAgentProviderBridge,
  saveH3CommercePackage,
  ensureReferencedResource,
  resourceAccess,
  readJson,
  sendJson,
  maxSessions,
  sessionTtlMs,
  connectTimeoutMs,
  firstEventTimeoutMs,
  totalTimeoutMs,
  reasoningEffort,
} = {}) {
  if (!CanvasAgentConversation || typeof CanvasAgentConversation.normalize !== "function") {
    throw new TypeError("Canvas Agent HTTP API requires the conversation model.");
  }
  if (!conversationStore || typeof conversationStore.get !== "function") {
    throw new TypeError("Canvas Agent HTTP API requires a conversation store.");
  }
  if (typeof normalizeBoardId !== "function") throw new TypeError("Canvas Agent HTTP API requires board id normalization.");
  if (!CanvasAgentRuntime || typeof CanvasAgentRuntime.buildProviderTurnRequest !== "function") {
    throw new TypeError("Canvas Agent HTTP API requires the Canvas Agent runtime.");
  }
  if (!skillRegistry || typeof skillRegistry.loadAgentCatalog !== "function") {
    throw new TypeError("Canvas Agent HTTP API requires the skill registry.");
  }
  if (!agentModelSettings || typeof agentModelSettings.getRoute !== "function") {
    throw new TypeError("Canvas Agent HTTP API requires Agent model settings.");
  }
  if (!canvasAgentProviderBridge || typeof canvasAgentProviderBridge.runTurn !== "function") {
    throw new TypeError("Canvas Agent HTTP API requires a provider bridge.");
  }
  if (typeof ensureReferencedResource !== "function") throw new TypeError("Canvas Agent HTTP API requires resource helpers.");
  if (!resourceAccess || typeof resourceAccess.assertRead !== "function" || typeof resourceAccess.assertWrite !== "function") {
    throw new TypeError("Canvas Agent HTTP API requires resource access.");
  }
  if (typeof readJson !== "function" || typeof sendJson !== "function") {
    throw new TypeError("Canvas Agent HTTP API requires HTTP helpers.");
  }
  const safeMaxSessions = Number(maxSessions);
  const safeSessionTtlMs = Number(sessionTtlMs);
  if (!Number.isSafeInteger(safeMaxSessions) || safeMaxSessions <= 0) throw new TypeError("maxSessions must be positive.");
  if (!Number.isSafeInteger(safeSessionTtlMs) || safeSessionTtlMs <= 0) throw new TypeError("sessionTtlMs must be positive.");

  const sessions = new Map();

  function pruneSessions(now = Date.now()) {
    for (const [runId, session] of sessions) {
      if (now - Number(session.updatedAt || session.createdAt || 0) <= safeSessionTtlMs) continue;
      sessions.delete(runId);
    }
    if (sessions.size <= safeMaxSessions) return;
    [...sessions.entries()]
      .sort((left, right) => Number(left[1].updatedAt || 0) - Number(right[1].updatedAt || 0))
      .slice(0, sessions.size - safeMaxSessions)
      .forEach(([runId]) => sessions.delete(runId));
  }

  function getOrCreateSession(payload = {}, skills = {}, userId = "") {
    pruneSessions();
    const suppliedRunId = String(payload.run_id || "").trim();
    const runId = /^[a-zA-Z0-9_-]{1,120}$/.test(suppliedRunId)
      ? suppliedRunId
      : `agent_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const requestedBoardId = String(payload.board_id || payload.canvas?.id || "").trim();
    if (!requestedBoardId) throw attemptError("当前画布不可用，无法启动 Skill 任务。", { category: "task", code: "board_required" });
    let session = sessions.get(runId);
    if (session?.ownerUserId && session.ownerUserId !== userId) {
      throw attemptError("该任务属于其他账户。", { code: "forbidden", statusCode: 403 });
    }
    const intentPrompt = session?.initialPayload?.user_intent_prompt
      ?? String(payload.user_intent_prompt ?? payload.recovery_original_prompt ?? payload.prompt ?? "");
    const route = CanvasAgentCore.classifyAgentRequest(intentPrompt);
    const skillOptOut = isSkillInvocationProhibited(intentPrompt);
    const skillWorkflow = session?.initialPayload?.skill_workflow ?? payload.skill_workflow === true;
    const conversationId = String(payload.conversation_id || session?.conversationId || "");
    const requestedTaskId = String(payload.task_id || session?.taskId || runId).slice(0, 120);
    const savedConversation = conversationId && requestedBoardId
      ? conversationStore.get(requestedBoardId, userId, conversationId) : null;
    if (conversationId && !savedConversation) {
      throw attemptError("当前 Skill 会话不存在或不可访问，请刷新会话后重试。", {
        category: "task", code: "conversation_not_found", statusCode: 404,
      });
    }
    const routeIsSkillRelated = !skillOptOut && (route.professional || skillWorkflow && !route.hold
      || /(?:skill\b|技能|专业流程)/iu.test(intentPrompt)
      || Boolean(savedConversation?.activeSkillId && !route.hold && (route.execution || skillWorkflow || !intentPrompt)));
    const business = Array.isArray(skills?.business) ? skills.business : [];
    const continuingTask = session?.primarySkill?.id;
    const savedTask = !session && conversationId
      ? conversationStore.skillTask?.(requestedBoardId, userId, conversationId, requestedTaskId) : null;
    if (savedTask?.cancelled) throw attemptError("本任务已经取消，请开始新任务。", { code: "skill_task_cancelled", statusCode: 409 });
    const decision = continuingTask || savedTask?.primary?.id || routeIsSkillRelated ? CanvasAgentCore.resolveSkillInvocation(business, {
      selectedId: !session && (payload.skill_mode === "manual" || payload.skill_workflow)
        ? savedConversation?.activeSkillId || String(payload.skill_id || "") : "",
      lockedId: session?.primarySkill?.id || savedTask?.primary?.id || "",
      prompt: intentPrompt,
      canvas: payload.canvas,
    }) : { skill: null, reason: "general" };
    if (decision.unavailable) throw attemptError("已选 Skill 已停用或不可用，请重新选择后开始任务。", {
      category: "task", code: "skill_unavailable",
    });
    const requestedActiveSkillId = decision.skill?.id || "";
    const requestedRequestId = String(payload.request_id || runId).trim();
    if (!/^[a-zA-Z0-9_-]{1,160}$/u.test(requestedRequestId)) {
      throw attemptError("本轮消息请求标识无效，已停止执行。", {
        category: "task", code: "invalid_request_id", statusCode: 400,
      });
    }
    const requestedMessageId = String(payload.message_id || runId).trim();
    if (!/^[a-zA-Z0-9_-]{1,160}$/u.test(requestedMessageId)) {
      throw attemptError("本轮消息标识无效，已停止执行。", {
        category: "task", code: "invalid_message_id", statusCode: 400,
      });
    }
    const businessSkillIds = new Set((Array.isArray(skills?.business) ? skills.business : [])
      .map((skill) => String(skill?.id || ""))
      .filter(Boolean));
    if (requestedActiveSkillId && !businessSkillIds.has(requestedActiveSkillId)) throw attemptError("请求的专业流程当前不可用。", { category: "task" });
    const pinned = session?.primarySkill || savedTask?.primary;
    if (pinned?.fingerprint && decision.skill?.validationFingerprint !== pinned.fingerprint) {
      throw attemptError("锁定的 Skill 内容已更新，请重新选择后开始新任务。", { code: "skill_lock_invalidated", statusCode: 409 });
    }
    if (!sessions.has(runId)) {
      if (!requestedBoardId) throw attemptError("Canvas Agent requires a current board.", { category: "task" });
      const now = Date.now();
      session = {
        runId,
        boardId: requestedBoardId,
        conversationId,
        ownerUserId: userId,
        taskId: requestedTaskId,
        selectionReason: decision.reason,
        primarySkill: savedTask?.primary || (decision.skill ? {
          id: decision.skill.id,
          name: decision.skill.canvas?.label || decision.skill.name || decision.skill.id,
          source: decision.reason === "matched" ? "auto" : savedConversation?.activeSkillId === decision.skill.id ? "manual" : "named",
          origin: decision.skill.scope === "personal" ? "personal" : decision.skill.origin === "system" ? "system" : "shared",
          version: String(decision.skill.install?.version || decision.skill.metadata?.version || ""),
          fingerprint: /^[a-f0-9]{64}$/.test(decision.skill.validationFingerprint || "") ? decision.skill.validationFingerprint : "",
          validationStatus: decision.skill.validation_status || "unverified",
        } : null),
        activeSkillId: session?.primarySkill?.id || requestedActiveSkillId,
        autoSkillId: decision.reason === "matched" || savedTask?.primary?.source === "auto" ? requestedActiveSkillId : "",
        approvedSkills: new Map((savedTask?.approved || []).map(skill => [skill.id, skill])),
        declinedSkills: new Set(savedTask?.declined || []),
        requestedSkills: (decision.combination || []).filter(skill => skill.id !== requestedActiveSkillId).map(skill => skill.id),
        skillEvents: savedConversation?.skillEvents ? [...savedConversation.skillEvents] : [],
        pendingSkillApproval: savedTask?.pending || null,
        skillReferenceResume: savedTask?.referenceResume || null,
        skillReferenceEvent: savedTask?.referenceEvent || null,
        requestId: requestedRequestId,
        messageId: requestedMessageId,
        createdAt: now,
        updatedAt: now,
        pinnedCandidateId: "",
        pinnedProviderId: "",
        pinnedModelId: "",
        previousResponseId: "",
        initialPayload: null,
        transcript: [],
        completedToolOutputIds: new Set(),
        forceFlattenToolHistory: false,
      };
      sessions.set(runId, session);
    } else {
      if (session.conversationId !== conversationId || session.taskId !== requestedTaskId) {
        throw attemptError("任务会话已变化，无法继续执行。", { code: "skill_task_mismatch", statusCode: 409 });
      }
      if (requestedBoardId && session.boardId !== requestedBoardId) {
        throw attemptError("这个任务不属于当前画布，已阻止继续执行。", { category: "task" });
      }
      if (session.requestId && requestedRequestId !== session.requestId) {
        throw attemptError("消息请求标识与当前任务不匹配，已停止执行旧请求。", {
          category: "task", code: "request_id_mismatch", statusCode: 409,
        });
      }
      if (session.messageId && requestedMessageId !== session.messageId) {
        throw attemptError("当前任务收到其他消息的执行结果，已停止执行。", {
          category: "task", code: "message_id_mismatch", statusCode: 409,
        });
      }
      if (session.primarySkill?.id) {
        decision.skill = business.find(skill => skill.id === session.primarySkill.id) || null;
        if (!decision.skill) throw attemptError("任务锁定的 Skill 已停用或内容已更新，请结束旧任务后开始新任务。", { category: "task", code: "skill_lock_invalidated", statusCode: 409 });
        session.activeSkillId = session.primarySkill.id;
        session.autoSkillId = session.primarySkill.source === "auto" ? session.primarySkill.id : "";
      }
    }
    if (decision.skill) {
      session.skillEvents ||= [];
      session.primarySkill ||= {
        id: decision.skill.id, name: decision.skill.canvas?.label || decision.skill.id,
        source: decision.reason === "matched" ? "auto" : decision.reason,
        version: String(decision.skill.install?.version || decision.skill.metadata?.version || ""),
        fingerprint: decision.skill.validationFingerprint || "",
        validationStatus: decision.skill.validation_status || "unverified",
      };
      if (!session.skillEvents.some(event => event.eventId === `invoke:${session.taskId}`)) session.skillEvents.push({
        eventId: `invoke:${session.taskId}`, taskId: session.taskId, type: "invocation", skillId: decision.skill.id,
        source: session.primarySkill.source, name: session.primarySkill.name, reason: decision.reason, at: new Date().toISOString(),
      });
    } else session.skillEvents ||= [];
    session.requestId = requestedRequestId;
    session.messageId = requestedMessageId;
    if (!session.initialPayload && String(payload.prompt || "").trim()) {
      session.initialPayload = {
        skill_mode: decision.skill && decision.reason !== "matched" ? "manual" : "auto",
        skill_id: decision.skill?.id || "",
        active_skill_id: session.activeSkillId,
        board_id: session.boardId,
        prompt: String(payload.prompt || ""),
        user_intent_prompt: intentPrompt,
        skill_workflow: Boolean(decision.skill && !route.hold && (skillWorkflow || route.execution)),
        canvas: payload.canvas && typeof payload.canvas === "object" ? payload.canvas : {},
        vision_images: [],
        conversation_context: normalizeConversationContext(payload.conversation_context),
        step: 0,
      };
      if (session.primarySkill) session.initialPayload.skill_id = session.primarySkill.id;
      // 这一轮的需求如果能唯一匹配某个专业流程，就在整个任务里一直沿用它：续跑的每一轮
      // 都要带回同一个 Skill，否则模型会在第二轮回落到没有流程约束的自动路由。
      if (decision.skill && decision.reason === "matched") session.autoSkillId = decision.skill.id;
      const h3Commerce = (session.activeSkillId || session.autoSkillId) === "h3-commerce-video";
      session.initialPayload.vision_images = Array.isArray(payload.vision_images)
        ? payload.vision_images.slice(0, h3Commerce ? 4 : 3)
        : [];
    }
    session.updatedAt = Date.now();
    return session;
  }

  function disposeSession(session, options = {}) {
    if (!session) return;
    if (session.initialPayload) {
      session.initialPayload.vision_images = [];
      session.initialPayload.canvas = {};
    }
    if (options.retainCheckpoint) {
      session.updatedAt = Date.now();
      return;
    }
    session.transcript = [];
    session.completedToolOutputIds?.clear?.();
    sessions.delete(session.runId);
  }

  function appendSessionTurn(session, payload, turn, candidate) {
    (Array.isArray(payload.tool_outputs) ? payload.tool_outputs : []).forEach((item) => {
      const callId = String(item?.call_id || "").trim();
      if (!callId || session.completedToolOutputIds.has(callId)) return;
      session.completedToolOutputIds.add(callId);
      session.transcript.push({
        role: "tool",
        call_id: callId,
        content: typeof item.output === "string" ? item.output : JSON.stringify(item.output ?? null),
      });
    });
    session.transcript.push({
      role: "assistant",
      content: String(turn.message || ""),
      ...(turn.reasoning_content ? { reasoning_content: String(turn.reasoning_content) } : {}),
      tool_calls: (Array.isArray(turn.tool_calls) ? turn.tool_calls : []).map((call) => ({
        call_id: String(call.call_id || ""),
        name: String(call.name || ""),
        arguments: call.arguments && typeof call.arguments === "object" ? call.arguments : {},
      })),
    });
    session.transcript = session.transcript.slice(-36);
    session.pinnedCandidateId = String(candidate.id || "");
    session.pinnedProviderId = String(candidate.providerId || "");
    session.pinnedModelId = String(candidate.model || "");
    session.previousResponseId = String(turn.response_id || "");
    session.updatedAt = Date.now();
  }

  function prioritizeSessionCandidateOrder(candidateOrder, session) {
    const ordered = (Array.isArray(candidateOrder) ? candidateOrder : []).filter(Boolean);
    const providerId = String(session?.pinnedProviderId || "");
    const modelId = String(session?.pinnedModelId || "");
    if (!providerId || !modelId) return ordered;
    const pinnedIndex = ordered.findIndex((candidate) => (
      String(candidate?.providerId || "") === providerId
      && String(candidate?.modelId || "") === modelId
    ));
    if (pinnedIndex <= 0) return ordered;
    return [ordered[pinnedIndex], ...ordered.slice(0, pinnedIndex), ...ordered.slice(pinnedIndex + 1)];
  }

  function writeEvent(res, event) {
    if (res.writableEnded || res.destroyed) return;
    res.write(`${JSON.stringify(event)}\n`);
  }

function sanitizeTurn(turn = {}, autoSkill = null, requestId = "", messageId = "", session = null) {
    return {
      response_id: String(turn.response_id || ""),
    request_id: String(requestId || ""),
    message_id: String(messageId || ""),
      message: String(turn.message || ""),
      tool_calls: Array.isArray(turn.tool_calls) ? turn.tool_calls : [],
      usage: turn.usage || null,
      ...(autoSkill
        ? { auto_skill_id: String(autoSkill.id || ""), auto_skill_label: String(autoSkill.canvas?.label || "") }
        : {}),
      ...(session?.taskId ? { task_id: session.taskId } : {}),
      ...(session?.primarySkill ? { primary_skill: { ...session.primarySkill }, skill_lock_status: "locked" } : {}),
      ...(Array.isArray(session?.skillEvents) ? { skill_events: session.skillEvents.slice(-500) } : {}),
    };
  }

  /**
   * 自动预加载的专业流程，用于在响应里告诉界面这次用的是哪个系统 Skill。
   * 用户手动选择或模型自己激活的 Skill 优先级更高，那些情况下不再回报预加载结果。
   */
  function resolveSessionAutoSkill(session, skills) {
    const id = String(session?.autoSkillId || "");
    if (!id) return null;
    return (Array.isArray(skills?.business) ? skills.business : []).find((skill) => skill.id === id) || null;
  }

  function getSessionSkillFields(session) {
    const autoSkillId = String(session?.autoSkillId || "");
    return {
      active_skill_id: String(session?.activeSkillId || "") || autoSkillId,
      skill_auto: Boolean(autoSkillId),
    };
  }

  function requestSkillApproval(session, target, reason) {
    const pending = {
      id: target.id, name: target.canvas?.label || target.id, reason,
      version: String(target.install?.version || target.metadata?.version || ""),
      fingerprint: target.validationFingerprint || "", operationId: crypto.randomUUID(),
    };
    session.pendingSkillApproval = pending;
    session.skillReferenceResume = {
      operationId: pending.operationId, runId: session.runId, requestId: session.requestId,
      messageId: session.messageId, name: pending.name, decision: "", completed: false,
      sourceNodeIds: [...new Set((session.initialPayload?.canvas?.agent_materials || [])
        .map(item => String(item.node_id || "")).filter(Boolean))].slice(0, 24),
    };
    session.skillEvents.push({ eventId: `request:${pending.operationId}`, taskId: session.taskId,
      type: "cross_skill_request", skillId: session.primarySkill.id, relatedSkillId: target.id,
      source: "agent", reason, at: new Date().toISOString() });
    saveSkillTask(session);
    return { ...sanitizeTurn({}, null, session.requestId, session.messageId, session), skill_approval: pending,
      skill_reference_resume: session.skillReferenceResume };
  }

  function saveSkillTask(session, cancelled = false) {
    if (!session.conversationId || !session.primarySkill) return;
    conversationStore.skillTask?.(session.boardId, session.ownerUserId, session.conversationId, session.taskId, {
      taskId: session.taskId, primary: session.primarySkill, cancelled,
      approved: [...session.approvedSkills.values()].slice(-8), declined: [...session.declinedSkills].slice(-16),
      pending: session.pendingSkillApproval,
      referenceResume: session.skillReferenceResume || null,
      referenceEvent: session.skillReferenceEvent || null,
    });
  }

  function skillReferenceState(task) {
    if (!task || task.cancelled || !task.referenceResume && !task.referenceEvent) return null;
    const resume = task.referenceResume;
    return {
      taskId: task.taskId, primary: task.primary, approved: task.approved || [],
      pending: task.pending || null, event: task.referenceEvent || null,
      resume: resume && !resume.completed ? resume : null,
    };
  }

  function prepareProviderTurn(payload, skills, session, options = {}) {
    const continuation = Boolean(
      String(payload.previous_response_id || "").trim()
        || (Array.isArray(payload.tool_outputs) && payload.tool_outputs.length),
    );
    const intentPrompt = session.initialPayload?.user_intent_prompt
      ?? String(payload.user_intent_prompt ?? payload.recovery_original_prompt ?? payload.prompt ?? "");
    const skillOptOut = isSkillInvocationProhibited(intentPrompt);
    const skillFields = skillOptOut
      ? { active_skill_id: "", skill_auto: false }
      : getSessionSkillFields(session);
    const isH3Commerce = [skillFields.active_skill_id, payload.skill_id, session.initialPayload?.skill_id].includes("h3-commerce-video");
    const effectivePayload = continuation && session.initialPayload
      ? {
          ...session.initialPayload,
          skill_mode: session.initialPayload.skill_mode,
          skill_id: session.initialPayload.skill_id,
          ...skillFields,
          ...(skillOptOut ? { skill_mode: "auto", skill_id: "" } : {}),
          ...(isH3Commerce ? {
            canvas: payload.canvas ?? session.initialPayload.canvas,
            vision_images: payload.vision_images ?? session.initialPayload.vision_images,
          } : {}),
          board_id: session.boardId,
          tool_outputs: payload.tool_outputs,
          step: payload.step,
          previous_response_id: "",
        }
      : { ...payload, ...skillFields, user_intent_prompt: intentPrompt,
          skill_id: session.initialPayload?.skill_id || "", skill_mode: session.initialPayload?.skill_mode || "auto",
          skill_workflow: session.initialPayload?.skill_workflow === true };
    const contextTranscript = normalizeConversationContext(
      session.initialPayload?.conversation_context || payload.conversation_context,
    );
    const selectedReasoningEffort = CanvasAgentRuntime.selectAgentReasoningEffort(
      effectivePayload,
      reasoningEffort,
    );
    const readOnlyImageQuestion = !effectivePayload.skill_workflow && isReadOnlyImageQuestion(
      intentPrompt,
      effectivePayload.vision_images?.length,
      effectivePayload.active_skill_id || effectivePayload.skill_id,
    );
    const providerSkills = skillOptOut || !session.primarySkill && session.selectionReason !== "ambiguous" ? { ...skills, business: [] } : skills;
    const prepared = CanvasAgentRuntime.buildProviderTurnRequest(effectivePayload, {
      reasoningEffort: selectedReasoningEffort,
      skills: providerSkills,
      contextTranscript,
      transcript: continuation ? session.transcript : [],
      forceStateless: continuation,
      flattenToolHistory: options.flattenToolHistory === true || session.forceFlattenToolHistory === true,
    });
    if (payload.skill_approval_resume) {
      prepared.system += "\n继续当前用户任务。专业资料的批准只允许参考资料；主 Skill、独立工作流、画布写入和付费生成仍遵守原任务及既有确认。";
      if (session.skillReferenceResume?.decision === "decline") {
        prepared.system += "用户已拒绝附加资料。沿用当前主 Skill 继续，跳过这份附加资料。";
      }
    }
    const approved = (skills.business || []).filter(skill => session.approvedSkills?.has(skill.id)
      && session.approvedSkills.get(skill.id).fingerprint === (skill.validationFingerprint || ""));
    if (approved.length && session.primarySkill) {
      prepared.system += "\n用户已授权以下附加专业资料。主 Skill 和现有工具、确认权限保持锁定。\n"
        + approved.map(skill => `${skill.id}（${skill.canvas.label}）\n${skill.instructions}\n参考资料：${(skill.references || []).map(ref => ref.path).join("、")}`).join("\n\n");
    }
    if (readOnlyImageQuestion) {
      prepared.tools = [];
      prepared.toolChoice = "";
      if (prepared.params) delete prepared.params.parallel_tool_calls;
    } else if (skillOptOut) {
      prepared.tools = prepared.tools.filter(tool => !["activate_canvas_skill", "read_skill_reference"].includes(tool.function?.name));
      prepared.toolChoice = prepared.tools.length ? prepared.toolChoice : "";
    }
    return prepared;
  }

  async function handleConversation(req, res, userId) {
    try {
      if (req.method === "GET") {
        const url = new URL(req.url, "http://localhost");
        const boardId = normalizeBoardId(url.searchParams.get("board_id"));
        const action = String(url.searchParams.get("action") || "");
        let resource;
        try {
          resource = await ensureReferencedResource(userId, {
            type: "canvas",
            title: `画布 ${boardId}`,
            refType: "canvas",
            refId: boardId,
          });
        } catch (error) {
          if (error.code !== "canvas_board_not_found") throw error;
          // New boards preload an empty conversation before their first save.
          // This must not create a resource or read orphaned conversation data.
          if (action === "list") {
            sendJson(res, 200, { boardId, activeConversationId: "", sessions: [] });
            return;
          }
          sendJson(res, 200, CanvasAgentConversation.create(boardId));
          return;
        }
        await resourceAccess.assertRead(userId, resource.id);
        if (action === "list") {
          if (typeof conversationStore.list !== "function") {
            sendJson(res, 501, { error: "Conversation history is not available.", code: "history_unavailable" });
            return;
          }
          sendJson(res, 200, conversationStore.list(boardId, userId, resource.ownerUserId));
          return;
        }
        const conversationId = String(url.searchParams.get("conversation_id") || "");
        const conversation = conversationStore.get(boardId, userId, conversationId, resource.ownerUserId);
        if (!conversation) {
          sendJson(res, 404, { error: "Conversation is not available.", code: "conversation_not_found" });
          return;
        }
        const task = conversation.taskContext?.taskId && conversationStore.skillTask?.(
          boardId, userId, conversation.conversationId, conversation.taskContext.taskId,
        );
        const referenceState = skillReferenceState(task);
        sendJson(res, 200, referenceState ? { ...conversation, skillReferenceApproval: referenceState } : conversation);
        return;
      }
      const payload = await readJson(req);
      const boardId = normalizeBoardId(payload?.board_id);
      const resource = await ensureReferencedResource(userId, {
        type: "canvas",
        title: `画布 ${boardId}`,
        refType: "canvas",
        refId: boardId,
      });
      await resourceAccess.assertWrite(userId, resource.id);
      if (req.method === "POST") {
        if (payload?.action === "create") {
          if (typeof conversationStore.createSession !== "function") {
            sendJson(res, 501, { error: "Conversation history is not available.", code: "history_unavailable" });
            return;
          }
          sendJson(res, 201, conversationStore.createSession(boardId, userId, resource.ownerUserId));
          return;
        }
        if (payload?.action === "activate") {
          const activated = typeof conversationStore.activateSession === "function"
            && conversationStore.activateSession(boardId, userId, payload?.conversation_id);
          if (!activated) {
            sendJson(res, 404, { error: "Conversation is not available.", code: "conversation_not_found" });
            return;
          }
          sendJson(res, 200, { ok: true, conversation_id: String(payload.conversation_id || "") });
          return;
        }
        const conversation = CanvasAgentConversation.normalize(payload?.conversation, boardId);
        const saved = conversationStore.upsert(conversation, payload?.expected_revision, userId);
        sendJson(res, 200, saved);
        return;
      }
      if (req.method === "DELETE") {
        sendJson(res, 200, { ok: true, removed: conversationStore.remove(boardId, userId, resource.ownerUserId) });
        return;
      }
      sendJson(res, 405, { error: "Method not allowed" });
    } catch (error) {
      if (error?.code === "CONVERSATION_REVISION_CONFLICT") {
        sendJson(res, 409, { code: error.code, error: "Conversation changed in another window.", current: error.current });
        return;
      }
      sendJson(res, Number(error?.statusCode || 400), { error: error.message, code: error?.code });
    }
  }

  async function handleTurn(req, res, userId) {
    const wantsStream = String(req.headers.accept || "").includes("application/x-ndjson");
    const requestController = new AbortController();
    let streamStarted = false;
    let session = null;
    let agentRoute = null;
    let claimedReferenceResume = null;
    const cancelRequest = () => {
      if (!requestController.signal.aborted && !res.writableEnded) {
        requestController.abort(attemptError("Canvas Agent request was cancelled.", {
          name: "AbortError",
          category: "cancelled",
          cancelledByUser: true,
        }));
      }
    };
    req.once("aborted", cancelRequest);
    req.once("close", () => {
      if (req.aborted) cancelRequest();
    });
    res.once("close", () => {
      if (!res.writableEnded) cancelRequest();
    });
    try {
      const payload = await readJson(req);
      const skills = skillRegistry.loadAgentCatalog(userId);
      session = getOrCreateSession(payload, skills, userId);
      if (session.ownerUserId && session.ownerUserId !== userId) {
        throw Object.assign(new Error("This Canvas Agent run belongs to another account."), { code: "forbidden", statusCode: 403 });
      }
      session.ownerUserId = userId;
      const canvasResource = await ensureReferencedResource(userId, {
        type: "canvas",
        title: `画布 ${session.boardId}`,
        refType: "canvas",
        refId: session.boardId,
      });
      await resourceAccess.assertWrite(userId, canvasResource.id);
      if (payload.action === "skill_approval") {
        const saved = conversationStore.skillTask?.(session.boardId, userId, session.conversationId, session.taskId);
        if (saved?.cancelled) throw attemptError("本任务已经取消。", { code: "skill_task_cancelled", statusCode: 409 });
        if (saved) {
          session.pendingSkillApproval = saved.pending;
          session.skillReferenceResume = saved.referenceResume;
          session.approvedSkills = new Map((saved.approved || []).map(item => [item.id, item]));
          session.declinedSkills = new Set(saved.declined || []);
        }
        const pending = session.pendingSkillApproval;
        const target = skills.business.find(skill => skill.id === pending?.id);
        if (!pending || payload.operation_id !== pending.operationId || !["approve", "decline"].includes(payload.decision)
          || session.skillReferenceResume?.runId !== session.runId
          || !target || (target.validationFingerprint || "") !== pending.fingerprint) {
          throw attemptError("Skill 授权已失效，请重新提交当前任务。", { code: "skill_approval_expired", statusCode: 409 });
        }
        session.pendingSkillApproval = null;
        const approved = payload.decision === "approve";
        if (approved) session.approvedSkills.set(target.id, pending);
        else session.declinedSkills.add(target.id);
        const event = {
          eventId: `${approved ? "grant" : "deny"}:${pending.operationId}`, taskId: session.taskId,
          skillId: session.primarySkill.id, relatedSkillId: pending.id,
          type: approved ? "cross_skill_grant" : "cross_skill_denial", source: "user", at: new Date().toISOString(),
        };
        session.skillEvents.push(event);
        session.skillReferenceEvent = event;
        session.skillReferenceResume = { ...session.skillReferenceResume, decision: payload.decision };
        saveSkillTask(session);
        sendJson(res, 200, { skill_event: event, approved: approved ? pending : null, resume: session.skillReferenceResume });
        return;
      }
      if (session.pendingSkillApproval) {
        sendJson(res, 200, { ...sanitizeTurn({}, null, session.requestId, session.messageId, session),
          skill_approval: session.pendingSkillApproval, skill_reference_resume: session.skillReferenceResume });
        return;
      }
      if (payload.skill_approval_resume) {
        const saved = conversationStore.skillTask?.(session.boardId, userId, session.conversationId, session.taskId);
        const checkpoint = saved?.referenceResume || session.skillReferenceResume;
        if (saved?.cancelled || !checkpoint?.decision || checkpoint.completed || checkpoint.operationId !== payload.skill_approval_resume
          || checkpoint.runId !== session.runId || checkpoint.requestId !== session.requestId
          || checkpoint.messageId !== session.messageId || session.referenceResumeInFlight) {
          throw attemptError("本次专业资料确认已处理或正在继续。", { code: "skill_resume_unavailable", statusCode: 409 });
        }
        session.skillReferenceResume = checkpoint;
        claimedReferenceResume = session.referenceResumeInFlight = checkpoint.operationId;
        if (saved) {
          session.approvedSkills = new Map((saved.approved || []).map(item => [item.id, item]));
          session.declinedSkills = new Set(saved.declined || []);
          session.skillReferenceEvent = saved.referenceEvent;
        }
      } else if (session.skillReferenceResume?.decision && !session.skillReferenceResume.completed
        && session.skillReferenceResume.runId === session.runId) {
        throw attemptError("请通过专业资料确认卡继续任务。", { code: "skill_approval_required", statusCode: 409 });
      }
      saveSkillTask(session);
      const scopedPayload = {
        ...payload,
        board_id: session.boardId,
        ...getSessionSkillFields(session),
      };
      if (wantsStream) {
        res.writeHead(200, {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Content-Type-Options": "nosniff",
        });
        streamStarted = true;
        writeEvent(res, { type: "status", stage: "understanding" });
      }
      const requestedExtra = (skills.business || []).find(skill => session.requestedSkills.includes(skill.id)
        && !session.approvedSkills.has(skill.id) && !session.declinedSkills.has(skill.id));
      if (requestedExtra) {
        const turn = requestSkillApproval(session, requestedExtra, "用户提出了组合专业流程。");
        if (wantsStream) { writeEvent(res, { type: "turn", turn }); res.end(); }
        else sendJson(res, 200, turn);
        return;
      }
      const prepared = prepareProviderTurn(scopedPayload, skills, session);
      const visionReceipt = verifyPreparedVision(prepared, scopedPayload);
      agentRoute = agentModelSettings.getRoute();
      // Authoring the full A/B prompts and package in a tool call takes longer
      // than the default Agent limit. Keep the first-event timeout unchanged.
      const isH3CommerceContinuation = scopedPayload.active_skill_id === "h3-commerce-video"
        && Array.isArray(scopedPayload.tool_outputs)
        && scopedPayload.tool_outputs.length > 0;
      const providerTotalTimeoutMs = isH3CommerceContinuation
        ? Math.max(H3_COMMERCE_CONTINUATION_TIMEOUT_MS, Number(totalTimeoutMs) || 0)
        : totalTimeoutMs;
      const runPreparedTurn = (preparedTurn) => canvasAgentProviderBridge.runTurn({
        messages: preparedTurn.messages,
        system: preparedTurn.system,
        tools: preparedTurn.tools,
        toolChoice: preparedTurn.toolChoice,
        needsVision: preparedTurn.needsVision,
        candidateOrder: agentRoute.autoFallback
          ? prioritizeSessionCandidateOrder(agentRoute.candidateOrder, session)
          : agentRoute.candidateOrder,
        signal: requestController.signal,
        params: preparedTurn.params,
        options: {
          connectTimeoutMs,
          firstEventTimeoutMs,
          totalTimeoutMs: providerTotalTimeoutMs,
        },
        onAttemptFailure: (attempt) => {
          if (wantsStream) writeEvent(res, { type: "status", stage: "switching", failedModel: attempt.modelId });
        },
        onDelta: () => {},
      });
      let result;
      if (wantsStream) writeEvent(res, { type: "status", stage: "model-request" });
      try {
        result = await runPreparedTurn(prepared);
      } catch (error) {
        if (!isReasoningReplayError(error)) throw error;
        // Some thinking gateways reject native tool-call history created by a
        // different provider, even when the stored reasoning_content is
        // replayed. Retry once with the same context flattened into ordinary
        // text messages so the request no longer depends on that provider
        // private reasoning state.
        session.forceFlattenToolHistory = true;
        const compatiblePrepared = prepareProviderTurn(scopedPayload, skills, session, {
          flattenToolHistory: true,
        });
        verifyPreparedVision(compatiblePrepared, scopedPayload);
        result = await runPreparedTurn(compatiblePrepared);
      }
      if (wantsStream && result.attempts.length) {
        writeEvent(res, { type: "status", stage: "resumed" });
      }
      const selectedCandidate = {
        id: `provider:${result.selection?.providerId || ""}:${result.selection?.modelId || ""}`,
        providerId: result.selection?.providerId || "",
        model: result.selection?.modelId || "",
      };
      const calls = (result.turn.tool_calls || []).filter(call => !["activate_canvas_skill", "read_skill_reference"].includes(call.name)
        || !session.declinedSkills.has(String(call.arguments?.skill_id || "")));
      result.turn.tool_calls = calls;
      const lock = { skillId: session.primarySkill?.id, approvedSkillIds: (skills.business || [])
        .filter(skill => session.approvedSkills.get(skill.id)?.fingerprint === (skill.validationFingerprint || ""))
        .map(skill => skill.id) };
      const foreign = calls.find(call => CanvasAgentCore.inspectSkillInvocation(lock, call.name, call.arguments?.skill_id) !== "allow");
      if (foreign && session.primarySkill) {
        const target = skills.business.find(skill => skill.id === foreign.arguments?.skill_id);
        if (target && target.id !== lock.skillId && !session.approvedSkills.has(target.id) && !session.declinedSkills.has(target.id)) {
          const turn = requestSkillApproval(session, target, foreign.name === "read_skill_reference"
            ? "Agent 请求读取另一专业流程的资料。" : "Agent 请求引入另一专业流程。");
          if (visionReceipt) turn.vision_receipt = visionReceipt;
          if (wantsStream) { writeEvent(res, { type: "turn", turn }); res.end(); }
          else sendJson(res, 200, turn);
          return;
        }
      }
      const allowedTools = new Set(prepared.tools.map(tool => tool.function?.name));
      if (foreign || calls.some(call => !allowedTools.has(call.name))) {
        throw attemptError("模型提出了本轮未授权的操作，已拦截。请重试当前请求。", {
          category: "task", code: "unauthorized_tool_call", statusCode: 502,
        });
      }
      appendSessionTurn(session, scopedPayload, result.turn, selectedCandidate);
      for (const call of result.turn.tool_calls || []) {
        const skillId = call.name === "read_skill_reference" ? String(call.arguments?.skill_id || session.activeSkillId || "")
          : String(session.activeSkillId || "");
        if (!skillId) continue;
        const type = call.name === "read_skill_reference" ? "reference_read" : "tool_invocation";
        const eventId = `tool:${call.call_id}`;
        if (!session.skillEvents.some(event => event.eventId === eventId)) session.skillEvents.push({
          eventId, taskId: session.taskId, type, skillId,
          source: "agent", name: String(call.name || "").slice(0, 120),
          ...(call.name === "read_skill_reference" ? { path: String(call.arguments?.path || "") } : {}),
          status: "proposed", at: new Date().toISOString(),
        });
      }
      session.skillEvents = session.skillEvents.slice(-500);
      const turn = sanitizeTurn(result.turn, resolveSessionAutoSkill(session, skills), session.requestId, session.messageId, session);
      if (visionReceipt) turn.vision_receipt = visionReceipt;
      turn.selection = result.selection;
      turn.attempts = result.attempts;
      turn.autoFallback = agentRoute.autoFallback;
      const skillSession = Boolean(session.activeSkillId || session.autoSkillId);
      if (!turn.tool_calls.length && !skillSession) disposeSession(session);
      if (claimedReferenceResume && session.skillReferenceResume?.operationId === claimedReferenceResume
        && !requestController.signal.aborted && !res.destroyed) {
        session.skillReferenceResume = { ...session.skillReferenceResume, completed: true };
        saveSkillTask(session);
      }
      if (wantsStream) {
        writeEvent(res, { type: "turn", turn });
        res.end();
      } else {
        sendJson(res, 200, turn);
      }
    } catch (error) {
      const cancelled = requestController.signal.aborted
        || error?.name === "AbortError"
        || error?.code === "REQUEST_ABORTED";
      const agentSettingsUnavailable = error?.code === "AGENT_MODEL_SETTINGS_UNAVAILABLE";
      const unavailable = error?.name === "CanvasAgentUnavailableError"
        || ["AGENT_MODEL_SETTINGS_UNAVAILABLE", "MODEL_CAPABILITY_UNAVAILABLE", "PINNED_MODEL_UNAVAILABLE", "UPSTREAM_UNAVAILABLE", "UPSTREAM_TIMEOUT", "UPSTREAM_RATE_LIMIT", "UPSTREAM_PROTOCOL", "INVALID_AGENT_RESPONSE"].includes(error?.code)
        || /没有已配置且支持当前任务的 Agent 服务/.test(String(error?.message || ""));
      const category = cancelled ? "cancelled"
        : error?.code === "UPSTREAM_TIMEOUT" ? "timeout"
          : /network|fetch failed|socket|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT/i
            .test(`${error?.code || ""} ${error?.safeMessage || error?.message || ""}`) ? "network" : "";
      const routingReason = !agentRoute ? "" : !agentRoute.autoFallback ? "模型服务自动切换已关闭。"
        : agentRoute.candidateOrder.length < 2 ? "未配置可接替且满足能力要求的候选模型。" : "已配置的可用候选模型均未能完成本次请求。";
      const message = cancelled
        ? "Canvas Agent request was cancelled."
        : agentSettingsUnavailable
          ? (error.safeMessage || error.message)
          : unavailable ? `模型请求失败。${routingReason}已保留任务与画布，可检查模型设置后继续。` : (error.safeMessage || error.message);
      if (!claimedReferenceResume && !["skill_approval_required", "skill_approval_expired", "skill_resume_unavailable"].includes(error?.code)) {
        disposeSession(session, { retainCheckpoint: unavailable });
      }
      if (streamStarted && !res.writableEnded) {
        writeEvent(res, {
          type: "error",
          error: message,
          code: String(error?.code || ""),
          category,
          stage: String(error?.stage || ""),
          recoverable: unavailable,
          detail: String(error?.safeMessage || error?.message || "").slice(0, 240),
          attempts: Array.isArray(error?.attempts)
            ? error.attempts.map((attempt) => ({
                providerId: String(attempt?.providerId || ""),
                modelId: String(attempt?.modelId || ""),
                code: String(attempt?.code || ""),
                stage: String(attempt?.stage || ""),
                retryable: attempt?.retryable !== false,
                message: String(attempt?.safeMessage || attempt?.message || "").slice(0, 240),
              }))
            : [],
        });
        res.end();
      } else if (!res.writableEnded) {
        sendJson(res, Number(error?.statusCode || (cancelled ? 499 : unavailable ? 503 : 400)), {
          error: message,
          code: error?.code,
          recoverable: unavailable,
        });
      }
    } finally {
      if (session && claimedReferenceResume) session.referenceResumeInFlight = null;
    }
  }

  async function handleCancel(req, res, userId) {
    try {
      const payload = await readJson(req);
      const runId = String(payload.run_id || "").trim();
      if (!/^[a-zA-Z0-9_-]{1,120}$/.test(runId)) throw new Error("Invalid Canvas Agent run id.");
      const session = sessions.get(runId);
      if (session?.ownerUserId && session.ownerUserId !== userId) {
        throw Object.assign(new Error("This Canvas Agent run belongs to another account."), { code: "forbidden", statusCode: 403 });
      }
      if (session) saveSkillTask(session, true);
      disposeSession(session);
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, Number(error?.statusCode || 400), { error: error.message, code: error?.code });
    }
  }

  async function handleCommercePackage(req, res, userId) {
    try {
      if (req.method !== "POST" && req.method !== "GET") {
        sendJson(res, 405, { error: "不支持的带货方案保存方法。", code: "method_not_allowed" });
        return;
      }
      if (req.method === "GET") {
        const url = new URL(req.url, "http://localhost");
        const boardId = normalizeBoardId(url.searchParams.get("board_id"));
        if (!boardId) throw Object.assign(new Error("当前画布编号无效。"), { statusCode: 400 });
        if (typeof saveH3CommercePackage?.read !== "function") {
          sendJson(res, 503, { error: "H3 带货方案读取服务尚未部署。", code: "commerce_package_unavailable" });
          return;
        }
        const result = await saveH3CommercePackage.read(userId, boardId, url.searchParams.get("package_id"), url.searchParams.get("file"));
        sendJson(res, 200, { ok: true, ...result }, { "Cache-Control": "private, no-store" });
        return;
      }
      const payload = await readJson(req);
      const boardId = normalizeBoardId(payload?.board_id);
      if (!boardId) throw Object.assign(new Error("当前画布编号无效。"), { statusCode: 400 });
      if (typeof saveH3CommercePackage?.save !== "function") {
        sendJson(res, 503, { error: "H3 带货方案保存服务尚未部署。", code: "commerce_package_unavailable" });
        return;
      }
      let binding;
      try { binding = JSON.parse(payload.files?.["result.json"] || "{}").canvas; } catch {}
      const result = await saveH3CommercePackage.save(userId, boardId, payload.files, binding);
      sendJson(res, 201, { ok: true, ...result });
    } catch (error) {
      sendJson(res, Number(error?.statusCode || 400), {
        error: String(error?.safeMessage || error?.message || "带货方案保存失败。"),
        code: String(error?.code || "h3_commerce_package_failed"),
      });
    }
  }

  async function handle(req, res) {
    const pathname = requestPathname(req);
    if (
      pathname !== "/api/canvas-agent/conversation"
      && pathname !== "/api/canvas-agent/turn"
      && pathname !== "/api/canvas-agent/cancel"
      && pathname !== "/api/canvas-agent/h3-commerce-package"
    ) return false;

    const userId = req?.auth?.user?.id;
    if (!userId) {
      sendJson(res, 401, { error: "Authentication required", code: "unauthorized" });
      return true;
    }
    if (pathname === "/api/canvas-agent/conversation") {
      await handleConversation(req, res, userId);
      return true;
    }
    if (pathname === "/api/canvas-agent/turn" && req.method === "POST") {
      await handleTurn(req, res, userId);
      return true;
    }
    if (pathname === "/api/canvas-agent/cancel" && req.method === "POST") {
      await handleCancel(req, res, userId);
      return true;
    }
    if (pathname === "/api/canvas-agent/h3-commerce-package") {
      await handleCommercePackage(req, res, userId);
      return true;
    }
    sendJson(res, 405, { error: "Method not allowed", code: "method_not_allowed" });
    return true;
  }

  return Object.freeze({ handle });
}

module.exports = { createCanvasAgentHttpApi };
