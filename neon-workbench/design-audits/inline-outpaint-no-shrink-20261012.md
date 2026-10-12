# 扩图不再缩小原图（2026-10-12）

## 用户要求

「扩图不应该缩小图，在不影响原图大小的情况下在周围出现扩图操作」，并要求先总结；用户选定「保留节点原图、外框只画扩区」。

## 现场（读码确认）

内联扩图 `#canvasInlineOutpaint` 挂在节点壳体里、`inset: 0`，坐标系正好是节点那张图的内容区。旧实现把它当舞台用：

```js
fitted = min(可用宽 / (原图宽 + 左右扩出), 可用高 / (原图高 + 上下扩出))
外框、图片槽、把手全部 × fitted
```

只要边距不为 0，原图就必然被缩小（截图里约缩到六成），换来的是"整块扩区始终被节点框住"。同时旧实现还在外框里画了一份原图，并用 `visibility: hidden` 把节点自己那张藏起来。

顺手发现：测试用的 1×1 桩图会让"按显示尺寸换算比例"得到荒唐的缩放（400 倍，外框 6800px）——这不是线上问题，是探针夹具要换成真实尺寸（1024×768）才准。

## 改动

`script-before-save-bridge.js`

- `layoutCanvasInlineOutpaint()`：缩放基准改成"节点里那张图现在的显示尺寸 ÷ 原图像素"，外框按「原图矩形 −(左/上扩出 × 基准)」定位，图片槽正好压在原图上；四条扩区带各自给出 left/top/width/height；操作条写成 `--inline-outpaint-bar-top` = max(节点内容区高, 外框下沿) + 12。
- 新增 `getCanvasInlineOutpaintSourceRect()`：量节点里那张图的显示矩形（含 `contain` 留白），取不到才退回"铺满内容区"的老口径。
- 新增 `ensureCanvasInlineOutpaintVisible()`：外框超出可视区时只平移 `canvasState.x/y`（不缩放），打开与窗口 resize 时执行。
- 标记里去掉外框内的 `<img>`（图片槽只作几何锚点，拖拽换算继续用它），删掉 `paintCanvasInlineOutpaintImage()`；`is-inline-outpainting` 保留（只用于编辑期间不画节点自己的选中绿框）。

`flora-node-shell.css`

- 外框改绝对定位、背景透明；棋盘格移到新的 `.canvas-inline-outpaint-band`（四条带）。
- 图片槽改成透明 + 一圈内描边（标出未被动过的原图边界）；删掉外框内 `img` 与外层 `visibility: hidden` 规则。
- 操作条 `top` 改用 `var(--inline-outpaint-bar-top, calc(100% + 12px))`。

## 验证

新增 `canvas-inline-outpaint-scale-regression.cjs`（1600 视口，1024×768 真实尺寸纯色图）：

1. 打开前后对比节点里那张图：宽度、高度、left、top 全部一致（容差 1px），且**仍可见**；
2. 图片槽与原图重合并同尺寸（说明外框是以原图为基准长出来的）；
3. 四条扩区带都在原图外侧（上带下沿 ≤ 原图上沿、下带上沿 ≥ 原图下沿、左右同理），外框宽 = 原图宽 ×(原图+左右扩出)/原图（容差 2px），外框包住原图；
4. 尺寸读数 = `原图+边距` 的真实像素（本例 `1152 × 864 · 扩图`），操作条在外框下方；
5. 拖右边把手 +60px：`padding.right` 变大、读数变成 `1264 × 864 · 扩图`，而**原图宽度/位置纹丝不动**；
6. 关闭后编辑器消失、原图尺寸位置依旧不变；无 pageerror。截图 `acceptance/inline-outpaint-scale-1600.png`（可以看到蓝色的原图保持原样，棋盘格只长在四周）。

部署（`npm run build` + `node deploy.mjs`，备份 `.design/deploy-backups/2026-10-12T11-45-12-773Z`）后复跑：该用例 exit 0、`canvas-image-tool-panel` exit 0、`canvas-connection-node-edge` exit 0、`canvas-group-chrome` exit 0；`acceptance.cjs` 48 张截图、0 页面错误、0 横向溢出。

两个既有失败（`canvas-inline-image-tools-regression.cjs` 的 `page.waitForFunction` 超时、`canvas-angle-dialog-regression.cjs` 的最终点击超时）在**未改动的部署态**上报一样的错，与本次改动无关。

## 边界

- 拖拽手感沿用原逻辑（边距按原图像素算），只是缩放在拖动过程中天然恒定，不再"跟着鼠标缩放"。
- 外框会压到邻居节点上，靠编辑期间该节点的选中态提层显示（选中态本来就会提到最上层）。
- 遗留的旧扩图面板（comfy 节点 `outpaint` / `outpaint2` 模式里的 `.canvas-comfy-outpaint`）没改：当前模型列表只剩 Qwen-image2.1，那条路径在界面上到达不了；要改可以下一轮一起做。
- 纯前端改动，工作台按 Ctrl+R 即可生效；未改真实画布数据、未重启 3199。
