# Canvas Agent Model Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple Canvas Agent orchestration and its reusable canvas tools from the selected LLM protocol through a validated model-adapter registry.

**Architecture:** Add a CommonJS model-adapter registry containing Responses and OpenAI-compatible Chat adapters. Candidates carry an adapter ID, while `server.js` delegates request construction, endpoint selection, authentication headers, response parsing, stream consumption, and capability probes to the resolved adapter; downstream turns remain provider-neutral.

**Tech Stack:** Node.js 18+, CommonJS, Fetch/ReadableStream, built-in `node:assert`, existing Canvas Agent runtime/router.

## Global Constraints

- Do not modify Canvas Tool definitions, Skill workflows, approval policy, board scoping, or broker idempotency.
- Preserve existing Responses and Chat Completions wire behavior and failover order.
- Keep `protocol` as a compatibility field while making `adapterId` authoritative for execution.
- Do not add frontend model names, polling, canvas event handlers, or render-path work.
- Do not expose API keys, prompts, images, providers, or model names in browser Agent events.
- Keep the current dirty worktree intact; do not reset, clean, stage, commit, or rewrite unrelated files.

---

### Task 1: Validated model-adapter registry

**Files:**
- Create: `canvas-agent-model-adapters.js`
- Create: `tools/check-canvas-agent-model-adapters.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `CanvasAgentRuntime.buildResponsesRequest`, `buildChatCompletionsRequest`, response extractors, and stream consumers.
- Produces: `registerModelAdapter(adapter, options)`, `getModelAdapter(id)`, `resolveModelAdapter(candidate)`, `listModelAdapters()`, and the built-in IDs `openai-responses`/`openai-chat`.

- [x] **Step 1: Write the failing adapter contract test**

Create a Node assertion test that imports `canvas-agent-model-adapters.js`, verifies both built-ins, checks endpoint/header/request differences, parses equivalent Responses and Chat payloads into the same normalized turn, rejects an incomplete adapter, and registers/resolves a complete custom adapter.

- [x] **Step 2: Run the test and verify RED**

Run: `node tools/check-canvas-agent-model-adapters.js`

Expected: FAIL with `Cannot find module '../canvas-agent-model-adapters'`.

- [x] **Step 3: Implement the minimal registry and built-ins**

The registry validates these functions on every adapter:

```js
const REQUIRED_METHODS = [
  "buildRequest",
  "getEndpoint",
  "getHeaders",
  "parseResponse",
  "consumeStream",
  "buildToolProbe",
  "buildVisionProbe",
];
```

Responses delegates to the existing Responses runtime functions and uses Bearer auth at `candidate.responsesUrl`. Chat delegates to the existing Chat functions and uses Bearer auth at `candidate.chatCompletionsUrl`. Both expose frozen metadata and return the same normalized turn shape.

- [x] **Step 4: Run the test and verify GREEN**

Run: `node tools/check-canvas-agent-model-adapters.js`

Expected: `Canvas agent model adapter checks passed.`

### Task 2: Adapter-aware candidates

**Files:**
- Modify: `canvas-agent-router.js`
- Modify: `tools/check-canvas-agent-router.js`

**Interfaces:**
- Consumes: legacy candidate `protocol` or explicit `adapterId`.
- Produces: candidates with `{ adapterId, protocol }`, stable IDs and adapter-aware deduplication.

- [x] **Step 1: Add failing router assertions**

Assert that a Responses candidate gets `adapterId === "openai-responses"`, a Chat candidate gets `openai-chat`, an explicit custom adapter ID is preserved, and otherwise identical adapters remain separate candidates.

- [x] **Step 2: Run the router test and verify RED**

Run: `node tools/check-canvas-agent-router.js`

Expected: FAIL because candidates have no normalized `adapterId`.

- [x] **Step 3: Add adapter ID normalization**

Use this compatibility mapping:

```js
function normalizeModelAdapterId(value, protocol) {
  const explicit = String(value || "").trim().toLowerCase();
  if (explicit) return explicit;
  return String(protocol || "responses").toLowerCase() === "chat"
    ? "openai-chat"
    : "openai-responses";
}
```

Include `adapterId` in generated candidate IDs and deduplication keys without removing `protocol`.

- [x] **Step 4: Run the router test and verify GREEN**

Run: `node tools/check-canvas-agent-router.js`

Expected: `Canvas agent router checks passed.`

### Task 3: Protocol-neutral execution and verification

**Files:**
- Modify: `server.js`
- Modify: `tools/check-canvas-agent-server.js`
- Modify: `tools/check-provider-agent-verification.js`

**Interfaces:**
- Consumes: `CanvasAgentModelAdapters.resolveModelAdapter(candidate)`.
- Produces: execution and verification paths without protocol-specific request/parse branches.

- [x] **Step 1: Add failing server structure assertions**

Assert the model-adapter import exists, `runCanvasAgentCandidate` resolves an adapter, and its request/endpoint/header/parse/stream operations call adapter methods. Assert the old `candidate.protocol === "chat"` branches are absent from that function.

- [x] **Step 2: Run server checks and verify RED**

Run: `node tools/check-canvas-agent-server.js && node tools/check-provider-agent-verification.js`

Expected: FAIL on the missing model-adapter integration.

- [x] **Step 3: Refactor the Agent attempt path**

Resolve one adapter per candidate, then call:

```js
const adapter = CanvasAgentModelAdapters.resolveModelAdapter(candidate);
const requestBody = adapter.buildRequest(effectivePayload, runtimeOptions);
const upstream = await fetch(adapter.getEndpoint(candidate), {
  method: "POST",
  headers: adapter.getHeaders(candidate),
  body: JSON.stringify(requestBody),
  signal: controller.signal,
});
```

Use `adapter.consumeStream` or `adapter.parseResponse` for the response. Record `adapterId` alongside the compatibility `protocol` in capability history.

- [x] **Step 4: Route capability probes through adapters**

Replace protocol-specific probe body, endpoint, header and parse branches with `buildToolProbe`, `buildVisionProbe`, `getEndpoint`, `getHeaders` and `parseResponse`. Keep the existing nonce validation and vision policy.

- [x] **Step 5: Run focused server checks and verify GREEN**

Run: `node tools/check-canvas-agent-server.js && node tools/check-provider-agent-verification.js`

Expected: both checks pass.

### Task 4: Packaging and full regression

**Files:**
- Modify: `build-portable.bat`
- Modify: `tools/check-portable-package.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: completed model-adapter module.
- Produces: source and portable builds that both load the adapter registry.

- [x] **Step 1: Add failing package assertions**

Require `canvas-agent-model-adapters.js` in the portable expected-file list and in the Agent server packaging check.

- [x] **Step 2: Run portable checks and verify RED**

Run: `node tools/check-portable-package.js`

Expected: FAIL until the build copy list contains the new module.

- [x] **Step 3: Add the module to syntax, focused-test and portable copy lists**

Update `package.json` so `npm run check` runs `node --check canvas-agent-model-adapters.js` and `node tools/check-canvas-agent-model-adapters.js`. Add the file beside the other Canvas Agent runtime modules in `build-portable.bat`.

- [x] **Step 4: Run focused verification**

Run: `node tools/check-canvas-agent-model-adapters.js && node tools/check-canvas-agent-router.js && node tools/check-canvas-agent-runtime.js && node tools/check-canvas-agent-server.js && node tools/check-provider-agent-verification.js && node tools/check-portable-package.js`

Expected: every check exits 0.

- [x] **Step 5: Run the complete regression suite**

Run: `npm run check`

Expected: exit code 0 with all existing and new checks passing.

- [x] **Step 6: Run existing browser Agent acceptance**

Run the existing Canvas Agent browser and UI browser check commands from the project tooling. Verify the Agent can open, retain context, execute a safe canvas tool, and keep canvas interaction responsive without displaying a model name.

Expected: both browser checks exit 0 with no console error.
