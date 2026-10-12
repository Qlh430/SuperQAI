# 裁切图集按内容收缩机身（2026-10-12）

## 一、用户要求

1. 确认裁切用的是原图，而不是缩略图。
2. 裁切图集里单元格下方那块空白不要，要干净简洁。

## 二、原图确认

用户 10:22 重新生成的 9 张切片实测为 512×341 与 512×342，正好是原图 1536×1024 的三等分；修复前的旧文件是 213×142（缩略图坐标空间）。所以现在裁的是原图，分辨率也不再被缩略图上限压住。

## 三、空白来源

图集是 Flora 壳体节点。壳体把机身固定成 400×400（`Stage 1 fixed geometry` 段），而 3×3 单元格只需要约 277px；底部状态行（「已收纳 9 张图片」）用 `position: absolute; bottom` 钉在机身底部，于是单元格与状态行之间留下 109px 空白。实测（壳体内坐标）：

| 项目 | 数值 |
| --- | --- |
| 机身（壳体）高度 | 400 |
| 内容区上留白 / 内容区高度 | 8 / 384 |
| 单元格区域 | 277（= 16 + 245 + 16） |
| 底部状态行 | 高 13.75，距机身底 8 |
| 单元格底部 / 状态行顶部 | 269 / 378（空白 109px） |

## 四、改动

- `design-sources/flora-node-shell.js`
  - 新增 `syncGallerySurfaceHeight()`：按「内容区上留白 + 单元格区域 + 底部状态行占用」算出机身高度，只在比标准 400 矮时收缩，并写入 `--flora-node-height`、`data-flora-gallery-height`、`data-flora-fit-content`。空图集不收缩。
  - `mirrorState()` 与 `syncLiveState()` 各调用一次，渲染、内容变化与状态同步后都会重新核对。
  - `buildShell()` 对图集沿用上次高度，避免每次重建壳体先回到 400 再收缩。
- `design-sources/flora-node-shell.css`
  - 新增 `[data-flora-fit-content="true"]` 的机身与壳体高度规则，沿用项目里 `data-flora-adaptive-media` 的同一写法。

收缩后：机身 307，节点总高 355（标题带 48 + 307），单元格底部到状态行 16px，底部留白 8px。

## 五、验证

新增 `canvas-gallery-fit-content-regression.cjs`：真实跑 3×3 宫格裁切后断言图集启用收缩、机身比 400 矮、机身高度等于「上留白 + 单元格区域 + 状态行」、单元格与状态行间距在 8–32px 之间、节点总高等于标题带加机身，并断言图片节点不受这条规则影响。改动前该用例失败（「图集应启用按内容收缩」），改动后通过；部署后在运行时脚本上复测同样通过。

`npm run build`、`node deploy.mjs`（备份 `2026-10-12T02-34-44-835Z`）通过；`acceptance.cjs` 48 图、`errors=[]`、`overflow=[]`；裁切输出、图集删除、素材图片与预览浮层回归通过。

## 六、已知与边界

- `flora-toolbar-regression.cjs` 在 390px 宽度、asset-collection 样例上报「标题间距错误」（缩放 0.17 时工具栏未按 `--collab-inverse-scale` 反向缩放）。用改动前的壳体文件跑同一用例得到完全相同的数值（gap 2.04 / barHeight 7.48），确认是既有问题，与本次改动无关，本次未处理。
- 素材合集（asset-collection）仍是标准 400 机身，本次只按用户要求调整裁切图集；如需一并收缩，可复用同一套逻辑。
- 业务接口为模拟，真实登录会话下的生成与持久化仍需用户验收。工作台需刷新（Ctrl+R）加载新脚本与样式。

## 七、补充：用户机器上仍有空白区（同日第二轮）

用户复核后反馈裁切图集下面**仍有**空白区。只读查了用户画布数据库（`data/canvas.db`）：唯一的 `gallery-container` 节点保存为 408×376、9 张 512×341/342 切片、`layoutMode: default`，参数完全正常。问题出在收缩逻辑判断太窄：

1. 只在 `.flora-node-body-surface` 里找单元格，找不到就整段 `return false`——单元格换一层包裹就永远不收缩；
2. 用内容块的 `offsetHeight / scrollHeight` 量内容高度。内容块被拉伸填满时这两个值都等于被撑满的高度，算出来 ≥ 400，代码判定“比标准机身还高”，直接放弃收缩，节点停在 400 机身，单元格下方就留着空白。

改法（`design-sources/flora-node-shell.js`）：

- 单元格在**节点范围内**查找，不再要求它位于 body surface 内；内容块用 `members.closest(".flora-node-body-surface")`，取不到就直接用单元格区域。
- 高度改为「壳体到内容块的顶部偏移 + 内容块到单元格的偏移 + 最底部单元格底边减单元格顶部（真实占用行高）+ 16px 呼吸距离 + 状态行自身高度与下边距」，完全不再读会被拉伸的 `offsetHeight / scrollHeight`。
- `renderCanvasGalleryContainerNode()` 渲染后在 `requestAnimationFrame` 与 300ms 各再核对一次，避免单元格晚一帧落位时漏掉。

`canvas-gallery-fit-content-regression.cjs` 扩到三个健壮性场景并全部通过：重新挂载壳体后保持收缩、用内联 `!important` 把内容块强撑到 384 后仍收缩（旧算法正是在这里放弃收缩）、把单元格移到另一层包裹后仍收缩；1440 与 1920 两种宽度下机身都是 307、单元格到状态行 16px。同轮换角度、节点层级、图集删除、裁切输出、工具栏标签回归与 `acceptance.cjs` 48 图（`errors=[]`、`overflow=[]`）全部通过。
