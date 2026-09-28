# Canvas Agent Image Failover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an Agent-triggered image request is definitely rejected by one configured API, keep the current node and automatically continue on the next compatible API for the same requested image model.

**Architecture:** Keep model selection deterministic in the canvas execution layer. `image-model-routing.js` supplies the next eligible candidate after excluding tried candidate IDs; `script.js` refreshes candidates after a definitive rejection, updates the current image node to the fallback, and retries once per remaining compatible candidate. The Agent receives the final structured result, while the LLM never chooses a provider.

**Tech Stack:** Node.js, browser JavaScript, existing `CanvasImageModelRouting`, Node `assert` checks, Playwright Agent browser regression.

## Global Constraints

- Default requests remain inside the `gpt-image-2` family; a user-named model remains inside that named model family.
- Only explicitly unaccepted errors (quota/balance, authentication, or rate-limit) may switch API; timeout, network interruption, and an ambiguous server error never retry automatically.
- A switch is scoped to the current node, board, and Agent run; it does not mutate another canvas.
- The node retains prompt, size, resolution, references, and gallery connection; only its resolved API/model choice changes.
- No polling, render-loop work, or new persistent listener is introduced.

---

### Task 1: Make fallback ranking testable

**Files:**
- Modify: `image-model-routing.js`
- Modify: `tools/check-image-model-routing.js`

**Interfaces:**
- Produces `selectFallbackCandidate(candidates, { requestedModel, requiresEdit, excludeIds }) -> Candidate|null`.
- Uses the existing `rankCandidates` eligibility, capability, health, success-rate, failure-count, and latency ordering.

- [ ] **Step 1: Write the failing regression test**

```js
const fallback = routing.selectFallbackCandidate([
  { ...onlineImage2, id: "quota", state: "balance-error" },
  { ...onlineImage2, id: "primary", latencyMs: 100 },
  { ...onlineImage2, id: "backup", latencyMs: 180 },
  { ...onlineImage2, id: "other", model: "gemini-3-pro-image", family: "gemini" },
], { requestedModel: "gpt-image-2", excludeIds: ["primary"] });
assert.equal(fallback.id, "backup");
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node tools/check-image-model-routing.js`

Expected: failure because `selectFallbackCandidate` does not exist.

- [ ] **Step 3: Implement the minimal selector**

```js
function selectFallbackCandidate(candidates, options = {}) {
  const excluded = new Set((options.excludeIds || []).map((value) => String(value)));
  return rankCandidates(candidates, options).find((candidate) => !excluded.has(String(candidate.id))) || null;
}
```

- [ ] **Step 4: Re-run the focused routing test**

Run: `node tools/check-image-model-routing.js`

Expected: `Image model routing checks passed.`

### Task 2: Retry a rejected Agent image node on the next same-model API

**Files:**
- Modify: `script.js`
- Modify: `canvas-agent-ui.js`
- Create: `tools/check-canvas-agent-image-failover.js`
- Modify: `tools/check-canvas-agent-browser.js`

**Interfaces:**
- Consumes `CanvasImageModelRouting.selectFallbackCandidate` and `/api/image-models` candidates.
- Produces `runCanvasImageEdit(node, { guard, autoFailover: true }) -> { ok, image, gallery, model, fallback? }`.

- [ ] **Step 1: Write a failing source regression check**

```js
assert.match(script, /async function resolveCanvasImageFailoverCandidate/);
assert.match(script, /CanvasImageModelRouting\.selectFallbackCandidate/);
assert.match(script, /autoFailover:\s*true/);
assert.match(ui, /runCanvasImageEdit", node, \{ autoFailover: true \}/);
```

- [ ] **Step 2: Run the check and verify it fails**

Run: `node tools/check-canvas-agent-image-failover.js`

Expected: failure because Agent node execution stops after the first image error.

- [ ] **Step 3: Implement controlled retry in `runCanvasImageEdit`**

```js
const safeError = getSafeCanvasImageGenerationError(error);
if (autoFailover && isCanvasImageFailoverError(safeError) && !returnedImage) {
  const fallback = await resolveCanvasImageFailoverCandidate({
    currentModel: activeModel,
    refs,
    size: getCanvasOutputSize(node),
    resolution: getCanvasImageResolution(node),
    attemptedModelIds,
  });
  if (fallback) {
    applyCanvasImageCandidate(node, fallback);
    activeModel = fallback.id;
    continue;
  }
}
```

`isCanvasImageFailoverError` accepts only normalized balance, auth, and rate-limit errors. `resolveCanvasImageFailoverCandidate` refreshes `/api/image-models` once after the rejection, derives the current candidate's model family rather than its provider-specific client ID, filters by reference/edit and output compatibility, and excludes every attempted API. The successful result contains `{ model, fallback: { from, to } }` when a switch occurred.

- [ ] **Step 4: Enable only Agent paths**

Pass `{ autoFailover: true }` from `generateAgentCanvasImageToGallery`, `runAgentCanvasNodeWithGuard`, and the legacy Agent UI adapter. Normal manual canvas-node clicks retain their existing single-interface behavior.

- [ ] **Step 5: Run focused static and syntax checks**

Run: `node --check image-model-routing.js && node --check script.js && node --check canvas-agent-ui.js && node tools/check-image-model-routing.js && node tools/check-canvas-agent-image-failover.js`

Expected: all exit with code 0.

### Task 3: Verify the Agent-visible fallback sequence

**Files:**
- Modify: `tools/check-canvas-agent-browser.js`

**Interfaces:**
- Simulates candidate refresh where primary `gpt-image-2` returns quota failure and backup `gpt-image-2` returns one image.
- Verifies two image calls, model change from primary to backup, exactly one gallery image, and no user model-selection prompt.

- [ ] **Step 1: Add the failing browser scenario**

```js
assert.equal(imageAttempts.map((entry) => entry.model).join(","), "primary-image2,backup-image2");
assert.equal(result.ok, true);
assert.equal(result.fallback.to, "backup-image2");
assert.equal(galleryImageCount, 1);
```

- [ ] **Step 2: Run it and verify it fails before the implementation**

Run: `node tools/check-canvas-agent-browser.js`

Expected: failure after the first quota response with no backup attempt.

- [ ] **Step 3: Run the browser regression after Task 2**

Run: `node tools/check-canvas-agent-browser.js`

Expected: the fallback scenario and all existing scenarios pass with no browser errors.

- [ ] **Step 4: Run the project regression**

Run: `npm run check`

Expected: exit code 0 with all static and behavior checks passing.
