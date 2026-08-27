const assert = require("assert");
const fs = require("fs");
const path = require("path");

const STYLE_SOURCE = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

function extractRule(selector) {
  const start = STYLE_SOURCE.indexOf(`\n${selector} {`);
  assert.notStrictEqual(start, -1, `Missing CSS rule for ${selector}`);
  const bodyStart = STYLE_SOURCE.indexOf("{", start) + 1;
  const bodyEnd = STYLE_SOURCE.indexOf("}", bodyStart);
  return STYLE_SOURCE.slice(bodyStart, bodyEnd);
}

const textRule = extractRule(".canvas-text");
const focusRule = extractRule(".canvas-text:focus");

assert.match(
  textRule,
  /color:\s*var\(--ink\)\s*;/,
  "Canvas text should inherit the active theme's foreground color",
);
assert.match(
  focusRule,
  /background:\s*var\(--field\)\s*;/,
  "Focused canvas text should use the active theme's field surface",
);

console.log("Canvas text theme checks passed.");
