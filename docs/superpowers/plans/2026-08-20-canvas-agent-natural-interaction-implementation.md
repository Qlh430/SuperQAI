# 画布 Agent 自然交互改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将右侧 Agent 改为无需 Skill 即可使用、能实时引用画布素材并在需要时采用专业 Skill 的自然交互模式。

**Architecture:** 浏览器通过画布选择事件维护实时上下文，纯规则层规范化不同节点输出；服务端支持 `auto` 与 `manual` 两种 Skill 模式，自动模式一次请求内完成意图判断和工具调用。付费确认继续由浏览器执行器控制。

**Tech Stack:** Node.js 18、原生 HTTP 服务、原生浏览器 JavaScript/CSS、OpenAI Responses API、Node `assert` 静态与纯函数测试。

## Global Constraints

- 不增加第三方运行时依赖。
- 保留当前工作区全部未提交改动，只定向修改 Agent 和画布选区相关代码。
- 默认模式为 `auto`，`skill_id` 可以为空。
- 手动 Skill 继续严格使用自身工具白名单。
- 单次 Agent 运行最多 12 个模型回合。
- `run_canvas_node` 首次执行前必须获得用户确认。
- 上下文最多 15 项，视觉图片最多编码 3 张。

---

### Task 1: 自动模式与引用规范化规则

**Files:**
- Modify: `canvas-agent-core.js`
- Modify: `canvas-agent-runtime.js`
- Modify: `tools/check-canvas-agent-core.js`
- Modify: `tools/check-canvas-agent-runtime.js`

**Interfaces:**
- Produces: `CanvasAgentCore.normalizeAgentReferences(candidates, limit)`。
- Produces: `CanvasAgentRuntime.buildResponsesRequest()` 对 `skill_mode: "auto"` 和空 `skill_id` 的支持。
- Consumes: 现有 `TOOL_DEFINITIONS`、Skill 注册表和 Responses API 请求格式。

- [ ] **Step 1: 写引用规范化失败测试**

在 `tools/check-canvas-agent-core.js` 增加图片、宫格、分组、视频和重复引用样例，并断言：

```js
const references = core.normalizeAgentReferences([
  { nodeId: "image-1", kind: "image", output: { type: "image", name: "产品图", url: "/product.png" } },
  { nodeId: "grid-1", kind: "grid-editor", output: { type: "grid-editor", name: "宫格", url: "/grid.png" } },
  { nodeId: "group-1", kind: "group", output: { type: "group", name: "组合", images: [{ name: "A", url: "/a.png" }, { name: "B", url: "/b.png" }] } },
]);
assert.deepEqual(references.map((item) => item.key), ["image-1", "grid-1", "group-1:0", "group-1:1"]);
assert.equal(references[1].type, "image");
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node tools/check-canvas-agent-core.js`

Expected: FAIL with `normalizeAgentReferences is not a function`。

- [ ] **Step 3: 实现最小引用规范化函数**

实现递归但有界的输出展开，只保留 `key`、`nodeId`、`type`、`name`、`url`、`originalUrl` 和 `text`，按 key 去重并裁剪到指定上限。

- [ ] **Step 4: 写自动模式失败测试**

在 `tools/check-canvas-agent-runtime.js` 构造两个 Skill，使用：

```js
const automatic = runtime.buildResponsesRequest({
  skill_mode: "auto",
  skill_id: "",
  prompt: "你好",
  canvas: { nodes: [], selected_node_ids: [] },
  step: 0,
}, { model: "gpt-5.6-terra", reasoningEffort: "medium", skills: [skill, posterSkill] });
assert.deepEqual(automatic.tools.map((tool) => tool.name), [...new Set([...skill.canvas.tools, ...posterSkill.canvas.tools])]);
assert.match(automatic.instructions, /普通问候直接回答/);
```

- [ ] **Step 5: 运行测试并确认当前抛出 Unknown Skill**

Run: `node tools/check-canvas-agent-runtime.js`

Expected: FAIL with `Unknown Canvas Agent skill: (empty)`。

- [ ] **Step 6: 实现自动与手动两种请求构造**

新增 `resolveAgentMode(payload, skills)` 和 `buildAutomaticAgentInstructions(skills)`；自动模式暴露工具并集并包含 Skill 目录及正文，手动模式保持现有 `buildAgentInstructions(skill)`。

- [ ] **Step 7: 运行规则测试**

Run: `node tools/check-canvas-agent-core.js && node tools/check-canvas-agent-runtime.js`

Expected: 两个脚本输出 passed。

### Task 2: 画布选择事件与可引用输出

**Files:**
- Modify: `script.js`
- Modify: `tools/check-canvas-agent-ui.js`

**Interfaces:**
- Produces: `window` 事件 `canvas:selectionchange`，detail 为 `{ selectedIds: string[] }`。
- Produces: 宫格节点 `getCanvasNodeOutput()` 返回带 `url` 和 `originalUrl` 的视觉输出。
- Consumes: 现有 `getSelectedCanvasNodes()` 和 `getCanvasGridEditorState()`。

- [ ] **Step 1: 写静态失败测试**

在 `tools/check-canvas-agent-ui.js` 读取 `script.js` 并断言存在：

```js
assert.match(mainScript, /new CustomEvent\("canvas:selectionchange"/);
assert.match(mainScript, /selectedIds:\s*getSelectedCanvasNodes\(\)\.map/);
assert.match(mainScript, /type:\s*"grid-editor"[\s\S]*url:\s*state\.sourceSrc/);
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node tools/check-canvas-agent-ui.js`

Expected: FAIL with missing selection event。

- [ ] **Step 3: 实现统一选区事件派发**

新增 `dispatchCanvasSelectionChange()`，在单选、清空、增选、切换以及框选完成后调用；使用 `queueMicrotask` 合并同一操作产生的重复事件。

- [ ] **Step 4: 将宫格源图作为视觉引用输出**

当 `state.sourceSrc` 存在时返回：

```js
return {
  type: "grid-editor",
  name: "宫格编辑节点",
  url: state.sourceSrc,
  originalUrl: state.sourceSrc,
};
```

- [ ] **Step 5: 运行静态检查与语法检查**

Run: `node tools/check-canvas-agent-ui.js && node --check script.js`

Expected: checks passed and syntax exit 0。

### Task 3: 自由 Agent、Skill 书与实时上下文 UI

**Files:**
- Modify: `canvas-agent-ui.js`
- Modify: `canvas-agent.css`
- Modify: `tools/check-canvas-agent-ui.js`

**Interfaces:**
- Consumes: `CanvasAgentCore.normalizeAgentReferences()`、`canvas:selectionchange` 和现有画布全局函数。
- Produces: `#canvasAgentContext`、`#canvasAgentSkillBook`、`#canvasAgentSkillPopover`、`#canvasAgentMentionPopover`、`#canvasAgentAttach`。
- Produces: 初次请求字段 `skill_mode` 和可空 `skill_id`。

- [ ] **Step 1: 写 UI 结构和行为失败测试**

断言新增 ID、默认状态不选择第一个 Skill、提交逻辑不含 `请先选择一个 Skill` 与 `这个 Skill 需要先`，并包含：

```js
assert.match(ui, /skill_mode:\s*skill\s*\?\s*"manual"\s*:\s*"auto"/);
assert.match(ui, /addEventListener\("canvas:selectionchange"/);
assert.match(ui, /normalizeAgentReferences/);
assert.match(ui, /data-agent-context-key/);
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `node tools/check-canvas-agent-ui.js`

Expected: FAIL with missing context/skill book controls。

- [ ] **Step 3: 重构面板结构**

移除常驻 Skill 区，将 Skill 列表放入 composer 上方的隐藏 popover；欢迎语改为“直接描述目标，也可以选中画布素材或使用 Skill”。输入区增加 context tray、附件按钮、技能书按钮和“自动”状态标签。

- [ ] **Step 4: 实现实时上下文状态**

状态加入：

```js
selectedNodeIds: new Set(),
mentionedNodeIds: new Set(),
excludedNodeIds: new Set(),
```

`renderCanvasAgentContext()` 读取真实节点、调用 `normalizeAgentReferences()` 并渲染缩略图/类型标签；选择事件只更新选区集合，删除标签写入排除集合。

- [ ] **Step 5: 取消 Skill 前置校验并发送自动模式**

`startCanvasAgentRun()` 只校验 prompt。请求使用当前 Skill 决定 `skill_mode`；手动 Skill 可清除，Skill 缺素材交给模型处理。

- [ ] **Step 6: 实现 `@` 节点选择器**

监听 textarea 的 `input` 和光标位置，识别 `/@([^\s@]{0,30})$/`；用节点名称和类型过滤最多 8 项，点击后把节点 ID 加入 `mentionedNodeIds`，替换当前 token 并重新渲染上下文。

- [ ] **Step 7: 实现附件、拖放和粘贴**

附件按钮触发 `multiple accept="image/*"` 输入；三种入口统一调用 `attachCanvasAgentFiles(files)`，依次使用 `window.uploadCanvasImageFile(file)` 与 `window.addCanvasImage(url, file.name, point)`，创建后加入显式引用并选中最后一个节点。

- [ ] **Step 8: 完成 light/dark、窄屏和弹层样式**

Skill popover 与 mention popover 固定在 composer 上方且不扩大面板；context tray 横向滚动；拖放时 composer 显示高亮边框；暗色主题保持对比度。

- [ ] **Step 9: 运行 UI 检查**

Run: `node tools/check-canvas-agent-ui.js && node --check canvas-agent-ui.js`

Expected: checks passed and syntax exit 0。

### Task 4: 接口自动模式集成测试

**Files:**
- Modify: `tools/check-canvas-agent-endpoint.js`
- Modify: `tools/check-canvas-agent-server.js`

**Interfaces:**
- Consumes: `/api/canvas-agent/skills` 和 `/api/canvas-agent/turn`。
- Produces: 自动模式与手动模式的端到端请求证据。

- [ ] **Step 1: 增加自动模式端点测试**

首个请求改为：

```js
body: {
  skill_mode: "auto",
  skill_id: "",
  prompt: "你好",
  canvas: { id: "board-1", title: "测试画布", selected_node_ids: [], nodes: [], connections: [] },
  vision_images: [],
  step: 0,
}
```

断言上游请求包含画布工具、instructions 包含自动模式约束，且接口返回 200。另保留手动 `poster-design` 请求断言工具白名单。

- [ ] **Step 2: 运行端点测试并确认失败**

Run: `node tools/check-canvas-agent-endpoint.js`

Expected: 修改 runtime 前失败；完成 Tasks 1-3 后通过。

- [ ] **Step 3: 更新服务端静态断言**

断言 Skills 元数据继续返回五个 Skill，并且服务端没有新增第二次路由调用或额外 API Key。

- [ ] **Step 4: 运行服务端检查**

Run: `node tools/check-canvas-agent-server.js && node tools/check-canvas-agent-endpoint.js && node --check server.js`

Expected: checks passed and syntax exit 0。

### Task 5: 全量回归与浏览器验收

**Files:**
- Verify only: `package.json`
- Verify only: `index.html`
- Verify only: Agent、Skill 与画布相关文件

**Interfaces:**
- Consumes: Tasks 1-4 的全部实现。
- Produces: 可重复的自动化和浏览器验收记录。

- [ ] **Step 1: 运行完整检查**

Run: `npm run check`

Expected: exit 0，全部既有和 Agent 检查通过。

- [ ] **Step 2: 启动或复用本地服务进行浏览器验收**

验收顺序：打开画布 Agent；不选 Skill 发送“你好”；点击图片、图库、宫格和分组节点确认 context tray 即时更新；使用 `@` 添加节点；选择并清除 Skill；上传/拖入/粘贴一张图片；触发生成工具并确认执行前出现审批卡。

- [ ] **Step 3: 检查 410px 面板布局和窄屏覆盖模式**

浏览器测量 `#canvasAgentPanel` 宽度不超过 410px；Skill/mention 弹层 `scrollWidth <= clientWidth`；窄屏下画布宽度保持 100%。

- [ ] **Step 4: 检查定向差异与编码**

Run: `git diff --check` and `git diff -- canvas-agent-core.js canvas-agent-runtime.js canvas-agent-ui.js canvas-agent.css script.js tools/check-canvas-agent-core.js tools/check-canvas-agent-runtime.js tools/check-canvas-agent-ui.js tools/check-canvas-agent-server.js tools/check-canvas-agent-endpoint.js docs/superpowers/specs/2026-08-20-canvas-agent-natural-interaction-design.md docs/superpowers/plans/2026-08-20-canvas-agent-natural-interaction-implementation.md`

Expected: 无空白错误、乱码、敏感 Key 或无关文件重写。
