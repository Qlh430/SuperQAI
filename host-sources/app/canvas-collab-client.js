(function initCanvasCollabClient(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasCollabClient = api.CanvasCollabClient;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasCollabClientModule() {
  "use strict";

  const DEFAULT_CURSOR_INTERVAL_MS = 40;
  const DEFAULT_RECONNECT_DELAY_MS = 1200;
  const DEFAULT_MAX_RECONNECT_DELAY_MS = 15000;
  /* A collaborator who stops moving leaves a cursor behind; the marker is a
     hint, not state, so it is expired rather than carried forever. */
  const CURSOR_TTL_MS = 6000;

  function collabEndpoint(boardId, clientId, location) {
    const protocol = location?.protocol === "https:" ? "wss:" : "ws:";
    const host = location?.host || "localhost";
    return `${protocol}//${host}/api/canvas/collab?boardId=${encodeURIComponent(boardId)}&clientId=${encodeURIComponent(clientId)}`;
  }

  class CanvasCollabClient {
    constructor(options = {}) {
      const {
        boardId,
        clientId,
        makeSocket = (url) => new WebSocket(url),
        onUsers = () => {},
        onCursor = () => {},
        onPatch = () => {},
        onBoard = () => {},
        onState = () => {},
        cursorIntervalMs = DEFAULT_CURSOR_INTERVAL_MS,
        reconnectDelayMs = DEFAULT_RECONNECT_DELAY_MS,
        maxReconnectDelayMs = DEFAULT_MAX_RECONNECT_DELAY_MS,
        location = typeof globalThis !== "undefined" ? globalThis.location : undefined,
        setTimer = (fn, ms) => setTimeout(fn, ms),
        clearTimer = (handle) => clearTimeout(handle),
      } = options;
      if (!boardId) throw new Error("Canvas collaboration needs a board id.");
      if (!clientId) throw new Error("Canvas collaboration needs a client id.");
      this.boardId = String(boardId);
      this.clientId = String(clientId);
      this.makeSocket = makeSocket;
      this.location = location;
      this.handlers = { onUsers, onCursor, onPatch, onBoard, onState };
      this.cursorIntervalMs = Math.max(16, Number(cursorIntervalMs) || DEFAULT_CURSOR_INTERVAL_MS);
      this.reconnectDelayMs = Math.max(200, Number(reconnectDelayMs) || DEFAULT_RECONNECT_DELAY_MS);
      this.maxReconnectDelayMs = Math.max(this.reconnectDelayMs, Number(maxReconnectDelayMs) || DEFAULT_MAX_RECONNECT_DELAY_MS);
      this.setTimer = setTimer;
      this.clearTimer = clearTimer;
      this.socket = null;
      this.state = "idle";
      this.users = [];
      this.revision = 0;
      this.attempt = 0;
      this.closed = false;
      this.reconnectTimer = 0;
      this.lastCursorAt = 0;
      this.pendingCursor = null;
    }

    open() {
      this.closed = false;
      this.connect();
      return this;
    }

    connect() {
      if (this.closed || this.socket) return;
      let socket;
      try {
        socket = this.makeSocket(collabEndpoint(this.boardId, this.clientId, this.location));
      } catch (error) {
        this.setState("failed", { error: String(error?.message || error) });
        this.scheduleReconnect();
        return;
      }
      this.socket = socket;
      this.setState("connecting");
      socket.addEventListener("open", () => {
        if (this.socket !== socket) return;
        this.attempt = 0;
        this.setState("open");
      });
      socket.addEventListener("message", (event) => {
        if (this.socket !== socket) return;
        this.ingest(event?.data);
      });
      socket.addEventListener("close", () => {
        if (this.socket !== socket) return;
        this.socket = null;
        this.users = [];
        this.handlers.onUsers([], { revision: this.revision });
        this.setState(this.closed ? "closed" : "disconnected");
        if (!this.closed) this.scheduleReconnect();
      });
      socket.addEventListener("error", () => {
        if (this.socket !== socket) return;
        this.setState("failed");
      });
    }

    scheduleReconnect() {
      if (this.closed || this.reconnectTimer) return;
      this.attempt += 1;
      const delay = Math.min(this.reconnectDelayMs * this.attempt, this.maxReconnectDelayMs);
      this.reconnectTimer = this.setTimer(() => {
        this.reconnectTimer = 0;
        this.connect();
      }, delay);
    }

    /**
     * Reads one server frame. Returns the parsed message so tests can assert on
     * the routing without a socket.
     */
    ingest(raw) {
      let message;
      try {
        message = JSON.parse(typeof raw === "string" ? raw : String(raw));
      } catch {
        return null;
      }
      if (!message || typeof message !== "object") return null;
      if (message.type === "ping") {
        this.send({ type: "pong" });
        return message;
      }
      if (message.type === "pong") return message;
      if (message.type === "hello" || message.type === "presence") {
        const users = (Array.isArray(message.users) ? message.users : [])
          .filter((user) => user && String(user.clientId || "") !== this.clientId);
        this.users = users;
        if (Number.isFinite(Number(message.revision))) this.revision = Number(message.revision);
        this.handlers.onUsers(users, { revision: this.revision, self: message.type === "hello" ? this.clientId : undefined });
        return message;
      }
      if (message.type === "cursor") {
        if (String(message.clientId || "") === this.clientId) return message;
        this.handlers.onCursor({
          clientId: String(message.clientId || ""),
          userId: String(message.userId || ""),
          username: String(message.username || ""),
          displayName: String(message.displayName || message.username || ""),
          x: Number(message.x) || 0,
          y: Number(message.y) || 0,
          nodeId: String(message.nodeId || ""),
          seenAt: Date.now(),
        });
        return message;
      }
      if (message.type === "patch") {
        if (String(message.sourceClientId || "") === this.clientId) return message;
        this.handlers.onPatch(message);
        return message;
      }
      if (message.type === "board") {
        this.handlers.onBoard(message);
        return message;
      }
      return message;
    }

    send(message) {
      if (!this.socket || this.socket.readyState !== 1) return false;
      try {
        this.socket.send(JSON.stringify(message));
        return true;
      } catch {
        return false;
      }
    }

    /**
     * Pointer updates are the only high-frequency message on the channel, so
     * they are throttled to one frame per `cursorIntervalMs`; the newest
     * position always wins over a queue.
     */
    sendCursor(x, y, nodeId = "") {
      const nextX = Number(x);
      const nextY = Number(y);
      if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) return false;
      const payload = { type: "cursor", x: nextX, y: nextY, nodeId: String(nodeId || "") };
      const now = Date.now();
      if (now - this.lastCursorAt < this.cursorIntervalMs) {
        this.pendingCursor = payload;
        return false;
      }
      this.lastCursorAt = now;
      return this.send(payload);
    }

    /** Sends the position a throttle dropped, so the last move is never lost. */
    flushCursor() {
      if (!this.pendingCursor) return false;
      const payload = this.pendingCursor;
      this.pendingCursor = null;
      this.lastCursorAt = Date.now();
      return this.send(payload);
    }

    setState(state, detail = {}) {
      this.state = state;
      this.handlers.onState(state, detail);
    }

    close() {
      this.closed = true;
      if (this.reconnectTimer) {
        this.clearTimer(this.reconnectTimer);
        this.reconnectTimer = 0;
      }
      const socket = this.socket;
      this.socket = null;
      this.users = [];
      this.pendingCursor = null;
      this.setState("closed");
      try {
        socket?.close?.();
      } catch {
        /* already closed */
      }
    }
  }

  return { CanvasCollabClient, collabEndpoint, CURSOR_TTL_MS };
});
