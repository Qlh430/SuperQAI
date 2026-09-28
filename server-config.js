"use strict";

const fs = require("fs");
const path = require("path");

function loadEnvFile({
  rootDir = __dirname,
  env = process.env,
  fsImpl = fs,
  pathImpl = path,
} = {}) {
  if (["1", "true", "yes"].includes(String(env.AI_OS_SKIP_ENV_FILE || "").toLowerCase())) return;
  const envPath = env.AI_OS_ENV_FILE
    ? pathImpl.resolve(env.AI_OS_ENV_FILE)
    : pathImpl.join(rootDir, ".env");
  if (!fsImpl.existsSync(envPath)) return;

  const lines = fsImpl.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (key && (env[key] === undefined || env[key] === "")) env[key] = value;
  }
}

function parseModels(value, fallback) {
  const models = String(value || "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  return models.length ? [...new Set(models)] : [fallback];
}

function normalizeApiUrl(url) {
  const cleanUrl = String(url || "").replace(/\/+$/, "");
  if (cleanUrl.endsWith("/chat/completions")) return cleanUrl;
  if (cleanUrl.endsWith("/v1")) return `${cleanUrl}/chat/completions`;
  return `${cleanUrl}/v1/chat/completions`;
}

function normalizeMidjourneyApiUrl(url) {
  const cleanUrl = String(url || "").trim().replace(/\/+$/, "");
  if (cleanUrl.endsWith("/midjourney/generations")) return cleanUrl;
  if (cleanUrl.endsWith("/v1")) return `${cleanUrl}/midjourney/generations`;
  return `${cleanUrl}/v1/midjourney/generations`;
}

function normalizeImageApiUrl(url) {
  const cleanUrl = String(url || "").replace(/\/+$/, "");
  if (cleanUrl.endsWith("/images/generations")) return cleanUrl;
  if (cleanUrl.endsWith("/v1")) return `${cleanUrl}/images/generations`;
  if (cleanUrl.endsWith("/chat/completions")) return cleanUrl.replace(/\/chat\/completions$/, "/images/generations");
  return `${cleanUrl}/v1/images/generations`;
}

function normalizeImageEditApiUrl(url) {
  const cleanUrl = String(url || "").replace(/\/+$/, "");
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

function resolvePath(value, fallback, pathImpl) {
  return value ? pathImpl.resolve(value) : fallback;
}

function createServerConfig({
  rootDir = __dirname,
  env = process.env,
  fsImpl = fs,
  pathImpl = path,
  normalizeAgentApiUrl = (value) => String(value || ""),
  loadEnvironment = true,
} = {}) {
  if (loadEnvironment) loadEnvFile({ rootDir, env, fsImpl, pathImpl });
  if (typeof normalizeAgentApiUrl !== "function") {
    throw new TypeError("Server config requires normalizeAgentApiUrl to be a function.");
  }

  const OUTBOUND_PROXY_URL = env.OUTBOUND_PROXY_URL || "auto";
  const OUTBOUND_NO_PROXY = env.OUTBOUND_NO_PROXY || env.NO_PROXY || "";
  const PORT = Number(env.PORT || 3199);
  const HOST = env.HOST || "0.0.0.0";
  const PUBLIC_DIR = rootDir;
  const OUTPUT_DIR = resolvePath(env.AI_OS_OUTPUT_DIR, pathImpl.join(rootDir, "output"), pathImpl);
  const DATA_DIR = resolvePath(env.AI_OS_DATA_DIR, pathImpl.join(rootDir, "data"), pathImpl);
  const SYSTEM_DB_FILE = resolvePath(env.AI_OS_SYSTEM_DB_FILE, pathImpl.join(DATA_DIR, "system.sqlite"), pathImpl);
  const BACKUP_DIR = resolvePath(env.AI_OS_BACKUP_DIR, pathImpl.join(DATA_DIR, "backups"), pathImpl);
  const AI_OS_SESSION_TTL_MS = Math.max(
    60_000,
    Number(env.AI_OS_SESSION_TTL_MS) || 7 * 24 * 60 * 60 * 1000,
  );
  const AI_OS_AUTH_DISABLED = ["1", "true", "yes"].includes(String(env.AI_OS_AUTH_DISABLED || "").toLowerCase());
  const DISABLED_SERVER_COMPONENTS = Object.freeze(
    String(env.AI_OS_DISABLED_SERVER_COMPONENTS || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
  const OUTBOUND_ROUTE_STATE_FILE = resolvePath(
    env.OUTBOUND_ROUTE_STATE_FILE,
    pathImpl.join(DATA_DIR, "outbound-route-state.json"),
    pathImpl,
  );
  const WORKFLOW_DIR = resolvePath(env.AI_OS_WORKFLOW_DIR, pathImpl.join(rootDir, "workflows"), pathImpl);
  const CANVAS_SKILLS_DIR = pathImpl.join(rootDir, "skills");
  const BUNDLED_SKILLS_DIR = pathImpl.join(rootDir, "bundled-skills");
  const CUSTOM_SKILLS_DIR = resolvePath(env.AI_OS_SKILLS_DIR, pathImpl.join(DATA_DIR, "skills"), pathImpl);
  const UPLOAD_TMP_DIR = resolvePath(env.AI_OS_UPLOAD_TMP_DIR, pathImpl.join(rootDir, "tmp", "uploads"), pathImpl);
  const UPSCALE_WORKFLOW_FILE = pathImpl.join(WORKFLOW_DIR, "TTP-upscale.json");
  const UPSCALE2_WORKFLOW_FILE = pathImpl.join(WORKFLOW_DIR, "SeedVR2-upscale2.json");
  const SHOE_SWAP_WORKFLOW_FILE = pathImpl.join(WORKFLOW_DIR, "shoe-swap.json");
  const OUTPAINT_WORKFLOW_FILE = pathImpl.join(WORKFLOW_DIR, "z-image-outpaint.json");
  const RUNNINGHUB_OUTPAINT_WORKFLOW_FILE = pathImpl.join(WORKFLOW_DIR, "runninghub-outpaint.json");
  const FLUX2_KLEIN_EDIT_WORKFLOW_FILE = pathImpl.join(WORKFLOW_DIR, "flux2-klein-edit-9b.json");
  const QWEN_EDIT_ANGLE_WORKFLOW_FILE = pathImpl.join(WORKFLOW_DIR, "qwen-edit-angle-2511.json");
  const MINIMAX_H3_WORKFLOW_FILE = pathImpl.join(WORKFLOW_DIR, "minimax-h3-video.json");
  const BACKGROUND_REMOVAL_WORKFLOW_FILE = pathImpl.join(WORKFLOW_DIR, "background-removal.json");
  const IMAGE_HISTORY_FILE = pathImpl.join(DATA_DIR, "image-history.json");
  const CHAT_HISTORY_FILE = pathImpl.join(DATA_DIR, "chat-history.json");
  const CANVAS_BOARDS_FILE = resolvePath(env.CANVAS_LEGACY_FILE, pathImpl.join(DATA_DIR, "canvas-boards.json"), pathImpl);
  const CANVAS_DB_FILE = resolvePath(env.CANVAS_DB_FILE, pathImpl.join(DATA_DIR, "canvas.db"), pathImpl);
  const CANVAS_BACKUP_DIR = resolvePath(env.CANVAS_BACKUP_DIR, pathImpl.join(DATA_DIR, "canvas-legacy-backups"), pathImpl);
  const THUMBNAIL_REGISTRY_FILE = pathImpl.join(DATA_DIR, "image-thumbnails.json");
  const SETTINGS_FILE = resolvePath(env.SETTINGS_FILE, pathImpl.join(DATA_DIR, "settings.json"), pathImpl);
  const PROVIDER_MONITORING_FILE = pathImpl.join(DATA_DIR, "provider-runtime-history.json");
  const IMAGE_JOBS_FILE = resolvePath(env.IMAGE_JOBS_FILE, pathImpl.join(DATA_DIR, "image-jobs.json"), pathImpl);
  const API_VIDEO_TASKS_FILE = resolvePath(env.API_VIDEO_TASKS_FILE, pathImpl.join(DATA_DIR, "api-video-tasks.json"), pathImpl);
  const CANVAS_AGENT_CONVERSATIONS_FILE = resolvePath(
    env.CANVAS_AGENT_CONVERSATIONS_FILE,
    pathImpl.join(DATA_DIR, "canvas-agent-conversations.json"),
    pathImpl,
  );
  const MAX_REQUEST_BYTES = Number(env.MAX_REQUEST_MB || 800) * 1024 * 1024;
  const MAX_MEDIA_UPLOAD_BYTES = (Number(env.MAX_MEDIA_UPLOAD_MB) || 800) * 1024 * 1024;
  const MAX_UPLOAD_CHUNKS = Math.max(1, Math.min(4096, Number(env.MAX_UPLOAD_CHUNKS) || 1024));
  const UPLOAD_TMP_TTL_MS = Math.max(60, Number(env.UPLOAD_TMP_TTL_MINUTES) || 1440) * 60 * 1000;
  const COMFY_UPLOAD_TIMEOUT_MS = Math.max(10, Number(env.COMFY_UPLOAD_TIMEOUT_SECONDS) || 300) * 1000;
  const COMFY_PROMPT_TIMEOUT_MS = Math.max(10, Number(env.COMFY_PROMPT_TIMEOUT_SECONDS) || 60) * 1000;
  const COMFY_POLL_TIMEOUT_MS = Math.max(5, Number(env.COMFY_POLL_TIMEOUT_SECONDS) || 30) * 1000;
  const COMFY_DOWNLOAD_TIMEOUT_MS = Math.max(10, Number(env.COMFY_DOWNLOAD_TIMEOUT_SECONDS) || 300) * 1000;
  const API_URL = normalizeApiUrl(env.AI_API_URL || "https://api.openai.com/v1/chat/completions");
  const API_KEY = env.AI_API_KEY || "";
  const DEFAULT_MODEL = env.AI_MODEL || "gpt-4o-mini";
  const CANVAS_AGENT_API_URL = normalizeAgentApiUrl(
    env.CANVAS_AGENT_API_URL || env.AI_API_URL || "https://api.openai.com/v1/responses",
  );
  const CANVAS_AGENT_API_KEY = env.CANVAS_AGENT_API_KEY || API_KEY;
  const CANVAS_AGENT_MODEL = env.CANVAS_AGENT_MODEL || "gpt-5.6-sol";
  const CANVAS_AGENT_REASONING_EFFORT = env.CANVAS_AGENT_REASONING_EFFORT || "medium";
  const CANVAS_AGENT_TIMEOUT_MS = Math.max(30, Number(env.CANVAS_AGENT_TIMEOUT_SECONDS || 180)) * 1000;
  const CANVAS_AGENT_CONNECT_TIMEOUT_MS = Math.max(1, Number(env.CANVAS_AGENT_CONNECT_TIMEOUT_SECONDS || 4)) * 1000;
  const CANVAS_AGENT_FIRST_EVENT_TIMEOUT_MS = Math.max(2, Number(env.CANVAS_AGENT_FIRST_EVENT_TIMEOUT_SECONDS || 30)) * 1000;
  const CANVAS_AGENT_TOTAL_TIMEOUT_MS = Math.max(20, Number(env.CANVAS_AGENT_TOTAL_TIMEOUT_SECONDS || 90)) * 1000;
  const IMAGE_JOB_TIMEOUT_MINUTES = Math.max(5, Math.min(30, Number(env.IMAGE_JOB_TIMEOUT_MINUTES) || 15));
  const IMAGE_JOB_TIMEOUT_MS = IMAGE_JOB_TIMEOUT_MINUTES * 60 * 1000;
  const CANVAS_AGENT_MAX_SESSIONS = 100;
  const CANVAS_AGENT_SESSION_TTL_MS = 30 * 60 * 1000;
  const GEMINI_API_URL = normalizeApiUrl(env.GEMINI_API_URL || "https://ai.t8star.org/v1/chat/completions");
  const GEMINI_API_KEY = env.GEMINI_API_KEY || "";
  const GEMINI_MODELS = parseModels(env.GEMINI_MODELS || "", "");
  const BAILIAN_API_URL = normalizeApiUrl(env.BAILIAN_API_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions");
  const BAILIAN_API_KEY = env.BAILIAN_API_KEY || "";
  const BAILIAN_MODELS = parseModels(env.BAILIAN_MODELS || "", "");
  const AVAILABLE_MODELS = [...new Set([...parseModels(env.AI_MODELS || DEFAULT_MODEL, DEFAULT_MODEL), ...GEMINI_MODELS, ...BAILIAN_MODELS])];
  const IMAGE_API_URL = normalizeImageApiUrl(env.AI_IMAGE_API_URL || API_URL);
  const IMAGE_EDIT_API_URL = normalizeImageEditApiUrl(env.AI_IMAGE_EDIT_API_URL || IMAGE_API_URL);
  const IMAGE_CHAT_API_URL = normalizeApiUrl(env.AI_IMAGE_CHAT_API_URL || "https://ai.t8star.org/v1/chat/completions");
  const IMAGE_CHAT_API_KEY = env.AI_IMAGE_CHAT_API_KEY || API_KEY;
  const IMAGE_DEFAULT_MODEL = env.AI_IMAGE_MODEL || "gpt-image-1";
  const AINB_IMAGE_MODEL_ALIAS = env.AINB_IMAGE_MODEL_ALIAS || "gpt-image-2-ainb";
  const AINB_IMAGE_API_URL = normalizeImageApiUrl(env.AINB_IMAGE_API_URL || "https://ainb.plus");
  const AINB_IMAGE_EDIT_API_URL = normalizeImageEditApiUrl(env.AINB_IMAGE_EDIT_API_URL || AINB_IMAGE_API_URL);
  const AINB_IMAGE_API_KEY = env.AINB_IMAGE_API_KEY || "";
  const CLSE_IMAGE_MODEL_ALIAS = env.CLSE_IMAGE_MODEL_ALIAS || "gpt-image-2-clse";
  const CLSE_IMAGE_UPSTREAM_MODEL = env.CLSE_IMAGE_UPSTREAM_MODEL || "gpt-image-2";
  const CLSE_IMAGE_API_URL = normalizeImageApiUrl(env.CLSE_IMAGE_API_URL || "https://clse-ai.com/v1");
  const CLSE_IMAGE_EDIT_API_URL = normalizeImageEditApiUrl(env.CLSE_IMAGE_EDIT_API_URL || CLSE_IMAGE_API_URL);
  const CLSE_IMAGE_API_KEY = env.CLSE_IMAGE_API_KEY || "";
  const APIMART_IMAGE_MODEL_ALIAS = env.APIMART_IMAGE_MODEL_ALIAS || "gpt-image-2-apimart";
  const APIMART_IMAGE_UPSTREAM_MODEL = env.APIMART_IMAGE_UPSTREAM_MODEL || "gpt-image-2";
  const APIMART_IMAGE_API_URL = normalizeImageApiUrl(env.APIMART_IMAGE_API_URL || "https://api.apimart.ai/v1/images/generations");
  const APIMART_IMAGE_TASK_API_URL = (env.APIMART_IMAGE_TASK_API_URL || "https://api.apimart.ai/v1/tasks").replace(/\/+$/, "");
  const APIMART_IMAGE_API_KEY = env.APIMART_IMAGE_API_KEY || "";
  const MIDJOURNEY_IMAGE_MODEL_ALIAS = "midjourney";
  const MIDJOURNEY_IMAGE_API_URL = normalizeMidjourneyApiUrl(
    env.MIDJOURNEY_IMAGE_API_URL || "https://api.apimart.ai/v1/midjourney/generations",
  );
  const MIDJOURNEY_IMAGE_TASK_API_URL = (env.MIDJOURNEY_IMAGE_TASK_API_URL || APIMART_IMAGE_TASK_API_URL).replace(/\/+$/, "");
  const GRSAI_IMAGE_BASE_URL = (env.GRSAI_IMAGE_BASE_URL || "https://grsaiapi.com").replace(/\/+$/, "");
  const GRSAI_IMAGE_API_URL = normalizeGrsaiImageApiUrl(env.GRSAI_IMAGE_API_URL || GRSAI_IMAGE_BASE_URL);
  const GRSAI_IMAGE_RESULT_API_URL = normalizeGrsaiImageResultApiUrl(env.GRSAI_IMAGE_RESULT_API_URL || GRSAI_IMAGE_BASE_URL);
  const GRSAI_IMAGE_API_KEY = env.GRSAI_IMAGE_API_KEY || "";
  const GRSAI_IMAGE_FETCH_TIMEOUT_MS = Number(env.GRSAI_IMAGE_FETCH_TIMEOUT_SECONDS || 180) * 1000;
  const GRSAI_IMAGE_MODELS = parseModels(
    env.GRSAI_IMAGE_MODELS || "gpt-image-2-vip-grsai,gpt-image-2-grsai,nano-banana-pro-grsai,nano-banana-2-grsai",
    "",
  );
  const AVAILABLE_IMAGE_MODELS = [
    ...new Set([
      ...parseModels(env.AI_IMAGE_MODELS || IMAGE_DEFAULT_MODEL, IMAGE_DEFAULT_MODEL),
      ...(AINB_IMAGE_API_KEY ? [AINB_IMAGE_MODEL_ALIAS] : []),
      ...(CLSE_IMAGE_API_KEY ? [CLSE_IMAGE_MODEL_ALIAS] : []),
      ...(APIMART_IMAGE_API_KEY ? [APIMART_IMAGE_UPSTREAM_MODEL] : []),
      ...(APIMART_IMAGE_API_KEY ? [MIDJOURNEY_IMAGE_MODEL_ALIAS] : []),
      ...(GRSAI_IMAGE_API_KEY ? GRSAI_IMAGE_MODELS : []),
    ]),
  ];
  const COMFYUI_URL = (env.COMFYUI_URL || env.COMFYUI_BASE_URL || "http://127.0.0.1:8188").replace(/\/+$/, "");
  const RUNNINGHUB_BASE_URL = (env.RUNNINGHUB_BASE_URL || "https://www.runninghub.cn").replace(/\/+$/, "");
  const RUNNINGHUB_API_KEY = env.RUNNINGHUB_API_KEY || "";
  const RUNNINGHUB_OUTPAINT_WORKFLOW_ID = env.RUNNINGHUB_OUTPAINT_WORKFLOW_ID || "2061334785754226690";
  const API_VIDEO_POLL_MS = Math.max(2_000, Number(env.API_VIDEO_POLL_SECONDS || 6) * 1000);
  const API_VIDEO_TASK_TIMEOUT_MS = Math.max(60_000, Number(env.API_VIDEO_TIMEOUT_MINUTES || 30) * 60 * 1000);
  const API_VIDEO_WATCH_MS = Math.max(30_000, Number(env.API_VIDEO_WATCH_SECONDS || 180) * 1000);
  const API_VIDEO_WATCH_MAX_MS = Math.max(60 * 60 * 1000, Number(env.API_VIDEO_WATCH_HOURS || 24) * 60 * 60 * 1000);
  const MAX_SYNC_IMAGE_BYTES = Math.max(1, Number(env.MAX_SYNC_IMAGE_MB || 64)) * 1024 * 1024;
  const ONLINE_TTL_MS = Number(env.ONLINE_TTL_SECONDS || 45) * 1000;
  const SHOE_SWAP_PROMPT = [
    "绝对保留图1的所有内容，包括人物、身体、服装、配饰、发型、背景、构图、动作、光影、色彩、氛围、场景细节，一丝一毫都不能修改、添加、删除，仅执行鞋子替换。",
    "将图2的鞋子自然完整地替换到图1人物的脚部，替换后的鞋子必须贴合图1人物脚部形态、动作角度和透视关系。",
    "替换后的鞋子必须与图1的光源方向、明暗、色调和材质质感匹配，边缘与裤脚、袜子或皮肤过渡自然无痕。",
    "严格按照图1原始画面比例输出高清成品。禁止重绘画面，禁止改变除鞋子以外的任何元素。",
  ].join("\n\n");

  return Object.freeze({
    AINB_IMAGE_API_KEY,
    AINB_IMAGE_API_URL,
    AINB_IMAGE_EDIT_API_URL,
    AINB_IMAGE_MODEL_ALIAS,
    AI_OS_AUTH_DISABLED,
    AI_OS_SESSION_TTL_MS,
    API_KEY,
    API_URL,
    API_VIDEO_POLL_MS,
    API_VIDEO_TASK_TIMEOUT_MS,
    API_VIDEO_TASKS_FILE,
    API_VIDEO_WATCH_MAX_MS,
    API_VIDEO_WATCH_MS,
    APIMART_IMAGE_API_KEY,
    APIMART_IMAGE_API_URL,
    APIMART_IMAGE_MODEL_ALIAS,
    APIMART_IMAGE_TASK_API_URL,
    APIMART_IMAGE_UPSTREAM_MODEL,
    AVAILABLE_IMAGE_MODELS,
    AVAILABLE_MODELS,
    BACKGROUND_REMOVAL_WORKFLOW_FILE,
    BACKUP_DIR,
    BAILIAN_API_KEY,
    BAILIAN_API_URL,
    BAILIAN_MODELS,
    CANVAS_AGENT_API_KEY,
    CANVAS_AGENT_API_URL,
    CANVAS_AGENT_CONNECT_TIMEOUT_MS,
    CANVAS_AGENT_CONVERSATIONS_FILE,
    CANVAS_AGENT_FIRST_EVENT_TIMEOUT_MS,
    CANVAS_AGENT_MAX_SESSIONS,
    CANVAS_AGENT_MODEL,
    CANVAS_AGENT_REASONING_EFFORT,
    CANVAS_AGENT_SESSION_TTL_MS,
    CANVAS_AGENT_TIMEOUT_MS,
    CANVAS_AGENT_TOTAL_TIMEOUT_MS,
    CANVAS_BACKUP_DIR,
    CANVAS_BOARDS_FILE,
    CANVAS_DB_FILE,
    CANVAS_SKILLS_DIR,
    BUNDLED_SKILLS_DIR,
    CHAT_HISTORY_FILE,
    CLSE_IMAGE_API_KEY,
    CLSE_IMAGE_API_URL,
    CLSE_IMAGE_EDIT_API_URL,
    CLSE_IMAGE_MODEL_ALIAS,
    CLSE_IMAGE_UPSTREAM_MODEL,
    COMFYUI_URL,
    COMFY_DOWNLOAD_TIMEOUT_MS,
    COMFY_POLL_TIMEOUT_MS,
    COMFY_PROMPT_TIMEOUT_MS,
    COMFY_UPLOAD_TIMEOUT_MS,
    CUSTOM_SKILLS_DIR,
    DATA_DIR,
    DEFAULT_MODEL,
    DISABLED_SERVER_COMPONENTS,
    FLUX2_KLEIN_EDIT_WORKFLOW_FILE,
    GEMINI_API_KEY,
    GEMINI_API_URL,
    GEMINI_MODELS,
    GRSAI_IMAGE_API_KEY,
    GRSAI_IMAGE_API_URL,
    GRSAI_IMAGE_BASE_URL,
    GRSAI_IMAGE_FETCH_TIMEOUT_MS,
    GRSAI_IMAGE_MODELS,
    GRSAI_IMAGE_RESULT_API_URL,
    HOST,
    IMAGE_API_URL,
    IMAGE_CHAT_API_KEY,
    IMAGE_CHAT_API_URL,
    IMAGE_DEFAULT_MODEL,
    IMAGE_EDIT_API_URL,
    IMAGE_HISTORY_FILE,
    IMAGE_JOBS_FILE,
    IMAGE_JOB_TIMEOUT_MINUTES,
    IMAGE_JOB_TIMEOUT_MS,
    MAX_MEDIA_UPLOAD_BYTES,
    MAX_REQUEST_BYTES,
    MAX_SYNC_IMAGE_BYTES,
    MAX_UPLOAD_CHUNKS,
    MIDJOURNEY_IMAGE_API_URL,
    MIDJOURNEY_IMAGE_MODEL_ALIAS,
    MIDJOURNEY_IMAGE_TASK_API_URL,
    MINIMAX_H3_WORKFLOW_FILE,
    ONLINE_TTL_MS,
    OUTBOUND_NO_PROXY,
    OUTBOUND_PROXY_URL,
    OUTBOUND_ROUTE_STATE_FILE,
    OUTPAINT_WORKFLOW_FILE,
    OUTPUT_DIR,
    PORT,
    PROVIDER_MONITORING_FILE,
    PUBLIC_DIR,
    QWEN_EDIT_ANGLE_WORKFLOW_FILE,
    RUNNINGHUB_API_KEY,
    RUNNINGHUB_BASE_URL,
    RUNNINGHUB_OUTPAINT_WORKFLOW_FILE,
    RUNNINGHUB_OUTPAINT_WORKFLOW_ID,
    SETTINGS_FILE,
    SHOE_SWAP_PROMPT,
    SHOE_SWAP_WORKFLOW_FILE,
    SYSTEM_DB_FILE,
    THUMBNAIL_REGISTRY_FILE,
    UPLOAD_TMP_DIR,
    UPLOAD_TMP_TTL_MS,
    UPSCALE2_WORKFLOW_FILE,
    UPSCALE_WORKFLOW_FILE,
    WORKFLOW_DIR,
  });
}

module.exports = {
  createServerConfig,
  loadEnvFile,
  normalizeApiUrl,
  normalizeGrsaiImageApiUrl,
  normalizeGrsaiImageResultApiUrl,
  normalizeImageApiUrl,
  normalizeImageEditApiUrl,
  normalizeMidjourneyApiUrl,
  parseModels,
};
