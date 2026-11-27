const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),runtime=process.env.QA_RUNTIME_ROOT||path.join(root,'AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app');
const out=path.resolve(process.env.CANVAS_EVIDENCE_DIR||path.join(root,'.planning/text-layout-authority-20261018/browser'));fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');if(u.pathname.startsWith('/api/'))return res.writeHead(403).end();const p=path.resolve(runtime,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));if(!p.startsWith(runtime+path.sep))return res.writeHead(403).end();fs.readFile(p,(e,b)=>e?res.writeHead(404).end():res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.woff2':'font/woff2'})[path.extname(p)]||'application/octet-stream'}).end(b));});
(async()=>{const externalUrl=process.env.AI_OS_TEST_URL; if(!externalUrl){await new Promise(r=>server.listen(0,'127.0.0.1',r));process.env.AI_OS_TEST_URL='http://127.0.0.1:'+server.address().port;}const S=require('./dom-scaling-test-support.cjs'),results=[];let f;try{
 f=await S.openFixture();
 const rich='<p><strong>提示词：</strong></p><p>广阔无垠的雪原，占据画面大部分空间，洁白积雪平整柔软，远处高大的松树披满白雪。夜晚蓝调时刻，天空中繁星闪烁。Camera ISO 800, 35mm lens and cinematic lighting；中文标点，换行测试（不要孤立标点）。'+ '混合 ABC words 12345，长段落自动换行。'.repeat(4)+'</p><p><br></p><p><strong>负面提示词：</strong></p><p>人物、动物、杂乱元素，blurred image, oversaturated colors。</p><p>空格   测试 <strong>bold </strong>  normal <span>文字 </span>   tail</p><pre><code>'+('一张写实摄影风格的男装造型参考板，竖版2:3画幅，六宫格排版，三列两排，同一位成年东亚男性模特在所有画面中保持相同的面部、发型、身材与服装。上排为三张头肩近景，占画面高度约40%；下排为三张完整全身照，占画面高度约60%。\nLong markdown line should remain readable after moving the pointer away. 内容滚动位置需要在预览切换后保留。\n').repeat(55)+'</code></pre>';
 const fixtureRich=process.env.TEXT_FIXTURE_PATH?JSON.parse(fs.readFileSync(process.env.TEXT_FIXTURE_PATH,'utf8')).html:'<h3>中文提示词</h3>'+rich;
 for(const width of (process.env.TEXT_TEST_WIDTHS||'300,400,520').split(',').map(Number))for(const scale of (process.env.TEXT_TEST_SCALES||'.25,.5,.75,1,1.5').split(',').map(Number)){
  const id=`${width}-${scale}`;
  await f.page.evaluate(({width,scale,rich,height})=>{const t=__domScalingSeeds[2],i=__domScalingSeeds[0];restoreCanvasBoard({id:'dom-scaling-mock-board',nodes:[{...t,id:'t',x:370,y:100,width,height,mediaSizeMode:'manual',text:'提示词：雪原',textRichHtml:rich},{...i,id:'a',x:20,y:180,width:120,height:120},{...i,id:'b',x:1100,y:180,width:120,height:120}],connections:[{id:'wire',from:'a',to:'b',fromPort:'output',toPort:'input'}],viewport:{x:40-370*scale,y:30,scale}});canvasState.isRestoring=false;canvasState.activeBoardPersisted=false;clearCanvasSelection();CanvasNodeRepresentation.reconcile();},{width,scale,rich:fixtureRich,height:Number(process.env.TEXT_TEST_HEIGHT||400)});
  await S.settle(f.page,850);
  await f.page.evaluate(()=>{CanvasNodeRepresentation.hydrateNode('t');clearCanvasSelection();});
  await S.settle(f.page,150);
  const normal=await f.page.evaluate(()=>({level:canvasRepresentation.level('t'),layout:globalThis.resolveTextVisualLayout?.('t'),geometry:resolveNodeVisualGeometry('t'),stats:CanvasNodeVisuals.diagnostics(),view:(()=>{const node=getCanvasNode('t'),body=node?.querySelector('.canvas-text'),title=node?.querySelector('.flora-node-title, [data-node-title], .canvas-node-title');return{bodyClientWidth:body?.clientWidth||0,bodyClientHeight:body?.clientHeight||0,bodyScrollHeight:body?.scrollHeight||0,title:title?.textContent?.trim()||node?.dataset.nodeTitle||''};})()}));
  await f.page.screenshot({path:path.join(out,id+'-normal.png')});
  const crop=()=>f.page.evaluate(()=>{const b=resolveNodeVisualGeometry('t').outerBounds,v=document.querySelector('#infiniteCanvas').getBoundingClientRect(),s=canvasState.scale;return{x:v.left+canvasState.x+(b.left+8)*s,y:v.top+canvasState.y+(b.top+8)*s,width:(b.right-b.left-16)*s,height:(b.bottom-b.top-16)*s};});
  if(scale===1)await f.page.screenshot({path:path.join(out,id+'-normal-content.png'),clip:await crop()});
  const pt=await f.page.evaluate(()=>{const g=resolveNodeVisualGeometry('t'),v=document.querySelector('#infiniteCanvas').getBoundingClientRect();return {x:v.left+canvasState.x+(g.outerBounds.left+45)*canvasState.scale,y:v.top+canvasState.y+(g.outerBounds.top+40)*canvasState.scale};});await f.page.mouse.click(pt.x,pt.y);await S.settle(f.page,150);
  const full=await f.page.evaluate(()=>{const node=getCanvasNode('t'),g=resolveNodeVisualGeometry('t'),base=node.getBoundingClientRect(),s=base.width/(g.outerBounds.right-g.outerBounds.left),content=node.querySelector('.canvas-text-markdown');const styles=e=>{const c=getComputedStyle(e);return Object.fromEntries(['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','textAlign','padding','width','marginTop','marginBottom','whiteSpace','wordBreak','overflowWrap'].map(k=>[k,c[k]]));};const walk=document.createTreeWalker(content,NodeFilter.SHOW_TEXT),runs=[];let n;while(n=walk.nextNode()){const r=document.createRange();for(let i=0;i<n.length;i++){r.setStart(n,i);r.setEnd(n,i+1);const b=r.getBoundingClientRect();if(b.width>0)runs.push({text:n.data[i],x:(b.left-base.left)/s,y:(b.top-base.top)/s,width:b.width/s,height:b.height/s,style:styles(n.parentElement)});}}const blocks=[...content.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,td,th,hr')].map(el=>{const b=el.getBoundingClientRect();return{type:el.localName,left:(b.left-base.left)/s-8,top:(b.top-base.top)/s-56,width:b.width/s,height:b.height/s};});return{html:node.outerHTML,richHtml:content.innerHTML,style:styles(content),textStyle:styles(node.querySelector('.canvas-text')),runs,blocks,outer:g.outerBounds,scale:s};});
  if(scale===1)await f.page.screenshot({path:path.join(out,id+'-full-content.png'),clip:await crop()});
  const selected=await f.page.evaluate(()=>{const node=getCanvasNode('t'),body=node?.querySelector('.canvas-text'),title=node?.querySelector('.flora-node-title, [data-node-title], .canvas-node-title');return{bodyClientWidth:body?.clientWidth||0,bodyClientHeight:body?.clientHeight||0,bodyScrollHeight:body?.scrollHeight||0,title:title?.textContent?.trim()||node?.dataset.nodeTitle||'',geometry:resolveNodeVisualGeometry('t')};});
  assert.equal(selected.bodyClientWidth,normal.view.bodyClientWidth,'selected state must keep the text body width');
  assert.equal(selected.bodyClientHeight,normal.view.bodyClientHeight,'selected state must keep the text body height');
  assert.equal(selected.bodyScrollHeight,normal.view.bodyScrollHeight,'selected state must keep the text scroll height');
  assert.equal(selected.title,normal.view.title,'selected state must keep the custom title');
  assert.deepEqual(selected.geometry.outerBounds,normal.geometry.outerBounds,'selected state must keep node geometry');
  fs.writeFileSync(path.join(out,id+'-full-layout.json'),JSON.stringify(full,null,2));await f.page.screenshot({path:path.join(out,id+'-full.png')});
  fs.writeFileSync(path.join(out,id+'-normal-layout.json'),JSON.stringify(normal,null,2));
  // Inspect the real paint calls, including state carried from a preceding
  // heading. Container and line-box equality alone misses compressed glyphs.
  const advances=await f.page.evaluate(()=>{const model=canvasVirtualStore.get('t'),geometry=resolveNodeVisualGeometry('t'),layout=resolveTextVisualLayout('t'),ctx=document.createElement('canvas').getContext('2d'),calls=[],fill=ctx.fillText.bind(ctx);ctx.fillText=(text,x,y,...rest)=>{calls.push({text,x,y,font:ctx.font,spacing:ctx.letterSpacing,canvas:ctx.measureText(text.replace(/[\r\n]+$/,'')).width});return fill(text,x,y,...rest);};CanvasNodeVisuals.paint(ctx,CanvasNodeVisuals.project(model),geometry,{x:0,y:0,scale:1},{node:model});return calls.map((call,i)=>({...call,dom:layout.glyphs[i].width,expectedSpacing:layout.glyphs[i].letterSpacing}));});
  fs.writeFileSync(path.join(out,id+'-advances.json'),JSON.stringify(advances,null,2));
  assert.equal(advances.length,normal.layout.glyphs.length);
  for(const r of advances){
    assert.equal(parseFloat(r.spacing)||0,parseFloat(r.expectedSpacing)||0,`painted letter spacing must reset after headings: ${JSON.stringify(r)}`);
    assert.ok(Math.abs(r.dom-r.canvas)<.75,`painted glyph advance differs from DOM: ${JSON.stringify(r)}`);
  }
  assert.deepEqual(full.outer,normal.geometry.outerBounds,'hydrate must preserve the saved text content width');
  assert.ok(normal.layout,'missing authoritative resolveTextVisualLayout');
  // Compare the actual browser character boxes with projected run/line positions.
  const projected=normal.layout.glyphs.flatMap(r=>[{text:r.text,x:r.x,y:r.top,font:r.font}]);
  assert.ok(projected.length>0);assert.equal(normal.layout.authority,'Full computed layout');
  const expected=[];for(const r of full.runs){const prev=expected.at(-1);if(prev&&Math.abs(prev.y-r.y)<.15)prev.text+=r.text;else expected.push({y:r.y,text:r.text});}
  const actual=[];for(const r of normal.layout.glyphs){const prev=actual.at(-1);if(prev&&Math.abs(prev.y-r.top)<.15)prev.text+=r.text;else actual.push({y:r.top,text:r.text});}
  assert.deepEqual(actual.map(x=>x.text.trim()),expected.map(x=>x.text.trim()),'Full line breaks differ');
  assert.equal(full.blocks.length,normal.layout.blocks.length,'Full and Light Markdown block count differs');
  for(let i=0;i<full.blocks.length;i++){const a=full.blocks[i],b=normal.layout.blocks[i].bounds;for(const [key,actualValue,expectedValue] of [['left',a.left,b.left],['top',a.top,b.top],['width',a.width,b.right-b.left],['height',a.height,b.bottom-b.top]])assert.ok(Math.abs(actualValue-expectedValue)<.75,`Full and Light ${a.type} ${key} differs: ${actualValue} vs ${expectedValue}`);}
  assert.equal(normal.layout.fontFamily,full.style.fontFamily);assert.equal(normal.layout.baseFontSize,parseFloat(full.style.fontSize));assert.equal(normal.layout.lineHeight,parseFloat(full.style.lineHeight));
  for(const run of normal.layout.glyphs){const match=full.runs.find(r=>Math.abs(r.y-(run.top+56))<.6&&Math.abs(r.x-(run.x+8))<.6);assert.ok(match,'run start must match Full character position');assert.equal(run.weight,Number(match.style.fontWeight));}
  const g=normal.geometry;for(let i=0;i<actual.length;i++)assert.ok(Math.abs(actual[i].y-(expected[i].y-48+full.outer.top-g.contentBounds.top))<.6,`line ${i} top mismatch ${actual[i].y} ${expected[i].y}`);
  const scrollPoint=await f.page.evaluate(()=>{const text=getCanvasNode('t').querySelector('.canvas-text'),r=text.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};});
  await f.page.mouse.move(scrollPoint.x,scrollPoint.y);await f.page.mouse.wheel(0,10000);await S.settle(f.page,250);
  const scrollBefore=await f.page.evaluate(()=>{const text=getCanvasNode('t').querySelector('.canvas-text');return {top:text.scrollTop,maximum:text.scrollHeight-text.clientHeight,overflow:text.dataset.textOverflow};});
  assert.ok(scrollBefore.maximum>0&&scrollBefore.top>0,'fixture must exercise a genuinely scrollable Markdown text node');
  await f.page.mouse.click(1250,950);await S.settle(f.page,850);
  const scrollAfterDemotion=await f.page.evaluate(()=>{
    const mounted=canvasVirtualStore.getMounted('t');
    return {level:canvasRepresentation.level('t'),mountedLevel:canvasVirtualStore.getMountedLevel('t'),storedTop:canvasRepresentation.textScrolls?.get('t')??null,top:mounted?.querySelector('.canvas-text')?.scrollTop??null};
  });
  await f.page.screenshot({path:path.join(out,id+'-returned.png')});
  assert.equal(scrollAfterDemotion.level,'full','a scrolled text node must keep its DOM renderer when the pointer leaves, preventing visual re-rasterization');
  assert.ok(Math.abs(scrollAfterDemotion.storedTop-scrollBefore.top)<1,`scrolled text state must retain its viewport offset: ${scrollBefore.top} -> ${scrollAfterDemotion.storedTop}`);
  assert.ok(Math.abs(scrollAfterDemotion.top-scrollBefore.top)<1,`scrolled text DOM position must not jump when pointer leaves: ${scrollBefore.top} -> ${scrollAfterDemotion.top}`);
  const point=await f.page.evaluate(()=>{const g=resolveNodeVisualGeometry('t'),v=document.querySelector('#infiniteCanvas').getBoundingClientRect();return{x:v.left+canvasState.x+(g.outerBounds.left+48)*canvasState.scale,y:v.top+canvasState.y+(g.outerBounds.top+48)*canvasState.scale};});
  await f.page.mouse.move(point.x,point.y);await S.settle(f.page,500);
  const scrollAfter=await f.page.evaluate(()=>{const text=getCanvasNode('t')?.querySelector('.canvas-text');return {level:canvasRepresentation.level('t'),top:text?.scrollTop??null,maximum:text?text.scrollHeight-text.clientHeight:null};});
  assert.equal(scrollAfter.level,'full','scrolled text remains on the DOM renderer while off-pointer');
  assert.ok(Math.abs(scrollAfter.top-scrollBefore.top)<1,`Markdown scroll jumped after hover round-trip: ${scrollBefore.top} -> ${scrollAfter.top}`);
  const cache=await f.page.evaluate(async()=>{const a=CanvasNodeVisuals.diagnostics();document.documentElement.style.setProperty('--os-pointer-x','42%');await new Promise(requestAnimationFrame);const layout=resolveTextVisualLayout('t');document.documentElement.style.removeProperty('--os-pointer-x');return{a,b:CanvasNodeVisuals.diagnostics(),geometry:resolveNodeVisualGeometry('t'),layout,model:canvasVirtualStore.get('t')};});assert.deepEqual(cache.geometry.outerBounds,normal.geometry.outerBounds,'Full to Scene must preserve geometry');assert.equal(cache.model.textRichHtml,full.richHtml);
  assert.equal(cache.layout.glyphs.length,normal.layout.glyphs.length,'return to Scene must preserve run count');
  for(let i=0;i<normal.layout.glyphs.length;i++)for(const [key,expected] of Object.entries(normal.layout.glyphs[i])){
    const actual=cache.layout.glyphs[i][key];
    // Fractional zoom introduces subpixel roundoff in DOMRect coordinates.
    if(typeof expected==='number')assert.ok(Math.abs(actual-expected)<.01,`return to Scene run ${i}.${key}: ${actual} vs ${expected}`);
    else assert.deepEqual(actual,expected,`return to Scene run ${i}.${key}`);
  }
  assert.ok(cache.b.layoutMisses-cache.a.layoutMisses<=1,'text layout should not rebuild repeatedly while viewport is stable');
  if(scale===1){
    const dehydrateResult=await f.page.evaluate(()=>{clearCanvasSelection();const text=getCanvasNode('t')?.querySelector('.canvas-text');if(text)text.scrollTop=0;canvasRepresentation.textScrolls.clear();canvasRepresentation.hoveredId=null;const result=CanvasNodeRepresentation.dehydrateNode('t');canvasRepresentation.textScrolls.clear();CanvasNodeRepresentation.reconcile();return{result,snapshot:CanvasRepresentationDiagnostics.snapshot?.()||null};});
    await S.settle(f.page,650);
    const lightState=await f.page.evaluate(()=>({level:CanvasNodeRepresentation.getLevel('t'),geometry:resolveNodeVisualGeometry('t'),viewport:document.querySelector('#infiniteCanvas')?.getBoundingClientRect(),camera:{x:canvasState.x,y:canvasState.y,scale:canvasState.scale}}));
    if(lightState.level!=='light') throw new Error(`scene scroll check did not reach light representation: ${JSON.stringify({dehydrateResult,lightState})}`);
    assert.equal(lightState.level,'light','scene scroll check must use the light text representation');
    const scenePoint={x:lightState.viewport.left+lightState.camera.x+(lightState.geometry.outerBounds.left+48)*lightState.camera.scale,y:lightState.viewport.top+lightState.camera.y+(lightState.geometry.outerBounds.top+80)*lightState.camera.scale};
    await f.page.mouse.move(scenePoint.x,scenePoint.y);
    await f.page.mouse.wheel(0,10000);
    await S.settle(f.page,180);
    const sceneScroll=await f.page.evaluate(()=>{const model=canvasVirtualStore.get('t'),geometry=resolveNodeVisualGeometry('t'),ctx=document.createElement('canvas').getContext('2d'),metrics=CanvasNodeVisuals.layoutRichText(ctx,CanvasNodeVisuals.project(model),geometry.contentBounds.right-geometry.contentBounds.left,geometry.contentBounds.bottom-geometry.contentBounds.top);return{top:Number(canvasRepresentation.textScrolls?.get('t')||0),maximum:Number(metrics?.maxScroll||0),sceneSprites:Number(canvasSceneLayer?.spriteCount||0)}});
    assert.ok(sceneScroll.maximum>0&&sceneScroll.top>0,`light text representation must retain wheel scrolling inside the node: ${JSON.stringify(sceneScroll)}`);
  }
  results.push({id,normal,full,cache});fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({pass:true,cases:results},null,2));console.log('pass '+id);
 }
  for(const width of (process.env.TEXT_TEST_WIDTHS||'300,400,520').split(',').map(Number)){
    const cases=results.filter(item=>String(item.id).startsWith(`${width}-`));
    const baseline=cases.find(item=>String(item.id).endsWith('-1'))||cases[0];
    const signature=layout=>layout?.glyphs?.map(run=>[
      run.text,
      ...["x","top","y","width"].map((key) => Number(run[key] || 0)),
      run.font,
      run.lineHeight,
      run.letterSpacing,
    ]);
    const assertStableSignature = (actual, expected, label) => {
      assert.equal(actual?.length, expected?.length, `${label}: glyph count changed`);
      for (let index = 0; index < (expected?.length || 0); index += 1) {
        const actualRun = actual[index], expectedRun = expected[index];
        assert.equal(actualRun[0], expectedRun[0], `${label}: text changed at glyph ${index}`);
        for (let field = 1; field <= 4; field += 1) {
          assert.ok(
            Math.abs(actualRun[field] - expectedRun[field]) < 0.25,
            `${label}: geometry changed at glyph ${index}.${field}: ${actualRun[field]} vs ${expectedRun[field]}`,
          );
        }
        assert.deepEqual(actualRun.slice(5), expectedRun.slice(5), `${label}: text style changed at glyph ${index}`);
      }
    };
    const geometrySignature = (geometry) => ({
      left: Number(geometry?.left || 0),
      top: Number(geometry?.top || 0),
      right: Number(geometry?.right || 0),
      bottom: Number(geometry?.bottom || 0),
    });
    const assertStableGeometry = (actual, expected, label) => {
      for (const key of ["left", "top", "right", "bottom"]) {
        assert.ok(
          Math.abs(actual[key] - expected[key]) < 0.25,
          `${label}: ${key} changed: ${actual[key]} vs ${expected[key]}`,
        );
      }
    };
    for(const item of cases){
      assertStableSignature(
        signature(item.normal.layout),
        signature(baseline.normal.layout),
        `cross-scale text layout changed at ${item.id}`,
      );
      assertStableGeometry(
        geometrySignature(item.normal.geometry.outerBounds),
        geometrySignature(baseline.normal.geometry.outerBounds),
        `cross-scale text geometry changed at ${item.id}`,
      );
    }
  }
 assert.deepEqual(f.errors,[]);
}finally{if(f)await f.close();if(server.listening)await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
