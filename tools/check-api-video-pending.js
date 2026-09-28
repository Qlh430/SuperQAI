const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createMediaTaskService } = require("../media-task-service");

const root = path.join(__dirname, "..");
const clientSource = fs.readFileSync(path.join(root, "script.js"), "utf8");
const serverSource = fs.readFileSync(path.join(root, "server.js"), "utf8");
const serviceSource = fs.readFileSync(path.join(root, "api-video-task-service.js"), "utf8");

function extractFunction(source, name) {
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
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unterminated function ${name}`);
}

function serverHarness(overrides = {}) {
  const context = {
    pollMs: 1,
    taskTimeoutMs: 40,
    updates: [],
    calls: 0,
    watches: [],
    UPSCALE_TASKS: new Map(),
    mediaTaskService: {
      get(taskId) {
        return context.UPSCALE_TASKS.get(String(taskId || ""));
      },
    },
    scheduleWatch: (taskId) => { context.watches.push(taskId); },
    mediaProviderBridge: { generateVideo: async () => ({ data: [] }) },
    updateTask: (_taskId, patch) => { context.updates.push(patch); },
    isVideoMediaUrl: () => false,
    saveRemoteVideo: async () => "",
    registerVideoOutput: async () => {},
    waitForAbortableDelay: async () => {},
    ...overrides,
  };
  context.now = (() => { let clock = 0; return () => (clock += 10); })();
  vm.runInNewContext(
    [
      extractFunction(serviceSource, "queueMessage"),
      extractFunction(serviceSource, "isPendingError"),
      `async ${extractFunction(serviceSource, "runTask").replace("function runTask(", "function runApiVideoTask(")}`,
    ].join("\n"),
    context,
  );
  return context;
}

function failing(status) {
  return Object.assign(new Error(status), { code: status });
}

(async () => {
  // A queued clip keeps the task alive and reports the queue position.
  const queued = serverHarness({
    mediaProviderBridge: {
      generateVideo: async () => {
        queued.calls += 1;
        return { data: [], task_id: "clip", progress: { state: "queued", position: 93_831, length: 309_790 } };
      },
    },
  });
  await queued.runApiVideoTask("task-queued", { prompt: "clip", resumeTask: { taskId: "clip" } });
  assert.ok(queued.calls > 0, "a queued clip must keep polling the same task");
  const queuedFinal = queued.updates.at(-1);
  assert.equal(queuedFinal.status, "pending", "running out of the wait window on a live upstream task is not a failure");
  assert.equal(queuedFinal.error, "");
  assert.match(queuedFinal.message, /排队中.*93831.*309790/);
  assert.ok(queued.watches.includes("task-queued"), "a queued clip must keep being followed in the background");

  // A transport hiccup on a task that already has an upstream id is retried, never failed.
  const hiccup = serverHarness();
  hiccup.mediaProviderBridge = {
    generateVideo: async () => {
      hiccup.calls += 1;
      throw failing("UPSTREAM_TASK_PENDING");
    },
  };
  await hiccup.runApiVideoTask("task-hiccup", { prompt: "clip", resumeTask: { taskId: "clip" } });
  assert.ok(hiccup.calls > 1, "a pending upstream task must be polled again");
  const hiccupFinal = hiccup.updates.at(-1);
  assert.equal(hiccupFinal.status, "pending");
  assert.match(hiccupFinal.message, /任务已保留/);

  // A genuine failure still stops the loop and stays a failure.
  const broken = serverHarness();
  broken.mediaProviderBridge = {
    generateVideo: async () => {
      broken.calls += 1;
      throw failing("UPSTREAM_TASK_FAILED");
    },
  };
  await assert.rejects(() => broken.runApiVideoTask("task-broken", { prompt: "clip" }), (error) => error.code === "UPSTREAM_TASK_FAILED");
  assert.equal(broken.calls, 1, "a terminal upstream failure must not be retried");

  // The canvas node reports a queue instead of an error once its own window closes.
  const statuses = [];
  const clientContext = {
    UPSCALE_STATUS_API_URL: "/api/upscale/status",
    setCanvasH3Status: (_node, message) => statuses.push(message),
    encodeURIComponent,
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: "running", progress: 42, message: "即梦排队中：前面还有 93831 位（共 309790 位）" }),
    }),
    setTimeout: (callback) => { callback(); return 0; },
  };
  vm.runInNewContext(`async ${extractFunction(clientSource, "waitForCanvasApiVideoTask")}`, clientContext);
  await assert.rejects(
    () => clientContext.waitForCanvasApiVideoTask({}, "task-queued"),
    (error) => {
      assert.equal(error.code, "video_task_pending");
      assert.match(error.message, /排队中/);
      return true;
    },
  );
  assert.match(statuses.at(-1), /排队中/);

  // The node continues an already submitted clip instead of paying for a second one.
  const runCalls = [];
  const runNode = {
    classList: { contains: () => true },
    dataset: {
      apiVideoModel: "seedance2.0",
      apiVideoTaskId: "task-queued",
      apiVideoRatio: "16:9",
      apiVideoResolution: "720p",
      apiVideoDuration: "4",
    },
    querySelector: (selector) => {
      if (selector === ".canvas-api-video-prompt-input") return { value: "a cinematic drone shot", readOnly: false };
      if (selector === ".canvas-api-video-run") return { disabled: false };
      return null;
    },
  };
  const runContext = {
    API_VIDEO_API_URL: "/api/videos",
    syncCanvasApiVideoPrompt: () => {},
    syncCanvasApiVideoRunButton: () => {},
    getCanvasApiVideoRefs: () => [],
    canvasH3ReferencePayload: () => null,
    waitForCanvasApiVideoTask: async () => ({ videos: ["/output/clip.mp4"] }),
    getOrCreateCanvasAssetOutput: () => ({ classList: { contains: () => true } }),
    appendCanvasVideoOutputHistory: () => {},
    scheduleCanvasSave: () => {},
    setCanvasH3Status: () => {},
    watchCanvasApiVideoTask: (node) => { runContext.watched.push(String(node.dataset.apiVideoTaskId || "")); },
    stopCanvasApiVideoWatch: () => {},
    watched: [],
    window: {},
    fetch: async (url, options) => {
      runCalls.push({ url, options });
      return { ok: true, status: 202, json: async () => ({ task_id: "task-queued" }) };
    },
  };
  vm.runInNewContext(
    [
      extractFunction(clientSource, "deliverCanvasApiVideoResult"),
      `async ${extractFunction(clientSource, "runCanvasApiVideoNode")}`,
    ].join("\n"),
    runContext,
  );
  await runContext.runCanvasApiVideoNode(runNode, {});
  assert.equal(runCalls.length, 1);
  assert.equal(runCalls[0].url, "/api/videos/task-queued/resume", "a queued clip must continue its own task");
  assert.equal(runCalls[0].options?.method, "POST");
  assert.equal(runNode.dataset.apiVideoTaskId, undefined, "a delivered clip clears the resumable task id");
  assert.deepEqual(runContext.watched, [], "a clip that already landed leaves nothing to follow");

  // A queued clip ends on a slow follow-up instead of a node the user has to babysit.
  const pendingRunContext = {
    ...runContext,
    watched: [],
    watchCanvasApiVideoTask: (node) => { pendingRunContext.watched.push(String(node.dataset.apiVideoTaskId || "")); },
    waitForCanvasApiVideoTask: async () => {
      const pending = new Error("即梦排队中：前面还有 93831 位（共 309790 位）");
      pending.code = "video_task_pending";
      throw pending;
    },
    fetch: async () => ({ ok: true, status: 202, json: async () => ({ task_id: "task-slow" }) }),
  };
  vm.runInNewContext(
    [
      extractFunction(clientSource, "deliverCanvasApiVideoResult"),
      `async ${extractFunction(clientSource, "runCanvasApiVideoNode")}`,
    ].join("\n"),
    pendingRunContext,
  );
  const pendingNode = { ...runNode, dataset: { ...runNode.dataset, apiVideoTaskId: undefined } };
  await pendingRunContext.runCanvasApiVideoNode(pendingNode, {});
  assert.deepEqual(pendingRunContext.watched, ["task-slow"], "a queued clip starts a slow background follow-up");
  assert.equal(pendingNode.dataset.apiVideoTaskId, "task-slow");

  // Hours later the follow-up pulls the finished clip into the node on its own.
  const watchTicks = [];
  const watchDelivered = [];
  const watchStatuses = [];
  const watchContext = {
    UPSCALE_STATUS_API_URL: "/api/upscale/status",
    getOrCreateCanvasAssetOutput: () => ({ classList: { contains: () => true } }),
    appendCanvasVideoOutputHistory: (_output, video) => watchDelivered.push(video.src),
    scheduleCanvasSave: () => {},
    syncCanvasApiVideoRunButton: () => {},
    setCanvasH3Status: (_node, message) => watchStatuses.push(message),
    window: {
      setTimeout: (callback, delay) => { watchTicks.push({ callback, delay }); return 0; },
      clearTimeout: () => {},
    },
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: "success", videos: ["/output/slow.mp4"] }),
    }),
  };
  vm.runInNewContext(
    [
      "const canvasApiVideoWatchers = new Map();",
      "const CANVAS_API_VIDEO_WATCH_MS = 30000;",
      extractFunction(clientSource, "stopCanvasApiVideoWatch"),
      extractFunction(clientSource, "watchCanvasApiVideoTask"),
      extractFunction(clientSource, "deliverCanvasApiVideoResult"),
    ].join("\n"),
    watchContext,
  );
  const watchNode = {
    dataset: { apiVideoTaskId: "task-slow", apiVideoPrompt: "slow clip" },
    isConnected: true,
    querySelector: () => null,
  };
  watchContext.watchCanvasApiVideoTask(watchNode, 1);
  assert.equal(watchTicks.length, 1, "the slow follow-up starts on a timer");
  await watchTicks[0].callback();
  assert.equal(watchNode.dataset.apiVideoTaskId, undefined, "the finished clip clears the follow-up id");
  assert.deepEqual(watchDelivered, ["/output/slow.mp4"], "the finished clip lands in the node by itself");
  assert.ok(watchStatuses.includes("生成完成"));

  const freshCalls = [];
  const freshNode = { ...runNode, dataset: { ...runNode.dataset, apiVideoTaskId: undefined } };
  const freshContext = {
    ...runContext,
    waitForCanvasApiVideoTask: async () => ({ videos: [] }),
    fetch: async (url, options) => {
      freshCalls.push({ url, options });
      return { ok: true, status: 202, json: async () => ({ task_id: "task-new" }) };
    },
  };
  vm.runInNewContext(`async ${extractFunction(clientSource, "runCanvasApiVideoNode")}`, freshContext);
  await freshContext.runCanvasApiVideoNode(freshNode, {});
  assert.equal(freshCalls[0].url, "/api/videos", "a node without a pending task submits normally");
  assert.match(JSON.parse(freshCalls[0].options.body).prompt, /drone/);

  assert.match(serviceSource, /async function handleResume\(/, "the video task service must expose a resume route");
  assert.match(serviceSource, /function startPolling\(/);
  assert.match(serverSource, /createApiVideoTaskService/, "the server must use the extracted API video task service");
  assert.doesNotMatch(serverSource, /function runApiVideoTask\(/, "API video polling must not remain embedded in the server entry");
  assert.match(serverSource, /createMediaGenerationHttpApi/, "the resume route must be registered through the media HTTP component");

  const failedStatuses = [];
  const failedContext = {
    ...clientContext,
    setCanvasH3Status: (_node, message) => failedStatuses.push(message),
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: "failed", message: "内容审核未通过" }),
    }),
  };
  vm.runInNewContext(`async ${extractFunction(clientSource, "waitForCanvasApiVideoTask")}`, failedContext);
  await assert.rejects(
    () => failedContext.waitForCanvasApiVideoTask({}, "task-broken"),
    (error) => {
      assert.equal(error.code, undefined);
      assert.match(error.message, /内容审核未通过/);
      return true;
    },
  );

  // A queued clip has to survive a server restart: the record is written to disk
  // and restored on boot so "继续查询视频" still works instead of looking failed.
  const persisted = {
    "task-old": {
      id: "task-old",
      type: "api-video",
      status: "pending",
      progress: 42,
      message: "即梦排队中：前面还有 93831 位（共 309790 位）",
      created_at: 1,
      updated_at: 2,
      videos: [],
      images: [],
      resume: {
        userId: "u1",
        prompt: "clip",
        providerId: "jimeng",
        modelId: "seedance",
        resumeTask: { taskId: "67fd1cfd" },
      },
    },
    "task-no-upstream": { id: "task-no-upstream", type: "api-video", status: "pending", resume: {} },
  };
  let persistedFile = JSON.stringify(persisted);
  const restartWatches = [];
  const restartService = createMediaTaskService({
    filePath: "api-video-tasks.json",
    fs: {
      existsSync: () => true,
      readFileSync: () => persistedFile,
      writeFileSync: (_filePath, contents) => { persistedFile = contents; },
    },
    now: () => 99,
    logger: { log: () => {} },
  });
  const restored = restartService.restoreApiVideoTasks({
    onRestore: (taskId) => { restartWatches.push(taskId); },
  });
  assert.equal(restored, 1, "only video tasks with an upstream id are restorable");
  const restoredTask = restartService.get("task-old");
  assert.equal(restoredTask.status, "pending", "a queued clip stays pending after a restart");
  assert.equal(restoredTask.progress, 42);
  assert.match(restoredTask.message, /继续查询视频/);
  assert.equal(restoredTask.resume.resumeTask.taskId, "67fd1cfd");
  assert.ok(!restartService.has("task-no-upstream"), "a task without an upstream id cannot be resumed");
  assert.deepEqual(restartWatches, ["task-old"], "a queued clip keeps being followed after a restart");

  const snapshot = restartService.snapshotApiVideoTasks();
  assert.equal(snapshot["task-old"].resume.resumeTask.taskId, "67fd1cfd");
  assert.equal(Object.keys(snapshot).length, 1, "only resumable video tasks are persisted");

  assert.match(serverSource, /mediaTaskService\.restoreApiVideoTasks\(\{ onRestore:/, "the server must restore queued video tasks on boot");
  assert.match(serverSource, /API_VIDEO_TASKS_FILE/);

  console.log("API video pending checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
