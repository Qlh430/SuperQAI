const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createCanvasRepository } = require("../canvas-repository");

const ROOT = path.join(__dirname, "..");
const PRESSURE_ROOT = path.join(ROOT, "tmp", "canvas-pressure");
const DATABASE_FILE = path.join(PRESSURE_ROOT, "canvas-50000.db");
const MANIFEST_FILE = path.join(PRESSURE_ROOT, "manifest.json");
const BOARD_ID = "canvas-50000-pressure";
const SEED = 50_000;
const NODE_COUNT = 50_000;
const CONNECTION_COUNT = 100_000;
const MEDIA_REFERENCE_COUNT = 25_000;
const BATCH_SIZE = 500;
const COMPOSITION = Object.freeze([
  { kind: "text", count: 15_000 },
  { kind: "image", count: 15_000 },
  { kind: "generator", count: 10_000 },
  { kind: "media", count: 5_000 },
  { kind: "workflow", count: 5_000 },
]);
const THUMBNAIL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

function isPressureRoot(target) {
  return path.resolve(target) === path.resolve(PRESSURE_ROOT);
}

function removePressureRoot() {
  assert.equal(isPressureRoot(PRESSURE_ROOT), true);
  if (!fs.existsSync(PRESSURE_ROOT)) return;
  const removeEntry = (target) => {
    const entry = fs.lstatSync(target);
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      fs.unlinkSync(target);
      return;
    }
    for (const name of fs.readdirSync(target)) removeEntry(path.join(target, name));
    fs.rmdirSync(target);
  };
  let lastError;
  for (let attempt = 0; attempt < 5 && fs.existsSync(PRESSURE_ROOT); attempt += 1) {
    try {
      removeEntry(PRESSURE_ROOT);
    } catch (error) {
      lastError = error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100 * (attempt + 1));
    }
  }
  if (fs.existsSync(PRESSURE_ROOT)) {
    throw lastError || new Error(`Pressure-test directory could not be removed: ${PRESSURE_ROOT}`);
  }
}

function makeRandom(seed = SEED) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function kindAt(index) {
  let offset = 0;
  for (const item of COMPOSITION) {
    if (index < offset + item.count) return { kind: item.kind, localIndex: index - offset };
    offset += item.count;
  }
  throw new RangeError(`Node index is outside the fixture: ${index}`);
}

function fixturePosition(index, kind, localIndex, random) {
  if (index === 14_999) return { x: -1_000_000_000, y: -1_000_000_000, region: "far" };
  if (index === NODE_COUNT - 1) return { x: 1_000_000_000, y: 1_000_000_000, region: "far" };
  if (localIndex < 60) {
    const kindOffset = COMPOSITION.findIndex((item) => item.kind === kind);
    const slot = kindOffset * 60 + localIndex;
    return {
      x: (slot % 20) * 360 - 3_420,
      y: Math.floor(slot / 20) * 260 - 1_820,
      region: "acceptance",
    };
  }
  if (localIndex < 260) {
    const slot = localIndex % 25;
    return {
      x: 2_000_000 + (slot % 5) * 4,
      y: 2_000_000 + Math.floor(slot / 5) * 4,
      region: "overlap",
    };
  }
  if (localIndex < 1_260) {
    const kindOffset = COMPOSITION.findIndex((item) => item.kind === kind);
    const slot = kindOffset * 1_000 + localIndex - 260;
    return {
      x: -2_000_000 + (slot % 100) * 42,
      y: -2_000_000 + Math.floor(slot / 100) * 34,
      region: "dense",
    };
  }
  const sparseIndex = index - 1_260;
  const column = sparseIndex % 224;
  const row = Math.floor(sparseIndex / 224);
  return {
    x: -900_000_000 + column * 8_070_000 + Math.round(random() * 2_000),
    y: -900_000_000 + row * 8_070_000 + Math.round(random() * 2_000),
    region: "sparse",
  };
}

function createNode(index, random) {
  const { kind: category, localIndex } = kindAt(index);
  const position = fixturePosition(index, category, localIndex, random);
  const hasMedia = category === "image"
    || category === "media"
    || (category === "generator" && localIndex < 5_000);
  const kind = category === "media"
    ? (localIndex % 2 === 0 ? "audio" : "video")
    : category === "workflow"
      ? ["group", "llm", "comfy", "loop"][localIndex % 4]
      : category === "generator"
        ? "image"
        : category;
  const node = {
    id: `node-${index}`,
    kind,
    fixtureCategory: category,
    x: position.x,
    y: position.y,
    width: category === "workflow" ? 420 : 320,
    height: category === "media" ? 240 : 220,
    zOrder: index,
    text: `${category} fixture ${index}`,
    fixtureRegion: position.region,
    fixtureSeed: SEED,
  };
  if (hasMedia) {
    node.resourceId = `media-${index}`;
    node.thumbnailSrc = THUMBNAIL;
    node.imageSrc = THUMBNAIL;
  }
  if (category === "image") {
    node.uploadOnly = true;
    node.imageName = `fixture image ${index}`;
  } else if (category === "generator") {
    node.prompt = `fixture generation prompt ${index}`;
  } else if (category === "media") {
    node.mediaName = `fixture ${kind} ${index}`;
  } else if (category === "workflow") {
    node.groupTitle = `fixture workflow ${index}`;
    node.llmPrompt = `fixture workflow prompt ${index}`;
    node.comfyMode = "upscale2";
  }
  if (index === NODE_COUNT - 1) node.futureField = { preserved: true, version: 50_000 };
  return node;
}

function createConnection(index) {
  const fromIndex = index % NODE_COUNT;
  const distance = index < NODE_COUNT ? 1 : 19;
  return {
    id: `edge-${index}`,
    from: `node-${fromIndex}`,
    to: `node-${(fromIndex + distance) % NODE_COUNT}`,
    fixtureSeed: SEED,
  };
}

async function generateFixture({ clean = true, onProgress = console.log } = {}) {
  assert.equal(COMPOSITION.reduce((total, item) => total + item.count, 0), NODE_COUNT);
  if (clean) removePressureRoot();
  assert.equal(fs.existsSync(DATABASE_FILE), false, "pressure-test database survived cleanup");
  fs.mkdirSync(PRESSURE_ROOT, { recursive: true });
  const startedAt = Date.now();
  const repository = createCanvasRepository({ dbPath: DATABASE_FILE, requestTimeoutMs: 120_000 });
  const random = makeRandom();
  let importedNodes = 0;
  let importedConnections = 0;
  let mediaReferences = 0;
  let succeeded = false;
  try {
    await repository.ready();
    await repository.beginLegacyImport({
      board: {
        id: BOARD_ID,
        title: "50,000-node pressure fixture",
        viewport: { x: 3_420, y: 1_820, scale: 1 },
        createdAt: "2026-08-25T00:00:00.000Z",
        updatedAt: "2026-08-25T00:00:00.000Z",
      },
      backupFile: "generated-fixture-no-source.json",
    });
    for (let offset = 0; offset < NODE_COUNT; offset += BATCH_SIZE) {
      const items = [];
      for (let index = offset; index < Math.min(NODE_COUNT, offset + BATCH_SIZE); index += 1) {
        const node = createNode(index, random);
        if (node.resourceId) mediaReferences += 1;
        items.push(node);
      }
      await repository.importLegacyBatch({ boardId: BOARD_ID, entity: "nodes", items, offset });
      importedNodes += items.length;
      if (importedNodes % 5_000 === 0) onProgress(`fixture nodes ${importedNodes}/${NODE_COUNT}`);
    }
    for (let offset = 0; offset < CONNECTION_COUNT; offset += BATCH_SIZE) {
      const items = Array.from(
        { length: Math.min(BATCH_SIZE, CONNECTION_COUNT - offset) },
        (_, batchIndex) => createConnection(offset + batchIndex),
      );
      await repository.importLegacyBatch({ boardId: BOARD_ID, entity: "connections", items, offset });
      importedConnections += items.length;
      if (importedConnections % 10_000 === 0) {
        onProgress(`fixture connections ${importedConnections}/${CONNECTION_COUNT}`);
      }
    }
    assert.equal(importedNodes, NODE_COUNT);
    assert.equal(importedConnections, CONNECTION_COUNT);
    assert.equal(mediaReferences, MEDIA_REFERENCE_COUNT);
    await repository.activateImportedBoard({
      boardId: BOARD_ID,
      validation: {
        hash: `fixture-${SEED}-${NODE_COUNT}-${CONNECTION_COUNT}-${MEDIA_REFERENCE_COUNT}`,
      },
    });
    const meta = await repository.getBoardMeta(BOARD_ID);
    assert.equal(meta.nodeCount, NODE_COUNT);
    assert.equal(meta.connectionCount, CONNECTION_COUNT);
    assert.deepEqual(await repository.quickCheck(), { ok: true, result: "ok" });
    const manifest = {
      boardId: BOARD_ID,
      databaseFile: DATABASE_FILE,
      seed: SEED,
      nodeCount: NODE_COUNT,
      connectionCount: CONNECTION_COUNT,
      mediaReferenceCount: MEDIA_REFERENCE_COUNT,
      composition: COMPOSITION,
      generatedMs: Date.now() - startedAt,
      generatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`);
    succeeded = true;
    return manifest;
  } finally {
    await repository.close().catch(() => {});
    if (!succeeded) removePressureRoot();
  }
}

if (require.main === module) {
  generateFixture().then((manifest) => {
    console.log(`Canvas 50,000 fixture generated in ${manifest.generatedMs} ms.`);
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  BOARD_ID,
  COMPOSITION,
  CONNECTION_COUNT,
  DATABASE_FILE,
  MANIFEST_FILE,
  MEDIA_REFERENCE_COUNT,
  NODE_COUNT,
  PRESSURE_ROOT,
  createConnection,
  createNode,
  generateFixture,
  makeRandom,
  removePressureRoot,
};
