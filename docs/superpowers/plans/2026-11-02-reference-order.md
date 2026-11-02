# 参考素材排序实施计划

用户已确认操作区拖拽排序、生成顺序一致、编号同步、保存恢复、撤销重做，遵循 Neon/Flora。

**Goal:** 参考素材显示、保存和实际生成请求使用同一顺序。
**Architecture:** 延用 refOrder、CanvasReferenceBridge 和 node.upsert；读取时无副作用排序。Pointer Events 支持鼠标/触摸与取消，Alt+方向键支持键盘。保留现有媒体类型分区，类型内排序；H3 保留原用途和历史顺序。
**Tech Stack:** 原生画布 JavaScript、现有 Flora CSS、Playwright、Node。

## 约束
- 简体中文、官方语义令牌；不写 localStorage。
- 不停止3199，不新增数据库服务，不调用真实模型。静态模拟验收33199。
- 只经 deploy.mjs 更新固定 stage，保留所有既有未提交成果。

## 执行步骤
- [x] 添加 reference-order-regression.cjs：指针拖动、取消、键盘、编号、真实请求拦截、保存恢复、撤销重做、H3与四宽普通/放大。先运行确认当前失败。
- [x] 修改 script-before-save-bridge.js：CanvasReferenceBridge.sort、统一只读顺序、序列化/恢复、Undo/Redo；使用既有保存操作。
- [x] 修改 flora-generator-composer.js 与 flora-node-shell.css：拖动与插入提示、取消、键盘；保持移除/添加和类型分区。
- [x] 专项和既有回归、npm run build、daily-workbench组件部署，部署后专项和 acceptance.cjs。
- [x] 检查差异、备份及报告，明确模拟API与真实登录业务验收边界。
