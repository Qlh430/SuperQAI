(function initCanvasVideoOutputNodeRenderer(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasVideoOutputNodeRenderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasVideoOutputNodeRenderer() {
  "use strict";

  function render(node, options = {}, context = {}) {
    const document = context.document || globalThis.document;
    const {
      createCanvasNodeBar,
      createCanvasPort,
      createCanvasResizeHandle,
      getCanvasVideoHistory,
      getCanvasVideoLegacyItem,
      scheduleCanvasConnectionRender,
      setCanvasVideoHistoryOpen,
      setCanvasVideoHistoryState,
      updateCanvasVideoHistoryDuration,
    } = context;
    const rules = globalThis.VideoHistoryRules;
    if (!document || !createCanvasNodeBar || !createCanvasPort || !createCanvasResizeHandle) {
      throw new Error("Canvas video output node renderer context is incomplete.");
    }
    if (!rules) throw new Error("Video history rules must load before the canvas node renderer.");

    const wasHistoryOpen = node.classList.contains("is-video-history-open");
    const legacy = getCanvasVideoLegacyItem?.(node, options) || null;
    let history;
    if (Array.isArray(options?.videoHistory) || Array.isArray(options?.history)) {
      history = rules.normalizeVideoHistory(options.videoHistory || options.history, legacy, context.createId);
    } else {
      history = getCanvasVideoHistory?.(node) || [];
      if (!history.length && legacy) history = rules.normalizeVideoHistory([], legacy, context.createId);
    }
    const active = setCanvasVideoHistoryState?.(
      node,
      history,
      options?.activeVideoId ?? node.dataset.videoActiveId ?? "",
    ) || null;
    const src = active?.src || "";
    node.innerHTML = "";

    const inputPort = createCanvasPort("input");
    const outputPort = createCanvasPort("output");
    const bar = createCanvasNodeBar("视频输出");
    const stage = document.createElement("div");
    stage.className = "canvas-video-output-stage";
    if (src) {
      const video = document.createElement("video");
      video.src = src;
      video.controls = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.addEventListener("loadedmetadata", () => {
        updateCanvasVideoHistoryDuration?.(node, active.id, video.duration);
      });
      stage.append(video);
    } else {
      stage.innerHTML = '<span class="canvas-video-output-empty"><i data-lucide="clapperboard"></i><strong>视频将在这里播放</strong><small>连接 MiniMax H3 节点后自动更新</small></span>';
    }
    const historyToggle = document.createElement("button");
    historyToggle.type = "button";
    historyToggle.className = "canvas-video-history-toggle";
    historyToggle.title = "查看此节点的视频历史";
    historyToggle.setAttribute("aria-label", "查看此节点的视频历史");
    historyToggle.setAttribute("aria-expanded", "false");
    historyToggle.innerHTML = `<i data-lucide="list-video"></i><b>${history.length}</b>`;
    historyToggle.hidden = !history.length;
    historyToggle.addEventListener("pointerdown", (event) => event.stopPropagation());
    historyToggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setCanvasVideoHistoryOpen?.(node, node.querySelector(".canvas-video-history-panel")?.hidden !== false);
    });
    const historyPanel = document.createElement("section");
    historyPanel.className = "canvas-video-history-panel";
    historyPanel.hidden = true;
    historyPanel.addEventListener("pointerdown", (event) => event.stopPropagation());
    historyPanel.addEventListener("click", (event) => event.stopPropagation());
    historyPanel.addEventListener("wheel", (event) => event.stopPropagation());
    const historyHeader = document.createElement("header");
    const historyTitle = document.createElement("strong");
    historyTitle.className = "canvas-video-history-title";
    const historyClose = document.createElement("button");
    historyClose.type = "button";
    historyClose.className = "canvas-video-history-close";
    historyClose.innerHTML = '<i data-lucide="x"></i>';
    historyClose.setAttribute("aria-label", "关闭视频历史");
    historyClose.addEventListener("click", () => setCanvasVideoHistoryOpen?.(node, false));
    historyHeader.append(historyTitle, historyClose);
    const historyList = document.createElement("div");
    historyList.className = "canvas-video-history-list";
    const historyHint = document.createElement("footer");
    historyHint.className = "canvas-video-history-hint";
    historyHint.textContent = "点击视频可切换当前输出";
    historyPanel.append(historyHeader, historyList, historyHint);

    node.append(inputPort, outputPort, bar, stage, historyToggle, historyPanel, createCanvasResizeHandle());
    if (wasHistoryOpen && history.length) setCanvasVideoHistoryOpen?.(node, true);
    globalThis.lucide?.createIcons?.({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
    scheduleCanvasConnectionRender?.();
  }

  return Object.freeze({ render });
});
