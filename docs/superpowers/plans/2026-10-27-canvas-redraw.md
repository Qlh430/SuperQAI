# 画布重绘工具 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在图片节点工具栏增加“重绘”，复用现有遮罩编辑器，调用 Qwen-2.1 移除/局部重绘工作流并生成新的结果图片节点。

**Architecture:** 前端在现有 Flora 图片工具栏注册 `redraw` 动作，打开既有遮罩编辑器并在保存后收集提示词；后端新增独立 `/api/qwen-image21-redraw` 任务路由，上传原图与遮罩，替换工作流节点 193 和 22 后提交 ComfyUI，使用 262 的最终输出。结果沿用现有画布 ComfyUI 结果回传逻辑，创建新图片结果节点。

**Tech Stack:** 原生 JavaScript、Node.js HTTP API、ComfyUI workflow JSON、现有 Neon/Flora 画布桥接与 daily workbench 部署脚本。

## Global Constraints

- 只修改与“重绘”直接相关的前端工具栏、遮罩交互、ComfyUI 任务服务、路由和白名单部署文件。
- 不停止或按端口结束 3199 原后端；后端部署后必须正常退出并重开原 AI OS 才会生效。
- 前端通过 `npm run update:workbench` 部署到固定 33200 stage。
- 所有用户可见文本使用简体中文，并复用现有 Neon/Flora 组件与语义令牌。
- 不把画布数据或任务数据写入 localStorage，不重构整套画布系统。

---

### Task 1: 固定工作流模板与后端任务接线

**Files:**
- Create: `neon-workbench/design-sources/workflows/qwen-image21-redraw.json`
- Modify: `host-sources/app/server-config.js`
- Modify: `host-sources/app/server-components/composition.js`
- Modify: `neon-workbench/design-sources/comfy-workflow-task-service.js`
- Modify: `neon-workbench/design-sources/media-generation-http-api.js`
- Test: `neon-workbench/qwen-image21-redraw-regression.cjs`

**Interfaces:**
- POST `/api/qwen-image21-redraw` consumes `{ image, name, mask_image, mask_name, prompt, comfy_url }` and returns `{ task_id }`.
- GET `/api/upscale/status?id=...` returns the existing task shape with `images` on success.

- [ ] Step 1: 将用户提供的 JSON 复制为仓库工作流模板，并校验 JSON 可解析、节点 193/22/260/262/38 存在。
- [ ] Step 2: 在 server config 和 composition 的 workflowFiles 中加入 `QWEN_IMAGE21_REDRAW_WORKFLOW_FILE`，并让任务服务声明 `qwenImage21Redraw`。
- [ ] Step 3: 在任务服务中实现 `runQwenImage21RedrawTask`：上传原图和遮罩；替换 193.inputs.image、193 的遮罩来源、22.inputs.Text；将 38 的 filename_prefix 改为本次任务前缀；提交模板并只保存节点 262 输出。
- [ ] Step 4: 在 HTTP API 注册 `/api/qwen-image21-redraw`，复用现有任务状态和权限检查；空提示词保留为空交给工作流 260/262 判断，不在服务端改成默认文字。
- [ ] Step 5: 编写回归测试，断言原图/遮罩/提示词注入、空提示词保留为空、输出节点 262、任务失败中文信息和缺少输入时的 400。
- [ ] Step 6: 运行 `node qwen-image21-redraw-regression.cjs`，预期全部通过。

### Task 2: 图片工具栏与遮罩提交界面

**Files:**
- Modify: `neon-workbench/design-sources/flora-node-shell.js`
- Modify: `neon-workbench/design-sources/script-before-save-bridge.js`
- Modify: `neon-workbench/design-sources/neon-canvas-surface.css`
- Test: `neon-workbench/canvas-redraw-regression.cjs`

**Interfaces:**
- `flora-media-action` 新增 `action: "redraw"`。
- `openCanvasMaskEditor(node, options)` 保持现有遮罩绘制行为，增加可选完成回调，不改变“绘制遮罩”右键菜单。

- [ ] Step 1: 在 `IMAGE_TOOL_SPECS` 增加带图标的“重绘”按钮，并只在图片结果或图片素材存在时启用。
- [ ] Step 2: 在 `flora-media-action` 处理器中复用 `openCanvasMaskEditor`，遮罩保存完成后打开轻量中文提示词输入区；保留遮罩编辑器已有画笔、擦除、移动、缩放、清空和保存能力。
- [ ] Step 3: 提示词输入区提供“开始重绘”和“取消”；允许为空，空值提交移除分支；遮罩为空时阻止提交并显示中文错误。
- [ ] Step 4: 提交时调用 `/api/qwen-image21-redraw`，使用当前图片源和已上传遮罩，轮询现有任务状态；完成后复用 `appendCanvasGenerationToGallery` 或现有图片结果节点创建逻辑生成新图片节点，保留原节点。
- [ ] Step 5: 增加中文加载、失败、重试和成功状态；关闭工具或切换节点时清理交互状态。
- [ ] Step 6: 编写浏览器回归，覆盖工具栏可见性、遮罩保存、空/非空提示词请求体、任务成功结果、取消和失败恢复。
- [ ] Step 7: 运行 `node canvas-redraw-regression.cjs`，预期全部通过。

### Task 3: 白名单部署、构建与验收

**Files:**
- Modify: `neon-workbench/component-deploy.mjs`
- Modify: `neon-workbench/deploy.mjs`
- Modify: `neon-workbench/daily-workbench.mjs`
- Modify: `neon-workbench/acceptance.cjs` only if the existing acceptance hook needs the new toolbar action.

- [ ] Step 1: 新增独立 `canvas-redraw-backend` 组件，包含工作流、任务服务、HTTP 路由组合入口；不把后端文件混入普通前端 daily 组件。
- [ ] Step 2: 新增前端 `canvas-redraw-frontend` 组件，包含 Flora shell、script bridge 和必要 CSS；更新 daily 前端白名单。
- [ ] Step 3: 用 `npm run build` 验证构建成功。
- [ ] Step 4: 用 `npm run update:workbench -- --components=canvas-redraw-frontend` 部署固定 33200 stage。
- [ ] Step 5: 用显式后端组件部署命令更新独立运行时，保留 3199 进程不动，并记录“需重开原 AI OS”边界。
- [ ] Step 6: 运行 `node acceptance.cjs`，检查 390、768、1440、1728 宽度、无 pageerror/横向溢出，并确认现有画布拖拽、连接、图片工具回归通过。
- [ ] Step 7: 运行 `node canvas-redraw-regression.cjs` 和相关 ComfyUI 任务回归，记录模拟 API 与真实登录/真实 ComfyUI 的验收边界。
