(function installFloraNodeShell(root) {
  "use strict";

  const META = Object.freeze({
    text: { label: "文字", icon: "type", tone: "accent" },
    note: { label: "便签", icon: "sticky-note", tone: "neutral" },
    upload: { label: "图片", icon: "image-plus", tone: "neutral" },
    video: { label: "视频", icon: "video", tone: "neutral" },
    audio: { label: "音频", icon: "audio-lines", tone: "neutral" },
    generator: { label: "图片生成", icon: "sparkles", tone: "accent" },
    midjourney: { label: "Midjourney", icon: "wand-sparkles", tone: "accent" },
    comfy: { label: "ComfyUI", icon: "workflow", tone: "accent" },
    llm: { label: "文本生成", icon: "text", tone: "accent" },
    "audio-generator": { label: "音频生成", icon: "audio-lines", tone: "accent" },
    "minimax-h3": { label: "视频生成", icon: "clapperboard", tone: "accent" },
    "video-api": { label: "视频生成", icon: "film", tone: "accent" },
    "director-3d": { label: "3D 导演台", icon: "box", tone: "accent" },
    loop: { label: "循环", icon: "repeat-2", tone: "accent" },
    gallery: { label: "图集", icon: "images", tone: "neutral" },
    "asset-video": { label: "视频素材", icon: "video", tone: "neutral" },
    "asset-audio": { label: "音频素材", icon: "audio-lines", tone: "neutral" },
    "asset-collection": { label: "素材", icon: "layers-3", tone: "neutral" },
    "video-output": { label: "视频输出", icon: "play-square", tone: "neutral" },
    "grid-editor": { label: "宫格编辑", icon: "layout-grid", tone: "accent" },
  });

  const stateObservers = new WeakMap();
  let inverseCanvasScale = '1';
  // Each chrome element owns its screen scale; inheriting it makes zoom
  // invalidate every descendant of the canvas on each animation frame.
  if (root.CSS?.registerProperty) {
    try { root.CSS.registerProperty({ name: '--collab-inverse-scale', syntax: '<number>', inherits: false, initialValue: '1' }); } catch (_) {}
  }
  // Only elements that are actually painted need the counter-scale. The toolbar,
  // the image dimensions chip and the adaptive-media outline are hidden until the
  // node is hovered, focused or selected, yet they used to match on every node.
  // Each zoom frame rewrites this custom property, so every extra match costs a
  // style recalculation; scoping them to their visible states keeps the pan/zoom
  // frame cheap without changing what is drawn. Entries are joined with ',' by
  // the rule builder below, so each state is listed separately instead of using
  // a comma-bearing :is()/:where() group.
  const SCALE_TARGETS = [
    '.flora-node-submit',
    '.canvas-port',
    '.flora-node-label-title',
    '.flora-generation-history-badge',
    '.canvas-collab-cursor',
    '#canvasConnections path',
    '#canvasConnectionsOverlay path',
    '.canvas-node.is-selected .flora-node-toolbar',
    '.canvas-node.selected .flora-node-toolbar',
    '.canvas-node.is-connecting .flora-node-toolbar',
    '.canvas-node:hover .flora-node-image-dimensions',
    '.canvas-node:focus-within .flora-node-image-dimensions',
    '.canvas-node.is-selected .flora-node-image-dimensions',
    '.canvas-node.selected .flora-node-image-dimensions',
    '.canvas-node[data-flora-adaptive-media="true"].is-selected .flora-node-shell::after',
    '.canvas-node[data-flora-adaptive-media="true"].selected .flora-node-shell::after',
    '.canvas-node[data-flora-adaptive-media="true"].is-connecting .flora-node-shell::after',
  ].join(', ');
  let scaleRule;
  function syncScale(inverse = inverseCanvasScale) {
    const next = String(inverse);
    if (!scaleRule) {
      const style = document.createElement('style');
      style.dataset.floraScale = 'true';
      document.head.append(style);
      // A shared rule also covers media results, restored nodes and paths
      // created after the most recent zoom, without mutating their DOM.
      style.sheet.insertRule(SCALE_TARGETS.split(',').map(selector => '#canvasPlane ' + selector.trim()).join(',') + ' {}');
      scaleRule = style.sheet.cssRules[0];
    }
    if (scaleRule.style.getPropertyValue('--collab-inverse-scale') !== next) scaleRule.style.setProperty('--collab-inverse-scale', next);
    inverseCanvasScale = next;
  }
  const imagePreviewStates = new WeakMap();
  const imageInformationStates = new WeakMap();
  const FLORA_NODE_WIDTH = 400;
  const FLORA_NODE_HEIGHT = 400;
  // 图集收缩后，单元格与底部状态行之间保留的距离（比单元格间距略宽一点，状态行不至于贴住图片）。
  const FLORA_GALLERY_STATUS_GAP = 16;
  const FLORA_AUDIO_HEIGHT = 128;
  const RUN_SELECTOR = ".canvas-node-run, .canvas-h3-run, .canvas-comfy-run, .canvas-api-video-run, .canvas-llm-run";
  const GENERATIVE_KINDS = new Set(["generator", "midjourney", "comfy", "video-api", "minimax-h3", "llm"]);
  const ASSET_KINDS = new Set(["upload", "video", "audio", "asset-video", "asset-audio", "asset-collection"]);

  function getKind(node) {
    if (node?.classList.contains("canvas-node-audio-generator")) return "audio-generator";
    // 单图素材节点必须先判：节点目录会把 .canvas-node-asset-collection 命中成合集，
    // 那样抠图 / 裁剪 / 放大这些图片工具就不显示了。
    if (node?.classList.contains("canvas-node-asset-single-image")) return "upload";
    const registered = root.AiOsCanvasNodeRegistry?.resolveKind?.(node);
    if (registered) return registered;
    const classes = node?.classList;
    if (!classes) return "";
    if (classes.contains("canvas-node-note")) return "note";
    if (classes.contains("canvas-node-grid-editor")) return "grid-editor";
    if (classes.contains("canvas-node-director3d")) return "director-3d";
    if (classes.contains("canvas-node-minimax-h3")) return "minimax-h3";
    if (classes.contains("canvas-node-video-api")) return "video-api";
    if (classes.contains("canvas-node-gallery-container")) return "gallery";
    if (classes.contains("canvas-node-asset-single-audio")) return "asset-audio";
    if (classes.contains("canvas-node-asset-single-video")) return "asset-video";
    if (classes.contains("canvas-node-asset-single-image")) return "upload";
    if (classes.contains("canvas-node-asset-collection")) return "asset-collection";
    if (classes.contains("canvas-node-midjourney")) return "midjourney";
    if (classes.contains("canvas-node-video-output")) return "video-output";
    if (classes.contains("canvas-node-comfy")) return "comfy";
    if (classes.contains("canvas-node-llm")) return "llm";
    if (classes.contains("canvas-node-loop")) return "loop";
    if (classes.contains("canvas-node-video")) return "video";
    if (classes.contains("canvas-node-audio")) return "audio";
    if (classes.contains("canvas-node-text")) return "text";
    if (classes.contains("canvas-node-image")) return classes.contains("canvas-node-generator") ? "generator" : "upload";
    return "";
  }

  function resolveMeta(node) {
    // Presentation family is separate from native execution/serialization.
    const nativeKind = getKind(node);
    const kind = nativeKind === "comfy" ? "generator" : nativeKind;
    return { kind, meta: META[kind] || { label: "节点", icon: "box", tone: "neutral" } };
  }

  function isAdaptiveMediaNode(node, kind = getKind(node)) {
    if (!node || node.classList.contains("canvas-node-generator")) return false;
    if (node.classList.contains("canvas-node-asset-single-audio") || node.classList.contains("canvas-node-media-audio")) return false;
    if (node.classList.contains("canvas-node-asset-single-image") || node.classList.contains("canvas-node-asset-single-video")) return true;
    if (kind === "upload") return Boolean(node.dataset.uploadOnly === "true" || node.dataset.imageSrc || node.classList.contains("canvas-node-asset-single-image"));
    if (kind === "video" || kind === "asset-video") return Boolean(node.dataset.videoSrc || node.querySelector(".canvas-media-shell-video.has-media video"));
    return false;
  }

  function syncMediaDimensions(node, kind = getKind(node)) {
    const adaptive = isAdaptiveMediaNode(node, kind);
    if (!adaptive) {
      delete node.dataset.floraAdaptiveMedia;
      return;
    }
    node.dataset.floraAdaptiveMedia = "true";
    const media = node.querySelector(".flora-node-result-area img, .flora-node-result-area video, .canvas-image-upload img, .canvas-media-shell-video video");
    if (!media) return;
    const measure = () => {
      const width = Number(media.naturalWidth || media.videoWidth || 0);
      const height = Number(media.naturalHeight || media.videoHeight || 0);
      if (width <= 0 || height <= 0) return;
      root.dispatchEvent(new CustomEvent("flora-media-dimensions", { detail: { node, width, height } }));
    };
    if (media.dataset.floraDimensionsBound !== "true") {
      media.dataset.floraDimensionsBound = "true";
      media.addEventListener("load", measure);
      media.addEventListener("loadedmetadata", measure);
    }
    if (node.isConnected) measure();
    else queueMicrotask(() => { if (node.isConnected) measure(); });
  }

  function syncImagePreviewDimensions(node, preferSelection = false) {
    if (node?.dataset.floraKind !== "generator") return;
    const size = node.querySelector(".canvas-node-size");
    const raw = size?.value === "custom" ? node.dataset.canvasSize : size?.value || node.dataset.canvasSize || "";
    const selected = String(raw).match(/^(\d+(?:\.\d+)?)\s*[:x]\s*(\d+(?:\.\d+)?)$/i);
    const image = node.querySelector('.flora-node-result-area .canvas-node-result:not([hidden]) img');
    const source = image?.getAttribute("src") || "";
    const ready = image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
    const signature = `${raw}|${source}|${ready ? `${image.naturalWidth}x${image.naturalHeight}` : "pending"}`;
    const state = imagePreviewStates.get(node) || {};
    if (image && state.image !== image) {
      state.image?.removeEventListener("load", state.loaded);
      state.image = image;
      state.loaded = () => syncImagePreviewDimensions(node);
      image.addEventListener("load", state.loaded);
    }
    imagePreviewStates.set(node, state);
    const same = state.signature === signature;
    if (!preferSelection && same && node.style.getPropertyValue("--flora-node-height") === `${FLORA_NODE_WIDTH / state.ratio}px`) return;
    const selectionChanged = state.raw !== raw;
    const newResult = source !== state.source || state.intrinsic !== (ready ? `${image.naturalWidth}x${image.naturalHeight}` : "pending");
    state.signature = signature;
    state.raw = raw;
    state.source = source;
    state.intrinsic = ready ? `${image.naturalWidth}x${image.naturalHeight}` : "pending";
    // Explicit choices shape the next generation immediately. A new result or
    // decoded history image calibrates the surface to the actual pixels.
    const ratio = same && !preferSelection ? state.ratio : selected && (preferSelection || selectionChanged && !newResult || !ready)
      ? Number(selected[1]) / Number(selected[2])
      : ready ? image.naturalWidth / image.naturalHeight
        : selected ? Number(selected[1]) / Number(selected[2]) : null;
    if (!(ratio > 0 && Number.isFinite(ratio))) return;
    state.ratio = ratio;
    const width = FLORA_NODE_WIDTH, height = width / ratio;
    node.dataset.floraImagePreview = "true";
    const changed = Number(node.dataset.width) !== width || Math.abs(Number(node.dataset.height) - height) > .001
      || node.style.getPropertyValue("--flora-node-height") !== `${height}px`;
    if (!changed) return;
    node.dataset.width = String(width);
    node.dataset.height = String(height);
    node.dataset.renderedWidth = String(width);
    node.dataset.renderedHeight = String(height + 48);
    node.dataset.floraSize = `${width}x${height}`;
    node.dataset.floraBodySize = node.dataset.floraSize;
    node.style.setProperty("--flora-node-width", `${width}px`);
    node.style.setProperty("--flora-node-height", `${height}px`);
    root.dispatchEvent(new CustomEvent("flora-image-preview-resized", { detail: { node } }));
  }

  function formatMediaTime(value) {
    const total = Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const pair = (part) => String(part).padStart(2, "0");
    return hours > 0
      ? `${pair(hours)}:${pair(minutes)}:${pair(seconds)}`
      : `${pair(minutes)}:${pair(seconds)}`;
  }

  function mediaWaveformBars(node) {
    const source = String(
      node.dataset.mediaName
      || node.dataset.imageName
      || readAssetState(node).members[0]?.name
      || "audio",
    );
    let seed = 2166136261;
    for (const character of source) {
      seed ^= character.codePointAt(0);
      seed = Math.imul(seed, 16777619);
    }
    return Array.from({ length: 48 }, (_, index) => {
      const mixed = Math.imul(seed ^ (index + 1), 2654435761) >>> 0;
      return 18 + (mixed % 78);
    });
  }

  // The legacy renderer owns the real <video>/<audio> element. These adapters
  // keep that element as the source of truth and only add the presentation
  // layer required by the canvas design.
  function enhanceVideoPlayer(node) {
    const media = node.querySelector(".canvas-video-preview");
    const shell = media?.closest(".canvas-media-shell");
    if (!media || !shell) return;
    // History clearing can leave the reusable media element in the result area.
    // Its presence alone does not mean there is a playable result.
    const hasSource = Boolean(String(media.getAttribute("src") || "").trim()
      || [...media.querySelectorAll("source[src]")].some(source => source.getAttribute("src")?.trim()));
    shell.hidden = !hasSource;
    shell.classList.toggle("has-media", hasSource);
    if (!hasSource) return;
    shell.querySelector(":scope > .flora-video-overlay")?.remove();
    let center = shell.querySelector(":scope > .flora-video-center");
    if (!center) {
      center = document.createElement("button");
      center.type = "button";
      center.className = "flora-video-center";
      center.setAttribute("aria-label", "播放视频");
      shell.append(center);
    }
    let controls = shell.querySelector(":scope > .flora-video-controls");
    if (!controls) {
      controls = document.createElement("div");
      controls.className = "flora-video-controls";
      controls.dataset.floraMediaPlayer = "video";
      const play = document.createElement("button");
      play.type = "button";
      play.className = "flora-video-play";
      play.setAttribute("aria-label", "播放视频");
      const time = document.createElement("time");
      time.className = "flora-video-time";
      time.textContent = "00:00 / 00:00";
      const progress = document.createElement("input");
      progress.type = "range";
      progress.className = "flora-video-progress";
      progress.min = "0";
      progress.max = "1000";
      progress.step = "1";
      progress.value = "0";
      progress.setAttribute("aria-label", "视频进度");
      const expand = document.createElement("button");
      expand.type = "button";
      expand.className = "flora-video-expand";
      expand.setAttribute("aria-label", "放大视频");
      controls.append(play, time, progress, expand);
      shell.append(controls);
    }
    media.controls = false;
    media.setAttribute("aria-label", "视频预览");
    center = shell.querySelector(":scope > .flora-video-center");
    const play = controls.querySelector(".flora-video-play");
    const time = controls.querySelector(".flora-video-time");
    const progress = controls.querySelector(".flora-video-progress");
    const expand = controls.querySelector(".flora-video-expand");
    const duration = () => Number.isFinite(Number(media.duration))
      ? Number(media.duration)
      : Number(node.dataset.mediaDuration || 0);
    const sync = () => {
      const total = duration();
      const current = Number.isFinite(Number(media.currentTime)) ? Number(media.currentTime) : 0;
      const ratio = total > 0 ? Math.max(0, Math.min(1, current / total)) : 0;
      const playing = !media.paused && !media.ended;
      progress.value = String(Math.round(ratio * 1000));
      progress.style.setProperty("--flora-video-progress", `${ratio * 100}%`);
      progress.setAttribute("aria-valuetext", `${formatMediaTime(current)} / ${formatMediaTime(total)}`);
      time.textContent = `${formatMediaTime(current)} / ${formatMediaTime(total)}`;
      play.dataset.playing = String(playing);
      play.setAttribute("aria-label", playing ? "暂停视频" : "播放视频");
      play.innerHTML = `<i data-lucide="${playing ? "pause" : "play"}"></i>`;
      center.dataset.playing = String(playing);
      center.setAttribute("aria-label", playing ? "暂停视频" : "播放视频");
      center.innerHTML = `<i data-lucide="${playing ? "pause" : "play"}"></i>`;
      const fullscreen = root.document?.fullscreenElement === shell;
      expand.setAttribute("aria-label", fullscreen ? "退出视频全屏" : "放大视频");
      expand.innerHTML = `<i data-lucide="${fullscreen ? "minimize-2" : "maximize-2"}"></i>`;
      root.lucide?.createIcons?.({ attrs: { "aria-hidden": "true", "stroke-width": 2 } });
    };
    const toggle = (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      if (media.paused || media.ended) {
        media.play?.().catch(() => {});
      } else {
        media.pause?.();
      }
    };
    const seek = (event) => {
      const total = duration();
      if (!(total > 0)) return;
      event.stopPropagation();
      media.currentTime = (Number(event.currentTarget.value) / 1000) * total;
      sync();
    };
    const toggleFullscreen = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (root.document?.fullscreenElement) {
        const exit = root.document.exitFullscreen || root.document.webkitExitFullscreen;
        Promise.resolve(exit?.call(root.document)).then(sync).catch(() => {});
        return;
      }
      const request = shell.requestFullscreen || shell.webkitRequestFullscreen || media.webkitEnterFullscreen;
      const requestTarget = request === media.webkitEnterFullscreen ? media : shell;
      try {
        Promise.resolve(request?.call(requestTarget)).then(sync).catch(() => {});
      } catch {
        // Fullscreen can be unavailable in some embedded shells.
      }
    };
    if (controls.dataset.floraVideoBound !== "true") {
      controls.dataset.floraVideoBound = "true";
      play.addEventListener("click", toggle);
      // The visible picture lets a paused node drag through the canvas engine.
      // During playback only a short click pauses; a drag must not toggle it.
      let picturePress = null;
      shell.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || event.isPrimary === false
          || event.target.closest(".flora-video-controls, button, input")) return;
        picturePress = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          playing: !media.paused && !media.ended,
          moved: false,
        };
        if (picturePress.playing) {
          event.stopPropagation();
          shell.setPointerCapture?.(event.pointerId);
        }
      });
      shell.addEventListener("pointermove", (event) => {
        if (picturePress?.pointerId !== event.pointerId) return;
        if (Math.hypot(event.clientX - picturePress.x, event.clientY - picturePress.y) >= 8) {
          picturePress.moved = true;
        }
      });
      shell.addEventListener("pointerup", (event) => {
        if (shell.hasPointerCapture?.(event.pointerId)) shell.releasePointerCapture(event.pointerId);
      });
      shell.addEventListener("pointercancel", () => { picturePress = null; });
      shell.addEventListener("click", (event) => {
        const press = picturePress;
        picturePress = null;
        if (!press?.playing || press.moved || media.paused || media.ended
          || event.target.closest(".flora-video-controls, button, input")
          || Math.hypot(event.clientX - press.x, event.clientY - press.y) >= 8) return;
        event.preventDefault();
        event.stopPropagation();
        media.pause?.();
      });
      progress.addEventListener("input", seek);
      expand.addEventListener("click", toggleFullscreen);
      controls.addEventListener("pointerdown", (event) => event.stopPropagation());
      ["play", "pause", "ended", "timeupdate", "durationchange", "loadedmetadata", "seeked"]
        .forEach((type) => media.addEventListener(type, sync));
      root.document?.addEventListener("fullscreenchange", sync);
    }
    if (center.dataset.floraVideoBound !== "true") {
      center.dataset.floraVideoBound = "true";
      center.addEventListener("click", toggle);
      center.addEventListener("pointerdown", (event) => event.stopPropagation());
    }
    sync();
  }

  function enhanceAudioPlayer(node) {
    const media = node.querySelector(".canvas-audio-preview");
    const shell = media?.closest(".canvas-media-shell");
    if (!media || !shell) return;
    media.controls = false;
    media.classList.add("flora-native-audio");
    media.setAttribute("aria-hidden", "true");
    media.tabIndex = -1;
    let player = shell.querySelector(":scope > .flora-audio-player");
    if (!player) {
      player = document.createElement("div");
      player.className = "flora-audio-player";
      player.dataset.floraMediaPlayer = "audio";
      const play = document.createElement("button");
      play.type = "button";
      play.className = "flora-audio-play";
      play.setAttribute("aria-label", "播放音频");
      const timeline = document.createElement("div");
      timeline.className = "flora-audio-timeline";
      timeline.tabIndex = 0;
      timeline.setAttribute("role", "slider");
      timeline.setAttribute("aria-label", "音频进度");
      timeline.setAttribute("aria-valuemin", "0");
      timeline.setAttribute("aria-valuemax", "0");
      timeline.setAttribute("aria-valuenow", "0");
      const waveform = document.createElement("div");
      waveform.className = "flora-audio-waveform";
      waveform.setAttribute("aria-hidden", "true");
      mediaWaveformBars(node).forEach((height) => {
        const bar = document.createElement("span");
        bar.style.setProperty("--flora-wave-height", `${height}%`);
        waveform.append(bar);
      });
      const progress = document.createElement("div");
      progress.className = "flora-audio-progress";
      timeline.append(waveform, progress);
      const time = document.createElement("time");
      time.className = "flora-audio-time";
      time.textContent = "00:00 / 00:00";
      player.append(play, timeline, time);
      shell.append(player);
      const seek = (event) => {
        const duration = Number(media.duration);
        if (!Number.isFinite(duration) || duration <= 0) return;
        const rect = timeline.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
        media.currentTime = ratio * duration;
        sync();
      };
      const toggle = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (media.paused || media.ended) media.play?.().catch(() => {});
        else media.pause?.();
      };
      const sync = () => {
        const duration = Number.isFinite(media.duration)
          ? media.duration
          : Number(node.dataset.mediaDuration || 0);
        const current = Number.isFinite(media.currentTime) ? media.currentTime : 0;
        const ratio = duration > 0 ? Math.max(0, Math.min(1, current / duration)) : 0;
        timeline.style.setProperty("--flora-audio-progress", `${ratio * 100}%`);
        waveform.querySelectorAll("span").forEach((bar, index) => {
          bar.dataset.played = String(index < Math.floor(ratio * 48));
        });
        timeline.setAttribute("aria-valuemax", String(Math.max(0, Math.round(duration))));
        timeline.setAttribute("aria-valuenow", String(Math.max(0, Math.round(current))));
        timeline.setAttribute("aria-valuetext", `${formatMediaTime(current)} / ${formatMediaTime(duration)}`);
        time.textContent = `${formatMediaTime(current)} / ${formatMediaTime(duration)}`;
        const playing = !media.paused && !media.ended;
        play.dataset.playing = String(playing);
        play.setAttribute("aria-label", playing ? "暂停音频" : "播放音频");
        play.innerHTML = `<i data-lucide="${playing ? "pause" : "play"}"></i>`;
        root.lucide?.createIcons?.({ attrs: { "aria-hidden": "true", "stroke-width": 2 } });
      };
      play.addEventListener("click", toggle);
      play.addEventListener("pointerdown", (event) => event.stopPropagation());
      let seekingPointer = null;
      timeline.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || event.isPrimary === false) return;
        event.preventDefault();
        event.stopPropagation();
        seekingPointer = event.pointerId;
        timeline.focus({ preventScroll: true });
        // Pointer capture retains the gesture when it leaves the waveform.
        // Synthetic test events and some embedded shells cannot capture.
        try { timeline.setPointerCapture(event.pointerId); } catch {}
        seek(event);
      });
      timeline.addEventListener("pointermove", (event) => {
        if (seekingPointer !== event.pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        seek(event);
      });
      const endSeek = (event) => {
        if (seekingPointer !== event.pointerId) return;
        event.stopPropagation();
        if (event.type === "pointerup") seek(event);
        seekingPointer = null;
        if (timeline.hasPointerCapture(event.pointerId)) timeline.releasePointerCapture(event.pointerId);
      };
      ["pointerup", "pointercancel", "lostpointercapture"].forEach((type) => timeline.addEventListener(type, endSeek));
      timeline.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      timeline.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const duration = Number(media.duration) || 0;
        if (duration <= 0) return;
        const next = event.key === "Home" ? 0 : event.key === "End" ? duration
          : Number(media.currentTime || 0) + (event.key === "ArrowRight" ? 5 : -5);
        media.currentTime = Math.max(0, Math.min(duration, next));
        sync();
      });
      ["timeupdate", "durationchange", "loadedmetadata", "play", "pause", "ended", "seeked"]
        .forEach((type) => media.addEventListener(type, sync));
      player.floraMediaSync = sync;
      sync();
    } else {
      player.floraMediaSync?.();
    }
  }

  function enhanceMediaNode(node, kind = getKind(node)) {
    if (["asset-video", "video-api", "minimax-h3"].includes(kind)) enhanceVideoPlayer(node);
    if (["asset-audio", "audio-generator"].includes(kind)) enhanceAudioPlayer(node);
  }

  function refreshIcon(icon) {
    if (!icon || icon.querySelector("svg")) return;
    const glyph = icon.querySelector("[data-lucide]");
    if (!glyph) return;
    const lucide = root.lucide;
    if (lucide?.createIcons) lucide.createIcons({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
  }

  // The legacy renderer still owns the controls and data bindings.  The Flora
  // layer re-parents those same real elements into layout regions instead of
  // cloning them, so selectors, focus handling and serialization keep working
  // while the node gets a genuinely new composition.
  function markRegion(node, selectors, region) {
    node.querySelectorAll(selectors).forEach((element) => {
      element.dataset.floraRegion = region;
      element.classList.add(`flora-node-${region}`);
      // Some legacy prompt fields are not wrapped by a visible <label>.
      // Give those real controls a stable accessible name instead of relying
      // on placeholder text, which disappears as soon as the user types.
      if (region === "input" && !element.getAttribute("aria-label") && !element.closest("label")) {
        element.setAttribute("aria-label", "节点输入");
      }
    });
  }

  function decorateContent(node, kind) {
    markRegion(node, ".canvas-text, .canvas-note-editor, .canvas-note-body, .canvas-note-content", "editor");
    markRegion(node, ".canvas-node-prompt, .canvas-llm-prompt, .canvas-h3-prompt, .canvas-api-video-prompt-input, .canvas-midjourney-prompt-input", "input");
    markRegion(node, ".canvas-node-controls, .canvas-llm-controls, .canvas-h3-controls, .canvas-comfy-controls, .canvas-midjourney-controls, .canvas-api-video-controls, .canvas-midjourney-options", "parameters");
    markRegion(node, ".canvas-node-result, .canvas-image-upload, .canvas-media-shell, .canvas-assets-body, .canvas-grid-editor-shell, .canvas-h3-reference-grid, .canvas-midjourney-reference", "result");
    markRegion(node, ".canvas-node-footer, .canvas-h3-footer, .canvas-gallery-container-footer", "status");
    node.dataset.floraContentKind = kind;
  }

  function getLegacyContent(node, shell) {
    let content = shell.querySelector(":scope > .flora-node-content");
    if (!content) {
      content = document.createElement("div");
      content.className = "flora-node-content";
      content.dataset.floraRegion = "content";
      content.setAttribute("aria-label", "节点内容");
      shell.append(content);
    }
    return content;
  }

  function isLegacyChrome(element) {
    return element.matches(
      ".flora-node-shell, .flora-node-label, .flora-node-tag, .canvas-node-bar, .canvas-node-footer, .canvas-h3-footer, .canvas-gallery-container-footer, .canvas-node-actions, .canvas-port, .canvas-resize-handle",
    );
  }

  function adoptLegacyContent(node, shell) {
    const content = getLegacyContent(node, shell);
    Array.from(node.children).forEach((child) => {
      if (!isLegacyChrome(child)) content.append(child);
    });
    return content;
  }

  function createLayoutWrapper(content, className, region, label) {
    let wrapper = content.querySelector(`:scope > .${className}`);
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.className = className;
      wrapper.dataset.floraLayoutWrapper = "true";
      wrapper.dataset.floraRegion = region;
      if (label) wrapper.setAttribute("aria-label", label);
      content.append(wrapper);
    }
    return wrapper;
  }

  function moveDirectMatches(content, wrapper, selectors) {
    Array.from(content.children).forEach((child) => {
      if (child === wrapper || child.dataset.floraLayoutWrapper === "true") return;
      if (child.matches(selectors)) wrapper.append(child);
    });
  }

  function composeTextContent(content, kind) {
    const editor = createLayoutWrapper(content, "flora-node-editor-surface", "editor-surface", "文字编辑区");
    if (kind === "note") {
      moveDirectMatches(content, editor, ".canvas-note-body");
    } else {
      moveDirectMatches(content, editor, ".canvas-text, .canvas-text-editor, .canvas-note-editor");
    }
    content.dataset.floraComposed = "true";
  }

  function composeMediaContent(content, kind) {
    const shell = content.closest(".flora-node-shell");
    const input = createLayoutWrapper(content, "flora-node-input-area", "input-area", "节点输入");
    const result = createLayoutWrapper(content, "flora-node-result-area", "result-area", "节点结果");
    const parameters = createLayoutWrapper(shell, "flora-node-parameter-tray", "parameter-tray", "节点参数");
    if (!parameters.querySelector(".flora-node-panel-heading")) {
      const heading = document.createElement("div");
      heading.className = "flora-node-panel-heading";
      const title = document.createElement("strong");
      title.textContent = ["generator", "midjourney", "comfy", "video", "video-api", "minimax-h3", "llm"].includes(kind)
        ? "生成选项"
        : "节点参数";
      const close = createAction("关闭", "close-parameters", "关闭节点参数", "x");
      heading.append(title, close);
      parameters.prepend(heading);
      close.addEventListener("click", () => setParameterOpen(shell.closest(".canvas-node"), false));
    }

    const inputSelectors = [
      ".canvas-node-prompt",
      ".canvas-llm-prompt",
      ".canvas-h3-prompt",
      ".canvas-h3-intro",
      ".canvas-h3-prompt-field",
      ".canvas-midjourney-prompt",
      ".canvas-api-video-prompt",
      ".canvas-api-video-reference",
      ".canvas-api-video-prompt-input",
      ".canvas-midjourney-prompt-input",
      ".canvas-assets-actions",
    ].join(", ");
    const resultSelectors = [
      ".canvas-image-upload",
      ".canvas-node-result",
      ".canvas-media-shell",
      ".canvas-assets-body",
      ".canvas-grid-editor-shell",
      ".canvas-h3-reference-grid",
      ".canvas-midjourney-reference",
    ].join(", ");
    const parameterSelectors = [
      ".canvas-node-controls",
      ".canvas-llm-controls",
      ".canvas-h3-controls",
      ".canvas-comfy-controls",
      ".canvas-midjourney-controls",
      ".canvas-api-video-controls",
      ".canvas-midjourney-options",
      ".canvas-midjourney-operation-field",
      ".canvas-engine-switch",
    ].join(", ");

    const inputWithRefs = ["upload", "asset-video", "asset-audio", "asset-collection"].includes(kind)
      ? inputSelectors
      : `${inputSelectors}, .canvas-node-refs`;
    moveDirectMatches(content, input, inputWithRefs);
    moveDirectMatches(content, result, resultSelectors);
    moveDirectMatches(content, parameters, parameterSelectors);
    if (kind === "upload" || kind === "asset-video" || kind === "asset-audio" || kind === "asset-collection") {
      moveDirectMatches(content, result, ".canvas-node-refs");
    }
    content.dataset.floraComposed = "true";
  }

  function composeUtilityContent(content) {
    const surface = createLayoutWrapper(content, "flora-node-body-surface", "body-surface", "节点内容区");
    Array.from(content.children).forEach((child) => {
      if (child === surface || child.dataset.floraLayoutWrapper === "true") return;
      surface.append(child);
    });
    content.dataset.floraComposed = "true";
  }

  function composeContent(content, kind) {
    if (!content) return;
    if (kind === "text" || kind === "note") {
      composeTextContent(content, kind);
      return;
    }
    if (["generator", "midjourney", "comfy", "video", "video-api", "minimax-h3", "llm", "upload", "asset-video", "asset-audio", "asset-collection", "audio", "audio-generator"].includes(kind)) {
      composeMediaContent(content, kind);
      return;
    }
    composeUtilityContent(content);
  }

  function getLegacyTitle(node) {
    return node.querySelector(":scope > .canvas-node-bar .canvas-node-title:not(input)")
      || node.querySelector(":scope > .canvas-node-bar .canvas-node-title-input");
  }

  function getAssetDisplayName(node) {
    if (node.classList.contains("canvas-node-asset-single-image")) {
      return String(node.dataset.imageName || "").trim();
    }
    if (node.classList.contains("canvas-node-asset-single-video")
      || node.classList.contains("canvas-node-asset-single-audio")) {
      return String(node.dataset.mediaName || "").trim();
    }
    return "";
  }

  function syncShellLabel(node, fallback = "节点") {
    const title = node?.querySelector(":scope > .flora-node-label .flora-node-label-title");
    if (!title) return;
    const legacyTitle = getLegacyTitle(node);
    const next = node.dataset.nodeTitle || getAssetDisplayName(node)
      || legacyTitle?.value
      || legacyTitle?.textContent
      || fallback;
    if (title.textContent !== next) title.textContent = next;
    title.setAttribute("aria-label", `重命名${next}节点`);
    title.title = `${next}（双击重命名）`;
  }

  function editShellTitle(node, label, title) {
    if (label.querySelector(".flora-node-title-editor")) return;
    const previous = title.textContent;
    const input = document.createElement("input");
    input.className = "flora-node-title-editor";
    input.value = previous;
    input.maxLength = 80;
    input.setAttribute("aria-label", "节点名称");
    input.autocomplete = "off";
    title.hidden = true;
    label.append(input);
    let finished = false;
    const finish = save => {
      if (finished) return;
      finished = true;
      const requested = input.value.replace(/\s+/g, " ").trim();
      input.remove();
      title.hidden = false;
      if (save && requested && requested !== previous) {
        root.dispatchEvent(new CustomEvent("flora-node-rename", { detail: { node, title: requested } }));
      }
      syncShellLabel(node, previous);
    };
    input.addEventListener("pointerdown", event => event.stopPropagation());
    input.addEventListener("dblclick", event => event.stopPropagation());
    input.addEventListener("keydown", event => {
      event.stopPropagation();
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        finish(event.key === "Enter");
        title.focus({ preventScroll: true });
      }
    });
    input.addEventListener("blur", () => finish(true));
    input.focus({ preventScroll: true });
    input.select();
  }

  function syncImageInformation(node) {
    const shell = node.querySelector(":scope > .flora-node-shell");
    if (!shell) return;
    const image = node.querySelector('.flora-node-result-area .canvas-node-result:not([hidden]) img, .flora-node-result-area .canvas-image-upload:not([hidden]) img, .canvas-node-asset-single-image .canvas-asset-image');
    const info = image ? root.CanvasImageInfo?.getInfo(image) : null;
    const dimensions = /^\d+ × \d+$/.test(info?.dimensions || "") ? info.dimensions : "";
    let row = shell.querySelector(":scope > .flora-node-image-dimensions");
    if (!row && dimensions) {
      row = document.createElement("div");
      row.className = "flora-node-image-dimensions";
      shell.append(row);
    }
    if (row) {
      if (row.textContent !== dimensions) row.textContent = dimensions;
      if (row.hidden !== !dimensions) row.hidden = !dimensions;
      row.setAttribute("aria-label", dimensions ? `图片分辨率 ${dimensions}` : "图片尺寸未知");
    }
    shell.querySelector(":scope > .flora-node-toolbar")?.classList.toggle("has-image-dimensions", Boolean(dimensions));
  }

  function observeImageInformation(node) {
    if (imageInformationStates.has(node)) return;
    const sync = () => syncImageInformation(node);
    const observer = new MutationObserver(sync);
    observer.observe(node, { subtree: true, childList: true, attributes: true,
      attributeFilter: ["src", "data-original-width", "data-original-height", "data-image-quality", "data-canvas-original-src"] });
    node.addEventListener("load", sync, true);
    node.addEventListener("image-resource-state", sync, true);
    imageInformationStates.set(node, { observer, sync });
    sync();
  }

  function getLegacyAction(node, selector) {
    return node.querySelector(selector);
  }

  function mirrorState(node) {
    const shell = node.querySelector(":scope > .flora-node-shell");
    if (!shell) return;
    const states = [
      ["hover", node.matches(":hover")],
      ["focus", node.matches(":focus-within")],
      ["selected", node.classList.contains("is-selected") || node.classList.contains("selected")],
      ["connecting", node.classList.contains("is-connecting")],
    ];
    states.forEach(([name, active]) => shell.classList.toggle(`is-${name}`, active));
    shell.dataset.state = states.filter(([, active]) => active).map(([name]) => name).join(" ") || "rest";
    if (node.dataset.floraComposer === "true") root.FloraGeneratorComposer?.sync?.(node);
    syncGallerySurfaceHeight(node, shell);
    watchGallerySurface(node, shell);
  }

  // 图集内容比标准机身矮时按内容收缩：壳体是绝对定位，高度必须显式给出，
  // 否则单元格下方会留下一整块空白，底部状态行也被推到很远处。
  // 高度取「内容区上留白 + 单元格区域 + 底部状态行占用」，空图集保持标准机身。
  function syncGallerySurfaceHeight(node, shell = node.querySelector(":scope > .flora-node-shell")) {
    if (!shell || node.dataset.floraKind !== "gallery") return false;
    // 单元格可能被包在 body surface 里，也可能直接落在内容区；不依赖具体包裹层，
    // 只按「壳体内从单元格顶部到状态行底部」的实际占用量算高度。
    const members = node.querySelector(".canvas-gallery-container-members");
    if (!members) return false;
    const shellRect = shell.getBoundingClientRect();
    if (!(shellRect.height > 0)) return false;
    const restoreStandardBody = () => {
      if (!node.dataset.floraGalleryHeight) return false;
      delete node.dataset.floraGalleryHeight;
      delete node.dataset.floraFitContent;
      node.dataset.floraSize = `${FLORA_NODE_WIDTH}x${FLORA_NODE_HEIGHT}`;
      node.dataset.floraBodySize = node.dataset.floraSize;
      node.style.setProperty("--flora-node-height", `${FLORA_NODE_HEIGHT}px`);
      return true;
    };
    if (!members.children.length) return restoreStandardBody();
    if (shellRect.height !== FLORA_NODE_HEIGHT && !node.dataset.floraGalleryHeight) return false;
    const body = members.closest(".flora-node-body-surface");
    const block = body || members;
    const blockRect = block.getBoundingClientRect();
    const membersRect = members.getBoundingClientRect();
    // 单元格区域可能被拉伸填满整块内容区（这时 offsetHeight / scrollHeight 都是被撑满的
    // 高度，量不到真实内容），所以按最底部单元格的底边算实际占用高度。
    const rowsBottom = Math.max(...Array.from(members.children, (child) => child.getBoundingClientRect().bottom));
    const rowsHeight = Math.max(1, rowsBottom - membersRect.top);
    const blockTop = Math.max(0, blockRect.top - shellRect.top);
    const membersOffset = Math.max(0, membersRect.top - blockRect.top);
    const status = shell.querySelector(".flora-node-live-status");
    const statusRect = status?.getBoundingClientRect();
    // 状态行绝对定位在壳体底部，收缩后仍贴着机身边缘，所以按它自身高度加下边距算进来。
    const statusHeight = statusRect && statusRect.height > 0 && statusRect.bottom <= shellRect.bottom + 0.5
      ? statusRect.height + (shellRect.bottom - statusRect.bottom)
      : 0;
    const next = Math.round(blockTop + membersOffset + rowsHeight + FLORA_GALLERY_STATUS_GAP + statusHeight);
    if (!(next > 0) || next >= FLORA_NODE_HEIGHT) return restoreStandardBody();
    if (node.dataset.floraGalleryHeight === String(next)) return false;
    node.dataset.floraGalleryHeight = String(next);
    node.dataset.floraFitContent = "true";
    node.dataset.floraSize = `${FLORA_NODE_WIDTH}x${next}`;
    node.dataset.floraBodySize = node.dataset.floraSize;
    node.style.setProperty("--flora-node-height", `${next}px`);
    return true;
  }

  // 图集单元格是异步挂上来的：裁切结果分批渲染、还原画布时懒加载、图片解码后高度才定下来。
  // 只靠状态同步会错过这些时机（量到 0 个单元格就放弃，之后没人再叫它），
  // 于是壳体停在标准机身高度、下方留一大块空白。这里盯着单元格区域本身，
  // 内容或尺寸一变就重新贴合；重复算出的高度相同会提前返回，不会来回抖。
  const gallerySurfaceWatchers = new WeakMap();

  function watchGallerySurface(node, shell) {
    if (node.dataset.floraKind !== "gallery") return false;
    const members = node.querySelector(".canvas-gallery-container-members");
    if (!members) return false;
    if (gallerySurfaceWatchers.get(node)?.members === members) return false;
    const previous = gallerySurfaceWatchers.get(node);
    previous?.resize?.disconnect?.();
    previous?.mutation?.disconnect?.();
    const sync = () => syncGallerySurfaceHeight(node, shell);
    const resize = typeof root.ResizeObserver === "function" ? new root.ResizeObserver(sync) : null;
    const mutation = typeof root.MutationObserver === "function"
      ? new root.MutationObserver(sync)
      : null;
    resize?.observe(members);
    mutation?.observe(members, { childList: true });
    gallerySurfaceWatchers.set(node, { members, resize, mutation });
    return true;
  }

  function wrapPorts(node, shell) {
    let layer = shell.querySelector(":scope > .flora-node-port-layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "flora-node-port-layer";
      layer.dataset.floraRegion = "ports";
      layer.setAttribute("aria-label", "节点连接端口");
      shell.append(layer);
    }
    node.querySelectorAll(":scope > .canvas-port, :scope > .canvas-port-input, :scope > .canvas-port-output").forEach((port) => {
      if (port.parentElement !== layer) layer.append(port);
    });
    return layer;
  }

  let actionIconRefreshQueued = false;
  function scheduleActionIconRefresh() {
    if (actionIconRefreshQueued) return;
    actionIconRefreshQueued = true;
    // A new shell is built before its node enters the document. Lucide scans
    // mounted elements, so render after insertion, once for this batch.
    queueMicrotask(() => {
      actionIconRefreshQueued = false;
      root.lucide?.createIcons?.({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
    });
  }

  function createAction(label, action, title, iconName) {
    const button = root.CanvasNodeActionBar?.createButton?.({
      id: action,
      label,
      title: title || label,
      icon: iconName,
      modifierClass: "flora-node-action",
    }) || document.createElement("button");
    if (!button.classList.contains("flora-node-action")) {
      button.type = "button";
      button.className = "canvas-node-action flora-node-action";
      const caption = document.createElement("span");
      caption.className = "canvas-node-action-caption flora-node-action-caption";
      caption.textContent = label;
      button.append(caption);
    }
    button.dataset.floraAction = action;
    button.title = title || label;
    button.setAttribute("aria-label", title || label);
    scheduleActionIconRefresh();
    return button;
  }

  function setParameterOpen(node, open) {
    if (!node) return;
    if (node.dataset.floraComposer === "true") {
      root.FloraGeneratorComposer?.sync?.(node);
      node.querySelector('.flora-generator-composer .flora-generator-parameter-trigger, .flora-generator-composer .image-model-picker-trigger')?.focus({ preventScroll: true });
      return;
    }
    node.classList.toggle("is-flora-parameters-open", open);
    const panel = node.querySelector(".flora-node-parameter-tray");
    if (panel) panel.hidden = !open;
    node.querySelectorAll('[data-flora-action="parameters"], [data-flora-action="model"]').forEach((button) => {
      button.setAttribute("aria-expanded", String(open));
    });
    if (open) {
      // Use board-space coordinates so this also fits at non-100% canvas zoom.
      const rect = node.getBoundingClientRect();
      const scale = rect.width / (node.offsetWidth || rect.width) || 1;
      const width = (panel?.offsetWidth || 320) * scale;
      const gap = 14 * scale;
      const rightX = rect.right + gap;
      const leftX = rect.left - width - gap;
      const maxX = Math.max(8, root.innerWidth - width - 8);
      const useRight = rightX <= maxX || leftX < 8;
      const x = Math.max(8, Math.min(useRight ? rightX : leftX, maxX));
      const panelHeight = Math.min(
        panel?.scrollHeight ? panel.scrollHeight * scale : 360 * scale,
        Math.max(180 * scale, root.innerHeight - 16),
      );
      const y = Math.max(8, Math.min(rect.top, root.innerHeight - panelHeight - 8));
      node.style.setProperty("--flora-panel-left", `${(x - rect.left) / scale}px`);
      node.style.setProperty("--flora-panel-top", `${(y - rect.top) / scale}px`);
      node.style.setProperty("--flora-panel-height", `${Math.max(180, panelHeight / scale)}px`);
      node.dataset.floraPanelPlacement = useRight ? "right" : "left";
      const focusable = [...(panel?.querySelectorAll("select:not(:disabled), input:not(:disabled), button:not(:disabled)") || [])]
        .find((element) => !element.closest(".flora-node-panel-heading"));
      focusable?.focus({ preventScroll: true });
    } else {
      delete node.dataset.floraPanelPlacement;
      node.querySelector('[data-flora-action="parameters"]')?.focus({ preventScroll: true });
    }
  }

  function syncLiveState(node) {
    const shell = node.querySelector(":scope > .flora-node-shell");
    if (!shell) return;
    syncGallerySurfaceHeight(node, shell);
    const target = node.querySelector(RUN_SELECTOR);
    const run = shell.querySelector('[data-flora-action="run"]');
    if (run && target) {
      run.disabled = target.disabled;
      const busy = target.disabled && /生成|提交|处理|运行|等待|查询/.test(target.textContent || "");
      if (run.getAttribute("aria-busy") !== String(busy)) run.setAttribute("aria-busy", String(busy));
      const price = target.querySelector(".canvas-run-price")?.textContent || "";
      const status = shell.querySelector(".flora-node-run-hint");
      if (status && status.textContent !== price) status.textContent = price;
    }
    const legacyStatus = node.querySelector(".canvas-node-footer-status, .canvas-node-status, .canvas-h3-status, .canvas-node-bar-status");
    const status = shell.querySelector(".flora-node-live-status");
    const message = legacyStatus?.textContent?.trim() || "";
    if (status && status.textContent !== message) status.textContent = message;
    if (status && status.dataset.state !== (legacyStatus?.dataset.state || "idle")) status.dataset.state = legacyStatus?.dataset.state || "idle";
    if (status) status.dataset.floraAudioReady = String(getKind(node) === "asset-audio" && /^已就绪/.test(message));
    const modelButton = shell.querySelector('[data-flora-action="model"] .flora-node-action-caption');
    const picker = node.querySelector(".canvas-node-model, .canvas-midjourney-model, .canvas-llm-model");
    const modelText = picker?.dataset.modelSelection === "auto" ? "自动选择" : picker?.selectedOptions?.[0]?.textContent?.trim();
    if (modelButton && modelButton.textContent !== (modelText || "模型")) modelButton.textContent = modelText || "模型";
    syncShellLabel(node, META[getKind(node)]?.label || "节点");
    syncImageInformation(node);
    const kind = getKind(node);
    const audioResult = kind === "audio-generator" ? root.CanvasAudioGenerator?.serialize?.(node)?.result : null;
    const resultSource = node.dataset.resultSrc || node.dataset.generationVideoSrc
      || audioResult?.url || audioResult?.src || "";
    const resultActions = shell.querySelectorAll('[data-flora-action="result-preview"], [data-flora-action="result-download"]');
    resultActions.forEach((button) => {
      const available = Boolean(resultSource);
      if (button.disabled !== !available) button.disabled = !available;
      const label = button.dataset.floraAction === "result-preview" ? "放大查看生成结果" : "下载生成结果";
      const title = available ? label : `${label}（暂无结果）`;
      if (button.title !== title) button.title = title;
      if (button.getAttribute("aria-label") !== title) button.setAttribute("aria-label", title);
    });
    // 图片工具跟随「当前有没有图」：生成节点看结果，素材图片节点看素材本身。
    const imageTools = shell.querySelectorAll(
      '[data-flora-action="upscale"], [data-flora-action="cutout"], [data-flora-action="crop"], [data-flora-action="outpaint"], [data-flora-action="angle"]',
    );
    if (imageTools.length) {
      const materialImage = kind === "upload";
      const hasImage = Boolean(resultSource) || materialImage;
      imageTools.forEach((button) => { if (button.disabled !== !hasImage) button.disabled = !hasImage; });
    }
  }

  function buildTextTools(node, shell, toolbar) {
    if (shell.querySelector(':scope > .flora-node-tools-menu')) return;
    const tools = createAction("工具", "tools", "打开文字工具", "wand-sparkles");
    tools.setAttribute("aria-expanded", "false");
    toolbar.append(tools);

    const menu = document.createElement("div");
    menu.className = "flora-node-tools-menu";
    menu.dataset.floraRegion = "tools-menu";
    menu.hidden = true;
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "文字工具");

    const items = [
      ["split", "拆分文字", "将多行内容拆成多个文字节点", "scissors"],
      ["replace", "查找和替换", "在当前文字节点中替换内容", "text-search"],
      ["clear", "清空文字", "清除当前节点的文字内容", "eraser"],
      ["copy", "复制文字", "复制当前节点的文字内容", "copy"],
    ];
    items.forEach(([action, label, title, iconName]) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "flora-node-tool-item";
      item.dataset.floraTextAction = action;
      item.setAttribute("role", "menuitem");
      item.title = title;
      const icon = document.createElement("i");
      icon.dataset.lucide = iconName;
      const caption = document.createElement("span");
      caption.textContent = label;
      item.append(icon, caption);
      item.addEventListener("click", (event) => {
        event.stopPropagation();
        if (action === "replace") {
          showReplacePanel(node, shell, menu);
          return;
        }
        root.dispatchEvent(new CustomEvent("flora-text-action", { detail: { node, action } }));
        closeTextTools(node);
      });
      menu.append(item);
    });
    shell.append(menu);

    tools.addEventListener("click", (event) => {
      event.stopPropagation();
      const open = menu.hidden;
      if (open) {
        menu.hidden = false;
        tools.setAttribute("aria-expanded", "true");
        root.lucide?.createIcons?.({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
      } else {
        closeTextTools(node);
      }
    });
    root.lucide?.createIcons?.({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
  }

  function closeTextTools(node) {
    const shell = node?.querySelector(":scope > .flora-node-shell");
    if (!shell) return;
    const menu = shell.querySelector(":scope > .flora-node-tools-menu");
    const tools = shell.querySelector('[data-flora-action="tools"]');
    if (menu) menu.hidden = true;
    tools?.setAttribute("aria-expanded", "false");
    shell.querySelector(":scope > .flora-node-replace-panel")?.remove();
  }

  function showReplacePanel(node, shell, menu) {
    shell.querySelector(":scope > .flora-node-replace-panel")?.remove();
    const panel = document.createElement("div");
    panel.className = "flora-node-replace-panel";
    panel.dataset.floraRegion = "replace-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "查找和替换");
    const heading = document.createElement("strong");
    heading.textContent = "查找和替换";
    const find = document.createElement("input");
    find.type = "text";
    find.placeholder = "查找文字";
    find.setAttribute("aria-label", "查找文字");
    const replacement = document.createElement("input");
    replacement.type = "text";
    replacement.placeholder = "替换为";
    replacement.setAttribute("aria-label", "替换为");
    const row = document.createElement("div");
    row.className = "flora-node-replace-actions";
    const cancel = createAction("取消", "cancel-replace", "关闭查找和替换", "x");
    const apply = createAction("替换全部", "apply-replace", "替换当前节点中的全部匹配文字", "check");
    row.append(cancel, apply);
    panel.append(heading, find, replacement, row);
    shell.append(panel);
    menu.hidden = true;
    shell.querySelector('[data-flora-action="tools"]')?.setAttribute("aria-expanded", "false");
    cancel.addEventListener("click", (event) => {
      event.stopPropagation();
      closeTextTools(node);
    });
    apply.addEventListener("click", (event) => {
      event.stopPropagation();
      root.dispatchEvent(new CustomEvent("flora-text-action", {
        detail: { node, action: "replace", payload: { find: find.value, replacement: replacement.value } },
      }));
      closeTextTools(node);
    });
    find.focus({ preventScroll: true });
  }

  function readAssetState(node) {
    try {
      const value = JSON.parse(node?.dataset?.assetCollection || "{}");
      return {
        members: Array.isArray(value.members) ? value.members : [],
        activeMemberId: String(value.activeMemberId || ""),
      };
    } catch {
      return { members: [], activeMemberId: "" };
    }
  }

  function getPrimaryMedia(node) {
    if (!node) return null;
    return node.querySelector(
      ".canvas-gallery-member.is-active img[data-canvas-original-src], "
      + ".canvas-gallery-member[data-active=\"true\"] img[data-canvas-original-src], "
      + "img[data-canvas-original-src], video[data-original-src], audio[data-original-src], "
      + ".canvas-media-shell-video video, .canvas-media-shell-audio audio",
    );
  }

  function getMediaState(node, kind) {
    const asset = readAssetState(node);
    const media = getPrimaryMedia(node);
    const hasSource = Boolean(
      media
      || asset.members.length
      || node?.dataset?.imageSrc
      || node?.dataset?.resultSrc
      || node?.dataset?.videoSrc
      || node?.dataset?.audioSrc,
    );
    return {
      kind,
      media,
      members: asset.members,
      activeMemberId: asset.activeMemberId || String(asset.members[0]?.id || ""),
      hasSource,
      collection: kind === "asset-collection" || node?.classList?.contains("canvas-node-asset-collection"),
    };
  }

  function dispatchMediaAction(node, kind, action) {
    const state = getMediaState(node, kind);
    root.dispatchEvent(new CustomEvent("flora-media-action", {
      detail: {
        node,
        kind,
        action,
        image: state.media,
        media: state.media,
        memberId: state.activeMemberId,
      },
    }));
  }

  function buildMediaActions(node, toolbar, kind) {
    if (!ASSET_KINDS.has(kind) || !toolbar) return;
    // 与图片工具同一套「图标 + 中文短标签」，顺序按使用频率：查看 → 下载 → 替换 → 删除 → 上传。
    const specs = [
      ["preview", "预览", "放大查看原图", "maximize"],
      ["download", "下载", "下载素材", "download"],
      ["replace", "替换", "替换素材", "replace"],
      ["delete", "删除", "删除素材节点", "trash-2"],
      ["media-upload", "上传", "上传素材", "upload"],
    ];
    const buttons = new Map();
    specs.forEach(([action, label, title, icon]) => {
      let button = toolbar.querySelector(`[data-flora-action="${action}"]`);
      if (!button) {
        button = createAction(label, action, title, icon);
        button.dataset.floraMediaAction = action;
        toolbar.append(button);
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          dispatchMediaAction(node, kind, action);
        });
      }
      buttons.set(action, button);
    });
    const state = getMediaState(node, kind);
    const hasSource = state.hasSource;
    const collection = state.collection;
    const upload = buttons.get("media-upload");
    const preview = buttons.get("preview");
    const download = buttons.get("download");
    const replace = buttons.get("replace");
    const remove = buttons.get("delete");
    if (upload) {
      upload.hidden = hasSource;
      upload.querySelector(".flora-node-action-caption")?.replaceChildren(
        document.createTextNode(collection ? (state.members.length ? "添加" : "上传") : "上传"),
      );
      upload.title = collection && state.members.length ? "添加素材" : "上传素材";
      upload.setAttribute("aria-label", upload.title);
    }
    [preview, download, replace].forEach((button) => { if (button) button.hidden = !hasSource; });
    // 图片工具（放大 / 抠图 / 裁剪 / 扩图 / 换角度）与生图节点共用同一组按钮，
    // 只对单张图片素材开放：合集成员的裁切仍在右键菜单里。
    const imageTools = buildImageToolActions(node, toolbar, kind);
    imageTools.forEach((button) => { button.hidden = !hasSource || kind !== "upload"; });
    // 工具排在「放大查看原图」之后，保持 图片工具 → 结果动作 的阅读顺序。
    let anchor = buttons.get("preview");
    imageTools.forEach((button) => { if (anchor) { anchor.after(button); anchor = button; } });
    if (remove) remove.title = hasSource ? "删除素材节点" : "删除节点";
  }

  // 素材图片节点与图片生成节点共用的一组图片工具，点击后统一走 flora-media-action。
  // 每个动作都是「图标 + 中文短标签」：文字说清做什么，图标只做辅助，
  // 并且两两可分辨（超清用 sparkles，不再和「预览」的全屏箭头撞脸）。
  const IMAGE_TOOL_SPECS = Object.freeze([
    ["upscale", "超清", "智能超清放大", "sparkles"],
    // 抠图用套索（lasso），和紧邻的「裁剪」区分开：剪刀读起来是「剪」，不是抠主体。
    ["cutout", "抠图", "AI 抠图", "lasso"],
    ["crop", "裁剪", "裁剪图片", "crop"],
    ["outpaint", "扩图", "扩图", "expand"],
    ["angle", "换角度", "换角度", "rotate-3d"],
  ]);

  function buildImageToolActions(node, toolbar, kind) {
    const buttons = [];
    IMAGE_TOOL_SPECS.forEach(([action, label, title, iconName]) => {
      let button = toolbar.querySelector(`[data-flora-action="${action}"]`);
      if (!button) {
        button = createAction(label, action, title, iconName);
        toolbar.append(button);
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          dispatchMediaAction(node, kind, action);
        });
      }
      buttons.push(button);
    });
    return buttons;
  }

  function buildActions(node, shell, kind) {
    let actions = shell.querySelector(":scope > .flora-node-actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "flora-node-actions";
      actions.dataset.floraRegion = "actions";
      actions.setAttribute("aria-label", "节点操作");
      shell.append(actions);
    }
    if (actions.dataset.bound === "true") return actions;
    actions.dataset.bound = "true";
    const sharedBar = root.CanvasNodeActionBar?.create?.({
      appendTo: shell,
      className: "flora-node-toolbar",
      ariaLabel: "节点工具栏",
      hidden: false,
    });
    const toolbar = sharedBar?.element || document.createElement("div");
    if (!sharedBar) {
      toolbar.className = "canvas-node-action-bar flora-node-toolbar";
      toolbar.setAttribute("role", "toolbar");
      toolbar.setAttribute("aria-label", "节点工具栏");
    }
    shell.append(toolbar);
    [actions, toolbar].forEach((region) => region.addEventListener("pointerdown", (event) => event.stopPropagation()));
    const status = document.createElement("span");
    status.className = "flora-node-live-status";
    status.setAttribute("role", "status");
    shell.append(status);
    if (kind === "note" && getLegacyAction(node, ".canvas-note-palette")) {
      const palette = createAction("颜色", "color", "调整便签颜色", "palette");
      toolbar.append(palette);
      palette.addEventListener("click", (event) => {
        event.stopPropagation();
        node.classList.toggle("is-flora-palette-open");
      });
    }
    // Generative nodes keep their toolbar to result actions only: the model
    // picker and the parameter popover already live in the composer's bottom
    // row, so the old 模型 / 工具 buttons only duplicated entry points.
    // Text editing starts on double-click; its model controls stay below the
    // node, with no extra text-tool entry in the toolbar.
    buildMediaActions(node, toolbar, kind);
    // Generated results download from the node toolbar. The old in-result
    // button sat in the same top-right corner as the history badge and covered
    // it. Keep this button hidden until the node actually holds a result.
    if (GENERATIVE_KINDS.has(kind) || kind === "audio-generator") {
      // The image lightbox is the only preview surface, so 放大查看 belongs to
      // picture results. Downloads stay on every result node, including video
      // and audio, and the pair stays visible with a disabled state so the
      // toolbar never changes width when a result arrives.
      if (["generator", "midjourney"].includes(kind)) {
        const preview = createAction("预览", "result-preview", "放大查看生成结果", "maximize");
        preview.classList.add("flora-node-icon-action");
        preview.disabled = true;
        toolbar.append(preview);
        preview.addEventListener("click", (event) => {
          event.stopPropagation();
          root.dispatchEvent(new CustomEvent("flora-media-action", {
            detail: { node, kind, action: "preview" },
          }));
        });
      }
      const download = createAction("下载", "result-download", "下载生成结果", "download");
      download.classList.add("flora-node-icon-action");
      download.disabled = true;
      toolbar.append(download);
      download.addEventListener("click", (event) => {
        event.stopPropagation();
        root.dispatchEvent(new CustomEvent("flora-media-action", {
          detail: { node, kind, action: "download" },
        }));
      });
      // 图片生成节点与素材图片节点共用同一组图片工具（放大 / 抠图 / 裁剪 / 扩图 / 换角度）。
      if (["generator", "midjourney"].includes(kind)) {
        const imageTools = buildImageToolActions(node, toolbar, kind);
        imageTools.forEach((button) => { if (button.disabled) button.disabled = true; });
      }
    }
    const legacyRun = getLegacyAction(node, RUN_SELECTOR);
    const run = legacyRun ? createAction("运行", "run", "运行节点", "arrow-up") : null;
    let remove = toolbar.querySelector('[data-flora-action="delete"]');
    const ownsRemove = !remove;
    if (!remove) remove = createAction("删除", "delete", "删除节点", "trash-2");
    remove.classList.add("flora-node-icon-action");
    // Composer nodes submit from the panel below, so the legacy floating run
    // button must not claim their run control — the text node's model button is
    // the same element the composer lifts into its action row.
    if (run && !["generator", "video-api", "minimax-h3", "llm", "audio-generator", "text"].includes(kind)) {
      const hint = document.createElement("span");
      hint.className = "flora-node-run-hint";
      run.classList.add("flora-node-submit");
      actions.append(hint, run);
      run.addEventListener("click", (event) => {
        event.stopPropagation();
        const target = getLegacyAction(node, RUN_SELECTOR);
        if (target && !target.disabled) target.click();
        syncLiveState(node);
      });
    }
    if (ownsRemove) {
      toolbar.append(remove);
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        const target = getLegacyAction(node, ".canvas-node-delete, .canvas-note-remove");
        if (target) target.click();
        else node.dispatchEvent(new CustomEvent("flora-node-delete", { bubbles: true, detail: { node, kind } }));
      });
    }
    if (kind === "text") {
      root.CanvasTextNodeRenderer?.mountToolbar?.(node, toolbar);
      root.FloraTextTools?.mount(node, toolbar);
    }
    syncLiveState(node);
    return actions;
  }

  function buildShell(node) {
    const { kind, meta } = resolveMeta(node);
    // Text nodes carry the language-model composer now, so they mount the shared
    // operation area as well. The legacy llm kind stays for existing boards.
    const composer = ["generator", "video-api", "minimax-h3", "llm", "audio-generator", "text"].includes(kind);
    if (!composer) root.FloraGeneratorComposer?.unmount?.(node);
    const isLegacyFrameless = node.classList.contains("canvas-node-frameless")
      && !node.classList.contains("canvas-node-image")
      && !node.classList.contains("canvas-node-asset-collection");
    if (!kind || isLegacyFrameless || node.classList.contains("canvas-node-group")) return null;
    node.dataset.floraNode = "true";
    node.dataset.floraKind = kind;
    node.dataset.floraComposer = String(composer);
    node.dataset.floraTone = meta.tone;
    const wideVideo = ["video-api", "minimax-h3"].includes(kind);
    const bodyWidth = wideVideo ? 640 : FLORA_NODE_WIDTH;
    // 图集已经按内容收缩过就沿用上次的高度，避免每次重建壳体先弹回标准机身。
    const savedGalleryHeight = kind === "gallery" ? Number(node.dataset.floraGalleryHeight || 0) : 0;
    const bodyHeight = kind === "asset-audio"
      ? FLORA_AUDIO_HEIGHT
      : savedGalleryHeight > 0 ? savedGalleryHeight : wideVideo ? 360 : FLORA_NODE_HEIGHT;
    node.dataset.floraSize = `${bodyWidth}x${bodyHeight}`;
    node.dataset.floraBodySize = node.dataset.floraSize;
    node.style.setProperty("--flora-node-width", `${bodyWidth}px`);
    node.style.setProperty("--flora-node-height", `${bodyHeight}px`);
    if (kind === "asset-audio" || wideVideo) {
      // Match saved/virtualized geometry to the compact visible player.
      node.dataset.width = String(bodyWidth);
      node.dataset.height = String(bodyHeight);
      node.dataset.renderedWidth = String(bodyWidth);
      node.dataset.renderedHeight = String(bodyHeight + 48);
    }
    let shell = node.querySelector(":scope > .flora-node-shell");
    if (!shell) {
      shell = document.createElement("div");
      shell.className = "flora-node-shell";
      shell.dataset.floraRegion = "shell";
      node.append(shell);
    }
    let card = shell.querySelector(":scope > .flora-node-card");
    if (!card) {
      card = document.createElement("div");
      card.className = "flora-node-card";
      card.dataset.floraRegion = "card";
      card.setAttribute("aria-hidden", "true");
      shell.prepend(card);
    }
    const content = adoptLegacyContent(node, shell);
    let label = node.querySelector(":scope > .flora-node-label");
    if (!label) {
      // Move a label created by an older shell build out of the shell before
      // composing the body. The title is chrome for the node, not part of the
      // 400px media/content surface.
      label = shell.querySelector(":scope > .flora-node-label");
      if (label) node.append(label);
    }
    if (!label) {
      label = document.createElement("div");
      label.className = "flora-node-label";
      label.dataset.floraRegion = "label";
      const icon = document.createElement("span");
      icon.className = "flora-node-label-icon";
      icon.dataset.tone = meta.tone;
      const glyph = document.createElement("i");
      glyph.dataset.lucide = meta.icon;
      icon.append(glyph);
      const title = document.createElement("button");
      title.type = "button";
      title.className = "flora-node-label-title";
      title.dataset.floraAction = "rename";
      title.textContent = meta.label;
      title.setAttribute("aria-label", `重命名${meta.label}节点`);
      label.append(icon, title);
      node.append(label);
      title.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      title.addEventListener("pointerdown", event => event.stopPropagation());
      title.addEventListener("dblclick", event => {
        event.stopPropagation();
        editShellTitle(node, label, title);
      });
      title.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== "F2") return;
        event.preventDefault(); event.stopPropagation();
        editShellTitle(node, label, title);
      });
    }
    const legacyTitle = getLegacyTitle(node);
    const visualTitle = label.querySelector(".flora-node-label-title");
    if (visualTitle && legacyTitle) visualTitle.textContent = legacyTitle.value || legacyTitle.textContent || meta.label;
    decorateContent(content, kind);
    composeContent(content, kind);
    syncMediaDimensions(node, kind);
    enhanceMediaNode(node, kind);
    syncShellLabel(node, meta.label);
    wrapPorts(node, shell);
    buildActions(node, shell, kind);
    root.FloraGeneratorComposer?.mountEnginePicker?.(node);
    if (composer) root.FloraGeneratorComposer?.mount?.(node, shell);
    if (composer) root.FloraGenerationHistory?.mount?.(node, shell);
    return shell;
  }

  function observe(node) {
    if (stateObservers.has(node)) return;
    const previewChanged = event => {
      if (event.target.closest?.(".canvas-node-size, .canvas-node-model, .canvas-node-resolution, .canvas-custom-size-field")) {
        queueMicrotask(() => syncImagePreviewDimensions(node, true));
      }
    };
    node.addEventListener("change", previewChanged);
    node.addEventListener("input", previewChanged);
    node.floraImagePreviewCleanup = () => {
      node.removeEventListener("change", previewChanged);
      node.removeEventListener("input", previewChanged);
      const state = imagePreviewStates.get(node);
      state?.image?.removeEventListener("load", state.loaded);
      imagePreviewStates.delete(node);
    };
    const observer = new MutationObserver((records) => {
      if (records.some((record) => record.type === "attributes" && record.attributeName === "class")) mirrorState(node);
      if (records.some((record) => record.type === "childList")) {
        let shell = node.querySelector(":scope > .flora-node-shell");
        // Legacy renderers replace node.innerHTML when media content changes.
        // Rebuild the shell after that renderer finishes so uploaded materials
        // keep the same Neon node surface instead of dropping back to legacy DOM.
        if (!shell && node.dataset.floraNode === "true") shell = buildShell(node);
        if (shell) {
          const content = adoptLegacyContent(node, shell);
          decorateContent(content, node.dataset.floraKind || "");
          composeContent(content, node.dataset.floraKind || "");
          syncMediaDimensions(node, node.dataset.floraKind || "");
          enhanceMediaNode(node, node.dataset.floraKind || "");
          syncShellLabel(node, META[node.dataset.floraKind || ""]?.label || "节点");
          wrapPorts(node, shell);
          buildMediaActions(node, shell.querySelector(":scope > .flora-node-toolbar"), node.dataset.floraKind || "");
          syncLiveState(node);
          root.FloraNodeTags?.mount(node);
          root.FloraGeneratorComposer?.mountEnginePicker?.(node);
          if (node.dataset.floraComposer === "true") {
            root.FloraGeneratorComposer?.mount?.(node, shell);
            root.FloraGenerationHistory?.mount?.(node, shell);
          }
          syncScale();
        }
      }
    });
    observer.observe(node, { attributes: true, attributeFilter: ["class"], childList: true });
    stateObservers.set(node, observer);
  }

  function mount(node) {
    if (!node?.matches?.(".canvas-node")) return null;
    const shell = buildShell(node);
    if (!shell) return null;
    observe(node);
    observeImageInformation(node);
    mirrorState(node);
    syncScale();
    node.querySelectorAll(":scope > .flora-node-label .flora-node-label-icon").forEach(refreshIcon);
    root.lucide?.createIcons?.({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
    return shell;
  }

  function unmount(node) {
    root.FloraTextTools?.unmount(node);
    const information = imageInformationStates.get(node);
    information?.observer.disconnect();
    if (information) {
      node.removeEventListener("load", information.sync, true);
      node.removeEventListener("image-resource-state", information.sync, true);
      imageInformationStates.delete(node);
    }
    node?.floraImagePreviewCleanup?.();
    if (node) delete node.floraImagePreviewCleanup;
    root.FloraGenerationHistory?.unmount?.(node);
    root.FloraGeneratorComposer?.unmountEnginePickers?.(node);
    root.FloraGeneratorComposer?.unmount?.(node);
    const observer = stateObservers.get(node);
    observer?.disconnect();
    stateObservers.delete(node);
    const shell = node?.querySelector(":scope > .flora-node-shell");
    const content = shell?.querySelector(":scope > .flora-node-content");
    const portLayer = shell?.querySelector(":scope > .flora-node-port-layer");
    const parameterPanel = shell?.querySelector(":scope > .flora-node-parameter-tray");
    const restore = (container) => {
      Array.from(container?.children || []).forEach((child) => {
        if (child.dataset.floraLayoutWrapper === "true") restore(child);
        else node.append(child);
      });
    };
    restore(content);
    Array.from(parameterPanel?.children || []).forEach((child) => {
      if (child.classList.contains("flora-node-panel-heading")) return;
      node.append(child);
    });
    Array.from(portLayer?.children || []).forEach((child) => node.append(child));
    node.querySelector(":scope > .flora-node-label")?.remove();
    shell?.remove();
    if (node) delete node.dataset.floraNode;
  }

  root.CanvasFloraNodeShell = Object.freeze({
    syncScale,
    META,
    getKind,
    syncImagePreview: syncImagePreviewDimensions,
    enhanceMedia: (node) => enhanceMediaNode(node, node.dataset.floraKind || getKind(node)),
    mount,
    unmount,
    refresh: mount,
    // Result writes land inside the result area, which the shell observer does
    // not watch. The canvas asks for a toolbar sync after it commits a result.
    syncToolbar: (node) => syncLiveState(node),
    syncLabel: (node) => syncShellLabel(node, META[getKind(node)]?.label || "节点"),
  });
})(typeof window !== "undefined" ? window : globalThis);
