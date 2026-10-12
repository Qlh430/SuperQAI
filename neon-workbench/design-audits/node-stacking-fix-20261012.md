# 选中节点被盖住的层级缺陷修复（2026-10-12）

## 一、用户要求

选中一个节点后，它的悬浮工具栏和底部操作区被别的节点盖住，要求修复。

## 二、根因

两套层级规则叠在一起冲突：

- `script-before-save-bridge.js` 的 `syncCanvasNodeStacking()` 按上板顺序（`dataset.zOrder`）给**每个已挂载节点**写 `inline z-index = 序号 + 2`，节点越多越大（本次实测 24 个节点时最高到 26）。
- `flora-node-shell.css` 里给选中 / 连接中 / 聚焦 / `:focus-within` 的节点写死 `z-index: 20 !important`，用来“让当前节点浮在邻近节点之上”。

节点是独立的层叠上下文，工具栏（`z-index: 45`）和生成操作区（`z-index: 60`）都在节点内部，所以它们能不能露出来完全取决于**节点自己**的 z-index。板上超过约 18 个节点后，其它节点的 z-index 就超过 20，选中节点连同它的工具栏 / 操作区一起被压到下面。

反向验证（用修复前的部署文件跑同一用例）：选中节点 computed z-index = **20**，其它节点最高 **24**，工具栏与操作区确实被盖住。

## 三、改动

- `design-sources/flora-node-shell.css`：选中 / 连接中 / 聚焦状态的节点 `z-index` 由 `20 !important` 提到 `1000 !important`（画布同时挂载的节点数远小于这个值；`flora-generator-model-popover` 的 1400、工作台弹窗的 2147483100 仍在它之上），并补上说明这个数字为什么必须高于排序上限的注释。
- `design-sources/script-before-save-bridge.js`：`syncCanvasNodeStacking()` 排序时把选中 / 连接中 / 聚焦的节点排到最后（同组内仍按上板顺序），让行内 z-index 与 CSS 规则方向一致，不再依赖单一魔法数字。

## 四、验证

新增 `canvas-node-stacking-regression.cjs`：叠放 24 个图片节点 + 1 个带生成操作区的节点，选中带操作区的节点后断言

1. 选中节点 computed z-index（1000）高于所有其它节点（实测最高 26）；
2. 工具栏可见，且工具栏中心的 `elementFromPoint` 命中工具栏本身（没被别的节点挡）；
3. 操作区已展开，操作区顶部条带的 `elementFromPoint` 命中操作区内部。

修复前该用例失败（`选中节点的 z-index（20）应高于其它节点（最高 24）`），修复后与部署后各跑一轮通过。同轮回归：换角度对话框、工具栏标签、裁切图集收缩、图集删除、裁切输出全部通过，`acceptance.cjs` 48 图 `errors=[]`、`overflow=[]`。

## 五、边界

- 只改层级，不动节点的保存顺序（`zOrder` 仍是持久化的上板顺序，选择时才临时抬高，不会写回画板顺序）。
- 工作台需刷新（Ctrl+R）加载新样式与脚本。
