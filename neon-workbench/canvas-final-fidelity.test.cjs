const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const file=path.join(__dirname,'design-sources/canvas-node-visuals.js');
const load=file=>{const context={module:{exports:{}},performance,console,setTimeout,clearTimeout};require('node:vm').runInNewContext(fs.readFileSync(file,'utf8'),context);return context.module.exports;};
test('real node kinds keep distinct content recipes including script semantic variant',()=>{
 assert.ok(fs.existsSync(file),'Visual Renderer Registry is required');const v=load(file);
 const cases=[[{kind:'image'},'image-generator'],[{kind:'image',imageSrc:'/a.png'},'image'],[{kind:'video-api'},'video-generator'],[{kind:'minimax-h3'},'h3'],[{kind:'audio-generator'},'audio-generator'],[{kind:'text',text:'正文'},'text'],[{kind:'llm',productionWorkflow:{title:'脚本',shots:[],assets:[]}},'script-generator'],[{kind:'video'},'video'],[{kind:'note'},'note']];
 for(const [model,kind]of cases){const p=v.project(model);assert.equal(p.renderer,kind);assert.ok(p.semantics.length);}
});
test('single-media collections keep media semantics without a new persisted node kind',()=>{
 const v=load(file);for(const kind of ['image','video','audio']){const model={kind:'asset-collection',assetCollection:{mode:'single',members:[{id:'a',kind,src:'/media',duration:24}]}};const p=v.project(model);assert.equal(p.renderer,kind);assert.equal(model.kind,'asset-collection');assert.equal(p.mediaSource,'/media');assert.equal(p.duration,24);}
});
test('text layout cache uses content and world width, not camera scale',()=>{
 assert.ok(fs.existsSync(file),'Visual Renderer Registry is required');const v=load(file);v.clear();
 const ctx={font:'',measureText:s=>({width:[...s].length*8})};const text='第一行正文\n第二行需要自动换行的内容'.repeat(4);
 const a=v.layoutText(ctx,text,96,20,15);assert.ok(a.length>2);for(let i=0;i<20;i++)assert.equal(v.layoutText(ctx,text,96,20,15),a);
 assert.equal(v.diagnostics().layoutMisses,1);assert.equal(v.diagnostics().layoutHits,20);
});
test('bulk selection and hover do not hydrate controls without an explicit click intent',()=>{
 const {CanvasRepresentationManager}=load(path.join(__dirname,'design-sources/canvas-representation-manager.js'));
 const store={get:id=>({id,kind:'text',width:400,height:400}),getRect:()=>({left:0,top:0,right:400,bottom:400})};
 const m=new CanvasRepresentationManager({getFlags:()=>({}),now:()=>1000});
 for(const scale of [.1,.25,1,2,5]){const p=m.plan({visibleIds:['1'],store,viewport:{scale,width:1000,height:800},selectedIds:new Set(['1']),primaryId:'1',hoveredId:'1'});assert.notEqual(p.get('1'),'full','selection is visual intent only');}
 const p=m.plan({visibleIds:['1'],store,viewport:{scale:1},protectedReasons:new Map([['1',['editing']]])});assert.equal(p.get('1'),'full');
});
function paintLog(model){
 const v=load(file),calls=[];const ctx=new Proxy({measureText:s=>({width:s.length*8})},{get:(o,k)=>k in o?o[k]:(...a)=>calls.push([k,...a]),set:(o,k,x)=>(o[k]=x,true)});
 v.paint(ctx,v.project(model),{outerBounds:{left:0,top:0,right:400,bottom:400},contentBounds:{left:0,top:0,right:400,bottom:400},borderRadius:16},{x:0,y:0,scale:1});return calls;
}
test('generator static placeholder preserves Flora result label and center instead of a new UI',()=>{
 for(const kind of ['image-generator','video-api','minimax-h3']){const calls=paintLog({kind});const labels=calls.filter(c=>c[0]==='fillText');assert.equal(labels.length,1,'no new guidance or footer');assert.equal(labels[0][1],'生成结果');assert.ok(Math.abs(labels[0][3]-230)<3,'original 40px icon + 12px gap + 20px label centered in content');}
});
test('script static preview keeps original heading and workflow summary without a new stage layout',()=>{
 const calls=paintLog({kind:'llm',productionWorkflow:{title:'脚本制作',source:'只在工作台显示的输入',shots:[{}],assets:[{type:'character'}],storyboards:[],videos:[]}});const labels=calls.filter(c=>c[0]==='fillText').map(c=>c[1]);assert.deepEqual(labels,['脚本制作','1 镜 · 1 人物 · 0 场景 · 0 道具','打开制作工作台']);
});
test('retired product features are not introduced as visual renderers',()=>{
 const v=load(file);for(const kind of ['loop','director-3d','gallery','gallery-container','asset-collection'])assert.ok(!v.list().includes(kind),kind+' remains retired');
});
test('rich text projection requires the browser Full layout instead of a guessed fallback',()=>{
 const v=load(file),p=v.project({kind:'text',text:'正文',textRichHtml:'<p><strong>标题</strong></p><p>正文</p>'});
 assert.equal(p.richHtml,'<p><strong>标题</strong></p><p>正文</p>');
 assert.equal(v.layoutRichText({},p,384,384).glyphs.length,0,'headless unit context cannot invent CSS layout; browser regression verifies real line boxes');
});
