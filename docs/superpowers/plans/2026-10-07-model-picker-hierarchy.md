# Model Picker Hierarchy Implementation Plan

**Goal:** 当前选择清晰可见，平台标题与模型行有明确视觉层级。

**Architecture:** 修改Flora规范源CSS，保留模型选择器原有aria-selected与真实ID逻辑；复用既有浏览器验收流程增加截图状态。

**Tech Stack:** 现有宿主JavaScript、Neon/Flora CSS语义令牌、Playwright。

- [x] 修改 `neon-workbench/design-sources/flora-node-shell.css` 的选中与分组样式，保留焦点、悬停、44px目标和窄屏折行。
- [x] 复用 `generator-composer-regression.cjs`，记录当前模型在四宽度及全屏的选中截图，检查已有选择、键盘及折叠流程。
- [x] 构建，使用deploy.mjs备份部署并更新缓存版本，运行部署后节点专项与acceptance.cjs。
- [x] 更新DESIGN.md、PROJECT_CONTEXT.md和验收报告，说明模拟业务边界。
