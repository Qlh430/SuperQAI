(function (root) {
  'use strict';
  root.CanvasFeatureRegistry.registerNode({ id: 'audio-generator', create: point => root.addCanvasAudioGeneratorNode(point) });
})(window);
