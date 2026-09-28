# Image Preview Clean Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the online image preview's redundant empty-state sentence and replace the generated result's white surround with a transparent, theme-aware presentation that preserves the entire image.

**Architecture:** Keep the existing image rendering DOM and `object-fit: contain` behavior. Change only the online image view's empty-state markup and presentation overrides, with a focused Node regression script wired into `precheck` and a Playwright visual verification against the running app.

**Tech Stack:** HTML, CSS custom properties, vanilla JavaScript, Node.js assertions, Playwright

## Global Constraints

- Preserve `object-fit: contain`; do not crop generated images.
- Do not add blurred backgrounds, animations, or new interaction behavior.
- Do not alter generation, local saving, history, preview, or download logic.
- Do not stage or commit production files because this is an existing dirty `main` workspace; preserve all unrelated user changes.

---

### Task 1: Simplify the empty state and remove the white result surround

**Files:**
- Create: `tools/check-image-preview-presentation.js`
- Modify: `package.json`
- Modify: `index.html:125-129`
- Modify: `script.js:420-422`
- Modify: `styles.css:12631-12654`
- Create: `artifacts/design-qa/image-preview-clean-background.png`

**Interfaces:**
- Consumes: existing `#imageStage`, `.image-card`, `.image-preview-button`, `renderImageCards()`, and CSS theme variables.
- Produces: an empty state containing only `<span>图片预览</span>` and theme-aware transparent result presentation.

- [ ] **Step 1: Write the failing regression check**

Create `tools/check-image-preview-presentation.js`:

```js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const script = fs.readFileSync(path.join(ROOT, "script.js"), "utf8");
const styles = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8").replace(/\r\n/g, "\n");

function extractLastRule(selector) {
  const start = styles.lastIndexOf(`${selector} {`);
  assert.notStrictEqual(start, -1, `Missing CSS rule for ${selector}`);
  const bodyStart = styles.indexOf("{", start) + 1;
  const bodyEnd = styles.indexOf("}", bodyStart);
  return styles.slice(bodyStart, bodyEnd);
}

const imageStageMarkup = html.slice(html.indexOf('id="imageStage"'), html.indexOf('id="clearImages"'));
assert.match(imageStageMarkup, /<span>\u56fe\u7247\u9884\u89c8<\/span>/);
assert.doesNotMatch(imageStageMarkup, /<p>|output\s+\u6587\u4ef6\u5939/);
assert.match(script, /imageStage\.innerHTML = '<div class="empty-state"><span>\u56fe\u7247\u9884\u89c8<\/span><\/div>';/);

const cardRule = extractLastRule("#imageView .image-card");
assert.match(cardRule, /background:\s*transparent\s*;/);
assert.match(cardRule, /box-shadow:\s*none\s*;/);

const imageRule = extractLastRule("#imageView .image-card img");
assert.match(imageRule, /object-fit:\s*contain\s*;/);
assert.match(imageRule, /background:\s*transparent\s*;/);

const captionRule = extractLastRule("#imageView .image-card figcaption");
assert.match(captionRule, /background:\s*color-mix\(in srgb, var\(--panel\) 88%, transparent\)\s*;/);
assert.match(captionRule, /color:\s*var\(--ink\)\s*;/);

const darkCaptionRule = extractLastRule(':root[data-theme="dark"] #imageView .image-card figcaption');
assert.match(darkCaptionRule, /background:\s*color-mix\(in srgb, var\(--darkroom-panel\) 90%, transparent\)\s*;/);
assert.match(darkCaptionRule, /color:\s*var\(--darkroom-ink\)\s*;/);

assert.match(html, /styles\.css\?v=20260803-image-preview-clean-background/);
console.log("Image preview presentation checks passed.");
```

Append `node tools/check-image-preview-presentation.js` to the existing `precheck` command in `package.json`.

- [ ] **Step 2: Run the focused check and verify RED**

Run: `node tools/check-image-preview-presentation.js`

Expected: FAIL because the old paragraph and white result backgrounds still exist.

- [ ] **Step 3: Implement the minimal HTML and JavaScript change**

In `index.html`, make the initial image stage empty state:

```html
<div class="empty-state">
  <span>图片预览</span>
</div>
```

In the `#clearImages` click handler in `script.js`, set:

```js
imageStage.innerHTML = '<div class="empty-state"><span>图片预览</span></div>';
```

Update the stylesheet cache key in `index.html` to `styles.css?v=20260803-image-preview-clean-background`.

- [ ] **Step 4: Implement the minimal presentation CSS**

Make the final online-image overrides resolve to:

```css
#imageView .image-card {
  max-width: 100%;
  overflow: hidden;
  border-radius: 12px;
  background: transparent;
  box-shadow: none;
}

#imageView .image-card img {
  aspect-ratio: auto;
  max-height: calc(100vh - 230px);
  object-fit: contain;
  background: transparent;
}

#imageView .image-card figcaption {
  left: 12px;
  right: 12px;
  bottom: 12px;
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  background: color-mix(in srgb, var(--panel) 88%, transparent);
  color: var(--ink);
  box-shadow: 0 8px 24px rgba(32, 32, 32, 0.12);
  backdrop-filter: blur(12px);
}

#imageView .image-card a,
#imageView .image-actions button {
  color: inherit;
  border-bottom-color: currentColor;
}

:root[data-theme="dark"] #imageView .image-card figcaption {
  border-color: var(--darkroom-line);
  background: color-mix(in srgb, var(--darkroom-panel) 90%, transparent);
  color: var(--darkroom-ink);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28);
}
```

- [ ] **Step 5: Run focused and full checks**

Run: `node tools/check-image-preview-presentation.js`

Expected: `Image preview presentation checks passed.`

Run: `npm run check`

Expected: all precheck and project checks pass.

- [ ] **Step 6: Verify the running interface**

Open the online image view in dark mode, inject a landscape image into `#imageStage` using the real `renderImageCards()` function, and verify:

- `object-fit` is `contain`.
- Card and image computed backgrounds are transparent.
- Side areas expose the dark preview canvas rather than white.
- The caption computed background is dark/translucent and text remains legible.
- The empty state contains no paragraph after clicking clear.

Save the screenshot to `artifacts/design-qa/image-preview-clean-background.png`.

Run: `git diff --check`

Expected: exit code 0. Leave production changes unstaged.
