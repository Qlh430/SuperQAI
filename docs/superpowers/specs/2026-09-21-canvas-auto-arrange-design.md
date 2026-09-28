# 画布一键整理（Arrange Canvas）设计

日期：2026-09-21
范围：仅无限画布编辑器（`script.js` 的画布界面）+ 新增纯函数模块 `canvas-layout-rules.js`。

## 目标

画布上的节点一旦被随手拖动、由 Agent 创建、或从别处粘贴进来，位置就会散乱。
用户需要一个「一键整理」按钮，把节点按生成流程的先后顺序排整齐，并且这一步是
可撤销、可协同同步的。

## 交互

- 位置：画布右上角 `复位` 与 `清空` 之间，按钮文案「整理」，沿用现有 `text-action` 纯文字样式。
- 整理范围：默认整张画布；当当前选中 ≥ 2 个节点时，只整理选中的节点（含被选中打组节点里的成员）。
  `title` 提示这一规则。
- 整理完成后自动把视口对准整理结果（等比缩放到刚好完整显示并留边距），用户不必自己拖动画布。
- 状态栏反馈：整理了多少个节点；空画布、只有一个节点、画布未加载完成等情形给出明确提示并中止。

## 布局算法

按连线拓扑分层，从左到右排：

1. 用连线 `from → to` 建图；忽略指向不存在节点、自连接的连线，重复连线去重。
2. 入度为 0 的节点在第 1 列；其余节点所在列 = 所有前驱列号最大值 + 1（Kahn 拓扑分层）。
3. 存在环时（例如 A→B→A），环上剩余节点按原始顺序补层，回边被忽略，算法必然终止。
4. 同一列内按节点原有 y（再 x、再 id）排序，保留用户摆放时的上下顺序。
5. 列内自上而下堆叠，列宽取该列最宽节点；列间距 96px，行间距 48px。
6. 长流程折行成多段（band）：列数上限 `clamp(⌈√n⌉, 4, 10)`（`defaultColumnBudget`），
   超过上限就从下一段的最左边继续排，段间距 132px。20 个节点的链式流程因此排成
   4~5 列 × 4~5 行的方块，而不是横贯画布的一条长龙。
7. 互不相连的节点（散落素材）聚成一个网格块（列数 = ⌈√n⌉，同样受列数上限约束），
   排在流程图块右侧，避免散落节点被拉成一条超长竖列。
8. 多个互不相连的连通分量按各自原始左上角位置（先 y 后 x）从左到右依次摆放。

块的尺寸来自节点模型（`CanvasVirtualizationRules.getNodeRect`），挂载中的节点先
`syncCanvasNodeModel` 刷新，未挂载节点直接用模型，缺失尺寸回退到该类型默认尺寸。

## 分组与图集

- `打组`（`canvas-node-group`）与 `结果图集`（`canvas-node-gallery-container`）都作为单个不可拆的块参与布局；
  组成员通过 `groupMembers` 一并纳入整理范围。
- 图集成员不是独立节点，因此不会被单独摆放。

## 数据写入

- 每个位置变化的节点产生一条 `node.upsert` 变更，`before`/`after` 为完整节点模型，仅 x/y 不同。
- 整理**整张画布**时，画布是按视口分页加载的：屏幕上没出现过的节点根本不在本地，
  只排已加载的节点会让屏幕外的便签/图集留在原处。所以 `loadCanvasArrangeBoardData()`
  先 `saveCanvasBoardNow({ recordUndo: false })` 把本地改动落盘，再分页拉取服务端的
  完整节点与连线快照（`/api/canvas/boards/{id}/export-page?entity=nodes|connections`），
  用快照补齐未挂载节点；挂载中的节点仍以本地模型为准（未保存的编辑优先），连线一律取快照。
  落盘这一步刻意不记录撤销，否则「整理」会顺带往撤销栈塞进一串「编辑节点」。
- 整理**选中的节点**时只用本地已加载的模型与连线——能被选中的节点必然已经加载。
- 连线与画布画出来的线同源，因此排出来的顺序和用户屏幕上看到的连线关系一致。
- 全部变更合并为一条撤销记录（label「整理画布」），Ctrl+Z 一次全部还原，与拖拽节点的行为一致。
- 挂载中的节点直接更新 `dataset.x/y` 并调用 `updateCanvasNodePosition`；未挂载节点由
  `stageCanvasOperation` 写入分页存储，随后 `canvasVirtualizer.schedule()` 按新坐标挂载。
- 走既有 operation 通道，因此协同方会自动收到重排结果，无需额外逻辑。
- 整理结束后 `scheduleCanvasSave()` 落盘。

## 视图聚焦

复用 `CanvasAgentFocusRules.calculateFocusTransform`（与 Agent 创建节点后的聚焦同一套规则），
传入整理结果的包围盒；不改变选中状态，只设置 `canvasState.x/y/scale` 并 `scheduleCanvasViewportSave()`。

## 异常与边界

| 情形 | 行为 |
| --- | --- |
| `CanvasLayoutRules` 未加载 | 提示「画布整理组件未加载，请重开应用后再试」并中止 |
| 画布正在打开 / 恢复中（`boardOpening`、`isRestoring`） | 提示「画布还在加载，稍后再整理」并中止 |
| 快照拉取期间用户切换了画布 | 抛出「画布已切换，本次整理已取消」，不写入任何坐标 |
| 快照接口失败 | 提示「整理失败：…」并中止，画布保持原样 |
| 画布为空（无节点） | 提示「画布是空的，先添加节点再整理」 |
| 整理范围内节点少于 2 个 | 提示「至少需要两个节点才能整理」 |
| 计算后坐标没有变化 | 提示「画布已经很整齐了」，仍然聚焦结果视角 |

## 模块划分

- `canvas-layout-rules.js`（新增，纯函数、无 DOM 依赖，UMD 风格与其它 `*-rules.js` 一致）：
  输入 `{ blocks, links, origin, columnGap, rowGap, bandGap, looseColumns, maxColumns }`，
  输出 `{ positions, bounds, columns, blocks }`。
  可以脱离画布引擎单独测试。
- `script.js`：`getCanvasArrangeScope` 判定范围、`loadCanvasArrangeBoardData` 取全量快照、
  `focusCanvasArrangeResult` 聚焦结果、`arrangeCanvasNodes` 调用规则、写回坐标、
  记录一条撤销、存盘。

## 测试

- `tools/check-canvas-layout-rules.js`（新增）：
  - 线性链、菱形分叉与汇合、环、孤立节点、空输入、脏数据（缺尺寸 / 未知 id / 自连接）。
  - 24 节长链折行成 3 段以上、每段从最左边重新开始、结果宽高比不失控；`defaultColumnBudget` 的 4/10 边界。
  - 断言：无重叠、连线两端 x 严格递增、确定性（同输入同输出）、间距常量生效。
  - 断言 UI 接线：按钮位于 `复位`/`清空` 之间、点击处理已注册、整理只记录一条「整理画布」撤销、
    加载中的守卫存在、整画布范围必须走全量快照、快照前的落盘不记录撤销。
- `tools/check-canvas-arrange-browser.js`（新增，真 Chrome + 隔离数据库）：
  - 夹具里「散落」便签与 12 节链都被放在视口外（断言整理前不在本地存储里），
    验证整画布整理能把屏幕外节点一起排进去。
  - 断言长链折行（段数、每段回到左端、段向下堆叠、宽度/高度比）、无重叠、单次撤销/重做、
    选中范围只动选中节点、持久化结果与本地模型一致。
- 纳入 `npm run check`，并新增 `npm run check:canvas-arrange`。
