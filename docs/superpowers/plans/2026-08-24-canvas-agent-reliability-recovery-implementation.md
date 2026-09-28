# 画布 Agent 路由可靠性与任务恢复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 Agent 验证状态矛盾、4 秒误超时、同接口伪备用、候选池不足、网络错误不可恢复，以及明确生图命令在全部 LLM 超时时无法执行的问题。

**Architecture:** 保持 Model Adapter 与 MCP 工具协议不变，在 Router 增加接口多样性和自适应首响应预算，在独立验证策略模块中选择少量跨接口候选，并在 Agent UI 初始请求失败时以标准 MCP 工具调用执行保守的直接生图兜底。所有后台验证只在设置页可见时串行执行。

**Tech Stack:** Node.js CommonJS/UMD、浏览器原生 JavaScript、NDJSON 流、现有 MCP Session/Broker、Node `assert`、Playwright。

**执行状态：已完成；静态、单元与浏览器回归均通过。**

## Global Constraints

- 不增加依赖，不增加常驻轮询。
- 不改变节点坐标；所有画布写操作继续绑定当前 `boardId`、`runId` 和 Broker scope。
- 付费生成仍需现有一次性确认；确定性兜底不得绕过 MCP。
- 自动验证只验证文本与工具调用，不操作画布、不调用图片生成。
- 保留用户现有未提交改动，不执行清理、重置或提交。

---

### Task 1: 路由接口多样性与自适应等待

**Files:**
- Modify: `canvas-agent-router.js`
- Modify: `server.js`
- Test: `tools/check-canvas-agent-router.js`
- Test: `tools/check-canvas-agent-failover-endpoint.js`

**Interfaces:**
- Produces: `orderAgentCandidatesByEndpointDiversity(candidates): Candidate[]`
- Produces: `getAdaptiveAgentAttemptPolicy(candidate, health, policy): Policy`
- Consumes: `queueCanvasAgentRouteEvent()` 已保存的 `ewmaFirstEventMs` 与 `ewmaLatencyMs`

- [ ] **Step 1: 写入失败测试**

```js
assert.deepEqual(
  Router.orderAgentCandidatesByEndpointDiversity([
    { id: "a-chat", baseUrl: "https://a.test/v1" },
    { id: "a-responses", baseUrl: "https://a.test/v1" },
    { id: "b-chat", baseUrl: "https://b.test/v1" },
  ]).map((item) => item.id),
  ["a-chat", "b-chat", "a-responses"],
);
const adaptive = Router.getAdaptiveAgentAttemptPolicy({}, { ewmaFirstEventMs: 5000 }, {
  connectTimeoutMs: 4000,
  firstEventTimeoutMs: 10000,
  attemptTimeoutMs: 45000,
});
assert.equal(adaptive.connectTimeoutMs, 8500);
```

- [ ] **Step 2: 运行测试并确认因函数缺失而失败**

Run: `node tools/check-canvas-agent-router.js`

Expected: FAIL，提示 `orderAgentCandidatesByEndpointDiversity is not a function`。

- [ ] **Step 3: 实现最小路由函数并接入服务端**

```js
function orderAgentCandidatesByEndpointDiversity(candidates = []) {
  const first = [];
  const rest = [];
  const endpoints = new Set();
  candidates.forEach((candidate) => {
    const endpoint = normalizeAgentBaseUrl(candidate.baseUrl);
    (endpoints.has(endpoint) ? rest : first).push(candidate);
    endpoints.add(endpoint);
  });
  return [...first, ...rest];
}

function getAdaptiveAgentAttemptPolicy(candidate, health = {}, policy = {}) {
  const observed = positiveNumber(health.ewmaFirstEventMs) || positiveNumber(health.ewmaLatencyMs);
  const connectTimeoutMs = observed
    ? Math.max(8000, Math.min(20000, Math.ceil(observed * 1.5 + 1000)))
    : Math.max(10000, Number(policy.connectTimeoutMs || 0));
  return { ...policy, connectTimeoutMs };
}
```

- [ ] **Step 4: 运行路由和端点回归**

Run: `node tools/check-canvas-agent-router.js`

Expected: `Canvas agent router checks passed.`

Run: `node tools/check-canvas-agent-failover-endpoint.js`

Expected: `Canvas agent failover endpoint checks passed.`

---

### Task 2: 设置页按需补齐跨接口候选

**Files:**
- Create: `canvas-agent-verification.js`
- Modify: `index.html`
- Modify: `script.js`
- Modify: `package.json`
- Create: `tools/check-canvas-agent-verification.js`
- Modify: `tools/check-canvas-agent-ui.js`

**Interfaces:**
- Produces: `CanvasAgentVerification.selectAutoVerificationTargets(pool, options): DiscoveredCandidate[]`
- Produces: `CanvasAgentVerification.classifyVerificationQuality(result): { tone, label }`
- Consumes: `verifyProviderAgent(modelId, providerId, options)` 和候选池的 `candidates`、`discovered`

- [ ] **Step 1: 写入验证策略失败测试**

```js
const targets = Verification.selectAutoVerificationTargets({
  candidates: [{ endpoint: "a.test", model: "gpt-5.6-terra", state: "ready" }],
  discovered: [
    { providerId: "a2", endpoint: "a.test", model: "gpt-5.6-terra", state: "pending_verification" },
    { providerId: "b", endpoint: "b.test", model: "gpt-5.6-terra", state: "pending_verification" },
    { providerId: "c", endpoint: "c.test", model: "gpt-5.5", state: "pending_verification" },
  ],
}, { maxReadyEndpoints: 3, maxTargets: 2 });
assert.deepEqual(targets.map((item) => item.endpoint), ["b.test", "c.test"]);
assert.equal(Verification.classifyVerificationQuality({ tools: true, latencyMs: 21598 }).label, "已验证 · 响应较慢");
```

- [ ] **Step 2: 运行测试并确认模块缺失失败**

Run: `node tools/check-canvas-agent-verification.js`

Expected: FAIL，提示找不到 `canvas-agent-verification.js`。

- [ ] **Step 3: 实现纯策略模块**

```js
function classifyVerificationQuality(result = {}) {
  if (result.tools !== true) return { tone: "partial", label: "工具未通过" };
  const latencyMs = Math.max(0, Number(result.latencyMs || 0));
  return latencyMs > 10000
    ? { tone: "slow", label: "已验证 · 响应较慢" }
    : { tone: "verified", label: "Agent 已验证" };
}
```

- [ ] **Step 4: 串行接入自动验证**

```js
async function scheduleAgentAutoVerification() {
  if (activeSettingsTab !== "agent-models" || agentAutoVerificationActive) return;
  const targets = CanvasAgentVerification.selectAutoVerificationTargets(agentRoutingCandidateState.data, {
    maxReadyEndpoints: 3,
    maxTargets: 3,
    attemptedKeys: agentAutoVerificationAttempted,
  });
  agentAutoVerificationActive = true;
  try {
    for (const target of targets) {
      if (activeSettingsTab !== "agent-models") break;
      await verifyProviderAgent(target.model, target.providerId, { automatic: true });
    }
  } finally {
    agentAutoVerificationActive = false;
  }
}
```

- [ ] **Step 5: 运行策略与静态 UI 检查**

Run: `node tools/check-canvas-agent-verification.js`

Expected: `Canvas agent verification policy checks passed.`

Run: `node tools/check-canvas-agent-ui.js`

Expected: `Canvas agent UI checks passed.`

---

### Task 3: 验证结果即时收尾和质量展示

**Files:**
- Modify: `script.js`
- Modify: `styles.css`
- Modify: `tools/check-provider-agent-verification.js`
- Modify: `tools/check-canvas-agent-ui-browser.js`

**Interfaces:**
- Consumes: `CanvasAgentVerification.classifyVerificationQuality()`
- Produces: 验证请求完成后立即稳定的按钮、状态文案和候选刷新行为

- [ ] **Step 1: 写入失败检查**

```js
assert.match(script, /providerAgentVerificationState\.set\(key, data\);[\s\S]{0,160}renderAgentModelSettings\(\);[\s\S]{0,200}loadAgentRoutingCandidates/);
assert.match(script, /已验证 · 响应较慢/);
```

- [ ] **Step 2: 运行检查并确认渲染顺序失败**

Run: `node tools/check-provider-agent-verification.js`

Expected: FAIL，成功状态尚未在候选池刷新前渲染。

- [ ] **Step 3: 先渲染最终状态，再刷新排名**

```js
providerAgentVerificationState.set(key, data);
renderAgentModelSettings();
void loadAgentRoutingCandidates({ silent: true }).then(() => {
  if (activeSettingsTab === "agent-models") renderAgentModelSettings();
});
```

- [ ] **Step 4: 运行验证与浏览器检查**

Run: `node tools/check-provider-agent-verification.js`

Expected: `Provider Agent verification checks passed.`

Run: `node tools/check-canvas-agent-ui-browser.js`

Expected: `Canvas agent browser checks passed.`

---

### Task 4: 可恢复网络错误与明确生图 MCP 兜底

**Files:**
- Modify: `canvas-agent-core.js`
- Modify: `canvas-agent-ui.js`
- Modify: `tools/check-canvas-agent-core.js`
- Modify: `tools/check-canvas-agent-ui.js`
- Modify: `tools/check-canvas-agent-browser.js`

**Interfaces:**
- Produces: `CanvasAgentCore.parseDirectImageFallbackIntent(prompt, canvas): { prompt } | null`
- Produces: `tryCanvasAgentDirectImageFallback(error, canvas, runId): Promise<boolean>`
- Consumes: `handleCanvasAgentTurn(turn, runId, { terminalToolRun: true })`

- [ ] **Step 1: 写入直接生图边界失败测试**

```js
assert.deepEqual(Core.parseDirectImageFallbackIntent("生成一个苹果图片", { nodes: [] }), { prompt: "生成一个苹果图片" });
assert.equal(Core.parseDirectImageFallbackIntent("讨论一下苹果海报怎么设计", { nodes: [] }), null);
assert.equal(Core.parseDirectImageFallbackIntent("生成一个苹果图片", {
  nodes: [{ id: "1", kind: "image", is_upload_only: false }],
}), null);
```

- [ ] **Step 2: 运行测试并确认函数缺失失败**

Run: `node tools/check-canvas-agent-core.js`

Expected: FAIL，提示 `parseDirectImageFallbackIntent is not a function`。

- [ ] **Step 3: 实现保守意图判断**

```js
function parseDirectImageFallbackIntent(prompt, canvas = {}) {
  const text = trimText(prompt, 12000).trim();
  if (!/(?:生成|画|绘制|创建|做)(?:一|1)?(?:张|个)?[^。！？]{0,80}(?:图片|图像|海报|封面|配图)/u.test(text)) return null;
  if (/(?:讨论|头脑风暴|建议|分析|怎么|如何|要不要|是否|方案)/u.test(text)) return null;
  const hasGenerator = (Array.isArray(canvas.nodes) ? canvas.nodes : [])
    .some((node) => node?.kind === "image" && node?.is_upload_only !== true);
  return hasGenerator ? null : { prompt: text };
}
```

- [ ] **Step 4: 通过标准 MCP 调用执行终结型兜底**

```js
const fallbackTurn = {
  response_id: "",
  message: "Agent 模型暂时没有响应，我将按你的明确要求使用画布生图流程继续。",
  tool_calls: [{
    call_id: `local_image_${Date.now()}`,
    name: "generate_image_to_gallery",
    arguments: { prompt: fallback.prompt, model: null },
  }],
};
await handleCanvasAgentTurn(fallbackTurn, runId, { terminalToolRun: true });
```

- [ ] **Step 5: 将本地网络错误归类为可恢复**

```js
function isCanvasAgentRecoverableError(error) {
  return Boolean(error?.recoverable)
    || isCanvasAgentProtocolStateError(error)
    || /failed to fetch|networkerror|load failed|服务暂时不可用|所有可用服务|timeout|timed out/i
      .test(String(error?.message || error || ""));
}
```

- [ ] **Step 6: 运行核心、UI 和浏览器回归**

Run: `node tools/check-canvas-agent-core.js`

Expected: `Canvas agent core checks passed.`

Run: `node tools/check-canvas-agent-ui.js`

Expected: `Canvas agent UI checks passed.`

Run: `node tools/check-canvas-agent-browser.js`

Expected: `Canvas agent browser checks passed.`

---

### Task 5: 完整回归与性能验收

**Files:**
- Modify: `index.html`（资源版本号）
- Modify: `docs/superpowers/specs/2026-08-24-canvas-agent-reliability-recovery-design.md`（状态）
- Test: `package.json` 中的完整检查入口

**Interfaces:**
- Consumes: Tasks 1–4 的全部导出和浏览器行为
- Produces: 可部署、可重复验证的最终实现

- [ ] **Step 1: 更新静态资源版本号并做语法检查**

Run: `node --check canvas-agent-router.js`

Expected: exit 0。

Run: `node --check canvas-agent-verification.js`

Expected: exit 0。

- [ ] **Step 2: 运行完整自动检查**

Run: `npm run check`

Expected: exit 0，所有检查输出 `passed`。

- [ ] **Step 3: 运行真实浏览器闭环**

Run: `node tools/check-canvas-agent-ui-browser.js`

Expected: 验证按钮即时收尾、自动验证串行且界面不跳动。

Run: `node tools/check-canvas-agent-browser.js`

Expected: 跨接口失败转移、网络恢复、明确生图 MCP 兜底与现有节点边界全部通过。

- [ ] **Step 4: 更新设计状态**

将设计文档状态改为“已实现并通过回归”，记录完整测试命令和结果。
