# Theme-Aware Select Colors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make native select options and their selected state follow the active color palette instead of using hard-coded blue colors.

**Architecture:** Preserve the existing native `<select>` controls and `appearance: base-select` enhancement. Replace legacy hard-coded option colors with the existing palette tokens and lock the behavior with a focused source regression plus browser-computed-style checks.

**Tech Stack:** HTML/CSS custom properties, Node.js source-contract checks, Playwright browser QA.

## Global Constraints

- Do not change model data, selection events, saved preferences, control sizing, or keyboard behavior.
- Do not add dependencies or replace the native select control.
- Use `--field`, `--ink`, `--accent`, and `--accent-contrast` for palette-aware colors.

---

### Task 1: Theme-aware native select options

**Files:**
- Create: `tools/check-select-theme-colors.js`
- Modify: `styles.css:2732-2742,2860-2870`
- Modify: `package.json:7`
- Modify: `index.html:16`

**Interfaces:**
- Consumes: CSS palette tokens declared on `:root[data-palette]`.
- Produces: native select option colors whose computed values track the active palette.

- [ ] **Step 1: Write the failing source regression**

Create `tools/check-select-theme-colors.js` that reads `styles.css` and `index.html`, extracts the final legacy option rules, rejects `#60a5fa`, `#07111f`, and `#101827`, and requires these declarations:

```css
background: var(--field);
color: var(--ink);
background: var(--accent);
color: var(--accent-contrast, #202020);
```

Also require the stylesheet cache key `styles.css?v=20260803-select-theme-colors`.

- [ ] **Step 2: Run the regression and verify RED**

Run: `node tools/check-select-theme-colors.js`

Expected: FAIL because the current dark option rules contain hard-coded blue and navy values.

- [ ] **Step 3: Implement the minimal CSS fix**

Update the common and dark option rules to use:

```css
.upscale-size-select option,
select option {
  background: var(--field);
  color: var(--ink);
}

.upscale-size-select option:checked,
select option:checked {
  background: var(--accent);
  color: var(--accent-contrast, #202020);
}
```

Use the same declarations in the higher-specificity dark rule so it no longer overrides the palette-aware `base-select` rule. Update the stylesheet cache key and add the check to `precheck`.

- [ ] **Step 4: Verify GREEN and browser behavior**

Run:

```powershell
node tools/check-select-theme-colors.js
npm run check
git diff --check
```

Expected: all commands exit 0.

In Playwright, verify for dark `yellow-black` and `red-blue` palettes that the selected model option's computed background equals `--accent`, its color equals `--accent-contrast`, and the unselected option equals `--field`/`--ink`.

- [ ] **Step 5: Preserve workspace boundaries**

Do not stage production files because the repository contains unrelated user changes. Save a QA screenshot under `artifacts/design-qa/` and report the modified files and verification evidence.
