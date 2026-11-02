(function registerCanvasDirector3dNodePlugin() {
  "use strict";

  const plugins = window.AiOsCanvasNodePlugins;
  const renderer = window.CanvasDirector3dNodeRenderer;
  if (!plugins) throw new Error("Canvas node plugin host must load before canvas node plugins.");
  if (!renderer) throw new Error("Canvas 3D director node renderer must load before canvas node plugins.");

  plugins.register({
    id: "director3d",
    label: "3D 导演台节点",
    render(node, options, context) {
      renderer.render(node, options, context);
    },
  });
})();
