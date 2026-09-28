"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(process.env.USERPROFILE, ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"));
const root = path.resolve(__dirname, "..");

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    page.setDefaultTimeout(5_000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setContent('<!doctype html><html lang="zh-CN"><body><div id="aiOsSystemSettingsRoot" style="height:100vh"></div></body></html>');
    for (const [, filename] of fs.readFileSync(path.join(root, "index.html"), "utf8").matchAll(/<link rel="stylesheet" href="\.\/([^?"\s]+)/g)) await page.addStyleTag({ path: path.join(root, filename) });
    for (const filename of ["ai-os-display.js", "protocol-center-ui.js", "model-parameter-controls.js", "provider-test-result.js", "model-test-ui.js", "comfyui-settings-ui.js", "system-settings-ui.js"]) await page.addScriptTag({ path: path.join(root, filename) });
    await page.evaluate(async () => {
      const models = [
        { id: "gpt-5.5", displayName: "GPT 5.5", protocol: "openai", capabilities: ["llm.chat", "llm.chat.vision", "llm.tools"], metadata: { parameterOverrides: { temperature: 0.75, max_tokens: true, vendor_options: { keep: true } } } },
        { id: "gpt-image-2", displayName: "gpt-image-2", protocol: "openai", capabilities: ["image.generate", "image.edit"] },
      ];
      const provider = { id: "internal-uuid", name: "示例 API", protocol: "openai", baseUrl: "https://example.test/v1", hasApiKey: true, enabled: true, models };
      const fixtures = {
        "/api/preferences": { preferences: { appearance: { theme: "light", scale: 1, animations: "reduced" } } },
        "/api/system/health": {}, "/api/providers": { providers: [provider, { ...provider, id: "second", name: "第二站点" }] },
        "/api/protocols": {
          platformProtocols: [
            { id: "openai", label: "OpenAI 兼容同步" },
            { id: "gemini", label: "Gemini 原生" },
            { id: "apimart", label: "APIMart API" },
          ],
          modelProtocols: [
            { id: "openai", label: "OpenAI 兼容同步", capabilities: ["llm.chat", "llm.tools", "image.generate", "image.edit"], compatiblePlatformProtocols: ["openai", "gemini"] },
            { id: "apimart", label: "APIMart 旧版图片任务", capabilities: ["image.generate"], compatiblePlatformProtocols: ["apimart"] },
            { id: "midjourney", label: "Midjourney 专用协议", modelVisible: true, capabilities: ["image.generate"], compatiblePlatformProtocols: ["openai"], requiresApimartHostForOpenAi: true },
            { id: "gemini", label: "Gemini 原生图片协议", modelVisible: true, capabilities: ["image.generate", "image.edit"], compatiblePlatformProtocols: ["openai", "gemini"], requiresApimartHostForOpenAi: true },
          ],
        },
        "/api/providers/auto-fallback": { enabled: true }, "/api/system/backup/status": {},
        "/api/providers/agent-settings": {
          configured: false,
          settings: { primary: null, candidates: [] },
          unavailable: [],
          models: [
            { providerId: "internal-uuid", providerName: "示例 API", modelId: "gpt-5.5", modelName: "GPT 5.5", capabilities: ["llm.chat", "llm.chat.vision", "llm.tools"] },
            { providerId: "second", providerName: "第二站点", modelId: "gpt-5.5", modelName: "GPT 5.5", capabilities: ["llm.chat", "llm.chat.vision", "llm.tools"] },
          ],
        },
        "/api/providers/models": { platformProtocol: "openai", models: ["gpt-5.5", "gpt-image-2", "catalog-model-grsai"], modelConfigurations: [...models, { id: "catalog-model-grsai", protocol: "openai", capabilities: ["llm.chat"] }] },
      };
      // Mirrors the server: the Agent catalog follows saved providers.
      function agentCatalog() {
        const base = structuredClone(fixtures["/api/providers/agent-settings"]);
        const catalog = [...base.models, ...(window.agentCatalogExtra ? [structuredClone(window.agentCatalogExtra)] : [])];
        return { ...base, models: catalog.filter(model => !(window.agentCatalogHideSecond && model.providerId === "second")) };
      }
      window.requests = [];
      window.settingsApp = AiOsSystemSettings.createSettingsApp({
        root: document.querySelector("#aiOsSystemSettingsRoot"), sessionProvider: () => ({ user: { username: "管理员", role: "superadmin" } }),
        request: async (pathname, options) => {
          window.requests.push({ pathname, body: options?.body });
          if (pathname === "/api/providers/verify-protocol") {
            if (window.holdVerification) await new Promise(resolve => { window.releaseVerification = resolve; });
            return options.body.provider.protocol === "gemini"
              ? { available: false, selectedProtocol: "gemini", recommendedProtocol: "openai", guidance: "检测到可访问模型目录的协议" }
              : { available: true, selectedProtocol: "openai", models: ["gpt-5.5"], baseUrl: "https://example.test/v1" };
          }
          if (pathname === "/api/providers/infer-protocols") return { models };
          if (pathname === "/api/providers/agent-coverage") {
            const live = options?.body?.refreshModels === true;
            if (window.largeCoverage) return { coverage: {
              providerId: options.body.provider.id, source: "live",
              summary: { total: 74, ready: 74, mediaTools: 1 },
              models: Array.from({ length: 75 }, (_, i) => ({
                id: `catalog-${String(i).padStart(3, "0")}`, state: i === 74 ? "tool" : "ready",
                role: i === 74 ? "image-tool" : "agent-main", reason: "配置检查通过，尚未实测",
              })),
            } };
            return { coverage: {
              providerId: options.body.provider.id,
              source: live ? "live" : "saved",
              summary: live
                ? { total: 2, ready: 1, configurable: 1, partial: 0, missing: 0, visionReady: 0, mediaTools: 1 }
                : { total: 1, ready: 1, configurable: 0, partial: 0, missing: 0, visionReady: 0, mediaTools: 1 },
              models: live ? [
                { id: "gpt-5.5", state: "ready", reason: "支持 Agent 对话和工具调用。" },
                { id: "catalog-model-grsai", state: "configurable", reason: "模型协议支持工具调用，但当前配置尚未启用。" },
                { id: "gpt-image-2", state: "tool", role: "image-tool", reason: "可由 Agent 作为图片工具调用，不作为主模型。" },
              ] : [
                { id: "gpt-5.5", state: "ready", reason: "支持 Agent 对话和工具调用。" },
                { id: "gpt-image-2", state: "tool", role: "image-tool", reason: "可由 Agent 作为图片工具调用，不作为主模型。" },
              ],
            } };
          }
          if (pathname === "/api/providers/test" || pathname === "/api/providers/test-image") {
            if (window.failTests) throw new Error("模拟上游不可用");
            return pathname === "/api/providers/test"
              ? { test: { status: "succeeded", text: "你好，收到你的测试消息。", images: [], elapsedMs: 100 } }
              : { test: { status: "succeeded", text: "", images: ["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7ioAAAAASUVORK5CYII="], elapsedMs: 1500 } };
          }
          if (pathname === "/api/providers" && options?.method === "POST") {
            if ((options.body?.models || []).some(model => model.id === "catalog-model-grsai")) {
              window.agentCatalogExtra = { providerId: options.body.id, providerName: options.body.name, modelId: "gpt-5.6-terra", modelName: "gpt-5.6-terra", capabilities: ["llm.chat", "llm.chat.vision", "llm.tools"] };
            }
            return { provider: options.body };
          }
          if (pathname === "/api/providers/agent-settings" && !options?.method) return agentCatalog();
          if (pathname === "/api/providers/agent-settings" && options?.method === "POST") return {
            configured: true,
            settings: structuredClone(options.body),
            unavailable: [],
            models: agentCatalog().models,
          };
          if (!(pathname in fixtures)) throw new Error("Unexpected request " + pathname);
          return structuredClone(fixtures[pathname]);
        },
      });
      await window.settingsApp.load();
    });
    await page.locator('[data-settings-nav="agent"]').click();
    const agentArtifacts = path.join(root, "artifacts", "agent-settings");
    fs.mkdirSync(agentArtifacts, { recursive: true });
    // The sidebar must not draw its own window dots, and the search input must sit inside its pill.
    assert.equal(await page.locator(".settings-sidebar-lights").count(), 0, "the settings sidebar draws no decorative window dots");
    const searchGeometry = await page.locator(".settings-search").evaluate((pill) => {
      const input = pill.querySelector("input");
      const pillRect = pill.getBoundingClientRect();
      const inputRect = input.getBoundingClientRect();
      return {
        pill: { top: pillRect.top, bottom: pillRect.bottom, height: pillRect.height },
        input: { top: inputRect.top, bottom: inputRect.bottom, height: inputRect.height, background: getComputedStyle(input).backgroundColor },
      };
    });
    assert.ok(searchGeometry.input.top >= searchGeometry.pill.top - 0.5 && searchGeometry.input.bottom <= searchGeometry.pill.bottom + 0.5, `the search input stays inside its pill ${JSON.stringify(searchGeometry)}`);
    assert.match(searchGeometry.input.background, /rgba?\(0, 0, 0, 0\)/, "the search input paints no background of its own");
    // Focusing the field must highlight the pill only; the inner input keeps no ring of its own.
    await page.locator(".settings-search input").click();
    const focusedSearch = await page.locator(".settings-search input").evaluate((input) => {
      const style = getComputedStyle(input);
      return { outline: style.outlineWidth, outlineStyle: style.outlineStyle, boxShadow: style.boxShadow, pillOutline: getComputedStyle(input.closest(".settings-search")).outlineStyle };
    });
    assert.equal(focusedSearch.outlineStyle, "none", `the focused search input draws no outline of its own ${JSON.stringify(focusedSearch)}`);
    assert.equal(focusedSearch.boxShadow, "none", `the focused search input draws no focus shadow of its own ${JSON.stringify(focusedSearch)}`);
    await page.locator(".settings-search input").fill("API");
    assert.equal(await page.locator('[data-settings-nav="providers"]').first().isVisible(), true, "search keeps matching sections visible");
    assert.equal(await page.locator('[data-settings-nav="agent"]').first().isVisible(), false, "search hides non-matching sections");
    assert.equal(await page.locator('[data-settings-nav="appearance"]').first().isVisible(), false, "search hides non-matching sections");
    await page.locator(".settings-search input").fill("");
    assert.equal(await page.locator('[data-settings-nav="appearance"]').first().isVisible(), true, "clearing the search restores the sidebar");
    await page.locator(".settings-search input").blur();
    await page.locator(".ai-os-settings-sidebar").screenshot({ path: path.join(agentArtifacts, "sidebar.png") });
    assert.match(await page.locator('[data-settings-section="agent"]').innerText(), /对话、识图和工具调用/);
    assert.equal((await page.locator('[data-settings-section="agent"]').innerText()).includes("gpt-image-2"), false);
    assert.equal(await page.locator("[data-agent-primary-toggle] strong").innerText(), "选择主模型");
    assert.equal(await page.locator("[data-agent-primary-menu]").isHidden(), true);
    await page.locator('[data-agent-primary-toggle]').click();
    assert.equal(await page.locator("[data-agent-primary-menu]").isVisible(), true);
    assert.equal(await page.locator("[data-agent-primary-option]").count(), 2);
    const primaryTriggerBox = await page.locator("[data-agent-primary-toggle]").boundingBox();
    const primaryMenuBox = await page.locator("[data-agent-primary-menu]").boundingBox();
    assert.ok(primaryMenuBox.y >= primaryTriggerBox.y + primaryTriggerBox.height - 1, "the primary list opens below its trigger");
    assert.ok(primaryMenuBox.width > 200, "the primary list keeps a readable width");
    await page.locator('[data-settings-section="agent"]').screenshot({ path: path.join(agentArtifacts, "primary-menu-light.png") });
    const firstAgentOption = page.locator('[data-agent-primary-option][data-provider-id="internal-uuid"]');
    assert.equal(await firstAgentOption.locator("strong").innerText(), "gpt-5.5");
    assert.equal(await firstAgentOption.locator("small").innerText(), "示例 API");
    assert.equal(await firstAgentOption.getAttribute("aria-selected"), "false");
    await firstAgentOption.click();
    assert.equal(await page.locator("[data-agent-primary-menu]").isHidden(), true, "picking a primary model closes the list");
    assert.equal(await page.locator("[data-agent-primary-toggle] strong").innerText(), "gpt-5.5");
    assert.equal(await page.locator("[data-agent-primary-toggle] small").innerText(), "示例 API");
    assert.equal(await page.locator('[data-agent-primary-option][data-provider-id="internal-uuid"]').getAttribute("aria-selected"), "true");
    await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
    await page.locator('[data-agent-primary-toggle]').click();
    assert.equal(await page.locator('[data-agent-primary-option][aria-selected="true"] strong').innerText(), "gpt-5.5");
    await page.locator('[data-settings-section="agent"]').screenshot({ path: path.join(agentArtifacts, "primary-menu-dark.png") });
    await page.locator('[data-agent-primary-toggle]').click();
    await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
    await page.locator('[data-agent-candidate][data-provider-id="second"]').check();
    await page.locator('[data-agent-save]').click();
    await page.waitForFunction(() => window.requests.some(item => item.pathname === "/api/providers/agent-settings" && item.body?.primary));
    const agentRequest = [...await page.evaluate(() => window.requests)].reverse().find(item => item.pathname === "/api/providers/agent-settings" && item.body?.primary);
    assert.deepEqual(agentRequest.body, {
      primary: { providerId: "internal-uuid", modelId: "gpt-5.5" },
      candidates: [{ providerId: "second", modelId: "gpt-5.5" }],
    });
    await page.locator('[data-settings-section="agent"]').screenshot({ path: path.join(agentArtifacts, "desktop.png") });
    await page.setViewportSize({ width: 390, height: 900 });
    assert.equal(await page.locator('[data-settings-section="agent"]').evaluate(node => node.scrollWidth <= node.clientWidth), true);
    await page.locator('[data-settings-section="agent"]').screenshot({ path: path.join(agentArtifacts, "mobile.png") });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.locator('[data-settings-nav="providers"]').click();
    assert.match(await page.locator('[data-settings-nav="providers"]').innerText(), /API 设置/);
    assert.match(await page.locator('[data-agent-coverage]').innerText(), /站点 Agent 覆盖率/);
    assert.match(await page.locator('[data-agent-coverage]').innerText(), /自动回退/);
    await page.locator('[data-agent-coverage-saved]').click();
    await page.waitForFunction(() => document.querySelector('[data-agent-coverage-summary]')?.textContent.includes("1/1"));
    assert.match(await page.locator('[data-agent-coverage-summary]').innerText(), /1\/1 个主模型配置匹配/);
    assert.match(await page.locator('[data-agent-coverage-summary]').innerText(), /1 个媒体工具模型/);
    assert.match(await page.locator('[data-agent-coverage-model][data-state="tool"]').innerText(), /Agent 图片工具/);
    assert.equal((await page.locator('[data-agent-coverage]').innerText()).includes("不适用"), false);
    assert.equal((await page.locator('[data-agent-coverage-model][data-state="ready"]').count()), 1);
    await page.locator('[data-agent-coverage-live]').click();
    await page.waitForFunction(() => document.querySelector('[data-agent-coverage-summary]')?.textContent.includes("1/2"));
    assert.match(await page.locator('[data-agent-coverage-summary]').innerText(), /站点实际列表/);
    assert.match(await page.locator('[data-agent-coverage-model][data-state="configurable"]').innerText(), /可启用 Agent/);
    assert.equal((await page.locator('[data-agent-coverage]').innerText()).includes("缺少工具能力"), false);
    const coverageRequests = (await page.evaluate(() => window.requests)).filter(item => item.pathname === "/api/providers/agent-coverage");
    assert.deepEqual(coverageRequests.map(item => item.body.refreshModels), [false, true]);
    await page.evaluate(() => { window.largeCoverage = true; });
    await page.locator('[data-agent-coverage-live]').click();
    await page.waitForFunction(() => document.querySelector('[data-agent-coverage-summary]')?.textContent.includes("74/74"));
    assert.equal(await page.locator('[data-agent-coverage-model]').count(), 30);
    await page.locator('[data-coverage-next]').click();
    assert.equal(await page.locator('[data-agent-coverage-model] strong').first().innerText(), "catalog-030");
    await page.locator('[data-coverage-next]').click();
    assert.equal(await page.locator('[data-agent-coverage-model]').count(), 15);
    await page.locator('[data-coverage-search]').fill("catalog-073");
    assert.equal(await page.locator('[data-agent-coverage-model]').count(), 1);
    assert.equal(await page.locator('[data-agent-coverage-model] strong').innerText(), "catalog-073");
    await page.locator('[data-coverage-search]').fill("");
    await page.locator('[data-coverage-filter]').selectOption("media");
    assert.equal(await page.locator('[data-agent-coverage-model] strong').innerText(), "catalog-074");
    await page.locator('[data-coverage-search]').fill("no-match");
    assert.equal(await page.locator('[data-agent-coverage-model]').count(), 0);
    assert.match(await page.locator('[data-coverage-results]').innerText(), /没有匹配/);
    await page.evaluate(() => { window.largeCoverage = false; });
    await page.locator('[data-provider-recommendations]').click();
    const recommendedCard = page.locator('[data-recommended-apimart]');
    await recommendedCard.waitFor();
    assert.equal(await recommendedCard.locator('input[name="baseUrl"]').count(), 0, "recommended APIMart setup does not expose Base URL");
    assert.equal(await recommendedCard.locator('a[href="https://apimart.ai/zh/register"]').count(), 1, "APIMart registration link points to the official entry");
    const artifacts = path.join(root, "artifacts", "api-settings");
    fs.mkdirSync(artifacts, { recursive: true });
    await page.locator('[data-settings-section="providers"]').screenshot({ path: path.join(artifacts, "recommended-light.png") });
    await recommendedCard.locator('[data-apimart-api-key]').fill("browser-apimart-key");
    await recommendedCard.locator('[data-apimart-save]').click();
    const recommendedRequest = [...await page.evaluate(() => window.requests)].reverse().find(item => item.pathname === "/api/providers" && item.body?.apiKey === "browser-apimart-key");
    assert.ok(recommendedRequest, "saving recommended APIMart posts provider configuration");
    assert.deepEqual(
      {
        name: recommendedRequest.body.name,
        baseUrl: recommendedRequest.body.baseUrl,
        protocol: recommendedRequest.body.protocol,
        networkMode: recommendedRequest.body.metadata?.networkMode,
      },
      { name: "APIMart", baseUrl: "https://apib.ai", protocol: "openai", networkMode: "direct" },
    );
    assert.equal(await page.locator('input[name="id"]').isVisible(), false, "internal ID is hidden");
    assert.deepEqual(await page.locator(".settings-provider-fields label > span").allTextContents(), ["名称", "平台协议", "网络线路", "Base URL", "API Key"]);
    assert.equal(await page.locator('[name="protocol"] option[value="apimart"]').count(), 0, "internal APIMart platform is not selectable");
    assert.equal((await page.locator('[data-settings-section="providers"]').innerText()).includes("APIMart 旧版图片任务"), false);
    const base = await page.locator('[name="baseUrl"]').boundingBox();
    const key = await page.locator('[name="apiKey"]').boundingBox();
    assert.equal(Math.round(key.width), Math.round(base.width));
    const row = page.locator('[data-provider-model]').first();
    assert.equal(await row.locator('[data-model-test]').isVisible(), true);
    assert.equal(await row.locator('[data-model-parameter-overrides]').count(), 0);
    assert.equal(await row.locator('[data-model-param="temperature"]').isVisible(), false);
    assert.ok((await row.boundingBox()).height < 125, "saved model uses a compact row");
    await row.locator('[data-model-test]').click();
    assert.equal(await page.evaluate(() => requests.some(item => item.pathname === "/api/providers/test")), false, "open only, no request");
    await page.locator('[data-test-prompt]').fill("你好");
    await page.locator('[data-test-send]').click();
    await page.waitForFunction(() => document.querySelector('[data-model-test-status]')?.textContent.includes("对话测试成功"));
    await page.locator('[data-test-close]').click();
    const imageRow = page.locator('[data-provider-model]').nth(1);
    await imageRow.locator('[data-model-test]').click();
    await page.locator('[data-test-prompt]').fill("画一只猫");
    await page.locator('[data-test-send]').click();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-model-test-status]')].some(node => node.textContent.includes("图片测试成功")));
    await page.locator('[data-test-output] img').waitFor();
    await page.locator('[data-test-close]').click();
    await page.evaluate(() => { window.failTests = true; });
    await row.locator('[data-model-test]').click();
    await page.locator('[data-test-prompt]').fill("测试失败");
    await page.locator('[data-test-send]').click();
    await page.waitForFunction(() => document.querySelector('[data-test-status]')?.textContent.includes("未通过"));
    await page.locator('[data-test-close]').click();
    await imageRow.locator('[data-model-test]').click();
    await page.locator('[data-test-prompt]').fill("测试失败");
    await page.locator('[data-test-send]').click();
    await page.waitForFunction(() => document.querySelector('[data-test-status]')?.textContent.includes("未通过"));
    await page.locator('[data-test-close]').click();
    await page.waitForFunction(() => [...document.querySelectorAll('[data-model-test-status]')].filter(node => node.textContent.includes("测试未通过")).length === 2);
    await row.locator('.settings-model-details > summary').click();
    await row.locator('.settings-model-defaults > summary').click();
    assert.equal(await row.locator('[data-model-param="temperature"]').isVisible(), true);
    await row.locator('[data-model-param="temperature"]').fill("0.8");
    await imageRow.locator('.settings-model-details > summary').click();
    await imageRow.locator('[data-model-protocol]').dispatchEvent("change");
    await row.locator('[data-model-param="temperature"]').fill("0.75");
    await imageRow.locator('.settings-model-details > summary').click();
    assert.equal(await row.locator('[data-model-protocol] option[value="midjourney"]').count(), 0, "ordinary OpenAI providers hide APIMart/APIB-only Midjourney profile");
    assert.equal(await row.locator('[data-model-protocol] option[value="gemini"]').count(), 0, "ordinary OpenAI providers hide APIMart/APIB-only Gemini profile");
    assert.equal(await row.locator('[data-model-name]').count(), 0, "display name editor is removed");
    assert.equal(await row.locator('[data-model-id-input]').evaluate(input => input.readOnly), true, "catalog model IDs are immutable");
    assert.equal(await row.locator('[data-model-id-input]').inputValue(), "gpt-5.5");
    await row.locator('[data-model-id-input]').evaluate(input => { input.value = "tampered-model"; });
    await row.locator('[data-model-test]').click();
    await page.locator('[data-test-prompt]').fill("测试 ID");
    await page.locator('[data-test-send]').click();
    await page.waitForFunction(() => document.querySelector('[data-test-status]')?.textContent.includes("未通过"));
    await page.locator('[data-test-close]').click();
    const immutableRequest = [...await page.evaluate(() => window.requests)].reverse().find(item => item.pathname === "/api/providers/test");
    assert.equal(immutableRequest.body.modelId, "gpt-5.5", "test uses stored ID instead of editable DOM state");
    assert.equal(immutableRequest.body.provider.models[0].id, "gpt-5.5");
    await row.locator('[data-model-id-input]').evaluate(input => { input.value = "gpt-5.5"; });
    await row.locator('.settings-model-details > summary').click();
    assert.equal(await row.locator('[data-model-summary-name]').innerText(), "gpt-5.5", "summary uses catalog ID, not old display alias");
    await page.locator('[data-provider-verify]').click();
    await page.waitForFunction(() => document.querySelector('[data-provider-status]')?.textContent.includes("OpenAI 兼容同步可用"));
    await page.locator('[name="networkMode"]').selectOption("direct");
    assert.ok(!(await page.locator('[data-provider-status]').innerText()).includes("可用"), "changing the network route invalidates old verification");
    await page.locator('[data-provider-sync]').click();
    await page.locator('[data-model-discovery]').waitFor();
    assert.equal(await page.locator('[data-provider-select="internal-uuid"]').evaluate(button => button.parentElement.classList.contains("active")), true, "the edited provider stays highlighted after a draft render");
    assert.equal(await page.locator('[data-discovered-model]:checked').count(), 2);
    assert.equal(await page.locator('[data-discovered-model="catalog-model-grsai"]').isChecked(), false);
    await page.locator('[data-discovered-model="catalog-model-grsai"]').check();
    await page.locator('[data-model-discovery-add]').click();
    const addedRow = page.locator('[data-provider-model][data-model-id="catalog-model-grsai"]');
    assert.equal(await addedRow.locator('[data-model-summary-name]').innerText(), "catalog-model-grsai");
    assert.equal(await addedRow.locator('[data-model-id-input]').evaluate(input => input.readOnly), true);
    await page.locator('[data-provider-form] button[type="submit"]').click();
    const savedRequest = [...await page.evaluate(() => window.requests)].reverse().find(item => item.pathname === "/api/providers" && item.body?.id === "internal-uuid");
    assert.deepEqual(savedRequest.body.models.map(model => model.id), ["gpt-5.5", "gpt-image-2", "catalog-model-grsai"]);
    assert.deepEqual(savedRequest.body.models.map(model => model.displayName), ["gpt-5.5", "gpt-image-2", "catalog-model-grsai"]);
    assert.deepEqual(savedRequest.body.models[0].metadata.parameterOverrides, { temperature: 0.75, max_tokens: true, vendor_options: { keep: true } }, "native fields do not block or corrupt legacy defaults when saving");
    await page.locator('[data-model-discovery]').waitFor({ state: "detached" });
    // Saving an API provider must refresh the Agent catalog without a page reload.
    await page.locator('[data-settings-nav="agent"]').click();
    await page.locator('[data-agent-primary-toggle]').click();
    const refreshedAgentOption = page.locator('[data-agent-primary-option][data-model-id="gpt-5.6-terra"]');
    await refreshedAgentOption.waitFor();
    assert.equal(await page.locator("[data-agent-primary-option]").count(), 3);
    assert.equal(await refreshedAgentOption.locator("strong").innerText(), "gpt-5.6-terra");
    assert.equal(await refreshedAgentOption.locator("small").innerText(), "示例 API");
    await refreshedAgentOption.click();
    assert.equal(await page.locator("[data-agent-primary-toggle] strong").innerText(), "gpt-5.6-terra");
    assert.equal(await page.locator("[data-agent-primary-menu]").isHidden(), true);
    // Picks join the takeover order instead of being reshuffled into catalog order.
    const candidateRow = providerId => page.locator(".settings-agent-model-row", { has: page.locator(`[data-agent-candidate][data-provider-id="${providerId}"]`) });
    assert.deepEqual(await page.locator(".settings-agent-group").allTextContents(), ["接管顺序", "可选模型"]);
    assert.match(await page.locator(".settings-agent-candidates header span").innerText(), /按下面的序号依次接管/);
    await candidateRow("second").locator("[data-agent-candidate]").check();
    await candidateRow("internal-uuid").locator("[data-agent-candidate]").check();
    assert.equal(await candidateRow("second").locator(".settings-agent-order").innerText(), "1");
    assert.equal(await candidateRow("internal-uuid").locator(".settings-agent-order").innerText(), "2");
    await page.locator('[data-settings-section="agent"]').screenshot({ path: path.join(agentArtifacts, "candidate-order.png") });
    await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
    await page.locator('[data-settings-section="agent"]').screenshot({ path: path.join(agentArtifacts, "candidate-order-dark.png") });
    await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.locator('[data-settings-section="agent"]').screenshot({ path: path.join(agentArtifacts, "candidate-order-mobile.png") });
    assert.ok(await page.locator(".settings-agent-candidates").evaluate(el => el.scrollWidth <= el.clientWidth + 1), "candidate rows stay inside the mobile card");
    assert.ok(await page.locator(".settings-agent-model-list").evaluate(el => el.scrollWidth <= el.clientWidth + 1), "candidate rows stay inside the mobile list");
    assert.equal(await page.locator(".settings-agent-order-actions").first().evaluate(el => el.getBoundingClientRect().height < 30), true, "order controls stay on the same line as the row");
    await page.setViewportSize({ width: 1440, height: 1100 });
    await candidateRow("internal-uuid").locator('[data-agent-candidate-move="up"]').click();
    assert.equal(await candidateRow("internal-uuid").locator(".settings-agent-order").innerText(), "1");
    assert.equal(await candidateRow("second").locator(".settings-agent-order").innerText(), "2");
    assert.equal(await candidateRow("internal-uuid").locator('[data-agent-candidate-move="up"]').isDisabled(), true);
    await page.locator("[data-agent-save]").click();
    await page.waitForFunction(() => window.requests.some(item => item.pathname === "/api/providers/agent-settings" && item.body?.candidates?.length === 2));
    const orderedSave = [...await page.evaluate(() => window.requests)].reverse().find(item => item.pathname === "/api/providers/agent-settings" && item.body?.candidates?.length === 2);
    assert.deepEqual(orderedSave.body.candidates, [
      { providerId: "internal-uuid", modelId: "gpt-5.5" },
      { providerId: "second", modelId: "gpt-5.5" },
    ], "the stored candidate order is the takeover order shown in the list");
    // A candidate that disappears from the catalog is dropped; a still-valid primary is kept.
    await page.locator('[data-settings-nav="providers"]').click();
    await page.evaluate(() => { window.agentCatalogHideSecond = true; });
    await page.locator('[data-provider-form] button[type="submit"]').click();
    await page.locator('[data-settings-nav="agent"]').click();
    assert.equal(await page.locator("[data-agent-primary-toggle] strong").innerText(), "gpt-5.6-terra");
    await page.locator('[data-agent-primary-toggle]').click();
    assert.equal(await page.locator("[data-agent-primary-option]").count(), 2);
    assert.equal(await page.locator('[data-agent-primary-option][data-provider-id="second"]').count(), 0, "removed providers leave the primary list");
    assert.equal(await page.locator('[data-agent-candidate][data-provider-id="second"]').count(), 0, "removed providers leave the candidate list");
    assert.equal(await page.locator("[data-agent-primary-menu]").isVisible(), true);
    await page.locator('[data-settings-nav="providers"]').click();
    await page.locator('[name="protocol"]').selectOption("gemini");
    await page.locator('[data-provider-verify]').click();
    await page.locator('[data-provider-use-protocol="openai"]').waitFor();
    assert.equal(await page.locator('[name="protocol"]').inputValue(), "gemini");
    await page.locator('[data-provider-use-protocol="openai"]').click();
    await page.waitForFunction(() => document.querySelector('[data-provider-status]')?.textContent.includes("OpenAI 兼容同步可用"));
    assert.equal(await page.locator('[name="protocol"]').inputValue(), "openai");
    await page.locator('[name="baseUrl"]').fill("https://changed.test/v1");
    assert.ok(!(await page.locator('[data-provider-status]').innerText()).includes("可用"), "editing connection invalidates old result");
    await page.evaluate(() => { window.holdVerification = true; });
    await page.locator('[data-provider-verify]').click();
    await page.waitForFunction(() => typeof window.releaseVerification === "function");
    await page.locator('[data-provider-select="second"]').click();
    await page.evaluate(() => { window.releaseVerification(); window.holdVerification = false; });
    assert.equal(await page.locator('[name="id"]').inputValue(), "second", "stale verification cannot replace the selected provider");
    await page.locator('[data-provider-verify]').click();
    await page.waitForFunction(() => document.querySelector('[data-provider-status]')?.textContent.includes("可用"));
    await page.locator('[data-provider-model]').first().locator(".settings-model-details > summary").click();
    for (const theme of ["light", "dark"]) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      await page.locator('[data-settings-section="providers"]').screenshot({ path: path.join(artifacts, theme + ".png") });
      await page.locator(".ai-os-settings-sidebar").screenshot({ path: path.join(agentArtifacts, `sidebar-${theme}.png`) });
      const themedSearch = await page.locator(".settings-search input").evaluate((input) => {
        const style = getComputedStyle(input);
        return { background: style.backgroundColor, border: style.borderStyle, height: Math.round(input.getBoundingClientRect().height), pill: Math.round(input.closest(".settings-search").getBoundingClientRect().height) };
      });
      assert.match(themedSearch.background, /rgba?\(0, 0, 0, 0\)/, `the ${theme} search input stays transparent ${JSON.stringify(themedSearch)}`);
      assert.equal(themedSearch.border, "none", `the ${theme} search input keeps no border ${JSON.stringify(themedSearch)}`);
      assert.ok(themedSearch.height <= themedSearch.pill - 2, `the ${theme} search input stays inside its pill ${JSON.stringify(themedSearch)}`);
    }
    await page.setViewportSize({ width: 390, height: 1000 });
    assert.equal(await page.locator('[data-provider-status]').isVisible(), true, "verification stays readable on mobile");
    assert.equal(await page.locator('[data-model-name]').count(), 0);
    assert.equal(await page.locator('[data-model-id-input]').first().isVisible(), true, "read-only ID remains visible on mobile");
    await page.locator('[data-provider-form]').screenshot({ path: path.join(artifacts, "mobile.png") });
    assert.ok(await page.locator('[data-provider-form]').evaluate(el => el.scrollWidth <= el.clientWidth + 1), JSON.stringify(await page.locator('[data-provider-form]').evaluate(el => [...el.querySelectorAll('*')].filter(child => child.getBoundingClientRect().right > el.getBoundingClientRect().right + 1).map(child => child.className || child.tagName))));
    await page.locator('[data-provider-recommendations]').click();
    await page.locator('[data-recommended-apimart]').waitFor();
    await page.screenshot({ path: path.join(artifacts, "recommended-mobile.png") });
    assert.ok(await page.locator('.settings-provider-recommendation-dialog').evaluate(el => el.scrollWidth <= el.clientWidth + 1), "recommended dialog stays within the mobile viewport");
    assert.deepEqual(errors, []);
    console.log("API settings browser checks passed.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
