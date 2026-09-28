(function registerCanvasVideoOutputNodePlugin() {
  "use strict";

  const plugins = window.AiOsCanvasNodePlugins;
  const renderer = window.CanvasVideoOutputNodeRenderer;
  if (!plugins) throw new Error("Canvas node plugin host must load before canvas node plugins.");
  if (!renderer) throw new Error("Canvas video output node renderer must load before canvas node plugins.");

  plugins.register({
    id: "video-output",
    label: "视频输出节点",
    render(node, options, context) {
      renderer.render(node, options, context);
    },
  });
})();
