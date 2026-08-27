const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { CanvasPrimitiveLayer } = require("../canvas-primitive-layer");

function fakeCanvas() {
  const commands = [];
  const context = {
    commands,
    clearRect(...args) { commands.push(["clearRect", ...args]); },
    beginPath(...args) { commands.push(["beginPath", ...args]); },
    moveTo(...args) { commands.push(["moveTo", ...args]); },
    lineTo(...args) { commands.push(["lineTo", ...args]); },
    stroke(...args) { commands.push(["stroke", ...args]); },
    fillRect(...args) { commands.push(["fillRect", ...args]); },
    roundRect(...args) { commands.push(["roundRect", ...args]); return this; },
    fill(...args) { commands.push(["fill", ...args]); },
    clip(...args) { commands.push(["clip", ...args]); },
    strokeRect(...args) { commands.push(["strokeRect", ...args]); },
    fillText(...args) { commands.push(["fillText", ...args]); },
    setTransform(...args) { commands.push(["setTransform", ...args]); },
    save(...args) { commands.push(["save", ...args]); },
    restore(...args) { commands.push(["restore", ...args]); },
    measureText() { return { width: 10 }; },
  };
  return { canvas: { width: 0, height: 0, style: {}, getContext: () => context }, context };
}

(() => {
  const { canvas, context } = fakeCanvas();
  const layer = new CanvasPrimitiveLayer({ canvas, devicePixelRatio: 1 });
  layer.resize(1440, 900);
  assert.equal(canvas.width, 1440);
  assert.equal(canvas.height, 900);
  assert.equal(canvas.style.width, "1440px");
  assert.equal(canvas.style.height, "900px");

  const far = 1_000_000_000;
  layer.render({
    lodNodes: [
      {
        id: "tile-1",
        count: 100,
        bounds: { left: far, top: far, right: far + 50, bottom: far + 40 },
        typeCounts: { image: 60, text: 40 },
      },
      {
        id: "tile-2",
        count: 5,
        bounds: { left: far + 200, top: far + 100, right: far + 250, bottom: far + 140 },
      },
    ],
    lodConnections: [{ fromX: far + 25, fromY: far + 20, toX: far + 225, toY: far + 120 }],
    transform: { x: far + 25, y: far + 20, scale: 1 },
  });
  const firstNodeRect = context.commands.find((command) => command[0] === "fillRect");
  assert.ok(firstNodeRect, "LOD rendering should draw aggregate rectangles");
  assert.ok(Math.abs(firstNodeRect[1] - 695) < 0.001, "world coordinates should be local to viewport center");
  assert.ok(Math.abs(firstNodeRect[2] - 430) < 0.001, "world coordinates should be local to viewport center");
  assert.equal(layer.hitTest(720, 450)?.id, "tile-1");
  const labels = context.commands.filter((command) => command[0] === "fillText").map((command) => command[1]);
  assert.ok(labels.some((label) => String(label).includes("图片")), `aggregate type is missing: ${labels}`);
  assert.ok(labels.some((label) => String(label).includes("100")), `aggregate count is missing: ${labels}`);
  const diagnostics = layer.getDiagnostics();
  assert.equal(diagnostics.semanticCardCount, 2);
  assert.equal(diagnostics.blankCardCount, 0);
  assert.equal(diagnostics.aggregateNodeCount, 105);
  assert.ok(context.commands.length <= 80, `primitive command count should be bounded: ${context.commands.length}`);

  layer.clear();
  assert.equal(layer.hitTest(720, 450), null);
  assert.equal(layer.getDiagnostics().hitRegionCount, 0);

  layer.resize(100, 50);
  assert.equal(layer.getDiagnostics().width, 100);
  assert.equal(layer.getDiagnostics().height, 50);

  const root = path.join(__dirname, "..");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
  const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  const portable = fs.readFileSync(path.join(root, "build-portable.bat"), "utf8");
  const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");
  assert.match(html, /canvas-media-scheduler\.js[\s\S]*canvas-primitive-layer\.js[\s\S]*script\.js/);
  assert.match(script, /id="canvasPrimitiveLayer"/);
  assert.match(script, /const canvasMediaScheduler\s*=\s*new window\.CanvasMediaScheduler/);
  assert.match(script, /function renderCanvasPrimitiveLayer\(/);
  assert.match(styles, /\.canvas-primitive-layer/);
  assert.match(portable, /canvas-media-scheduler\.js/);
  assert.match(portable, /canvas-primitive-layer\.js/);
  assert.match(packageJson, /check-canvas-media-scheduler\.js/);
  assert.match(packageJson, /check-canvas-primitive-layer\.js/);
  console.log("Canvas primitive layer checks passed.");
})();
