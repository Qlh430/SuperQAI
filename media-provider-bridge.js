"use strict";

const MEDIA_OPERATIONS = Object.freeze({
  generateImage: "image.generate",
  editImage: "image.edit",
  generateVideo: "video.generate",
  generateAudio: "audio.generate",
});

const PARAMETER_KEYS = Object.freeze([
  "size",
  "resolution",
  "quality",
  "n",
  "duration",
  "aspectRatio",
  "megapixels",
  "steps",
  "refImageSize",
  "format",
  "style",
  "speed",
  "version",
  "niji",
  "stylize",
  "hd",
  "negativePrompt",
  "seed",
  "fps",
]);

function invalidInput(message) {
  return Object.assign(new Error(message), {
    name: "MediaProviderInputError",
    code: "INVALID_MEDIA_INPUT",
    retryable: false,
  });
}

function normalizePrompt(value) {
  const prompt = String(value ?? "").trim();
  if (!prompt) throw invalidInput("Media prompt is required.");
  return prompt;
}

function normalizeInputImages(input = {}) {
  const values = input.inputImages ?? input.referenceImages ?? input.reference_images ?? input.refs ?? [];
  if (!Array.isArray(values)) throw invalidInput("Media input images must be an array.");
  return values.filter((item) => {
    if (typeof item === "string") return Boolean(item.trim());
    if (item instanceof Blob || item?.blob instanceof Blob) return true;
    return Boolean(item && typeof item === "object" && String(item.url || item.data || item.b64_json || "").trim());
  });
}

function buildParams(input = {}) {
  const params = input.params && typeof input.params === "object" && !Array.isArray(input.params)
    ? { ...input.params }
    : {};
  for (const key of PARAMETER_KEYS) {
    if (input[key] !== undefined) params[key] = input[key];
  }
  return params;
}

function createMediaProviderBridge({ executor, adapters = {} } = {}) {
  if (!executor || typeof executor.execute !== "function") {
    throw new TypeError("Media Provider bridge requires a Provider Executor.");
  }
  if (!adapters || typeof adapters !== "object" || Array.isArray(adapters)) {
    throw new TypeError("Media Provider bridge adapters must be an object.");
  }

  async function run(operationName, input = {}) {
    const intent = MEDIA_OPERATIONS[operationName];
    const prompt = normalizePrompt(input.prompt);
    const inputImages = normalizeInputImages(input);
    if (intent === "image.edit" && !inputImages.length) {
      throw invalidInput("Image editing requires at least one input image.");
    }
    const canonicalInput = {
      prompt,
      ...(inputImages.length ? { inputImages } : {}),
      ...(input.mask ? { mask: input.mask } : {}),
    };
    for (const key of ["images", "videos", "audios", "inputVideo", "inputAudio", "negativePrompt"]) {
      if (input[key] !== undefined) canonicalInput[key] = input[key];
    }
    const adapter = adapters[operationName] || adapters[intent];
    const prepared = typeof adapter?.prepare === "function"
      ? await adapter.prepare({ input: canonicalInput, params: buildParams(input) })
      : { input: canonicalInput, params: buildParams(input) };
    const result = await executor.execute({
      intent,
      mustAll: [intent],
      preferredProviderId: String(input.providerId || input.provider_id || "").trim(),
      preferredModelId: String(input.modelId || input.model_id || input.model || "").trim(),
      input: prepared?.input || canonicalInput,
      params: prepared?.params || {},
      options: {
        ...(input.options && typeof input.options === "object" ? input.options : {}),
        ...(input.signal ? { signal: input.signal } : {}),
      },
      ...(typeof input.onAttemptFailure === "function" ? { onAttemptFailure: input.onAttemptFailure } : {}),
    });
    return typeof adapter?.normalizeResult === "function"
      ? adapter.normalizeResult(result)
      : result;
  }

  return Object.freeze({
    generateImage: (input) => run("generateImage", input),
    editImage: (input) => run("editImage", input),
    generateVideo: (input) => run("generateVideo", input),
    generateAudio: (input) => run("generateAudio", input),
  });
}

module.exports = {
  MEDIA_OPERATIONS,
  createMediaProviderBridge,
};
