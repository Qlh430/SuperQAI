"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const adapterSource = fs.readFileSync(path.join(__dirname, "..", "media-protocol-adapters.js"), "utf8");
const executorSource = fs.readFileSync(path.join(__dirname, "..", "provider-executor.js"), "utf8");
const start = adapterSource.indexOf("const imageRelay =");
const end = adapterSource.indexOf("const comfyui =", start);

assert.notEqual(start, -1, "image relay adapter should exist");
assert.notEqual(end, -1, "image relay adapter boundary should exist");

const block = adapterSource.slice(start, end);
assert.equal((block.match(/postJson\(/g) || []).length, 1, "an image relay task must be submitted only once");
assert.match(block, /\/v1\/api\/generate/);
assert.match(block, /\/v1\/api\/result/);
assert.match(block, /waitForSubmittedTask\(\{/);
assert.match(adapterSource, /UPSTREAM_TASK_PENDING/);
assert.match(adapterSource, /retryable\s*=\s*false|retryable:\s*false/);
assert.match(executorSource, /error\?\.retryable\s*===\s*false/);

console.log("Image relay timeout handling checks passed.");
