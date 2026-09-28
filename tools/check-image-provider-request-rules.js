"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const imageResolutionRules = require("../image-resolution-rules");
const { createImageProviderRequestRules } = require("../image-provider-request-rules");

const rules = createImageProviderRequestRules({
  imageResolutionRules,
  getImageModelFamily: (model) => {
    const value = String(model || "").toLowerCase();
    if (value.includes("gpt-image-2")) return "gpt-image-2";
    if (value.includes("nano-banana-pro")) return "gemini-3-pro-image";
    return "openai-image";
  },
  resolveCustomModel: (model) => String(model || "") === "custom-image"
    ? { model: { id: "upstream-custom-image" } }
    : null,
  ainbImageModelAlias: "gpt-image-2",
  clseImageModelAlias: "gpt-image-2-clse",
  clseImageUpstreamModel: "gpt-image-2",
  apimartImageModelAlias: "gpt-image-2-apimart",
  apimartImageUpstreamModel: "gpt-image-2",
  midjourneyImageModelAlias: "midjourney",
  grsaiImageModels: [
    "gpt-image-2-grsai",
    "nano-banana-pro-grsai",
  ],
});

assert.deepEqual(rules.normalizeMidjourneyOptions({ version: "8.2", hd: true }), {
  version: "8.2",
  niji: false,
  speed: "fast",
  style: "raw",
  stylize: 100,
  hd: true,
});
assert.throws(() => rules.normalizeMidjourneyOptions({ version: "7", hd: true }), /HD is only supported/);
assert.equal(rules.normalizeMidjourneySize("auto"), "1:1");
assert.equal(rules.normalizeMidjourneySize("16:9"), "16:9");
assert.equal(rules.normalizeApimartSize("1024x1024"), "1:1");
assert.equal(rules.normalizeApimartSize("1920x1080"), "16:9");

assert.equal(rules.isAinbImageModel("gpt-image-2"), true);
assert.equal(rules.isClseImageModel("gpt-image-2-clse"), true);
assert.equal(rules.isApimartImageModel("gpt-image-2-apimart"), true);
assert.equal(rules.isMidjourneyImageModel("MIDJOURNEY"), true);
assert.equal(rules.isGrsaiImageModel("gpt-image-2-grsai"), true);
assert.equal(rules.isGptImage2RequestModel("custom-image"), false);
assert.equal(rules.isGptImage2RequestModel("gpt-image-2"), true);

assert.equal(rules.getUpstreamImageModel("gpt-image-2-apimart"), "gpt-image-2");
assert.equal(rules.getUpstreamImageModel("nano-banana-pro-grsai"), "nano-banana-pro");
assert.equal(rules.getUpstreamImageModel("custom-image"), "upstream-custom-image");
assert.equal(rules.getLegacyEnvironmentUpstreamModel("gpt-image-2-clse"), "gpt-image-2");
assert.equal(rules.getImageResponseModel("gpt-image-2-apimart", "fallback"), "gpt-image-2-apimart");
assert.equal(rules.getImageResponseModel("unknown", "fallback"), "fallback");

assert.equal(rules.normalizeGptImage2Quality("auto", "2k", true), "medium");
assert.equal(rules.normalizeGptImage2Quality("low", "4k", true), "low");
assert.equal(rules.normalizeGptImage2Quality("", "1k", false), "auto");
assert.match(rules.normalizeGptImage2RequestSize("16:9", "2k"), /^\d+x\d+$/);
assert.deepEqual(rules.getGptImage2CompatHints("16:9", "2k", "2048x1152"), {
  aspect_ratio: "16:9",
  resolution: "2k",
  image_size: "2K",
});

assert.deepEqual(rules.getGrsaiImageParams("nano-banana-pro-grsai", "16:9", "2k"), {
  aspectRatio: "16:9",
  imageSize: "2K",
});
assert.equal(rules.getGrsaiImageParams("gpt-image-2-grsai", "1:1", "1k").aspectRatio, "1024x1024");
assert.deepEqual(rules.getNanoBananaImageOptions("nano-banana-pro", "16:9", "4k"), {
  aspect_ratio: "16:9",
  image_size: "4K",
});

assert.deepEqual(rules.getOpenAIEditMaskRef([
  { url: "/source.png" },
  { maskUrl: "/mask.png" },
]), { maskUrl: "/mask.png" });
assert.equal(rules.ensurePngFilename("mask.webp"), "mask.png");
assert.equal(rules.normalizeGrsaiGptImageSize("2048x1152", 1024), "1024x576");
assert.equal(rules.isOfficialOpenAIUrl("https://api.openai.com/v1"), true);
assert.equal(rules.isOfficialOpenAIUrl("https://proxy.example.test/v1"), false);

const serverSource = fs.readFileSync(path.join(root, "server.js"), "utf8");
for (const functionName of [
  "normalizeMidjourneyOptions",
  "normalizeApimartSize",
  "getGrsaiImageParams",
  "normalizeGptImage2Quality",
  "getNanoBananaImageOptions",
  "ensurePngFilename",
]) {
  assert.doesNotMatch(
    serverSource,
    new RegExp(`function\\s+${functionName}\\s*\\(`),
    `${functionName} must live in image-provider-request-rules.js`,
  );
}

console.log("Image provider request rule checks passed.");
