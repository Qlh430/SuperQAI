const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
;(async () => {
  const browser = await chromium.launch({headless:true,executablePath:'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'})
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1100}}), errors=[]
    page.on('pageerror',e=>errors.push(e.message))
    await page.route('**/api/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({authenticated:false,models:[],providers:[],boards:[],projects:[],resources:[],records:[],preferences:{},settings:{}})}))
    const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII='
    const wav=Buffer.alloc(44+16000);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(16000,40)
    let audioRequests=[]
    await page.route('**/api/providers/audio-models',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({models:[{id:'qa-audio',modelId:'tts-1',providerId:'qa-station',providerName:'测试音频服务',capabilities:['audio.generate'],modelProtocol:'audio-speech',parameterOverrides:{voice:'configured-speaker',response_format:'wav'}}]})}))
    await page.route('**/api/providers/generate-audio',r=>{audioRequests.push(r.request().postDataJSON());return r.fulfill({contentType:'application/json',body:JSON.stringify({audio:{url:'/output/qa-audio.wav',mimeType:'audio/wav'}})})})
    await page.route('**/output/qa-audio.wav',r=>{
      // The runtime serves media with HTTP range support; emulate it so the
      // browser can actually seek the generated audio.
      const range=r.request().headers()['range']
      if(range){const m=/bytes=(\d+)-(\d*)/.exec(range);const start=Number(m[1]);const end=m[2]?Number(m[2]):wav.length-1;const chunk=wav.subarray(start,end+1);return r.fulfill({status:206,headers:{'content-type':'audio/wav','accept-ranges':'bytes','content-range':`bytes ${start}-${end}/${wav.length}`,'content-length':String(chunk.length)},body:chunk})}
      return r.fulfill({status:200,headers:{'content-type':'audio/wav','accept-ranges':'bytes','content-length':String(wav.length)},body:wav})
    })
    await page.route('**/output/qa-history*.png',r=>r.fulfill({contentType:'image/png',body:Buffer.from(png,'base64')}))
    await page.route('**/api/chat',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({choices:[{message:{content:'已生成的文本结果'}}]})}))
    if(process.env.GENERATOR_SOURCE) for(const name of ['script.js','flora-generator-composer.js','flora-generator-parameters.js','flora-node-shell.js','flora-node-shell.css','flora-generation-history.js','flora-generation-history.css','canvas-audio-generator.js']) {
      const file=path.join(process.env.GENERATOR_SOURCE,name==='script.js'?'script-before-save-bridge.js':name)
      if(fs.existsSync(file)) await page.route(`**/${name}*`,r=>r.fulfill({contentType:name.endsWith('.css')?'text/css':'application/javascript',body:fs.readFileSync(file,'utf8')}))
    }
    await page.goto(process.env.AI_OS_TEST_URL||'http://127.0.0.1:3199/',{waitUntil:'domcontentloaded'})
    if(process.env.GENERATOR_SOURCE) for(const name of ['flora-generation-history.js','canvas-audio-generator.js']) {
      const file=path.join(process.env.GENERATOR_SOURCE,name)
      const key=name==='flora-generation-history.js'?'FloraGenerationHistory':'CanvasAudioGenerator'
      if(fs.existsSync(file) && !(await page.evaluate(key=>Boolean(window[key]),key))) await page.addScriptTag({path:file})
    }
    if(process.env.GENERATOR_SOURCE && fs.existsSync(path.join(process.env.GENERATOR_SOURCE,'flora-generation-history.css'))) await page.addStyleTag({path:path.join(process.env.GENERATOR_SOURCE,'flora-generation-history.css')})
    await page.evaluate(async()=>{
      const modules=await AiOsModuleLoader.ensure(['canvas-runtime','canvas-node-generator','canvas-node-comfy','canvas-node-llm','canvas-node-video-api','canvas-node-minimax-h3','canvas-node-asset-collection'])
      if(modules?.ok===false) throw new Error(JSON.stringify(modules))
      await loadCanvasBoards();canvasState.activeBoardId='qa-generation-history'
      const surface=document.createElement('div');surface.id='neonEngineSurface';surface.style.cssText='position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#090a0c';document.body.append(surface)
      const view=document.querySelector('#canvasView');surface.append(view);view.hidden=false;view.classList.add('active');view.style.cssText='flex:1;min-height:0;width:100%';document.querySelector('#canvasEditorScreen').hidden=false;document.body.classList.add('canvas-surface-open');showCanvasEditor()
      window.qaImage=addCanvasImageGeneratorNode({x:100,y:50});qaImage.dataset.qaGeneration='image'
      canvasState.scale=1;canvasState.x=300;canvasState.y=0;applyCanvasTransformNow();selectCanvasNode(qaImage)
      setCanvasImageNodeGenerationState(qaImage,true)
    })
    await page.waitForFunction(()=>document.querySelector('[data-qa-generation=image] .flora-generator-run-icon')?.dataset.runIcon==='loader-circle')
    assert.notEqual(await page.locator('[data-qa-generation=image] .flora-generator-run-icon').evaluate(e=>getComputedStyle(e).animationName),'none','加载图标必须实际旋转')
    await page.evaluate(()=>{
      setCanvasImageNodeGenerationState(qaImage,false)
      const job={id:'qa-job-1',boardId:canvasState.activeBoardId,nodeId:qaImage.dataset.id,model:'qa-image',result:{data:[{url:'/output/qa-history-1.png',width:1254,height:1254}]}}
      commitCanvasImageJobResult(qaImage,job,'香蕉')
    })
    assert.equal(await page.locator('[data-qa-generation=image] .canvas-node-result img').isVisible(),true,'实际图片提交必须更新原节点预览')
    assert.equal(await page.locator('.canvas-node-asset-collection').count(),0,'图片提交不能自动创建图集')
    assert.equal(await page.locator('[data-qa-generation=image] .flora-generator-status').isVisible(),false,'完成后不再保留状态行')
    assert.equal(await page.locator('[data-qa-generation=image] .flora-node-toolbar [data-flora-action="result-download"]').isVisible(),true,'生成结果下载入口在节点工具栏')
    const saved=await page.evaluate(()=>serializeCanvasNode(qaImage))
    assert.equal(saved.generationHistory.length,1,'节点历史进入真实序列化数据')
    await page.evaluate(()=>commitCanvasImageJobResult(qaImage,{id:'qa-job-1',boardId:canvasState.activeBoardId,nodeId:qaImage.dataset.id,result:{data:[{url:'/output/qa-history-1.png'}]}},'香蕉'))
    assert.equal((await page.evaluate(()=>serializeCanvasNode(qaImage))).generationHistory.length,1,'恢复轮询重复提交不新增历史')
    await page.evaluate(()=>commitCanvasImageJobResult(qaImage,{id:'qa-job-2',boardId:canvasState.activeBoardId,nodeId:qaImage.dataset.id,result:{data:[{url:'/output/qa-history-2.png'}]}},'第二张'))
    assert.equal((await page.evaluate(()=>serializeCanvasNode(qaImage))).generationHistory.length,2)
    await page.evaluate(()=>{
      const item=serializeCanvasNode(qaImage);window.qaRestored=restoreCanvasBoardNode({...item,id:'qa-history-restored'}, {},{maxId:0})
    })
    assert.equal(await page.evaluate(()=>serializeCanvasNode(qaRestored).generationHistory.length),2,'历史真实恢复后仍存在')
    await page.evaluate(()=>unmountCanvasVirtualNode(qaRestored.dataset.id,qaRestored))
    await page.evaluate(()=>{
      window.qaText=addCanvasLlmNode({x:100,y:50});qaText.dataset.qaGeneration='text';selectCanvasNode(qaText)
      const select=qaText.querySelector('.canvas-llm-model');select.innerHTML='<option value="qa-chat">测试文本模型</option>';select.value='qa-chat';select.dataset.catalogUnavailable='false'
    })
    const text=page.locator('[data-qa-generation=text]'),textPanel=text.locator('.flora-generator-composer')
    await textPanel.waitFor({state:'visible'})
    await textPanel.locator('.canvas-llm-prompt').fill('写一句话')
    await textPanel.locator('.canvas-llm-run').click()
    await text.locator('.canvas-llm-output').getByText('已生成的文本结果',{exact:true}).waitFor()
    assert.equal(await page.locator('.canvas-node-text').count(),0,'文本结果留在原节点')
    assert.equal((await text.evaluate(node=>serializeCanvasNode(node))).generationHistory.length,1)
    await text.locator('.canvas-llm-output').dblclick();await text.locator('.canvas-llm-output').fill('编辑后的结果');await text.locator('.canvas-llm-output').blur()
    assert.equal((await text.evaluate(node=>serializeCanvasNode(node))).llmOutput,'编辑后的结果')
    assert.equal((await text.evaluate(node=>serializeCanvasNode(node))).generationHistory[0].text,'编辑后的结果','文本编辑同步当前历史')
    await page.evaluate(()=>{unmountCanvasVirtualNode(qaImage.dataset.id,qaImage);unmountCanvasVirtualNode(qaText.dataset.id,qaText)})
    await page.evaluate(()=>{window.qaVideo=addCanvasVideoGeneratorNode({x:100,y:50});qaVideo.dataset.qaGeneration='video';selectCanvasNode(qaVideo)})
    const video=page.locator('[data-qa-generation=video]'),videoPanel=video.locator('.flora-generator-composer')
    await videoPanel.waitFor({state:'visible'})
    await videoPanel.locator('.canvas-api-video-prompt-input').fill('镜头推进')
    await page.evaluate(()=>deliverCanvasApiVideoResult(qaVideo,['/output/qa-video.mp4'],'镜头推进'))
    assert.equal(await video.locator('.canvas-video-preview').count(),1)
    assert.equal(await page.locator('.canvas-node-asset-collection').count(),0)
    assert.equal((await video.evaluate(node=>serializeCanvasNode(node))).generationHistory.length,1)
    assert.equal(Math.round((await video.locator('.flora-node-shell').boundingBox()).width),640,'视频预览采用宽版布局')
    const cases=[];fs.mkdirSync(path.join(__dirname,'acceptance'),{recursive:true})
    for(const width of [390,768,1440,1728]) {
      await page.setViewportSize({width,height:1050})
      await page.evaluate(width=>{const n=qaVideo,scale=width<768?0.5:1;canvasState.scale=scale;canvasState.x=(width-640*scale)/2-Number(n.dataset.x)*scale;canvasState.y=80-Number(n.dataset.y)*scale;applyCanvasTransformNow();selectCanvasNode(n)},width)
      await page.waitForTimeout(100);const box=await videoPanel.boundingBox();assert.ok(box.x>=15&&box.x+box.width<=width-15)
      await page.screenshot({path:path.join(__dirname,`acceptance/generation-video-${width}.png`)});cases.push(width)
    }
    await page.evaluate(()=>{unmountCanvasVirtualNode(qaVideo.dataset.id,qaVideo);window.qaAudio=addCanvasAudioGeneratorNode({x:100,y:50});qaAudio.dataset.qaGeneration='audio';selectCanvasNode(qaAudio)})
    const audio=page.locator('[data-qa-generation=audio]'),audioPanel=audio.locator('.flora-generator-composer')
    await page.setViewportSize({width:1440,height:1050})
    await page.evaluate(()=>{canvasState.scale=1;canvasState.x=420;canvasState.y=0;applyCanvasTransformNow()})
    await audioPanel.locator('.canvas-audio-generator-model option[value="qa-audio"]').waitFor({state:'attached'})
    await audioPanel.locator('.canvas-audio-generator-model').selectOption('qa-audio')
    await audioPanel.locator('.canvas-audio-generator-prompt').fill('你好，测试音频')
    await audioPanel.locator('.canvas-audio-generator-run').click()
    await page.waitForFunction(()=>qaAudio.querySelector('audio').duration===1)
    assert.equal(audioRequests.length,1)
    assert.equal(audioRequests[0].prompt,'你好，测试音频')
    assert.equal((await audio.evaluate(node=>serializeCanvasNode(node))).generationHistory.length,1)
    assert.equal(await audio.locator('.flora-generator-placeholder').isVisible(),false,'音频生成完成隐藏占位')
    const timeline=audio.locator('.flora-audio-timeline'),tb=await timeline.boundingBox()
    await page.mouse.move(tb.x+tb.width*.1,tb.y+tb.height/2);await page.mouse.down();await page.mouse.move(tb.x+tb.width*.7,tb.y+tb.height/2);await page.mouse.up()
    await page.waitForFunction(()=>qaAudio.querySelector('audio').currentTime>.6,{timeout:5000})
    assert.ok(await audio.locator('audio').evaluate(e=>e.currentTime)>.6,'生成音频真实进度可拖动')
    await audio.locator('.flora-audio-play').click();assert.equal(await audio.locator('audio').evaluate(e=>e.paused),false)
    await audio.locator('.flora-audio-play').click()
    const savedAudio=await audio.evaluate(node=>serializeCanvasNode(node))
    await page.evaluate(saved=>{unmountCanvasVirtualNode(qaAudio.dataset.id,qaAudio);window.qaAudio=restoreCanvasBoardNode({...saved,id:'qa-restored-audio'}, {},{maxId:0});qaAudio.dataset.qaGeneration='audio';selectCanvasNode(qaAudio)},savedAudio)
    assert.equal(await audio.locator('audio').getAttribute('src'),'/output/qa-audio.wav')
    for(const width of [390,768,1440,1728]) {
      await page.setViewportSize({width,height:1050})
      await page.evaluate(width=>{canvasState.scale=width<768?.65:1;canvasState.x=(width-400*canvasState.scale)/2-Number(qaAudio.dataset.x)*canvasState.scale;canvasState.y=80-Number(qaAudio.dataset.y)*canvasState.scale;applyCanvasTransformNow();selectCanvasNode(qaAudio)},width)
      await page.waitForTimeout(100);const box=await audioPanel.boundingBox();assert.ok(box.x>=15&&box.x+box.width<=width-15)
      await page.screenshot({path:path.join(__dirname,`acceptance/generation-audio-${width}.png`)})
    }
    assert.deepEqual(errors,[])
    fs.writeFileSync(path.join(__dirname,'acceptance/generation-node-report.json'),JSON.stringify({errors,cases,evidence:'真实宿主图片/文本/视频提交、序列化与恢复；同源业务接口模拟。'},null,2))
    console.log(JSON.stringify({errors,cases,result:'生成节点与真实宿主提交/恢复通过'}))
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
