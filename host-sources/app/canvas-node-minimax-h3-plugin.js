(function registerCanvasMinimaxH3NodePlugin() {
  "use strict";

  const plugins = window.AiOsCanvasNodePlugins;
  const renderer = window.CanvasH3NodeRenderer;
  if (!plugins) throw new Error("Canvas node plugin host must load before canvas node plugins.");
  if (!renderer) throw new Error("Canvas H3 node renderer must load before canvas node plugins.");

  plugins.register({
    id: "minimax-h3",
    label: "MiniMax H3 节点",
    render(node, options, context) {
      renderer.render(node, options, context);
    },
  });
})();
