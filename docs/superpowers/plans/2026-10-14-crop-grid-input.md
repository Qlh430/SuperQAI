# 自定义宫格数字输入修复

**Goal:** 宫格裁剪的行列数字可鼠标点击聚焦、键盘改写和方向键增减。

**Root cause:** startCanvasInlineCropDrag绑定到整个裁剪层，把工具条和表单点击当作pan并preventDefault，原生输入无法聚焦；wheel同样覆盖整层。

**Fix:** pointerdown拖动和wheel缩放仅接受data-crop-stage图片舞台，表单保留原生事件；保留既有Neon/Flora界面及1–8行列规则。

- [x] 阅读上下文和设计规范，检查来源及部署路径。
- [x] 独立33199静态服务+模拟API，真实鼠标点击复现输入未聚焦。
- [x] 添加舞台范围判断，保留输入原生行为。
- [x] 构建后deploy.mjs备份部署。
- [x] 四宽度验证点击改写、方向键、无误拖/误缩放，4×2确认8片；图片拖动缩放仍可用。
- [x] 既有裁剪外观回归与完整acceptance，记录报告和上下文。
