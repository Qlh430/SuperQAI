"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const { createThumbnailStore } = require("../image-thumbnail-store");
const { createServerThumbnailService } = require("../server-image-thumbnails");

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "server-thumbnails-"));
  try {
    const original = await sharp({ create: { width: 4096, height: 4096, channels: 4, background: { r: 35, g: 136, b: 187, alpha: 0.5 } } }).png().toBuffer();
    fs.writeFileSync(path.join(directory, "large.png"), original);
    const store = createThumbnailStore({ outputDir: directory, dataFile: path.join(directory, "registry.json") });
    let decodes = 0;
    const thumbnails = createServerThumbnailService({ store, resolveSourcePath: () => path.join(directory, "large.png"), sharpImpl: (...args) => { decodes++; return sharp(...args); } });
    const requests = await Promise.all(Array.from({ length: 5 }, () => thumbnails.ensure("/output/large.png")));
    assert.equal(decodes, 1, "concurrent LAN browsers must share one thumbnail encode");
    assert.ok(requests.every((item) => item.thumbnailUrl === requests[0].thumbnailUrl));
    assert.equal(requests[0].width, 4096);
    assert.equal(requests[0].height, 4096);
    assert.equal(requests[0].lightweight, false);
    const preview = fs.readFileSync(store.resolveUrlPath(requests[0].thumbnailUrl));
    const metadata = await sharp(preview).metadata();
    assert.equal(metadata.width, 640);
    assert.equal(metadata.height, 640);
    assert.equal(metadata.hasAlpha, true);
    assert.deepEqual(fs.readFileSync(path.join(directory, "large.png")), original, "4K original must stay untouched");
    await thumbnails.ensure("/output/large.png");
    assert.equal(decodes, 1, "cached previews must not regenerate");
    // Old preview caches must upgrade without changing or re-downloading the original.
    store.save({ source: "/output/large.png", buffer: await sharp(original).resize(768, 768).webp().toBuffer(), mimeType: "image/webp", width: 4096, height: 4096 });
    const upgraded = await thumbnails.ensure("/output/large.png");
    assert.equal((await sharp(fs.readFileSync(store.resolveUrlPath(upgraded.thumbnailUrl))).metadata()).width, 640);
    assert.equal(decodes, 2);
    const small = await sharp(original).resize(1024, 512).png().toBuffer();
    fs.writeFileSync(path.join(directory, "large.png"), small);
    const medium = await thumbnails.ensure("/output/medium.png");
    assert.equal(medium.lightweight, false, "1K originals also need a preview");
    const mediumMeta = await sharp(fs.readFileSync(store.resolveUrlPath(medium.thumbnailUrl))).metadata();
    assert.equal(mediumMeta.width, 640);
    assert.equal(mediumMeta.height, 320);
    const invalid = createServerThumbnailService({ store, resolveSourcePath: () => "" });
    await assert.rejects(invalid.ensure("https://external.example/image.png"), /local|source/i);
    console.log("Server 4K thumbnail checks passed.");
  } finally {
    assert.ok(path.resolve(directory).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`));
    fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
