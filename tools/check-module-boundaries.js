"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

delete globalThis.AiOsKernel;
delete globalThis.AiOsModuleManifest;

require("../core/module-kernel.js");
require("../module-manifest.js");

const kernel = globalThis.AiOsKernel;
const manifest = globalThis.AiOsModuleManifest;
assert.ok(kernel, "module kernel must expose a runtime registry");
assert.ok(manifest, "module manifest must expose component metadata");
assert.equal(manifest.product, "AI OS");
assert.ok(manifest.componentIds.length >= 20, "the first component catalog should cover the current app surface");

const state = kernel.getState();
assert.equal(state.format, 1);
assert.equal(new Set(state.components.map((component) => component.id)).size, state.components.length, "component ids must be unique");
const requiredIds = new Set(state.components.filter((component) => component.required).map((component) => component.id));
for (const id of [
  "vendor-lucide",
  "os-account-management",
  "os-window-manager",
  "os-app-runtime",
  "os-display",
  "os-shell",
]) {
  assert.ok(requiredIds.has(id), `${id} must remain part of the boot spine`);
}
assert.ok(
  state.components.some((component) => !component.required),
  "the frontend component graph must expose prunable feature components",
);
assert.throws(
  () => kernel.setComponentEnabled("os-shell", false),
  /required and cannot be disabled/,
  "required frontend components must not be disable-able at runtime",
);

const plan = kernel.getLoadPlan();
assert.ok(plan.length, "the default load plan cannot be empty");
const scriptSources = plan.map((item) => item.src.split(/[?#]/, 1)[0]);
assert.equal(new Set(scriptSources).size, scriptSources.length, "a script cannot be loaded by two components");
for (const relativePath of scriptSources) {
  assert.ok(fs.existsSync(path.join(root, relativePath)), `component script is missing: ${relativePath}`);
}
const indexOfScript = (relativePath) => scriptSources.indexOf(relativePath);
const gridSlicingIndex = indexOfScript("./grid-slicing-rules.js");
const canvasRuntimeIndex = indexOfScript("./script.js");
assert.ok(
  indexOfScript("./image-output-rules.js") < canvasRuntimeIndex,
  "image output rules must load before the canvas runtime",
);
for (const relativePath of [
  "./canvas-gallery-rules.js",
  "./canvas-crop-rules.js",
  "./canvas-grid-editor-rules.js",
  "./canvas-comfy-rules.js",
  "./canvas-comfy-outpaint-ui.js",
  "./canvas-comfy-qwen-ui.js",
  "./canvas-generation-rules.js",
  "./canvas-llm-preset-rules.js",
  "./canvas-llm-preset-ui.js",
  "./canvas-media-node-renderer.js",
  "./canvas-h3-node-renderer.js",
  "./canvas-h3-controls-ui.js",
  "./canvas-midjourney-node-renderer.js",
  "./canvas-video-api-node-renderer.js",
  "./canvas-comfy-node-renderer.js",
  "./canvas-generator-node-renderer.js",
  "./canvas-video-output-node-renderer.js",
  "./canvas-text-node-renderer.js",
  "./canvas-note-node-renderer.js",
  "./canvas-asset-collection-node-renderer.js",
  "./canvas-loop-node-renderer.js",
  "./canvas-director3d-node-renderer.js",
  "./canvas-llm-node-renderer.js",
  "./canvas-gallery-node-renderer.js",
  "./canvas-grid-editor-node-renderer.js",
]) {
  assert.ok(gridSlicingIndex < indexOfScript(relativePath), `${relativePath} must load after grid slicing rules`);
  assert.ok(indexOfScript(relativePath) < canvasRuntimeIndex, `${relativePath} must load before the canvas runtime`);
}

const indexOfComponent = (id) => {
  const source = plan.find((item) => item.componentId === id)?.src?.split(/[?#]/, 1)[0] || "";
  return source ? scriptSources.indexOf(source) : -1;
};
const priorityOfComponent = (id) => plan.find((item) => item.componentId === id)?.priority ?? 100;
assert.ok(indexOfComponent("canvas-engine") < indexOfComponent("canvas-runtime"), "canvas engine must load before the canvas runtime");
assert.ok(indexOfComponent("canvas-node-catalog") < indexOfComponent("canvas-runtime"), "node catalog must load before the canvas runtime");
assert.ok(indexOfComponent("canvas-node-plugins") < indexOfComponent("canvas-runtime"), "node plugins must load before the canvas runtime");
assert.ok(indexOfComponent("canvas-image-actions") < indexOfComponent("canvas-runtime"), "image toolbar and hover info must be ready before the canvas runtime initializes");
assert.ok(
  priorityOfComponent("canvas-runtime") < priorityOfComponent("canvas-node-text"),
  "the canvas runtime must be prioritized above optional node plugins",
);
assert.equal(
  plan.find((item) => item.componentId === "canvas-runtime")?.deferOptionalDependencies,
  true,
  "the canvas runtime may defer optional node modules",
);
const osShellPlan = plan.find((item) => item.componentId === "os-shell");
assert.equal(osShellPlan?.startupCritical, true, "the desktop shell must be part of the critical startup path");
assert.equal(
  osShellPlan?.deferOptionalDependencies,
  true,
  "the desktop shell may initialize before optional settings components",
);
for (const deferredSettingsComponent of [
  "system-settings",
  "provider-settings",
  "comfyui-settings",
  "local-models",
]) {
  assert.ok(
    !osShellPlan.dependencies.includes(deferredSettingsComponent),
    `${deferredSettingsComponent} must not block the critical desktop shell`,
  );
}
const desktopShellSource = read("desktop-shell.js");
assert.match(
  desktopShellSource,
  /settings:\s*\["system-settings",\s*"provider-settings",\s*"comfyui-settings",\s*"local-models"\]/,
  "the settings app must declare all of its on-demand components",
);
assert.match(
  desktopShellSource,
  /window\.AiOsModuleLoader\b/,
  "the desktop shell must resolve the on-demand module loader",
);
assert.match(
  desktopShellSource,
  /\bloader\.ensure\(dependencies\)/,
  "the desktop shell must await app components before initializing the app",
);
for (const pluginComponent of [
  "canvas-node-text",
  "canvas-node-note",
  "canvas-node-media",
  "canvas-node-asset-collection",
  "canvas-node-llm",
  "canvas-node-loop",
  "canvas-node-video-output",
  "canvas-node-director3d",
  "canvas-node-gallery",
  "canvas-node-grid-editor",
  "canvas-node-midjourney",
  "canvas-node-video-api",
  "canvas-node-minimax-h3",
  "canvas-node-generator",
  "canvas-node-comfy",
]) {
  assert.ok(
    indexOfComponent(pluginComponent) > indexOfComponent("canvas-node-plugins"),
    `${pluginComponent} must load after the plugin host`,
  );
  assert.ok(
    indexOfComponent(pluginComponent) < indexOfComponent("canvas-runtime"),
    `${pluginComponent} must load before the canvas runtime`,
  );
}
const componentIdOfScript = (relativePath) => plan
  .find((item) => item.src.split(/[?#]/, 1)[0] === relativePath)?.componentId || "";
const nodeRendererPluginPairs = [
  ["canvas-node-text", "./canvas-text-node-renderer.js", "./canvas-node-text-plugin.js"],
  ["canvas-node-note", "./canvas-note-node-renderer.js", "./canvas-node-note-plugin.js"],
  ["canvas-node-media", "./canvas-media-node-renderer.js", "./canvas-node-media-plugin.js"],
  ["canvas-node-asset-collection", "./canvas-asset-collection-node-renderer.js", "./canvas-node-asset-collection-plugin.js"],
  ["canvas-node-llm", "./canvas-llm-node-renderer.js", "./canvas-node-llm-plugin.js"],
  ["canvas-node-loop", "./canvas-loop-node-renderer.js", "./canvas-node-loop-plugin.js"],
  ["canvas-node-video-output", "./canvas-video-output-node-renderer.js", "./canvas-node-video-output-plugin.js"],
  ["canvas-node-director3d", "./canvas-director3d-node-renderer.js", "./canvas-node-director3d-plugin.js"],
  ["canvas-node-gallery", "./canvas-gallery-node-renderer.js", "./canvas-node-gallery-plugin.js"],
  ["canvas-node-grid-editor", "./canvas-grid-editor-node-renderer.js", "./canvas-node-grid-editor-plugin.js"],
  ["canvas-node-midjourney", "./canvas-midjourney-node-renderer.js", "./canvas-node-midjourney-plugin.js"],
  ["canvas-node-video-api", "./canvas-video-api-node-renderer.js", "./canvas-node-video-api-plugin.js"],
  ["canvas-node-minimax-h3", "./canvas-h3-node-renderer.js", "./canvas-node-minimax-h3-plugin.js"],
  ["canvas-node-generator", "./canvas-generator-node-renderer.js", "./canvas-node-generator-plugin.js"],
  ["canvas-node-comfy", "./canvas-comfy-node-renderer.js", "./canvas-node-comfy-plugin.js"],
];
const nodeComponentExtraScripts = new Map([
  ["canvas-node-llm", [
    "./canvas-llm-preset-rules.js",
    "./canvas-llm-preset-ui.js",
  ]],
  ["canvas-node-comfy", [
    "./canvas-comfy-rules.js",
    "./canvas-comfy-outpaint-ui.js",
    "./canvas-comfy-qwen-ui.js",
  ]],
  ["canvas-node-minimax-h3", [
    "./canvas-h3-controls-ui.js",
  ]],
]);
for (const [componentId, renderer, plugin] of nodeRendererPluginPairs) {
  assert.equal(
    componentIdOfScript(renderer),
    componentId,
    `${renderer} must belong to ${componentId}`,
  );
  assert.equal(
    componentIdOfScript(plugin),
    componentId,
    `${plugin} must belong to ${componentId}`,
  );
  assert.ok(
    indexOfScript(renderer) < indexOfScript(plugin),
    `${renderer} must load before ${plugin}`,
  );
  for (const script of nodeComponentExtraScripts.get(componentId) || []) {
    assert.equal(
      componentIdOfScript(script),
      componentId,
      `${script} must belong to ${componentId}`,
    );
    assert.ok(
      indexOfScript(script) < indexOfScript(renderer),
      `${script} must load before ${renderer}`,
    );
  }
}
assert.ok(indexOfComponent("canvas-runtime") < indexOfComponent("canvas-assets"), "canvas runtime must load before asset integration");
assert.ok(indexOfComponent("canvas-runtime") < indexOfComponent("canvas-agent-ui"), "canvas runtime must load before Agent UI");
assert.ok(indexOfComponent("vendor-lucide") < indexOfComponent("canvas-runtime"), "Lucide must be ready before the canvas shell renders");
assert.equal(indexOfComponent("vendor-lucide"), 0, "Lucide should be the first component so first paint has icons");

for (const [componentId, renderer, plugin] of nodeRendererPluginPairs) {
  kernel.setComponentEnabled(componentId, false);
  const withoutNodeComponent = kernel.getLoadPlan().map((item) => item.src.split(/[?#]/, 1)[0]);
  assert.ok(
    !withoutNodeComponent.includes(renderer),
    `${renderer} must be prunable with ${componentId}`,
  );
  assert.ok(
    !withoutNodeComponent.includes(plugin),
    `${plugin} must be prunable with ${componentId}`,
  );
  for (const script of nodeComponentExtraScripts.get(componentId) || []) {
    assert.ok(
      !withoutNodeComponent.includes(script),
      `${script} must be prunable with ${componentId}`,
    );
  }
  assert.ok(
    withoutNodeComponent.includes("./script.js"),
    `disabling ${componentId} must keep the canvas runtime loadable`,
  );
  kernel.setComponentEnabled(componentId, true);
}

kernel.setComponentEnabled("canvas-node-note", false);
const withoutNotePlugin = kernel.getLoadPlan().map((item) => item.src.split(/[?#]/, 1)[0]);
assert.ok(!withoutNotePlugin.includes("./canvas-node-note-plugin.js"), "a disabled node plugin must leave the load plan");
assert.ok(!withoutNotePlugin.includes("./canvas-note-node-renderer.js"), "a disabled node component must also remove its renderer");
assert.ok(withoutNotePlugin.includes("./script.js"), "a disabled node plugin must keep the canvas runtime working");
kernel.setComponentEnabled("canvas-node-note", true);

kernel.setComponentEnabled("canvas-director3d", false);
const withoutDirector = kernel.getLoadPlan().map((item) => item.src.split(/[?#]/, 1)[0]);
assert.ok(withoutDirector.includes("./script.js"), "disabling the 3D director must not disable the canvas runtime");
for (const directorScript of [
  "./canvas-director3d.js",
  "./canvas-director3d-three.js",
  "./canvas-director3d-ui.js",
]) {
  assert.ok(!withoutDirector.includes(directorScript), `${directorScript} must not load with the 3D director disabled`);
}

kernel.setComponentEnabled("canvas-runtime", false);
const withoutCanvas = kernel.getLoadPlan().map((item) => item.src.split(/[?#]/, 1)[0]);
assert.ok(!withoutCanvas.includes("./script.js"), "disabling the canvas app must remove the canvas runtime");
assert.ok(!withoutCanvas.includes("./canvas-asset-library.js"), "canvas-dependent modules must be removed with the canvas app");
assert.ok(withoutCanvas.includes("./desktop-shell.js"), "disabling the canvas app must not disable the desktop shell");
assert.ok(withoutCanvas.includes("./protocol-center-ui.js"), "disabling the canvas app must not disable provider settings");

const index = read("index.html");
assert.match(index, /core\/module-kernel\.js/, "index.html must load the module kernel");
assert.match(index, /module-manifest\.js/, "index.html must load the component manifest");
assert.match(index, /module-loader\.js/, "index.html must load the component loader");
assert.match(index, /id="aiOsModuleCatalogCompatibility"/, "index.html must retain the compatibility catalog for existing tooling");

console.log("AI OS module boundary checks passed.");
