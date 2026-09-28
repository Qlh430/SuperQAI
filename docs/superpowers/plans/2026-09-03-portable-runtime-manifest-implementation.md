# Portable Runtime Manifest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically copy all portable runtime JavaScript and local dependencies so portable builds cannot omit newly added modules.

**Architecture:** Share dependency discovery through `tools/portable-package-manifest.js`. `tools/copy-portable-runtime.js` copies the manifest, `build-portable.bat` invokes it, and `tools/check-portable-package.js` verifies the same manifest.

**Tech Stack:** Node.js 24.13+, Windows batch, Node `fs`/`path`, existing ad-hoc Node checks.

## Global Constraints

- Portable runtime must require Node `>=24.13.0 <25`.
- Do not copy `.env` or machine-specific `data/outbound-route-state.json`.
- Keep `assets`, `workflows`, and `skills` directory copies.
- Keep the portable tools directory limited to `compact-canvas-data.js`.

### Task 1: Add failing manifest regression check

**Files:**
- Create: `tools/check-portable-runtime-manifest.js`

- [ ] **Step 1: Write the failing check**

Create a temporary fixture with `index.html`, `server.js`, a newly added root script, and a transitive dependency. Assert the shared manifest includes both files, that the copy helper copies them, and that `build-portable.bat` invokes the helper.

- [ ] **Step 2: Run it and confirm the expected failure**

Run `node tools/check-portable-runtime-manifest.js`. It must fail before implementation because `tools/portable-package-manifest.js` does not yet exist.

### Task 2: Implement shared manifest and copy helper

**Files:**
- Create: `tools/portable-package-manifest.js`
- Create: `tools/copy-portable-runtime.js`

- [ ] **Step 1: Implement manifest discovery**

Export `collectPortablePackageManifest(sourceRoot)` and include fixed package files, all root-level `.js` files, browser scripts from `index.html`, recursive local `require()` dependencies from `server.js`, and production dependency paths.

- [ ] **Step 2: Implement copying**

Export `copyPortableRuntimeFiles(sourceRoot, targetRoot)` and copy every manifest file or directory with parent-directory creation and fatal errors for missing sources.

- [ ] **Step 3: Run the regression check**

Run `node tools/check-portable-runtime-manifest.js`; it must pass.

### Task 3: Integrate builder and verifier

**Files:**
- Modify: `build-portable.bat`
- Modify: `tools/check-portable-package.js`
- Modify: `package.json`

- [ ] **Step 1: Replace the hand-maintained runtime list**

Invoke `tools/copy-portable-runtime.js` from the batch script and retain existing directory/data/tool handling.

- [ ] **Step 2: Use the shared manifest in verification**

Remove duplicated discovery logic and verify the target against `collectPortablePackageManifest`; assert the builder invokes the copy helper.

- [ ] **Step 3: Register the regression check**

Add `node tools/check-portable-runtime-manifest.js` to the normal check command.

- [ ] **Step 4: Run targeted checks**

Run `npm run check`, `node tools/check-portable-package.js dist/AI-Studio-Portable`, and `git diff --check`.

### Task 4: Verify the real portable build

**Files:**
- Modify: generated `dist/AI-Studio-Portable` and ZIP only as build artifacts.

- [ ] **Step 1: Run `build-portable.bat --no-pause`**

Expected: exit code 0, verifier passes, and `dist/AI-Studio-Portable.zip` is created.

- [ ] **Step 2: Confirm the previously missing file**

Verify `dist/AI-Studio-Portable/canvas-media-cleanup.js` exists and the verifier reports success.
