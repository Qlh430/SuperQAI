"use strict";
const fs = require("node:fs");
const sharp = require("sharp");
const { THUMBNAIL_MAX_SIDE, shouldGenerateThumbnail } = require("./image-loading-rules");

function createServerThumbnailService({ store, resolveSourcePath, sharpImpl = sharp, concurrency = 2 } = {}) {
  const pending = new Map();
  const waiters = [];
  const limit = Math.max(1, Number(concurrency) || 2);
  let active = 0;
  const acquire = () => active < limit ? (active++, Promise.resolve()) : new Promise((resolve) => waiters.push(resolve));
  const release = () => { const next = waiters.shift(); if (next) next(); else active--; };

  async function build(source) {
    await acquire();
    try {
      const filePath = resolveSourcePath(source);
      if (!filePath) throw new Error("Thumbnail requires a valid local source.");
      const input = sharpImpl(filePath, { animated: false, limitInputPixels: 268_402_689 });
      const metadata = await input.metadata();
      const rotated = Number(metadata.orientation) >= 5;
      const width = rotated ? metadata.height : metadata.width;
      const height = rotated ? metadata.width : metadata.height;
      if (!width || !height) throw new Error("Image dimensions are unavailable.");
      if (!shouldGenerateThumbnail({ width, height, bytes: fs.statSync(filePath).size })) {
        return store.save({ source, width, height, lightweight: true, maxSide: THUMBNAIL_MAX_SIDE });
      }
      const buffer = await input.rotate().resize({ width: THUMBNAIL_MAX_SIDE, height: THUMBNAIL_MAX_SIDE, fit: "inside", withoutEnlargement: true }).webp({ quality: 76 }).toBuffer();
      return store.save({ source, buffer, mimeType: "image/webp", width, height, maxSide: THUMBNAIL_MAX_SIDE });
    } finally { release(); }
  }

  function ensure(source) {
    if (!String(source || "").startsWith("/output/")) return Promise.reject(new Error("Thumbnail requires a local output source."));
    const cached = store.lookup(source);
    if (cached?.maxSide === THUMBNAIL_MAX_SIDE) return Promise.resolve(cached);
    if (pending.has(source)) return pending.get(source);
    const task = build(source).finally(() => pending.delete(source));
    pending.set(source, task);
    return task;
  }
  return { ensure };
}

module.exports = { createServerThumbnailService };
