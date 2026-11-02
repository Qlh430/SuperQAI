---
name: remove-background
description: 把已生成或已上传的图片抠成透明背景，支持本地 AI 抠图与 ComfyUI 高质量抠图
canvas:
  label: 一键抠图
  category: image
  icon: scissors
  required_context: image
  triggers: [抠图, 去背景, 去掉背景, 透明背景, 透明底, 去背, 换背景, 抠出主体]
  capabilities: [image.remove-background, image.crop, node.comfy.create, node.run, node.connect, node.arrange, canvas.node.focus]
---

# 一键抠图

## 适用范围

用户要求把某张图片的主体抠出来、去掉背景、做成透明底 PNG 时使用。必须先有一张已生成或已上传的图片节点作为源图；用户没指定图片时，先让用户确认用哪一张。

## 两条路线怎么选

1. **本地 AI 抠图（默认）**：不占用 API 额度、不需要显卡，人物、商品、动物都能抠。直接调用 `remove_canvas_image_background`，`mode` 传 `subject`。
2. **ComfyUI 抠图（高质量）**：用户明确要求更高精度、要换背景重合成，或本机 ComfyUI 已连接了抠图节点时使用。用 `create_comfy_node` 创建节点并把 `mode` 传 `remove-background`，再用 `connect_nodes` 接上源图，付费确认后 `run_canvas_node` 执行。
3. **纯色背景素材**：背景是单一颜色的商品图或证件照，本地抠图用 `mode` 传 `effect`，它按颜色键控抠得更干脆。
4. **用户想自己调边缘**：`mode` 传 `interactive`，工作台会打开并自动跑一次，用户拖滑块实时预览后保存。

## 工作流程

1. 用 `focus_canvas_nodes` 把源图居中，让用户看清操作对象。
2. 按上面的规则调用 `remove_canvas_image_background`，`node_id` 传源图节点 ID。
3. 抠图结果会作为新的图片节点落在原图右侧，**不覆盖原图**；不要用 `delete_nodes` 删掉原图。
4. 完成后报告真实宽高和前景占比。前景占比低于 1% 说明参数不合适或模型不适用，要说明而不是直接交付。

## 失败与边界

- 返回「模型不可用」时，说明应用内置的 BEN2 Base 权重缺失或被改动，让用户重新安装 AI OS 或在抠图工作台里导入权重文件，不要虚构结果。权重是随应用内置的，正常安装不需要下载。
- ComfyUI 抠图返回「没有可用的抠图节点」时，说明需要在 ComfyUI 里安装抠图插件（如 ComfyUI-RMBG、ComfyUI-BiRefNet），并给出本地抠图这条退路。
- 抠图只改变背景，不得改变主体形状、颜色和内容；用户还要继续编辑时，用生成出来的新节点做后续操作。
