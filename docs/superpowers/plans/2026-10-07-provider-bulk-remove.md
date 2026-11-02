# Provider Bulk Remove Implementation Plan

> **For agentic workers:** Inline execution with executing-plans; preserve the existing dirty workspace and use isolated API fixtures.

**Goal:** 为可用模型增加多选、全选和批量移除，沿用保存连接才生效的草稿语义。

**Architecture:** ProviderEditor组件内维护可用模型选择，与发现候选选择分离。按模型ID删除并清理关联临时状态，复用现有保存与目录广播。

**Tech Stack:** React、TypeScript、官方Neon Button/Card、Playwright。

## Global Constraints

- 官方组件和语义令牌，44px操作区域，简体中文，390/768/1440/1728无溢出。
- 不读取真实密钥、不修改用户配置；批量移除不调用API，取消放弃，保存生效。
- 部署前build成功，仅deploy.mjs备份部署；不提交现有脏工作区。

### Task 1: 行为与实现

**Files:** `neon-workbench/provider-settings-regression.cjs`、`neon-workbench/src/components/provider-editor.tsx`。

**Interfaces:** 勾选控件role=checkbox，标签`选择模型 {id}`；全选标签`全选可用模型`；按钮`移除所选（数量）`。

- [x] 在现有隔离浏览器测试中加入347项可用模型，断言勾选、部分选择、全选、取消全选、排序保留及单项移除清理。
- [x] 执行`node provider-settings-regression.cjs`，确认因缺少勾选控件失败。
- [x] 新增`markedModels: string[]`，用Set派生有效选择；全选逻辑为`setMarkedModels(allMarked ? [] : models.map(model => model.id))`。
- [x] 实现`removeModels(ids: string[])`：按ID过滤draft.models、markedModels、invalidParameters，移除被展开项；单项和批量共用。只改变组件状态。
- [x] 为标题前增加官方Button的checkbox语义，列表加入全选与移除所选，窄屏换行；空列表与保存中禁用。
- [x] 构建后以`PROVIDER_SOURCE=1`运行专项，验证取消放弃、失败不广播、保存剩余模型、四宽度与页面错误。

### Task 2: 部署与验收

**Files:** `neon-workbench/deploy.mjs`、`neon-workbench/host-bridge.js`、`PROJECT_CONTEXT.md`、`DESIGN.md`、专项报告。

- [x] 更新资源缓存版本为`20261007-provider-bulk-remove`，运行`npm run build`。
- [x] 运行`node deploy.mjs`，保留备份路径。
- [x] 部署后运行`node provider-settings-regression.cjs`及`node acceptance.cjs`，审查四宽度默认/悬停/选中/焦点/空态截图。
- [x] 记录模拟API与真实登录边界，更新文档，报告完成。
