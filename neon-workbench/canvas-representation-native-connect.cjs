const assert=require('node:assert/strict'),path=require('node:path');
const {openFixture,loadModels,settle,snapshot,writeJSON,OUTPUT}=require('./dom-scaling-test-support.cjs');
(async()=>{const fixture=await openFixture();const report={cases:[]};try{
 for(const scenario of ['A','B']){
  await loadModels(fixture,100,scenario);await settle(fixture.page,800);
  await fixture.page.evaluate(async()=>{document.activeElement?.blur?.();clearCanvasSelection();await CanvasNodeRepresentation.hydrateNode('1');selectCanvasNode(getCanvasNode('1'));CanvasNodeRepresentation.dehydrateNode('2');});await settle(fixture.page,750);
  const body=await fixture.page.evaluate(()=>{const r=getCanvasNode('1').querySelector('.flora-node-content').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};});await fixture.page.mouse.move(body.x,body.y);await settle(fixture.page,100);
  const points=await fixture.page.evaluate(()=>{const node=getCanvasNode('1'),port=node.querySelector('[data-canvas-port="output"]'),p=port.getBoundingClientRect(),v=document.querySelector('#infiniteCanvas').getBoundingClientRect(),target=getCanvasRepresentationVisualBounds(canvasVirtualStore.get('2'));return{source:{x:p.left+p.width/2,y:p.top+p.height/2},target:{x:v.left+canvasState.x+(target.left+target.right)*canvasState.scale/2,y:v.top+canvasState.y+(target.top+target.bottom)*canvasState.scale/2},targetFull:!!getCanvasNode('2')};});
  assert.equal(points.targetFull,false,'必须在目标没有Full的前提下测试');
  await fixture.page.mouse.move(points.source.x,points.source.y);await fixture.page.mouse.down();
  const started=await fixture.page.evaluate(()=>({pending:canvasState.pendingConnection,temp:!!canvasState.tempConnection}));assert.ok(started.temp,'原生端口拖线未真实开始');
  const previewUI=await fixture.page.evaluate(()=>{const p=document.querySelector('#canvasActiveWireMask path'),toolbar=getCanvasNode('1').querySelector('.flora-node-toolbar'),v=document.querySelector('#infiniteCanvas').getBoundingClientRect(),r=toolbar.getBoundingClientRect();const x=(toSystemDelta(r.left+r.width/2-v.left)-canvasState.x)/canvasState.scale,y=(toSystemDelta(r.top+r.height/2-v.top)-canvasState.y)/canvasState.scale;return{exists:!!p,toolbarVisible:r.width>0&&r.height>0,toolbarCovered:p?!p.isPointInFill(new DOMPoint(x,y)):null};});assert.ok(previewUI.exists,'active preview must respect the toolbar layer');if(previewUI.toolbarVisible)assert.equal(previewUI.toolbarCovered,false,'active preview must not paint over toolbar');

  await fixture.page.mouse.move(points.target.x,points.target.y,{steps:5});await fixture.page.mouse.up();await settle(fixture.page,180);
  const after=await fixture.page.evaluate(()=>({edge:canvasState.connections.find(e=>e.from==='1'&&e.to==='2'),menu:canvasState.connectMenu,snapshot:__domScalingSnapshot()}));
  report.cases.push({scenario,points,after});assert.ok(after.edge,'原生拖线到Scene目标未建立连接');assert.ok(after.snapshot.full<=5,'普通连接超过Full预算');
  console.log(JSON.stringify({scenario,edge:after.edge,full:after.snapshot.full}));
  await fixture.page.evaluate(async()=>{document.activeElement?.blur?.();clearCanvasSelection();disconnectCanvasNodes('1','2','output','input');await CanvasNodeRepresentation.hydrateNode('2');selectCanvasNode(getCanvasNode('2'));CanvasNodeRepresentation.dehydrateNode('1');});await settle(fixture.page,750);
  const targetBody=await fixture.page.evaluate(()=>{const r=getCanvasNode('2').querySelector('.flora-node-content').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};});await fixture.page.mouse.move(targetBody.x,targetBody.y);await settle(fixture.page,100);
  const reverse=await fixture.page.evaluate(()=>{const p=getCanvasNode('2').querySelector('[data-canvas-port="input"]').getBoundingClientRect(),v=document.querySelector('#infiniteCanvas').getBoundingClientRect(),r=getCanvasRepresentationVisualBounds(canvasVirtualStore.get('1'));return{port:{x:p.left+p.width/2,y:p.top+p.height/2},source:{x:v.left+canvasState.x+(r.left+r.right)*canvasState.scale/2,y:v.top+canvasState.y+(r.top+r.bottom)*canvasState.scale/2},sourceFull:!!getCanvasNode('1')};});
  assert.equal(reverse.sourceFull,false);await fixture.page.mouse.move(reverse.port.x,reverse.port.y);await fixture.page.mouse.down();assert.ok(await fixture.page.evaluate(()=>!!canvasState.tempConnection));await fixture.page.mouse.move(reverse.source.x,reverse.source.y,{steps:5});await fixture.page.mouse.up();await settle(fixture.page,180);
  const reversed=await fixture.page.evaluate(()=>({edge:canvasState.connections.find(e=>e.from==='1'&&e.to==='2'),snapshot:__domScalingSnapshot()}));assert.ok(reversed.edge,'原生输入端口反向拖到Scene来源未建立连接');assert.ok(reversed.snapshot.full<=5);report.cases.push({scenario,direction:'input',reverse,reversed});console.log(JSON.stringify({scenario,direction:'input',edge:reversed.edge,full:reversed.snapshot.full}));
 }
 assert.deepEqual(fixture.errors,[]);report.errors=fixture.errors;
 }finally{writeJSON(path.join(OUTPUT,`${process.env.LABEL||'native-connect'}.json`),report);await fixture.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
