"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const Module = require("node:module");
const { test } = require("node:test");

// Exercise the production service with a tiny deterministic weight fixture. No real model is loaded.
const bytes = Buffer.from("BEN2 model fixture for resumable cache regression");
const digest = crypto.createHash("sha256").update(bytes).digest("hex");
const sourceFile = path.resolve(process.env.CUTOUT_CACHE_SOURCE || path.join(__dirname, "design-sources/background-removal-service.js"));
const compiled = new Module(sourceFile, module);
compiled.filename = sourceFile;
compiled.paths = Module._nodeModulePaths(path.dirname(sourceFile));
compiled._compile(fs.readFileSync(sourceFile, "utf8").replace("size: 222932053,", `size: ${bytes.length},`).replace("22cea62108ff53b7ccc20f7a008bf30494228d84b1687f29ecbe76936a998101", digest), sourceFile);
const { createBackgroundRemovalService } = compiled.exports;
const fileName = "ben2-base-1.0.0.onnx";
function setup(t, fetchImpl = async () => { throw new Error("offline fixture"); }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aios-cutout-cache-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dataDir = path.join(root, "data");
  const bundledModelDir = path.join(root, ".ai-runtime/versions/new/resources/app/assets/models/background-removal");
  const store = path.join(dataDir, "models/background-removal");
  fs.mkdirSync(store, { recursive: true });
  fs.mkdirSync(bundledModelDir, { recursive: true });
  const makeService = () => createBackgroundRemovalService({ dataDir, bundledModelDir, fetchImpl, sharp: {} });
  return { root, dataDir, store, bundledModelDir, makeService };
}
function put(directory, data = bytes) { fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(path.join(directory, fileName), data); }
function remote(store) { fs.writeFileSync(path.join(store, "ben2-base-upstream.json"), JSON.stringify({ size: bytes.length, sha256: digest, downloadUrl: "https://fixture.invalid/model", checkedAt: new Date().toISOString() })); }
function manifest() { return new Response(JSON.stringify({ size: bytes.length, sha256: digest }), { status: 200 }); }

test("a damaged stored model does not hide the verified bundled weight", t => {
  const fixture = setup(t); put(fixture.bundledModelDir); put(fixture.store, Buffer.from("broken"));
  const status = fixture.makeService().listModels()[0];
  assert.equal(status.installed, true); assert.equal(status.source, "bundled"); assert.equal(status.sha256, digest);
});
test("a new runtime reuses a verified previous runtime weight without downloading", t => {
  const fixture = setup(t); put(path.join(fixture.root, ".ai-runtime/versions/old/resources/app/assets/models/background-removal"));
  const service = fixture.makeService(); assert.equal(service.listModels()[0].installed, true);
});
test("offline install promotes a local weight into the stable data cache", async t => {
  let calls = 0; const fixture = setup(t, async () => { calls++; throw new Error("offline fixture"); }); put(fixture.bundledModelDir);
  const result = await fixture.makeService().downloadUpdate();
  assert.equal(result.reused, true); assert.equal(calls, 0); assert.deepEqual(fs.readFileSync(path.join(fixture.store, fileName)), bytes);
  fs.rmSync(path.join(fixture.bundledModelDir, fileName)); assert.equal(fixture.makeService().listModels()[0].installed, true);
});
test("an installed remote hash is reused without refetching manifest or bytes", async t => {
  let calls = 0; const fixture = setup(t, async () => { calls++; throw new Error("unexpected network"); }); put(fixture.store); remote(fixture.store);
  assert.equal((await fixture.makeService().downloadUpdate()).reused, true); assert.equal(calls, 0);
});
test("a failed stream retains partial bytes and a new service resumes with HTTP Range", async t => {
  let ranges = []; let first = true; let retry = false;
  const fixture = setup(t, async (url, options = {}) => {
    if (String(url).endsWith(".json")) return manifest();
    const range = options.headers?.Range || options.headers?.range || ""; ranges.push(range);
    if (first) {
      first = false;
      return { ok: true, status: 200, headers: new Headers({ "content-length": String(bytes.length) }), body: (async function*() { yield bytes.subarray(0, 9); throw new Error("fixture connection interrupted"); })() };
    }
    if (retry && range === "bytes=9-") return new Response(bytes.subarray(9), { status: 206, headers: { "content-range": `bytes 9-${bytes.length - 1}/${bytes.length}` } });
    throw new Error("fixture source unavailable");
  });
  remote(fixture.store);
  await assert.rejects(fixture.makeService().downloadUpdate());
  assert.equal(fs.statSync(path.join(fixture.store, `${fileName}.update`)).size, 9);
  retry = true;
  await fixture.makeService().downloadUpdate();
  assert.ok(ranges.includes("bytes=9-")); assert.deepEqual(fs.readFileSync(path.join(fixture.store, fileName)), bytes);
});
test("a server that ignores Range restarts cleanly instead of appending", async t => {
  const fixture = setup(t, async () => new Response(bytes, { status: 200 })); remote(fixture.store);
  fs.writeFileSync(path.join(fixture.store, `${fileName}.update`), bytes.subarray(0, 9));
  fs.writeFileSync(path.join(fixture.store, `${fileName}.update.json`), JSON.stringify({ sha256: digest, size: bytes.length }));
  await fixture.makeService().downloadUpdate(); assert.deepEqual(fs.readFileSync(path.join(fixture.store, fileName)), bytes);
});
test("parallel installs share one download and notify both callers", async t => {
  let calls = 0; let progressA = 0; let progressB = 0;
  const fixture = setup(t, async () => { calls++; await new Promise(resolve => setTimeout(resolve, 10)); return new Response(bytes); }); remote(fixture.store);
  const service = fixture.makeService();
  const results = await Promise.all([service.downloadUpdate(undefined, { onProgress: () => progressA++ }), service.downloadUpdate(undefined, { onProgress: () => progressB++ })]);
  assert.equal(calls, 1); assert.ok(results.every(result => result.model.installed)); assert.ok(progressA > 0 && progressB > 0);
});
test("a wrong hash never replaces a previously verified weight", async t => {
  const fixture = setup(t, async () => new Response(Buffer.alloc(bytes.length, 120))); put(fixture.store);
  fs.writeFileSync(path.join(fixture.store, "ben2-base-upstream.json"), JSON.stringify({ size: bytes.length, sha256: "a".repeat(64), downloadUrl: "https://fixture.invalid/model" }));
  await assert.rejects(fixture.makeService().downloadUpdate(), { code: "model_hash_mismatch" });
  assert.deepEqual(fs.readFileSync(path.join(fixture.store, fileName)), bytes);
  assert.equal(fs.existsSync(path.join(fixture.store, `${fileName}.update`)), false);
});
test("a wrong Content-Range preserves the partial without appending untrusted bytes", async t => {
  const fixture = setup(t, async () => new Response(bytes.subarray(9), { status: 206, headers: { "content-range": `bytes 0-${bytes.length - 10}/${bytes.length}` } })); remote(fixture.store);
  fs.writeFileSync(path.join(fixture.store, `${fileName}.update`), bytes.subarray(0, 9));
  fs.writeFileSync(path.join(fixture.store, `${fileName}.update.json`), JSON.stringify({ sha256: digest, size: bytes.length }));
  await assert.rejects(fixture.makeService().downloadUpdate(), { code: "model_range_mismatch" });
  assert.deepEqual(fs.readFileSync(path.join(fixture.store, `${fileName}.update`)), bytes.subarray(0, 9));
});
test("partials from a different published hash are discarded before requesting Range", async t => {
  let sentRange = null;
  const fixture = setup(t, async (_url, options) => { sentRange = options.headers?.Range || ""; return new Response(bytes); }); remote(fixture.store);
  fs.writeFileSync(path.join(fixture.store, `${fileName}.update`), Buffer.from("old"));
  fs.writeFileSync(path.join(fixture.store, `${fileName}.update.json`), JSON.stringify({ sha256: "0".repeat(64), size: bytes.length }));
  await fixture.makeService().downloadUpdate(); assert.equal(sentRange, ""); assert.deepEqual(fs.readFileSync(path.join(fixture.store, fileName)), bytes);
});
test("reset and import cannot modify an in-flight download", async t => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const fixture = setup(t, async () => { await gate; return new Response(bytes); }); remote(fixture.store);
  const service = fixture.makeService(); const pending = service.downloadUpdate();
  assert.throws(() => service.removeStoredModel(), { code: "model_download_busy" });
  await assert.rejects(service.importModelFile(path.join(fixture.bundledModelDir, fileName)), { code: "model_download_busy" });
  release(); await pending;
});
