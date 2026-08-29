# Canvas Agent Discussion and Execution Intent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make explicit image requests generate immediately, make explicit discussion requests incapable of starting image work, and reduce the existing-node choice card to “修改后生成” and “新建并生成”.

**Architecture:** Add one pure intent classifier in `canvas-agent-core.js` and store its result on each run. The UI uses that trusted run intent as a second execution-layer guard before approval or tool execution, while the existing direct-image allowance continues to provide the fast path. Keep node-choice rendering and its two follow-up prompts in `canvas-agent-ui.js`; update the canvas API and capability description to expose only the two supported choices.

**Tech Stack:** Browser JavaScript, Node.js assertion scripts, Playwright browser regression, existing Canvas Agent MCP/tool adapter architecture.

## Global Constraints

- “想要一张”“要一张”“直接生成”“生成”“出图”“画一张”“做一张” or synonyms mean immediate execution without a prompt/parameter preview.
- “先讨论”“先聊”“先给我提示词”“先看参数”“先优化提示词”“不要生成”“先别出图”“等我确认” or synonyms mean discussion only.
- Discussion/negation takes precedence over execution words.
- A discussion-only turn must not call paid image tools or create image-generation nodes/results.
- After discussion, a new explicit “按这个生成”“开始生成”“直接出图” turn executes normally.
- The existing-node card contains exactly “修改后生成” and “新建并生成”.
- Do not change manual canvas generation controls, canvas rendering/zoom/virtualization/connections/storage, image routing/proxy behavior, provider output-size interpretation, or Agent resolution auto-adjustment.
- Do not create a portable package; only keep `build-portable.bat` statically valid.

---

### Task 1: Pure Image Intent Classification and Discussion Guard

**Files:**
- Modify: `canvas-agent-core.js:14-90, 395-445`
- Test: `tools/check-canvas-agent-core.js:40-100`

**Interfaces:**
- Produces: `classifyImageGenerationIntent(prompt: unknown): "execute" | "discussion" | "neutral"`.
- Produces: `shouldBlockCanvasToolForDiscussion(intent: string, toolName: unknown): boolean`.
- Changes: `createRunState(input).imageGenerationIntent` stores the classifier output.
- Consumes: `CanvasAgentCapabilities.getRisk(toolName, args)` remains unchanged.

- [ ] **Step 1: Write failing intent-classification tests**

Add assertions before changing production code:

```js
assert.equal(core.classifyImageGenerationIntent("我想要一张桃子图片"), "execute");
assert.equal(core.classifyImageGenerationIntent("直接生成一张桃子图片"), "execute");
assert.equal(core.classifyImageGenerationIntent("就按这个方案生成"), "execute");
assert.equal(core.classifyImageGenerationIntent("先讨论怎么生成桃子图片，不要出图"), "discussion");
assert.equal(core.classifyImageGenerationIntent("先给我提示词和 9:16、2K 参数，等我确认"), "discussion");
assert.equal(core.classifyImageGenerationIntent("桃子图片适合什么背景？"), "neutral");
assert.equal(core.createRunState({ prompt: "我想要一张桃子图片" }).imageGenerationIntent, "execute");
assert.equal(core.createRunState({ prompt: "先讨论生成方案，不要生成" }).imageGenerationIntent, "discussion");
assert.equal(core.shouldBlockCanvasToolForDiscussion("discussion", "generate_image_to_gallery"), true);
assert.equal(core.shouldBlockCanvasToolForDiscussion("discussion", "create_image_node"), true);
assert.equal(core.shouldBlockCanvasToolForDiscussion("discussion", "request_image_node_choice"), true);
assert.equal(core.shouldBlockCanvasToolForDiscussion("discussion", "run_canvas_node"), true);
assert.equal(core.shouldBlockCanvasToolForDiscussion("execute", "generate_image_to_gallery"), false);
```

- [ ] **Step 2: Run the core test and verify RED**

Run:

```powershell
node .\tools\check-canvas-agent-core.js
```

Expected: FAIL because `classifyImageGenerationIntent` is not exported/defined.

- [ ] **Step 3: Implement the minimal pure classifier and guard**

Add constants and functions in `canvas-agent-core.js`:

```js
const DISCUSSION_IMAGE_TOOL_NAMES = new Set([
  "create_image_node",
  "generate_image_to_gallery",
  "request_image_node_choice",
  "run_canvas_node",
]);

function classifyImageGenerationIntent(prompt) {
  const text = String(prompt || "").trim();
  if (!text) return "neutral";
  const discussion = /不要生成|别生成|先不生成|暂不生成|不要出图|先别出图|只讨论|先讨论|先聊|先给我提示词|先看参数|先优化提示词|等我确认|先确认/.test(text);
  if (discussion) return "discussion";
  if (/怎么|如何|为什么|能不能|是否|可以吗|可不可以|[?？]\s*$/.test(text)) return "neutral";
  const directImage = /(想要|要|生成|画|绘制|出图|做)(?:一张|1\s*张|一个)?[^。！？]{0,28}(图|图片|海报|主视觉|插画)/.test(text);
  const contextualExecute = /(?:就|直接|现在|开始|请)?按[^。！？]{0,24}(方案|方向|刚才|上面|这个)[^。！？]{0,16}(生成|出图|做)/.test(text);
  return directImage || contextualExecute ? "execute" : "neutral";
}

function shouldBlockCanvasToolForDiscussion(intent, toolName) {
  return intent === "discussion" && DISCUSSION_IMAGE_TOOL_NAMES.has(String(toolName || ""));
}
```

Refactor `getDirectImageGenerationAllowance(prompt)` to first require `classifyImageGenerationIntent(prompt) === "execute"`, then retain the existing single-image limits for multi-image/batch requests. Store the classification as `imageGenerationIntent` in `createRunState` and export both new functions.

- [ ] **Step 4: Run the core test and verify GREEN**

Run:

```powershell
node .\tools\check-canvas-agent-core.js
```

Expected: `Canvas agent core checks passed.`

- [ ] **Step 5: Commit the pure intent boundary**

```powershell
git add canvas-agent-core.js tools/check-canvas-agent-core.js
git commit -m "fix: separate agent discussion from image execution"
```

### Task 2: Enforce Discussion-Only Turns Before Tool Execution

**Files:**
- Modify: `canvas-agent-ui.js:930-1010`
- Test: `tools/check-canvas-agent-ui.js:135-205`
- Test: `tools/check-canvas-agent-ui-browser.js:1-560`

**Interfaces:**
- Consumes: `state.currentRun.imageGenerationIntent` from Task 1.
- Consumes: `CanvasAgentCore.shouldBlockCanvasToolForDiscussion(intent, toolName)` from Task 1.
- Produces: blocked tool output `{ ok: false, code: "discussion_only", error: "本轮只讨论提示词和参数，未执行图片生成。" }`.

- [ ] **Step 1: Write failing source and browser assertions**

In `tools/check-canvas-agent-ui.js`, require the UI to call the discussion guard and emit `discussion_only`.

In `tools/check-canvas-agent-ui-browser.js`, add a turn whose user prompt is `先讨论怎么生成桃子图片，不要出图` and whose mocked model response incorrectly requests `generate_image_to_gallery`. Assert:

```js
assert.equal(imageGenerationRequests, requestsBeforeDiscussion);
assert.equal(await page.locator("#canvasPlane .canvas-node-image").count(), nodesBeforeDiscussion);
assert.equal(await page.locator("#canvasAgentApproval:not([hidden])").count(), 0);
```

Then submit `按这个生成` in a new run and assert the mocked paid call increases `imageGenerationRequests` exactly once.

- [ ] **Step 2: Run the UI checks and verify RED**

Run:

```powershell
node .\tools\check-canvas-agent-ui.js
```

Run the browser check against a local server on port 3113:

```powershell
$env:PORT='3113'; node .\server.js
node .\tools\check-canvas-agent-ui-browser.js
```

Expected: source assertion fails first because no discussion execution guard exists; after adding only the source assertion, the browser scenario would show an approval or image request instead of a discussion-only continuation.

- [ ] **Step 3: Add the pre-approval discussion guard**

In `handleCanvasAgentTurn`, before calculating terminal-tool and approval behavior, partition the calls using the pure guard. If any image execution call is blocked, do not execute any call from that model turn. Record each blocked result using the existing completed-call/tool-step helpers and continue the Agent conversation with outputs shaped as:

```js
{
  call_id: call.call_id,
  output: {
    ok: false,
    tool: call.name,
    code: "discussion_only",
    error: "本轮只讨论提示词和参数，未执行图片生成。",
  },
}
```

The blocked branch must run before `buildApprovalPlan`, so it cannot show a paid confirmation. It must call `continueCanvasAgentWithToolOutputs` so the model can answer with the requested prompt/parameter discussion.

- [ ] **Step 4: Run source and browser tests and verify GREEN**

Run:

```powershell
node .\tools\check-canvas-agent-ui.js
node .\tools\check-canvas-agent-ui-browser.js
```

Expected: both checks pass; the discussion scenario makes zero image requests and “按这个生成” makes exactly one.

- [ ] **Step 5: Commit the discussion execution guard**

```powershell
git add canvas-agent-ui.js tools/check-canvas-agent-ui.js tools/check-canvas-agent-ui-browser.js
git commit -m "fix: block image tools during agent discussion"
```

### Task 3: Reduce Existing-Node Choice to Two Actions

**Files:**
- Modify: `canvas-agent-ui.js:1210-1285`
- Modify: `script.js:14270-14310`
- Modify: `canvas-agent-capabilities.js:70-82`
- Modify: `index.html:613-615`
- Test: `tools/check-canvas-agent-ui.js:180-195`
- Test: `tools/check-canvas-agent-ui-browser.js:440-535`

**Interfaces:**
- Changes: `requestAgentImageNodeChoice(...).options` becomes `["update", "new"]`.
- Changes: `.canvas-agent-image-choice` renders exactly two `[data-agent-image-choice]` buttons.
- Preserves: `state.nextPaidAllowances.run_canvas_node = 1` for update and `generate_image_to_gallery = 1` for new.

- [ ] **Step 1: Write failing two-choice tests**

Change the browser assertion from three choices to two and assert labels:

```js
assert.equal(await page.locator("[data-agent-image-choice]").count(), 2);
assert.deepEqual(
  await page.locator("[data-agent-image-choice] b").allTextContents(),
  ["修改后生成", "新建并生成"],
);
assert.equal(await page.locator('[data-agent-image-choice="rerun"]').count(), 0);
```

Update the source test to reject a `rerun` choice/prompt and require `options: ["update", "new"]`.

- [ ] **Step 2: Run the focused UI tests and verify RED**

Run:

```powershell
node .\tools\check-canvas-agent-ui.js
node .\tools\check-canvas-agent-ui-browser.js
```

Expected: FAIL because the existing card still contains `rerun` and renders three buttons.

- [ ] **Step 3: Remove rerun and keep the two existing paid paths**

In `showCanvasAgentImageChoice`, render only:

```js
[
  ["update", "修改后生成", "替换为本次需求"],
  ["new", "新建并生成", "保留当前节点"],
]
```

Remove `rerun` from the `prompts` object in `chooseCanvasAgentImageAction`. Keep the current allowance assignment:

```js
state.nextPaidAllowances = choice === "new"
  ? { generate_image_to_gallery: 1 }
  : { run_canvas_node: 1 };
```

Change the canvas API result to `options: ["update", "new"]` and update the capability description to “修改后生成或新建生成”. Bump only the Agent cache-busting query values in `index.html` to `20260829-agent-discussion-intent`.

- [ ] **Step 4: Verify both actions in the real browser**

For “修改后生成”, have the mocked model return `update_node` followed by `run_canvas_node`; assert the existing node ID remains, its prompt becomes the suggested prompt, and exactly one image request occurs.

For “新建并生成”, reopen the choice card, click `new`, have the mocked model return `generate_image_to_gallery`; assert the original node still exists, a new generator exists, and exactly one additional image request occurs.

Run:

```powershell
node .\tools\check-canvas-agent-ui.js
node .\tools\check-canvas-agent-ui-browser.js
```

Expected: both checks pass with no visible second approval.

- [ ] **Step 5: Commit the two-action choice card**

```powershell
git add canvas-agent-ui.js script.js canvas-agent-capabilities.js index.html tools/check-canvas-agent-ui.js tools/check-canvas-agent-ui-browser.js
git commit -m "fix: simplify agent image node choices"
```

### Task 4: Regression and Portable-Batch Verification

**Files:**
- Verify: `canvas-agent-core.js`
- Verify: `canvas-agent-ui.js`
- Verify: `script.js`
- Verify: `canvas-agent-capabilities.js`
- Verify: `build-portable.bat`
- Verify: `tools/check-portable-package.js`

**Interfaces:**
- Consumes all behavior from Tasks 1-3.
- Produces no new runtime interface.

- [ ] **Step 1: Run focused Agent and resolution tests**

```powershell
node --check .\canvas-agent-core.js
node --check .\canvas-agent-ui.js
node --check .\script.js
node .\tools\check-canvas-agent-core.js
node .\tools\check-canvas-agent-capabilities.js
node .\tools\check-canvas-agent-ui.js
node .\tools\check-canvas-agent-browser.js
node .\tools\check-canvas-agent-image-failover.js
node .\tools\check-image-resolution-rules.js
```

Expected: every command exits `0` and prints its corresponding `checks passed` message.

- [ ] **Step 2: Run the complete project check**

```powershell
npm run check
```

Expected: exit `0`, including Canvas Agent, model routing, proxy, resolution, canvas virtualization, and storage checks.

- [ ] **Step 3: Verify the portable batch statically without packaging**

Read script references from `index.html` and verify each root script is listed in `build-portable.bat`, while scripts under `assets/` are covered by its directory copy. Also run:

```powershell
node --check .\tools\check-portable-package.js
```

Expected: no missing runtime script and syntax exit `0`. Do not run `build-portable.bat` and do not create `dist/AI-Studio-Portable`.

- [ ] **Step 4: Inspect scope and whitespace**

```powershell
git diff --check
git diff -- canvas-agent-core.js canvas-agent-ui.js script.js canvas-agent-capabilities.js index.html tools/check-canvas-agent-core.js tools/check-canvas-agent-ui.js tools/check-canvas-agent-ui-browser.js
```

Expected: no whitespace errors; implementation diff remains inside the approved Agent scope.
