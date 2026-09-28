# Canvas History Toolbar Contrast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Improve the historical canvas toolbar so the “新建画布” label is readable and the recycle-bin action has a clearer, better-proportioned icon in dark themes.

**Architecture:** Keep the existing toolbar markup and behavior. Make one semantic icon substitution in `script.js`, add narrowly scoped theme-token CSS overrides in `styles.css`, and protect the result with the existing canvas-shell regression checker. Bump the static asset cache key so browsers receive the fix immediately.

**Tech Stack:** Vanilla HTML, CSS custom properties, JavaScript, Lucide icons, Node.js assertion scripts, Playwright browser QA.

## Global Constraints

- Preserve all canvas/history behavior and data.
- Keep the trash action as a compact circular icon-only button.
- Use existing theme tokens; do not introduce fixed light/dark colors.
- Do not reformat unrelated code or overwrite existing user changes.

### Task 1: Add a failing toolbar contrast regression

**Files:**
- Modify: `tools/check-canvas-shell-history-theme.js`

**Step 1: Add assertions for the intended toolbar contract**

Assert that:

- `#canvasBoardTrash` uses Lucide `trash`, not `trash-2`.
- `.canvas-board-head .canvas-board-tools #canvasBoardNew span` explicitly inherits the button foreground and uses `13px`/`800` typography.
- `.canvas-board-tools #canvasBoardTrash svg` is `20px` square with a `2.2px` stroke.
- Both CSS and JavaScript asset URLs use cache key `20260803-canvas-history-toolbar-contrast`.

**Step 2: Run the focused check and confirm it fails**

Run: `node tools/check-canvas-shell-history-theme.js`

Expected: failure because the old toolbar still uses `trash-2`, the new scoped rules are absent, and the cache key is stale.

### Task 2: Implement the scoped visual fix

**Files:**
- Modify: `script.js`
- Modify: `styles.css`
- Modify: `index.html`

**Step 1: Replace the recycle-bin glyph**

Change the `#canvasBoardTrash` Lucide icon from `trash-2` to `trash` without changing the button ID, title, or click handler.

**Step 2: Add scoped theme-aware styles**

Append these overrides after the existing canvas-board toolbar rules:

```css
.canvas-board-head .canvas-board-tools #canvasBoardNew span {
  color: inherit;
  font-size: 13px;
  font-weight: 800;
}

.canvas-board-tools #canvasBoardTrash {
  color: color-mix(in srgb, var(--ink) 86%, var(--accent));
}

.canvas-board-tools #canvasBoardTrash svg {
  width: 20px;
  height: 20px;
  stroke-width: 2.2px;
}
```

**Step 3: Bump the static asset cache key**

Update both `styles.css` and `script.js` query strings in `index.html` to `20260803-canvas-history-toolbar-contrast`.

**Step 4: Run the focused check and confirm it passes**

Run: `node tools/check-canvas-shell-history-theme.js`

Expected: pass.

### Task 3: Verify syntax, full regression suite, and rendered behavior

**Files:**
- Verify: `script.js`
- Verify: `styles.css`
- Verify: `index.html`

**Step 1: Run static verification**

Run:

```powershell
node --check .\script.js
npm run check
git diff --check
```

Expected: all commands pass.

**Step 2: Run Playwright visual QA against the local app**

Open the historical canvas modal in the dark yellow theme and verify:

- The “新建画布” span has the same computed foreground color as its button.
- The trash SVG renders at `20 × 20` with a visibly stronger stroke.
- Hovering the trash button produces the existing theme-aware hover-state color change.
- Toolbar layout and all button hit areas remain unchanged.

Capture the result at `artifacts/design-qa/canvas-history-toolbar-contrast.png`.
