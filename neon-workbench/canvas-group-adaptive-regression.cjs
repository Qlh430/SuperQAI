const assert=require('node:assert/strict'),path=require('node:path');
const S=require('./dom-scaling-test-support.cjs');
const out=path.resolve(__dirname,'../.planning/canvas-group-adaptive-20261016');
(async()=>{const f=await S.openFixture();try{
 const result=await f.page.evaluate(async()=>{
  const seed=JSON.parse(JSON.stringify(__domScalingSeeds[0]));
  const nodes=[{...seed,id:'1',x:100,y:100,width:400,height:400},{...seed,id:'2',x:650,y:100,width:400,height:400},{...seed,id:'3',x:1500,y:100,width:400,height:400},{kind:'group',id:'g',x:84,y:84,width:982,height:480,groupMembers:['1','2'],groupColor:'#14b8a6',groupTitle:'参考素材',zOrder:0}];
  restoreCanvasBoard({id:'dom-scaling-mock-board',nodes,connections:[],viewport:{x:30,y:60,scale:.5}});canvasState.isRestoring=false;canvasState.activeBoardPersisted=false;clearCanvasSelection();CanvasNodeRepresentation.reconcile();
  await new Promise(r=>setTimeout(r,850));
  // The incoming node overlaps the right edge, while its centre is outside.
  const incoming=canvasVirtualStore.mergeSerialized('3',{x:1050,y:100});
  updateCanvasGroupMembership([incoming]);
  const joined=JSON.parse(JSON.stringify(canvasVirtualStore.get('g')));
  const memberHeaderTop=resolveNodeVisualGeometry('1').identityBounds.top;
  const detached=canvasVirtualStore.mergeSerialized('3',{x:2200,y:100});
  updateCanvasGroupMembership([detached]);
  const left=JSON.parse(JSON.stringify(canvasVirtualStore.get('g')));
  return {joined,left,memberHeaderTop,mounted:!!getCanvasNode('g'),nested:document.querySelectorAll('.canvas-node-group .canvas-node,[data-canvas-visual-kind=group] .canvas-node').length};
 });
 S.writeJSON(path.join(out,'adaptive-regression.json'),result);
 assert.ok(result.joined.groupMembers.includes('3'),'部分矩形重叠必须加入未挂载的Scene组');
 assert.ok(result.joined.x+result.joined.width>=1466,'组必须完整包围新增成员');
 assert.ok(result.joined.y+16<=result.memberHeaderTop,'自动包围必须包含成员主体上方的浮动身份标题区');
 assert.ok(!result.left.groupMembers.includes('3'),'完全移出必须退组');
 assert.ok(result.left.width<result.joined.width,'离开后组必须收缩');
 assert.ok(result.left.y+16<=result.memberHeaderTop,'收缩后仍必须包住保留成员的身份标题区');
 assert.equal(result.nested,0,'成员不能嵌套进组DOM');
 // Native drag/drop exercises the existing selection and undo/save paths.
 await f.page.evaluate(()=>{
  const seed=JSON.parse(JSON.stringify(__domScalingSeeds[0]));
  restoreCanvasBoard({id:'dom-scaling-mock-board',nodes:[{...seed,id:'1',x:100,y:100,width:400,height:400},{...seed,id:'2',x:650,y:100,width:400,height:400},{...seed,id:'3',x:1500,y:100,width:400,height:400},{kind:'group',id:'g',x:84,y:84,width:982,height:480,groupMembers:['1','2'],groupColor:'#14b8a6',groupTitle:'参考素材',zOrder:0}],connections:[],viewport:{x:30,y:60,scale:.5}});
  canvasState.isRestoring=false;canvasState.activeBoardPersisted=false;clearCanvasSelection();CanvasNodeRepresentation.reconcile();
 });
 await S.settle(f.page,900);
 // Imported fixture nodes must be persisted before recording a native edit.
 // Otherwise the first dirty scan records fixture creation above the drag command.
 await f.page.evaluate(async()=>{await saveCanvasBoardNow({recordUndo:false});canvasState.undoStack=[];canvasState.redoStack=[];});
 const point=await f.page.evaluate(()=>{const b=resolveNodeVisualGeometry('3').contentBounds,v=document.querySelector('#infiniteCanvas').getBoundingClientRect();return{x:v.left+canvasState.x+(b.left+60)*canvasState.scale,y:v.top+canvasState.y+(b.top+100)*canvasState.scale};});
 await f.page.mouse.move(point.x,point.y);await f.page.mouse.down();await f.page.mouse.move(point.x-225,point.y,{steps:12});await f.page.mouse.up();await S.settle(f.page,250);
 const nativeJoined=await f.page.evaluate(()=>({group:toCanvasOperationNode(canvasVirtualStore.get('g')),member:toCanvasOperationNode(canvasVirtualStore.get('3'))}));
 S.writeJSON(path.join(out,'native-join-debug.json'),{point,nativeJoined});
 assert.ok(nativeJoined.group.groupMembers.includes('3'),'原生拖动部分重叠必须加入');
 await f.page.evaluate(()=>undoCanvasCommand());await S.settle(f.page,150);
 const undone=await f.page.evaluate(()=>toCanvasOperationNode(canvasVirtualStore.get('g')));
 assert.deepEqual(undone.groupMembers,['1','2']);assert.equal(undone.width,982);assert.equal(undone.y,84);assert.equal(undone.height,480);
 await f.page.evaluate(()=>redoCanvasCommand());await S.settle(f.page,150);
 const redone=await f.page.evaluate(()=>toCanvasOperationNode(canvasVirtualStore.get('g')));
 assert.deepEqual(redone.groupMembers,nativeJoined.group.groupMembers);assert.equal(redone.width,nativeJoined.group.width);
 // Delete a Scene resident edge member, and undo restores the same group frame.
 await f.page.evaluate(()=>{clearCanvasSelection();document.activeElement?.blur?.();});await S.settle(f.page,850);
 const deleted=await f.page.evaluate(()=>{const before=toCanvasOperationNode(canvasVirtualStore.get('g'));deleteCanvasModels([toCanvasOperationNode(canvasVirtualStore.get('3'))]);return{before,after:toCanvasOperationNode(canvasVirtualStore.get('g'))};});
 assert.deepEqual(deleted.after.groupMembers,['1','2']);assert.equal(deleted.after.width,982);
 await f.page.evaluate(()=>undoCanvasCommand());await S.settle(f.page,120);
 const deleteUndo=await f.page.evaluate(()=>toCanvasOperationNode(canvasVirtualStore.get('g')));
 assert.deepEqual(deleteUndo,deleted.before);
 // A geometry event must include offscreen resident members without mounting them.
 const resized=await f.page.evaluate(async()=>{canvasVirtualStore.mergeSerialized('3',{x:5000,width:700});queueCanvasGroupsForMember({id:'3'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return{group:toCanvasOperationNode(canvasVirtualStore.get('g')),full:!!getCanvasNode('3')};});
 assert.ok(resized.group.x+resized.group.width>=5716);assert.equal(resized.full,false);
 await f.page.screenshot({path:path.join(out,'adaptive-scene-group.png')});
 S.writeJSON(path.join(out,'native-regression.json'),{nativeJoined,undone,redone,deleted,deleteUndo,resized});
 assert.deepEqual(f.errors,[]);console.log(JSON.stringify({pass:true,result}));
 }finally{await f.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
