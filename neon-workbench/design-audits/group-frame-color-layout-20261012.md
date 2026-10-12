# 组框白透明 · 颜色/布局可用 · 框选工具条 · 组连接点（2026-10-12）

## 一、用户要求

1. 组框要能看见，像参考图那样**白色透明**。
2. 组工具栏里的**背景颜色要能选**（参考图那种竖排色板）。
3. **布局要真实可用**。
4. 鼠标框选节点后，工具栏里**只有打组和布局**；只选布局就只按布局排列、**不打组**；只有选打组才真正打组。
5. 组的**右边要有连接点**。
6. 补充确认：不做「整组执行」「创建工作流」；不加 8 个缩放手柄；颜色只保留参考图里的那几种；布局保持宫格 / 水平 / 垂直三个。

## 二、探针实测（改动前）

| 项目 | 实测 | 根因 |
| --- | --- | --- |
| 组框 | 底色 `color(srgb 0.058 0.069 0.090 / 0.42)`（深色卡片 42%）、边框 9% 白 | 沿用节点骨架的卡片色 |
| 颜色菜单 | 6 个按钮各 26×26，但里面每个 `.canvas-group-swatch` 是 **0×0、透明** → 菜单看起来是个空盒子 | 色点样式写在 `#canvasEditorScreen` 作用域里，而菜单挂在 `body` 上 |
| 颜色持久化 | `serializeCanvasNode` 的 group 分支只有 `groupTitle / groupMembers / groupImages` → 颜色刷新即丢 | 序列化缺字段 |
| 布局 | 菜单三项正常，`layoutCanvasGroupMembers(group,"vertical")` 实测真的会移动成员 → **组内布局本来可用**；但没有撤销记录，也不落库 | 只挂在组工具栏上，且没有撤销/持久化 |
| 框选工具条 | 只有「打组」一个按钮（`data-selection-action="group"`） | 没有布局入口 |
| 组连接点 | 组的 output 端口实测在**左边**（组左边 218，端口 228.7，垂直居中），默认隐藏 | 骨架规则 `#canvasEditorScreen .canvas-node-group > * { position: relative }` 顶掉了 `.canvas-port{position:absolute}`，`.canvas-port-output{right:-12px}` 因此失效 |

## 三、改动

`design-sources/neon-canvas-surface.css`

- 组框改成**白色透明**：底色 `color-mix(#fff 7%, transparent)`、描边 `color-mix(#fff 22%, transparent)`；选了颜色的组用组色混合（`组色 16% + 白 6%`）。
- 颜色面板改成**竖排 8 个色点**，色点样式改成不依赖 `#canvasEditorScreen` 作用域（菜单在 body 上），色点 20×20 圆环 + 22% 同色填充，当前颜色加高亮环；「默认」始终是空心圈。
- 组的输出端口显式恢复 `position: absolute; right: -10px; top: 50%`，挂到组框右边中间。

`design-sources/script-before-save-bridge.js`

- `CANVAS_GROUP_COLORS` 换成参考图色板的 8 项：默认、红 `#ef4444`、橙 `#f97316`、金 `#eab308`、橄榄 `#84cc16`、青 `#14b8a6`、蓝 `#3b82f6`、紫 `#a855f7`。
- 菜单支持两种目标：组的工具栏（`groupMenuTarget=group`）和框选工具条（`=selection`）；菜单位置改为在视口内夹取（竖排色板较高，靠屏幕底部时不会被裁掉）；点锚点按钮可再次收起。
- 序列化 / 恢复补 `groupColor`、`groupLayout`（`renderCanvasGroupNode` 新增 `color`/`layout` 参数，两条恢复路径都传）。
- 新增 `placeCanvasNodesInLayout()`（三种布局共用的排列）、`captureCanvasLayoutSnapshot()`、`recordCanvasLayoutUndo()`；`layoutCanvasGroupMembers()` 改为「排列 + 组框贴合 + 一条撤销记录」，新增 `layoutCanvasSelection(mode)`：**只排列选中的节点、不打组**，起点保持选中范围左上角，间距沿用组内一致的 32px。
- 框选工具条新增「布局」按钮（`data-selection-action="layout"`），与「打组」并列；`aria-expanded` 跟随菜单开合。

## 四、验证

新增 `canvas-group-frame-menu-regression.cjs`（真实浏览器 + API 桩），逐条对齐用户要求：

1. 框选后工具条 `buttons` 恰好是 `['group','layout']`，文案「打组」「布局」，且在选中节点上方。
2. 点「布局」→ 菜单 `groupMenuTarget=selection`、选项 `grid/horizontal/vertical`、完整落在视口内；再点一次收起、再点又打开。
3. 选「水平布局」→ 两个节点同高、顺序右移；**画布里没有出现组**；撤销后位置完全还原。
4. 点「打组」→ 出现 1 个组、2 个成员。
5. 组框 `::before` 底色与描边都是白色低透明（解析色值后校验白度与 alpha）。
6. 组端口 `position: absolute`、`right` 为负、中心贴组框右边缘、垂直居中、选中时可见。
7. 颜色面板：8 项、竖排（x 相同、y 递增）、每个色点 ≥16×16、「默认」空心且为当前项、菜单在视口内；点「红」后 `dataset.groupColor=#ef4444`、组框底色转红、面板把红色标为当前。
8. 组内「垂直布局」→ 成员同一列、组框贴合、`dataset.groupLayout=vertical`、撤销后还原。
9. 保存 → 恢复一轮（`serializeCanvasBoard` + `clearCanvasPlane` + `restoreCanvasBoard`）后颜色与布局仍在，组框底色仍是所选色。

截图：`acceptance/group-selection-toolbar-1440.png`（框选工具条只有打组/布局）、`acceptance/group-frame-default-1440.png`（白色透明组框）、`acceptance/group-color-palette-1440.png`（竖排色板）、`acceptance/group-frame-menu-1440.png`（选了红色的组 + 右侧连接点）。

部署与其它回归：`npm run build` + `node deploy.mjs`（备份 `.design/deploy-backups/2026-10-12T09-08-41-263Z`），部署后复跑 `canvas-group-frame-menu`、`canvas-group-frame-stacking`（组内像素 delta=0）、`canvas-crop-output`（9 张切片逐像素）、`canvas-cutout-result`、`canvas-node-stacking` 通过；`acceptance.cjs` 48 图 `errors=[]`、`overflow=[]`。`canvas-inline-image-tools-regression.cjs` 里裁切打组部分在跳过两条**既有失败**的扩图边距断言后同样通过（见下）。

## 五、边界

- **预先存在的失败**（与本轮无关，已用改动前的部署备份复跑对照）：`canvas-inline-image-tools-regression.cjs` 第 266 行「读数应含左右扩出的宽度」（实测 `1728 × 1152`，期望含 `1936`）与后面的「请求里的右边距应等于界面值」都失败——扩图默认边距语义由运行时模块 `canvas-comfy-rules.js`（不在 deploy.mjs 清单里）决定，实测 padding 为 `left 96 / top 64 / right 288 / bottom 64`。
- 组未选中时仍然只有标题栏 / 缩放手柄 / 端口接收点击（遗留 `styles.css` 的既有行为，本轮未改）；成员的显示层仍在组框之上，成员被拖进组的内边距时会盖住组框边框、标题或计数标签。
- 颜色与布局现在跟着节点走（保存 / 恢复 / 复制），但**不在撤销记录里**：撤销只回退布局造成的位移。颜色是即时生效的样式选择，未纳入 Ctrl+Z。
- 需要刷新画布页（Ctrl+R）才会加载新脚本与样式。
