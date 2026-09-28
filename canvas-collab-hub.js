"use strict";

/**
 * Canvas collaboration hub.
 *
 * One WebSocket room per canvas board, keyed by board id. The hub is the only
 * place that knows who is looking at which board; everything it stores is
 * ephemeral, so a restart costs nothing but a reconnect.
 *
 * Wire contract (mirrors the DX OS canvas collaboration contract, with the
 * board id renamed to match this codebase):
 *
 *   client -> server   { type: "cursor", x, y, nodeId? }
 *                      { type: "ping" }
 *   server -> client   { type: "hello",    clientId, boardId, revision, users }
 *                      { type: "presence", users, revision }
 *                      { type: "cursor",   clientId, userId, username, x, y, nodeId? }
 *                      { type: "patch",    sourceClientId, boardRevision, operations, actor }
 *                      { type: "board",    state, actor }
 *                      { type: "pong" }
 *
 * The hub never trusts a client message to mutate a board: patches are emitted
 * only by the HTTP save route, after the storage layer accepted the batch.
 *
 * No dependency is used for the transport. `ws` is not installed in this
 * project and the runtime must stay installable from a plain copy, so the
 * RFC 6455 server side is implemented here: the handshake, text/continuation
 * frames, the close handshake and the ping/pong control frames. Server frames
 * are never masked and client frames must be, which is what every browser does.
 */

const crypto = require("node:crypto");

const WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const COLLAB_PATH = "/api/canvas/collab";

const MAX_BOARD_ID_LENGTH = 200;
const MAX_CLIENT_ID_LENGTH = 120;
const MAX_MESSAGE_BYTES = 256 * 1024;
const MAX_BUFFER_BYTES = 1024 * 1024;
/* A board patch can carry a node whose media descriptor is long, but an
   oversized room broadcast is worse than a reload: over this limit the room is
   told to refresh instead. */
const MAX_PATCH_BYTES = 2 * 1024 * 1024;
const HEARTBEAT_INTERVAL_MS = 25_000;
const PEER_TIMEOUT_MS = 75_000;
const CURSOR_MESSAGES_PER_SECOND = 60;

const OPCODES = {
  continuation: 0x0,
  text: 0x1,
  binary: 0x2,
  close: 0x8,
  ping: 0x9,
  pong: 0xa,
};
const CLOSE_NORMAL = 1000;
const CLOSE_PROTOCOL_ERROR = 1002;
const CLOSE_MESSAGE_TOO_BIG = 1009;

function websocketAccept(key) {
  return crypto.createHash("sha1").update(`${key}${WEBSOCKET_GUID}`).digest("base64");
}

/* ------------------------------------------------------------------ frames */

function encodeFrame(opcode, payload = Buffer.alloc(0)) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload ?? ""), "utf8");
  const length = body.length;
  let header;
  if (length < 126) {
    header = Buffer.alloc(2);
    header[1] = length;
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  header[0] = 0x80 | opcode;
  return Buffer.concat([header, body]);
}

/**
 * Pulls every complete frame out of `state.buffer`. Returns the decoded frames
 * plus the leftover bytes; `state.failed` marks a protocol violation that the
 * caller must answer with a close frame.
 */
function readFrames(state) {
  const frames = [];
  for (;;) {
    const buffer = state.buffer;
    if (buffer.length < 2) break;
    const first = buffer[0];
    const second = buffer[1];
    const fin = (first & 0x80) !== 0;
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let offset = 2;
    if (length === 126) {
      if (buffer.length < offset + 2) break;
      length = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (buffer.length < offset + 8) break;
      const wide = buffer.readBigUInt64BE(offset);
      if (wide > BigInt(MAX_MESSAGE_BYTES)) {
        state.failed = CLOSE_MESSAGE_TOO_BIG;
        break;
      }
      length = Number(wide);
      offset += 8;
    }
    if (length > MAX_MESSAGE_BYTES) {
      state.failed = CLOSE_MESSAGE_TOO_BIG;
      break;
    }
    if (masked) {
      if (buffer.length < offset + 4) break;
      offset += 4;
    }
    if (buffer.length < offset + length) break;
    const payload = Buffer.allocUnsafe(length);
    buffer.copy(payload, 0, offset, offset + length);
    if (masked) {
      const maskStart = offset - 4;
      for (let index = 0; index < length; index += 1) {
        payload[index] ^= buffer[maskStart + (index % 4)];
      }
    }
    state.buffer = buffer.subarray(offset + length);
    frames.push({ fin, opcode, masked, payload });
    if (state.buffer.length === 0) break;
  }
  return frames;
}

/* -------------------------------------------------------------------- peers */

function normalizeId(value, limit) {
  const text = String(value ?? "").trim();
  if (!text || text.length > limit) return "";
  return text.replace(/[\u0000-\u001f\u007f]/g, "");
}

function publicPeer(peer) {
  return {
    clientId: peer.clientId,
    userId: peer.userId,
    username: peer.username,
    displayName: peer.displayName,
  };
}

function createCanvasCollabHub({
  authorize,
  readBoardRevision = async () => 0,
  now = () => Date.now(),
} = {}) {
  if (typeof authorize !== "function") {
    throw new TypeError("Canvas collaboration hub requires an authorize(request, boardId) function.");
  }

  const rooms = new Map();
  const peers = new Set();
  let heartbeatTimer = 0;
  let closed = false;

  function room(boardId) {
    let set = rooms.get(boardId);
    if (!set) {
      set = new Set();
      rooms.set(boardId, set);
    }
    return set;
  }

  function sendRaw(peer, opcode, payload) {
    if (!peer.alive || peer.socket.destroyed || !peer.socket.writable) return false;
    try {
      peer.socket.write(encodeFrame(opcode, payload));
      return true;
    } catch {
      dropPeer(peer, CLOSE_PROTOCOL_ERROR);
      return false;
    }
  }

  function send(peer, message) {
    return sendRaw(peer, OPCODES.text, Buffer.from(JSON.stringify(message), "utf8"));
  }

  function broadcast(boardId, message, exceptClientId = "") {
    const target = rooms.get(boardId);
    if (!target || target.size === 0) return 0;
    const payload = Buffer.from(JSON.stringify(message), "utf8");
    let delivered = 0;
    for (const peer of target) {
      if (exceptClientId && peer.clientId === exceptClientId) continue;
      if (sendRaw(peer, OPCODES.text, payload)) delivered += 1;
    }
    return delivered;
  }

  function roomUsers(boardId) {
    return [...(rooms.get(boardId) || [])].map(publicPeer);
  }

  async function emitPresence(boardId) {
    const users = roomUsers(boardId);
    if (!users.length) return;
    let revision = 0;
    try {
      revision = Number(await readBoardRevision(boardId)) || 0;
    } catch {
      revision = 0;
    }
    broadcast(boardId, { type: "presence", users, revision });
  }

  function closeSocket(peer, code, reason) {
    if (peer.socket.destroyed || !peer.socket.writable) return;
    const body = Buffer.alloc(2 + Buffer.byteLength(String(reason || ""), "utf8"));
    body.writeUInt16BE(code, 0);
    if (reason) body.write(String(reason), 2, "utf8");
    try {
      peer.socket.write(encodeFrame(OPCODES.close, body));
    } catch {
      /* the socket is already gone */
    }
  }

  function dropPeer(peer, code = CLOSE_NORMAL) {
    if (!peer.alive && !peers.has(peer)) return;
    peer.alive = false;
    peers.delete(peer);
    const target = rooms.get(peer.boardId);
    if (target) {
      target.delete(peer);
      if (!target.size) rooms.delete(peer.boardId);
    }
    closeSocket(peer, code);
    try {
      peer.socket.end();
    } catch {
      /* already closed */
    }
    if (rooms.has(peer.boardId)) void emitPresence(peer.boardId);
  }

  function handleMessage(peer, payload) {
    if (payload.length > MAX_MESSAGE_BYTES) return dropPeer(peer, CLOSE_MESSAGE_TOO_BIG);
    let message;
    try {
      message = JSON.parse(payload.toString("utf8"));
    } catch {
      return;
    }
    if (!message || typeof message !== "object") return;
    if (message.type === "ping") {
      send(peer, { type: "pong" });
      return;
    }
    if (message.type !== "cursor") return;
    // A cursor is advisory: it is dropped rather than closing the socket, so a
    // malformed pointer update can never take a collaborator's session down.
    const x = Number(message.x);
    const y = Number(message.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const stamp = now();
    if (stamp - peer.cursorWindowStartedAt >= 1000) {
      peer.cursorWindowStartedAt = stamp;
      peer.cursorWindowCount = 0;
    }
    peer.cursorWindowCount += 1;
    if (peer.cursorWindowCount > CURSOR_MESSAGES_PER_SECOND) return;
    broadcast(peer.boardId, {
      type: "cursor",
      clientId: peer.clientId,
      userId: peer.userId,
      username: peer.username,
      displayName: peer.displayName,
      x,
      y,
      nodeId: typeof message.nodeId === "string" ? message.nodeId.slice(0, 200) : "",
    }, peer.clientId);
  }

  function attach(peer) {
    const socket = peer.socket;
    socket.setNoDelay?.(true);
    const state = { buffer: Buffer.alloc(0), failed: 0, fragmentOpcode: 0, fragments: [] };
    socket.on("data", (chunk) => {
      if (!peer.alive) return;
      peer.lastSeenAt = now();
      if (state.failed) {
        dropPeer(peer, state.failed);
        return;
      }
      state.buffer = state.buffer.length ? Buffer.concat([state.buffer, chunk]) : chunk;
      if (state.buffer.length > MAX_BUFFER_BYTES) {
        dropPeer(peer, CLOSE_MESSAGE_TOO_BIG);
        return;
      }
      for (const frame of readFrames(state)) {
        if (state.failed) {
          dropPeer(peer, state.failed);
          return;
        }
        if (!frame.masked) return dropPeer(peer, CLOSE_PROTOCOL_ERROR);
        if (frame.opcode === OPCODES.close) return dropPeer(peer, CLOSE_NORMAL);
        if (frame.opcode === OPCODES.ping) {
          sendRaw(peer, OPCODES.pong, frame.payload);
          continue;
        }
        if (frame.opcode === OPCODES.pong) continue;
        if (frame.opcode === OPCODES.binary) return dropPeer(peer, CLOSE_PROTOCOL_ERROR);
        if (frame.opcode === OPCODES.text) {
          state.fragmentOpcode = OPCODES.text;
          state.fragments = [frame.payload];
        } else if (frame.opcode === OPCODES.continuation) {
          if (state.fragmentOpcode !== OPCODES.text) return dropPeer(peer, CLOSE_PROTOCOL_ERROR);
          state.fragments.push(frame.payload);
        } else {
          return dropPeer(peer, CLOSE_PROTOCOL_ERROR);
        }
        const total = state.fragments.reduce((sum, part) => sum + part.length, 0);
        if (total > MAX_MESSAGE_BYTES) return dropPeer(peer, CLOSE_MESSAGE_TOO_BIG);
        if (!frame.fin) continue;
        const message = Buffer.concat(state.fragments);
        state.fragments = [];
        state.fragmentOpcode = 0;
        handleMessage(peer, message);
        if (!peer.alive) return;
      }
    });
    const finish = () => {
      if (!peers.has(peer)) return;
      peer.alive = false;
      peers.delete(peer);
      const target = rooms.get(peer.boardId);
      if (target) {
        target.delete(peer);
        if (!target.size) rooms.delete(peer.boardId);
      }
      if (rooms.has(peer.boardId)) void emitPresence(peer.boardId);
    };
    socket.on("close", finish);
    socket.on("end", finish);
    socket.on("error", finish);
  }

  function startHeartbeat() {
    if (heartbeatTimer || closed) return;
    heartbeatTimer = setInterval(() => {
      const stamp = now();
      for (const peer of [...peers]) {
        if (stamp - peer.lastSeenAt > PEER_TIMEOUT_MS) {
          dropPeer(peer, CLOSE_NORMAL);
          continue;
        }
        send(peer, { type: "ping" });
      }
    }, HEARTBEAT_INTERVAL_MS);
    heartbeatTimer.unref?.();
  }

  function handleUpgrade(request, socket, head) {
    let url;
    try {
      url = new URL(request.url || "/", "http://localhost");
    } catch {
      socket.destroy();
      return false;
    }
    if (url.pathname !== COLLAB_PATH) return false;

    const boardId = normalizeId(url.searchParams.get("boardId"), MAX_BOARD_ID_LENGTH);
    const clientId = normalizeId(url.searchParams.get("clientId"), MAX_CLIENT_ID_LENGTH);
    const key = String(request.headers?.["sec-websocket-key"] || "");
    const upgradeHeader = String(request.headers?.upgrade || "").toLowerCase();
    if (upgradeHeader !== "websocket" || !key) {
      socket.destroy();
      return true;
    }
    if (!boardId || !clientId) {
      respondAndDestroy(socket, 400, "Bad Request", "collaboration requires boardId and clientId");
      return true;
    }

    const settle = (result) => {
      if (socket.destroyed) return;
      if (!result?.user) return respondAndDestroy(socket, 403, "Forbidden", "canvas is not shared with this account");
      const accept = websocketAccept(key);
      try {
        socket.write([
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${accept}`,
          "",
          "",
        ].join("\r\n"));
      } catch {
        socket.destroy();
        return;
      }
      if (head?.length) socket.unshift(head);
      const peer = {
        socket,
        boardId,
        clientId,
        userId: String(result.user.id || ""),
        username: String(result.user.username || ""),
        displayName: String(result.user.displayName || result.user.username || ""),
        alive: true,
        lastSeenAt: now(),
        cursorWindowStartedAt: 0,
        cursorWindowCount: 0,
      };
      peers.add(peer);
      room(boardId).add(peer);
      attach(peer);
      send(peer, {
        type: "hello",
        clientId,
        boardId,
        users: roomUsers(boardId),
      });
      void emitPresence(boardId);
      startHeartbeat();
    };

    let pending;
    try {
      pending = authorize(request, boardId);
    } catch {
      respondAndDestroy(socket, 403, "Forbidden", "canvas access denied");
      return true;
    }
    Promise.resolve(pending).then(settle, () => {
      respondAndDestroy(socket, 403, "Forbidden", "canvas access denied");
    });
    return true;
  }

  function broadcastPatch(boardId, payload, sourceClientId = "") {
    const message = { type: "patch", sourceClientId, ...payload };
    const size = Buffer.byteLength(JSON.stringify(message), "utf8");
    if (size > MAX_PATCH_BYTES) {
      broadcast(boardId, { type: "board", state: "refresh", actor: payload?.actor || null });
      return 0;
    }
    return broadcast(boardId, message, sourceClientId);
  }

  function broadcastBoardState(boardId, state, actor = null) {
    return broadcast(boardId, { type: "board", state: String(state || ""), actor });
  }

  function boardPeerCount(boardId) {
    return (rooms.get(boardId) || new Set()).size;
  }

  function stats() {
    return {
      rooms: rooms.size,
      peers: peers.size,
      boards: [...rooms.keys()],
    };
  }

  function close() {
    closed = true;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = 0;
    for (const peer of [...peers]) dropPeer(peer, CLOSE_NORMAL);
    rooms.clear();
  }

  return {
    handleUpgrade,
    broadcastPatch,
    broadcastBoardState,
    boardPeerCount,
    stats,
    close,
  };
}

function respondAndDestroy(socket, status, reason, detail) {
  if (socket.destroyed) return;
  const body = String(detail || reason || "");
  try {
    socket.write([
      `HTTP/1.1 ${status} ${reason}`,
      "Content-Type: text/plain; charset=utf-8",
      `Content-Length: ${Buffer.byteLength(body, "utf8")}`,
      "Connection: close",
      "",
      body,
    ].join("\r\n"));
  } catch {
    /* the socket is already gone */
  }
  socket.destroy();
}

module.exports = {
  COLLAB_PATH,
  createCanvasCollabHub,
  encodeFrame,
  readFrames,
  websocketAccept,
};
