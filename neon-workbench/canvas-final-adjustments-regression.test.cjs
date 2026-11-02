const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = __dirname
const bridge = fs.readFileSync(path.join(root, 'design-sources/script-before-save-bridge.js'), 'utf8')
const hover = fs.readFileSync(path.join(root, 'design-sources/flora-connection-interaction.js'), 'utf8')
const shellCss = fs.readFileSync(path.join(root, 'design-sources/flora-node-shell.css'), 'utf8')
const noteRenderer = fs.readFileSync(path.join(root, '..', 'host-sources/app/canvas-note-node-renderer.js'), 'utf8')
const noteCss = fs.readFileSync(path.join(root, '..', 'host-sources/app/styles.css'), 'utf8')
const noteManifest = fs.readFileSync(path.join(root, '..', 'host-sources/app/module-manifest.js'), 'utf8')

function functionBody(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `${name} must exist`)
  const next = source.slice(start).search(new RegExp(`\\n(?:async )?function ${nextName}\\(`))
  const end = next < 0 ? -1 : start + next
  assert.notEqual(end, -1, `${nextName} must follow ${name}`)
  return source.slice(start, end)
}

function cropGroupContract() {
  const factory = functionBody(bridge, 'createCanvasCropResultGroupFromPersisted', 'outputCanvasCropWorkbench')
  const workbench = functionBody(bridge, 'outputCanvasCropWorkbench', 'persistCanvasGridCrops')
  const gridOutput = functionBody(bridge, 'outputCanvasGridEditorGallery', 'findCanvasGridImageBlockPoint')
  const connectChoice = functionBody(bridge, 'createCanvasNodeFromConnectChoice', 'addCanvasLlmNode')
  const agentCreate = functionBody(bridge, 'createAgentCanvasNode', 'applyAgentCanvasNodeChanges')
  const persistenceGuard = functionBody(bridge, 'assertCanvasCropPersistenceComplete', 'createCanvasCropResultGroup')

  assert.match(factory, /createCanvasImageToolResultNode/)
  assert.match(factory, /createCanvasGroupFromSelection\(null, \{ programmatic: true \}\)/)
  assert.match(factory, /title: "图片组"/)
  assert.doesNotMatch(factory, /title: "裁切组"|cropGroupColumns|groupLayout/)
  assert.match(persistenceGuard, /裁切图片组/)
  assert.match(workbench, /createCanvasCropResultGroup\(/)
  assert.match(gridOutput, /createCanvasCropResultGroupFromPersisted\(/)
  assert.match(bridge, /data-crop-submit>生成裁切图片组/)
  assert.doesNotMatch(bridge, /createCanvasCropResultContainer|createCanvasGridSliceGallery/)
  assert.doesNotMatch(bridge, /data-canvas-node="gallery"|data-connect-node="gallery"/)
  assert.doesNotMatch(bridge, /button\.dataset\.canvasNode === "gallery"\) addCanvasGallery/)
  assert.doesNotMatch(connectChoice, /addCanvasGallery\(/)
  assert.match(connectChoice, /CanvasNodeCreationPolicy\.isNodeCreationAllowed\(choice/)
  assert.match(agentCreate, /CanvasNodeCreationPolicy\.isNodeCreationAllowed\(effectiveKind/)
  assert.doesNotMatch(agentCreate, /addCanvasGallery\(/)
  assert.match(bridge, /kind: "gallery-container"/)
  const legacyMigration = functionBody(bridge, 'migrateLegacyCanvasGalleryItem', 'migrateCanvasBoardGalleryContainers')
  assert.match(legacyMigration, /if \(!item \|\| item\.kind !== "gallery"\) return item/)
  assert.match(legacyMigration, /\.\.\.rest/)
  assert.match(legacyMigration, /kind: "gallery-container"/)
  assert.match(legacyMigration, /members: galleryImages \|\| \[\]/)
  assert.match(legacyMigration, /activeMemberId: galleryActiveImageId \|\| ""/)
  assert.match(legacyMigration, /normalizeCanvasGalleryContainer/)
  assert.match(bridge, /function migrateCanvasBoardGalleryContainers\(board\)/)
  assert.match(bridge, /const migratedNodes = nodes\.map\(\(item\) => migrateLegacyCanvasGalleryItem\(item\)\)/)
  assert.match(bridge, /gallery-container/)
  assert.match(bridge, /renderCanvasGalleryContainerNode\(/)
}

function noteContract() {
  const compatibility = functionBody(bridge, 'getCanvasConnectionCompatibility', 'disconnectCanvasNodes')
  const connect = functionBody(bridge, 'connectCanvasNodes', 'getCanvasH3ConnectionCapacity')
  assert.match(compatibility, /canvas-node-note/)
  assert.match(compatibility, /便签不能参与工作流连线/)
  assert.match(connect, /sourceNode\?\.classList\.contains\("canvas-node-note"\)/)
  assert.doesNotMatch(noteRenderer, /createCanvasPort\(/)
  assert.match(noteManifest, /canvas-note-node-renderer\.js\?v=20261019-note-no-ports/)
  assert.match(bridge, /renderCanvasNoteNode\(node, \{ text: item\.text \|\| "", color: item\.noteColor \}\)/)
  assert.match(noteCss, /#canvasPlane \.canvas-node\.canvas-node-note \{[^}]*border-radius: 10px;[^}]*box-shadow: 0 2px 8px/s)
  assert.doesNotMatch(noteCss, /#canvasPlane \.canvas-node\.canvas-node-note \{[^}]*box-shadow: 0 16px 40px/s)
  assert.match(shellCss, /canvas-node-note\[data-note-color="yellow"\]/)
  assert.match(shellCss, /canvas-node-note\[data-note-color="purple"\]/)
}

function hoverContract() {
  assert.match(hover, /updateHover\(event\.clientX, event\.clientY\)/)
  assert.match(hover, /if \(!lastPointer \|\| context\?\.isDragging\?\.\(\)\) return/)
  assert.match(hover, /data-flora-port-hover/)
  assert.match(shellCss, /\.canvas-node\[data-flora-port-hover="true"\] \.canvas-port/)
  assert.match(shellCss, /\.canvas-node:not\(\[data-flora-port-hover="true"\]\):not\(\.is-selected\):not\(\.selected\) \.canvas-port/)
  assert.match(shellCss, /\.canvas-node:is\(\.is-selected, \.selected\) \.canvas-port/)
  assert.doesNotMatch(hover, /querySelectorAll\('\.canvas-node'\).*data-flora-port-hover/s)
}

cropGroupContract()
noteContract()
hoverContract()
console.log('裁切组、便签连线与悬停端口静态契约通过。')
