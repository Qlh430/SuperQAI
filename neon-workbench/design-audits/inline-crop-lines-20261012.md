# 内联裁剪：去掉多余的框、修好裁剪错位（2026-10-12）

## 一、用户要求

> 不要单独出现格外的框，直接在原图节点上出现分割线跟下面的操作栏，干净简单一些。而且现在的裁剪还有问题。

要求拆成三件事：① 裁剪界面上只留图片上的分割线与节点下方的操作栏，不要额外的框和遮罩；② 裁剪线要真的落在原图上（拖线就等于决定裁哪块）；③ 现在的裁剪结果不对，要找出原因并修好。

## 二、先找问题：三处根因（都有实测证据）

用 Playwright 打开内联裁剪，dump 节点图片、裁剪层、操作条的真实几何（`elementFromPoint` + `getBoundingClientRect`），定位到三处互相独立的缺陷。

### 1. 裁剪层的预览图被旧画布样式改掉了尺寸和 object-fit

裁剪预览是挂在裁剪层里的一张 `<img class="canvas-inline-crop-source">`，样式表里写的是 `width/height: 100%` + `object-fit: fill`。但旧画布 `styles.css` 有一条 `.canvas-node img { width: 100%; height: var(--canvas-node-media-height); object-fit: contain; }`，选择器权重 (0,1,1) 高于 `.canvas-inline-crop-source` 的 (0,1,0)。

实测（原图 1536×1024，节点图片 `contain` 盒子 600×400）：

- 预览图元素盒 600 × **320**，`object-fit` 计算值 **contain**；
- 裁剪坐标区（`[data-crop-view]`）600 × 400。

也就是「线按 600×400 的面板算，图却只占其中 600×320 里居中的 480×320」——线上看到的位置和实际裁的区域根本不是一回事，这是「裁剪还有问题」的主因。

### 2. 裁剪层偏移量按节点算，却作用在裁剪层自己的包含块上

`positionCanvasInlineCropStage()` 用 `(contentRect.top - nodeRect.top)` 求偏移，但 `[data-crop-stage]` 的包含块是 `#canvasInlineCrop`（`inset: 0`，起点在内容区而不是节点顶部）。节点顶部还有 48px 标题带，于是整层被多推下去 48px：实测裁剪层 `y=416`，而节点图片 `y=368`。

另外舞台写了 `padding: 8px` + `place-items: center`，内层 600×400 又被居中溢出 8px，等于二次错位。

### 3. `box-shadow: 0 0 0 9999px` 的遮罩就是那个「格外的框」

`[data-crop-rect]` 用一圈 9999px 的投影把裁剪框以外全部压暗，在节点上画出一个明显的深色矩形（用户截图里左半张变暗的那块）。用户要的是「干净简单」，这条遮罩必须去掉。

### 4. 顺带发现：拖右侧裁剪线会被「连接磁吸」抢走指针

`flora-connection-interaction.js` 会在 `document` 上捕获 `pointerdown`，只要按点落在端口 34px 半径内，就 `stopImmediatePropagation()` 并**对着端口补发一个 `pointerdown`**（`new PointerEvent(...)`），于是「拖裁剪线」变成「拉连线」。

实测日志（按在右裁剪线 x=950，端口在 968..996，中心距 32px < 34px）：

```
pointerdown btn=0 950,568 -> I.canvas-inline-crop-line [right]
pointerdown btn=0 950,568 -> BUTTON.canvas-port canvas-port-output   ← 磁吸补发
pointermove ... -> BUTTON.canvas-port ...（后续指针全被端口接管）
```

裁剪框 `rect` 全程停在 `{x:0,y:0,width:1,height:1}`，读数不变。左裁剪线当时能用，只是因为这种节点只有输出端口，左边没有可磁吸的端口。

### 5. 生成节点上操作条被自己的操作区盖住

生成节点（`data-flora-composer="true"`）在选中时会在节点下方挂出「生成操作区」。实测：裁剪操作条在 687~737，生成操作区在 691~941，完全压住操作条；`elementFromPoint` 命中操作条中心拿到的是 `SECTION.flora-generator-reference-area`，`barHitInside=false`、`confirmHitInside=false`——生成节点上根本点不到「确认」。

## 三、改动

### `design-sources/script-before-save-bridge.js`

- 新增 `getCanvasInlineCropImageRect(node)`：按图片元素盒 + `object-fit` + 原始比例算出**真正可见的图片内容矩形**（contain 取内接、cover 取外接），裁剪线贴的是这个矩形，不再是元素盒。
- `positionCanvasInlineCropStage()` 重写：舞台/视图的 `left/top/width/height` 全部相对 `#canvasInlineCrop` 自己的矩形换算（除以画布缩放），并对 cover 情况把舞台裁到元素盒，避免溢出节点；删除原来按节点算偏移的写法。删掉不再需要的 `layoutCanvasInlineCropView()`。
- 新增 `sampleCanvasInlineCropTone(image)`：把原图缩到 8×8 取平均亮度，写入 `data-crop-tone`。亮图用深色分割线、暗图用浅色线，配深/浅描边，浅色照片上分割线不再消失。
- 参考线颜色改用 `--crop-line-color`，随 tone 变化。

### `design-sources/flora-node-shell.css`

- `.canvas-inline-crop-stage`：去掉 `padding: 8px` / `display: grid` / `place-items: center`，只保留 `position: absolute; overflow: hidden`（负责裁掉缩放后溢出的部分）。
- `.canvas-inline-crop-rect`：删掉 `box-shadow` 遮罩，裁剪框没有任何底色、边框、阴影。
- 新增 `#canvasEditorScreen .canvas-node .canvas-inline-crop-source { width/height/max-*: 100%/none !important; object-fit: fill !important; }`，用更高权重 + `!important` 压过旧画布的 `.canvas-node img`。
- `.canvas-inline-crop-line` 加 `box-shadow: 0 0 0 var(--crop-line-width) var(--crop-line-halo)`（深/浅描边，1px 线在浅色照片上仍然可辨）。
- 新增 `#canvasEditorScreen .canvas-node[data-inline-tool="crop"] .flora-generator-composer { display: none !important; }`：裁剪期间生成操作区让位，退出后（`data-inline-tool` 被移除）CSS 自动恢复，不碰组件状态。

### `design-sources/flora-connection-interaction.js`

- `blocked` 选择器加入 `.canvas-inline-crop, .canvas-inline-outpaint`：按在内联工具操作区里不参与磁吸。
- `nearest()` 跳过带 `data-inline-tool` 节点的端口：正在用内联工具的节点，端口让位给工具拖拽。

## 四、验证

### 几何与像素（`canvas-inline-image-tools-regression.cjs`）

- 裁剪层与节点图片对齐：`dx/dy/dw/dh` 实测全为 0（断言 ≤1.5px）；`[data-crop-rect]` 的 `box-shadow` 为 `none`；裁剪层无底色、无边框。
- 4 条可拖分割线、操作条按钮 `['取消','宫格裁剪','宽高比','确认']`、操作条浮在节点下方。
- 新增 **PNG 逐点比对**（自带 8 位非隔行 PNG 解码 + 384 点抽样）：
  - `1:1` 锁比例 → 输出 1024×1024，与原图居中短边正方形逐点一致；
  - **手拖右/下分割线**到约一半 → 输出 769×513，与原图左上区域逐点一致；同时断言拖线时 `tempConnection`/`pendingConnection` 都为空（磁吸没有抢指针）。
- 宫格：`2 × 3` 自定义 → 6 张切片、命名 `-r01-c01 … -r02-c03`、宽度合计等于原图宽、高度合计等于原图高，生成裁切图集。
- 生成节点：裁剪层与结果图对齐（`dx/dy/dw/dh` ≤0.3px）、操作条中心与确认按钮中心 `elementFromPoint` 都命中操作条内部、裁剪期间操作区宽度为 0、取消后操作区恢复可见且可点。

### 回归

源文件与**部署后运行时**各跑一轮：`canvas-inline-image-tools`、`canvas-crop-output`、`canvas-gallery-fit-content`、`canvas-gallery-delete`、`canvas-image-tool-panel`、`canvas-angle-dialog`、`canvas-node-stacking`、`canvas-node-toolbar-labels`、`image-toolbar-cutout-crop`、`connection-magnet`、`canvas-pan-hit-test`、`canvas-drag-frame`、`canvas-connection-sync`、`canvas-connection-viewport` 全部通过；`acceptance.cjs` 48 图，`errors=[]`、`overflow=[]`。

截图：`acceptance/inline-crop-ratio-1440.png`（1:1 锁比例）、`acceptance/inline-crop-free-1440.png`（手拖出的区域）、`acceptance/inline-crop-grid-1440.png`（2×3 宫格分线）、`acceptance/inline-crop-grid-menu-1440.png`（宫格菜单）。

部署：`npm run build` + `node deploy.mjs`，备份 `.design/deploy-backups/2026-10-12T06-06-06-342Z`（同轮先前一次为 `2026-10-12T06-01-25-237Z`）。未停止 3199 服务、未改真实画布数据。

## 五、边界

- 滚轮只缩放裁剪预览，实测 `canvasState.scale` 不变，画布不跟着动。
- 原图取自节点记录的原图地址（`savedUrl`），裁切仍由 `persistCanvasGridCrops` 按原图像素 `drawImage`，本次沿用未改。
- 真实登录后的服务商出图与画布数据仍需用户在已有会话里做最终业务验收；Better Design MCP 未连接，本报告不含其动态审查结果。

## 六、本轮未修（有证据的预存在失败）

- `generator-composer-regression.cjs` 默认打 `http://127.0.0.1:3188`（该专用测试服务未启动时，第一条「生成节点应有独立下方操作区」就会拿到 0）。改用 `AI_OS_TEST_URL=http://127.0.0.1:3199` 后该条通过，但后面第 270 行 `promptForEngineSwitch` 等「请连接一张图片」超时仍失败；把 `GENERATOR_SOURCE` 指到**本轮改动前**的部署备份（`.design/deploy-backups/2026-10-12T05-55-06-691Z`：`flora-node-shell.css/js`、组合器、参数、`script.js`）同样在 270 行失败——即本轮改动无关，属预存在失败。
