(function registerCanvasNodeCatalog() {
  "use strict";

  const registry = window.AiOsCanvasNodeRegistry;
  if (!registry) throw new Error("Canvas node registry must load before the node catalog.");

  [
    { id: "grid-editor", selector: ".canvas-node-grid-editor", icon: "layout-grid", subtitle: "宫格排版与导出", tone: "accent", group: "layout", pluginId: "grid-editor" },
    { id: "director-3d", selector: ".canvas-node-director3d", icon: "box", subtitle: "搭建三维场景与机位", tone: "accent", group: "video", pluginId: "director3d" },
    { id: "minimax-h3", selector: ".canvas-node-minimax-h3", icon: "clapperboard", subtitle: "文生视频与参考生成", tone: "accent", group: "video", pluginId: "minimax-h3" },
    { id: "video-api", selector: ".canvas-node-video-api", icon: "film", subtitle: "API 视频生成", tone: "accent", group: "video", pluginId: "video-api" },
    { id: "gallery", selector: ".canvas-node-gallery-container", icon: "images", subtitle: "生成结果收纳", tone: "neutral", group: "asset", pluginId: "gallery" },
    { id: "asset-video", selector: ".canvas-node-asset-single-video", icon: "video", subtitle: "上传 / 承接", tone: "neutral", group: "asset", pluginId: "asset-collection" },
    { id: "asset-audio", selector: ".canvas-node-asset-single-audio", icon: "audio-lines", subtitle: "上传 / 承接", tone: "neutral", group: "asset", pluginId: "asset-collection" },
    { id: "asset-collection", selector: ".canvas-node-asset-collection", icon: "layers-3", subtitle: "图片、视频与音频素材", tone: "neutral", group: "asset", pluginId: "asset-collection" },
    { id: "midjourney", selector: ".canvas-node-midjourney", icon: "wand-sparkles", subtitle: "Imagine / Edit / Blend", tone: "accent", group: "generate", pluginId: "midjourney" },
    { id: "video-output", selector: ".canvas-node-video-output", icon: "play-square", subtitle: "播放与导出视频", tone: "neutral", group: "asset", pluginId: "video-output" },
    { id: "comfy", selector: ".canvas-node-comfy", icon: "workflow", subtitle: "ComfyUI 工作流生成", tone: "accent", group: "generate", pluginId: "comfy" },
    { id: "llm", selector: ".canvas-node-llm", icon: "bot", subtitle: "文本与视觉问答", tone: "accent", group: "generate", pluginId: "llm" },
    { id: "loop", selector: ".canvas-node-loop", icon: "repeat-2", subtitle: "批量提交同一工作流", tone: "accent", group: "generate", pluginId: "loop" },
    { id: "video", selector: ".canvas-node-video", icon: "video", subtitle: "上传 / 承接", tone: "neutral", group: "asset", pluginId: "video" },
    { id: "audio", selector: ".canvas-node-audio", icon: "audio-lines", subtitle: "上传 / 承接", tone: "neutral", group: "asset", pluginId: "audio" },
    { id: "text", selector: ".canvas-node-text", icon: "type", subtitle: "写下提示词与文案", tone: "accent", group: "prompt", pluginId: "text" },
    { id: "note", selector: ".canvas-node-note", icon: "sticky-note", subtitle: "画布便签", tone: "neutral", group: "prompt", pluginId: "note" },
    { id: "generator", selector: ".canvas-node-generator", icon: "sparkles", subtitle: "文生图与图生图", tone: "accent", group: "generate", pluginId: "generator" },
    { id: "upload", selector: ".canvas-node-image:not(.canvas-node-generator)", icon: "image-plus", subtitle: "上传 / 承接", tone: "neutral", group: "asset", pluginId: "upload" },
  ].forEach(registry.registerNode);
})();
