# AI OS Global Appearance and Display Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让浅色、深色、自动主题和五档显示比例作用于整个 AI OS，包括无限画布，并实现与 DX OS 一致的根画布缩放和坐标反算。

**Architecture:** 新增一个无 DOM 依赖的显示偏好模块，供服务端、系统设置和桌面壳共享主题与比例规范化规则。桌面根节点负责整体 CSS 缩放，窗口壳负责逻辑视口和指针位移反算；独立主题兼容层统一现有旧应用颜色，系统设置只负责编辑账号偏好。

**Tech Stack:** Node.js 24、原生 JavaScript UMD、HTML/CSS、现有 HTTP/SQLite 偏好接口、Playwright 浏览器测试。

## Global Constraints

- 主题覆盖桌面背景、菜单栏、Dock、启动台、全部应用窗口、系统设置、无限画布和其他业务应用。
- 无限画布不再提供或保存独立主题。
- 显示比例只允许 `0.75`、`1`、`1.25`、`1.5`、`1.75`。
- 登录页不应用账号缩放，登录成功后整个 `.ai-os-desktop` 应用账号比例。
- 窗口几何始终以逻辑像素存储；物理指针位移必须除以显示比例。
- 不调用浏览器缩放或 Windows DPI API，不新增第三方依赖。
- 保留当前工作树中的所有无关改动；只暂存本计划列出的文件。
- 所有行为修改遵循 RED → GREEN → REFACTOR，并在提交前运行新鲜验证。

---

### Task 1: 统一显示偏好模型并移除独立画布主题

**Files:**
- Create: `ai-os-display.js`
- Create: `tools/check-ai-os-display.js`
- Modify: `server.js:1234-1300`
- Modify: `tools/check-system-settings-ui.js`
- Modify: `tools/check-provider-http-api.js`
- Modify: `index.html`
- Modify: `package.json`

**Interfaces:**
- Produces: `AiOsDisplay.THEMES`, `AiOsDisplay.SCALES`, `AiOsDisplay.DEFAULT_PREFERENCES`。
- Produces: `normalizePreferences(value, fallback) -> { appearance: { theme, scale, animations } }`。
- Produces: `resolveTheme(mode, media) -> 'light' | 'dark'`。
- Produces: `normalizeScale(value) -> 0.75 | 1 | 1.25 | 1.5 | 1.75`。
- Server `GET/PATCH /api/preferences` no longer returns or accepts `canvas.theme`。

- [ ] **Step 1: Write the failing shared-model test**

Create `tools/check-ai-os-display.js` with assertions equivalent to:

```js
const assert = require("node:assert/strict");
const display = require("../ai-os-display");

assert.deepEqual(display.SCALES, [0.75, 1, 1.25, 1.5, 1.75]);
assert.deepEqual(display.normalizePreferences({
  appearance: { theme: "dark", scale: 1.5, animations: "reduced", ignored: true },
  canvas: { theme: "light" },
}), { appearance: { theme: "dark", scale: 1.5, animations: "reduced" } });
assert.equal(display.normalizeScale(2), 1);
assert.equal(display.resolveTheme("system", { matches: true }), "dark");
assert.equal(display.resolveTheme("system", { matches: false }), "light");
```

Extend `tools/check-provider-http-api.js` so a saved appearance preference is returned without `canvas`, and a new `PATCH { canvas: { theme: 'dark' } }` receives `400 invalid_preference_field`.

- [ ] **Step 2: Run the focused tests to verify RED**

Run:

```powershell
node tools/check-ai-os-display.js
node --disable-warning=ExperimentalWarning tools/check-provider-http-api.js
```

Expected: the first command fails because `ai-os-display.js` is missing; the HTTP check fails because the current API still accepts and returns `canvas.theme`.

- [ ] **Step 3: Implement the shared UMD module**

Create `ai-os-display.js` with a browser/CommonJS wrapper and these rules:

```js
const THEMES = Object.freeze(["light", "dark", "system"]);
const SCALES = Object.freeze([0.75, 1, 1.25, 1.5, 1.75]);
const ANIMATIONS = Object.freeze(["full", "reduced"]);
const DEFAULT_PREFERENCES = Object.freeze({
  appearance: Object.freeze({ theme: "system", scale: 1, animations: "full" }),
});

function normalizeScale(value) {
  const scale = Number(value);
  return SCALES.includes(scale) ? scale : 1;
}

function resolveTheme(mode, media) {
  return mode === "system" && media?.matches ? "dark" : mode === "dark" ? "dark" : "light";
}
```

`normalizePreferences` must whitelist only `appearance.theme`, `appearance.scale`, and `appearance.animations`; old `canvas.theme`, provider keys, and unknown values are discarded.

- [ ] **Step 4: Make the server use the shared schema**

Load the module once in `server.js`, replace the duplicated defaults/sets with `AiOsDisplay.normalizePreferences`, and set the allowed patch schema to:

```js
const USER_PREFERENCE_FIELDS = Object.freeze({
  appearance: new Set(["theme", "scale", "animations"]),
});
```

Keep legacy stored rows readable by normalizing them on GET. Update deprecated `/api/settings` output to return only `appearance`, so it cannot reactivate an independent canvas theme.

- [ ] **Step 5: Load the shared browser module and register checks**

Insert `ai-os-display.js` before `system-settings-ui.js` in `index.html`. Add:

```json
"check:display": "node tools/check-ai-os-display.js"
```

Update `check:system-settings` so it runs the shared check before the existing settings UI check.

- [ ] **Step 6: Run GREEN verification and commit**

Run:

```powershell
node --check ai-os-display.js
npm run check:display
npm run check:system-settings
node --disable-warning=ExperimentalWarning tools/check-provider-http-api.js
```

Expected: all commands exit `0`, and the scripts print their respective `checks passed` messages.

Commit only Task 1 files:

```powershell
git add -- ai-os-display.js tools/check-ai-os-display.js server.js tools/check-system-settings-ui.js tools/check-provider-http-api.js index.html package.json
git commit -m "refactor: unify global display preferences"
```

---

### Task 2: Apply preferences globally and reproduce DX OS root scaling

**Files:**
- Modify: `ai-os-display.js`
- Modify: `desktop-shell.js:1-35,280-330,430-455`
- Modify: `desktop-shell.css:1-25,242-255,668-678`
- Modify: `tools/check-ai-os-display.js`
- Modify: `tools/check-ai-os-shell.js`

**Interfaces:**
- Produces: `applyPreferences(value, documentRoot, media) -> normalizedPreferences`。
- Produces: `logicalViewport(innerWidth, innerHeight, scale, chrome) -> { width, height }`。
- Produces: `logicalDelta(clientDelta, scale) -> number`。
- Emits: `ai-os-preferences-applied` with `{ preferences, theme, scale }`。
- Consumes: `WindowManager.setViewport({ width, height })`。

- [ ] **Step 1: Extend display tests for root scaling and coordinates**

Add assertions equivalent to:

```js
assert.deepEqual(display.logicalViewport(1440, 900, 1.5, {
  menuBarHeight: 38,
  dockHeight: 86,
}), { width: 960, height: 476 });
assert.equal(display.logicalDelta(150, 1.5), 100);

const desktopStyle = {};
const fakeDocument = {
  getElementById(id) {
    return id === "aiOsDesktop" ? { style: { setProperty(k, v) { desktopStyle[k] = v; } } } : null;
  },
  defaultView: { CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } } },
};
const fakeRoot = { dataset: {}, ownerDocument: fakeDocument };
display.applyPreferences({ appearance: { theme: "light", scale: 1.75 } }, fakeRoot, { matches: false });
assert.equal(fakeRoot.dataset.theme, "light");
assert.equal(desktopStyle["--system-scale"], "1.75");
```

Extend `tools/check-ai-os-shell.js` to require `--system-scale`, `calc(100% / var(--system-scale))`, `transform: scale(var(--system-scale))`, and logical delta conversion.

- [ ] **Step 2: Run the new checks to verify RED**

Run:

```powershell
npm run check:display
npm run check:ai-os-shell
```

Expected: failures identify missing `logicalViewport`, `logicalDelta`, and root transform contracts.

- [ ] **Step 3: Implement global preference application**

In `applyPreferences`:

```js
target.dataset.themeMode = preferences.appearance.theme;
target.dataset.theme = resolveTheme(preferences.appearance.theme, media);
target.dataset.animations = preferences.appearance.animations;
target.dataset.uiScale = String(preferences.appearance.scale);
target.removeAttribute?.("data-canvas-theme");
target.removeAttribute?.("data-canvas-theme-mode");
target.removeAttribute?.("data-palette");
target.ownerDocument?.getElementById("aiOsDesktop")?.style
  .setProperty("--system-scale", String(preferences.appearance.scale));
```

Save only the theme mode in local storage for pre-login first paint and dispatch the global preference event.

- [ ] **Step 4: Implement the DX OS root canvas CSS**

Replace the root-font scaling rule with:

```css
.ai-os-desktop {
  --system-scale: 1;
  top: 0;
  left: 0;
  width: calc(100% / var(--system-scale));
  height: calc(100% / var(--system-scale));
  min-height: calc(600px / var(--system-scale));
  transform: scale(var(--system-scale));
  transform-origin: top left;
}
```

Keep the auth gate outside `.ai-os-desktop`, and remove `html { font-size: calc(...) }` from `system-settings.css`.

- [ ] **Step 5: Convert desktop viewport and pointer operations to logical units**

In `desktop-shell.js`, read the scale through `AiOsDisplay.normalizeScale(document.documentElement.dataset.uiScale)`. Calculate viewport with `AiOsDisplay.logicalViewport`, and change drag/resize deltas to:

```js
const dx = AiOsDisplay.logicalDelta(moveEvent.clientX - start.x, displayScale());
const dy = AiOsDisplay.logicalDelta(moveEvent.clientY - start.y, displayScale());
```

On `ai-os-preferences-applied`, call `manager.setViewport(desktopViewport())` without closing or recreating windows. Keep the resize listener using the same logical viewport.

- [ ] **Step 6: Run GREEN verification and commit**

Run:

```powershell
npm run check:display
npm run check:ai-os-shell
npm run check:desktop-window-manager
node --check desktop-shell.js
```

Expected: all exit `0`; existing window manager behaviors remain green.

Commit only Task 2 files:

```powershell
git add -- ai-os-display.js desktop-shell.js desktop-shell.css system-settings.css tools/check-ai-os-display.js tools/check-ai-os-shell.js
git commit -m "feat: add system-wide display scaling"
```

---

### Task 3: Rebuild the Appearance page controls to match DX OS

**Files:**
- Modify: `system-settings-ui.js:1-75,216-235,460-525`
- Modify: `system-settings.css:1-180,291-380`
- Modify: `tools/check-system-settings-ui.js`

**Interfaces:**
- Consumes: `window.AiOsDisplay.normalizePreferences` and `applyPreferences`。
- Produces: `[data-settings-scale]` controls with `.settings-scale-preview` and `--scale-preview`。
- Removes: `[data-settings-canvas-theme]` and `preferences.canvas`。

- [ ] **Step 1: Write failing markup and namespace checks**

Extend `tools/check-system-settings-ui.js` with assertions equivalent to:

```js
assert.doesNotMatch(ui, /data-settings-canvas-theme|preferences\.canvas/);
assert.match(ui, /class="settings-scale-preview"/);
assert.match(ui, /--scale-preview:/);
assert.doesNotMatch(css, /^:root\s*\{[\s\S]*--settings-sidebar:/m);
assert.match(css, /\.ai-os-settings-layout\s*\{[\s\S]*--ai-settings-sidebar-bg:/);
assert.match(css, /\.settings-scale-sample-dots/);
assert.match(css, /\.settings-scale-sample-lines/);
```

- [ ] **Step 2: Run the settings check to verify RED**

Run: `npm run check:system-settings`

Expected: failure on the old canvas theme control, old global setting variables, and missing miniature-window scale preview.

- [ ] **Step 3: Delegate preference logic and remove the canvas theme UI**

Replace the duplicated constants and normalizer with `AiOsDisplay`. Keep compatibility exports:

```js
const display = globalThis.AiOsDisplay || require("./ai-os-display");
const { THEMES, SCALES, DEFAULT_PREFERENCES, normalizePreferences, resolveTheme, applyPreferences } = display;
```

Delete the canvas theme card, its click handler, its media-change condition, and all `dataset.canvasTheme*` writes.

- [ ] **Step 4: Build DX OS-style scale preview markup**

Each scale button must render a preview with semantic spans:

```html
<span class="settings-scale-preview" style="--scale-preview:1.25">
  <span class="settings-scale-sample">
    <span class="settings-scale-sample-dots"><i></i><i></i><i></i></span>
    <span class="settings-scale-sample-title">文字</span>
    <span class="settings-scale-sample-lines"><i></i><i></i></span>
  </span>
</span>
```

Retain the labels “更多空间 / 标准 / 较大文字 / 大文字 / 更大文字” and exact percentage values.

- [ ] **Step 5: Scope and restyle the Settings variables**

Move all settings variables from `:root` into `.ai-os-settings-layout` and rename collision-prone names, for example:

```css
.ai-os-settings-layout {
  --ai-settings-surface: rgba(247, 249, 252, .88);
  --ai-settings-sidebar-bg: rgba(225, 234, 246, .72);
  --ai-settings-card-bg: rgba(255, 255, 255, .7);
}
html[data-theme="dark"] .ai-os-settings-layout { /* complete dark values */ }
```

Implement the five-column miniature windows with an 88×72 maximum preview, three traffic-light dots, scaled title/text lines, selected blue outline, and responsive two-column fallback below 620px.

- [ ] **Step 6: Run GREEN verification and commit**

Run:

```powershell
npm run check:system-settings
node --check system-settings-ui.js
```

Expected: both exit `0` and the settings check prints `System settings UI checks passed.`

Commit only Task 3 files:

```powershell
git add -- system-settings-ui.js system-settings.css tools/check-system-settings-ui.js
git commit -m "feat: align appearance settings with DX OS"
```

---

### Task 4: Make light and dark themes cover the entire AI OS and canvas

**Files:**
- Create: `ai-os-theme.css`
- Create: `tools/check-ai-os-global-theme.js`
- Modify: `index.html`
- Modify: `desktop-shell.css`
- Modify: `styles.css`
- Modify: `canvas-agent.css`
- Modify: `script.js:48-70,2460-2510,3165-3200,3660-3685`
- Modify: `package.json`

**Interfaces:**
- Consumes: `html[data-theme='light'|'dark']` only。
- Produces: semantic global tokens for wallpaper, chrome, window, surface, sidebar, field, text, border, shadow, and canvas grid。
- Removes: active use of `data-palette`, legacy theme controls, and independent canvas theme state。

- [ ] **Step 1: Write a failing global-theme contract check**

Create `tools/check-ai-os-global-theme.js` to verify:

```js
assert.match(html, /ai-os-theme\.css/);
assert.doesNotMatch(html, /dataset\.palette\s*=/);
assert.match(themeCss, /html\[data-theme="light"\]/);
assert.match(themeCss, /html\[data-theme="dark"\]/);
for (const token of ["--os-wallpaper", "--os-window-bg", "--os-sidebar-bg", "--os-field-bg", "--grid-line"]) {
  assert.match(themeCss, new RegExp(token.replace("--", "--")));
}
assert.doesNotMatch(script, /data-settings-palette|setColorPalette\(settingsState/);
assert.match(themeCss, /\.infinite-canvas/);
assert.match(themeCss, /\.canvas-agent-panel/);
```

Also check that `ai-os-theme.css` is linked after `system-settings.css` so the compatibility layer wins the cascade.

- [ ] **Step 2: Run the global-theme check to verify RED**

Run: `node tools/check-ai-os-global-theme.js`

Expected: failure because the global compatibility stylesheet does not exist and palette code is still active.

- [ ] **Step 3: Define complete light and dark semantic palettes**

Create `ai-os-theme.css` with explicit light and dark roots. Light values must use cool translucent whites and pale blue sidebars; dark values must use graphite glass surfaces. Map legacy tokens to the same system palette:

```css
html[data-theme="light"] {
  color-scheme: light;
  --bg: #eef3f8;
  --stage: #edf2f7;
  --panel: rgba(255, 255, 255, .88);
  --field: rgba(255, 255, 255, .82);
  --ink: #202630;
  --muted: #778291;
  --grid-line: rgba(51, 71, 98, .07);
  --os-sidebar-bg: rgba(222, 233, 246, .78);
}
html[data-theme="dark"] {
  color-scheme: dark;
  --bg: #10141b;
  --stage: #141a23;
  --panel: rgba(29, 35, 45, .9);
  --field: rgba(18, 23, 31, .82);
  --ink: #f2f5f9;
  --muted: #a4afbd;
  --grid-line: rgba(196, 211, 232, .08);
  --os-sidebar-bg: rgba(35, 43, 55, .86);
}
```

Use these variables for body wallpaper, menu bar, Dock, launchpad, app windows, titlebars, window content, dialogs, popovers, account/shared views, settings, `.infinite-canvas`, canvas nodes, toolbars, menus, and agent panel. Preserve media pixels and semantic status colors.

- [ ] **Step 4: Retire the legacy palette and duplicate theme controls**

Remove the boot-time `data-palette` assignment from `index.html`. In `script.js`, stop rendering and handling old theme/palette controls when the AI OS system settings module is present; remove calls that apply `settingsState.appearance.palette`. Keep unrelated canvas interaction settings intact.

- [ ] **Step 5: Verify source contracts and regressions**

Run:

```powershell
node tools/check-ai-os-global-theme.js
npm run check:ai-os-shell
npm run check:system-settings
node tools/check-canvas-text-theme.js
node tools/check-canvas-shell-history-theme.js
node --check script.js
```

Expected: all exit `0` with no theme contract regressions.

- [ ] **Step 6: Commit the global theme layer**

```powershell
git add -- ai-os-theme.css tools/check-ai-os-global-theme.js index.html desktop-shell.css styles.css canvas-agent.css script.js package.json
git commit -m "feat: apply appearance across the AI OS"
```

---

### Task 5: Correct scale-sensitive canvas interactions

**Files:**
- Create: `tools/check-ai-os-scale-interactions.js`
- Modify: `script.js`
- Modify: `tools/check-ai-os-browser.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `window.AiOsDisplay.currentScale(document.documentElement)` and `logicalDelta`。
- Produces: `toSystemDelta(delta)` local helper for raw client-coordinate deltas written into logical CSS or canvas state。

- [ ] **Step 1: Identify and lock raw-delta interaction paths**

Create `tools/check-ai-os-scale-interactions.js`. It must assert that the local helper delegates to `AiOsDisplay.logicalDelta`, and that the raw delta paths for canvas pan, node move, node resize, selection rectangle, image crop/pan, and floating menu placement use either `getBoundingClientRect()` normalization or `toSystemDelta` exactly once.

The test must explicitly reject direct state updates such as:

```js
canvasState.x = start.offsetX + moveEvent.clientX - start.x;
previewState.x = previewState.originX + moveEvent.clientX - previewState.startX;
```

- [ ] **Step 2: Run the interaction check to verify RED**

Run: `node tools/check-ai-os-scale-interactions.js`

Expected: failure listing the direct client-delta paths that do not account for the system scale.

- [ ] **Step 3: Add one scale helper and patch only affected paths**

Add:

```js
function toSystemDelta(value) {
  return window.AiOsDisplay?.logicalDelta(value, window.AiOsDisplay.currentScale(document.documentElement)) ?? value;
}
```

Use it only where a physical pointer delta is written directly into logical CSS/world coordinates. Do not divide normalized ratios or values derived from a scaled `getBoundingClientRect()` a second time.

- [ ] **Step 4: Extend browser smoke coverage**

In `tools/check-ai-os-browser.js`, after login:

1. Open system settings and choose 150%.
2. Assert `.ai-os-desktop` computed transform is a 1.5 scale matrix.
3. Drag a window titlebar by 150 physical pixels and assert its logical x changes by approximately 100 pixels.
4. Open the canvas, pan by a measured pointer distance, and assert the logical canvas offset matches the inverse scale.
5. Restore 100% before remaining existing smoke checks.

- [ ] **Step 5: Run GREEN verification and commit**

Run:

```powershell
node tools/check-ai-os-scale-interactions.js
node --check script.js
npm run check:desktop-v2
```

Run the browser check against the isolated test server described in Task 6. Expected: all commands exit `0`, with pointer geometry assertions inside their stated tolerance.

Commit only Task 5 files:

```powershell
git add -- tools/check-ai-os-scale-interactions.js script.js tools/check-ai-os-browser.js package.json
git commit -m "fix: normalize interactions for display scale"
```

---

### Task 6: Browser visual QA, persistence, and final regression

**Files:**
- Modify: `tools/check-ai-os-browser.js`
- Modify: `design-qa.md`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-04-global-appearance-and-display-scale-design.md`

**Interfaces:**
- Verifies all interfaces produced by Tasks 1–5。
- Produces screenshots under `artifacts/design-qa/global-appearance-scale/`。

- [ ] **Step 1: Start an isolated browser-test host**

Use a temporary data directory and port `3199`, following the existing browser-test launcher. Do not use or rewrite the user's active account database. Confirm `/api/system/health` responds before opening Playwright.

- [ ] **Step 2: Verify theme coverage in the browser**

At 1440×900, capture matching screenshots for light and dark mode with System Settings and Infinite Canvas visible. Assert computed colors for the settings sidebar, window content, canvas background, field background, menu bar, and Dock change between modes. Assert no independent “画布主题” label exists.

Save:

```text
artifacts/design-qa/global-appearance-scale/light-settings.png
artifacts/design-qa/global-appearance-scale/dark-settings.png
artifacts/design-qa/global-appearance-scale/light-canvas.png
artifacts/design-qa/global-appearance-scale/dark-canvas.png
```

- [ ] **Step 3: Verify all five scale levels and persistence**

For each scale, assert the computed desktop transform and compensated logical size. At 150%, reload and log in again, then assert the same account restores 150%. Create or use the existing test ordinary account and assert it remains at its own default or saved scale.

- [ ] **Step 4: Run design QA against the reference screenshot**

Open the supplied DX OS screenshot and the latest 100% light settings screenshot at the same viewport. Record layout, spacing, typography, preview-card, color, clipping, and interaction findings in `design-qa.md`. Fix every P0, P1, and P2 issue, recapture, and repeat until the file ends with:

```text
final result: passed
```

Remaining P3 polish may be recorded as optional follow-up only.

- [ ] **Step 5: Run the full relevant verification suite**

Run fresh:

```powershell
npm run check:display
npm run check:system-settings
npm run check:ai-os-shell
npm run check:desktop-v2
npm run check:ai-os
npm run check:auth
npm run check:resources
node tools/check-ai-os-global-theme.js
node tools/check-ai-os-scale-interactions.js
node tools/check-canvas-text-theme.js
node tools/check-canvas-shell-history-theme.js
node --check server.js
node --check script.js
node --check desktop-shell.js
```

Expected: every command exits `0`. Record exact results and any unrelated pre-existing failure rather than deleting checks.

- [ ] **Step 6: Update documentation and commit**

Update README with global theme behavior, five display scales, per-account persistence, and the fact that Canvas follows the system theme. Append actual implementation and verification results to the design spec.

Commit only the final task files and intentional remaining changes:

```powershell
git add -- tools/check-ai-os-browser.js design-qa.md README.md docs/superpowers/specs/2026-09-04-global-appearance-and-display-scale-design.md
git commit -m "test: verify global appearance and scaling"
```

## Self-review

- Tasks 1–6 cover every requirement in the approved design: one preference schema, no independent canvas theme, full-system colors, root-canvas scaling, logical window coordinates, scale-sensitive canvas interactions, account persistence, and visual QA.
- Shared signatures (`normalizePreferences`, `applyPreferences`, `logicalViewport`, `logicalDelta`, `currentScale`) are named consistently across tasks.
- The plan does not require a framework, a network dependency, browser zoom, Windows DPI changes, or unrelated canvas-engine refactoring.
- Each behavior change starts with a failing focused check and ends with a fresh verification plus a narrowly scoped commit.

