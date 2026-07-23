# TTP FLUX.2 Klein 9B 8K Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone, importable ComfyUI API workflow that creates an 8K Nomos base image, restores fixed-grid tiles with FLUX.2 Klein 9B, and reassembles them without changing the existing TTP workflow.

**Architecture:** The new workflow keeps the existing pixel-upscale and TTP split/assemble stages, then replaces the FLUX.1 tile sampler stack with the already-present FLUX.2 `ReferenceLatent` edit stack. A small Node.js contract test parses the JSON and verifies exact model names, dimensions, critical connections, and preservation of the old workflow.

**Tech Stack:** ComfyUI API JSON, Comfyui_TTP_Toolset, comfyui_layerstyle, ComfyUI-Impact-Pack list nodes, Comfyroll text node, FLUX.2 Klein 9B, Node.js.

## Global Constraints

- Create `workflows/TTP-upscale-flux2-klein-9b-8K.json`; do not modify or rename `workflows/TTP-upscale.json`.
- Do not modify `server.js`, `script.js`, `index.html`, or website routing.
- Use `flux-2-klein-9b.safetensors`, `qwen_3_8b.safetensors`, and `flux2-vae.safetensors` exactly.
- Use `4xNomos8kSCHAT-L.safetensors` for the pixel-space 4× upscale.
- Define 8K as aspect-ratio-preserving output with longest edge 8192.
- Do not add Florence2, Qwen-VL captioning, semantic tiling, or model switching.
- Default to a 6×4 grid, overlap rate 0.125, assembly padding 96, Euler, 8 steps, and CFG 1.

---

### Task 1: Add a workflow contract test

**Files:**
- Create: `tools/check-ttp-flux2-klein-9b-8k-workflow.js`
- Test: `tools/check-ttp-flux2-klein-9b-8k-workflow.js`

**Interfaces:**
- Consumes: `workflows/TTP-upscale-flux2-klein-9b-8K.json` as a ComfyUI API object keyed by node ID.
- Produces: exit code 0 and `TTP FLUX.2 Klein 9B 8K workflow contract passed.` when all invariants hold.

- [ ] **Step 1: Write the failing contract test**

Create a Node.js script that reads the new workflow and asserts the exact node contract:

```js
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
console.log("TTP FLUX.2 Klein 9B 8K workflow contract passed.");
```

- [ ] **Step 2: Run the test and verify it fails because the workflow is absent**

Run: `node .\tools\check-ttp-flux2-klein-9b-8k-workflow.js`

Expected: non-zero exit with `AssertionError: new FLUX.2 8K workflow is missing`.

- [ ] **Step 3: Syntax-check the test itself**

Run: `node --check .\tools\check-ttp-flux2-klein-9b-8k-workflow.js`

Expected: exit code 0 with no output.

- [ ] **Step 4: Commit the failing contract test**

```powershell
git add -- tools/check-ttp-flux2-klein-9b-8k-workflow.js
git commit -m "test: define Flux2 TTP 8K workflow contract"
```

### Task 2: Create the standalone FLUX.2 TTP workflow

**Files:**
- Create: `workflows/TTP-upscale-flux2-klein-9b-8K.json`
- Test: `tools/check-ttp-flux2-klein-9b-8k-workflow.js`

**Interfaces:**
- Consumes: an image selected in node `10` and locally installed model/custom-node dependencies named in Global Constraints.
- Produces: one image from SaveImage node `32`, preserving aspect ratio with longest edge 8192.

- [ ] **Step 1: Add the pixel-upscale and TTP split nodes**

Use these exact node IDs and connections:

```text
10 LoadImage
  -> 11 LayerUtility: ImageScaleByAspectRatio V2 (longest=2048, Lanczos)
  -> 14 ImageUpscaleWithModel
12 UpscaleModelLoader (4xNomos8kSCHAT-L.safetensors)
  -> 14.upscale_model
14.image
  -> 15 TTP_Tile_image_size (width_factor=6, height_factor=4, overlap_rate=0.125)
  -> 16 TTP_Image_Tile_Batch (tile width/height from node 15)
16.images
  -> 18 ImpactImageBatchToImageList
```

Node `16` must retain outputs used later as `["16", 1]` positions, `["16", 2]` original size, and `["16", 3]` grid size.

- [ ] **Step 2: Add the strict preservation prompt and FLUX.2 model stack**

Use node `117` with this exact text:

```text
Faithfully restore and enhance fine details. Preserve the exact geometry, identity, text, colors, materials, lighting and composition. Remove blur, noise and compression artifacts. Do not add, remove, redesign or reinterpret any object.
```

Create the stack:

```text
103 UNETLoader: flux-2-klein-9b.safetensors
104 CLIPLoader: qwen_3_8b.safetensors, type=flux2, device=default
105 VAELoader: flux2-vae.safetensors
110 CLIPTextEncode: text=117, clip=104
148 ConditioningZeroOut: conditioning=110
```

Do not add either FLUX.1 LoRA from the legacy workflow.

- [ ] **Step 3: Add per-tile ReferenceLatent sampling**

Create the exact processing graph:

```text
18.images -> 153 VAEEncode.pixels; 105.vae -> 153.vae
153.latent -> 156 ReferenceLatent.latent; 110 -> 156.conditioning
153.latent -> 155 ReferenceLatent.latent; 148 -> 155.conditioning
18.images -> 157 GetImageSize.image
157.width/height -> 149 EmptyFlux2LatentImage.width/height; batch_size=1
159 RandomNoise -> 152 SamplerCustomAdvanced.noise
150 KSamplerSelect(euler) -> 152.sampler
151 Flux2Scheduler(steps=8, width/height from 157) -> 152.sigmas
154 CFGGuider(cfg=1, model=103, positive=156, negative=155) -> 152.guider
149.latent -> 152.latent_image
152.output -> 158 VAEDecode.samples; 105.vae -> 158.vae
```

This graph must use the input Tile as a Flux2 reference. It must not use `InpaintCrop`, masks, Florence2, or a blank text-to-image-only conditioning path.

- [ ] **Step 4: Add batch conversion, assembly, 8K final resize, and save**

Create the output graph:

```text
158.images -> 45 ImageListToImageBatch
45.batch -> 33 TTP_Image_Assy.tiles
16.positions/original_size/grid_size -> 33 matching inputs
33.image -> 34 LayerUtility: ImageScaleByAspectRatio V2
34 settings: original aspect ratio, Lanczos, longest=8192, round_to_multiple=8
34.image -> 32 SaveImage.images
```

Set node `33` padding to 96 and node `32` filename prefix to `TTP_Flux2_Klein_9B_8K`.

- [ ] **Step 5: Run the contract test**

Run: `node .\tools\check-ttp-flux2-klein-9b-8k-workflow.js`

Expected: `TTP FLUX.2 Klein 9B 8K workflow contract passed.`

- [ ] **Step 6: Parse the JSON independently**

Run:

```powershell
Get-Content -LiteralPath '.\workflows\TTP-upscale-flux2-klein-9b-8K.json' -Raw | ConvertFrom-Json | Out-Null
```

Expected: exit code 0 with no output.

- [ ] **Step 7: Verify the old workflow and website files are untouched by this implementation**

Run:

```powershell
git diff --exit-code -- workflows/TTP-upscale.json server.js script.js index.html
```

Expected: no new diff attributable to this implementation. Pre-existing user changes in website files remain untouched and must not be staged.

- [ ] **Step 8: Commit only the new workflow**

```powershell
git add -- workflows/TTP-upscale-flux2-klein-9b-8K.json
git commit -m "feat: add standalone Flux2 TTP 8K workflow"
```

### Task 3: Probe local ComfyUI compatibility

**Files:**
- Verify: `workflows/TTP-upscale-flux2-klein-9b-8K.json`
- Verify: `tools/check-ttp-flux2-klein-9b-8k-workflow.js`

**Interfaces:**
- Consumes: local ComfyUI `/object_info` when the configured endpoint is reachable.
- Produces: a compatibility report listing missing class types, or a clear statement that endpoint probing was unavailable.

- [ ] **Step 1: Determine the configured ComfyUI URL without printing secrets**

Read only the local ComfyUI base URL from project configuration and normalize it to the default `http://127.0.0.1:8188` when absent.

- [ ] **Step 2: Request `/object_info` if ComfyUI is reachable**

Check that these class types exist:

```text
LayerUtility: ImageScaleByAspectRatio V2
UpscaleModelLoader
ImageUpscaleWithModel
TTP_Tile_image_size
TTP_Image_Tile_Batch
ImpactImageBatchToImageList
CR Text
UNETLoader
CLIPLoader
VAELoader
CLIPTextEncode
ConditioningZeroOut
VAEEncode
ReferenceLatent
GetImageSize
EmptyFlux2LatentImage
RandomNoise
KSamplerSelect
Flux2Scheduler
CFGGuider
SamplerCustomAdvanced
VAEDecode
ImageListToImageBatch
TTP_Image_Assy
SaveImage
```

Expected: all types present, or an exact missing-type list for the handoff.

- [ ] **Step 3: Re-run static verification**

Run:

```powershell
node --check .\tools\check-ttp-flux2-klein-9b-8k-workflow.js
node .\tools\check-ttp-flux2-klein-9b-8k-workflow.js
git status --short
```

Expected: JavaScript syntax passes, the contract passes, and only pre-existing user changes remain uncommitted.

- [ ] **Step 4: Commit compatibility-test adjustments only if required**

If compatibility probing reveals an incorrect class name or input contract, update the new workflow and its contract test together, rerun all checks, and commit only those two files:

```powershell
git add -- tools/check-ttp-flux2-klein-9b-8k-workflow.js workflows/TTP-upscale-flux2-klein-9b-8K.json
git commit -m "fix: align Flux2 TTP workflow with local ComfyUI"
```
