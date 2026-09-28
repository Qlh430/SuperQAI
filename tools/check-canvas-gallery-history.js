const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const galleryRenderer = fs.readFileSync(path.join(root, "canvas-gallery-node-renderer.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Missing function ${name}`);
  const bodyStart = source.indexOf("{", source.indexOf(")", start));
  assert.notEqual(bodyStart, -1, `Missing body for ${name}`);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unterminated function ${name}`);
}

let nextId = 0;
const dataContext = { createId: () => `gallery-${++nextId}` };
vm.runInNewContext([
  extractFunction(script, "normalizeCanvasGalleryImages"),
  extractFunction(script, "resolveCanvasGalleryActiveImage"),
  extractFunction(script, "applyRecoveredCanvasGalleryImage"),
].join("\n"), dataContext);

const normalized = JSON.parse(JSON.stringify(dataContext.normalizeCanvasGalleryImages([
  { src: "/old.png", name: "旧图" },
  { id: "new-id", src: "/new.png", savedUrl: "/saved.png", createdAt: "2026-07-29T00:00:00.000Z" },
])));
assert.equal(normalized[0].id, "gallery-1");
assert.equal(normalized[0].savedUrl, "/old.png");
assert.equal(normalized[1].name, "生成图 2");
assert.equal(dataContext.resolveCanvasGalleryActiveImage(normalized, "gallery-1").id, "gallery-1");
assert.equal(dataContext.resolveCanvasGalleryActiveImage(normalized, "missing").id, "new-id");
assert.equal(dataContext.resolveCanvasGalleryActiveImage([], "missing"), null);

const recovered = JSON.parse(JSON.stringify(dataContext.applyRecoveredCanvasGalleryImage([
  { id: "keep", src: "/output/keep.png", savedUrl: "/output/keep.png" },
  { id: "repair", src: "https://cdn.example/old.png", savedUrl: "https://cdn.example/old.png", syncState: "syncing" },
], "repair", { local_url: "/output/repaired.png", width: 1024, height: 1024 })));
assert.equal(recovered.length, 2, "Recovery must update rather than duplicate a member");
assert.equal(recovered[0].savedUrl, "/output/keep.png", "Recovery must preserve unrelated members");
assert.deepEqual(recovered[1], {
  id: "repair",
  src: "/output/repaired.png",
  savedUrl: "/output/repaired.png",
  syncState: "ready",
  width: 1024,
  height: 1024,
});

const render = extractFunction(galleryRenderer, "render");
const output = extractFunction(script, "getCanvasGalleryContainerOutput");
const append = extractFunction(script, "appendCanvasGenerationToGallery");
const select = extractFunction(script, "setCanvasGalleryActiveImage");
const nodeDelete = extractFunction(script, "requestCanvasGalleryNodeDelete");

assert(render.includes("canvas-gallery-container"));
assert(render.includes("canvas-gallery-member"));
assert(render.includes("registerCanvasDetailImage"), "Members should enter the canvas original-quality loading queue");
assert(!render.includes("createDeferredThumbnail"), "Members must not remain permanently capped at thumbnail quality");
assert(!render.includes("canvas-gallery-history-panel"), "Legacy history drawer must not return");
assert(output.includes('type: "images"'), "Container output must be an image collection");
assert(output.includes('member-output:'), "A member output must remain addressable");
assert(append.includes("setCanvasGalleryContainerMembers") && append.includes("nextImage.id"), "New results must become active members");
assert(select.includes("classList.toggle") && !select.includes("setCanvasGalleryContainerMembers"), "Member selection must update in place");
assert(nodeDelete.includes("删除整个图集？") && nodeDelete.includes("deleteCanvasNodes"), "Container delete must use the shared confirmation flow");

[
  ".canvas-node-gallery-container",
  ".canvas-gallery-container-members",
  ".canvas-gallery-member",
].forEach((selector) => assert(styles.includes(selector), `Missing container style: ${selector}`));
[
  ".canvas-gallery-history-panel",
  ".canvas-gallery-stack",
  ".canvas-gallery-cover",
].forEach((selector) => assert(!styles.includes(selector), `Legacy gallery style must be removed: ${selector}`));

console.log("Canvas gallery history checks passed.");
