(function exposeVideoHistoryRules(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.VideoHistoryRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createVideoHistoryRules() {
  "use strict";

  let generatedId = 0;

  function defaultCreateId() {
    generatedId += 1;
    return `video-${Date.now().toString(36)}-${generatedId.toString(36)}`;
  }

  function normalizeVideoItem(value, index, createId) {
    if (!value || typeof value !== "object") return null;
    const src = String(value.src || value.url || value.savedUrl || "").trim();
    if (!src) return null;
    const parsedDuration = Number(value.duration || 0);
    return {
      id: String(value.id || createId()),
      src,
      name: String(value.name || `生成视频 ${index + 1}.mp4`),
      mimeType: String(value.mimeType || "video/mp4"),
      duration: Number.isFinite(parsedDuration) && parsedDuration >= 0 ? parsedDuration : 0,
      promptSummary: String(value.promptSummary || ""),
      createdAt: String(value.createdAt || ""),
    };
  }

  function normalizeVideoHistory(history, legacyVideo = null, createId = defaultCreateId) {
    const source = Array.isArray(history) && history.length ? history : (legacyVideo ? [legacyVideo] : []);
    const normalized = [];
    const usedIds = new Set();
    source.forEach((value, index) => {
      const video = normalizeVideoItem(value, index, createId);
      if (!video) return;
      const duplicateIndex = normalized.findIndex((item) => item.src === video.src);
      if (duplicateIndex >= 0) {
        const [duplicate] = normalized.splice(duplicateIndex, 1);
        usedIds.delete(duplicate.id);
      }
      while (usedIds.has(video.id)) video.id = String(createId());
      usedIds.add(video.id);
      normalized.push(video);
    });
    return normalized;
  }

  function resolveActiveVideo(history, preferredId) {
    const list = Array.isArray(history) ? history : [];
    return list.find((video) => video.id === String(preferredId || "")) || list[list.length - 1] || null;
  }

  function appendVideoHistory(history, entry, activeVideoId = "", createId = defaultCreateId) {
    const current = normalizeVideoHistory(history, null, createId);
    const video = normalizeVideoItem(entry, current.length, createId);
    if (!video) {
      return {
        history: current,
        activeVideoId: resolveActiveVideo(current, activeVideoId)?.id || "",
      };
    }
    const next = current.filter((item) => item.src !== video.src);
    next.push(video);
    return { history: next, activeVideoId: video.id };
  }

  function removeVideoHistory(history, videoId, activeVideoId = "", createId = defaultCreateId) {
    const current = normalizeVideoHistory(history, null, createId);
    const next = current.filter((video) => video.id !== String(videoId || ""));
    const active = resolveActiveVideo(next, activeVideoId);
    return { history: next, activeVideoId: active?.id || "" };
  }

  return {
    normalizeVideoHistory,
    resolveActiveVideo,
    appendVideoHistory,
    removeVideoHistory,
  };
});
