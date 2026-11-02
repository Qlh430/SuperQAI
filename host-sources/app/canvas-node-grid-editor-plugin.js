(function registerCanvasGridEditorNodePlugin() {
  "use strict";

  const plugins = window.AiOsCanvasNodePlugins;
  const renderer = window.CanvasGridEditorNodeRenderer;
  if (!plugins) throw new Error("Canvas node plugin host must load before canvas node plugins.");
  if (!renderer) throw new Error("Canvas grid editor node renderer must load before canvas node plugins.");

  plugins.register({
    id: "grid-editor",
    label: "宫格编辑节点",
    render(node, stateValue, context) {
      renderer.render(node, stateValue, context);
    },
  });
})();
