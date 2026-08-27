(function initCanvasAgentConversation(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasAgentConversation = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasAgentConversationApi() {
  const MAX_ITEMS = 200;
  const MAX_TRANSCRIPT_ITEMS = 24;
  const MAX_ITEM_TEXT_LENGTH = 12000;
  const ALLOWED_ROLES = new Set(["user", "assistant", "notice", "error", "tool"]);
  const ALLOWED_STATUSES = new Set(["running", "completed", "failed", "recoverable", "stopped", "declined"]);

  function create(boardId) {
    return {
      boardId: String(boardId || ""),
      conversationId: makeConversationId(),
      revision: 0,
      items: [],
      updatedAt: new Date().toISOString(),
    };
  }

  function normalize(value, boardId = value?.boardId) {
    const source = value && typeof value === "object" ? value : {};
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
      conversationId: String(source.conversationId || makeConversationId()).slice(0, 120),
      revision: Math.max(0, Number(source.revision || 0)),
      items,
      updatedAt: normalizeDate(source.updatedAt),
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
        content: item.text,
        ...(item.toolName ? { tool_name: item.toolName } : {}),
        ...(item.nodeId ? { node_id: item.nodeId } : {}),
      }));
  }

  function normalizeItem(value) {
    if (!value || typeof value !== "object") return null;
    const role = ALLOWED_ROLES.has(String(value.role || "")) ? String(value.role) : "notice";
    const text = String(value.text || "").slice(0, MAX_ITEM_TEXT_LENGTH);
    if (!text && role !== "tool") return null;
    return {
      id: String(value.id || makeConversationId()).slice(0, 160),
      role,
      text,
      status: ALLOWED_STATUSES.has(String(value.status || "")) ? String(value.status) : "completed",
      toolName: String(value.toolName || "").slice(0, 120),
      nodeId: String(value.nodeId || "").slice(0, 120),
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

  return {
    MAX_ITEMS,
    MAX_TRANSCRIPT_ITEMS,
    create,
    normalize,
    appendItems,
    markInterrupted,
    buildTranscript,
  };
});
