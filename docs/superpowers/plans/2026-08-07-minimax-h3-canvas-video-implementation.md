# MiniMax H3 Canvas Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete MiniMax H3 multimodal reference-to-video node to the canvas with reusable video/audio assets and a separate generated-video output node.

**Architecture:** Extend the existing vanilla JavaScript canvas node system with typed media nodes while retaining the current connection record format. Extend the existing Node.js ComfyUI asynchronous task framework with a dedicated H3 workflow runner and video-output extraction.

**Tech Stack:** Node.js 18+, vanilla JavaScript, HTML5 video/audio, CSS, ComfyUI HTTP API, existing static Node server.

## Global Constraints

- Preserve all existing image generation, Midjourney, and ComfyUI behavior.
- Support at most 9 image references, 3 video references, and 3 audio references.
- Generated video must live in a separate video output node.
- Reference images must display and serialize as an ordered collection.
- Store media files under local `output/`; never embed large media bytes in canvas board JSON.
- Do not add dependencies or unrelated refactors.

---

### Task 1: H3 workflow contract and video extraction

**Files:**
- Create: `workflows/minimax-h3-video.json`
- Create: `tools/check-minimax-h3-video.js`
- Modify: `server.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: ComfyUI workflow API JSON and existing `submitComfyPrompt`, `waitForComfyHistory`, and task-store helpers.
- Produces: `POST /api/minimax-h3-video`, task result field `videos: string[]`, and pure workflow/video helper exports for the checker.

- [x] **Step 1: Add a failing contract checker**

Assert the workflow exists, the route is registered, parameter validation contains the `9/3/3` limits, dynamic input prefixes exist, and history extraction recognizes video outputs.

- [x] **Step 2: Run the checker and verify RED**

Run: `node tools/check-minimax-h3-video.js`
Expected: FAIL because the H3 route and helpers do not exist.

- [x] **Step 3: Add the valid workflow and minimal server implementation**

Copy the supplied valid API workflow, implement media validation/upload, dynamic load nodes, parameter injection, task execution, and `SaveVideo` output download to `output/`.

- [x] **Step 4: Run the checker and syntax checks**

Run: `node tools/check-minimax-h3-video.js && node --check server.js`
Expected: PASS.

### Task 2: Reusable video/audio material nodes

**Files:**
- Modify: `script.js`
- Modify: `styles.css`
- Modify: `server.js`
- Modify: `tools/check-minimax-h3-video.js`

**Interfaces:**
- Consumes: generic local media upload returning `{ url, filename, mimeType }`.
- Produces: `video` and `audio` canvas node kinds, reusable source metadata, and typed connection inference.

- [x] **Step 1: Extend the checker with failing menu/factory/persistence assertions**

Assert menu entries, file input accepts, render functions, kind inference, serialization, restoration, and media upload MIME mappings exist.

- [x] **Step 2: Run the checker and verify RED**

Run: `node tools/check-minimax-h3-video.js`
Expected: FAIL on missing video/audio material node behavior.

- [x] **Step 3: Implement media upload and material nodes**

Add generic chunk upload support, video/audio menu items, upload/replace interactions, HTML5 previews, download controls, and board persistence.

- [x] **Step 4: Run focused checks**

Run: `node tools/check-minimax-h3-video.js && node --check script.js && node --check server.js`
Expected: PASS.

### Task 3: H3 orchestration and separate output node

**Files:**
- Modify: `script.js`
- Modify: `styles.css`
- Modify: `tools/check-minimax-h3-video.js`

**Interfaces:**
- Consumes: typed incoming canvas references and `/api/minimax-h3-video`.
- Produces: `minimax-h3` and `video-output` node kinds, ordered media collections, request payload, and automatic output-node creation/update.

- [x] **Step 1: Add failing H3 behavior assertions**

Assert controls and defaults, media partitioning, 9/3/3 limits, request fields, status polling, output creation/update, and serialization/restoration.

- [x] **Step 2: Run the checker and verify RED**

Run: `node tools/check-minimax-h3-video.js`
Expected: FAIL on missing H3 and output-node behavior.

- [x] **Step 3: Implement H3 and video output nodes**

Add ordered image/video/audio collection UI, generation controls, task submission/polling, player output node, typed downstream references, and persistence.

- [x] **Step 4: Run focused checks**

Run: `node tools/check-minimax-h3-video.js && node --check script.js`
Expected: PASS.

### Task 4: Regression and visual verification

**Files:**
- Modify as required by observed defects: `script.js`, `styles.css`, `server.js`, `tools/check-minimax-h3-video.js`

**Interfaces:**
- Consumes: complete H3 feature.
- Produces: verified desktop/mobile canvas behavior and passing project checks.

- [x] **Step 1: Run complete automated verification**

Run: `npm run check`
Expected: all checks pass with exit code 0.

- [x] **Step 2: Start the existing local server on an available port**

Run: `npm start`
Expected: server reports a local URL without startup errors.

- [x] **Step 3: Verify the live canvas**

Create video/audio/H3 nodes, connect media, inspect ordered collections, reload to verify persistence, and confirm output-player rendering at desktop and mobile viewports.

- [x] **Step 4: Re-run complete verification after visual fixes**

Run: `npm run check`
Expected: all checks pass with exit code 0.

### Task 5: Allow empty material nodes to connect before upload

**Files:**
- Modify: `script.js`
- Modify: `tools/check-minimax-h3-ui.js`

**Interfaces:**
- Consumes: empty image-upload, video-material, and audio-material canvas nodes plus the existing `connectCanvasNodes` flow.
- Produces: structural H3 connections that become active references after `fillCanvasMediaNode` or image upload refreshes the source node.

- [x] **Step 1: Add a failing browser regression test**

Create empty image-upload, video, and audio nodes, connect each output to H3, and assert all three connection records exist while `getCanvasIncomingMinimaxH3Refs` remains empty.

- [x] **Step 2: Run the browser test and verify RED**

Run: `node tools/check-minimax-h3-ui.js`
Expected: FAIL because `connectCanvasNodes` rejects empty media sources.

- [x] **Step 3: Permit typed empty material placeholders for H3**

Extend the empty-source allowance and create a placeholder output whose `type` is `image`, `video`, or `audio` based on the source node. Keep empty references excluded from request payloads because they have no `url`.

- [x] **Step 4: Run focused and complete verification**

Run: `node tools/check-minimax-h3-ui.js && npm run check`
Expected: PASS with empty structural connections preserved and all existing checks green.
