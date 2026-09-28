"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const serverSource = require("./server-source").readServerSource();
const imageGenerationSource = fs.readFileSync(path.join(__dirname, "..", "image-generation-service.js"), "utf8");
const bridgeSource = fs.readFileSync(path.join(__dirname, "..", "media-provider-bridge.js"), "utf8");
const engineSource = fs.readFileSync(path.join(__dirname, "..", "provider-protocol-engine.js"), "utf8");
const start = imageGenerationSource.indexOf("async function execute(payload = {}, options = {})");
const end = imageGenerationSource.indexOf("return Object.freeze({", start);

assert.notEqual(start, -1, "shared image executor should exist");
assert.notEqual(end, -1, "shared image executor boundary should exist");

const block = imageGenerationSource.slice(start, end);
assert.match(block, /getPublicProviderModelCatalog\(requirements\.intent\)/);
assert.match(block, /mediaProviderBridge\.generateImage/);
assert.match(block, /mediaProviderBridge\.editImage/);
assert.doesNotMatch(block, /fetch\(|resolveCustomModel|IMAGE_CHAT_API_URL|requestImageChat/);
assert.match(bridgeSource, /executor\.execute\(\{[\s\S]*intent,[\s\S]*preferredProviderId:[\s\S]*preferredModelId:/);
assert.match(engineSource, /model\?\.metadata\?\.upstreamModel\s*\|\|\s*model\?\.id/);
assert.match(serverSource, /const getImageGenerationService = createLazyValue\(\(\) => createImageGenerationService\(\{/);
assert.match(
  serverSource,
  /executeImageGenerationPayload:\s*\(\.\.\.args\)\s*=>\s*getImageGenerationService\(\)\.execute\(\.\.\.args\)/,
);

console.log("Image provider routing checks passed.");
