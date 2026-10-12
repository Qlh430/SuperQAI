# Qwen-image2.1 编辑：出图尺寸没跟面板走（2026-10-12）

## 用户反馈

「这个生成的图片分辨率跟选择的不一样」——面板底排选的是 `9:16 · 2K`，成品却是 **928 × 1664**。

## 现场与根因

这次是**编辑**路径（接了 1 张参考图 + 提示词「把图中的香蕉换成被咬的苹果」），走 `qwen-image21-edit.json`。模板里 KSampler 的取样尺寸来自一个开关节点：

```
482 ComfySwitchNode   on_false=[497, 2]   on_true=[479, 0]   switch=false
479 EmptyLatentImage  width=[13, 0]  height=[13, 1]        （13 = ResolutionSelector：aspect_ratio + megapixels）
497 TextEncodeQwenImage21  （同时输出 conditioning 与 latent）
```

- `switch=false`（模板默认）：取样用编码器 497 的 latent → 尺寸**跟着第一张参考图走**。第一张参考图由 `532 ImageScaleToTotalPixels` 固定预缩放到 **1.5 MP**，`resolution_steps=32` → 9:16 时正好是 **928×1664**，与成品完全吻合。
- `switch=true`：取样用 `479 EmptyLatentImage`，宽高来自 `13 ResolutionSelector`，也就是面板上选的比例 + 分辨率。UI 工作流里这个 ResolutionSelector 的标题就叫「**自定义尺寸**」，开关就是「跟参考图尺寸 / 自定义尺寸」的选择。

所以应用把 `aspect_ratio` + `megapixels` 写进了 `13`，但开关一直是 `false`，尺寸从来不起作用——面板显示 `9:16 · 2K`，实际出的是参考图缩放后的 1.5 MP。

对照生图路径：生成模板的 KSampler 直接读 `514 EmptyLatentImage`（宽高来自 `512 ResolutionSelector`），所以生图一直是按选的那一档出的（上一轮 `2.36` → 1184×2112 就是这条路径）。

## 改动

`comfy-workflow-task-service.js`：

- `QWEN_IMAGE21_EDIT` 增加 `sizeSwitch: "482"`，并写清 `false/true` 两种取样来源。
- 新增 `applyQwenImage21CustomSize(workflow, enabled)`（只改开关节点已有的 `switch` 输入，不动连线），并导出。
- 编辑分支里：**当这次请求真的带了尺寸参数**（`aspect_ratio` 或 `megapixels`）且尺寸已写进 `13` 时，把开关打开；不带尺寸参数的调用仍保持模板默认（跟随参考图），不改变纯 API 调用方的行为。

## 验证

`qwen-image21-workflow-patch-regression.cjs` 扩充两层：

1. 模板与开关契约：`482` 是 Switch 类节点，`on_true=[479,0]`（EmptyLatentImage）、`on_false=[497,2]`（编码器 latent）、默认 `switch=false`；`479` 的宽高来自 `13`；`applyQwenImage21CustomSize()` 能开能关且不新增输入名；`13` 打上 `9:16` + `2.359296` 后，取样尺寸链仍然只由 `13` 决定。
2. **端到端服务端**：用桩 `comfyClient` 真跑一遍 `runQwenImage21Task(..., 'edit')`，抓住真正提交给 ComfyUI 的那份工作流并断言——`482.switch === true`、`13.aspect_ratio === "9:16 (Portrait Widescreen)"`、`13.megapixels === 2.359296`、`571.value` 是提示词、增强器第一张参考图接 `532`、`475` 换成上传后的文件名，并且**整份提交里没有任何模板没有的输入名**。
3. 运行时 `resources/app/comfy-workflow-task-service.js` 必须带 `sizeSwitch: "482"` 与 `enhancerKey: "\u56fe\u7247"`（防止只改仓库、部署还是旧的）。

**红绿验证**：把「打开开关」那一行去掉再跑，端到端断言失败并打印「提交的工作流应打开自定义尺寸开关：{"on_false":["497",2],"on_true":["479",0],"switch":false}」；恢复后通过（提交结果里 `switch: true`、`aspect: 9:16 (Portrait Widescreen)`、`megapixels: 2.359296`）。

部署（`npm run build` + `node deploy.mjs`，备份 `.design/deploy-backups/2026-10-12T11-17-35-820Z`）后：该用例 exit 0、`qwen-image21-node-regression` exit 0、`acceptance.cjs` 48 张截图 0 页面错误 0 横向溢出。

## 边界

- 开关是**你的工作流自带**的「自定义尺寸」路径，我没有改任何节点或连线；只是应用带了尺寸参数时把它打开。
- 打开后取样 latent 变成「按所选档位的空 latent」，编辑效果依旧由参考图 conditioning 决定（模板里 `denoise=1`，两条路径都要重新去噪）；如果你觉得同尺寸下编辑的还原度不如以前，可以改成「关掉开关、把第一张参考图的预缩放档位改成所选档位」——那样输出尺寸也会跟面板一致，但比例会跟着参考图走。要哪种我可以切。
- 我这边没有可用的 ComfyUI 会话，端到端出图要在你的机器上验收；本轮未改真实画布数据、未重启 3199 服务，工作台需 Ctrl+R 加载新资源。
