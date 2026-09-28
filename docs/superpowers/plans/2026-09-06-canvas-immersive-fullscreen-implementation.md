# Canvas Immersive Fullscreen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打开具体画布时进入覆盖整个 AI OS 的沉浸模式，并提供“退出全屏”和“返回项目”两个左上角动作。

**Architecture:** Canvas 用 `ai-os-app-immersive` 事件声明沉浸意图；桌面 Shell 记录目标窗口并控制根状态、窗口状态与清理；CSS 负责隐藏桌面框架并扩展 Canvas；Canvas 页面控制器在进入编辑器、返回项目和失败路径同步事件。

**Tech Stack:** 原生 JavaScript、CSS、自定义 DOM 事件、现有窗口管理器、Node `assert`、Playwright。

## Global Constraints

- 项目首页不进入全屏，具体画布自动进入全屏。
- 全屏时顶栏、Dock、标题栏、其他窗口和窗口装饰不可见。
- Canvas 必须覆盖逻辑视口顶部和底部。
- 退出全屏保留编辑器；返回项目退出全屏并保存后回项目首页。
- 原窗口尺寸和位置不得被沉浸模式写入持久化布局。
- 资源直达和新建画布采用相同行为。
- `.git` 保持只读，不执行提交。

---

### Task 1: 沉浸桌面契约与 Canvas 导航

**Files:**
- Modify: `desktop-shell.js`
- Modify: `desktop-shell.css`
- Modify: `script.js`
- Modify: `styles.css`
- Modify: `tools/check-canvas-library-navigation.js`
- Modify: `tools/check-ai-os-shell.js`

**Interfaces:**
- Produces: `setAppImmersive(appId, active)`, `setCanvasImmersive(active)`, `canvasState.isImmersive`。
- Consumes: `shellNodes`, `state.manager`, `showCanvasEditor`, `showCanvasLibrary`。

- [x] **Step 1: 写出失败的静态检查**

断言 Shell 监听 `ai-os-app-immersive`、维护 `immersiveWindowId`、关闭和最小化时清理；Canvas 存在两个左上角按钮并在进入编辑器/返回项目时同步沉浸状态；CSS 隐藏顶栏与 Dock、全屏窗口覆盖 `inset: 0`。

- [x] **Step 2: 运行静态测试确认 RED**

Run: `node tools/check-canvas-library-navigation.js`

Run: `node tools/check-ai-os-shell.js`

Expected: FAIL，缺少沉浸事件、按钮或 CSS 状态。

- [x] **Step 3: 实现桌面沉浸状态**

在 Shell 状态中增加 `immersiveWindowId`。`setAppImmersive(appId, true)` 只接受存在且未最小化的窗口，添加根数据属性和目标窗口类；传入 `false` 时清除状态。`renderWindows` 重放类状态；关闭、最小化、登出和新会话时清除。

- [x] **Step 4: 实现 Canvas 事件与按钮**

`showCanvasEditor()` 请求进入沉浸模式；`showCanvasLibrary()` 立即请求退出。编辑器左上角新增全屏切换按钮与返回项目按钮。渐进恢复完成处不再次请求全屏，确保用户在加载期间退出后不会被强制重新进入。

- [x] **Step 5: 实现沉浸布局样式**

根状态隐藏顶栏、Dock 和非目标窗口；窗口层改为 `inset: 0`；目标窗口清除内联几何影响、边框、圆角和阴影；标题栏和缩放手柄隐藏。Canvas 左侧导航固定在 `top: 12px; left: 12px`，状态条下移。

- [x] **Step 6: 运行静态测试确认 GREEN**

Run: `node tools/check-canvas-library-navigation.js`

Run: `node tools/check-ai-os-shell.js`

Expected: 两个检查均 exit 0。

---

### Task 2: 浏览器边界与动作验收

**Files:**
- Modify: `tools/check-canvas-library-navigation-browser.js`
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: Task 1 的沉浸事件、DOM 按钮与 CSS 状态。
- Produces: 全屏边界和恢复行为的浏览器证据。

- [x] **Step 1: 写出失败的浏览器验收**

进入画布后断言根沉浸状态、顶栏/Dock 不可见、目标窗口与无限画布覆盖视口上下边界、左侧按钮顺序正确；测试退出全屏仍在编辑器、重新进入全屏、返回项目退出沉浸。

- [x] **Step 2: 运行浏览器测试确认 RED**

Run: `node --disable-warning=ExperimentalWarning tools/check-canvas-library-navigation-browser.js`

Expected: FAIL，缺少根状态或退出全屏按钮。

- [x] **Step 3: 修正发现的布局与状态问题**

只调整沉浸 CSS 或事件清理，不修改持久化窗口尺寸、画布数据和其他应用内部逻辑。

- [x] **Step 4: 运行聚焦回归**

Run: `npm run check:canvas-navigation`

Run: `npm run check:desktop-v2`

Run: `npm run check:canvas-project-browser`

Run: `npm run check:canvas-assets`

Run: `npm run check:global-theme`

Run: `npm run check:scale-interactions`

Expected: 所有命令 exit 0。

- [x] **Step 5: 运行完整检查与记录**

Run: `npm run check`

Expected: exit 0。更新计划复选框和 `.superpowers/sdd/progress.md`，记录 RED/GREEN、浏览器视觉边界、主题缩放和 `.git` 未修改。
