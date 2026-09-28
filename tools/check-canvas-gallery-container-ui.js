const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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

function extractCssRule(source, selector) {
  let start = source.indexOf(`${selector} {`);
  if (start === -1) {
    // The rule may lead a shared selector list, e.g. "selector,\n.other {".
    const listed = source.indexOf(`\n${selector},`);
    start = listed === -1 ? -1 : listed + 1;
  }
  assert.notEqual(start, -1, `Missing CSS rule ${selector}`);
  const end = source.indexOf("\n}", start);
  assert.notEqual(end, -1, `Unterminated CSS rule ${selector}`);
  return source.slice(start, end + 2);
}

const render = extractFunction(galleryRenderer, "render");
const boardInitialization = extractFunction(script, "initializeCanvasBoard");
assert.ok(render.includes("canvas-node-gallery-container"));
assert.ok(render.includes("canvas-gallery-container-members"));
assert.ok(render.includes("canvas-gallery-member"));
assert.ok(render.includes("data-gallery-member-id"));
assert.doesNotMatch(render, /member-input:/, "gallery members must not render individual input handles");
assert.ok(render.includes("member-output:"));
assert.ok(render.includes("shouldRenderCanvasGalleryMemberOutput"), "a one-image gallery must suppress the duplicate member output");
assert.ok(render.includes("canvas-gallery-container-output-port"), "the gallery output must have a distinct visual role");
assert.doesNotMatch(render, /outputPort\.textContent\s*=/, "gallery output must not render text inside the port");
assert.doesNotMatch(render, /memberPort\.textContent\s*=/, "member output must not render text inside the port");
assert.doesNotMatch(render, /getCanvasGalleryContainerMemberColumnIndices\(/, "gallery members must fill a stable row-first grid instead of shortest-height columns");
assert.match(render, /getCanvasGalleryContainerRenderState\(renderContainer,\s*\{/, "gallery rendering must use hydrated image dimensions and persisted node dimensions");
assert.match(render, /membersEl\.append\(item\)/, "gallery members must be appended in their stored order");
assert.doesNotMatch(render, /列自动排列/, "the gallery footer must not expose an opaque fixed-column mode");
assert.ok(render.includes("registerCanvasDetailImage"), "gallery members must participate in canvas original-quality loading");
assert.doesNotMatch(render, /createDeferredThumbnail/, "gallery members must not be permanently capped at thumbnail quality");
assert.doesNotMatch(render, /setCanvasGalleryContainer\(node/, "member selection must not rebuild the container grid");
assert.ok(!render.includes("canvas-gallery-history-panel"));
assert.doesNotMatch(script, /function renderCanvasGalleryNode\(/, "runtime must not retain the legacy gallery renderer");
assert.doesNotMatch(script, /function renderCanvasGalleryHistory\(/, "runtime must not retain the legacy history drawer renderer");
assert.doesNotMatch(script, /function renderCanvasGalleryImages\(/, "runtime must not retain the legacy cover renderer");
assert.doesNotMatch(script, /function closeCanvasGalleryHistoryPanels\(/, "runtime must not retain legacy history drawer controls");
assert.doesNotMatch(styles, /\.canvas-gallery-history-panel\s*\{/, "legacy history drawer styles must be removed");
assert.doesNotMatch(styles, /\.canvas-gallery-stack\s*\{/, "legacy cover stack styles must be removed");
assert.match(styles, /\.canvas-node-gallery-container\s*\{/);
assert.match(styles, /\.canvas-gallery-container-members\s*\{/);
assert.match(
  extractCssRule(styles, ".canvas-node-gallery-container"),
  /grid-template-rows:\s*38px minmax\(0, 1fr\) 30px/,
  "gallery chrome must retain fixed header and footer tracks while only the image region grows",
);
assert.match(
  extractCssRule(styles, ".canvas-gallery-container-members"),
  /align-content:\s*start/,
  "gallery members must stay tightly packed at the top instead of distributing extra height into rows",
);
assert.match(styles, /\.canvas-gallery-member\s*\{/);
assert.match(styles, /\.canvas-gallery-member-port\s*\{/);
assert.doesNotMatch(styles, /\.canvas-gallery-member-input-port\s*\{/, "member input-port styling must be removed with the port");
assert.match(styles, /width:\s*var\(--canvas-gallery-container-width,\s*120px\)/, "gallery width must follow its unpadded image columns");
assert.match(styles, /grid-template-columns:\s*repeat\(var\(--canvas-gallery-container-columns,\s*2\),\s*minmax\(0,\s*1fr\)\)/, "gallery members must use the adaptive grid column count");
assert.doesNotMatch(styles, /\.canvas-gallery-container-column\s*\{/, "gallery members must not be wrapped in shortest-height columns");
assert.doesNotMatch(styles, /column-count:\s*var\(--canvas-gallery-container-columns,\s*2\)/, "balanced CSS columns must not reshuffle members while images load");
assert.match(styles, /column-gap:\s*var\(--canvas-gallery-container-gap,\s*16px\)/, "gallery columns must leave a visible output-port gutter");
assert.match(styles, /row-gap:\s*var\(--canvas-gallery-container-gap,\s*16px\)/, "gallery rows must leave the same deliberate output-port gutter");
assert.match(extractCssRule(styles, ".canvas-gallery-container-members"), /margin:\s*16px/, "gallery images must sit inside a consistent container inset");
assert.match(styles, /height:\s*auto;\s*\n\s*min-height:\s*0;\s*\n\s*max-height:\s*none/, "member images must retain their natural aspect ratio");
assert.doesNotMatch(extractCssRule(styles, ".canvas-gallery-member"), /border:\s*1px/, "gallery members must not render card borders");
assert.match(extractCssRule(styles, ".canvas-gallery-member-port"), /top:\s*auto/, "member outputs must not inherit the generic center anchor");
assert.match(extractCssRule(styles, ".canvas-gallery-member-port"), /bottom:\s*10px/, "member outputs must remain anchored to their image bottom edge");
assert.match(extractCssRule(styles, ".canvas-gallery-member-port"), /transform:\s*translateX\(-4px\) scale\(0\.82\) !important/, "member outputs must stay hidden without inheriting the generic center transform");
assert.match(extractCssRule(styles, ".canvas-gallery-member-preview"), /transition:\s*transform 180ms ease, box-shadow 180ms ease/, "member images must use the restrained hover transition");
assert.match(extractCssRule(styles, ".canvas-gallery-member:hover .canvas-gallery-member-preview"), /transform:\s*translateY\(-5px\) scale\(1\.006\)/, "hovered member images must float toward the user");
assert.doesNotMatch(styles, /\.canvas-gallery-member::after\s*\{/, "member output ports must sit directly on the image without a guide line");
assert.match(extractCssRule(styles, ".canvas-gallery-member-output-port"), /border-radius:\s*999px/, "member outputs must use a refined circular form");
assert.match(extractCssRule(styles, ".canvas-gallery-member-output-port"), /right:\s*-6px/, "member output ports must sit centered on the image edge");
assert.match(extractCssRule(styles, ".canvas-gallery-member-output-port"), /background:\s*var\(--accent\) !important/, "member output ports must use the gallery output color");
assert.doesNotMatch(extractCssRule(styles, ".canvas-gallery-member-output-port"), /font-size/, "member outputs must not render text");
assert.doesNotMatch(extractFunction(script, "setCanvasGalleryActiveImage"), /setCanvasGalleryContainerMembers\(/, "active member selection must not rebuild members");
assert.match(boardInitialization, /viewport\.addEventListener\("contextmenu",[\s\S]*?showCanvasContextMenu\(event\)/, "right-clicking the canvas must open the canvas actions menu");
assert.match(boardInitialization, /event\.target\.closest\("#canvasNodeMenu, #canvasConnectMenu/, "right-clicking an open menu must not reopen the canvas context menu");
assert.match(boardInitialization, /isCanvasTypingTarget\(event\.target\)/, "right-clicking an editable field must keep the native context menu");
assert.match(boardInitialization, /viewport\.addEventListener\("dblclick",[\s\S]*?showCanvasNodeMenu\(event\)/, "double-clicking an empty canvas must still open the create-node menu");
assert.match(boardInitialization, /event\.target\.closest\("\.canvas-node, #canvasNodeMenu, #canvasConnectMenu, #canvasImageMenu, \.canvas-selection-box, \.canvas-connection, \.canvas-note-palette"\)/, "double-clicking an existing node must not open the blank-canvas create menu");
const finalConnectionStyles = styles.slice(styles.lastIndexOf("/* Make canvas node connections more implicit. */"));
assert.match(finalConnectionStyles, /stroke-width:\s*1\.6px !important/, "persisted connections must retain their original restrained weight");
assert.match(finalConnectionStyles, /stroke-dasharray:\s*7 9 !important/, "persisted connections must retain their original dashed treatment");
assert.match(finalConnectionStyles, /stroke:\s*rgba\(51, 53, 51, 0\.23\) !important/, "light-theme persisted connections must retain their original color");
assert.match(finalConnectionStyles, /stroke:\s*rgba\(214, 214, 214, 0\.22\) !important/, "dark-theme persisted connections must retain their original color");
assert.ok(script.includes('id="canvasConnectionsOverlay"'), "gallery member connections need a dedicated visual layer above nodes");
assert.ok(extractFunction(script, "renderCanvasConnections").includes("canvasConnectionsOverlay"), "member connections must render their full original path in the visual overlay");
assert.ok(extractFunction(script, "renderCanvasConnections").includes("isMemberConnection"), "only member-image connections should move above their source gallery");
assert.match(extractFunction(script, "initializeCanvasConnectionSvg"), /svg\.addEventListener\("pointerdown",[\s\S]*?stopPropagation\(\)/, "connection hits must stop canvas panning before their click can delete a line");
assert.ok(extractFunction(script, "syncCanvasGalleryMemberOutputPortVisibility").includes('startsWith("member-output:")'), "connected member outputs must remain identifiable after the pointer leaves");
assert.match(extractCssRule(styles, ".canvas-gallery-member-output-port.is-connected"), /opacity:\s*1 !important/, "connected member outputs must stay visible");
assert.match(extractCssRule(styles, ".canvas-gallery-member-output-port.is-connected"), /visibility:\s*visible !important/, "connected member outputs must not be hidden after connecting");
assert.match(extractCssRule(styles, ".canvas-connections-overlay"), /z-index:\s*3/, "member-image connection paths must render above their gallery contents");
assert.match(extractCssRule(styles, ".canvas-connections-overlay"), /pointer-events:\s*none/, "visual connection overlays must not block ports or node controls");

console.log("Canvas gallery container UI checks passed");
