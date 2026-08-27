const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
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

const galleryRender = extractFunction(script, "renderCanvasGalleryNode");
assert.ok(galleryRender.includes("canvas-gallery-slice-toggle"));
assert.ok(galleryRender.includes("openCanvasGridMenu"));
assert.ok(!script.includes("ensureCanvasGalleryGridSlicerMarkup"), "The obsolete full-screen slicer should be removed");
assert.ok(!styles.includes(".canvas-grid-slicer-shell"), "The obsolete full-screen slicer styles should be removed");
assert.match(styles, /\.canvas-grid-menu\s*\{[^}]*position:\s*fixed/s);
assert.match(styles, /\.canvas-gallery-slice-toggle\s*\{[^}]*position:\s*absolute[^}]*top:[^}]*right:\s*-\d+px/s);
assert.ok(html.includes("grid-slicing-rules.js"), "Rules must load before the main canvas script");

console.log("Canvas gallery grid slicing checks passed");
