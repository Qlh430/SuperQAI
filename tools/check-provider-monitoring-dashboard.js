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

assert.match(SERVER_SOURCE, /PROVIDER_MONITORING_FILE/, "Monitoring history should be persisted");
assert.match(SERVER_SOURCE, /\/api\/settings\/providers\/monitoring/, "Monitoring API should exist");
assert.match(SERVER_SOURCE, /function recordProviderMonitoringSample/, "Monitoring samples should be recorded");
assert.match(SERVER_SOURCE, /function summarizeProviderMonitoring/, "Monitoring summaries should be calculated");
assert.match(SERVER_SOURCE, /function recordProviderUsageEvent/, "Actual provider calls should be recorded");
assert.match(
  SERVER_SOURCE,
  /range === "realtime"[\s\S]*storedSamples\.slice\(-50\)/,
  "Real-time metrics should use the latest 50 checks instead of a time-window aggregate",
);
assert.match(SERVER_SOURCE, /imageCalls/, "Monitoring summary should expose image usage");
assert.match(SERVER_SOURCE, /rechargeUrl:/, "Recharge URLs should be persisted in provider settings");
assert.match(SERVER_SOURCE, /trend:\s*buildProviderMonitoringTrend/, "Dashboard should expose a fixed trend");

assert.match(CLIENT_SOURCE, /data-settings-tab="monitoring"/, "Settings should include an API monitoring tab");
assert.match(CLIENT_SOURCE, /let providerMonitoringRange = "realtime"/, "Real-time checks should be selected by default");
assert.match(
  CLIENT_SOURCE,
  /\["realtime", "\\u5b9e\\u65f6\\u68c0\\u6d4b"\][\s\S]*\["6h", "\\u8fd1 6 \\u5c0f\\u65f6"\]/,
  "Real-time checks should be the leftmost range option",
);
assert.match(
  CLIENT_SOURCE,
  /providerMonitoringRange === "realtime"[\s\S]*renderProviderMonitoringRealtimeBars\(provider\.recent\)[\s\S]*renderProviderMonitoringBars\(provider\.trend\)/,
  "Each monitoring card should render only the selected chart mode",
);
assert.match(
  CLIENT_SOURCE,
  /renderProviderMonitoringRealtimeBars\(provider\.recent\)/,
  "Monitoring cards should keep a separate real-time check strip",
);
assert.match(CLIENT_SOURCE, /\\u5b9e\\u65f6\\u68c0\\u6d4b/, "The real-time strip should be clearly labelled");
assert.match(CLIENT_SOURCE, /\\u8303\\u56f4\\u8d8b\\u52bf/, "The selected-range trend should be clearly labelled");
assert.match(CLIENT_SOURCE, /function renderSettingsMonitoring/, "Monitoring dashboard should be rendered");
assert.match(CLIENT_SOURCE, /open-provider-recharge/, "Balance card should provide a recharge action");
assert.match(CLIENT_SOURCE, /data-provider-field="rechargeUrl"/, "Recharge URL should be configurable");
assert.match(CLIENT_SOURCE, /\\u7f51\\u7ad9\\u5728\\u7ebf/, "Reachable wording should be understandable");
assert.match(CLIENT_SOURCE, /ainb\.plus[\s\S]*\/wallet/, "AINB should use its wallet page");
assert.match(CLIENT_SOURCE, /uuapi\.net[\s\S]*\/dashboard/, "UUAPI should use its dashboard");
assert.match(CLIENT_SOURCE, /hyhawang\.com[\s\S]*\/purchase/, "Hyhawang should use its purchase page");
assert.match(CLIENT_SOURCE, /clse-ai\.com[\s\S]*\/dashboard/, "CLSE should use its dashboard");
assert.match(CLIENT_SOURCE, /\\u5b9e\\u9645\\u8c03\\u7528/, "Dashboard should show actual usage");

assert.match(STYLE_SOURCE, /\.provider-monitoring-dashboard/, "Monitoring dashboard should have layout styles");
assert.match(STYLE_SOURCE, /\.provider-monitoring-health-bars/, "Monitoring history should be visualized");
assert.match(STYLE_SOURCE, /--health/, "Trend bar height should represent bucket success rate");
assert.match(STYLE_SOURCE, /\.provider-runtime-balance-actions/, "Recharge action should be styled");
assert.match(
  CLIENT_SOURCE,
  /provider-runtime-balance-content[\s\S]*provider-runtime-balance-copy[\s\S]*provider-runtime-balance-actions/,
  "Recharge action should be positioned after the balance copy",
);
assert.match(
  STYLE_SOURCE,
  /\.provider-runtime-balance-content[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/,
  "Balance content should reserve a trailing action column",
);
assert.match(
  CLIENT_SOURCE,
  /无法读取具体金额；真实调用返回余额不足时仍会提醒/,
  "Unsupported balance APIs should explain the actual-call fallback",
);

const trendContext = {};
vm.runInNewContext(
  [
    extractFunction(SERVER_SOURCE, "buildProviderMonitoringTrend"),
    extractFunction(SERVER_SOURCE, "getProviderCurrentState"),
    "this.buildProviderMonitoringTrend = buildProviderMonitoringTrend;",
    "this.getProviderCurrentState = getProviderCurrentState;",
  ].join("\n"),
  trendContext,
);
const start = Date.parse("2026-07-01T00:00:00.000Z");
const end = Date.parse("2026-07-31T00:00:00.000Z");
const samples = Array.from({ length: 100 }, (_, index) => ({
  state: index % 4 === 0 ? "offline" : "online",
  httpStatus: index % 4 === 0 ? 503 : 200,
  checkedAt: new Date(start + ((end - start) * (index + 0.5)) / 100).toISOString(),
}));
const trend = trendContext.buildProviderMonitoringTrend(samples, start, end, 50);
assert.strictEqual(trend.length, 50, "Every selected range should render exactly 50 time buckets");
assert.strictEqual(trend.reduce((total, bucket) => total + bucket.sampleCount, 0), 100);
assert.ok(trend.every((bucket) => bucket.sampleCount === 2));
assert.ok(trend.every((bucket) => bucket.successRate === 50 || bucket.successRate === 100));

const mixedCurrentSamples = [
  { state: "offline", latencyMs: 0, httpStatus: 0, checkedAt: "2026-07-31T00:00:00.000Z" },
  { state: "online", latencyMs: 900, httpStatus: 200, checkedAt: "2026-07-31T00:05:00.000Z" },
  { state: "online", latencyMs: 800, httpStatus: 200, checkedAt: "2026-07-31T00:10:00.000Z" },
  { state: "online", latencyMs: 700, httpStatus: 200, checkedAt: "2026-07-31T00:15:00.000Z" },
];
const mixedCurrentState = trendContext.getProviderCurrentState(
  { id: "provider-1", name: "Provider 1", baseUrl: "https://example.com/v1", enabled: true },
  mixedCurrentSamples.at(-1),
);
assert.strictEqual(
  mixedCurrentState,
  "online",
  "the latest successful probe should remain currently available despite older failures",
);
assert.match(SERVER_SOURCE, /summary:[\s\S]*currentState/, "dashboard totals should use the latest current state");

const presentationContext = {};
vm.runInNewContext(
  [
    extractFunction(CLIENT_SOURCE, "getProviderMonitoringPresentation"),
    "this.getProviderMonitoringPresentation = getProviderMonitoringPresentation;",
  ].join("\n"),
  presentationContext,
);
const mixedPresentation = presentationContext.getProviderMonitoringPresentation({
  state: "unstable",
  currentState: "online",
});
assert.strictEqual(mixedPresentation.currentState, "online");
assert.strictEqual(
  mixedPresentation.showRecentFluctuation,
  true,
  "a currently available provider should keep its current status and expose history separately",
);
assert.match(
  CLIENT_SOURCE,
  /\\u8fd1\\u671f\\u6709\\u6ce2\\u52a8/,
  "Historical instability should be labelled as a recent fluctuation instead of replacing current status",
);

console.log("Provider monitoring dashboard checks passed.");
