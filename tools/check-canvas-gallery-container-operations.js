const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const galleryRenderer = fs.readFileSync(path.join(root, "canvas-gallery-node-renderer.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const CanvasConnectionRules = require("../canvas-connection-rules.js");
const CanvasGalleryRules = require("../canvas-gallery-rules.js");

function runInNewContext(code, context = {}) {
  const sandbox = { CanvasConnectionRules, CanvasGalleryRules, ...context };
  Object.assign(context, sandbox);
  return vm.runInNewContext(code, context);
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Missing function ${name}`);
  const bodyStart = source.indexOf("{", source.indexOf(")", start));
  assert.notEqual(bodyStart, -1, `Missing body for ${name}`);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unterminated function ${name}`);
}

const context = { createId: (() => { let id = 0; return () => `id-${++id}`; })() };
runInNewContext([
  extractFunction(script, "normalizeCanvasGalleryImages"),
  extractFunction(script, "resolveCanvasGalleryActiveImage"),
  extractFunction(script, "normalizeCanvasGalleryContainer"),
  extractFunction(script, "getCanvasGalleryContainer"),
  extractFunction(script, "isCanvasGalleryImageReady"),
  extractFunction(script, "getCanvasGalleryContainerOutput"),
  extractFunction(script, "findCanvasReusableImage"),
  extractFunction(script, "detachCanvasGalleryMember"),
  extractFunction(script, "appendCanvasGalleryMember"),
  extractFunction(script, "detachCanvasGalleryContainerMember"),
  extractFunction(script, "appendCanvasGalleryContainerMember"),
  extractFunction(script, "getCanvasConnectionId"),
].join("\n"), context);

const node = {
  dataset: {
    galleryContainer: JSON.stringify({
      title: "参考图集",
      members: [
        { id: "a", src: "/output/a.png", name: "A", width: 1024, height: 1024 },
        { id: "b", src: "/output/b.png", name: "B", width: 800, height: 1200 },
      ],
    }),
  },
};

const all = JSON.parse(JSON.stringify(context.getCanvasGalleryContainerOutput(node, "output")));
assert.deepEqual(all, {
  type: "images",
  images: [
    { name: "A", url: "/output/a.png", width: 1024, height: 1024 },
    { name: "B", url: "/output/b.png", width: 800, height: 1200 },
  ],
});
assert.deepEqual(
  JSON.parse(JSON.stringify(context.getCanvasGalleryContainerOutput({ dataset: { galleryContainer: JSON.stringify({ title: "空图集", members: [] }) } }, "output"))),
  { type: "images", images: [] },
  "a container output must remain an images value even while it is empty",
);
assert.deepEqual(JSON.parse(JSON.stringify(context.getCanvasGalleryContainerOutput(node, "member-output:b"))), {
  type: "image",
  name: "B",
  url: "/output/b.png",
  width: 800,
  height: 1200,
});
const matchingImage = { getAttribute: (name) => name === "data-original-src" ? "/output/result.png" : "" };
const referenceImage = { getAttribute: (name) => name === "data-original-src" ? "/output/reference.png" : "" };
assert.equal(
  context.findCanvasReusableImage({
    querySelectorAll: () => [referenceImage, matchingImage],
    querySelector: () => referenceImage,
  }, "/output/result.png"),
  matchingImage,
  "reusable image lookup must match the requested output source when a node also contains reference images",
);

const directDetached = JSON.parse(JSON.stringify(context.detachCanvasGalleryMember(node, "b", { x: 700, y: 300 })));
assert.equal(directDetached.detached.id, "b", "member detach contract must expose the member selected for a canvas drop");
assert.equal(directDetached.container.members.length, 1, "member detach must remove the member from the source container");
assert.deepEqual(
  JSON.parse(JSON.stringify(context.appendCanvasGalleryMember(directDetached.container, { id: "c", src: "/output/c.png" }))).members.map((item) => item.id),
  ["a", "c"],
  "append contract must retain existing members and add the dropped image",
);

const detached = JSON.parse(JSON.stringify(context.detachCanvasGalleryContainerMember(node, "a")));
assert.equal(detached.member.id, "a");
assert.equal(detached.container.members.length, 1);
const appended = JSON.parse(JSON.stringify(context.appendCanvasGalleryContainerMember(detached.container, { src: "/output/c.png", name: "C" })));
assert.equal(appended.members.length, 2);
assert.equal(appended.members[1].savedUrl, "/output/c.png");
assert.equal(
  context.getCanvasConnectionId({ from: "container", fromPort: "member-output:b", to: "generator", toPort: "input" }),
  "edge:container:member-output:b:generator:input",
  "member connections must not collide with the container output connection",
);

const interactionContext = {};
runInNewContext([
  extractFunction(script, "suggestedCanvasGalleryContainerColumns"),
  extractFunction(script, "getCanvasGalleryContainerLayout"),
  extractFunction(script, "shouldRenderCanvasGalleryMemberOutput"),
  extractFunction(script, "getCanvasGalleryContainerMemberColumnIndices"),
  extractFunction(script, "resolveCanvasConnectionDropPort"),
  extractFunction(script, "cloneCanvasConnectionWithMappedNodes"),
  extractFunction(script, "getCanvasConnectionId"),
  extractFunction(script, "remapCanvasGalleryMemberConnections"),
].join("\n"), interactionContext);

assert.deepEqual(
  JSON.parse(JSON.stringify(interactionContext.getCanvasGalleryContainerLayout(1, 10))),
  { columns: 1, rows: 1, cellSize: 120, gap: 16, width: 120, minHeight: 68 },
  "a single member uses only the container output without an internal output gutter",
);
assert.deepEqual(
  JSON.parse(JSON.stringify(interactionContext.getCanvasGalleryContainerLayout(25, 10))),
  { columns: 5, rows: 5, cellSize: 120, gap: 16, width: 664, minHeight: 68 },
  "five source-ratio columns reserve a visible output-port gutter",
);
assert.equal(interactionContext.shouldRenderCanvasGalleryMemberOutput(1), false, "a one-image gallery must use only its container output");
assert.equal(interactionContext.shouldRenderCanvasGalleryMemberOutput(2), true, "a multi-image gallery must retain individual image outputs");
assert.deepEqual(
  JSON.parse(JSON.stringify(interactionContext.getCanvasGalleryContainerMemberColumnIndices([
    { id: "wide-a", width: 1600, height: 800 },
    { id: "tall", width: 800, height: 1600 },
    { id: "wide-b", width: 1600, height: 800 },
    { id: "square", width: 1000, height: 1000 },
  ], 2))),
  [0, 1, 0, 0],
  "source-ratio members must retain a deterministic shortest-column assignment instead of rebalancing on image load",
);

const freeGridContext = {};
runInNewContext([
  extractFunction(script, "suggestedCanvasGalleryContainerColumns"),
  extractFunction(script, "getCanvasGalleryFreeGridLayout"),
].join("\n"), freeGridContext);
const galleryMinimumWidthContext = {};
runInNewContext(extractFunction(script, "getCanvasGalleryMinimumWidthForColumns"), galleryMinimumWidthContext);
assert.equal(
  galleryMinimumWidthContext.getCanvasGalleryMinimumWidthForColumns(3, 16),
  336,
  "a three-column gallery must stop shrinking at the width that keeps all three thumbnails readable: 8px preview inset either side + 3x96px cells + 2x16px gap",
);
const freeGrid = freeGridContext.getCanvasGalleryFreeGridLayout({
  members: Array.from({ length: 5 }, (_, index) => ({ id: `free-${index}`, width: 1000, height: 1000 })),
  width: 420,
  height: 220,
  layoutMode: "manual",
});
assert.equal(freeGrid.columns, 3, "a 420px-wide gallery must reflow five thumbnails into three ordered columns");
assert.equal(freeGrid.rows, 2, "members must continue in a second row when the current columns are filled");
assert.equal(freeGrid.width, 420, "a persisted gallery width must be preserved");
assert.equal(freeGrid.height, freeGrid.minHeight, "gallery height must grow to fit a newly required row");
assert.equal(freeGrid.cellWidth >= 96, true, "each thumbnail must retain the minimum readable width");
const tallerFreeGrid = freeGridContext.getCanvasGalleryFreeGridLayout({
  members: Array.from({ length: 5 }, (_, index) => ({ id: `tall-free-${index}`, width: 1000, height: 1000 })),
  width: 420,
  height: 700,
  layoutMode: "manual",
});
assert.equal(tallerFreeGrid.columns, 3, "vertical space must not change the gallery column count or make the same images suddenly shrink");
assert.equal(tallerFreeGrid.rows, 2, "vertical resizing must retain the row structure selected by the gallery width");
const defaultBalancedMembers = Array.from({ length: 3 }, (_, index) => ({ id: `balanced-${index}`, width: 1600, height: 900 }));
const defaultBalancedGrid = freeGridContext.getCanvasGalleryFreeGridLayout({
  members: defaultBalancedMembers,
  width: 220,
});
const manuallyResizedBalancedGrid = freeGridContext.getCanvasGalleryFreeGridLayout({
  members: defaultBalancedMembers,
  width: 620,
  layoutMode: "manual",
});
assert.equal(defaultBalancedGrid.columns, 2, "a new three-image gallery must default to a balanced two-column grid instead of a single row");
assert.equal(defaultBalancedGrid.width > 220, true, "a default gallery created while empty must expand beyond its initial minimum width as images are added");
assert.equal(manuallyResizedBalancedGrid.columns, 3, "only a user-resized gallery may use every available column for a free single-row layout");
const verticallyResizedMembers = Array.from({ length: 5 }, (_, index) => ({ id: `vertical-${index}`, width: 1000, height: 1000 }));
const verticallyResizedGrid = freeGridContext.getCanvasGalleryFreeGridLayout({
  members: verticallyResizedMembers,
  width: 420,
  height: 600,
  layoutMode: "manual",
  resizeAxis: "height",
});
const persistedVerticalGrid = freeGridContext.getCanvasGalleryFreeGridLayout({
  members: verticallyResizedMembers,
  width: 420,
  layoutMode: "manual",
  manualColumns: 2,
});
assert.equal(verticallyResizedGrid.columns, 2, "a vertical drag must trade columns for additional rows instead of discarding its height input");
assert.equal(verticallyResizedGrid.height, verticallyResizedGrid.minHeight, "a vertical drag must reflow the image grid without leaving empty space below it");
assert.equal(persistedVerticalGrid.columns, 2, "the column count selected by a vertical drag must survive the next render and keep connected ports aligned");
const sequentialVerticalGrid = freeGridContext.getCanvasGalleryFreeGridLayout({
  members: verticallyResizedMembers,
  width: 640,
  height: 300,
  layoutMode: "manual",
  manualColumns: 2,
  resizeAxis: "height",
});
assert.equal(sequentialVerticalGrid.columns, 3, "a vertical drag may only advance one adjacent column at a time instead of jumping from several rows to one row");
const shortSingleFreeGrid = freeGridContext.getCanvasGalleryFreeGridLayout({
  members: [{ id: "single", width: 1600, height: 900 }],
  width: 600,
  height: 260,
  layoutMode: "manual",
});
const tallSingleFreeGrid = freeGridContext.getCanvasGalleryFreeGridLayout({
  members: [{ id: "single", width: 1600, height: 900 }],
  width: 600,
  height: 800,
  layoutMode: "manual",
});
assert.equal(shortSingleFreeGrid.columns, 1, "a one-image gallery must never create empty columns that shrink its only image");
assert.equal(tallSingleFreeGrid.columns, 1, "moving or remounting a one-image gallery must retain its full-width image column");
assert.equal(shortSingleFreeGrid.cellWidth, tallSingleFreeGrid.cellWidth, "gallery height must not change thumbnail width when the gallery width is unchanged");
const narrowFreeGrid = freeGridContext.getCanvasGalleryFreeGridLayout({
  members: [{ id: "narrow", width: 1000, height: 1000 }],
  width: 80,
  height: 80,
  layoutMode: "manual",
});
assert.equal(narrowFreeGrid.columns, 1, "a gallery can collapse to a single column");
assert.equal(narrowFreeGrid.width, narrowFreeGrid.minWidth, "the resize floor must preserve the minimum thumbnail size");
const tallFreeGrid = freeGridContext.getCanvasGalleryFreeGridLayout({
  members: [{ id: "portrait", width: 800, height: 1600 }],
  width: 220,
  height: 800,
  layoutMode: "manual",
});
assert.equal(tallFreeGrid.height, tallFreeGrid.minHeight, "a gallery must discard excess vertical resize space and hug its image content");

const galleryResizeContext = {};
runInNewContext([
  extractFunction(script, "normalizeCanvasGalleryImages"),
  extractFunction(script, "resolveCanvasGalleryActiveImage"),
  extractFunction(script, "normalizeCanvasGalleryContainer"),
  extractFunction(script, "getCanvasGalleryContainer"),
  extractFunction(script, "suggestedCanvasGalleryContainerColumns"),
  extractFunction(script, "getCanvasGalleryFreeGridLayout"),
  extractFunction(script, "getCanvasGalleryContainerSizeForRequest"),
].join("\n"), galleryResizeContext);
const resizeNode = {
  dataset: {
    galleryContainer: JSON.stringify({
      layoutMode: "manual",
      members: Array.from({ length: 5 }, (_, index) => ({ id: `resize-${index}`, src: `/output/resize-${index}.png`, width: 1000, height: 1000 })),
    }),
  },
};
const minimumGallerySize = galleryResizeContext.getCanvasGalleryContainerSizeForRequest(resizeNode, 80, 80);
assert.equal(minimumGallerySize.width, minimumGallerySize.layout.minWidth, "gallery resizing must stop before thumbnails become unreadably small");
assert.equal(minimumGallerySize.height, minimumGallerySize.layout.minHeight, "gallery resizing must grow vertically when one column needs more rows");
const wideGallerySize = galleryResizeContext.getCanvasGalleryContainerSizeForRequest(resizeNode, 560, 220);
assert.equal(wideGallerySize.layout.columns, 5, "widening a gallery to 560px must reflow the same members into more columns (the 8px preview inset buys one extra 96px column)");
assert.equal(wideGallerySize.height, wideGallerySize.layout.minHeight, "a short resize must still preserve every visible source-ratio member");
const gradualWideGallerySize = galleryResizeContext.getCanvasGalleryContainerSizeForRequest(resizeNode, 760, 360, {
  layoutMode: "manual",
  manualColumns: 3,
  resizeAxis: "width",
});
assert.equal(gradualWideGallerySize.layout.columns, 4, "a diagonal resize from a three-column gallery must advance one column toward its new aspect ratio instead of jumping straight to one row");
const continuedWideGallerySize = galleryResizeContext.getCanvasGalleryContainerSizeForRequest(resizeNode, 1040, 360, {
  layoutMode: "manual",
  manualColumns: gradualWideGallerySize.layout.columns,
  resizeAxis: "width",
});
assert.equal(continuedWideGallerySize.layout.columns, 5, "continued horizontal expansion may reach a single row only after passing through the adjacent column count");
const excessHeightGallerySize = galleryResizeContext.getCanvasGalleryContainerSizeForRequest(resizeNode, 560, 900);
assert.equal(excessHeightGallerySize.height, excessHeightGallerySize.layout.minHeight, "a persisted or dragged excess height must collapse so only a new image row expands the gallery");

let nextLifecycleId = 0;
const lifecycleContext = { createId: () => `lifecycle-${++nextLifecycleId}` };
runInNewContext([
  extractFunction(script, "normalizeCanvasGalleryImages"),
  extractFunction(script, "resolveCanvasGalleryActiveImage"),
  extractFunction(script, "normalizeCanvasGalleryContainer"),
  extractFunction(script, "appendCanvasGalleryContainerMember"),
  extractFunction(script, "suggestedCanvasGalleryContainerColumns"),
  extractFunction(script, "getCanvasGalleryFreeGridLayout"),
  extractFunction(script, "getCanvasGalleryContainerLayout"),
  extractFunction(script, "getCanvasGalleryContainerRenderState"),
  extractFunction(script, "getCanvasImageIntrinsicDimensions"),
].join("\n"), lifecycleContext);
const sizedRenderState = lifecycleContext.getCanvasGalleryContainerRenderState({
  layoutMode: "manual",
  members: Array.from({ length: 5 }, (_, index) => ({ id: `sized-${index}`, src: `/output/sized-${index}.png`, width: 1000, height: 1000 })),
}, { width: 288, height: 220 });
assert.equal(sizedRenderState.layout.columns, 2, "the rendered column count must follow the persisted gallery width, not its member count");
assert.equal(sizedRenderState.layout.height, sizedRenderState.layout.minHeight, "render-state sizing must extend the gallery when the fixed width needs another row");
let automaticLifecycle = lifecycleContext.getCanvasGalleryContainerRenderState({
  members: [{ id: "first", src: "/output/first.png" }],
}).container;
for (let index = 2; index <= 25; index += 1) {
  automaticLifecycle = lifecycleContext.appendCanvasGalleryContainerMember(automaticLifecycle, {
    id: `auto-${index}`,
    src: `/output/${index}.png`,
  });
}
const automaticFinal = lifecycleContext.getCanvasGalleryContainerRenderState(automaticLifecycle);
assert.equal(automaticLifecycle.columns, null, "an automatic render must not persist its calculated column count as a preference");
assert.equal(automaticFinal.layout.columns, 5, "an unresized gallery must keep its near-square default column count instead of expanding into a long row");

let explicitLifecycle = lifecycleContext.getCanvasGalleryContainerRenderState({
  columns: 2,
  members: [{ id: "explicit-first", src: "/output/explicit-first.png" }],
}).container;
for (let index = 2; index <= 25; index += 1) {
  explicitLifecycle = lifecycleContext.appendCanvasGalleryContainerMember(explicitLifecycle, {
    id: `explicit-${index}`,
    src: `/output/explicit-${index}.png`,
  });
}
assert.equal(
  lifecycleContext.getCanvasGalleryContainerRenderState(explicitLifecycle).layout.columns,
  5,
  "legacy serialized columns metadata must not override the adaptive gallery layout",
);

let intrinsicSaveCalls = 0;
const intrinsicContext = {
  getCanvasGalleryContainer: (target) => target.container,
  setCanvasGalleryContainer: (target, value) => {
    target.container = value;
    return value;
  },
  scheduleCanvasSave: () => { intrinsicSaveCalls += 1; },
};
runInNewContext([
  extractFunction(script, "getCanvasImageIntrinsicDimensions"),
  extractFunction(script, "syncCanvasGalleryMemberIntrinsicSize"),
].join("\n"), intrinsicContext);
assert.deepEqual(
  JSON.parse(JSON.stringify(lifecycleContext.getCanvasImageIntrinsicDimensions({
    naturalWidth: 434,
    naturalHeight: 768,
    dataset: { originalWidth: "943", originalHeight: "1667" },
  }))),
  { width: 943, height: 1667 },
  "gallery transfers must prefer the original dimensions carried by a thumbnail over its rendered thumbnail size",
);
const intrinsicNode = { container: { members: [{ id: "landscape", width: null, height: null }] } };
assert.equal(
  intrinsicContext.syncCanvasGalleryMemberIntrinsicSize(intrinsicNode, "landscape", { naturalWidth: 1600, naturalHeight: 900 }),
  true,
  "loading a gallery preview must record its real source dimensions",
);
assert.deepEqual(
  JSON.parse(JSON.stringify(intrinsicNode.container.members[0])),
  { id: "landscape", width: 1600, height: 900 },
  "the content-height calculation must receive the same landscape ratio the browser renders",
);
assert.equal(intrinsicSaveCalls, 1, "intrinsic dimensions must be persisted so an old gallery stays content-fitted after reload");
const thumbnailIntrinsicNode = { container: { members: [{ id: "portrait-thumbnail", width: null, height: null }] } };
assert.equal(
  intrinsicContext.syncCanvasGalleryMemberIntrinsicSize(thumbnailIntrinsicNode, "portrait-thumbnail", {
    naturalWidth: 434,
    naturalHeight: 768,
    currentSrc: "/output/thumbnails/portrait.webp",
    dataset: {
      imageQuality: "thumbnail",
      originalWidth: "943",
      originalHeight: "1667",
    },
    getAttribute: (name) => (name === "data-original-src"
      ? "/output/portrait.png"
      : name === "src" ? "/output/thumbnails/portrait.webp" : ""),
  }),
  true,
  "a loaded thumbnail must backfill the original aspect ratio before a portrait member can overflow its gallery",
);
assert.deepEqual(
  JSON.parse(JSON.stringify(thumbnailIntrinsicNode.container.members[0])),
  { id: "portrait-thumbnail", width: 943, height: 1667 },
  "gallery sizing must use the original dimensions exposed by the thumbnail service",
);
assert.match(
  extractFunction(galleryRenderer, "render"),
  /syncCanvasGalleryMemberIntrinsicSize\?\.\(node, member\.id, image\)/,
  "gallery preview load events must send the actual image dimensions back to the shared gallery state",
);
const galleryRenderSource = extractFunction(galleryRenderer, "render");
assert.match(
  galleryRenderSource,
  /canvasGalleryIntrinsicSyncBound[\s\S]*addEventListener\("load",[\s\S]*syncCanvasGalleryMemberIntrinsicSize\?\.\(node, member\.id, image\)/,
  "reused gallery images must retain an intrinsic-size listener instead of being skipped because data-original-src already exists",
);
assert.match(
  galleryRenderSource,
  /image\.complete[\s\S]*syncCanvasGalleryMemberIntrinsicSize\?\.\(node, member\.id, image\)/,
  "a reused image that finished loading before it entered the gallery must still synchronize its intrinsic dimensions",
);

const memberOutputPort = { dataset: { canvasPort: "member-output:b" } };
const memberInputPort = { dataset: { canvasPort: "member-input:b" } };
const sourceNode = { contains: (item) => item === memberOutputPort };
const targetNode = { contains: (item) => item === memberInputPort };
assert.equal(
  interactionContext.resolveCanvasConnectionDropPort(sourceNode, { closest: () => memberOutputPort }, "output", "output"),
  "member-output:b",
  "input-initiated drags must keep the member output hit handle",
);
assert.equal(
  interactionContext.resolveCanvasConnectionDropPort(targetNode, { closest: () => memberInputPort }, "input", "input"),
  "member-input:b",
  "output-initiated drags must keep the member input hit handle",
);

const memberDragEventContext = {};
runInNewContext([
  extractFunction(script, "scheduleCanvasGalleryMemberHoverConnectionSync"),
  extractFunction(script, "bindCanvasGalleryContainerMemberDrag"),
].join("\n"), memberDragEventContext);
const memberDragListeners = new Map();
const memberDragItem = {
  addEventListener: (type, listener) => memberDragListeners.set(type, listener),
  classList: { add: () => {}, remove: () => {} },
  setPointerCapture: () => {},
  releasePointerCapture: () => {},
};
memberDragEventContext.bindCanvasGalleryContainerMemberDrag(memberDragItem, { dataset: { id: "gallery" } }, { id: "member-a", src: "/output/a.png" });
let memberOutputPointerUpStopped = false;
memberDragListeners.get("pointerup")({
  stopPropagation: () => { memberOutputPointerUpStopped = true; },
  clientX: 12,
  clientY: 24,
});
assert.equal(
  memberOutputPointerUpStopped,
  false,
  "a gallery member must not swallow pointerup when a nested output port owns the drag; otherwise the connection drop cannot auto-connect or open its menu",
);

assert.doesNotMatch(
  styles,
  /\.canvas-gallery-member:hover\s+\.canvas-gallery-member-port,\s*\n\.canvas-gallery-member:focus-within\s+\.canvas-gallery-member-port\s*\{[\s\S]*?visibility:\s*visible/i,
  "unconnected member outputs must remain hidden even while their image is hovered or focused",
);
assert.doesNotMatch(
  styles,
  /\.canvas-gallery-member:focus-within(?:\s+\.canvas-gallery-member-(?:preview|output-port\.is-connected))?\s*[,{]/i,
  "click focus must not leave a gallery image permanently lifted or its ports visually activated",
);
assert.equal(
  typeof memberDragListeners.get("pointerenter"),
  "function",
  "hovering a gallery image must begin a connection-position sync while the image animates upward",
);
assert.equal(
  typeof memberDragListeners.get("pointerleave"),
  "function",
  "leaving a gallery image must keep syncing briefly so the line returns to its resting connection point",
);

const hoverSyncFrames = [];
let hoverSyncRenderCount = 0;
const hoverSyncContext = {
  performance: { now: () => 0 },
  requestAnimationFrame: (callback) => {
    hoverSyncFrames.push(callback);
    return hoverSyncFrames.length;
  },
  renderCanvasConnections: () => { hoverSyncRenderCount += 1; },
};
runInNewContext([
  "let canvasGalleryMemberHoverConnectionSyncFrame = 0;",
  "let canvasGalleryMemberHoverConnectionSyncUntil = 0;",
  extractFunction(script, "scheduleCanvasGalleryMemberHoverConnectionSync"),
].join("\n"), hoverSyncContext);
hoverSyncContext.scheduleCanvasGalleryMemberHoverConnectionSync();
assert.equal(hoverSyncFrames.length, 1, "a hover transition must schedule an animation-frame connection refresh");
hoverSyncFrames.shift()(16);
hoverSyncFrames.shift()(240);
assert.equal(hoverSyncRenderCount, 2, "connection positions must be refreshed throughout the member hover transition, including its final resting frame");

function createCanvasConnectionReleaseRuntime(targetNode) {
  const listeners = new Map();
  const connected = [];
  const menus = [];
  const source = {
    dataset: { id: "gallery" },
    classList: { contains: () => false, add: () => {}, remove: () => {} },
  };
  const runtime = {
    canvasState: {},
    document: {
      querySelectorAll: () => [],
      elementFromPoint: () => ({ closest: () => null }),
    },
    window: {
      addEventListener: (type, listener) => listeners.set(type, listener),
      removeEventListener: () => {},
    },
    getCanvasNodeOutput: () => ({ type: "image", url: "/output/member.png" }),
    setCanvasStatus: () => {},
    getCanvasPointFromClient: (x, y) => ({ x, y }),
    scheduleCanvasConnectionRender: () => {},
    findCanvasNodeAtClient: () => targetNode,
    resolveCanvasConnectionDropPort: () => "input",
    connectCanvasNodes: (...args) => connected.push(args),
    renderCanvasConnections: () => {},
    showCanvasConnectMenu: (...args) => menus.push(args),
  };
  runInNewContext(extractFunction(script, "startCanvasConnectionDrag"), runtime);
  runtime.startCanvasConnectionDrag(source, { clientX: 20, clientY: 30 }, "member-output:member-a");
  listeners.get("pointerup")({ clientX: 300, clientY: 220 });
  return { connected, menus };
}

const nodeRelease = createCanvasConnectionReleaseRuntime({ dataset: { id: "generator" } });
assert.deepEqual(
  JSON.parse(JSON.stringify(nodeRelease.connected)),
  [["gallery", "generator", "input", "member-output:member-a"]],
  "releasing a gallery-member connection over any target node must connect using that member output",
);
assert.equal(nodeRelease.menus.length, 0, "a target-node release must connect directly instead of opening a menu");

const blankRelease = createCanvasConnectionReleaseRuntime(null);
assert.deepEqual(JSON.parse(JSON.stringify(blankRelease.connected)), [], "a blank-canvas release must not create a phantom connection");
assert.deepEqual(
  JSON.parse(JSON.stringify(blankRelease.menus[0]?.slice(1))),
  ["gallery", { direction: "output", fromPort: "member-output:member-a" }],
  "a blank-canvas release must open the connect-node menu for the member output",
);

const mapped = interactionContext.cloneCanvasConnectionWithMappedNodes(
  { from: "source", fromPort: "member-output:b", to: "target", toPort: "member-input:b" },
  new Map([["source", "source-copy"], ["target", "target-copy"]]),
);
assert.deepEqual(JSON.parse(JSON.stringify(mapped)), {
  from: "source-copy",
  fromPort: "member-output:b",
  to: "target-copy",
  toPort: "member-input:b",
}, "copying connections must preserve both member handles");

const movedConnections = interactionContext.remapCanvasGalleryMemberConnections([
  { from: "source", fromPort: "member-output:b", to: "downstream", toPort: "input" },
  { from: "upstream", fromPort: "output", to: "source", toPort: "member-input:b" },
  { from: "source", fromPort: "member-output:missing", to: "other", toPort: "input" },
], "source", "b", { type: "container", id: "target" });
assert.deepEqual(JSON.parse(JSON.stringify(movedConnections)), [
  { id: "edge:target:member-output:b:downstream:input", from: "target", fromPort: "member-output:b", to: "downstream", toPort: "input" },
  { id: "edge:upstream:target:member-input:b", from: "upstream", fromPort: "output", to: "target", toPort: "member-input:b" },
  { from: "source", fromPort: "member-output:missing", to: "other", toPort: "input" },
], "moving a member into another container must redirect both member input and output connections only");
assert.deepEqual(
  JSON.parse(JSON.stringify(interactionContext.remapCanvasGalleryMemberConnections(movedConnections, "target", "b", { type: "image", id: "image" }))),
  [
    { id: "edge:image:downstream:input", from: "image", fromPort: "output", to: "downstream", toPort: "input" },
    { id: "edge:upstream:image:input", from: "upstream", fromPort: "output", to: "image", toPort: "input" },
    { from: "source", fromPort: "member-output:missing", to: "other", toPort: "input" },
  ],
  "detaching to an image must remove member-only handles from both directions",
);
assert.deepEqual(
  JSON.parse(JSON.stringify(interactionContext.remapCanvasGalleryMemberConnections(movedConnections, "target", "b", { type: "remove" }))),
  [{ from: "source", fromPort: "member-output:missing", to: "other", toPort: "input" }],
  "removing a member must clear its inbound and outbound member connections",
);

const imageToGalleryConnectionContext = {};
runInNewContext([
  extractFunction(script, "getCanvasConnectionId"),
  extractFunction(script, "remapCanvasImageNodeConnectionsToGalleryMember"),
].join("\n"), imageToGalleryConnectionContext);
assert.deepEqual(
  JSON.parse(JSON.stringify(imageToGalleryConnectionContext.remapCanvasImageNodeConnectionsToGalleryMember([
    { from: "image", fromPort: "output", to: "downstream", toPort: "input" },
    { from: "upstream", fromPort: "output", to: "image", toPort: "input" },
  ], "image", "gallery", "member-b"))),
  [
    { id: "edge:gallery:member-output:member-b:downstream:input", from: "gallery", fromPort: "member-output:member-b", to: "downstream", toPort: "input" },
    { id: "edge:upstream:gallery:input", from: "upstream", fromPort: "output", to: "gallery", toPort: "input" },
  ],
  "absorbing a connected image into a gallery must preserve outgoing member links and incoming gallery links",
);

const transferOperationContext = {
  cloneCanvasOperationValue: (value) => value && JSON.parse(JSON.stringify(value)),
};
runInNewContext(extractFunction(script, "createCanvasGalleryMemberTransferOperations"), transferOperationContext);
const previousMemberEdge = { id: "edge:source:member-output:b:downstream:input", from: "source", fromPort: "member-output:b", to: "downstream", toPort: "input" };
const remappedImageEdge = { id: "edge:image:output:downstream:input", from: "image", fromPort: "output", to: "downstream", toPort: "input" };
const transferOperations = transferOperationContext.createCanvasGalleryMemberTransferOperations([], [previousMemberEdge], [remappedImageEdge]);
assert.deepEqual(JSON.parse(JSON.stringify(transferOperations)), [
  { type: "connection.delete", entityId: previousMemberEdge.id, before: previousMemberEdge, after: null },
  { type: "connection.upsert", entityId: remappedImageEdge.id, before: null, after: remappedImageEdge },
], "member endpoint remaps must persist as a delete plus upsert instead of reusing a stale edge id");
const staleIdEndpointOperations = transferOperationContext.createCanvasGalleryMemberTransferOperations([], [previousMemberEdge], [{ ...remappedImageEdge, id: previousMemberEdge.id }]);
assert.equal(staleIdEndpointOperations.filter((operation) => operation.type === "connection.delete").length, 1, "endpoint changes must delete the prior edge even if an old id is accidentally retained");
assert.equal(staleIdEndpointOperations.filter((operation) => operation.type === "connection.upsert").length, 1, "endpoint changes must upsert the remapped edge even if an old id is accidentally retained");
const undoOperations = [];
const undoStages = [];
const undoOperationContext = {
  cloneCanvasOperationValue: (value) => value && JSON.parse(JSON.stringify(value)),
  recordCanvasUndo: (command) => undoOperations.push(command),
  stageCanvasOperation: (operation) => undoStages.push(operation),
};
runInNewContext(extractFunction(script, "recordCanvasGalleryMemberTransferUndo"), undoOperationContext);
undoOperationContext.recordCanvasGalleryMemberTransferUndo({ label: "重映射成员连线", forward: transferOperations });
assert.deepEqual(JSON.parse(JSON.stringify(undoStages)), JSON.parse(JSON.stringify(transferOperations)), "remapped edge persistence must stage the generated delete and upsert payloads");
assert.deepEqual(JSON.parse(JSON.stringify(undoOperations[0].inverse)), [
  { type: "connection.delete", entityId: remappedImageEdge.id, before: remappedImageEdge, after: null },
  { type: "connection.upsert", entityId: previousMemberEdge.id, before: null, after: previousMemberEdge },
], "undo must restore the original member endpoint and remove the remapped image edge");

const imageNode = {
  dataset: { id: "image", imageName: "独立图片" },
  classList: { contains: (name) => name === "canvas-node-image" },
  querySelector: () => ({
    naturalWidth: 943,
    naturalHeight: 1667,
    dataset: {},
    getAttribute: () => "",
  }),
};
const targetContainerNode = {
  dataset: { id: "gallery" },
  classList: { contains: (name) => name === "canvas-node-gallery-container" },
};
let targetContainer = { title: "目标图集", members: [{ id: "a", src: "/output/a.png" }] };
let removedImageIds = [];
let recordedImageTransfer = null;
let imageTransferStatus = "";
const imageTransferContext = {
  canvasState: { connections: [], selectedIds: new Set(["image"]), activeNode: imageNode },
  cloneCanvasOperationValue: (value) => value && JSON.parse(JSON.stringify(value)),
  getCanvasNodeOutput: () => ({ type: "image", url: "/output/b.png", name: "B" }),
  toCanvasOperationNode: (value) => value,
  syncCanvasNodeModel: (node) => ({ id: node.dataset.id }),
  serializeCanvasNode: (node) => ({ id: node.dataset.id }),
  getCanvasGalleryContainer: () => targetContainer,
  appendCanvasGalleryMember: (container, image) => ({ ...container, members: [...container.members, { ...image, id: "b" }] }),
  setCanvasGalleryContainer: (_node, value) => { targetContainer = value; },
  document: { querySelectorAll: () => [] },
  removeCanvasNodeModels: (ids) => { removedImageIds = [...ids]; },
  recordCanvasGalleryMemberTransferUndo: (value) => { recordedImageTransfer = value; },
  updateCanvasGroupCounts: () => {},
  updateCanvasSelectionFrame: () => {},
  refreshCanvasConnectedNodes: () => {},
  scheduleCanvasConnectionRender: () => {},
  scheduleCanvasSave: () => {},
  setCanvasStatus: (value) => { imageTransferStatus = value; },
};
runInNewContext([
  extractFunction(script, "getCanvasConnectionId"),
  extractFunction(script, "normalizeVisibleCanvasConnection"),
  extractFunction(script, "getCanvasImageIntrinsicDimensions"),
  extractFunction(script, "findCanvasReusableImage"),
  extractFunction(script, "remapCanvasImageNodeConnectionsToGalleryMember"),
  extractFunction(script, "createCanvasGalleryMemberTransferOperations"),
  extractFunction(script, "transferCanvasImageNodeToGallery"),
].join("\n"), imageTransferContext);
assert.equal(imageTransferContext.transferCanvasImageNodeToGallery(imageNode, targetContainerNode), true);
assert.equal(targetContainer.members.length, 2, "a dropped unconnected image must be appended to the target container");
assert.deepEqual(
  JSON.parse(JSON.stringify(targetContainer.members.at(-1))),
  { id: "b", src: "/output/b.png", savedUrl: "/output/b.png", name: "B", width: 943, height: 1667, createdAt: "" },
  "a dropped portrait image must carry its intrinsic dimensions into the gallery before the first render",
);
assert.deepEqual(removedImageIds, ["image"], "a dropped unconnected image must be removed as a standalone node");
assert.equal(recordedImageTransfer.forward.length, 2, "append and source deletion must share one undoable operation");
assert.match(imageTransferStatus, /收纳到图集/);

targetContainer = { title: "目标图集", members: [] };
removedImageIds = [];
recordedImageTransfer = null;
imageTransferStatus = "";
imageTransferContext.canvasState.connections = [{ from: "image", to: "other" }];
assert.equal(imageTransferContext.transferCanvasImageNodeToGallery(imageNode, targetContainerNode), true);
assert.equal(targetContainer.members.length, 1, "a connected image must be absorbed as a gallery member");
assert.deepEqual(removedImageIds, ["image"], "a connected image must be removed only after its connections are remapped");
assert.deepEqual(
  JSON.parse(JSON.stringify(imageTransferContext.canvasState.connections)),
  [{ id: "edge:gallery:member-output:b:other:input", from: "gallery", fromPort: "member-output:b", to: "other" }],
  "a connected image's outgoing edge must follow its new gallery-member output",
);
assert.equal(recordedImageTransfer.forward.filter((operation) => operation.type.startsWith("connection.")).length, 2, "remapping a connected image must persist the old edge deletion and new member edge together");
assert.match(imageTransferStatus, /收纳到图集/);

const sourceContainerNode = {
  dataset: { id: "source", x: "100", y: "200", width: "148" },
  offsetWidth: 148,
  classList: { contains: (name) => name === "canvas-node-gallery-container" },
};
const detachedImageNode = { dataset: { id: "detached" } };
let sourceContainer = { title: "来源图集", members: [{ id: "b", src: "/output/b.png", name: "B" }] };
let detachedImageArgs = null;
let recordedMemberTransfer = null;
const memberTransferContext = {
  canvasState: { connections: [{ from: "source", fromPort: "member-output:b", to: "downstream", toPort: "input" }] },
  toCanvasOperationNode: (value) => value,
  syncCanvasNodeModel: (node) => ({ id: node.dataset.id }),
  serializeCanvasNode: (node) => ({ id: node.dataset.id }),
  getCanvasGalleryContainer: () => sourceContainer,
  detachCanvasGalleryMember: (_node, memberId, point) => ({
    detached: sourceContainer.members.find((item) => item.id === memberId),
    container: { ...sourceContainer, members: [] },
    point,
  }),
  setCanvasGalleryContainer: (_node, value) => { sourceContainer = value; },
  addCanvasImage: (src, name, point) => {
    detachedImageArgs = { src, name, point };
    return detachedImageNode;
  },
  ensureCanvasImageNodeInputPort: () => {},
  remapCanvasGalleryMemberConnections: (connections, _sourceId, _memberId, destination) => connections.map((connection) => ({
    ...connection,
    from: destination.id,
    fromPort: "output",
  })),
  normalizeVisibleCanvasConnection: (value) => value,
  createCanvasGalleryMemberTransferOperations: (nodes, before, after) => ({ nodes, before, after }),
  recordCanvasGalleryMemberTransferUndo: (value) => { recordedMemberTransfer = value; },
  refreshCanvasConnectedNodes: () => {},
  scheduleCanvasConnectionRender: () => {},
  scheduleCanvasSave: () => {},
  setCanvasStatus: () => {},
};
runInNewContext([
  extractFunction(script, "getCanvasImageIntrinsicDimensions"),
  extractFunction(script, "findCanvasReusableImage"),
  extractFunction(script, "transferCanvasGalleryContainerMember"),
].join("\n"), memberTransferContext);
assert.equal(memberTransferContext.transferCanvasGalleryContainerMember(sourceContainerNode, "b", { point: { x: 700, y: 300 } }), detachedImageNode);
assert.equal(sourceContainer.members.length, 0, "dragging a member to the canvas must remove it from its source container");
assert.deepEqual(detachedImageArgs, { src: "/output/b.png", name: "B", point: { x: 700, y: 300 } });
assert.deepEqual(memberTransferContext.canvasState.connections, [
  { from: "detached", fromPort: "output", to: "downstream", toPort: "input" },
], "dragging a member to the canvas must preserve its downstream connection on the new image node");
assert.ok(recordedMemberTransfer, "member detach must record an undoable operation");

const failedDetachNode = {
  dataset: { id: "failed-source", x: "40", y: "80", width: "148" },
  offsetWidth: 148,
  classList: { contains: (name) => name === "canvas-node-gallery-container" },
};
let failedDetachContainer = { title: "失败来源", members: [{ id: "b", src: "/output/b.png", name: "B" }] };
let failedDetachUndo = null;
let failedDetachStatus = "";
const failedDetachContext = {
  canvasState: { connections: [{ id: "edge:source:member-output:b:downstream:input", from: "failed-source", fromPort: "member-output:b", to: "downstream", toPort: "input" }] },
  toCanvasOperationNode: (value) => value,
  syncCanvasNodeModel: (node) => ({ id: node.dataset.id }),
  serializeCanvasNode: (node) => ({ id: node.dataset.id }),
  getCanvasGalleryContainer: () => failedDetachContainer,
  detachCanvasGalleryMember: (_node, memberId, point) => ({ detached: failedDetachContainer.members.find((item) => item.id === memberId), container: { ...failedDetachContainer, members: [] }, point }),
  setCanvasGalleryContainer: (_node, value) => { failedDetachContainer = value; },
  addCanvasImage: () => null,
  normalizeVisibleCanvasConnection: (value) => value,
  recordCanvasGalleryMemberTransferUndo: (value) => { failedDetachUndo = value; },
  refreshCanvasConnectedNodes: () => {},
  scheduleCanvasConnectionRender: () => {},
  scheduleCanvasSave: () => {},
  setCanvasStatus: (value) => { failedDetachStatus = value; },
};
runInNewContext([
  extractFunction(script, "getCanvasImageIntrinsicDimensions"),
  extractFunction(script, "findCanvasReusableImage"),
  extractFunction(script, "transferCanvasGalleryContainerMember"),
].join("\n"), failedDetachContext);
assert.equal(failedDetachContext.transferCanvasGalleryContainerMember(failedDetachNode, "b", { point: { x: 400, y: 300 } }), null);
assert.equal(failedDetachContainer.members.length, 1, "a failed detached-image creation must restore the source member");
assert.equal(failedDetachContext.canvasState.connections.length, 1, "a failed detached-image creation must leave member connections intact");
assert.equal(failedDetachUndo, null, "a failed detached-image creation must not record undo or persistence operations");
assert.match(failedDetachStatus, /无法创建/);

let ensuredInputPort = false;
memberTransferContext.ensureCanvasImageNodeInputPort = (node) => {
  assert.equal(node, detachedImageNode);
  ensuredInputPort = true;
};
memberTransferContext.canvasState.connections = [{ from: "upstream", fromPort: "output", to: "source", toPort: "member-input:b" }];
sourceContainer = { title: "来源图集", members: [{ id: "b", src: "/output/b.png", name: "B" }] };
recordedMemberTransfer = null;
assert.equal(memberTransferContext.transferCanvasGalleryContainerMember(sourceContainerNode, "b", { point: { x: 700, y: 300 } }), detachedImageNode);
assert.equal(ensuredInputPort, true, "an inbound member connection must make the detached image mount an input port before refresh");

const dragImageNode = {
  dataset: { id: "drag-image", x: "10", y: "20" },
  classList: { contains: (name) => name === "canvas-node-image" || name === "is-selected" },
};
const dragGalleryNode = {
  dataset: { id: "drag-gallery" },
  classList: { contains: (name) => name === "canvas-node-gallery-container" },
};
const dragListeners = new Map();
const dragUndo = [];
const dragStages = [];
let sourceWasRemoved = false;
const dragContext = {
  canvasState: { scale: 1 },
  window: {
    addEventListener: (type, listener) => dragListeners.set(type, listener),
    removeEventListener: (type) => dragListeners.delete(type),
  },
  getSelectedCanvasNodes: () => [dragImageNode],
  getCanvasDragNodes: (nodes) => nodes,
  toCanvasOperationNode: (value) => value,
  syncCanvasNodeModel: (node) => {
    if (sourceWasRemoved && node === dragImageNode) throw new Error("deleted source must not be serialized after gallery transfer");
    return { id: node.dataset.id, x: Number(node.dataset.x), y: Number(node.dataset.y) };
  },
  serializeCanvasNode: (node) => ({ id: node.dataset.id }),
  findCanvasNodeAtClient: () => dragGalleryNode,
  transferCanvasImageNodeToGallery: () => {
    sourceWasRemoved = true;
    const forward = [
      { type: "node.upsert", entityId: "drag-gallery", before: { id: "drag-gallery", galleryContainer: { members: [] } }, after: { id: "drag-gallery", galleryContainer: { members: [{ id: "drag-image" }] } } },
      { type: "node.delete", entityId: "drag-image", before: { id: "drag-image", imageSrc: "/output/drag.png" }, after: null },
    ];
    dragUndo.push({ label: "拖入图集", forward });
    dragStages.push(...forward);
    return true;
  },
  updateCanvasNodePosition: () => {},
  updateCanvasGroupMembership: () => {},
  recordCanvasUndo: (command) => dragUndo.push(command),
  stageCanvasOperation: (operation) => dragStages.push(operation),
  sameCanvasOperationValue: () => false,
  scheduleCanvasSave: () => {},
  selectCanvasNode: () => {},
};
runInNewContext(extractFunction(script, "beginCanvasNodeDrag"), dragContext);
dragContext.beginCanvasNodeDrag({ button: 0, clientX: 10, clientY: 20, target: { closest: () => null }, preventDefault: () => {}, stopPropagation: () => {} }, dragImageNode);
assert.doesNotThrow(() => dragListeners.get("pointerup")({ clientX: 400, clientY: 300 }));
assert.equal(dragUndo.length, 1, "a successful image-to-gallery drop must not append a generic move undo command");
assert.deepEqual(JSON.parse(JSON.stringify(dragStages)), JSON.parse(JSON.stringify(dragUndo[0].forward)), "the real pointerup path must preserve exactly the gallery transfer operation payload");
assert.deepEqual(JSON.parse(JSON.stringify(dragUndo[0].forward)), [
  { type: "node.upsert", entityId: "drag-gallery", before: { id: "drag-gallery", galleryContainer: { members: [] } }, after: { id: "drag-gallery", galleryContainer: { members: [{ id: "drag-image" }] } } },
  { type: "node.delete", entityId: "drag-image", before: { id: "drag-image", imageSrc: "/output/drag.png" }, after: null },
], "the real pointerup path must keep the atomic append/delete payload without reviving the source as a move operation");

let virtualPortModel = {
  width: 148,
  height: 198,
  galleryContainer: { members: [{ id: "a" }], columns: 1 },
};
const virtualPortContext = {
  getCanvasNodeModel: () => virtualPortModel,
  canvasVirtualStore: {
    getRect: () => ({ left: 10, top: 20, right: Number(virtualPortModel.width || 148) + 10, bottom: Number(virtualPortModel.height || 198) + 20 }),
  },
};
runInNewContext([
  extractFunction(script, "suggestedCanvasGalleryContainerColumns"),
  extractFunction(script, "getCanvasGalleryFreeGridLayout"),
  extractFunction(script, "getCanvasImageContentRect"),
  extractFunction(script, "getCanvasModelPortPoint"),
].join("\n"), virtualPortContext);
assert.equal(
  virtualPortContext.getCanvasModelPortPoint("gallery", "member-output:missing"),
  null,
  "an unknown virtual member handle must not silently render from the first row",
);
virtualPortModel = {
  width: 288,
  height: 600,
  galleryContainer: {
    layoutMode: "manual",
    members: Array.from({ length: 5 }, (_, index) => ({ id: `virtual-${index}`, width: 1000, height: 1000 })),
  },
};
assert.deepEqual(
  JSON.parse(JSON.stringify(virtualPortContext.getCanvasModelPortPoint("gallery", "member-output:virtual-4"))),
  { x: 298, y: 501 },
  "an unmounted member connection must use the adaptive grid row that matches its rendered thumbnail",
);

let directPort;
const directPortNode = {
  dataset: { x: "100", y: "200" },
  querySelectorAll: () => [directPort],
  querySelector: () => null,
};
directPort = {
  dataset: { canvasPort: "output" },
  offsetParent: directPortNode,
  offsetLeft: 200,
  offsetTop: 50,
  offsetWidth: 16,
  offsetHeight: 16,
  getBoundingClientRect: () => ({ left: 300, top: 242, width: 16, height: 16 }),
};
let memberPort;
const memberPortNode = {
  dataset: { x: "100", y: "200" },
  querySelectorAll: () => [memberPort],
  querySelector: () => null,
};
memberPort = {
  dataset: { canvasPort: "member-output:b" },
  offsetParent: {},
  offsetLeft: 100,
  offsetTop: 50,
  offsetWidth: 12,
  offsetHeight: 12,
  getBoundingClientRect: () => ({ left: 310, top: 220, width: 12, height: 12 }),
};
const domPortContext = {
  document: { querySelector: () => ({ getBoundingClientRect: () => ({ left: 0, top: 0 }) }) },
  screenToCanvas: (x, y) => ({ x, y }),
};
runInNewContext(extractFunction(script, "getCanvasPortPoint"), domPortContext);
assert.deepEqual(
  JSON.parse(JSON.stringify(domPortContext.getCanvasPortPoint(directPortNode, "output"))),
  { x: 308, y: 250 },
  "a transformed direct port must use its visual center for the connection line",
);
assert.deepEqual(
  JSON.parse(JSON.stringify(domPortContext.getCanvasPortPoint(memberPortNode, "member-output:b"))),
  { x: 316, y: 226 },
  "a nested member port must use its real image-relative screen position",
);
const zeroSizePortNode = {
  dataset: { x: "100", y: "200" },
  querySelectorAll: () => [{
    dataset: { canvasPort: "output" },
    offsetParent: null,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
  }],
  querySelector: () => null,
};
assert.equal(
  domPortContext.getCanvasPortPoint(zeroSizePortNode, "output"),
  null,
  "a transient zero-size port rect must not become a canvas endpoint at the origin",
);

const connectionPortPointContext = {
  canvasState: { activeBoardId: "board", isRestoring: false },
  canvasVirtualStore: { getRevision: () => 1 },
  canvasConnectionPortPointCache: new Map(),
  CANVAS_CONNECTION_PORT_CACHE_LIMIT: 10,
  getCanvasNode: () => ({ dataset: { id: "node" } }),
  getCanvasPortPoint: () => ({ x: 292, y: 170 }),
  getCanvasModelPortPoint: () => ({ x: 320, y: 170 }),
};
runInNewContext(extractFunction(script, "getCanvasConnectionPortPoint"), connectionPortPointContext);
assert.deepEqual(
  JSON.parse(JSON.stringify(connectionPortPointContext.getCanvasConnectionPortPoint("node", "output"))),
  { x: 292, y: 170 },
  "a mounted connection endpoint must follow the responsive DOM port instead of the saved model width",
);
connectionPortPointContext.canvasState.isRestoring = true;
assert.deepEqual(
  JSON.parse(JSON.stringify(connectionPortPointContext.getCanvasConnectionPortPoint("node", "output"))),
  { x: 320, y: 170 },
  "a restoring board must keep the stable model endpoint until DOM layout is complete",
);
connectionPortPointContext.canvasState.isRestoring = false;
assert.deepEqual(
  JSON.parse(JSON.stringify(connectionPortPointContext.getCanvasConnectionPortPoint("node", "output"))),
  { x: 292, y: 170 },
  "the model fallback cached during restore must not outlive the restore state",
);
connectionPortPointContext.canvasVirtualStore.getRevision = () => 2;
connectionPortPointContext.getCanvasPortPoint = () => null;
assert.deepEqual(
  JSON.parse(JSON.stringify(connectionPortPointContext.getCanvasConnectionPortPoint("node", "output"))),
  { x: 320, y: 170 },
  "an unmounted connection endpoint must still fall back to model geometry",
);

assert.ok(extractFunction(script, "getCanvasNodeOutput").includes("canvas-node-gallery-container"));
assert.ok(extractFunction(script, "getCanvasIncomingItems").includes("item.fromPort"));
assert.ok(extractFunction(script, "startCanvasConnectionDrag").includes("fromPort"));
assert.ok(extractFunction(script, "startCanvasConnectionDrag").includes("resolveCanvasConnectionDropPort"));
assert.ok(extractFunction(script, "startCanvasInputConnectionDrag").includes("resolveCanvasConnectionDropPort"));
assert.ok(extractFunction(script, "pasteCanvasNodes").includes("cloneCanvasConnectionWithMappedNodes"));
assert.ok(extractFunction(script, "duplicateAgentCanvasNodes").includes("cloneCanvasConnectionWithMappedNodes"));
assert.ok(extractFunction(script, "appendCanvasGenerationToGallery").includes("getCanvasGalleryContainerMembers"));
assert.ok(extractFunction(script, "createCanvasGridSliceGallery").includes("createCanvasGalleryContainerWithSourceConnection"));
assert.ok(extractFunction(script, "createCanvasGridSliceGallery").includes("getCanvasGalleryFreeGridLayout"), "new sliced galleries must place themselves with the same adaptive dimensions they render at");
assert.ok(extractFunction(script, "createCanvasCropResultContainer").includes("getCanvasGalleryFreeGridLayout"), "saved crop galleries must reserve their adaptive grid bounds before placement");
assert.match(extractFunction(script, "openCanvasCropWorkbench"), /getCanvasCropWorkbenchSource\(/, "the shared crop workbench must resolve both gallery members and ordinary image nodes");
assert.doesNotMatch(extractFunction(script, "openCanvasCropWorkbench"), /仅支持图集中的单张图片/, "ordinary image nodes must no longer be rejected by the shared crop workbench");
assert.doesNotMatch(extractFunction(galleryRenderer, "render"), /canvas-gallery-container-crop/, "the gallery header must not contain an ambiguous crop action");
assert.match(extractFunction(script, "showCanvasImageMenu"), /memberId/, "the image menu must remember which gallery member was right-clicked");
assert.match(extractFunction(script, "initializeCanvasBoard"), /canvas-gallery-member/, "right-clicking a gallery member must open the image action menu for that exact member");
assert.match(extractFunction(script, "cropAgentCanvasImage"), /await openCanvasCropWorkbench\(sourceNode\)/, "agent-initiated ordinary-image cropping must use the same workbench as the right-click menu");
assert.ok(extractFunction(script, "transferCanvasGalleryContainerMember").includes("detachCanvasGalleryMember"));
assert.ok(extractFunction(script, "bindCanvasGalleryContainerMemberDrag").includes("transferCanvasGalleryContainerMember"));
assert.ok(extractFunction(galleryRenderer, "render").includes("bindCanvasGalleryContainerMemberDrag"));
assert.match(extractFunction(script, "beginCanvasNodeResize"), /getCanvasGalleryContainerSizeForRequest\(/, "gallery resizing must use the same clamped free-grid layout as rendering");
assert.match(extractFunction(script, "beginCanvasNodeResize"), /if \(isGallery\) \{[\s\S]*?node\.dataset\.height = String\(next\.height\)/, "gallery resizing must persist the content-fitted height calculated by the shared layout");
assert.match(extractFunction(script, "beginCanvasNodeResize"), /let galleryResizeAxis = ""/, "a gallery resize must keep one direction for the duration of a drag");
assert.match(extractFunction(script, "beginCanvasNodeResize"), /if \(!galleryResizeAxis\) \{[\s\S]*?galleryResizeAxis = Math\.abs\(deltaY\) > Math\.abs\(deltaX\) \? "height" : "width"/, "the initial meaningful pointer movement must lock a vertical or horizontal gallery reflow direction");
assert.match(extractFunction(script, "beginCanvasNodeResize"), /manualColumns: next\.layout\.columns/, "the column count selected during a resize must persist through later renders");
assert.match(extractFunction(script, "beginCanvasNodeResize"), /getCanvasGalleryMinimumWidthForColumns\(galleryManualColumns/, "horizontal gallery shrinking must respect the current column layout instead of collapsing to one column at the generic minimum width");
assert.ok(extractFunction(script, "beginCanvasNodeDrag").includes("transferCanvasImageNodeToGallery"), "image-node drops must handle gallery containers");
assert.ok(extractFunction(script, "transferCanvasImageNodeToGallery").includes("remapCanvasImageNodeConnectionsToGalleryMember"), "connected image drops must preserve their links through a gallery-member endpoint remap");
assert.ok(extractFunction(script, "getCanvasModelPortPoint").includes('startsWith("member-output:")'));
assert.ok(extractFunction(script, "getCanvasModelPortPoint").includes("return null"), "unknown member ports must not fall back to row one");

const thumbnailContext = {
  document: { createElement: () => ({}) },
  window: {},
};
runInNewContext(extractFunction(script, "createDeferredThumbnail"), thumbnailContext);
const deferred = thumbnailContext.createDeferredThumbnail("/output/original.png", "test", { allowOriginalFallback: false });
assert.equal(deferred.src, undefined, "without an image resource manager, a no-fallback thumbnail must not load the original");

function createAtomicCropGalleryRuntime(compatibility = { ok: true, message: "" }) {
  const undo = [];
  const staged = [];
  const created = [];
  const persisted = { nodes: new Map(), connections: new Map() };
  const source = {
    dataset: { id: "crop-source" },
    classList: { contains: (name) => name === "canvas-node" },
  };
  const context = {
    canvasState: { connections: [], pendingConnection: null },
    addCanvasGalleryContainer: (point, options) => {
      const node = {
        dataset: { id: "crop-result", x: String(point.x), y: String(point.y) },
        classList: { contains: (name) => name === "canvas-node-gallery-container" },
        options,
        removed: false,
        remove() { this.removed = true; },
      };
      created.push(node);
      return node;
    },
    getCanvasNodeOutput: () => ({ type: "images", images: [{ url: "/output/source.png" }] }),
    getCanvasPortPoint: () => ({ x: 0, y: 0 }),
    getCanvasConnectionCompatibility: () => compatibility,
    normalizeVisibleCanvasConnection: (connection) => ({
      ...connection,
      id: `edge:${connection.from}:${connection.fromPort}:${connection.to}:${connection.toPort}`,
    }),
    toCanvasOperationNode: (value) => JSON.parse(JSON.stringify(value)),
    syncCanvasNodeModel: (node) => ({
      id: node.dataset.id,
      kind: "gallery-container",
      x: Number(node.dataset.x),
      y: Number(node.dataset.y),
      galleryContainer: node.options,
    }),
    serializeCanvasNode: () => null,
    cloneCanvasOperationValue: (value) => value && JSON.parse(JSON.stringify(value)),
    recordCanvasUndo: (command) => undo.push(command),
    stageCanvasOperation: (operation) => {
      staged.push(operation);
      const collection = operation.type.startsWith("node") ? persisted.nodes : persisted.connections;
      if (operation.after) collection.set(operation.entityId, operation.after);
      else collection.delete(operation.entityId);
    },
    removeCanvasNodeModels: () => {},
    updateCanvasNodeRefs: () => {},
    syncCanvasTextFromLlmInputs: () => {},
    renderCanvasConnections: () => {},
    setCanvasStatus: () => {},
    scheduleCanvasConnectionRender: () => {},
    scheduleCanvasSave: () => { context.saveCalls += 1; },
    document: { querySelectorAll: () => [] },
  };
  runInNewContext(extractFunction(script, "createCanvasGalleryContainerWithSourceConnection"), context);
  context.saveCalls = 0;
  return Object.assign(context, { source, undo, staged, created, persisted });
}

const atomicCrop = createAtomicCropGalleryRuntime();
const atomicGallery = atomicCrop.createCanvasGalleryContainerWithSourceConnection(
  atomicCrop.source,
  { x: 300, y: 200 },
  { title: "裁切图集", members: [{ id: "r1c1", savedUrl: "/output/1.png" }] },
  { label: "创建裁切图集" },
);
assert.equal(atomicGallery.dataset.id, "crop-result");
assert.equal(atomicCrop.undo.length, 1, "one crop result must record one atomic undo command");
assert.deepEqual(
  JSON.parse(JSON.stringify(atomicCrop.undo[0].forward.map((operation) => operation.type))),
  ["node.upsert", "connection.upsert"],
  "the atomic forward command must include the result container and its source-to-result connection",
);
assert.equal(atomicCrop.staged.length, 2, "the atomic result must stage one node and one connection together");
assert.equal(atomicCrop.saveCalls, 1, "the atomic result must schedule one persisted batch");
assert.equal(atomicCrop.persisted.nodes.size, 1);
assert.equal(atomicCrop.persisted.connections.size, 1);
assert.deepEqual(
  JSON.parse(JSON.stringify(atomicCrop.undo[0].inverse.map((operation) => operation.type))),
  ["connection.delete", "node.delete"],
  "undo must remove the connection before removing its result container",
);
atomicCrop.undo[0].inverse.forEach((operation) => atomicCrop.stageCanvasOperation(operation));
assert.equal(atomicCrop.persisted.nodes.size, 0, "undo must remove the result container in the same command");
assert.equal(atomicCrop.persisted.connections.size, 0, "undo must remove the source-to-result connection in the same command");
const rejectedAtomicCrop = createAtomicCropGalleryRuntime({ ok: false, message: "来源不支持连接" });
assert.throws(
  () => rejectedAtomicCrop.createCanvasGalleryContainerWithSourceConnection(
    rejectedAtomicCrop.source,
    { x: 300, y: 200 },
    { title: "裁切图集", members: [] },
  ),
  /来源不支持连接/,
);
assert.equal(rejectedAtomicCrop.created[0].removed, true, "a rejected source-to-result connection must remove its newly created container");
assert.equal(rejectedAtomicCrop.undo.length, 0, "a rejected connection must not create a partial undo command");
assert.equal(rejectedAtomicCrop.staged.length, 0, "a rejected connection must not stage a partial operation");
assert.equal(rejectedAtomicCrop.saveCalls, 0, "a rejected connection must not schedule a partial save");
assert.equal(rejectedAtomicCrop.canvasState.connections.length, 0, "a rejected connection must not mutate visible connections");
assert.ok(extractFunction(script, "createCanvasCropResultContainer").includes("createCanvasGalleryContainerWithSourceConnection"));
assert.ok(extractFunction(script, "createCanvasGridSliceGallery").includes("createCanvasGalleryContainerWithSourceConnection"));

function createCropResultRuntime(persistImpl) {
  return new Function("persistImpl", `
    const created = [];
    const connections = [];
    async function persistCanvasGridCrops(...args) { return persistImpl(...args); }
    function assertCanvasCropPersistenceComplete(crops, persisted) {
      if (!Array.isArray(crops) || !crops.length || !Array.isArray(persisted) || persisted.length !== crops.length) throw new Error("裁切保存不完整，未创建图集。");
      const outOfOrder = persisted.find((member, index) => !member?.id || !member?.savedUrl || String(member.row ?? "") !== String(crops[index]?.row ?? "") || String(member.column ?? "") !== String(crops[index]?.column ?? ""));
      if (outOfOrder) throw new Error("裁切保存顺序不一致，未创建图集。");
      return persisted;
    }
    function getCanvasGalleryFreeGridLayout() { return { width: 320, minHeight: 360 }; }
    function findCanvasGridImageBlockPoint(sourceNode) {
      return { x: Number(sourceNode.dataset.x) + Number(sourceNode.dataset.width) + 90, y: Number(sourceNode.dataset.y) };
    }
    function addCanvasGalleryContainer(point, options) {
      const node = {
        dataset: { id: "crop-result", kind: "gallery-container", x: String(point.x), y: String(point.y) },
        classList: { contains: (name) => name === "canvas-node" || name === "canvas-node-gallery-container" },
        container: options,
      };
      created.push(node);
      return node;
    }
    function createCanvasGalleryContainerWithSourceConnection(sourceNode, point, options) {
      const gallery = addCanvasGalleryContainer(point, options);
      connections.push([sourceNode.dataset.id, gallery.dataset.id, "input", "output"]);
      return gallery;
    }
    function applyCanvasNodeSize() {}
    function selectCanvasNode() {}
    function scheduleCanvasConnectionRender() {}
    function scheduleCanvasSave() {}
    function connectCanvasNodes(...args) { connections.push(args); }
    function createCanvasGridSliceGallery() { return { dataset: { kind: "legacy-gallery" } }; }
    async ${extractFunction(script, "createCanvasCropResultContainer")}
    return { createCanvasCropResultContainer, created, connections };
  `)(persistImpl);
}

assert.notEqual(script.indexOf("function findCanvasGridImageBlockPoint("), -1, "crop gallery placement must use the shared collision-aware right-side finder");
const cropPlacementContext = {
  document: {
    querySelectorAll: () => [{ dataset: { x: "338", y: "200", width: "320", height: "360" } }],
  },
  getCanvasNodeBox: (node) => ({
    left: Number(node.dataset.x),
    top: Number(node.dataset.y),
    right: Number(node.dataset.x) + Number(node.dataset.width),
    bottom: Number(node.dataset.y) + Number(node.dataset.height),
  }),
};
runInNewContext(extractFunction(script, "findCanvasGridImageBlockPoint"), cropPlacementContext);
assert.deepEqual(
  JSON.parse(JSON.stringify(cropPlacementContext.findCanvasGridImageBlockPoint({ dataset: { x: "100", y: "200", width: "148" } }, 320, 360))),
  { x: 338, y: 608 },
  "right-side crop placement must skip a colliding node instead of overlapping it",
);

const cropSource = {
  dataset: { id: "crop-source", x: "100", y: "200", width: "148", galleryContainer: "source-unchanged" },
  classList: { contains: (name) => name === "canvas-node" || name === "canvas-node-gallery-container" },
};
const cropMember = { id: "source-member", name: "来源.png" };
const requestedCrops = [
  { row: 1, column: 1, x: 0, y: 0, width: 100, height: 100 },
  { row: 1, column: 2, x: 100, y: 0, width: 100, height: 100 },
];

(async () => {
  const sourceBeforeSuccess = JSON.stringify(cropSource.dataset);
  const successful = createCropResultRuntime(async () => [
    { id: "r1c1", row: 1, column: 1, savedUrl: "/output/1.png" },
    { id: "r1c2", row: 1, column: 2, savedUrl: "/output/2.png" },
  ]);
  const created = await successful.createCanvasCropResultContainer(cropSource, cropMember, requestedCrops, "grid", { image: {} });
  assert.equal(created.dataset.kind, "gallery-container");
  assert.deepEqual(created.container.members.map((item) => item.id), ["r1c1", "r1c2"], "crop members must retain requested row/column order");
  assert.equal(created.container.title, "裁切图集");
  assert.ok(Number(created.dataset.x) > Number(cropSource.dataset.x), "crop results must be placed to the right of the source");
  assert.deepEqual(successful.connections, [["crop-source", "crop-result", "input", "output"]], "crop result containers must connect from the source's default whole-gallery output, not a member handle");
  assert.equal(JSON.stringify(cropSource.dataset), sourceBeforeSuccess, "creating a result container must not mutate the source node");

  const free = createCropResultRuntime(async () => [{ id: "free", row: 1, column: 1, savedUrl: "/output/free.png" }]);
  const freeCreated = await free.createCanvasCropResultContainer(cropSource, cropMember, [requestedCrops[0]], "free", { image: {} });
  assert.equal(freeCreated.container.title, "裁切结果", "ratio and free crop outputs must not be labeled as a grid");

  const sourceBeforeFailure = JSON.stringify(cropSource.dataset);
  const persistFailure = createCropResultRuntime(async () => { throw new Error("upload failed"); });
  await assert.rejects(
    () => persistFailure.createCanvasCropResultContainer(cropSource, cropMember, requestedCrops, "grid", { image: {} }),
    /upload failed/,
  );
  assert.equal(persistFailure.created.length, 0, "a partial upload failure must not insert a result DOM node");
  assert.equal(persistFailure.connections.length, 0, "a partial upload failure must not insert a connection");
  assert.equal(JSON.stringify(cropSource.dataset), sourceBeforeFailure, "a partial upload failure must not mutate the source");

  const incomplete = createCropResultRuntime(async () => [{ id: "r1c1", row: 1, column: 1, savedUrl: "/output/1.png" }]);
  await assert.rejects(
    () => incomplete.createCanvasCropResultContainer(cropSource, cropMember, requestedCrops, "grid", { image: {} }),
    /裁切保存不完整/,
  );
  assert.equal(incomplete.created.length, 0, "an incomplete persisted array must not insert a result DOM node");
  assert.equal(incomplete.connections.length, 0, "an incomplete persisted array must not insert a connection");
  assert.equal(JSON.stringify(cropSource.dataset), sourceBeforeFailure, "an incomplete persisted array must not mutate the source");

  const reordered = createCropResultRuntime(async () => [
    { id: "r1c2", row: 1, column: 2, savedUrl: "/output/2.png" },
    { id: "r1c1", row: 1, column: 1, savedUrl: "/output/1.png" },
  ]);
  await assert.rejects(
    () => reordered.createCanvasCropResultContainer(cropSource, cropMember, requestedCrops, "grid", { image: {} }),
    /裁切保存顺序不一致/,
  );
  assert.equal(reordered.created.length, 0, "a reordered persisted array must not insert a result DOM node");
  assert.equal(reordered.connections.length, 0, "a reordered persisted array must not insert a connection");
  assert.equal(JSON.stringify(cropSource.dataset), sourceBeforeFailure, "a reordered persisted array must not mutate the source");
  console.log("Canvas gallery container operations checks passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
