"use strict";

const path = require("node:path");

const DEFAULT_PROMPT_TIMEOUT_MS = 60_000;
const DEFAULT_POLL_TIMEOUT_MS = 30_000;
const DEFAULT_UPLOAD_TIMEOUT_MS = 300_000;
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 300_000;
const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_MAX_POLLS = 900;

function createComfyUiClient({
  getDefaultUrl,
  fetchImpl,
  imageReferenceToFile,
  outputDir,
  inspectHistory,
  collectVideoOutputs,
  formatErrorMessage,
  promptTimeoutMs = DEFAULT_PROMPT_TIMEOUT_MS,
  pollTimeoutMs = DEFAULT_POLL_TIMEOUT_MS,
  uploadTimeoutMs = DEFAULT_UPLOAD_TIMEOUT_MS,
  downloadTimeoutMs = DEFAULT_DOWNLOAD_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  maxPolls = DEFAULT_MAX_POLLS,
  crypto = require("node:crypto"),
  fs = require("node:fs"),
  now = Date.now,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  for (const [name, dependency] of Object.entries({
    getDefaultUrl,
    fetchImpl,
    imageReferenceToFile,
    outputDir,
    inspectHistory,
    collectVideoOutputs,
    formatErrorMessage,
  })) {
    if (!dependency) throw new TypeError(`ComfyUI client requires ${name}.`);
  }

  function normalizeUrl(value) {
    const raw = String(value || "").trim();
    if (raw) {
      const withProtocol = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
      return new URL(withProtocol).toString().replace(/\/+$/, "");
    }
    const fallback = typeof getDefaultUrl === "function" ? getDefaultUrl() : getDefaultUrl;
    const normalizedFallback = String(fallback || "").trim();
    if (!normalizedFallback) throw new Error("ComfyUI URL is not configured.");
    const fallbackWithProtocol = /^https?:\/\//i.test(normalizedFallback)
      ? normalizedFallback
      : `http://${normalizedFallback}`;
    return new URL(fallbackWithProtocol).toString().replace(/\/+$/, "");
  }

  async function fetchJsonWithTimeout(url, options = {}, timeoutMs = promptTimeoutMs) {
    const controller = new AbortController();
    const timer = setTimeoutFn(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        ...options,
        signal: options.signal || controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      return { response, data };
    } finally {
      clearTimeoutFn(timer);
    }
  }

  async function fetchBufferWithTimeout(url, options = {}, timeoutMs = downloadTimeoutMs) {
    const controller = new AbortController();
    const timer = setTimeoutFn(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        ...options,
        signal: options.signal || controller.signal,
      });
      const buffer = Buffer.from(await response.arrayBuffer());
      return { response, buffer };
    } finally {
      clearTimeoutFn(timer);
    }
  }

  async function uploadFile(comfyUrl, file) {
    const form = new FormData();
    form.append("image", file.blob, file.filename);
    form.append("overwrite", "true");
    const { response, data } = await fetchJsonWithTimeout(
      `${normalizeUrl(comfyUrl)}/upload/image`,
      { method: "POST", body: form },
      uploadTimeoutMs,
    );
    if (!response.ok) {
      throw new Error(formatErrorMessage(data.error || data.message || `ComfyUI upload failed: ${response.status}`));
    }
    return data;
  }

  async function uploadDataUrl(comfyUrl, dataUrl, filename) {
    const image = await imageReferenceToFile(dataUrl, filename);
    return uploadFile(comfyUrl, image);
  }

  async function fetchObjectInfo(comfyUrl) {
    const { response, data } = await fetchJsonWithTimeout(`${normalizeUrl(comfyUrl)}/object_info`, {}, promptTimeoutMs);
    if (!response.ok) throw new Error(`读取 ComfyUI 节点列表失败：HTTP ${response.status}`);
    if (!data || typeof data !== "object") throw new Error("ComfyUI 节点列表格式不正确。");
    return data;
  }

  async function submitPrompt(comfyUrl, workflow) {
    const { response, data } = await fetchJsonWithTimeout(`${normalizeUrl(comfyUrl)}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow, client_id: crypto.randomUUID() }),
    }, promptTimeoutMs);
    if (!response.ok) {
      throw new Error(formatErrorMessage(data.error || data.message || `ComfyUI prompt failed: ${response.status}`));
    }
    if (!data.prompt_id) throw new Error("ComfyUI did not return prompt_id.");
    return data.prompt_id;
  }

  function queueItemHasPrompt(item, promptId) {
    return JSON.stringify(item).includes(promptId);
  }

  async function getQueueStatus(comfyUrl, promptId) {
    try {
      const { response, data } = await fetchJsonWithTimeout(`${normalizeUrl(comfyUrl)}/queue`, {}, pollTimeoutMs);
      if (!response.ok) return {};
      const running = data.queue_running || [];
      const pending = data.queue_pending || [];
      if (running.some((item) => queueItemHasPrompt(item, promptId))) {
        return { message: "ComfyUI 正在运行高清放大..." };
      }
      const pendingIndex = pending.findIndex((item) => queueItemHasPrompt(item, promptId));
      if (pendingIndex >= 0) return { message: `ComfyUI 正在排队，前面还有 ${pendingIndex} 个任务...` };
    } catch {
      return {};
    }
    return {};
  }

  async function waitForHistory(comfyUrl, promptId, onStatus = () => {}) {
    const baseUrl = normalizeUrl(comfyUrl);
    for (let index = 0; index < maxPolls; index += 1) {
      const { response, data } = await fetchJsonWithTimeout(
        `${baseUrl}/history/${encodeURIComponent(promptId)}`,
        {},
        pollTimeoutMs,
      );
      if (response.ok) {
        const history = data[promptId];
        if (history) {
          const inspection = inspectHistory(history);
          if (inspection.state === "error") throw new Error(inspection.message);
          if (inspection.state === "success") return history;
        }
      }

      const progress = Math.min(92, 35 + Math.round((index / maxPolls) * 55));
      if (index % 3 === 0) {
        const queueStatus = await getQueueStatus(baseUrl, promptId);
        onStatus({
          progress,
          message: queueStatus.message || "ComfyUI 正在处理，TTP 放大可能需要几分钟到十几分钟...",
        });
      } else {
        onStatus({ progress });
      }

      await new Promise((resolve) => setTimeoutFn(resolve, pollIntervalMs));
    }
    throw new Error("ComfyUI upscale timed out after 30 minutes.");
  }

  function extensionFromContentType(contentType = "") {
    const value = String(contentType || "").toLowerCase();
    if (value.includes("jpeg") || value.includes("jpg")) return "jpg";
    if (value.includes("webp")) return "webp";
    if (value.includes("png")) return "png";
    if (value.includes("gif")) return "gif";
    if (value.includes("quicktime")) return "mov";
    if (value.includes("matroska")) return "mkv";
    if (value.includes("webm")) return "webm";
    if (value.includes("audio/mp4")) return "m4a";
    if (value.includes("mp4")) return "mp4";
    if (value.includes("mpeg")) return "mp3";
    if (value.includes("wav")) return "wav";
    if (value.includes("flac")) return "flac";
    if (value.includes("aac")) return "aac";
    if (value.includes("ogg")) return "ogg";
    return "";
  }

  function extensionFromUrl(url) {
    try {
      const ext = path.extname(new URL(String(url || ""), "http://local").pathname).replace(".", "").toLowerCase();
      if (["png", "jpg", "jpeg", "webp", "gif", "mp4", "webm", "mov", "mkv", "wav", "mp3", "m4a", "aac", "flac", "ogg"].includes(ext)) {
        return ext === "jpeg" ? "jpg" : ext;
      }
    } catch {}
    return "";
  }

  function viewUrl(comfyUrl, file) {
    const params = new URLSearchParams({
      filename: file.filename,
      subfolder: file.subfolder || "",
      type: file.type || "output",
    });
    return `${normalizeUrl(comfyUrl)}/view?${params.toString()}`;
  }

  async function saveImage(comfyUrl, image, prefix) {
    const response = await fetchImpl(viewUrl(comfyUrl, image));
    if (!response.ok) return "";
    const contentType = response.headers.get("content-type") || "image/png";
    const extension = extensionFromContentType(contentType) || extensionFromUrl(image.filename) || "png";
    const filename = `${prefix}${crypto.randomBytes(4).toString("hex")}.${extension}`;
    fs.writeFileSync(path.join(outputDir, filename), Buffer.from(await response.arrayBuffer()));
    return `/output/${filename}`;
  }

  async function saveHistoryImages(comfyUrl, history, prefix, preferredOutputIds = [], options = {}) {
    const outputImages = [];
    const fallbackImages = [];
    const outputs = history.outputs || {};
    const preferredImages = [];

    for (const id of preferredOutputIds) {
      for (const image of outputs[id]?.images || []) preferredImages.push(image);
    }
    for (const output of Object.values(outputs)) {
      for (const image of output.images || []) {
        if (image.type === "output") outputImages.push(image);
        else fallbackImages.push(image);
      }
    }

    let candidates;
    if (preferredOutputIds.length && options.strictPreferred) {
      candidates = preferredImages;
      if (!candidates.length && options.filenamePrefix) {
        candidates = [...outputImages, ...fallbackImages]
          .filter((image) => String(image.filename || "").startsWith(options.filenamePrefix));
      }
    } else {
      candidates = preferredImages.length ? preferredImages : outputImages.length ? outputImages : fallbackImages;
    }
    if (options.filenamePrefix && !preferredOutputIds.length) {
      candidates = candidates.filter((image) => String(image.filename || "").startsWith(options.filenamePrefix));
    }
    if (options.lastOnly && candidates.length > 1) candidates = candidates.slice(-1);

    const urls = [];
    for (const image of candidates) {
      const saved = await saveImage(comfyUrl, image, prefix);
      if (saved && !urls.includes(saved)) urls.push(saved);
    }
    return urls;
  }

  async function saveHistoryVideos(comfyUrl, history, prefix, preferredOutputIds = []) {
    const candidates = collectVideoOutputs(history, preferredOutputIds);
    const urls = [];
    for (const video of candidates) {
      const { response, buffer } = await fetchBufferWithTimeout(viewUrl(comfyUrl, video), {}, downloadTimeoutMs);
      if (!response.ok) continue;
      const contentType = response.headers.get("content-type") || "video/mp4";
      const extension = extensionFromContentType(contentType) || extensionFromUrl(video.filename) || "mp4";
      if (extension !== "mp4") continue;
      const filename = `${prefix}${crypto.randomBytes(4).toString("hex")}.${extension}`;
      fs.writeFileSync(path.join(outputDir, filename), buffer);
      const url = `/output/${filename}`;
      if (!urls.includes(url)) urls.push(url);
    }
    return urls;
  }

  return Object.freeze({
    normalizeUrl,
    uploadFile,
    uploadDataUrl,
    fetchObjectInfo,
    submitPrompt,
    waitForHistory,
    saveHistoryImages,
    saveHistoryVideos,
  });
}

module.exports = { createComfyUiClient };
