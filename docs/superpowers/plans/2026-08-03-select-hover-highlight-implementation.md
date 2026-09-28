# Model Select Hover Highlight Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Give unselected model options a clear theme-aware hover/focus color while keeping the selected option unchanged and adding no animation.

**Architecture:** Keep the native `appearance: base-select` dropdown. Add a dark-theme override with enough specificity to beat the existing dark option base rule, scoped to `option:not(:checked)` so the selected accent color is preserved. Extend the existing CSS regression check and validate the computed styles in the running app.

**Tech Stack:** HTML, CSS custom properties, Node.js regression scripts, Playwright browser QA

---

### Task 1: Add the theme-aware hover/focus state

**Files:**
- Modify: `tools/check-select-theme-colors.js`
- Modify: `styles.css`
- Modify: `index.html`
- Create: `artifacts/design-qa/model-select-hover-highlight.png`

**Step 1: Write the failing regression test**

Extend `tools/check-select-theme-colors.js` to require a dark-theme rule for unselected option hover and keyboard focus. Assert that it uses `var(--accent-soft)` and `var(--ink)`, and that the rule contains no transition, transform, translation, or shadow.

**Step 2: Run the focused test to verify it fails**

Run: `node tools/check-select-theme-colors.js`

Expected: FAIL because the dark unselected hover/focus override does not yet exist.

**Step 3: Implement the minimal CSS change**

Add a dark-theme rule after the existing dark option/checked rules:

```css
:root[data-theme="dark"] .upscale-size-select option:not(:checked):hover,
:root[data-theme="dark"] .upscale-size-select option:not(:checked):focus-visible,
:root[data-theme="dark"] select option:not(:checked):hover,
:root[data-theme="dark"] select option:not(:checked):focus-visible {
  background: var(--accent-soft);
  color: var(--ink);
}
```

Do not add animation, movement, scaling, shadows, or custom dropdown behavior. Update the stylesheet cache key in `index.html` and its regression assertion.

**Step 4: Run the focused test to verify it passes**

Run: `node tools/check-select-theme-colors.js`

Expected: PASS.

**Step 5: Verify the real interface**

Open the image-generation model selector in dark mode, hover an unselected option, and verify its computed background resolves from `--accent-soft`. Hover the selected option and verify it stays on `--accent`. Save a screenshot to `artifacts/design-qa/model-select-hover-highlight.png`.

**Step 6: Run full verification**

Run: `npm run check`

Run: `git diff --check`

Expected: both pass.
