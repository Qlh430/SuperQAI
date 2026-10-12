# 连接线贴住节点（2026-10-12）

## 用户要求

「让所有连接线挨着节点，连接点不变」——截图里线的一端离节点还有一截空隙，红线框住的就是那块。

## 现场

用只读探针（两个图片节点 + 一条连线，画布坐标）量到：发送节点右边缘在 520，端口圆心在 548（`right: -42px`、宽 28 → 圆心距边框 28px），而**线是从端口圆心开始画的**，所以节点和线之间必然留 28px。截图里那段空隙就是它（缩放后视觉上更宽）。

对照三个数（初始态）：`getCanvasPortPoint()` = 548、连线路径起点 = 548、缓存点 = 548，三者一致；也就是说线并没有「漂移」，只是**终点定义在端口圆心**，而端口本身浮在节点外侧。

## 改动

`script-before-save-bridge.js`：

- 新增 `getCanvasConnectionNodeBox(id)`：优先取挂载节点的实际盒子（图片自适应后可能与模型宽高不同），离屏时退回虚拟模型的内容矩形。
- 新增 `intersectRayWithCanvasBox()`（slab 法求射线与矩形最近交点）与 `extendCanvasWireToNodeEdge(portPoint, nodeId, otherPoint)`：从端口圆心朝连线另一端打反向射线，把端点顺延到节点边框上。
- `getVisibleCanvasConnections()` 里把 `from`/`to` 换成顺延后的端点（连线的可见路径、点击热区、选中/悬停样式都跟着走同一份路径数据）；拖拽中的预览线同样处理。
- **端口相关代码一行未改**：`.canvas-port` 的 `right/left: -42px`、28×28 尺寸、描边、悬停、磁吸偏移（`--flora-port-magnet-*`）、以及拖拽时"靠近端口才吸附"的判定都保持原样，所以连接点看起来和以前完全一样。

## 验证

新增 `canvas-connection-node-edge-regression.cjs`（浏览器内，1600 视口）：

- 水平连线：路径起点 x == 发送节点右边缘（520）、终点 x == 接收节点左边缘（760），两端 y 与端口圆心同高；
- **端口没动**：圆心距边框仍是 28px，宽高仍是 `28px`，`right` 仍是 `-42px`；
- 斜向连线（把目标节点拖到右下）：起点落在发送节点右边缘、终点落在接收节点左边缘，且两点都在各自节点的边框范围里；
- 没有 pageerror。截图 `acceptance/connection-node-edge-1600.png`（可以直观看到虚线两端咬在节点边上）。

部署（`npm run build` + `node deploy.mjs`，备份 `.design/deploy-backups/2026-10-12T11-31-45-153Z`）后复跑：该用例 exit 0、`canvas-connection-sync`、`canvas-connection-memo`、`canvas-connection-viewport`、`connection-magnet`、`canvas-group-chrome` 全部 exit 0；`acceptance.cjs` 48 张截图、0 页面错误、0 横向溢出。

## 边界

- 这是**纯前端**改动：工作台按 Ctrl+R 刷新即可生效，不需要重启本地服务（工作流改写那类服务端模块才需要，见上一轮记录）。
- 连线路径数据变了，热区（`.canvas-connection-hit`）用的是同一份 `d`，点击断线行为不变；`canvas-connection-*` 三个既有用例已复跑通过。
- 端口与节点的相对位置、以及"拖到端口上才吸附"的手感没有改；如果你希望线进一步压在节点边框**内侧**（例如贴住卡片圆角的视觉内沿），或者希望拖拽预览也从节点边缘起但保留端口圆心吸附，都可以再调。

## 第二轮：保持「一束分散」，只把束点挪到节点边（2026-10-12）

用户反馈：「连接线是从一个位置发出的，保持之前那种一束分散的样式，只是从端口移的里节点本身近些。别乱了」——第一轮改成"每根线各自与节点边框求交"之后，从同一个端口出去的多根线会因为方向不同而落在边框的不同点上，束点被拆散了。

改法：把 `extendCanvasWireToNodeEdge()` / `intersectRayWithCanvasBox()`（按连线方向求交）换成 `clampCanvasWireEndpoint()`——把端口圆心夹回它所属节点的盒子（`x/y` 各自 clamp 到节点矩形内）。这个换算只依赖端口本身的几何，与连线方向无关，所以：

- 同一个端口出去的多根线共用同一个束点（保持一束分散的样式）；
- 束点整体从端口圆心（节点外 28px）挪到节点边框上（输出端口 = 右边缘、输入/提示词端口 = 左边缘）；
- 端口本身（位置、大小、悬停、磁吸、吸附判定）一行未改；`member-output:` 这类本来就在边框上的端口坐标不变。

验证（`canvas-connection-node-edge-regression.cjs` 新增「一束」段）：一个端口连出三条线到三个不同目标，断言 `count = 3`、三个起点**完全相同**（`520,448`）、起点落在节点右边缘、且不等于端口圆心（`548,448`）；水平与斜向连线的既有断言（起点 = 发送节点右边缘、终点 = 接收节点左边缘、端口圆心仍距边框 28px、宽高 28px、`right: -42px`）继续通过。截图 `acceptance/connection-node-edge-1600.png` 里三条线从节点右边同一束点散开。

部署（备份 `.design/deploy-backups/2026-10-12T11-48-26-157Z`）后复跑：`canvas-connection-node-edge`、`canvas-connection-sync`、`canvas-connection-memo`、`canvas-connection-viewport`、`connection-magnet`、`canvas-inline-outpaint-scale`、`canvas-group-chrome` 全部 exit 0；`acceptance.cjs` 48 张截图、0 页面错误、0 横向溢出。纯前端改动，Ctrl+R 生效。
