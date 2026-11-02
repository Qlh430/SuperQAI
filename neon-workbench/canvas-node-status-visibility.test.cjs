const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, 'design-sources/neon-canvas-surface.css'), 'utf8');
assert.match(css, /#canvasEditorScreen[\s\S]*#canvasPlane[\s\S]*\.flora-node-live-status[\s\S]*display:\s*none\s*!important/,
  '节点壳体状态文案必须统一隐藏');
for (const selector of ['.canvas-node-status', '.canvas-h3-status', '.canvas-api-video-status', '.canvas-llm-status', '.canvas-audio-generator-status', '.canvas-comfy-status']) {
  assert.match(css, new RegExp(`\\${selector}[^}]*display:\\s*none\\s*!important`), `${selector} 必须隐藏`);
}
console.log('PASS: node status labels stay hidden while runtime status data remains available');
