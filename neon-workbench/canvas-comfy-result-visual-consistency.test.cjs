const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = __dirname;

function resolveGeometry(model) {
  const source = fs.readFileSync(path.join(root, 'design-sources/script-before-save-bridge.js'), 'utf8');
  const start = source.indexOf('function resolveNodeVisualGeometry(');
  const end = source.indexOf('\n}', start + 10) + 2;
  assert.ok(start >= 0 && end > start, 'shared node geometry resolver is available');
  const sandbox = {
    model,
    window: {
      CanvasVirtualizationRules: {
        getNodeRect: item => ({ left: item.x, top: item.y, right: item.x + item.width, bottom: item.y + item.height }),
      },
    },
    canvasVirtualStore: { get: () => model, getRect: () => null, getMounted: () => null },
    canvasImageDimensions: new Map(),
    canvasSceneTextureCache: new Map(),
    getCanvasRepresentationVisualBounds: (_item, rect) => rect,
  };
  return vm.runInNewContext(`${source.slice(start, end)}\nresolveNodeVisualGeometry(model)`, sandbox, { timeout: 1000 });
}

function resolveIdentity(model, registry) {
  const source = fs.readFileSync(path.join(root, 'design-sources/canvas-representation-host.js'), 'utf8');
  const sandbox = { CanvasFloraNodeShell: { META: { generator: { label: '图片生成', icon: 'image', tone: 'accent' }, comfy: { label: 'ComfyUI', icon: 'workflow', tone: 'accent' } } } };
  if (registry) sandbox.AiOsCanvasNodeRegistry = registry;
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox, { timeout: 1000 });
  return sandbox.CanvasRepresentationVisualIdentity(model);
}

test('the registered image-generator node uses the same image icon as its Flora full representation', () => {
  const registrySource = fs.readFileSync(path.join(root, '../host-sources/app/core/canvas-node-registry.js'), 'utf8');
  const catalogSource = fs.readFileSync(path.join(root, '../host-sources/app/canvas-node-catalog.js'), 'utf8');
  const registryRoot = {};
  registryRoot.window = registryRoot;
  vm.runInNewContext(registrySource, registryRoot, { timeout: 1000 });
  vm.runInNewContext(catalogSource, registryRoot, { timeout: 1000 });

  const generator = registryRoot.AiOsCanvasNodeRegistry.getNode('generator');
  const full = resolveIdentity({ kind: 'image', uploadOnly: false }, registryRoot.AiOsCanvasNodeRegistry);

  assert.equal(generator.meta.icon, 'image');
  assert.equal(full.icon, generator.meta.icon);
});

function resolveSceneRows(page, models = {}) {
  const source = fs.readFileSync(path.join(root, 'design-sources/script-before-save-bridge.js'), 'utf8');
  const start = source.indexOf('function getCanvasSceneVisualNodes(');
  const end = source.indexOf('\nfunction reprojectCanvasSceneLayer(', start);
  assert.ok(start >= 0 && end > start, 'scene visual row resolver is available');
  const sandbox = {
    page,
    canvasVirtualStore: {
      get: id => models[String(id)] || null,
      getMounted: () => null,
    },
    canvasPagedStore: {
      deletedNodeIds: new Set(),
      getPendingOperations: () => [],
    },
    canvasState: {
      selectionDragging: false,
      selectedSceneItems: new Map(),
    },
    window: {
      CanvasRepresentationVisualIdentity: model => resolveIdentity(model),
    },
  };
  return vm.runInNewContext(`${source.slice(start, end)}\ngetCanvasSceneVisualNodes(page)`, sandbox, { timeout: 1000 });
}

test('ComfyUI image results use the same borderless scene surface as API image results without changing node geometry', () => {
  const common = { id: 'result', x: 20, y: 30, width: 640, height: 420, mediaSizeMode: 'manual', nodeTitle: '图片生成' };
  const api = resolveGeometry({ ...common, kind: 'image', imageSrc: '/api-result.png', resultSrc: '/api-result.png' });
  const comfy = resolveGeometry({ ...common, kind: 'comfy', resultSrc: '/comfy-result.png' });

  assert.equal(api.bodySurface, false);
  assert.equal(comfy.bodySurface, false, 'a rendered ComfyUI image result must not paint a light-mode card border');
  assert.equal(JSON.stringify(comfy.outerBounds), JSON.stringify(api.outerBounds), 'presentation correction must preserve node dimensions');
  assert.equal(JSON.stringify(comfy.mediaBounds), JSON.stringify(comfy.contentBounds), 'result image remains edge-to-edge');
});

test('ComfyUI image results use the Flora generator icon while empty ComfyUI nodes retain workflow identity', () => {
  const common = { nodeTitle: '图片生成' };
  const comfy = resolveIdentity({ ...common, kind: 'comfy', resultSrc: '/comfy-result.png' });
  const emptyComfy = resolveIdentity({ ...common, kind: 'comfy' });

  assert.equal(comfy.icon, 'image');
  assert.equal(comfy.tone, 'accent');
  assert.equal(comfy.kind, 'comfy', 'native node kind remains unchanged');
  assert.equal(emptyComfy.icon, 'workflow', 'ComfyUI without an image result keeps its workflow identity');
});

test('legacy unselected image generator nodes normalize their scene icon to image', () => {
  const legacyGenerator = resolveIdentity({
    nodeTitle: '图片生成',
    kind: 'image',
    uploadOnly: false,
    imageSrc: '/generated.png',
    resultSrc: '/generated.png',
    icon: 'sparkles',
  });

  assert.equal(legacyGenerator.icon, 'image');
});

test('uploaded image nodes keep the upload icon when they carry an image source', () => {
  const upload = resolveIdentity({
    kind: 'image',
    uploadOnly: true,
    imageSrc: '/uploaded.png',
  });

  assert.equal(upload.icon, 'image-plus');
});

test('scene rows keep the generator icon when a legacy resident model still stores sparkles', () => {
  const rows = resolveSceneRows({
    visualNodes: [{ id: 'legacy-generator', kind: 'image', x: 0, y: 0, width: 400, height: 400, icon: 'sparkles' }],
    occludedStacks: [],
  }, {
    'legacy-generator': { id: 'legacy-generator', kind: 'image', icon: 'sparkles', nodeTitle: '图片生成' },
  });

  assert.equal(rows[0].icon, 'image');
});

test('ComfyUI image result scene rows ignore the stale workflow icon', () => {
  const rows = resolveSceneRows({
    visualNodes: [{ id: 'comfy-result', kind: 'comfy', x: 0, y: 0, width: 400, height: 400, icon: 'sparkles' }],
    occludedStacks: [],
  }, {
    'comfy-result': { id: 'comfy-result', kind: 'comfy', icon: 'sparkles', resultSrc: '/result.png', nodeTitle: '图片生成' },
  });

  assert.equal(rows[0].icon, 'image');
});
