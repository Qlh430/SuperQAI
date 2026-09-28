# GitHub Releases portable updates

User approved Qlh430/SuperQAI public Releases. This supersedes the earlier portable plan's manual migration upgrade workflow. One-time legacy import remains available; ordinary updates reuse data in place.

- [x] Inspect DX OS: official release API, component hashes, new runtime staging, active/previous runtime pointers. No special GPU change in updater.
- [x] Add strict stable release metadata, bounded download with SHA-256, confined extraction and runtime validation. Test version comparison, corrupt downloads, unsafe archive paths and offline errors.
- [x] Add a detached update helper: await old service/desktop exit, snapshot business data, switch runtime pointer, start candidate, wait for readiness. On failure preserve failed data, restore snapshot and previous pointer. No user data in release packages.
- [x] Expose narrow IPC methods to the main local renderer. Settings: version, notes, check, progress, download and restart; browsers show desktop requirement. Never accept a download URL from the renderer.
- [x] Build versioned portable ZIP plus runtime ZIP and ai-os-update.json for public Releases. Keep source development layout. Document version bump and upload, one-time legacy import and regular in-place updates.
- [x] Run focused tests and actual isolated Electron update/rollback integration. Rebuild a clean release. No public publication without explicit instruction.

Completed 2026-09-10. Verification details: `docs/superpowers/plans/2026-09-10-github-updates-verification.md`. Release assets are in `dist/release/1.0.0`; package version remains 1.0.0 for the first updater-enabled release. No GitHub publication or business-data migration was performed.
