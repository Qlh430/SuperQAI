"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const settings = require("../system-settings-ui");
const display = require("../ai-os-display");

assert.deepEqual(settings.sectionIdsForRole("user"), ["appearance", "account", "system"]);
assert.deepEqual(settings.sectionIdsForRole("superadmin"), ["appearance", "account", "system", "host", "providers", "agent", "skills", "comfyui", "models", "protocols"]);
assert.equal(settings.testRouteForCapabilities(["llm.chat", "image.generate"]), "/api/providers/test");
assert.equal(settings.testRouteForCapabilities(["image.generate"]), "/api/providers/test-image");
assert.equal(settings.testRouteForCapabilities(["video.generate"]), "/api/providers/test-video");
assert.equal(settings.testRouteForCapabilities(["audio.generate"]), "/api/providers/test-audio");
assert.equal(settings.testRouteForCapabilities(["llm.chat.vision"]), "/api/providers/test-vision");
assert.equal(settings.testRouteForCapabilities(["image.edit"]), "");

const apimartCatalog = {
  platformProtocols: [{ id: "apimart", runtimeProtocol: "apimart" }],
  modelProtocols: [
    { id: "openai-images", runtimeProtocol: "openai-images", compatiblePlatformProtocols: ["apimart"] },
    { id: "midjourney", runtimeProtocol: "midjourney", compatiblePlatformProtocols: ["apimart"] },
  ],
};
assert.equal(typeof settings.normalizeProviderModels, "function");
const normalizedApimart = settings.normalizeProviderModels(
  { protocol: "apimart", models: [{ id: "gpt-image-2-apimart", protocol: "legacy-image" }] },
  [{ id: "gpt-image-2-apimart", protocol: "openai-images", capabilities: ["image.generate", "image.edit"] }],
  apimartCatalog,
);
assert.deepEqual(normalizedApimart.models.map(model => model.protocol), ["openai-images"]);
assert.deepEqual(normalizedApimart.removed, []);
const protocolSwitchCatalog = {
  platformProtocols: [{ id: "openai", runtimeProtocol: "openai" }],
  modelProtocols: [
    { id: "openai", runtimeProtocol: "openai", compatiblePlatformProtocols: ["openai"] },
    { id: "gemini", runtimeProtocol: "gemini", compatiblePlatformProtocols: ["openai"] },
  ],
};
const normalizedAfterProtocolSwitch = settings.normalizeProviderModels(
  { protocol: "openai", models: [{ id: "claude-sonnet-4", protocol: "gemini", capabilities: ["llm.chat"] }] },
  [{ id: "claude-sonnet-4", protocol: "openai", capabilities: ["llm.chat"] }],
  protocolSwitchCatalog,
);
assert.equal(
  normalizedAfterProtocolSwitch.models[0]?.protocol,
  "openai",
  "when inferred protocol changes, the inferred profile must replace a stale compatible protocol",
);
assert.equal(typeof settings.selectableModelProfiles, "function");
assert.deepEqual(
  settings.selectableModelProfiles({
    ...apimartCatalog,
    modelProtocols: [
      ...apimartCatalog.modelProtocols,
      { id: "apimart", runtimeProtocol: "apimart", modelVisible: false, compatiblePlatformProtocols: ["apimart"] },
    ],
  }, "apimart", "openai-images").map(profile => profile.id),
  ["openai-images", "midjourney"],
  "a retained legacy profile used by another model must not leak into this model's selector",
);
assert.deepEqual(
  settings.selectableModelProfiles({
    ...apimartCatalog,
    modelProtocols: [
      ...apimartCatalog.modelProtocols,
      { id: "apimart", runtimeProtocol: "apimart", modelVisible: false, compatiblePlatformProtocols: ["apimart"] },
    ],
  }, "apimart", "apimart").map(profile => profile.id),
  ["openai-images", "midjourney", "apimart"],
  "the currently selected legacy profile remains renderable until migration repairs it",
);

assert.equal(typeof settings.modelDiscoverySelectionState, "function");
assert.deepEqual(
  settings.modelDiscoverySelectionState(
    [{ id: "saved-a", displayName: "A" }, { id: "new-b", displayName: "B" }, { id: "saved-c", displayName: "C" }],
    [{ id: "saved-a" }, { id: "saved-c" }],
  ),
  [
    { id: "saved-a", selected: true },
    { id: "new-b", selected: false },
    { id: "saved-c", selected: true },
  ],
);
assert.equal(typeof settings.selectNewDiscoveredModels, "function");
assert.deepEqual(
  settings.selectNewDiscoveredModels(
    [{ id: "saved-a" }, { id: "new-a", displayName: "A1" }, { id: "new-a", displayName: "A2" }, { id: "new-b" }],
    ["saved-a", "new-a", "new-b"],
    [{ id: "saved-a" }],
  ),
  [
    { id: "new-a", displayName: "A1" },
    { id: "new-b" },
  ],
);
// A Dreamina image model renamed from its bare version to "jimeng-<version>" is
// the same local model, so the saved row is neither offered again nor duplicated.
assert.deepEqual(
  settings.modelDiscoverySelectionState(
    [{ id: "jimeng-5.0", displayName: "即梦 5.0" }, { id: "jimeng-3.1" }],
    [{ id: "5.0" }],
  ),
  [
    { id: "jimeng-5.0", selected: true },
    { id: "jimeng-3.1", selected: false },
  ],
);
assert.deepEqual(
  settings.selectNewDiscoveredModels(
    [{ id: "jimeng-5.0" }, { id: "jimeng-4.7" }],
    ["jimeng-5.0", "jimeng-4.7"],
    [{ id: "5.0" }],
  ),
  [{ id: "jimeng-4.7" }],
);
assert.equal(typeof settings.uniqueDiscoveredModels, "function");
const duplicateDiscovery = [{ id: "dup-a", displayName: "First" }, { id: "dup-a", displayName: "Second" }, { id: "unique-b" }];
assert.deepEqual(settings.uniqueDiscoveredModels(duplicateDiscovery), [duplicateDiscovery[0], duplicateDiscovery[2]]);
assert.equal(typeof settings.createRecommendedApimartProvider, "function");
assert.equal(settings.APIMART_RECOMMENDED_PROVIDER.baseUrl, "https://apib.ai");
assert.equal(settings.APIMART_RECOMMENDED_PROVIDER.protocol, "openai");
const recommendedApimart = settings.createRecommendedApimartProvider(null, "provider-3", "test-apimart-key");
assert.deepEqual(
  {
    id: recommendedApimart.id,
    name: recommendedApimart.name,
    baseUrl: recommendedApimart.baseUrl,
    protocol: recommendedApimart.protocol,
    networkMode: recommendedApimart.metadata.networkMode,
    recommendedPlatform: recommendedApimart.metadata.recommendedPlatform,
    apiKey: recommendedApimart.apiKey,
  },
  {
    id: "provider-3",
    name: "APIMart",
    baseUrl: "https://apib.ai",
    protocol: "openai",
    networkMode: "direct",
    recommendedPlatform: "apimart",
    apiKey: "test-apimart-key",
  },
);
const existingApimart = {
  id: "existing-apimart",
  name: "我的 APIMart",
  baseUrl: "https://api.apimart.ai/v1",
  protocol: "openai",
  enabled: false,
  models: [{ id: "gpt-image-2", protocol: "openai-images" }],
  metadata: { networkMode: "proxy" },
};
const updatedApimart = settings.createRecommendedApimartProvider(existingApimart, "ignored", "new-key");
assert.equal(updatedApimart.id, "existing-apimart");
assert.equal(updatedApimart.name, "我的 APIMart");
assert.equal(updatedApimart.baseUrl, "https://api.apimart.ai/v1");
assert.equal(updatedApimart.metadata.networkMode, "direct");
assert.equal(updatedApimart.apiKey, "new-key");
assert.deepEqual(updatedApimart.models, existingApimart.models);

assert.deepEqual(settings.normalizePreferences({
  appearance: { theme: "dark", scale: 1.25, animations: "reduced", ignored: "no" },
  providers: [{ apiKey: "must-not-survive" }],
}), {
  appearance: { theme: "dark", scale: 1.25, animations: "reduced" },
});
assert.strictEqual(settings.normalizePreferences, display.normalizePreferences);
assert.strictEqual(settings.applyPreferences, display.applyPreferences);

const fakeRoot = { dataset: {}, style: { setProperty(name, value) { this[name] = value; } } };
settings.applyPreferences({
  appearance: { theme: "dark", scale: 1.5, animations: "reduced" },
}, fakeRoot, { matches: false });
assert.equal(fakeRoot.dataset.theme, "dark");
assert.equal(fakeRoot.dataset.themeMode, "dark");
assert.equal(fakeRoot.dataset.animations, "reduced");

const ui = read("system-settings-ui.js");
assert.match(ui, /data-settings-section="agent"/);
assert.match(ui, /\/api\/providers\/agent-settings/);
assert.match(ui, /data-agent-primary/);
assert.match(ui, /data-agent-primary-toggle/);
assert.match(ui, /data-agent-primary-option/);
assert.match(ui, /data-agent-primary-menu/);
assert.doesNotMatch(ui, /<select data-agent-primary/);
assert.doesNotMatch(ui, /parseAgentSelectionValue\(event\.target\.value\)/);
assert.match(ui, /reloadAgentModels/);
assert.match(ui, /data-agent-candidate/);
assert.match(ui, /对话、识图和工具调用/);
assert.match(ui, /modelDiscoverySelectionState/);
assert.match(ui, /data-model-discovery-add[^>]*disabled/);
assert.match(ui, /settings-discovered-model-status/);
// Dreamina's catalog is offered as a checklist too, so pulling models never
// silently re-selects everything on the site.
assert.match(ui, /platformProtocol: "cli:jimeng"/);
assert.match(ui, /hideProtocol: true/);
assert.match(ui, /kindLabels\[discoveryCategory\(model\)\]/);
assert.match(ui, /state\.modelDiscovery = \{ models: discovered/);
// The session is reused from the official client, which the panel states plainly,
// and a signed-in account can still switch accounts through the CLI's relogin.
assert.match(ui, /data-jimeng-origin/);
assert.match(ui, /cli\.state === "login-running" \? "打开授权页" : cli\.signedIn \? "切换账号" : "登录账号"/);
assert.match(ui, /runCliAction\(state\.jimengCli\?\.signedIn \? "relogin" : "login"\)/);
assert.match(ui, /LOGIN_BLOCKED_STATES/);
// A pending approval keeps the button usable: a closed browser must be recoverable
// without waiting for the device code to expire.
assert.doesNotMatch(ui, /LOGIN_BLOCKED_STATES = new Set\(\[[^\]]*"login-running"/);
assert.match(ui, /openJimengAuthUrl\(state\.jimengCli\.authUrl\)/);
assert.match(ui, /state\.jimengCli\?\.state === "login-running" \? "login-status" : "status"/);
assert.match(ui, /models:\s*inferred/);
assert.match(ui, /notify\(`已读取 \$\{inferred\.length\} 个模型/);
assert.match(ui, /data-settings-section/);
assert.match(ui, /role\s*===\s*["']superadmin["']/);
assert.match(ui, /\/api\/preferences/);
assert.match(ui, /\/api\/providers/);
assert.match(ui, /\/api\/protocols/);
assert.match(ui, /\/api\/providers\/verify-protocol/);
assert.match(ui, /\/api\/providers\/models/);
assert.match(ui, /\/api\/providers\/reorder/);
assert.match(ui, /\/api\/providers\/models\/reorder/);
assert.match(ui, /data-model-test/);
assert.match(ui, /\/api\/providers\/test/);
assert.match(ui, /apiKeyMasked/);
assert.doesNotMatch(ui, /站点协议/);
assert.match(ui, /protocolOptions\(provider\.protocol, "platform"\)/);
assert.match(ui, /protocolOptions\(model\.protocol \|\| model\.modelProtocol, "model", selectedProvider\(\)\)/);
assert.doesNotMatch(ui, /data-model-parameter-overrides|模型参数覆盖 JSON/);
assert.match(ui, /modelParameters\.markup\(model\)/);
assert.match(ui, /modelParameters\.read/);
assert.doesNotMatch(ui, /\/api\/settings\/providers\/key/);
assert.doesNotMatch(ui, /successRate|circuit|half-open|monitoring/i);
assert.doesNotMatch(ui, /data-settings-canvas-theme|preferences\.canvas/);
assert.match(ui, /class="settings-scale-preview"/);
assert.match(ui, /--scale-preview:/);
assert.match(ui, /data-provider-recommendations/);
assert.match(ui, /data-recommended-apimart/);
assert.match(ui, /https:\/\/apimart\.ai\/zh\/register/);
assert.match(ui, /class="settings-theme-grid" role="radiogroup" aria-label="界面主题"/);
assert.match(ui, /data-settings-theme="\$\{theme\}"[^>]*role="radio"[^>]*aria-checked="\$\{preference\.appearance\.theme === theme\}"/);
assert.match(ui, /class="settings-scale-grid" role="radiogroup" aria-label="界面缩放"/);
assert.match(ui, /data-settings-scale="\$\{scale\}"[^>]*role="radio"[^>]*aria-checked="\$\{preference\.appearance\.scale === scale\}"/);
for (const label of ["更多空间", "标准", "较大文字", "大文字", "更大文字"]) assert.match(ui, new RegExp(label));
for (const percentage of ["75%", "100%", "125%", "150%", "175%"]) assert.match(ui, new RegExp(percentage));

const html = read("index.html");
assert.match(html, /model-parameter-controls\.js[\s\S]*model-test-ui\.js[\s\S]*system-settings-ui\.js/);
assert.match(html, /system-settings\.css/);
assert.match(html, /id="aiOsSystemSettingsRoot"/);
assert.match(html, /ai-os-display\.js[\s\S]*system-settings-ui\.js/);
assert.match(html, /system-settings-ui\.js[\s\S]*desktop-shell\.js/);
assert.match(html, /protocol-center-ui\.js[\s\S]*system-settings-ui\.js/);

const protocolUi = require("../protocol-center-ui");
const legacy = protocolUi.normalizeCatalog({ protocols: [{ id: "openai", label: "OpenAI", capabilities: ["llm.chat"] }] });
assert.equal(legacy.platformProtocols[0].scope, "platform");
assert.equal(legacy.modelProtocols[0].scope, "model");
assert.equal(legacy.modelProtocols[0].id, "openai");
const split = protocolUi.normalizeCatalog({ protocols: [{ id: "old" }], platformProtocols: [{ id: "custom-site", scope: "platform" }], modelProtocols: [{ id: "custom-model", scope: "model" }] });
assert.deepEqual(split.platformProtocols.map(item => item.id), ["custom-site"]);
assert.deepEqual(split.modelProtocols.map(item => item.id), ["custom-model"]);
assert.match(protocolUi.protocolOptions(split, "custom-site", "platform"), /custom-site/);
assert.doesNotMatch(protocolUi.protocolOptions(split, "", "model"), /custom-site/);
assert.match(protocolUi.protocolOptions(split, "missing-protocol", "model"), /value="missing-protocol" selected/);
assert.match(protocolUi.protocolOptions(split, '<script>', "model"), /&lt;script&gt;/);
assert.equal(protocolUi.normalizeCatalog({}).capabilities.length, 7);
const compatibleCatalog = protocolUi.normalizeCatalog({
  platformProtocols: [
    { id: "openai", runtimeProtocol: "openai" },
    { id: "gemini", runtimeProtocol: "gemini" },
  ],
  modelProtocols: [
    { id: "openai", runtimeProtocol: "openai", compatiblePlatformProtocols: ["openai"] },
    { id: "openai-images", runtimeProtocol: "openai-images", compatiblePlatformProtocols: ["openai"] },
    { id: "gemini", runtimeProtocol: "gemini", compatiblePlatformProtocols: ["gemini"] },
  ],
});
assert.deepEqual(
  protocolUi.modelProfilesForPlatform(compatibleCatalog, "openai").map(item => item.id),
  ["openai", "openai-images"],
);
const apimartHostOnlyCatalog = protocolUi.normalizeCatalog({
  platformProtocols: [{ id: "openai", runtimeProtocol: "openai" }],
  modelProtocols: [
    { id: "openai", runtimeProtocol: "openai", compatiblePlatformProtocols: ["openai"] },
    { id: "midjourney", runtimeProtocol: "midjourney", compatiblePlatformProtocols: ["openai"], requiresApimartHostForOpenAi: true },
    { id: "gemini", runtimeProtocol: "gemini", compatiblePlatformProtocols: ["gemini", "openai"], requiresApimartHostForOpenAi: true },
  ],
});
assert.deepEqual(
  settings.selectableModelProfiles(apimartHostOnlyCatalog, { protocol: "openai", baseUrl: "https://relay.example.test/v1" }).map(profile => profile.id),
  ["openai"],
  "ordinary OpenAI providers must not offer APIMart/APIB-only model profiles",
);
assert.deepEqual(
  settings.selectableModelProfiles(apimartHostOnlyCatalog, { protocol: "openai", baseUrl: "https://api.apimart.ai/v1" }).map(profile => profile.id),
  ["openai", "midjourney", "gemini"],
  "APIMart hosts retain their supported asynchronous model profiles",
);
assert.deepEqual(
  settings.selectableModelProfiles(apimartHostOnlyCatalog, { protocol: "openai", baseUrl: "https://gateway.apib.ai/v1" }).map(profile => profile.id),
  ["openai", "midjourney", "gemini"],
  "APIB hosts retain their supported asynchronous model profiles",
);
assert.deepEqual(
  settings.selectableModelProfiles(apimartHostOnlyCatalog, { protocol: "openai", baseUrl: "https://relay.example.test/v1" }, "midjourney").map(profile => profile.id),
  ["openai", "midjourney"],
  "an existing APIMart-only selection remains visible until the user changes it",
);

const css = read("system-settings.css");
assert.match(ui, /settings-model-discovery-add settings-primary-button/);
assert.match(ui, /settings-model-discovery-cancel settings-secondary-button/);
assert.match(css, /\.settings-model-discovery-add/);
assert.match(css, /\.settings-model-discovery-cancel/);
assert.match(css, /\.settings-jimeng-origin/);
assert.match(css, /html\[data-theme="dark"\]\s+\.settings-discovered-model-status\s*\{[^}]*color:\s*#91c4ff/);
assert.match(css, /\.ai-os-settings-layout/);
assert.match(css, /\.settings-theme-preview/);
assert.match(css, /html\[data-theme="dark"\]/);
assert.match(css, /@media\s*\(max-width:/);
assert.match(css, /prefers-reduced-motion|data-animations="reduced"/);
assert.doesNotMatch(css, /^:root\s*\{[\s\S]*--settings-sidebar:/m);
assert.match(css, /\.ai-os-settings-layout\s*\{[\s\S]*--ai-settings-sidebar-bg:/);
assert.match(css, /\.settings-scale-sample-dots/);
assert.match(css, /\.settings-scale-sample-lines/);
assert.doesNotMatch(css, /\.settings-scale-sample\s*\{[^}]*transform:\s*scale\(/);
assert.match(css, /\.settings-scale-grid button:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--ai-settings-blue\)/);
assert.match(css, /\.settings-agent-primary-trigger\s*\{/);
assert.match(css, /\.settings-agent-primary-menu\s*\{[^}]*position:\s*absolute/);
assert.match(css, /\.settings-agent-primary-menu button\[aria-selected="true"\]\s*\{/);
assert.match(css, /html\[data-theme="dark"\]\s+\.settings-agent-primary-menu\s*\{/);
assert.match(css, /\.settings-toggle-row\s*>\s*input:focus-visible\s*\+\s*i\s*\{[^}]*outline:/s, "reduced-motion switch exposes a visible keyboard focus ring");
assert.match(css, /@media \(max-width: 620px\)\s*\{[\s\S]*?\.settings-scale-grid\s*\{\s*grid-template-columns:\s*repeat\(2,\s*1fr\)/);

const server = read("server.js");
assert.match(server, /createPreferencesHttpApi/);
assert.doesNotMatch(server, /async function handlePreferences/);

const preferencesApi = read("preferences-http-api.js");
assert.match(preferencesApi, /requestPath\s*===\s*["']\/api\/preferences["']/);
assert.match(preferencesApi, /systemDb\.getUserPreferences\(userId\)/);
assert.match(preferencesApi, /systemDb\.replaceUserPreferences\(userId/);
assert.match(preferencesApi, /invalid_preference_field/);

const shell = read("desktop-shell.js");
assert.match(shell, /AiOsSystemSettings\.createSettingsApp/);
assert.match(shell, /settingsApp\.load/);

execFileSync(process.execPath, [path.join(__dirname, "check-system-settings-update-ui.js")], { stdio: "inherit" });
console.log("System settings UI checks passed.");
