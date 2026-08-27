const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const CLIENT_SOURCE = fs.readFileSync(path.join(ROOT, "script.js"), "utf8");
const STYLE_SOURCE = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `Missing function ${name}`);
  const bodyStart = source.indexOf("{", start);
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

const context = {};
vm.runInNewContext(
  [
    extractFunction(CLIENT_SOURCE, "removeProviderModelFromDraft"),
    "this.removeProviderModelFromDraft = removeProviderModelFromDraft;",
  ].join("\n"),
  context,
);

const provider = {
  id: "provider-1",
  models: [
    { id: "model-a", capabilities: ["text"] },
    { id: "model-b", capabilities: ["generation"] },
  ],
};

assert.strictEqual(context.removeProviderModelFromDraft(provider, "model-a"), true);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(provider.models)),
  [{ id: "model-b", capabilities: ["generation"] }],
  "removing one model must keep its siblings intact",
);
assert.strictEqual(context.removeProviderModelFromDraft(provider, "missing-model"), false);
assert.strictEqual(provider.models.length, 1, "a missing model must not change the draft");

assert.match(
  CLIENT_SOURCE,
  /data-settings-action="delete-model"[^>]*data-model-id=/,
  "each model row should render an icon-only delete-model action",
);
assert.match(
  CLIENT_SOURCE,
  /action === "delete-model"[\s\S]*removeProviderModelFromDraft/,
  "the settings click handler should remove only the selected model from the draft",
);
assert.match(
  CLIENT_SOURCE,
  /aria-label="&#x79fb;&#x9664;&#x6a21;&#x578b;"/,
  "the model removal control should have an accessible label",
);
assert.match(STYLE_SOURCE, /\.provider-model-delete/, "the removal control should have dedicated styling");

console.log("Provider model removal checks passed.");
