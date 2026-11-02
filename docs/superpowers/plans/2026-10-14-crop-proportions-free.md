# 裁剪组比例与自由裁剪 Implementation Plan

**Goal:** 宫格切片保留分线比例，新增默认正方框且不锁比例的自由裁剪。

**Architecture:** 裁剪结果通过addCanvasImage的显示尺寸选项复用现有适应尺寸应用逻辑，并以mediaSizeMode=manual+已存width/height维持显示尺寸。序列化/恢复/复制延续现有画布payload。free裁剪在既有内联状态和拖线处理器中明确分支。

- [x] 扩展crop-grid回归，先复现不均等切片独立放大及自由裁剪入口缺失。
- [x] 统一缩放与组内布局，保存恢复尺寸；添加自由按钮和非锁比例分支。
- [x] 构建+deploy.mjs备份部署，四宽度实鼠标拖动/导出/恢复/复制验证。
- [x] 既有实时横条、外观与完整acceptance；报告和上下文。
