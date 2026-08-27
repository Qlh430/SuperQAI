const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

const APP_URL = process.env.CANVAS_AGENT_BROWSER_URL || "http://127.0.0.1:3113";
const SCREENSHOT_PATH = path.join(__dirname, "..", "artifacts", "canvas-agent-ui-browser.png");
const IMAGE_CHOICE_SCREENSHOT_PATH = path.join(__dirname, "..", "artifacts", "canvas-agent-image-choice-browser.png");
const IMAGE_CHOICE_LIGHT_SCREENSHOT_PATH = path.join(__dirname, "..", "artifacts", "canvas-agent-image-choice-light-browser.png");

(async () => {
  const bundledExecutable = chromium.executablePath();
  const systemExecutable = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const executable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    || (fs.existsSync(bundledExecutable) ? bundledExecutable : systemExecutable);
  const launchOptions = { headless: true };
  if (fs.existsSync(executable)) launchOptions.executablePath = executable;
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 1720, height: 1080 }, deviceScaleFactor: 1 });
  const pageErrors = [];
  const consoleErrors = [];
  const conversations = new Map();
  const pendingTurns = [];
  let savedBoard = null;
  let imageGenerationRequests = 0;
  const imageJobs = new Map();
  let imageJobSequence = 0;

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.route("**/api/canvas/boards", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ boards: [], trash: [] }) });
      return;
    }
    savedBoard = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ boards: savedBoard ? [savedBoard] : [], trash: [], board: savedBoard }),
    });
  });

  await page.route("**/api/canvas-agent/conversation**", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      const boardId = new URL(request.url()).searchParams.get("board_id") || "";
      const conversation = conversations.get(boardId) || {
        boardId,
        conversationId: `test-${boardId}`,
        revision: 0,
        items: [],
        updatedAt: new Date().toISOString(),
      };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(conversation) });
      return;
    }
    const payload = request.postDataJSON();
    const boardId = String(payload.board_id || "");
    const conversation = {
      ...(payload.conversation || {}),
      boardId,
      revision: Number(payload.expected_revision || 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    conversations.set(boardId, conversation);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(conversation) });
  });

  await page.route("**/api/canvas-agent/turn", (route) => {
    pendingTurns.push(route);
  });
  await page.route("**/api/canvas-agent/cancel", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true }),
  }));
  await page.route("**/api/image-models", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      defaultModel: "gpt-image-2",
      models: ["gpt-image-2"],
      labels: { "gpt-image-2": "浏览器验收生图模型" },
      resolutions: { "gpt-image-2": ["1"] },
      platforms: { "gpt-image-2": "openai" },
      families: { "gpt-image-2": "openai-image" },
      prices: {},
      candidates: [{
        id: "gpt-image-2",
        providerId: "browser-image-provider",
        providerName: "浏览器验收接口",
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
        latencyMs: 120,
        lastImageSuccessAt: "2026-08-24T00:00:00.000Z",
      }],
    }),
  }));
  await page.route("**/api/images", (route) => {
    imageGenerationRequests += 1;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        model: "gpt-image-2",
        data: [{
          url: "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='512' height='512'%3E%3Crect width='512' height='512' fill='%236a8f71'/%3E%3C/svg%3E",
          width: 512,
          height: 512,
        }],
      }),
    });
  });
  await page.route("**/api/image-jobs**", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      const jobId = new URL(request.url()).pathname.split("/").pop();
      const job = imageJobs.get(jobId);
      await route.fulfill({
        status: job ? 200 : 404,
        contentType: "application/json",
        body: JSON.stringify(job ? { job } : { error: "not found" }),
      });
      return;
    }
    const payload = request.postDataJSON();
    const jobId = `ui_image_job_${++imageJobSequence}`;
    imageGenerationRequests += 1;
    const job = {
      id: jobId,
      state: "completed",
      boardId: payload.board_id,
      nodeId: payload.node_id,
      model: payload.model,
      deadlineAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      result: {
        model: "gpt-image-2",
        data: [{
          url: "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='512' height='512'%3E%3Crect width='512' height='512' fill='%236a8f71'/%3E%3C/svg%3E",
          width: 512,
          height: 512,
        }],
      },
      error: "",
      code: "",
    };
    imageJobs.set(jobId, job);
    await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ job_id: jobId, job }) });
  });

  try {
    await page.goto(APP_URL, { waitUntil: "networkidle" });
    await page.waitForSelector("#canvasAgentPanel", { state: "attached" });

    assert.equal(await page.locator(".canvas-workspace").evaluate((element) => element.classList.contains("canvas-agent-open")), false);
    assert.equal(await page.locator("#canvasAgentPanel").getAttribute("aria-hidden"), "true");

    await page.locator("#canvasAgentToggle").click();
    await page.waitForFunction(() => document.querySelector(".canvas-workspace")?.classList.contains("canvas-agent-open"));
    assert.equal(await page.locator("#canvasAgentPanel").getAttribute("aria-hidden"), "false");
    assert.equal((await page.locator("#canvasAgentPanel").innerText()).includes("gpt-"), false);

    await page.locator("#canvasAgentSkillBook").click();
    await page.waitForSelector("#canvasAgentSkillPopover:not([hidden])");
    assert.equal(await page.locator("#canvasAgentSkills [data-agent-skill]").count(), 5);
    assert.match(await page.locator("#canvasAgentSkills").innerText(), /产品精修/);
    assert.match(await page.locator("#canvasAgentSkills").innerText(), /电商套图/);
    await page.locator("#canvasAgentSkillBook").click();

    const selectedNodeId = await page.evaluate(() => {
      document.querySelector(".canvas-start-gate")?.classList.add("is-dismissed");
      ensureCanvasBoardIdentity();
      const image = addCanvasImage(
        "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='240'%3E%3Crect width='320' height='240' fill='%23ffcc33'/%3E%3C/svg%3E",
        "产品参考图",
        { x: 180, y: 160 },
      );
      return image.dataset.id;
    });
    const imageNode = page.locator(`.canvas-node-image[data-id="${selectedNodeId}"]`);
    await imageNode.click({ force: true });
    await page.waitForFunction(() => !document.querySelector("#canvasAgentContext")?.hidden);
    assert.match(await page.locator("#canvasAgentContext").innerText(), /产品参考图/);

    await page.locator("#canvasAgentPrompt").fill("分析一下这张产品图");
    await page.locator("#canvasAgentSend").click();
    for (let index = 0; index < 20 && pendingTurns.length === 0; index += 1) await page.waitForTimeout(25);
    assert.equal(pendingTurns.length, 1);
    await page.locator(".canvas-agent-waiting").waitFor({ state: "visible" });
    assert.equal(await page.locator(".canvas-agent-waiting-bar").count(), 4);
    assert.equal(await page.locator(".canvas-agent-waiting-bars").innerText(), "");
    assert.equal(await page.locator(".canvas-agent-waiting").getByText(/loading/i).count(), 0);

    await pendingTurns.shift().fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      body: [
        JSON.stringify({ type: "status", stage: "planning" }),
        JSON.stringify({
          type: "turn",
          turn: {
            response_id: "browser-turn-1",
            message: "我已读取当前画布和选中的产品参考图。",
            tool_calls: [],
          },
        }),
        "",
      ].join("\n"),
    });
    await page.getByText("我已读取当前画布和选中的产品参考图。").waitFor({ state: "visible" });
    assert.equal(await page.locator(".canvas-agent-waiting").count(), 0);

    const galleryPersistence = await page.evaluate(async (sourceNodeId) => {
      const boardId = String(canvasState.activeBoardId || "");
      const context = {
        scope: { boardId },
        assertActive: () => true,
        isActive: () => true,
        forEachBatched: async (items, handler) => Promise.all(items.map(handler)),
      };
      const created = await window.CanvasAgentCanvasApi.createNode("gallery", {
        title: "验收图集",
        x: 620,
        y: 160,
      }, context);
      const updated = await window.CanvasAgentCanvasApi.updateGallery({
        node_id: created.node_id,
        title: "验收图集",
        columns: 2,
        gap: 18,
        image_ids: [],
        remove_image_ids: [],
        add_node_ids: [sourceNodeId],
        active_image_id: sourceNodeId,
      }, context);
      const snapshot = window.serializeCanvasBoard();
      window.restoreCanvasBoard(snapshot);
      const restored = document.querySelector(`.canvas-node-gallery[data-id="${created.node_id}"]`);
      const serialized = snapshot.nodes.find((item) => item.id === created.node_id);
      return {
        imageCount: updated.image_count,
        activeImageId: restored?.dataset.galleryActiveImageId || "",
        serializedColumns: serialized?.galleryColumns,
        serializedGap: serialized?.galleryGap,
        renderedColumns: restored?.querySelector(".canvas-gallery-history-list")?.style.gridTemplateColumns || "",
        renderedGap: restored?.querySelector(".canvas-gallery-history-list")?.style.gap || "",
      };
    }, selectedNodeId);
    assert.equal(galleryPersistence.imageCount, 1);
    assert.ok(galleryPersistence.activeImageId);
    assert.equal(galleryPersistence.serializedColumns, 2);
    assert.equal(galleryPersistence.serializedGap, 18);
    assert.match(galleryPersistence.renderedColumns, /repeat\(2/);
    assert.equal(galleryPersistence.renderedGap, "18px");

    const directImageGeneration = await page.evaluate(async () => {
      const boardId = String(canvasState.activeBoardId || "");
      const context = {
        scope: { boardId },
        assertActive: () => true,
        isActive: () => true,
        forEachBatched: async (items, handler) => Promise.all(items.map(handler)),
      };
      const result = await window.CanvasAgentCanvasApi.generateImageToGallery({
        prompt: "一颗红苹果，干净背景",
        title: "苹果图集",
      }, context);
      const generator = document.querySelector(`.canvas-node-image[data-id="${result.node_id}"]`);
      const gallery = document.querySelector(`.canvas-node-gallery[data-id="${result.gallery_node_id}"]`);
      const viewportRect = document.querySelector("#infiniteCanvas").getBoundingClientRect();
      const generatorRect = generator.getBoundingClientRect();
      const galleryRect = gallery.getBoundingClientRect();
      return {
        result,
        selectedModel: generator.querySelector(".canvas-node-model")?.value || "",
        galleryTitle: gallery.dataset.galleryTitle || "",
        galleryImages: JSON.parse(gallery.dataset.galleryImages || "[]").length,
        viewportCenterX: viewportRect.left + viewportRect.width / 2,
        groupCenterX: (Math.min(generatorRect.left, galleryRect.left) + Math.max(generatorRect.right, galleryRect.right)) / 2,
      };
    });
    assert.equal(directImageGeneration.result.image_count, 1);
    assert.equal(directImageGeneration.selectedModel, "gpt-image-2");
    assert.equal(directImageGeneration.galleryTitle, "苹果图集");
    assert.equal(directImageGeneration.galleryImages, 1);
    assert.ok(Math.abs(directImageGeneration.viewportCenterX - directImageGeneration.groupCenterX) < 3, "Agent node group should be centered in the visible canvas");

    const focusResult = await page.evaluate(async (nodeId) => {
      const node = document.querySelector(`.canvas-node-image[data-id="${nodeId}"]`);
      const before = { x: node.dataset.x, y: node.dataset.y };
      const boardId = String(canvasState.activeBoardId || "");
      const context = {
        scope: { boardId },
        assertActive: () => true,
        isActive: () => true,
        forEachBatched: async (items, handler) => Promise.all(items.map(handler)),
      };
      const result = window.CanvasAgentCanvasApi.requestImageNodeChoice({
        node_id: nodeId,
        suggested_prompt: "一颗青苹果，白色摄影棚背景",
      }, context);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const viewportRect = document.querySelector("#infiniteCanvas").getBoundingClientRect();
      const nodeRect = node.getBoundingClientRect();
      return {
        result,
        before,
        after: { x: node.dataset.x, y: node.dataset.y },
        selected: node.classList.contains("is-selected"),
        highlighted: node.classList.contains("is-agent-focus"),
        centerDeltaX: Math.abs((viewportRect.left + viewportRect.width / 2) - (nodeRect.left + nodeRect.width / 2)),
        centerDeltaY: Math.abs((viewportRect.top + viewportRect.height / 2) - (nodeRect.top + nodeRect.height / 2)),
      };
    }, directImageGeneration.result.node_id);
    assert.equal(focusResult.result.decision_required, true);
    assert.deepEqual(focusResult.after, focusResult.before, "focusing must not move node coordinates");
    assert.equal(focusResult.selected, true);
    assert.equal(focusResult.highlighted, true);
    assert.ok(focusResult.centerDeltaX < 3 && focusResult.centerDeltaY < 3, "existing generator should be centered in the visible canvas");

    await page.locator("#canvasAgentPrompt").fill("再生成一个苹果图片");
    await page.locator("#canvasAgentSend").click();
    await page.waitForFunction(() => document.querySelector(".canvas-agent-waiting"));
    for (let index = 0; index < 20 && pendingTurns.length === 0; index += 1) await page.waitForTimeout(25);
    await pendingTurns.shift().fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      body: `${JSON.stringify({
        type: "turn",
        turn: {
          response_id: "browser-choice-turn",
          message: "",
          tool_calls: [{
            call_id: "choice-call",
            name: "request_image_node_choice",
            arguments: {
              node_id: directImageGeneration.result.node_id,
              suggested_prompt: "一颗青苹果，白色摄影棚背景",
            },
          }],
        },
      })}\n`,
    });
    await page.locator(".canvas-agent-image-choice").waitFor({ state: "visible" });
    assert.equal(await page.locator("[data-agent-image-choice]").count(), 3);
    assert.equal(imageGenerationRequests, 1, "locating an existing node must not start paid generation");
    fs.mkdirSync(path.dirname(IMAGE_CHOICE_SCREENSHOT_PATH), { recursive: true });
    await page.screenshot({ path: IMAGE_CHOICE_SCREENSHOT_PATH, fullPage: true });
    const choiceTheme = await page.locator("html").getAttribute("data-theme");
    await page.locator("html").evaluate((element) => { element.dataset.theme = "light"; });
    await page.waitForTimeout(350);
    await page.screenshot({ path: IMAGE_CHOICE_LIGHT_SCREENSHOT_PATH, fullPage: true });
    await page.locator("html").evaluate((element, theme) => { element.dataset.theme = theme || "dark"; }, choiceTheme);

    await page.locator('[data-agent-image-choice="rerun"]').click();
    for (let index = 0; index < 20 && pendingTurns.length === 0; index += 1) await page.waitForTimeout(25);
    await pendingTurns.shift().fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      body: `${JSON.stringify({
        type: "turn",
        turn: {
          response_id: "browser-rerun-turn",
          message: "",
          tool_calls: [{
            call_id: "rerun-call",
            name: "run_canvas_node",
            arguments: { node_id: directImageGeneration.result.node_id },
          }],
        },
      })}\n`,
    });
    for (let index = 0; index < 40 && pendingTurns.length === 0; index += 1) await page.waitForTimeout(50);
    await pendingTurns.shift().fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      body: `${JSON.stringify({
        type: "turn",
        turn: { response_id: "browser-rerun-complete", message: "已按原提示词再次生成并加入图集。", tool_calls: [] },
      })}\n`,
    });
    await page.getByText("已按原提示词再次生成并加入图集。").waitFor({ state: "visible" });
    assert.equal(imageGenerationRequests, 2);
    assert.equal(await page.locator("#canvasAgentApproval:not([hidden])").count(), 0, "the choice click is the one-run paid authorization");
    const rerunGalleryCount = await page.evaluate((galleryId) => {
      const gallery = document.querySelector(`.canvas-node-gallery[data-id="${galleryId}"]`);
      return JSON.parse(gallery?.dataset.galleryImages || "[]").length;
    }, directImageGeneration.result.gallery_node_id);
    assert.equal(rerunGalleryCount, 2);

    const firstBoardId = await page.evaluate(() => String(canvasState.activeBoardId || ""));
    await page.waitForFunction((boardId) => {
      const conversation = window.localStorage.getItem("canvas-agent-runs-v1");
      return Boolean(boardId && conversation);
    }, firstBoardId);
    await page.evaluate(() => restoreCanvasBoard({
      id: "browser-board-2",
      title: "第二画布",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [],
      connections: [],
      viewport: { x: 80, y: 60, scale: 1 },
    }));
    await page.waitForFunction(() => document.querySelector("#canvasAgentWelcome") && !document.querySelector("#canvasAgentWelcome").hidden);
    assert.equal(await page.getByText("我已读取当前画布和选中的产品参考图。").count(), 0);
    assert.equal(await page.locator("#canvasAgentContext").isHidden(), true);

    fs.mkdirSync(path.dirname(SCREENSHOT_PATH), { recursive: true });
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors.filter((message) => !/favicon/i.test(message)), []);
    console.log(`Canvas agent browser checks passed. Screenshot: ${SCREENSHOT_PATH}`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
