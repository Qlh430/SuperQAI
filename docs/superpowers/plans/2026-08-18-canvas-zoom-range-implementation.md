# Canvas Zoom Range Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the infinite-canvas zoom range to 5%–400% while preserving pointer-anchored zoom, persistence, and the existing 100% reset behavior.

**Architecture:** Keep the existing canvas transform pipeline and introduce one canvas-specific normalization helper backed by shared minimum and maximum constants. Use that helper both for wheel interaction and restored viewport state so every entry point enforces the same range.

**Tech Stack:** Browser JavaScript, Node.js assertion checks, existing `npm run check` verification pipeline.

## Global Constraints

- Minimum canvas scale is exactly `0.05` (5%).
- Maximum canvas scale is exactly `4` (400%).
- Pointer-anchored wheel zoom behavior remains unchanged.
- Saved viewport schema remains unchanged at `viewport.scale`.
- Reset view remains exactly 100%.
- Do not add zoom sliders, buttons, or fit-to-content controls.
- Preserve all unrelated existing worktree changes.

---

### Task 1: Unify Canvas Zoom Bounds

**Files:**
- Create: `tools/check-canvas-zoom-range.js`
- Modify: `script.js:322-365`
- Modify: `script.js:3336-3348`
- Modify: `script.js:9936-10088`
- Modify: `package.json:7-8`

**Interfaces:**
- Consumes: existing `canvasState`, wheel handler, `restoreCanvasBoard(board)`, and `resetCanvasView()`.
- Produces: `CANVAS_SCALE_MIN`, `CANVAS_SCALE_MAX`, and `normalizeCanvasScale(value, fallback = 1) -> number`.

- [x] **Step 1: Write the failing focused check**

Create `tools/check-canvas-zoom-range.js`:

```js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");

function extractFunction(name) {
  const start = script.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `Missing function ${name}`);
  const bodyStart = script.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < script.length; index += 1) {
    if (script[index] === "{") depth += 1;
    if (script[index] === "}") {
      depth -= 1;
      if (depth === 0) return script.slice(start, index + 1);
    }
  }
  throw new Error(`Unterminated function ${name}`);
}

function extractBlock(startText, endText) {
  const start = script.indexOf(startText);
  assert.notStrictEqual(start, -1, `Missing block ${startText}`);
  const end = script.indexOf(endText, start);
  assert.notStrictEqual(end, -1, `Missing block end ${endText}`);
  return script.slice(start, end + endText.length);
}

assert.match(script, /const CANVAS_SCALE_MIN = 0\.05;/);
assert.match(script, /const CANVAS_SCALE_MAX = 4;/);

const normalizeSource = extractFunction("normalizeCanvasScale");
const scaleContext = {};
vm.runInNewContext(`
  const CANVAS_SCALE_MIN = 0.05;
  const CANVAS_SCALE_MAX = 4;
  ${normalizeSource}
  this.normalizeCanvasScale = normalizeCanvasScale;
`, scaleContext);

assert.strictEqual(scaleContext.normalizeCanvasScale(0.01), 0.05);
assert.strictEqual(scaleContext.normalizeCanvasScale(0.05), 0.05);
assert.strictEqual(scaleContext.normalizeCanvasScale(2.5), 2.5);
assert.strictEqual(scaleContext.normalizeCanvasScale(4), 4);
assert.strictEqual(scaleContext.normalizeCanvasScale(5), 4);
assert.strictEqual(scaleContext.normalizeCanvasScale(undefined), 1);
assert.strictEqual(scaleContext.normalizeCanvasScale("invalid"), 1);

const wheelBlock = extractBlock('viewport.addEventListener("wheel"', '}, { passive: false });');
assert.match(wheelBlock, /normalizeCanvasScale\(canvasState\.scale \* factor\)/);
assert.doesNotMatch(wheelBlock, /Math\.max\(0\.25/);
assert.match(extractFunction("restoreCanvasBoard"), /canvasState\.scale = normalizeCanvasScale\(board\.viewport\?\.scale, 1\);/);
assert.match(extractFunction("resetCanvasView"), /canvasState\.scale = 1;/);

console.log("Canvas zoom range checks passed.");
```

- [x] **Step 2: Run the focused check and verify RED**

Run:

```powershell
node tools/check-canvas-zoom-range.js
```

Expected: FAIL because `CANVAS_SCALE_MIN`, `CANVAS_SCALE_MAX`, and `normalizeCanvasScale` do not exist yet.

- [x] **Step 3: Implement the shared canvas scale rule**

Add immediately before `canvasState` in `script.js`:

```js
const CANVAS_SCALE_MIN = 0.05;
const CANVAS_SCALE_MAX = 4;

function normalizeCanvasScale(value, fallback = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(CANVAS_SCALE_MIN, Math.min(CANVAS_SCALE_MAX, numeric));
}
```

Replace the wheel clamp with:

```js
canvasState.scale = normalizeCanvasScale(canvasState.scale * factor);
```

Replace restored scale assignment with:

```js
canvasState.scale = normalizeCanvasScale(board.viewport?.scale, 1);
```

- [x] **Step 4: Register the focused check in the project check pipeline**

Insert the new focused command into the existing `check` script in `package.json`, immediately after `node tools/check-global-image-demand-loading.js`:

```json
"node tools/check-global-image-demand-loading.js && node tools/check-canvas-zoom-range.js"
```

- [x] **Step 5: Run the focused check and syntax validation to verify GREEN**

Run:

```powershell
node tools/check-canvas-zoom-range.js
node --check script.js
```

Expected: both commands exit 0; focused output is `Canvas zoom range checks passed.`

- [x] **Step 6: Run the complete project verification**

Run:

```powershell
npm run check
```

Expected: exit 0 with every existing check and the new canvas zoom range check passing.

- [x] **Step 7: Inspect the scoped diff without staging unrelated work**

Run:

```powershell
git diff --check -- script.js package.json tools/check-canvas-zoom-range.js
git diff -- script.js package.json tools/check-canvas-zoom-range.js
```

Expected: no whitespace errors; only the scale constants/helper, two call-site changes, focused check, and check-script registration belong to this task. Because `script.js` and `package.json` already contain unrelated user changes, do not commit or broadly stage these files.
