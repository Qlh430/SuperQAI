"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { compileGeneratorComposer } = require("./visual-presets-build.cjs");

const compiled = compileGeneratorComposer(__dirname);
const loadedWindow = {};
const install = compiled.indexOf("(function installFloraVisualPresets");
require("node:vm").runInNewContext(compiled.slice(0, install), {
  window: loadedWindow,
  globalThis: loadedWindow,
});

const previews = JSON.parse(fs.readFileSync(
  path.join(__dirname, "design-sources/visual-preset-previews.json"),
  "utf8",
)).images;
const sourcePresets = JSON.parse(fs.readFileSync(
  path.join(__dirname, "design-sources/visual-presets.json"),
  "utf8",
)).presets;
const presets = loadedWindow.FloraVisualPresetConfig.presets;
const expected = {
  "focal-35": "camera/focal-length/camera_focal_35mm.png",
  "focal-50": "camera/focal-length/camera_focal_50mm.png",
  "focal-85": "camera/focal-length/camera_focal_85mm.png",
  "aperture-f1-4": "camera/aperture/camera_aperture_f1.4.png",
  "aperture-f2-8": "camera/aperture/camera_aperture_f2_8.png",
  "aperture-f4": "camera/aperture/camera_aperture_f4.png",
  "aperture-f8": "camera/aperture/camera_aperture_f8.png",
};

for (const [id, relativeSource] of Object.entries(expected)) {
  const preset = presets.find(item => item.id === id);
  const originalPath = path.join(__dirname, "public/visual-presets/originals", relativeSource);
  assert.ok(preset, `${id} must remain in the camera control`);
  assert.ok(preset.previewSource, `${id} must have a large-preview source`);
  assert.equal(preset.previewSource, `/visual-presets/originals/${relativeSource.replace(/\\/g, "/")}`);
  assert.ok(fs.existsSync(originalPath), `${id} original PNG must be available to the fixed preview`);
  const original = fs.readFileSync(originalPath);
  const sourcePreset = sourcePresets.find(item => item.id === id);
  const manifestEntry = previews[sourcePreset.thumbnail];
  assert.ok(manifestEntry, `${id} must have a verified source hash in the preview manifest`);
  assert.equal(
    crypto.createHash("sha256").update(original).digest("hex"),
    manifestEntry.sha256,
    `${id} served original must exactly match the existing source PNG`,
  );
  assert.equal(original.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.ok(original.readUInt32BE(16) >= 1024, `${id} must not map to a small thumbnail`);
}

console.log("camera preview source contract passed");
