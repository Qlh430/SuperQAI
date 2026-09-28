# 历史画布渐进加载实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打开节点较多的历史画布时显示持续可动画、带真实进度的加载界面，并把节点和引用恢复拆成不会长时间阻塞主线程的批次。

**Architecture:** 新建纯规则模块集中管理 30 节点阈值、8ms 帧预算、240ms 最短展示时间和进度换算。`script.js` 从同步恢复中提取共享的单节点恢复函数；历史入口使用异步协调器分批创建节点、分批刷新引用，而撤销和初始化仍可调用同步恢复路径。

**Tech Stack:** 原生 JavaScript、DOM、`requestAnimationFrame`、Node.js `assert`、Playwright 浏览器验证、现有 npm 回归脚本。

## Global Constraints

- 30 个节点及以上启用渐进加载；29 个及以下保持同步打开。
- 单批主线程工作预算为 8ms。
- 加载遮罩最短显示 240ms。
- 节点创建占进度 0–80%，引用刷新占 80–95%，收尾占 95–100%。
- 加载期间禁止重复打开或编辑画布。
- 两个历史入口必须统一调用 `openCanvasBoardFromHistory(board)`。
- 不修改后端画布格式、图片按需加载策略或撤销的同步恢复语义。

---

### Task 1: 渐进加载纯规则

**Files:**
- Create: `canvas-board-loading-rules.js`
- Create: `tools/check-canvas-board-loading-rules.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `window.canvasBoardLoadingRules` / CommonJS 导出。
- Produces: `shouldUseProgressiveRestore(nodeCount) -> boolean`。
- Produces: `getCanvasBoardRestoreProgress(phase, completed, total) -> integer 0..100`。

- [ ] **Step 1: 写失败的规则测试**

创建 `tools/check-canvas-board-loading-rules.js`：

```js
const assert = require("node:assert/strict");
const rules = require("../canvas-board-loading-rules");

assert.equal(rules.NODE_THRESHOLD, 30);
assert.equal(rules.FRAME_BUDGET_MS, 8);
assert.equal(rules.MIN_VISIBLE_MS, 240);
assert.equal(rules.shouldUseProgressiveRestore(29), false);
assert.equal(rules.shouldUseProgressiveRestore(30), true);
assert.equal(rules.shouldUseProgressiveRestore(186), true);
assert.equal(rules.getCanvasBoardRestoreProgress("nodes", 0, 100), 0);
assert.equal(rules.getCanvasBoardRestoreProgress("nodes", 50, 100), 40);
assert.equal(rules.getCanvasBoardRestoreProgress("nodes", 100, 100), 80);
assert.equal(rules.getCanvasBoardRestoreProgress("refs", 0, 100), 80);
assert.equal(rules.getCanvasBoardRestoreProgress("refs", 100, 100), 95);
assert.equal(rules.getCanvasBoardRestoreProgress("finalize", 0, 0), 95);
assert.equal(rules.getCanvasBoardRestoreProgress("complete", 0, 0), 100);
console.log("Canvas board loading rule checks passed.");
```

- [ ] **Step 2: 运行测试确认缺少模块而失败**

Run: `node .\tools\check-canvas-board-loading-rules.js`

Expected: FAIL with `Cannot find module '../canvas-board-loading-rules'`。

- [ ] **Step 3: 实现纯规则模块**

创建 `canvas-board-loading-rules.js`：

```js
(function initCanvasBoardLoadingRules(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.canvasBoardLoadingRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasBoardLoadingRules() {
  const NODE_THRESHOLD = 30;
  const FRAME_BUDGET_MS = 8;
  const MIN_VISIBLE_MS = 240;

  function clampRatio(completed, total) {
    const safeTotal = Math.max(1, Number(total) || 0);
    return Math.max(0, Math.min(1, (Number(completed) || 0) / safeTotal));
  }

  function shouldUseProgressiveRestore(nodeCount) {
    return Math.max(0, Number(nodeCount) || 0) >= NODE_THRESHOLD;
  }

  function getCanvasBoardRestoreProgress(phase, completed = 0, total = 0) {
    if (phase === "nodes") return Math.round(clampRatio(completed, total) * 80);
    if (phase === "refs") return 80 + Math.round(clampRatio(completed, total) * 15);
    if (phase === "finalize") return 95;
    if (phase === "complete") return 100;
    return 0;
  }

  return {
    NODE_THRESHOLD,
    FRAME_BUDGET_MS,
    MIN_VISIBLE_MS,
    shouldUseProgressiveRestore,
    getCanvasBoardRestoreProgress,
  };
});
```

- [ ] **Step 4: 把规则检查加入完整回归并验证通过**

在 `package.json` 的语法检查区加入 `node --check canvas-board-loading-rules.js`，在规则检查区加入 `node tools/check-canvas-board-loading-rules.js`。

Run: `node .\tools\check-canvas-board-loading-rules.js`

Expected: `Canvas board loading rule checks passed.`

### Task 2: 加载遮罩与状态控制器

**Files:**
- Create: `tools/check-canvas-history-progressive-loading.js`
- Modify: `script.js:331-375`
- Modify: `script.js:2942-3100`
- Modify: `styles.css`
- Modify: `index.html:588-595`
- Modify: `package.json`

**Interfaces:**
- Consumes: `window.canvasBoardLoadingRules`。
- Produces: `setCanvasBoardLoading(open, detail) -> void`。
- Produces: `updateCanvasBoardLoading({ phase, completed, total }) -> void`。
- Produces: `waitForCanvasRestorePaint() -> Promise<void>`。

- [ ] **Step 1: 写失败的加载界面静态检查**

创建 `tools/check-canvas-history-progressive-loading.js`，读取 `script.js`、`styles.css`、`index.html` 并断言：

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

assert.match(html, /canvas-board-loading-rules\.js\?v=20260819-progressive-loading/);
assert.match(script, /id="canvasBoardLoading"/);
assert.match(script, /role="status"/);
assert.match(script, /aria-busy="true"/);
assert.match(script, /function setCanvasBoardLoading\(/);
assert.match(script, /function updateCanvasBoardLoading\(/);
assert.match(script, /function waitForCanvasRestorePaint\(/);
assert.match(styles, /@keyframes canvas-board-loading-spin/);
assert.match(styles, /\.canvas-board-loading:not\(\[hidden\]\)/);
assert.match(styles, /pointer-events:\s*all/);
console.log("Canvas history progressive loading static checks passed.");
```

- [ ] **Step 2: 运行静态检查并确认失败**

Run: `node .\tools\check-canvas-history-progressive-loading.js`

Expected: FAIL，因为规则脚本标签和加载 DOM 尚不存在。

- [ ] **Step 3: 加入规则脚本和加载 DOM**

在 `index.html` 的 `grid-slicing-rules.js` 后加入：

```html
<script src="./canvas-board-loading-rules.js?v=20260819-progressive-loading"></script>
```

在 `.canvas-workspace` 内加入：

```html
<div class="canvas-board-loading" id="canvasBoardLoading" role="status" aria-live="polite" aria-busy="true" hidden>
  <div class="canvas-board-loading-card">
    <span class="canvas-board-loading-spinner" aria-hidden="true"></span>
    <strong>正在打开画布</strong>
    <span class="canvas-board-loading-title" id="canvasBoardLoadingTitle"></span>
    <span class="canvas-board-loading-detail" id="canvasBoardLoadingDetail">正在准备节点…</span>
    <div class="canvas-board-loading-track" aria-hidden="true"><i id="canvasBoardLoadingBar"></i></div>
    <small id="canvasBoardLoadingPercent">0%</small>
  </div>
</div>
```

- [ ] **Step 4: 实现遮罩样式和状态控制器**

CSS 必须让遮罩覆盖 `.canvas-workspace`、阻止交互，并用 `canvas-board-loading-spin` 持续旋转。控制器使用 `textContent` 写入标题和进度，使用规则模块计算百分比：

```js
function setCanvasBoardLoading(open, { title = "", detail = "正在准备节点…", progress = 0 } = {}) {
  const overlay = document.querySelector("#canvasBoardLoading");
  if (!overlay) return;
  overlay.hidden = !open;
  document.querySelector("#canvasBoardLoadingTitle").textContent = title;
  document.querySelector("#canvasBoardLoadingDetail").textContent = detail;
  document.querySelector("#canvasBoardLoadingPercent").textContent = `${progress}%`;
  document.querySelector("#canvasBoardLoadingBar").style.width = `${progress}%`;
}

function updateCanvasBoardLoading({ phase, completed = 0, total = 0 } = {}) {
  const rules = window.canvasBoardLoadingRules;
  const progress = rules.getCanvasBoardRestoreProgress(phase, completed, total);
  const detail = phase === "nodes"
    ? `正在恢复节点 ${completed} / ${total}`
    : phase === "refs"
      ? `正在整理节点关系 ${completed} / ${total}`
      : phase === "complete" ? "画布加载完成" : "正在完成画布…";
  setCanvasBoardLoading(true, { title: canvasState.activeBoardTitle, detail, progress });
}

function waitForCanvasRestorePaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}
```

- [ ] **Step 5: 将静态检查加入回归并确认通过**

在 `package.json` 的 `check` 中加入 `node tools/check-canvas-history-progressive-loading.js`。

Run: `node .\tools\check-canvas-history-progressive-loading.js`

Expected: `Canvas history progressive loading static checks passed.`

### Task 3: 共享节点恢复与渐进协调器

**Files:**
- Modify: `tools/check-canvas-history-progressive-loading.js`
- Modify: `script.js:9916-10120`
- Modify: `script.js:10340-10395`
- Modify: `script.js:13690-13720`

**Interfaces:**
- Produces: `restoreCanvasBoardNode(item, board, context) -> HTMLElement`。
- Produces: `restoreCanvasBoardProgressively(board, onProgress) -> Promise<void>`。
- Produces: `refreshCanvasRefsProgressively(onProgress) -> Promise<void>`。
- Produces: `openCanvasBoardFromHistory(board) -> Promise<void>`。

- [ ] **Step 1: 扩展静态检查以定义渐进恢复契约**

加入断言：

```js
assert.match(script, /boardOpening:\s*false/);
assert.match(script, /function restoreCanvasBoardNode\(/);
assert.match(script, /function restoreCanvasBoardProgressively\(/);
assert.match(script, /function refreshCanvasRefsProgressively\(/);
assert.match(script, /async function openCanvasBoardFromHistory\(/);
assert.match(script, /performance\.now\(\)[\s\S]*FRAME_BUDGET_MS/);
assert.match(script, /await waitForCanvasRestorePaint\(\)/);
assert.match(script, /finally[\s\S]*canvasState\.boardOpening = false/);
assert.match(script, /card\.addEventListener\("click", async[\s\S]*await openCanvasBoardFromHistory\(board\)/);
assert.match(script, /record-card[\s\S]*openCanvasBoardFromHistory\(board\)/);
assert.match(script, /prepareBlankCanvasLanding\(\)[\s\S]*画布打开失败/);
```

- [ ] **Step 2: 运行检查并确认渐进恢复接口缺失**

Run: `node .\tools\check-canvas-history-progressive-loading.js`

Expected: FAIL，因为 `restoreCanvasBoardProgressively` 尚不存在。

- [ ] **Step 3: 提取共享单节点恢复函数**

把现有 `restoreCanvasBoard` 中 `nodes.forEach((item) => { ... })` 的单节点主体逐行移入共享函数。只做以下三处机械改写：函数参数增加 `board, context`；局部 `maxId` 改为 `context.maxId`；局部 `legacyResults` 改为 `context.legacyResults`。其余所有节点类型分支、字段读取、DOM 写入、迁移逻辑及调用顺序保持不变：

```js
function restoreCanvasBoardNode(item, board, context) {
  const node = createCanvasNode(getCanvasCreateKindFromSerialized(item.kind));
  node.dataset.id = String(item.id);
  node.dataset.x = String(Number(item.x || 0));
  node.dataset.y = String(Number(item.y || 0));
  if (item.width) node.dataset.width = String(item.width);
  if (item.height) node.dataset.height = String(item.height);
  context.maxId = Math.max(context.maxId, Number(item.id) || 0);
  // 此处由上述机械提取得到现有全部节点类型分支。
  placeCanvasNode(node);
  applyCanvasNodeSize(node);
  return node;
}
```

同步路径改为创建 `{ maxId: 0, legacyResults: [] }`，逐项调用该函数，再执行当前收尾逻辑。运行现有画布、视频、H3、网格编辑静态检查，确保序列化字段没有丢失。

- [ ] **Step 4: 实现按时间预算恢复和引用刷新**

```js
async function restoreCanvasBoardProgressively(board, onProgress) {
  const rules = window.canvasBoardLoadingRules;
  const nodes = Array.isArray(board.nodes) ? board.nodes : [];
  const context = beginCanvasBoardRestore(board);
  let batchStartedAt = performance.now();
  for (let index = 0; index < nodes.length; index += 1) {
    restoreCanvasBoardNode(nodes[index], board, context);
    onProgress?.({ phase: "nodes", completed: index + 1, total: nodes.length });
    if (performance.now() - batchStartedAt >= rules.FRAME_BUDGET_MS && index < nodes.length - 1) {
      await waitForCanvasRestorePaint();
      batchStartedAt = performance.now();
    }
  }
  prepareCanvasBoardRestoreFinalState(board, context);
  await refreshCanvasRefsProgressively(onProgress);
  onProgress?.({ phase: "finalize" });
  await waitForCanvasRestorePaint();
  completeCanvasBoardRestore(context);
}

async function refreshCanvasRefsProgressively(onProgress) {
  const rules = window.canvasBoardLoadingRules;
  const nodes = Array.from(document.querySelectorAll("#canvasPlane .canvas-node"));
  let batchStartedAt = performance.now();
  for (let index = 0; index < nodes.length; index += 1) {
    updateCanvasNodeRefs(nodes[index]);
    onProgress?.({ phase: "refs", completed: index + 1, total: nodes.length });
    if (performance.now() - batchStartedAt >= rules.FRAME_BUDGET_MS && index < nodes.length - 1) {
      await waitForCanvasRestorePaint();
      batchStartedAt = performance.now();
    }
  }
  updateCanvasGroupCounts();
  scheduleCanvasConnectionRender();
}
```

`beginCanvasBoardRestore`、`prepareCanvasBoardRestoreFinalState`、`completeCanvasBoardRestore` 分别承接当前函数的初始化、连接/视口准备和最终状态同步，供同步与渐进路径共享。

- [ ] **Step 5: 实现历史入口协调器和错误回退**

```js
async function openCanvasBoardFromHistory(board) {
  if (!board || canvasState.boardOpening) return false;
  closeCanvasBoardPanel();
  const rules = window.canvasBoardLoadingRules;
  const nodes = Array.isArray(board.nodes) ? board.nodes : [];
  if (!rules.shouldUseProgressiveRestore(nodes.length)) {
    restoreCanvasBoard(board);
    return true;
  }
  canvasState.boardOpening = true;
  const startedAt = performance.now();
  canvasState.activeBoardTitle = board.title || "未命名画布";
  setCanvasBoardLoading(true, { title: canvasState.activeBoardTitle, progress: 0 });
  await waitForCanvasRestorePaint();
  try {
    await restoreCanvasBoardProgressively(board, updateCanvasBoardLoading);
    updateCanvasBoardLoading({ phase: "complete" });
    const remaining = rules.MIN_VISIBLE_MS - (performance.now() - startedAt);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    return true;
  } catch (error) {
    canvasState.isRestoring = false;
    prepareBlankCanvasLanding();
    setCanvasStatus(`画布打开失败：${error.message}`);
    return false;
  } finally {
    setCanvasBoardLoading(false);
    canvasState.boardOpening = false;
  }
}
```

画布选择卡片和统一历史画布记录的点击处理器改为 `async` 并 `await openCanvasBoardFromHistory(board)`。统一历史入口先调用 `setActiveTool("canvas")`，让加载遮罩处于当前可见工具页，再执行并等待打开协调器。

- [ ] **Step 6: 运行聚焦检查**

Run:

```powershell
node .\tools\check-canvas-history-progressive-loading.js
node .\tools\check-canvas-shell-history-theme.js
node .\tools\check-canvas-gallery-history.js
node .\tools\check-canvas-video-history.js
node .\tools\check-canvas-grid-editor.js
node .\tools\check-minimax-h3-video.js
node --check .\script.js
```

Expected: 全部退出码为 0。

### Task 4: 浏览器验收、缓存刷新与完整回归

**Files:**
- Create: `tools/check-canvas-history-progressive-loading-ui.js`
- Modify: `tools/check-global-image-demand-loading.js`
- Modify: `tools/check-canvas-shell-history-theme.js`
- Modify: `index.html:594-595`

**Interfaces:**
- Produces: 历史画布加载的浏览器级回归脚本。
- Produces: `script.js?v=20260819-history-loading` 缓存键。

- [ ] **Step 1: 编写浏览器验收脚本**

脚本通过 Playwright 路由返回一个含 60 个轻量文字节点和 10 条连接的历史画布，然后：

```js
await page.locator("#canvasHistoryButton").click();
await page.locator('[data-board-id="progressive-test-board"]').click();
await page.locator("#canvasBoardLoading").waitFor({ state: "visible" });
assert.match(await page.locator("#canvasBoardLoadingDetail").textContent(), /正在恢复节点/);
await page.locator("#canvasBoardLoading").waitFor({ state: "hidden" });
assert.equal(await page.locator("#canvasPlane .canvas-node").count(), 60);
assert.equal(await page.evaluate(() => canvasState.connections.length), 10);
assert.equal(await page.evaluate(() => canvasState.boardOpening), false);
```

同时监听进度文字变化，断言至少出现一个 0% 与 100% 之间的中间进度，并确认页面无 `pageerror`。

- [ ] **Step 2: 先更新缓存版本断言并确认失败**

把脚本版本断言改为 `script.js?v=20260819-history-loading&vh=...`。

Run: `node .\tools\check-global-image-demand-loading.js`

Expected: FAIL，因为 `index.html` 仍为 `20260819-middle-pan`。

- [ ] **Step 3: 更新页面缓存键**

```html
<script src="./script.js?v=20260819-history-loading&vh=20260812-video-history-gallery&mj=20260806-hd"></script>
```

- [ ] **Step 4: 执行浏览器验收**

使用已运行的本地服务和系统 Chrome：

```powershell
$env:NODE_PATH='C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
$env:PLAYWRIGHT_CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node .\tools\check-canvas-history-progressive-loading-ui.js
```

Expected: 加载遮罩可见、进度递增、最终 60 个节点/10 条连接完整恢复，退出码为 0。

- [ ] **Step 5: 运行完整回归**

Run: `npm run check`

Expected: 所有检查通过，退出码为 0。

- [ ] **Step 6: 检查补丁格式与范围**

Run:

```powershell
git diff --check
git status --short -- canvas-board-loading-rules.js script.js styles.css index.html package.json tools/check-canvas-board-loading-rules.js tools/check-canvas-history-progressive-loading.js tools/check-canvas-history-progressive-loading-ui.js tools/check-global-image-demand-loading.js tools/check-canvas-shell-history-theme.js
```

Expected: 无空白错误，不覆盖用户的无关改动。
