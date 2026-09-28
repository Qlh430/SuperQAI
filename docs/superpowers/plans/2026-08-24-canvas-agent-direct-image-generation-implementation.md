# Canvas Agent Direct Image Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an explicit one-image generation request run end-to-end through one MCP tool, automatically choose a usable configured image model, center the generator/gallery workflow in the visible canvas, and report completion only after a real gallery result exists.

**Architecture:** Keep intent understanding in the Agent host, professional sequencing in Skills, and all mutations behind the existing in-process MCP/Broker boundary. Add a deterministic image-model routing module and a paid compound capability whose adapter delegates to one guarded Canvas API method; retain the low-level image/gallery/run tools for professional workflows.

**Tech Stack:** Vanilla JavaScript, Node.js 18+, browser DOM Canvas API, existing in-process MCP modules, Node `assert`, Playwright browser checks.

## Global Constraints

- Explicit direct one-image requests authorize exactly one `generate_image_to_gallery` attempt in the current `boardId + runId`; discussion, questions, preparation-only wording, ambiguous quantity, deletion, and bulk overwrite retain existing confirmation behavior.
- LLM tool parameters never select an image provider or model; selection is deterministic and local to the configured device.
- A timeout or unknown post-submit state never triggers an automatic paid retry.
- Only a real image appended to a connected gallery counts as completion.
- No new timer, DOM observer, pointer/wheel listener, network MCP transport, or render-loop work.
- Do not stage or commit from this shared dirty worktree; use the listed verification checkpoints and preserve unrelated user changes.

---

### Task 1: Deterministic image-model candidate routing

**Files:**
- Create: `image-model-routing.js`
- Create: `tools/check-image-model-routing.js`
- Modify: `index.html`
- Modify: `build-portable.bat`
- Modify: `package.json`

**Interfaces:**
- Consumes: provider/model records shaped as `{ id, providerId, enabled, hasApiKey, capabilities, state, successRate, consecutiveFailures, latencyMs, lastImageSuccessAt, order }`.
- Produces: `CanvasImageModelRouting.rankCandidates(candidates, options)` and `CanvasImageModelRouting.selectCandidate(candidates, options)` for both Node and the browser.

- [ ] **Step 1: Write the failing pure-routing test**

```js
const assert = require("node:assert/strict");
const routing = require("../image-model-routing");

const candidates = [
  { id: "offline", enabled: true, hasApiKey: true, capabilities: ["generation"], state: "offline", order: 0 },
  { id: "fast", enabled: true, hasApiKey: true, capabilities: ["generation", "edit"], state: "online", successRate: 98, consecutiveFailures: 0, latencyMs: 900, order: 1 },
  { id: "preferred", enabled: true, hasApiKey: true, capabilities: ["generation"], state: "unknown", successRate: 100, consecutiveFailures: 0, latencyMs: 1200, order: 2 },
];

assert.equal(routing.selectCandidate(candidates, { preferredId: "preferred" }).id, "preferred");
assert.equal(routing.selectCandidate(candidates, { preferredId: "offline" }).id, "fast");
assert.equal(routing.selectCandidate(candidates, { requiresEdit: true }).id, "fast");
assert.equal(routing.selectCandidate([{ ...candidates[0] }]), null);
assert.deepEqual(candidates.map((item) => item.id), ["offline", "fast", "preferred"]);
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run: `node tools/check-image-model-routing.js`  
Expected: FAIL with `Cannot find module '../image-model-routing'`.

- [ ] **Step 3: Implement the UMD routing module**

```js
(function initCanvasImageModelRouting(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasImageModelRouting = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasImageModelRouting() {
  const BLOCKED_STATES = new Set(["disabled", "offline", "connection-error", "account-limited", "balance-error"]);
  const STATE_RANK = { online: 0, reachable: 1, slow: 2, unstable: 3, degraded: 4, unknown: 5 };

  function isEligible(candidate, options = {}) {
    const capabilities = new Set(Array.isArray(candidate?.capabilities) ? candidate.capabilities : []);
    return Boolean(candidate?.id && candidate.enabled !== false && candidate.hasApiKey !== false)
      && capabilities.has("generation")
      && (!options.requiresEdit || capabilities.has("edit"))
      && !BLOCKED_STATES.has(String(candidate.state || "unknown"));
  }

  function rankCandidates(candidates, options = {}) {
    const preferredId = String(options.preferredId || "");
    return (Array.isArray(candidates) ? candidates : [])
      .filter((candidate) => isEligible(candidate, options))
      .map((candidate) => ({ ...candidate }))
      .sort((left, right) => Number(right.id === preferredId) - Number(left.id === preferredId)
        || Number(Boolean(right.lastImageSuccessAt)) - Number(Boolean(left.lastImageSuccessAt))
        || (STATE_RANK[left.state] ?? 5) - (STATE_RANK[right.state] ?? 5)
        || Number(right.successRate ?? -1) - Number(left.successRate ?? -1)
        || Number(left.consecutiveFailures || 0) - Number(right.consecutiveFailures || 0)
        || Number(left.latencyMs || Number.MAX_SAFE_INTEGER) - Number(right.latencyMs || Number.MAX_SAFE_INTEGER)
        || Number(left.order || 0) - Number(right.order || 0));
  }

  function selectCandidate(candidates, options = {}) {
    return rankCandidates(candidates, options)[0] || null;
  }

  return Object.freeze({ BLOCKED_STATES, isEligible, rankCandidates, selectCandidate });
});
```

- [ ] **Step 4: Load and package the shared module**

Add `<script src="image-model-routing.js"></script>` before `script.js` in `index.html`, copy the file in `build-portable.bat`, and add `node --check image-model-routing.js && node tools/check-image-model-routing.js` to `npm run check`.

- [ ] **Step 5: Run the routing test**

Run: `node --check image-model-routing.js`  
Expected: PASS with no output.

Run: `node tools/check-image-model-routing.js`  
Expected: `Image model routing checks passed.`

### Task 2: MCP compound capability and trusted direct-generation allowance

**Files:**
- Modify: `canvas-agent-capabilities.js`
- Modify: `canvas-agent-core.js`
- Modify: `canvas-agent-tool-adapters.js`
- Modify: `canvas-agent-ui.js`
- Modify: `skills/canvas-agent-core/SKILL.md`
- Modify: `tools/check-canvas-agent-capabilities.js`
- Modify: `tools/check-canvas-agent-core.js`
- Modify: `tools/check-canvas-agent-tool-adapters.js`
- Modify: `tools/check-canvas-agent-ui.js`

**Interfaces:**
- Consumes: original user prompt stored in `CanvasAgentCore.createRunState({ prompt })`.
- Produces: capability `image.generate-to-gallery`, MCP tool `generate_image_to_gallery`, run-state `paidAllowances`, and adapter call `canvasApi.generateImageToGallery(args, context)`.

- [ ] **Step 1: Add failing registry and adapter assertions**

```js
assert.equal(capabilities.getCapability("image.generate-to-gallery")?.tool.name, "generate_image_to_gallery");
assert.equal(capabilities.getRisk("generate_image_to_gallery", {}), "paid");
await adapters.generate_image_to_gallery({ prompt: "苹果", size: null, resolution: null, reference_node_ids: [], title: "生成图集" }, context);
assert.equal(calls.at(-1).name, "generateImageToGallery");
```

- [ ] **Step 2: Add failing intent/allowance assertions**

```js
assert.equal(core.createRunState({ prompt: "直接生成一张苹果图片" }).paidAllowances.generate_image_to_gallery, 1);
assert.equal(core.createRunState({ prompt: "苹果海报怎么设计" }).paidAllowances.generate_image_to_gallery, 0);
assert.equal(core.createRunState({ prompt: "先建节点，不要生成" }).paidAllowances.generate_image_to_gallery, 0);
assert.equal(core.createRunState({ prompt: "生成几张看看" }).paidAllowances.generate_image_to_gallery, 0);
assert.equal(core.createRunState({ prompt: "就按第二个方案生成" }).paidAllowances.generate_image_to_gallery, 1);

const authorized = core.buildApprovalPlan([
  { call_id: "image", name: "generate_image_to_gallery", arguments: { prompt: "苹果" } },
], { paidAllowances: { generate_image_to_gallery: 1 } });
assert.equal(authorized.requiresApproval, false);
assert.deepEqual(authorized.authorizedCalls.map((call) => call.call_id), ["image"]);
```

- [ ] **Step 3: Run focused tests and verify they fail**

Run: `node tools/check-canvas-agent-capabilities.js && node tools/check-canvas-agent-core.js && node tools/check-canvas-agent-tool-adapters.js`  
Expected: FAIL because the compound capability and authorization functions do not exist.

- [ ] **Step 4: Register the paid compound capability**

Add this capability immediately after `node.image.create`:

```js
defineCapability("image.generate-to-gallery", "generate_image_to_gallery", "根据明确的直接生图要求创建图片节点、执行一次生成并把真实结果加入图集。", "paid", {
  prompt: stringSchema("完整图片提示词"),
  size: nullableStringSchema("尺寸或比例；自动选择时传 null"),
  resolution: nullableStringSchema("清晰度；自动选择时传 null"),
  reference_node_ids: stringArraySchema("当前画布参考节点 ID"),
  title: nullableStringSchema("图集标题；使用默认值时传 null"),
}),
```

Map it in `canvas-agent-tool-adapters.js`:

```js
generate_image_to_gallery: (args, context) => canvasApi.generateImageToGallery(args, context),
```

- [ ] **Step 5: Implement conservative intent classification and bounded allowance**

Add pure helpers in `canvas-agent-core.js` that reject negative/preparation/question/ambiguous-quantity wording, recognize explicit image commands and contextual follow-ups such as “按第二个方案生成”, and return one allowance at most:

```js
function getDirectImageGenerationAllowance(prompt) {
  const text = String(prompt || "").trim();
  if (!text || /不要生成|别生成|先不生成|暂不生成|只讨论|先聊|只建节点|不要出图/.test(text)) return 0;
  if (/怎么|如何|为什么|能不能|是否|可以吗|可不可以|\?$|？$/.test(text)) return 0;
  if (/几张|多张|一批|批量|若干/.test(text)) return 0;
  const directImage = /(生成|画|绘制|出|做)(?:一张|1张|一个)?[^。！？]{0,24}(图|图片|海报|主视觉|插画)/.test(text);
  const contextualExecute = /(就|直接|现在|开始|请)?按[^。！？]{0,24}(方案|方向|刚才|上面)[^。！？]{0,16}(生成|出图|做)/.test(text);
  return directImage || contextualExecute ? 1 : 0;
}
```

Extend `buildApprovalPlan(calls, { paidAllowances })` so only allowance-backed `generate_image_to_gallery` calls appear in `authorizedCalls`; all other paid calls remain in `calls`. Add `consumePaidAllowances(run, authorizedCalls)` that decrements before execution and never restores an attempted allowance.

- [ ] **Step 6: Wire allowance consumption into the Agent Host**

In `handleCanvasAgentTurn()`:

```js
const approvalPlan = CanvasAgentCore.buildApprovalPlan(calls, {
  paidAllowances: state.currentRun.paidAllowances,
});
state.currentRun = CanvasAgentCore.consumePaidAllowances(state.currentRun, approvalPlan.authorizedCalls);
persistCanvasAgentRun();
```

Persist `paidAllowances` in the saved run record and restore it only when the saved `boardId` and `runId` still match the active run. The existing risky-call filter then treats allowance-backed compound calls as executable while still pausing `run_canvas_node`, deletion, bulk overwrite, ambiguous requests, and any second paid call. Add a reload/recovery assertion proving a consumed allowance remains `0` and cannot be recreated from the original prompt.

- [ ] **Step 7: Update the core Skill**

Add `image.generate-to-gallery` to the core capability list and add these rules:

```markdown
- 用户明确要求直接生成一张图片，或在本画布讨论后明确说“按该方案生成”时，优先调用 `generate_image_to_gallery`，不要只创建节点后结束。
- 讨论、询问、比较方案、明确说先不生成或只建节点时，不得调用付费工具。
- 普通单次生图不激活业务 Skill；只有图片真实进入图集后才能称为完成。
```

- [ ] **Step 8: Run focused MCP/Host tests**

Run: `node tools/check-canvas-agent-capabilities.js && node tools/check-canvas-agent-core.js && node tools/check-canvas-agent-tool-adapters.js && node tools/check-canvas-agent-ui.js`  
Expected: all four scripts print their `checks passed` messages.

### Task 3: Expose health-aware image candidates without secrets or paid probes

**Files:**
- Modify: `server.js`
- Modify: `script.js`
- Create: `tools/check-image-model-candidates.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: enabled provider settings, model capabilities, monitoring samples, and real image usage events already stored by `recordProviderUsageEvent()`.
- Produces: `/api/image-models` field `candidates` and browser helper `resolveCanvasAgentImageModel({ requiresEdit, size, resolution })`.

- [ ] **Step 1: Write a failing candidate-response test**

The test extracts or invokes the server candidate builder with providers representing online, offline, authentication-failed, and edit-incapable routes, then asserts that public records contain no `apiKey` and retain provider-specific model IDs.

```js
assert.equal(result.some((item) => item.apiKey), false);
assert.equal(result.find((item) => item.id === "custom:online:model")?.state, "online");
assert.equal(result.find((item) => item.id === "custom:offline:model")?.state, "offline");
assert.deepEqual(result.find((item) => item.id === "custom:online:model")?.capabilities, ["generation", "edit"]);
```

- [ ] **Step 2: Run the candidate test and verify it fails**

Run: `node tools/check-image-model-candidates.js`  
Expected: FAIL because candidate metadata is not present.

- [ ] **Step 3: Build public candidate metadata in `server.js`**

Require the shared module once near the other server dependencies:

```js
const CanvasImageModelRouting = require("./image-model-routing");
```

Create `getImageModelCandidates()` that:

```js
function getImageModelCandidates() {
  const settings = getSettingsResponse(readSettingsFile());
  const monitoring = readProviderMonitoringFile();
  const candidates = settings.providers.flatMap((provider) => (provider.models || [])
    .filter((model) => model.capabilities?.includes("generation"))
    .map((model, order) => {
      const id = provider.importedSystem ? model.id : makeCustomModelClientId(provider.id, model.id);
      const samples = monitoring.providers?.[provider.id] || [];
      const usage = (monitoring.usage?.[provider.id] || []).filter((item) => item.kind === "image" && item.model === model.id);
      return toPublicImageCandidate(provider, model, id, samples, usage, order);
    }));
  return CanvasImageModelRouting.rankCandidates(candidates, { preferredId: "" });
}
```

`toPublicImageCandidate()` must expose only routing fields, derive consecutive image failures from the tail of `usage`, and map explicit disabled/offline/auth/balance states without exposing keys, full URLs, raw provider errors, or stored history.

- [ ] **Step 4: Enrich `/api/image-models` while preserving current dropdown behavior**

Return:

```js
sendJson(res, 200, {
  defaultModel: IMAGE_DEFAULT_MODEL,
  models: existingModels,
  labels,
  resolutions,
  platforms,
  families,
  prices,
  candidates: getImageModelCandidates(),
});
```

Do not remove configured models from `models`; manual canvas controls must continue to display them even if health is unknown or temporarily unavailable.

- [ ] **Step 5: Cache candidate metadata only when models load**

In `script.js`, store `data.candidates` beside the existing model metadata during `loadImageModels()`. Add:

```js
function resolveCanvasAgentImageModel({ requiresEdit = false } = {}) {
  return CanvasImageModelRouting.selectCandidate(canvasImageModelCandidates, {
    preferredId: imageModelInput.value,
    requiresEdit,
  });
}
```

Do not add polling. The resolver is called once during compound-tool preflight.

- [ ] **Step 6: Run server/model tests**

Run: `node --check server.js && node --check script.js && node tools/check-image-model-routing.js && node tools/check-image-model-candidates.js && node tools/check-provider-runtime-metrics.js`  
Expected: all checks pass; no network request or paid image generation occurs.

### Task 4: Guarded generate-to-gallery Canvas API and centered placement

**Files:**
- Modify: `canvas-agent-core.js`
- Modify: `script.js`
- Modify: `tools/check-canvas-agent-core.js`
- Modify: `tools/check-canvas-agent-full-capability.js`

**Interfaces:**
- Consumes: `resolveCanvasAgentImageModel()`, `runCanvasImageEdit(node, { guard })`, existing gallery functions, and the current MCP context.
- Produces: `CanvasAgentCore.planCenteredRowLayout(center, sizes, gap)`, `CanvasAgentCanvasApi.generateImageToGallery(args, context)`, and centered defaults for Agent-created nodes.

- [ ] **Step 1: Write failing layout tests**

```js
assert.deepEqual(core.planCenteredRowLayout(
  { x: 800, y: 500 },
  [{ width: 300, height: 400 }, { width: 300, height: 400 }],
  90,
), [
  { x: 455, y: 300 },
  { x: 845, y: 300 },
]);
assert.deepEqual(core.planCenteredRowLayout({ x: 500, y: 400 }, [{ width: 300, height: 200 }], 90), [{ x: 350, y: 300 }]);
```

- [ ] **Step 2: Implement the pure centered-row planner**

```js
function planCenteredRowLayout(center, items, gap = 90) {
  const sizes = items.map((item) => ({ width: Math.max(1, Number(item.width) || 292), height: Math.max(1, Number(item.height) || 260) }));
  const totalWidth = sizes.reduce((sum, item) => sum + item.width, 0) + Math.max(0, sizes.length - 1) * Math.max(0, Number(gap) || 0);
  let x = Number(center.x || 0) - totalWidth / 2;
  return sizes.map((size) => {
    const point = { x, y: Number(center.y || 0) - size.height / 2 };
    x += size.width + gap;
    return point;
  });
}
```

- [ ] **Step 3: Add the guarded compound Canvas API**

Implement `generateAgentCanvasImageToGallery(args, context)` in `script.js`:

```js
async function generateAgentCanvasImageToGallery(args = {}, context) {
  assertCanvasAgentContext(context);
  const referenceIds = Array.isArray(args.reference_node_ids) ? args.reference_node_ids : [];
  const references = referenceIds.map((id) => findAgentOwnedCanvasNode(id, context));
  const candidate = resolveCanvasAgentImageModel({ requiresEdit: references.length > 0 });
  if (!candidate) return { ok: false, code: "no_usable_image_model", error: "当前没有可用的生图模型，请先在设置中配置或启用图片模型。" };

  const center = getCanvasViewportCenterPoint();
  const [generatorPoint] = CanvasAgentCore.planCenteredRowLayout(center, [
    { width: 292, height: 360 },
    { width: 292, height: 360 },
  ], 90);
  const node = addCanvasImagePlaceholder(generatorPoint);
  node.dataset.boardId = String(context.scope.boardId);
  applyAgentCanvasNodeChanges(node, { prompt: args.prompt, model: candidate.id, size: args.size, resolution: args.resolution });
  connectAgentReferenceNodes(referenceIds, node.dataset.id, context);
  await runCanvasImageEdit(node, { guard: createCanvasOperationGuard(context) });
  assertCanvasAgentContext(context);

  const gallery = findConnectedCanvasGallery(node);
  const images = gallery ? getCanvasGalleryImages(gallery) : [];
  if (!gallery || !images.length) return { ok: false, code: "generation_failed", node_id: node.dataset.id, error: getCanvasNodeStatusText(node) || "图片生成未完成。" };
  gallery.dataset.boardId = String(context.scope.boardId);
  centerAgentImageWorkflow(node, gallery, center);
  scheduleCanvasConnectionRender();
  scheduleCanvasSave();
  return { node_id: node.dataset.id, gallery_node_id: gallery.dataset.id, image_count: images.length, status: "completed" };
}
```

Use small local helpers for `findConnectedCanvasGallery`, status extraction, and final actual-size centering. Reuse the existing `appendCanvasGenerationToGallery()` path; never submit a second image request to repair gallery layout.

- [ ] **Step 4: Expose the API and center ordinary Agent-created nodes**

Add:

```js
generateImageToGallery: generateAgentCanvasImageToGallery,
```

to `CanvasAgentCanvasApi`. For `createAgentCanvasNode()`, when no explicit `x/y` is supplied, reposition the created node after render with its actual `offsetWidth/offsetHeight` around `getCanvasViewportCenterPoint()`; explicit coordinates and later `arrange_nodes` calls remain authoritative.

- [ ] **Step 5: Verify scope and result invariants**

Extend `tools/check-canvas-agent-full-capability.js` to require `generateImageToGallery`, repeated `guard.assertActive()` calls before/after the image request and before gallery/save mutation, automatic model resolution, connected-gallery verification, and no `setInterval`/pointer listeners.

- [ ] **Step 6: Run focused Canvas API tests**

Run: `node tools/check-canvas-agent-core.js && node tools/check-canvas-agent-full-capability.js && node tools/check-canvas-agent-performance.js`  
Expected: all three checks pass.

### Task 5: Browser-level direct generation, discussion boundary, and visual placement

**Files:**
- Modify: `tools/check-canvas-agent-browser.js`
- Modify: `tools/check-canvas-agent-performance.js`
- Modify: `package.json` only if the browser check is not already part of the chosen verification command

**Interfaces:**
- Consumes: the complete Agent Host → MCP → Broker → Canvas API path.
- Produces: end-to-end evidence that an explicit request runs once without a second approval, while discussion/preparation do not run images.

- [ ] **Step 1: Add browser fixtures for models and image generation**

Intercept `/api/image-models` with one offline candidate and one online generation/edit candidate. Intercept `/api/images/generations`, increment `imageGenerationRequests`, and return one saved image URL. Return a `generate_image_to_gallery` tool call for “直接生成一张苹果图片”, no tool calls for “苹果海报怎么设计”, and `create_image_node` only for “先建节点，不要生成”.

- [ ] **Step 2: Assert the explicit command completes once**

```js
await sendAgentPrompt("直接生成一张苹果图片");
await page.locator("#canvasPlane .canvas-node-gallery img").waitFor();
assert.equal(imageGenerationRequests, 1);
assert.equal(await page.locator("#canvasAgentApproval").isVisible(), false);
assert.equal(await page.locator("#canvasPlane .canvas-node-image").count(), 1);
assert.equal(await page.locator("#canvasPlane .canvas-node-gallery").count(), 1);
assert.equal(savedBoard.connections.some((item) => item.from === generatorId && item.to === galleryId), true);
```

- [ ] **Step 3: Assert visible-workflow centering**

Read the viewport, generator, and gallery rectangles and assert the workflow union center differs from the `#infiniteCanvas` center by at most 24 CSS pixels on each axis. Assert neither node intersects the Agent panel rectangle.

- [ ] **Step 4: Assert discussion and preparation boundaries**

After switching to a fresh board/run:

```js
await sendAgentPrompt("苹果海报怎么设计");
assert.equal(imageGenerationRequests, 1);
assert.equal(await page.locator("#canvasPlane .canvas-node").count(), 0);

await sendAgentPrompt("先建节点，不要生成");
assert.equal(imageGenerationRequests, 1);
assert.equal(await page.locator("#canvasPlane .canvas-node-image").count(), 1);
assert.equal(await page.locator("#canvasPlane .canvas-node-gallery").count(), 0);
```

- [ ] **Step 5: Assert no duplicate paid retry and no cross-board write**

Simulate a delayed image response, switch boards, then release the response. Assert the new board has no generator, gallery, connection, saved image, or Agent completion message from the old run. Repeat a completed `call_id` and assert `imageGenerationRequests` remains unchanged.

- [ ] **Step 6: Run browser and performance checks**

Run: `node tools/check-canvas-agent-browser.js` with the local test server running at its configured URL.  
Expected: `Canvas agent browser checks passed.`

Run: `node tools/check-canvas-agent-performance.js`  
Expected: `Canvas agent performance checks passed.`

### Task 6: Full regression and handoff

**Files:**
- Verify only; no additional product files unless a failing regression identifies a scoped correction.

**Interfaces:**
- Consumes: all preceding deliverables.
- Produces: a verified implementation ready for the user to exercise in the running application.

- [ ] **Step 1: Run syntax checks for every changed JavaScript file**

Run: `node --check image-model-routing.js && node --check canvas-agent-capabilities.js && node --check canvas-agent-core.js && node --check canvas-agent-tool-adapters.js && node --check canvas-agent-ui.js && node --check server.js && node --check script.js`  
Expected: PASS with no output.

- [ ] **Step 2: Run focused direct-generation checks**

Run: `node tools/check-image-model-routing.js && node tools/check-image-model-candidates.js && node tools/check-canvas-agent-capabilities.js && node tools/check-canvas-agent-core.js && node tools/check-canvas-agent-tool-adapters.js && node tools/check-canvas-agent-full-capability.js && node tools/check-canvas-agent-ui.js && node tools/check-canvas-agent-performance.js`  
Expected: every script prints its success message.

- [ ] **Step 3: Run the full project suite**

Run: `npm run check`  
Expected: exit code `0` and all existing checks pass.

- [ ] **Step 4: Restart the local application if source is not hot-reloaded**

Resolve the exact process serving this workspace, stop only that PID, start `node server.js` from this workspace, and verify `GET /api/image-models` returns `models` and sanitized `candidates` without keys. Do not stop the unrelated service on port `3099`.

- [ ] **Step 5: Manual acceptance in dark and light themes**

Verify these exact flows:

1. “苹果海报怎么设计” — conversation only.
2. “先建节点，不要生成” — centered generator only.
3. “直接生成一张苹果图片” — one request, connected gallery, centered workflow, no second confirmation.
4. Switch theme and repeat viewport-placement inspection.
5. Drag and zoom while generation waits — canvas remains responsive.
