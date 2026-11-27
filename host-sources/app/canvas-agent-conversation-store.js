const fs = require("node:fs");
const path = require("node:path");
const CanvasAgentConversation = require("./canvas-agent-conversation");

function createCanvasAgentConversationStore(options = {}) {
  const filePath = path.resolve(String(options.filePath || ""));
  if (!options.filePath) throw new Error("Canvas Agent conversation store requires a file path.");

  function readState() {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const conversations = (Array.isArray(data?.conversations) ? data.conversations : [])
        .map((item) => CanvasAgentConversation.normalize(item, item?.boardId))
        .filter((item) => item.boardId);
      const sessions = (Array.isArray(data?.sessions) ? data.sessions : [])
        .map(normalizeSession)
        .filter(Boolean);
      const activeSessions = (Array.isArray(data?.activeSessions) ? data.activeSessions : [])
        .map(normalizeActiveSession)
        .filter(Boolean);
      return { version: 2, conversations, sessions, activeSessions };
    } catch (error) {
      if (error?.code === "ENOENT") return { version: 2, conversations: [], sessions: [], activeSessions: [] };
      throw error;
    }
  }

  function writeState(state) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    fs.renameSync(temporaryPath, filePath);
  }

  function get(boardId, ownerUserId = "", conversationId = "", legacyOwnerUserId = ownerUserId) {
    const id = normalizeBoardId(boardId);
    const owner = normalizeOwnerUserId(ownerUserId);
    if (!owner) {
      const record = readState().conversations.find((item) => item.boardId === id);
      return record ? CanvasAgentConversation.normalize(record, id) : CanvasAgentConversation.create(id);
    }

    const state = readState();
    const migratedLegacy = ensureLegacyConversation(state, id, normalizeOwnerUserId(legacyOwnerUserId) || owner);
    if (conversationId) {
      const session = state.sessions.find((item) => item.boardId === id
        && item.ownerUserId === owner
        && item.conversation.conversationId === String(conversationId));
      if (migratedLegacy) writeState(state);
      return session ? CanvasAgentConversation.normalize(session.conversation, id) : null;
    }

    const active = state.activeSessions.find((item) => item.boardId === id && item.ownerUserId === owner);
    const selected = state.sessions.find((item) => item.boardId === id
      && item.ownerUserId === owner
      && item.conversation.conversationId === active?.conversationId);
    if (selected) {
      if (migratedLegacy) writeState(state);
      return CanvasAgentConversation.normalize(selected.conversation, id);
    }

    const session = { boardId: id, ownerUserId: owner, conversation: CanvasAgentConversation.create(id) };
    state.sessions.push(session);
    state.activeSessions = setActiveSession(state.activeSessions, id, owner, session.conversation.conversationId);
    writeState(state);
    return CanvasAgentConversation.normalize(session.conversation, id);
  }

  function list(boardId, ownerUserId, legacyOwnerUserId = ownerUserId) {
    const id = normalizeBoardId(boardId);
    const owner = requireOwnerUserId(ownerUserId);
    const state = readState();
    const migratedLegacy = ensureLegacyConversation(state, id, normalizeOwnerUserId(legacyOwnerUserId) || owner);
    let createdSession = false;
    if (!state.sessions.some((item) => item.boardId === id && item.ownerUserId === owner)) {
      const session = { boardId: id, ownerUserId: owner, conversation: CanvasAgentConversation.create(id) };
      state.sessions.push(session);
      state.activeSessions = setActiveSession(state.activeSessions, id, owner, session.conversation.conversationId);
      createdSession = true;
    }
    if (migratedLegacy || createdSession) writeState(state);
    const activeSession = state.activeSessions.find((item) => item.boardId === id && item.ownerUserId === owner);
    const sessions = state.sessions
      .filter((item) => item.boardId === id && item.ownerUserId === owner)
      .sort((left, right) => right.conversation.updatedAt.localeCompare(left.conversation.updatedAt))
      .map((item) => ({
        conversationId: item.conversation.conversationId,
        title: getConversationTitle(item.conversation),
        updatedAt: item.conversation.updatedAt,
        itemCount: item.conversation.items.length,
      }));
    return {
      boardId: id,
      activeConversationId: activeSession?.conversationId || sessions[0]?.conversationId || "",
      sessions,
    };
  }

  function createSession(boardId, ownerUserId, legacyOwnerUserId = ownerUserId) {
    const id = normalizeBoardId(boardId);
    const owner = requireOwnerUserId(ownerUserId);
    const state = readState();
    const migratedLegacy = ensureLegacyConversation(state, id, normalizeOwnerUserId(legacyOwnerUserId) || owner);
    const hasSessions = state.sessions.some((item) => item.boardId === id && item.ownerUserId === owner);
    if (!hasSessions) {
      state.sessions.push({ boardId: id, ownerUserId: owner, conversation: CanvasAgentConversation.create(id) });
    }
    const session = {
      boardId: id,
      ownerUserId: owner,
      conversation: CanvasAgentConversation.create(id),
    };
    state.sessions.push(session);
    state.activeSessions = setActiveSession(state.activeSessions, id, owner, session.conversation.conversationId);
    writeState(state);
    return CanvasAgentConversation.normalize(session.conversation, id);
  }

  function activateSession(boardId, ownerUserId, conversationId) {
    const id = normalizeBoardId(boardId);
    const owner = requireOwnerUserId(ownerUserId);
    const requestedId = String(conversationId || "");
    const state = readState();
    const exists = state.sessions.some((item) => item.boardId === id
      && item.ownerUserId === owner
      && item.conversation.conversationId === requestedId);
    if (!exists) return false;
    state.activeSessions = setActiveSession(state.activeSessions, id, owner, requestedId);
    writeState(state);
    return true;
  }

  function upsert(value, expectedRevision = value?.revision, ownerUserId = "") {
    const record = CanvasAgentConversation.normalize(value, value?.boardId);
    const boardId = normalizeBoardId(record.boardId);
    const owner = normalizeOwnerUserId(ownerUserId);
    const state = readState();

    if (!owner) {
      const index = state.conversations.findIndex((item) => item.boardId === boardId);
      const currentRevision = index >= 0 ? Number(state.conversations[index].revision || 0) : 0;
      if (Number(expectedRevision || 0) !== currentRevision) {
        const error = new Error("Canvas Agent conversation was updated by another client.");
        error.code = "CONVERSATION_REVISION_CONFLICT";
        error.current = index >= 0
          ? CanvasAgentConversation.normalize(state.conversations[index], boardId)
          : CanvasAgentConversation.create(boardId);
        throw error;
      }
      const next = { ...record, boardId, revision: currentRevision + 1, updatedAt: new Date().toISOString() };
      if (index >= 0) state.conversations[index] = next;
      else state.conversations.push(next);
      writeState(state);
      return CanvasAgentConversation.normalize(next, boardId);
    }

    const sessionIndex = state.sessions.findIndex((item) => item.boardId === boardId
      && item.ownerUserId === owner
      && item.conversation.conversationId === record.conversationId);
    const conflictingOwner = state.sessions.some((item) => item.boardId === boardId
      && item.conversation.conversationId === record.conversationId
      && item.ownerUserId !== owner);
    if (conflictingOwner) {
      throw Object.assign(new Error("Conversation is not available to this account."), { code: "CONVERSATION_NOT_FOUND", statusCode: 404 });
    }
    const currentRevision = sessionIndex >= 0 ? Number(state.sessions[sessionIndex].conversation.revision || 0) : 0;
    if (Number(expectedRevision || 0) !== currentRevision) {
      const error = new Error("Canvas Agent conversation was updated by another client.");
      error.code = "CONVERSATION_REVISION_CONFLICT";
      error.current = sessionIndex >= 0
        ? CanvasAgentConversation.normalize(state.sessions[sessionIndex].conversation, boardId)
        : CanvasAgentConversation.create(boardId);
      throw error;
    }
    const next = {
      ...record,
      boardId,
      revision: currentRevision + 1,
      updatedAt: new Date().toISOString(),
    };
    const session = { ...state.sessions[sessionIndex], boardId, ownerUserId: owner, conversation: next };
    if (sessionIndex >= 0) state.sessions[sessionIndex] = session;
    else state.sessions.push(session);
    state.activeSessions = setActiveSession(state.activeSessions, boardId, owner, next.conversationId);
    writeState(state);
    return CanvasAgentConversation.normalize(next, boardId);
  }

  function remove(boardId, ownerUserId = "", legacyOwnerUserId = ownerUserId) {
    const id = normalizeBoardId(boardId);
    const owner = normalizeOwnerUserId(ownerUserId);
    const state = readState();
    if (!owner) {
      const next = state.conversations.filter((item) => item.boardId !== id);
      if (next.length === state.conversations.length) return false;
      writeState({ ...state, conversations: next });
      return true;
    }
    const migratedLegacy = ensureLegacyConversation(state, id, normalizeOwnerUserId(legacyOwnerUserId) || owner);
    const sessions = state.sessions.filter((item) => item.boardId !== id || item.ownerUserId !== owner);
    const activeSessions = state.activeSessions.filter((item) => item.boardId !== id || item.ownerUserId !== owner);
    if (sessions.length === state.sessions.length) {
      if (migratedLegacy) writeState(state);
      return false;
    }
    writeState({ ...state, sessions, activeSessions });
    return true;
  }

  function skillTask(boardId, owner, conversationId, taskId, value) {
    const state = readState();
    const session = state.sessions.find(item => item.boardId === boardId && item.ownerUserId === owner
      && item.conversation.conversationId === conversationId);
    if (!session) return null;
    const tasks = session.skillTasks || [];
    if (value === undefined) return tasks.find(item => item.taskId === taskId) || null;
    session.skillTasks = [...tasks.filter(item => item.taskId !== taskId), value].slice(-16);
    writeState(state);
    return value;
  }

  return { get, list, createSession, activateSession, upsert, remove, skillTask };
}

function ensureLegacyConversation(state, boardId, ownerUserId) {
  const index = state.conversations.findIndex((item) => item.boardId === boardId);
  if (index < 0) return false;
  const conversation = state.conversations.splice(index, 1)[0];
  const owner = requireOwnerUserId(ownerUserId);
  state.sessions.push({
    boardId,
    ownerUserId: owner,
    conversation: CanvasAgentConversation.normalize(conversation, boardId),
  });
  if (!state.activeSessions.some((item) => item.boardId === boardId && item.ownerUserId === owner)) {
    state.activeSessions = setActiveSession(state.activeSessions, boardId, owner, conversation.conversationId);
  }
  return true;
}

function setActiveSession(activeSessions, boardId, ownerUserId, conversationId) {
  return [
    ...activeSessions.filter((item) => item.boardId !== boardId || item.ownerUserId !== ownerUserId),
    { boardId, ownerUserId, conversationId },
  ];
}

function normalizeSession(value) {
  const boardId = String(value?.boardId || value?.conversation?.boardId || "");
  const ownerUserId = normalizeOwnerUserId(value?.ownerUserId);
  if (!boardId || !ownerUserId || !value?.conversation) return null;
  const conversation = CanvasAgentConversation.normalize(value.conversation, boardId);
  if (!conversation.conversationId) return null;
  return { boardId, ownerUserId, conversation,
    ...(Array.isArray(value.skillTasks) ? { skillTasks: value.skillTasks.slice(-16) } : {}) };
}

function normalizeActiveSession(value) {
  const boardId = String(value?.boardId || "");
  const ownerUserId = normalizeOwnerUserId(value?.ownerUserId);
  const conversationId = String(value?.conversationId || "");
  if (!boardId || !ownerUserId || !conversationId) return null;
  return { boardId, ownerUserId, conversationId };
}

function getConversationTitle(conversation) {
  const firstPrompt = conversation.items.find((item) => item.role === "user" && item.text.trim())?.text.trim();
  return String(firstPrompt || "新建对话").replace(/\s+/g, " ").slice(0, 96);
}

function normalizeOwnerUserId(value) {
  return String(value || "").trim().slice(0, 160);
}

function requireOwnerUserId(value) {
  const owner = normalizeOwnerUserId(value);
  if (!owner) throw new Error("Canvas Agent conversation requires an account id.");
  return owner;
}

function normalizeBoardId(value) {
  const boardId = String(value || "").trim();
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(boardId)) throw new Error("Invalid Canvas Agent board id.");
  return boardId;
}

module.exports = { createCanvasAgentConversationStore, normalizeBoardId };
