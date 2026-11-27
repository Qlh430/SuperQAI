const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

test("画布内 Skill 浮层保留引擎，使用只选 Skill，失败与过期消息不改变画布", async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" });
  try {
    const page = await browser.newPage();
    let createdBoards = 0;
    await page.route("**/*", route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/api/canvas/boards") {
        if (route.request().method() === "POST") { createdBoards += 1; return route.fulfill({ json: { id: "b1" } }); }
        return route.fulfill({ json: { boards: [{ id: "b1", resourceId: "r1" }] } });
      }
      return route.fulfill({ contentType: "text/html; charset=utf-8", body: pathname === "/host"
        ? '<div id="aiOsDesktop"></div><div id="canvasView"><input id="draft" value="保留草稿"></div>'
        : '<script>window.messages=[];addEventListener("message",e=>messages.push(e.data))</script>' });
    });
    await page.goto("http://127.0.0.1:33199/host");
    await page.evaluate(() => {
      window.operations = [];
      window.AiOsDesktop = { getSession: () => ({ user: { id: "a1" } }), openInlineApp: async () => {} };
      window.AiOsModuleLoader = { ensure: async () => ({ ok: true }) };
      window.AiOsLegacyWorkbench = { getView: () => document.querySelector("#canvasView") };
      window.CanvasWorkspace = {
        saveForNavigation: async () => window.operations.push("save"),
        openBoardByResourceId: async id => { window.operations.push(id); window.dispatchEvent(new CustomEvent("canvas:board-changed", { detail: { boardId: "b1" } })); return true; },
      };
      window.CanvasAgentUi = { useSkill: async id => { if (id === "denied") throw Error("此 Skill 已停用或当前账户无法访问"); window.operations.push(id); } };
    });
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, "host-bridge.js"), "utf8") });
    await page.locator("#aiOsNeonFrame").waitFor();
    const frame = page.frames().find(frame => frame.url().includes("neon-workbench.html"));
    await frame.evaluate(() => parent.postMessage({ type: "neon:action", action: "canvas", params: { boardId: "b1" } }, location.origin));
    await page.locator("#neonEngineSurface").waitFor();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("neon:request-skill-square")));
    await page.waitForFunction(() => !document.querySelector("#aiOsNeonFrame").hidden);
    const request = await frame.evaluate(() => window.messages.find(message => message.type === "neon:skill-square"));
    assert.ok(request?.requestId);
    assert.equal(await page.locator("#neonEngineSurface").evaluate(node => node.inert), true);
    await frame.evaluate(requestId => parent.postMessage({ type: "neon:action", action: "useCanvasSkill", params: { requestId, skillId: "denied" } }, location.origin), request.requestId);
    await frame.waitForFunction(() => window.messages.some(message => message.type === "neon:skill-error"));
    assert.equal(await page.locator("#aiOsNeonFrame").isVisible(), true);
    await frame.evaluate(requestId => parent.postMessage({ type: "neon:action", action: "useCanvasSkill", params: { requestId, skillId: "photography" } }, location.origin), request.requestId);
    await page.waitForFunction(() => document.querySelector("#aiOsNeonFrame").hidden);
    assert.deepEqual(await page.evaluate(() => window.operations), ["save", "r1", "photography"]);
    assert.equal(await page.locator("#draft").inputValue(), "保留草稿");
    assert.equal(await page.locator("#neonEngineSurface").evaluate(node => node.inert), false);
    // An expired request must never select a Skill on a later board.
    await frame.evaluate(requestId => parent.postMessage({ type: "neon:action", action: "useCanvasSkill", params: { requestId, skillId: "expired" } }, location.origin), request.requestId);
    await page.waitForTimeout(50);
    assert.equal(await page.evaluate(() => window.operations.includes("expired")), false);
    assert.equal(createdBoards, 0, "从广场使用 Skill 不创建画布");
    await page.getByRole("button", { name: "保存并返回工作台" }).click();
    await page.locator("#aiOsNeonFrame").waitFor({ state: "visible" });
    await frame.evaluate(() => parent.postMessage({ type: "neon:action", action: "canvas", params: { skillId: "photography" } }, location.origin));
    await page.waitForFunction(() => document.querySelector("#aiOsNeonFrame").hidden);
    assert.equal(createdBoards, 1, "原有明确新建画布入口仍只创建一次");
    assert.equal(await page.evaluate(() => window.operations.filter(item => item === "photography").length), 2);
    assert.equal(await page.locator("#draft").inputValue(), "保留草稿");
  } finally { await browser.close(); }
});
