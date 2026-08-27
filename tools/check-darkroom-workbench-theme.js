const assert = require("assert");
const fs = require("fs");
const path = require("path");

const STYLE_SOURCE = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const MARKER = "/* Darkroom workbench polish */";
const markerIndex = STYLE_SOURCE.lastIndexOf(MARKER);

assert.notStrictEqual(markerIndex, -1, "Missing final Darkroom workbench polish section");

function extractLastRule(selector) {
  const start = STYLE_SOURCE.lastIndexOf(`${selector} {`);
  assert.notStrictEqual(start, -1, `Missing CSS rule for ${selector}`);
  const bodyStart = STYLE_SOURCE.indexOf("{", start) + 1;
  const bodyEnd = STYLE_SOURCE.indexOf("}", bodyStart);
  return { start, body: STYLE_SOURCE.slice(bodyStart, bodyEnd) };
}

function channel(value) {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const value = hex.replace("#", "");
  return (
    0.2126 * channel(Number.parseInt(value.slice(0, 2), 16))
    + 0.7152 * channel(Number.parseInt(value.slice(2, 4), 16))
    + 0.0722 * channel(Number.parseInt(value.slice(4, 6), 16))
  );
}

function contrastRatio(foreground, background) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

const darkroomSection = STYLE_SOURCE.slice(markerIndex);
for (const declaration of [
  "--darkroom-canvas: #121311",
  "--darkroom-panel: #191a18",
  "--darkroom-field: #222320",
  "--darkroom-preview: #10110f",
  "--darkroom-line: #30312c",
  "--darkroom-ink: #f5f3ea",
  "--darkroom-muted: #aaa89f",
  "--darkroom-accent: #ffd23f",
]) {
  assert.ok(darkroomSection.toLowerCase().includes(declaration), `Missing token: ${declaration}`);
}

const imageClose = extractLastRule(':root[data-theme="dark"] #imageView.active .canvas-overlay-close');
assert.ok(imageClose.start > markerIndex);
assert.match(imageClose.body, /background:\s*var\(--darkroom-close\)\s*;/);
assert.match(imageClose.body, /color:\s*var\(--darkroom-close-ink\)\s*;/);

const imageCloseSvg = extractLastRule(':root[data-theme="dark"] #imageView.active .canvas-overlay-close svg');
assert.match(imageCloseSvg.body, /stroke:\s*currentColor\s*;/);

const imageCloseHover = extractLastRule(':root[data-theme="dark"] #imageView.active .canvas-overlay-close:hover');
assert.match(imageCloseHover.body, /background:\s*var\(--darkroom-accent\)\s*;/);
assert.match(imageCloseHover.body, /color:\s*#1a1914\s*;/);

const imageCloseFocus = extractLastRule(':root[data-theme="dark"] #imageView.active .canvas-overlay-close:focus-visible');
assert.match(imageCloseFocus.body, /outline:\s*3px solid/);

const historyTitle = extractLastRule(':root[data-theme="dark"] #chatView .history-chat strong');
assert.ok(historyTitle.start > markerIndex);
assert.match(historyTitle.body, /color:\s*var\(--darkroom-ink\)\s*;/);

const historyMeta = extractLastRule(':root[data-theme="dark"] #chatView .history-chat p');
assert.match(historyMeta.body, /color:\s*var\(--darkroom-muted\)\s*;/);

const overlayHistoryMeta = extractLastRule(
  ':root[data-theme="dark"] .canvas-first-shell #chatView.canvas-tool-overlay .history-chat p',
);
assert.ok(overlayHistoryMeta.start > markerIndex);
assert.match(overlayHistoryMeta.body, /color:\s*var\(--darkroom-muted\)\s*;/);

const activeIndicator = extractLastRule(':root[data-theme="dark"] #chatView .history-chat-row.active::before');
assert.match(activeIndicator.body, /width:\s*2px\s*;/);
assert.match(activeIndicator.body, /background:\s*var\(--darkroom-accent\)\s*;/);

assert.match(darkroomSection, /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition:\s*none\s*;/);
assert.ok(contrastRatio("#F5F3EA", "#191A18") >= 4.5);
assert.ok(contrastRatio("#AAA89F", "#191A18") >= 4.5);
assert.ok(contrastRatio("#FFF4C0", "#24251F") >= 3);
assert.ok(contrastRatio("#FFD23F", "#121311") >= 3);

console.log("Darkroom workbench theme checks passed.");
