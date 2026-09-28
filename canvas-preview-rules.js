(function initCanvasPreviewRules(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasPreviewRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasPreviewRules() {
  const KIND_META = Object.freeze({
    image: { label: "图片", icon: "图" },
    upload: { label: "上传图片", icon: "图" },
    gallery: { label: "图集", icon: "集" },
    group: { label: "图片组", icon: "组" },
    text: { label: "文字", icon: "文" },
    note: { label: "便签", icon: "签" },
    comfy: { label: "ComfyUI", icon: "流" },
    generator: { label: "生成器", icon: "生" },
    llm: { label: "LLM", icon: "AI" },
    "minimax-h3": { label: "H3 视频", icon: "影" },
    midjourney: { label: "Midjourney", icon: "M" },
    "video-api": { label: "API 视频", icon: "影" },
    video: { label: "视频", icon: "影" },
    "video-output": { label: "视频结果", icon: "影" },
    audio: { label: "音频", icon: "音" },
    loop: { label: "循环", icon: "循" },
    "grid-editor": { label: "网格编辑", icon: "格" },
    "director-3d": { label: "3D 导演台", icon: "3D" },
  });

  function bounded(value, fallback, maximum) {
    const text = String(value ?? "").trim() || String(fallback || "").trim();
    return text.slice(0, maximum);
  }

  function imageItemSource(item) {
    if (!item || typeof item !== "object") return "";
    return bounded(
      item.thumbnailSrc
      || item.thumbnailUrl
      || item.previewUrl
      || item.savedUrl
      || item.src
      || item.url,
      "",
      8192,
    );
  }

  function nodeImageSource(model = {}) {
    const direct = bounded(
      model.thumbnailSrc
      || model.thumbnailUrl
      || model.previewUrl
      || model.poster
      || model.resultThumbnailSrc
      || model.imageSrc
      || model.resultSrc,
      "",
      8192,
    );
    if (direct) return direct;
    if (model.kind === "gallery") {
      const images = Array.isArray(model.galleryImages) ? model.galleryImages : [];
      const active = images.find((item) => String(item?.id || "") === String(model.galleryActiveImageId || "")) || images[0];
      return imageItemSource(active);
    }
    if (model.kind === "group") {
      return imageItemSource(Array.isArray(model.groupImages) ? model.groupImages[0] : null);
    }
    return "";
  }

  function nodeTitle(model, fallback) {
    if (model.kind === "text") return bounded(model.text, fallback, 80);
    if (model.kind === "note") return bounded(model.text, fallback, 80);
    if (model.kind === "group") return bounded(model.groupTitle, fallback, 80);
    if (model.kind === "gallery") return bounded(model.galleryTitle, fallback, 80);
    if (model.kind === "llm") return bounded(model.llmPrompt, fallback, 80);
    if (model.kind === "minimax-h3") return bounded(model.minimaxH3Prompt, fallback, 80);
    if (model.kind === "video-api") return bounded(model.apiVideoPrompt, fallback, 80);
    if (model.kind === "midjourney") {
      return bounded(model.midjourneyPrompt || model.prompt, fallback, 80);
    }
    if (["video", "audio", "video-output"].includes(model.kind)) {
      return bounded(model.mediaName || model.title || model.name, fallback, 80);
    }
    return bounded(
      model.title || model.name || model.imageName || model.prompt || model.label,
      `${fallback}节点`,
      80,
    );
  }

  function nodeStatus(model, fallback) {
    const explicit = model.status
      || model.state
      || model.runtimeStatus
      || model.generationStatus
      || model.executionStatus;
    if (explicit) return bounded(explicit, "", 48);
    if (model.kind === "gallery") {
      return `${Array.isArray(model.galleryImages) ? model.galleryImages.length : 0} 张图片`;
    }
    if (model.kind === "group") {
      return `${Array.isArray(model.groupImages) ? model.groupImages.length : 0} 张参考图`;
    }
    if (model.kind === "text") return "内容可读";
    if (model.kind === "note") return "便签";
    if (nodeImageSource(model)) return "预览可用";
    return `${fallback} · 待处理`;
  }

  function metaForKind(kind) {
    const key = String(kind || "unknown");
    return KIND_META[key] || { label: key === "unknown" ? "旧节点" : key, icon: "节" };
  }

  function describeNode(model = {}) {
    const kind = String(model.kind || "unknown");
    const meta = metaForKind(kind);
    return {
      kind,
      typeLabel: meta.label,
      title: nodeTitle(model, meta.label),
      status: nodeStatus(model, meta.label),
      icon: meta.icon,
      imageSource: nodeImageSource(model),
    };
  }

  function describeAggregate(tile = {}) {
    const typeCounts = tile.typeCounts && typeof tile.typeCounts === "object" ? tile.typeCounts : {};
    const kind = Object.entries(typeCounts)
      .sort((left, right) => Number(right[1]) - Number(left[1]) || String(left[0]).localeCompare(String(right[0])))
      [0]?.[0] || "unknown";
    const meta = metaForKind(kind);
    const count = Math.max(0, Math.trunc(Number(tile.count ?? tile.nodeCount) || 0));
    return {
      kind,
      typeLabel: meta.label,
      title: `${meta.label}区域`,
      status: `${count || 1} 个节点`,
      icon: meta.icon,
      count,
    };
  }

  return {
    KIND_META,
    describeNode,
    describeAggregate,
    nodeImageSource,
  };
});
