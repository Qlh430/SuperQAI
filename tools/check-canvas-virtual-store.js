const assert = require("node:assert/strict");
const rules = require("../canvas-virtualization-rules");
const { CanvasVirtualStore } = require("../canvas-virtual-store");

const store = new CanvasVirtualStore({ rules });
store.load([
  {
    id: 7,
    kind: "image",
    x: "-20",
    y: "30",
    imageSrc: "/old.png",
    futureField: { keep: true },
  },
  {
    id: "text-2",
    kind: "text",
    x: 900,
    y: 20,
    width: 500,
    height: 300,
    text: "legacy text",
  },
]);

assert.equal(store.size, 2);
assert.equal(store.get("7").id, "7");
assert.equal(store.get("7").x, -20);
assert.equal(store.get("7").y, 30);
assert.deepEqual(store.getRect("7"), { left: -20, top: 30, right: 300, bottom: 270 });
assert.deepEqual(store.query({ left: -100, top: 0, right: 500, bottom: 500 }), ["7"]);

store.mergeSerialized("7", {
  id: "7",
  kind: "image",
  x: 40,
  y: 50,
  width: 400,
  height: 300,
  imageSrc: "/old.png",
});
assert.deepEqual(store.serialize()[0].futureField, { keep: true });
assert.deepEqual(store.getRect("7"), { left: 40, top: 50, right: 440, bottom: 350 });
assert.deepEqual(store.query({ left: 0, top: 0, right: 500, bottom: 500 }), ["7"]);

store.setGeometry("text-2", { x: -1200, y: -900, width: 600, height: 400 });
assert.deepEqual(store.query({ left: -1300, top: -1000, right: -500, bottom: -400 }), ["text-2"]);

const fakeElement = { id: "mounted-7" };
store.setMounted("7", fakeElement, "full");
assert.equal(store.getMounted("7"), fakeElement);
assert.equal(store.getMountedLevel("7"), "full");
assert.deepEqual(store.mountedIds(), ["7"]);
assert.deepEqual(store.mountedElements(), [fakeElement]);
store.clearMounted();
assert.equal(store.getMounted("7"), null);

store.upsert({ id: "future", kind: "mystery", x: 10, y: 10, custom: "kept" });
assert.equal(store.get("future").custom, "kept");
assert.deepEqual(store.serialize().map((item) => item.id), ["7", "text-2", "future"]);
assert.equal(store.remove("future"), true);
assert.equal(store.has("future"), false);
assert.equal(store.remove("missing"), false);

store.clear();
assert.equal(store.size, 0);
assert.deepEqual(store.serialize(), []);

console.log("Canvas virtual store checks passed.");
