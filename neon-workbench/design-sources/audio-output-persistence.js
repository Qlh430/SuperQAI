"use strict";
const path = require("node:path");
const defaultFs = require("node:fs");
const defaultCrypto = require("node:crypto");
const EXTENSIONS = Object.freeze({ "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/ogg": "ogg", "audio/opus": "opus", "audio/aac": "aac", "audio/flac": "flac", "audio/mp4": "m4a", "audio/webm": "webm" });
function createAudioOutputPersistence({ outputDir, fs = defaultFs, crypto = defaultCrypto, registerMedia = null } = {}) {
  if (!outputDir) throw new TypeError("音频输出目录未配置。");
  const directory = path.resolve(outputDir);
  return async function persistGeneratedAudio({ data, contentType, auth } = {}) {
    if (!auth?.user?.id) throw Object.assign(new Error("请先登录后保存音频。"), { statusCode: 401 });
    const extension = EXTENSIONS[String(contentType || "").toLowerCase()];
    if (!extension || !Buffer.isBuffer(data) || !data.length || data.length > 24 * 1024 * 1024) throw new Error("生成音频的格式或大小不符合保存要求。");
    const filename = `audio-${crypto.randomUUID()}.${extension}`;
    await fs.promises.mkdir(directory, { recursive: true });
    await fs.promises.writeFile(path.join(directory, filename), data, { flag: "wx", mode: 0o600 });
    const saved = { url: `/output/${filename}`, filename, contentType };
    if (typeof registerMedia === "function") {
      try { await registerMedia(auth.user.id, { url: saved.url, filename }, contentType); }
      catch { throw Object.assign(new Error("音频已生成，但保存访问权限失败，请勿重复提交。"), { code: "audio_ownership_failed", statusCode: 500 }); }
    }
    return saved;
  };
}
module.exports = { createAudioOutputPersistence };
