const assert=require('node:assert/strict'),path=require('node:path');
const {openFixture,loadModels,settle,snapshot,writeJSON,OUTPUT}=require('./dom-scaling-test-support.cjs');
(async()=>{const fixture=await openFixture();const result={cases:[]};try{
 for(const count of [100,200]){
  await loadModels(fixture,count,'B');await settle(fixture.page,900);
  const idle=await snapshot(fixture.page);
  assert.equal(idle.full,0);assert.equal(idle.svgConnectionPaths,0,'本地Scene普通低缩放连线不应重复挂载SVG');
  assert.equal(idle.scene.connectionCount,idle.modelConnections,'每一条本地连线都必须进入既有Scene');
  const painted=await fixture.page.evaluate(()=>{
   const row=getVisibleCanvasConnections({includeScene:true})[0],layer=canvasSceneLayer,scale=canvasState.scale;
   const x=canvasState.x+(row.from.x+row.to.x)*scale/2,y=canvasState.y+(row.from.y+row.to.y)*scale/2,dpr=layer.devicePixelRatio;
   const pixels=layer.context.getImageData(Math.round((x+layer.padding)*dpr)-2,Math.round((y+layer.padding)*dpr)-2,5,5).data;
   return {edge:{...row.item},from:row.from,to:row.to,x,y,alpha:[...pixels].filter((_,i)=>i%4===3),connections:JSON.stringify(canvasState.connections)};
  });
  assert.ok(painted.alpha.some(v=>v>0),'节点间空白处的真实Canvas连线像素缺失');
  await fixture.page.evaluate(id=>CanvasNodeRepresentation.hydrateNode(id),painted.edge.from);await settle(fixture.page,100);
  const full=await snapshot(fixture.page);assert.ok(full.svgConnectionPaths>=1,'活动Full连线未恢复SVG');
  const port=await fixture.page.evaluate(id=>({actual:getCanvasPortPoint(getCanvasNode(id),'output'),cached:getCanvasConnectionPortPoint(id,'output'),wire:getVisibleCanvasConnections({includeScene:true}).find(r=>String(r.item.from)===String(id))?.from}),painted.edge.from);
  assert.ok(Math.abs(port.wire.y-painted.from.y)<.2,'Scene→Full连线端点纵向漂移');assert.ok(Math.abs(port.wire.x-painted.from.x)<.2,'Scene→Full连线端点横向漂移');
  assert.equal(full.svgConnectionPaths+full.scene.connectionCount,full.modelConnections,'Full/Scene连线重复或缺失');
  await fixture.page.evaluate(id=>{document.activeElement?.blur?.();clearCanvasSelection();CanvasNodeRepresentation.dehydrateNode(id);},painted.edge.from);await settle(fixture.page,100);
  const back=await snapshot(fixture.page);assert.equal(back.svgConnectionPaths,0);assert.equal(back.scene.connectionCount,back.modelConnections);
  const edges=await fixture.page.evaluate(()=>JSON.stringify(canvasState.connections));assert.equal(edges,painted.connections,'升降级修改了原图连接');
  result.cases.push({count,idle,painted,full,port,back});console.log(JSON.stringify({count,canvasDOM:idle.canvasDOM,scene:idle.scene.connectionCount,svg:idle.svgConnectionPaths,port}));
 }
 assert.deepEqual(fixture.errors,[]);result.errors=fixture.errors;
 }finally{writeJSON(path.join(OUTPUT,`${process.env.LABEL||'scene-connections'}.json`),result);await fixture.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
