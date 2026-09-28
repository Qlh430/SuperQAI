"use strict";

// Connection-capacity coverage for the unified material node.
//
// The material collection feeds generators through one `assets` output plus one
// per-member output, so the reference caps have to count what a connection
// already contributes instead of bailing out early. These tests extract the
// real capacity functions from script.js and drive them with a fake graph, so
// appending the tenth picture to an already connected collection cannot slip
// past the nine-picture H3 limit again.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const Rules = require("../canvas-asset-collection-rules");

const script = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");

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

function createHarness() {
  const registry = new Map();
  const context = {
    canvasState: { connections: [] },
    window: { CanvasAssetCollectionRules: Rules },
    CANVAS_MIDJOURNEY_MAX_REFS: Number(
      (script.match(/const CANVAS_MIDJOURNEY_MAX_REFS = (\d+);/) || [])[1] || 4,
    ),
    console,
  };
  context.getCanvasNode = (id) => registry.get(String(id))?.node || null;
  context.getCanvasNodeOutput = (node, handle = "output") => {
    const entry = [...registry.values()].find((item) => item.node === node);
    return entry ? entry.output(handle) : null;
  };
  context.registerNode = (id, node, output) => registry.set(String(id), { node, output });
  vm.runInNewContext([
    extractFunction(script, "getCanvasIncomingItems"),
    extractFunction(script, "getCanvasH3ConnectionCapacity"),
    extractFunction(script, "getCanvasApiVideoConnectionCapacity"),
    extractFunction(script, "getCanvasMidjourneyConnectionCapacity"),
    extractFunction(script, "getCanvasConnectionCompatibility"),
  ].join("\n"), context);
  return context;
}

function makeNode(id, className, dataset = {}) {
  const classes = new Set(["canvas-node", className]);
  return { dataset: { id, ...dataset }, classList: { contains: (token) => classes.has(token) } };
}

const imageMember = (index) => ({
  id: `image-${index}`,
  kind: "image",
  src: `/output/image-${index}.png`,
  savedUrl: `/output/image-${index}.png`,
  name: `图片 ${index}`,
  createdAt: `2026-09-23T00:00:${String(index).padStart(2, "0")}.000Z`,
});

// Mirrors getCanvasAssetCollectionOutput: the bare handle yields the whole
// collection, a member handle yields that one material.
const collectionOutput = (members) => (handle = "output") => {
  const list = Rules.normalizeMembers(members);
  if (String(handle).startsWith("member-output:")) {
    const member = list.find((item) => item.id === String(handle).slice("member-output:".length));
    return member
      ? { type: member.kind, url: member.src, originalUrl: member.src, name: member.name, mimeType: member.mimeType }
      : null;
  }
  return { type: "assets", assets: list };
};

const assetsOf = (members) => ({ type: "assets", assets: Rules.normalizeMembers(members) });

// --- H3 picture cap: nine already wired, the tenth must be refused -----------
{
  const harness = createHarness();
  const nine = Array.from({ length: 9 }, (_, index) => imageMember(index + 1));
  const collection = makeNode("collection-1", "canvas-node-asset-collection");
  const h3 = makeNode("h3-1", "canvas-node-minimax-h3");
  harness.registerNode("collection-1", collection, collectionOutput(nine));
  harness.registerNode("h3-1", h3, () => ({ type: "video-generator" }));
  harness.canvasState.connections.push({ from: "collection-1", fromPort: "output", to: "h3-1", toPort: "input" });

  const ninth = harness.getCanvasConnectionCompatibility(collection, h3, assetsOf(nine), { sourcePort: "output" });
  assert.equal(ninth.ok, true, "re-validating the same nine pictures must stay inside the cap");
  const tenth = harness.getCanvasConnectionCompatibility(
    collection,
    h3,
    assetsOf([...nine, imageMember(10)]),
    { sourcePort: "output" },
  );
  assert.equal(tenth.ok, false, "appending a tenth picture must be refused, not silently accepted");
  assert.match(tenth.message, /图片参考最多 9 个/);
}

// --- H3 picture cap: eight wired, the ninth still fits -----------------------
{
  const harness = createHarness();
  const eight = Array.from({ length: 8 }, (_, index) => imageMember(index + 1));
  const collection = makeNode("collection-1", "canvas-node-asset-collection");
  const h3 = makeNode("h3-1", "canvas-node-minimax-h3");
  harness.registerNode("collection-1", collection, collectionOutput(eight));
  harness.registerNode("h3-1", h3, () => ({ type: "video-generator" }));
  harness.canvasState.connections.push({ from: "collection-1", fromPort: "output", to: "h3-1", toPort: "input" });

  const ninth = harness.getCanvasConnectionCompatibility(
    collection,
    h3,
    assetsOf([...eight, imageMember(9)]),
    { sourcePort: "output" },
  );
  assert.equal(ninth.ok, true, "the ninth picture still fits");
}

// --- per-member ports keep counting the whole collection ---------------------
{
  const harness = createHarness();
  const nine = Array.from({ length: 9 }, (_, index) => imageMember(index + 1));
  const collection = makeNode("collection-1", "canvas-node-asset-collection");
  const h3 = makeNode("h3-1", "canvas-node-minimax-h3");
  harness.registerNode("collection-1", collection, collectionOutput(nine));
  harness.registerNode("h3-1", h3, () => ({ type: "video-generator" }));
  nine.forEach((member) => harness.canvasState.connections.push({
    from: "collection-1",
    fromPort: `member-output:${member.id}`,
    to: "h3-1",
    toPort: "input",
  }));

  const extraMember = { type: "image", url: "/output/image-11.png", name: "第十张" };
  const tenth = harness.getCanvasConnectionCompatibility(collection, h3, extraMember, {
    sourcePort: "member-output:image-11",
  });
  assert.equal(tenth.ok, false, "a tenth member port must respect the other nine wires");
  const redrag = harness.getCanvasConnectionCompatibility(collection, h3, extraMember, {
    sourcePort: "member-output:image-9",
  });
  assert.equal(redrag.ok, true, "re-dragging an existing member port must not double count itself");
}

// --- second source pushes the collection over the cap ------------------------
{
  const harness = createHarness();
  const nine = Array.from({ length: 9 }, (_, index) => imageMember(index + 1));
  const collection = makeNode("collection-1", "canvas-node-asset-collection");
  const single = makeNode("image-1", "canvas-node-image", { imageSrc: "/output/solo.png" });
  const h3 = makeNode("h3-1", "canvas-node-minimax-h3");
  harness.registerNode("collection-1", collection, collectionOutput(nine));
  harness.registerNode("image-1", single, () => ({ type: "image", url: "/output/solo.png", name: "单图" }));
  harness.registerNode("h3-1", h3, () => ({ type: "video-generator" }));
  harness.canvasState.connections.push({ from: "collection-1", fromPort: "output", to: "h3-1", toPort: "input" });
  harness.canvasState.connections.push({ from: "image-1", fromPort: "output", to: "h3-1", toPort: "input" });

  const ten = harness.getCanvasConnectionCompatibility(
    collection,
    h3,
    assetsOf([...nine, imageMember(10)]),
    { sourcePort: "output" },
  );
  assert.equal(ten.ok, false, "the single picture node already on the wire counts toward the cap");
}

// --- API video keeps its single first frame ---------------------------------
{
  const harness = createHarness();
  const one = [imageMember(1)];
  const collection = makeNode("collection-1", "canvas-node-asset-collection");
  const videoApi = makeNode("video-api-1", "canvas-node-video-api");
  harness.registerNode("collection-1", collection, collectionOutput(one));
  harness.registerNode("video-api-1", videoApi, () => ({ type: "video-generator" }));
  harness.canvasState.connections.push({ from: "collection-1", fromPort: "output", to: "video-api-1", toPort: "input" });

  const stillOne = harness.getCanvasConnectionCompatibility(collection, videoApi, assetsOf(one), { sourcePort: "output" });
  assert.equal(stillOne.ok, true, "one first frame is fine");
  const two = harness.getCanvasConnectionCompatibility(
    collection,
    videoApi,
    assetsOf([...one, imageMember(2)]),
    { sourcePort: "output" },
  );
  assert.equal(two.ok, false, "the API video node takes exactly one first frame");
  assert.match(two.message, /首帧参考最多 1 张/);
}

// --- Midjourney reference cap ------------------------------------------------
{
  const harness = createHarness();
  const four = Array.from({ length: 4 }, (_, index) => imageMember(index + 1));
  const collection = makeNode("collection-1", "canvas-node-asset-collection");
  const midjourney = makeNode("midjourney-1", "canvas-node-midjourney");
  harness.registerNode("collection-1", collection, collectionOutput(four));
  harness.registerNode("midjourney-1", midjourney, () => ({ type: "generator" }));
  harness.canvasState.connections.push({ from: "collection-1", fromPort: "output", to: "midjourney-1", toPort: "input" });

  const fourAgain = harness.getCanvasConnectionCompatibility(collection, midjourney, assetsOf(four), { sourcePort: "output" });
  assert.equal(fourAgain.ok, true);
  const five = harness.getCanvasConnectionCompatibility(
    collection,
    midjourney,
    assetsOf([...four, imageMember(5)]),
    { sourcePort: "output" },
  );
  assert.equal(five.ok, false, "Midjourney takes at most four references");
}

// --- unsupported member kinds are refused, not silently dropped --------------
{
  const harness = createHarness();
  const collection = makeNode("collection-1", "canvas-node-asset-collection");
  const generator = makeNode("image-2", "canvas-node-image");
  harness.registerNode("collection-1", collection, collectionOutput([]));
  harness.registerNode("image-2", generator, () => null);

  const withAudio = harness.getCanvasConnectionCompatibility(collection, generator, {
    type: "assets",
    assets: Rules.normalizeMembers([
      imageMember(1),
      { id: "audio-1", kind: "audio", src: "/output/voice.mp3", name: "配音" },
    ]),
  }, { sourcePort: "output" });
  assert.equal(withAudio.ok, false, "an audio member cannot ride into a picture generator");
  assert.match(withAudio.message, /不支持的素材类型/);

  const imagesOnly = harness.getCanvasConnectionCompatibility(collection, generator, {
    type: "assets",
    assets: Rules.normalizeMembers([imageMember(1)]),
  }, { sourcePort: "output" });
  assert.equal(imagesOnly.ok, true, "pictures still reach a picture generator");

  const h3 = makeNode("h3-1", "canvas-node-minimax-h3");
  harness.registerNode("h3-1", h3, () => ({ type: "video-generator" }));
  const mixedForH3 = harness.getCanvasConnectionCompatibility(collection, h3, {
    type: "assets",
    assets: Rules.normalizeMembers([
      imageMember(1),
      { id: "video-1", kind: "video", src: "/output/clip.mp4", name: "参考视频" },
      { id: "audio-1", kind: "audio", src: "/output/voice.mp3", name: "配音" },
    ]),
  }, { sourcePort: "output" });
  assert.equal(mixedForH3.ok, true, "the video generator accepts picture, video and audio references");
}

console.log("canvas asset collection connections: ok");
