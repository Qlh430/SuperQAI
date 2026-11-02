(function registerCanvasMediaNodePlugins() {
  "use strict";

  const plugins = window.AiOsCanvasNodePlugins;
  const renderer = window.CanvasMediaNodeRenderer;
  if (!plugins) throw new Error("Canvas node plugin host must load before canvas node plugins.");
  if (!renderer) throw new Error("Canvas media node renderer must load before canvas node plugins.");

  plugins.register({
    id: "upload",
    label: "图片素材节点",
    render(node, options, context) {
      renderer.renderUpload(node, options, context);
    },
  });

  plugins.register({
    id: "video",
    label: "视频素材节点",
    render(node, options, context) {
      renderer.renderMedia(node, "video", options, context);
    },
  });

  plugins.register({
    id: "audio",
    label: "音频素材节点",
    render(node, options, context) {
      renderer.renderMedia(node, "audio", options, context);
    },
  });
})();
