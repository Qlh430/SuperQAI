const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

function functionBlock(name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const asyncStart = source.indexOf(`async function ${name}(`);
  const actualStart = start >= 0 ? start : asyncStart;
  assert.notEqual(actualStart, -1, `${name} must exist`);
  const end = nextName ? source.indexOf(`function ${nextName}(`, actualStart + 1) : -1;
  return source.slice(actualStart, end > actualStart ? end : actualStart + 8_000);
}

assert.match(source, /require\("\.\/outbound-route-policy"\)/);
assert.match(source, /require\("\.\/outbound-route-state"\)/);
assert.match(source, /OUTBOUND_ROUTE_STATE_FILE/);
assert.match(source, /createOutboundRouteStateStore\(\{/);
assert.match(source, /createOutboundRoutePolicy\(\{\s*initialState:/);
assert.match(source, /function getOutboundMachineId\(/);
assert.match(source, /function queueOutboundRouteStateSave\(/);
assert.match(source, /flushOutboundRouteState\(\)/);

const providerBlock = functionBlock("getImageProvider", "isAinbImageModel");
assert.match(providerBlock, /networkMode:\s*normalizeRouteMode\(/);
assert.match(providerBlock, /providerId:/);

for (const [name, nextName] of [
  ["requestImageGeneration", "requestImageEdit"],
  ["requestImageEdit", "requestApimartImageGeneration"],
  ["requestGeminiNativeImageGeneration", "buildGeminiNativeImageParts"],
  ["requestImageChat", "buildGeminiImageChatContent"],
]) {
  const block = functionBlock(name, nextName);
  assert.match(block, /outbound:\s*\{/);
  assert.match(block, /requestClass:\s*"billable"/);
  assert.match(block, /mode:/);
}

console.log("Server outbound routing checks passed.");
