"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { test } = require("node:test");
const servicePath = path.join(__dirname, "design-sources/qwen-tts-task-service.cjs");
const workflow = JSON.parse(fs.readFileSync(path.join(__dirname, "design-sources/workflows/qwen-tts-three-in-one.json"), "utf8"));
function api() {
  assert.ok(fs.existsSync(servicePath), "Qwen-TTS 后端执行器尚未实现");
  return require(servicePath);
}
const branches = {
  clone: { ids: ["7", "157", "184", "188"], text: "157", output: "188" },
  preset: { ids: ["153", "182", "189"], text: "153", output: "189" },
  design: { ids: ["96", "152", "181", "191"], text: "96", output: "191" },
};
const auth = { user: { id: "qwen-test-user" } };
const defaults = { text: "待朗读的文字", speaker: "Vivian", instruct: "温柔且清晰", referenceFilename: "voices/reference.wav" };
function fixture(overrides = {}) {
  const calls = [];
  const audio = { data: Buffer.from("fLaC-qwen-test"), contentType: "audio/flac" };
  const status = { message: "正在生成语音" };
  const history = { outputs: { "188": { audio: [{ filename: "clone.flac" }] }, "189": { audio: [{ filename: "preset.flac" }] }, "191": { audio: [{ filename: "design.flac" }] } } };
  const reference = { blob: new Blob(["reference"], { type: "audio/wav" }), filename: "上传参考.wav" };
  const comfyClient = {
    normalizeUrl: () => "http://comfy.test:8188",
    uploadFile: async (url, file) => { calls.push(["upload", url, file]); return { name: "uploaded.wav", subfolder: "qwen/reference" }; },
    submitPrompt: async (url, prepared) => { calls.push(["submit", url, prepared]); return "qwen-prompt-1"; },
    waitForHistory: async (url, promptId, onStatus) => { calls.push(["history", url, promptId]); onStatus?.(status); return history; },
    downloadHistoryAudio: async (url, result, ids) => { calls.push(["download", url, result, ids]); return audio; },
    ...overrides.comfyClient,
  };
  const service = api().createQwenTtsTaskService({
    workflow, comfyClient,
    readReferenceAudio: overrides.readReferenceAudio || (async (requestAuth, url) => { calls.push(["reference", requestAuth, url]); return reference; }),
    persistAudio: async payload => { calls.push(["persist", payload]); return { url: "/output/qwen-result.flac" }; },
  });
  return { service, calls, audio, status, history, reference };
}

for (const [mode, branch] of Object.entries(branches)) {
  test(`${mode}: only submit the original selected branch and preserve every other source field`, () => {
    const before = structuredClone(workflow);
    const result = api().prepareQwenTtsWorkflow(workflow, { mode, ...defaults });
    const expected = Object.fromEntries(branch.ids.map(id => [id, structuredClone(workflow[id])]));
    expected[branch.text].inputs.text = defaults.text;
    if (mode === "clone") {
      expected["7"].inputs.audio = defaults.referenceFilename;
      expected["184"].inputs.instruct = defaults.instruct;
    } else if (mode === "preset") {
      expected["182"].inputs.speaker = defaults.speaker;
      expected["182"].inputs.instruct = defaults.instruct;
    } else expected["152"].inputs.text = defaults.instruct;
    assert.deepEqual(result, expected);
    assert.deepEqual(workflow, before, "the shared workflow template must remain unchanged");
  });

  test(`${mode}: submit once, poll the same task, download its exact save node and persist with auth`, async () => {
    const { service, calls, audio, status, history, reference } = fixture();
    const statuses = [];
    const result = await service.execute({ mode, text: defaults.text, speaker: defaults.speaker, instruct: defaults.instruct, referenceAudio: "/output/测试参考.wav", auth, onStatus: value => statuses.push(value) });
    assert.deepEqual(result, { url: "/output/qwen-result.flac" });
    assert.deepEqual(calls.map(call => call[0]), mode === "clone" ? ["reference", "upload", "submit", "history", "download", "persist"] : ["submit", "history", "download", "persist"]);
    const submitted = calls.find(call => call[0] === "submit");
    assert.equal(submitted[1], "http://comfy.test:8188");
    assert.deepEqual(Object.keys(submitted[2]), branch.ids);
    assert.deepEqual(calls.find(call => call[0] === "history"), ["history", "http://comfy.test:8188", "qwen-prompt-1"]);
    assert.deepEqual(calls.find(call => call[0] === "download"), ["download", "http://comfy.test:8188", history, [branch.output]]);
    assert.deepEqual(calls.find(call => call[0] === "persist")[1], { ...audio, auth });
    assert.deepEqual(statuses, [status]);
    if (mode === "clone") {
      assert.deepEqual(calls[0], ["reference", auth, "/output/测试参考.wav"]);
      assert.equal(calls[1][2], reference);
      assert.equal(submitted[2]["7"].inputs.audio, "qwen/reference/uploaded.wav");
    }
  });
}

test("preset defaults to Ryan and the exact nine ComfyUI speaker identifiers are accepted", () => {
  const prepare = api().prepareQwenTtsWorkflow;
  assert.equal(prepare(workflow, { mode: "preset", text: "你好" })["182"].inputs.speaker, "Ryan");
  for (const speaker of ["Aiden", "Dylan", "Eric", "Ono_anna", "Ryan", "Serena", "Sohee", "Uncle_fu", "Vivian"]) {
    assert.equal(prepare(workflow, { mode: "preset", text: "你好", speaker })["182"].inputs.speaker, speaker);
  }
  for (const speaker of ["ryan", "Ono Anna", "Uncle Fu", "", "unknown"]) {
    assert.throws(() => prepare(workflow, { mode: "preset", text: "你好", speaker }), /音色/);
  }
});

test("reject invalid modes, empty or oversized text/instructions, missing clone filename and malformed branch before submission", async () => {
  const prepare = api().prepareQwenTtsWorkflow;
  for (const input of [{}, { mode: "other", text: "你好" }, { mode: "preset", text: "  " }, { mode: "preset", text: "字".repeat(4097) }, { mode: "preset", text: "你好", instruct: "字".repeat(4097) }, { mode: "design", text: "你好", instruct: "  " }, { mode: "clone", text: "你好" }]) {
    assert.throws(() => prepare(workflow, input), /模式|文字|文本|描述|参考|4096/);
  }
  const broken = structuredClone(workflow);
  delete broken["189"];
  assert.throws(() => prepare(broken, { mode: "preset", text: "你好" }), /工作流/);
  const wrongType = structuredClone(workflow);
  wrongType["182"].class_type = "OtherNode";
  assert.throws(() => prepare(wrongType, { mode: "preset", text: "你好" }), /工作流/);
  const invalidConnection = structuredClone(workflow);
  invalidConnection["189"].inputs.audio = ["184", 0];
  assert.throws(() => prepare(invalidConnection, { mode: "preset", text: "你好" }), /工作流/);
  assert.equal(prepare(workflow, { mode: "preset", text: "字".repeat(4096), instruct: "字".repeat(4096) })["153"].inputs.text.length, 4096);
  const { service, calls } = fixture();
  await assert.rejects(service.execute({ mode: "design", text: "你好" }), /描述/);
  assert.deepEqual(calls, []);
});

test("clone rejects references outside the host output route before any I/O", async () => {
  const { service, calls } = fixture();
  for (const referenceAudio of [undefined, "", "https://example.test/voice.wav", "http://127.0.0.1:3199/output/a.wav", "file:///a.wav", "data:audio/wav;base64,AA==", "/output/../a.wav", "/output/%2e%2e%2fa.wav", "/output/%252e%252e%252fa.wav", "/output/a.wav?token=test", "/output/a.wav#x", "/output/a.png", { url: "/output/a.wav" }]) {
    await assert.rejects(service.execute({ mode: "clone", text: "你好", referenceAudio, auth }), /参考/);
  }
  assert.deepEqual(calls, []);
});

test("clone validates text before reading reference; permission/read errors prevent upload and submit", async () => {
  const { service, calls } = fixture();
  await assert.rejects(service.execute({ mode: "clone", text: " ", referenceAudio: "/output/a.wav" }), /文字|文本/);
  assert.deepEqual(calls, []);
  const denied = new Error("无权读取参考音频。");
  const blocked = fixture({ readReferenceAudio: async (requestAuth, url) => { assert.equal(requestAuth, auth); assert.equal(url, "/output/a.wav"); throw denied; } });
  await assert.rejects(blocked.service.execute({ mode: "clone", text: "你好", referenceAudio: "/output/a.wav", auth }), error => error.message.includes("无权"));
  assert.deepEqual(blocked.calls, []);
});

test("upload without subfolder maps its filename; invalid upload payload never submits", async () => {
  let prepared;
  const { service } = fixture({ comfyClient: { uploadFile: async () => ({ name: "reference.flac", subfolder: "" }), submitPrompt: async (_url, value) => { prepared = value; return "uploaded-task"; } } });
  await service.execute({ mode: "clone", text: "你好", referenceAudio: "/output/a.flac" });
  assert.equal(prepared["7"].inputs.audio, "reference.flac");
  for (const upload of [{}, { name: "../bad.wav" }, { name: "good.wav", subfolder: "../bad" }]) {
    const failed = fixture({ comfyClient: { uploadFile: async () => upload } });
    await assert.rejects(failed.service.execute({ mode: "clone", text: "你好", referenceAudio: "/output/a.wav" }), /上传|参考/);
    assert.equal(failed.calls.filter(call => call[0] === "submit").length, 0);
  }
});

test("download/history failures never resubmit or persist incomplete audio and include a Chinese error", async () => {
  for (const failingMethod of ["waitForHistory", "downloadHistoryAudio"]) {
    const { service, calls } = fixture({ comfyClient: { [failingMethod]: async () => { throw new Error("network failed"); } } });
    await assert.rejects(service.execute({ mode: "preset", text: "你好" }), /[\u3400-\u9fff]/);
    assert.equal(calls.filter(call => call[0] === "submit").length, 1);
    assert.equal(calls.filter(call => call[0] === "persist").length, 0);
  }
  const empty = fixture({ comfyClient: { downloadHistoryAudio: async () => ({ data: Buffer.alloc(0), contentType: "audio/flac" }) } });
  await assert.rejects(empty.service.execute({ mode: "preset", text: "你好" }), /音频/);
  assert.equal(empty.calls.filter(call => call[0] === "persist").length, 0);
});

test("existing ComfyUI client posts the reference as multipart, polls one prompt and downloads only clone FLAC", async () => {
  const clientPath = path.join(__dirname, "design-sources/comfyui-client.js");
  const clientModule = new Module(clientPath, module);
  clientModule.filename = clientPath;
  clientModule.paths = Module._nodeModulePaths(path.dirname(clientPath));
  clientModule._compile(fs.readFileSync(clientPath, "utf8"), clientPath);
  const requests = [];
  const content = Buffer.from("fLaC-generated-audio");
  const comfyClient = clientModule.exports.createComfyUiClient({
    getDefaultUrl: "http://qwen-fake.test:8188", outputDir: ".", imageReferenceToFile: async () => { throw new Error("unexpected image conversion"); },
    inspectHistory: () => ({ state: "success" }), collectVideoOutputs: () => [], formatErrorMessage: String,
    fetchImpl: async (rawUrl, options = {}) => {
      const url = new URL(rawUrl);
      requests.push(url);
      if (url.pathname === "/upload/image") {
        assert.equal(options.method, "POST");
        const file = options.body.get("image");
        assert.equal(file.name, "参考.wav");
        assert.equal(await file.text(), "reference-audio");
        assert.equal(options.body.get("overwrite"), "true");
        return Response.json({ name: "reference-renamed.wav", subfolder: "qwen-tts" });
      }
      if (url.pathname === "/prompt") {
        const body = JSON.parse(options.body);
        assert.deepEqual(Object.keys(body.prompt), branches.clone.ids);
        assert.equal(body.prompt["7"].inputs.audio, "qwen-tts/reference-renamed.wav");
        assert.equal(body.prompt["184"].inputs.x_vector_only, true);
        assert.equal(body.prompt["188"].inputs.format, "flac");
        return Response.json({ prompt_id: "clone-http-task" });
      }
      if (url.pathname === "/history/clone-http-task") {
        return Response.json({ "clone-http-task": { outputs: { "188": { audio: [{ filename: "clone.flac", subfolder: "audio", type: "output" }] }, "189": { audio: [{ filename: "unrelated.flac", type: "output" }] } } } });
      }
      assert.equal(url.pathname, "/view");
      assert.equal(url.searchParams.get("filename"), "clone.flac");
      assert.equal(url.searchParams.get("subfolder"), "audio");
      assert.equal(url.searchParams.get("type"), "output");
      return new Response(content, { headers: { "content-type": "audio/flac" } });
    },
  });
  let persisted;
  const service = api().createQwenTtsTaskService({
    workflow, comfyClient,
    readReferenceAudio: async (requestAuth, url) => { assert.equal(requestAuth, auth); assert.equal(url, "/output/ref.wav"); return { blob: new Blob(["reference-audio"], { type: "audio/wav" }), filename: "参考.wav" }; },
    persistAudio: async payload => { persisted = payload; return { url: "/output/result.flac" }; },
  });
  await service.execute({ mode: "clone", text: "实际客户端的模拟生成", referenceAudio: "/output/ref.wav", auth });
  assert.deepEqual(requests.map(url => url.pathname), ["/upload/image", "/prompt", "/history/clone-http-task", "/view"]);
  assert.deepEqual(persisted, { data: content, contentType: "audio/flac", auth });
});
