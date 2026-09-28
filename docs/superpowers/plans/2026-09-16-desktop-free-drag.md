# Desktop Free Dragging Implementation Plan

> Execute inline in the existing user workspace. Preserve unrelated changes; no commits or branch operations.

**Goal:** Remove side/bottom app-window dragging boundaries while retaining the top boundary and keeping inaccessible windows recoverable.

**Architecture:** Separate coordinate normalization from explicit titlebar recovery in the window manager. Dock/launch request recovery; ordinary pointer focus and movement do not.

**Tech Stack:** Existing JavaScript window manager and shell, Node assertions, isolated Chrome/Playwright harness.

## Global constraints

- No drag-time x or maximum-y clamping; minimum y is 0 (below the menu bar).
- Keep Dock/menu stacking, resize size limits, maximization, and mobile layout.
- No real accounts, provider settings, or paid API requests in tests.

## Tasks

- [x] Reproduce the drag restriction with a failing manager test, then retain finite unbounded coordinates.
- [x] Expand `tools/check-desktop-window-manager.js` for right/top, layout persistence, maximize restore, and explicit offscreen recovery; run `node tools/check-desktop-window-manager.js` red/green.
- [x] Add `isReachable(id)` and opt-in `focus(id, { reveal: true })` to `desktop-window-manager.js`. Recovery centers unreachable titlebars, keeps sizes, and runs on explicit open.
- [x] Update `desktop-shell.js`: Dock recovers inaccessible active windows in one click; background/minimized windows are focused with reveal; ordinary window clicks preserve position.
- [x] Add `tools/check-desktop-window-drag-browser.js` and a `--window-drag` hook in the existing isolated LAN harness.
- [x] Bump the two changed script cache versions in `index.html`.
- [x] Verify syntax, manager/runtime/shell/display/scale/portable checks and `node tools/check-lan-canvas-access.js --browser --window-drag`.
- [x] Review only these scoped changes and record verification results.

## Verification results — 2026-09-16

- Manager regression first failed on clamped x/y; explicit recovery regression first failed on an offscreen window remaining offscreen. Both passed after their respective changes.
- Browser regression first failed because clicking the active, unreachable Dock app minimized it. Passed after the Dock reachability guard and explicit reveal.
- `node tools/check-desktop-window-manager.js`, `node tools/check-desktop-app-runtime.js`, `node tools/check-ai-os-shell.js`, `node tools/check-ai-os-display.js`, `node tools/check-ai-os-scale-interactions.js`, and `node tools/check-portable-runtime-manifest.js`: passed.
- Syntax checks for both changed runtime scripts and both browser harness scripts: passed.
- `node tools/check-lan-canvas-access.js --browser --window-drag`: passed, including 100%/150% real pointer movement, all four offscreen edges, no release snapping, Dock overlap hit testing and one-click recovery, maximize/restore, saved negative x after reload, and existing isolated LAN canvas regressions.
- Read-only review found no blocking issue. Its suggestion to explicitly test Dock overlap hit ordering was added and passed.
- Screenshot: `artifacts/desktop-free-drag/below-dock.png`.
- Scope remains dragging only; resizing limits and Dock/menu stacking are unchanged.

## Follow-up: retain top boundary

User explicitly requested the top boundary after the initial free-drag implementation.

- [x] Update manager and browser tests to expect y >= 0 while preserving negative/overflow x and bottom overflow; verify both fail with the old behavior.
- [x] Apply `Math.max(0, finite(bounds.y, 0))` in shared bounds normalization, covering movement, saved layouts, resize bounds, and maximize restore.
- [x] Bump window-manager cache version and amend the current design.
- [x] Rerun manager, shell, display/scale checks and isolated browser tests at 100%/150%; check old negative-y saved layouts as well.

Follow-up verification passed: manager, shell, runtime, display, scale-interaction and syntax checks; isolated Chrome tests at 100%/150% stop the window exactly below the menu, allow dragging down again, retain free side/bottom movement, and preserve Dock recovery and reload behavior. Manager tests also verify old negative-y normal and maximized restore layouts normalize to y=0 without changing x.
