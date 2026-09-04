"use strict";

const assert = require("node:assert/strict");
const display = require("../ai-os-display");

assert.deepEqual(display.SCALES, [0.75, 1, 1.25, 1.5, 1.75]);
assert.deepEqual(display.normalizePreferences({
  appearance: { theme: "dark", scale: 1.5, animations: "reduced", ignored: true },
  canvas: { theme: "light" },
}), { appearance: { theme: "dark", scale: 1.5, animations: "reduced" } });
assert.equal(display.normalizeScale(2), 1);
assert.equal(display.resolveTheme("system", { matches: true }), "dark");
assert.equal(display.resolveTheme("system", { matches: false }), "light");

console.log("AI OS display checks passed.");
