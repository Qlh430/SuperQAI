---
name: rewrite
description: 改写、润色、缩写、扩写和翻译已有文本，保留原意与关键信息
canvas:
  label: 文本改写
  category: text
  icon: replace
  required_context: none
  triggers: [改写, 润色, 缩写, 扩写, 翻译, 换个说法, 降重]
  capabilities: [node.llm.create, node.text.create, node.update, canvas.node.focus]
---

# 文本改写

## 前置条件

必须有待改写的原文。原文来自用户消息或选中的画布文字节点；两者都没有时，先请用户提供原文，不要凭标题猜内容。

## 工作流程

1. 明确改写类型：润色、缩写、扩写、换风格或翻译，并确认字数或长度限制。
2. 改写时保留专有名词、数字、单位、条款和引用，不改动技术含义。
3. 直接输出改写结果；用户要求替换画布节点内容时，用 `update_node` 原地更新原节点，不要新建重复节点。
4. 用户要求同时保留原稿时，新建文字节点存放改写版本，并把两个节点用 `connect_nodes` 关联。

## 完成标准

改写后的文本可以直接替换原文使用。若原文存在事实错误或缺失信息，指出问题位置，不要用编造内容补齐。
