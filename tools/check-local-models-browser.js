"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(process.env.USERPROFILE, ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"));

const root = path.resolve(__dirname, "..");
const BUNDLED_HASH = "22cea62108ff53b7ccc20f7a008bf30494228d84b1687f29ecbe76936a998101";
const REMOTE_HASH = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

// 设置里的「本地模型」页必须真的能用：检查更新、下载进度、回退内置版本都要在真实页面里成立。
(async () => {
  let model = {
    id: "ben2-base",
    name: "BEN2 Base",
    description: "通用前景分割模型，人物、商品、动物都能抠，纯 CPU 运行。",
    version: "1.0.0",
    size: 222932053,
    installed: true,
    source: "bundled",
    stored: false,
    bundled: true,
    bundledAvailable: true,
    external: false,
    sha256: BUNDLED_HASH,
    upstreamRepository: "PramaLLC/BEN2",
    upstreamLicense: "MIT",
    upstream: null,
    error: null,
  };
  let heldUpdate;
  let releaseUpdate;
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    page.setDefaultTimeout(8_000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const calls = [];
    await page.exposeFunction("modelRequest", async (pathname, options = {}) => {
      calls.push({ pathname, method: options.method || "GET" });
      if (pathname === "/api/background-removal/models") return { models: [model] };
      if (pathname === "/api/background-removal/models/check") {
        model = { ...model, upstream: { sha256: REMOTE_HASH, size: 222932053, checkedAt: "2026-09-18T02:00:00.000Z" } };
        return { model, remote: { sha256: REMOTE_HASH, size: 222932053, publishedAt: "2026-09-18T00:00:00.000Z" }, updateAvailable: true };
      }
      if (pathname === "/api/background-removal/models/update/progress") {
        return { progress: { phase: "downloading", received: 111466026, total: 222932053 } };
      }
      if (pathname === "/api/background-removal/models/update") {
        if (heldUpdate) await heldUpdate;
        model = { ...model, source: "update", stored: true, sha256: REMOTE_HASH, downloadedAt: "2026-09-18T02:05:00.000Z" };
        return { model, remote: { sha256: REMOTE_HASH, size: 222932053 } };
      }
      if (pathname === "/api/background-removal/models/reset") {
        model = { ...model, source: "bundled", stored: false, sha256: BUNDLED_HASH, downloadedAt: null };
        return { removed: true, model };
      }
      throw new Error(`Unexpected model request ${pathname}`);
    });
    await page.setContent('<!doctype html><html lang="zh-CN"><body><div id="aiOsSystemSettingsRoot" style="height:100vh"></div></body></html>');
    for (const [, filename] of fs.readFileSync(path.join(root, "index.html"), "utf8").matchAll(/<link rel="stylesheet" href="\.\/([^?"\s]+)/g)) {
      await page.addStyleTag({ path: path.join(root, filename) });
    }
    for (const filename of ["ai-os-display.js", "protocol-center-ui.js", "model-parameter-controls.js", "provider-test-result.js", "model-test-ui.js", "comfyui-settings-ui.js", "local-models-ui.js", "system-settings-ui.js"]) {
      await page.addScriptTag({ path: path.join(root, filename) });
    }
    await page.evaluate(async () => {
      const fixtures = {
        "/api/preferences": { preferences: { appearance: { theme: "light", scale: 1, animations: "reduced" } } },
        "/api/system/health": {},
        "/api/providers": { providers: [{ id: "first", name: "API first", protocol: "openai", baseUrl: "https://example.test/v1", enabled: true, models: [] }] },
        "/api/protocols": { platformProtocols: [{ id: "openai", label: "OpenAI" }], modelProtocols: [] },
        "/api/providers/auto-fallback": { enabled: true },
        "/api/system/backup/status": {},
        "/api/providers/agent-settings": { models: [], settings: { primary: null, candidates: [] }, unavailable: [] },
        "/api/skills": { groups: [], systemCount: 0, customCount: 0, totalCount: 0, enabledCount: 0 },
      };
      window.settingsApp = AiOsSystemSettings.createSettingsApp({
        root: document.querySelector("#aiOsSystemSettingsRoot"),
        sessionProvider: () => ({ user: { username: "管理员", role: "superadmin" } }),
        request: async (pathname, options = {}) => {
          if (pathname.startsWith("/api/background-removal/")) return window.modelRequest(pathname, options);
          if (!(pathname in fixtures)) throw Error(`Unexpected request ${pathname}`);
          return structuredClone(fixtures[pathname]);
        },
      });
      await window.settingsApp.load();
    });

    await page.locator('[data-settings-nav="models"]').click();
    await page.waitForFunction(() => Boolean(document.querySelector('[data-local-model="ben2-base"]')));
    assert.equal((await page.locator("[data-local-model-badge]").innerText()).trim(), "已就绪");
    let cardText = await page.locator('[data-settings-section="models"]').innerText();
    assert.match(cardText, /随应用内置/, "要写明当前用的是内置权重");
    assert.match(cardText, /213 MB/);
    assert.match(cardText, /PramaLLC\/BEN2/);
    assert.equal(await page.locator("[data-local-model-update]").count(), 0, "没有上游信息时不该出现下载按钮");

    // 检查更新：真的打到检查接口，并把结果落到界面上。
    await page.locator("[data-local-model-check]").click();
    await page.waitForFunction(() => document.querySelector("[data-local-model-note]")?.textContent.includes("上游有新版本"));
    assert.ok(calls.some((call) => call.pathname === "/api/background-removal/models/check" && call.method === "POST"));
    assert.equal((await page.locator("[data-local-model-badge]").innerText()).trim(), "可更新");
    await page.locator("[data-local-model-update]").waitFor();

    // 下载更新：进行中要有进度，完成后要给出结果并出现回退入口。
    heldUpdate = new Promise((resolve) => { releaseUpdate = resolve; });
    await page.locator("[data-local-model-update]").click();
    await page.locator("[data-local-model-progress]").waitFor();
    await page.waitForFunction(() => document.querySelector("[data-local-model-percent]")?.textContent === "50%");
    releaseUpdate();
    heldUpdate = null;
    await page.waitForFunction(() => document.querySelector("[data-local-model-note]")?.textContent.includes("更新完成"));
    assert.equal((await page.locator("[data-local-model-badge]").innerText()).trim(), "已就绪");
    await page.locator("[data-local-model-reset]").waitFor();
    cardText = await page.locator('[data-settings-section="models"]').innerText();
    assert.match(cardText, /已下载的更新/, "更新完成后要显示当前生效的是下载的权重");

    // 回退内置版本：删掉数据目录里的副本。
    await page.locator("[data-local-model-reset]").click();
    await page.waitForFunction(() => document.querySelector("[data-local-model-note]")?.textContent.includes("改回使用随应用内置的版本"));
    assert.ok(calls.some((call) => call.pathname === "/api/background-removal/models/reset" && call.method === "POST"));
    assert.match(await page.locator('[data-settings-section="models"]').innerText(), /随应用内置/);
    assert.equal(await page.locator("[data-local-model-reset]").count(), 0, "回到内置版本后不该再有回退按钮");

    const artifactDir = path.join(root, "artifacts", "local-models");
    fs.mkdirSync(artifactDir, { recursive: true });
    await page.locator('[data-settings-section="models"]').screenshot({ path: path.join(artifactDir, "settings-light.png") });
    await page.setViewportSize({ width: 480, height: 900 });
    const overflow = await page.locator('[data-settings-section="models"]').evaluate((element) => element.scrollWidth - element.clientWidth);
    assert.ok(overflow < 3, `本地模型页在窄屏下溢出 ${overflow}px`);
    await page.evaluate(() => window.settingsApp.destroy());
    assert.deepEqual(errors, []);
    console.log("Local model management browser checks passed: status, check/update/reset round trip, progress and fallback.");
  } finally {
    releaseUpdate?.();
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
