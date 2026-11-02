# 最近素材预览实施计划

**Goal:** 点击最近图片或视频直接全屏预览，并提供真实素材操作。
**Architecture:** AssetPreview 共用官方 Modal 与 AssetActions；Home 持有资源 id，Assets 复用预览组件。通过现有接口刷新资源。
**Tech Stack:** React、TypeScript、Neon、Playwright。

- [x] 新建 recent-asset-preview-regression.cjs，独立端口、静态宿主及模拟资源 API；先运行确认点击跳转导致失败。
- [x] Modal 支持样式扩展；AssetPreview 负责全屏/普通模式、媒体加载/错误/重试、视频播放与底部操作。
- [x] Home 卡片打开预览，传入 refresh/notify；Assets 使用同一组件保留普通弹窗形态。
- [x] 增加原媒体与视频封面夹具，确认失败后修正预览和下载地址解析。
- [x] npm run build，源码构建测试四宽度、所有操作、权限/错误与媒体状态。
- [x] deploy.mjs 备份部署；部署后重跑专项与筛选回归、完整 acceptance.cjs；保存截图、报告、更新 PROJECT_CONTEXT。保留现有未提交工作，不发布版本，不结束 3199 服务。
