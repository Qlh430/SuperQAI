const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const galleryRenderer = fs.readFileSync(path.join(root, "canvas-gallery-node-renderer.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `Missing function ${name}`);
  const paramsStart = source.indexOf("(", start);
  let paramsDepth = 0;
  let bodyStart = -1;
  for (let index = paramsStart; index < source.length; index += 1) {
    if (source[index] === "(") paramsDepth += 1;
    if (source[index] === ")") paramsDepth -= 1;
    if (paramsDepth === 0) {
      bodyStart = source.indexOf("{", index);
      break;
    }
  }
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
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unterminated function ${name}`);
}

const galleryRender = extractFunction(galleryRenderer, "render");
assert.ok(!galleryRender.includes("canvas-gallery-container-crop"), "The gallery header must not make an ambiguous current-image crop choice");
assert.ok(!galleryRender.includes("openCanvasCropWorkbench"), "The crop workbench must be entered from a specific image's context menu");
assert.match(extractFunction(script, "initializeCanvasBoard"), /canvas-gallery-member/, "Right-clicking a gallery member must identify that exact image");
assert.match(extractFunction(script, "showCanvasImageMenu"), /isGalleryMember/, "Gallery member menus must expose only the relevant crop action");
assert.ok(!galleryRender.includes("openCanvasGridMenu"), "Gallery containers must not retain a legacy crop entry");
assert.equal(script.indexOf("function ensureCanvasGridMenuMarkup"), -1, "Legacy container grid menu markup must be removed");
assert.equal(script.indexOf("function openCanvasGridMenu"), -1, "Gallery containers must not retain a legacy crop entry");
assert.equal(script.indexOf("function createCanvasDirectGridSlices"), -1, "Legacy direct gallery slicing must be removed");
assert.ok(extractFunction(script, "addCanvasGridEditorNode").includes("canvas-node-gallery-container"));
assert.ok(!script.includes("ensureCanvasGalleryGridSlicerMarkup"), "The obsolete full-screen slicer should be removed");
assert.ok(!styles.includes(".canvas-grid-slicer-shell"), "The obsolete full-screen slicer styles should be removed");
assert.ok(!styles.includes(".canvas-grid-menu"), "Retired menu styles must not remain reachable");
assert.ok(!styles.includes(".canvas-gallery-container-crop"), "The retired gallery-header crop button styles must be removed");
assert.ok(html.includes("grid-slicing-rules.js"), "Rules must load before the main canvas script");

console.log("Canvas gallery grid slicing checks passed");
