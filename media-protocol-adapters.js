"use strict";

const { joinProtocolUrl } = require("./provider-protocol-registry");
const { providerHasHost, imageResolution, serializedImages, normalizeImageResultData } = require("./media-image-contract");
const { isQuotaRejection } = require("./provider-response-errors");

function providerBaseUrl(provider) {
  return String(provider?.baseUrl || "").trim()
    .replace(/\/+$/, "")
    .replace(/\/v1\/(?:images\/(?:generations|edits)|midjourney\/generations(?:\/(?:edits|blend))?|tasks(?:\/.*)?|api\/(?:generate|result))$/i, "");
}

function providerApiKey(provider) {
  return String(provider?.apiKey || provider?.api_key || "");
}

function modelId(model) {
  return String(model?.id || model?.model || "").trim();
}

function upstreamModelId(model) {
  return String(model?.metadata?.upstreamModel || model?.upstreamModel || modelId(model)).trim();
}

function isMidjourneyModel(model) {
  const protocol = String(model?.protocol || model?.modelProtocol || "").trim().toLowerCase();
  return protocol === "midjourney" || protocol === "apimart-midjourney" || /midjourney|^mj(?:[-_]|$)/i.test(modelId(model));
}

// Midjourney hands work to three different endpoints: imagine takes a prompt
// plus optional references, edit takes a prompt plus references, and blend only
// takes references. A node without an explicit operation keeps the historical
// behaviour, which is imagine.
const MIDJOURNEY_ENDPOINTS = Object.freeze({
  imagine: "/v1/midjourney/generations",
  edit: "/v1/midjourney/generations/edits",
  blend: "/v1/midjourney/generations/blend",
});

function midjourneyOperation(params = {}) {
  const requested = String(params.midjourneyOperation || "").trim().toLowerCase();
  if (requested === "edit" || requested === "blend" || requested === "imagine") return requested;
  // Without an explicit operation the legacy image node keeps posting to the
  // imagine endpoint, where references travel as image_urls.
  return "imagine";
}

function midjourneyRequestBody(operation, prompt, params = {}, images = []) {
  const size = normalizeApimartSize(params.size);
  const extra = Object.fromEntries(
    ["version", "niji", "speed", "style", "stylize", "hd"]
      .filter((key) => params[key] !== undefined)
      .map((key) => [key, params[key]]),
  );
  if (operation === "blend") {
    return {
      size,
      ...(params.speed !== undefined ? { speed: params.speed } : {}),
      image_urls: images,
    };
  }
  return {
    prompt,
    size,
    ...extra,
    ...(images.length ? { image_urls: images } : {}),
  };
}

function assertMidjourneyReferences(operation, images) {
  if (operation === "edit" && !images.length) {
    throw Object.assign(new Error("Midjourney 图片编辑至少需要 1 张参考图。"), { code: "UPSTREAM_PROTOCOL", retryable: false });
  }
  if (operation === "blend" && (images.length < 2 || images.length > 4)) {
    throw Object.assign(new Error("Midjourney 多图融合需要 2 到 4 张参考图。"), { code: "UPSTREAM_PROTOCOL", retryable: false });
  }
}

const APIMART_RATIOS = Object.freeze([
  "1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16",
  "2:1", "1:2", "3:1", "1:3", "21:9", "9:21",
]);
const APIB_RATIOS = Object.freeze(["16:9", "1:1", "21:9", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16"]);

function normalizeApimartSize(value, ratios = APIMART_RATIOS, fallback = "1:1") {
  const size = String(value || "").trim().toLowerCase().replace("*", "x");
  if (size === "auto" || size === "adaptive") return "auto";
  if (ratios.includes(size)) return size;
  const pixels = size.match(/^(\d+)\s*[x:]\s*(\d+)$/);
  if (!pixels || Number(pixels[1]) <= 0 || Number(pixels[2]) <= 0) return fallback;
  const ratio = Number(pixels[1]) / Number(pixels[2]);
  return ratios.reduce((best, candidate) => {
    const [width, height] = candidate.split(":").map(Number);
    const [bestWidth, bestHeight] = best.split(":").map(Number);
    return Math.abs(Math.log(ratio / (width / height))) < Math.abs(Math.log(ratio / (bestWidth / bestHeight))) ? candidate : best;
  }, "1:1");
}

function normalizeApimartResolution(resolution, size) {
  return imageResolution(resolution, size);
}

const APIMART_IMAGE_PARAM_KEYS = Object.freeze([
  "aspect_ratio",
  "image_size",
  "quality",
  "background",
  "output_format",
  "output_compression",
  "moderation",
  "steps",
  "guidance_scale",
  "seed",
  "negative_prompt",
]);

function apimartImageParams(params = {}) {
  const normalized = params && typeof params === "object" && !Array.isArray(params) ? { ...params } : {};
  if (normalized.negativePrompt !== undefined && normalized.negative_prompt === undefined) {
    normalized.negative_prompt = normalized.negativePrompt;
  }
  delete normalized.negativePrompt;
  return Object.fromEntries(Object.entries(normalized).filter(([key, value]) => (
    APIMART_IMAGE_PARAM_KEYS.includes(key) && value !== undefined && value !== null && String(value).trim() !== ""
  )));
}

function errorCodeForStatus(status) {
  return [401, 403].includes(status) ? "UPSTREAM_AUTH"
    : status === 429 ? "UPSTREAM_RATE_LIMIT"
      : status === 408 || status >= 500 ? "UPSTREAM_UNAVAILABLE" : "UPSTREAM_PROTOCOL";
}

function headersFor(provider) {
  const apiKey = providerApiKey(provider);
  return {
    "content-type": "application/json",
    ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
  };
}

async function responseJson(response) {
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; }
  catch {
    if (isQuotaRejection(response.status, text)) {
      throw Object.assign(new Error("上游接口余额或额度不足。"), {
        code: "UPSTREAM_QUOTA_EXHAUSTED", status: response.status, retryable: false, fallbackAllowed: true,
      });
    }
    throw Object.assign(new Error(response.ok ? "Media provider returned invalid JSON." : `上游服务返回 HTTP ${response.status}`), {
      code: response.ok ? "UPSTREAM_PROTOCOL" : errorCodeForStatus(response.status), status: response.status, retryable: [408, 429].includes(response.status) || response.status >= 500,
    });
  }
  if (isQuotaRejection(response.status, data)) {
    throw Object.assign(new Error(String(data?.error?.message || data?.message || data?.msg || "上游接口余额或额度不足。")), {
      code: "UPSTREAM_QUOTA_EXHAUSTED", status: response.status, retryable: false, fallbackAllowed: true,
    });
  }
  const serviceCode = Number(data?.code || data?.statusCode || 0);
  if (!response.ok || (serviceCode && ![0, 200].includes(serviceCode)) || data?.success === false) {
    const message = String(data?.error?.message || data?.error || data?.message || `${response.status} ${response.statusText}`);
    throw Object.assign(new Error(message), {
      code: errorCodeForStatus(response.ok ? serviceCode || 400 : response.status),
      status: response.ok ? serviceCode || 400 : response.status,
      retryable: [408, 429].includes(response.ok ? serviceCode : response.status) || (response.ok ? serviceCode : response.status) >= 500,
    });
  }
  return data;
}

async function postJson(fetch, url, provider, body, options = {}) {
  try {
    return await responseJson(await fetch(url, {
      method: "POST",
      headers: headersFor(provider),
      body: JSON.stringify(body),
      signal: options.signal,
      outbound: {
        mode: provider?.networkMode || provider?.metadata?.networkMode || provider?.metadata?.legacyNetworkMode || "auto",
        requestClass: "billable",
        purpose: "model-execution",
        providerId: String(provider?.id || ""),
      },
    }));
  } catch (error) {
    // Only a proven connection failure is safe to submit again. A lost response
    // may represent a charged request, including on an unpinned provider route.
    if (!error.fallbackAllowed && (!error.status || error.status < 400) && error.submissionState !== "not_submitted") error.submissionState = "unknown";
    if (error.submissionState !== "not_submitted") error.retryable = false;
    throw error;
  }
}

async function getJson(fetch, url, provider, options = {}) {
  return responseJson(await fetch(url, {
    headers: { accept: "application/json", ...headersFor(provider) },
    signal: options.signal,
    outbound: {
      mode: provider?.networkMode || provider?.metadata?.networkMode || provider?.metadata?.legacyNetworkMode || "auto",
      requestClass: "idempotent",
      purpose: options.purpose || "task-result",
      providerId: String(provider?.id || ""),
    },
  }));
}

function collectMediaUrls(value, output = []) {
  if (!value) return output;
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value) || value.startsWith("data:")) output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectMediaUrls(item, output));
    return output;
  }
  if (typeof value !== "object") return output;
  for (const [key, item] of Object.entries(value)) {
    if (["url", "image_url", "imageUrl", "imageURL", "fileUrl", "fileURL", "outputUrl"].includes(key)) {
      collectMediaUrls(item, output);
    } else if (["data", "images", "result", "results", "output", "outputs"].includes(key)) {
      collectMediaUrls(item, output);
    }
  }
  return output;
}

function uniqueMediaData(value) {
  return normalizeImageResultData(value);
}

function taskIdFrom(value) {
  return String(value?.data?.[0]?.task_id || value?.data?.task_id || value?.task_id || value?.data?.id || value?.id || "");
}

function taskState(value) {
  return String(value?.data?.status || value?.status || "").toLowerCase();
}

function isComplete(state) {
  return ["completed", "complete", "succeeded", "success", "finished", "done"].includes(state);
}

function isFailed(state) {
  return ["failed", "fail", "error", "cancelled", "canceled"].includes(state);
}

function abortError(signal) {
  return signal?.reason || Object.assign(new Error("Media request was cancelled."), { name: "AbortError", code: "REQUEST_ABORTED" });
}

function submittedTaskError(error) {
  if (error?.code === "UPSTREAM_TASK_FAILED" || error?.code === "jimeng_cli_task_failed") return error;
  error.code = "UPSTREAM_TASK_PENDING";
  error.retryable = false;
  delete error.fallbackAllowed;
  error.submissionState = "submitted";
  error.message = `任务已提交，暂时无法取得结果；可继续查询，系统不会重复提交。${String(error?.message || "")}`;
  return error;
}

async function waitForTask({ read, wait, signal, maxPolls = 150 }) {
  for (let index = 0; index < maxPolls; index += 1) {
    if (signal?.aborted) throw abortError(signal);
    if (index > 0) await wait(4_000, signal);
    let data;
    try { data = await read(); }
    catch (error) {
      if (signal?.aborted || error?.name === "AbortError" || error?.retryable === false) throw error;
      // GET retries cannot create another paid task. Keep the same task ID.
      continue;
    }
    const state = taskState(data);
    if (isComplete(state) || (!state && uniqueMediaData(data).length)) return data;
    if (isFailed(state)) throw Object.assign(new Error(String(data?.data?.error?.message || data?.data?.error || data?.error?.message || data?.message || "Media task failed.")), { code: "UPSTREAM_TASK_FAILED", retryable: false });
  }
  throw Object.assign(new Error("Media task timed out."), { code: "UPSTREAM_TIMEOUT", retryable: true });
}

async function waitForSubmittedTask(options) {
  try {
    return await waitForTask(options);
  } catch (error) {
    throw submittedTaskError(error);
  }
}

function defaultWait(delayMs, signal) {
  if (signal?.aborted) return Promise.reject(abortError(signal));
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal));
    };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, delayMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function createMediaProtocolAdapters({ wait = defaultWait, maxPolls = 150, executeComfyVideo, jimengCliService } = {}) {
  async function submittedTask(provider, model, protocol, options, submit) {
    const resume = options.resumeTask;
    if (resume) {
      const sameModel = resume.modelId === modelId(model)
        || (Array.isArray(model.metadata?.legacyModelIds) && model.metadata.legacyModelIds.includes(resume.modelId));
      if (resume.protocol !== protocol || resume.providerId !== provider.id || !sameModel
        || resume.baseUrl !== providerBaseUrl(provider) || !resume.taskId) {
        throw Object.assign(new Error("原任务的 API 配置已变更，请恢复原配置后继续查询。"), { retryable: false });
      }
      return { task_id: resume.taskId };
    }
    const result = await submit();
    const taskId = taskIdFrom(result);
    if (taskId) {
      try { await options.onTaskSubmitted?.({ protocol, providerId: provider.id, modelId: modelId(model), baseUrl: providerBaseUrl(provider), taskId }); }
      catch (error) { throw submittedTaskError(error); }
    }
    return result;
  }
  const apimart = {
    async fetchModels({ provider, options, fetch }) {
      const result = await getJson(fetch, joinProtocolUrl(providerBaseUrl(provider), "/v1/models"), provider, { ...options, purpose: "model-discovery" });
      if (!Array.isArray(result?.data)) {
        throw Object.assign(new Error("APIMart 模型目录格式无效。"), { code: "UPSTREAM_PROTOCOL", retryable: false });
      }
      return (Array.isArray(result.data) ? result.data : []).map(item => String(item.id || "")).filter(Boolean);
    },
    async execute({ provider, model, intent, input = {}, params = {}, options = {}, fetch }) {
      if (intent !== "image.generate" && intent !== "image.edit") throw new Error(`APIMart does not support ${intent}.`);
      const baseUrl = providerBaseUrl(provider);
      const images = await serializedImages(input);
      if (intent === "image.edit" && !images.length) throw Object.assign(new Error("Image edit requires at least one prepared reference image."), { code: "UPSTREAM_PROTOCOL", retryable: false });
      const midjourney = isMidjourneyModel(model);
      const apib = providerHasHost(provider, "apib.ai") && !midjourney;
      const midjourneyMode = midjourney ? midjourneyOperation(params) : "";
      const midjourneyImages = midjourney ? images.slice(0, 4) : images;
      // Imagine accepts up to four references, so a longer list is trimmed; blend
      // has a strict window and is validated against the original list.
      if (midjourney) assertMidjourneyReferences(midjourneyMode, images);
      const submitted = await submittedTask(provider, model, "apimart", options, () => postJson(
        fetch,
        joinProtocolUrl(baseUrl, midjourney ? MIDJOURNEY_ENDPOINTS[midjourneyMode] : "/v1/images/generations"),
        provider,
        midjourney ? midjourneyRequestBody(midjourneyMode, String(input.prompt || ""), params, midjourneyImages) : {
          model: upstreamModelId(model),
          prompt: String(input.prompt || ""),
          n: Math.max(1, Math.min(4, Number(params.n || 1))),
          size: apib ? normalizeApimartSize(params.size, APIB_RATIOS, "auto") : normalizeApimartSize(params.size),
          resolution: normalizeApimartResolution(params.resolution || params.imageSize, params.size),
          ...apimartImageParams(params),
          ...(apib ? { official_fallback: false } : {}),
          ...(images.length ? { image_urls: images } : {}),
        },
        options,
      ));
      const taskId = taskIdFrom(submitted);
      const direct = uniqueMediaData(submitted);
      if (direct.length) return { data: direct, ...(taskId ? { task_id: taskId } : {}) };
      if (!taskId) throw Object.assign(new Error("APIMart did not return a task id."), { retryable: false });
      const completed = await waitForSubmittedTask({
        wait,
        maxPolls,
        signal: options.signal,
        read: () => getJson(fetch, joinProtocolUrl(baseUrl, `/v1/tasks/${encodeURIComponent(taskId)}`), provider, options),
      });
      const data = uniqueMediaData(completed);
      if (!data.length) throw Object.assign(new Error("APIMart completed without media output."), { retryable: false });
      return { data, task_id: taskId };
    },
  };

  const imageRelay = {
    async execute({ provider, model, intent, input = {}, params = {}, options = {}, fetch }) {
      if (intent !== "image.generate" && intent !== "image.edit") throw new Error(`Image relay does not support ${intent}.`);
      const baseUrl = providerBaseUrl(provider);
      const images = await serializedImages(input);
      const submitted = await submittedTask(provider, model, "image-relay", options, () => postJson(fetch, joinProtocolUrl(baseUrl, "/v1/api/generate"), provider, {
        model: upstreamModelId(model),
        prompt: String(input.prompt || ""),
        replyType: "json",
        ...(params.size ? { aspectRatio: params.size } : {}),
        ...(params.resolution ? { imageSize: params.resolution } : {}),
        ...(images.length ? { images } : {}),
      }, options));
      const direct = uniqueMediaData(submitted);
      const taskId = taskIdFrom(submitted);
      if (direct.length) return { data: direct, ...(taskId ? { task_id: taskId } : {}) };
      if (!taskId) throw Object.assign(new Error("Image relay did not return output or a task id."), { retryable: false });
      const completed = await waitForSubmittedTask({
        wait,
        maxPolls,
        signal: options.signal,
        read: () => getJson(fetch, `${joinProtocolUrl(baseUrl, "/v1/api/result")}?id=${encodeURIComponent(taskId)}`, provider, options),
      });
      const data = uniqueMediaData(completed);
      if (!data.length) throw Object.assign(new Error("Image relay completed without image output."), { retryable: false });
      return { data, task_id: taskId };
    },
  };

  const comfyui = {
    available: typeof executeComfyVideo === "function",
    async execute(request) {
      if (request.intent !== "video.generate" || typeof executeComfyVideo !== "function") {
        throw new Error(`ComfyUI adapter does not support ${request.intent}.`);
      }
      return executeComfyVideo(request);
    },
  };

  const generic = {
    async execute({ provider, model, intent, input = {}, params = {}, options = {}, fetch }) {
      return postJson(fetch, providerBaseUrl(provider), provider, {
        model: modelId(model),
        intent,
        ...input,
        ...params,
      }, options);
    },
  };

  function cliError(code, safeMessage, extra = {}) {
    return Object.assign(new Error(safeMessage), { code, safeMessage, retryable: false, ...extra });
  }

  function safeCliError(error) {
    return cliError(
      String(error?.code || "jimeng_cli_runtime_error"),
      String(error?.safeMessage || "即梦 CLI 执行失败，请检查本机运行状态后继续。"),
      {
        ...(error?.retryable === true ? { retryable: true } : {}),
        ...(error?.name === "AbortError" ? { name: "AbortError" } : {}),
        ...(["not_submitted", "unknown", "submitted"].includes(error?.submissionState) ? { submissionState: error.submissionState } : {}),
      },
    );
  }

  const jimengCli = {
    available: typeof jimengCliService?.generate === "function",
    async fetchModels() {
      if (typeof jimengCliService?.models !== "function") throw cliError("jimeng_cli_unavailable", "即梦 CLI 尚未就绪，请先配置本机 CLI。");
      try { return await jimengCliService.models(); }
      catch (error) { throw safeCliError(error); }
    },
    async execute({ provider, model, intent, input = {}, params = {}, options = {} }) {
      if (typeof jimengCliService?.generate !== "function") throw cliError("jimeng_cli_unavailable", "即梦 CLI 尚未就绪，请先配置本机 CLI。");
      if (!["image.generate", "image.edit", "video.generate"].includes(intent)) throw cliError("jimeng_cli_unsupported_intent", "即梦 CLI 不支持此能力。");
      const resume = options.resumeTask;
      if (resume && (resume.protocol !== "cli:jimeng" || resume.providerId !== provider.id
        || resume.modelId !== modelId(model) || resume.baseUrl !== "" || typeof resume.taskId !== "string" || !resume.taskId.trim())) {
        throw cliError("UPSTREAM_PROTOCOL", "原任务的即梦配置已变更，请恢复原配置后继续查询。");
      }
      try {
        const references = resume ? [] : await serializedImages(input);
        if (!resume && intent === "image.edit" && !references.length) {
          throw cliError("jimeng_cli_request_invalid", "图片编辑需要至少一张参考图片。");
        }
        const requestFor = (task) => ({
          providerId: String(provider?.id || ""),
          modelId: upstreamModelId(model),
          publicModelId: modelId(model),
          intent,
          prompt: String(input.prompt || ""),
          references: task ? [] : references,
          params,
          signal: options.signal,
          resumeTask: task,
          ...(task || !options.onTaskSubmitted ? {} : {
            onTaskSubmitted: async (submitted) => {
              const taskId = String(submitted?.taskId || submitted?.task_id || "").trim();
              if (!taskId) throw cliError("jimeng_cli_task_invalid", "即梦任务已提交，但没有有效任务编号。", { submissionState: "unknown" });
              try {
                await options.onTaskSubmitted({
                  protocol: "cli:jimeng",
                  providerId: String(provider?.id || ""),
                  modelId: modelId(model),
                  baseUrl: "",
                  taskId,
                });
              } catch {
                throw cliError("UPSTREAM_TASK_PENDING", "即梦任务已提交，但保存任务状态失败；请勿重复提交。", { submissionState: "submitted" });
              }
            },
          }),
        });
        const submitted = await jimengCliService.generate(requestFor(resume));
        const direct = uniqueMediaData(submitted);
        const submittedTaskId = taskIdFrom(submitted);
        const progress = submitted?.progress && typeof submitted.progress === "object" ? submitted.progress : null;
        if (direct.length) return { data: direct, ...(submittedTaskId ? { task_id: submittedTaskId } : {}) };
        if (!submittedTaskId) {
          throw cliError("jimeng_cli_task_invalid", "即梦任务已提交，但没有有效任务编号。", { submissionState: "unknown" });
        }
        // The video endpoint keeps its own polling loop, so a submitted clip reports
        // back right away. Waiting here for minutes would hide the queue position and
        // turn a slow Dreamina queue into what looks like a failed request.
        if (intent === "video.generate") {
          return { data: [], task_id: submittedTaskId, ...(progress ? { progress } : {}) };
        }
        const task = {
          protocol: "cli:jimeng",
          providerId: String(provider?.id || ""),
          modelId: modelId(model),
          baseUrl: "",
          taskId: submittedTaskId,
        };
        const completed = await waitForSubmittedTask({
          wait,
          maxPolls,
          signal: options.signal,
          read: () => jimengCliService.generate(requestFor(task)),
        });
        const data = uniqueMediaData(completed);
        if (!data.length) {
          throw cliError("jimeng_cli_task_invalid", "即梦任务已完成，但没有返回图片结果。", { submissionState: "submitted" });
        }
        return { data, task_id: taskIdFrom(completed) || submittedTaskId };
      } catch (error) {
        throw safeCliError(error);
      }
    },
  };

  return Object.freeze({
    apimart,
    "image-relay": imageRelay,
    comfyui,
    runninghub: generic,
    "video-adapter": generic,
    "audio-adapter": generic,
    "jimeng-cli": jimengCli,
  });
}

module.exports = {
  collectMediaUrls,
  createMediaProtocolAdapters,
};
