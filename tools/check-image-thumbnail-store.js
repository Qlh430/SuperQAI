const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createThumbnailStore, stableThumbnailKey } = require("../image-thumbnail-store");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "check-image-thumbnails-"));

const store = createThumbnailStore({
  outputDir: path.join(root, "output"),
  dataFile: path.join(root, "data", "image-thumbnails.json"),
  maxBytes: 2 * 1024 * 1024,
});

assert.equal(stableThumbnailKey("/output/a.png"), stableThumbnailKey("/output/a.png"));
assert.equal(stableThumbnailKey("/output/a.png").length, 32);
assert.equal(store.lookup("/output/a.png"), null);

const saved = store.save({
  source: "/output/a.png",
  buffer: Buffer.from("RIFFfakeWEBP"),
  mimeType: "image/webp",
  width: 768,
  height: 512,
});
assert.match(saved.thumbnailUrl, /^\/output\/thumbnails\/[a-f0-9]{32}\.webp$/);
assert.equal(store.lookup("/output/a.png").thumbnailUrl, saved.thumbnailUrl);
assert.equal(fs.existsSync(store.resolveUrlPath(saved.thumbnailUrl)), true);

const lightweight = store.save({
  source: "/output/small.jpg",
  buffer: Buffer.alloc(0),
  mimeType: "image/jpeg",
  width: 1200,
  height: 800,
  lightweight: true,
});
assert.equal(lightweight.thumbnailUrl, "/output/small.jpg");
assert.equal(lightweight.lightweight, true);

const prototypeNamed = store.save({
  source: "__proto__",
  buffer: Buffer.alloc(0),
  mimeType: "image/jpeg",
  width: 640,
  height: 480,
  lightweight: true,
});
assert.equal(prototypeNamed.source, "__proto__");
assert.equal(store.lookup("__proto__").source, "__proto__");
const reopenedStore = createThumbnailStore({
  outputDir: path.join(root, "output"),
  dataFile: path.join(root, "data", "image-thumbnails.json"),
});
assert.equal(reopenedStore.lookup("__proto__").source, "__proto__");

assert.throws(
  () => store.save({ source: "../secret", buffer: Buffer.alloc(1), mimeType: "image/webp" }),
  /source/i,
);
assert.throws(
  () => store.save({ source: "/output/b.png", buffer: Buffer.alloc(3 * 1024 * 1024), mimeType: "image/webp" }),
  /large/i,
);
assert.throws(
  () => store.save({ source: "/output/c.png", buffer: Buffer.alloc(1), mimeType: "image/png" }),
  /type/i,
);

fs.writeFileSync(path.join(root, "data", "image-thumbnails.json"), "not-json");
const recovered = createThumbnailStore({
  outputDir: path.join(root, "output"),
  dataFile: path.join(root, "data", "image-thumbnails.json"),
});
assert.equal(recovered.lookup("/output/a.png"), null);

fs.rmSync(root, { recursive: true, force: true });

const serverSource = fs.readFileSync(path.resolve(__dirname, "..", "server.js"), "utf8");
assert.match(serverSource, /require\("\.\/image-thumbnail-store"\)/);
assert.match(serverSource, /const thumbnailStore = createThumbnailStore\(/);
assert.match(serverSource, /req\.url\.startsWith\("\/api\/image-thumbnails"\)/);
assert.match(serverSource, /async function handleImageThumbnails\(/);
assert.match(serverSource, /function resolveOutputPath\(/);
assert.match(serverSource, /decodeURIComponent\(String\(urlPath/);
assert.doesNotMatch(serverSource, /function serveOutput\(urlPath, res\) \{\s*const filename = path\.basename\(urlPath\)/);

console.log("Image thumbnail store checks passed.");
