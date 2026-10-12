# 画布平移缩放连线位移与首屏加载审计（2026-10-10）

## 一、平移/缩放时连线位移

### 根因

连线端点从 DOM 实测取得（`getCanvasPortPoint` 读 `getBoundingClientRect`），但换算成画布坐标时用的是 `canvasState`。而 `canvasState` 在滚轮/拖动事件里会立刻更新，真正的 `#canvasPlane` 变换要等下一个动画帧才写入。两者短暂不一致时，任何一次“重新测量端口”的连线重绘都会把整批连线按待应用的位移量平移到错误位置，下一帧再弹回。

触发时机正是用户描述的场景：平移/缩放过程中有节点挂载（虚拟化补挂），端口缓存被失效，于是重测并错位。

### 证据

隔离夹具实测（节点 0 的输出端口，画布状态 `x=120,y=90,scale=0.8`）：

| 步骤 | 连线 path `d` 起点 |
| --- | --- |
| 基线 | `M 428, 308` |
| 注册待应用平移 `+140,+60` 后重测（旧实现） | `M 253, 233` |
| 变换真正应用后 | `M 428, 308` |

偏移量 `-175,-75` 恰好等于 `-(140/0.8), -(60/0.8)`，即“待应用位移 ÷ 缩放”，与推导一致。

### 修改

- `applyCanvasTransformNow` 在写入 `#canvasPlane` 变换的同时记录 `canvasAppliedViewport`；`clearCanvasPlane` 清空。
- 端口实测改用 `screenPointToCanvas()`，按已应用视口换算；指针、菜单等仍使用原有 `screenToCanvas()`。

### 验证

- `canvas-connection-viewport-regression.cjs`：部署前对旧运行时**失败**（`whilePending` = 253 而基线 428），部署后**通过**（连线在待应用平移期间保持 428，变换应用后仍在 428±0.5 内）。
- `canvas-connection-sync-regression.cjs` 新增静态断言：端口换算必须走已应用视口、应用变换必须记录该视口；并保留上一轮的拖动同帧断言。

## 二、进画布后节点/连线加载慢

### 测量

隔离夹具（36 个混合节点 + 18 条连线，真实 `openCanvasBoardFromHistory` 路径）：

- 每个节点挂载约 190ms（本机最慢 333ms），36 个节点合计约 6.9s。
- 虚拟化每帧只挂 1 个：一次挂载已超过 `FRAME_BUDGET_MS = 8` 的单帧预算，循环立刻中断。
- 因此首屏填充 = 约 35 帧，本机约 11s；连线连接渲染不是瓶颈。

### 修改

首屏填充期间把挂载切片放宽到 `50ms / 48 个`，并在以下任一时机立即恢复交互预算：填充完成、平移缩放开始、画布内点按、清空画布。

### 边界（不虚报）

本机单次挂载（约 190ms）本就大于放宽后的 50ms 切片，因此**本环境测量结果与改动前一致**，无法在本机证明提速。该改动只在“单次挂载耗时小于 50ms”的机器上把每帧挂载数从 1 提升到多个（例如 15ms 挂载约 3 个/帧）。本次只声明“结构性减少首屏帧数、且不改变交互后的预算”，不声明已实测提速。

## 三、生成操作区（placePanel）造成的布局抖动

### 根因

每个挂载的生成操作区都在 `#canvasPlane` 上注册了 MutationObserver（`attributes: ["style","class"]`）。而 `applyCanvasTransformNow` 每帧都要写 `#canvasPlane` 的 `transform`，于是每次平移/缩放都会触发所有操作区在下一帧各做一次 `placePanel`，其中 `shell.getBoundingClientRect()` 在平面变换刚写入后强制整棵平面重新布局。

### 修改

操作区面板本身就是节点的子元素，会跟随平面一起变换，因此它的屏幕矩形可以直接推导：`applyCanvasTransformNow` 额外发布只读的 `window.CanvasAppliedViewport`（已应用视口 `x/y/scale`），`flora-generator-composer.js` 用「视口原点（初始化/resize/换画布时缓存）+ 节点世界坐标 + 外壳尺寸」解析式计算外壳矩形，替代每帧的 `getBoundingClientRect()`；取不到已应用视口时仍回退到原来的实测路径。定位公式、`width`/`max-height` 夹取与 `counter-scale` 全部保持不变。

### 验证

- `canvas-performance-behavior.cjs`：操作区四组平移缩放后 `leftError/topError/widthError` 全为 0（最大 0.00005），并记录到该阶段的 `shell.getBoundingClientRect` 调用次数为 **0**（改动前为 6）。
- `canvas-performance-regression.cjs`：`panZoom` 阶段的 `layoutCallers` 由 `placePanel … 约 1653ms` 变为**空**（多次运行一致）；长任务数量显著下降。
- 帧时间：本机为软件渲染的隔离环境，`panZoom` 帧中位数在多次运行中落在 44–53ms 区间（`pan` 与 `idle` 稳定 16.2–16.7ms），波动来自机器负载，故只报告区间，不单点报数。

## 四、反向缩放（counter-scale）样式重算

### 根因

平移缩放每帧重写 `--collab-inverse-scale` 会触发浏览器样式重算（Chrome tracing 中 `UpdateLayoutTree` 约 1.7s，V8 profile 记为 `(program)`）。重算规模取决于**命中该变量的元素数量**，而原 `SCALE_TARGETS` 把节点工具栏、图片尺寸浮标、自适应媒体描边也算了进去——这三类元素默认 `visibility: hidden` / `opacity: 0`，只有悬停、聚焦或选中时才绘制，却对每个节点都命中一次。

### 修改

把这三类只在悬停/选中时才绘制的元素，按 CSS 里它们**真正变为可见的状态**限定选择器（`.is-selected`、`.selected`、`.is-connecting`、`:hover`、`:focus-within`），其余元素保持原样。因为 `SCALE_TARGETS` 是按逗号拼接成一条规则，带逗号的 `:is()/:where()` 会被拆坏，所以每个状态各写一条、不使用逗号分组。绘制时机与绘制样式不变：元素可见时照旧拿到该变量，不可见时不再命中。

### 验证

- `canvas-counter-scale-regression.cjs`：未选中节点的工具栏 `visibility: hidden` 且变量解析为 `1`（改动前为 `2`）；选中节点可见且变量为 `2`（scale 0.5）；再缩放到 0.25 时为 `4`；端口始终为 `2`/`4`。旧运行时该回归**失败**（未选中工具栏为 `2`），部署后**通过**。
- `canvas-performance-regression.cjs` 部署后：`panZoom` 帧中位数 **34.5ms**（本轮起点 47.9ms，降约 28%），`layoutCallers` 为空。
- 元素数量敏感性实测（36 节点、45 帧缩放）：全部目标 47.3ms → 去掉三类悬停态元素 32.7ms → 再去掉徽标/光标 30.5ms → 仅端口+连线 25.8ms → 完全不写 16.7ms。据此只采用“去掉悬停态元素”这一项无观感代价的改动。

### 仍保留的成本

端口（每节点 2 个）与常显控件仍需每帧跟随缩放，约带来 10ms/帧；把这部分再去掉会让端口和节点控件在缩放时不保持屏幕尺寸，属于观感取舍，本轮不动。另实测 `inherits: true` 的两种写法都明显更差（约 70ms / 96ms），因此 `inherits: false` + 定向规则保持原样。

## 部署与验收

- 构建：`npm run build` 仍受本机 Tailwind 原生绑定与 Vite `spawn EPERM` 限制，使用项目既有 `--configLoader native` 等价路径；部署只经 `deploy.mjs`。
- 备份 `.design/deploy-backups/2026-10-10T03-57-58-174Z`，缓存版本 `20261010-drag-frame`。
- 通过：`canvas-connection-sync-regression.cjs`、`canvas-connection-viewport-regression.cjs`、`canvas-drag-frame-regression.cjs`、`canvas-counter-scale-regression.cjs`、`canvas-performance-scale-regression.cjs`、`comfy-video-regression.cjs`、`canvas-performance-behavior.cjs`、`acceptance.cjs`（48 图，`pageerror` 与横向溢出为空）。
- 未停止 3199、未触发付费生成、未修改真实画布数据；业务接口为隔离模拟。
