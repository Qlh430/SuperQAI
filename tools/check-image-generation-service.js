"use strict";

const assert = require("node:assert/strict");

const {
  createImageGenerationService,
  normalizeChatImageResponse,
} = require("../image-generation-service");

const catalog = {
  defaultModel: "model-a",
  models: [{
    id: "model-a",
    providerId: "provider-a",
    modelId: "upstream-a",
    platform: "openai",
  }],
};

function fixture(overrides = {}) {
  const calls = {
    generate: [],
    edit: [],
    references: [],
  };
  const service = createImageGenerationService({
    routing: {
      getProviderTaskRequirements: ({ referenceImages }) => ({
        intent: referenceImages.length ? "image.edit" : "image.generate",
      }),
    },
    getPublicProviderModelCatalog: () => catalog,
    findPublicProviderCatalogModel: () => catalog.models[0],
    isMidjourneyImageModel: () => false,
    validateImageOutputRequest: () => ({ supported: true }),
    mediaProviderBridge: {
      generateImage: async (input) => {
        calls.generate.push(input);
        return {
          data: [{ url: "https://cdn.example.test/result.png" }],
          selection: { providerId: "provider-a", modelId: "upstream-a" },
        };
      },
      editImage: async (input) => {
        calls.edit.push(input);
        return {
          data: [{ url: "https://cdn.example.test/edited.png" }],
          selection: { providerId: "provider-a", modelId: "upstream-a" },
        };
      },
    },
    getNanoBananaImageOptions: () => ({}),
    imageReferenceToFile: async (source, filename) => {
      calls.references.push({ source, filename });
      return {
        filename,
        blob: new Blob([Buffer.from(source)], { type: "image/png" }),
      };
    },
    getOpenAIEditMaskRef: (refs) => refs.find((ref) => ref.maskUrl) || null,
    ensurePngFilename: (filename) => /\.png$/i.test(filename) ? filename : `${filename}.png`,
    saveGeneratedImages: async () => [{ url: "/output/result.png", width: 1, height: 1 }],
    providerExecutionHttpStatus: () => 502,
    isAmbiguousSubmissionError: () => false,
    ...overrides,
  });
  return { calls, service };
}

(async () => {
  const normalized = normalizeChatImageResponse({
    data: [
      { url: "https://cdn.example.test/a.png" },
      { url: "https://cdn.example.test/a.png" },
      { b64_json: "A".repeat(120) },
    ],
    choices: [{ message: { content: "![image](https://cdn.example.test/b.webp)" } }],
  });
  assert.equal(normalized.data.length, 3);
  assert.deepEqual(normalized.data[0], { url: "https://cdn.example.test/a.png" });
  assert.deepEqual(normalized.data[2], { url: "https://cdn.example.test/b.webp" });

  const generation = fixture();
  const generated = await generation.service.execute({
    modelId: "model-a",
    prompt: "cat",
    size: "1:1",
    resolution: "1k",
  });
  assert.equal(generated.status, 200);
  assert.equal(generated.body.model, "model-a");
  assert.equal(generated.body.saved_images[0].url, "/output/result.png");
  assert.equal(generation.calls.generate.length, 1);
  assert.equal(generation.calls.generate[0].modelId, "upstream-a");

  const edit = fixture();
  const edited = await edit.service.execute({
    modelId: "model-a",
    prompt: "change background",
    reference_images: [{
      url: "/assets/source.png",
      maskUrl: "/assets/mask.png",
      openaiMaskUrl: "https://cdn.example.test/mask.png",
    }],
  });
  assert.equal(edited.status, 200);
  assert.equal(edit.calls.edit.length, 1);
  assert.match(edit.calls.edit[0].inputImages[0], /^data:image\/png;base64,/);
  assert.match(edit.calls.edit[0].mask, /^data:image\/png;base64,/);
  assert.equal(edit.calls.references[1].source, "https://cdn.example.test/mask.png");
  assert.equal(edit.calls.references[1].filename, "openai-edit-mask.png");

  const unsupported = fixture({
    validateImageOutputRequest: () => ({
      supported: false,
      reason: "unsupported size",
      alternative: { exactSize: "1024x1024" },
    }),
  });
  const rejected = await unsupported.service.execute({ modelId: "model-a", prompt: "cat" });
  assert.equal(rejected.status, 400);
  assert.equal(rejected.body.code, "IMAGE_SIZE_NOT_SUPPORTED");
  assert.equal(unsupported.calls.generate.length, 0);

  const failed = fixture({
    mediaProviderBridge: {
      generateImage: async () => {
        throw Object.assign(new Error("upstream unavailable"), {
          code: "UPSTREAM_UNAVAILABLE",
          safeMessage: "上游暂时不可用",
        });
      },
      editImage: async () => {
        throw new Error("unused");
      },
    },
  });
  const failure = await failed.service.execute({ modelId: "model-a", prompt: "cat" });
  assert.equal(failure.status, 502);
  assert.equal(failure.body.code, "UPSTREAM_UNAVAILABLE");
  assert.match(failure.body.error, /上游暂时不可用/);

  console.log("Image generation service checks passed: response normalization, generation, edit masks, validation and errors.");
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
