const assert = require("assert");
const fs = require("fs");
const path = require("path");
const rules = require("../image-resolution-rules");
const ROOT = path.join(__dirname, "..");

const OPENAI_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];
const OPENAI_FOUR_K = {
  "1:1": { supported: false, alternative: "2880x2880" },
  "2:3": { supported: false, alternative: "2336x3520" },
  "3:2": { supported: false, alternative: "3520x2336" },
  "3:4": { supported: false, alternative: "2480x3312" },
  "4:3": { supported: false, alternative: "3312x2480" },
  "4:5": { supported: false, alternative: "2560x3216" },
  "5:4": { supported: false, alternative: "3216x2560" },
  "9:16": { supported: true, size: "2160x3840" },
  "16:9": { supported: true, size: "3840x2160" },
  "21:9": { supported: true, size: "3840x1632" },
};

for (const ratio of OPENAI_RATIOS) {
  for (const resolution of ["1", "2"]) {
    const result = rules.getCompatibility({
      platform: "openai",
      ratio,
      resolution,
      configuredResolutions: ["1", "2", "4"],
    });
    assert.strictEqual(result.supported, true, `OpenAI ${ratio} ${resolution}K should be supported`);
    assert.match(result.requestedSize, /^\d+x\d+$/);
    const [width, height] = result.requestedSize.split("x").map(Number);
    assert.strictEqual(rules.validateOpenAiDimensions(width, height).supported, true);
  }

  const result = rules.getCompatibility({
    platform: "openai",
    ratio,
    resolution: "4",
    configuredResolutions: ["1", "2", "4"],
  });
  const expected = OPENAI_FOUR_K[ratio];
  assert.strictEqual(result.supported, expected.supported, `Unexpected OpenAI ${ratio} 4K state`);
  if (expected.supported) {
    assert.strictEqual(result.requestedSize, expected.size);
    assert.strictEqual(result.alternative, null);
  } else {
    assert.strictEqual(result.requestedSize, null);
    assert.strictEqual(result.alternative.exactSize, expected.alternative);
    assert.strictEqual(result.alternative.value, `exact:${expected.alternative}`);
  }
}

assert.deepStrictEqual(
  rules.getCompatibility({
    platform: "openai",
    ratio: "16:9",
    resolution: "4",
    configuredResolutions: ["1", "2", "4"],
  }),
  { supported: true, requestedSize: "3840x2160", level: "4", reason: "", alternative: null },
);

assert.strictEqual(
  rules.getCompatibility({
    platform: "openai",
    ratio: "1:1",
    resolution: "4",
    configuredResolutions: ["1"],
  }).supported,
  false,
);

assert.strictEqual(
  rules.getCompatibility({
    platform: "openai",
    ratio: "2880x2880",
    resolution: "4k",
    configuredResolutions: ["1"],
  }).supported,
  false,
);

const openAiAuto = rules.getCompatibility({
  platform: "openai",
  ratio: "auto",
  resolution: "auto",
  configuredResolutions: ["1", "2", "4"],
});
assert.strictEqual(openAiAuto.supported, true);
assert.strictEqual(openAiAuto.requestedSize, "auto");
assert.strictEqual(
  rules.getCompatibility({
    platform: "openai",
    ratio: "auto",
    resolution: "2",
    configuredResolutions: ["1", "2", "4"],
  }).supported,
  false,
);

assert.strictEqual(rules.validateOpenAiDimensions(3840, 2160).supported, true);
assert.strictEqual(rules.validateOpenAiDimensions(2880, 2880).supported, true);
assert.strictEqual(rules.validateOpenAiDimensions(4096, 2048).supported, false);
assert.strictEqual(rules.validateOpenAiDimensions(2049, 1024).supported, false);
assert.strictEqual(rules.validateOpenAiDimensions(3840, 1280).supported, true);
assert.strictEqual(rules.validateOpenAiDimensions(3840, 1264).supported, false);
assert.strictEqual(rules.validateOpenAiDimensions(3840, 3840).supported, false);
assert.strictEqual(rules.validateOpenAiDimensions(640, 1024).supported, true);
assert.strictEqual(rules.validateOpenAiDimensions(624, 1024).supported, false);

const openAiSquareChoices = rules.getResolutionChoices({
  platform: "openai",
  ratio: "1:1",
  configuredResolutions: ["1", "2", "4"],
});
assert.deepStrictEqual(
  openAiSquareChoices.map(({ value, disabled }) => ({ value, disabled })),
  [
    { value: "1", disabled: false },
    { value: "2", disabled: false },
    { value: "4", disabled: true },
    { value: "exact:2880x2880", disabled: false },
  ],
);
assert.strictEqual(openAiSquareChoices[2].label, "4K（1:1 不支持）");
assert.strictEqual(openAiSquareChoices[3].label, "最大方图 2880×2880");

for (const providerContext of [
  { providerProtocol: "apimart", providerHost: "api.apimart.ai" },
  { providerProtocol: "openai", providerHost: "apib.ai" },
]) {
  assert.deepStrictEqual(
    rules.getCompatibility({
      platform: "openai",
      ratio: "1:1",
      resolution: "4",
      configuredResolutions: ["1", "2", "4"],
      ...providerContext,
    }),
    {
      supported: true,
      requestedSize: "1:1",
      level: "4",
      reason: "",
      alternative: null,
      parameterMode: "ratio-resolution",
    },
  );
  assert.deepStrictEqual(
    rules.getResolutionChoices({
      platform: "openai",
      ratio: "1:1",
      configuredResolutions: ["1", "2", "4"],
      ...providerContext,
    }).map(({ value, disabled }) => ({ value, disabled })),
    [
      { value: "1", disabled: false },
      { value: "2", disabled: false },
      { value: "4", disabled: false },
    ],
  );
}

const googleCases = [
  ["gemini-3.1-flash-image", ["512", "1", "2", "4"]],
  ["gemini-3-pro-image", ["1", "2", "4"]],
  ["gemini-2.5-flash-image", ["1"]],
  ["gemini-3.1-flash-lite-image", ["1"]],
];
for (const [family, supportedLevels] of googleCases) {
  for (const level of ["512", "1", "2", "4"]) {
    const result = rules.getCompatibility({
      platform: "google",
      family,
      ratio: "1:1",
      resolution: level,
      configuredResolutions: ["512", "1", "2", "4"],
    });
    assert.strictEqual(result.supported, supportedLevels.includes(level), `${family} ${level} state`);
  }
}

assert.strictEqual(
  rules.getCompatibility({
    platform: "google",
    family: "gemini-3.1-flash-image",
    ratio: "1:8",
    resolution: "4",
    configuredResolutions: ["4"],
  }).supported,
  true,
);
assert.strictEqual(
  rules.getCompatibility({
    platform: "google",
    family: "gemini-3-pro-image",
    ratio: "1:8",
    resolution: "4",
    configuredResolutions: ["4"],
  }).supported,
  false,
);

const googleSquareChoices = rules.getResolutionChoices({
  platform: "google",
  family: "gemini-3.1-flash-image",
  ratio: "1:1",
  configuredResolutions: ["1", "2", "4"],
});
assert.deepStrictEqual(
  googleSquareChoices.map(({ value, disabled }) => ({ value, disabled })),
  [
    { value: "1", disabled: false },
    { value: "2", disabled: false },
    { value: "4", disabled: false },
  ],
);

assert.strictEqual(rules.normalizeFamily("gemini-3.1-flash-lite-image-preview"), "gemini-3.1-flash-lite-image");
assert.deepStrictEqual(rules.parseResolutionChoice("exact:2880x2880"), {
  type: "exact",
  value: "exact:2880x2880",
  level: "4",
  exactSize: "2880x2880",
});

// 即梦 video ladders mirror the CLI's own published support table. The 2.5 build
// reaches 30s at three resolutions; the VIP builds add 4k; everything else is
// 720p within 4-15s.
assert.deepStrictEqual(rules.videoResolutionsFor("seedance2.5"), ["480p", "720p", "1080p"]);
assert.deepStrictEqual(rules.videoDurationRangeFor("seedance2.5"), { min: 4, max: 30 });
assert.deepStrictEqual(rules.videoResolutionsFor("seedance2.0_vip"), ["720p", "1080p", "4k"]);
assert.deepStrictEqual(rules.videoDurationRangeFor("seedance2.0fast_vip"), { min: 4, max: 15 });
assert.deepStrictEqual(rules.videoResolutionsFor("seedance2.0"), ["720p"]);
assert.deepStrictEqual(rules.videoDurationRangeFor("seedance2.0mini"), { min: 4, max: 15 });
assert.deepStrictEqual(rules.videoRatiosFor("seedance2.5"), ["1:1", "3:4", "16:9", "4:3", "9:16", "21:9"]);
// A first frame changes both flags: 2.5 rejects --ratio outright, and the two
// legacy builds narrow their duration window.
assert.deepStrictEqual(rules.videoRatiosFor("seedance2.5", { hasReference: true }), []);
assert.deepStrictEqual(rules.videoRatiosFor("seedance2.0", { hasReference: true }), ["1:1", "3:4", "16:9", "4:3", "9:16", "21:9"]);
assert.deepStrictEqual(rules.videoDurationRangeFor("seedance1.0fast"), { min: 4, max: 15 });
assert.deepStrictEqual(rules.videoDurationRangeFor("seedance1.0fast", { hasReference: true }), { min: 5, max: 10 });
assert.deepStrictEqual(rules.videoDurationRangeFor("seedance1.5pro", { hasReference: true }), { min: 5, max: 12 });
// A non-即梦 transport keeps its own catalog values.
assert.deepStrictEqual(rules.videoResolutionsFor("seedance2.5", { platform: "comfyui" }), []);
assert.strictEqual(rules.videoDurationRangeFor("seedance2.5", { platform: "comfyui" }), null);

const indexSource = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const rulesScriptIndex = indexSource.indexOf("image-resolution-rules.js");
const appScriptIndex = indexSource.indexOf("script.js");
assert.notStrictEqual(rulesScriptIndex, -1, "index.html must load image-resolution-rules.js");
assert(rulesScriptIndex < appScriptIndex, "resolution rules must load before script.js");

const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
assert(packageJson.scripts.check.includes("node tools/check-image-resolution-rules.js"));

console.log("image resolution rules checks passed");
