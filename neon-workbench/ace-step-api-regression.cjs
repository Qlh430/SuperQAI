"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const runtime = path.resolve(__dirname, "../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app");
const moduleObject = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "design-sources/provider-http-api.js"), "utf8"), {
  require: name => require(path.join(runtime, name)), module: moduleObject, exports: moduleObject.exports,
  URL, Date, Set, WeakSet, Object, Number, String, Boolean, Array, Error, TypeError, Buffer,
});
const { createProviderHttpApi } = moduleObject.exports;

async function main() {
  const provider = { id: "local-comfyui", name: "本机 ComfyUI", protocol: "comfyui", enabled: true, models: [] };
  const calls = [];
  const api = createProviderHttpApi({
    store: { listPublic: () => [provider], reveal: id => { if (id !== provider.id) throw new Error("missing"); return provider; } },
    registry: { listPublic: () => [], inferModelConfiguration: model => model },
    engine: { fetchModels: async () => [], execute: async () => { throw new Error("ACE-Step must not use generic provider protocol execution"); } },
    aceStepTaskService: { execute: async request => { calls.push(request); return { url: "/output/ace-step.mp3", filename: "ace-step.mp3", contentType: "audio/mpeg" }; } },
    persistGeneratedAudio: async () => { throw new Error("test service already uses the injected saver"); },
    requireSignedIn: async () => ({ user: { id: "user-1" } }), requireRole: async () => true,
    readJson: async req => req.body || {}, sendJson: (res, status, body) => Object.assign(res, { status, body }),
  });
  async function request(url, method, body) {
    const res = { setHeader() {} };
    await api.handle({ url, method, body }, res);
    return res;
  }
  const catalog = await request("/api/providers/audio-models", "GET");
  assert.equal(catalog.status, 200);
  assert.ok(catalog.body.models.some(model => model.modelId === "ace-step" && model.displayName === "ACE-Step" && model.capabilities.includes("audio.generate")));
  const response = await request("/api/providers/generate-audio", "POST", {
    providerId: "local-comfyui", modelId: "ace-step", mode: "music", prompt: "温暖钢琴、轻快", parameters: { lyrics: "夜色落在窗边", duration: 73, bpm: 108, keyscale: "A minor" },
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.audio.url, "/output/ace-step.mp3");
  assert.deepEqual(JSON.parse(JSON.stringify({ tags: calls[0].tags, lyrics: calls[0].lyrics, duration: calls[0].duration, bpm: calls[0].bpm, keyscale: calls[0].keyscale })), {
    tags: "温暖钢琴、轻快", lyrics: "夜色落在窗边", duration: 73, bpm: 108, keyscale: "A minor",
  });
  assert.equal(calls[0].auth.user.id, "user-1");
  console.log("ACE-Step catalog, exact model route, field mapping, and authenticated audio delivery passed");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
