"use strict";
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { createComfyWorkflowTaskService } = require("../comfy-workflow-task-service");

const root = path.resolve(__dirname, "..");
const ttpPath = path.join(root, "workflows/TTP-upscale.json");
const seedPath = path.join(root, "workflows/SeedVR2-upscale2.json");
const template = JSON.parse(fs.readFileSync(ttpPath, "utf8"));

function createFixtureService(dimensions) {
  const tasks = new Map();
  const state = {
    submitted: null,
    finalStatus: null,
    outputIds: [],
  };
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
        const updated = { ...current, ...patch, updated_at: 1_700_000_000_000 };
        tasks.set(String(taskId), updated);
        return updated;
      },
      cleanupExpired: () => false,
    },
    workflowFiles: {
      ttp: ttpPath,
      seedvr2: seedPath,
      shoeSwap: path.join(root, "workflows/shoe-swap.json"),
      outpaint: path.join(root, "workflows/z-image-outpaint.json"),
      runninghubOutpaint: path.join(root, "workflows/runninghub-outpaint.json"),
      flux2KleinEdit: path.join(root, "workflows/flux2-klein-edit-9b.json"),
      qwenEditAngle: path.join(root, "workflows/qwen-edit-angle-2511.json"),
      removeBackground: path.join(root, "workflows/background-removal.json"),
    },
    comfyClient: {
      normalizeUrl: () => "http://fixture.invalid",
      uploadDataUrl: async () => ({ name: "fixture-input.png" }),
      submitPrompt: async (url, workflow) => {
        state.submitted = structuredClone(workflow);
        return "fixture-prompt";
      },
      waitForHistory: async () => ({ fixture: true }),
      saveHistoryImages: async (url, history, prefix, ids) => {
        state.outputIds = Array.from(ids || []);
        return [{ url: "/fixture-output.png" }];
      },
    },
    comfyBackgroundRemoval: {
      buildBackgroundRemovalWorkflow: () => ({ workflow: {}, nodeClass: "", hasAlpha: true }),
    },
    getImageReferenceDimensions: () => dimensions,
    runRunningHubOutpaintTask: async () => {},
    readJson: async (req) => req,
    sendJson: (res, status, body) => {
      res.status = status;
      res.body = body;
    },
    formatErrorMessage: (error) => error?.message || String(error),
    shoeSwapPrompt: "fixture prompt",
    shoeSwapApiKey: "fixture key",
    crypto,
    fs,
    now: () => 1_700_000_000_000,
  });
  return {
    state,
    run: async (workflowType, payload) => {
      tasks.set("fixture-task", { id: "fixture-task", status: "queued" });
      await service.runTask("fixture-task", { ...payload, workflowType });
      state.finalStatus = tasks.get("fixture-task");
    },
  };
}

async function assemble(resolution, dimensions, workflowType = "ttp") {
  const fixture = createFixtureService(dimensions);
  await fixture.run(workflowType, {
    image: "fixture",
    name: "fixture-input.png",
    resolution,
    seed: 42,
  });
  assert.equal(fixture.state.finalStatus.status, "success");
  return {
    workflow: fixture.state.submitted,
    status: fixture.state.finalStatus,
    outputIds: fixture.state.outputIds,
  };
}

async function checkLiveCatalog(baseUrl, workflows) {
  const base = new URL(baseUrl);
  assert.ok(["http:", "https:"].includes(base.protocol) && !base.username && !base.password && !base.search && !base.hash);
  const catalog = {};
  const types = [...new Set(workflows.flatMap(workflow => Object.values(workflow).map(node => node.class_type)))];
  for (const type of types) {
    const response = await fetch(base.toString().replace(/\/+$/, "") + "/object_info/" + encodeURIComponent(type), {
      method: "GET", redirect: "error", signal: AbortSignal.timeout(8_000),
    });
    assert.equal(response.status, 200, type);
    const data = await response.json();
    assert.ok(data[type], `ComfyUI is missing node ${type}`);
    catalog[type] = data[type];
  }
  for (const workflow of workflows) {
    for (const [id, node] of Object.entries(workflow)) {
      const definition = catalog[node.class_type];
      for (const field of Object.keys(definition.input?.required || {})) {
        assert.ok(Object.hasOwn(node.inputs, field), `${id}/${node.class_type}: required ${field}`);
      }
      for (const [field, value] of Object.entries(node.inputs)) {
        // Uploaded image names are not present: this check never uploads or generates.
        if (Array.isArray(value) || node.class_type === "LoadImage") continue;
        const input = definition.input?.required?.[field] || definition.input?.optional?.[field];
        if (!input) continue;
        const choices = Array.isArray(input[0]) ? input[0] : input[0] === "COMBO" ? input[1]?.options : null;
        if (choices) assert.ok(choices.includes(value), `${id}/${node.class_type}.${field}: unavailable value ${value}`);
      }
    }
  }
  console.log(`Live ComfyUI node/options check passed for 2K and 4K (${types.length} node types; GET only, no uploads or GPU jobs).`);
}

async function main() {
  const workflows = [];
  for (const resolution of [2048, 4096, 6144]) {
    for (const dimensions of [{ width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 8000, height: 6000 }]) {
      const { workflow, status, outputIds } = await assemble(resolution, dimensions);
      assert.equal(workflow["12"].inputs.model_name, template["12"].inputs.model_name,
        `${resolution}: keep the configured model; output size must not select an uninstalled model`);
      assert.equal(workflow["34"].inputs.scale_to_length, resolution, "selected long edge is honored even for larger inputs");
      assert.equal(workflow["34"].inputs.scale_to_side, "longest");
      assert.equal(workflow["34"].inputs.aspect_ratio, "original");
      assert.deepEqual(workflow["34"].inputs.image, ["33", 0]);
      assert.deepEqual(workflow["32"].inputs.images, ["34", 0], "saved image uses final resize, not intermediate upscale");
      assert.equal(workflow["10"].inputs.image, "fixture-input.png");
      assert.equal(status.upscale_model, template["12"].inputs.model_name);
      assert.equal(status.resolution, resolution);
      assert.deepEqual(outputIds, ["32"]);
      if (resolution <= 4096 && dimensions.width === 1024) workflows.push(workflow);
    }
  }
  const unselected = await assemble(undefined, { width: 1024, height: 768 });
  assert.equal(unselected.workflow["12"].inputs.model_name, template["12"].inputs.model_name);
  assert.deepEqual(unselected.workflow["32"].inputs.images, template["32"].inputs.images, "no target preserves the template output");
  for (const resolution of [2048, 4096]) {
    const { workflow, outputIds } = await assemble(resolution, { width: 1024, height: 768 }, "seedvr2");
    assert.equal(workflow["41"].inputs.resolution, resolution);
    assert.equal(workflow["41"].inputs.max_resolution, resolution);
    assert.deepEqual(outputIds, ["26", "1078"]);
  }
  await assert.rejects(assemble(6144, { width: 1024, height: 768 }, "seedvr2"), /最高支持 4K/);
  console.log("TTP upscale regression passed through the extracted ComfyUI workflow service: configured model retained, exact 2K/4K/6K target, portrait/landscape/large inputs, final output wiring, SeedVR2 unchanged.");
  const urlIndex = process.argv.indexOf("--comfy-url");
  if (urlIndex >= 0) {
    assert.ok(process.argv[urlIndex + 1], "--comfy-url requires an explicit address");
    await checkLiveCatalog(process.argv[urlIndex + 1], workflows);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
