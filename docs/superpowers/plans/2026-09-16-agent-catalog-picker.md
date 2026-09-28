# Agent Catalog and Canvas Picker

Continue inline under the user's instruction to implement directly. No commits or paid requests.

Design: retain the existing settings and canvas layout. Coverage is a configuration check, not upstream verification. Show searchable, role-filtered pages of 30 models. The canvas picker lists only saved, enabled chat+tool candidates from the actual resolver, with automatic selection first. Explicit selections pin provider+model, as the executor already requires. Keep each run's selection immutable and retain it for recovery. No background discovery or paid probes.

Alternative: a global settings-only picker adds navigation and does not expose the current canvas selection. A separate routing system duplicates the existing resolver. Neither is needed.

- [x] Add failing browser tests for >8 coverage results, search, filtering and pagination.
- [x] Implement coverage browsing and change definitive readiness copy to configuration readiness.
- [x] Add failing endpoint/browser tests for the sanitized candidate catalog and selected request fields.
- [x] Extend skills response with safe candidate fields; add picker and immutable run selection.
- [x] Verify automatic mode, explicit selection, recovery, empty/deleted selections, mobile layout, and existing provider regressions.
- [x] Explain DX legacy status based on inspected local implementation; record limitations honestly.

## Verification — 2026-09-16

Passed:
- `node tools/check-api-settings-browser.js`: 75 models across 30/30/15 pages, search including final-page model, media filter, no matches.
- `node tools/check-canvas-agent-endpoint.js`: sanitized saved candidate catalog.
- `node tools/check-lan-canvas-access.js --browser --agent-picker`: same-named models across platforms, explicit request identity, automatic request without pinned identity, selection retained on panel reopen/board return, 503 recovery retains identity, refresh cannot unlock the recovering run, unavailable selections preserved, narrow layout, existing LAN regressions.
- `node tools/check-canvas-agent-ui.js`
- `node tools/check-canvas-agent-core.js`
- `node tools/check-canvas-agent-failover-endpoint.js`
- `npm run check:providers`
- Syntax checks for `canvas-agent-ui.js`, `system-settings-ui.js`, `provider-agent-coverage.js`, and `server.js`.

Desktop and mobile screenshots reviewed in `artifacts/agent-picker`.
Regression tests first reproduced misleading automatic-mode copy and unlocked selection during recovery; both now pass.

## Findings and limits

DX OS unpacked `server/protocolCoverage.ts` marks an operation Agent-ready only when execution is available and its mode is `declarative` or `native`; otherwise it reports execution reasons or “当前仅支持 legacy 执行”. This describes the execution adapter, not the model age or a live model test.

The picker uses saved/enabled chat+tool candidates, not every fetched catalog entry. Automatic routing uses the existing resolver/fallback policy; a manually selected platform/model stays pinned. Per-board selections live in the current page session, not persistent storage. Image models remain tools rather than Agent main models.

No paid upstream requests were made. Configuration coverage and inferred capability flags are not proof of actual upstream support. Backend changes require a service restart; the running user service was not restarted.
