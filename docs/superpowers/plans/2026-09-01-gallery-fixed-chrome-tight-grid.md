# Gallery Fixed Chrome Tight Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the gallery header/footer fixed while gallery expansion leaves member images tightly spaced.

**Architecture:** The gallery remains a three-row CSS grid. Its header is 38px, footer is 30px, and only the middle member area can consume remaining height. The member grid anchors its content to the top and uses the existing 16px gap in both directions.

**Tech Stack:** Vanilla CSS and the existing Node assertion UI check.

## Global Constraints

- Preserve original image aspect ratios, member order, ports, hover behavior, drag behavior, and connection behavior.
- Do not modify JavaScript sizing or connection logic.
- Use a 38px header track, a 30px footer track, and a fixed 16px member gap.

---

### Task 1: Lock gallery chrome and member spacing

**Files:**
- Modify: `styles.css:14983-15040`
- Modify: `tools/check-canvas-gallery-container-ui.js:70-90`

**Interfaces:**
- `.canvas-node-gallery-container` produces fixed header/footer tracks around a flexible image region.
- `.canvas-gallery-container-members` keeps its content top-aligned while retaining the existing gap variable.

- [ ] **Step 1: Write failing CSS assertions**

```js
assert.match(
  extractCssRule(styles, ".canvas-node-gallery-container"),
  /grid-template-rows:\s*38px minmax\(0, 1fr\) 30px/,
  "gallery chrome must retain fixed header and footer tracks while only the image region grows",
);
assert.match(
  extractCssRule(styles, ".canvas-gallery-container-members"),
  /align-content:\s*start/,
  "gallery members must stay tightly packed at the top instead of distributing extra height into rows",
);
```

- [ ] **Step 2: Run the focused UI check and verify failure**

Run: `node tools/check-canvas-gallery-container-ui.js`

Expected: failure because the gallery currently uses three `auto` rows and its member grid does not define `align-content`.

- [ ] **Step 3: Implement the minimal CSS change**

```css
.canvas-node-gallery-container {
  grid-template-rows: 38px minmax(0, 1fr) 30px;
}

.canvas-gallery-container-members {
  align-content: start;
}
```

- [ ] **Step 4: Run focused checks**

Run: `node tools/check-canvas-gallery-container-ui.js; node tools/check-canvas-gallery-container-operations.js`

Expected: both commands print their passing messages.

- [ ] **Step 5: Run project verification**

Run: `npm run check; git diff --check -- styles.css tools/check-canvas-gallery-container-ui.js`

Expected: exit code 0 with no whitespace errors.
