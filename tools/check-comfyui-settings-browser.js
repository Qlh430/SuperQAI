"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const { createComfyService } = require("../comfyui-service");
const { chromium } = require(path.join(process.env.USERPROFILE, ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"));
const root = path.resolve(__dirname, "..");

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-comfy-ui-"));
  fs.mkdirSync(path.join(temp, "ComfyUI"));
  fs.mkdirSync(path.join(temp, "python_embeded"));
  fs.writeFileSync(path.join(temp, "ComfyUI", "main.py"), "# not executed");
  fs.writeFileSync(path.join(temp, "python_embeded", "python.exe"), "not executed");
  const values = new Map();
  const connections = [
    { id: "legacy-comfy", name: "局域网 ComfyUI", baseUrl: "http://192.168.1.53:8188", enabled: true },
    { id: "other-comfy", name: "另一台 ComfyUI", baseUrl: "http://192.168.1.54:8188", enabled: true },
  ];
  let ready = false;
  let failedProbe = false;
  let failSave = false;
  let heldTest;
  let releaseTest;
  let heldStatus;
  let releaseStatus;
  let processCount = 0;
  let fixtureChild;
  let pollCount = 0;
  // Real service normalization, config, probe parsing and lifecycle; only OS/transport
  // boundaries are replaced. This prevents inventing a different UI response schema.
  const service = createComfyService({
    settings: { getSetting: key => values.get(key), setSetting: (key, value) => { if (failSave) throw Error("模拟保存失败"); values.set(key, structuredClone(value)); } },
    getConnections: () => connections,
    updateConnection: (id, baseUrl) => { const item = connections.find(item => item.id === id); if (item) item.baseUrl = baseUrl; },
    fetchImpl: async url => {
      if (failedProbe || (String(url).includes("127.0.0.1") && !ready)) throw Error("offline");
      return new Response('{"system":{},"devices":[{"name":"测试 GPU"}]}');
    },
    spawnImpl: () => {
      processCount++;
      fixtureChild = Object.assign(new EventEmitter(), { pid: 999991, exitCode: null, signalCode: null, stdout: new PassThrough(), stderr: new PassThrough() });
      queueMicrotask(() => fixtureChild.emit("spawn"));
      return fixtureChild;
    },
    stopProcess: async child => { assert.equal(child, fixtureChild); ready = false; child.exitCode = 0; child.emit("exit", 0, null); },
  });
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    page.setDefaultTimeout(6_000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.exposeFunction("comfyRequest", async (pathname, options = {}) => {
      const name = pathname.slice("/api/comfyui/".length);
      if (name === "settings") return options.method === "PUT" ? service.save(options.body) : service.configuration();
      if (name === "status") {
        pollCount++;
        const response = await service.status();
        if (heldStatus) await heldStatus;
        return response;
      }
      const response = await service[name](options.body || {});
      if (name === "test" && heldTest) await heldTest;
      return response;
    });
    await page.setContent('<!doctype html><html lang="zh-CN"><body><div id="aiOsSystemSettingsRoot" style="height:100vh"></div></body></html>');
    for (const [, filename] of fs.readFileSync(path.join(root, "index.html"), "utf8").matchAll(/<link rel="stylesheet" href="\.\/([^?"\s]+)/g)) await page.addStyleTag({ path: path.join(root, filename) });
    for (const filename of ["ai-os-display.js", "protocol-center-ui.js", "model-parameter-controls.js", "provider-test-result.js", "model-test-ui.js", "comfyui-settings-ui.js", "local-models-ui.js", "system-settings-ui.js"]) await page.addScriptTag({ path: path.join(root, filename) });
    await page.evaluate(async () => {
      const api = id => ({ id, name: "API " + id, protocol: "openai", baseUrl: "https://example.test/v1", enabled: true, models: [] });
      const providers = [api("first"), { id: "legacy-comfy", name: "旧 ComfyUI", protocol: "comfyui", baseUrl: "http://192.168.1.53:8188", enabled: true, models: [] }, api("last")];
      const fixtures = {
        "/api/preferences": { preferences: { appearance: { theme: "light", scale: 1, animations: "reduced" } } },
        "/api/system/health": {}, "/api/providers": { providers },
        "/api/protocols": { platformProtocols: [{ id: "comfyui", label: "ComfyUI" }, { id: "openai", label: "OpenAI" }], modelProtocols: [] },
        "/api/providers/auto-fallback": { enabled: true }, "/api/system/backup/status": {},
        "/api/providers/agent-settings": { models: [], settings: { primary: null, candidates: [] }, unavailable: [] },
        "/api/skills": { groups: [], systemCount: 0, customCount: 0, totalCount: 0, enabledCount: 0 },
      };
      window.calls = [];
      window.settingsApp = AiOsSystemSettings.createSettingsApp({
        root: document.querySelector("#aiOsSystemSettingsRoot"),
        sessionProvider: () => ({ user: { username: "管理员", role: "superadmin" } }),
        request: async (pathname, options = {}) => {
          window.calls.push({ pathname, options });
          if (pathname.startsWith("/api/comfyui/")) return window.comfyRequest(pathname, options);
          if (pathname === "/api/providers/reorder") return { providers: options.body.providerIds.map(id => providers.find(item => item.id === id)) };
          if (!(pathname in fixtures)) throw Error("Unexpected request " + pathname);
          return structuredClone(fixtures[pathname]);
        },
      });
      await window.settingsApp.load();
    });
    assert.equal(await page.evaluate(() => calls.some(call => call.pathname.startsWith("/api/comfyui/"))), false);
    await page.locator('[data-settings-nav="providers"]').click();
    assert.equal(await page.locator('[data-provider-select="legacy-comfy"]').count(), 0);
    assert.equal(await page.locator('[name="protocol"] option[value="comfyui"]').count(), 0);
    await page.locator('[data-provider-move="up"][data-provider-id="last"]').click();
    assert.deepEqual(await page.evaluate(() => calls.find(call => call.pathname === "/api/providers/reorder").options.body.providerIds), ["last", "legacy-comfy", "first"], "API reorder keeps hidden ComfyUI IDs and slots");
    await page.locator('[data-provider-new]').first().click();
    assert.equal(await page.locator('[name="name"]').inputValue(), "新提供商", "filtering does not discard a new API draft");

    await page.locator('[data-settings-nav="comfyui"]').click();
    const form = page.locator("[data-comfy-form]");
    await page.waitForFunction(() => !document.querySelector("[data-comfy-fields]").disabled);
    assert.equal(await form.locator('input[name="apiKey"]').count(), 0);
    assert.equal(await form.locator('input[name="rootDirectory"]').count(), 0);
    await form.locator('[name="providerId"]').selectOption("other-comfy");
    assert.equal(await form.locator('[name="baseUrl"]').inputValue(), "http://192.168.1.54:8188");
    await form.locator('[name="providerId"]').selectOption("legacy-comfy");
    await form.locator("[data-comfy-test]").click();
    await page.waitForFunction(() => document.querySelector("[data-comfy-badge]").textContent === "连接可用");
    assert.match(await page.locator("[data-comfy-feedback]").innerText(), /测试 GPU/);
    assert.equal(await form.locator("[data-comfy-stop]").isVisible(), false);
    assert.equal(processCount, 0, "testing does not launch a process");
    const artifacts = path.join(root, "artifacts", "comfyui");
    fs.mkdirSync(artifacts, { recursive: true });
    await page.locator('[data-settings-section="comfyui"]').screenshot({ path: path.join(artifacts, "remote-light.png") });

    heldTest = new Promise(resolve => { releaseTest = resolve; });
    await form.locator("[data-comfy-test]").click();
    await form.locator('[name="baseUrl"]').fill("http://192.168.1.55:8188");
    releaseTest(); heldTest = null;
    await page.waitForFunction(() => !document.querySelector("[data-comfy-test]").disabled);
    assert.equal(await page.locator("[data-comfy-badge]").innerText(), "未测试", "old probe cannot mark edited URL available");
    failedProbe = true;
    await form.locator("[data-comfy-test]").click();
    await page.waitForFunction(() => document.querySelector("[data-comfy-badge]").textContent === "无法连接");
    assert.match(await page.locator("[data-comfy-feedback]").innerText(), /无法连接|防火墙/);
    failedProbe = false;
    failSave = true;
    await form.locator('[data-comfy-action="save"]').click();
    await page.waitForFunction(() => document.querySelector("[data-comfy-feedback]").textContent.includes("模拟保存失败"));
    assert.equal(await form.locator('[name="baseUrl"]').inputValue(), "http://192.168.1.55:8188", "save errors keep edits");
    failSave = false;
    await form.locator('[data-comfy-action="save"]').click();
    await page.waitForFunction(() => document.querySelector("[data-comfy-dirty]").textContent === "配置已保存");
    assert.equal(service.resolveUrl(), "http://192.168.1.55:8188");
    assert.equal(service.configuration().config.listenHost, "127.0.0.1", "remote form never clears hidden local defaults");

    heldStatus = new Promise(resolve => { releaseStatus = resolve; });
    await page.locator("[data-comfy-refresh]").click();
    await form.locator('[name="baseUrl"]').fill("http://192.168.1.56:8188");
    releaseStatus(); heldStatus = null;
    await page.waitForFunction(() => !document.querySelector("[data-comfy-refresh]").disabled);
    assert.equal(await form.locator('[name="baseUrl"]').inputValue(), "http://192.168.1.56:8188");
    assert.equal(await page.locator("[data-comfy-badge]").innerText(), "未测试");

    await form.locator('[name="mode"][value="local"]').check();
    assert.equal(await form.locator('[name="listenHost"]').inputValue(), "127.0.0.1");
    assert.equal(await form.locator('[name="baseUrl"]').evaluate(element => element.readOnly), true);
    assert.equal(await form.locator('[name="pythonPath"]').isVisible(), false, "advanced paths are folded");
    await form.locator('[name="rootDirectory"]').fill(temp);
    await form.locator("[data-comfy-detect]").click();
    await page.waitForFunction(() => document.querySelector("[data-comfy-feedback]").textContent.includes("已识别"));
    assert.equal(await form.locator('[name="mainPath"]').inputValue(), path.join(temp, "ComfyUI", "main.py"));
    await form.locator('[name="rootDirectory"]').fill(temp + "-changed");
    assert.equal(await form.locator('[name="mainPath"]').inputValue(), "", "changing root must not keep the previous installation entry point");
    assert.equal(await form.locator('[name="pythonPath"]').inputValue(), "");
    await form.locator('[name="rootDirectory"]').fill(temp);
    await form.locator('[name="listenHost"]').fill("0.0.0.0");
    // Ephemeral unused port only, never the user's actual ComfyUI port.
    const portProbe = require("node:net").createServer();
    const port = await new Promise(resolve => portProbe.listen(0, "127.0.0.1", () => resolve(portProbe.address().port)));
    await new Promise(resolve => portProbe.close(resolve));
    await form.locator('[name="port"]').fill(String(port));
    await page.locator('[data-settings-section="comfyui"]').screenshot({ path: path.join(artifacts, "local-light.png") });
    assert.equal(await form.locator("[data-comfy-start]").innerText(), "保存并启动");
    await form.locator("[data-comfy-start]").click();
    await page.waitForFunction(() => document.querySelector("[data-comfy-badge]").textContent === "正在启动");
    assert.equal(service.configuration().config.port, port, "start saves current form, not stale settings");
    assert.equal(service.resolveUrl(), `http://127.0.0.1:${port}`);
    assert.equal(processCount, 1);
    assert.equal(await form.locator('[name="port"]').isDisabled(), true);
    fixtureChild.stderr.write("ComfyUI startup fixture\n");
    ready = true;
    await page.waitForFunction(() => document.querySelector("[data-comfy-badge]").textContent === "运行中");
    assert.ok(pollCount > 0, "the running indicator uses status polling");
    assert.match(await page.locator("[data-comfy-runtime]").innerText(), /AI OS 托管进程/);
    await form.locator("[data-comfy-stop]").click();
    await page.waitForFunction(() => document.querySelector("[data-comfy-badge]").textContent === "已停止");
    assert.equal(await form.locator('[name="port"]').isEnabled(), true);
    assert.equal(fixtureChild.exitCode, 0);

    await form.locator(".settings-comfy-advanced > summary").click();
    await page.evaluate(() => { AiOsDisplay.applyPreferences({ appearance: { theme: "dark", scale: 1, animations: "reduced" } }, document.documentElement); });
    await page.locator('[data-settings-section="comfyui"]').screenshot({ path: path.join(artifacts, "local-dark.png") });
    await page.setViewportSize({ width: 480, height: 900 });
    const overflows = await page.locator('[data-settings-section="comfyui"]').evaluate(element => element.scrollWidth - element.clientWidth);
    assert.ok(overflows < 3, `ComfyUI page overflows narrow viewport by ${overflows}px`);
    const radioSize = await form.locator('[name="mode"][value="local"]').boundingBox();
    assert.ok(radioSize.width <= 22 && radioSize.height <= 22, "global input styling must not enlarge the mode radio");
    await page.screenshot({ path: path.join(artifacts, "mobile-dark.png"), fullPage: true });

    await page.setViewportSize({ width: 1440, height: 1100 });
    heldTest = new Promise(resolve => { releaseTest = resolve; });
    await form.locator("[data-comfy-test]").click();
    await page.locator('[data-settings-nav="providers"]').click();
    releaseTest(); heldTest = null;
    await page.waitForFunction(() => Boolean(document.querySelector('[data-settings-section="providers"]')));
    assert.equal(await page.locator('[data-settings-section="comfyui"]').count(), 0, "late responses never reopen the page");
    await page.evaluate(() => window.settingsApp.destroy());
    assert.deepEqual(errors, []);
    console.log("ComfyUI browser checks passed: real service contract, API separation/order, drafts, stale results, detect/save/start, readiness polling, stop, dark/light/mobile.");
  } finally {
    releaseTest?.(); releaseStatus?.();
    await browser.close();
    await service.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
