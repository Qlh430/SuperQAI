(function (root) {
  'use strict';
  root.CanvasFeatureRegistry.registerNode({ id: 'asset-upload', create: point => { const input = root.document.querySelector('#canvasNodeAssetInput'); delete input.dataset.nodeId; input.dataset.uploadPoint = JSON.stringify(point); input.click(); return null; } });
})(window);
