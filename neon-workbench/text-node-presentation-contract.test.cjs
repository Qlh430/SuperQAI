const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sourceRoot = path.join(__dirname, 'design-sources');
const bridge = fs.readFileSync(path.join(sourceRoot, 'script-before-save-bridge.js'), 'utf8');
const renderer = fs.readFileSync(path.join(sourceRoot, 'canvas-text-node-renderer.js'), 'utf8');
const representationHost = fs.readFileSync(path.join(sourceRoot, 'canvas-representation-host.js'), 'utf8');
const flora = fs.readFileSync(path.join(sourceRoot, 'flora-node-shell.css'), 'utf8');
const canvasSurface = fs.readFileSync(path.join(sourceRoot, 'neon-canvas-surface.css'), 'utf8');
const composer = fs.readFileSync(path.join(sourceRoot, 'flora-generator-composer.js'), 'utf8');

assert.match(bridge, /send-spinner/, '生成中的对话发送按钮必须使用旋转图标');
assert.match(composer, /busy === "true" \? "loader-circle" : "arrow-up"/, '画布生成按钮必须在处理中切换到加载图标');
assert.match(flora, /flora-generator-run-icon\[data-run-icon="loader-circle"\][^}]*flora-node-spin/s, '画布生成加载图标必须旋转');
assert.match(flora, /canvas-node-text[^\n]*:is\(:hover|canvas-node-text[^\n]*is-selected/, '文字节点需要覆盖悬停和选中状态');
assert.match(flora, /canvas-node-text[^\n]*flora-node-shell\.is-hover[^\n]*flora-node-card/s, '文字节点需要覆盖 Flora 壳体悬停状态');
assert.match(flora, /canvas-node-text[^\n]*flora-node-shell[^\n]*is-selected[^\n]*flora-node-card/s, '文字节点需要覆盖 Flora 壳体选中状态');
assert.match(flora, /canvas-node-text \.canvas-text \{[\s\S]{0,260}overflow:\s*auto;[\s\S]{0,120}scrollbar-gutter:\s*stable/s, '文字节点未选中时必须使用与选中状态相同的可排版滚动宽度');
assert.doesNotMatch(flora, /canvas-node-text:is\(\.is-selected, \.selected\)[^{]*flora-node-editor-surface[^}]*scrollbar-gutter:\s*stable/s, '选中状态不能在外层编辑面额外预留第二份滚动条宽度');
assert.match(flora, /canvas-node-text \.canvas-text \{[^}]*height:\s*var\(--canvas-node-text-height, auto\)/s, '所有状态共用文字滚动面的高度规则');
assert.match(flora, /overflow-wrap:\s*anywhere/, '文字节点必须允许长词和长链接换行');
assert.match(renderer, /autoSize|scrollHeight/, '文字节点必须根据 Markdown 内容测量高度');
assert.match(renderer, /markdown\?\.renderMarkdown|renderFallbackMarkdown/, '自适应必须保留 Markdown 渲染');
assert.ok(renderer.indexOf('node.append(') < renderer.indexOf('syncAutoSize(text);\n    syncCanvasTextFromLlmInputs'), '初次渲染在文字节点挂载后计算高度');
assert.match(representationHost, /restoreTextScroll\(node\)[\s\S]{0,700}text\.scrollTop=Math\.min\(top,max\)/, '文字节点从轻量节点恢复为完整节点时必须恢复滚动位置');
assert.match(bridge, /canvasRepresentation\?\.restore\(node\);\s*canvasRepresentation\?\.restoreTextScroll\(node\);/, '完整文字节点挂载后必须应用已记录的滚动位置');
assert.match(bridge, /function openCanvasNodeInteraction\(id, intent = 'explicit-open'\)[\s\S]{0,900}viewportScroll[\s\S]{0,900}viewport\.scrollTop = viewportScroll\.top/s, '文字节点选中时不能改变画布视口滚动位置');
assert.match(bridge, /canvasViewportScrollGuardCancel\?\.\(\)[\s\S]{0,900}viewport\.addEventListener\(['"]scroll['"], restoreViewportScroll/s, '文字节点异步替换期间必须持续守护画布视口滚动位置');
assert.match(canvasSurface, /#neonEngineSurface #canvasEditorScreen #infiniteCanvas\s*\{[\s\S]{0,180}overflow:\s*clip;[\s\S]{0,180}overflow-anchor:\s*none;/, '文字节点替换渲染时必须禁止滚动并禁用滚动锚定');

console.log('text node presentation contract passed');
