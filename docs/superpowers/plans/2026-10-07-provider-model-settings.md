# Provider Model Settings Implementation Plan

> **For agentic workers:** Use subagent-driven-development for isolated implementation and requesting-code-review before deployment.

**Goal:** 实现已确认的 API 模型服务编辑、发现后选择、逐项配置、密钥显示复制和全工作台模型同步。

**Architecture:** 把服务编辑器从 SettingsPage 分离为组件，草稿只在组件内存保存。沿用 provider store、协议注册表和模型目录接口；保存成功后发送同源模型目录事件到工作台与宿主画布。

**Tech Stack:** React 19、TypeScript、官方 Neon 组件、现有 Node 宿主 API、Playwright。

## Global Constraints

- 所有界面复用 Neon 语义令牌、官方组件与 Flora 节点规则，简体中文。
- 发现模型只在选择确认后加入草稿；连接保存前不修改已保存模型。
- 密钥没有时为空，有时真实值默认密码掩码，可显示、隐藏、复制、修改；清空保存删除原值。
- 密钥读取仅限已认证管理员，禁止写入日志、浏览器持久存储或公共模型目录。
- 网络线路使用宿主支持的 auto/direct/proxy，协议与模型配置使用真实字段。
- 保存成功后所有模型选择器刷新；保留有效选择与提示词，不静默切换已删除模型。
- 运行时只通过 deploy.mjs 部署，先备份，build 成功后部署；验收覆盖 390/768/1440/1728。
- 不修改用户已有业务配置，不提交现有脏工作区；测试使用隔离模拟接口。

### Task 1: API contracts

**Files:** `neon-workbench/design-sources/provider-http-api.js`、`neon-workbench/provider-api-regression.cjs`、`neon-workbench/deploy.mjs`。

**Interfaces:** 管理员 POST `/api/providers/:id/secret` 返回 `{apiKey}`，no-store；既有 `clearApiKey` 保存删除。发现/验证的明确空密钥不回退旧值。沿用 store 中 metadata.networkMode。

- [x] 建立隔离的 API 鉴权、密钥掩码/读取/清除、模型发现不保存测试，先确认失败。
- [x] 从当前运行时复制 API 模块为 canonical source，添加授权密钥读取并修复明确空值语义。
- [x] 验证测试，部署脚本备份并复制该模块。

### Task 2: Provider editor

**Files:** `neon-workbench/src/pages/management.tsx`、新 `src/components/provider-editor.tsx`、必要模型草稿辅助模块。

**Interfaces:** `ProviderEditor({provider, protocols, onClose, onSaved, notify})`；沿用 POST `/api/providers`、`/api/providers/models`、`/api/providers/test*`、`/api/protocols`。

- [x] 将已确认布局记录为浏览器验收案例。
- [x] 服务名称 → 平台协议/网络线路同排 → URL → 密钥，窄屏堆叠。
- [x] 默认密码掩码，眼睛和复制；读取失败显示中文错误并防止误删密钥。
- [x] 发现候选搜索/分类/多选/计数/加入所选/取消，重复不覆盖既有配置。
- [x] 可用模型列表手动添加、展开配置、测试、排序、移除；协议/能力/分辨率/默认参数读写真实 metadata。
- [x] 保存、取消、加载与错误状态；即时操作只影响草稿，测试可显式调用上游。

### Task 3: Catalog synchronization

**Files:** `src/lib/api.ts`、`src/pages/creative.tsx`、`host-bridge.js`、`design-sources/script-before-save-bridge.js`。

**Interfaces:** `publishModelsChanged(revision?)`；同源 `neon:models-changed` 消息桥接宿主已有模型刷新，复用 revision/stale guards。

- [x] 先编写保存成功/失败、已开画布、多服务同名模型、删除当前模型测试。
- [x] 连接保存/删除/启用后发送更新，刷新现有生图/对话/视觉/视频、Agent与画布下拉框；当前无独立音频生成选择器。
- [x] 合法选择保留；移除选择显式提醒重选；失败不广播、不当作空列表。

### Task 4: Integration and acceptance

**Files:** `provider-settings-regression.cjs`、相关验收报告、`PROJECT_CONTEXT.md`。

- [x] 运行 API/编辑器/同步专项，修复失败。
- [x] reviewer 审查新改动，修复重要问题。
- [x] npm run build，通过 deploy.mjs 备份部署。
- [x] node acceptance.cjs 与 provider-settings-regression.cjs，检查四宽度及默认/悬停/选中/焦点状态。
- [x] 报告真实登录与模拟 API 的边界，更新项目上下文。

## 完成记录

2026-10-07 已完成实现、独立复审、构建、备份部署及隔离模拟验收。详见 neon-workbench/design-audits/provider-model-settings-20261007.md。新增服务端密钥接口需用户从托盘完全退出再打开应用后生效，真实登录业务验收尚未完成；本轮未强制重启或修改用户配置。
