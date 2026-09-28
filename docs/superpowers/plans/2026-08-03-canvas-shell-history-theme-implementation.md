# Canvas Shell and History Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the online-image first-paint flash, keep the default canvas landing distinct from a real blank board, make canvas-history close restore the prior state, and theme the history picker consistently.

**Architecture:** Keep the existing vanilla HTML/CSS/JavaScript structure. Correct the static first-paint classes in HTML, centralize landing-versus-active-board rendering in `syncCanvasWorkspaceState()`, and restyle the existing history picker with theme tokens and Lucide icons without changing persistence APIs.

**Tech Stack:** HTML, CSS custom properties, vanilla JavaScript, Lucide icons, Node.js assertion checks

## Global Constraints

- Do not change canvas API endpoints, board serialization, history ordering, search, trash, or delete behavior.
- Do not restore the newest board automatically and do not create or save a board when the history picker closes.
- The default landing keeps the existing start gate but hides “把图片和想法放到这里”; that origin hint appears only after creating or opening an empty board.
- All history-picker colors must use current theme tokens; do not hard-code yellow, blue, white, or dark card colors in the final overrides.
- Preserve unrelated user changes in the dirty worktree; do not stage or commit production files.

---

### Task 1: Add failing shell and history regression checks

**Files:**
- Create: `tools/check-canvas-shell-history-theme.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `index.html`, `script.js`, and `styles.css` as UTF-8 source files.
- Produces: one deterministic check invoked by `npm run check` that guards initial visibility, canvas state transitions, icon markup, and theme-token styling.

- [ ] **Step 1: Create the source-level regression check**

Create `tools/check-canvas-shell-history-theme.js` with checks equivalent to:

```js
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
  const bodyStart = script.indexOf("{", start);
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
assert.match(extractFunction("initializeCanvasFirstShell"), /view\.classList\.toggle\("active", view\.id === "canvasView"\)/);

const originState = extractFunction("updateCanvasOrigin");
assert.match(originState, /!canvasState\.activeBoardId\s*\|\|\s*hasNodes/);
assert.match(extractFunction("prepareBlankCanvasLanding"), /syncCanvasWorkspaceState\(\)/);
assert.match(extractFunction("restoreCanvasBoard"), /syncCanvasWorkspaceState\(\)/);
assert.match(extractFunction("createNewCanvasBoard"), /syncCanvasWorkspaceState\(\)/);

const closeHistory = extractFunction("closeCanvasBoardPanel");
assert.match(closeHistory, /syncCanvasWorkspaceState\(\)/);
assert.doesNotMatch(closeHistory, /createNewCanvasBoard|promptCreateCanvasBoard|restoreCanvasBoard/);
assert.match(script, /data-start-action="history"[\s\S]+?addEventListener\("click", \(\) => \{\s*openCanvasBoardPanel\(\);/);

for (const icon of ["refresh-cw", "trash-2", "plus", "x"]) {
  assert.match(script, new RegExp(`data-lucide="${icon}"`));
}
for (const label of ["刷新画布列表", "打开回收站", "新建画布", "关闭历史画布"]) {
  assert.match(script, new RegExp(`aria-label="${label}"`));
}

for (const selector of [
  ".canvas-board-card",
  ".canvas-board-tools button",
  ".canvas-board-item",
  ".canvas-board-item:hover",
  ".canvas-board-tools button:focus-visible,\n.canvas-board-item:focus-visible",
]) {
  const rule = extractLastRule(selector);
  assert.match(rule, /var\(--(?:panel|field|ink|muted|line-strong|accent|accent-soft|accent-contrast)/);
}

assert.match(html, /styles\.css\?v=20260803-canvas-shell-history-theme/);
assert.match(html, /script\.js\?v=20260803-canvas-shell-history-theme/);

console.log("Canvas shell and history theme checks passed.");
```

- [ ] **Step 2: Add the focused check to the project check command**

Append `&& node tools/check-canvas-shell-history-theme.js` to the `check` script in `package.json` without changing existing checks.

- [ ] **Step 3: Run the new check and verify RED**

Run: `node tools/check-canvas-shell-history-theme.js`

Expected: FAIL because online image is initially active, origin visibility ignores `activeBoardId`, toolbar uses text/Emoji icons, and the final theme-token rules do not exist.

---

### Task 2: Correct first-paint and canvas landing state transitions

**Files:**
- Modify: `index.html`
- Modify: `script.js`

**Interfaces:**
- Consumes: `canvasState.activeBoardId`, `.canvas-start-gate`, `.canvas-origin`, `prepareBlankCanvasLanding()`, `restoreCanvasBoard()`, and `createNewCanvasBoard()`.
- Produces: `syncCanvasWorkspaceState(): void`, which is the single UI synchronization point for default landing versus active board.

- [ ] **Step 1: Remove the incorrect static active state**

In `index.html`, change the online-image navigation button from `class="nav-item active"` to `class="nav-item"`, and change `#imageView` from `class="tool-view active"` to `class="tool-view"`.

- [ ] **Step 2: Stop dismissing the landing gate before a board exists**

In `initializeCanvasFirstShell()`, make the rail create button, gate double-click, gate new button, and gate history button open their corresponding panels without calling `dismissCanvasStartGate()` first. The history handler must be:

```js
gate.querySelector('[data-start-action="history"]').addEventListener("click", () => {
  openCanvasBoardPanel();
});
```

- [ ] **Step 3: Centralize active-board presentation**

Replace the one-way dismiss helper with:

```js
function syncCanvasWorkspaceState() {
  const hasActiveBoard = Boolean(canvasState.activeBoardId);
  document.querySelector(".canvas-workspace")?.classList.toggle("has-active-board", hasActiveBoard);
  document.querySelector(".canvas-start-gate")?.classList.toggle("is-dismissed", hasActiveBoard);
  updateCanvasOrigin();
}
```

Update `updateCanvasOrigin()` so the origin is visible only for an active empty board:

```js
function updateCanvasOrigin() {
  const origin = document.querySelector(".canvas-origin");
  const hasNodes = Boolean(document.querySelector("#canvasPlane .canvas-node"));
  if (origin) origin.hidden = !canvasState.activeBoardId || hasNodes;
}
```

- [ ] **Step 4: Synchronize every board-state transition**

Call `syncCanvasWorkspaceState()` after setting state in:

- `prepareBlankCanvasLanding()` after `activeBoardId` is set to `null`.
- `restoreCanvasBoard()` after nodes and viewport are restored, replacing its direct `updateCanvasOrigin()` call.
- `createNewCanvasBoard()` immediately after assigning the new id/title/date.
- `closeCanvasBoardPanel()` after hiding the panel.

The close function must remain side-effect free with respect to board data:

```js
function closeCanvasBoardPanel() {
  const panel = document.querySelector("#canvasBoardPanel");
  if (panel) panel.hidden = true;
  syncCanvasWorkspaceState();
}
```

- [ ] **Step 5: Update cache keys and run the focused check**

Set both cache keys in `index.html` to `20260803-canvas-shell-history-theme`.

Run: `node tools/check-canvas-shell-history-theme.js`

Expected: still FAIL only on history icon/theme assertions; first-paint and state-transition assertions pass.

---

### Task 3: Theme and polish the canvas history picker

**Files:**
- Modify: `script.js`
- Modify: `styles.css`

**Interfaces:**
- Consumes: existing canvas-board panel ids and click handlers plus the global Lucide initialization and CSS theme variables.
- Produces: accessible Lucide toolbar controls and theme-aware history cards with hover, active, and keyboard-focus feedback.

- [ ] **Step 1: Replace text and Emoji toolbar icons**

In `ensureCanvasMarkup()`, use this toolbar markup:

```html
<div class="canvas-board-tools">
  <button id="canvasBoardRefresh" class="canvas-board-icon-button" type="button" title="刷新画布列表" aria-label="刷新画布列表"><i data-lucide="refresh-cw"></i></button>
  <button id="canvasBoardTrash" class="canvas-board-icon-button" type="button" title="打开回收站" aria-label="打开回收站"><i data-lucide="trash-2"></i></button>
  <button id="canvasBoardNew" type="button" aria-label="新建画布"><i data-lucide="plus"></i><span>新建画布</span></button>
  <button id="canvasBoardClose" class="canvas-board-icon-button" type="button" title="关闭历史画布" aria-label="关闭历史画布"><i data-lucide="x"></i></button>
</div>
```

Keep the existing ids so all event listeners remain unchanged.

- [ ] **Step 2: Add final theme-token overrides**

Append a scoped history-picker block to `styles.css` that:

```css
.canvas-board-card {
  border-color: var(--line-strong);
  background: color-mix(in srgb, var(--panel) 96%, var(--stage));
  color: var(--ink);
}

.canvas-board-head strong,
.canvas-board-item strong,
.canvas-board-preview-empty {
  color: var(--ink);
}

.canvas-board-head span,
.canvas-board-head p,
.canvas-board-search span,
.canvas-board-item span {
  color: var(--muted);
}

.canvas-board-search input,
.canvas-board-item,
.canvas-board-preview {
  border-color: var(--line-strong);
  background: var(--field);
  color: var(--ink);
}

.canvas-board-search input:focus {
  border-color: color-mix(in srgb, var(--accent) 62%, var(--line-strong));
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.canvas-board-tools button {
  min-width: 38px;
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border-color: var(--line-strong);
  background: var(--field);
  color: var(--ink);
  cursor: pointer;
}

.canvas-board-tools .canvas-board-icon-button {
  width: 38px;
  padding: 0;
}

.canvas-board-tools svg {
  width: 17px;
  height: 17px;
}

.canvas-board-tools button:hover,
.canvas-board-tools button.active {
  border-color: color-mix(in srgb, var(--accent) 58%, var(--line-strong));
  background: var(--accent-soft);
  color: var(--ink);
}

.canvas-board-tools #canvasBoardTrash.active {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--ink);
}

.canvas-board-tools #canvasBoardNew {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--accent-contrast);
}

.canvas-board-item {
  box-shadow: none;
  transition: border-color 140ms ease, background-color 140ms ease, box-shadow 140ms ease;
}

.canvas-board-item:hover {
  border-color: color-mix(in srgb, var(--accent) 52%, var(--line-strong));
  background: color-mix(in srgb, var(--accent-soft) 54%, var(--field));
  box-shadow: 0 10px 26px color-mix(in srgb, var(--accent) 10%, transparent);
}

.canvas-board-item.active {
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent), 0 8px 22px color-mix(in srgb, var(--accent) 10%, transparent);
}

.canvas-board-item small {
  background: var(--accent-soft);
  color: color-mix(in srgb, var(--ink) 78%, var(--accent));
}

.canvas-board-item i {
  background: color-mix(in srgb, var(--panel) 88%, var(--field));
  color: var(--ink);
  cursor: pointer;
}

.canvas-board-item i:hover {
  background: var(--accent-soft);
  color: var(--ink);
}

.canvas-board-item em {
  background: var(--accent);
  color: var(--accent-contrast);
}

.canvas-origin {
  border-color: color-mix(in srgb, var(--accent) 34%, var(--line-strong));
  background: color-mix(in srgb, var(--panel) 88%, transparent);
  color: var(--muted);
}

.canvas-origin strong {
  color: var(--ink);
}

.canvas-board-tools button:focus-visible,
.canvas-board-item:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--accent) 42%, transparent);
  outline-offset: 2px;
}
```

- [ ] **Step 3: Run the focused check and verify GREEN**

Run: `node tools/check-canvas-shell-history-theme.js`

Expected: `Canvas shell and history theme checks passed.`

---

### Task 4: Verify behavior and regressions

**Files:**
- Verify only: `index.html`, `script.js`, `styles.css`, `package.json`, `tools/check-canvas-shell-history-theme.js`

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: evidence that state, styling, syntax, and existing project checks remain valid.

- [ ] **Step 1: Run focused and syntax checks**

Run:

```powershell
node tools/check-canvas-shell-history-theme.js
node --check script.js
```

Expected: both exit with code 0.

- [ ] **Step 2: Run the complete project check**

Run: `npm run check`

Expected: all checks exit with code 0, including the new canvas shell/history check.

- [ ] **Step 3: Check patch hygiene**

Run: `git diff --check`

Expected: exit code 0. Inspect `git diff -- index.html script.js styles.css package.json tools/check-canvas-shell-history-theme.js` and confirm no unrelated user changes were removed.

- [ ] **Step 4: Browser behavior checklist**

At desktop width in dark mode:

- Refresh: online image never appears before the canvas landing.
- Default landing: start gate is visible; `.canvas-origin` is hidden; no board id is created or saved.
- Open history from the start gate and press ×: history closes back to the start gate; `.canvas-origin` stays hidden; board count is unchanged.
- Create a new board: the start gate closes and `.canvas-origin` becomes visible until the first node is added.
- Open an existing board: its nodes restore and the start gate remains closed.
- Switch between yellow-black and red-blue palettes: history toolbar hover/focus/active state and cards follow each palette.
- Toggle trash: the trash button active state, empty state, restore, and delete controls remain readable.

Expected: all behaviors match the approved design with no data mutation on close.
