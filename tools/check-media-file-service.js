"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createMediaFileService } = require("../media-file-service");

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlR3YQAAAAASUVORK5CYII=",
  "base64",
);

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-media-file-"));
  const realRoot = fs.realpathSync(root);
  const outputDir = path.join(root, "output");
  const publicDir = path.join(root, "public");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(path.join(publicDir, "assets"), { recursive: true });
  try {
    const service = createMediaFileService({
      outputDir,
      publicDir,
      maxRequestBytes: 1024,
      fetchImpl: async (url) => {
        if (String(url) === "https://cdn.example.test/image.png") {
          return new Response(PNG_1X1, { headers: { "content-type": "image/png" } });
        }
        if (String(url) === "https://cdn.example.test/clip.mp4") {
          return new Response(Buffer.from("video"), { headers: { "content-type": "video/mp4" } });
        }
        return new Response("not found", { status: 404 });
      },
      crypto: {
        randomBytes: () => ({ toString: () => "abcdef01" }),
      },
      fs,
      now: () => 1000,
    });

    assert.equal(service.extensionFromContentType("image/jpeg"), "jpg");
    assert.equal(service.extensionFromUrl("https://example.test/a.webp?x=1"), "webp");
    assert.equal(service.extensionFromFilePath("C:\\tmp\\a.mov"), "mov");
    assert.equal(service.inferMediaMimeType("a.mp4", "application/octet-stream"), "video/mp4");
    assert.equal(service.isSupportedMediaMime("audio/wav"), true);
    assert.equal(service.isVideoMediaUrl("/output/clip.webm"), true);
    assert.equal(service.isVideoMediaUrl("/output/image.png"), false);

    const dataFile = service.dataUrlToFile(`data:image/png;base64,${PNG_1X1.toString("base64")}`, "input");
    assert.equal(dataFile.filename, "input.png");
    assert.equal(dataFile.blob.type, "image/png");
    assert.deepEqual(service.getImageDimensionsFromBuffer(PNG_1X1), { width: 1, height: 1 });
    assert.deepEqual(
      service.getImageReferenceDimensions(`data:image/png;base64,${PNG_1X1.toString("base64")}`),
      { width: 1, height: 1 },
    );

    const saved = service.saveBinaryMedia(PNG_1X1, "saved.png", "image/png");
    assert.equal(saved.filename, "saved_1000_abcdef01.png");
    fs.writeFileSync(path.join(publicDir, "assets", "local.png"), PNG_1X1);
    assert.equal(service.resolveLocalImageReference("/assets/local.png"), path.join(publicDir, "assets", "local.png"));
    assert.equal(service.resolveLocalImageReference(saved.url), path.join(outputDir, saved.filename));
    const localMedia = await service.mediaReferenceToFile(saved.url, saved.filename, "image");
    assert.equal(localMedia.blob.type, "image/png");
    await assert.rejects(
      service.mediaReferenceToFile(saved.url, saved.filename, "video"),
      /unsupported media type/,
    );

    const remote = await service.imageReferenceToFile("https://cdn.example.test/image.png", "remote");
    assert.equal(remote.filename, "remote.png");
    assert.equal(remote.blob.type, "image/png");
    const remoteVideo = await service.saveRemoteVideo(
      "https://cdn.example.test/clip.mp4",
      "clip_",
      { timeoutMs: 1000 },
    );
    assert.equal(remoteVideo, "/output/clip_1000_abcdef01.mp4");
    assert.equal(fs.readFileSync(path.join(outputDir, "clip_1000_abcdef01.mp4"), "utf8"), "video");

    const request = new EventEmitter();
    request.destroy = () => {};
    const bodyPromise = service.readBodyBuffer(request);
    request.emit("data", Buffer.from("ab"));
    request.emit("data", Buffer.from("cd"));
    request.emit("end");
    assert.equal((await bodyPromise).toString("utf8"), "abcd");

    const oversized = new EventEmitter();
    oversized.destroy = () => {};
    const oversizedPromise = service.readBodyBuffer(oversized);
    oversized.emit("data", Buffer.alloc(1025));
    await assert.rejects(oversizedPromise, /too large/);

    assert.equal(service.decodeImageBase64(`data:image/png;base64,${PNG_1X1.toString("base64")}`).length, PNG_1X1.length);
    assert.equal((await service.fetchWithTimeout("https://cdn.example.test/image.png", {}, 1000)).ok, true);

    console.log("Media file service checks passed: MIME detection, references, dimensions, uploads, response parsing and downloads.");
  } finally {
    if (fs.realpathSync(root) !== realRoot || !path.basename(realRoot).startsWith("ai-os-media-file-")) {
      throw new Error("Temporary fixture path changed; cleanup refused.");
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
