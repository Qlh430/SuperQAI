---
name: describe-image
description: 看图并用文字描述、反推提示词或校验图片是否符合要求
canvas:
  label: 识别图片
  category: image
  icon: eye
  required_context: image
  triggers: [识别图片, 看图, 图里有什么, 反推提示词, 图片描述, 读图, 校验图片]
  capabilities: [node.llm.create, node.text.create, node.update, canvas.node.focus, node.run]
---

# 识别图片

## 前置条件

需要当前画布中的一张图片节点（选中、`@` 引用或用户指定）。没有任何图片时先定位或让用户提供，不要凭文件名猜测图片内容。

## 工作流程

1. 用 `create_llm_node` 创建识图节点，把源图节点 ID 放进 `reference_node_ids` 作为输入，`model` 默认传 `null` 用画布当前可用模型。
2. 提示词按用户真实目的写：描述画面、反推提示词、检查是否满足某个要求、提取图里的文字。用户没要求就不要额外编造画面里不存在的内容。
3. 需要把识图结论留在画布上时，同时用 `create_text_node` 写入结论，再用 `update_node` 补标题，最后用 `focus_canvas_nodes` 定位源图与结论。
4. 执行识图节点用 `run_canvas_node`；返回内容为空或失败时如实说明，并提示这是站点模型不支持视觉输入，而不是图片有问题。
5. 反推提示词时输出可直接用于生图的中文提示词，包含主体、风格、构图、光线和色调，不夹杂多余解释。

## 完成标准

结论必须来自模型真实输出；不得凭文件名、尺寸或常识代替看图。用户只是想讨论图片时直接对话，不创建节点。
