# Canvas Video Output History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn every canvas video-output node into a persistent video gallery so repeated MiniMax H3 generations remain visible, selectable, downloadable, and removable.

**Architecture:** Keep the active video mirrored in the legacy `videoSrc`/media dataset fields so downstream nodes and old saved boards continue to work. Store the complete node-local history as serialized metadata, render one active player plus a side history panel, and centralize normalization/append/remove/fallback behavior in a small dependency-free rules module.

**Tech Stack:** Browser JavaScript, DOM/CSS, CommonJS-compatible pure JavaScript rules, Node.js assertions, existing Playwright smoke test.

## Global Constraints

- Each video-output node owns an independent history.
- Only the active video is exposed to downstream canvas connections.
- A failed or interrupted H3 task must not append a history entry or change the active video.
- Saved boards, copy/paste, undo/redo, and legacy single-video nodes must preserve or migrate history without storing video bytes.
- Deleting a history item removes only canvas metadata, not the server-side MP4 file.
- Do not add dependencies or change the H3 generation request contract.

---

### Task 1: Add tested video-history state rules

**Files:**
- Create: `video-history-rules.js`
- Create: `tools/check-canvas-video-history.js`
- Modify: `index.html`
- Modify: `package.json`

**Interfaces:**
- `normalizeVideoHistory(history, legacyVideo, createId)` returns valid, deduplicated entries in oldest-to-newest order.
- `resolveActiveVideo(history, preferredId)` returns the saved active item or newest fallback.
- `appendVideoHistory(history, entry, activeId, createId)` deduplicates by `src`, appends the result, and makes it active.
- `removeVideoHistory(history, videoId, activeId)` preserves the active item or falls back to the newest remaining item.

- [x] **Step 1: Write failing state-rule tests**

Cover legacy migration, malformed filtering, stable IDs, deduplication by source URL, active selection, active deletion fallback, non-active deletion, and empty history.

- [x] **Step 2: Verify the new test fails for the expected missing module**

Run: `node tools/check-canvas-video-history.js`

Expected: FAIL because `video-history-rules.js` does not exist.

- [x] **Step 3: Implement the minimal pure rules module**

Use a UMD wrapper so the same functions are available as `window.VideoHistoryRules` in the browser and through `require()` in tests.

- [x] **Step 4: Load and register the module**

Load it before `script.js` in `index.html`, add its syntax check and focused check to `npm run check`.

- [x] **Step 5: Verify focused tests pass**

Run: `node --check video-history-rules.js`

Run: `node tools/check-canvas-video-history.js`

Expected: PASS.

---

### Task 2: Integrate history with generation, persistence, and compatibility

**Files:**
- Modify: `tools/check-canvas-video-history.js`
- Modify: `script.js`

**Interfaces:**
- `getCanvasVideoHistory(node)` reads and normalizes the node-local history.
- `getCanvasVideoActiveItem(node)` resolves the active item and synchronizes the legacy current-video dataset fields.
- `appendCanvasVideoOutputHistory(node, video)` adds a successful result and makes it active.
- `setCanvasVideoActiveItem(node, videoId)` switches the active item and refreshes downstream consumers.
- `removeCanvasVideoHistoryItem(node, videoId)` removes one entry and applies newest fallback when needed.

- [x] **Step 1: Add failing integration-contract assertions**

Require successful H3 completion to call the append helper, serialization to persist `videoHistory` and `videoActiveId`, restoration to accept both new history and legacy single-video fields, and downstream output to continue using the active legacy fields.

- [x] **Step 2: Verify the assertions fail for the expected missing integration**

Run: `node tools/check-canvas-video-history.js`

Expected: FAIL because the append/persistence helpers are absent.

- [x] **Step 3: Implement canvas state adapters and legacy mirroring**

Normalize `dataset.videoHistory`, resolve `dataset.videoActiveId`, and mirror the active entry into `videoSrc`, `videoName`, `mediaName`, `mediaMimeType`, `mediaDuration`, `videoPromptSummary`, and `videoCreatedAt`.

- [x] **Step 4: Append only after H3 task success**

Replace the single-video overwrite in `runCanvasMinimaxH3Node` with `appendCanvasVideoOutputHistory`. Leave all failure paths untouched.

- [x] **Step 5: Persist, restore, copy, and undo the complete history**

Add history fields to `serializeCanvasNode`; pass them into `renderCanvasVideoOutputNode` during restore. Preserve the legacy fields for older application versions and migrate old saved nodes on read.

- [x] **Step 6: Verify focused integration tests pass**

Run: `node tools/check-canvas-video-history.js`

Expected: PASS.

---

### Task 3: Build the video gallery UI and interactions

**Files:**
- Modify: `tools/check-canvas-video-history.js`
- Modify: `script.js`
- Modify: `styles.css`

**Behavior:**
- Main stage plays the active video.
- A visible history control displays the item count.
- The panel lists newest first and marks the active item.
- Every item supports activate/play, download, and delete.
- Clicking outside or pressing Escape closes the panel.

- [x] **Step 1: Add failing DOM/CSS contract assertions**

Require the history toggle, panel, reversed ordering, active marker, download/delete actions, close behavior, scrollable panel, dark-theme-compatible surfaces, and raised z-index while open.

- [x] **Step 2: Verify UI assertions fail for the expected missing controls**

Run: `node tools/check-canvas-video-history.js`

Expected: FAIL because the video history DOM and styles do not exist.

- [x] **Step 3: Render the active player and history panel**

Refactor `renderCanvasVideoOutputNode` to build the persistent controls, then render the active stage and history from normalized state. Stop playback when switching items by replacing the player element.

- [x] **Step 4: Implement activation, download, delete, close, and refresh**

Activation and deletion must refresh connected nodes, schedule connection rendering, and save. Close competing gallery/video panels when opening one.

- [x] **Step 5: Add responsive themed styling**

Reuse the existing image-gallery visual language while giving video cards a 16:9 preview, readable metadata, bounded panel height, and touch-friendly actions.

- [x] **Step 6: Verify focused checks pass**

Run: `node tools/check-canvas-video-history.js`

Expected: PASS.

---

### Task 4: Browser and regression verification

**Files:**
- Modify: `tools/check-minimax-h3-ui.js` only if the current helper cannot exercise the new history UI.

- [x] **Step 1: Run syntax and focused checks**

Run: `node --check script.js`

Run: `node tools/check-canvas-video-history.js`

Run: `node tools/check-minimax-h3-video.js`

Expected: all PASS.

- [x] **Step 2: Run the full project check**

Run: `npm run check`

Expected: exit code 0.

- [x] **Step 3: Run browser interaction verification**

Use the existing local server and Playwright smoke test (or a focused equivalent) to create a video-output node with two history entries, open its panel, switch the active item, delete it, confirm newest fallback, and reload the saved board.

Expected: count, active player, history order, deletion fallback, and persisted reload are correct; no browser console errors.

- [x] **Step 4: Inspect the rendered node visually**

Capture a screenshot and confirm the player, count control, panel, active state, scrolling, action hit targets, and dark theme remain readable without covering the H3 controls.

- [x] **Step 5: Review the final diff**

Confirm only the planned files and the already-existing user changes are present; do not stage unrelated dirty-worktree files.
