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
assert.match(visible.style.transform, /translate3d\(-8px, -4px, 0\) scale\(1\.2\)/);
assert.equal(layer.hitTest(260, 130)?.id, "top-node", "hit testing must follow the fast pan/zoom transform before a new page is painted");
assert.deepEqual(layer.getItemsInRect({ left: 265, top: 170, right: 290, bottom: 190 }).map((item) => item.id), ["top-node"], "marquee hit testing must follow the fast transform");
const paddedVisible = createCanvas();
const padded = new CanvasSceneLayer({
  canvas: paddedVisible,
  devicePixelRatio: 1,
  createBuffer: createCanvas,
});
padded.resize(800, 600, 160);
padded.render({ visualNodes: [], transform: { x: 100, y: 50, scale: 1 } });
padded.reproject({ x: 112, y: 56, scale: 1.2 });
assert.match(
  paddedVisible.style.transform,
  /translate3d\(-8px, -4px, 0\) scale\(1\.2\)/,
  "reprojection must preserve the pointer anchor with a padded scene bitmap",
);
const portraitCalls = [];
const portrait = new CanvasSceneLayer({
  canvas: createCanvas(),
  devicePixelRatio: 1,
  createBuffer: () => ({ ...createCanvas(), getContext: () => ({ ...createContext(), drawImage(...args) { portraitCalls.push(args); } }) }),
});
portrait.resize(320, 240);
portrait.render({
  visualNodes: [["portrait", "image", 0, 0, 320, 240, 1, "/portrait.webp", "竖图"]],
  texturedNodeIds: ["portrait"],
  transform: { x: 0, y: 0, scale: 1 },
  resolveTexture: () => ({ complete: true, naturalWidth: 640, naturalHeight: 1024 }),
});
const portraitImage = portraitCalls.at(-1);
assert.equal(Math.round(portraitImage[3] / portraitImage[4] * 1000), Math.round(640 / 1024 * 1000), "portrait previews must keep their source aspect ratio");
assert.equal(portrait.buffer.context.fills.length, 0, "image scene nodes must not paint a dark card behind transparent previews");
assert.equal(portrait.buffer.context.text.length, 0, "image scene nodes must not paint a filename bar over the image");
assert.equal(portrait.hitTest(15, 120), null, "transparent padding must not intercept clicks on nodes underneath");
assert.equal(portrait.hitTest(160, 120)?.id, "portrait");
assert.deepEqual(portrait.getItemsInRect({ left: 145, top: 90, right: 175, bottom: 150 }).map((item) => item.id), ["portrait"]);
assert.deepEqual(portrait.getItemsInRect({ left: 0, top: 0, right: 45, bottom: 40 }), []);

const dense = Array.from({ length: 2176 }, (_, i) => [`copy-${i}`, "image", i % 64, Math.floor(i / 64), 320, 240, i, "/same.webp", ""]);
const callsBefore = portraitCalls.length;
portrait.render({ visualNodes: dense, texturedNodeIds: ["copy-2175"], transform: { scale: 1 },
  resolveTexture: () => ({ complete: true, naturalWidth: 640, naturalHeight: 1024 }) });
assert.equal(portraitCalls.length - callsBefore, 2176, "copies must share the cached image even outside the texture admission budget");

console.log("Canvas scene layer checks passed.");
