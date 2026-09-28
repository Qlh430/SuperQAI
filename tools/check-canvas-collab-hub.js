"use strict";

/**
 * Canvas collaboration hub checks.
 *
 * Runs a real http server with the hub attached and talks to it with the
 * runtime's own WebSocket client, so the RFC 6455 framing, the handshake and
 * the room semantics are all exercised end to end without a browser.
 */

const assert = require("node:assert/strict");
const http = require("node:http");
const { createCanvasCollabHub, COLLAB_PATH } = require("../canvas-collab-hub");

const USERS = new Map([
  ["token-a", { id: "user-a", username: "alice", displayName: "爱丽丝" }],
  ["token-b", { id: "user-b", username: "bob", displayName: "鲍勃" }],
]);
const SHARES = {
  "board-1": new Set(["user-a", "user-b"]),
  "board-2": new Set(["user-a"]),
};

function userFromRequest(request) {
  const url = new URL(request.url || "/", "http://localhost");
  return USERS.get(url.searchParams.get("token") || "") || null;
}

async function openClient(origin, { boardId, clientId, token }) {
  const url = `${origin.replace(/^http/, "ws")}${COLLAB_PATH}?boardId=${encodeURIComponent(boardId)}&clientId=${encodeURIComponent(clientId)}&token=${encodeURIComponent(token)}`;
  const socket = new WebSocket(url);
  const inbox = [];
  let cursor = 0;
  socket.addEventListener("message", (event) => {
    inbox.push(JSON.parse(String(event.data)));
  });
  const closed = new Promise((resolve) => {
    socket.addEventListener("close", () => resolve());
    socket.addEventListener("error", () => resolve());
  });
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", () => resolve());
    socket.addEventListener("error", () => reject(new Error("collaboration socket was refused")));
  });
  const client = {
    socket,
    inbox,
    closed,
    readIndex: 0,
    send: (message) => socket.send(JSON.stringify(message)),
    next: (type, options = {}) => waitFor(client, type, options),
    close: () => socket.close(),
  };
  return client;
}

/**
 * Reads the next unconsumed message of `type` (optionally matching `where`).
 * Messages are consumed in order so a test cannot accidentally re-read the
 * presence that was emitted before the state it is waiting for.
 */
async function waitFor(client, type, { where = () => true, timeoutMs = 4000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    for (let index = client.readIndex; index < client.inbox.length; index += 1) {
      const message = client.inbox[index];
      if (message.type !== type || !where(message)) continue;
      client.readIndex = index + 1;
      return message;
    }
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for a ${type} message; saw ${JSON.stringify(client.inbox)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function expectRefused(origin, { boardId, clientId, token }) {
  const url = `${origin.replace(/^http/, "ws")}${COLLAB_PATH}?boardId=${encodeURIComponent(boardId)}&clientId=${encodeURIComponent(clientId)}&token=${encodeURIComponent(token)}`;
  const socket = new WebSocket(url);
  const outcome = await new Promise((resolve) => {
    socket.addEventListener("open", () => resolve("open"));
    socket.addEventListener("error", () => resolve("error"));
    socket.addEventListener("close", () => resolve("close"));
    setTimeout(() => resolve("timeout"), 3000).unref?.();
  });
  assert.notEqual(outcome, "open", "a refused collaboration socket must not open");
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

  const revisions = new Map([["board-1", 7]]);
  const hub = createCanvasCollabHub({
    readBoardRevision: async (boardId) => revisions.get(boardId) || 0,
    authorize: async (request, boardId) => {
      const user = userFromRequest(request);
      if (!user) return null;
      if (!SHARES[boardId]?.has(user.id)) return null;
      return { user };
    },
  });

  const server = http.createServer((req, res) => {
    res.writeHead(404).end();
  });
  server.on("upgrade", (request, socket, head) => {
    if (hub.handleUpgrade(request, socket, head)) return;
    socket.destroy();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const open = [];
  const connect = async (...args) => {
    const client = await openClient(origin, ...args);
    open.push(client);
    return client;
  };

  try {
    await check("a collaborator joins its room and sees only the other members", async () => {
      const alice = await connect({ boardId: "board-1", clientId: "client-a", token: "token-a" });
      const hello = await alice.next("hello");
      assert.equal(hello.clientId, "client-a");
      assert.deepEqual(hello.users.map((user) => user.username), ["alice"]);

      const bob = await connect({ boardId: "board-1", clientId: "client-b", token: "token-b" });
      const presence = await alice.next("presence", {
        where: (message) => message.users.some((user) => user.username === "bob"),
      });
      assert.deepEqual(presence.users.map((user) => user.username).sort(), ["alice", "bob"]);
      assert.equal(presence.revision, 7, "joining tells the room how far the board has advanced");
      assert.deepEqual(
        (await bob.next("hello")).users.map((user) => user.username).sort(),
        ["alice", "bob"],
      );
      assert.equal(hub.boardPeerCount("board-1"), 2);
    });

    await check("cursors relay to the other clients and never echo back", async () => {
      const [alice, bob] = open;
      bob.send({ type: "cursor", x: 120.5, y: -40, nodeId: "node-9" });
      const cursor = await alice.next("cursor");
      assert.equal(cursor.clientId, "client-b");
      assert.equal(cursor.displayName, "鲍勃");
      assert.equal(cursor.x, 120.5);
      assert.equal(cursor.y, -40);
      assert.equal(cursor.nodeId, "node-9");
      assert.equal(bob.inbox.filter((message) => message.type === "cursor").length, 0, "a client never sees its own cursor");
    });

    await check("a board patch reaches the room except its author", async () => {
      const [alice, bob] = open;
      const delivered = hub.broadcastPatch("board-1", {
        boardRevision: 8,
        operations: [{ operationId: "op-1", type: "node.upsert", entityId: "node-9", after: { id: "node-9", x: 1, y: 2 } }],
        actor: { id: "user-b", username: "bob", displayName: "鲍勃" },
      }, "client-b");
      assert.equal(delivered, 1);
      const patch = await alice.next("patch");
      assert.equal(patch.sourceClientId, "client-b");
      assert.equal(patch.boardRevision, 8);
      assert.equal(patch.operations.length, 1);
      assert.equal(patch.actor.displayName, "鲍勃");
      assert.equal(bob.inbox.filter((message) => message.type === "patch").length, 0);
    });

    await check("an oversized patch asks the room to reload instead of flooding it", async () => {
      const [alice] = open;
      const huge = "x".repeat(2 * 1024 * 1024 + 64);
      hub.broadcastPatch("board-1", {
        boardRevision: 9,
        operations: [{ operationId: "op-2", type: "node.upsert", entityId: "node-10", after: { id: "node-10", text: huge } }],
      }, "client-b");
      const notice = await alice.next("board");
      assert.equal(notice.state, "refresh");
    });

    await check("a leaving client drops out of the presence list", async () => {
      const [, bob] = open;
      const alice = open[0];
      alice.close();
      await alice.closed;
      const presence = await bob.next("presence", {
        where: (message) => message.users.every((user) => user.username !== "alice"),
        timeoutMs: 5000,
      });
      assert.deepEqual(presence.users.map((user) => user.username), ["bob"]);
    });

    await check("board state notices reach the room", async () => {
      const [, bob] = open;
      hub.broadcastBoardState("board-1", "trashed", { displayName: "爱丽丝" });
      const notice = await bob.next("board");
      assert.equal(notice.state, "trashed");
    });

    await check("a board an account cannot read has no room", async () => {
      await expectRefused(origin, { boardId: "board-2", clientId: "client-b", token: "token-b" });
      assert.equal(hub.boardPeerCount("board-2"), 0);
    });

    await check("an unknown session or board is refused", async () => {
      await expectRefused(origin, { boardId: "board-1", clientId: "client-x", token: "token-x" });
      await expectRefused(origin, { boardId: "board-missing", clientId: "client-a", token: "token-a" });
    });

    await check("the hub only claims its own upgrade path", async () => {
      const upgrade = await new Promise((resolve) => {
        const socket = new WebSocket(`${origin.replace(/^http/, "ws")}/api/other?boardId=board-1&clientId=x`);
        socket.addEventListener("open", () => resolve("open"));
        socket.addEventListener("error", () => resolve("error"));
        socket.addEventListener("close", () => resolve("close"));
        setTimeout(() => resolve("timeout"), 2000).unref?.();
      });
      assert.notEqual(upgrade, "open");
    });

    await check("a cursor flood is throttled instead of disconnecting the peer", async () => {
      const bob = open[1];
      const before = bob.inbox.length;
      for (let index = 0; index < 400; index += 1) bob.send({ type: "cursor", x: index, y: index });
      await new Promise((resolve) => setTimeout(resolve, 250));
      assert.equal(bob.socket.readyState, 1, "the peer stays connected");
      assert.equal(hub.boardPeerCount("board-1"), 1);
      assert.equal(bob.inbox.length, before, "the hub does not echo cursors back to their author");
    });
  } finally {
    for (const client of open) client.close();
    hub.close();
    await new Promise((resolve) => server.close(resolve));
  }

  if (failures.length) {
    console.error(`Canvas collaboration hub checks failed: ${failures.join(", ")}`);
    process.exit(1);
  }
  console.log("Canvas collaboration hub checks passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
