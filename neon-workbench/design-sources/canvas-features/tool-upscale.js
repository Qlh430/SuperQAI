(function (root) {
  'use strict';
  root.CanvasFeatureRegistry.registerTool({ id: 'upscale', open: ({ node }) => root.openCanvasImageToolPanel(node, 'upscale'), close: () => root.document.querySelectorAll('.canvas-node[data-flora-tool-panel="upscale"]').forEach(node => root.closeCanvasImageToolPanel(node)) });
})(window);
