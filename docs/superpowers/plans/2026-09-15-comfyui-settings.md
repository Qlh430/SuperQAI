# ComfyUI Settings Implementation Plan

> **For agentic workers:** Use executing-plans inline for this existing dirty workspace. Follow TDD; preserve unrelated changes and do not commit the user's accumulated work.

**Goal:** Separate ComfyUI connection settings from API settings and safely manage a same-host instance.

**Architecture:** A server-side service owns settings and one child handle. An authenticated HTTP controller exposes that service. A small UMD UI module plugs into system settings; legacy providers retain identities and workflow models.

**Tech Stack:** Node.js built-ins, existing SQLite wrapper, plain JS/CSS, existing Playwright harness.

## Global Constraints

- Date: 2026-09-15.
- “本机” means the AI OS server, not the browser.
- No remote-agent installation, firewall changes, package installation, arbitrary shell commands, or real generation requests.
- Use the existing writable checkout and preserve all unrelated work.
- Default listen host 127.0.0.1 and port 8188; remote mode requires only a URL.

## Task 1: Runtime and configuration

Files: `comfyui-service.js`, `tools/check-comfyui-service.js`.

Interface: `createComfyService({settings, getConnections, updateConnection, defaultUrl, spawnImpl, fetchImpl})` returns `configuration()`, `save(input)`, `detect(input)`, `test(input)`, `status()`, `start()`, `stop()`, `close()`, `resolveUrl()`.

- [x] Write checks using a temporary system database and fixture files, starting with:
  ```js
  assert.equal(typeof serviceModule.createComfyService, "function");
  assert.equal(service.configuration().config.baseUrl, "http://192.168.1.53:8188");
  assert.equal(service.configuration().config.mode, "remote");
  ```
- [x] Run `node tools/check-comfyui-service.js`, observe the missing implementation assertion.
- [x] Implement validated remote/local settings; auto-detect main and Python; direct, timed, bounded probes; serialized start/stop with ownership and readiness; keep configuration storage separate from process state.
- [x] Re-run tests covering malicious paths, bad URL/port, legacy connections, failed probes, occupied port, process errors, concurrent requests, output bounds and cleanup.

## Task 2: Authenticated integration

Files: `comfyui-http-api.js`, `server.js`, `tools/check-comfyui-http-api.js`.

Interface: `createComfyHttpApi({service, requireAdmin, readJson, sendJson, appendAudit}).handle(req,res)` handles `/api/comfyui/settings`, `/detect`, `/test`, `/status`, `/start`, `/stop`.

- [x] Write route checks: unauthenticated 401, user 403, cross-origin 403, non-JSON write 415, GET config, PUT saved config, POST probe/start/stop. Assert workflow normalization uses the saved default.
- [x] Run `node tools/check-comfyui-http-api.js`, observe failure.
- [x] Integrate service after provider migration, preserve raw provider records on address synchronization, resolve default URLs in all ComfyUI workflow paths, close only owned process on server shutdown.
- [x] Run the route test and `node --check server.js`.

## Task 3: Standalone settings UI

Files: `comfyui-settings-ui.js`, `comfyui-settings.css`, `system-settings-ui.js`, `index.html`, `tools/check-comfyui-settings-browser.js`, affected existing settings harnesses.

Interface: `AiOsComfySettings.create({root,request,render})` exposes `markup()`, `load()`, `leave()`, `action()`, `read()`, `input()`, `change()`, `save()`, `destroy()`. The parent delegates events, and the module owns polling. Data is lazy-loaded only when entering ComfyUI settings.

- [x] Write browser assertions:
  ```js
  await page.locator('[data-settings-nav="comfyui"]').click();
  assert.equal(await page.locator('[data-comfy-form] input[name="baseUrl"]').count(), 1);
  assert.equal(await page.locator('[data-comfy-form] input[name="apiKey"]').count(), 0);
  ```
- [x] Run `node tools/check-comfyui-settings-browser.js`, observe missing entry failure.
- [x] Add independent entry, remote/local panels, saved-connection selector when needed, status and owned-process buttons, accessible errors, polling without replacing edits, stale-response protection. Filter ComfyUI only in API-page presentation; preserve full provider ordering.
- [x] Check save/test/detect/start/stop interactions, no implicit start, no lost input on status polling, errors, escaping, dark/light and narrow layouts; inspect screenshots.

## Task 4: Regression and handoff

- [x] Run `node tools/check-system-settings-ui.js`, `node tools/check-api-settings-browser.js`, `node tools/check-model-test-browser.js`, `node tools/check-portable-runtime-manifest.js`, `node tools/check-minimax-h3-video.js`.
- [x] Add `check:comfyui` command and concise usage notes in README.
- [x] Review scoped diff, ensure no real configuration changed; report verified checks and remote-start limitation. Do not claim a real ComfyUI launch was tested.

## Verification record — 2026-09-15

- `npm run check:comfyui` passed: syntax, configuration, paths, ownership, direct bounded probes, readiness recovery, real isolated HTTP server with authentication/CSRF/oversize input/atomic save rollback, existing model preservation, browser interactions and light/dark/narrow layouts.
- `node tools/check-comfyui-workflow-default.js` passed with the real H3 route handler, media bridge and capability resolver; only the generation boundary is replaced. Saved default and explicit provider selection both checked.
- `node tools/check-comfyui-process.js` passed outside the sandbox: real temporary Python HTTP fixture, helper child, start/readiness/stop/restart/shutdown, Windows tree cleanup, unrelated Python preserved. Requires installed Python and process termination permissions. This is not a real ComfyUI/GPU/workflow test.
- Related checks passed: system settings UI, API settings browser, model-test browser, MiniMax H3 workflow, portable manifest, provider HTTP API, protocol registry/engine, capability resolver/executor. The actual portable manifest includes all four new runtime files.
- Screenshots inspected: `artifacts/comfyui/remote-light.png`, `local-light.png`, `local-dark.png`, `mobile-dark.png`.
- Broader legacy `check-provider-browser-smoke.js` is not green: its protocol-switch expectation times out, and later assertions still expect the pre-dialog model-test UI. Earlier provider-suite `incompatible_protocols` failure is outside this feature. Do not describe the full historical suite as passing.
- No real user configuration was changed; no actual ComfyUI was started or generation submitted. No remote startup agent installed, firewall altered, dependency installed, commit created, or unrelated process terminated.
- Final bounded read-only review closed all three Important findings (default H3 connection, readiness recovery, inactive local fields). No new Important/Critical blockers in the reviewed feature scope.
