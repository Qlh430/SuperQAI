const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const { chromium } = require("playwright");

// All requests are fulfilled in memory. Never connect this fixture to 3199,
// 33200, a real account, or the user's database.
const origin = "http://startup-fixture.test";
const app = path.resolve(__dirname, "../host-sources/app");
const output = path.resolve(__dirname, "../.planning/startup-gate-20261105");
const gate = fs.readFileSync(path.join(app, "index.html"), "utf8")
  .match(/<section class="ai-os-startup-gate"[\s\S]*?<\/section>/)[0];
const staticFiles = new Map([
  ["/startup-overlay.js", path.join(app, "startup-overlay.js")],
  ["/startup-overlay.css", path.join(__dirname, "design-sources/startup-overlay.css")],
  ["/host-bridge.js", path.join(__dirname, "host-bridge.js")],
  ["/workbench.js", path.join(__dirname, "dist/workbench.js")],
  ["/neon-workbench.css", path.join(__dirname, "dist/neon-workbench.css")],
]);
const user = { id: "isolated-startup-test", username: "fixture", displayName: "隔离验收", role: "user", status: "active" };

function api(url) {
  if (url.pathname === "/api/auth/session") return { user, authenticated: true };
  if (url.pathname === "/api/preferences") return { preferences: {} };
  if (url.pathname === "/api/canvas/boards") return { boards: [{ id: "fixture-board", resourceId: "fixture-resource", title: "隔离测试画布", nodeCount: 0 }], trash: [] };
  if (url.pathname === "/api/canvas/projects") return { projects: [] };
  if (url.pathname === "/api/resources") return { resources: [] };
  if (url.pathname.startsWith("/api/history/")) return { records: [] };
  return {};
}

function hostHtml(mode) {
  return `<!doctype html><html lang="zh-CN" class="dark"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <link rel="stylesheet" href="/neon-workbench.css"><link rel="stylesheet" href="/startup-overlay.css">
    </head><body>${gate}<div id="aiOsDesktop"></div><div id="aiOsDesktopHomeApps"><span>壳体</span></div>
    <div id="fixtureCanvas" hidden>隔离画布引擎</div>
    <script>
      window.AiOsDesktop = { getSession: () => ({user:${JSON.stringify(user)}}), openInlineApp: async () => {} };
      window.AiOsModuleLoader = { ensure: async () => ({ok:true}) };
      window.AiOsLegacyWorkbench = {getView: () => document.getElementById("fixtureCanvas")};
      window.CanvasWorkspace = {saveForNavigation: async () => {}, openBoardByResourceId: async () => true};
    </script><script src="/startup-overlay.js"></script><script src="/host-bridge.js"></script>
    <script>
      const emit = (name, detail) => dispatchEvent(new CustomEvent(name,{detail}));
      const failure = {componentLabel:"桌面壳体",componentId:"os-shell",src:"./desktop-shell.js?v=fixture",required:true,critical:true};
      if (${JSON.stringify(mode)} === "failure") {
        emit("ai-os-component-load-failed",failure);
        emit("ai-os-critical-load-complete",{failed:true,failures:[failure]});
      } else emit("ai-os-critical-load-complete",{});
      emit("ai-os-legacy-workbench-ready",{});
      emit("ai-os-module-load-progress",{completed:105,total:105,componentLabel:"后续组件"});
      emit("ai-os-module-load-complete",{degraded:${JSON.stringify(mode === "failure")}});
    </script></body></html>`;
}

test("startup recovery with the real React bundle and host bridge, isolated APIs", async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" });
  const errors = [], requests = [], checks = [];
  let navigations = 0, mode = "normal";
  try {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    await context.route("**/*", async route => {
      const url = new URL(route.request().url());
      requests.push(url.href);
      if (url.origin !== origin) return route.abort("blockedbyclient");
      if (url.pathname === "/") {
        navigations++;
        return route.fulfill({ contentType: "text/html", body: hostHtml(mode) });
      }
      if (url.pathname.startsWith("/api/")) return route.fulfill({ contentType: "application/json", body: JSON.stringify(api(url)) });
      if (url.pathname === "/neon-workbench.html") return route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html lang="zh-CN" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/neon-workbench.css"></head><body><div id="root"></div>${mode === "empty" ? "" : '<script src="/workbench.js"></script>'}</body></html>`,
      });
      if (staticFiles.has(url.pathname)) return route.fulfill({ contentType: url.pathname.endsWith(".css") ? "text/css" : "application/javascript", body: fs.readFileSync(staticFiles.get(url.pathname)) });
      return route.fulfill({ status: 404, body: "Unknown fixture request" });
    });
    for (const width of [390, 768, 1440, 1728]) {
      await page.setViewportSize({ width, height: 960 });
      await page.goto(origin, { waitUntil: "networkidle" });
      const neon = page.frameLocator("#aiOsNeonFrame");
      await neon.getByRole("heading", { name: "今天想创作什么？" }).waitFor();
      await page.locator("#aiOsStartupGate").waitFor({ state: "hidden" });
      assert.equal(await neon.locator("html").evaluate(element => element.scrollWidth > innerWidth), false, `overflow at ${width}`);
      await page.screenshot({ path: path.join(output, `${width}-ready.png`) });
    }
    checks.push("真实 React 包与宿主桥接：四种宽度启动，无 pageerror 或横向溢出");
    const neon = page.frames().find(frame => frame.url().includes("/neon-workbench.html"));
    await neon.evaluate(() => parent.postMessage({ type: "neon:action", action: "canvas", params: { boardId: "fixture-board" } }, location.origin));
    await page.getByText("隔离画布引擎").waitFor();
    await page.getByRole("button", { name: "保存并返回工作台" }).click();
    await page.frameLocator("#aiOsNeonFrame").getByRole("heading", { name: "今天想创作什么？" }).waitFor();
    checks.push("模拟画布打开、保存返回，原工作台 iframe 保留");

    mode = "failure";
    await page.goto(origin, { waitUntil: "networkidle" });
    await page.getByText("工作台组件加载失败", { exact: true }).waitFor();
    await page.getByText(/未能加载：桌面壳体/).waitFor();
    assert.equal(await page.locator("#aiOsStartupGate").isVisible(), true);
    const previous = navigations;
    await Promise.all([page.waitForEvent("domcontentloaded"), page.getByRole("button", { name: "重新加载", exact: true }).click()]);
    assert.equal(navigations, previous + 1, "reload must create a fresh document");
    await page.getByText(/未能加载：桌面壳体/).waitFor();
    await page.screenshot({ path: path.join(output, "failure.png") });
    checks.push("故障注入：后续消息不覆盖错误，显示具体失败文件；按钮实际刷新");

    mode = "empty";
    await page.clock.install();
    await page.goto(origin, { waitUntil: "networkidle" });
    await page.clock.fastForward(13_000);
    const reload = page.getByRole("button", { name: "重新加载", exact: true });
    await reload.waitFor();
    assert.equal(await page.locator("#aiOsStartupGate").isVisible(), true, "empty frame must not hide the slow gate via CSS");
    await reload.hover();
    await reload.focus();
    await page.screenshot({ path: path.join(output, "empty-frame-recovery.png") });
    checks.push("空 iframe 超时仍保留可见的重试入口，悬停及键盘焦点可用");
    assert.deepEqual(errors, []);
    assert.equal(requests.every(url => new URL(url).origin === origin), true, "fixture escaped isolation");
    fs.writeFileSync(path.join(output, "report.json"), JSON.stringify({ evidence: "独立浏览器、内存页面与模拟 API；不代表真实登录验收", checks, errors, requests: requests.length }, null, 2));
    console.log(JSON.stringify({ checks, errors }, null, 2));
  } finally {
    await browser.close();
  }
});
