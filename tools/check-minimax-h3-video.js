const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const server = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
const script = fs.readFileSync(path.join(ROOT, "script.js"), "utf8");
const styles = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
const envExample = fs.readFileSync(path.join(ROOT, ".env.example"), "utf8");
const workflowPath = path.join(ROOT, "workflows", "minimax-h3-video.json");
const workflowModulePath = path.join(ROOT, "minimax-h3-workflow.js");

assert.ok(fs.existsSync(workflowPath), "MiniMax H3 API workflow should exist");
assert.ok(fs.existsSync(workflowModulePath), "MiniMax H3 workflow helpers should exist");

const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
assert.equal(workflow["222"]?.class_type, "MiniMaxH3ReferenceToVideo");
assert.equal(workflow["230"]?.class_type, "SaveVideo");
assert.equal(
  workflow["232"]?.inputs?.low_vram,
  false,
  "MiniMaxH3TurboLoRA must provide the required low_vram input",
);

const {
  normalizeMinimaxH3Request,
  prepareMinimaxH3Workflow,
  collectComfyVideoOutputs,
  inspectComfyHistory,
} = require(workflowModulePath);

assert.deepEqual(inspectComfyHistory({
  status: {
    status_str: "running",
    completed: false,
    messages: [["execution_start", { prompt_id: "running-id" }]],
  },
  outputs: {},
}), { state: "pending", message: "" });

assert.deepEqual(inspectComfyHistory({
  status: {
    status_str: "success",
    completed: true,
    messages: [["execution_success", { prompt_id: "success-id" }]],
  },
  outputs: { 230: { videos: [{ filename: "result.mp4", type: "output" }] } },
}), { state: "success", message: "" });

assert.deepEqual(inspectComfyHistory({
  status: {
    status_str: "error",
    completed: false,
    messages: [["execution_error", {
      node_id: "209",
      node_type: "SamplerCustomAdvanced",
      exception_type: "RuntimeError",
      exception_message: "CUDA out of memory",
    }]],
  },
  outputs: {},
}), {
  state: "error",
  message: "ComfyUI 节点 209（SamplerCustomAdvanced）执行失败：CUDA out of memory",
});

assert.deepEqual(inspectComfyHistory({
  status: {
    status_str: "error",
    completed: false,
    messages: [["execution_interrupted", {
      node_id: "209",
      node_type: "SamplerCustomAdvanced",
    }]],
  },
  outputs: {},
}), {
  state: "error",
  message: "ComfyUI 任务在节点 209（SamplerCustomAdvanced）被中断。",
});

const allReferencePrompt = [
  ...Array.from({ length: 9 }, (_, index) => `<Picture ${index + 1}>`),
  ...Array.from({ length: 3 }, (_, index) => `<Video ${index + 1}>`),
  ...Array.from({ length: 3 }, (_, index) => `<Audio ${index + 1}>`),
].join(" ");

assert.deepEqual(
  normalizeMinimaxH3Request({
    prompt: allReferencePrompt,
    aspect_ratio: "9:16",
    megapixels: 1,
    steps: 8,
    duration: 20,
    ref_image_size: "max",
    seed: 42,
    images: Array.from({ length: 9 }, (_, index) => ({ url: `/output/i${index}.png` })),
    videos: Array.from({ length: 3 }, (_, index) => ({ url: `/output/v${index}.mp4` })),
    audios: Array.from({ length: 3 }, (_, index) => ({ url: `/output/a${index}.wav` })),
  }),
  {
    prompt: allReferencePrompt,
    aspectRatio: "9:16",
    megapixels: 1,
    steps: 8,
    duration: 15,
    refImageSize: "max",
    seed: 42,
    images: Array.from({ length: 9 }, (_, index) => ({ url: `/output/i${index}.png`, name: `image_${index + 1}.png` })),
    videos: Array.from({ length: 3 }, (_, index) => ({ url: `/output/v${index}.mp4`, name: `video_${index + 1}.mp4` })),
    audios: Array.from({ length: 3 }, (_, index) => ({ url: `/output/a${index}.wav`, name: `audio_${index + 1}.wav` })),
  },
);

[
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "9:16",
  "16:9",
  "21:9",
].forEach((aspectRatio) => {
  const normalized = normalizeMinimaxH3Request({
    prompt: "Use <Picture 1>",
    aspect_ratio: aspectRatio,
    images: [{ url: "/output/reference.png" }],
  });
  assert.equal(normalized.aspectRatio, aspectRatio, `H3 should preserve ${aspectRatio}`);
});
assert.equal(normalizeMinimaxH3Request({
  prompt: "Use <Picture 1>",
  steps: 99,
  images: [{ url: "/output/reference.png" }],
}).steps, 4);

const filteredReferences = normalizeMinimaxH3Request({
  prompt: "先看 <Picture 3>，再用 <Picture 1>；重复 <Picture 3>；跟随 <Video 2>，听 <Audio 1>。",
  images: [
    { url: "/output/one.png", name: "one.png" },
    { url: "/output/two.png", name: "two.png" },
    { url: "/output/three.png", name: "three.png" },
  ],
  videos: [
    { url: "/output/one.mp4", name: "one.mp4" },
    { url: "/output/two.mp4", name: "two.mp4" },
  ],
  audios: [
    { url: "/output/one.wav", name: "one.wav" },
    { url: "/output/two.wav", name: "two.wav" },
  ],
});
assert.equal(filteredReferences.prompt, "先看 <Picture 2>，再用 <Picture 1>；重复 <Picture 2>；跟随 <Video 1>，听 <Audio 1>。");
assert.deepEqual(filteredReferences.images.map((item) => item.name), ["one.png", "three.png"]);
assert.deepEqual(filteredReferences.videos.map((item) => item.name), ["two.mp4"]);
assert.deepEqual(filteredReferences.audios.map((item) => item.name), ["one.wav"]);

assert.throws(() => normalizeMinimaxH3Request({ prompt: "x", images: Array(10).fill({ url: "x" }) }), /at most 9 images/);
assert.throws(() => normalizeMinimaxH3Request({ prompt: "x", videos: Array(4).fill({ url: "x" }) }), /at most 3 videos/);
assert.throws(() => normalizeMinimaxH3Request({ prompt: "x", audios: Array(4).fill({ url: "x" }) }), /at most 3 audio clips/);
assert.throws(() => normalizeMinimaxH3Request({ prompt: "", images: [{ url: "x" }] }), /prompt is required/);
const textOnlyRequest = normalizeMinimaxH3Request({ prompt: "A cinematic night walk" });
assert.equal(textOnlyRequest.prompt, "A cinematic night walk");
assert.deepEqual(textOnlyRequest.images, []);
assert.deepEqual(textOnlyRequest.videos, []);
assert.deepEqual(textOnlyRequest.audios, []);
const unmentionedReferences = normalizeMinimaxH3Request({
  prompt: "No reference tags in this prompt",
  images: [{ url: "/output/unmentioned.png" }],
  videos: [{ url: "/output/unmentioned.mp4" }],
  audios: [{ url: "/output/unmentioned.wav" }],
});
assert.equal(unmentionedReferences.prompt, "No reference tags in this prompt");
assert.deepEqual(unmentionedReferences.images, []);
assert.deepEqual(unmentionedReferences.videos, []);
assert.deepEqual(unmentionedReferences.audios, []);
assert.throws(() => normalizeMinimaxH3Request({ prompt: "use <Video 2>", videos: [{ url: "x" }] }), /<Video 2> does not match a connected material/);

const prepared = prepareMinimaxH3Workflow(workflow, {
  prompt: "Use <Picture 1>, <Video 1>, and <Audio 1>",
  aspectRatio: "1:1",
  megapixels: 1,
  steps: 8,
  duration: 8,
  refImageSize: "max",
  seed: 123,
  images: [{ name: "one.png" }],
  videos: [{ name: "motion.mp4" }],
  audios: [{ name: "voice.wav" }],
}, "minimax_h3_test");
assert.equal(prepared["222"].inputs["ref_images.ref_image_0"][1], 0);
assert.equal(prepared["222"].inputs["ref_videos.ref_video_0"][1], 0);
assert.equal(prepared["222"].inputs["ref_video_audios.ref_video_audio_0"][1], 1);
assert.equal(prepared["222"].inputs["ref_audios.ref_audio_0"][1], 0);
assert.equal(prepared["222"].inputs.ref_image_size, "max");
assert.equal(prepared["229"].inputs.aspect_ratio, "1:1 (Square)");
assert.equal(prepared["229"].inputs.megapixels, 1);
assert.equal(prepared["219"].inputs.steps, 8);
assert.equal(prepared["225"].inputs.value, 8);
assert.equal(prepared["210"].inputs.noise_seed, 123);
assert.equal(prepared["230"].inputs.filename_prefix, "minimax_h3_test");
const preparedLoadVideo = Object.values(prepared).find((node) => node.class_type === "LoadVideo");
assert.ok(preparedLoadVideo);
assert.equal(preparedLoadVideo.inputs.file, "motion.mp4");
assert.equal(Object.hasOwn(preparedLoadVideo.inputs, "video"), false);
assert.ok(Object.values(prepared).some((node) => node.class_type === "LoadAudio"));
assert.equal(Object.keys(prepared["222"].inputs).filter((key) => key.startsWith("ref_images.")).length, 1);

const preparedTextOnly = prepareMinimaxH3Workflow(workflow, {
  prompt: "A cinematic night walk",
  aspectRatio: "16:9",
  megapixels: 0.6,
  steps: 4,
  duration: 5,
  refImageSize: "match",
  seed: null,
  images: [],
  videos: [],
  audios: [],
}, "minimax_h3_text_only");
const referenceLoaderClasses = new Set(["LoadImage", "LoadVideo", "GetVideoComponents", "LoadAudio"]);
assert.equal(Object.values(preparedTextOnly).some((node) => referenceLoaderClasses.has(node.class_type)), false);
assert.deepEqual(
  Object.keys(preparedTextOnly["222"].inputs).filter((key) => /^ref_(images|videos|video_audios|audios)\./.test(key)),
  [],
);
assert.equal(preparedTextOnly["238"].inputs.text, "A cinematic night walk");

assert.deepEqual(collectComfyVideoOutputs({ outputs: { 230: { videos: [{ filename: "result.mp4", type: "output" }] } } }, ["230"]), [
  { filename: "result.mp4", type: "output" },
]);
assert.deepEqual(collectComfyVideoOutputs({ outputs: { 230: { gifs: [{ filename: "result.webp" }] } } }, ["230"]), []);
assert.deepEqual(collectComfyVideoOutputs({ outputs: { 230: { videos: [{ filename: "result.webm" }] } } }, ["230"]), []);
assert.deepEqual(collectComfyVideoOutputs({ outputs: { 230: { images: [{ filename: "result.mp4", subfolder: "video", type: "output" }] } } }, ["230"]), [
  { filename: "result.mp4", subfolder: "video", type: "output" },
]);
assert.deepEqual(collectComfyVideoOutputs({ outputs: { 229: { images: [{ filename: "unrelated.mp4", type: "output" }] } } }, ["230"]), []);

assert.match(server, /POST[\s\S]*\/api\/minimax-h3-video/);
assert.match(server, /runMinimaxH3VideoTask/);
assert.match(server, /saveComfyHistoryVideos/);
assert.match(server, /inspectComfyHistory/);
assert.match(server, /const inspection = inspectComfyHistory\(history\)/);
assert.match(server, /if \(inspection\.state === "error"\) throw new Error\(inspection\.message\)/);
assert.match(server, /if \(inspection\.state === "success"\) return history/);
assert.match(server, /videos:\s*\[\]/);
assert.match(server, /"\.mp4":\s*"video\/mp4"/);
assert.match(server, /"\.wav":\s*"audio\/wav"/);
assert.match(server, /audio\/mp4[\s\S]{0,120}return "m4a"/);
assert.doesNotMatch(server, /runMinimaxH3VideoTask\(taskId, \{[^}]*payload\.comfy_url/);
assert.match(server, /runMinimaxH3VideoTask\(taskId, \{ \.\.\.normalized, comfyUrl: COMFYUI_URL \}\)/);
assert.match(server, /Reference \$\{kind\} must be a data URL or \/output URL\./);
assert.match(server, /MAX_UPLOAD_CHUNKS/);
assert.match(server, /getUploadChunkState/);
assert.match(server, /cleanupAbandonedUploads/);
assert.match(server, /total > MAX_UPLOAD_CHUNKS/);
assert.match(server, /state\.totalBytes > MAX_REQUEST_BYTES/);
assert.match(server, /const MAX_MEDIA_UPLOAD_BYTES/);
assert.match(server, /async function handleMediaChunkUpload[\s\S]{0,2200}state\.totalBytes > MAX_MEDIA_UPLOAD_BYTES/);
assert.match(envExample, /^MAX_MEDIA_UPLOAD_MB=800$/m);
assert.match(server, /fetchJsonResponseWithTimeout\(`\$\{comfyUrl\}\/upload\/image`[\s\S]{0,180}COMFY_UPLOAD_TIMEOUT_MS/);
assert.match(server, /fetchJsonResponseWithTimeout\(`\$\{comfyUrl\}\/prompt`[\s\S]{0,240}COMFY_PROMPT_TIMEOUT_MS/);
assert.match(server, /fetchBufferResponseWithTimeout\(`\$\{comfyUrl\}\/view\?\$\{params\.toString\(\)\}`[\s\S]{0,180}COMFY_DOWNLOAD_TIMEOUT_MS/);
assert.match(server, /async function fetchJsonResponseWithTimeout/);
assert.match(server, /async function fetchBufferResponseWithTimeout/);

[
  'data-canvas-node="video"',
  'data-canvas-node="audio"',
  'data-canvas-node="minimax-h3"',
  'data-canvas-node="video-output"',
  "function renderCanvasVideoNode",
  "function renderCanvasAudioNode",
  "function renderCanvasMinimaxH3Node",
  "function renderCanvasVideoOutputNode",
  "function getCanvasIncomingMinimaxH3Refs",
  "function runCanvasMinimaxH3Node",
  "function getOrCreateCanvasVideoOutput",
  "minimaxH3Prompt",
  "minimaxH3AspectRatio",
  "minimaxH3Megapixels",
  "minimaxH3Steps",
  "minimaxH3Duration",
  "minimaxH3RefImageSize",
  "minimaxH3Seed",
  "videoSrc",
  "audioSrc",
].forEach((needle) => assert.ok(script.includes(needle), `Missing canvas contract: ${needle}`));

[
  '["1:1", "1:1 方形"]',
  '["2:3", "2:3 竖版照片"]',
  '["3:2", "3:2 横版照片"]',
  '["3:4", "3:4 标准竖版"]',
  '["4:3", "4:3 标准横版"]',
  '["9:16", "9:16 竖屏"]',
  '["16:9", "16:9 横屏"]',
  '["21:9", "21:9 超宽屏"]',
  "快速 · 标准分辨率",
  "高清 · 高分辨率",
  "快速 · 4 步",
  "高质量 · 8 步",
  "function calculateCanvasH3Resolution",
  "canvas-h3-resolution-hint",
].forEach((needle) => assert.ok(script.includes(needle), `Missing H3 quality control: ${needle}`));
assert.match(script, /steps:\s*Number\(node\.dataset\.minimaxH3Steps/);

assert.match(script, /accept=\"video\/\*\"/);
assert.match(script, /accept=\"audio\/\*\"/);
assert.ok(script.includes("function getCanvasH3ConnectionCapacity"));
assert.ok(script.includes("function remapCanvasH3ReferenceOrder"));
assert.match(script, /minimaxH3ImageOrder = JSON\.stringify\(remapCanvasH3ReferenceOrder/);
assert.match(script, /refs\.images\.length > 9/);
assert.match(script, /refs\.videos\.length > 3/);
assert.match(script, /refs\.audios\.length > 3/);
assert.doesNotMatch(script, /refs\.images\.slice\(0,\s*9\)/);
assert.doesNotMatch(script, /refs\.videos\.slice\(0,\s*3\)/);
assert.doesNotMatch(script, /refs\.audios\.slice\(0,\s*3\)/);
assert.match(script, /fetch\(MINIMAX_H3_VIDEO_API_URL/);
assert.match(script, /task\.videos/);
assert.doesNotMatch(script, /setCanvasH3Status\(node, "至少连接一项参考素材"/);
assert.match(script, /输入描述即可生成，参考素材可选/);
[
  "function getCanvasH3MentionItems",
  "function getCanvasH3MentionTrigger",
  "function validateCanvasH3PromptReferences",
  "function openCanvasH3MentionMenu",
  "function closeCanvasH3MentionMenu",
].forEach((needle) => assert.ok(script.includes(needle), `Missing H3 mention contract: ${needle}`));
assert.match(styles, /\.canvas-node-minimax-h3/);
assert.match(styles, /\.canvas-h3-reference-collection/);
assert.match(styles, /\.canvas-h3-mention-menu/);
assert.match(styles, /\.canvas-h3-mention-option\.is-active/);
assert.match(styles, /\.canvas-h3-mention-option\[aria-disabled="true"\]/);
assert.match(styles, /\.canvas-h3-resolution-hint/);
assert.match(styles, /\.canvas-node-video-output/);

console.log("MiniMax H3 canvas video checks passed");
