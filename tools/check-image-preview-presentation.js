const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const script = fs.readFileSync(path.join(ROOT, "script.js"), "utf8");
const styles = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8").replace(/\r\n/g, "\n");

function extractLastRule(selector) {
  const needle = `${selector} {`;
  let start = -1;
  let cursor = 0;
  while ((cursor = styles.indexOf(needle, cursor)) !== -1) {
    if (cursor === 0 || styles[cursor - 1] === "\n") start = cursor;
    cursor += needle.length;
  }
  assert.notStrictEqual(start, -1, `Missing CSS rule for ${selector}`);
  const bodyStart = styles.indexOf("{", start) + 1;
  const bodyEnd = styles.indexOf("}", bodyStart);
  return styles.slice(bodyStart, bodyEnd);
}

const imageStageMarkup = html.slice(html.indexOf('id="imageStage"'), html.indexOf('id="clearImages"'));
assert.match(imageStageMarkup, /<span>\u56fe\u7247\u9884\u89c8<\/span>/);
assert.doesNotMatch(imageStageMarkup, /<p>|output\s+\u6587\u4ef6\u5939/);
assert.match(script, /imageStage\.innerHTML = '<div class="empty-state"><span>\u56fe\u7247\u9884\u89c8<\/span><\/div>';/);

const cardRule = extractLastRule("#imageView .image-card");
assert.match(cardRule, /background:\s*transparent\s*;/);
assert.match(cardRule, /box-shadow:\s*none\s*;/);

const imageRule = extractLastRule("#imageView .image-card img");
assert.match(imageRule, /object-fit:\s*contain\s*;/);
assert.match(imageRule, /background:\s*transparent\s*;/);

const captionRule = extractLastRule("#imageView .image-card figcaption");
assert.match(captionRule, /inset:\s*0\s*;/);
assert.match(captionRule, /background:\s*transparent\s*;/);
assert.match(captionRule, /border:\s*0\s*;/);
assert.match(captionRule, /box-shadow:\s*none\s*;/);
assert.match(captionRule, /backdrop-filter:\s*none\s*;/);
assert.match(captionRule, /pointer-events:\s*none\s*;/);

const pillsRule = extractLastRule("#imageView .image-card figcaption > span:first-child,\n#imageView .image-actions");
assert.match(pillsRule, /background:\s*color-mix\(in srgb, var\(--panel\) 88%, transparent\)\s*;/);
assert.match(pillsRule, /pointer-events:\s*auto\s*;/);

const metaPillRule = extractLastRule("#imageView .image-card figcaption > span:first-child");
assert.match(metaPillRule, /position:\s*absolute\s*;/);
assert.match(metaPillRule, /left:\s*12px\s*;/);
assert.match(metaPillRule, /bottom:\s*12px\s*;/);
assert.match(metaPillRule, /width:\s*fit-content\s*;/);

const actionsPillRule = extractLastRule("#imageView .image-actions");
assert.match(actionsPillRule, /position:\s*absolute\s*;/);
assert.match(actionsPillRule, /right:\s*12px\s*;/);
assert.match(actionsPillRule, /bottom:\s*12px\s*;/);
assert.match(actionsPillRule, /width:\s*fit-content\s*;/);

const actionRule = extractLastRule("#imageView .image-card a,\n#imageView .image-actions button");
assert.match(actionRule, /color:\s*inherit\s*;/);
assert.match(actionRule, /border-bottom-color:\s*currentColor\s*;/);

const darkCardRule = extractLastRule(':root[data-theme="dark"] #imageView .image-card');
assert.match(darkCardRule, /background:\s*transparent\s*;/);
assert.match(darkCardRule, /border-color:\s*transparent\s*;/);

const darkCaptionRule = extractLastRule(':root[data-theme="dark"] #imageView .image-card figcaption');
assert.match(darkCaptionRule, /background:\s*transparent\s*;/);
assert.match(darkCaptionRule, /box-shadow:\s*none\s*;/);

const darkPillsRule = extractLastRule(':root[data-theme="dark"] #imageView .image-card figcaption > span:first-child,\n:root[data-theme="dark"] #imageView .image-actions');
assert.match(darkPillsRule, /background:\s*color-mix\(in srgb, var\(--darkroom-panel\) 90%, transparent\)\s*;/);
assert.match(darkPillsRule, /color:\s*var\(--darkroom-ink\)\s*;/);

assert.match(html, /styles\.css\?v=20260906-canvas-paint-continuity/);

console.log("Image preview presentation checks passed.");
