const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const noteRenderer = fs.readFileSync(path.join(root, "canvas-note-node-renderer.js"), "utf8");

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
  const start = source.indexOf(`\n${selector} {`);
  assert.notEqual(start, -1, `Missing CSS rule ${selector}`);
  const bodyStart = source.indexOf("{", start) + 1;
  const bodyEnd = source.indexOf("}", bodyStart);
  return source.slice(bodyStart, bodyEnd);
}

const boardInitialization = extractFunction(script, "initializeCanvasBoard");

// --- Right-click opens the canvas actions menu -------------------------------
assert.match(
  boardInitialization,
  /viewport\.addEventListener\("contextmenu",[\s\S]*?showCanvasContextMenu\(event\)/,
  "right-clicking the canvas must open the canvas actions menu",
);
assert.match(
  boardInitialization,
  /viewport\.addEventListener\("dblclick",[\s\S]*?showCanvasNodeMenu\(event\)/,
  "double-clicking the canvas must keep opening the create-node menu",
);
assert.match(
  boardInitialization,
  /event\.target\.closest\("\.canvas-node, #canvasNodeMenu, #canvasConnectMenu, #canvasImageMenu, \.canvas-selection-box, \.canvas-connection, \.canvas-note-palette"\)/,
  "double-clicking a node must not open the blank-canvas create menu",
);
assert.match(
  boardInitialization,
  /if \(isCanvasTypingTarget\(event\.target\)\) return;/,
  "editable fields must keep their native context menu",
);
assert.match(
  boardInitialization,
  /if \(event\.target\.closest\("#canvasNodeMenu, #canvasConnectMenu, #canvasImageMenu, .canvas-board-menu, .canvas-selection-tools, .canvas-note-palette"\)\) return;/,
  "right-clicking an open menu must not reopen the canvas context menu",
);
assert.match(script, /右键或双击空白处打开菜单/, "the canvas status bar must advertise both menu gestures");

// The canvas actions menu mirrors the DX OS entry list.
const contextMenuMarkup = script.slice(
  script.indexOf('id="canvasContextMenu"'),
  script.indexOf("</div>", script.indexOf('id="canvasContextMenu"')),
);
for (const [action, label] of [
  ["upload", "上传"],
  ["add-node", "添加节点"],
  ["undo", "撤销"],
  ["redo", "重做"],
  ["copy-all", "复制所有节点"],
  ["paste", "粘贴"],
]) {
  assert.match(
    contextMenuMarkup,
    new RegExp(`data-canvas-action="${action}"><span>${label}</span>`),
    `the canvas context menu must offer ${label}`,
  );
}
assert.match(contextMenuMarkup, /<kbd>Ctrl\+Z<\/kbd>/, "the undo entry must show its shortcut");
assert.match(contextMenuMarkup, /<kbd>Shift\+Ctrl\+Z<\/kbd>/, "the redo entry must show its shortcut");
assert.match(contextMenuMarkup, /<kbd>Ctrl\+V<\/kbd>/, "the paste entry must show its shortcut");
assert.match(
  script,
  /function showCanvasContextMenu\(event\)/,
  "missing showCanvasContextMenu",
);
assert.match(
  extractFunction(script, "showCanvasContextMenu"),
  /const localX = toSystemDelta\(event\.clientX - rect\.left\);/,
  "the context menu x coordinate must use one system delta",
);
assert.match(script, /function redoCanvasChange\(\)/, "missing redoCanvasChange");
assert.match(
  script,
  /if \(event\.key\.toLowerCase\(\) === "z"\) \{\s*\n\s*if \(event\.shiftKey\) redoCanvasChange\(\);\s*\n\s*else undoCanvasChange\(event\);/,
  "Shift+Ctrl+Z must redo, matching the menu shortcut",
);
assert.match(script, /function copyAllCanvasNodes\(\)/, "missing copyAllCanvasNodes");
assert.match(
  extractFunction(script, "copyAllCanvasNodes"),
  /canvasState\.clipboard = \{[\s\S]*?nodes: models,/,
  "copying every node must fill the canvas clipboard",
);

// --- Grouped create menu ----------------------------------------------------
const menuMarkup = script.slice(
  script.indexOf('id="canvasNodeMenu"'),
  script.indexOf('id="canvasConnectMenu"'),
);
for (const label of ["添加卡片", "生成节点", "工具与输出"]) {
  assert.ok(menuMarkup.includes(`>${label}</span>`), `create menu must keep the ${label} section`);
}
assert.equal(
  (menuMarkup.match(/canvas-menu-group-label/g) || []).length,
  3,
  "the create menu must render exactly three section labels",
);
assert.ok(!menuMarkup.includes("\\u"), "create menu labels must not keep escaped literals");
assert.match(menuMarkup, /data-canvas-node="note"/, "the create menu must offer a sticky note");
assert.equal(
  menuHtmlSectionOrder(menuMarkup),
  "cards,generate,tools",
  "the create menu groups must stay ordered cards → generate → tools",
);

function menuHtmlSectionOrder(markup) {
  const groupOf = {
    note: "cards",
    text: "cards",
    asset: "cards",
    upload: "cards",
    video: "cards",
    audio: "cards",
    "image-generator": "generate",
    "video-generator": "generate",
    midjourney: "generate",
    generator: "generate",
    comfy: "generate",
    llm: "generate",
    "minimax-h3": "generate",
    "video-api": "generate",
    director3d: "generate",
    loop: "tools",
    gallery: "tools",
    "asset-collection": "tools",
    "video-output": "tools",
  };
  const groups = [];
  for (const match of markup.matchAll(/data-canvas-node="([a-z0-9-]+)"/g)) {
    const group = groupOf[match[1]];
    assert.ok(group, `unexpected create menu entry ${match[1]}`);
    if (groups[groups.length - 1] !== group) groups.push(group);
  }
  return groups.join(",");
}

assert.match(
  extractFunction(script, "initializeCanvasBoard"),
  /if \(button\.dataset\.canvasNode === "note"\) addCanvasNote\(canvasState\.menuPoint\);/,
  "the create menu must dispatch the sticky note entry",
);

// --- Sticky note node plumbing ---------------------------------------------
assert.match(
  script,
  /const CANVAS_NOTE_COLORS = \["yellow", "pink", "orange", "green", "blue", "purple"\];/,
  "sticky notes must expose the six DX OS colors",
);
assert.match(script, /function addCanvasNote\(point, options = \{\}\)/, "missing addCanvasNote");
assert.match(script, /function renderCanvasNoteNode\(node, options = \{\}\)/, "missing renderCanvasNoteNode");
assert.match(
  extractFunction(script, "renderCanvasNoteNode"),
  /CanvasNoteNodeRenderer/,
  "renderCanvasNoteNode must delegate to the standalone renderer",
);
assert.match(noteRenderer, /function createPalette\(node, context\)/, "missing createPalette");
assert.match(script, /function setCanvasNoteColor\(node, color\)/, "missing setCanvasNoteColor");
assert.match(script, /function normalizeCanvasNoteColor\(value\)/, "missing normalizeCanvasNoteColor");
assert.match(
  extractFunction(script, "getCanvasNodeKind"),
  /if \(node\.classList\.contains\("canvas-node-note"\)\) return "note";/,
  "sticky notes must serialize as their own node kind",
);
assert.match(
  extractFunction(script, "getCanvasCreateKindFromSerialized"),
  /\["text", "note", "group"/,
  "sticky notes must survive serialization round trips",
);
assert.match(
  extractFunction(script, "serializeCanvasNode"),
  /base\.kind === "note"[\s\S]*?base\.noteColor = normalizeCanvasNoteColor\(node\.dataset\.noteColor\);/,
  "sticky notes must persist their text and color",
);
for (const name of ["restoreCanvasBoardNode", "pasteCanvasNodes"]) {
  assert.match(
    extractFunction(script, name),
    /item\.kind === "note"[\s\S]*?renderCanvasNoteNode\(node, \{ text: item\.text \|\| "", color: item\.noteColor \}\);/,
    `${name} must rebuild sticky notes`,
  );
}
assert.match(
  extractFunction(script, "createCanvasNodeFromConnectChoice"),
  /if \(choice === "note"\) return addCanvasNote\(point, \{ focus: false \}\);/,
  "connections must be able to spawn a sticky note",
);
assert.match(
  script,
  /else if \(node\.classList\.contains\("canvas-node-note"\)\) node\.style\.setProperty\("--canvas-note-height", `\$\{height\}px`\);/,
  "resizing a sticky note must drive its text height",
);
assert.match(
  extractFunction(script, "blurActiveCanvasText"),
  /active\.classList\?\.contains\("canvas-note-text"\)[\s\S]*?active\.blur\(\);/,
  "clicking the blank canvas must blur a sticky note editor so its palette hides at once",
);
assert.match(
  extractFunction(noteRenderer, "positionPalette"),
  /is-palette-below/,
  "a note parked under the canvas status pill must flip its palette below the card",
);

// --- Sticky note styling ----------------------------------------------------
const layers = ["yellow", "pink", "orange", "green", "blue", "purple"];
for (const color of layers) {
  assert.match(
    styles,
    new RegExp(`#canvasPlane \\.canvas-node\\.canvas-node-note\\[data-note-color="${color}"\\] \\{`),
    `sticky note ${color} must render with a dedicated surface`,
  );
  assert.match(
    styles,
    new RegExp(`\\.canvas-note-swatch\\[data-note-color="${color}"\\] \\{`),
    `sticky note swatch ${color} must render with a dedicated dot`,
  );
}
assert.match(
  extractCssRule(styles, ".canvas-note-palette"),
  /position:\s*absolute;[\s\S]*?background:\s*#1b1c1f;[\s\S]*?opacity:\s*0;/,
  "the note palette must float above the card and stay hidden until hover or selection",
);
assert.match(
  styles,
  /\.canvas-node-note:hover \.canvas-note-palette,\s*\n\s*\.canvas-node-note:focus-within \.canvas-note-palette,\s*\n\s*\.canvas-node-note\.is-selected \.canvas-note-palette \{/,
  "the note palette must be reachable from hover, focus and selection",
);
assert.match(
  extractCssRule(styles, ".canvas-note-palette::after"),
  /height:\s*10px;/,
  "the note palette must bridge the gap to the card so hover survives the trip",
);
assert.match(
  extractCssRule(styles, '.canvas-note-text[data-empty="true"]::before'),
  /content:\s*attr\(data-placeholder\);/,
  "empty sticky notes must show a placeholder",
);
assert.match(
  extractCssRule(styles, ".canvas-menu-group-label"),
  /color:\s*#8a93a3;/,
  "grouped menu labels must stay muted",
);

console.log("Canvas sticky note and grouped menu checks passed.");
