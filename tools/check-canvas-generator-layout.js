const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const SCRIPT_SOURCE = fs.readFileSync(path.join(ROOT, "script.js"), "utf8");
const RENDERER_SOURCE = fs.readFileSync(path.join(ROOT, "canvas-generator-node-renderer.js"), "utf8");
const STYLE_SOURCE = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `Missing function ${name}`);
  const bodyStart = source.indexOf("{", start);
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

assert.match(
  RENDERER_SOURCE,
  /classList\.toggle\("canvas-node-generator",\s*!src\)/,
  "Blank image nodes should receive the generator-specific class",
);
assert.match(
  STYLE_SOURCE,
  /\.canvas-node\.canvas-node-generator\s*\{[^}]*min-width:\s*320px/s,
  "Generator nodes should enforce a readable 320px minimum width",
);
assert.match(
  STYLE_SOURCE,
  /\.canvas-node-generator \.canvas-node-controls\s*\{[^}]*grid-template-columns:\s*minmax\(92px,\s*1fr\)\s+minmax\(92px,\s*1fr\)\s+112px/s,
  "Wide API generator controls should keep size, resolution, and run action aligned",
);
assert.doesNotMatch(
  STYLE_SOURCE,
  /\.canvas-node-generator \.canvas-node-platform\s*\{/,
  "API generators should not reserve a row for a redundant platform selector",
);
assert.match(
  STYLE_SOURCE,
  /\.canvas-node-generator \.canvas-node-controls \.image-model-picker\s*\{\s*grid-column:\s*1\s*\/\s*-1/,
  "API model selection should occupy its own readable row",
);
assert.match(
  STYLE_SOURCE,
  /@container\s*\(max-width:\s*459px\)[\s\S]*grid-template-columns:\s*minmax\(76px,\s*1fr\)\s+minmax\(104px,\s*1\.15fr\)\s+96px/,
  "Narrow generator controls should stay on one readable row",
);

const context = {};
vm.runInNewContext(
  `${extractFunction(SCRIPT_SOURCE, "getCanvasNodeMinWidth")}; this.getCanvasNodeMinWidth = getCanvasNodeMinWidth;`,
  context,
);
const nodeWithClasses = (...classes) => ({
  classList: {
    contains: (name) => classes.includes(name),
  },
});

assert.strictEqual(context.getCanvasNodeMinWidth(nodeWithClasses("canvas-node-generator")), 320);
assert.strictEqual(context.getCanvasNodeMinWidth(nodeWithClasses("canvas-node-group")), 180);
assert.strictEqual(context.getCanvasNodeMinWidth(nodeWithClasses("canvas-node-image")), 220);

console.log("Canvas generator responsive layout checks passed.");
