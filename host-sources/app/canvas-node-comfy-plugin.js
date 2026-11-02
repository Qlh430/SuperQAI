(function registerCanvasComfyNodePlugin() {
  "use strict";

  const plugins = window.AiOsCanvasNodePlugins;
  const renderer = window.CanvasComfyNodeRenderer;
  if (!plugins) throw new Error("Canvas node plugin host must load before canvas node plugins.");
  if (!renderer) throw new Error("Canvas ComfyUI node renderer must load before canvas node plugins.");

  plugins.register({
    id: "comfy",
    label: "ComfyUI 图片节点",
    render(node, options, context) {
      renderer.render(node, options, context);
    },
  });
})();
