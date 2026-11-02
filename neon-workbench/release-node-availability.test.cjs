const {test}=require('node:test'),assert=require('node:assert/strict');
const sandbox={module:{exports:{}}};require('node:vm').runInNewContext(require('node:fs').readFileSync(require('node:path').join(__dirname,'design-sources/canvas-feature-registry.js'),'utf8'),sandbox);const {createRegistry}=sandbox.module.exports;
test('3.0.1 hides and blocks script creation without unregistering its saved kind',()=>{
 const r=createRegistry();let called=0;
 r.registerNode({id:'script-production',create(){called++;}});
 r.registerNode({id:'text',create(){return 'text';}});
 assert.equal(r.ownsNode('script-production'),true);
 assert.equal(r.hasNode('script-production'),false);
 assert.equal(r.listNodes().includes('script-production'),false);
 assert.throws(()=>r.createNode('script-production',{}),/本版本暂未开放/);
 assert.equal(called,0);assert.equal(r.createNode('text',{}),'text');
 const button={dataset:{canvasNode:'script-production'},hidden:false};
 r.syncControls({querySelectorAll(selector){return selector.includes('data-canvas-node')?[button]:[];}});
 assert.equal(button.hidden,true);
});
test('an explicit future release flag re-enables the registered creation entry',()=>{
 const r=createRegistry({scriptNodes:true});r.registerNode({id:'script-production',create(){return 42;}});
 assert.equal(r.createNode('script-production'),42);assert.equal(r.hasNode('script-production'),true);
});
