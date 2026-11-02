---
name: analysis
description: 总结、归纳、对比和提取要点，输出结构化结论与可执行建议
canvas:
  label: 文本分析
  category: text
  icon: list-checks
  required_context: none
  triggers: [总结, 归纳, 对比, 提取要点, 分析, 诊断, 梳理]
  capabilities: [node.llm.create, node.text.create, node.update, node.arrange, canvas.node.focus]
---

# 文本分析

## 前置条件

分析对象必须来自用户消息或选中的画布节点。只有一个模糊要求时，先说明会分析什么，再执行。

## 工作流程

1. 先给结论，再给依据；结论与依据之间的对应关系要能一眼看清。
2. 对比类需求使用表格或并列结构，列出比较维度，而不是只写形容词。
3. 提取要点时限制在真实出现过的信息，标注来源位置（原文片段或节点 ID）。
4. 用户要求留档时，创建文字节点写入分析结果，并用 `arrange_nodes` 放在参考节点旁边。

## 完成标准

输出的是可以直接用于决策的结构化结论。信息不足时明确列出缺口和补充方式，不使用推测填充。
