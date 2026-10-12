# 参考素材被回收丢失 + 底排单行（2026-10-10）

## 一、用户反馈

1. 连了三个素材参考，操作区参考带只显示一个。
2. 把操作区最下面那排参数与「全能参考｜文生视频｜首帧｜首尾帧」放在同一行，放不下可以加宽操作区。

## 二、根因

### 2.1 参考带丢素材：分页存储回收了来源节点

画布按视口分页加载，`canvasPagedStore` 还会按内存预算回收离屏节点的载荷（`removeResidentModel`）。参考带与生成请求都通过 `getCanvasIncomingItems()` 解析连线来源：先查挂载节点，再查分页存储，两者都取不到就整条丢弃。用户把三个来源连好后再平移画布（截图里导线从左侧屏外进入），来源节点被卸载/回收，参考带就只剩当时还能解析到的那一个。

实测证据：用 `canvas.db` 里该画布的真实节点/连线数据在浏览器中复刻（H3 节点 `cf3ba8a1…` + 1 个单素材合集 + 2 张图片），`getCanvasIncomingReferenceMaterials()` 只返回 1 条而 DOM 里曾渲染过 3 张卡片——正是「解析依赖来源是否还在本地」的表现。另用夹具复现：来源节点 `unmountCanvasVirtualNode` + `canvasVirtualStore.removeResidentModel/remove` + 从 DOM 移除后，参考带与提交请求都少素材。

### 2.2 底排换行：宽度在分段控件搬进底排之前就算好了

`placePanel()` 原本用 `state.actions.querySelector('.canvas-h3-mode-switch')` 判断要不要加宽；但分段控件是由 `placeH3ModeSwitch()` 在 composeSources/syncOne 里才搬进 `.flora-generator-actions` 的，首次定位时它还不在动作区，于是宽度按 760 计算，底排（设置区 480 + 动作区约 345）放不下而换行。用户截图里参数行与模式行分成两排、面板宽约 760 就是这个原因。

## 三、改动

- `design-sources/script-before-save-bridge.js`
  - 新增 `canvasIncomingOutputCache`（上限 240 条，LRU 淘汰）：`getCanvasIncomingItems()` 解析到来源输出时缓存快照；来源节点被卸载且载荷被回收时用缓存兜底，参考带、@ 列表与生成请求不再丢素材。切换/重载画布时随 `canvasPersistedNodes.clear()` 一起清空。
  - `updateCanvasGenerationResult()` 写入结果后同步分页存储里的模型快照（`canvasVirtualStore.upsert(syncCanvasNodeModel(node))`），让离屏/未挂载来源也能解析出生成结果。
- `design-sources/flora-generator-composer.js`
  - 宽度规则改为 `composerPanelWidth(viewportWidth, { wide })`：普通节点 760，MiniMax H3（带生成方式分段控件）960，窗口确实放不下时回落到 `viewportWidth - 32`；`placePanel` 与 `requestReveal` 共用同一函数。
  - 宽度按节点类型判定，不再依赖控件是否已搬进动作区；`placeH3ModeSwitch()` 搬完后追加一次 `schedulePlace()`。
- `design-sources/flora-node-shell.css`
  - `.flora-generator-settings` 由 `flex: 1 1 480px` 改为 `flex: 1 1 420px`，给底排的动作区（模式分段 + 生成按钮）留位置；窗口更窄时仍按原规则换行。

## 四、验证

新增 `neon-workbench/h3-reference-cache-regression.cjs`（旧运行时可复现红：来源被回收后参考带与请求都丢素材；修复后绿）：

- 连接 1 张图片后参考带 1 张卡片；
- 模拟真实回收（卸载 + 移除常驻模型 + 移出 DOM）后重新选中，`getCanvasIncomingReferenceMaterials()` 仍为 1、参考带仍显示「图片1」；
- 提交请求仍带 1 张参考图片。

扩展 `neon-workbench/h3-modes-mention-regression.cjs`：断言 MiniMax H3 操作区在 1440 视口下宽度 >900 且 ≤962（960 规则），参数区与生成方式分段控件在同一行（中线偏差 ≤6px），分段控件仍在参数区之后、发送按钮之前；截图 `acceptance/h3-footer-single-row.png`。

同步更新的既有断言：`canvas-performance-behavior.cjs` 的面板期望宽度改为 `min(节点类型对应上限, innerWidth-32)` 且不再横向夹取；`generator-composer-regression.cjs` 的「缩放后保持屏幕尺寸」改为与 `--flora-composer-width` 实际值比较，不再硬编码 760。

回归汇总（部署运行时、业务接口打桩）：

| 脚本 | 结果 |
| --- | --- |
| `h3-reference-cache-regression.cjs` | `{"ok":true,...,"submitted":1}`（新增） |
| `h3-modes-mention-regression.cjs` | 通过（含单行与 960 宽断言） |
| `h3-video-parameters-regression.cjs` | 通过 |
| `h3-mode-workflow-regression.cjs` | `{"ok":true,...}` |
| `h3-mode-service-regression.cjs` | `{"ok":true,...}` |
| `h3-workflow-regression.cjs` | `{"ok":true,"checks":28}` |
| `composer-expanded-regression.cjs` | `{"ok":true,"screenshots":49,"errors":[]}` |
| `generator-composer-regression.cjs` | `{"checked":12,"errors":[]}` |
| `canvas-performance-behavior.cjs` | `{"ok":true,...,"measurements":0,"widthError":0,"errors":[]}` |
| `acceptance.cjs` | `{"errors":[],"overflow":[],"screenshots":48}` |

并行排查时另有两份覆盖同一场景的回归（由协作子代理编写并保留）：

- `h3-reference-virtualization-regression.cjs`：连接 2 张图片 + 1 个音频合集，源节点卸载后参考带仍是 3 张卡片、`getCanvasIncomingMinimaxH3Refs` 仍是 2 图 1 音频，重新挂载后一致；
- `h3-offscreen-refband-regression.cjs`：离屏来源下参考带与提交请求视图仍保留 2 图 1 音频。

两者在修复后的运行时均通过（修复前可复现缺项）。

## 五、边界

- 缓存只保证「解析过一次的来源」在回收后仍然可用；来源节点从未在本地解析过（例如新开的画布只加载视口内节点）时，参考带仍会缺项——根因是分页加载本身只带视口节点。如需彻底覆盖，需要服务端在打开画布时按连接补齐来源载荷，作为后续项。
- 本轮未向 ComfyUI 提交任何任务；模式与工作流切换的服务端逻辑仍待用户体验确认。
- 未停止 3199 服务、未修改真实画布数据（只读读取了 `canvas.db` 用于复刻）。
