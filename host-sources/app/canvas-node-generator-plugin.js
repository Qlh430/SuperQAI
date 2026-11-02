(function registerCanvasGeneratorNodePlugin() {
  "use strict";

  const plugins = window.AiOsCanvasNodePlugins;
  const renderer = window.CanvasGeneratorNodeRenderer;
  if (!plugins) throw new Error("Canvas node plugin host must load before canvas node plugins.");
  if (!renderer) throw new Error("Canvas generator node renderer must load before canvas node plugins.");

  plugins.register({
    id: "generator",
    label: "图片生成节点",
    render(node, options, context) {
      renderer.render(node, options, context);
    },
  });
})();
