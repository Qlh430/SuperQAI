(function (root) {
  'use strict';
  root.CanvasFeatureRegistry.registerNode({ id: 'video-generator', create: point => root.addCanvasVideoGeneratorNode(point) });
})(window);
