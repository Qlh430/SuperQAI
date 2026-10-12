# 扩图：扩区直接画在原图周围（2026-10-12）

## 一、用户要求

> 图1扩图参考图2那样在原节点图周围直接扩区范围选择，跟下面的操作栏。

即：扩图时的扩展范围要像参考图那样贴着原图画出外框（原图在框内，扩出的部分用棋盘格表示），下面跟一条操作栏。

## 二、改动前的问题（实测）

在 1440 视口下打开图片节点的扩图，量到：

- 舞台 `[data-inline-outpaint-stage]` 铺满节点内容区（600×347），并且**棋盘格背景铺在整个舞台上**；
- 扩图外框 `[data-inline-outpaint-frame]` 只有 568×300，落在舞台中间，边框 1px、无圆角、无底色；
- 尺寸读数 `[data-inline-outpaint-size]` 绝对定位在舞台底部（592..715 × 681..705），**压在图片下沿上**；
- 操作栏在舞台下方（715..768），本身不重叠。

也就是说：棋盘格铺满整块舞台，看上去「扩区」等于整个节点，而真正会被扩出来的那一小块（外框）反而看不出来；读数又挡住了图。

## 三、改动

`design-sources/flora-node-shell.css`

- `.canvas-inline-outpaint-stage`：去掉棋盘格，背景改透明（只保留 16px 内边距，给把手留抓取空间）。
- `.canvas-inline-outpaint-frame`：棋盘格移到外框上，并加 `border-radius: 8px`。现在看到的外框就是「原图 + 扩出区域」，扩区范围直接贴着原图画出来。
- `.canvas-inline-outpaint-size`：去掉绝对定位与深色胶囊底，改成操作栏里的普通读数（跟随提示文字，排在「执行」之前）。

`design-sources/script-before-save-bridge.js`

- 扩图弹窗模板里把尺寸读数从舞台挪进操作栏（`✕ 拖动外框进行扩图 · 1936 × 1024 · 扩图 · 执行`），数据属性不变，原有渲染逻辑无需改动。

交互没变：八个把手（四角 + 四边中点）仍然拖动改 `comfyOutpaint` 的上下左右边距，「执行」仍走原来的 `runCanvasImageTool(node, "outpaint")`。

## 四、验证

- 临时探针（已删除）：舞台背景为透明、外框背景为棋盘格且圆角 8px、读数落在操作栏内（734..750，操作栏 715..768）、8 个把手仍在外框四角与四边中点、操作栏在舞台下方不重叠、无 pageerror。
- `canvas-inline-image-tools-regression.cjs`（源码态）：扩图 8 个把手、提示文案、尺寸读数含「扩图」、拖右边距 200→408、提交请求体 `{direction: custom, alphaMaskInput: true, left:200, top:0, right:408, bottom:0}`，以及裁剪的全部断言都通过。
- `acceptance.cjs`：部署后 48 图，`errors=[]`、`overflow=[]`。

部署：`npm run build` + `node deploy.mjs`。未停止 3199、未改真实画布数据。

## 五、边界

- 只改扩图这一层的呈现，没动参数模型、提交接口与结果节点行为。
- 参考图里的缩放倍数、比例快选与提示词输入属于那套产品的扩图面板；本应用沿用自己操作栏（取消 / 拖动提示 / 尺寸 / 执行），没有照搬。

## 六、补充修复：画布缩放不为 1 时「多出一张图」+ 外框压住操作栏（同日）

用户反馈「这扩图怎么出现多张图。原图节点不动，周围出现扩区，很难理解吗」——截图里扩区有一条半透明的香蕉，操作栏也被棋盘格盖住。用画布缩放 1.25 的夹具复现，量到两处独立问题：

1. **尺寸单位混用**：`layoutCanvasInlineOutpaint()` 用 `stage.getBoundingClientRect()`（屏幕像素）算可用空间，却把结果写回节点的本地像素样式。画布缩放 s 时外框整体放大 s 倍，于是压过操作栏、多出的部分盖在操作栏文字上（截图里操作栏看着透明、文字发灰就是这个）。修复：先按 `box.width / stage.offsetWidth` 求出画布缩放，把屏幕尺寸换算成本地尺寸再算 `innerWidth/innerHeight`。实测 1.25 下 `fitsInStage`、`clearsBar` 均从 false 变 true。
2. **节点自己的图片透出来**：扩区一定有边距，外框里那张原图必然比节点原图小；节点自己那张仍在原位显示，透过半透明棋盘格就是那条「第二张香蕉」。修复：打开扩图时给节点加 `is-inline-outpainting`，用和裁剪相同的规则把节点原图 `visibility: hidden`，关闭时移除。实测 `nodeImageHidden: true`。

验证：1.25 与 1.0 两档夹具下外框都在舞台内、不压操作栏、节点原图隐藏、无 pageerror；`canvas-inline-image-tools-regression.cjs` 与 `acceptance.cjs`（48 图、`errors=[]`、`overflow=[]`）部署后通过。

## 七、再去掉节点绿框、操作条改成浮在节点下方（同日）

用户要求「图1不要出现外面的绿框，参考图2下面只有一个操作栏就行」。

- **操作条从节点内挪到节点下方**：`.canvas-inline-outpaint` 去掉 flex 列布局与 `overflow: hidden`，舞台改成 `position: absolute; inset: 0` 铺满节点；操作条改成 `top: calc(100% + 12px)` 的圆角浮动条（与裁剪操作条同一套），于是它落在节点框外，不再被节点框住。实测 `barBelowNode: true`。
- **扩图期间不显示节点选中绿框**：绿框其实有两层——节点自身的 `box-shadow`，以及 Flora 壳体 `:is(.is-selected…) .flora-node-shell::after` 的内描边。前者用 `.canvas-node.is-inline-outpainting` 关掉；后者在该选择器上加 `:not(.is-inline-outpainting)` 排除。实测 `nodeShadow: none`，截图里节点四周已无绿框。

验证：画布缩放 1.25 下 `fitsInStage`、`frameClearsBar`、`barBelowNode`、`nodeImageHidden` 全为 true、无 pageerror；`canvas-inline-image-tools-regression.cjs` 与 `acceptance.cjs`（48 图、`errors=[]`、`overflow=[]`）部署后通过。

## 八、扩图操作栏加比例快选（同日）

用户要求「给扩图操作栏加上比例选择」，参考条为：原比例 / 21:9 / 16:9 / 4:3 / 1:1 / 3:4 / 9:16，每项带一个按比例画的小方块。

- 新增 `CANVAS_INLINE_OUTPAINT_RATIOS` 与 `buildCanvasInlineOutpaintRatioStrip()`：七个按钮，小方块宽度按比例算（长条/竖条一眼可辨），选中项用主色高亮。
- `setCanvasInlineOutpaintRatio(node, key)`：把扩图量补到目标比例——原图居中，按需要扩展左右或上下并平分；原比例 = 不强制（保持手动边距）。结果写回 `comfyOutpaint*` 边距数据，提交请求体不变（仍是 `left/top/right/bottom` + `alphaMaskInput`），所以服务端无需改动。
- `lockCanvasOutpaintPaddingToRatio()`：选了比例以后再拖把手时，改一条边就按比例回算另一轴，总比例不漂（与裁剪的比例锁一致）。
- 操作栏 `width: max-content`：绝对定位元素的收缩宽度会被节点内容盒（约 600）限制，导致七个比例块折成三行；改成 max-content 后单行铺开，窄屏仍会自动换行。

验证（画布缩放 1.25）：默认原比例 ratio 1.891；点 1:1 后 ratio 1.000、读数变 1536 × 1536；点 21:9 后 ratio 2.328（21/9 = 2.333，受每边 8px 取整影响）、读数 2384 × 1024；锁定 21:9 再拖上把手后 ratio 仍为 2.331；操作栏始终在窗口内、无 pageerror。`canvas-inline-image-tools-regression.cjs` 与 `acceptance.cjs`（48 图、errors=[]、overflow=[]）部署后通过。

过程中修掉一处自己引入的缺陷：`const lockedRatio` 第一次被补丁插到了旧版 ComfyUI 扩图拖拽函数里（两处变量名相同），导致内联扩图拖动时抛 `lockedRatio is not defined`、把手失效；已挪回 `startCanvasInlineOutpaintDrag()`，实测拖动恢复正常。

## 九、原比例改成真的会外扩（同日）

用户反馈「选择原比例没反应，原比例就要上下左右都按比例外扩一点」。之前原比例只是把按钮标成选中、边距原样保留，所以点了看不出变化。

- 原比例现在的语义是「四边按同一比例外扩」：每条边取该边长的 6.25%（`CANVAS_INLINE_OUTPAINT_SOURCE_SCALE`），总尺寸比原图大 12.5%，宽高比例与原图一致。1536 × 1024 的原图点原比例后是 96 / 96 / 64 / 64，读数 1728 × 1152，比例 1.5 与原图相同。
- 从没设过扩图边距的节点，打开扩图时直接按原比例开（`node.dataset.comfyOutpaintLeft === undefined` 时应用该预设），这样按钮高亮与实际边距一致；已经手动调过边距的节点保留自己的值，不会被重开清掉。
- 原比例仍然不锁拖动（`getCanvasInlineOutpaintRatio` 返回 null，`lockCanvasOutpaintPaddingToRatio` 不生效），其它比例继续锁定拖动。

验证（画布缩放 1.25）：新节点打开即原比例、边距 96/96/64/64、读数 1728 × 1152、ratio 1.5；点 9:16 后 1536 × 2736、ratio 0.561；再点回原比例恢复 1728 × 1152、ratio 1.5，无 pageerror。`canvas-inline-image-tools-regression.cjs` 与 `acceptance.cjs`（48 图、errors=[]、overflow=[]）部署后通过。

## 十、底部扩区「拉不上去」的排查（同日）

用户问「什么原因下面的扩区拉不上去」。用夹具逐项验证：

- 复现「下面扩得多」的节点（left/right 200、bottom 400），画布缩放 1.25 与 0.6 两档下：外框都在舞台内（`frameFitsStage: true`），八个方块把手中心 `elementFromPoint` 各自命中自己，把底部把手往上拖 80px 后 `bottom` 从 400 变 152 —— 这条路径本身是通的。
- 但确实存在会让人拖不动的情况，做了两处修复：
  1. **只认 14px 方块把手**：用户更习惯抓外框边线，抓线不触发任何拖动（也没有光标提示）。现在外框四条边各有一条 14px 透明拖动带（`data-inline-outpaint-edge`，`ns-resize`/`ew-resize` 光标），抓边线同样改边距；实测底边中心命中 `bottom`、往上拖 60px 后 `bottom` 152 → 0。方块把手仍是 8 个，回归断言不受影响。
  2. **外框尺寸只在打开时算一次**：节点被改尺寸（或媒体尺寸晚到）后外框会超出舞台，底部把手被挤出节点就抓不到了。现在给舞台挂 `ResizeObserver` + 窗口 `resize`，一变就重算；实测把节点改成 320×210 后外框重新贴合（`frameFitsStage: true`）、底部把手中心仍命中自己。

`canvas-inline-image-tools-regression.cjs` 与 `acceptance.cjs`（48 图、errors=[]、overflow=[]）部署后通过。
