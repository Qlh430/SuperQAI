const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");
const { createCanvasAgentConversationStore } = require("../host-sources/app/canvas-agent-conversation-store");

const origin = "http://127.0.0.1:33200";
const boardId = "qa-agent-panel";
const boardTitle = "Agent 界面隔离验收";
const owner = "qa-user";
const before = process.argv.includes("--before");
const historyControlsOnly = process.argv.includes("--history-controls");
const output = path.resolve(__dirname, before ? "../.design/agent-panel-20261120" : "../.design/agent-panel-ui-20261125");
const activeId = "qa-session-01";
const otherId = "qa-session-02";
const firstTitle = "为新品策划一组带有生活感的品牌影像";
const secondTitle = "整理秋季产品画册与素材";
const multilineMessage = "我想为新品制作一张春节海报。\n主视觉突出茶叶礼盒，留出标题和活动日期的位置。";
const sampleImage = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jI1sAAAAASUVORK5CYII=", "base64");

async function run() {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: "msedge" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-agent-panel-"));
  const dataPath = path.join(dataDirectory, "conversations.json");
  const store = createCanvasAgentConversationStore({ filePath: dataPath });
  const errors = [];
  const requests = [];
  let failList = false;
  let failActivation = false;
  let finishTurn;
  let holdTurn = false;
  let clipboard = "";
  const consoleErrors = [];
  const skills = [{ id: "qa-creative", label: "创意策划", description: "隔离验收技能", origin: "custom" }];

  const sessions = Array.from({ length: 18 }, (_, index) => {
    const conversationId = `qa-session-${String(index + 1).padStart(2, "0")}`;
    const title = [firstTitle, secondTitle, "构思海边产品图", "生成果园的氛围参考图"][index] || `画布创意练习 ${index + 1}`;
    const updatedAt = new Date(Date.now() - (21 + 12 * index) * 3600000).toISOString();
    const items = Array.from({ length: index ? 2 : 8 }, (_, turn) => [
      { role: "user", text: turn === 0 ? title : index === 0 && turn === 7 ? multilineMessage : `继续讨论第 ${turn + 1} 轮`, status: "completed" },
      { role: "assistant", text: `会话 ${index + 1} 的回复 ${turn + 1}`, status: "completed" },
    ]).flat();
    items.push({ role: "tool", text: "已关联画布素材", nodeId: "qa-reference", status: index === 17 ? "running" : "completed" });
    if (index === 0) {
      items.push(
        { role: "tool", text: "已保存三条独立文字节点用于方案整理。", toolName: "create_text_node", status: "completed" },
        { role: "error", text: "画布保存失败，请检查连接后重试。", status: "failed" },
      );
    }
    return { boardId, ownerUserId: owner, conversation: {
      boardId, conversationId, updatedAt, activeSkillId: index === 1 ? "qa-creative" : "",
      generationSettings: { mode: index === 1 ? "video" : "agent" },
      items: items.map((item, itemIndex) => ({ ...item, id: `${conversationId}-${itemIndex}`, createdAt: updatedAt })),
    } };
  });
  fs.writeFileSync(dataPath, JSON.stringify({ sessions, activeSessions: [{ boardId, ownerUserId: owner, conversationId: activeId }] }));
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.exposeFunction("captureAgentClipboard", text => { clipboard = text; });
  await page.addInitScript(() => {
    Object.defineProperty(navigator.clipboard, "writeText", { value: window.captureAgentClipboard });
  });
  await page.routeWebSocket("**/*", socket => socket.close());
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === "/qa-agent-panel.png") return route.fulfill({ contentType: "image/png", body: sampleImage });
    if (["/qa-agent-panel.mp4", "/qa-agent-panel.wav"].includes(url.pathname)) return route.fulfill({ status: 204 });
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const method = request.method();
    const body = method === "POST" && request.headers()["content-type"]?.includes("json") ? request.postDataJSON() : {};
    const action = url.searchParams.get("action") || body?.action || "";
    requests.push({ path: url.pathname, method, action, body });
    if (url.pathname === "/api/canvas-agent/conversation") {
      if (method === "GET" && action === "list") {
        if (failList) return route.fulfill({ status: 503, json: { error: "历史暂时无法读取，请重试。" } });
        return route.fulfill({ json: store.list(boardId, owner) });
      }
      if (method === "GET") return route.fulfill({ json: store.get(boardId, owner, url.searchParams.get("conversation_id") || "") });
      if (action === "activate") {
        const ok = !failActivation && store.activateSession(boardId, owner, body.conversation_id);
        return route.fulfill({ status: ok ? 200 : 403, json: { ok } });
      }
      if (action === "create") return route.fulfill({ status: 201, json: store.createSession(boardId, owner) });
      return route.fulfill({ json: store.upsert(body.conversation, body.expected_revision, owner) });
    }
    if (url.pathname === "/api/canvas-agent/turn") {
      if (holdTurn) await new Promise(resolve => { finishTurn = resolve; });
      return route.fulfill({ json: { response_id: "qa-turn-1", message: "模拟模型回复", tool_calls: [] } });
    }
    if (url.pathname === "/api/upload-image") return route.fulfill({ json: { url: "/qa-agent-panel.png" } });
    if (url.pathname === "/api/auth/session") {
      return route.fulfill({ json: { authenticated: true, user: { id: owner, username: owner, displayName: "验收账户", role: "superadmin", status: "active" } } });
    }
    if (url.pathname === "/api/canvas/boards") {
      return route.fulfill({ json: { boards: [{ id: boardId, title: boardTitle, resourceId: "qa-agent-resource", nodeCount: 0 }] } });
    }
    if (url.pathname.startsWith(`/api/canvas/boards/${boardId}/`)) {
      return route.fulfill({ json: {
        title: boardTitle, revision: 0, boardRevision: 0, nodes: [], connections: [],
        mode: "detail", engineVersion: "canvas-visual-fidelity-v2", complete: true,
      } });
    }
    return route.fulfill({ json: {
      boards: [], projects: [], models: [], providers: [],
      settings: {}, preferences: {}, resources: [], skills, configured: true, agentSettings: { configured: true }, success: true,
    } });
  });

  try {
    const response = await page.goto(origin, { waitUntil: "domcontentloaded" });
    assert.equal(response.headers()["x-ai-os-frontend"], "fixed-stage");
    await page.frameLocator("#aiOsNeonFrame").getByRole("button", { name: `打开画布 ${boardTitle}` }).click();
    const surface = page.locator("#neonEngineSurface");
    await surface.waitFor();
    const fullCanvas = await surface.boundingBox();
    assert.equal(fullCanvas.width, 1440);
    assert.equal(fullCanvas.height, 900);
    await page.locator("#canvasAgentToggle").click();
    const panel = page.locator("#canvasAgentPanel");
    const handle = page.locator("#canvasAgentResizeHandle");
    const prompt = page.locator("#canvasAgentPrompt");
    const form = page.locator("#canvasAgentForm");
    const trigger = page.locator("#canvasAgentConversationButton");
    const history = page.locator("#canvasAgentHistoryPopover");
    const search = page.locator("#canvasAgentHistorySearch");
    const messages = page.locator("#canvasAgentMessages");
    const row = id => page.locator(`[data-agent-conversation="${id}"]`);
    const width = async locator => Math.round((await locator.boundingBox()).width);
    const canvas = page.locator("#infiniteCanvas");
    await messages.getByText("会话 1 的回复 8", { exact: true }).waitFor();
    if (historyControlsOnly) {
      const arrow = trigger.locator("svg.lucide-chevron-down");
      const checkArrow = async expanded => {
        await history.waitFor({ state: expanded ? "visible" : "hidden" });
        assert.equal(await trigger.getAttribute("aria-expanded"), String(expanded));
        await page.waitForFunction(({ expanded }) => {
          const { transform } = getComputedStyle(document.querySelector("#canvasAgentConversationButton svg"));
          const matrix = transform === "none" ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(transform);
          return Math.abs(matrix.a - (expanded ? -1 : 1)) < 0.001 && Math.abs(matrix.b) < 0.001;
        }, { expanded }, { timeout: 1000 });
      };
      await checkArrow(false);
      const initial = await arrow.boundingBox();
      await trigger.click();
      await row(activeId).waitFor();
      assert.equal(await panel.locator("#canvasAgentNewConversationHeader, [data-agent-new-conversation]").count(), 2);
      assert.equal(await history.locator(".canvas-agent-current-session [data-agent-new-conversation]").count(), 0);
      assert.ok(await history.locator("#canvasAgentNewConversation").isEnabled());
      assert.equal(await arrow.evaluate(element => getComputedStyle(element).transitionDuration), "0.18s");
      assert.ok(await arrow.evaluate(element => {
        const { width, height, transformOrigin } = getComputedStyle(element);
        const [x, y] = transformOrigin.split(" ").map(parseFloat);
        return x === parseFloat(width) / 2 && y === parseFloat(height) / 2;
      }));
      await checkArrow(true);
      const rotated = await arrow.boundingBox();
      assert.ok(["x", "y", "width", "height"].every(key => Math.abs(initial[key] - rotated[key]) <= 0.5));
      for (const close of [trigger, page.locator("#canvasAgentHistoryClose"), history.getByRole("button", { name: "折叠历史会话" }), prompt, search]) {
        if (!(await history.isVisible())) await arrow.click();
        await checkArrow(true);
        if (close === search) await search.press("Escape");
        else await close.click();
        await checkArrow(false);
      }
      await page.setViewportSize({ width: 390, height: 800 });
      await arrow.click();
      await checkArrow(true);
      await row(otherId).click();
      await checkArrow(false);
      assert.equal(store.get(boardId, owner).conversationId, otherId);
      await arrow.click();
      await history.locator("#canvasAgentNewConversation").click();
      await checkArrow(false);
      await trigger.getByText("当前对话", { exact: true }).waitFor();
      await Promise.all([
        page.waitForResponse(response => response.status() === 201 && response.url().endsWith("/api/canvas-agent/conversation")),
        panel.locator("#canvasAgentNewConversationHeader").click(),
      ]);
      assert.equal(store.list(boardId, owner).sessions.length, 20);
      assert.deepEqual(errors, []);
      console.log("历史入口专项通过：两个新建入口、180ms 旋转、中心固定和各关闭路径。");
      return;
    }
    await prompt.click();
    await form.screenshot({ path: path.join(output, `${before ? "before" : "after"}-focus.png`) });
    await handle.hover();
    if (before) await panel.screenshot({ path: path.join(output, "before-divider.png") });
    await trigger.click();
    await row(otherId).waitFor();
    if (before) {
      await panel.screenshot({ path: path.join(output, "before-history.png") });
      assert.equal(await handle.evaluate(element => getComputedStyle(element).cursor), "col-resize");
      return;
    }

    const header = panel.locator(".canvas-agent-header");
    const newConversation = header.getByRole("button", { name: "新建对话", exact: true });
    const checkHeader = async () => {
      const [bounds, title, add, close] = await Promise.all([
        header.boundingBox(), trigger.boundingBox(), newConversation.boundingBox(), page.locator("#canvasAgentClose").boundingBox(),
      ]);
      assert.ok(title.x >= bounds.x && title.x - bounds.x < 24);
      assert.ok(title.x + title.width <= add.x && add.x + add.width <= close.x);
      assert.ok(close.x + close.width <= bounds.x + bounds.width);
      assert.equal(await trigger.evaluate(button => getComputedStyle(button).borderTopWidth), "0px");
      assert.equal(await trigger.evaluate(button => getComputedStyle(button).backgroundColor), "rgba(0, 0, 0, 0)");
      assert.equal(await trigger.locator("svg.lucide-chevron-down").count(), 1);
      assert.equal(await header.getByText("画布 Agent", { exact: true }).count(), 0);
      assert.equal(await header.locator("#canvasAgentLiveStatus").count(), 0);
      assert.doesNotMatch(await form.locator(".canvas-agent-run-actions").innerText(), /Agent 已就绪|任务|执行|保存/);
    };
    await checkHeader();
    assert.equal(await trigger.innerText(), firstTitle);
    await row(activeId).getByText("8 轮", { exact: true }).waitFor();
    await row(otherId).getByText("2 轮", { exact: true }).waitFor();
    assert.match(await row(activeId).innerText(), /21 小时前/);
    assert.equal(await row(activeId).getAttribute("aria-current"), "true");
    await panel.screenshot({ path: path.join(output, "after-history.png") });
    assert.ok((await history.boundingBox()).width > 360);
    assert.ok((await history.boundingBox()).y + (await history.boundingBox()).height < (await form.boundingBox()).y);
    await page.locator("#canvasAgentCopySessionId").click();
    await page.locator("#canvasAgentSessionCopyStatus").getByText("已复制会话 ID").waitFor();
    assert.equal(clipboard, activeId);
    await search.fill("不存在的关键词");
    await history.getByText("没有匹配的历史会话").waitFor();
    await search.fill(secondTitle);
    assert.equal(await page.locator("[data-agent-conversation]").count(), 1);
    await search.fill("QA-SESSION-02");
    await row(otherId).waitFor();
    failActivation = true;
    await row(otherId).click();
    await history.getByText("会话不可用或已失去访问权限。").waitFor();
    assert.equal(await page.locator("#canvasAgentSessionId").textContent(), activeId);
    failActivation = false;
    await row(otherId).click();
    await history.waitFor({ state: "hidden" });
    await messages.getByText("会话 2 的回复 2", { exact: true }).waitFor();
    assert.equal(store.get(boardId, owner).conversationId, otherId);
    assert.equal(await page.locator("#canvasAgentSessionId").textContent(), otherId);
    assert.equal(await page.evaluate(() => canvasState.activeBoardId), boardId);
    assert.match(await page.locator("#canvasAgentModeButton").innerText(), /视频/);
    await page.locator("#canvasAgentContext").getByText("创意策划", { exact: true }).waitFor();
    await page.locator("#canvasAgentGenerationButton").click();
    await page.locator("#canvasAgentGenerationPopover").waitFor();
    assert.equal(await page.locator('[data-agent-generation="type"][data-value="video"]').getAttribute("aria-pressed"), "true");
    await page.locator("#canvasAgentModeButton").click();
    await page.locator('[data-agent-mode="agent"]').click();
    assert.match(await page.locator("#canvasAgentModeButton").innerText(), /Agent/);
    await page.locator("#canvasAgentSkillBook").click();
    await page.locator('[data-agent-skill="qa-creative"]').waitFor();
    await page.locator("#canvasAgentUseAuto").click();
    await page.locator("#canvasAgentSkillBook").click();
    await page.locator('[data-agent-skill="qa-creative"]').click();
    await page.locator("#canvasAgentContext").getByText("创意策划", { exact: true }).waitFor();
    const references = await page.evaluate(() => {
      const kinds = [["image", "产品参考图", "png"], ["video", "分镜参考视频", "mp4"], ["audio", "配音参考音频", "wav"]];
      return kinds.map(([kind, name, extension], index) => {
        const node = addCanvasAssetCollection({ x: 180 + index * 180, y: 120 }, {
          title: name, mode: "single", deferSave: true,
          members: [{ id: `qa-${kind}`, kind, src: `/qa-agent-panel.${extension}`, name }],
        });
        node.dataset.nodeTitle = name;
        return { id: node.dataset.id, name, kind };
      });
    });
    for (const { id } of references) {
      await prompt.press("End");
      await prompt.press("@");
      await page.locator(`[data-agent-mention-id="${id}"]`).click();
    }
    const draft = await prompt.inputValue();
    for (const alias of ["@图1", "@视频1", "@音频1"]) assert.ok(draft.includes(alias), draft);
    const contextOverflow = page.locator("[data-agent-context-overflow]");
    const expectReferenceChips = async () => {
      if (await contextOverflow.getAttribute("aria-expanded", { timeout: 1000 }).catch(() => null) === "false") {
        await contextOverflow.click();
      }
      for (const { id, kind } of references) {
        await page.locator(`#canvasAgentContext .is-${kind}[data-agent-node-id="${id}"]`).waitFor();
      }
    };
    await expectReferenceChips();
    await page.locator("#canvasAgentContextAdd").click();
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.locator('[data-agent-attachment="upload"]').click(),
    ]);
    await fileChooser.setFiles({ name: "上传参考图.png", mimeType: "image/png", buffer: sampleImage });
    await page.locator('#canvasAgentContext .canvas-agent-context-chip[title="上传参考图.png"]').waitFor();

    await trigger.click();
    await row(otherId).waitFor();
    await search.fill("");
    const list = page.locator("#canvasAgentHistoryList");
    assert.ok(await list.evaluate(element => element.scrollHeight > element.clientHeight));
    await list.evaluate(element => { element.scrollTop = element.scrollHeight; });
    assert.ok(await list.evaluate(element => element.scrollTop > 0));
    await row("qa-session-18").getByText("2 轮", { exact: true }).waitFor();
    await row("qa-session-18").click();
    await history.waitFor({ state: "hidden" });
    assert.equal(store.get(boardId, owner, "qa-session-18").items.at(-1).status, "running");
    await trigger.click();
    await page.waitForFunction(() => !document.querySelector("#canvasAgentHistoryRefresh").hasAttribute("aria-disabled"));
    const priorRefreshes = requests.filter(request => request.action === "list").length;
    failList = true;
    await page.locator("#canvasAgentHistoryRefresh").click();
    await history.getByText("历史暂时无法读取，请重试。").waitFor();
    failList = false;
    await page.locator("#canvasAgentHistoryRefresh").click();
    await row(activeId).waitFor();
    assert.equal(requests.filter(request => request.action === "list").length, priorRefreshes + 2);
    await search.press("Escape");
    await newConversation.click();
    await trigger.getByText("当前对话", { exact: true }).waitFor();
    await history.waitFor({ state: "hidden" });
    assert.equal(store.list(boardId, owner).sessions.length, 19);
    assert.notEqual(await page.locator("#canvasAgentSessionId").textContent(), otherId);
    await trigger.click();
    await row(activeId).click();
    await history.waitFor({ state: "hidden" });
    await messages.getByText("会话 1 的回复 8", { exact: true }).waitFor();
    assert.equal(await prompt.inputValue(), "");
    await trigger.click();
    await row(otherId).click();
    await history.waitFor({ state: "hidden" });
    assert.equal(await prompt.inputValue(), draft);
    await expectReferenceChips();
    await page.locator('#canvasAgentContext .canvas-agent-context-chip[title="上传参考图.png"]').waitFor();
    await trigger.click();
    await row(activeId).click();
    await history.waitFor({ state: "hidden" });

    const userBubbles = messages.locator(".canvas-agent-message.is-user");
    const checkBubble = bubble => bubble.evaluate(element => {
      const body = element.querySelector(".canvas-agent-markdown");
      const range = document.createRange();
      range.selectNodeContents(body);
      const text = range.getBoundingClientRect();
      const bounds = element.getBoundingClientRect();
      return { top: text.top - bounds.top, bottom: bounds.bottom - text.bottom };
    });
    for (const bubble of [userBubbles.first(), userBubbles.last()]) {
      const gaps = await checkBubble(bubble);
      assert.ok(Math.abs(gaps.top - gaps.bottom) <= 1.5, JSON.stringify(gaps));
    }
    assert.equal(await userBubbles.locator(".canvas-agent-message-status").count(), 0);
    const reply = messages.locator(".is-assistant").filter({ hasText: "会话 1 的回复 8" });
    const detail = messages.locator('[data-tool-name="create_text_node"] .canvas-agent-tool-details');
    await detail.locator("summary").click();
    await detail.locator(".canvas-agent-tool-detail").waitFor();
    await messages.getByText("画布保存失败，请检查连接后重试。", { exact: true }).waitFor();
    const selectedId = await page.evaluate(() => {
      const node = addCanvasText({ x: 180, y: 120 }, { text: "复制验收节点", focus: false });
      selectCanvasNode(node);
      canvasState.clipboard = null;
      return node.dataset.id;
    });
    const copyPart = async locator => {
      await locator.scrollIntoViewIfNeeded();
      const { from, to, expected } = await locator.evaluate(element => {
        const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode();
        const range = document.createRange();
        const start = 1, end = 5;
        range.setStart(text, start);
        range.setEnd(text, end);
        const rect = range.getBoundingClientRect();
        return {
          from: { x: rect.left + 0.5, y: rect.top + rect.height / 2 },
          to: { x: rect.right - 0.5, y: rect.top + rect.height / 2 },
          expected: text.data.slice(start, end),
        };
      });
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 6 });
      await page.mouse.up();
      assert.equal(await page.evaluate(() => window.getSelection().toString()), expected);
      await page.keyboard.press("Control+c");
      await page.waitForFunction(async value => await navigator.clipboard.readText() === value, expected);
      assert.deepEqual(await page.evaluate(() => [...canvasState.selectedIds]), [selectedId]);
      assert.equal(await page.evaluate(() => canvasState.clipboard), null);
    };
    await copyPart(userBubbles.first().locator(".canvas-agent-markdown p"));
    await copyPart(reply.locator(".canvas-agent-markdown p"));
    await copyPart(detail.locator(".canvas-agent-tool-detail"));
    await page.evaluate(() => window.getSelection().removeAllRanges());
    await page.keyboard.press("Control+c");
    await page.waitForFunction(id => canvasState.clipboard?.nodes.some(node => String(node.id) === id), selectedId);
    await page.evaluate(() => clearCanvasSelection());
    await panel.screenshot({ path: path.join(output, "agent-panel-desktop.png") });
    await reply.getByRole("button", { name: "复制 Agent 回复" }).click();
    assert.equal(clipboard, "会话 1 的回复 8");

    assert.equal(await handle.evaluate(element => getComputedStyle(element).cursor), "col-resize");
    await handle.hover();
    assert.equal(await handle.evaluate(element => getComputedStyle(element, "::before").boxShadow), "none");
    const drag = async (distance, during) => {
      const box = await handle.boundingBox();
      const x = box.x + 5;
      const y = box.y + box.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + distance, y, { steps: 6 });
      if (during) await during();
      await page.mouse.up();
    };
    const initialCanvas = await width(canvas);
    await drag(-128, async () => {
      assert.equal(await width(panel), 538);
      assert.equal(await width(canvas), initialCanvas - 128);
    });
    assert.equal(await width(panel), 538);
    await handle.hover();
    await page.screenshot({ path: path.join(output, "after-resize-desktop.png") });
    await drag(-340);
    assert.equal(await width(panel), 760);
    await drag(700);
    assert.equal(await width(panel), 320);
    await handle.press("End");
    assert.equal(await width(panel), 760);
    await page.setViewportSize({ width: 768, height: 690 });
    assert.ok(await width(panel) <= 548);
    const workspaceWidth = await width(page.locator(".canvas-workspace"));
    await page.waitForFunction(expected => {
      return Math.abs(document.querySelector("#infiniteCanvas").getBoundingClientRect().width - expected) <= 2;
    }, workspaceWidth - await width(panel));
    assert.ok(await width(canvas) >= 218);
    await trigger.click();
    await row(activeId).waitFor();
    await panel.screenshot({ path: path.join(output, "after-narrow.png") });
    await page.locator("#canvasAgentHistoryClose").click();
    await page.setViewportSize({ width: 768, height: 480 });
    await trigger.click();
    await row(activeId).waitFor();
    const shortPanel = await panel.boundingBox();
    const shortForm = await form.boundingBox();
    assert.ok(shortForm.y + shortForm.height <= shortPanel.y + shortPanel.height);
    await search.press("Escape");
    for (const viewportWidth of [390, 768, 1440, 1728]) {
      await page.setViewportSize({ width: viewportWidth, height: 900 });
      await checkHeader();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.ok(await width(panel) < viewportWidth);
    }
    await page.setViewportSize({ width: 390, height: 800 });
    await trigger.evaluate(element => element.blur());
    await messages.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await panel.screenshot({ path: path.join(output, "agent-panel-mobile.png") });
    await trigger.click();
    await row(activeId).waitFor();
    await panel.screenshot({ path: path.join(output, "after-mobile.png") });
    await search.press("Escape");
    assert.equal(await trigger.getAttribute("aria-expanded"), "false");
    await page.setViewportSize({ width: 1440, height: 900 });
    assert.equal(await width(panel), 760);
    await handle.dblclick();
    await trigger.focus();
    await form.screenshot({ path: path.join(output, "after-unfocused.png") });
    await prompt.click();
    for (const field of [form, prompt]) assert.equal(await field.evaluate(element => getComputedStyle(element).boxShadow), "none");
    assert.match(await prompt.evaluate(element => getComputedStyle(element).outlineColor), /^(?:rgb|color|oklch)\(/);
    await prompt.press("Escape");
    await prompt.press("Shift+Tab");
    await page.keyboard.press("Tab");
    assert.equal(await prompt.evaluate(element => element.matches(":focus-visible")), true);
    assert.equal(await prompt.evaluate(element => getComputedStyle(element.parentElement, "::after").content), "none");
    await form.screenshot({ path: path.join(output, "after-keyboard-focus.png") });
    await prompt.fill("第一行");
    await prompt.press("Shift+Enter");
    await page.keyboard.type("second line");
    assert.equal(await prompt.inputValue(), "第一行\nsecond line");
    holdTurn = true;
    const [turn] = await Promise.all([
      page.waitForRequest(request => request.url().endsWith("/api/canvas-agent/turn")),
      prompt.press("Enter"),
    ]);
    assert.ok(JSON.stringify(turn.postDataJSON()).includes("第一行\\nsecond line"));
    await page.locator("#canvasAgentStop").waitFor();
    await messages.locator(".canvas-agent-waiting").waitFor();
    assert.equal(await form.locator(".canvas-agent-run-actions > span:visible").count(), 0);
    await trigger.click();
    await row(otherId).click();
    await history.getByText("当前任务仍在运行，请在任务结束后切换会话。").waitFor();
    assert.equal(store.get(boardId, owner).conversationId, activeId);
    assert.ok(!requests.some(request => request.path === "/api/canvas-agent/cancel"));
    finishTurn();
    await messages.getByText("模拟模型回复", { exact: true }).waitFor();
    assert.ok(store.get(boardId, owner, otherId).items.every(item => item.text !== "模拟模型回复"));
    await row(otherId).click();
    await history.waitFor({ state: "hidden" });
    assert.equal(store.get(boardId, owner).conversationId, otherId);
    await page.locator("#canvasAgentClose").click();
    await panel.waitFor({ state: "hidden" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.frameLocator("#aiOsNeonFrame").getByRole("button", { name: `打开画布 ${boardTitle}` }).click();
    await surface.waitFor();
    if (await panel.getAttribute("aria-hidden") === "true") await page.locator("#canvasAgentToggle").click();
    await messages.getByText("会话 2 的回复 2", { exact: true }).waitFor();
    assert.equal(await trigger.innerText(), secondTitle);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ origin, viewportWidths: [390, 768, 1440, 1728], sessions: 19, initialCanvas, errors, evidence: output }, null, 2));
  } catch (error) {
    console.error({ pageErrors: errors, consoleErrors, requests: requests.map(({ path, method, action }) => ({ path, method, action })).slice(-18) });
    throw error;
  } finally {
    finishTurn?.();
    await browser.close();
    fs.rmSync(dataPath, { force: true });
    fs.rmdirSync(dataDirectory);
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
