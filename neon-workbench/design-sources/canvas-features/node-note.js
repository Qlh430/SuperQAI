(function (root) {
  'use strict';
  root.CanvasFeatureRegistry.registerNode({ id: 'note', create: (point, options) => root.addCanvasNote(point, options) });
})(window);
