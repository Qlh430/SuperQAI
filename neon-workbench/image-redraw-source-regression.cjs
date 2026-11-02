const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const source = fs.readFileSync(path.join(__dirname, 'design-sources', 'script-before-save-bridge.js'), 'utf8')
function extractFunction(name) {
  const marker = `async function ${name}(`
  const start = source.indexOf(marker)
  assert.ok(start >= 0, `找不到 ${name}`)
  const open = source.indexOf(') {', start) + 2
  let depth = 0
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    else if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1)
  }
  throw new Error(`无法解析 ${name}`)
}
const opener = extractFunction('openCanvasMaskEditor')
;(async () => {
  const requested = []
  const statuses = []
  const node = {
    dataset: {},
    classList: { contains: value => value === 'canvas-node' },
    querySelector: () => ({ getAttribute: name => name === 'src' ? '/media/from-image-element.png' : null }),
  }
  const context = {
    resolveCanvasImageToolSource: current => {
      const image = current.querySelector('img')
      return image?.getAttribute('src') ? { url: image.getAttribute('src') } : null
    },
    loadImageElement: async url => { requested.push(url); throw new Error('stop after source resolution') },
    setCanvasStatus: value => statuses.push(value),
  }
  vm.createContext(context)
  vm.runInContext(`${opener}; this.openCanvasMaskEditor = openCanvasMaskEditor`, context)
  const opened = await context.openCanvasMaskEditor(node)
  assert.equal(opened, false)
  assert.deepEqual(requested, ['/media/from-image-element.png'], `遮罩编辑器应加载与工具栏相同的原图来源，实际请求：${JSON.stringify(requested)}`)
  console.log(JSON.stringify({ ok: true, requested, status: statuses[0] || '' }, null, 2))
})().catch(error => { console.error(error); process.exit(1) })

