"use strict";

/**
 * Canvas collaboration client checks.
 *
 * The client owns the two things a browser cannot be asked about reliably in a
 * test: message routing and reconnect behaviour. Both are exercised here with a
 * scripted socket and a scripted clock, so a cursor that echoes back to its own
 * author or a socket that never comes back is caught without a browser.
 */

const assert = require("node:assert/strict");
const path = require("node:path");

const { CanvasCollabClient, collabEndpoint, CURSOR_TTL_MS } = require(path.resolve(__dirname, "..", "canvas-collab-client.js"));

function createClock() {
  let now = 0;
  let handle = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout: (fn, ms) => {
      handle += 1;
      timers.set(handle, { fn, at: now + Math.max(0, Number(ms) || 0) });
      return handle;
    },
    clearTimeout: (target) => timers.delete(target),
    pending: () => timers.size,
    advance: (ms) => {
      const target = now + ms;
      for (;;) {
        let next = null;
        for (const [key, timer] of timers) {
          if (timer.at > target) continue;
          if (!next || timer.at < next.timer.at) next = { key, timer };
        }
        if (!next) break;
        timers.delete(next.key);
        now = next.timer.at;
        next.timer.fn();
      }
      now = target;
    },
  };
}

class FakeSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this.listeners = new Map();
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }

  emit(type, event) {
    for (const handler of [...(this.listeners.get(type) || [])]) handler(event);
  }

  open() {
    this.readyState = 1;
    this.emit("open", {});
  }

  send(data) {
    this.sent.push(JSON.parse(String(data)));
  }

  close() {
    this.readyState = 3;
    this.emit("close", {});
  }

  /** Simulates the server dropping the connection without the client asking. */
  drop() {
    this.readyState = 3;
    this.emit("close", {});
  }

  deliver(message) {
    this.emit("message", { data: JSON.stringify(message) });
  }
}

function createHarness(options = {}) {
  const clock = createClock();
  const sockets = [];
  const events = { users: [], cursors: [], patches: [], boards: [], states: [] };
  const client = new CanvasCollabClient({
    boardId: "board-1",
    clientId: "client-self",
    location: { protocol: "http:", host: "lan.test:3099" },
    setTimer: clock.setTimeout,
    clearTimer: clock.clearTimeout,
    makeSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    onUsers: (users, info) => events.users.push({ users, info }),
    onCursor: (cursor) => events.cursors.push(cursor),
    onPatch: (message) => events.patches.push(message),
    onBoard: (message) => events.boards.push(message),
    onState: (state) => events.states.push(state),
    ...options,
  });
  return { client, clock, sockets, events, socket: () => sockets.at(-1) };
}

async function run() {
  const failures = [];
  async function check(name, fn) {
    try {
      await fn();
      console.log(`PASS ${name}`);
    } catch (error) {
      failures.push(name);
      console.error(`FAIL ${name}: ${error.message}`);
    }
  }

  await check("the collaboration endpoint follows the page scheme", () => {
    assert.equal(
      collabEndpoint("board 1", "client/1", { protocol: "http:", host: "192.168.1.9:3099" }),
      "ws://192.168.1.9:3099/api/canvas/collab?boardId=board%201&clientId=client%2F1",
    );
    assert.match(collabEndpoint("b", "c", { protocol: "https:", host: "lan.test" }), /^wss:\/\/lan\.test\/api\/canvas\/collab\?/);
  });

  await check("opening connects once and reports the connection state", () => {
    const { client, sockets, events } = createHarness();
    client.open();
    assert.equal(sockets.length, 1);
    assert.deepEqual(events.states, ["connecting"]);
    sockets[0].open();
    assert.deepEqual(events.states, ["connecting", "open"]);
    client.close();
  });

  await check("presence hides this client and publishes the other members", () => {
    const { client, socket, events } = createHarness();
    client.open();
    socket().open();
    socket().deliver({
      type: "presence",
      revision: 12,
      users: [
        { clientId: "client-self", userId: "me", username: "me" },
        { clientId: "client-peer", userId: "peer", username: "peer", displayName: "对方" },
      ],
    });
    assert.equal(events.users.length, 1);
    assert.deepEqual(events.users[0].users.map((user) => user.username), ["peer"]);
    assert.equal(events.users[0].info.revision, 12);
    client.close();
  });

  await check("a cursor from another account is delivered and one from this client is not", () => {
    const { client, socket, events } = createHarness();
    client.open();
    socket().open();
    socket().deliver({ type: "cursor", clientId: "client-self", x: 1, y: 2 });
    assert.equal(events.cursors.length, 0, "a client never renders its own cursor");
    socket().deliver({ type: "cursor", clientId: "client-peer", userId: "peer", displayName: "对方", x: 30, y: -4, nodeId: "n1" });
    assert.equal(events.cursors.length, 1);
    assert.deepEqual(
      { ...events.cursors[0], seenAt: undefined },
      { clientId: "client-peer", userId: "peer", username: "", displayName: "对方", x: 30, y: -4, nodeId: "n1", seenAt: undefined },
    );
    assert.ok(Number.isFinite(events.cursors[0].seenAt));
    client.close();
  });

  await check("an accepted batch from another account is applied and this client's own batch is not", () => {
    const { client, socket, events } = createHarness();
    client.open();
    socket().open();
    socket().deliver({ type: "patch", sourceClientId: "client-self", boardRevision: 4, operations: [] });
    assert.equal(events.patches.length, 0, "the author already applied its own batch");
    socket().deliver({ type: "patch", sourceClientId: "client-peer", boardRevision: 5, operations: [{ type: "node.upsert", entityId: "n1" }] });
    assert.equal(events.patches.length, 1);
    assert.equal(events.patches[0].boardRevision, 5);
    client.close();
  });

  await check("a server ping is answered with a pong and a board notice reaches the host", () => {
    const { client, socket, events } = createHarness();
    client.open();
    socket().open();
    socket().deliver({ type: "ping" });
    assert.deepEqual(socket().sent, [{ type: "pong" }]);
    socket().deliver({ type: "board", state: "refresh", actor: { displayName: "对方" } });
    assert.equal(events.boards.length, 1);
    assert.equal(events.boards[0].state, "refresh");
    client.close();
  });

  await check("cursor moves are throttled and the newest position still arrives", () => {
    const { client, socket } = createHarness({ cursorIntervalMs: 40 });
    client.open();
    socket().open();
    assert.equal(client.sendCursor(10, 10), true, "the first move is sent immediately");
    assert.equal(client.sendCursor(20, 20), false, "a move inside the interval is held");
    assert.equal(client.sendCursor(30, 30), false, "the newest held move replaces the previous one");
    assert.deepEqual(socket().sent, [{ type: "cursor", x: 10, y: 10, nodeId: "" }]);
    client.flushCursor();
    assert.deepEqual(socket().sent.at(-1), { type: "cursor", x: 30, y: 30, nodeId: "" }, "the held move is the last position, not the first");
    client.close();
  });

  await check("a dropped socket reconnects with a growing delay and resets after opening", () => {
    const { client, clock, sockets } = createHarness({ reconnectDelayMs: 1200, maxReconnectDelayMs: 15000 });
    client.open();
    sockets[0].open();
    sockets[0].drop();
    assert.equal(clock.pending(), 1, "a drop schedules a reconnect");
    clock.advance(1199);
    assert.equal(sockets.length, 1, "the reconnect waits for its delay");
    clock.advance(2);
    assert.equal(sockets.length, 2);
    sockets[1].drop();
    clock.advance(1200);
    assert.equal(sockets.length, 2, "the second attempt waits longer");
    clock.advance(1200);
    assert.equal(sockets.length, 3);
    sockets[2].open();
    sockets[2].drop();
    clock.advance(1200);
    assert.equal(sockets.length, 4, "opening a socket resets the backoff");
    client.close();
  });

  await check("closing stops the socket and never reconnects", () => {
    const { client, clock, sockets, events } = createHarness();
    client.open();
    sockets[0].open();
    client.close();
    assert.equal(clock.pending(), 0);
    clock.advance(60000);
    assert.equal(sockets.length, 1);
    assert.equal(events.states.at(-1), "closed");
  });

  await check("a socket that cannot be created reports a failure and keeps retrying", () => {
    const clock = createClock();
    const states = [];
    let attempts = 0;
    const client = new CanvasCollabClient({
      boardId: "board-1",
      clientId: "client-self",
      setTimer: clock.setTimeout,
      clearTimer: clock.clearTimeout,
      makeSocket: () => {
        attempts += 1;
        if (attempts === 1) throw new Error("offline");
        return new FakeSocket("ws://lan.test/api/canvas/collab");
      },
      onState: (state) => states.push(state),
    });
    client.open();
    assert.deepEqual(states, ["failed"]);
    assert.equal(clock.pending(), 1);
    clock.advance(1200);
    assert.equal(attempts, 2, "a failed connection is retried instead of giving up");
    client.close();
  });

  await check("a message that is not JSON is ignored instead of throwing", () => {
    const { client, socket } = createHarness();
    client.open();
    socket().open();
    assert.equal(client.ingest("<html>not json</html>"), null);
    assert.equal(client.ingest(JSON.stringify({ type: "unknown" })).type, "unknown");
    client.close();
  });

  await check("the cursor expiry window is published for the renderer", () => {
    assert.equal(CURSOR_TTL_MS, 6000);
    assert.equal(Number.isFinite(CURSOR_TTL_MS), true);
  });

  if (failures.length) {
    console.error(`Canvas collaboration client checks failed: ${failures.join(", ")}`);
    process.exit(1);
  }
  console.log("Canvas collaboration client checks passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
