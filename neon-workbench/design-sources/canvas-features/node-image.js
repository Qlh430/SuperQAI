(function (root) {
  'use strict';
  root.CanvasFeatureRegistry.registerNode({ id: 'image-generator', create: point => root.addCanvasImageGeneratorNode(point) });
})(window);
