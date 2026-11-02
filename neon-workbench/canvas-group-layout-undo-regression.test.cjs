const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(process.env.GROUP_LAYOUT_SOURCE || require('node:path').join(__dirname, 'design-sources/script-before-save-bridge.js'), 'utf8');
const region = source.slice(source.indexOf('function applyCanvasOperationLocally('), source.indexOf('function stageCanvasOperation('));
const mounted = { dataset: { id: 'group', groupMembers: '["a","b"]', groupLayout: 'grid' } };
const context = {
  canvasPagedStore: { getMounted: () => mounted }, getCanvasNode: () => mounted,
  window: {}, syncCanvasNodeNameFromModel() {}, applyCanvasNodeSize() {}, updateCanvasNodePosition() {},
  syncCanvasNodeStacking() {}, scheduleCanvasSceneRender() {}, dispatchCanvasSelectionChange() {},
};
vm.createContext(context); vm.runInContext(region, context);
for (const layout of ['vertical', 'grid', '']) {
  context.applyCanvasOperationLocally({type:'node.upsert',entityId:'group',after:{id:'group',kind:'group',groupMembers:['a','b'],groupLayout:layout,x:20,y:40,width:500,height:600}});
  // Mounted serialization is authoritative during save: stale DOM metadata must not overwrite the undo model.
  assert.equal(mounted.dataset.groupLayout, layout, 'Undo/Redo must restore mounted group layout before the next serialization');
  assert.deepEqual(JSON.parse(mounted.dataset.groupMembers), ['a','b']);
}
console.log('PASS: mounted group layout follows Undo, Redo and legacy empty layout');
