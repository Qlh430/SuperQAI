const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const SCRIPT_SOURCE = fs.readFileSync(path.join(ROOT, "script.js"), "utf8");
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
  SCRIPT_SOURCE,
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
  /grid-template-columns:\s*minmax\(96px,\s*180px\)\s+112px\s+minmax\(0,\s*1fr\)\s+120px/,
  "Wide generator controls should cap both selectors and keep the run button at the right",
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
