# Agent Route Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the verified primary Agent route and ordered backup routes across restarts, fail over in that saved order, and allow safe reconfiguration after moving the application to another computer.

**Architecture:** Extend `agentRouting` with an ordered list of stable candidate selection IDs. The router treats this saved order as configuration and health/circuit state as temporary runtime filtering. The settings UI snapshots current verified candidates on save, while the server reconciles stale IDs against currently executable providers without storing API keys in the route configuration.

**Tech Stack:** Node.js CommonJS, browser JavaScript, existing JSON settings store, existing Node assertion checks and Playwright browser check.

## Global Constraints

- Do not store API keys in `agentRouting`; retain only stable candidate selection IDs.
- Do not bind routes to a machine, install directory, or canvas.
- Preserve current canvas rendering performance; no synchronous network calls or route-history writes on canvas interactions.
- Do not commit or stage files because the shared worktree contains unrelated user changes.

---

### Task 1: Stable routing schema and ordering

**Files:**
- Modify: `canvas-agent-router.js`
- Test: `tools/check-canvas-agent-router.js`

**Interfaces:**
- Consumes: candidate `selectionId`, route health, `agentRouting.primaryCandidateId`.
- Produces: `normalizeAgentRouting(value) -> { primaryCandidateId, candidateOrder }` and deterministic `rankAgentCandidates(...)` ordering.

- [x] Add assertions that routing normalization trims, deduplicates and bounds `candidateOrder`.
- [x] Add an assertion that saved candidate order wins over changed health scores, while a circuit-open candidate is temporarily skipped.
- [x] Run `node tools/check-canvas-agent-router.js` and confirm the new assertions fail because `candidateOrder` is not supported.
- [x] Implement normalized persistent ordering and use it ahead of dynamic health scores for listed candidates.
- [x] Re-run `node tools/check-canvas-agent-router.js` and confirm it passes.

### Task 2: Server persistence and stale-route reconciliation

**Files:**
- Modify: `server.js`
- Test: `tools/check-canvas-agent-server.js`

**Interfaces:**
- Consumes: normalized `settings.agentRouting`, current executable candidates.
- Produces: candidate pool fields `routing`, `configuredOrder`, and `needsReconfiguration` without exposing keys.

- [x] Add source assertions for persisted candidate ordering and stale-route detection.
- [x] Run `node tools/check-canvas-agent-server.js` and confirm they fail before implementation.
- [x] Reconcile saved IDs with current executable routes, keep configured order stable, append newly verified routes, and report whether the saved primary is unavailable.
- [x] Ensure runtime candidate selection uses the same persisted order and only temporarily filters circuit-open routes.
- [x] Re-run the server check and router check.

### Task 3: Settings save and migration UX

**Files:**
- Modify: `script.js`
- Modify: `tools/check-canvas-agent-ui.js`
- Modify: `tools/check-canvas-agent-browser.js`

**Interfaces:**
- Consumes: candidate pool and current settings draft.
- Produces: a saved `agentRouting.candidateOrder` snapshot and a clear reconfiguration state when saved candidates do not match local API credentials.

- [x] Add UI assertions that saving snapshots ready candidates while preserving an existing order and appending new verified candidates.
- [x] Add browser assertions that a saved primary and backup order are sent unchanged on ordinary save.
- [x] Run the focused UI/browser tests and confirm failure before implementation.
- [x] Implement a small pure draft-normalization helper and call it before PUT `/api/settings`.
- [x] Update copy to say the saved backup order remains fixed and a missing saved route needs local API reconfiguration.
- [x] Re-run focused UI and browser checks.

### Task 4: Full verification

**Files:**
- Verify only; no new production files.

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: fresh evidence that static checks, routing, failover, settings UX, and browser interactions remain valid.

- [x] Run `node tools/check-canvas-agent-router.js`.
- [x] Run `node tools/check-canvas-agent-server.js`.
- [x] Run `node tools/check-canvas-agent-failover.js` and `node tools/check-canvas-agent-failover-endpoint.js`.
- [x] Run `node tools/check-canvas-agent-ui.js` and the Playwright browser check against the local preview.
- [x] Run `npm run check` and inspect the complete exit status.
- [x] Review the final diff for API-key leakage, unrelated edits, and accidental machine-specific paths.
