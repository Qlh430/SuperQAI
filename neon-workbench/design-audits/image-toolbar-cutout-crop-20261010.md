# 图片抠图 / 裁剪入口与“点击没反应”修复（2026-10-10）

## 一、用户要求

1. 把「AI 抠图」「裁剪图片」移到图片节点上方的大工具栏里。
2. 解决现在点击抠图 / 裁剪没反应的问题。

## 二、根因

抠图与裁剪的**处理函数本来就是通的**。用隔离探针实测：右键菜单里的两项分别调用 `openCanvasCutoutWorkbench()` / `openCanvasCropWorkbench()`，弹窗对象都已创建（`BackgroundRemovalUi.isOpen() === true`、`#canvasCropWorkbench` 已显示）。真正的问题是**层级**：

| 元素 | 样式里的 z-index |
| --- | --- |
| 画布引擎层 `#neonEngineSurface` | `2147483000` |
| 抠图弹窗 `.canvas-cutout-modal` | `10020` |
| 裁切工作台 `.canvas-crop-workbench` | `10000` |

两个工作台都挂在 `#aiOsDesktop`（或 body）下、层级远低于画布引擎层，于是打开后被画布盖住——视觉上完全看不到，表现为“点了没反应”。项目里已有同类先例（原图灯箱需要把元素挂到 body 并加 `is-over-canvas`、抬到 `2147483100`）。

## 三、改动

- `design-sources/script-before-save-bridge.js`
  - 新增 `raiseCanvasWorkbenchAboveEngine(element)`：把工作台挂到 `document.body` 并加 `.is-over-canvas-workbench`。
  - `openCanvasCutoutWorkbench()` 打开弹窗后立即（并在一次 microtask 后再次）抬层；`openCanvasCropWorkbench()` 在工作台创建后抬层。这样右键菜单、工具栏、快捷键等所有入口一并修好。
  - `flora-media-action` 监听器改为 async，新增 `cutout` / `crop` 分支，调用同一个工作台函数并带上 `memberId`。
  - 图片右键菜单：普通图片节点不再显示抠图 / 裁剪（只剩「下载图片」「绘制遮罩」）；**图集成员**没有对应工具栏，继续在菜单里保留这两项。
- `design-sources/flora-node-shell.js`
  - `buildMediaActions()` 的图片素材工具栏新增两个动作：`cutout`（AI 抠图，lucide `scissors`）与 `crop`（裁剪图片，lucide `crop`），排在「放大查看原图」之后、「下载素材」之前。
  - 两者只在「单张图片素材节点（kind = upload）且当前有图」时显示；合集 / 视频 / 音频节点保持隐藏。
- `design-sources/flora-node-shell.css`
  - 新增 `body > .canvas-cutout-modal.is-over-canvas-workbench, body > .canvas-crop-workbench.is-over-canvas-workbench { z-index: 2147483100 !important; }`。

## 四、验证

新增 `neon-workbench/image-toolbar-cutout-crop-regression.cjs`（部署后绿）：

- 图片工具栏可见动作按序为 `preview → cutout → crop → download → replace → delete`，抠图标题「AI 抠图」、裁剪标题「裁剪图片」；
- 点击抠图：弹窗挂到 `body`、带 `is-over-canvas-workbench`、`z-index = 2147483100`，且用 `document.elementFromPoint()` 在弹窗中心命中弹窗（证明确实盖在画布之上）；
- 点击裁剪：`#canvasCropWorkbench` 同样挂 body、`z-index = 2147483100`、中心点命中面板，三种模式（比例裁切 / 自由裁切 / 宫格裁切）齐全；
- 图片右键菜单只剩 `download` 与 `mask`。

截图：`acceptance/image-toolbar-cutout.png`、`acceptance/image-toolbar-crop.png`。

同步更新 `material-image-regression.cjs`：图片素材工具栏可见按钮由 4 个改为 6 个（新增抠图 / 裁剪），四宽度两缩放全部通过。

其余门禁：`acceptance.cjs` 48 图 `errors/overflow` 为空。

**预存在失败**：`flora-toolbar-regression.cjs` 在 `asset-collection` 案例上报「标题间距错误」（gap 2.04、barHeight 7.48）。我把 `flora-node-shell.js/css` 临时换回本次部署前的备份文件后同样复现同样数值，确认与本轮改动无关。

## 五、边界

- 抠图主体模式依赖本地 ONNX 模型文件，真实抠图质量与首次模型加载耗时需要在用户会话里验证；本轮只验证界面可达与层级正确。
- 图集成员的抠图 / 裁剪仍走右键菜单（工具栏没有成员级入口）。
- 本轮只改客户端文件，刷新画布页即可生效；未停止 3199、未修改真实画布数据、未触发任何生成任务。
