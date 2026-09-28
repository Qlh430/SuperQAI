(function registerCanvasLoopNodePlugin() {
  "use strict";

  const plugins = window.AiOsCanvasNodePlugins;
  const renderer = window.CanvasLoopNodeRenderer;
  if (!plugins) throw new Error("Canvas node plugin host must load before canvas node plugins.");
  if (!renderer) throw new Error("Canvas loop node renderer must load before canvas node plugins.");

  plugins.register({
    id: "loop",
    label: "循环节点",
    render(node, options, context) {
      renderer.render(node, options, context);
    },
  });
})();
