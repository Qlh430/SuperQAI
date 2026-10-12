const path = require("node:path");

const LIMITS = Object.freeze({ images: 9, videos: 3, audios: 3 });
// 四种生成方式：全能参考走多样参考工作流，其余三种走文/图/首尾帧工作流。
const H3_MODES = Object.freeze(["reference", "text", "first", "last"]);
const H3_REFERENCE_WORKFLOW_NAME = "minimax-h3-video.json";
const H3_FRAMES_WORKFLOW_NAME = "minimax-h3-video-frames.json";
const H3_FRAMES_NODE_CLASS = "MiniMaxH3ImageToVideo";

function normalizeMinimaxH3Mode(value) {
  return H3_MODES.includes(String(value || "")) ? String(value) : "reference";
}

function minimaxH3ModeLimits(mode) {
  const normalized = normalizeMinimaxH3Mode(mode);
  if (normalized === "reference") return LIMITS;
  if (normalized === "last") return { images: 2, videos: 0, audios: 0 };
  if (normalized === "first") return { images: 1, videos: 0, audios: 0 };
  return { images: 0, videos: 0, audios: 0 };
}

function minimaxH3ModeUsesReferenceWorkflow(mode) {
  return normalizeMinimaxH3Mode(mode) === "reference";
}

const ASPECT_RATIOS = Object.freeze({
  "1:1": "1:1 (Square)",
  "2:3": "2:3 (Portrait Photo)",
  "3:2": "3:2 (Photo)",
  "3:4": "3:4 (Portrait Standard)",
  "4:3": "4:3 (Standard)",
  "9:16": "9:16 (Portrait Widescreen)",
  "16:9": "16:9 (Widescreen)",
  "21:9": "21:9 (Ultrawide)",
});

function normalizeMinimaxH3Request(value = {}) {
  const prompt = String(value.prompt || "").trim();
  if (!prompt) throw new Error("MiniMax H3 prompt is required.");

  const mode = normalizeMinimaxH3Mode(value.mode);
  const limits = minimaxH3ModeLimits(mode);
  // 素材按生成方式裁剪：首帧只取第一张图，首尾帧取前两张，文生视频忽略素材。
  const images = normalizeReferences(value.images, "image").slice(0, limits.images);
  const videos = normalizeReferences(value.videos, "video").slice(0, limits.videos);
  const audios = normalizeReferences(value.audios, "audio").slice(0, limits.audios);
  if (images.length > LIMITS.images) throw new Error("MiniMax H3 accepts at most 9 images.");
  if (videos.length > LIMITS.videos) throw new Error("MiniMax H3 accepts at most 3 videos.");
  if (audios.length > LIMITS.audios) throw new Error("MiniMax H3 accepts at most 3 audio clips.");
  // <Picture n> 一类的引用标记只属于全能参考工作流；其余三种方式提示词按原样提交。
  const selected = minimaxH3ModeUsesReferenceWorkflow(mode)
    ? selectPromptReferences(prompt, { images, videos, audios })
    : { prompt, images, videos, audios };

  const aspectRatio = Object.hasOwn(ASPECT_RATIOS, value.aspect_ratio) ? value.aspect_ratio : "16:9";
  const megapixels = Number(value.megapixels) === 1 ? 1 : 0.6;
  const steps = Number(value.steps) === 8 ? 8 : 4;
  const rawDuration = Number(value.duration);
  const duration = Math.max(5, Math.min(15, Number.isFinite(rawDuration) ? rawDuration : 12));
  const refImageSize = value.ref_image_size === "max" ? "max" : "match";
  const rawSeed = value.seed === "" || value.seed === null || value.seed === undefined ? null : Number(value.seed);
  const seed = Number.isSafeInteger(rawSeed) && rawSeed >= 0 ? rawSeed : null;

  return {
    mode,
    prompt: selected.prompt,
    aspectRatio,
    megapixels,
    steps,
    duration,
    refImageSize,
    seed,
    images: selected.images,
    videos: selected.videos,
    audios: selected.audios,
  };
}

function normalizeReferences(value, kind) {
  return (Array.isArray(value) ? value : [])
    .map((item, index) => {
      const url = typeof item === "string" ? item : String(item?.url || item?.src || "");
      if (!url) return null;
      const providedName = typeof item === "object" ? String(item.name || "") : "";
      return {
        url,
        name: providedName || `${kind}_${index + 1}${defaultExtension(kind)}`,
      };
    })
    .filter(Boolean);
}

function defaultExtension(kind) {
  if (kind === "video") return ".mp4";
  if (kind === "audio") return ".wav";
  return ".png";
}

function selectPromptReferences(prompt, references) {
  const groups = [
    ["Picture", "images"],
    ["Video", "videos"],
    ["Audio", "audios"],
  ];
  const selected = { images: [], videos: [], audios: [] };
  const internalPrompt = String(prompt || "");
  const missingTags = [];

  groups.forEach(([promptType, collection]) => {
    const source = references[collection] || [];
    const expression = `<${promptType}\\s+(\\d+)>`;
    const seen = new Set();

    for (const match of internalPrompt.matchAll(new RegExp(expression, "g"))) {
      const sourceIndex = Number(match[1]) - 1;
      if (!Number.isSafeInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= source.length) {
        throw new Error(`MiniMax H3 prompt reference ${match[0]} does not match a connected material.`);
      }
      seen.add(sourceIndex);
    }

    // Connected materials are references even when the user has not typed tags.
    // Keep their order so an explicit Picture 3 still means the third image.
    selected[collection] = source;
    source.forEach((item, index) => {
      if (!seen.has(index)) missingTags.push(`<${promptType} ${index + 1}>`);
    });
  });

  return {
    prompt: missingTags.length ? `参考素材：${missingTags.join("、")}。\n\n${internalPrompt}` : internalPrompt,
    ...selected,
  };
}

// Workflows get re-saved and re-wired between ComfyUI versions, so node numbers
// move. Locate every parameter carrier by the class and input it must expose,
// preferring the historical id when it still matches.
const H3_NODE_CLASS = "MiniMaxH3ReferenceToVideo";
const REFERENCE_CLASSES = Object.freeze(["LoadImage", "LoadVideo", "LoadAudio", "GetVideoComponents"]);

function workflowNodeMatches(node, classTypes, requiredInputs = []) {
  if (!node?.inputs || typeof node.inputs !== "object") return false;
  if (classTypes.length && !classTypes.includes(String(node.class_type || ""))) return false;
  return requiredInputs.every((key) => Object.hasOwn(node.inputs, key));
}

function findWorkflowNode(workflow, { ids = [], classTypes = [], inputs = [] } = {}) {
  for (const id of ids) {
    if (workflowNodeMatches(workflow[id], classTypes, inputs)) return id;
  }
  return Object.keys(workflow).find((id) => workflowNodeMatches(workflow[id], classTypes, inputs)) || "";
}

function prepareMinimaxH3Workflow(template, request, outputPrefix) {
  if (!minimaxH3ModeUsesReferenceWorkflow(request?.mode)) {
    return prepareMinimaxH3FramesWorkflow(template, request, outputPrefix);
  }
  const workflow = JSON.parse(JSON.stringify(template || {}));
  const h3Id = findWorkflowNode(workflow, { ids: ["222"], classTypes: [H3_NODE_CLASS], inputs: ["prompt"] });
  const h3 = workflow[h3Id];
  if (!h3) throw new Error(`MiniMax H3 workflow node ${H3_NODE_CLASS} is missing.`);

  removeTemplateReferenceNodes(workflow, h3Id);
  Object.keys(h3.inputs).forEach((key) => {
    if (/^ref_(images|videos|video_audios|audios)\./.test(key)) delete h3.inputs[key];
  });

  let nextNodeId = 3000;
  request.images.forEach((item, index) => {
    const id = String(nextNodeId++);
    workflow[id] = {
      inputs: { image: item.name },
      class_type: "LoadImage",
      _meta: { title: `H3 reference image ${index + 1}` },
    };
    h3.inputs[`ref_images.ref_image_${index}`] = [id, 0];
  });

  request.videos.forEach((item, index) => {
    const loadId = String(nextNodeId++);
    const splitId = String(nextNodeId++);
    workflow[loadId] = {
      inputs: { file: item.name },
      class_type: "LoadVideo",
      _meta: { title: `H3 reference video ${index + 1}` },
    };
    workflow[splitId] = {
      inputs: { video: [loadId, 0] },
      class_type: "GetVideoComponents",
      _meta: { title: `H3 reference video components ${index + 1}` },
    };
    h3.inputs[`ref_videos.ref_video_${index}`] = [splitId, 0];
    h3.inputs[`ref_video_audios.ref_video_audio_${index}`] = [splitId, 1];
  });

  request.audios.forEach((item, index) => {
    const id = String(nextNodeId++);
    workflow[id] = {
      inputs: { audio: item.name },
      class_type: "LoadAudio",
      _meta: { title: `H3 reference audio ${index + 1}` },
    };
    h3.inputs[`ref_audios.ref_audio_${index}`] = [id, 0];
  });

  // Older graphs carry a CR Text node; the newer 8-step graph feeds the prompt
  // straight into the H3 node.
  const promptId = findWorkflowNode(workflow, { ids: ["238"], classTypes: ["CR Text"], inputs: ["text"] });
  if (promptId) workflow[promptId].inputs.text = request.prompt;
  else h3.inputs.prompt = request.prompt;
  h3.inputs.ref_image_size = request.refImageSize;
  const resolutionId = findWorkflowNode(workflow, { ids: ["229"], classTypes: ["ResolutionSelector"], inputs: ["aspect_ratio", "megapixels"] });
  if (resolutionId) {
    const resolution = workflow[resolutionId].inputs;
    resolution.aspect_ratio = ASPECT_RATIOS[request.aspectRatio] || ASPECT_RATIOS["16:9"];
    resolution.megapixels = request.megapixels;
    resolution.multiple = 32;
  }
  // The sampler that owns the step count differs between graphs: BasicScheduler
  // in the older one, MiniMaxH3DualClockSamplerT8 in the 8-step one.
  const stepsId = findWorkflowNode(workflow, { ids: ["219"], classTypes: ["BasicScheduler"], inputs: ["steps"] })
    || findWorkflowNode(workflow, { inputs: ["steps"] });
  if (stepsId) workflow[stepsId].inputs.steps = request.steps;
  const durationId = findWorkflowNode(workflow, { ids: ["225"], classTypes: ["PrimitiveFloat"], inputs: ["value"] });
  if (durationId) workflow[durationId].inputs.value = request.duration;
  const seedId = findWorkflowNode(workflow, { ids: ["210"], classTypes: ["RandomNoise"], inputs: ["noise_seed"] });
  if (seedId) workflow[seedId].inputs.noise_seed = request.seed;
  const saveId = findWorkflowNode(workflow, { ids: ["230"], classTypes: ["SaveVideo"], inputs: ["filename_prefix"] });
  if (saveId) workflow[saveId].inputs.filename_prefix = outputPrefix;
  return workflow;
}

// 文生视频 / 首帧 / 首尾帧共用「文/图/首尾帧生视频」模板：
// 文生视频不接帧，首帧只接 first_frame，首尾帧再接 last_frame。
function prepareMinimaxH3FramesWorkflow(template, request, outputPrefix) {
  const workflow = JSON.parse(JSON.stringify(template || {}));
  const nodeId = findWorkflowNode(workflow, { ids: ["445"], classTypes: [H3_FRAMES_NODE_CLASS], inputs: ["prompt"] });
  const node = workflow[nodeId];
  if (!node) throw new Error(`MiniMax H3 首尾帧工作流缺少 ${H3_FRAMES_NODE_CLASS} 节点。`);

  const mode = normalizeMinimaxH3Mode(request?.mode);
  const frames = mode === "last" ? request.images.slice(0, 2) : mode === "first" ? request.images.slice(0, 1) : [];
  // 模板自带的帧加载节点先清掉，再挂上本次提交的帧素材。
  removeTemplateReferenceNodes(workflow, nodeId);
  let nextNodeId = 3000;
  const wireFrame = (inputName, item) => {
    if (!item) {
      delete node.inputs[inputName];
      return;
    }
    const id = String(nextNodeId++);
    workflow[id] = {
      inputs: { image: item.name },
      class_type: "LoadImage",
      _meta: { title: inputName === "first_frame" ? "H3 首帧参考" : "H3 尾帧参考" },
    };
    node.inputs[inputName] = [id, 0];
  };
  wireFrame("first_frame", frames[0]);
  wireFrame("last_frame", frames[1]);

  node.inputs.prompt = request.prompt;
  const resolutionId = findWorkflowNode(workflow, { ids: ["441"], classTypes: ["ResolutionSelector"], inputs: ["aspect_ratio", "megapixels"] });
  if (resolutionId) {
    const resolution = workflow[resolutionId].inputs;
    resolution.aspect_ratio = ASPECT_RATIOS[request.aspectRatio] || ASPECT_RATIOS["16:9"];
    resolution.megapixels = request.megapixels;
    resolution.multiple = 32;
  }
  const stepsId = findWorkflowNode(workflow, { ids: ["448"], classTypes: ["MiniMaxH3DualClockSamplerT8"], inputs: ["steps"] })
    || findWorkflowNode(workflow, { inputs: ["steps"] });
  if (stepsId) workflow[stepsId].inputs.steps = request.steps;
  const durationId = findWorkflowNode(workflow, { ids: ["434"], classTypes: ["PrimitiveFloat"], inputs: ["value"] });
  if (durationId) workflow[durationId].inputs.value = request.duration;
  const seedId = findWorkflowNode(workflow, { ids: ["444"], classTypes: ["RandomNoise"], inputs: ["noise_seed"] });
  if (seedId) workflow[seedId].inputs.noise_seed = request.seed;
  const saveId = findWorkflowNode(workflow, { ids: ["428"], classTypes: ["SaveVideo"], inputs: ["filename_prefix"] });
  if (saveId) workflow[saveId].inputs.filename_prefix = outputPrefix;
  return workflow;
}

// Template reference loaders are replaced by the ones built from the request.
// Drop only the loaders nothing else in the pipeline consumes, so a workflow
// that feeds an image somewhere else keeps its wiring.
function removeTemplateReferenceNodes(workflow, h3Id) {
  const consumed = new Set();
  Object.entries(workflow).forEach(([id, node]) => {
    if (id === h3Id) return;
    if (REFERENCE_CLASSES.includes(String(node?.class_type || ""))) return;
    Object.values(node?.inputs || {}).forEach((value) => {
      if (Array.isArray(value) && value.length) consumed.add(String(value[0]));
    });
  });
  Object.entries(workflow).forEach(([id, node]) => {
    if (id === h3Id) return;
    if (!REFERENCE_CLASSES.includes(String(node?.class_type || ""))) return;
    if (!consumed.has(id)) delete workflow[id];
  });
}

function collectComfyVideoOutputs(history, preferredOutputIds = []) {
  const outputs = history?.outputs || {};
  const preferred = [];
  preferredOutputIds.forEach((id) => collectVideoEntries(outputs[id], preferred));
  if (preferredOutputIds.length) return uniqueEntries(preferred);

  const fallback = [];
  Object.values(outputs).forEach((output) => collectVideoEntries(output, fallback));
  return uniqueEntries(fallback);
}

function inspectComfyHistory(history) {
  const status = history?.status || {};
  const messages = Array.isArray(status.messages) ? status.messages : [];
  const errorEntry = [...messages].reverse().find((entry) => entry?.[0] === "execution_error");
  if (errorEntry) {
    const detail = errorEntry[1] || {};
    const node = formatComfyNode(detail);
    const reason = String(detail.exception_message || detail.exception_type || detail.error || "未知错误").trim();
    return { state: "error", message: `ComfyUI${node}执行失败：${reason}` };
  }

  const interruptedEntry = [...messages].reverse().find((entry) => entry?.[0] === "execution_interrupted");
  if (interruptedEntry) {
    return { state: "error", message: `ComfyUI 任务${formatComfyNode(interruptedEntry[1] || {}, "在")}被中断。` };
  }

  const statusText = String(status.status_str || "").toLowerCase();
  if (["error", "failed", "interrupted"].includes(statusText)) {
    return { state: "error", message: `ComfyUI 任务失败（状态：${statusText}）。` };
  }

  const hasSuccessMessage = messages.some((entry) => entry?.[0] === "execution_success");
  const hasOutputs = Object.keys(history?.outputs || {}).length > 0;
  if (status.completed === true || statusText === "success" || hasSuccessMessage || hasOutputs) {
    return { state: "success", message: "" };
  }
  return { state: "pending", message: "" };
}

function formatComfyNode(detail, prefix = " 节点 ") {
  const nodeId = String(detail?.node_id || "").trim();
  const nodeType = String(detail?.node_type || "").trim();
  if (!nodeId && !nodeType) return " ";
  const label = [nodeId, nodeType ? `（${nodeType}）` : ""].join("");
  return `${prefix}节点 ${label}`.replace("节点 节点 ", "节点 ");
}

function collectVideoEntries(output, target) {
  if (!output) return;
  ["videos", "gifs", "files", "images"].forEach((key) => {
    (Array.isArray(output[key]) ? output[key] : []).forEach((item) => {
      if (item?.filename && isVideoFilename(item.filename)) target.push(item);
    });
  });
  if (output.filename && isVideoFilename(output.filename)) target.push(output);
}

function isVideoFilename(filename) {
  return /\.mp4$/i.test(String(filename || ""));
}

function uniqueEntries(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = [item.filename, item.subfolder || "", item.type || "output"].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sanitizeReferenceName(name, kind, index) {
  const extension = path.extname(String(name || "")) || defaultExtension(kind);
  const base = path.basename(String(name || `${kind}_${index + 1}`), path.extname(String(name || "")))
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "") || `${kind}_${index + 1}`;
  return `${base}${extension.toLowerCase()}`;
}

module.exports = {
  LIMITS,
  H3_MODES,
  H3_REFERENCE_WORKFLOW_NAME,
  H3_FRAMES_WORKFLOW_NAME,
  normalizeMinimaxH3Mode,
  minimaxH3ModeLimits,
  minimaxH3ModeUsesReferenceWorkflow,
  normalizeMinimaxH3Request,
  prepareMinimaxH3Workflow,
  prepareMinimaxH3FramesWorkflow,
  collectComfyVideoOutputs,
  inspectComfyHistory,
  sanitizeReferenceName,
};
