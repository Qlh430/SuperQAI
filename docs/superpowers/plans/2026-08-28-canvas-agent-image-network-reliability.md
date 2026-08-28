# Canvas Agent Image & Network Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Agent image generation, image persistence, old-gallery recovery, provider selection, adaptive direct/proxy routing, and Agent node focusing reliable without duplicate paid submissions.

**Architecture:** Add two focused server-side modules: a per-host outbound route policy used by the existing proxy-aware fetch wrapper, and an image synchronization service that validates local files before a job can complete. Keep provider/model selection in the existing shared routing module, expose a monotonic image-model revision to the browser, and move Agent focus math into a small pure browser-compatible rules module. The existing server and client remain orchestrators; old canvas data is upgraded in place.

**Tech Stack:** Node.js 24 CommonJS, native `fetch`, `undici` 6.28 `ProxyAgent`, browser DOM/vanilla JavaScript, Node `assert` executable checks, existing canvas storage and browser verification tools.

## Global Constraints

- Do not change the meaning of old canvas data or move node coordinates while focusing.
- Do not automatically repeat a potentially billable image-generation or edit submission.
- An image job is `completed` only after a non-empty, recognizable local `/output/...` image exists.
- Agent and manual image nodes use the same configured/healthy candidate resolver.
- `https://api.hyhawang.com` is the preferred configured image provider and defaults to direct routing; its returned CDN host is routed independently.
- Routing decisions are per `scheme + hostname + port`; do not infer the route solely from `.cn`, `.com`, country, or proxy-port availability.
- Idempotent GET/HEAD/image downloads may switch route; billable POST requests are sent once after route selection.
- Portable deployment preserves explicit `auto/direct/proxy` settings but not machine-specific proxy ports, latency samples, or circuit state.
- Do not store API keys, proxy credentials, or full signed image URLs in route telemetry.
- Preserve all unrelated uncommitted workspace changes.

---

### Task 1: Pure per-host adaptive route policy

**Files:**
- Create: `outbound-route-policy.js`
- Create: `tools/check-outbound-route-policy.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: URL strings, provider mode (`auto | direct | proxy`), proxy availability, and route samples.
- Produces: `normalizeRouteMode(value, baseUrl)`, `getRouteKey(url)`, and `createOutboundRoutePolicy(options)` with `choose`, `record`, `snapshot`, and `resetRuntime` methods.

- [ ] **Step 1: Write the failing route-policy check**

```js
const assert = require("node:assert/strict");
const { createOutboundRoutePolicy, normalizeRouteMode } = require("../outbound-route-policy");

let now = 1_000;
const policy = createOutboundRoutePolicy({ now: () => now, ttlMs: 10_000, failureThreshold: 2 });

assert.equal(normalizeRouteMode("", "https://api.hyhawang.com"), "direct");
assert.equal(normalizeRouteMode("", "https://api.example.com"), "auto");
assert.equal(policy.choose({ url: "https://api.hyhawang.com/v1/models", mode: "direct", proxyAvailable: true }).route, "direct");

policy.record({ url: "https://cdn.example/image.png", route: "proxy", ok: false, latencyMs: 15_000, stage: "first-byte" });
policy.record({ url: "https://cdn.example/image.png", route: "direct", ok: true, latencyMs: 800, stage: "complete" });
assert.equal(policy.choose({ url: "https://cdn.example/other.png", mode: "auto", proxyAvailable: true }).route, "direct");

policy.record({ url: "https://overseas.example/v1/models", route: "direct", ok: false, latencyMs: 5_000, stage: "connect" });
policy.record({ url: "https://overseas.example/v1/models", route: "proxy", ok: true, latencyMs: 700, stage: "complete" });
assert.equal(policy.choose({ url: "https://overseas.example/v1/chat", mode: "auto", proxyAvailable: true }).route, "proxy");

const snapshot = policy.snapshot();
assert.equal(JSON.stringify(snapshot).includes("image.png"), false);
assert.equal(JSON.stringify(snapshot).includes("apiKey"), false);
assert.deepEqual(policy.resetRuntime(), { version: 1, hosts: {} });
console.log("outbound route policy checks passed");
```

- [ ] **Step 2: Run the check and verify the module is missing**

Run: `node tools/check-outbound-route-policy.js`

Expected: FAIL with `Cannot find module '../outbound-route-policy'`.

- [ ] **Step 3: Implement the minimal pure policy**

```js
const ROUTE_MODES = new Set(["auto", "direct", "proxy"]);

function normalizeRouteMode(value, baseUrl = "") {
  const mode = String(value || "").trim().toLowerCase();
  if (ROUTE_MODES.has(mode)) return mode;
  try {
    if (new URL(baseUrl).hostname.toLowerCase() === "api.hyhawang.com") return "direct";
  } catch {}
  return "auto";
}

function getRouteKey(value) {
  const url = new URL(value);
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  return `${url.protocol}//${url.hostname.toLowerCase()}:${port}`;
}

function createOutboundRoutePolicy({ now = Date.now, ttlMs = 5 * 60_000, failureThreshold = 2, initialState } = {}) {
  let state = sanitizeState(initialState);
  function choose({ url, mode = "auto", proxyAvailable = false } = {}) {
    const normalized = normalizeRouteMode(mode);
    if (normalized === "direct") return { route: "direct", alternate: null, reason: "forced" };
    if (normalized === "proxy") return { route: proxyAvailable ? "proxy" : "unavailable", alternate: null, reason: "forced" };
    const host = state.hosts[getRouteKey(url)] || {};
    const preferred = bestHealthyRoute(host, now(), ttlMs, proxyAvailable) || "direct";
    return { route: preferred, alternate: proxyAvailable ? (preferred === "direct" ? "proxy" : "direct") : null, reason: host.preferred ? "history" : "default" };
  }
  function record({ url, route, ok, latencyMs = 0, stage = "unknown" } = {}) {
    if (!["direct", "proxy"].includes(route)) return;
    const key = getRouteKey(url);
    const host = state.hosts[key] ||= {};
    host[route] = updateSample(host[route], { ok, latencyMs, stage, at: now() });
    host.preferred = pickPreferred(host, failureThreshold);
  }
  function snapshot() { return JSON.parse(JSON.stringify(state)); }
  function resetRuntime() { state = { version: 1, hosts: {} }; return snapshot(); }
  return Object.freeze({ choose, record, snapshot, resetRuntime });
}
```

Use these helpers in the same file so state contains only host keys, route counters, latency, failure stage, and timestamps:

```js
function sanitizeState(value) {
  const hosts = {};
  for (const [key, entry] of Object.entries(value?.hosts || {})) {
    if (!/^https?:\/\/[^/?#]+:\d+$/.test(key)) continue;
    hosts[key] = {};
    for (const route of ["direct", "proxy"]) {
      if (!entry?.[route]) continue;
      hosts[key][route] = {
        successes: Math.max(0, Number(entry[route].successes || 0)),
        failures: Math.max(0, Number(entry[route].failures || 0)),
        consecutiveFailures: Math.max(0, Number(entry[route].consecutiveFailures || 0)),
        latencyMs: Math.max(0, Number(entry[route].latencyMs || 0)),
        lastStage: String(entry[route].lastStage || "unknown").slice(0, 40),
        updatedAt: Math.max(0, Number(entry[route].updatedAt || 0)),
      };
    }
    if (["direct", "proxy"].includes(entry?.preferred)) hosts[key].preferred = entry.preferred;
  }
  return { version: 1, hosts };
}

function updateSample(previous = {}, sample) {
  const oldLatency = Math.max(0, Number(previous.latencyMs || 0));
  const latency = Math.max(0, Number(sample.latencyMs || 0));
  return {
    successes: Math.max(0, Number(previous.successes || 0)) + Number(Boolean(sample.ok)),
    failures: Math.max(0, Number(previous.failures || 0)) + Number(!sample.ok),
    consecutiveFailures: sample.ok ? 0 : Math.max(0, Number(previous.consecutiveFailures || 0)) + 1,
    latencyMs: latency ? Math.round(oldLatency ? oldLatency * 0.7 + latency * 0.3 : latency) : oldLatency,
    lastStage: String(sample.stage || "unknown").slice(0, 40),
    updatedAt: Math.max(0, Number(sample.at || 0)),
  };
}

function pickPreferred(host, failureThreshold) {
  const usable = ["direct", "proxy"].filter((route) => Number(host[route]?.consecutiveFailures || 0) < failureThreshold);
  return usable.sort((left, right) => Number(host[left]?.latencyMs || Number.MAX_SAFE_INTEGER) - Number(host[right]?.latencyMs || Number.MAX_SAFE_INTEGER))[0] || "";
}

function bestHealthyRoute(host, currentTime, ttlMs, proxyAvailable) {
  const preferred = String(host.preferred || "");
  if (!preferred || (preferred === "proxy" && !proxyAvailable)) return "";
  const sample = host[preferred];
  return sample && currentTime - Number(sample.updatedAt || 0) <= ttlMs ? preferred : "";
}
```

- [ ] **Step 4: Run the focused check**

Run: `node --check outbound-route-policy.js && node tools/check-outbound-route-policy.js`

Expected: `outbound route policy checks passed`.

- [ ] **Step 5: Add the check to the main test script and commit**

Add `node --check outbound-route-policy.js && node tools/check-outbound-route-policy.js` beside the existing outbound proxy checks in `package.json`.

Run: `git add outbound-route-policy.js tools/check-outbound-route-policy.js package.json && git commit -m "feat: add adaptive outbound route policy"`

---

### Task 2: Adaptive direct/proxy execution and portable route state

**Files:**
- Create: `outbound-route-state.js`
- Create: `tools/check-outbound-route-state.js`
- Modify: `outbound-fetch.js`
- Modify: `tools/check-outbound-proxy.js`
- Modify: `tools/check-outbound-proxy-runtime.js`
- Modify: `tools/check-outbound-proxy-auto.js`
- Modify: `server.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 1 `createOutboundRoutePolicy` and existing proxy discovery.
- Produces: `createOutboundRouteStateStore({ filePath, machineId })`; extended `createProxyAwareFetch` accepting `routePolicy`, `routeStore`, and per-request `outbound` metadata.

- [ ] **Step 1: Write failing checks for request safety and independent hosts**

```js
const calls = [];
const adaptiveFetch = createProxyAwareFetch({
  fetchImpl: async (url, options) => {
    calls.push({ url: String(url), route: options.dispatcher ? "proxy" : "direct", method: options.method || "GET" });
    if (String(url).includes("shyfai.cn") && options.dispatcher) throw Object.assign(new Error("timeout"), { code: "UND_ERR_HEADERS_TIMEOUT" });
    return { ok: true, status: 200, headers: new Headers({ "content-type": "image/png" }), arrayBuffer: async () => new Uint8Array([1]).buffer };
  },
  proxyUrl: "http://127.0.0.1:7890",
  createProxyDispatcher: () => ({ proxy: true }),
  routePolicy,
});

await adaptiveFetch("https://api.hyhawang.com/v1/models", { outbound: { mode: "direct", requestClass: "idempotent" } });
await adaptiveFetch("https://chatimage2-img3.shyfai.cn/a.png", { outbound: { mode: "auto", requestClass: "idempotent" } });
assert.equal(calls[0].route, "direct");
assert.equal(calls.at(-1).route, "direct");

calls.length = 0;
await adaptiveFetch("https://paid.example/v1/images/generations", {
  method: "POST",
  body: "{}",
  outbound: { mode: "auto", requestClass: "billable" },
});
assert.equal(calls.length, 1, "billable POST must never be resent after dispatch");
assert.equal(calls[0].url, "https://paid.example/v1/images/generations");
```

Add these exact independence and forced-proxy assertions:

```js
assert.notEqual(getRouteKey("https://api.hyhawang.com/v1/models"), getRouteKey("https://chatimage2-img3.shyfai.cn/a.png"));
let forcedCalls = 0;
const noProxyFetch = createProxyAwareFetch({
  fetchImpl: async () => { forcedCalls += 1; return { ok: true }; },
  proxyUrl: "auto",
  discoverProxy: async () => "",
  routePolicy: createOutboundRoutePolicy(),
});
await assert.rejects(
  noProxyFetch("https://paid.example/v1/images/generations", {
    method: "POST",
    outbound: { mode: "proxy", requestClass: "billable" },
  }),
  (error) => error.code === "outbound_proxy_unavailable",
);
assert.equal(forcedCalls, 0);
```

- [ ] **Step 2: Run existing and new outbound checks**

Run: `node tools/check-outbound-proxy.js && node tools/check-outbound-proxy-runtime.js && node tools/check-outbound-proxy-auto.js && node tools/check-outbound-route-state.js`

Expected: new assertions FAIL because `options.outbound` is not interpreted and route state does not exist.

- [ ] **Step 3: Implement machine-scoped persistence**

```js
function createOutboundRouteStateStore({ filePath, machineId }) {
  function load() {
    const saved = readJson(filePath);
    if (saved.machineId !== machineId) return { version: 1, machineId, hosts: {} };
    return { version: 1, machineId, hosts: saved.hosts || {} };
  }
  function save(snapshot) {
    atomicWrite(filePath, { version: 1, machineId, hosts: snapshot.hosts || {} });
  }
  function clearRuntime() {
    const empty = { version: 1, machineId, hosts: {} };
    atomicWrite(filePath, empty);
    return empty;
  }
  return Object.freeze({ load, save, clearRuntime });
}
```

Derive `machineId` in `server.js` from a hash of `os.hostname()`, platform, and architecture. Never include proxy URL, proxy credentials, signed URLs, query strings, or API keys in the persisted file.

- [ ] **Step 4: Extend `createProxyAwareFetch` with request classes**

```js
const outbound = normalizeOutboundRequest(options.outbound);
const fetchOptions = { ...options };
delete fetchOptions.outbound;

const decision = routePolicy.choose({
  url: parsed,
  mode: outbound.mode,
  proxyAvailable: Boolean(resolvedProxyUrl),
  requestClass: outbound.requestClass,
});

if (decision.route === "unavailable") {
  const error = new Error("代理线路不可用；请求尚未提交到图片接口。");
  error.code = "outbound_proxy_unavailable";
  throw error;
}

if (outbound.requestClass === "billable") {
  return requestOnce(decision.route, url, fetchOptions);
}
return requestIdempotentWithFallback(decision, url, fetchOptions);
```

`requestOnce` records connect/first-byte/HTTP results but never switches route after the call begins. `requestIdempotentWithFallback` may try `decision.alternate` after a connect/timeout failure; for `purpose: "image-download"`, start the alternate after a bounded hedge delay and cancel the loser with a linked `AbortController`.

- [ ] **Step 5: Wire server route state and classify all billable image calls**

```js
const OUTBOUND_ROUTE_STATE_FILE = process.env.OUTBOUND_ROUTE_STATE_FILE
  ? path.resolve(process.env.OUTBOUND_ROUTE_STATE_FILE)
  : path.join(DATA_DIR, "outbound-route-state.json");

const outboundRouteStore = createOutboundRouteStateStore({
  filePath: OUTBOUND_ROUTE_STATE_FILE,
  machineId: getOutboundMachineId(),
});
const outboundRoutePolicy = createOutboundRoutePolicy({ initialState: outboundRouteStore.load() });
const fetch = createProxyAwareFetch({
  proxyUrl: OUTBOUND_PROXY_URL,
  noProxy: OUTBOUND_NO_PROXY,
  routePolicy: outboundRoutePolicy,
  onRouteStateChange: (snapshot) => outboundRouteStore.save(snapshot),
});
```

Pass `{ outbound: { mode: provider.networkMode, requestClass: "billable", providerId: provider.id } }` to image generation/edit/chat POST calls. Pass `{ outbound: { mode: "auto", requestClass: "idempotent", purpose: "image-download" } }` to remote-result downloads.

- [ ] **Step 6: Run focused checks and commit**

Run: `node --check outbound-route-state.js && node --check outbound-fetch.js && node tools/check-outbound-route-policy.js && node tools/check-outbound-route-state.js && node tools/check-outbound-proxy.js && node tools/check-outbound-proxy-runtime.js && node tools/check-outbound-proxy-auto.js`

Expected: all outbound checks pass and the paid POST check reports one call.

Run: `git add outbound-route-state.js outbound-fetch.js server.js tools/check-outbound-route-state.js tools/check-outbound-proxy.js tools/check-outbound-proxy-runtime.js tools/check-outbound-proxy-auto.js package.json && git commit -m "feat: route outbound requests per host"`

---

### Task 3: Provider network mode and authoritative image-model candidates

**Files:**
- Modify: `image-model-routing.js`
- Modify: `server.js`
- Modify: `script.js`
- Modify: `styles.css`
- Modify: `tools/check-image-model-routing.js`
- Modify: `tools/check-image-model-candidates.js`
- Create: `tools/check-image-model-revision.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: provider settings and runtime monitoring.
- Produces: `isConfiguredCandidate`, `isHealthyCandidate`, stable candidate ranking, provider `networkMode`, and `/api/image-models` response field `revision`.

- [ ] **Step 1: Add failing model-routing assertions**

```js
const configuredOffline = {
  id: "custom:hyhawang:gpt-image-2",
  providerId: "hyhawang",
  providerBaseUrl: "https://api.hyhawang.com",
  enabled: true,
  hasApiKey: true,
  hasBaseUrl: true,
  capabilities: ["generation", "edit"],
  state: "offline",
};
assert.equal(routing.isConfiguredCandidate(configuredOffline), true);
assert.equal(routing.isHealthyCandidate(configuredOffline), false);
assert.equal(routing.selectCandidate([configuredOffline])?.id, configuredOffline.id);

const healthyOther = { ...configuredOffline, id: "custom:other:gpt-image-2", providerBaseUrl: "https://other.example", state: "online" };
assert.equal(routing.selectCandidate([healthyOther, { ...configuredOffline, state: "online" }])?.providerId, "hyhawang");
assert.equal(routing.selectCandidate([healthyOther, configuredOffline])?.providerId, "other");
```

Add a stale-response check where revision 4 finishes after revision 5; the client source must compare response revision to `canvasImageModelsRequiredRevision` before replacing the candidate snapshot.

- [ ] **Step 2: Run the routing checks**

Run: `node tools/check-image-model-routing.js && node tools/check-image-model-candidates.js && node tools/check-image-model-revision.js`

Expected: FAIL because offline candidates are currently hard-blocked, provider base URL is absent, and revisions are not exposed.

- [ ] **Step 3: Split configured eligibility from health ranking**

```js
const UNHEALTHY_STATES = new Set(["offline", "connection-error", "account-limited", "auth-error", "balance-error"]);

function isConfiguredCandidate(candidate, options = {}) {
  const capabilities = new Set(Array.isArray(candidate?.capabilities) ? candidate.capabilities : []);
  return Boolean(candidate?.id && candidate.enabled !== false && candidate.hasApiKey !== false && candidate.hasBaseUrl)
    && capabilities.has("generation")
    && (!options.requiresEdit || capabilities.has("edit"));
}

function isHealthyCandidate(candidate, options = {}) {
  return isConfiguredCandidate(candidate, options)
    && !UNHEALTHY_STATES.has(String(candidate.state || "unknown"));
}

function rankCandidates(candidates, options = {}) {
  return candidates
    .filter((candidate) => isConfiguredCandidate(candidate, options) && matchesRequestedModel(candidate, requestedModel))
    .sort((left, right) => Number(isHealthyCandidate(right, options)) - Number(isHealthyCandidate(left, options))
      || Number(isHyhawangProvider(right)) - Number(isHyhawangProvider(left))
      || compareExistingHealthMetrics(left, right));
}
```

Add normalized `providerBaseUrl` and `networkMode` to `buildCandidateRecords`; keep secrets excluded.

- [ ] **Step 4: Persist and render provider route mode**

Normalize provider settings with:

```js
networkMode: normalizeRouteMode(provider.networkMode || old.networkMode, provider.baseUrl || old.baseUrl),
```

Render an API setting control with three explicit values:

```html
<label class="provider-network-mode">
  <span>网络线路</span>
  <select data-provider-field="networkMode">
    <option value="auto">自动选择</option>
    <option value="direct">强制直连</option>
    <option value="proxy">强制代理</option>
  </select>
</label>
```

Set new providers to `auto`; when a saved provider has normalized Base URL `https://api.hyhawang.com` and no explicit prior mode, normalize it to `direct`.

- [ ] **Step 5: Add a monotonic image-model revision**

```js
let imageModelsRevision = 1;

// after successful settings write
imageModelsRevision += 1;

// /api/image-models response
sendJson(res, 200, {
  revision: imageModelsRevision,
  defaultModel: IMAGE_DEFAULT_MODEL,
  models: [...new Set([...staticModels, ...customModels.map((item) => item.clientId)])],
  labels: Object.fromEntries(customModels.map((item) => [item.clientId, item.label])),
  resolutions,
  platforms,
  families,
  prices,
  candidates: getImageModelCandidates(),
});
```

In `script.js`, store `canvasImageModelsRequiredRevision` and `canvasImageModelsAppliedRevision`. On save, set the required revision from the response and call `loadImageModels({ preserveOnError: true, minimumRevision })`. Ignore any response whose revision is older than either the request's minimum or the last applied revision. Agent and manual preflight both call one `ensureCanvasImageModelCandidate(options)` function.

- [ ] **Step 6: Verify settings save remains local-fast**

Keep the save path non-blocking with this structure and assert its ordering in `check-image-model-revision.js`:

```js
setSettingsSaveState("设置已保存");
const minimumRevision = Number(data.imageModelsRevision || 0);
canvasImageModelsRequiredRevision = Math.max(canvasImageModelsRequiredRevision, minimumRevision);
void Promise.allSettled([
  loadAgentRoutingCandidates({ silent: true }),
  loadChatModels(),
  loadVisionModels(),
  loadImageModels({ preserveOnError: true, minimumRevision }),
]);
```

```js
assert.ok(clientSource.indexOf('setSettingsSaveState("设置已保存")') < clientSource.indexOf("void Promise.allSettled"));
assert.doesNotMatch(extractFunction(clientSource, "saveSettingsCenter"), /await Promise\.allSettled/);
```

- [ ] **Step 7: Run focused checks and commit**

Run: `node --check image-model-routing.js && node --check server.js && node --check script.js && node tools/check-image-model-routing.js && node tools/check-image-model-candidates.js && node tools/check-image-model-revision.js && node tools/check-provider-runtime-metrics.js`

Expected: all checks pass; the offline-only configured candidate is returned as an attemptable fallback and a healthy `hyhawang` candidate ranks first.

Run: `git add image-model-routing.js server.js script.js styles.css tools/check-image-model-routing.js tools/check-image-model-candidates.js tools/check-image-model-revision.js package.json && git commit -m "fix: unify authoritative image model selection"`

---

### Task 4: Verified local image synchronization service

**Files:**
- Create: `image-sync-service.js`
- Create: `tools/check-image-sync-service.js`
- Modify: `server.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: generated response items containing `url` or `b64_json`, an adaptive fetch implementation, and `OUTPUT_DIR`.
- Produces: `createImageSyncService(options)` with `syncResponse(data, options)`, `recover(items, options)`, and `validateImageBuffer(buffer, contentType)`.

- [ ] **Step 1: Write failing synchronization checks**

```js
let generationCalls = 0;
let downloadCalls = 0;
const service = createImageSyncService({
  outputDir,
  delaysMs: [0, 1, 1],
  fetchImpl: async () => {
    downloadCalls += 1;
    if (downloadCalls === 1) throw new Error("proxy timeout");
    return imageResponse(validPngBytes);
  },
});
const source = { data: [{ url: "https://cdn.example/result.png" }] };
generationCalls += 1;
const result = await service.syncResponse(source);
assert.equal(generationCalls, 1);
assert.equal(downloadCalls, 2);
assert.equal(result.ok, true);
assert.match(result.data[0].local_url, /^\/output\//);
assert.equal(fs.statSync(path.join(outputDir, path.basename(result.data[0].local_url))).size > 0, true);
```

Add these concrete cases after the successful retry case:

```js
assert.equal(validateImageBuffer(Buffer.alloc(0), "image/png").ok, false);
assert.equal(validateImageBuffer(Buffer.from("<html>bad gateway</html>"), "text/html").reason, "not_an_image");
assert.equal(validateImageBuffer(Buffer.from("not an image payload"), "application/octet-stream").ok, false);
await assert.rejects(createFailingService(3).syncResponse(source), /download failed/);

const controller = new AbortController();
controller.abort(new Error("cancelled"));
await assert.rejects(service.syncResponse(source, { signal: controller.signal }), /cancelled/);

const base64 = await service.syncResponse({ data: [{ b64_json: validPngBytes.toString("base64") }] });
assert.equal(base64.ok, true);
assert.match(base64.data[0].local_url, /^\/output\//);

let recoverGenerationCalls = 0;
const recovered = await service.recover([{ url: "https://cdn.example/result.png" }]);
assert.equal(recoverGenerationCalls, 0);
assert.equal(recovered.ok, true);
```

- [ ] **Step 2: Run the new check**

Run: `node tools/check-image-sync-service.js`

Expected: FAIL with module missing.

- [ ] **Step 3: Implement validation, atomic writes, and bounded retry**

```js
function validateImageBuffer(buffer, contentType = "") {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return { ok: false, reason: "empty_or_short" };
  const signature = detectImageSignature(buffer);
  if (!signature || (/text\/html/i.test(contentType))) return { ok: false, reason: "not_an_image" };
  return { ok: true, extension: signature.extension, mimeType: signature.mimeType };
}

async function syncRemoteItem(item, { signal, onAttempt } = {}) {
  let lastError;
  for (let index = 0; index < delaysMs.length; index += 1) {
    if (delaysMs[index]) await abortableDelay(delaysMs[index], signal);
    try {
      const response = await fetchImpl(item.url, {
        signal,
        outbound: { mode: "auto", requestClass: "idempotent", purpose: "image-download" },
      });
      if (!response.ok) throw new Error(`Image download failed: ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      const validation = validateImageBuffer(buffer, response.headers.get("content-type") || "");
      if (!validation.ok) throw new Error(`Invalid image result: ${validation.reason}`);
      return writeAtomically(buffer, validation.extension);
    } catch (error) {
      lastError = error;
      onAttempt?.({ attempt: index + 1, error });
    }
  }
  throw lastError;
}
```

Write to a temp file inside `OUTPUT_DIR`, `fsync`/close, then rename. Return only server-relative `/output/...` URLs.

- [ ] **Step 4: Replace `saveGeneratedImages` internals**

Instantiate the service once in `server.js`. Keep the existing `saveGeneratedImages(data, options)` function as a thin compatibility wrapper that calls `imageSyncService.syncResponse` and returns its `savedImages`, while mutating `item.local_url` only after verified local write.

- [ ] **Step 5: Run the focused service checks and commit**

Run: `node --check image-sync-service.js && node --check server.js && node tools/check-image-sync-service.js && node tools/check-image-loading-rules.js`

Expected: all checks pass, transient failure performs two downloads, and no remote URL is labeled local.

Run: `git add image-sync-service.js server.js tools/check-image-sync-service.js package.json && git commit -m "feat: verify and persist generated images locally"`

---

### Task 5: Image job syncing, sync-failed, and same-task recovery

**Files:**
- Modify: `image-job-manager.js`
- Modify: `server.js`
- Modify: `tools/check-image-job-manager.js`
- Modify: `tools/check-image-job-endpoint.js`
- Create: `tools/check-image-job-recovery.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 4 image synchronization result.
- Produces: image job states `syncing` and `sync_failed`; manager method `recover(id)`; endpoint `POST /api/image-jobs/:id/recover`.

- [ ] **Step 1: Add failing manager tests**

```js
const manager = createImageJobManager({
  filePath,
  execute: async (_payload, context) => {
    context.report("syncing", { remoteResult: { data: [{ url: "https://cdn.example/a.png" }] } });
    return { status: 200, body: { data: [{ url: "https://cdn.example/a.png" }], saved_images: [{ error: "timeout" }] } };
  },
  recover: async (result) => ({ status: 200, body: localCompletedBody(result) }),
});

const job = manager.create({ model: "gpt-image-2" }, { boardId: "b", nodeId: "n" });
const failedSync = await waitForJob(manager, job.id, "sync_failed");
assert.equal(failedSync.result.data[0].local_url, undefined);
const completed = await manager.recover(job.id);
assert.equal(completed.state, "completed");
assert.match(completed.result.data[0].local_url, /^\/output\//);
assert.equal(executeCalls, 1);
```

Add exact restart and secrecy assertions:

```js
fs.writeFileSync(filePath, JSON.stringify({ version: 1, jobs: {
  active: { id: "active", state: "running", result: null, apiKey: "must-not-leak" },
  sync: { id: "sync", state: "sync_failed", result: { data: [{ remote_url: "https://cdn.example/a.png" }] } },
} }));
const recoveredManager = createImageJobManager({ filePath, execute, recover });
assert.equal(recoveredManager.get("active").state, "unknown");
assert.equal(recoveredManager.get("sync").state, "sync_failed");
assert.equal(JSON.stringify(recoveredManager.get("active")).includes("must-not-leak"), false);
```

- [ ] **Step 2: Run job checks**

Run: `node tools/check-image-job-manager.js && node tools/check-image-job-recovery.js`

Expected: FAIL because `syncing`, `sync_failed`, and `recover` do not exist.

- [ ] **Step 3: Extend the job state machine**

```js
const ACTIVE_STATES = new Set(["queued", "submitting", "running", "syncing"]);
const TERMINAL_STATES = new Set(["completed", "sync_failed", "failed", "unknown"]);

function hasVerifiedLocalImages(body) {
  const items = Array.isArray(body?.data) ? body.data : [];
  return items.length > 0 && items.every((item) => /^\/output\//.test(String(item?.local_url || item?.url || "")));
}

if (status >= 200 && status < 300) {
  transition(job, hasVerifiedLocalImages(body) ? "completed" : "sync_failed", {
    result: compactResultWithoutRemoteLocalAlias(body),
    code: hasVerifiedLocalImages(body) ? "" : "image_sync_failed",
    error: hasVerifiedLocalImages(body) ? "" : "图片已由接口生成，但原图尚未保存到本机。",
  });
}
```

Implement `recover(id)` with a per-job lock; it calls only the injected recovery callback:

```js
async function recoverJob(id) {
  const job = jobs[String(id || "")];
  if (!job) return null;
  if (job.state === "completed") return publicJob(job);
  if (job.state !== "sync_failed") return publicJob(job);
  if (recoveryPromises.has(job.id)) return recoveryPromises.get(job.id);
  const promise = (async () => {
    transition(job, "syncing", { error: "", code: "" });
    try {
      const response = await recover(job.result, { jobId: job.id });
      const body = response?.body || {};
      if (!hasVerifiedLocalImages(body)) throw new Error("图片原图仍未同步到本机。");
      transition(job, "completed", { result: body, error: "", code: "" });
    } catch (error) {
      transition(job, "sync_failed", { code: "image_sync_failed", error: String(error?.message || error) });
    } finally {
      recoveryPromises.delete(job.id);
    }
    return publicJob(job);
  })();
  recoveryPromises.set(job.id, promise);
  return promise;
}
```

- [ ] **Step 4: Stop compacting remote URLs as local**

Change `compactImageJobResponse` so `local_url` is present only when it begins with `/output/`. Preserve the remote result as `remote_url` solely for server recovery; the browser receives a recoverable state and job ID, not a fake local path.

- [ ] **Step 5: Add the recovery endpoint**

```js
if (req.method === "POST") {
  const match = req.url.match(/^\/api\/image-jobs\/([a-zA-Z0-9_-]{1,160})\/recover$/);
  if (match) {
    const job = await imageJobManager.recover(match[1]);
    if (!job) return sendJson(res, 404, { error: "没有找到这个图片任务。" });
    return sendJson(res, job.state === "completed" ? 200 : 202, { job });
  }
}
```

- [ ] **Step 6: Run endpoint and manager checks and commit**

Run: `node --check image-job-manager.js && node --check server.js && node tools/check-image-job-manager.js && node tools/check-image-job-endpoint.js && node tools/check-image-job-recovery.js`

Expected: all checks pass and recovery leaves the upstream generation call count at one.

Run: `git add image-job-manager.js server.js tools/check-image-job-manager.js tools/check-image-job-endpoint.js tools/check-image-job-recovery.js package.json && git commit -m "fix: complete image jobs only after local sync"`

---

### Task 6: Browser job feedback and legacy gallery in-place repair

**Files:**
- Modify: `script.js`
- Modify: `styles.css`
- Create: `tools/check-canvas-image-job-recovery-ui.js`
- Modify: `tools/check-canvas-gallery-history.js`
- Modify: `tools/check-existing-old-canvas-ui.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: Task 5 job states and recovery endpoint.
- Produces: clear `syncing/sync_failed/completed` UI, `recoverCanvasImageJob(jobId, node)`, and idempotent old-gallery localization.

- [ ] **Step 1: Add failing source/UI checks**

Assert that:

```js
assert.match(clientSource, /CANVAS_IMAGE_JOB_ACTIVE_STATES[^;]+syncing/);
assert.match(clientSource, /function recoverCanvasImageJob\(/);
assert.match(clientSource, /图片已生成，正在同步原图到本机/);
assert.match(clientSource, /恢复原图/);
assert.match(clientSource, /function repairLegacyCanvasGalleryImages\(/);
assert.match(clientSource, /image\.id\s*===\s*targetImageId/);
```

Add a DOM fixture with one remote gallery image. Simulate a recovered local URL and assert the same image ID is updated, length stays one, and the active image ID does not change.

- [ ] **Step 2: Run the UI checks**

Run: `node tools/check-canvas-image-job-recovery-ui.js && node tools/check-canvas-gallery-history.js && node tools/check-existing-old-canvas-ui.js`

Expected: FAIL because recovery UI and old-gallery localization are missing.

- [ ] **Step 3: Render truthful task progress**

```js
const CANVAS_IMAGE_JOB_ACTIVE_STATES = new Set(["queued", "submitting", "running", "syncing"]);

if (job.state === "syncing") {
  setCanvasImageNodeGenerationState(node, true);
  setCanvasNodeStatus(node, "图片已生成，正在同步原图到本机…");
}
if (job.state === "sync_failed") {
  setCanvasImageNodeGenerationState(node, false);
  setCanvasNodeStatus(node, "图片已生成，但原图尚未同步到本机");
  renderCanvasImageRecoveryAction(node, job.id);
}
```

`commitCanvasImageJobResult` must reject results unless the selected image URL begins with `/output/`; only then append to the gallery, set `imageJobCommittedId`, save history, and display `完成`.

- [ ] **Step 4: Implement same-task recovery**

```js
async function recoverCanvasImageJob(jobId, node) {
  const response = await fetch(`${IMAGE_JOBS_API_URL}/${encodeURIComponent(jobId)}/recover`, { method: "POST" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 202) throw new Error(data.error || "恢复原图失败。");
  syncCanvasImageJobProgress(node, data.job);
  if (data.job.state === "completed") return commitCanvasImageJobResult(node, data.job, currentPrompt(node), null, null);
  return data.job;
}
```

Disable the recovery button while syncing; re-enable it on `sync_failed`. Never call `createCanvasImageJob` from this path.

- [ ] **Step 5: Repair old gallery images in place**

When an old board finishes loading, scan gallery entries whose `src/savedUrl` is HTTP(S). For each failed-to-load entry, call a server localization endpoint backed by the same image-sync service. Mark the item `{ syncState: "syncing" }`; on success replace only `src` and `savedUrl` for that existing `id`; on failure set `{ syncState: "sync_failed", imageJobId }`. Do not append an item or change gallery length.

Render a branded placeholder reading `正在同步原图` or `原图同步失败 · 重试`; never render a browser broken-image icon.

- [ ] **Step 6: Run focused UI checks and commit**

Run: `node --check script.js && node tools/check-canvas-image-job-recovery-ui.js && node tools/check-canvas-gallery-history.js && node tools/check-existing-old-canvas-ui.js && node tools/check-canvas-image-atomic-upgrade-ui.js`

Expected: all checks pass and gallery count remains unchanged during repair.

Run: `git add script.js styles.css tools/check-canvas-image-job-recovery-ui.js tools/check-canvas-gallery-history.js tools/check-existing-old-canvas-ui.js package.json && git commit -m "fix: recover generated images without duplicate jobs"`

---

### Task 7: Adaptive Agent node focusing

**Files:**
- Create: `canvas-agent-focus-rules.js`
- Create: `tools/check-canvas-agent-focus-rules.js`
- Modify: `index.html`
- Modify: `script.js`
- Modify: `canvas-agent.css`
- Modify: `tools/check-canvas-agent-ui.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: node world-space bounds and available viewport after the Agent panel is open.
- Produces: `CanvasAgentFocusRules.calculateFocusTransform({ bounds, viewport, currentScale, targetCount })`.

- [ ] **Step 1: Write failing focus-math checks**

```js
const rules = require("../canvas-agent-focus-rules");

const one = rules.calculateFocusTransform({
  bounds: { left: 100, top: 200, right: 420, bottom: 460 },
  viewport: { width: 1400, height: 900 },
  currentScale: 0.41,
  targetCount: 1,
});
assert.equal(one.scale >= 0.65 && one.scale <= 1.25, true);
assert.equal((260 * one.scale) / 900 >= 0.45, true);

const many = rules.calculateFocusTransform({
  bounds: { left: 0, top: 0, right: 1800, bottom: 1000 },
  viewport: { width: 1200, height: 800 },
  currentScale: 1.2,
  targetCount: 6,
});
assert.equal(many.scale <= 1, true);
assert.equal(many.visibleRatio >= 0.75, true);
```

- [ ] **Step 2: Run the focus check**

Run: `node tools/check-canvas-agent-focus-rules.js`

Expected: FAIL with module missing.

- [ ] **Step 3: Implement pure focus calculation**

```js
function calculateFocusTransform({ bounds, viewport, currentScale, targetCount }) {
  const safeWidth = Math.max(1, viewport.width);
  const safeHeight = Math.max(1, viewport.height);
  const boundsWidth = Math.max(1, bounds.right - bounds.left);
  const boundsHeight = Math.max(1, bounds.bottom - bounds.top);
  const single = Number(targetCount) === 1;
  const scale = single
    ? clamp((safeHeight * 0.55) / boundsHeight, 0.65, 1.25)
    : clamp(Math.min((safeWidth * 0.76) / boundsWidth, (safeHeight * 0.76) / boundsHeight), 0.05, 1);
  return {
    scale,
    x: safeWidth / 2 - ((bounds.left + bounds.right) / 2) * scale,
    y: safeHeight / 2 - ((bounds.top + bounds.bottom) / 2) * scale,
    visibleRatio: Math.min((boundsWidth * scale) / safeWidth, (boundsHeight * scale) / safeHeight),
  };
}
```

Include 12% effective safety margin in the multi-node calculation and clamp invalid numeric inputs.

- [ ] **Step 4: Integrate with actual available viewport**

Load `canvas-agent-focus-rules.js` before `script.js` in `index.html`. In `focusAgentCanvasNodesInViewport`, derive the visible canvas rectangle after subtracting the open Agent panel overlap, call the rules module, then set only `canvasState.x`, `canvasState.y`, and `canvasState.scale`. Capture all target node `dataset.x/y` before focusing and leave them unchanged.

- [ ] **Step 5: Keep a visible focus ring without moving nodes**

Use `.is-agent-focus` for a short animation and clear it with one debounced timer:

```js
clearTimeout(canvasAgentFocusTimer);
targets.forEach((node) => node.classList.add("is-agent-focus"));
canvasAgentFocusTimer = setTimeout(() => {
  targets.forEach((node) => node.classList.remove("is-agent-focus"));
}, 1400);
```

```css
.canvas-node.is-agent-focus { animation: canvas-agent-focus-ring 1.4s ease-out; }
@media (prefers-reduced-motion: reduce) {
  .canvas-node.is-agent-focus { animation: none; outline: 2px solid var(--accent); }
}
```

- [ ] **Step 6: Run focus and Agent UI checks and commit**

Run: `node --check canvas-agent-focus-rules.js && node --check script.js && node tools/check-canvas-agent-focus-rules.js && node tools/check-canvas-agent-ui.js && node tools/check-canvas-agent-performance.js`

Expected: all checks pass, single-node scale is at least 65%, multi-node scale does not exceed 100%, and node coordinates remain unchanged.

Run: `git add canvas-agent-focus-rules.js index.html script.js canvas-agent.css tools/check-canvas-agent-focus-rules.js tools/check-canvas-agent-ui.js package.json && git commit -m "fix: frame Agent-selected nodes at readable scale"`

---

### Task 8: End-to-end regression, portable deployment, and final verification

**Files:**
- Modify: `tools/check-portable-package.js`
- Modify: `tools/check-canvas-agent-image-failover.js`
- Modify: `tools/check-canvas-agent-ui-browser.js`
- Create: `tools/check-image-network-reliability-integration.js`
- Modify: `package.json`
- Modify: `打包和迁移说明.md`

**Interfaces:**
- Consumes: Tasks 1–7.
- Produces: a complete regression gate and migration documentation.

- [ ] **Step 1: Add an integration fixture with independent API/CDN routes**

Create local direct/proxy stub servers. The API stub accepts exactly one POST and returns one remote image URL. Configure the proxy stub to accept the API host but time out the CDN host, then reverse the behavior in a second case. Assert:

```js
assert.equal(apiGenerationPostCount, 1);
assert.equal(finalJob.state, "completed");
assert.match(finalJob.result.data[0].local_url, /^\/output\//);
assert.equal(finalJob.result.data[0].url.startsWith("http"), false);
assert.equal(apiHostDecision.route, expectedApiRoute);
assert.equal(cdnHostDecision.route, expectedCdnRoute);
```

Add a persistent CDN failure case asserting `sync_failed`, one paid POST, no gallery commit, then recovery after the CDN becomes reachable.

- [ ] **Step 2: Add portable-state assertions**

Update `check-portable-package.js` to assert that provider `networkMode` is in settings, but `data/outbound-route-state.json` is excluded or reset in the portable output. Verify no proxy URL containing credentials is copied.

- [ ] **Step 3: Run the focused integration gate**

Run: `node tools/check-image-network-reliability-integration.js && node tools/check-canvas-agent-image-failover.js && node tools/check-portable-package.js`

Expected: all checks pass, each generated image has one paid submission, and local sync/recovery uses only idempotent requests.

- [ ] **Step 4: Run syntax and full automated regression**

Run: `npm run check`

Expected: exit code 0 with all existing and new checks passing.

- [ ] **Step 5: Run browser regression on old and new boards**

Run: `node tools/check-canvas-agent-ui-browser.js`

Verify in the browser fixture:

- Agent focus makes one node readable and keeps multiple nodes inside the canvas area not covered by the Agent panel.
- An all-unhealthy-but-configured model pool still attempts the configured `gpt-image-2` provider.
- `api.hyhawang.com` is selected first when equally healthy.
- `syncing` never displays `完成`; `sync_failed` displays recovery; recovered output commits once.
- Reloading an old board repairs a remote gallery item in place without changing its count.
- Direct/proxy selection is independent for API and CDN hosts.

- [ ] **Step 6: Update migration guidance**

Document that users can double-click the portable launcher after copying the package; explicit provider route modes migrate, while learned route data is recreated on the new computer. Explain the three network modes and that `auto` is recommended unless the user deliberately forces a route.

- [ ] **Step 7: Inspect the final diff and commit**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only intended files are staged for this task and unrelated dirty files remain untouched.

Run: `git add tools/check-portable-package.js tools/check-canvas-agent-image-failover.js tools/check-canvas-agent-ui-browser.js tools/check-image-network-reliability-integration.js package.json 打包和迁移说明.md && git commit -m "test: cover reliable image generation and routing"`

- [ ] **Step 8: Final verification record**

Run: `npm run check && node tools/check-image-network-reliability-integration.js && node tools/check-canvas-agent-ui-browser.js`

Expected: every command exits 0. Record the exact commands, pass counts, any skipped environment-dependent live probe, and the resulting commit IDs in the final handoff.
