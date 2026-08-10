# MiniMax H3 Resolution and Steps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add all eight ComfyUI H3 aspect ratios, user-friendly resolution presets with a dynamic expected-size hint, and independent 4/8-step scheduler presets.

**Architecture:** `script.js` owns H3 canvas state, rendering, persistence, and request payloads. `minimax-h3-workflow.js` is the server-side trust boundary that normalizes aspect ratio, megapixels, and steps before writing them into the ComfyUI workflow. Existing focused Node assertions and the Playwright H3 UI check provide contract and browser coverage.

**Tech Stack:** Browser JavaScript, Node.js CommonJS, ComfyUI JSON workflow, Node assertions, Playwright.

## Global Constraints

- Keep `megapixels` restricted to exactly `0.6` or `1.0`; invalid values fall back to `0.6`.
- Keep `steps` restricted to exactly `4` or `8`; invalid or missing values fall back to `4`.
- Keep ComfyUI node `229.inputs.multiple = 32`.
- Preserve existing H3 reference filtering, duration, seed, upload, and output behavior.
- Existing saved H3 nodes without `minimaxH3Steps` must restore as 4 steps.

---

### Task 1: Server-side H3 parameter contract

**Files:**
- Modify: `tools/check-minimax-h3-video.js`
- Modify: `minimax-h3-workflow.js`

**Interfaces:**
- Consumes: raw API fields `aspect_ratio`, `megapixels`, and `steps`.
- Produces: normalized `{ aspectRatio, megapixels, steps }` and workflow mutations at nodes `219` and `229`.

- [x] **Step 1: Write failing assertions**

Add assertions that all eight aspect ratios normalize unchanged, `steps: 8` is retained, invalid steps become 4, and `prepareMinimaxH3Workflow` writes `request.steps` to `workflow["219"].inputs.steps`.

- [x] **Step 2: Verify the assertions fail**

Run `node tools/check-minimax-h3-video.js`. Expected: an assertion fails because `steps` is missing and the additional aspect ratios currently fall back to `16:9`.

- [x] **Step 3: Implement minimal normalization and workflow mutation**

Extend `ASPECT_RATIOS` with `2:3`, `3:2`, `3:4`, `4:3`, and `21:9`; normalize `steps` to 4 or 8; return it from `normalizeMinimaxH3Request`; write it to scheduler node 219 in `prepareMinimaxH3Workflow`.

- [x] **Step 4: Verify the focused contract passes**

Run `node tools/check-minimax-h3-video.js`. Expected: `MiniMax H3 canvas video checks passed`.

### Task 2: Canvas controls, dynamic size, and persistence

**Files:**
- Modify: `tools/check-minimax-h3-video.js`
- Modify: `tools/check-minimax-h3-ui.js`
- Modify: `script.js`
- Modify: `styles.css`

**Interfaces:**
- Consumes: H3 node options and datasets `minimaxH3AspectRatio`, `minimaxH3Megapixels`, and `minimaxH3Steps`.
- Produces: eight aspect choices, two resolution choices, two scheduler choices, `.canvas-h3-resolution-hint`, serialized `minimaxH3Steps`, and API payload field `steps`.

- [x] **Step 1: Write failing static and browser assertions**

Require all eight aspect values, the labels `快速 · 标准分辨率`, `高清 · 高分辨率`, `快速 · 4 步`, and `高质量 · 8 步`, the `minimaxH3Steps` persistence contract, and payload fields for megapixels and steps. In Playwright, create an H3 node with `3:2`, `1.0`, and `8`, restore it, assert the displayed hint is `预计输出：1248 × 832`, and assert the generation request contains the same three independent values.

- [x] **Step 2: Verify tests fail for the missing controls**

Run `node tools/check-minimax-h3-video.js` and, with the local app available, `node tools/check-minimax-h3-ui.js`. Expected: missing label/state/payload assertions fail.

- [x] **Step 3: Implement the canvas behavior**

Add an aspect-ratio tuple map and a calculation helper mirroring ComfyUI: `scale = sqrt(megapixels * 1024 * 1024 / (wRatio * hRatio))`, then round each dimension to the nearest multiple of 32. Render all aspect choices, renamed resolution choices, a scheduler select, and the expected-size hint. Refresh only the hint when aspect or resolution changes. Add `minimaxH3Steps` to render defaults, serialization, both restore/import paths, copy/paste options, and the H3 POST body.

- [x] **Step 4: Verify focused static and browser checks pass**

Run `node tools/check-minimax-h3-video.js` and `node tools/check-minimax-h3-ui.js`. Expected: both exit 0 and the browser check produces updated desktop/mobile screenshots without page errors.

### Task 3: Full verification

**Files:**
- Verify: `script.js`
- Verify: `minimax-h3-workflow.js`
- Verify: `server.js`

**Interfaces:**
- Consumes: completed changes from Tasks 1 and 2.
- Produces: fresh syntax, focused, and full-project verification evidence.

- [x] **Step 1: Run syntax checks**

Run `node --check minimax-h3-workflow.js`, `node --check script.js`, and `node --check server.js`. Expected: all exit 0 without output.

- [x] **Step 2: Run the full project check**

Run `npm run check`. Expected: exit 0 with every listed check passing.

- [x] **Step 3: Review the final diff**

Run `git diff --check` and inspect `git diff -- script.js styles.css minimax-h3-workflow.js tools/check-minimax-h3-video.js tools/check-minimax-h3-ui.js`. Expected: no whitespace errors and only the approved H3 behavior changes.
