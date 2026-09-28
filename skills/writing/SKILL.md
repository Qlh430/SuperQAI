---
name: writing
description: 生成文案、脚本、说明和长文，并把可直接交付的成品放进画布文字节点
canvas:
  label: 写作生成
  category: text
  icon: pen-line
  required_context: none
  triggers: [写作, 文案, 脚本, 长文, 标题, 介绍, 商品描述]
  capabilities: [node.text.create, node.llm.create, node.update, node.arrange, canvas.node.focus]
---

# 写作生成

## 前置条件

先从用户请求里确定文体、受众、用途和字数区间；缺失时按最贴近的场景给出合理默认值，不要反问一堆问题。

## 工作流程

1. 用一句话在回答里复述写作目标，方便用户核对方向。
2. 优先直接写出成品正文；只有在用户明确要求把结果留在画布上时，才创建文字节点写入内容。
3. 需要留档时，先 `create_text_node` 写入成品，再用 `update_node` 补齐标题，最后用 `arrange_nodes` 把它放在不覆盖现有内容的位置。
4. 长文按小标题分段，段落之间保留空行；列表只用于真正并列的信息。

## 完成标准

交付的是可以直接使用的成品文本，不是写作建议或提纲。不虚构品牌、数据、价格、认证和用户评价；用户没有提供的具体事实用中性描述代替。
