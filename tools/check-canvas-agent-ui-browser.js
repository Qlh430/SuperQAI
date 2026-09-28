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
  const httpErrors = [];
  const legacyRemoteImageRequests = [];
  const conversations = new Map();
  const pendingTurns = [];
  let savedBoard = null;
  let imageGenerationRequests = 0;
  let imageRecoveryRequests = 0;
  let imageLocalizationRequests = 0;
  let skillReferenceRequests = 0;
  const imageJobs = new Map();
  let imageJobSequence = 0;
  let boardRevision = 0;
  const browserImageUrl = "/output/browser-agent-image.svg";

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.url()}`);
  });
  page.on("request", (request) => {
    if (request.url().startsWith("https://legacy-cdn.example/")) legacyRemoteImageRequests.push(request.url());
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
  await page.route("**/api/skills/reference**", async (route) => {
    skillReferenceRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        skill_id: "ai-video-director",
        path: "references/acceptance.md",
        bytes: 18,
        content: "reference-body-test",
      }),
    });
  });
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
        providerBaseUrl: "https://api.hyhawang.com",
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
          url: browserImageUrl,
          local_url: browserImageUrl,
          width: 512,
          height: 512,
        }],
      }),
    });
  });
  await page.route("**/api/image-jobs**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === "POST" && pathname.endsWith("/recover")) {
      const jobId = pathname.split("/").at(-2);
      const job = imageJobs.get(jobId);
      imageRecoveryRequests += 1;
      if (job) {
        job.state = "completed";
        job.result = {
          model: job.model,
          data: [{ url: browserImageUrl, local_url: browserImageUrl, width: 512, height: 512 }],
        };
        job.error = "";
        job.code = "";
      }
      await route.fulfill({
        status: job ? 200 : 404,
        contentType: "application/json",
        body: JSON.stringify(job ? { job } : { error: "not found" }),
      });
      return;
    }
    if (request.method() === "GET") {
      const jobId = pathname.split("/").pop();
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
          url: browserImageUrl,
          local_url: browserImageUrl,
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
  await page.route("**/api/canvas/boards/*/operations", async (route) => {
    boardRevision += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ boardRevision, results: [] }),
    });
  });
  await page.route("**/api/canvas/boards/*/viewport?*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ mode: "detail", boardRevision, nodes: [], connections: [], truncated: false }),
    });
  });
  await page.route("**/output/browser-agent-image.svg", (route) => route.fulfill({
    status: 200,
    contentType: "image/svg+xml",
    body: "<svg xmlns='http://www.w3.org/2000/svg' width='512' height='512'><rect width='512' height='512' fill='#6a8f71'/></svg>",
  }));
  await page.route("**/api/image-sync/localize", async (route) => {
    imageLocalizationRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ item: { local_url: browserImageUrl, width: 512, height: 512 } }),
    });
  });

  try {
    await page.goto(APP_URL, { waitUntil: "networkidle" });
    await page.waitForSelector("#canvasAgentPanel", { state: "attached" });
    await page.evaluate(() => window.AiOsDesktop?.openApp?.("canvas", { screen: "editor" }));
    await page.waitForSelector(".ai-os-app-window");
    await page.evaluate(() => {
      ensureCanvasBoardIdentity();
      showCanvasEditor();
    });
    await page.evaluate(() => window.AiOsDesktop?.setAppImmersive?.("canvas", true));
    await page.locator("#canvasAgentToggle").waitFor({ state: "visible" });

    const modelRouting = await page.evaluate(() => {
      const base = {
        model: "gpt-image-2",
        enabled: true,
        hasApiKey: true,
        hasBaseUrl: true,
        capabilities: ["generation"],
        successRate: 100,
        consecutiveFailures: 0,
      };
      const preferred = window.CanvasImageModelRouting.selectCandidate([
        { ...base, id: "other", providerBaseUrl: "https://other.example/v1", state: "online", latencyMs: 80 },
        { ...base, id: "hyhawang", providerBaseUrl: "https://api.hyhawang.com/v1", state: "online", latencyMs: 900 },
      ], { requestedModel: "gpt-image-2" });
      const configuredFallback = window.CanvasImageModelRouting.selectCandidate([
        { ...base, id: "configured-offline", providerBaseUrl: "https://offline.example/v1", state: "offline" },
      ], { requestedModel: "gpt-image-2" });
      return { preferredId: preferred?.id || "", fallbackId: configuredFallback?.id || "" };
    });
    assert.equal(modelRouting.preferredId, "hyhawang", "equally healthy image providers should prefer api.hyhawang.com");
    assert.equal(modelRouting.fallbackId, "configured-offline", "a configured image model must remain selectable for a real attempt");

    assert.equal(await page.locator(".canvas-workspace").evaluate((element) => element.classList.contains("canvas-agent-open")), false);
    assert.equal(await page.locator("#canvasAgentPanel").getAttribute("aria-hidden"), "true");

    await page.locator("#canvasAgentToggle").click();
    await page.waitForFunction(() => document.querySelector(".canvas-workspace")?.classList.contains("canvas-agent-open"));
    assert.equal(await page.locator("#canvasAgentPanel").getAttribute("aria-hidden"), "false");
    assert.equal((await page.locator("#canvasAgentPanel").innerText()).includes("gpt-"), false);

    const skillReferenceCache = await page.evaluate(async () => {
      const boardId = String(canvasState.activeBoardId || "");
      const context = { scope: { boardId } };
      const args = { skill_id: "ai-video-director", path: "references/acceptance.md" };
      const first = await window.CanvasAgentCanvasApi.readSkillReference(args, context);
      const second = await window.CanvasAgentCanvasApi.readSkillReference(args, context);
      return {
        firstCached: Boolean(first.cached),
        secondCached: Boolean(second.cached),
        alreadyRead: Boolean(second.already_read),
        hasCached: Boolean(window.CanvasAgentCanvasApi.hasCachedSkillReference(args, context)),
        content: second.content,
      };
    });
    assert.equal(skillReferenceRequests, 1, "the same skill reference must only be fetched once per board");
    assert.equal(skillReferenceCache.firstCached, false);
    assert.equal(skillReferenceCache.secondCached, true);
    assert.equal(skillReferenceCache.alreadyRead, true);
    assert.equal(skillReferenceCache.hasCached, true);
    assert.equal(skillReferenceCache.content, "reference-body-test");

    await page.locator("#canvasAgentSkillBook").click();
    await page.waitForSelector("#canvasAgentSkillPopover:not([hidden])");
    assert.equal(await page.locator("#canvasAgentSkills [data-agent-skill]").count(), 0, "系统 Skill 不应出现在手动技能书中");
    assert.match(await page.locator("#canvasAgentSkills").innerText(), /系统 Skill 会按需求自动匹配/);
    await page.locator("#canvasAgentSkillBook").click();

    const selectedNodeId = await page.evaluate(() => {
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

    const pendingTurnCountBeforeSelectedImageEdit = pendingTurns.length;
    const imageGenerationCountBeforeSelectedImageEdit = imageGenerationRequests;
    await page.locator("#canvasAgentPrompt").fill("把这张产品参考图编辑成放在竹篮里");
    await page.locator("#canvasAgentSend").click();
    await page.waitForTimeout(250);
    assert.equal(
      pendingTurns.length,
      pendingTurnCountBeforeSelectedImageEdit,
      "an explicit edit of a selected image must bypass the remote Agent route",
    );
    assert.equal(imageGenerationRequests, imageGenerationCountBeforeSelectedImageEdit + 1);
    await page.waitForFunction(({ sourceId, prompt }) => {
      const connection = canvasState.connections.find((item) => item.from === sourceId);
      const node = document.querySelector(`.canvas-node-image[data-id="${connection?.to || ""}"]`);
      return node?.querySelector(".canvas-node-prompt")?.value === prompt
        && node.dataset.imageJobState === "completed";
    }, { sourceId: selectedNodeId, prompt: "把这张产品参考图编辑成放在竹篮里" });
    const selectedImageEditConnection = await page.evaluate((sourceNodeId) => {
      const connection = canvasState.connections.find((item) => item.from === sourceNodeId);
      const node = document.querySelector(`.canvas-node-image[data-id="${connection?.to || ""}"]`);
      return {
        connected: Boolean(connection),
        prompt: node?.querySelector(".canvas-node-prompt")?.value || "",
        connectionCount: canvasState.connections.length,
        imageNodeCount: document.querySelectorAll(".canvas-node-image").length,
        context: document.querySelector("#canvasAgentContext")?.innerText || "",
        messages: document.querySelector("#canvasAgentMessages")?.innerText || "",
        status: document.querySelector("#canvasAgentStatus")?.innerText || "",
      };
    }, selectedNodeId);
    assert.equal(selectedImageEditConnection.connected, true, `a selected canvas image must automatically connect to the created edit node: ${JSON.stringify(selectedImageEditConnection)}`);
    assert.equal(selectedImageEditConnection.prompt, "把这张产品参考图编辑成放在竹篮里");
    assert.equal(await page.locator("#canvasAgentApproval:not([hidden])").count(), 0, "a clear selected-image edit must run without another confirmation");

    const selectedGalleryId = await page.evaluate((imageUrl) => {
      const gallery = addCanvasGallery({ x: 660, y: 160 });
      renderCanvasGalleryContainerNode(gallery, {
        title: "番茄图片",
        activeImageId: "tomato-source",
        images: [{ id: "tomato-source", name: "番茄", src: imageUrl, savedUrl: imageUrl }],
      });
      selectCanvasNode(gallery);
      return gallery.dataset.id;
    }, browserImageUrl);
    await page.waitForFunction(() => document.querySelector("#canvasAgentContext")?.innerText?.includes("番茄"));
    const pendingTurnCountBeforeGalleryEdit = pendingTurns.length;
    const imageGenerationCountBeforeGalleryEdit = imageGenerationRequests;
    await page.locator("#canvasAgentPrompt").fill("把番茄放进篮子里");
    await page.locator("#canvasAgentSend").click();
    await page.waitForTimeout(250);
    const gallerySelectionDebug = await page.evaluate((galleryId) => {
      const node = document.querySelector(`.canvas-node-gallery[data-id="${galleryId}"]`);
      return {
        selected: node?.classList.contains("is-selected") || false,
        output: window.getCanvasNodeOutput?.(node) || null,
        context: document.querySelector("#canvasAgentContext")?.innerText || "",
      };
    }, selectedGalleryId);
    assert.equal(
      pendingTurns.length,
      pendingTurnCountBeforeGalleryEdit,
      `an explicit edit of a selected gallery image must bypass the remote Agent route: ${JSON.stringify(gallerySelectionDebug)}`,
    );
    assert.equal(imageGenerationRequests, imageGenerationCountBeforeGalleryEdit + 1);
    await page.waitForFunction(({ sourceId, prompt }) => {
      const connection = canvasState.connections.find((item) => item.from === sourceId);
      const node = document.querySelector(`.canvas-node-image[data-id="${connection?.to || ""}"]`);
      return node?.querySelector(".canvas-node-prompt")?.value === prompt
        && node.dataset.imageJobState === "completed";
    }, { sourceId: selectedGalleryId, prompt: "把番茄放进篮子里" });
    const galleryEditResult = await page.evaluate((sourceId) => {
      const connection = canvasState.connections.find((item) => item.from === sourceId);
      const node = document.querySelector(`.canvas-node-image[data-id="${connection?.to || ""}"]`);
      const resultGallery = canvasState.connections
        .filter((item) => item.from === node?.dataset.id)
        .map((item) => document.querySelector(`.canvas-node-gallery[data-id="${item.to}"]`))
        .find(Boolean);
      const rect = (element) => ({
        x: Number(element?.dataset.x || 0),
        y: Number(element?.dataset.y || 0),
        width: Math.max(1, Number(element?.offsetWidth || 320)),
        height: Math.max(1, Number(element?.offsetHeight || 260)),
      });
      const overlaps = (left, right) => left.x < right.x + right.width + 28
        && left.x + left.width + 28 > right.x
        && left.y < right.y + right.height + 28
        && left.y + left.height + 28 > right.y;
      const source = document.querySelector(`.canvas-node-gallery[data-id="${sourceId}"]`);
      const sourceRect = rect(source);
      const generatorRect = rect(node);
      const resultGalleryRect = rect(resultGallery);
      return {
        connected: Boolean(connection),
        prompt: node?.querySelector(".canvas-node-prompt")?.value || "",
        sourceKind: window.getCanvasNodeOutput?.(document.querySelector(`.canvas-node-gallery[data-id="${sourceId}"]`))?.type || "",
        sourceRight: sourceRect.x + sourceRect.width,
        generatorX: generatorRect.x,
        generatorOverlapsSource: overlaps(generatorRect, sourceRect),
        galleryOverlapsSource: overlaps(resultGalleryRect, sourceRect),
      };
    }, selectedGalleryId);
    assert.equal(galleryEditResult.connected, true, "the selected gallery must connect to the generated edit node");
    assert.equal(galleryEditResult.prompt, "把番茄放进篮子里");
    assert.equal(galleryEditResult.sourceKind, "image", "the gallery active image should be treated as an editable image source");
    assert.equal(await page.locator("#canvasAgentApproval:not([hidden])").count(), 0, "a clear selected-gallery edit must run without another confirmation");
    assert.ok(galleryEditResult.generatorX >= galleryEditResult.sourceRight + 62, "an image edit generator should be placed after its selected source");
    assert.equal(galleryEditResult.generatorOverlapsSource, false, "an image edit generator must not overlap its selected source");
    assert.equal(galleryEditResult.galleryOverlapsSource, false, "an edit result gallery must not overlap its selected source");

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
        scale: canvasState.scale,
        centerDeltaX: Math.abs((viewportRect.left + viewportRect.width / 2) - (nodeRect.left + nodeRect.width / 2)),
        centerDeltaY: Math.abs((viewportRect.top + viewportRect.height / 2) - (nodeRect.top + nodeRect.height / 2)),
      };
    }, directImageGeneration.result.node_id);
    assert.equal(focusResult.result.decision_required, true);
    assert.deepEqual(focusResult.after, focusResult.before, "focusing must not move node coordinates");
    assert.equal(focusResult.selected, true);
    assert.equal(focusResult.highlighted, true);
    assert.ok(focusResult.scale >= 0.65 && focusResult.scale <= 1.25, "single-node focus should stay readable");
    assert.ok(focusResult.centerDeltaX < 3 && focusResult.centerDeltaY < 3, "existing generator should be centered in the visible canvas");

    const multiFocusResult = await page.evaluate(async () => {
      const first = addCanvasText({ x: 120, y: 110 }, { text: "多节点聚焦 A", focus: false });
      const second = addCanvasText({ x: 1420, y: 520 }, { text: "多节点聚焦 B", focus: false });
      const before = [first, second].map((node) => ({ id: node.dataset.id, x: node.dataset.x, y: node.dataset.y }));
      focusAgentCanvasNodesInViewport([first, second]);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const viewport = document.querySelector("#infiniteCanvas").getBoundingClientRect();
      const panel = document.querySelector("#canvasAgentPanel").getBoundingClientRect();
      const visibleRight = Math.min(viewport.right, panel.left);
      return {
        before,
        after: [first, second].map((node) => ({ id: node.dataset.id, x: node.dataset.x, y: node.dataset.y })),
        scale: canvasState.scale,
        visible: [first, second].every((node) => {
          const rect = node.getBoundingClientRect();
          return rect.left >= viewport.left - 2
            && rect.right <= visibleRight + 2
            && rect.top >= viewport.top - 2
            && rect.bottom <= viewport.bottom + 2;
        }),
      };
    });
    assert.deepEqual(multiFocusResult.after, multiFocusResult.before, "multi-node focus must preserve node coordinates");
    assert.ok(multiFocusResult.scale > 0.05 && multiFocusResult.scale <= 1, "multi-node focus should fit without enlarging past 100%");
    assert.equal(multiFocusResult.visible, true, "all focused nodes should remain visible outside the Agent panel");

    const imageGenerationCountBeforeImageChoice = imageGenerationRequests;
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
    assert.equal(await page.locator("[data-agent-image-choice]").count(), 2);
    assert.deepEqual(
      await page.locator("[data-agent-image-choice] b").allTextContents(),
      ["修改后生成", "新建并生成"],
    );
    assert.equal(await page.locator('[data-agent-image-choice="rerun"]').count(), 0);
    assert.equal(imageGenerationRequests, imageGenerationCountBeforeImageChoice, "locating an existing node must not start paid generation");
    fs.mkdirSync(path.dirname(IMAGE_CHOICE_SCREENSHOT_PATH), { recursive: true });
    await page.screenshot({ path: IMAGE_CHOICE_SCREENSHOT_PATH, fullPage: true });
    const choiceTheme = await page.locator("html").getAttribute("data-theme");
    await page.locator("html").evaluate((element) => { element.dataset.theme = "light"; });
    await page.waitForTimeout(350);
    await page.screenshot({ path: IMAGE_CHOICE_LIGHT_SCREENSHOT_PATH, fullPage: true });
    await page.locator("html").evaluate((element, theme) => { element.dataset.theme = theme || "dark"; }, choiceTheme);

    await page.locator('[data-agent-image-choice="update"]').click();
    for (let index = 0; index < 20 && pendingTurns.length === 0; index += 1) await page.waitForTimeout(25);
    await pendingTurns.shift().fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      body: `${JSON.stringify({
        type: "turn",
        turn: {
          response_id: "browser-update-and-run-turn",
          message: "",
          tool_calls: [
            {
              call_id: "update-existing-image-call",
              name: "update_node",
              arguments: {
                node_id: directImageGeneration.result.node_id,
                changes: {
                  content: null,
                  prompt: "一颗青苹果，白色摄影棚背景",
                  title: null,
                  model: null,
                  size: null,
                  resolution: null,
                  aspect_ratio: null,
                  duration: null,
                  comfy_mode: null,
                  comfy_resolution: null,
                  comfy_padding: null,
                  comfy_qwen_angle: null,
                  x: null,
                  y: null,
                  result_url: null,
                },
              },
            },
            {
              call_id: "run-updated-image-call",
              name: "run_canvas_node",
              arguments: { node_id: directImageGeneration.result.node_id },
            },
          ],
        },
      })}\n`,
    });
    for (let index = 0; index < 30 && pendingTurns.length === 0; index += 1) await page.waitForTimeout(25);
    assert.equal(pendingTurns.length, 1, "the update and run results should return to Agent once");
    await pendingTurns.shift().fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      body: `${JSON.stringify({
        type: "turn",
        turn: {
          response_id: "browser-update-complete-turn",
          message: "已按本次需求修改当前节点并生成。",
          tool_calls: [],
        },
      })}\n`,
    });
    await page.getByText("已按本次需求修改当前节点并生成。").waitFor({ state: "visible" });
    assert.equal(imageGenerationRequests, imageGenerationCountBeforeImageChoice + 1);
    assert.equal(await page.locator("#canvasAgentApproval:not([hidden])").count(), 0, "the choice click is the one-run paid authorization");
    assert.equal(
      await page.locator(`.canvas-node-image[data-id="${directImageGeneration.result.node_id}"] .canvas-node-prompt`).inputValue(),
      "一颗青苹果，白色摄影棚背景",
    );
    const updatedGalleryCount = await page.evaluate((galleryId) => {
      const gallery = document.querySelector(`.canvas-node-gallery[data-id="${galleryId}"]`);
      return JSON.parse(gallery?.dataset.galleryImages || "[]").length;
    }, directImageGeneration.result.gallery_node_id);
    assert.equal(updatedGalleryCount, 2);

    const imageNodesBeforeNewChoice = await page.locator("#canvasPlane .canvas-node-image").count();
    await page.locator("#canvasAgentPrompt").fill("再生成一个绿色苹果图片");
    await page.locator("#canvasAgentSend").click();
    for (let index = 0; index < 20 && pendingTurns.length === 0; index += 1) await page.waitForTimeout(25);
    await pendingTurns.shift().fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      body: `${JSON.stringify({
        type: "turn",
        turn: {
          response_id: "browser-new-choice-turn",
          message: "",
          tool_calls: [{
            call_id: "new-choice-call",
            name: "request_image_node_choice",
            arguments: {
              node_id: directImageGeneration.result.node_id,
              suggested_prompt: "一颗绿色苹果，柔和自然光",
            },
          }],
        },
      })}\n`,
    });
    await page.locator(".canvas-agent-image-choice").waitFor({ state: "visible" });
    await page.locator('[data-agent-image-choice="new"]').click();
    for (let index = 0; index < 20 && pendingTurns.length === 0; index += 1) await page.waitForTimeout(25);
    await pendingTurns.shift().fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      body: `${JSON.stringify({
        type: "turn",
        turn: {
          response_id: "browser-new-generate-turn",
          message: "",
          tool_calls: [{
            call_id: "new-generate-call",
            name: "generate_image_to_gallery",
            arguments: { prompt: "一颗绿色苹果，柔和自然光", model: null, size: "1:1", resolution: "1", reference_node_ids: [], title: "绿色苹果" },
          }],
        },
      })}\n`,
    });
    await page.waitForFunction((count) => document.querySelectorAll("#canvasPlane .canvas-node-image").length === count + 1, imageNodesBeforeNewChoice);
    assert.equal(imageGenerationRequests, imageGenerationCountBeforeImageChoice + 2, "new-and-generate must submit exactly one additional image request");
    assert.equal(await page.locator(`.canvas-node-image[data-id="${directImageGeneration.result.node_id}"]`).count(), 1, "new-and-generate must preserve the existing node");
    assert.equal(await page.locator("#canvasAgentApproval:not([hidden])").count(), 0, "new-and-generate must not request a second confirmation");

    const firstBoardId = await page.evaluate(() => String(canvasState.activeBoardId || ""));
    const recoveryJobId = "ui_sync_recovery";
    imageJobs.set(recoveryJobId, {
      id: recoveryJobId,
      state: "sync_failed",
      boardId: firstBoardId,
      nodeId: directImageGeneration.result.node_id,
      model: "gpt-image-2",
      result: { data: [] },
      error: "图片已生成，但原图尚未同步到本机",
      code: "image_sync_failed",
    });
    const recoveryUi = await page.evaluate(({ nodeId, jobId }) => {
      const node = document.querySelector(`.canvas-node-image[data-id="${nodeId}"]`);
      syncCanvasImageJobProgress(node, { id: jobId, state: "syncing" });
      const syncing = {
        title: node.querySelector(".canvas-node-title")?.textContent || "",
        disabled: node.querySelector(".canvas-image-job-recover")?.disabled === true,
      };
      syncCanvasImageJobProgress(node, { id: jobId, state: "sync_failed" });
      return {
        syncing,
        failedTitle: node.querySelector(".canvas-node-title")?.textContent || "",
        recoverText: node.querySelector(".canvas-image-job-recover")?.textContent || "",
      };
    }, { nodeId: directImageGeneration.result.node_id, jobId: recoveryJobId });
    assert.match(recoveryUi.syncing.title, /正在同步原图到本机/);
    assert.equal(recoveryUi.syncing.disabled, true);
    assert.doesNotMatch(recoveryUi.syncing.title, /^完成/);
    assert.match(recoveryUi.failedTitle, /尚未同步到本机/);
    assert.equal(recoveryUi.recoverText, "恢复原图");
    const imageGenerationCountBeforeSyncRecovery = imageGenerationRequests;
    await page.locator(`.canvas-node-image[data-id="${directImageGeneration.result.node_id}"] .canvas-image-job-recover`).dispatchEvent("click");
    await page.waitForFunction((galleryId) => {
      const gallery = document.querySelector(`.canvas-node-gallery[data-id="${galleryId}"]`);
      return JSON.parse(gallery?.dataset.galleryImages || "[]").length === 3;
    }, directImageGeneration.result.gallery_node_id);
    assert.equal(imageRecoveryRequests, 1, "sync recovery should continue the existing server job once");
    assert.equal(imageGenerationRequests, imageGenerationCountBeforeSyncRecovery, "sync recovery must not submit another paid image request");

    const legacyGallery = await page.evaluate(() => {
      const gallery = addCanvasGallery(getCanvasViewportCenterPoint());
      renderCanvasGalleryNode(gallery, {
        title: "旧画布远程图集",
        activeImageId: "legacy-image",
        images: [{
          id: "legacy-image",
          name: "旧图",
          src: "https://legacy-cdn.example/old.png",
          savedUrl: "https://legacy-cdn.example/old.png",
        }],
      });
      return { galleryId: gallery.dataset.id, imageId: "legacy-image" };
    });
    await page.waitForFunction(({ galleryId, imageId }) => {
      const gallery = document.querySelector(`.canvas-node-gallery[data-id="${galleryId}"]`);
      const images = JSON.parse(gallery?.dataset.galleryImages || "[]");
      return images.length === 1
        && images[0]?.id === imageId
        && images[0]?.src === "/output/browser-agent-image.svg"
        && images[0]?.syncState === "ready";
    }, legacyGallery);
    const legacyRepair = await page.evaluate(({ galleryId }) => {
      const gallery = document.querySelector(`.canvas-node-gallery[data-id="${galleryId}"]`);
      const images = JSON.parse(gallery?.dataset.galleryImages || "[]");
      return {
        count: images.length,
        imageId: images[0]?.id || "",
        activeImageId: gallery?.dataset.galleryActiveImageId || "",
        coverSrc: gallery?.querySelector(".canvas-gallery-cover img")?.getAttribute("src") || "",
      };
    }, legacyGallery);
    assert.deepEqual(legacyRepair, {
      count: 1,
      imageId: "legacy-image",
      activeImageId: "legacy-image",
      coverSrc: "/output/browser-agent-image.svg",
    });
    assert.equal(imageLocalizationRequests, 1, "legacy remote image should be localized once");
    assert.deepEqual(legacyRemoteImageRequests, [], "legacy remote images must not be mounted directly in the browser");

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

    const discussionRequestsBefore = imageGenerationRequests;
    const discussionNodesBefore = await page.locator("#canvasPlane .canvas-node-image").count();
    await page.locator("#canvasAgentPrompt").fill("先讨论怎么生成桃子图片，不要出图");
    await page.locator("#canvasAgentSend").click();
    for (let index = 0; index < 20 && pendingTurns.length === 0; index += 1) await page.waitForTimeout(25);
    await pendingTurns.shift().fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      body: `${JSON.stringify({
        type: "turn",
        turn: {
          response_id: "browser-discussion-tool-turn",
          message: "",
          tool_calls: [{
            call_id: "discussion-image-call",
            name: "generate_image_to_gallery",
            arguments: { prompt: "一颗桃子", model: null, size: "1:1", resolution: "1", reference_node_ids: [], title: "桃子" },
          }],
        },
      })}\n`,
    });
    for (let index = 0; index < 30 && pendingTurns.length === 0; index += 1) await page.waitForTimeout(25);
    assert.equal(await page.locator("#canvasAgentApproval:not([hidden])").count(), 0, "discussion-only image calls must not request paid approval");
    assert.equal(pendingTurns.length, 1, "a blocked discussion tool call should return to the Agent for a text response");
    await pendingTurns.shift().fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      body: `${JSON.stringify({
        type: "turn",
        turn: {
          response_id: "browser-discussion-text-turn",
          message: "我先不生成。建议使用 1:1、1K，并先确认桃子的构图与光线。",
          tool_calls: [],
        },
      })}\n`,
    });
    await page.getByText("我先不生成。建议使用 1:1、1K，并先确认桃子的构图与光线。").waitFor({ state: "visible" });
    assert.equal(imageGenerationRequests, discussionRequestsBefore, "discussion-only turns must not submit image requests");
    assert.equal(await page.locator("#canvasPlane .canvas-node-image").count(), discussionNodesBefore, "discussion-only turns must not create image nodes");

    await page.locator("#canvasAgentPrompt").fill("按这个生成");
    await page.locator("#canvasAgentSend").click();
    for (let index = 0; index < 20 && pendingTurns.length === 0; index += 1) await page.waitForTimeout(25);
    await pendingTurns.shift().fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      body: `${JSON.stringify({
        type: "turn",
        turn: {
          response_id: "browser-discussion-execute-turn",
          message: "",
          tool_calls: [{
            call_id: "discussion-execute-image-call",
            name: "generate_image_to_gallery",
            arguments: { prompt: "一颗桃子，柔和自然光", model: null, size: "1:1", resolution: "1", reference_node_ids: [], title: "桃子" },
          }],
        },
      })}\n`,
    });
    await page.getByText("图片已生成并加入画布图集。你可以继续让我调整或延展。").waitFor({ state: "visible" });
    assert.equal(imageGenerationRequests, discussionRequestsBefore + 1, "a later explicit execute turn should submit exactly one image request");
    assert.equal(await page.locator("#canvasAgentApproval:not([hidden])").count(), 0, "explicit execution after discussion must not add another confirmation");

    const nodeBarState = await page.evaluate(async () => {
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
        spanText: span ? span.textContent : "",
        spanHidden: Boolean(span?.hidden),
        hasInput: Boolean(input),
        inputHidden: input ? Boolean(input.hidden) : true,
      };
    });
    assert.equal(nodeBarState.spanText, nodeBarState.imageName, "图片节点标题栏应该显示图片名称");
    assert.notEqual(nodeBarState.spanText, "null", "图片节点标题栏不应该显示 null");
    assert.equal(nodeBarState.spanHidden, false, "图片节点名称平时应该是可见文字");
    assert.equal(nodeBarState.hasInput, true, "图片节点应该带有名称输入框");
    assert.equal(nodeBarState.inputHidden, true, "平时不应该直接显示名称输入框");

    await page.click(`.canvas-node-image[data-id="${nodeBarState.nodeId}"] .canvas-node-title`);
    await page.waitForFunction((nodeId) => {
      const input = document.querySelector(`.canvas-node-image[data-id="${nodeId}"] .canvas-node-title-input`);
      return Boolean(input && !input.hidden && document.activeElement === input);
    }, nodeBarState.nodeId);
    await page.keyboard.press("Escape");
    await page.waitForFunction((nodeId) => {
      const node = document.querySelector(`.canvas-node-image[data-id="${nodeId}"]`);
      const input = node?.querySelector(".canvas-node-title-input");
      const span = node?.querySelector(".canvas-node-title");
      return Boolean(input?.hidden && span && !span.hidden);
    }, nodeBarState.nodeId);

    fs.mkdirSync(path.dirname(SCREENSHOT_PATH), { recursive: true });
    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors.filter((message) => !/favicon/i.test(message)), [], httpErrors.join("\n"));
    console.log(`Canvas agent browser checks passed. Screenshot: ${SCREENSHOT_PATH}`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
