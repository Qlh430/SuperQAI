const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const OUT=path.resolve(process.env.CANVAS_EVIDENCE_DIR||path.join(__dirname,'../.planning/v3.0.1-last-fix-20261019/group'));
const ROOT=process.env.QA_RUNTIME_ROOT||path.resolve(__dirname,'../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app');
const PORT=33259;
process.env.AI_OS_TEST_URL=`http://127.0.0.1:${PORT}`;process.env.SOURCE_OVERLAY='1';
const S=require('./dom-scaling-test-support.cjs');
const server=http.createServer((req,res)=>{const p=path.resolve(ROOT,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!p.startsWith(ROOT+path.sep)&&p!==ROOT){res.writeHead(403).end();return;}const target=p===ROOT||p.endsWith(path.sep)?path.join(p,'index.html'):p;fs.stat(target,(e,stat)=>{if(e||!stat.isFile()){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[path.extname(target)]||'application/octet-stream');fs.createReadStream(target).pipe(res);});});
const snapshot=page=>page.evaluate(()=>({models:captureCanvasLayoutSnapshot(canvasVirtualStore.values()),boxes:Object.fromEntries(canvasVirtualStore.values().map(m=>[m.id,getCanvasGroupSubjectBounds(m)])),camera:{x:canvasState.x,y:canvasState.y,scale:canvasState.scale},connections:JSON.parse(JSON.stringify(canvasState.connections)),representation:CanvasNodeRepresentation.snapshot(),protection:[...getCanvasRepresentationProtection()],fullMembers:['a','b','c','d'].filter(id=>!!getCanvasNode(id))}));
const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
(async()=>{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(PORT,'127.0.0.1',resolve);});let f;try{
  f=await S.openFixture();
  await f.page.evaluate(async()=>{
    const dims=[[360,180],[240,180],[300,180],[220,180]];
    const nodes=dims.map(([width,height],i)=>({...__domScalingSeeds[0],id:String.fromCharCode(97+i),kind:'image',x:100,y:160+i*300,width,height,mediaSizeMode:'manual',nodeTitle:`布局图片${i+1}`,resultSrc:__domScalingPNG,resultDownloadUrl:__domScalingPNG,generationHistory:[{id:`h${i}`,kind:'image',src:__domScalingPNG}],currentGenerationId:`h${i}`}));
    nodes.push({id:'g',kind:'group',x:84,y:144,width:392,height:1160,groupMembers:['a','b','c','d'],groupTitle:'验收素材组',groupColor:'#14b8a6',groupLayout:'vertical',zOrder:0},{...__domScalingSeeds[1],id:'video',kind:'video',x:520,y:160,width:450,height:700,mediaSizeMode:'manual'});
    restoreCanvasBoard({id:'dom-scaling-mock-board',title:'组布局专项',nodes,connections:[{id:'edge',from:'g',to:'video',fromPort:'output',toPort:'input'}],viewport:{x:320,y:210,scale:.5}});canvasState.isRestoring=false;canvasState.activeBoardPersisted=false;clearCanvasSelection();CanvasNodeRepresentation.reconcile();
    await new Promise(r=>setTimeout(r,850));await saveCanvasBoardNow({recordUndo:false});canvasState.undoStack=[];canvasState.redoStack=[];
    const g=await CanvasNodeRepresentation.hydrateNode('g');selectCanvasNode(g);
    ['a','b','c','d'].forEach(id=>CanvasNodeRepresentation.dehydrateNode(id));
  });
  await S.settle(f.page,300);await f.page.evaluate(()=>captureCanvasLayoutSnapshot(canvasVirtualStore.values()));const before=await snapshot(f.page);S.writeJSON(path.join(OUT,'ui-before.json'),before);await f.page.screenshot({path:path.join(OUT,'ui-before.png')});
  await f.page.locator('[data-id="g"] [data-group-tool="layout"]').click();
  await f.page.locator('#canvasGroupMenu [data-group-layout="grid"]').click();
  await S.settle(f.page,500);const after=await snapshot(f.page);S.writeJSON(path.join(OUT,'ui-after.json'),after);await f.page.screenshot({path:path.join(OUT,'ui-after.png')});
  assert.deepEqual(after.camera,before.camera);assert.deepEqual(after.connections,before.connections);assert.deepEqual(after.models.find(m=>m.id==='video'),before.models.find(m=>m.id==='video'));
  // 既有 stacking-safety 在 Full 组下保护成员；布局命令不能再增加 Full。
  assert.deepEqual(after.fullMembers,before.fullMembers);
  const g=after.models.find(m=>m.id==='g'),members=['a','b','c','d'].map(id=>after.boxes[id]);
  for(const b of members){assert.ok(g.x+16<=b.left+.01&&g.y+16<=b.top+.01&&g.x+g.width-16>=b.right-.01&&g.y+g.height-16>=b.bottom-.01);assert.equal(overlap(b,after.boxes.video),false);}
  assert.equal(overlap(after.boxes.g,after.boxes.video),false);assert.equal(after.boxes.b.left-after.boxes.a.right,32);assert.equal(after.boxes.d.left-after.boxes.c.right,32);assert.equal(after.boxes.c.top-Math.max(after.boxes.a.bottom,after.boxes.b.bottom),32);
  for(const id of ['a','b','c','d'])for(const field of ['width','height'])assert.equal(after.models.find(m=>m.id===id)[field],before.models.find(m=>m.id===id)[field]);
  await f.page.evaluate(()=>undoCanvasCommand());await S.settle(f.page,200);const undone=await snapshot(f.page);S.writeJSON(path.join(OUT,'ui-undo.json'),undone);
  for(const id of ['a','b','c','d','g'])for(const key of ['x','y','width','height','groupLayout','groupTitle','groupColor'])assert.deepEqual(undone.models.find(m=>m.id===id)[key],before.models.find(m=>m.id===id)[key],`undo ${id}.${key}`);
  await f.page.evaluate(()=>redoCanvasCommand());await S.settle(f.page,200);const redone=await snapshot(f.page);S.writeJSON(path.join(OUT,'ui-redo.json'),redone);
  for(const id of ['a','b','c','d','g'])for(const key of ['x','y','width','height','groupLayout','groupTitle','groupColor'])assert.deepEqual(redone.models.find(m=>m.id===id)[key],after.models.find(m=>m.id===id)[key],`redo ${id}.${key}`);
  await f.page.evaluate(async()=>{
    restoreCanvasBoard({id:'dom-scaling-mock-board',title:'错开顶部的图文组',nodes:[
      {...__domScalingSeeds[0],id:'left',x:100,y:300,width:400,height:600,mediaSizeMode:'manual'},
      {...__domScalingSeeds[2],id:'right',x:760,y:130,width:1039,height:924,mediaSizeMode:'manual',text:'宫格布局左右顺序验收'},
      {id:'g',kind:'group',x:84,y:66,width:1731,height:1004,groupMembers:['right','left'],groupTitle:'错开顶部图文组',groupLayout:'grid',groupColor:'#14b8a6',zOrder:0}
    ],connections:[],viewport:{x:60,y:80,scale:.5}});
    canvasState.isRestoring=false;canvasState.activeBoardPersisted=false;clearCanvasSelection();CanvasNodeRepresentation.reconcile();
    await new Promise(r=>setTimeout(r,850));await saveCanvasBoardNow({recordUndo:false});canvasState.undoStack=[];canvasState.redoStack=[];
    selectCanvasNode(await CanvasNodeRepresentation.hydrateNode('g'));
  });
  await S.settle(f.page,300);const staggeredBefore=await snapshot(f.page);
  await f.page.screenshot({path:path.join(OUT,'staggered-before.png')});
  await f.page.locator('[data-id="g"] [data-group-tool="layout"]').click();
  await f.page.locator('#canvasGroupMenu [data-group-layout="grid"]').click();
  await S.settle(f.page,500);const staggeredAfter=await snapshot(f.page);
  assert.ok(staggeredAfter.boxes.left.left<staggeredAfter.boxes.right.left,'实际宫格菜单必须保留左图片、右文字的顺序');
  await f.page.screenshot({path:path.join(OUT,'staggered-after.png')});
  S.writeJSON(path.join(OUT,'staggered.json'),{before:staggeredBefore,after:staggeredAfter});
  await f.page.evaluate(()=>undoCanvasCommand());await S.settle(f.page,200);
  const staggeredUndo=await snapshot(f.page);
  for(const id of ['left','right','g'])for(const key of ['x','y','width','height'])assert.equal(staggeredUndo.models.find(m=>m.id===id)[key],staggeredBefore.models.find(m=>m.id===id)[key],`staggered undo ${id}.${key}`);
  assert.deepEqual(f.errors,[]);S.writeJSON(path.join(OUT,'ui-result.json'),{passed:true,checks:['原生组菜单宫格点击','错开顶部图文左右顺序','布局未增加Full（组Full既有stacking-safety保护成员）','逐行32世界间距','成员比例/名称/颜色/连接/Camera保留','组包围含身份区','邻视频无重叠','原Undo/Redo整批恢复'],errors:f.errors});console.log('组布局真实UI/mock API专项通过');
}finally{if(f)await f.close();await new Promise(resolve=>server.close(resolve));}})().catch(e=>{console.error(e);process.exitCode=1;});
