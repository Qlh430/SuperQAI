# Agent Model Ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Agent model settings page where the user selects one primary API/model candidate and the runtime automatically ranks and fails over through verified backups.

**Architecture:** Keep LLM compatibility in the existing connector layer and canvas execution behind MCP. Move candidate policy to one reliability-first router configuration, expose sanitized candidate IDs through the settings endpoint, and let the settings UI select one primary candidate without exposing routing strategies. Preserve per-board sessions and MCP call idempotency while sequential failover changes only the LLM candidate.

**Tech Stack:** Node.js 18+, CommonJS, browser-native HTML/CSS/JavaScript, NDJSON streaming, existing static and Playwright-style check scripts.

## Global Constraints

- Candidate identity is API provider + normalized endpoint + Key fingerprint + model + adapter protocol; secrets must never enter settings responses.
- Every executable candidate must have verified `text: true` and `tools: true`; vision requests additionally require `vision: true`.
- The user selects at most one primary candidate; backup order is automatic and reliability-first.
- Canvas rendering, dragging and zooming must not wait for model discovery, verification or health persistence.
- All Agent state and MCP outputs remain scoped by `board_id`, `run_id` and `call_id`.
- Preserve unrelated dirty worktree changes; do not stage or commit during this shared-session implementation.

---

### Task 1: Reliability-first router and primary candidate migration

**Files:**
- Modify: `canvas-agent-router.js`
- Modify: `tools/check-canvas-agent-router.js`
- Modify: `server.js`
- Test: `tools/check-canvas-agent-server.js`

**Interfaces:**
- Produces: `normalizeAgentRouting(value) -> { primaryCandidateId: string }`
- Produces: `rankAgentCandidates(candidates, history, { routing, requiredCapabilities }) -> Candidate[]`
- Consumes: existing route health records keyed by protocol candidate ID.

- [x] **Step 1: Write failing router tests**

Add assertions that legacy modes normalize without remaining strategy state, an exact healthy `primaryCandidateId` ranks first, a failed/open primary is skipped, and backup ranking favors long-term success over a faster but failure-prone route:

```js
assert.deepEqual(Router.normalizeAgentRouting({ mode: "speed" }), { primaryCandidateId: "" });
assert.equal(Router.rankAgentCandidates(candidates, reliableHistory, {
  routing: { primaryCandidateId: "stable" },
})[0].id, "stable");
assert.equal(Router.rankAgentCandidates(candidates, openPrimaryHistory, {
  routing: { primaryCandidateId: "unstable" },
  now,
})[0].id, "stable");
```

- [x] **Step 2: Run RED tests**

Run: `node tools/check-canvas-agent-router.js; node tools/check-canvas-agent-server.js`

Expected: FAIL because routing still exposes `mode`/`preferredModel` and scores depend on selectable modes.

- [x] **Step 3: Implement minimal routing policy**

Replace public mode weights with one reliability-first score. Rank by primary match first, then failure rate, consecutive failures, sample confidence/recency, and latency as a tiebreaker. Update settings normalization to migrate legacy routing to automatic selection.

- [x] **Step 4: Run GREEN tests**

Run: `node tools/check-canvas-agent-router.js; node tools/check-canvas-agent-server.js`

Expected: both checks pass.

### Task 2: Verified candidate identity and sanitized candidate pool

**Files:**
- Modify: `canvas-agent-router.js`
- Modify: `server.js`
- Modify: `tools/check-provider-agent-verification.js`
- Modify: `tools/check-canvas-agent-server.js`

**Interfaces:**
- Produces: candidate pool rows with `id`, `providerId`, `providerName`, `endpoint`, `model`, `rank`, `isPrimary`, `state`, and sanitized health fields.
- Produces: `POST /api/settings/providers/agent-verify` with progress-safe final result.
- Consumes: capability registry keyed by provider/model and route health keyed by candidate adapter ID.

- [x] **Step 1: Write failing verification and pool tests**

Assert that environment fallback is not executable without a matching verified capability record, duplicate model names on different providers remain separate, and no response contains `apiKey` or its fingerprint:

```js
assert.match(source, /verified\.text === true/);
assert.match(source, /verified\.tools === true/);
assert.doesNotMatch(candidatePoolSource, /apiKey\s*:/);
assert.match(candidatePoolSource, /primaryCandidateId/);
```

- [x] **Step 2: Run RED tests**

Run: `node tools/check-provider-agent-verification.js; node tools/check-canvas-agent-server.js`

Expected: FAIL because the environment fallback currently declares tools without verification and pool IDs do not represent the selected grouped candidate.

- [x] **Step 3: Implement strict verification gating**

Require verified text/tools for configured and environment candidates. Preserve a bootstrap path by treating a successful real Agent tool call as capability evidence. Return one grouped UI candidate per provider/model with a stable opaque selection ID and keep adapter protocol alternatives internal.

- [x] **Step 4: Add verification de-duplication**

Cache in-flight verification by `providerId:modelId`; a repeated click awaits the same promise. Keep the probe side-effect free and return Chinese failure categories for authentication, balance, timeout, protocol and tool incompatibility.

- [x] **Step 5: Run GREEN tests**

Run: `node tools/check-provider-agent-verification.js; node tools/check-canvas-agent-server.js`

Expected: both checks pass.

### Task 3: Standalone Agent model settings page

**Files:**
- Modify: `script.js`
- Modify: `styles.css`
- Modify: `tools/check-canvas-agent-ui.js`
- Modify: `tools/check-canvas-agent-browser.js`

**Interfaces:**
- Produces: settings tab `data-settings-tab="agent-models"` and panel `data-settings-panel="agent-models"`.
- Produces: actions `set-agent-primary`, `clear-agent-primary`, `verify-agent-candidate`, and `refresh-agent-candidates`.
- Consumes: sanitized candidate pool and `settingsState.agentRouting.primaryCandidateId`.

- [x] **Step 1: Write failing static UI checks**

Require an independent Agent model tab, primary card, numbered backup list, pending section, no routing mode buttons, and candidate verification handled before generic provider selection:

```js
assert.match(source, /data-settings-tab="agent-models"/);
assert.match(source, /主模型/);
assert.match(source, /备用顺序/);
assert.doesNotMatch(renderAgentSource, /速度优先|均衡推荐|稳定优先/);
assert.ok(source.indexOf('closest("[data-agent-candidate-verify]")') < source.indexOf('closest("[data-provider-id]")'));
```

- [x] **Step 2: Run RED static check**

Run: `node tools/check-canvas-agent-ui.js`

Expected: FAIL because Agent routing is embedded in the API page and the generic provider handler intercepts verification clicks.

- [x] **Step 3: Implement the independent page**

Add the sidebar tab/panel and render a restrained reliability dashboard: current primary, automatic fallback message, numbered ready candidates, and a collapsed pending area. Remove `renderAgentRoutingSettings()` from the API provider detail. Keep primary selection in the existing Save Settings workflow.

- [x] **Step 4: Implement immediate verification feedback**

Handle candidate actions before `[data-provider-id]`. On click synchronously render `连接接口…`, then `验证文本与工具调用…`, disable duplicate clicks, and finally show success or the categorized error inline on the same row.

- [x] **Step 5: Write and run browser interaction check**

Intercept `POST /api/settings/providers/agent-verify`, click a pending candidate, assert exactly one request is sent and visible progress appears before the mocked response resolves; then assert the row changes to verified.

Run: `node tools/check-canvas-agent-browser.js`

Expected: PASS.

### Task 4: Primary selection and uninterrupted automatic failover

**Files:**
- Modify: `server.js`
- Modify: `canvas-agent-router.js`
- Modify: `tools/check-canvas-agent-failover.js`
- Modify: `tools/check-canvas-agent-failover-endpoint.js`
- Modify: `tools/check-canvas-agent-conversation-endpoint.js`

**Interfaces:**
- Consumes: `settings.agentRouting.primaryCandidateId`.
- Produces: ordered per-request candidates where a healthy primary is first and backups follow reliability order.
- Preserves: `session.transcript`, `session.completedToolOutputIds`, `boardId`, `runId`, and MCP broker idempotency.

- [x] **Step 1: Write failing failover tests**

Create three verified candidates, select the second as primary, make it return a recoverable timeout, and assert the third receives the same board/run transcript without re-executing completed tool outputs. Assert non-stream and stream endpoints use the same candidate pool.

- [x] **Step 2: Run RED failover tests**

Run: `node tools/check-canvas-agent-failover.js; node tools/check-canvas-agent-failover-endpoint.js; node tools/check-canvas-agent-conversation-endpoint.js`

Expected: FAIL because non-stream requests still use only the legacy environment candidate and primary selection is model-mode based.

- [x] **Step 3: Implement unified failover path**

Use `getCanvasAgentCandidates(scopedPayload)` for stream and non-stream turns. Order the healthy selected primary first; after a recoverable error preserve the controlled transcript and try the next ranked route. Keep task/tool/user-cancel errors non-failover and preserve `run_id + call_id` idempotency.

- [x] **Step 4: Run GREEN failover tests**

Run: `node tools/check-canvas-agent-failover.js; node tools/check-canvas-agent-failover-endpoint.js; node tools/check-canvas-agent-conversation-endpoint.js`

Expected: all checks pass.

### Task 5: Performance, migration, documentation and full verification

**Files:**
- Modify: `tools/check-canvas-agent-performance.js`
- Modify: `docs/superpowers/specs/2026-08-21-agent-model-ranking-design.md`
- Modify: `docs/superpowers/plans/2026-08-21-agent-model-ranking-implementation.md`
- Verify: `build-portable.bat`

**Interfaces:**
- Consumes: final settings UI, candidate endpoint, router and verification behavior.
- Produces: completed design/plan status and fresh verification evidence.

- [x] **Step 1: Add performance and migration assertions**

Require remote discovery only while the Agent model page is visible or explicitly refreshed, asynchronous candidate rendering, batched route-health persistence, and migration of legacy routing settings without exposing obsolete controls.

- [x] **Step 2: Run targeted checks**

Run: `node tools/check-canvas-agent-performance.js; node tools/check-canvas-agent-ui.js; node tools/check-canvas-agent-server.js`

Expected: all checks pass.

- [x] **Step 3: Run the complete regression suite**

Run: `npm run check`

Expected: exit code 0 and every listed check prints `passed`.

- [x] **Step 4: Run live browser and portable checks**

Run: `node tools/check-canvas-agent-browser.js; node tools/check-portable-package.js .`

Expected: browser interaction passes and portable package reports all required paths.

- [x] **Step 5: Update implementation status**

Mark the design and plan complete only after the commands above pass and record the actual verification commands. Do not commit or stage the shared dirty worktree.
