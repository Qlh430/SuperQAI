const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const scope={module:{exports:{}}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'design-sources/canvas-feature-registry.js'),'utf8'),scope);
const {createRegistry,isNodeCreationAllowed,isCapabilityAvailable}=scope.module.exports;
const registry=createRegistry();
for(const id of ['gallery','gallery-container','crop-gallery','loop','script-production']){
 assert.equal(isNodeCreationAllowed(id),false,id);assert.equal(registry.ownsNode(id),true,id);
 assert.throws(()=>registry.createNode(id,{}),/停用|开放/);
 const b={dataset:{connectNode:id},hidden:false};registry.syncControls({querySelectorAll:s=>s.includes('data-canvas-node')?[b]:[]});assert.equal(b.hidden,true,id);
}
for(const id of ['create_gallery_node','create_loop_node','generate_image_to_gallery','extract_grid_to_gallery'])assert.equal(isCapabilityAvailable(id),false,id);
assert.equal(isNodeCreationAllowed('text'),true);assert.equal(isCapabilityAvailable('create_text_node'),true);
assert.equal(isNodeCreationAllowed('script-production',{scriptNodes:true}),true);
console.log('central release creation policy passed');
