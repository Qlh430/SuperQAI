# 画布平移/缩放性能修复（2026-10-11）

用户要求：优化画布移动、缩放卡顿，保持功能和样式不变。

## 根因

在 36 节点隔离画布中，`applyCanvasTransformNow()` 每帧修改 `#canvasPlane` 的内联 `style`。每个生成节点的 `bindPlaneObserver()` 都监听该属性，于是一次平移/缩放会向所有已挂载节点投递观察记录，并为可见操作区重复安排 `projectShellRect()`。修复前采样为 1620 条平面观察记录，`projectShellRect` CPU 采样约 1.1 秒；场景层本身不是主要热点。

## 修改

- `flora-generator-composer.js` 的平面观察器保留 class 和 childList 生命周期变化，移除画布自身 transform 的 style 监听。
- 导出 `syncViewport()`，由画布变换路径只调度当前可见、非放大的操作区；隐藏节点不再安排无效定位帧。
- 操作区外壳宽高只在首次使用或 `ResizeObserver` 发现尺寸变化时读取；缩放帧沿用原投影公式和 CSS 变量契约。
- 节点上的 `--flora-composer-*` 变量仍按原方式写入；观察器识别自身定位变量，避免把它们再次当作原生内容变化同步。
- `deploy.mjs` 将组合器缓存版本更新为 `20261011-canvas-observer`，确保工作台不命中旧脚本。

没有修改 CSS 视觉规则、节点尺寸、交互动作、保存数据结构或 API。

## 验证

- 修复前运行 `canvas-plane-observer-regression.cjs`：`records=132`，按预期失败。
- 修复后：`{"ok":true,"records":0,"callbacks":0}`。
- `canvas-performance-behavior.cjs`：平移缩放定位、保存读取、提示词更新、撤销/重做、连接合并和 board.patch 均通过。
- `canvas-performance-visual.cjs`：图片生成、文字、素材图片、素材视频、H3 五类节点，0.25/0.65/1/2 缩放及动态节点共 21 组样式对比通过。
- 性能夹具（同机、36 节点、1440×1050）：
  - 平移：中位数 16.7ms，P95 18.8ms，0 长任务。
  - 平移缩放：中位数 31.1ms，P95 51.5ms，3 个长任务；修复前同夹具 31.7ms、54.0ms、8 个长任务。单次运行存在机器波动，观察记录从 1620 降到 44，操作区投影采样从约 1.1 秒降到约 7.5ms。
  - 输入：720 次序列化保持，保存 pending 快照仍每批读取 1 次。
- `npm run build` 成功；随后通过 `node deploy.mjs` 备份并部署。
- 部署后 `node acceptance.cjs`：390/768/1440/1728 宽度、项目/回收站/素材/模拟生图/模拟对话/返回/移动导航，`errors=[]`、`overflow=[]`、48 张截图。
- 部署后实际运行时 `canvas-performance-behavior.cjs` 通过；运行时组合器与规范源 SHA256 一致。

## 边界

性能与 acceptance 使用隔离模拟 API，没有触发真实付费生成、真实登录保存或 ComfyUI 推理。真实登录后的画布数据、服务商与 ComfyUI 业务仍需用户会话验收。Better Design MCP 当前未连接，没有动态审查结果。运行中的 3199 服务未停止或按端口终止；重新打开工作台后会加载已部署的服务模块。
