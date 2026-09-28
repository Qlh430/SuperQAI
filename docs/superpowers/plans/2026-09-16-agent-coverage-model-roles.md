# Agent Coverage Model Roles Implementation Plan

> Execute inline in the existing user workspace. Preserve unrelated changes and do not create commits.

**Goal:** Correct Agent coverage so LLMs are evaluated as main models while image/video/audio models are shown as Agent tools instead of unsuitable models.

**Architecture:** Keep structural, zero-cost coverage separate from live paid verification. Derive newly discovered LLM capabilities from the selected model protocol, preserve explicit capabilities, and return role-aware coverage states for the settings UI.

**Tech Stack:** CommonJS Node.js, existing protocol registry and provider HTTP API, browser-native settings UI, Node assertions, Playwright.

## Global Constraints

- Do not call real or paid model APIs in tests.
- Preserve explicit user capability selections.
- Do not count media models in the Agent main-model denominator.
- Keep real availability and stability verification in the existing model-test and Agent-verification flows.

### Task 1: Reproduce capability and role misclassification

**Files:**
- Modify: `tools/check-provider-configuration-contract.js`
- Modify: `tools/check-provider-agent-coverage.js`
- Modify: `tools/check-provider-http-api.js`

- [x] Add assertions for OpenAI-compatible discovered LLM tool capability, explicit capability preservation, media-tool classification, and main-model-only totals.
- [x] Run the focused checks and confirm they fail for the current chat-only defaults and all-model denominator.

### Task 2: Correct discovery and coverage semantics

**Files:**
- Modify: `provider-model-rules.js`
- Modify: `provider-http-api.js`
- Modify: `provider-agent-coverage.js`

- [x] Preserve discovered model objects when invoking inference.
- [x] Give unannotated LLMs candidate chat/vision/tool capabilities and let the protocol registry filter unsupported capabilities.
- [x] Classify media models separately and return role-aware summary counts and reasons.
- [x] Run focused unit and HTTP checks until green.

### Task 3: Present accurate labels in API settings

**Files:**
- Modify: `system-settings-ui.js`
- Modify: `system-settings.css`
- Modify: `tools/check-api-settings-browser.js`
- Modify: `index.html`

- [x] Add browser assertions for Agent-main-model totals, media-tool labels, and no misleading “不适用/缺少工具能力” text.
- [x] Update summary and row labels, add media state styling, and bump affected cache versions.
- [x] Run the isolated browser check and static settings checks.

### Task 4: Regression verification

**Files:**
- Modify: this plan with verification results only.

- [x] Run provider, Agent routing, settings static, syntax, and isolated browser checks.
- [x] Confirm no real accounts, keys, or paid APIs were used.

## Verification results — 2026-09-16

- Red tests first reproduced all three faults: `gpt-5.6-terra` inferred as chat-only, media models counted as unavailable main models, and the UI rendering the old “不适用/缺少工具能力” copy.
- `npm run check:providers`: passed, including store, migration, protocol registry/engine, resolver, executor, Agent coverage, HTTP API, Agent bridge, media bridge, settings and cutover checks.
- `node tools/check-api-settings-browser.js`: passed in isolated headless Chrome with mocked provider endpoints; no external or paid model request was made.
- Syntax checks passed for `provider-agent-coverage.js`, `provider-model-rules.js`, `provider-http-api.js`, and `system-settings-ui.js`.
- The real protocol-registry regression reports `gpt-5.6-terra` as `1/1` ready Agent main model and `gpt-image-2` plus `midjourney` as two Agent media tools.
