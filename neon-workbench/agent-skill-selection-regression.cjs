const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const { appRoot } = JSON.parse(fs.readFileSync(path.resolve(__dirname,
  "../AI-OS-Portable-1.0.5-win-x64/data/.logs/runtime-diagnostics.json"), "utf8"));
const { loadCanvasSkillCatalog, getPublicSkillMetadata, resolveCanvasAgentSkillContext } =
  require(path.join(appRoot, "canvas-agent-runtime"));
const legacyConversation = require(path.join(appRoot, "canvas-agent-conversation"));
const catalog = loadCanvasSkillCatalog([{ directory: path.resolve(__dirname, "../host-sources/app/skills"), origin: "system" }]);
const h3 = "h3-commerce-video";
const second = "poster-design";
const skills = getPublicSkillMetadata(catalog);
assert.ok(skills.some(skill => skill.id === h3) && skills.some(skill => skill.id === second));
const filler = Array.from({ length: 24 }, (_, index) => ({
  id: "qa-picker-" + index, name: "qa-picker-" + index, label: "验收流程 " + String(index).padStart(2, "0"),
  description: "分类验收", scope: "personal", origin: "custom",
}));
const boardId = "qa-skill-selection";
const first = "qa-skill-first";
const other = "qa-skill-second";
const sessions = new Map([
  [first, legacyConversation.normalize({ boardId, conversationId: first, wizardDraft: {
    boardId, taskId: "qa-h3-draft", skillId: h3, status: "collecting", values: {},
  } }, boardId)],
  [other, legacyConversation.normalize({ boardId, conversationId: other }, boardId)],
]);
let active = first;
let catalogLoads = 0;
let delayCatalog;
const turns = [];
const errors = [];

async function main() {
  const chromePath = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const browser = await chromium.launch({ headless: true, ...(fs.existsSync(chromePath) ? { executablePath: chromePath } : { channel: "msedge" }) });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
    page.setDefaultTimeout(12000);
    page.on("pageerror", error => errors.push(error.message));
    await page.routeWebSocket("**/*", socket => socket.close());
    await page.route("**/api/**", async route => {
      const request = route.request();
      const url = new URL(request.url());
      const body = request.method() === "POST" ? request.postDataJSON() || {} : {};
      if (url.pathname === "/api/canvas-agent/skills") {
        const load = ++catalogLoads;
        const held = delayCatalog;
        if (held) {
          delayCatalog = null;
          held.started();
          await held.release;
        }
        const pickerSkills = [...skills.filter(skill => [h3, second].includes(skill.id)), ...filler];
        if (load % 2) pickerSkills.reverse();
        return route.fulfill({ json: { skills: [...skills, ...filler], pickerSkills,
          configured: true, agentSettings: { configured: true } } });
      }
      if (url.pathname === "/api/canvas-agent/conversation") {
        if (url.searchParams.get("action") === "list") {
          return route.fulfill({ json: { sessions: [...sessions.values()].map(session => ({
            conversationId: session.conversationId, title: session.conversationId,
          })) } });
        }
        if (body.action === "activate") active = body.conversation_id;
        if (body.conversation) {
          const snapshot = legacyConversation.normalize(body.conversation, boardId);
          sessions.set(snapshot.conversationId, { ...snapshot, revision: (sessions.get(snapshot.conversationId)?.revision || 0) + 1 });
          return route.fulfill({ json: sessions.get(snapshot.conversationId) });
        }
        return route.fulfill({ json: sessions.get(url.searchParams.get("conversation_id") || active) });
      }
      if (url.pathname === "/api/canvas-agent/turn") {
        const selected = resolveCanvasAgentSkillContext(body, catalog);
        turns.push({ mode: body.skill_mode, id: body.skill_id, runtime: selected.activeSkill?.id });
        return route.fulfill({ json: { response_id: "qa-turn-" + turns.length, message: "验收回复",
          tool_calls: [], auto_skill_id: second, auto_skill_label: "验收自动匹配" } });
      }
      if (url.pathname === "/api/auth/session") {
        return route.fulfill({ json: { authenticated: true, user: { id: "qa-picker", username: "qa-picker", role: "superadmin" } } });
      }
      return route.fulfill({ json: { boards: [], projects: [], resources: [], records: [], models: [], providers: [], settings: {} } });
    });
    async function openBoard() {
      const response = await page.goto("http://127.0.0.1:33200/", { waitUntil: "domcontentloaded" });
      assert.equal(response.headers()["x-ai-os-frontend"], "fixed-stage");
      const conversationReady = page.waitForResponse(response => response.url().includes("/api/canvas-agent/conversation?board_id="));
      await page.evaluate(async boardId => {
        await AiOsModuleLoader.ensure(["canvas-runtime", "canvas-agent-ui"]);
        window.AiOsDesktop.getSession = () => ({ user: { id: "qa-picker" } });
        const surface = document.createElement("div");
        surface.id = "neonEngineSurface";
        surface.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:flex";
        const view = document.querySelector("#canvasView");
        surface.append(view);
        document.body.append(surface);
        view.hidden = false;
        view.classList.add("active");
        view.style.cssText = "flex:1;min-height:0;width:100%";
        document.querySelector("#canvasEditorScreen").hidden = false;
        document.body.classList.add("canvas-surface-open");
        canvasState.activeBoardId = boardId;
        canvasState.activeBoardPersisted = true;
        showCanvasEditor();
        dispatchCanvasBoardChanged({ force: true });
      }, boardId);
      await conversationReady;
      if (await page.locator("#canvasAgentPanel").getAttribute("aria-hidden") === "true") {
        await page.locator("#canvasAgentToggle").click();
      }
      await page.waitForFunction(() => document.querySelector("[data-agent-skill='h3-commerce-video']"));
    }

    const book = page.locator("#canvasAgentSkillBook");
    const panel = page.locator("#canvasAgentSkillPopover");
    const list = page.locator("#canvasAgentSkills");
    const item = id => page.locator(`[data-agent-skill="${id}"]`);
    const label = page.locator("#canvasAgentContext [data-agent-context-key='skill']");
    const showPicker = async () => {
      if (!await panel.isVisible()) await book.click();
      await panel.waitFor();
    };
    const check = async id => {
      await page.waitForFunction(id => (document.querySelector("#canvasAgentSkills [aria-pressed=true][data-agent-skill]")?.dataset.agentSkill || "") === id, id);
      assert.equal(await list.locator("[aria-pressed=true][data-agent-skill]").count(), id ? 1 : 0);
      if (id) {
        const expectedLabel = skills.find(skill => skill.id === id)?.label || filler.find(skill => skill.id === id).label;
        assert.equal((await label.innerText()).trim(), expectedLabel);
        assert.equal(await label.count(), 1);
      } else {
        assert.equal(await label.count(), 0);
      }
    };
    await openBoard();
    await showPicker();
    assert.equal(await item(h3).getAttribute("aria-pressed"), "false", "legacy draft is not a manual selection");
    await item(h3).click();
    await check(h3);
    await showPicker();
    await item(h3).hover();
    await check(h3);
    await item(h3).click();
    await check("");
    await showPicker();
    await check("");

    let signalStarted, releaseHeld;
    const started = new Promise(resolve => { signalStarted = resolve; });
    const release = new Promise(resolve => { releaseHeld = resolve; });
    await book.click();
    delayCatalog = { started: signalStarted, release };
    await showPicker();
    await started;
    const identity = await item(second).elementHandle();
    await item(h3).click();
    await showPicker();
    await item(second).click();
    releaseHeld();
    await showPicker();
    await check(second);
    assert.equal(await item(second).evaluate((node, old) => node === old, identity), true);

    const search = page.locator("#canvasAgentSkillSearch");
    await search.fill("H3");
    await item(h3).click();
    await check(h3);
    await showPicker();
    await search.clear();
    await page.locator(`[data-agent-skill-detail="${h3}"]`).click();
    await page.locator("#canvasAgentSkillDetail [data-agent-skill-detail-favorite]").click();
    await page.keyboard.press("Escape");
    await page.getByRole("tab", { name: "喜欢", exact: true }).click();
    await check(h3);
    await page.getByRole("tab", { name: "我的", exact: true }).click();
    await assert.rejects(item(h3).waitFor({ state: "visible", timeout: 250 }));
    const bottom = list.locator("[data-agent-skill]").last();
    const bottomId = await bottom.getAttribute("data-agent-skill");
    await bottom.scrollIntoViewIfNeeded();
    const scroll = await list.evaluate(element => element.scrollTop);
    assert.ok(scroll > 0);
    await bottom.click();
    await check(bottomId);
    await showPicker();
    assert.ok(await list.evaluate(element => element.scrollTop) >= scroll - 1);
    await page.getByRole("tab", { name: "综合", exact: true }).click();
    await item(h3).click();

    await page.locator("#canvasAgentToggle").click();
    await page.locator("#canvasAgentToggle").click();
    await showPicker();
    await check(h3);
    await openBoard();
    await showPicker();
    await check(h3);
    await book.click();
    await page.locator("#canvasAgentPrompt").fill("如何使用这个 Skill？");
    await page.locator("#canvasAgentSend").click();
    await page.waitForFunction(() => document.querySelector("#canvasAgentMessages").textContent.includes("验收回复"));
    assert.deepEqual(turns[0], { mode: "auto", id: "", runtime: undefined },
      "an informational question keeps the selected Skill but does not invoke its workflow");
    await check(h3);
    await showPicker();
    await check(h3);

    async function loadSession(id) {
      await page.locator("#canvasAgentConversationButton").click();
      await Promise.all([
        page.waitForResponse(response => response.url().includes("conversation_id=" + id)),
        page.locator(`[data-agent-conversation="${id}"]`).click(),
      ]);
    }
    await loadSession(other);
    await showPicker();
    await check("");
    await item(second).click();
    await check(second);
    await loadSession(first);
    await showPicker();
    await check(h3);
    await item(h3).click();
    await openBoard();
    await showPicker();
    await check("");
    await book.click();
    await page.locator("#canvasAgentPrompt").fill("你好，请简单回复。");
    await page.locator("#canvasAgentSend").click();
    await page.waitForFunction(() => document.querySelector("#canvasAgentMessages").textContent.includes("验收自动匹配"));
    assert.equal(turns[1].mode, "auto");
    assert.equal(turns[1].id, "");
    await showPicker();
    await check("");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, stage: 33200, catalogLoads, turns, testedLegacyPersistence: true }));
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
