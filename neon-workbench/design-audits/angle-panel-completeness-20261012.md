# 换角度面板：操作区保持完整 + 方块上下方向纠正（2026-10-12）

## 用户反馈

「换角度操作区要始终保持完整。操作区里左边方块移动时鼠标向下移就要往方块顶走，现在上下的方向是反的」

## 原因

1. **操作区被截断**：`positionCanvasAngleDialog()` 里有这段——
   ```js
   const room = ((viewportRect.bottom - 12) - (nodeRect.bottom + 12)) / scale;
   panel.style.maxHeight = `${Math.round(Math.max(240, room))}px`;
   panel.style.overflowY = "auto";
   ```
   它把面板高度按「节点下方剩余空间」夹住、把溢出交给内部滚动。实测打开时面板被压到 398px、`.canvas-angle-dialog-body` 变成 272/502（client/scroll）需要滚动，滑块那一行正好被切在边框外。同时 `revealCanvasPanelBelowNode()` 的上推量还有 `min(overflow, nodeRect.top - 96)` 的封顶，推不够，面板也就没法完整露出来。
2. **方块上下方向反了**：`updateCanvasAngleCube()` 写的是 `--canvas-angle-x = +vertical`（横向因为「相机右移 = 左脸转向观察者」取了负，纵向当时以为可以直接用）。但 CSS 的 `rotateX(+θ)` 是把方块顶**推离**观察者——也就是看到底面；而 `vertical` 为正表示俯视（相机在上、该看到顶面）。实测：`vertical = +60` 时正面投影是「下边更宽」（顶边更远 = 看到底面），`-30` 时反而看到顶面，正好和提示文案（俯视/仰视）相反。鼠标下移会增加 vertical，于是下移看到的是底面——和用户描述完全一致。

## 改动（`script-before-save-bridge.js`）

- `updateCanvasAngleCube()`：`--canvas-angle-x` 改成 `-vertical`，俯视才看到方块顶面；横向沿用 `-horizontal` 不变。
- `positionCanvasAngleDialog()`：不再写 `panel.style.maxHeight` / `overflowY`，面板按内容自然展开（只剩 CSS 的 `min(760px, calc(100vh - 48px))` 兜底）。
- `revealCanvasPanelBelowNode()`：去掉 `nodeRect.top - 96` 的封顶，改成「需要多少推多少，上限是把面板顶推到视口上沿」——宁可节点自己移出视口，也不让操作区被截断；仍然只平移画布、不改缩放。
- 打开期间挂 `window.resize` 监听（关闭时摘掉），窗口尺寸变化后重新定位与上推。

## 验证

新增 `canvas-angle-panel-regression.cjs`（1440×1000，节点故意放在很靠下的 y=620）：

1. 面板完整：面板 627.5px 高、范围 326.5..954 全部落在可视区 0..966 内；`.canvas-angle-dialog-body` 的 clientHeight = scrollHeight = 502（不再需要内部滚动）；`panel.style.maxHeight` 为空（不再写死）。
2. 鼠标下移 → 垂直角变大：在方块中心按下、下移 60px，滑杆读到 `20`（正数）且提示是「俯视」。
3. 方向正确：俯视 45° 时正面投影**上边 188 > 下边 182**（顶面转向观察者）；仰视 −30° 时 **下边 186 > 上边 184**（方向相反，因为滑杆下限是 −30°，透视信号小，这里只判方向）。
4. 无 pageerror；截图 `acceptance/angle-panel-complete-1440.png`（整块面板完整可见，45° 俯视时方块顶面朝观察者）。

**红绿验证**：把 `--canvas-angle-x` 改回 `+vertical` 再跑，用例在第 3 步失败并打印「俯视时方块顶面应转向观察者（前脸上边更宽）：{rows:43, top:176, bottom:186}」；恢复后通过。

部署（`npm run build` + `node deploy.mjs`，备份 `.design/deploy-backups/2026-10-12T12-02-08-306Z`）后复跑：该用例 exit 0、`canvas-inline-crop-chrome` exit 0、`canvas-inline-outpaint-scale` exit 0、`canvas-image-tool-panel` exit 0、`canvas-connection-node-edge` exit 0、`canvas-group-chrome` exit 0；`acceptance.cjs` 48 张截图、0 页面错误、0 横向溢出。

## 边界

- 「完整」的兜底只有视口高度：面板比视口还高时仍会被 CSS 的 `max-height` 限制并内部滚动（正常桌面尺寸下不会发生）。
- 键盘方向键的映射（↑ = 俯视）本来就对，这次只是让鼠标拖拽与它一致。
- 纯前端改动，Ctrl+R 生效；未改真实画布数据、未重启 3199。
