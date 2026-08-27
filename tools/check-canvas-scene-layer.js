const assert = require("node:assert/strict");
const { CanvasSceneLayer } = require("../canvas-scene-layer");

function createContext() {
  return {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    fills: [],
    strokes: [],
    text: [],
    images: [],
    beziers: [],
    pathRects: [],
    fillCalls: 0,
    clearRect() {},
    setTransform() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    bezierCurveTo(...args) { this.beziers.push(args); },
    stroke() {},
    fillRect(...args) { this.fills.push(args); },
    fill() { this.fillCalls += 1; },
    strokeRect(...args) { this.strokes.push(args); },
    fillText(value) { this.text.push(String(value)); },
    drawImage(...args) { this.images.push(args); },
    save() {},
    restore() {},
    rect(...args) { this.pathRects.push(args); },
    clip() {},
  };
}

function createCanvas() {
  const context = createContext();
  return {
    width: 0,
    height: 0,
    style: {},
    ownerDocument: null,
    getContext: () => context,
    context,
  };
}

const visible = createCanvas();
const buffer = createCanvas();
const layer = new CanvasSceneLayer({
  canvas: visible,
  devicePixelRatio: 1,
  createBuffer: () => buffer,
});
layer.resize(800, 600);
layer.render({
  visualConnections: [0, 0, 200, 100],
  visualNodes: [
    ["bottom-node", "text", 20, 20, 100, 80, 1, "", "底部节点"],
    ["top-node", "image", 40, 30, 100, 80, 2, "/thumb.webp", "顶部节点"],
  ],
  texturedNodeIds: ["top-node"],
  transform: { x: 100, y: 50, scale: 1 },
  resolveTexture: () => ({ complete: true, naturalWidth: 32, naturalHeight: 32 }),
});

const diagnostics = layer.getDiagnostics();
assert.equal(diagnostics.aggregateCardCount, 0);
assert.equal(diagnostics.spriteCount, 2);
assert.equal(diagnostics.connectionCount, 1);
assert.equal(diagnostics.renderedGeometryCount, 2);
assert.equal(buffer.context.beziers.length, 1, "scene connections must retain the canvas curve language");
assert.equal(buffer.context.text.some((value) => /区域|个节点/.test(value)), false);
assert.equal(layer.hitTest(150, 100).id, "top-node");
assert.equal(layer.hitTest(10, 10), null);
assert.equal(layer.reproject({ x: 112, y: 56, scale: 1.2 }), true);
assert.match(visible.style.transform, /translate\(-8px, -4px\) scale\(1\.2\)/);

console.log("Canvas scene layer checks passed.");
