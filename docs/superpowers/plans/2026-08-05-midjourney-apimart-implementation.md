# APIMart Midjourney Integration Implementation Plan

> For agentic workers: use subagent-driven development or executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

Goal: Add a separate APIMart midjourney model with synchronized online-generator and canvas-node controls without changing the existing gpt-image-2-apimart channel.

Architecture: Add Midjourney-specific constants and a request helper in server.js, reusing the configured APIMart key and task polling while targeting /v1/midjourney/generations. Add shared client helpers and controls in script.js; render them in the main image form and canvas image generator nodes, and send fields only for Midjourney.

Tech Stack: Node.js HTTP server, vanilla JavaScript, HTML/CSS, existing local self-check scripts.

## Global Constraints

- Preserve gpt-image-2-apimart, APIMART_IMAGE_API_URL, APIMART_IMAGE_TASK_API_URL, and APIMART_IMAGE_UPSTREAM_MODEL behavior.
- Midjourney upstream requests use version, niji, speed, style, and stylize; they do not include model.
- Use only documented versions 8.2, 8.1, 7, 6.1, 5.2, 5.1; speeds relax, fast, turbo; styles raw, standard.

---

### Task 1: Register the Midjourney APIMart model

Files:
- Modify: server.js constants, image model registry, image request dispatch, system-provider labels
- Modify: .env.example with optional Midjourney endpoint overrides
- Test: tools/check-midjourney-apimart.js

Interfaces:
- Produces isMidjourneyImageModel(model), requestApimartMidjourneyGeneration(options), and normalizeMidjourneyOptions(payload) for the client-facing image endpoint.

- [ ] Add MIDJOURNEY_IMAGE_MODEL_ALIAS = "midjourney", a default /v1/midjourney/generations URL, and an optional task URL while leaving the existing APIMART constants intact.
- [ ] Include midjourney in AVAILABLE_IMAGE_MODELS only when APIMART_IMAGE_API_KEY exists, and include it in the APIMART system provider model list and label map.
- [ ] Dispatch model: midjourney before the existing APIMART GPT Image branch. Normalize and validate options, convert pixel sizes/ratios to W:H, submit without model, poll the existing task endpoint, and return normalized image data.
- [ ] Add a static test that reads server.js and asserts model registration, the Midjourney route, omission of model from the Midjourney body, and preservation of APIMART_IMAGE_UPSTREAM_MODEL.
- [ ] Run node tools/check-midjourney-apimart.js; expected result is a zero exit code with all assertions passing.

### Task 2: Add synchronized online-generator controls

Files:
- Modify: index.html image control card
- Modify: script.js image state, request payload, local preference persistence, model-specific UI helpers
- Modify: styles.css Midjourney control layout

Interfaces:
- Produces isMidjourneyModel(model), getMidjourneyPayload(source), and syncMidjourneyControls(container, model) used by both UI surfaces.

- [ ] Add hidden version, mode, speed, style, and stylize controls beside the existing image controls.
- [ ] Show the controls only for midjourney, defaulting to version 7, standard mode, fast, raw, and stylize 100; hide/disable them for other models.
- [ ] Include the structured fields in the online /api/images payload only when Midjourney is selected, and keep existing size/resolution/reference fields unchanged for other models.
- [ ] Persist and restore Midjourney preferences through IMAGE_STORAGE_KEY.
- [ ] Extend the static test to assert the online form contains the controls and conditional payload fields.
- [ ] Run the static test and node --check .\\script.js.

### Task 3: Add synchronized canvas-node controls

Files:
- Modify: script.js canvas image-node rendering, node dataset persistence, canvas request builder
- Modify: styles.css canvas Midjourney control layout
- Test: extend tools/check-midjourney-apimart.js

Interfaces:
- Canvas nodes store canvasMidjourneyVersion, canvasMidjourneyNiji, canvasMidjourneySpeed, canvasMidjourneyStyle, and canvasMidjourneyStylize datasets.

- [ ] Render the same Midjourney controls in generated canvas image nodes and restore their dataset values when re-rendering.
- [ ] Update visibility and defaults when the node model changes without changing non-Midjourney node behavior.
- [ ] Add the node options to the existing canvas image request payload and preserve reference-image handling.
- [ ] Extend the static test to assert canvas controls, dataset keys, and conditional request fields.
- [ ] Run node tools/check-midjourney-apimart.js and node --check .\\script.js.

### Task 4: Verify the integrated behavior

Files:
- Test: tools/check-midjourney-apimart.js

- [ ] Run node --check .\\server.js.
- [ ] Run all Midjourney static assertions and the existing image routing/resolution checks.
- [ ] Start the local server on an available port and verify /api/image-models returns midjourney when the APIMart key is configured, without removing the GPT Image alias.
- [ ] Review git diff --check and confirm only Midjourney-related files changed.
