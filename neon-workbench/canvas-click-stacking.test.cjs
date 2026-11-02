const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'design-sources/script-before-save-bridge.js'), 'utf8');
const start = source.indexOf('function syncCanvasNodeStacking(');
const end = source.indexOf('function selectCanvasNode(');
const scope = {
  canvasState: { selectedIds: new Set(), selectedSceneItems: new Map() },
  canvasVirtualStore: { mountedElements: () => [], get: id => scope.models.get(String(id)) },
  canvasNodeStackClock: 0,
  models: new Map(),
  document: { activeElement: null },
  scheduleCanvasSceneRender() {},
  syncCanvasNodeModel: node => scope.models.get(String(node.dataset.id)),
};
scope.getCanvasInteractionIds = () => new Set(scope.canvasState.selectedIds);
function node(id) {
  return { dataset: { id, zOrder: id === 'first' ? '1' : '2' }, isConnected: true, classList: { contains: () => false }, matches: () => false, style: { zIndex: '', setProperty() {} } };
}
const first = node('first');
const second = node('second');
scope.nodes = [first, second];
scope.canvasVirtualStore.mountedElements = () => scope.nodes;
scope.models.set('first', { id: 'first', kind: 'image', zOrder: 1 });
scope.models.set('second', { id: 'second', kind: 'image', zOrder: 2 });
vm.createContext(scope);
vm.runInContext(source.slice(start, end), scope);

scope.bringCanvasNodeToFront(first);
scope.canvasState.selectedIds.clear();
scope.syncCanvasNodeStacking();
assert.ok(Number(first.style.zIndex) > Number(second.style.zIndex), '点击后的节点在点击画布后仍应保持最上层');

scope.bringCanvasNodeToFront(second);
scope.canvasState.selectedIds.clear();
scope.syncCanvasNodeStacking();
assert.ok(Number(second.style.zIndex) > Number(first.style.zIndex), '点击另一个节点后最上层应切换到新节点');
console.log('canvas click stacking persistence passed');

const bridge = fs.readFileSync(path.join(__dirname, 'design-sources/script-before-save-bridge.js'), 'utf8');
assert.match(
  bridge,
  /if \(event\.button === 0\) bringCanvasNodeToFront\(node\);\s*if \(!node\.classList\.contains\("is-selected"\)\) selectCanvasNode\(node\);/,
  '再次点击已选中的节点也必须重新提升它的显示层级',
);
