# 画布命名 Implementation Plan

**Goal:** 最近画布可重命名，新建画布命名后才创建。

**Architecture:** 专用 CanvasNameDialog 复用官方 Modal/Input/Button，canvas-naming.ts 复用已有 board.patch。创建成功传 boardId 到宿主打开，项目归属随创建请求传递。

**Tech Stack:** React、TypeScript、Neon、宿主 HTTP API、Playwright。

## 约束

只改 Neon 工作台，简体中文，不使用 localStorage；保留现有未提交改动。测试独立 33199、临时数据，仅清理测试自身 PID。构建成功后 deploy.mjs 备份部署。

## 步骤

- [x] 添加 canvas-naming-regression.cjs，先验证旧版缺少最近画布改名入口。
- [x] 添加 canvas-naming.ts 与 CanvasNameDialog；App 接入最近改名、新建命名；BoardActions 复用保存函数。
- [x] npm run build；node deploy.mjs。
- [x] 独立服务执行真实临时账户命名测试、模拟错误、四尺寸与视觉状态、全屏打开返回。
- [x] 独立服务执行 node acceptance.cjs；记录报告与 PROJECT_CONTEXT.md。
