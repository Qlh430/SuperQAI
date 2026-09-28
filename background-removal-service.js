"use strict";

// AI OS 本地 AI 抠图服务。
//
// 与 ComfyUI 抠图并存的两条路线之一：不依赖显卡与 ComfyUI，直接用 ONNX Runtime
// 在 CPU 上跑前景分割模型，输出带透明通道的 PNG。算法移植自 DX OS 的 background-removal
// 实现（BEN2 Base / 1024 定尺 / NCHW 归一化 / min-max 拉伸），并补上 AI OS 需要的
// 缓存、本地导入与设置项。权重随应用内置分发（assets/models/background-removal），
// 开箱即用，不需要下载。

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const DEFAULT_MODEL_ID = "ben2-base";
// 内置权重目录：assets 已随便携包一起分发，所以这里放一份就能开箱即用。
const BUNDLED_MODEL_DIRECTORY = path.join("assets", "models", "background-removal");
const MODEL_STORE_DIRECTORY = path.join("models", "background-removal");
const RUNTIME_PROBE_TIMEOUT_MS = 15000;
const UPSTREAM_TIMEOUT_MS = 20000;
const UPDATE_TIMEOUT_MS = 30 * 60 * 1000;
const UPSTREAM_CACHE_TTL_MS = 10 * 60 * 1000;
const UPSTREAM_RECORD_FILE = "upstream.json";
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX_ENTRIES = 6;
const CACHE_MAX_BYTES = 192 * 1024 * 1024;

const DEFAULT_SUBJECT_SETTINGS = Object.freeze({ background: 18, foreground: 78, edge: 2, feather: 8, opacity: 100 });
const DEFAULT_EFFECT_SETTINGS = Object.freeze({ low: 6, high: 190, feather: 18, spill: 86, invert: false, opacity: 100 });

// BEN2 Base 是当前唯一经过验证的前景分割模型。出厂 sha256 / size 与官方发布完全一致，
// 只有能对上「出厂值 / 上游最新值 / 本地下载记录」三者之一的文件才会被当成可用模型。
const MODEL_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: DEFAULT_MODEL_ID,
    name: "BEN2 Base",
    description: "通用前景分割模型，人物、商品、动物都能抠，纯 CPU 运行。",
    version: "1.0.0",
    size: 222932053,
    sha256: "22cea62108ff53b7ccc20f7a008bf30494228d84b1687f29ecbe76936a998101",
    fileName: "ben2-base-1.0.0.onnx",
    // 上游出处：Prama LLC 的 BEN2（MIT）。更新检查与下载都走这里，可用环境变量换成镜像。
    upstream: Object.freeze({
      repository: "PramaLLC/BEN2",
      license: "MIT",
      fileName: "BEN2_Base.onnx",
      apiUrl: "https://huggingface.co/api/models/PramaLLC/BEN2/tree/main",
      metaUrl: "https://huggingface.co/api/models/PramaLLC/BEN2",
      downloadUrl: "https://huggingface.co/PramaLLC/BEN2/resolve/main/BEN2_Base.onnx",
    }),
    input: Object.freeze({ width: 1024, height: 1024, normalize: "zero-one", sigmoid: false, dtype: "float32" }),
  }),
]);

function modelDefinition(modelId) {
  const id = String(modelId || DEFAULT_MODEL_ID).trim() || DEFAULT_MODEL_ID;
  return MODEL_DEFINITIONS.find((item) => item.id === id) || null;
}

function clamp01(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / Math.max(1e-4, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function normalizeNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeSubjectSettings(input = {}) {
  const defaultOpacity = input.opacity ?? DEFAULT_SUBJECT_SETTINGS.opacity;
  return {
    background: normalizeNumber(input.background, DEFAULT_SUBJECT_SETTINGS.background, 0, 98),
    foreground: normalizeNumber(input.foreground, DEFAULT_SUBJECT_SETTINGS.foreground, 1, 100),
    edge: normalizeNumber(input.edge, DEFAULT_SUBJECT_SETTINGS.edge, -50, 50),
    feather: normalizeNumber(input.feather, DEFAULT_SUBJECT_SETTINGS.feather, 0, 100),
    opacity: normalizeNumber(defaultOpacity, DEFAULT_SUBJECT_SETTINGS.opacity, 0, 100),
  };
}

function normalizeEffectSettings(input = {}) {
  return {
    low: normalizeNumber(input.low, DEFAULT_EFFECT_SETTINGS.low, 0, 254),
    high: normalizeNumber(input.high, DEFAULT_EFFECT_SETTINGS.high, 1, 255),
    feather: normalizeNumber(input.feather, DEFAULT_EFFECT_SETTINGS.feather, 0, 100),
    spill: normalizeNumber(input.spill, DEFAULT_EFFECT_SETTINGS.spill, 0, 100),
    invert: Boolean(input.invert),
    opacity: normalizeNumber(input.opacity ?? DEFAULT_EFFECT_SETTINGS.opacity, DEFAULT_EFFECT_SETTINGS.opacity, 0, 100),
  };
}

// NCHW 浮点张量：与 DX OS 一致，imagenet 归一化或 0-1 归一化二选一。
function buildInputTensor(rgb, model) {
  const width = model.input.width;
  const height = model.input.height;
  const pixels = width * height;
  const normalize = model.input.normalize === "imagenet" ? "imagenet" : "zero-one";
  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];
  const useFloat16 = String(model.input.dtype || "float32").toLowerCase() === "float16";
  const data = useFloat16 ? new Uint16Array(pixels * 3) : new Float32Array(pixels * 3);
  for (let index = 0; index < pixels; index += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      const value = rgb[index * 3 + channel] / 255;
      const scaled = normalize === "imagenet" ? (value - mean[channel]) / std[channel] : value;
      data[channel * pixels + index] = useFloat16 ? floatToHalfBits(scaled) : scaled;
    }
  }
  return { data, dtype: useFloat16 ? "float16" : "float32" };
}

// float32 → float16 位模式（IEEE 754 半精度），用于极少数以 float16 为输入的模型。
function floatToHalfBits(value) {
  const buffer = new ArrayBuffer(4);
  const f32 = new Float32Array(buffer);
  const u32 = new Uint32Array(buffer);
  f32[0] = value;
  const bits = u32[0];
  const sign = (bits >>> 31) & 1;
  const exponent = (bits >>> 23) & 0xff;
  const mantissa = bits & 0x7fffff;
  if (exponent === 0xff) return (sign << 15) | 0x7c00 | (mantissa ? 0x200 : 0);
  if (exponent === 0) return sign << 15;
  const shifted = exponent - 127 + 15;
  if (shifted >= 0x1f) return (sign << 15) | 0x7c00;
  if (shifted <= 0) {
    if (shifted < -10) return sign << 15;
    const normalized = (mantissa | 0x800000) >>> (1 - shifted);
    return (sign << 15) | (normalized >> 13);
  }
  return (sign << 15) | (shifted << 10) | (mantissa >> 13);
}

// float16 位模式 → 数值。
function halfBitsToFloat(bits) {
  const sign = (bits & 0x8000) >> 15;
  const exponent = (bits & 0x7c00) >> 10;
  const fraction = bits & 0x03ff;
  if (exponent === 0) return (sign ? -1 : 1) * Math.pow(2, -14) * (fraction / 1024);
  if (exponent === 0x1f) return fraction ? NaN : (sign ? -Infinity : Infinity);
  return (sign ? -1 : 1) * Math.pow(2, exponent - 15) * (1 + fraction / 1024);
}

// 模型输出解码：onnxruntime 返回 float16 时数据可能是 Float16Array 或 Uint16Array 位模式。
function decodeModelOutput(values, dtype) {
  if (dtype === "float16") {
    if (values instanceof Uint16Array) {
      const decoded = new Float32Array(values.length);
      for (let index = 0; index < values.length; index += 1) decoded[index] = halfBitsToFloat(values[index]);
      return decoded;
    }
    if (typeof Float16Array === "function" && values instanceof Float16Array) return Float32Array.from(values);
  }
  if (values instanceof Float32Array) return values;
  return Float32Array.from(values);
}

// onnxruntime-node 1.20 的原生层用 Uint16Array 承载 float16，而 Node 24 起
// onnxruntime-common 会优先要求 Float16Array，导致推理结果转换直接抛错。
// 这里把映射改回 Uint16Array，由 decodeModelOutput 自行解析半精度位模式。
function installFloat16Compatibility() {
  if (typeof Float16Array !== "function") return false;
  try {
    const mappingPath = path.join(path.dirname(require.resolve("onnxruntime-common")), "tensor-impl-type-mapping.js");
    const mapping = require(mappingPath);
    mapping.checkTypedArray?.();
    const map = mapping.NUMERIC_TENSOR_TYPE_TO_TYPEDARRAY_MAP;
    if (map?.get?.("float16") === Float16Array) {
      map.set("float16", Uint16Array);
      return true;
    }
  } catch {}
  return false;
}

// 模型输出归一化为 0-255 的单通道掩膜，先做可选的 sigmoid，再做 min-max 拉伸。
function buildMaskBytes(values, options = {}) {
  const total = values.length;
  const scaled = new Float32Array(total);
  const useSigmoid = Boolean(options.sigmoid);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < total; index += 1) {
    const raw = Number(values[index]) || 0;
    const value = useSigmoid ? 1 / (1 + Math.exp(-raw)) : raw;
    scaled[index] = value;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const span = Number.isFinite(min) && Number.isFinite(max) ? max - min : 0;
  const mask = Buffer.allocUnsafe(total);
  for (let index = 0; index < total; index += 1) {
    const normalized = span > 1e-6 ? (scaled[index] - min) / span : 0;
    mask[index] = Math.max(0, Math.min(255, Math.round(normalized * 255)));
  }
  return mask;
}

// 主体模式：把粗掩膜经 smoothstep 阈值重映射成干净边缘，再按羽化强度混回原始灰度。
function refineSubjectAlpha(mask, settings = {}) {
  const config = normalizeSubjectSettings(settings);
  const low = Math.min(config.foreground - 1, config.background) / 100;
  const high = Math.max(config.background + 1, config.foreground) / 100;
  const shrink = config.edge / 100;
  const feather = config.feather / 100;
  const out = Buffer.allocUnsafe(mask.length);
  for (let index = 0; index < mask.length; index += 1) {
    const source = mask[index] / 255;
    let alpha = smoothstep(low, high, clamp01(source - shrink));
    if (feather > 0) alpha = alpha * (1 - feather * 0.7) + source * feather * 0.7;
    out[index] = Math.round(clamp01(alpha) * 255);
  }
  return out;
}

// 四边采样平均背景色，用于特效模式的颜色键控。
function sampleBorderColor(rgba, width, height) {
  const step = Math.max(1, Math.floor(Math.min(width, height) / 160));
  let r = 0, g = 0, b = 0, weight = 0;
  const sample = (x, y) => {
    const index = (y * width + x) * 4;
    const alpha = rgba[index + 3] / 255;
    r += rgba[index] * alpha;
    g += rgba[index + 1] * alpha;
    b += rgba[index + 2] * alpha;
    weight += alpha;
  };
  for (let x = 0; x < width; x += step) {
    sample(x, 0);
    sample(x, height - 1);
  }
  for (let y = 0; y < height; y += step) {
    sample(0, y);
    sample(width - 1, y);
  }
  if (!weight) return { r: 255, g: 255, b: 255 };
  return { r: r / weight, g: g / weight, b: b / weight };
}

// 特效模式：不用 AI 结果，直接按「与背景色的色距 / 亮度」键控，适合纯色背景素材。
function computeEffectAlpha(rgba, width, height, settings = {}, background) {
  const config = normalizeEffectSettings(settings);
  const key = background || sampleBorderColor(rgba, width, height);
  const luminance = key.r * 0.2126 + key.g * 0.7152 + key.b * 0.0722;
  const dark = luminance < 56;
  const bright = luminance > 205;
  const lowByte = Math.min(config.low, config.high - 1);
  const highByte = Math.max(config.low + 1, config.high);
  const lowValue = lowByte / 255;
  const highValue = highByte / 255;
  const feather = config.feather / 100;
  const alpha = Buffer.allocUnsafe(width * height);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const index = pixel * 4;
    const r = rgba[index], g = rgba[index + 1], b = rgba[index + 2];
    const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
    const distance = Math.sqrt((r - key.r) ** 2 + (g - key.g) ** 2 + (b - key.b) ** 2) / 441.7;
    let value = dark
      ? smoothstep(lowByte, highByte, luma)
      : bright
      ? smoothstep(lowByte, highByte, 255 - luma)
      : smoothstep(lowValue, highValue, distance);
    if (feather > 0) value = value * (1 - feather * 0.22) + Math.sqrt(Math.max(0, value)) * feather * 0.22;
    if (config.invert) value = 1 - value;
    alpha[pixel] = Math.round(clamp01(value) * 255);
  }
  return { alpha, background: key, settings: config };
}

// 复刻特效模式的去溢色：按 alpha 反推该像素的有效占比，压掉背景色残留。
function applyEffectSpill(rgba, alpha, background, settings) {
  const config = settings || normalizeEffectSettings({});
  const spill = config.spill / 100;
  const divisor = Math.min(0.999, Math.max(0.12, spill + (1 - spill) * 0.88));
  const luminance = background.r * 0.2126 + background.g * 0.7152 + background.b * 0.0722;
  const inverse = spill > 0.5 && luminance > 205;
  const adjust = (value) => {
    const adjusted = inverse ? 255 - (255 - value) / divisor : value / divisor;
    return Math.max(0, Math.min(255, Math.round(adjusted)));
  };
  for (let pixel = 0; pixel < alpha.length; pixel += 1) {
    const index = pixel * 4;
    rgba[index] = adjust(rgba[index]);
    rgba[index + 1] = adjust(rgba[index + 1]);
    rgba[index + 2] = adjust(rgba[index + 2]);
  }
  return rgba;
}

function writeAlpha(rgba, alpha, opacityPercent = 100) {
  const opacity = clamp01(Number(opacityPercent) / 100);
  for (let pixel = 0; pixel < alpha.length; pixel += 1) {
    const index = pixel * 4;
    rgba[index + 3] = Math.round(clamp01((alpha[pixel] / 255) * opacity) * 255);
  }
  return rgba;
}

// sharp 的 resize 会把手上的单通道 raw 图提升成 sRGB 三通道，掩膜必须显式压回单通道，
// 否则 alpha 长度会变成 3 倍，写入 RGBA 时整张图会错位。
async function resizeMaskToAlpha(sharp, maskBytes, fromWidth, fromHeight, toWidth, toHeight) {
  const resized = await sharp(maskBytes, { raw: { width: fromWidth, height: fromHeight, channels: 1 } })
    .resize(toWidth, toHeight, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .toColourspace("b-w")
    .raw()
    .toBuffer();
  const expected = toWidth * toHeight;
  if (resized.length === expected) return resized;
  if (resized.length === expected * 3) {
    const compact = Buffer.allocUnsafe(expected);
    for (let index = 0; index < expected; index += 1) compact[index] = resized[index * 3];
    return compact;
  }
  throw Object.assign(new Error("抠图掩膜尺寸异常，请重新运行。"), { code: "mask_size_mismatch" });
}

function countCoverage(alpha) {
  let opaque = 0;
  let clear = 0;
  for (let index = 0; index < alpha.length; index += 1) {
    if (alpha[index] >= 250) opaque += 1;
    else if (alpha[index] <= 5) clear += 1;
  }
  const total = Math.max(1, alpha.length);
  return {
    opaqueRatio: Number((opaque / total).toFixed(4)),
    clearRatio: Number((clear / total).toFixed(4)),
  };
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function createBackgroundRemovalService(options = {}) {
  const dataDir = options.dataDir ? path.resolve(options.dataDir) : "";
  if (!dataDir) throw new TypeError("Background removal service requires a data directory.");
  const sharp = options.sharp || require("sharp");
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  // 内置权重跟着应用走。允许用环境变量改指向，方便便携包换位置或测试模拟“内置缺失”。
  const bundledDirectory = path.resolve(
    String(options.bundledModelDir || process.env.AI_OS_BACKGROUND_REMOVAL_BUNDLED_DIR || path.join(__dirname, BUNDLED_MODEL_DIRECTORY)),
  );
  // 允许直接复用本机已有的权重文件（例如 DX OS 目录里的那份），不必再复制 200 多兆。
  const externalModelRaw = String(options.modelPath || process.env.AI_OS_BACKGROUND_REMOVAL_MODEL_PATH || "").trim();
  const externalModelPath = externalModelRaw ? path.resolve(externalModelRaw) : "";
  const runtimeLoader = options.runtimeLoader || defaultRuntimeLoader;
  const storeDirectory = path.join(dataDir, MODEL_STORE_DIRECTORY);

  let runtimePromise = null;
  let upstreamCache = { id: "", at: 0, value: null };
  const sessionCache = new Map();
  const preparedCache = new Map();
  // 权重有 213MB，校验要整份读出来算 sha256。按路径 + 大小 + mtime 记住结果，
  // 避免每次 prepare 都重算一遍。
  const verifiedFiles = new Map();
  let preparedBytes = 0;

  function ensureStore() {
    fs.mkdirSync(storeDirectory, { recursive: true });
    return storeDirectory;
  }

  function modelFilePath(definition) {
    return path.join(storeDirectory, definition.fileName);
  }

  // 应用自带的权重：只读，不往数据目录里复制副本。
  function bundledModelFile(definition) {
    try {
      const file = path.join(bundledDirectory, definition.fileName);
      return fs.existsSync(file) && fs.statSync(file).isFile() ? file : "";
    } catch {
      return "";
    }
  }

  // 只用于“读取”：外部权重存在时优先用它，写入仍然落在 AI OS 自己的模型目录。
  function externalModelFile(definition) {
    if (!externalModelPath) return "";
    try {
      const file = fs.statSync(externalModelPath).isDirectory() ? path.join(externalModelPath, definition.fileName) : externalModelPath;
      return fs.existsSync(file) && fs.statSync(file).isFile() ? file : "";
    } catch {
      return "";
    }
  }

  function readableModelFile(definition) {
    return externalModelFile(definition) || storedModelFile(definition) || bundledModelFile(definition);
  }

  // 下载/导入到数据目录的权重。用户主动更新过就以它为准，内置那份退居兜底。
  function storedModelFile(definition) {
    try {
      const file = modelFilePath(definition);
      return fs.existsSync(file) && fs.statSync(file).isFile() ? file : "";
    } catch {
      return "";
    }
  }

  function metadataFilePath(definition) {
    return path.join(storeDirectory, `${definition.id}-${definition.version}.json`);
  }

  function readInstalledMetadata(definition) {
    try {
      const parsed = JSON.parse(fs.readFileSync(metadataFilePath(definition), "utf8"));
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  function upstreamRecordPath(definition) {
    return path.join(storeDirectory, `${definition.id}-${UPSTREAM_RECORD_FILE}`);
  }

  // 上游最后一次查到的版本信息落盘保存，这样离线时也能校验“这是官方发布过的版本”。
  function readUpstreamRecord(definition) {
    try {
      const parsed = JSON.parse(fs.readFileSync(upstreamRecordPath(definition), "utf8"));
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  function writeUpstreamRecord(definition, record) {
    try {
      ensureStore();
      fs.writeFileSync(upstreamRecordPath(definition), JSON.stringify(record, null, 2));
    } catch {
      /* 记录写不进去不影响下载本身 */
    }
  }

  // 可以通过校验的版本清单：本地下载记录 → 出厂内置值 → 上游最新值。
  function verificationCandidates(definition, metadata) {
    const list = [];
    const push = (size, hash, label) => {
      const normalized = String(hash || "").toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(normalized) || list.some((item) => item.sha256 === normalized)) return;
      list.push({ size: Number(size) || 0, sha256: normalized, label });
    };
    push(metadata?.size, metadata?.sha256, "local");
    push(definition.size, definition.sha256, "bundled");
    const upstream = readUpstreamRecord(definition);
    push(upstream?.size, upstream?.sha256, "upstream");
    return list;
  }

  function verifyFile(file, definition, metadata) {
    const stats = fs.statSync(file);
    const candidates = verificationCandidates(definition, metadata);
    const sizeMatched = candidates.filter((item) => !item.size || item.size === stats.size);
    if (!sizeMatched.length) {
      verifiedFiles.delete(file);
      const known = candidates.map((item) => item.size).filter(Boolean).join(" / ");
      return { ok: false, code: "model_size_mismatch", message: `模型文件大小不符：当前 ${stats.size} 字节，已知版本为 ${known || "未知"} 字节。` };
    }
    const key = `${stats.size}:${stats.mtimeMs}:${sizeMatched.map((item) => item.sha256).join(",")}`;
    const cached = verifiedFiles.get(file);
    if (cached?.key === key) return cached.result;
    const actual = sha256(fs.readFileSync(file));
    const hit = sizeMatched.find((item) => item.sha256 === actual);
    const result = hit
      ? { ok: true, sha256: actual, matched: hit.label }
      : { ok: false, code: "model_hash_mismatch", message: "模型文件校验失败：它既不是随应用内置的版本，也不是上游官方发布过的版本，请到「设置 → 本地模型」重新检查更新。" };
    verifiedFiles.set(file, { key, result });
    return result;
  }

  function modelStatus(definition) {
    const external = externalModelFile(definition);
    const stored = storedModelFile(definition);
    const bundled = bundledModelFile(definition);
    const file = external || stored || bundled || modelFilePath(definition);
    const metadata = file === modelFilePath(definition) || file === stored ? readInstalledMetadata(definition) : null;
    const installed = fs.existsSync(file);
    const stats = installed ? fs.statSync(file) : null;
    const verification = installed ? verifyFile(file, definition, metadata) : { ok: false, code: "model_missing" };
    const active = !installed ? null
      : file === external ? "external"
        : file === stored ? (metadata?.origin === "update" ? "update" : "import")
          : "bundled";
    const upstream = readUpstreamRecord(definition);
    return {
      id: definition.id,
      name: definition.name,
      description: definition.description,
      version: definition.version,
      size: stats?.size ?? definition.size,
      installed: installed && verification.ok,
      downloadedAt: metadata?.downloadedAt || null,
      source: active,
      origin: metadata?.origin || null,
      sha256: verification.ok ? verification.sha256 : null,
      sourceUrl: metadata?.source || null,
      bundled: Boolean(bundled),
      bundledAvailable: Boolean(bundled),
      stored: Boolean(stored),
      external: Boolean(external),
      upstreamRepository: definition.upstream?.repository || "",
      upstreamLicense: definition.upstream?.license || "",
      upstream: upstream || null,
      error: verification.ok || verification.code === "model_missing" ? null : verification.message,
    };
  }

  function listModels() {
    return MODEL_DEFINITIONS.map(modelStatus);
  }

  function requireModel(modelId) {
    const definition = modelDefinition(modelId);
    if (!definition) {
      throw Object.assign(new Error(`不支持的抠图模型：${modelId || "(空)"}。`), { code: "unsupported_model", statusCode: 400 });
    }
    if (!modelStatus(definition).installed) {
      throw Object.assign(new Error(`抠图模型 ${definition.name} 不可用：内置权重缺失或被改动。请到「设置 → 本地模型」重新检查更新，或导入一份官方权重。`), { code: "model_not_installed", statusCode: 409 });
    }
    return definition;
  }

  function requireDefinition(modelId) {
    const definition = modelDefinition(modelId);
    if (!definition) {
      throw Object.assign(new Error(`不支持的抠图模型：${modelId || "(空)"}。`), { code: "unsupported_model", statusCode: 400 });
    }
    return definition;
  }

  function writeLocalMetadata(definition, metadata) {
    ensureStore();
    fs.writeFileSync(metadataFilePath(definition), JSON.stringify(metadata, null, 2));
  }

  // 兜底路径：内置权重缺失或被改动时，把本机的 BEN2 ONNX 权重复制进数据目录。
  // 只有官方内置版本或上游发布过的版本才能导入，避免来源不明的权重被当成可用模型。
  async function importModelFile(sourcePath, modelId = DEFAULT_MODEL_ID) {
    const definition = requireDefinition(modelId);
    const source = path.resolve(String(sourcePath || ""));
    if (!source || !fs.existsSync(source) || !fs.statSync(source).isFile()) {
      throw Object.assign(new Error("找不到要导入的模型文件。"), { code: "model_source_missing", statusCode: 400 });
    }
    ensureStore();
    const target = modelFilePath(definition);
    const temporary = `${target}.import`;
    await fs.promises.copyFile(source, temporary);
    const verification = verifyFile(temporary, definition);
    if (!verification.ok) {
      fs.rmSync(temporary, { force: true });
      const message = verification.code === "model_hash_mismatch"
        ? "这个权重文件不是随应用内置的版本，也不是上游官方发布过的版本。如果上游刚更新，请先在「设置 → 本地模型」点一次「检查更新」。"
        : verification.message;
      throw Object.assign(new Error(message), { code: verification.code, statusCode: 400 });
    }
    fs.renameSync(temporary, target);
    verifiedFiles.delete(target);
    writeLocalMetadata(definition, {
      version: definition.version,
      sha256: verification.sha256,
      size: fs.statSync(target).size,
      source: "import",
      origin: "import",
      downloadedAt: new Date(now()).toISOString(),
    });
    sessionCache.clear();
    return modelStatus(definition);
  }

  function upstreamUrls(definition) {
    return {
      apiUrl: String(process.env.AI_OS_BACKGROUND_REMOVAL_UPSTREAM_URL || definition.upstream.apiUrl).trim(),
      metaUrl: String(process.env.AI_OS_BACKGROUND_REMOVAL_UPSTREAM_META_URL || definition.upstream.metaUrl).trim(),
      downloadUrl: String(process.env.AI_OS_BACKGROUND_REMOVAL_DOWNLOAD_URL || definition.upstream.downloadUrl).trim(),
    };
  }

  function requireFetch() {
    if (typeof fetchImpl !== "function") {
      throw Object.assign(new Error("当前运行环境不支持联网检查更新。"), { code: "upstream_unavailable", statusCode: 400 });
    }
    return fetchImpl;
  }

  // 读取上游官方发布信息。用发布源给出的 sha256 作为版本标识，比自造版本号更可靠。
  async function fetchUpstream(definition) {
    const fetchFn = requireFetch();
    const urls = upstreamUrls(definition);
    let response;
    try {
      response = await fetchFn(urls.apiUrl, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    } catch (error) {
      throw Object.assign(new Error(`连不上模型发布源（${definition.upstream.repository}）：${error.message}`), { code: "upstream_unreachable", statusCode: 502 });
    }
    if (!response.ok) {
      throw Object.assign(new Error(`模型发布源返回 HTTP ${response.status}。`), { code: "upstream_unreachable", statusCode: 502 });
    }
    const tree = await response.json().catch(() => null);
    const entry = Array.isArray(tree) ? tree.find((item) => item?.path === definition.upstream.fileName) : null;
    const sha = String(entry?.lfs?.oid || entry?.oid || "").toLowerCase();
    const size = Number(entry?.lfs?.size || entry?.size) || 0;
    if (!entry || !/^[a-f0-9]{64}$/.test(sha) || size <= 0) {
      throw Object.assign(new Error("发布源里没有找到可用的权重文件。"), { code: "upstream_invalid", statusCode: 502 });
    }
    let revision = "";
    let publishedAt = "";
    try {
      const metaResponse = await fetchFn(urls.metaUrl, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
      if (metaResponse.ok) {
        const meta = await metaResponse.json();
        revision = String(meta?.sha || "");
        publishedAt = String(meta?.lastModified || "");
      }
    } catch {
      /* 拿不到发布/提交时间不影响更新检查 */
    }
    return {
      repository: definition.upstream.repository,
      fileName: definition.upstream.fileName,
      sha256: sha,
      size,
      downloadUrl: urls.downloadUrl,
      revision,
      publishedAt,
      checkedAt: new Date(now()).toISOString(),
    };
  }

  // 上游信息带缓存，避免每点一次按钮都去打发布源。
  async function upstreamRecord(definition, { force = false } = {}) {
    const cached = upstreamCache.value;
    if (!force && cached && upstreamCache.id === definition.id && now() - upstreamCache.at < UPSTREAM_CACHE_TTL_MS) return cached;
    const value = await fetchUpstream(definition);
    writeUpstreamRecord(definition, value);
    upstreamCache = { id: definition.id, at: now(), value };
    return value;
  }

  async function checkForUpdate(modelId = DEFAULT_MODEL_ID) {
    const definition = requireDefinition(modelId);
    const remote = await upstreamRecord(definition, { force: true });
    const model = modelStatus(definition);
    return { model, remote, updateAvailable: model.sha256 !== remote.sha256 };
  }

  // 下载上游最新权重到数据目录。校验不过就整份丢弃，绝不留下半截文件。
  async function downloadUpdate(modelId = DEFAULT_MODEL_ID, { onProgress } = {}) {
    const definition = requireDefinition(modelId);
    const remote = await upstreamRecord(definition);
    const fetchFn = requireFetch();
    ensureStore();
    const target = modelFilePath(definition);
    const temporary = `${target}.update`;
    const total = remote.size || definition.size;
    onProgress?.({ phase: "downloading", received: 0, total });
    try {
      const response = await fetchFn(remote.downloadUrl, { redirect: "follow", signal: AbortSignal.timeout(UPDATE_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const handle = await fs.promises.open(temporary, "w");
      let received = 0;
      try {
        for await (const chunk of response.body) {
          await handle.write(chunk);
          received += chunk.length;
          onProgress?.({ phase: "downloading", received, total });
        }
      } finally {
        await handle.close();
      }
      const stats = fs.statSync(temporary);
      if (remote.size && stats.size !== remote.size) {
        throw Object.assign(new Error(`下载不完整：${stats.size} / ${remote.size} 字节。`), { code: "model_size_mismatch" });
      }
      const actual = sha256(fs.readFileSync(temporary));
      if (actual !== remote.sha256) {
        throw Object.assign(new Error("下载的权重与发布源校验值不一致，已丢弃。"), { code: "model_hash_mismatch" });
      }
      fs.renameSync(temporary, target);
      verifiedFiles.delete(target);
      writeLocalMetadata(definition, {
        version: definition.version,
        sha256: actual,
        size: stats.size,
        source: remote.downloadUrl,
        origin: "update",
        revision: remote.revision,
        publishedAt: remote.publishedAt,
        downloadedAt: new Date(now()).toISOString(),
      });
      sessionCache.clear();
      onProgress?.({ phase: "done", received, total });
      return { model: modelStatus(definition), remote };
    } catch (error) {
      fs.rmSync(temporary, { force: true });
      throw Object.assign(new Error(`模型更新失败：${error.message}`), { code: error.code || "model_download_failed", statusCode: error.statusCode || 400 });
    }
  }

  // 删掉数据目录里的更新/导入副本，回落到随应用内置的那份。
  function removeStoredModel(modelId = DEFAULT_MODEL_ID) {
    const definition = requireDefinition(modelId);
    const file = modelFilePath(definition);
    const removed = fs.existsSync(file);
    fs.rmSync(file, { force: true });
    fs.rmSync(`${file}.update`, { force: true });
    fs.rmSync(`${file}.import`, { force: true });
    fs.rmSync(metadataFilePath(definition), { force: true });
    verifiedFiles.delete(file);
    sessionCache.clear();
    return { removed, model: modelStatus(definition) };
  }

  async function loadRuntime() {
    if (!runtimePromise) {
      runtimePromise = (async () => {
        installFloat16Compatibility();
        const runtime = await runtimeLoader();
        const Api = runtime?.InferenceSession ? runtime : runtime?.default;
        if (!Api?.InferenceSession || !Api?.Tensor) {
          throw new Error("onnxruntime-node 缺少 InferenceSession");
        }
        return Api;
      })().catch((error) => {
        runtimePromise = null;
        throw Object.assign(new Error(`ONNX Runtime 与当前 Windows 或 CPU 不兼容，无法运行本地抠图：${error.message}`), { code: "ort_incompatible" });
      });
    }
    return runtimePromise;
  }

  async function getSession(definition, runtime) {
    const key = `${definition.id}:${definition.version}`;
    if (sessionCache.has(key)) return sessionCache.get(key);
    const pending = runtime.InferenceSession.create(readableModelFile(definition), {
      executionProviders: ["cpu"],
      graphOptimizationLevel: "all",
    });
    sessionCache.set(key, pending);
    try {
      const session = await pending;
      sessionCache.set(key, session);
      return session;
    } catch (error) {
      sessionCache.delete(key);
      throw error;
    }
  }

  // 一次推理：解码 → 定尺 → 前向 → min-max 掩膜 → 还原到原图尺寸。
  async function inference(imageBuffer, modelId) {
    const definition = requireModel(modelId);
    const runtime = await loadRuntime();
    const decoded = await sharp(imageBuffer).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const width = decoded.info.width;
    const height = decoded.info.height;
    if (!(width > 0) || !(height > 0)) {
      throw Object.assign(new Error("图片解码失败，无法抠图。"), { code: "invalid_image", statusCode: 400 });
    }
    const rgb = await sharp(decoded.data, { raw: { width, height, channels: decoded.info.channels } })
      .resize(definition.input.width, definition.input.height, { fit: "fill" })
      .raw()
      .toBuffer();
    const session = await getSession(definition, runtime);
    const built = buildInputTensor(rgb, definition);
    const tensor = new runtime.Tensor(built.dtype, built.data, [1, 3, definition.input.height, definition.input.width]);
    const results = await session.run({ [session.inputNames[0]]: tensor });
    const output = results[session.outputNames[0]];
    const maskBytes = buildMaskBytes(decodeModelOutput(output.data, output.type), { sigmoid: definition.input.sigmoid });
    const alpha = await resizeMaskToAlpha(sharp, maskBytes, definition.input.width, definition.input.height, width, height);
    return { alpha, width, height, model: definition.id };
  }

  function prunePrepared() {
    const deadline = now() - CACHE_TTL_MS;
    for (const [token, entry] of preparedCache) {
      if (entry.createdAt < deadline) {
        preparedCache.delete(token);
        preparedBytes -= entry.bytes;
      }
    }
  }

  function rememberPrepared(entry) {
    for (const [token, value] of preparedCache) {
      if (value.key === entry.key && token !== entry.token) {
        preparedCache.delete(token);
        preparedBytes -= value.bytes;
      }
    }
    preparedCache.set(entry.token, entry);
    preparedBytes += entry.bytes;
    while (preparedCache.size > CACHE_MAX_ENTRIES || preparedBytes > CACHE_MAX_BYTES) {
      const oldest = [...preparedCache.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
      if (!oldest) break;
      preparedCache.delete(oldest.token);
      preparedBytes -= oldest.bytes;
    }
    return entry;
  }

  // 准备阶段只跑一次推理，把原始掩膜缓存下来给前端做实时调参，不重复消耗算力。
  async function prepare(imageBuffer, modelId = DEFAULT_MODEL_ID) {
    if (!Buffer.isBuffer(imageBuffer) || !imageBuffer.length) {
      throw Object.assign(new Error("缺少要抠图的图片。"), { code: "missing_image", statusCode: 400 });
    }
    prunePrepared();
    const key = `${sha256(imageBuffer)}:${modelId || DEFAULT_MODEL_ID}`;
    const cached = [...preparedCache.values()].find((item) => item.key === key);
    if (cached) return summarizePrepared(cached, true);
    const result = await inference(imageBuffer, modelId);
    return summarizePrepared(rememberPrepared({
      token: crypto.randomUUID(),
      key,
      model: result.model,
      width: result.width,
      height: result.height,
      alpha: result.alpha,
      image: imageBuffer,
      createdAt: now(),
      bytes: result.alpha.length + imageBuffer.length,
    }), false);
  }

  function summarizePrepared(entry, cached) {
    return {
      token: entry.token,
      model: entry.model,
      width: entry.width,
      height: entry.height,
      cached: Boolean(cached),
      coverage: countCoverage(entry.alpha),
    };
  }

  function requirePrepared(token) {
    prunePrepared();
    const entry = preparedCache.get(String(token || ""));
    if (!entry) {
      throw Object.assign(new Error("抠图结果已过期，请重新运行一次。"), { code: "prepared_expired", statusCode: 410 });
    }
    return entry;
  }

  async function maskPng(token) {
    const entry = requirePrepared(token);
    return sharp(entry.alpha, { raw: { width: entry.width, height: entry.height, channels: 1 } })
      .toColourspace("b-w")
      .png()
      .toBuffer();
  }

  async function previewPng(token) {
    const entry = requirePrepared(token);
    const rgba = await sharp(entry.image).rotate().ensureAlpha().raw().toBuffer();
    writeAlpha(rgba, entry.alpha, 100);
    return sharp(rgba, { raw: { width: entry.width, height: entry.height, channels: 4 } }).png().toBuffer();
  }

  // 应用阶段：按用户设置合成最终 PNG，供导出与 Agent 直接落图。
  async function applySettings(token, options = {}) {
    const entry = requirePrepared(token);
    const mode = options.mode === "effect" ? "effect" : "subject";
    const rgba = await sharp(entry.image).rotate().ensureAlpha().raw().toBuffer();
    if (rgba.length !== entry.width * entry.height * 4) {
      throw Object.assign(new Error("抠图原图尺寸异常，请重新运行。"), { code: "image_size_mismatch" });
    }
    let alpha;
    if (mode === "effect") {
      const effect = computeEffectAlpha(rgba, entry.width, entry.height, options.settings);
      alpha = effect.alpha;
      applyEffectSpill(rgba, alpha, effect.background, effect.settings);
      writeAlpha(rgba, alpha, effect.settings.opacity);
    } else {
      const config = normalizeSubjectSettings(options.settings);
      alpha = refineSubjectAlpha(entry.alpha, config);
      writeAlpha(rgba, alpha, config.opacity);
    }
    const buffer = await sharp(rgba, { raw: { width: entry.width, height: entry.height, channels: 4 } }).png().toBuffer();
    return { buffer, alpha, width: entry.width, height: entry.height, mode, model: entry.model, coverage: countCoverage(alpha) };
  }

  // 一步到位：给 Agent 与接口用，内部就是 prepare + apply。
  async function removeImageBackground(imageBuffer, options = {}) {
    const preparedResult = await prepare(imageBuffer, options.model || DEFAULT_MODEL_ID);
    return applySettings(preparedResult.token, { mode: options.mode, settings: options.settings });
  }

  return Object.freeze({
    storeDirectory,
    listModels,
    modelDefinition,
    importModelFile,
    checkForUpdate,
    downloadUpdate,
    removeStoredModel,
    prepare,
    applySettings,
    maskPng,
    previewPng,
    removeImageBackground,
    status: () => ({ models: listModels(), defaultModel: DEFAULT_MODEL_ID, store: storeDirectory, bundledDirectory, modelPath: externalModelPath || "" }),
  });
}

// onnxruntime-node 是原生模块，加载可能因 CPU/系统不兼容而挂住，这里加超时兜底。
async function defaultRuntimeLoader() {
  return await withTimeout(import("onnxruntime-node"), RUNTIME_PROBE_TIMEOUT_MS);
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`加载超时（${timeoutMs}ms）`)), timeoutMs);
      if (typeof timer.unref === "function") timer.unref();
    }),
  ]);
}

module.exports = {
  createBackgroundRemovalService,
  DEFAULT_MODEL_ID,
  DEFAULT_SUBJECT_SETTINGS,
  DEFAULT_EFFECT_SETTINGS,
  MODEL_DEFINITIONS,
  BUNDLED_MODEL_DIRECTORY,
  MODEL_STORE_DIRECTORY,
  buildInputTensor,
  buildMaskBytes,
  decodeModelOutput,
  floatToHalfBits,
  halfBitsToFloat,
  installFloat16Compatibility,
  refineSubjectAlpha,
  applyEffectSpill,
  computeEffectAlpha,
  sampleBorderColor,
  writeAlpha,
  countCoverage,
  normalizeSubjectSettings,
  normalizeEffectSettings,
  smoothstep,
};
