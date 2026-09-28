const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  normalizeVideoHistory,
  resolveActiveVideo,
  appendVideoHistory,
  removeVideoHistory,
} = require("../video-history-rules");
const CanvasVideoOutputState = require("../canvas-video-output-state");

const ROOT = path.join(__dirname, "..");
const INDEX_SOURCE = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const PACKAGE_SOURCE = fs.readFileSync(path.join(ROOT, "package.json"), "utf8");
const SCRIPT_SOURCE = fs.readFileSync(path.join(ROOT, "script.js"), "utf8");
const STATE_SOURCE = fs.readFileSync(path.join(ROOT, "canvas-video-output-state.js"), "utf8");
const STYLE_SOURCE = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
const VIDEO_OUTPUT_RENDERER_SOURCE = fs.readFileSync(
  path.join(ROOT, "canvas-video-output-node-renderer.js"),
  "utf8",
);

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Missing function ${name}`);
  const bodyMarker = source.indexOf(") {", start);
  assert.notEqual(bodyMarker, -1, `Missing function body for ${name}`);
  const bodyStart = bodyMarker + 2;
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unterminated function ${name}`);
}

function createIdSequence(...ids) {
  let index = 0;
  return () => ids[index++] || `generated-${index}`;
}

const legacy = normalizeVideoHistory([], {
  src: "/output/legacy.mp4",
  name: "旧视频.mp4",
  mimeType: "video/mp4",
  duration: 8.5,
  promptSummary: "旧提示词",
  createdAt: "2026-08-11T08:00:00.000Z",
}, createIdSequence("legacy-id"));
assert.deepEqual(legacy, [{
  id: "legacy-id",
  src: "/output/legacy.mp4",
  name: "旧视频.mp4",
  mimeType: "video/mp4",
  duration: 8.5,
  promptSummary: "旧提示词",
  createdAt: "2026-08-11T08:00:00.000Z",
}]);

const normalized = normalizeVideoHistory([
  null,
  { id: "old-a", src: "/output/a.mp4", name: "A-old.mp4" },
  { id: "stable-b", url: "/output/b.mp4", name: "B.mp4", duration: "6.25" },
  { src: "/output/a.mp4", name: "A-new.mp4", promptSummary: "newest metadata" },
  { id: "missing-src", name: "invalid.mp4" },
], null, createIdSequence("new-a"));
assert.deepEqual(normalized, [
  {
    id: "stable-b",
    src: "/output/b.mp4",
    name: "B.mp4",
    mimeType: "video/mp4",
    duration: 6.25,
    promptSummary: "",
    createdAt: "",
  },
  {
    id: "new-a",
    src: "/output/a.mp4",
    name: "A-new.mp4",
    mimeType: "video/mp4",
    duration: 0,
    promptSummary: "newest metadata",
    createdAt: "",
  },
], "normalization should filter malformed entries and keep the newest duplicate source");

const duplicateIds = normalizeVideoHistory([
  { id: "duplicate-id", src: "/output/id-a.mp4" },
  { id: "duplicate-id", src: "/output/id-b.mp4" },
], null, createIdSequence("replacement-id"));
assert.deepEqual(
  duplicateIds.map((video) => video.id),
  ["duplicate-id", "replacement-id"],
  "different sources must never retain the same history ID",
);

assert.equal(resolveActiveVideo(normalized, "stable-b")?.id, "stable-b");
assert.equal(resolveActiveVideo(normalized, "missing")?.id, "new-a");
assert.equal(resolveActiveVideo([], "missing"), null);

const appended = appendVideoHistory(
  normalized,
  {
    src: "/output/c.mp4",
    name: "C.mp4",
    createdAt: "2026-08-12T02:00:00.000Z",
  },
  "stable-b",
  createIdSequence("new-c"),
);
assert.equal(appended.activeVideoId, "new-c");
assert.deepEqual(appended.history.map((video) => video.src), [
  "/output/b.mp4",
  "/output/a.mp4",
  "/output/c.mp4",
]);
assert.equal(normalized.length, 2, "append must not mutate the caller's history array");

const deduplicatedAppend = appendVideoHistory(
  appended.history,
  { src: "/output/a.mp4", name: "A-latest.mp4" },
  appended.activeVideoId,
  createIdSequence("latest-a"),
);
assert.deepEqual(deduplicatedAppend.history.map((video) => video.src), [
  "/output/b.mp4",
  "/output/c.mp4",
  "/output/a.mp4",
]);
assert.equal(deduplicatedAppend.history.at(-1).name, "A-latest.mp4");
assert.equal(deduplicatedAppend.activeVideoId, "latest-a");

const removedInactive = removeVideoHistory(
  deduplicatedAppend.history,
  "stable-b",
  "latest-a",
);
assert.equal(removedInactive.activeVideoId, "latest-a");
assert.deepEqual(removedInactive.history.map((video) => video.src), [
  "/output/c.mp4",
  "/output/a.mp4",
]);

const removedActive = removeVideoHistory(
  removedInactive.history,
  "latest-a",
  "latest-a",
);
assert.equal(removedActive.activeVideoId, "new-c", "removing the active video should select the newest remaining item");
assert.deepEqual(removedActive.history.map((video) => video.src), ["/output/c.mp4"]);

const emptied = removeVideoHistory(removedActive.history, "new-c", "new-c");
assert.deepEqual(emptied, { history: [], activeVideoId: "" });

const rulesIndex = INDEX_SOURCE.indexOf("video-history-rules.js");
const appIndex = INDEX_SOURCE.indexOf("script.js");
assert(rulesIndex >= 0, "The browser should load the video history rules module");
assert(rulesIndex < appIndex, "Video history rules should load before the canvas application script");
assert(PACKAGE_SOURCE.includes("node --check video-history-rules.js"), "The full check should syntax-check video history rules");
assert(PACKAGE_SOURCE.includes("node tools/check-canvas-video-history.js"), "The full check should run focused video history checks");

const runH3Source = extractFunction(SCRIPT_SOURCE, "runCanvasMinimaxH3Node");
const serializeSource = extractFunction(SCRIPT_SOURCE, "serializeCanvasNode");
const restoreSource = extractFunction(SCRIPT_SOURCE, "restoreCanvasBoard");
const virtualMountSource = extractFunction(SCRIPT_SOURCE, "mountCanvasVirtualNode");
const restoreNodeSource = extractFunction(SCRIPT_SOURCE, "restoreCanvasBoardNode");
const outputSource = extractFunction(SCRIPT_SOURCE, "getCanvasNodeOutput");
const appendSource = extractFunction(SCRIPT_SOURCE, "appendCanvasVideoOutputHistory");
const activeSource = extractFunction(SCRIPT_SOURCE, "setCanvasVideoActiveItem");
const removeSource = extractFunction(SCRIPT_SOURCE, "removeCanvasVideoHistoryItem");
const serializeVideoSource = extractFunction(SCRIPT_SOURCE, "serializeCanvasVideoOutputState");
const renderOptionsSource = extractFunction(SCRIPT_SOURCE, "getCanvasVideoOutputRenderOptions");
const renderNodeWrapperSource = extractFunction(SCRIPT_SOURCE, "renderCanvasVideoOutputNode");
const renderNodeSource = extractFunction(VIDEO_OUTPUT_RENDERER_SOURCE, "render");
const renderHistorySource = extractFunction(SCRIPT_SOURCE, "renderCanvasVideoOutputHistory");
const openHistorySource = extractFunction(SCRIPT_SOURCE, "setCanvasVideoHistoryOpen");
const closeHistorySource = extractFunction(SCRIPT_SOURCE, "closeCanvasVideoHistoryPanels");
const deleteHistorySource = extractFunction(SCRIPT_SOURCE, "requestCanvasVideoHistoryDelete");

assert(runH3Source.includes("appendCanvasVideoOutputHistory"), "Successful H3 generation should append to video history");
assert(!runH3Source.includes("renderCanvasVideoOutputNode(output"), "Successful H3 generation should not overwrite the output node");
assert(serializeSource.includes("serializeCanvasVideoOutputState"), "Video history should be serialized through the tested adapter");
assert(serializeVideoSource.includes("CanvasVideoOutputState.serialize"), "Serialization should delegate to the video state component");
assert(STATE_SOURCE.includes("videoHistory:"), "The serialized video state should include history");
assert(STATE_SOURCE.includes("videoActiveId:"), "The serialized video state should include the active ID");
assert(STATE_SOURCE.includes("videoSrc:"), "Legacy current-video fields should remain serialized for compatibility");
assert(restoreSource.includes("restoreCanvasBoardVirtually(board)"), "Restore should use the virtualized board adapter");
assert(virtualMountSource.includes("restoreCanvasBoardNode(model, canvasVirtualBoard"), "Virtual mounts should use the shared node adapter");
assert(restoreNodeSource.includes("getCanvasVideoOutputRenderOptions(item)"), "Shared node restore should use the tested history/legacy adapter");
assert(renderOptionsSource.includes("CanvasVideoOutputState.renderOptions"), "Restore should delegate to the video state component");
assert(STATE_SOURCE.includes("videoHistory: Array.isArray(item.videoHistory)"), "Restore should load the saved video history array");
assert(STATE_SOURCE.includes("activeVideoId: item.videoActiveId"), "Restore should load the saved active video ID");
assert(STATE_SOURCE.includes("src: item.videoSrc || item.mediaSrc"), "Restore should still migrate legacy single-video nodes");
assert(STATE_SOURCE.includes("node.dataset.videoMimeType"), "Legacy migration should read videoMimeType");
assert(STATE_SOURCE.includes("node.dataset.videoDuration"), "Legacy migration should read videoDuration");
assert(STATE_SOURCE.includes("node.dataset.videoMimeType"), "Active video should mirror videoMimeType for older clients");
assert(STATE_SOURCE.includes("node.dataset.videoDuration"), "Active video should mirror videoDuration for older clients");
assert(STATE_SOURCE.includes("videoName:"), "Serialization should continue writing videoName");
assert(STATE_SOURCE.includes("videoMimeType:"), "Serialization should continue writing videoMimeType");
assert(STATE_SOURCE.includes("videoDuration:"), "Serialization should continue writing videoDuration");
assert(outputSource.includes("getCanvasVideoActiveItem"), "Downstream references should resolve the active history item first");
assert(appendSource.includes("VideoHistoryRules.appendVideoHistory"), "Canvas append should use the tested state rules");
assert(activeSource.includes("refreshCanvasConnectedNodes"), "Switching videos should refresh downstream references");
assert(removeSource.includes("VideoHistoryRules.removeVideoHistory"), "Video deletion should use the tested fallback rules");
assert(removeSource.includes("refreshCanvasConnectedNodes"), "Deleting videos should refresh downstream references");
assert(
  renderNodeWrapperSource.includes("renderer.render(node, options, getCanvasNodePluginContext())")
    && renderNodeWrapperSource.includes("plugin.render(node, options, getCanvasNodePluginContext())"),
  "The compatibility wrapper should delegate to the video-output plugin or renderer",
);
assert(renderNodeSource.includes("canvas-video-history-toggle"), "Video outputs should render a history count control");
assert(renderNodeSource.includes("canvas-video-history-panel"), "Video outputs should render a history panel");
assert(renderNodeSource.includes("canvas-video-history-list"), "Video outputs should provide a history list");
assert(
  !renderNodeSource.includes("canvas-video-output-meta"),
  "Video outputs should not render a redundant metadata footer",
);
assert(
  !renderNodeSource.includes('document.createElement("a")'),
  "The active video should rely on native video controls instead of a duplicate download link",
);
assert(
  !renderNodeSource.includes("canvas-video-output-actions"),
  "Video outputs should not render a separate footer action group",
);
assert.match(
  renderNodeSource,
  /node\.append\(inputPort, outputPort, bar, stage, historyToggle, historyPanel, createCanvasResizeHandle\(\)\)/,
  "The history control should be a direct child of the video-output node",
);
assert(renderNodeSource.includes("wasHistoryOpen"), "Re-rendering the active video should preserve an open history panel");
assert(
  !renderNodeSource.includes("renderCanvasVideoOutputHistory(node);"),
  "Closed video-output nodes should not preload every historical MP4",
);
assert(renderHistorySource.includes("[...history].reverse()"), "Video history should display newest results first");
assert(renderHistorySource.includes("is-active"), "The selected video should be marked active");
assert(renderHistorySource.includes("videoItem.promptSummary"), "History cards should display the prompt summary");
assert(renderHistorySource.includes("videoItem.name"), "History cards should continue displaying the video filename");
assert(renderHistorySource.includes('thumbnail.preload = "none"'), "Historical video previews should not eagerly fetch MP4 metadata");
assert(removeSource.includes('node.classList.remove("is-video-history-open")'), "Clearing the final item should remove the raised history state");
assert(renderHistorySource.includes('data-lucide="play"'), "Each history item should expose a play/select action");
assert(renderHistorySource.includes('data-lucide="download"'), "Each history item should expose a download action");
assert(renderHistorySource.includes('data-lucide="trash-2"'), "Each history item should expose a delete action");
assert(!openHistorySource.includes("closeCanvasGalleryHistoryPanels"), "Video history must not retain the removed image-gallery drawer dependency");
assert(openHistorySource.includes("closeCanvasVideoHistoryPanels(node)"), "Opening video history should close other video history panels");
assert(closeHistorySource.includes("is-video-history-open"), "Video history panels should be closed as a group");
assert(deleteHistorySource.includes("requestCanvasDeleteConfirmation"), "Deleting a historical video should require confirmation");
assert(deleteHistorySource.includes("removeCanvasVideoHistoryItem"), "Confirmed deletion should remove only the selected history entry");
assert.match(
  SCRIPT_SOURCE,
  /viewport\.addEventListener\("pointerdown"[\s\S]*?closeCanvasVideoHistoryPanels\(\)/,
  "Clicking outside a video history panel should close it",
);
assert.match(
  SCRIPT_SOURCE,
  /event\.key === "Escape"[\s\S]*?closeCanvasVideoHistoryPanels\(\)/,
  "Escape should close video history",
);
assert.match(
  STYLE_SOURCE,
  /\.canvas-video-history-panel\s*\{[^}]*max-height:[^}]*overflow:\s*hidden/s,
  "The video history panel should have a bounded height",
);
assert.match(
  STYLE_SOURCE,
  /\.canvas-video-history-list\s*\{[^}]*overflow-y:\s*auto/s,
  "Long video history should scroll",
);
assert.match(
  STYLE_SOURCE,
  /\.canvas-node-video-output\.is-video-history-open\s*\{[^}]*z-index:\s*70/s,
  "An open video history should rise above neighboring nodes",
);
assert.match(
  STYLE_SOURCE,
  /\.canvas-video-history-toggle\s*\{[^}]*position:\s*absolute[^}]*right:\s*-\d+px[^}]*bottom:\s*\d+px/s,
  "The video history control should float along the lower-right edge",
);
assert.match(
  STYLE_SOURCE,
  /\.canvas-video-history-toggle b\s*\{[^}]*position:\s*absolute[^}]*right:\s*-\d+px[^}]*bottom:\s*-\d+px/s,
  "The video history count should badge the control's lower-right corner",
);
assert.match(
  STYLE_SOURCE,
  /\.canvas-video-history-preview video\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9/s,
  "History previews should use a stable 16:9 video frame",
);

const compatibilityContext = {
  ...CanvasVideoOutputState,
  serialize(node) {
    return CanvasVideoOutputState.serialize(node, {
      createId: () => "history-a",
      rules: {
        normalizeVideoHistory: (values, legacy) => (
          values.length
            ? values
            : legacy
              ? [{ ...legacy, id: "history-a" }]
              : []
        ),
        resolveActiveVideo: (values) => values[0] || null,
      },
    });
  },
  history() {
    return [{ id: "history-a", src: "/output/a.mp4" }];
  },
  activeItem() {
    return { id: "history-a", src: "/output/a.mp4" };
  },
};

const legacyNode = {
  dataset: {
    videoSrc: "/output/legacy-only.mp4",
    videoName: "legacy-only.mp4",
    videoMimeType: "video/quicktime",
    videoDuration: "12.5",
    videoPromptSummary: "legacy prompt",
    videoCreatedAt: "2026-08-01T00:00:00.000Z",
  },
  classList: { toggle() {} },
};
assert.deepEqual(
  JSON.parse(JSON.stringify(compatibilityContext.legacyItem(legacyNode))),
  {
    src: "/output/legacy-only.mp4",
    name: "legacy-only.mp4",
    mimeType: "video/quicktime",
    duration: 12.5,
    promptSummary: "legacy prompt",
    createdAt: "2026-08-01T00:00:00.000Z",
  },
  "Legacy-only canvas fields should migrate without losing media metadata",
);

compatibilityContext.syncLegacyFields(legacyNode, {
  src: "/output/current.mp4",
  name: "current.mp4",
  mimeType: "video/mp4",
  duration: 9.75,
  promptSummary: "current prompt",
  createdAt: "2026-08-12T00:00:00.000Z",
});
assert.equal(legacyNode.dataset.videoName, "current.mp4");
assert.equal(legacyNode.dataset.videoMimeType, "video/mp4");
assert.equal(legacyNode.dataset.videoDuration, "9.75");
assert.equal(legacyNode.dataset.mediaName, "current.mp4");
assert.equal(legacyNode.dataset.mediaMimeType, "video/mp4");
assert.equal(legacyNode.dataset.mediaDuration, "9.75");

const serializedVideo = JSON.parse(JSON.stringify(compatibilityContext.serialize(legacyNode)));
assert.equal(serializedVideo.videoActiveId, "history-a");
assert.equal(serializedVideo.videoHistory.length, 1);
assert.equal(serializedVideo.videoName, "current.mp4");
assert.equal(serializedVideo.videoMimeType, "video/mp4");
assert.equal(serializedVideo.videoDuration, 9.75);

assert.deepEqual(
  JSON.parse(JSON.stringify(compatibilityContext.renderOptions({
    videoHistory: [{ id: "saved", src: "/output/saved.mp4" }],
    videoActiveId: "saved",
    videoSrc: "/output/legacy.mp4",
    videoName: "legacy-name.mp4",
    videoMimeType: "video/webm",
    videoDuration: 7,
  }))),
  {
    videoHistory: [{ id: "saved", src: "/output/saved.mp4" }],
    activeVideoId: "saved",
    src: "/output/legacy.mp4",
    name: "legacy-name.mp4",
    mimeType: "video/webm",
    duration: 7,
    promptSummary: "",
    createdAt: "",
  },
  "Restore and paste should use one tested history/legacy adapter",
);

console.log("Canvas video history checks passed");
