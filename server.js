const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const ImageResolutionRules = require("./image-resolution-rules");
const CanvasImageModelRouting = require("./image-model-routing");
const { createThumbnailStore } = require("./image-thumbnail-store");
const { createProxyAwareFetch } = require("./outbound-fetch");
const CanvasAgentRuntime = require("./canvas-agent-runtime");
const CanvasAgentRouter = require("./canvas-agent-router");
const CanvasAgentLlmConnectors = require("./canvas-agent-llm-connectors");
const CanvasAgentConversation = require("./canvas-agent-conversation");
const { createCanvasAgentConversationStore, normalizeBoardId } = require("./canvas-agent-conversation-store");
const { createImageJobManager } = require("./image-job-manager");
const {
  normalizeMinimaxH3Request,
  prepareMinimaxH3Workflow,
  collectComfyVideoOutputs,
  inspectComfyHistory,
  sanitizeReferenceName,
} = require("./minimax-h3-workflow");

loadEnvFile();

const OUTBOUND_PROXY_URL = process.env.OUTBOUND_PROXY_URL || "auto";
const OUTBOUND_NO_PROXY = process.env.OUTBOUND_NO_PROXY || process.env.NO_PROXY || "";
const fetch = createProxyAwareFetch({
  proxyUrl: OUTBOUND_PROXY_URL,
  noProxy: OUTBOUND_NO_PROXY,
});
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = __dirname;
const OUTPUT_DIR = path.join(__dirname, "output");
const DATA_DIR = path.join(__dirname, "data");
const WORKFLOW_DIR = path.join(__dirname, "workflows");
const CANVAS_SKILLS_DIR = path.join(__dirname, "skills");
const UPLOAD_TMP_DIR = path.join(__dirname, "tmp", "uploads");
const UPSCALE_WORKFLOW_FILE = path.join(WORKFLOW_DIR, "TTP-upscale.json");
const UPSCALE2_WORKFLOW_FILE = path.join(WORKFLOW_DIR, "SeedVR2-upscale2.json");
const SHOE_SWAP_WORKFLOW_FILE = path.join(WORKFLOW_DIR, "shoe-swap.json");
const OUTPAINT_WORKFLOW_FILE = path.join(WORKFLOW_DIR, "z-image-outpaint.json");
const RUNNINGHUB_OUTPAINT_WORKFLOW_FILE = path.join(WORKFLOW_DIR, "runninghub-outpaint.json");
const FLUX2_KLEIN_EDIT_WORKFLOW_FILE = path.join(WORKFLOW_DIR, "flux2-klein-edit-9b.json");
const QWEN_EDIT_ANGLE_WORKFLOW_FILE = path.join(WORKFLOW_DIR, "qwen-edit-angle-2511.json");
const MINIMAX_H3_WORKFLOW_FILE = path.join(WORKFLOW_DIR, "minimax-h3-video.json");
const IMAGE_HISTORY_FILE = path.join(DATA_DIR, "image-history.json");
const CHAT_HISTORY_FILE = path.join(DATA_DIR, "chat-history.json");
const CANVAS_BOARDS_FILE = process.env.CANVAS_LEGACY_FILE
  ? path.resolve(process.env.CANVAS_LEGACY_FILE)
  : path.join(DATA_DIR, "canvas-boards.json");
const CANVAS_DB_FILE = process.env.CANVAS_DB_FILE
  ? path.resolve(process.env.CANVAS_DB_FILE)
  : path.join(DATA_DIR, "canvas.db");
const CANVAS_BACKUP_DIR = process.env.CANVAS_BACKUP_DIR
  ? path.resolve(process.env.CANVAS_BACKUP_DIR)
  : path.join(DATA_DIR, "canvas-legacy-backups");
const THUMBNAIL_REGISTRY_FILE = path.join(DATA_DIR, "image-thumbnails.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const PROVIDER_MONITORING_FILE = path.join(DATA_DIR, "provider-runtime-history.json");
const IMAGE_JOBS_FILE = process.env.IMAGE_JOBS_FILE
  ? path.resolve(process.env.IMAGE_JOBS_FILE)
  : path.join(DATA_DIR, "image-jobs.json");
const CANVAS_AGENT_ROUTE_HISTORY_FILE = process.env.CANVAS_AGENT_ROUTE_HISTORY_FILE
  ? path.resolve(process.env.CANVAS_AGENT_ROUTE_HISTORY_FILE)
  : path.join(DATA_DIR, "canvas-agent-route-history.json");
const CANVAS_AGENT_CONVERSATIONS_FILE = process.env.CANVAS_AGENT_CONVERSATIONS_FILE
  ? path.resolve(process.env.CANVAS_AGENT_CONVERSATIONS_FILE)
  : path.join(DATA_DIR, "canvas-agent-conversations.json");
const PROVIDER_MONITORING_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const PROVIDER_MONITORING_INTERVAL_MS = Math.max(1, Number(process.env.PROVIDER_MONITORING_INTERVAL_MINUTES || 5)) * 60 * 1000;
let providerMonitoringSweepRunning = false;
const MAX_REQUEST_BYTES = Number(process.env.MAX_REQUEST_MB || 800) * 1024 * 1024;
const MAX_MEDIA_UPLOAD_BYTES = (Number(process.env.MAX_MEDIA_UPLOAD_MB) || 800) * 1024 * 1024;
const MAX_UPLOAD_CHUNKS = Math.max(1, Math.min(4096, Number(process.env.MAX_UPLOAD_CHUNKS) || 1024));
const UPLOAD_TMP_TTL_MS = Math.max(60, Number(process.env.UPLOAD_TMP_TTL_MINUTES) || 1440) * 60 * 1000;
const COMFY_UPLOAD_TIMEOUT_MS = Math.max(10, Number(process.env.COMFY_UPLOAD_TIMEOUT_SECONDS) || 300) * 1000;
const COMFY_PROMPT_TIMEOUT_MS = Math.max(10, Number(process.env.COMFY_PROMPT_TIMEOUT_SECONDS) || 60) * 1000;
const COMFY_POLL_TIMEOUT_MS = Math.max(5, Number(process.env.COMFY_POLL_TIMEOUT_SECONDS) || 30) * 1000;
const COMFY_DOWNLOAD_TIMEOUT_MS = Math.max(10, Number(process.env.COMFY_DOWNLOAD_TIMEOUT_SECONDS) || 300) * 1000;
const API_URL = normalizeApiUrl(process.env.AI_API_URL || "https://api.openai.com/v1/chat/completions");
const API_KEY = process.env.AI_API_KEY || "";
const DEFAULT_MODEL = process.env.AI_MODEL || "gpt-4o-mini";
const CANVAS_AGENT_API_URL = CanvasAgentRuntime.normalizeResponsesApiUrl(process.env.CANVAS_AGENT_API_URL || process.env.AI_API_URL || "https://api.openai.com/v1/responses");
const CANVAS_AGENT_API_KEY = process.env.CANVAS_AGENT_API_KEY || API_KEY;
const CANVAS_AGENT_MODEL = process.env.CANVAS_AGENT_MODEL || "gpt-5.6-terra";
const CANVAS_AGENT_REASONING_EFFORT = process.env.CANVAS_AGENT_REASONING_EFFORT || "medium";
const CANVAS_AGENT_TIMEOUT_MS = Math.max(30, Number(process.env.CANVAS_AGENT_TIMEOUT_SECONDS || 180)) * 1000;
const CANVAS_AGENT_CONNECT_TIMEOUT_MS = Math.max(1, Number(process.env.CANVAS_AGENT_CONNECT_TIMEOUT_SECONDS || 4)) * 1000;
const CANVAS_AGENT_FIRST_EVENT_TIMEOUT_MS = Math.max(2, Number(process.env.CANVAS_AGENT_FIRST_EVENT_TIMEOUT_SECONDS || 10)) * 1000;
const CANVAS_AGENT_ATTEMPT_TIMEOUT_MS = Math.max(10, Number(process.env.CANVAS_AGENT_ATTEMPT_TIMEOUT_SECONDS || 45)) * 1000;
const CANVAS_AGENT_VERIFICATION_TIMEOUT_MS = Math.max(CANVAS_AGENT_FIRST_EVENT_TIMEOUT_MS, CANVAS_AGENT_ATTEMPT_TIMEOUT_MS);
const CANVAS_AGENT_TOTAL_TIMEOUT_MS = Math.max(20, Number(process.env.CANVAS_AGENT_TOTAL_TIMEOUT_SECONDS || 90)) * 1000;
const IMAGE_JOB_TIMEOUT_MINUTES = Math.max(5, Math.min(30, Number(process.env.IMAGE_JOB_TIMEOUT_MINUTES) || 15));
const IMAGE_JOB_TIMEOUT_MS = IMAGE_JOB_TIMEOUT_MINUTES * 60 * 1000;
const CANVAS_AGENT_USE_SETTINGS_PROVIDERS = !["0", "false", "no", "off"].includes(String(process.env.CANVAS_AGENT_USE_SETTINGS_PROVIDERS || "true").toLowerCase());
const CANVAS_AGENT_ROUTE_HISTORY_ENABLED = !["0", "false", "no", "off"].includes(String(process.env.CANVAS_AGENT_ROUTE_HISTORY_ENABLED || "true").toLowerCase());
const CANVAS_AGENT_VISION_PROBE_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlR3YQAAAAASUVORK5CYII=";
const CANVAS_AGENT_MAX_SESSIONS = 100;
const CANVAS_AGENT_SESSION_TTL_MS = 30 * 60 * 1000;
const canvasAgentSessions = new Map();
const canvasAgentConversationStore = createCanvasAgentConversationStore({ filePath: CANVAS_AGENT_CONVERSATIONS_FILE });
const canvasAgentHalfOpenRoutes = new Set();
const canvasAgentModelDiscoveryCache = new Map();
const canvasAgentVerificationPromises = new Map();
const draftAgentVerificationCache = new Map();
const DRAFT_AGENT_VERIFICATION_TTL_MS = 15 * 60 * 1000;
let canvasAgentModelDiscoveryPromise = null;
let canvasAgentRouteHistory = null;
let canvasAgentRouteFlushTimer = null;
let canvasAgentRouteFlushPromise = Promise.resolve();
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
const AINB_IMAGE_MODEL_ALIAS = process.env.AINB_IMAGE_MODEL_ALIAS || "gpt-image-2-ainb";
const AINB_IMAGE_API_URL = normalizeImageApiUrl(process.env.AINB_IMAGE_API_URL || "https://ainb.plus");
const AINB_IMAGE_EDIT_API_URL = normalizeImageEditApiUrl(process.env.AINB_IMAGE_EDIT_API_URL || AINB_IMAGE_API_URL);
const AINB_IMAGE_API_KEY = process.env.AINB_IMAGE_API_KEY || "";
const CLSE_IMAGE_MODEL_ALIAS = process.env.CLSE_IMAGE_MODEL_ALIAS || "gpt-image-2-clse";
const CLSE_IMAGE_UPSTREAM_MODEL = process.env.CLSE_IMAGE_UPSTREAM_MODEL || "gpt-image-2";
const CLSE_IMAGE_API_URL = normalizeImageApiUrl(process.env.CLSE_IMAGE_API_URL || "https://clse-ai.com/v1");
const CLSE_IMAGE_EDIT_API_URL = normalizeImageEditApiUrl(process.env.CLSE_IMAGE_EDIT_API_URL || CLSE_IMAGE_API_URL);
const CLSE_IMAGE_API_KEY = process.env.CLSE_IMAGE_API_KEY || "";
const APIMART_IMAGE_MODEL_ALIAS = process.env.APIMART_IMAGE_MODEL_ALIAS || "gpt-image-2-apimart";
const APIMART_IMAGE_UPSTREAM_MODEL = process.env.APIMART_IMAGE_UPSTREAM_MODEL || "gpt-image-2";
const APIMART_IMAGE_API_URL = normalizeImageApiUrl(process.env.APIMART_IMAGE_API_URL || "https://api.apimart.ai/v1/images/generations");
const APIMART_IMAGE_TASK_API_URL = (process.env.APIMART_IMAGE_TASK_API_URL || "https://api.apimart.ai/v1/tasks").replace(/\/+$/, "");
const APIMART_IMAGE_API_KEY = process.env.APIMART_IMAGE_API_KEY || "";
const MIDJOURNEY_IMAGE_MODEL_ALIAS = "midjourney";
const MIDJOURNEY_IMAGE_API_URL = normalizeMidjourneyApiUrl(process.env.MIDJOURNEY_IMAGE_API_URL || "https://api.apimart.ai/v1/midjourney/generations");
const MIDJOURNEY_IMAGE_TASK_API_URL = (process.env.MIDJOURNEY_IMAGE_TASK_API_URL || APIMART_IMAGE_TASK_API_URL).replace(/\/+$/, "");
const GRSAI_IMAGE_BASE_URL = (process.env.GRSAI_IMAGE_BASE_URL || "https://grsaiapi.com").replace(/\/+$/, "");
const GRSAI_IMAGE_API_URL = normalizeGrsaiImageApiUrl(process.env.GRSAI_IMAGE_API_URL || GRSAI_IMAGE_BASE_URL);
const GRSAI_IMAGE_RESULT_API_URL = normalizeGrsaiImageResultApiUrl(process.env.GRSAI_IMAGE_RESULT_API_URL || GRSAI_IMAGE_BASE_URL);
const GRSAI_IMAGE_API_KEY = process.env.GRSAI_IMAGE_API_KEY || "";
const GRSAI_IMAGE_FETCH_TIMEOUT_MS = Number(process.env.GRSAI_IMAGE_FETCH_TIMEOUT_SECONDS || 180) * 1000;
const GRSAI_IMAGE_MODELS = parseModels(
  process.env.GRSAI_IMAGE_MODELS || "gpt-image-2-vip-grsai,gpt-image-2-grsai,nano-banana-pro-grsai,nano-banana-2-grsai",
  "",
);
const AVAILABLE_IMAGE_MODELS = [
  ...new Set([
    ...parseModels(process.env.AI_IMAGE_MODELS || IMAGE_DEFAULT_MODEL, IMAGE_DEFAULT_MODEL),
    ...(AINB_IMAGE_API_KEY ? [AINB_IMAGE_MODEL_ALIAS] : []),
    ...(CLSE_IMAGE_API_KEY ? [CLSE_IMAGE_MODEL_ALIAS] : []),
    ...(APIMART_IMAGE_API_KEY ? [APIMART_IMAGE_MODEL_ALIAS] : []),
    ...(APIMART_IMAGE_API_KEY ? [MIDJOURNEY_IMAGE_MODEL_ALIAS] : []),
    ...(GRSAI_IMAGE_API_KEY ? GRSAI_IMAGE_MODELS : []),
  ]),
];
const COMFYUI_URL = (process.env.COMFYUI_URL || process.env.COMFYUI_BASE_URL || "http://127.0.0.1:8188").replace(/\/+$/, "");
const RUNNINGHUB_BASE_URL = (process.env.RUNNINGHUB_BASE_URL || "https://www.runninghub.cn").replace(/\/+$/, "");
const RUNNINGHUB_API_KEY = process.env.RUNNINGHUB_API_KEY || "";
const RUNNINGHUB_OUTPAINT_WORKFLOW_ID = process.env.RUNNINGHUB_OUTPAINT_WORKFLOW_ID || "2061334785754226690";
const WEB_SEARCH_MAX_RESULTS = Math.max(1, Math.min(8, Number(process.env.WEB_SEARCH_MAX_RESULTS || 5)));
const WEB_SEARCH_FETCH_PAGES = Math.max(0, Math.min(5, Number(process.env.WEB_SEARCH_FETCH_PAGES || 3)));
const WEB_SEARCH_PAGE_CHARS = Math.max(600, Math.min(6000, Number(process.env.WEB_SEARCH_PAGE_CHARS || 2200)));
const UPSCALE_TASKS = new Map();
const ONLINE_TTL_MS = Number(process.env.ONLINE_TTL_SECONDS || 45) * 1000;
const ONLINE_CLIENTS = new Map();
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
const thumbnailStore = createThumbnailStore({
  outputDir: OUTPUT_DIR,
  dataFile: THUMBNAIL_REGISTRY_FILE,
  maxBytes: 2 * 1024 * 1024,
});
const imageJobManager = createImageJobManager({
  filePath: IMAGE_JOBS_FILE,
  timeoutMs: IMAGE_JOB_TIMEOUT_MS,
  execute: async (payload, context) => {
    const response = await executeImageGenerationPayload(payload, { signal: context.signal });
    return {
      ...response,
      body: response.status >= 200 && response.status < 300
        ? compactImageJobResponse(response.body)
        : response.body,
    };
  },
});

let canvasStorage = null;
let canvasShutdownPromise = null;

function getCanvasStorage() {
  if (canvasStorage) return canvasStorage;
  const { createCanvasRepository } = require("./canvas-repository");
  const { createCanvasLegacyMigrator } = require("./canvas-legacy-migrator");
  const { createCanvasQueryService } = require("./canvas-query-service");
  const { createCanvasCommandService } = require("./canvas-command-service");
  const { streamCanvasExport, importCanvasStream } = require("./canvas-export-service");
  const repository = createCanvasRepository({ dbPath: CANVAS_DB_FILE, requestTimeoutMs: 30_000 });
  const migrator = createCanvasLegacyMigrator({
    legacyFile: CANVAS_BOARDS_FILE,
    repository,
    backupDirectory: CANVAS_BACKUP_DIR,
    batchSize: 500,
  });
  canvasStorage = {
    repository,
    migrator,
    queryService: createCanvasQueryService({ repository, migrator }),
    commandService: createCanvasCommandService({ repository }),
    streamCanvasExport,
    importCanvasStream,
  };
  return canvasStorage;
}

function shutdownCanvasStorage() {
  if (!canvasShutdownPromise) {
    canvasShutdownPromise = canvasStorage
      ? canvasStorage.repository.close()
      : Promise.resolve();
  }
  return canvasShutdownPromise;
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
};

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/api/models") {
    const customModels = getCustomModelEntries("text");
    const staticModels = AVAILABLE_MODELS.filter((model) => isStaticModelEnabled(model, "text"));
    sendJson(res, 200, {
      defaultModel: DEFAULT_MODEL,
      models: [...new Set([...staticModels, ...customModels.map((item) => item.clientId)])],
      labels: Object.fromEntries(customModels.map((item) => [item.clientId, item.label])),
    });
    return;
  }

  if (req.method === "GET" && req.url === "/api/vision-models") {
    const customModels = getCustomModelEntries("vision");
    const staticModels = AVAILABLE_MODELS.filter((model) => isStaticModelEnabled(model, "vision"));
    sendJson(res, 200, {
      defaultModel: staticModels[0] || customModels[0]?.clientId || "",
      models: [...new Set([...staticModels, ...customModels.map((item) => item.clientId)])],
      labels: Object.fromEntries(customModels.map((item) => [item.clientId, item.label])),
    });
    return;
  }

  if (req.method === "GET" && req.url === "/api/image-models") {
    const customModels = getCustomModelEntries("generation");
    const staticModels = AVAILABLE_IMAGE_MODELS.filter((model) => isStaticModelEnabled(model, "generation"));
    const resolutions = Object.fromEntries([
      ...staticModels.map((model) => [model, getConfiguredImageResolutions(model)]),
      ...customModels.map((item) => [item.clientId, getConfiguredImageResolutions(item.clientId, item.model)]),
    ]);
    const platforms = Object.fromEntries([
      ...staticModels.map((model) => [model, getImageModelPlatform(model)]),
      ...customModels.map((item) => [item.clientId, getImageModelPlatform(item.clientId)]),
    ]);
    const families = Object.fromEntries([
      ...staticModels.map((model) => [model, getImageModelFamily(model)]),
      ...customModels.map((item) => [item.clientId, getImageModelFamily(item.clientId)]),
    ]);
    const prices = Object.fromEntries(
      customModels
        .map((item) => [item.clientId, normalizeModelPrice(item.model.price)])
        .filter(([, price]) => price),
    );
    sendJson(res, 200, {
      defaultModel: IMAGE_DEFAULT_MODEL,
      models: [...new Set([...staticModels, ...customModels.map((item) => item.clientId)])],
      labels: Object.fromEntries(customModels.map((item) => [item.clientId, item.label])),
      resolutions,
      platforms,
      families,
      prices,
      candidates: getImageModelCandidates(),
    });
    return;
  }

  if (req.url === "/api/settings") {
    await handleSettings(req, res);
    return;
  }

  if (req.method === "GET" && (req.url === "/api/settings/agent-candidates" || req.url.startsWith("/api/settings/agent-candidates?"))) {
    await handleCanvasAgentCandidatePool(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/settings/providers/key") {
    await handleProviderKeyReveal(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/settings/providers/models") {
    await handleProviderModels(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/settings/providers/runtime") {
    await handleProviderRuntime(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/settings/providers/agent-verify") {
    await handleProviderAgentVerify(req, res);
    return;
  }

  if (req.url === "/api/settings/providers/monitoring" || req.url.startsWith("/api/settings/providers/monitoring?")) {
    await handleProviderMonitoring(req, res);
    return;
  }

  if (req.url === "/api/online") {
    await handleOnline(req, res);
    return;
  }

  if (req.url === "/api/history/images" || req.url.startsWith("/api/history/images?")) {
    await handleHistory(req, res, IMAGE_HISTORY_FILE, 200);
    return;
  }

  if (req.url === "/api/history/chat" || req.url.startsWith("/api/history/chat?")) {
    await handleHistory(req, res, CHAT_HISTORY_FILE, 50);
    return;
  }

  if (
    req.url === "/api/canvas/boards"
    || req.url.startsWith("/api/canvas/boards?")
    || req.url.startsWith("/api/canvas/boards/")
    || req.url === "/api/canvas/import"
    || req.url.startsWith("/api/canvas/import?")
  ) {
    await handleCanvasStorageRoute(req, res);
    return;
  }

  if (req.method === "GET" && req.url === "/api/canvas-agent/skills") {
    await handleCanvasAgentSkills(req, res);
    return;
  }

  if (req.url === "/api/canvas-agent/conversation" || req.url.startsWith("/api/canvas-agent/conversation?")) {
    await handleCanvasAgentConversation(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/canvas-agent/turn") {
    await handleCanvasAgentTurn(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/canvas-agent/cancel") {
    await handleCanvasAgentCancel(req, res);
    return;
  }

  if (req.url.startsWith("/api/image-thumbnails")) {
    await handleImageThumbnails(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/chat") {
    await handleChat(req, res);
    return;
  }

  if (req.url === "/api/image-jobs" || req.url.startsWith("/api/image-jobs/")) {
    await handleImageJobs(req, res);
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

  if (req.method === "POST" && req.url === "/api/upload-media") {
    await handleMediaUpload(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/upload-media/chunk") {
    await handleMediaChunkUpload(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/minimax-h3-video") {
    await handleMinimaxH3Video(req, res);
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

  if (req.method === "POST" && req.url === "/api/outpaint") {
    await handleUpscale(req, res, "outpaint");
    return;
  }

  if (req.method === "POST" && req.url === "/api/runninghub-outpaint") {
    await handleUpscale(req, res, "runninghub-outpaint");
    return;
  }

  if (req.method === "POST" && req.url === "/api/flux2-klein-edit") {
    await handleUpscale(req, res, "flux2-klein-edit");
    return;
  }

  if (req.method === "POST" && req.url === "/api/qwen-edit-angle") {
    await handleUpscale(req, res, "qwen-edit-angle");
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

let serverShutdownStarted = false;
function shutdownServer() {
  if (serverShutdownStarted) return;
  serverShutdownStarted = true;
  server.close(() => {
    shutdownCanvasStorage().finally(() => process.exit(0));
  });
}
process.once("SIGINT", shutdownServer);
process.once("SIGTERM", shutdownServer);
server.once("close", () => { shutdownCanvasStorage().catch(() => {}); });

const providerMonitoringStartupTimer = setTimeout(() => {
  runProviderMonitoringSweep().catch(() => {});
  const interval = setInterval(() => runProviderMonitoringSweep().catch(() => {}), PROVIDER_MONITORING_INTERVAL_MS);
  interval.unref?.();
}, Math.min(30000, PROVIDER_MONITORING_INTERVAL_MS));
providerMonitoringStartupTimer.unref?.();

async function handleSettings(req, res) {
  if (req.method === "GET") {
    sendJson(res, 200, getSettingsResponse(readSettingsFile()));
    return;
  }
  if (req.method !== "PUT") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const payload = await readJson(req);
    const previous = readSettingsFile();
    const next = normalizeSettings(payload, previous);
    writeSettingsFile(next);
    await promoteDraftAgentVerifications(next);
    sendJson(res, 200, getSettingsResponse(next));
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
}

async function handleProviderKeyReveal(req, res) {
  try {
    const payload = await readJson(req);
    const providerId = String(payload.providerId || "").trim();
    if (!providerId) throw new Error("缺少服务商标识。");
    const configured = readSettingsFile().providers || [];
    const configuredIds = new Set(configured.map((provider) => provider.id));
    const provider = configured.find((item) => item.id === providerId)
      || getSystemProviders().find((item) => !configuredIds.has(item.id) && item.id === providerId);
    if (!provider) {
      sendJson(res, 404, { error: "未找到此 API 接入。" });
      return;
    }
    if (!provider.apiKey) throw new Error("此 API 接入尚未保存 Key。");
    sendJson(res, 200, { apiKey: provider.apiKey });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
}

async function handleProviderModels(req, res) {
  try {
    const payload = await readJson(req);
    const storedProvider = readSettingsFile().providers.find((provider) => provider.id === payload.providerId)
      || getSystemProviders().find((provider) => provider.id === payload.providerId);
    const baseUrl = String(payload.baseUrl || storedProvider?.baseUrl || "").trim();
    const apiKey = String(payload.apiKey || storedProvider?.apiKey || "").trim();
    if (!baseUrl) throw new Error("请先填写 API 地址。");
    if (!apiKey) throw new Error("请先填写 API Key。");

    const upstream = await fetch(normalizeModelsApiUrl(baseUrl), {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(20000),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) throw new Error(data?.error?.message || data?.error || data?.message || `获取模型失败 (${upstream.status})`);
    const models = extractProviderModelIds(data);
    if (!models.length) throw new Error("接口已连接，但没有返回可识别的模型列表。");
    sendJson(res, 200, { models });
  } catch (error) {
    sendJson(res, 400, { error: formatUpstreamError(error) });
  }
}

async function handleProviderMonitoring(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  try {
    if (req.method === "POST") await runProviderMonitoringSweep();
    const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const range = String(requestUrl.searchParams.get("range") || "7d");
    sendJson(res, 200, getProviderMonitoringDashboard(range));
  } catch (error) {
    sendJson(res, 500, { error: formatUpstreamError(error) });
  }
}

function readProviderMonitoringFile() {
  try {
    if (!fs.existsSync(PROVIDER_MONITORING_FILE)) return { providers: {} };
    const value = JSON.parse(fs.readFileSync(PROVIDER_MONITORING_FILE, "utf8") || "{}");
    return value && typeof value === "object" && value.providers && typeof value.providers === "object"
      ? value
      : { providers: {} };
  } catch {
    return { providers: {} };
  }
}

function writeProviderMonitoringFile(value) {
  fs.writeFileSync(PROVIDER_MONITORING_FILE, JSON.stringify(value, null, 2));
}

function recordProviderMonitoringSample(provider, status, checkedAt = new Date().toISOString()) {
  if (!provider?.id || !status?.state) return;
  const history = readProviderMonitoringFile();
  const cutoff = Date.now() - PROVIDER_MONITORING_RETENTION_MS;
  const items = Array.isArray(history.providers[provider.id]) ? history.providers[provider.id] : [];
  items.push({
    providerId: provider.id,
    name: String(provider.name || getProviderDisplayName(provider.baseUrl, "API")),
    baseUrl: normalizeProviderBaseUrl(provider.baseUrl || ""),
    state: String(status.state),
    platformState: String(status.platformState || status.state || ""),
    balanceState: String(status.balanceState || ""),
    message: String(status.message || "").slice(0, 240),
    accountState: String(status.accountState || ""),
    latencyMs: Math.max(0, Number(status.latencyMs || 0)),
    httpStatus: Math.max(0, Number(status.httpStatus || 0)),
    checkedAt,
  });
  history.providers[provider.id] = items
    .filter((item) => new Date(item.checkedAt).getTime() >= cutoff)
    .slice(-9000);
  writeProviderMonitoringFile(history);
}

function classifyProviderUsageError(message, httpStatus = 0) {
  const value = String(message || "").toLowerCase();
  if (/insufficient|balance|quota|credit|billing|\u4f59\u989d|\u989d\u5ea6|\u6b20\u8d39/.test(value)) return "balance";
  if (httpStatus === 401 || httpStatus === 403 || /unauthorized|forbidden|invalid.*key|\u9274\u6743/.test(value)) return "auth";
  if (httpStatus === 429 || /rate.?limit|too many requests/.test(value)) return "rate-limit";
  if (httpStatus >= 500) return "server";
  if (!httpStatus || /timeout|network|fetch failed|connect/.test(value)) return "network";
  return "request";
}

function recordProviderUsageEvent(provider, event) {
  if (!provider?.id || !event?.kind) return;
  const history = readProviderMonitoringFile();
  history.usage ||= {};
  const cutoff = Date.now() - PROVIDER_MONITORING_RETENTION_MS;
  const items = Array.isArray(history.usage[provider.id]) ? history.usage[provider.id] : [];
  items.push({
    providerId: provider.id,
    kind: event.kind === "image" ? "image" : "chat",
    model: String(event.model || ""),
    success: Boolean(event.success),
    latencyMs: Math.max(0, Number(event.latencyMs || 0)),
    httpStatus: Math.max(0, Number(event.httpStatus || 0)),
    errorCategory: event.success ? "" : classifyProviderUsageError(event.message, event.httpStatus),
    message: event.success ? "" : String(event.message || "").slice(0, 240),
    checkedAt: event.checkedAt || new Date().toISOString(),
  });
  history.usage[provider.id] = items
    .filter((item) => new Date(item.checkedAt).getTime() >= cutoff)
    .slice(-12000);
  writeProviderMonitoringFile(history);
}

function readCanvasAgentRouteHistory() {
  if (canvasAgentRouteHistory) return canvasAgentRouteHistory;
  let stored = {};
  try {
    if (fs.existsSync(CANVAS_AGENT_ROUTE_HISTORY_FILE)) {
      stored = JSON.parse(fs.readFileSync(CANVAS_AGENT_ROUTE_HISTORY_FILE, "utf8") || "{}");
    } else {
      const legacy = readProviderMonitoringFile();
      stored = { agentRoutes: legacy.agentRoutes, agentCapabilities: legacy.agentCapabilities };
    }
  } catch {
    stored = {};
  }
  canvasAgentRouteHistory = {
    agentRoutes: stored.agentRoutes && typeof stored.agentRoutes === "object" ? stored.agentRoutes : {},
    agentCapabilities: stored.agentCapabilities && typeof stored.agentCapabilities === "object" ? stored.agentCapabilities : {},
  };
  return canvasAgentRouteHistory;
}

function getCanvasAgentCapabilityRegistry() {
  const registry = {};
  const capabilities = readCanvasAgentRouteHistory().agentCapabilities;
  Object.entries(capabilities).forEach(([providerId, models]) => {
    if (!models || typeof models !== "object") return;
    Object.entries(models).forEach(([modelId, value]) => {
      registry[`${providerId}:${modelId}`] = value;
    });
  });
  return registry;
}

function getCanvasAgentEndpointLabel(value) {
  try {
    return new URL(CanvasAgentRouter.normalizeAgentBaseUrl(value)).host || String(value || "");
  } catch {
    return String(value || "").replace(/^https?:\/\//i, "").replace(/\/.*$/, "") || "未知接口";
  }
}

function getCanvasAgentProviderPool(settings = readSettingsFile()) {
  const configured = CANVAS_AGENT_USE_SETTINGS_PROVIDERS ? settings.providers || [] : [];
  const configuredIds = new Set(configured.map((provider) => provider.id));
  return CANVAS_AGENT_USE_SETTINGS_PROVIDERS ? [
    ...getSystemProviders().filter((provider) => !configuredIds.has(provider.id)),
    ...configured,
  ] : [];
}

function getCanvasAgentDiscoveryTargets(settings = readSettingsFile(), providers = getCanvasAgentProviderPool(settings)) {
  const targets = new Set();
  [CANVAS_AGENT_MODEL]
    .map((modelId) => String(modelId || "").trim())
    .filter(Boolean)
    .forEach((modelId) => targets.add(modelId));
  providers.forEach((provider) => {
    (Array.isArray(provider?.models) ? provider.models : [])
      .filter(isPotentialCanvasAgentModel)
      .forEach((model) => targets.add(model.id));
  });
  const capabilities = getCanvasAgentCapabilityRegistry();
  providers.forEach((provider) => {
    const prefix = `${provider.id}:`;
    Object.entries(capabilities).forEach(([key, capability]) => {
      if (!key.startsWith(prefix) || capability?.text === false || capability?.tools === false) return;
      const modelId = key.slice(prefix.length).trim();
      if (modelId) targets.add(modelId);
    });
  });
  return targets;
}

function getCanvasAgentProviderModels(provider, discoveryTargets = null) {
  const saved = Array.isArray(provider?.models) ? provider.models : [];
  const models = new Map(saved.map((model) => [model.id, model]));
  const discovered = canvasAgentModelDiscoveryCache.get(provider?.id);
  (Array.isArray(discovered?.modelIds) ? discovered.modelIds : []).forEach((modelId) => {
    if (discoveryTargets && !discoveryTargets.has(modelId)) return;
    if (!models.has(modelId)) models.set(modelId, { id: modelId, alias: "", capabilities: [] });
  });
  return [...models.values()];
}

function isPotentialCanvasAgentModel(model = {}) {
  const capabilities = new Set(model.capabilities || []);
  if (capabilities.has("text")) return true;
  if (capabilities.has("generation") || capabilities.has("edit")) return false;
  return !/(?:embedding|rerank|moderation|whisper|speech|tts|audio|video|image|dall|midjourney|stable[-_ ]?diffusion|flux)/i.test(String(model.id || ""));
}

async function refreshCanvasAgentModelDiscovery() {
  if (canvasAgentModelDiscoveryPromise) return canvasAgentModelDiscoveryPromise;
  canvasAgentModelDiscoveryPromise = (async () => {
    const providers = getCanvasAgentProviderPool(readSettingsFile())
      .filter((provider) => provider.enabled !== false && provider.baseUrl && provider.apiKey);
    const queue = [...providers];
    const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (queue.length) {
        const provider = queue.shift();
        if (!provider) break;
        const checkedAt = new Date().toISOString();
        const probe = await fetchProviderRuntimeJson(normalizeModelsApiUrl(provider.baseUrl), provider.apiKey, 9000);
        const previous = canvasAgentModelDiscoveryCache.get(provider.id) || {};
        canvasAgentModelDiscoveryCache.set(provider.id, probe.ok ? {
          state: "ready",
          modelIds: extractProviderModelIds(probe.data),
          checkedAt,
          latencyMs: probe.elapsedMs,
          error: "",
        } : {
          ...previous,
          state: "error",
          checkedAt,
          latencyMs: probe.elapsedMs,
          error: probe.message || `模型列表请求失败 (${probe.status || "连接错误"})`,
        });
      }
    });
    await Promise.all(workers);
  })();
  try {
    await canvasAgentModelDiscoveryPromise;
  } finally {
    canvasAgentModelDiscoveryPromise = null;
  }
}

function getCanvasAgentCandidates(payload = {}, options = {}) {
  const settings = readSettingsFile();
  const providerPool = getCanvasAgentProviderPool(settings);
  const discoveryTargets = getCanvasAgentDiscoveryTargets(settings, providerPool);
  const providers = providerPool.map((provider) => ({
    ...provider,
    models: getCanvasAgentProviderModels(provider, discoveryTargets),
  }));
  const fallbackProvider = providers.find((provider) =>
    CanvasAgentRouter.normalizeAgentBaseUrl(provider.baseUrl) === CanvasAgentRouter.normalizeAgentBaseUrl(CANVAS_AGENT_API_URL)
      && provider.apiKey === CANVAS_AGENT_API_KEY);
  const envFallback = {
    id: "canvas-agent-env-fallback",
    providerId: fallbackProvider?.id || "canvas-agent-env-fallback",
    providerName: fallbackProvider?.name || getCanvasAgentEndpointLabel(CANVAS_AGENT_API_URL),
    endpoint: getCanvasAgentEndpointLabel(CANVAS_AGENT_API_URL),
    model: CANVAS_AGENT_MODEL,
    baseUrl: CANVAS_AGENT_API_URL,
    apiKey: CANVAS_AGENT_API_KEY,
    protocol: "responses",
    capabilities: ["text", "vision", "tools"],
    source: "env",
  };
  const candidates = CanvasAgentRouter.buildAgentCandidates({
    providers,
    fallbacks: [envFallback, {
      ...envFallback,
      id: "canvas-agent-env-chat-fallback",
      protocol: "chat",
    }],
    payload,
    capabilityRegistry: getCanvasAgentCapabilityRegistry(),
  });
  if (options.includeCircuitOpen) return candidates;
  const routeHealth = Object.fromEntries(Object.entries(readCanvasAgentRouteHistory().agentRoutes)
    .map(([id, value]) => [id, value?.health || value || {}]));
  return CanvasAgentRouter.orderAgentCandidatesByEndpointDiversity(CanvasAgentRouter.rankAgentCandidates(candidates, routeHealth, {
    routing: settings.agentRouting,
    requiredCapabilities: CanvasAgentRouter.getRequiredAgentCapabilities(payload),
  }));
}

function buildCanvasAgentCandidatePool() {
  const settings = readSettingsFile();
  const routing = CanvasAgentRouter.normalizeAgentRouting(settings.agentRouting);
  const providerPool = getCanvasAgentProviderPool(settings);
  const discoveryTargets = getCanvasAgentDiscoveryTargets(settings, providerPool);
  const providers = providerPool.map((provider) => ({
    ...provider,
    models: getCanvasAgentProviderModels(provider, discoveryTargets),
  }));
  const providerNames = new Map(providers.map((provider) => [provider.id, provider.name || "未命名 API"]));
  const routeHistory = readCanvasAgentRouteHistory().agentRoutes;
  const executable = getCanvasAgentCandidates({}, { includeCircuitOpen: true });
  const executableSelectionIds = [...new Set(executable.map((candidate) => candidate.selectionId))];
  const executableSelectionIdSet = new Set(executableSelectionIds);
  const configuredOrder = routing.candidateOrder.filter((selectionId) => executableSelectionIdSet.has(selectionId));
  const unavailableConfiguredCandidateIds = routing.candidateOrder
    .filter((selectionId) => !executableSelectionIdSet.has(selectionId));
  const rankedSelectionIds = getCanvasAgentCandidates({}).map((candidate) => candidate.selectionId);
  const displaySelectionIds = [...new Set([
    ...configuredOrder,
    ...rankedSelectionIds,
    ...executableSelectionIds,
  ])];
  const rankBySelectionId = new Map(displaySelectionIds.map((selectionId, index) => [selectionId, index]));
  const grouped = new Map();
  executable.forEach((candidate) => {
    const key = candidate.selectionId;
    const health = routeHistory[candidate.id]?.health || routeHistory[candidate.id] || {};
    const current = grouped.get(key) || {
      id: candidate.selectionId,
      selectionId: candidate.selectionId,
      providerId: candidate.providerId,
      providerName: candidate.providerName || providerNames.get(candidate.providerId) || getCanvasAgentEndpointLabel(candidate.baseUrl),
      endpoint: getCanvasAgentEndpointLabel(candidate.baseUrl),
      endpointIdentity: CanvasAgentRouter.normalizeAgentBaseUrl(candidate.baseUrl),
      model: candidate.model,
      source: candidate.source || "settings",
      protocols: [],
      routeIds: [],
      samples: [],
    };
    current.protocols.push(candidate.protocol);
    current.routeIds.push(candidate.id);
    current.samples.push(health);
    grouped.set(key, current);
  });
  const candidates = [...grouped.values()].map((item) => {
    const samples = item.samples;
    const successes = samples.reduce((total, health) => total + Math.max(0, Number(health.successes || 0)), 0);
    const failures = samples.reduce((total, health) => total + Math.max(0, Number(health.failures || 0)), 0);
    const total = successes + failures;
    const firstEventMs = samples
      .map((health) => Number(health.ewmaFirstEventMs || health.ewmaLatencyMs || 0))
      .filter((value) => value > 0)
      .sort((left, right) => left - right)[0] || 0;
    const consecutiveFailures = Math.max(0, ...samples.map((health) => Number(health.consecutiveFailures || 0)));
    const circuitOpenUntil = Math.max(0, ...samples.map((health) => Number(health.circuitOpenUntil || 0)));
    return {
      id: item.id,
      selectionId: item.selectionId,
      providerId: item.providerId,
      providerName: item.providerName,
      endpoint: item.endpoint,
      endpointIdentity: item.endpointIdentity,
      model: item.model,
      isPrimary: routing.primaryCandidateId === item.selectionId,
      source: item.source,
      protocols: [...new Set(item.protocols)],
      state: circuitOpenUntil > Date.now() ? "circuit_open" : "ready",
      firstEventMs,
      successRate: total ? Math.round(successes / total * 1000) / 10 : null,
      consecutiveFailures,
      circuitOpenUntil,
    };
  }).sort((left, right) => {
    const leftRank = rankBySelectionId.get(left.selectionId) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = rankBySelectionId.get(right.selectionId) ?? Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank
      || left.providerName.localeCompare(right.providerName, "zh-CN")
      || left.model.localeCompare(right.model, "zh-CN");
  });
  let readyRank = 0;
  candidates.forEach((item) => {
    item.rank = item.state === "ready" ? ++readyRank : null;
  });
  const executableKeys = new Set(candidates.map((item) => `${item.providerId}\n${item.model}`));
  const capabilities = getCanvasAgentCapabilityRegistry();
  const discovered = providers.flatMap((provider) => (Array.isArray(provider.models) ? provider.models : [])
    .filter(isPotentialCanvasAgentModel)
    .map((model) => {
      const capability = capabilities[`${provider.id}:${model.id}`] || {};
      const ready = executableKeys.has(`${provider.id}\n${model.id}`);
      return {
        id: `${provider.id}\n${model.id}`,
        providerId: provider.id,
        providerName: provider.name || "未命名 API",
        endpoint: getCanvasAgentEndpointLabel(provider.baseUrl),
        endpointIdentity: CanvasAgentRouter.normalizeAgentBaseUrl(provider.baseUrl),
        model: model.id,
        discovery: canvasAgentModelDiscoveryCache.get(provider.id) || null,
        state: ready ? "ready" : capability.text === false || capability.tools === false ? "unsupported" : "pending_verification",
      };
    }))
    .filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index)
    .filter((item) => item.state !== "ready");
  return {
    routing,
    configuredOrder,
    unavailableConfiguredCandidateIds,
    needsReconfiguration: Boolean(
      routing.primaryCandidateId && !executableSelectionIdSet.has(routing.primaryCandidateId)
        || routing.candidateOrder.length && !configuredOrder.length,
    ),
    summary: {
      ready: candidates.filter((item) => item.state === "ready").length,
      circuitOpen: candidates.filter((item) => item.state === "circuit_open").length,
      pendingVerification: discovered.filter((item) => item.state === "pending_verification").length,
    },
    candidates,
    discovered,
  };
}

async function handleCanvasAgentCandidatePool(req, res) {
  try {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }
    const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (["1", "true", "yes"].includes(String(requestUrl.searchParams.get("refresh") || "").toLowerCase())) {
      await refreshCanvasAgentModelDiscovery();
    }
    sendJson(res, 200, buildCanvasAgentCandidatePool());
  } catch (error) {
    sendJson(res, 500, { error: `读取 Agent 候选池失败：${error.message}` });
  }
}

function queueCanvasAgentRouteEvent(candidate, event = {}) {
  if (!CANVAS_AGENT_ROUTE_HISTORY_ENABLED || !candidate?.id) return;
  const state = readCanvasAgentRouteHistory();
  const previous = state.agentRoutes[candidate.id] || {};
  const checkedAt = event.checkedAt || new Date().toISOString();
  const at = new Date(checkedAt).getTime() || Date.now();
  const category = event.success ? "" : CanvasAgentRouter.classifyAgentRouteError(event);
  const health = CanvasAgentRouter.updateAgentRouteHealth(previous.health || previous, {
    success: Boolean(event.success),
    category,
    at,
    firstEventMs: event.firstEventMs,
    latencyMs: event.latencyMs,
  });
  const events = Array.isArray(previous.events) ? previous.events : [];
  events.push({
    success: Boolean(event.success),
    category,
    latencyMs: Math.max(0, Number(event.latencyMs || 0)),
    firstEventMs: Math.max(0, Number(event.firstEventMs || 0)),
    httpStatus: Math.max(0, Number(event.httpStatus || 0)),
    checkedAt,
  });
  state.agentRoutes[candidate.id] = {
    health,
    events: events.slice(-CanvasAgentRouter.DEFAULT_POLICY.historyLimit),
  };
  if (!canvasAgentRouteFlushTimer) {
    canvasAgentRouteFlushTimer = setTimeout(() => {
      canvasAgentRouteFlushTimer = null;
      flushCanvasAgentRouteEvents().catch(() => {});
    }, 250);
    canvasAgentRouteFlushTimer.unref?.();
  }
}

async function flushCanvasAgentRouteEvents() {
  const snapshot = JSON.parse(JSON.stringify(readCanvasAgentRouteHistory()));
  canvasAgentRouteFlushPromise = canvasAgentRouteFlushPromise.then(async () => {
    const stored = {
      agentRoutes: snapshot.agentRoutes,
      agentCapabilities: snapshot.agentCapabilities,
    };
    const temporaryFile = `${CANVAS_AGENT_ROUTE_HISTORY_FILE}.${process.pid}.tmp`;
    await fs.promises.writeFile(temporaryFile, JSON.stringify(stored, null, 2));
    await fs.promises.rename(temporaryFile, CANVAS_AGENT_ROUTE_HISTORY_FILE);
  });
  return canvasAgentRouteFlushPromise;
}

function setCanvasAgentCapability(providerId, modelId, capability) {
  if (!CANVAS_AGENT_ROUTE_HISTORY_ENABLED || !providerId || !modelId) return;
  const definedCapability = Object.fromEntries(
    Object.entries(capability || {}).filter(([, value]) => value !== undefined),
  );
  const state = readCanvasAgentRouteHistory();
  state.agentCapabilities[providerId] ||= {};
  state.agentCapabilities[providerId][modelId] = {
    ...(state.agentCapabilities[providerId][modelId] || {}),
    ...definedCapability,
    checkedAt: definedCapability.checkedAt || new Date().toISOString(),
  };
  if (!canvasAgentRouteFlushTimer) {
    canvasAgentRouteFlushTimer = setTimeout(() => {
      canvasAgentRouteFlushTimer = null;
      flushCanvasAgentRouteEvents().catch(() => {});
    }, 250);
    canvasAgentRouteFlushTimer.unref?.();
  }
}

function buildDraftAgentVerificationFingerprint(provider, model) {
  const providerId = String(provider?.id || "").trim();
  const modelId = String(model?.id || model || "").trim();
  const baseUrl = CanvasAgentRouter.normalizeAgentBaseUrl(provider?.baseUrl || "");
  const keyDigest = crypto.createHash("sha256").update(String(provider?.apiKey || "")).digest("hex");
  return crypto.createHash("sha256").update(`${providerId}\n${modelId}\n${baseUrl}\n${keyDigest}`).digest("hex");
}

function normalizeDraftAgentVerificationProvider(value, providerId, modelId) {
  const normalized = normalizeSettings({ providers: [value] }).providers[0] || null;
  if (!normalized || normalized.id !== providerId) throw new Error("草稿 API 与当前接入不一致，请重新验证。");
  if (!normalized.baseUrl) throw new Error("请先填写 API 地址。");
  if (!normalized.apiKey) throw new Error("请先填写 API Key。");
  const model = (normalized.models || []).find((item) => item.id === modelId);
  if (!model) throw new Error("请先在草稿中添加要验证的模型。");
  return { provider: normalized, model };
}

function pruneDraftAgentVerificationCache(now = Date.now()) {
  draftAgentVerificationCache.forEach((entry, fingerprint) => {
    if (!entry || Number(entry.expiresAt || 0) <= now) draftAgentVerificationCache.delete(fingerprint);
  });
}

async function promoteDraftAgentVerifications(settings) {
  pruneDraftAgentVerificationCache();
  let promoted = false;
  (settings?.providers || []).forEach((provider) => {
    (provider?.models || []).forEach((model) => {
      const fingerprint = buildDraftAgentVerificationFingerprint(provider, model);
      const entry = draftAgentVerificationCache.get(fingerprint);
      if (!entry || entry.result?.state !== "verified") return;
      setCanvasAgentCapability(provider.id, model.id, entry.result);
      draftAgentVerificationCache.delete(fingerprint);
      promoted = true;
    });
  });
  if (promoted) await flushCanvasAgentRouteEvents();
  return promoted;
}

function acquireCanvasAgentHalfOpenLease(candidate, now = Date.now()) {
  const route = readCanvasAgentRouteHistory().agentRoutes[candidate?.id] || {};
  const health = route.health || route;
  const halfOpen = CanvasAgentRouter.isAgentRouteHalfOpen(health, now);
  if (!halfOpen) return { acquired: true, halfOpen: false };
  if (canvasAgentHalfOpenRoutes.has(candidate.id)) return { acquired: false, halfOpen: true };
  canvasAgentHalfOpenRoutes.add(candidate.id);
  return { acquired: true, halfOpen: true };
}

function summarizeProviderUsageCapability(events) {
  const items = Array.isArray(events) ? events.filter(Boolean) : [];
  const latest = items.at(-1);
  if (!latest) return { state: "untested", kind: "", checkedAt: "", message: "" };
  if (latest.success) {
    return {
      state: "verified",
      kind: String(latest.kind || ""),
      checkedAt: String(latest.checkedAt || ""),
      message: "",
    };
  }
  const stateMap = {
    balance: "balance-error",
    auth: "auth-error",
    "rate-limit": "rate-limited",
    network: "unstable",
    server: "unstable",
    request: "rejected",
  };
  return {
    state: stateMap[latest.errorCategory] || "failed",
    kind: String(latest.kind || ""),
    checkedAt: String(latest.checkedAt || ""),
    message: String(latest.message || ""),
  };
}

function getProviderUsageCapability(providerId) {
  const history = readProviderMonitoringFile();
  return summarizeProviderUsageCapability(history.usage?.[providerId] || []);
}

function getProviderMonitoringRangeMs(range) {
  return {
    "6h": 6 * 60 * 60 * 1000,
    "2d": 2 * 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  }[range] || 7 * 24 * 60 * 60 * 1000;
}

function buildProviderMonitoringTrend(samples, startMs, endMs, bucketCount = 50) {
  const count = Math.max(1, Math.min(100, Number(bucketCount) || 50));
  const start = Number(startMs) || Date.now() - 6 * 60 * 60 * 1000;
  const end = Math.max(start + 1, Number(endMs) || Date.now());
  const bucketWidth = (end - start) / count;
  const buckets = Array.from({ length: count }, (_, index) => ({
    startMs: start + bucketWidth * index,
    endMs: start + bucketWidth * (index + 1),
    samples: [],
  }));
  (Array.isArray(samples) ? samples : []).forEach((sample) => {
    const checkedAt = new Date(sample?.checkedAt).getTime();
    if (!Number.isFinite(checkedAt) || checkedAt < start || checkedAt > end) return;
    const index = Math.min(count - 1, Math.max(0, Math.floor(((checkedAt - start) / (end - start)) * count)));
    buckets[index].samples.push(sample);
  });
  const isHealthy = (item) => ["online", "reachable"].includes(item?.state)
    || (item?.state === "auth-error" && Number(item?.httpStatus || 0) > 0 && Number(item?.httpStatus || 0) < 500);
  return buckets.map((bucket) => {
    const sampleCount = bucket.samples.length;
    const healthyCount = bucket.samples.filter(isHealthy).length;
    const successRate = sampleCount ? Math.round((healthyCount / sampleCount) * 1000) / 10 : null;
    const state = successRate === null
      ? "unknown"
      : successRate >= 99
        ? "online"
        : successRate >= 80
          ? "reachable"
          : successRate >= 50
            ? "unstable"
            : "offline";
    return {
      state,
      successRate,
      sampleCount,
      startAt: new Date(bucket.startMs).toISOString(),
      endAt: new Date(bucket.endMs).toISOString(),
    };
  });
}

function getProviderCurrentState(provider, latest) {
  if (provider?.enabled === false) return "disabled";
  if (!latest) return "unknown";
  if (latest.accountState === "balance-error" || latest.state === "balance-error") return "balance-error";
  if (latest.accountState === "auth-error" || latest.state === "auth-error") return "account-limited";
  const state = latest.state || "unknown";
  if (["online", "reachable"].includes(state) && Number(latest.latencyMs || 0) >= 4000) return "slow";
  return state;
}

function summarizeProviderMonitoring(provider, samples, usageEvents = [], trendRange = {}) {
  const successfulStates = new Set(["online", "reachable"]);
  const isPlatformReachable = (item) => successfulStates.has(item.state)
    || (item.state === "auth-error" && Number(item.httpStatus || 0) > 0 && Number(item.httpStatus || 0) < 500);
  const successful = samples.filter(isPlatformReachable);
  const successfulUsage = usageEvents.filter((item) => item.success);
  const imageUsage = usageEvents.filter((item) => item.kind === "image");
  const successfulImageUsage = imageUsage.filter((item) => item.success);
  const latestUsage = usageEvents.at(-1) || null;
  const usageSuccessRate = usageEvents.length ? Math.round((successfulUsage.length / usageEvents.length) * 1000) / 10 : null;
  const availability = samples.length ? Math.round((successful.length / samples.length) * 1000) / 10 : null;
  const avgLatencyMs = successful.length
    ? Math.round(successful.reduce((total, item) => total + Number(item.latencyMs || 0), 0) / successful.length)
    : null;
  const latest = samples.at(-1) || null;
  const currentState = getProviderCurrentState(provider, latest);
  const recent = samples.slice(-12);
  const recentHealthy = recent.filter(isPlatformReachable).length;
  const recentFailed = recent.length - recentHealthy;
  let state = provider.enabled === false ? "disabled" : latest?.state || "unknown";
  if (state === "online" && Number(latest?.latencyMs || 0) >= 4000) state = "slow";
  if (provider.enabled !== false && recent.length >= 4 && recentHealthy > 0 && recentFailed > 0) state = "unstable";
  if (provider.enabled !== false && ["offline", "connection-error"].includes(latest?.state)) state = latest.state;
  if (provider.enabled !== false && latest?.accountState === "balance-error") state = "balance-error";
  else if (provider.enabled !== false && latest?.accountState === "auth-error") state = "account-limited";
  if (provider.enabled !== false && latestUsage && !latestUsage.success) {
    if (latestUsage.errorCategory === "balance") state = "balance-error";
    else if (latestUsage.errorCategory === "auth") state = "account-limited";
    else if (["server", "network"].includes(latestUsage.errorCategory)) state = "unstable";
  }
  return {
    id: provider.id,
    name: provider.name,
    platformState: latest?.platformState || latest?.state || "unknown",
    accountState: latest?.accountState || "unknown",
    balanceState: latest?.balanceState || "unknown",
    message: latest?.message || "",
    baseUrl: provider.baseUrl,
    enabled: provider.enabled !== false,
    managed: Boolean(provider.managed),
    state,
    currentState,
    availability,
    avgLatencyMs,
    sampleCount: samples.length,
    lastCheckedAt: latest?.checkedAt || "",
    usage: {
      totalCalls: usageEvents.length,
      successfulCalls: successfulUsage.length,
      successRate: usageSuccessRate,
      imageCalls: imageUsage.length,
      successfulImageCalls: successfulImageUsage.length,
      chatCalls: usageEvents.filter((item) => item.kind === "chat").length,
      lastUsedAt: latestUsage?.checkedAt || "",
      lastErrorCategory: latestUsage?.success ? "" : latestUsage?.errorCategory || "",
    },
    trend: buildProviderMonitoringTrend(
      samples,
      trendRange.startMs || Date.now() - 7 * 24 * 60 * 60 * 1000,
      trendRange.endMs || Date.now(),
      50,
    ),
    recent: samples.slice(-72).map((item) => ({
      state: isPlatformReachable(item) && item.state === "auth-error" ? "reachable" : item.state,
      latencyMs: item.latencyMs,
      checkedAt: item.checkedAt,
    })),
  };
}

function compareProviderMonitoringQuality(left, right) {
  const rank = {
    online: 0,
    reachable: 1,
    slow: 2,
    unstable: 3,
    degraded: 4,
    "balance-error": 5,
    "connection-error": 8,
    "account-limited": 6,
    unknown: 7,
    offline: 9,
    disabled: 10,
  };
  const stateDifference = (rank[left.state] ?? 7) - (rank[right.state] ?? 7);
  if (stateDifference) return stateDifference;
  const availabilityDifference = Number(right.availability ?? -1) - Number(left.availability ?? -1);
  if (availabilityDifference) return availabilityDifference;
  const latencyDifference = Number(left.avgLatencyMs ?? Number.MAX_SAFE_INTEGER) - Number(right.avgLatencyMs ?? Number.MAX_SAFE_INTEGER);
  return latencyDifference || String(left.name || "").localeCompare(String(right.name || ""), "zh-CN");
}

function getProviderMonitoringDashboard(range = "7d") {
  const history = readProviderMonitoringFile();
  const generatedAtMs = Date.now();
  const cutoff = generatedAtMs - getProviderMonitoringRangeMs(range);
  const settings = getSettingsResponse(readSettingsFile());
  const providers = settings.providers.map((provider) => {
    const storedSamples = history.providers[provider.id] || [];
    const storedUsage = history.usage?.[provider.id] || [];
    const samples = range === "realtime"
      ? storedSamples.slice(-50)
      : storedSamples.filter((item) => new Date(item.checkedAt).getTime() >= cutoff);
    const usageEvents = range === "realtime"
      ? storedUsage.slice(-50)
      : storedUsage.filter((item) => new Date(item.checkedAt).getTime() >= cutoff);
    return summarizeProviderMonitoring(provider, samples, usageEvents, {
      startMs: cutoff,
      endMs: generatedAtMs,
    });
  }).sort(compareProviderMonitoringQuality);
  return {
    range,
    generatedAt: new Date(generatedAtMs).toISOString(),
    providers,
    summary: {
      total: providers.length,
      online: providers.filter((item) => ["online", "reachable", "slow"].includes(item.currentState)).length,
      unstable: providers.filter((item) => ["unstable", "slow", "degraded", "account-limited", "balance-error"].includes(item.state)).length,
      unavailable: providers.filter((item) => ["offline", "connection-error"].includes(item.currentState)).length,
      disabled: providers.filter((item) => item.currentState === "disabled").length,
    },
  };
}

async function probeProviderRuntimeStatus(provider) {
  const baseUrl = String(provider?.baseUrl || "").trim();
  const apiKey = String(provider?.apiKey || "").trim();
  if (!baseUrl || !apiKey) {
    return { state: "offline", latencyMs: 0, httpStatus: 0, modelCount: 0, message: "Missing API address or key" };
  }
  const modelProbe = await fetchProviderRuntimeJson(normalizeModelsApiUrl(baseUrl), apiKey, 9000);
  const modelIds = modelProbe.ok ? extractProviderModelIds(modelProbe.data) : [];
  const fallbackProbe = modelProbe.ok
    ? null
    : await fetchProviderRuntimeJson(getProviderRuntimeFallbackUrl(baseUrl, provider), apiKey, 6500, "HEAD");
  const classifiedState = classifyProviderRuntimeStatus(modelProbe, fallbackProbe);
  let accountState = ["auth-error", "balance-error"].includes(classifiedState) ? classifiedState : "";
  let balanceState = classifiedState === "balance-error" ? "insufficient" : "unknown";
  if (!accountState && ["online", "reachable", "degraded"].includes(classifiedState)) {
    const v1Base = normalizeModelsApiUrl(baseUrl).replace(/\/models$/i, "");
    const host = getProviderRuntimeHost(baseUrl);
    const candidates = host.includes("hyhawang.com")
      ? [
          { url: `${v1Base}/sub2api/billing`, source: "sub2api-billing" },
          { url: `${v1Base}/usage?days=7`, source: "usage" },
        ]
      : [{ url: `${v1Base}/token/quota`, source: "token-quota" }];
    for (const candidate of candidates) {
      const balanceProbe = await fetchProviderRuntimeJson(candidate.url, apiKey, 5000);
      if (!balanceProbe.ok) continue;
      balanceState = classifyProviderBalanceState(extractProviderBalance(balanceProbe.data, candidate.source));
      if (balanceState !== "unknown") break;
    }
  }
  if (["negative", "depleted", "insufficient"].includes(balanceState)) accountState = "balance-error";
  else if (balanceState === "available") accountState = "healthy";
  const activeProbe = modelProbe.ok ? modelProbe : fallbackProbe || modelProbe;
  const platformState = classifiedState === "offline" && !activeProbe.status
    ? "connection-error"
    : ["auth-error", "balance-error"].includes(classifiedState)
      ? "reachable"
      : classifiedState;
  const state = ["auth-error", "balance-error"].includes(accountState) ? "reachable" : platformState;
  return {
    state,
    platformState,
    latencyMs: activeProbe.elapsedMs,
    accountState,
    httpStatus: activeProbe.status,
    modelCount: modelIds.length,
    balanceState,
    message: accountState === "balance-error"
      ? balanceState === "negative"
        ? "Account balance is negative"
        : balanceState === "depleted"
          ? "Account balance is depleted"
          : modelProbe.message || "Account balance is insufficient"
      : modelProbe.ok
        ? "Model discovery endpoint is available"
        : modelProbe.message || `Model endpoint returned ${modelProbe.status || "connection error"}`,
  };
}

async function runProviderMonitoringSweep() {
  if (providerMonitoringSweepRunning) return getProviderMonitoringDashboard("7d");
  providerMonitoringSweepRunning = true;
  try {
    const configured = readSettingsFile().providers || [];
    const configuredIds = new Set(configured.map((provider) => provider.id));
    const providers = [
      ...getSystemProviders().filter((provider) => !configuredIds.has(provider.id)),
      ...configured,
    ].filter((provider) => provider.enabled !== false && provider.baseUrl && provider.apiKey);
    const queue = [...providers];
    const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
      while (queue.length) {
        const provider = queue.shift();
        if (!provider) break;
        const status = await probeProviderRuntimeStatus(provider);
        recordProviderMonitoringSample(provider, status);
      }
    });
    await Promise.all(workers);
    return getProviderMonitoringDashboard("7d");
  } finally {
    providerMonitoringSweepRunning = false;
  }
}

async function handleProviderRuntime(req, res) {
  try {
    const payload = await readJson(req);
    const storedProvider = readSettingsFile().providers.find((provider) => provider.id === payload.providerId)
      || getSystemProviders().find((provider) => provider.id === payload.providerId);
    const baseUrl = String(payload.baseUrl || storedProvider?.baseUrl || "").trim();
    const apiKey = String(payload.apiKey || storedProvider?.apiKey || "").trim();
    if (!baseUrl) throw new Error("请先填写 API 地址。");
    if (!apiKey) throw new Error("请先填写 API Key。");

    const modelProbe = await fetchProviderRuntimeJson(normalizeModelsApiUrl(baseUrl), apiKey, 9000);
    const modelIds = modelProbe.ok ? extractProviderModelIds(modelProbe.data) : [];
    const prices = modelProbe.ok ? extractProviderPrices(modelProbe.data) : [];
    const v1Base = normalizeModelsApiUrl(baseUrl).replace(/\/models$/i, "");
    const host = getProviderRuntimeHost(baseUrl);
    const fallbackProbe = modelProbe.ok
      ? null
      : await fetchProviderRuntimeJson(
          getProviderRuntimeFallbackUrl(baseUrl, storedProvider),
          apiKey,
          6500,
          "HEAD",
        );
    const statusState = classifyProviderRuntimeStatus(modelProbe, fallbackProbe);
    const insufficientBalance = statusState === "balance-error";
    const balanceUrls = host.includes("hyhawang.com")
      ? [
          { url: `${v1Base}/sub2api/billing`, source: "sub2api-billing" },
          { url: `${v1Base}/usage?days=7`, source: "usage" },
        ]
      : [{ url: `${v1Base}/token/quota`, source: "token-quota" }];

    let balance = { available: false };
    let balanceProbeFailed = false;
    if (["online", "reachable", "degraded"].includes(statusState)) {
      for (const candidate of balanceUrls) {
        const probe = await fetchProviderRuntimeJson(candidate.url, apiKey, 7000);
        if (!probe.ok) {
          balanceProbeFailed ||= probe.status !== 404;
          continue;
        }
        balance = extractProviderBalance(probe.data, candidate.source);
        prices.push(...extractProviderPrices(probe.data));
        if (balance.available) break;
      }
    }

    const uniquePrices = [...new Map(prices.map((item) => [`${item.model}\n${item.display}`, item])).values()].slice(0, 30);
    const activeProbe = modelProbe.ok ? modelProbe : fallbackProbe || modelProbe;
    const detectedBalanceState = insufficientBalance ? "insufficient" : classifyProviderBalanceState(balance);
    const runtimeBalance = balance.available
      ? { state: detectedBalanceState, ...balance }
      : insufficientBalance
        ? {
            state: "insufficient",
            available: false,
            message: "\u5e73\u53f0\u5df2\u660e\u786e\u8fd4\u56de\u4f59\u989d\u4e0d\u8db3\uff0c\u8bf7\u5145\u503c\u540e\u91cd\u8bd5",
          }
        : {
            state: balanceProbeFailed ? "error" : "unsupported",
            available: false,
            message: balanceProbeFailed
              ? "\u4f59\u989d\u63a5\u53e3\u6682\u65f6\u4e0d\u53ef\u7528"
              : "\u670d\u52a1\u5546\u672a\u5411\u6b64 Key \u5f00\u653e\u4f59\u989d\u67e5\u8be2",
          };
    const platformState = statusState === "offline" && !activeProbe.status
      ? "connection-error"
      : ["auth-error", "balance-error"].includes(statusState)
        ? "reachable"
        : statusState;
    const accountState = statusState === "auth-error"
      ? "auth-error"
      : statusState === "balance-error" || ["negative", "depleted", "insufficient"].includes(detectedBalanceState)
        ? "balance-error"
        : detectedBalanceState === "available" ? "healthy" : "unknown";
    const effectiveStatusState = accountState === "balance-error"
      ? "balance-error"
      : accountState === "auth-error" ? "auth-error" : platformState;
    const accountMessage = detectedBalanceState === "negative"
      ? `\u5f53\u524d Key \u4f59\u989d\u4e3a\u8d1f\u6570 (${balance.value})\uff0c\u8bf7\u5145\u503c\u6216\u786e\u8ba4\u8be5\u5e73\u53f0\u662f\u5426\u652f\u6301\u540e\u4ed8\u8d39`
      : detectedBalanceState === "depleted"
        ? "\u5f53\u524d Key \u4f59\u989d\u4e3a 0\uff0c\u8bf7\u5145\u503c\u540e\u91cd\u8bd5"
        : runtimeBalance.message || "";
    if (accountMessage && runtimeBalance.state !== "available") runtimeBalance.message = accountMessage;
    const capability = getProviderUsageCapability(storedProvider?.id || payload.providerId);
    sendJson(res, 200, {
      checkedAt: new Date().toISOString(),
      adapter: host.includes("hyhawang.com") ? "hyhawang" : host.includes("coolhs.com") ? "coolhs" : "openai-compatible",
      status: {
        state: effectiveStatusState,
        platformState,
        accountState,
        latencyMs: activeProbe.elapsedMs,
        httpStatus: activeProbe.status,
        modelCount: modelIds.length,
        message: modelProbe.ok
          ? "模型接口连接正常"
          : modelProbe.message || `模型接口返回 ${modelProbe.status || "连接错误"}`,
      },
      balance: insufficientBalance
        ? {
            state: "insufficient",
            available: false,
            message: "平台已明确返回余额不足，请充值后重试",
          }
        : balance.available
        ? { state: "available", ...balance }
        : {
            state: balanceProbeFailed ? "error" : "unsupported",
            available: false,
            message: balanceProbeFailed ? "余额接口暂时不可用" : "服务商未向此 Key 开放余额查询",
          },
      balance: runtimeBalance,
      capability,
      pricing: uniquePrices.length
        ? { state: "available", items: uniquePrices }
        : {
            state: "unsupported",
            items: [],
            message: "模型接口未返回实时价格",
          },
    });
  } catch (error) {
    sendJson(res, 400, { error: formatUpstreamError(error) });
  }
}

async function verifyProviderAgentVision({ adapter, candidate, modelId }) {
  const requestText = "Name the dominant color of this one-pixel image in one word.";
  const body = adapter.buildVisionProbe({
    model: modelId,
    prompt: requestText,
    imageUrl: CANVAS_AGENT_VISION_PROBE_IMAGE,
  });
  try {
    const response = await fetch(adapter.getEndpoint(candidate), {
      method: "POST",
      headers: {
        ...adapter.getHeaders(candidate),
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(CANVAS_AGENT_VERIFICATION_TIMEOUT_MS),
    });
    if (!response.ok) return false;
    const data = await response.json().catch(() => null);
    if (!data) return false;
    const turn = adapter.parseResponse(data);
    return Boolean(turn.message);
  } catch {
    return false;
  }
}

async function verifyProviderAgentCandidate(provider, model, { persistResult = true } = {}) {
  const nonce = crypto.randomBytes(8).toString("hex");
  const reportAgentProbe = {
    name: "report_agent_probe",
    description: "Return the supplied nonce to verify tool calling.",
    parameters: {
      type: "object",
      properties: { nonce: { type: "string" } },
      required: ["nonce"],
      additionalProperties: false,
    },
  };
  const existing = getCanvasAgentCapabilityRegistry()[`${provider.id}:${model.id}`] || {};
  const preferredAdapterId = CanvasAgentLlmConnectors.normalizeLlmConnectorId(existing.adapterId, existing.protocol || "chat");
  const adapterIds = [preferredAdapterId, "openai-chat", "openai-responses"]
    .filter((id, index, items) => items.indexOf(id) === index);
  const base = CanvasAgentRouter.normalizeAgentBaseUrl(provider.baseUrl);
  const attempts = [];
  let partial = null;
  for (const adapterId of adapterIds) {
    const startedAt = Date.now();
    try {
      const adapter = CanvasAgentLlmConnectors.getLlmConnector(adapterId);
      const candidate = CanvasAgentRouter.normalizeAgentCandidate({
        providerId: provider.id,
        model: model.id,
        baseUrl: base,
        apiKey: provider.apiKey,
        protocol: adapter.protocol,
        adapterId: adapter.id,
        capabilities: ["text", "vision", "tools"],
      });
      const body = adapter.buildToolProbe({
        model: model.id,
        prompt: `Call report_agent_probe once with nonce ${nonce}. Do not answer with prose.`,
        tool: reportAgentProbe,
      });
      const response = await fetch(adapter.getEndpoint(candidate), {
        method: "POST",
        headers: {
          ...adapter.getHeaders(candidate),
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(CANVAS_AGENT_VERIFICATION_TIMEOUT_MS),
      });
      const text = await response.text();
      let data = {};
      try {
        data = JSON.parse(text || "{}");
      } catch {
        throw makeCanvasAgentAttemptError("Agent 验证接口返回了无效 JSON。", { code: "INVALID_JSON" });
      }
      if (!response.ok) {
        const message = data?.error?.message || data?.error || data?.message || `${response.status} ${response.statusText}`;
        throw makeCanvasAgentAttemptError(message, { httpStatus: response.status });
      }
      const turn = adapter.parseResponse(data);
      const call = turn.tool_calls.find((item) => item.name === "report_agent_probe");
      const latencyMs = Date.now() - startedAt;
      const validNonce = String(call?.arguments?.nonce || "") === nonce;
      if (validNonce) {
        const declaresVision = model.capabilities?.includes("vision");
        const visionVerified = declaresVision
          ? await verifyProviderAgentVision({ adapter, candidate, modelId: model.id })
          : false;
        const result = {
          state: "verified",
          checkedAt: new Date().toISOString(),
          text: true,
          tools: true,
          vision: declaresVision ? visionVerified || "untested" : false,
          latencyMs,
          protocol: adapter.protocol,
          adapterId: adapter.id,
          message: "真实推理与工具调用均已通过",
        };
        if (persistResult) {
          setCanvasAgentCapability(provider.id, model.id, result);
          queueCanvasAgentRouteEvent(candidate, { success: true, latencyMs, firstEventMs: latencyMs });
          await flushCanvasAgentRouteEvents();
        }
        return result;
      }
      partial = {
        state: "partial",
        checkedAt: new Date().toISOString(),
        text: Boolean(turn.message),
        tools: false,
        vision: model.capabilities?.includes("vision") ? "untested" : false,
        latencyMs,
        protocol: adapter.protocol,
        adapterId: adapter.id,
        message: "接口可以推理，但没有完成工具调用验证",
      };
    } catch (error) {
      const category = CanvasAgentRouter.classifyAgentRouteError(error);
      attempts.push({
        adapterId,
        category,
        message: CanvasAgentRouter.formatAgentVerificationError(error, {
          timeoutMs: CANVAS_AGENT_VERIFICATION_TIMEOUT_MS,
        }),
      });
      if (["auth", "balance"].includes(category)) break;
    }
  }
  if (partial) {
    if (persistResult) {
      setCanvasAgentCapability(provider.id, model.id, partial);
      await flushCanvasAgentRouteEvents();
    }
    return partial;
  }
  const finalAttempt = attempts.at(-1) || {};
  const failure = new Error(finalAttempt.message || "Agent 真实调用验证失败。");
  failure.category = finalAttempt.category || "request";
  throw failure;
}

async function handleProviderAgentVerify(req, res) {
  try {
    const payload = await readJson(req);
    const providerId = String(payload.providerId || "").trim();
    const modelId = String(payload.modelId || "").trim();
    const hasDraftProvider = Boolean(payload.draftProvider && typeof payload.draftProvider === "object");
    const configured = readSettingsFile().providers || [];
    const configuredIds = new Set(configured.map((provider) => provider.id));
    const draft = hasDraftProvider
      ? normalizeDraftAgentVerificationProvider(payload.draftProvider, providerId, modelId)
      : null;
    const provider = draft?.provider || configured.find((item) => item.id === providerId)
      || getSystemProviders().find((item) => !configuredIds.has(item.id) && item.id === providerId);
    if (!provider) throw new Error("未找到此 API 接入。");
    if (!hasDraftProvider && (!provider.enabled || !provider.baseUrl || !provider.apiKey)) throw new Error("此 API 接入尚未启用或未保存 Key。");
    const model = draft?.model || getCanvasAgentProviderModels(provider).find((item) => item.id === modelId);
    if (!model) throw new Error("未找到要验证的模型。");

    const fingerprint = hasDraftProvider ? buildDraftAgentVerificationFingerprint(provider, model) : "";
    const verificationKey = hasDraftProvider ? `draft:${fingerprint}` : `${provider.id}:${model.id}`;
    let verification = canvasAgentVerificationPromises.get(verificationKey);
    if (!verification) {
      verification = verifyProviderAgentCandidate(provider, model, { persistResult: !hasDraftProvider });
      canvasAgentVerificationPromises.set(verificationKey, verification);
    }
    try {
      const result = await verification;
      if (hasDraftProvider && result?.state === "verified") {
        pruneDraftAgentVerificationCache();
        draftAgentVerificationCache.set(fingerprint, {
          providerId: provider.id,
          modelId: model.id,
          result,
          expiresAt: Date.now() + DRAFT_AGENT_VERIFICATION_TTL_MS,
        });
      }
      sendJson(res, 200, hasDraftProvider ? { ...result, draft: true } : result);
    } finally {
      if (canvasAgentVerificationPromises.get(verificationKey) === verification) {
        canvasAgentVerificationPromises.delete(verificationKey);
      }
    }
  } catch (error) {
    sendJson(res, 400, {
      error: CanvasAgentRouter.formatAgentVerificationError(error, {
        timeoutMs: CANVAS_AGENT_VERIFICATION_TIMEOUT_MS,
      }),
      category: CanvasAgentRouter.classifyAgentRouteError(error),
    });
  }
}

function classifyProviderRuntimeStatus(primaryProbe, fallbackProbe) {
  if (primaryProbe?.ok) return "online";
  const primaryErrorCategory = classifyProviderUsageError(primaryProbe?.message, primaryProbe?.status);
  const fallbackErrorCategory = classifyProviderUsageError(fallbackProbe?.message, fallbackProbe?.status);
  if (primaryErrorCategory === "balance" || fallbackErrorCategory === "balance") return "balance-error";
  if ([401, 403].includes(primaryProbe?.status)) return "auth-error";
  if (primaryProbe?.status === 429) return "degraded";
  if (fallbackProbe?.ok) return "reachable";
  if (fallbackProbe?.status > 0 && fallbackProbe.status < 500) return "reachable";
  if (primaryProbe?.status >= 500 || fallbackProbe?.status >= 500) return "degraded";
  return "offline";
}

function getProviderRuntimeFallbackUrl(baseUrl, provider) {
  const v1Base = normalizeModelsApiUrl(baseUrl).replace(/\/models$/i, "");
  const capabilities = new Set(
    (provider?.models || []).flatMap((model) => Array.isArray(model.capabilities) ? model.capabilities : []),
  );
  if (capabilities.has("generation") || capabilities.has("edit")) return `${v1Base}/images/generations`;
  return `${v1Base}/chat/completions`;
}

async function fetchProviderRuntimeJson(url, apiKey, timeoutMs = 12000, method = "GET") {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = method === "HEAD" ? "" : await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }
    return {
      ok: response.ok,
      status: response.status,
      data,
      elapsedMs: Date.now() - startedAt,
      message: response.ok ? "" : data?.error?.message || data?.error || data?.message || `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: {},
      elapsedMs: Date.now() - startedAt,
      message: formatUpstreamError(error),
    };
  }
}

function getProviderRuntimeHost(baseUrl) {
  try {
    return new URL(normalizeProviderBaseUrl(baseUrl)).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function readNumericMetric(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/,/g, "").replace(/[￥¥$€£]/g, "");
  if (!normalized || !/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function extractProviderBalance(data, source = "") {
  const root = data?.data && !Array.isArray(data.data) ? data.data : data || {};
  const candidates = [
    root.balance,
    root.remaining_balance,
    root.available_balance,
    root.account_balance,
    root.remaining,
    root.quota,
    root.subscription?.balance,
    root.subscription?.remaining,
    root.usage?.balance,
    root.usage?.remaining,
  ];
  const value = candidates.map(readNumericMetric).find((item) => item !== null);
  if (value === undefined) return { available: false };
  const currency = String(root.currency || data?.currency || "").trim().toUpperCase();
  return { available: true, value, currency, source };
}

function classifyProviderBalanceState(balance) {
  if (balance?.state === "insufficient") return "insufficient";
  if (!balance?.available) return "unknown";
  const value = Number(balance.value);
  if (!Number.isFinite(value)) return "unknown";
  if (value < 0) return "negative";
  if (value === 0) return "depleted";
  return "available";
}

function extractProviderPrices(data) {
  const formatNumber = (value) => {
    const number = readNumericMetric(value);
    if (number === null) return "";
    return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(6)));
  };
  const formatPricing = (pricing, fallbackUnit = "") => {
    if (pricing === null || pricing === undefined) return "";
    if (typeof pricing !== "object") {
      const value = formatNumber(pricing);
      return value ? `${value}${fallbackUnit ? ` / ${fallbackUnit}` : ""}` : "";
    }
    const input = formatNumber(pricing.input ?? pricing.input_price ?? pricing.prompt);
    const output = formatNumber(pricing.output ?? pricing.output_price ?? pricing.completion);
    const image = formatNumber(pricing.image ?? pricing.per_image ?? pricing.generation);
    const unit = String(pricing.unit || pricing.price_unit || fallbackUnit || "").trim();
    const parts = [];
    if (input) parts.push(`输入 ${input}`);
    if (output) parts.push(`输出 ${output}`);
    if (image) parts.push(`生图 ${image}`);
    return parts.length ? `${parts.join(" · ")}${unit ? ` / ${unit}` : ""}` : "";
  };
  const rows = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data?.models)
      ? data.models
      : Array.isArray(data?.prices)
        ? data.prices
        : [];
  const result = rows.map((item) => {
    if (!item || typeof item !== "object") return null;
    const model = String(item.id || item.model || item.name || "").trim();
    if (!model) return null;
    const unit = String(item.price_unit || item.unit || "").trim();
    const directPrice = item.price ?? item.unit_price ?? item.cost;
    const display = directPrice !== undefined
      ? formatPricing(directPrice, unit)
      : formatPricing(item.pricing || {
          input: item.input_price,
          output: item.output_price,
          image: item.image_price,
          unit,
        }, unit);
    return display ? { model, display } : null;
  }).filter(Boolean);

  const priceMap = data?.model_prices || data?.prices_by_model || data?.pricing?.models;
  if (priceMap && !Array.isArray(priceMap) && typeof priceMap === "object") {
    Object.entries(priceMap).forEach(([model, pricing]) => {
      const display = formatPricing(pricing);
      if (display) result.push({ model, display });
    });
  }
  return result;
}

async function handleOnline(req, res) {
  cleanupOnlineClients();
  if (req.method === "GET") {
    sendJson(res, 200, { online: ONLINE_CLIENTS.size });
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const payload = await readJson(req);
    const rawId = String(payload.clientId || "").trim();
    const fallbackId = `${req.socket.remoteAddress || "unknown"}:${req.headers["user-agent"] || "browser"}`;
    const clientId = rawId || crypto.createHash("sha1").update(fallbackId).digest("hex");
    if (payload.online === false) {
      ONLINE_CLIENTS.delete(clientId);
    } else {
      ONLINE_CLIENTS.set(clientId, Date.now());
    }
    cleanupOnlineClients();
    sendJson(res, 200, { online: ONLINE_CLIENTS.size });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
}

function cleanupOnlineClients() {
  const now = Date.now();
  for (const [clientId, lastSeen] of ONLINE_CLIENTS.entries()) {
    if (now - lastSeen > ONLINE_TTL_MS) ONLINE_CLIENTS.delete(clientId);
  }
}

async function handleChat(req, res) {
  let usageProvider = null;
  let usageModel = "";
  const usageStartedAt = Date.now();
  let usageRecorded = false;
  const completeUsage = (success, httpStatus = 0, message = "") => {
    if (!usageProvider || usageRecorded) return;
    usageRecorded = true;
    recordProviderUsageEvent(usageProvider, {
      kind: "chat",
      model: usageModel,
      success,
      httpStatus,
      message,
      latencyMs: Date.now() - usageStartedAt,
    });
  };
  try {
    const payload = await readJson(req);
    const model = payload.model || DEFAULT_MODEL;
    const requiredCapability = hasVisionMessage(payload.messages) ? "vision" : "text";
    const customModel = resolveCustomModel(model, requiredCapability);
    usageProvider = customModel?.provider || null;
    usageModel = customModel?.model?.id || model;

    if ((!AVAILABLE_MODELS.includes(model) || !isStaticModelEnabled(model, requiredCapability)) && !customModel) {
      sendJson(res, 400, { error: requiredCapability === "vision" ? "该模型未配置视觉识图能力。" : "该模型未配置文本对话能力。" });
      return;
    }

    const provider = customModel
      ? { url: normalizeApiUrl(customModel.provider.baseUrl), key: customModel.provider.apiKey }
      : getChatProvider(model);
    if (!provider.key) {
      sendJson(res, 500, { error: `Server missing API key for model ${model}.` });
      return;
    }

    const baseMessages = Array.isArray(payload.messages) ? payload.messages : [];
    let webSearchResults = [];
    let webSearchError = "";
    if (payload.web_search) {
      try {
        webSearchResults = await performWebSearch(extractLatestUserText(baseMessages));
      } catch (error) {
        webSearchError = formatUpstreamError(error);
      }
    }
    const directWeatherAnswer = buildDirectWeatherAnswer(extractLatestUserText(baseMessages), webSearchResults);
    if (directWeatherAnswer) {
      sendJson(res, 200, {
        model,
        choices: [{ message: { role: "assistant", content: directWeatherAnswer } }],
        web_search_results: webSearchResults,
        web_search_error: webSearchError,
      });
      return;
    }
    const messages = buildChatCompletionMessages(baseMessages, webSearchResults);

    const upstream = await fetch(provider.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.key}`,
      },
      body: JSON.stringify({
        model: customModel?.model.id || model,
        messages,
        temperature: Number(payload.temperature ?? 0.7),
        max_tokens: Number(payload.max_tokens ?? 1200),
      }),
    });

    const text = await upstream.text();
    const contentType = upstream.headers.get("content-type") || "application/json; charset=utf-8";

    if (upstream.ok && contentType.includes("application/json")) {
      const data = JSON.parse(text || "{}");
      const normalizedData = normalizeChatImageResponse(data);
      const savedImages = await saveGeneratedImages(normalizedData);
      completeUsage(true, upstream.status);
      sendJson(res, upstream.status, {
        ...normalizedData,
        saved_images: savedImages,
        web_search_results: webSearchResults,
        web_search_error: webSearchError,
      });
      return;
    }

    const upstreamError = extractUpstreamErrorMessage(text, contentType) || `${upstream.status} ${upstream.statusText}`;
    completeUsage(false, upstream.status, upstreamError);
    sendJson(res, upstream.status, {
      error: upstreamError,
      upstream_status: upstream.status,
    });
  } catch (error) {
    completeUsage(false, 0, formatUpstreamError(error));
    sendJson(res, 500, { error: formatUpstreamError(error) });
  }
}

function formatUpstreamError(error) {
  const message = error?.message || String(error || "Unknown error");
  const causeMessage = error?.cause?.message || error?.cause?.code || "";
  return causeMessage && causeMessage !== message ? `${message}: ${causeMessage}` : message;
}

function extractUpstreamErrorMessage(text, contentType = "") {
  const raw = String(text || "").trim();
  if (!raw) return "";
  if (contentType.includes("json") || /^[\[{]/.test(raw)) {
    try {
      const data = JSON.parse(raw);
      const message = data?.error?.message || data?.error || data?.message || data?.detail || data?.details;
      if (message) return String(message).slice(0, 800);
    } catch {}
  }
  const withoutTags = raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return (withoutTags || raw).slice(0, 800);
}
function getChatProvider(model) {
  if (GEMINI_MODELS.includes(model)) return { url: GEMINI_API_URL, key: GEMINI_API_KEY };
  if (BAILIAN_MODELS.includes(model)) return { url: BAILIAN_API_URL, key: BAILIAN_API_KEY };
  return { url: API_URL, key: API_KEY };
}

function buildChatCompletionMessages(messages, webSearchResults = []) {
  const stylePrompt = [
    "你是一个清晰、自然、友好的中文助手。",
    "回答时可以像 ChatGPT 官网一样自然使用少量贴切的 emoji、Markdown 列表和加粗，但不要过度装饰。",
    "如果问题需要最新信息，而提供了联网搜索结果，请优先依据搜索结果回答，并在关键事实后说明来源名称。",
    "只要联网搜索结果里有可用事实，就不要回答“我无法直接获取实时数据”；请综合资料给出最新结论，并说明不确定处。",
    "对于体育战况、新闻、赛事积分等问题，请优先提取比分、时间、小组/轮次、关键事件、排名或下一场赛程，并用清楚的小标题组织。",
    "如果搜索结果里包含“实时天气数据”，不要说只能找到页面列表；请直接根据其中的温度、体感、天气、风速、降水概率等数据回答。",
    "如果搜索结果来自中国天气网或天气网，请把它们当作本轮天气查询的优先来源；即使只有页面摘要，也要基于摘要给出清晰结论，不要让用户自己点开链接。",
  ].join("\n");
  const output = [{ role: "system", content: stylePrompt }];
  if (webSearchResults.length) {
    output.push({
      role: "system",
      content: [
        `以下是本轮联网搜索结果，当前日期：${new Date().toISOString().slice(0, 10)}。`,
        ...webSearchResults.map((item, index) => (
          `${index + 1}. ${item.title}\n${item.url}\n${item.snippet || ""}`
        )),
      ].join("\n\n"),
    });
  }
  output.push(...messages);
  return output;
}

function buildDirectWeatherAnswer(query, webSearchResults = []) {
  if (!/(天气|气温|温度|下雨|降雨|风力|weather)/i.test(query || "")) return "";
  const weatherSources = webSearchResults.filter((item) => item?.snippet && /天气|温度|气温|降水|风|湿度/i.test(item.snippet));
  if (!weatherSources.length) return "";
  const data = mergeWeatherSnippets(weatherSources);
  const primarySource = weatherSources.find((item) => /中国天气网|天气网/.test(item.title || "")) || weatherSources[0];
  const combinedSnippet = weatherSources.map((item) => item.snippet || "").join("\n");
  const city = data["地点"] || extractWeatherLocation(query) || "当地";
  const weather = data["当前天气"] || pickWeatherText(combinedSnippet) || "天气信息见来源";
  const currentTemp = data["当前温度"] || data["温度"] || "";
  const feelsLike = data["体感温度"] || "";
  const humidity = data["相对湿度"] || data["湿度"] || "";
  const wind = data["风速"] || pickLine(combinedSnippet, /风/);
  const range = data["今日范围"] || pickLine(combinedSnippet, /最高|最低|范围|气温/);
  const rain = data["今日最高降水概率"] || pickLine(combinedSnippet, /降水|降雨|下雨/);
  const updated = data["更新时间"] || "";
  const sourceName = weatherSources
    .map((item) => item.title || "天气来源")
    .filter(Boolean)
    .slice(0, 3)
    .join("、");

  const lines = [`**${city}今天的天气** ${weatherEmoji(weather)}`];
  const bullets = [
    currentTemp && `当前温度：**${currentTemp}**`,
    feelsLike && `体感温度：**${feelsLike}**`,
    humidity && `湿度：**${humidity}**`,
    wind && `风况：${wind}`,
    range && `今日气温范围：**${range}**`,
    rain && `降水：${rain}`,
  ].filter(Boolean);
  lines.push(...bullets.map((item) => `- ${item}`));

  const hotText = `${currentTemp} ${feelsLike} ${range}`;
  const hot = /3[2-9]|4\d/.test(hotText);
  const rainy = /雨|降水|阵雨|雷/.test(`${weather} ${rain}`);
  const advice = [];
  if (hot) advice.push("白天偏热，出门注意防晒、补水。");
  if (rainy) advice.push("有降雨可能，建议带伞。");
  if (!advice.length) advice.push("按日常出行准备即可，临出门前可再看一眼实时变化。");
  lines.push("");
  lines.push(`**出行建议**：${advice.join(" ")}`);
  lines.push("");
  lines.push(`数据来源：${sourceName || primarySource.title || "天气来源"}${updated ? `（更新时间：${updated}）` : ""}`);
  return lines.join("\n");
}

function parseWeatherSnippet(snippet) {
  const data = {};
  String(snippet || "").split(/\n+/).forEach((line) => {
    const clean = line.trim();
    const index = clean.indexOf("：");
    if (index > 0) data[clean.slice(0, index).trim()] = clean.slice(index + 1).trim();
  });
  return data;
}

function mergeWeatherSnippets(sources) {
  const merged = {};
  for (const source of sources) {
    const data = parseWeatherSnippet(source.snippet);
    for (const [key, value] of Object.entries(data)) {
      if (!merged[key] && value && value !== "未知") merged[key] = value;
    }
  }
  return merged;
}

function pickLine(text, pattern) {
  return String(text || "").split(/\n+/).map((line) => line.trim()).find((line) => pattern.test(line)) || "";
}

function pickWeatherText(text) {
  const line = pickLine(text, /晴|云|阴|雨|雪|雾|雷/);
  return line.replace(/^.*?天气[：: ]?/, "").slice(0, 28);
}

function weatherEmoji(text) {
  if (/雷/.test(text)) return "⛈️";
  if (/雨/.test(text)) return "🌧️";
  if (/雪/.test(text)) return "❄️";
  if (/晴/.test(text)) return "☀️";
  if (/云|阴/.test(text)) return "⛅";
  return "🌤️";
}

function extractLatestUserText(messages) {
  const latest = [...messages].reverse().find((message) => message?.role === "user");
  return extractTextFromMessageContent(latest?.content).slice(0, 300);
}

function extractTextFromMessageContent(content) {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === "string") return item;
      if (item?.type === "text") return item.text || "";
      return "";
    }).filter(Boolean).join("\n");
  }
  if (typeof content === "object") return content.text || "";
  return "";
}

async function performWebSearch(query) {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) return [];
  const weatherResults = await searchWeatherIfNeeded(cleanQuery);
  const webResults = await searchDuckDuckGo(cleanQuery).catch(() => []);
  const enrichedResults = await enrichWebSearchResults(webResults, cleanQuery);
  return [...weatherResults, ...enrichedResults].slice(0, WEB_SEARCH_MAX_RESULTS);
}

async function searchWeatherIfNeeded(query) {
  if (!/(天气|气温|温度|下雨|降雨|风力|weather)/i.test(query)) return [];
  const location = extractWeatherLocation(query);
  if (!location) return [];
  const preferredResults = await searchPreferredWeatherSites(location, query);
  const point = getKnownWeatherLocation(location) || await geocodeWeatherLocation(location);
  const fallbackResults = [];
  if (point) {
    const weather = await fetchOpenMeteoWeather(point).catch(() => null);
    if (weather) {
      fallbackResults.push({
        title: `${point.name}天气模型数据（Open-Meteo，非官方实况）`,
        url: `https://open-meteo.com/`,
        snippet: formatWeatherSnippet(point, weather),
      });
    }
  }
  return [...preferredResults, ...fallbackResults];
}

async function searchPreferredWeatherSites(location, query) {
  const config = getPreferredWeatherSiteConfig(location, query);
  if (!config) return [];
  const results = [];
  const pages = await Promise.allSettled(config.sources.map(async (source) => {
    const html = await fetchWeatherPageText(source.url);
    const snippet = extractWeatherPageSnippet(html, source.kind);
    return snippet ? { title: source.title, url: source.url, snippet } : null;
  }));
  for (const page of pages) {
    if (page.status === "fulfilled" && page.value) results.push(page.value);
  }
  return results;
}

function getPreferredWeatherSiteConfig(location, query = "") {
  const value = `${location || ""} ${query || ""}`.toLowerCase();
  if (!value.includes("西安") && !value.includes("xian") && !value.includes("xi'an")) return null;
  return {
    name: "西安",
    sources: [
      {
        kind: "weatherCn",
        title: "中国天气网：西安天气预报",
        url: "https://www.weather.com.cn/weathern/101110101.shtml",
      },
      {
        kind: "tianqi",
        title: "天气网：西安今日天气",
        url: "https://www.tianqi.com/xian/today/",
      },
    ],
  };
}

async function fetchWeatherPageText(url) {
  const response = await fetchWithTimeout(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
  }, 12000);
  if (!response.ok) throw new Error(`Weather page failed: ${response.status}`);
  return response.text();
}

function extractWeatherPageSnippet(html, kind) {
  const text = normalizeWeatherPageText(html);
  if (!text) return "";
  const keywords = kind === "tianqi"
    ? ["天气", "温度", "湿度", "风", "空气", "紫外线", "穿衣", "洗车", "感冒", "运动", "旅游"]
    : ["天气", "温度", "风", "空气", "生活指数", "穿衣", "紫外线", "洗车", "感冒", "运动"];
  const segments = text
    .split(/[。；;\n\r]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 4 && item.length <= 90)
    .filter((item) => keywords.some((keyword) => item.includes(keyword)));
  const unique = [];
  for (const item of segments) {
    if (!unique.some((existing) => existing === item || existing.includes(item) || item.includes(existing))) unique.push(item);
    if (unique.length >= 14) break;
  }
  return unique.join("\n");
}

function normalizeWeatherPageText(html) {
  return stripHtml(String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function extractWeatherLocation(query) {
  const value = String(query || "").replace(/\s+/g, "");
  const patterns = [
    /(.+?)(?:今天|今日|现在|实时|明天|未来)?(?:的)?天气/,
    /(.+?)(?:今天|今日|现在|实时|明天|未来)?(?:的)?(?:气温|温度|降雨|下雨|风力)/,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return match[1]
      .replace(/^(查一下|查询一下|查询|看看|看一下|看下|帮我看看|帮我看|帮我查一下|帮我查|我想知道|告诉我)/, "")
      .trim();
  }
  return "";
}

function getKnownWeatherLocation(name) {
  const key = String(name || "").replace(/市$/, "");
  const known = {
    西安: { name: "西安", latitude: 34.3416, longitude: 108.9398, timezone: "Asia/Shanghai" },
    北京: { name: "北京", latitude: 39.9042, longitude: 116.4074, timezone: "Asia/Shanghai" },
    上海: { name: "上海", latitude: 31.2304, longitude: 121.4737, timezone: "Asia/Shanghai" },
    广州: { name: "广州", latitude: 23.1291, longitude: 113.2644, timezone: "Asia/Shanghai" },
    深圳: { name: "深圳", latitude: 22.5431, longitude: 114.0579, timezone: "Asia/Shanghai" },
    杭州: { name: "杭州", latitude: 30.2741, longitude: 120.1551, timezone: "Asia/Shanghai" },
    成都: { name: "成都", latitude: 30.5728, longitude: 104.0668, timezone: "Asia/Shanghai" },
    重庆: { name: "重庆", latitude: 29.563, longitude: 106.5516, timezone: "Asia/Shanghai" },
    武汉: { name: "武汉", latitude: 30.5928, longitude: 114.3055, timezone: "Asia/Shanghai" },
    南京: { name: "南京", latitude: 32.0603, longitude: 118.7969, timezone: "Asia/Shanghai" },
  };
  return known[key] || null;
}

async function geocodeWeatherLocation(name) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=zh&format=json`;
  const response = await fetchWithTimeout(url, {}, 10000);
  if (!response.ok) return null;
  const data = await response.json().catch(() => ({}));
  const item = Array.isArray(data.results) ? data.results[0] : null;
  if (!item) return null;
  return {
    name: item.name || name,
    latitude: item.latitude,
    longitude: item.longitude,
    timezone: item.timezone || "Asia/Shanghai",
  };
}

async function fetchOpenMeteoWeather(point) {
  const params = new URLSearchParams({
    latitude: String(point.latitude),
    longitude: String(point.longitude),
    timezone: point.timezone || "Asia/Shanghai",
    forecast_days: "3",
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
  });
  const response = await fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?${params}`, {}, 10000);
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

function formatWeatherSnippet(point, data) {
  const current = data.current || {};
  const currentUnits = data.current_units || {};
  const daily = data.daily || {};
  const todayCode = daily.weather_code?.[0] ?? current.weather_code;
  const lines = [
    `地点：${point.name}`,
    "数据性质：Open-Meteo 预报模型/插值数据，适合日常参考，不等同于中国气象局官方气象站实况。",
    `更新时间：${current.time || "未知"}`,
    `当前天气：${weatherCodeToText(todayCode)}`,
    `当前温度：${formatWeatherValue(current.temperature_2m, currentUnits.temperature_2m || "°C")}`,
    `体感温度：${formatWeatherValue(current.apparent_temperature, currentUnits.apparent_temperature || "°C")}`,
    `相对湿度：${formatWeatherValue(current.relative_humidity_2m, currentUnits.relative_humidity_2m || "%")}`,
    `降水量：${formatWeatherValue(current.precipitation, currentUnits.precipitation || "mm")}`,
    `风速：${formatWeatherValue(current.wind_speed_10m, currentUnits.wind_speed_10m || "km/h")}，风向 ${formatWeatherValue(current.wind_direction_10m, currentUnits.wind_direction_10m || "°")}`,
  ];
  if (daily.time?.[0]) {
    lines.push(`今日范围：${formatWeatherValue(daily.temperature_2m_min?.[0], "°C")}~${formatWeatherValue(daily.temperature_2m_max?.[0], "°C")}`);
    lines.push(`今日最高降水概率：${formatWeatherValue(daily.precipitation_probability_max?.[0], "%")}`);
  }
  if (daily.time?.[1]) {
    lines.push(`明日天气：${weatherCodeToText(daily.weather_code?.[1])}，${formatWeatherValue(daily.temperature_2m_min?.[1], "°C")}~${formatWeatherValue(daily.temperature_2m_max?.[1], "°C")}，最高降水概率 ${formatWeatherValue(daily.precipitation_probability_max?.[1], "%")}`);
  }
  return lines.join("\n");
}

function formatWeatherValue(value, unit) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "未知";
  return `${value}${unit || ""}`;
}

function weatherCodeToText(code) {
  const map = {
    0: "晴",
    1: "大部晴朗",
    2: "局部多云",
    3: "阴/多云",
    45: "雾",
    48: "雾凇",
    51: "小毛毛雨",
    53: "中等毛毛雨",
    55: "较强毛毛雨",
    61: "小雨",
    63: "中雨",
    65: "大雨",
    71: "小雪",
    73: "中雪",
    75: "大雪",
    80: "阵雨",
    81: "较强阵雨",
    82: "强阵雨",
    95: "雷暴",
    96: "雷暴伴小冰雹",
    99: "雷暴伴大冰雹",
  };
  return map[Number(code)] || `天气代码 ${code}`;
}

async function enrichWebSearchResults(results, query) {
  if (!WEB_SEARCH_FETCH_PAGES) return results;
  const targets = results
    .filter((item) => /^https?:\/\//i.test(item.url || ""))
    .slice(0, WEB_SEARCH_FETCH_PAGES);
  const enriched = await Promise.allSettled(targets.map((item) => fetchSearchResultPage(item, query)));
  const byUrl = new Map(results.map((item) => [item.url, { ...item }]));
  for (const result of enriched) {
    if (result.status !== "fulfilled" || !result.value) continue;
    const existing = byUrl.get(result.value.url) || {};
    byUrl.set(result.value.url, { ...existing, ...result.value });
  }
  return Array.from(byUrl.values()).map((item) => ({
    ...item,
    snippet: [item.snippet, item.pageText].filter(Boolean).join("\n\n").slice(0, WEB_SEARCH_PAGE_CHARS),
  }));
}

async function fetchSearchResultPage(result, query) {
  const response = await fetchWithTimeout(result.url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,text/plain",
    },
  }, 12000);
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type") || "";
  if (!/text\/html|text\/plain|application\/xhtml/i.test(contentType)) return null;
  const html = await response.text();
  const pageText = extractRelevantPageText(html, query);
  return pageText ? { ...result, pageText } : null;
}

function extractRelevantPageText(html, query) {
  const cleanHtml = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(nav|header|footer|aside|svg)[\s\S]*?<\/\1>/gi, " ");
  const title = stripHtml((cleanHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
  const segments = [];
  const segmentPattern = /<(h[1-3]|p|li|figcaption)[^>]*>([\s\S]*?)<\/\1>/gi;
  for (const match of cleanHtml.matchAll(segmentPattern)) {
    const text = stripHtml(match[2]);
    if (text.length >= 24 && text.length <= 520) segments.push(text);
  }
  if (!segments.length) {
    const fallback = stripHtml(cleanHtml).slice(0, WEB_SEARCH_PAGE_CHARS);
    return [title, fallback].filter(Boolean).join("\n");
  }
  const terms = getSearchTerms(query);
  const scored = segments
    .map((text, index) => ({ text, index, score: scoreSearchSegment(text, terms) }))
    .filter((item) => item.score > 0 || item.index < 6)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 14)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.text);
  return [title, ...dedupeTextSegments(scored)].filter(Boolean).join("\n").slice(0, WEB_SEARCH_PAGE_CHARS);
}

function getSearchTerms(query) {
  const text = String(query || "");
  const terms = new Set();
  for (const match of text.matchAll(/[\u4e00-\u9fa5]{2,}|[A-Za-z0-9][A-Za-z0-9'-]{1,}/g)) {
    terms.add(match[0].toLowerCase());
  }
  if (text.includes("葡萄牙")) terms.add("portugal");
  if (text.includes("世界杯")) terms.add("world cup");
  if (text.includes("刚果")) {
    terms.add("congo");
    terms.add("dr congo");
  }
  return Array.from(terms).slice(0, 12);
}

function scoreSearchSegment(text, terms) {
  const lower = String(text || "").toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (lower.includes(term)) score += term.length > 4 ? 3 : 2;
  }
  if (/\b\d+\s*[-–]\s*\d+\b/.test(lower)) score += 3;
  if (/today|yesterday|live|latest|group|standings|score|result|match|世界杯|小组|积分|战况|比分|赛果/.test(lower)) score += 2;
  return score;
}

function dedupeTextSegments(segments) {
  const output = [];
  for (const segment of segments) {
    if (!output.some((item) => item === segment || item.includes(segment) || segment.includes(item))) output.push(segment);
  }
  return output;
}

async function searchDuckDuckGo(query) {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await fetchWithTimeout(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
  }, 12000);
  if (!response.ok) throw new Error(`联网搜索失败：${response.status}`);
  const html = await response.text();
  return parseDuckDuckGoResults(html).slice(0, WEB_SEARCH_MAX_RESULTS);
}

function parseDuckDuckGoResults(html) {
  const results = [];
  const blockPattern = /<div[^>]+class="[^"]*result[^"]*"[\s\S]*?<\/div>\s*<\/div>/gi;
  const blocks = String(html || "").match(blockPattern) || [];
  for (const block of blocks) {
    const linkMatch = block.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) continue;
    const url = normalizeDuckDuckGoUrl(decodeHtml(linkMatch[1]));
    if (!url || results.some((item) => item.url === url)) continue;
    const snippetMatch = block.match(/<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>|<div[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    results.push({
      title: stripHtml(linkMatch[2]),
      url,
      snippet: stripHtml(snippetMatch?.[1] || snippetMatch?.[2] || ""),
    });
  }
  return results;
}

function normalizeDuckDuckGoUrl(value) {
  try {
    const url = new URL(value, "https://duckduckgo.com");
    const uddg = url.searchParams.get("uddg");
    return uddg ? decodeURIComponent(uddg) : url.href;
  } catch {
    return "";
  }
}

function stripHtml(value) {
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

async function handleImages(req, res) {
  try {
    const payload = await readJson(req);
    const response = await executeImageGenerationPayload(payload);
    sendJson(res, response.status, response.body);
  } catch (error) {
    sendJson(res, 500, { error: formatUpstreamError(error) });
  }
}

async function handleImageJobs(req, res) {
  if (req.method === "POST" && req.url === "/api/image-jobs") {
    try {
      const payload = await readJson(req);
      const boardId = normalizeBoardId(payload.board_id);
      const nodeId = String(payload.node_id || "").trim();
      if (!nodeId || nodeId.length > 160) throw new Error("图片任务缺少有效的画布节点。");
      const job = imageJobManager.create(payload, { boardId, nodeId });
      sendJson(res, 202, { job_id: job.id, job });
    } catch (error) {
      sendJson(res, 400, { error: formatUpstreamError(error) });
    }
    return;
  }
  if (req.method === "GET") {
    const match = req.url.match(/^\/api\/image-jobs\/([a-zA-Z0-9_-]{1,160})$/);
    const job = match ? imageJobManager.get(match[1]) : null;
    if (!job) {
      sendJson(res, 404, { error: "没有找到这个图片任务。" });
      return;
    }
    sendJson(res, 200, { job });
    return;
  }
  sendJson(res, 405, { error: "Method not allowed" });
}

async function executeImageGenerationPayload(payload = {}, options = {}) {
  let usageProvider = null;
  let usageModel = "";
  const usageStartedAt = Date.now();
  let usageRecorded = false;
  const completeUsage = (success, httpStatus = 0, message = "") => {
    if (!usageProvider || usageRecorded) return;
    usageRecorded = true;
    recordProviderUsageEvent(usageProvider, {
      kind: "image",
      model: usageModel,
      success,
      httpStatus,
      message,
      latencyMs: Date.now() - usageStartedAt,
    });
  };
  try {
    const signal = options.signal || null;
    const model = payload.model || IMAGE_DEFAULT_MODEL;
    const refs = (payload.reference_images || []).filter((ref) => ref && ref.url);
    const requiredCapability = refs.length ? "edit" : "generation";
    const customModel = resolveCustomModel(model, requiredCapability);
    usageProvider = customModel?.provider || null;
    usageModel = customModel?.model?.id || model;

    if ((!AVAILABLE_IMAGE_MODELS.includes(model) || !isStaticModelEnabled(model, requiredCapability)) && !customModel) {
      return { status: 400, body: { error: requiredCapability === "edit" ? "该模型未配置图片编辑能力。" : "该模型未配置图片生成能力。" } };
    }

    if (!isMidjourneyImageModel(model)) {
      const compatibility = validateImageOutputRequest(
        model,
        payload.size || "auto",
        payload.resolution || (String(payload.size || "auto").toLowerCase() === "auto" ? "auto" : "1k"),
      );
      if (!compatibility.supported) {
        return {
          status: 400,
          body: {
            error: compatibility.reason,
            code: "IMAGE_SIZE_NOT_SUPPORTED",
            alternative: compatibility.alternative?.exactSize || "",
          },
        };
      }
    }

    if (isGrsaiImageModel(model)) {
      const data = await requestGrsaiImageGeneration({
        model,
        prompt: payload.prompt || "",
        size: payload.size || "1024x1024",
        resolution: payload.resolution || payload.quality || "1k",
        n: Number(payload.n || 1),
        refs,
        signal,
      });
      const savedImages = await saveGeneratedImages(data, { signal });
      completeUsage(true, 200);
      return { status: 200, body: {
        ...data,
        model,
        saved_images: savedImages,
      } };
    }

    if (isMidjourneyImageModel(model)) {
      const data = await requestApimartMidjourneyGeneration({
        prompt: payload.prompt || "",
        size: payload.size || "1:1",
        version: payload.version,
        niji: payload.niji,
        speed: payload.speed,
        style: payload.style,
        stylize: payload.stylize,
        hd: payload.hd,
        n: Number(payload.n || 1),
        refs,
        signal,
      });
      const savedImages = await saveGeneratedImages(data, { signal });
      completeUsage(true, 200);
      return { status: 200, body: {
        ...data,
        model: MIDJOURNEY_IMAGE_MODEL_ALIAS,
        saved_images: savedImages,
      } };
    }

    if (isApimartImageModel(model)) {
      const data = await requestApimartImageGeneration({
        prompt: payload.prompt || "",
        size: payload.size || "1024x1024",
        resolution: payload.resolution || payload.quality || "1k",
        n: Number(payload.n || 1),
        refs,
        signal,
      });
      const savedImages = await saveGeneratedImages(data, { signal });
      completeUsage(true, 200);
      return { status: 200, body: {
        ...data,
        model: APIMART_IMAGE_MODEL_ALIAS,
        saved_images: savedImages,
      } };
    }

    if (shouldUseGeminiNativeImageApi(customModel)) {
      const data = await requestGeminiNativeImageGeneration({
        model,
        prompt: payload.prompt || "",
        size: payload.size || "1024x1024",
        resolution: payload.resolution || payload.quality || "1k",
        n: Number(payload.n || 1),
        refs,
        signal,
      });
      const savedImages = await saveGeneratedImages(data, { signal });
      completeUsage(true, 200);
      return { status: 200, body: {
        ...data,
        model: getImageResponseModel(model, data.model),
        saved_images: savedImages,
      } };
    }

    const useImageChat = isImageChatModel(model);
    const upstream = useImageChat
        ? await requestImageChat({ model, prompt: payload.prompt || "", size: payload.size || "1024x1024", resolution: payload.resolution || payload.quality || "1k", n: Number(payload.n || 1), refs, signal })
    : refs.length
        ? await requestImageEdit({ model, prompt: payload.prompt || "", size: payload.size || "1024x1024", resolution: payload.resolution || payload.quality || "1k", quality: payload.quality || "auto", n: Number(payload.n || 1), refs, signal })
        : await requestImageGeneration({ model, prompt: payload.prompt || "", size: payload.size || "1024x1024", resolution: payload.resolution || payload.quality || "1k", quality: payload.quality || "auto", n: Number(payload.n || 1), signal });
    const text = await upstream.text();
    const contentType = upstream.headers.get("content-type") || "application/json; charset=utf-8";

    if (upstream.ok && contentType.includes("application/json")) {
      const data = JSON.parse(text || "{}");
      if (isImageChatModel(model)) normalizeChatImageResponse(data);
      const savedImages = await saveGeneratedImages(data, { signal });
      const responseModel = getImageResponseModel(model, data.model);
      completeUsage(true, upstream.status);
      return { status: upstream.status, body: {
        ...data,
        model: responseModel,
        saved_images: savedImages,
      } };
    }

    const upstreamError = extractUpstreamErrorMessage(text, contentType) || `${upstream.status} ${upstream.statusText}`;
    completeUsage(false, upstream.status, upstreamError);
    return { status: upstream.status, body: { error: upstreamError, upstream_status: upstream.status } };
  } catch (error) {
    completeUsage(false, 0, formatUpstreamError(error));
    if (options.signal?.aborted) throw options.signal.reason || error;
    return { status: 500, body: { error: formatUpstreamError(error) } };
  }
}

function compactImageJobResponse(body = {}) {
  const data = Array.isArray(body.data) ? body.data.map((item, index) => {
    const saved = body.saved_images?.[index] || {};
    const url = item?.local_url || saved.url || item?.url || "";
    return {
      ...(url ? { url, local_url: url } : {}),
      width: Number(item?.width || saved.width || 0),
      height: Number(item?.height || saved.height || 0),
    };
  }) : [];
  return { ...body, data };
}

async function handleImageThumbnails(req, res) {
  const requestUrl = new URL(req.url, "http://localhost");
  if (req.method === "GET") {
    const source = requestUrl.searchParams.get("source") || "";
    if (!source) {
      sendJson(res, 400, { error: "Missing thumbnail source." });
      return;
    }
    sendJson(res, 200, { item: thumbnailStore.lookup(source) });
    return;
  }

  if (req.method === "POST") {
    try {
      const source = decodeHeaderFilename(req.headers["x-source-url"]);
      const lightweight = String(req.headers["x-thumbnail-lightweight"] || "").toLowerCase() === "true";
      const mimeType = String(req.headers["content-type"] || "image/webp").split(";")[0].trim().toLowerCase();
      const buffer = lightweight ? Buffer.alloc(0) : await readBodyBuffer(req, 2 * 1024 * 1024);
      const item = thumbnailStore.save({
        source,
        buffer,
        mimeType,
        width: Number(req.headers["x-image-width"] || 0),
        height: Number(req.headers["x-image-height"] || 0),
        lightweight,
      });
      sendJson(res, 200, { item });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  sendJson(res, 405, { error: "Method not allowed" });
}

async function handleCanvasAgentSkills(req, res) {
  try {
    const skills = CanvasAgentRuntime.loadCanvasSkills(CANVAS_SKILLS_DIR);
    sendJson(res, 200, {
      configured: getCanvasAgentCandidates({}, { includeCircuitOpen: true }).length > 0,
      skills: CanvasAgentRuntime.getPublicSkillMetadata(skills),
    });
  } catch (error) {
    sendJson(res, 500, { error: `Canvas Agent skills failed to load: ${error.message}` });
  }
}

async function handleCanvasAgentConversation(req, res) {
  try {
    if (req.method === "GET") {
      const url = new URL(req.url, "http://localhost");
      const boardId = normalizeBoardId(url.searchParams.get("board_id"));
      sendJson(res, 200, canvasAgentConversationStore.get(boardId));
      return;
    }
    const payload = await readJson(req);
    const boardId = normalizeBoardId(payload?.board_id);
    if (req.method === "POST") {
      const conversation = CanvasAgentConversation.normalize(payload?.conversation, boardId);
      const saved = canvasAgentConversationStore.upsert(conversation, payload?.expected_revision);
      sendJson(res, 200, saved);
      return;
    }
    if (req.method === "DELETE") {
      sendJson(res, 200, { ok: true, removed: canvasAgentConversationStore.remove(boardId) });
      return;
    }
    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    if (error?.code === "CONVERSATION_REVISION_CONFLICT") {
      sendJson(res, 409, { code: error.code, error: "Conversation changed in another window.", current: error.current });
      return;
    }
    sendJson(res, 400, { error: error.message });
  }
}

function pruneCanvasAgentSessions(now = Date.now()) {
  for (const [runId, session] of canvasAgentSessions) {
    if (now - Number(session.updatedAt || session.createdAt || 0) <= CANVAS_AGENT_SESSION_TTL_MS) continue;
    canvasAgentSessions.delete(runId);
  }
  if (canvasAgentSessions.size <= CANVAS_AGENT_MAX_SESSIONS) return;
  [...canvasAgentSessions.entries()]
    .sort((left, right) => Number(left[1].updatedAt || 0) - Number(right[1].updatedAt || 0))
    .slice(0, canvasAgentSessions.size - CANVAS_AGENT_MAX_SESSIONS)
    .forEach(([runId]) => canvasAgentSessions.delete(runId));
}

function getOrCreateCanvasAgentSession(payload = {}, skills = {}) {
  pruneCanvasAgentSessions();
  const suppliedRunId = String(payload.run_id || "").trim();
  const runId = /^[a-zA-Z0-9_-]{1,120}$/.test(suppliedRunId)
    ? suppliedRunId
    : `agent_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const requestedBoardId = String(payload.board_id || payload.canvas?.id || "").trim();
  const requestedActiveSkillId = String(
    payload.active_skill_id
    || (payload.skill_mode === "manual" ? payload.skill_id : "")
    || "",
  ).trim();
  const businessSkillIds = new Set((Array.isArray(skills?.business) ? skills.business : [])
    .map((skill) => String(skill?.id || ""))
    .filter(Boolean));
  if (requestedActiveSkillId && !businessSkillIds.has(requestedActiveSkillId)) {
    throw makeCanvasAgentAttemptError("请求的专业流程当前不可用。", { category: "task" });
  }
  let session = canvasAgentSessions.get(runId);
  if (!session) {
    if (!requestedBoardId) throw makeCanvasAgentAttemptError("Canvas Agent requires a current board.", { category: "task" });
    const now = Date.now();
    const initialActiveSkillId = requestedActiveSkillId;
    session = {
      runId,
      boardId: requestedBoardId,
      activeSkillId: initialActiveSkillId,
      createdAt: now,
      updatedAt: now,
      pinnedCandidateId: "",
      previousResponseId: "",
      initialPayload: null,
      transcript: [],
      completedToolOutputIds: new Set(),
    };
    canvasAgentSessions.set(runId, session);
  } else {
    if (requestedBoardId && session.boardId !== requestedBoardId) {
      throw makeCanvasAgentAttemptError("这个任务不属于当前画布，已阻止继续执行。", { category: "task" });
    }
    if (requestedActiveSkillId && session.activeSkillId && session.activeSkillId !== requestedActiveSkillId) {
      throw makeCanvasAgentAttemptError("本次任务已经启用另一个专业流程。", { category: "task" });
    }
    if (requestedActiveSkillId) session.activeSkillId = requestedActiveSkillId;
  }
  if (!session.initialPayload && String(payload.prompt || "").trim()) {
    session.initialPayload = {
      skill_mode: payload.skill_mode === "manual" ? "manual" : "auto",
      skill_id: String(payload.skill_id || ""),
      active_skill_id: session.activeSkillId,
      board_id: session.boardId,
      prompt: String(payload.prompt || ""),
      canvas: payload.canvas && typeof payload.canvas === "object" ? payload.canvas : {},
      vision_images: Array.isArray(payload.vision_images) ? payload.vision_images.slice(0, 3) : [],
      conversation_context: normalizeCanvasAgentConversationContext(payload.conversation_context),
      step: 0,
    };
  }
  session.updatedAt = Date.now();
  return session;
}

function disposeCanvasAgentSession(session, options = {}) {
  if (!session) return;
  if (session.initialPayload) {
    session.initialPayload.vision_images = [];
    session.initialPayload.canvas = {};
  }
  if (options.retainCheckpoint) {
    session.updatedAt = Date.now();
    return;
  }
  session.transcript = [];
  session.completedToolOutputIds?.clear?.();
  canvasAgentSessions.delete(session.runId);
}

function appendCanvasAgentSessionTurn(session, payload, turn, candidate) {
  (Array.isArray(payload.tool_outputs) ? payload.tool_outputs : []).forEach((item) => {
    const callId = String(item?.call_id || "").trim();
    if (!callId || session.completedToolOutputIds.has(callId)) return;
    session.completedToolOutputIds.add(callId);
    session.transcript.push({
      role: "tool",
      call_id: callId,
      content: typeof item.output === "string" ? item.output : JSON.stringify(item.output ?? null),
    });
  });
  session.transcript.push({
    role: "assistant",
    content: String(turn.message || ""),
    tool_calls: (Array.isArray(turn.tool_calls) ? turn.tool_calls : []).map((call) => ({
      call_id: String(call.call_id || ""),
      name: String(call.name || ""),
      arguments: call.arguments && typeof call.arguments === "object" ? call.arguments : {},
    })),
  });
  session.transcript = session.transcript.slice(-36);
  session.pinnedCandidateId = String(candidate.id || "");
  session.previousResponseId = String(turn.response_id || "");
  session.updatedAt = Date.now();
}

function writeCanvasAgentEvent(res, event) {
  if (res.writableEnded || res.destroyed) return;
  res.write(`${JSON.stringify(event)}\n`);
}

function sanitizeCanvasAgentTurn(turn = {}) {
  return {
    response_id: String(turn.response_id || ""),
    message: String(turn.message || ""),
    tool_calls: Array.isArray(turn.tool_calls) ? turn.tool_calls : [],
    usage: turn.usage || null,
  };
}

function getLegacyCanvasAgentCandidate() {
  return CanvasAgentRouter.normalizeAgentCandidate({
    id: "canvas-agent-env-fallback",
    providerId: "canvas-agent-env-fallback",
    model: CANVAS_AGENT_MODEL,
    baseUrl: CANVAS_AGENT_API_URL,
    apiKey: CANVAS_AGENT_API_KEY,
    protocol: "responses",
    capabilities: ["text", "vision", "tools"],
    source: "env",
  });
}

function orderCanvasAgentCandidatesForSession(candidates, session) {
  if (!session?.pinnedCandidateId) return candidates;
  const pinned = candidates.find((candidate) => candidate.id === session.pinnedCandidateId);
  return pinned
    ? CanvasAgentRouter.orderAgentCandidatesByEndpointDiversity([
        pinned,
        ...candidates.filter((candidate) => candidate.id !== pinned.id),
      ])
    : candidates;
}

function makeCanvasAgentAttemptError(message, details = {}) {
  const error = new Error(String(message || "Canvas Agent upstream failed."));
  Object.assign(error, details);
  return error;
}

async function runCanvasAgentCandidate(candidate, context) {
  const { payload, skills, session, signal, policy } = context;
  const halfOpenLease = acquireCanvasAgentHalfOpenLease(candidate);
  if (!halfOpenLease.acquired) {
    throw makeCanvasAgentAttemptError("Canvas Agent route is being recovery-tested.", { category: "busy" });
  }
  const startedAt = Date.now();
  let firstEventAt = 0;
  let timeoutCode = "";
  const controller = new AbortController();
  const abortFromParent = () => {
    const error = makeCanvasAgentAttemptError("Canvas Agent request was cancelled.", {
      name: "AbortError",
      category: "cancelled",
      cancelledByUser: true,
    });
    controller.abort(error);
  };
  if (signal?.aborted) abortFromParent();
  else signal?.addEventListener("abort", abortFromParent, { once: true });
  const abortForTimeout = (code) => {
    timeoutCode ||= code;
    controller.abort(makeCanvasAgentAttemptError("Canvas Agent upstream timed out.", { code }));
  };
  let connectTimer = setTimeout(() => abortForTimeout("CONNECT_TIMEOUT"), policy.connectTimeoutMs);
  let firstEventTimer = null;
  const attemptTimer = setTimeout(() => abortForTimeout("ATTEMPT_TIMEOUT"), policy.attemptTimeoutMs);
  const markFirstEvent = () => {
    if (firstEventAt) return;
    firstEventAt = Date.now();
    if (firstEventTimer) clearTimeout(firstEventTimer);
  };

  try {
    const adapter = CanvasAgentLlmConnectors.resolveLlmConnector(candidate);
    const continuation = Boolean(String(payload.previous_response_id || "").trim() || Array.isArray(payload.tool_outputs) && payload.tool_outputs.length);
    // Always rebuild a continuation from our controlled transcript. OpenAI-compatible
    // reverse proxies frequently do not retain Responses API state across requests.
    const forceStateless = continuation;
    const effectivePayload = forceStateless && session.initialPayload
      ? {
          ...session.initialPayload,
          skill_mode: payload.skill_mode || session.initialPayload.skill_mode,
          skill_id: payload.skill_id ?? session.initialPayload.skill_id,
          active_skill_id: session.activeSkillId,
          board_id: session.boardId,
          tool_outputs: payload.tool_outputs,
          step: payload.step,
          previous_response_id: "",
        }
      : payload;
    const contextTranscript = normalizeCanvasAgentConversationContext(
      session.initialPayload?.conversation_context || payload.conversation_context,
    );
    const reasoningEffort = CanvasAgentRuntime.selectAgentReasoningEffort(effectivePayload, CANVAS_AGENT_REASONING_EFFORT);
    const requestBody = adapter.buildRequest(effectivePayload, {
      model: candidate.model,
      reasoningEffort,
      skills,
      contextTranscript,
      transcript: forceStateless ? session.transcript : [],
      forceStateless,
    });
    requestBody.stream = true;
    const upstream = await fetch(adapter.getEndpoint(candidate), {
      method: "POST",
      headers: adapter.getHeaders(candidate),
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    clearTimeout(connectTimer);
    connectTimer = null;
    firstEventTimer = setTimeout(() => abortForTimeout("FIRST_EVENT_TIMEOUT"), policy.firstEventTimeoutMs);
    const contentType = upstream.headers.get("content-type") || "";
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      const message = extractUpstreamErrorMessage(text, contentType) || `${upstream.status} ${upstream.statusText}`;
      throw makeCanvasAgentAttemptError(message, { httpStatus: upstream.status });
    }

    let turn;
    if (/text\/event-stream/i.test(contentType)) {
      turn = await adapter.consumeStream(upstream.body, { onFirstEvent: markFirstEvent });
    } else {
      const text = await upstream.text();
      markFirstEvent();
      let data;
      try {
        data = JSON.parse(text || "{}");
      } catch {
        throw makeCanvasAgentAttemptError("Canvas Agent upstream returned invalid JSON.", { code: "INVALID_JSON" });
      }
      turn = adapter.parseResponse(data);
    }
    if (!turn.message && !(Array.isArray(turn.tool_calls) && turn.tool_calls.length)) {
      throw makeCanvasAgentAttemptError("Canvas Agent upstream returned an empty response.", { code: "INVALID_AGENT_RESPONSE" });
    }
    const latencyMs = Date.now() - startedAt;
    const firstEventMs = firstEventAt ? firstEventAt - startedAt : latencyMs;
    queueCanvasAgentRouteEvent(candidate, { success: true, latencyMs, firstEventMs });
    setCanvasAgentCapability(candidate.providerId, candidate.model, {
      text: true,
      vision: candidate.capabilities.includes("vision"),
      tools: turn.tool_calls.length ? true : undefined,
      protocol: adapter.protocol,
      adapterId: adapter.id,
      latencyMs,
    });
    return { candidateId: candidate.id, candidate, turn };
  } catch (error) {
    let reported = error;
    if (signal?.aborted) {
      reported = makeCanvasAgentAttemptError("Canvas Agent request was cancelled.", {
        name: "AbortError",
        category: "cancelled",
        cancelledByUser: true,
      });
    } else if (timeoutCode) {
      reported = makeCanvasAgentAttemptError("Canvas Agent upstream timed out.", { code: timeoutCode });
    }
    if (!reported.cancelledByUser && reported.category !== "busy") {
      queueCanvasAgentRouteEvent(candidate, {
        success: false,
        latencyMs: Date.now() - startedAt,
        firstEventMs: firstEventAt ? firstEventAt - startedAt : 0,
        httpStatus: reported.httpStatus,
        category: CanvasAgentRouter.classifyAgentRouteError(reported),
      });
    }
    throw reported;
  } finally {
    if (connectTimer) clearTimeout(connectTimer);
    if (firstEventTimer) clearTimeout(firstEventTimer);
    clearTimeout(attemptTimer);
    if (halfOpenLease.halfOpen) canvasAgentHalfOpenRoutes.delete(candidate.id);
    signal?.removeEventListener("abort", abortFromParent);
  }
}

function normalizeCanvasAgentConversationContext(value) {
  return (Array.isArray(value) ? value : []).slice(-24).flatMap((item) => {
    const role = String(item?.role || "").toLowerCase();
    const content = String(item?.content || item?.text || "").trim().slice(0, 12000);
    if ((role === "user" || role === "assistant") && content) return [{ role, content }];
    if (role === "tool") {
      const label = String(item?.tool_name || item?.name || "画布操作").trim().slice(0, 80);
      const nodeId = String(item?.node_id || "").trim().slice(0, 120);
      const summary = content || `${label}已完成`;
      return [{ role: "assistant", content: `[已完成 ${label}${nodeId ? ` · 节点 ${nodeId}` : ""}] ${summary}` }];
    }
    return [];
  });
}

async function handleCanvasAgentTurn(req, res) {
  const wantsStream = String(req.headers.accept || "").includes("application/x-ndjson");
  const requestController = new AbortController();
  let streamStarted = false;
  let session = null;
  const cancelRequest = () => {
    if (!requestController.signal.aborted && !res.writableEnded) {
      const error = makeCanvasAgentAttemptError("Canvas Agent request was cancelled.", {
        name: "AbortError",
        category: "cancelled",
        cancelledByUser: true,
      });
      requestController.abort(error);
    }
  };
  req.once("aborted", cancelRequest);
  req.once("close", () => {
    if (req.aborted) cancelRequest();
  });
  res.once("close", () => {
    if (!res.writableEnded) cancelRequest();
  });
  try {
    const payload = await readJson(req);
    const skills = CanvasAgentRuntime.loadCanvasSkills(CANVAS_SKILLS_DIR);
    session = getOrCreateCanvasAgentSession(payload, skills);
    const scopedPayload = {
      ...payload,
      board_id: session.boardId,
      active_skill_id: session.activeSkillId,
    };
    let candidates = getCanvasAgentCandidates(scopedPayload);
    candidates = orderCanvasAgentCandidatesForSession(candidates, session);
    if (!candidates.length) throw makeCanvasAgentAttemptError("没有已配置且支持当前任务的 Agent 服务。", { category: "task" });
    if (!wantsStream && payload.previous_response_id && !session.pinnedCandidateId) {
      session.pinnedCandidateId = candidates[0].id;
    }
    if (wantsStream) {
      res.writeHead(200, {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Content-Type-Options": "nosniff",
      });
      streamStarted = true;
      writeCanvasAgentEvent(res, { type: "status", stage: "understanding" });
    }
    const result = await CanvasAgentRouter.executeSequentialFailover({
      candidates,
      signal: requestController.signal,
      policy: {
        connectTimeoutMs: CANVAS_AGENT_CONNECT_TIMEOUT_MS,
        firstEventTimeoutMs: CANVAS_AGENT_FIRST_EVENT_TIMEOUT_MS,
        attemptTimeoutMs: CANVAS_AGENT_ATTEMPT_TIMEOUT_MS,
        totalTimeoutMs: CANVAS_AGENT_TOTAL_TIMEOUT_MS,
      },
      onStatus: (event) => {
        if (wantsStream) writeCanvasAgentEvent(res, { type: "status", stage: event.stage === "recovering" ? "recovering" : "understanding" });
      },
      runAttempt: (candidate, attempt) => {
        const routeState = readCanvasAgentRouteHistory().agentRoutes[candidate.id] || {};
        const adaptivePolicy = CanvasAgentRouter.getAdaptiveAgentAttemptPolicy(
          candidate,
          routeState.health || routeState,
          attempt.policy,
        );
        return runCanvasAgentCandidate(candidate, {
          payload: scopedPayload,
          skills,
          session,
          signal: attempt.signal,
          policy: adaptivePolicy,
        });
      },
    });
    if (wantsStream && result.candidate?.id !== candidates[0]?.id) {
      writeCanvasAgentEvent(res, { type: "status", stage: "resumed" });
    }
    appendCanvasAgentSessionTurn(session, scopedPayload, result.turn, result.candidate);
    const turn = sanitizeCanvasAgentTurn(result.turn);
    if (!turn.tool_calls.length) disposeCanvasAgentSession(session);
    if (wantsStream) {
      writeCanvasAgentEvent(res, { type: "turn", turn });
      res.end();
    } else {
      sendJson(res, 200, turn);
    }
  } catch (error) {
    const cancelled = error?.name === "AbortError" && error?.cancelledByUser;
    const unavailable = error?.name === "CanvasAgentUnavailableError"
      || /没有已配置且支持当前任务的 Agent 服务/.test(String(error?.message || ""));
    const message = cancelled
      ? "Canvas Agent request was cancelled."
      : unavailable ? "所有可用服务暂时不可用，任务已保存，请稍后重试。" : error.message;
    disposeCanvasAgentSession(session, { retainCheckpoint: unavailable });
    if (streamStarted && !res.writableEnded) {
      writeCanvasAgentEvent(res, { type: "error", error: message, recoverable: unavailable });
      res.end();
    } else if (!res.writableEnded) {
      sendJson(res, cancelled ? 499 : unavailable ? 503 : 400, { error: message, recoverable: unavailable });
    }
  }
}

async function handleCanvasAgentCancel(req, res) {
  try {
    const payload = await readJson(req);
    const runId = String(payload.run_id || "").trim();
    if (!/^[a-zA-Z0-9_-]{1,120}$/.test(runId)) throw new Error("Invalid Canvas Agent run id.");
    disposeCanvasAgentSession(canvasAgentSessions.get(runId));
    sendJson(res, 200, { ok: true });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
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
    cleanupAbandonedUploads();
    const uploadId = safeUploadId(req.headers["x-upload-id"]);
    const index = Number(req.headers["x-chunk-index"]);
    const total = Number(req.headers["x-chunk-total"]);
    const contentType = String(req.headers["x-file-type"] || req.headers["content-type"] || "image/png");
    const filename = decodeHeaderFilename(req.headers["x-file-name"]) || "canvas-image";

    if (!uploadId || !Number.isInteger(index) || !Number.isInteger(total) || index < 0 || total < 1 || total > MAX_UPLOAD_CHUNKS || index >= total) {
      sendJson(res, 400, { error: "Invalid upload chunk headers." });
      return;
    }

    const chunk = await readBodyBuffer(req);
    const dir = path.join(UPLOAD_TMP_DIR, uploadId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${index}.part`), chunk);

    const state = getUploadChunkState(dir, total);
    if (state.totalBytes > MAX_REQUEST_BYTES) {
      fs.rmSync(dir, { recursive: true, force: true });
      throw new Error(`Upload is too large. Current limit is ${Math.round(MAX_REQUEST_BYTES / 1024 / 1024)}MB.`);
    }
    if (!state.complete) {
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

async function handleMediaUpload(req, res) {
  try {
    const requestType = String(req.headers["content-type"] || "application/octet-stream");
    if (requestType.includes("multipart/form-data")) {
      const buffer = await readBodyBuffer(req);
      const files = parseMultipartFiles(requestType, buffer);
      const media = files.find((file) => file.name === "media" || isSupportedMediaMime(file.contentType));
      if (!media) throw new Error("Missing media file.");
      const saved = saveBinaryMedia(media.buffer, media.filename || "canvas-media", media.contentType);
      sendJson(res, 200, saved);
      return;
    }

    if (requestType.startsWith("image/") || requestType.startsWith("video/") || requestType.startsWith("audio/") || requestType === "application/octet-stream") {
      const buffer = await readBodyBuffer(req);
      const name = decodeHeaderFilename(req.headers["x-file-name"]) || "canvas-media";
      const saved = saveBinaryMedia(buffer, name, requestType);
      sendJson(res, 200, saved);
      return;
    }

    const payload = await readJson(req);
    if (!payload.media) throw new Error("Missing media file.");
    const file = dataUrlToFile(payload.media, payload.name || "canvas-media");
    const saved = saveBinaryMedia(Buffer.from(await file.blob.arrayBuffer()), file.filename, file.blob.type);
    sendJson(res, 200, saved);
  } catch (error) {
    sendJson(res, 400, { error: formatErrorMessage(error) });
  }
}

async function handleMediaChunkUpload(req, res) {
  try {
    cleanupAbandonedUploads();
    const uploadId = safeUploadId(req.headers["x-upload-id"]);
    const index = Number(req.headers["x-chunk-index"]);
    const total = Number(req.headers["x-chunk-total"]);
    const contentType = String(req.headers["x-file-type"] || req.headers["content-type"] || "application/octet-stream");
    const filename = decodeHeaderFilename(req.headers["x-file-name"]) || "canvas-media";
    const mimeType = inferMediaMimeType(filename, contentType);

    if (!uploadId || !Number.isInteger(index) || !Number.isInteger(total) || index < 0 || total < 1 || total > MAX_UPLOAD_CHUNKS || index >= total) {
      sendJson(res, 400, { error: "Invalid upload chunk headers." });
      return;
    }
    if (!isSupportedMediaMime(mimeType)) {
      sendJson(res, 400, { error: "Only image, video, and audio files are supported." });
      return;
    }

    const chunk = await readBodyBuffer(req);
    const dir = path.join(UPLOAD_TMP_DIR, uploadId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${index}.part`), chunk);

    const state = getUploadChunkState(dir, total);
    if (state.totalBytes > MAX_MEDIA_UPLOAD_BYTES) {
      fs.rmSync(dir, { recursive: true, force: true });
      throw new Error(`Upload is too large. Current media limit is ${Math.round(MAX_MEDIA_UPLOAD_BYTES / 1024 / 1024)}MB.`);
    }
    if (!state.complete) {
      sendJson(res, 200, { ok: true, received: index + 1, total });
      return;
    }

    const saved = saveChunkedUpload(dir, total, filename, mimeType);
    fs.rmSync(dir, { recursive: true, force: true });
    sendJson(res, 200, { ...saved, mimeType, complete: true });
  } catch (error) {
    sendJson(res, 400, { error: formatErrorMessage(error) });
  }
}

function inferMediaMimeType(filename, contentType = "") {
  const declared = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (isSupportedMediaMime(declared)) return declared;
  return mimeTypes[path.extname(String(filename || "")).toLowerCase()] || declared;
}

function isSupportedMediaMime(value) {
  return /^(image|video|audio)\//i.test(String(value || ""));
}

function saveBinaryMedia(buffer, name = "media", mimeType = "application/octet-stream") {
  const normalizedMime = inferMediaMimeType(name, mimeType);
  if (!isSupportedMediaMime(normalizedMime)) throw new Error("Only image, video, and audio files are supported.");
  const target = buildOutputImagePath(name, normalizedMime);
  fs.writeFileSync(target.filePath, buffer);
  return {
    filename: target.filename,
    url: `/output/${target.filename}`,
    mimeType: normalizedMime,
  };
}

function safeUploadId(value) {
  const text = String(value || "");
  return /^[a-zA-Z0-9_-]{8,80}$/.test(text) ? text : "";
}

function getUploadChunkState(dir, total) {
  const indexes = new Set();
  let totalBytes = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const match = entry.name.match(/^(\d+)\.part$/);
    if (!match) continue;
    totalBytes += fs.statSync(path.join(dir, entry.name)).size;
    const index = Number(match[1]);
    if (!Number.isInteger(index) || index < 0 || index >= total) continue;
    indexes.add(index);
  }
  return { complete: indexes.size === total, received: indexes.size, totalBytes };
}

function cleanupAbandonedUploads(now = Date.now()) {
  for (const entry of fs.readdirSync(UPLOAD_TMP_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(UPLOAD_TMP_DIR, entry.name);
    try {
      if (now - fs.statSync(dir).mtimeMs > UPLOAD_TMP_TTL_MS) fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // A concurrent upload may have completed while cleanup was scanning.
    }
  }
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
    mimeType,
  };
}

async function handleMinimaxH3Video(req, res) {
  try {
    if (!fs.existsSync(MINIMAX_H3_WORKFLOW_FILE)) {
      sendJson(res, 500, { error: "MiniMax H3 workflow file is missing." });
      return;
    }

    const payload = await readJson(req);
    const normalized = normalizeMinimaxH3Request(payload);
    cleanupUpscaleTasks();
    const taskId = crypto.randomUUID();
    UPSCALE_TASKS.set(taskId, {
      id: taskId,
      type: "minimax-h3-video",
      status: "queued",
      progress: 5,
      message: "任务已创建，准备上传参考素材...",
      created_at: Date.now(),
      updated_at: Date.now(),
      images: [],
      videos: [],
    });

    runMinimaxH3VideoTask(taskId, { ...normalized, comfyUrl: COMFYUI_URL }).catch((error) => {
      updateUpscaleTask(taskId, {
        status: "failed",
        progress: 0,
        message: `MiniMax H3 生成失败：${formatErrorMessage(error)}`,
        error: formatErrorMessage(error),
      });
    });

    sendJson(res, 202, { task_id: taskId });
  } catch (error) {
    sendJson(res, 400, { error: formatErrorMessage(error) });
  }
}

async function runMinimaxH3VideoTask(taskId, request) {
  updateUpscaleTask(taskId, { status: "running", progress: 10, message: "正在上传参考素材到 ComfyUI..." });
  const comfyUrl = normalizeComfyUrl(request.comfyUrl || COMFYUI_URL);
  const uploadToken = makeComfyUploadToken(taskId);
  const uploaded = { images: [], videos: [], audios: [] };
  const groups = [
    ["images", "image"],
    ["videos", "video"],
    ["audios", "audio"],
  ];

  let uploadedCount = 0;
  const totalUploads = request.images.length + request.videos.length + request.audios.length;
  for (const [collection, kind] of groups) {
    for (const [index, reference] of request[collection].entries()) {
      const result = await uploadMediaReferenceToComfy(comfyUrl, reference, kind, index, uploadToken);
      uploaded[collection].push({ ...reference, name: result.name });
      uploadedCount += 1;
      updateUpscaleTask(taskId, {
        progress: 10 + Math.round((uploadedCount / Math.max(1, totalUploads)) * 18),
        message: `正在上传参考素材 (${uploadedCount}/${totalUploads})...`,
      });
    }
  }

  const seed = Number.isSafeInteger(request.seed) ? request.seed : crypto.randomInt(1, 2147483647);
  const workflowTemplate = JSON.parse(fs.readFileSync(MINIMAX_H3_WORKFLOW_FILE, "utf8"));
  const outputPrefix = `video/minimax_h3_${Date.now()}_${taskId.slice(0, 8)}`;
  const workflow = prepareMinimaxH3Workflow(workflowTemplate, {
    ...request,
    seed,
    images: uploaded.images,
    videos: uploaded.videos,
    audios: uploaded.audios,
  }, outputPrefix);

  updateUpscaleTask(taskId, { progress: 30, message: "正在提交 MiniMax H3 工作流...", seed });
  const promptId = await submitComfyPrompt(comfyUrl, workflow);
  updateUpscaleTask(taskId, {
    progress: 35,
    message: "ComfyUI 已接收任务，正在生成视频...",
    prompt_id: promptId,
  });

  const history = await waitForComfyHistory(comfyUrl, promptId, (status) => updateUpscaleTask(taskId, {
    ...status,
    message: status.message || "MiniMax H3 正在生成视频，可能需要几分钟...",
  }));
  updateUpscaleTask(taskId, { progress: 94, message: "视频生成完成，正在保存到本地..." });
  const videos = await saveComfyHistoryVideos(comfyUrl, history, `minimax_h3_${Date.now()}_`, ["230"]);
  if (!videos.length) {
    const observed = Object.keys(history?.outputs || {}).join(", ") || "none";
    throw new Error(`ComfyUI completed, but no video output was found. Observed output nodes: ${observed}.`);
  }

  updateUpscaleTask(taskId, {
    status: "success",
    progress: 100,
    message: "MiniMax H3 视频生成完成。",
    videos,
    comfy: comfyUrl,
    seed,
  });
}

async function uploadMediaReferenceToComfy(comfyUrl, reference, kind, index, token) {
  const sanitized = sanitizeReferenceName(reference.name, kind, index);
  const uploadName = makeComfyUploadFilename(sanitized, `${token}_${kind}_${index + 1}`);
  const media = await mediaReferenceToFile(reference.url, uploadName, kind);
  const form = new FormData();
  form.append("image", media.blob, media.filename);
  form.append("overwrite", "true");
  const { response, data } = await fetchJsonResponseWithTimeout(`${comfyUrl}/upload/image`, { method: "POST", body: form }, COMFY_UPLOAD_TIMEOUT_MS);
  if (!response.ok) throw new Error(formatErrorMessage(data.error || data.message || `ComfyUI ${kind} upload failed: ${response.status}`));
  const name = [data.subfolder, data.name || media.filename].filter(Boolean).join("/");
  return { ...data, name };
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
  if (workflowType === "outpaint") return OUTPAINT_WORKFLOW_FILE;
  if (workflowType === "runninghub-outpaint") return RUNNINGHUB_OUTPAINT_WORKFLOW_FILE;
  if (workflowType === "flux2-klein-edit") return FLUX2_KLEIN_EDIT_WORKFLOW_FILE;
  if (workflowType === "qwen-edit-angle") return QWEN_EDIT_ANGLE_WORKFLOW_FILE;
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
  if (payload.workflowType === "outpaint") {
    await runOutpaintTask(taskId, payload);
    return;
  }
  if (payload.workflowType === "runninghub-outpaint") {
    await runRunningHubOutpaintTask(taskId, payload);
    return;
  }
  if (payload.workflowType === "flux2-klein-edit") {
    await runFlux2KleinEditTask(taskId, payload);
    return;
  }
  if (payload.workflowType === "qwen-edit-angle") {
    await runQwenEditAngleTask(taskId, payload);
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
  const inputDimensions = getImageReferenceDimensions(payload.image);

  updateUpscaleTask(taskId, { progress: 20, message: `正在准备 ${isSeedVr2 ? "SeedVR2" : "TTP"} 放大工作流...` });
  if (isSeedVr2 && requestedResolution && requestedResolution > 4096) {
    throw new Error("SeedVR2 当前工作流最高支持 4K，请选择 2K 或 4K。");
  }
  if (isSeedVr2 && workflow["80"]?.inputs && workflow["41"]?.inputs) {
    workflow["80"].inputs.image = uploaded.name;
    workflow["41"].inputs.seed = seed;
    if (requestedResolution) {
      workflow["41"].inputs.resolution = requestedResolution;
      workflow["41"].inputs.max_resolution = requestedResolution;
    }
    if (workflow["26"]?.inputs) workflow["26"].inputs.filename_prefix = `seedvr2_upscale_${Date.now()}`;
  } else if (workflow["10"]?.inputs && workflow["11"]?.inputs) {
    workflow["10"].inputs.image = uploaded.name;
    if (requestedResolution) {
      const upscaleModel = chooseTtpUpscaleModel(workflow["12"]?.inputs?.model_name, requestedResolution);
      if (workflow["12"]?.inputs && upscaleModel) workflow["12"].inputs.model_name = upscaleModel;
      const modelScale = getUpscaleModelFactor(workflow["12"]?.inputs?.model_name);
      const inputLongEdge = Math.max(inputDimensions?.width || 0, inputDimensions?.height || 0);
      const preScaleLength = Math.max(
        1024,
        inputLongEdge || Math.round(requestedResolution / modelScale),
        Math.round(requestedResolution / modelScale),
      );
      workflow["11"].inputs.scale_to_length = preScaleLength;
      workflow["11"].inputs.scale_to_side = "longest";
      const finalLongEdge = Math.max(requestedResolution, inputLongEdge || 0);
      ensureTtpFinalResizeNode(workflow, finalLongEdge);
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
    upscale_model: workflow["12"]?.inputs?.model_name,
    pre_upscale_length: workflow["11"]?.inputs?.scale_to_length,
    pre_upscale_side: workflow["11"]?.inputs?.scale_to_side,
    batch_size: isSeedVr2 ? workflow["41"]?.inputs?.batch_size : batchSize,
    input: uploaded.name,
  });

  const history = await waitForComfyHistory(comfyUrl, promptId, (status) => updateUpscaleTask(taskId, status));
  updateUpscaleTask(taskId, { progress: 94, message: "ComfyUI 已完成，正在保存高清图片..." });
  const preferredOutputIds = isSeedVr2 ? ["26", "1078"] : ["32"];
  const images = await saveComfyHistoryImages(comfyUrl, history, `upscale_${Date.now()}_`, preferredOutputIds);
  if (!images.length) throw new Error("ComfyUI completed, but no output image was found.");

  updateUpscaleTask(taskId, {
    status: "success",
    progress: 100,
    message: "放大完成。",
    images,
    comfy: comfyUrl,
  });
}

async function runFlux2KleinEditTask(taskId, payload) {
  updateUpscaleTask(taskId, { status: "running", progress: 10, message: "正在上传图片到 ComfyUI..." });
  const comfyUrl = normalizeComfyUrl(payload.comfy_url || COMFYUI_URL);
  const uploadToken = makeComfyUploadToken(taskId);
  const uploaded = await uploadDataUrlToComfy(comfyUrl, payload.image, makeComfyUploadFilename(payload.name || "flux2_klein_input.png", uploadToken));
  const uploadedMask = payload.mask_image ? await uploadDataUrlToComfy(comfyUrl, payload.mask_image, makeComfyUploadFilename(payload.mask_name || "flux2_klein_mask.png", uploadToken + "_mask")) : null;
  const workflow = JSON.parse(fs.readFileSync(FLUX2_KLEIN_EDIT_WORKFLOW_FILE, "utf8"));
  const seed = Number(payload.seed || crypto.randomInt(1, 2147483647));
  const prompt = String(payload.prompt || "保持主体构图、材质、颜色和位置自然一致，只按提示进行图片编辑。").trim();

  updateUpscaleTask(taskId, { progress: 22, message: "正在准备 Flux2 Klein 图片编辑工作流..." });
  if (!workflow["123"]?.inputs || !workflow["117"]?.inputs || !workflow["165"]?.inputs) {
    throw new Error("Unsupported Flux2 Klein workflow: required nodes 123, 117, or 165 were not found.");
  }

  workflow["123"].inputs.image = uploaded.name;
  if (uploadedMask) {
    workflow["169"] = {
      inputs: { image: uploadedMask.name },
      class_type: "LoadImage",
      _meta: { title: "加载遮罩" },
    };
    if (workflow["167"]?.inputs) workflow["167"].inputs.mask = ["169", 1];
  }
  workflow["117"].inputs.text = prompt;
  setWorkflowSeed(workflow, seed);
  const outputPrefix = `flux2_klein_edit_${Date.now()}`;
  workflow["165"].inputs.filename_prefix = outputPrefix;

  updateUpscaleTask(taskId, { progress: 30, message: "正在提交 Flux2 Klein 队列..." });
  const promptId = await submitComfyPrompt(comfyUrl, workflow);
  updateUpscaleTask(taskId, {
    progress: 38,
    message: "ComfyUI 已接收 Flux2 Klein 任务，正在处理...",
    prompt_id: promptId,
    seed,
    input: uploaded.name,
  });

  const history = await waitForComfyHistory(comfyUrl, promptId, (status) => updateUpscaleTask(taskId, {
    ...status,
    message: status.message || "ComfyUI 正在处理 Flux2 Klein 图片编辑...",
  }));
  updateUpscaleTask(taskId, { progress: 94, message: "ComfyUI 已完成，正在保存 Flux2 Klein 结果..." });
  const images = await saveComfyHistoryImages(comfyUrl, history, `flux2_klein_edit_${Date.now()}_`, ["165"], { strictPreferred: true, lastOnly: true, filenamePrefix: outputPrefix });
  if (!images.length) throw new Error("ComfyUI completed, but no Flux2 Klein output image was found.");

  updateUpscaleTask(taskId, {
    status: "success",
    progress: 100,
    message: "Flux2 Klein 图片编辑完成。",
    images,
    comfy: comfyUrl,
  });
}


function normalizeQwenAngleValue(value, fallback, min, max, decimals = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const factor = 10 ** decimals;
  const rounded = Math.round(number * factor) / factor;
  return Math.max(min, Math.min(max, rounded));
}

function toQwenComfyHorizontalAngle(value) {
  const normalized = normalizeQwenAngleValue(value, 49, -180, 180);
  return ((normalized % 360) + 360) % 360;
}

async function runQwenEditAngleTask(taskId, payload) {
  updateUpscaleTask(taskId, { status: "running", progress: 10, message: "\u6b63\u5728\u4e0a\u4f20\u56fe\u7247\u5230 ComfyUI..." });
  const comfyUrl = normalizeComfyUrl(payload.comfy_url || COMFYUI_URL);
  const uploadToken = makeComfyUploadToken(taskId);
  const uploaded = await uploadDataUrlToComfy(comfyUrl, payload.image, makeComfyUploadFilename(payload.name || "qwen_angle_input.png", uploadToken));
  const workflow = JSON.parse(fs.readFileSync(QWEN_EDIT_ANGLE_WORKFLOW_FILE, "utf8"));
  const seed = Number(payload.seed || crypto.randomInt(1, 2147483647));
  const horizontalAngle = toQwenComfyHorizontalAngle(payload.horizontal_angle);
  const verticalAngle = normalizeQwenAngleValue(payload.vertical_angle, 0, -30, 60);
  const zoom = normalizeQwenAngleValue(payload.zoom, 5, 0, 10, 1);

  updateUpscaleTask(taskId, { progress: 22, message: "\u6b63\u5728\u51c6\u5907 Qwen \u89d2\u5ea6\u5207\u6362\u5de5\u4f5c\u6d41..." });
  if (!workflow["173"]?.inputs || !workflow["187"]?.inputs || !workflow["186"]?.inputs) {
    throw new Error("Unsupported Qwen angle workflow: required nodes 173, 187, or 186 were not found.");
  }

  workflow["173"].inputs.image = uploaded.name;
  workflow["187"].inputs.horizontal_angle = horizontalAngle;
  workflow["187"].inputs.vertical_angle = verticalAngle;
  workflow["187"].inputs.zoom = zoom;
  workflow["187"].inputs.default_prompts = false;
  workflow["187"].inputs.camera_view = false;
  setWorkflowSeed(workflow, seed);
  const outputPrefix = "qwen_edit_angle_" + Date.now();
  workflow["186"].inputs.filename_prefix = outputPrefix;

  updateUpscaleTask(taskId, { progress: 30, message: "\u6b63\u5728\u63d0\u4ea4 Qwen \u89d2\u5ea6\u5207\u6362\u961f\u5217..." });
  const promptId = await submitComfyPrompt(comfyUrl, workflow);
  updateUpscaleTask(taskId, {
    progress: 38,
    message: "ComfyUI \u5df2\u63a5\u6536 Qwen \u89d2\u5ea6\u5207\u6362\u4efb\u52a1\uff0c\u6b63\u5728\u5904\u7406...",
    prompt_id: promptId,
    seed,
    input: uploaded.name,
    horizontal_angle: horizontalAngle,
    vertical_angle: verticalAngle,
    zoom,
  });

  const history = await waitForComfyHistory(comfyUrl, promptId, (status) => updateUpscaleTask(taskId, {
    ...status,
    message: status.message || "ComfyUI \u6b63\u5728\u5904\u7406 Qwen \u89d2\u5ea6\u5207\u6362...",
  }));
  updateUpscaleTask(taskId, { progress: 94, message: "ComfyUI \u5df2\u5b8c\u6210\uff0c\u6b63\u5728\u4fdd\u5b58 Qwen \u7ed3\u679c..." });
  const images = await saveComfyHistoryImages(comfyUrl, history, "qwen_edit_angle_" + Date.now() + "_", ["186"], { strictPreferred: true, lastOnly: true, filenamePrefix: outputPrefix });
  if (!images.length) throw new Error("ComfyUI completed, but no Qwen angle output image was found.");

  updateUpscaleTask(taskId, {
    status: "success",
    progress: 100,
    message: "Qwen \u89d2\u5ea6\u5207\u6362\u5b8c\u6210\u3002",
    images,
    comfy: comfyUrl,
  });
}

function setWorkflowSeed(workflow, seed) {
  for (const node of Object.values(workflow || {})) {
    if (!node?.inputs) continue;
    if (Object.prototype.hasOwnProperty.call(node.inputs, "seed")) {
      node.inputs.seed = seed;
    }
    if (Object.prototype.hasOwnProperty.call(node.inputs, "noise_seed")) {
      node.inputs.noise_seed = seed;
    }
  }
}

function makeComfyUploadToken(taskId) {
  const taskPart = String(taskId || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]+/g, "").slice(0, 8);
  return `${Date.now()}_${taskPart}_${crypto.randomBytes(3).toString("hex")}`;
}

function makeComfyUploadFilename(filename, token) {
  const value = String(filename || "image.png");
  const extension = path.extname(value) || ".png";
  const base = path.basename(value, extension).replace(/[\/:*?"<>|]+/g, "-") || "image";
  return `${base}_${token}${extension}`;
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

  const shoeSwapRunId = Date.now();
  const shoeSwapCropPrefix = `shoe_swap_crop_${shoeSwapRunId}`;
  const shoeSwapFinalPrefix = `shoe_swap_${shoeSwapRunId}`;

  workflow["13"].inputs.image = person.name;
  workflow["10"].inputs.image = shoe.name;
  workflow["3"].inputs.seed = seed;
  workflow["3"].inputs.model = payload.model || "gemini-3.1-flash-image";
  workflow["3"].inputs.image_size = imageSize;
  workflow["3"].inputs.apikey = IMAGE_CHAT_API_KEY || API_KEY;
  if (workflow["4"]?.inputs) workflow["4"].inputs.prompt = payload.prompt || SHOE_SWAP_PROMPT;
  if (workflow["7"]?.inputs) workflow["7"].inputs.filename_prefix = shoeSwapCropPrefix;
  if (workflow["14"]?.inputs) workflow["14"].inputs.filename_prefix = shoeSwapFinalPrefix;

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
  let images = await saveComfyHistoryImages(comfyUrl, history, `shoe_swap_${Date.now()}_`, ["14"], { strictPreferred: true, lastOnly: true, filenamePrefix: shoeSwapFinalPrefix });
  let usedFallbackOutput = false;
  if (!images.length) {
    updateUpscaleTask(taskId, { progress: 96, message: "Final stitch node had no output; saving Gemini raw shoe-swap result..." });
    images = await saveComfyHistoryImages(comfyUrl, history, `shoe_swap_raw_${Date.now()}_`, ["7"], { strictPreferred: true, lastOnly: true, filenamePrefix: shoeSwapCropPrefix });
    usedFallbackOutput = !!images.length;
  }
  if (!images.length) {
    const outputIds = Object.keys(history.outputs || {}).join(", ") || "none";
    throw new Error(`ComfyUI completed, but no shoe swap output image was found. Checked final node 14 and fallback node 7. History outputs: ${outputIds}.`);
  }

  updateUpscaleTask(taskId, {
    status: "success",
    progress: 100,
    message: "换鞋完成。",
    images,
    fallback_output: usedFallbackOutput,
    comfy: comfyUrl,
  });
}

async function runOutpaintTask(taskId, payload) {
  updateUpscaleTask(taskId, { status: "running", progress: 10, message: "正在上传图片到 ComfyUI..." });
  const comfyUrl = normalizeComfyUrl(payload.comfy_url || COMFYUI_URL);
  const uploaded = await uploadDataUrlToComfy(comfyUrl, payload.image, payload.name || "outpaint_input.png");
  const workflow = JSON.parse(fs.readFileSync(OUTPAINT_WORKFLOW_FILE, "utf8"));
  const seed = Number(payload.seed || crypto.randomInt(1, 2147483647));
  const padding = normalizeOutpaintPadding(payload);

  updateUpscaleTask(taskId, { progress: 22, message: "正在准备扩图工作流..." });
  if (!workflow["562"]?.inputs || !workflow["595"]?.inputs || !workflow["576"]?.inputs || !workflow["591"]?.inputs) {
    throw new Error("Unsupported outpaint workflow: required nodes 562, 595, 576, or 591 were not found.");
  }

  workflow["562"].inputs.image = uploaded.name;
  if (payload.alphaMaskInput) {
    replaceWorkflowReference(workflow, "595", 0, "562", 0);
    replaceWorkflowReference(workflow, "595", 1, "562", 1);
  } else {
    workflow["595"].inputs.left = padding.left;
    workflow["595"].inputs.top = padding.top;
    workflow["595"].inputs.right = padding.right;
    workflow["595"].inputs.bottom = padding.bottom;
    workflow["595"].inputs.feathering = Number(payload.feathering || 100);
  }
  workflow["576"].inputs.seed = seed;
  workflow["591"].inputs.filename_prefix = `z_image_outpaint_${Date.now()}`;
  if (workflow["566"]?.inputs) {
    workflow["566"].inputs.background_color = "#ffffff";
  }
  if (workflow["356"]?.inputs) {
    workflow["356"].inputs.temperature = 0.35;
    workflow["356"].inputs.text = [
      "你是一位专业的AI扩图提示词工程师。请只描述输入图中已经存在的主体、场景、色调、材质、光影和构图，用于向外延展画面。",
      "扩展区域必须自然延续原图，不要改变主体身份、服装颜色、材质和场景氛围。",
      "保持原图的浅色、柔和、干净基调，避免新增黑色衣物、大块深色阴影、暗背景、陌生人物、突兀头发或与原图不一致的物体。",
      "中文提示词，不要描述水印、文字、边框或无关符号，不需要总结，限制在500字以内。",
    ].join("\n");
  }
  if (workflow["566"]?.inputs && payload.scale_to_length) {
    workflow["566"].inputs.scale_to_length = Number(payload.scale_to_length);
  }

  updateUpscaleTask(taskId, { progress: 30, message: "正在提交 ComfyUI 扩图队列..." });
  const promptId = await submitComfyPrompt(comfyUrl, workflow);
  updateUpscaleTask(taskId, {
    progress: 38,
    message: "ComfyUI 已接收扩图任务，正在处理...",
    prompt_id: promptId,
    seed,
    padding,
    input: uploaded.name,
  });

  const history = await waitForComfyHistory(comfyUrl, promptId, (status) => updateUpscaleTask(taskId, {
    ...status,
    message: status.message || "ComfyUI 正在处理扩图，可能需要几分钟...",
  }));
  updateUpscaleTask(taskId, { progress: 94, message: "ComfyUI 已完成，正在保存扩图结果..." });
  const images = await saveComfyHistoryImages(comfyUrl, history, `outpaint_${Date.now()}_`, ["591"]);
  if (!images.length) throw new Error("ComfyUI completed, but no outpaint output image was found.");

  updateUpscaleTask(taskId, {
    status: "success",
    progress: 100,
    message: "扩图完成。",
    images,
    comfy: comfyUrl,
  });
}

async function runRunningHubOutpaintTask(taskId, payload) {
  if (!RUNNINGHUB_API_KEY) {
    throw new Error("后端缺少 RUNNINGHUB_API_KEY，请先在 .env 里配置。");
  }

  updateUpscaleTask(taskId, { status: "running", progress: 8, message: "正在验证 RunningHub API Key..." });
  await checkRunningHubAccountStatus();

  updateUpscaleTask(taskId, { progress: 10, message: "正在上传图片到 RunningHub..." });
  const image = await imageReferenceToFile(payload.image, payload.name || "runninghub_outpaint_input.png");
  const uploaded = await uploadFileToRunningHub(image.blob, image.filename);
  const padding = normalizeOutpaintPadding({ ...payload, direction: "custom" });
  const prompt = String(payload.prompt || "").trim() || "Extend the image naturally. Keep the original subject, scene, lighting, colors and perspective consistent.";

  updateUpscaleTask(taskId, { progress: 24, message: "正在提交 RunningHub 扩图工作流..." });
  const nodeInfoList = [
    { nodeId: "141", fieldName: "image", fieldValue: uploaded.fileName },
    { nodeId: "237", fieldName: "left", fieldValue: String(padding.left) },
    { nodeId: "237", fieldName: "top", fieldValue: String(padding.top) },
    { nodeId: "237", fieldName: "right", fieldValue: String(padding.right) },
    { nodeId: "237", fieldName: "bottom", fieldValue: String(padding.bottom) },
    { nodeId: "142", fieldName: "text", fieldValue: prompt },
    { nodeId: "137", fieldName: "seed", fieldValue: String(Number(payload.seed || crypto.randomInt(1, 2147483647))) },
    { nodeId: "285", fieldName: "filename_prefix", fieldValue: `runninghub_outpaint_${Date.now()}` },
  ];
  const runningHubTaskId = await createRunningHubTask(nodeInfoList);

  updateUpscaleTask(taskId, {
    progress: 35,
    message: "RunningHub 已接收任务，正在排队或运行...",
    runninghub_task_id: runningHubTaskId,
    padding,
  });

  const outputs = await waitForRunningHubOutputs(runningHubTaskId, ({ progress, message }) => {
    updateUpscaleTask(taskId, { progress, message });
  });
  updateUpscaleTask(taskId, { progress: 94, message: "RunningHub 已完成，正在保存扩图结果..." });

  const images = await saveRunningHubOutputImages(outputs, `runninghub_outpaint_${Date.now()}_`);
  if (!images.length) throw new Error("RunningHub completed, but no output image was found.");

  updateUpscaleTask(taskId, {
    status: "success",
    progress: 100,
    message: "RunningHub 扩图完成。",
    images,
    padding,
    runninghub: RUNNINGHUB_BASE_URL,
  });
}

function normalizeOutpaintPadding(payload) {
  const amount = Math.max(0, Math.min(2048, Number(payload.amount || 200)));
  const direction = String(payload.direction || "horizontal");
  const custom = {
    left: Number(payload.left || 0),
    top: Number(payload.top || 0),
    right: Number(payload.right || 0),
    bottom: Number(payload.bottom || 0),
  };
  if (direction === "custom") {
    return {
      left: normalizeOutpaintSide(custom.left),
      top: normalizeOutpaintSide(custom.top),
      right: normalizeOutpaintSide(custom.right),
      bottom: normalizeOutpaintSide(custom.bottom),
    };
  }
  const normalizedAmount = normalizeOutpaintSide(amount);
  if (direction === "left") return { left: normalizedAmount, top: 0, right: 0, bottom: 0 };
  if (direction === "right") return { left: 0, top: 0, right: normalizedAmount, bottom: 0 };
  if (direction === "top") return { left: 0, top: normalizedAmount, right: 0, bottom: 0 };
  if (direction === "bottom") return { left: 0, top: 0, right: 0, bottom: normalizedAmount };
  if (direction === "vertical") return { left: 0, top: normalizedAmount, right: 0, bottom: normalizedAmount };
  if (direction === "all") return { left: normalizedAmount, top: normalizedAmount, right: normalizedAmount, bottom: normalizedAmount };
  return { left: normalizedAmount, top: 0, right: normalizedAmount, bottom: 0 };
}

function normalizeOutpaintSide(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  return Math.max(0, Math.min(2048, Math.round(number / 16) * 16));
}

function replaceWorkflowReference(value, fromNode, fromOutput, toNode, toOutput) {
  if (Array.isArray(value)) {
    if (value.length === 2 && String(value[0]) === String(fromNode) && Number(value[1]) === Number(fromOutput)) {
      value[0] = String(toNode);
      value[1] = Number(toOutput);
      return;
    }
    value.forEach((item) => replaceWorkflowReference(item, fromNode, fromOutput, toNode, toOutput));
    return;
  }
  if (!value || typeof value !== "object") return;
  Object.values(value).forEach((item) => replaceWorkflowReference(item, fromNode, fromOutput, toNode, toOutput));
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
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const category = url.searchParams.get("category");
    const id = url.searchParams.get("id");
    if (id) {
      const records = readHistoryFile(filePath).filter((record) => String(record.id || "") !== id);
      writeHistoryFile(filePath, records);
      sendJson(res, 200, { records });
    } else if (category) {
      const records = readHistoryFile(filePath).filter((record) => getHistoryRecordCategory(record) !== category);
      writeHistoryFile(filePath, records);
      sendJson(res, 200, { records });
    } else {
      writeHistoryFile(filePath, []);
      sendJson(res, 200, { records: [] });
    }
    return;
  }

  sendJson(res, 405, { error: "Method not allowed" });
}

function getHistoryRecordCategory(record) {
  if (record?.category) return record.category;
  const model = String(record?.model || "");
  const prompt = String(record?.prompt || "");
  if (/换鞋/i.test(model) || prompt.startsWith("换鞋：")) return "shoe";
  if (/扩图|Outpaint|Z-Image/i.test(model) || prompt.startsWith("扩图：")) return "outpaint";
  if (/TTP|SeedVR2|ComfyUI/i.test(model) || prompt.startsWith("高清放大")) return "upscale";
  if (prompt.startsWith("画布") || /画布/.test(prompt)) return "canvas";
  return "image";
}

async function handleCanvasStorageRoute(req, res) {
  const {
    repository,
    queryService,
    commandService,
    streamCanvasExport,
    importCanvasStream,
  } = getCanvasStorage();
  const url = new URL(req.url, "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean);
  const boardId = parts[3] ? decodeURIComponent(parts[3]) : "";
  const action = parts[4] || "";
  try {
    let result;
    let status = 200;
    if (req.method === "POST" && url.pathname === "/api/canvas/import") {
      result = await importCanvasStream({
        repository,
        readable: req,
        boardId: String(url.searchParams.get("boardId") || ""),
      });
      status = 201;
    } else if (req.method === "GET" && !boardId) {
      result = await queryService.listBoards();
    } else if (req.method === "POST" && !boardId) {
      result = await commandService.createBoard(await readJson(req));
      status = 201;
    } else if (req.method === "GET" && action === "meta") {
      result = await queryService.getMeta(boardId);
    } else if (req.method === "GET" && action === "viewport") {
      result = await queryService.queryViewport(boardId, Object.fromEntries(url.searchParams));
    } else if (req.method === "POST" && action === "operations") {
      result = await commandService.apply(boardId, await readJson(req));
    } else if (req.method === "POST" && action === "trash") {
      const body = await readJson(req);
      result = await commandService.trash(boardId, String(body?.operationId || ""));
    } else if (req.method === "POST" && action === "restore") {
      const body = await readJson(req);
      result = await commandService.restore(boardId, String(body?.operationId || ""));
    } else if (req.method === "DELETE" && action === "permanent") {
      result = await commandService.deletePermanently(boardId);
    } else if (req.method === "GET" && action === "export") {
      const metadata = await queryService.getMeta(boardId);
      if (metadata?.httpStatus === 202) {
        sendJson(res, 202, metadata);
        return;
      }
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="canvas-${encodeURIComponent(boardId)}.json"`,
        "Cache-Control": "no-store",
      });
      await streamCanvasExport({ repository, boardId, writable: res });
      return;
    } else if (req.method === "GET" && action === "export-page") {
      result = await queryService.exportPage(boardId, Object.fromEntries(url.searchParams));
    } else {
      sendJson(res, 404, {
        error: "Canvas route not found.",
        code: "canvas_route_not_found",
      });
      return;
    }
    status = Number(result?.httpStatus || status);
    sendJson(res, status, result);
  } catch (error) {
    if (res.headersSent) {
      res.destroy(error);
      return;
    }
    sendJson(res, Number(error?.status || 500), {
      error: String(error?.message || error || "Canvas storage failed."),
      code: String(error?.code || "canvas_storage_error"),
    });
  }
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

function normalizeMidjourneyApiUrl(url) {
  const cleanUrl = String(url || "").trim().replace(/\/+$/, "");
  if (cleanUrl.endsWith("/midjourney/generations")) return cleanUrl;
  if (cleanUrl.endsWith("/v1")) return cleanUrl + "/midjourney/generations";
  return cleanUrl + "/v1/midjourney/generations";
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

function normalizeGrsaiImageApiUrl(url) {
  const cleanUrl = String(url || "").trim().replace(/\/+$/, "");
  if (!cleanUrl) return cleanUrl;
  if (cleanUrl.endsWith("/v1/api/generate")) return cleanUrl;
  if (cleanUrl.endsWith("/v1/api/result")) return cleanUrl.replace(/\/result$/, "/generate");
  if (cleanUrl.endsWith("/v1")) return `${cleanUrl}/api/generate`;
  if (cleanUrl.endsWith("/v1/api")) return `${cleanUrl}/generate`;
  return `${cleanUrl}/v1/api/generate`;
}

function normalizeGrsaiImageResultApiUrl(url) {
  const cleanUrl = String(url || "").trim().replace(/\/+$/, "");
  if (!cleanUrl) return cleanUrl;
  if (cleanUrl.endsWith("/v1/api/result")) return cleanUrl;
  if (cleanUrl.endsWith("/v1/api/generate")) return cleanUrl.replace(/\/generate$/, "/result");
  if (cleanUrl.endsWith("/v1")) return `${cleanUrl}/api/result`;
  if (cleanUrl.endsWith("/v1/api")) return `${cleanUrl}/result`;
  return `${cleanUrl}/v1/api/result`;
}

function normalizeComfyUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return COMFYUI_URL;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  const url = new URL(withProtocol);
  return url.toString().replace(/\/+$/, "");
}

async function requestImageGeneration({ model, prompt, size, resolution, quality, n, signal }) {
  const provider = getImageProvider(model, "generation");
  const upstreamModel = getUpstreamImageModel(model, size);
  const isGpt2Request = isGptImage2RequestModel(model, upstreamModel);
  const requestSize = isGpt2Request
    ? normalizeGptImage2RequestSize(size, resolution)
    : size;
  const body = {
    model: upstreamModel,
    prompt,
    n,
  };

  if (getImageModelPlatform(model) === "google") {
    Object.assign(body, getNanoBananaImageOptions(model, size, resolution));
  } else {
    body.size = requestSize;
    body.quality = normalizeGptImage2Quality(quality, resolution, isGpt2Request);
  }

  const responseFormat = getImageResponseFormat(model, provider, upstreamModel);
  if (responseFormat) {
    body.response_format = responseFormat;
  }

  return fetch(provider.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.key}`,
    },
    body: JSON.stringify(body),
    signal,
  });
}

async function requestImageEdit({ model, prompt, size, resolution, quality, n, refs, signal }) {
  const provider = getImageProvider(model, "edit");
  const upstreamModel = getUpstreamImageModel(model, size);
  const isGpt2Request = isGptImage2RequestModel(model, upstreamModel);
  const requestSize = isGpt2Request
    ? normalizeGptImage2RequestSize(size, resolution)
    : size;
  const form = new FormData();
  form.append("model", upstreamModel);
  form.append("prompt", prompt);
  if (getImageModelPlatform(model) === "google") {
    const options = getNanoBananaImageOptions(model, size, resolution);
    if (options.image_size) form.append("image_size", options.image_size);
    form.append("aspect_ratio", options.aspect_ratio);
  } else {
    form.append("size", requestSize);
    form.append("quality", normalizeGptImage2Quality(quality, resolution, isGpt2Request));
  }
  form.append("n", String(n || 1));
  const responseFormat = getImageResponseFormat(model, provider, upstreamModel);
  if (responseFormat) {
    form.append("response_format", responseFormat);
  }

  const limitedRefs = refs.slice(0, 4);
  const files = await Promise.all(limitedRefs.map((ref, index) => {
    const hasMask = Boolean(ref.maskUrl || ref.openaiMaskUrl);
    const source = hasMask && ref.maskBaseUrl ? ref.maskBaseUrl : ref.url;
    const name = hasMask && ref.maskBaseName ? ref.maskBaseName : (ref.name || `reference_${index + 1}.jpg`);
    return imageReferenceToFile(source, name, { signal });
  }));
  files.forEach((image) => {
    form.append("image", image.blob, image.filename);
  });
  const maskRef = getOpenAIEditMaskRef(limitedRefs);
  if (maskRef && getImageModelPlatform(model) !== "google") {
    const maskSource = maskRef.openaiMaskUrl || maskRef.maskUrl;
    const maskName = maskRef.openaiMaskName || maskRef.maskName || "openai-edit-mask.png";
    const maskFile = await imageReferenceToFile(maskSource, maskName, { signal });
    form.append("mask", maskFile.blob, ensurePngFilename(maskFile.filename || maskName));
  }

  return fetch(provider.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.key}`,
    },
    body: form,
    signal,
  });
}

async function requestApimartImageGeneration({ prompt, size, resolution, n, refs, signal }) {
  if (!APIMART_IMAGE_API_KEY) throw new Error("Server missing APIMART_IMAGE_API_KEY environment variable.");

  const body = {
    model: APIMART_IMAGE_UPSTREAM_MODEL,
    prompt,
    n,
    size: normalizeApimartSize(size),
    resolution: normalizeApimartResolution(resolution, size),
  };
  const imageUrls = await buildApimartImageUrls(refs, { signal });
  if (imageUrls.length) body.image_urls = imageUrls;

  const response = await fetchWithTimeout(APIMART_IMAGE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${APIMART_IMAGE_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal,
  }, 60000);
  const submitted = await parseJsonResponse(response);
  assertApimartOk(response, submitted);

  const taskId = submitted?.data?.[0]?.task_id || submitted?.data?.task_id || submitted?.task_id;
  if (!taskId) throw new Error("Apimart did not return a task_id.");

  const completed = await waitForApimartTask(taskId, APIMART_IMAGE_TASK_API_URL, { signal });
  const urls = extractApimartImageUrls(completed);
  if (!urls.length) throw new Error("Apimart completed, but no output image was found.");

  return {
    data: urls.map((url) => ({ url })),
    provider: "apimart",
    task_id: taskId,
  };
}

async function requestApimartMidjourneyGeneration({ prompt, size, version, niji, speed, style, stylize, hd, n, refs, signal }) {
  if (!APIMART_IMAGE_API_KEY) throw new Error("Server missing APIMART_IMAGE_API_KEY environment variable.");
  const options = normalizeMidjourneyOptions({ version, niji, speed, style, stylize, hd });
  const imageUrls = await buildApimartImageUrls(refs, { signal });
  const runs = Math.max(1, Math.min(4, Number(n || 1)));
  const urls = [];
  const taskIds = [];
  for (let index = 0; index < runs; index += 1) {
    const body = { prompt, size: normalizeMidjourneySize(size), ...options };
    if (imageUrls.length) body.image_urls = imageUrls;
    const response = await fetchWithTimeout(MIDJOURNEY_IMAGE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + APIMART_IMAGE_API_KEY,
      },
      body: JSON.stringify(body),
      signal,
    }, 60000);
    const submitted = await parseJsonResponse(response);
    assertApimartOk(response, submitted);
    const taskId = submitted?.data?.[0]?.task_id || submitted?.data?.task_id || submitted?.task_id;
    if (!taskId) throw new Error("Apimart did not return a Midjourney task_id.");
    taskIds.push(taskId);
    const completed = await waitForApimartTask(taskId, MIDJOURNEY_IMAGE_TASK_API_URL, { signal });
    urls.push(...extractApimartImageUrls(completed));
  }
  if (!urls.length) throw new Error("Apimart Midjourney completed, but no output image was found.");
  return { data: urls.map((url) => ({ url })), provider: "apimart-midjourney", task_id: taskIds.join(",") };
}

function normalizeMidjourneyOptions({ version = "7", niji = false, speed = "fast", style = "raw", stylize = 100, hd = false } = {}) {
  const standardVersions = new Set(["8.2", "8.1", "7", "6.1", "5.2", "5.1"]);
  const nijiVersions = new Set(["7", "6"]);
  const speeds = new Set(["relax", "fast", "turbo"]);
  const styles = new Set(["raw", "standard"]);
  if (typeof niji !== "boolean" && niji !== undefined) throw new Error("Midjourney niji must be boolean.");
  if (typeof hd !== "boolean" && hd !== undefined) throw new Error("Midjourney hd must be boolean.");
  const normalizedNiji = Boolean(niji);
  const normalizedVersion = String(version || "7");
  const normalizedSpeed = String(speed || "fast").toLowerCase();
  const normalizedStyle = String(style || "raw").toLowerCase();
  const normalizedStylize = Number(stylize ?? 100);
  const normalizedHd = Boolean(hd);
  const versions = normalizedNiji ? nijiVersions : standardVersions;
  if (!versions.has(normalizedVersion)) throw new Error("Unsupported Midjourney version for the selected mode: " + normalizedVersion);
  if (normalizedHd && (normalizedNiji || !["8.2", "8.1"].includes(normalizedVersion))) throw new Error("Midjourney HD is only supported for V8.1 and V8.2 in standard mode.");
  if (!speeds.has(normalizedSpeed)) throw new Error("Unsupported Midjourney speed: " + normalizedSpeed);
  if (!styles.has(normalizedStyle)) throw new Error("Unsupported Midjourney style: " + normalizedStyle);
  if (!Number.isInteger(normalizedStylize) || normalizedStylize < 0 || normalizedStylize > 1000) throw new Error("Midjourney stylize must be an integer from 0 to 1000.");
  const normalized = {
    version: normalizedVersion,
    niji: normalizedNiji,
    speed: normalizedSpeed,
    style: normalizedStyle,
    stylize: normalizedStylize,
  };
  if (normalizedHd) normalized.hd = true;
  return normalized;
}
function normalizeMidjourneySize(size) {
  const value = String(size || "1:1").trim().toLowerCase();
  if (/^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(value)) return value;
  const normalized = normalizeApimartSize(value);
  return normalized === "auto" ? "1:1" : normalized;
}
async function requestGrsaiImageGeneration({ model, prompt, size, resolution, n, refs, signal }) {
  if (!GRSAI_IMAGE_API_KEY) throw new Error("Server missing GRSAI_IMAGE_API_KEY environment variable.");

  const runs = Math.max(1, Math.min(4, Number(n || 1)));
  const results = [];
  const taskIds = [];
  for (let index = 0; index < runs; index += 1) {
    const data = await runGrsaiImageAttemptWithRetry({ model, prompt, size, resolution, refs, signal });
    const directUrls = extractGrsaiImageUrls(data);
    if (directUrls.length) {
      results.push(...directUrls);
      const taskId = data?.task_id || data?.data?.id || data?.id || data?.taskId;
      if (taskId) taskIds.push(taskId);
      continue;
    }
  }

  if (!results.length) throw new Error("GrsAI completed, but no output image was found.");
  return {
    data: results.map((url) => ({ url })),
    provider: "grsai",
    task_id: taskIds.join(","),
  };
}

async function runGrsaiImageAttemptWithRetry(options) {
  try {
    const data = await submitGrsaiImageTask(options);
    const directUrls = extractGrsaiImageUrls(data);
    if (directUrls.length) return data;
    const taskId = data?.data?.id || data?.id || data?.task_id || data?.taskId;
    if (!taskId) return data;
    const completed = await waitForGrsaiTask(taskId, { signal: options.signal });
    return { ...completed, task_id: taskId };
  } catch (error) {
    // A timed-out submission may already have been accepted upstream. Retrying here can duplicate charges.
    throw normalizeGrsaiError(error, options.model, options.size);
  }
}

async function submitGrsaiImageTask({ model, prompt, size, resolution, refs, signal }) {
  const body = {
    model: getGrsaiUpstreamImageModel(model),
    prompt,
    replyType: "json",
  };
  Object.assign(body, getGrsaiImageParams(model, size, resolution));

  const images = await buildApimartImageUrls(refs, { signal });
  if (images.length) body.images = images;

  const response = await fetchWithTimeout(GRSAI_IMAGE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GRSAI_IMAGE_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal,
  }, GRSAI_IMAGE_FETCH_TIMEOUT_MS);
  const data = await parseJsonResponse(response);
  assertGrsaiOk(response, data);
  return data;
}

async function waitForGrsaiTask(taskId, options = {}) {
  const maxPolls = 150;
  for (let index = 0; index < maxPolls; index += 1) {
    if (index > 0) await waitForAbortableDelay(4000, options.signal);
    const response = await fetchWithTimeout(`${GRSAI_IMAGE_RESULT_API_URL}?id=${encodeURIComponent(taskId)}`, {
      headers: {
        Authorization: `Bearer ${GRSAI_IMAGE_API_KEY}`,
      },
      signal: options.signal,
    }, GRSAI_IMAGE_FETCH_TIMEOUT_MS);
    const data = await parseJsonResponse(response);
    assertGrsaiOk(response, data);

    const status = String(data?.data?.status || data?.status || "").toLowerCase();
    if (["success", "succeeded", "completed", "complete", "finish", "finished", "done"].includes(status)) return data;
    if (["failed", "fail", "error", "cancelled", "canceled"].includes(status)) {
      throw new Error(data?.data?.error || data?.data?.message || data?.message || "GrsAI task failed.");
    }
    if (!status && extractGrsaiImageUrls(data).length) return data;
  }
  throw new Error("GrsAI task timed out.");
}

function extractGrsaiImageUrls(data) {
  const urls = [];
  collectGrsaiImageUrls(data?.data?.results, urls);
  collectGrsaiImageUrls(data?.data?.result, urls);
  collectGrsaiImageUrls(data?.data?.url, urls);
  collectGrsaiImageUrls(data?.results, urls);
  collectGrsaiImageUrls(data?.result, urls);
  collectGrsaiImageUrls(data?.output, urls);
  collectGrsaiImageUrls(data, urls);
  return [...new Set(urls.filter(Boolean))];
}

function collectGrsaiImageUrls(value, urls) {
  if (!value) return;
  if (typeof value === "string") {
    if (/^https?:\/\/\S+\.(png|jpe?g|webp|gif)(\?\S*)?$/i.test(value) || value.startsWith("data:image/")) urls.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectGrsaiImageUrls(item, urls));
    return;
  }
  if (typeof value !== "object") return;
  pushGrsaiUrl(value.url || value.imageUrl || value.imageURL || value.fileUrl || value.fileURL || value.outputUrl, urls);
  for (const item of Object.values(value)) collectGrsaiImageUrls(item, urls);
}

function pushGrsaiUrl(value, urls) {
  const url = String(value || "");
  if (url.startsWith("data:image/") || /^https?:\/\//i.test(url)) urls.push(url);
}

async function waitForApimartTask(taskId, taskApiUrl = APIMART_IMAGE_TASK_API_URL, options = {}) {
  const maxPolls = 150;
  for (let index = 0; index < maxPolls; index += 1) {
    if (index > 0) await waitForAbortableDelay(4000, options.signal);
    const response = await fetchWithTimeout(taskApiUrl + "/" + encodeURIComponent(taskId), {
      headers: {
        Authorization: `Bearer ${APIMART_IMAGE_API_KEY}`,
      },
      signal: options.signal,
    }, 60000);
    const data = await parseJsonResponse(response);
    assertApimartOk(response, data);

    const status = String(data?.data?.status || data?.status || "").toLowerCase();
    if (status === "completed" || status === "succeeded" || status === "success") return data;
    if (status === "failed" || status === "error" || status === "cancelled") {
      const message = data?.data?.error?.message || data?.error?.message || data?.message || "Apimart task failed.";
      throw new Error(message);
    }
  }
  throw new Error("Apimart task timed out.");
}

function extractApimartImageUrls(data) {
  const urls = [];
  const collect = (value) => {
    if (!value) return;
    if (typeof value === "string") {
      if (value.startsWith("data:image/") || /^https?:\/\//i.test(value)) urls.push(value);
      return;
    }
    if (Array.isArray(value)) { value.forEach(collect); return; }
    if (typeof value !== "object") return;
    ["url", "image_url", "imageUrl", "imageURL", "fileUrl", "fileURL", "outputUrl"].forEach((key) => collect(value[key]));
    ["images", "result", "output", "outputs", "data"].forEach((key) => collect(value[key]));
  };
  collect(data);
  return [...new Set(urls)];
}

async function buildApimartImageUrls(refs, options = {}) {
  const result = [];
  for (const ref of refs.slice(0, 16)) {
    const source = String(ref.url || "");
    if (!source) continue;
    if (/^https?:\/\//i.test(source)) {
      result.push(source);
      continue;
    }
    const file = await imageReferenceToFile(source, ref.name || "reference.png", options);
    const bytes = Buffer.from(await file.blob.arrayBuffer());
    const mimeType = file.blob.type || "image/png";
    result.push(`data:${mimeType};base64,${bytes.toString("base64")}`);
  }
  return result;
}

function normalizeApimartSize(size) {
  const value = String(size || "").trim().toLowerCase();
  const ratios = new Set(["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "3:1", "1:3", "21:9", "9:21"]);
  if (ratios.has(value)) return value;
  const pixels = value.match(/^(\d{2,5})x(\d{2,5})$/);
  if (!pixels) return "1:1";
  const width = Number(pixels[1]);
  const height = Number(pixels[2]);
  return closestAspectRatio(width, height);
}

function closestAspectRatio(width, height) {
  const candidates = ["1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "3:1", "1:3", "21:9", "9:21"];
  const ratio = width / height;
  let best = "1:1";
  let bestDiff = Infinity;
  for (const candidate of candidates) {
    const [w, h] = candidate.split(":").map(Number);
    const diff = Math.abs(ratio - (w / h));
    if (diff < bestDiff) {
      best = candidate;
      bestDiff = diff;
    }
  }
  return best;
}

function normalizeApimartResolution(resolution, size) {
  const text = `${resolution || ""} ${size || ""}`.toLowerCase();
  if (text.includes("4k")) return "4k";
  if (text.includes("2k")) return "2k";
  const edges = text.match(/\d{3,5}/g)?.map(Number) || [];
  const longEdge = edges.length ? Math.max(...edges) : 0;
  if (longEdge >= 3000) return "4k";
  if (longEdge >= 1800) return "2k";
  return "1k";
}

async function parseJsonResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw new Error(text || `${response.status} ${response.statusText}`);
  }
}

function assertApimartOk(response, data) {
  const code = Number(data?.code || 0);
  if (response.ok && (!code || code === 200)) return;
  const message = data?.error?.message || data?.data?.error?.message || data?.message || `${response.status} ${response.statusText}`;
  throw new Error(message);
}

function assertGrsaiOk(response, data) {
  const code = Number(data?.code || data?.statusCode || 0);
  const success = data?.success;
  if (response.ok && (success === true || !code || code === 200 || code === 0)) return;
  const message = data?.error?.message || data?.error || data?.data?.error || data?.data?.message || data?.message || `${response.status} ${response.statusText}`;
  throw new Error(String(message));
}

function isGrsaiTransientError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("high load")
    || message.includes("use another model")
    || message.includes("too many requests")
    || message.includes("rate limit")
    || message.includes("429")
    || message.includes("503");
}
function normalizeGrsaiError(error, model, size) {
  const message = String(error?.message || error || "");
  const diagnostic = `${error?.name || ""} ${message}`;
  if (/abort|aborted|aborterror|timeout|timed out/i.test(diagnostic)) {
    return new Error(`GrsAI 请求超时或上游响应过慢，结果暂时无法确认；为避免重复扣费，系统没有自动重新提交。任务记录会继续保留。`);
  }
  if (/high load|use another model/i.test(message)) {
    return new Error(`GrsAI 当前模型负载较高。本次没有自动重复提交；后续任务可改用 ${getModelDisplayNameForError(model)} 的其他健康接口。`);
  }
  if (/invalid|unsupported|resolution|size|aspect|imageSize/i.test(message)) {
    return new Error(`GrsAI 参数不支持：${message}。当前提交尺寸为 ${size || "auto"}，请换该模型支持的分辨率。`);
  }
  return new Error(message || "GrsAI request failed.");
}

function getModelDisplayNameForError(model) {
  const value = String(model || "");
  const names = {
    "gpt-image-2-vip-grsai": "gpt-image-2-vip · grsai",
    "gpt-image-2-grsai": "gpt-image-2 · grsai",
    "nano-banana-pro-grsai": "nano-banana-pro · grsai",
    "nano-banana-2-grsai": "nano-banana-2 · grsai",
  };
  return names[value.toLowerCase()] || value || "当前模型";
}

function isGptImage2RequestModel(model, upstreamModel = "") {
  return isGptImage2LikeModel(model)
    || isGptImage2LikeModel(upstreamModel)
    || getImageModelFamily(model) === "gpt-image-2";
}

function getImageResponseFormat(model, provider = null, upstreamModel = "") {
  if (provider?.custom && !isOfficialOpenAIUrl(provider.url || provider.baseUrl)) return "";
  return isGptImage2RequestModel(model, upstreamModel) ? "b64_json" : "url";
}

function getImageProvider(model, mode) {
  const customModel = resolveCustomModel(model, mode === "edit" ? "edit" : "generation");
  if (customModel) {
    if (!customModel.provider.apiKey) throw new Error(`API 接入“${customModel.provider.name}”缺少 API Key。`);
    return {
      url: mode === "edit" ? normalizeImageEditApiUrl(customModel.provider.baseUrl) : normalizeImageApiUrl(customModel.provider.baseUrl),
      key: customModel.provider.apiKey,
      custom: true,
      providerName: customModel.provider.name,
      baseUrl: customModel.provider.baseUrl,
    };
  }
  if (isAinbImageModel(model)) {
    if (!AINB_IMAGE_API_KEY) throw new Error("后端缺少 AINB_IMAGE_API_KEY，请先在 .env 里配置。");
    return {
      url: mode === "edit" ? AINB_IMAGE_EDIT_API_URL : AINB_IMAGE_API_URL,
      key: AINB_IMAGE_API_KEY,
      providerName: "AINB",
      baseUrl: AINB_IMAGE_API_URL,
    };
  }
  if (isClseImageModel(model)) {
    if (!CLSE_IMAGE_API_KEY) throw new Error("Server missing CLSE_IMAGE_API_KEY environment variable.");
    return {
      url: mode === "edit" ? CLSE_IMAGE_EDIT_API_URL : CLSE_IMAGE_API_URL,
      key: CLSE_IMAGE_API_KEY,
      providerName: "CLSE",
      baseUrl: CLSE_IMAGE_API_URL,
    };
  }
  if (!API_KEY) throw new Error("Server missing AI_API_KEY environment variable.");
  return {
    url: mode === "edit" ? IMAGE_EDIT_API_URL : IMAGE_API_URL,
    key: API_KEY,
    providerName: "OpenAI",
    baseUrl: IMAGE_API_URL,
  };
}

function isAinbImageModel(model) {
  return String(model || "").toLowerCase() === AINB_IMAGE_MODEL_ALIAS.toLowerCase();
}

function isClseImageModel(model) {
  return String(model || "").toLowerCase() === CLSE_IMAGE_MODEL_ALIAS.toLowerCase();
}

function isApimartImageModel(model) {
  return String(model || "").toLowerCase() === APIMART_IMAGE_MODEL_ALIAS.toLowerCase();
}

function isMidjourneyImageModel(model) {
  return String(model || "").toLowerCase() === MIDJOURNEY_IMAGE_MODEL_ALIAS;
}

function isGrsaiImageModel(model) {
  const value = String(model || "").toLowerCase();
  return GRSAI_IMAGE_MODELS.map((item) => item.toLowerCase()).includes(value);
}

function isGptImage2LikeModel(model) {
  const value = String(model || "").toLowerCase();
  return value.includes("gpt-image-2");
}

function getUpstreamImageModel(model, size = "") {
  if (isAinbImageModel(model) || isApimartImageModel(model)) return "gpt-image-2";
  if (isClseImageModel(model)) return CLSE_IMAGE_UPSTREAM_MODEL;
  if (isGrsaiImageModel(model)) return getGrsaiUpstreamImageModel(model);
  const customModel = resolveCustomModel(model, "generation") || resolveCustomModel(model, "edit");
  if (customModel) return customModel.model.id;
  return model;
}

function getGrsaiUpstreamImageModel(model) {
  const value = String(model || "").toLowerCase();
  const aliases = {
    "gpt-image-2-vip-grsai": "gpt-image-2-vip",
    "gpt-image-2-grsai": "gpt-image-2",
    "nano-banana-pro-grsai": "nano-banana-pro",
    "nano-banana-2-grsai": "nano-banana-2",
  };
  return aliases[value] || String(model || "").replace(/-grsai$/i, "");
}

function getGrsaiImageParams(model, size, resolution = "") {
  const upstream = getGrsaiUpstreamImageModel(model).toLowerCase();
  if (upstream.startsWith("nano-banana")) {
    return {
      aspectRatio: normalizeApimartSize(size),
      imageSize: getNanoBananaImageSize(size, resolution),
    };
  }

  return {
    aspectRatio: normalizeGptImage2RequestSize(String(size || "").toLowerCase() === "auto" ? "1:1" : size, resolution || "4k"),
  };
}

function normalizeGptImage2Quality(quality, resolution, isGpt2Request = false) {
  if (!isGpt2Request) return quality || "auto";
  const requested = String(quality || "").trim().toLowerCase();
  if (["low", "medium", "high"].includes(requested)) return requested;
  const rank = getImageResolutionRank(resolution);
  if (rank >= 4) return "high";
  if (rank >= 2) return "medium";
  return "auto";
}

function normalizeGptImage2RequestSize(size, resolution = "1k") {
  const text = String(size || "auto").trim().toLowerCase();
  if (!text || text === "auto") return "auto";
  const pixels = text.match(/^(\d{2,5})x(\d{2,5})$/);
  if (pixels) return Number(pixels[1]) + "x" + Number(pixels[2]);
  const ratio = parseAspectRatio(text);
  if (!ratio) return "";
  return getGptImage2SizeByRatio(ratio, resolution);
}

function shouldSendGptImage2CompatHints(provider) {
  return false;
}

function isOfficialOpenAIUrl(url = "") {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "api.openai.com" || host.endsWith(".openai.com");
  } catch {
    return false;
  }
}

function getGptImage2CompatHints(size, resolution, requestSize) {
  const aspectRatio = normalizeGptImage2AspectRatio(size) || normalizeGptImage2AspectRatio(requestSize) || "1:1";
  const imageSize = normalizeGptImage2ResolutionLabel(resolution, requestSize);
  return {
    aspect_ratio: aspectRatio,
    resolution: imageSize.toLowerCase(),
    image_size: imageSize,
  };
}

function normalizeGptImage2AspectRatio(size) {
  const text = String(size || "").trim().toLowerCase();
  const ratio = parseAspectRatio(text);
  if (ratio) return ratio.width + ":" + ratio.height;
  const pixels = text.match(/^(\d{2,5})x(\d{2,5})$/);
  if (!pixels) return "";
  const width = Number(pixels[1]);
  const height = Number(pixels[2]);
  const divisor = gcd(width, height);
  return (width / divisor) + ":" + (height / divisor);
}

function normalizeGptImage2ResolutionLabel(resolution, requestSize) {
  const level = getImageResolutionRank(resolution);
  if (level >= 4) return "4K";
  if (level >= 2) return "2K";
  const pixels = String(requestSize || "").match(/(\d{2,5})x(\d{2,5})/);
  if (pixels) {
    const longEdge = Math.max(Number(pixels[1]), Number(pixels[2]));
    if (longEdge >= 3000) return "4K";
    if (longEdge >= 1800) return "2K";
  }
  return "1K";
}

function gcd(a, b) {
  let x = Math.abs(Math.round(Number(a) || 0));
  let y = Math.abs(Math.round(Number(b) || 0));
  while (y) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

function parseAspectRatio(value) {
  const match = String(value || "").trim().toLowerCase().match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height) return null;
  return { width, height };
}

function getGptImage2SizeByRatio(ratio, resolution = "1k") {
  const dimensions = getGptImage2DimensionsByRatio(ratio, resolution);
  return isValidGptImage2Dimensions(dimensions) ? dimensions.width + "x" + dimensions.height : "";
}

function getGptImage2DimensionsByRatio(ratio, resolution = "1k") {
  const compatibility = ImageResolutionRules.getCompatibility({
    platform: "openai",
    ratio: `${ratio?.width || 0}:${ratio?.height || 0}`,
    resolution,
    configuredResolutions: ["1", "2", "4"],
  });
  const pixels = String(compatibility.requestedSize || "").match(/^(\d+)x(\d+)$/);
  return pixels ? { width: Number(pixels[1]), height: Number(pixels[2]) } : null;
}

function isValidGptImage2Dimensions(dimensions) {
  if (!dimensions) return false;
  return ImageResolutionRules.validateOpenAiDimensions(dimensions.width, dimensions.height).supported;
}

function roundImageEdge(value) {
  return Math.max(16, Math.floor(Number(value || 0) / 16) * 16);
}

function getImageResolutionRank(value) {
  const normalized = String(value || "1").toLowerCase().replace(/px$/, "").replace(/k$/, "");
  if (normalized === "0.5" || normalized === "512") return 0.5;
  if (normalized === "4") return 4;
  if (normalized === "2") return 2;
  return 1;
}

function getOpenAIEditMaskRef(refs) {
  return (Array.isArray(refs) ? refs : []).find((ref) => ref && (ref.openaiMaskUrl || ref.maskUrl));
}

function ensurePngFilename(filename) {
  const value = String(filename || "openai-edit-mask.png");
  return /\.png$/i.test(value) ? value : value.replace(/\.[^.]+$/, "") + ".png";
}

function normalizeGrsaiGptImageSize(size, maxLongEdge) {
  const text = String(size || "").trim().toLowerCase();
  const pixels = text.match(/^(\d{2,5})x(\d{2,5})$/);
  if (pixels) {
    const width = Math.max(1, Number(pixels[1]));
    const height = Math.max(1, Number(pixels[2]));
    const scale = Math.min(1, maxLongEdge / Math.max(width, height));
    return `${Math.max(1, Math.round(width * scale))}x${Math.max(1, Math.round(height * scale))}`;
  }

  const ratio = normalizeApimartSize(size);
  const [w = 1, h = 1] = String(ratio === "auto" ? "1:1" : ratio).split(":").map(Number);
  const factor = maxLongEdge / Math.max(w || 1, h || 1);
  return `${Math.max(1, Math.round((w || 1) * factor))}x${Math.max(1, Math.round((h || 1) * factor))}`;
}

function getImageResponseModel(requestedModel, upstreamModel) {
  if (isAinbImageModel(requestedModel)) return AINB_IMAGE_MODEL_ALIAS;
  if (isClseImageModel(requestedModel)) return CLSE_IMAGE_MODEL_ALIAS;
  if (isApimartImageModel(requestedModel)) return APIMART_IMAGE_MODEL_ALIAS;
  if (isGrsaiImageModel(requestedModel)) return requestedModel;
  if (resolveCustomModel(requestedModel, "generation") || resolveCustomModel(requestedModel, "edit")) return requestedModel;
  return upstreamModel || requestedModel;
}

function isNanoBananaProModel(model) {
  return String(model || "").toLowerCase() === "nano-banana-pro";
}

function getNanoBananaImageSize(size, resolution = "", model = "") {
  if (!supportsNanoBananaImageSize(model)) return "";
  const text = `${resolution || ""} ${size || ""}`.toLowerCase();
  if (text.includes("512")) return "512";
  if (text.includes("4k")) return "4K";
  if (text.includes("2k")) return "2K";
  const edges = text.split("x").map((item) => Number.parseInt(item, 10)).filter(Boolean);
  const longEdge = edges.length ? Math.max(...edges) : 0;
  if (longEdge >= 3000) return "4K";
  if (longEdge >= 1800) return "2K";
  return "1K";
}

function supportsNanoBananaImageSize(model) {
  return getImageModelFamily(model) !== "gemini-2.5-flash-image";
}

function getNanoBananaImageOptions(model, size, resolution) {
  const options = {
    aspect_ratio: normalizeImageAspectRatio(size),
  };
  const imageSize = getNanoBananaImageSize(size, resolution, model);
  if (imageSize) options.image_size = imageSize;
  return options;
}

function normalizeImageAspectRatio(size) {
  return normalizeApimartSize(size);
}

function shouldUseGeminiNativeImageApi(customModel) {
  if (!customModel) return false;
  const platform = normalizeImagePlatform(customModel.model.platform, customModel.model.id);
  if (platform !== "google") return false;
  return isGeminiNativeImageProvider(customModel.provider.baseUrl);
}

function isGeminiNativeImageProvider(baseUrl) {
  const value = String(baseUrl || "");
  try {
    const host = new URL(normalizeGeminiNativeBaseUrl(value)).hostname.toLowerCase();
    return host === "uuapi.net" || host.endsWith(".uuapi.net") || host === "generativelanguage.googleapis.com" || host.endsWith(".generativelanguage.googleapis.com");
  } catch {
    return /(^|\.)uuapi\.net\b|generativelanguage\.googleapis\.com/i.test(value);
  }
}

function normalizeGeminiNativeBaseUrl(url) {
  return normalizeProviderBaseUrl(url)
    .replace(/\/v1$/i, "")
    .replace(/\/v1beta$/i, "")
    .replace(/\/v1beta\/models\/[^/]+:generateContent$/i, "");
}

async function requestGeminiNativeImageGeneration({ model, prompt, size, resolution, n, refs, signal }) {
  const capability = refs.length ? "edit" : "generation";
  const customModel = resolveCustomModel(model, capability) || resolveCustomModel(model, "generation") || resolveCustomModel(model, "edit");
  if (!customModel) throw new Error("Custom Gemini image model was not found.");
  if (!customModel.provider.apiKey) throw new Error(`Custom provider "${customModel.provider.name}" is missing API Key.`);

  const upstreamModel = getUpstreamImageModel(model, size);
  const baseUrl = normalizeGeminiNativeBaseUrl(customModel.provider.baseUrl);
  const url = `${baseUrl}/v1beta/models/${encodeURIComponent(upstreamModel)}:generateContent`;
  const parts = await buildGeminiNativeImageParts({ model, prompt, size, resolution, refs, signal });
  const body = {
    contents: [
      {
        role: "user",
        parts,
      },
    ],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
    },
  };

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${customModel.provider.apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  }, 240000);
  const text = await response.text();
  const contentType = response.headers.get("content-type") || "application/json; charset=utf-8";
  let data = {};
  if (contentType.includes("json") || /^[\[{]/.test(text.trim())) {
    try {
      data = JSON.parse(text || "{}");
    } catch {
      data = {};
    }
  }
  if (!response.ok) {
    throw new Error(extractUpstreamErrorMessage(text, contentType) || `${response.status} ${response.statusText}`);
  }
  if (!Object.keys(data).length && text.trim()) data = { text };
  normalizeChatImageResponse(data);
  data.model = data.model || upstreamModel;
  return data;
}

async function buildGeminiNativeImageParts({ model, prompt, size, resolution, refs, signal }) {
  const imageSize = getNanoBananaImageSize(size, resolution, model);
  const imageSizeHint = imageSize ? ` Target image_size: ${imageSize}.` : "";
  const text = `${prompt || "Generate an image."}\n\nTarget aspect ratio: ${normalizeImageAspectRatio(size)}.${imageSizeHint} Return the generated image directly.`;
  const parts = [{ text }];
  for (const ref of refs.slice(0, 4)) {
    parts.push(await imageReferenceToGeminiInlinePart(ref, { signal }));
  }
  return parts;
}

async function imageReferenceToGeminiInlinePart(ref, options = {}) {
  const file = await imageReferenceToFile(ref.url, ref.name || "reference.png", options);
  const bytes = Buffer.from(await file.blob.arrayBuffer());
  const mimeType = file.blob.type || "image/png";
  return {
    inline_data: {
      mime_type: mimeType,
      data: bytes.toString("base64"),
    },
  };
}
async function requestImageChat({ model, prompt, size, resolution, n, refs, signal }) {
  const customModel = resolveCustomModel(model, "generation") || resolveCustomModel(model, "edit");
  const upstreamModel = getUpstreamImageModel(model, size);
  let provider = {
    url: IMAGE_CHAT_API_URL,
    key: IMAGE_CHAT_API_KEY,
  };
  if (customModel) {
    if (!customModel.provider.apiKey) throw new Error(`Custom provider "${customModel.provider.name}" is missing API Key.`);
    provider = {
      url: normalizeApiUrl(customModel.provider.baseUrl),
      key: customModel.provider.apiKey,
    };
  }

  const userContent = buildGeminiImageChatContent({ model, prompt, size, resolution, refs });
  const body = {
    model: upstreamModel,
    messages: [
      {
        role: "user",
        content: userContent,
      },
    ],
    n,
  };

  if (getImageModelPlatform(model) === "google") {
    Object.assign(body, getNanoBananaImageOptions(model, size, resolution));
    body.modalities = ["text", "image"];
  }

  return fetch(provider.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.key}`,
    },
    body: JSON.stringify(body),
    signal,
  });
}

function buildGeminiImageChatContent({ model, prompt, size, resolution, refs }) {
  const imageSize = getNanoBananaImageSize(size, resolution, model);
  const imageSizeHint = imageSize ? ` Target image_size: ${imageSize}.` : "";
  const text = `${prompt || "Generate an image."}\n\nTarget aspect ratio: ${normalizeImageAspectRatio(size)}.${imageSizeHint} Return the generated image directly.`;
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
  const customModel = resolveCustomModel(model, "generation") || resolveCustomModel(model, "edit");
  const name = String(customModel?.model?.id || model || "").toLowerCase();
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

async function uploadFileToRunningHub(blob, filename) {
  const form = new FormData();
  form.append("file", blob, filename || "image.png");

  const response = await fetchWithTimeout(`${RUNNINGHUB_BASE_URL}/openapi/v2/media/upload/binary`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RUNNINGHUB_API_KEY}`,
    },
    body: form,
  }, 120000);
  const data = await response.json().catch(() => ({}));
  assertRunningHubOk(response, data, "RunningHub upload failed");

  const fileName = data?.data?.fileName || data?.data?.filename || data?.data?.name || data?.fileName || data?.filename;
  if (!fileName) throw new Error("RunningHub upload did not return fileName.");
  return { fileName, raw: data };
}

async function checkRunningHubAccountStatus() {
  return postRunningHubJson("/uc/openapi/accountStatus", {
    apikey: RUNNINGHUB_API_KEY,
  }, 30000);
}

async function createRunningHubTask(nodeInfoList) {
  const response = await postRunningHubJson("/task/openapi/create", {
    apiKey: RUNNINGHUB_API_KEY,
    apikey: RUNNINGHUB_API_KEY,
    workflowId: RUNNINGHUB_OUTPAINT_WORKFLOW_ID,
    nodeInfoList,
  }, 60000);
  const taskId = response?.data?.taskId || response?.data?.id || response?.taskId || response?.id || (typeof response?.data === "string" ? response.data : "");
  if (!taskId) throw new Error("RunningHub create task did not return taskId.");
  return String(taskId);
}

async function waitForRunningHubOutputs(taskId, onStatus = () => {}) {
  const maxPolls = 900;
  for (let index = 0; index < maxPolls; index += 1) {
    const statusData = await postRunningHubJson("/task/openapi/status", {
      apiKey: RUNNINGHUB_API_KEY,
      apikey: RUNNINGHUB_API_KEY,
      taskId,
    }, 30000);

    const statusText = String(
      statusData?.data?.taskStatus ||
      statusData?.data?.status ||
      statusData?.data?.state ||
      statusData?.taskStatus ||
      statusData?.status ||
      statusData?.data ||
      ""
    ).toUpperCase();
    if (/FAIL|ERROR|CANCEL/.test(statusText)) {
      throw new Error(formatErrorMessage(statusData?.msg || statusData?.message || `RunningHub task failed: ${statusText}`));
    }

    if (/SUCCESS|FINISH|COMPLETED|COMPLETE/.test(statusText)) {
      return await fetchRunningHubOutputs(taskId);
    }

    const progress = Math.min(92, 35 + Math.round((index / maxPolls) * 55));
    onStatus({ progress, message: "RunningHub 正在扩图，可能需要几分钟..." });
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("RunningHub task timed out after 30 minutes.");
}

async function fetchRunningHubOutputs(taskId) {
  const candidates = [
    "/task/openapi/outputs",
    "/task/openapi/output",
  ];
  let lastError = null;
  for (const endpoint of candidates) {
    try {
      return await postRunningHubJson(endpoint, {
        apiKey: RUNNINGHUB_API_KEY,
        apikey: RUNNINGHUB_API_KEY,
        taskId,
      }, 60000);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("RunningHub outputs request failed.");
}

async function postRunningHubJson(endpoint, body, timeoutMs = 60000) {
  const response = await fetchWithTimeout(`${RUNNINGHUB_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RUNNINGHUB_API_KEY}`,
    },
    body: JSON.stringify(body),
  }, timeoutMs);
  const data = await response.json().catch(() => ({}));
  assertRunningHubOk(response, data, `RunningHub API failed: ${endpoint}`);
  return data;
}

function assertRunningHubOk(response, data, fallback) {
  const code = data?.code;
  const okCode = code === undefined || code === 0 || code === "0" || code === 200 || code === "200";
  if (!response.ok || !okCode) {
    const codeText = String(code || "");
    const rawMessage = data?.msg || data?.message || data?.error || `${fallback}: ${response.status}`;
    const message = String(rawMessage || "");
    if (/TOKEN_INVALID|invalid token|api.?key/i.test(`${codeText} ${message}`)) {
      throw new Error("RunningHub API Key 无效或不是当前站点的 OpenAPI Key，请在 RunningHub 后台重新生成/复制 OpenAPI Key 后更新 .env。");
    }
    throw new Error(formatErrorMessage(message));
  }
}

async function submitComfyPrompt(comfyUrl, workflow) {
  const { response, data } = await fetchJsonResponseWithTimeout(`${comfyUrl}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow, client_id: crypto.randomUUID() }),
  }, COMFY_PROMPT_TIMEOUT_MS);
  if (!response.ok) throw new Error(formatErrorMessage(data.error || data.message || `ComfyUI prompt failed: ${response.status}`));
  if (!data.prompt_id) throw new Error("ComfyUI did not return prompt_id.");
  return data.prompt_id;
}

async function waitForComfyHistory(comfyUrl, promptId, onStatus = () => {}) {
  const maxPolls = 900;
  for (let index = 0; index < maxPolls; index += 1) {
    const { response, data } = await fetchJsonResponseWithTimeout(`${comfyUrl}/history/${encodeURIComponent(promptId)}`, {}, COMFY_POLL_TIMEOUT_MS);
    if (response.ok) {
      const history = data[promptId];
      if (history) {
        const inspection = inspectComfyHistory(history);
        if (inspection.state === "error") throw new Error(inspection.message);
        if (inspection.state === "success") return history;
      }
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
    const { response, data } = await fetchJsonResponseWithTimeout(`${comfyUrl}/queue`, {}, COMFY_POLL_TIMEOUT_MS);
    if (!response.ok) return {};
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

function chooseTtpUpscaleModel(currentModel, requestedResolution) {
  if (Number(requestedResolution) <= 2048) return "RealESRGAN_x2plus.pth";
  return "4xNomos8kSCHAT-L.safetensors";
}

function ensureTtpFinalResizeNode(workflow, finalLongEdge) {
  if (!workflow["32"]?.inputs || !workflow["33"]?.inputs || !finalLongEdge) return;
  workflow["34"] = {
    inputs: {
      aspect_ratio: "original",
      proportional_width: 1,
      proportional_height: 1,
      fit: "letterbox",
      method: "lanczos",
      round_to_multiple: "8",
      scale_to_side: "longest",
      scale_to_length: Math.max(64, Math.round(finalLongEdge)),
      background_color: "#000000",
      image: ["33", 0],
    },
    class_type: "LayerUtility: ImageScaleByAspectRatio V2",
    _meta: {
      title: "最终按长边收口",
    },
  };
  workflow["32"].inputs.images = ["34", 0];
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

function getImageReferenceDimensions(source) {
  const dataUrlDimensions = getDataUrlImageDimensions(source);
  if (dataUrlDimensions) return dataUrlDimensions;

  try {
    const filePath = resolveLocalImageReference(source);
    if (!filePath) return null;
    const buffer = fs.readFileSync(filePath);
    const extension = extensionFromFilePath(filePath);
    if (extension === "png") return getPngDimensions(buffer);
    if (extension === "jpg" || extension === "jpeg") return getJpegDimensions(buffer);
    if (extension === "webp") return getWebpDimensions(buffer);
  } catch {}

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

async function saveComfyHistoryImages(comfyUrl, history, prefix, preferredOutputIds = [], options = {}) {
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

  let candidates;
  if (preferredOutputIds.length && options.strictPreferred) {
    candidates = preferredImages;
    if (!candidates.length && options.filenamePrefix) {
      const allImages = [...outputImages, ...fallbackImages];
      candidates = allImages.filter((image) => String(image.filename || "").startsWith(options.filenamePrefix));
    }
  } else {
    candidates = preferredImages.length ? preferredImages : outputImages.length ? outputImages : fallbackImages;
  }
  if (options.filenamePrefix && !preferredOutputIds.length) {
    candidates = candidates.filter((image) => String(image.filename || "").startsWith(options.filenamePrefix));
  }
  if (options.lastOnly && candidates.length > 1) candidates = candidates.slice(-1);

  const urls = [];
  for (const image of candidates) {
    const saved = await saveComfyImage(comfyUrl, image, prefix);
    if (saved && !urls.includes(saved)) urls.push(saved);
  }

  return urls;
}

async function saveComfyHistoryVideos(comfyUrl, history, prefix, preferredOutputIds = []) {
  const candidates = collectComfyVideoOutputs(history, preferredOutputIds);
  const urls = [];
  for (const video of candidates) {
    const params = new URLSearchParams({
      filename: video.filename,
      subfolder: video.subfolder || "",
      type: video.type || "output",
    });
    const { response, buffer } = await fetchBufferResponseWithTimeout(`${comfyUrl}/view?${params.toString()}`, {}, COMFY_DOWNLOAD_TIMEOUT_MS);
    if (!response.ok) continue;
    const contentType = response.headers.get("content-type") || mimeTypes[path.extname(video.filename).toLowerCase()] || "video/mp4";
    const extension = extensionFromContentType(contentType) || extensionFromUrl(video.filename) || "mp4";
    if (extension !== "mp4") continue;
    const filename = `${prefix}${crypto.randomBytes(4).toString("hex")}.${extension}`;
    fs.writeFileSync(path.join(OUTPUT_DIR, filename), buffer);
    const url = `/output/${filename}`;
    if (!urls.includes(url)) urls.push(url);
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

async function saveRunningHubOutputImages(data, prefix) {
  const urls = extractRunningHubImageUrls(data);
  const saved = [];
  for (const [index, url] of urls.entries()) {
    const response = await fetchWithTimeout(url, {}, 120000);
    if (!response.ok) continue;
    const contentType = response.headers.get("content-type") || "image/png";
    const extension = extensionFromContentType(contentType) || extensionFromUrl(url) || "png";
    const filename = `${prefix}${index + 1}_${crypto.randomBytes(4).toString("hex")}.${extension}`;
    const filePath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(filePath, Buffer.from(await response.arrayBuffer()));
    saved.push(`/output/${filename}`);
  }
  return saved;
}

function extractRunningHubImageUrls(value, urls = []) {
  if (!value) return urls;
  if (typeof value === "string") {
    if (/^https?:\/\/.+\.(png|jpe?g|webp)(\?.*)?$/i.test(value) && !urls.includes(value)) urls.push(value);
    return urls;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => extractRunningHubImageUrls(item, urls));
    return urls;
  }
  if (typeof value !== "object") return urls;

  const direct = value.fileUrl || value.fileURL || value.url || value.imageUrl || value.imageURL || value.originUrl || value.outputUrl;
  if (typeof direct === "string" && /^https?:\/\//i.test(direct) && !urls.includes(direct)) urls.push(direct);
  Object.values(value).forEach((item) => extractRunningHubImageUrls(item, urls));
  return urls;
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

async function imageReferenceToFile(url, filename, options = {}) {
  const source = String(url || "");
  if (source.startsWith("data:")) return dataUrlToFile(source, filename);

  const localPath = resolveLocalImageReference(source);
  if (localPath) {
    return localImageFileToUpload(localPath, filename);
  }

  if (/^https?:\/\//i.test(source)) {
    const response = await fetchWithTimeout(source, { signal: options.signal }, 20000);
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

async function mediaReferenceToFile(url, filename, kind = "image") {
  const source = String(url || "");
  if (source.startsWith("data:")) {
    const file = dataUrlToFile(source, filename);
    assertMediaKind(file.blob.type, kind);
    return file;
  }

  const localPath = source.startsWith("/output/") ? resolveLocalImageReference(source) : "";
  if (localPath) {
    const extension = extensionFromFilePath(localPath) || path.extname(filename).replace(".", "");
    const mimeType = mimeTypes[`.${extension}`] || "application/octet-stream";
    assertMediaKind(mimeType, kind);
    const buffer = fs.readFileSync(localPath);
    return { filename, blob: new Blob([buffer], { type: mimeType }) };
  }

  throw new Error(`Reference ${kind} must be a data URL or /output URL.`);
}

function assertMediaKind(mimeType, kind) {
  const expected = kind === "audio" ? "audio/" : kind === "video" ? "video/" : "image/";
  if (!String(mimeType || "").toLowerCase().startsWith(expected)) {
    throw new Error(`Reference ${kind} has an unsupported media type: ${mimeType || "unknown"}.`);
  }
}

async function readBodyBuffer(req, maxBytes = MAX_REQUEST_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error(`Request body too large. Current limit is ${Math.round(maxBytes / 1024 / 1024)}MB.`));
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

async function saveGeneratedImages(data, options = {}) {
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
        const response = await fetchWithTimeout(item.url, { signal: options.signal }, 15000);
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
      const dimensions = getImageDimensionsFromBuffer(bytes);
      saved.push({
        filename,
        url: `/output/${filename}`,
        ...(dimensions || {}),
      });
      item.local_url = `/output/${filename}`;
      if (dimensions) {
        item.width = dimensions.width;
        item.height = dimensions.height;
      }
    } catch (error) {
      saved.push({
        error: error.message,
      });
    }
  }

  return saved;
}

function waitForAbortableDelay(delayMs, signal) {
  if (!signal) return new Promise((resolve) => setTimeout(resolve, delayMs));
  if (signal.aborted) return Promise.reject(signal.reason || new Error("The operation was aborted."));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason || new Error("The operation was aborted."));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function fetchJsonResponseWithTimeout(url, options = {}, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: options.signal || controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBufferResponseWithTimeout(url, options = {}, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: options.signal || controller.signal,
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    return { response, buffer };
  } finally {
    clearTimeout(timer);
  }
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

function getImageDimensionsFromBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) return null;
  if (buffer.readUInt32BE(0) === 0x89504e47 && buffer.toString("ascii", 12, 16) === "IHDR") {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2) break;
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        return {
          width: buffer.readUInt16BE(offset + 7),
          height: buffer.readUInt16BE(offset + 5),
        };
      }
      offset += 2 + length;
    }
  }
  return null;
}

function decodeImageBase64(value) {
  const source = String(value || "");
  const commaIndex = source.indexOf(",");
  const payload = source.startsWith("data:") && commaIndex >= 0 ? source.slice(commaIndex + 1) : source;
  return Buffer.from(payload, "base64");
}

function normalizeChatImageResponse(data) {
  const items = [];
  collectImagesFromValue(data.data, items);
  const choices = Array.isArray(data.choices) ? data.choices : [];
  for (const choice of choices) {
    collectImagesFromValue(choice.message?.content, items);
    collectImagesFromValue(choice.message?.images, items);
    collectImagesFromValue(choice.message?.image, items);
    collectImagesFromValue(choice.delta?.content, items);
  }

  collectImagesFromValue(data.candidates, items);
  collectImagesFromValue(data.images, items);
  collectImagesFromValue(data.image, items);
  collectImagesFromValue(data.output, items);
  collectImagesFromValue(data.output_text, items);
  collectImagesFromValue(data.output_image, items);
  collectImagesFromValue(data.outputImage, items);

  const normalizedItems = dedupeImageItems(items);
  if (normalizedItems.length || !Array.isArray(data.data)) data.data = normalizedItems;
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

  for (const key of ["content", "text", "images", "image", "parts", "source", "inline_data", "inlineData", "file_data", "fileData"]) {
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
  const value = String(contentType || "").toLowerCase();
  if (value.includes("jpeg") || value.includes("jpg")) return "jpg";
  if (value.includes("webp")) return "webp";
  if (value.includes("png")) return "png";
  if (value.includes("gif")) return "gif";
  if (value.includes("quicktime")) return "mov";
  if (value.includes("matroska")) return "mkv";
  if (value.includes("webm")) return "webm";
  if (value.includes("audio/mp4")) return "m4a";
  if (value.includes("mp4")) return "mp4";
  if (value.includes("mpeg")) return "mp3";
  if (value.includes("wav")) return "wav";
  if (value.includes("flac")) return "flac";
  if (value.includes("aac")) return "aac";
  if (value.includes("ogg")) return "ogg";
  return "";
}

function extensionFromUrl(url) {
  try {
    const ext = path.extname(new URL(url).pathname).replace(".", "").toLowerCase();
    if (["png", "jpg", "jpeg", "webp", "gif", "mp4", "webm", "mov", "mkv", "wav", "mp3", "m4a", "aac", "flac", "ogg"].includes(ext)) return ext === "jpeg" ? "jpg" : ext;
  } catch {}
  return "";
}

function extensionFromFilePath(filePath) {
  const ext = path.extname(String(filePath || "")).replace(".", "").toLowerCase();
  if (["png", "jpg", "jpeg", "webp", "gif", "mp4", "webm", "mov", "mkv", "wav", "mp3", "m4a", "aac", "flac", "ogg"].includes(ext)) return ext === "jpeg" ? "jpg" : ext;
  return "";
}

function parseModels(value, fallback) {
  const models = value
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);

  return models.length ? [...new Set(models)] : [fallback];
}

function getDefaultSettings() {
  return {
    providers: [],
    agentRouting: CanvasAgentRouter.normalizeAgentRouting(),
    canvas: {
      keepAspect: false,
      controlBarBottom: false,
      disconnectMenu: false,
    },
    appearance: {
      theme: "system",
      palette: "yellow-black",
      animations: true,
    },
    storage: {
      autoSave: true,
      intervalMinutes: 5,
      dataDirectory: DATA_DIR,
    },
  };
}

function readSettingsFile() {
  const defaults = getDefaultSettings();
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return defaults;
    const value = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8") || "{}");
    return normalizeSettings(value, defaults);
  } catch {
    return defaults;
  }
}

function writeSettingsFile(settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

function normalizeModelPrice(value) {
  const price = String(value || "").trim()
    .replace(/^￥\s*/, "")
    .replace(/\s+/g, "")
    .replace(/[—–-]/g, "~");
  if (!price) return "";
  if (!/^\$?\d+(?:\.\d+)?(?:~\$?\d+(?:\.\d+)?)?$/.test(price)) return "";
  return price.slice(0, 40);
}

function normalizeSettings(value, previous = getDefaultSettings()) {
  const defaults = getDefaultSettings();
  const previousProviders = new Map([...(previous.providers || []), ...getSystemProviders()].map((provider) => [provider.id, provider]));
  const providers = (Array.isArray(value?.providers) ? value.providers : previous.providers || []).map((provider, index) => {
    const id = String(provider.id || crypto.randomUUID());
    const old = previousProviders.get(id) || {};
    const submittedKey = String(provider.apiKey || "").trim();
    const models = Array.isArray(provider.models) ? provider.models : old.models || [];
    return {
      id,
      name: String(provider.name || old.name || `API ${index + 1}`).trim() || `API ${index + 1}`,
      baseUrl: normalizeProviderBaseUrl(provider.baseUrl || old.baseUrl || ""),
      rechargeUrl: String(provider.rechargeUrl || old.rechargeUrl || "").trim(),
      apiKey: submittedKey && !submittedKey.includes("••••") ? submittedKey : String(old.apiKey || ""),
      enabled: provider.enabled !== false,
      importedSystem: Boolean(provider.importedSystem || provider.managed || old.importedSystem),
      models: models.map((model) => {
        const legacyCapabilities = model.type === "chat"
          ? ["text", "vision"]
          : model.type === "image"
            ? ["generation", "edit"]
            : [];
        const capabilities = Array.isArray(model.capabilities) ? model.capabilities : legacyCapabilities;
        const resolutions = normalizeImageResolutions(model.resolutions, model.id);
        const platform = normalizeImagePlatform(model.platform, model.id);
        const family = normalizeImageModelFamily(model.family, model.id);
        return {
          id: String(model.id || "").trim(),
          alias: String(model.alias || "").trim(),
          capabilities: [...new Set(capabilities.filter((item) => ["text", "vision", "generation", "edit"].includes(item)))],
          resolutions,
          platform,
          family: platform === "google" || platform === "midjourney" ? family : "",
          price: normalizeModelPrice(model.price ?? old.models?.find((item) => item.id === model.id)?.price),
        };
      }).filter((model) => model.id),
    };
  });
  const appearance = { ...defaults.appearance, ...(previous.appearance || {}), ...(value?.appearance || {}) };
  if (!["light", "dark", "system"].includes(appearance.theme)) appearance.theme = defaults.appearance.theme;
  if (!["yellow-black", "red-blue", "mustard-blue"].includes(appearance.palette)) appearance.palette = defaults.appearance.palette;

  return {
    providers,
    agentRouting: CanvasAgentRouter.normalizeAgentRouting({
      ...(previous.agentRouting || defaults.agentRouting),
      ...(value?.agentRouting || {}),
    }),
    canvas: { ...defaults.canvas, ...(previous.canvas || {}), ...(value?.canvas || {}) },
    appearance,
    storage: {
      ...defaults.storage,
      ...(previous.storage || {}),
      ...(value?.storage || {}),
      dataDirectory: DATA_DIR,
      intervalMinutes: Math.max(1, Math.min(120, Number(value?.storage?.intervalMinutes ?? previous.storage?.intervalMinutes ?? 5) || 5)),
    },
  };
}

function sanitizeSettings(settings) {
  return {
    ...settings,
    providers: (settings.providers || []).map((provider) => ({
      ...provider,
      apiKey: "",
      apiKeyMasked: maskApiKey(provider.apiKey),
      hasApiKey: Boolean(provider.apiKey),
    })),
  };
}

function getSettingsResponse(settings) {
  const sanitized = sanitizeSettings(settings);
  const systemProviders = getSystemProviders();
  sanitized.providers = sanitized.providers.map((provider) => {
    const systemProvider = systemProviders.find((item) => item.id === provider.id);
    if (!systemProvider || !provider.importedSystem) return provider;
    const existingModels = new Set((provider.models || []).map((model) => model.id));
    const missingModels = systemProvider.models.filter((model) => !existingModels.has(model.id));
    return missingModels.length ? { ...provider, models: [...provider.models, ...missingModels] } : provider;
  });
  const configuredIds = new Set(sanitized.providers.map((provider) => provider.id));
  return {
    ...sanitized,
    providers: [
      ...systemProviders
        .filter((provider) => !configuredIds.has(provider.id))
        .map((provider) => ({
          ...provider,
          managed: false,
          importedSystem: true,
          hasApiKey: Boolean(provider.apiKey),
          apiKey: "",
          apiKeyMasked: maskApiKey(provider.apiKey),
        })),
      ...sanitized.providers,
    ],
  };
}

function getSystemProviders() {
  const primaryChatModels = AVAILABLE_MODELS.filter((model) => !GEMINI_MODELS.includes(model) && !BAILIAN_MODELS.includes(model));
  const specializedImageModels = new Set([AINB_IMAGE_MODEL_ALIAS, CLSE_IMAGE_MODEL_ALIAS, APIMART_IMAGE_MODEL_ALIAS, MIDJOURNEY_IMAGE_MODEL_ALIAS, ...GRSAI_IMAGE_MODELS]);
  const primaryImageModels = AVAILABLE_IMAGE_MODELS.filter((model) => !specializedImageModels.has(model));
  const candidates = [
    makeSystemProvider("system-ai-chat", "主对话 API", API_URL, API_KEY, primaryChatModels, "chat"),
    makeSystemProvider("system-gemini-chat", "Gemini 对话 API", GEMINI_API_URL, GEMINI_API_KEY, GEMINI_MODELS, "chat"),
    makeSystemProvider("system-bailian-chat", "百炼对话 API", BAILIAN_API_URL, BAILIAN_API_KEY, BAILIAN_MODELS, "chat"),
    makeSystemProvider("system-ai-image", "主图片 API", IMAGE_API_URL, API_KEY, primaryImageModels, "image"),
    makeSystemProvider("system-ainb-image", "AINB 图片 API", AINB_IMAGE_API_URL, AINB_IMAGE_API_KEY, [AINB_IMAGE_MODEL_ALIAS], "image"),
    makeSystemProvider("system-clse-image", "CLSE 图片 API", CLSE_IMAGE_API_URL, CLSE_IMAGE_API_KEY, [CLSE_IMAGE_MODEL_ALIAS], "image"),
    makeSystemProvider("system-apimart-image", "APIMART 图片 API", APIMART_IMAGE_API_URL, APIMART_IMAGE_API_KEY, [APIMART_IMAGE_MODEL_ALIAS, MIDJOURNEY_IMAGE_MODEL_ALIAS], "image"),
    makeSystemProvider("system-grsai-image", "GRSAI 图片 API", GRSAI_IMAGE_API_URL, GRSAI_IMAGE_API_KEY, GRSAI_IMAGE_MODELS, "image"),
  ];
  const grouped = new Map();
  candidates.filter((provider) => provider.hasApiKey && provider.models.length).forEach((provider) => {
    const groupKey = `${provider.baseUrl}\n${provider.secretFingerprint}`;
    const existing = grouped.get(groupKey);
    if (!existing) {
      grouped.set(groupKey, provider);
      return;
    }
    existing.models.push(...provider.models);
    existing.endpoints = [...new Set([...existing.endpoints, ...provider.endpoints])];
  });
  const providers = [...grouped.values()];
  const hostCounts = providers.reduce((counts, provider) => {
    counts.set(provider.name, (counts.get(provider.name) || 0) + 1);
    return counts;
  }, new Map());
  return providers.map((provider) => {
    if ((hostCounts.get(provider.name) || 0) > 1) provider.name = `${provider.name} · ${provider.apiKeyMasked.slice(-4)}`;
    delete provider.secretFingerprint;
    return provider;
  });
}

function makeSystemProvider(id, name, endpointUrl, apiKey, models, type) {
  const baseUrl = normalizeProviderBaseUrl(endpointUrl);
  return {
    id: `system-${crypto.createHash("sha1").update(`${baseUrl}\n${apiKey}`).digest("hex").slice(0, 12)}`,
    name: getProviderDisplayName(baseUrl, name),
    baseUrl,
    apiKey,
    apiKeyMasked: maskApiKey(apiKey),
    hasApiKey: Boolean(apiKey),
    enabled: Boolean(apiKey),
    managed: true,
    secretFingerprint: crypto.createHash("sha1").update(String(apiKey || "")).digest("hex"),
    endpoints: [type],
    source: "env",
    sourceLabel: ".env 系统配置",
    models: [...new Set(models || [])].filter(Boolean).map((model) => ({
      id: model,
      alias: "",
      capabilities: type === "chat" ? ["text", "vision"] : ["generation", "edit"],
      ...(String(model || "").trim().toLowerCase() === MIDJOURNEY_IMAGE_MODEL_ALIAS ? { resolutions: [], platform: "midjourney", family: "midjourney" } : {}),
      price: "",
    })),
  };
}

function getProviderDisplayName(baseUrl, fallback) {
  try {
    return new URL(baseUrl).hostname.replace(/^api\./i, "") || fallback;
  } catch {
    return fallback;
  }
}

function maskApiKey(key) {
  const value = String(key || "");
  if (!value) return "";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••••••${value.slice(-4)}`;
}

function makeCustomModelClientId(providerId, modelId) {
  return `custom:${providerId}:${Buffer.from(String(modelId)).toString("base64url")}`;
}

function normalizeImageResolutions(value, modelId = "") {
  if (String(modelId || "").trim().toLowerCase() === MIDJOURNEY_IMAGE_MODEL_ALIAS) return [];
  const items = Array.isArray(value) ? value : ["1", "2", "4"];
  const normalized = sortImageResolutions([...new Set(items.map(normalizeImageResolutionValue).filter(Boolean))]);
  return normalized.length ? normalized : ["1"];
}

function normalizeImageResolutionValue(item) {
  const value = String(item || "").toLowerCase().replace(/px$/, "").replace(/k$/, "");
  if (value === "0.5" || value === "512") return "512";
  if (["1", "2", "4"].includes(value)) return value;
  return "";
}

function sortImageResolutions(values) {
  const order = ["512", "1", "2", "4"];
  return [...new Set(values.map(normalizeImageResolutionValue).filter(Boolean))]
    .sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

function normalizeImagePlatform(value, modelId = "") {
  if (String(modelId || "").trim().toLowerCase() === MIDJOURNEY_IMAGE_MODEL_ALIAS) return "midjourney";
  const platform = String(value || "").toLowerCase();
  if (["openai", "google"].includes(platform)) return platform;
  return inferImagePlatform(modelId);
}

function inferImagePlatform(modelId = "") {
  if (String(modelId || "").trim().toLowerCase() === MIDJOURNEY_IMAGE_MODEL_ALIAS) return "midjourney";
  const value = String(modelId || "").toLowerCase();
  return value.includes("nano-banana") || value.includes("gemini") ? "google" : "openai";
}

function normalizeImageModelFamily(value, modelId = "") {
  if (String(modelId || "").trim().toLowerCase() === MIDJOURNEY_IMAGE_MODEL_ALIAS) return "midjourney";
  const raw = String(value || modelId || "").toLowerCase();
  if (raw.includes("gpt-image-2")) return "gpt-image-2";
  if (raw.includes("3.1-flash-lite") || raw.includes("flash-lite-image")) return "gemini-3.1-flash-lite-image";
  if (raw.includes("3.1") || raw.includes("nano-banana-2")) return "gemini-3.1-flash-image";
  if (raw.includes("3-pro") || raw.includes("3 pro") || raw.includes("nano-banana-pro")) return "gemini-3-pro-image";
  if (raw.includes("2.5") || raw === "nano-banana") return "gemini-2.5-flash-image";
  return inferImagePlatform(modelId) === "google" ? "gemini-3.1-flash-image" : "openai-image";
}

function getImageModelFamily(modelId) {
  const customModel = resolveCustomModel(modelId, "generation") || resolveCustomModel(modelId, "edit");
  if (customModel) return normalizeImageModelFamily(customModel.model.family, customModel.model.id);
  const matches = readSettingsFile().providers
    .flatMap((provider) => provider.models || [])
    .filter((model) => model.id === modelId && model.capabilities?.includes("generation"));
  if (matches.length) return normalizeImageModelFamily(matches[matches.length - 1].family, modelId);
  return normalizeImageModelFamily("", modelId);
}

function getImageModelPlatform(modelId) {
  const customModel = resolveCustomModel(modelId, "generation") || resolveCustomModel(modelId, "edit");
  if (customModel) return normalizeImagePlatform(customModel.model.platform, customModel.model.id);
  const matches = readSettingsFile().providers
    .flatMap((provider) => provider.models || [])
    .filter((model) => model.id === modelId && model.capabilities?.includes("generation"));
  if (matches.length) return normalizeImagePlatform(matches[matches.length - 1].platform, modelId);
  return inferImagePlatform(modelId);
}

function getConfiguredImageResolutions(modelId, modelConfig = null) {
  const matches = modelConfig
    ? [modelConfig]
    : readSettingsFile().providers
      .flatMap((provider) => provider.models || [])
      .filter((model) => model.id === modelId && model.capabilities?.includes("generation"));
  const familyDefaults = getDefaultImageResolutionsForModel(modelId);
  if (!matches.length) return familyDefaults;
  const configured = normalizeImageResolutions(matches[matches.length - 1].resolutions);
  return configured.filter((item) => familyDefaults.includes(item)).length
    ? configured.filter((item) => familyDefaults.includes(item))
    : familyDefaults.slice(0, 1);
}

function validateImageOutputRequest(modelId, size, resolution) {
  const customModel = resolveCustomModel(modelId, "generation") || resolveCustomModel(modelId, "edit");
  return ImageResolutionRules.getCompatibility({
    platform: getImageModelPlatform(modelId),
    family: getImageModelFamily(modelId),
    ratio: String(size || "auto").trim().toLowerCase(),
    resolution: String(resolution || "auto").trim().toLowerCase(),
    configuredResolutions: getConfiguredImageResolutions(modelId, customModel?.model || null),
  });
}

function getDefaultImageResolutionsForModel(modelId) {
  if (String(modelId || "").trim().toLowerCase() === MIDJOURNEY_IMAGE_MODEL_ALIAS) return [];
  if (getImageModelPlatform(modelId) === "google") {
    const family = getImageModelFamily(modelId);
    if (family === "gemini-3.1-flash-image") return ["512", "1", "2", "4"];
    if (family === "gemini-2.5-flash-image" || family === "gemini-3.1-flash-lite-image") return ["1"];
    return ["1", "2", "4"];
  }
  return ["1", "2", "4"];
}

function getCustomModelEntries(capability) {
  return readSettingsFile().providers.flatMap((provider) => {
    if (!provider.enabled || !provider.baseUrl || !provider.apiKey) return [];
    return provider.models
      .filter((model) => model.capabilities?.includes(capability))
      .map((model) => ({
        clientId: provider.importedSystem ? model.id : makeCustomModelClientId(provider.id, model.id),
        label: model.alias || (provider.importedSystem ? getSystemImageModelLabel(model.id) : model.id + " \u00b7 " + provider.name),
        provider,
        model,
      }));
  });
}

function getSystemImageModelLabel(modelId) {
  const labels = {
    [AINB_IMAGE_MODEL_ALIAS.toLowerCase()]: "gpt-image-2 \u00b7 ainb",
    [CLSE_IMAGE_MODEL_ALIAS.toLowerCase()]: "gpt-image-2 \u00b7 clse",
    [APIMART_IMAGE_MODEL_ALIAS.toLowerCase()]: "gpt-image-2 \u00b7 apimart",
    [MIDJOURNEY_IMAGE_MODEL_ALIAS]: "Midjourney",
    "gpt-image-2-vip-grsai": "gpt-image-2-vip \u00b7 grsai",
    "gpt-image-2-grsai": "gpt-image-2 \u00b7 grsai",
    "nano-banana-pro-grsai": "nano-banana-pro \u00b7 grsai",
    "nano-banana-2-grsai": "nano-banana-2 \u00b7 grsai",
  };
  return labels[String(modelId || "").toLowerCase()] || modelId;
}

function resolveCustomModel(clientId, capability) {
  return getCustomModelEntries(capability).find((item) => item.clientId === clientId) || null;
}

function isStaticModelEnabled(modelId, capability) {
  const overrides = readSettingsFile().providers
    .filter((provider) => provider.importedSystem)
    .flatMap((provider) => provider.models)
    .filter((model) => model.id === modelId);
  return !overrides.length || overrides.some((model) => model.capabilities?.includes(capability));
}

function hasVisionMessage(messages) {
  return (Array.isArray(messages) ? messages : []).some((message) =>
    Array.isArray(message?.content) && message.content.some((item) => item?.type === "image_url"));
}

function normalizeModelsApiUrl(url) {
  const cleanUrl = normalizeProviderBaseUrl(url);
  if (cleanUrl.endsWith("/v1")) return `${cleanUrl}/models`;
  return `${cleanUrl}/v1/models`;
}

function normalizeProviderBaseUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "")
    .replace(/\/v1\/api\/(?:generate|result)$/i, "")
    .replace(/\/models$/i, "")
    .replace(/\/chat\/completions$/i, "")
    .replace(/\/images\/(?:generations|edits)$/i, "");
}

function extractProviderModelIds(data) {
  const list = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
  return [...new Set(list.map((item) => String(item?.id || item?.name || item || "").trim()).filter(Boolean))].sort();
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
  if (cleanPath.startsWith("/data/") || cleanPath.startsWith("/tmp/") || cleanPath.startsWith("/.") || cleanPath === "/server.js") {
    sendJson(res, 403, { error: "Forbidden" });
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
    const cacheControl = [".html", ".css", ".js"].includes(ext)
      ? "no-store, max-age=0"
      : "public, max-age=31536000";
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": cacheControl,
    });
    res.end(content);
  });
}

function serveOutput(urlPath, res) {
  const filePath = resolveOutputPath(urlPath);

  if (!filePath) {
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

function getImageModelCandidates() {
  const providers = getSettingsResponse(readSettingsFile()).providers;
  const records = CanvasImageModelRouting.buildCandidateRecords(
    providers,
    readProviderMonitoringFile(),
    { makeClientId: makeCustomModelClientId },
  ).map((record) => {
    const provider = providers.find((item) => item.id === record.providerId);
    const model = provider?.models?.find((item) => item.id === record.model) || null;
    return {
      ...record,
      platform: normalizeImagePlatform(model?.platform, model?.id || record.model),
      family: normalizeImageModelFamily(model?.family, model?.id || record.model),
      resolutions: getConfiguredImageResolutions(model?.id || record.model, model),
    };
  });
  const ranked = CanvasImageModelRouting.rankCandidates(records);
  const rankedIds = new Set(ranked.map((item) => item.id));
  const ordered = [...ranked, ...records.filter((item) => !rankedIds.has(item.id))];
  return [...new Map(ordered.map((item) => [item.id, item])).values()];
}

function resolveOutputPath(urlPath) {
  let relative;
  try {
    relative = decodeURIComponent(String(urlPath || "").replace(/^\/output\//, "")).replace(/\\/g, "/");
  } catch {
    return "";
  }
  const resolvedOutputDir = path.resolve(OUTPUT_DIR);
  const filePath = path.resolve(resolvedOutputDir, relative);
  const prefix = `${resolvedOutputDir}${path.sep}`;
  return filePath.startsWith(prefix) ? filePath : "";
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_REQUEST_BYTES) {
        req.destroy();
        reject(new Error(`Request body too large. Current limit is ${Math.round(MAX_REQUEST_BYTES / 1024 / 1024)}MB.`));
        return;
      }
      chunks.push(buffer);
    });

    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString("utf8");
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
