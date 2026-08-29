# Canvas Agent Image Resolution Intent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Canvas Agent reliably submit the requested image resolution, automatically adjust incompatible model/ratio combinations with a user-visible notice, and never treat a provider's lower-resolution response as a request-side failure.

**Architecture:** Normalize image-resolution intent at the Canvas Agent tool boundary, then perform a second Agent-only compatibility preflight immediately before a paid node run. Reuse the existing `ImageResolutionRules` and `normalizeCanvasAgentImageRequest` functions so manual canvas generation and rendering remain unchanged. Browser verification inspects the outgoing `/api/images` payload and deliberately allows a lower-resolution fixture response.

**Tech Stack:** Browser JavaScript, CommonJS/UMD modules, Node.js `assert`, Playwright browser regression tests.

## Global Constraints

- Only Canvas Agent resolution parsing, Agent node synchronization, Agent generation preflight, and Agent completion messaging may change.
- Do not modify canvas rendering, zoom, virtualization, connection paths, layout, manual node generation, or provider configuration.
- Incompatible parameters are adjusted automatically and generation continues without a second confirmation.
- Request correctness is verified from the outbound request payload; provider return dimensions are recorded and displayed but are not required to match the requested tier.
- Preserve all unrelated staged, unstaged, and untracked user changes.

---

### Task 1: Normalize Canvas Agent Resolution Intent

**Files:**
- Modify: `canvas-agent-tool-adapters.js`
- Modify: `canvas-agent-capabilities.js`
- Test: `tools/check-canvas-agent-tool-adapters.js`
- Test: `tools/check-canvas-agent-capabilities.js`

**Interfaces:**
- Consumes: Agent tool arguments containing `prompt`, `resolution`, and image-node `changes`.
- Produces: `normalizeImageResolutionIntent(resolution, prompt) -> "" | "512" | "1" | "2" | "4" | "auto" | "exact:WxH"` and normalized Agent image arguments.

- [ ] **Step 1: Write the failing adapter tests**

Add assertions proving that `2K`, `2k`, and prompt-only `2K清晰度` become `resolution: "2"`, while an explicit structured value overrides prompt inference and unrelated text does not infer a resolution.

```js
await adapters.update_node({
  node_id: "1",
  changes: { prompt: "竖版构图，2K清晰度", size: "9:16", resolution: null },
}, context);
assert.equal(calls.at(-1).args[1].resolution, "2");

await adapters.update_node({
  node_id: "1",
  changes: { prompt: "4K清晰度", resolution: "1K" },
}, context);
assert.equal(calls.at(-1).args[1].resolution, "1");
```

- [ ] **Step 2: Run the adapter test and verify RED**

Run: `node tools/check-canvas-agent-tool-adapters.js`

Expected: FAIL because `resolution` remains `null` or an unnormalized alias.

- [ ] **Step 3: Implement minimal Agent-boundary normalization**

In `canvas-agent-tool-adapters.js`, canonicalize resolution aliases for `create_image_node`, `generate_image_to_gallery`, `update_node`, and `update_nodes`. Only infer from prompt when the structured field is empty and the prompt contains an explicit resolution token adjacent to `K`, `清晰度`, `分辨率`, or `resolution`.

```js
function normalizeImageResolutionIntent(value, prompt = "") {
  const explicit = normalizeImageResolutionValue(value);
  if (explicit) return explicit;
  return inferImageResolutionFromPrompt(prompt);
}
```

Update the capability descriptions to tell the model that `512 / 1 / 2 / 4 / auto` are the canonical values and that a user request for 2K must be sent as `"2"`.

- [ ] **Step 4: Run focused unit checks and verify GREEN**

Run: `node tools/check-canvas-agent-tool-adapters.js`

Run: `node tools/check-canvas-agent-capabilities.js`

Expected: both commands exit 0 and print their existing pass messages.

- [ ] **Step 5: Inspect scope instead of committing overlapping user files**

Run: `git diff -- canvas-agent-tool-adapters.js canvas-agent-capabilities.js tools/check-canvas-agent-tool-adapters.js tools/check-canvas-agent-capabilities.js`

Expected: only Agent resolution schema/normalization and their tests are added; no canvas rendering code changes.

---

### Task 2: Add Agent-Only Compatibility Preflight and Adjustment Notice

**Files:**
- Modify: `script.js`
- Modify: `canvas-agent-ui.js`
- Test: `tools/check-canvas-agent-browser.js`

**Interfaces:**
- Consumes: current image node model, ratio, canonical resolution, and `canvasImageModelCandidates` capability metadata.
- Produces: `parameter_adjustment` with `requested`, `applied`, and human-readable `message`; the node select, dataset, persistence data, and request builder all see the same applied values.

- [ ] **Step 1: Write the failing browser scenarios**

Extend the mocked Agent route with two terminal flows:

```js
// Existing 1K node updated from prompt-only intent.
update_node({ prompt: "桃子竖图，2K清晰度", size: "9:16", resolution: null });
run_canvas_node({ node_id });

// 1:1 4K on OpenAI resolves to the rule-provided exact compatible size.
update_node({ prompt: "方图，4K清晰度", size: "1:1", resolution: "4K" });
run_canvas_node({ node_id });
```

Capture every `/api/images` request body. Assert the 2K flow sends `size: "1152x2048"` and `resolution: "2k"`. Assert the incompatible 4K flow sends the exact compatible size returned by `ImageResolutionRules` and displays an automatic-adjustment notice without opening `#canvasAgentApproval`.

The route should still return the existing 512px SVG fixture, proving the test validates the request rather than enforcing response dimensions.

- [ ] **Step 2: Run the browser test and verify RED**

Run: `node tools/check-canvas-agent-browser.js`

Expected: FAIL because the prompt-only 2K update submits 1K and the incompatible 4K request stops instead of adjusting.

- [ ] **Step 3: Implement Agent-only preflight**

Before `runAgentCanvasNodeWithGuard` calls `runCanvasImageEdit`, resolve the current candidate and call `normalizeCanvasAgentImageRequest` with the node's ratio and resolution select value. Order configured fallback tiers from highest not exceeding the requested tier to lowest. If the applied pair differs, call `applyAgentCanvasNodeChanges` before the paid request and retain an adjustment object.

```js
const adjustment = await prepareAgentCanvasImageParameters(node, context);
generated = await runCanvasImageEdit(node, { guard, autoFailover: true });
return {
  ...result,
  ...(adjustment ? { parameter_adjustment: adjustment } : {}),
};
```

Use an exact compatibility alternative before lowering the tier. If no compatible request exists, return a specific unsupported-parameter error before any paid request.

- [ ] **Step 4: Display the adjustment without another confirmation**

In `executeCanvasAgentTerminalToolRun`, include `result.parameter_adjustment.message` in the completion message before the standard successful-generation text. Do not call the approval flow.

```js
const adjustmentMessage = String(result.parameter_adjustment?.message || "").trim();
addCanvasAgentMessage("assistant", adjustmentMessage
  ? `${adjustmentMessage}\n\n图片已生成并加入画布图集。`
  : "图片已生成并加入画布图集。");
```

- [ ] **Step 5: Run browser and syntax checks and verify GREEN**

Run: `node --check script.js`

Run: `node --check canvas-agent-ui.js`

Run: `node tools/check-canvas-agent-browser.js`

Expected: all commands exit 0; the browser check confirms one paid request per flow, correct outbound parameters, no approval prompt, and successful handling of the low-resolution fixture response.

- [ ] **Step 6: Inspect scope instead of committing overlapping user files**

Run: `git diff -- script.js canvas-agent-ui.js tools/check-canvas-agent-browser.js`

Expected: changes are confined to Canvas Agent parameter preparation, completion copy, and browser assertions.

---

### Task 3: Regression and Portable Entry Verification

**Files:**
- Verify only: `package.json`
- Verify only: `build-portable.bat`
- Verify only: files modified in Tasks 1 and 2

**Interfaces:**
- Consumes: completed Task 1 and Task 2 implementation.
- Produces: verification evidence that Agent behavior is fixed without regressing canvas core behavior or the user's portable build entry.

- [ ] **Step 1: Run the focused Agent suite**

Run: `node tools/check-canvas-agent-tool-adapters.js`

Run: `node tools/check-canvas-agent-capabilities.js`

Run: `node tools/check-canvas-agent-browser.js`

Expected: all focused checks exit 0.

- [ ] **Step 2: Run canvas isolation regressions**

Run: `node tools/check-canvas-agent-core.js`

Run: `node tools/check-canvas-agent-ui.js`

Run: `node tools/check-canvas-seamless-zoom-ui.js`

Run: `node tools/check-canvas-engine-contract.js`

Expected: all checks exit 0, showing the Agent-only change did not alter canvas zoom, node layout, or the canvas engine contract used by connections.

- [ ] **Step 3: Run the project verification command**

Run: `npm run check`

Expected: exit 0 with no failing check.

- [ ] **Step 4: Verify the portable build entry without creating a package**

Run: `node tools/check-portable-package.js`

Run: `Select-String -LiteralPath .\build-portable.bat -Pattern "npm|node|script.js|canvas-agent"`

Expected: portable-package validation exits 0 and the batch entry still includes the application assets through its existing packaging flow. Do not run the actual packaging build because the user will do that later.

- [ ] **Step 5: Review the final diff**

Run: `git diff --check`

Run: `git status --short`

Expected: no whitespace errors; pre-existing unrelated changes remain present and untouched.
