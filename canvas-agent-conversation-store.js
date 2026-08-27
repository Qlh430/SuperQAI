const fs = require("node:fs");
const path = require("node:path");
const CanvasAgentConversation = require("./canvas-agent-conversation");

function createCanvasAgentConversationStore(options = {}) {
  const filePath = path.resolve(String(options.filePath || ""));
  if (!options.filePath) throw new Error("Canvas Agent conversation store requires a file path.");

  function readState() {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      return {
        version: 1,
        conversations: (Array.isArray(data?.conversations) ? data.conversations : [])
          .map((item) => CanvasAgentConversation.normalize(item, item?.boardId))
          .filter((item) => item.boardId),
      };
    } catch (error) {
      if (error?.code === "ENOENT") return { version: 1, conversations: [] };
      throw error;
    }
  }

  function writeState(state) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    fs.renameSync(temporaryPath, filePath);
  }

  function get(boardId) {
    const id = normalizeBoardId(boardId);
    const record = readState().conversations.find((item) => item.boardId === id);
    return record ? CanvasAgentConversation.normalize(record, id) : CanvasAgentConversation.create(id);
  }

  function upsert(value, expectedRevision = value?.revision) {
    const record = CanvasAgentConversation.normalize(value, value?.boardId);
    const boardId = normalizeBoardId(record.boardId);
    const state = readState();
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
    const next = {
      ...record,
      boardId,
      revision: currentRevision + 1,
      updatedAt: new Date().toISOString(),
    };
    if (index >= 0) state.conversations[index] = next;
    else state.conversations.push(next);
    writeState(state);
    return CanvasAgentConversation.normalize(next, boardId);
  }

  function remove(boardId) {
    const id = normalizeBoardId(boardId);
    const state = readState();
    const next = state.conversations.filter((item) => item.boardId !== id);
    if (next.length === state.conversations.length) return false;
    writeState({ ...state, conversations: next });
    return true;
  }

  return { get, upsert, remove };
}

function normalizeBoardId(value) {
  const boardId = String(value || "").trim();
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(boardId)) throw new Error("Invalid Canvas Agent board id.");
  return boardId;
}

module.exports = { createCanvasAgentConversationStore, normalizeBoardId };
