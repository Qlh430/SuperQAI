# 换角度改成拖拽方块对话框（2026-10-12）

## 一、用户要求

把「换角度」的界面与交互做成参考图那样：左边可拖拽方块调角度、右边方位预设加滑杆，简单易懂好操作；并特别指出图 1 的拖拽方块更直观。

## 二、改动前的样子

`换角度` 走的是节点上的参数托盘：`openCanvasImageToolPanel(node, "angle")` → `createCanvasComfyQwenAngleFields()`（运行时 `canvas-comfy-qwen-ui.js` 里的 SVG 拖拽 + 三个滑块），点「执行」才提交。参数模型是 `horizontal(-180..180) / vertical(-30..60) / zoom(0..10)`，提交体 `{image, name, horizontal_angle, vertical_angle, zoom}`。

## 三、改动

请求契约完全不动，只换界面与交互，全部落在 `design-sources`（可随 deploy.mjs 部署）：

- `design-sources/script-before-save-bridge.js`
  - 新增 `#canvasAngleDialog` 对话框（挂在 body 上并复用 `raiseCanvasWorkbenchAboveEngine()` 抬到画布引擎之上）：
    - 标题「拖拽方块调整角度」；
    - 左侧舞台：可拖拽的 3D 方块（正面用节点当前图片，其余五面用明暗差表达体积）、实时提示「右前方 · 平视 · 中景」、左下角「重置」；
    - 右侧控件：9 个摄像机方位预设（左上/上方/右上/左侧/正面/右侧/左下/下方/右下）、水平（-180..180，带刻度）、垂直（-30..60）、景别缩放（远景/中景/近景），每项都有实时读数；
    - 底部：取消 / 生成。
  - 拖拽映射：横向 1°/2px 并 -180..180 环绕，纵向 1°/3px 且夹在 -30..60；方块用 `rotateX(vertical) rotateY(-horizontal)` 跟随参数。方向键 ±5°（Shift ±15°）、Home 重置。
  - 所有改动写回同一份 `comfyQwenAngle` 数据（`setCanvasComfyQwenAngle`），拖动过程不落盘、松手与滑杆 change 时 `scheduleCanvasSave()`。
  - 「生成」走原函数 `runCanvasImageTool(node, "angle")`，提交体与旧面板逐字段一致。
  - 工具栏路由：`换角度` 打开对话框；`放大`/`扩图` 仍用原来的参数托盘。
- `design-sources/flora-node-shell.css`
  - 新增对话框样式，沿用画布语义令牌（`--canvas-neon-*`）与既有工作台视觉（20px 圆角、同色卡面与阴影）；滑杆是原生 `input[type=range]`，键盘与触屏都能操作；`≤960px` 时两列堆叠、方块缩到 118px；`prefers-reduced-motion` 下关闭方块过渡。

## 四、验证

新增 `canvas-angle-dialog-regression.cjs`：真实节点上点「换角度」后断言——

1. 对话框挂 body、带抬层类、z-index ≥ 2147483100、中心命中面板，标题与 9 个方位预设齐全，三个滑杆范围正确；
2. 预设「右侧」→ 水平 90、方块 `--canvas-angle-y: -90deg`、读数 90°、该预设高亮；
3. 方块右拖 100px → 水平 +50（1°/2px）且滑杆同步；
4. 垂直滑杆改 45 → 读数 45°；
5. 「重置」→ 0 / 0 / 5；
6. 「生成」→ 只提交一次，请求体 `{image, name, horizontal_angle:-45, vertical_angle:30, zoom:5}`（字段与旧面板完全一致），对话框关闭；
7. Esc 关闭不改参数；390 宽度面板 366px、不横向溢出、两列塌成一列。

源码与部署后运行时两轮都通过。截图：`acceptance/angle-dialog-1440.png`、`angle-dialog-dragged-1440.png`、`angle-dialog-390.png`。

`npm run build` 与 `node deploy.mjs`（备份 2026-10-12T03-01-35-771Z）通过；acceptance 48 图 `errors=[]`、`overflow=[]`；换角度、工具栏标签、裁切图集收缩、图集删除四个回归部署后通过。

## 五、边界

- 只改了图片节点工具栏里的「换角度」入口；ComfyUI 节点自己的内嵌角度参数区未改动。
- 生成仍是真实 ComfyUI 工作流，回归里接口为模拟桩，真实出图质量需要用户用真实会话验证。
- 参数范围沿用既有契约（水平 -180..180、垂直 -30..60、缩放 0..10），没有新增后端字段。
- 工作台需刷新（Ctrl+R）加载新脚本与样式。

## 七、补充：生成反馈与拖拽方向（同日）

用户实测反馈两点，均已修复并部署。

### 1. 点「生成」后没有反馈

原因：提交后只有来源节点上一行状态文字，没有可见的“正在进行”；请求本身是通的（`POST /api/qwen-edit-angle` → 轮询 `/api/upscale/status`），但画布上看不出在跑。

改法（`script-before-save-bridge.js`）：

- `runCanvasImageTool()` 现在**先把结果节点建出来**：位置与旧逻辑一致（来源节点右侧 +72px），按来源节点比例生成一张透明占位图作为节点内容，因此不会像占位生成节点那样带出输入面板；节点随即被选中。
- 节点内叠加进行中占位：点阵背景 + 左上角「生成中 X% | 取消」，进度来自任务轮询，节点状态行同步同一文案。
- 取消：`waitForUpscaleTask()` 支持 `AbortSignal`（新增可选参数，默认行为不变），点取消即中止轮询，回收占位节点并把来源节点重新选中。
- 成功：结果直接填进占位节点（不再新建第二个节点），多余的返回图仍按顺序落在下方。
- 失败：占位节点回收，中文错误同时写回来源节点状态与画布状态栏。
- 顺带修好一个通用问题：`setCanvasNodeStatus()` 现在会主动让 Flora 壳体刷新一次状态行，否则纯文字变化不会镜像到节点底部（进度和错误之前可能看不见）。

### 2. 拖拽方向与鼠标相反

原因：拖拽改了水平角，而方块用的是 `rotateY(-horizontal)`，两者方向叠加后视觉上倒过来了。

改法：拖拽改成“抓住方块”的手感——鼠标右移 → 方块正面朝右转（`--canvas-angle-y` 变正、水平角减 50°/100px）；鼠标下移 → 俯视增加。滑杆与方向键仍按数值方向（右/上加），和刻度一致。

### 验证

`canvas-angle-dialog-regression.cjs` 扩展为覆盖：提交后占位节点立刻出现在右侧、含点阵与「生成中 X% | 取消」；取消后回到单节点且来源节点提示已取消；成功后占位节点被填图且不新增节点；失败后占位回收并同时写入节点与画布错误；拖拽断言改为「右拖 100px → 水平 -50°、`--canvas-angle-y: 50deg`（跟随鼠标）」。源码与部署后运行时均通过；`canvas-node-toolbar-labels`、`canvas-gallery-fit-content`、`canvas-gallery-delete`、`canvas-crop-output` 与 acceptance 48 图同样通过（`errors=[]`、`overflow=[]`）。

截图：`acceptance/angle-dialog-generating-1440.png`（进行中）、`angle-dialog-result-1440.png`（完成结果）。
