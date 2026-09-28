# MiniMax H3 LoadVideo Validation Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make generated MiniMax H3 workflows satisfy the current ComfyUI `LoadVideo` input contract.

**Architecture:** Keep the existing reference collection and submission behavior unchanged. Update only the dynamically generated `LoadVideo` node input key from `video` to the ComfyUI-required `file`, and protect it with the existing focused H3 contract check.

**Tech Stack:** Node.js, CommonJS, `node:assert/strict`.

## Global Constraints

- All connected non-empty H3 references continue to be submitted, whether or not their prompt tag is used.
- Do not change image, audio, connection, ordering, or prompt-mention behavior.
- Do not add dependencies.

---

### Task 1: Correct the dynamic LoadVideo contract

**Files:**
- Modify: `tools/check-minimax-h3-video.js`
- Modify: `minimax-h3-workflow.js`

**Interfaces:**
- Consumes: `prepareMinimaxH3Workflow(template, request, outputPrefix)`.
- Produces: Dynamic `LoadVideo` nodes shaped as `{ inputs: { file: string }, class_type: "LoadVideo" }`.

- [x] **Step 1: Write the failing regression assertion**

Add assertions that locate the generated `LoadVideo` node, require `inputs.file === "motion.mp4"`, and require that the obsolete `inputs.video` key is absent.

- [x] **Step 2: Verify the regression assertion fails for the expected reason**

Run: `node tools/check-minimax-h3-video.js`

Expected: FAIL because the generated node has no `inputs.file` value.

- [x] **Step 3: Apply the minimal production fix**

Change the dynamic node from `inputs: { video: item.name }` to `inputs: { file: item.name }`.

- [x] **Step 4: Verify focused and full checks**

Run: `node tools/check-minimax-h3-video.js`

Expected: PASS with `MiniMax H3 canvas video checks passed`.

Run: `npm run check`

Expected: exit code 0 with all contract checks passing.

- [x] **Step 5: Verify the generated node against live ComfyUI metadata**

Read `GET http://192.168.1.53:8188/object_info/LoadVideo` and confirm its required input list contains `file`.
