# MiniMax H3 Reference Mention Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `@` selector to the editable MiniMax H3 prompt so users can insert official `<Picture N>`, `<Video N>`, and `<Audio N>` labels for media already connected to that H3 node, validate those labels, and submit generation.

**Architecture:** Keep the existing native H3 `textarea` and add focused helpers in `script.js` for mention data, trigger parsing, menu lifecycle, text insertion, and prompt-reference validation. Reuse `getCanvasIncomingMinimaxH3Refs()` as the only source of ready-reference numbering, derive disabled empty connections separately, render one node-scoped listbox near the prompt, and preserve the existing API payload shape.

**Tech Stack:** Vanilla browser JavaScript, DOM/CSS, existing canvas state model, Node.js contract checks, Playwright browser checks.

## Global Constraints

- The selector only shows media connected to the current MiniMax H3 node; it never scans the whole canvas or creates connections.
- Insert exactly `<Picture N>`, `<Video N>`, or `<Audio N>` with type-local one-based numbering.
- Connected empty material nodes appear disabled as `等待上传` and receive no insertable tag until media exists.
- Do not create `<Subject N>` entries or a six-section Ref2VA prompt automatically.
- Keep the prompt as ordinary textarea text and submit it unchanged to `/api/minimax-h3-video` after validation.
- Do not change the media upload APIs, server task protocol, ComfyUI workflow, or existing reference ordering behavior.
- Preserve existing user changes in the dirty worktree; do not stage or commit `script.js`, `styles.css`, or test files automatically.

## File Structure

- Modify `script.js`: mention item adaptation, trigger parsing, listbox controller, insertion, refresh hooks, validation, and run integration.
- Modify `styles.css`: H3 mention listbox, option states, thumbnails/icons, empty state, dark theme, and small-screen behavior.
- Modify `tools/check-minimax-h3-video.js`: focused source contracts for the helper and style surface.
- Modify `tools/check-minimax-h3-ui.js`: browser behavior for connected-only results, disabled empty media, mouse/keyboard insertion, filtering, ordering, persistence, and validation.

---

### Task 1: Mention data, trigger parsing, and reference validation

**Files:**
- Modify: `script.js:3714-3833`
- Modify: `tools/check-minimax-h3-video.js:120-155`
- Modify: `tools/check-minimax-h3-ui.js:1-176`

**Interfaces:**
- Consumes: `getCanvasIncomingMinimaxH3Refs(node)`, `getCanvasIncomingItems(nodeId)`, `canvasState.connections`, and `getCanvasNode(id)`.
- Produces: `getCanvasH3MentionItems(node) -> Array<{ id, type, typeLabel, promptLabel, name, url, ready, thumbnail }>`; `getCanvasH3MentionTrigger(textarea) -> { start, end, query } | null`; `validateCanvasH3PromptReferences(prompt, refs) -> { ok, missing }`.

- [ ] **Step 1: Add failing focused contracts**

Add source assertions to `tools/check-minimax-h3-video.js`:

```js
[
  "function getCanvasH3MentionItems",
  "function getCanvasH3MentionTrigger",
  "function validateCanvasH3PromptReferences",
  "function openCanvasH3MentionMenu",
  "function closeCanvasH3MentionMenu",
].forEach((needle) => assert.ok(script.includes(needle), `Missing H3 mention contract: ${needle}`));
assert.match(styles, /\.canvas-h3-mention-menu/);
assert.match(styles, /\.canvas-h3-mention-option\.is-active/);
assert.match(styles, /\.canvas-h3-mention-option\[aria-disabled="true"\]/);
```

Extend the browser setup in `tools/check-minimax-h3-ui.js` with one connected empty video and return direct helper results for ready items, disabled items, a valid trigger, an email-like non-trigger, valid labels, and an out-of-range label.

```js
const mentionItems = getCanvasH3MentionItems(h3);
const probe = document.createElement("textarea");
probe.value = "动作参考 @动作";
probe.selectionStart = probe.selectionEnd = probe.value.length;
const mentionTrigger = getCanvasH3MentionTrigger(probe);
probe.value = "name@example.com";
probe.selectionStart = probe.selectionEnd = probe.value.length;
const emailTrigger = getCanvasH3MentionTrigger(probe);
const validReferenceCheck = validateCanvasH3PromptReferences(
  "使用 <Picture 1>、<Video 1> 和 <Audio 1>",
  getCanvasIncomingMinimaxH3Refs(h3),
);
const missingReferenceCheck = validateCanvasH3PromptReferences(
  "使用 <Video 2>",
  getCanvasIncomingMinimaxH3Refs(h3),
);
```

Assert that ready items have the exact three official labels, the empty video is disabled, `mentionTrigger.query === "动作"`, the email trigger is null, the valid check succeeds, and the missing check reports `<Video 2>`.

- [ ] **Step 2: Run the focused checks and confirm RED**

Run:

```powershell
node .\tools\check-minimax-h3-video.js
```

Expected: FAIL with `Missing H3 mention contract: function getCanvasH3MentionItems`.

Run the existing H3 browser fixture against its test server using the repository's current H3 UI test command or equivalent local server invocation.

Expected: FAIL because `getCanvasH3MentionItems` is undefined.

- [ ] **Step 3: Implement the pure helpers**

Add constants and helpers next to the existing H3 reference functions in `script.js`:

```js
const CANVAS_H3_MENTION_GROUPS = [
  { collection: "images", type: "image", typeLabel: "图片", promptLabel: "Picture" },
  { collection: "videos", type: "video", typeLabel: "视频", promptLabel: "Video" },
  { collection: "audios", type: "audio", typeLabel: "音频", promptLabel: "Audio" },
];

function getCanvasH3MentionItems(node) {
  const refs = getCanvasIncomingMinimaxH3Refs(node);
  const readySourceIds = new Set(Object.values(refs).flat().map((item) => String(item.sourceId || item.nodeId || item.key || "")));
  const items = [];
  CANVAS_H3_MENTION_GROUPS.forEach(({ collection, type, typeLabel, promptLabel }) => {
    refs[collection].forEach((ref, index) => items.push({
      id: `${type}:${ref.key}`,
      type,
      typeLabel,
      promptLabel: `<${promptLabel} ${index + 1}>`,
      name: ref.name || `${typeLabel}${index + 1}`,
      url: ref.url,
      ready: true,
      thumbnail: type === "image" ? ref.url : "",
    }));
    // Add connected source nodes of this type that have no URL as disabled rows,
    // excluding sources already represented by a ready reference.
  });
  return items;
}

function getCanvasH3MentionTrigger(textarea) {
  if (!textarea || textarea.readOnly || textarea.disabled || textarea.selectionStart !== textarea.selectionEnd) return null;
  const end = textarea.selectionStart;
  const before = textarea.value.slice(0, end);
  const start = before.lastIndexOf("@");
  if (start < 0 || (start > 0 && !/[\s\n，。！？；：、,.!?;:()[\]{}]/.test(before[start - 1]))) return null;
  const query = before.slice(start + 1);
  if (/\n/.test(query)) return null;
  return { start, end, query };
}

function validateCanvasH3PromptReferences(prompt, refs) {
  const counts = { Picture: refs.images.length, Video: refs.videos.length, Audio: refs.audios.length };
  const missing = [];
  for (const match of String(prompt || "").matchAll(/<(Picture|Video|Audio)\s+(\d+)>/g)) {
    const index = Number(match[2]);
    if (index < 1 || index > counts[match[1]]) missing.push(match[0]);
  }
  return { ok: missing.length === 0, missing: [...new Set(missing)] };
}
```

When adapting empty connections, inspect source node classes and use the same type mapping as `connectCanvasNodes`; use node IDs as stable disabled-item IDs. Never assign them a `promptLabel` until a URL makes them part of `getCanvasIncomingMinimaxH3Refs()`.

- [ ] **Step 4: Run the focused checks and confirm the helper behavior passes**

Run:

```powershell
node --check .\script.js
node .\tools\check-minimax-h3-video.js
```

Expected: both commands exit 0 and the focused checker prints `MiniMax H3 canvas video checks passed`.

Run the H3 Playwright fixture.

Expected: helper assertions pass without page errors.

---

### Task 2: Accessible node-scoped `@` listbox and insertion

**Files:**
- Modify: `script.js:3588-3713`
- Modify: `script.js:3746-3833`
- Modify: `styles.css:16956-17335`
- Modify: `tools/check-minimax-h3-ui.js:1-176`

**Interfaces:**
- Consumes: Task 1 helpers and the existing `.canvas-h3-prompt` textarea.
- Produces: `openCanvasH3MentionMenu(node, textarea, trigger)`, `renderCanvasH3MentionMenu()`, `closeCanvasH3MentionMenu()`, `insertCanvasH3Mention(item)`, and `refreshCanvasH3MentionMenu(node)`.

- [ ] **Step 1: Add failing Playwright interaction checks**

Create an editable H3 node with connected ready image/video/audio plus one empty video. Use real keyboard input:

```js
const editablePrompt = page.locator(`[data-id="${editableH3Id}"] .canvas-h3-prompt`);
await editablePrompt.fill("人物外观来自 ");
await editablePrompt.pressSequentially("@");
await expect(page.locator(".canvas-h3-mention-menu")).toBeVisible();
```

Assert:

- only the current node's three ready references and its disabled empty video appear;
- unrelated connected media belonging to another H3 node do not appear;
- mouse selection inserts `<Picture 1> `;
- `@动` filters to `<Video 1>` and `ArrowDown` + `Enter` inserts it;
- `@音` + `Tab` inserts `<Audio 1>`;
- `Escape` closes without changing text;
- the disabled `等待上传` row cannot be selected;
- the textarea exposes `aria-expanded`, `aria-controls`, and active-option state;
- moving a reference and reopening the menu uses the same numbering shown by the H3 reference panel.

- [ ] **Step 2: Run the H3 UI check and confirm RED**

Run the Playwright fixture.

Expected: FAIL because `.canvas-h3-mention-menu` does not exist after typing `@`.

- [ ] **Step 3: Wire the menu controller into the H3 textarea**

In `renderCanvasMinimaxH3Node`, add stable listbox accessibility attributes and listeners:

```js
prompt.setAttribute("aria-autocomplete", "list");
prompt.setAttribute("aria-expanded", "false");
prompt.addEventListener("compositionstart", () => { prompt.dataset.h3Composing = "true"; });
prompt.addEventListener("compositionend", () => {
  prompt.dataset.h3Composing = "";
  updateCanvasH3MentionFromTextarea(node, prompt);
});
prompt.addEventListener("input", () => {
  node.dataset.minimaxH3Prompt = prompt.value;
  updateCanvasH3MentionFromTextarea(node, prompt);
  scheduleCanvasSave();
});
prompt.addEventListener("keydown", (event) => handleCanvasH3MentionKeydown(event, node, prompt));
prompt.addEventListener("click", () => updateCanvasH3MentionFromTextarea(node, prompt));
prompt.addEventListener("blur", () => queueMicrotask(() => closeCanvasH3MentionMenu(prompt)));
```

Maintain one small controller object with the active node, textarea, trigger, filtered items, active index, and menu element. Render the menu inside the H3 node, position it adjacent to the prompt field, use `role="listbox"` and `role="option"`, skip disabled options during keyboard movement, and use `mousedown.preventDefault()` before click insertion.

Implement replacement as ordinary text and dispatch the existing input event:

```js
function insertCanvasH3Mention(item) {
  const { textarea, trigger } = canvasH3MentionState;
  if (!textarea || !trigger || !item?.ready || !item.promptLabel) return;
  const suffix = textarea.value.slice(trigger.end);
  const spacer = /^\s/.test(suffix) ? "" : " ";
  textarea.setRangeText(`${item.promptLabel}${spacer}`, trigger.start, trigger.end, "end");
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.focus();
  closeCanvasH3MentionMenu(textarea);
}
```

- [ ] **Step 4: Refresh and close the menu at lifecycle boundaries**

- Call `refreshCanvasH3MentionMenu(node)` after `renderCanvasMinimaxH3References(node)` when the active menu belongs to that node.
- Close the menu when `syncCanvasMinimaxH3Prompt` makes the textarea read-only.
- Close the menu when the active H3 node is removed or the canvas is cleared/restored.
- Re-read reference data on every render so connection, upload, disconnection, and ordering changes are reflected without a second numbering cache.

- [ ] **Step 5: Add the H3 mention styles**

Add styles in the H3 section of `styles.css`:

```css
.canvas-h3-prompt-field { position: relative; }
.canvas-h3-mention-menu {
  position: absolute;
  z-index: 30;
  left: 0;
  right: 0;
  top: calc(100% + 6px);
  max-height: 248px;
  overflow: auto;
}
.canvas-h3-mention-option.is-active { border-color: #f5c842; background: rgba(245, 200, 66, 0.14); }
.canvas-h3-mention-option[aria-disabled="true"] { opacity: 0.48; cursor: not-allowed; }
```

Complete the styles with existing H3 surface colors, 32–40px thumbnails/icons, ellipsis for long names, group labels, empty-state text, focus-visible treatment, dark-theme compatibility, and a small-screen max-height adjustment.

- [ ] **Step 6: Run focused syntax, contract, and browser checks**

Run:

```powershell
node --check .\script.js
node .\tools\check-minimax-h3-video.js
```

Then run the H3 Playwright fixture.

Expected: all mention mouse, keyboard, filtering, accessibility, empty-node, and ordering assertions pass with no page errors.

---

### Task 3: Generation validation, request preservation, and regression verification

**Files:**
- Modify: `script.js:3834-3905`
- Modify: `tools/check-minimax-h3-ui.js:1-176`
- Modify: `docs/superpowers/plans/2026-08-10-minimax-h3-reference-mention-implementation.md`

**Interfaces:**
- Consumes: `validateCanvasH3PromptReferences(prompt, refs)` from Task 1 and the existing `runCanvasMinimaxH3Node(node)` request path.
- Produces: client-side blocking for missing official labels and unchanged prompt submission for valid labels.

- [ ] **Step 1: Add failing generation-path checks**

In Playwright, intercept the API and capture the submitted JSON body. For a valid prompt inserted through the menu, assert the exact text containing `<Picture 1>`, `<Video 1>`, and `<Audio 1>` reaches the POST body unchanged.

Set the prompt to `使用 <Video 2>` while only one video is ready, click generate, and assert:

- no POST request occurs;
- `.canvas-h3-status.is-error` contains `<Video 2>` and `当前不存在`;
- the generate button returns to enabled state.

- [ ] **Step 2: Run the browser check and confirm RED**

Expected: the invalid reference still starts a request because generation validation is not yet wired.

- [ ] **Step 3: Validate immediately before task creation**

In `runCanvasMinimaxH3Node`, after prompt and refs exist but before disabling the run button, add:

```js
const referenceCheck = validateCanvasH3PromptReferences(prompt, refs);
if (!referenceCheck.ok) {
  setCanvasH3Status(node, `提示词引用的 ${referenceCheck.missing.join("、")} 当前不存在`, true);
  return;
}
```

Do not modify the request body's `prompt` field. The inserted labels must be sent exactly as present in the textarea.

- [ ] **Step 4: Run H3-focused verification**

Run:

```powershell
node --check .\script.js
node .\tools\check-minimax-h3-video.js
```

Run the H3 Playwright fixture.

Expected: valid prompt POST capture matches the textarea exactly; invalid reference blocks the request and shows the missing tag.

- [ ] **Step 5: Run full regression checks**

Run:

```powershell
npm run check
```

Expected: exit 0 with `MiniMax H3 canvas video checks passed` and all existing repository checks passing.

- [ ] **Step 6: Inspect the final diff and record completion**

Run:

```powershell
git diff --check
git diff --stat
git status --short
```

Expected: no whitespace errors; only intentional changes in `script.js`, `styles.css`, H3 test files, and this plan are attributable to this feature. Because the same files already contain unrelated dirty changes, leave them unstaged and report that state instead of committing them.
