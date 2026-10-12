# 内联裁剪：去掉「仅裁剪（不切分）」、宫格分线可以拖（2026-10-12）

## 一、用户要求

> 图1 仅裁剪（不切分）为什么还要分割线，去掉这个仅裁剪（不切分）。而且分割线还拖动不了，分割线要能拖动。加个图2的自定义宫格裁剪，打开如图3

拆成三件事：① 默认（不切分）状态下图上不该有分割线，菜单里也不要「仅裁剪（不切分）」这一项；② 图上的分割线要能拖动；③ 宫格菜单里要有「自定义宫格裁剪」，点开是「行 × 列 + 确认」的面板。

## 二、改动前的问题

- 默认状态（`rows = 0`）下 `renderCanvasInlineCropFrame()` 用 `repeating-linear-gradient` 画了 3 × 3 三分参考线，看着像已经切好了；菜单里还并列着「仅裁剪（不切分）」，自相矛盾。
- 那条三分线是 `[data-crop-guides]` 背景纹，`pointer-events: none`，怎么拖都拖不动；真正能拖的 4 条裁剪线在全图状态下正好压在图片边缘，1px 细线看不见也抓不稳。
- 宫格菜单有 6 项（含「仅裁剪」），`max-height: 280px` 装不下，要滚动才能看到「自定义宫格裁剪」。

## 三、改动

### `design-sources/script-before-save-bridge.js`

- `CANVAS_INLINE_CROP_GRIDS` 删掉 `[0, 0, "仅裁剪（不切分）", "整块输出一张"]`，菜单只剩 4 / 9 / 16 / 25 宫格与「自定义宫格裁剪」。
- 新增 `canvasInlineCropIsSplit()`、`resetCanvasInlineCropSplits()`、`canvasInlineCropColumnSplits/RowSplits()`、`canvasInlineCropSplitsAreEqual()`：宫格分线记成 `columnSplits` / `rowSplits`（相对裁剪框的 0~1 位置），选宫格或自定义行 × 列时按等分重置。
- 新增 `renderCanvasInlineCropSplits()`：宫格分线改成**真实 `<i data-crop-split>` 元素**（`col:N` / `row:N`），不再用背景渐变，所以每条线都能单独拖。
- `startCanvasInlineCropDrag()` 新增 `mode === "split"`：拖动分线改 `columnSplits` / `rowSplits`，在相邻分线之间夹取（最小间距 5%）。位移先换算成框内比例（`dx / start.width`），并且**以按下时的基准值为准**——第一版写成在当前值上累加，10 步移动被叠加了约 5.5 倍（实测拖到 30% 却停在 14.6%），已修正为 29.9%。
- `buildCanvasInlineCropTiles()` 改用分线位置算边界：`columnBounds = [0, ...columnSplits, 1]`，分线拖到哪就从哪里切。
- 尺寸读数：等分时给「每格 宽 × 高」，分线自定义时给「分线自定义」；默认整块仍是「宽 × 高 · 裁剪」。
- 菜单里再点一次已经选中的宫格 = 回到不切分（整块裁一张），给用户留了退路。
- 自定义面板的行 / 列默认值：当前不是宫格时给 3 × 3，不再渲染成非法的 0。

### `design-sources/flora-node-shell.css`

- 删掉 `.canvas-inline-crop-guides`。
- `.canvas-inline-crop-line` / `.canvas-inline-crop-split` 共用一套线样式，并加 `::before` 中点方块把手（尺寸按 `--crop-inv-zoom` 回补，任何缩放下视觉大小一致）；`::after` 命中带整条留在裁剪框内，贴边时不再被节点裁掉一半。
- 菜单改挂在操作条里、从操作条**上方**展开（`bottom: calc(100% + 10px)`、宽 300px、行高压缩），5 项不用滚动就能看全，也不会再盖住操作条。
- 操作条自身的按钮规则收窄成 `.canvas-inline-crop-bar > button`：菜单挂进操作条后，原来的 `.canvas-inline-crop-bar button` 会把 `justify-content: center` 与 `height: 32px` 一起套到菜单项上，把菜单挤成一列错行的窄条（截图复现），收窄后恢复。
- 自定义面板的浅色「确认」按钮补一条 hover/focus 覆盖，避免被菜单项通用 hover 底色刷成绿色。

## 四、验证（`canvas-inline-image-tools-regression.cjs`）

- 打开裁剪：4 条裁剪线、**0 条分线**（默认整块不该有分割线）、裁剪层与节点图片 `dx/dy/dw/dh` 全为 0、无遮罩、无底色无边框。
- 宫格菜单：恰好 `['4 宫格裁剪','9 宫格裁剪','16 宫格裁剪','25 宫格裁剪','自定义宫格裁剪']`。
- 选 9 宫格：出现 4 条分线，位置 `33.3333% / 66.6667%`，读数 `3 × 3 · 每格 512 × 341`，按钮变 `9 宫格裁剪`；分线中心 `elementFromPoint` 命中 `col:0`。
- 把第一条竖分线拖到 30%：`left = 29.9193%`，读数变 `3 × 3 · 分线自定义`；确认后上传 9 张，**第一列宽 460px ≈ 1536 × 30%**，三列相加正好等于原图宽 1536。
- 自定义宫格面板：默认值 `3 / 3`、提示「请选择裁剪宫格（行 × 列）」；填 2 × 3 后仍输出 6 张、命名与宽高合计正确。
- 生成节点上：裁剪层贴合结果图、操作条与确认按钮可点、操作区让位并在取消后恢复。

其余门禁：`canvas-crop-output`、`canvas-gallery-fit-content`（9 格 512×341 不变）、`canvas-gallery-delete`、`canvas-image-tool-panel`、`image-toolbar-cutout-crop`、`canvas-node-toolbar-labels`、`connection-magnet` 与 `acceptance.cjs` 48 图（`errors=[]`、`overflow=[]`）在源码与部署后运行时各跑一轮全部通过。

截图：`acceptance/inline-crop-split-drag-1440.png`（分线拖到 30%）、`acceptance/inline-crop-grid-menu-1440.png`（5 项宫格菜单）、`acceptance/inline-crop-grid-1440.png`（2×3 自定义宫格）。

部署：`npm run build` + `node deploy.mjs`，备份 `.design/deploy-backups/2026-10-12T06-25-56-149Z`。未停止 3199、未改真实画布数据。

## 五、边界

- 分线拖到相邻分线 5% 以内会被挡住，避免出现零宽切片。
- 「仅裁剪（不切分）」从菜单移除后，回到整块裁剪的方式是：再点一次已选中的宫格项，或直接取消重开（默认就是整块）。
- 真实登录后的出图与画布数据仍需用户在已有会话里做最终业务验收；Better Design MCP 未连接，本报告不含其动态审查结果。
