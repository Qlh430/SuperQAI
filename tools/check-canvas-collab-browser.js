"use strict";

/**
 * Canvas collaboration browser checks.
 *
 * The point of the feature is that two accounts looking at the same shared
 * canvas see each other. This drives two real Chrome profiles with two real
 * sessions, opens the same shared board in both, and asserts on what each
 * account renders: the other account's presence, its live cursor, and the nodes
 * it creates — all without either page reloading.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const BOARD_TITLE = "协同画布验证";

async function run() {
  const probe = http.createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "aios-canvas-collab-browser-"));
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

  async function request(url, cookie = "", body) {
    const response = await fetch(new URL(url, origin), {
      method: body === undefined ? "GET" : "POST",
      headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) },
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

  let browser = null;
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
    assert.equal((await request("/api/auth/bootstrap", "", { username: "collab-host", password: "collab-host-password" })).status, 201);
    const host = (await request("/api/auth/login", "", { username: "collab-host", password: "collab-host-password" })).cookie;
    const guestCreated = await request("/api/admin/users", host, { username: "collab-guest", password: "collab-guest-temp" });
    assert.equal(guestCreated.status, 201);
    const guest = (await request("/api/auth/login", "", { username: "collab-guest", password: "collab-guest-temp" })).cookie;
    assert.equal((await request("/api/auth/change-password", guest, { currentPassword: "collab-guest-temp", newPassword: "collab-guest-password" })).status, 200);
    const guestSession = (await request("/api/auth/login", "", { username: "collab-guest", password: "collab-guest-password" })).cookie;

    assert.equal((await request("/api/canvas/boards", host, { id: "collab-browser-board", title: BOARD_TITLE })).status, 201);
    const seeded = await request("/api/canvas/boards/collab-browser-board/operations", host, {
      baseRevision: 0,
      operations: [{ operationId: "seed", type: "node.upsert", entityId: "seed", after: { id: "seed", kind: "text", x: 40, y: 40, width: 260, height: 160, text: "共享起点" } }],
    });
    assert.equal(seeded.status, 200, JSON.stringify(seeded.data));
    const resources = (await request("/api/resources?type=canvas", host)).data.resources;
    const resourceId = resources.find((item) => item.resource.refId === "collab-browser-board").resource.id;
    assert.equal((await request(`/api/resources/${resourceId}/shares`, host, {
      visibility: "users",
      permission: "edit",
      userIds: [guestCreated.data.user.id],
    })).status, 201);

    let playwright;
    try {
      playwright = require("playwright");
    } catch {
      playwright = require(path.join(process.env.USERPROFILE, ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"));
    }
    browser = await playwright.chromium.launch({
      headless: true,
      executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      args: ["--host-resolver-rules=MAP ai-os-collab.test 127.0.0.1", "--no-proxy-server"],
    });
    const browserOrigin = `http://ai-os-collab.test:${port}`;

    /** Opens the canvas app as one account and records the collaboration socket. */
    async function openAs(cookie, label) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await context.addCookies([{ name: cookie.split("=", 1)[0], value: cookie.slice(cookie.indexOf("=") + 1), url: browserOrigin }]);
      const page = await context.newPage();
      const errors = [];
      const frames = [];
      const sentFrames = [];
      const sockets = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("response", (response) => {
        if (response.status() >= 400 && /\/api\/canvas/.test(response.url())) errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
      });
      page.on("websocket", (socket) => {
        if (!socket.url().includes("/api/canvas/collab")) return;
        sockets.push(socket.url());
        socket.on("framereceived", (frame) => {
          const raw = typeof frame?.payload === "string" ? frame.payload : String(frame?.payload ?? "");
          try {
            frames.push(JSON.parse(raw));
          } catch {
            /* a non-JSON frame is not part of this contract */
          }
        });
        socket.on("framesent", (frame) => {
          const raw = typeof frame?.payload === "string" ? frame.payload : String(frame?.payload ?? "");
          try {
            sentFrames.push(JSON.parse(raw));
          } catch {
            /* a non-JSON frame is not part of this contract */
          }
        });
      });
      await page.goto(browserOrigin);
      await page.locator("#aiOsDesktop:not([hidden])").waitFor();
      await page.locator('[data-ai-app="canvas"]').click();
      return { label, context, page, errors, frames, sentFrames, sockets };
    }

    async function openSharedBoard(session) {
      await session.page.locator(".canvas-board-item").filter({ hasText: BOARD_TITLE }).first().click();
      await session.page.locator("#canvasEditorScreen").waitFor();
      await session.page.waitForFunction(() => document.querySelector("#canvasPlane")?.querySelectorAll(".canvas-node").length >= 1);
    }

    const hostSession = await openAs(host, "host");
    await openSharedBoard(hostSession);
    const guestSessionPage = await openAs(guestSession, "guest");
    await openSharedBoard(guestSessionPage);

    const presenceVisible = (session) => session.page.waitForFunction(() => {
      const wrap = document.querySelector("#canvasPresence");
      const label = document.querySelector("#canvasPresenceLabel");
      return Boolean(wrap && !wrap.hidden && /1 人协作中/.test(label?.textContent || ""));
    }, null, { timeout: 15000 });

    await check("both accounts open the shared canvas and see each other in the room", async () => {
      await presenceVisible(hostSession);
      await presenceVisible(guestSessionPage);
      assert.ok(hostSession.sockets.length >= 1, "the host opened a collaboration socket");
      assert.ok(guestSessionPage.sockets.length >= 1, "the guest opened a collaboration socket");
      assert.match(hostSession.sockets[0], /boardId=collab-browser-board/);
    });

    await check("a node created by one account appears in the other without a reload", async () => {
      const before = await guestSessionPage.page.evaluate(() => document.querySelectorAll("#canvasPlane .canvas-node").length);
      await hostSession.page.evaluate(() => {
        addCanvasText({ x: 120, y: 620 }, { text: "协同节点甲", focus: false });
      });
      await guestSessionPage.page.waitForFunction(
        () => [...document.querySelectorAll("#canvasPlane .canvas-node-text .canvas-text")].some((element) => (element.textContent || "").includes("协同节点甲")),
        null,
        { timeout: 20000 },
      );
      const after = await guestSessionPage.page.evaluate(() => document.querySelectorAll("#canvasPlane .canvas-node").length);
      assert.equal(after, before + 1, "the guest gained exactly the node the host created");
      const patch = guestSessionPage.frames.find((message) => message.type === "patch" && message.operations?.some((operation) => operation.after?.text === "协同节点甲"));
      assert.ok(patch, `the node arrived over the collaboration socket, not a reload; frames: ${JSON.stringify(guestSessionPage.frames.map((message) => message.type))}`);
      assert.equal(patch.actor.username, "collab-host");
      assert.equal(patch.operations[0].before, undefined, "the receiver is not shipped the previous payload");
    });

    await check("the other direction syncs as well", async () => {
      await guestSessionPage.page.evaluate(() => {
        addCanvasText({ x: 520, y: 620 }, { text: "协同节点乙", focus: false });
      });
      await hostSession.page.waitForFunction(
        () => [...document.querySelectorAll("#canvasPlane .canvas-node-text .canvas-text")].some((element) => (element.textContent || "").includes("协同节点乙")),
        null,
        { timeout: 20000 },
      );
      const selfPatch = hostSession.frames.filter((message) => message.type === "patch" && message.operations?.some((operation) => operation.after?.text === "协同节点乙"));
      assert.equal(selfPatch.length, 1, "the host receives the guest's batch exactly once");
    });

    await check("node movement and text edits appear on the other account", async () => {
      const updated = await hostSession.page.evaluate(() => {
        const node = [...document.querySelectorAll("#canvasPlane .canvas-node-text")]
          .find((element) => (element.querySelector(".canvas-text")?.textContent || "").includes("协同节点乙"));
        if (!node) return null;
        node.dataset.x = "760";
        node.dataset.y = "540";
        setCanvasTextValue(node, "协同节点乙已更新");
        syncCanvasNodeModel(node);
        scheduleCanvasSave();
        return node.dataset.id;
      });
      assert.ok(updated, "the host text node is mounted before editing");
      await guestSessionPage.page.waitForFunction((nodeId) => {
        const node = document.querySelector(`#canvasPlane .canvas-node-text[data-id="${nodeId}"]`);
        return node?.dataset.x === "760"
          && node?.dataset.y === "540"
          && (node.querySelector(".canvas-text")?.textContent || "").includes("协同节点乙已更新");
      }, updated, { timeout: 20000 });
    });

    await check("a text node rename appears on the other account without a reload", async () => {
      const renamed = await hostSession.page.evaluate(() => {
        const node = [...document.querySelectorAll("#canvasPlane .canvas-node-text")]
          .find((element) => (element.querySelector(".canvas-text")?.textContent || "").includes("协同节点甲"));
        if (!node) return null;
        node.dataset.textName = "协同重命名";
        const title = node.querySelector(":scope > .canvas-node-bar .canvas-node-title");
        if (title) title.textContent = "协同重命名";
        syncCanvasNodeModel(node);
        scheduleCanvasSave();
        return node.dataset.id;
      });
      assert.ok(renamed, "the host text node is mounted before renaming");
      await guestSessionPage.page.waitForFunction((nodeId) => {
        const node = document.querySelector(`#canvasPlane .canvas-node-text[data-id="${nodeId}"]`);
        return node?.dataset.textName === "协同重命名"
          && node.querySelector(":scope > .canvas-node-bar .canvas-node-title")?.textContent === "协同重命名";
      }, renamed, { timeout: 20000 });
      const patch = guestSessionPage.frames.find((message) => (
        message.type === "patch"
        && message.operations?.some((operation) => operation.after?.textName === "协同重命名")
      ));
      assert.ok(patch, "the rename arrived as a live node operation");
    });

    await check("the author never receives its own batch back", async () => {
      const selfId = await guestSessionPage.page.evaluate(() => canvasCollabState.clientId);
      const echoed = guestSessionPage.frames.filter((message) => message.type === "patch" && message.sourceClientId === selfId);
      assert.deepEqual(echoed, [], "the guest already applied its own batch locally");
      const hostSelfId = await hostSession.page.evaluate(() => canvasCollabState.clientId);
      const hostEchoed = hostSession.frames.filter((message) => message.type === "patch" && message.sourceClientId === hostSelfId);
      assert.deepEqual(hostEchoed, []);
    });

    await check("a live cursor from one account is drawn on the other canvas", async () => {
      const guestClientId = await guestSessionPage.page.evaluate(() => canvasCollabState.clientId);
      const box = await guestSessionPage.page.locator("#infiniteCanvas").boundingBox();
      assert.ok(box, "the canvas viewport has a layout box");
      for (let step = 1; step <= 5; step += 1) {
        await guestSessionPage.page.mouse.move(box.x + 180 + step * 24, box.y + 180 + step * 18);
      }
      const painted = () => {
        const layer = document.querySelector("#canvasPlane .canvas-collab-cursors");
        const cursor = document.querySelector("#canvasPlane .canvas-collab-cursor");
        if (!layer || !cursor || getComputedStyle(layer).display === "none") return false;
        const rect = cursor.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      await hostSession.page.waitForFunction(painted, null, { timeout: 15000 }).catch(async (error) => {
        const diag = await hostSession.page.evaluate(() => {
          const layers = [...document.querySelectorAll("#canvasPlane .canvas-collab-cursors")];
          return {
            layers: layers.map((layer) => ({ className: layer.className, display: getComputedStyle(layer).display })),
            cursorCount: document.querySelectorAll("#canvasPlane .canvas-collab-cursor").length,
          };
        });
        diag.received = hostSession.frames.map((message) => message.type);
        diag.sent = guestSessionPage.sentFrames.map((message) => message.type);
        throw new Error(`${error.message}; diag ${JSON.stringify(diag)}`);
      });
      assert.ok(
        await hostSession.page.evaluate(painted),
        "the collaborator cursor is painted, not merely present in the DOM",
      );
      const name = await hostSession.page.locator("#canvasPlane .canvas-collab-cursor-name").first().textContent();
      assert.ok(String(name || "").trim().length > 0, "the cursor is labelled with the other account");
      const cursors = hostSession.frames.filter((message) => message.type === "cursor");
      assert.ok(cursors.length > 0, "the cursor arrived over the collaboration socket");
      assert.ok(cursors.every((message) => message.clientId === guestClientId), "every cursor came from the other account");
      const guestCursorNodes = await guestSessionPage.page.evaluate(() => document.querySelectorAll("#canvasPlane .canvas-collab-cursor").length);
      assert.equal(guestCursorNodes, 0, "an account never draws its own cursor");
      const artifactDir = path.join(ROOT, "artifacts", "canvas-collab");
      fs.mkdirSync(artifactDir, { recursive: true });
      await hostSession.page.screenshot({ path: path.join(artifactDir, "two-accounts-live.png") });
      await guestSessionPage.page.screenshot({ path: path.join(artifactDir, "author-view.png") });
    });

    await check("a reloaded page rejoins the room and catches up on both nodes", async () => {
      await guestSessionPage.page.reload();
      await guestSessionPage.page.locator("#aiOsDesktop:not([hidden])").waitFor();
      await guestSessionPage.page.locator('[data-ai-app="canvas"]').click();
      await openSharedBoard(guestSessionPage);
      await guestSessionPage.page.waitForFunction(() => {
        const text = [...document.querySelectorAll("#canvasPlane .canvas-node-text .canvas-text")].map((element) => element.textContent || "");
        return text.some((value) => value.includes("协同节点甲")) && text.some((value) => value.includes("协同节点乙"));
      }, null, { timeout: 20000 });
      await presenceVisible(hostSession);
    });

    assert.deepEqual(failures, [], "canvas collaboration browser regressions");
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
    assert.ok(path.resolve(dataDir).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }

  console.log("Canvas collaboration browser checks passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
