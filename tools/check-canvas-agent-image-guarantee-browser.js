"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");

let playwright;
try { playwright = require(process.env.AI_OS_TEST_PLAYWRIGHT_MODULE || "playwright"); } catch {
  playwright = require(path.join(process.env.USERPROFILE || "", ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"));
}
const { chromium } = playwright;
const ROOT = path.resolve(__dirname, "..");
const SCREENSHOT_PATH = path.join(ROOT, "artifacts", "canvas-agent-image-guarantee.png");
const IMAGE_URL = "/output/agent-guarantee-image.svg";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

async function waitForServer(page, url) {
  for (let index = 0; index < 200; index += 1) {
    try { if ((await page.request.get(url)).ok()) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for AI OS server.");
}

function ndjsonTurn(turn) {
  return `${JSON.stringify({ type: "turn", turn })}\n`;
}

(async () => {
  const probe = http.createServer();
  const port = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "aios-agent-guarantee-"));
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      AI_OS_DATA_DIR: dataDir,
      CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false",
      CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false",
    },
    stdio: "ignore",
  });
  const executablePath = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].find((item) => fs.existsSync(item));
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const pageErrors = [];
  const consoleErrors = [];
  const httpErrors = [];
  let imageJobSequence = 0;
  let imageGenerationRequests = 0;
  const scriptedTurns = [];
  const imageJobs = new Map();

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.url()}`);
  });

  await page.route("**/api/canvas-agent/turn", async (route) => {
    const script = scriptedTurns.shift();
    if (!script) throw new Error("画布 Agent 请求了未脚本化的回合。");
    if (script.failure) {
      await route.fulfill({
        status: Number(script.failure.status || 503),
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          error: String(script.failure.error || "所有可用服务暂时不可用，任务已保存，请稍后重试。"),
          recoverable: script.failure.recoverable !== false,
        }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/x-ndjson; charset=utf-8", body: ndjsonTurn(script) });
  });
  await page.route("**/api/image-models", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      defaultModel: "gpt-image-2",
      models: ["gpt-image-2"],
      labels: { "gpt-image-2": "验收生图模型" },
      resolutions: { "gpt-image-2": ["1"] },
      platforms: { "gpt-image-2": "openai" },
      families: { "gpt-image-2": "openai-image" },
      prices: {},
      candidates: [{
        id: "gpt-image-2",
        providerId: "guarantee-image-provider",
        providerName: "验收接口",
        providerBaseUrl: "https://api.example.com",
        networkMode: "direct",
        model: "gpt-image-2",
        enabled: true,
        hasApiKey: true,
        hasBaseUrl: true,
        capabilities: ["generation", "edit"],
        state: "online",
        platform: "openai",
        family: "openai-image",
        resolutions: ["1"],
        successRate: 100,
        consecutiveFailures: 0,
      }],
    }),
  }));
  await page.route("**/api/image-jobs**", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      const id = new URL(request.url()).pathname.split("/").pop();
      const job = imageJobs.get(id);
      await route.fulfill({
        status: job ? 200 : 404,
        contentType: "application/json",
        body: JSON.stringify(job ? { job } : { error: "not found" }),
      });
      return;
    }
    imageGenerationRequests += 1;
    const payload = request.postDataJSON();
    const id = `guarantee_job_${++imageJobSequence}`;
    const job = {
      id,
      state: "completed",
      boardId: payload.board_id,
      nodeId: payload.node_id,
      model: payload.model,
      deadlineAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      result: { model: "gpt-image-2", data: [{ url: IMAGE_URL, local_url: IMAGE_URL, width: 768, height: 1024 }] },
      error: "",
      code: "",
    };
    imageJobs.set(id, job);
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ job_id: id, job }),
    });
  });
  await page.route("**/output/agent-guarantee-image.svg", (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: "<svg xmlns='http://www.w3.org/2000/svg' width='768' height='1024'><rect width='768' height='1024' fill='#c94f2f'/></svg>",
  }));
  await page.route("**/api/image-thumbnails**", (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: "<svg xmlns='http://www.w3.org/2000/svg' width='96' height='128'><rect width='96' height='128' fill='#c94f2f'/></svg>",
  }));

  try {
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
    await waitForServer(page, `http://127.0.0.1:${port}/`);
    const origin = `http://127.0.0.1:${port}`;
    const account = { username: "guarantee-admin", displayName: "验收管理员", password: "guarantee-admin-password" };
    assert.ok((await page.request.post(`${origin}/api/auth/bootstrap`, { data: account })).ok());
    assert.ok((await page.request.post(`${origin}/api/auth/login`, {
      data: { username: account.username, password: account.password },
    })).ok());
    const resourceId = await page.evaluate(async () => {
      const headers = { "content-type": "application/json" };
      const project = await fetch("/api/canvas/projects", { method: "POST", headers, body: JSON.stringify({ id: "guarantee-project", name: "验收项目" }) }).then((item) => item.json());
      await fetch("/api/canvas/boards", { method: "POST", headers, body: JSON.stringify({ id: "guarantee-board", projectId: project.project?.id || "guarantee-project", title: "验收画布" }) });
      const boards = await fetch("/api/canvas/boards?scope=all").then((item) => item.json());
      return boards.boards?.find((board) => board.id === "guarantee-board")?.resourceId || "";
    });
    assert.ok(resourceId, "验收画布应该带有 resourceId");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#aiOsDesktop") && !document.querySelector("#aiOsDesktop").hidden, null, { timeout: 30_000 });
    await page.waitForFunction(() => window.AiOsDesktop?.isReady?.(), null, { timeout: 30_000 });
    const consoleErrorsBeforeOpen = consoleErrors.length;
    await page.evaluate((id) => window.AiOsDesktop.openApp("canvas", { resourceId: id }), resourceId);
    try {
      await page.locator("#canvasEditorScreen").waitFor({ timeout: 30_000 });
    } catch (error) {
      console.error("CANVAS OPEN STATE", JSON.stringify(await page.evaluate(() => ({
        desktopHidden: document.querySelector("#aiOsDesktop")?.hidden,
        activeApp: window.AiOsDesktop?.getActiveApp?.(),
        editorHidden: document.querySelector("#canvasEditorScreen")?.hidden,
        appErrors: Array.from(document.querySelectorAll("[data-app]")).map((node) => ({
          app: node.dataset.app,
          hidden: node.hidden,
          active: node.classList.contains("active"),
        })),
      })), null, 2));
      console.error("page errors", pageErrors);
      console.error("console errors", consoleErrors);
      console.error("http errors", httpErrors);
      throw error;
    }
    await page.evaluate(() => window.AiOsDesktop.setAppImmersive("canvas", true));
    await page.locator("#canvasAgentToggle").waitFor({ state: "visible" });
    await page.locator("#canvasAgentToggle").click();
    await page.waitForFunction(() => document.querySelector(".canvas-workspace")?.classList.contains("canvas-agent-open"));

    // 画布已有可复用生成节点时，续跑失败后的本地兜底仍必须为新需求新建节点并真实出图。
    const autumnPreexisting = await page.evaluate(async () => {
      const boardId = String(canvasState.activeBoardId || "");
      const context = {
        scope: { boardId },
        assertActive: () => true,
        isActive: () => true,
        forEachBatched: async (items, handler) => Promise.all(items.map(handler)),
      };
      const adapters = window.CanvasAgentToolAdapters.create({ canvasApi: window.CanvasAgentCanvasApi });
      const created = await adapters.create_image_node({
        prompt: "旧的桃子生成节点，应保持不动",
        model: null,
        size: null,
        resolution: null,
        reference_node_ids: [],
      }, context);
      return {
        nodeId: String(created.node_id || ""),
        nodeIds: Array.from(document.querySelectorAll(".canvas-node-image")).map((node) => String(node.dataset.id || "")),
      };
    });
    assert.ok(autumnPreexisting.nodeId, "测试画布应该预置一个可复用图片生成节点");
    const autumnImageCountBefore = await page.locator(".canvas-node-image").count();
    const autumnGenerationsBefore = imageGenerationRequests;
    scriptedTurns.push({
      response_id: "autumn-turn-1",
      message: "我先把海报内容整理到画布上。",
      auto_skill_id: "generate-image",
      auto_skill_label: "生成图片",
      tool_calls: [
        { call_id: "autumn-text", name: "create_text_node", arguments: { content: "中秋节海报：圆月、桂花、家人团圆，暖金色调", x: null, y: null } },
      ],
    });
    scriptedTurns.push({
      failure: {
        status: 400,
        error: "The reasoning_content in the thinking mode must be passed back to the API.",
        recoverable: false,
      },
    });
    await page.locator("#canvasAgentPrompt").fill("我想生成一张中秋节海报！");
    await page.locator("#canvasAgentSend").click();
    try {
      await page.waitForFunction(
        (before) => document.querySelectorAll(".canvas-node-image").length > before,
        autumnImageCountBefore,
        { timeout: 30_000 },
      );
    } catch (error) {
      console.error("AUTUMN FALLBACK STATE", JSON.stringify(await page.evaluate(() => ({
        status: String(document.querySelector("#canvasAgentStatus")?.innerText || ""),
        messages: String(document.querySelector("#canvasAgentMessages")?.innerText || ""),
        images: document.querySelectorAll(".canvas-node-image").length,
      })), null, 2));
      console.error("pending scripts", scriptedTurns.length, pageErrors, consoleErrors);
      throw error;
    }
    await page.getByText("图片已生成并加入画布图集。你可以继续让我调整或延展。").waitFor({ state: "visible", timeout: 60_000 });
    assert.equal(imageGenerationRequests, autumnGenerationsBefore + 1, "续跑失败后的明确生图请求必须自动补一次真实生成");
    const autumnFallbackState = await page.evaluate(() => ({
      messages: String(document.querySelector("#canvasAgentMessages")?.innerText || ""),
      imageIds: Array.from(document.querySelectorAll(".canvas-node-image")).map((node) => String(node.dataset.id || "")),
      galleryImages: Array.from(document.querySelectorAll(".canvas-node-gallery-container, .canvas-node-asset-collection"))
        .reduce((total, node) => total + getCanvasGalleryImages(node).length, 0),
    }));
    assert.equal(autumnFallbackState.imageIds.length, autumnPreexisting.nodeIds.length + 1, "本地兜底不能复用旧节点，应新建一个生成节点");
    assert.ok(autumnFallbackState.imageIds.includes(autumnPreexisting.nodeId), "预置的旧生成节点必须保留");
    assert.equal(autumnFallbackState.galleryImages, 1, "本地兜底生成的图片必须进入图集");
    assert.match(autumnFallbackState.messages, /已切换为画布本地执行通道/);
    assert.doesNotMatch(autumnFallbackState.messages, /这一步没有完成，但画布和对话都已保留/);

    // 1. 图片节点标题栏必须显示图片名称，且点击名称才开始改名。
    const nodeBar = await page.evaluate(async () => {
      const boardId = String(canvasState.activeBoardId || "");
      const context = {
        scope: { boardId },
        assertActive: () => true,
        isActive: () => true,
        forEachBatched: async (items, handler) => Promise.all(items.map(handler)),
      };
      const adapters = window.CanvasAgentToolAdapters.create({ canvasApi: window.CanvasAgentCanvasApi });
      const created = await adapters.create_image_node({
        prompt: "番茄海报主视觉",
        model: null,
        size: null,
        resolution: null,
        reference_node_ids: [],
      }, context);
      const node = document.querySelector(`.canvas-node-image[data-id="${created.node_id}"]`);
      const span = node.querySelector(".canvas-node-title");
      const input = node.querySelector(".canvas-node-title-input");
      return {
        nodeId: created.node_id,
        imageName: String(node.dataset.imageName || ""),
        spanText: String(span?.textContent || ""),
        spanHidden: Boolean(span?.hidden),
        hasInput: Boolean(input),
        inputHidden: input ? Boolean(input.hidden) : true,
      };
    });
    assert.equal(nodeBar.spanText, nodeBar.imageName, "图片节点标题栏应该显示图片名称");
    assert.notEqual(nodeBar.spanText, "null", "图片节点标题栏不应该显示 null");
    assert.equal(nodeBar.spanHidden, false, "图片节点名称平时应该显示为文字");
    assert.equal(nodeBar.hasInput, true, "图片节点应该带有名称输入框");
    assert.equal(nodeBar.inputHidden, true, "平时不应该出现名称输入框");

    await page.click(`.canvas-node-image[data-id="${nodeBar.nodeId}"] .canvas-node-title`);
    await page.waitForFunction((nodeId) => {
      const input = document.querySelector(`.canvas-node-image[data-id="${nodeId}"] .canvas-node-title-input`);
      return Boolean(input && !input.hidden && document.activeElement === input);
    }, nodeBar.nodeId);
    await page.keyboard.press("Escape");
    await page.waitForFunction((nodeId) => {
      const node = document.querySelector(`.canvas-node-image[data-id="${nodeId}"]`);
      return Boolean(node?.querySelector(".canvas-node-title-input")?.hidden
        && node?.querySelector(".canvas-node-title")?.hidden === false);
    }, nodeBar.nodeId);

    // 2. 明确的生图请求即使模型只建节点，也必须补一次真实生成。
    const imageNodeCountBefore = await page.locator(".canvas-node-image").count();
    const generationsBefore = imageGenerationRequests;
    scriptedTurns.push({
      response_id: "guarantee-turn-1",
      message: "我先把海报方案搭到画布上。",
      auto_skill_id: "poster-design",
      auto_skill_label: "海报设计",
      tool_calls: [
        { call_id: "guarantee-text", name: "create_text_node", arguments: { content: "海报 brief：受众 生鲜食品消费者，主题 鲜摘番茄，画幅 9:16", x: null, y: null } },
        { call_id: "guarantee-image", name: "create_image_node", arguments: { prompt: "鲜摘番茄海报主视觉，真实手机摄影感，顶部留出文字安全区", model: null, size: "9:16", resolution: "1", reference_node_ids: [], x: null, y: null } },
        { call_id: "guarantee-gallery", name: "create_gallery_node", arguments: { title: "番茄海报方案", x: null, y: null } },
      ],
    });
    scriptedTurns.push({
      response_id: "guarantee-turn-2",
      message: "连接节点已完成。",
      tool_calls: [],
    });
    await page.locator("#canvasAgentPrompt").fill("给这个番茄做个海报");
    await page.locator("#canvasAgentSend").click();
    try {
      await page.waitForFunction(
        (before) => document.querySelectorAll(".canvas-node-image").length > before,
        imageNodeCountBefore,
        { timeout: 30_000 },
      );
    } catch (error) {
      console.error("AGENT STATE", JSON.stringify(await page.evaluate(() => ({
        status: String(document.querySelector("#canvasAgentStatus")?.innerText || ""),
        messages: String(document.querySelector("#canvasAgentMessages")?.innerText || ""),
        images: document.querySelectorAll(".canvas-node-image").length,
        turns: window.__guaranteeTurns || null,
      })), null, 2));
      console.error("pending scripts", scriptedTurns.length, pageErrors, consoleErrors);
      throw error;
    }
    try {
      await page.getByText("图片已生成并加入画布图集。你可以继续让我调整或延展。").waitFor({ state: "visible", timeout: 60_000 });
    } catch (error) {
      console.error("GUARANTEE STATE", JSON.stringify(await page.evaluate(() => ({
        status: String(document.querySelector("#canvasAgentStatus")?.innerText || ""),
        messages: String(document.querySelector("#canvasAgentMessages")?.innerText || ""),
        images: document.querySelectorAll(".canvas-node-image").length,
        galleries: document.querySelectorAll(".canvas-node-gallery-container, .canvas-node-asset-collection").length,
        galleryImages: Array.from(document.querySelectorAll(".canvas-node-gallery-container, .canvas-node-asset-collection")).map((node) => getCanvasGalleryImages(node).length),
        approvalVisible: !document.querySelector("#canvasAgentApproval")?.hidden,
        activeBoardId: String(canvasState.activeBoardId || ""),
        imageNodes: Array.from(document.querySelectorAll(".canvas-node-image")).map((node) => ({
          id: node.dataset.id,
          boardId: String(node.dataset.boardId || ""),
          name: String(node.dataset.imageName || ""),
          engine: String(node.dataset.canvasEngine || ""),
          hasSrc: Boolean(node.dataset.imageSrc),
        })),
      })), null, 2));
      console.error("generation requests", imageGenerationRequests, "pending scripts", scriptedTurns.length);
      throw error;
    }
    assert.equal(imageGenerationRequests, generationsBefore + 1, "明确的生图请求必须补一次真实生成");

    const guaranteeState = await page.evaluate(() => {
      const boardId = String(canvasState.activeBoardId || "");
      // The unified material node now backs generation results, so both the legacy
      // gallery container and the new asset collection are valid landing spots.
      const gallery = Array.from(document.querySelectorAll(".canvas-node-gallery-container, .canvas-node-asset-collection"))
        .find((node) => String(node.dataset.boardId || boardId) === boardId && getCanvasGalleryImages(node).length);
      const generatedNode = gallery ? canvasState.connections
        .filter((item) => item.to === gallery.dataset.id)
        .map((item) => document.querySelector(`.canvas-node-image[data-id="${item.from}"]`))
        .find(Boolean) : null;
      return {
        galleryImages: gallery ? getCanvasGalleryImages(gallery).length : 0,
        generatedTitle: String(generatedNode?.querySelector(".canvas-node-title")?.textContent || ""),
        generatedImageName: String(generatedNode?.dataset.imageName || ""),
        messages: String(document.querySelector("#canvasAgentMessages")?.innerText || ""),
        approvalVisible: !document.querySelector("#canvasAgentApproval")?.hidden,
        status: String(document.querySelector("#canvasAgentStatus")?.innerText || ""),
      };
    });
    assert.equal(guaranteeState.galleryImages, 1, "补生成的真实图片必须进入图集");
    assert.equal(guaranteeState.generatedTitle, guaranteeState.generatedImageName, "生图节点标题应该等于图片名称");
    assert.notEqual(guaranteeState.generatedTitle, "null", "生图节点标题不应该是 null");
    assert.match(guaranteeState.messages, /图片已生成并加入画布图集/, "只有真实出图后才可以报告完成");
    assert.match(guaranteeState.messages, /已匹配专业流程：海报设计/, "预加载的系统 Skill 要在对话里说明");
    assert.equal(guaranteeState.approvalVisible, false, "明确的单张生图请求不应该再多要一次确认");

    // 3. 明确要求"只建节点"时不得偷偷生成。
    scriptedTurns.push({
      response_id: "guarantee-turn-3",
      message: "好，只建节点。",
      tool_calls: [
        { call_id: "guarantee-image-2", name: "create_image_node", arguments: { prompt: "番茄海报草图节点", model: null, size: null, resolution: null, reference_node_ids: [], x: null, y: null } },
      ],
    });
    scriptedTurns.push({
      response_id: "guarantee-turn-4",
      message: "节点已经建好，等你确认后再生成。",
      tool_calls: [],
    });
    const generationsBeforeDiscussion = imageGenerationRequests;
    await page.locator("#canvasAgentPrompt").fill("只建节点，不要生成");
    await page.locator("#canvasAgentSend").click();
    await page.getByText("节点已经建好，等你确认后再生成。").waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForTimeout(500);
    assert.equal(imageGenerationRequests, generationsBeforeDiscussion, "只建节点的讨论请求不得触发付费生成");

    fs.mkdirSync(path.dirname(SCREENSHOT_PATH), { recursive: true });
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
    assert.deepEqual(pageErrors, []);
    const expectedAgentFailures = httpErrors.filter((message) => message.includes("/api/canvas-agent/turn"));
    assert.equal(expectedAgentFailures.length, 1, "only the scripted continuation failure may fail");
    assert.deepEqual(
      httpErrors
        .filter((message) => !message.includes("/api/canvas-agent/turn"))
        .filter((message) => !/^401\s+https?:\/\/[^/]+\/api\/auth\/session\b/i.test(message)),
      [],
    );
    assert.deepEqual(
      consoleErrors.slice(consoleErrorsBeforeOpen)
        .filter((message) => !/favicon/i.test(message))
        .filter((message) => !/^401\s+https?:\/\/[^/]+\/api\/auth\/session\b/i.test(message))
        .filter((message) => !/(?:400 \(Bad Request\)|503 \(Service Unavailable\))/i.test(message)),
      [],
      httpErrors.join("\n"),
    );
    console.log(`Canvas agent image guarantee checks passed. Screenshot: ${SCREENSHOT_PATH}`);
  } finally {
    await browser.close();
    child.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
