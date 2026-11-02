# Provider Diagnostics Implementation Plan

> **For agentic workers:** Use subagent-driven-development for backend diagnostics and isolated tests; requesting-code-review before deployment. Preserve the existing dirty workspace.

**Goal:** 精简配置并使协议验证和逐模型真实测试结果可理解、可追踪。

**Architecture:** ProviderEditor保留草稿管理，拆出provider-model-settings与provider-diagnostics负责紧凑设置和结果展示。canonical provider-http-api/provider-test-result负责真实执行、返回结果与脱敏；provider-protocol-engine与media-protocol-adapters保持实际适配及网络线路，并修正业务失败判定、任务信息保留和201/202处理。

**Tech Stack:** React/TypeScript、官方Neon组件、宿主Node协议引擎、Playwright和本机HTTP隔离测试。

## Global Constraints

- 官方组件、令牌与Flora，中文，44px及390/768/1440/1728无溢出。
- 不访问用户真实密钥，不修改配置，不触发外部付费调用；修改运行时只能通过deploy.mjs备份部署。
- protocol verify读取available，模型结果必须有真实内容才成功；pending与失败明确区分，配置改变使旧结果过期。
- 原有批量移除、草稿取消及保存目录同步保持。

### Task 1: 后端诊断契约

**Files:** design-sources/provider-http-api.js、design-sources/provider-test-result.js、provider-diagnostics-api-regression.cjs（均位于neon-workbench）。

- [x] 先用本机HTTP服务器和真实宿主engine复现协议验证、失败、生成、图片编辑/视觉、工具、音视频的契约缺口。
- [x] 支持test-image-edit与test-tools能力，白名单诊断结果返回status/text/images/videos/audios/taskId/toolCallCount/elapsedMs，空内容不成功。
- [x] 验证脱敏、真实请求输入及参数、pending不会重复提交、失败中文原因与建议。

### Task 2: 紧凑设置与结果界面

**Files:** src/components/provider-editor.tsx、provider-model-settings.tsx、provider-diagnostics.tsx；provider-settings-regression.cjs及新provider-diagnostics-regression.cjs。

- [x] 保存设置/删除服务文案，删除显示名称与普通协议输入，高级保留协议和JSON。
- [x] 能力多选标签、真实分辨率选项和自定义补充，保存原字段；新模型与连接变更用infer-protocols自动适配。
- [x] 协议结果显示在按钮旁，以available判断、包含理由与建议；配置改变和迟到响应标记过期。
- [x] 模型测试提供提示词/参考图，真实请求，逐项文本/图片/视频/音频/工具结果及失败/pending显示，改变配置使旧结果失效。
- [x] 先运行新浏览器用例确认缺功能失败，再验证源码构建后通过，保留347项批量移除回归。

### Task 3: 审查、部署与验收

- [x] 独立复审后端/界面及测试，修复重要问题。
- [x] deploy.mjs新增结果模块备份复制，缓存版本20261007-provider-diagnostics；npm run build成功后部署。
- [x] 部署后诊断/编辑器/acceptance专项，四宽度、默认/悬停/选中/焦点/失败/空态，记录模拟与真实登录边界。
- [x] 更新DESIGN.md、PROJECT_CONTEXT.md及验收报告；宿主缓存模块如有修改说明完整重启要求。
