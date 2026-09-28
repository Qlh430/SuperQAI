---
name: edit-image
description: 在已有图片上按指令编辑：换背景、改文案、调风格、局部替换、多图合成
canvas:
  label: 编辑图片
  category: image
  icon: brush
  required_context: image
  triggers: [编辑图片, 修改图片, 修改这张, 改图, 修图, 换背景, 改文案, 调风格, 局部替换, 多图合成]
  capabilities: [node.image.create, image.generate-to-gallery, image.existing-node-choice, image.mask.edit, image.crop, node.update, node.connect, node.run, canvas.node.focus]
---

# 编辑图片

## 前置条件

必须有明确的源图：当前选中或 `@` 引用的图片节点，或用户指定的当前画布图片节点。没有源图时先定位图片，不要凭空生成一张新图冒充编辑结果。只优化产品本身、以商业呈现为目标时用「产品精修」；把图片变大用「放大图片」。

## 工作流程

1. 先确认改什么、保留什么，再用一句话复述编辑目标。用户只说「修一下」时，按最保守的解释调整（背景、光线、杂物、色调），不改主体结构。
2. 用户要求直接给出编辑结果时，调用 `generate_image_to_gallery` 一步完成编辑生成，并把源图节点 ID 放进 `reference_node_ids`，让画布自动连线到新节点。
3. 只需要搭好可调流程时，调用 `create_image_node` 创建编辑节点，提示词写清「保留什么 + 改变什么」，再连接源图节点，等待确认后执行。
4. 用户要求指定区域重绘时，先调用 `open_canvas_mask_editor` 让用户手绘遮罩，不猜测像素区域；用户要求按明确比例重新构图时，调用 `crop_canvas_image`，默认保留原图并创建裁切副本。
5. 多图合成时把每张源图都放进 `reference_node_ids`，用 `set_reference_order` 调整主次顺序，并在提示词里说明各张图的角色。
6. 编辑结果落到图集后不再重复调用 `update_gallery`；只报告真实结果，不虚构。

## 质量规则

- 只能改动用户要求的部分，不擅自增删人物、产品部件、包装文字、Logo 或品牌标识。
- 不虚构用户没提供的文字、价格、认证信息。
- 失败时保留源图和编辑节点供用户修改提示词，不自动重复付费执行。
