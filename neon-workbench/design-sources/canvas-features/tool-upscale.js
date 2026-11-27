(function (root) {
  'use strict';
  const resolutions = [2048, 4096];
  async function inspect({ signal } = {}) {
    try {
      const response = await root.fetch('/api/upscale2', { cache: 'no-store', signal });
      const data = await response.json();
      const supported = resolutions.filter(value => data.resolutions?.includes(value));
      if (response.ok && data.available === true && supported.length) {
        return { ok: true, available: true, input: 'image', resolutions: supported };
      }
      return { ok: false, state: 'unavailable', code: 'plugin_unavailable', error: data.error || '图片超清暂不可用。' };
    } catch (error) {
      if (signal?.aborted) throw error;
      return { ok: false, state: 'unavailable', code: 'plugin_unavailable', error: '无法连接图片超清服务。' };
    }
  }
  root.CanvasFeatureRegistry.registerTool({
    id: 'upscale',
    open: ({ node }) => root.openCanvasImageToolPanel(node, 'upscale', { resolutions }),
    close: () => root.document.querySelectorAll('.canvas-node[data-flora-tool-panel="upscale"]').forEach(node => root.closeCanvasImageToolPanel(node)),
    inspect,
    async execute({ node, resolution, signal, guard, onProgress, expectedSource }) {
      if (!resolutions.includes(resolution)) {
        return { ok: false, state: 'failed', code: 'invalid_arguments', error: '超清长边仅支持 2K 或 4K。' };
      }
      return root.runCanvasImageTool(node, 'upscale', { resolution, signal, guard, onProgress, expectedSource, structured: true });
    },
  });
})(window);
