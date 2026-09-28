const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const rules = require("../canvas-layout-rules");

const EPSILON = 0.000001;

function block(id, x, y, width = 300, height = 200) {
  return { id, x, y, width, height };
}

function rectOf(blocks, plan, id) {
  const source = blocks.find((item) => item.id === id);
  const point = plan.positions[id];
  assert.ok(source, `missing block ${id}`);
  assert.ok(point, `missing position for ${id}`);
  return {
    left: point.x,
    top: point.y,
    right: point.x + source.width,
    bottom: point.y + source.height,
  };
}

function overlaps(left, right) {
  return left.left < right.right - EPSILON
    && right.left < left.right - EPSILON
    && left.top < right.bottom - EPSILON
    && right.top < left.bottom - EPSILON;
}

function assertNoOverlap(blocks, plan, label) {
  const placed = Object.keys(plan.positions);
  assert.equal(placed.length, blocks.length, `${label}: every block must be placed`);
  placed.forEach((id) => {
    const rect = rectOf(blocks, plan, id);
    ["left", "top", "right", "bottom"].forEach((edge) => {
      assert.equal(Number.isFinite(rect[edge]), true, `${label}: ${id} must have finite geometry`);
    });
  });
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) {
      const left = rectOf(blocks, plan, placed[i]);
      const right = rectOf(blocks, plan, placed[j]);
      assert.equal(overlaps(left, right), false, `${label}: ${placed[i]} overlaps ${placed[j]}`);
    }
  }
}

// --- Linear chain flows left to right --------------------------------------
{
  const blocks = [block("a", 0, 0), block("b", 1000, 50), block("c", -500, 900)];
  const plan = rules.planCanvasLayout({
    blocks,
    links: [{ from: "a", to: "b" }, { from: "b", to: "c" }],
    origin: { x: 0, y: 0 },
  });
  assertNoOverlap(blocks, plan, "chain");
  const a = plan.positions.a;
  const b = plan.positions.b;
  const c = plan.positions.c;
  assert.equal(a.x, 0, "an explicit origin anchors the first column");
  assert.equal(a.y, b.y, "a chain without branches must share one row");
  assert.equal(b.y, c.y, "a chain without branches must share one row");
  assert.equal(b.x - a.x, 300 + rules.COLUMN_GAP, "chain columns must keep the standard gap");
  assert.equal(c.x - b.x, 300 + rules.COLUMN_GAP, "chain columns must keep the standard gap");
  assert.equal(plan.columns.length, 3, "each chain node owns one column");
  assert.deepEqual(plan.columns.map((column) => column.length), [1, 1, 1]);
  assert.equal(plan.bounds.left, 0, "the plan keeps the original top-left anchor");
  assert.equal(plan.bounds.top, 0, "the plan keeps the original top-left anchor");
}

// --- Column budget keeps the board roughly square ---------------------------
{
  assert.equal(rules.defaultColumnBudget(1), rules.MIN_COLUMN_BUDGET, "tiny boards use the minimum budget");
  assert.equal(rules.defaultColumnBudget(16), 4, "a 4x4 board stays on the minimum budget");
  assert.equal(rules.defaultColumnBudget(17), 5, "the budget grows as the square root of the node count");
  assert.equal(rules.defaultColumnBudget(100), rules.MAX_COLUMN_BUDGET, "a 10x10 board hits the maximum budget");
  assert.equal(rules.defaultColumnBudget(100000), rules.MAX_COLUMN_BUDGET, "huge boards stay capped");
  assert.equal(rules.BAND_GAP > rules.ROW_GAP, true, "bands must be spaced wider apart than rows");
}

// --- A long chain wraps into bands instead of one endless row ---------------
{
  const count = 24;
  const blocks = [];
  const links = [];
  for (let index = 0; index < count; index += 1) {
    blocks.push(block(`n${index}`, index * 700, 0));
    if (index > 0) links.push({ from: `n${index - 1}`, to: `n${index}` });
  }
  const plan = rules.planCanvasLayout({ blocks, links, origin: { x: 0, y: 0 } });
  assertNoOverlap(blocks, plan, "banded chain");
  assert.equal(plan.columns.length, count, "every chain node keeps its own column");

  const budget = rules.defaultColumnBudget(count);
  const bandTops = [...new Set(Object.values(plan.positions).map((point) => point.y))].sort((a, b) => a - b);
  assert.equal(bandTops.length, Math.ceil(count / budget), "the chain wraps into the expected number of bands");
  assert.equal(plan.positions.n0.y, bandTops[0], "the first band starts at the origin");
  assert.equal(plan.positions.n0.x, 0, "the first band starts at the left edge");
  assert.equal(plan.positions[`n${budget}`].x, 0, "a new band restarts at the left edge");
  assert.equal(
    plan.positions[`n${budget}`].y >= plan.positions[`n${budget - 1}`].y + 200 + rules.BAND_GAP,
    true,
    "a new band starts below the previous band",
  );
  ["y", "x"].forEach((axis) => {
    const points = Object.values(plan.positions).map((point) => point[axis]);
    assert.equal(points.every((value) => Number.isFinite(value)), true, `banded ${axis} values stay finite`);
  });
  const width = plan.bounds.right - plan.bounds.left;
  const height = plan.bounds.bottom - plan.bounds.top;
  assert.equal(Math.round(width), budget * 300 + (budget - 1) * rules.COLUMN_GAP, "a band is exactly as wide as its columns");
  assert.equal(width < height * 2, true, "a long chain must not become one extremely wide strip");
  assert.equal(height > 0, true, "wrapping must add vertical extent");
}

// --- Diamond branch and merge ----------------------------------------------
{
  const blocks = [block("a", 0, 200), block("b", 600, 0), block("c", 600, 800), block("d", 1400, 300)];
  const plan = rules.planCanvasLayout({
    blocks,
    links: [
      { from: "a", to: "b" },
      { from: "a", to: "c" },
      { from: "b", to: "d" },
      { from: "c", to: "d" },
    ],
  });
  assertNoOverlap(blocks, plan, "diamond");
  assert.equal(plan.positions.a.x < plan.positions.b.x, true, "the source column comes first");
  assert.equal(plan.positions.b.x, plan.positions.c.x, "siblings share one column");
  assert.equal(plan.positions.b.y < plan.positions.c.y, true, "siblings keep their original top-to-bottom order");
  assert.equal(plan.positions.c.y - plan.positions.b.y >= 200 + rules.ROW_GAP, true, "stacked siblings keep the row gap");
  assert.equal(plan.positions.d.x > plan.positions.b.x, true, "the merge column follows the branches");
  assert.equal(plan.columns.length, 3, "a diamond spans three columns");
}

// --- Cycles still terminate and never overlap -------------------------------
{
  const blocks = [block("a", 0, 0), block("b", 400, 0), block("c", 800, 0)];
  const plan = rules.planCanvasLayout({
    blocks,
    links: [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "a" }],
  });
  assertNoOverlap(blocks, plan, "cycle");
  const columns = new Set([plan.positions.a.x, plan.positions.b.x, plan.positions.c.x]);
  assert.equal(columns.size, 3, "a three-node cycle must spread across three columns");
}

// --- Loose nodes are packed into a grid, not a tall column ------------------
{
  const blocks = [
    block("n1", 0, 0),
    block("n2", 40, 400),
    block("n3", 900, 30),
    block("n4", 2000, 2500),
  ];
  const plan = rules.planCanvasLayout({ blocks, links: [] });
  assertNoOverlap(blocks, plan, "loose grid");
  const columns = new Set(Object.values(plan.positions).map((point) => point.x));
  assert.equal(columns.size, 2, "four loose nodes must pack into a two-column grid");
  const rows = new Set(Object.values(plan.positions).map((point) => point.y));
  assert.equal(rows.size, 2, "four loose nodes must pack into two rows");
  assert.equal(plan.positions.n2.y - plan.positions.n1.y >= 200 + rules.ROW_GAP, true, "grid rows keep the row gap");
}

// --- Flow plus loose nodes in one board -------------------------------------
{
  const blocks = [
    block("a", 0, 0),
    block("b", 400, 0),
    block("loose1", 5000, 5000),
    block("loose2", 5200, 5100),
  ];
  const plan = rules.planCanvasLayout({ blocks, links: [{ from: "a", to: "b" }] });
  assertNoOverlap(blocks, plan, "mixed board");
  assert.equal(plan.positions.loose1.x > plan.positions.b.x, true, "loose nodes land after the flow");
  assert.equal(plan.positions.loose2.x > plan.positions.b.x, true, "loose nodes land after the flow");
}

// --- Determinism ------------------------------------------------------------
{
  const blocks = [block("a", 12, 30), block("b", 900, 30), block("c", 30, 900), block("d", 2000, 10)];
  const links = [{ from: "a", to: "b" }, { from: "a", to: "c" }, { from: "b", to: "d" }];
  const first = rules.planCanvasLayout({ blocks, links });
  const second = rules.planCanvasLayout({ blocks, links });
  assert.equal(JSON.stringify(first), JSON.stringify(second), "the layout must be deterministic");
}

// --- Every link points strictly rightwards ----------------------------------
{
  const blocks = [block("a", 900, 0), block("b", 0, 40), block("c", 400, 90), block("d", 10, 700)];
  const links = [
    { from: "a", to: "c" },
    { from: "b", to: "c" },
    { from: "c", to: "d" },
  ];
  const plan = rules.planCanvasLayout({ blocks, links });
  links.forEach((link) => {
    assert.equal(
      plan.positions[link.to].x > plan.positions[link.from].x,
      true,
      `${link.from} must sit left of ${link.to}`,
    );
  });
}

// --- Edge cases -------------------------------------------------------------
{
  const empty = rules.planCanvasLayout({ blocks: [], links: [] });
  assert.deepEqual(empty.positions, {});
  assert.equal(empty.bounds, null, "an empty board has no bounds");
  assert.deepEqual(rules.planCanvasLayout().positions, {}, "missing options must not throw");

  const dirty = rules.planCanvasLayout({
    blocks: [
      { id: "ok", x: 10, y: 20, width: 0, height: 0 },
      { id: "", x: 0, y: 0, width: 10, height: 10 },
      { id: "bad", x: "nope", y: 0, width: 10, height: 10 },
      { id: "ok", x: 999, y: 999, width: 500, height: 500 },
    ],
    links: [
      { from: "ok", to: "ok" },
      { from: "ok", to: "missing" },
      { from: "missing", to: "ok" },
      { from: "ok", to: "ok" },
    ],
  });
  assert.deepEqual(Object.keys(dirty.positions), ["ok"], "unusable blocks and links must be dropped");
  assert.equal(dirty.bounds.right - dirty.bounds.left, rules.FALLBACK_SIZE.width, "missing sizes fall back to the default block size");
}

// --- UI wiring --------------------------------------------------------------
const root = path.join(__dirname, "..");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");

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

const toolbar = script.slice(
  script.indexOf('class="header-actions canvas-actions"'),
  script.indexOf('class="canvas-status"'),
);
assert.match(
  toolbar,
  /<button id="canvasArrange" class="text-action" type="button" title="[^"]+">整理<\/button>/,
  "the canvas toolbar must expose the arrange button",
);
assert.equal(
  script.indexOf('id="canvasReset"') < script.indexOf('id="canvasArrange"')
    && script.indexOf('id="canvasArrange"') < script.indexOf('id="canvasClear"'),
  true,
  "the arrange button must sit between 复位 and 清空",
);
assert.match(
  script,
  /document\.querySelector\("#canvasArrange"\)\?\.addEventListener\("click", arrangeCanvasNodes\)/,
  "the arrange button must be wired to arrangeCanvasNodes",
);

const arrange = extractFunction(script, "arrangeCanvasNodes");
const arrangeScope = extractFunction(script, "getCanvasArrangeScope");
assert.match(arrange, /window\.CanvasLayoutRules/, "arranging must use the shared layout rules");
assert.match(arrange, /canvasState\.boardOpening \|\| canvasState\.isRestoring/, "arranging must refuse a still-loading board");
assert.match(
  arrange,
  /loadCanvasArrangeBoardData\(\)/,
  "arranging the whole board must hydrate nodes that are not resident yet",
);
const hydrate = extractFunction(script, "loadCanvasArrangeBoardData");
assert.match(
  hydrate,
  /saveCanvasBoardNow\(\{ recordUndo: false \}\)/,
  "local edits must be flushed before snapshotting the board without extra undo entries",
);
assert.match(
  extractFunction(script, "collectCanvasDirtyOperations"),
  /if \(!alreadyPending && recordUndo\)/,
  "the dirty scan must be able to flush without recording undo entries",
);
assert.match(hydrate, /fetchCanvasBoardExportPages\("nodes"\)/, "the snapshot must page through every node");
assert.match(hydrate, /fetchCanvasBoardExportPages\("connections"\)/, "the snapshot must page through every connection");
assert.match(hydrate, /canvasVirtualStore\.getMounted\(id\)/, "nodes already on screen keep their unsaved local geometry");
assert.match(
  extractFunction(script, "fetchCanvasBoardExportPages"),
  /export-page\?\$\{query\.toString\(\)\}/,
  "the snapshot must read through the board export-page API",
);
assert.match(arrange, /scope\.scope === "selection"/, "the status text must distinguish a selection from the whole board");
assert.match(arrangeScope, /getSelectedCanvasNodes\(\)/, "arranging must respect the current selection");
assert.match(arrangeScope, /canvasState\.selectedIds\.size >= 2/, "arranging must only narrow the scope for a real multi-selection");
assert.match(arrangeScope, /getCanvasDragNodes\(/, "arranging a selection must pull in group members");
assert.match(arrange, /getCanvasArrangeScope\(\)/, "arranging must resolve its scope through getCanvasArrangeScope");
assert.match(
  arrange,
  /stageCanvasOperation\(operation\)/,
  "arranging must stage operations so collaborators receive the new geometry",
);
assert.equal(
  (arrange.match(/recordCanvasUndo\(/g) || []).length,
  1,
  "arranging must record exactly one undo entry for the whole board",
);
assert.match(arrange, /label: "整理画布"/, "the undo entry must be labelled 整理画布");
assert.match(arrange, /scheduleCanvasSave\(\)/, "arranging must persist the new geometry");
assert.match(arrange, /updateCanvasNodePosition\(mounted\)/, "mounted nodes must be repositioned in the DOM");
assert.match(extractFunction(script, "focusCanvasArrangeResult"), /calculateFocusTransform/, "arranging must focus the result using the shared focus rules");
const layoutScriptIndex = indexHtml.indexOf('<script src="./canvas-layout-rules.js?v=');
const mainScriptIndex = indexHtml.indexOf('<script src="./script.js?v=');
assert.notEqual(layoutScriptIndex, -1, "index.html must load canvas-layout-rules.js");
assert.notEqual(mainScriptIndex, -1, "index.html must load script.js");
assert.equal(
  layoutScriptIndex < mainScriptIndex,
  true,
  "index.html must load canvas-layout-rules.js before script.js",
);

console.log("Canvas arrange layout rule checks passed.");
