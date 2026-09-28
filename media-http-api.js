"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROUTES = new Set([
  "/api/upload-image",
  "/api/upload-image/chunk",
  "/api/upload-media",
  "/api/upload-media/chunk",
]);

function requestPathname(req) {
  try {
    return new URL(req?.url || "/", `http://${req?.headers?.host || "localhost"}`).pathname;
  } catch {
    return "/";
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

function safeUploadId(value) {
  const text = String(value || "");
  return /^[a-zA-Z0-9_-]{8,80}$/.test(text) ? text : "";
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
      files.push({
        name,
        filename: path.basename(filename),
        contentType: (contentTypeMatch?.[1] || "application/octet-stream").trim(),
        buffer: buffer.slice(dataStart, dataEnd),
      });
    }
    position = nextBoundary;
  }
  return files;
}

function createMediaHttpApi({
  uploadTmpDir,
  maxRequestBytes,
  maxMediaUploadBytes,
  maxUploadChunks,
  uploadTmpTtlMs,
  readBodyBuffer,
  readJson,
  sendJson,
  registerSavedMedia,
  saveBinaryImage,
  saveBinaryMedia,
  dataUrlToFile,
  buildOutputImagePath,
  inferMediaMimeType,
  isSupportedMediaMime,
  formatErrorMessage = (error) => String(error?.message || error || "Media request failed."),
} = {}) {
  const tempDirectory = String(uploadTmpDir || "").trim();
  if (!tempDirectory) throw new TypeError("Media HTTP API requires an upload temp directory.");
  const requestLimit = Number(maxRequestBytes);
  const mediaLimit = Number(maxMediaUploadBytes);
  const chunkLimit = Number(maxUploadChunks);
  const tempTtlMs = Number(uploadTmpTtlMs);
  if (!Number.isSafeInteger(requestLimit) || requestLimit <= 0
    || !Number.isSafeInteger(mediaLimit) || mediaLimit <= 0
    || !Number.isSafeInteger(chunkLimit) || chunkLimit <= 0
    || !Number.isSafeInteger(tempTtlMs) || tempTtlMs <= 0) {
    throw new TypeError("Media HTTP API requires valid upload limits.");
  }
  if (typeof readBodyBuffer !== "function" || typeof readJson !== "function" || typeof sendJson !== "function") {
    throw new TypeError("Media HTTP API requires HTTP helpers.");
  }
  if (typeof registerSavedMedia !== "function" || typeof saveBinaryImage !== "function"
    || typeof saveBinaryMedia !== "function" || typeof dataUrlToFile !== "function"
    || typeof buildOutputImagePath !== "function") {
    throw new TypeError("Media HTTP API requires media storage helpers.");
  }
  if (typeof inferMediaMimeType !== "function" || typeof isSupportedMediaMime !== "function") {
    throw new TypeError("Media HTTP API requires MIME helpers.");
  }
  if (typeof formatErrorMessage !== "function") throw new TypeError("Media HTTP API requires an error formatter.");

  fs.mkdirSync(tempDirectory, { recursive: true });

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
    for (const entry of fs.readdirSync(tempDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(tempDirectory, entry.name);
      try {
        if (now - fs.statSync(dir).mtimeMs > tempTtlMs) fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // A concurrent upload may complete while cleanup is scanning.
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
      url: `/output/${encodeURIComponent(target.filename)}`,
      mimeType,
    };
  }

  function saveDataUrlImage(dataUrl, name = "image") {
    const match = String(dataUrl || "").match(/^data:(.+?);base64,(.+)$/);
    if (!match) throw new Error("Image must be a data URL.");
    return saveBinaryImage(Buffer.from(match[2], "base64"), name, match[1]);
  }

  async function handleImageUpload(req, res) {
    try {
      const contentType = req.headers["content-type"] || "";
      if (contentType.startsWith("image/") || contentType === "application/octet-stream") {
        const buffer = await readBodyBuffer(req);
        const name = decodeHeaderFilename(req.headers["x-file-name"]) || "canvas-image";
        const saved = saveBinaryImage(buffer, name, contentType);
        const mimeType = contentType.startsWith("image/") ? contentType : "image/png";
        const asset = await registerSavedMedia(req, saved, mimeType);
        sendJson(res, 200, { ...saved, mimeType, asset });
        return;
      }

      if (contentType.includes("multipart/form-data")) {
        const buffer = await readBodyBuffer(req);
        const files = parseMultipartFiles(contentType, buffer);
        const image = files.find((file) => file.name === "image" || file.contentType.startsWith("image/"));
        if (!image) throw new Error("Missing image.");
        const saved = saveBinaryImage(image.buffer, image.filename || "canvas-image", image.contentType);
        const asset = await registerSavedMedia(req, saved, "image/png");
        sendJson(res, 200, { ...saved, mimeType: "image/png", asset });
        return;
      }

      const payload = await readJson(req);
      if (!payload.image) {
        sendJson(res, 400, { error: "Missing image." });
        return;
      }
      const saved = saveDataUrlImage(payload.image, payload.name || "canvas-image");
      const mimeType = String(payload.image).slice(5).split(";", 1)[0] || "image/png";
      const asset = await registerSavedMedia(req, saved, mimeType);
      sendJson(res, 200, { ...saved, mimeType, asset });
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
  }

  async function handleImageChunkUpload(req, res) {
    try {
      cleanupAbandonedUploads();
      const uploadId = safeUploadId(req.headers["x-upload-id"]);
      const index = Number(req.headers["x-chunk-index"]);
      const total = Number(req.headers["x-chunk-total"]);
      const contentType = String(req.headers["x-file-type"] || req.headers["content-type"] || "image/png");
      const filename = decodeHeaderFilename(req.headers["x-file-name"]) || "canvas-image";

      if (!uploadId || !Number.isInteger(index) || !Number.isInteger(total)
        || index < 0 || total < 1 || total > chunkLimit || index >= total) {
        sendJson(res, 400, { error: "Invalid upload chunk headers." });
        return;
      }

      const chunk = await readBodyBuffer(req);
      const dir = path.join(tempDirectory, uploadId);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${index}.part`), chunk);

      const state = getUploadChunkState(dir, total);
      if (state.totalBytes > requestLimit) {
        fs.rmSync(dir, { recursive: true, force: true });
        throw new Error(`Upload is too large. Current limit is ${Math.round(requestLimit / 1024 / 1024)}MB.`);
      }
      if (!state.complete) {
        sendJson(res, 200, { ok: true, received: index + 1, total });
        return;
      }

      const saved = saveChunkedUpload(dir, total, filename, contentType);
      fs.rmSync(dir, { recursive: true, force: true });
      const asset = await registerSavedMedia(req, saved, contentType);
      sendJson(res, 200, { ...saved, mimeType: contentType, asset, complete: true });
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
        const asset = await registerSavedMedia(req, saved, media.contentType);
        sendJson(res, 200, { ...saved, mimeType: media.contentType, asset });
        return;
      }

      if (requestType.startsWith("image/") || requestType.startsWith("video/")
        || requestType.startsWith("audio/") || requestType === "application/octet-stream") {
        const buffer = await readBodyBuffer(req);
        const name = decodeHeaderFilename(req.headers["x-file-name"]) || "canvas-media";
        const saved = saveBinaryMedia(buffer, name, requestType);
        const mimeType = inferMediaMimeType(name, requestType);
        const asset = await registerSavedMedia(req, saved, mimeType);
        sendJson(res, 200, { ...saved, mimeType, asset });
        return;
      }

      const payload = await readJson(req);
      if (!payload.media) throw new Error("Missing media file.");
      const file = dataUrlToFile(payload.media, payload.name || "canvas-media");
      const saved = saveBinaryMedia(Buffer.from(await file.blob.arrayBuffer()), file.filename, file.blob.type);
      const asset = await registerSavedMedia(req, saved, file.blob.type);
      sendJson(res, 200, { ...saved, mimeType: file.blob.type, asset });
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

      if (!uploadId || !Number.isInteger(index) || !Number.isInteger(total)
        || index < 0 || total < 1 || total > chunkLimit || index >= total) {
        sendJson(res, 400, { error: "Invalid upload chunk headers." });
        return;
      }
      if (!isSupportedMediaMime(mimeType)) {
        sendJson(res, 400, { error: "Only image, video, and audio files are supported." });
        return;
      }

      const chunk = await readBodyBuffer(req);
      const dir = path.join(tempDirectory, uploadId);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${index}.part`), chunk);

      const state = getUploadChunkState(dir, total);
      if (state.totalBytes > mediaLimit) {
        fs.rmSync(dir, { recursive: true, force: true });
        throw new Error(`Upload is too large. Current media limit is ${Math.round(mediaLimit / 1024 / 1024)}MB.`);
      }
      if (!state.complete) {
        sendJson(res, 200, { ok: true, received: index + 1, total });
        return;
      }

      const saved = saveChunkedUpload(dir, total, filename, mimeType);
      fs.rmSync(dir, { recursive: true, force: true });
      const asset = await registerSavedMedia(req, saved, mimeType);
      sendJson(res, 200, { ...saved, mimeType, asset, complete: true });
    } catch (error) {
      sendJson(res, 400, { error: formatErrorMessage(error) });
    }
  }

  async function handle(req, res) {
    const requestPath = requestPathname(req);
    if (req?.method !== "POST" || !ROUTES.has(requestPath)) return false;
    if (!req?.auth?.user?.id) {
      sendJson(res, 401, { error: "Authentication required", code: "unauthorized" });
      return true;
    }
    if (requestPath === "/api/upload-image") await handleImageUpload(req, res);
    else if (requestPath === "/api/upload-image/chunk") await handleImageChunkUpload(req, res);
    else if (requestPath === "/api/upload-media") await handleMediaUpload(req, res);
    else await handleMediaChunkUpload(req, res);
    return true;
  }

  return Object.freeze({ handle });
}

module.exports = { createMediaHttpApi };
