"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn: defaultSpawn } = require("node:child_process");

const SETTINGS_KEY = "jimeng_cli_settings";
// The official Dreamina CLI is currently documented from 1.4.2 onward.
const MINIMUM_VERSION = "1.4.2";
const OUTPUT_LIMIT_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
// The client pays its own start-up cost for every command, so the cheap answers
// are remembered. A status snapshot is short lived because the operator is
// usually looking at the panel while it changes; the installed version and the
// model catalog move with the client build instead.
const STATUS_TTL_MS = 3_000;
const VERSION_CACHE_TTL_MS = 10 * 60 * 1000;
const MODELS_TTL_MS = 12 * 60 * 60 * 1000;
// A device code only lives a few minutes. Waiting longer than this means the
// approval was abandoned, so the panel is released instead of polling forever.
const LOGIN_ATTEMPT_TTL_MS = 10 * 60 * 1000;

function safeError(code, message, status = 500) {
  return Object.assign(new Error(message), { code, status, safeMessage: message });
}

function redact(value) {
  return String(value || "")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk|rk|pk|key)-[A-Za-z0-9._-]{4,}/gi, "[REDACTED]")
    .replace(/("?(?:token|cookie|authorization|api[_-]?key)"?\s*[:=]\s*")([^"]+)(")/gi, "$1[REDACTED]$3")
    .slice(0, 500);
}

function parseVersion(value) {
  const match = String(value || "").match(/\b(\d+)\.(\d+)\.(\d+)\b/);
  return match ? match.slice(1).map(Number) : null;
}

// The official CLI answers "--version" with build metadata
// ({"version":"ec1b9fa-dirty","commit":"ec1b9fa"}) instead of a semantic
// version, so a semantic value is looked up under the conventional keys of the
// parsed payload before any fallback is considered.
const VERSION_KEYS = ["version", "cli_version", "cliVersion", "cli-version", "build_version", "release_version", "tag"];

function versionLabel(value) {
  const match = String(value || "").match(/\b(\d+\.\d+\.\d+)\b/);
  return match ? match[1] : "";
}

function semverFromPayload(payload, depth = 0) {
  if (payload === null || payload === undefined || depth > 3) return "";
  if (typeof payload !== "object") return versionLabel(payload);
  if (Array.isArray(payload)) {
    for (const item of payload.slice(0, 16)) {
      const found = semverFromPayload(item, depth + 1);
      if (found) return found;
    }
    return "";
  }
  for (const key of VERSION_KEYS) {
    if (key in payload) {
      const found = semverFromPayload(payload[key], depth + 1);
      if (found) return found;
    }
  }
  return "";
}

// Only used for display when no semantic version exists anywhere; the CLI build
// hash is far more useful to a reader than the raw JSON blob.
function versionHint(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const payload = maybeJson(text);
  const commit = payload && typeof payload === "object" ? String(payload.commit || "").trim() : "";
  if (commit) return commit.slice(0, 40);
  return text.split(/\r?\n/)[0].slice(0, 40);
}

function versionAtLeast(value, minimum) {
  const actual = parseVersion(value);
  const required = parseVersion(minimum);
  if (!actual || !required) return false;
  for (let index = 0; index < Math.max(actual.length, required.length); index += 1) {
    const current = actual[index] || 0;
    const target = required[index] || 0;
    if (current > target) return true;
    if (current < target) return false;
  }
  return true;
}

function safeAccount(value) {
  const text = redact(value).replace(/[\r\n]+/g, " ").trim();
  return text && text !== "[REDACTED]" ? text : "";
}

function safeCredits(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value.trim())) return Number(value);
  return null;
}

function parseJson(stdout, code) {
  try {
    return JSON.parse(String(stdout || ""));
  } catch {
    throw safeError(code, "即梦 CLI 返回的数据格式无法识别。", 502);
  }
}

function maybeJson(stdout) {
  try { return JSON.parse(String(stdout || "")); }
  catch { return null; }
}

// Dreamina names an image model by a bare version (5.0, 5.0Pro) that only the
// CLI itself understands, and a video model by a Seedance name
// (seedance2.0_vip). A version-only catalog id reads as an accident next to the
// user's other providers, so an image model is published as "jimeng-5.0" and
// the prefix is stripped again before --model_version is built. A Seedance name
// is already unique and passes through unchanged.
const IMAGE_MODEL_PREFIX = "jimeng-";

// Accepts both shapes, so callers that only hold one of them still classify the
// model: the published catalog id ("jimeng-5.0Pro") and the CLI value ("5.0Pro").
function isJimengImageModelName(value) {
  return /^(?:jimeng[-_ ]?)?\d+(?:\.\d+)+(?:pro)?$/i.test(String(value || "").trim());
}

// Maps a catalog id back to the exact value the CLI accepts. An unknown shape
// yields "" so the caller keeps whatever it was given.
function cliImageModelVersion(value) {
  const bare = String(value || "").trim().replace(/^jimeng[-_ ]?/i, "");
  if (!bare) return "";
  if (/\b5(?:\.0)?\s*[-_ ]?pro\b/i.test(bare)) return "5.0Pro";
  return bare.match(/^(\d+\.\d+)/)?.[1] || "";
}

function modelsFromHelp(stdout, kind) {
  const text = String(stdout || "");
  const found = [];
  for (const match of text.matchAll(/--model_version[^\n]*?supported values:\s*([^;\n]+)/gi)) {
    for (const value of match[1].split(",").map(part => part.trim())) {
      const candidate = value.replace(/^["']|["']$/g, "").trim();
      if (!candidate) continue;
      const model = kind === "image"
        ? (/^\d+(?:\.\d+)+[A-Za-z]*$/.test(candidate) ? `${IMAGE_MODEL_PREFIX}${candidate}` : "")
        : (/^seedance\d+(?:\.\d+)+[A-Za-z_]*$/i.test(candidate) ? candidate : "");
      if (model && !found.includes(model)) found.push(model);
    }
  }
  return found;
}

function fallbackModels() {
  return [
    `${IMAGE_MODEL_PREFIX}5.0Pro`, `${IMAGE_MODEL_PREFIX}5.0`, `${IMAGE_MODEL_PREFIX}4.7`, `${IMAGE_MODEL_PREFIX}4.6`, `${IMAGE_MODEL_PREFIX}4.5`,
    `${IMAGE_MODEL_PREFIX}4.1`, `${IMAGE_MODEL_PREFIX}4.0`, `${IMAGE_MODEL_PREFIX}3.1`, `${IMAGE_MODEL_PREFIX}3.0`,
    "seedance2.5", "seedance2.0fast", "seedance2.0", "seedance2.0mini", "seedance2.0_vip", "seedance2.0fast_vip", "seedance1.5pro", "seedance1.0fast",
  ];
}

// Help output is only ordered inside one command, so a catalog is always
// published in the known order first and anything new is appended.
function orderModels(models) {
  const ordered = fallbackModels().filter(model => models.includes(model));
  for (const model of models) if (!ordered.includes(model)) ordered.push(model);
  return ordered;
}

// AI OS carries a resolution as 1/2/4 (its own scale) or as a 1k/2k/4k label,
// while the CLI expects its own vocabulary per mode.
function normalizeResolutionNumber(value) {
  const text = String(value || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!text) return "";
  if (text === "512" || text === "0.5") return "512";
  if (["1", "2", "4"].includes(text)) return text;
  const match = text.match(/^(\d+(?:\.\d+)?)k$/);
  if (!match) return "";
  const number = Number(match[1]);
  return Number.isFinite(number) ? String(number) : "";
}

// Both quality flags are mandatory in the CLI, so a documented default is
// filled in when the caller leaves the resolution unset. The per-model ladders
// are 3.0/3.1 -> 1k and 4.x/5.0/5.0Pro -> 2k, and every video model accepts
// 720p.
const DEFAULT_VIDEO_RESOLUTION = "720p";

function defaultImageResolution(modelId) {
  const version = cliImageModelVersion(modelId) || String(modelId || "").trim();
  return /^3\.\d/i.test(version) ? "1k" : "2k";
}

function imageResolutionArgs(value, modelId = "") {
  const text = String(value || "").trim().toLowerCase();
  if (text === "auto") return "";
  const number = normalizeResolutionNumber(text);
  if (number === "512") return "";
  // 5.0 Pro is the one image model whose low rung is 1.5k, so the shared AI OS
  // level 1 has to be renamed on the way out instead of being sent as "1k",
  // which the CLI rejects outright.
  if (number === "1" && /pro$/i.test(cliImageModelVersion(modelId) || String(modelId || "").trim())) return "1.5k";
  if (number) return `${number}k`;
  return /^\d+(?:\.\d+)?k$/.test(text) ? text : "";
}

function videoResolutionArgs(value) {
  const text = String(value || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!text || text === "auto") return "";
  if (/^\d+p$/.test(text)) return text;
  if (text === "4k") return "4k";
  // A bare number is either a pixel height (1080) or the AI OS quality level
  // (1/2/4); pixel heights are the larger values and win that interpretation.
  if (/^\d+$/.test(text)) {
    const pixels = Number(text);
    if (pixels >= 2000) return "4k";
    if (pixels >= 1000) return "1080p";
    if (pixels >= 700) return "720p";
    if (pixels >= 400) return "480p";
    return pixels >= 4 ? "4k" : pixels >= 2 ? "1080p" : "720p";
  }
  const number = normalizeResolutionNumber(text);
  if (!number) return "";
  const scaled = Number(number);
  return scaled >= 4 ? "4k" : scaled >= 2 ? "1080p" : "720p";
}

// A finished Dreamina task nests its media under result_json, e.g.
// { result_json: { images: [{ image_url, width, height }], videos: [] } }.
// The same walker also accepts the flat shapes older builds returned.
const MEDIA_URL_KEYS = ["video_url", "image_url", "url", "fileUrl", "fileURL", "outputUrl", "file", "path"];

function isMediaUrl(text) {
  return /^https?:\/\//i.test(text) || /^file:\/\//i.test(text) || /^data:(?:image|video)\//i.test(text);
}

function outputData(value) {
  const output = [];
  const seen = new Set();
  const visited = new Set();
  const add = (text) => {
    const url = String(text || "").trim();
    if (!url || seen.has(url) || !isMediaUrl(url)) return;
    seen.add(url);
    output.push({ url });
  };
  const visit = (node, depth = 0) => {
    if (depth > 8 || output.length >= 20 || node === null || node === undefined) return;
    if (typeof node === "string") { add(node); return; }
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    if (typeof node !== "object" || visited.has(node)) return;
    visited.add(node);
    // An explicit video_url wins over its cover_url sibling, and a poster frame
    // is never mistaken for the media the task produced.
    const direct = MEDIA_URL_KEYS.map(key => node[key]).find(candidate => typeof candidate === "string" && isMediaUrl(candidate));
    if (direct) add(direct);
    for (const [key, item] of Object.entries(node)) {
      if (typeof item === "string" || key === "cover_url") continue;
      visit(item, depth + 1);
    }
  };
  visit(value);
  return output;
}

function outputTaskId(value) {
  return String(value?.submit_id || value?.task_id || value?.taskId || value?.id || "").trim();
}

// Dreamina reports the terminal outcome in gen_status. A failed task still
// carries a submit_id but never any media, so without this check the poll loop
// keeps querying until the outer task timeout runs out.
const TASK_FAILURE_STATUSES = new Set([
  "failed", "error", "not_found", "expired", "cancelled", "canceled", "rejected",
]);

function taskFailureMessage(value) {
  const status = String(value?.gen_status || value?.status || "").trim().toLowerCase();
  if (!TASK_FAILURE_STATUSES.has(status)) return "";
  if (status === "not_found" || status === "expired") return "即梦任务已失效，请重新提交。";
  if (status === "cancelled" || status === "canceled" || status === "rejected") return "即梦任务已被取消，请重新提交。";
  // Only the CLI's own reason field is surfaced, and only when it reads like a
  // message instead of a payload dump.
  const reason = String(value?.fail_reason || value?.failReason || value?.error_message || "").trim();
  return reason && reason.length <= 160 ? `即梦生成失败：${reason}` : "即梦生成失败，请稍后重试。";
}

// A queued Dreamina task is not a failure: query_result keeps answering with a
// queue position until a slot opens. This reads that position so the caller can
// say "排队中" instead of letting a slow queue look like a broken task.
const FINISHED_QUEUE_STATES = new Set(["finish", "finished", "success", "succeeded", "done"]);

function taskProgress(value) {
  const queue = value?.queue_info;
  if (!queue || typeof queue !== "object") return null;
  const position = Number(queue.queue_idx);
  const length = Number(queue.queue_length);
  const status = String(queue.queue_status ?? "").trim().toLowerCase();
  const queued = !FINISHED_QUEUE_STATES.has(status) && Number.isFinite(position) && position > 0;
  const active = !FINISHED_QUEUE_STATES.has(status) && String(value?.gen_status || "").trim().toLowerCase() === "pending";
  if (!queued && !active) return null;
  return {
    state: "queued",
    ...(Number.isFinite(position) && position > 0 ? { position: Math.round(position) } : {}),
    ...(Number.isFinite(length) && length > 0 ? { length: Math.round(length) } : {}),
  };
}

function isAbsoluteFile(candidate) {
  try { return path.isAbsolute(candidate) && fs.statSync(candidate).isFile(); }
  catch { return false; }
}

function validateConfiguredPath(value) {
  const candidate = String(value || "").trim();
  if (!candidate) return "";
  if (!path.isAbsolute(candidate) || !isAbsoluteFile(candidate)) {
    throw safeError("jimeng_cli_path_invalid", "即梦 CLI 路径必须是当前设备上的绝对可执行文件。", 400);
  }
  return path.resolve(candidate);
}

function findPathExecutable(env, platform) {
  // shell:false is intentional: accepting cmd/bat would make Windows command
  // dispatch ambiguous. The configured executable must be a native binary.
  const suffixes = platform === "win32" ? ["dreamina.exe"] : ["dreamina"];
  const delimiter = platform === "win32" ? ";" : ":";
  for (const directory of String(env.PATH || "").split(delimiter).filter(Boolean)) {
    for (const name of suffixes) {
      const candidate = path.join(directory, name);
      if (isAbsoluteFile(candidate)) return path.resolve(candidate);
    }
  }
  return "";
}

// The official installer drops the binary in "<home>/bin" and adds that
// directory to the user PATH. A long-running host process keeps the PATH it was
// started with, so a CLI installed after the host started would stay invisible
// if discovery only inspected PATH.
function expandKnownVariables(value, env) {
  return String(value || "").replace(/%([^%]+)%/g, (match, name) => {
    const key = Object.keys(env || {}).find(candidate => candidate.toLowerCase() === String(name).toLowerCase());
    return key ? String(env[key]) : match;
  });
}

function conventionalExecutableCandidates(env, platform) {
  const name = platform === "win32" ? "dreamina.exe" : "dreamina";
  const homes = [
    env.USERPROFILE,
    env.HOME,
    env.HOMEDRIVE && env.HOMEPATH ? `${env.HOMEDRIVE}${env.HOMEPATH}` : "",
  ].map(value => String(value || "").trim()).filter(Boolean);
  const candidates = [];
  for (const home of homes) {
    candidates.push(path.join(home, "bin", name));
    candidates.push(path.join(home, ".local", "bin", name));
  }
  for (const base of [env.LOCALAPPDATA, env.APPDATA].map(value => String(value || "").trim()).filter(Boolean)) {
    candidates.push(path.join(base, "dreamina", name));
    candidates.push(path.join(base, "Programs", "dreamina", name));
  }
  return candidates;
}

// Windows keeps the authoritative user PATH in the registry under
// HKCU\Environment. Reading it is the only way to recover an entry that was
// added after this process started. The result is cached because discovery runs
// on every status request.
function readRegistryUserPath(env) {
  const systemRoot = String(env.SystemRoot || env.windir || "C:\\Windows");
  const registry = require("node:child_process").execFileSync(
    path.join(systemRoot, "System32", "reg.exe"),
    ["query", "HKCU\\Environment", "/v", "Path"],
    { encoding: "utf8", timeout: 3_000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] },
  );
  return String(registry).match(/Path\s+REG_(?:EXPAND_)?SZ\s+([^\r\n]+)/i)?.[1] || "";
}

// Reports where the active session was authorized, so the settings panel can say
// "本机已登录的账号" instead of implying the user signed in through AI OS. The
// token lives in the machine credential store, which is why the session survives
// a different HOME and is reused by the bundled client.
function credentialSource() {
  return "system-credential-store";
}

function registryPathDirectories(env, platform, query) {
  if (platform !== "win32") return [];
  const directories = [];
  try {
    for (const entry of expandKnownVariables(query(env), env).split(";")) {
      const directory = entry.trim();
      if (directory && !directories.includes(directory)) directories.push(directory);
    }
  } catch {}
  return directories;
}

// The CLI answers "login --headless" with plain text carrying the authorization
// URL, the short user code, and the device code. Only the device code drives the
// polling call, but the URL and code are what the operator actually needs.
function loginMaterial(output) {
  const text = String(output || "");
  const read = (name) => text.match(new RegExp(`${name}\\s*[:=]\\s*([^\\s]+)`, "i"))?.[1] || "";
  const authUrl = read("verification_uri") || read("verification_url") || read("verification_uri_complete");
  return {
    deviceCode: read("device_code"),
    userCode: read("user_code"),
    // The authorization host is chosen by the vendor's OAuth service, so the link
    // is only required to be https. The device code is never exposed.
    authUrl: /^https:\/\/[^\s"'<>]+$/i.test(authUrl) ? authUrl.slice(0, 300) : "",
  };
}

// The client answers the device-flow commands in the machine's own language
// ("OAuth 登录成功。", "authsdk: login pending"), so the text is classified into
// one short outcome here. The text itself carries device-flow material and is
// never returned to the panel.
function classifyLoginOutput(output) {
  const text = String(output || "");
  if (!text) return "";
  if (/login\s+denied|access_denied|invalid_grant|拒绝授权/i.test(text)) return "denied";
  if (/login\s+expired|expired_token|授权过期|已过期/i.test(text)) return "expired";
  if (/login\s+pending|authorization_pending|slow_down|等待授权/i.test(text)) return "pending";
  // "authsdk: not logged in" means the client holds no session for that device
  // code, which is also how a code consumed by an earlier poll answers. It stays
  // unclassified so the caller re-reads the stored session instead of waiting.
  if (/登录成功|授权成功|已登录/i.test(text)) return "success";
  if (/"success"\s*:\s*true/i.test(text)) return "success";
  if (/\b(?:succeed(?:ed)?|success|completed?)\b/i.test(text)) return "success";
  return "";
}

function referenceFiles(cliHome, references) {
  const directory = path.join(cliHome, "requests");
  const files = [];
  let totalBytes = 0;
  for (const value of Array.isArray(references) ? references.slice(0, 8) : []) {
    const match = String(value || "").match(/^data:([a-z0-9.+/-]+);base64,([a-z0-9+/=]+)$/i);
    if (!match) {
      removeFiles(files);
      throw safeError("jimeng_cli_reference_invalid", "即梦参考图格式无效。", 400);
    }
    const buffer = Buffer.from(match[2], "base64");
    totalBytes += buffer.length;
    if (totalBytes > 20 * 1024 * 1024) {
      removeFiles(files);
      throw safeError("jimeng_cli_reference_invalid", "即梦参考图总大小不能超过 20 MB。", 400);
    }
    try {
      fs.mkdirSync(directory, { recursive: true });
      const extension = match[1].toLowerCase().includes("png") ? ".png" : ".jpg";
      const file = path.join(directory, `${crypto.randomUUID()}${extension}`);
      fs.writeFileSync(file, buffer, { mode: 0o600 });
      files.push(file);
    } catch (error) {
      removeFiles(files);
      throw safeError("jimeng_cli_reference_write_failed", "即梦参考图暂存失败。", 500);
    }
  }
  return files;
}

function removeFiles(files) {
  for (const file of files) {
    try { fs.rmSync(file, { force: true }); }
    catch {}
  }
}

function createJimengCliService({
  dataDir,
  settings,
  spawnImpl = defaultSpawn,
  env = process.env,
  platform = process.platform,
  clock = globalThis,
  bundledExecutablePath = "",
  bundledDirectory = path.join(__dirname, "runtime"),
  registryPathQuery = readRegistryUserPath,
  commandTimeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (!dataDir) throw new TypeError("Jimeng CLI service requires dataDir.");
  if (!settings || typeof settings.getSetting !== "function" || typeof settings.setSetting !== "function") {
    throw new TypeError("Jimeng CLI service requires settings storage.");
  }
  if (typeof spawnImpl !== "function") throw new TypeError("Jimeng CLI service requires spawnImpl.");

  const root = path.resolve(dataDir);
  const cliHome = path.join(root, "cli-home", "jimeng");
  const isolatedHome = path.join(cliHome, "home");
  const isolatedConfig = path.join(cliHome, "config");
  const isolatedCache = path.join(cliHome, "cache");
  const isolatedData = path.join(cliHome, "data");
  for (const directory of [cliHome, isolatedHome, isolatedConfig, isolatedCache, isolatedData]) fs.mkdirSync(directory, { recursive: true });
  const activeChildren = new Set();
  // Discovery must look at the real machine while the CLI itself runs against an
  // isolated home, so the two environments are kept apart.
  const hostEnv = { ...process.env, ...(env || {}) };
  const baseEnv = {
    ...hostEnv,
    HOME: isolatedHome,
    USERPROFILE: isolatedHome,
    APPDATA: isolatedConfig,
    LOCALAPPDATA: isolatedData,
    XDG_CONFIG_HOME: isolatedConfig,
    XDG_CACHE_HOME: isolatedCache,
    XDG_DATA_HOME: isolatedData,
    DREAMINA_HOME: cliHome,
    JIMENG_HOME: cliHome,
  };
  let loginAttempt = null;
  let lastModels = [];
  let closed = false;
  let registryDirectoriesCache = null;

  // Reading the client's answer costs a process start-up. The model catalog is
  // kept on disk too because it needs six help reads and only changes with the
  // installed build; its entry is keyed by the executable that produced it, so a
  // replaced client drops it instead of describing a binary that is gone.
  function executableSignature(executable) {
    try {
      const stat = fs.statSync(executable);
      return `${stat.size}:${Math.round(stat.mtimeMs)}`;
    } catch { return ""; }
  }

  function readPersistedCache(file) {
    try {
      const payload = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!payload || typeof payload !== "object" || !Number.isFinite(Number(payload.ts))) return null;
      return payload;
    } catch { return null; }
  }

  function writePersistedCache(file, payload) {
    try {
      if (!payload) { fs.rmSync(file, { force: true }); return; }
      fs.writeFileSync(file, `${JSON.stringify(payload)}\n`, { mode: 0o600 });
    } catch {}
  }
  // Every CLI command pays the client's own start-up cost, so the two answers
  // that rarely change - the installed version and the last status snapshot -
  // are remembered instead of being re-read on every panel refresh.
  // The catalog survives a host restart: it is read out of six help screens, and
  // it only moves with the installed client build. The entry carries the size and
  // timestamp of the executable it was read from, so a replaced or upgraded
  // client drops it instead of publishing the previous build's models.
  const modelsCacheFile = path.join(cliHome, "models-cache.json");
  let versionCache = null;
  let statusCache = null;
  let modelsCache = readPersistedCache(modelsCacheFile);
  let modelsRefresh = null;

  function configuredPath() {
    const value = settings.getSetting(SETTINGS_KEY);
    return typeof value === "object" && value ? String(value.executablePath || "").trim() : "";
  }

  function bundledPath() {
    const candidates = [
      bundledExecutablePath,
      path.join(bundledDirectory, platform === "win32" ? "dreamina.exe" : "dreamina"),
      process.resourcesPath ? path.join(process.resourcesPath, "dreamina", platform === "win32" ? "dreamina.exe" : "dreamina") : "",
    ].filter(Boolean);
    return candidates.find(isAbsoluteFile) || "";
  }

  function resolveExecutable() {
    // An explicit path always wins. Automated checks point the service at a stub
    // this way, and the bundled client would otherwise shadow it and reach a
    // real, logged-in account.
    for (const variable of ["AI_OS_JIMENG_BIN", "JIMENG_BIN", "DREAMINA_BIN"]) {
      const candidate = String(baseEnv[variable] || "").trim();
      if (candidate && isAbsoluteFile(candidate)) return { executable: path.resolve(candidate), source: variable };
    }
    const bundled = bundledPath();
    if (bundled) return { executable: path.resolve(bundled), source: "bundled" };
    const configured = configuredPath();
    if (configured && isAbsoluteFile(configured)) return { executable: path.resolve(configured), source: "settings" };
    const pathExecutable = findPathExecutable(hostEnv, platform);
    if (pathExecutable) return { executable: pathExecutable, source: "path" };
    // A CLI installed after this host process started is missing from its PATH,
    // so the conventional install locations and the persisted registry PATH are
    // consulted as well.
    for (const candidate of conventionalExecutableCandidates(hostEnv, platform)) {
      if (isAbsoluteFile(candidate)) return { executable: path.resolve(candidate), source: "installed" };
    }
    if (registryDirectoriesCache === null) registryDirectoriesCache = registryPathDirectories(hostEnv, platform, registryPathQuery);
    for (const directory of registryDirectoriesCache) {
      const candidate = path.join(directory, platform === "win32" ? "dreamina.exe" : "dreamina");
      if (isAbsoluteFile(candidate)) return { executable: path.resolve(candidate), source: "registry-path" };
    }
    return null;
  }

  // Every official install writes version.json next to the CLI. It is the only
  // place that carries a semantic version, but the file can also live in the
  // caller's own home when the CLI was installed outside this data directory.
  function installedVersionFiles() {
    const names = [".dreamina_cli", ".jimeng_cli"];
    const roots = [];
    // The isolated locations come first so the CLI's own copy wins, and the real
    // host locations act as a fallback for an install made outside this host.
    for (const value of [cliHome, baseEnv.HOME, baseEnv.USERPROFILE, hostEnv.HOME, hostEnv.USERPROFILE, os.homedir(), hostEnv.LOCALAPPDATA, hostEnv.APPDATA]) {
      const directory = String(value || "").trim();
      if (directory && !roots.includes(directory)) roots.push(directory);
    }
    const files = [];
    for (const directory of roots) {
      for (const name of names) {
        const file = path.join(directory, name, "version.json");
        if (!files.includes(file)) files.push(file);
      }
      const direct = path.join(directory, "version.json");
      if (!files.includes(direct)) files.push(direct);
    }
    return files;
  }

  function versionFromInstalledFile(resolved = null) {
    const bases = [];
    const executable = String(resolved?.executable || "").trim();
    if (executable) {
      const directory = path.dirname(executable);
      bases.push(directory, path.dirname(directory));
    }
    for (const base of bases) {
      for (const candidate of [path.join(base, "version.json"), path.join(base, "dreamina", "version.json")]) {
        let payload;
        try { payload = JSON.parse(fs.readFileSync(candidate, "utf8")); }
        catch { continue; }
        const found = semverFromPayload(payload);
        if (found) return found;
      }
    }
    for (const file of installedVersionFiles()) {
      let payload;
      try { payload = JSON.parse(fs.readFileSync(file, "utf8")); }
      catch { continue; }
      const found = semverFromPayload(payload);
      if (found) return found;
    }
    return "";
  }

  // The CLI keeps its release metadata in "<home>/.dreamina_cli/version.json"
  // and warns about a missing file on every run. This service runs the CLI with
  // an isolated home, so the metadata is mirrored there once it is known.
  function syncInstalledVersionFile() {
    const target = path.join(isolatedHome, ".dreamina_cli", "version.json");
    if (fs.existsSync(target)) return;
    for (const file of installedVersionFiles()) {
      let payload;
      try { payload = JSON.parse(fs.readFileSync(file, "utf8")); }
      catch { continue; }
      if (!semverFromPayload(payload)) continue;
      try {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
      } catch {}
      return;
    }
  }

  function run(resolved, args, { timeoutMs = commandTimeoutMs, signal, classifyFailure } = {}) {
    if (closed) return Promise.reject(safeError("jimeng_cli_closed", "即梦 CLI 服务已关闭。", 503));
    const safeArgs = args.map(value => String(value));
    if (safeArgs.some(value => value.includes("\0"))) return Promise.reject(safeError("jimeng_cli_argument_invalid", "即梦 CLI 参数无效。", 400));
    return new Promise((resolve, reject) => {
      let child;
      let settled = false;
      let stdout = "";
      let stderr = "";
      let size = 0;
      const settle = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener?.("abort", onAbort);
        activeChildren.delete(child);
        callback(value);
      };
      const onAbort = () => {
        try { child?.kill(); } catch {}
        settle(reject, safeError("REQUEST_ABORTED", "即梦任务已取消。", 499));
      };
      const timer = (clock.setTimeout || setTimeout)(() => {
        try { child?.kill(); } catch {}
        settle(reject, safeError("jimeng_cli_timeout", "即梦 CLI 命令执行超时。", 504));
      }, Math.max(1, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));
      try {
        child = spawnImpl(resolved.executable, safeArgs, {
          shell: false,
          windowsHide: true,
          cwd: path.dirname(resolved.executable),
          env: baseEnv,
          stdio: ["ignore", "pipe", "pipe"],
        });
        activeChildren.add(child);
        const collect = (target, chunk) => {
          const text = String(chunk || "");
          size += Buffer.byteLength(text);
          if (size > OUTPUT_LIMIT_BYTES) {
            try { child.kill(); } catch {}
            settle(reject, safeError("jimeng_cli_output_limited", "即梦 CLI 返回内容过大。", 502));
            return;
          }
          if (target === "stdout") stdout += text;
          else stderr += text;
        };
        child.stdout?.on("data", chunk => collect("stdout", chunk));
        child.stderr?.on("data", chunk => collect("stderr", chunk));
        child.once("error", () => settle(reject, safeError("jimeng_cli_runtime_error", "即梦 CLI 无法启动。", 502)));
        child.once("close", (exitCode, signalName) => {
          if (Number(exitCode || 0) !== 0 || signalName) {
            const failure = safeError("jimeng_cli_command_failed", "即梦 CLI 命令未成功完成。", 502);
            // The caller decides what the output means, but only one short token
            // travels back with the error; the raw text stays in this scope.
            if (typeof classifyFailure === "function") {
              try {
                const outcome = String(classifyFailure({ stdout, stderr, exitCode: Number(exitCode || 0) }) || "");
                if (/^(?:pending|denied|expired|success|unknown)$/.test(outcome)) failure.outcome = outcome;
              } catch {}
            }
            settle(reject, failure);
            return;
          }
          settle(resolve, { stdout, stderr });
        });
        if (signal?.aborted) onAbort();
        else signal?.addEventListener?.("abort", onAbort, { once: true });
      } catch {
        settle(reject, safeError("jimeng_cli_runtime_error", "即梦 CLI 无法启动。", 502));
      }
    });
  }

  function snapshot({ state, resolved = null, version = "", signedIn = false, account = "", credits = null, message = "", authUrl = "", userCode = "", loginSource = "" } = {}) {
    return {
      state,
      executable: resolved?.executable || "",
      source: resolved?.source || "",
      version: String(version || ""),
      minimumVersion: MINIMUM_VERSION,
      signedIn: Boolean(signedIn),
      account: safeAccount(account),
      credits: safeCredits(credits),
      models: [...lastModels],
      message: redact(message),
      authUrl: String(authUrl || ""),
      userCode: String(userCode || ""),
      // Where the session comes from. The official CLI keeps its OAuth token in
      // the machine credential store rather than in HOME, so a session started
      // outside this host still authenticates here.
      loginSource: String(loginSource || ""),
      loginHome: resolved && signedIn ? isolatedHome : "",
    };
  }

  function missingSnapshot() {
    return snapshot({ state: "missing", message: configuredPath() ? "已保存的客户端路径不可用。" : "即梦客户端文件缺失，请重新安装或更新 AI OS。" });
  }

  function invalidateStatusCache() {
    statusCache = null;
  }

  function rememberStatus(resolved, value) {
    statusCache = { executable: resolved?.executable || "", ts: Date.now(), value };
    return value;
  }

  // The installer writes its semantic version to version.json next to the
  // client, while "--version" answers with build metadata, so the file is read
  // once and remembered per executable.
  function cachedVersion(resolved) {
    if (!versionCache || versionCache.executable !== resolved.executable) return null;
    if (Date.now() - versionCache.ts >= VERSION_CACHE_TTL_MS) return null;
    // A restored snapshot is only trusted while the binary it describes is the
    // one still installed at that path.
    if (versionCache.signature && versionCache.signature !== executableSignature(resolved.executable)) return null;
    return versionCache;
  }

  function rememberVersion(resolved, described) {
    const previous = versionCache;
    versionCache = { executable: resolved.executable, signature: executableSignature(resolved.executable), ...described, ts: Date.now() };
    // A different client build can rename or add models, so a version change
    // drops the catalog instead of serving it for the rest of its TTL.
    if (previous && previous.display && previous.display !== versionCache.display) {
      modelsCache = null;
      writePersistedCache(modelsCacheFile, null);
    }
  }

  function describeVersion(reported, resolved) {
    // A structured payload is authoritative. Mining raw JSON for a version-like
    // number could pick up a date field, so plain-text output is the only case
    // where the whole reply is searched.
    const reportedPayload = maybeJson(reported);
    const semantic = (reportedPayload ? semverFromPayload(reportedPayload) : versionLabel(reported))
      || versionFromInstalledFile(resolved);
    return { semantic, display: semantic || versionHint(reported) || "unknown" };
  }

  function versionRejection(resolved, described) {
    // A build that does not advertise a semantic version is not treated as
    // outdated: only a version that can be compared and is below the minimum is
    // rejected, so a metadata-only build still works.
    if (!described.semantic || versionAtLeast(described.semantic, MINIMUM_VERSION)) return null;
    return snapshot({
      state: "version-incompatible",
      resolved,
      version: described.display,
      message: `即梦 CLI 版本过低（${described.semantic}），请升级到 ${MINIMUM_VERSION} 或更新版本。`,
    });
  }

  async function versionProbe(resolved) {
    const cached = cachedVersion(resolved);
    if (cached) return cached;
    const result = await run(resolved, ["--version"]);
    const reported = String(result.stdout || "").trim() || String(result.stderr || "").trim();
    const described = describeVersion(reported, resolved);
    syncInstalledVersionFile();
    rememberVersion(resolved, described);
    return versionCache;
  }

  async function compatibleRuntime(resolved = resolveExecutable()) {
    if (!resolved) return { status: missingSnapshot() };
    let described;
    try {
      described = await versionProbe(resolved);
    } catch (error) {
      return { status: snapshot({ state: "runtime-error", resolved, message: error?.safeMessage || "即梦 CLI 状态检查失败。" }) };
    }
    const rejected = versionRejection(resolved, described);
    return rejected ? { status: rejected } : { resolved, version: described.display };
  }

  async function status({ force = false } = {}) {
    const resolved = resolveExecutable();
    if (!resolved) return missingSnapshot();
    // A pending login changes the answer without any local signal, so polling
    // never reads a remembered snapshot.
    const loginPending = loginAttempt?.state === "login-running";
    if (!force && !loginPending && statusCache && statusCache.executable === resolved.executable
      && Date.now() - statusCache.ts < STATUS_TTL_MS) {
      return { ...statusCache.value, models: [...lastModels] };
    }
    const known = cachedVersion(resolved);
    // Each answer needs its own process start, and the two are independent, so
    // they share one wait instead of queuing two CLI start-ups.
    const versionPromise = known
      ? Promise.resolve(known)
      : run(resolved, ["--version"])
        .then(result => describeVersion(String(result.stdout || "").trim() || String(result.stderr || "").trim(), resolved))
        .then(described => { syncInstalledVersionFile(); rememberVersion(resolved, described); return described; })
        .catch(error => ({ error }));
    const creditPromise = run(resolved, ["user_credit"])
      .then(result => ({ payload: maybeJson(result.stdout) || {} }))
      .catch(error => ({ error }));
    const [version, credit] = await Promise.all([versionPromise, creditPromise]);
    if (version.error) {
      return rememberStatus(resolved, snapshot({ state: "runtime-error", resolved, version: known?.display || "", message: version.error?.safeMessage || "即梦 CLI 状态检查失败。" }));
    }
    const rejected = versionRejection(resolved, version);
    if (rejected) return rememberStatus(resolved, rejected);
    if (credit.error) {
      // The official CLI reports a non-zero exit before login. Do not expose its
      // text, because it may contain a browser URL or device-flow material.
      const value = credit.error.code === "jimeng_cli_command_failed"
        ? snapshot({ state: "ready-signed-out", resolved, version: version.display, message: "即梦 CLI 尚未登录。" })
        : snapshot({ state: "runtime-error", resolved, version: version.display, message: credit.error?.safeMessage || "即梦 CLI 状态检查失败。" });
      return rememberStatus(resolved, value);
    }
    const current = credit.payload;
    return rememberStatus(resolved, snapshot({
      state: "ready-signed-in",
      resolved,
      version: version.display,
      signedIn: true,
      account: current?.account || current?.user?.name || current?.username || "",
      credits: current?.total_credit ?? current?.credits ?? current?.credit ?? null,
      // The official CLI stores its OAuth session in the Windows credential
      // store, so a session obtained outside this host is still active here.
      // Saying so keeps the panel honest instead of implying the user logged
      // in through AI OS.
      loginSource: credentialSource(resolved),
    }));
  }

  function setPath(value) {
    const executablePath = validateConfiguredPath(value);
    settings.setSetting(SETTINGS_KEY, { executablePath });
    versionCache = null;
    modelsCache = null;
    invalidateStatusCache();
    return status({ force: true });
  }

  // "login" reuses an existing session, so switching accounts needs the CLI's own
  // "relogin" command: it clears the stored OAuth state first and then always
  // starts a fresh device flow. Probed once because older builds omit it.
  let reloginSupported = null;
  async function supportsRelogin(resolved) {
    if (reloginSupported !== null) return reloginSupported;
    try {
      await run(resolved, ["relogin", "-h"], { timeoutMs: Math.max(commandTimeoutMs, 15_000) });
      reloginSupported = true;
    } catch {
      reloginSupported = false;
    }
    return reloginSupported;
  }

  function unsupportedSwitchMessage(current) {
    return current.signedIn
      ? "当前即梦客户端不支持切换账号，请更新 AI OS 内置客户端后重试。"
      : "当前即梦客户端不支持重新登录，请更新 AI OS 内置客户端后重试。";
  }

  function beginLogin({ resolved, version, force }) {
    const command = force ? "relogin" : "login";
    loginAttempt = { state: "login-running", resolved, version, deviceCode: "", message: "", startedAt: Date.now(), probes: 0 };
    invalidateStatusCache();
    Promise.resolve(run(resolved, [command, "--headless"], { timeoutMs: Math.max(commandTimeoutMs, 60_000) }))
      .then((result) => {
        const material = loginMaterial(result.stdout);
        if (material.deviceCode) {
          loginAttempt = { ...loginAttempt, state: "login-running", resolved, version, ...material, message: "" };
          return;
        }
        // A client that already holds a local OAuth session answers the login
        // command by reusing it rather than starting a device flow. That is a
        // success, so the account is re-read instead of being reported as a
        // failed attempt.
        loginAttempt = null;
        invalidateStatusCache();
        Promise.resolve(status({ force: true })).catch(() => {});
      })
      .catch(error => { loginAttempt = { state: "login-failed", resolved, version, message: error?.safeMessage || "即梦登录未完成。" }; });
    return snapshot({ state: "login-running", resolved, version, message: "正在准备授权，请稍候…" });
  }

  function failLoginAttempt(reason) {
    loginAttempt = {
      state: "login-failed",
      resolved: loginAttempt?.resolved || null,
      version: loginAttempt?.version || "",
      message: reason === "expired" ? "授权已过期，请重新登录。" : "授权被拒绝，请重新登录。",
    };
    return snapshot(loginAttempt);
  }

  // The vendor confirms the device flow before its user-info endpoint settles, so
  // a single retry keeps a successful approval from flashing "未登录".
  async function completeLoginAttempt() {
    loginAttempt = null;
    invalidateStatusCache();
    let current = await status({ force: true }).catch(() => null);
    if (!current?.signedIn) {
      await new Promise(resolve => (clock.setTimeout || setTimeout)(resolve, 600));
      invalidateStatusCache();
      current = await status({ force: true }).catch(() => null) || current;
    }
    return current || snapshot({ state: "ready-signed-out", message: "授权已完成，正在读取账号信息。" });
  }

  async function login({ force = false } = {}) {
    // Starting the device flow does not need the credit probe at all: the client
    // reuses a still valid session and answers without a device code, which is
    // handled as a completed login. Only the cached version probe is needed, so
    // the authorization URL is requested without waiting for user_credit.
    const resolved = resolveExecutable();
    // Switching accounts always needs the CLI's own relogin command, so both
    // probes share one wait rather than running one after the other.
    const switchProbe = force && resolved ? supportsRelogin(resolved) : null;
    const runtime = await compatibleRuntime(resolved);
    if (runtime.status) return runtime.status;
    if (!force) return beginLogin({ resolved, version: runtime.version, force: false });
    // "login" would only confirm the session that is already stored, so switching
    // accounts is impossible without relogin. Saying that plainly beats a generic
    // failure when the installed build predates the command.
    if (!(await switchProbe)) {
      const current = await status();
      return snapshot({ ...current, resolved, message: unsupportedSwitchMessage(current) });
    }
    return beginLogin({ resolved, version: runtime.version, force: true });
  }

  async function relogin() {
    // A second request while the operator is mid-approval must not discard the
    // device code the first one is polling with.
    if (loginAttempt?.state === "login-running") return snapshot(loginAttempt);
    const resolved = resolveExecutable();
    const runtime = await compatibleRuntime(resolved);
    if (runtime.status) return runtime.status;
    if (!(await supportsRelogin(resolved))) {
      const current = await status();
      return snapshot({ ...current, resolved, message: unsupportedSwitchMessage(current) });
    }
    return beginLogin({ resolved, version: runtime.version, force: true });
  }

  async function loginStatus() {
    if (loginAttempt?.state === "login-running" && loginAttempt.deviceCode) {
      const startedAt = Number(loginAttempt.startedAt || 0);
      if (startedAt && Date.now() - startedAt > LOGIN_ATTEMPT_TTL_MS) {
        loginAttempt = {
          state: "login-failed",
          resolved: loginAttempt.resolved,
          version: loginAttempt.version,
          message: "授权等待超时，请重新登录。",
        };
        return snapshot(loginAttempt);
      }
      const probes = Number(loginAttempt.probes || 0) + 1;
      loginAttempt = { ...loginAttempt, probes };
      let outcome = "";
      try {
        const result = await run(
          loginAttempt.resolved,
          ["login", "checklogin", `--device_code=${loginAttempt.deviceCode}`, "--poll=0"],
          {
            timeoutMs: Math.max(commandTimeoutMs, 20_000),
            classifyFailure: ({ stdout, stderr }) => classifyLoginOutput(`${stdout}\n${stderr}`),
          },
        );
        // A zero exit means the device flow completed and the token was stored.
        // The client says so in the machine's own language ("OAuth 登录成功。"),
        // so the exit status is the authoritative signal and the words only
        // refine it.
        outcome = classifyLoginOutput(result.stdout) || "success";
      } catch (error) {
        if (error?.code === "jimeng_cli_command_failed") outcome = String(error.outcome || "");
        else loginAttempt = { state: "login-failed", resolved: loginAttempt.resolved, version: loginAttempt.version, message: error?.safeMessage || "即梦登录状态检查失败。" };
      }
      if (outcome === "denied" || outcome === "expired") return failLoginAttempt(outcome);
      if (outcome === "success") return completeLoginAttempt();
      // A pending approval changes nothing locally, and the token is usually
      // stored by the very poll that reports success. The stored session is still
      // re-read periodically: a client that keeps answering "pending", or fails
      // for a reason this build does not know, must not leave the panel waiting
      // forever after the operator approved the login in the browser.
      if (outcome !== "pending" || probes % 4 === 0) {
        const current = await status({ force: true }).catch(() => null);
        if (current?.signedIn) {
          loginAttempt = null;
          return current;
        }
      }
      return snapshot(loginAttempt);
    }
    if (loginAttempt?.state === "login-running") return snapshot(loginAttempt);
    if (loginAttempt?.state === "login-failed") return snapshot(loginAttempt);
    return status();
  }

  async function logout() {
    const runtime = await compatibleRuntime();
    if (runtime.status) return runtime.status;
    try {
      await run(runtime.resolved, ["logout"]);
      loginAttempt = null;
      invalidateStatusCache();
      return status({ force: true });
    } catch (error) {
      return snapshot({ state: "runtime-error", resolved: runtime.resolved, version: runtime.version, message: error?.safeMessage || "即梦退出登录失败。" });
    }
  }

  // Every model name lives in the CLI's own help text, and each help command is
  // a separate process start. They are read together, once, and remembered until
  // the client build changes.
  async function refreshModels(resolved) {
    const commands = [
      ["text2image", "image"], ["image2image", "image"],
      ["text2video", "video"], ["image2video", "video"],
      ["multimodal2video", "video"], ["frames2video", "video"],
    ];
    const discovered = [];
    await Promise.allSettled(commands.map(async ([command, kind]) => {
      try {
        const result = await run(resolved, [command, "-h"]);
        discovered.push(...modelsFromHelp(result.stdout, kind));
      } catch {
        // A CLI build may omit one optional mode. Continue with the modes it
        // does support instead of failing the whole catalog.
      }
    }));
    return discovered.length ? orderModels([...new Set(discovered)]) : fallbackModels();
  }

  async function models({ force = false } = {}) {
    const resolved = resolveExecutable();
    if (!resolved) throw safeError("jimeng_cli_unavailable", missingSnapshot().message || "即梦 CLI 不可用。", 503);
    const signature = executableSignature(resolved.executable);
    // The catalog is read out of six help screens, which is the most expensive
    // read this service makes, so a remembered one is served before anything is
    // probed. The signature of the client binary is what keeps it honest.
    const remembered = !force && signature && modelsCache
      && modelsCache.executable === resolved.executable
      && modelsCache.signature === signature
      && Array.isArray(modelsCache.models)
      && Date.now() - modelsCache.ts < MODELS_TTL_MS ? modelsCache : null;
    if (remembered) {
      lastModels = [...remembered.models];
      return [...lastModels];
    }
    // Two callers can ask for the catalog at once, and they share a single read.
    const catalogPromise = modelsRefresh && modelsRefresh.executable === resolved.executable
      ? modelsRefresh.promise
      : (() => {
        const promise = refreshModels(resolved)
          .finally(() => { if (modelsRefresh?.promise === promise) modelsRefresh = null; });
        modelsRefresh = { executable: resolved.executable, promise };
        return promise;
      })();
    // The version gate and the six help screens are independent reads, so a cold
    // catalog pays one client start-up's worth of waiting instead of two.
    const runtime = await compatibleRuntime(resolved);
    if (runtime.status) {
      catalogPromise.catch(() => {});
      throw safeError("jimeng_cli_unavailable", runtime.status.message || "即梦 CLI 不可用。", 503);
    }
    const version = runtime.version || cachedVersion(runtime.resolved)?.display || "";
    const discovered = await catalogPromise;
    modelsCache = { executable: runtime.resolved.executable, signature: executableSignature(runtime.resolved.executable), version, ts: Date.now(), models: [...discovered] };
    writePersistedCache(modelsCacheFile, modelsCache);
    lastModels = [...discovered];
    return [...lastModels];
  }

  async function generate(request = {}) {
    const intent = String(request.intent || "").trim();
    if (!["image.generate", "image.edit", "video.generate"].includes(intent)) {
      throw safeError("jimeng_cli_unsupported_intent", "即梦 CLI 不支持此能力。", 400);
    }
    const runtime = await compatibleRuntime();
    if (runtime.status) throw safeError("jimeng_cli_unavailable", runtime.status.message || "即梦 CLI 不可用。", 503);
    const resumeTaskId = String(request.resumeTask?.taskId || request.resumeTask?.task_id || "").trim();
    if (resumeTaskId) {
      try {
        const result = await run(runtime.resolved, ["query_result", `--submit_id=${resumeTaskId}`], { signal: request.signal });
        const payload = parseJson(result.stdout, "jimeng_cli_task_invalid");
        const failure = taskFailureMessage(payload);
        if (failure) throw safeError("jimeng_cli_task_failed", failure, 502);
        const data = outputData(payload);
        const taskId = outputTaskId(payload) || resumeTaskId;
        const progress = taskProgress(payload);
        return { data, ...(taskId ? { task_id: taskId } : {}), ...(progress ? { progress } : {}) };
      } catch (error) {
        if (error?.code === "REQUEST_ABORTED" || error?.code === "jimeng_cli_task_failed") throw error;
        throw Object.assign(safeError("jimeng_cli_query_failed", "即梦任务查询暂时失败，将自动重试。", 502), { retryable: true });
      }
    }
    const modelId = String(request.modelId || "").trim();
    const prompt = String(request.prompt || "").trim();
    if (!modelId || !prompt) throw safeError("jimeng_cli_request_invalid", "即梦模型和提示词不能为空。", 400);
    // The catalog publishes an image model as "jimeng-5.0Pro" while the CLI only
    // accepts the bare version, so the stored id is translated back here. A video
    // model keeps its Seedance name, which the CLI already understands.
    const video = intent === "video.generate";
    const cliModelId = video ? modelId : (cliImageModelVersion(modelId) || modelId);
    const references = referenceFiles(cliHome, request.references);
    try {
      if (intent === "image.edit" && !references.length) {
        throw safeError("jimeng_cli_request_invalid", "图片编辑需要至少一张参考图片。", 400);
      }
      const args = video
        ? (references.length ? ["image2video", `--image=${references[0]}`] : ["text2video"])
        : (references.length ? ["image2image", `--images=${references.join(",")}`] : ["text2image"]);
      args.push(`--prompt=${prompt}`);
      const params = request.params && typeof request.params === "object" ? request.params : {};
      const ratio = String(params.ratio || params.size || "").trim();
      // seedance2.5 rejects an explicit ratio when it follows a reference frame.
      const omitRatio = video && references.length > 0 && /^seedance2\.5$/i.test(modelId);
      if (ratio && !omitRatio) args.push(`--ratio=${ratio}`);
      // The CLI validates the quality flag strictly and uses a different name
      // per mode: images take --resolution_type (1k/1.5k/2k/4k) while videos
      // take --video_resolution (480p/720p/1080p/4k). Both are required.
      const requestedQuality = params.resolution_type || params.video_resolution
        || params.resolution || params.imageSize || params.image_size || "";
      const quality = video
        ? videoResolutionArgs(requestedQuality) || DEFAULT_VIDEO_RESOLUTION
        : imageResolutionArgs(requestedQuality, cliModelId) || defaultImageResolution(cliModelId);
      args.push(video ? `--video_resolution=${quality}` : `--resolution_type=${quality}`);
      if (video && params.duration !== undefined && params.duration !== null && String(params.duration).trim()) {
        args.push(`--duration=${String(params.duration).trim()}`);
      }
      if (cliModelId) args.push(`--model_version=${cliModelId}`);
      args.push("--poll=0");
      const result = await run(runtime.resolved, args, { signal: request.signal });
      const payload = parseJson(result.stdout, "jimeng_cli_generate_invalid");
      const taskId = outputTaskId(payload);
      if (taskId) await request.onTaskSubmitted?.({ protocol: "cli:jimeng", providerId: String(request.providerId || ""), modelId: String(request.publicModelId || modelId), baseUrl: "", taskId });
      const progress = taskProgress(payload);
      return { data: outputData(payload), ...(taskId ? { task_id: taskId } : {}), ...(progress ? { progress } : {}) };
    } finally {
      removeFiles(references);
    }
  }

  function close() {
    closed = true;
    for (const child of activeChildren) {
      try { child.kill(); } catch {}
    }
    activeChildren.clear();
  }

  return Object.freeze({ status, setPath, login, relogin, loginStatus, logout, models, generate, close });
}

module.exports = { MINIMUM_VERSION, createJimengCliService };
