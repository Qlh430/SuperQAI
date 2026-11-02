# 图片生成节点下方操作区 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 实现用户已确认的图片预览节点与选中后下方操作区。

**Architecture:** 专用组合器模块把原有控件移至节点内的下方面板；原画布引擎继续拥有数据和生成逻辑。Flora 壳体只保留结果预览，组合器处理状态和屏幕空间定位。

**Tech Stack:** 宿主 DOM JavaScript、现有 Neon/Flora CSS、Playwright、Node、现有 deploy.mjs。

## Global Constraints

- 保留现有 400×400 Flora 主体、48px 外部标题带、连接端口与共享工具栏。
- 操作面板锚定选中节点下方，中间保留 16px 间距，桌面最大宽度 960px，随可用视口收窄。
- 面板使用 Neon 语义令牌与 Flora 16px 圆角、统一间距、中文文字和 Lucide 图标。
- 提示词、参数、参考区、原运行按钮均复用原 DOM，仍属于所属节点的后代。
- 控件留在节点内部，不使用 localStorage 存放画布或生成数据。
- 部署仅通过 deploy.mjs，先构建并备份。
- 保留现有未提交工作，不纳入无关文件或用户运行数据。

## Task 1：行为回归及专用组合器

**Files:** 创建 neon-workbench/generator-composer-regression.cjs、design-sources/flora-generator-composer.js；修改 design-sources/flora-node-shell.js。

**Interfaces:** `window.FloraGeneratorComposer.mount(node, shell)`、`sync(node)`、`unmount(node)`；消费 `canvas:selectionchange` 和画布转换事件；参考上传发出 `flora-generator-reference-upload`，detail `{node,files}`。

- [x] 建立真实宿主隔离浏览器场景，API 全部拦截，创建两个图片生成节点。
- [x] 先断言未选中面板隐藏、单选面板可见且位于壳体下方：`assert.ok(panelBox.y >= shellBox.y + shellBox.height + 12)`；输入后取消/重选值不变。运行 `$env:AI_OS_TEST_URL='http://127.0.0.1:3188'; node generator-composer-regression.cjs`，确认缺少面板而失败。
- [x] 组合器创建 `.flora-generator-composer`、参考区、提示词区、参数区与动作区；将实际 `.canvas-node-prompt`、`.canvas-node-refs`、`.canvas-node-controls` 移入，保持 node.querySelector 有效。创建独立结果容器，不将 refs 留在结果区；避免重复装配。
- [x] mount 后选中状态、真实按钮属性和价格同步；原 run 在面板显示，仅创建主行动的呈现层时必须委托原 run 一次。unmount 清理观察器、事件、动画帧并恢复原控件。
- [x] 根据 getBoundingClientRect 与节点 offsetWidth 计算缩放；面板宽 `Math.min(960, innerWidth - 32)`；左侧钳制于视口 16px 内，top 为壳体下沿加16；底部限高且保持可滚动。节点拖动/画布变换后重新定位。
- [x] 壳体 composeContent 对 generator 路径调用组合器，mirrorState/sync 和 unmount 接入生命周期。使用现有图片空态组件样式和真实结果 DOM。

## Task 2：样式、宿主上传、部署入口

**Files:** 修改 design-sources/flora-node-shell.css、design-sources/script-before-save-bridge.js、deploy.mjs。

- [x] 为 composer 设置统一 card/border/foreground/primary 令牌、16px 圆角与16px留白。提示词不嵌套卡片；参数和运行区有清晰分组，移动端折行。保留44px触控区域和焦点环。
- [x] 上传事件使用 uploadCanvasImageFile(file)、addCanvasImage(src,name,point)、connectCanvasNodes(from,to)；失败 setCanvasNodeStatus(node,中文错误)，不替换生成节点本身。操作来自真实选择的 node 引用，防止换选后写入其他节点。
- [x] deploy.mjs 把新模块加入备份/复制清单并在 flora-node-shell.js 前加载；JS/CSS 入口版本更新。
- [x] 回归覆盖两节点隔离、缩放/平移、移动可访问、清理与重渲染；记录默认/选中/焦点/全屏/移动截图。

## Task 3：审查与实际部署

- [x] 浏览器回归通过后审查代码与确认方案一致，检查单次提交、错误可见、没有重复 DOM、保存查询仍有效。
- [x] 调用 Better Design 规则、可理解性和官方 DOM 捕获/间距检查；人工检查截图，不把几何分数描述为视觉批准。
- [x] `npm run build` 成功，`node deploy.mjs` 备份并部署。3188 实际入口复验；`node acceptance.cjs` 无 pageerror/横向溢出。
- [x] `node video-seek-host-regression.cjs`、`node audio-node-regression.cjs` 通过；仅在新修改或失败时重复测试。
- [x] 更新 DESIGN.md、PROJECT_CONTEXT.md 与局部验收报告，注明模拟 API/真实登录边界，给用户展示实际截图。

## 自检

需求均对应任务，只有 generator 修改；接口名称一致，无新 API 或数据存储。以上设计与用户已确认结构相同，直接执行，不新增确认步骤。
