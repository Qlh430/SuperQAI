# Canvas Agent Presence Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让画布 Agent 首次默认收起，并用对话侧四条动画即时反馈模型等待状态，同时移除底部正常 loading 文案。

**Architecture:** 面板初始化只把显式保存的 `"true"` 解释为打开。UI 层新增幂等的等待项创建/移除函数，并在每轮模型请求、turn 到达和所有终止路径中维护生命周期；CSS 仅动画四个小竖条的 transform/opacity。

**Tech Stack:** 原生浏览器 JavaScript、CSS、Node.js `assert` 静态检查、Playwright 浏览器验收。

## Global Constraints

- 不增加第三方运行时依赖。
- 不改动画之外的画布渲染、缩放、拖拽或连线逻辑。
- 首次默认收起；显式打开或关闭后记住上次状态。
- 等待动画不显示可见文字。
- 不使用 JavaScript 定时器或轮询驱动动画。
- 停止按钮在运行中继续可用。
- 保留审批、错误、停止和完成反馈。

---

### Task 1: 默认收起与等待反馈回归测试

**Files:**
- Modify: `tools/check-canvas-agent-ui.js`
- Modify: `tools/check-canvas-agent-browser.js`

**Interfaces:**
- Consumes: `#canvasAgentPanel`、`#canvasAgentToggle`、`#canvasAgentMessages`、`#canvasAgentStatus`。
- Produces: 默认状态、等待项生命周期和无可见 loading 文案的自动化证据。

- [x] **Step 1: 写静态失败断言**

在 `tools/check-canvas-agent-ui.js` 断言初始化、等待函数和 CSS：

```js
assert.match(ui, /setCanvasAgentOpen\(localStorage\.getItem\(PANEL_STORAGE_KEY\)\s*===\s*"true",\s*false\)/);
assert.match(ui, /function showCanvasAgentWaiting/);
assert.match(ui, /function removeCanvasAgentWaiting/);
assert.doesNotMatch(ui, /setCanvasAgentStatus\("Agent 正在处理…"\)/);
assert.match(css, /\.canvas-agent-waiting-bars/);
assert.match(css, /@keyframes canvasAgentWaitingBar/);
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
```

- [x] **Step 2: 写浏览器等待生命周期断言**

在每个 `/api/canvas-agent/turn` mock 返回前延迟 300ms。先断言本地偏好为空时面板关闭，再点击 Agent 打开。发送“你好”后断言：

```js
await page.locator(".canvas-agent-waiting").waitFor({ state: "visible" });
assert.equal(await page.locator(".canvas-agent-waiting-bar").count(), 4);
assert.equal(await page.locator("#canvasAgentStatus").textContent(), "");
await page.getByText("你好，我可以直接协助你操作画布。").waitFor({ state: "visible" });
assert.equal(await page.locator(".canvas-agent-waiting").count(), 0);
```

- [x] **Step 3: 运行测试确认红灯**

Run: `node tools/check-canvas-agent-ui.js`

Expected: FAIL，指出默认初始化表达式或等待动画函数不存在。

### Task 2: 实现面板默认值与等待项生命周期

**Files:**
- Modify: `canvas-agent-ui.js`
- Modify: `canvas-agent.css`

**Interfaces:**
- Produces: `showCanvasAgentWaiting()`，幂等返回当前 `.canvas-agent-waiting`。
- Produces: `removeCanvasAgentWaiting()`，安全移除当前等待项。
- Consumes: `startCanvasAgentRun()`、`requestCanvasAgentTurn()`、`handleCanvasAgentTurn()` 和现有终止路径。

- [x] **Step 1: 改为首次默认收起**

将初始化改为：

```js
setCanvasAgentOpen(localStorage.getItem(PANEL_STORAGE_KEY) === "true", false);
```

- [x] **Step 2: 实现幂等等待项**

在消息辅助函数附近增加：

```js
function showCanvasAgentWaiting(runId) {
  const container = document.querySelector("#canvasAgentMessages");
  const existing = container?.querySelector(".canvas-agent-waiting");
  if (existing) return existing;
  const waiting = document.createElement("article");
  waiting.className = "canvas-agent-waiting";
  waiting.dataset.runId = runId;
  waiting.setAttribute("role", "status");
  waiting.setAttribute("aria-label", "Agent 正在回应");
  waiting.innerHTML = '<span class="canvas-agent-waiting-bars" aria-hidden="true"><i class="canvas-agent-waiting-bar"></i><i class="canvas-agent-waiting-bar"></i><i class="canvas-agent-waiting-bar"></i><i class="canvas-agent-waiting-bar"></i></span><span class="canvas-agent-sr-only">Agent 正在回应</span>';
  container?.append(waiting);
  container?.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  return waiting;
}

function removeCanvasAgentWaiting(runId) {
  const waiting = document.querySelector("#canvasAgentMessages .canvas-agent-waiting");
  if (!runId || waiting?.dataset.runId === runId) waiting?.remove();
}
```

- [x] **Step 3: 接入请求与清理路径**

用户消息加入后立即调用 `showCanvasAgentWaiting()`；`requestCanvasAgentTurn()` 入口再次幂等调用。收到完整 turn 后先移除；停止、完成、失败和重置时也调用移除。正常运行 stage 不再调用 `setCanvasAgentStatus()`。

- [x] **Step 4: 添加精炼条形动画**

四条使用 3px 宽、14px 高、2px 间距，颜色采用当前黄绿色强调色；动画周期 760ms，delay 为 `0ms/90ms/180ms/270ms`。等待容器左对齐并只占 32×24px。增加 `.canvas-agent-sr-only` 与 reduced-motion 静态降级。

- [x] **Step 5: 运行定向检查确认绿灯**

Run: `node tools/check-canvas-agent-ui.js && node --check canvas-agent-ui.js`

Expected: `Canvas agent UI checks passed.` 且语法检查退出码为 0。

### Task 3: 浏览器与完整回归验证

**Files:**
- Verify: `tools/check-canvas-agent-browser.js`
- Verify: `package.json`

**Interfaces:**
- Consumes: Tasks 1-2 的行为。
- Produces: 真实 DOM 生命周期、布局和全量回归证据。

- [x] **Step 1: 启动本地测试服务**

Run: `$env:PORT='3193'; node server.js`

Expected: 服务监听 `http://127.0.0.1:3193`，不打开可见窗口。

- [x] **Step 2: 运行浏览器验收**

Run: `$env:CANVAS_AGENT_TEST_URL='http://127.0.0.1:3193'; node tools/check-canvas-agent-browser.js`

Expected: `Canvas agent browser checks passed.`。

- [x] **Step 3: 运行完整检查**

Run: `npm run check`

Expected: 退出码 0，全部既有检查通过。

- [x] **Step 4: 检查定向差异**

Run: `git diff --check`

Expected: 无空白错误。检查 `canvas-agent-ui.js`、`canvas-agent.css` 和两个 Agent 测试文件，确认没有模型名称、API Key、画布循环改动或可见 loading 文案。

### Task 4: 复审补强

- [x] 收起状态增加 `inert`、`aria-hidden` 与指针隔离，屏幕外输入控件不可聚焦。
- [x] 等待项绑定 `run_id`，所有异步工具和请求边界校验当前任务，阻断停止后旧任务串入新任务。
- [x] 收到终态 `turn` 后立即取消流读取并移除等待项。
- [x] 浏览器覆盖偏好重载、reduced-motion、停止、重置、接口失败和旧工具跨任务竞争。
