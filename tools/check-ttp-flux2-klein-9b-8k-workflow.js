const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const target = path.join(root, "workflows", "TTP-upscale-flux2-klein-9b-8K.json");
assert.ok(fs.existsSync(target), "new FLUX.2 8K workflow is missing");

const workflow = JSON.parse(fs.readFileSync(target, "utf8"));
assert.equal(workflow["11"].class_type, "LayerUtility: ImageScaleByAspectRatio V2");
assert.equal(workflow["11"].inputs.scale_to_side, "longest");
assert.equal(workflow["11"].inputs.scale_to_length, 2048);
assert.equal(workflow["12"].inputs.model_name, "4xNomos8kSCHAT-L.safetensors");
assert.deepEqual(workflow["14"].inputs.image, ["11", 0]);
assert.equal(workflow["15"].inputs.width_factor, 6);
assert.equal(workflow["15"].inputs.height_factor, 4);
assert.equal(workflow["15"].inputs.overlap_rate, 0.125);
assert.equal(workflow["103"].inputs.unet_name, "flux-2-klein-9b.safetensors");
assert.equal(workflow["104"].inputs.clip_name, "qwen_3_8b.safetensors");
assert.equal(workflow["104"].inputs.type, "flux2");
assert.equal(workflow["105"].inputs.vae_name, "flux2-vae.safetensors");
assert.deepEqual(workflow["153"].inputs.pixels, ["18", 0]);
assert.deepEqual(workflow["156"].inputs.latent, ["153", 0]);
assert.deepEqual(workflow["155"].inputs.latent, ["153", 0]);
assert.equal(workflow["151"].inputs.steps, 8);
assert.equal(workflow["150"].inputs.sampler_name, "euler");
assert.equal(workflow["154"].inputs.cfg, 1);
assert.deepEqual(workflow["45"].inputs.images, ["158", 0]);
assert.equal(workflow["33"].inputs.padding, 96);
assert.deepEqual(workflow["33"].inputs.tiles, ["45", 0]);
assert.equal(workflow["34"].inputs.scale_to_side, "longest");
assert.equal(workflow["34"].inputs.scale_to_length, 8192);
assert.deepEqual(workflow["32"].inputs.images, ["34", 0]);

const forbiddenTypes = new Set([
  "Florence2ModelLoader",
  "Florence2Run",
  "InpaintCrop",
  "InpaintStitch",
  "LoraLoaderModelOnly",
]);
for (const node of Object.values(workflow)) {
  assert.ok(!forbiddenTypes.has(node.class_type), `forbidden node type: ${node.class_type}`);
}

console.log("TTP FLUX.2 Klein 9B 8K workflow contract passed.");
