# 组的外壳收干净 + 组端口与普通节点同形 + 整组作为参考素材（2026-10-12）

## 用户要求

1. 图 1 红框里那块遮挡区域不要有：只要干净的组框和组框上方的工具栏，不要有其他的，也不要有右上角的叉叉，有解组按钮就行。
2. 图 2 组右边的连接点跟别的节点连接点保持统一样式。
3. 连接组的连接点到别的节点时，整组作为素材参考。

## 探针实测（改动前，部署态）

用 Playwright 在 3199 上建两层图片节点打成组，量到：

- 组框 `::before` 的 `inset` 是 `48px 0 0 0`，组顶那条 48px 里没有组框，只有组框 `box-shadow` 渗出来的暗色。
- 组标题栏里挂着 `.canvas-node-delete`（`<button ...>×</button>`），选中组时右上角另有 `.flora-node-tag` 的标签控件（`state.chrome.hidden = !label && !selected`，选中即出现）。
- 组端口 `16×16`、`border-radius: 8px`、底色纯主色、`right: -10px`；普通节点的端口是 `28×28`、`border-radius: 50%`、`2px` 描边、画布底色、`right: -42px`。
- 整组参考的链路本来就在：`getCanvasNodeOutput(group)` 返回 `type: "group"` 带全部图片，`getCanvasIncomingItems()` 摊平成逐张图片素材。

像素扫描（x = 组框左边 + 200，从组框上沿往下每 4px 一采样）：

| 纵向位置 | 改动前 | 改动后 |
| --- | --- | --- |
| +2 ~ +40 | `22,25,29` → `24,26,30`（比框内空隙暗） | `25,27,31`（与框内空隙一致） |
| +48 以下 | `25,27,31` | `25,27,31` |
| 组框外画布 | `8,10,14` | `8,10,14` |

隔离实验（给组框涂不透明红 / 隐藏标题栏 / 隐藏组框）定位到元凶：组顶那条带的暗色来自**标题栏遗留的 `backdrop-filter: blur(16px)`**——组框从顶边开始画之后，这层模糊会把框外的暗色抹进组顶；把标题栏 `display: none` 或去掉组框阴影都会让那条带变干净，而只去掉模糊同样干净。

## 改动

`neon-workbench/design-sources/neon-canvas-surface.css`

- 组框 `::before { inset: 0 }`：组里只剩一层框，顶部不再留标题带。
- 组标题栏：`align-items: center`、`padding: 0 18px`、`backdrop-filter: none !important`（含 `-webkit-`），标题 13px/500/次色。
- `.canvas-node-group > .canvas-node-bar .canvas-node-delete { display: none !important }`：兜住删除叉。
- `.canvas-node-group > .flora-node-tag { display: none !important }`：组上不挂标签控件。
- 成员数标签 `right: 18px`（删除叉没了，不用再让位）。
- 组端口补上普通节点那一套外形：28px 空心圆、2px 描边、画布底色、圆心加号、`right: -42px`、`top: 50%`、`transform: translateY(-50%) scale(var(--collab-inverse-scale))`、`z-index: 30`；悬停/聚焦时描边与图标转前景色。显隐沿用引擎的「未选中安静隐藏、选中或悬停出现」。

`neon-workbench/design-sources/script-before-save-bridge.js`

- `renderCanvasGroupNode()` 建完标题栏就 `removeButton?.remove()`。
- 组名默认值由 `GROUP` 改为 `图片组`（默认参数、`createCanvasGroupFromSelection()`、Agent 打组、场景打组四处同步）。

## 验证

新增 `canvas-group-chrome-regression.cjs`（1728×1400，真拖动、真像素）：

1. 组里没有 `.canvas-node-delete`，组上没有端口/缩放手柄以外的按钮；标题栏纯文本、无底色、无描边、无阴影；组只有端口、标题、成员数、缩放手柄、工具栏五样；未选中态组框仍是白透明（`#fff 7%` 底 + `#fff 22%` 描边）且 `inset: 0`。
2. 组顶那条带左右两点与框内空隙逐像素同色（通道差 ≤ 6），且比画布底色亮但不超过 24 个色阶（是一条淡白框，不是暗色遮挡也不是亮卡片）。
3. 组端口与成员节点端口的宽高（28）、描边（2px）、圆角（50%）、底色、图标色逐项一致；在组框右边同一间距（`right: -42px`）、垂直居中且中心在框外；未选中并等过渡走完后 `opacity: 0`、`visibility: hidden`。
4. 工具栏在组框上方且不压住组框、水平居中（残差 ≤ 4px），只有颜色 / 布局 / 解组（色点按钮无文字）。
5. 用真实鼠标从组端口拖到图片生成节点的输入端口：`canvasState.connections` 出现该连接，`getCanvasNodeOutput(group)` 是 `type:"group"` 两张，目标节点 `getCanvasIncomingRefs()` 拿到两张图片名，参考带渲染出 2 个缩略图。
6. 点「解组」拆掉组框、成员保持选中、原来从组出去的连线一并清掉。

截图：`acceptance/group-chrome-1728.png`、`acceptance/group-chrome-detail-1728.png`、`acceptance/group-as-reference-1728.png`。

部署（`npm run build` + `node deploy.mjs`，备份 `.design/deploy-backups/2026-10-12T10-16-59-562Z`）后复跑：

- `canvas-group-chrome-regression.cjs` 通过。
- `canvas-group-frame-menu-regression.cjs`（框选工具条、色板、布局与撤销、端口、保存恢复）通过。
- `canvas-group-frame-stacking-regression.cjs`（组内像素 delta = 0）通过。
- `canvas-node-stacking-regression.cjs` 通过。
- `canvas-crop-output-regression.cjs`（9 张切片逐像素）通过。
- `canvas-cutout-result-regression.cjs` 通过。
- `acceptance.cjs`：48 张截图，`errors: []`、`overflow: []`，项目创建、回收站、素材、模拟生图、模拟对话、返回概览、移动导航等交互流程均已执行。

## 边界

- 未停止 3199 的服务，未改动真实用户画布；工作台需 Ctrl+R 才会加载新资源。
- `canvas-gallery-delete-regression.cjs` 等不到 `#canvasPlane .canvas-node-gallery-container`：用未改动的部署态复跑同样超时，是这条用例自己的夹具问题，与本次改动无关。
- 组未选中时仍只有标题栏/缩放手柄/端口可点（遗留 `styles.css` 行为）；成员被拖进组的内边距时仍会盖住组框边框，这是「组是地板、成员在上层」的预期代价。
- 本轮验证走的是隔离模拟接口与自建画布夹具，真实登录会话下的业务验收仍需在用户自己的会话里做。
