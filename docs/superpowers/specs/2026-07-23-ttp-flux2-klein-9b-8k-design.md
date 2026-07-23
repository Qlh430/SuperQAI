# TTP FLUX.2 Klein 9B 8K 工作流设计

## 目标

新增一个可独立导入 ComfyUI 的 API 格式工作流：`workflows/TTP-upscale-flux2-klein-9b-8K.json`。现有 `workflows/TTP-upscale.json`、网站后端和路由保持不变。

第一版优先保证链路简单、可运行和画面忠实。8K 定义为保持原图比例并将最长边收口到 8192 像素。

## 模型与依赖

- 超分模型：`4xNomos8kSCHAT-L.safetensors`
- FLUX.2 模型：`flux-2-klein-9b.safetensors`
- 文本编码器：`qwen_3_8b.safetensors`，类型为 `flux2`
- VAE：`flux2-vae.safetensors`
- TTP 固定网格节点：`TTP_Tile_image_size`、`TTP_Image_Tile_Batch`、`TTP_Image_Assy`
- 列表转换节点：`ImpactImageBatchToImageList`、`ImageListToImageBatch`

`qwen_3_8b.safetensors` 只编码修复指令，不执行图片反推。第一版不使用 Florence2 或 Qwen-VL，避免错误描述导致分块内容漂移。

## 数据流

1. 加载原图。
2. Lanczos 保持比例，将最长边预缩放到 2048。
3. 使用 4xNomos 将最长边扩大到约 8192。
4. 使用 TTP 将高清底图切成固定网格并记录坐标、原始尺寸和网格信息。
5. 将 Tile Batch 转成 Image List，使 ComfyUI 逐块执行后续节点。
6. 每块通过 Flux2 VAE 编码为参考 latent。
7. 使用统一的严格保真指令，经 Qwen 3 8B 编码后，通过 `ReferenceLatent` 送入 FLUX.2 Klein 9B。
8. 使用 Flux2 Scheduler、Euler 和 8 步采样完成局部修复。
9. VAE 解码后转回 Tile Batch。
10. 使用 TTP 按原坐标拼接，随后 Lanczos 将最终最长边精确收口到 8192。
11. 保存最终图片。

## 默认参数

- 分块：横图默认 6×4；竖图导入后将因子改为 4×6；方图建议 6×6。
- 重叠率：0.125。
- 拼接 padding：96 像素。
- Flux2 采样：8 步、Euler、CFG 1。
- 种子：提供可修改的固定默认值。
- 批大小：由 Image List 映射逐块处理，避免一次性把全部 Tile 送入模型。

统一提示词：

> Faithfully restore and enhance fine details. Preserve the exact geometry, identity, text, colors, materials, lighting and composition. Remove blur, noise and compression artifacts. Do not add, remove, redesign or reinterpret any object.

## 保真与资源边界

- 4xNomos 负责真实扩大像素尺寸；FLUX.2 只负责参考图约束下的细节修复。
- 固定网格可能切开人脸、文字或物体。第一版依靠重叠区域和保真指令降低风险，不引入 Smart Tile 语义分块。
- FLUX.2 Klein 9B 显存占用较高。逐块处理降低图像 latent 的峰值，但模型本身仍需足够显存或 ComfyUI 的模型卸载机制。
- 如果默认 6×4 仍显存不足，可增加分块数量；如果速度优先，可减少分块数量。

## 失败处理与验证

工作流应在缺失模型或自定义节点时由 ComfyUI 明确指出缺失项。交付前进行以下验证：

1. JSON 能被解析并保持完整节点引用。
2. LoadImage 至 SaveImage 的依赖链无断线。
3. 模型、文本编码器和 VAE 文件名与用户指定值完全一致。
4. 旧 TTP 工作流内容和网站代码没有变化。
5. 如果本地 ComfyUI 可访问，提交一次小图运行测试；否则提供导入和首测参数说明，并明确未执行端到端 GPU 推理。

## 非目标

- 不修改网站以增加 8K 选项。
- 不覆盖或重命名原工作流。
- 不加入图片反推、语义分块或多模型切换。
- 不保证所有显卡都能在默认参数下完成 9B 模型推理。
