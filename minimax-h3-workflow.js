const path = require("node:path");

const LIMITS = Object.freeze({ images: 9, videos: 3, audios: 3 });
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

  const images = normalizeReferences(value.images, "image");
  const videos = normalizeReferences(value.videos, "video");
  const audios = normalizeReferences(value.audios, "audio");
  if (images.length > LIMITS.images) throw new Error("MiniMax H3 accepts at most 9 images.");
  if (videos.length > LIMITS.videos) throw new Error("MiniMax H3 accepts at most 3 videos.");
  if (audios.length > LIMITS.audios) throw new Error("MiniMax H3 accepts at most 3 audio clips.");
  const selected = selectPromptReferences(prompt, { images, videos, audios });

  const aspectRatio = Object.hasOwn(ASPECT_RATIOS, value.aspect_ratio) ? value.aspect_ratio : "16:9";
  const megapixels = Number(value.megapixels) === 1 ? 1 : 0.6;
  const steps = Number(value.steps) === 8 ? 8 : 4;
  const rawDuration = Number(value.duration);
  const duration = Math.max(5, Math.min(15, Number.isFinite(rawDuration) ? rawDuration : 12));
  const refImageSize = value.ref_image_size === "max" ? "max" : "match";
  const rawSeed = value.seed === "" || value.seed === null || value.seed === undefined ? null : Number(value.seed);
  const seed = Number.isSafeInteger(rawSeed) && rawSeed >= 0 ? rawSeed : null;

  return {
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
  let internalPrompt = String(prompt || "");

  groups.forEach(([promptType, collection]) => {
    const source = references[collection] || [];
    const expression = `<${promptType}\\s+(\\d+)>`;
    const sourceIndexes = [];
    const seen = new Set();

    for (const match of internalPrompt.matchAll(new RegExp(expression, "g"))) {
      const sourceIndex = Number(match[1]) - 1;
      if (!Number.isSafeInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= source.length) {
        throw new Error(`MiniMax H3 prompt reference ${match[0]} does not match a connected material.`);
      }
      if (!seen.has(sourceIndex)) {
        seen.add(sourceIndex);
        sourceIndexes.push(sourceIndex);
      }
    }

    sourceIndexes.sort((left, right) => left - right);
    const remappedIndexes = new Map(sourceIndexes.map((sourceIndex, index) => [sourceIndex, index + 1]));
    selected[collection] = sourceIndexes.map((sourceIndex) => source[sourceIndex]);
    internalPrompt = internalPrompt.replace(new RegExp(expression, "g"), (tag, rawIndex) => (
      `<${promptType} ${remappedIndexes.get(Number(rawIndex) - 1)}>`
    ));
  });

  return { prompt: internalPrompt, ...selected };
}

function prepareMinimaxH3Workflow(template, request, outputPrefix) {
  const workflow = JSON.parse(JSON.stringify(template || {}));
  const h3 = workflow["222"];
  if (!h3?.inputs || h3.class_type !== "MiniMaxH3ReferenceToVideo") {
    throw new Error("MiniMax H3 workflow node 222 is missing.");
  }

  removeTemplateReferenceNodes(workflow);
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

  if (workflow["238"]?.inputs) workflow["238"].inputs.text = request.prompt;
  else h3.inputs.prompt = request.prompt;
  h3.inputs.ref_image_size = request.refImageSize;
  if (workflow["229"]?.inputs) {
    workflow["229"].inputs.aspect_ratio = ASPECT_RATIOS[request.aspectRatio] || ASPECT_RATIOS["16:9"];
    workflow["229"].inputs.megapixels = request.megapixels;
    workflow["229"].inputs.multiple = 32;
  }
  if (workflow["219"]?.inputs) workflow["219"].inputs.steps = request.steps;
  if (workflow["225"]?.inputs) workflow["225"].inputs.value = request.duration;
  if (workflow["210"]?.inputs) workflow["210"].inputs.noise_seed = request.seed;
  if (workflow["230"]?.inputs) workflow["230"].inputs.filename_prefix = outputPrefix;
  return workflow;
}

function removeTemplateReferenceNodes(workflow) {
  ["215", "216", "234", "235", "236", "237"].forEach((id) => delete workflow[id]);
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
  normalizeMinimaxH3Request,
  prepareMinimaxH3Workflow,
  collectComfyVideoOutputs,
  inspectComfyHistory,
  sanitizeReferenceName,
};
