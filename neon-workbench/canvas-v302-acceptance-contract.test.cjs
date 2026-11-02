const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, 'design-sources');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

const representation = read('canvas-representation-host.js');
const visuals = read('canvas-node-visuals.js');
const shell = read('flora-node-shell.js');
const shellCss = read('flora-node-shell.css');
const surfaceCss = read('neon-canvas-surface.css');
const bridge = read('script-before-save-bridge.js');
const note = fs.readFileSync(path.join(__dirname, '..', 'host-sources/app/canvas-note-node-renderer.js'), 'utf8');
const cutout = read('background-removal-ui.js');
const h3 = read('canvas-h3-node-renderer.js');
const registry = fs.readFileSync(path.join(__dirname, '..', 'host-sources/app/core/canvas-node-registry.js'), 'utf8');

assert.doesNotMatch(`${representation}\n${visuals}`, /待完成/, 'visual projection must not expose placeholder status copy');
assert.doesNotMatch(representation, /const uploadedImage=|if\(hasMedia\)\{const reasons=/, 'ordinary visible uploads must not all be forced into Full during pan or node drag');
assert.match(read('script-before-save-bridge.js'), /canvasRepresentation\?\.capture\(current\);[\s\S]*?const replacement = mountCanvasVirtualNode/,
  'the old media element must be captured before mounting its replacement');
assert.match(representation, /value\.paused===false[\s\S]*?media\.play/);
assert.match(note, /text\.addEventListener\("pointerdown"[\s\S]*?selectCanvasNode\?\.\(node\)/);
assert.match(note, /text\.addEventListener\("dblclick"[\s\S]*?text\.contentEditable\s*=\s*"true"/);
assert.match(note, /palette\.addEventListener\("pointerdown",\s*\(event\)\s*=>\s*event\.stopPropagation\(\)\)/);
assert.match(registry, /defaultStatus:\s*String\(definition\?\.defaultStatus\s*\|\|\s*""\)/);
assert.match(shell, /data-flora-adaptive-media="true"/);
assert.match(shellCss, /\.flora-node-image-dimensions \{ display: none !important; \}/, 'legacy duplicate image information row must stay hidden');
assert.match(shellCss, /canvas-port[\s\S]*?width:\s*28px/);
assert.match(shellCss, /:is\(:hover, :focus-visible, \.is-magnetized, \.is-snap-target, \.is-connected\)[\s\S]*?border:\s*1px solid var\(--canvas-neon-muted\)/);
assert.match(cutout, /正在抠图，请稍等/);
assert.match(h3, /renderCanvasH3PromptHighlight/);
assert.match(read('flora-generator-composer.js'), /const promptSurface = prompt\.closest\?\.\("\.canvas-h3-prompt-editor"\) \|\| prompt/);
assert.match(bridge, /function normalizeCanvasH3PromptReferences[\s\S]*?<Picture/);
assert.match(bridge, /function insertCanvasH3Mention[\s\S]*?setRangeText\(`@\$\{item\.displayLabel\}/);
