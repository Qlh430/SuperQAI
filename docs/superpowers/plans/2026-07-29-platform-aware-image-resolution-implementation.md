# Platform-Aware Image Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make image-resolution choices provider-aware, keep unsupported configured tiers visible but disabled, offer explicit legal OpenAI replacement sizes, and reject invalid requests server-side.

**Architecture:** Add one browser/Node-compatible pure rules module as the source of truth for OpenAI constraints and Gemini family matrices. `script.js` will render choices and helper text from that module; `server.js` will call the same rules before routing an image request. Exact OpenAI alternatives use an `exact:WIDTHxHEIGHT` UI value and are sent as an explicit pixel `size`.

**Tech Stack:** Vanilla JavaScript, Node.js 18+, CommonJS/UMD module, native HTML selects, existing Node check scripts, Playwright with installed Chrome for UI verification.

## Global Constraints

- OpenAI dimensions: longest edge `<= 3840`, both edges divisible by `16`, long/short ratio `<= 3`, total pixels `655,360..8,294,400`.
- OpenAI standard 4K is enabled only for `9:16`, `16:9`, and `21:9` in the current canvas ratio list.
- OpenAI `Auto` cannot promise `1K`, `2K`, or `4K`; it uses an explicit `auto` resolution choice.
- Gemini 3.1 Flash Image supports `512 / 1K / 2K / 4K`; Gemini 3 Pro Image supports `1K / 2K / 4K`; Gemini 2.5 Flash Image and Gemini 3.1 Flash Lite Image support only `1K`.
- Google `image_size` values use uppercase `K` and do not inherit OpenAI pixel limits.
- Provider-scoped client IDs remain the configuration key; models with the same upstream ID must not share capabilities.
- No unsupported standard tier may silently become another size or `auto`.

---

### Task 1: Shared compatibility rules

**Files:**
- Create: `image-resolution-rules.js`
- Create: `tools/check-image-resolution-rules.js`
- Modify: `index.html` to load the shared module before `script.js`
- Modify: `package.json` to include the new check

**Interfaces:**
- Produces: `ImageResolutionRules.getCompatibility(input)`, `getResolutionChoices(input)`, `parseResolutionChoice(value)`, `validateOpenAiDimensions(width, height)`, and `normalizeFamily(value)`.
- `input`: `{ platform, family, ratio, resolution, configuredResolutions }`.
- `getCompatibility` result: `{ supported, requestedSize, level, reason, alternative }`.

- [ ] **Step 1: Write the failing rules test**

```js
const assert = require("assert");
const rules = require("../image-resolution-rules");

assert.deepStrictEqual(
  rules.getCompatibility({ platform: "openai", ratio: "16:9", resolution: "4", configuredResolutions: ["1", "2", "4"] }),
  { supported: true, requestedSize: "3840x2160", level: "4", reason: "", alternative: null },
);

const square = rules.getCompatibility({
  platform: "openai",
  ratio: "1:1",
  resolution: "4",
  configuredResolutions: ["1", "2", "4"],
});
assert.strictEqual(square.supported, false);
assert.strictEqual(square.alternative.value, "exact:2880x2880");

assert.strictEqual(
  rules.getCompatibility({
    platform: "google",
    family: "gemini-3.1-flash-image",
    ratio: "1:1",
    resolution: "4",
    configuredResolutions: ["1", "2", "4"],
  }).supported,
  true,
);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node tools/check-image-resolution-rules.js`  
Expected: FAIL with `Cannot find module '../image-resolution-rules'`.

- [ ] **Step 3: Implement the pure rules module**

Use a UMD wrapper:

```js
(function exposeImageResolutionRules(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ImageResolutionRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createImageResolutionRules() {
  const OPENAI_MAX_EDGE = 3840;
  const OPENAI_MIN_PIXELS = 655360;
  const OPENAI_MAX_PIXELS = 8294400;
  const GOOGLE_LEVELS = {
    "gemini-3.1-flash-image": ["512", "1", "2", "4"],
    "gemini-3-pro-image": ["1", "2", "4"],
    "gemini-2.5-flash-image": ["1"],
    "gemini-3.1-flash-lite-image": ["1"],
  };
  const GOOGLE_RATIOS = {
    "gemini-3.1-flash-image": ["1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9"],
    default: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
  };
  return {
    getCompatibility,
    getResolutionChoices,
    normalizeFamily,
    parseResolutionChoice,
    validateOpenAiDimensions,
  };
});
```

`getResolutionChoices` must return configured standard levels even when unsupported:

```js
[
  { value: "1", label: "1K", disabled: false },
  { value: "2", label: "2K", disabled: false },
  { value: "4", label: "4K（1:1 不支持）", disabled: true },
  { value: "exact:2880x2880", label: "最大方图 2880×2880", disabled: false },
]
```

- [ ] **Step 4: Run the rules test and verify GREEN**

Run: `node tools/check-image-resolution-rules.js`  
Expected: `image resolution rules checks passed`.

- [ ] **Step 5: Add the browser script and package check**

Insert before `script.js` in `index.html`:

```html
<script src="image-resolution-rules.js"></script>
```

Append `&& node tools/check-image-resolution-rules.js` to `npm run check`.

### Task 2: Resolution picker states and explicit alternatives

**Files:**
- Modify: `script.js` around `fillCanvasNodeResolutionSelect`, `updateCanvasNodeResolutionAvailability`, output-size helpers, main image resolution helpers, and Gemini family normalization
- Modify: `styles.css` near `.canvas-node-resolution`
- Modify: `tools/check-custom-image-resolution-config.js`

**Interfaces:**
- Consumes: `window.ImageResolutionRules`.
- Produces: `getImageResolutionChoiceContext(model, size)`, `syncCanvasNodeResolutionState(node)`, and `getResolutionChoiceExactSize(value)`.

- [ ] **Step 1: Extend the failing UI contract test**

Evaluate `ImageResolutionRules.getResolutionChoices` and rendered option data for:

```js
assert.deepStrictEqual(openAiSquare.map(({ value, disabled }) => ({ value, disabled })), [
  { value: "1", disabled: false },
  { value: "2", disabled: false },
  { value: "4", disabled: true },
  { value: "exact:2880x2880", disabled: false },
]);
assert.deepStrictEqual(googleSquare.map(({ value, disabled }) => ({ value, disabled })), [
  { value: "1", disabled: false },
  { value: "2", disabled: false },
  { value: "4", disabled: false },
]);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node tools/check-custom-image-resolution-config.js`  
Expected: FAIL because disabled standard choices and exact alternatives are not rendered.

- [ ] **Step 3: Render all configured choices**

Replace filtering in `fillCanvasNodeResolutionSelect` with:

```js
const choices = ImageResolutionRules.getResolutionChoices(
  getImageResolutionChoiceContext(model, size),
);
for (const item of choices) {
  const option = document.createElement("option");
  option.value = item.value;
  option.textContent = item.label;
  option.disabled = item.disabled;
  option.dataset.reason = item.reason || "";
  select.append(option);
}
```

Preserve a previously selected disabled value when a ratio change makes it invalid. For a new node, choose the first enabled configured choice.

- [ ] **Step 4: Add visible helper text and generation blocking**

Create `.canvas-node-resolution-help` after the controls. `syncCanvasNodeResolutionState(node)` must:

```js
const compatibility = getCanvasNodeResolutionCompatibility(node);
const hasUnsupported = Array.from(resolution.options).some((option) => option.disabled);
help.hidden = compatibility.supported && !hasUnsupported;
help.textContent = compatibility.supported
  ? getDisabledResolutionSummary(resolution)
  : compatibility.reason;
run.disabled = !compatibility.supported;
```

Call the sync function after model, ratio, and resolution changes and before every request.

- [ ] **Step 5: Map exact alternatives without silent fallback**

For `exact:2880x2880`:

```js
function getResolutionChoiceExactSize(value) {
  return ImageResolutionRules.parseResolutionChoice(value).exactSize || "";
}
```

`getCanvasOutputSize` and the main image form must return the exact size. Quality remains `high` for an alternative originating from the configured 4K tier, but the visible label stays the exact dimensions.

- [ ] **Step 6: Add styles**

```css
.canvas-node-resolution-help {
  grid-column: 1 / -1;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.35;
}

.canvas-node-resolution-help.is-error {
  color: #b45309;
}
```

- [ ] **Step 7: Run the focused test and verify GREEN**

Run: `node tools/check-custom-image-resolution-config.js`  
Expected: `custom image resolution configuration checks passed`.

### Task 3: Server-side validation and provider-specific request mapping

**Files:**
- Modify: `server.js` near imports, `handleImages`, family normalization, GPT Image size normalization, and Nano Banana options
- Modify: `tools/check-image-resolution-rules.js`
- Modify: `tools/check-custom-image-resolution-config.js`

**Interfaces:**
- Consumes: `require("./image-resolution-rules")`.
- Produces: `validateImageOutputRequest(model, size, resolution)` returning the shared compatibility result or throwing an error with `code` and `alternative`.

- [ ] **Step 1: Add failing HTTP regression cases**

Against a temporary server configuration:

```js
const invalid = await postImages({
  model: openAiClientId,
  size: "1:1",
  resolution: "4k",
  prompt: "test",
});
assert.strictEqual(invalid.status, 400);
assert.strictEqual(invalid.body.code, "IMAGE_SIZE_NOT_SUPPORTED");
assert.strictEqual(invalid.body.alternative, "2880x2880");
```

Also assert that a Google 3.1 Flash `1:1 / 4K` request passes local validation and reaches the mocked upstream with uppercase `image_size: "4K"`.

- [ ] **Step 2: Run the HTTP regression and verify RED**

Run: `node tools/check-custom-image-resolution-config.js`  
Expected: FAIL because `handleImages` does not validate provider-specific combinations.

- [ ] **Step 3: Validate before routing**

At the start of `handleImages`, after resolving the model:

```js
const compatibility = validateImageOutputRequest(
  model,
  payload.size || "auto",
  payload.resolution || "auto",
);
if (!compatibility.supported) {
  sendJson(res, 400, {
    error: compatibility.reason,
    code: "IMAGE_SIZE_NOT_SUPPORTED",
    alternative: compatibility.alternative?.exactSize || "",
  });
  return;
}
```

Exact pixel sizes are validated directly against the OpenAI constraints. `auto + auto` is accepted; `auto + 1K/2K/4K` is rejected for OpenAI.

- [ ] **Step 4: Correct Gemini family recognition**

Recognize `gemini-3.1-flash-lite-image` before the broader `3.1` check in both client and server normalization. Preserve the official family-specific resolution and ratio matrices.

- [ ] **Step 5: Preserve platform request semantics**

- OpenAI: send exact `size`; never convert invalid ratios to `auto`.
- Google: send `aspect_ratio` plus uppercase `image_size`.
- Unknown third-party platform: retain configured tiers and upstream error handling without applying another platform’s private limits.

- [ ] **Step 6: Run focused and full checks**

Run:

```text
node tools/check-image-resolution-rules.js
node tools/check-custom-image-resolution-config.js
npm run check
```

Expected: all commands exit `0`.

### Task 4: Browser verification and service restart

**Files:**
- Verify only; no new production files expected.

**Interfaces:**
- Consumes the running app at `http://127.0.0.1:3099`.
- Produces UI evidence for the approved specification.

- [ ] **Step 1: Run syntax and diff checks**

Run:

```text
node --check image-resolution-rules.js
node --check script.js
node --check server.js
git diff --check
```

Expected: all exit `0`.

- [ ] **Step 2: Restart the local server**

Stop only the process listening on port `3099`, then start `node server.js` hidden from the workspace. Confirm the new PID is listening.

- [ ] **Step 3: Verify UI states with headless Chrome**

Create a generator node in an isolated browser context and verify:

- OpenAI `1:1`: `4K（1:1 不支持）` disabled, `最大方图 2880×2880` enabled.
- OpenAI `16:9`: standard `4K` enabled.
- Google 3.1 Flash `1:1`: standard `4K` enabled and no OpenAI helper.
- wangwang1 remains `1K` only.
- No browser console errors.

- [ ] **Step 4: Run final checks**

Run: `npm run check`  
Expected: exit `0` and all focused check scripts report success.
