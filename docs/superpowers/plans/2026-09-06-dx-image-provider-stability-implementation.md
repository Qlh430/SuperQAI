# DX-Style Image Provider Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore reliable image generation for APIMart/APIB and other OpenAI-compatible providers while preserving safe, provider-aware 4K behavior.

**Architecture:** Resolve execution in three layers: model protocol describes the common API family, provider/host adapters override only incompatible transport semantics, and model metadata controls supported capabilities. APIMart/APIB image requests use their asynchronous task contract and ratio-plus-resolution parameters; ordinary OpenAI-compatible providers retain the generic Images API and official OpenAI pixel validation.

**Tech Stack:** Node.js 24, CommonJS, Fetch/Response, existing provider registry/executor/media bridge, assertion-based Node test scripts.

## Global Constraints

- Do not read, expose, copy, or migrate API secret values.
- Do not modify `.git`; repository metadata is intentionally deferred and read-only.
- A billable request may be retried only before a provider returns a task identifier.
- After a task identifier is returned, recovery may poll that task but must never resubmit it automatically.
- Official OpenAI limits remain strict; APIMart/APIB may accept logical `4k` with an aspect ratio and return the provider's real dimensions.
- Unknown providers use the generic OpenAI-compatible parser; unknown asynchronous polling contracts fail with a recoverable explanation rather than guessing an endpoint.

---

### Task 1: Provider-aware APIMart/APIB image adapter

**Files:**
- Modify: `media-protocol-adapters.js`
- Modify: `provider-protocol-engine.js`
- Modify: `provider-protocol-registry.js`
- Test: `tools/check-media-provider-bridge.js`

**Interfaces:**
- Consumes: `createProtocolEngine({ registry, outboundFetch })`, provider `{ baseUrl, protocol }`, model `{ id, protocol, metadata.upstreamModel }`.
- Produces: adapter result `{ data: Array<{url?: string, b64_json?: string}>, task_id?: string }` and `resolve(provider, model)` selecting a provider/host adapter for image operations.

- [x] **Step 1: Write failing APIMart/APIB task tests**

Add assertions that `gpt-image-2-apimart` posts once to `/v1/images/generations`, sends `model: "gpt-image-2"`, `size: "1:1"`, `resolution: "4k"`, polls `/v1/tasks/{id}`, and extracts an image URL nested under `data.result.output`. Add the same host-routing assertion for an `https://apib.ai/v1` provider stored as protocol `openai`.

- [x] **Step 2: Run the focused test and confirm RED**

Run: `node tools/check-media-provider-bridge.js`

Expected: FAIL because the current APIMart adapter always posts to `/v1/midjourney/generations`, while APib is routed to the generic OpenAI Images parser.

- [x] **Step 3: Implement provider/host adapter precedence**

Update protocol resolution so a provider-level adapter wins for media-specific transports, and treat `api.apimart.ai` and `apib.ai` as known asynchronous image hosts when the selected model has image capability/protocol. Keep normal OpenAI providers on `openai-images`.

- [x] **Step 4: Implement GPT Image and Midjourney branches in the adapter**

Use the existing Midjourney request unchanged for Midjourney IDs. For other image models, submit to `/v1/images/generations` with the upstream model alias, normalized aspect ratio, normalized `1k`/`2k`/`4k` resolution, optional references for supported edit requests, and recursively parsed direct output. If only a task ID is returned, poll `/v1/tasks/{id}` until success/failure/timeout.

- [x] **Step 5: Prove no duplicate billing after submission**

Add a test where submission returns `task_id` and polling returns HTTP 503. Assert only one POST occurred and the final error is `UPSTREAM_TASK_PENDING` with `retryable === false`.

- [x] **Step 6: Run focused tests and confirm GREEN**

Run: `node tools/check-media-provider-bridge.js && node tools/check-provider-protocol-engine.js`

Expected: both scripts print their pass messages.

### Task 2: Robust generic image-result parsing

**Files:**
- Modify: `provider-protocol-engine.js`
- Test: `tools/check-provider-protocol-engine.js`

**Interfaces:**
- Consumes: arbitrary OpenAI-compatible image response JSON.
- Produces: normalized `{ data: [{ url } | { b64_json, mime_type? }], usage }`.

- [x] **Step 1: Write failing recursive parser tests**

Cover URLs nested under `data`, `images`, `result`, `output`, and `response`, plus `b64_json`, `image_base64`, data URLs, and duplicates.

- [x] **Step 2: Run the protocol test and confirm RED**

Run: `node tools/check-provider-protocol-engine.js`

Expected: FAIL because `parseResult("openai-image")` currently only reads the top-level `data` or `images` array.

- [x] **Step 3: Implement the recursive normalizer**

Traverse only recognized response containers and media keys, normalize base64 records without logging payload contents, deduplicate by URL or base64 identity, and preserve usage metadata.

- [x] **Step 4: Run the protocol test and confirm GREEN**

Run: `node tools/check-provider-protocol-engine.js`

Expected: the parser assertions and all existing protocol assertions pass.

### Task 3: Provider-aware 4K validation and request mapping

**Files:**
- Modify: `image-resolution-rules.js`
- Modify: `server.js`
- Test: `tools/check-image-resolution-rules.js`
- Test: `tools/check-custom-image-resolution-config.js`

**Interfaces:**
- Consumes: `{ platform, providerProtocol, providerHost, family, ratio, resolution, configuredResolutions }`.
- Produces: compatibility with `parameterMode: "pixels" | "ratio-resolution"`, `requestedSize`, and the selected logical resolution.

- [x] **Step 1: Write failing provider-aware 4K tests**

Assert official OpenAI square 4K remains unsupported with the current 2880 alternative. Assert `api.apimart.ai` and `apib.ai` square 4K are supported as `size: "1:1"` plus `resolution: "4k"`, without fabricating an exact output dimension.

- [x] **Step 2: Run focused rules tests and confirm RED**

Run: `node tools/check-image-resolution-rules.js && node tools/check-custom-image-resolution-config.js`

Expected: APIMart/APIB square 4K assertions fail under the current universal OpenAI area limit.

- [x] **Step 3: Add transport-aware compatibility**

Keep official pixel validation in `getOpenAiCompatibility`. Add a ratio-resolution branch for known compatible provider protocols/hosts, validate the requested ratio and enabled resolution, and return logical parameters rather than an exact promised dimension.

- [x] **Step 4: Pass provider identity from the public catalog**

Expose non-secret provider protocol and host information on image catalog entries/candidates, and pass those values into `validateImageOutputRequest`. Never include the base URL path, query, or credentials in the browser response.

- [x] **Step 5: Run focused rules and endpoint tests**

Run: `node tools/check-image-resolution-rules.js && node tools/check-custom-image-resolution-config.js && node tools/check-media-provider-bridge.js`

Expected: official OpenAI and APIMart/APIB behavior both pass.

### Task 4: Regression and safety verification

**Files:**
- Modify: `docs/superpowers/plans/2026-09-06-dx-image-provider-stability-implementation.md`

**Interfaces:**
- Consumes: all backend changes from Tasks 1-3.
- Produces: checked plan steps and fresh verification evidence.

- [x] **Step 1: Run syntax checks**

Run: `node --check media-protocol-adapters.js && node --check provider-protocol-engine.js && node --check provider-protocol-registry.js && node --check image-resolution-rules.js && node --check server.js`

Expected: exit code 0.

- [x] **Step 2: Run provider and media suites**

Run: `npm run check:provider-protocol && npm run check:media-provider && node tools/check-custom-image-resolution-config.js`

Expected: all scripts pass without exposing credentials.

- [x] **Step 3: Mark completed steps**

Replace each completed `[ ]` with `[x]` in this file. Do not commit because `.git` work is explicitly deferred.
