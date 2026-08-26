const assert = require("node:assert/strict");
const { extractNodePreviewSources } = require("../canvas-node-preview-rules");

assert.deepEqual(extractNodePreviewSources({
  thumbnailSrc: "/thumb.webp",
  imageSrc: "/original.png",
  galleryImages: [{ thumbnailUrl: "/gallery.webp", src: "/gallery.png" }],
}), ["/thumb.webp", "/gallery.webp", "/original.png", "/gallery.png"]);

assert.deepEqual(extractNodePreviewSources({
  resultThumbnailSrc: "/result-thumb.webp",
  resultSrc: "/result.png",
  groupImages: JSON.stringify([
    { previewUrl: "/group-preview.webp", savedUrl: "/group-saved.png" },
    { thumbnailSrc: "/result-thumb.webp", src: "/duplicate.png" },
  ]),
}), [
  "/result-thumb.webp",
  "/group-preview.webp",
  "/group-saved.png",
  "/result.png",
  "/duplicate.png",
]);

assert.deepEqual(extractNodePreviewSources({ galleryImages: "{malformed" }), []);
assert.deepEqual(extractNodePreviewSources(null), []);

console.log("Canvas node preview rule checks passed.");
