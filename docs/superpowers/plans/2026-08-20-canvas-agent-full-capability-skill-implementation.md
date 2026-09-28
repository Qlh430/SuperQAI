# 画布 Agent 完整能力与 Skill 系统实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把画布 Agent 升级为受当前画布边界保护的完整内容执行者，并用隐藏核心 Skill、按需业务 Skill 和动态能力注册表统一它的执行规范。

**Architecture:** 浏览器端以 `CanvasAgentCapabilityBroker` 持有不可变的 `boardId/runId/scopeVersion` 作用域，所有模型工具只能通过声明式能力注册表执行；画布切换立即使旧作用域失效。服务端始终加载精简核心 Skill，自动模式只发送业务 Skill 路由摘要，命中后通过 `activate_canvas_skill` 在下一轮仅注入一个业务 Skill 正文及其能力子集。

**Tech Stack:** 原生 JavaScript、DOM API、Node.js 18+、OpenAI Responses/Chat Completions 兼容接口、现有 NDJSON 流式接口、现有无框架检查脚本。

## Global Constraints

- Agent 只能读取和修改当前打开画布的内容，不能管理、切换或访问其他画布。
- 付费生成、任意删除、批量覆盖现有内容必须先显示合并确认卡。
- 用户全权委托后，安全操作直接连续执行；全权委托不能绕过确认和画布边界。
- 核心 Skill 始终生效但不显示在技能书；一次运行最多加载一个业务 Skill 正文。
- Skill 和能力目录仅在 Agent 请求时按文件修改时间刷新，不增加轮询、`MutationObserver` 或逐帧任务。
- 同一画布同一时间最多一个 Agent 修改任务；单批 DOM 目标最多 40 个，较大批次之间用 `requestAnimationFrame` 让出主线程。
- 对话继续按 `board_id` 独立保存，不进入画布 JSON、撤销快照、拖拽、缩放或渲染循环。
- 不向用户显示模型名、服务商原始错误、HTTP 状态、调用 ID 或 trace ID。

---

## 文件结构

- 创建 `canvas-agent-capabilities.js`：能力 ID、模型工具结构、风险级别、目标上限和 Skill 权限的唯一数据源。
- 创建 `canvas-agent-broker.js`：当前画布作用域、调用幂等、节点归属校验、危险调用归类和批处理让帧。
- 创建 `canvas-agent-tool-adapters.js`：把注册能力映射到现有画布函数和 DOM 控件，不包含路由或 UI 状态。
- 创建 `skills/canvas-agent-core/SKILL.md`：隐藏且始终生效的执行规范。
- 修改 `canvas-agent-core.js`：从能力目录导出工具、摘要扩展、确认计划和运行状态。
- 修改 `canvas-agent-runtime.js`：Skill 新元数据、mtime 缓存、核心/路由/激活三种加载状态、能力交集。
- 修改 `canvas-agent-ui.js`：用 Broker 代替工具 `switch`，维护作用域和激活 Skill，显示合并确认，切换画布时取消旧任务。
- 修改 `script.js`：为画布内容能力提供窄接口，并在异步生成提交结果前检查画布守卫。
- 修改 `index.html`、`build-portable.bat`、`package.json`：加载和打包新增模块，加入检查脚本。
- 修改 5 个现有 `skills/*/SKILL.md`：由 `tools` 改为稳定 `capabilities/triggers` 声明，正文只保留业务流程。
- 创建 `tools/check-canvas-agent-capabilities.js`、`tools/check-canvas-agent-broker.js`、`tools/check-canvas-agent-full-capability.js`、`tools/check-canvas-agent-skill-routing.js`：覆盖注册表、隔离、能力适配和按需 Skill。
- 修改 `tools/check-canvas-agent-core.js`、`tools/check-canvas-agent-runtime.js`、`tools/check-canvas-agent-ui.js`、`tools/check-canvas-agent-performance.js`：更新既有契约。

### Task 1: 建立单一能力注册表

**Files:**
- Create: `canvas-agent-capabilities.js`
- Modify: `canvas-agent-core.js`
- Create: `tools/check-canvas-agent-capabilities.js`
- Modify: `tools/check-canvas-agent-core.js`

**Interfaces:**
- Produces: `CanvasAgentCapabilities.CAPABILITY_REGISTRY`、`getCapability(id)`、`getCapabilityByToolName(name)`、`getToolDefinitions(ids)`、`getRisk(name,args)`、`getCapabilityIdsForToolNames(names)`。
- Consumes: 无；该模块同时支持 CommonJS 和浏览器全局。

- [ ] **Step 1: 写失败测试**

```js
const assert = require("node:assert/strict");
const capabilities = require("../canvas-agent-capabilities");

assert.equal(capabilities.getCapability("node.text.create").tool.name, "create_text_node");
assert.equal(capabilities.getCapability("node.run").risk, "paid");
assert.equal(capabilities.getCapability("node.delete").risk, "destructive");
assert.equal(capabilities.getRisk("update_nodes", { node_ids: ["1", "2"] }), "bulk-overwrite");
assert.ok(capabilities.getToolDefinitions(["node.text.create"]).every((tool) => tool.type === "function"));
assert.equal(new Set(capabilities.CAPABILITY_REGISTRY.map((item) => item.tool.name)).size, capabilities.CAPABILITY_REGISTRY.length);
```

- [ ] **Step 2: 运行并确认失败**

Run: `node tools/check-canvas-agent-capabilities.js`

Expected: FAIL，提示找不到 `canvas-agent-capabilities.js`。

- [ ] **Step 3: 实现冻结注册表及风险解析**

```js
(function initCanvasAgentCapabilities(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasAgentCapabilities = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCapabilities() {
  const definitions = [
    capability("node.text.create", "create_text_node", "在当前画布创建文字节点。", "safe", { content: text(), x: nullableNumber(), y: nullableNumber() }),
    capability("node.image.create", "create_image_node", "创建图片生成或编辑节点。", "safe", imageCreateProperties()),
    capability("node.llm.create", "create_llm_node", "创建 LLM 节点。", "safe", llmCreateProperties()),
    capability("node.comfy.create", "create_comfy_node", "创建 ComfyUI 节点。", "safe", comfyCreateProperties()),
    capability("node.video.create", "create_video_node", "创建 MiniMax H3 视频节点。", "safe", videoCreateProperties()),
    capability("node.media.create", "create_media_node", "从当前画布素材创建图片、视频或音频节点。", "safe", mediaCreateProperties()),
    capability("node.gallery.create", "create_gallery_node", "创建图集节点。", "safe", pointAndTitleProperties()),
    capability("node.loop.create", "create_loop_node", "创建循环节点。", "safe", pointProperties()),
    capability("node.grid.create", "create_grid_editor_node", "从当前画布图片创建宫格编辑节点。", "safe", gridCreateProperties()),
    capability("node.update", "update_node", "更新一个现有节点。", dynamicUpdateRisk, updateProperties()),
    capability("node.batch.update", "update_nodes", "批量更新现有节点。", "bulk-overwrite", batchUpdateProperties(), 40),
    capability("node.duplicate", "duplicate_nodes", "复制当前画布节点。", "safe", nodeIdsProperties(), 40),
    capability("node.move", "move_nodes", "移动当前画布节点。", "safe", moveProperties(), 40),
    capability("node.arrange", "arrange_nodes", "排列当前画布节点。", "safe", arrangeProperties(), 40),
    capability("node.connect", "connect_nodes", "连接两个当前画布节点。", "safe", connectProperties()),
    capability("node.disconnect", "disconnect_nodes", "断开两个当前画布节点。", "safe", disconnectProperties()),
    capability("node.reference.order", "set_reference_order", "调整节点参考素材顺序。", "safe", referenceOrderProperties(), 40),
    capability("node.group", "group_nodes", "把节点加入新建或现有分组。", "safe", groupProperties(), 40),
    capability("node.ungroup", "ungroup_nodes", "解散分组或移出成员。", "safe", ungroupProperties(), 40),
    capability("gallery.update", "update_gallery", "调整图集标题、布局、顺序或移除图片。", dynamicUpdateRisk, galleryProperties(), 40),
    capability("grid.update", "update_grid_editor", "调整宫格规格、间距和单格缩放。", dynamicUpdateRisk, gridUpdateProperties(), 40),
    capability("grid.extract", "extract_grid_to_gallery", "把宫格切片提取到图集。", "safe", oneNodeProperties()),
    capability("node.run", "run_canvas_node", "执行当前画布生成节点。", "paid", oneNodeProperties()),
    capability("node.delete", "delete_nodes", "删除当前画布节点。", "destructive", nodeIdsProperties(), 40),
    capability("skill.activate", "activate_canvas_skill", "按需激活一个业务 Skill。", "safe", { skill_id: text(), reason: text() }),
  ];
  const byId = new Map(definitions.map((item) => [item.id, item]));
  const byTool = new Map(definitions.map((item) => [item.tool.name, item]));
  function getRisk(name, args = {}) {
    const item = byTool.get(String(name || ""));
    return typeof item?.risk === "function" ? item.risk(args) : item?.risk || "safe";
  }
  return Object.freeze({
    CAPABILITY_REGISTRY: Object.freeze(definitions),
    getCapability: (id) => byId.get(String(id || "")) || null,
    getCapabilityByToolName: (name) => byTool.get(String(name || "")) || null,
    getToolDefinitions: (ids) => Array.from(new Set(ids || [])).map((id) => byId.get(id)?.tool).filter(Boolean),
    getRisk,
    getCapabilityIdsForToolNames: (names) => Array.from(new Set(names || [])).map((name) => byTool.get(name)?.id).filter(Boolean),
  });
});
```

实现中的 schema helper 必须为所有工具生成 `strict: true`、`additionalProperties: false` 的 JSON Schema，并将节点数组 `maxItems` 固定为 40。`canvas-agent-core.js` 删除手写 `TOOL_DEFINITIONS`，改为引用注册表并把 `requiresApproval(name,args)` 定义为风险不等于 `safe`。

- [ ] **Step 4: 运行能力与核心检查**

Run: `node tools/check-canvas-agent-capabilities.js && node tools/check-canvas-agent-core.js`

Expected: 两个脚本均输出 `passed`。

- [ ] **Step 5: 提交**

```bash
git add canvas-agent-capabilities.js canvas-agent-core.js tools/check-canvas-agent-capabilities.js tools/check-canvas-agent-core.js
git commit -m "feat: add canvas agent capability registry"
```

### Task 2: 创建隐藏核心 Skill 与按需业务 Skill 路由

**Files:**
- Create: `skills/canvas-agent-core/SKILL.md`
- Modify: `skills/product-refinement/SKILL.md`
- Modify: `skills/ecommerce-image-set/SKILL.md`
- Modify: `skills/poster-design/SKILL.md`
- Modify: `skills/social-media-pack/SKILL.md`
- Modify: `skills/image-to-video/SKILL.md`
- Modify: `canvas-agent-runtime.js`
- Create: `tools/check-canvas-agent-skill-routing.js`
- Modify: `tools/check-canvas-agent-runtime.js`

**Interfaces:**
- Consumes: `CanvasAgentCapabilities.getToolDefinitions(capabilityIds)`。
- Produces: `loadCanvasSkills(directory)` 返回 `{ core, business }`；`resolveCanvasAgentSkillContext(payload,catalog)` 返回 `{ mode, activeSkill, instructions, capabilityIds }`。

- [ ] **Step 1: 写失败测试**

```js
const catalog = runtime.loadCanvasSkills(path.join(ROOT, "skills"));
assert.equal(catalog.core.id, "canvas-agent-core");
assert.equal(runtime.getPublicSkillMetadata(catalog).some((item) => item.id === "canvas-agent-core"), false);

const automatic = runtime.resolveCanvasAgentSkillContext({ skill_mode: "auto" }, catalog);
assert.match(automatic.instructions, /当前画布/);
assert.doesNotMatch(automatic.instructions, /## 海报设计/);
assert.ok(automatic.capabilityIds.includes("skill.activate"));

const activated = runtime.resolveCanvasAgentSkillContext({ skill_mode: "auto", active_skill_id: "poster-design" }, catalog);
assert.match(activated.instructions, /海报设计/);
assert.equal(activated.activeSkill.id, "poster-design");
assert.equal(activated.capabilityIds.includes("node.video.create"), false);
assert.throws(() => runtime.parseSkillDocument(unknownCapabilitySkill), /unknown capabilities/);
```

- [ ] **Step 2: 运行并确认失败**

Run: `node tools/check-canvas-agent-skill-routing.js`

Expected: FAIL，现有 loader 仍返回数组且自动提示词含全部业务 Skill 正文。

- [ ] **Step 3: 编写核心 Skill 与业务元数据**

核心文件 frontmatter 固定为：

```yaml
---
name: canvas-agent-core
description: 当前画布 Agent 的统一执行、安全和恢复规范
canvas:
  label: 画布 Agent 核心
  hidden: true
  core: true
  capabilities: [node.text.create, node.image.create, node.llm.create, node.comfy.create, node.video.create, node.media.create, node.gallery.create, node.loop.create, node.grid.create, node.update, node.batch.update, node.duplicate, node.move, node.arrange, node.connect, node.disconnect, node.reference.order, node.group, node.ungroup, gallery.update, grid.update, grid.extract, node.run, node.delete, skill.activate]
---
```

正文明确：讨论时不调用工具；可执行意图下安全操作直接执行；全权委托自行补全合理细节；付费、删除、批量覆盖必须确认；只操作当前画布；失败后读取结构化结果并安全恢复；不得虚构结果或自动重试付费操作。

每个业务 Skill 改为 `triggers` 和 `capabilities`，例如海报：

```yaml
canvas:
  label: 海报设计
  category: marketing
  icon: monitor
  triggers: [海报, 主视觉, 活动视觉, 营销视觉]
  required_context: optional-image
  capabilities: [node.text.create, node.image.create, node.gallery.create, node.update, node.connect, node.arrange, node.run]
```

- [ ] **Step 4: 实现 mtime 缓存、精简路由摘要和激活上下文**

```js
const skillCache = new Map();
function readCachedSkill(filename, relativeSource) {
  const stat = fs.statSync(filename);
  const cached = skillCache.get(filename);
  if (cached?.mtimeMs === stat.mtimeMs) return cached.skill;
  const skill = parseSkillDocument(fs.readFileSync(filename, "utf8"), relativeSource);
  skillCache.set(filename, { mtimeMs: stat.mtimeMs, skill });
  return skill;
}

function resolveCanvasAgentSkillContext(payload, catalog) {
  const manualId = payload.skill_mode === "manual" ? String(payload.skill_id || "") : "";
  const activeId = manualId || String(payload.active_skill_id || "");
  const activeSkill = activeId ? catalog.business.find((skill) => skill.id === activeId) : null;
  if (activeId && !activeSkill) throw new Error(`Unknown Canvas Agent skill: ${activeId}.`);
  const capabilityIds = activeSkill
    ? catalog.core.canvas.capabilities.filter((id) => activeSkill.canvas.capabilities.includes(id))
    : catalog.core.canvas.capabilities;
  if (!activeSkill) capabilityIds.push("skill.activate");
  return {
    mode: manualId ? "manual" : activeSkill ? "activated" : "auto",
    activeSkill,
    capabilityIds: Array.from(new Set(capabilityIds)),
    instructions: buildCoreInstructions(catalog.core, activeSkill, catalog.business),
  };
}
```

自动路由摘要仅包含每项 `id/label/description/triggers/capabilities`，不得拼接 `skill.instructions`。Responses 和 Chat Completions 两条请求构造必须调用同一个 `resolveCanvasAgentSkillContext` 和 `getToolDefinitions`。

- [ ] **Step 5: 运行路由与运行时检查**

Run: `node tools/check-canvas-agent-skill-routing.js && node tools/check-canvas-agent-runtime.js`

Expected: 两个脚本均通过，自动请求中没有完整业务 Skill 正文，激活后只有一个业务 Skill。

- [ ] **Step 6: 提交**

```bash
git add skills canvas-agent-runtime.js tools/check-canvas-agent-skill-routing.js tools/check-canvas-agent-runtime.js
git commit -m "feat: load canvas agent skills on demand"
```

### Task 3: 建立当前画布作用域 Broker

**Files:**
- Create: `canvas-agent-broker.js`
- Create: `tools/check-canvas-agent-broker.js`
- Modify: `index.html`
- Modify: `build-portable.bat`

**Interfaces:**
- Consumes: `CanvasAgentCapabilities.getCapability(id)`；适配器对象 `{ [toolName]: async (args, context) => result }`。
- Produces: `createBroker(options)`，实例方法 `beginRun`、`invalidate`、`classifyCalls`、`execute`、`isActive`。

- [ ] **Step 1: 写失败测试**

```js
const broker = createBroker({ getCurrentBoardId: () => activeBoardId, adapters, nextFrame: async () => {} });
const scope = broker.beginRun({ boardId: "A", runId: "run-1" });
assert.equal(broker.isActive(scope), true);
assert.equal((await broker.execute(scope, call("create_text_node"))).ok, true);
activeBoardId = "B";
assert.equal((await broker.execute(scope, call("create_text_node"))).code, "scope_expired");
assert.equal(writes.length, 1);
assert.equal((await broker.execute(scope, call("delete_nodes", { node_ids: ["1"] }))).code, "scope_expired");
assert.deepEqual(broker.classifyCalls([call("run_canvas_node"), call("delete_nodes")]).map((item) => item.risk), ["paid", "destructive"]);
```

- [ ] **Step 2: 运行并确认失败**

Run: `node tools/check-canvas-agent-broker.js`

Expected: FAIL，提示找不到 `canvas-agent-broker.js`。

- [ ] **Step 3: 实现作用域、幂等和批次让帧**

```js
function beginRun({ boardId, runId, abortSignal }) {
  version += 1;
  activeScope = Object.freeze({ boardId: String(boardId), runId: String(runId), scopeVersion: version, abortSignal });
  completed.clear();
  return activeScope;
}

function assertActive(scope) {
  if (!scope || scope !== activeScope || scope.abortSignal?.aborted || getCurrentBoardId() !== scope.boardId) {
    const error = new Error("当前画布已改变，旧任务已安全停止。");
    error.code = "scope_expired";
    throw error;
  }
}

async function execute(scope, call) {
  try {
    assertActive(scope);
    const key = `${scope.runId}:${String(call.call_id || "")}`;
    if (completed.has(key)) return completed.get(key);
    const capability = getCapabilityByToolName(call.name);
    validateCall(capability, call.arguments || {});
    const result = await adapters[call.name](call.arguments || {}, { scope, assertActive, yieldEvery: 40 });
    assertActive(scope);
    const output = { ok: true, tool: call.name, ...result };
    completed.set(key, output);
    return output;
  } catch (error) {
    return { ok: false, tool: call.name, code: error.code || "tool_failed", error: userFacingMessage(error) };
  }
}
```

`invalidate()` 必须递增版本、清除确认和 active scope；`execute()` 在适配器前后都检查，适配器可以在每次写入前调用 `context.assertActive(context.scope)`。

- [ ] **Step 4: 加载浏览器模块并验证**

在 `index.html` 中按 `canvas-agent-capabilities.js`、`canvas-agent-core.js`、`canvas-agent-broker.js`、`script.js`、`canvas-agent-tool-adapters.js`、`canvas-agent-ui.js` 的顺序加载；便携版脚本包含三个新文件。

Run: `node tools/check-canvas-agent-broker.js && node --check canvas-agent-broker.js`

Expected: 全部通过。

- [ ] **Step 5: 提交**

```bash
git add canvas-agent-broker.js tools/check-canvas-agent-broker.js index.html build-portable.bat
git commit -m "feat: isolate agent work to the active canvas"
```

### Task 4: 提供画布内容窄接口和异步提交守卫

**Files:**
- Modify: `script.js`
- Create: `tools/check-canvas-agent-full-capability.js`

**Interfaces:**
- Produces: `window.CanvasAgentCanvasApi`，方法 `getBoardId/getNode/getNodes/createNode/updateNode/duplicateNodes/moveNodes/arrangeNodes/connect/disconnect/setReferenceOrder/group/ungroup/updateGallery/updateGrid/extractGrid/runNode/deleteNodes/scheduleCheckpoint`。
- Consumes: 每个方法的 `context.assertActive(context.scope)`；`runNode` 把 `guard` 传入长时生成函数。

- [ ] **Step 1: 写失败检查**

```js
const source = fs.readFileSync(path.join(ROOT, "script.js"), "utf8");
assert.match(source, /const CanvasAgentCanvasApi\s*=\s*Object\.freeze/);
[
  "createNode", "updateNode", "duplicateNodes", "moveNodes", "arrangeNodes", "connect", "disconnect",
  "setReferenceOrder", "group", "ungroup", "updateGallery", "updateGrid", "extractGrid", "runNode", "deleteNodes",
].forEach((name) => assert.match(source, new RegExp(`${name}:`)));
assert.match(source, /function createCanvasOperationGuard/);
assert.match(source, /guard\?\.assertActive\(\)/);
assert.match(source, /runCanvasImageEdit\(node,\s*\{\s*guard/);
assert.match(source, /runCanvasMinimaxH3Node\(node,\s*\{\s*guard/);
```

- [ ] **Step 2: 运行并确认失败**

Run: `node tools/check-canvas-agent-full-capability.js`

Expected: FAIL，当前没有统一 `CanvasAgentCanvasApi` 和异步守卫。

- [ ] **Step 3: 暴露受限画布 API**

```js
const CanvasAgentCanvasApi = Object.freeze({
  getBoardId: () => String(canvasState.activeBoardId || ""),
  getNode: (id) => findAgentOwnedCanvasNode(id),
  getNodes: (ids) => ids.map(findAgentOwnedCanvasNode),
  createNode: createAgentCanvasNode,
  updateNode: updateAgentCanvasNodeFields,
  duplicateNodes: duplicateAgentCanvasNodes,
  moveNodes: moveAgentCanvasNodes,
  arrangeNodes: arrangeAgentCanvasNodes,
  connect: connectCanvasNodes,
  disconnect: disconnectCanvasNodes,
  setReferenceOrder: setAgentCanvasReferenceOrder,
  group: groupAgentCanvasNodes,
  ungroup: ungroupAgentCanvasNodes,
  updateGallery: updateAgentCanvasGallery,
  updateGrid: updateAgentCanvasGrid,
  extractGrid: extractAgentCanvasGrid,
  runNode: runAgentCanvasNode,
  deleteNodes: deleteAgentCanvasNodes,
  scheduleCheckpoint: () => { scheduleCanvasConnectionRender(); scheduleCanvasSave(); },
});
window.CanvasAgentCanvasApi = CanvasAgentCanvasApi;
```

所有入口第一行执行 `context.assertActive(context.scope)`，所有节点通过 `#canvasPlane .canvas-node` 和 `dataset.boardId === context.scope.boardId` 校验。新建/恢复节点时写入运行时 `dataset.boardId`，但该字段不进入持久化节点 JSON。

- [ ] **Step 4: 为长时生成添加可选守卫**

`runCanvasImageEdit`、`runCanvasLlmNode`、`runCanvasComfyNode`、`runCanvasMinimaxH3Node` 接收 `{ guard = null } = {}`。网络请求前和每次写入状态、结果图片、视频、图集、连接、保存之前调用：

```js
guard?.assertActive();
```

普通按钮调用不传守卫，行为保持不变；Agent 的 `runNode` 传入基于当前作用域的守卫。作用域失效时只停止后续提交，不删除旧画布已经完成的结果。

- [ ] **Step 5: 运行语法与能力检查**

Run: `node --check script.js && node tools/check-canvas-agent-full-capability.js`

Expected: 均通过。

- [ ] **Step 6: 提交**

```bash
git add script.js tools/check-canvas-agent-full-capability.js
git commit -m "feat: expose guarded current-canvas operations"
```

### Task 5: 实现能力适配器并替换 UI 工具 switch

**Files:**
- Create: `canvas-agent-tool-adapters.js`
- Modify: `canvas-agent-ui.js`
- Modify: `tools/check-canvas-agent-ui.js`

**Interfaces:**
- Consumes: `window.CanvasAgentCanvasApi`、`CanvasAgentCapabilities`、`CanvasAgentBroker.createBroker`。
- Produces: `CanvasAgentToolAdapters.create({ canvasApi })` 和 UI 的 `state.broker/state.scope/state.activeSkillId`。

- [ ] **Step 1: 更新失败测试**

```js
assert.doesNotMatch(ui, /switch\s*\(name\)/);
assert.match(ui, /CanvasAgentBroker\.createBroker/);
assert.match(ui, /state\.broker\.execute\(state\.scope,\s*call\)/);
assert.match(ui, /active_skill_id:\s*state\.currentRun\.activeSkillId/);
assert.match(ui, /case\s+["']activate_canvas_skill/);
assert.match(adapters, /create_llm_node/);
assert.match(adapters, /create_comfy_node/);
assert.match(adapters, /disconnect_nodes/);
assert.match(adapters, /duplicate_nodes/);
assert.match(adapters, /group_nodes/);
assert.match(adapters, /update_grid_editor/);
assert.match(adapters, /delete_nodes/);
```

- [ ] **Step 2: 运行并确认失败**

Run: `node tools/check-canvas-agent-ui.js`

Expected: FAIL，UI 仍通过 `switch` 执行 8 个工具。

- [ ] **Step 3: 实现薄适配器**

```js
function create({ canvasApi }) {
  return Object.freeze({
    create_text_node: (args, context) => canvasApi.createNode("text", args, context),
    create_image_node: (args, context) => canvasApi.createNode("image", args, context),
    create_llm_node: (args, context) => canvasApi.createNode("llm", args, context),
    create_comfy_node: (args, context) => canvasApi.createNode("comfy", args, context),
    create_video_node: (args, context) => canvasApi.createNode("minimax-h3", args, context),
    create_media_node: (args, context) => canvasApi.createNode(args.media_type, args, context),
    create_gallery_node: (args, context) => canvasApi.createNode("gallery", args, context),
    create_loop_node: (args, context) => canvasApi.createNode("loop", args, context),
    create_grid_editor_node: (args, context) => canvasApi.createNode("grid-editor", args, context),
    update_node: (args, context) => canvasApi.updateNode(args.node_id, args.changes, context),
    update_nodes: (args, context) => canvasApi.updateNode(args.node_ids, args.changes, context),
    duplicate_nodes: (args, context) => canvasApi.duplicateNodes(args, context),
    move_nodes: (args, context) => canvasApi.moveNodes(args, context),
    arrange_nodes: (args, context) => canvasApi.arrangeNodes(args, context),
    connect_nodes: (args, context) => canvasApi.connect(args, context),
    disconnect_nodes: (args, context) => canvasApi.disconnect(args, context),
    set_reference_order: (args, context) => canvasApi.setReferenceOrder(args, context),
    group_nodes: (args, context) => canvasApi.group(args, context),
    ungroup_nodes: (args, context) => canvasApi.ungroup(args, context),
    update_gallery: (args, context) => canvasApi.updateGallery(args, context),
    update_grid_editor: (args, context) => canvasApi.updateGrid(args, context),
    extract_grid_to_gallery: (args, context) => canvasApi.extractGrid(args, context),
    run_canvas_node: (args, context) => canvasApi.runNode(args.node_id, context),
    delete_nodes: (args, context) => canvasApi.deleteNodes(args.node_ids, context),
    activate_canvas_skill: async (args) => ({ activated_skill_id: String(args.skill_id || "") }),
  });
}
```

- [ ] **Step 4: UI 接入 Broker 和 Skill 激活**

任务创建时调用：

```js
state.scope = state.broker.beginRun({
  boardId: state.currentRun.boardId,
  runId: state.currentRun.id,
  abortSignal: state.abortController.signal,
});
```

工具循环改为 `output = await state.broker.execute(state.scope, call)`。收到成功的 `activate_canvas_skill` 后验证 ID 存在于 `state.skills`，写入 `state.currentRun.activeSkillId`，下一轮请求携带 `active_skill_id`。手动选择 Skill 仍写 `skill_id`；任务结束清空激活状态。`canvas:board-changed`、停止和新任务都调用 `broker.invalidate()`。

- [ ] **Step 5: 运行 UI、语法和适配器检查**

Run: `node --check canvas-agent-tool-adapters.js && node --check canvas-agent-ui.js && node tools/check-canvas-agent-ui.js`

Expected: 全部通过；UI 不再包含工具 `switch`。

- [ ] **Step 6: 提交**

```bash
git add canvas-agent-tool-adapters.js canvas-agent-ui.js tools/check-canvas-agent-ui.js
git commit -m "feat: execute canvas agent capabilities through broker"
```

### Task 6: 合并危险操作确认并完善画布级恢复

**Files:**
- Modify: `canvas-agent-core.js`
- Modify: `canvas-agent-conversation.js`
- Modify: `canvas-agent-ui.js`
- Modify: `canvas-agent.css`
- Modify: `tools/check-canvas-agent-core.js`
- Modify: `tools/check-canvas-agent-conversation.js`
- Modify: `tools/check-canvas-agent-ui.js`

**Interfaces:**
- Consumes: `CanvasAgentCapabilities.getRisk(name,args)`、Broker 的 `classifyCalls`。
- Produces: `buildApprovalPlan(calls)` 返回 `{ requiresApproval, calls, counts, summary }`；确认记录仅绑定 `{boardId,runId,callIds}`。

- [ ] **Step 1: 写失败测试**

```js
const plan = core.buildApprovalPlan([
  { call_id: "a", name: "create_text_node", arguments: {} },
  { call_id: "b", name: "run_canvas_node", arguments: { node_id: "1" } },
  { call_id: "c", name: "delete_nodes", arguments: { node_ids: ["2", "3"] } },
]);
assert.equal(plan.requiresApproval, true);
assert.deepEqual(plan.counts, { paid: 1, destructive: 2, "bulk-overwrite": 0 });
assert.deepEqual(plan.calls.map((call) => call.call_id), ["b", "c"]);
```

- [ ] **Step 2: 运行并确认失败**

Run: `node tools/check-canvas-agent-core.js && node tools/check-canvas-agent-ui.js`

Expected: FAIL，现有确认只识别 `run_canvas_node`。

- [ ] **Step 3: 实现合并确认计划和批准作用域**

UI 收到工具数组后先执行安全调用，把风险调用一次性放入 `state.pendingApproval`：

```js
state.pendingApproval = {
  boardId: state.scope.boardId,
  runId,
  callIds: plan.calls.map((call) => call.call_id),
  calls: plan.calls,
  responseId,
};
```

确认卡显示“将执行 N 次付费生成 / 删除 N 个节点 / 覆盖 N 个现有目标”。确认按钮再次校验 board/run/callIds；画布切换、停止、任务结束立即清空。拒绝时为每个风险调用返回 `{ok:false,code:"user_declined"}` 给模型，使任务能用中文收尾而不是报错。

- [ ] **Step 4: 把工具步骤和恢复记录写入当前画布对话**

持久化 tool item 时增加 `risk/status`，但不存原始调用 ID；作用域失效记录“已切换画布，旧任务已安全停止”，并保存到旧 `boardId` 的对话，不写入新画布对话。技术错误统一映射为简短中文。

- [ ] **Step 5: 运行确认与对话检查**

Run: `node tools/check-canvas-agent-core.js && node tools/check-canvas-agent-conversation.js && node tools/check-canvas-agent-ui.js`

Expected: 全部通过。

- [ ] **Step 6: 提交**

```bash
git add canvas-agent-core.js canvas-agent-conversation.js canvas-agent-ui.js canvas-agent.css tools/check-canvas-agent-core.js tools/check-canvas-agent-conversation.js tools/check-canvas-agent-ui.js
git commit -m "feat: confirm risky canvas agent operations"
```

### Task 7: 服务端传递激活状态并保持无状态故障转移

**Files:**
- Modify: `server.js`
- Modify: `canvas-agent-runtime.js`
- Modify: `canvas-agent-router.js`
- Modify: `tools/check-canvas-agent-server.js`
- Modify: `tools/check-canvas-agent-endpoint.js`
- Modify: `tools/check-canvas-agent-failover-endpoint.js`

**Interfaces:**
- Consumes: payload `active_skill_id` 和 runtime 的 catalog/context resolver。
- Produces: session checkpoint 保存 `boardId/activeSkillId/transcript`，换模型时重建相同 Skill/工具上下文。

- [ ] **Step 1: 写失败断言**

```js
assert.match(server, /activeSkillId:\s*String\(payload\.active_skill_id/);
assert.match(server, /active_skill_id:\s*session\.activeSkillId/);
assert.match(server, /loadCanvasSkills\(CANVAS_SKILLS_DIR\)/);
assert.match(runtime, /resolveCanvasAgentSkillContext/);
```

端点测试发送 `activate_canvas_skill` 的 tool output 后故意让首线路失败，断言第二线路收到相同 `active_skill_id`、核心 Skill 和唯一业务 Skill，且没有 `previous_response_id` 依赖。

- [ ] **Step 2: 运行并确认失败**

Run: `node tools/check-canvas-agent-server.js && node tools/check-canvas-agent-failover-endpoint.js`

Expected: FAIL，session 尚未保存激活 Skill。

- [ ] **Step 3: 保存并校验激活状态**

```js
session.activeSkillId = String(payload.active_skill_id || session.activeSkillId || "");
const effectivePayload = {
  ...payload,
  board_id: session.boardId,
  active_skill_id: session.activeSkillId,
};
```

服务端每轮只允许从空值变为一个有效业务 Skill；客户端不能在同一 run 中切换到第二个业务 Skill。`board_id` 不一致直接返回任务错误，不调用上游。故障转移仍使用无状态 transcript + tool outputs 重放，避免 `No tool call found`。

- [ ] **Step 4: 运行服务端和故障转移检查**

Run: `node tools/check-canvas-agent-server.js && node tools/check-canvas-agent-endpoint.js && node tools/check-canvas-agent-failover-endpoint.js`

Expected: 全部通过。

- [ ] **Step 5: 提交**

```bash
git add server.js canvas-agent-runtime.js canvas-agent-router.js tools/check-canvas-agent-server.js tools/check-canvas-agent-endpoint.js tools/check-canvas-agent-failover-endpoint.js
git commit -m "feat: preserve activated agent skill across failover"
```

### Task 8: 性能、完整回归与浏览器验收

**Files:**
- Modify: `tools/check-canvas-agent-performance.js`
- Modify: `package.json`
- Modify: `index.html`
- Test: `tools/check-canvas-agent-browser.js`

**Interfaces:**
- Consumes: 所有前置任务。
- Produces: 完整静态检查、端点检查和真实浏览器验收证据。

- [ ] **Step 1: 增加性能失败断言**

```js
assert.doesNotMatch(broker, /setInterval|MutationObserver/);
assert.doesNotMatch(adapters, /setInterval|MutationObserver/);
assert.match(broker, /requestAnimationFrame/);
assert.match(broker, /MAX_BATCH_TARGETS\s*=\s*40/);
assert.match(runtime, /mtimeMs/);
assert.doesNotMatch(runtime, /fs\.watch|watchFile/);
assert.match(ui, /invalidate\(\)/);
```

- [ ] **Step 2: 运行专项检查**

Run: `node tools/check-canvas-agent-performance.js`

Expected: PASS；新增模块没有常驻主线程负担。

- [ ] **Step 3: 更新资源版本与总检查**

把新增脚本加入 `index.html`，把资源查询版本更新为 `20260820-agent-capabilities`。在 `package.json` 的 `check` 中加入三个新模块的 `node --check` 和四个新检查脚本。

Run: `npm run check`

Expected: exit code 0，所有既有与新增检查输出 `passed`。

- [ ] **Step 4: 启动隔离端口并跑浏览器流程**

Run: `$env:PORT=3194; node server.js`

另一个终端运行：`$env:CANVAS_AGENT_BROWSER_URL='http://127.0.0.1:3194'; node tools/check-canvas-agent-browser.js`

Expected: 覆盖并通过以下流程：

- Agent 面板默认关闭，打开后无模型名。
- 普通问候不选择 Skill、不调用画布工具。
- 海报请求自动激活且只激活 `poster-design`。
- 先头脑风暴，再说“按刚才方案直接执行”，安全节点直接创建。
- 选中节点后可更新、移动、连接、断开、复制、分组、解散、宫格提取和图集调整。
- 付费、删除和批量覆盖在确认前不执行，确认后只执行卡片列出的调用。
- 在画布 A 发起延迟执行后切换到 B，旧结果不修改 B；返回 A 可看到原对话和中断记录。
- Agent 等待时仍可拖拽、平移、缩放和选择，等待条动画存在且无 `loading` 文案。

- [ ] **Step 5: 停止隔离服务并最终检查差异**

Run: `git diff --check`

Expected: 没有空白错误；仅出现本功能相关文件和用户原有未提交改动。

- [ ] **Step 6: 提交**

```bash
git add package.json index.html tools/check-canvas-agent-performance.js tools/check-canvas-agent-browser.js
git commit -m "test: verify full canvas agent capability flow"
```
