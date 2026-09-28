const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { readServerSource } = require("./server-source");

const serverSource = readServerSource();
const clientSource = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");

assert.match(serverSource, /const imageModelsInstanceId\s*=\s*crypto\.randomUUID\(\)/);
assert.match(serverSource, /let imageModelsRevision\s*=\s*Date\.now\(\)/);
assert.match(serverSource, /imageModelsRevision\s*\+=\s*1/);
assert.match(serverSource, /instanceId:\s*imageModelsInstanceId/);
assert.match(serverSource, /revision:\s*imageModelsRevision/);
assert.match(serverSource, /imageModelsInstanceId:\s*String\(imageCatalogMetadata\.instanceId/);
assert.match(serverSource, /imageModelsRevision:\s*Number\(imageCatalogMetadata\.revision/);

assert.match(clientSource, /let canvasImageModelsInstanceId\s*=\s*["']{2}/);
assert.match(clientSource, /let canvasImageModelsRequiredRevision\s*=\s*0/);
assert.match(clientSource, /let canvasImageModelsAppliedRevision\s*=\s*0/);
assert.match(clientSource, /function adoptCanvasImageModelsInstance\(/);
assert.match(clientSource, /data\.instanceId/);
assert.match(clientSource, /data\.imageModelsInstanceId/);
assert.match(clientSource, /cache:\s*["']no-store["']/);
assert.match(clientSource, /minimumRevision/);
assert.match(clientSource, /responseRevision\s*<\s*Math\.max\(minimumRevision,\s*canvasImageModelsRequiredRevision/);
assert.match(clientSource, /canvasImageModelsRequiredRevision\s*=\s*Math\.max\(/);
assert.match(clientSource, /imageModelsRevision/);

console.log("Image model revision checks passed.");
