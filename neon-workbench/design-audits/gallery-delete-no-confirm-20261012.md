# 图集删除去掉确认弹框（2026-10-12）

## 一、用户要求

删除图集时弹出的「删除整个图集？」确认框不需要了，直接删除。

## 二、改动

`design-sources/script-before-save-bridge.js`：

- `requestCanvasGalleryNodeDelete()` 改名为 `deleteCanvasGalleryNode()`，去掉 `requestCanvasDeleteConfirmation()` 包装，直接执行原来的删除逻辑：`deleteCanvasNodes([node])` → `scheduleCanvasGalleryMediaCleanup()` → 状态栏提示。
- 节点栏删除按钮（`createCanvasNodeBar`）改为调用新函数。

两个删除入口都只经过这一处：节点栏的 ×，以及节点工具条上的垃圾桶（`flora-node-shell.js` 的 delete 动作会点击节点内的 `.canvas-node-delete`）。键盘 Delete 走的 `deleteSelectedCanvasNodes()` 本来就不弹框，现在三个入口行为一致。

确认框组件本身保留：视频历史删除（`requestCanvasVideoHistoryDelete`）仍在用 `#canvasDeleteConfirm`。删除依然记录撤销，Ctrl+Z 可以恢复整个图集和其中图片。

## 三、验证

新增 `canvas-gallery-delete-regression.cjs`：真实走一遍 2×2 宫格裁切生成图集，然后

1. 触发节点栏 × → 断言 `#canvasDeleteConfirm` 仍为 `hidden`、图集节点被移除、状态栏显示「已删除图集和 4 张图片；可使用 Ctrl+Z 撤销。」；
2. 按 Ctrl+Z → 断言图集节点恢复且 4 个成员都在；
3. 触发工具条垃圾桶 → 同样不弹框并直接删除。

反向确认：用例在改动前（旧部署脚本）运行会失败并报「删除图集不应再弹确认框 false !== true」，说明用例确实覆盖了这个弹框。

`npm run build`、`node deploy.mjs`（备份 `2026-10-12T02-20-40-675Z`）通过；部署后以 `CROP_USE_DEPLOYED=1` 复测图集删除与裁切输出用例通过，`node acceptance.cjs` 48 图、`errors=[]`、`overflow=[]`，图片工具栏抠图/裁剪用例通过。

## 四、边界

业务接口为模拟，真实登录会话下的删除与持久化仍需用户验收。本次未停止或重启 3199；工作台需要刷新（Ctrl+R）加载新脚本。
