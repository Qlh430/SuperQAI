const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } })
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    const output = path.join(__dirname, 'acceptance/text-reference-materials'); fs.mkdirSync(output, { recursive: true })
    const model = { id: 'qa-reference', modelId: 'gpt-image-2', providerId: 'qa', providerName: '测试服务商', capabilities: ['image.generate'], resolutions: ['1', '2'], state: 'online', family: 'gpt-image-2' }
    await page.route('**/api/**', r => r.fulfill({ json: { authenticated: false, models: [], providers: [], boards: [], projects: [], resources: [], records: [], settings: {}, preferences: {} } }))
    await page.route('**/api/image-models*', r => r.fulfill({ json: { models: [model] } }))
    if (process.env.GENERATOR_SOURCE) for (const name of ['script.js', 'flora-node-shell.css', 'flora-generator-composer.js']) await page.route(`**/${name}*`, r => r.fulfill({ contentType: name.endsWith('.css') ? 'text/css' : 'application/javascript', body: fs.readFileSync(path.join(process.env.GENERATOR_SOURCE, name === 'script.js' ? 'script-before-save-bridge.js' : name), 'utf8') }))
    await page.goto('http://127.0.0.1:3199', { waitUntil: 'domcontentloaded' })
    await page.evaluate(async model => {
      await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-node-comfy', 'canvas-node-video-api', 'canvas-node-text'])
      await loadCanvasBoards(); canvasState.activeBoardId = 'qa-reference'
      const surface = document.createElement('div'); surface.id = 'neonEngineSurface'; surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#080a0e'
      const view = document.querySelector('#canvasView'); surface.append(view); document.body.append(surface)
      view.hidden = false; view.classList.add('active'); view.style.cssText = 'flex:1;min-height:0;width:100%'
      document.querySelector('#canvasEditorScreen').hidden = false; document.body.classList.add('canvas-surface-open'); showCanvasEditor()
      imageModelCatalog = [model]; IMAGE_MODEL_PLATFORMS[model.id] = 'openai'; IMAGE_MODEL_FAMILIES[model.id] = 'gpt-image-2'
      imageModelInput.innerHTML = '<option value="qa-reference">测试图片模型</option>'; imageModelInput.value = model.id
      window.qaNode = addCanvasImageGeneratorNode({ x: 100, y: 60 }, { focus: false })
      window.qaSource = addCanvasText({ x: -400, y: 60 }, { text: '雪景正文\n\n负面提示词：人物、动物\n' + '完整正文'.repeat(500), name: '雪景提示', focus: false })
      const prompt = qaNode.querySelector('.canvas-node-prompt'); prompt.value = '增加营地'; prompt.dispatchEvent(new Event('input', { bubbles: true }))
      connectCanvasNodes(qaSource.dataset.id, qaNode.dataset.id)
      canvasState.x = 360; canvasState.y = 0; canvasState.scale = 1; applyCanvasTransformNow(); selectCanvasNode(qaNode)
    }, model)
    const node = page.locator('.canvas-node-image').filter({ has: page.locator('.flora-generator-composer') }).first()
    const panel = node.locator('.flora-generator-composer'), prompt = panel.locator('.canvas-node-prompt')
    assert.equal(await prompt.inputValue(), '增加营地', '连接文字不覆盖手动输入')
    assert.equal(await prompt.evaluate(el => el.readOnly), false, '手动要求仍可编辑')
    const card = panel.locator('.flora-text-reference')
    assert.equal(await card.count(), 1, '文字显示为素材')
    assert.equal(await card.textContent(), '', '卡片不占用名称与正文空间')
    assert.ok((await card.getAttribute('title')).includes('雪景提示'))
    assert.ok((await card.getAttribute('title')).includes('雪景正文'))
    await page.evaluate(() => { window.qaSourceId = qaSource.dataset.id; unmountCanvasVirtualNode(qaSourceId, qaSource); updateCanvasNodeRefs(qaNode) })
    assert.equal(await panel.locator('.flora-text-reference').count(), 1, '来源节点暂未挂载时仍显示文字素材')
    await page.evaluate(() => { window.qaSource = mountCanvasVirtualNode(qaSourceId); updateCanvasNodeRefs(qaNode) })
    await prompt.focus(); assert.equal(await prompt.evaluate(el => getComputedStyle(el).outlineStyle), 'none')
    assert.equal(await prompt.evaluate(el => getComputedStyle(el).boxShadow), 'none')
    await page.evaluate(() => {
      window.qaImage = addCanvasImage('data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="gray"/></svg>'), '参考图', { x: -400, y: 500 })
      connectCanvasNodes(qaImage.dataset.id, qaNode.dataset.id)
    })
    await page.waitForTimeout(100)
    const image = panel.locator('.canvas-ref-thumb:not(.flora-text-reference)')
    const a = await card.boundingBox(), b = await image.boundingBox(), last = await panel.locator('.flora-reference-thumb').last().boundingBox(), plus = await panel.locator('.flora-generator-add-reference').boundingBox()
    assert.equal(a.width, b.width); assert.equal(a.height, b.height)
    assert.ok(plus.x >= last.x + last.width && Math.abs(plus.y + plus.height / 2 - last.y - last.height / 2) < 2, '加号紧跟最后素材')
    assert.ok(plus.x - last.x - last.width <= 12, '没有被素材容器弹性空白推到远处')
    const request = []
    await page.route('**/api/image-jobs', async r => { request.push(r.request().postDataJSON()); await r.fulfill({ status: 400, json: { error: '模拟终止，未执行真实生成' } }) })
    await page.evaluate(async () => { setCanvasTextValue(qaSource, getCanvasTextValue(qaSource) + '\n最后一段新修改'); refreshCanvasConnectedNodes(qaSource.dataset.id); await runCanvasImageEdit(qaNode) })
    assert.equal(request.length, 1)
    assert.ok(request[0].prompt.includes('最后一段新修改')); assert.ok(request[0].prompt.includes('增加营地'))
    assert.equal((request[0].prompt.match(/雪景正文/g) || []).length, 1, '完整引用正文只提交一次')
    assert.ok(request[0].prompt.length > 2000, '正文没有按预览截断')
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('flora-node-rename', { detail: { node: qaSource, title: '更新后的雪景提示' } })))
    assert.ok((await card.getAttribute('title')).includes('更新后的雪景提示'), '素材提示同步来源重命名')
    await page.evaluate(() => disconnectCanvasNodes(qaSource.dataset.id, qaNode.dataset.id))
    assert.equal(await card.count(), 0); assert.equal(await prompt.inputValue(), '增加营地')
    await page.evaluate(() => connectCanvasNodes(qaSource.dataset.id, qaNode.dataset.id))
    await page.evaluate(() => {
      window.qaSecond = addCanvasText({ x: -800, y: 60 }, { text: '第二份素材正文', name: '第二份说明', focus: false }); connectCanvasNodes(qaSecond.dataset.id, qaNode.dataset.id)
    })
    assert.equal(await card.count(), 2); assert.equal(await prompt.inputValue(), '增加营地')
    await page.evaluate(async () => { await runCanvasImageEdit(qaNode) })
    assert.equal(request.length, 2); assert.ok(request[1].prompt.includes('第二份素材正文'))
    assert.equal((request[1].prompt.match(/增加营地/g) || []).length, 1)
    await page.evaluate(() => {
      const saved = serializeCanvasNode(qaNode); window.qaRestored = restoreCanvasBoardNode({ ...saved, id: 'qa-material-restored' }, {}, { maxId: 0 });
      connectCanvasNodes(qaSource.dataset.id, qaRestored.dataset.id); connectCanvasNodes(qaImage.dataset.id, qaRestored.dataset.id); updateCanvasNodeRefs(qaRestored)
    })
    const restored = page.locator('[data-id="qa-material-restored"]')
    assert.equal(await restored.locator('.flora-text-reference').count(), 1)
    assert.equal(await restored.locator('.canvas-node-prompt').inputValue(), '增加营地', '恢复后引用不覆盖草稿')
    await page.evaluate(() => { unmountCanvasVirtualNode(qaRestored.dataset.id, qaRestored); selectCanvasNode(qaNode) })
    for (const width of [390, 768, 1440, 1728]) {
      await page.setViewportSize({ width, height: 1050 })
      await page.evaluate(width => { canvasState.x = width / 2 - 300; canvasState.y = 0; applyCanvasTransformNow(); selectCanvasNode(qaNode) }, width)
      await prompt.focus(); await page.screenshot({ path: path.join(output, `${width}-ordinary.png`) })
      await panel.getByRole('button', { name: '放大操作区', exact: true }).click()
      await prompt.focus(); assert.equal(await prompt.evaluate(el => getComputedStyle(el).outlineStyle), 'none')
      const dialog = node.locator('.flora-generator-expanded-dialog'); const box = await dialog.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width + 1)
      await page.screenshot({ path: path.join(output, `${width}-expanded.png`) })
      await page.keyboard.press('Escape')
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    }
    const shared = await page.evaluate(async () => {
      await AiOsModuleLoader.ensure(['canvas-node-minimax-h3', 'canvas-node-llm']);
      const results = [];
      for (const create of [addCanvasText, addCanvasLlmNode, addCanvasApiVideoNode, addCanvasMinimaxH3Node, addCanvasAudioGeneratorNode]) {
        const target = create({ x: 1200, y: 60 }, { focus: false });
        const field = target.querySelector('.canvas-llm-prompt, .canvas-api-video-prompt-input, .canvas-h3-prompt, .canvas-audio-generator-prompt');
        field.value = '本次额外要求'; field.dispatchEvent(new Event('input', { bubbles: true })); connectCanvasNodes(qaSource.dataset.id, target.dataset.id); updateCanvasNodeRefs(target);
        results.push({ kind: target.dataset.floraKind, cards: target.querySelectorAll('.flora-text-reference').length, draft: field.value, readOnly: field.readOnly, combined: getCanvasGenerationPrompt(target, field.value) });
        unmountCanvasVirtualNode(target.dataset.id, target);
      }
      return results;
    })
    for (const result of shared) { assert.equal(result.cards, 1, result.kind + ' 文字素材卡片'); assert.equal(result.draft, '本次额外要求'); assert.equal(result.readOnly, false); assert.ok(result.combined.includes('最后一段新修改')); assert.ok(result.combined.includes('本次额外要求')) }
    const typed = await page.evaluate(() => {
      const target = addCanvasMinimaxH3Node({ x: 1200, y: 520 }, { focus: false });
      const video = addCanvasVideoNode({ x: 1600, y: 520 }, { src: 'data:video/mp4;base64,AAAA', name: '参考视频' });
      const audio = addCanvasAudioNode({ x: 1600, y: 760 }, { src: 'data:audio/mpeg;base64,AAAA', name: '参考音频' });
      connectCanvasNodes(qaImage.dataset.id, target.dataset.id);
      connectCanvasNodes(video.dataset.id, target.dataset.id);
      connectCanvasNodes(audio.dataset.id, target.dataset.id);
      connectCanvasNodes(qaSource.dataset.id, target.dataset.id);
      updateCanvasNodeRefs(target);
      const materials = target.querySelector('.flora-reference-materials');
      const sections = [...materials.querySelectorAll(':scope > .flora-reference-collection')].map(section => section.className.match(/is-(\w+)/)?.[1]);
      const plusCount = target.querySelectorAll('.flora-generator-add-reference').length;
      const cards = [...materials.querySelectorAll('.flora-reference-thumb')].map(card => card.getAttribute('aria-label'));
      const videoRemove = materials.querySelector('.flora-reference-card.is-video .flora-reference-remove');
      videoRemove?.click();
      updateCanvasNodeRefs(target);
      const afterVideo = [...materials.querySelectorAll(':scope > .flora-reference-collection')].map(section => section.className.match(/is-(\w+)/)?.[1]);
      return { sections, afterVideo, plusCount, cards };
    });
    assert.deepEqual(typed.sections, ['image', 'video', 'audio', 'text'], '参考区按图片、视频、音频、文本连续分区');
    assert.deepEqual(typed.afterVideo, ['image', 'audio', 'text'], '移除视频后不保留空分区');
    assert.equal(typed.plusCount, 1, '参考区始终只有一个加号');
    assert.ok(typed.cards.some(label => label?.includes('图片1')) && typed.cards.some(label => label?.includes('视频1')) && typed.cards.some(label => label?.includes('音频1')), '素材卡片显示类型序号');
    assert.deepEqual(errors, []); console.log(JSON.stringify({ ok: true, widths: [390, 768, 1440, 1728], fullText: true, errors }))
  } finally { await browser.close() }
})().catch(e => { console.error(e); process.exitCode = 1 })
