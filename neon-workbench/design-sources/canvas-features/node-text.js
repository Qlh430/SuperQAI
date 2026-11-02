(function (root) {
  'use strict';
  root.CanvasFeatureRegistry.registerNode({ id: 'text', create: (point, options) => root.addCanvasText(point, options) });
})(window);
