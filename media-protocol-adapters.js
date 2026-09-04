"use strict";

const { joinProtocolUrl } = require("./provider-protocol-registry");

function providerBaseUrl(provider) {
  return String(provider?.baseUrl || "").trim()
    .replace(/\/+$/, "")
    .replace(/\/v1\/(?:midjourney\/generations|tasks(?:\/.*)?|api\/(?:generate|result))$/i, "");
}

function providerApiKey(provider) {
  return String(provider?.apiKey || provider?.api_key || "");
}

function modelId(model) {
  return String(model?.id || model?.model || "").trim();
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
  catch { throw Object.assign(new Error("Media provider returned invalid JSON."), { code: "UPSTREAM_PROTOCOL", retryable: false }); }
  const serviceCode = Number(data?.code || data?.statusCode || 0);
  if (!response.ok || (serviceCode && ![0, 200].includes(serviceCode)) || data?.success === false) {
    const message = String(data?.error?.message || data?.error || data?.message || `${response.status} ${response.statusText}`);
    throw Object.assign(new Error(message), {
      status: Number(response.status || serviceCode || 500),
      retryable: response.status === 429 || response.status >= 500,
    });
  }
  return data;
}

async function postJson(fetch, url, provider, body, options = {}) {
  return responseJson(await fetch(url, {
    method: "POST",
    headers: headersFor(provider),
    body: JSON.stringify(body),
    signal: options.signal,
    outbound: {
      requestClass: "billable",
      purpose: "model-execution",
      providerId: String(provider?.id || ""),
    },
  }));
}

async function getJson(fetch, url, provider, options = {}) {
  return responseJson(await fetch(url, {
    headers: { accept: "application/json", ...headersFor(provider) },
    signal: options.signal,
    outbound: {
      requestClass: "idempotent",
      purpose: "task-result",
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
  return [...new Set(collectMediaUrls(value))].map((url) => ({ url }));
}

async function toDataUrl(value) {
  if (typeof value === "string") return value;
  const blob = value instanceof Blob ? value : value?.blob;
  if (!(blob instanceof Blob)) return String(value?.data || value?.url || "");
  const bytes = Buffer.from(await blob.arrayBuffer());
  return `data:${blob.type || "application/octet-stream"};base64,${bytes.toString("base64")}`;
}

async function serializedImages(input = {}) {
  const images = Array.isArray(input.inputImages) ? input.inputImages : [];
  return (await Promise.all(images.map(toDataUrl))).filter(Boolean);
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
  if (error?.name === "AbortError" || error?.code === "REQUEST_ABORTED") return error;
  if (error?.retryable === false) return error;
  error.code = "UPSTREAM_TASK_PENDING";
  error.retryable = false;
  error.message = `${String(error?.message || "Media task status is unavailable.")} The task was already submitted and will not be resubmitted automatically.`;
  return error;
}

async function waitForTask({ read, wait, signal, maxPolls = 150 }) {
  for (let index = 0; index < maxPolls; index += 1) {
    if (signal?.aborted) throw abortError(signal);
    if (index > 0) await wait(4_000, signal);
    const data = await read();
    const state = taskState(data);
    if (isComplete(state) || (!state && uniqueMediaData(data).length)) return data;
    if (isFailed(state)) throw Object.assign(new Error(String(data?.error?.message || data?.message || "Media task failed.")), { retryable: false });
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
    const timer = setTimeout(resolve, delayMs);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(abortError(signal));
    }, { once: true });
  });
}

function createMediaProtocolAdapters({ wait = defaultWait, executeComfyVideo } = {}) {
  const apimart = {
    async execute({ provider, model, intent, input = {}, params = {}, options = {}, fetch }) {
      if (intent !== "image.generate" && intent !== "image.edit") throw new Error(`APIMart does not support ${intent}.`);
      const baseUrl = providerBaseUrl(provider);
      const images = await serializedImages(input);
      const submitted = await postJson(fetch, joinProtocolUrl(baseUrl, "/v1/midjourney/generations"), provider, {
        prompt: String(input.prompt || ""),
        size: String(params.size || "1:1"),
        ...(images.length ? { image_urls: images } : {}),
        ...Object.fromEntries(["version", "niji", "speed", "style", "stylize", "hd"].filter((key) => params[key] !== undefined).map((key) => [key, params[key]])),
      }, options);
      const taskId = taskIdFrom(submitted);
      const direct = uniqueMediaData(submitted);
      if (direct.length) return { data: direct, ...(taskId ? { task_id: taskId } : {}) };
      if (!taskId) throw Object.assign(new Error("APIMart did not return a task id."), { retryable: false });
      const completed = await waitForSubmittedTask({
        wait,
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
      const submitted = await postJson(fetch, joinProtocolUrl(baseUrl, "/v1/api/generate"), provider, {
        model: modelId(model).replace(/-grsai$/i, ""),
        prompt: String(input.prompt || ""),
        replyType: "json",
        ...(params.size ? { aspectRatio: params.size } : {}),
        ...(params.resolution ? { imageSize: params.resolution } : {}),
        ...(images.length ? { images } : {}),
      }, options);
      const direct = uniqueMediaData(submitted);
      const taskId = taskIdFrom(submitted);
      if (direct.length) return { data: direct, ...(taskId ? { task_id: taskId } : {}) };
      if (!taskId) throw Object.assign(new Error("Image relay did not return output or a task id."), { retryable: false });
      const completed = await waitForSubmittedTask({
        wait,
        signal: options.signal,
        read: () => getJson(fetch, `${joinProtocolUrl(baseUrl, "/v1/api/result")}?id=${encodeURIComponent(taskId)}`, provider, options),
      });
      const data = uniqueMediaData(completed);
      if (!data.length) throw Object.assign(new Error("Image relay completed without image output."), { retryable: false });
      return { data, task_id: taskId };
    },
  };

  const comfyui = {
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

  return Object.freeze({
    apimart,
    "image-relay": imageRelay,
    comfyui,
    runninghub: generic,
    "video-adapter": generic,
    "audio-adapter": generic,
  });
}

module.exports = {
  collectMediaUrls,
  createMediaProtocolAdapters,
};
