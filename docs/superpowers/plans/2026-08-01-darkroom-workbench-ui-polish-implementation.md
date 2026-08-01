# Darkroom Workbench UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the dark-mode online image and GPT chat workspaces without changing layout or behavior, making the image close control and chat history text immediately readable.

**Architecture:** Add a static regression check that treats the final CSS cascade as the public contract, then append one tightly scoped `Darkroom workbench polish` section to `styles.css`. The final section defines semantic tokens on `#imageView` and `#chatView`, uses exact yellow-black values plus derived values for other palettes, and wins by source order instead of new `!important` declarations.

**Tech Stack:** Existing HTML/CSS/vanilla JavaScript application, Node.js built-in `assert` and `fs`, local browser visual QA.

## Global Constraints

- Keep the online image three-column layout and GPT chat history/message layout unchanged.
- Do not modify `index.html`, `script.js`, business behavior, dependencies, responsive breakpoints, or light-mode rules.
- Do not add network fonts, image assets, global element selectors, or new `!important` declarations.
- Use `#121311`, `#191A18`, `#222320`, `#10110F`, `#30312C`, `#F5F3EA`, `#AAA89F`, and `#FFD23F` for the yellow-black darkroom palette.
- Preserve every pre-existing dirty-worktree change. `styles.css` is already dirty with unrelated work, so do not stage or commit implementation files.

---

### Task 1: Add a failing darkroom theme regression check

**Files:**
- Create: `tools/check-darkroom-workbench-theme.js`
- Test: `tools/check-darkroom-workbench-theme.js`

**Interfaces:**
- Consumes: the final cascade in `styles.css`.
- Produces: a zero-exit Node check for scoped tokens, close-button states, chat history colors, the active-row indicator, reduced-motion coverage, and static contrast ratios.

- [ ] **Step 1: Create the regression check**

Create `tools/check-darkroom-workbench-theme.js`:

```js
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const STYLE_SOURCE = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const MARKER = "/* Darkroom workbench polish */";
const markerIndex = STYLE_SOURCE.lastIndexOf(MARKER);

assert.notStrictEqual(markerIndex, -1, "Missing final Darkroom workbench polish section");

function extractLastRule(selector) {
  const start = STYLE_SOURCE.lastIndexOf(`${selector} {`);
  assert.notStrictEqual(start, -1, `Missing CSS rule for ${selector}`);
  const bodyStart = STYLE_SOURCE.indexOf("{", start) + 1;
  const bodyEnd = STYLE_SOURCE.indexOf("}", bodyStart);
  return { start, body: STYLE_SOURCE.slice(bodyStart, bodyEnd) };
}

function channel(value) {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const value = hex.replace("#", "");
  return (
    0.2126 * channel(Number.parseInt(value.slice(0, 2), 16))
    + 0.7152 * channel(Number.parseInt(value.slice(2, 4), 16))
    + 0.0722 * channel(Number.parseInt(value.slice(4, 6), 16))
  );
}

function contrastRatio(foreground, background) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

const darkroomSection = STYLE_SOURCE.slice(markerIndex);
for (const declaration of [
  "--darkroom-canvas: #121311",
  "--darkroom-panel: #191a18",
  "--darkroom-field: #222320",
  "--darkroom-preview: #10110f",
  "--darkroom-line: #30312c",
  "--darkroom-ink: #f5f3ea",
  "--darkroom-muted: #aaa89f",
  "--darkroom-accent: #ffd23f",
]) {
  assert.ok(darkroomSection.toLowerCase().includes(declaration), `Missing token: ${declaration}`);
}

const imageClose = extractLastRule(':root[data-theme="dark"] #imageView.active .canvas-overlay-close');
assert.ok(imageClose.start > markerIndex);
assert.match(imageClose.body, /background:\s*var\(--darkroom-close\)\s*;/);
assert.match(imageClose.body, /color:\s*var\(--darkroom-close-ink\)\s*;/);

const imageCloseSvg = extractLastRule(':root[data-theme="dark"] #imageView.active .canvas-overlay-close svg');
assert.match(imageCloseSvg.body, /stroke:\s*currentColor\s*;/);

const imageCloseHover = extractLastRule(':root[data-theme="dark"] #imageView.active .canvas-overlay-close:hover');
assert.match(imageCloseHover.body, /background:\s*var\(--darkroom-accent\)\s*;/);
assert.match(imageCloseHover.body, /color:\s*#1a1914\s*;/);

const imageCloseFocus = extractLastRule(':root[data-theme="dark"] #imageView.active .canvas-overlay-close:focus-visible');
assert.match(imageCloseFocus.body, /outline:\s*3px solid/);

const historyTitle = extractLastRule(':root[data-theme="dark"] #chatView .history-chat strong');
assert.ok(historyTitle.start > markerIndex);
assert.match(historyTitle.body, /color:\s*var\(--darkroom-ink\)\s*;/);

const historyMeta = extractLastRule(':root[data-theme="dark"] #chatView .history-chat p');
assert.match(historyMeta.body, /color:\s*var\(--darkroom-muted\)\s*;/);

const activeIndicator = extractLastRule(':root[data-theme="dark"] #chatView .history-chat-row.active::before');
assert.match(activeIndicator.body, /width:\s*2px\s*;/);
assert.match(activeIndicator.body, /background:\s*var\(--darkroom-accent\)\s*;/);

assert.match(darkroomSection, /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition:\s*none\s*;/);
assert.ok(contrastRatio("#F5F3EA", "#191A18") >= 4.5);
assert.ok(contrastRatio("#AAA89F", "#191A18") >= 4.5);
assert.ok(contrastRatio("#FFF4C0", "#24251F") >= 3);
assert.ok(contrastRatio("#FFD23F", "#121311") >= 3);

console.log("Darkroom workbench theme checks passed.");
```

- [ ] **Step 2: Run the new check and confirm the intended failure**

Run: `node tools/check-darkroom-workbench-theme.js`

Expected: non-zero exit with `Missing final Darkroom workbench polish section`.

---

### Task 2: Append the scoped darkroom theme

**Files:**
- Modify: `styles.css:15784` (append after the current final rule)
- Test: `tools/check-darkroom-workbench-theme.js`

**Interfaces:**
- Consumes: existing `data-theme`, `data-palette`, `#imageView`, `#chatView`, `.history-chat-row.active`, and overlay close markup.
- Produces: final cascade values through `--darkroom-*`; no DOM or JavaScript contract changes.

- [ ] **Step 1: Append the complete theme block**

Append to `styles.css`:

```css
/* Darkroom workbench polish */
:root[data-theme="dark"] #imageView,
:root[data-theme="dark"] #chatView {
  --darkroom-canvas: color-mix(in srgb, var(--stage) 88%, #111 12%);
  --darkroom-panel: color-mix(in srgb, var(--panel) 92%, #111 8%);
  --darkroom-field: color-mix(in srgb, var(--field) 90%, #20211e 10%);
  --darkroom-preview: color-mix(in srgb, var(--stage) 84%, #080906 16%);
  --darkroom-line: var(--line-strong);
  --darkroom-ink: var(--ink);
  --darkroom-muted: var(--muted);
  --darkroom-accent: var(--accent, #ffd23f);
  --darkroom-close: color-mix(in srgb, var(--darkroom-field) 86%, #24251f 14%);
  --darkroom-close-ink: color-mix(in srgb, var(--darkroom-ink) 88%, var(--darkroom-accent) 12%);
  font-family: "Microsoft YaHei UI", "Microsoft YaHei", sans-serif;
}

:root[data-theme="dark"][data-palette="yellow-black"] #imageView,
:root[data-theme="dark"][data-palette="yellow-black"] #chatView {
  --darkroom-canvas: #121311;
  --darkroom-panel: #191a18;
  --darkroom-field: #222320;
  --darkroom-preview: #10110f;
  --darkroom-line: #30312c;
  --darkroom-ink: #f5f3ea;
  --darkroom-muted: #aaa89f;
  --darkroom-accent: #ffd23f;
  --darkroom-close: #24251f;
  --darkroom-close-ink: #fff4c0;
}

:root[data-theme="dark"] .stage:has(#imageView.active) > #imageView.active {
  border-color: var(--darkroom-line);
  background: var(--darkroom-canvas);
  color: var(--darkroom-ink);
  box-shadow: 0 24px 72px rgba(0, 0, 0, 0.34);
}

:root[data-theme="dark"] #imageView .studio-header {
  border-bottom-color: var(--darkroom-line);
  background: color-mix(in srgb, var(--darkroom-panel) 78%, transparent);
}

:root[data-theme="dark"] #imageView .studio-header h1,
:root[data-theme="dark"] #chatView .studio-header h1,
:root[data-theme="dark"] #imageView .block-label,
:root[data-theme="dark"] #imageView .history-head,
:root[data-theme="dark"] #chatView .history-head {
  color: var(--darkroom-ink);
  font-family: "Bahnschrift SemiCondensed", "Microsoft YaHei UI", sans-serif;
  letter-spacing: 0.01em;
}

:root[data-theme="dark"] #imageView .image-control,
:root[data-theme="dark"] #imageView .preview-panel,
:root[data-theme="dark"] #imageView > .image-workspace > .history-panel {
  border-color: var(--darkroom-line);
  background: var(--darkroom-panel);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.025);
}

:root[data-theme="dark"] #imageView #imagePrompt,
:root[data-theme="dark"] #imageView select,
:root[data-theme="dark"] #imageView input[type="number"] {
  border-color: color-mix(in srgb, var(--darkroom-muted) 38%, var(--darkroom-line));
  background: var(--darkroom-field);
  color: var(--darkroom-ink);
  color-scheme: dark;
}

:root[data-theme="dark"] #imageView select,
:root[data-theme="dark"] #imageView input[type="number"] {
  font-family: "Cascadia Mono", Consolas, monospace;
  font-variant-numeric: tabular-nums;
}

:root[data-theme="dark"] #imageView #imagePrompt::placeholder {
  color: color-mix(in srgb, var(--darkroom-muted) 76%, transparent);
}

:root[data-theme="dark"] #imageView #imagePrompt:focus-visible,
:root[data-theme="dark"] #imageView select:focus-visible,
:root[data-theme="dark"] #imageView input[type="number"]:focus-visible,
:root[data-theme="dark"] #imageView .reference-slot:focus-visible {
  border-color: var(--darkroom-accent);
  outline: 3px solid color-mix(in srgb, var(--darkroom-accent) 24%, transparent);
  outline-offset: 1px;
}

:root[data-theme="dark"] #imageView .control-card {
  border-color: var(--darkroom-line);
  background: color-mix(in srgb, var(--darkroom-panel) 74%, var(--darkroom-field));
}

:root[data-theme="dark"] #imageView .control-card label > span,
:root[data-theme="dark"] #imageView .size-row > span,
:root[data-theme="dark"] #imageView .remember-line,
:root[data-theme="dark"] #imageView .status-line,
:root[data-theme="dark"] #imageView .history-head button,
:root[data-theme="dark"] #imageView .history-thumb p {
  color: var(--darkroom-muted);
}

:root[data-theme="dark"] #imageView .reference-slot {
  border-color: color-mix(in srgb, var(--darkroom-muted) 32%, var(--darkroom-line));
  background: var(--darkroom-field);
  color: var(--darkroom-ink);
}

:root[data-theme="dark"] #imageView .reference-slot span {
  color: var(--darkroom-ink);
}

:root[data-theme="dark"] #imageView .reference-slot strong {
  color: var(--darkroom-muted);
}

:root[data-theme="dark"] #imageView .reference-slot:hover,
:root[data-theme="dark"] #imageView .reference-slot.drag-over {
  border-color: var(--darkroom-accent);
  background: color-mix(in srgb, var(--darkroom-accent) 8%, var(--darkroom-field));
}

:root[data-theme="dark"] #imageView .preview-frame {
  border-color: var(--darkroom-line);
  background-color: var(--darkroom-preview);
  background-image:
    linear-gradient(45deg, rgba(255, 255, 255, 0.018) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(255, 255, 255, 0.018) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.018) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.018) 75%);
}

:root[data-theme="dark"] #imageView .empty-state {
  border-color: color-mix(in srgb, var(--darkroom-muted) 34%, var(--darkroom-line));
  background: color-mix(in srgb, var(--darkroom-panel) 52%, transparent);
  color: var(--darkroom-muted);
}

:root[data-theme="dark"] #imageView .empty-state span {
  color: var(--darkroom-ink);
}

:root[data-theme="dark"] #imageView .history-head button:hover {
  background: color-mix(in srgb, var(--darkroom-accent) 9%, var(--darkroom-field));
  color: var(--darkroom-ink);
}

:root[data-theme="dark"] #imageView .history-thumb {
  border-color: var(--darkroom-line);
  background: var(--darkroom-field);
  box-shadow: none;
}

:root[data-theme="dark"] #imageView .history-thumb:hover,
:root[data-theme="dark"] #imageView .history-thumb:focus-visible {
  border-color: var(--darkroom-accent);
  background: color-mix(in srgb, var(--darkroom-accent) 6%, var(--darkroom-field));
  outline: none;
  box-shadow: inset 2px 0 0 var(--darkroom-accent);
}

:root[data-theme="dark"] #imageView #generateButton {
  background: var(--darkroom-accent);
  color: #1a1914;
  font-family: "Bahnschrift SemiCondensed", "Microsoft YaHei UI", sans-serif;
}

:root[data-theme="dark"] #imageView #generateButton:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--darkroom-accent) 28%, transparent);
  outline-offset: 3px;
}

:root[data-theme="dark"] #imageView.active .canvas-overlay-close {
  border: 1px solid color-mix(in srgb, var(--darkroom-accent) 30%, var(--darkroom-line));
  background: var(--darkroom-close);
  color: var(--darkroom-close-ink);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.34);
  transition: border-color 140ms ease, background-color 140ms ease, color 140ms ease, transform 140ms ease;
}

:root[data-theme="dark"] #imageView.active .canvas-overlay-close svg {
  color: currentColor;
  stroke: currentColor;
  stroke-width: 2.2;
}

:root[data-theme="dark"] #imageView.active .canvas-overlay-close:hover {
  border-color: var(--darkroom-accent);
  background: var(--darkroom-accent);
  color: #1a1914;
  transform: translateY(-1px);
}

:root[data-theme="dark"] #imageView.active .canvas-overlay-close:focus-visible {
  border-color: var(--darkroom-accent);
  outline: 3px solid color-mix(in srgb, var(--darkroom-accent) 28%, transparent);
  outline-offset: 3px;
}

:root[data-theme="dark"] #imageView .preview-clear {
  border: 1px solid color-mix(in srgb, var(--darkroom-muted) 34%, var(--darkroom-line));
  background: var(--darkroom-close);
  color: var(--darkroom-close-ink);
}

:root[data-theme="dark"] #imageView .preview-clear:hover,
:root[data-theme="dark"] #imageView .preview-clear:focus-visible {
  border-color: var(--darkroom-accent);
  background: var(--darkroom-accent);
  color: #1a1914;
  outline: 3px solid color-mix(in srgb, var(--darkroom-accent) 22%, transparent);
}

:root[data-theme="dark"] #chatView,
:root[data-theme="dark"] #chatView .chat-panel,
:root[data-theme="dark"] #chatView .messages {
  background: var(--darkroom-canvas);
  color: var(--darkroom-ink);
}

:root[data-theme="dark"] #chatView .studio-header {
  border-bottom-color: var(--darkroom-line);
  background: color-mix(in srgb, var(--darkroom-panel) 82%, transparent);
}

:root[data-theme="dark"] #chatView .chat-history-panel {
  border-right-color: var(--darkroom-line);
  background: var(--darkroom-panel);
}

:root[data-theme="dark"] #chatView .history-head button {
  background: transparent;
  color: var(--darkroom-muted);
}

:root[data-theme="dark"] #chatView .history-head button:hover,
:root[data-theme="dark"] #chatView .history-head button:focus-visible {
  background: color-mix(in srgb, var(--darkroom-accent) 8%, var(--darkroom-field));
  color: var(--darkroom-ink);
  outline: 2px solid color-mix(in srgb, var(--darkroom-accent) 24%, transparent);
}

:root[data-theme="dark"] #chatView .history-chat-row {
  isolation: isolate;
  transition: background-color 140ms ease;
}

:root[data-theme="dark"] #chatView .history-chat-row:hover,
:root[data-theme="dark"] #chatView .history-chat-row.active,
:root[data-theme="dark"] #chatView .history-chat-row:focus-within {
  background: color-mix(in srgb, var(--darkroom-accent) 7%, var(--darkroom-field));
}

:root[data-theme="dark"] #chatView .history-chat-row.active::before {
  content: "";
  width: 2px;
  position: absolute;
  z-index: 2;
  top: 8px;
  bottom: 8px;
  left: 0;
  border-radius: 999px;
  background: var(--darkroom-accent);
}

:root[data-theme="dark"] #chatView .history-chat-row:focus-within::before {
  content: "";
  width: 2px;
  position: absolute;
  z-index: 2;
  top: 8px;
  bottom: 8px;
  left: 0;
  border-radius: 999px;
  background: var(--darkroom-accent);
}

:root[data-theme="dark"] #chatView .history-chat {
  color: var(--darkroom-ink);
}

:root[data-theme="dark"] #chatView .history-chat:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--darkroom-accent) 28%, transparent);
  outline-offset: -2px;
}

:root[data-theme="dark"] #chatView .history-chat strong {
  color: var(--darkroom-ink);
}

:root[data-theme="dark"] #chatView .history-chat p {
  color: var(--darkroom-muted);
}

:root[data-theme="dark"] #chatView .history-chat-more {
  color: var(--darkroom-muted);
}

:root[data-theme="dark"] #chatView .history-chat-more:hover,
:root[data-theme="dark"] #chatView .history-chat-more:focus-visible {
  background: color-mix(in srgb, var(--darkroom-accent) 10%, var(--darkroom-field));
  color: var(--darkroom-ink);
  outline: 2px solid color-mix(in srgb, var(--darkroom-accent) 24%, transparent);
}

:root[data-theme="dark"] #chatView .history-chat-menu {
  border-color: var(--darkroom-line);
  background: color-mix(in srgb, var(--darkroom-field) 94%, #000 6%);
  color: var(--darkroom-ink);
}

:root[data-theme="dark"] #chatView .header-actions .text-action {
  border-color: var(--darkroom-line);
  background: var(--darkroom-field);
  color: var(--darkroom-muted);
}

:root[data-theme="dark"] #chatView .header-actions .text-action:hover,
:root[data-theme="dark"] #chatView .header-actions .text-action:focus-visible {
  border-color: var(--darkroom-accent);
  background: color-mix(in srgb, var(--darkroom-accent) 8%, var(--darkroom-field));
  color: var(--darkroom-ink);
  outline: 2px solid color-mix(in srgb, var(--darkroom-accent) 22%, transparent);
}

:root[data-theme="dark"] #chatView .canvas-overlay-close {
  border-color: color-mix(in srgb, var(--darkroom-accent) 28%, var(--darkroom-line));
  background: var(--darkroom-close);
  color: var(--darkroom-close-ink);
}

:root[data-theme="dark"] #chatView .canvas-overlay-close svg {
  color: currentColor;
  stroke: currentColor;
  stroke-width: 2.2;
}

:root[data-theme="dark"] #chatView .canvas-overlay-close:hover,
:root[data-theme="dark"] #chatView .canvas-overlay-close:focus-visible {
  border-color: var(--darkroom-accent);
  background: var(--darkroom-accent);
  color: #1a1914;
  outline: 3px solid color-mix(in srgb, var(--darkroom-accent) 24%, transparent);
}

:root[data-theme="dark"] #chatView .chat-composer {
  border-color: var(--darkroom-line);
  background: color-mix(in srgb, var(--darkroom-panel) 90%, transparent);
}

:root[data-theme="dark"] #chatView .chat-composer textarea,
:root[data-theme="dark"] #chatView .chat-welcome,
:root[data-theme="dark"] #chatView .message {
  color: var(--darkroom-ink);
}

:root[data-theme="dark"] #chatView .chat-composer textarea::placeholder,
:root[data-theme="dark"] #chatView .composer-model select {
  color: var(--darkroom-muted);
}

:root[data-theme="dark"] #chatView .chat-suggestions button {
  border-color: var(--darkroom-line);
  background: var(--darkroom-field);
  color: var(--darkroom-muted);
}

:root[data-theme="dark"] #chatView .chat-suggestions button:hover,
:root[data-theme="dark"] #chatView .chat-suggestions button:focus-visible {
  border-color: var(--darkroom-accent);
  background: color-mix(in srgb, var(--darkroom-accent) 8%, var(--darkroom-field));
  color: var(--darkroom-ink);
}

@media (prefers-reduced-motion: reduce) {
  :root[data-theme="dark"] #imageView .canvas-overlay-close,
  :root[data-theme="dark"] #imageView .reference-slot,
  :root[data-theme="dark"] #imageView .history-thumb,
  :root[data-theme="dark"] #chatView .history-chat-row {
    transition: none;
  }

  :root[data-theme="dark"] #imageView .canvas-overlay-close:hover {
    transform: none;
  }
}
```

- [ ] **Step 2: Run the focused regression check**

Run: `node tools/check-darkroom-workbench-theme.js`

Expected: exit 0 and `Darkroom workbench theme checks passed.`

- [ ] **Step 3: Run the complete existing regression suite**

Run: `npm run check`

Expected: exit 0, ending with `Read JSON UTF-8 chunk-boundary regression check passed.`

- [ ] **Step 4: Review the scoped diff**

Run:

```powershell
git diff --check -- styles.css tools/check-darkroom-workbench-theme.js
git diff -- styles.css tools/check-darkroom-workbench-theme.js
```

Expected: no whitespace errors; the only new tail content is the named theme section. Do not stage or commit because `styles.css` contains unrelated pre-existing worktree changes.

---

### Task 3: Browser visual QA and computed-style verification

**Files:**
- Verify: `styles.css`
- Output: `artifacts/design-qa/darkroom-image-view.png`
- Output: `artifacts/design-qa/darkroom-chat-view.png`

**Interfaces:**
- Consumes: the local app at `http://localhost:3000` and existing theme/palette local-storage keys.
- Produces: two screenshots plus computed-style evidence for close-button and history-text contrast.

- [ ] **Step 1: Start or reuse the local server**

Run: `try { (Invoke-WebRequest -Uri http://localhost:3000 -UseBasicParsing -TimeoutSec 2).StatusCode } catch { 0 }`

Expected: `200`. If it returns `0`, run:

```powershell
Start-Process -FilePath node -ArgumentList 'server.js' -WorkingDirectory 'Q:\音乐\Documents\New project' -WindowStyle Hidden -PassThru
```

Expected: a process object, followed by HTTP 200.

- [ ] **Step 2: Capture and inspect the online image workspace**

Open `http://localhost:3000`, set `ai-theme-mode=dark` and `ai-color-palette=yellow-black`, then reload at 1920×1080. Confirm the three-column layout is unchanged; close control has a dark background and warm-white X; prompt, reference slots, selects, count field, preview, and history use coherent graphite layers; yellow remains limited to the primary action and states. Save `artifacts/design-qa/darkroom-image-view.png`.

- [ ] **Step 3: Capture and inspect the GPT workspace**

Activate `[data-tool="chat"]`. Confirm history titles and metadata are readable; current conversation has a subtle surface and 2px indicator; recent/clear actions, menu, header actions, composer, and close icon remain readable; layout is unchanged. Save `artifacts/design-qa/darkroom-chat-view.png`.

- [ ] **Step 4: Verify computed and alternate states**

Read computed background/color for `#imageView.active .canvas-overlay-close`, and color for `#chatView .history-chat strong` and `#chatView .history-chat p`. Expected yellow-black values are visually equivalent to `#24251F`, `#FFF4C0`, `#F5F3EA`, and `#AAA89F`. Repeat at 1024px width, then light mode and one non-default palette; expect no overlap, clipping, invisible text, or displaced close control.

- [ ] **Step 5: Run fresh final verification**

Run:

```powershell
node tools/check-darkroom-workbench-theme.js
npm run check
git diff --check -- styles.css tools/check-darkroom-workbench-theme.js
```

Expected: all commands exit 0. Do not claim completion without these fresh results and current screenshots.
