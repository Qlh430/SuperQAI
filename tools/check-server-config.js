"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  createServerConfig,
  normalizeApiUrl,
  normalizeGrsaiImageApiUrl,
  normalizeImageApiUrl,
  normalizeImageEditApiUrl,
  normalizeMidjourneyApiUrl,
} = require("../server-config");
const { SERVER_SOURCE_FILES } = require("./server-source");

const ROOT = path.join(__dirname, "..");

function checkUrlNormalization() {
  assert.equal(normalizeApiUrl("https://example.com/v1"), "https://example.com/v1/chat/completions");
  assert.equal(normalizeImageApiUrl("https://example.com/v1"), "https://example.com/v1/images/generations");
  assert.equal(normalizeImageEditApiUrl("https://example.com/v1/images/generations"), "https://example.com/v1/images/edits");
  assert.equal(normalizeMidjourneyApiUrl("https://example.com/v1"), "https://example.com/v1/midjourney/generations");
  assert.equal(normalizeGrsaiImageApiUrl("https://example.com"), "https://example.com/v1/api/generate");
}

function checkSyntheticConfiguration() {
  const rootDir = path.join(os.tmpdir(), "ai-os-config-fixture");
  const env = {
    PORT: "4321",
    HOST: "127.0.0.1",
    AI_OS_DATA_DIR: "./synthetic-ai-os-data",
    AI_OS_OUTPUT_DIR: "./synthetic-ai-os-output",
    AI_OS_DISABLED_SERVER_COMPONENTS: "thumbnail-http-api, online-http-api,",
    AI_API_URL: "https://api.example.test/v1/chat/completions",
    AI_API_KEY: "synthetic-chat-key",
    AI_MODEL: "synthetic-chat-model",
    AI_IMAGE_MODELS: "synthetic-image-a,synthetic-image-b",
    APIMART_IMAGE_API_KEY: "synthetic-apimart-key",
    MAX_SYNC_IMAGE_MB: "32",
    ONLINE_TTL_SECONDS: "60",
    CANVAS_AGENT_API_URL: "https://agent.example.test/v1/responses",
  };
  const config = createServerConfig({
    rootDir,
    env,
    normalizeAgentApiUrl: (value) => `normalized:${value}`,
    loadEnvironment: false,
  });

  assert.equal(config.PUBLIC_DIR, rootDir);
  assert.equal(config.DATA_DIR, path.resolve("./synthetic-ai-os-data"));
  assert.equal(config.OUTPUT_DIR, path.resolve("./synthetic-ai-os-output"));
  assert.equal(config.SYSTEM_DB_FILE, path.join(config.DATA_DIR, "system.sqlite"));
  assert.equal(config.CANVAS_SKILLS_DIR, path.join(rootDir, "skills"));
  assert.equal(config.CANVAS_AGENT_API_URL, "normalized:https://agent.example.test/v1/responses");
  assert.equal(config.CANVAS_AGENT_FIRST_EVENT_TIMEOUT_MS, 30_000);
  assert.deepEqual(config.DISABLED_SERVER_COMPONENTS, ["thumbnail-http-api", "online-http-api"]);
  assert.equal(config.ONLINE_TTL_MS, 60_000);
  assert.equal(config.MAX_SYNC_IMAGE_BYTES, 32 * 1024 * 1024);
  assert.ok(config.AVAILABLE_IMAGE_MODELS.includes("synthetic-image-a"));
  assert.ok(config.AVAILABLE_IMAGE_MODELS.includes("gpt-image-2"));
  assert.ok(config.AVAILABLE_IMAGE_MODELS.includes("midjourney"));

  const customConfig = createServerConfig({
    rootDir,
    env: {
      ...env,
      CANVAS_AGENT_FIRST_EVENT_TIMEOUT_SECONDS: "45",
    },
    normalizeAgentApiUrl: (value) => value,
    loadEnvironment: false,
  });
  assert.equal(customConfig.CANVAS_AGENT_FIRST_EVENT_TIMEOUT_MS, 45_000);
}

function checkEnvFileLoading() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-config-env-"));
  try {
    fs.writeFileSync(
      path.join(rootDir, ".env"),
      "PORT=4567\nAI_API_KEY=file-key\nAI_MODEL=file-model\n",
      "utf8",
    );
    const env = {};
    const config = createServerConfig({
      rootDir,
      env,
      normalizeAgentApiUrl: (value) => value,
      loadEnvironment: true,
    });
    assert.equal(config.PORT, 4567);
    assert.equal(config.API_KEY, "file-key");
    assert.equal(config.DEFAULT_MODEL, "file-model");
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
}

function checkEntryBoundary() {
  assert.ok(SERVER_SOURCE_FILES.includes("server-config.js"), "server-source must include the configuration root");
  assert.ok(SERVER_SOURCE_FILES.includes("server-settings-service.js"), "server-source must include the settings service");
  const serverSource = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
  const compositionSource = fs.readFileSync(path.join(ROOT, "server-components", "composition.js"), "utf8");
  assert.match(serverSource, /createServerConfig\(/, "server.js must obtain configuration from the config root");
  assert.doesNotMatch(serverSource, /process\.env/, "server.js must not parse environment variables directly");
  assert.doesNotMatch(compositionSource, /process\.env/, "component composition must receive configuration from the host");
}

checkUrlNormalization();
checkSyntheticConfiguration();
checkEnvFileLoading();
checkEntryBoundary();
require("./check-server-settings-service.js");
console.log("Server configuration boundary checks passed.");
