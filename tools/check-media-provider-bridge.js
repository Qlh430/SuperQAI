"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createImageJobManager } = require("../image-job-manager");
const { createMediaProtocolAdapters } = require("../media-protocol-adapters");
const { createProviderExecutor } = require("../provider-executor");
const { createProtocolEngine } = require("../provider-protocol-engine");
const { createProtocolRegistry } = require("../provider-protocol-registry");
const imageRouting = require("../image-model-routing");

function candidate(providerId, modelId) {
  return {
    provider: { id: providerId, name: providerId, apiKey: `${providerId}-secret` },
    model: { id: modelId, displayName: modelId },
    reason: "administrator-order",
  };
}

(async () => {
  const { createMediaProviderBridge } = require("../media-provider-bridge");
  const calls = [];
  const controller = new AbortController();
  const bridge = createMediaProviderBridge({
    executor: {
      async execute(request) {
        calls.push(request);
        return { data: [{ url: `https://cdn.example/${request.intent}.bin` }] };
      },
    },
  });

  await bridge.generateImage({
    prompt: "  paper tree  ",
    size: "1024x1024",
    resolution: "1k",
    n: 2,
    providerId: "image-provider",
    modelId: "image-model",
    signal: controller.signal,
  });
  const preparedImage = { blob: new Blob(["image"], { type: "image/png" }), filename: "tree.png" };
  const preparedMask = { blob: new Blob(["mask"], { type: "image/png" }), filename: "mask.png" };
  await bridge.editImage({
    prompt: "autumn",
    inputImages: [preparedImage],
    mask: preparedMask,
  });
  await bridge.generateVideo({
    prompt: "leaves moving",
    duration: 6,
    aspectRatio: "16:9",
    images: [{ url: "/output/tree.png" }],
    videos: [{ url: "/output/motion.mp4" }],
    audios: [{ url: "/output/wind.wav" }],
  });
  await bridge.generateAudio({ prompt: "quiet wind", duration: 12, format: "mp3" });

  assert.deepEqual(calls.map((request) => request.intent), [
    "image.generate",
    "image.edit",
    "video.generate",
    "audio.generate",
  ]);
  assert.equal(calls[0].input.prompt, "paper tree");
  assert.deepEqual(calls[0].params, { size: "1024x1024", resolution: "1k", n: 2 });
  assert.equal(calls[0].preferredProviderId, "image-provider");
  assert.equal(calls[0].preferredModelId, "image-model");
  assert.equal(calls[0].options.signal, controller.signal);
  assert.deepEqual(calls[1].input.inputImages, [preparedImage]);
  assert.equal(calls[1].input.mask, preparedMask);
  assert.deepEqual(calls[2].params, { duration: 6, aspectRatio: "16:9" });
  assert.deepEqual(calls[2].input.images, [{ url: "/output/tree.png" }]);
  assert.deepEqual(calls[2].input.videos, [{ url: "/output/motion.mp4" }]);
  assert.deepEqual(calls[2].input.audios, [{ url: "/output/wind.wav" }]);
  assert.deepEqual(calls[3].params, { duration: 12, format: "mp3" });

  await assert.rejects(
    bridge.generateImage({ prompt: "   " }),
    (error) => error?.code === "INVALID_MEDIA_INPUT" && /prompt/i.test(error.message),
  );
  await assert.rejects(
    bridge.editImage({ prompt: "autumn", inputImages: [] }),
    (error) => error?.code === "INVALID_MEDIA_INPUT" && /image/i.test(error.message),
  );

  const primary = candidate("primary", "primary-image");
  const secondary = candidate("secondary", "secondary-image");
  const attempts = [];
  const executor = createProviderExecutor({
    resolver: {
      listCandidates(query) {
        return query.preferredModelId ? [primary] : [primary, secondary];
      },
      resolve() {
        throw new Error("unexpected empty route");
      },
      getAutoFallback: () => true,
    },
    engine: {
      async execute(provider) {
        attempts.push(provider.id);
        if (provider.id === "primary") {
          throw Object.assign(new Error("temporary failure"), { code: "UPSTREAM_SERVER", retryable: true });
        }
        return { data: [{ url: "https://cdn.example/fallback.png" }] };
      },
      async stream() {},
      async executeWithTools() {},
    },
  });
  const fallbackBridge = createMediaProviderBridge({ executor });
  const fallback = await fallbackBridge.generateImage({ prompt: "fallback" });
  assert.deepEqual(attempts, ["primary", "secondary"]);
  assert.equal(fallback.selection.providerId, "secondary");

  attempts.length = 0;
  await assert.rejects(
    fallbackBridge.generateImage({ prompt: "strict", modelId: "primary-image" }),
    (error) => error?.code === "UPSTREAM_SERVER",
  );
  assert.deepEqual(attempts, ["primary"], "a pinned media target must never fall back");

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "media-provider-job-"));
  try {
    const jobCalls = [];
    const manager = createImageJobManager({
      filePath: path.join(directory, "jobs.json"),
      timeoutMs: 500,
      mediaBridge: {
        async generateImage(input) {
          jobCalls.push(input);
          return { model: "provider-image", data: [{ url: "/output/provider-image.png" }] };
        },
      },
    });
    const job = manager.create({ prompt: "queued image", modelId: "provider-image" }, {
      boardId: "board-media",
      nodeId: "node-media",
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(jobCalls.length, 1);
    assert.equal(jobCalls[0].prompt, "queued image");
    assert.equal(manager.get(job.id).state, "completed");
    assert.equal(manager.get(job.id).result.data[0].url, "/output/provider-image.png");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }

  assert.deepEqual(imageRouting.getProviderTaskRequirements({ referenceImages: [] }), {
    intent: "image.generate",
    mustAll: ["image.generate"],
  });
  assert.deepEqual(imageRouting.getProviderTaskRequirements({ referenceImages: [{ url: "/input.png" }] }), {
    intent: "image.edit",
    mustAll: ["image.edit"],
  });

  const adapterRequests = [];
  const adapterResponses = [
    new Response(JSON.stringify({ data: { task_id: "mj-task" } }), { status: 200 }),
    new Response(JSON.stringify({ data: { status: "completed", images: [{ url: "https://cdn.example/mj.png" }] } }), { status: 200 }),
    new Response(JSON.stringify({ data: { url: "https://cdn.example/grsai.png" } }), { status: 200 }),
  ];
  const adapterFetch = async (url, options = {}) => {
    adapterRequests.push({ url: String(url), options });
    return adapterResponses.shift();
  };
  const localVideoCalls = [];
  const protocolAdapters = createMediaProtocolAdapters({
    wait: async () => {},
    executeComfyVideo: async (request) => {
      localVideoCalls.push(request);
      return { task_id: "local-video-task" };
    },
  });
  const adapterEngine = createProtocolEngine({
    registry: createProtocolRegistry({ adapters: protocolAdapters }),
    outboundFetch: adapterFetch,
  });
  assert.deepEqual(await adapterEngine.execute(
    { id: "apimart", baseUrl: "https://api.apimart.example/v1", protocol: "apimart", apiKey: "fake-key" },
    { id: "midjourney", protocol: "apimart" },
    "image.generate",
    { prompt: "forest" },
    { size: "16:9" },
  ), {
    data: [{ url: "https://cdn.example/mj.png" }],
    task_id: "mj-task",
  });
  assert.match(adapterRequests[0].url, /\/v1\/midjourney\/generations$/);
  assert.match(adapterRequests[1].url, /\/v1\/tasks\/mj-task$/);
  assert.equal(adapterRequests[0].options.headers.authorization, "Bearer fake-key");

  assert.deepEqual(await adapterEngine.execute(
    { id: "grsai", baseUrl: "https://grsai.example", protocol: "image-relay", apiKey: "fake-relay-key" },
    { id: "nano-banana-pro-grsai", protocol: "image-relay" },
    "image.generate",
    { prompt: "paper bird" },
    { size: "1:1", resolution: "2k" },
  ), { data: [{ url: "https://cdn.example/grsai.png" }] });
  assert.match(adapterRequests[2].url, /\/v1\/api\/generate$/);
  assert.equal(adapterRequests[2].options.headers.authorization, "Bearer fake-relay-key");

  const ambiguousRequests = [];
  const ambiguousEngine = createProtocolEngine({
    registry: createProtocolRegistry({ adapters: createMediaProtocolAdapters({ wait: async () => {} }) }),
    outboundFetch: async (url) => {
      ambiguousRequests.push(String(url));
      if (ambiguousRequests.length === 1) {
        return new Response(JSON.stringify({ data: { task_id: "charged-task" } }), { status: 200 });
      }
      return new Response(JSON.stringify({ message: "polling temporarily unavailable" }), { status: 503 });
    },
  });
  await assert.rejects(
    ambiguousEngine.execute(
      { id: "grsai", baseUrl: "https://grsai.example", protocol: "image-relay", apiKey: "fake-relay-key" },
      { id: "nano-banana-pro-grsai", protocol: "image-relay" },
      "image.generate",
      { prompt: "charged once" },
    ),
    (error) => error?.code === "UPSTREAM_TASK_PENDING" && error?.retryable === false,
  );
  assert.deepEqual(ambiguousRequests, [
    "https://grsai.example/v1/api/generate",
    "https://grsai.example/v1/api/result?id=charged-task",
  ]);

  assert.deepEqual(await adapterEngine.execute(
    { id: "local-comfy", baseUrl: "http://127.0.0.1:8188", protocol: "comfyui", apiKey: "" },
    { id: "minimax-h3", protocol: "comfyui" },
    "video.generate",
    { prompt: "camera move" },
    { duration: 6 },
  ), { task_id: "local-video-task" });
  assert.equal(localVideoCalls[0].provider.id, "local-comfy");
  assert.equal(localVideoCalls[0].input.prompt, "camera move");

  console.log("Media Provider bridge checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
