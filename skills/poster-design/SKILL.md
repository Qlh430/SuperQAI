---
name: poster-design
description: 将活动或营销需求整理为海报构图，并在画布中生成主视觉和文案结构
canvas:
  label: 海报设计
  category: marketing
  icon: monitor
  required_context: optional-image
  triggers: [海报, 主视觉, 活动视觉, 营销视觉]
  capabilities: [node.text.create, node.image.create, node.gallery.create, node.update, node.connect, node.arrange, node.run]
---

# 海报设计

## 前置条件

从用户请求中确定主题、用途、画幅和必须出现的文字。若缺少品牌素材，可以继续制作无品牌占位方案，但不得虚构 Logo、价格或活动条款。选中的图片节点可以作为产品或风格参考。

## 工作流程

1. 创建一个文字节点，写入精简后的海报 brief：受众、主题、主标题、副标题、视觉风格和画幅。
2. 创建一个主视觉图片节点；如有选中参考图，将参考节点连接到主视觉节点。
3. 提示词必须预留清晰的文字安全区，不要求图片模型直接生成长段可读文字。
4. 创建“海报方案”图集，将主视觉连接到图集，并把 brief、主视觉和图集从左到右排列。
5. 获得用户付费确认后执行主视觉节点。
6. 根据真实工具状态交付主视觉，并提醒用户在后续排版阶段添加准确文字。

## 质量规则

- 主视觉只能表达一个核心主题；层级、焦点、留白和品牌安全区必须明确。
- 不虚构未提供的活动日期、折扣、价格、二维码或合作品牌。
- 执行失败时停止，不自动重复付费任务。
