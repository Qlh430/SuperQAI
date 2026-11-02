const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const runtime=path.resolve(__dirname,'../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app');
const rules=require(path.join(runtime,'canvas-virtualization-rules.js'));
const sandbox={CanvasVirtualizationRules:rules};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'design-sources/canvas-scene-layer.js'),'utf8'),sandbox);
test('padded scene pixels and hit tests track the same projected node throughout zoom',()=>{
 const layer=Object.create(sandbox.CanvasSceneLayer.prototype);
 Object.assign(layer,{canvas:{style:{}},padding:576,lastTransform:{x:60,y:70,scale:.55},hitRegions:[{id:'n',left:170,top:180,right:390,bottom:400}]});
 for(const scale of [.15,.25,.4,.55,.75,1,1.5,2]){
  const next={x:150,y:-90,scale};layer.reproject(next);
  const [tx,ty,ratio]=layer.canvas.style.transform.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px, 0\) scale\(([-\d.]+)\)/).slice(1).map(Number);
  const world={x:200,y:200},local={x:60+576+world.x*.55,y:70+576+world.y*.55};
  const actual={x:-576+tx+ratio*local.x,y:-576+ty+ratio*local.y};
  assert.ok(Math.abs(actual.x-(next.x+world.x*scale))<.001,`scale ${scale}: x drift ${actual.x-(next.x+world.x*scale)}`);
  assert.ok(Math.abs(actual.y-(next.y+world.y*scale))<.001);
  assert.equal(layer.hitTest(next.x+world.x*scale+1,next.y+world.y*scale+1)?.id,'n');
 }
});
