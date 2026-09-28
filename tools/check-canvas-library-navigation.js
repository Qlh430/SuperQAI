"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8").replace(/\r\n/g, "\n");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8").replace(/\r\n/g, "\n");
const desktop = fs.readFileSync(path.join(root, "desktop-shell.js"), "utf8").replace(/\r\n/g, "\n");
const desktopStyles = fs.readFileSync(path.join(root, "desktop-shell.css"), "utf8").replace(/\r\n/g, "\n");

function extractFunction(source, name, prefix = "function") {
  const marker = `${prefix} ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Missing ${name}`);
  const signatureEnd = source.indexOf(") {", start);
  assert.notEqual(signatureEnd, -1, `Missing body for ${name}`);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unclosed function ${name}`);
}

const markup = extractFunction(script, "ensureCanvasMarkup");
const libraryIndex = markup.indexOf('id="canvasLibraryScreen"');
const editorIndex = markup.indexOf('id="canvasEditorScreen"');
assert.ok(libraryIndex >= 0, "canvas library screen must exist");
assert.ok(editorIndex > libraryIndex, "library and editor must be sibling screens in library-first order");
assert.match(markup, /id="canvasLibraryScreen" class="canvas-library-screen"/);
assert.match(markup, /id="canvasEditorScreen" class="canvas-editor-screen" hidden/);
assert.match(markup, /class="canvas-editor-navigation"[\s\S]*?id="canvasImmersiveToggleButton"[\s\S]*?id="canvasLibraryBackButton"[\s\S]*?<span>返回项目<\/span>/);
assert.doesNotMatch(markup, /id="canvasBoardPanel"/);
assert.doesNotMatch(markup, /id="canvasHistoryButton"/);
assert.doesNotMatch(markup, /class="canvas-start-gate"/);
assert.doesNotMatch(markup, /关闭历史画布|历史画布/);

const initialShell = extractFunction(script, "initializeCanvasFirstShell");
assert.doesNotMatch(initialShell, /canvas-start-gate|data-start-action|openCanvasBoardPanel/);

const setScreen = extractFunction(script, "setCanvasAppScreen");
assert.match(setScreen, /screen === "editor" && canvasState\.activeBoardId \? "editor" : "library"/);
assert.match(setScreen, /library\.hidden = next !== "library"/);
assert.match(setScreen, /editor\.hidden = next !== "editor"/);
assert.match(setScreen, /dataset\.canvasScreen = next/);

const showLibrary = extractFunction(script, "showCanvasLibrary", "async function");
assert.ok(showLibrary.indexOf("setCanvasImmersive(false)") < showLibrary.indexOf("saveCanvasBoardNow()"), "returning to the library exits immersive mode before awaiting save");
assert.match(showLibrary, /saveCanvasBoardNow\(\)/);
assert.match(showLibrary, /setCanvasAppScreen\("library"\)/);
assert.match(showLibrary, /loadCanvasBoards\(/);

const showEditor = extractFunction(script, "showCanvasEditor");
assert.match(showEditor, /canvasState\.activeBoardId/);
assert.match(showEditor, /setCanvasAppScreen\("editor"\)/);
assert.match(showEditor, /setCanvasImmersive\(true\)/);

const setImmersive = extractFunction(script, "setCanvasImmersive");
assert.match(setImmersive, /renderCanvasImmersiveControl\(next\)/);
assert.match(setImmersive, /ai-os-app-immersive/);
const renderImmersive = extractFunction(script, "renderCanvasImmersiveControl");
assert.match(renderImmersive, /canvasState\.isImmersive = next/);
assert.match(renderImmersive, /canvasImmersiveToggleButton/);

const activate = extractFunction(script, "handleCanvasAppActivation", "async function");
assert.match(activate, /detail\?\.appId !== "canvas"/);
assert.match(activate, /openCanvasBoardByResourceId\(resourceId\)/);
assert.match(activate, /showCanvasLibrary\(\{ reload: !canvasState\.boardsLoadedAt \}\)/);

const openBoard = extractFunction(script, "openCanvasBoardFromHistory", "async function");
assert.match(openBoard, /canvasState\.activeBoardId = String\(board\.id\);[\s\S]*?showCanvasEditor\(\);[\s\S]*?setCanvasBoardLoading\(true/);
assert.match(openBoard, /catch \(error\)[\s\S]*?showCanvasLibrary\(\{ reload: false \}\)/);

const openApp = extractFunction(desktop, "openApp");
assert.match(openApp, /appId === "canvas"[\s\S]*screen: "library"/);
assert.match(openApp, /launchParams\.set\(appId, requestedParams\)/);

assert.match(styles, /\.canvas-library-screen\[hidden\],[\s\S]*?\.canvas-editor-screen\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
assert.match(styles, /\.canvas-library-screen\s*\{[\s\S]*?background:\s*var\(--stage\)/);
assert.match(styles, /\.canvas-library-screen \.canvas-board-card\s*\{[\s\S]*?width:\s*100%[\s\S]*?height:\s*100%/);
assert.match(styles, /\.canvas-editor-navigation\s*\{[\s\S]*?top:\s*12px[\s\S]*?left:\s*12px/);
assert.match(desktopStyles, /html\[data-ai-immersive-app="canvas"\] \.ai-os-menu-bar[\s\S]*?\.ai-os-dock[\s\S]*?visibility:\s*hidden/);
assert.match(desktopStyles, /\.ai-os-app-window\.is-immersive\s*\{[\s\S]*?inset:\s*0\s*!important[\s\S]*?width:\s*100%\s*!important[\s\S]*?height:\s*100%\s*!important/);

console.log("Canvas library navigation checks passed.");
