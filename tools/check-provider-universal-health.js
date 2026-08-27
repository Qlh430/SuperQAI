const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const SERVER_SOURCE = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
const CLIENT_SOURCE = fs.readFileSync(path.join(ROOT, "script.js"), "utf8");

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
    extractFunction(SERVER_SOURCE, "classifyProviderBalanceState"),
    extractFunction(SERVER_SOURCE, "summarizeProviderUsageCapability"),
    "this.classifyProviderBalanceState = classifyProviderBalanceState;",
    "this.summarizeProviderUsageCapability = summarizeProviderUsageCapability;",
  ].join("\n"),
  context,
);

assert.strictEqual(
  context.classifyProviderBalanceState({ available: true, value: -0.4904 }),
  "negative",
  "negative balance must be treated as an account warning",
);
assert.strictEqual(
  context.classifyProviderBalanceState({ available: true, value: 0 }),
  "depleted",
  "zero balance must be treated as depleted",
);
assert.strictEqual(
  context.classifyProviderBalanceState({ available: true, value: 2.86 }),
  "available",
);
assert.strictEqual(
  context.classifyProviderBalanceState({ state: "insufficient", available: false }),
  "insufficient",
);
assert.strictEqual(context.classifyProviderBalanceState({ available: false }), "unknown");

assert.deepStrictEqual(
  JSON.parse(JSON.stringify(context.summarizeProviderUsageCapability([]))),
  { state: "untested", kind: "", checkedAt: "", message: "" },
);
assert.strictEqual(
  context.summarizeProviderUsageCapability([
    { success: true, kind: "image", checkedAt: "2026-07-31T10:00:00.000Z" },
  ]).state,
  "verified",
);
assert.strictEqual(
  context.summarizeProviderUsageCapability([
    { success: false, kind: "image", errorCategory: "balance", message: "insufficient" },
  ]).state,
  "balance-error",
);
assert.strictEqual(
  context.summarizeProviderUsageCapability([
    { success: false, kind: "chat", errorCategory: "auth", message: "invalid key" },
  ]).state,
  "auth-error",
);
assert.strictEqual(
  context.summarizeProviderUsageCapability([
    { success: false, kind: "chat", errorCategory: "rate-limit", message: "too many requests" },
  ]).state,
  "rate-limited",
);

assert.match(SERVER_SOURCE, /platformState[,:]/, "runtime response should expose platform state separately");
assert.match(SERVER_SOURCE, /accountState[,:]/, "runtime response should expose account state separately");
assert.match(SERVER_SOURCE, /capability[,:]/, "runtime response should expose actual-call capability state");
assert.match(CLIENT_SOURCE, /runtime-capability/, "settings should render a dedicated actual-call status card");
assert.match(CLIENT_SOURCE, /balance\.state === "negative"/, "settings should label negative balances explicitly");
assert.match(SERVER_SOURCE, /balanceState:\s*String/, "monitoring history should preserve balance reason");
assert.match(SERVER_SOURCE, /connection-error/, "no-HTTP failures should be separated from platform outages");
assert.match(CLIENT_SOURCE, /connection-error/, "settings should label local connection failures explicitly");
assert.match(CLIENT_SOURCE, /balance\.state === "depleted"/, "settings should label zero balances explicitly");

console.log("Provider universal health checks passed.");
