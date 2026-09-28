"use strict";

const assert = require("node:assert/strict");
const rules = require("../canvas-llm-preset-rules.js");

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    value: (key) => values.get(key),
  };
}

const storage = createStorage({
  custom: JSON.stringify([
    { label: " A ", text: " first " },
    { label: "", text: "ignored" },
    { label: "B", text: "" },
  ]),
  hidden: JSON.stringify([" Old ", "", "Old", "Legacy"]),
});

assert.deepEqual(rules.readCustomPresets(storage, "custom"), [
  { label: "A", text: "first" },
]);
assert.deepEqual(rules.readHiddenLabels(storage, "hidden"), ["Old", "Legacy"]);

assert.equal(rules.writeCustomPresets(storage, "custom", [{ label: "A", text: "next" }]), true);
assert.equal(storage.value("custom"), JSON.stringify([{ label: "A", text: "next" }]));
assert.equal(rules.writeHiddenLabels(storage, "hidden", [" A ", "A", "", "B"]), true);
assert.equal(storage.value("hidden"), JSON.stringify(["A", "B"]));

assert.deepEqual(rules.resolvePromptPresets({
  defaults: [
    { label: "Default", text: "default text" },
    { label: "Hidden", text: "hidden text" },
  ],
  hiddenLabels: ["Hidden"],
  customPresets: [
    { label: "Custom", text: "custom text" },
    { label: "Default", text: "duplicate label" },
  ],
}), [
  { label: "Default", text: "default text", source: "default" },
  { label: "Custom", text: "custom text", source: "custom" },
]);

assert.deepEqual(rules.readCustomPresets(createStorage({ custom: "not json" }), "custom"), []);
assert.deepEqual(rules.readHiddenLabels(createStorage({ hidden: "{}" }), "hidden"), []);
assert.equal(rules.writeCustomPresets({ setItem: () => { throw new Error("blocked"); } }, "custom", []), false);
assert.equal(rules.writeHiddenLabels({ setItem: () => { throw new Error("blocked"); } }, "hidden", []), false);

console.log("Canvas LLM preset rules checks passed.");
