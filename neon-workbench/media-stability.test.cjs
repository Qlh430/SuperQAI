const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const context={setTimeout,clearTimeout};vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/design-sources/canvas-representation-manager.js','utf8'),context);const {CanvasRepresentationManager}=context;
test('Light threshold has hysteresis during wheel boundary oscillation',()=>{
 const m=new CanvasRepresentationManager();let width=270;const store={get:()=>({kind:'image',width,height:200}),getRect:()=>({left:0,top:0,right:width,bottom:200})};
 const plan=()=>m.plan({visibleIds:['image'],viewport:{scale:1,width:800,height:600},store});
 assert.equal(plan().get('image'),'light');width=255;assert.equal(plan().get('image'),'light');width=230;assert.equal(plan().get('image'),'light');width=200;assert.equal(plan().has('image'),false);
});
test('failed original decode retains ready thumbnail and never marks original ready',async()=>{
 const source=fs.readFileSync(__dirname+'/design-sources/script-before-save-bridge.js','utf8');const f=source.slice(source.indexOf('function resolveCanvasSceneTexture('),source.indexOf('\nfunction renderCanvasSceneLayer('));
 const thumb={naturalWidth:640},entry={state:'ready',image:thumb,thumbnail:thumb,quality:'thumbnail',width:1800,height:1200};let task,present=0;
 class Image{set src(v){if(v)queueMicrotask(()=>this.onload?.());}decode(){return Promise.reject(Error('corrupt decode'));}}
 const scope={Image,Date,Set,Map,canvasSceneTextureCache:new Map([['/original',entry]]),canvasSceneOriginalDemand:new Set(),canvasSceneOriginalPixels:0,canvasState:{x:0,y:0,scale:1},canvasDetailReady:true,document:{querySelector:()=>({clientWidth:800,clientHeight:600,getBoundingClientRect:()=>({width:800})})},window:{devicePixelRatio:1,ImageLoadingRules:{chooseCanvasImageQuality:()=> 'original'}},canvasMediaScheduler:{isPending:()=>false,enqueue:t=>(task=t,'task')},scheduleCanvasSceneRender:()=>present++};
 vm.createContext(scope);vm.runInContext(f,scope);assert.equal(scope.resolveCanvasSceneTexture('/original',{x:0,y:0,width:500,height:300}),thumb);await task.run(new AbortController().signal);assert.equal(entry.image,thumb);assert.equal(entry.quality,'thumbnail');assert.equal(present,0);
});
test('thumbnail service failure falls back to the original image and caches the decoded result',async()=>{
 const source=fs.readFileSync(__dirname+'/design-sources/script-before-save-bridge.js','utf8');const f=source.slice(source.indexOf('function resolveCanvasSceneTexture('),source.indexOf('\nfunction renderCanvasSceneLayer('));
 let present=0,requests=0,task;
 class Image{set src(v){this._src=v;if(v==='/original')queueMicrotask(()=>this.onload?.());else queueMicrotask(()=>this.onerror?.());}get src(){return this._src;}decode(){return Promise.resolve();}}
 const scope={Image,Date,Set,Map,canvasSceneTextureCache:new Map(),canvasImageDimensions:new Map(),canvasSceneOriginalDemand:new Set(),canvasSceneOriginalPixels:0,canvasState:{x:0,y:0,scale:1},canvasDetailReady:true,document:{querySelector:()=>({clientWidth:800,clientHeight:600,getBoundingClientRect:()=>({width:800})})},window:{devicePixelRatio:1,ImageLoadingRules:{chooseCanvasImageQuality:()=> 'thumbnail'},imageResources:{requestThumbnail:async()=>{requests++;throw Error('thumbnail unavailable');}}},canvasMediaScheduler:{isPending:()=>false,enqueue:value=>{task=value;queueMicrotask(()=>value.run(new AbortController().signal));return 'fallback-task';}},scheduleCanvasSceneRender:()=>present++};
 vm.createContext(scope);vm.runInContext(f,scope);assert.equal(scope.resolveCanvasSceneTexture('/original',{x:0,y:0,width:500,height:300}),null);await new Promise(resolve=>setTimeout(resolve,20));assert.ok(task,'thumbnail failure must enqueue the original fallback');assert.equal(scope.resolveCanvasSceneTexture('/original',{x:0,y:0,width:500,height:300})?.src,'/original');assert.equal(requests,1,'one thumbnail request');assert.equal(scope.canvasSceneTextureCache.get('/original').state,'ready','fallback is cached as ready');assert.equal(present,1,'successful fallback schedules one scene redraw');
});
test('media with real results uses the lightweight hover port without requiring Full hydration',()=>{
 const source=fs.readFileSync(__dirname+'/design-sources/script-before-save-bridge.js','utf8');const start=source.indexOf('function supportsCanvasMediaPortPreview('),end=source.indexOf('\nlet canvasHoverPortPreview',start);const f=source.slice(start,end);
 const scope={window:{CanvasNodeVisuals:{project:model=>({renderer:model.renderer,source:model.resultSrc||'',mediaSource:model.mediaSrc||''})}}};vm.createContext(scope);vm.runInContext(f+';globalThis.supports=supportsCanvasMediaPortPreview;',scope);
 assert.equal(scope.supports({kind:'comfy',renderer:'image-generator',resultSrc:'/generated.png'}),true);
 assert.equal(scope.supports({kind:'video-api',renderer:'video-generator',resultSrc:'/poster.png',mediaSrc:'/clip.mp4'}),true);
 assert.equal(scope.supports({kind:'audio-generator',renderer:'audio-generator',mediaSrc:'/track.mp3'}),true);
 assert.equal(scope.supports({kind:'comfy',renderer:'image-generator'}),false);
 assert.equal(scope.supports({kind:'note',resultSrc:'/note.png'}),false);
});
