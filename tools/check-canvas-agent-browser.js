const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

const ROOT = path.join(__dirname, "..");
const BASE_URL = process.env.CANVAS_AGENT_TEST_URL || "http://127.0.0.1:3099";

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  const browserErrors = [];
  const failedResponses = [];
  const turnRequests = [];
  const apiRequests = [];
  const conversations = new Map();
  let savedBoard = null;
  let agentVerificationRequests = 0;
  const agentVerificationPayloads = [];
  const settingsSavePayloads = [];
  let verifiedPendingAgentModelId = "";
  let imageGenerationRequests = 0;
  const imageJobs = new Map();
  let imageJobSequence = 0;
  let imageHistoryRecords = [];
  let releaseDelayedImage = null;
  let delayNextImageModels = false;
  let releaseDelayedImageModels = null;
  let imageFailoverEnabled = false;
  let imageFailoverPrimaryRejected = false;
  const imageFailoverAttempts = [];
  let autoVerificationEnabled = false;
  const autoAgentProviders = ["a", "b", "c"].map((suffix) => ({
    id: `agent-provider-auto-${suffix}`,
    name: `自动验证接口 ${suffix.toUpperCase()}`,
    baseUrl: `https://auto-${suffix}.test/v1`,
    apiKey: "",
    hasApiKey: true,
    enabled: true,
    models: [{ id: `gpt-5.6-terra-auto-${suffix}`, capabilities: ["text"] }],
  }));
  const pendingAgentModels = Array.from({ length: 14 }, (_, index) => ({
    id: `backup-agent-${String(index + 1).padStart(2, "0")}`,
    capabilities: ["text"],
  }));
  const settingsFixture = {
    providers: [{ id: "agent-provider-primary", name: "稳定接口", baseUrl: "https://stable.test/v1", apiKey: "", hasApiKey: true, enabled: true, models: [{ id: "stable-agent", capabilities: ["text"] }] },
      { id: "agent-provider-pending", name: "备用接口", baseUrl: "https://backup.test/v1", apiKey: "", hasApiKey: true, enabled: true, models: pendingAgentModels },
      ...autoAgentProviders],
    agentRouting: { primaryCandidateId: "", candidateOrder: ["agent-choice-primary"] },
    canvas: { keepAspect: false, controlBarBottom: false, disconnectMenu: false },
    appearance: { theme: "system", palette: "yellow-black", animations: true },
    storage: { autoSave: true, intervalMinutes: 5, dataDirectory: "test" },
  };
  await page.addInitScript(() => {
    const marker = "canvas-agent-browser-test-storage-initialized";
    if (sessionStorage.getItem(marker)) return;
    localStorage.removeItem("canvas-agent-panel-open-v1");
    sessionStorage.setItem(marker, "true");
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
  });
  page.on("request", (request) => {
    if (request.url().includes("/api/")) apiRequests.push(`${request.method()} ${request.url()}`);
  });
  await page.route("**/api/settings", async (route) => {
    if (route.request().method() === "PUT") {
      const payload = route.request().postDataJSON();
      settingsSavePayloads.push(payload);
      Object.assign(settingsFixture, payload);
    }
    await route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(settingsFixture) });
  });
  await page.route("**/api/settings/agent-candidates*", async (route) => {
    const ready = [{
      id: "agent-choice-primary",
      selectionId: "agent-choice-primary",
      providerId: "agent-provider-primary",
      providerName: "稳定接口",
      endpoint: "stable.test",
      model: "stable-agent",
      state: "ready",
      rank: 1,
      firstEventMs: 680,
      successRate: 99.5,
      consecutiveFailures: 0,
    }];
    if (verifiedPendingAgentModelId) ready.push({
      id: "agent-choice-backup",
      selectionId: "agent-choice-backup",
      providerId: "agent-provider-pending",
      providerName: "备用接口",
      endpoint: "backup.test",
      model: verifiedPendingAgentModelId,
      state: "ready",
      rank: 2,
      firstEventMs: 900,
      successRate: null,
      consecutiveFailures: 0,
    });
    if (settingsFixture.providers.some((provider) => provider.name === "未保存接口")) ready.push({
      id: "agent-choice-draft",
      selectionId: "agent-choice-draft",
      providerId: settingsFixture.providers.find((provider) => provider.name === "未保存接口").id,
      providerName: "未保存接口",
      endpoint: "draft.test",
      model: "draft-agent",
      state: "ready",
      rank: 3,
      firstEventMs: 710,
      successRate: null,
      consecutiveFailures: 0,
    });
    const autoDiscovered = autoVerificationEnabled ? autoAgentProviders.map((provider) => ({
      id: `${provider.id}\n${provider.models[0].id}`,
      providerId: provider.id,
      providerName: provider.name,
      endpoint: new URL(provider.baseUrl).hostname,
      endpointIdentity: provider.baseUrl,
      model: provider.models[0].id,
      state: "pending_verification",
    })) : [];
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        routing: settingsFixture.agentRouting,
        configuredOrder: settingsFixture.agentRouting.candidateOrder,
        unavailableConfiguredCandidateIds: [],
        needsReconfiguration: false,
        summary: { ready: ready.length, pendingVerification: pendingAgentModels.length - (verifiedPendingAgentModelId ? 1 : 0) + autoDiscovered.length, circuitOpen: 0 },
        candidates: ready,
        discovered: [...pendingAgentModels.filter((model) => model.id !== verifiedPendingAgentModelId).map((model) => ({
          id: `agent-provider-pending\n${model.id}`,
          providerId: "agent-provider-pending",
          providerName: "备用接口",
          endpoint: "backup.test",
          model: model.id,
          state: "pending_verification",
        })), ...autoDiscovered],
      }),
    });
  });
  await page.route("**/api/settings/providers/agent-verify", async (route) => {
    agentVerificationRequests += 1;
    agentVerificationPayloads.push(route.request().postDataJSON());
    await new Promise((resolve) => setTimeout(resolve, 700));
    const verificationPayload = route.request().postDataJSON();
    if (verificationPayload.providerId === "agent-provider-pending") verifiedPendingAgentModelId = verificationPayload.modelId;
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ state: "verified", text: true, tools: true, vision: false, latencyMs: 620, draft: verificationPayload.modelId === "draft-agent", message: "真实推理与工具调用均已通过" }),
    });
  });
  await page.route("**/api/settings/providers/models", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ models: ["draft-agent"] }),
    });
  });
  await page.route("**/api/settings/providers/runtime", (route) => route.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ status: { state: "online", latencyMs: 20 }, models: [] }),
  }));
  await page.route("**/api/image-models", async (route) => {
    if (delayNextImageModels) {
      delayNextImageModels = false;
      await new Promise((resolve) => { releaseDelayedImageModels = resolve; });
    }
    const failoverCandidates = imageFailoverEnabled ? [{
      id: "primary-image2",
      providerId: "browser-image-primary",
      providerName: "额度不足接口",
      model: "gpt-image-2",
      enabled: true,
      hasApiKey: true,
      hasBaseUrl: true,
      capabilities: ["generation", "edit"],
      state: imageFailoverPrimaryRejected ? "balance-error" : "online",
      platform: "openai",
      family: "gpt-image-2",
      resolutions: ["1"],
      successRate: 100,
      consecutiveFailures: imageFailoverPrimaryRejected ? 1 : 0,
      latencyMs: 80,
      lastImageSuccessAt: "2026-08-24T00:00:00.000Z",
    }, {
      id: "backup-image2",
      providerId: "browser-image-backup",
      providerName: "备用接口",
      model: "gpt-image-2",
      enabled: true,
      hasApiKey: true,
      hasBaseUrl: true,
      capabilities: ["generation", "edit"],
      state: "online",
      platform: "openai",
      family: "gpt-image-2",
      resolutions: ["1"],
      successRate: 98,
      consecutiveFailures: 0,
      latencyMs: 140,
      lastImageSuccessAt: "2026-08-24T00:00:00.000Z",
    }] : [{
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
    }];
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
      defaultModel: imageFailoverEnabled ? "primary-image2" : "gpt-image-2",
      models: failoverCandidates.map((candidate) => candidate.id),
      labels: Object.fromEntries(failoverCandidates.map((candidate) => [candidate.id, candidate.providerName])),
      resolutions: Object.fromEntries(failoverCandidates.map((candidate) => [candidate.id, candidate.resolutions])),
      platforms: Object.fromEntries(failoverCandidates.map((candidate) => [candidate.id, candidate.platform])),
      families: Object.fromEntries(failoverCandidates.map((candidate) => [candidate.id, candidate.family])),
      prices: {},
      candidates: failoverCandidates,
      }),
    });
  });
  await page.route("**/api/images", async (route) => {
    imageGenerationRequests += 1;
    const payload = route.request().postDataJSON();
    if (imageFailoverEnabled) {
      imageFailoverAttempts.push(payload.model);
      if (payload.model === "primary-image2") {
        imageFailoverPrimaryRejected = true;
        await route.fulfill({
          status: 402,
          contentType: "application/json; charset=utf-8",
          body: JSON.stringify({ error: "quota insufficient" }),
        });
        return;
      }
    }
    if (String(payload.prompt || "").includes("延迟")) {
      await new Promise((resolve) => { releaseDelayedImage = resolve; });
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        model: imageFailoverEnabled ? "backup-image2" : "gpt-image-2",
        data: [{
          url: "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='512' height='512'%3E%3Crect width='512' height='512' fill='%23cf3434'/%3E%3C/svg%3E",
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
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify(job ? { job } : { error: "not found" }),
      });
      return;
    }
    const payload = request.postDataJSON();
    const jobId = `browser_image_job_${++imageJobSequence}`;
    const job = {
      id: jobId,
      state: "queued",
      boardId: payload.board_id,
      nodeId: payload.node_id,
      model: payload.model,
      deadlineAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      result: null,
      error: "",
      code: "",
    };
    imageJobs.set(jobId, job);
    await route.fulfill({ status: 202, contentType: "application/json; charset=utf-8", body: JSON.stringify({ job_id: jobId, job }) });
    void (async () => {
      job.state = "running";
      imageGenerationRequests += 1;
      if (imageFailoverEnabled) {
        imageFailoverAttempts.push(payload.model);
        if (payload.model === "primary-image2") {
          imageFailoverPrimaryRejected = true;
          job.state = "failed";
          job.code = "image_job_failed";
          job.error = "quota insufficient";
          return;
        }
      }
      if (String(payload.prompt || "").includes("延迟")) {
        await new Promise((resolve) => { releaseDelayedImage = resolve; });
      }
      job.result = {
        model: imageFailoverEnabled ? "backup-image2" : "gpt-image-2",
        data: [{
          url: "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='512' height='512'%3E%3Crect width='512' height='512' fill='%23cf3434'/%3E%3C/svg%3E",
          width: 512,
          height: 512,
        }],
      };
      job.state = "completed";
    })();
  });
  await page.route("**/api/history/images*", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify({ records: imageHistoryRecords }) });
      return;
    }
    if (request.method() === "POST") {
      const record = request.postDataJSON()?.record;
      if (record) imageHistoryRecords = [record, ...imageHistoryRecords].slice(0, 200);
      await route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify({ records: imageHistoryRecords }) });
      return;
    }
    imageHistoryRecords = [];
    await route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify({ records: [] }) });
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
  await page.route("**/api/canvas-agent/cancel", (route) => route.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ ok: true }),
  }));
  await page.route("**/api/canvas-agent/conversation*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const payload = request.method() === "GET" ? null : request.postDataJSON();
    const boardId = String(url.searchParams.get("board_id") || payload?.board_id || "");
    if (request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify(conversations.get(boardId) || {
          boardId,
          conversationId: `conversation_${boardId}`,
          revision: 0,
          items: [],
          updatedAt: new Date().toISOString(),
        }),
      });
      return;
    }
    const current = conversations.get(boardId);
    if (Number(payload.expected_revision || 0) !== Number(current?.revision || 0)) {
      await route.fulfill({
        status: 409,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ current }),
      });
      return;
    }
    const saved = { ...payload.conversation, boardId, revision: Number(current?.revision || 0) + 1 };
    conversations.set(boardId, saved);
    await route.fulfill({ status: 200, contentType: "application/json; charset=utf-8", body: JSON.stringify(saved) });
  });
  await page.route("**/api/canvas-agent/turn", async (route) => {
    const payload = route.request().postDataJSON();
    turnRequests.push(payload);
    if (payload.prompt === "触发失败") {
      await new Promise((resolve) => setTimeout(resolve, 250));
      await route.fulfill({
        status: 503,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          error: "No tool call found for function call output with call_id call_browser_trace (traceid: browser-raw)",
          recoverable: true,
        }),
      });
      return;
    }
    if (payload.prompt === "直接生成一张断线苹果图片") {
      await route.fulfill({
        status: 503,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ error: "所有可用服务暂时不可用，任务已保存，请稍后重试。", recoverable: true }),
      });
      return;
    }
    const runInitialPrompt = turnRequests.find((item) => item.run_id === payload.run_id && item.prompt)?.prompt || "";
    if (!payload.prompt && runInitialPrompt === "生成一个苹果图片并添加说明文字") {
      await route.fulfill({
        status: 503,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({ error: "后续模型线路暂时不可用。", recoverable: true }),
      });
      return;
    }
    let turn;
    if (payload.prompt === "你好") {
      turn = {
        response_id: "resp_browser_test",
        message: "你好，我可以直接协助你操作画布。",
        tool_calls: [],
      };
    } else if (payload.prompt === "执行旧任务") {
      turn = {
        response_id: "resp_browser_old_tool",
        message: "",
        tool_calls: [{
          call_id: "call_browser_old_tool",
          name: "run_canvas_node",
          arguments: { node_id: payload.canvas.selected_node_ids[0] },
        }],
      };
    } else if (payload.prompt === "新任务") {
      turn = {
        response_id: "resp_browser_new_run",
        message: "新任务已回应。",
        tool_calls: [],
      };
    } else if (payload.prompt === "拒绝删除") {
      turn = {
        response_id: "resp_browser_decline",
        message: "",
        tool_calls: [{
          call_id: "call_browser_decline_delete",
          name: "delete_nodes",
          arguments: { node_ids: [payload.canvas.selected_node_ids[0]] },
        }],
      };
    } else if (payload.prompt === "苹果海报怎么设计") {
      turn = {
        response_id: "resp_browser_discussion",
        message: "可以先从构图、光线和色彩方向讨论。",
        tool_calls: [],
      };
    } else if (payload.prompt === "先建节点，不要生成") {
      turn = {
        response_id: "resp_browser_prepare",
        message: "",
        tool_calls: [{
          call_id: "call_browser_prepare_image",
          name: "create_image_node",
          arguments: {
            prompt: "苹果产品图",
            model: null,
            size: null,
            resolution: null,
            reference_node_ids: [],
            x: null,
            y: null,
          },
        }],
      };
    } else if (payload.prompt === "生成一个苹果图片并添加说明文字") {
      turn = {
        response_id: "resp_browser_partial_before_disconnect",
        message: "",
        tool_calls: [{
          call_id: "call_browser_partial_text",
          name: "create_text_node",
          arguments: { content: "苹果图片说明", x: 720, y: 280 },
        }],
      };
    } else if (String(payload.prompt || "").startsWith("直接生成一张")) {
      turn = {
        response_id: "resp_browser_direct_image",
        message: "",
        tool_calls: [{
          call_id: `call_browser_direct_image_${payload.run_id}`,
          name: "generate_image_to_gallery",
          arguments: { prompt: payload.prompt.includes("延迟") ? "延迟生成测试图片" : "一颗红苹果，干净背景", model: null, size: null, resolution: null, reference_node_ids: [], title: "苹果图集" },
        }],
      };
    } else if (payload.prompt) {
      turn = {
        response_id: "resp_browser_tool",
        message: "",
        tool_calls: [{
          call_id: "call_browser_text_once",
          name: "create_text_node",
          arguments: { content: "只创建一次", x: 720, y: 280 },
        }],
      };
    } else {
      const continuationCount = turnRequests.filter((item) => item.run_id === payload.run_id && item.tool_outputs?.length).length;
      const declined = payload.tool_outputs?.some((item) => item.output?.code === "user_declined");
      const initialPrompt = turnRequests.find((item) => item.run_id === payload.run_id && item.prompt)?.prompt || "";
      turn = declined
        ? { response_id: "resp_browser_declined_done", message: "好的，这一步没有执行。", tool_calls: [] }
        : initialPrompt === "先建节点，不要生成"
        ? { response_id: "resp_browser_prepare_done", message: "已创建生图节点，尚未执行生成。", tool_calls: [] }
        : String(initialPrompt).startsWith("直接生成一张") && continuationCount === 1
        ? {
            response_id: "resp_browser_direct_duplicate",
            message: "",
            tool_calls: [{
              call_id: `call_browser_direct_image_${payload.run_id}`,
              name: "generate_image_to_gallery",
              arguments: { prompt: initialPrompt.includes("延迟") ? "延迟生成测试图片" : "一颗红苹果，干净背景", model: null, size: null, resolution: null, reference_node_ids: [], title: "苹果图集" },
            }],
          }
        : String(initialPrompt).startsWith("直接生成一张") && continuationCount === 2
        ? {
            response_id: "resp_browser_direct_conflict",
            message: "",
            tool_calls: [{
              call_id: `call_browser_direct_image_${payload.run_id}`,
              name: "generate_image_to_gallery",
              arguments: { prompt: "复用标识但更换为青苹果", model: null, size: null, resolution: null, reference_node_ids: [], title: "冲突图集" },
            }],
          }
        : String(initialPrompt).startsWith("直接生成一张")
        ? { response_id: "resp_browser_direct_done", message: "图片已生成并加入图集。", tool_calls: [] }
        : continuationCount === 1
        ? {
            response_id: "resp_browser_duplicate",
            message: "",
            tool_calls: [{
              call_id: "call_browser_text_once",
              name: "create_text_node",
              arguments: { content: "只创建一次", x: 720, y: 280 },
            }],
          }
        : { response_id: "resp_browser_done", message: "幂等执行完成。", tool_calls: [] };
    }
    const responseDelay = ["你好", "等待停止", "等待重置", "新任务"].includes(payload.prompt)
      ? 350
      : Array.isArray(payload.tool_outputs)
        ? 180
        : 40;
    await new Promise((resolve) => setTimeout(resolve, responseDelay));
    const events = [
      { type: "status", stage: "understanding" },
      ...(payload.prompt === "你好" ? [{ type: "status", stage: "recovering" }, { type: "status", stage: "resumed" }] : []),
      { type: "turn", turn },
    ];
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      body: `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
    });
  });

  try {
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await page.locator("#canvasAgentPanel").waitFor({ state: "attached" });
    assert.equal(await page.locator("#canvasAgentToggle").getAttribute("aria-expanded"), "false");
    assert.equal(await page.locator(".canvas-workspace").evaluate((element) => element.classList.contains("canvas-agent-open")), false);
    assert.equal(await page.locator("#canvasAgentPanel").getAttribute("aria-hidden"), "true");
    assert.equal(await page.locator("#canvasAgentPanel").getAttribute("inert"), "");
    assert.equal(await page.locator("#canvasAgentPrompt").evaluate((element) => {
      element.focus();
      return document.activeElement === element;
    }), false);
    await page.locator("#canvasAgentToggle").click();
    assert.equal(await page.locator("#canvasAgentToggle").getAttribute("aria-expanded"), "true");
    assert.equal(await page.evaluate(() => localStorage.getItem("canvas-agent-panel-open-v1")), "true");
    assert.equal(await page.locator("#canvasAgentPanel").getAttribute("aria-hidden"), "false");
    assert.equal(await page.locator("#canvasAgentPanel").getAttribute("inert"), null);
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#canvasAgentPanel").waitFor({ state: "attached" });
    assert.equal(await page.locator("#canvasAgentToggle").getAttribute("aria-expanded"), "true");
    await page.locator("#canvasAgentClose").click();
    assert.equal(await page.locator("#canvasAgentToggle").getAttribute("aria-expanded"), "false");
    assert.equal(await page.evaluate(() => localStorage.getItem("canvas-agent-panel-open-v1")), "false");
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("#canvasAgentPanel").waitFor({ state: "attached" });
    assert.equal(await page.locator("#canvasAgentToggle").getAttribute("aria-expanded"), "false");
    assert.equal(await page.locator("#canvasAgentPanel").getAttribute("inert"), "");
    await page.locator("#canvasAgentToggle").click();
    // The workspace width animates when the Agent opens.  Wait for that
    // transition before checking the visible-centering contract.
    await page.waitForTimeout(220);
    await page.evaluate(() => {
      document.querySelector(".canvas-start-gate")?.classList.add("is-dismissed");
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="420"><rect width="100%" height="100%" fill="#6b8f71"/><circle cx="160" cy="170" r="95" fill="#f4d35e"/></svg>';
      const node = window.addCanvasImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, "浏览器验收图", { x: 220, y: 180 });
      window.setCanvasNodePoint?.(node, { x: 220, y: 180 });
      window.selectCanvasNode?.(node);
    });

    const node = page.locator("#canvasPlane .canvas-node-image").last();
    await node.waitFor({ state: "visible" });
    await page.locator('#canvasAgentContext [data-agent-context-key]:not([data-agent-context-key="skill"])').waitFor({ state: "visible" });

    const canvasProblemSolving = await page.evaluate(async () => {
      window.ensureCanvasBoardIdentity?.();
      const boardId = String(canvasState.activeBoardId || "");
      const source = document.querySelector("#canvasPlane .canvas-node-image");
      const context = {
        scope: { boardId },
        assertActive: () => true,
        isActive: () => true,
        forEachBatched: async (items, handler) => {
          const results = [];
          for (let index = 0; index < items.length; index += 1) results.push(await handler(items[index], index));
          return results;
        },
      };
      const companion = window.addCanvasImage(
        "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='420'%3E%3Crect width='240' height='420' fill='%237b6ad9'/%3E%3C/svg%3E",
        "待整理图片",
        { x: 720, y: 520 },
      );
      companion.dataset.boardId = boardId;
      const gallery = window.addCanvasGallery({ x: 480, y: 280 });
      gallery.dataset.boardId = boardId;
      canvasState.connections.push(
        { from: source.dataset.id, to: gallery.dataset.id, toPort: "input" },
        { from: companion.dataset.id, to: gallery.dataset.id, toPort: "input" },
      );
      const focus = await window.CanvasAgentCanvasApi.focusNodes([source.dataset.id], context);
      const organized = await window.CanvasAgentCanvasApi.organizeNodes({
        node_ids: [source.dataset.id, gallery.dataset.id, companion.dataset.id],
        direction: "auto",
        gap: 72,
        center_view: true,
      }, context);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const sourceRectAfterOrganization = source.getBoundingClientRect();
      const companionRectAfterOrganization = companion.getBoundingClientRect();
      const galleryRectAfterOrganization = gallery.getBoundingClientRect();
      const viewportRect = document.querySelector("#infiniteCanvas").getBoundingClientRect();
      const organizedLeft = Math.min(sourceRectAfterOrganization.left, companionRectAfterOrganization.left, galleryRectAfterOrganization.left);
      const organizedRight = Math.max(sourceRectAfterOrganization.right, companionRectAfterOrganization.right, galleryRectAfterOrganization.right);
      const cropped = await window.CanvasAgentCanvasApi.cropImage({
        node_id: source.dataset.id,
        aspect_ratio: "1:1",
        position: "center",
        create_copy: true,
      }, context);
      const mask = await window.CanvasAgentCanvasApi.openMaskEditor(source.dataset.id, context);
      const sourceRect = source.getBoundingClientRect();
      const companionRect = companion.getBoundingClientRect();
      return {
        focus,
        organized,
        cropped,
        mask,
        sourceFocused: source.classList.contains("is-agent-focus"),
        cropExists: Boolean(document.querySelector(`.canvas-node[data-id="${cropped.node_id}"]`)),
        maskOpen: Boolean(document.querySelector(".canvas-mask-modal")),
        workflowLayered: galleryRectAfterOrganization.left > Math.max(sourceRectAfterOrganization.right, companionRectAfterOrganization.right),
        upstreamStacked: companionRectAfterOrganization.top > sourceRectAfterOrganization.bottom,
        centerDelta: ((organizedLeft + organizedRight) / 2) - ((viewportRect.left + viewportRect.right) / 2),
        centered: Math.abs(((organizedLeft + organizedRight) / 2) - ((viewportRect.left + viewportRect.right) / 2)) < 10,
      };
    });
    assert.equal(canvasProblemSolving.focus.focused, true);
    assert.equal(canvasProblemSolving.sourceFocused, true);
    assert.equal(canvasProblemSolving.organized.organized_count, 3);
    assert.equal(canvasProblemSolving.organized.direction, "workflow");
    assert.equal(canvasProblemSolving.organized.focused, true);
    assert.equal(canvasProblemSolving.workflowLayered, true);
    assert.equal(canvasProblemSolving.upstreamStacked, true);
    assert.equal(canvasProblemSolving.centered, true, `organized nodes should be centered; delta=${canvasProblemSolving.centerDelta}`);
    assert.equal(canvasProblemSolving.cropped.created_copy, true);
    assert.equal(canvasProblemSolving.cropExists, true);
    assert.equal(canvasProblemSolving.mask.editor_open, true);
    assert.equal(canvasProblemSolving.maskOpen, true);
    await page.locator(".canvas-mask-close").click();

    assert.equal(await page.locator("#canvasAgentMode").textContent(), "自动");
    assert.equal(await page.locator(".canvas-agent-skill.active").count(), 0);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.locator("#canvasAgentPrompt").fill("你好");
    await page.locator("#canvasAgentSend").click();
    const waiting = page.locator(".canvas-agent-waiting");
    await waiting.waitFor({ state: "visible" });
    assert.equal(await page.locator(".canvas-agent-waiting-bar").count(), 4);
    assert.equal(await page.locator(".canvas-agent-waiting-bar").first().evaluate((element) => getComputedStyle(element).animationName), "none");
    assert.equal((await page.locator("#canvasAgentStatus").textContent()).trim(), "");
    const messagePositions = await page.evaluate(() => ({
      waitingLeft: document.querySelector(".canvas-agent-waiting")?.getBoundingClientRect().left,
      userLeft: document.querySelector(".canvas-agent-message.is-user")?.getBoundingClientRect().left,
    }));
    assert.ok(messagePositions.waitingLeft < messagePositions.userLeft, "waiting animation should appear opposite the user message");
    await page.screenshot({ path: path.join(ROOT, "artifacts", "canvas-agent-waiting-feedback.png"), fullPage: true });
    await page.getByText("你好，我可以直接协助你操作画布。").waitFor({ state: "visible" });
    assert.equal(await page.locator(".canvas-agent-waiting").count(), 0);
    const originalTheme = await page.evaluate(() => document.documentElement.dataset.theme || "");
    const userMessage = page.locator(".canvas-agent-message.is-user").first();
    await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
    const darkUserMessageVisual = await userMessage.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        ariaLabel: element.getAttribute("aria-label"),
        visibleRoleLabels: element.querySelectorAll(":scope > strong").length,
        width: element.getBoundingClientRect().width,
        backgroundColor: style.backgroundColor,
        color: style.color,
        borderColor: style.borderTopColor,
      };
    });
    assert.equal(darkUserMessageVisual.ariaLabel, "用户消息");
    assert.equal(darkUserMessageVisual.visibleRoleLabels, 0, "user messages should not show a visible role label");
    assert.ok(darkUserMessageVisual.width >= 88, `short user messages should remain comfortably wide, got ${darkUserMessageVisual.width}px`);
    assert.equal(darkUserMessageVisual.backgroundColor, "rgba(255, 255, 255, 0.075)");
    assert.equal(darkUserMessageVisual.color, "rgb(237, 237, 240)");
    assert.notEqual(darkUserMessageVisual.borderColor, "rgba(0, 0, 0, 0)");
    await page.screenshot({ path: path.join(ROOT, "artifacts", "canvas-agent-user-message-dark.png"), fullPage: true });

    await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
    const lightUserMessageVisual = await userMessage.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        color: style.color,
        borderColor: style.borderTopColor,
      };
    });
    assert.equal(lightUserMessageVisual.backgroundColor, "rgba(246, 245, 243, 0.96)");
    assert.equal(lightUserMessageVisual.color, "rgb(43, 43, 47)");
    assert.notEqual(lightUserMessageVisual.borderColor, "rgba(0, 0, 0, 0)");
    assert.notEqual(lightUserMessageVisual.backgroundColor, darkUserMessageVisual.backgroundColor);
    await page.screenshot({ path: path.join(ROOT, "artifacts", "canvas-agent-user-message-light.png"), fullPage: true });
    await page.evaluate((theme) => {
      if (theme) document.documentElement.dataset.theme = theme;
      else delete document.documentElement.dataset.theme;
    }, originalTheme);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    assert.equal(turnRequests.length, 1);
    assert.equal(turnRequests[0].skill_mode, "auto");
    assert.equal(turnRequests[0].skill_id, "");
    assert.ok(turnRequests[0].board_id);
    assert.deepEqual(turnRequests[0].conversation_context, []);
    assert.equal(turnRequests[0].canvas.selected_node_ids.length, 1);
    assert.doesNotMatch(await page.locator("#canvasAgentPanel").textContent(), /test-agent-model|must-not-leak-model/);

    await page.locator("#canvasAgentPrompt").fill("等待停止");
    await page.locator("#canvasAgentSend").click();
    await page.locator(".canvas-agent-waiting").waitFor({ state: "visible" });
    assert.equal(
      await page.locator(".canvas-agent-waiting-bar").first().evaluate((element) => getComputedStyle(element).animationName),
      "canvasAgentWaitingBar",
    );
    await page.locator("#canvasAgentStop").click();
    assert.equal(await page.locator(".canvas-agent-waiting").count(), 0);
    assert.equal((await page.locator("#canvasAgentStatus").textContent()).trim(), "已停止");

    assert.equal(await page.locator("#canvasAgentNew").count(), 0);
    assert.equal(await page.getByText("你好，我可以直接协助你操作画布。").count(), 1);

    await page.locator("#canvasAgentPrompt").fill("触发失败");
    await page.locator("#canvasAgentSend").click();
    await page.locator(".canvas-agent-waiting").waitFor({ state: "visible" });
    await page.getByText("连接刚才短暂中断，已保留已经完成的画布操作。可以继续任务。").waitFor({ state: "visible" });
    assert.equal((await page.locator("#canvasAgentPanel").textContent()).includes("call_browser_trace"), false);
    assert.equal(await page.locator("[data-agent-continue]").count(), 1);
    assert.equal(await page.locator(".canvas-agent-waiting").count(), 0);
    assert.equal((await page.locator("#canvasAgentStatus").textContent()).trim(), "任务已保留");

    await page.evaluate(() => {
      window.__originalRunCanvasImageEdit = window.runCanvasImageEdit;
      window.runCanvasImageEdit = () => new Promise((resolve) => {
        window.__canvasAgentOldToolStarted = true;
        window.__resolveCanvasAgentOldTool = resolve;
      });
    });
    await page.locator("#canvasAgentPrompt").fill("执行旧任务");
    await page.locator("#canvasAgentSend").click();
    await page.locator("#canvasAgentApproval").waitFor({ state: "visible" });
    await page.locator("#canvasAgentApprove").click();
    await page.waitForFunction(() => window.__canvasAgentOldToolStarted === true);
    await page.locator("#canvasAgentStop").click();
    await page.locator("#canvasAgentPrompt").fill("新任务");
    await page.locator("#canvasAgentSend").click();
    await page.locator(".canvas-agent-waiting").waitFor({ state: "visible" });
    assert.equal(await page.locator(".canvas-agent-waiting").count(), 1);
    await page.evaluate(() => {
      window.__resolveCanvasAgentOldTool?.();
      window.runCanvasImageEdit = window.__originalRunCanvasImageEdit;
      delete window.__originalRunCanvasImageEdit;
      delete window.__resolveCanvasAgentOldTool;
    });
    await page.waitForTimeout(100);
    assert.equal(
      turnRequests.filter((item) => item.previous_response_id === "resp_browser_old_tool" && Array.isArray(item.tool_outputs)).length,
      0,
      "a stopped run must not continue after its pending tool resolves",
    );
    assert.equal(await page.locator(".canvas-agent-waiting").count(), 1, "the new run should keep exactly one waiting indicator");
    await page.getByText("新任务已回应。").waitFor({ state: "visible" });
    assert.equal(await page.locator(".canvas-agent-waiting").count(), 0);

    await node.click({ force: true });
    const imageNodeCountBeforeDecline = await page.locator("#canvasPlane .canvas-node-image").count();
    await page.locator("#canvasAgentPrompt").fill("拒绝删除");
    await page.locator("#canvasAgentSend").click();
    await page.locator("#canvasAgentApproval").waitFor({ state: "visible" });
    await page.locator("#canvasAgentDecline").click();
    await page.getByText("好的，这一步没有执行。").waitFor({ state: "visible" });
    assert.equal(await page.locator("#canvasPlane .canvas-node-image").count(), imageNodeCountBeforeDecline);
    const declineRunId = turnRequests.find((item) => item.prompt === "拒绝删除")?.run_id;
    const declineContinuation = turnRequests.find((item) => item.run_id === declineRunId && item.tool_outputs?.length);
    assert.equal(declineContinuation.tool_outputs[0].output.code, "user_declined");

    const textNodeCount = await page.locator("#canvasPlane .canvas-node-text").count();
    await page.locator("#canvasAgentPrompt").fill("创建一个文字节点");
    await page.locator("#canvasAgentSend").click();
    await page.locator(".canvas-agent-tool-step").last().waitFor({ state: "visible" });
    await page.locator(".canvas-agent-waiting").waitFor({ state: "visible" });
    assert.equal(await page.locator(".canvas-agent-waiting").count(), 1);
    await page.getByText("幂等执行完成。").waitFor({ state: "visible" });
    assert.equal(await page.locator("#canvasPlane .canvas-node-text").count(), textNodeCount + 1);
    const toolRunId = turnRequests.find((item) => item.prompt === "创建一个文字节点")?.run_id;
    const toolRunRequests = turnRequests.filter((item) => item.run_id === toolRunId);
    assert.equal(toolRunRequests.length, 3);
    assert.equal(toolRunRequests[1].tool_outputs[0].call_id, "call_browser_text_once");
    assert.deepEqual(toolRunRequests[2].tool_outputs[0].output, toolRunRequests[1].tool_outputs[0].output);
    assert.ok(
      toolRunRequests[0].conversation_context.some((item) => item.role === "assistant" && item.content.includes("你好，我可以直接协助你操作画布")),
      "later turns should include the current canvas conversation",
    );

    await page.locator("#canvasAgentSkillBook").click();
    await page.locator("#canvasAgentSkillPopover").waitFor({ state: "visible" });
    assert.equal(await page.locator(".canvas-agent-skill").count(), 5);
    await page.locator(".canvas-agent-skill").first().click();
    await page.locator('[data-agent-context-key="skill"]').waitFor({ state: "visible" });
    assert.notEqual(await page.locator("#canvasAgentMode").textContent(), "自动");
    await page.locator('[data-agent-context-key="skill"] [data-remove-agent-context]').click();
    assert.equal(await page.locator("#canvasAgentMode").textContent(), "自动");

    await page.evaluate(() => window.clearCanvasSelection?.());
    await page.locator("#canvasAgentPrompt").fill("请参考 @");
    await page.locator("#canvasAgentMentionPopover").waitFor({ state: "visible" });
    await page.locator("[data-agent-mention-id]").first().click();
    assert.match(await page.locator("#canvasAgentPrompt").inputValue(), /@浏览器验收图/);
    await page.locator('#canvasAgentContext [data-agent-context-key]:not([data-agent-context-key="skill"])').waitFor({ state: "visible" });

    const originalBoardId = turnRequests[0].board_id;
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("canvas:board-changed", { detail: { boardId: "browser_second_board" } }));
    });
    await page.getByText("Hi，一起创作点什么？").waitFor({ state: "visible" });
    assert.equal(await page.getByText("你好，我可以直接协助你操作画布。").count(), 0);
    await page.evaluate((boardId) => {
      window.dispatchEvent(new CustomEvent("canvas:board-changed", { detail: { boardId } }));
    }, originalBoardId);
    await page.getByText("你好，我可以直接协助你操作画布。").waitFor({ state: "visible" });

    await page.evaluate(() => restoreCanvasBoard({
      id: "browser_direct_image_board",
      title: "直接生图验收",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [],
      connections: [],
      viewport: { x: 80, y: 60, scale: 1 },
    }));
    await page.getByText("Hi，一起创作点什么？").waitFor({ state: "visible" });
    const directRequestsBefore = imageGenerationRequests;
    await page.locator("#canvasAgentPrompt").fill("直接生成一张苹果图片");
    await page.locator("#canvasAgentSend").click();
    await page.getByText("图片已生成并加入图集。").waitFor({ state: "visible", timeout: 8000 });
    assert.equal(imageGenerationRequests, directRequestsBefore + 1, "duplicate MCP call_id must not repeat a paid image request");
    const directRunId = turnRequests.find((item) => item.prompt === "直接生成一张苹果图片")?.run_id;
    const directContinuations = turnRequests.filter((item) => item.run_id === directRunId && item.tool_outputs?.length);
    assert.equal(directContinuations.length, 3);
    assert.deepEqual(directContinuations[1].tool_outputs[0].output, directContinuations[0].tool_outputs[0].output, "an exact duplicate call must reuse the completed paid result");
    assert.equal(directContinuations[2].tool_outputs[0].output.code, "call_id_conflict", "a reused call_id with changed arguments must be rejected without another paid request");
    assert.equal(await page.locator("#canvasAgentApproval").isVisible(), false, "an explicit single-image request should not require a second confirmation");
    assert.equal(await page.locator("#canvasPlane .canvas-node-image").count(), 1);
    assert.equal(await page.locator("#canvasPlane .canvas-node-gallery").count(), 1);
    const directWorkflow = await page.evaluate(() => {
      const generator = document.querySelector("#canvasPlane .canvas-node-image");
      const gallery = document.querySelector("#canvasPlane .canvas-node-gallery");
      const viewport = document.querySelector("#infiniteCanvas").getBoundingClientRect();
      const panel = document.querySelector("#canvasAgentPanel").getBoundingClientRect();
      const generatorRect = generator.getBoundingClientRect();
      const galleryRect = gallery.getBoundingClientRect();
      return {
        generatorId: generator.dataset.id,
        galleryId: gallery.dataset.id,
        selectedModel: generator.querySelector(".canvas-node-model")?.value || "",
        imageCount: JSON.parse(gallery.dataset.galleryImages || "[]").length,
        connected: canvasState.connections.some((item) => item.from === generator.dataset.id && item.to === gallery.dataset.id),
        viewportCenterX: viewport.left + viewport.width / 2,
        viewportCenterY: viewport.top + viewport.height / 2,
        groupCenterX: (Math.min(generatorRect.left, galleryRect.left) + Math.max(generatorRect.right, galleryRect.right)) / 2,
        groupCenterY: (Math.min(generatorRect.top, galleryRect.top) + Math.max(generatorRect.bottom, galleryRect.bottom)) / 2,
        intersectsPanel: generatorRect.right > panel.left || galleryRect.right > panel.left,
      };
    });
    assert.equal(directWorkflow.selectedModel, "gpt-image-2");
    assert.equal(directWorkflow.imageCount, 1);
    assert.equal(directWorkflow.connected, true);
    assert.ok(Math.abs(directWorkflow.viewportCenterX - directWorkflow.groupCenterX) <= 24);
    assert.ok(Math.abs(directWorkflow.viewportCenterY - directWorkflow.groupCenterY) <= 24);
    assert.equal(directWorkflow.intersectsPanel, false);

    await page.evaluate(() => restoreCanvasBoard({
      id: "browser_image_api_failover_board",
      title: "生图接口切换验收",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [],
      connections: [],
      viewport: { x: 80, y: 60, scale: 1 },
    }));
    imageFailoverEnabled = true;
    imageFailoverPrimaryRejected = false;
    imageFailoverAttempts.length = 0;
    await page.evaluate(() => {
      canvasImageModelCandidates = [];
      canvasImageModelsLoadPromise = null;
    });
    const failoverImagesBefore = imageGenerationRequests;
    await page.locator("#canvasAgentPrompt").fill("直接生成一张自动切换接口的苹果图片");
    await page.locator("#canvasAgentSend").click();
    await page.getByText("图片已生成并加入图集。").waitFor({ state: "visible", timeout: 8000 });
    assert.equal(imageGenerationRequests, failoverImagesBefore + 2, "a quota rejection should try one eligible backup API");
    assert.deepEqual(imageFailoverAttempts, ["primary-image2", "backup-image2"]);
    const imageFailoverRunId = turnRequests.find((item) => item.prompt === "直接生成一张自动切换接口的苹果图片")?.run_id;
    const imageFailoverOutput = turnRequests.find((item) => (
      item.run_id === imageFailoverRunId && item.tool_outputs?.[0]?.call_id === `call_browser_direct_image_${imageFailoverRunId}`
    ))?.tool_outputs?.[0]?.output;
    assert.equal(imageFailoverOutput?.fallback?.to, "backup-image2");
    assert.equal(await page.locator("#canvasPlane .canvas-node-image").count(), 1);
    assert.equal(await page.locator("#canvasPlane .canvas-node-gallery").count(), 1);
    assert.equal(await page.locator("#canvasPlane .canvas-node-image .canvas-node-model").inputValue(), "backup-image2");
    const preflightAttemptsBefore = imageFailoverAttempts.length;
    const preflightImagesBefore = imageGenerationRequests;
    const preflightResult = await page.evaluate(async () => {
      const node = document.querySelector("#canvasPlane .canvas-node-image");
      const model = node.querySelector(".canvas-node-model");
      fillCanvasNodeModelSelect(model, "primary-image2");
      model.value = "primary-image2";
      node.dataset.canvasModel = "primary-image2";
      return runCanvasImageEdit(node, { autoFailover: true });
    });
    assert.equal(preflightResult?.ok, true);
    assert.equal(preflightResult?.fallback?.reason, "preflight");
    assert.equal(imageGenerationRequests, preflightImagesBefore + 1, "an unhealthy existing node should switch before a paid request");
    assert.deepEqual(imageFailoverAttempts.slice(preflightAttemptsBefore), ["backup-image2"]);
    assert.equal(await page.locator("#canvasPlane .canvas-node-image .canvas-node-model").inputValue(), "backup-image2");
    imageFailoverEnabled = false;

    await page.evaluate(() => restoreCanvasBoard({
      id: "browser_agent_node_busy_board",
      title: "Agent 节点生成状态验收",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [],
      connections: [],
      viewport: { x: 80, y: 60, scale: 1 },
    }));
    await page.locator("#canvasAgentPrompt").fill("直接生成一张延迟状态苹果图片");
    await page.locator("#canvasAgentSend").click();
    for (let index = 0; index < 80 && !releaseDelayedImage; index += 1) await page.waitForTimeout(25);
    assert.equal(typeof releaseDelayedImage, "function", "the Agent image request should be in flight");
    const busyRunButton = page.locator("#canvasPlane .canvas-node-image .canvas-node-run");
    await busyRunButton.waitFor({ state: "visible" });
    assert.equal(await busyRunButton.isDisabled(), true, "the node run button should stay disabled while Agent generation is running");
    assert.match(await busyRunButton.innerText(), /生成中/);
    assert.equal(await busyRunButton.getAttribute("aria-busy"), "true");
    releaseDelayedImage();
    releaseDelayedImage = null;
    await page.getByText("图片已生成并加入图集。").waitFor({ state: "visible", timeout: 8000 });
    assert.equal(await busyRunButton.isDisabled(), false);
    assert.equal(await busyRunButton.getAttribute("aria-busy"), null);
    assert.match(await busyRunButton.innerText(), /^生成/);

    await page.evaluate(() => restoreCanvasBoard({
      id: "browser_direct_image_fallback_board",
      title: "断线直接生图验收",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [],
      connections: [],
      viewport: { x: 80, y: 60, scale: 1 },
    }));
    const fallbackRequestsBefore = imageGenerationRequests;
    await page.locator("#canvasAgentPrompt").fill("直接生成一张断线苹果图片");
    await page.locator("#canvasAgentSend").click();
    await page.getByText("图片已生成并加入画布图集。你可以继续让我调整或延展。").waitFor({ state: "visible", timeout: 8000 });
    assert.equal(imageGenerationRequests, fallbackRequestsBefore + 1, "recoverable Agent failure should use the MCP image fallback exactly once");
    assert.equal(await page.locator("#canvasPlane .canvas-node-image").count(), 1);
    assert.equal(await page.locator("#canvasPlane .canvas-node-gallery").count(), 1);
    const fallbackRunId = turnRequests.find((item) => item.prompt === "直接生成一张断线苹果图片")?.run_id;
    assert.equal(turnRequests.filter((item) => item.run_id === fallbackRunId).length, 1, "terminal MCP fallback must not call the failed LLM again");

    await page.evaluate(() => restoreCanvasBoard({
      id: "browser_partial_disconnect_board",
      title: "部分执行后断线验收",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [],
      connections: [],
      viewport: { x: 80, y: 60, scale: 1 },
    }));
    const partialDisconnectImagesBefore = imageGenerationRequests;
    await page.locator("#canvasAgentPrompt").fill("生成一个苹果图片并添加说明文字");
    await page.locator("#canvasAgentSend").click();
    await page.getByRole("button", { name: "继续任务" }).waitFor({ state: "visible", timeout: 8000 });
    assert.equal(await page.locator("#canvasPlane .canvas-node-text").count(), 1, "the first successful canvas tool should remain on the board");
    assert.equal(await page.locator("#canvasPlane .canvas-node-image").count(), 0, "a continuation failure must not launch the direct-image fallback");
    assert.equal(imageGenerationRequests, partialDisconnectImagesBefore, "a continuation failure must not issue a duplicate paid image request");

    await page.evaluate(() => restoreCanvasBoard({
      id: "browser_delayed_model_discovery_board",
      title: "延迟模型发现验收",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [],
      connections: [],
      viewport: { x: 80, y: 60, scale: 1 },
    }));
    delayNextImageModels = true;
    await page.evaluate(() => {
      canvasImageModelCandidates = [];
      canvasImageModelsLoadPromise = null;
    });
    await page.locator("#canvasAgentPrompt").fill("直接生成一张模型等待苹果图片");
    await page.locator("#canvasAgentSend").click();
    for (let index = 0; index < 80 && !releaseDelayedImageModels; index += 1) await page.waitForTimeout(25);
    assert.equal(typeof releaseDelayedImageModels, "function", "image model discovery should be waiting before any node is created");
    await page.evaluate(() => restoreCanvasBoard({
      id: "browser_after_model_discovery_switch",
      title: "模型发现后切换画布",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [],
      connections: [],
      viewport: { x: 80, y: 60, scale: 1 },
    }));
    releaseDelayedImageModels();
    releaseDelayedImageModels = null;
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => String(canvasState.activeBoardId || "")), "browser_after_model_discovery_switch");
    assert.equal(await page.locator("#canvasPlane .canvas-node").count(), 0, "late image-model discovery must not create a node on the new board");

    await page.evaluate(() => restoreCanvasBoard({
      id: "browser_discussion_board",
      title: "讨论验收",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [],
      connections: [],
      viewport: { x: 80, y: 60, scale: 1 },
    }));
    const discussionRequestsBefore = imageGenerationRequests;
    await page.locator("#canvasAgentPrompt").fill("苹果海报怎么设计");
    await page.locator("#canvasAgentSend").click();
    await page.getByText("可以先从构图、光线和色彩方向讨论。").waitFor({ state: "visible" });
    assert.equal(imageGenerationRequests, discussionRequestsBefore);
    assert.equal(await page.locator("#canvasPlane .canvas-node").count(), 0);

    await page.evaluate(() => restoreCanvasBoard({
      id: "browser_prepare_board",
      title: "准备验收",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [],
      connections: [],
      viewport: { x: 80, y: 60, scale: 1 },
    }));
    const prepareRequestsBefore = imageGenerationRequests;
    await page.locator("#canvasAgentPrompt").fill("先建节点，不要生成");
    await page.locator("#canvasAgentSend").click();
    await page.getByText("已创建生图节点，尚未执行生成。").waitFor({ state: "visible" });
    assert.equal(imageGenerationRequests, prepareRequestsBefore);
    assert.equal(await page.locator("#canvasPlane .canvas-node-image").count(), 1);
    assert.equal(await page.locator("#canvasPlane .canvas-node-gallery").count(), 0);

    await page.evaluate(() => restoreCanvasBoard({
      id: "browser_delayed_image_board",
      title: "延迟生图验收",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [],
      connections: [],
      viewport: { x: 80, y: 60, scale: 1 },
    }));
    await page.locator("#canvasAgentPrompt").fill("直接生成一张延迟图片");
    await page.locator("#canvasAgentSend").click();
    for (let index = 0; index < 80 && !releaseDelayedImage; index += 1) await page.waitForTimeout(25);
    assert.equal(typeof releaseDelayedImage, "function", "the delayed image request should have started");
    await page.evaluate(() => restoreCanvasBoard({
      id: "browser_after_delayed_switch",
      title: "切换后的画布",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [],
      connections: [],
      viewport: { x: 80, y: 60, scale: 1 },
    }));
    releaseDelayedImage();
    releaseDelayedImage = null;
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => String(canvasState.activeBoardId || "")), "browser_after_delayed_switch");
    assert.equal(await page.locator("#canvasPlane .canvas-node").count(), 0, "a late paid response must not mutate the new board");
    assert.equal(await page.getByText("图片已生成并加入图集。").count(), 0, "a late old-board response must not report completion in the new board");

    await page.locator('[data-tool="settings"]').click();
    const apiVerify = page.locator('[data-settings-action="verify-provider-agent"][data-model-id="stable-agent"]');
    await apiVerify.waitFor({ state: "visible" });
    await apiVerify.click();
    await page.locator('[data-settings-action="verify-provider-agent"][data-model-id="stable-agent"]').getByText("Agent 已验证").waitFor({ state: "visible" });
    assert.equal(await page.locator('[data-settings-action="verify-provider-agent"][data-model-id="stable-agent"]').isDisabled(), false, "verified API row must leave its loading state immediately");
    assert.deepEqual(agentVerificationPayloads[0], { providerId: "agent-provider-primary", modelId: "stable-agent" });
    await page.locator('[data-settings-tab="agent-models"]').click();
    await page.getByText("当前主模型").waitFor({ state: "visible" });
    await page.locator(".agent-pending-section").evaluate((element) => { element.open = true; });
    const pendingList = page.locator(".agent-candidate-list");
    const pendingVerify = page.locator('[data-agent-candidate-verify][data-model-id="backup-agent-14"]');
    await pendingVerify.evaluate((element) => element.scrollIntoView({ block: "center" }));
    await pendingVerify.waitFor({ state: "visible" });
    const pendingScrollBefore = await pendingList.evaluate((element) => element.scrollTop);
    assert.ok(pendingScrollBefore > 0, "the pending candidate fixture should be scrollable");
    await pendingVerify.click();
    await page.getByText("正在连接接口…").waitFor({ state: "visible" });
    assert.equal(await pendingList.evaluate((element) => element.scrollTop), pendingScrollBefore, "verification should not reset the pending list scroll position");
    assert.equal(await pendingVerify.textContent(), "验证中");
    assert.notEqual(
      await page.locator('[data-agent-candidate-verify][data-model-id="backup-agent-01"]').textContent(),
      "验证中",
      "only the clicked model should enter verification state",
    );
    await page.getByText("正在验证文本与工具调用…").waitFor({ state: "visible" });
    assert.equal(await pendingList.evaluate((element) => element.scrollTop), pendingScrollBefore, "verification phase changes should preserve scroll position");
    await page.locator('[data-agent-candidate-id="agent-choice-backup"]').waitFor({ state: "visible" });
    assert.equal(agentVerificationRequests, 2, "each verification click should send exactly one request");
    assert.deepEqual(agentVerificationPayloads[1], { providerId: "agent-provider-pending", modelId: "backup-agent-14" });
    await page.locator('[data-settings-action="set-agent-primary"][data-candidate-id="agent-choice-backup"]').click();
    assert.equal(await page.locator(".agent-model-hero h3").textContent(), "backup-agent-14");
    assert.equal(settingsFixture.agentRouting.primaryCandidateId, "", "primary selection should remain a draft until settings are saved");
    await page.locator('[data-settings-action="save"]').click();
    await page.getByText("设置已保存，模型列表已更新").waitFor({ state: "visible" });
    assert.deepEqual(settingsSavePayloads.at(-1).agentRouting, {
      primaryCandidateId: "agent-choice-backup",
      candidateOrder: ["agent-choice-backup", "agent-choice-primary"],
    }, "saving should persist the selected primary and fixed backup order");
    await page.screenshot({ path: path.join(ROOT, "artifacts", "agent-model-settings.png"), fullPage: true });

    const autoVerificationBaseline = agentVerificationRequests;
    verifiedPendingAgentModelId = "";
    autoVerificationEnabled = true;
    await page.locator('[data-settings-action="refresh-agent-candidates"]').click();
    for (let index = 0; index < 80 && agentVerificationRequests === autoVerificationBaseline; index += 1) await page.waitForTimeout(25);
    assert.equal(agentVerificationRequests, autoVerificationBaseline + 1, "opening the Agent model page should start one serial automatic verification");
    await page.locator("#settingsView .canvas-overlay-close").click();
    await page.waitForTimeout(900);
    assert.equal(agentVerificationRequests, autoVerificationBaseline + 1, "closing Settings must abort the current automatic verification before a second request starts");

    await page.locator('[data-tool="settings"]').click();
    for (let index = 0; index < 80 && agentVerificationRequests === autoVerificationBaseline + 1; index += 1) await page.waitForTimeout(25);
    assert.equal(agentVerificationRequests, autoVerificationBaseline + 2, "reopening Settings should reset the automatic verification attempt budget");
    await page.locator("#settingsView .canvas-overlay-close").click();
    await page.waitForTimeout(900);
    assert.equal(agentVerificationRequests, autoVerificationBaseline + 2, "the reopened session must also stop cleanly when Settings closes");

    await page.locator('[data-tool="settings"]').click();
    await page.locator('[data-settings-tab="api"]').click();
    await page.locator('[data-settings-action="add-provider"]').click();
    await page.locator('[data-provider-field="name"]').fill("未保存接口");
    await page.locator('[data-provider-field="baseUrl"]').fill("https://draft.test/v1");
    await page.locator('[data-provider-field="apiKey"]').fill("draft-key");
    await page.locator('[data-settings-action="fetch-models"]').click();
    await page.locator('[data-fetched-model="draft-agent"]').click();
    await page.locator('[data-settings-action="add-selected-models"]').click();
    const draftVerify = page.locator('[data-settings-action="verify-provider-agent"][data-model-id="draft-agent"]');
    await draftVerify.click();
    for (let index = 0; index < 80 && agentVerificationPayloads.at(-1)?.modelId !== "draft-agent"; index += 1) await page.waitForTimeout(25);
    const draftVerificationPayload = agentVerificationPayloads.at(-1);
    assert.equal(draftVerificationPayload.modelId, "draft-agent");
    assert.equal(draftVerificationPayload.draftProvider.name, "未保存接口");
    assert.equal(draftVerificationPayload.draftProvider.baseUrl, "https://draft.test/v1");
    assert.equal(draftVerificationPayload.draftProvider.apiKey, "draft-key");
    assert.deepEqual(draftVerificationPayload.draftProvider.models, [{ id: "draft-agent", capabilities: [] }]);
    await page.getByText("已验证，未保存").waitFor({ state: "visible", timeout: 3000 });
    assert.equal(settingsFixture.providers.some((provider) => provider.name === "未保存接口"), false, "a draft verification must not save or route the provider");
    await page.locator('[data-settings-action="save"]').click();
    await page.getByText("设置已保存，模型列表已更新").waitFor({ state: "visible" });
    await page.locator('[data-settings-tab="agent-models"]').click();
    await page.locator('[data-agent-candidate-id="agent-choice-draft"]').waitFor({ state: "visible" });
    await page.locator("#settingsView .canvas-overlay-close").click();

    const metrics = await page.evaluate(() => {
      const panel = document.querySelector("#canvasAgentPanel");
      const skillPopover = document.querySelector("#canvasAgentSkillPopover");
      return {
        panelWidth: panel.getBoundingClientRect().width,
        panelOverflow: panel.scrollWidth - panel.clientWidth,
        skillOverflow: skillPopover.scrollWidth - skillPopover.clientWidth,
      };
    });
    assert.ok(metrics.panelWidth <= 410.5, `panel width should stay within 410px, got ${metrics.panelWidth}`);
    assert.ok(metrics.panelOverflow <= 1, `panel should not overflow horizontally, got ${metrics.panelOverflow}`);
    assert.ok(metrics.skillOverflow <= 1, `skill popover should not overflow horizontally, got ${metrics.skillOverflow}`);

    await page.screenshot({ path: path.join(ROOT, "artifacts", "canvas-agent-natural-interaction.png"), fullPage: true });
    assert.deepEqual(
      browserErrors.filter((message) => !/(?:503 \(Service Unavailable\)|402 \(Payment Required\))/.test(message)),
      [],
    );
  } catch (error) {
    console.error("Canvas agent browser errors:", browserErrors, failedResponses);
    console.error("Canvas agent browser diagnostic:", JSON.stringify({
      imageGenerationRequests,
      apiRequests: apiRequests.slice(-30),
      turnRequests: turnRequests.map((item) => ({
        run_id: item.run_id,
        prompt: item.prompt,
        previous_response_id: item.previous_response_id,
        tool_outputs: item.tool_outputs,
      })),
      panel: await page.locator("#canvasAgentPanel").innerText().catch(() => ""),
      canvas: await page.evaluate(() => ({
        boardLabel: document.querySelector("#canvasZoomLabel")?.textContent || "",
        nodes: Array.from(document.querySelectorAll("#canvasPlane .canvas-node")).map((node) => ({
          id: node.dataset.id,
          classes: node.className,
          status: node.querySelector(".canvas-node-bar span")?.textContent || "",
          prompt: node.querySelector(".canvas-node-prompt")?.value || "",
          model: node.querySelector(".canvas-node-model")?.value || "",
          size: node.querySelector(".canvas-node-size")?.value || "",
          resolution: node.querySelector(".canvas-node-resolution")?.value || "",
        })),
      })).catch(() => null),
    }, null, 2));
    await page.screenshot({ path: path.join(ROOT, "artifacts", "canvas-agent-browser-failure.png"), fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }

  console.log("Canvas agent browser checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
