# 文生图工作流步骤核查 + 尺寸换算改精确（2026-10-12）

## 用户的问题

「检查一下我刚文生图在工作流里步骤是否正确，有没有走优化提示词的节点。」

## 结论：走了提示词增强，而且就在主链路里

生成模板 `workflows/qwen-image21-generate.json` 共 13 个节点，全部来自 UI 工作流里 `mode=0`（活动）的那条分支；旁路的「▼加速节点(可选)」「▼4步lora(可选)」「QwenImage21Cache」以及 UI 里另一条被旁路的分支（`13 / 479 / 481 / 487 / 565 / 569 / 571`，`mode=4`）都没有被搬进模板。

提示词链路：

```
517 PrimitiveStringMultiline「提示词」（应用写入用户输入）
  → 583 TE_Qwen_Image_2_1_Prompt_Enhancer（提示词优化节点）
      任务模式=文生图 · 输出语言=中文 · 增强方式=本地官方PE
      文生图PE模型=qwen3.5_9b_qwen_image_2.1_pe_t2i.int8_convrot.safetensors
      seed=666 · 启用思考=false · 生成后自动卸载模型=true
  → 582 TE_text_display（use_edited_text=false，直接用增强结果）
  → 522 TextEncodeQwenImage21（negative_prompt 为空）
  → 515 KSampler（steps=30 · cfg=1 · euler · simple · denoise=1）
```

其余步骤：

- 尺寸：`512 ResolutionSelector（aspect_ratio + megapixels + multiple=32） → 514 EmptyLatentImage → 515 KSampler`。
- 种子：`524 Seed (rgthree) → 515 KSampler`。
- 出图：`520 VAEDecode → 508 SaveImage`。

编辑模板 `qwen-image21-edit.json`（30 个节点）同样带增强器：`571 提示词 → 565 TE_Qwen_Image_2_1_Prompt_Enhancer（任务模式=图生图，最多 8 张参考图） → 569 TE_text_display → 497 TextEncodeQwenImage21`，每张参考图先过 `ImageScaleToTotalPixels`（首图 1.5 MP、其余 1 MP，`resolution_steps=32`）再喂编码器。

应用侧一共只改四个输入（`comfy-workflow-task-service.js`）：`517.value` = 提示词、`524.seed` = 本次种子、`512.aspect_ratio` + `512.megapixels` = 尺寸、`508.filename_prefix` = 文件名前缀。**增强器从来不被动过**，所以每次生成都会先跑一遍本地 PE 增强（等于多加载一个 4B 级 PE 模型，跑完因 `生成后自动卸载模型=true` 而释放）。用户这次是 `9:16 · 2K`、无参考图 → 走生成模板 + 增强器 + 主模型，与截图里的结果一致。

## 顺带发现并修掉的尺寸偏差

用户这次的成品是 **1184×2112**，而上一轮换算表承诺的是 1152×2048（9:16 的 2K）。原因：

- 提交的 megapixels 只有两位小数（`2.36`），比名义面积 `2.359296` 略大；
- 工作流按面积算边并且**每条边向上取到 32 的倍数**（`ResolutionSelector` 的 `multiple=32`），于是短边 `sqrt(2.36e6×9/16)=1152.19 → 1184`，长边 `1184×16/9=2104.9 → 2112`。

用这一次真实出图反推出的取整模型是「按面积算短边、向上取 32 的倍数、长边按比例回推」，它对得上实测：`2.36, 9:16 → 1184×2112`。

改动（`canvas-comfy-node-renderer.js`）：

- `comfyMegapixelsFor()` 改为取**名义面积的下界**（floor 到百万分之一）：1:1 得 `1.048576 / 4.194304 / 14.7456`，16:9 与 9:16 得 `0.589824 / 2.359296 / 8.2944`，不会有超量把小尺寸顶上去。
- 新增 `comfyPixelSizeForMegapixels()`：与工作流同一套算法算尺寸预览；`comfyPixelSizeFor()` 用它给出档位按钮的悬停提示。1:1 是 `1024×1024 / 2048×2048 / 3840×3840`，16:9 的 2K 是 `2048×1152`，9:16 的 2K 是 `1152×2048`（与 API 面板的「2K 9:16」一致）；4K 仍标「显存占用大」。

## 验证

`qwen-image21-node-regression.cjs` 新增「尺寸模型」一段，把模型钉在真实出图上：

- `comfyPixelSizeForMegapixels(2.36, '9:16 (Portrait Widescreen)') === '1184×2112'`（与用户截图一致）；
- `comfyPixelSizeFor('9:16 (Portrait Widescreen)', '2') === '1152×2048'`，`comfyPixelSizeFor('16:9 (Widescreen)', '2') === '2048×1152'`，`comfyPixelSizeFor('1:1 (Square)', '1') === '1024×1024'`；
- 名义面积 `9:16 的 2K = 2.359296`、`1:1 的 4K = 14.7456`；
- 档位下拉的三个取值与悬停提示、`comfyTier` 写回、序列化/恢复、老值归档、提交载荷（`megapixels=8.2944`）一并断言。

部署（`npm run build` + `node deploy.mjs`，备份 `.design/deploy-backups/2026-10-12T10-56-36-309Z`）后复跑该用例通过；`acceptance.cjs` 48 张截图、`errors: []`、无横向溢出。

## 边界

- 取整模型是用这一次真实出图（9:16 · 2K）反推并核对的，其他比例没有逐一实测；提示里带「约」字，最终以节点返回的尺寸为准（应用本来就会显示「完成 · 返回尺寸与设置不同」）。
- 增强器的开关（增强方式 / PE 模型 / seed / 是否卸载）在 ComfyUI 节点里，应用界面不暴露；想跳过增强需要改工作流模板。
- 本轮只做只读核查与上述换算修正，未改动真实画布，也未停止 3199 服务；工作台需 Ctrl+R 加载新资源。
