# 对照 DX OS 画布的画布性能改造（2026-10-10）

## 一、对照对象

`F:\DXOS-Portable-0.2.0-win-x64\data\developer-apps\.versions\canvas\1.0.265+10265-e4dd478c\source\`
（已解包的"无限画布"开发者应用，主包 `assets/index-C5lJ17Ab.js`、样式 `assets/DKDUGPL7.css`）。
只阅读、未复制其代码。

### DX OS 的做法（读代码得到的结论）

| 机制 | 证据 |
| --- | --- |
| 三层 transform，translate 与 scale 分开写 | `camera-layer` / `viewport-layer` / `world`；提交时 viewport-layer 只拿 `translate`，world 只拿 `scale`，且 `world.style.transform !== e` 才写 |
| 手势期间跳过重活 | `a0()` 置 interacting 标志；`Mk()`、`dS()`、`Tk()` 开头都是 `if(zo \|\| ...) return` |
| 手势期间关命中测试 | `.stage.viewport-interacting .camera-layer { pointer-events: none }` |
| 连线画在 2D canvas 上 | 双层 canvas；位图四周多留 240–480px padding（`fk()`）；DPR 上限 2400 万设备像素、交互时 DPR 降为 1（`sC`）；solid/dashed 攒 `Path2D` 并按视口+尺寸+外观做键缓存（`gk`）；重绘可跨帧续跑（`bm` 返回"还有活"→`Kr` 排下一帧） |
| CSS containment + 临时 content-visibility | `.stage{contain:layout paint style}`、`.world{contain:layout style}`、LOD 占位 `contain:strict`；72ms 防抖批次给节点视觉上 `content-visibility:visible; contain:layout style` |
| will-change 有生命周期 | 移动时加，结束后 `removeProperty` |

它抗压的方式不是卸载节点（模板里节点整体渲染），而是把每帧工作量与样式作用域压到最小。

## 二、本轮实际执行（第四节 1–5）

### 已交付

**1. 连线渲染：不再每帧强制布局 + 加签名跳过**

- 根因：`applyCanvasTransformNow` 每帧 `canvasConnectionPortPointCache.clear()`。端口坐标存的是世界坐标、且用"已应用视口"换算，平移缩放不会改变它，但清缓存让下一次连线重绘对每个端口重新 `getBoundingClientRect()`，等于在平面内强制一次整树布局，顺带因浮点抖动改写 `d`。
- 改法：去掉该清空（真实几何变化本来就会通过 `canvasVirtualStore` revision 失效）；新增 `getCanvasConnectionRenderSignature()`，把画板、视口、缩放阈值、挂载代数、选中集、每条连线端点与其几何 revision 打进签名，签名不变直接跳过整趟重绘。挂载/卸载/换级通过 `canvasConnectionMountGeneration` 失效，不会漏画。
- 验证 `canvas-connection-memo-regression.cjs`：旧运行时红线为 `panWrites=2, panPortMeasures=4`；部署后 `panWrites=0, panPortMeasures=0`，且"节点位移后必须重绘"仍为 2 次写入。

**2. 拖拽平移期间关闭命中测试**

- 改法：`beginCanvasPan` 按下时给视口加 `is-canvas-panning`，`stop()`（抬起/取消）立即移除；样式 `#infiniteCanvas.is-canvas-panning .canvas-plane * { pointer-events: none !important }`。必须覆盖整棵平面，因为节点内部有 `pointer-events: auto !important` 会重新打开命中。
- 边界：只在"按住指针拖拽平移"期间生效——此间不可能发生点击，因此交互零风险；滚轮缩放**没有**加闸门，因为那会在滚动后的短时间内吞掉一次点按。
- 验证 `canvas-pan-hit-test-regression.cjs`（真实鼠标）：按下前节点可命中 → 拖拽中 `panning=true` 且节点不可命中 → 抬起后闸门关闭且节点恢复可命中。

### 经测量后未采纳

**3. 手势期间推迟非关键工作**：逐项核对 `applyCanvasTransformNow` 的每帧调用（transform/syncScale、图片工具条与尺寸浮标锚定、网格背景、场景层投影、选区框），它们都直接决定可见位置，推迟即产生可见滞后；真正多余的那一项是第 1 条的清缓存，已单独去掉。手势结束后的维护（场景层、虚拟化、连线、图片质量、栅格刷新）本来就已经由 300ms 空闲路径统一补做。故本条无需再改。

**4. 节点 CSS containment**：做了 A/B。加 `contain: layout style` 后三轮 panZoom 中位 28.4 / 30.5 / 34.7ms，去掉后四轮 31.1 / 31.8 / 37.0 / 34.5ms，区间完全重叠，**没有可靠收益**；而节点内联着工具栏与生成操作区面板，`contain: layout` 会新建包含块/层叠上下文，可能把面板层叠限制在节点内，存在观感风险。故**未采纳**，代码已还原。

**5. will-change 只在手势期间保留**：平面 transform 始终带 `translateZ(0)`，本来就已经常驻合成层，`will-change: transform` 是冗余的；而把它在空闲时摘掉会打乱现有"栅格刷新"里 `auto → transform` 的编排（该编排是为避免刷新时闪一帧）。收益近零、风险不为零，故**不改**。

## 三、本机实测（隔离夹具，36 节点 45 帧）

| 阶段 | 本轮起点 | 现在 |
| --- | --- | --- |
| panZoom 中位 | 47.9ms | 28.8 / 34.8ms（两次采样） |
| panZoom p95 | 61.7ms | 42.1 / 54.1ms |
| panZoom 长任务 | 7–10 | 1 / 1 |
| panZoom `layoutCallers` | `placePanel ~1653ms` | 空 |
| drag 中位 | 13.2ms | 8.9 / 12.3ms |

说明：本机为软件渲染且负载波动，单点数字不稳定，故给区间。剩余主要成本是每帧重写 `--collab-inverse-scale` 触发的样式重算，引用它的常显控件（端口、标题、徽标等）仍需逐帧跟随缩放；要去掉这部分只能减少引用元素或降低更新频率，会改变缩放时的控件呈现，属于设计取舍。

## 四、部署与验收

## 五、补充：真实平移路径的两个强制布局（2026-10-10 追加）

用户反馈"只是移动画布就很卡"。此前夹具的平移只来回摆 ±60px，视口边界几乎不动，因此掩盖了真实平移的成本。改用"真实长距离拖拽 + 48 节点 + 80 连线 + CPU Profiler"后定位到两处强制布局：

| 热点 | 证据（一次平移期间的 JS 归因 CPU） | 处理 |
| --- | --- | --- |
| `getViewport`（虚拟化取视口尺寸） | 3441ms。适配器每次 flush 读 `#infiniteCanvas.clientWidth/clientHeight`，而 flush 在平移中每个位移都会发生，等于每次位移强制一次整树布局 | 改为复用本文件已有的 `getCachedCanvasViewportSize()`（带 ResizeObserver）。改后该函数不再出现在热点表 |
| `updateCanvasImageQualities` | 3053ms 的 `getBoundingClientRect`。该函数每 flush 运行一次，对每张已挂载图片做两次矩形测量，并与会改写 `img.src` 的媒体调度交错，形成逐图重排 | ①先测后写（批量读、再统一决策）②按 `canvasDetailReady` 闸门推到空闲：读 `chooseCanvasImageQuality` 可知手势期间 `detailReady=false` 只能"保持原图或降级"，永远不会升级，因此拖动中运行它无法改善画面；释放后 300ms 的空闲路径仍会跑一次。改后该函数的矩形耗时 3053ms → 14ms |

改后仍需面对的：探针里每次位移仍有约 130ms 的尖峰，且**与连线数量无关**（0 条与 80 条连线结果一致），归因为浏览器内部的 `(program)`（栅格/绘制平面）。另外本机同时跑着 Node 探针、Edge、桌面应用，墙钟帧时被 CPU 争用放大，因此上面只把"JS 归因 CPU 的差值"当作结论，帧中位数仅作参考。

下一步建议：按 DX OS 的做法把平面拆成 `viewport-layer(只 translate)` + `world(只 scale)` 两层并加 containment，让平移不再改写含缩放的 transform，再复测。

## 六、补充：画布图片被当成原图加载（2026-10-10 追加）

用户怀疑"画布图片现在都加载原图"，经查证属实，且这正是平移卡顿的主因之一。

`registerCanvasDetailImage` 里有一段 `/^\/output\//` 判断：凡是以 `/output/` 开头的来源直接
`data-original-src = source`、`imageQuality = "original"`、`canvasDirectOriginal = "true"`、`img.src = source`，
完全绕开托管加载器；`updateCanvasImageQualities` 又对该标记 `return`。也就是说**本地生成的图片一律以全尺寸原图进画布**，
平移时每帧都在绘制这些大位图。

而服务端缩略图服务恰恰是**只为 `/output/` 设计的**（`server-image-thumbnails.js` 首行即
`if (!String(source || "").startsWith("/output/")) return Promise.reject(...)`，用 sharp 生成 WebP、
带缓存与并发上限 2），客户端 `imageResources.registerCanvasImage` 也是"先缩略图、按需升级原图"
（`allowOriginalFallback: false`）。所以那段直连原图的分支是在绕过一条专门为它准备的管线。

**修改**：删除该分支与其变量，所有画布图片（本地与远程）统一走 `registerCanvasImage`：
先加载缩略图，只有查看细节、下载，或空闲且放大到需要细节时才升级原图。原有的兜底保留——
若某种格式确实无法生成缩略图，`image-resource-state` 的 error 监听会退回原图一次，不会只剩 alt 文本。

**验证** `canvas-image-quality-regression.cjs`：旧运行时红（`/output/` 图片 `canvasDirectOriginal=true`、
`imageQuality=original`、已写入 `src`），部署后绿（`quality=unloaded`、未写 `src`、保留原图地址待按需升级，
且本地与远程行为一致）。

- 备份 `.design/deploy-backups/2026-10-10T04-24-25-665Z`，缓存版本 `20261010-drag-frame`，只经 `deploy.mjs` 部署。
- 通过：`canvas-connection-sync-regression.cjs`、`canvas-connection-memo-regression.cjs`、`canvas-pan-hit-test-regression.cjs`、`canvas-counter-scale-regression.cjs`、`canvas-connection-viewport-regression.cjs`、`canvas-drag-frame-regression.cjs`、`canvas-performance-scale-regression.cjs`、`comfy-video-regression.cjs`、`canvas-performance-behavior.cjs`、`acceptance.cjs`（48 图，`pageerror` 与横向溢出为空）。
- 未停止 3199、未触发付费生成、未修改真实画布数据；业务接口为隔离模拟。
