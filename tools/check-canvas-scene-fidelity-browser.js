"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), http = require("node:http");
const { chromium } = require(path.join(process.env.USERPROFILE, ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"));
const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "script.js"), "utf8");
function fn(name) {
  const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, "m"));
  assert.ok(start >= 0, name);
  const rest = source.slice(start);
  const end = rest.slice(1).search(/^(?:async )?function /m);
  return end < 0 ? rest : rest.slice(0, end + 1);
}
const runtime = `
const canvasState = { x:20, y:20, scale:1, connections:[], activeBoardId:'fixture', selectedIds:new Set(), selectedSceneItems:new Map() };
const model = {id:'portrait',kind:'image', x:10,y:10,width:0,height:0,imageSrc:'/original.svg',imageName:'portrait'};
let canvasSceneLayer=null,canvasSceneRenderFrame=0,canvasDetailReady=true,canvasSceneInteractionSequence=0;
let canvasSceneOriginalPixels=0,canvasDetailTimer=0;
const canvasSceneTextureCache=new Map(),canvasImageDimensions=new Map(),canvasSceneOriginalDemand=new Set(),canvasPersistedNodes=new Map();
const mounted=new Map();
const canvasVirtualStore={getMounted:id=>mounted.get(id),get(){return null},upsert(){}};
const canvasPagedStore={scenePage:{mode:'scene',visualNodes:Array.from({length:2176},(_,i)=>[i?'n'+i:'portrait','image',i?10000+i:10,10,320,240,i,'/original.svg','portrait']),texturedNodeIds:['portrait']},deletedNodeIds:new Set(),getPendingOperations:()=>[]};
const canvasMediaScheduler=new CanvasMediaScheduler({maxOriginals:2});
const imageRequests=[];
window.imageResources={requestThumbnail:async()=>({thumbnailUrl:'/thumb.svg',width:900,height:1630})};
function createCanvasPort(kind){const e=document.createElement('button');e.className='canvas-port canvas-port-'+kind;e.dataset.canvasPort=kind;return e;}
function createCanvasNodeBar(){const e=document.createElement('div');e.className='canvas-node-bar';e.innerHTML='<span class="canvas-node-title">portrait</span>';return e;}
function createCanvasResizeHandle(){return document.createElement('span')}
function registerCanvasDetailImage(img,src){img.setAttribute('data-original-src',src);img.setAttribute('data-canvas-original-src',src);img.addEventListener('load',()=>applyCanvasNodeSize(img.closest('.canvas-node')))}
function scheduleCanvasConnectionRender(){} function scheduleCanvasImageQualityUpdate(){}
function updateCanvasSelectionFrame(){}
function beginCanvasRasterInteraction(){} function scheduleCanvasRasterRefresh(){}
const canvasVirtualizer={schedule(){}};
function getCanvasNodeKind(){return 'image'} function cloneCanvasOperationValue(v){return structuredClone(v)}
function pinCanvasNode(){} function selectCanvasNode(n){n.classList.add('is-selected')}
function beginCanvasNodeDrag(){} function toSystemDelta(v){return v}
function setCanvasStatus(message){throw new Error(message)}
async function loadCanvasSceneNode(){return model}
const canvasImageToolbar={show(){},refresh(){}};
function ensureCanvasNodeMounted(){
 const n=document.createElement('div');n.className='canvas-node canvas-node-image';Object.assign(n.dataset,{id:model.id,x:String(model.x),y:String(model.y)});
 renderCanvasUploadNode(n,{src:model.imageSrc,name:'portrait'});applyCanvasNodeSize(n);
 document.querySelector('#canvasPlane').style.transform='translate('+canvasState.x+'px,'+canvasState.y+'px) scale('+canvasState.scale+')';
 n.style.transform='translate(10px,10px)';document.querySelector('#canvasPlane').append(n);mounted.set(model.id,n);return n;
}
${['ensureCanvasSceneLayer','scheduleCanvasSceneRender','resolveCanvasSceneTexture','renderCanvasSceneLayer','getCanvasSceneVisualNodes','getCanvasSceneConnectionSegments','reprojectCanvasSceneLayer','renderCanvasUploadNode','getCanvasImageContentRect','applyCanvasNodeSize','beginCanvasSceneNodeInteraction','markCanvasViewportInteraction'].map(fn).join('\n')}
window.fixture={state:canvasState,cache:canvasSceneTextureCache,mounted,render:renderCanvasSceneLayer,promote:()=>beginCanvasSceneNodeInteraction({clientX:100,clientY:100},canvasSceneLayer.hitTest(180,140)),reproject:reprojectCanvasSceneLayer};
renderCanvasSceneLayer();
`;
function svg(width,height){return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 900 1630"><rect width="900" height="1630" fill="#b22325"/><path d="M0 0L900 1630M900 0L0 1630" stroke="white" stroke-width="12"/><text x="100" y="300" font-size="100">Portrait</text></svg>`}
(async()=>{
 const requests=[];
 const server=http.createServer((req,res)=>{
  requests.push(req.url);
  if(req.url==='/original.svg'||req.url==='/thumb.svg') {res.setHeader('Content-Type','image/svg+xml');res.end(req.url==='/original.svg'?svg(900,1630):svg(353,640));return;}
  const files=['styles.css','ai-os-theme.css','desktop-shell.css','canvas-virtualization-rules.js','canvas-scene-layer.js','canvas-media-scheduler.js','image-loading-rules.js'];
  const file=req.url.slice(1);if(files.includes(file)){res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(path.join(root,file)));return;}
  res.setHeader('Content-Type','text/html');res.end(`<html data-theme="light"><head>${files.filter(f=>f.endsWith('.css')).map(f=>`<link rel="stylesheet" href="/${f}">`).join('')}<style>html,body{margin:0}#infiniteCanvas{position:absolute;inset:0;width:100%;height:100%}</style></head><body><div id="infiniteCanvas"><canvas id="canvasSceneLayer" class="canvas-scene-layer"></canvas><div id="canvasPlane" class="canvas-plane"></div></div>${files.filter(f=>f.endsWith('.js')).map(f=>`<script src="/${f}"></script>`).join('')}</body></html>`);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  const page=await browser.newPage({viewport:{width:1600,height:1100},deviceScaleFactor:1.25});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${server.address().port}`);await page.addScriptTag({content:runtime});
  await page.waitForFunction(()=>fixture.cache.get('/original.svg')?.state==='ready');
  await page.evaluate(()=>fixture.render());
  const before=await page.evaluate(()=>{
    const n=canvasSceneLayer.hitTest(180,140).item,t=fixture.cache.get('/original.svg').image;
    const ratio=Math.min(n.width/t.naturalWidth,n.height/t.naturalHeight);
    return {x:fixture.state.x+n.x+(n.width-t.naturalWidth*ratio)/2,y:fixture.state.y+n.y+(n.height-t.naturalHeight*ratio)/2,width:t.naturalWidth*ratio,height:t.naturalHeight*ratio};
  });
  const artifacts=path.join(root,'artifacts','canvas-scene-fidelity');fs.mkdirSync(artifacts,{recursive:true});
  await page.screenshot({path:path.join(artifacts,'before-selection.png')});
  assert.equal(requests.filter(x=>x==='/original.svg').length,0,'initial dense canvas must load only thumbnails');
  await page.evaluate(()=>fixture.promote());
  await page.waitForFunction(()=>document.querySelector('.canvas-node img')?.naturalWidth>0);
  const geometry=await page.evaluate(()=>{const n=document.querySelector('.canvas-node');return {width:n.offsetWidth,height:n.offsetHeight,persistedWidth:n.dataset.width||'0',persistedHeight:n.dataset.height||'0'}});
  assert.deepEqual(geometry,{width:133,height:240,persistedWidth:'0',persistedHeight:'0'},'interactive box must wrap the portrait, without changing automatic sizing metadata');
  const after=await page.locator('.canvas-node img').boundingBox();
  for(const key of ['x','y','width','height']) assert.ok(Math.abs(after[key]-before[key])<1,`image ${key} must not jump on selection`);
  const port=await page.locator('.canvas-port-output').boundingBox();
  assert.ok(Math.abs(port.x+port.width/2-after.x-after.width)<1,`output connector must sit on the image right edge: ${JSON.stringify({port,after})}`);
  assert.ok(Math.abs(port.y+port.height/2-after.y-after.height/2)<1,'output connector must sit on the image vertical center');
  assert.equal(await page.evaluate(()=>document.elementFromPoint(40,140)?.closest('.canvas-node')?.dataset.id||null),null,'invisible padding must not capture a click');
  await page.screenshot({path:path.join(artifacts,'after-selection.png')});
  assert.deepEqual(await page.evaluate(()=>{
    const img=document.querySelector('.canvas-node img'),style=getComputedStyle(img);
    return {fit:style.objectFit,rounding:style.borderRadius,title:getComputedStyle(document.querySelector('.canvas-node-bar')).display,shadow:getComputedStyle(img.closest('.canvas-node')).boxShadow};
  }),{fit:'contain',rounding:'0px',title:'none',shadow:'none'},'selected images retain uncropped, frameless presentation');
  await page.evaluate(()=>{fixture.mounted.forEach(n=>n.remove());fixture.mounted.clear();fixture.state.scale=2.26;fixture.reproject();markCanvasViewportInteraction()});
  await page.waitForFunction(()=>fixture.cache.get('/original.svg')?.quality==='original',{},{timeout:4000});
  await page.waitForFunction(()=>canvasSceneLayer.lastTransform.scale===2.26 && document.querySelector('#canvasSceneLayer').style.transform==='');
  const rasterMetrics = await page.evaluate(() => ({ width: canvasSceneLayer.canvas.width, rasterWidth: canvasSceneLayer.rasterWidth, viewportWidth: canvasSceneLayer.width, padding: canvasSceneLayer.padding, dpr: canvasSceneLayer.devicePixelRatio }));
  assert.equal(rasterMetrics.width, Math.round(rasterMetrics.rasterWidth * rasterMetrics.dpr), 'scene backing resolution must include display DPI and finite padding');
  assert.equal(rasterMetrics.rasterWidth, rasterMetrics.viewportWidth + rasterMetrics.padding * 2, 'scene raster padding must be symmetric');
  assert.equal(requests.filter(x=>x==='/original.svg').length,1,'repeated source must share one original request');
  await page.evaluate(()=>{fixture.state.x=-100000;fixture.render()});
  assert.equal(await page.evaluate(()=>fixture.cache.get('/original.svg')?.quality),'thumbnail','offscreen originals must be released');
  assert.deepEqual(errors,[]);
  console.log('Dense canvas: 2176 nodes, stable selection geometry, preview-first loading, shared original upgrade and offscreen release passed.');
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
})().catch(e=>{console.error(e);process.exitCode=1});
