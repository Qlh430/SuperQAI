"use strict";

const defaultFs = require("node:fs");
const path = require("node:path");
const { Blob } = require("node:buffer");

const MAX_BYTES = 24 * 1024 * 1024;
const AUDIO_MIME = Object.freeze({
  ".wav": "audio/wav", ".mp3": "audio/mpeg", ".flac": "audio/flac",
  ".ogg": "audio/ogg", ".opus": "audio/ogg", ".m4a": "audio/mp4",
  ".aac": "audio/aac", ".webm": "audio/webm",
});

function failure(message, statusCode = 400, code = "invalid_reference_audio") {
  return Object.assign(new Error(message), { statusCode, code });
}

function outputFilename(source) {
  if (typeof source !== "string" || !source.startsWith("/output/")) return null;
  const encoded = source.slice(8);
  if (!encoded || /[\\/:?#\x00-\x1f\x7f]/.test(encoded)) return null;
  let filename;
  try { filename = decodeURIComponent(encoded); } catch { return null; }
  // Decode once only. Remaining percent escapes cannot become a second path.
  if (!filename || /[\\/:%?#\x00-\x1f\x7f]/.test(filename)
    || filename === "." || filename === ".." || !AUDIO_MIME[path.extname(filename).toLowerCase()]) return null;
  return filename;
}

function contained(root, target) {
  const relative = path.relative(root, target);
  return relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function checkLength(length) {
  if (!Number.isSafeInteger(length) || length < 1) throw failure("参考音频为空或文件大小无效，请重新上传。");
  if (length > MAX_BYTES) throw failure("参考音频不能超过 24MB，请上传较小的音频。", 413, "reference_audio_too_large");
}

function audioSignature(data, extension) {
  const ascii = (start, end) => data.toString("ascii", start, end);
  switch (extension) {
    case ".wav": return data.length >= 12 && ["RIFF", "RIFX", "RF64"].includes(ascii(0, 4)) && ascii(8, 12) === "WAVE";
    case ".flac": return data.length >= 8 && ascii(0, 4) === "fLaC";
    case ".mp3": return (data.length >= 10 && ascii(0, 3) === "ID3")
      || (data.length >= 4 && data[0] === 0xff && (data[1] & 0xe0) === 0xe0
        && (data[1] & 0x18) !== 0x08 && (data[1] & 0x06) !== 0
        && (data[2] & 0xf0) !== 0xf0 && (data[2] & 0xf0) !== 0 && (data[2] & 0x0c) !== 0x0c);
    case ".ogg": case ".opus": return data.length >= 27 && ascii(0, 4) === "OggS" && data[4] === 0;
    case ".m4a": return data.length >= 16 && ascii(4, 8) === "ftyp";
    case ".aac": return data.length >= 7 && data[0] === 0xff && (data[1] & 0xf6) === 0xf0;
    case ".webm": return data.length >= 5 && data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3;
    default: return false;
  }
}

function createQwenTtsReferenceReader({ outputDir, assertOutputMediaRead, canonicalOutputMedia, fs = defaultFs } = {}) {
  if (typeof outputDir !== "string" || !outputDir) throw new TypeError("缺少参考音频输出目录。");
  if (typeof assertOutputMediaRead !== "function" || typeof canonicalOutputMedia !== "function") throw new TypeError("缺少参考音频权限校验服务。");
  const io = fs.promises || fs;
  for (const method of ["realpath", "stat", "readFile"]) {
    if (typeof io[method] !== "function") throw new TypeError(`缺少参考音频文件读取方法（${method}）。`);
  }
  return async function readQwenTtsReference(auth, source) {
    const userId = auth?.user?.id;
    if (!userId) throw failure("请先登录后再使用参考音频。", 401, "unauthorized");
    const filename = outputFilename(source);
    if (!filename) throw failure("参考音频必须是已上传到本工作台的有效音频文件。");

    let canonical;
    try { canonical = await canonicalOutputMedia(source); } catch (cause) {
      if (cause?.statusCode || cause?.status) throw cause;
      throw failure("参考音频不存在或无法访问，请重新上传。", 404, "not_found");
    }
    const canonicalFilename = outputFilename(canonical?.url);
    if (!canonicalFilename || canonical.refId !== `/output/${canonicalFilename}`) {
      throw failure("参考音频不存在或路径无效，请重新上传。", 404, "not_found");
    }

    // The host owns resource ACLs. Await it for every request before any local read.
    await assertOutputMediaRead(userId, canonical.url);

    try {
      const realRoot = await io.realpath(outputDir);
      const realSource = await io.realpath(path.join(outputDir, filename));
      const realCanonical = await io.realpath(path.join(outputDir, canonicalFilename));
      if (!contained(realRoot, realSource) || !contained(realRoot, realCanonical) || realSource !== realCanonical) {
        throw failure("参考音频路径超出输出目录或与授权文件不一致。");
      }
      const stats = await io.stat(realSource);
      if (!stats.isFile()) throw failure("参考音频不是有效的音频文件。");
      checkLength(stats.size);
      const data = await io.readFile(realSource);
      checkLength(data.length);
      const extension = path.extname(canonicalFilename).toLowerCase();
      if (!Buffer.isBuffer(data) || !audioSignature(data, extension)) throw failure("参考音频内容与文件格式不匹配或已损坏，请重新上传。");
      return { blob: new Blob([data], { type: AUDIO_MIME[extension] }), filename: path.basename(canonicalFilename) };
    } catch (cause) {
      if (cause?.statusCode || cause?.status) throw cause;
      if (cause?.code === "ENOENT" || cause?.code === "ENOTDIR") throw failure("参考音频文件不存在，请重新上传。", 404, "not_found");
      throw failure("读取参考音频失败，请检查文件后重试。", 400, "reference_audio_read_failed");
    }
  };
}

module.exports = { createQwenTtsReferenceReader };
