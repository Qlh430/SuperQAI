const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { ENGINE_VERSION } = require("../host-sources/app/canvas-engine-contract.js");

const origin = "http://127.0.0.1:33200";
const boardId = "qa-agent-organize";
const source = path.join(__dirname, "design-sources/script-before-save-bridge.js");

async function run() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    const errors = [];
    const saved = new Map();
    const edges = new Map();
    const batches = [];
    const audioRequests = [];
    let assetAllowed = true;
    let audioUncertain = false;
    let revision = 0;
    let rejectSave = false;
    let forceConflictAt = 0;
    let conflictRequests = 0;
    let currentRequestCount = 0;
    page.on("pageerror", error => errors.push(error.message));
    await page.routeWebSocket("**/*", socket => socket.close());
    await page.route("**/*", route => new URL(route.request().url()).origin === origin
      ? route.continue() : route.abort());
    await page.route("**/api/**", async route => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      if (pathname === "/api/providers/audio-models") {
        return route.fulfill({ json: { models: [{
          id: "qa:ace-step", providerId: "qa", modelId: "ace-step", capabilities: ["audio.generate"],
        }] } });
      }
      if (pathname === "/api/providers/generate-audio") {
        audioRequests.push(request.postDataJSON());
        if (audioUncertain) return route.fulfill({ status: 502, json: { error: "受理状态未知" } });
        return route.fulfill({ json: { audio: { url: "/output/qa-audio.wav", mimeType: "audio/wav", duration: 1 } } });
      }
      if (pathname === "/api/asset-library") {
        const search = new URL(request.url()).searchParams.get("search");
        return route.fulfill({ json: { entries: assetAllowed && (!search || "安静试验素材".includes(search)) ? [{
          asset: { id: "qa-asset", name: "安静试验素材" }, resource: {
            id: "qa-resource", type: "image", title: "安静试验素材", metadata: { url: "/output/qa-asset.png" },
          }, preview: { kind: "image" }, access: { locked: false },
        }] : [] } });
      }
      if (pathname === `/api/canvas/boards/${boardId}/viewport`) {
        return route.fulfill({ json: { engineVersion: ENGINE_VERSION, mode: "detail",
          boardRevision: revision, nodes: [], connections: [] } });
      }
      if (pathname === `/api/canvas/boards/${boardId}/export-page`) {
        const url = new URL(request.url());
        const entity = url.searchParams.get("entity");
        const records = entity === "nodes" ? [...saved.values()] : [...edges.values()];
        const start = Number(url.searchParams.get("cursor") || 0);
        const items = records.slice(start, start + 100);
        return route.fulfill({ json: { entity, boardRevision: revision, items,
          nextCursor: start + items.length < records.length ? String(start + items.length) : "" } });
      }
      if (pathname === `/api/canvas/boards/${boardId}/nodes`) {
        const ids = new URL(request.url()).searchParams.getAll("nodeId");
        return route.fulfill({ json: { nodes: ids.map(id => saved.get(id)).filter(Boolean),
          connections: [...edges.values()].filter(edge => ids.includes(edge.from) || ids.includes(edge.to)), boardRevision: revision } });
      }
      if (pathname === `/api/canvas/boards/${boardId}/meta`) return route.fulfill({ json: { revision } });
      if (pathname === `/api/canvas/boards/${boardId}/operations` && request.method() === "POST") {
        currentRequestCount++;
        const { operations } = request.postDataJSON();
        const moving = operations.some(op => op.before && op.after && (op.before.x !== op.after.x || op.before.y !== op.after.y));
        if (forceConflictAt && moving && ++conflictRequests === forceConflictAt) {
          revision++;
          return route.fulfill({ status: 409, json: { error: "隔离画布版本冲突" } });
        }
        if (rejectSave) return route.fulfill({ status: 503, json: { error: "隔离保存失败" } });
        batches.push(operations.map(op => op.entityId));
        for (const op of operations) {
          if (op.type === "node.upsert") saved.set(op.entityId, op.after);
          if (op.type === "node.delete") saved.delete(op.entityId);
          if (op.type === "connection.upsert") edges.set(op.entityId, op.after);
          if (op.type === "connection.delete") edges.delete(op.entityId);
        }
        revision++;
        return route.fulfill({ json: { boardRevision: revision, results: operations.map(op => ({
          operationId: op.operationId, status: "applied", entityRevision: revision,
        })) } });
      }
      return route.fulfill({ json: { authenticated: false, boards: [], projects: [], preferences: {}, settings: {} } });
    });
    if (process.env.AGENT_SOURCE === "1") {
      await page.route("**/script.js*", route => route.fulfill({
        contentType: "application/javascript", body: fs.readFileSync(source),
      }));
      await page.route("**/canvas-audio-generator.js*", route => route.fulfill({
        contentType: "application/javascript", body: fs.readFileSync(path.join(__dirname, "design-sources/canvas-audio-generator.js")),
      }));
    }
    if (process.env.AGENT_QUERY_SOURCE === "1") {
      for (const file of ["canvas-agent-capabilities.js", "canvas-agent-core.js", "canvas-agent-tool-adapters.js"]) {
        await page.route(`**/${file}*`, route => route.fulfill({
          contentType: "application/javascript", body: fs.readFileSync(path.join(__dirname, "../host-sources/app", file)),
        }));
      }
      const { compileGeneratorComposer } = require("./visual-presets-build.cjs");
      await page.route("**/flora-generator-composer.js*", route => route.fulfill({
        contentType: "application/javascript", body: compileGeneratorComposer(__dirname),
      }));
    }
    await page.addInitScript(() => {
      window.NeonCanvasPerformanceFlags = { representationManager: false, detailHydration: false, detailCulling: false };
    });
    const response = await page.goto(origin, { waitUntil: "domcontentloaded" });
    assert.equal(response.headers()["x-ai-os-frontend"], "fixed-stage");
    await page.evaluate(async id => {
      await AiOsModuleLoader.ensure(["canvas-runtime", "canvas-agent-tool-adapters"]);
      await loadCanvasBoards();
      canvasState.activeBoardId = id;
      canvasState.activeBoardPersisted = true;
      canvasState.scale = 0.32;
      const surface = document.createElement("div");
      surface.id = "neonEngineSurface";
      surface.style.cssText = "position:fixed;inset:0;display:flex;flex-direction:column";
      document.body.append(surface);
      const view = document.querySelector("#canvasView");
      surface.append(view);
      view.hidden = false;
      view.classList.add("active");
      document.querySelector("#canvasEditorScreen").hidden = false;
      document.body.classList.add("canvas-surface-open");
      showCanvasEditor();
      scheduleCanvasTransform();
      const nodes = [];
      const broker = CanvasAgentBroker.createBroker({
        getCurrentBoardId: () => canvasState.activeBoardId,
        adapters: CanvasAgentToolAdapters.create({ canvasApi: CanvasAgentCanvasApi }),
      });
      const scope = broker.beginRun({ boardId: id, runId: "qa-organize" });
      let seq = 0;
      const call = (name, args) => broker.execute(scope, { name, call_id: String(++seq), arguments: args });
      window.qaOrganize = {
        async seed() {
          for (let i = 0; i < 45; i++) {
            const point = i < 3 ? { x: 80 + i * 330, y: 110 + i * 25 }
              : { x: 80 + (i - 3) % 3 * 440, y: 340 + Math.floor((i - 3) / 3) * 170 };
            const node = addCanvasText(point, { name: `隔离节点 ${i + 1}`, text: "验收", focus: false });
            node.dataset.boardId = id;
            nodes.push(node);
          }
          await saveCanvasBoardNow();
        },
        get ids() { return nodes.map(node => node.dataset.id); },
        positions: () => nodes.map(node => ({ x: Number(node.dataset.x), y: Number(node.dataset.y) })),
        run: (node_ids, direction) => call("organize_canvas_nodes", { node_ids, direction, gap: 40, center_view: false }),
        call,
      };
    }, boardId);
    const beforeEmpty = currentRequestCount;
    const empty = await page.evaluate(() => qaOrganize.run([], "auto"));
    assert.equal(empty.ok, false, JSON.stringify(empty));
    assert.equal(empty.code, "no_eligible_nodes");
    assert.equal(currentRequestCount, beforeEmpty);

    const imageId = "qa-cold-image";
    const coldImage = {
      id: imageId, kind: "image", nodeTitle: "产品历史", x: 40000, y: 40000, width: 400, height: 400,
      prompt: "验收提示词", model: "isolated-image-model", resolution: "4",
      resultSrc: "/output/qa-current.png", currentGenerationId: "head",
      generationHistory: [{ id: "older", kind: "image", prompt: "旧提示词", src: "/output/qa-history.png" },
        { id: "head", kind: "image", prompt: "新提示词", src: "/output/qa-current.png" }],
      untrusted_url: "https://example.invalid/private-image?token=never-send",
    };
    if (process.env.AGENT_QUERY_SOURCE === "1") {
      saved.set(imageId, coldImage);
      const beforeRead = currentRequestCount;
      const result = await page.evaluate(() => qaOrganize.call("query_canvas_nodes", {
        node_ids: [], name: "产品历史", kind: "image", selected_only: false, details: true, offset: 0,
      }));
      assert.equal(result.ok, true, JSON.stringify(result));
      assert.deepEqual(result.nodes.map(node => node.id), [imageId]);
      assert.equal(result.nodes[0].prompt, "验收提示词");
      assert.deepEqual(result.nodes[0].history.map(item => item.id), ["head", "older"]);
      assert.doesNotMatch(JSON.stringify(result), /never-send|example\.invalid/);
      assert.equal(await page.evaluate(id => Boolean(getCanvasNodeModel(id) || getCanvasNode(id)), imageId), false);
      assert.equal(currentRequestCount, beforeRead);
      saved.delete(imageId);
    }

    await page.evaluate(() => qaOrganize.seed());
    const initial = await page.evaluate(() => ({ ids: qaOrganize.ids, positions: qaOrganize.positions() }));
    assert.equal(saved.size, 45, "fixture must save all starting nodes");
    const point = id => ({ x: saved.get(id).x, y: saved.get(id).y });
    const remoteIds = Array.from({ length: 500 }, (_, i) => `qa-offscreen-${i}`);
    for (const [i, id] of remoteIds.entries()) saved.set(id, {
      id, kind: "text", x: 10000 + i * 90, y: 20000, width: 400, height: 110, text: `离屏 ${i}`,
    });
    const group = { id: "qa-group", kind: "group", x: 31000, y: 30000, width: 480, height: 200,
      groupMembers: ["qa-child"] };
    const child = { id: "qa-child", kind: "text", x: 31020, y: 30020, width: 400, height: 110 };
    saved.set(group.id, group);
    saved.set(child.id, child);
    const beforeWhole = batches.length;
    const whole = await page.evaluate(() => qaOrganize.run([], "grid"));
    assert.equal(whole.ok, true, JSON.stringify(whole));
    assert.equal(whole.persisted, true);
    assert.equal(whole.organized_count, 545);
    assert.equal(whole.node_ids_truncated, true);
    assert.ok(batches.slice(beforeWhole).length >= 2);
    assert.ok(remoteIds.every(id => point(id).y < 20000), "all offscreen nodes must be saved at new positions");
    assert.deepEqual(saved.get(group.id), group);
    assert.deepEqual(saved.get(child.id), child);
    const beforeSubset = new Map(Array.from(saved.keys(), id => [id, point(id)]));

    const subset = [initial.ids[0], remoteIds[0], group.id];
    const edited = await page.evaluate(ids => qaOrganize.run(ids, "row"), subset);
    assert.equal(edited.ok, true, JSON.stringify(edited));
    assert.equal(edited.persisted, true);
    assert.deepEqual(edited.node_ids, [...subset, child.id]);
    assert.equal(edited.organized_count, 4);
    assert.ok(point(remoteIds[0]).x > point(initial.ids[0]).x);
    assert.deepEqual(point(child.id), { x: point(group.id).x + 20, y: point(group.id).y + 20 });
    for (const [id, pos] of beforeSubset) if (![...subset, child.id].includes(id)) assert.deepEqual(point(id), pos);
    const updated = new Map(Array.from(saved.keys(), id => [id, point(id)]));
    forceConflictAt = 1;
    const conflict = await page.evaluate(ids => qaOrganize.run(ids, "column"), subset);
    forceConflictAt = 0;
    assert.equal(conflict.ok, false, JSON.stringify(conflict));
    assert.equal(conflict.persisted, false);
    assert.equal(conflict.code, "canvas_revision_conflict");
    assert.equal(conflict.confirmed_count, 0, JSON.stringify(conflict));
    assert.equal(conflictRequests, 1, JSON.stringify(conflict));
    assert.deepEqual(new Map(Array.from(saved.keys(), id => [id, point(id)])), updated);

    rejectSave = true;
    const failed = await page.evaluate(() => qaOrganize.run(qaOrganize.ids.slice(0, 3), "column"));
    assert.equal(failed.ok, false, JSON.stringify(failed));
    assert.equal(failed.persisted, false);
    assert.equal(failed.code, "canvas_save_failed");
    assert.match(failed.error, /保存失败/);
    assert.deepEqual(new Map(Array.from(saved.keys(), id => [id, point(id)])), updated);

    rejectSave = false;
    const coldId = "qa-cold-edit";
    saved.set(coldId, { id: coldId, kind: "text", x: 32000, y: 20000, width: 400, height: 110, text: "before" });
    assert.equal(await page.evaluate(id => Boolean(getCanvasNodeModel(id)), coldId), false);
    const changed = await page.evaluate(id => qaOrganize.call("update_node", {
      node_id: id, changes: { content: "离屏已保存" },
    }), coldId);
    assert.equal(changed.ok, true, JSON.stringify(changed));
    assert.equal(changed.persisted, true);
    assert.equal(saved.get(coldId).text, "离屏已保存");
    const moved = await page.evaluate(id => qaOrganize.call("move_nodes", { node_ids: [id], delta_x: 60, delta_y: 15 }), coldId);
    assert.equal(moved.ok, true, JSON.stringify(moved));
    assert.deepEqual(point(coldId), { x: 32060, y: 20015 });
    if (process.env.AGENT_REFERENCE === "1") {
      const sources = [initial.ids[0], initial.ids[1]];
      const target = await page.evaluate(reference_node_ids => qaOrganize.call("create_image_node", {
        title: "参考顺序验收", prompt: "顺序测试", reference_node_ids,
      }), sources);
      assert.equal(target.ok, true, JSON.stringify(target));
      const reversed = sources.toReversed();
      const reordered = await page.evaluate(({ node_id, reference_node_ids }) => qaOrganize.call("set_reference_order", {
        node_id, reference_node_ids,
      }), { node_id: target.node_id, reference_node_ids: reversed });
      assert.equal(reordered.ok, true, JSON.stringify(reordered));
      assert.equal(reordered.persisted, true);
      assert.deepEqual(saved.get(target.node_id).refOrder, reversed.map(id => `text:${id}:output`));
      const visibleOrder = await page.evaluate(id => getCanvasIncomingReferenceMaterials(id).map(item => item.sourceNodeId), target.node_id);
      assert.deepEqual(visibleOrder, reversed);
      const grouped = await page.evaluate(node_ids => qaOrganize.call("group_nodes", {
        node_ids, group_id: null, title: "Agent 分组验收",
      }), sources);
      assert.equal(grouped.ok, true, JSON.stringify(grouped));
      assert.equal(grouped.persisted, true);
      assert.deepEqual(saved.get(grouped.group_id).groupMembers, sources);
      const ungrouped = await page.evaluate(group_id => qaOrganize.call("ungroup_nodes", {
        group_id, node_ids: [],
      }), grouped.group_id);
      assert.equal(ungrouped.ok, true, JSON.stringify(ungrouped));
      assert.equal(ungrouped.persisted, true);
      assert.equal(saved.has(grouped.group_id), false);
      assert.ok(sources.every(id => saved.has(id)));
    }
    if (process.env.AGENT_AUDIO === "1") {
      const audioId = await page.evaluate(async () => {
        await loadCanvasAudioModels();
        const node = addCanvasAudioGeneratorNode({ x: 100, y: 300 }, {
          mode: "music", prompt: "验收音乐", modelId: "qa:ace-step", lyrics: "验收歌词",
        });
        node.dataset.boardId = canvasState.activeBoardId;
        return node.dataset.id;
      });
      const result = await page.evaluate(id => qaOrganize.call("run_canvas_node", { node_id: id }), audioId);
      assert.equal(result.ok, true, JSON.stringify(result));
      assert.equal(result.persisted, true);
      assert.equal(result.output.url, "/output/qa-audio.wav");
      assert.equal(audioRequests.length, 1);
      assert.equal(audioRequests[0].parameters.lyrics, "验收歌词");
      assert.equal(saved.get(audioId).audioGeneration.result.url, "/output/qa-audio.wav");
      assert.ok(saved.get(audioId).generationHistory.some(item => item.kind === "audio" && item.src === "/output/qa-audio.wav"));
      audioUncertain = true;
      const uncertain = await page.evaluate(id => qaOrganize.call("run_canvas_node", { node_id: id }), audioId);
      assert.equal(uncertain.code, "submission_unknown");
      const manual = await page.evaluate(id => CanvasAudioGenerator.run(ensureCanvasNodeMounted(id)), audioId);
      assert.equal(manual.code, "submission_unknown");
      assert.equal(audioRequests.length, 2);
    }

    const missing = await page.evaluate(id => qaOrganize.call("move_nodes", {
      node_ids: [id, "missing-target"], delta_x: 200, delta_y: 100,
    }), coldId);
    assert.equal(missing.ok, false);
    assert.deepEqual(point(coldId), { x: 32060, y: 20015 });
    if (process.env.AGENT_QUERY_SOURCE === "1") {
      saved.set(imageId, coldImage);
      const presets = await page.evaluate(() => qaOrganize.call("query_visual_presets", {
        name: "洛丽塔", group: "characterDesign", offset: 0,
      }));
      assert.equal(presets.ok, true, JSON.stringify(presets));
      const lolita = presets.items.find(item => item.name === "洛丽塔");
      assert.ok(lolita);
      const generator = await page.evaluate(() => qaOrganize.call("create_image_node", {
        title: "预设验收", prompt: "角色设定", reference_node_ids: [],
      }));
      assert.equal(generator.ok, true, JSON.stringify(generator));
      const configured = await page.evaluate(({ node_id, preset }) => qaOrganize.call("update_canvas_visual_presets", {
        node_id, add_ids: [preset], remove_ids: [],
      }), { node_id: generator.node_id, preset: lolita.id });
      assert.equal(configured.ok, true, JSON.stringify(configured));
      assert.equal(configured.persisted, true);
      assert.deepEqual(configured.selected_preset_ids, [lolita.id]);
      assert.equal(saved.get(generator.node_id).visualPresets.characterDesign[lolita.group], lolita.id);
      const history = await page.evaluate(({ node_id, source_node_id }) => qaOrganize.call("bind_canvas_image_history", {
        node_id, source_node_id, history_id: "older",
      }), { node_id: generator.node_id, source_node_id: imageId });
      assert.equal(history.ok, true, JSON.stringify(history));
      assert.equal(history.persisted, true);
      assert.equal(saved.get(generator.node_id).promptMentions[0].resultId, "older");
      assert.equal(saved.get(imageId).currentGenerationId, "head");
      const requestedImages = await page.evaluate(id => {
        const node = getCanvasNode(id);
        return getCanvasPromptImageRequest(node, undefined, getCanvasIncomingRefs(id)).refs.map(ref => ref.url);
      }, generator.node_id);
      assert.deepEqual(requestedImages, ["/output/qa-history.png"]);

      const assetList = await page.evaluate(() => qaOrganize.call("query_canvas_asset_library", {
        scope: "mine", kind: "image", name: "安静", offset: 0,
      }));
      assert.equal(assetList.ok, true, JSON.stringify(assetList));
      assert.deepEqual(assetList.assets, [{ id: "qa-asset", kind: "image", name: "安静试验素材" }]);
      assetAllowed = false;
      const blocked = await page.evaluate(id => qaOrganize.call("add_canvas_asset_reference", {
        node_id: id, asset_id: "qa-asset", scope: "mine",
      }), generator.node_id);
      assert.equal(blocked.ok, false);
      assetAllowed = true;
      const added = await page.evaluate(id => qaOrganize.call("add_canvas_asset_reference", {
        node_id: id, asset_id: "qa-asset", scope: "mine",
      }), generator.node_id);
      assert.equal(added.ok, true, JSON.stringify(added));
      assert.equal(added.persisted, true);
      assert.equal(saved.get(added.source_node_id).assetId, "qa-asset");

      const note = await page.evaluate(() => qaOrganize.call("create_note_node", {
        content: "便签正文", color: "pink", x: 120, y: 200,
      }));
      assert.equal(note.ok, true, JSON.stringify(note));
      assert.equal(note.persisted, true);
      assert.equal(saved.get(note.node_id).kind, "note");
      assert.equal(saved.get(note.node_id).text, "便签正文");

      const sound = await page.evaluate(() => qaOrganize.call("create_audio_node", {
        mode: "music", prompt: "清晨钢琴", model: "qa:ace-step", lyrics: "试听歌词", reference_node_ids: [],
        x: 140, y: 400,
      }));
      assert.equal(sound.ok, true, JSON.stringify(sound));
      assert.equal(sound.persisted, true);
      assert.equal(saved.get(sound.node_id).audioGeneration.prompt, "清晨钢琴");
      assert.equal(saved.get(sound.node_id).audioGeneration.modelId, "qa:ace-step");
      assert.equal(audioRequests.length, 0);
    }
    await page.evaluate(() => saveCanvasBoardNow());
    forceConflictAt = 2;
    conflictRequests = 0;
    const firstAccepted = batches.length;
    const partial = await page.evaluate(() => qaOrganize.run([], "column"));
    forceConflictAt = 0;
    assert.equal(partial.ok, false, JSON.stringify(partial));
    assert.equal(partial.persisted, false);
    assert.equal(partial.code, "canvas_revision_conflict");
    assert.equal(partial.confirmed_count, 500);
    assert.equal(conflictRequests, 2);
    assert.equal(batches.slice(firstAccepted).filter(batch => batch.length === 500).length, 1);
    if (process.env.AGENT_SCREENSHOT_DIR) {
      await page.screenshot({ path: path.join(process.env.AGENT_SCREENSHOT_DIR, "33200-organize-1440.png") });
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ local: initial.ids.length, empty: empty.code, whole: whole.organized_count, saved: edited.organized_count,
      saveFailure: failed.code, conflicts: [conflict.confirmed_count, partial.confirmed_count],
      coldEdit: changed.persisted, coldMoved: point(coldId),
      pageErrors: errors, fixture: "isolated HTTP storage responses" }));
  } finally {
    await browser.close();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
