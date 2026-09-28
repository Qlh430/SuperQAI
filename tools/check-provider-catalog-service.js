"use strict";

const assert = require("node:assert/strict");

const {
  createProviderCatalogService,
  normalizeModelPrice,
} = require("../provider-catalog-service");
const { createImageModelRules } = require("../image-model-rules");

function catalogModel(overrides = {}) {
  return {
    id: "image-main",
    displayName: "image-main",
    providerId: "provider-a",
    providerName: "Provider A",
    providerProtocol: "openai",
    providerHost: "api.example.test",
    modelProtocol: "openai-images",
    capabilities: ["image.generate", "image.edit"],
    providerSortOrder: 0,
    modelSortOrder: 0,
    resolutions: [],
    platform: "openai",
    family: "gpt-image-2",
    price: "￥0.05",
    parameterOverrides: { quality: "high" },
    legacyModelIds: ["old-image-main"],
    ...overrides,
  };
}

const storedModels = [
  catalogModel(),
  catalogModel({
    id: "jimeng-5.0Pro",
    providerId: "provider-jimeng",
    providerName: "Dreamina CLI",
    providerProtocol: "cli:jimeng",
    providerHost: "jimeng",
    modelProtocol: "cli:jimeng",
    capabilities: ["image.generate", "image.edit"],
    providerSortOrder: 1,
    platform: "jimeng",
    family: "",
    price: "",
  }),
  catalogModel({
    id: "seedance2.5",
    providerId: "provider-jimeng",
    providerName: "Dreamina CLI",
    providerProtocol: "cli:jimeng",
    providerHost: "jimeng",
    modelProtocol: "cli:jimeng",
    capabilities: ["video.generate"],
    providerSortOrder: 0,
    platform: "jimeng",
    family: "",
    resolutions: [],
    ratios: [],
  }),
  catalogModel({
    id: "image-main",
    providerId: "provider-b",
    providerName: "Provider B",
    providerProtocol: "openai",
    providerHost: "b.example.test",
    modelProtocol: "openai-images",
    providerSortOrder: 2,
    platform: "google",
    family: "gemini-3.1-flash-image",
    legacyModelIds: [],
  }),
];

const health = new Map([
  ["provider-a", { state: "online", rank: 0, successRate: 99, latencyMs: 120, lastUsedAt: "2026-09-24T01:00:00.000Z" }],
  ["provider-jimeng", { state: "slow", rank: 2, successRate: 80, latencyMs: 4500, lastUsedAt: "2026-09-24T00:30:00.000Z" }],
  ["provider-b", { state: "unknown", rank: 3, successRate: null, latencyMs: null, lastUsedAt: "" }],
]);

const calls = [];
const imageCatalogRules = createImageModelRules({ midjourneyImageModelAlias: "midjourney" });
const service = createProviderCatalogService({
  providerStore: {
    publicModelsForCapability(capability) {
      calls.push(capability);
      return storedModels.filter((model) => model.capabilities.includes(capability));
    },
  },
  telemetryService: {
    getHealthSnapshot: () => health,
  },
  imageCatalog: imageCatalogRules,
});

const imageCatalog = service.getPublicProviderModelCatalog("image.generate");
assert.equal(imageCatalog.defaultModel, `custom:provider-a:${Buffer.from("image-main").toString("base64url")}`);
assert.equal(imageCatalog.models.length, 3);
assert.equal(imageCatalog.models[0].providerId, "provider-a");
assert.deepEqual(imageCatalog.models[0].resolutions, ["1", "2", "4"]);
assert.equal(imageCatalog.models[0].price, "0.05");
assert.deepEqual(imageCatalog.models[0].parameterOverrides, { quality: "high" });
assert.ok(imageCatalog.models[0].legacyIds.includes("old-image-main"));
assert.ok(imageCatalog.models[0].legacyIds.includes(`custom:provider-a:${Buffer.from("old-image-main").toString("base64url")}`));
assert.deepEqual(imageCatalog.models.find((model) => model.providerId === "provider-jimeng").resolutions, ["1", "2", "4"]);
assert.equal(
  imageCatalog.models.find((model) => model.providerId === "provider-b").id,
  `custom:provider-b:${Buffer.from("image-main").toString("base64url")}`,
  "duplicate model ids must remain provider-scoped",
);

const videoCatalog = service.getPublicProviderModelCatalog("video.generate");
assert.equal(videoCatalog.models[0].providerProtocol, "cli:jimeng");
assert.deepEqual(videoCatalog.models[0].resolutions, ["480p", "720p", "1080p"]);
assert.deepEqual(videoCatalog.models[0].ratios, ["1:1", "3:4", "16:9", "4:3", "9:16", "21:9"]);
assert.deepEqual(videoCatalog.models[0].duration, { min: 4, max: 30 });

const found = service.findPublicProviderCatalogModel(
  imageCatalog.models,
  "old-image-main",
  "provider-a",
);
assert.equal(found.providerId, "provider-a");
assert.equal(
  service.findPublicProviderCatalogModel(imageCatalog.models, "old-image-main", "provider-b"),
  null,
  "legacy ids must never cross provider boundaries",
);
assert.equal(calls.filter((capability) => capability === "image.generate").length, 1);

assert.equal(normalizeModelPrice("￥0.05"), "0.05");
assert.equal(normalizeModelPrice("$0.006"), "$0.006");
assert.equal(normalizeModelPrice("0.03~0.06"), "0.03~0.06");
assert.equal(normalizeModelPrice("随便写"), "");
assert.equal(service.providerExecutionHttpStatus({ code: "PINNED_MODEL_UNAVAILABLE" }), 400);
assert.equal(service.providerExecutionHttpStatus({ code: "UPSTREAM_TIMEOUT" }), 504);
assert.equal(service.providerExecutionHttpStatus({ code: "UPSTREAM_FAILURE" }), 502);

const lockedService = createProviderCatalogService({
  providerStore: { publicModelsForCapability: () => [] },
  telemetryService: { getHealthSnapshot: () => new Map() },
  getProviderSubsystemError: () => ({ code: "PROVIDER_VAULT_KEY_MISSING" }),
  imageCatalog: imageCatalogRules,
});
assert.throws(
  () => lockedService.getPublicProviderModelCatalog("image.generate"),
  (error) => error.code === "PROVIDER_VAULT_KEY_MISSING",
);

console.log("Provider catalog service checks passed.");
