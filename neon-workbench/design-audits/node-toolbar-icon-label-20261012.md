# 节点工具栏图标与文字重做（2026-10-12）

## 一、用户要求

参考两张图（都是「图标 + 中文标签」的图片工具条），重修节点工具栏的图标和文字，要清晰易懂。

## 二、问题

重做前工具栏是 10 个纯图标按钮，没有任何文字，而且图标互相撞脸：

| 动作 | 图标 | 问题 |
| --- | --- | --- |
| 放大查看原图 | `maximize` | 与「放大」的 `maximize-2` 几乎一样，分不清哪个是全屏查看、哪个是超清放大 |
| 放大 | `maximize-2` | 同上；动作名「放大」也容易被理解成查看大图 |
| 删除 / 下载 / 替换 | `trash-2` / `download` / `image-plus` | 没有文字，只能靠悬停提示猜 |

## 三、改动

`design-sources/flora-node-shell.js`

- 图片工具与媒体动作统一为「图标 + 中文短标签」，用词对齐参考图：预览 / 超清 / 抠图 / 裁剪 / 扩图 / 换角度 / 下载 / 替换 / 删除 / 上传。
- 图标改成两两可分辨：超清由 `maximize-2` 换成语义更准的 `sparkles`（参考图里「智能超清」也是这枚星形），预览统一用 `maximize`，替换由 `image-plus` 换成 `replace`（换图语义，且不再像「上传」）。
- 生成结果节点的「放大查看 / 下载」也补上 预览 / 下载 文字，图标由 `scan` 换成 `maximize`。

`design-sources/flora-node-shell.css`

- 工具栏按钮由 32×32 纯图标改成自适应宽的胶囊：图标 17px + 6px 间距 + 12px/600 中文标签，左右 10px 内边距，圆角 8px，容器间距 4→6px。
- 新增窄窗口回退（≤1023px）：隐藏文字、间距回到 4px，尺寸与改动前的紧凑条一致（368px），中文说明保留在 `title` 与 `aria-label`。
- 删除加入破坏性语义：悬停（`@media (hover: hover)`）与键盘聚焦用 `--canvas-neon-danger`。

## 四、验证

新增 `canvas-node-toolbar-labels-regression.cjs`：素材图片节点（有图 / 空）、生成图片节点在 1440 与 390 宽度下断言标签序列、图标不重复、工具栏高度 44；≥1024 断言文字可见且按钮比纯图标宽，<1024 断言退回图标但保留中文 `title`/`aria-label`。源码与部署后运行时两轮都通过。

对照图（命令行合成，源码改动前 vs 改动后，1440 宽度）：

- `acceptance/toolbar-before-asset-image-1440.png`（10 个裸图标）
- `acceptance/toolbar-after-asset-image-1440.png`（图标 + 中文标签）
- `acceptance/toolbar-after-asset-image-hover-delete.png`（删除的破坏性悬停）
- `acceptance/toolbar-after-generator-1440.png`（生成结果节点）

宽度实测：素材图片 748×44（有图，9 个动作）/ 生成图片 602×44（1440 宽度）；390 宽度分别 368×44、296×44，与改动前一致。

`npm run build`、`node deploy.mjs`（备份 2026-10-12T02-44-27-698Z）通过；acceptance 48 图 `errors=[]`、`overflow=[]`；裁切图集收缩、图集删除、裁切输出回归在部署后全部通过。

## 五、边界

- 工具栏按钮文字全部为简体中文，颜色、圆角、阴影、悬停沿用现有 Neon 令牌，没有引入第二套视觉语言。
- `flora-toolbar-regression.cjs` 在 390 宽度、asset-collection 样例上仍是既有失败（缩放 0.17 时工具栏未按 `--collab-inverse-scale` 反向缩放），改动前后数值完全相同（gap 2.04 / barHeight 7.48 / centerDelta 0），与本次改动无关。
- 工作台需刷新（Ctrl+R）加载新脚本与样式。

## 六、补充：抠图图标改成套索（同日）

用户复核后指出抠图的图标不对。核对确认：`scissors` 在图片工具语境里读作「剪」，而且紧挨着就是「裁剪」的 crop，两枚都是剪切语义，容易看成同一件事。按参考图里「抠图」的套索画法改成 `lasso`（同一批候选——lasso / lasso-select / wand-sparkles / person-standing / scan——并排渲染对比后选定：`lasso` 在 17px 下最干净，`lasso-select` 有选择框细节偏碎，`wand-sparkles` 与「超清」的 sparkles 以及文字节点的「工具」撞图）。

同时把回归用例升级为逐动作锁定图标：`canvas-node-toolbar-labels-regression.cjs` 现在断言 预览=maximize、超清=sparkles、抠图=lasso、裁剪=crop、扩图=expand、换角度=rotate-3d、下载=download、替换=replace、删除=trash-2、上传=upload，图标被换掉会直接失败。

重出文档用图并复核：`acceptance/toolbar-after-*` 三张、`toolbar-zoom-*` 两张、`icon-compare-cutout.png`（候选对比）。`npm run build` + `node deploy.mjs` 再次部署，部署后工具栏、裁切图集收缩、图集删除、裁切输出四个回归全部通过，acceptance 48 图 `errors=[]`、`overflow=[]`。

顺带修掉一个测试自身的问题：画布视口接口会校验引擎版本，桩数据缺少版本号时画布会报「画布引擎已更新」并覆盖状态栏文案；三个应用内回归现在把视口接口桩成「迁移中」，并给图集删除用例补上缩略图接口桩（缺了它节点图片会落到 error 状态）。这是用例环境问题，不是产品缺陷。
