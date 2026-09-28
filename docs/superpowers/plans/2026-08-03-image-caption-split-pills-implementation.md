# Image Caption Split Pills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the online image result's full-width caption bar with two compact bottom-corner pills so the empty center no longer covers the image.

**Architecture:** Preserve the existing `figcaption` markup and button handlers. Turn `figcaption` into a transparent, non-interactive positioning layer, then position its first child and `.image-actions` as independent theme-aware pills at the lower left and lower right.

**Tech Stack:** CSS, Node.js assertion checks, Playwright browser QA

## Global Constraints

- Keep result number, dimensions, preview, and download behavior unchanged.
- Apply the split-pill layout only inside `#imageView`; do not change other tools' result cards.
- Keep both pills always visible.
- The transparent center must not intercept pointer input.
- Do not stage or commit production files in the existing dirty `main` workspace.

---

### Task 1: Split the full-width result caption into two compact pills

**Files:**
- Modify: `tools/check-image-preview-presentation.js`
- Modify: `styles.css:12646-12664`
- Modify: `styles.css:15948-15953`
- Modify: `index.html:16`
- Create: `artifacts/design-qa/image-caption-split-pills.png`

**Interfaces:**
- Consumes: existing `figcaption > span:first-child`, `.image-actions`, and the click/download handlers created by `renderImageCards()`.
- Produces: a transparent full-card positioning layer with a left metadata pill and a right actions pill.

- [ ] **Step 1: Update the regression check before production CSS**

Replace the old caption assertions in `tools/check-image-preview-presentation.js` with assertions requiring:

```js
const captionRule = extractLastRule("#imageView .image-card figcaption");
assert.match(captionRule, /inset:\s*0\s*;/);
assert.match(captionRule, /background:\s*transparent\s*;/);
assert.match(captionRule, /border:\s*0\s*;/);
assert.match(captionRule, /box-shadow:\s*none\s*;/);
assert.match(captionRule, /backdrop-filter:\s*none\s*;/);
assert.match(captionRule, /pointer-events:\s*none\s*;/);

const metaPillRule = extractLastRule("#imageView .image-card figcaption > span:first-child");
assert.match(metaPillRule, /position:\s*absolute\s*;/);
assert.match(metaPillRule, /left:\s*12px\s*;/);
assert.match(metaPillRule, /bottom:\s*12px\s*;/);
assert.match(metaPillRule, /width:\s*fit-content\s*;/);
assert.match(metaPillRule, /background:\s*color-mix\(in srgb, var\(--panel\) 88%, transparent\)\s*;/);
assert.match(metaPillRule, /pointer-events:\s*auto\s*;/);

const actionsPillRule = extractLastRule("#imageView .image-actions");
assert.match(actionsPillRule, /position:\s*absolute\s*;/);
assert.match(actionsPillRule, /right:\s*12px\s*;/);
assert.match(actionsPillRule, /bottom:\s*12px\s*;/);
assert.match(actionsPillRule, /width:\s*fit-content\s*;/);
assert.match(actionsPillRule, /background:\s*color-mix\(in srgb, var\(--panel\) 88%, transparent\)\s*;/);
assert.match(actionsPillRule, /pointer-events:\s*auto\s*;/);

const darkPillsRule = extractLastRule(':root[data-theme="dark"] #imageView .image-card figcaption > span:first-child,\n:root[data-theme="dark"] #imageView .image-actions');
assert.match(darkPillsRule, /background:\s*color-mix\(in srgb, var\(--darkroom-panel\) 90%, transparent\)\s*;/);
assert.match(darkPillsRule, /color:\s*var\(--darkroom-ink\)\s*;/);
```

Update the cache assertion to `styles.css?v=20260803-image-caption-split-pills`.

- [ ] **Step 2: Run the focused check and verify RED**

Run: `node tools/check-image-preview-presentation.js`

Expected: FAIL because the current caption still has a full-width visible background.

- [ ] **Step 3: Implement the transparent positioning layer and two pills**

Replace the online-image caption CSS with:

```css
#imageView .image-card figcaption {
  inset: 0;
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  display: block;
  background: transparent;
  color: var(--ink);
  box-shadow: none;
  backdrop-filter: none;
  pointer-events: none;
}

#imageView .image-card figcaption > span:first-child,
#imageView .image-actions {
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  background: color-mix(in srgb, var(--panel) 88%, transparent);
  color: var(--ink);
  box-shadow: 0 8px 24px rgba(32, 32, 32, 0.12);
  backdrop-filter: blur(12px);
  pointer-events: auto;
}

#imageView .image-card figcaption > span:first-child {
  width: fit-content;
  max-width: calc(100% - 144px);
  position: absolute;
  left: 12px;
  bottom: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

#imageView .image-actions {
  width: fit-content;
  position: absolute;
  right: 12px;
  bottom: 12px;
}

#imageView .image-card a,
#imageView .image-actions button {
  color: inherit;
  border-bottom-color: currentColor;
}
```

Replace the dark caption override with:

```css
:root[data-theme="dark"] #imageView .image-card figcaption {
  border-color: transparent;
  background: transparent;
  color: var(--darkroom-ink);
  box-shadow: none;
}

:root[data-theme="dark"] #imageView .image-card figcaption > span:first-child,
:root[data-theme="dark"] #imageView .image-actions {
  border-color: var(--darkroom-line);
  background: color-mix(in srgb, var(--darkroom-panel) 90%, transparent);
  color: var(--darkroom-ink);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28);
}
```

Update the stylesheet cache key in `index.html` to `styles.css?v=20260803-image-caption-split-pills`.

- [ ] **Step 4: Run the focused check and verify GREEN**

Run: `node tools/check-image-preview-presentation.js`

Expected: `Image preview presentation checks passed.`

- [ ] **Step 5: Verify the real interface**

Inject a landscape image using the existing `renderImageCards()` function in dark mode and verify:

- `figcaption` background is transparent and `pointer-events` is `none`.
- The metadata and actions elements have `width: fit-content` and are at opposite bottom corners.
- Clicking the image center still opens the preview.
- Clicking “预览” still opens the preview and “下载” remains present.
- The visual screenshot has no colored or blurred strip between the two pills.

Save the screenshot to `artifacts/design-qa/image-caption-split-pills.png`.

- [ ] **Step 6: Run complete verification**

Run: `npm run check`

Run: `git diff --check`

Expected: both commands exit with code 0. Leave production files unstaged.
