# Image Model Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the long flat image-model dropdown with a searchable, provider-grouped, health-aware picker shared by the image workspace and canvas generator nodes.

**Architecture:** Keep a native select as the form-compatible source of truth, hide it visually, and place a custom picker button/popover above it. A focused browser-side model-picker module handles grouping, filtering, recent/favorite persistence, accessible keyboard behavior, and readable capability/status labels; the existing generation pipeline continues consuming the selected model ID.

**Tech Stack:** Vanilla JavaScript, HTML, CSS, localStorage, existing public `/api/image-models` catalog, Node assertion and JSDOM-like fake DOM test patterns already used in `tools/`.

## Global Constraints

- The model identifier sent to the server must not change.
- Exact model selection remains pinned; only the explicit “自动选择（推荐）” entry permits provider fallback.
- Disabled or incapable models are not selectable; unhealthy models remain visible with a warning.
- Favorites and recent choices are stored per signed-in account when an account identifier is available, otherwise per browser profile.
- The picker must work in light/dark themes and at 75%, 100%, 125%, 150%, and 175% interface scale.
- Do not modify `.git`; repository metadata work remains deferred.

---

### Task 1: Pure model-picker catalog and preference rules

**Files:**
- Create: `image-model-picker.js`
- Test: `tools/check-image-model-picker.js`

**Interfaces:**
- Consumes: catalog models with `id`, `modelId`, `displayName`, `providerId`, `providerName`, `capabilities`, `resolutions`, `platform`, `family`, and `state`.
- Produces: `normalizeCatalog`, `groupModels`, `filterModels`, `toggleFavorite`, `recordRecent`, `getModelPresentation`, and browser `ImageModelPicker` API.

- [x] **Step 1: Write failing pure-rule tests**

Assert grouping by provider, friendly primary labels, duplicate-name disambiguation, capability labels, healthy-before-warning ordering, case-insensitive search across model/provider names, favorites, recents, and hidden non-generation models.

- [x] **Step 2: Run the test and confirm RED**

Run: `node tools/check-image-model-picker.js`

Expected: FAIL because `image-model-picker.js` does not exist.

- [x] **Step 3: Implement pure catalog and persistence rules**

Create a UMD-style module usable from Node tests and the browser. Keep storage keys account-scoped, cap recents at five, and produce presentation objects with primary name, provider secondary line, capability/resolution badges, and normalized health state.

- [x] **Step 4: Run the pure-rule test and confirm GREEN**

Run: `node tools/check-image-model-picker.js`

Expected: all model-picker rule assertions pass.

### Task 2: Shared searchable picker UI

**Files:**
- Modify: `index.html`
- Modify: `script.js`
- Modify: `styles.css`
- Test: `tools/check-image-model-picker-ui.js`

**Interfaces:**
- Consumes: the hidden native `#imageModel`, model catalog from `loadImageModels`, and generated `.canvas-node-model` controls.
- Produces: a compact selected-model button and popover with search, “推荐/最近/收藏/全部” filters, provider groups, health badges, favorite buttons, and a “管理模型服务” shortcut.

- [x] **Step 1: Write failing static/UI contract tests**

Assert the new module is loaded before `script.js`, the image form has a picker mount next to the hidden source select, the popover has dialog/listbox semantics, and canvas nodes initialize the same picker behavior.

- [x] **Step 2: Run the UI test and confirm RED**

Run: `node tools/check-image-model-picker-ui.js`

Expected: FAIL because the picker mount and runtime integration are absent.

- [x] **Step 3: Integrate the image workspace picker**

Render the selected friendly model, provider, status dot, and supported resolutions. Open a bounded popover, focus search, filter without reloading, collapse provider groups, support Escape and outside-click close, update the hidden select, dispatch `change`, and persist recent/favorite state.

- [x] **Step 4: Integrate canvas generator nodes**

Enhance each `.canvas-node-model` select with the same compact picker using the shared catalog. Rehydrate enhancements after model refresh and node restoration without duplicating event listeners.

- [x] **Step 5: Implement responsive Apple-style presentation**

Add light/dark tokens, maximum popover height, clipped provider sections, visible focus rings, health colors, favorite affordance, compact canvas-node sizing, and scale-safe typography. The native select remains accessible as a fallback but is visually hidden after enhancement.

- [x] **Step 6: Run UI tests and syntax checks**

Run: `node tools/check-image-model-picker-ui.js && node --check image-model-picker.js && node --check script.js`

Expected: all checks pass.

### Task 3: Catalog health and automatic recommendation

**Files:**
- Modify: `server.js`
- Modify: `script.js`
- Test: `tools/check-image-model-catalog-presentation.js`

**Interfaces:**
- Consumes: latest provider monitoring and image usage records.
- Produces: non-secret catalog fields `state`, `successRate`, `latencyMs`, `lastUsedAt`, and an `auto` choice that does not send a pinned provider/model.

- [x] **Step 1: Write failing catalog presentation tests**

Assert catalog entries inherit provider health, never expose base URLs or API keys, and order the auto recommendation by enabled state, recent success, administrator order, and latency.

- [x] **Step 2: Run the catalog test and confirm RED**

Run: `node tools/check-image-model-catalog-presentation.js`

Expected: FAIL because the current catalog reports every candidate as `unknown`.

- [x] **Step 3: Add non-secret provider health summaries**

Use the existing monitoring history to derive each provider's current state and aggregate recent image usage. Return only the state/rate/latency/time fields required by the picker.

- [x] **Step 4: Add explicit automatic selection semantics**

Represent auto selection only in the browser. When selected, omit `modelId` and `providerId` so the existing capability resolver may use configured fallback; exact rows continue sending both IDs.

- [x] **Step 5: Run catalog and routing tests**

Run: `node tools/check-image-model-catalog-presentation.js && node tools/check-image-model-routing.js && node tools/check-media-provider-bridge.js`

Expected: health presentation and pinned/automatic routing assertions pass.

### Task 4: Browser regression verification

**Files:**
- Modify: `docs/superpowers/plans/2026-09-06-image-model-picker-implementation.md`
- Create: `tools/check-image-model-picker-browser.js`

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: checked plan steps and fresh end-to-end evidence.

- [x] **Step 1: Run focused UI suites**

Run: `node tools/check-image-model-picker.js && node tools/check-image-model-picker-ui.js && node tools/check-image-model-catalog-presentation.js`

Expected: all pass.

- [x] **Step 2: Run relevant application suites**

Run: `npm run check:media-provider && npm run check:provider-routing && node tools/check-ai-os-global-theme.js && node tools/check-ai-os-scale-interactions.js`

Expected: all pass.

- [x] **Step 3: Perform browser smoke verification**

Start the local service, sign in through the existing test path, open an image generator node, search a provider/model, favorite it, select it, reopen the picker, and verify selection/favorite/recent state plus dark/light rendering.

- [x] **Step 4: Mark completed steps**

Replace completed `[ ]` with `[x]` in this file. Do not commit because `.git` work is explicitly deferred.
