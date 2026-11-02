(function (root) {
  'use strict';
  root.CanvasFeatureRegistry.registerTool({ id: 'angle', open: ({ node }) => root.openCanvasAngleDialog(node), close: () => root.closeCanvasAngleDialog() });
})(window);
