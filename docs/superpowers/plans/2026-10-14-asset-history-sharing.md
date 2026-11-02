# Asset History Sharing Implementation Plan

> **For agentic workers:** Use subagent-driven-development to implement and review the bounded tasks below.

**Goal:** 分离自动历史与主动资产，支持媒体引用入库、资产共享及项目继承共享。

**Architecture:** 原媒体 resource 保持自动注册，新增 curated asset 登记与分类目录引用原 resource。项目共享动态叠加画布资源访问权限。Neon React 统一呈现历史、资产及入库弹窗，宿主桥接画布入口。

**Tech Stack:** React、TypeScript、Neon组件、Node宿主、SQLite、Playwright。

## Global Constraints

- 入库、共享仅建立引用，不能复制整份媒体文件。
- 数据由宿主持久化，不用 localStorage。
- 中文界面，只复用 Neon 组件与语义令牌、Flora 节点规则。
- 不改用户真实数据进行测试，使用独立端口33199和临时数据库。
- 不停止3199服务。运行时先备份且仅通过deploy.mjs部署。
- npm run build通过后部署，部署后四宽完整acceptance；说明模拟API与真实登录边界。
- 不提交、不推送、不发布新版本。

## Task 1: 资产引用服务

Files: `neon-workbench/design-sources/curated-asset-service.js`, `curated-asset-http-api.js`, `system-db.js`, `resource-access.js`, `resource-http-api.js`; test `curated-assets-regression.cjs`。

- [x] 写临时SQLite用例：两次入库同媒体只有一个登记；共享跨账户可读；撤销后不可读；删除历史/移除登记不删媒体；迁移保留已有分享。
- [x] 执行 `node curated-assets-regression.cjs`，记录失败后实现并再次执行通过。
- [x] 实现 `GET/POST /api/asset-library`，`PATCH/DELETE /:assetId`，`PATCH /:assetId/share`，分类与文件夹增删改，`DELETE /history/:resourceId`。
- [x] 保留 `registerMedia` 自动注册；`ResourceEntry`附加`asset:{id,resourceId,name,categoryId,folderId,ownerUserId,ownerDisplayName,visibility,userIds,permission}`。

## Task 2: 项目共享

Files: `design-sources/canvas-project-service.js`, `canvas-project-http-api.js`, `project-share-access.js`, `canvas-storage-http-api.js`; `src/pages/projects.tsx`, `src/components/project-share-editor.tsx`; test `project-sharing-regression.cjs`。

- [x] 临时库测试当前/后续画布继承、只读阻止编辑、编辑阻止管理、撤销及独立分享保留。
- [x] 实现 `PATCH /api/canvas/projects/:id/share` 与项目列表分享者字段，画布`sharedViaProject`，资源访问实时合并授权。
- [x] 项目卡显示分享者，系统目录显示单独共享画布，所有者菜单管理名称与共享范围。

## Task 3: 画布入库入口

Files: `design-sources/canvas-asset-entry.js`, `node-action-bar.js`, `script-before-save-bridge.js`, `host-bridge.js`; test `canvas-asset-entry-regression.cjs`。

- [x] 提取当前有效媒体并测试图片/视频/音频与多选，空任务不提供入口。
- [x] `neon:request-add-assets`事件通过宿主桥发送`neon:add-assets {items,requestId}`，复用React弹窗；`assetDialogClosed`恢复原画布与焦点。
- [x] 右键和更多入口只传`{url,kind,title,mimeType?}`快照，不上传或复制文件。

## Task 4: Neon历史与资产页面

Files: `src/pages/asset-library.tsx`, `src/pages/history.tsx`, `src/components/add-to-asset-dialog.tsx`, `src/components/resource-actions.tsx`, `src/components/asset-preview.tsx`, `src/lib/api.ts`, `src/App.tsx`。

- [x] 原素材类型与瀑布流迁入历史，自己的媒体按原URL去重，保留对话和任务状态，时间/来源筛选及全屏预览。
- [x] 资产页仅请求主动登记，分类文件夹管理、名称搜索、三类共享目录，显式导入并选归类。
- [x] 共用入库弹窗与批量选择，历史及画布成品入库，显示重复登记反馈。资产操作使用登记接口，历史删除使用隐藏入口接口。
- [x] 首页仍只显示生成图片/视频，打开历史，全屏预览保持。

## Task 5: 集成部署与验收

Files: `deploy.mjs`, `asset-history-sharing-regression.cjs`, `acceptance.cjs`, `PROJECT_CONTEXT.md`, `.design/asset-history-sharing-20261014/REPORT.md`。

- [x] 集成组件接线，备份所有运行时目标，新服务源码只通过部署脚本复制。
- [x] `npm run build`、三模块回归及四宽度新交互通过后执行`node deploy.mjs`。
- [x] 执行`node acceptance.cjs`四宽完整流程，并检查默认/悬停/选中/焦点/全屏/移动端和无pageerror/横向溢出。
- [x] 报告模拟与真实登录业务边界，记录备份、测试证据、运行中服务需正常退出重开以载入后端变更。

## 验证与共享边界

完成本机部署；未提交、推送或发布。明确主动保存到自己的资产库会产生独立登记，仍引用同一原文件；撤销原共享立即移除该授权，但不会删除别人此前主动保存的独立登记。独立临时服务33205验证真实接口与原文件哈希/数量不变，UI33199及部署后3199静态验收使用模拟API，真实用户会话仍待业务试用。
