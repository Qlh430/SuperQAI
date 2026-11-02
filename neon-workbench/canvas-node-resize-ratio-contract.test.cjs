const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, 'design-sources', 'script-before-save-bridge.js'), 'utf8');
const shell = fs.readFileSync(path.join(__dirname, 'design-sources', 'flora-node-shell.js'), 'utf8');

assert.match(source, /function getCanvasAdaptiveMediaRatio\(node\)/,
  '自适应媒体节点必须有统一的原始媒体比例读取函数');
assert.match(source, /function getCanvasAdaptiveMediaRatio\(node\)[\s\S]*?floraImagePreview[\s\S]*?canvas-node-result/,
  'API 和 ComfyUI 图片生成节点都必须读取媒体比例');
assert.match(source, /function beginCanvasNodeResize\([\s\S]*?getCanvasAdaptiveMediaRatio\(node\)/,
  '节点缩放开始时必须读取图片或视频原始比例');
assert.match(source, /function beginCanvasNodeResize\([\s\S]*?adaptiveMediaRatio[\s\S]*?const imageBounds =/,
  '带标题的自适应媒体也必须进入等比缩放分支');
assert.match(source, /function beginCanvasNodeResize\([\s\S]*?const ratio = adaptiveMediaRatio \|\| start\.width \/ start\.height/,
  '自适应媒体缩放比例必须优先使用原始媒体比例');
assert.match(source, /function applyCanvasAdaptiveMediaSize\([\s\S]*?node\.dataset\.floraMediaRatio = `\$\{sourceWidth\}:\$\{sourceHeight\}`/,
  '应用尺寸时必须记录媒体原始比例，供后续缩放使用');
assert.match(source, /function applyCanvasAdaptiveMediaSize\([\s\S]*?const sourceRatio = sourceWidth \/ sourceHeight[\s\S]*?const nextHeight = manual\s*\n?\s*\?\s*Math\.round\(nextWidth \/ sourceRatio\)/,
  '已保存的手动图片尺寸也必须按原始媒体比例校正高度');
assert.match(shell, /function syncImagePreviewDimensions\([\s\S]*?node\.dataset\.mediaSizeMode === "manual"[\s\S]*?width \/ ratio/,
  '图片生成节点的已保存手动高度也必须按预览比例校正');
assert.match(shell, /function syncImagePreviewDimensions\(node, preferSelection = false\)[\s\S]*?canvas-node-comfy[\s\S]*?flora-node-result-area/,
  'ComfyUI 图片生成节点也必须进入预览比例同步');

console.log('canvas-node-resize-ratio-contract: ok');
