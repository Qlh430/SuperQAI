const assert = require("node:assert/strict");
const fs = require("node:fs");

const server = fs.readFileSync("server.js", "utf8");
const script = fs.readFileSync("script.js", "utf8");
const html = fs.readFileSync("index.html", "utf8");
const styles = fs.readFileSync("styles.css", "utf8");

assert.match(server, /const MIDJOURNEY_IMAGE_MODEL_ALIAS = "midjourney";/);
assert.match(server, /https:\/\/api\.apimart\.ai\/v1\/midjourney\/generations/);
assert.match(server, /APIMART_IMAGE_API_KEY \? \[MIDJOURNEY_IMAGE_MODEL_ALIAS\] : \[\]/);
assert.match(server, /isMidjourneyImageModel\(model\)/);
assert.match(server, /new Set\(\["8\.2", "8\.1", "7", "6\.1", "5\.2", "5\.1"\]\)/);
assert.match(server, /new Set\(\["7", "6"\]\)/);
assert.match(server, /new Set\(\["relax", "fast", "turbo"\]\)/);
assert.match(server, /normalizeImagePlatform[\s\S]*MIDJOURNEY_IMAGE_MODEL_ALIAS/);
assert.match(server, /getDefaultImageResolutionsForModel[\s\S]*MIDJOURNEY_IMAGE_MODEL_ALIAS/);
assert.match(server, /stylize must be an integer from 0 to 1000/);
assert.match(server, /Midjourney HD is only supported for V8\.1 and V8\.2/);
assert.ok(server.includes("if (normalizedHd) normalized.hd = true;"));

const normalizeMidjourneySource = server.slice(
  server.indexOf("function normalizeMidjourneyOptions"),
  server.indexOf("function normalizeMidjourneySize"),
);
const normalizeMidjourneyOptions = Function(normalizeMidjourneySource + "; return normalizeMidjourneyOptions;")();
assert.deepEqual(normalizeMidjourneyOptions({ version: "8.2", hd: true }), {
  version: "8.2",
  niji: false,
  speed: "fast",
  style: "raw",
  stylize: 100,
  hd: true,
});
assert.throws(() => normalizeMidjourneyOptions({ version: "7", hd: true }), /HD is only supported/);
assert.throws(() => normalizeMidjourneyOptions({ version: "7", niji: true, hd: true }), /HD is only supported/);

const legacyRequest = server.slice(
  server.indexOf("async function requestApimartImageGeneration"),
  server.indexOf("async function requestApimartMidjourneyGeneration"),
);
const midjourneyRequest = server.slice(
  server.indexOf("async function requestApimartMidjourneyGeneration"),
  server.indexOf("function normalizeMidjourneyOptions"),
);
assert.match(legacyRequest, /model: APIMART_IMAGE_UPSTREAM_MODEL/);
assert.doesNotMatch(midjourneyRequest, /model\s*:/);
assert.match(midjourneyRequest, /waitForApimartTask\(taskId, MIDJOURNEY_IMAGE_TASK_API_URL\)/);

[
  "imageMidjourneyOptions",
  "imageMidjourneyVersion",
  "imageMidjourneyMode",
  "imageMidjourneySpeed",
  "imageMidjourneyQuality",
  "imageMidjourneyStyle",
  "imageMidjourneyStylize",
].forEach((id) => assert.ok(html.includes("id=" + String.fromCharCode(34) + id + String.fromCharCode(34))));

assert.match(script, /"midjourney": "Midjourney"/);
assert.match(script, /function isMidjourneyModel\(/);
assert.match(script, /function syncMidjourneyControls\(/);
assert.match(script, /function getMidjourneyPayload\(/);
assert.match(script, /function supportsMidjourneyHd\(/);
assert.match(html, /data-midjourney-field="quality"/);
assert.ok(script.includes("if (options.hd) payload.hd = true;"));
assert.ok(script.includes('["8.2", "8.1"].includes'));const supportsMidjourneyHdSource = script.slice(
  script.indexOf("function supportsMidjourneyHd"),
  script.indexOf("function getMidjourneyPayload"),
);
const supportsMidjourneyHd = Function(supportsMidjourneyHdSource + "; return supportsMidjourneyHd;")();
assert.equal(supportsMidjourneyHd("8.2", "standard"), true);
assert.equal(supportsMidjourneyHd("8.1", "standard"), true);
assert.equal(supportsMidjourneyHd("7", "standard"), false);
assert.equal(supportsMidjourneyHd("8.2", "niji"), false);
assert.match(script, /function renderModelResolutionTags\(model\)[\s\S]*isMidjourneyModel\(model\.id\)/);
assert.match(script, /function renderModelPlatformTags\(model\)[\s\S]*isMidjourneyModel\(model\.id\)/);
assert.match(script, /getMidjourneyPayload\(imageMidjourneyOptions\)/);
assert.match(script, /canvasMidjourneyVersion/);
assert.match(script, /canvasMidjourneyMode/);
assert.match(script, /canvasMidjourneySpeed/);
assert.match(script, /canvasMidjourneyQuality/);
assert.match(script, /canvasMidjourneyStyle/);
assert.match(script, /canvasMidjourneyStylize/);
assert.match(script, /midjourneyVersion/);
assert.match(script, /getMidjourneyPayload\(node\.querySelector\("\.canvas-midjourney-options"\)\)/);
assert.match(styles, /\.midjourney-options\[hidden\]/);
assert.match(styles, /\[data-midjourney-quality-field\]\[hidden\]/);
assert.match(styles, /\.canvas-midjourney-options/);

console.log("Midjourney checks passed");
