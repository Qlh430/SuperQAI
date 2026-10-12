# 裁切结果改成打组 + 左键框选 / 中键平移 + 组工具栏（2026-10-12）

## 一、用户要求

1. 「那就不要裁剪合集了，做成打组如图所示。平时鼠标左键按住可以打组，移动画布就只保留鼠标中键」
2. 「用户左键框选节点后出现组的范围，然后上面的工具栏就只有一个打组按钮，按了打组才打组，点击空白处就取消框选打组」
3. 「裁剪后的图就规整的在组里。组的上面工具栏里有颜色选择、布局选择、解组按钮」

## 二、改动

### 1. 裁切结果从「裁切图集」改成「打组」（`script-before-save-bridge.js`）

- 新增 `createCanvasCropResultGroup()`：切片照旧先按原图像素 `persistCanvasGridCrops` 上传，然后每张切片建一个独立图片节点，按裁剪时的行 × 列摆位，最后整体打成一个组。
- 节点尺寸不由我们写死：图片节点是自适应素材节点，宽高要等图片解码后由画布的「短边 400」规则算出来，壳体同步还会再写一次。所以先创建、轮询到尺寸稳定（连续两次不变或最多 1.8s）再排版，否则按临时尺寸摆好、尺寸一变就互相压住（第一版就是这么错的：步距 432 而节点实际 600 宽，三列压在一起）。
- 组的标题是「裁切组」，`data-group-layout="grid"`，成员按行 × 列规整排列。
- 内联裁剪的分割路径改走这个函数；旧裁切工作台仍保留图集路径（`createCanvasCropResultContainer`）。文案改为「已生成 N 张分镜切片并打组」。

### 2. 左键框选、中键平移（`script-before-save-bridge.js`）

- 画布空白处 `pointerdown`：左键 → `clearCanvasSelection()` + `beginCanvasMarquee()`（框选），不再 `beginCanvasPan()`；中键仍由捕获阶段的处理器接管平移。
- `beginCanvasPan()` 只接受中键（`event.button !== 1` 直接返回）。
- 框选沿用既有 `#canvasSelectionBox`：拖动时是选框，松手后变成「组的范围」框，工具条上只有**一个**「打组」按钮，按了才 `createCanvasGroupFromSelection()`；点空白处 `clearCanvasSelection()` 后框一起收起。

### 3. 组上方工具栏（`script-before-save-bridge.js` + `neon-canvas-surface.css`）

- `renderCanvasGroupNode()` 在组标题栏里加三个控件：颜色色块、`布局 ▾`、`解组`（常显，不走「悬停才出现」的标题栏规则）。
- 颜色：6 个预设色 + 默认，写 `data-group-color` 与 `--canvas-group-tint`，组框的边框与底色随之染色。
- 布局：宫格 / 水平 / 垂直，按成员真实尺寸重排并重算组框（`layoutCanvasGroupMembers` + `fitCanvasGroupToMembers`）。
- 解组：`ungroupCanvasNode()` 删掉组框（连同组的连线），成员图片留在原位并选中。
- 菜单挂在 `body` 上（`#canvasGroupMenu`，`position: fixed`，`z-index: 2147483200`）：留在组里会被组自己的不透明组框和成员节点盖住（实测把整组提到 1400 时，组的底色反过来盖住了成员）。

### 4. 上一轮遗留项

- 分割线上的方块把手按用户要求删掉；宫格分线、裁剪框四条边线仍可拖（命中带 16px + 悬停高亮 + resize 光标）。
- 图集单元格间距 16 → 8（`CANVAS_GALLERY_CELL_GAP`，渲染端与布局计算同源）；`syncGallerySurfaceHeight` 增加单元格区域的 ResizeObserver + MutationObserver，解决「单元格异步渲染时量到 0 个就放弃、之后没人再贴合」导致的图集下方空白。

## 三、验证

- `canvas-pan-hit-test-regression.cjs`：左键拖动**不**开启平移闸门且节点仍可命中；中键拖动才开启、释放后恢复。已按新交互改写。
- `canvas-inline-image-tools-regression.cjs`：裁切 9 宫格 / 2×3 宫格后等 `.canvas-node-group`；分割线位置、拖动、逐点像素比对、生成节点让位等 40 余项断言全部通过。
- `canvas-crop-output-regression.cjs`：裁切几何与命名不变，通过。
- `acceptance.cjs`：48 图，`errors=[]`、`overflow=[]`。
- 临时探针（已删除）：左键框选后 `selectedIds=2`、选框可见且工具条只有 `["打组"]`、按钮在框上方；点空白处 `selectedIds=0` 且选框隐藏；打组后组有 2 个成员、工具栏为 `["", "布局", "解组"]` 且常显；布局菜单三项、`elementFromPoint` 命中菜单自身（在成员之上）。

部署：`npm run build` + `node deploy.mjs`。未停止 3199、未改真实画布数据。

## 四、仍待处理

- `canvas-gallery-fit-content-regression.cjs` 与 `canvas-gallery-delete-regression.cjs` 仍通过「裁切」来创建图集，现在这条路产出的是组，需要改成用素材合集等其它路径创建图集节点。
- 组的颜色 / 布局 / 解组还没有正式回归用例；本次只有临时探针证据。
- 真实登录后的出图与画布数据仍需用户会话验收；Better Design MCP 未连接。

## 五、框选可见性、光标与组工具栏位置（同日）

用户要求：左键选择框要明显看得见、框选时不要抓手光标、打完组工具栏要在组框上方正中、组里的切片要能直接看见。

- **选择框可见**：画布里原来用的是 `--color-accent/--color-selected` 令牌，渲染出来近乎透明。现在在 `neon-canvas-surface.css` 里用 `--canvas-neon-primary` 重写：拖拽中 1.5px 虚线 + 7% 主色填充，松手后的选中范围 1.5px 实线 + 10% 填充，另加一圈暗色描边保证在浅色图上也能看清。
- **框选不算平移**：`beginCanvasMarquee()` 给 `#infiniteCanvas` 加 `is-marquee-selecting`，CSS 在该类下把画布及其所有子元素的 cursor 强制成 `default`（原来会继承画布的抓手）；松手时移除。实测框选期间视口光标 `default`、连节点图片上也是 `default`，松手后类被清掉。
- **组工具栏搬到组框上方正中**：`.canvas-group-tools` 从标题栏内联改成 `.canvas-node-group > .canvas-group-tools` 的绝对定位胶囊（`bottom: calc(100% + 10px); left: 50%`），常显。实测工具栏整体在组框上方（`toolsAboveGroup: true`）、横向居中（实测残差 16px，出现在 1936px 宽的裁切组上，视觉不可辨）。
- **组里的切片直接可见**：根因是组在成员之后创建、上板顺序更高，而组框 `::before` 用的是不透明卡片底色，把成员整片盖住，只有点选成员（z-index 提到 1000）才露出来。修法是把组框改成半透明（`color-mix(card 42%, transparent)`，选择器加 `#neonEngineSurface #canvasEditorScreen #canvasPlane` 以压过带 `:not()` 的基础规则）。实测清空选中后，切片中心 `elementFromPoint` 命中的就是切片自己的 `IMG.deferred-image`，组框背景为 `rgba(...,0.42)`。

验证：`canvas-inline-image-tools-regression.cjs` 通过；`acceptance.cjs` 48 图 `errors=[]`、`overflow=[]`。

## 六、抠图面板也搬到节点下方 + 换角度面板固定在下（同日）

用户要求「角度操作界面要在节点的下方，把抠图界面也放在节点的下方」。

- **换角度面板**：去掉上一轮的「放不下就翻到上方」逻辑，改成恒定贴在节点下沿 +12px（CSS 的 `top: calc(100% + 12px)` 是相对节点内容盒算的、比壳体再内缩 8px，用一次量差补偿把它校正到正好 +12）。
- **抠图面板**：`openCanvasCutoutWorkbench()` 里不再把 `.canvas-cutout-modal` 抬到 body 之上，改为 `dockCanvasCutoutModal()` —— 挂进原节点壳体、加 `is-node-anchored`、把 `.canvas-cutout-dialog` 的 `aria-modal` 改成 false；CSS 给出与换角度面板同一套位置规则（`inset: auto; top: calc(100% + 12px); left: 50%; width: min(880px, 92vw)`）。面板本身由运行时模块 `background-removal-ui.js` 生成，只换宿主不改内容。
- **高度**：面板（628 / 560px）比节点高，节点靠下时会超出窗口。改成按「节点下方剩余可视空间」设置 `max-height` 并允许面板内部滚动，底部一排按钮始终能滚到、点到；另外把画布上移一点腾空间，但设了上限（不让节点自己的悬浮工具栏被顶出可视区）。

验证（探针）：两个面板都是 `insideNode: true`、`aria-modal: false`、`belowNode: 12`、不铺满视口；换角度面板被收到 398px、底部 954 < 窗口 1000、生成按钮在 903~939 可见可点。`image-toolbar-cutout-crop-regression.cjs` 已按新宿主改写断言并部署后通过（`cutout: {insideNode: true, className: "canvas-cutout-modal is-node-anchored", modalAttr: "false", belowNode: true, hitInsideModal: true}`）；`acceptance.cjs` 48 图 `errors=[]`、`overflow=[]`。

**未通过**：`canvas-angle-dialog-regression.cjs` 的最后一步（点 `[data-angle-submit]`「生成」）在它自己的窄视口布局里仍然超时——那一步把窗口收到 390px 宽，节点下方根本放不下面板，按钮虽然能通过面板内部滚动到达，但 Playwright 在带画布变换的滚动容器里滚不到它。产品侧位置与可达性在常规窗口下已验证；这条需要改测试（打开面板前先把画布上移，或让面板按窗口高度而不是画布视口高度设上限）。
