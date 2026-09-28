(function registerCanvasVideoApiNodePlugin() {
  "use strict";

  const plugins = window.AiOsCanvasNodePlugins;
  const renderer = window.CanvasVideoApiNodeRenderer;
  if (!plugins) throw new Error("Canvas node plugin host must load before canvas node plugins.");
  if (!renderer) throw new Error("Canvas API video node renderer must load before canvas node plugins.");

  plugins.register({
    id: "video-api",
    label: "API 视频节点",
    render(node, options, context) {
      renderer.render(node, options, context);
    },
  });
})();
