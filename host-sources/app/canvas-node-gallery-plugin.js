(function registerCanvasGalleryNodePlugin() {
  "use strict";

  const plugins = window.AiOsCanvasNodePlugins;
  const renderer = window.CanvasGalleryNodeRenderer;
  if (!plugins) throw new Error("Canvas node plugin host must load before canvas node plugins.");
  if (!renderer) throw new Error("Canvas gallery node renderer must load before canvas node plugins.");

  plugins.register({
    id: "gallery",
    label: "图集节点",
    render(node, value, options, context) {
      renderer.render(node, value, options, context);
    },
  });
})();
