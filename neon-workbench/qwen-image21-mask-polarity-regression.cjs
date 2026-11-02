const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

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

function createCanvasDocument() {
  return {
    createElement(tagName) {
      assert.equal(tagName, 'canvas')
      const canvas = { width: 0, height: 0, pixels: null }
      canvas.getContext = () => ({
        drawImage(image) { canvas.pixels = new Uint8ClampedArray(image.pixels) },
        getImageData() { return { data: new Uint8ClampedArray(canvas.pixels) } },
        createImageData(width, height) { return { data: new Uint8ClampedArray(width * height * 4) } },
        putImageData(imageData) { canvas.pixels = new Uint8ClampedArray(imageData.data) },
      })
      canvas.toDataURL = () => `data:image/png;base64,${Buffer.from(JSON.stringify([...canvas.pixels])).toString('base64')}`
      return canvas
    },
  }
}

async function run() {
  // One fully painted pixel followed by one transparent, unpainted pixel.
  const inputMask = { width: 2, height: 1, pixels: [255, 255, 255, 255, 255, 255, 255, 0] }
  const context = { document: createCanvasDocument(), loadImageElement: async () => inputMask }
  vm.createContext(context)
  vm.runInContext(`${extractFunction('createFlux2ComfyMaskDataUrl')}; this.convertMask = createFlux2ComfyMaskDataUrl`, context)
  const converted = await context.convertMask('/saved/edit-mask.png')
  const rgba = JSON.parse(Buffer.from(converted.split(',')[1], 'base64').toString('utf8'))
  assert.deepEqual(rgba, [255, 255, 255, 0, 255, 255, 255, 255], '送入 ComfyUI 的遮罩应将涂抹区域转成透明，将未涂抹区域转成不透明')

  const editor = extractFunction('openCanvasMaskEditor')
  const redrawSubmit = editor.slice(editor.indexOf('redrawSubmit?.addEventListener'), editor.indexOf('modal.querySelector(".canvas-mask-save")'))
  assert.match(redrawSubmit, /node\.dataset\.maskSrc\s*=\s*maskUrl/, '画布应继续保存可重新编辑的原始遮罩')
  assert.match(redrawSubmit, /createFlux2ComfyMaskDataUrl\(maskUrl\)/, '提交工作流前应转换遮罩透明度')
  assert.match(redrawSubmit, /onSubmit\?\.\(\{\s*maskUrl:\s*comfyMaskUrl/, 'Qwen 工作流必须收到转换后的遮罩')

  console.log(JSON.stringify({ ok: true, paintedPixelAlpha: rgba[3], unpaintedPixelAlpha: rgba[7], editableMaskPreserved: true }, null, 2))
}

run().catch(error => { console.error(error); process.exit(1) })
