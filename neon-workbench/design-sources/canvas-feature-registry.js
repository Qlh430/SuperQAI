(function (root) {
  'use strict';
  // One release policy serves UI menus, commands and the Agent catalog. It
  // governs creation only; historical renderers and persisted data stay valid.
  const retired = new Set(['gallery', 'gallery-container', 'crop-gallery', 'loop']);
  const retiredTools = new Set(['create_gallery_node', 'create_loop_node', 'generate_image_to_gallery', 'extract_grid_to_gallery']);
  const isNodeCreationAllowed = (id, flags = {}) => !retired.has(String(id)) && (id !== 'script-production' || flags.scriptNodes === true);
  const isCapabilityAvailable = name => !retiredTools.has(String(name));
  root.CanvasNodeCreationPolicy = Object.freeze({ isNodeCreationAllowed, isCapabilityAvailable });
  function createRegistry(releaseFlags = {}) {
    const tools = new Map(), nodes = new Map();
    // Creation availability is independent of historical renderer/storage kinds.
    const available = id => isNodeCreationAllowed(id, releaseFlags);
    const toolIds = new Set(['upscale', 'cutout', 'crop', 'outpaint', 'angle']);
    const nodeIds = new Set(['image-generator', 'video-generator', 'audio-generator', 'text', 'note', 'script-production', 'asset-upload', ...retired]);
    const idOf = definition => { const id = String(definition?.id || ''); if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Error('功能标识无效。'); return id; };
    function notify() { root.dispatchEvent?.(new root.CustomEvent('canvas:featureschange')); }
    function register(map, ids, definition, method) {
      const id = idOf(definition); if (typeof definition[method] !== 'function') throw new Error(`功能 ${id} 缺少入口。`);
      if (map.has(id)) throw new Error(`功能 ${id} 已注册。`);
      ids.add(id); map.set(id, Object.freeze({ ...definition })); notify(); return id;
    }
    function closeOne(definition, onError) { try { definition?.close?.(); } catch (error) { onError?.(error, definition.id); } }
    const api = {
      registerTool: definition => register(tools, toolIds, definition, 'open'),
      registerNode: definition => register(nodes, nodeIds, definition, 'create'),
      unregisterTool(id) { closeOne(tools.get(id)); tools.delete(id); notify(); },
      unregisterNode(id) { nodes.delete(id); notify(); },
      hasTool: id => tools.has(id), hasNode: id => nodes.has(id) && available(id),
      ownsNode: id => nodeIds.has(id),
      canCreateNode: available,
      listTools: () => [...tools.keys()], listNodes: () => [...nodes.keys()].filter(available),
      async openTool(id, context) {
        try { const tool = tools.get(id); if (!tool) throw new Error('该工具组件未启用。'); return await tool.open(context); }
        catch (error) { context?.onError?.(error); return false; }
      },
      closeViews(onError) { for (const definition of tools.values()) closeOne(definition, onError); },
      createNode(id, point, options) { if (!available(id)) throw new Error(id === 'script-production' ? '本版本暂未开放脚本节点创建。' : '该节点已停用，请使用标准组与独立素材节点。'); const node = nodes.get(id); if (!node) throw new Error('该节点组件未启用。'); return node.create(point, options); },
      syncControls(scope = root.document) {
        if (!scope?.querySelectorAll) return;
        for (const button of scope.querySelectorAll('[data-flora-action]')) {
          const id = button.dataset.floraAction; if (!toolIds.has(id)) continue;
          if (!tools.has(id)) { button.hidden = true; button.dataset.featureDisabled = 'true'; }
          else if (button.dataset.featureDisabled) { delete button.dataset.featureDisabled; button.hidden = false; }
        }
        for (const button of scope.querySelectorAll('[data-canvas-node], [data-connect-node]')) {
          const id = button.dataset.canvasNode || button.dataset.connectNode;
          if (!nodeIds.has(id)) continue;
          if (!nodes.has(id) || !available(id)) {
            if (!button.dataset.featureDisabled) button.dataset.featureHiddenBefore = String(button.hidden);
            button.dataset.featureDisabled = 'true'; button.hidden = true;
          } else if (button.dataset.featureDisabled) {
            button.hidden = button.dataset.featureHiddenBefore === 'true';
            delete button.dataset.featureDisabled; delete button.dataset.featureHiddenBefore;
          }
        }
      },
    };
    return Object.freeze(api);
  }
  if (typeof module === 'object' && module.exports) module.exports = { createRegistry, isNodeCreationAllowed, isCapabilityAvailable };
  else root.CanvasFeatureRegistry = createRegistry(root.AI_OS_RELEASE_FLAGS);
})(typeof window === 'object' ? window : globalThis);
