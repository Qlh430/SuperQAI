"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { createComfyWorkflowTaskService } = require("../comfy-workflow-task-service");

const root = path.resolve(__dirname, "..");
const tasks = new Map();
let delegatedTask = null;

const service = createComfyWorkflowTaskService({
  mediaTaskService: {
    get: (taskId) => tasks.get(String(taskId || "")),
    set: (taskId, task) => {
      tasks.set(String(taskId), { ...task, id: String(taskId) });
      return tasks.get(String(taskId));
    },
    update: (taskId, patch) => {
      const current = tasks.get(String(taskId));
      if (!current) return null;
      const next = { ...current, ...patch, updated_at: 1000 };
      tasks.set(String(taskId), next);
      return next;
    },
    cleanupExpired: () => false,
  },
  workflowFiles: {
    ttp: path.join(root, "workflows/TTP-upscale.json"),
    seedvr2: path.join(root, "workflows/SeedVR2-upscale2.json"),
    shoeSwap: path.join(root, "workflows/shoe-swap.json"),
    outpaint: path.join(root, "workflows/z-image-outpaint.json"),
    runninghubOutpaint: path.join(root, "workflows/runninghub-outpaint.json"),
    flux2KleinEdit: path.join(root, "workflows/flux2-klein-edit-9b.json"),
    qwenEditAngle: path.join(root, "workflows/qwen-edit-angle-2511.json"),
    removeBackground: path.join(root, "workflows/background-removal.json"),
  },
  comfyClient: {},
  comfyBackgroundRemoval: {},
  getImageReferenceDimensions: () => null,
  runRunningHubOutpaintTask: async (taskId, payload) => {
    delegatedTask = { taskId, payload };
  },
  readJson: async (req) => req.body,
  sendJson: (res, status, body) => {
    res.status = status;
    res.body = body;
  },
  formatErrorMessage: (error) => error?.message || String(error),
  shoeSwapPrompt: "fixture",
  shoeSwapApiKey: "fixture",
  crypto,
  fs,
  now: () => 1000,
});

(async () => {
  assert.equal(service.getWorkflowFile("seedvr2"), path.join(root, "workflows/SeedVR2-upscale2.json"));
  assert.equal(service.getWorkflowFile("flux2-klein-edit"), path.join(root, "workflows/flux2-klein-edit-9b.json"));

  const uploadName = service.makeUploadFilename("bad:name?.png", "token");
  assert.match(uploadName, /^bad-name-_token\.png$/);
  assert.match(service.makeUploadToken("task-id"), /^1000_task-id_[0-9a-f]{6}$/);

  const workflow = {
    one: { inputs: { seed: 1 } },
    two: { inputs: { noise_seed: 2, prompt: "keep" } },
  };
  service.setWorkflowSeed(workflow, 42);
  assert.deepEqual(workflow, {
    one: { inputs: { seed: 42 } },
    two: { inputs: { noise_seed: 42, prompt: "keep" } },
  });
  assert.deepEqual(
    service.normalizeOutpaintPadding({ direction: "custom", left: 17, top: -1, right: 31, bottom: 2049 }),
    { left: 16, top: 0, right: 32, bottom: 2048 },
  );

  const invalidResponse = {};
  await service.handleUpscale({ body: {} }, invalidResponse, "ttp");
  assert.equal(invalidResponse.status, 400);
  assert.equal(invalidResponse.body.error, "Missing image.");

  tasks.set("status-task", { id: "status-task", status: "running" });
  const statusResponse = {};
  service.handleUpscaleStatus({
    url: "/api/upscale/status?id=status-task",
    headers: { host: "localhost" },
  }, statusResponse);
  assert.equal(statusResponse.status, 200);
  assert.equal(statusResponse.body.id, "status-task");

  await service.runTask("delegated-task", { workflowType: "runninghub-outpaint", image: "fixture" });
  assert.equal(delegatedTask.taskId, "delegated-task");
  assert.equal(delegatedTask.payload.workflowType, "runninghub-outpaint");

  console.log("ComfyUI workflow task service checks passed: dispatch, upload helpers, seed handling, outpaint padding and upscale status.");
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
