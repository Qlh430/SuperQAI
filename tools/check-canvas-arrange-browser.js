"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// Called only by the LAN regression harness with its temporary database.
module.exports = async function checkCanvasArrange(page, artifacts) {
  const fixture = await page.evaluate(async () => {
    await saveCanvasBoardNow();
    const previous = { id: canvasState.activeBoardId, title: canvasState.activeBoardTitle };
    const id = "arrange-regression";
    const title = "整理画布验证";
    const post = async (url, body) => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(`${url} -> ${response.status} ${data.error || ""}`);
      return data;
    };
    // The harness always starts from a fresh database, so the board is created
    // without a probe request that would record a 404 in the error log.
    await post("/api/canvas/boards", { id, title, viewport: { x: 40, y: 40, scale: 1 } });
    // a → b → c is a flow that is scattered on the board; «散落» is a node with
    // no connections at all.
    // a → b → c is a flow that is scattered on the board. «散落» is a note with
    // no connections at all and «chain0…chain11» is a long chain: both are
    // parked far outside the viewport so the regression proves that a board
    // scope arrange also tidies nodes the paged viewport never loaded.
    const chainLength = 12;
    const chainIds = Array.from({ length: chainLength }, (_, index) => `chain${index}`);
    const nodes = [
      { id: "a", kind: "text", x: 1200, y: 640, width: 300, height: 200, text: "A" },
      { id: "b", kind: "text", x: 40, y: 20, width: 300, height: 200, text: "B" },
      { id: "c", kind: "text", x: 600, y: 900, width: 300, height: 200, text: "C" },
      { id: "散落", kind: "text", x: 6200, y: 4200, width: 300, height: 200, text: "L" },
      ...chainIds.map((chainId, index) => ({
        id: chainId,
        kind: "text",
        x: 9000 + index * 44,
        y: 7400,
        width: 300,
        height: 200,
        text: `C${index}`,
      })),
    ];
    const connections = [
      { id: "edge:a:b:input", from: "a", to: "b", fromPort: "output", toPort: "input" },
      { id: "edge:b:c:input", from: "b", to: "c", fromPort: "output", toPort: "input" },
      ...chainIds.slice(1).map((chainId, index) => ({
        id: `edge:chain${index}:${chainId}:input`,
        from: `chain${index}`,
        to: chainId,
        fromPort: "output",
        toPort: "input",
      })),
    ];
    await post(`/api/canvas/boards/${id}/operations`, {
      baseRevision: 0,
      operations: [
        ...nodes.map((node) => ({
          operationId: `arrange-add-${node.id}`,
          entityId: node.id,
          type: "node.upsert",
          after: node,
        })),
        ...connections.map((connection) => ({
          operationId: `arrange-link-${connection.id}`,
          entityId: connection.id,
          type: "connection.upsert",
          after: connection,
        })),
      ],
    });
    await openCanvasBoardFromHistory({ id, title });
    return {
      previous,
      id,
      chainIds,
      before: Object.fromEntries(nodes.map((node) => [node.id, { x: node.x, y: node.y }])),
    };
  });

  const readGeometry = () => page.evaluate(() => ({
    models: Object.fromEntries(canvasVirtualStore.values().map((model) => [
      String(model.id),
      { x: Number(model.x), y: Number(model.y), width: Number(model.width), height: Number(model.height) },
    ])),
    dom: Object.fromEntries([...document.querySelectorAll("#canvasPlane .canvas-node")].map((node) => [
      String(node.dataset.id),
      { x: Number(node.dataset.x), y: Number(node.dataset.y) },
    ])),
    viewport: { x: canvasState.x, y: canvasState.y, scale: canvasState.scale },
    undoDepth: canvasState.undoStack.length,
  }));

  // The board scope arrange must reach nodes the paged viewport never loaded,
  // so the persisted board — not the local store — is the source of truth.
  const allIds = Object.keys(fixture.before);
  const readBoardGeometry = () => page.evaluate(async (ids) => {
    await saveCanvasBoardNow();
    const query = new URLSearchParams(ids.map((id) => ["nodeId", id]));
    const result = await (await fetch(`/api/canvas/boards/${canvasState.activeBoardId}/nodes?${query}`)).json();
    return Object.fromEntries(result.nodes.map((node) => [String(node.id), {
      x: Number(node.x),
      y: Number(node.y),
      width: Number(node.width),
      height: Number(node.height),
    }]));
  }, allIds);

  try {
    await page.waitForFunction(
      () => canvasVirtualStore.size >= 3 && canvasState.connections.length >= 2,
      null,
      { timeout: 15000 },
    ).catch(async (error) => {
      const state = await page.evaluate(() => ({
        nodes: canvasVirtualStore.values().map((model) => String(model.id)),
        connections: canvasState.connections.length,
        viewport: { x: canvasState.x, y: canvasState.y, scale: canvasState.scale },
        page: canvasPagedStore.scenePage?.mode || canvasPagedStore.lodPage?.mode || "detail",
      }));
      throw new Error(`${error.message}; state=${JSON.stringify(state)}`);
    });
    const beforeState = await readGeometry();
    assert.deepEqual(
      { x: beforeState.models.a.x, y: beforeState.models.a.y },
      fixture.before.a,
      "the fixture must start at the seeded scattered positions",
    );
    const offscreenResident = await page.evaluate(() => ({
      note: Boolean(canvasVirtualStore.get("散落")),
      chain: Boolean(canvasVirtualStore.get("chain11")),
    }));
    assert.deepEqual(
      offscreenResident,
      { note: false, chain: false },
      "the fixture must park the note and the chain outside the loaded viewport page",
    );

    await page.locator("#canvasArrange").click();
    const arranged = await page.waitForFunction(
      () => /已整理全部/.test(document.querySelector(".canvas-status span:last-child")?.textContent || ""),
      null,
      { timeout: 15000 },
    ).then(() => true).catch(() => false);
    assert.equal(arranged, true, "整理 must report that the whole board was tidied");

    const afterBoard = await readBoardGeometry();
    const afterState = { models: afterBoard };
    const a = afterBoard.a;
    const b = afterBoard.b;
    const c = afterBoard.c;
    const loose = afterBoard["散落"];
    assert.equal(Object.keys(afterBoard).length, allIds.length, "every node must survive the arrange");
    assert.equal(a.x < b.x && b.x < c.x, true, "the A→B→C flow must read left to right");
    assert.equal(a.y === b.y && b.y === c.y, true, "an unbranched flow must share one row");
    assert.equal(loose.x > c.x, true, "unconnected nodes must land after the flow");
    assert.notEqual(loose.x, fixture.before["散落"].x, "unconnected nodes must still be tidied");

    // A 12-node chain cannot stay on one endless row: it wraps into bands that
    // restart at the left edge instead of stretching the board sideways.
    const chainPoints = fixture.chainIds.map((id) => afterBoard[id]);
    const chainBudget = await page.evaluate(() => window.CanvasLayoutRules.defaultColumnBudget(12));
    const chainTops = [...new Set(chainPoints.map((point) => point.y))];
    const chainLeft = Math.min(...chainPoints.map((point) => point.x));
    assert.equal(chainBudget, 4, "twelve nodes must wrap four columns per band");
    assert.equal(chainTops.length, Math.ceil(12 / chainBudget), "the 12-node chain must wrap into bands");
    assert.equal(afterBoard.chain0.x, chainLeft, "the first chain node starts at the left edge");
    assert.equal(afterBoard.chain4.x, chainLeft, "a new band restarts at the left edge");
    assert.equal(afterBoard.chain8.x, chainLeft, "a new band restarts at the left edge");
    assert.equal(afterBoard.chain4.y > afterBoard.chain0.y, true, "wrapped bands stack downwards");
    assert.equal(afterBoard.chain8.y > afterBoard.chain4.y, true, "wrapped bands stack downwards");
    assert.equal(afterBoard.chain3.x > afterBoard.chain2.x, true, "columns inside a band stay left to right");
    const chainWidth = Math.max(...chainPoints.map((point) => point.x)) - chainLeft + 300;
    const chainHeight = Math.max(...chainTops) - Math.min(...chainTops) + 200;
    assert.equal(chainWidth < chainHeight * 2, true, "a wrapped chain must not become a long strip");

    fs.mkdirSync(artifacts, { recursive: true });
    await page.screenshot({ path: path.join(artifacts, "arranged-canvas.png") });

    const boxes = Object.entries(afterState.models).map(([id, model]) => ({
      id,
      left: model.x,
      top: model.y,
      right: model.x + model.width,
      bottom: model.y + model.height,
    }));
    boxes.forEach((box, index) => {
      boxes.slice(index + 1).forEach((other) => {
        const hit = box.left < other.right && other.left < box.right
          && box.top < other.bottom && other.top < box.bottom;
        assert.equal(hit, false, `${box.id} must not overlap ${other.id}`);
      });
    });

    const afterDom = await readGeometry();
    const mountedIds = Object.keys(afterDom.dom);
    assert.equal(mountedIds.length >= 3, true, "the flow nodes must stay mounted after arranging");
    mountedIds.forEach((id) => {
      const expected = afterBoard[id];
      assert.ok(expected, `the mounted node ${id} must exist on the board`);
      assert.deepEqual(
        afterDom.dom[id],
        { x: expected.x, y: expected.y },
        `the mounted node ${id} must follow the new geometry`,
      );
    });
    assert.notDeepEqual(
      afterDom.viewport,
      beforeState.viewport,
      "整理 must focus the viewport on the result",
    );
    assert.equal(
      afterDom.undoDepth >= beforeState.undoDepth,
      true,
      "整理 must not drop history",
    );
    assert.equal(
      afterDom.undoDepth - beforeState.undoDepth <= 1,
      true,
      "整理 must add at most one history entry",
    );

    // One undo entry must restore every node at once — including the note and
    // the chain that the paged viewport had never loaded.
    await page.keyboard.press("Control+z");
    const undone = await readBoardGeometry();
    assert.deepEqual(
      Object.fromEntries(Object.entries(undone).map(([id, model]) => [id, { x: model.x, y: model.y }])),
      fixture.before,
      "a single Ctrl+Z must restore every arranged node",
    );

    await page.keyboard.press("Control+Shift+z");
    const redone = await readBoardGeometry();
    assert.deepEqual(
      Object.fromEntries(Object.entries(redone).map(([id, model]) => [id, { x: model.x, y: model.y }])),
      Object.fromEntries(Object.entries(afterBoard).map(([id, model]) => [id, { x: model.x, y: model.y }])),
      "redo must restore the arranged layout",
    );

    // Only the selection moves when two or more nodes are selected: pick one
    // flow node and the unconnected node, then leave B/C untouched.
    const flowBefore = await page.evaluate(() => ({
      b: { x: Number(canvasVirtualStore.get("b").x), y: Number(canvasVirtualStore.get("b").y) },
      c: { x: Number(canvasVirtualStore.get("c").x), y: Number(canvasVirtualStore.get("c").y) },
    }));
    await page.evaluate(() => {
      clearCanvasSelection();
      ["a", "散落"].forEach((id) => addCanvasNodeToSelection(ensureCanvasNodeMounted(id)));
    });
    const selectionSize = await page.evaluate(() => canvasState.selectedIds.size);
    assert.equal(selectionSize, 2, "the regression must select exactly two nodes");
    await page.locator("#canvasArrange").click();
    const scoped = await page.evaluate(() => ({
      a: { x: Number(canvasVirtualStore.get("a").x), y: Number(canvasVirtualStore.get("a").y) },
      loose: { x: Number(canvasVirtualStore.get("散落").x), y: Number(canvasVirtualStore.get("散落").y) },
      gap: window.CanvasLayoutRules.COLUMN_GAP,
    }));
    const anchor = { x: afterState.models.a.x, y: afterState.models.a.y };
    assert.deepEqual(scoped.a, anchor, "the selected flow node keeps the top-left anchor");
    assert.deepEqual(
      scoped.loose,
      { x: anchor.x + afterState.models.a.width + scoped.gap, y: anchor.y },
      "selected unconnected nodes are tidied next to the flow node",
    );
    const flowAfter = await page.evaluate(() => ({
      b: { x: Number(canvasVirtualStore.get("b").x), y: Number(canvasVirtualStore.get("b").y) },
      c: { x: Number(canvasVirtualStore.get("c").x), y: Number(canvasVirtualStore.get("c").y) },
    }));
    assert.deepEqual(flowAfter, flowBefore, "arranging a selection must leave unselected nodes alone");

    // The saved board must agree with what is resident, and the selection
    // scope must leave the wrapped chain exactly where the full arrange put it.
    const persisted = await readBoardGeometry();
    const resident = await page.evaluate(() => Object.fromEntries(canvasVirtualStore.values().map((model) => [
      String(model.id),
      { x: Number(model.x), y: Number(model.y) },
    ])));
    Object.entries(resident).forEach(([id, point]) => {
      assert.ok(persisted[id], `the saved board must still contain ${id}`);
      assert.deepEqual(
        { x: persisted[id].x, y: persisted[id].y },
        point,
        `the saved geometry of ${id} must match the resident model`,
      );
    });
    fixture.chainIds.forEach((id) => {
      assert.deepEqual(
        { x: persisted[id].x, y: persisted[id].y },
        { x: afterBoard[id].x, y: afterBoard[id].y },
        `arranging a selection must leave the wrapped chain node ${id} alone`,
      );
    });

    fs.mkdirSync(artifacts, { recursive: true });
    await page.screenshot({ path: path.join(artifacts, "arranged-selection.png") });
    console.log("PASS canvas arrange: flow ordering, off-screen hydration, band wrapping, single-step undo/redo, selection scope, persistence and viewport focus");
  } finally {
    await page.evaluate(async (previous) => {
      await saveCanvasBoardNow();
      await openCanvasBoardFromHistory(previous);
    }, fixture.previous);
  }
};
