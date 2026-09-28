const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Missing function ${name}`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unterminated function ${name}`);
}

const container = {
  members: [{ id: "image-1", width: 1024, height: 1024 }],
};
let renders = 0;
const context = {
  Number,
  getCanvasGalleryContainer: () => container,
  setCanvasGalleryContainer: () => { renders += 1; },
  scheduleCanvasSave: () => {},
};
vm.runInNewContext(extractFunction("syncCanvasGalleryMemberIntrinsicSize"), context);

const reusableImageContext = {};
vm.runInNewContext([
  extractFunction("collectCanvasGalleryReusableImages"),
  extractFunction("takeCanvasGalleryReusableImage"),
].join("\n"), reusableImageContext);

const firstImage = {
  getAttribute: (name) => name === "data-original-src" ? "/output/first.png" : "",
  closest: () => ({ dataset: { galleryMemberId: "first" } }),
};
const secondImage = {
  getAttribute: (name) => name === "data-original-src" ? "/output/second.png" : "",
  closest: () => ({ dataset: { galleryMemberId: "second" } }),
};
const reusableImages = reusableImageContext.collectCanvasGalleryReusableImages({
  querySelectorAll: () => [firstImage, secondImage],
});
assert.equal(
  reusableImageContext.takeCanvasGalleryReusableImage(reusableImages, "second", "/output/second.png"),
  secondImage,
  "a gallery rerender must reuse the unchanged member image instead of registering a replacement",
);
assert.equal(
  reusableImageContext.takeCanvasGalleryReusableImage(reusableImages, "first", "/output/other.png"),
  null,
  "a reused image must never be attached to a member with a different source",
);

assert.equal(
  context.syncCanvasGalleryMemberIntrinsicSize({}, "image-1", {
    naturalWidth: 768,
    naturalHeight: 768,
    dataset: { imageQuality: "thumbnail" },
    getAttribute: (name) => name === "data-original-src" ? "/output/original.png" : "/output/thumb.webp",
  }),
  false,
  "thumbnail loading must not rewrite gallery dimensions and rerender the full gallery",
);
assert.equal(renders, 0, "thumbnail loading must preserve the existing gallery DOM");
assert.equal(
  context.syncCanvasGalleryMemberIntrinsicSize({}, "image-1", {
    naturalWidth: 2048,
    naturalHeight: 1536,
    dataset: { imageQuality: "original" },
    getAttribute: () => "/output/original.png",
  }),
  true,
  "a decoded original may correct persisted intrinsic dimensions once",
);
assert.equal(renders, 1, "original dimensions may cause exactly one layout refresh");

console.log("Canvas gallery image stability checks passed.");
