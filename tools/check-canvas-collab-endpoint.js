"use strict";

/**
 * Canvas collaboration end-to-end checks against a real server.
 *
 * The hub test proves the room semantics and the client test proves the routing;
 * this one proves the wiring between them: a signed-in account opens the socket
 * with its session cookie, another account saves through the ordinary canvas
 * HTTP route, and the saved batch comes out of the socket. Authorization is
 * checked from the same angle the browser will see it.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");

async function run() {
  const probe = http.createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "aios-canvas-collab-"));
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: ROOT,
    stdio: "ignore",
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      AI_OS_SKIP_ENV_FILE: "1",
      AI_OS_AUTH_DISABLED: "0",
      AI_OS_DATA_DIR: dataDir,
      AI_OS_SYSTEM_DB_FILE: path.join(dataDir, "system.sqlite"),
      AI_OS_OUTPUT_DIR: path.join(dataDir, "output"),
      OUTBOUND_NO_PROXY: "127.0.0.1,localhost",
      CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false",
      CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false",
    },
  });
  const origin = `http://127.0.0.1:${port}`;
  const sockets = [];

  async function request(url, cookie = "", body, headers = {}, method = body === undefined ? "GET" : "POST") {
    const response = await fetch(new URL(url, origin), {
      method,
      headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    let data;
    try {
      data = JSON.parse(bytes.toString());
    } catch {
      data = null;
    }
    return { status: response.status, data, cookie: response.headers.get("set-cookie")?.split(";", 1)[0] };
  }

  function socketUrl(boardId, clientId) {
    return `${origin.replace(/^http/, "ws")}/api/canvas/collab?boardId=${encodeURIComponent(boardId)}&clientId=${encodeURIComponent(clientId)}`;
  }

  /** Opens a collaboration socket the way a browser would: cookies, not tokens. */
  async function openSocket({ boardId, clientId, cookie }) {
    const socket = new WebSocket(socketUrl(boardId, clientId), cookie ? { headers: { cookie } } : undefined);
    const inbox = [];
    let readIndex = 0;
    socket.addEventListener("message", (event) => inbox.push(JSON.parse(String(event.data))));
    const closed = new Promise((resolve) => {
      socket.addEventListener("close", () => resolve("close"));
      socket.addEventListener("error", () => resolve("error"));
    });
    const opened = new Promise((resolve) => {
      socket.addEventListener("open", () => resolve("open"));
      socket.addEventListener("error", () => resolve("error"));
      socket.addEventListener("close", () => resolve("close"));
      setTimeout(() => resolve("timeout"), 5000).unref?.();
    });
    const client = {
      socket,
      inbox,
      closed,
      outcome: opened,
      readIndex: 0,
      send: (message) => socket.send(JSON.stringify(message)),
      next: (type, options = {}) => waitFor(client, type, options),
      close: () => socket.close(),
    };
    sockets.push(client);
    return client;
  }

  async function waitFor(client, type, { where = () => true, timeoutMs = 6000 } = {}) {
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
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

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

  try {
    let ready = false;
    for (let index = 0; index < 160; index += 1) {
      try {
        if ((await request("/api/auth/session")).status === 401) {
          ready = true;
          break;
        }
      } catch {
        /* the server is still starting */
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(ready, "isolated server starts");
    assert.equal((await request("/api/auth/bootstrap", "", { username: "collab-admin", password: "collab-admin-password" })).status, 201);
    const admin = (await request("/api/auth/login", "", { username: "collab-admin", password: "collab-admin-password" })).cookie;

    const createdEditor = await request("/api/admin/users", admin, { username: "collab-editor", password: "collab-editor-temp" });
    assert.equal(createdEditor.status, 201);
    const editor = (await request("/api/auth/login", "", { username: "collab-editor", password: "collab-editor-temp" })).cookie;
    assert.equal((await request("/api/auth/change-password", editor, { currentPassword: "collab-editor-temp", newPassword: "collab-editor-password" })).status, 200);
    const editorSession = (await request("/api/auth/login", "", { username: "collab-editor", password: "collab-editor-password" })).cookie;

    const createdStranger = await request("/api/admin/users", admin, { username: "collab-stranger", password: "collab-stranger-temp" });
    assert.equal(createdStranger.status, 201);
    const stranger = (await request("/api/auth/login", "", { username: "collab-stranger", password: "collab-stranger-temp" })).cookie;
    assert.equal((await request("/api/auth/change-password", stranger, { currentPassword: "collab-stranger-temp", newPassword: "collab-stranger-password" })).status, 200);
    const strangerSession = (await request("/api/auth/login", "", { username: "collab-stranger", password: "collab-stranger-password" })).cookie;

    assert.equal((await request("/api/canvas/boards", admin, { id: "collab-board", title: "协同画布" })).status, 201);
    const seeded = await request("/api/canvas/boards/collab-board/operations", admin, {
      baseRevision: 0,
      operations: [{ operationId: "seed-node", type: "node.upsert", entityId: "seed", after: { id: "seed", kind: "text", x: 0, y: 0, width: 240, height: 160, text: "初始节点" } }],
    });
    assert.equal(seeded.status, 200, JSON.stringify(seeded.data));
    const seedRevision = seeded.data.boardRevision;

    const resources = (await request("/api/resources?type=canvas", admin)).data.resources;
    const resourceId = resources.find((item) => item.resource.refId === "collab-board").resource.id;
    const share = await request(`/api/resources/${resourceId}/shares`, admin, {
      visibility: "users",
      permission: "edit",
      userIds: [createdEditor.data.user.id],
    });
    assert.equal(share.status, 201, JSON.stringify(share.data));

    await check("a shared account joins the room and sees the board revision", async () => {
      const editorSocket = await openSocket({ boardId: "collab-board", clientId: "client-editor", cookie: editorSession });
      assert.equal(await editorSocket.outcome, "open");
      const hello = await editorSocket.next("hello");
      assert.equal(hello.clientId, "client-editor");
      assert.deepEqual(hello.users.map((user) => user.username), ["collab-editor"]);
      const presence = await editorSocket.next("presence");
      assert.equal(presence.revision, seedRevision, "joining tells the room how far the board has advanced");
    });

    await check("a batch saved over HTTP reaches the other account's socket", async () => {
      const editorSocket = sockets[0];
      const adminSocket = await openSocket({ boardId: "collab-board", clientId: "client-admin", cookie: admin });
      assert.equal(await adminSocket.outcome, "open");
      await adminSocket.next("hello");
      const presence = await editorSocket.next("presence", { where: (message) => message.users.length === 2 });
      assert.deepEqual(presence.users.map((user) => user.username).sort(), ["collab-admin", "collab-editor"]);

      const saved = await request("/api/canvas/boards/collab-board/operations", admin, {
        baseRevision: seedRevision,
        clientId: "client-admin",
        operations: [{ operationId: "admin-node", type: "node.upsert", entityId: "admin-node", after: { id: "admin-node", kind: "text", x: 400, y: 120, width: 240, height: 160, text: "管理员写入" } }],
      });
      assert.equal(saved.status, 200, JSON.stringify(saved.data));

      const patch = await editorSocket.next("patch");
      assert.equal(patch.sourceClientId, "client-admin");
      assert.equal(patch.boardRevision, saved.data.boardRevision);
      assert.equal(patch.actor.username, "collab-admin");
      assert.deepEqual(patch.operations.map((operation) => operation.entityId), ["admin-node"]);
      assert.equal(patch.operations[0].after.text, "管理员写入");
      assert.equal(patch.operations[0].before, undefined, "the previous payload is not shipped to the room");
      assert.equal(adminSocket.inbox.filter((message) => message.type === "patch").length, 0, "the author is not sent its own batch");
    });

    await check("a per-client viewport patch is never relayed", async () => {
      const editorSocket = sockets[0];
      const adminSocket = sockets[1];
      const revision = (await request("/api/canvas/boards/collab-board/meta", admin)).data.revision;
      const saved = await request("/api/canvas/boards/collab-board/operations", admin, {
        baseRevision: revision,
        clientId: "client-admin",
        operations: [{ operationId: "admin-viewport", type: "board.patch", entityId: "collab-board", after: { viewport: { x: -900, y: -700, scale: 0.4 } } }],
      });
      assert.equal(saved.status, 200, JSON.stringify(saved.data));
      const patch = await editorSocket.next("patch", { where: (message) => message.boardRevision === saved.data.boardRevision, timeoutMs: 2500 }).catch(() => null);
      assert.ok(patch, "the batch itself is still announced so revisions stay in step");
      assert.deepEqual(patch.operations, [], "moving your own camera must not move a collaborator's");
      assert.equal(adminSocket.inbox.filter((message) => message.type === "patch").length, 0);
    });

    await check("cursors relay between the two accounts and never echo back", async () => {
      const editorSocket = sockets[0];
      const adminSocket = sockets[1];
      editorSocket.send({ type: "cursor", x: 42.5, y: -18, nodeId: "seed" });
      const cursor = await adminSocket.next("cursor");
      assert.equal(cursor.clientId, "client-editor");
      assert.equal(cursor.username, "collab-editor");
      assert.equal(cursor.x, 42.5);
      assert.equal(cursor.nodeId, "seed");
      assert.equal(editorSocket.inbox.filter((message) => message.type === "cursor").length, 0);
    });

    await check("presence disappears when an account leaves", async () => {
      const adminSocket = sockets[1];
      const editorSocket = sockets[0];
      editorSocket.close();
      assert.equal(await editorSocket.closed, "close");
      const presence = await adminSocket.next("presence", {
        where: (message) => message.users.every((user) => user.username !== "collab-editor"),
      });
      assert.deepEqual(presence.users.map((user) => user.username), ["collab-admin"]);
    });

    await check("an account without access to the canvas is refused a socket", async () => {
      const refused = await openSocket({ boardId: "collab-board", clientId: "client-stranger", cookie: strangerSession });
      assert.notEqual(await refused.outcome, "open");
    });

    await check("a signed-out socket is refused and a non-canvas upgrade is closed", async () => {
      const anonymous = await openSocket({ boardId: "collab-board", clientId: "client-anon" });
      assert.notEqual(await anonymous.outcome, "open");
      const other = await new Promise((resolve) => {
        const socket = new WebSocket(`${origin.replace(/^http/, "ws")}/api/other?boardId=collab-board`, { headers: { cookie: admin } });
        socket.addEventListener("open", () => resolve("open"));
        socket.addEventListener("error", () => resolve("error"));
        socket.addEventListener("close", () => resolve("close"));
        setTimeout(() => resolve("timeout"), 3000).unref?.();
      });
      assert.notEqual(other, "open");
    });

    await check("trashing and restoring a canvas reach the room", async () => {
      const adminSocket = sockets[1];
      const meta = await request("/api/canvas/boards/collab-board/meta", admin);
      const trashed = await request("/api/canvas/boards/collab-board/trash", admin, { operationId: "trash-1", baseRevision: meta.data.revision });
      assert.equal(trashed.status, 200, JSON.stringify(trashed.data));
      const notice = await adminSocket.next("board");
      assert.equal(notice.state, "trashed");
      assert.equal(notice.actor.username, "collab-admin");
      const restored = await request("/api/canvas/boards/collab-board/restore", admin, { operationId: "restore-1" });
      assert.equal(restored.status, 200, JSON.stringify(restored.data));
      const broadcast = await adminSocket.next("board");
      assert.equal(broadcast.state, "restored");
    });

    assert.deepEqual(failures, [], "canvas collaboration endpoint regressions");
  } finally {
    for (const client of sockets) {
      try {
        client.close();
      } catch {
        /* the socket already closed */
      }
    }
    if (child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
    assert.ok(path.resolve(dataDir).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }

  console.log("Canvas collaboration endpoint checks passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
