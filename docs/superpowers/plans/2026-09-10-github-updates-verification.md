# Portable updater verification — 2026-09-10

Implemented the approved public GitHub Releases source `Qlh430/SuperQAI`. Source development stays in this repository. Settings → System Information exposes check, download/progress, version notes and restart. Ordinary updates keep the root `data` directory; legacy import is a one-time onboarding operation.

## Verified

- `npm run check:desktop-updates`: version and manifest validation, hash/size failures, offline/unpublished handling, streaming progress, real ZIP extraction and path rejection, unchanged data/pointer before restart, persisted download readiness, restart retry, transaction success/rollback/disk failure, interrupted phase replay, confirmed-cleanup failure, IPC frame/URL confinement, child exit waiting, settings interactions and public release metadata.
- `node tools/check-update-recovery-processes.js`: real Windows fixture processes in Chinese paths; missing candidate PID journal, process discovery by executable path, stopping writers, failed-data preservation, snapshot restore, previous runtime restart and confirmed transaction recovery.
- `node tools/check-electron-updates.js <package> --source-overlay`: real Electron UI and complete runtime ZIPs, with only GitHub network responses replaced by local test fixtures. 1.0.0 → 1.0.1 succeeded. 1.0.1 → deliberately broken 1.0.2 automatically rolled back. Existing account logged in after both, original data bytes survived and the failed migration output was retained separately. Test results: `artifacts/electron-updates/results.json`; screenshot: `artifacts/electron-updates/settings-ready.png`.
- `npm run check:portable-electron`: runtime path checks, all 13 legacy migration cases, native dependency checks, root launcher compilation/arguments/path safety and clean packaging.
- `npm run check:system-settings`: existing appearance/settings checks plus update interaction coverage.
- `node tools/check-electron-portable-browser.js dist/AI-OS-Portable-1.0.0-win-x64`: final package root EXE, Chinese/space paths, bundled Node, actual first-run legacy import, login, media, custom workflows, all 12 canvas node types and dense canvas interactions. Hardware acceleration remained enabled.
- Final package inspection found empty `data`, production runtime only, source-matching desktop/server/settings files, and matching runtime ZIP SHA-256 and byte count. JavaScript syntax and scoped whitespace checks passed.

## Fixes found during verification

- Shutdown uses parent/child IPC and waits for server exit before installing; a timed-out shutdown serializes recovery before another restart attempt.
- Recovery discovers candidate processes by canonical executable path, even if the helper died before writing its PID journal.
- A confirmed update never starts older code against migrated data when journal cleanup fails.
- Node 24.13.0 native `rmSync` reproduced a silent failure for Chinese paths on this host. Updater cleanup now traverses checked paths and uses `unlinkSync`/`rmdirSync`; regression coverage includes Chinese transaction and partial-download paths.
- Public release construction rejects rollback snapshots, update caches and extra runtime versions even if the supplied package's `data` is empty.

## Deliverables and boundaries

- Launch folder: `dist/AI-OS-Portable-1.0.0-win-x64`.
- Release assets: `dist/release/1.0.0/AI-OS-Portable-1.0.0-win-x64.zip`, `AI-OS-Runtime-1.0.0-win-x64.zip`, `ai-os-update.json`.
- These are initial version 1.0.0 assets. Later published versions must have a greater package version and matching GitHub tag/manifest.
- The live GitHub download was not exercised: the integration test simulates release responses while using the real desktop, streaming download, extraction, restart and rollback code. No GitHub release was published, no source commit/push was made, and actual user business data was not migrated or modified by this task.
