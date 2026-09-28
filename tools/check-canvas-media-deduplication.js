"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { CanvasMediaScheduler } = require("../canvas-media-scheduler");

(async () => {
  const scheduler = new CanvasMediaScheduler({ maxThumbnails: 1 });
  const taskKeys = new WeakMap();
  const pending = [];
  const script = fs.readFileSync(path.join(__dirname, "../script.js"), "utf8");
  const functions = script.slice(script.indexOf("function cancelCanvasMediaImage("), script.indexOf("function scheduleCanvasImageQualityUpdate("));
  let sequence = 0;
  const context = vm.createContext({
    canvasMediaScheduler: scheduler, canvasMediaTaskKeys: taskKeys,
    createId: () => String(++sequence),
    window: { imageResources: {
      showThumbnail: img => new Promise(resolve => pending.push(() => {
        img.dataset.imageQuality = "thumbnail";
        resolve();
      })),
      unload: img => { delete img.dataset.imageQuality; },
    } },
  });
  vm.runInContext(functions, context);
  const makeImage = id => ({ dataset: {}, closest: () => ({ dataset: { id } }) });
  const a = makeImage("a"), b = makeImage("b");
  try {
    const aKey = context.scheduleCanvasMediaImage(a, "thumbnail", 80);
    const bKey = context.scheduleCanvasMediaImage(b, "thumbnail", 80);
    const initialSequence = scheduler.sequence;
    for (let scan = 0; scan < 100; scan++) {
      assert.equal(context.scheduleCanvasMediaImage(a, "thumbnail", 80), aKey);
      assert.equal(context.scheduleCanvasMediaImage(b, "thumbnail", 80), bKey);
    }
    assert.equal(scheduler.sequence, initialSequence, "visibility scans must not cancel and requeue pending thumbnails");
    assert.equal(scheduler.getDiagnostics().queuedThumbnails, 1);
    await new Promise(resolve => setImmediate(resolve));
    pending.shift()();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(pending.length, 1, "the second image must run after the first completes");
    pending.shift()();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(scheduler.isPending(bKey), false);
    context.scheduleCanvasMediaImage(b, "thumbnail", 80);
    assert.equal(scheduler.sequence, initialSequence, "a decoded preview is reused");
    context.cancelCanvasMediaImage(b);
    context.scheduleCanvasMediaImage(b, "thumbnail", 80);
    assert.equal(scheduler.sequence, initialSequence + 1, "returning to an unloaded image must schedule it again");
    console.log("Canvas pending thumbnail deduplication checks passed.");
  } finally { scheduler.dispose(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
