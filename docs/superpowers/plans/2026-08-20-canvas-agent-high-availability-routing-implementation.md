# Canvas Agent High-Availability Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fast, capability-aware Canvas Agent router that automatically fails over across providers and compatible models without exposing model names or degrading canvas interaction.

**Architecture:** Add a focused CommonJS routing module between the existing Canvas Agent server handler and OpenAI-compatible upstreams. The module owns candidate scoring, circuit breaking, sequential attempts, protocol normalization, and bounded run continuity; `server.js` supplies provider configuration and persisted metrics, while `canvas-agent-ui.js` consumes a small NDJSON event stream and continues to execute canvas tools locally with stable idempotency keys.

**Tech Stack:** Node.js 18+, CommonJS, built-in `node:assert`, Fetch/ReadableStream via the existing proxy-aware `undici` wrapper, NDJSON streaming, vanilla browser JavaScript and CSS.

## Global Constraints

- Prefer the fastest recently healthy real inference route; `/v1/models` latency is discovery data only.
- Try healthy routes for the preferred model first, then compatible models with text/vision/tool capability.
- Use sequential failover, never default parallel racing or duplicate upstream requests.
- Do not display model, provider, endpoint, or route order in the Canvas Agent UI.
- Do not add frontend health polling or work to canvas pointer, drag, zoom, selection, layout, or render hot paths.
- Build image context only when the user sends, keep the existing three-image cap, and never log Base64 image content.
- Every tool call and canvas mutation must be idempotent across retries and provider changes.
- User cancellation must abort the active attempt and must not trigger failover.
- Preserve optional Skills, automatic mode, canvas references, the 12-turn cap, and one-time paid-tool approval.
- When every upstream is unavailable, end promptly with an honest recoverable state instead of simulating an LLM response.
- The dirty working tree contains user-owned and dependent Canvas Agent changes. Do not commit, reset, clean, or move them; stage/commit steps are intentionally omitted.

---

### Task 1: Pure candidate scoring and circuit-breaker policy

**Files:**
- Create: `canvas-agent-router.js`
- Create: `tools/check-canvas-agent-router.js`
- Modify: `package.json:8-9`

**Interfaces:**
- Consumes: provider/model records shaped as `{ id, name, baseUrl, apiKey, enabled, models[] }` and bounded route history records.
- Produces: `normalizeAgentCandidate(input)`, `getRequiredAgentCapabilities(payload)`, `rankAgentCandidates(candidates, history, options)`, `classifyAgentRouteError(error)`, `shouldFailoverAgentError(error)`, `updateAgentRouteHealth(previous, event, options)`, and `executeSequentialFailover(options)`.

- [ ] **Step 1: Write the failing pure-policy check**

Create `tools/check-canvas-agent-router.js` with deterministic assertions:

```js
const assert = require("node:assert/strict");
const Router = require("../canvas-agent-router");

const now = 1_800_000_000_000;
const candidates = [
  { id: "terra-slow", providerId: "p1", model: "gpt-5.6-terra", baseUrl: "https://one.test/v1", apiKey: "a", capabilities: ["text", "vision", "tools"] },
  { id: "terra-fast", providerId: "p2", model: "gpt-5.6-terra", baseUrl: "https://two.test/v1", apiKey: "b", capabilities: ["text", "vision", "tools"] },
  { id: "fallback", providerId: "p3", model: "qwen-fast", baseUrl: "https://three.test/v1", apiKey: "c", capabilities: ["text", "vision", "tools"] },
].map(Router.normalizeAgentCandidate);

const ranked = Router.rankAgentCandidates(candidates, {
  "terra-slow": { successes: 4, failures: 2, ewmaFirstEventMs: 9000, consecutiveFailures: 0 },
  "terra-fast": { successes: 9, failures: 0, ewmaFirstEventMs: 800, consecutiveFailures: 0 },
  fallback: { successes: 20, failures: 0, ewmaFirstEventMs: 300, consecutiveFailures: 0 },
}, { preferredModel: "gpt-5.6-terra", now });
assert.deepEqual(ranked.map((item) => item.id), ["terra-fast", "terra-slow", "fallback"]);

const open = Router.updateAgentRouteHealth({}, { success: false, category: "timeout", at: now }, { failureThreshold: 2 });
const opened = Router.updateAgentRouteHealth(open, { success: false, category: "timeout", at: now + 1 }, { failureThreshold: 2 });
assert.ok(opened.circuitOpenUntil > now);
assert.equal(Router.classifyAgentRouteError({ httpStatus: 429, message: "rate limit" }), "rate-limit");
assert.equal(Router.classifyAgentRouteError({ httpStatus: 401, message: "bad key" }), "auth");
assert.deepEqual(Router.getRequiredAgentCapabilities({ vision_images: ["https://image.test/a.png"] }), ["text", "vision", "tools"]);

console.log("Canvas agent router checks passed.");
```

- [ ] **Step 2: Run the check and verify it fails**

Run: `node tools/check-canvas-agent-router.js`

Expected: FAIL with `Cannot find module '../canvas-agent-router'`.

- [ ] **Step 3: Implement the bounded health model and sequential executor**

Create `canvas-agent-router.js` with this public contract and constants:

```js
const DEFAULT_POLICY = Object.freeze({
  connectTimeoutMs: 4000,
  firstEventTimeoutMs: 10000,
  attemptTimeoutMs: 45000,
  totalTimeoutMs: 90000,
  failureThreshold: 2,
  shortCircuitMs: 2 * 60 * 1000,
  longCircuitMs: 15 * 60 * 1000,
  historyLimit: 50,
});

async function executeSequentialFailover({ candidates, runAttempt, signal, onStatus = () => {}, policy = {}, now = Date.now }) {
  const limits = { ...DEFAULT_POLICY, ...policy };
  const startedAt = now();
  const failures = [];
  for (let index = 0; index < candidates.length; index += 1) {
    if (signal?.aborted) throw Object.assign(new Error("Canvas Agent request was cancelled."), { name: "AbortError" });
    if (now() - startedAt >= limits.totalTimeoutMs) break;
    const candidate = candidates[index];
    if (index > 0) onStatus({ stage: "recovering" });
    try {
      return await runAttempt(candidate, { signal, policy: limits });
    } catch (error) {
      if (signal?.aborted || error?.name === "AbortError" && error?.cancelledByUser) throw error;
      failures.push({ candidateId: candidate.id, category: classifyAgentRouteError(error), error });
    }
  }
  const aggregate = new Error("所有可用服务暂时不可用，任务已保存，请稍后重试。");
  aggregate.name = "CanvasAgentUnavailableError";
  aggregate.failures = failures;
  throw aggregate;
}
```

Implement the remaining exported functions so that exact-model preference is applied before health score, open circuits are excluded until half-open time, auth/balance faults use the long circuit, network/timeout/429/5xx use the short circuit, and EWMA uses `0.7 * old + 0.3 * sample`.

`shouldFailoverAgentError(error)` must return `true` only for `network`, `timeout`, `rate-limit`, `server`, and `protocol` categories. It returns `false` for user cancellation, invalid task input, missing canvas material, and canvas tool failures.

- [ ] **Step 4: Run the router check**

Run: `node tools/check-canvas-agent-router.js`

Expected: `Canvas agent router checks passed.`

- [ ] **Step 5: Add the router check to the main check command**

Insert `node --check canvas-agent-router.js` beside the other syntax checks and `node tools/check-canvas-agent-router.js` before the existing Agent checks in `package.json`.

Run: `npm run check`

Expected: the new router check passes; any unrelated pre-existing failure is recorded without changing unrelated files.

### Task 2: Protocol adapters, adaptive reasoning, and streaming parsers

**Files:**
- Modify: `canvas-agent-runtime.js:118-285`
- Modify: `tools/check-canvas-agent-runtime.js`

**Interfaces:**
- Consumes: `buildResponsesRequest(payload, options)` and existing tool definitions.
- Produces: `selectAgentReasoningEffort(payload, configured)`, `buildChatCompletionsRequest(payload, options)`, `extractChatCompletionsTurn(data)`, `consumeResponsesStream(stream, callbacks)`, and `consumeChatCompletionsStream(stream, callbacks)`.

- [ ] **Step 1: Add failing runtime assertions**

Append checks proving that a plain `你好` request selects `low`, a continuation with tool outputs selects `medium`, Chat Completions tools use `{ type: "function", function: { name, description, parameters } }`, and streamed Responses/Chat chunks produce the same normalized `{ message, tool_calls }` turn shape.

```js
assert.equal(runtime.selectAgentReasoningEffort({ prompt: "你好", step: 0 }, "medium"), "low");
assert.equal(runtime.selectAgentReasoningEffort({ tool_outputs: [{ call_id: "c", output: "ok" }], step: 1 }, "medium"), "medium");
const chat = runtime.buildChatCompletionsRequest({ prompt: "创建一张海报", canvas: {}, step: 0 }, {
  model: "qwen-fast", reasoningEffort: "low", skills: [posterSkill],
});
assert.equal(chat.stream, true);
assert.equal(chat.tools[0].type, "function");
assert.equal(typeof chat.tools[0].function.parameters, "object");
assert.deepEqual(runtime.extractChatCompletionsTurn({
  id: "chat-1", model: "qwen-fast", choices: [{ message: { content: "完成", tool_calls: [] } }],
}).message, "完成");
```

- [ ] **Step 2: Run the runtime check and verify it fails**

Run: `node tools/check-canvas-agent-runtime.js`

Expected: FAIL because `selectAgentReasoningEffort` or `buildChatCompletionsRequest` is not defined.

- [ ] **Step 3: Add canonical request and protocol normalization**

Refactor common prompt, Skill instructions, tools, and visual input into a provider-neutral descriptor:

```js
function buildCanonicalAgentTurn(payload, options) {
  const skills = Array.isArray(options.skills) ? options.skills : [];
  const skillId = String(payload.skill_id || "").trim();
  const manual = payload.skill_mode === "manual" && Boolean(skillId);
  const skill = manual ? skills.find((item) => item.id === skillId) : null;
  if (manual && !skill) throw new Error(`Unknown Canvas Agent skill: ${skillId}.`);
  const allowedNames = manual
    ? new Set(skill.canvas.tools)
    : new Set(skills.flatMap((item) => item.canvas.tools));
  return {
    model: String(options.model || "").trim(),
    instructions: manual ? buildAgentInstructions(skill) : buildAutomaticAgentInstructions(skills),
    reasoningEffort: selectAgentReasoningEffort(payload, options.reasoningEffort),
    tools: CanvasAgentCore.TOOL_DEFINITIONS.filter((tool) => allowedNames.has(tool.name)),
    prompt: String(payload.prompt || "").trim(),
    canvas: payload.canvas && typeof payload.canvas === "object" ? payload.canvas : {},
    visionImages: normalizeVisionImages(payload.vision_images),
    transcript: Array.isArray(options.transcript) ? options.transcript : [],
    toolOutputs: normalizeToolOutputs(payload.tool_outputs),
  };
}
```

Keep `buildResponsesRequest` backward compatible, add `stream: true` for routed requests, and map the canonical descriptor into Chat Completions messages and tools. Reasoning stays `low` for greeting/simple initial turns and uses the configured level for manual Skill or tool continuation.

- [ ] **Step 4: Implement bounded SSE decoding**

Add a shared async line decoder that caps buffered event data at 1 MiB, recognizes `[DONE]`, and calls `callbacks.onFirstEvent()` only for text deltas, tool deltas, or completed output—not for connection metadata. Accumulate tool argument fragments by tool-call index/call ID and pass the final object through the existing argument JSON validation.

- [ ] **Step 5: Run the runtime and syntax checks**

Run: `node tools/check-canvas-agent-runtime.js`

Expected: `Canvas agent runtime checks passed.`

Run: `node --check canvas-agent-runtime.js`

Expected: exit code 0.

### Task 3: Provider candidates and asynchronous Agent health persistence

**Files:**
- Modify: `server.js:47-66, 462-548, 5063-5240`
- Modify: `tools/check-canvas-agent-server.js`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `readSettingsFile()`, `getSystemProviders()`, the `.env` fallback route, and router health records.
- Produces: `getCanvasAgentCandidates(payload)`, `readCanvasAgentRouteHistory()`, `queueCanvasAgentRouteEvent(candidate, event)`, and `flushCanvasAgentRouteEvents()`.

- [ ] **Step 1: Add failing server-structure checks**

Assert that `server.js` imports `canvas-agent-router`, builds candidates from configured/system providers, retains the environment fallback, stores route metrics separately under `agentRoutes`, and uses an asynchronous/debounced flush rather than calling `writeProviderMonitoringFile` inside every Agent attempt.

```js
assert.match(server, /require\("\.\/canvas-agent-router"\)/);
assert.match(server, /function getCanvasAgentCandidates/);
assert.match(server, /agentRoutes/);
assert.match(server, /queueCanvasAgentRouteEvent/);
assert.match(server, /CANVAS_AGENT_FIRST_EVENT_TIMEOUT_MS/);
assert.match(envExample, /^CANVAS_AGENT_FIRST_EVENT_TIMEOUT_SECONDS=10$/m);
assert.match(envExample, /^CANVAS_AGENT_TOTAL_TIMEOUT_SECONDS=90$/m);
```

- [ ] **Step 2: Run the server check and verify it fails**

Run: `node tools/check-canvas-agent-server.js`

Expected: FAIL on the missing router import or candidate function.

- [ ] **Step 3: Build candidates without exposing secrets**

Add `getCanvasAgentCandidates(payload)` that merges configured providers, non-duplicated system providers, and this fallback:

```js
const fallback = {
  id: "canvas-agent-env-fallback",
  providerId: "canvas-agent-env-fallback",
  model: CANVAS_AGENT_MODEL,
  baseUrl: CANVAS_AGENT_API_URL,
  apiKey: CANVAS_AGENT_API_KEY,
  protocol: "responses",
  capabilities: ["text", "vision", "tools"],
  source: "env",
};
```

Normalize provider base URLs into both `/v1/responses` and `/v1/chat/completions` candidates, deduplicate by normalized endpoint + model + key fingerprint, and filter image-only models. Exact `CANVAS_AGENT_MODEL` entries remain eligible even when the old model record has an empty capability array; other fallback models require `text`, with `vision` required when `vision_images` is non-empty.

- [ ] **Step 4: Add bounded in-memory metrics and debounced persistence**

Load `history.agentRoutes || {}` once, update it in memory after attempts, keep at most 50 recent events per candidate, and debounce a single asynchronous `fs.promises.writeFile` through an atomic temporary-file rename. Do not store API keys, prompts, image data, model responses, or full endpoint query strings.

- [ ] **Step 5: Add timeout configuration**

Add these defaults while retaining `CANVAS_AGENT_TIMEOUT_SECONDS` only as a compatibility alias for the per-attempt ceiling:

```dotenv
CANVAS_AGENT_CONNECT_TIMEOUT_SECONDS=4
CANVAS_AGENT_FIRST_EVENT_TIMEOUT_SECONDS=10
CANVAS_AGENT_ATTEMPT_TIMEOUT_SECONDS=45
CANVAS_AGENT_TOTAL_TIMEOUT_SECONDS=90
CANVAS_AGENT_REASONING_EFFORT=medium
```

- [ ] **Step 6: Run server checks**

Run: `node tools/check-canvas-agent-server.js`

Expected: `Canvas agent server checks passed.`

### Task 4: Routed Agent execution, run continuity, and cancellation

**Files:**
- Modify: `server.js:264-271, 1991-2050`
- Modify: `canvas-agent-router.js`
- Create: `tools/check-canvas-agent-failover.js`
- Modify: `package.json:8-9`

**Interfaces:**
- Consumes: ranked candidates, protocol request builders/parsers, proxy-aware `fetch`, and client `run_id`/`tool_outputs`.
- Produces: NDJSON events `{ type: "status", stage }`, `{ type: "turn", turn }`, and `{ type: "error", error, recoverable }`; bounded `canvasAgentSessions` entries containing canonical transcript and pinned candidate ID.

- [ ] **Step 1: Write a deterministic fault-injection check**

Use injected candidate runners—no network—to prove the first healthy route wins, a timeout moves to the second route, user cancellation stops immediately, and a continuation reuses the pinned route before alternatives.

```js
const result = await Router.executeSequentialFailover({
  candidates: [{ id: "slow" }, { id: "fast" }],
  runAttempt: async (candidate) => {
    if (candidate.id === "slow") throw Object.assign(new Error("first event timeout"), { code: "FIRST_EVENT_TIMEOUT" });
    return { candidateId: candidate.id, turn: { message: "ok", tool_calls: [] } };
  },
});
assert.equal(result.candidateId, "fast");
```

- [ ] **Step 2: Run the failover check and verify the missing orchestration behavior**

Run: `node tools/check-canvas-agent-failover.js`

Expected: FAIL until the injected failover/session interfaces exist.

- [ ] **Step 3: Implement bounded server run sessions**

Add an in-memory `Map` keyed by the browser-generated `run_id`. Each value contains only `createdAt`, `updatedAt`, `pinnedCandidateId`, `initialTurn`, and a maximum of 12 normalized assistant/tool-output transcript entries. Expire sessions after 30 minutes and cap the map at 100 entries by evicting the oldest inactive session.

Do not put API keys or raw Base64 images in metrics. Initial visual inputs may remain only in the active session and must be dropped on completion/cancel/expiry.

- [ ] **Step 4: Route each attempt with three timers**

For each candidate, compose the request for its protocol, attach an attempt `AbortController`, link it to the incoming request close/user abort signal, enforce connection/first-event/attempt timers, and update route health. Pin the winning candidate to the run. On continuation failure, rebuild from the canonical transcript instead of forwarding another provider's `previous_response_id`.

The failure path must use this rule:

```js
if (clientCancelled) {
  const cancelled = new Error("Canvas Agent request was cancelled.");
  cancelled.name = "AbortError";
  cancelled.cancelledByUser = true;
  throw cancelled;
}
if (!CanvasAgentRouter.shouldFailoverAgentError(error)) throw error;
recordFailure(candidate, error);
return tryNextCandidate();
```

- [ ] **Step 5: Stream sanitized NDJSON events**

Set `Content-Type: application/x-ndjson; charset=utf-8`, write one compact JSON object per line, and never include candidate/provider/model fields in browser events. Emit `recovering` only after the first failed attempt. Finish with exactly one `turn` or one `error` event.

- [ ] **Step 6: Run failover and server checks**

Run: `node tools/check-canvas-agent-failover.js`

Expected: `Canvas agent failover checks passed.`

Run: `node tools/check-canvas-agent-server.js`

Expected: `Canvas agent server checks passed.`

### Task 5: Non-blocking browser stream and hidden implementation details

**Files:**
- Modify: `canvas-agent-ui.js:47-93, 520-666, 930-1050`
- Modify: `canvas-agent.css`
- Modify: `tools/check-canvas-agent-ui.js`

**Interfaces:**
- Consumes: sanitized NDJSON status/turn/error events from `/api/canvas-agent/turn`.
- Produces: `readCanvasAgentEventStream(response, handlers)`, stable `run_id` on all turns, coalesced status rendering, and idempotent tool execution keys.

- [ ] **Step 1: Add failing UI static checks**

Assert that the header contains no configured model element, the request sends `Accept: application/x-ndjson`, a stream reader exists, route status names do not contain provider/model data, and no timer polls provider health.

```js
assert.doesNotMatch(ui, /canvasAgentModel/);
assert.doesNotMatch(ui, /gpt-5\.6-terra/);
assert.match(ui, /Accept:\s*["']application\/x-ndjson/);
assert.match(ui, /function readCanvasAgentEventStream/);
assert.match(ui, /run_id:\s*state\.currentRun\.id/);
assert.doesNotMatch(ui, /setInterval\([^)]*provider|setInterval\([^)]*health/i);
```

- [ ] **Step 2: Run the UI check and verify it fails**

Run: `node tools/check-canvas-agent-ui.js`

Expected: FAIL because the UI still parses a single JSON response and still renders model metadata.

- [ ] **Step 3: Remove model display and add generic run states**

Keep only the “画布 Agent” title and map streamed stages to fixed copy:

```js
const AGENT_STAGE_LABELS = Object.freeze({
  understanding: "正在理解",
  planning: "正在规划",
  executing: "正在执行画布操作",
  recovering: "当前响应较慢，正在恢复",
  resumed: "已恢复，继续执行",
});
```

Do not render event detail strings supplied by the server in the normal status bar.

- [ ] **Step 4: Implement incremental NDJSON parsing with coalesced DOM updates**

Read `response.body` through `TextDecoder`, keep only the unfinished last line, reject a line over 256 KiB, and process completed JSON lines. Coalesce status and partial text painting behind one `requestAnimationFrame`; update only existing Agent panel nodes. A final `turn` resolves the request promise; an `error` rejects with its recoverable flag.

- [ ] **Step 5: Add stable idempotency keys**

Include `run_id` on initial and continuation requests. Before executing a call, use `${runId}:${call.call_id}` as the general execution key and retain the existing stricter paid-node key. Persist completed call IDs in the bounded saved run and return the saved output if a duplicate call is received; do not invoke the canvas function twice.

- [ ] **Step 6: Preserve cancellation and clean up resources**

`stopCanvasAgentRun()` aborts the stream, cancels the pending animation frame, clears transient status, and leaves canvas listeners untouched. Panel close does not cancel an active task unless the user presses Stop, but closing/opening must not register duplicate listeners.

- [ ] **Step 7: Run UI and syntax checks**

Run: `node tools/check-canvas-agent-ui.js`

Expected: `Canvas agent UI checks passed.`

Run: `node --check canvas-agent-ui.js`

Expected: exit code 0.

### Task 6: Real Agent capability verification in Settings

**Files:**
- Modify: `server.js:264-300, 745-900, 5063-5155`
- Modify: `script.js:36-40, 1660-1710, 2030-2260, 2440-2460`
- Modify: `styles.css:8942-9225`
- Create: `tools/check-provider-agent-verification.js`
- Modify: `package.json:8-9`

**Interfaces:**
- Consumes: selected provider/model ID and existing stored provider credentials.
- Produces: `POST /api/settings/providers/agent-verify` returning sanitized `{ state, checkedAt, text, vision, tools, latencyMs, protocol, message }` and a Settings “验证 Agent” action.

- [ ] **Step 1: Add failing endpoint/UI checks**

Check that the new route exists, uses a stored provider key, invokes a side-effect-free `report_agent_probe` tool, records the result under `agentCapabilities[providerId][modelId]`, and renders “Agent 实测” separately from “模型发现”.

- [ ] **Step 2: Run the verification check and confirm failure**

Run: `node tools/check-provider-agent-verification.js`

Expected: FAIL because the endpoint and UI action do not exist.

- [ ] **Step 3: Implement the side-effect-free probe**

Send a low-token request containing exactly one local no-op function:

```js
const probeTool = {
  name: "report_agent_probe",
  description: "Return the supplied nonce to verify tool calling.",
  parameters: {
    type: "object",
    properties: { nonce: { type: "string" } },
    required: ["nonce"],
    additionalProperties: false,
  },
};
```

The prompt asks for that function with a random nonce. A valid matching call verifies text/tools. Vision remains `verified` only when the model is configured for vision and a tiny fixed local test image is accepted; otherwise report `untested`, not `failed`. Cap probe output at 256 tokens and timeout at the normal first-event threshold.

- [ ] **Step 4: Add the Settings action without polling**

Render a “验证 Agent” button for text-capable models. It runs only on click, disables itself while active, and shows independent badges for tool capability and true inference latency. Keep the existing monitoring refresh behavior unchanged and label its latency “模型发现”.

- [ ] **Step 5: Run verification and Settings-related checks**

Run: `node tools/check-provider-agent-verification.js`

Expected: `Provider Agent verification checks passed.`

Run: `node tools/check-provider-universal-health.js && node tools/check-provider-runtime-metrics.js && node tools/check-provider-monitoring-dashboard.js`

Expected: all three existing provider checks pass.

### Task 7: Performance regression and end-to-end failure modes

**Files:**
- Create: `tools/check-canvas-agent-performance.js`
- Modify: `tools/check-canvas-agent-endpoint.js`
- Modify: `package.json:8-9`
- Modify: `build-portable.bat`

**Interfaces:**
- Consumes: completed server/router/runtime/UI implementation.
- Produces: deterministic regression checks for no frontend polling/hot-path coupling, bounded buffers/history/sessions, portable packaging, and a local mock-upstream end-to-end route switch.

- [ ] **Step 1: Write the performance/static guard check**

Assert that Agent code does not register `pointermove`, `wheel`, or canvas render-loop handlers; health probing is server-only; image conversion remains inside send-time `collectCanvasAgentVisionImages`; stream buffers, route histories, sessions, and transcript steps all have explicit caps.

```js
assert.doesNotMatch(ui, /addEventListener\(["'](?:pointermove|wheel|mousemove)["']/);
assert.match(ui, /collectCanvasAgentVisionImages/);
assert.match(router, /historyLimit:\s*50/);
assert.match(server, /CANVAS_AGENT_MAX_SESSIONS\s*=\s*100/);
assert.match(runtime, /MAX_STEPS/);
```

- [ ] **Step 2: Run the performance check and confirm any missing guard**

Run: `node tools/check-canvas-agent-performance.js`

Expected: FAIL until every explicit bound and no-polling guard is present.

- [ ] **Step 3: Extend the endpoint check with two local mock upstreams**

Start ephemeral local HTTP servers in the check: the first emits a timeout/503; the second emits a valid Responses or Chat Completions stream. Start the application with temporary provider settings/environment, send one `/api/canvas-agent/turn` request, assert a generic `recovering` event followed by a successful `turn`, and assert the browser stream contains neither provider nor model names. Always close mock servers and the app process in `finally`.

- [ ] **Step 4: Include the new module in portable packaging**

Add `canvas-agent-router.js` to `build-portable.bat` beside the other Agent files. Do not add runtime history or API keys to the package.

- [ ] **Step 5: Run focused checks**

Run: `node tools/check-canvas-agent-router.js && node tools/check-canvas-agent-runtime.js && node tools/check-canvas-agent-failover.js && node tools/check-canvas-agent-server.js && node tools/check-canvas-agent-ui.js && node tools/check-provider-agent-verification.js && node tools/check-canvas-agent-performance.js && node tools/check-canvas-agent-endpoint.js`

Expected: every focused check prints its `... checks passed.` message and exits 0.

- [ ] **Step 6: Run the complete regression suite**

Run: `npm run check`

Expected: exit code 0 with all existing and new checks passing.

- [ ] **Step 7: Perform browser acceptance**

With the local app running, verify: plain “你好” receives a fast response; a deliberately broken primary route visibly changes only to “当前响应较慢，正在恢复” and then completes; no model name appears; stopping prevents further output; selecting, dragging, zooming, framing, connecting, and editing nodes remain responsive during streaming and failover; the same injected tool-call ID creates exactly one canvas mutation.

Expected: all behaviors match the design and no console error or unhandled rejection appears.
