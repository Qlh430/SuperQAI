const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8").replace(/\r\n/g, "\n");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8").replace(/\r\n/g, "\n");

function extractFunction(name) {
  const start = script.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `Missing function ${name}`);
  const signatureEnd = script.indexOf(") {", start);
  assert.notStrictEqual(signatureEnd, -1, `Missing body for function ${name}`);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  for (let index = bodyStart; index < script.length; index += 1) {
    if (script[index] === "{") depth += 1;
    if (script[index] === "}") depth -= 1;
    if (depth === 0) return script.slice(start, index + 1);
  }
  throw new Error(`Unclosed function ${name}`);
}

function extractLastRule(selector) {
  const start = styles.lastIndexOf(`${selector} {`);
  assert.notStrictEqual(start, -1, `Missing CSS rule for ${selector}`);
  const bodyStart = styles.indexOf("{", start) + 1;
  const bodyEnd = styles.indexOf("}", bodyStart);
  return styles.slice(bodyStart, bodyEnd);
}

assert.doesNotMatch(html, /class="nav-item active"[^>]+data-tool="image"/);
assert.doesNotMatch(html, /class="tool-view active"[^>]+id="imageView"/);
assert.match(
  extractFunction("initializeCanvasFirstShell"),
  /view\.classList\.toggle\("active", view\.id === "canvasView"\)/,
);

const originState = extractFunction("updateCanvasOrigin");
assert.match(originState, /!canvasState\.activeBoardId\s*\|\|\s*hasNodes/);
assert.match(extractFunction("prepareBlankCanvasLanding"), /syncCanvasWorkspaceState\(\)/);
assert.match(extractFunction("restoreCanvasBoard"), /restoreCanvasBoardVirtually\(board\)/);
assert.match(extractFunction("restoreCanvasBoardVirtually"), /completeCanvasBoardRestore\(context\)/);
assert.match(extractFunction("completeCanvasBoardRestore"), /syncCanvasWorkspaceState\(\)/);
assert.match(extractFunction("createNewCanvasBoard"), /syncCanvasWorkspaceState\(\)/);

const showLibrary = extractFunction("showCanvasLibrary");
assert.match(showLibrary, /saveCanvasBoardNow\(\)/);
assert.match(showLibrary, /setCanvasAppScreen\("library"\)/);
assert.doesNotMatch(showLibrary, /createNewCanvasBoard|promptCreateCanvasBoard|restoreCanvasBoard/);

const renderHistory = extractFunction("renderCanvasBoardList");
assert.doesNotMatch(renderHistory, /trashButton\.textContent\s*=/);
assert.match(
  renderHistory,
  /trashButton\.innerHTML\s*=\s*isTrash\s*\?\s*'<i data-lucide="arrow-left"><\/i>'\s*:\s*'<i data-lucide="trash"><\/i>'/,
);
assert.match(renderHistory, /window\.lucide\?\.createIcons\(/);
assert.doesNotMatch(extractFunction("ensureCanvasMarkup"), /canvasBoardPanel|canvasHistoryButton|canvas-start-gate/);
assert.match(extractFunction("openCanvasBoardFromHistory"), /showCanvasEditor\(\)/);

for (const icon of ["refresh-cw", "trash", "plus", "x"]) {
  assert.match(script, new RegExp(`data-lucide="${icon}"`));
}
const trashButtonMarkup = script.match(/<button id="canvasBoardTrash"[^\n]+/)?.[0] || "";
assert.match(trashButtonMarkup, /data-lucide="trash"/);
assert.doesNotMatch(trashButtonMarkup, /data-lucide="trash-2"/);
for (const label of ["刷新画布列表", "打开回收站", "新建画布"]) {
  assert.match(script, new RegExp(`aria-label="${label}"`));
}
assert.match(script, /id="canvasLibraryBackButton"[\s\S]*?<span>返回项目<\/span>/);

for (const selector of [
  ".canvas-board-card",
  ".canvas-board-tools button",
  ".canvas-board-item",
  ".canvas-board-item:hover",
  ".canvas-board-tools button:focus-visible,\n.canvas-board-item:focus-visible",
]) {
  const rule = extractLastRule(selector);
  assert.match(
    rule,
    /var\(--(?:panel|field|ink|muted|line-strong|accent|accent-soft|accent-contrast)/,
  );
}

const newCanvasLabelRule = extractLastRule(
  ".canvas-board-head .canvas-board-tools #canvasBoardNew span",
);
assert.match(newCanvasLabelRule, /color:\s*inherit\s*;/);
assert.match(newCanvasLabelRule, /font-size:\s*13px\s*;/);
assert.match(newCanvasLabelRule, /font-weight:\s*800\s*;/);

const trashIconRule = extractLastRule(".canvas-board-tools #canvasBoardTrash svg");
assert.match(trashIconRule, /width:\s*20px\s*;/);
assert.match(trashIconRule, /height:\s*20px\s*;/);
assert.match(trashIconRule, /stroke-width:\s*2\.2px\s*;/);

assert.match(html, /styles\.css\?v=20260906-canvas-paint-continuity/);
assert.match(html, /script\.js\?v=20260906-canvas-paint-continuity/);

console.log("Canvas shell and library theme checks passed.");
