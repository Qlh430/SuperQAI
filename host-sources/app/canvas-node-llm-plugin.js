(function registerCanvasLlmNodePlugin() {
  "use strict";

  const plugins = window.AiOsCanvasNodePlugins;
  const renderer = window.CanvasLlmNodeRenderer;
  if (!plugins) throw new Error("Canvas node plugin host must load before canvas node plugins.");
  if (!renderer) throw new Error("Canvas LLM node renderer must load before canvas node plugins.");

  plugins.register({
    id: "llm",
    label: "LLM 文本节点",
    render(node, options, context) {
      renderer.render(node, options, context);
    },
  });
})();
