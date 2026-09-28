"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");

// Called only by the LAN regression harness with its temporary database.
module.exports = async function checkPasteOffsets(page, source, artifacts) {
  const fixture = await page.evaluate(async source => {
    await saveCanvasBoardNow();
    const previous = { id: canvasState.activeBoardId, title: canvasState.activeBoardTitle };
    const id = "paste-offset-regression";
    const post = async (url, body) => {
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      return data;
    };
    await post("/api/canvas/boards", { id, title: "Paste offset", viewport: { x: 60, y: 120, scale: 1 } });
    const nodes = Array.from({ length: 801 }, (_, i) => ({
      id: `offset-${i}`, kind: "image", x: (i % 40) * 8, y: Math.floor(i / 40) * 10,
      width: 100, height: 181, imageSrc: source, imageName: "portrait.png",
    }));
    for (let offset = 0; offset < nodes.length; offset += 400) {
      await post(`/api/canvas/boards/${id}/operations`, { baseRevision: offset / 400,
        operations: nodes.slice(offset, offset + 400).map(node => ({
          operationId: `add-${node.id}`, entityId: node.id, type: "node.upsert", after: node,
        })),
      });
    }
    await openCanvasBoardFromHistory({ id, title: "Paste offset" });
    return { previous, id };
  }, source);
  try {
    await page.waitForFunction(() => canvasPagedStore.scenePage?.mode === "scene");
    for (const count of [1, 3, 121]) {
      const before = await page.evaluate(async count => {
        clearCanvasSelection();
        const ids = Array.from({ length: count }, (_, i) => `offset-${i}`);
        const nodes = [];
        if (count <= 3) {
          for (const id of ids) {
            const model = await loadCanvasSceneNode(id);
            canvasVirtualStore.upsert(model);
            addCanvasNodeToSelection(ensureCanvasNodeMounted(id));
            nodes.push(model);
          }
        } else {
          for (const id of ids) {
            const item = canvasPagedStore.scenePage.visualNodes.find(item => item[0] === id);
            const model = { id, kind: item[1], x: item[2], y: item[3], width: item[4], height: item[5], previewSource: item[7] };
            canvasState.selectedIds.add(id);
            canvasState.selectedSceneItems.set(id, model);
            nodes.push(model);
          }
          dispatchCanvasSelectionChange();
        }
        return nodes.map(node => ({ x: node.x, y: node.y }));
      }, count);
      await page.keyboard.press("Control+c");
      await page.waitForFunction(count => canvasState.clipboard?.nodes.length === count, count);
      const batches = [];
      for (let paste = 1; paste <= 3; paste++) {
        const previousIds = await page.evaluate(() => [...canvasState.selectedIds]);
        await page.keyboard.press("Control+v");
        await page.waitForFunction(({ count, previousIds }) => canvasState.selectedIds.size === count
          && [...canvasState.selectedIds].every(id => !previousIds.includes(id)), { count, previousIds });
        const result = await page.evaluate(() => ({
          nodes: [...canvasState.selectedIds].map(id => {
            const model = canvasVirtualStore.get(id);
            return { id, x: model.x, y: model.y };
          }),
          source: canvasState.clipboard.nodes.map(node => ({ x: node.x, y: node.y })),
          mounted: canvasVirtualStore.mountedSize,
        }));
        assert.deepEqual(result.nodes.map(({ x, y }) => ({ x, y })), before.map(({ x, y }) => ({ x: x + 28 * paste, y: y + 28 * paste })),
          `${count}-node paste ${paste} must cumulatively offset by 28 like DX OS`);
        assert.deepEqual(result.source, before, "pasting must not mutate the copied source coordinates");
        if (count > 120) assert.ok(result.mounted < 130, "bulk paste keeps its bounded DOM path");
        batches.push(result.nodes);
      }
      await page.evaluate(async () => { await saveCanvasBoardNow(); });
      const saved = await page.evaluate(async batches => {
        const ids = batches.map(nodes => nodes[0].id);
        const query = new URLSearchParams(ids.map(id => ["nodeId", id]));
        const result = await (await fetch(`/api/canvas/boards/${canvasState.activeBoardId}/nodes?${query}`)).json();
        return result.nodes.map(({ id, x, y }) => ({ id, x, y }));
      }, batches);
      assert.deepEqual(saved, batches.map(nodes => nodes[0]), "persisted copies keep the staggered positions");
      if (count === 1) {
        await page.keyboard.press("Control+c");
        await page.keyboard.press("Control+v");
        const recopy = await page.evaluate(() => {
          const model = canvasVirtualStore.get([...canvasState.selectedIds][0]);
          return { x: model.x, y: model.y };
        });
        assert.deepEqual(recopy, { x: before[0].x + 112, y: before[0].y + 112 }, "copying the latest copy restarts with a single 28-unit offset");
        await page.screenshot({ path: path.join(artifacts, "paste-staggered.png") });
      }
    }
    console.log("PASS DX OS 28/56/84 staggered paste: single, multi-node, 121-node bulk, recopy reset, relative layout and saved positions");
  } finally {
    await page.evaluate(async previous => { await saveCanvasBoardNow(); await openCanvasBoardFromHistory(previous); }, fixture.previous);
  }
};
