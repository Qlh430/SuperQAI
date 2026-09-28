const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { normalizeModelPrice } = require("../provider-catalog-service");

const ROOT = path.join(__dirname, "..");
const SERVER_SOURCE = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
const PROVIDER_CATALOG_SOURCE = fs.readFileSync(path.join(ROOT, "provider-catalog-http-api.js"), "utf8");
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

assert.strictEqual(normalizeModelPrice("0.05"), "0.05");
assert.strictEqual(normalizeModelPrice("￥0.05"), "0.05");
assert.strictEqual(normalizeModelPrice("$0.006"), "$0.006");
assert.strictEqual(normalizeModelPrice("0.03~0.06"), "0.03~0.06");
assert.strictEqual(normalizeModelPrice("随便写"), "");

const clientPriceContext = {};
vm.runInNewContext(
  [
    'var DYNAMIC_IMAGE_MODEL_PRICES = {};',
    'var DYNAMIC_MODEL_DISPLAY_NAMES = { "gpt-image-2-ainb": "gpt-image-2 · ainb" };',
    'var IMAGE_MODEL_PRICES = { "gpt-image-2-ainb": "0.05", "gpt-image-2": "0.054" };',
    'var APIMART_IMAGE_MODEL_PRICES = { 1: "$0.006", 2: "$0.012", 4: "$0.018" };',
    extractFunction(CLIENT_SOURCE, "getImageModelPrice"),
    "this.getImageModelPrice = getImageModelPrice;",
  ].join("\n"),
  clientPriceContext,
);
assert.strictEqual(
  clientPriceContext.getImageModelPrice("gpt-image-2-ainb", "1"),
  "",
  "A configured provider model without a manual price must not fall back to a built-in reference price",
);

assert.match(SERVER_SOURCE, /\/api\/settings\/providers\/key/, "The retired reveal route should remain explicitly blocked");
assert.match(PROVIDER_CATALOG_SOURCE, /const prices = Object\.fromEntries/, "Image model metadata should collect manual prices");
assert.match(PROVIDER_CATALOG_SOURCE, /families,\s*prices,/, "Image model metadata should expose manual prices");
assert.doesNotMatch(SERVER_SOURCE, /compareProviderMonitoringQuality/, "retired monitoring sorting must not stay in the server");
assert.match(CLIENT_SOURCE, /DYNAMIC_IMAGE_MODEL_PRICES/, "Client should load dynamic model prices");
assert.match(CLIENT_SOURCE, /data-model-price=/, "Generation models should expose a manual price input");
assert.doesNotMatch(CLIENT_SOURCE, /SETTINGS_PROVIDER_KEY_API_URL|\/api\/settings\/providers\/key|data\.apiKey\s*\|\|/, "Saved keys must never be fetched back into the browser");
assert.match(CLIENT_SOURCE, /已保存的 API Key 不会回显/, "The key editor should explain server-side secret retention");
assert.match(STYLE_SOURCE, /\.model-price-field/, "Manual price editor should have dedicated styling");

console.log("Provider price, key reveal, and monitoring sorting checks passed.");
