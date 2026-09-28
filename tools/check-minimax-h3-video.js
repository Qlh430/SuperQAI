const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const server = require("./server-source").readServerSource();
const providerCatalogService = fs.readFileSync(path.join(ROOT, "provider-catalog-service.js"), "utf8");
const providerCatalogHttpApi = fs.readFileSync(path.join(ROOT, "provider-catalog-http-api.js"), "utf8");
const minimaxH3TaskService = fs.readFileSync(path.join(ROOT, "minimax-h3-task-service.js"), "utf8");
const comfyClient = fs.readFileSync(path.join(ROOT, "comfyui-client.js"), "utf8");
const apiVideoTaskService = fs.readFileSync(path.join(ROOT, "api-video-task-service.js"), "utf8");
const apiVideoHttpService = fs.readFileSync(path.join(ROOT, "api-video-http-service.js"), "utf8");
const mediaHttpApi = fs.readFileSync(path.join(ROOT, "media-http-api.js"), "utf8");
const mediaGenerationHttpApi = fs.readFileSync(path.join(ROOT, "media-generation-http-api.js"), "utf8");
const mediaFileService = fs.readFileSync(path.join(ROOT, "media-file-service.js"), "utf8");
const script = fs.readFileSync(path.join(ROOT, "script.js"), "utf8");
const h3NodeRenderer = fs.readFileSync(path.join(ROOT, "canvas-h3-node-renderer.js"), "utf8");
// Canvas node markup lives in the node's own renderer component, while
// script.js keeps only the compatibility wrappers and shared plumbing. DOM
// contracts therefore have to read both surfaces.
const canvasSurface = `${script}\n${h3NodeRenderer}`;
const styles = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
const bendo = fs.readFileSync(path.join(ROOT, "canvas-bendo.css"), "utf8");
const scriptRule = fs.readFileSync(path.join(ROOT, "image-resolution-rules.js"), "utf8");
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

assert.match(mediaGenerationHttpApi, /"\/api\/minimax-h3-video"/);
assert.match(server, /createMinimaxH3TaskService\(/);
assert.match(server, /getMinimaxH3TaskService\(\)\.executeComfyVideoProvider/);
assert.match(server, /getMinimaxH3TaskService\(\)\.handleVideoRequest/);
assert.doesNotMatch(server, /async function runMinimaxH3VideoTask/);
assert.doesNotMatch(server, /async function uploadMediaReferenceToComfy/);
assert.match(minimaxH3TaskService, /async function runTask/);
assert.match(minimaxH3TaskService, /async function executeComfyVideoProvider/);
assert.match(minimaxH3TaskService, /async function uploadMediaReferenceToComfy/);
assert.match(minimaxH3TaskService, /comfyClient\.uploadFile/);
assert.match(minimaxH3TaskService, /comfyClient\.saveHistoryVideos/);
assert.match(server, /inspectHistory: inspectComfyHistory/);
assert.match(comfyClient, /const inspection = inspectHistory\(history\)/);
assert.match(comfyClient, /if \(inspection\.state === "error"\) throw new Error\(inspection\.message\)/);
assert.match(comfyClient, /if \(inspection\.state === "success"\) return history/);
assert.match(apiVideoHttpService, /videos:\s*\[\]/);
assert.match(mediaFileService, /"\.mp4":\s*"video\/mp4"/);
assert.match(mediaFileService, /"\.wav":\s*"audio\/wav"/);
assert.match(mediaFileService, /audio\/mp4[\s\S]{0,120}return "m4a"/);
assert.match(server, /require\("\.\/media-file-service"\)/);
assert.doesNotMatch(server, /runMinimaxH3VideoTask\(taskId, \{[^}]*payload\.comfy_url/);
assert.match(apiVideoHttpService, /mediaProviderBridge\.generateVideo\(/);
assert.match(minimaxH3TaskService, /runTask\(taskId, \{ \.\.\.normalized, comfyUrl: provider\.baseUrl \}\)/);
assert.match(mediaFileService, /Reference \$\{kind\} must be a data URL or \/output URL\./);
assert.match(server, /MAX_UPLOAD_CHUNKS/);
assert.match(mediaHttpApi, /getUploadChunkState/);
assert.match(mediaHttpApi, /cleanupAbandonedUploads/);
assert.match(mediaHttpApi, /total > chunkLimit/);
assert.match(mediaHttpApi, /state\.totalBytes > requestLimit/);
assert.match(server, /const MAX_MEDIA_UPLOAD_BYTES/);
assert.match(mediaHttpApi, /async function handleMediaChunkUpload[\s\S]{0,2200}state\.totalBytes > mediaLimit/);
assert.match(envExample, /^MAX_MEDIA_UPLOAD_MB=800$/m);
assert.match(comfyClient, /fetchJsonWithTimeout\([\s\S]{0,120}\/upload\/image[\s\S]{0,180}uploadTimeoutMs/);
assert.match(comfyClient, /fetchJsonWithTimeout\([\s\S]{0,160}\/prompt[\s\S]{0,240}promptTimeoutMs/);
assert.match(comfyClient, /fetchBufferWithTimeout\(viewUrl\(comfyUrl, video\), \{\}, downloadTimeoutMs\)/);
assert.match(comfyClient, /async function fetchJsonWithTimeout/);
assert.match(mediaFileService, /async function fetchBufferResponseWithTimeout/);

[
  // The three separate import entries collapsed into one material node, and the
  // video output card into the material collection. The legacy nodes stay
  // restorable, only their create-menu entries are gone.
  'data-canvas-node="asset"',
  'data-canvas-node="image-generator"',
  'data-canvas-node="video-generator"',
  'data-canvas-node="asset-collection"',
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
].forEach((needle) => assert.ok(canvasSurface.includes(needle), `Missing canvas contract: ${needle}`));

[
  'data-canvas-node="video"',
  'data-canvas-node="audio"',
  'data-canvas-node="video-output"',
  'data-canvas-node="gallery"',
  'data-canvas-node="generator"',
  'data-canvas-node="comfy"',
  'data-canvas-node="minimax-h3"',
  'data-canvas-node="video-api"',
].forEach((needle) => assert.ok(!script.includes(needle), `Retired canvas menu entry still reachable: ${needle}`));

[
  '["1:1", "1:1 方形"]',
  '["2:3", "2:3 竖版照片"]',
  '["3:2", "3:2 横版照片"]',
  '["3:4", "3:4 标准竖版"]',
  '["4:3", "4:3 标准横版"]',
  '["9:16", "9:16 竖屏"]',
  '["16:9", "16:9 横屏"]',
  '["21:9", "21:9 超宽屏"]',
  "标准",
  "高清",
  "快速 · 4 步",
  "高质量 · 8 步",
  "function calculateCanvasH3Resolution",
  "canvas-h3-resolution-hint",
].forEach((needle) => assert.ok(canvasSurface.includes(needle), `Missing H3 quality control: ${needle}`));
assert.match(canvasSurface, /steps:\s*Number\(node\.dataset\.minimaxH3Steps/);

assert.match(canvasSurface, /accept=\"video\/\*\"/);
assert.match(canvasSurface, /accept=\"audio\/\*\"/);
assert.ok(canvasSurface.includes("function getCanvasH3ConnectionCapacity"));
assert.ok(canvasSurface.includes("function remapCanvasH3ReferenceOrder"));
assert.match(canvasSurface, /minimaxH3ImageOrder = JSON\.stringify\(remapCanvasH3ReferenceOrder/);
assert.match(canvasSurface, /refs\.images\.length > 9/);
assert.match(canvasSurface, /refs\.videos\.length > 3/);
assert.match(canvasSurface, /refs\.audios\.length > 3/);
assert.doesNotMatch(canvasSurface, /refs\.images\.slice\(0,\s*9\)/);
assert.doesNotMatch(canvasSurface, /refs\.videos\.slice\(0,\s*3\)/);
assert.doesNotMatch(canvasSurface, /refs\.audios\.slice\(0,\s*3\)/);
assert.match(canvasSurface, /fetch\(MINIMAX_H3_VIDEO_API_URL/);
assert.match(canvasSurface, /task\.videos/);
assert.doesNotMatch(canvasSurface, /setCanvasH3Status\(node, "至少连接一项参考素材"/);
assert.match(canvasSurface, /输入描述即可生成，参考素材可选/);
[
  "function getCanvasH3MentionItems",
  "function getCanvasH3MentionTrigger",
  "function validateCanvasH3PromptReferences",
  "function openCanvasH3MentionMenu",
  "function closeCanvasH3MentionMenu",
].forEach((needle) => assert.ok(canvasSurface.includes(needle), `Missing H3 mention contract: ${needle}`));
assert.match(styles, /\.canvas-node-minimax-h3/);
assert.match(styles, /\.canvas-h3-reference-collection/);
assert.match(styles, /\.canvas-h3-mention-menu/);
assert.match(styles, /\.canvas-h3-mention-option\.is-active/);
assert.match(styles, /\.canvas-h3-mention-option\[aria-disabled="true"\]/);
assert.match(styles, /\.canvas-h3-resolution-hint/);
assert.match(styles, /\.canvas-node-video-output/);

// The API video node reuses the H3 canvas plumbing but talks to the provider
// bridge instead of ComfyUI, so both the catalog and the generate route have to
// stay reachable from the canvas.
assert.match(providerCatalogHttpApi, /GET[\s\S]*\/api\/video-models/);
assert.match(mediaGenerationHttpApi, /"\/api\/videos"/);
assert.match(providerCatalogHttpApi, /function sendProviderVideoModelCatalog/);
assert.match(providerCatalogService, /catalogVideoPresentation/);
// The catalog entry has to carry the transport identity, otherwise a CLI model
// is not recognised as 即梦 and loses its ratio/resolution/duration ladder.
assert.match(providerCatalogService, /capability === "video\.generate" \? \{[\s\S]{0,240}?providerProtocol: model\.providerProtocol[\s\S]{0,240}?modelProtocol: model\.modelProtocol/);
assert.match(providerCatalogService, /capability === "video\.generate" \? catalogVideoPresentation\(model, imageResolutionRules\)/);
// Durations come from the CLI ladder: 2.5 reaches 30s, the earlier build stops at 15s.
assert.match(providerCatalogService, /imageResolutionRules\.videoDurationRangeFor\(modelId\)/);
// The canvas re-reads the ladder with the reference flag so a connected first
// frame narrows the window for the models that need it.
assert.match(script, /function getCanvasApiVideoDurationRange[\s\S]{0,1000}?hasReference: true/);
assert.match(script, /function getCanvasApiVideoDurationRange[\s\S]{0,1000}?getApiVideoModelPlatform\(modelId\) === "jimeng"/);
assert.match(scriptRule, /JIMENG_VIDEO_REFERENCE_DURATIONS/);
assert.match(mediaFileService, /function isVideoMediaUrl/);
assert.match(mediaFileService, /async function saveRemoteVideo/);
assert.match(apiVideoTaskService, /async function runTask/);
assert.match(apiVideoHttpService, /async function handleSubmit/);
assert.match(apiVideoTaskService, /registerVideoOutput\(context\.userId, url\)/);
assert.match(server, /assetLibrary\.registerMedia\(userId,[\s\S]{0,120}"video\/mp4"/);
// Videos arrive through the same media walker as images, so the poll loop has to
// filter by extension or a poster frame would be saved as the clip.
assert.match(apiVideoHttpService, /filter\(isVideoMediaUrl\)/);
assert.match(apiVideoHttpService, /type: "api-video"/);
// The resumable poll must not re-submit the prompt on every attempt.
assert.match(apiVideoTaskService, /resumeTask: context\.resumeTask/);

[
  'data-canvas-node="video-generator"',
  "function addCanvasApiVideoNode",
  "function renderCanvasApiVideoNode",
  "function runCanvasApiVideoNode",
  "function waitForCanvasApiVideoTask",
  "function getCanvasApiVideoConnectionCapacity",
  "function loadVideoModels",
  "function refreshCanvasApiVideoModelSelects",
  "apiVideoPrompt",
  "apiVideoModel",
  "apiVideoRatio",
  "apiVideoResolution",
  "apiVideoDuration",
  "canvas-api-video-run",
  "canvas-node-video-api",
].forEach((needle) => assert.ok(script.includes(needle), `Missing API video canvas contract: ${needle}`));

// The node picker shows the platform beside the model, and the model id itself
// stays exactly as the provider listed it.
assert.match(script, /VIDEO_MODELS_API_URL = "\/api\/video-models"/);
assert.match(script, /API_VIDEO_API_URL = "\/api\/videos"/);
assert.match(script, /output\.type === "video-generator"[\s\S]{0,200}canvas-node-video-output/);
assert.match(script, /function getCanvasNodeOutput[\s\S]*canvas-node-video-api[\s\S]{0,120}type: "video-generator"/);
// A single first frame keeps the reference contract honest instead of silently
// dropping the extras.
assert.match(script, /首帧参考最多 1 张/);

// The node renders in both stylesheets: the shared canvas sheet owns layout and
// the BENDO sheet owns the node's control grid.
assert.match(styles, /\.canvas-node-video-api/);
assert.match(styles, /\.canvas-api-video-prompt/);
assert.match(bendo, /\.canvas-node-video-api/);
assert.match(bendo, /\.canvas-api-video-controls/);
assert.match(bendo, /\.canvas-api-video-prompt/);
assert.match(bendo, /\.canvas-api-video-reference/);

console.log("MiniMax H3 canvas video checks passed");
