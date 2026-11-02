"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const {
  prepareAceStepWorkflow,
  createAceStepTaskService,
} = require("./design-sources/ace-step-task-service.cjs");
const comfyModulePath = path.join(__dirname, "design-sources/comfyui-client.js");
const comfyModule = new Module(comfyModulePath, module);
comfyModule.filename = comfyModulePath;
comfyModule.paths = Module._nodeModulePaths(path.dirname(comfyModulePath));
comfyModule._compile(fs.readFileSync(comfyModulePath, "utf8"), comfyModulePath);
const { createComfyUiClient } = comfyModule.exports;

function fixture() {
  return {
    "94": { class_type: "TextEncodeAceStepAudio1.5", inputs: { tags: "", lyrics: "", duration: 120, bpm: 95, keyscale: "E minor" } },
    "98": { class_type: "EmptyAceStep1.5LatentAudio", inputs: { seconds: 120, batch_size: 1 } },
    "107": { class_type: "SaveAudioMP3", inputs: { filename_prefix: "audio/ACE_Step1.5_xl_turbo", quality: "V0", audio: ["96", 0] } },
  };
}

const source = fixture();
const bundledWorkflow = JSON.parse(fs.readFileSync(path.join(__dirname, "design-sources/workflows/ace-step-music.json"), "utf8"));
assert.equal(bundledWorkflow["94"].inputs.duration, 120);
assert.equal(bundledWorkflow["94"].inputs.bpm, 95);
assert.equal(bundledWorkflow["94"].inputs.keyscale, "E minor");
assert.equal(prepareAceStepWorkflow(bundledWorkflow, { tags: "器乐", lyrics: "", duration: 120, bpm: 95, keyscale: "E minor" })["98"].inputs.seconds, 120);
const prepared = prepareAceStepWorkflow(source, {
  tags: "氛围电子、温暖、钢琴与弦乐",
  lyrics: "夜色落在窗边",
  duration: 73,
  bpm: 108,
  keyscale: "A minor",
});
assert.equal(prepared["94"].inputs.tags, "氛围电子、温暖、钢琴与弦乐");
assert.equal(prepared["94"].inputs.lyrics, "夜色落在窗边");
assert.equal(prepared["94"].inputs.duration, 73);
assert.equal(prepared["98"].inputs.seconds, 73);
assert.equal(prepared["94"].inputs.bpm, 108);
assert.equal(prepared["94"].inputs.keyscale, "A minor");
assert.equal(source["94"].inputs.tags, "", "必须克隆工作流，不能污染后续生成的模板");

assert.throws(
  () => prepareAceStepWorkflow({ "94": source["94"] }, { tags: "电子", lyrics: "歌词", duration: 60, bpm: 90, keyscale: "C major" }),
  /工作流节点不完整/,
);

const downloadedUrls = [];
const comfyClient = createComfyUiClient({
  getDefaultUrl: "http://127.0.0.1:8188", fetchImpl: async url => {
    downloadedUrls.push(String(url));
    return new Response(Buffer.from("mp3"), { status: 200, headers: { "content-type": "audio/mpeg" } });
  }, imageReferenceToFile: async () => ({}), outputDir: ".", inspectHistory: () => ({ state: "success" }),
  collectVideoOutputs: () => [], formatErrorMessage: value => String(value),
});

(async () => {
  const calls = [];
  const service = createAceStepTaskService({
    workflow: source,
    comfyClient: {
      normalizeUrl: () => "http://127.0.0.1:8188",
      submitPrompt: async (_url, workflow) => { calls.push(["submit", workflow]); return "prompt-1"; },
      waitForHistory: async (_url, promptId) => { calls.push(["history", promptId]); return { outputs: { "107": { audio: [{ filename: "song.mp3", type: "output" }] }, "108": { audio: [{ filename: "unrelated.wav", type: "output" }] } } }; },
      downloadHistoryAudio: async (_url, history, outputIds) => {
        calls.push(["download", outputIds]);
        assert.deepEqual(Object.keys(history.outputs), ["107", "108"]);
        assert.deepEqual(outputIds, ["107"]);
        return { data: Buffer.from("audio"), contentType: "audio/mpeg" };
      },
    },
    persistAudio: async payload => { calls.push(["persist", payload]); return { url: "/output/ace-step.mp3", filename: "ace-step.mp3" }; },
  });
  const auth = { user: { id: "user-1" } };
  const result = await service.execute({ tags: "电子", lyrics: "歌词", duration: 60, bpm: 90, keyscale: "C major", auth });
  assert.equal(result.url, "/output/ace-step.mp3");
  assert.deepEqual(calls.map(call => call[0]), ["submit", "history", "download", "persist"]);
  assert.equal(calls[3][1].auth, auth);
  const audio = await comfyClient.downloadHistoryAudio("http://127.0.0.1:8188", {
    outputs: { "107": { audio: [{ filename: "ace-step.mp3", type: "output" }] }, "108": { audio: [{ filename: "other.wav", type: "output" }] } },
  }, ["107"]);
  assert.equal(audio.contentType, "audio/mpeg");
  assert.equal(audio.data.toString(), "mp3");
  assert.match(downloadedUrls[0], /filename=ace-step\.mp3/);
  await assert.rejects(comfyClient.downloadHistoryAudio("http://127.0.0.1:8188", { outputs: { "107": {}, "108": { audio: [{ filename: "other.wav" }] } } }, ["107"]), /没有输出文件/);
  console.log("ACE-Step workflow mapping and audio delivery passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
