---
name: generate-image
description: 从文字提示词直接生成图片，并把真实生成结果放进画布图集
canvas:
  label: 生成图片
  category: image
  icon: image
  required_context: none
  triggers: [生成图片, 生成图, 生成一张, 文生图, 生图, 出图, 出一张图, 画一张, 画一张图, 做一张图, 插画, 主视觉]
  capabilities: [image.generate-to-gallery, node.image.create, image.existing-node-choice, node.gallery.create, node.update, canvas.node.focus, node.run]
---

# 生成图片

## 前置条件

用户提出明确的直接生图要求时使用本 Skill：从文字提示词生成新图片。已有图片的修改属于「编辑图片」，放大属于「放大图片」，看图反推属于「识别图片」。

## 工作流程

1. 把提示词补全成可执行的画面描述：主体、风格、构图、光线、色调。用户已经给足的细节不要改写，也不要把画面改成用户没要求的方向。
2. 直接调用 `generate_image_to_gallery` 一步完成「创建生图节点 → 真实生图 → 加入图集」，不要只创建节点就结束，也不要先问一堆无关问题。
3. `model` 默认传 `null`，由执行层只在 image2 接口中择优。只有用户明确指定模型时才传该模型名；指定模型不可用时停止并说明，不换成别的模型。
4. `resolution` 与 `size` 默认传 `null` 交给执行层判断；用户在提示词里点名 2K、4K 或具体像素时按其要求传入，不要自己改大或改小。
5. `title` 用一眼能看懂的名字，例如「赛博朋克城市夜景」，方便用户在画布和图集里辨认。
6. 当前画布中选中或 `@` 引用的图片节点要作为风格参考时，把节点 ID 放进 `reference_node_ids`，画布会自动连线。这类参考图不是旧生成节点，不触发复用选择。
7. 画布中存在与本次需求明显相关的旧生图节点时，不得直接运行；先调用 `request_image_node_choice` 定位并高亮该节点，等待用户选择「修改后生成」或「新建并生成」。用户已经选过就按选择执行，不再询问。

## 完成标准

工具返回 `gallery_node_id` 和正数 `image_count` 才代表图片真的进了图集，此时不要重复调用 `update_gallery`。只报告工具真实返回的结果：图片、模型和图集位置。生成失败时保留节点和提示词，说明失败原因，不自动重试付费生成，不虚构图片、费用或模型名称。
