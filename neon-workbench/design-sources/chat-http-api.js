"use strict";

function createChatHttpApi({
  getProviderSubsystemError,
  readJson,
  sendJson,
  performWebSearch,
  extractLatestUserText,
  buildDirectWeatherAnswer,
  formatUpstreamError,
  buildChatCompletionMessages,
  hasVisionMessage,
  getPublicProviderModelCatalog,
  findPublicProviderCatalogModel,
  providerExecutor,
  normalizeChatImageResponse,
  saveGeneratedImages,
  providerExecutionHttpStatus,
} = {}) {
  for (const [name, value] of Object.entries({
    readJson,
    sendJson,
    performWebSearch,
    extractLatestUserText,
    buildDirectWeatherAnswer,
    formatUpstreamError,
    buildChatCompletionMessages,
    hasVisionMessage,
    getPublicProviderModelCatalog,
    findPublicProviderCatalogModel,
    normalizeChatImageResponse,
    saveGeneratedImages,
    providerExecutionHttpStatus,
  })) {
    if (typeof value !== "function") throw new TypeError(`Chat HTTP API requires ${name}.`);
  }
  if (!providerExecutor || typeof providerExecutor.execute !== "function") {
    throw new TypeError("Chat HTTP API requires a provider executor.");
  }

  function requestPathname(req) {
    try {
      return new URL(req?.url || "/", `http://${req?.headers?.host || "localhost"}`).pathname;
    } catch {
      return "/";
    }
  }

  async function handle(req, res) {
    if (req.method !== "POST" || requestPathname(req) !== "/api/chat") return false;
    try {
      const providerSubsystemError = getProviderSubsystemError?.();
      if (providerSubsystemError) {
        throw Object.assign(new Error("模型服务凭据暂时锁定，请从包含 Provider 主密钥的完整备份恢复。"), {
          code: String(providerSubsystemError.code || "PROVIDER_SUBSYSTEM_LOCKED"),
        });
      }
      const payload = await readJson(req);
      const baseMessages = Array.isArray(payload.messages) ? payload.messages : [];
      let webSearchResults = [];
      let webSearchError = "";
      if (payload.web_search) {
        try {
          webSearchResults = await performWebSearch(extractLatestUserText(baseMessages));
        } catch (error) {
          webSearchError = formatUpstreamError(error);
        }
      }
      const directWeatherAnswer = buildDirectWeatherAnswer(extractLatestUserText(baseMessages), webSearchResults);
      if (directWeatherAnswer) {
        sendJson(res, 200, {
          model: String(payload.model || "direct-weather"),
          text: directWeatherAnswer,
          choices: [{ message: { role: "assistant", content: directWeatherAnswer } }],
          web_search_results: webSearchResults,
          web_search_error: webSearchError,
        });
        return true;
      }
      const messages = buildChatCompletionMessages(baseMessages, webSearchResults);
      const intent = hasVisionMessage(messages) ? "llm.chat.vision" : "llm.chat";
      const requestedModel = String(payload.model || "").trim();
      const requestedCatalogModel = findPublicProviderCatalogModel(
        getPublicProviderModelCatalog(intent).models,
        requestedModel,
        String(payload.providerId || payload.provider_id || "").trim(),
      );
      const result = await providerExecutor.execute({
        intent,
        preferredProviderId: String(payload.providerId || payload.provider_id || requestedCatalogModel?.providerId || "").trim(),
        preferredModelId: String(requestedCatalogModel?.modelId || requestedModel).trim(),
        input: { messages },
        // Omitted fields use the configured model/provider defaults. Injecting
        // 1200 tokens here silently cut every long canvas/script reply short.
        params: Object.fromEntries([
          "temperature", "top_p", "max_tokens", "max_completion_tokens", "max_output_tokens",
          "reasoning_effort", "reasoning", "stop", "response_format",
        ].filter(key => payload[key] !== undefined && payload[key] !== null).map(key => [key, payload[key]])),
        options: {
          connectTimeoutMs: Number(payload.connect_timeout_ms || 20_000),
          totalTimeoutMs: Number(payload.total_timeout_ms || 300_000),
        },
      });
      const responseModel = getPublicProviderModelCatalog(intent).models.find((model) => (
        model.providerId === result.selection.providerId && model.modelId === result.selection.modelId
      ))?.id || result.selection.modelId;
      const normalizedData = normalizeChatImageResponse({
        model: responseModel,
        text: String(result.text || ""),
        choices: [{ message: { role: "assistant", content: String(result.text || "") }, finish_reason: result.finishReason || null }],
        completion_status: result.completionStatus || "completed",
        incomplete_reason: result.incompleteReason || null,
        warning: result.warning || "",
        usage: result.usage ?? null,
      });
      const savedImages = Array.isArray(normalizedData.data) && normalizedData.data.length
        ? await saveGeneratedImages(normalizedData)
        : [];
      sendJson(res, 200, {
        ...normalizedData,
        selection: result.selection,
        attempts: result.attempts,
        saved_images: savedImages,
        web_search_results: webSearchResults,
        web_search_error: webSearchError,
      });
    } catch (error) {
      const status = providerExecutionHttpStatus(error);
      sendJson(res, status, {
        error: String(error?.safeMessage || error?.message || "模型服务不可用。"),
        code: String(error?.code || "UPSTREAM_UNAVAILABLE"),
        attempts: Array.isArray(error?.attempts) ? error.attempts : [],
      });
    }
    return true;
  }

  return Object.freeze({ handle });
}

module.exports = { createChatHttpApi };
