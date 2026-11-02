---
name: video-preparation
description: 依据原镜头真实故事板和模型能力准备视频提示词与参考，不执行视频任务。
canvas:
  label: 视频提示词与模型适配
  category: video
  icon: video
  hidden: false
  core: false
  required_context: current-canvas
  triggers: [准备视频, 视频提示词]
  capabilities: [node.video.create, node.connect, node.update, skill.reference.read]
---

# 视频提示词与模型适配

默认每个原镜头一个视频节点。明确动作时间顺序、角色调度和运镜，保留计划时长与模型实际生成时长两个值。只使用所选模型支持的引用方式和真实图片。

单镜故事板可明确用于该镜首帧；多格故事板的首帧或首尾帧需要用户选择或提取对应单独画面，不盲取首格。整体故事板参考须用户明确选择且模型支持。缺图和模型不支持时提供具体中文原因。

只准备提示词、参数、引用与视频节点，必须等待用户单项或明确批量发送。不自动生成视频，不自动配音、字幕或合并成片。图片完成、页面打开和刷新不产生执行授权。
