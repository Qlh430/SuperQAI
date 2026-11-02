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
const auth = { user: { id: "qwen-user" } };
const plain = value => JSON.parse(JSON.stringify(value));
const base = { providerId: "local-comfyui", modelId: "qwen-tts", mode: "speech", prompt: "  你好，世界。  " };

function harness({ enabled = true, protocol = "comfyui", service = true, signedIn = true, execute } = {}) {
  const provider = { id: "local-comfyui", name: "本机 ComfyUI", protocol, enabled, models: [] };
  const calls = [];
  let engineCalls = 0;
  const api = createProviderHttpApi({
    store: { listPublic: () => [provider], reveal: id => {
      if (id !== provider.id) throw Object.assign(new Error("服务不存在"), { code: "provider_not_found", statusCode: 404 });
      return provider;
    } },
    registry: { listPublic: () => [], inferModelConfiguration: model => model },
    engine: { fetchModels: async () => [], execute: async () => { engineCalls++; throw new Error("专用工作流不能调用通用引擎"); } },
    qwenTtsTaskService: service ? { execute: async request => {
      calls.push(request);
      if (execute) return execute(request);
      return { url: "/output/qwen-tts.flac", filename: "qwen-tts.flac" };
    } } : null,
    aceStepTaskService: { execute: async () => ({ url: "/output/ace-step.mp3", contentType: "audio/mpeg" }) },
    requireSignedIn: async () => {
      if (!signedIn) throw Object.assign(new Error("请先登录"), { code: "unauthorized", statusCode: 401 });
      return auth;
    },
    requireRole: async () => { throw new Error("普通登录用户可使用音频，不应要求管理员权限"); },
    readJson: async req => req.body || {}, sendJson: (res, status, body) => Object.assign(res, { status, body }),
  });
  return {
    calls, provider, get engineCalls() { return engineCalls; },
    async request(body = base, url = "/api/providers/generate-audio", method = "POST") {
      const res = { setHeader() {} };
      assert.equal(await api.handle({ url, method, body }, res), true);
      return res;
    },
    async catalog() { return this.request(undefined, "/api/providers/audio-models", "GET"); },
  };
}

async function main() {
  const h = harness();
  const catalog = await h.catalog();
  assert.equal(catalog.status, 200);
  const qwen = catalog.body.models.find(model => model.modelId === "qwen-tts");
  assert.ok(qwen, "Qwen-TTS must be published without saved generic provider models");
  assert.equal(qwen.id, "custom:local-comfyui:qwen-tts");
  assert.equal(qwen.displayName, "Qwen-TTS");
  assert.equal(qwen.providerId, "local-comfyui");
  assert.equal(qwen.modelProtocol, "audio-speech");
  assert.deepEqual(plain(qwen.capabilities), ["audio.generate"]);
  const ace = catalog.body.models.find(model => model.modelId === "ace-step");
  assert.equal(ace.modelProtocol, "comfyui", "ACE-Step must remain a music model");

  for (const parameters of [undefined, { voiceMode: "preset", speaker: "Vivian", instruct: "  温柔自然  " }, { voiceMode: "clone", referenceAudio: "/output/reference.wav" }, { voiceMode: "design", instruct: "  低沉平静的成年男声  " }]) {
    const response = await h.request({ ...base, ...(parameters ? { parameters } : {}) });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.deepEqual(plain(response.body.audio), { url: "/output/qwen-tts.flac", filename: "qwen-tts.flac", contentType: "audio/flac", modelId: "qwen-tts", providerId: "local-comfyui" });
    const actual = h.calls.at(-1);
    assert.deepEqual(plain(actual), { mode: parameters?.voiceMode || "preset", text: "你好，世界。", speaker: parameters?.speaker || "Ryan", instruct: parameters?.instruct?.trim() || "", referenceAudio: parameters?.referenceAudio || "", auth });
    assert.equal(actual.auth, auth, "forward the actual authenticated context for media ACL");
  }
  for (const speaker of ["Aiden", "Dylan", "Eric", "Ono_anna", "Ryan", "Serena", "Sohee", "Uncle_fu", "Vivian"]) {
    assert.equal((await h.request({ ...base, parameters: { speaker } })).status, 200, speaker);
  }
  assert.equal((await h.request({ ...base, prompt: "字".repeat(4096) })).status, 200);
  const callCount = h.calls.length;
  const invalid = [
    { mode: "music" }, { mode: undefined }, { mode: "preset" }, { prompt: "   " }, { prompt: 123 }, { prompt: "字".repeat(4097) },
    { input: { prompt: "不应从input读取" } }, { params: { voiceMode: "preset" } }, { speed: 1 },
    ...[null, [], "preset", { voiceMode: "unknown" }, { voiceMode: "" }, { speaker: "ryan" }, { speaker: "" }, { speaker: 1 }, { speed: 1 }, { voice: "Ryan" }, { duration: 10 }, { response_format: "mp3" }, { instruct: {} }, { referenceAudio: {} }, { voiceMode: "design", instruct: " " }, { voiceMode: "clone" }, { voiceMode: "clone", referenceAudio: "https://example.com/test.wav" }, { voiceMode: "clone", referenceAudio: "data:audio/wav;base64,AAAA" }, { voiceMode: "clone", referenceAudio: "C:/test.wav" }, { voiceMode: "clone", referenceAudio: "/output/" }, { voiceMode: "clone", referenceAudio: "/output/test.wav?token=secret" }].map(parameters => ({ parameters })),
  ];
  for (const override of invalid) {
    const response = await h.request({ ...base, ...override });
    assert.equal(response.status, 400, `Invalid request accepted: ${JSON.stringify(override)}`);
    assert.equal(response.body.code, "invalid_audio_input");
    assert.match(response.body.error, /[\u4e00-\u9fff]/);
  }
  assert.equal(h.calls.length, callCount, "invalid input must fail before service execution");
  assert.equal(h.engineCalls, 0);

  for (const config of [{ enabled: false }, { protocol: "openai" }, { service: false }]) {
    const unavailable = harness(config);
    assert.equal((await unavailable.catalog()).body.models.some(model => model.modelId === "qwen-tts"), false);
    const response = await unavailable.request();
    assert.equal(response.status, config.enabled === false ? 403 : 503);
    assert.equal(response.body.code, config.enabled === false ? "provider_disabled" : "qwen_tts_unavailable");
    assert.equal(unavailable.calls.length, 0);
    assert.equal(unavailable.engineCalls, 0);
  }
  const anonymous = harness({ signedIn: false });
  assert.equal((await anonymous.catalog()).status, 401);
  assert.equal((await anonymous.request()).status, 401);
  assert.equal(anonymous.calls.length, 0);
  const forbidden = harness({ execute: () => { throw Object.assign(new Error("无权读取参考音频"), { code: "media_forbidden", statusCode: 403 }); } });
  const denied = await forbidden.request({ ...base, parameters: { voiceMode: "clone", referenceAudio: "/output/other-user.wav" } });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, "media_forbidden");
  assert.equal(denied.body.error, "无权读取参考音频");
  const explicitType = harness({ execute: () => ({ url: "/output/result.flac", contentType: "audio/x-flac" }) });
  assert.equal((await explicitType.request()).body.audio.contentType, "audio/x-flac");
  assert.equal((await h.request({ ...base, modelId: "ace-step", mode: "music" })).body.audio.url, "/output/ace-step.mp3");
  assert.equal((await h.request({ ...base, modelId: "qwen-tts-other" })).status, 404, "only the exact model uses the dedicated route");
  assert.equal((await h.request({ ...base, providerId: "another-provider" })).status, 404);
  console.log("Qwen-TTS API: speech/music catalog, exact three-mode routing, authenticated delivery, validation, availability and ACL errors passed");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
