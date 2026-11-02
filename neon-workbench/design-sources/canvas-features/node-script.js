(function (root) {
  'use strict';
  root.CanvasFeatureRegistry.registerNode({ id: 'script-production', create: point => root.CanvasScriptProduction.add(point) });
})(window);
