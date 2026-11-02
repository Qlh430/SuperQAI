const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')

const sandbox = {}
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'design-sources/canvas-node-visuals.js'), 'utf8'), sandbox)
const visuals = sandbox.CanvasNodeVisuals

function createContext() {
  const calls = { images: [], labels: [] }
  const context = {
    calls, save() {}, restore() {}, translate() {}, scale() {}, beginPath() {}, roundRect() {}, clip() {},
    arc() {}, fill() {}, stroke() {}, moveTo() {}, lineTo() {}, closePath() {}, rect() {}, fillRect() {},
    fillText(value) { calls.labels.push(String(value)) },
    drawImage(image, ...args) { calls.images.push({ image, args }) },
  }
  return context
}

test('gallery-container projects and paints all nine saved gallery member images', () => {
  const members = Array.from({ length: 9 }, (_, index) => ({
    id: `crop-${index}`, savedUrl: `https://assets.test/crop-${index}.png`,
    src: `https://assets.test/crop-${index}.png`, width: 100, height: 100,
    crop: { x: index / 10, y: 0, width: 0.1, height: 1 },
  }))
  const visual = visuals.project({
    id: 'gallery-1', kind: 'gallery-container', width: 420, height: 440,
    galleryContainer: { title: '裁切图集', members, columns: 3, gap: 8 },
  })

  assert.equal(visual.renderer, 'gallery')
  assert.equal(visual.members.length, 9)
  assert.equal(visual.members[8].source, members[8].savedUrl)
  assert.deepEqual(visual.members[0].crop, members[0].crop)
  assert.equal(visual.columns, 3)
  assert.equal(visual.members[0].width, 100)
  const context = createContext()
  visuals.paint(context, visual, {
    contentBounds: { left: 0, top: 0, right: 420, bottom: 440 },
    outerBounds: { left: 0, top: 0, right: 420, bottom: 440 }, borderRadius: 12,
  }, { x: 0, y: 0, scale: 1 }, {
    resolveTexture(source) { return { width: 100, height: 100, source } },
  })
  assert.equal(context.calls.images.length, 9)
  assert.ok(context.calls.images.every(({ image }) => image.source.startsWith('https://assets.test/')))
  assert.equal(context.calls.labels.some(label => /gallery-container|双击打开节点/.test(label)), false)
})

test('video static preview prefers a supplied poster and does not draw duration text', () => {
  const visual = visuals.project({
    kind: 'video', resultSrc: 'https://assets.test/low-thumb.png',
    posterSrc: 'https://assets.test/hd-poster.png', mediaSrc: 'https://assets.test/movie.mp4', duration: 4,
  })
  const context = createContext()
  visuals.paint(context, visual, {
    contentBounds: { left: 0, top: 0, right: 420, bottom: 236 },
    outerBounds: { left: 0, top: 0, right: 420, bottom: 236 }, borderRadius: 12,
  }, { x: 0, y: 0, scale: 1 }, {
    resolveTexture(source) { return { width: 1920, height: 1080, source } },
  })
  assert.equal(visual.source, 'https://assets.test/hd-poster.png')
  assert.equal(context.calls.images[0].image.source, visual.source)
  assert.equal(context.calls.labels.some(label => label === '00:04'), false)
})

test('legacy gallery kind keeps the saved asset collection members', () => {
  const visual = visuals.project({
    kind: 'gallery',
    assetCollection: { members: [{ id: 'legacy-1', url: 'https://assets.test/legacy.png', width: 800, height: 600 }] },
  })
  assert.equal(visual.renderer, 'gallery')
  assert.equal(visual.members[0].source, 'https://assets.test/legacy.png')
})

test('first stationary primary click on a video canvas node is replayed after hydration', () => {
  const source = fs.readFileSync(path.join(__dirname, 'design-sources/script-before-save-bridge.js'), 'utf8')
  const interaction = source.slice(source.indexOf('async function beginCanvasSceneNodeInteraction'), source.indexOf('\nfunction ', source.indexOf('async function beginCanvasSceneNodeInteraction') + 1))
  assert.match(interaction, /ended\?\.type === 'pointerup'/)
  assert.match(interaction, /Math\.hypot\(ended\.clientX - pointerStart\.x, ended\.clientY - pointerStart\.y\) < 8/)
  assert.match(interaction, /window\.CanvasFloraNodeShell\?\.playMedia\?\.\(node\)/)
  assert.match(interaction, /maxMoveDistance < 8/)
  assert.match(interaction, /ended\?\.type === 'pointercancel'/)
})

test('a pending video click calls the mounted player exactly once after model load', async () => {
  const source = fs.readFileSync(path.join(__dirname, 'design-sources/script-before-save-bridge.js'), 'utf8')
  const start = source.indexOf('async function beginCanvasSceneNodeInteraction')
  const end = source.indexOf('\nfunction ', start + 1)
  const interaction = source.slice(source.indexOf('function getCanvasPlayableMediaKind'), start) + source.slice(start, end)
  const listeners = new Map()
  let resolveModel, playCount = 0, dragCount = 0
  const node = { id: 'video-1' }
  const sandbox = {
    canvasRepresentation: { enabled: () => true },
    canvasSceneInteractionSequence: 0,
    canvasState: { activeBoardId: 'board-1', selectedIds: new Set(), selectedSceneItems: new Map() },
    canvasPagedStore: { deletedNodeIds: new Set() },
    canvasVirtualStore: { has: () => false, upsert() {} },
    window: {
      addEventListener(type, listener) { listeners.set(type, listener) },
      removeEventListener(type) { listeners.delete(type) },
      CanvasFloraNodeShell: { playMedia(value) { assert.equal(value, node); playCount++ } },
    },
    loadCanvasSceneNode: () => new Promise(resolve => { resolveModel = resolve }),
    openCanvasNodeInteraction() { return node },
    beginCanvasNodeDrag() { dragCount++ },
    setCanvasStatus() {},
  }
  vm.runInNewContext(`${interaction}; globalThis.runInteraction = beginCanvasSceneNodeInteraction`, sandbox)
  const event = { clientX: 80, clientY: 90, button: 0, pointerId: 12, ctrlKey: false }
  const pending = sandbox.runInteraction(event, { id: 'video-1' })
  listeners.get('pointerup')({ type: 'pointerup', clientX: 80, clientY: 90, pointerId: 12 })
  resolveModel({ id: 'video-1', kind: 'video', mediaSrc: 'https://assets.test/movie.mp4' })
  await pending
  assert.equal(playCount, 1)
  assert.equal(dragCount, 1)
})

test('fast video hydration retains intent until primary pointerup and rejects drags', async () => {
  const source = fs.readFileSync(path.join(__dirname, 'design-sources/script-before-save-bridge.js'), 'utf8')
  const start = source.indexOf('async function beginCanvasSceneNodeInteraction')
  const interaction = source.slice(source.indexOf('function getCanvasPlayableMediaKind'), start) + source.slice(start, source.indexOf('\nfunction ', start + 1))
  for (const model of [{kind:'video'}, {kind:'asset-collection',assetCollection:{mode:'single',members:[{kind:'video'}]}}, {kind:'asset-collection',assetCollection:{mode:'single',members:[{kind:'audio'}]}}]) for (const moved of [false, true]) {
    const listeners = new Map(); let plays = 0
    const node = { isConnected: true }
    const win = {
      addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn) },
      removeEventListener(type, fn) { listeners.get(type)?.delete(fn) },
      CanvasFloraNodeShell: { playMedia() { plays++ } },
    }
    const sandbox = {
      canvasRepresentation: { enabled: () => true }, canvasSceneInteractionSequence: 0,
      canvasState: { activeBoardId: 'board-fast', selectedIds: new Set(), selectedSceneItems: new Map() },
      canvasPagedStore: { deletedNodeIds: new Set() },
      canvasVirtualStore: { has: () => true }, window: win,
      loadCanvasSceneNode: async () => ({ id: 'fast', ...model, mediaSrc: '/test.mp4' }),
      openCanvasNodeInteraction: () => node, beginCanvasNodeDrag() {}, setCanvasStatus() {},
      setTimeout, clearTimeout,
    }
    vm.runInNewContext(`${interaction}; globalThis.run = beginCanvasSceneNodeInteraction`, sandbox)
    await sandbox.run({clientX:20,clientY:30,button:0,pointerId:7}, {id:'fast'})
    const emit = (type, fields) => { for (const fn of [...listeners.get(type) || []]) fn({type,pointerId:7,clientX:20,clientY:30,...fields}) }
    if (moved) emit('pointermove', {clientX:50})
    emit('pointerup', {})
    assert.equal(plays, moved ? 0 : 1)
    assert.equal([...listeners.values()].reduce((n,s)=>n+s.size,0), 0)
  }
})
