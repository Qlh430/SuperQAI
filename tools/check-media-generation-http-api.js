"use strict";

const assert = require("node:assert/strict");
const { createMediaGenerationHttpApi } = require("../media-generation-http-api");

const calls = [];
const api = createMediaGenerationHttpApi({
  handleApiVideo: async (req) => calls.push(["video", req.method]),
  handleApiVideoResume: async (_req, _res, taskId) => calls.push(["resume", taskId]),
  handleMinimaxH3Video: async (req) => calls.push(["minimax", req.method]),
  handleUpscale: async (_req, _res, workflowType) => calls.push(["upscale", workflowType]),
  handleUpscaleStatus: (req) => calls.push(["status", req.url]),
});

async function handle(method, url) {
  const req = { method, url, headers: { host: "localhost" } };
  const claimed = await api.handle(req, {});
  return { claimed, calls };
}

(async () => {
  assert.equal((await handle("POST", "/api/videos")).claimed, true);
  assert.equal((await handle("POST", "/api/videos/task-123/resume")).claimed, true);
  assert.equal((await handle("POST", "/api/minimax-h3-video")).claimed, true);
  assert.equal((await handle("POST", "/api/upscale")).claimed, true);
  assert.equal((await handle("POST", "/api/upscale2")).claimed, true);
  assert.equal((await handle("POST", "/api/shoe-swap")).claimed, true);
  assert.equal((await handle("POST", "/api/outpaint")).claimed, true);
  assert.equal((await handle("POST", "/api/runninghub-outpaint")).claimed, true);
  assert.equal((await handle("POST", "/api/flux2-klein-edit")).claimed, true);
  assert.equal((await handle("POST", "/api/qwen-edit-angle")).claimed, true);
  assert.equal((await handle("POST", "/api/comfy-remove-background")).claimed, true);
  assert.equal((await handle("GET", "/api/upscale/status?id=task-1")).claimed, true);
  assert.equal((await handle("POST", "/api/not-owned")).claimed, false);
  assert.equal((await handle("GET", "/api/videos")).claimed, false);

  assert.deepEqual(calls, [
    ["video", "POST"],
    ["resume", "task-123"],
    ["minimax", "POST"],
    ["upscale", "ttp"],
    ["upscale", "seedvr2"],
    ["upscale", "shoe-swap"],
    ["upscale", "outpaint"],
    ["upscale", "runninghub-outpaint"],
    ["upscale", "flux2-klein-edit"],
    ["upscale", "qwen-edit-angle"],
    ["upscale", "remove-background"],
    ["status", "/api/upscale/status?id=task-1"],
  ]);

  console.log("Media generation HTTP API checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
