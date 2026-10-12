# 抠图结果节点：图片生成节点 + 回原图连线（2026-10-12）

## 一、用户要求

「抠出的图怎么不是图片生成节点，也没有连线」——抠图结果落在画布上时既不是生成节点，也没有连回原图的线。

## 二、定位过程与证据

先只读用户的真实画布库（`AI-OS-Portable-1.0.5-win-x64/data/canvas.db`，`node:sqlite` 只读打开），确认现场状态：

| 项目 | 数值 |
| --- | --- |
| 用户画布 | board pk=11（30 节点 / 12 条连线） |
| 原图节点 | `82f2c449…`，`imageName=0e3154dd-…-ad06c34d.png`，位于 (-110, 1223) |
| 抠图结果节点 | `3434e48b…`，`imageName=0e3154dd-…-抠图-抠图_1791792620039_49c42b2f.png`，位于 (888, 1412)，`payload.kind=image`，`generationHistory=[]` |
| 结果与原图之间的连线 | **不存在**（`connections` 表里 `3434e48b` 既不是 from 也不是 to） |
| 原图已有的 6 条出线 | 图片生成 3 / H3 ×2 / video-api / 文本 / 图集，都指向画布右侧远处的节点（截图里那一束斜穿的虚线） |

两个成因：

1. **没有连线**：`placeCanvasCutoutResult()` 只调用了 `addCanvasImage()`，没有调用 `connectCanvasNodes()`；即便补上，`getCanvasConnectionCompatibility()` 里「图片」输出只允许连到生成节点/LLM/循环/ComfyUI/素材合集/图集，两个都带图的图片节点之间会被拒绝（这也是超清、扩图、换角度结果在真实库里同样没有连线的原因）。
2. **不是生成节点**：`addCanvasImage()` 建的是素材图片节点（`resolveCanvasNodeKind` → `upload`，标题带「图片 / 上传 · 承接」），而用户画布里的生产环节全是「图片生成」节点。
3. **名字来自后端文件名**：`openCanvasCutoutWorkbench()` 传的名字已经带「-抠图」，服务端 `background-removal-http-api.js` 又追加一次「-抠图.png」，节点名再取 `result.filename`，所以出现「…-抠图-抠图_1791792620039_49c42b2f.png」这种带时间戳的名字。

## 三、改动（`design-sources/script-before-save-bridge.js`）

- `placeCanvasCutoutResult()` 改为：`addCanvasImageGeneratorNode()` 建图片生成节点 → `connectCanvasNodes(原图, 结果节点, "input", "output")` → `updateCanvasGenerationResult()` 把抠好的图写成它的结果 → `FloraGenerationHistory.add()` 记进节点历史（历史徽标显示 1，后续再生成不会丢掉抠好的图）。连线必须在写结果之前，生成节点一旦带上图片就不再接收图片参考。
- 节点名取 `appendNameSuffix(原图名, "抠图")`（例如「原图.png」→「原图-抠图.png」），不再用后端保存的文件名；结果写入和写历史都会把名字改成「生成结果」，所以在最后统一换回并 `syncLabel()`。
- 结果节点单独选中（`selectCanvasNode`），和其它图片工具一致，用户可以直接在节点下方操作区接着生成。
- `openCanvasCutoutWorkbench()` 与 Agent 路径传给 `/api/background-removal/apply` 的名字改为原图名（不带「-抠图」），服务端只追加一次后缀，保存的文件名与节点名一致。

## 四、验证

- 新增 `canvas-cutout-result-regression.cjs`（真实浏览器 + API 桩）：断言结果是 `canvas-node-generator`（类型 `generator`，标题「抠图来源-抠图.png」）、节点名不含「抠图-抠图」也含时间戳、`canvasState.connections` 有原图→结果且端口 `output/input`、`#canvasConnections` 里真的画出这条线（命中路径 `data-connection-from/to` 与两端 id 一致）、结果是当前结果且历史 1 条（徽标「1」）、原图作为生成参考（`getCanvasIncomingItems` 1 条）、结果单独选中且操作区显示在节点下方；1440 与 390 两个宽度各出一张截图，390 下操作区完整落在视口内且无横向溢出。
- **红绿验证**：部署前先对旧运行时跑同一用例，第一条断言前就超时（旧代码根本没有 `.canvas-node-result`，因为它是素材图片节点），确认用例能捕获这次缺陷。
- 部署后复跑：`canvas-cutout-result-regression.cjs`、`image-toolbar-cutout-crop-regression.cjs`、`material-image-regression.cjs`、`canvas-crop-output-regression.cjs`（9 张切片 512×341/512×342 逐像素）全部通过；`acceptance.cjs` 48 图 `errors=[]`、`overflow=[]`。
- `npm run build` 成功，`node deploy.mjs` 备份并通过 deploy.mjs 部署，备份 `.design/deploy-backups/2026-10-12T08-30-02-092Z`；未停止 3199（serverPid=10368），未改用户真实画布（只读打开 canvas.db）。

## 五、边界

- 抠图本身仍走本地 ONNX 模型，本次没有重新跑真实抠图，只验证结果落节点这一段的节点类型、连线、命名、历史与选中行为；真实抠图质量与首次模型加载仍需用户会话验证。
- 超清 / 扩图 / 换角度 / 裁剪的单个结果仍是素材图片节点，也因此没有回原图的连线（同样的兼容规则限制）。本次只按用户反馈改抠图；如果这些工具也要显示来源关系，需要单独确认后统一处理。
- 本次 `node deploy.mjs` 部署的是 `design-sources` 的当前状态，除本次改动外还顺带把上一轮留在源码里、尚未部署的换角度面板限高/滚动改动带上了运行时（`positionCanvasAngleDialog()` 内 `revealCanvasPanelBelowNode` + `maxHeight`/`overflowY`）。已用部署前备份的旧 `script.js` 复跑 `canvas-angle-dialog-regression.cjs` 对照：两者都在最后一步点「生成」时被 `.canvas-status` 挡住而失败，失败点一致，属该用例的既有失败（上一轮报告已记录），不是本次改动引入。
- 本次没有新增任何 CSS，结果节点与操作区复用图片生成节点/生成操作区/历史徽标的既有样式，因此默认、悬停、选中、焦点、全屏、移动端状态沿用这些组件的既有验收（`generator-composer-regression.cjs` 49 图）；本次另外补了选中态 + 生成操作区可见、以及 390px 窄屏无横向溢出的截图。
- 需要刷新画布页（Ctrl+R）才会加载新脚本。
