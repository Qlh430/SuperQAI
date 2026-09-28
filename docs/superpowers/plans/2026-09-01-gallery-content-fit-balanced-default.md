# Gallery Content-Fit Balanced Default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate gallery bottom whitespace by using loaded image dimensions and make unresized multi-image galleries start in a balanced near-square layout.

**Architecture:** `getCanvasGalleryFreeGridLayout` receives a persisted `layoutMode`. It uses the default balanced column count until the user drags the resize handle, then it uses the available width to reflow freely. The gallery renderer records each member image's natural dimensions and rerenders only when metadata changed, so the same layout function calculates the actual content height.

**Tech Stack:** Vanilla JavaScript, CSS Grid, Node `assert`/`vm` static-operation checks.

## Global Constraints

- Preserve every image's native aspect ratio; do not crop or add image frames.
- Preserve canvas connection, drag, image-transfer, and persistence behavior.
- Do not create empty placeholder cells for two-image galleries.
- Use test-first changes in `tools/check-canvas-gallery-container-operations.js`.

---

### Task 1: Lock the balanced-layout and content-fit contract

**Files:**
- Modify: `tools/check-canvas-gallery-container-operations.js`
- Modify: `script.js:6397-6458`

**Interfaces:**
- Consumes: `getCanvasGalleryFreeGridLayout({ members, width, layoutMode, gap })`
- Produces: `columns`, `rows`, `height`, and `minHeight` based on default or user-resized layout intent.

`normalizeCanvasGalleryContainer` persists `layoutMode: "default" | "manual"`. `getCanvasGalleryContainerSizeForRequest`, `getCanvasGalleryContainerRenderState`, and virtual member-port positioning forward this value to the shared layout helper. The resize handler sets `layoutMode: "manual"` before calculating its first resized frame.

- [ ] **Step 1: Write the failing test**

```js
const defaultMembers = Array.from({ length: 3 }, (_, index) => ({ id: `default-${index}`, width: 1600, height: 900 }));
const defaultThree = getCanvasGalleryFreeGridLayout({
  members: defaultMembers,
  width: 620,
});
assert.equal(defaultThree.columns, 2);

const resizedThree = getCanvasGalleryFreeGridLayout({
  members: defaultMembers,
  width: 620,
  layoutMode: "manual",
});
assert.equal(resizedThree.columns, 5);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tools/check-canvas-gallery-container-operations.js`

Expected: an assertion failure showing that an unresized gallery incorrectly expands to the maximum number of columns.

- [ ] **Step 3: Write minimal implementation**

```js
const layoutMode = options.layoutMode === "manual" ? "manual" : "default";
const defaultColumns = Math.min(maximumColumns, suggestedCanvasGalleryContainerColumns(memberCount));
const resolvedColumns = layoutMode === "manual"
  ? Math.min(maximumColumns, Math.max(1, memberCount))
  : defaultColumns;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tools/check-canvas-gallery-container-operations.js`

Expected: `Canvas gallery container operations checks passed`.

### Task 2: Persist actual image dimensions after gallery preview load

**Files:**
- Modify: `script.js:6530-6644`
- Test: `tools/check-canvas-gallery-container-operations.js`

**Interfaces:**
- Consumes: loaded `<img>.naturalWidth`, `<img>.naturalHeight`, and a gallery-member id.
- Produces: normalized member dimensions and a rerendered content-fitted gallery only when dimensions changed.

- [ ] **Step 1: Write the failing test**

```js
const changed = syncCanvasGalleryMemberIntrinsicSize(node, "landscape", {
  naturalWidth: 1600,
  naturalHeight: 900,
});
assert.equal(changed, true);
assert.deepEqual(node.container.members[0], { id: "landscape", width: 1600, height: 900 });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tools/check-canvas-gallery-container-operations.js`

Expected: assertion failure because `syncCanvasGalleryMemberIntrinsicSize` does not yet exist.

- [ ] **Step 3: Write minimal implementation**

```js
function syncCanvasGalleryMemberIntrinsicSize(node, memberId, image) {
  const width = Math.round(Number(image?.naturalWidth) || 0);
  const height = Math.round(Number(image?.naturalHeight) || 0);
  const current = getCanvasGalleryContainer(node);
  const members = current.members.map((candidate) => (
    candidate.id === memberId ? { ...candidate, width, height } : candidate
  ));
  if (!width || !height || JSON.stringify(members) === JSON.stringify(current.members)) return false;
  setCanvasGalleryContainer(node, { ...current, members });
  scheduleCanvasSave();
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tools/check-canvas-gallery-container-operations.js && node tools/check-canvas-gallery-container-ui.js && node --check script.js`

Expected: every command exits with code 0.

### Task 3: Verify no canvas regression

**Files:**
- Test: project-wide checks

- [ ] **Step 1: Run the complete validation suite**

Run: `npm run check`

Expected: exit code 0 and all listed checks pass.

- [ ] **Step 2: Check changed-file whitespace**

Run: `git diff --check -- script.js tools/check-canvas-gallery-container-operations.js`

Expected: exit code 0 with no whitespace errors.
