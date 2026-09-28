# MiniMax H3 Prompt Reference Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upload to ComfyUI only the connected H3 media explicitly referenced by prompt tags.

**Architecture:** Parse `<Picture n>`, `<Video n>`, and `<Audio n>` during request normalization, before the asynchronous task and ComfyUI uploads are created. Select referenced arrays, preserve their original connection order, and rewrite only the internal prompt to compact per-type numbering; keep the canvas prompt and connections unchanged.

**Tech Stack:** Node.js, CommonJS, `node:assert/strict`.

## Global Constraints

- Repeated prompt tags upload one copy of the referenced file.
- Image, video, and audio numbering remains independent.
- Invalid or absent material tags fail before any ComfyUI upload.
- Do not change canvas connections, displayed reference lists, or the saved prompt.
- Do not add dependencies.

---

### Task 1: Filter and remap normalized H3 references

**Files:**
- Modify: `tools/check-minimax-h3-video.js`
- Modify: `minimax-h3-workflow.js`

**Interfaces:**
- Consumes: `normalizeMinimaxH3Request(value)` with connected `images`, `videos`, `audios`, and official prompt tags.
- Produces: A normalized request containing only referenced media and a compactly renumbered internal prompt.

- [x] **Step 1: Add failing tests for filtering, deduplication, renumbering, invalid tags, and no tags**
- [x] **Step 2: Run `node tools/check-minimax-h3-video.js` and confirm the filtering assertion fails**
- [x] **Step 3: Implement the minimal prompt-reference selector inside request normalization**
- [x] **Step 4: Run the focused H3 check and `npm run check`**
- [x] **Step 5: Restart the local server and confirm port 3099 returns HTTP 200 from the new process**
