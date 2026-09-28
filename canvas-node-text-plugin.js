(function registerCanvasTextNodePlugin() {
  "use strict";

  const plugins = window.AiOsCanvasNodePlugins;
  const renderer = window.CanvasTextNodeRenderer;
  if (!plugins) throw new Error("Canvas node plugin host must load before canvas node plugins.");
  if (!renderer) throw new Error("Canvas text node renderer must load before canvas node plugins.");

  plugins.register({
    id: "text",
    label: "文字节点",
    render(node, content, context) {
      renderer.render(node, content, context);
    },
  });
})();
