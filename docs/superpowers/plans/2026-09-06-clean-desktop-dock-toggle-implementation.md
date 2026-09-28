# AI OS Clean Desktop and Dock Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 登录后保持干净桌面，并让 Dock 图标按“打开、聚焦、最小化、恢复”规则切换应用窗口。

**Architecture:** 从会话与桥接初始化路径移除默认 Canvas 启动。桌面 Shell 新增 `toggleDockApp(appId)`，依据窗口存在、最小化和聚焦状态选择 `openApp`、`focusWindow` 或 `manager.minimize`；Canvas 普通新启动仍由 `openApp` 发送项目首页参数。

**Tech Stack:** 原生 JavaScript、现有桌面窗口管理器、Node `assert`、Playwright。

## Global Constraints

- 登录或刷新已登录页面不得自动打开任何应用。
- 普通打开无限画布必须先显示项目首页，不能显示或叠加编辑器。
- 当前聚焦应用的 Dock 图标再次点击必须最小化。
- 恢复已最小化窗口必须保留最小化前的应用内部页面。
- 显式 `resourceId` 打开画布仍可直达编辑器。
- 不修改数据库和持久化格式。
- `.git` 保持只读且不执行提交。

---

### Task 1: 干净桌面与 Dock 状态切换

**Files:**
- Modify: `desktop-shell.js`
- Modify: `tools/check-ai-os-shell.js`
- Modify: `tools/check-canvas-library-navigation-browser.js`

**Interfaces:**
- Produces: `toggleDockApp(appId)`。
- Consumes: `state.manager.getSnapshot()`, `state.activeWindowId`, `openApp(appId)`, `focusWindow(id)`, `state.manager.minimize(id)`。

- [x] **Step 1: 写出失败的静态检查**

在 `tools/check-ai-os-shell.js` 中删除“默认打开 Canvas”的旧契约，改为断言会话激活和桥接就绪路径不调用 `openApp("canvas")`，Dock 绑定调用 `toggleDockApp`，并断言切换函数包含最小化与聚焦分支。

- [x] **Step 2: 写出失败的浏览器验收**

更新隔离浏览器测试：登录后先断言窗口数为 0；点击 Canvas 后断言项目首页可见；进入画布后再次点击 Dock，断言窗口被最小化；第三次点击恢复后断言仍在编辑器；关闭再打开后断言回项目首页。

- [x] **Step 3: 运行测试确认 RED**

Run: `node tools/check-ai-os-shell.js`

Expected: FAIL，仍发现自动 `openApp("canvas")` 或缺少 `toggleDockApp`。

Run: `node --disable-warning=ExperimentalWarning tools/check-canvas-library-navigation-browser.js`

Expected: FAIL，登录后存在 Canvas 窗口或再次点击 Dock 没有最小化。

- [x] **Step 4: 实现最小修复**

移除 `activateSession` 和 `ai-os-legacy-workbench-ready` 中的自动 Canvas 启动。新增 `toggleDockApp`：

```js
function toggleDockApp(appId) {
  const existing = state.manager?.getSnapshot().windows.find((item) => item.appId === appId);
  if (!existing) return openApp(appId);
  if (!existing.minimized && state.activeWindowId === existing.id) {
    state.manager.minimize(existing.id);
    return state.manager.getWindow(existing.id);
  }
  return focusWindow(existing.id);
}
```

Dock 事件绑定改为 `toggleDockApp(button.dataset.aiApp)`。Launchpad 和共享资源直达仍调用 `openApp`，不套用 Dock 收起行为。

- [x] **Step 5: 运行聚焦测试确认 GREEN**

Run: `node tools/check-ai-os-shell.js`

Expected: `AI OS shell checks passed.`

Run: `node --disable-warning=ExperimentalWarning tools/check-canvas-library-navigation-browser.js`

Expected: `Canvas library navigation browser checks passed.`

---

### Task 2: 回归与执行记录

**Files:**
- Modify: `.superpowers/sdd/progress.md`
- Modify: `docs/superpowers/plans/2026-09-06-clean-desktop-dock-toggle-implementation.md`

**Interfaces:**
- Consumes: Task 1 最终 Dock 行为。
- Produces: 完整验证证据与完成记录。

- [x] **Step 1: 运行窗口、导航、项目和主题检查**

Run: `node tools/check-desktop-window-manager.js`

Run: `npm run check:canvas-navigation`

Run: `npm run check:canvas-project-browser`

Run: `npm run check:global-theme`

Run: `npm run check:scale-interactions`

Expected: 所有命令 exit 0。

- [x] **Step 2: 运行完整回归**

Run: `npm run check`

Expected: exit 0，无失败检查。

- [x] **Step 3: 记录完成状态**

更新计划复选框与 `.superpowers/sdd/progress.md`，记录 RED/GREEN、浏览器生命周期验收、完整检查和 `.git` 未修改。
