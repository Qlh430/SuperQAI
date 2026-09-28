# Auto Resolution Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically select “自动尺寸” when an OpenAI image ratio becomes `Auto`, while restoring a valid concrete tier when the user returns to a specific ratio.

**Architecture:** Add one small pure selection helper in `script.js` and use it in both canvas-node and main-form resolution rendering. Store the last standard tier on each resolution select’s dataset so Auto does not destroy the user’s previous concrete choice.

**Tech Stack:** Vanilla JavaScript, existing native `<select>` controls, Node.js assertion scripts, Playwright browser verification.

## Global Constraints

- Only OpenAI image uses forced `Auto → auto` synchronization.
- Google nano-banana keeps its existing family-specific behavior.
- `自动尺寸` remains visible and selected; configured standard tiers remain visible but disabled.
- Switching back to a specific ratio restores the last legal standard tier or the first legal configured standard tier.
- Exact replacement sizes are never selected automatically.
- Server behavior remains `auto + auto` accepted and `auto + 1K/2K/4K` rejected.

---

### Task 1: Shared resolution-choice selection behavior

**Files:**
- Modify: `script.js` near `fillCanvasNodeResolutionSelect` and `refreshImageResolutionOptions`
- Modify: `tools/check-custom-image-resolution-config.js`

**Interfaces:**
- Produces: `pickImageResolutionChoiceValue(choices, preferred, context, remembered)` returning `{ value, remembered }`.
- Consumes: choices returned by `ImageResolutionRules.getResolutionChoices(context)`.

- [ ] **Step 1: Write the failing pure behavior test**

Add extraction and assertions to `tools/check-custom-image-resolution-config.js`:

```js
const pickerSource = extractFunction(CLIENT_SOURCE, "pickImageResolutionChoiceValue");
const pickerContext = {};
vm.runInNewContext(pickerSource, pickerContext);

const autoChoices = [
  { value: "auto", disabled: false, level: "auto" },
  { value: "1", disabled: true, level: "1" },
  { value: "2", disabled: true, level: "2" },
  { value: "4", disabled: true, level: "4" },
];
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(pickerContext.pickImageResolutionChoiceValue(
    autoChoices,
    "1",
    { platform: "openai", ratio: "auto" },
    "",
  ))),
  { value: "auto", remembered: "1" },
);

const ratioChoices = [
  { value: "1", disabled: false, level: "1" },
  { value: "2", disabled: false, level: "2" },
  { value: "4", disabled: true, level: "4" },
  { value: "exact:2880x2880", disabled: false, level: "4" },
];
assert.deepStrictEqual(
  JSON.parse(JSON.stringify(pickerContext.pickImageResolutionChoiceValue(
    ratioChoices,
    "auto",
    { platform: "openai", ratio: "1:1" },
    "2",
  ))),
  { value: "2", remembered: "2" },
);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node tools/check-custom-image-resolution-config.js`

Expected: FAIL with `Missing function pickImageResolutionChoiceValue`.

- [ ] **Step 3: Implement the minimal pure helper**

Add to `script.js`:

```js
function pickImageResolutionChoiceValue(choices, preferred, context, remembered = "") {
  const items = Array.isArray(choices) ? choices : [];
  const preferredValue = String(preferred || "").trim().toLowerCase();
  const rememberedValue = String(remembered || "").trim().toLowerCase();
  const isStandard = (value) => ["512", "1", "2", "4"].includes(value);
  let nextRemembered = rememberedValue;

  if (context?.platform === "openai" && context?.ratio === "auto") {
    if (isStandard(preferredValue)) nextRemembered = preferredValue;
    const automatic = items.find((item) => item.value === "auto" && !item.disabled);
    return { value: automatic?.value || "", remembered: nextRemembered };
  }

  const candidate = preferredValue === "auto" ? nextRemembered : preferredValue;
  const matched = items.find((item) => item.value === candidate && !item.disabled);
  const fallback = items.find((item) => isStandard(item.value) && !item.disabled)
    || items.find((item) => !item.disabled);
  const value = matched?.value || fallback?.value || "";
  if (isStandard(value)) nextRemembered = value;
  return { value, remembered: nextRemembered };
}
```

- [ ] **Step 4: Use the helper in both option renderers**

In `fillCanvasNodeResolutionSelect` and `refreshImageResolutionOptions`:

```js
const context = getImageResolutionChoiceContext(model, size);
const choices = ImageResolutionRules.getResolutionChoices(context);
select.innerHTML = "";
choices.forEach((item) => {
  const option = document.createElement("option");
  option.value = item.value;
  option.textContent = item.label;
  option.disabled = Boolean(item.disabled);
  option.dataset.reason = item.reason || "";
  option.dataset.level = item.level || getResolutionChoiceLevel(item.value);
  select.append(option);
});
const picked = pickImageResolutionChoiceValue(
  choices,
  preferred,
  context,
  select.dataset.previousConcreteResolution,
);
select.value = picked.value;
select.dataset.previousConcreteResolution = picked.remembered;
```

In the main-form implementation, use the complete block below:

```js
const select = imageResolutionInput;
const context = getImageResolutionChoiceContext(model, size);
const choices = ImageResolutionRules.getResolutionChoices(context);
select.innerHTML = "";
choices.forEach((item) => {
  const option = document.createElement("option");
  option.value = item.value;
  option.textContent = item.label;
  option.disabled = Boolean(item.disabled);
  option.dataset.reason = item.reason || "";
  option.dataset.level = item.level || getResolutionChoiceLevel(item.value);
  select.append(option);
});
const picked = pickImageResolutionChoiceValue(
  choices,
  preferred,
  context,
  select.dataset.previousConcreteResolution,
);
select.value = picked.value;
select.dataset.previousConcreteResolution = picked.remembered;
```

- [ ] **Step 5: Remember manual standard-tier changes**

Add:

```js
function rememberConcreteImageResolution(select) {
  const value = String(select?.value || "");
  if (["512", "1", "2", "4"].includes(value)) {
    select.dataset.previousConcreteResolution = value;
  }
}
```

Call it from canvas-node and main-form resolution change/input handling.

- [ ] **Step 6: Run the focused test and verify GREEN**

Run: `node tools/check-custom-image-resolution-config.js`

Expected: `custom image resolution configuration checks passed`.

### Task 2: Browser behavior and regression verification

**Files:**
- Verify: `script.js`
- Verify: `server.js`
- Verify: `tools/check-custom-image-resolution-config.js`

**Interfaces:**
- Consumes: the selection helper and existing resolution compatibility rules.
- Produces: verified UI state for node and main-form Auto transitions.

- [ ] **Step 1: Run syntax and complete checks**

Run:

```text
node --check script.js
git diff --check
npm run check
```

Expected: all commands exit `0`.

- [ ] **Step 2: Restart the local service**

Stop only the process listening on port `3099`, start `node server.js` hidden from the project root, and verify `/api/image-models` returns HTTP `200`.

- [ ] **Step 3: Verify the canvas node in headless Chrome**

For an OpenAI image node:

1. Select `1:1` and `1K`.
2. Change the ratio to `Auto`.
3. Assert the selected resolution is `auto`.
4. Assert `自动尺寸` is enabled and selected.
5. Assert `1K / 2K / 4K` remain visible and disabled.
6. Assert the Generate button is enabled and the help text is not an error.
7. Change the ratio back to `1:1`.
8. Assert `1K` is restored.

- [ ] **Step 4: Verify main form and Google non-regression**

- Repeat the OpenAI Auto transition against `#imageSize` and `#imageResolution`.
- Select a Google Gemini 3.1 Flash image model and assert its resolution selection is not forced to `auto`.
- Assert there are no JavaScript page errors.

- [ ] **Step 5: Run the final check**

Run: `npm run check`

Expected: exit `0`, with both image-resolution check scripts reporting success.
