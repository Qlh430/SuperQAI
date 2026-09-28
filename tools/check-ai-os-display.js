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
assert.deepEqual(display.logicalViewport(1440, 900, 1.5, {
  menuBarHeight: 38,
  dockHeight: 86,
}), { width: 960, height: 476 });
assert.equal(display.logicalDelta(150, 1.5), 100);

const desktopStyle = {};
let preferenceEvent;
const fakeDocument = {
  getElementById(id) {
    return id === "aiOsDesktop" ? { style: { setProperty(key, value) { desktopStyle[key] = value; } } } : null;
  },
  defaultView: {
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    dispatchEvent(event) { preferenceEvent = event; },
  },
};
const rootStyle = {};
const fakeRoot = {
  dataset: {},
  style: { setProperty(key, value) { rootStyle[key] = value; } },
  ownerDocument: fakeDocument,
  removeAttribute() {},
};
const preferences = display.applyPreferences({ appearance: { theme: "light", scale: 1.75 } }, fakeRoot, { matches: false });
assert.deepEqual(preferences, { appearance: { theme: "light", scale: 1.75, animations: "full" } });
assert.equal(fakeRoot.dataset.themeMode, "light");
assert.equal(fakeRoot.dataset.theme, "light");
assert.equal(fakeRoot.dataset.uiScale, "1.75");
assert.equal(rootStyle["--system-scale"], "1.75", "document root exposes the scale to top-layer UI");
assert.equal(desktopStyle["--system-scale"], "1.75");
assert.equal(preferenceEvent.type, "ai-os-preferences-applied");
assert.deepEqual(preferenceEvent.detail, { preferences, theme: "light", scale: 1.75 });

console.log("AI OS display checks passed.");
