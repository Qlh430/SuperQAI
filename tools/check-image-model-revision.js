const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const clientSource = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");

assert.match(serverSource, /let imageModelsRevision\s*=\s*1/);
assert.match(serverSource, /imageModelsRevision\s*\+=\s*1/);
assert.match(serverSource, /revision:\s*imageModelsRevision/);
assert.match(serverSource, /imageModelsRevision,\s*\n?\s*providers:/);

assert.match(clientSource, /let canvasImageModelsRequiredRevision\s*=\s*0/);
assert.match(clientSource, /let canvasImageModelsAppliedRevision\s*=\s*0/);
assert.match(clientSource, /minimumRevision/);
assert.match(clientSource, /responseRevision\s*<\s*Math\.max\(minimumRevision,\s*canvasImageModelsRequiredRevision/);
assert.match(clientSource, /canvasImageModelsRequiredRevision\s*=\s*Math\.max\(/);
assert.match(clientSource, /imageModelsRevision/);

console.log("Image model revision checks passed.");
