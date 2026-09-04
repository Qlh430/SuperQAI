const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const routing = require("../image-model-routing");

const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const clientSource = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const htmlSource = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
assert.match(serverSource, /require\("\.\/image-model-routing"\)/);
assert.match(serverSource, /function getImageModelCandidates\(/);
assert.match(serverSource, /sendProviderModelCatalog\(res,\s*"image\.generate",\s*\{ image: true \}\)/);
assert.match(serverSource, /providerStore\.publicModelsForCapability\(capability\)/);
assert.match(serverSource, /defaultModel:\s*models\[0\]\?\.id\s*\|\|\s*""/);
assert.match(serverSource, /networkMode:\s*normalizeRouteMode\(provider\.networkMode\s*\|\|\s*old\.networkMode,\s*baseUrl\)/);
assert.match(clientSource, /let canvasImageModelCandidates\s*=\s*\[\]/);
assert.match(clientSource, /canvasImageModelCandidates\s*=\s*Array\.isArray\(data\.candidates\)/);
assert.match(clientSource, /function resolveCanvasAgentImageModel\(/);
assert.match(clientSource, /CanvasImageModelRouting\.rankCandidates/);
assert.match(clientSource, /let canvasImageModelsLoadPromise\s*=\s*null/);
assert.match(clientSource, /preserveOnError/);
assert.match(clientSource, /ensureCanvasAgentImageModelCandidate/);
assert.match(clientSource, /data-provider-field="networkMode"/);
assert.match(clientSource, /自适应（推荐）/);
assert.ok(htmlSource.indexOf("image-model-routing.js") < htmlSource.indexOf("script.js"));

const providers = [
  {
    id: "online-provider",
    name: "在线接口",
    enabled: true,
    hasApiKey: true,
    baseUrl: "https://online.example/v1",
    networkMode: "proxy",
    apiKey: "must-not-leak",
    importedSystem: false,
    models: [
      { id: "image-main", capabilities: ["generation", "edit"] },
      { id: "text-only", capabilities: ["text"] },
    ],
  },
  {
    id: "offline-provider",
    name: "离线接口",
    enabled: true,
    hasApiKey: true,
    baseUrl: "",
    apiKey: "must-not-leak-either",
    importedSystem: false,
    models: [{ id: "image-backup", capabilities: ["generation"] }],
  },
];
const monitoring = {
  providers: {
    "online-provider": [{ state: "online", latencyMs: 800, checkedAt: "2026-08-24T03:00:00.000Z" }],
    "offline-provider": [{ state: "offline", latencyMs: 0, checkedAt: "2026-08-24T03:00:00.000Z" }],
  },
  usage: {
    "online-provider": [
      { kind: "image", model: "image-main", success: true, latencyMs: 1200, checkedAt: "2026-08-24T02:00:00.000Z" },
      { kind: "image", model: "image-main", success: false, errorCategory: "server", latencyMs: 500, checkedAt: "2026-08-24T02:30:00.000Z" },
    ],
  },
};

const result = routing.buildCandidateRecords(providers, monitoring, {
  makeClientId: (providerId, modelId) => `custom:${providerId}:${modelId}`,
});

assert.equal(result.length, 2);
assert.equal(result.some((item) => item.apiKey), false);
assert.equal(result.some((item) => JSON.stringify(item).includes("must-not-leak")), false);
assert.equal(result.find((item) => item.id === "custom:online-provider:image-main")?.state, "unknown");
assert.equal(result.find((item) => item.id === "custom:offline-provider:image-backup")?.state, "unknown");
assert.equal(result.find((item) => item.id === "custom:online-provider:image-main")?.hasBaseUrl, true);
assert.equal(result.find((item) => item.id === "custom:online-provider:image-main")?.providerBaseUrl, "https://online.example/v1");
assert.equal(result.find((item) => item.id === "custom:online-provider:image-main")?.networkMode, "proxy");
assert.equal(result.find((item) => item.id === "custom:offline-provider:image-backup")?.hasBaseUrl, false);
assert.deepEqual(result.find((item) => item.id === "custom:online-provider:image-main")?.capabilities, ["generation", "edit"]);
assert.equal(result.find((item) => item.id === "custom:online-provider:image-main")?.consecutiveFailures, 0);
assert.equal(result.find((item) => item.id === "custom:online-provider:image-main")?.lastImageSuccessAt, "");
assert.equal(result.some((item) => item.model === "text-only"), false);
assert.match(clientSource, /resolveCanvasAgentImageModel\(\{ requestedModel = null, requiresEdit = false, size = null, resolution = null \}/);
assert.match(clientSource, /isCanvasAgentImageCandidateCompatible/);

console.log("Image model candidate checks passed.");
