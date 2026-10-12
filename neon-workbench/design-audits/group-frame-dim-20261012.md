# 组里的图被压暗（2026-10-12）

## 一、用户要求

「组里的图怎么是暗的」——截图为「裁切组」，4 张切片在组框里整体发灰，比组外同一张图暗一档。

## 二、定位过程与证据

1. **先看是谁盖住了谁**：组框的底色由 `neon-canvas-surface.css` 里节点骨架的 `.canvas-node-group::before` 画（`background: var(--canvas-neon-card)`，即不透明卡片色）。骨架的 `::before` 对普通节点是"卡片表面"（在内容之下），但组的"内容"是同级的成员节点，不是子元素。
2. **再看上板顺序**：`syncCanvasNodeStacking()` 按 `is-selected` → `data-zOrder` 排序写 `index+2` 的 `z-index`。组在成员之后创建，`zOrder` 更高，因此组的 `z-index` 排在成员之后 → 组框底色画在成员图片上面，整片被压暗。上一轮为了"让切片看得见"把底色改成半透明 `color-mix(card 42%, transparent)`，压暗变成一层 42% 的暗色蒙版。
3. **量化**：新增 `canvas-group-frame-stacking-regression.cjs`，用纯色（120,180,240）图片放进组里截图比色。改动前实测组内渲染为 **(76,111,149)**，与源色每通道差 **91**；组内成员 `z-index = 2`、组框 `z-index = 4`。
4. **顺带发现**：组成员数标签 `.canvas-group-count` 由遗留 `styles.css` 放在 `left:16px / top:54px` 的正文流里（实测是组内 890×22 的整行元素，纵向落在成员区域），组框一旦画到成员下面，这个标签会被成员图片盖住。

## 三、改动

- `design-sources/script-before-save-bridge.js`：`syncCanvasNodeStacking()` 在排完序后调用新增的 `sortCanvasGroupsBelowMembers()`——每个组被移动到它最早出现的成员之前，保证「组框是成员的地板」。只改显示层级，不动保存的 `zOrder`；组自己被选中时同样成立（组的名称与工具栏都在成员区域之外，选中状态不靠压在图片上表达）。
- `design-sources/neon-canvas-surface.css`：把 `.canvas-group-count` 改为绝对定位到标题栏右侧（`right: 46px`，与标题栏的删除按钮并排），不再占用成员区域；同时更新组框底色那条注释，说明底色只在成员空隙里可见。

## 四、验证

- 新增 `canvas-group-frame-stacking-regression.cjs`（真实浏览器 + API 桩 + 自带 PNG 编码/解码）：
  - 组内纯色图渲染出的像素必须等于源色（通道差 ≤ 3）；
  - 成员显示层级必须高于组框；
  - 「N 张图」标签不得与任何成员矩形相交，且标签底部必须落在成员顶部之上；
  - 组框自己的底色仍要画出来（`::before` 背景非全透明）；
  - 点组内图片中心仍然选中图片本身、不选中组框（命中测试不受影响）。
  - 覆盖两种状态：什么都没选中（用户现场）、组自己被选中。
- **红绿验证**：同一用例在改动前的运行时（部署备份 `2026-10-12T08-30-02-092Z`）失败并给出量化证据——组内渲染 (76,111,149) 对源色 (120,180,240)，通道差 91，成员 `z-index 2` 低于组框 `4`。
- 部署后复跑：`canvas-group-frame-stacking-regression`（两状态 delta=0、`countCoveredByMember=false`）、`canvas-node-stacking-regression`（选中节点仍提到 1000、操作区可见可点）、`canvas-crop-output-regression`（9 张切片逐像素）、`canvas-cutout-result-regression`、`material-image-regression` 通过；`acceptance.cjs` 48 图 `errors=[]`、`overflow=[]`。截图 `acceptance/group-frame-stacking-1440.png`。
- `npm run build` + `node deploy.mjs` 部署，备份 `.design/deploy-backups/2026-10-12T08-48-50-121Z`；未停止 3199、未改用户真实画布。

## 五、边界

- 组框现在画在成员下面：成员被拖进组的内边距（上方标题带或左右/下方留白）时，会盖住组框边框、标题或「N 张图」标签——这是"容器在地板、成员在上面"的正常代价，拖动结束回到组内空白处即可恢复。
- 组在未选中时只有标题栏 / 缩放手柄 / 端口接收点击（遗留 `styles.css` 的 `pointer-events` 规则），点组内空白处是穿透到画布的既有行为，本次未改。
- **预先存在的失败**：`canvas-inline-image-tools-regression.cjs` 第 266 行「读数应含左右扩出的宽度」仍失败（实测 `1728 × 1152 · 扩图`，断言期望含 `1936`）。已用本轮改动前的运行时备份复跑同一用例，失败一模一样，与本轮无关；扩图默认边距由运行时模块 `canvas-comfy-rules.js` 决定（不在 deploy.mjs 管理清单里）。
- 需要刷新画布页（Ctrl+R）才会加载新脚本与样式。
