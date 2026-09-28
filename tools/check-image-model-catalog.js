"use strict";

const assert = require("node:assert/strict");

const ImageResolutionRules = require("../image-resolution-rules");
const CanvasImageModelRouting = require("../image-model-routing");
const { createImageModelCatalog } = require("../image-model-catalog");

function fixture({ providers = [], telemetry = {} } = {}) {
  const settings = { providers };
  const catalog = createImageModelCatalog({
    imageResolutionRules: ImageResolutionRules,
    imageModelRouting: CanvasImageModelRouting,
    readSettings: () => settings,
    buildSettingsResponse: (value) => value,
    readTelemetryHistory: () => telemetry,
    makeCustomModelClientId: (providerId, modelId) => `${providerId}:${modelId}`,
    midjourneyImageModelAlias: "midjourney",
    systemModelLabels: { "gpt-image-2-ainb": "gpt-image-2 \u00b7 ainb" },
  });
  return { catalog, settings };
}

function checkResolutionRules() {
  const { catalog } = fixture();

  assert.deepEqual(catalog.normalizeImageResolutions(undefined, "gpt-image-1"), ["1", "2", "4"]);
  assert.deepEqual(catalog.normalizeImageResolutions(["4k", "512px", "2"], "gpt-image-1"), ["512", "2", "4"]);
  assert.deepEqual(catalog.normalizeImageResolutions(["1", "2"], "midjourney"), []);
  assert.deepEqual(catalog.sortImageResolutions(["4", "0.5", "1k"]), ["512", "1", "4"]);
  assert.equal(catalog.normalizeImageResolutionValue("0.5"), "512");
  assert.equal(catalog.normalizeImageResolutionValue("8"), "");

  assert.equal(catalog.inferImagePlatform("nano-banana-2"), "google");
  assert.equal(catalog.inferImagePlatform("midjourney"), "midjourney");
  assert.equal(catalog.normalizeImagePlatform("google", "gpt-image-1"), "google");
  assert.equal(catalog.normalizeImagePlatform("", "gemini-3-pro-image"), "google");
}

function checkJimengLadders() {
  const { catalog } = fixture();

  assert.equal(catalog.isJimengImageModelId("jimeng-5.0Pro"), true);
  assert.equal(catalog.isJimengImageModelId("5.0"), true);
  assert.equal(catalog.isJimengImageModelId("gpt-image-2"), false);
  assert.deepEqual(catalog.jimengImageResolutionLevels("jimeng-3.0"), ["1", "2"]);
  assert.deepEqual(catalog.jimengImageResolutionLevels("jimeng-4.0"), ["2", "4"]);
  assert.deepEqual(catalog.jimengImageResolutionLevels("jimeng-5.0Pro"), ["1", "2", "4"]);
  // A Dreamina version can look like a Gemini version, so the CLI family wins.
  assert.equal(catalog.normalizeImageModelFamily("", "jimeng-3.1"), "jimeng-3");
  assert.equal(catalog.normalizeImageModelFamily("", "nano-banana-pro"), "gemini-3-pro-image");
}

function checkOutputValidation() {
  const { catalog } = fixture();

  const openai = catalog.validateImageOutputRequest("gpt-image-2", "1:1", "2");
  assert.equal(openai.supported, true);

  const google = catalog.validateImageOutputRequest("nano-banana", "1:1", "2", {
    modelId: "gemini-2.5-flash-image",
    platform: "google",
    family: "gemini-2.5-flash-image",
  });
  assert.equal(google.supported, false);
  assert.match(google.reason, /未在此 API 接入中启用/);

  // Even when the provider row enables 2K, a model family that only renders 1K
  // has to reject it with the family reason instead of the provider reason.
  const googleFamily = catalog.validateImageOutputRequest("nano-banana", "1:1", "2", {
    modelId: "gemini-2.5-flash-image",
    platform: "google",
    family: "gemini-2.5-flash-image",
    resolutions: ["1", "2"],
  });
  assert.equal(googleFamily.supported, false);
  assert.match(googleFamily.reason, /仅支持 1K/);

  const jimeng = catalog.validateImageOutputRequest("jimeng-3.0", "16:9", "4", {
    modelId: "jimeng-3.0",
    providerProtocol: "cli:jimeng",
    platform: "jimeng",
  });
  assert.equal(jimeng.supported, false);

  // Midjourney carries its own option set instead of a quality ladder, so the
  // size rules stay out of its way and the node keeps its own controls.
  const midjourney = catalog.validateImageOutputRequest("midjourney", "1:1", "1", {
    modelId: "midjourney",
    platform: "midjourney",
  });
  assert.equal(midjourney.supported, true);

  // The rules must stay pure: validation cannot reach into saved settings.
  const pure = createImageModelCatalog({
    imageResolutionRules: ImageResolutionRules,
    imageModelRouting: CanvasImageModelRouting,
    readSettings: () => { throw new Error("image size validation must not read settings"); },
    buildSettingsResponse: () => { throw new Error("unused"); },
    readTelemetryHistory: () => { throw new Error("unused"); },
    makeCustomModelClientId: (providerId, modelId) => `${providerId}:${modelId}`,
    midjourneyImageModelAlias: "midjourney",
  });
  assert.equal(pure.validateImageOutputRequest("gpt-image-2", "1:1", "1").supported, true);
  assert.equal(pure.start().component, "image-model-catalog");
}

function checkSavedSettingsLookups() {
  const { catalog } = fixture({
    providers: [{
      id: "p1",
      name: "Provider 1",
      enabled: true,
      baseUrl: "https://p1.example/v1",
      apiKey: "must-not-leak",
      importedSystem: false,
      networkMode: "auto",
      models: [
        { id: "img", capabilities: ["generation"], resolutions: ["4"] },
        { id: "txt", capabilities: ["text"] },
      ],
    }, {
      id: "disabled",
      name: "Provider 2",
      enabled: false,
      baseUrl: "https://p2.example/v1",
      apiKey: "must-not-leak-either",
      models: [{ id: "img-2", capabilities: ["generation"] }],
    }],
  });

  assert.deepEqual(catalog.getConfiguredImageResolutions("img"), ["4"]);
  assert.equal(catalog.getImageModelPlatform("img"), "openai");
  assert.equal(catalog.getImageModelFamily("img"), "openai-image");

  const custom = catalog.resolveCustomModel("p1:img", "generation");
  assert.ok(custom, "a configured provider model must resolve by client id");
  assert.equal(custom.clientId, "p1:img");
  assert.equal(custom.label, "img \u00b7 Provider 1");
  assert.equal(catalog.resolveCustomModel("disabled:img-2", "generation"), null, "disabled providers must not offer models");

  const candidates = catalog.getImageModelCandidates();
  // Every configured image model is published with its health/flag columns; the
  // canvas decides what to offer, so a disabled provider stays visible but off.
  assert.equal(candidates.length, 2);
  const primary = candidates.find((item) => item.id === "p1:img");
  assert.ok(primary, "the enabled image model must be listed");
  assert.equal(primary.platform, "openai");
  assert.equal(primary.family, "openai-image");
  assert.deepEqual(primary.resolutions, ["4"]);
  assert.equal(primary.enabled, true);
  assert.equal(candidates.find((item) => item.id === "disabled:img-2")?.enabled, false);
  assert.equal(JSON.stringify(candidates).includes("must-not-leak"), false);
}

function checkSystemModelLabels() {
  const { catalog } = fixture();
  assert.equal(catalog.getSystemImageModelLabel("gpt-image-2-ainb"), "gpt-image-2 \u00b7 ainb");
  assert.equal(catalog.getSystemImageModelLabel("unknown-model"), "unknown-model");
}

checkResolutionRules();
checkJimengLadders();
checkOutputValidation();
checkSavedSettingsLookups();
checkSystemModelLabels();
console.log("Image model catalog checks passed: ladders, validation purity, saved settings and candidate list.");
