---
name: product-refinement
description: 在严格保留产品身份的前提下优化背景、光线、质感和商业呈现
canvas:
  label: 产品精修
  category: ecommerce
  icon: wand-sparkles
  required_context: image
  triggers: [产品精修, 商品精修, 背景优化, 光线优化, 质感优化]
  capabilities: [node.image.create, node.gallery.create, node.update, node.connect, node.arrange, node.run]
---

# 产品精修

## 前置条件

必须选择至少一个产品图片节点。将第一个选中图片作为身份基准，不改变产品结构、比例、Logo、包装文字和固有颜色。用户未指定目标风格时，采用干净的商业棚拍风格。

## 工作流程

1. 创建一个图片编辑节点，提示词明确列出需要保留的产品身份特征和允许调整的背景、光线、阴影与材质表现。
2. 将产品参考节点连接到编辑节点，尺寸默认沿用参考图比例。
3. 创建“产品精修”图集并连接编辑节点，把原图、编辑节点和图集从左到右排列。
4. 获得付费确认后执行编辑节点。
5. 只根据工具返回的真实结果报告完成状态；如果失败，保留节点供用户修改提示词或手动重试。

## 质量规则

- 禁止增删产品部件、改变包装文字、替换 Logo 或制造不存在的功能细节。
- 背景和阴影必须符合同一光源与透视，边缘不得出现明显抠图感。
- 不自动重复执行失败任务。
