# 文字静态格式与普通连接遮挡修复

用户已确认本轮范围。按 writing-plans 流程实施并逐项验证，不开启后续性能阶段。

- [x] 为静态文字绘制补标题/加粗/列表/段落与缓存失效回归，先确认旧实现失败。
- [x] 在 canvas-node-visuals.js 内保留语义块与行内格式，共用 Canvas/Light 的轻量绘制和有界缓存，不创建 Full 或编辑控件。
- [x] 为普通 SVG 连线补 Scene 主体遮挡回归，先确认旧实现失败；在现有 SVG 上复用世界坐标遮挡，不改连线曲线/端点/数据协议，不增加每帧全节点扫描。
- [x] 原生单击与取消选择、同倍率 Scene/Light/Full、富文本与空行、现有连接交互分别回归；源码测试后经 deploy.mjs 构建/备份/组件部署。
- [x] 部署态四宽与完整 acceptance；100/200/2000 节点 A/B 各3轮原生 Pan/Zoom，记录 P95、DOM、Full与过渡长帧，不隐藏压力边界。
- [x] 写本轮报告和项目接力说明，停止。

约束：当前 Golden 唯一主线；不回滚其它修改，不改 Camera、Virtualizer、Representation Manager、保存、Undo/Redo。测试只用独立静态端口和模拟 API，3199不触碰。
