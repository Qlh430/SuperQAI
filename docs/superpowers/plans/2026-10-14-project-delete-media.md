# 项目删除与媒体清理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 项目整体移入回收站，永久删除画布按其他画布与资产引用安全清理孤立媒体。

**Architecture:** canvas worker事务负责批量回收与补偿，system-db同步权限目录和资源。共享媒体变更锁串行协调画布引用、资产登记和永久清理，前端只展示服务端确认的删除能力。

**Tech Stack:** React/TypeScript、Neon组件、Node.js、SQLite、Playwright。

## Global Constraints

中文；不复制文件；不操作真实用户数据；不结束3199；仅通过deploy.mjs备份部署；不提交、推送或发布。

### Task 1: 后端项目整体删除

Files: `neon-workbench/design-sources/system-db.js`, `canvas-project-service.js`, `canvas-project-http-api.js`, `canvas-db-worker.js`; Test: `neon-workbench/project-delete-regression.cjs`。

- [x] 以真实临时SQLite验证owner删除、非owner拒绝、系统目录保护、已移走画布不变、所有子画布回收、失败补偿和重试。
- [x] 实现 `DELETE /api/canvas/projects/:id`，返回删除计数和回收状态；项目描述增加 `canDelete`。
- [x] 使用 `withMediaMutation(action)`；worker经 `repository.invoke`批量事务；同步资源时跳过tombstone；撤销项目共享并广播。
- [x] 执行 `node project-delete-regression.cjs`，所有临时数据断言通过。

### Task 2: 媒体生命周期

Files: `canvas-media-lifecycle.js`, `canvas-media-references.js`, `canvas-media-gc-service.js`, `canvas-storage-http-api.js`, `curated-asset-service.js`, `history-http-api.js`; Test: `canvas-media-gc-regression.cjs`。

- [x] 增加 `createCanvasMediaGcService({outputDir,db,getCanvasStorage,thumbnailStore})` 的 `captureBoard(boardId)`和 `cleanupMedia({userId,candidates})`。
- [x] 活动/回收/未挂载引用、任意账户资产与外部所有权保护；原文件无引用删除并tombstone、清缩略图。
- [ ] 检查实际缩略图接口、编码别名及历史任务输出，避免历史复活。
- [ ] 执行 `node canvas-media-gc-regression.cjs` 和临时真实宿主集成，soft trash保留、permanent条件清理。

### Task 3: 界面与部署

Files: `src/pages/projects.tsx`, `src/lib/api.ts`, `deploy.mjs`, `design-sources/asset-history-deploy-patches.cjs`; Test: `projects-navigation-trash-regression.cjs`, `acceptance.cjs`。

- [x] 自有可删除项目新增删除图标，确认说明全部画布进入回收站、要保留请先移走；取消无请求、失败保留重试、忙碌禁用、成功返回全部。
- [x] 永久删除确认说明条件清理，读取 `cleanup.error`作提示。
- [x] 新模块备份/复制和composition接线，验证补丁幂等。
- [x] `npm run build`成功，再 `node deploy.mjs`，再 `node acceptance.cjs`；四宽390/768/1440/1728无pageerror或横向溢出。
- [x] 更新报告和PROJECT_CONTEXT，明确模拟接口与临时真实账户边界、正常重开加载后端。
