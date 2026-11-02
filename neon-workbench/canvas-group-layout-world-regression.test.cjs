const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const sourcePath = process.env.GROUP_LAYOUT_SOURCE || path.join(__dirname, 'design-sources/script-before-save-bridge.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const region = source.slice(source.indexOf('const CANVAS_GROUP_LAYOUT_GAP = 32;'), source.indexOf('function ungroupCanvasNode('));
const copy = value => JSON.parse(JSON.stringify(value));
const union = rects => rects.length ? {left:Math.min(...rects.map(r=>r.left)),top:Math.min(...rects.map(r=>r.top)),right:Math.max(...rects.map(r=>r.right)),bottom:Math.max(...rects.map(r=>r.bottom))} : null;
function fixture(nodes, mountedIds = nodes.map(n=>n.id)) {
  const models = new Map(nodes.map(n=>[n.id,copy(n)])), mounted = new Map();
  const context = {
    CANVAS_GROUP_PADDING:16, CANVAS_GROUP_LAYOUTS:[['grid','宫格'],['horizontal','水平'],['vertical','垂直']],
    CanvasGeometryRules:{unionRects:union},
    canvasState:{connections:[{id:'edge',from:'g',to:'video'}],selectedIds:new Set(),selectedSceneItems:new Map(),x:45,y:67,scale:.5},
    canvasVirtualStore:{get:id=>models.get(String(id)),has:id=>models.has(String(id)),values:()=>[...models.values()],getMounted:id=>mounted.get(String(id)),mergeSerialized:(id,patch)=>{const m={...models.get(id),...copy(patch)};models.set(id,m);return m;}},
    canvasVirtualizer:{schedule(){}},
    getCanvasGroupModel:value=>models.get(String(value?.dataset?.id||value?.id||value)),
    getCanvasNode:id=>mounted.get(String(id)),
    getCanvasGroupMemberIds:node=>JSON.parse(node.dataset.groupMembers),
    getCanvasGroupSubjectBounds(value){const m=context.getCanvasGroupModel(value);return m?{left:m.x,top:m.y-(m.kind==='text'?30:0),right:m.x+m.width,bottom:m.y+m.height+(m.kind==='group'?0:48)}:null;},
    getCanvasNodeBox:node=>context.getCanvasGroupSubjectBounds(node),
    getCanvasNodesBounds:items=>union(items.map(context.getCanvasGroupSubjectBounds)),
    sortCanvasNodesByPosition:items=>[...items].sort((a,b)=>Number(a.dataset.y)-Number(b.dataset.y)||Number(a.dataset.x)-Number(b.dataset.x)),
    syncCanvasNodeModel(node){const m=models.get(node.dataset.id); if(!m)return null;for(const k of ['x','y','groupLayout'])if(node.dataset[k]!==undefined)m[k]=k==='groupLayout'?node.dataset[k]:Number(node.dataset[k]);return m;},
    serializeCanvasNode:node=>context.syncCanvasNodeModel(node),toCanvasOperationNode:copy,
    setCanvasNodePoint:(node,p)=>Object.assign(node.dataset,{x:String(p.x),y:String(p.y)}),
    updateCanvasNodePosition:node=>context.syncCanvasNodeModel(node),placeCanvasNode:node=>context.syncCanvasNodeModel(node),
    fitCanvasGroupToMembers(value, members){const g=context.getCanvasGroupModel(value);const b=union((members||g.groupMembers).map(context.getCanvasGroupSubjectBounds).filter(Boolean));if(b){Object.assign(g,{x:b.left-16,y:b.top-16,width:b.right-b.left+32,height:b.bottom-b.top+32});const dom=mounted.get(g.id);if(dom)Object.assign(dom.dataset,Object.fromEntries(['x','y','width','height'].map(k=>[k,String(g[k])])));}},
    createCanvasGalleryMemberTransferOperations:items=>items.map(i=>({type:'node.upsert',entityId:i.id,before:copy(i.before),after:copy(i.after)})),
    recordCanvasGalleryMemberTransferUndo:command=>context.undo=copy(command),
    getSelectedCanvasNodes:()=>[...context.canvasState.selectedIds].map(id=>mounted.get(id)).filter(Boolean),
    scheduleCanvasSceneRender(){},scheduleCanvasConnectionRender(){},scheduleCanvasSave(){},updateCanvasSelectionFrame(){},setCanvasStatus(message){context.status=message;},
  };
  for(const id of mountedIds){const m=models.get(id);mounted.set(id,{dataset:{...Object.fromEntries(Object.entries(m).filter(([k,v])=>typeof v!=='object').map(([k,v])=>[k,String(v)])),groupMembers:JSON.stringify(m.groupMembers||[])},offsetWidth:1600,offsetHeight:1800,classList:{contains:c=>c==='canvas-node-group'&&m.kind==='group'},closest:()=>null});}
  vm.createContext(context);vm.runInContext(region,context);
  return {context,models,mounted};
}
const image=(id,x,y,width,height)=>({id,kind:'image',x,y,width,height,mediaSizeMode:'manual',nodeTitle:`图片${id}`});
const group={id:'g',kind:'group',x:84,y:84,width:800,height:800,groupMembers:['a','b','c','d'],groupTitle:'素材组',groupColor:'#14b8a6',groupLayout:'vertical'};
const members=[image('a',100,100,600,200),image('b',750,100,220,500),image('c',100,700,300,180),image('d',450,700,200,160)];
const results=[];
function test(name,run){try{run();results.push({name,pass:true});}catch(error){results.push({name,pass:false,error:error.message});}}
test('宫格使用世界bounds和每行实际尺寸，忽略Full根元素膨胀',()=>{
  const f=fixture(members);f.context.placeCanvasNodesInLayout([...f.mounted.values()],{x:100,y:100},'grid');
  assert.equal(f.models.get('b').x,732);assert.equal(f.models.get('c').y,680);assert.equal(f.models.get('d').x,432);
  for(const m of members){assert.equal(f.models.get(m.id).width,m.width);assert.equal(f.models.get(m.id).height,m.height);}
});
test('全部Scene成员参与布局，组完整包围，单条Undo/Redo保留元数据与连接',()=>{
  const f=fixture([...members,group],['g']);const before=copy([...f.models.values()]),camera=copy(f.context.canvasState);
  assert.equal(f.context.layoutCanvasGroupMembers(f.mounted.get('g'),'grid'),true);
  assert.equal(f.context.undo.forward.length,5);assert.equal(f.models.get('b').x,732);assert.equal(f.models.get('c').y,680);
  const g=f.models.get('g'),bounds=union(members.map(m=>f.context.getCanvasGroupSubjectBounds(m.id)));
  assert.equal(g.x,bounds.left-16);assert.equal(g.y,bounds.top-16);assert.equal(g.x+g.width,bounds.right+16);assert.equal(g.y+g.height,bounds.bottom+16);
  assert.equal(g.groupTitle,group.groupTitle);assert.equal(g.groupColor,group.groupColor);assert.equal(g.groupLayout,'grid');assert.deepEqual(g.groupMembers,group.groupMembers);
  const after=copy([...f.models.values()]);for(const op of f.context.undo.forward)f.models.set(op.entityId,copy(op.before));assert.deepEqual([...f.models.values()],before);
  for(const op of f.context.undo.forward)f.models.set(op.entityId,copy(op.after));assert.deepEqual([...f.models.values()],after);
  assert.deepEqual(copy(f.context.canvasState),camera);
});
test('布局不新增邻近视频重叠且只移动成员与组',()=>{
  const video={id:'video',kind:'video',x:720,y:90,width:450,height:700};
  const initial=[image('a',100,100,500,200),image('b',100,500,500,200),{...group,groupMembers:['a','b'],width:532,height:732},video];
  const f=fixture(initial);assert.equal(f.context.layoutCanvasGroupMembers(f.mounted.get('g'),'horizontal'),true);
  const b=f.context.getCanvasGroupSubjectBounds('video');for(const id of ['a','b','g']){const a=f.context.getCanvasGroupSubjectBounds(id);assert.ok(!(a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top),`${id}进入邻近视频`);}
  assert.deepEqual(f.models.get('video'),video);
});
test('Scene框选布局使用全部选择模型且不创建组',()=>{
  const f=fixture(members,[]);members.forEach(m=>f.context.canvasState.selectedIds.add(m.id));
  assert.equal(f.context.layoutCanvasSelection('vertical'),true);assert.equal(f.models.get('b').y,380);assert.equal(f.models.get('c').y,960);assert.equal(f.models.size,4);assert.equal(f.context.undo.forward.length,4);
});
test('宫格排序按可见节点边界保持同一行左右顺序',()=>{
  const imageNode=image('image',100,130,240,400),textNode={id:'text',kind:'text',x:500,y:160,width:520,height:500};
  const f=fixture([imageNode,textNode],[]);
  assert.deepEqual(JSON.parse(JSON.stringify(f.context.sortCanvasLayoutModels([textNode,imageNode]).map(node=>node.id))),['image','text']);
});
test('组宫格保留组内原有成员顺序，不按当前世界坐标交换左右节点',()=>{
  const a=image('a',700,100,240,180), b=image('b',100,100,240,180);
  const orderedGroup={id:'g',kind:'group',x:84,y:84,width:600,height:300,groupMembers:['a','b'],groupTitle:'素材组',groupColor:'#14b8a6',groupLayout:'horizontal'};
  const f=fixture([a,b,orderedGroup],['g']);
  assert.equal(f.context.layoutCanvasGroupMembers(f.mounted.get('g'),'horizontal'),true);
  assert.equal(f.models.get('a').x,100,'组内第一成员应落在左侧');
  assert.equal(f.models.get('b').x,372,'组内第二成员应落在右侧');
});
test('错开顶部但垂直重叠的图片和文字做宫格后保持左右位置',()=>{
  const left=image('left',100,300,400,600),right={id:'right',kind:'text',x:760,y:130,width:1039,height:924};
  const f=fixture([left,right],[]);
  ['right','left'].forEach(id=>f.context.canvasState.selectedIds.add(id));
  assert.equal(f.context.layoutCanvasSelection('grid'),true);
  assert.ok(f.models.get('left').x<f.models.get('right').x,'左侧图片不能被顶部更高的右侧文字换到右边');
});
test('组宫格按现有左右位置排列，即使历史成员数组倒序',()=>{
  const left=image('left',100,300,400,600),right={id:'right',kind:'text',x:760,y:130,width:1039,height:924};
  const f=fixture([left,right,{...group,groupMembers:['right','left']}],['g']);
  assert.equal(f.context.layoutCanvasGroupMembers(f.mounted.get('g'),'grid'),true);
  assert.ok(f.models.get('left').x<f.models.get('right').x,'历史组成员顺序不能交换当前左右位置');
});
console.log(JSON.stringify({source:sourcePath,results,passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length},null,2));
if(results.some(r=>!r.pass))process.exitCode=1;
