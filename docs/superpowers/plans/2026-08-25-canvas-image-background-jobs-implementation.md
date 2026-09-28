# Canvas Image Background Jobs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make canvas image generation a persisted background job that survives browser refresh and never blindly resubmits an ambiguous paid request.

**Architecture:** A standalone job manager owns lifecycle and persistence. `server.js` exposes create/read endpoints and reuses one extracted image-generation executor. `script.js` creates and polls jobs while persisting the active job ID on the canvas node.

**Tech Stack:** Node.js CommonJS, existing HTTP server, browser Fetch API, existing canvas persistence, native assertion tests, Playwright browser checks.

## Global Constraints

- Default image-job deadline is 15 minutes and configurable from 5–30 minutes.
- An ambiguous timeout must never automatically submit a second paid request.
- Canvas interaction must remain responsive while jobs run.
- Existing `/api/images` behavior remains compatible.
- No real paid image request is used in tests.

---

### Task 1: Background job state machine

**Files:**
- Create: `image-job-manager.js`
- Create: `tools/check-image-job-manager.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `createImageJobManager({ filePath, timeoutMs, execute, now })`
- Produces manager methods: `create(payload, metadata)`, `get(id)`, `start(id)`, `recoverInterrupted()`.

- [ ] Write failing tests proving create returns before execution resolves, slow completion is stored, deadline becomes `unknown`, and startup recovery never resubmits.
- [ ] Run `node tools/check-image-job-manager.js` and confirm the missing-module failure.
- [ ] Implement the minimal persisted state machine with atomic file replacement.
- [ ] Run the targeted test and add it to `npm run check`.

### Task 2: Shared image executor and HTTP endpoints

**Files:**
- Modify: `server.js`
- Create: `tools/check-image-job-endpoint.js`

**Interfaces:**
- Produces: `executeImageGenerationPayload(payload, { signal }) -> { status, body }`.
- Produces: `POST /api/image-jobs` and `GET /api/image-jobs/:id`.
- Consumes: Task 1 job manager.

- [ ] Write an endpoint test with a delayed fake executor and assert POST returns a job before completion.
- [ ] Run it and confirm `/api/image-jobs` returns 404.
- [ ] Extract the current `/api/images` business logic into one executor used by synchronous and job routes.
- [ ] Add the job routes, sanitized responses, deadline configuration, and startup interruption recovery.
- [ ] Run endpoint and existing server tests.

### Task 3: Canvas polling and refresh recovery

**Files:**
- Modify: `script.js`
- Modify: `tools/check-canvas-agent-browser.js`
- Modify: `tools/check-canvas-agent-image-failover.js`

**Interfaces:**
- Produces: `createCanvasImageJob`, `waitForCanvasImageJob`, and `resumeCanvasImageNodeJob`.
- Persists: `imageJobId` and `imageJobState` in serialized image nodes.

- [ ] Add browser assertions that a delayed job keeps the button busy, refresh uses the same job ID, and completion enters the existing gallery.
- [ ] Run the browser test and confirm it fails because the client still calls `/api/images`.
- [ ] Replace canvas-node synchronous fetch with job creation and polling.
- [ ] Restore pending jobs after board restoration without creating another job.
- [ ] Map `unknown` to a safe “结果待确认” message and prepare, but do not execute, a healthy fallback.
- [ ] Run static and browser checks.

### Task 4: Retry boundary and full verification

**Files:**
- Modify: `server.js`
- Modify: `tools/check-grsai-timeout-handling.js`

**Interfaces:**
- Ensures an aborted/timeout GrsAI submission is not submitted again automatically.

- [ ] Add a failing source/behavior check that timeout cannot re-enter the GrsAI submit loop.
- [ ] Remove ambiguous submission retry while retaining result polling for an acquired task ID.
- [ ] Run `node tools/check-grsai-timeout-handling.js`.
- [ ] Run `node tools/check-canvas-agent-browser.js` and `npm run check`.
- [ ] Inspect `git diff --check` and report only changes made for this feature.
