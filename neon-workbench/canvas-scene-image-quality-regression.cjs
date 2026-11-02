const S = require('./canvas-final-test-support.cjs');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const OUT = path.join(S.ROOT, '.planning/canvas-image-quality-20261016');
(async () => {
  const f = await S.openFixture({width:1728,height:1100});
  const requests = [];
  try {
    await S.prepareKinds(f);
    const assets = await f.page.evaluate(() => {
      const render = (w,h) => {const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.fillStyle='#183444';x.fillRect(0,0,w,h);x.fillStyle='#fff';x.font=`${w/35}px sans-serif`;x.fillText('原图清晰度验收 2400 × 1600',w/20,h/4);for(let i=0;i<w;i+=8){x.fillStyle=i%16?'#369999':'#efbb44';x.fillRect(i,h/2,4,h/3);}return c.toDataURL().split(',')[1];};
      return {original:render(2400,1600),thumbnail:render(320,213)};
    });
    await f.page.route('**/output/quality-original.png', async r => {requests.push({kind:'original',at:Date.now()});await r.fulfill({contentType:'image/png',body:Buffer.from(assets.original,'base64')});});
    await f.page.route('**/output/quality-thumb.png', r => r.fulfill({contentType:'image/png',body:Buffer.from(assets.thumbnail,'base64')}));
    await f.page.evaluate(() => {
      const request = imageResources.requestThumbnail.bind(imageResources);
      imageResources.requestThumbnail = src => src.endsWith('/quality-original.png') ? Promise.resolve({thumbnailUrl:'/output/quality-thumb.png',width:2400,height:1600}) : request(src);
      const model={...__finalKindRows.find(r=>r.key==='image-result').model,id:'1',x:0,y:0,width:400,height:400/1.5,resultSrc:'/output/quality-original.png',generationHistory:[],currentGenerationId:''};
      restoreCanvasBoard({id:'dom-scaling-mock-board',nodes:[model],connections:[],viewport:{x:80,y:140,scale:3.7}});
      canvasState.activeBoardPersisted=false;canvasState.isRestoring=false;clearCanvasSelection();CanvasNodeRepresentation.reconcile();clearTimeout(canvasState.saveTimer);
      markCanvasViewportInteraction();
    });
    await S.settle(f.page,1600);
    const result=await f.page.evaluate(() => {
      const node=canvasVirtualStore.getMounted('1'),light=node?.querySelector('canvas'),rect=light?.getBoundingClientRect();
      const entry=canvasSceneTextureCache.get('/output/quality-original.png');
      return {scale:canvasState.scale,detailReady:canvasDetailReady,level:canvasVirtualStore.getMountedLevel('1')||'scene',texture:entry&&{state:entry.state,quality:entry.quality,width:entry.width,height:entry.height,decodedWidth:entry.image?.naturalWidth,decodedHeight:entry.image?.naturalHeight},light:light&&{width:light.width,height:light.height,screenWidth:rect.width,screenHeight:rect.height,dpr:devicePixelRatio},snapshot:__domScalingSnapshot()};
    });
    fs.mkdirSync(OUT,{recursive:true});
    await f.page.screenshot({path:path.join(OUT,'high-zoom.png')});
    S.writeJSON(path.join(OUT,'quality.json'),{result,requests,errors:f.errors});
    assert.equal(result.snapshot.full,0,'清晰度升级不能触发 Full hydrate');
    assert.equal(result.texture?.quality,'original','放大且静止后必须升级到原图');
    assert.equal(result.texture?.decodedWidth,2400);
    assert.equal(requests.length,1,'原图请求必须去重');
    if(result.light) assert.ok(result.light.width>=Math.floor(result.light.screenWidth*result.light.dpr),'Light backing raster 必须覆盖屏幕像素，不能把低清位图放大');
    const stages=[];
    const read=()=>f.page.evaluate(()=>{const n=canvasVirtualStore.getMounted('1'),c=n?.querySelector('canvas'),r=c?.getBoundingClientRect();return {scale:canvasState.scale,level:canvasVirtualStore.getMountedLevel('1'),full:__domScalingSnapshot().full,width:c?.width,height:c?.height,screenWidth:r?.width,rect:r&&{x:r.x,y:r.y,width:r.width,height:r.height}};});
    // A real wheel gesture must retain the existing bitmap while active, then
    // resolve to screen resolution through the existing idle repaint.
    await f.page.mouse.move(700,500);
    await f.page.mouse.wheel(0,-100);
    const active=await read();stages.push({kind:'active-wheel',...active});
    assert.equal(active.width,result.light.width,'手势中不能反复分配大位图');
    await S.settle(f.page,1000);
    const idle=await read();stages.push({kind:'idle-wheel',...idle});
    assert.ok(idle.scale>result.scale,'原生 wheel 必须实际改变倍率');
    assert.ok(idle.width>=Math.floor(idle.screenWidth),'手势结束后重建足够清晰的位图');
    assert.equal(idle.full,0);
    await f.page.mouse.click(350,400);await S.settle(f.page,350);
    const full=await read();stages.push({kind:'single-click',...full});
    assert.equal(full.full,1,'保留单击进入原交互节点');
    await f.page.mouse.click(1600,1020);await S.settle(f.page,1100);
    const returned=await read();stages.push({kind:'blank-click-return',...returned});
    assert.equal(returned.full,0);assert.equal(returned.level,'light');
    assert.ok(returned.width>=Math.floor(returned.screenWidth),'Full→Light 后仍使用清晰位图');
    assert.equal(requests.length,1,'往返和变焦不得重复请求原图');
    await f.page.screenshot({path:path.join(OUT,'after-roundtrip.png')});
    await f.page.evaluate(()=>{canvasState.scale=20;applyCanvasTransform();scheduleCanvasSceneRender();});
    await S.settle(f.page,750);const extreme=await read();stages.push({kind:'extreme-raster-cap',...extreme});
    assert.ok(extreme.width<=4096&&extreme.height<=4096);
    assert.ok(extreme.width*extreme.height<=4*1024*1024+8192,'极端倍率位图内存必须有界');
    assert.equal(extreme.full,0);
    S.writeJSON(path.join(OUT,'quality.json'),{result,stages,requests,errors:f.errors,sourceResources:f.sourceResources});
    console.log(JSON.stringify({result:{...result,snapshot:{full:result.snapshot.full,light:result.snapshot.light,documentDOM:result.snapshot.documentDOM}},stages,requests,errors:f.errors},null,2));
    assert.deepEqual(f.errors,[]);
  } finally {await f.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
