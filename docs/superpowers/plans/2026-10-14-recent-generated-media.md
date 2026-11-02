# 最近生成成品 Implementation Plan

**Goal:** 概览最近素材只展示已生成的图片和视频成品。

**Architecture:** 基于已有Resource来源/refType字段在Home过滤，筛选后截取，复用现有卡片；不修改后端与素材库。

**Tech Stack:** React、TypeScript、Neon、Playwright。

- [x] 只读核对真实接口字段与来源统计，先运行回归确认旧版被上传素材占满。
- [x] 扩展Resource类型，Home过滤并调整空态与观察器。
- [x] npm run build；deploy.mjs自动备份部署。
- [x] 独立33199静态服务+模拟API进行混合资源、五尺寸、空态恢复、素材库和完整acceptance。
- [x] 记录报告和PROJECT_CONTEXT。
