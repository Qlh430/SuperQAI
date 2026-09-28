"use strict";

const crypto = require("node:crypto");

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

  function getOrCreateSession(payload = {}, skills = {}) {
    pruneSessions();
    const suppliedRunId = String(payload.run_id || "").trim();
    const runId = /^[a-zA-Z0-9_-]{1,120}$/.test(suppliedRunId)
      ? suppliedRunId
      : `agent_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const requestedBoardId = String(payload.board_id || payload.canvas?.id || "").trim();
    const requestedActiveSkillId = String(
      payload.active_skill_id
      || (payload.skill_mode === "manual" ? payload.skill_id : "")
      || "",
    ).trim();
    const businessSkillIds = new Set((Array.isArray(skills?.business) ? skills.business : [])
      .map((skill) => String(skill?.id || ""))
      .filter(Boolean));
    if (requestedActiveSkillId && !businessSkillIds.has(requestedActiveSkillId)) {
      throw attemptError("请求的专业流程当前不可用。", { category: "task" });
    }
    let session = sessions.get(runId);
    // 运行中被停用的专业流程不再可用：丢弃旧值回到自动路由，而不是让续跑直接失败。
    if (session?.activeSkillId && !businessSkillIds.has(session.activeSkillId)) session.activeSkillId = "";
    if (session?.autoSkillId && !businessSkillIds.has(session.autoSkillId)) session.autoSkillId = "";
    if (!session) {
      if (!requestedBoardId) throw attemptError("Canvas Agent requires a current board.", { category: "task" });
      const now = Date.now();
      session = {
        runId,
        boardId: requestedBoardId,
        activeSkillId: requestedActiveSkillId,
        autoSkillId: "",
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
      if (requestedBoardId && session.boardId !== requestedBoardId) {
        throw attemptError("这个任务不属于当前画布，已阻止继续执行。", { category: "task" });
      }
      if (requestedActiveSkillId && session.activeSkillId && session.activeSkillId !== requestedActiveSkillId) {
        throw attemptError("本次任务已经启用另一个专业流程。", { category: "task" });
      }
      if (requestedActiveSkillId) session.activeSkillId = requestedActiveSkillId;
    }
    if (!session.initialPayload && String(payload.prompt || "").trim()) {
      session.initialPayload = {
        skill_mode: payload.skill_mode === "manual" ? "manual" : "auto",
        skill_id: String(payload.skill_id || ""),
        active_skill_id: session.activeSkillId,
        board_id: session.boardId,
        prompt: String(payload.prompt || ""),
        canvas: payload.canvas && typeof payload.canvas === "object" ? payload.canvas : {},
        vision_images: Array.isArray(payload.vision_images) ? payload.vision_images.slice(0, 3) : [],
        conversation_context: normalizeConversationContext(payload.conversation_context),
        step: 0,
      };
      // 这一轮的需求如果能唯一匹配某个专业流程，就在整个任务里一直沿用它：续跑的每一轮
      // 都要带回同一个 Skill，否则模型会在第二轮回落到没有流程约束的自动路由。
      if (!session.activeSkillId) {
        const inferred = CanvasAgentRuntime.inferCanvasAgentBusinessSkill(
          session.initialPayload.prompt,
          Array.isArray(skills?.business) ? skills.business : [],
        );
        if (inferred) session.autoSkillId = inferred.id;
      }
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

  function sanitizeTurn(turn = {}, autoSkill = null) {
    return {
      response_id: String(turn.response_id || ""),
      message: String(turn.message || ""),
      tool_calls: Array.isArray(turn.tool_calls) ? turn.tool_calls : [],
      usage: turn.usage || null,
      ...(autoSkill
        ? { auto_skill_id: String(autoSkill.id || ""), auto_skill_label: String(autoSkill.canvas?.label || "") }
        : {}),
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
      // 预加载的流程是"软"的：模型判断不匹配时仍然可以调用 activate_canvas_skill 切换。
      skill_auto: Boolean(!session?.activeSkillId && autoSkillId),
    };
  }

  function prepareProviderTurn(payload, skills, session, options = {}) {
    const continuation = Boolean(
      String(payload.previous_response_id || "").trim()
        || (Array.isArray(payload.tool_outputs) && payload.tool_outputs.length),
    );
    const effectivePayload = continuation && session.initialPayload
      ? {
          ...session.initialPayload,
          skill_mode: payload.skill_mode || session.initialPayload.skill_mode,
          skill_id: payload.skill_id ?? session.initialPayload.skill_id,
          ...getSessionSkillFields(session),
          board_id: session.boardId,
          tool_outputs: payload.tool_outputs,
          step: payload.step,
          previous_response_id: "",
        }
      : { ...payload, ...getSessionSkillFields(session) };
    const contextTranscript = normalizeConversationContext(
      session.initialPayload?.conversation_context || payload.conversation_context,
    );
    const selectedReasoningEffort = CanvasAgentRuntime.selectAgentReasoningEffort(
      effectivePayload,
      reasoningEffort,
    );
    return CanvasAgentRuntime.buildProviderTurnRequest(effectivePayload, {
      reasoningEffort: selectedReasoningEffort,
      skills,
      contextTranscript,
      transcript: continuation ? session.transcript : [],
      forceStateless: continuation,
      flattenToolHistory: options.flattenToolHistory === true || session.forceFlattenToolHistory === true,
    });
  }

  async function handleConversation(req, res, userId) {
    try {
      if (req.method === "GET") {
        const url = new URL(req.url, "http://localhost");
        const boardId = normalizeBoardId(url.searchParams.get("board_id"));
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
          sendJson(res, 200, CanvasAgentConversation.create(boardId));
          return;
        }
        await resourceAccess.assertRead(userId, resource.id);
        sendJson(res, 200, conversationStore.get(boardId));
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
        const conversation = CanvasAgentConversation.normalize(payload?.conversation, boardId);
        const saved = conversationStore.upsert(conversation, payload?.expected_revision);
        sendJson(res, 200, saved);
        return;
      }
      if (req.method === "DELETE") {
        sendJson(res, 200, { ok: true, removed: conversationStore.remove(boardId) });
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
      const skills = skillRegistry.loadAgentCatalog();
      session = getOrCreateSession(payload, skills);
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
      const prepared = prepareProviderTurn(scopedPayload, skills, session);
      const agentRoute = agentModelSettings.getRoute();
      const runPreparedTurn = (preparedTurn) => canvasAgentProviderBridge.runTurn({
        messages: preparedTurn.messages,
        system: preparedTurn.system,
        tools: preparedTurn.tools,
        toolChoice: preparedTurn.toolChoice,
        needsVision: preparedTurn.needsVision,
        candidateOrder: prioritizeSessionCandidateOrder(agentRoute.candidateOrder, session),
        forceFallback: true,
        signal: requestController.signal,
        params: preparedTurn.params,
        options: {
          connectTimeoutMs,
          firstEventTimeoutMs,
          totalTimeoutMs,
        },
        onAttemptFailure: () => {
          if (wantsStream) writeEvent(res, { type: "status", stage: "recovering" });
        },
        onDelta: () => {},
      });
      let result;
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
      appendSessionTurn(session, scopedPayload, result.turn, selectedCandidate);
      const turn = sanitizeTurn(result.turn, resolveSessionAutoSkill(session, skills));
      const skillSession = Boolean(session.activeSkillId || session.autoSkillId || scopedPayload.skill_id);
      if (!turn.tool_calls.length && !skillSession) disposeSession(session);
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
        || ["AGENT_MODEL_SETTINGS_UNAVAILABLE", "MODEL_CAPABILITY_UNAVAILABLE", "PINNED_MODEL_UNAVAILABLE", "UPSTREAM_UNAVAILABLE", "UPSTREAM_TIMEOUT", "UPSTREAM_RATE_LIMIT"].includes(error?.code)
        || /没有已配置且支持当前任务的 Agent 服务/.test(String(error?.message || ""));
      const message = cancelled
        ? "Canvas Agent request was cancelled."
        : agentSettingsUnavailable
          ? (error.safeMessage || error.message)
          : unavailable ? "所有可用模型服务暂时不可用，任务已保存，请稍后重试。" : (error.safeMessage || error.message);
      disposeSession(session, { retainCheckpoint: unavailable });
      if (streamStarted && !res.writableEnded) {
        writeEvent(res, { type: "error", error: message, recoverable: unavailable });
        res.end();
      } else if (!res.writableEnded) {
        sendJson(res, Number(error?.statusCode || (cancelled ? 499 : unavailable ? 503 : 400)), {
          error: message,
          code: error?.code,
          recoverable: unavailable,
        });
      }
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
      disposeSession(session);
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, Number(error?.statusCode || 400), { error: error.message, code: error?.code });
    }
  }

  async function handle(req, res) {
    const pathname = requestPathname(req);
    if (
      pathname !== "/api/canvas-agent/conversation"
      && pathname !== "/api/canvas-agent/turn"
      && pathname !== "/api/canvas-agent/cancel"
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
    sendJson(res, 405, { error: "Method not allowed", code: "method_not_allowed" });
    return true;
  }

  return Object.freeze({ handle });
}

module.exports = { createCanvasAgentHttpApi };
