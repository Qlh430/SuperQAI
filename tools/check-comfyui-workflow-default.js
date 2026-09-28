"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createComfyService } = require("../comfyui-service");
const { createCapabilityResolver } = require("../provider-capability-resolver");
const { createMediaProviderBridge } = require("../media-provider-bridge");
const { createMinimaxH3TaskService } = require("../minimax-h3-task-service");

(async () => {
  const values = new Map();
  const providers = ["first", "selected"].map((id, sortOrder) => ({
    id, name: id, baseUrl: `http://${id}.example:8188`, enabled: true, sortOrder,
    models: [{ id: "minimax-h3", capabilities: ["video.generate"] }],
  }));
  const service = createComfyService({
    settings: { getSetting: key => values.get(key), setSetting: (key, value) => values.set(key, value) },
    getConnections: () => providers,
  });
  await service.save({ providerId: "selected", baseUrl: providers[1].baseUrl });
  const resolver = createCapabilityResolver({ store: { listInternal: () => providers, getAutoFallback: () => false } });
  let selected;
  const bridge = createMediaProviderBridge({ executor: { execute: async query => {
    selected = resolver.resolve(query).provider;
    return { task_id: "fixture-only" };
  } } });
  const h3Service = createMinimaxH3TaskService({
    mediaTaskService: {},
    updateTask: () => {},
    cleanupTasks: () => {},
    workflowFile: "fixture-workflow.json",
    normalizeRequest: value => value,
    prepareWorkflow: value => value,
    sanitizeReferenceName: value => value,
    mediaReferenceToFile: async () => ({}),
    comfyClient: {
      normalizeUrl: value => value,
      uploadFile: async () => ({}),
      submitPrompt: async () => "",
      waitForHistory: async () => ({}),
      saveHistoryVideos: async () => [],
    },
    formatErrorMessage: error => error.message,
    makeUploadToken: () => "fixture-token",
    makeUploadFilename: value => value,
  });
  const source = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  const result = {};
  const requestOptions = {
    readJson: async req => req,
    sendJson: (res, status, body) => { res.status = status; res.body = body; },
    generateVideo: bridge.generateVideo,
    getDefaultProviderId: () => service.configuration().config.providerId,
  };
  await h3Service.handleVideoRequest({ prompt: "fixture" }, result, requestOptions);
  assert.equal(result.status, 202, JSON.stringify(result.body));
  assert.equal(selected.id, "selected", "default H3 workflow uses the saved ComfyUI connection, not provider order");
  await h3Service.handleVideoRequest({ prompt: "fixture", providerId: "first" }, result, requestOptions);
  assert.equal(selected.id, "first", "explicit workflow provider still takes precedence");
  await h3Service.handleVideoRequest({ prompt: "fixture", provider_id: "first" }, result, requestOptions);
  assert.equal(selected.id, "first");
  // 画布 ComfyUI 节点必须能直接发起抠图工作流（与本地 ONNX 抠图并存的第二条路线）。
  const script = fs.readFileSync(path.join(__dirname, "../script.js"), "utf8");
  const renderer = fs.readFileSync(path.join(__dirname, "../canvas-comfy-node-renderer.js"), "utf8");
  const mediaGenerationHttpApi = fs.readFileSync(path.join(__dirname, "../media-generation-http-api.js"), "utf8");
  assert.match(script, /const COMFY_REMOVE_BACKGROUND_API_URL = "\/api\/comfy-remove-background";/, "canvas ComfyUI node posts to the cutout endpoint");
  assert.match(renderer, /\{ value: "remove-background", label: /, "canvas ComfyUI node offers the cutout workflow");
  assert.match(script, /"remove-background": COMFY_REMOVE_BACKGROUND_API_URL/, "cutout workflow mode maps to its own endpoint");
  assert.match(renderer, /COMFY_MODES\.some\(\(item\) => item\.value === previousMode\)/, "a saved cutout workflow mode survives a reload");
  assert.match(mediaGenerationHttpApi, /\[\"\/api\/comfy-remove-background\", \"remove-background\"\]/, "media generation API exposes the ComfyUI cutout endpoint");
  await service.close();
  console.log("ComfyUI workflow default checks passed (real handler, bridge and resolver; no generation).");
})().catch(error => { console.error(error); process.exitCode = 1; });
