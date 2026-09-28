# Model Test Workbench Implementation Plan

> Execute the user-approved design in this working directory. Use test-driven development and task-scoped review. Preserve the dirty worktree; no commits, packaging, live-service restarts, or paid requests.

**Goal:** Users can send chat/image tests and inspect actual output without writing JSON.

**Architecture:** Dedicated UMD test-dialog and model-parameter controls integrated into settings; test HTTP replies use compact normalized presentation fields with safe media handling.

**Tech Stack:** Existing Vanilla JS, Node.js, CSS, local headless Playwright.

## Global Constraints

- No live paid calls or credential/configuration mutation during validation.
- Do not infer successful generation from a task ID.
- Preserve existing model IDs, unknown parameter overrides, and unsaved provider edits.
- No automatic retries or provider fallback in a test.
- Reuse settings colors/fonts and support dark theme, keyboard focus and narrow screens.

## Task 1: Parameter controls

- [ ] Create `model-parameter-controls.js` and `tools/check-model-parameter-controls.js`.
- [ ] API: UMD `AiOsModelParameters` exports `fieldsForModel(model)`, `markup(model)`, `read(row, model)`, `validate(row, model)`.
- [ ] Inputs use `data-model-param`, `data-param-original`; read preserves untouched and unsupported values/keys, changed empty removes only that key.
- [ ] RED: tests demand no JSON textarea, protocol-specific fields, preservation, explicit clearing, invalid numbers rejected.
- [ ] GREEN: implement the module; run `node tools/check-model-parameter-controls.js`.

## Task 2: Safe useful test responses

- [ ] Add tests to `tools/check-provider-http-api.js` for `test` presentation fields (status, text/images, taskId, elapsedMs), untruncated reply and base64 image, pending task, unsafe media.
- [ ] RED run `node --disable-warning=ExperimentalWarning tools/check-provider-http-api.js`.
- [ ] Implement result presentation in `provider-test-result.js`; retain legacy sanitized result for compatibility. No task polling guesses: existing adapters poll supported jobs, task-only response clearly remains pending.
- [ ] GREEN focused API and new result tests.

## Task 3: Test dialog and settings integration

- [ ] Create `model-test-ui.js`: `createModelTestDialog({ root, request, onResult })` returns `open({provider,model}), close(), destroy()`.
- [ ] Add browser tests before implementation: opening sends nothing; submit sends entered prompt; chat context includes completed replies; image preview and pending state; safe output; errors; duplicate blocking; stale/closed replies; focus restore and Esc.
- [ ] Replace row quick test with modal open. Integrate parameter module and remove JSON parsing from settings.
- [ ] Add scripts to `index.html`, update existing browser fixtures and module-loading lists.
- [ ] Style dialog in `system-settings.css`, preview toggle, one primary action, mobile/dark theme.
- [ ] GREEN run dialog/browser/API/settings/protocol/portable manifest regression tests; inspect screenshots.

## Progress

- Initial focused settings and provider API tests passed before changes.
- DX OS active 0.3.2 bundled UI inspected: user prompt, separate chat/image branches, image plus latency in results.
