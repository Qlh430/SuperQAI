# Agent 自动路由设置 Implementation Plan

> 实施状态：已完成。验证：`npm run check`、`node tools/check-canvas-agent-browser.js`（指向当前临时服务）和 `node tools/check-portable-package.js .`。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 默认自动择优地路由画布 Agent 模型，并在设置页展示和修改候选池策略。

**Architecture:** `canvas-agent-router.js` 提供纯粹、可测试的策略归一化和评分；`server.js` 将设置、健康记录和已验证能力组合为经过脱敏的候选池 API；`script.js` 渲染并保存中文设置。未验证模型可见但不会进入执行池。

**Tech Stack:** Node.js CommonJS、原生浏览器 JavaScript、现有 Settings API、Node assert 检查脚本。

## Global Constraints

- 默认 `balanced`，绝不强制首选环境变量模型。
- 仅已保存、启用、文本和工具实测通过的模型可被 Agent 执行。
- 自动检测不发起后台模型请求，不泄露 API key，不阻塞画布。
- 使用 TDD；共享工作区不执行 git add、commit、reset 或清理。

---

### Task 1: Router 策略与排序

**Files:**
- Modify: `canvas-agent-router.js`
- Test: `tools/check-canvas-agent-router.js`

**Interfaces:**
- Produces: `normalizeAgentRouting(value)` 返回 `{ mode, preferredModel }`。
- Produces: `rankAgentCandidates(candidates, history, { routing, preferredModel, requiredCapabilities, now })`。

- [x] **Step 1: 写失败测试**

```js
assert.deepEqual(Router.normalizeAgentRouting({}), { mode: "balanced", preferredModel: "" });
assert.equal(speedRanked[0].id, "fast-but-flaky");
assert.equal(stabilityRanked[0].id, "slower-stable");
assert.equal(preferredRanked[0].model, "chosen-model");
```

- [x] **Step 2: 运行并确认失败**

Run: `node tools/check-canvas-agent-router.js`

Expected: FAIL，因为 `normalizeAgentRouting` 尚不存在且默认排序仍由 `preferredModel` 强制。

- [x] **Step 3: 最小实现**

```js
function normalizeAgentRouting(value = {}) {
  const mode = ["speed", "balanced", "stability", "preferred"].includes(value.mode) ? value.mode : "balanced";
  return { mode, preferredModel: String(value.preferredModel || "").trim() };
}
```

让评分函数按模式使用延迟、失败率和连续失败的不同权重；只有 `preferred` 模式使用模型匹配作为一级排序，熔断过滤保留。

- [x] **Step 4: 运行并确认通过**

Run: `node tools/check-canvas-agent-router.js`

Expected: `Canvas agent router checks passed.`

### Task 2: 设置持久化与候选池接口

**Files:**
- Modify: `server.js`
- Test: `tools/check-canvas-agent-server.js`

**Interfaces:**
- Produces: `GET /api/settings/agent-candidates`，返回 `{ routing, summary, candidates, discovered }`。
- Consumes: `settings.agentRouting`、`getCanvasAgentCapabilityRegistry()` 和 Agent 路线健康记录。

- [x] **Step 1: 写失败测试**

```js
assert.match(server, /agentRouting:\s*normalizeAgentRouting/);
assert.match(server, /GET[\s\S]*\/api\/settings\/agent-candidates/);
assert.match(server, /function buildCanvasAgentCandidatePool/);
```

- [x] **Step 2: 运行并确认失败**

Run: `node tools/check-canvas-agent-server.js`

Expected: FAIL，因为设置与候选池端点尚未实现。

- [x] **Step 3: 最小实现**

在默认和归一化设置中加入 `agentRouting`；将 `getCanvasAgentCandidates` 传入已保存路由；构建脱敏候选数据和“待实测”发现列表；在路由前注册 GET 端点。

- [x] **Step 4: 运行并确认通过**

Run: `node tools/check-canvas-agent-server.js`

Expected: `Canvas agent server checks passed.`

### Task 3: 设置页与轻量刷新

**Files:**
- Modify: `script.js`
- Modify: `styles.css`
- Test: `tools/check-canvas-agent-ui.js`

**Interfaces:**
- Consumes: `GET /api/settings/agent-candidates`。
- Produces: API 接入页的“Agent 路由”卡片与 `data-settings-agent-routing` 控件。

- [x] **Step 1: 写失败测试**

```js
assert.match(script, /SETTINGS_AGENT_CANDIDATES_API_URL/);
assert.match(script, /renderAgentRoutingSettings/);
assert.match(script, /data-settings-agent-routing/);
assert.match(styles, /agent-routing-card/);
```

- [x] **Step 2: 运行并确认失败**

Run: `node tools/check-canvas-agent-ui.js`

Expected: FAIL，因为设置页尚未有 Agent 路由控件或候选池读取。

- [x] **Step 3: 最小实现**

新增设置状态和异步读取；将策略选择与首选模型写入 `settingsState.agentRouting` 并复用“保存设置”；渲染可用、待实测、熔断候选及刷新按钮。仅设置页打开、刷新或保存时由服务端异步扫描模型列表，不发起付费推理；候选按模型与 API 接入分别展示、验证和记录健康状态。

- [x] **Step 4: 运行并确认通过**

Run: `node tools/check-canvas-agent-ui.js`

Expected: `Canvas agent UI checks passed.`

### Task 4: 回归验证与文档状态

**Files:**
- Modify: `docs/superpowers/specs/2026-08-21-agent-routing-settings-design.md`
- Modify: `docs/superpowers/plans/2026-08-21-agent-routing-settings-implementation.md`

- [x] **Step 1: 更新实现状态**

在两份文档顶部写入已完成和验证命令，不改变产品设计。

- [x] **Step 2: 运行完整验证**

Run: `npm run check`

Expected: exit code 0。

- [x] **Step 3: 运行界面与打包验证**

Run: `node tools/check-canvas-agent-browser.js; node tools/check-portable-package.js .`

Expected: 两个检查均通过。
