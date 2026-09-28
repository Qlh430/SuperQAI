# Canvas Tool Agent 与 Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为无限画布增加使用 `gpt-5.6-terra` 的右侧工具型 Agent，并让内置 Skill 通过受控工具完成多步骤画布任务。

**Architecture:** 服务端加载 Agent Skills 兼容的 `SKILL.md`，通过 Responses API 返回标准化工具调用；浏览器侧执行器调用现有画布函数并把结构化结果回传。纯运行规则放在独立 CommonJS/浏览器双用模块，UI 和服务端集成保持轻量。

**Tech Stack:** Node.js 18、原生 HTTP 服务、原生浏览器 JavaScript/CSS、OpenAI Responses API、Node `assert` 测试。

## Global Constraints

- 不增加第三方运行时依赖。
- 保留现有画布和设置中心的未提交改动，只做定向补丁。
- 单次 Agent 运行最多 12 个模型回合。
- 生图、ComfyUI 和视频节点执行前必须获得用户确认。
- 默认 Agent 模型为 `gpt-5.6-terra`，推理强度为 `medium`。
- 不实现远程 Skill 安装、跨设备同步、后台队列或多 Agent。

---

### Task 1: Agent 核心规则与 Skill 解析

**Files:**
- Create: `canvas-agent-core.js`
- Create: `canvas-agent-runtime.js`
- Create: `tools/check-canvas-agent-core.js`
- Create: `tools/check-canvas-agent-runtime.js`

**Interfaces:**
- Produces: `CanvasAgentCore.TOOL_DEFINITIONS`, `summarizeCanvasBoard(board, selectedIds)`, `requiresApproval(toolName)`, `createRunState(input)`, `advanceRunState(run, turn)`。
- Produces: `parseSkillDocument(markdown, source)`, `loadCanvasSkills(directory)`, `buildResponsesRequest(payload, options)`, `extractResponsesTurn(response)`。

- [ ] **Step 1: 写核心规则和 Skill 解析的失败测试**

测试要求：默认 12 回合、付费工具识别、画布摘要只保留允许字段、解析嵌套 `canvas.tools`、未知 Skill 工具被过滤、Responses 初始请求与 continuation 请求格式正确、响应中的文字和函数调用可提取。

- [ ] **Step 2: 运行失败测试**

Run: `node tools/check-canvas-agent-core.js; node tools/check-canvas-agent-runtime.js`

Expected: FAIL，原因是两个模块尚不存在。

- [ ] **Step 3: 实现最小核心模块**

实现 UMD 核心模块和无依赖 Skill/Responses 运行模块，只导出测试和服务端需要的接口。

- [ ] **Step 4: 运行测试直至通过**

Run: `node tools/check-canvas-agent-core.js; node tools/check-canvas-agent-runtime.js`

Expected: 两个检查脚本均输出 passed。

### Task 2: 内置 Skills 与服务端网关

**Files:**
- Create: `skills/ecommerce-image-set/SKILL.md`
- Create: `skills/poster-design/SKILL.md`
- Create: `skills/product-refinement/SKILL.md`
- Create: `skills/social-media-pack/SKILL.md`
- Create: `skills/image-to-video/SKILL.md`
- Modify: `server.js`
- Modify: `.env.example`
- Create: `tools/check-canvas-agent-server.js`

**Interfaces:**
- Consumes: Task 1 runtime loaders and Responses request/response helpers。
- Produces: `GET /api/canvas-agent/skills` and `POST /api/canvas-agent/turn`。

- [ ] **Step 1: 写服务端静态集成失败测试**

测试要求：路由存在、默认模型和环境变量存在、服务端只从 `skills` 目录加载、五个 Skill 都能解析且声明合法工具。

- [ ] **Step 2: 运行测试并确认因路由和 Skill 缺失而失败**

Run: `node tools/check-canvas-agent-server.js`

Expected: FAIL with missing canvas agent route or skill directory。

- [ ] **Step 3: 编写五个 SKILL.md 并接入服务端**

每个 Skill 明确输入前置条件、工具白名单、步骤、质量检查和停止条件。服务端验证步骤范围 `0..12`，从环境变量读取 Agent URL、Key、模型和推理强度，并返回标准化错误。

- [ ] **Step 4: 运行服务端测试直至通过**

Run: `node tools/check-canvas-agent-server.js; node --check server.js`

Expected: checks passed and syntax exit 0。

### Task 3: 浏览器执行器与右侧面板

**Files:**
- Create: `canvas-agent-ui.js`
- Create: `canvas-agent.css`
- Modify: `index.html`
- Create: `tools/check-canvas-agent-ui.js`

**Interfaces:**
- Consumes: `window.CanvasAgentCore`、`window.serializeCanvasBoard()` 和现有全局画布节点函数。
- Produces: `#canvasAgentPanel`、Skill 选择、消息/步骤流、composer、停止和批准按钮；向 `/api/canvas-agent/turn` 发送回合。

- [ ] **Step 1: 写 UI 静态失败测试**

测试要求：核心和 UI 脚本顺序正确、独立样式已加载、面板关键选择器存在、八个工具执行分支存在、付费确认与停止路径存在。

- [ ] **Step 2: 运行测试并确认因 UI 文件缺失而失败**

Run: `node tools/check-canvas-agent-ui.js`

Expected: FAIL with missing canvas-agent-ui.js。

- [ ] **Step 3: 实现 UI 与画布工具适配**

实现创建文字、图片、图集和 MiniMax H3 节点；更新、连接、排列和执行节点。运行前读取当前选择，最多压缩三张参考图。工具结果以 `{ok, tool, ...}` 返回；未知节点和失败状态不得伪装成功。

- [ ] **Step 4: 实现付费确认、停止和本地运行摘要**

第一次 `run_canvas_node` 暂停并展示确认按钮；停止后不再请求下一回合。本地最多保留 20 条运行摘要，重载时将运行中状态转为 interrupted。

- [ ] **Step 5: 运行 UI 测试直至通过**

Run: `node tools/check-canvas-agent-ui.js; node --check canvas-agent-ui.js`

Expected: checks passed and syntax exit 0。

### Task 4: 项目检查与浏览器验收

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes: Tasks 1-3 的全部检查脚本。
- Produces: `npm run check` 中的 Agent 回归检查。

- [ ] **Step 1: 将 Agent 检查加入 `npm run check`**

在现有语法和功能检查末尾增加 core、runtime、server 和 UI 检查，不删除原有命令。

- [ ] **Step 2: 运行完整检查**

Run: `npm run check`

Expected: exit 0，所有既有和 Agent 检查均通过。

- [ ] **Step 3: 启动本地服务并执行浏览器验收**

Run: `npm start`

验收：打开无限画布、打开 Agent、加载五个 Skill、选择电商套图、发送请求；无 Key 时显示可操作配置错误，有有效 Key 时能够出现工具步骤和付费确认并创建节点。

- [ ] **Step 4: 检查定向 diff 和编码**

Run: `git diff --check` and `git diff -- canvas-agent-core.js canvas-agent-runtime.js canvas-agent-ui.js canvas-agent.css server.js index.html package.json .env.example skills tools/check-canvas-agent-*.js`

Expected: 无空白错误；diff 不包含无关重写或敏感 Key。

