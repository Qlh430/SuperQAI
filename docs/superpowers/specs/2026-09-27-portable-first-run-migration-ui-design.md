# Portable First-Run Migration UI Design

## Problem

The `1.0.1` portable first-run flow uses a native confirmation dialog and runs migration directly. If migration fails, the error escapes `preparePortableData`, reaches the general startup error handler, and AI OS eventually opens from the empty target data directory. Users therefore see an empty system instead of a recoverable migration failure.

The current flow also provides no source preview, no precise wrong-directory guidance, and no clear error state with retry or fresh-start actions.

## Goals

- Present a branded first-run setup window with two explicit choices: migrate old data or start fresh.
- Inspect a selected old project before migration and show a safe summary of what will be imported.
- Keep the setup window open on validation or migration failure.
- Explain common failures in Chinese and offer retry or fresh-start actions.
- Never start the workbench from an empty target after a failed migration.
- Preserve the existing read-only migration engine, integrity checks, rollback behavior, and migration reports.

## Non-Goals

- Automatically scanning drives for possible old projects.
- Merging migrated data into an installation that already contains business data.
- Changing the migration mapping or database format.
- Migrating secrets or logs into the setup window.

## Architecture

### Setup window

Create a dedicated Electron setup window loaded from `desktop/portable-setup.html` with an isolated preload bridge. The window owns three visible states:

1. **Welcome**: describes the two choices and starts the selected action.
2. **Migration**: shows the selected source summary, progress, copied files, and bytes.
3. **Result**: shows success, or a Chinese failure explanation with retry and fresh-start actions.

### Setup controller

Refactor `desktop/portable-setup.js` into a controller that coordinates the window, source picker, inspection, child migration process, and state updates. It returns one of:

- `{ action: "fresh" }`
- `{ action: "migrated", report }`
- `{ action: "quit" }`

`desktop/main.js` proceeds only for `fresh` or `migrated`. A failure remains inside the controller until the user retries, chooses fresh, or quits.

### Source preflight

Before enabling migration, call `inspectLegacyProject(sourceRoot)` in the host process. This read-only inspection returns:

- source kind: old project or portable package
- file count and total bytes
- database count
- whether `.env`, `output`, and `workflows` were found

Invalid sources stay on the welcome state with a specific message. The UI must never include environment values, API keys, database contents, or file names from private data.

### Migration process

Reuse `desktop/migrate-data-cli.js` and `desktop/portable-migration.js` without changing their copy, hash, SQLite recovery, provider-key, locking, or rollback semantics. Parse JSON progress lines from stdout and send sanitized state updates to the renderer.

On success, show the report summary and require an explicit "Open AI OS" action before startup continues. On failure, show a translated message based on the migration error code while keeping full diagnostics in `data/.logs`.

## Error Handling

Map common migration codes to actionable Chinese messages:

- `invalid_source`: choose the parent folder containing `data`, not `data` itself.
- `source_changed`: fully exit the old service and retry.
- `unsupported_source_layout`: the old `.env` points at nonstandard storage paths.
- `invalid_database`: repair or restore the old SQLite database and WAL together.
- `missing_provider_key` / `invalid_provider_key`: restore the matching `data/security/provider-master.key`.
- `target_not_empty`: use a newly extracted portable folder.
- `migration_busy`: another migration is active or an interrupted lock remains.

Unknown errors use a generic message plus the error code. Raw technical details remain in the migration report instead of being interpolated into the setup UI.

## Main Process Integration

`desktop/main.js` calls the setup controller after creating the startup window and before seeding workflows or starting the server. The general startup error page remains responsible only for service and runtime failures, not migration failures.

Command-line migration (`--import-from`) uses the same controller. Hidden update/test launches may run without showing the window, but still return failure instead of continuing into an empty installation.

## Accessibility and Visual Requirements

- Two primary choices must be recognizable without relying on color alone.
- Buttons must have visible focus states and remain keyboard accessible.
- Minimum target size is 44px.
- Progress text must not overlap controls at 520px width or larger.
- The success action must be the only way to continue after migration.
- Closing the setup window is treated as quit.

## Verification

- Add a regression check for controller state transitions with an injected fake window and migration runner.
- Verify failed migration never resolves as `fresh` or `migrated`.
- Verify inspection summaries are rendered without secret or file-name leakage.
- Verify retry can run after a failed attempt and fresh start remains available.
- Verify `--import-from` and hidden mode preserve automated migration behavior.
- Run `npm run check:portable-electron`, the portable migration checks, syntax checks, and an isolated Electron first-run UI smoke test.
