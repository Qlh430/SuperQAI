const assert = require("node:assert/strict");
const { CanvasMediaScheduler } = require("../canvas-media-scheduler");

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

(async () => {
  const active = { thumbnail: 0, original: 0 };
  const peak = { thumbnail: 0, original: 0 };
  const aborted = { thumbnail: 0, original: 0 };
  const releases = new Map();

  function deferredTask(nodeId, quality) {
    return {
      nodeId,
      quality,
      priority: Number(nodeId.split("-").at(-1)) || 0,
      release() {
        releases.set(`${nodeId}:${quality}`, (releases.get(`${nodeId}:${quality}`) || 0) + 1);
      },
      run(signal) {
        active[quality] += 1;
        peak[quality] = Math.max(peak[quality], active[quality]);
        return new Promise((resolve, reject) => {
          signal.addEventListener("abort", () => {
            active[quality] -= 1;
            aborted[quality] += 1;
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          }, { once: true });
        });
      },
    };
  }

  const scheduler = new CanvasMediaScheduler({ maxThumbnails: 6, maxOriginals: 2 });
  for (let index = 0; index < 10; index += 1) {
    scheduler.enqueue(deferredTask(`thumb-${index}`, "thumbnail"));
  }
  for (let index = 0; index < 5; index += 1) {
    scheduler.enqueue(deferredTask(`full-${index}`, "original"));
  }
  await nextTurn();
  assert.equal(active.thumbnail, 6);
  assert.equal(active.original, 2);
  assert.equal(peak.thumbnail, 6);
  assert.equal(peak.original, 2);

  scheduler.setInteractionActive(true);
  await nextTurn();
  assert.equal(active.original, 0);
  assert.equal(aborted.original, 2);
  assert.equal(aborted.thumbnail, 0);
  assert.equal(active.thumbnail, 6);

  scheduler.cancelNode("thumb-9");
  scheduler.cancelNode("thumb-9");
  await nextTurn();
  assert.equal(releases.get("thumb-9:thumbnail"), 1, "a viewport departure releases once");

  scheduler.setInteractionActive(false);
  await nextTurn();
  assert.equal(active.original, 2, "original work resumes after interaction settles");
  assert.ok(peak.original <= 2);
  scheduler.dispose();
  await nextTurn();
  assert.ok(peak.thumbnail <= 6);
  assert.ok(peak.original <= 2);
  releases.forEach((count) => assert.equal(count, 1));

  const timers = [];
  const retryDelays = [];
  let attempts = 0;
  let retryReleaseCount = 0;
  const retryScheduler = new CanvasMediaScheduler({
    setTimer(callback, delay) {
      const timer = { callback, delay, canceled: false };
      timers.push(timer);
      retryDelays.push(delay);
      return timer;
    },
    clearTimer(timer) {
      if (timer) timer.canceled = true;
    },
  });
  retryScheduler.enqueue({
    nodeId: "retry-node",
    quality: "thumbnail",
    priority: 1,
    release() { retryReleaseCount += 1; },
    run() {
      attempts += 1;
      return Promise.reject(new Error(`failure-${attempts}`));
    },
  });
  await nextTurn();
  for (const expectedDelay of [250, 1000, 4000]) {
    const timer = timers.shift();
    assert.equal(timer.delay, expectedDelay);
    timer.callback();
    await nextTurn();
  }
  assert.equal(attempts, 4);
  assert.deepEqual(retryDelays, [250, 1000, 4000]);
  assert.equal(retryReleaseCount, 1, "terminal media failure releases once");
  retryScheduler.dispose();
  assert.equal(retryReleaseCount, 1);

  console.log("Canvas media scheduler checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
