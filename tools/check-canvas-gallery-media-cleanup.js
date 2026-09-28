const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.join(__dirname, "..");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const server = fs.readFileSync(path.join(root, "server.js"), "utf8");

const {
  collectOutputMediaUrls,
  deleteUnreferencedOutputMedia,
} = require("../canvas-media-cleanup");

assert.match(script, /const CANVAS_MEDIA_CLEANUP_API_URL = "\/api\/canvas\/media\/cleanup";/, "gallery deletes must use a dedicated media cleanup endpoint");
assert.match(script, /function scheduleCanvasGalleryMediaCleanup\(/, "gallery media cleanup must wait for the undo window");
assert.match(script, /const deletion = deleteCanvasNodes\(\[node\]\);[\s\S]*scheduleCanvasGalleryMediaCleanup\(deletion\?\.command, galleryImages\)/, "gallery deletion must retain the normal undo command before cleanup");
assert.match(script, /function finalizeCanvasGalleryMediaCleanup\([\s\S]*!canvasState\.undoStack\.includes\(command\)[\s\S]*!canvasState\.redoStack\.includes\(command\)/, "media cleanup must wait until the command can no longer be undone or redone");
assert.doesNotMatch(script, /scheduleCanvasGalleryMediaCleanup[\s\S]{0,600}setTimeout/, "gallery media cleanup must not impose a countdown-based undo window");
assert.match(server, /async function handleCanvasGalleryMediaCleanup\(/, "server must own the permanent output-file cleanup");
assert.match(server, /req\.method === "POST" && req\.url === "\/api\/canvas\/media\/cleanup"/, "media cleanup endpoint must be routed explicitly");

const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-gallery-media-cleanup-"));

try {
  fs.mkdirSync(path.join(outputDir, "nested"), { recursive: true });
  fs.writeFileSync(path.join(outputDir, "delete.png"), "delete");
  fs.writeFileSync(path.join(outputDir, "shared.png"), "shared");
  fs.writeFileSync(path.join(outputDir, "nested", "delete.webp"), "nested");
  fs.writeFileSync(path.join(outputDir, "outside.png"), "outside");

  const referenced = collectOutputMediaUrls({
    resultSrc: "/output/shared.png",
    galleryContainer: { members: [{ savedUrl: "/output/shared.png" }] },
  }, { outputDir });
  assert.deepEqual([...referenced], ["/output/shared.png"], "only valid output URLs must be treated as references");

  const thumbnailStore = {
    removed: [],
    remove(source) { this.removed.push(source); },
  };
  const result = deleteUnreferencedOutputMedia({
    candidateUrls: [
      "/output/delete.png",
      "/output/shared.png",
      "/output/nested/delete.webp",
      "/output/../outside.png",
      "https://example.invalid/not-local.png",
      "file:///D:/用户素材/保留原图.png",
      "D:\\用户素材\\保留原图.png",
    ],
    referencedUrls: referenced,
    outputDir,
    thumbnailStore,
  });

  assert.deepEqual(result.deletedUrls, ["/output/delete.png", "/output/nested/delete.webp"]);
  assert.deepEqual(result.retainedUrls, ["/output/shared.png"]);
  assert.deepEqual(result.ignoredUrls.sort(), [
    "/output/../outside.png",
    "https://example.invalid/not-local.png",
    "file:///D:/用户素材/保留原图.png",
    "D:\\用户素材\\保留原图.png",
  ].sort(), "external-disk paths must never be candidates for deletion");
  assert.equal(fs.existsSync(path.join(outputDir, "delete.png")), false, "unreferenced gallery media must be removed from disk");
  assert.equal(fs.existsSync(path.join(outputDir, "nested", "delete.webp")), false, "nested output media must be removed from disk");
  assert.equal(fs.existsSync(path.join(outputDir, "shared.png")), true, "media shared by another canvas node must remain available");
  assert.equal(fs.existsSync(path.join(outputDir, "outside.png")), true, "path traversal candidates must never touch a sibling output file");
  assert.deepEqual(thumbnailStore.removed.sort(), ["/output/delete.png", "/output/nested/delete.webp"].sort(), "thumbnail metadata must be removed with deleted originals");
} finally {
  fs.rmSync(outputDir, { recursive: true, force: true });
}

console.log("Canvas gallery media cleanup checks passed.");
