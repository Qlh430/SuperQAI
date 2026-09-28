"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const registrySource = fs.readFileSync(path.join(__dirname, "..", "provider-protocol-registry.js"), "utf8");
const engineSource = fs.readFileSync(path.join(__dirname, "..", "provider-protocol-engine.js"), "utf8");
const serverSource = require("./server-source").readServerSource();
const imageGenerationServiceSource = fs.readFileSync(path.join(__dirname, "..", "image-generation-service.js"), "utf8");
const start = imageGenerationServiceSource.indexOf("async function execute(payload = {}, options = {})");
const end = imageGenerationServiceSource.indexOf("return Object.freeze({", start);

assert.notEqual(start, -1, "shared image executor should exist");
assert.notEqual(end, -1, "shared image executor boundary should exist");

const block = imageGenerationServiceSource.slice(start, end);
assert.match(registrySource, /"image\.generate":\s*\{[^\n]*body:\s*"gemini-image"[^\n]*parse:\s*"gemini-image"/);
assert.match(registrySource, /"image\.edit":\s*\{[^\n]*body:\s*"gemini-image"[^\n]*parse:\s*"gemini-image"/);
assert.match(registrySource, /\/v1beta\/models\/\{model\}:generateContent/);
assert.match(engineSource, /responseModalities:\s*\["TEXT",\s*"IMAGE"\]/);
assert.match(engineSource, /inlineData/);
assert.match(engineSource, /geminiParts\(/);
assert.match(block, /requirements\.intent\s*===\s*"image\.edit"/);
assert.match(block, /mediaProviderBridge\.editImage/);
assert.match(block, /providerExecutionHttpStatus\(error\)/);
assert.doesNotMatch(block, /res\.writeHead\(upstream\.status/);
assert.match(serverSource, /const getImageGenerationService = createLazyValue\(\(\) => createImageGenerationService\(\{/);
assert.match(
  serverSource,
  /executeImageGenerationPayload:\s*\(\.\.\.args\)\s*=>\s*getImageGenerationService\(\)\.execute\(\.\.\.args\)/,
);

console.log("Custom Gemini edit routing checks passed.");
