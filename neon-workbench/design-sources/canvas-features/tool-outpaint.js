(function (root) {
  'use strict';
  root.CanvasFeatureRegistry.registerTool({ id: 'outpaint', open: ({ node }) => root.openCanvasInlineOutpaint(node), close: () => root.closeCanvasInlineOutpaint() });
})(window);
