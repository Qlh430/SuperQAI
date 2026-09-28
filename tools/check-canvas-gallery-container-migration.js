const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "script.js"), "utf8");
const CanvasViewRules = require("../canvas-view-rules.js");

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Missing function ${name}`);
  const bodyStart = source.indexOf("{", source.indexOf(")", start));
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (["'", '"', "`"].includes(char)) {
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

let generatedId = 0;
const localStorageData = new Map();
const ctx = {
  CanvasViewRules,
  createId: () => `generated-${++generatedId}`,
  localStorage: {
    getItem: (key) => localStorageData.get(key) || null,
    setItem: (key, value) => localStorageData.set(key, String(value)),
  },
};
vm.runInNewContext([
  extractFunction("normalizeCanvasGalleryImages"),
  extractFunction("resolveCanvasGalleryActiveImage"),
  extractFunction("normalizeCanvasGalleryContainer"),
  extractFunction("migrateLegacyCanvasGalleryItem"),
  extractFunction("snapshotLegacyCanvasGalleryBoard"),
].join("\n"), ctx);

const legacyItem = {
  kind: "gallery",
  galleryTitle: "旧结果",
  galleryActiveImageId: "b",
  galleryImages: [
    { id: "a", src: "/output/a.png", name: "A", width: 1024, height: 1024 },
    { id: "b", src: "/output/b.png", savedUrl: "/output/b.png", name: "B", createdAt: "2026-08-31T00:00:00.000Z" },
  ],
};
const migrated = JSON.parse(JSON.stringify(ctx.migrateLegacyCanvasGalleryItem(legacyItem)));
assert.equal(migrated.kind, "gallery-container");
assert.equal(migrated.galleryContainer.version, 2);
assert.equal(migrated.galleryContainer.members.length, 2);
assert.equal(migrated.galleryContainer.activeMemberId, "b");
assert.equal(migrated.galleryContainer.members[0].savedUrl, "/output/a.png");
assert.equal(migrated.galleryContainer.members[0].width, 1024);
assert.equal(migrated.galleryContainer.members[0].height, 1024);
assert.equal(migrated.galleryContainer.members[1].width, null);
assert.equal(migrated.galleryContainer.members[1].height, null);
assert.equal(migrated.galleryImages, undefined, "Migrated items must not retain legacy galleryImages");
assert.equal(migrated.galleryActiveImageId, undefined, "Migrated items must not retain legacy galleryActiveImageId");
const plainImageItem = { kind: "image", imageSrc: "/output/plain.png" };
assert.strictEqual(ctx.migrateLegacyCanvasGalleryItem(plainImageItem), plainImageItem, "Non-gallery items must retain object identity");

const legacyBoard = { id: "board-42", revision: 7, nodes: [legacyItem] };
ctx.snapshotLegacyCanvasGalleryBoard(legacyBoard);
ctx.snapshotLegacyCanvasGalleryBoard(legacyBoard);
assert.equal(localStorageData.size, 1, "A board/version migration must write one snapshot");
const [[snapshotKey, snapshotValue]] = [...localStorageData.entries()];
assert.equal(snapshotKey, "canvas-gallery-container-pre-migration:board-42:v2");
const snapshot = JSON.parse(snapshotValue);
assert.equal(snapshot.kind, "gallery-container-pre-migration");
assert.equal(snapshot.boardId, "board-42");
assert.equal(snapshot.sourceRevision, 7);
assert.ok(snapshot.savedAt, "Snapshot must include a timestamp");
assert.deepEqual(JSON.parse(JSON.stringify(snapshot.board)), legacyBoard);

let blockedMigrationCalls = 0;
let blockedStageCalls = 0;
const blockedSnapshotContext = {
  countLegacyCanvasGalleryItems: () => 1,
  localStorage: {
    getItem: () => null,
    setItem: () => { throw new Error("QuotaExceededError"); },
  },
  migrateCanvasBoardGalleryContainers: (board) => {
    blockedMigrationCalls += 1;
    return board;
  },
  stageCanvasGalleryContainerMigrationOperations: () => { blockedStageCalls += 1; },
  beginCanvasBoardRestore: () => ({ migratedLegacyCount: 0 }),
  addCanvasBoardModelToVirtualStore: () => {},
  prepareCanvasBoardRestoreFinalState: () => {},
  canvasVirtualizer: { flushNow: () => {} },
  completeCanvasBoardRestore: () => {},
};
vm.runInNewContext([
  extractFunction("snapshotLegacyCanvasGalleryBoard"),
  extractFunction("restoreCanvasBoardVirtually"),
].join("\n"), blockedSnapshotContext);
assert.throws(
  () => blockedSnapshotContext.restoreCanvasBoardVirtually(legacyBoard),
  /迁移前快照保存失败/,
  "A failed pre-migration snapshot must stop the restore",
);
assert.equal(blockedMigrationCalls, 0, "Snapshot failure must prevent migration and later persistence");
assert.equal(blockedStageCalls, 0, "Snapshot failure must not stage an overwrite operation");

const stagedOperations = [];
let scheduledSaves = 0;
const operationContext = {
  stageCanvasOperation: (operation) => {
    stagedOperations.push(operation);
    return operation;
  },
  toCanvasOperationNode: (value) => JSON.parse(JSON.stringify(value)),
  canvasState: { isRestoring: true, isUndoing: false, activeBoardTitle: "旧结果" },
  refreshCanvasImageModelSelects: () => {},
  syncCanvasWorkspaceState: () => {},
  scheduleCanvasConnectionRender: () => {},
  scheduleCanvasSave: () => { scheduledSaves += 1; },
  resetCanvasUndoHistory: () => {},
  setCanvasStatus: () => {},
  dispatchCanvasBoardChanged: () => {},
};
vm.runInNewContext([
  extractFunction("stageCanvasGalleryContainerMigrationOperations"),
  extractFunction("completeCanvasBoardRestore"),
].join("\n"), operationContext);
const offscreenLegacyBoard = { id: "board-offscreen", nodes: [{ ...legacyItem, id: "offscreen-gallery" }] };
const offscreenMigratedBoard = {
  ...offscreenLegacyBoard,
  nodes: [ctx.migrateLegacyCanvasGalleryItem(offscreenLegacyBoard.nodes[0])],
};
operationContext.stageCanvasGalleryContainerMigrationOperations(offscreenLegacyBoard, offscreenMigratedBoard);
assert.equal(stagedOperations.length, 1, "A migrated offscreen gallery must stage its own node.upsert");
assert.equal(stagedOperations[0].before.kind, "gallery");
assert.equal(stagedOperations[0].after.kind, "gallery-container");
operationContext.completeCanvasBoardRestore({ migratedLegacyCount: 1 }, { refsAlreadyRefreshed: true });
assert.equal(scheduledSaves, 1, "Restore completion must schedule persistence for the staged offscreen migration");

const restoreContext = { maxId: 4, migratedLegacyCount: 2 };
ctx.canvasState = { nextNode: 1 };
ctx.canvasPagedStore = { upsertConnections: () => {} };
ctx.syncVisibleCanvasConnections = () => {};
ctx.applyCanvasTransform = () => {};
ctx.normalizeCanvasScale = (value, fallback) => Number(value ?? fallback);
vm.runInNewContext(extractFunction("prepareCanvasBoardRestoreFinalState"), ctx);
ctx.prepareCanvasBoardRestoreFinalState({ connections: [], viewport: {} }, restoreContext);
assert.equal(restoreContext.migratedLegacyCount, 2, "Restore finalization must retain the migration marker so the converted board is saved");

console.log("Canvas gallery container migration checks passed.");
