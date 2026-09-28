# Canvas Tool Agent 与 Skills 设计

## 目标

在无限画布右侧增加常驻、可折叠的工具型 Agent。Agent 能读取当前画布和选中节点，选择一个内置 Skill，调用受控画布工具完成多步骤任务，并把过程、确认点、结果与错误显示在面板中。

首版默认 Agent 模型为 `gpt-5.6-terra`，通过 OpenAI Responses API 执行工具循环。图片与视频仍由画布已有的图片模型、ComfyUI、RunningHub 和 MiniMax H3 能力生成；LLM 只负责理解、规划、调用工具和验收。

## 首版范围

- 右侧 Agent 面板：技能选择、会话消息、执行步骤、错误、停止、付费操作确认和输入框。
- 五个内置 Skill：电商套图、海报设计、产品精修、社媒多尺寸、图片转视频。
- Agent Skills 兼容目录：每个 Skill 使用独立目录和 `SKILL.md`。
- 浏览器画布工具：创建文字、图片生成、图集和视频节点；更新节点；连接节点；排列节点；执行节点。
- 服务端 Responses API 代理：加载 Skill、限制可用工具、规范化工具调用和错误。
- 单次运行最多 12 个模型回合；执行生图、ComfyUI 或视频节点前必须获得一次用户确认。
- 本地保存最近运行摘要；页面重载时将未完成运行标为已中断，不自动继续付费操作。

首版不包含远程 Skill 商店、第三方 Skill 自动安装、跨设备会话同步、后台任务队列或多 Agent。

## 架构

### Skill 注册表

`skills/<skill-id>/SKILL.md` 使用 YAML frontmatter 描述名称、简介与画布扩展字段，正文描述完整工作流、输入约束、停止条件和质量检查。服务端只加载项目内置目录，并只向模型暴露该 Skill 声明的工具。

画布扩展示例：

```yaml
---
name: ecommerce-image-set
description: 根据选中的产品图创建电商主图、卖点图和场景图
canvas:
  category: ecommerce
  icon: shopping-cart
  required_selection: image
  approval: before-paid-generation
  tools:
    - create_image_node
    - create_gallery_node
    - connect_nodes
    - arrange_nodes
    - run_canvas_node
---
```

### 服务端 Agent 网关

新增两个接口：

- `GET /api/canvas-agent/skills` 返回可用 Skill 的安全元数据和默认模型。
- `POST /api/canvas-agent/turn` 接收新请求或上一回合的工具结果，调用 Responses API，返回文字消息与标准化工具调用。

服务端不执行浏览器 DOM 工具。它验证 Skill、步骤数和工具白名单，并把画布上下文与 Skill 正文组合成指令。API Key 只保存在服务端。

### 浏览器执行器

浏览器读取当前画布快照和选中节点，最多附带三张压缩后的选中图片。收到工具调用后，通过已有画布函数创建、连接、修改和执行节点。每个结果使用结构化对象返回给下一模型回合。

节点创建工具返回稳定的节点 ID。后续工具只能引用当前画布中存在的节点。未知工具、未知节点、非法参数和超过步骤上限都会终止运行并显示明确错误。

### UI

Agent 面板固定在画布右侧，桌面宽度为约 400px；打开时画布可视区缩小而不是被遮挡。窄屏上面板覆盖画布。技能入口使用紧凑卡片，运行后切换为消息与步骤流，底部输入框保持可用。

## 模型与配置

- `CANVAS_AGENT_MODEL` 默认 `gpt-5.6-terra`。
- `CANVAS_AGENT_REASONING_EFFORT` 默认 `medium`。
- `CANVAS_AGENT_API_URL` 默认从 `AI_API_URL` 推导 `/v1/responses`。
- `CANVAS_AGENT_API_KEY` 默认回退到 `AI_API_KEY`。

若所配置的中转服务不支持 Responses API，界面显示上游错误，不静默降级为不兼容的 Chat Completions 工具协议。

## 安全与错误处理

- Skill 只能调用 frontmatter 白名单中的已注册工具。
- 付费节点执行需要用户确认；同一运行确认一次，后续执行仍受 12 回合上限约束。
- 服务端拒绝超大上下文、未知 Skill、非法工具结果与空请求。
- 图片只从当前选中画布节点读取，并在浏览器压缩后提交。
- 工具失败以结构化失败结果返回模型；不可恢复错误终止运行，避免重复付费。
- 停止按钮阻止后续回合和工具调用，但不强行取消已经提交给外部生成平台的任务。

## 测试与验收

- 纯函数测试覆盖 Skill 解析、工具白名单、Responses 请求构造、响应提取、步骤上限、付费确认判定和画布摘要裁剪。
- 静态集成测试覆盖接口路由、脚本和样式引入、默认模型配置及面板关键选择器。
- 完整运行现有 `npm run check`，确保原有画布、图片、视频和设置检查不回退。
- 浏览器验收覆盖：打开面板、选择 Skill、发送请求、看到工具步骤、付费确认、创建节点、停止运行和错误提示。

