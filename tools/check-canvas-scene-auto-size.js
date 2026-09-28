"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), vm = require("node:vm");
const { createCanvasRepository } = require("../canvas-repository");
const { DatabaseSync } = require("node:sqlite");
(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-auto-size-"));
  const dbPath = path.join(temp, "canvas.db");
  let repository = createCanvasRepository({ dbPath });
  try {
    await repository.ready();
    await repository.createBoard({ id: "auto", title: "旧画布自动尺寸" });
    await repository.applyOperations({ boardId: "auto", baseRevision: 0, operations: Array.from({ length: 801 }, (_, i) => ({
      operationId: `add-${i}`, type: "node.upsert", entityId: `n${i}`,
      after: { id: `n${i}`, kind: "image", x: (i % 40) * 20, y: Math.floor(i / 40) * 20, width: 0, height: 0, imageSrc: "/output/example.png", imageName: `图片 ${i}` },
    })) });
    const page = await repository.queryViewport({ boardId: "auto", left: -10, top: -10, right: 1500, bottom: 1500, scale: 0.2 });
    assert.equal(page.mode, "scene");
    assert.equal(page.visualNodeCount, 801);
    assert.ok(page.visualNodes.every(n => n[4] === 320 && n[5] === 240 && n[7] && n[8]));
    const edge = await repository.queryViewport({ boardId: "auto", left: 1090, top: 200, right: 1095, bottom: 205, scale: 5 });
    assert.ok(edge.nodes.length > 0, "a zero-size legacy image whose body overlaps the viewport must not disappear when its origin leaves the screen");
    const originalNode = (await repository.getNode({ boardId: "auto", nodeId: "n39" })).node;
    assert.equal(originalNode.width, 0, "index geometry must not turn automatic sizing into fixed sizing");
    await repository.close();
    const db = new DatabaseSync(dbPath);
    db.exec("UPDATE nodes SET width=0, height=0; UPDATE node_spatial SET max_x=min_x, max_y=min_y");
    db.close();
    repository = createCanvasRepository({ dbPath });
    await repository.ready();
    const repairedEdge = await repository.queryViewport({ boardId: "auto", left: 1090, top: 200, right: 1095, bottom: 205, scale: 5 });
    assert.ok(repairedEdge.nodes.length > 0, "startup repairs the old persisted spatial index, not just newly written nodes");
    assert.deepEqual((await repository.getNode({ boardId: "auto", nodeId: "n39" })).node, originalNode, "repair preserves original payload and revision");
    assert.equal((await repository.getBoardMeta("auto")).nodeCount, 801);
    const source = fs.readFileSync(path.join(__dirname, "../script.js"), "utf8");
    const baselineState = { activeBoardRevision: 0 };
    const baselineContext = vm.createContext({ canvasState: baselineState });
    vm.runInContext(source.slice(source.indexOf("function rememberCanvasViewportBaseline("), source.indexOf("async function loadCanvasSceneNode(")), baselineContext);
    baselineContext.rememberCanvasViewportBaseline({ mode: "scene", boardRevision: 7 });
    assert.equal(baselineState.activeBoardRevision, 7, "dense pages must update the save revision even without detail nodes");
    baselineContext.rememberCanvasViewportBaseline({ mode: "scene", boardRevision: 6 });
    assert.equal(baselineState.activeBoardRevision, 7, "a delayed viewport response must not roll back the save revision");
    const origin = { hidden: false }, state = { activeBoardId: "auto" }, store = { size: 0 }, paged = { scenePage: page };
    const context = vm.createContext({ document: { querySelector: () => origin }, canvasState: state, canvasVirtualStore: store, canvasPagedStore: paged });
    vm.runInContext(source.slice(source.indexOf("function updateCanvasOrigin("), source.indexOf("function setCanvasStatus(")), context);
    context.updateCanvasOrigin();
    assert.equal(origin.hidden, true, "a scene-only board is not an empty canvas");
    paged.scenePage = null;
    context.updateCanvasOrigin();
    assert.equal(origin.hidden, false, "an actual empty board keeps its onboarding hint");
    console.log("Canvas legacy automatic size and scene-empty-state checks passed.");
  } finally {
    await repository.close();
    assert.ok(temp.startsWith(os.tmpdir() + path.sep));
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
