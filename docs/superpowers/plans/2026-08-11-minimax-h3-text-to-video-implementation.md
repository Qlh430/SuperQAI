# MiniMax H3 Text-to-Video Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a MiniMax H3 node with a non-empty prompt and no referenced media to generate video while preserving reference-tag filtering and validation.

**Architecture:** `minimax-h3-workflow.js` remains the server-side trust boundary: it accepts empty reference arrays, filters only explicitly tagged references, and prepares a workflow without reference loader nodes when no tags are present. `script.js` removes only the no-media guard while retaining empty-prompt, invalid-tag, and 9/3/3 capacity validation. Existing Node assertions and Playwright checks cover both text-only and reference generation paths.

**Tech Stack:** Browser JavaScript, Node.js CommonJS, ComfyUI API workflow JSON, Node assertions, Playwright.

## Global Constraints

- A non-empty prompt without `<Picture n>`, `<Video n>`, or `<Audio n>` must submit as text-to-video with `images: []`, `videos: []`, and `audios: []`.
- Connected media that is not mentioned in the prompt must not be uploaded or written into the ComfyUI workflow.
- Valid reference tags must retain the existing filtering and contiguous renumbering behavior.
- Invalid or out-of-range reference tags must continue to fail before ComfyUI submission.
- Empty prompts and reference counts above 9 images, 3 videos, or 3 audios remain invalid.
- Aspect ratio, resolution, scheduler steps, duration, seed, upload security, timeouts, and MP4 output validation remain unchanged.

---

### Task 1: Server-side text-only normalization and workflow preparation

**Files:**
- Modify: `tools/check-minimax-h3-video.js`
- Modify: `minimax-h3-workflow.js`

**Interfaces:**
- Consumes: `normalizeMinimaxH3Request({ prompt, images, videos, audios, ...options })`.
- Produces: a normalized request whose three reference arrays may all be empty, and a ComfyUI workflow without reference loader nodes when those arrays are empty.

- [x] **Step 1: Write failing normalization assertions**

Replace the assertion that `normalizeMinimaxH3Request({ prompt: "x" })` throws with an assertion that the returned prompt is `"x"` and all three reference arrays are empty. Replace the connected-media/no-tags failure assertion with checks that the prompt remains unchanged and all connected-but-unmentioned media is filtered out. Keep the invalid `<Video 2>` assertion unchanged.

- [x] **Step 2: Write a failing text-only workflow assertion**

Prepare a request with `prompt: "A cinematic night walk"`, empty reference arrays, and valid generation settings. Assert that the resulting workflow has no `LoadImage`, `LoadVideo`, `GetVideoComponents`, or `LoadAudio` nodes and that node `222` contains no keys beginning with `ref_images.`, `ref_videos.`, `ref_video_audios.`, or `ref_audios.`.

- [x] **Step 3: Run the focused check and verify RED**

Run `node tools/check-minimax-h3-video.js`. Expected: FAIL with the current `MiniMax H3 requires at least one reference image, video, or audio clip.` error.

- [x] **Step 4: Implement the minimal server fix**

Delete the empty-reference rejection in `normalizeMinimaxH3Request`. In `selectPromptReferences`, keep the tag loop, out-of-range validation, filtering, sorting, and remapping, but remove the final `selectedCount` rejection so no-tag prompts return `{ prompt: internalPrompt, images: [], videos: [], audios: [] }`.

- [x] **Step 5: Run the focused check and verify GREEN**

Run `node tools/check-minimax-h3-video.js`. Expected: `MiniMax H3 canvas video checks passed`.

### Task 2: Canvas text-only submission and user guidance

**Files:**
- Modify: `tools/check-minimax-h3-video.js`
- Modify: `tools/check-minimax-h3-ui.js`
- Modify: `script.js`

**Interfaces:**
- Consumes: an H3 node with a non-empty prompt and zero incoming media references.
- Produces: a POST body with empty `images`, `videos`, and `audios`, while the existing reference path still sends only mentioned media.

- [x] **Step 1: Write failing frontend assertions**

Add a static assertion that `script.js` does not contain `setCanvasH3Status(node, "至少连接一项参考素材"` and does contain `输入描述即可生成，参考素材可选`. Extend the browser test with a dedicated no-media H3 node, submit `雨夜街道上的电影感跟拍镜头`, and assert the intercepted request contains the exact prompt and three empty arrays.

- [x] **Step 2: Run frontend checks and verify RED**

Run `node tools/check-minimax-h3-video.js`; then start the app on port 3107 and run `node tools/check-minimax-h3-ui.js` with the bundled Playwright `NODE_PATH`. Expected: the static check fails on the existing no-media guard, and the browser path cannot submit a text-only request.

- [x] **Step 3: Implement the minimal canvas fix**

Remove only the `if (!refs.images.length && !refs.videos.length && !refs.audios.length)` block from `runCanvasMinimaxH3Node`. Change the intro to `文生视频 · 多模态参考生成` and the footer status to `输入描述即可生成，参考素材可选`. Preserve prompt validation, reference-tag validation, capacity checks, and the existing request body.

- [x] **Step 4: Run focused static and browser checks and verify GREEN**

Run `node tools/check-minimax-h3-video.js` and `node tools/check-minimax-h3-ui.js`. Expected: both exit 0; the text-only intercepted request has empty media arrays, the reference request still contains its prompt tags, and an invalid reference tag still blocks generation.

### Task 3: Full verification and scope review

**Files:**
- Verify: `minimax-h3-workflow.js`
- Verify: `script.js`
- Verify: `server.js`
- Verify: `tools/check-minimax-h3-video.js`
- Verify: `tools/check-minimax-h3-ui.js`

**Interfaces:**
- Consumes: completed server and canvas changes.
- Produces: fresh syntax, focused browser, and full-project verification evidence.

- [x] **Step 1: Run syntax checks**

Run `node --check minimax-h3-workflow.js`, `node --check script.js`, and `node --check server.js`. Expected: all exit 0 without syntax errors.

- [x] **Step 2: Run the full project check**

Run `npm run check`. Expected: exit 0 with every listed check passing.

- [x] **Step 3: Review scope and whitespace**

Run `git diff --check` and inspect the H3-related snippets in the five files above. Expected: no whitespace errors, no change to upload security or output validation, and no remaining text-only media guard.
