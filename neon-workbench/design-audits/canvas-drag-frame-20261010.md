# 画布拖动同帧更新审计（2026-10-10）

## 问题与根因

拖动节点时，节点 CSS transform 会在 pointermove 中立即改变，而为避免连线端点落后一帧，旧实现又在每个 pointermove 内同步执行完整 `renderCanvasConnections()`。当节点较多或连接较多时，这个同步 SVG 路径计算阻塞输入处理，表现为拖动不跟手；节点和连线也可能在不同绘制时机短暂错位。

## 修改

- 拖动事件只更新节点数据坐标，并把本次移动的节点加入待绘制集合。
- 每个动画帧最多执行一次节点 transform 提交，并在同一帧内直接重绘连线，避免节点与连线跨帧错位；选中框、虚拟化和图片质量更新仍按合帧方式调度。
- 抽出的 `renderCanvasConnectionsNow()` 同时用于单选拖动与多选场景拖动，两条拖动路径行为一致；多选拖动原本在已合帧的 `paint` 内把连线再推迟一帧，现在改为同帧刷新。
- 普通位置更新仍使用原有的 `scheduleCanvasConnectionRender({ trailing: false })` 合帧路径。
- 清空画布时取消待执行的位置绘制帧，避免恢复或切换画布后提交旧节点。

## 验证

- `node neon-workbench/canvas-connection-sync-regression.cjs`：通过，确认拖动使用批量位置绘制、同一帧内重绘连线、移除鼠标事件中的同步整批连线刷新、普通更新保留合帧刷新；并已用“临时改回下一帧调度”验证该断言会按预期失败。
- `node neon-workbench/canvas-performance-scale-regression.cjs`：通过，确认离屏节点/连接线裁剪和诊断计数仍在。
- `node --check neon-workbench/design-sources/script-before-save-bridge.js`：通过。
- `node neon-workbench/canvas-drag-frame-regression.cjs`（真实浏览器，headless Edge，接管 `**/api/**`）：拖动 24 次 pointermove 全部发生在同一帧内时，连线 `d` 写入 `0` 次；节点位移所在帧内连线写入 `2` 次（路径 + 命中区），且 `afterSameFrame === afterFrames`，说明节点与连线在同一帧完成刷新。
- 同一真实浏览器度量用于反证：把实现临时改回“下一帧再刷新连线”得到 `duringBurst=0, afterSameFrame=0, afterFrames=2`（被同帧断言判定失败）；把实现临时改回“每次 pointermove 立即同步重算整批连线”得到 `duringBurst=44`（被单帧上限断言判定失败）。两种旧症状都能被该回归捕获。
- `node neon-workbench/canvas-performance-behavior.cjs`：通过，操作区定位误差为 0、保存扫描 1 次、撤销/重做、连接合并与画布合并语义不变。
- `node neon-workbench/acceptance.cjs`：通过，48 张截图、`pageerror` 为空、横向溢出为空。

构建与部署使用项目约定的 `deploy.mjs`（备份 `.design/deploy-backups/2026-10-10T02-58-11-626Z`，缓存版本 `20261010-drag-frame`）；本机标准 `npm run build` 的 Tailwind 原生绑定和 Vite `spawn EPERM` 限制仍需使用 `--configLoader native` 等价构建路径。此前记录的“浏览器 acceptance 被 Edge `spawn EPERM` 阻断”经复核并非 Edge 限制：在该受限沙箱内启动任意浏览器（Chrome/Edge/内置 Chromium）都会 `spawn EPERM`，脱离沙箱后 Edge 与 Chrome 均可正常启动，验收可直接运行，此项旧结论已作废。没有停止 3199 服务、触发付费生成或修改真实画布数据。
