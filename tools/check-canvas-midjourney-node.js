"use strict";

// Regression coverage for the dedicated Midjourney canvas node.
//
// The node exists because Midjourney splits one profile across three upstream
// endpoints: imagine takes a prompt with optional references, edit takes a
// prompt plus references, and blend only takes two to four references. These
// checks pin the backend routing, the bridge parameter contract and the canvas
// wiring a user reaches through 生成节点 → Midjourney 生成.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

const { createMediaProtocolAdapters } = require("../media-protocol-adapters");
const { createMediaProviderBridge } = require("../media-provider-bridge");
const { inferModelConfiguration, normalizeProviderBaseUrl } = require("../provider-model-rules");

const SCRIPT_SOURCE = fs.readFileSync(path.join(ROOT, "script.js"), "utf8");
const STYLE_SOURCE = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

function readSource(name) {
  return fs.readFileSync(path.join(ROOT, name), "utf8");
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `Missing function ${name}`);
  // The parameter list may itself contain braces (default objects), so the body
  // only starts after the matching close paren of the signature.
  let index = source.indexOf("(", start);
  let parens = 0;
  let signatureQuote = "";
  for (; index < source.length; index += 1) {
    const char = source[index];
    if (signatureQuote) {
      if (char === "\\") index += 1;
      else if (char === signatureQuote) signatureQuote = "";
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      signatureQuote = char;
      continue;
    }
    if (char === "(") parens += 1;
    else if (char === ")") {
      parens -= 1;
      if (parens <= 0) break;
    }
  }
  const bodyStart = source.indexOf("{", index);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unterminated function ${name}`);
}

function midjourneyProvider(baseUrl = "https://api.apimart.ai") {
  return { id: "midjourney-provider", name: "Midjourney", baseUrl, apiKey: "midjourney-secret", protocol: "midjourney" };
}

function midjourneyModel() {
  return { id: "midjourney", protocol: "midjourney", capabilities: ["image.generate", "image.edit"] };
}

function recordingFetch(calls) {
  return async (url, init = {}) => {
    calls.push({ url, body: init.body ? JSON.parse(init.body) : null });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: [{ url: "https://cdn.example/midjourney-1.png" }] }),
    };
  };
}

async function checkBackendRouting() {
  const adapters = createMediaProtocolAdapters({ wait: async () => {} });

  // --- imagine: the historical image-node shape stays on /generations ------
  const imagineCalls = [];
  await adapters.apimart.execute({
    provider: midjourneyProvider(),
    model: midjourneyModel(),
    intent: "image.generate",
    input: { prompt: "a paper crane" },
    params: { size: "16:9", version: "7", speed: "fast" },
    options: {},
    fetch: recordingFetch(imagineCalls),
  });
  assert.equal(imagineCalls.length, 1);
  assert.equal(imagineCalls[0].url, "https://api.apimart.ai/v1/midjourney/generations");
  assert.deepEqual(imagineCalls[0].body, { prompt: "a paper crane", size: "16:9", version: "7", speed: "fast" });

  // A reference image without an explicit operation keeps travelling as
  // image_urls on the imagine endpoint, which is how the existing API
  // generator node already behaves.
  const imagineRefCalls = [];
  await adapters.apimart.execute({
    provider: midjourneyProvider(),
    model: midjourneyModel(),
    intent: "image.edit",
    input: { prompt: "a paper crane", inputImages: ["https://files.example/ref.png"] },
    params: { size: "1:1", speed: "relax" },
    options: {},
    fetch: recordingFetch(imagineRefCalls),
  });
  assert.equal(imagineRefCalls[0].url, "https://api.apimart.ai/v1/midjourney/generations");
  assert.deepEqual(imagineRefCalls[0].body.image_urls, ["https://files.example/ref.png"]);

  // --- edit: references move to the edits endpoint -------------------------
  const editCalls = [];
  await adapters.apimart.execute({
    provider: midjourneyProvider(),
    model: midjourneyModel(),
    intent: "image.edit",
    input: { prompt: "add rain", inputImages: ["https://files.example/ref.png"] },
    params: { midjourneyOperation: "edit", size: "4:3", version: "6.1", speed: "turbo" },
    options: {},
    fetch: recordingFetch(editCalls),
  });
  assert.equal(editCalls[0].url, "https://api.apimart.ai/v1/midjourney/generations/edits");
  assert.deepEqual(editCalls[0].body, {
    prompt: "add rain",
    size: "4:3",
    version: "6.1",
    speed: "turbo",
    image_urls: ["https://files.example/ref.png"],
  });

  // --- blend: two to four references, no prompt and no version -------------
  const blendCalls = [];
  await adapters.apimart.execute({
    provider: midjourneyProvider(),
    model: midjourneyModel(),
    intent: "image.edit",
    input: { prompt: "", inputImages: ["https://files.example/a.png", "https://files.example/b.png"] },
    params: { midjourneyOperation: "blend", size: "1:1", speed: "fast", version: "7" },
    options: {},
    fetch: recordingFetch(blendCalls),
  });
  assert.equal(blendCalls[0].url, "https://api.apimart.ai/v1/midjourney/generations/blend");
  assert.deepEqual(blendCalls[0].body, {
    size: "1:1",
    speed: "fast",
    image_urls: ["https://files.example/a.png", "https://files.example/b.png"],
  });

  // --- reference validation fails before the request leaves the machine ----
  for (const [operation, images] of [
    ["edit", []],
    ["blend", ["https://files.example/a.png"]],
    ["blend", ["1", "2", "3", "4", "5"].map((name) => `https://files.example/${name}.png`)],
  ]) {
    const guardedCalls = [];
    await assert.rejects(
      adapters.apimart.execute({
        provider: midjourneyProvider(),
        model: midjourneyModel(),
        intent: "image.edit",
        input: { prompt: "x", inputImages: images },
        params: { midjourneyOperation: operation, size: "1:1" },
        options: {},
        fetch: recordingFetch(guardedCalls),
      }),
      (error) => error.code === "UPSTREAM_PROTOCOL" && error.retryable === false,
      `${operation} must reject ${images.length} reference images`,
    );
    assert.equal(guardedCalls.length, 0, `${operation} must not reach the upstream API when references are invalid`);
  }

  // --- a base URL that already names an endpoint is normalised -------------
  const pastedCalls = [];
  await adapters.apimart.execute({
    provider: midjourneyProvider("https://api.apimart.ai/v1/midjourney/generations/blend"),
    model: midjourneyModel(),
    intent: "image.edit",
    input: { prompt: "", inputImages: ["https://files.example/a.png", "https://files.example/b.png"] },
    params: { midjourneyOperation: "blend", size: "1:1" },
    options: {},
    fetch: recordingFetch(pastedCalls),
  });
  assert.equal(pastedCalls[0].url, "https://api.apimart.ai/v1/midjourney/generations/blend");
}

async function checkBridgeContract() {
  const calls = [];
  const bridge = createMediaProviderBridge({
    executor: {
      async execute(request) {
        calls.push(request);
        return { data: [{ url: "https://cdn.example/midjourney.png" }] };
      },
    },
  });

  await bridge.editImage({
    prompt: "",
    modelId: "midjourney",
    midjourneyOperation: "blend",
    inputImages: [{ url: "https://files.example/a.png" }, { url: "https://files.example/b.png" }],
  });
  assert.equal(calls[0].params.midjourneyOperation, "blend");
  assert.equal(calls[0].input.prompt, "");

  await bridge.editImage({
    prompt: "add rain",
    modelId: "midjourney",
    midjourneyOperation: "edit",
    inputImages: [{ url: "https://files.example/a.png" }],
  });
  assert.equal(calls[1].params.midjourneyOperation, "edit");

  await assert.rejects(
    bridge.editImage({ prompt: "", modelId: "midjourney", inputImages: [{ url: "https://files.example/a.png" }] }),
    (error) => error.code === "INVALID_MEDIA_INPUT",
    "an empty prompt stays invalid outside blend",
  );
}

function checkProviderRules() {
  const inferred = inferModelConfiguration(
    { id: "midjourney", capabilities: ["image.generate"] },
    { protocol: "apimart", baseUrl: "https://api.apimart.ai" },
  );
  assert.equal(inferred.protocol, "midjourney");
  assert.deepEqual(inferred.capabilities, ["image.generate", "image.edit"], "Midjourney profiles can edit and blend");

  assert.equal(
    normalizeProviderBaseUrl("https://api.apimart.ai/v1/midjourney/generations/edits"),
    "https://api.apimart.ai/v1",
  );
  assert.equal(
    normalizeProviderBaseUrl("https://api.apimart.ai/v1/midjourney/generations/blend"),
    "https://api.apimart.ai/v1",
  );
}

function checkCanvasWiring() {
  assert.match(SCRIPT_SOURCE, /data-canvas-node="midjourney"/, "the create menu must offer the Midjourney node");
  assert.match(SCRIPT_SOURCE, /data-connect-node="midjourney"/, "the connect menu must offer the Midjourney node");
  for (const name of ["addCanvasMidjourneyNode", "renderCanvasMidjourneyNode", "runCanvasMidjourneyNode", "syncCanvasMidjourneyControls"]) {
    assert.match(SCRIPT_SOURCE, new RegExp(`function ${name}\\(`), `${name} must exist`);
  }
  assert.match(
    extractFunction(SCRIPT_SOURCE, "resolveCanvasNodeKind"),
    /canvas-node-midjourney"\)\)\s*return "midjourney"/,
    "resolveCanvasNodeKind must name the Midjourney kind",
  );
  assert.match(
    extractFunction(SCRIPT_SOURCE, "getCanvasCreateKindFromSerialized"),
    /"midjourney"/,
    "paste and restore must rebuild a Midjourney node",
  );
  assert.match(SCRIPT_SOURCE, /midjourney: \{ icon: "wand-sparkles"/, "the kind meta must carry the node badge");
  assert.match(SCRIPT_SOURCE, /midjourney: "待完成"/, "the kind meta must carry a default status");

  const request = extractFunction(SCRIPT_SOURCE, "canvasMidjourneyRequest");
  assert.match(request, /midjourneyOperation: operation/, "the job payload must carry the selected operation");
  assert.match(request, /version:/, "the job payload must carry the Midjourney version");
  assert.match(request, /speed:/, "the job payload must carry the Midjourney speed");

  const run = extractFunction(SCRIPT_SOURCE, "runCanvasMidjourneyNode");
  assert.match(run, /createCanvasImageJob\(/, "the node must submit through the tracked image job endpoint");
  assert.match(run, /commitCanvasImageJobResult\(/, "the node must reuse the gallery commit path");

  assert.match(STYLE_SOURCE, /\.canvas-node-midjourney \.canvas-midjourney-reference/, "the node needs its hint styles");
  assert.match(readSource("canvas-virtualization-rules.js"), /midjourney: \{ width: 340, height: 430 \}/, "the node needs a default size");
  assert.match(readSource("canvas-preview-rules.js"), /midjourney: \{ label: "Midjourney"/, "the preview rules must name the kind");
  assert.match(readSource("canvas-node-preview-rules.js"), /midjourney: "Midjourney"/, "the preview titles must name the kind");
  assert.match(readSource("canvas-scene-layer.js"), /midjourney: "#/, "the scene layer must paint the node surface");
}

(async () => {
  await checkBackendRouting();
  await checkBridgeContract();
  checkProviderRules();
  checkCanvasWiring();
  console.log("Canvas Midjourney node checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
