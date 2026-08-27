const assert = require("node:assert/strict");
const rules = require("../canvas-board-loading-rules");

assert.equal(rules.NODE_THRESHOLD, 30);
assert.equal(rules.FRAME_BUDGET_MS, 8);
assert.equal(rules.MIN_VISIBLE_MS, 240);
assert.equal(rules.shouldUseProgressiveRestore(29), false);
assert.equal(rules.shouldUseProgressiveRestore(30), true);
assert.equal(rules.shouldUseProgressiveRestore(186), true);
assert.equal(rules.getCanvasBoardRestoreProgress("nodes", 0, 100), 0);
assert.equal(rules.getCanvasBoardRestoreProgress("nodes", 50, 100), 40);
assert.equal(rules.getCanvasBoardRestoreProgress("nodes", 100, 100), 80);
assert.equal(rules.getCanvasBoardRestoreProgress("refs", 0, 100), 80);
assert.equal(rules.getCanvasBoardRestoreProgress("refs", 100, 100), 95);
assert.equal(rules.getCanvasBoardRestoreProgress("finalize", 0, 0), 95);
assert.equal(rules.getCanvasBoardRestoreProgress("complete", 0, 0), 100);
console.log("Canvas board loading rule checks passed.");
