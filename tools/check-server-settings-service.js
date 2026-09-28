"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createServerSettingsService } = require("../server-settings-service");

const files = new Map();
const memoryFs = {
  existsSync: (file) => files.has(file),
  readFileSync: (file) => files.get(file),
  writeFileSync: (file, value) => files.set(file, value),
};

const service = createServerSettingsService({
  crypto: { randomUUID: () => "generated-id" },
  fs: memoryFs,
  settingsFile: "settings.json",
  dataDir: "data",
  getSystemProviders: () => [{
    id: "system-image",
    name: "System image",
    baseUrl: "https://api.example.test/v1",
    apiKey: "system-key",
    models: [{ id: "system-model" }],
  }],
  normalizeProviderBaseUrl: (value) => String(value || "").replace(/\/+$/, ""),
  normalizeRouteMode: (value, baseUrl) => value || (baseUrl ? "auto" : ""),
  normalizeImageResolutions: (value, modelId) => modelId === "midjourney" ? [] : ["1"],
  normalizeImagePlatform: (value, modelId) => modelId === "midjourney" ? "midjourney" : String(value || "openai"),
  normalizeImageModelFamily: (value, modelId) => modelId === "midjourney" ? "midjourney" : String(value || ""),
  normalizeModelPrice: (value) => String(value || ""),
  normalizeAgentRouting: (value = {}) => ({ mode: "balanced", ...value }),
});

const defaults = service.getDefaultSettings();
assert.equal(defaults.storage.dataDirectory, "data");
assert.equal(defaults.agentRouting.mode, "balanced");

const normalized = service.normalizeSettings({
  providers: [{
    id: "custom",
    name: "Custom",
    baseUrl: "https://custom.example.test/v1/",
    apiKey: "new-secret",
    models: [{
      id: "midjourney",
      capabilities: ["generation", "edit"],
      resolutions: ["1", "2"],
      platform: "midjourney",
      family: "midjourney",
    }],
  }],
  storage: { intervalMinutes: 500 },
});
assert.equal(normalized.providers[0].apiKey, "new-secret");
assert.deepEqual(normalized.providers[0].models[0].resolutions, []);
assert.equal(normalized.providers[0].models[0].platform, "midjourney");
assert.equal(normalized.storage.intervalMinutes, 120);

const preserved = service.normalizeSettings({
  providers: [{
    id: "custom",
    apiKey: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
  }],
}, normalized);
assert.equal(preserved.providers[0].apiKey, "new-secret");

const response = service.getSettingsResponse({
  providers: [{
    id: "custom",
    name: "Custom",
    apiKey: "new-secret",
    importedSystem: false,
    models: [],
  }],
}, { instanceId: "catalog-instance", revision: 42 });
assert.equal(response.providers[0].id, "system-image");
assert.equal(response.providers[1].apiKey, "");
assert.equal(response.providers[1].apiKeyMasked, "new-\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022cret");
assert.equal(response.imageModelsInstanceId, "catalog-instance");
assert.equal(response.imageModelsRevision, 42);

service.writeSettingsFile(defaults);
assert.equal(JSON.parse(files.get("settings.json")).storage.dataDirectory, "data");
assert.equal(service.readSettingsFile().storage.dataDirectory, "data");

const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
for (const functionName of [
  "getDefaultSettings",
  "normalizeSettings",
  "sanitizeSettings",
  "getSettingsResponse",
  "readSettingsFile",
  "writeSettingsFile",
]) {
  assert.doesNotMatch(
    serverSource,
    new RegExp(`function\\s+${functionName}\\s*\\(`),
    `${functionName} must live in server-settings-service.js`,
  );
}

console.log("Server settings service checks passed.");
