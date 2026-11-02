---
name: storyboard-preparation
description: 将分镜和真实资产图片编排为故事板提示词和参考映射，仅准备图片节点。
canvas:
  label: 故事板提示词与参考编排
  category: image
  icon: image
  hidden: false
  core: false
  required_context: current-canvas
  triggers: [准备故事板, 合成故事板]
  capabilities: [node.image.create, node.connect, node.update, skill.reference.read]
---

# 故事板提示词与参考编排

读取保存的分镜、统一风格和相关人物场景道具当前实际图片。保留构图、调度、光线和原剧情事实。按用户选择不合并、每两镜、每三镜或按场景自动分组，并保留镜头身份和顺序。多镜按镜头顺序分格，不隐式合并剧情。

引用必须指向具体图片节点及本次采用的真实图。缺图显示资产名称并阻止相应项发送，不使用占位图。上游选用图变化只标记参考需更新，不自动重画。仅创建和预填图片节点；图片请求由用户明确发送。
