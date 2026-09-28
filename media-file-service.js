"use strict";

const defaultCrypto = require("node:crypto");
const defaultFs = require("node:fs");
const path = require("node:path");

const MIME_TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
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
});

const MEDIA_EXTENSIONS = Object.freeze([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "mp4",
  "webm",
  "mov",
  "mkv",
  "wav",
  "mp3",
  "m4a",
  "aac",
  "flac",
  "ogg",
]);

const VIDEO_MEDIA_EXTENSIONS = Object.freeze(["mp4", "webm", "mov", "mkv"]);

function createMediaFileService({
  outputDir,
  publicDir,
  fetchImpl,
  maxRequestBytes,
  mimeTypes = MIME_TYPES,
  crypto = defaultCrypto,
  fs = defaultFs,
  now = Date.now,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  for (const [name, dependency] of Object.entries({
    outputDir,
    publicDir,
    fetchImpl,
  })) {
    if (!dependency) throw new TypeError(`Media file service requires ${name}.`);
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
    const source = String(url || "").trim();
    if (!source) return "";
    let pathname = source;
    try {
      pathname = new URL(source).pathname;
    } catch {
      pathname = source.split(/[?#]/, 1)[0];
    }
    const extension = path.extname(pathname).replace(".", "").toLowerCase();
    if (MEDIA_EXTENSIONS.includes(extension)) return extension === "jpeg" ? "jpg" : extension;
    return "";
  }

  function extensionFromFilePath(filePath) {
    const extension = path.extname(String(filePath || "")).replace(".", "").toLowerCase();
    if (MEDIA_EXTENSIONS.includes(extension)) return extension === "jpeg" ? "jpg" : extension;
    return "";
  }

  function decodeHeaderFilename(value) {
    if (!value) return "";
    try {
      return decodeURIComponent(String(value));
    } catch {
      return String(value);
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

  function isVideoMediaUrl(url) {
    const value = String(url || "").trim();
    if (!value) return false;
    if (/^data:video\//i.test(value)) return true;
    return VIDEO_MEDIA_EXTENSIONS.includes(extensionFromUrl(value));
  }

  function buildOutputMediaPath(name = "media", mimeType = "application/octet-stream") {
    const extension = extensionFromContentType(mimeType) || path.extname(String(name || "")).replace(".", "").toLowerCase() || "bin";
    const base = path.basename(String(name || "media"), path.extname(String(name || ""))).replace(/[\\/:*?"<>|]+/g, "-") || "media";
    const filename = `${base}_${now()}_${crypto.randomBytes(4).toString("hex")}.${extension}`;
    return {
      filename,
      filePath: path.join(outputDir, filename),
    };
  }

  function saveBinaryImage(buffer, name = "image", mimeType = "image/png") {
    const target = buildOutputMediaPath(name, mimeType);
    fs.writeFileSync(target.filePath, buffer);
    return {
      filename: target.filename,
      url: `/output/${encodeURIComponent(target.filename)}`,
    };
  }

  function saveBinaryMedia(buffer, name = "media", mimeType = "application/octet-stream") {
    const normalizedMime = inferMediaMimeType(name, mimeType);
    if (!isSupportedMediaMime(normalizedMime)) throw new Error("Only image, video, and audio files are supported.");
    const target = buildOutputMediaPath(name, normalizedMime);
    fs.writeFileSync(target.filePath, buffer);
    return {
      filename: target.filename,
      url: `/output/${encodeURIComponent(target.filename)}`,
      mimeType: normalizedMime,
    };
  }

  function dataUrlToFile(dataUrl, filename) {
    const match = String(dataUrl || "").match(/^data:(.+?);base64,(.+)$/);
    if (!match) throw new Error("Reference image must be a data URL.");

    const mimeType = match[1];
    const buffer = Buffer.from(match[2], "base64");
    const extension = extensionFromContentType(mimeType) || "jpg";
    const safeName = String(filename || "").includes(".") ? filename : `${filename || "image"}.${extension}`;
    return {
      filename: safeName,
      blob: new Blob([buffer], { type: mimeType }),
    };
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
      const filePath = path.resolve(outputDir, path.basename(pathname));
      if (filePath.startsWith(path.resolve(outputDir)) && fs.existsSync(filePath)) return filePath;
      throw new Error("Reference image was not found on the server.");
    }

    if (pathname.startsWith("/assets/")) {
      const filePath = path.resolve(publicDir, `.${pathname}`);
      if (filePath.startsWith(path.resolve(publicDir)) && fs.existsSync(filePath)) return filePath;
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

  async function fetchWithTimeout(url, options = {}, timeoutMs = 60_000) {
    const timeoutSignal = AbortSignal.timeout(Math.max(1, Number(timeoutMs) || 60_000));
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal;
    return fetchImpl(url, { ...options, signal });
  }

  async function fetchBufferResponseWithTimeout(url, options = {}, timeoutMs = 60_000) {
    const controller = new AbortController();
    const timer = setTimeoutFn(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        ...options,
        signal: options.signal || controller.signal,
      });
      const buffer = Buffer.from(await response.arrayBuffer());
      return { response, buffer };
    } finally {
      clearTimeoutFn(timer);
    }
  }

  async function saveRemoteVideo(remoteUrl, prefix = "api_video_", options = {}) {
    const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 300_000;
    const { response, buffer } = await fetchBufferResponseWithTimeout(remoteUrl, {}, timeoutMs);
    if (!response.ok) throw new Error(`Video download failed: ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    const extension = extensionFromContentType(contentType) || extensionFromUrl(remoteUrl) || "mp4";
    if (!VIDEO_MEDIA_EXTENSIONS.includes(extension)) return "";
    const filename = `${prefix}${now()}_${crypto.randomBytes(4).toString("hex")}.${extension}`;
    fs.writeFileSync(path.join(outputDir, filename), buffer);
    return `/output/${filename}`;
  }

  function assertMediaKind(mimeType, kind) {
    const expected = kind === "audio" ? "audio/" : kind === "video" ? "video/" : "image/";
    if (!String(mimeType || "").toLowerCase().startsWith(expected)) {
      throw new Error(`Reference ${kind} has an unsupported media type: ${mimeType || "unknown"}.`);
    }
  }

  async function imageReferenceToFile(url, filename, options = {}) {
    const source = String(url || "");
    if (source.startsWith("data:")) return dataUrlToFile(source, filename);

    const localPath = resolveLocalImageReference(source);
    if (localPath) return localImageFileToUpload(localPath, filename);

    if (/^https?:\/\//i.test(source)) {
      const response = await fetchWithTimeout(source, { signal: options.signal }, 20_000);
      if (!response.ok) throw new Error(`Reference image download failed: ${response.status}`);
      const mimeType = response.headers.get("content-type") || "image/png";
      const extension = extensionFromContentType(mimeType) || extensionFromUrl(source) || "png";
      const safeName = String(filename || "").includes(".") ? filename : `${filename || "image"}.${extension}`;
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

  async function readBodyBuffer(req, maxBytes = maxRequestBytes) {
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

  return Object.freeze({
    mimeTypes,
    videoMediaExtensions: VIDEO_MEDIA_EXTENSIONS,
    extensionFromContentType,
    extensionFromUrl,
    extensionFromFilePath,
    decodeHeaderFilename,
    inferMediaMimeType,
    isSupportedMediaMime,
    isVideoMediaUrl,
    buildOutputMediaPath,
    buildOutputImagePath: buildOutputMediaPath,
    saveBinaryImage,
    saveBinaryMedia,
    saveRemoteVideo,
    dataUrlToFile,
    resolveLocalImageReference,
    localImageFileToUpload,
    getImageReferenceDimensions,
    getImageDimensionsFromBuffer,
    decodeImageBase64,
    fetchWithTimeout,
    fetchBufferResponseWithTimeout,
    imageReferenceToFile,
    mediaReferenceToFile,
    readBodyBuffer,
  });
}

module.exports = {
  MIME_TYPES,
  MEDIA_EXTENSIONS,
  VIDEO_MEDIA_EXTENSIONS,
  createMediaFileService,
};
