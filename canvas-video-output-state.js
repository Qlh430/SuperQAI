(function exposeCanvasVideoOutputState(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CanvasVideoOutputState = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasVideoOutputState() {
  "use strict";

  function legacyItem(node, options = {}) {
    const src = options.src ?? node?.dataset?.videoSrc ?? "";
    if (!src) return null;
    return {
      src,
      name: options.name ?? node.dataset.mediaName ?? node.dataset.videoName ?? "生成视频",
      mimeType: options.mimeType ?? node.dataset.mediaMimeType ?? node.dataset.videoMimeType ?? "video/mp4",
      duration: options.duration ?? Number(node.dataset.mediaDuration || node.dataset.videoDuration || 0),
      promptSummary: options.promptSummary ?? node.dataset.videoPromptSummary ?? "",
      createdAt: options.createdAt ?? node.dataset.videoCreatedAt ?? "",
    };
  }

  function history(node, { createId, rules } = {}) {
    if (!rules || typeof rules.normalizeVideoHistory !== "function") {
      throw new TypeError("Canvas video output state requires video history rules.");
    }
    if (typeof createId !== "function") {
      throw new TypeError("Canvas video output state requires a createId function.");
    }
    let stored = [];
    try {
      const parsed = JSON.parse(node?.dataset?.videoHistory || "[]");
      if (Array.isArray(parsed)) stored = parsed;
    } catch {
      stored = [];
    }
    const normalized = rules.normalizeVideoHistory(stored, legacyItem(node), createId);
    if (node) node.dataset.videoHistory = JSON.stringify(normalized);
    return normalized;
  }

  function syncLegacyFields(node, active) {
    const video = active || null;
    node.dataset.videoSrc = video?.src || "";
    node.dataset.videoName = video?.name || "生成视频";
    node.dataset.mediaName = video?.name || "生成视频";
    node.dataset.mediaMimeType = video?.mimeType || "video/mp4";
    node.dataset.mediaDuration = String(Number(video?.duration || 0));
    node.dataset.videoMimeType = video?.mimeType || "video/mp4";
    node.dataset.videoDuration = String(Number(video?.duration || 0));
    node.dataset.videoPromptSummary = video?.promptSummary || "";
    node.dataset.videoCreatedAt = video?.createdAt || "";
    node.classList.toggle("has-media", Boolean(video?.src));
  }

  function writeHistoryState(node, values, activeVideoId = "", { createId, rules } = {}) {
    if (!rules || typeof rules.normalizeVideoHistory !== "function" || typeof rules.resolveActiveVideo !== "function") {
      throw new TypeError("Canvas video output state requires video history rules.");
    }
    const normalized = rules.normalizeVideoHistory(values, null, createId);
    const active = rules.resolveActiveVideo(normalized, activeVideoId);
    node.dataset.videoHistory = JSON.stringify(normalized);
    if (active) node.dataset.videoActiveId = active.id;
    else delete node.dataset.videoActiveId;
    syncLegacyFields(node, active);
    return active;
  }

  function activeItem(node, dependencies = {}) {
    if (!node?.dataset) return null;
    if (typeof node.classList?.contains === "function"
      && !node.classList.contains("canvas-node-video-output")) return null;
    const current = history(node, dependencies);
    return writeHistoryState(node, current, node.dataset.videoActiveId || "", dependencies);
  }

  function serialize(node, dependencies = {}) {
    const active = activeItem(node, dependencies);
    if (!node?.dataset) return {};
    return {
      videoHistory: history(node, dependencies),
      videoActiveId: active?.id || "",
      videoSrc: node.dataset.videoSrc || "",
      videoName: node.dataset.videoName || node.dataset.mediaName || "生成视频",
      videoMimeType: node.dataset.videoMimeType || node.dataset.mediaMimeType || "video/mp4",
      videoDuration: Number(node.dataset.videoDuration || node.dataset.mediaDuration || 0),
      mediaName: node.dataset.mediaName || node.dataset.videoName || "生成视频",
      mediaMimeType: node.dataset.mediaMimeType || node.dataset.videoMimeType || "video/mp4",
      mediaDuration: Number(node.dataset.mediaDuration || node.dataset.videoDuration || 0),
      videoPromptSummary: node.dataset.videoPromptSummary || "",
      videoCreatedAt: node.dataset.videoCreatedAt || "",
    };
  }

  function renderOptions(item = {}) {
    return {
      videoHistory: Array.isArray(item.videoHistory) ? item.videoHistory : [],
      activeVideoId: item.videoActiveId || "",
      src: item.videoSrc || item.mediaSrc || "",
      name: item.mediaName || item.videoName || "生成视频",
      mimeType: item.mediaMimeType || item.videoMimeType || "video/mp4",
      duration: item.mediaDuration || item.videoDuration || 0,
      promptSummary: item.videoPromptSummary || "",
      createdAt: item.videoCreatedAt || "",
    };
  }

  function withUpdatedDuration(values, videoId, duration, { createId, rules } = {}) {
    const seconds = Number(duration || 0);
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    return historyFromValues(values, { createId, rules }).map((video) => (
      video.id === videoId ? { ...video, duration: seconds } : video
    ));
  }

  function historyFromValues(values, { createId, rules } = {}) {
    if (!rules || typeof rules.normalizeVideoHistory !== "function") {
      throw new TypeError("Canvas video output state requires video history rules.");
    }
    return rules.normalizeVideoHistory(values, null, createId);
  }

  return Object.freeze({
    activeItem,
    history,
    legacyItem,
    renderOptions,
    serialize,
    syncLegacyFields,
    withUpdatedDuration,
    writeHistoryState,
  });
});
