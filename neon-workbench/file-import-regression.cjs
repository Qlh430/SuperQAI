const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const JSZip = require('jszip')
function pdfFixture() {
  const chinese = Buffer.from('雪景提示词', 'utf16le'); chinese.swap16();
  const stream = `BT /F1 12 Tf 50 700 Td (PDF prompt) Tj ET\nBT /F2 12 Tf 50 675 Td <${chinese.toString('hex')}> Tj ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 6 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [7 0 R] >>',
    '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /FontDescriptor 8 0 R /DW 1000 >>',
    '<< /Type /FontDescriptor /FontName /STSong-Light /Flags 6 /FontBBox [-25 -254 1000 880] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 880 /StemV 80 >>'];
  let text = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((body, i) => { offsets.push(Buffer.byteLength(text)); text += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(text); text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => text += `${String(offset).padStart(10, '0')} 00000 n \n`);
  text += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(text).toString('base64');
}
;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } })
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    const errors = []; page.on('pageerror', e => errors.push(e.message))
    const out = path.join(__dirname, 'acceptance/file-import'); fs.mkdirSync(out, { recursive: true })
    await page.route('**/api/**', r => r.fulfill({ json: { authenticated: false, models: [], providers: [], boards: [], projects: [], resources: [], preferences: {}, settings: {} } }))
    if (process.env.GENERATOR_SOURCE) {
      for (const name of ['script.js', 'flora-node-shell.js', 'flora-node-shell.css', 'canvas-text-node-renderer.js', 'flora-text-tools.js', 'canvas-file-import.js']) await page.route(`**/${name}*`, r => {
        const file = path.join(process.env.GENERATOR_SOURCE, name === 'script.js' ? 'script-before-save-bridge.js' : name)
        return fs.existsSync(file) ? r.fulfill({ contentType: name.endsWith('.css') ? 'text/css' : 'application/javascript', body: fs.readFileSync(file, 'utf8') }) : r.continue()
      })
      await page.route('http://127.0.0.1:3199/', async r => {
        let html = await (await r.fetch()).text()
        if (!html.includes('flora-text-tools.js')) html = html.replace('<script src="./flora-node-shell.js', '<script src="./flora-text-tools.js"></script><script src="./canvas-file-import.js"></script><script src="./flora-node-shell.js')
        await r.fulfill({ contentType: 'text/html', body: html })
      })
    }
    await page.goto('http://127.0.0.1:3199/', { waitUntil: 'domcontentloaded' })
    await page.evaluate(async () => {
      await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-text', 'canvas-node-media', 'canvas-node-asset-collection'])
      await loadCanvasBoards(); canvasState.activeBoardId = 'qa-text-tools'
      const surface = document.createElement('div'); surface.id = 'neonEngineSurface'; surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#080a0e'
      const view = document.querySelector('#canvasView'); surface.append(view); document.body.append(surface)
      view.hidden = false; view.classList.add('active'); view.style.cssText = 'flex:1;min-height:0;width:100%'
      document.querySelector('#canvasEditorScreen').hidden = false; document.body.classList.add('canvas-surface-open'); showCanvasEditor()
      window.qaText = addCanvasText({ x: 100, y: 80 }, { text: '# 场景提示\n\n**雪景**与*蓝调*\n\n- 松树\n- 月光', name: '雪景提示', focus: false })
      canvasState.x = 360; canvasState.y = 80; canvasState.scale = 1; applyCanvasTransformNow(); selectCanvasNode(qaText)
    })

    const zip = new JSZip()
    zip.file('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
    zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>DOCX 中文提示词</w:t></w:r></w:p><w:p><w:r><w:t>第二段正文</w:t></w:r></w:p></w:body></w:document>')
    const docs = [
      { name: '说明.txt', type: '', data: Buffer.from('纯文本 **不作为粗体**').toString('base64') },
      { name: '提示.md', type: 'text/markdown', data: Buffer.from('# 雪景标题\n\n**蓝调**与*月光*').toString('base64') },
      { name: '正文.docx', type: '', data: await zip.generateAsync({ type: 'base64' }) },
      { name: '雪景.pdf', type: 'application/pdf', data: pdfFixture() },
    ]
    if (process.env.GENERATOR_SOURCE) {
      await page.route('**/canvas-document-reader.js*', r => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(__dirname, 'dist/canvas-document-reader.js'), 'utf8') }))
      await page.route('**/canvas-pdf-worker.js*', r => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(__dirname, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'), 'utf8') }))
      for (const [url, directory] of [['canvas-pdf-cmaps', 'cmaps'], ['canvas-pdf-fonts', 'standard_fonts']]) await page.route('**/' + url + '/**', r => r.fulfill({ body: fs.readFileSync(path.join(__dirname, 'node_modules/pdfjs-dist', directory, new URL(r.request().url()).pathname.split('/').at(-1))) }))
    }
    async function transfer(files, type = 'drop') {
      const before = await page.locator('#canvasPlane > .canvas-node').count()
      await page.evaluate(({ files, type }) => {
        const transfer = new DataTransfer()
        for (const item of files) transfer.items.add(new File([Uint8Array.from(atob(item.data), x => x.charCodeAt(0))], item.name, { type: item.type }))
        const event = type === 'drop' ? new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: 160, clientY: 250 }) : new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer })
        document.querySelector('#infiniteCanvas').dispatchEvent(event)
      }, { files, type })
      await page.waitForFunction(n => document.querySelectorAll('#canvasPlane > .canvas-node').length >= n, before + files.length)
      await page.waitForFunction(() => ![...document.querySelectorAll('.canvas-node')].some(n => /正在读取文档|正在上传素材|上传中/.test(n.querySelector('.flora-node-live-status, .canvas-node-footer-status')?.textContent || n.textContent)))
    }
    await transfer(docs)
    for (const [name, value] of [['说明.txt', '纯文本 **不作为粗体**'], ['提示.md', '雪景标题'], ['正文.docx', 'DOCX 中文提示词'], ['雪景.pdf', '雪景提示词']]) {
      const item = page.locator('.canvas-node-text').filter({ has: page.locator('.flora-node-label-title', { hasText: name }) })
      assert.equal(await item.count(), 1, '每个文档独立文字节点')
      assert.ok((await item.locator('.canvas-text').textContent()).includes(value), name + ' 提取真实正文')
      assert.ok((await item.evaluate(el => serializeCanvasNode(el))).text.length > 0)
    }
    assert.equal(await page.locator('.canvas-node-text').filter({ has: page.locator('.flora-node-label-title', { hasText: '说明.txt' }) }).locator('.canvas-text strong').count(), 0)
    assert.equal(await page.locator('.canvas-node-text').filter({ has: page.locator('.flora-node-label-title', { hasText: '提示.md' }) }).locator('.canvas-text h1').count(), 1)
    await transfer([{ ...docs[0], name: '粘贴文档.txt' }], 'paste')
    assert.equal(await page.locator('.flora-node-label-title', { hasText: '粘贴文档.txt' }).count(), 1)
    await page.route('**/api/upload-image', r => r.fulfill({ json: { url: '/output/qa-import-landscape.png' } }))
    await page.route('**/api/upload-media', r => r.fulfill({ json: { url: /wav/.test(decodeURIComponent(r.request().headers()['x-file-name'] || '')) ? '/output/qa-import.wav' : '/output/qa-import.webm', mimeType: r.request().headers()['content-type'] } }))
    await page.route('**/output/qa-import-landscape.png*', r => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024"><rect width="100%" height="100%" fill="#4a7594"/></svg>' }))
    // A real short recording exercises metadata, picture preview and audio playback.
    const media = await page.evaluate(async () => {
      const audio = new AudioContext(); const oscillator = audio.createOscillator(); const destination = audio.createMediaStreamDestination(); oscillator.connect(destination); oscillator.start()
      const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 360
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#4a7594'; ctx.fillRect(0, 0, 240, 360)
      const stream = canvas.captureStream(10); stream.addTrack(destination.stream.getAudioTracks()[0])
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' }); const chunks = []
      const complete = new Promise(resolve => { recorder.ondataavailable = e => chunks.push(e.data); recorder.onstop = async () => { const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer()); resolve(btoa(String.fromCharCode(...bytes))) } })
      recorder.start(); await new Promise(r => setTimeout(r, 450)); recorder.stop(); const data = await complete
      stream.getTracks().forEach(track => track.stop()); oscillator.stop(); await audio.close(); return data
    })
    await page.route('**/output/qa-import.webm*', r => r.fulfill({ contentType: 'video/webm', body: Buffer.from(media, 'base64') }))
    const wav = Buffer.alloc(44 + 16000); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(16000, 40)
    await page.route('**/output/qa-import.wav*', r => r.fulfill({ contentType: 'audio/wav', body: wav }))
    const mixed = [{ name: '横图.png', type: '', data: docs[0].data }, { name: '竖视频.webm', type: '', data: media }, { name: '音轨.wav', type: '', data: wav.toString('base64') }]
    await transfer(mixed, 'paste')
    await page.waitForFunction(() => [...document.querySelectorAll('.canvas-node-asset-single-video video')].some(v => v.videoHeight === 360))
    assert.equal(await page.locator('.canvas-node-asset-single-image').count(), 1)
    assert.equal(await page.locator('.canvas-node-asset-single-video').count(), 1)
    assert.equal(await page.locator('.canvas-node-asset-single-audio').count(), 1)
    const placed = await page.evaluate(() => [...document.querySelectorAll('.canvas-node-asset-single-image, .canvas-node-asset-single-video, .canvas-node-asset-single-audio')].map(node => ({ x: Number(node.dataset.x), width: Number(node.dataset.width) })))
    assert.ok(placed[1].x >= placed[0].x + placed[0].width + 72, '真实横图尺寸确定后再排列视频，避免重叠')
    assert.ok(placed[2].x >= placed[1].x + placed[1].width + 72, '视频与音频保持节点间距')
    await page.waitForFunction(() => [...document.querySelectorAll('.canvas-node-asset-single-audio audio')].some(a => a.duration > 0))
    for (const selector of ['.canvas-node-asset-single-image', '.canvas-node-asset-single-video']) {
      const item = page.locator(selector); await item.evaluate(el => selectCanvasNode(el)); await page.waitForTimeout(70)
      const frame = item.locator(':scope > .flora-node-shell')
      assert.equal(await frame.evaluate(el => getComputedStyle(el, '::after').opacity), '1', '选中媒体有顶部描边层')
      assert.equal(await frame.evaluate(el => getComputedStyle(el, '::after').pointerEvents), 'none')
      await page.evaluate(() => clearCanvasSelection()); await page.waitForTimeout(50)
      assert.equal(await frame.evaluate(el => getComputedStyle(el, '::after').opacity), '0', '取消选中隐藏描边')
    }
    const failures = [{ name: '损坏.docx', type: '', data: Buffer.from('bad docx').toString('base64') }, { name: '损坏.pdf', type: '', data: Buffer.from('bad pdf').toString('base64') }, { ...docs[0], name: '失败后仍导入.txt' }]
    await transfer(failures)
    assert.ok((await page.locator('.canvas-node-text').filter({ has: page.locator('.flora-node-label-title', { hasText: '损坏.docx' }) }).textContent()).includes('解析失败'))
    assert.ok((await page.locator('.canvas-node-text').filter({ has: page.locator('.flora-node-label-title', { hasText: '损坏.pdf' }) }).textContent()).includes('PDF 解析失败'))
    assert.equal(await page.locator('.flora-node-label-title', { hasText: '失败后仍导入.txt' }).count(), 1)
    const total = await page.locator('#canvasPlane > .canvas-node').count()
    await page.evaluate(() => { const text = qaText.querySelector('.canvas-text'); CanvasTextNodeRenderer.beginEdit(text); text.focus() })
    await page.evaluate(() => { const d = new DataTransfer(); d.items.add(new File(['编辑中'], '不新建.txt', { type: 'text/plain' })); qaText.querySelector('.canvas-text').dispatchEvent(new ClipboardEvent('paste', { clipboardData: d, bubbles: true, cancelable: true })) })
    assert.equal(await page.locator('#canvasPlane > .canvas-node').count(), total, '编辑区不抢文件粘贴')
    await page.evaluate(() => { CanvasTextNodeRenderer.commitEdit(qaText); qaText.dataset.textBackground = 'cyan'; document.activeElement?.blur(); selectCanvasNode(qaText); copySelectedCanvasNodes({ preventDefault() {} }) })
    await page.waitForFunction(async () => await navigator.clipboard.readText() === canvasState.clipboardNativeToken)
    await page.keyboard.press('Control+v'); await page.waitForTimeout(250)
    assert.equal(await page.locator('#canvasPlane > .canvas-node').count(), total + 1, '内部节点复制仍支持 Ctrl+V')
    assert.equal(await page.evaluate(() => serializeCanvasNode(getSelectedCanvasNodes()[0]).textBackground), 'cyan', '内部复制保留背景色')
    await page.evaluate(async () => { await navigator.clipboard.writeText('外部复制的文字') })
    await page.keyboard.press('Control+v'); await page.waitForTimeout(250)
    assert.equal(await page.locator('#canvasPlane > .canvas-node').count(), total + 2, '外部剪贴板替换旧内部复制内容')
    const isolated = await page.evaluate(async () => {
      let release; const file = new File(['旧画布正文'], '切换画布.txt'); file.arrayBuffer = () => new Promise(resolve => { release = resolve });
      const pending = CanvasFileImport.importFiles([file], { x: 200, y: 200 });
      while (!release) await new Promise(resolve => setTimeout(resolve, 10));
      canvasState.externalClipboardEpoch = (canvasState.externalClipboardEpoch || 0) + 1;
      release(new TextEncoder().encode('旧画布正文').buffer); const nodes = await pending;
      const value = CanvasTextNodeRenderer.getValue(nodes[0]); nodes[0].remove(); return value;
    })
    assert.equal(isolated, '', '切换画布时旧文件解析结果不再写入')
    for (const width of [390, 768, 1440, 1728]) {
      await page.setViewportSize({ width, height: 1050 })
      for (const selector of ['.canvas-node-asset-single-image', '.canvas-node-asset-single-video']) {
        await page.locator(selector).evaluate(el => { clearCanvasSelection(); canvasState.scale = .65; canvasState.x = 40 - Number(el.dataset.x) * .65; canvasState.y = 160 - Number(el.dataset.y) * .65; applyCanvasTransformNow(); selectCanvasNode(el) })
        await page.waitForTimeout(100)
        await page.screenshot({ path: path.join(out, `${width}-${selector.endsWith('image') ? 'image' : 'video'}-selected.png`) })
      }
    }
    await page.screenshot({ path: path.join(out, 'mixed-files.png') })
    assert.deepEqual(errors, []); console.log(JSON.stringify({ ok: true, documentTypes: ['TXT', 'MD', 'DOCX', 'PDF'], chinesePdf: true, media: ['image', 'video', 'audio'], errors }))
  } finally { await browser.close() }
})().catch(e => { console.error(e); process.exitCode = 1 })
