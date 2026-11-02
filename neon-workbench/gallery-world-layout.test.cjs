const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const rules=require('../host-sources/app/canvas-gallery-rules.js');
test('gallery world layout fits all nine cells independent of camera and preserves row aspect ratios',()=>{
 const members=Array.from({length:9},(_,i)=>({width:256,height:i===8?512:256}));
 const l=rules.floraLayout({members,columns:3,gap:8});
 assert.equal(l.width,400);assert.equal(l.cells.length,9);assert.equal(l.cells[8].height,l.cells[8].width*2);
 assert.ok(l.cells.every(c=>c.x>=0&&c.y>=0&&c.x+c.width<=l.width&&c.y+c.height<=l.height));
 for(const cameraScale of [1,.8,.5,.25])assert.deepEqual(rules.floraLayout({members,columns:3,gap:8,cameraScale}),l);
});
test('legacy text saved envelope cannot change static wrapping width relative to Full 400px body',()=>{
 const source=fs.readFileSync(path.join(__dirname,'design-sources/script-before-save-bridge.js'),'utf8'),start=source.indexOf('function resolveNodeVisualGeometry('),end=source.indexOf('\n}',start+10)+2;
 const model={id:'legacy-text',kind:'text',x:0,y:0,width:292,height:180};
 const sandbox={window:{CanvasVirtualizationRules:{getNodeRect:m=>({left:m.x,top:m.y,right:m.x+m.width,bottom:m.y+m.height})}},canvasVirtualStore:{get:()=>model,getRect:()=>null,getMounted:()=>null},canvasImageDimensions:new Map(),canvasSceneTextureCache:new Map()};
 vm.runInNewContext(source.slice(start,end),sandbox);const g=sandbox.resolveNodeVisualGeometry(model);
 assert.equal(g.contentBounds.right-g.contentBounds.left,384);assert.equal(g.contentBounds.bottom-g.contentBounds.top,384);
});
test('Full gallery fitted height never stores screen pixels as world height',()=>{
 const source=fs.readFileSync(path.join(__dirname,'design-sources/flora-node-shell.js'),'utf8'),start=source.indexOf('  function syncGallerySurfaceHeight('),end=source.indexOf('\n  }',start)+4;
 const world={members:Array.from({length:9},()=>({width:256,height:256})),columns:3,gap:8};
 const sandbox={FLORA_NODE_WIDTH:400,FLORA_NODE_HEIGHT:400,FLORA_GALLERY_STATUS_GAP:16,root:{CanvasGalleryRules:rules}};
 vm.runInNewContext(source.slice(start,end),sandbox);
 for(const scale of [1,.8,.5]){
  const css={},shell={getBoundingClientRect:()=>({top:0,bottom:400*scale,height:400*scale,width:400*scale}),querySelector:()=>null};
  const members={children:[{getBoundingClientRect:()=>({bottom:376*scale})}],closest:()=>null,getBoundingClientRect:()=>({top:24*scale})};
  const node={dataset:{floraKind:'gallery',floraGalleryHeight:'400',galleryContainer:JSON.stringify(world)},querySelector:()=>members,style:{setProperty:(k,v)=>css[k]=v}};
  sandbox.syncGallerySurfaceHeight(node,shell);
  assert.equal(Number(node.dataset.floraGalleryHeight||400),400,`camera ${scale}`);
 }
});
