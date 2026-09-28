# Canvas Agent 图片路由与旧节点复用 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让画布 Agent 在明确生图时稳定选择 image2 接口并完成真实生成，同时在发现相关旧生成节点时先定位、高亮并让用户选择复用方式。

**Architecture:** 保留 LLM 意图理解与 Model Adapter；由核心 Skill 规定交互流程，MCP 暴露统一的高层生图与旧节点决策工具，Canvas API 负责确定性模型路由、视口定位、付费执行和结果验收。模型候选按“目标模型强匹配 → 稳定性 → 延迟”排序，空缓存或缺少目标模型时通过共享 Promise 刷新一次。

**Tech Stack:** 原生 JavaScript、DOM、进程内 MCP、Node.js `assert` 检查脚本、Playwright 浏览器回归。

## Global Constraints

- 默认模型仅使用 `gpt-image-2`（image2）系列；用户明确指定模型时不得静默换成其他模型。
- 找不到可用模型时停止并用中文提示，且不得先创建空节点。
- 旧节点定位只改变视口与选中态，不修改节点坐标。
- 用户没有选择旧节点复用方式前不得发起付费生成。
- 图片真实返回并写入连接图集后才允许报告完成。
- 所有操作严格绑定当前 `boardId + runId`；不得增加渲染循环、常驻监听或高频模型扫描。
- 保留用户现有未提交改动；本次不执行 `git add`、`git commit`、`git reset` 或 `git clean`。

---

### Task 1: 确定性图片模型匹配与排名

**Files:**
- Modify: `image-model-routing.js`
- Modify: `tools/check-image-model-routing.js`

**Interfaces:**
- Consumes: `rankCandidates(candidates, options)` 当前候选过滤与稳定性字段。
- Produces: `normalizeModelName(value)`, `matchesRequestedModel(candidate, requestedModel)`, `rankCandidates(candidates, { requestedModel, defaultModelFamily, requiresEdit })`。

- [x] **Step 1: 写入失败测试**

```js
assert.equal(routing.selectCandidate(mixed, { defaultModelFamily: "gpt-image-2" }).model, "gpt-image-2");
assert.equal(routing.selectCandidate(mixed, { requestedModel: "Gemini 3 Pro Image" }).model, "gemini-3-pro-image-preview");
assert.equal(routing.selectCandidate(mixed, { requestedModel: "missing" }), null);
assert.deepEqual(routing.rankCandidates(sameModel).map((item) => item.providerId), ["stable", "fast-but-unstable"]);
```

- [x] **Step 2: 运行测试并确认失败**

Run: `node tools/check-image-model-routing.js`

Expected: FAIL，因为路由尚未按目标模型过滤。

- [x] **Step 3: 实现规范化匹配与稳定优先排序**

```js
function normalizeModelName(value) {
  return String(value || "").trim().toLowerCase().replace(/[\s_.:/\\-]+/g, "");
}

function matchesRequestedModel(candidate, requestedModel) {
  const target = normalizeModelName(requestedModel);
  return [candidate.id, candidate.model, candidate.family, candidate.label, candidate.alias]
    .some((value) => normalizeModelName(value) === target);
}
```

`rankCandidates` 先按 `requestedModel` 或 `defaultModelFamily` 过滤，再按最近成功、健康状态、成功率、连续失败和延迟排序；默认选择不再受画布手动下拉框偏好影响。

- [x] **Step 4: 运行路由测试**

Run: `node tools/check-image-model-routing.js`

Expected: `Image model routing checks passed.`

### Task 2: 候选懒刷新与显式模型参数

**Files:**
- Modify: `canvas-agent-capabilities.js`
- Modify: `script.js`
- Modify: `tools/check-canvas-agent-full-capability.js`
- Modify: `tools/check-image-model-candidates.js`

**Interfaces:**
- Consumes: Task 1 的 `rankCandidates` 目标模型参数。
- Produces: `loadImageModels({ preserveOnError }) -> Promise<Array<Candidate>>`、`ensureCanvasAgentImageModelCandidate(options) -> Promise<Candidate|null>`，以及 `generate_image_to_gallery.model: string|null`。

- [x] **Step 1: 写入失败检查**

```js
assert.match(capabilitySource, /model:\s*nullableStringSchema/);
assert.match(scriptSource, /canvasImageModelsLoadPromise/);
assert.match(scriptSource, /requestedModel:\s*explicitModel/);
assert.doesNotMatch(scriptSource, /preferredId:\s*String\(imageModelInput/);
```

- [x] **Step 2: 运行检查并确认失败**

Run: `node tools/check-canvas-agent-full-capability.js && node tools/check-image-model-candidates.js`

Expected: FAIL，因为工具 schema 与共享刷新尚未完成。

- [x] **Step 3: 实现共享刷新和模型选择**

```js
let canvasImageModelsLoadPromise = null;

async function ensureCanvasAgentImageModelCandidate(options) {
  let candidate = resolveCanvasAgentImageModel(options);
  if (candidate) return candidate;
  if (!canvasImageModelsLoadPromise) {
    canvasImageModelsLoadPromise = loadImageModels({ preserveOnError: true })
      .finally(() => { canvasImageModelsLoadPromise = null; });
  }
  await canvasImageModelsLoadPromise;
  return resolveCanvasAgentImageModel(options);
}
```

`generateAgentCanvasImageToGallery` 在创建节点前等待预检；`args.model` 非空时精确匹配，空值时只匹配 image2。失败文案区分“默认 image2 不可用”和“指定模型不可用”。

- [x] **Step 4: 运行相关检查**

Run: `node tools/check-canvas-agent-full-capability.js && node tools/check-image-model-candidates.js`

Expected: 两个脚本均输出通过。

### Task 3: 现有生成节点的真实结果与图集幂等

**Files:**
- Modify: `script.js`
- Modify: `tools/check-canvas-agent-full-capability.js`

**Interfaces:**
- Consumes: `runCanvasImageEdit(node, { guard }) -> { ok, image, gallery }`。
- Produces: `run_canvas_node` 输出 `{ ok, node_id, gallery_node_id, image_count, output }`；`update_gallery` 对已连接且已有结果的生成节点返回幂等成功。

- [x] **Step 1: 写入失败检查**

```js
assert.match(source, /const generated = await runCanvasImageEdit/);
assert.match(source, /gallery_node_id/);
assert.match(source, /already_present:\s*true/);
```

- [x] **Step 2: 运行检查并确认失败**

Run: `node tools/check-canvas-agent-full-capability.js`

Expected: FAIL，因为当前 `run_canvas_node` 丢弃了图片运行结果。

- [x] **Step 3: 保留图片运行结果并做图集验收**

```js
const generated = await runCanvasImageEdit(node, { guard });
const gallery = generated?.gallery || findConnectedCanvasGallery(node);
return {
  ok: true,
  node_id: node.dataset.id,
  gallery_node_id: gallery?.dataset.id || null,
  image_count: gallery ? getCanvasGalleryImages(gallery).length : 0,
  output: generated?.image || null,
};
```

`updateAgentCanvasGallery` 遇到来源为生成节点时，先检查目标是否就是其连接图集且已有图片；满足时返回 `already_present: true`，不重复追加、不抛错。

- [x] **Step 4: 运行能力检查**

Run: `node tools/check-canvas-agent-full-capability.js`

Expected: `Canvas Agent full capability checks passed.`

### Task 4: 旧节点定位与三选一决策工具

**Files:**
- Modify: `canvas-agent-capabilities.js`
- Modify: `canvas-agent-tool-adapters.js`
- Modify: `script.js`
- Modify: `canvas-agent-ui.js`
- Modify: `styles.css`
- Modify: `tools/check-canvas-agent-capabilities.js`
- Modify: `tools/check-canvas-agent-tool-adapters.js`
- Modify: `tools/check-canvas-agent-ui.js`

**Interfaces:**
- Produces MCP tool `request_image_node_choice({ node_id, suggested_prompt })`。
- Canvas API produces `requestImageNodeChoice(args, context) -> { ok, decision_required, node_id, current_prompt, suggested_prompt, model, has_result, options }`。
- UI pauses the current run and renders buttons carrying `data-agent-image-choice` values `rerun`, `update`, `new`.

- [x] **Step 1: 写入失败检查**

```js
assert.ok(byTool.get("request_image_node_choice"));
assert.match(adapterSource, /request_image_node_choice/);
assert.match(uiSource, /data-agent-image-choice/);
assert.match(scriptSource, /focusAgentCanvasNodesInViewport/);
```

- [x] **Step 2: 运行检查并确认失败**

Run: `node tools/check-canvas-agent-capabilities.js && node tools/check-canvas-agent-tool-adapters.js && node tools/check-canvas-agent-ui.js`

Expected: FAIL，因为决策能力尚不存在。

- [x] **Step 3: 实现只移动镜头的定位函数**

```js
function focusAgentCanvasNodesInViewport(nodes) {
  const bounds = getCanvasNodesBounds(nodes);
  const rect = document.querySelector("#infiniteCanvas")?.getBoundingClientRect();
  canvasState.x = rect.width / 2 - ((bounds.left + bounds.right) / 2) * canvasState.scale;
  canvasState.y = rect.height / 2 - ((bounds.top + bounds.bottom) / 2) * canvasState.scale;
  clearCanvasSelection();
  nodes.forEach(addCanvasNodeToSelection);
  scheduleCanvasTransform();
}
```

返回当前提示词、模型和是否已有连接图集；节点 `dataset.x/y` 在调用前后必须相等。

- [x] **Step 4: 实现三选一消息卡和恢复运行**

`executeCanvasAgentToolsAndContinue` 检测 `decision_required` 后停止当前 MCP 续跑并展示三按钮。按钮点击后把确定性的选择文本与节点 ID 写入同画布对话，再发起新一轮 Agent 任务：原样再生成、用 `suggested_prompt` 更新后生成、或新建并生成。点击前不触发付费工具。

- [x] **Step 5: 添加深浅主题样式**

```css
.canvas-agent-image-choice { border: 1px solid var(--border); background: var(--panel); }
.canvas-agent-image-choice button { color: var(--text); background: var(--panel-strong); }
.canvas-agent-image-choice button.is-primary { background: var(--accent); color: var(--accent-contrast); }
```

使用项目现有主题变量；卡片在窄面板内纵向排列，不遮挡输入框。

- [x] **Step 6: 运行能力、适配器和 UI 检查**

Run: `node tools/check-canvas-agent-capabilities.js && node tools/check-canvas-agent-tool-adapters.js && node tools/check-canvas-agent-ui.js`

Expected: 三个脚本均输出通过。

### Task 5: Skill 与运行时规则同步

**Files:**
- Modify: `skills/canvas-agent-core/SKILL.md`
- Modify: `canvas-agent-runtime.js`
- Modify: `tools/check-canvas-agent-skill-routing.js`
- Modify: `tools/check-canvas-agent-runtime.js`

**Interfaces:**
- Consumes: Task 2 的 `model` 参数、Task 4 的 `request_image_node_choice`。
- Produces: 与任意 LLM Adapter 无关的稳定工具调用规范。

- [x] **Step 1: 写入失败测试**

```js
assert.match(skill, /request_image_node_choice/);
assert.match(skill, /用户明确指定模型/);
assert.match(runtime, /默认.*gpt-image-2/);
assert.match(runtime, /不得直接运行相关旧节点/);
```

- [x] **Step 2: 运行测试并确认失败**

Run: `node tools/check-canvas-agent-skill-routing.js && node tools/check-canvas-agent-runtime.js`

Expected: FAIL，因为提示规则尚未同步。

- [x] **Step 3: 更新中文 Skill 与系统指令**

规则明确写为：讨论不执行；明确直接生图用高层工具；默认 `model: null`；用户点名才传模型；发现相关旧节点先调用决策工具；`run_canvas_node` 已返回图集时不得再调用 `update_gallery`。

- [x] **Step 4: 运行 Skill 与运行时检查**

Run: `node tools/check-canvas-agent-skill-routing.js && node tools/check-canvas-agent-runtime.js`

Expected: 两个脚本均输出通过。

### Task 6: 浏览器闭环与全量验证

**Files:**
- Modify: `tools/check-canvas-agent-browser.js`
- Modify: `tools/check-canvas-agent-ui-browser.js`
- Modify: `docs/superpowers/specs/2026-08-24-canvas-agent-direct-image-generation-design.md`

**Interfaces:**
- Verifies Tasks 1–5 as a single user-visible workflow.

- [x] **Step 1: 增加浏览器失败用例**

```js
// 断言：旧节点 x/y 未变、节点被选中且位于视口中心、三按钮可见、选择前图片接口调用数为 0。
// 断言：默认请求选择最稳的 gpt-image-2 接口；显式模型只使用匹配接口；缺失模型显示中文提示且不创建节点。
// 断言：运行旧节点后返回 gallery_node_id，并且 Agent 不再追加 update_gallery 调用。
```

- [x] **Step 2: 运行浏览器检查并确认新用例失败**

Run: `node tools/check-canvas-agent-ui-browser.js && node tools/check-canvas-agent-browser.js`

Expected: 新断言在实现前失败。

- [x] **Step 3: 修正集成边界并更新设计状态**

只修改导致端到端失败的最小集成代码；将设计文档状态改为“已实施并验证”，不得放宽断言。

- [x] **Step 4: 运行语法与专项检查**

Run: `node --check image-model-routing.js && node --check canvas-agent-capabilities.js && node --check canvas-agent-tool-adapters.js && node --check canvas-agent-ui.js && node --check canvas-agent-runtime.js && node --check script.js`

Expected: 全部退出码为 0。

- [x] **Step 5: 运行完整回归**

Run: `npm run check`

Expected: 全部检查通过，无 Agent、画布、模型路由或性能回归。

- [x] **Step 6: 运行浏览器闭环**

Run: `node tools/check-canvas-agent-ui-browser.js && node tools/check-canvas-agent-browser.js`

Expected: 两个浏览器脚本均通过，且没有重复付费请求。
