const assert = require("node:assert/strict");
const rules = require("../canvas-virtualization-rules");
const { CanvasVirtualStore } = require("../canvas-virtual-store");
const { CanvasVirtualizer } = require("../canvas-virtualizer");

const store = new CanvasVirtualStore({ rules });
store.load([
  { id: "a", kind: "text", x: 0, y: 0, width: 100, height: 100 },
  { id: "b", kind: "image", x: 1300, y: 0, width: 100, height: 100 },
  { id: "c", kind: "text", x: 5000, y: 0, width: 100, height: 100 },
]);

const frames = [];
const mounted = [];
const unmounted = [];
const replacements = [];
let viewport = { width: 500, height: 500, x: 0, y: 0, scale: 1 };
const virtualizer = new CanvasVirtualizer({
  store,
  rules,
  getViewport: () => viewport,
  mount: (id, level) => {
    mounted.push(`${id}:${level}`);
    return { id, level };
  },
  unmount: (id, element) => unmounted.push(`${id}:${element.level}`),
  replace: (id, current, fromLevel, toLevel) => {
    replacements.push({
      id,
      fromLevel,
      toLevel,
      oldWasPresentDuringReplace: store.getMounted(id) === current,
    });
    return { id, level: toLevel };
  },
  requestFrame: (callback) => {
    frames.push(callback);
    return frames.length;
  },
  cancelFrame: () => {},
  now: () => 0,
});

virtualizer.schedule();
virtualizer.schedule();
assert.equal(frames.length, 1, "viewport updates must coalesce into one frame");
frames.shift()();
assert.deepEqual(store.mountedIds(), ["a"]);
assert.deepEqual(mounted, ["a:full"]);

viewport = { ...viewport, x: -700 };
virtualizer.schedule();
frames.shift()();
assert.deepEqual(new Set(store.mountedIds()), new Set(["a", "b"]));
assert.deepEqual(unmounted, [], "a stays mounted inside the larger retention rectangle");

virtualizer.pin("a");
viewport = { ...viewport, x: -5000 };
frames.shift()();
assert.equal(store.getMounted("a").id, "a", "pinned nodes stay mounted offscreen");
assert.equal(store.getMounted("b"), null);
assert.equal(store.getMounted("c").id, "c");

virtualizer.unpin("a");
frames.shift()();
assert.equal(store.getMounted("a"), null);

viewport = { ...viewport, x: 0, scale: 0.2 };
virtualizer.schedule();
frames.shift()();
assert.equal(store.getMountedLevel("a"), "full");

const ensured = virtualizer.ensureMounted("b", "full");
assert.equal(ensured.id, "b");
assert.equal(store.getMountedLevel("b"), "full");

virtualizer.reset();
assert.equal(store.mountedSize, 0);
assert.ok(unmounted.some((item) => item.startsWith("a:")));
assert.ok(unmounted.some((item) => item.startsWith("b:")));

const budgetStore = new CanvasVirtualStore({ rules });
budgetStore.load(Array.from({ length: 6 }, (_, index) => ({
  id: String(index + 1),
  kind: "text",
  x: index * 100,
  y: 0,
  width: 80,
  height: 80,
})));
const budgetFrames = [];
let clock = 0;
const budgetVirtualizer = new CanvasVirtualizer({
  store: budgetStore,
  rules,
  getViewport: () => ({ width: 1000, height: 500, x: 0, y: 0, scale: 1 }),
  mount: (id, level) => ({ id, level }),
  unmount: () => {},
  requestFrame: (callback) => {
    budgetFrames.push(callback);
    return budgetFrames.length;
  },
  cancelFrame: () => {},
  now: () => {
    clock += 5;
    return clock;
  },
});
budgetVirtualizer.schedule();
budgetFrames.shift()();
assert.ok(budgetStore.mountedSize < 6, "first frame must respect the time budget");
while (budgetFrames.length) budgetFrames.shift()();
assert.equal(budgetStore.mountedSize, 6, "continuation frames finish remaining mounts");

const overviewStore = new CanvasVirtualStore({ rules });
overviewStore.load(Array.from({ length: 3000 }, (_, index) => ({
  id: `overview-${index + 1}`,
  kind: index % 2 ? "text" : "image",
  x: (index % 60) * 420,
  y: Math.floor(index / 60) * 320,
  width: 320,
  height: 240,
})));
const overviewFrames = [];
const overviewVirtualizer = new CanvasVirtualizer({
  store: overviewStore,
  rules,
  getViewport: () => ({ width: 1440, height: 900, x: 80, y: 60, scale: 0.05 }),
  mount: (id, level) => ({ id, level }),
  unmount: () => {},
  requestFrame: (callback) => {
    overviewFrames.push(callback);
    return overviewFrames.length;
  },
  cancelFrame: () => {},
  now: () => 0,
});
overviewVirtualizer.schedule();
while (overviewFrames.length) overviewFrames.shift()();
assert.ok(overviewStore.mountedSize > 100, "overview clustering must preserve the board's spatial shape");
assert.ok(overviewStore.mountedSize <= 800, `overview DOM cap exceeded: ${overviewStore.mountedSize}`);
assert.ok(overviewStore.mountedIds().every((id) => overviewStore.getMountedLevel(id) === "full"));

const hysteresisStore = new CanvasVirtualStore({ rules });
hysteresisStore.load([{ id: "semantic", kind: "image", x: 0, y: 0, width: 320, height: 240 }]);
let hysteresisViewport = { width: 800, height: 600, x: 0, y: 0, scale: 0.64 };
const hysteresisReplacements = [];
let failNextReplacement = false;
const hysteresisVirtualizer = new CanvasVirtualizer({
  store: hysteresisStore,
  rules,
  getViewport: () => hysteresisViewport,
  mount: (id, level) => ({ id, level }),
  unmount: () => {},
  replace: (id, current, fromLevel, toLevel) => {
    hysteresisReplacements.push({
      id,
      fromLevel,
      toLevel,
      oldWasPresentDuringReplace: hysteresisStore.getMounted(id) === current,
    });
    if (failNextReplacement) {
      failNextReplacement = false;
      return null;
    }
    return { id, level: toLevel };
  },
  requestFrame: (callback) => {
    callback();
    return 1;
  },
  cancelFrame: () => {},
  now: () => 0,
});
hysteresisVirtualizer.flushNow();
assert.equal(hysteresisStore.getMountedLevel("semantic"), "full");
hysteresisViewport = { ...hysteresisViewport, scale: 0.65 };
hysteresisVirtualizer.flushNow();
assert.equal(hysteresisStore.getMountedLevel("semantic"), "full");
hysteresisViewport = { ...hysteresisViewport, scale: 0.62 };
hysteresisVirtualizer.flushNow();
assert.equal(hysteresisStore.getMountedLevel("semantic"), "full");
hysteresisViewport = { ...hysteresisViewport, scale: 0.59 };
hysteresisVirtualizer.flushNow();
assert.equal(hysteresisStore.getMountedLevel("semantic"), "full");
assert.deepEqual(hysteresisReplacements, [], "zoom must not replace complete nodes with another representation");

function createDensityVirtualizer(count) {
  const densityStore = new CanvasVirtualStore({ rules });
  densityStore.load(Array.from({ length: count }, (_, index) => ({
    id: `density-${index + 1}`,
    kind: index % 3 === 0 ? "image" : "text",
    x: (index % 40) * 180,
    y: Math.floor(index / 40) * 140,
    width: 160,
    height: 120,
  })));
  const densityVirtualizer = new CanvasVirtualizer({
    store: densityStore,
    rules,
    getViewport: () => ({ width: 8000, height: 5000, x: 0, y: 0, scale: 0.74 }),
    mount: (id, level) => ({ id, level }),
    unmount: () => {},
    requestFrame: (callback) => {
      callback();
      return 1;
    },
    cancelFrame: () => {},
    now: () => 0,
  });
  return { densityStore, densityVirtualizer };
}

const density800 = createDensityVirtualizer(800);
density800.densityVirtualizer.flushNow();
assert.equal(density800.densityStore.mountedSize, 800, "800 candidates must remain individual");
assert.ok(density800.densityStore.mountedIds().every((id) => density800.densityStore.getMountedLevel(id) === "full"));

const density801 = createDensityVirtualizer(801);
density801.densityVirtualizer.pin("density-801");
density801.densityVirtualizer.flushNow();
assert.ok(density801.densityStore.mountedSize <= 800, `density DOM cap exceeded: ${density801.densityStore.mountedSize}`);
assert.ok(density801.densityStore.getMounted("density-801"), "visible pinned node was lost during clustering");
assert.equal(density801.densityStore.getMountedLevel("density-801"), "full");

const pagedStore = new CanvasVirtualStore({ rules });
pagedStore.load([{ id: "retained", kind: "text", x: 0, y: 0, width: 100, height: 100 }]);
pagedStore.isViewportComplete = () => false;
const dataRequests = [];
const pagedVirtualizer = new CanvasVirtualizer({
  store: pagedStore,
  rules,
  getViewport: () => ({ width: 500, height: 500, x: 0, y: 0, scale: 1 }),
  mount: (id, level) => ({ id, level }),
  unmount: () => {},
  requestData: (input) => dataRequests.push(input),
  requestFrame: (callback) => {
    callback();
    return 1;
  },
  cancelFrame: () => {},
  now: () => 0,
});
const needsData = pagedVirtualizer.flushNow();
assert.equal(needsData.needsData, true);
assert.equal(dataRequests.length, 1);
assert.equal(pagedStore.getMounted("retained").id, "retained");

console.log("Canvas virtualizer checks passed.");
