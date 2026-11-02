(function initCanvasNodePreviewRules(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasNodePreviewRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasNodePreviewRules() {
  const THUMBNAIL_FIELDS = Object.freeze([
    "thumbnailSrc",
    "thumbnailUrl",
    "previewUrl",
    "resultThumbnailSrc",
  ]);
  const SAVED_FIELDS = Object.freeze(["savedUrl", "resultDownloadUrl"]);
  const ORIGINAL_FIELDS = Object.freeze([
    "imageSrc",
    "resultSrc",
    "src",
    "url",
    "poster",
    "posterUrl",
  ]);
  const COLLECTION_FIELDS = Object.freeze([
    "galleryImages",
    "groupImages",
    "llmImages",
    "images",
    "outputs",
  ]);
  const TITLE_FIELDS = Object.freeze([
    "text",
    "imageName",
    "galleryTitle",
    "groupTitle",
    "llmPrompt",
    "minimaxH3Prompt",
    "apiVideoPrompt",
    "prompt",
    "mediaName",
    "title",
    "name",
  ]);
  const KIND_TITLES = Object.freeze({
    image: "图片",
    upload: "图片",
    gallery: "图集",
    group: "图片组",
    text: "文字",
    note: "便签",
    comfy: "ComfyUI",
    llm: "LLM",
    video: "视频",
    "video-output": "视频结果",
    "video-api": "API 视频",
    midjourney: "Midjourney",
    audio: "音频",
    loop: "循环",
  });

  function stringValue(value) {
    if (typeof value !== "string") return "";
    return value.trim().slice(0, 8192);
  }

  function arrayValue(value) {
    if (Array.isArray(value)) return value;
    if (typeof value !== "string") return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function collectFields(target, fields, output) {
    if (!target || typeof target !== "object") return;
    fields.forEach((field) => {
      const source = stringValue(target[field]);
      if (source) output.push(source);
    });
  }

  function extractNodePreviewSources(node) {
    if (!node || typeof node !== "object") return [];
    const items = COLLECTION_FIELDS.flatMap((field) => arrayValue(node[field]))
      .filter((item) => item && typeof item === "object");
    const sources = [];
    collectFields(node, THUMBNAIL_FIELDS, sources);
    items.forEach((item) => collectFields(item, THUMBNAIL_FIELDS, sources));
    collectFields(node, SAVED_FIELDS, sources);
    items.forEach((item) => collectFields(item, SAVED_FIELDS, sources));
    collectFields(node, ORIGINAL_FIELDS, sources);
    items.forEach((item) => collectFields(item, ORIGINAL_FIELDS, sources));
    return [...new Set(sources)];
  }

  function extractNodeSceneTitle(node) {
    if (!node || typeof node !== "object") return "节点";
    for (const field of TITLE_FIELDS) {
      const value = stringValue(node[field]).replace(/\s+/g, " ").trim();
      if (value) return value.slice(0, 120);
    }
    const kind = String(node.kind || "").trim();
    return KIND_TITLES[kind] || kind || "节点";
  }

  return { extractNodePreviewSources, extractNodeSceneTitle };
});
