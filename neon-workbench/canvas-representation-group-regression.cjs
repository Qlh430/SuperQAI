const assert=require('node:assert/strict'),path=require('node:path');
const {openFixture,settle,writeJSON,OUTPUT}=require('./dom-scaling-test-support.cjs');
(async()=>{const fixture=await openFixture();const checks=[];try{
 const setup=await fixture.page.evaluate(async()=>{
  const nodes=['1','2'].map((id,index)=>({...__domScalingSeeds[0],id,x:160+index*500,y:180,width:400,height:400,resultSrc:__domScalingPNG,resultDownloadUrl:__domScalingPNG,generationHistory:[{id:`h-${id}`,kind:'image',src:__domScalingPNG}],currentGenerationId:`h-${id}`,nodeTitle:`组成员${id}`,zOrder:index+1}));
  restoreCanvasBoard({id:'dom-scaling-mock-board',title:'表示层组回归',nodes,connections:[],viewport:{x:60,y:60,scale:.65}});canvasState.activeBoardPersisted=false;
  canvasState.isRestoring=false;const a=await CanvasNodeRepresentation.hydrateNode('1'),b=await CanvasNodeRepresentation.hydrateNode('2');
  clearCanvasSelection();addCanvasNodeToSelection(a);addCanvasNodeToSelection(b);const group=await createCanvasSceneGroup();
  const id=group.dataset.id;syncCanvasNodeModel(group);clearCanvasSelection();document.activeElement?.blur?.();CanvasNodeRepresentation.reconcile();
  const model=toCanvasOperationNode(canvasVirtualStore.get(id));
  const memberHeaderTop=Math.min(...model.groupMembers.map(memberId=>resolveNodeVisualGeometry(memberId).identityBounds.top));
  return {id,model,memberHeaderTop};
 });
 await settle(fixture.page,900);
 const before=await fixture.page.evaluate(id=>{
  const region=canvasSceneLayer.hitRegions.find(r=>r.id===id);if(!region)throw new Error('普通组框没有Canvas表示');
  const v=document.querySelector('#infiniteCanvas').getBoundingClientRect();let target;
  for(const [fx,fy]of [[.02,.02],[.98,.98],[.5,.02],[.02,.5]]){const x=region.left+(region.right-region.left)*fx,y=region.top+(region.bottom-region.top)*fy;if(canvasSceneLayer.hitTest(x,y)?.id===id&&!document.elementFromPoint(x+v.left,y+v.top)?.closest('[data-canvas-light-id],.canvas-node')){target={x:x+v.left,y:y+v.top};break;}}
  return {target,model:toCanvasOperationNode(canvasVirtualStore.get(id)),snapshot:__domScalingSnapshot()};
 },setup.id);
 assert.ok(before.target,'没有实际组框空白命中点');assert.equal(before.snapshot.full,0);checks.push('普通组框Canvas，成员Light/Canvas，层级可命中');
 assert.ok(before.model.y+16<=setup.memberHeaderTop,'普通组框边界必须包含浮动成员标题区');
 await fixture.page.screenshot({path:path.join(OUTPUT,'group-representation-before.png')});
 await fixture.page.mouse.click(before.target.x,before.target.y);await settle(fixture.page,180);
 const active=await fixture.page.evaluate(id=>({full:!!getCanvasNode(id),selected:canvasState.selectedIds.has(id),model:toCanvasOperationNode(canvasVirtualStore.get(id)),snapshot:__domScalingSnapshot()}),setup.id);
 assert.ok(active.full&&active.selected,'原生组框点击未恢复同一组');assert.ok(active.snapshot.full<=5,'三节点组交互突破预算');assert.deepEqual(active.model.groupMembers,before.model.groupMembers);
 const fidelity=await fixture.page.evaluate(id=>{const g=getCanvasNode(id),title=g?.querySelector('[aria-label="组名称"]')?.getBoundingClientRect();const members=(g?.dataset.groupMembers?JSON.parse(g.dataset.groupMembers):[]).map(memberId=>getCanvasNode(memberId)?.querySelector('.flora-node-label')?.getBoundingClientRect()).filter(Boolean);return{title:title?.toJSON(),members:members.map(r=>r.toJSON()),overlap:members.some(r=>title&&title.left<r.right&&title.right>r.left&&title.top<r.bottom&&title.bottom>r.top)};},setup.id);
 assert.equal(fidelity.overlap,false,'Scene→Full 后组名不能覆盖成员身份标题');checks.push('Scene→Full标题不重叠');checks.push('原生组框点击→Full，保留成员与层级');
 await fixture.page.screenshot({path:path.join(OUTPUT,'group-representation-full.png')});
 await fixture.page.evaluate(()=>{document.activeElement?.blur?.();clearCanvasSelection();});await settle(fixture.page,800);
 const after=await fixture.page.evaluate(id=>({full:!!getCanvasNode(id),model:toCanvasOperationNode(canvasVirtualStore.get(id)),snapshot:__domScalingSnapshot()}),setup.id);
 assert.equal(after.full,false);assert.deepEqual(after.model.groupMembers,before.model.groupMembers);assert.equal(after.snapshot.total,3);checks.push('Full→Canvas保留组与两成员');
 assert.deepEqual(fixture.errors,[]);writeJSON(path.join(OUTPUT,'group-representation.json'),{setup,before,active,after,checks,errors:fixture.errors});console.log(JSON.stringify({checks,errors:fixture.errors}));
 }finally{await fixture.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
