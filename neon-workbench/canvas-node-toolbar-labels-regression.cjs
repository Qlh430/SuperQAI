// 节点工具栏回归：每个动作都要有「图标 + 中文短标签」，图标两两可分辨；
// 窄窗口（平板/手机宽度）退回图标 + 悬停提示，标题与 aria-label 里仍带中文说明。
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const LUCIDE = 'Q:\\音乐\\Documents\\AI-OS-Portable-1.0.5-win-x64\\AI-OS-Portable-1.0.5-win-x64\\.ai-runtime\\versions\\1.0.5-win-x64\\resources\\app\\assets\\vendor\\lucide.min.js'
const RUNTIME = 'Q:\\音乐\\Documents\\AI-OS-Portable-1.0.5-win-x64\\AI-OS-Portable-1.0.5-win-x64\\.ai-runtime\\versions\\1.0.5-win-x64\\resources\\app'
const SOURCE_ROOT = process.env.TOOLBAR_USE_DEPLOYED === '1' ? RUNTIME : path.join(__dirname, 'design-sources')
const FILES = { js: 'flora-node-shell.js', css: 'flora-node-shell.css' }
const IMAGE = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"><rect width="480" height="320" fill="#f2f0ec"/><circle cx="240" cy="160" r="96" fill="#e0b400"/></svg>')

const CASES = [
  {
    name: 'asset-image',
    className: 'canvas-node-asset-collection canvas-node-asset-single-image',
    width: 711,
    height: 400,
    kind: 'upload',
    datasetKey: 'imageSrc',
    content: `<div class="canvas-image-upload"><img data-canvas-original-src="${IMAGE}" src="${IMAGE}" alt="横版素材"></div>`,
    // 有图时上传入口收起，其余九个动作都在。
    expected: ['预览', '超清', '抠图', '裁剪', '扩图', '换角度', '下载', '替换', '删除'],
    expectedIcons: {
      预览: 'lucide-maximize',
      超清: 'lucide-sparkles',
      抠图: 'lucide-lasso',
      裁剪: 'lucide-crop',
      扩图: 'lucide-expand',
      换角度: 'lucide-rotate-3d',
      下载: 'lucide-download',
      替换: 'lucide-replace',
      删除: 'lucide-trash-2',
    },
  },
  {
    name: 'asset-empty',
    className: 'canvas-node-asset-collection canvas-node-asset-single-image',
    width: 711,
    height: 400,
    kind: 'upload',
    datasetKey: '',
    content: '<div class="canvas-image-upload"></div>',
    expected: ['删除', '上传'],
    expectedIcons: { 删除: 'lucide-trash-2', 上传: 'lucide-upload' },
  },
  {
    name: 'generator',
    className: 'canvas-node-image canvas-node-generator',
    width: 400,
    height: 400,
    kind: 'generator',
    datasetKey: 'resultSrc',
    content: `<div class="flora-node-result-area"><img src="${IMAGE}" alt="生成结果"></div><textarea class="canvas-node-prompt"></textarea>`,
    expected: ['预览', '下载', '超清', '抠图', '裁剪', '扩图', '换角度', '删除'],
    expectedIcons: {
      预览: 'lucide-maximize',
      下载: 'lucide-download',
      超清: 'lucide-sparkles',
      抠图: 'lucide-lasso',
      裁剪: 'lucide-crop',
      扩图: 'lucide-expand',
      换角度: 'lucide-rotate-3d',
      删除: 'lucide-trash-2',
    },
  },
]

;(async () => {
  const css = fs.readFileSync(path.join(SOURCE_ROOT, FILES.css), 'utf8')
  const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(EDGE) ? EDGE : undefined })
  const report = []
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 720 } })
      try {
        for (const sample of CASES) {
          const sidePad = Math.max(24, Math.round((width - sample.width) / 2))
          await page.setContent(`<style>body{margin:0;background:#0c0c0b}#canvasPlane{position:relative;transform-origin:0 0}</style><style>${css}</style><div id="neonEngineSurface"><div id="canvasEditorScreen"><div id="canvasPlane" style="padding:220px ${sidePad}px 24px;width:max-content"><article class="canvas-node ${sample.className}"><div class="canvas-node-bar"><span class="canvas-node-title">${sample.name}</span></div>${sample.content}</article></div></div></div>`)
          await page.addScriptTag({ path: path.join(SOURCE_ROOT, 'node-action-bar.js') })
          await page.addScriptTag({ path: path.join(SOURCE_ROOT, 'flora-generator-composer.js') })
          await page.addScriptTag({ path: path.join(SOURCE_ROOT, FILES.js) })
          if (fs.existsSync(LUCIDE)) await page.addScriptTag({ path: LUCIDE })
          const info = await page.evaluate((sample) => {
            const node = document.querySelector('article')
            node.dataset.floraKind = sample.kind
            if (sample.datasetKey) node.dataset[sample.datasetKey] = 'test.png'
            window.CanvasFloraNodeShell.mount(node)
            node.style.setProperty('--flora-node-width', `${sample.width}px`)
            node.style.setProperty('--flora-node-height', `${sample.height}px`)
            node.classList.add('is-selected')
            window.CanvasFloraNodeShell.refresh(node)
            const toolbar = node.querySelector('.flora-node-toolbar')
            const buttons = Array.from(toolbar.querySelectorAll('[data-flora-action]')).filter((button) => !button.hidden)
            return {
              toolbarHeight: Math.round(toolbar.getBoundingClientRect().height),
              toolbarWidth: Math.round(toolbar.getBoundingClientRect().width),
              actions: buttons.map((button) => {
                const caption = button.querySelector('.flora-node-action-caption')
                const glyph = button.querySelector('svg')
                return {
                  action: button.dataset.floraAction,
                  label: (caption?.textContent || '').trim(),
                  captionShown: Boolean(caption) && getComputedStyle(caption).display !== 'none',
                  icon: (glyph?.getAttribute('class') || '').split(/\s+/).find((name) => name.startsWith('lucide-') && name !== 'lucide') || '',
                  title: button.title || '',
                  aria: button.getAttribute('aria-label') || '',
                  width: Math.round(button.getBoundingClientRect().width),
                }
              }),
            }
          }, sample)
          const labels = info.actions.map((action) => action.label)
          assert.deepEqual(labels, sample.expected, `${sample.name}@${width} 动作标签：${JSON.stringify(labels)}`)
          const icons = info.actions.map((action) => action.icon).filter(Boolean)
          assert.equal(new Set(icons).size, icons.length, `${sample.name}@${width} 图标不应重复：${icons.join(', ')}`)
          info.actions.forEach((action) => {
            const expectedIcon = sample.expectedIcons?.[action.label]
            if (expectedIcon) {
              assert.equal(action.icon, expectedIcon, `${sample.name}@${width} 「${action.label}」的图标应为 ${expectedIcon}，实际 ${action.icon}`)
            }
          })
          assert.equal(info.toolbarHeight, 44, `${sample.name}@${width} 工具栏高度应为 44，实际 ${info.toolbarHeight}`)
          if (width >= 1024) {
            info.actions.forEach((action) => {
              assert.equal(action.captionShown, true, `${sample.name}@${width} ${action.action} 应显示中文标签`)
              assert.ok(action.width > 32, `${sample.name}@${width} ${action.action} 应比纯图标按钮宽，实际 ${action.width}`)
            })
          } else {
            info.actions.forEach((action) => {
              assert.equal(action.captionShown, false, `${sample.name}@${width} ${action.action} 窄窗口应退回图标`)
              assert.ok(action.title.length > 0, `${sample.name}@${width} ${action.action} 应保留中文提示`)
              assert.ok(action.aria.length > 0, `${sample.name}@${width} ${action.action} 应保留 aria-label`)
            })
          }
          report.push({ width, case: sample.name, toolbar: `${info.toolbarWidth}x${info.toolbarHeight}`, labels, icons })
        }
      } finally {
        await page.close()
      }
    }
    console.log(JSON.stringify({ ok: true, source: SOURCE_ROOT.includes('resources') ? 'deployed' : 'design-sources', report }, null, 2))
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error.message || error); process.exit(1) })
