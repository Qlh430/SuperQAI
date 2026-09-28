(function registerCanvasAssetCollectionPlugin() {
  "use strict";

  const plugins = window.AiOsCanvasNodePlugins;
  const renderer = window.CanvasAssetCollectionNodeRenderer;
  if (!plugins) throw new Error("Canvas node plugin host must load before canvas node plugins.");
  if (!renderer) throw new Error("Canvas asset collection node renderer must load before canvas node plugins.");

  plugins.register({
    id: "asset-collection",
    label: "素材合集节点",
    render(node, value, context) {
      renderer.render(node, value, context);
    },
  });
})();
