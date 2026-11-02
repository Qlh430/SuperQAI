const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = __dirname
const startup = fs.readFileSync(path.join(root, 'design-sources/runtime-index-before-isolation.html'), 'utf8')
const startupCss = fs.readFileSync(path.join(root, 'design-sources/neon-auth.css'), 'utf8')
const shell = fs.readFileSync(path.join(root, 'design-sources/flora-node-shell.js'), 'utf8')
const shellCss = fs.readFileSync(path.join(root, 'design-sources/flora-node-shell.css'), 'utf8')
const bridge = fs.readFileSync(path.join(root, 'design-sources/script-before-save-bridge.js'), 'utf8')
const note = fs.readFileSync(path.join(root, '..', 'host-sources/app/canvas-note-node-renderer.js'), 'utf8')

assert.match(startup, /ai-os-startup-brand-mark/)
assert.doesNotMatch(startup, /ai-os-startup-brand-mark[^>]*>∞</)
assert.match(startupCss, /ai-os-startup-brand-mark[^}]*display:\s*grid/s)

assert.match(shell, /function syncImagePreviewDimensions\(node, preferSelection = false\)/)
assert.match(shell, /state\.geometryLocked/)
assert.match(shellCss, /\.flora-node-card[^{]*\{[^}]*transition:\s*none/s)

assert.match(note, /canvas-note-palette/)
assert.match(shellCss, /is-flora-palette-open \.canvas-note-palette[^{]*\{[^}]*pointer-events:\s*auto/s)
assert.match(shellCss, /is-flora-palette-open \.canvas-note-palette[^{]*\{[^}]*z-index:\s*20/s)

assert.match(bridge, /displayLabel:\s*`\$\{typeLabel\}\$\{index \+ 1\}`/)
assert.match(bridge, /promptLabel:\s*`<\$\{promptType\} \$\{index \+ 1\}>`/)
assert.match(bridge, /promptLabel\.textContent = item\.ready \? item\.displayLabel/)
assert.match(bridge, /setRangeText\(`\$\{item\.displayLabel\}/)
assert.match(bridge, /normalizeCanvasH3PromptReferences\(getCanvasGenerationPrompt\(node, ownPrompt\)\)/)

console.log('interaction polish regression contracts passed')
