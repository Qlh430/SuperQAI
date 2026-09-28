---
name: upscale-image
description: 用 ComfyUI 放大工作流把已生成的图片放大到 2K、4K 或 6K
canvas:
  label: 放大图片
  category: image
  icon: maximize
  required_context: image
  triggers: [放大图片, 放大这张, 放大到, 超分, 高清化, 提高清晰度, 无损放大, 输出2K, 输出4K, 输出6K]
  capabilities: [node.comfy.create, node.run, node.connect, node.update, node.arrange, canvas.node.focus]
---

# 放大图片

## 前置条件

必须有一张已生成或已上传的图片节点作为源图。用户没有指定放大倍数时，默认按目标长边 2K 输出，不要直接跳到最高档消耗算力。

## 工作流程

1. 用 `create_comfy_node` 创建 ComfyUI 放大节点：`mode` 传 `upscale2`（SeedVR2，支持 2K / 4K）或 `upscale`（TTP，支持 2K / 4K / 6K），`resolution` 传 `2048`、`4096` 或 `6144`。
2. 用户点名 6K，或要求更强的细节重建时，选 `upscale`；用户只说「放大」「高清一点」时选 `upscale2` 并输出 2K。
3. 用 `connect_nodes` 把源图节点连到放大节点；放大需要恰好一张输入图，多张时先让用户确认用哪张。
4. 用 `arrange_nodes` 把源图和放大节点排列成从左到右的流程，必要时用 `focus_canvas_nodes` 把结果居中，方便用户核对。
5. 在付费确认后调用 `run_canvas_node` 执行放大；运行时上报的是 ComfyUI 的真实进度，不要把中间状态说成完成。
6. 完成后报告真实输出尺寸；用户需要继续放大或换档时，直接更新同一个节点的 `resolution` 后重新执行，不要重复创建节点。

## 质量规则

- 放大只能提升清晰度，不能改变原图内容、构图和文字。
- ComfyUI 未连接或工作流不可用时，明确说明是环境问题并保留节点，不虚构放大结果。
- 不自动连续重试付费任务；失败就停下来说明原因。
