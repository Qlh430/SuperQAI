# Portable First-Run Migration UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unsafe native-dialog migration flow with an explicit first-run setup window that can migrate, start fresh, retry safely, and never open an empty workbench after a failed migration.

**Architecture:** Keep `desktop/portable-migration.js` and `desktop/migrate-data-cli.js` as the migration engine. Refactor `desktop/portable-setup.js` into a result-returning controller plus a small Electron UI adapter. Add an isolated preload bridge and a dedicated setup page, then make `desktop/main.js` continue only after `{ action: "fresh" }` or `{ action: "migrated", report }`.

**Tech Stack:** Electron 44, CommonJS, Node 24, Electron `BrowserWindow`, `ipcMain`/`contextBridge`, existing JSON-lines migration CLI.

**Status:** Implemented and verified on 2026-09-27.

## Global Constraints

- Do not change copy, hash, SQLite recovery, provider-key, locking, or rollback semantics in `desktop/portable-migration.js`.
- The setup UI must never display API keys, `.env` values, database contents, private file names, or the selected source path.
- A failed migration must remain in the setup flow until the user retries, chooses a different source, explicitly chooses fresh start, or quits.
- `desktop/main.js` must not start the local service after `quit` or an unhandled hidden migration failure.
- Interactive buttons must remain keyboard accessible, have visible focus states, and be at least 44px tall.
- `--import-from` and `--hidden` must retain non-interactive automated migration behavior.
- The public `1.0.3` release must not be modified; this fix is for a later version after user verification.

---

### Task 1: Extract the setup state machine and safe error mapping

**Files:**
- Modify: `desktop/portable-setup.js`
- Test: `tools/check-portable-first-run-ui.js`

**Interfaces:**
- Consumes: `inspectLegacyProject(sourceRoot)` and `importLegacyProject({ sourceRoot, targetDataDir, onProgress })` from `desktop/portable-migration.js`.
- Produces: `runPortableSetup(options)`, `translateMigrationError(error)`, `toSafeInspectionSummary(inspection)`, `preparePortableData(options)`, and `hasBusinessData(dataDir)`.
- `runPortableSetup` returns exactly `{ action: "fresh" }`, `{ action: "migrated", report }`, or `{ action: "quit" }`.

- [ ] **Step 1: Write the failing controller test**

Create `tools/check-portable-first-run-ui.js` with a temporary portable data directory and an injected setup UI:

```js
const actions = [
  { type: "selectMigration" },
  { type: "confirmMigration" },
  { type: "fresh" },
];
const states = [];
const result = await preparePortableData({
  paths: { portableRoot: root, dataDir },
  argv: [],
  createSetupUi: async () => ({
    pickSource: async () => "C:\\private\\old-project",
    waitForAction: async () => actions.shift(),
    update: (state) => states.push(state),
    close() {},
  }),
  inspectSource: async () => ({
    sourceRoot: "C:\\private\\old-project",
    sourceKind: "project",
    fileCount: 12,
    totalBytes: 2048,
    databaseCount: 2,
    excludedCount: 1,
    hasEnv: true,
    hasOutput: true,
    hasWorkflows: true,
  }),
  runMigration: async () => {
    const error = new Error("private database detail");
    error.code = "invalid_database";
    throw error;
  },
});
assert.deepEqual(result, { action: "fresh" });
assert.ok(states.some((state) => state.view === "error" && state.error.code === "invalid_database"));
assert.doesNotMatch(JSON.stringify(states), /private|database detail|old-project/);
```

- [ ] **Step 2: Run the check and verify it fails**

Run: `node tools/check-portable-first-run-ui.js`

Expected: FAIL because the current `preparePortableData` only returns booleans and opens `migration.html`.

- [ ] **Step 3: Implement the result contract and state machine**

In `desktop/portable-setup.js`, add:

```js
async function runPortableSetup({
  initialSource = "",
  inspectSource,
  runMigration,
  pickSource,
  waitForAction,
  update,
}) {
  let source = initialSource;
  let inspection = null;
  let initialError = null;
  for (;;) {
    if (source && !inspection) {
      update({ view: "inspecting" });
      try {
        inspection = toSafeInspectionSummary(await inspectSource(source));
        update({ view: "preview", source: inspection });
      } catch (error) {
        initialError = translateMigrationError(error);
        source = "";
        update({ view: "welcome", error: initialError });
        continue;
      }
    } else if (!source) {
      update({ view: "welcome", error: initialError });
    }
    const action = await waitForAction();
    if (action.type === "quit") return { action: "quit" };
    if (action.type === "fresh") return { action: "fresh" };
    if (["selectMigration", "chooseAnother"].includes(action.type)) {
      source = await pickSource();
      inspection = null;
      initialError = null;
      continue;
    }
    if (action.type !== "confirmMigration" || !inspection) continue;
    for (;;) {
      update({ view: "migrating", source: inspection });
      try {
        const report = await runMigration(source, (progress) => update({ view: "migrating", source: inspection, progress }));
        update({ view: "success", source: inspection, report: toSafeReport(report) });
        for (;;) {
          const finished = await waitForAction();
          if (finished.type === "openSystem") return { action: "migrated", report };
          if (finished.type === "quit") return { action: "quit" };
        }
      } catch (error) {
        update({ view: "error", source: inspection, error: translateMigrationError(error) });
        const recovery = await waitForAction();
        if (recovery.type === "quit") return { action: "quit" };
        if (recovery.type === "fresh") return { action: "fresh" };
        if (recovery.type === "chooseAnother") {
          source = "";
          inspection = null;
          break;
        }
        if (recovery.type === "retryMigration") continue;
      }
    }
  }
}
```

Add the Chinese code map with the exact codes from the design and strip all private inspection data through `toSafeInspectionSummary`.

- [ ] **Step 4: Run the check and verify it passes**

Run: `node tools/check-portable-first-run-ui.js`

Expected: `Portable first-run UI checks passed.`

- [ ] **Step 5: Commit**

Run:

```powershell
git add desktop/portable-setup.js tools/check-portable-first-run-ui.js docs/superpowers/plans/2026-09-27-portable-first-run-migration-ui.md
git commit -m "fix: make portable migration recovery explicit"
```

Expected: commit succeeds when `.git` is writable. If the workspace denies `.git/index.lock`, record the failure and continue without reverting any work.

---

### Task 2: Build the isolated setup window and preload bridge

**Files:**
- Create: `desktop/portable-setup.html`
- Create: `desktop/portable-setup-preload.js`
- Modify: `desktop/portable-setup.js`

**Interfaces:**
- Consumes: setup actions `selectMigration`, `confirmMigration`, `retryMigration`, `chooseAnother`, `fresh`, `openSystem`, `quit`.
- Produces: `window.aiOsSetup.getState()`, `window.aiOsSetup.sendAction(type)`, and `window.aiOsSetup.onState(callback)`.
- Produces: `createElectronSetupUi({ BrowserWindow, ipcMain, dialog, hidden })` returning `{ pickSource, waitForAction, update, close }`.

- [ ] **Step 1: Extend the failing test**

In `tools/check-portable-first-run-ui.js`, assert:

```js
const html = fs.readFileSync(path.join(workspace, "desktop/portable-setup.html"), "utf8");
const preload = fs.readFileSync(path.join(workspace, "desktop/portable-setup-preload.js"), "utf8");
assert.match(html, /id="welcomeView"/);
assert.match(html, /id="migrationView"/);
assert.match(html, /id="resultView"/);
assert.match(html, /迁移旧数据/);
assert.match(html, /直接全新开始/);
assert.match(preload, /contextBridge\.exposeInMainWorld\("aiOsSetup"/);
assert.doesNotMatch(preload, /nodeIntegration/);
```

- [ ] **Step 2: Run the check and verify it fails**

Run: `node tools/check-portable-first-run-ui.js`

Expected: FAIL because the setup page and isolated preload do not exist.

- [ ] **Step 3: Create the setup page**

Create a 720x620 setup window page with three sections:

```html
<section id="welcomeView" class="view">
  <p class="eyebrow">首次启动</p>
  <h1>准备你的 AI OS</h1>
  <p>可以复制旧项目中的账号、画布、图片和接口配置，也可以直接开始使用空白系统。</p>
  <div class="choices">
    <button id="migrateChoice" class="primary" type="button">
      <strong>迁移旧数据</strong>
      <span>先检查旧项目，再决定是否开始复制。</span>
    </button>
    <button id="freshChoice" class="secondary" type="button">
      <strong>直接全新开始</strong>
      <span>不复制任何旧数据，进入空白工作台。</span>
    </button>
  </div>
</section>
<section id="migrationView" class="view" hidden>
  <p class="eyebrow">迁移旧数据</p>
  <h2 id="migrationTitle">正在检查旧项目…</h2>
  <dl id="sourceSummary"></dl>
  <progress id="migrationProgress" max="1" value="0"></progress>
  <p id="migrationStatus" role="status" aria-live="polite"></p>
  <div class="actions">
    <button id="confirmMigration" class="primary" type="button">开始迁移</button>
    <button id="chooseAnother" type="button">重新选择</button>
    <button id="freshFromMigration" type="button">直接全新开始</button>
  </div>
</section>
<section id="resultView" class="view" hidden>
  <p id="resultState" class="state-label"></p>
  <h2 id="resultTitle"></h2>
  <p id="resultMessage"></p>
  <dl id="resultSummary"></dl>
  <div class="actions">
    <button id="retryMigration" class="primary" type="button">重试迁移</button>
    <button id="chooseAnotherFromResult" type="button">重新选择</button>
    <button id="freshFromResult" type="button">直接全新开始</button>
    <button id="openSystem" class="primary" type="button">打开 AI OS</button>
  </div>
</section>
```

Use responsive CSS with `min-height: 44px` on buttons, visible `:focus-visible`, no overflow at 520px width, and state changes that hide/show the correct controls.

- [ ] **Step 4: Create the isolated preload bridge**

Create `desktop/portable-setup-preload.js`:

```js
"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aiOsSetup", Object.freeze({
  getState: () => ipcRenderer.invoke("portable-setup:get-state"),
  sendAction: (type) => ipcRenderer.invoke("portable-setup:action", String(type || "")),
  onState: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("portable-setup:state", listener);
    return () => ipcRenderer.removeListener("portable-setup:state", listener);
  },
}));
```

- [ ] **Step 5: Add the Electron setup adapter**

In `desktop/portable-setup.js`, create one window with:

```js
const setupWindow = new BrowserWindow({
  width: 720,
  height: 620,
  minWidth: 520,
  minHeight: 540,
  show: false,
  title: "设置 AI OS",
  autoHideMenuBar: true,
  backgroundColor: "#eef3f8",
  webPreferences: {
    preload: path.join(__dirname, "portable-setup-preload.js"),
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
  },
});
```

Register a scoped `portable-setup:action` listener and `portable-setup:get-state` handler. Ignore messages from any sender other than the setup window. Treat `closed` as `{ type: "quit" }`, remove listeners in `close()`, and send every state with `webContents.send("portable-setup:state", state)`.

- [ ] **Step 6: Run syntax and page checks**

Run:

```powershell
node --check desktop/portable-setup.js
node --check desktop/portable-setup-preload.js
node tools/check-portable-first-run-ui.js
```

Expected: all commands pass.

---

### Task 3: Integrate the result contract into desktop startup

**Files:**
- Modify: `desktop/main.js`
- Modify: `desktop/portable-setup.js`
- Test: `tools/check-startup-loading.js`

**Interfaces:**
- Consumes: `preparePortableData(options)` returning `{ action: "fresh" }`, `{ action: "migrated", report }`, or `{ action: "quit" }`.
- Produces: service startup that occurs only after an explicit fresh or successful migrated decision.

- [ ] **Step 1: Update the startup regression expectations**

In `tools/check-startup-loading.js`, add:

```js
assert.match(main, /const setupResult = await preparePortableData/);
assert.match(main, /setupResult\.action !== "fresh" && setupResult\.action !== "migrated"/);
assert.match(main, /if \(!setupResult\)/);
assert.doesNotMatch(main, /if \(!await preparePortableData/);
```

- [ ] **Step 2: Run the check and verify it fails**

Run: `node tools/check-startup-loading.js`

Expected: FAIL because `main.js` still treats the result as a boolean.

- [ ] **Step 3: Integrate the safe startup gate**

Change `desktop/main.js`:

```js
const setupResult = await preparePortableData({
  paths: runtimePaths,
  dialog,
  BrowserWindow,
  ipcMain,
  argv: process.argv,
  onSetupWindowOpen: () => {
    if (!hiddenLaunch && startupWindow && !startupWindow.isDestroyed()) startupWindow.hide();
  },
});
if (setupResult.action !== "fresh" && setupResult.action !== "migrated") {
  closeStartupWindow();
  isQuitting = true;
  app.quit();
  return;
}
if (!hiddenLaunch && startupWindow && !startupWindow.isDestroyed()) startupWindow.show();
```

Tag hidden/CLI migration exceptions with `error.portableSetup = true`. In the outer catch, close the startup window and quit instead of creating the service error page or recovery loop when that flag is present.

- [ ] **Step 4: Run startup and syntax checks**

Run:

```powershell
node --check desktop/main.js
node --check desktop/portable-setup.js
node tools/check-startup-loading.js
node tools/check-portable-first-run-ui.js
```

Expected: all pass.

---

### Task 4: Lock the behavior down and update operator documentation

**Files:**
- Modify: `tools/check-portable-first-run-ui.js`
- Modify: `package.json`
- Modify: `打包和迁移说明.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: the setup controller and UI checks from Tasks 1-3.
- Produces: a single regression command and user-facing migration instructions that match the new window.

- [ ] **Step 1: Add failure, retry, leak, and hidden-mode checks**

Add checks that:

```js
assert.equal(failureResult.action, "quit");
assert.equal(retryResult.action, "migrated");
assert.doesNotMatch(JSON.stringify(states), /provider-master\.key|sk-|C:\\private/);
await assert.rejects(
  preparePortableData({ paths, argv: ["--hidden", "--import-from", "C:\\bad"], runMigration: async () => {
    const error = new Error("hidden failure");
    error.code = "invalid_database";
    error.portableSetup = true;
    throw error;
  } }),
  (error) => error.portableSetup === true && error.code === "invalid_database",
);
```

- [ ] **Step 2: Add the regression script**

In `package.json`, update `check:portable-electron`:

```json
"check:portable-electron": "node tools/check-desktop-runtime-paths.js && node --disable-warning=ExperimentalWarning tools/check-portable-migration.js && node tools/check-portable-first-run-ui.js && node tools/check-electron-portable-package.js"
```

- [ ] **Step 3: Update the migration guide**

Document the three choices and the safe failure behavior:

1. Extract a new portable folder.
2. Keep the old project intact and completely exit the old AI OS.
3. Launch `AI OS.exe`.
4. Choose `迁移旧数据`, inspect the safe summary, then choose `开始迁移`.
5. On failure, fix the reported source problem and use `重试迁移`; alternatively choose `直接全新开始`.
6. The workbench opens only after `打开 AI OS` on success or explicit fresh start.

Also state that the selected old project is read-only and retained for rollback.

- [ ] **Step 4: Run the complete focused suite**

Run:

```powershell
npm run check:portable-electron
node tools/check-startup-loading.js
```

Expected: all checks pass.

---

### Task 5: Verify the real first-run experience

**Files:**
- Verify: `desktop/portable-setup.html`
- Verify: `desktop/portable-setup-preload.js`
- Verify: `desktop/portable-setup.js`
- Verify: `desktop/main.js`

- [ ] **Step 1: Run syntax checks**

Run:

```powershell
node --check desktop/main.js
node --check desktop/portable-setup.js
node --check desktop/portable-setup-preload.js
node --check desktop/migrate-data-cli.js
```

Expected: no output and exit code 0.

- [ ] **Step 2: Run the focused behavior suite**

Run:

```powershell
npm run check:portable-electron
node tools/check-startup-loading.js
```

Expected: migration integrity, first-run UI, startup loading, and package manifest checks pass.

- [ ] **Step 3: Perform an isolated Electron smoke test**

Use a temporary portable-shaped directory and synthetic old-project data. Launch Electron with an isolated user-data path, verify:

- the setup window shows both primary choices;
- selecting migration shows only the safe source summary;
- a forced failure keeps the result view usable and does not reveal private values;
- retry and fresh-start controls remain available;
- quitting closes without starting the service;
- a successful migration reaches `打开 AI OS` before the workbench starts.

Record the result in `artifacts/electron-portable/verification.md` without including private data.

- [ ] **Step 4: Report residual risk**

State that the published `1.0.3` release is unchanged and that the old `1.0.1` deployment may require one manual portable replacement before future automatic updates can be trusted.
