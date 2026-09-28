const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = require("./server-source").readServerSource();
const mediaAdapterSource = fs.readFileSync(path.join(__dirname, "..", "media-protocol-adapters.js"), "utf8");
const mediaFileServiceSource = fs.readFileSync(path.join(__dirname, "..", "media-file-service.js"), "utf8");

function functionBlock(sourceText, name, nextName) {
  const start = sourceText.indexOf(`function ${name}(`);
  const asyncStart = sourceText.indexOf(`async function ${name}(`);
  const actualStart = start >= 0 ? start : asyncStart;
  assert.notEqual(actualStart, -1, `${name} must exist`);
  const end = nextName ? sourceText.indexOf(`function ${nextName}(`, actualStart + 1) : -1;
  return sourceText.slice(actualStart, end > actualStart ? end : actualStart + 8_000);
}

assert.match(source, /require\("\.\/outbound-route-policy"\)/);
assert.match(source, /require\("\.\/outbound-route-state"\)/);
assert.match(source, /OUTBOUND_ROUTE_STATE_FILE/);
assert.match(source, /createOutboundRouteStateStore\(\{/);
assert.match(source, /createOutboundRoutePolicy\(\{\s*initialState:/);
assert.match(source, /function getOutboundMachineId\(/);
assert.match(source, /function queueOutboundRouteStateSave\(/);
assert.match(source, /flushOutboundRouteState\(\)/);

const providerBlock = functionBlock(source, "getImageProvider", "isAinbImageModel");
assert.match(providerBlock, /networkMode:\s*normalizeRouteMode\(/);
assert.match(providerBlock, /providerId:/);

assert.match(mediaAdapterSource, /requestClass:\s*"billable"/);
assert.match(mediaAdapterSource, /requestClass:\s*"idempotent"/);
assert.match(mediaAdapterSource, /purpose:\s*"model-execution"/);
assert.match(source, /createMediaProviderBridge\(\{\s*executor:/);

for (const retired of [
  "requestImageGeneration",
  "requestImageEdit",
  "requestApimartImageGeneration",
  "requestApimartMidjourneyGeneration",
  "requestGrsaiImageGeneration",
  "requestGeminiNativeImageGeneration",
  "requestImageChat",
]) {
  assert.doesNotMatch(source, new RegExp(`(?:async )?function ${retired}\\(`), `${retired} must stay retired`);
}

const timeoutBlock = functionBlock(mediaFileServiceSource, "fetchWithTimeout", "fetchBufferResponseWithTimeout");
assert.match(timeoutBlock, /AbortSignal\.timeout\(/);
assert.match(timeoutBlock, /AbortSignal\.any\(\[options\.signal, timeoutSignal\]\)/);
assert.match(source, /require\("\.\/media-file-service"\)/);
assert.match(source, /\bfetchWithTimeout,/);

console.log("Server outbound routing checks passed.");
