# 宫格裁剪即时横条 Implementation Plan

**Goal:** 自定义行列横条不遮图，数字与分割线实时同步，确认一次裁剪。

**Architecture:** 既有crop-menu的custom分支改为单行，panel数据属性定位在舞台下方；input事件逐轴更新分线，submit统一复用现有裁剪保存/分组流程。保持已有来源像素规则及状态。

**Tech Stack:** 宿主Canvas DOM/JavaScript、Flora CSS、Playwright。

- [x] 扩展canvas-crop-grid-input-regression.cjs，先验证旧版数字与分线不同步。
- [x] 修改script-before-save-bridge.js事件、定位和确认；flora-node-shell.css复用现有样式构建横条。
- [x] 构建，deploy.mjs备份部署；四宽度即时输入/不遮图/确认裁片/失败重试/重复点击。
- [x] 裁剪外观与完整acceptance；报告和上下文。
