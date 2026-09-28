# 无限画布项目首页与编辑器双页面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将无限画布改造成默认打开项目首页、点击画布后进入编辑器、可返回原首页上下文的 DX OS 式双页面应用。

**Architecture:** `#canvasView` 内建立同级的 `#canvasLibraryScreen` 与 `#canvasEditorScreen`，由一个页面状态控制器独占切换可见性。现有项目、画布、共享和资产数据服务保持不变，桌面启动参数只负责区分普通首页启动与资源 ID 直达。

**Tech Stack:** 原生 JavaScript DOM、CSS、现有 AI OS 桌面运行时、Node `assert`、Playwright。

## Global Constraints

- 每次普通打开无限画布应用必须先进入项目首页。
- 项目首页不能是编辑器遮罩层，必须与编辑器成为同级页面。
- 资源 ID 直达可以直接进入指定画布编辑器。
- 返回首页必须保留范围、项目和搜索上下文，并触发当前画布保存。
- 不修改数据库结构、画布持久化格式、共享权限或资产库数据。
- 主题跟随整个 AI OS，支持浅色、深色和 75%、100%、125%、150%、175% 系统缩放。
- 当前 `.git` 目录保持只读；不得修改 `.git` 或尝试提交，执行证据写入 `.superpowers/sdd/progress.md`。

---

## File Structure

- Modify `script.js`: 双页面 DOM、导航状态、卡片/新建/返回行为和资源 ID 直达。
- Modify `styles.css`: 首页全窗口布局、主题、缩放、窄窗口及隐藏状态。
- Modify `desktop-shell.js`: 普通无限画布启动统一发送首页参数。
- Modify `tools/check-canvas-shell-history-theme.js`: 把旧历史遮罩契约改为双页面静态契约。
- Modify `tools/check-canvas-project-browser.js`: 覆盖首页、卡片进入、返回上下文和五档缩放。
- Create `tools/check-canvas-library-navigation.js`: 页面层级、状态切换和桌面启动参数静态检查。
- Create `tools/check-canvas-library-navigation-browser.js`: 首次启动、再次启动、创建、直达及失败回退浏览器验收。
- Modify `package.json`: 增加 `check:canvas-navigation` 并将静态导航检查纳入完整检查。
- Modify `.superpowers/sdd/progress.md`: 记录 RED/GREEN 和最终回归证据。

---

### Task 1: 双页面静态契约与 DOM 结构

**Files:**
- Create: `tools/check-canvas-library-navigation.js`
- Modify: `tools/check-canvas-shell-history-theme.js`
- Modify: `script.js`
- Modify: `styles.css`
- Modify: `package.json`

**Interfaces:**
- Produces: `canvasState.appScreen`, `setCanvasAppScreen(screen)`, `showCanvasLibrary(options)`, `showCanvasEditor()`。
- Consumes: existing `renderCanvasBoardList`, `loadCanvasBoards`, `saveCanvasBoardNow`, `CanvasAssetLibrary.close`。

- [x] **Step 1: 写出失败的静态导航测试**

测试必须断言两个页面是 `#canvasView` 的同级主页面、初始首页可见、编辑器隐藏、旧历史遮罩和首次启动门不存在，并检查导航函数：

```js
assert.match(script, /id="canvasLibraryScreen" class="canvas-library-screen"/);
assert.match(script, /id="canvasEditorScreen" class="canvas-editor-screen" hidden/);
assert.doesNotMatch(script, /id="canvasBoardPanel"/);
assert.doesNotMatch(script, /class="canvas-start-gate"/);
assert.match(extractFunction("setCanvasAppScreen"), /library\.hidden = next !== "library"/);
assert.match(extractFunction("showCanvasLibrary"), /saveCanvasBoardNow\(\)/);
assert.match(extractFunction("showCanvasEditor"), /activeBoardId/);
assert.match(styles, /\.canvas-library-screen\[hidden\],[\s\S]*display:\s*none\s*!important/);
```

- [x] **Step 2: 运行静态测试并确认 RED**

Run: `node tools/check-canvas-library-navigation.js`

Expected: FAIL，提示缺少 `canvasLibraryScreen` 或 `setCanvasAppScreen`。

- [x] **Step 3: 重组画布 DOM 并实现最小页面控制器**

在 `ensureCanvasMarkup` 中把图库卡片提升为 `#canvasLibraryScreen`，把 `.canvas-workspace` 包在 `#canvasEditorScreen` 中，并将共用对话框放到两个页面之后。编辑器首个按钮为：

```html
<button id="canvasLibraryBackButton" class="text-action" type="button">
  <i data-lucide="chevron-left"></i><span>所有画布</span>
</button>
```

状态控制器只允许有效目标，并同步 DOM：

```js
function setCanvasAppScreen(screen) {
  const next = screen === "editor" && canvasState.activeBoardId ? "editor" : "library";
  canvasState.appScreen = next;
  const library = document.querySelector("#canvasLibraryScreen");
  const editor = document.querySelector("#canvasEditorScreen");
  if (library) library.hidden = next !== "library";
  if (editor) editor.hidden = next !== "editor";
  document.querySelector("#canvasView")?.setAttribute("data-canvas-screen", next);
  return next;
}
```

`showCanvasLibrary` 关闭资产库/菜单、保存并按需刷新；`showCanvasEditor` 校验 `activeBoardId` 后显示编辑器。移除 `initializeCanvasFirstShell` 中的 `.canvas-start-gate`。

- [x] **Step 4: 增加首页主题、缩放和响应式样式**

```css
.canvas-library-screen,
.canvas-editor-screen {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
.canvas-library-screen[hidden],
.canvas-editor-screen[hidden] { display: none !important; }
.canvas-library-screen {
  padding: 18px;
  overflow: hidden;
  background: var(--stage);
}
.canvas-library-screen .canvas-board-card {
  width: 100%;
  height: 100%;
  max-height: none;
  border-radius: 22px;
}
```

把图库已有固定 `100vh` 约束改为父窗口百分比，并在窄窗口下让侧边栏变为顶部区域。

- [x] **Step 5: 运行静态检查并确认 GREEN**

Run: `node tools/check-canvas-library-navigation.js`

Expected: `Canvas library navigation checks passed.`

Run: `node tools/check-canvas-shell-history-theme.js`

Expected: `Canvas shell and library theme checks passed.`

---

### Task 2: 打开、返回、新建和资源直达行为

**Files:**
- Modify: `script.js`
- Modify: `desktop-shell.js`
- Create: `tools/check-canvas-library-navigation-browser.js`
- Modify: `tools/check-canvas-project-browser.js`

**Interfaces:**
- Consumes: Task 1 `showCanvasLibrary`, `showCanvasEditor`；existing `openCanvasBoardFromHistory`, `createNewCanvasBoard`, `loadCanvasBoards`。
- Produces: `openCanvasBoardByResourceId(resourceId)`, `handleCanvasAppActivation(event)`，以及 `CanvasWorkspace.showLibrary/openBoardByResourceId`。

- [x] **Step 1: 写出失败的浏览器导航测试**

启动隔离服务并登录后断言：

```js
await page.locator("#canvasLibraryScreen").waitFor();
assert.equal(await page.locator("#canvasEditorScreen").isHidden(), true);
await page.locator(".canvas-board-item").filter({ hasText: "导航画布" }).click();
await page.locator("#canvasEditorScreen").waitFor();
await page.locator("#canvasLibraryBackButton").click();
assert.equal(await page.locator("#canvasBoardSearch").inputValue(), "导航");
```

测试还要再次点击 Dock 验证回首页，并通过 `AiOsDesktop.openApp("canvas", { resourceId })` 验证直达编辑器；传入未知资源时验证回首页。

- [x] **Step 2: 运行浏览器测试并确认 RED**

Run: `node --disable-warning=ExperimentalWarning tools/check-canvas-library-navigation-browser.js`

Expected: FAIL，提示首页/编辑器切换或资源直达未实现。

- [x] **Step 3: 接通卡片、新建、返回与失败回退**

- `#canvasLibraryBackButton` 调用 `showCanvasLibrary({ reload: true })`。
- `openCanvasBoardFromHistory` 成功恢复后调用 `showCanvasEditor()`；任何恢复异常调用 `showCanvasLibrary({ reload: false })`。
- `createNewCanvasBoard` 建立身份后调用 `showCanvasEditor()`，保存后刷新首页数据。
- 删除 `openCanvasBoardPanel/closeCanvasBoardPanel` 的用户界面职责，旧内部调用全部改用新导航函数。
- `showCanvasLibrary` 不清空 `canvasScope`、`activeProjectId` 或 `boardSearchQuery`。

- [x] **Step 4: 接通桌面启动参数和资源直达**

`desktop-shell.js` 普通打开画布时产生默认参数，但保留显式资源参数：

```js
const requestedParams = appId === "canvas" && (!params || Object.keys(params).length === 0)
  ? { screen: "library" }
  : { ...(params || {}) };
launchParams.set(appId, requestedParams);
```

`handleCanvasAppActivation` 分流：

```js
async function handleCanvasAppActivation(event) {
  if (event.detail?.appId !== "canvas") return;
  const resourceId = String(event.detail?.params?.resourceId || "");
  if (resourceId) await openCanvasBoardByResourceId(resourceId);
  else await showCanvasLibrary({ reload: true });
}
```

资源直达从当前账号可访问的全部画布中按 `resourceId` 匹配；找不到时显示错误并回首页。

- [x] **Step 5: 运行聚焦浏览器检查并确认 GREEN**

Run: `node --disable-warning=ExperimentalWarning tools/check-canvas-library-navigation-browser.js`

Expected: `Canvas library navigation browser checks passed.`

Run: `npm run check:canvas-project-browser`

Expected: `Canvas project browser checks passed.`

---

### Task 3: 旧入口清理与全量回归

**Files:**
- Modify: `tools/check-canvas-project-browser.js`
- Modify: affected browser checks that still click `#canvasHistoryButton`
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: Task 1/2 final navigation contract。
- Produces: no new runtime API；只完成回归适配和证据记录。

- [x] **Step 1: 更新受影响的测试入口**

把“先关闭启动门，再点击历史”的启动步骤改为等待首页；需要从编辑器回首页的地方点击 `#canvasLibraryBackButton`：

```js
await page.locator("#canvasLibraryScreen").waitFor();
// 编辑器中返回首页：
await page.locator("#canvasLibraryBackButton").click();
```

不添加隐藏的 `#canvasHistoryButton` 或 `.canvas-start-gate` 兼容节点。

- [x] **Step 2: 运行语法、项目、资产和主题检查**

Run: `node --check script.js`

Expected: exit 0.

Run: `node --check desktop-shell.js`

Expected: exit 0.

Run: `npm run check:canvas-projects`

Expected: all canvas project service checks pass.

Run: `npm run check:canvas-assets`

Expected: all asset library checks pass.

Run: `npm run check:global-theme`

Expected: global theme checks pass.

Run: `npm run check:scale-interactions`

Expected: scale interaction checks pass.

- [x] **Step 3: 运行完整检查**

Run: `npm run check`

Expected: all checks exit 0, including `Canvas library navigation checks passed.`

- [x] **Step 4: 记录完成状态**

在 `.superpowers/sdd/progress.md` 记录双页面结构、首页启动、资源直达、五档缩放、主题和完整回归结果；明确 `.git` 未修改且未执行提交。
