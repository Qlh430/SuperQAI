"use strict";

const assert = require("node:assert/strict");
const { createApiVideoHttpService } = require("../api-video-http-service");

function responseRecorder() {
  return {
    status: 0,
    body: null,
    sendJson(_res, status, body) {
      this.status = status;
      this.body = body;
    },
  };
}

function requestFor(payload) {
  return {
    auth: { user: { id: "user-1" } },
    payload,
  };
}

function createService(overrides = {}) {
  const calls = {
    generated: [],
    saved: [],
    registered: [],
    tasks: [],
    polled: [],
  };
  const service = createApiVideoHttpService({
    mediaTaskService: {
      set(taskId, task) {
        calls.tasks.push({ taskId, task });
      },
    },
    mediaProviderBridge: {
      async generateVideo(input) {
        calls.generated.push(input);
        return { data: [{ url: "https://cdn.example.test/clip.mp4" }] };
      },
    },
    taskService: {
      startPolling(taskId, message) {
        calls.polled.push({ taskId, message });
      },
    },
    readJson: async (req) => req.payload,
    sendJson: (res, status, body) => res.sendJson(res, status, body),
    getPublicProviderModelCatalog: () => ({
      models: [{ providerId: "provider-1", modelId: "seedance2.0" }],
    }),
    findPublicProviderCatalogModel: (models) => models[0],
    imageReferenceToFile: async (_url, filename) => ({
      blob: { type: "image/png", arrayBuffer: async () => Buffer.from("image").buffer },
      filename,
    }),
    cleanupTasks: () => {},
    isVideoMediaUrl: (url) => /\.mp4(?:\?|$)/i.test(String(url)),
    saveRemoteVideo: async (url, prefix) => {
      calls.saved.push({ url, prefix });
      return "/output/clip.mp4";
    },
    registerVideoOutput: async (userId, url) => {
      calls.registered.push({ userId, url });
    },
    providerExecutionHttpStatus: () => 422,
    formatErrorMessage: (error) => String(error?.message || error || "unknown"),
    crypto: { randomUUID: () => "task-1" },
    now: () => 1000,
    ...overrides,
  });
  return { service, calls };
}

(async () => {
  {
    const { service, calls } = createService();
    const response = responseRecorder();
    await service.handleSubmit(requestFor({ prompt: "" }), response);
    assert.equal(response.status, 400);
    assert.match(response.body.error, /视频描述/);
    assert.equal(calls.generated.length, 0);
  }

  {
    const { service } = createService({
      getPublicProviderModelCatalog: () => ({ models: [] }),
    });
    const response = responseRecorder();
    await service.handleSubmit(requestFor({ prompt: "clip" }), response);
    assert.equal(response.status, 400);
    assert.equal(response.body.code, "NO_VIDEO_MODEL");
  }

  {
    const { service, calls } = createService();
    const response = responseRecorder();
    await service.handleSubmit(requestFor({
      prompt: "clip",
      aspect_ratio: "16:9",
      resolution: "720p",
      duration: 5,
    }), response);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.videos, ["/output/clip.mp4"]);
    assert.equal(calls.saved.length, 1);
    assert.deepEqual(calls.registered, [{ userId: "user-1", url: "/output/clip.mp4" }]);
    assert.equal(calls.generated[0].size, "16:9");
    assert.equal(calls.generated[0].resolution, "720p");
    assert.equal(calls.generated[0].duration, 5);
  }

  {
    const { service, calls } = createService({
      mediaProviderBridge: {
        async generateVideo(input) {
          calls.generated.push(input);
          input.options.onTaskSubmitted({ taskId: "upstream-1" });
          return { data: [] };
        },
      },
    });
    const response = responseRecorder();
    await service.handleSubmit(requestFor({ prompt: "clip", model: "seedance2.0" }), response);
    assert.equal(response.status, 202);
    assert.deepEqual(response.body, { task_id: "task-1" });
    assert.equal(calls.tasks.length, 1);
    assert.equal(calls.tasks[0].task.resume.resumeTask.taskId, "upstream-1");
    assert.deepEqual(calls.polled, [{
      taskId: "task-1",
      message: "任务已提交，正在生成视频...",
    }]);
  }

  {
    const failure = Object.assign(new Error("provider rejected"), { code: "BAD_PROVIDER" });
    const { service } = createService({
      mediaProviderBridge: {
        generateVideo: async () => { throw failure; },
      },
    });
    const response = responseRecorder();
    await service.handleSubmit(requestFor({ prompt: "clip" }), response);
    assert.equal(response.status, 422);
    assert.equal(response.body.code, "BAD_PROVIDER");
    assert.equal(response.body.error, "provider rejected");
  }

  console.log("API video HTTP service checks passed.");
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
