(function registerCanvasNotePlugin() {
  "use strict";

  const plugins = window.AiOsCanvasNodePlugins;
  const renderer = window.CanvasNoteNodeRenderer;
  if (!plugins) throw new Error("Canvas node plugin host must load before canvas node plugins.");
  if (!renderer) throw new Error("Canvas note node renderer must load before canvas node plugins.");

  plugins.register({
    id: "note",
    label: "便签节点",
    api: {
      normalizeColor: renderer.normalizeColor,
      syncText: renderer.syncText,
      markColor: renderer.markColor,
      setColor: renderer.setColor,
    },
    render(node, options, context) {
      renderer.render(node, options, context);
    },
  });
})();
