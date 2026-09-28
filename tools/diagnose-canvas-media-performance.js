"use strict";
// Read-only snapshot of a local board; all browser writes and generated previews
// go to a disposable, isolated database/output directory.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { DatabaseSync, backup } = require("node:sqlite");
const { spawn } = require("node:child_process");
const { chromium } = require("playwright");
const ROOT = path.resolve(__dirname, "..");
async function run() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "aios-board-profile-"));
  const artifacts = path.join(ROOT, "artifacts", "canvas-media-performance");
  fs.mkdirSync(artifacts, { recursive: true });
  let board;
  if (process.argv.includes("--synthetic-detail")) {
    board = await require("./create-canvas-rich-board-fixture")(temp, { generatorCount: 35, galleryCount: 30 });
  } else if (process.argv.includes("--synthetic")) {
    board = await require("./create-canvas-rich-board-fixture")(temp);
  } else {
  const source = new DatabaseSync(path.join(ROOT, "data/canvas.db"), { readOnly: true });
  const boardId = process.argv.find(arg => arg.startsWith("--board="))?.slice(8);
  board = boardId
    ? source.prepare("SELECT * FROM boards WHERE external_id=? AND deleted_at IS NULL").get(boardId)
    : source.prepare("SELECT b.* FROM boards b JOIN nodes n ON n.board_pk=b.pk WHERE b.deleted_at IS NULL GROUP BY b.pk ORDER BY count(n.pk) DESC LIMIT 1").get();
  if (!board) throw new Error("No matching board");
  await backup(source, path.join(temp, "canvas.db"));
  const refs = new Set();
  function collect(value) {
    if (typeof value === "string" && value.startsWith("/output/")) refs.add(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object") Object.values(value).forEach(collect);
  }
  source.prepare("SELECT payload_json FROM nodes WHERE board_pk=?").all(board.pk).forEach(row => collect(JSON.parse(row.payload_json)));
  source.close();
  for (const ref of refs) {
    const relative = decodeURIComponent(ref.split("?")[0].slice("/output/".length));
    const from = path.resolve(ROOT, "output", relative), to = path.resolve(temp, "output", relative);
    if (!from.startsWith(path.join(ROOT, "output") + path.sep) || !to.startsWith(path.join(temp, "output") + path.sep)) throw new Error("Invalid media path");
    if (!fs.existsSync(from)) continue;
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
  }
  if (process.argv.includes("--original-overview")) {
    // Repeat the captured diagnostic viewport on the disposable copy only.
    const copy = new DatabaseSync(path.join(temp, "canvas.db"));
    copy.prepare("UPDATE boards SET viewport_json=? WHERE external_id=?").run(
      JSON.stringify({ x: 411.6237547647818, y: 10.204296637686639, scale: 0.18979849692465448 }), board.external_id,
    );
    copy.close();
  }
  const probe = http.createServer();
  await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: ROOT, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: {
      ...process.env, PORT: String(port), HOST: "127.0.0.1", AI_OS_SKIP_ENV_FILE: "1", AI_OS_AUTH_DISABLED: "1",
      AI_OS_DATA_DIR: temp, AI_OS_SYSTEM_DB_FILE: path.join(temp, "system.sqlite"), AI_OS_OUTPUT_DIR: path.join(temp, "output"),
      CANVAS_DB_FILE: path.join(temp, "canvas.db"), CANVAS_LEGACY_FILE: path.join(temp, "none.json"), CANVAS_BACKUP_DIR: path.join(temp, "backups"),
      CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false", CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false", AI_IMAGE_API_KEY: "", AI_IMAGE_API_URL: "",
    },
  });
  let logs = "", browser;
  child.stdout.on("data", c => logs += c); child.stderr.on("data", c => logs += c);
  try {
    const origin = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let i = 0; i < 200; i++) { try { if ((await fetch(origin + "/api/auth/session")).ok) { ready = true; break; } } catch {} await new Promise(r => setTimeout(r, 50)); }
    if (!ready) throw new Error(logs);
    browser = await chromium.launch({ headless: true, executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", args: ["--enable-precise-memory-info"] });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    // Never let test activity call external generation or other services.
    await page.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await page.locator("#aiOsDesktop:not([hidden])").waitFor();
    await page.locator('[data-ai-app="canvas"]').click();
    await page.locator("#canvasLibraryScreen").waitFor();
    await page.evaluate(() => {
      window.__perf = {};
      for (const name of ["updateCanvasImageQualities", "renderCanvasGalleryContainerNode", "syncCanvasGalleryMemberIntrinsicSize", "renderCanvasConnections", "refreshAllCanvasRefs", "updateCanvasNodeRefs", "refreshCanvasImageModelSelects", "applyCanvasNodeSize", "applyCanvasTransformNow", "scheduleCanvasTransform", "renderCanvasSceneLayer", "reprojectCanvasSceneLayer", "updateCanvasSelectionFrame", "scheduleCanvasSceneRender", "scheduleCanvasSave"]) {
        const original = window[name]; if (typeof original !== "function") continue;
        window[name] = function(...args) { const start = performance.now(); try { return original.apply(this, args); } finally { const ms = performance.now() - start, item = window.__perf[name] ||= { calls: 0, total: 0, max: 0 }; item.calls++; item.total += ms; item.max = Math.max(item.max, ms); } };
      }
      let storedConnections = canvasState.connections;
      window.__connectionPerf = { maxRead: 0, maxWrite: 0, writes: 0 };
      Object.defineProperty(canvasState, "connections", {
        configurable: true,
        get() {
          const length = Array.isArray(storedConnections) ? storedConnections.length : 0;
          window.__connectionPerf.maxRead = Math.max(window.__connectionPerf.maxRead, length);
          return storedConnections;
        },
        set(value) {
          storedConnections = value;
          window.__connectionPerf.maxWrite = Math.max(
            window.__connectionPerf.maxWrite,
            Array.isArray(value) ? value.length : 0,
          );
          window.__connectionPerf.writes += 1;
        },
      });
      window.__virtualizerPerf = {};
      for (const name of ["mountAdapter", "unmountAdapter", "replaceAdapter", "requestData", "afterFlush"]) {
        const original = canvasVirtualizer?.[name];
        if (typeof original !== "function") continue;
        canvasVirtualizer[name] = function(...args) {
          const start = performance.now();
          try { return original.apply(this, args); }
          finally {
            const ms = performance.now() - start;
            const item = window.__virtualizerPerf[name] ||= { calls: 0, total: 0, max: 0 };
            item.calls += 1;
            item.total += ms;
            item.max = Math.max(item.max, ms);
          }
        };
      }
      window.__scenePerf = {};
      window.__long = [];
      new PerformanceObserver(list => window.__long.push(...list.getEntries().map(e => ({ start: e.startTime, duration: e.duration })))).observe({ type: "longtask" });
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Profiler.enable"); await cdp.send("Profiler.start");
    const started = Date.now();
    await page.evaluate(async id => {
      const board = await (await fetch(`/api/canvas/boards/${id}/meta`)).json();
      return openCanvasBoardFromHistory(board);
    }, board.external_id);
    const openMs = Date.now() - started;
    await page.waitForTimeout(8000);
    await page.evaluate(() => {
      const layer = window.canvasSceneLayer;
      for (const name of ["render", "reproject", "needsRepaint", "resize"]) {
        const original = layer?.[name] || window.CanvasSceneLayer?.prototype?.[name];
        if (typeof original !== "function" || original.__diagnosticWrapped) continue;
        const wrapped = function(...args) {
          const start = performance.now();
          try {
            const result = original.apply(this, args);
            const item = window.__scenePerf[name] ||= { calls: 0, total: 0, max: 0, true: 0, false: 0 };
            if (name === "needsRepaint") item[result ? "true" : "false"] += 1;
            return result;
          } finally {
            const ms = performance.now() - start, item = window.__scenePerf[name] ||= { calls: 0, total: 0, max: 0, true: 0, false: 0 };
            item.calls++; item.total += ms; item.max = Math.max(item.max, ms);
          }
        };
        wrapped.__diagnosticWrapped = true;
        if (layer && typeof layer[name] === "function") layer[name] = wrapped;
        else if (window.CanvasSceneLayer?.prototype) window.CanvasSceneLayer.prototype[name] = wrapped;
      }
      const schedule = window.canvasVirtualizer?.schedule;
      if (typeof schedule === "function" && !schedule.__diagnosticWrapped) {
        const wrapped = function(...args) {
          const start = performance.now();
          try { return schedule.apply(this, args); }
          finally {
            const ms = performance.now() - start, item = window.__perf.virtualizerSchedule ||= { calls: 0, total: 0, max: 0 };
            item.calls++; item.total += ms; item.max = Math.max(item.max, ms);
          }
        };
        wrapped.__diagnosticWrapped = true;
        window.canvasVirtualizer.schedule = wrapped;
      }
    });
    if (process.argv.includes("--duplicate-interactions")) {
      await require("./check-canvas-duplicate-interactions")({ page, board, origin, temp });
    }
    const { profile } = await cdp.send("Profiler.stop");
    const metrics = await page.evaluate(() => ({
      timings: window.__perf, longTasks: window.__long,
      sceneTimings: window.__scenePerf,
      mounted: canvasVirtualStore.mountedElements().length, resident: canvasVirtualStore.size,
      scene: window.canvasSceneLayer?.getDiagnostics?.() || null,
      viewport: { x: canvasState.x, y: canvasState.y, scale: canvasState.scale },
      connectionState: {
        count: canvasState.connections.length,
        renderedElements: window.canvasConnectionElements?.size || 0,
        galleryMemberPorts: document.querySelectorAll(".canvas-gallery-member-output-port").length,
        ...window.__connectionPerf,
      },
      virtualizerTimings: window.__virtualizerPerf,
      dom: document.querySelectorAll("#canvasPlane *").length,
      images: [...document.querySelectorAll("#canvasPlane img")].map(i => ({ width: i.naturalWidth, quality: i.dataset.imageQuality, displayed: !!i.getAttribute("src") })),
      resources: performance.getEntriesByType("resource").filter(r => /image-thumbnails|\/output\//.test(r.name)).map(r => ({ path: new URL(r.name).pathname, duration: r.duration, size: r.transferSize })),
      heapMB: performance.memory.usedJSHeapSize / 1024 / 1024,
    }));
    if (process.argv.includes("--scale-sweep")) {
      metrics.scaleSweep = await page.evaluate(async () => {
        const viewport = document.querySelector("#infiniteCanvas");
        const viewportRect = viewport.getBoundingClientRect();
        const centerX = viewport.clientWidth / 2;
        const centerY = viewport.clientHeight / 2;
        const worldX = (centerX - canvasState.x) / canvasState.scale;
        const worldY = (centerY - canvasState.y) / canvasState.scale;
        const results = [];
        for (const scale of [0.25, 0.4, 0.6, 0.9, 1.2, 1.8]) {
          canvasState.scale = scale;
          canvasState.x = centerX - worldX * scale;
          canvasState.y = centerY - worldY * scale;
          scheduleCanvasTransform();
          canvasVirtualizer.schedule();
          await new Promise(resolve => setTimeout(resolve, 2500));
          const times = [];
          for (let i = 0; i < 40; i++) {
            const started = performance.now();
            canvasState.x += i % 2 ? 3 : -3;
            scheduleCanvasTransform();
            await new Promise(resolve => requestAnimationFrame(resolve));
            times.push(performance.now() - started);
          }
          const page = canvasPagedStore.scenePage;
          results.push({
            scale,
            mode: page?.mode || "detail",
            candidateCount: page?.candidateCount || canvasPagedStore.values().length,
            visualNodes: page?.visualNodeCount || page?.nodes?.length || 0,
            mounted: canvasVirtualStore.mountedElements().length,
            domNodes: document.querySelectorAll("#canvasPlane .canvas-node").length,
            panP95Ms: times.sort((a, b) => a - b)[Math.max(0, Math.ceil(times.length * 0.95) - 1)],
            scene: window.canvasSceneLayer?.getDiagnostics?.() || null,
          });
        }
        return results;
      });
      console.log("Scale sweep", metrics.scaleSweep);
    }
    if (process.argv.includes("--trace")) await cdp.send("Tracing.start", { categories: "devtools.timeline,disabled-by-default-devtools.timeline", transferMode: "ReturnAsStream" });
    const interaction = await page.evaluate(async () => {
      const changes = {};
      const observer = new MutationObserver(records => { for (const record of records) { const key = `${record.target.id || record.target.classList?.[0] || record.target.nodeName}:${record.attributeName || record.type}`; changes[key] = (changes[key] || 0) + 1; } });
      observer.observe(document.querySelector("#canvasPlane"), { subtree: true, childList: true, attributes: true });
      const frames = [], work = [];
      for (let i = 0; i < 90; i++) {
        const started = performance.now();
        canvasState.x += i % 2 ? 2 : -2;
        scheduleCanvasTransform();
        work.push(performance.now() - started);
        await new Promise(resolve => requestAnimationFrame(resolve));
        frames.push(performance.now() - started);
      }
      const p95 = values => values.sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];
      observer.disconnect();
      return { panP95Ms: p95(frames), inputP95Ms: p95(work), mutations: Object.entries(changes).sort((a,b) => b[1]-a[1]).slice(0,12) };
    });
    if (process.argv.includes("--trace")) {
      const complete = new Promise(resolve => cdp.once("Tracing.tracingComplete", resolve));
      await cdp.send("Tracing.end");
      const { stream } = await complete;
      let trace = "", part;
      do { part = await cdp.send("IO.read", { handle: stream }); trace += part.data; } while (!part.eof);
      await cdp.send("IO.close", { handle: stream });
      fs.writeFileSync(path.join(artifacts, (process.argv[2] || "profile") + "-trace.json"), trace);
    }
    Object.assign(metrics, interaction);
    if (process.argv.includes("--pan-experiments")) {
      await page.waitForTimeout(16000);
      metrics.experiments = await page.evaluate(async () => {
        const result = {};
        const viewport = document.querySelector("#infiniteCanvas");
        const plane = document.querySelector("#canvasPlane");
        const measure = async (name, delta = 2) => {
          const times = [];
          for (let i = 0; i < 40; i++) {
            const start = performance.now();
            canvasState.x += delta;
            scheduleCanvasTransform();
            await new Promise(resolve => requestAnimationFrame(resolve));
            times.push(performance.now() - start);
          }
          result[name] = times.sort((a,b) => a-b)[37];
        };
        const measureZoom = async (name, steps = 40) => {
          const times = [];
          const viewportRect = viewport.getBoundingClientRect();
          const clientX = viewportRect.left + viewportRect.width / 2;
          const clientY = viewportRect.top + viewportRect.height / 2;
          const startX = canvasState.x, startY = canvasState.y, startScale = canvasState.scale;
          for (let i = 0; i < steps; i++) {
            const start = performance.now();
            viewport.dispatchEvent(new WheelEvent("wheel", {
              deltaY: i % 2 ? -120 : 120,
              deltaMode: 0,
              clientX,
              clientY,
              bubbles: true,
              cancelable: true,
            }));
            await new Promise(resolve => requestAnimationFrame(resolve));
            times.push(performance.now() - start);
          }
          canvasState.x = startX;
          canvasState.y = startY;
          canvasState.scale = startScale;
          scheduleCanvasTransform();
          await new Promise(resolve => requestAnimationFrame(resolve));
          result[name] = times.sort((a,b) => a-b)[Math.max(0, Math.ceil(times.length * 0.95) - 1)];
        };
        await measure("settled");
        await measureZoom("zoom");
        const beforeFarPan = { ...window.__scenePerf };
        const farStart = canvasState.x;
        await measure("panFar", 24);
        canvasState.x = farStart;
        scheduleCanvasTransform();
        await new Promise(resolve => requestAnimationFrame(resolve));
        result.farPanSceneDelta = Object.fromEntries(Object.keys(window.__scenePerf).map(key => [key, {
          calls: window.__scenePerf[key].calls - (beforeFarPan[key]?.calls || 0),
          true: (window.__scenePerf[key].true || 0) - (beforeFarPan[key]?.true || 0),
          false: (window.__scenePerf[key].false || 0) - (beforeFarPan[key]?.false || 0),
        }]));
        const nodes = [...plane.querySelectorAll(".canvas-node")];
        for (const node of nodes) node.style.setProperty("backdrop-filter", "none", "important");
        result.nodeBackdrop = nodes[0] ? getComputedStyle(nodes[0]).backdropFilter : null;
        await measure("noNodeBackdrop");
        for (const node of nodes) node.style.setProperty("will-change", "transform");
        await measure("noBackdropNodeLayers");
        for (const node of nodes) node.style.removeProperty("will-change");
        for (const node of nodes) node.style.setProperty("contain", "layout paint", "important");
        await measure("containedNodes");
        for (const node of nodes) node.style.removeProperty("contain");
        for (const node of nodes) node.style.removeProperty("backdrop-filter");
        const isolation = document.createElement("style");
        document.head.append(isolation);
        isolation.textContent = "* { box-shadow: none !important; text-shadow: none !important; }";
        await measure("noShadows");
        isolation.textContent = "*, *::before, *::after { filter: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }";
        await measure("noFilters");
        isolation.textContent = "*, *::before, *::after { animation: none !important; transition: none !important; }";
        await measure("noAnimation");
        isolation.textContent = "";
        const originalApply = window.applyCanvasTransformNow;
        window.applyCanvasTransformNow = () => { plane.style.transform = `translate(${canvasState.x}px, ${canvasState.y}px) scale(${canvasState.scale}) translateZ(0)`; };
        await measure("onlyTransform");
        window.applyCanvasTransformNow = () => { plane.style.transform = `translate(${canvasState.x}px, ${canvasState.y}px) scale(${canvasState.scale})`; };
        await measure("only2dTransform");
        window.applyCanvasTransformNow = originalApply;
        isolation.remove();
        result.filters = [...document.querySelectorAll("*")].filter(el => { const c = getComputedStyle(el); return el.getBoundingClientRect().width && (c.filter !== "none" || c.backdropFilter !== "none"); }).slice(0,25).map(el => ({ tag: el.tagName, className: String(el.className), id: el.id, filter: getComputedStyle(el).filter, backdrop: getComputedStyle(el).backdropFilter }));
        return result;
      });
      console.log("Pan isolation experiments", metrics.experiments);
    }
    const label = process.argv[2] || "profile";
    fs.writeFileSync(path.join(artifacts, label + ".cpuprofile"), JSON.stringify(profile));
    fs.writeFileSync(path.join(artifacts, label + ".json"), JSON.stringify({ openMs, ...metrics, errors }, null, 2));
    await page.screenshot({ path: path.join(artifacts, label + ".png") });
    console.log(JSON.stringify({ openMs, timings: metrics.timings, mounted: metrics.mounted, dom: metrics.dom, images: metrics.images.length, loaded: metrics.images.filter(i => i.width).length, longTasks: metrics.longTasks, requests: metrics.resources.length, heapMB: metrics.heapMB, ...interaction, errors }, null, 2));
    if (process.argv.includes("--check")) {
      const assert = require("node:assert/strict");
      const sceneMode = metrics.scene?.spriteCount > 0 && metrics.mounted === 0;
      assert.equal(errors.length, 0, "no browser errors");
      assert.ok(openMs < 2000, `opening stayed blocked for ${openMs}ms`);
      assert.ok(Math.max(0, ...metrics.longTasks.map(t => t.duration)) < 300, "a rich-board frame blocked input for 300ms");
      assert.equal(metrics.resources.filter(r => /^\/output\/(?!thumbnails\/)/.test(r.path)).length, 0, "overview must not download originals");
      if (sceneMode) {
        assert.ok(metrics.scene.spriteCount >= 180, "the full rich board must be present in the scene layer");
        assert.ok(metrics.dom <= 10, "scene mode must not mount the rich nodes as DOM");
      } else {
        assert.ok(metrics.mounted > 20 && metrics.mounted <= 80, "detail fixtures must mount a bounded number of real nodes");
        assert.ok(metrics.images.filter(i => i.width === 640).length >= 30, "real 640px previews must be decoded");
      }
      assert.ok(interaction.panP95Ms < 50, `pan P95 ${interaction.panP95Ms}ms`);
      assert.ok(interaction.inputP95Ms < 16, `input P95 ${interaction.inputP95Ms}ms`);
      console.log("Rich canvas performance checks passed.");
    }
  } finally {
    await browser?.close();
    if (child.exitCode === null) { child.kill(); await new Promise(resolve => child.once("exit", resolve)); }
    if (!path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error("Unsafe cleanup");
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
run().catch(e => { console.error(e); process.exitCode = 1; });
