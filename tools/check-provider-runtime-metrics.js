const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const SERVER_SOURCE = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
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

assert.match(
  SERVER_SOURCE,
  /\/api\/settings\/providers\/runtime/,
  "Server should expose a provider runtime metrics endpoint",
);
assert.match(
  CLIENT_SOURCE,
  /data-settings-action="refresh-provider-runtime"/,
  "Settings should expose a manual runtime refresh action",
);
assert.match(
  CLIENT_SOURCE,
  /SETTINGS_PROVIDER_RUNTIME_API_URL/,
  "Settings should request provider runtime metrics from the server",
);
assert.match(
  CLIENT_SOURCE,
  /effectiveState === "unstable"/,
  "Settings should present an unstable state for mixed recent checks",
);
assert.match(
  STYLE_SOURCE,
  /\.provider-runtime-overview/,
  "Provider runtime overview should have dedicated layout styles",
);
assert.match(
  STYLE_SOURCE,
  /\.provider-runtime-health-bars/,
  "Runtime state should include a visual health indicator",
);

const context = {};
vm.runInNewContext(
  [
    extractFunction(SERVER_SOURCE, "readNumericMetric"),
    extractFunction(SERVER_SOURCE, "extractProviderBalance"),
    extractFunction(SERVER_SOURCE, "extractProviderPrices"),
    extractFunction(SERVER_SOURCE, "classifyProviderUsageError"),
    extractFunction(SERVER_SOURCE, "classifyProviderRuntimeStatus"),
    "this.readNumericMetric = readNumericMetric;",
    "this.extractProviderBalance = extractProviderBalance;",
    "this.extractProviderPrices = extractProviderPrices;",
    "this.classifyProviderRuntimeStatus = classifyProviderRuntimeStatus;",
  ].join("\n"),
  context,
);

assert.strictEqual(context.classifyProviderRuntimeStatus({ ok: true, status: 200 }, null), "online");
assert.strictEqual(
  context.classifyProviderRuntimeStatus(
    { ok: false, status: 401, message: "Insufficient account balance" },
    { ok: false, status: 404, message: "HTTP 404" },
  ),
  "balance-error",
  "an explicit insufficient-balance response must not be shown as a generic account error",
);
assert.strictEqual(
  context.classifyProviderRuntimeStatus({ ok: false, status: 404 }, { ok: false, status: 405 }),
  "reachable",
);
assert.strictEqual(context.classifyProviderRuntimeStatus({ ok: false, status: 503 }, null), "degraded");
assert.strictEqual(context.classifyProviderRuntimeStatus({ ok: false, status: 0 }, { ok: false, status: 0 }), "offline");

assert.match(
  SERVER_SOURCE,
  /state:\s*"insufficient"/,
  "runtime balance should expose an inferred insufficient state when the provider reports it",
);
assert.match(
  SERVER_SOURCE,
  /accountState\s*===\s*"balance-error"/,
  "monitoring should preserve insufficient balance as a distinct account state",
);
assert.match(
  CLIENT_SOURCE,
  /balance\.state\s*===\s*"insufficient"/,
  "the balance card should render the inferred insufficient state",
);
assert.match(
  CLIENT_SOURCE,
  /effectiveState\s*===\s*"balance-error"/,
  "the interface status should render insufficient balance directly",
);
assert.match(
  CLIENT_SOURCE,
  /\["auth-error",\s*"balance-error",\s*"offline",\s*"connection-error"\]/,
  "mixed health history must not hide an explicit insufficient-balance result",
);

assert.deepStrictEqual(
  JSON.parse(JSON.stringify(context.extractProviderBalance({ quota: 10.5 }, "token-quota"))),
  { available: true, value: 10.5, currency: "", source: "token-quota" },
);
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(context.extractProviderBalance({ data: { balance: "28.75", currency: "CNY" } }, "usage"))),
  { available: true, value: 28.75, currency: "CNY", source: "usage" },
);
assert.strictEqual(context.extractProviderBalance({ data: [] }, "unknown").available, false);

const prices = context.extractProviderPrices({
  data: [
    { id: "gpt-image-2", price: 0.05, price_unit: "次" },
    { id: "gpt-5.5", pricing: { input: 2, output: 8, unit: "M tokens" } },
  ],
});
assert.strictEqual(prices.length, 2);
assert.strictEqual(prices[0].model, "gpt-image-2");
assert.strictEqual(prices[0].display, "0.05 / 次");
assert.match(prices[1].display, /输入 2/);
assert.match(prices[1].display, /输出 8/);

console.log("Provider runtime metrics checks passed.");
