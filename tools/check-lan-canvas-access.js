"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const ROOT = path.resolve(__dirname, "..");
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000000020001e221bc330000000049454e44ae426082", "hex");

async function run() {
  const probe = http.createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "aios-lan-access-"));
  let generationRequests = 0;
  const upstream = http.createServer((req, res) => {
    req.resume();
    if (req.method === "POST" && req.url === "/v1/images/generations") {
      generationRequests++;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [{ b64_json: PNG.toString("base64") }] }));
    } else { res.writeHead(404); res.end(); }
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: ROOT, stdio: "ignore", env: {
      ...process.env, PORT: String(port), HOST: "127.0.0.1", AI_OS_SKIP_ENV_FILE: "1",
      AI_OS_AUTH_DISABLED: "0", AI_OS_DATA_DIR: dataDir,
      AI_OS_SYSTEM_DB_FILE: path.join(dataDir, "system.sqlite"), AI_OS_OUTPUT_DIR: path.join(dataDir, "output"),
      AI_IMAGE_API_URL: `http://127.0.0.1:${upstream.address().port}/v1/images/generations`, AI_IMAGE_API_KEY: "local-test-key",
      AI_IMAGE_MODELS: "gpt-image-2", AI_IMAGE_MODEL: "gpt-image-2", OUTBOUND_NO_PROXY: "127.0.0.1,localhost",
      CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false", CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false",
    },
  });
  const origin = `http://127.0.0.1:${port}`;
  async function request(url, cookie = "", body, headers = {}, method = body === undefined ? "GET" : "POST") {
    const response = await fetch(new URL(url, origin), {
      method, headers: { ...(cookie ? { cookie } : {}), ...(body && !Buffer.isBuffer(body) ? { "content-type": "application/json" } : {}), ...headers },
      body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    let data; try { data = JSON.parse(bytes.toString()); } catch { data = null; }
    return { status: response.status, data, bytes, cache: response.headers.get("cache-control"), cookie: response.headers.get("set-cookie")?.split(";", 1)[0] };
  }
  const failures = [];
  async function check(name, fn) {
    try { await fn(); console.log(`PASS ${name}`); } catch (error) { failures.push(name); console.error(`FAIL ${name}: ${error.message}`); }
  }
  try {
    let ready = false;
    for (let i = 0; i < 160; i++) {
      try { if ((await request("/api/auth/session")).status === 401) { ready = true; break; } } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(ready, "isolated server starts");
    assert.equal((await request("/api/auth/bootstrap", "", { username: "lan-admin", password: "lan-admin-password" })).status, 201);
    const admin = (await request("/api/auth/login", "", { username: "lan-admin", password: "lan-admin-password" })).cookie;
    const createdUser = await request("/api/admin/users", admin, { username: "lan-user", password: "lan-temp-password" });
    assert.equal(createdUser.status, 201);
    const user = (await request("/api/auth/login", "", { username: "lan-user", password: "lan-temp-password" })).cookie;
    assert.equal((await request("/api/auth/change-password", user, { currentPassword: "lan-temp-password", newPassword: "lan-user-password" })).status, 200);

    await check("Agent preload cannot claim a new user's canvas", async () => {
      // The browser dispatches board-changed before the create request is sent.
      await request("/api/canvas-agent/conversation?board_id=lan-board", user);
      assert.equal((await request("/api/canvas/boards", user, { id: "lan-board", title: "局域网画布" })).status, 201);
      const meta = await request("/api/canvas/boards/lan-board/meta", user);
      assert.equal(meta.status, 200, JSON.stringify(meta.data));
      const save = await request("/api/canvas/boards/lan-board/operations", user, {
        baseRevision: meta.data.revision, operations: [{ operationId: "lan-node-add", type: "node.upsert", entityId: "lan-node", after: { id: "lan-node", kind: "text", x: 0, y: 0, width: 300, height: 200, text: "局域网保存测试" } }],
      });
      assert.equal(save.status, 200, JSON.stringify(save.data));
      assert.equal((await request("/api/canvas/boards/lan-board/meta", user)).data.nodeCount, 1);
      const boards = await request("/api/canvas/boards?scope=mine", user);
      assert.equal(boards.data.boards.find((board) => board.id === "lan-board")?.ownerUserId, createdUser.data.user.id);
      assert.equal((await request("/api/canvas/boards/lan-board/meta", admin)).status, 403, "other accounts remain private");
      assert.equal((await request("/api/canvas/boards/lan-board/node?nodeId=lan-node", user)).data.node.text, "局域网保存测试");
      assert.equal((await request("/api/canvas/boards/lan-board/node?nodeId=lan-node", admin)).status, 403, "dense node hydration enforces canvas ownership");
      assert.equal((await request("/api/canvas/boards/lan-board/node?nodeId=lan-node")).status, 401);
      assert.equal((await request("/api/canvas/boards/lan-board/node?nodeId=missing", user)).status, 404);
      const batch = "/api/canvas/boards/lan-board/nodes?nodeId=lan-node&nodeId=missing";
      assert.equal((await request(batch, user)).data?.nodes?.[0]?.text, "局域网保存测试", "batch selection loads full node data");
      assert.equal((await request(batch, admin)).status, 403, "batch selection enforces canvas ownership");
      assert.equal((await request(batch)).status, 401);
      assert.equal((await request("/api/canvas/boards/lan-board/nodes", user)).status, 400);
    });

    for (const name of ["ascii.png", "中秋包装.bip.178.png", "包装 空格 100% #1.png", "literal-%E4%B8%AD.png"]) {
      await check(`upload and read ${name}`, async () => {
        const upload = await request("/api/upload-image", user, PNG, { "content-type": "image/png", "x-file-name": encodeURIComponent(name) });
        assert.equal(upload.status, 200, JSON.stringify(upload.data));
        const loaded = await request(upload.data.url, user);
        assert.equal(loaded.status, 200, JSON.stringify(loaded.data));
        assert.deepEqual(loaded.bytes, PNG);
        assert.match(loaded.cache, /no-store/, "private media cannot survive account changes in the browser cache");
        assert.equal((await request(upload.data.url, admin)).status, 403);
        assert.equal((await request(upload.data.url)).status, 401);
        assert.ok((await request(upload.data.url.replace("/output/", "/%6futput/"))).status >= 400, "encoded route must not bypass authorization");
        const alias = upload.data.url.replace("/output/", "/output/unused%2F..%2F");
        assert.equal((await request(alias, admin)).status, 403, "path aliases must use the same owner");
        assert.equal((await request(alias, user)).status, 200);
        if (process.platform === "win32") {
          const caseAlias = `/output/${upload.data.url.slice("/output/".length).toUpperCase()}`;
          assert.equal((await request(caseAlias, admin)).status, 403, "Windows filename casing must not change ownership");
          assert.equal((await request(caseAlias, user)).status, 200);
        }
      });
    }
    await check("encoded legacy aliases cannot override the upload owner", async () => {
      const upload = await request("/api/upload-image", user, PNG, { "content-type": "image/png", "x-file-name": encodeURIComponent("旧中文图片.png") });
      const encoded = `/output/${encodeURIComponent(upload.data.filename)}`;
      await request("/api/resources", admin, { type: "image", title: "legacy alias", refType: "output_media", refId: encoded });
      assert.equal((await request(encoded, user)).status, 200);
      assert.equal((await request(encoded, admin)).status, 403);
    });
    for (const endpoint of ["/api/upload-image/chunk", "/api/upload-media", "/api/upload-media/chunk", "/api/assets/import"]) {
      await check(`LAN media owner via ${endpoint}`, async () => {
        const uploaded = await request(endpoint, user, PNG, {
          "content-type": "image/png", "x-file-name": encodeURIComponent("分块图片 #2.png"),
          "x-upload-id": `lan-${Date.now()}`, "x-chunk-index": "0", "x-chunk-total": "1", "x-file-type": "image/png",
        });
        assert.ok([200, 201].includes(uploaded.status), JSON.stringify(uploaded.data));
        const loaded = await request(uploaded.data.url, user);
        assert.equal(loaded.status, 200, JSON.stringify(loaded.data));
        assert.deepEqual(loaded.bytes, PNG);
        assert.equal((await request(uploaded.data.url, admin)).status, 403);
      });
    }
    await check("thumbnail inherits original access including existing bad thumbnail records", async () => {
      const upload = await request("/api/upload-image", user, PNG, { "content-type": "image/png", "x-file-name": encodeURIComponent("大尺寸原图.png") });
      const preview = await request("/api/image-thumbnails", user, PNG, { "content-type": "image/webp", "x-source-url": encodeURIComponent(upload.data.url), "x-image-width": "897", "x-image-height": "1631" });
      assert.equal(preview.status, 200, JSON.stringify(preview.data));
      const thumbnail = preview.data.item.thumbnailUrl;
      await request("/api/resources", admin, { type: "image", title: "Old wrongly owned thumbnail", refType: "output_media", refId: thumbnail });
      assert.equal((await request(thumbnail, user)).status, 200, "original owner can read generated thumbnail");
      assert.equal((await request(thumbnail, admin)).status, 403, "thumbnail follows original even when old record says admin");
      assert.equal((await request(`/api/image-thumbnails?source=${encodeURIComponent(upload.data.url)}`, admin)).status, 403);
      assert.equal((await request("/api/image-thumbnails", admin, PNG, { "content-type": "image/webp", "x-source-url": encodeURIComponent(upload.data.url) })).status, 403, "other account cannot overwrite thumbnail");
    });
    await check("shared canvas includes referenced media and revokes it with the share", async () => {
      const upload = await request("/api/upload-image", admin, PNG, { "content-type": "image/png", "x-file-name": encodeURIComponent("共享画布图集.png") });
      const hidden = await request("/api/upload-image", admin, PNG, { "content-type": "image/png", "x-file-name": "private.png" });
      assert.equal((await request("/api/canvas/boards", admin, { id: "shared-media-board", title: "共享图片验证" })).status, 201);
      const originalNode = { id: "gallery", kind: "gallery-container", x: 50, y: 50, width: 320, height: 320, galleryImages: [{ src: upload.data.url }] };
      assert.equal((await request("/api/canvas/boards/shared-media-board/operations", admin, { baseRevision: 0, operations: [{ operationId: "shared-media-add", type: "node.upsert", entityId: "gallery", after: originalNode }] })).status, 200);
      const resources = (await request("/api/resources?type=canvas", admin)).data.resources;
      const resourceId = resources.find((item) => item.resource.refId === "shared-media-board").resource.id;
      const share = await request(`/api/resources/${resourceId}/shares`, admin, { visibility: "users", permission: "edit", userIds: [createdUser.data.user.id] });
      assert.equal(share.status, 201);
      assert.equal((await request(upload.data.url, user)).status, 200, "shared canvas media is readable");
      assert.equal((await request(hidden.data.url, user)).status, 403, "other owner files stay private");
      // An editor cannot add an arbitrary private URL to gain access to it.
      const injection = await request("/api/canvas/boards/lan-board/operations", user, { baseRevision: 1, operations: [{ operationId: "private-ref-injection", type: "node.upsert", entityId: "injection", after: { id: "injection", kind: "image", imageSrc: hidden.data.url } }] });
      assert.equal(injection.status, 403);
      assert.equal((await request(hidden.data.url, user)).status, 403);
      const thumb = await request("/api/image-thumbnails", admin, PNG, { "content-type": "image/webp", "x-source-url": encodeURIComponent(upload.data.url) });
      assert.equal((await request(thumb.data.item.thumbnailUrl, user)).status, 200);
      const exported = await request("/api/canvas/boards/shared-media-board/export", user);
      assert.equal(exported.status, 200);
      assert.equal((await request(`/api/shares/${share.data.share.id}`, admin, undefined, {}, "DELETE")).status, 200);
      assert.equal((await request(upload.data.url, user)).status, 403, "revoking canvas sharing revokes its images");
      assert.equal((await request(thumb.data.item.thumbnailUrl, user)).status, 403);
      assert.equal((await request("/api/canvas/import?boardId=revoked-media-import", user, exported.bytes, { "content-type": "application/json" })).status, 403, "importing a reference must not regain revoked media access");
      const reshared = await request(`/api/resources/${resourceId}/shares`, admin, { visibility: "all", permission: "edit" });
      assert.equal(reshared.status, 201);
      assert.equal((await request("/api/canvas/boards/shared-media-board/operations", admin, { baseRevision: 1, operations: [{ operationId: "remove-shared-media", type: "node.delete", entityId: "gallery" }] })).status, 200);
      assert.equal((await request(upload.data.url, user)).status, 403, "removing the reference revokes media access");
    });
    await check("background generated images belong to the task owner", async () => {
      const provider = await request("/api/providers", admin, { id: "lan-image-provider", name: "LAN local mock", baseUrl: `http://127.0.0.1:${upstream.address().port}/v1`, apiKey: "local-test-key", protocol: "openai", enabled: true, models: [{ id: "gpt-image-2", enabled: true, type: "image", capabilities: ["image.generate"] }] });
      assert.ok([200, 201].includes(provider.status), JSON.stringify(provider.data));
      const created = await request("/api/image-jobs", user, { board_id: "lan-board", node_id: "lan-generated", model: "gpt-image-2", providerId: "lan-image-provider", prompt: "local mock only", size: "1024x1024", n: 1 });
      assert.equal(created.status, 202, JSON.stringify(created.data));
      let job;
      for (let i = 0; i < 120; i++) {
        const status = await request(`/api/image-jobs/${created.data.job_id}`, user);
        assert.equal(status.status, 200, JSON.stringify(status.data));
        job = status.data.job;
        if (["completed", "failed", "sync_failed", "unknown"].includes(job.state)) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      assert.equal(job.state, "completed", JSON.stringify(job));
      const url = job.result.saved_images[0].url;
      assert.equal((await request(url, user)).status, 200);
      assert.equal((await request(url, admin)).status, 403);
      assert.equal(generationRequests, 1, "one local generation submission, no resubmission");
      const sharedTask = await request("/api/image-jobs", user, { board_id: "shared-media-board", node_id: "shared-generated", model: "gpt-image-2", providerId: "lan-image-provider", prompt: "local shared mock only", size: "1024x1024", n: 1 });
      assert.equal(sharedTask.status, 202);
      assert.equal((await request(`/api/image-jobs/${sharedTask.data.job_id}`, admin)).status, 200, "shared canvas participants can read its tasks");
      assert.equal((await request(`/api/image-jobs/${created.data.job_id}`, admin)).status, 403, "unshared canvas tasks remain private");
    });
    if (process.argv.includes("--browser")) await check("ordinary account creates, uploads and reopens in Chrome", async () => {
      let playwright;
      try { playwright = require("playwright"); } catch {
        playwright = require(path.join(process.env.USERPROFILE, ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"));
      }
      const browser = await playwright.chromium.launch({ headless: true, executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", args: ["--host-resolver-rules=MAP ai-os-lan.test 127.0.0.1", "--no-proxy-server"] });
      try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const browserOrigin = `http://ai-os-lan.test:${port}`;
        await context.addCookies([{ name: user.split("=", 1)[0], value: user.slice(user.indexOf("=") + 1), url: browserOrigin }]);
        const page = await context.newPage();
        const errors = [];
        let thumbnailUploads = 0;
        page.on("request", (request) => { if (request.method() === "POST" && new URL(request.url()).pathname === "/api/image-thumbnails") thumbnailUploads++; });
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("response", (response) => { if (response.status() >= 400 && /\/api\/canvas|\/output\//.test(response.url())) errors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
        await page.goto(browserOrigin);
        assert.equal(await page.evaluate(() => isSecureContext), false, "test must match plain LAN HTTP");
        const errorsToDisplay = await page.evaluate(() => [
          getSafeCanvasImageGenerationError(Object.assign(new Error('HTTP 403: INSUFFICIENT_BALANCE Insufficient account balance'), { code: 'UPSTREAM_AUTH' })),
          getSafeCanvasImageGenerationError(Object.assign(new Error('Image download timed out.'), { code: 'image_sync_failed' })),
        ]);
        assert.equal(errorsToDisplay[0].code, "image_api_balance_failed");
        assert.match(errorsToDisplay[1].error, /已生成/);
        await page.locator("#aiOsDesktop:not([hidden])").waitFor();
        if (process.argv.includes("--window-drag")) await require("./check-desktop-window-drag-browser")(page);
        await page.locator('[data-ai-app="canvas"]').click();
        await page.locator("#canvasBoardNew").click();
        await page.locator("#canvasNameInput").fill("普通账号上传验证");
        await page.locator("#canvasNameForm button[type=submit]").click();
        await page.locator("#canvasEditorScreen").waitFor();
        if (process.argv.includes("--agent-picker")) {
          await require("./check-canvas-agent-picker-browser")(page);
          assert.deepEqual(errors, ["503 /api/canvas-agent/turn"], "only the deliberate recovery fixture may fail");
          errors.length = 0;
        }
        if (process.argv.includes("--arrange")) {
          await require("./check-canvas-arrange-browser")(page, path.join(ROOT, "artifacts", "canvas-arrange"));
        }
        const fixture = await page.evaluate(() => {
          const canvas = document.createElement("canvas"); canvas.width = 2400; canvas.height = 1600;
          canvas.getContext("2d").scale(5, 5);
          const ctx = canvas.getContext("2d"); ctx.fillStyle = "#1677ca"; ctx.fillRect(0, 0, 480, 320);
          ctx.fillStyle = "white"; ctx.font = "bold 32px sans-serif"; ctx.fillText("LAN upload OK", 105, 172);
          return canvas.toDataURL().split(",")[1];
        });
        await page.locator("#canvasImageInput").setInputFiles({ name: "中秋包装 空格100% #1.png", mimeType: "image/png", buffer: Buffer.from(fixture, "base64") });
        const loaded = () => [...document.querySelectorAll("#canvasPlane .canvas-node img")].some((img) => img.complete && img.naturalWidth > 0);
        await page.waitForFunction(loaded);
        await page.waitForFunction(async () => {
          const img = document.querySelector("#canvasPlane .canvas-node img");
          const source = img?.dataset.originalSrc || img?.dataset.imageSource || img?.getAttribute("src");
          if (!source || source.includes("/thumbnails/")) return Boolean(source);
          const response = await fetch(`/api/image-thumbnails?source=${encodeURIComponent(source)}`);
          return (await response.json()).item?.lightweight === false;
        });
        assert.equal(thumbnailUploads, 0, "large LAN previews must be generated by the server, without a browser re-upload");
        if (process.argv.includes("--image-actions")) await require("./check-canvas-image-actions-browser")(page);
        if (process.argv.includes("--cutout")) await require("./check-canvas-cutout-browser")(page);
        if (process.argv.includes("--dense-images")) await require("./check-canvas-dense-images-browser")(page);
        await page.waitForFunction(async () => {
          const list = await (await fetch("/api/canvas/boards?scope=mine")).json();
          const board = list.boards.find((item) => item.title === "普通账号上传验证");
          return board && (await (await fetch(`/api/canvas/boards/${board.id}/meta`)).json()).nodeCount === 1;
        });
        await page.reload();
        await page.locator("#aiOsDesktop:not([hidden])").waitFor();
        await page.locator('[data-ai-app="canvas"]').click();
        await page.locator(".canvas-board-item").filter({ hasText: "普通账号上传验证" }).click();
        await page.waitForFunction(loaded);
        assert.deepEqual(errors, []);
        // Test the actual Generate button, not just POST /api/image-jobs.
        await page.evaluate(() => {
          const node = addCanvasImagePlaceholder({ x: 500, y: 200 });
          node.querySelector(".canvas-node-prompt").value = "local mock only";
        });
        await page.locator("#canvasPlane .canvas-node-run").last().click();
        await page.waitForFunction(() => [...document.querySelectorAll("#canvasPlane .canvas-node")].some((node) => node.dataset.imageJobState === "completed"), null, { timeout: 10000 }).catch(async (error) => {
          throw new Error(`${error.message}; node statuses: ${await page.locator("#canvasPlane .canvas-node-title").allTextContents()}`);
        });
        let generatedImagesReady = false;
        for (let attempt = 0; attempt < 100; attempt += 1) {
          generatedImagesReady = await page.evaluate(() => {
            const images = [...document.querySelectorAll("#canvasPlane .canvas-node img")];
            return images.length > 0 && images.every((img) => img.complete && img.naturalWidth > 0);
          });
          if (generatedImagesReady) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        if (!generatedImagesReady) {
          const images = await page.locator("#canvasPlane .canvas-node img").evaluateAll((items) => items.map((img) => ({ src: img.getAttribute("src"), complete: img.complete, width: img.naturalWidth, height: img.naturalHeight })));
          throw new Error(`generated gallery images did not finish loading; gallery images: ${JSON.stringify(images)}; network errors: ${JSON.stringify(errors)}`);
        }
        assert.deepEqual(errors, []);
        assert.equal(generationRequests, 3, "the browser submits once to the local mock");
        const artifactDir = path.join(ROOT, "artifacts", "lan-canvas-access");
        fs.mkdirSync(artifactDir, { recursive: true });
        await page.screenshot({ path: path.join(artifactDir, "ordinary-user-reopened.png") });
      } finally { await browser.close(); }
    });
    assert.deepEqual(failures, [], "LAN account regressions");
  } finally {
    if (child.exitCode === null) { child.kill(); await new Promise((resolve) => child.once("exit", resolve)); }
    await new Promise((resolve) => upstream.close(resolve));
    assert.ok(path.resolve(dataDir).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
