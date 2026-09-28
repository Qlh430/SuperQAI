"use strict";

function normalizeChatImageResponse(data) {
  const items = [];
  collectImagesFromValue(data.data, items);
  const choices = Array.isArray(data.choices) ? data.choices : [];
  for (const choice of choices) {
    collectImagesFromValue(choice.message?.content, items);
    collectImagesFromValue(choice.message?.images, items);
    collectImagesFromValue(choice.message?.image, items);
    collectImagesFromValue(choice.delta?.content, items);
  }

  collectImagesFromValue(data.candidates, items);
  collectImagesFromValue(data.images, items);
  collectImagesFromValue(data.image, items);
  collectImagesFromValue(data.output, items);
  collectImagesFromValue(data.output_text, items);
  collectImagesFromValue(data.output_image, items);
  collectImagesFromValue(data.outputImage, items);

  const normalizedItems = dedupeImageItems(items);
  if (normalizedItems.length || !Array.isArray(data.data)) data.data = normalizedItems;
  return data;
}

function collectImagesFromValue(value, items) {
  if (!value) return;

  if (typeof value === "string") {
    collectImagesFromText(value, items);
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectImagesFromValue(item, items));
    return;
  }

  if (typeof value !== "object") return;

  const imageUrl = value.image_url?.url || value.image_url;
  const url = value.url || value.local_url || imageUrl;
  const b64 = value.b64_json || value.base64 || value.data;

  if (typeof url === "string") {
    if (url.startsWith("data:image/")) collectImagesFromText(url, items);
    else if (/^https?:\/\//i.test(url) || url.startsWith("/")) items.push({ url });
  }

  if (typeof b64 === "string") {
    if (b64.startsWith("data:image/")) collectImagesFromText(b64, items);
    else if (/^[A-Za-z0-9+/=\s]+$/.test(b64) && b64.length > 100) items.push({ b64_json: b64.replace(/\s/g, "") });
  }

  for (const key of ["content", "text", "images", "image", "parts", "source", "inline_data", "inlineData", "file_data", "fileData"]) {
    if (value[key] !== undefined) collectImagesFromValue(value[key], items);
  }
}

function collectImagesFromText(text, items) {
  const value = String(text || "");
  const dataUrlPattern = /data:image\/([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)/g;
  const markdownPattern = /!\[[^\]]*]\((https?:\/\/[^)\s]+|data:image\/[^)]+)\)/g;
  const urlPattern = /(https?:\/\/[^\s"'<>]+?\.(?:png|jpe?g|webp)(?:\?[^\s"'<>]+)?)/gi;

  for (const match of value.matchAll(dataUrlPattern)) {
    items.push({ b64_json: match[2].replace(/\s/g, "") });
  }

  for (const match of value.matchAll(markdownPattern)) {
    const url = match[1];
    if (url.startsWith("data:image/")) collectImagesFromText(url, items);
    else items.push({ url });
  }

  for (const match of value.matchAll(urlPattern)) {
    items.push({ url: match[1] });
  }
}

function dedupeImageItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.url || item.b64_json;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createImageGenerationService({
  routing,
  getPublicProviderModelCatalog,
  findPublicProviderCatalogModel,
  isMidjourneyImageModel,
  validateImageOutputRequest,
  mediaProviderBridge,
  getNanoBananaImageOptions,
  imageReferenceToFile,
  getOpenAIEditMaskRef,
  ensurePngFilename,
  saveGeneratedImages,
  providerExecutionHttpStatus,
  isAmbiguousSubmissionError,
} = {}) {
  for (const [name, dependency] of Object.entries({
    routing,
    getPublicProviderModelCatalog,
    findPublicProviderCatalogModel,
    isMidjourneyImageModel,
    validateImageOutputRequest,
    mediaProviderBridge,
    getNanoBananaImageOptions,
    imageReferenceToFile,
    getOpenAIEditMaskRef,
    ensurePngFilename,
    saveGeneratedImages,
    providerExecutionHttpStatus,
    isAmbiguousSubmissionError,
  })) {
    if (!dependency) throw new TypeError(`Image generation service requires ${name}.`);
  }

  async function execute(payload = {}, options = {}) {
    try {
      const signal = options.signal || null;
      const refs = (payload.reference_images || []).filter((ref) => ref && ref.url);
      const requirements = routing.getProviderTaskRequirements({ referenceImages: refs });
      const requestedModel = String(payload.modelId || payload.model_id || payload.model || "").trim();
      const targetCatalog = getPublicProviderModelCatalog(requirements.intent);
      const generationCatalog = requirements.intent === "image.edit"
        ? getPublicProviderModelCatalog("image.generate")
        : targetCatalog;
      const catalogModel = findPublicProviderCatalogModel(
        [...targetCatalog.models, ...generationCatalog.models],
        requestedModel,
        String(payload.providerId || payload.provider_id || "").trim(),
      );
      const preferredProviderId = String(payload.providerId || payload.provider_id || catalogModel?.providerId || "").trim();
      const preferredModelId = String(catalogModel?.modelId || requestedModel).trim();
      const presentationModel = String(catalogModel?.id || preferredModelId || targetCatalog.defaultModel || "").trim();

      if (presentationModel && !isMidjourneyImageModel(presentationModel)) {
        const compatibility = validateImageOutputRequest(
          presentationModel,
          payload.size || "auto",
          payload.resolution || (String(payload.size || "auto").toLowerCase() === "auto" ? "auto" : "1k"),
          catalogModel,
        );
        if (!compatibility.supported) {
          return {
            status: 400,
            body: {
              error: compatibility.reason,
              code: "IMAGE_SIZE_NOT_SUPPORTED",
              alternative: compatibility.alternative?.exactSize || "",
            },
          };
        }
      }
      const executeMedia = requirements.intent === "image.edit"
        ? mediaProviderBridge.editImage
        : mediaProviderBridge.generateImage;
      const protocolParams = String(catalogModel?.platform || "").toLowerCase() === "google"
        ? getNanoBananaImageOptions(preferredModelId, payload.size, payload.resolution)
        : {};
      let inputImages = refs;
      let mask = null;
      if (requirements.intent === "image.edit") {
        inputImages = await Promise.all(refs.slice(0, 4).map((ref, index) => {
          const hasMask = Boolean(ref.maskUrl || ref.openaiMaskUrl);
          const source = hasMask && ref.maskBaseUrl ? ref.maskBaseUrl : ref.url;
          const name = hasMask && ref.maskBaseName ? ref.maskBaseName : (ref.name || `reference_${index + 1}.jpg`);
          return imageReferenceToFile(source, name, { signal }).then(async (file) => {
            const bytes = Buffer.from(await file.blob.arrayBuffer());
            return `data:${file.blob.type || "image/png"};base64,${bytes.toString("base64")}`;
          });
        }));
        const maskRef = getOpenAIEditMaskRef(refs.slice(0, 4));
        if (maskRef) {
          const maskSource = maskRef.openaiMaskUrl || maskRef.maskUrl;
          const maskName = maskRef.openaiMaskName || maskRef.maskName || "openai-edit-mask.png";
          const file = await imageReferenceToFile(maskSource, ensurePngFilename(maskName), { signal });
          const bytes = Buffer.from(await file.blob.arrayBuffer());
          mask = `data:${file.blob.type || "image/png"};base64,${bytes.toString("base64")}`;
        }
      }
      const result = await executeMedia({
        ...payload,
        prompt: payload.prompt || "",
        inputImages,
        ...(mask ? { mask } : {}),
        providerId: preferredProviderId,
        modelId: preferredModelId,
        params: { ...(payload.params || {}), ...protocolParams },
        signal,
        options: {
          ...(options.onTaskSubmitted ? { onTaskSubmitted: options.onTaskSubmitted } : {}),
          ...(options.resumeTask ? { resumeTask: options.resumeTask } : {}),
        },
      });
      const selectedCatalogModel = [...targetCatalog.models, ...generationCatalog.models].find((model) => (
        model.providerId === result.selection?.providerId && model.modelId === result.selection?.modelId
      ));
      const responseModel = requestedModel
        ? presentationModel || result.selection?.modelId || result.model || ""
        : selectedCatalogModel?.id || result.selection?.modelId || result.model || presentationModel;
      const data = normalizeChatImageResponse({ ...result, model: responseModel });
      const remoteBody = { ...data, model: responseModel };
      options.onRemoteResult?.(remoteBody);
      try {
        const savedImages = await saveGeneratedImages(data, { signal });
        return { status: 200, body: { ...data, model: responseModel, saved_images: savedImages } };
      } catch (error) {
        if (!options.preserveRemoteOnSyncFailure) throw error;
        return {
          status: 200,
          body: {
            ...remoteBody,
            saved_images: (Array.isArray(data?.data) ? data.data : []).map(() => ({ error: String(error?.message || error) })),
            code: "image_sync_failed",
            sync_error: String(error?.message || error || "图片原图同步失败。"),
          },
        };
      }
    } catch (error) {
      if (options.signal?.aborted) throw options.signal.reason || error;
      if (options.preserveAmbiguousSubmissionFailure && (isAmbiguousSubmissionError(error) || error?.submissionState === "not_submitted")) throw error;
      const status = providerExecutionHttpStatus(error);
      return {
        status,
        body: {
          error: `图片生成失败：${String(error?.safeMessage || error?.message || "模型服务不可用。")}`,
          code: String(error?.code || "UPSTREAM_UNAVAILABLE"),
          attempts: Array.isArray(error?.attempts) ? error.attempts : [],
        },
      };
    }
  }

  return Object.freeze({
    execute,
    normalizeChatImageResponse,
  });
}

module.exports = {
  createImageGenerationService,
  normalizeChatImageResponse,
};
