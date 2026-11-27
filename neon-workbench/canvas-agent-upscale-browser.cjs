"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const origin = "http://127.0.0.1:33200";
const boardId = "agent-upscale-isolated";
const sourceUrl = "/output/qa-upscale-source.svg";
const image = (width, height) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#159887"/></svg>`;
const overrides = {
  "/script.js": "design-sources/script-before-save-bridge.js",
  "/canvas-feature-registry.js": "design-sources/canvas-feature-registry.js",
  "/canvas-features/tool-upscale.js": "design-sources/canvas-features/tool-upscale.js",
  ...Object.fromEntries(["core", "ui", "capabilities", "tool-adapters", "conversation"].map(name =>
    [`/canvas-agent-${name}.js`, `../host-sources/app/canvas-agent-${name}.js`])),
};

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  let page;
  try {
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.setDefaultTimeout(8000);
    const errors = [], nodes = new Map(), edges = new Map(), submitted = [], polled = [];
    let revision = 0, conversation, requested, sourceId, mode = "success", turn = 0, probes = 0, reads = 0;
    let enableAgent = true, modelReply, cutout = false, conflictCount = 0, rejectSave = false;
    const cutoutRequests = [];
    const fashion = { id: "fashion-ecommerce-ai-model-video", label: "服装电商 · AI 模特动态展示", category: "general", origin: "custom" };
    const remoteSkill = { id: "h3-commerce-video", label: "H3 带货视频" };
    const textTurns = [];
    const alternateSession = {
      boardId, conversationId: "upscale-alternate-session", revision: 0,
      items: [{ id: "alternate-reply", role: "assistant", text: "另一条验收会话。" }],
    };
    let activeSessionId;
    page.on("pageerror", error => errors.push(error.message));
    await page.routeWebSocket("**/*", socket => socket.close());
    await page.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) return route.abort();
      if (process.env.AGENT_SOURCE === "1" && overrides[url.pathname]) {
        return route.fulfill({ path: path.join(__dirname, overrides[url.pathname]), contentType: "application/javascript" });
      }
      if (url.pathname === sourceUrl) return route.fulfill({ contentType: "image/svg+xml", body: image(640, 400) });
      if (/^\/output\/qa-cutout-(?:result|auto)\.png$/.test(url.pathname)) {
        return route.fulfill({ contentType: "image/svg+xml", body: image(640, 400) });
      }
      if (url.pathname === "/output/qa-upscale-result.svg") return route.fulfill({ contentType: "image/svg+xml",
        body: mode === "wrong-pixels" ? image(1024, 640) : image(4096, 2560) });
      if (!url.pathname.startsWith("/api/")) return request.method() === "GET" ? route.continue() : route.abort();
      if (url.pathname === "/api/canvas-agent/skills") return route.fulfill({ json: { configured: true,
        agentSettings: { configured: true, candidateCount: 1 }, skills: [fashion, remoteSkill] } });
      if (url.pathname === "/api/canvas-agent/conversation") {
        if (url.searchParams.get("action") === "list") {
          return route.fulfill({ json: { sessions: [conversation, alternateSession].map(session => ({
            conversationId: session.conversationId, title: session.items[0]?.text,
            itemCount: session.items.length, turnCount: 1,
          })) } });
        }
        if (request.method() === "POST") {
          const payload = request.postDataJSON();
          if (payload.action === "activate") {
            activeSessionId = payload.conversation_id;
            return route.fulfill({ json: { ok: true } });
          }
          if (rejectSave) return route.fulfill({ status: 503, json: { error: "验收会话暂不可写。" } });
          if (payload.expected_revision !== conversation?.revision) {
            conflictCount++;
            return route.fulfill({ status: 409, json: { code: "CONVERSATION_REVISION_CONFLICT", current: conversation } });
          }
          conversation = { ...conversation, ...payload.conversation, revision: (conversation?.revision || 0) + 1 };
        }
        if ((url.searchParams.get("conversation_id") || activeSessionId) === alternateSession.conversationId) {
          return route.fulfill({ json: alternateSession });
        }
        return route.fulfill({ json: conversation ||= { boardId, conversationId: "upscale-conversation", revision: 0,
          activeSkillId: fashion.id, items: [] } });
      }
      if (url.pathname === "/api/canvas-agent/turn") {
        const payload = request.postDataJSON();
        assert.equal(payload.skill_id || "", "");
        const id = `upscale-${++turn}`;
        if (cutout) {
          assert.deepEqual(payload.canvas.selected_node_ids, [sourceId]);
          assert.equal(payload.canvas.agent_image_attachments[0].node_id, sourceId);
          return route.fulfill({ json: { request_id: payload.request_id, message_id: payload.message_id, response_id: id,
            tool_calls: [{ name: "remove_canvas_image_background", call_id: id, arguments: { node_id: sourceId, mode: "subject" } }],
            vision_receipt: { count: payload.vision_images?.length || 0, mime_type: "image/jpeg" } } });
        }
        if (modelReply) {
          textTurns.push(payload);
          return route.fulfill({ status: modelReply.error ? 400 : 200, json: modelReply.error
            ? { error: modelReply.error }
            : { request_id: payload.request_id, message_id: payload.message_id,
              response_id: id, message: modelReply.text, tool_calls: [],
              vision_receipt: { count: payload.vision_images?.length || 0, mime_type: "image/jpeg" } } });
        }
        const calls = !enableAgent || requested === "no-tool" || payload.tool_outputs?.length ? [] : [{
          name: "upscale_canvas_image", call_id: id,
          arguments: { node_id: requested === "no-source" ? null : sourceId, resolution: requested === "no-source" ? null : requested },
        }];
        return route.fulfill({ json: { request_id: payload.request_id, message_id: payload.message_id, response_id: id,
          message: calls.length ? "" : "当前无法执行。", tool_calls: calls,
          vision_receipt: { count: payload.vision_images?.length || 0, mime_type: "image/jpeg" },
        } });
      }
      if (url.pathname === "/api/upscale2") {
        if (request.method() === "GET") {
          probes++;
          return mode === "offline"
            ? route.fulfill({ status: 503, json: { available: false, error: "图片超清暂不可用。" } })
            : route.fulfill({ json: { available: true, resolutions: [2048, 4096] } });
        }
        submitted.push(request.postDataJSON());
        return route.fulfill({ status: 202, json: { task_id: `job-${submitted.length}` } });
      }
      if (url.pathname.startsWith("/api/background-removal/")) {
        cutoutRequests.push(request.postDataJSON());
        return route.fulfill({ json: url.pathname.endsWith("/prepare")
          ? { token: "qa-mask", width: 640, height: 400 }
          : { url: cutoutRequests.length === 2 ? "/output/qa-cutout-result.png" : "/output/qa-cutout-auto.png",
            width: 640, height: 400, coverage: 0.5 } });
      }
      if (url.pathname === "/api/upscale/status") {
        polled.push(url.searchParams.get("id"));
        const json = mode === "failed" ? { status: "failed", error: "超清服务执行失败。" }
          : mode === "running" ? { status: "running", progress: 30 }
          : { status: "success", progress: 100, images: ["/output/qa-upscale-result.svg"] };
        return route.fulfill({ json });
      }
      if (url.pathname.endsWith("/operations") && request.method() === "POST") {
        const { operations } = request.postDataJSON();
        revision++;
        for (const op of operations) {
          const target = op.type.startsWith("node.") ? nodes : edges;
          if (op.type.endsWith(".delete")) target.delete(op.entityId);
          else if (op.type.endsWith(".upsert")) target.set(op.entityId, op.after);
        }
        return route.fulfill({ json: { boardRevision: revision, results: operations.map(op => ({
          operationId: op.operationId, status: "applied", entityRevision: revision,
        })) } });
      }
      if (url.pathname.endsWith("/nodes")) {
        reads++;
        return route.fulfill({ json: { nodes: [...nodes.values()], connections: [...edges.values()] } });
      }
      if (url.pathname.endsWith("/node")) return route.fulfill({ json: { node: nodes.get(url.searchParams.get("nodeId")) } });
      return route.fulfill({ json: { authenticated: false, boards: [], projects: [], resources: [],
        records: [], models: [], providers: [], preferences: {}, settings: {}, state: "migrating" } });
    });
    const setup = async saved => page.evaluate(async ({ boardId, sourceUrl, saved }) => {
      await AiOsModuleLoader.ensure(["canvas-runtime", "canvas-node-generator"]);
      await loadCanvasBoards();
      const surface = document.createElement("div");
      surface.id = "neonEngineSurface";
      surface.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column";
      document.body.append(surface);
      const view = document.querySelector("#canvasView");
      surface.append(view);
      view.style.cssText = "flex:1;min-height:0;width:100%";
      if (saved) { await openCanvasBoardFromHistory(saved); return serializeCanvasBoard(); }
      canvasState.activeBoardId = boardId;
      canvasState.activeBoardPersisted = true;
      view.hidden = false;
      view.classList.add("active");
      document.querySelector("#canvasEditorScreen").hidden = false;
      document.body.classList.add("canvas-surface-open");
      showCanvasEditor();
      const source = addCanvasImage(sourceUrl, "测试原图.svg", { x: 160, y: 160 });
      selectCanvasNode(source);
      await AiOsModuleLoader.ensure(["canvas-agent-ui"]);
      window.dispatchEvent(new CustomEvent("canvas:selectionchange"));
      return source.dataset.id;
    }, { boardId, sourceUrl, saved });
    await page.goto(origin, { waitUntil: "networkidle" });
    sourceId = await setup();
    await page.locator("#canvasAgentToggle").click();
    const prompt = page.locator("#canvasAgentPrompt"), send = page.locator("#canvasAgentSend");
    const status = page.locator("#canvasAgentStatus"), approval = page.locator("#canvasAgentApproval");
    const card = page.locator("[data-agent-tool-input]");
    const messages = page.locator("#canvasAgentMessages");
    const errorsInChat = messages.locator(".is-error.canvas-agent-message");
    const userStatuses = messages.locator(".is-user .canvas-agent-message-status");
    const ask = async (text, resolution) => {
      requested = resolution;
      await prompt.fill(text);
      await send.click();
    };
    const expectStatus = text => page.waitForFunction(text => document.querySelector("#canvasAgentStatus").textContent.includes(text), text);
    const expectNormalStatus = async text => {
      await expectStatus(text);
      assert.match(await page.locator("#canvasAgentLiveStatus").innerText(), new RegExp(text));
      assert.equal(await errorsInChat.count(), 0);
    };
    const remoteDraft = { taskId: "qa-h3", boardId, skillId: remoteSkill.id, status: "editing", step: 1,
      values: { title: "另一窗口填写的 H3 草稿" }, sourceNodeIds: [], updatedAt: "2026-11-25T11:00:00.000Z" };
    await page.locator("#canvasAgentConversationButton").waitFor();
    await page.evaluate(id => window.CanvasAgentUi.useSkill(id), fashion.id);
    await page.waitForFunction(async id => (await (await fetch("/api/canvas-agent/conversation")).json()).activeSkillId === id, fashion.id);
    conversation = { ...conversation, activeSkillId: remoteSkill.id, wizardDraft: remoteDraft, revision: conversation.revision + 1 };
    cutout = true;
    await ask("帮我把人物抠出来");
    await page.waitForFunction(() => /抠图完成|Skill 选择状态未能保存|消息保存失败/.test(document.querySelector("#canvasAgentStatus").textContent));
    assert.equal(cutoutRequests.length, 2, await messages.innerText());
    assert.equal(cutoutRequests[0].image, sourceUrl);
    const cutoutResult = [...nodes.values()].find(node => node.resultSrc === "/output/qa-cutout-result.png");
    assert.ok(cutoutResult && nodes.has(sourceId));
    assert.ok([...edges.values()].some(edge => edge.from === sourceId && edge.to === cutoutResult.id));
    assert.equal(conflictCount, 1);
    assert.equal(conversation.activeSkillId, remoteSkill.id);
    assert.equal(conversation.wizardDraft?.values.title, remoteDraft.values.title);
    modelReply = { text: "当前对话可以继续。" };
    cutout = false;
    await page.evaluate(() => clearCanvasSelection());
    await ask("你好，继续聊一下。");
    await messages.getByText(modelReply.text, { exact: true }).waitFor();
    assert.equal(conversation.activeSkillId, remoteSkill.id);
    assert.equal(conversation.wizardDraft?.values.title, remoteDraft.values.title);
    await page.locator("#canvasAgentSkillBook").click();
    await page.locator("#canvasAgentUseAuto").click();
    await page.evaluate(id => selectCanvasNode(ensureCanvasNodeMounted(id)), sourceId);
    cutout = true;
    await ask("帮我把人物抠出来");
    await expectStatus("抠图完成");
    const autoCutout = [...nodes.values()].find(node => node.resultSrc === "/output/qa-cutout-auto.png");
    assert.ok(autoCutout && [...edges.values()].some(edge => edge.from === sourceId && edge.to === autoCutout.id));
    assert.equal(cutoutRequests.length, 4);
    cutout = false;
    modelReply = undefined;
    rejectSave = true;
    const turnBeforeFailure = turn;
    for (let attempt = 0; attempt < 2; attempt++) {
      await ask("解释一下曝光。");
      await expectStatus("消息未提交。验收会话暂不可写。");
      await send.waitFor({ state: "visible" });
      assert.equal(await prompt.inputValue(), "解释一下曝光。");
    }
    assert.equal(turn, turnBeforeFailure);
    assert.equal(await messages.locator("[data-submission-error]").count(), 1);
    rejectSave = false;
    modelReply = { text: "会话保存恢复。" };
    await ask("解释一下曝光。");
    await messages.getByText(modelReply.text, { exact: true }).waitFor();
    assert.equal(turn, turnBeforeFailure + 1);
    await page.evaluate(() => clearCanvasSelection());
    modelReply = { text: "焦距会影响视角。" };
    await ask("什么是焦距？");
    await messages.getByText(modelReply.text, { exact: true }).waitFor();
    await expectNormalStatus("已回复");
    modelReply = { text: "这张海报要宣传什么产品？准备在哪里使用？有产品图的话可以直接上传。" };
    const posterQuestion = modelReply.text;
    await ask("我想生成一张产品春节海报");
    await messages.getByText(posterQuestion, { exact: true }).waitFor();
    await expectNormalStatus("等待补充信息");
    assert.equal(await userStatuses.count(), 0);
    modelReply = { text: "可以为公众号的茶叶礼盒海报采用红金配色和留白构图。" };
    await ask("产品是茶叶礼盒，准备用在公众号。");
    await messages.getByText(modelReply.text, { exact: true }).waitFor();
    await expectNormalStatus("已回复");
    assert.ok(textTurns.at(-1).conversation_context.some(item => item.role === "assistant" && item.content === posterQuestion));
    modelReply = { text: "先用红金配色与留白构图。请确认这个方案，确认后我再生成。" };
    await ask("请为茶叶礼盒生成春节海报。");
    await expectNormalStatus("等待确认");
    assert.ok(textTurns.every(turn => !turn.tool_outputs?.length));
    assert.equal(submitted.length, 0);
    modelReply = undefined;

    await page.evaluate(id => selectCanvasNode(ensureCanvasNodeMounted(id)), sourceId);
    await ask("放大图片", null);
    await card.waitFor({ state: "visible" });
    await expectNormalStatus("等待补充信息");
    assert.deepEqual(await card.locator("option").allTextContents(), ["请选择", "2K", "4K"]);
    for (const width of [390, 768, 1440, 1728]) {
      await page.setViewportSize({ width, height: 900 });
      const bounds = await card.boundingBox();
      assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1, `information card fits ${width}px`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    assert.equal(submitted.length, 0);
    await card.locator("select").selectOption("4K");
    await card.getByRole("button", { name: "继续" }).click();
    await approval.waitFor({ state: "visible" });
    assert.match(await approval.innerText(), /4K/);
    assert.equal(submitted.length, 0);
    await page.locator("#canvasAgentApprove").click();
    await expectStatus("4096 × 2560");
    assert.equal(await userStatuses.count(), 0);
    assert.deepEqual(submitted, [{ image: sourceUrl, name: "测试原图.svg", resolution: 4096 }]);
    assert.deepEqual(polled, ["job-1"]);
    assert.ok(probes > 0 && reads >= 2);
    const result = [...nodes.values()].find(node => node.resultSrc === "/output/qa-upscale-result.svg");
    assert.ok(result && nodes.has(sourceId));
    assert.ok([...edges.values()].some(edge => edge.from === sourceId && edge.to === result.id));
    for (const [scenario, resolution, message] of [
      ["success", 4096, "已取消"], ["offline", 4096, "暂不可用"], ["success", 3072, "不是允许的值"],
      ["success", "no-source", "请选择"], ["success", "no-tool", "尚未完成"],
      ["failed", 4096, "执行失败"], ["wrong-pixels", 4096, "未达到所选长边"],
    ]) {
      mode = scenario;
      const before = submitted.length;
      const errorsBefore = await errorsInChat.count();
      await ask("把这张图放大到4K", resolution);
      if (resolution === 4096 && mode !== "offline") {
        await approval.waitFor({ state: "visible" });
        assert.equal(await card.count(), 0);
        await page.locator(mode === "success" ? "#canvasAgentDecline" : "#canvasAgentApprove").click();
      }
      await expectStatus(resolution === "no-source" ? "请先选中" : message);
      assert.doesNotMatch(await status.innerText(), /任务完成/);
      assert.equal(await userStatuses.count(), 0);
      if (resolution === "no-tool") assert.equal(await errorsInChat.count(), errorsBefore);
      if (scenario === "failed") await errorsInChat.getByText(/超清服务执行失败。/).waitFor();
      assert.equal(submitted.length - before, ["failed", "wrong-pixels"].includes(scenario) ? 1 : 0);
    }
    modelReply = { error: "模型请求失败，验收服务返回无效配置。" };
    await ask("简单解释一下曝光。");
    await errorsInChat.getByText(modelReply.error, { exact: true }).waitFor();
    await expectStatus("本次未完成");
    assert.equal(await userStatuses.count(), 0);
    modelReply = undefined;
    mode = "running";
    await ask("请把这张照片做超分，长边设为4K", 4096);
    await approval.waitFor({ state: "visible" });
    await page.locator("#canvasAgentApprove").click();
    await page.locator("[data-image-generating-progress]").filter({ hasText: "30%" }).waitFor({ state: "visible" });
    await page.locator("#canvasAgentStop").click();
    await expectStatus("已停止");
    assert.equal(submitted.length, 4);
    await page.locator("[data-image-generating]").waitFor({ state: "detached" });
    await page.waitForFunction(async () => {
      const response = await fetch("/api/canvas-agent/conversation");
      return (await response.json()).items.some(item => item.role === "error" && item.text.includes("超清服务执行失败。"));
    });
    conversation.items.push({
      id: "legacy-false-failure", role: "error", text: "没有确认任何画布操作成功",
      requestId: textTurns[1].request_id, status: "failed",
    });
    const saved = { id: boardId, title: "隔离测试", nodes: [...nodes.values()],
      connections: [...edges.values()], viewport: { x: 80, y: 60, scale: 1 } };
    await page.reload({ waitUntil: "networkidle" });
    const restored = await setup(saved);
    if (await page.locator("#canvasAgentPanel").getAttribute("aria-hidden") === "true") {
      await page.locator("#canvasAgentToggle").click();
    }
    await messages.getByText(posterQuestion, { exact: true }).waitFor();
    const savedSessionId = conversation.conversationId;
    const historyButton = page.locator("#canvasAgentConversationButton");
    await historyButton.click();
    await page.locator(`[data-agent-conversation="${alternateSession.conversationId}"]`).click();
    await messages.getByText("另一条验收会话。", { exact: true }).waitFor();
    await historyButton.click();
    await page.locator(`[data-agent-conversation="${savedSessionId}"]`).click();
    await messages.getByText(posterQuestion, { exact: true }).waitFor();
    await errorsInChat.getByText(/超清服务执行失败。/).waitFor();
    assert.equal(await messages.getByText("没有确认任何画布操作成功", { exact: true }).count(), 0);
    assert.equal(await userStatuses.count(), 0);
    assert.ok(restored.nodes.some(node => node.id === result.id && node.resultSrc === result.resultSrc));
    assert.ok(restored.connections.some(edge => edge.from === sourceId && edge.to === result.id));
    mode = "success";
    enableAgent = false;
    await page.evaluate(async id => {
      const node = ensureCanvasNodeMounted(id);
      selectCanvasNode(node);
      await CanvasFeatureRegistry.openTool("upscale", { node });
    }, sourceId);
    await page.locator('[data-flora-tool="upscale"] select').selectOption("4096");
    await page.locator('[data-flora-tool-submit="upscale"]').click();
    await page.locator("[data-image-generating]").waitFor({ state: "detached" });
    assert.equal(submitted.length, 5);
    assert.deepEqual(submitted.at(-1), submitted[0], "manual and Agent use the same execution request");
    assert.deepEqual(errors, []);
    console.log(`33200 Agent: chat, clarification, continued context, input card, approval, decoded 4096 x 2560, ${reads} storage readbacks, failures, and history passed`);
  } catch (error) {
    if (page) console.error(await page.evaluate(() => ({
      status: document.querySelector("#canvasAgentStatus")?.textContent,
      messages: document.querySelector("#canvasAgentMessages")?.innerText,
      registered: window.CanvasFeatureRegistry?.listTools(),
    })).catch(() => ({})));
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
