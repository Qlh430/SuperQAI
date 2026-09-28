"use strict";

const assert = require("node:assert/strict");
const { createMediaTaskService } = require("../media-task-service");

function createMemoryFs(initial = "") {
  let contents = initial;
  return {
    existsSync: () => true,
    readFileSync: () => contents,
    writeFileSync: (_filePath, next) => { contents = String(next); },
    contents: () => contents,
  };
}

let clock = 10;
const fs = createMemoryFs();
const clearedTimers = [];
const service = createMediaTaskService({
  filePath: "media-tasks.json",
  fs,
  now: () => clock,
  persistDelayMs: 25,
  taskTtlMs: 100,
  setTimeoutFn: () => ({ unref() {} }),
  clearTimeoutFn: (timer) => { clearedTimers.push(timer); },
  logger: { log() {} },
});

service.set("video-1", {
  type: "api-video",
  status: "running",
  progress: 12,
  created_at: 1,
  resume: { resumeTask: { taskId: "upstream-1" } },
});
service.set("upscale-1", {
  type: "upscale",
  status: "running",
  progress: 20,
  created_at: 2,
});
service.update("video-1", { progress: 42, status: "pending" });
assert.equal(service.get("video-1").updated_at, 10, "updates must own their timestamp");
assert.equal(service.get("video-1").progress, 42);
assert.equal(service.persistNow(), true, "the service must persist through its filesystem adapter");

const persisted = JSON.parse(fs.contents());
assert.deepEqual(Object.keys(persisted), ["video-1"], "only resumable API video tasks are persisted");
assert.equal(persisted["video-1"].resume.resumeTask.taskId, "upstream-1");
assert.equal(persisted["video-1"].progress, 42);

service.setWatcher("video-1", { unref() {} });
assert.equal(service.hasWatcher("video-1"), true);
assert.equal(service.stopWatcher("video-1"), true);
assert.equal(service.hasWatcher("video-1"), false);
assert.equal(clearedTimers.length >= 1, true, "stopping a watcher must clear its timer");

const restoredWatches = [];
const restoreFs = createMemoryFs(JSON.stringify({
  "video-queued": {
    type: "api-video",
    status: "pending",
    progress: 71,
    created_at: 1,
    updated_at: 2,
    resume: { resumeTask: { taskId: "upstream-queued" } },
  },
  "video-finished": {
    type: "api-video",
    status: "success",
    progress: 100,
    created_at: 1,
    updated_at: 2,
    videos: ["/output/finished.mp4"],
    resume: { resumeTask: { taskId: "upstream-finished" } },
  },
  "video-without-upstream": {
    type: "api-video",
    status: "pending",
    progress: 5,
    resume: {},
  },
}));
const restored = createMediaTaskService({
  filePath: "restore.json",
  fs: restoreFs,
  now: () => 99,
  logger: { log() {} },
});
assert.equal(restored.restoreApiVideoTasks({
  onRestore: (taskId) => restoredWatches.push(taskId),
}), 2);
assert.equal(restored.get("video-queued").status, "pending");
assert.equal(restored.get("video-queued").progress, 71);
assert.equal(restored.get("video-finished").status, "success");
assert.deepEqual(restored.get("video-finished").videos, ["/output/finished.mp4"]);
assert.deepEqual(restoredWatches, ["video-queued"], "only unfinished tasks resume their watcher");
assert.equal(restored.has("video-without-upstream"), false);

clock = 500;
assert.equal(service.cleanupExpired(), true, "expired API video tasks are reported for persistence");
assert.equal(service.has("video-1"), false);
assert.equal(service.has("upscale-1"), false);
service.persistNow();
assert.deepEqual(JSON.parse(fs.contents()), {}, "expired tasks must leave the persisted snapshot");

service.dispose();
console.log("Media task service checks passed.");
