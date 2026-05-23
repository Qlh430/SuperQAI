const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");

loadEnvFile();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = __dirname;
const OUTPUT_DIR = path.join(__dirname, "output");
const DATA_DIR = path.join(__dirname, "data");
const WORKFLOW_DIR = path.join(__dirname, "workflows");
const UPLOAD_TMP_DIR = path.join(__dirname, "tmp", "uploads");
const UPSCALE_WORKFLOW_FILE = path.join(WORKFLOW_DIR, "TTP-upscale.json");
const UPSCALE2_WORKFLOW_FILE = path.join(WORKFLOW_DIR, "SeedVR2-upscale2.json");
const SHOE_SWAP_WORKFLOW_FILE = path.join(WORKFLOW_DIR, "shoe-swap.json");
const IMAGE_HISTORY_FILE = path.join(DATA_DIR, "image-history.json");
const CHAT_HISTORY_FILE = path.join(DATA_DIR, "chat-history.json");
const CANVAS_BOARDS_FILE = path.join(DATA_DIR, "canvas-boards.json");
const MAX_REQUEST_BYTES = Number(process.env.MAX_REQUEST_MB || 800) * 1024 * 1024;
const API_URL = normalizeApiUrl(process.env.AI_API_URL || "https://api.openai.com/v1/chat/completions");
const API_KEY = process.env.AI_API_KEY || "";
const DEFAULT_MODEL = process.env.AI_MODEL || "gpt-4o-mini";
const GEMINI_API_URL = normalizeApiUrl(process.env.GEMINI_API_URL || "https://ai.t8star.org/v1/chat/completions");
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODELS = parseModels(process.env.GEMINI_MODELS || "", "");
const BAILIAN_API_URL = normalizeApiUrl(process.env.BAILIAN_API_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions");
const BAILIAN_API_KEY = process.env.BAILIAN_API_KEY || "";
const BAILIAN_MODELS = parseModels(process.env.BAILIAN_MODELS || "", "");
const AVAILABLE_MODELS = [...new Set([...parseModels(process.env.AI_MODELS || DEFAULT_MODEL, DEFAULT_MODEL), ...GEMINI_MODELS, ...BAILIAN_MODELS])];
const IMAGE_API_URL = normalizeImageApiUrl(process.env.AI_IMAGE_API_URL || API_URL);
const IMAGE_EDIT_API_URL = normalizeImageEditApiUrl(process.env.AI_IMAGE_EDIT_API_URL || IMAGE_API_URL);
const IMAGE_CHAT_API_URL = normalizeApiUrl(process.env.AI_IMAGE_CHAT_API_URL || "https://ai.t8star.org/v1/chat/completions");
const IMAGE_CHAT_API_KEY = process.env.AI_IMAGE_CHAT_API_KEY || API_KEY;
const IMAGE_DEFAULT_MODEL = process.env.AI_IMAGE_MODEL || "gpt-image-1";
const AVAILABLE_IMAGE_MODELS = parseModels(process.env.AI_IMAGE_MODELS || IMAGE_DEFAULT_MODEL, IMAGE_DEFAULT_MODEL);
const COMFYUI_URL = (process.env.COMFYUI_URL || process.env.COMFYUI_BASE_URL || "http://127.0.0.1:8188").replace(/\/+$/, "");
const UPSCALE_TASKS = new Map();
const SHOE_SWAP_PROMPT = [
  "绝对保留图1的所有内容，包括人物、身体、服装、配饰、发型、背景、构图、动作、光影、色彩、氛围、场景细节，一丝一毫都不能修改、添加、删除，仅执行鞋子替换。",
  "将图2的鞋子自然完整地替换到图1人物的脚部，替换后的鞋子必须贴合图1人物脚部形态、动作角度和透视关系。",
  "替换后的鞋子必须与图1的光源方向、明暗、色调和材质质感匹配，边缘与裤脚、袜子或皮肤过渡自然无痕。",
  "严格按照图1原始画面比例输出高清成品。禁止重绘画面，禁止改变除鞋子以外的任何元素。"
].join("\n\n");

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(WORKFLOW_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_TMP_DIR, { recursive: true });

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/api/models") {
    sendJson(res, 200, {
      defaultModel: DEFAULT_MODEL,
      models: AVAILABLE_MODELS,
    });
    return;
  }

  if (req.method === "GET" && req.url === "/api/image-models") {
    sendJson(res, 200, {
      defaultModel: IMAGE_DEFAULT_MODEL,
      models: AVAILABLE_IMAGE_MODELS,
    });
    return;
  }

  if (req.url === "/api/history/images") {
    await handleHistory(req, res, IMAGE_HISTORY_FILE, 30);
    return;
  }

  if (req.url === "/api/history/chat") {
    await handleHistory(req, res, CHAT_HISTORY_FILE, 50);
    return;
  }

  if (req.url === "/api/canvas/boards") {
    await handleCanvasBoards(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/chat") {
    await handleChat(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/images") {
    await handleImages(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/upload-image") {
    await handleImageUpload(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/upload-image/chunk") {
    await handleImageChunkUpload(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/upscale") {
    await handleUpscale(req, res, "ttp");
    return;
  }

  if (req.method === "POST" && req.url === "/api/upscale2") {
    await handleUpscale(req, res, "seedvr2");
    return;
  }

  if (req.method === "POST" && req.url === "/api/shoe-swap") {
    await handleUpscale(req, res, "shoe-swap");
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/api/upscale/status")) {
    handleUpscaleStatus(req, res);
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`AI API console running at http://localhost:${PORT}`);
  getLanUrls(PORT).forEach((url) => console.log(`LAN access: ${url}`));
});

async function handleChat(req, res) {
  try {
    const payload = await readJson(req);
    const model = payload.model || DEFAULT_MODEL;

    if (!AVAILABLE_MODELS.includes(model)) {
      sendJson(res, 400, { error: "This model is not enabled on this site." });
      return;
    }

    const provider = getChatProvider(model);
    if (!provider.key) {
      sendJson(res, 500, { error: `Server missing API key for model ${model}.` });
      return;
    }

    const upstream = await fetch(provider.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.key}`,
      },
      body: JSON.stringify({
        model,
        messages: payload.messages || [],
        temperature: Number(payload.temperature ?? 0.7),
        max_tokens: Number(payload.max_tokens ?? 1200),
      }),
    });

    const text = await upstream.text();
    const contentType = upstream.headers.get("content-type") || "application/json; charset=utf-8";

    if (upstream.ok && contentType.includes("application/json")) {
      const data = JSON.parse(text || "{}");
      const savedImages = await saveGeneratedImages(data);
      sendJson(res, upstream.status, {
        ...data,
        saved_images: savedImages,
      });
      return;
    }

    res.writeHead(upstream.status, {
      "Content-Type": contentType,
    });
    res.end(text);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

function getChatProvider(model) {
  if (GEMINI_MODELS.includes(model)) return { url: GEMINI_API_URL, key: GEMINI_API_KEY };
  if (BAILIAN_MODELS.includes(model)) return { url: BAILIAN_API_URL, key: BAILIAN_API_KEY };
  return { url: API_URL, key: API_KEY };
}

async function handleImages(req, res) {
  if (!API_KEY) {
    sendJson(res, 500, { error: "Server missing AI_API_KEY environment variable." });
    return;
  }

  try {
    const payload = await readJson(req);
    const model = payload.model || IMAGE_DEFAULT_MODEL;

    if (!AVAILABLE_IMAGE_MODELS.includes(model)) {
      sendJson(res, 400, { error: "This image model is not enabled on this site." });
      return;
    }

    const refs = (payload.reference_images || []).filter((ref) => ref && ref.url);
    const upstream = isImageChatModel(model)
      ? await requestImageChat({ model, prompt: payload.prompt || "", size: payload.size || "1024x1024", n: Number(payload.n || 1), refs })
    : refs.length
        ? await requestImageEdit({ model, prompt: payload.prompt || "", size: payload.size || "1024x1024", quality: payload.quality || "auto", n: Number(payload.n || 1), refs })
        : await requestImageGeneration({ model, prompt: payload.prompt || "", size: payload.size || "1024x1024", quality: payload.quality || "auto", n: Number(payload.n || 1) });

    const text = await upstream.text();
    const contentType = upstream.headers.get("content-type") || "application/json; charset=utf-8";

    if (upstream.ok && contentType.includes("application/json")) {
      const data = JSON.parse(text || "{}");
      if (isImageChatModel(model)) normalizeChatImageResponse(data);
      const savedImages = await saveGeneratedImages(data);
      sendJson(res, upstream.status, {
        ...data,
        saved_images: savedImages,
      });
      return;
    }

    res.writeHead(upstream.status, {
      "Content-Type": contentType,
    });
    res.end(text);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

async function handleImageUpload(req, res) {
  try {
    const contentType = req.headers["content-type"] || "";
    if (contentType.startsWith("image/") || contentType === "application/octet-stream") {
      const buffer = await readBodyBuffer(req);
      const name = decodeHeaderFilename(req.headers["x-file-name"]) || "canvas-image";
      const saved = saveBinaryImage(buffer, name, contentType);
      sendJson(res, 200, saved);
      return;
    }

    if (contentType.includes("multipart/form-data")) {
      const saved = await saveMultipartImage(req);
      sendJson(res, 200, saved);
      return;
    }

    const payload = await readJson(req);
    if (!payload.image) {
      sendJson(res, 400, { error: "Missing image." });
      return;
    }
    const saved = saveDataUrlImage(payload.image, payload.name || "canvas-image");
    sendJson(res, 200, saved);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

function decodeHeaderFilename(value) {
  if (!value) return "";
  try {
    return decodeURIComponent(String(value));
  } catch {
    return String(value);
  }
}

async function saveMultipartImage(req) {
  const buffer = await readBodyBuffer(req);
  const files = parseMultipartFiles(req.headers["content-type"] || "", buffer);
  const image = files.find((file) => file.name === "image" || file.contentType.startsWith("image/"));
  if (!image) throw new Error("Missing image.");
  return saveBinaryImage(image.buffer, image.filename || "canvas-image", image.contentType);
}

async function handleImageChunkUpload(req, res) {
  try {
    const uploadId = safeUploadId(req.headers["x-upload-id"]);
    const index = Number(req.headers["x-chunk-index"]);
    const total = Number(req.headers["x-chunk-total"]);
    const contentType = String(req.headers["x-file-type"] || req.headers["content-type"] || "image/png");
    const filename = decodeHeaderFilename(req.headers["x-file-name"]) || "canvas-image";

    if (!uploadId || !Number.isInteger(index) || !Number.isInteger(total) || index < 0 || total < 1 || index >= total) {
      sendJson(res, 400, { error: "Invalid upload chunk headers." });
      return;
    }

    const chunk = await readBodyBuffer(req);
    const dir = path.join(UPLOAD_TMP_DIR, uploadId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${index}.part`), chunk);

    const done = countUploadedChunks(dir, total) === total;
    if (!done) {
      sendJson(res, 200, { ok: true, received: index + 1, total });
      return;
    }

    const saved = saveChunkedUpload(dir, total, filename, contentType);
    fs.rmSync(dir, { recursive: true, force: true });
    sendJson(res, 200, { ...saved, complete: true });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
}

function safeUploadId(value) {
  const text = String(value || "");
  return /^[a-zA-Z0-9_-]{8,80}$/.test(text) ? text : "";
}

function countUploadedChunks(dir, total) {
  let count = 0;
  for (let index = 0; index < total; index += 1) {
    if (fs.existsSync(path.join(dir, `${index}.part`))) count += 1;
  }
  return count;
}

function saveChunkedUpload(dir, total, name = "image", mimeType = "image/png") {
  const target = buildOutputImagePath(name, mimeType);
  for (let index = 0; index < total; index += 1) {
    const chunkPath = path.join(dir, `${index}.part`);
    if (!fs.existsSync(chunkPath)) throw new Error("Upload chunk is missing.");
    fs.appendFileSync(target.filePath, fs.readFileSync(chunkPath));
  }
  return {
    filename: target.filename,
    url: `/output/${target.filename}`,
  };
}

async function handleUpscale(req, res, workflowType = "ttp") {
  try {
    const workflowFile = getComfyWorkflowFile(workflowType);
    if (!fs.existsSync(workflowFile)) {
      sendJson(res, 500, { error: `${workflowType} workflow file is missing.` });
      return;
    }

    const payload = await readJson(req);
    if (workflowType === "shoe-swap" && (!payload.person_image || !payload.shoe_image)) {
      sendJson(res, 400, { error: "Missing person image or shoe image." });
      return;
    }
    if (workflowType !== "shoe-swap" && !payload.image) {
      sendJson(res, 400, { error: "Missing image." });
      return;
    }

    cleanupUpscaleTasks();
    const taskId = crypto.randomUUID();
    UPSCALE_TASKS.set(taskId, {
      id: taskId,
      status: "queued",
      progress: 5,
      message: "任务已创建，准备提交 ComfyUI...",
      created_at: Date.now(),
      updated_at: Date.now(),
      images: [],
    });

    runUpscaleTask(taskId, { ...payload, workflowType }).catch((error) => {
      updateUpscaleTask(taskId, {
        status: "failed",
        progress: 0,
        message: `放大失败：${formatErrorMessage(error)}`,
        error: formatErrorMessage(error),
      });
    });

    sendJson(res, 202, { task_id: taskId });
  } catch (error) {
    sendJson(res, 500, { error: formatErrorMessage(error) });
  }
}

function getComfyWorkflowFile(workflowType) {
  if (workflowType === "seedvr2") return UPSCALE2_WORKFLOW_FILE;
  if (workflowType === "shoe-swap") return SHOE_SWAP_WORKFLOW_FILE;
  return UPSCALE_WORKFLOW_FILE;
}

function handleUpscaleStatus(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const taskId = url.searchParams.get("id");
    const task = UPSCALE_TASKS.get(taskId);
    if (!task) {
      sendJson(res, 404, { error: "Upscale task was not found." });
      return;
    }
    sendJson(res, 200, task);
  } catch (error) {
    sendJson(res, 500, { error: formatErrorMessage(error) });
  }
}

async function runUpscaleTask(taskId, payload) {
  if (payload.workflowType === "shoe-swap") {
    await runShoeSwapTask(taskId, payload);
    return;
  }

  updateUpscaleTask(taskId, { status: "running", progress: 10, message: "正在上传图片到 ComfyUI..." });
  const comfyUrl = normalizeComfyUrl(payload.comfy_url || COMFYUI_URL);
  const uploaded = await uploadDataUrlToComfy(comfyUrl, payload.image, payload.name || "upscale_input.png");
  const isSeedVr2 = payload.workflowType === "seedvr2";
  const workflowFile = isSeedVr2 ? UPSCALE2_WORKFLOW_FILE : UPSCALE_WORKFLOW_FILE;
  const workflow = JSON.parse(fs.readFileSync(workflowFile, "utf8"));
  const seed = Number(payload.seed || crypto.randomInt(1, 2147483647));
  const requestedResolution = payload.resolution ? Number(payload.resolution) : null;
  const batchSize = Number(payload.batch_size || 5);
  const inputDimensions = getDataUrlImageDimensions(payload.image);

  updateUpscaleTask(taskId, { progress: 20, message: `正在准备 ${isSeedVr2 ? "SeedVR2" : "TTP"} 放大工作流...` });
  if (isSeedVr2 && workflow["80"]?.inputs && workflow["41"]?.inputs) {
    workflow["80"].inputs.image = uploaded.name;
    workflow["41"].inputs.seed = seed;
    if (workflow["26"]?.inputs) workflow["26"].inputs.filename_prefix = `seedvr2_upscale_${Date.now()}`;
  } else if (workflow["10"]?.inputs && workflow["11"]?.inputs) {
    workflow["10"].inputs.image = uploaded.name;
    if (requestedResolution) {
      const modelScale = getUpscaleModelFactor(workflow["12"]?.inputs?.model_name);
      workflow["11"].inputs.scale_to_length = Math.max(64, Math.round(requestedResolution / modelScale));
      workflow["11"].inputs.scale_to_side = getLongSideName(inputDimensions);
    }
    if (workflow["25"]?.inputs) workflow["25"].inputs.seed = seed;
    if (workflow["50"]?.inputs) workflow["50"].inputs.seed = seed;
    if (workflow["32"]?.inputs) workflow["32"].inputs.filename_prefix = `ttp_upscale_${Date.now()}`;
  } else if (workflow["1076"]?.inputs && workflow["1017"]?.inputs) {
    workflow["1076"].inputs.image = uploaded.name;
    workflow["1017"].inputs.seed = seed;
    workflow["1017"].inputs.new_resolution = resolution;
    workflow["1017"].inputs.batch_size = batchSize;
    if (workflow["1078"]?.inputs) workflow["1078"].inputs.filename_prefix = `seedvr2_${Date.now()}`;
  } else {
    throw new Error("Unsupported upscale workflow: input/upscale nodes were not found.");
  }

  updateUpscaleTask(taskId, { progress: 28, message: "正在提交 ComfyUI 队列..." });
  const promptId = await submitComfyPrompt(comfyUrl, workflow);
  updateUpscaleTask(taskId, {
    progress: 35,
    message: "ComfyUI 已接收任务，正在排队或运行...",
    prompt_id: promptId,
    seed,
    resolution: isSeedVr2 ? workflow["41"]?.inputs?.resolution : requestedResolution,
    max_resolution: workflow["41"]?.inputs?.max_resolution,
    pre_upscale_length: workflow["11"]?.inputs?.scale_to_length,
    batch_size: isSeedVr2 ? workflow["41"]?.inputs?.batch_size : batchSize,
    input: uploaded.name,
  });

  const history = await waitForComfyHistory(comfyUrl, promptId, (status) => updateUpscaleTask(taskId, status));
  updateUpscaleTask(taskId, { progress: 94, message: "ComfyUI 已完成，正在保存高清图片..." });
  const images = await saveComfyHistoryImages(comfyUrl, history, `upscale_${Date.now()}_`);
  if (!images.length) throw new Error("ComfyUI completed, but no output image was found.");

  updateUpscaleTask(taskId, {
    status: "success",
    progress: 100,
    message: "放大完成。",
    images,
    comfy: comfyUrl,
  });
}

async function runShoeSwapTask(taskId, payload) {
  updateUpscaleTask(taskId, { status: "running", progress: 10, message: "正在上传人物图和鞋子图到 ComfyUI..." });
  const comfyUrl = normalizeComfyUrl(payload.comfy_url || COMFYUI_URL);
  const person = await uploadDataUrlToComfy(comfyUrl, payload.person_image, payload.person_name || "person.png");
  const shoe = await uploadDataUrlToComfy(comfyUrl, payload.shoe_image, payload.shoe_name || "shoe.png");
  const workflow = JSON.parse(fs.readFileSync(SHOE_SWAP_WORKFLOW_FILE, "utf8"));
  const seed = Number(payload.seed || crypto.randomInt(1, 2147483647));
  const imageSize = String(payload.image_size || "2K").toUpperCase();

  updateUpscaleTask(taskId, { progress: 22, message: "正在准备换鞋工作流..." });
  if (!workflow["13"]?.inputs || !workflow["10"]?.inputs || !workflow["3"]?.inputs) {
    throw new Error("Unsupported shoe swap workflow: required nodes 13, 10, or 3 were not found.");
  }

  workflow["13"].inputs.image = person.name;
  workflow["10"].inputs.image = shoe.name;
  workflow["3"].inputs.seed = seed;
  workflow["3"].inputs.image_size = imageSize;
  workflow["3"].inputs.apikey = IMAGE_CHAT_API_KEY || API_KEY;
  if (workflow["4"]?.inputs) workflow["4"].inputs.prompt = payload.prompt || SHOE_SWAP_PROMPT;
  if (workflow["7"]?.inputs) workflow["7"].inputs.filename_prefix = `shoe_swap_crop_${Date.now()}`;
  if (workflow["14"]?.inputs) workflow["14"].inputs.filename_prefix = `shoe_swap_${Date.now()}`;

  updateUpscaleTask(taskId, { progress: 30, message: "正在提交 ComfyUI 换鞋队列..." });
  const promptId = await submitComfyPrompt(comfyUrl, workflow);
  updateUpscaleTask(taskId, {
    progress: 38,
    message: "ComfyUI 已接收换鞋任务，正在处理...",
    prompt_id: promptId,
    seed,
    image_size: imageSize,
    input: person.name,
    shoe: shoe.name,
  });

  const history = await waitForComfyHistory(comfyUrl, promptId, (status) => updateUpscaleTask(taskId, {
    ...status,
    message: status.message || "ComfyUI 正在处理换鞋，可能需要几分钟...",
  }));
  updateUpscaleTask(taskId, { progress: 94, message: "ComfyUI 已完成，正在保存换鞋结果..." });
  const images = await saveComfyHistoryImages(comfyUrl, history, `shoe_swap_${Date.now()}_`, ["14"]);
  if (!images.length) throw new Error("ComfyUI completed, but no shoe swap output image was found.");

  updateUpscaleTask(taskId, {
    status: "success",
    progress: 100,
    message: "换鞋完成。",
    images,
    comfy: comfyUrl,
  });
}

async function handleHistory(req, res, filePath, limit) {
  if (req.method === "GET") {
    sendJson(res, 200, { records: readHistoryFile(filePath) });
    return;
  }

  if (req.method === "POST") {
    try {
      const payload = await readJson(req);
      const record = payload.record;
      if (!record || typeof record !== "object") {
        sendJson(res, 400, { error: "Missing history record." });
        return;
      }

      const records = readHistoryFile(filePath);
      const existingIndex = record.id ? records.findIndex((item) => item.id === record.id) : -1;
      if (existingIndex >= 0) records.splice(existingIndex, 1);
      records.unshift(record);
      writeHistoryFile(filePath, records.slice(0, limit));
      sendJson(res, 200, { records: readHistoryFile(filePath) });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (req.method === "DELETE") {
    writeHistoryFile(filePath, []);
    sendJson(res, 200, { records: [] });
    return;
  }

  sendJson(res, 405, { error: "Method not allowed" });
}

async function handleCanvasBoards(req, res) {
  if (req.method === "GET") {
    sendJson(res, 200, { boards: readHistoryFile(CANVAS_BOARDS_FILE) });
    return;
  }

  if (req.method === "POST") {
    try {
      const board = await readJson(req);
      if (!board || typeof board !== "object") {
        sendJson(res, 400, { error: "Missing canvas board." });
        return;
      }
      const boards = readHistoryFile(CANVAS_BOARDS_FILE);
      const id = board.id || crypto.randomUUID();
      const now = new Date().toISOString();
      const nextBoard = {
        id,
        title: String(board.title || "未命名画布").slice(0, 80),
        createdAt: board.createdAt || now,
        updatedAt: now,
        viewport: board.viewport || { x: 80, y: 60, scale: 1 },
        nodes: Array.isArray(board.nodes) ? board.nodes : [],
        connections: Array.isArray(board.connections) ? board.connections : [],
      };
      const existingIndex = boards.findIndex((item) => item.id === id);
      if (existingIndex >= 0) boards.splice(existingIndex, 1);
      boards.unshift(nextBoard);
      writeHistoryFile(CANVAS_BOARDS_FILE, boards.slice(0, 40));
      sendJson(res, 200, { boards: readHistoryFile(CANVAS_BOARDS_FILE), board: nextBoard });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  if (req.method === "DELETE") {
    try {
      const payload = await readJson(req).catch(() => ({}));
      if (!payload?.id) {
        writeHistoryFile(CANVAS_BOARDS_FILE, []);
        sendJson(res, 200, { boards: [] });
        return;
      }
      const boards = readHistoryFile(CANVAS_BOARDS_FILE).filter((item) => item.id !== payload.id);
      writeHistoryFile(CANVAS_BOARDS_FILE, boards);
      sendJson(res, 200, { boards });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  sendJson(res, 405, { error: "Method not allowed" });
}

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (key && (process.env[key] === undefined || process.env[key] === "")) process.env[key] = value;
  }
}

function normalizeApiUrl(url) {
  const cleanUrl = url.replace(/\/+$/, "");
  if (cleanUrl.endsWith("/chat/completions")) return cleanUrl;
  if (cleanUrl.endsWith("/v1")) return `${cleanUrl}/chat/completions`;
  return `${cleanUrl}/v1/chat/completions`;
}

function normalizeImageApiUrl(url) {
  const cleanUrl = url.replace(/\/+$/, "");
  if (cleanUrl.endsWith("/images/generations")) return cleanUrl;
  if (cleanUrl.endsWith("/v1")) return `${cleanUrl}/images/generations`;
  if (cleanUrl.endsWith("/chat/completions")) return cleanUrl.replace(/\/chat\/completions$/, "/images/generations");
  return `${cleanUrl}/v1/images/generations`;
}

function normalizeImageEditApiUrl(url) {
  const cleanUrl = url.replace(/\/+$/, "");
  if (cleanUrl.endsWith("/images/edits")) return cleanUrl;
  if (cleanUrl.endsWith("/images/generations")) return cleanUrl.replace(/\/images\/generations$/, "/images/edits");
  if (cleanUrl.endsWith("/v1")) return `${cleanUrl}/images/edits`;
  if (cleanUrl.endsWith("/chat/completions")) return cleanUrl.replace(/\/chat\/completions$/, "/images/edits");
  return `${cleanUrl}/v1/images/edits`;
}

function normalizeComfyUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return COMFYUI_URL;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  const url = new URL(withProtocol);
  return url.toString().replace(/\/+$/, "");
}

async function requestImageGeneration({ model, prompt, size, quality, n }) {
  const body = {
    model,
    prompt,
    n,
  };

  if (isNanoBananaProModel(model)) {
    body.image_size = getNanoBananaImageSize(size);
  } else {
    body.size = size;
    body.quality = quality;
  }

  const responseFormat = getImageResponseFormat(model);
  if (responseFormat) {
    body.response_format = responseFormat;
  }

  return fetch(IMAGE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });
}

async function requestImageEdit({ model, prompt, size, quality, n, refs }) {
  const form = new FormData();
  form.append("model", model);
  form.append("prompt", prompt);
  if (isNanoBananaProModel(model)) {
    form.append("image_size", getNanoBananaImageSize(size));
  } else {
    form.append("size", size);
    form.append("quality", quality || "auto");
  }
  form.append("n", String(n || 1));
  const responseFormat = getImageResponseFormat(model);
  if (responseFormat) {
    form.append("response_format", responseFormat);
  }

  const files = await Promise.all(refs.slice(0, 4).map((ref, index) => imageReferenceToFile(ref.url, ref.name || `reference_${index + 1}.jpg`)));
  files.forEach((image) => {
    form.append("image", image.blob, image.filename);
  });

  return fetch(IMAGE_EDIT_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
    },
    body: form,
  });
}

function getImageResponseFormat(model) {
  return String(model || "").toLowerCase() === "gpt-image-2" ? "b64_json" : "url";
}

function isNanoBananaProModel(model) {
  return String(model || "").toLowerCase() === "nano-banana-pro";
}

function getNanoBananaImageSize(size) {
  const text = String(size || "").toLowerCase();
  if (text.includes("4k")) return "4K";
  if (text.includes("2k")) return "2K";
  const edges = text.split("x").map((item) => Number.parseInt(item, 10)).filter(Boolean);
  const longEdge = edges.length ? Math.max(...edges) : 0;
  if (longEdge >= 3000) return "4K";
  if (longEdge >= 1800) return "2K";
  return "1K";
}

async function requestImageChat({ model, prompt, size, n, refs }) {
  const userContent = buildGeminiImageChatContent({ prompt, size, refs });
  const body = {
    model,
    messages: [
      {
        role: "user",
        content: userContent,
      },
    ],
    n,
  };

  if (isNanoBanana2Model(model)) {
    body.image_size = getNanoBananaImageSize(size);
  }

  return fetch(IMAGE_CHAT_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${IMAGE_CHAT_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
}

function buildGeminiImageChatContent({ prompt, size, refs }) {
  const text = `${prompt || "Generate an image."}\n\nTarget image size or aspect ratio: ${size || "1024x1024"}. Target image_size: ${getNanoBananaImageSize(size)}. Return the generated image directly.`;
  if (!refs.length) return text;

  return [
    { type: "text", text },
    ...refs.slice(0, 4).map((ref) => ({
      type: "image_url",
      image_url: { url: ref.url },
    })),
  ];
}

function buildImageChatContent({ prompt, size, refs }) {
  const text = `${prompt || "生成图片"}\n\n输出图片尺寸/比例参考：${size || "1024x1024"}。请直接返回生成后的图片。`;
  if (!refs.length) return text;

  return [
    { type: "text", text },
    ...refs.slice(0, 4).map((ref) => ({
      type: "image_url",
      image_url: { url: ref.url },
    })),
  ];
}

function isImageChatModel(model) {
  const name = String(model || "").toLowerCase();
  return name.includes("gemini") && name.includes("image");
}

function isNanoBanana2Model(model) {
  return String(model || "").toLowerCase() === "gemini-3.1-flash-image-preview";
}

async function uploadDataUrlToComfy(comfyUrl, dataUrl, filename) {
  const image = await imageReferenceToFile(dataUrl, filename);
  const form = new FormData();
  form.append("image", image.blob, image.filename);
  form.append("overwrite", "true");

  const response = await fetch(`${comfyUrl}/upload/image`, {
    method: "POST",
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(formatErrorMessage(data.error || data.message || `ComfyUI upload failed: ${response.status}`));
  return data;
}

async function submitComfyPrompt(comfyUrl, workflow) {
  const response = await fetch(`${comfyUrl}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: crypto.randomUUID() }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(formatErrorMessage(data.error || data.message || `ComfyUI prompt failed: ${response.status}`));
  if (!data.prompt_id) throw new Error("ComfyUI did not return prompt_id.");
  return data.prompt_id;
}

async function waitForComfyHistory(comfyUrl, promptId, onStatus = () => {}) {
  const maxPolls = 900;
  for (let index = 0; index < maxPolls; index += 1) {
    const response = await fetch(`${comfyUrl}/history/${encodeURIComponent(promptId)}`);
    if (response.ok) {
      const data = await response.json().catch(() => ({}));
      if (data[promptId]) return data[promptId];
    }

    const progress = Math.min(92, 35 + Math.round((index / maxPolls) * 55));
    if (index % 3 === 0) {
      const queueStatus = await getComfyQueueStatus(comfyUrl, promptId);
      onStatus({
        progress,
        message: queueStatus.message || "ComfyUI 正在处理，TTP 放大可能需要几分钟到十几分钟...",
      });
    } else {
      onStatus({ progress });
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("ComfyUI upscale timed out after 30 minutes.");
}

async function getComfyQueueStatus(comfyUrl, promptId) {
  try {
    const response = await fetch(`${comfyUrl}/queue`);
    if (!response.ok) return {};
    const data = await response.json().catch(() => ({}));
    const running = data.queue_running || [];
    const pending = data.queue_pending || [];
    if (queueContainsPrompt(running, promptId)) return { message: "ComfyUI 正在运行高清放大..." };
    const pendingIndex = pending.findIndex((item) => queueItemHasPrompt(item, promptId));
    if (pendingIndex >= 0) return { message: `ComfyUI 正在排队，前面还有 ${pendingIndex} 个任务...` };
  } catch {
    return {};
  }
  return {};
}

function queueContainsPrompt(items, promptId) {
  return items.some((item) => queueItemHasPrompt(item, promptId));
}

function queueItemHasPrompt(item, promptId) {
  return JSON.stringify(item).includes(promptId);
}

function updateUpscaleTask(taskId, patch) {
  const task = UPSCALE_TASKS.get(taskId);
  if (!task) return;
  UPSCALE_TASKS.set(taskId, {
    ...task,
    ...patch,
    updated_at: Date.now(),
  });
}

function cleanupUpscaleTasks() {
  const expiresAt = Date.now() - 24 * 60 * 60 * 1000;
  for (const [taskId, task] of UPSCALE_TASKS.entries()) {
    if ((task.updated_at || task.created_at || 0) < expiresAt) UPSCALE_TASKS.delete(taskId);
  }
}

function formatErrorMessage(error) {
  const value = error?.message || error;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getUpscaleModelFactor(modelName) {
  const match = String(modelName || "").match(/(\d+(?:\.\d+)?)x/i);
  return match ? Number(match[1]) || 1 : 1;
}

function getLongSideName(dimensions) {
  if (!dimensions) return "height";
  return dimensions.width >= dimensions.height ? "width" : "height";
}

function getDataUrlImageDimensions(dataUrl) {
  const match = String(dataUrl || "").match(/^data:(.+?);base64,(.+)$/);
  if (!match) return null;

  const mimeType = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");
  if (mimeType.includes("png")) return getPngDimensions(buffer);
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return getJpegDimensions(buffer);
  if (mimeType.includes("webp")) return getWebpDimensions(buffer);
  return null;
}

function getPngDimensions(buffer) {
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function getJpegDimensions(buffer) {
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
    }
    offset += 2 + length;
  }
  return null;
}

function getWebpDimensions(buffer) {
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
  }
  if (chunk === "VP8 " && buffer.length >= 30) {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === "VP8L" && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

async function saveComfyHistoryImages(comfyUrl, history, prefix, preferredOutputIds = []) {
  const outputImages = [];
  const fallbackImages = [];
  const outputs = history.outputs || {};
  const preferredImages = [];

  for (const id of preferredOutputIds) {
    for (const image of outputs[id]?.images || []) {
      preferredImages.push(image);
    }
  }

  for (const output of Object.values(outputs)) {
    for (const image of output.images || []) {
      if (image.type === "output") outputImages.push(image);
      else fallbackImages.push(image);
    }
  }

  const urls = [];
  for (const image of preferredImages.length ? preferredImages : outputImages.length ? outputImages : fallbackImages) {
    const saved = await saveComfyImage(comfyUrl, image, prefix);
    if (saved && !urls.includes(saved)) urls.push(saved);
  }

  return urls;
}

async function saveComfyImage(comfyUrl, image, prefix) {
  const params = new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder || "",
    type: image.type || "output",
  });
  const response = await fetch(`${comfyUrl}/view?${params.toString()}`);
  if (!response.ok) return "";

  const contentType = response.headers.get("content-type") || "image/png";
  const extension = extensionFromContentType(contentType) || extensionFromUrl(image.filename) || "png";
  const filename = `${prefix}${crypto.randomBytes(4).toString("hex")}.${extension}`;
  const filePath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filePath, Buffer.from(await response.arrayBuffer()));
  return `/output/${filename}`;
}

function dataUrlToFile(dataUrl, filename) {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) throw new Error("Reference image must be a data URL.");

  const mimeType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  const extension = extensionFromContentType(mimeType) || "jpg";
  const safeName = filename.includes(".") ? filename : `${filename}.${extension}`;

  return {
    filename: safeName,
    blob: new Blob([buffer], { type: mimeType }),
  };
}

function saveDataUrlImage(dataUrl, name = "image") {
  const match = String(dataUrl || "").match(/^data:(.+?);base64,(.+)$/);
  if (!match) throw new Error("Image must be a data URL.");

  const mimeType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  return saveBinaryImage(buffer, name, mimeType);
}

function saveBinaryImage(buffer, name = "image", mimeType = "image/png") {
  const target = buildOutputImagePath(name, mimeType);
  fs.writeFileSync(target.filePath, buffer);
  return {
    filename: target.filename,
    url: `/output/${target.filename}`,
  };
}

function buildOutputImagePath(name = "image", mimeType = "image/png") {
  const extension = extensionFromContentType(mimeType) || "png";
  const base = path.basename(String(name || "image"), path.extname(String(name || ""))).replace(/[\\/:*?"<>|]+/g, "-") || "image";
  const filename = `${base}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${extension}`;
  const filePath = path.join(OUTPUT_DIR, filename);
  return {
    filename,
    filePath,
  };
}

async function imageReferenceToFile(url, filename) {
  const source = String(url || "");
  if (source.startsWith("data:")) return dataUrlToFile(source, filename);

  const localPath = resolveLocalImageReference(source);
  if (localPath) {
    return localImageFileToUpload(localPath, filename);
  }

  if (/^https?:\/\//i.test(source)) {
    const response = await fetchWithTimeout(source, {}, 20000);
    if (!response.ok) throw new Error(`Reference image download failed: ${response.status}`);
    const mimeType = response.headers.get("content-type") || "image/png";
    const extension = extensionFromContentType(mimeType) || extensionFromUrl(source) || "png";
    const safeName = filename.includes(".") ? filename : `${filename}.${extension}`;
    return {
      filename: safeName,
      blob: new Blob([Buffer.from(await response.arrayBuffer())], { type: mimeType }),
    };
  }

  throw new Error("Reference image must be a data URL, /output URL, or http URL.");
}

async function readBodyBuffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) {
        reject(new Error(`Request body too large. Current limit is ${Math.round(MAX_REQUEST_BYTES / 1024 / 1024)}MB.`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseMultipartFiles(contentType, buffer) {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = boundaryMatch?.[1] || boundaryMatch?.[2];
  if (!boundary) throw new Error("Invalid multipart form data.");

  const boundaryBuffer = Buffer.from(`--${boundary}`, "utf8");
  const headerBreak = Buffer.from("\r\n\r\n", "utf8");
  const files = [];
  let position = 0;

  while (position < buffer.length) {
    const boundaryStart = buffer.indexOf(boundaryBuffer, position);
    if (boundaryStart < 0) break;

    let partStart = boundaryStart + boundaryBuffer.length;
    if (buffer[partStart] === 45 && buffer[partStart + 1] === 45) break;
    if (buffer[partStart] === 13 && buffer[partStart + 1] === 10) partStart += 2;

    const headerEnd = buffer.indexOf(headerBreak, partStart);
    if (headerEnd < 0) break;

    const headerText = buffer.slice(partStart, headerEnd).toString("latin1");
    const dataStart = headerEnd + headerBreak.length;
    const nextBoundary = buffer.indexOf(boundaryBuffer, dataStart);
    if (nextBoundary < 0) break;

    let dataEnd = nextBoundary;
    if (buffer[dataEnd - 2] === 13 && buffer[dataEnd - 1] === 10) dataEnd -= 2;

    const disposition = headerText.match(/content-disposition:[^\r\n]+/i)?.[0] || "";
    const name = disposition.match(/name="([^"]+)"/i)?.[1] || "";
    const filename = disposition.match(/filename="([^"]*)"/i)?.[1] || "";
    if (filename) {
      const contentTypeMatch = headerText.match(/content-type:\s*([^\r\n]+)/i);
      const fileContentType = (contentTypeMatch?.[1] || "application/octet-stream").trim();
      files.push({
        name,
        filename: path.basename(filename),
        contentType: fileContentType,
        buffer: buffer.slice(dataStart, dataEnd),
      });
    }

    position = nextBoundary;
  }

  return files;
}

function resolveLocalImageReference(source) {
  let pathname = String(source || "");
  if (/^https?:\/\//i.test(pathname)) {
    try {
      pathname = new URL(pathname).pathname;
    } catch {
      return "";
    }
  }
  if (pathname.startsWith("./")) pathname = `/${pathname.slice(2)}`;
  if (!pathname.startsWith("/")) return "";

  try {
    pathname = decodeURIComponent(pathname);
  } catch {}

  if (pathname.startsWith("/output/")) {
    const filePath = path.resolve(OUTPUT_DIR, path.basename(pathname));
    if (filePath.startsWith(path.resolve(OUTPUT_DIR)) && fs.existsSync(filePath)) return filePath;
    throw new Error("Reference image was not found on the server.");
  }

  if (pathname.startsWith("/assets/")) {
    const filePath = path.resolve(PUBLIC_DIR, `.${pathname}`);
    if (filePath.startsWith(path.resolve(PUBLIC_DIR)) && fs.existsSync(filePath)) return filePath;
    throw new Error("Asset reference image was not found on the server.");
  }

  return "";
}

function localImageFileToUpload(filePath, filename) {
  const buffer = fs.readFileSync(filePath);
  const extension = extensionFromFilePath(filePath) || "png";
  const mimeType = mimeTypes[`.${extension}`] || "application/octet-stream";
  const safeName = String(filename || "").includes(".") ? filename : `${filename || "image"}.${extension}`;
  return {
    filename: safeName,
    blob: new Blob([buffer], { type: mimeType }),
  };
}

async function saveGeneratedImages(data) {
  const items = Array.isArray(data.data) ? data.data : [];
  const saved = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    try {
      let bytes;
      let extension = "png";

      if (item.b64_json) {
        bytes = decodeImageBase64(item.b64_json);
      } else if (item.url) {
        const response = await fetchWithTimeout(item.url, {}, 15000);
        if (!response.ok) throw new Error(`Image download failed: ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        bytes = Buffer.from(arrayBuffer);
        extension = extensionFromContentType(response.headers.get("content-type")) || extensionFromUrl(item.url) || extension;
      } else {
        continue;
      }

      const filename = `image_${Date.now()}_${index + 1}_${crypto.randomBytes(4).toString("hex")}.${extension}`;
      const filePath = path.join(OUTPUT_DIR, filename);
      fs.writeFileSync(filePath, bytes);
      saved.push({
        filename,
        url: `/output/${filename}`,
      });
      item.local_url = `/output/${filename}`;
    } catch (error) {
      saved.push({
        error: error.message,
      });
    }
  }

  return saved;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: options.signal || controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function decodeImageBase64(value) {
  const source = String(value || "");
  const commaIndex = source.indexOf(",");
  const payload = source.startsWith("data:") && commaIndex >= 0 ? source.slice(commaIndex + 1) : source;
  return Buffer.from(payload, "base64");
}

function normalizeChatImageResponse(data) {
  if (Array.isArray(data.data) && data.data.length) return data;

  const items = [];
  const choices = Array.isArray(data.choices) ? data.choices : [];
  for (const choice of choices) {
    collectImagesFromValue(choice.message?.content, items);
    collectImagesFromValue(choice.message?.images, items);
    collectImagesFromValue(choice.message?.image, items);
    collectImagesFromValue(choice.delta?.content, items);
  }

  collectImagesFromValue(data.images, items);
  collectImagesFromValue(data.image, items);
  collectImagesFromValue(data.output, items);
  collectImagesFromValue(data.output_text, items);

  data.data = dedupeImageItems(items);
  return data;
}

function collectImagesFromValue(value, items) {
  if (!value) return;

  if (typeof value === "string") {
    collectImagesFromText(value, items);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectImagesFromValue(item, items));
    return;
  }

  if (typeof value !== "object") return;

  const imageUrl = value.image_url?.url || value.image_url;
  const url = value.url || value.local_url || imageUrl;
  const b64 = value.b64_json || value.base64 || value.data;

  if (typeof url === "string") {
    if (url.startsWith("data:image/")) collectImagesFromText(url, items);
    else if (/^https?:\/\//i.test(url) || url.startsWith("/")) items.push({ url });
  }

  if (typeof b64 === "string") {
    if (b64.startsWith("data:image/")) collectImagesFromText(b64, items);
    else if (/^[A-Za-z0-9+/=\s]+$/.test(b64) && b64.length > 100) items.push({ b64_json: b64.replace(/\s/g, "") });
  }

  for (const key of ["content", "text", "images", "image", "parts"]) {
    if (value[key] !== undefined) collectImagesFromValue(value[key], items);
  }
}

function collectImagesFromText(text, items) {
  const value = String(text || "");
  const dataUrlPattern = /data:image\/([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)/g;
  const markdownPattern = /!\[[^\]]*]\((https?:\/\/[^)\s]+|data:image\/[^)]+)\)/g;
  const urlPattern = /(https?:\/\/[^\s"'<>]+?\.(?:png|jpe?g|webp)(?:\?[^\s"'<>]+)?)/gi;

  for (const match of value.matchAll(dataUrlPattern)) {
    items.push({ b64_json: match[2].replace(/\s/g, "") });
  }

  for (const match of value.matchAll(markdownPattern)) {
    const url = match[1];
    if (url.startsWith("data:image/")) collectImagesFromText(url, items);
    else items.push({ url });
  }

  for (const match of value.matchAll(urlPattern)) {
    items.push({ url: match[1] });
  }
}

function dedupeImageItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.url || item.b64_json;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extensionFromContentType(contentType = "") {
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("png")) return "png";
  return "";
}

function extensionFromUrl(url) {
  try {
    const ext = path.extname(new URL(url).pathname).replace(".", "").toLowerCase();
    if (["png", "jpg", "jpeg", "webp"].includes(ext)) return ext === "jpeg" ? "jpg" : ext;
  } catch {}
  return "";
}

function extensionFromFilePath(filePath) {
  const ext = path.extname(String(filePath || "")).replace(".", "").toLowerCase();
  if (["png", "jpg", "jpeg", "webp"].includes(ext)) return ext === "jpeg" ? "jpg" : ext;
  return "";
}

function parseModels(value, fallback) {
  const models = value
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);

  return models.length ? [...new Set(models)] : [fallback];
}

function getLanUrls(port) {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((info) => info && info.family === "IPv4" && !info.internal)
    .map((info) => `http://${info.address}:${port}`);
}

function readHistoryFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const records = JSON.parse(fs.readFileSync(filePath, "utf8") || "[]");
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

function writeHistoryFile(filePath, records) {
  fs.writeFileSync(filePath, JSON.stringify(records, null, 2));
}

function serveStatic(req, res) {
  const cleanPath = decodeURIComponent(req.url.split("?")[0]);
  if (cleanPath.startsWith("/output/")) {
    serveOutput(cleanPath, res);
    return;
  }

  const requestedPath = cleanPath === "/" ? "/index.html" : cleanPath;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
    });
    res.end(content);
  });
}

function serveOutput(urlPath, res) {
  const filename = path.basename(urlPath);
  const filePath = path.join(OUTPUT_DIR, filename);

  if (!filePath.startsWith(OUTPUT_DIR)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000",
    });
    res.end(content);
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > MAX_REQUEST_BYTES) {
        req.destroy();
        reject(new Error(`Request body too large. Current limit is ${Math.round(MAX_REQUEST_BYTES / 1024 / 1024)}MB.`));
      }
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });

    req.on("error", reject);
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(body));
}
