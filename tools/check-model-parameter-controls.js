const assert = require("node:assert/strict");
const path = require("node:path");

const modulePath = path.join(__dirname, "..", "model-parameter-controls.js");
const parameters = require(modulePath);

function model(protocol, capabilities, parameterOverrides = {}, extra = {}) {
  return {
    id: extra.id || "test-model",
    displayName: extra.displayName || "",
    protocol,
    capabilities,
    metadata: { ...extra.metadata, parameterOverrides },
  };
}

function row(values) {
  const controls = Object.entries(values).map(([key, spec]) => ({
    dataset: { modelParam: key, paramOriginal: String(spec.original ?? "") },
    value: String(spec.value ?? ""),
  }));
  return { querySelectorAll: (selector) => selector === "[data-model-param]" ? controls : [] };
}

assert.deepEqual(
  parameters.fieldsForModel(model("openai", ["llm.chat"])).map((field) => field.key),
  ["temperature", "max_tokens"],
);
assert.deepEqual(
  parameters.fieldsForModel(model("openai-responses", ["llm.chat"])).map((field) => field.key),
  ["temperature", "max_output_tokens"],
);
assert.deepEqual(
  parameters.fieldsForModel(model("anthropic", ["llm.chat"])).map((field) => field.key),
  ["max_tokens"],
);
assert.deepEqual(
  parameters.fieldsForModel(model("openai-images", ["image.generate"])).map((field) => field.key),
  ["size", "quality", "background"],
);
assert.deepEqual(
  parameters.fieldsForModel(model("openai", ["image.generate"])).map((field) => field.key),
  ["size", "quality", "background"],
  "image-only OpenAI models must not expose LLM controls",
);
assert.deepEqual(
  parameters.fieldsForModel(model("openai-images", ["image.generate"], {}, { id: "gpt-image-2" })).map((field) => field.key),
  ["size", "quality", "background", "output_format"],
  "GPT Image models must expose the output-format control",
);
assert.deepEqual(
  parameters.fieldsForModel(model("openai-images", ["image.generate"], {}, { id: "flux-pro-1.1" })).map((field) => field.key),
  ["size", "steps", "guidance_scale", "seed", "negativePrompt"],
  "Flux models must expose Flux-specific controls",
);
assert.deepEqual(
  parameters.fieldsForModel(model("openai-images", ["image.generate"], {}, { id: "relay-image", displayName: "Flux Schnell · Relay" })).map((field) => field.key),
  ["size", "steps", "guidance_scale", "seed", "negativePrompt"],
  "Flux detection must also honor the display name",
);
assert.deepEqual(
  parameters.fieldsForModel(model("gemini", ["image.generate"])).map((field) => field.key),
  ["aspect_ratio", "image_size"],
);
assert.deepEqual(
  parameters.fieldsForModel(model("midjourney", ["image.generate"])).map((field) => field.key),
  ["version", "mode", "speed", "quality", "style", "stylize"],
);
assert.deepEqual(
  parameters.fieldsForModel(model("image-relay", ["image.generate"], {}, { id: "nano-banana-pro-grsai" })).map((field) => field.key),
  ["size", "resolution"],
);
assert.deepEqual(
  parameters.fieldsForModel(model("image-relay", ["generation", "edit"], {}, { id: "nano-banana-2-grsai" })).map((field) => field.key),
  ["size", "resolution"],
  "locally stored GrsAI capability IDs must be recognized",
);
assert.deepEqual(
  parameters.fieldsForModel(model("image-relay", ["generation"], {}, { id: "gpt-image-2-vip-grsai" })).map((field) => field.key),
  [],
  "GPT relay models must not offer guessed ratio or resolution parameters",
);
assert.deepEqual(
  parameters.fieldsForModel(model("image-relay", ["generation"], {}, { id: "nano-banana-pro-grsai" })).find((field) => field.key === "resolution").options,
  ["1K", "2K", "4K"],
  "relay resolution is serialized verbatim as imageSize",
);
for (const id of ["gpt-image-2-grsai", "gpt-image-2.5-grsai", "gpt-image-2.5-flare-grsai", "gpt-image-2.5-sunburst-grsai", "unknown-relay"]) {
  assert.deepEqual(parameters.fieldsForModel(model("image-relay", ["generation"], {}, { id })), []);
}
assert.deepEqual(parameters.fieldsForModel(model("gemini", ["llm.chat"])), []);
assert.deepEqual(parameters.fieldsForModel(model("made-up", ["llm.chat"])), []);

assert.deepEqual(
  parameters.canvasFieldsForModel(model("gemini", ["image.generate"])).map((field) => field.key),
  [],
  "Gemini canvas controls use the node ratio and resolution selectors",
);
assert.deepEqual(
  parameters.canvasFieldsForModel(model("openai-images", ["image.generate"], {}, { id: "flux-dev" })).map((field) => field.key),
  ["steps", "guidance_scale", "seed", "negativePrompt"],
);
assert.deepEqual(
  parameters.canvasFieldsForModel(model("openai-images", ["image.generate"], {}, { id: "gpt-image-2" })).map((field) => field.key),
  [],
  "the node keeps its own size and resolution selectors instead of per-model presentation fields",
);
assert.deepEqual(
  parameters.canvasFieldsForModel(model("openai-images", ["image.generate"], {}, { id: "gpt-image-1" })).map((field) => field.key),
  ["quality"],
  "background and output format stay in the API 设置 defaults, not on the node",
);
assert.deepEqual(
  parameters.canvasFieldsForModel(model("openai-images", ["image.generate"], {}, { id: "gpt-image-2" }), { automatic: true }),
  [],
  "automatic selection must not pin one model's protocol parameters",
);
assert.deepEqual(
  parameters.canvasFieldsForModel(model("openai-images", ["image.generate"], {}, { id: "flux-dev" }), { automatic: true }),
  [],
  "automatic selection must not pin Flux defaults either",
);
assert.deepEqual(
  parameters.canvasFieldsForModel(model("midjourney", ["image.generate"])).map((field) => field.key),
  [],
  "Midjourney keeps its dedicated node controls",
);

const unsafe = model("openai-images", ["image.generate"], {
  size: '\"><script>alert(1)</script>',
  secret: { nested: true },
});
const html = parameters.markup(unsafe);
assert.match(html, /^<details class="settings-model-defaults"><summary>默认参数<\/summary>/);
assert.match(html, /class="settings-model-parameters"/);
assert.doesNotMatch(html, /<textarea|type="json"|name=/i);
assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
assert.match(html, /已保存：/);
assert.match(html, /仍会保留/);

const localizedImageHtml = parameters.markup(model("openai-images", ["image.generate"], { size: "1024x1536", quality: "high", background: "transparent" }));
assert.match(localizedImageHtml, />1024×1536<\/option>/);
assert.match(localizedImageHtml, /value="high" selected>高<\/option>/);
assert.match(localizedImageHtml, /value="transparent" selected>透明<\/option>/);
assert.match(localizedImageHtml, /value="auto">自动<\/option>/);

const original = {
  temperature: "0.7",
  max_tokens: 512,
  falseFlag: false,
  zeroFlag: 0,
  nested: { keep: [1, 2] },
};
const openai = model("openai-chat", ["llm.chat"], original);
const changed = parameters.read(row({
  temperature: { original: "0.7", value: "0" },
  max_tokens: { original: "512", value: "512" },
}), openai);
assert.deepEqual(changed, { ...original, temperature: 0 });
assert.equal(original.temperature, "0.7", "model must not be mutated");

const cleared = parameters.read(row({
  temperature: { original: "0.7", value: "" },
  max_tokens: { original: "512", value: "512" },
}), openai);
assert.deepEqual(cleared, { max_tokens: 512, falseFlag: false, zeroFlag: 0, nested: { keep: [1, 2] } });

assert.deepEqual(
  parameters.read(row({ temperature: { original: "0.7", value: "0.7" } }), openai),
  original,
  "unchanged rendered values retain their original type",
);

const fractionalTemperatureHtml = parameters.markup(model("openai-chat", ["llm.chat"], { temperature: 0.75 }));
assert.match(fractionalTemperatureHtml, /data-model-param="temperature"[^>]*step="any"/);

for (const legacyValue of [{ legacy: true }, true, "bad", "0x1", " 1 "]) {
  const legacyModel = model("openai-chat", ["llm.chat"], { temperature: legacyValue, max_tokens: 512 });
  const legacyHtml = parameters.markup(legacyModel);
  assert.match(legacyHtml, /已保留原有设置/);
  assert.doesNotMatch(legacyHtml, /data-model-param="temperature"/);
  assert.deepEqual(parameters.read(row({ max_tokens: { original: "512", value: "512" } }), legacyModel), legacyModel.metadata.parameterOverrides);
}

for (const value of ["NaN", "Infinity", "2.1", "-0.1"]) {
  assert.throws(
    () => parameters.validate(row({ temperature: { original: "0.7", value } }), openai),
    /随机程度.*请输入|随机程度.*范围/,
  );
}
assert.throws(
  () => parameters.read(row({ max_tokens: { original: "512", value: "1.5" } }), openai),
  /回复长度上限.*整数/,
);

const unsupported = model("gemini", ["llm.chat"], { temperature: "legacy", extra: false });
assert.deepEqual(parameters.read(row({}), unsupported), { temperature: "legacy", extra: false });
assert.match(parameters.markup(unsupported), /暂无可安全编辑的参数/);

console.log("Model parameter control checks passed.");
