"use strict";

const assert = require("node:assert/strict");

const { createProviderCatalogHttpApi } = require("../provider-catalog-http-api");

function responseRecorder() {
  return {
    status: 0,
    body: null,
    sendJson(_res, status, body) {
      this.status = status;
      this.body = body;
    },
  };
}

function request(url, method = "GET") {
  return { url, method, headers: { host: "localhost" } };
}

async function main() {
  const imageModel = {
    id: "custom:provider-a:image-main",
    modelId: "image-main",
    displayName: "image-main · Provider A",
    providerId: "provider-a",
    providerName: "Provider A",
    providerProtocol: "openai",
    providerHost: "api.example.com",
    modelProtocol: "openai.images",
    capabilities: ["image.generate", "image.edit"],
    state: "online",
    successRate: 0.98,
    latencyMs: 1200,
    lastUsedAt: "2026-09-24T00:00:00.000Z",
    order: 0,
    platform: "openai",
    family: "gpt-image",
    parameterOverrides: { quality: "high" },
    resolutions: ["1K", "2K"],
    price: "$0.02",
  };
  const videoModel = {
    id: "video-main",
    modelId: "video-main",
    displayName: "video-main · Provider B",
    providerId: "provider-b",
    providerName: "Provider B",
    providerProtocol: "cli:jimeng",
    providerHost: "jimeng",
    modelProtocol: "jimeng.video",
    capabilities: ["video.generate"],
    state: "online",
    platform: "jimeng",
    resolutions: ["720p"],
    ratios: ["16:9"],
    duration: { min: 5, max: 10 },
  };

  let catalogError = null;
  const api = createProviderCatalogHttpApi({
    getPublicProviderModelCatalog: (capability) => {
      if (catalogError) throw catalogError;
      if (capability === "image.generate") {
        return {
          defaultModel: imageModel.id,
          models: [imageModel],
          labels: { [imageModel.id]: imageModel.displayName },
        };
      }
      if (capability === "video.generate") {
        return {
          defaultModel: videoModel.id,
          models: [videoModel],
          labels: { [videoModel.id]: videoModel.displayName },
        };
      }
      return {
        defaultModel: "chat-main",
        models: [{ id: "chat-main", modelId: "chat-main", displayName: "chat-main · Provider A", capabilities: ["llm.chat"] }],
        labels: { "chat-main": "chat-main · Provider A" },
      };
    },
    providerExecutionHttpStatus: (error) => error?.code === "PINNED_MODEL_UNAVAILABLE" ? 400 : 503,
    readCatalogIdentity: () => ({ instanceId: "instance-1", revision: 42 }),
    sendJson: (res, status, body) => res.sendJson(res, status, body),
  });

  assert.equal(await api.handle(request("/api/models", "POST"), responseRecorder()), false);

  const imageResponse = responseRecorder();
  assert.equal(await api.handle(request("/api/image-models"), imageResponse), true);
  assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.body.instanceId, "instance-1");
  assert.equal(imageResponse.body.revision, 42);
  assert.deepEqual(imageResponse.body.resolutions[imageModel.id], ["1K", "2K"]);
  assert.deepEqual(imageResponse.body.platforms[imageModel.id], "openai");
  assert.deepEqual(imageResponse.body.families[imageModel.id], "gpt-image");
  assert.deepEqual(imageResponse.body.prices[imageModel.id], "$0.02");
  assert.deepEqual(imageResponse.body.candidates[0].capabilities, ["generation", "edit"]);
  assert.deepEqual(imageResponse.body.candidates[0].parameterOverrides, { quality: "high" });

  const videoResponse = responseRecorder();
  assert.equal(await api.handle(request("/api/video-models"), videoResponse), true);
  assert.equal(videoResponse.status, 200);
  assert.equal(videoResponse.body.candidates[0].capabilities[0], "video");
  assert.deepEqual(videoResponse.body.ratios[videoModel.id], ["16:9"]);
  assert.deepEqual(videoResponse.body.durations[videoModel.id], { min: 5, max: 10 });

  catalogError = Object.assign(new Error("pinned model unavailable"), { code: "PINNED_MODEL_UNAVAILABLE" });
  const errorResponse = responseRecorder();
  assert.equal(await api.handle(request("/api/models"), errorResponse), true);
  assert.equal(errorResponse.status, 400);
  assert.equal(errorResponse.body.code, "PINNED_MODEL_UNAVAILABLE");

  console.log("Provider catalog HTTP API checks passed.");
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
