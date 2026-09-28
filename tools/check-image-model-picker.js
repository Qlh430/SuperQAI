"use strict";

const assert = require("node:assert/strict");
const picker = require("../image-model-picker");

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

const catalog = picker.normalizeCatalog([
  {
    id: "custom:p1:gpt",
    modelId: "gpt-image-2",
    displayName: "GPT Image 2 · APIB",
    providerId: "p1",
    providerName: "APIB",
    capabilities: ["image.generate", "image.edit"],
    resolutions: ["1", "2", "4"],
    state: "online",
    successRate: 99.5,
    latencyMs: 820,
  },
  {
    id: "custom:p2:gpt",
    modelId: "gpt-image-2",
    displayName: "GPT Image 2 · Backup",
    providerId: "p2",
    providerName: "Backup",
    capabilities: ["image.generate"],
    resolutions: ["1", "2"],
    state: "unstable",
    successRate: 68,
    latencyMs: 3100,
  },
  {
    id: "custom:p3:gemini",
    modelId: "gemini-3.1-flash-image-preview",
    displayName: "Nano Banana 2 · Google Relay",
    providerId: "p3",
    providerName: "Google Relay",
    capabilities: ["image.generate"],
    resolutions: ["1", "2", "4"],
    state: "unknown",
  },
  {
    id: "chat-only",
    modelId: "gpt-5.5",
    displayName: "GPT 5.5 · APIB",
    providerId: "p1",
    providerName: "APIB",
    capabilities: ["llm.chat"],
  },
]);

assert.equal(catalog.length, 3, "non-image models must be hidden");
assert.equal(catalog[0].primaryName, "gpt-image-2");
assert.equal(catalog[0].providerName, "APIB");
assert.deepEqual(catalog[0].badges, ["文生图", "图片编辑", "1K/2K/4K"]);
assert.equal(catalog[0].health.label, "正常");
assert.equal(catalog[1].health.label, "不稳定");

const migratedCatalog = [
  { id: "custom:first:canonical", legacyIds: ["custom:first:legacy", "old-model"] },
  { id: "custom:second:canonical", legacyIds: ["custom:second:legacy"] },
  { id: "old-model" },
];
assert.equal(picker.resolveModelId(migratedCatalog, "custom:second:legacy"), "custom:second:canonical");
assert.equal(picker.resolveModelId(migratedCatalog, "old-model"), "old-model", "exact IDs win over aliases");
assert.equal(picker.resolveModelId(migratedCatalog, "missing-model"), "missing-model", "unknown selections are not silently reassigned");
assert.deepEqual(picker.modelsForFilter(migratedCatalog, "favorites", { favorites: ["custom:second:legacy"] }).map(model => model.id), ["custom:second:canonical"]);
assert.deepEqual(picker.modelsForFilter(migratedCatalog, "recent", { recent: ["custom:second:legacy", "custom:second:canonical"] }).map(model => model.id), ["custom:second:canonical"]);
const legacyStorage = memoryStorage();
picker.toggleFavorite(legacyStorage, "legacy", "custom:second:legacy");
picker.recordRecent(legacyStorage, "legacy", "custom:second:legacy");
assert.deepEqual(picker.readPreferences(legacyStorage, "legacy", migratedCatalog), {
  favorites: ["custom:second:canonical"], recent: ["custom:second:canonical"],
});
assert.deepEqual(picker.toggleFavorite(legacyStorage, "legacy", "custom:second:canonical", migratedCatalog), []);

const groups = picker.groupModels(catalog);
assert.deepEqual(groups.map((group) => group.providerName), ["APIB", "Google Relay", "Backup"]);
assert.deepEqual(groups[0].models.map((model) => model.id), ["custom:p1:gpt"]);
assert.deepEqual(picker.filterModels(catalog, "banana google").map((model) => model.id), ["custom:p3:gemini"]);
assert.deepEqual(picker.filterModels(catalog, "GPT IMAGE 2").map((model) => model.id), ["custom:p1:gpt", "custom:p2:gpt"]);

const storage = memoryStorage();
assert.deepEqual(picker.readPreferences(storage, "alice"), { favorites: [], recent: [] });
assert.deepEqual(picker.toggleFavorite(storage, "alice", "custom:p2:gpt"), ["custom:p2:gpt"]);
assert.deepEqual(picker.toggleFavorite(storage, "alice", "custom:p1:gpt"), ["custom:p2:gpt", "custom:p1:gpt"]);
assert.deepEqual(picker.toggleFavorite(storage, "alice", "custom:p2:gpt"), ["custom:p1:gpt"]);
picker.recordRecent(storage, "alice", "one");
picker.recordRecent(storage, "alice", "two");
picker.recordRecent(storage, "alice", "three");
picker.recordRecent(storage, "alice", "four");
picker.recordRecent(storage, "alice", "five");
assert.deepEqual(picker.recordRecent(storage, "alice", "six"), ["six", "five", "four", "three", "two"]);
assert.deepEqual(picker.readPreferences(storage, "bob"), { favorites: [], recent: [] }, "preferences must be account scoped");

const visible = picker.modelsForFilter(catalog, "favorites", picker.readPreferences(storage, "alice"));
assert.deepEqual(visible.map((model) => model.id), ["custom:p1:gpt"]);
assert.equal(picker.getModelPresentation(catalog[0]).secondaryText, "APIB · 99.5% · 820 ms");
const untestedPresentation = picker.getModelPresentation(picker.normalizeCatalog([{
  id: "untested-image",
  providerName: "Untested API",
  capabilities: ["image.generate"],
  successRate: null,
  latencyMs: 450,
}])[0]);
assert.equal(untestedPresentation.secondaryText, "Untested API · 450 ms", "missing usage history must not be displayed as 0% success");

console.log("Image model picker checks passed.");
