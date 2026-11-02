(function (root) {
  'use strict';
  root.CanvasFeatureRegistry.registerTool({ id: 'cutout', open: ({ node, memberId }) => root.openCanvasCutoutWorkbench(node, memberId), close: () => root.BackgroundRemovalUi?.close?.() });
})(window);
