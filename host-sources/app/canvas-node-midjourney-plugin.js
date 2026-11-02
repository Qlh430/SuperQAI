(function registerCanvasMidjourneyNodePlugin() {
  "use strict";

  const plugins = window.AiOsCanvasNodePlugins;
  const renderer = window.CanvasMidjourneyNodeRenderer;
  if (!plugins) throw new Error("Canvas node plugin host must load before canvas node plugins.");
  if (!renderer) throw new Error("Canvas Midjourney node renderer must load before canvas node plugins.");

  plugins.register({
    id: "midjourney",
    label: "Midjourney 节点",
    render(node, options, context) {
      renderer.render(node, options, context);
    },
  });
})();
