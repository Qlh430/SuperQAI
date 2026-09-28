"use strict";

const assert = require("node:assert/strict");
const { createMinimaxH3TaskService } = require("../minimax-h3-task-service");

async function run() {
  const updates = [];
  let queuedTask = null;
  let uploadRequest = null;
  let preparedRequest = null;
  let savedHistory = null;
  const service = createMinimaxH3TaskService({
    mediaTaskService: {
      set(taskId, task) {
        queuedTask = { taskId, task };
      },
    },
    updateTask(taskId, patch) {
      updates.push({ taskId, ...patch });
    },
    cleanupTasks() {},
    workflowFile: "fixture-workflow.json",
    normalizeRequest(value) {
      return value;
    },
    prepareWorkflow(template, request) {
      preparedRequest = request;
      return { template, request };
    },
    sanitizeReferenceName(name, kind, index) {
      return `${kind}_${index + 1}.png`;
    },
    mediaReferenceToFile: async (url, filename, kind) => ({
      filename,
      blob: new Blob(["fixture"], { type: `${kind}/png` }),
    }),
    comfyClient: {
      normalizeUrl: value => String(value).replace(/\/+$/, ""),
      uploadFile: async (url, file) => {
        uploadRequest = { url, file };
        return { name: "uploaded.png", subfolder: "input" };
      },
      submitPrompt: async () => "prompt-1",
      waitForHistory: async () => ({ outputs: { 230: { videos: [] } } }),
      saveHistoryVideos: async (comfyUrl, history) => {
        savedHistory = { comfyUrl, history };
        return ["/output/minimax_h3_result.mp4"];
      },
    },
    formatErrorMessage: error => error?.message || String(error),
    makeUploadToken: () => "token",
    makeUploadFilename: (name, token) => `${name}.${token}`,
    crypto: {
      randomUUID: () => "task-1",
      randomInt: () => 7,
    },
    fs: {
      existsSync: () => true,
      readFileSync: () => '{"fixture":true}',
    },
    now: () => 1000,
  });

  const result = await service.executeComfyVideoProvider({
    provider: { baseUrl: "http://comfy.example" },
    input: {
      prompt: "Use <Picture 1>",
      images: [{ url: "/output/input.png", name: "input.png" }],
      videos: [],
      audios: [],
    },
    params: { aspectRatio: "16:9" },
  });
  await new Promise(resolve => setImmediate(resolve));

  assert.deepEqual(result, { task_id: "task-1" });
  assert.equal(queuedTask.taskId, "task-1");
  assert.equal(queuedTask.task.type, "minimax-h3-video");
  assert.equal(queuedTask.task.status, "queued");
  assert.equal(uploadRequest.url, "http://comfy.example");
  assert.ok(uploadRequest.file.blob instanceof Blob);
  assert.equal(uploadRequest.file.filename, "image_1.png.token_image_1");
  assert.equal(preparedRequest.images[0].name, "input/uploaded.png");
  assert.equal(preparedRequest.seed, 7);
  assert.equal(savedHistory.comfyUrl, "http://comfy.example");
  assert.deepEqual(updates.at(-1), {
    taskId: "task-1",
    status: "success",
    progress: 100,
    message: "MiniMax H3 视频生成完成。",
    videos: ["/output/minimax_h3_result.mp4"],
    comfy: "http://comfy.example",
    seed: 7,
  });

  console.log("MiniMax H3 task service checks passed.");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
