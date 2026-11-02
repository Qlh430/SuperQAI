(function (root) {
  'use strict';
  root.CanvasFeatureRegistry.registerTool({ id: 'crop', open: ({ node }) => root.openCanvasInlineCrop(node), close: () => root.closeCanvasInlineCrop() });
})(window);
