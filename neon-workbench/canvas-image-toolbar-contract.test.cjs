const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const sources = path.join(__dirname, 'design-sources')
const shell = fs.readFileSync(path.join(sources, 'flora-node-shell.js'), 'utf8')
const shellCss = fs.readFileSync(path.join(sources, 'flora-node-shell.css'), 'utf8')
const bridge = fs.readFileSync(path.join(sources, 'script-before-save-bridge.js'), 'utf8')
const outpaintTool = fs.readFileSync(path.join(sources, 'canvas-features/tool-outpaint.js'), 'utf8')

assert.match(shell, /\["upscale", "超清"[\s\S]*\["cutout", "抠图"[\s\S]*\["crop", "裁剪"[\s\S]*\["outpaint", "扩图"[\s\S]*\["angle", "换角度"/)
assert.match(shell, /button\.addEventListener\("click", \(event\) => \{\s*event\.stopPropagation\(\);\s*dispatchMediaAction\(node, kind, action\);/)
assert.match(bridge, /\["cutout", "crop", "outpaint", "angle", "upscale"\]\.includes\(action\)/)
const outpaintStart = bridge.indexOf('async function openCanvasInlineOutpaint(node)')
const outpaintEnd = bridge.indexOf('function ensureCanvasInlineOutpaintVisible', outpaintStart)
const outpaintImplementation = bridge.slice(outpaintStart, outpaintEnd)
assert.match(outpaintImplementation, /node\.dataset\.inlineTool = "outpaint"/)
assert.match(outpaintImplementation, /canvas-inline-outpaint-bar/)
assert.match(outpaintTool, /open: \(\{ node \}\) => root\.openCanvasInlineOutpaint\(node\)/)

const outpaintComposerRule = shellCss.match(/#canvasEditorScreen \.canvas-node:is\(([^)]*)\) \.flora-generator-composer\s*\{\s*display:\s*none !important;/s)?.[1] || ''
assert.match(outpaintComposerRule, /\[data-inline-tool="outpaint"\]/, '扩图交互期间必须隐藏通用生成操作区，保留扩图自己的执行栏')

console.log('image toolbar and outpaint operation visibility contracts passed')
