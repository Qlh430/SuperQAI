const assert = require("assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { spawn } = require("child_process");
const rules = require("../image-resolution-rules");

const ROOT = path.join(__dirname, "..");
const SERVER_SOURCE = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
const CLIENT_SOURCE = fs.readFileSync(path.join(ROOT, "script.js"), "utf8");
const STYLE_SOURCE = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `Missing function ${name}`);
  const bodyStart = source.indexOf("{", start);
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

async function waitForServer(port, child) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Test server exited with code ${child.exitCode}`);
    try {
      return await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/api/image-models`, (response) => {
          let body = "";
          response.setEncoding("utf8");
          response.on("data", (chunk) => { body += chunk; });
          response.on("end", () => response.statusCode === 200 ? resolve(JSON.parse(body)) : reject(new Error(body)));
        }).on("error", reject);
      });
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error("Timed out waiting for test server");
}

async function checkProviderResolutionIsolation() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "image-resolution-config-"));
  fs.copyFileSync(path.join(ROOT, "server.js"), path.join(tempRoot, "server.js"));
  fs.copyFileSync(path.join(ROOT, "image-job-manager.js"), path.join(tempRoot, "image-job-manager.js"));
  fs.copyFileSync(path.join(ROOT, "image-model-routing.js"), path.join(tempRoot, "image-model-routing.js"));
  fs.copyFileSync(path.join(ROOT, "image-resolution-rules.js"), path.join(tempRoot, "image-resolution-rules.js"));
  fs.copyFileSync(path.join(ROOT, "image-thumbnail-store.js"), path.join(tempRoot, "image-thumbnail-store.js"));
  fs.copyFileSync(path.join(ROOT, "outbound-fetch.js"), path.join(tempRoot, "outbound-fetch.js"));
  fs.copyFileSync(path.join(ROOT, "minimax-h3-workflow.js"), path.join(tempRoot, "minimax-h3-workflow.js"));
  fs.copyFileSync(path.join(ROOT, "canvas-agent-runtime.js"), path.join(tempRoot, "canvas-agent-runtime.js"));
  fs.copyFileSync(path.join(ROOT, "canvas-agent-capabilities.js"), path.join(tempRoot, "canvas-agent-capabilities.js"));
  fs.copyFileSync(path.join(ROOT, "canvas-agent-core.js"), path.join(tempRoot, "canvas-agent-core.js"));
  fs.copyFileSync(path.join(ROOT, "canvas-agent-router.js"), path.join(tempRoot, "canvas-agent-router.js"));
  fs.copyFileSync(path.join(ROOT, "canvas-agent-model-adapters.js"), path.join(tempRoot, "canvas-agent-model-adapters.js"));
  fs.copyFileSync(path.join(ROOT, "canvas-agent-llm-connectors.js"), path.join(tempRoot, "canvas-agent-llm-connectors.js"));
  fs.copyFileSync(path.join(ROOT, "canvas-agent-conversation.js"), path.join(tempRoot, "canvas-agent-conversation.js"));
  fs.copyFileSync(path.join(ROOT, "canvas-agent-conversation-store.js"), path.join(tempRoot, "canvas-agent-conversation-store.js"));
  for (const directory of ["data", "output", "workflows", path.join("tmp", "uploads")]) {
    fs.mkdirSync(path.join(tempRoot, directory), { recursive: true });
  }
  fs.writeFileSync(path.join(tempRoot, "data", "settings.json"), JSON.stringify({
    providers: [
      {
        id: "provider-one",
        name: "one",
        baseUrl: "https://one.example/v1",
        apiKey: "test-key-one",
        enabled: true,
        models: [{
          id: "gpt-image-2",
          capabilities: ["generation", "edit"],
          resolutions: ["1"],
          platform: "openai",
        }],
      },
      {
        id: "provider-four",
        name: "four",
        baseUrl: "https://four.example/v1",
        apiKey: "test-key-four",
        enabled: true,
        models: [{
          id: "gpt-image-2",
          capabilities: ["generation", "edit"],
          resolutions: ["1", "2", "4"],
          platform: "openai",
        }],
      },
    ],
  }));

  const port = 38000 + Math.floor(Math.random() * 2000);
  const child = spawn(process.execPath, ["server.js"], {
    cwd: tempRoot,
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", AI_API_KEY: "", AI_IMAGE_API_KEY: "" },
    stdio: "ignore",
  });
  try {
    const data = await waitForServer(port, child);
    const byLabel = Object.fromEntries(Object.entries(data.labels).map(([id, label]) => [label, data.resolutions[id]]));
    assert.deepStrictEqual(byLabel["gpt-image-2 · one"], ["1"]);
    assert.deepStrictEqual(byLabel["gpt-image-2 · four"], ["1", "2", "4"]);
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

function postJson(port, pathname, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const request = http.request({
      hostname: "127.0.0.1",
      port,
      path: pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    }, (response) => {
      let responseBody = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { responseBody += chunk; });
      response.on("end", () => {
        let parsed = {};
        try { parsed = JSON.parse(responseBody || "{}"); } catch {}
        resolve({ status: response.statusCode, body: parsed });
      });
    });
    request.on("error", reject);
    request.end(body);
  });
}

async function checkHttpCompatibilityValidation() {
  const upstreamRequests = [];
  const upstream = http.createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      const parsed = JSON.parse(body || "{}");
      upstreamRequests.push({ url: request.url, body: parsed });
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ model: parsed.model, data: [] }));
    });
  });
  const upstreamPort = await listen(upstream);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "image-resolution-http-"));
  fs.copyFileSync(path.join(ROOT, "server.js"), path.join(tempRoot, "server.js"));
  fs.copyFileSync(path.join(ROOT, "image-job-manager.js"), path.join(tempRoot, "image-job-manager.js"));
  fs.copyFileSync(path.join(ROOT, "image-model-routing.js"), path.join(tempRoot, "image-model-routing.js"));
  fs.copyFileSync(path.join(ROOT, "image-resolution-rules.js"), path.join(tempRoot, "image-resolution-rules.js"));
  fs.copyFileSync(path.join(ROOT, "image-thumbnail-store.js"), path.join(tempRoot, "image-thumbnail-store.js"));
  fs.copyFileSync(path.join(ROOT, "outbound-fetch.js"), path.join(tempRoot, "outbound-fetch.js"));
  fs.copyFileSync(path.join(ROOT, "minimax-h3-workflow.js"), path.join(tempRoot, "minimax-h3-workflow.js"));
  fs.copyFileSync(path.join(ROOT, "canvas-agent-runtime.js"), path.join(tempRoot, "canvas-agent-runtime.js"));
  fs.copyFileSync(path.join(ROOT, "canvas-agent-capabilities.js"), path.join(tempRoot, "canvas-agent-capabilities.js"));
  fs.copyFileSync(path.join(ROOT, "canvas-agent-core.js"), path.join(tempRoot, "canvas-agent-core.js"));
  fs.copyFileSync(path.join(ROOT, "canvas-agent-router.js"), path.join(tempRoot, "canvas-agent-router.js"));
  fs.copyFileSync(path.join(ROOT, "canvas-agent-model-adapters.js"), path.join(tempRoot, "canvas-agent-model-adapters.js"));
  fs.copyFileSync(path.join(ROOT, "canvas-agent-llm-connectors.js"), path.join(tempRoot, "canvas-agent-llm-connectors.js"));
  fs.copyFileSync(path.join(ROOT, "canvas-agent-conversation.js"), path.join(tempRoot, "canvas-agent-conversation.js"));
  fs.copyFileSync(path.join(ROOT, "canvas-agent-conversation-store.js"), path.join(tempRoot, "canvas-agent-conversation-store.js"));
  for (const directory of ["data", "output", "workflows", path.join("tmp", "uploads")]) {
    fs.mkdirSync(path.join(tempRoot, directory), { recursive: true });
  }
  fs.writeFileSync(path.join(tempRoot, "data", "settings.json"), JSON.stringify({
    providers: [
      {
        id: "openai-provider",
        name: "openai-test",
        baseUrl: `http://127.0.0.1:${upstreamPort}/v1`,
        apiKey: "openai-key",
        enabled: true,
        models: [{
          id: "gpt-image-2",
          capabilities: ["generation"],
          resolutions: ["1", "2", "4"],
          platform: "openai",
        }],
      },
      {
        id: "openai-limited-provider",
        name: "openai-limited-test",
        baseUrl: `http://127.0.0.1:${upstreamPort}/v1`,
        apiKey: "openai-limited-key",
        enabled: true,
        models: [{
          id: "gpt-image-2",
          capabilities: ["generation"],
          resolutions: ["1"],
          platform: "openai",
        }],
      },
      {
        id: "google-provider",
        name: "google-test",
        baseUrl: `http://127.0.0.1:${upstreamPort}/v1`,
        apiKey: "google-key",
        enabled: true,
        models: [{
          id: "gemini-3.1-flash-image-preview",
          capabilities: ["generation"],
          resolutions: ["1", "2", "4"],
          platform: "google",
          family: "gemini-3.1-flash-image",
        }],
      },
    ],
  }));

  const port = 40000 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, ["server.js"], {
    cwd: tempRoot,
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", AI_API_KEY: "", AI_IMAGE_API_KEY: "" },
    stdio: "ignore",
  });
  try {
    const models = await waitForServer(port, child);
    const openAiModel = Object.keys(models.labels).find((id) => models.labels[id].includes("openai-test"));
    const limitedOpenAiModel = Object.keys(models.labels).find((id) => models.labels[id].includes("openai-limited-test"));
    const googleModel = Object.keys(models.labels).find((id) => models.labels[id].includes("google-test"));
    assert(openAiModel);
    assert(limitedOpenAiModel);
    assert(googleModel);

    const invalid = await postJson(port, "/api/images", {
      model: openAiModel,
      size: "1:1",
      resolution: "4k",
      prompt: "test",
    });
    assert.strictEqual(invalid.status, 400);
    assert.strictEqual(invalid.body.code, "IMAGE_SIZE_NOT_SUPPORTED");
    assert.strictEqual(invalid.body.alternative, "2880x2880");

    const disabledByProvider = await postJson(port, "/api/images", {
      model: limitedOpenAiModel,
      size: "16:9",
      resolution: "2k",
      prompt: "test",
    });
    assert.strictEqual(disabledByProvider.status, 400);
    assert.strictEqual(disabledByProvider.body.code, "IMAGE_SIZE_NOT_SUPPORTED");

    const validGoogle = await postJson(port, "/api/images", {
      model: googleModel,
      size: "1:1",
      resolution: "4k",
      prompt: "test",
    });
    assert.strictEqual(validGoogle.status, 200);
    const googleRequest = upstreamRequests.find((item) => item.body.model === "gemini-3.1-flash-image-preview");
    assert(googleRequest);
    assert.strictEqual(googleRequest.body.aspect_ratio, "1:1");
    assert.strictEqual(googleRequest.body.image_size, "4K");
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    }
    await closeServer(upstream);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function checkResolutionChoiceContract() {
  const openAiSquare = rules.getResolutionChoices({
    platform: "openai",
    ratio: "1:1",
    configuredResolutions: ["1", "2", "4"],
  });
  assert.deepStrictEqual(openAiSquare.map(({ value, disabled }) => ({ value, disabled })), [
    { value: "1", disabled: false },
    { value: "2", disabled: false },
    { value: "4", disabled: true },
    { value: "exact:2880x2880", disabled: false },
  ]);
  const googleSquare = rules.getResolutionChoices({
    platform: "google",
    family: "gemini-3.1-flash-image",
    ratio: "1:1",
    configuredResolutions: ["1", "2", "4"],
  });
  assert.deepStrictEqual(googleSquare.map(({ value, disabled }) => ({ value, disabled })), [
    { value: "1", disabled: false },
    { value: "2", disabled: false },
    { value: "4", disabled: false },
  ]);

  const fillSource = extractFunction(CLIENT_SOURCE, "fillCanvasNodeResolutionSelect");
  const availabilitySource = extractFunction(CLIENT_SOURCE, "updateCanvasNodeResolutionAvailability");
  extractFunction(CLIENT_SOURCE, "getImageResolutionChoiceContext");
  extractFunction(CLIENT_SOURCE, "syncCanvasNodeResolutionState");
  assert(fillSource.includes("ImageResolutionRules.getResolutionChoices"));
  assert(fillSource.includes("option.dataset.reason"));
  assert(!availabilitySource.includes("option.hidden"));
  assert(CLIENT_SOURCE.includes("canvas-node-resolution-help"));
  assert(STYLE_SOURCE.includes(".canvas-node-resolution-help"));
  assert(STYLE_SOURCE.includes(".image-resolution-help"));

  const runSource = extractFunction(CLIENT_SOURCE, "runCanvasImageEdit");
  assert(runSource.includes("syncCanvasNodeResolutionState"));
  assert(runSource.includes("compatibility.supported"));

  const loadingSource = extractFunction(CLIENT_SOURCE, "setImageLoading");
  assert(loadingSource.includes("syncMainImageResolutionState"));

  const scaledSizeSource = extractFunction(CLIENT_SOURCE, "getScaledImageSizeByLongEdge");
  assert(!scaledSizeSource.includes(': "auto"'), "invalid explicit sizes must not silently become auto");

  const pickerSource = extractFunction(CLIENT_SOURCE, "pickImageResolutionChoiceValue");
  const pickerContext = {};
  vm.runInNewContext(pickerSource, pickerContext);
  const autoChoices = [
    { value: "auto", disabled: false, level: "auto" },
    { value: "1", disabled: true, level: "1" },
    { value: "2", disabled: true, level: "2" },
    { value: "4", disabled: true, level: "4" },
  ];
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(pickerContext.pickImageResolutionChoiceValue(
      autoChoices,
      "1",
      { platform: "openai", ratio: "auto" },
      "",
    ))),
    { value: "auto", remembered: "1" },
  );
  const ratioChoices = [
    { value: "1", disabled: false, level: "1" },
    { value: "2", disabled: false, level: "2" },
    { value: "4", disabled: true, level: "4" },
    { value: "exact:2880x2880", disabled: false, level: "4" },
  ];
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(pickerContext.pickImageResolutionChoiceValue(
      ratioChoices,
      "auto",
      { platform: "openai", ratio: "1:1" },
      "2",
    ))),
    { value: "2", remembered: "2" },
  );
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(pickerContext.pickImageResolutionChoiceValue(
      ratioChoices,
      "auto",
      { platform: "openai", ratio: "1:1" },
      "",
    ))),
    { value: "1", remembered: "1" },
  );

  const serializationContext = {
    ImageResolutionRules: rules,
    getAllowedImageResolutionLevels: () => ["1"],
    getAllowedImageResolutionLevelsForSize: () => ["1"],
    pickClosestAllowedImageResolution: () => "1",
  };
  vm.runInNewContext([
    extractFunction(CLIENT_SOURCE, "normalizeImageResolutionValue"),
    extractFunction(CLIENT_SOURCE, "formatImageResolutionApiValue"),
    extractFunction(CLIENT_SOURCE, "getEffectiveImageResolutionLevel"),
  ].join("\n"), serializationContext);
  assert.strictEqual(
    serializationContext.getEffectiveImageResolutionLevel("custom:gpt-image-2", "auto", "auto"),
    "auto",
    "Auto resolution should remain auto while deriving the effective level",
  );
  assert.strictEqual(
    serializationContext.formatImageResolutionApiValue("auto"),
    "auto",
    "Auto resolution should be serialized as auto instead of 1k",
  );

  const summarySource = extractFunction(CLIENT_SOURCE, "getDisabledResolutionSummary");
  const summaryContext = {};
  vm.runInNewContext(summarySource, summaryContext);
  assert.strictEqual(
    summaryContext.getDisabledResolutionSummary({
      value: "auto",
      options: [{
        value: "1",
        disabled: true,
        dataset: { reason: "OpenAI Auto 无法保证具体输出档位，请选择“自动尺寸”" },
      }],
    }),
    "OpenAI Auto 无法保证具体输出档位",
  );
}

(async () => {
  await checkProviderResolutionIsolation();
  await checkHttpCompatibilityValidation();
  checkResolutionChoiceContract();
  console.log("custom image resolution configuration checks passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
