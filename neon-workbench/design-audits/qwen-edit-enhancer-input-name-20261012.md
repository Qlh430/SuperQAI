# Qwen-image2.1 编辑：增强器第一张参考图的输入名写错（2026-10-12）

## 用户反馈

「这个怎么报错了，不应该用的是 Qwen-image2.1 编辑那个组吗」——截图里 ComfyUI 节点接了 1 张参考图、提示词「把图中的香蕉换成苹果」，结果报：

```
失败：ComfyUI 节点 565 (TE_Qwen_Image_2_1_Prompt_Enhancer) 执行失败: enhance_prompt() got an unexpected keyword argument 图片1
```

## 结论：走的就是编辑工作流，错在输入名

报错来自节点 **565**，而 565 只存在于编辑模板 `qwen-image21-edit.json`（生成模板的增强器是 583），所以应用确实按「有参考图 → 图像编辑」选了编辑那一组，走对了。

问题是服务端改写工作流时写错了一个输入名。编辑模板里增强器 565 的参考图输入是：

```
图片, 图片2, 图片3, 图片4, 图片5, 图片6, 图片7, 图片8
```

而 `comfy-workflow-task-service.js` 的槽位表把第一张写成了 `图片1`（其余 `图片2`…`图片8` 是对的）。`applyQwenImage21References()` 直接 `enhancer.inputs[slot.enhancerKey] = [slot.scale, 0]`，于是给 565 多塞了一个模板里不存在的输入 `图片1`；ComfyUI 构造节点参数时把它当成关键字参数传给 `enhance_prompt()`，就有了这条报错。因为是在构造/校验阶段就失败，任务在采样前就中止，没有半成品结果。

注意：这条路径只要连了参考图就会踩到，与参考图张数无关（第一张就会带上 `图片1`）。

## 改动

`comfy-workflow-task-service.js`：槽位表第一项的 `enhancerKey` 由 `图片1` 改成 `图片`，并加注释说明该名字来自工作流导出（其余 `图片2`…`图片8` 不变）。

## 验证

新增 `qwen-image21-workflow-patch-regression.cjs`（纯 Node，不需要画布和 ComfyUI）：

1. 模板契约：编辑模板 565 的参考图输入必须恰为 `图片, 图片2 … 图片8`，编码器 497 必须恰为 `images.image_1 … images.image_8`；
2. 真调用服务端的 `applyQwenImage21References()`，分别按 1 / 3 / 8 张参考图打补丁，断言**改写后任何节点都没有出现模板里不存在的输入名**（这条护栏正是本次 bug 的克星），以及用上的槽位按顺序接好 `load → scale → 编码器/增强器`、没用的槽位连节点带输入一起摘掉；
3. 提示词（517 / 571 的 `value`）、种子（524 / 502 的 `seed`）、尺寸（512 / 13 的 `aspect_ratio` + `megapixels` + `multiple`）都必须落在模板已有的字段上；
4. 运行时的模板文件若存在，节点集合与每个节点的输入名必须与仓库一致（防止只改仓库、部署还是旧的）。

**红绿验证**：把槽位表改回 `图片1` 再跑，用例在第 2 步失败并给出「节点 565 被写入了模板里没有的输入名：["图片1"]（1 张参考图）」；改回 `图片` 后通过（输出 `enhancerKeys: [图片, 图片2 … 图片8]`、`encoderKeys: [images.image_1 … images.image_8]`、`cases: [1,3,8]`）。

部署（`npm run build` + `node deploy.mjs`，备份 `.design/deploy-backups/2026-10-12T11-09-27-764Z`）后确认运行时 `resources/app/comfy-workflow-task-service.js` 的槽位表已是 `enhancerKey: "\u56fe\u7247"`；复跑 `qwen-image21-workflow-patch-regression`（exit 0）与 `qwen-image21-node-regression` 通过，`acceptance.cjs` 48 张截图、0 页面错误、0 横向溢出。

## 边界

- 修复只影响服务端改写工作流这一步；模板本身没有改动，ComfyUI 里节点与连线保持原样。
- 我这边没有可用的 ComfyUI 会话，真正跑一次「换香蕉」的端到端出图要在你的机器上验收；模板与输入名的一致性是按你自己的导出工作流核对并用上述测试锁住的。
- 本轮未改真实画布数据，未重启 3199 服务；工作台需 Ctrl+R 加载新资源。
