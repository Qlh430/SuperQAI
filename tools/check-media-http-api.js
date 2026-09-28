"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createMediaHttpApi } = require("../media-http-api");

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function createRes() {
  const result = { status: 0, body: null, headers: null };
  return {
    result,
    res: {
      writeHead(status, headers) {
        result.status = status;
        result.headers = headers;
      },
      end(payload) {
        const text = String(payload || "");
        result.body = text ? JSON.parse(text) : null;
      },
    },
  };
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "media-http-api-"));
  const outputDir = path.join(root, "output");
  const tempDir = path.join(root, "uploads");
  fs.mkdirSync(outputDir, { recursive: true });

  const registered = [];
  const api = createMediaHttpApi({
    uploadTmpDir: tempDir,
    maxRequestBytes: 8 * 1024 * 1024,
    maxMediaUploadBytes: 8 * 1024 * 1024,
    maxUploadChunks: 16,
    uploadTmpTtlMs: 60_000,
    readBodyBuffer: async (req) => Buffer.from(req.body || []),
    readJson: async (req) => req.json || {},
    sendJson: (res, status, body, headers) => {
      res.writeHead(status, headers);
      res.end(JSON.stringify(body));
    },
    registerSavedMedia: async (req, saved, mimeType) => {
      const asset = { ownerUserId: req.auth.user.id, url: saved.url, mimeType };
      registered.push(asset);
      return asset;
    },
    saveBinaryImage: (buffer, name, mimeType) => {
      const base = path.basename(String(name || "image"), path.extname(String(name || ""))) || "image";
      const filename = `${base}.png`;
      const url = `/output/${encodeURIComponent(filename)}`;
      fs.writeFileSync(path.join(outputDir, filename), buffer);
      return { url, filename, mimeType };
    },
    saveBinaryMedia: (buffer, name, mimeType) => {
      const extension = String(mimeType || "application/octet-stream").split("/")[1] || "bin";
      const base = path.basename(String(name || "media"), path.extname(String(name || ""))) || "media";
      const filename = `${base}.${extension}`;
      fs.writeFileSync(path.join(outputDir, filename), buffer);
      return { url: `/output/${encodeURIComponent(filename)}`, filename, mimeType };
    },
    dataUrlToFile: (dataUrl, name) => {
      const match = String(dataUrl || "").match(/^data:(.+?);base64,(.+)$/);
      if (!match) throw new Error("Media must be a data URL.");
      return {
        filename: String(name || "media"),
        blob: new Blob([Buffer.from(match[2], "base64")], { type: match[1] }),
      };
    },
    buildOutputImagePath: (name = "image", mimeType = "image/png") => {
      const extension = mimeType === "video/mp4" ? "mp4" : mimeType === "audio/mpeg" ? "mp3" : "png";
      const base = path.basename(String(name || "media"), path.extname(String(name || ""))) || "media";
      const filename = `${base}.${extension}`;
      return { filename, filePath: path.join(outputDir, filename) };
    },
    inferMediaMimeType: (filename, contentType) => {
      const declared = String(contentType || "").split(";")[0].toLowerCase();
      if (/^(image|video|audio)\//.test(declared)) return declared;
      const extension = path.extname(String(filename || "")).toLowerCase();
      return {
        ".png": "image/png",
        ".mp4": "video/mp4",
        ".mp3": "audio/mpeg",
      }[extension] || declared || "application/octet-stream";
    },
    isSupportedMediaMime: (mimeType) => /^(image|video|audio)\//i.test(String(mimeType || "")),
    formatErrorMessage: (error) => String(error?.message || error || "Media request failed."),
  });

  try {
    const authReq = { auth: { user: { id: "user-1" } } };
    const imageCapture = createRes();
    assert.equal(await api.handle({
      ...authReq,
      method: "POST",
      url: "/api/upload-image",
      headers: { "content-type": "image/png", "x-file-name": "cover.png" },
      body: PNG,
    }, imageCapture.res), true);
    assert.equal(imageCapture.result.status, 200);
    assert.equal(imageCapture.result.body.url, "/output/cover.png");
    assert.deepEqual(fs.readFileSync(path.join(outputDir, "cover.png")), PNG);
    assert.equal(registered.length, 1);

    const uploadId = "media-chunk-test";
    const firstCapture = createRes();
    assert.equal(await api.handle({
      ...authReq,
      method: "POST",
      url: "/api/upload-media/chunk",
      headers: {
        "content-type": "application/octet-stream",
        "x-upload-id": uploadId,
        "x-chunk-index": "0",
        "x-chunk-total": "2",
        "x-file-name": "clip.mp4",
        "x-file-type": "video/mp4",
      },
      body: Buffer.from("first-"),
    }, firstCapture.res), true);
    assert.equal(firstCapture.result.status, 200);
    assert.equal(firstCapture.result.body.complete, undefined);

    const secondCapture = createRes();
    assert.equal(await api.handle({
      ...authReq,
      method: "POST",
      url: "/api/upload-media/chunk",
      headers: {
        "content-type": "application/octet-stream",
        "x-upload-id": uploadId,
        "x-chunk-index": "1",
        "x-chunk-total": "2",
        "x-file-name": "clip.mp4",
        "x-file-type": "video/mp4",
      },
      body: Buffer.from("second"),
    }, secondCapture.res), true);
    assert.equal(secondCapture.result.status, 200);
    assert.equal(secondCapture.result.body.complete, true);
    assert.deepEqual(fs.readFileSync(path.join(outputDir, "clip.mp4")), Buffer.from("first-second"));
    assert.equal(registered.length, 2);
    assert.equal(fs.existsSync(path.join(tempDir, uploadId)), false);

    const unauthorized = createRes();
    assert.equal(await api.handle({
      method: "POST",
      url: "/api/upload-image",
      headers: { "content-type": "image/png" },
      body: PNG,
    }, unauthorized.res), true);
    assert.equal(unauthorized.result.status, 401);

    const unrelated = createRes();
    assert.equal(await api.handle({
      ...authReq,
      method: "POST",
      url: "/api/images",
      headers: {},
    }, unrelated.res), false);
    assert.equal(unrelated.result.status, 0);

    console.log("Media HTTP API checks passed.");
  } finally {
    assert.ok(path.resolve(root).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
