const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { chromium } = require('playwright')

const sourcePath = path.join(__dirname, 'design-sources/flora-generation-history.js')
assert.ok(fs.existsSync(sourcePath), '节点历史模块存在')
const source = fs.readFileSync(sourcePath, 'utf8')
const events = []
const root = { dispatchEvent: event => events.push(event), CustomEvent, queueMicrotask }
vm.runInNewContext(source, { window: root, CustomEvent, console, URL, Date, JSON, WeakMap, Set })
const api = root.FloraGenerationHistory
let checked = 0
function check(value, message) { assert.ok(value, message); checked++ }
const node = { dataset: {} }
const image = { id: 'job-1', kind: 'image', src: 'https://example.test/a.png', prompt: '原提示词', createdAt: 1, requestedSize: '1024x1024', actualSize: '800x600' }
api.add(node, image)
check(api.serialize(node).generationHistory.length === 1, '添加结果进入节点 JSON')
check(api.serialize(node).currentGenerationId === 'job-1', '添加结果设为当前')
api.add(node, { ...image, savedUrl: '/saved/a.png' })
check(api.serialize(node).generationHistory.length === 1, '同一任务完成回调去重')
check(api.serialize(node).generationHistory[0].savedUrl === '/saved/a.png', '重复回调补充保存地址')
check(events.filter(event => event.type === 'flora-generation-history-change').length === 2, '每次变更通知宿主持久化')
const restored = { dataset: {} }
api.hydrate(restored, api.serialize(node).generationHistory, 'missing')
check(api.serialize(restored).currentGenerationId === 'job-1', '无效当前 ID 恢复为最近结果')
const snapshot = api.serialize(node); snapshot.generationHistory[0].prompt = '被改写'
check(api.serialize(node).generationHistory[0].prompt === '原提示词', '序列化快照不泄漏可变状态')
const corrupt = { dataset: { generationHistory: '{broken', currentGenerationId: 'old' } }
check(api.serialize(corrupt).generationHistory.length === 0, '损坏节点 JSON 可安全读取')
api.hydrate(restored, [image, image, { id: 'job-2', kind: 'text', text: '第二次输出' }], 'job-1')
check(api.serialize(restored).generationHistory.length === 2 && api.serialize(restored).currentGenerationId === 'job-1', '恢复去重且保留历史选择')
api.add(restored, { id: 'job-2', kind: 'text', text: '更新第二次输出' })
check(api.serialize(restored).currentGenerationId === 'job-1', '重复任务回调保留用户选择的旧结果')
check(!/localStorage/.test(source), '不把生成历史写入浏览器持久存储')
const unsafe = { dataset: {} }
for (const badSource of ['https://user:password@example.test/a.png','https://example.test/a.png?api_key=secret','https://example.test/a.png?KEY=secret','https://example.test/a.png?authorization=secret','data:text/html;base64,PHNjcmlwdD4=','data:audio/wav;base64,UklGRg==','javascript:alert(1)']) api.add(unsafe,{id:badSource,kind:'image',src:badSource})
check(api.serialize(unsafe).generationHistory.length === 0, '含凭据、密钥或错误媒体类型的来源不能持久化')
api.add(unsafe,{id:'bad-saved',kind:'image',src:image.src,savedUrl:'https://example.test/image.png?token=secret'})
check(api.serialize(unsafe).generationHistory.length === 0, '已保存地址也必须通过校验')
api.hydrate(unsafe,[{id:'bad-restore',kind:'audio',src:'data:image/png;base64,aGVsbG8='}], 'bad-restore')
check(api.serialize(unsafe).generationHistory.length === 0, '恢复历史时拒绝错误来源')
api.add(unsafe,{id:'signed',kind:'image',src:'https://example.test/a.png?X-Amz-Signature=valid&X-Amz-Credential=asset'})
check(api.serialize(unsafe).generationHistory.length === 1, '允许合法资产签名地址')

// Exercise the real host adapters without executing the unrelated desktop
// bootstrap. Browser interaction below verifies the module these adapters use.
const hostSource = fs.readFileSync(path.join(__dirname,'design-sources/script-before-save-bridge.js'),'utf8')
function hostFunction(name) {
  const start = hostSource.indexOf(`\nfunction ${name}(`)
  assert.ok(start >= 0, `宿主函数存在：${name}`)
  const rest = hostSource.slice(start + 1)
  const next = rest.search(/\n(?:async )?function \w+\(/)
  return next < 0 ? rest : rest.slice(0,next)
}
const hostRestored = []
const hostWindow = { FloraGenerationHistory:api }
const hostContext = vm.createContext({ window:hostWindow, applyCanvasGenerationHistoryItem:(_node,item)=>hostRestored.push(item) })
vm.runInContext(hostFunction('restoreCanvasGenerationHistory'), hostContext)
const restoreNode = { dataset:{},classList:{contains:()=>false} }
hostContext.restoreCanvasGenerationHistory(restoreNode,{generationHistory:[image,{id:'unsafe',kind:'image',src:'https://example.test/a.png?key=secret'}],currentGenerationId:'unsafe'})
check(hostRestored.at(-1)?.id === 'job-1', '宿主恢复应用经过安全校验的历史当前项')
const llmRestoreNode={dataset:{id:'llm'},classList:{contains:name=>name==='canvas-node-llm'}}
hostContext.restoreCanvasGenerationHistory(llmRestoreNode,{generationHistory:[{id:'text-1',kind:'text',text:'旧生成文字'}],currentGenerationId:'text-1',llmOutput:'用户编辑后的文字'})
check(hostRestored.at(-1)?.text === '用户编辑后的文字', '恢复保留LLM用户编辑内容')
const pasteNodes=[], renderedAudio=[]
const pasteCanvasState={clipboard:{nodes:[{id:'old',kind:'audio-generator',audioGeneration:{prompt:'保留音频草稿',modelId:'m'},generationHistory:[{id:'text-result',kind:'text',text:'保留历史'}],currentGenerationId:'text-result'}],connections:[],externalConnections:[],selectedId:'old'},connections:[]}
const pasteContext=vm.createContext({ window:hostWindow,document:{activeElement:null},canvasState:pasteCanvasState,
  isCanvasTypingTarget:()=>false,nextCanvasPasteOffset:()=>28,migrateLegacyCanvasGalleryItem:x=>x,isLegacyCanvasComfyGenerator:()=>false,getCanvasCreateKindFromSerialized:x=>x,
  createCanvasNode:kind=>({dataset:{id:'copy'},classList:{contains:()=>false},querySelector:()=>null}),
  renderCanvasAudioGeneratorNode:(_node,state)=>renderedAudio.push(state),renderCanvasApiNode:()=>{},getImageModelPlatform:()=>'',updateCanvasImageMaskPreview:()=>{},syncCanvasMidjourneyOptions:()=>{},syncCanvasModelParameterOptions:()=>{},
  applyCanvasNodeSize:()=>{},placeCanvasNode:node=>pasteNodes.push(node),restoreCanvasGenerationHistory:(node,item)=>hostContext.restoreCanvasGenerationHistory(node,item),
  updateCanvasNodeRefs:()=>{},clearCanvasSelection:()=>{},addCanvasNodeToSelection:()=>{},getCanvasNode:()=>null,scheduleCanvasConnectionRender:()=>{},scheduleCanvasSave:()=>{},setCanvasStatus:()=>{},loadCanvasAudioModels:()=>Promise.resolve(),
})
vm.runInContext(hostFunction('pasteCanvasNodes'),pasteContext)
pasteContext.pasteCanvasNodes({preventDefault(){}})
check(renderedAudio[0]?.prompt === '保留音频草稿' && renderedAudio[0]?.modelId === 'm', '复制音频节点保留草稿与模型')
check(api.serialize(pasteNodes[0]).currentGenerationId === 'text-result', '复制节点保留历史与当前结果')
const lifecycle=[]
const lifeNode={dataset:{id:'n'},querySelectorAll:()=>[],remove:()=>lifecycle.push('remove')}
const lifeContext=vm.createContext({window:{FloraGenerationHistory:{unmount:()=>lifecycle.push('history')},CanvasAudioGenerator:{unmount:()=>lifecycle.push('audio')},CanvasFloraNodeShell:{unmount:()=>lifecycle.push('shell')}},canvasState:{activeNode:null},syncCanvasNodeModel:()=>{},cancelCanvasMediaImage:()=>{},canvasNodeResizeObserver:null,releaseCanvasImageModelPicker:()=>{}})
vm.runInContext(hostFunction('unmountCanvasVirtualNode'),lifeContext)
lifeContext.unmountCanvasVirtualNode('n',lifeNode)
check(lifecycle.includes('history') && lifecycle.includes('audio') && lifecycle.includes('shell'), '节点卸载清理历史、音频与Flora shell')
lifecycle.length=0
Object.assign(lifeContext,{canvasState:{selectedIds:new Set(),selectedSceneItems:new Map()},canvasPagedStore:{getMounted:()=>lifeNode,setMounted:()=>{}},unpinCanvasNode:()=>{},scheduleCanvasSceneRender:()=>{},dispatchCanvasSelectionChange:()=>{}})
vm.runInContext(hostFunction('applyCanvasOperationLocally'),lifeContext)
lifeContext.applyCanvasOperationLocally({type:'node.delete',entityId:'n'})
check(lifecycle.includes('history') && lifecycle.includes('audio') && lifecycle.includes('shell'), '分页协作删除也清理音频与弹层')
const compatibilityContext=vm.createContext({getCanvasH3ConnectionCapacity:()=>({ok:true}),getCanvasApiVideoConnectionCapacity:()=>({ok:true}),getCanvasMidjourneyConnectionCapacity:()=>({ok:true})})
vm.runInContext(hostFunction('getCanvasConnectionCompatibility'),compatibilityContext)
const classes=(...names)=>({contains:name=>names.includes(name)})
const audioTarget={dataset:{id:'audio'},classList:classes('canvas-node-audio-generator')}
check(compatibilityContext.getCanvasConnectionCompatibility({dataset:{id:'text'}},audioTarget,{type:'text',text:'连接文本'}).ok, '文本可连接到音频生成')
check(!compatibilityContext.getCanvasConnectionCompatibility({dataset:{id:'image'}},audioTarget,{type:'image',url:image.src}).ok, '当前音频协议拒绝参考图片连接')

;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })
  const page = await browser.newPage({ acceptDownloads: true })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await page.setContent('<div id="neonEngineSurface"><div id="canvasEditorScreen"><div class="canvas-node selected" data-flora-node="true"><textarea>当前草稿</textarea><div class="flora-node-shell"></div></div></div></div>')
    await page.addStyleTag({ content: '#canvasEditorScreen{--canvas-neon-bg:#090a0c;--canvas-neon-card:#181b20;--canvas-neon-popover:#20232a;--canvas-neon-text:#f5f5f5;--canvas-neon-muted:#999;--canvas-neon-border:#34363c;--canvas-neon-primary:#c7f95b}body{margin:0}.canvas-node{position:relative;width:300px;height:300px}.flora-node-shell{position:absolute;inset:0}' })
    await page.addStyleTag({ path: path.join(__dirname, 'design-sources/flora-generation-history.css') })
    await page.addScriptTag({ content: source })
    await page.evaluate(() => {
      window.qaNode = document.querySelector('.canvas-node')
      window.qaChanges = []; window.qaSelections = []
      window.addEventListener('flora-generation-history-change', event => qaChanges.push(event.detail.node.dataset.currentGenerationId))
      window.addEventListener('flora-generation-history-select', event => qaSelections.push(event.detail.item?.id || null))
      const src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
      FloraGenerationHistory.hydrate(qaNode, [{ id:'first',kind:'image',src,createdAt:1,requestedSize:'1024x1024',actualSize:'800x600' },{ id:'second',kind:'text',text:'新输出',createdAt:2 }], 'second')
      FloraGenerationHistory.mount(qaNode, qaNode.querySelector('.flora-node-shell'))
    })
    const badge = page.getByRole('button', { name: '查看生成历史，共2条' })
    check(await badge.isVisible(), '有历史时显示数量入口')
    await badge.click()
    const panel = page.getByRole('dialog', { name: '节点生成历史', exact: true })
    check(await panel.isVisible(), '数量入口打开独立历史面板')
    check(await panel.evaluate(element => getComputedStyle(element).backgroundColor === 'rgb(32, 35, 42)' && getComputedStyle(element).color === 'rgb(245, 245, 245)'), '独立面板继承真实画布范围的 Neon 令牌')
    await page.getByRole('button', { name: '选择第1条生成结果', exact: true }).click()
    check(await page.evaluate(() => qaSelections.at(-1) === 'first' && qaChanges.at(-1) === 'first'), '选择发出结果事件后发出保存事件')
    check(await page.locator('textarea').inputValue() === '当前草稿', '选择历史不改写输入草稿')
    check(await page.getByRole('button', { name: '选择第1条生成结果', exact: true }).getAttribute('aria-pressed') === 'true', '选中结果状态可访问')
    await page.getByRole('button', { name: '全屏查看第1条生成结果', exact: true }).click()
    const preview = page.getByRole('dialog', { name: '生成结果全屏预览', exact: true })
    check(await preview.isVisible(), '全屏预览打开并保留历史面板')
    await page.waitForFunction(() => Boolean(document.fullscreenElement))
    check(await page.evaluate(() => document.fullscreenElement.classList.contains('flora-generation-history-preview-content')), '支持时进入真实浏览器全屏')
    check(await preview.locator('img').count() === 1, '预览显示原图')
    check(await preview.getByText('实际尺寸：800x600').count() === 1, '尺寸差异显示实际尺寸说明')
    await page.getByRole('button', { name: '关闭全屏预览', exact: true }).click()
    check(await panel.isVisible(), '关闭预览回到历史')
    const download = page.waitForEvent('download')
    await page.evaluate(() => { window.qaRevoked=[];window.qaRevoke=URL.revokeObjectURL;URL.revokeObjectURL=url=>{qaRevoked.push(url);qaRevoke.call(URL,url)} })
    await page.getByRole('button', { name: '下载第2条生成结果', exact: true }).click()
    check((await download).suggestedFilename().endsWith('.txt'), '文本结果可下载')
    await page.waitForFunction(() => qaRevoked.length > 0,{},{timeout:5000})
    check(await page.evaluate(() => qaRevoked.length === 1), '下载Blob地址及时回收')
    for (const width of [390,768,1440,1728]) {
      await page.setViewportSize({ width, height: 800 })
      check(await panel.evaluate(element => element.getBoundingClientRect().width <= innerWidth - 32 && element.scrollWidth <= element.clientWidth), `${width}px历史面板无横向溢出`)
      check(await panel.locator('button').evaluateAll(buttons => buttons.every(button => button.getBoundingClientRect().height >= 44)), `${width}px控件达到44px`)
    }
    await page.getByRole('button', { name: '删除第1条生成结果', exact: true }).click()
    check(await page.evaluate(() => qaSelections.at(-1) === 'second' && FloraGenerationHistory.serialize(qaNode).generationHistory.length === 1), '删除当前项切换到剩余结果')
    await page.getByRole('button', { name: '删除第1条生成结果', exact: true }).click()
    check(await page.evaluate(() => qaSelections.at(-1) === null && FloraGenerationHistory.serialize(qaNode).currentGenerationId === ''), '删除最后结果清空当前并发出空结果')
    check(await panel.getByText('暂无生成历史').isVisible(), '删除后空态可见')
    await page.getByRole('button', { name: '关闭生成历史', exact: true }).click()
    await page.evaluate(() => { FloraGenerationHistory.add(qaNode,{id:'third',kind:'text',text:'再次生成'}); FloraGenerationHistory.mount(qaNode,qaNode.querySelector('.flora-node-shell')) })
    check(await page.locator('.flora-generation-history-badge').count() === 1, '重复挂载不重复入口')
    await page.locator('.flora-generation-history-badge').click()
    await page.keyboard.press('Escape')
    check(await page.locator('.flora-generation-history-badge').evaluate(element => element === document.activeElement), 'Escape关闭面板并恢复入口焦点')
    const wav = Buffer.alloc(44 + 16000)
    wav.write('RIFF',0); wav.writeUInt32LE(wav.length - 8,4); wav.write('WAVEfmt ',8); wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22); wav.writeUInt32LE(8000,24); wav.writeUInt32LE(16000,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34); wav.write('data',36); wav.writeUInt32LE(16000,40)
    await page.evaluate(src => FloraGenerationHistory.hydrate(qaNode,[{id:'audio-result',kind:'audio',src}], 'audio-result'), `data:audio/wav;base64,${wav.toString('base64')}`)
    await page.locator('.flora-generation-history-badge').click()
    await page.getByRole('button',{name:'全屏查看第1条生成结果',exact:true}).click()
    check(await preview.getByRole('button',{name:'播放音频',exact:true}).count() === 1, '音频预览复用 Neon 播放控制语言')
    check(await preview.locator('audio').evaluate(element => element.controls === false), '音频不显示另一套浏览器控件')
    await preview.locator('audio').evaluate(element => element.readyState >= 1 || new Promise(resolve => element.addEventListener('loadedmetadata',resolve,{once:true})))
    check(await preview.getByRole('slider',{name:'音频进度',exact:true}).isEnabled(), '真实音频解码后可操作进度')
    await preview.getByRole('slider',{name:'音频进度',exact:true}).fill('500')
    check(await preview.locator('audio').evaluate(element => Math.abs(element.currentTime - .5) < .05), '音频进度修改真实媒体时间')
    await page.getByRole('button', { name: '关闭全屏预览', exact: true }).click()
    await page.keyboard.press('Escape')
    await page.locator('.flora-generation-history-badge').click()
    check(await panel.locator('audio[src]').count() === 1, '关闭清理媒体后重开面板恢复地址')
    await page.evaluate(() => { window.qaFetch = window.fetch; window.fetch = async () => { throw new TypeError('Failed to fetch') } })
    await page.getByRole('button',{name:'下载第1条生成结果',exact:true}).click()
    check(await panel.getByRole('status').evaluate(element => element.textContent.includes('下载失败') && !element.textContent.includes('Failed to fetch')), '下载网络错误显示完整中文原因')
    await page.evaluate(() => window.fetch = qaFetch)
    await page.getByRole('button',{name:'全屏查看第1条生成结果',exact:true}).click()
    await page.evaluate(() => FloraGenerationHistory.unmount(qaNode))
    check(await page.locator('.flora-generation-history-panel, .flora-generation-history-preview, .flora-generation-history-badge').count() === 0, '卸载删除所有面板入口')
    check(await page.evaluate(() => FloraGenerationHistory.serialize(qaNode).generationHistory.length === 1), '卸载保留节点历史')
    check(errors.length === 0, `没有页面错误：${errors.join('; ')}`)
    console.log(`生成历史回归通过：${checked}项（节点 JSON 和隔离浏览器；没有真实 API 调用）`)
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
