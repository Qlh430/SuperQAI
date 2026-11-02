---
name: asset-setting
description: 从分镜提取人物场景道具的统一设定与可编辑生图提示词，仅准备图片节点。
canvas:
  label: 资产设定与提示词
  category: image
  icon: image
  hidden: false
  core: false
  required_context: current-canvas
  triggers: [资产设定, 人物四视图, 角色人设图]
  capabilities: [node.image.create, node.connect, node.update, skill.reference.read]
---

# 资产设定与提示词

依据原文与已保存分镜统一人物身份、外观、服装、场景空间和道具状态。人物发送前由用户选角色四视图或角色人设图：四视图含正面、侧面、背面、脸部特写；人设图展示整体、服装、配饰、细节。单项选择优先于批量默认。准确文字作为原文记录保存，不承诺随机生图文字准确。

使用已存在实体身份，保留人工修改、历史结果和布局。只准备待生成图片节点、提示词、引用和分组；图片生成由用户在单项或明确范围批量按钮发送，不运行下游任务。
