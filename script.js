const CHAT_API_URL = "/api/chat";
const CHAT_MODELS_API_URL = "/api/models";
const VISION_MODELS_API_URL = "/api/vision-models";
const IMAGE_API_URL = "/api/images";
const IMAGE_JOBS_API_URL = "/api/image-jobs";
const CANVAS_IMAGE_JOB_POLL_MS = 1500;
const CANVAS_IMAGE_JOB_ACTIVE_STATES = new Set(["queued", "submitting", "running"]);
const IMAGE_MODELS_API_URL = "/api/image-models";
const IMAGE_UPLOAD_API_URL = "/api/upload-image";
const MEDIA_UPLOAD_API_URL = "/api/upload-media";
const MEDIA_CHUNK_UPLOAD_API_URL = "/api/upload-media/chunk";
const MINIMAX_H3_VIDEO_API_URL = "/api/minimax-h3-video";
const MINIMAX_H3_ASPECT_RATIOS = Object.freeze({
  "1:1": [1, 1],
  "2:3": [2, 3],
  "3:2": [3, 2],
  "3:4": [3, 4],
  "4:3": [4, 3],
  "9:16": [9, 16],
  "16:9": [16, 9],
  "21:9": [21, 9],
});
const UPSCALE_API_URL = "/api/upscale";
const UPSCALE2_API_URL = "/api/upscale2";
const SHOE_SWAP_API_URL = "/api/shoe-swap";
const OUTPAINT_API_URL = "/api/outpaint";
const RUNNINGHUB_OUTPAINT_API_URL = "/api/runninghub-outpaint";
const FLUX2_KLEIN_EDIT_API_URL = "/api/flux2-klein-edit";
const QWEN_EDIT_ANGLE_API_URL = "/api/qwen-edit-angle";
const IMAGE_CHUNK_UPLOAD_API_URL = "/api/upload-image/chunk";
const UPSCALE_STATUS_API_URL = "/api/upscale/status";
const CHAT_HISTORY_API_URL = "/api/history/chat";
const IMAGE_HISTORY_API_URL = "/api/history/images";
const CANVAS_BOARDS_API_URL = "/api/canvas/boards";
const ONLINE_API_URL = "/api/online";
const SETTINGS_API_URL = "/api/settings";
const SETTINGS_PROVIDER_MODELS_API_URL = "/api/settings/providers/models";
const SETTINGS_PROVIDER_KEY_API_URL = "/api/settings/providers/key";
const SETTINGS_PROVIDER_RUNTIME_API_URL = "/api/settings/providers/runtime";
const SETTINGS_PROVIDER_AGENT_VERIFY_API_URL = "/api/settings/providers/agent-verify";
const SETTINGS_PROVIDER_MONITORING_API_URL = "/api/settings/providers/monitoring";
const SETTINGS_AGENT_CANDIDATES_API_URL = "/api/settings/agent-candidates";
const CanvasAgentVerification = window.CanvasAgentVerification;
const LEGACY_CHAT_HISTORY_KEY = "ai-chat-history";
const LEGACY_IMAGE_HISTORY_KEY = "ai-image-history";
const HISTORY_MIGRATION_KEY = "ai-shared-history-migrated";
const THEME_STORAGE_KEY = "ai-theme-mode";
const PALETTE_STORAGE_KEY = "ai-color-palette";
const ONLINE_CLIENT_STORAGE_KEY = "ai-online-client-id";
const RAIL_PIN_STORAGE_KEY = "ai-rail-pinned";
const CHAT_WEB_SEARCH_STORAGE_KEY = "ai-chat-web-search";
const COLOR_PALETTES = [
  { id: "yellow-black", label: "\u9ec4\u9ed1\u5de5\u4f5c\u53f0", description: "\u9ad8\u5bf9\u6bd4\u9ec4\u8272\u5f3a\u8c03\uff0c\u9002\u5408\u9ed1\u91d1\u6548\u7387\u611f", colors: ["#ffd100", "#202020", "#f4f4f2"] },
  { id: "red-blue", label: "\u7ea2\u84dd\u79d1\u6280", description: "\u7ea2\u8272\u64cd\u4f5c\u611f + \u6df1\u84dd\u7ed3\u6784\uff0c\u5207\u6362\u540e\u4e3b\u4f53\u660e\u663e\u53d8\u51b7", colors: ["#df0615", "#ffffff", "#004098"] },
  { id: "mustard-blue", label: "\u8292\u679c\u84dd\u7070", description: "\u6696\u9ec4\u9ad8\u4eae + \u84dd\u7070\u754c\u9762\uff0c\u66f4\u67d4\u548c\u4e13\u4e1a", colors: ["#ffb800", "#123f86", "#e5e8ef"] },
];

ensureCanvasMarkup();
ensureSettingsMarkup();
initializeCanvasFirstShell();
window.lucide?.createIcons({
  attrs: {
    "aria-hidden": "true",
    "stroke-width": 1.8,
  },
});

const tabs = document.querySelectorAll(".nav-item");
const views = document.querySelectorAll("[data-view]");
const themeOptions = document.querySelectorAll("[data-theme-choice]");
const railToggle = document.querySelector("#railToggle");

const chatModelInput = document.querySelector("#chatModel");
const messagesEl = document.querySelector("#messages");
const chatPromptInput = document.querySelector("#chatPrompt");
const chatStatusText = document.querySelector("#chatStatus");
const sendButton = document.querySelector("#sendButton");
const attachButton = document.querySelector("#attachButton");
const webSearchButton = document.querySelector("#webSearchButton");
const chatFileInput = document.querySelector("#chatFileInput");
const chatAttachmentsEl = document.querySelector("#chatAttachments");
const upscaleForm = document.querySelector("#upscaleForm");
const upscaleDrop = document.querySelector("#upscaleDrop");
const upscaleFileInput = document.querySelector("#upscaleFileInput");
const upscaleInputPreview = document.querySelector("#upscaleInputPreview");
const upscaleResolutionInput = document.querySelector("#upscaleResolution");
const upscaleButton = document.querySelector("#upscaleButton");
const upscaleStatusText = document.querySelector("#upscaleStatus");
const upscaleProgress = document.querySelector("#upscaleProgress");
const upscaleProgressBar = document.querySelector("#upscaleProgressBar");
const upscaleStage = document.querySelector("#upscaleStage");
const upscale2Form = document.querySelector("#upscale2Form");
const upscale2Drop = document.querySelector("#upscale2Drop");
const upscale2FileInput = document.querySelector("#upscale2FileInput");
const upscale2InputPreview = document.querySelector("#upscale2InputPreview");
const upscale2Button = document.querySelector("#upscale2Button");
const upscale2ResolutionInput = document.querySelector("#upscale2Resolution");
const upscale2StatusText = document.querySelector("#upscale2Status");
const upscale2Progress = document.querySelector("#upscale2Progress");
const upscale2ProgressBar = document.querySelector("#upscale2ProgressBar");
const upscale2Stage = document.querySelector("#upscale2Stage");
const shoeSwapForm = document.querySelector("#shoeSwapForm");
const shoeSwapPersonDrop = document.querySelector("#shoeSwapPersonDrop");
const shoeSwapPersonInput = document.querySelector("#shoeSwapPersonInput");
const shoeSwapPersonPreview = document.querySelector("#shoeSwapPersonPreview");
const shoeSwapShoeDrop = document.querySelector("#shoeSwapShoeDrop");
const shoeSwapShoeInput = document.querySelector("#shoeSwapShoeInput");
const shoeSwapShoePreview = document.querySelector("#shoeSwapShoePreview");
const shoeSwapButton = document.querySelector("#shoeSwapButton");
const shoeSwapStatusText = document.querySelector("#shoeSwapStatus");
const shoeSwapProgress = document.querySelector("#shoeSwapProgress");
const shoeSwapProgressBar = document.querySelector("#shoeSwapProgressBar");
const shoeSwapStage = document.querySelector("#shoeSwapStage");
const outpaintForm = document.querySelector("#outpaintForm");
const outpaintDrop = document.querySelector("#outpaintDrop");
const outpaintFileInput = document.querySelector("#outpaintFileInput");
const outpaintInputPreview = document.querySelector("#outpaintInputPreview");
const outpaintDirectionInput = document.querySelector("#outpaintDirection");
const outpaintAmountInput = document.querySelector("#outpaintAmount");
const outpaintButton = document.querySelector("#outpaintButton");
const outpaintStatusText = document.querySelector("#outpaintStatus");
const outpaintProgress = document.querySelector("#outpaintProgress");
const outpaintProgressBar = document.querySelector("#outpaintProgressBar");
const outpaintStage = document.querySelector("#outpaintStage");
const outpaintEditorBlock = document.querySelector("#outpaintEditorBlock");
const outpaintEditor = document.querySelector("#outpaintEditor");
const outpaintFrame = document.querySelector("#outpaintFrame");
const outpaintEditorImage = document.querySelector("#outpaintEditorImage");
const outpaintPaddingReadout = document.querySelector("#outpaintPaddingReadout");
const outpaint2Form = document.querySelector("#outpaint2Form");
const outpaint2Drop = document.querySelector("#outpaint2Drop");
const outpaint2FileInput = document.querySelector("#outpaint2FileInput");
const outpaint2InputPreview = document.querySelector("#outpaint2InputPreview");
const outpaint2Button = document.querySelector("#outpaint2Button");
const outpaint2StatusText = document.querySelector("#outpaint2Status");
const outpaint2Progress = document.querySelector("#outpaint2Progress");
const outpaint2ProgressBar = document.querySelector("#outpaint2ProgressBar");
const outpaint2Stage = document.querySelector("#outpaint2Stage");
const outpaint2EditorBlock = document.querySelector("#outpaint2EditorBlock");
const outpaint2Frame = document.querySelector("#outpaint2Frame");
const outpaint2EditorImage = document.querySelector("#outpaint2EditorImage");
const outpaint2PaddingReadout = document.querySelector("#outpaint2PaddingReadout");

const imageModelInput = document.querySelector("#imageModel");
const imageSizeInput = document.querySelector("#imageSize");
const imageResolutionInput = document.querySelector("#imageResolution");
const imageMidjourneyOptions = document.querySelector("#imageMidjourneyOptions");
const imageCountInput = document.querySelector("#imageCount");
const rememberImageInput = document.querySelector("#rememberImage");
const imagePromptInput = document.querySelector("#imagePrompt");
const imageStage = document.querySelector("#imageStage");
const imageStatusText = document.querySelector("#imageStatus");
const generateButton = document.querySelector("#generateButton");
const referenceFileInput = document.querySelector("#referenceFileInput");
const referenceSlots = document.querySelectorAll(".reference-slot");
const imageHistoryEl = document.querySelector("#imageHistory");
const imageHistoryPanelEl = imageHistoryEl.closest(".history-panel");
const clearImageHistoryButton = document.querySelector("#clearImageHistory");
const imageHistorySelectionBar = document.querySelector("#imageHistorySelectionBar");
const imageHistorySelectionCount = document.querySelector("#imageHistorySelectionCount");
const selectAllImageHistoryButton = document.querySelector("#selectAllImageHistory");
const imageHistoryDeleteBar = document.querySelector("#imageHistoryDeleteBar");
const deleteSelectedImageHistory = document.querySelector("#deleteSelectedImageHistory");
const imageHistoryDeleteConfirm = document.querySelector("#imageHistoryDeleteConfirm");
const imageHistoryDeletePrompt = document.querySelector("#imageHistoryDeletePrompt");
const cancelDeleteSelectedImageHistory = document.querySelector("#cancelDeleteSelectedImageHistory");
const confirmDeleteSelectedImageHistory = document.querySelector("#confirmDeleteSelectedImageHistory");
const recordsHistoryEl = document.querySelector("#recordsHistory");
const recordsCountEl = document.querySelector("#recordsCount");
const chatHistoryEl = document.querySelector("#chatHistory");
const chatHistoryPanelEl = chatHistoryEl.closest(".chat-history-panel");
const clearChatHistoryButton = document.querySelector("#clearChatHistory");
const chatHistorySelectionBar = document.querySelector("#chatHistorySelectionBar");
const chatHistorySelectionCount = document.querySelector("#chatHistorySelectionCount");
const selectAllChatHistoryButton = document.querySelector("#selectAllChatHistory");
const chatHistoryDeleteBar = document.querySelector("#chatHistoryDeleteBar");
const deleteSelectedChatHistory = document.querySelector("#deleteSelectedChatHistory");
const chatHistoryDeleteConfirm = document.querySelector("#chatHistoryDeleteConfirm");
const chatHistoryDeletePrompt = document.querySelector("#chatHistoryDeletePrompt");
const cancelDeleteSelectedChatHistory = document.querySelector("#cancelDeleteSelectedChatHistory");
const confirmDeleteSelectedChatHistory = document.querySelector("#confirmDeleteSelectedChatHistory");
const lightbox = document.querySelector("#lightbox");
const lightboxImage = document.querySelector("#lightboxImage");
const lightboxDownload = document.querySelector("#lightboxDownload");
const lightboxClose = document.querySelector("#lightboxClose");
const lightboxZoom = document.querySelector("#lightboxZoom");

const IMAGE_STORAGE_KEY = "ai-image-preferences";
const MODEL_DISPLAY_NAMES = {
  "gemini-3.1-flash-image-preview": "nano-banana-2",
  "nano-banana-pro": "nano-banana-pro",
  "gpt-image-2-ainb": "gpt-image-2 · ainb",
  "gpt-image-2-clse": "gpt-image-2 · clse",
  "gpt-image-2-apimart": "gpt-image-2 · apimart",
  "midjourney": "Midjourney",
  "gpt-image-2-vip-grsai": "gpt-image-2-vip · grsai",
  "gpt-image-2-grsai": "gpt-image-2 · grsai",
  "nano-banana-pro-grsai": "nano-banana-pro · grsai",
  "nano-banana-2-grsai": "nano-banana-2 · grsai",
};
const DYNAMIC_MODEL_DISPLAY_NAMES = {};
const IMAGE_MODEL_RESOLUTIONS = {};
const IMAGE_MODEL_PLATFORMS = {};
const IMAGE_MODEL_FAMILIES = {};
const DYNAMIC_IMAGE_MODEL_PRICES = {};
const IMAGE_PLATFORM_LABELS = {
  openai: "OpenAI image",
  google: "Google nano-banana",
};
const GOOGLE_IMAGE_RATIOS_STANDARD = [
  "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9",
].map((ratio) => ({ value: ratio, label: ratio }));
const GOOGLE_IMAGE_RATIOS_FLASH_31 = [
  "1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9",
].map((ratio) => ({ value: ratio, label: ratio }));
const GPT_IMAGE2_IMAGE_RATIOS = [
  { value: "auto", label: "Auto" },
  ...["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"].map((ratio) => ({ value: ratio, label: ratio })),
];
const GPT_IMAGE2_MIN_PIXELS = 655360;
const GPT_IMAGE2_MAX_PIXELS = 8294400;
const MIDJOURNEY_STANDARD_VERSIONS = ["8.2", "8.1", "7", "6.1", "5.2", "5.1"];
const MIDJOURNEY_NIJI_VERSIONS = ["7", "6"];
const MIDJOURNEY_DEFAULT_OPTIONS = { version: "7", mode: "standard", speed: "fast", quality: "sd", style: "raw", stylize: 100 };
const MIDJOURNEY_IMAGE_RATIOS = [
  "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9",
].map((ratio) => ({ value: ratio, label: ratio }));
const GPT_IMAGE2_MAX_EDGE = 3840;
const IMAGE_SIZE_PRESETS = {
  openai: [
    { value: "auto", label: "Auto" },
    { value: "1024x1024", label: "1:1", level: "1" },
    { value: "1536x1024", label: "3:2", level: "1" },
    { value: "1024x1536", label: "2:3", level: "1" },
    { value: "2048x2048", label: "2K 1:1", level: "2" },
    { value: "2048x1152", label: "2K 16:9", level: "2" },
    { value: "1152x2048", label: "2K 9:16", level: "2" },
    { value: "3840x2160", label: "4K 16:9", level: "4" },
    { value: "2160x3840", label: "4K 9:16", level: "4" },
    { value: "custom", label: "自定义尺寸..." },
  ],
  google: GOOGLE_IMAGE_RATIOS_STANDARD,
};
const IMAGE_MODEL_PRICES = {
  "gemini-3.1-flash-image-preview": "0.27",
  "nano-banana-pro": "0.27",
  "gpt-image-2": "0.054",
  "gpt-image-2-ainb": "0.05",
  "gpt-image-2-clse": "0.1",
  "gpt-image-2-vip-grsai": "0.065~0.13",
  "gpt-image-2-grsai": "0.03~0.06",
  "nano-banana-pro-grsai": "0.09~0.18",
  "nano-banana-2-grsai": "0.06~0.12",
  "gpt-image-1": "0.081",
};
const APIMART_IMAGE_MODEL_PRICES = {
  1: "$0.006",
  2: "$0.012",
  4: "$0.018",
};
const CANVAS_LLM_MODELS = ["gpt-5.2-pro", "gpt-5.2", "gpt-4o", "gpt-4o-mini", "gemini-3-pro-preview"];
const CANVAS_LLM_PRESETS_STORAGE_KEY = "canvas-llm-prompt-presets";
const CANVAS_LLM_HIDDEN_PRESETS_STORAGE_KEY = "canvas-llm-hidden-prompt-presets";
const CANVAS_LLM_DELETE_CONFIRM_MS = 4500;
const CANVAS_LLM_DEFAULT_PRESETS = [
  {
    label: "反推画面",
    text: "请根据输入图片，提炼主体、场景、构图、光线、色彩、材质与风格，输出可直接用于生图的中文提示词。",
  },
  {
    label: "优化提示词",
    text: "请优化下面的提示词，保留核心意图，补充构图、光影、材质、风格与画面细节，输出一版更稳定的生图提示词。",
  },
  {
    label: "商品卖点",
    text: "请基于图片和输入信息，提炼产品卖点、使用场景、目标人群和视觉关键词，输出简洁有力的中文文案。",
  },
  {
    label: "风格分析",
    text: "请分析图片的视觉风格，包括构图、镜头、色彩、光影、材质、氛围和可复用的风格关键词。",
  },
  {
    label: "改图建议",
    text: "请针对这张图片提出具体可执行的改图建议，按优先级说明要改什么、为什么、如何描述给生图模型。",
  },
];
let visionModelOptions = [];
let canvasImageModelCandidates = [];
let canvasImageModelsLoadPromise = null;
const history = [];
const chatAttachments = [];
let chatLoadingMessage = null;
let chatWebSearchEnabled = localStorage.getItem(CHAT_WEB_SEARCH_STORAGE_KEY) === "true";
const previewState = {
  scale: 1,
  x: 0,
  y: 0,
  dragging: false,
  startX: 0,
  startY: 0,
  originX: 0,
  originY: 0,
  compare: null,
  gallery: null,
};
let currentConversationId = createId();
const referenceImages = [null, null, null];
let activeReferenceIndex = 0;
let imageHistoryManaging = false;
const selectedImageHistoryIds = new Set();
let imageHistoryDeleteConfirming = false;
let chatHistoryManaging = false;
const selectedChatHistoryIds = new Set();
let chatHistoryDeleteConfirming = false;
let upscaleImage = null;
let upscale2Image = null;
let shoeSwapPersonImage = null;
let shoeSwapShoeImage = null;
let outpaintImage = null;
let outpaintPadding = { left: 0, top: 0, right: 0, bottom: 0 };
let outpaintEditorScale = 1;
let outpaint2Image = null;
let outpaint2Padding = { left: 0, top: 0, right: 0, bottom: 0 };
let outpaint2EditorScale = 1;
let upscaleProgressTimer = null;
let upscale2ProgressTimer = null;
let shoeSwapProgressTimer = null;
let outpaintProgressTimer = null;
let outpaint2ProgressTimer = null;
const CANVAS_SCALE_MIN = 0.05;
const CANVAS_SCALE_MAX = 5;

function normalizeCanvasScale(value, fallback = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(CANVAS_SCALE_MIN, Math.min(CANVAS_SCALE_MAX, numeric));
}

const canvasState = {
  scale: 1,
  x: 0,
  y: 0,
  nextNode: 1,
  activeNode: null,
  menuPoint: null,
  imageContextNode: null,
  pendingConnection: null,
  tempConnection: null,
  connectMenu: null,
  connections: [],
  clipboard: null,
  selectedIds: new Set(),
  selectionFrameVisible: false,
  boards: [],
  trashedBoards: [],
  boardView: "active",
  boardSearchQuery: "",
  boardRenameId: null,
  activeBoardId: null,
  activeBoardTitle: "未命名画布",
  activeBoardCreatedAt: null,
  activeBoardRevision: 0,
  activeBoardPersisted: false,
  undoStack: [],
  redoStack: [],
  undoLimit: 80,
  saveTimer: null,
  autoSaveTimer: null,
  hasUnsavedChanges: false,
  isRestoring: false,
  boardOpening: false,
  isUndoing: false,
  draggedGalleryImage: null,
  galleryDragGhost: null,
  pendingDeleteAction: null,
  deleteUndoTimer: null,
  deleteUndoCountdownTimer: null,
  deleteUndoStackDepth: null,
};

const canvasPagedStore = new window.CanvasPagedStore({
  rules: window.CanvasVirtualizationRules,
  maxModels: 2400,
  maxEstimatedBytes: 96 * 1024 * 1024,
});
const canvasVirtualStore = canvasPagedStore;
const canvasViewportDataSource = new window.CanvasViewportDataSource({
  fetchImpl: window.fetch.bind(window),
  store: canvasPagedStore,
  endpointBase: CANVAS_BOARDS_API_URL,
  getBoardId: () => canvasState.activeBoardId,
  overscanFactor: 1.5,
  onStatus: updateCanvasViewportStatus,
});
const canvasMediaScheduler = new window.CanvasMediaScheduler({
  maxThumbnails: 6,
  maxOriginals: 2,
});
let canvasSceneLayer = null;
let canvasSceneRenderFrame = 0;
const canvasSceneTextureCache = new Map();
const canvasMediaTaskKeys = new WeakMap();
let canvasVirtualBoard = null;
let canvasVirtualRestoreContext = null;
const canvasVirtualizer = new window.CanvasVirtualizer({
  store: canvasVirtualStore,
  rules: window.CanvasVirtualizationRules,
  getViewport: () => {
    const viewport = document.querySelector("#infiniteCanvas");
    return {
      width: viewport?.clientWidth || 0,
      height: viewport?.clientHeight || 0,
      x: canvasState.x,
      y: canvasState.y,
      scale: canvasState.scale,
    };
  },
  mount: (id, level) => mountCanvasVirtualNode(id, level),
  unmount: (id, element) => unmountCanvasVirtualNode(id, element),
  replace: (id, element, fromLevel, toLevel) => replaceCanvasVirtualNode(
    id,
    element,
    fromLevel,
    toLevel,
  ),
  requestData: ({ mountRect, viewport }) => {
    if (canvasState.isRestoring || !canvasState.activeBoardPersisted) return;
    requestCanvasViewportPage({ ...mountRect, scale: viewport.scale }).catch(() => {});
  },
  afterFlush: () => {
    scheduleCanvasImageQualityUpdate();
    scheduleCanvasConnectionRender({ trailing: false });
    updateCanvasOrigin();
  },
});
window.canvasVirtualStore = canvasVirtualStore;
window.canvasPagedStore = canvasPagedStore;
window.canvasViewportDataSource = canvasViewportDataSource;
window.canvasVirtualizer = canvasVirtualizer;
window.canvasMediaScheduler = canvasMediaScheduler;

const canvasPersistedNodes = new Map();
const canvasPersistedConnections = new Map();
let canvasVisibleConnectionBaselineIds = new Set();
let canvasOperationFlushPromise = null;

function updateCanvasViewportStatus(status = {}) {
  if (status.state === "error") {
    setCanvasStatus(`画布内容加载失败：${status.error?.message || "请稍后重试"}`);
  } else if (status.progress?.phase) {
    const completed = Number(status.progress.completed || 0);
    const total = Number(status.progress.total || 0);
    setCanvasStatus(`正在优化旧画布 · ${status.progress.phase}${total ? ` ${completed}/${total}` : ""}`);
  }
}

function getCanvasConnectionId(connection = {}) {
  const existing = String(connection.id || "").trim();
  if (existing) return existing;
  return `edge:${String(connection.from || "")}:${String(connection.to || "")}:${String(connection.toPort || "input")}`;
}

function normalizeVisibleCanvasConnection(connection) {
  return { ...connection, id: getCanvasConnectionId(connection) };
}

function syncVisibleCanvasConnections() {
  canvasState.connections = canvasPagedStore.getVisibleConnections().map(normalizeVisibleCanvasConnection);
  return canvasState.connections;
}

function getCanvasConnectionsForNode(nodeId) {
  return canvasPagedStore.getConnectionsForNode(String(nodeId || ""));
}

function rememberCanvasViewportBaseline(page = {}) {
  if (!page || page.mode !== "detail") return;
  (Array.isArray(page.nodes) ? page.nodes : []).forEach((node) => {
    canvasPersistedNodes.set(String(node.id), JSON.parse(JSON.stringify(node)));
  });
  canvasVisibleConnectionBaselineIds = new Set();
  (Array.isArray(page.connections) ? page.connections : []).forEach((item) => {
    const connection = normalizeVisibleCanvasConnection(item);
    canvasPersistedConnections.set(connection.id, JSON.parse(JSON.stringify(connection)));
    canvasVisibleConnectionBaselineIds.add(connection.id);
  });
  canvasState.activeBoardRevision = Number(page.boardRevision ?? canvasState.activeBoardRevision ?? 0);
  syncVisibleCanvasConnections();
}

function ensureCanvasSceneLayer() {
  if (canvasSceneLayer) return canvasSceneLayer;
  const canvas = document.querySelector("#canvasSceneLayer");
  if (!canvas) return null;
  canvasSceneLayer = new window.CanvasSceneLayer({
    canvas,
    devicePixelRatio: Math.min(2, window.devicePixelRatio || 1),
  });
  window.canvasSceneLayer = canvasSceneLayer;
  return canvasSceneLayer;
}

function scheduleCanvasSceneRender() {
  if (canvasSceneRenderFrame) return;
  canvasSceneRenderFrame = requestAnimationFrame(() => {
    canvasSceneRenderFrame = 0;
    renderCanvasSceneLayer();
  });
}

function resolveCanvasSceneTexture(source) {
  const key = String(source || "");
  if (!key) return null;
  const existing = canvasSceneTextureCache.get(key);
  if (existing?.state === "ready") return existing.image;
  if (existing) return null;
  const entry = { state: "loading", image: null };
  canvasSceneTextureCache.set(key, entry);
  window.imageResources?.requestThumbnail?.(key).then((item) => {
    const thumbnailUrl = String(item?.thumbnailUrl || "");
    if (!thumbnailUrl) {
      entry.state = "error";
      return;
    }
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      entry.state = "ready";
      entry.image = image;
      scheduleCanvasSceneRender();
    };
    image.onerror = () => { entry.state = "error"; };
    image.src = thumbnailUrl;
  }).catch(() => { entry.state = "error"; });
  if (canvasSceneTextureCache.size > 512) {
    const staleKey = canvasSceneTextureCache.keys().next().value;
    if (staleKey && staleKey !== key) canvasSceneTextureCache.delete(staleKey);
  }
  return null;
}

function renderCanvasSceneLayer() {
  const viewport = document.querySelector("#infiniteCanvas");
  const layer = ensureCanvasSceneLayer();
  const page = canvasPagedStore.scenePage;
  if (!viewport || !layer || !page || page.mode !== "scene") {
    layer?.clear();
    viewport?.classList.remove("has-scene-layer");
    return false;
  }
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  layer.resize(width, height);
  layer.render({
    visualNodes: page.visualNodes || [],
    visualConnections: page.visualConnections || [],
    texturedNodeIds: (page.texturedNodeIds || []).slice(0, 256),
    transform: {
      x: canvasState.x,
      y: canvasState.y,
      scale: Math.max(0.000001, Number(canvasState.scale) || 1),
    },
    resolveTexture: resolveCanvasSceneTexture,
  });
  viewport.classList.add("has-scene-layer");
  return true;
}

function reprojectCanvasSceneLayer() {
  const page = canvasPagedStore.scenePage;
  const layer = ensureCanvasSceneLayer();
  if (!layer || !page || page.mode !== "scene") return false;
  return layer.reproject({
    x: canvasState.x,
    y: canvasState.y,
    scale: Math.max(0.000001, Number(canvasState.scale) || 1),
  });
}

async function requestCanvasViewportPage(viewport) {
  const page = await canvasViewportDataSource.request(viewport);
  if (page?.mode) {
    rememberCanvasViewportBaseline(page);
    canvasVirtualBoard = {
      id: canvasState.activeBoardId,
      title: canvasState.activeBoardTitle,
      viewport: { x: canvasState.x, y: canvasState.y, scale: canvasState.scale },
    };
    const numericIds = (page.nodes || []).map((node) => Number(node.id)).filter(Number.isFinite);
    if (numericIds.length) canvasState.nextNode = Math.max(canvasState.nextNode, Math.max(...numericIds) + 1);
    canvasVirtualizer.schedule();
    scheduleCanvasConnectionRender();
    renderCanvasSceneLayer();
  }
  return page;
}

// Selection can be cleared during the initial blank-canvas boot before the
// later selection helpers are reached, so this guard must be initialized here.
let canvasSelectionChangeQueued = false;
let canvasLastDispatchedBoardId = null;

function blockCanvasBoardLoadingInteraction(event) {
  if (!canvasState.boardOpening) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}

document.addEventListener("keydown", blockCanvasBoardLoadingInteraction, true);

let canvasGridMenuState = null;
const canvasGridEditorWheelTimers = new Map();
let settingsState = null;
let savedSettingsSnapshot = null;
let activeSettingsTab = "api";
let activeSettingsProviderId = "";
let fetchedProviderModels = [];
let selectedFetchedProviderModels = new Set();
let fetchedProviderModelFilter = "all";
const providerRuntimeState = new Map();
const providerRuntimeRequestIds = new Map();
const providerRuntimeHistory = new Map();
const providerAgentVerificationState = new Map();
const agentAutoVerificationAttempted = new Set();
let agentAutoVerificationEpoch = 0;
let agentAutoVerificationActiveEpoch = 0;
let agentAutoVerificationAbortController = null;
let providerRuntimeRequestSerial = 0;
let providerRuntimeTimer = 0;
let providerMonitoringState = { state: "idle", data: null, error: "" };
let providerMonitoringRange = "realtime";
let providerMonitoringTimer = 0;
let providerMonitoringRequestSerial = 0;
let agentRoutingCandidateState = { state: "idle", data: null, error: "" };
let agentRoutingCandidateRequestSerial = 0;
let canvasConnectionResizeFrame = 0;
let canvasConnectionRenderFrame = 0;
let canvasConnectionRenderTimer = 0;
const canvasConnectionElements = new Map();
let canvasConnectionSvg = null;
let canvasTempConnectionPath = null;
let canvasImageQualityFrame = 0;
let canvasDetailTimer = 0;
let canvasDetailReady = false;
let canvasTransformFrame = 0;
let canvasVirtualRefreshTimer = 0;
let canvasViewportSaveTimer = 0;
let chatModelPicker = null;
const canvasNodeResizeObserver = typeof ResizeObserver === "function"
  ? new ResizeObserver((entries) => {
    if (canvasConnectionResizeFrame) cancelAnimationFrame(canvasConnectionResizeFrame);
    canvasConnectionResizeFrame = requestAnimationFrame(() => {
      canvasConnectionResizeFrame = 0;
      for (const entry of entries) {
        entry.target.dataset.renderedWidth = String(Math.max(1, Math.ceil(entry.contentRect.width)));
        entry.target.dataset.renderedHeight = String(Math.max(1, Math.ceil(entry.contentRect.height)));
        if (canvasVirtualStore.has(entry.target.dataset.id)) {
          canvasVirtualStore.setGeometry(entry.target.dataset.id, {
            x: Number(entry.target.dataset.x || 0),
            y: Number(entry.target.dataset.y || 0),
            width: Math.max(1, Math.ceil(entry.contentRect.width)),
            height: Math.max(1, Math.ceil(entry.contentRect.height)),
          });
        }
        if (entry.target.classList.contains("canvas-node-gallery")) updateCanvasGalleryLayout(entry.target, { renderConnections: false });
      }
      renderCanvasConnections();
      scheduleCanvasImageQualityUpdate();
    });
  })
  : null;

initializeTheme();
initializeRail();
initializeOnlineStatus();
loadImageSettings();
initializeChatLayoutCopy();
initializeChatModelPicker();
updateChatWebSearchButton();
initializeCanvasBoard();
loadChatModels();
loadVisionModels();
loadImageModels();
initializeSharedHistory();
initializeSettingsCenter();

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const tool = tab.dataset.tool;
    setActiveTool(tab.classList.contains("active") ? "canvas" : tool);
    tab.blur();
  });
});

themeOptions.forEach((button) => {
  button.addEventListener("click", () => setThemeMode(button.dataset.themeChoice || "system"));
});

messagesEl?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-chat-suggestion]");
  if (!button) return;
  chatPromptInput.value = button.dataset.chatSuggestion || "";
  resizeChatPrompt();
  chatPromptInput.focus();
});

document.querySelector("#clearChat").addEventListener("click", () => {
  currentConversationId = createId();
  resetCurrentChat();
  clearChatAttachments();
  setChatStatus("已清空当前对话。");
});

document.querySelector("#newChat").addEventListener("click", () => {
  currentConversationId = createId();
  resetCurrentChat();
  setChatStatus("已开始新对话。");
});

document.querySelector("#clearImages").addEventListener("click", () => {
  imageStage.innerHTML = '<div class="empty-state"><span>图片预览</span></div>';
  setImageStatus("已清空图片结果。");
});

attachButton.addEventListener("click", () => chatFileInput.click());
webSearchButton?.addEventListener("click", () => {
  chatWebSearchEnabled = !chatWebSearchEnabled;
  localStorage.setItem(CHAT_WEB_SEARCH_STORAGE_KEY, String(chatWebSearchEnabled));
  updateChatWebSearchButton();
  setChatStatus(chatWebSearchEnabled ? "联网搜索已开启。" : "联网搜索已关闭。");
});

chatFileInput.addEventListener("change", async () => {
  const files = Array.from(chatFileInput.files || []);
  for (const file of files) {
    await addChatAttachment(file);
  }
  chatFileInput.value = "";
});

chatPromptInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    document.querySelector("#chatForm").requestSubmit();
  }
});

chatPromptInput.addEventListener("input", resizeChatPrompt);

function resetImageHistoryDeleteConfirmation() {
  imageHistoryDeleteConfirming = false;
  imageHistoryDeleteConfirm.hidden = true;
  deleteSelectedImageHistory.hidden = false;
}

function updateImageHistoryCardSelection(button) {
  const recordId = button.dataset.historyId || "";
  const selected = imageHistoryManaging && Boolean(recordId) && selectedImageHistoryIds.has(recordId);
  button.classList.toggle("selected", selected);
  if (imageHistoryManaging && recordId) {
    button.setAttribute("aria-pressed", String(selected));
  } else {
    button.removeAttribute("aria-pressed");
  }
}

function updateImageHistoryManagementUi() {
  const count = selectedImageHistoryIds.size;
  const selectableCards = Array.from(imageHistoryEl.querySelectorAll("[data-history-id]"));
  const allSelected = selectableCards.length > 0
    && selectableCards.every((card) => selectedImageHistoryIds.has(card.dataset.historyId));

  if (count === 0) imageHistoryDeleteConfirming = false;
  imageHistoryPanelEl.classList.toggle("is-managing", imageHistoryManaging);
  imageHistoryEl.classList.toggle("is-managing", imageHistoryManaging);
  clearImageHistoryButton.textContent = imageHistoryManaging ? "取消" : "管理";
  clearImageHistoryButton.setAttribute("aria-pressed", String(imageHistoryManaging));
  imageHistorySelectionBar.hidden = !imageHistoryManaging;
  imageHistoryDeleteBar.hidden = !imageHistoryManaging;
  imageHistorySelectionCount.textContent = `已选 ${count} 张`;
  selectAllImageHistoryButton.textContent = allSelected ? "取消全选" : "全选";
  selectAllImageHistoryButton.disabled = selectableCards.length === 0;
  deleteSelectedImageHistory.textContent = `删除所选（${count}）`;
  deleteSelectedImageHistory.disabled = count === 0;
  deleteSelectedImageHistory.hidden = imageHistoryDeleteConfirming;
  imageHistoryDeletePrompt.textContent = `确定删除 ${count} 张？`;
  imageHistoryDeleteConfirm.hidden = !imageHistoryDeleteConfirming;
}

function setImageHistoryManaging(nextValue) {
  imageHistoryManaging = Boolean(nextValue);
  selectedImageHistoryIds.clear();
  resetImageHistoryDeleteConfirmation();
  updateImageHistoryManagementUi();
}

clearImageHistoryButton.addEventListener("click", async () => {
  setImageHistoryManaging(!imageHistoryManaging);
  await renderImageHistory();
});

selectAllImageHistoryButton.addEventListener("click", () => {
  const cards = Array.from(imageHistoryEl.querySelectorAll("[data-history-id]"));
  const allSelected = cards.length > 0
    && cards.every((card) => selectedImageHistoryIds.has(card.dataset.historyId));
  selectedImageHistoryIds.clear();
  if (!allSelected) {
    cards.forEach((card) => selectedImageHistoryIds.add(card.dataset.historyId));
  }
  resetImageHistoryDeleteConfirmation();
  cards.forEach(updateImageHistoryCardSelection);
  updateImageHistoryManagementUi();
});

deleteSelectedImageHistory.addEventListener("click", () => {
  if (!selectedImageHistoryIds.size) return;
  imageHistoryDeleteConfirming = true;
  updateImageHistoryManagementUi();
  confirmDeleteSelectedImageHistory.focus();
});

cancelDeleteSelectedImageHistory.addEventListener("click", () => {
  resetImageHistoryDeleteConfirmation();
  updateImageHistoryManagementUi();
  deleteSelectedImageHistory.focus();
});

confirmDeleteSelectedImageHistory.addEventListener("click", async () => {
  const ids = Array.from(selectedImageHistoryIds);
  if (!ids.length) return;

  confirmDeleteSelectedImageHistory.disabled = true;
  cancelDeleteSelectedImageHistory.disabled = true;
  clearImageHistoryButton.disabled = true;
  try {
    for (const id of ids) {
      await deleteServerHistoryRecord(IMAGE_HISTORY_API_URL, id);
    }
    setImageStatus(`已删除 ${ids.length} 张历史图片。`);
    setImageHistoryManaging(false);
    await Promise.all([renderImageHistory(), renderUnifiedHistory()]);
  } catch (error) {
    setImageStatus(`删除历史图片失败：${error.message}`);
    resetImageHistoryDeleteConfirmation();
    await renderImageHistory();
    updateImageHistoryManagementUi();
  } finally {
    confirmDeleteSelectedImageHistory.disabled = false;
    cancelDeleteSelectedImageHistory.disabled = false;
    clearImageHistoryButton.disabled = false;
  }
});

updateImageHistoryManagementUi();

document.querySelector("#refreshRecords")?.addEventListener("click", renderUnifiedHistory);

function resetChatHistoryDeleteConfirmation() {
  chatHistoryDeleteConfirming = false;
  chatHistoryDeleteConfirm.hidden = true;
  deleteSelectedChatHistory.hidden = false;
}

function updateChatHistoryRowSelection(row, button) {
  const recordId = row.dataset.historyId || "";
  const selected = chatHistoryManaging && Boolean(recordId) && selectedChatHistoryIds.has(recordId);
  row.classList.toggle("selected", selected);
  if (chatHistoryManaging && recordId) {
    button.setAttribute("aria-pressed", String(selected));
  } else {
    button.removeAttribute("aria-pressed");
  }
}

function updateChatHistoryManagementUi() {
  const count = selectedChatHistoryIds.size;
  const selectableRows = Array.from(chatHistoryEl.querySelectorAll("[data-history-id]"));
  const allSelected = selectableRows.length > 0
    && selectableRows.every((row) => selectedChatHistoryIds.has(row.dataset.historyId));

  if (count === 0) chatHistoryDeleteConfirming = false;
  chatHistoryPanelEl.classList.toggle("is-managing", chatHistoryManaging);
  chatHistoryEl.classList.toggle("is-managing", chatHistoryManaging);
  clearChatHistoryButton.textContent = chatHistoryManaging ? "取消" : "管理";
  clearChatHistoryButton.setAttribute("aria-pressed", String(chatHistoryManaging));
  chatHistorySelectionBar.hidden = !chatHistoryManaging;
  chatHistoryDeleteBar.hidden = !chatHistoryManaging;
  chatHistorySelectionCount.textContent = `已选 ${count} 条`;
  selectAllChatHistoryButton.textContent = allSelected ? "取消全选" : "全选";
  selectAllChatHistoryButton.disabled = selectableRows.length === 0;
  deleteSelectedChatHistory.textContent = `删除所选（${count}）`;
  deleteSelectedChatHistory.disabled = count === 0;
  deleteSelectedChatHistory.hidden = chatHistoryDeleteConfirming;
  chatHistoryDeletePrompt.textContent = `确定删除 ${count} 条？`;
  chatHistoryDeleteConfirm.hidden = !chatHistoryDeleteConfirming;
}

function setChatHistoryManaging(nextValue) {
  chatHistoryManaging = Boolean(nextValue);
  selectedChatHistoryIds.clear();
  resetChatHistoryDeleteConfirmation();
  updateChatHistoryManagementUi();
}

clearChatHistoryButton.addEventListener("click", async () => {
  setChatHistoryManaging(!chatHistoryManaging);
  await renderChatHistory();
});

selectAllChatHistoryButton.addEventListener("click", () => {
  const rows = Array.from(chatHistoryEl.querySelectorAll("[data-history-id]"));
  const allSelected = rows.length > 0
    && rows.every((row) => selectedChatHistoryIds.has(row.dataset.historyId));
  selectedChatHistoryIds.clear();
  if (!allSelected) rows.forEach((row) => selectedChatHistoryIds.add(row.dataset.historyId));
  resetChatHistoryDeleteConfirmation();
  rows.forEach((row) => updateChatHistoryRowSelection(row, row.querySelector(".history-chat")));
  updateChatHistoryManagementUi();
});

deleteSelectedChatHistory.addEventListener("click", () => {
  if (!selectedChatHistoryIds.size) return;
  chatHistoryDeleteConfirming = true;
  updateChatHistoryManagementUi();
  confirmDeleteSelectedChatHistory.focus();
});

cancelDeleteSelectedChatHistory.addEventListener("click", () => {
  resetChatHistoryDeleteConfirmation();
  updateChatHistoryManagementUi();
  deleteSelectedChatHistory.focus();
});

confirmDeleteSelectedChatHistory.addEventListener("click", async () => {
  const ids = Array.from(selectedChatHistoryIds);
  if (!ids.length) return;

  let deletedCurrentConversation = false;
  confirmDeleteSelectedChatHistory.disabled = true;
  cancelDeleteSelectedChatHistory.disabled = true;
  clearChatHistoryButton.disabled = true;
  try {
    for (const id of ids) {
      await deleteServerHistoryRecord(CHAT_HISTORY_API_URL, id);
      if (id === currentConversationId) deletedCurrentConversation = true;
    }
    if (deletedCurrentConversation) {
      currentConversationId = createId();
      resetCurrentChat();
    }
    setChatStatus(`已删除 ${ids.length} 条对话。`);
    setChatHistoryManaging(false);
    await renderChatHistory();
  } catch (error) {
    if (deletedCurrentConversation) {
      currentConversationId = createId();
      resetCurrentChat();
    }
    setChatStatus(`删除对话失败：${error.message}`);
    resetChatHistoryDeleteConfirmation();
    await renderChatHistory();
    updateChatHistoryManagementUi();
  } finally {
    confirmDeleteSelectedChatHistory.disabled = false;
    cancelDeleteSelectedChatHistory.disabled = false;
    clearChatHistoryButton.disabled = false;
  }
});

updateChatHistoryManagementUi();

referenceSlots.forEach((slot) => {
  slot.addEventListener("click", () => {
    activeReferenceIndex = Number(slot.dataset.refIndex);
    referenceFileInput.click();
  });

  slot.addEventListener("dragover", (event) => {
    event.preventDefault();
    slot.classList.add("drag-over");
  });

  slot.addEventListener("dragleave", () => {
    slot.classList.remove("drag-over");
  });

  slot.addEventListener("drop", async (event) => {
    event.preventDefault();
    slot.classList.remove("drag-over");
    const file = event.dataTransfer.files?.[0];
    if (file) await setReferenceImage(Number(slot.dataset.refIndex), file);
  });
});

referenceFileInput.addEventListener("change", async () => {
  const file = referenceFileInput.files?.[0];
  if (file) await setReferenceImage(activeReferenceIndex, file);
  referenceFileInput.value = "";
});

upscaleDrop.addEventListener("click", () => upscaleFileInput.click());
upscaleDrop.addEventListener("dragover", (event) => {
  event.preventDefault();
  upscaleDrop.classList.add("drag-over");
});
upscaleDrop.addEventListener("dragleave", () => {
  upscaleDrop.classList.remove("drag-over");
});
upscaleDrop.addEventListener("drop", async (event) => {
  event.preventDefault();
  upscaleDrop.classList.remove("drag-over");
  const file = event.dataTransfer.files?.[0];
  if (file) await setUpscaleImage(file);
});
upscaleFileInput.addEventListener("change", async () => {
  const file = upscaleFileInput.files?.[0];
  if (file) await setUpscaleImage(file);
  upscaleFileInput.value = "";
});
document.querySelector("#clearUpscale").addEventListener("click", () => {
  upscaleStage.innerHTML = '<div class="empty-state"><span>放大结果</span><p>ComfyUI 完成后，高清图片会显示在这里并保存到本地 output 文件夹。</p></div>';
  setUpscaleStatus("已清空放大结果。");
});

upscale2Drop.addEventListener("click", () => upscale2FileInput.click());
upscale2Drop.addEventListener("dragover", (event) => {
  event.preventDefault();
  upscale2Drop.classList.add("drag-over");
});
upscale2Drop.addEventListener("dragleave", () => {
  upscale2Drop.classList.remove("drag-over");
});
upscale2Drop.addEventListener("drop", async (event) => {
  event.preventDefault();
  upscale2Drop.classList.remove("drag-over");
  const file = event.dataTransfer.files?.[0];
  if (file) await setUpscale2Image(file);
});
upscale2FileInput.addEventListener("change", async () => {
  const file = upscale2FileInput.files?.[0];
  if (file) await setUpscale2Image(file);
  upscale2FileInput.value = "";
});
document.querySelector("#clearUpscale2").addEventListener("click", () => {
  upscale2Stage.innerHTML = '<div class="empty-state"><span>放大结果</span><p>SeedVR2 工作流完成后，高清图片会显示在这里并保存到本地 output 文件夹。</p></div>';
  setUpscale2Status("已清空放大结果。");
});

bindShoeSwapDrop(shoeSwapPersonDrop, shoeSwapPersonInput, setShoeSwapPersonImage);
bindShoeSwapDrop(shoeSwapShoeDrop, shoeSwapShoeInput, setShoeSwapShoeImage);
document.querySelectorAll(".shoe-example").forEach((button) => {
  button.addEventListener("click", async () => {
    await setShoeSwapShoeExample(button.dataset.shoeExample, button.dataset.shoeName || "鞋子示例.png");
    document.querySelectorAll(".shoe-example").forEach((item) => item.classList.toggle("is-selected", item === button));
  });
});
document.querySelector("#clearShoeSwap").addEventListener("click", () => {
  shoeSwapStage.innerHTML = '<div class="empty-state"><span>换鞋结果</span><p>ComfyUI 完成后，换鞋图片会显示在这里并保存到本地 output 文件夹。</p></div>';
  setShoeSwapStatus("已清空换鞋结果。");
});

outpaintDrop.addEventListener("click", () => outpaintFileInput.click());
outpaintDrop.addEventListener("dragover", (event) => {
  event.preventDefault();
  outpaintDrop.classList.add("drag-over");
});
outpaintDrop.addEventListener("dragleave", () => {
  outpaintDrop.classList.remove("drag-over");
});
outpaintDrop.addEventListener("drop", async (event) => {
  event.preventDefault();
  outpaintDrop.classList.remove("drag-over");
  const file = event.dataTransfer.files?.[0];
  if (file) await setOutpaintImage(file);
});
outpaintFileInput.addEventListener("change", async () => {
  const file = outpaintFileInput.files?.[0];
  if (file) await setOutpaintImage(file);
  outpaintFileInput.value = "";
});
outpaintDirectionInput?.addEventListener("change", applyOutpaintPreset);
outpaintAmountInput?.addEventListener("change", applyOutpaintPreset);
outpaintFrame?.addEventListener("pointerdown", handleOutpaintHandlePointerDown);
document.querySelector("#clearOutpaint").addEventListener("click", () => {
  outpaintStage.innerHTML = '<div class="empty-state"><span>扩图结果</span><p>ComfyUI 完成后，扩图图片会显示在这里并保存到本地 output 文件夹。</p></div>';
  setOutpaintStatus("已清空扩图结果。");
});
outpaint2Drop?.addEventListener("click", () => outpaint2FileInput.click());
outpaint2Drop?.addEventListener("dragover", (event) => {
  event.preventDefault();
  outpaint2Drop.classList.add("drag-over");
});
outpaint2Drop?.addEventListener("dragleave", () => {
  outpaint2Drop.classList.remove("drag-over");
});
outpaint2Drop?.addEventListener("drop", async (event) => {
  event.preventDefault();
  outpaint2Drop.classList.remove("drag-over");
  const file = event.dataTransfer.files?.[0];
  if (file) await setOutpaint2Image(file);
});
outpaint2FileInput?.addEventListener("change", async () => {
  const file = outpaint2FileInput.files?.[0];
  if (file) await setOutpaint2Image(file);
  outpaint2FileInput.value = "";
});
outpaint2Frame?.addEventListener("pointerdown", handleOutpaint2HandlePointerDown);
document.querySelector("#clearOutpaint2")?.addEventListener("click", () => {
  outpaint2Stage.innerHTML = '<div class="empty-state"><span>扩图2结果</span><p>用白色区域提示 image2 填充场景，完成后会显示在这里。</p></div>';
  setOutpaint2Status("已清空扩图2结果。");
});

lightboxClose.addEventListener("click", closePreview);
lightbox.addEventListener("click", (event) => {
  if (handlePreviewGalleryEdgeClick(event)) return;
  if (event.target === lightbox) closePreview();
});
lightbox.addEventListener("wheel", handlePreviewWheel, { passive: false });
lightbox.addEventListener("auxclick", (event) => {
  if (event.button === 1) event.preventDefault();
});
lightboxImage.addEventListener("pointerdown", startPreviewPan);
lightbox.addEventListener("pointerdown", (event) => {
  if (event.target.closest?.(".lightbox-compare")) startPreviewPan(event);
});
lightbox.addEventListener("dblclick", (event) => {
  if (!event.target.closest?.(".lightbox-compare")) return;
  togglePreviewZoom();
});
lightboxImage.addEventListener("dblclick", () => {
  togglePreviewZoom();
});
document.addEventListener("keydown", (event) => {
  if (lightbox.hidden) return;
  if (event.key === "Escape") {
    closePreview();
    return;
  }
  if (event.key === "ArrowLeft") {
    showPreviewGalleryImage(-1);
    event.preventDefault();
    return;
  }
  if (event.key === "ArrowRight") {
    showPreviewGalleryImage(1);
    event.preventDefault();
  }
});
lightboxDownload.addEventListener("click", (event) => {
  event.preventDefault();
  downloadAsset(lightboxDownload.href, "preview.png", event.currentTarget);
});

document.querySelector("#imageForm").addEventListener("input", (event) => {
  if (event.target === imageResolutionInput) rememberConcreteImageResolution(imageResolutionInput);
  validateMainCustomImageSize();
  if (event.target === imageSizeInput || event.target?.closest?.("#imageCustomSizeField")) {
    refreshImageResolutionOptions(imageModelInput.value, imageResolutionInput.value, getCurrentImageSizeChoice());
  }
  updateImageResolutionAvailability();
  if (rememberImageInput.checked) saveImageSettings();
  updateGenerateButtonLabel();
});

imageSizeInput.addEventListener("change", () => {
  syncMainCustomImageSizeField();
  refreshImageResolutionOptions(imageModelInput.value, imageResolutionInput.value, getCurrentImageSizeChoice());
  updateImageResolutionAvailability();
  if (rememberImageInput.checked) saveImageSettings();
  updateGenerateButtonLabel();
});

imageModelInput.addEventListener("change", () => {
  refreshImageSizeOptions();
  syncMidjourneyControls(imageMidjourneyOptions, imageModelInput.value);
  updateImageResolutionAvailability();
  if (rememberImageInput.checked) saveImageSettings();
  updateGenerateButtonLabel();
});

imageMidjourneyOptions?.addEventListener("change", (event) => {
  const preferred = event.target?.dataset.midjourneyField === "mode" ? { mode: event.target.value } : {};
  syncMidjourneyControls(imageMidjourneyOptions, imageModelInput.value, preferred);
  if (rememberImageInput.checked) saveImageSettings();
});
imageMidjourneyOptions?.addEventListener("input", () => {
  if (rememberImageInput.checked) saveImageSettings();
});

rememberImageInput.addEventListener("change", () => {
  if (rememberImageInput.checked) saveImageSettings();
  else localStorage.removeItem(IMAGE_STORAGE_KEY);
});

document.querySelector("#chatForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const prompt = chatPromptInput.value.trim();
  const model = chatModelInput.value.trim();

  if (!model || (!prompt && !chatAttachments.length)) {
    setChatStatus("请输入内容或添加附件。");
    return;
  }

  const resolvedPrompt = prompt || "请分析附件内容。";
  const userContent = buildUserMessageContent(resolvedPrompt);
  const displayContent = buildUserDisplayContent(resolvedPrompt);
  addMessage("user", displayContent);
  history.push({ role: "user", content: userContent, displayContent });
  chatPromptInput.value = "";
  resizeChatPrompt();
  clearChatAttachments();
  setChatLoading(true);

  try {
    const response = await fetch(CHAT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: history.map(({ role, content }) => ({ role, content })),
        web_search: chatWebSearchEnabled,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || data.message || data.error || `${response.status} ${response.statusText}`);

    const content = data.choices?.[0]?.message?.content || data.output_text || "";
    const assistantImages = extractSavedImageUrls(data);
    if (!content && !assistantImages.length) throw new Error("接口返回成功，但没有找到可展示的文本或图片内容。");

    const returnedModel = data.model || model;
    const assistantSources = Array.isArray(data.web_search_results) ? data.web_search_results : [];
    const assistantDisplay = assistantImages.length || assistantSources.length
      ? { text: content, images: assistantImages, sources: assistantSources }
      : content;
    history.push({ role: "assistant", content, displayContent: assistantDisplay });
    addMessage("assistant", assistantDisplay);
    await saveConversationHistory(returnedModel);
    const searchNote = data.web_search_error
      ? " · 联网搜索未成功"
      : assistantSources.length
        ? ` · 已联网搜索 ${assistantSources.length} 条`
        : "";
    setChatStatus(`请求完成 · 模型：${returnedModel}${searchNote}`);
  } catch (error) {
    addMessage("error", `请求失败：${error.message}`);
    setChatStatus("请求失败，请检查后端服务、Key 或模型名。");
  } finally {
    setChatLoading(false);
  }
});

document.querySelector("#imageForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const prompt = imagePromptInput.value.trim();
  const model = imageModelInput.value.trim();

  if (!model || !prompt) {
    setImageStatus("请先选择图片模型并输入提示词。");
    return;
  }
  if (imageSizeInput.value === "custom" && !validateMainCustomImageSize()) {
    setImageStatus("自定义尺寸不符合 OpenAI 规则。");
    return;
  }
  const compatibility = syncMainImageResolutionState();
  if (!compatibility.supported) {
    setImageStatus(compatibility.reason);
    return;
  }

  setImageLoading(true);

  try {
    const requestedSize = getOutputSize();
    const requestBody = {
      model,
      prompt,
      size: requestedSize,
      n: Number(imageCountInput.value),
      reference_images: referenceImages.filter(Boolean),
    };
    if (isMidjourneyModel(model)) Object.assign(requestBody, getMidjourneyPayload(imageMidjourneyOptions));
    else Object.assign(requestBody, { quality: getOutputQuality(), resolution: getOutputResolution() });
    const response = await fetch(IMAGE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || data.message || data.error || `${response.status} ${response.statusText}`);

    const images = extractImages(data);
    if (!images.length) throw new Error("接口返回成功，但没有找到图片链接或 base64 图片。");

    renderImages(images, prompt);
    const returnedModel = data.model || model;
    await saveImageHistory(prompt, images, returnedModel);
    const sizeNote = getImageSizeNote(requestedSize, images);
    const sizeMismatch = hasImageSizeMismatch(requestedSize, images);
    setImageStatus(`${sizeMismatch ? "\u5c3a\u5bf8\u4e0d\u4e00\u81f4" : "\u751f\u6210\u5b8c\u6210"} \u00b7 \u6a21\u578b\uff1a${getModelDisplayName(returnedModel)}${sizeNote ? ` \u00b7 ${sizeNote}` : ""}`);
  } catch (error) {
    setImageStatus(`生成失败：${error.message}`);
  } finally {
    setImageLoading(false);
  }
});

upscaleForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!upscaleImage) {
    setUpscaleStatus("请先上传一张需要放大的图片。");
    return;
  }

  setUpscaleLoading(true);
  try {
    setUpscaleProgress(14, "正在上传到 ComfyUI...");
    const response = await fetch(UPSCALE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: upscaleImage.url,
        name: upscaleImage.name,
        resolution: Number(upscaleResolutionInput?.value || 2048),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || data.message || `${response.status} ${response.statusText}`);
    if (!data.task_id) throw new Error("后端没有返回放大任务 ID。");

    const task = await waitForUpscaleTask(data.task_id);
    const images = (task.images || []).map((url) => ({ src: url, savedUrl: url })).filter((item) => item.src);
    if (!images.length) throw new Error("ComfyUI 没有返回放大图片。");

    renderUpscaleImages(images, upscaleImage.name, upscaleImage.url);
    await saveImageHistory(`高清放大：${upscaleImage.name}`, images, "TTP / ComfyUI", "upscale");
    setUpscaleProgress(100);
    setUpscaleStatus(`放大完成 · ${task.comfy || "ComfyUI"}`);
  } catch (error) {
    setUpscaleProgress(0);
    setUpscaleStatus(`放大失败：${error.message}`);
  } finally {
    setUpscaleLoading(false);
  }
});

upscale2Form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!upscale2Image) {
    setUpscale2Status("请先上传一张需要放大的图片。");
    return;
  }

  setUpscale2Loading(true);
  try {
    setUpscale2Progress(14, "正在上传到 ComfyUI...");
    const response = await fetch(UPSCALE2_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: upscale2Image.url,
        name: upscale2Image.name,
        resolution: Number(upscale2ResolutionInput?.value || 2048),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || data.message || `${response.status} ${response.statusText}`);
    if (!data.task_id) throw new Error("后端没有返回放大任务 ID。");

    const task = await waitForUpscaleTask(data.task_id, setUpscale2Progress);
    const images = (task.images || []).map((url) => ({ src: url, savedUrl: url })).filter((item) => item.src);
    if (!images.length) throw new Error("ComfyUI 没有返回放大图片。");

    renderUpscale2Images(images, upscale2Image.name, upscale2Image.url);
    await saveImageHistory(`高清放大2：${upscale2Image.name}`, images, "SeedVR2 / ComfyUI", "upscale");
    setUpscale2Progress(100);
    setUpscale2Status(`放大完成 · ${task.comfy || "ComfyUI"}`);
  } catch (error) {
    setUpscale2Progress(0);
    setUpscale2Status(`放大失败：${error.message}`);
  } finally {
    setUpscale2Loading(false);
  }
});

shoeSwapForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!shoeSwapPersonImage || !shoeSwapShoeImage) {
    setShoeSwapStatus("请先上传人物原图和鞋子参考图。");
    return;
  }

  setShoeSwapLoading(true);
  try {
    setShoeSwapProgress(14, "正在提交换鞋任务到 ComfyUI...");
    const response = await fetch(SHOE_SWAP_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        person_image: shoeSwapPersonImage.url,
        person_name: shoeSwapPersonImage.name,
        shoe_image: shoeSwapShoeImage.url,
        shoe_name: shoeSwapShoeImage.name,
        image_size: "2K",
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || data.message || `${response.status} ${response.statusText}`);
    if (!data.task_id) throw new Error("后端没有返回换鞋任务 ID。");

    const task = await waitForUpscaleTask(data.task_id, setShoeSwapProgress);
    const images = (task.images || []).map((url) => ({ src: url, savedUrl: url })).filter((item) => item.src);
    if (!images.length) throw new Error("ComfyUI 没有返回换鞋图片。");

    renderShoeSwapImages(images, shoeSwapPersonImage.name, shoeSwapPersonImage.url);
    await saveImageHistory(`换鞋：${shoeSwapPersonImage.name}`, images, "换鞋 / ComfyUI", "shoe");
    setShoeSwapProgress(100);
    setShoeSwapStatus(`换鞋完成 · ${task.comfy || "ComfyUI"}`);
  } catch (error) {
    setShoeSwapProgress(0);
    setShoeSwapStatus(`换鞋失败：${error.message}`);
  } finally {
    setShoeSwapLoading(false);
  }
});

outpaintForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!outpaintImage) {
    setOutpaintStatus("请先上传一张需要扩图的图片。");
    return;
  }

  setOutpaintLoading(true);
  try {
    const submitPadding = getSnappedOutpaintPadding();
    const expandedInput = await createOutpaintAlphaInput(outpaintImage.url, submitPadding);
    setOutpaintProgress(14, "正在提交扩图任务到 ComfyUI...");
    const response = await fetch(OUTPAINT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: expandedInput.dataUrl,
        name: "outpaint_alpha_input.png",
        alphaMaskInput: true,
        direction: "custom",
        left: expandedInput.padding.left,
        top: expandedInput.padding.top,
        right: expandedInput.padding.right,
        bottom: expandedInput.padding.bottom,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || data.message || `${response.status} ${response.statusText}`);
    if (!data.task_id) throw new Error("后端没有返回扩图任务 ID。");

    const task = await waitForUpscaleTask(data.task_id, setOutpaintProgress);
    const images = (task.images || []).map((url) => ({ src: url, savedUrl: url })).filter((item) => item.src);
    if (!images.length) throw new Error("ComfyUI 没有返回扩图图片。");

    renderOutpaintImages(images, outpaintImage.name, outpaintImage.url, task.padding || expandedInput.padding);
    await saveImageHistory(`扩图：${outpaintImage.name}`, images, "Z-Image扩图 / ComfyUI", "outpaint");
    setOutpaintProgress(100);
    setOutpaintStatus(`扩图完成 · ${task.comfy || "ComfyUI"}`);
  } catch (error) {
    setOutpaintProgress(0);
    setOutpaintStatus(`扩图失败：${error.message}`);
  } finally {
    setOutpaintLoading(false);
  }
});

outpaint2Form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!outpaint2Image) {
    setOutpaint2Status("请先上传一张需要扩图的图片。");
    return;
  }

  const submitPadding = getSnappedOutpaint2Padding();
  if (!submitPadding.left && !submitPadding.top && !submitPadding.right && !submitPadding.bottom) {
    setOutpaint2Status("请先拖动扩图区域，留出需要填充的白色区域。");
    return;
  }
  const maxVerticalExpand = Math.max(submitPadding.top, submitPadding.bottom);
  const maxHorizontalExpand = Math.max(submitPadding.left, submitPadding.right);
  const sourceWidth = Math.max(1, Number(outpaint2Image.width || 1));
  const sourceHeight = Math.max(1, Number(outpaint2Image.height || 1));
  const largeExpandWarning = maxVerticalExpand > sourceHeight * 0.8 || maxHorizontalExpand > sourceWidth * 0.8;

  setOutpaint2Loading(true);
  try {
    setOutpaint2Progress(18, largeExpandWarning ? "扩展区域偏大，正在提交 RunningHub 工作流..." : "正在提交 RunningHub 扩图工作流...");
    const response = await fetch(RUNNINGHUB_OUTPAINT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: outpaint2Image.url,
        name: outpaint2Image.name || "runninghub_outpaint_input.png",
        direction: "custom",
        left: submitPadding.left,
        top: submitPadding.top,
        right: submitPadding.right,
        bottom: submitPadding.bottom,
        prompt: "自然延展原图画面，保持原图主体、场景、光线、色调、材质、构图和透视一致，只补全扩展区域，不改变原图内容。",
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || data.message || `${response.status} ${response.statusText}`);
    if (!data.task_id) throw new Error("后端没有返回 RunningHub 任务 ID。");
    const task = await waitForUpscaleTask(data.task_id, setOutpaint2Progress);
    const images = (task.images || []).map((url) => ({ src: url, savedUrl: url })).filter((item) => item.src);
    if (!images.length) throw new Error("RunningHub 没有返回扩图图片。");
    renderOutpaint2Images(images, outpaint2Image.name);
    await saveImageHistory(`扩图2：${outpaint2Image.name}`, images, "RunningHub扩图工作流", "outpaint");
    setOutpaint2Progress(100);
    setOutpaint2Status("扩图2完成 · RunningHub");
  } catch (error) {
    setOutpaint2Progress(0);
    setOutpaint2Status(`扩图2失败：${error.message}`);
  } finally {
    setOutpaint2Loading(false);
  }
});

async function waitForUpscaleTask(taskId, setProgress = setUpscaleProgress) {
  while (true) {
    const response = await fetch(`${UPSCALE_STATUS_API_URL}?id=${encodeURIComponent(taskId)}`);
    const task = await response.json().catch(() => ({}));
    if (!response.ok || task.error) throw new Error(task.error || task.message || `${response.status} ${response.statusText}`);

    setProgress(Number(task.progress || 0), task.message);
    if (task.status === "success") return task;
    if (task.status === "failed") throw new Error(task.error || task.message || "高清放大失败。");

    await delay(2000);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function initializeChatModelPicker() {
  if (!chatModelInput || chatModelPicker) return;
  const shell = chatModelInput.closest(".composer-model");
  if (!shell) return;
  const actions = shell.closest(".composer-actions");
  if (actions && shell.parentElement !== actions) actions.append(shell);
  shell.classList.add("has-custom-picker");

  const button = document.createElement("button");
  button.type = "button";
  button.className = "chat-model-button";
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-expanded", "false");
  button.innerHTML = '<span class="chat-model-button-text"></span><span class="chat-model-caret" aria-hidden="true">▲</span>';

  const menu = document.createElement("div");
  menu.className = "chat-model-menu";
  menu.setAttribute("role", "listbox");
  menu.hidden = true;

  shell.append(button, menu);
  chatModelPicker = { shell, button, menu };

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setChatModelPickerOpen(menu.hidden);
  });

  menu.addEventListener("click", (event) => {
    const item = event.target.closest("[data-chat-model-value]");
    if (!item) return;
    chatModelInput.value = item.dataset.chatModelValue || "";
    chatModelInput.dispatchEvent(new Event("change", { bubbles: true }));
    renderChatModelPicker();
    setChatModelPickerOpen(false);
  });

  document.addEventListener("click", (event) => {
    if (!chatModelPicker?.shell.contains(event.target)) setChatModelPickerOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setChatModelPickerOpen(false);
  });

  chatModelInput.addEventListener("change", renderChatModelPicker);
  renderChatModelPicker();
}

function setChatModelPickerOpen(open) {
  if (!chatModelPicker) return;
  chatModelPicker.menu.hidden = !open;
  chatModelPicker.shell.classList.toggle("is-open", open);
  chatModelPicker.button.setAttribute("aria-expanded", String(open));
}

function renderChatModelPicker() {
  if (!chatModelPicker || !chatModelInput) return;
  const options = Array.from(chatModelInput.options || []);
  const currentValue = chatModelInput.value || options[0]?.value || "";
  const currentOption = options.find((option) => option.value === currentValue) || options[0];
  const buttonText = chatModelPicker.button.querySelector(".chat-model-button-text");
  if (buttonText) buttonText.textContent = currentOption?.textContent || currentValue || "选择模型";
  chatModelPicker.menu.innerHTML = "";
  options.forEach((option) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "chat-model-option";
    item.dataset.chatModelValue = option.value;
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(option.value === currentValue));
    item.textContent = option.textContent || option.value;
    if (option.value === currentValue) item.classList.add("is-selected");
    chatModelPicker.menu.append(item);
  });
}

async function loadChatModels() {
  try {
    const response = await fetch(CHAT_MODELS_API_URL);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "对话模型读取失败。");
    Object.assign(DYNAMIC_MODEL_DISPLAY_NAMES, data.labels || {});
    fillSelect(chatModelInput, data.models);
    chatModelInput.value = data.defaultModel;
    renderChatModelPicker();
    refreshCanvasLlmModelSelects();
    setChatStatus("准备就绪");
  } catch (error) {
    fillSelect(chatModelInput, ["模型列表读取失败"]);
    renderChatModelPicker();
    refreshCanvasLlmModelSelects();
    setChatStatus(error.message);
  }
}

async function loadVisionModels() {
  try {
    const response = await fetch(VISION_MODELS_API_URL);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "视觉模型读取失败。");
    Object.assign(DYNAMIC_MODEL_DISPLAY_NAMES, data.labels || {});
    visionModelOptions = data.models || [];
    refreshCanvasLlmModelSelects();
  } catch {
    visionModelOptions = [];
    refreshCanvasLlmModelSelects();
  }
}

async function loadImageModels(options = {}) {
  const preserveOnError = Boolean(options.preserveOnError);
  const saved = getSavedSettings(IMAGE_STORAGE_KEY);
  try {
    const response = await fetch(IMAGE_MODELS_API_URL);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "图片模型读取失败。");
    canvasImageModelCandidates = Array.isArray(data.candidates) ? data.candidates : [];
    Object.assign(DYNAMIC_MODEL_DISPLAY_NAMES, data.labels || {});
    Object.keys(IMAGE_MODEL_RESOLUTIONS).forEach((key) => delete IMAGE_MODEL_RESOLUTIONS[key]);
    Object.entries(data.resolutions || {}).forEach(([model, values]) => {
      IMAGE_MODEL_RESOLUTIONS[model] = normalizeImageResolutionValues(values);
    });
    Object.keys(IMAGE_MODEL_PLATFORMS).forEach((key) => delete IMAGE_MODEL_PLATFORMS[key]);
    Object.entries(data.platforms || {}).forEach(([model, platform]) => {
      IMAGE_MODEL_PLATFORMS[model] = normalizeImagePlatform(platform, model);
    });
    Object.keys(IMAGE_MODEL_FAMILIES).forEach((key) => delete IMAGE_MODEL_FAMILIES[key]);
    Object.entries(data.families || {}).forEach(([model, family]) => {
      IMAGE_MODEL_FAMILIES[model] = normalizeImageModelFamily(family, model);
    });
    Object.keys(DYNAMIC_IMAGE_MODEL_PRICES).forEach((key) => delete DYNAMIC_IMAGE_MODEL_PRICES[key]);
    Object.assign(DYNAMIC_IMAGE_MODEL_PRICES, data.prices || {});
    fillSelect(imageModelInput, data.models);
    const preferredModel = saved?.model || data.defaultModel;
    imageModelInput.value = data.models.includes(preferredModel) ? preferredModel : data.defaultModel;
    refreshImageSizeOptions(saved?.size || imageSizeInput.value);
    syncMidjourneyControls(imageMidjourneyOptions, imageModelInput.value, saved?.midjourney || {});
    updateImageResolutionAvailability();
    refreshCanvasImageModelSelects();
    updateGenerateButtonLabel();
    setImageStatus("准备就绪");
    return canvasImageModelCandidates;
  } catch (error) {
    if (!preserveOnError) {
      canvasImageModelCandidates = [];
      fillSelect(imageModelInput, ["模型列表读取失败"]);
      refreshCanvasImageModelSelects();
      updateGenerateButtonLabel();
      setImageStatus(error.message);
      return canvasImageModelCandidates;
    }
    throw error;
  }
}

function setActiveTool(tool) {
  const agentSettingsWasVisible = isAgentModelsSettingsVisible();
  const nextTool = tool || "canvas";
  tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tool === nextTool));
  views.forEach((view) => {
    if (view.dataset.view === "canvas") {
      view.classList.add("active");
      return;
    }
    view.classList.toggle("active", view.dataset.view === nextTool);
  });
  document.body.classList.toggle("canvas-overlay-open", nextTool !== "canvas");
  if (nextTool === "canvas") {
    scheduleCanvasConnectionRender();
    markCanvasViewportInteraction();
  } else {
    suspendCanvasImageLoading();
  }
  if (nextTool === "records") renderUnifiedHistory();
  if (nextTool === "settings") {
    startProviderRuntimePolling();
    startProviderMonitoringPolling();
  } else {
    stopProviderRuntimePolling();
    stopProviderMonitoringPolling();
  }
  const agentSettingsIsVisible = isAgentModelsSettingsVisible();
  if (!agentSettingsWasVisible && agentSettingsIsVisible) beginAgentAutoVerificationSession();
  else if (agentSettingsWasVisible && !agentSettingsIsVisible) stopAgentAutoVerificationSession();
}

function ensureSettingsMarkup() {
  const stage = document.querySelector(".stage");
  if (!stage || document.querySelector("#settingsView")) return;
  const view = document.createElement("section");
  view.className = "tool-view settings-view";
  view.id = "settingsView";
  view.dataset.view = "settings";
  view.innerHTML = `
    <div class="settings-center">
      <aside class="settings-sidebar">
        <div class="settings-brand"><i data-lucide="settings-2"></i><strong>设置</strong></div>
        <nav class="settings-tabs" aria-label="设置分类">
          <button class="active" type="button" data-settings-tab="api"><i data-lucide="cable"></i><span>API 接入</span></button>
          <button type="button" data-settings-tab="agent-models"><i data-lucide="bot"></i><span>Agent 模型</span></button>
          <button type="button" data-settings-tab="monitoring"><i data-lucide="activity"></i><span>API 监测</span></button>
          <button type="button" data-settings-tab="canvas"><i data-lucide="sliders-horizontal"></i><span>画布偏好</span></button>
          <button type="button" data-settings-tab="appearance"><i data-lucide="palette"></i><span>个性化</span></button>
          <button type="button" data-settings-tab="storage"><i data-lucide="folder-cog"></i><span>本地存储</span></button>
        </nav>
        <div class="settings-sidebar-note"><span></span>配置仅保存在这台设备</div>
      </aside>
      <main class="settings-content">
        <header class="settings-content-header">
          <div>
            <span>设置 / <b id="settingsBreadcrumb">API 接入</b></span>
            <h2 id="settingsTitle">API 接入</h2>
            <p id="settingsDescription">连接 OpenAI 兼容接口，并将模型分配给对话或图片功能。</p>
          </div>
          <div class="settings-save-state" id="settingsSaveState">已同步</div>
        </header>
        <section class="settings-panel active" data-settings-panel="api">
          <div class="api-settings-layout">
            <aside class="provider-browser">
              <div class="provider-browser-head">
                <strong>服务商</strong>
                <button type="button" data-settings-action="add-provider" title="添加 API"><i data-lucide="plus"></i></button>
              </div>
              <div class="provider-list" id="settingsProviderList"></div>
            </aside>
            <div class="provider-detail" id="settingsProviderDetail"></div>
          </div>
        </section>
        <section class="settings-panel" data-settings-panel="agent-models"></section>
        <section class="settings-panel" data-settings-panel="monitoring"></section>
        <section class="settings-panel" data-settings-panel="canvas"></section>
        <section class="settings-panel" data-settings-panel="appearance"></section>
        <section class="settings-panel" data-settings-panel="storage"></section>
        <footer class="settings-footer">
          <button class="settings-secondary-button" type="button" data-settings-action="reload">放弃更改</button>
          <button class="settings-primary-button" type="button" data-settings-action="save"><i data-lucide="save"></i><span>保存设置</span></button>
        </footer>
      </main>
    </div>
    <div class="model-picker-backdrop" id="settingsModelPicker" hidden>
      <section class="model-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="modelPickerTitle">
        <header>
          <div><strong id="modelPickerTitle">选择模型</strong><span id="modelPickerSubtitle">从服务商模型列表中选择需要添加的模型</span></div>
          <button type="button" data-settings-action="close-model-picker" aria-label="关闭"><i data-lucide="x"></i></button>
        </header>
        <div class="model-picker-tools">
          <label><i data-lucide="search"></i><input id="modelPickerSearch" placeholder="搜索模型"></label>
          <button type="button" data-settings-action="refresh-model-picker" title="重新获取"><i data-lucide="refresh-cw"></i></button>
        </div>
        <nav class="model-picker-filters">
          <button class="active" type="button" data-model-filter="all">全部 <span id="modelCountAll">0</span></button>
          <button type="button" data-model-filter="chat">文本 <span id="modelCountChat">0</span></button>
          <button type="button" data-model-filter="image">图片 <span id="modelCountImage">0</span></button>
        </nav>
        <div class="model-picker-list" id="modelPickerList"></div>
        <footer><span id="modelPickerSelection">已选择 0 个模型</span><button class="settings-primary-button" type="button" data-settings-action="add-selected-models"><i data-lucide="plus"></i><span>添加所选模型</span></button></footer>
      </section>
    </div>
  `;
  stage.append(view);
}

async function initializeSettingsCenter() {
  const view = document.querySelector("#settingsView");
  if (!view) return;
  view.addEventListener("click", handleSettingsClick);
  view.addEventListener("input", handleSettingsInput);
  view.addEventListener("change", handleSettingsInput);
  view.querySelector("#modelPickerSearch")?.addEventListener("input", renderModelPicker);
  await loadSettingsCenter();
}

async function loadSettingsCenter() {
  setSettingsSaveState("正在读取...");
  try {
    const response = await fetch(SETTINGS_API_URL);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "设置读取失败。");
    settingsState = data;
    savedSettingsSnapshot = cloneSettingsState(data);
    activeSettingsProviderId = data.providers?.some((provider) => provider.id === activeSettingsProviderId)
      ? activeSettingsProviderId
      : data.providers?.[0]?.id || "";
    applySettingsPreferences();
    renderSettingsCenter();
    const settingsVisible = document.querySelector("#settingsView")?.classList.contains("active") && activeSettingsTab === "agent-models";
    void loadAgentRoutingCandidates({ silent: true, refresh: settingsVisible });
    setSettingsSaveState("已同步");
    if (document.querySelector("#settingsView")?.classList.contains("active")) {
      startProviderRuntimePolling();
      startProviderMonitoringPolling();
    }
  } catch (error) {
    setSettingsSaveState(error.message, true);
  }
}

function renderSettingsCenter() {
  if (!settingsState) return;
  const labels = {
    api: ["API 接入", "连接 OpenAI 兼容接口，获取模型后按实际能力分配使用位置。"],
    "agent-models": ["Agent 模型", "选择一个主模型，其余可用接口按可靠性自动接管。"],
    monitoring: ["API 监测", "长期记录所有已接入服务的在线率、延迟和波动，便于筛选稳定线路。"],
    canvas: ["画布偏好", "调整节点、连线与画布保存行为。"],
    appearance: ["个性化", "选择主题与界面动效，让工作区更贴合你的习惯。"],
    storage: ["本地存储", "管理自动保存频率，并查看本地数据目录。"],
  };
  const [title, description] = labels[activeSettingsTab];
  document.querySelector("#settingsBreadcrumb").textContent = title;
  document.querySelector("#settingsTitle").textContent = title;
  document.querySelector("#settingsDescription").textContent = description;
  document.querySelectorAll("[data-settings-tab]").forEach((button) => button.classList.toggle("active", button.dataset.settingsTab === activeSettingsTab));
  document.querySelectorAll("[data-settings-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.settingsPanel === activeSettingsTab));
  renderSettingsProviders();
  renderAgentModelSettings();
  renderSettingsMonitoring();
  renderSettingsPreferencePanels();
  window.lucide?.createIcons({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
}

function renderSettingsProviders() {
  const list = document.querySelector("#settingsProviderList");
  const detail = document.querySelector("#settingsProviderDetail");
  if (!list || !detail || !settingsState) return;
  list.innerHTML = "";
  settingsState.providers.forEach((provider) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `provider-list-item${provider.id === activeSettingsProviderId ? " active" : ""}`;
    button.dataset.providerId = provider.id;
    button.innerHTML = `
      <span class="provider-avatar">${escapeHtml((provider.name || "A").slice(0, 1).toUpperCase())}</span>
      <span><strong>${escapeHtml(provider.name)}</strong><small>${provider.models.filter((model) => model.capabilities?.length).length} 个已配置模型</small></span>
      <span class="provider-state ${provider.enabled ? "on" : ""}">${provider.managed ? "ENV" : provider.enabled ? "ON" : "OFF"}</span>
    `;
    list.append(button);
  });
  if (!settingsState.providers.length) {
    list.innerHTML = '<div class="provider-list-empty"><i data-lucide="plug-zap"></i><strong>还没有 API</strong><span>添加后即可获取模型</span></div>';
  }

  const provider = getActiveSettingsProvider();
  if (!provider) {
    detail.innerHTML = `
      <div class="provider-empty-detail">
        <i data-lucide="cable"></i>
        <h3>连接你的第一个 API</h3>
        <p>填写兼容 OpenAI 的 API 地址和 Key，获取模型后可分别分配文本、识图、生图和图片编辑能力。</p>
        <button class="settings-primary-button" type="button" data-settings-action="add-provider"><i data-lucide="plus"></i><span>添加 API 接入</span></button>
      </div>
    `;
    return;
  }
  const providerBaseUrl = getProviderBaseUrl(provider.baseUrl);
  const providerEndpoints = getProviderEndpointRows(providerBaseUrl);

  detail.innerHTML = `
    <div class="provider-detail-head ${provider.managed ? "is-managed" : ""}">
      <div class="provider-title">
        <span class="provider-avatar large">${escapeHtml((provider.name || "A").slice(0, 1).toUpperCase())}</span>
        <div><input value="${escapeHtml(provider.name)}" data-provider-field="name" aria-label="服务商名称" ${provider.managed ? "readonly" : ""}><span>${provider.managed ? ".env 系统配置 · " : ""}${provider.baseUrl ? escapeHtml(provider.baseUrl) : "尚未填写 API 地址"}</span></div>
      </div>
      ${provider.managed
        ? '<span class="provider-managed-badge"><i data-lucide="shield-check"></i>系统配置</span>'
        : `<label class="settings-switch"><input type="checkbox" data-provider-field="enabled" ${provider.enabled ? "checked" : ""}><span></span><b>${provider.enabled ? "已启用" : "已停用"}</b></label>`}
    </div>
    <div class="provider-credentials">
      <label><span>统一基础地址</span><input type="url" data-provider-field="baseUrl" value="${escapeHtml(providerBaseUrl)}" placeholder="https://api.example.com/v1" ${provider.managed ? "readonly" : ""}></label>
      <label><span>API Key</span><div class="settings-key-field"><input type="password" data-provider-field="apiKey" value="" placeholder="${escapeHtml(provider.apiKeyMasked || "sk-...")}" ${provider.managed ? "readonly" : ""}>${provider.managed ? "" : '<button type="button" data-settings-action="toggle-key" title="显示或隐藏 Key"><i data-lucide="eye"></i></button>'}</div></label>
      <label class="provider-recharge-field"><span>充值页面（可选）</span><input type="url" data-provider-field="rechargeUrl" value="${escapeHtml(provider.rechargeUrl || "")}" placeholder="${escapeHtml(getDefaultProviderRechargeUrl(provider.baseUrl))}" ${provider.managed ? "readonly" : ""}></label>
    </div>
    <div class="provider-address-guide">
      <i data-lucide="info"></i>
      <span>可直接粘贴中转站域名、<code>/v1</code>、<code>/v1/models</code>、<code>/v1/chat/completions</code> 或 <code>/v1/images/generations</code>，系统会自动整理。</span>
    </div>
    ${renderProviderRuntimeOverview(provider)}
    <div class="provider-endpoints">
      <div class="provider-endpoints-copy"><strong>接口端点</strong><span>后台根据模型用途自动选择，无需分别填写。</span></div>
      <div class="provider-endpoint-list">
        ${providerEndpoints.map((endpoint) => `<div><i data-lucide="${endpoint.icon}"></i><span>${endpoint.label}</span><code>${escapeHtml(endpoint.url)}</code></div>`).join("")}
      </div>
    </div>
    <div class="provider-models">
      <div class="provider-models-head">
        <div><strong>模型</strong><span>${provider.models.length}</span></div>
        <button class="settings-secondary-button" type="button" data-settings-action="fetch-models"><i data-lucide="list-plus"></i><span>获取并添加模型</span></button>
      </div>
      <div class="provider-capability-guide">
        <i data-lucide="badge-info"></i>
        <span>模型接口通常不会声明能力，请按服务商文档勾选。识图用于带图片的对话和画布识图节点；编辑用于带参考图的图片请求。</span>
      </div>
      <div class="provider-model-list">
        ${provider.models.length ? provider.models.map((model) => `
          <div class="provider-model-row">
            <span class="model-kind-icon"><i data-lucide="${model.capabilities?.some((item) => ["generation", "edit"].includes(item)) ? "image" : model.capabilities?.length ? "message-square" : "circle-dashed"}"></i></span>
            <span class="provider-model-name"><strong>${escapeHtml(model.alias || model.id)}</strong><small>${escapeHtml(model.id)}</small></span>
            <div class="model-capability-picker">
              ${renderModelCapabilityButton(model, "text", "文本", "message-square")}
              ${renderModelCapabilityButton(model, "vision", "识图", "scan-eye")}
              ${renderModelCapabilityButton(model, "generation", "生图", "image-plus")}
              ${renderModelCapabilityButton(model, "edit", "编辑", "wand-sparkles")}
              ${renderModelPlatformTags(model)}
              ${renderModelResolutionTags(model)}
              ${model.capabilities?.includes("generation") ? `<label class="model-price-field" title="填写后会显示在此模型的生成按钮上"><span>￥/张</span><input inputmode="decimal" data-model-price="${escapeHtml(model.id)}" value="${escapeHtml(model.price || "")}" placeholder="未填写"></label>` : ""}
            </div>
            ${renderProviderAgentVerification(provider, model)}
            <button class="provider-model-delete" type="button" data-settings-action="delete-model" data-model-id="${escapeHtml(model.id)}" title="&#x79fb;&#x9664;&#x6a21;&#x578b;" aria-label="&#x79fb;&#x9664;&#x6a21;&#x578b;"><i data-lucide="trash-2"></i></button>
          </div>
        `).join("") : '<div class="provider-model-empty"><i data-lucide="list-restart"></i><span>填写地址与 Key，然后获取模型列表</span></div>'}
      </div>
    </div>
    ${provider.managed ? "" : '<button class="provider-delete" type="button" data-settings-action="delete-provider"><i data-lucide="trash-2"></i><span>移除此 API 接入</span></button>'}
  `;
}

function getAgentRoutingDraft() {
  settingsState.agentRouting ||= { primaryCandidateId: "", candidateOrder: [] };
  const candidateOrder = [];
  const seen = new Set();
  (Array.isArray(settingsState.agentRouting.candidateOrder) ? settingsState.agentRouting.candidateOrder : []).forEach((item) => {
    const id = String(item || "").trim();
    if (!id || seen.has(id) || candidateOrder.length >= 256) return;
    seen.add(id);
    candidateOrder.push(id);
  });
  return {
    primaryCandidateId: String(settingsState.agentRouting.primaryCandidateId || "").trim(),
    candidateOrder,
  };
}

function snapshotAgentRoutingDraft(primaryCandidateId = getAgentRoutingDraft().primaryCandidateId) {
  const routing = getAgentRoutingDraft();
  const candidates = Array.isArray(agentRoutingCandidateState.data?.candidates)
    ? agentRoutingCandidateState.data.candidates
    : [];
  const availableIds = [...new Set(candidates
    .filter((item) => ["ready", "circuit_open"].includes(item.state))
    .map((item) => String(item.selectionId || item.id || "").trim())
    .filter(Boolean))];
  if (!availableIds.length) return { ...routing, primaryCandidateId: String(primaryCandidateId || "").trim() };
  const available = new Set(availableIds);
  const selectedPrimaryId = String(primaryCandidateId || "").trim();
  const candidateOrder = [
    ...(selectedPrimaryId && available.has(selectedPrimaryId) ? [selectedPrimaryId] : []),
    ...routing.candidateOrder.filter((id) => available.has(id) && id !== selectedPrimaryId),
    ...availableIds.filter((id) => id !== selectedPrimaryId && !routing.candidateOrder.includes(id)),
  ];
  return {
    primaryCandidateId: selectedPrimaryId,
    candidateOrder: [...new Set(candidateOrder)].slice(0, 256),
  };
}

async function loadAgentRoutingCandidates({ silent = false, refresh = false } = {}) {
  const requestId = ++agentRoutingCandidateRequestSerial;
  agentRoutingCandidateState = { ...agentRoutingCandidateState, state: "loading", error: "" };
  if (!silent) renderAgentModelSettings();
  try {
    const response = await fetch(`${SETTINGS_AGENT_CANDIDATES_API_URL}${refresh ? "?refresh=1" : ""}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "读取 Agent 候选池失败。");
    if (requestId !== agentRoutingCandidateRequestSerial) return;
    agentRoutingCandidateState = { state: "ready", data, error: "" };
  } catch (error) {
    if (requestId !== agentRoutingCandidateRequestSerial) return;
    agentRoutingCandidateState = { state: "error", data: null, error: error.message };
    if (!silent) setSettingsSaveState(error.message, true);
  }
  if (isAgentModelsSettingsVisible()) {
    renderAgentModelSettings();
    queueMicrotask(() => scheduleAgentAutoVerification());
  }
}

function isAgentModelsSettingsVisible() {
  return activeSettingsTab === "agent-models"
    && Boolean(document.querySelector("#settingsView")?.classList.contains("active"));
}

function beginAgentAutoVerificationSession() {
  agentAutoVerificationEpoch += 1;
  agentAutoVerificationAttempted.clear();
  agentAutoVerificationAbortController?.abort();
  agentAutoVerificationAbortController = null;
  agentAutoVerificationActiveEpoch = 0;
  queueMicrotask(() => scheduleAgentAutoVerification());
}

function stopAgentAutoVerificationSession() {
  agentAutoVerificationEpoch += 1;
  agentAutoVerificationAbortController?.abort();
  agentAutoVerificationAbortController = null;
  agentAutoVerificationActiveEpoch = 0;
}

async function scheduleAgentAutoVerification() {
  if (!isAgentModelsSettingsVisible()) return;
  const epoch = agentAutoVerificationEpoch;
  if (agentAutoVerificationActiveEpoch === epoch) return;
  if (agentRoutingCandidateState.state !== "ready" || !CanvasAgentVerification) return;
  const targets = CanvasAgentVerification.selectAutoVerificationTargets(agentRoutingCandidateState.data, {
    maxReadyEndpoints: 3,
    maxTargets: 3,
    attemptedKeys: agentAutoVerificationAttempted,
  });
  if (!targets.length) return;
  const controller = new AbortController();
  agentAutoVerificationAbortController = controller;
  agentAutoVerificationActiveEpoch = epoch;
  try {
    for (const target of targets) {
      if (epoch !== agentAutoVerificationEpoch || !isAgentModelsSettingsVisible() || controller.signal.aborted) break;
      const key = CanvasAgentVerification.candidateKey(target);
      agentAutoVerificationAttempted.add(key);
      await verifyProviderAgent(target.model, target.providerId, {
        automatic: true,
        signal: controller.signal,
        verificationEpoch: epoch,
      });
    }
  } finally {
    if (agentAutoVerificationActiveEpoch === epoch) agentAutoVerificationActiveEpoch = 0;
    if (agentAutoVerificationAbortController === controller) agentAutoVerificationAbortController = null;
  }
}

function renderAgentModelSettings() {
  const panel = document.querySelector('[data-settings-panel="agent-models"]');
  if (!panel || !settingsState) return;
  const previousPending = panel.querySelector(".agent-pending-section");
  const previousPendingList = panel.querySelector(".agent-candidate-list");
  const focusedVerify = document.activeElement?.closest?.("[data-agent-candidate-verify]");
  const viewState = {
    panelScrollTop: panel.scrollTop,
    pendingOpen: Boolean(previousPending?.open),
    pendingScrollTop: previousPendingList?.scrollTop || 0,
    focusedProviderId: focusedVerify?.dataset.providerId || "",
    focusedModelId: focusedVerify?.dataset.modelId || "",
  };
  const routing = getAgentRoutingDraft();
  const pool = agentRoutingCandidateState.data || {};
  const needsReconfiguration = Boolean(pool.needsReconfiguration);
  const summary = pool.summary || { ready: 0, circuitOpen: 0, pendingVerification: 0 };
  const candidates = Array.isArray(pool.candidates) ? pool.candidates : [];
  const discovered = Array.isArray(pool.discovered) ? pool.discovered : [];
  const showPendingDetails = !candidates.some((item) => item.state === "ready") || discovered.some((item) => {
    const state = providerAgentVerificationState.get(`${item.providerId}:${item.model}`)?.state;
    return state === "loading" || state === "failed";
  });
  const status = agentRoutingCandidateState.state === "loading"
    ? "正在扫描可用接口…"
    : agentRoutingCandidateState.state === "error"
      ? agentRoutingCandidateState.error || "候选池暂时不可用"
      : needsReconfiguration
        ? "已保存的接口在这台电脑不可用，需要在这台电脑重新设置 API 并选择主模型"
        : "主模型异常时会按已保存顺序自动使用下一名备用模型";
  const readyCandidates = candidates.filter((item) => ["ready", "circuit_open"].includes(item.state));
  const selectedPrimary = readyCandidates.find((item) => item.id === routing.primaryCandidateId);
  const activePrimary = needsReconfiguration ? null : selectedPrimary || readyCandidates[0] || null;
  const renderHealth = (item) => {
    if (item.state === "circuit_open") return "接口暂时冷却；当前任务跳过，恢复后回到原顺序";
    if (item.successRate === null) return "已通过 Agent 能力验证，等待更多任务数据";
    return `成功率 ${item.successRate}% · 连续失败 ${item.consecutiveFailures || 0}${item.firstEventMs ? ` · 响应 ${Math.round(item.firstEventMs)} ms` : ""}`;
  };
  const renderReadyRow = (item, index) => {
    const isActive = activePrimary?.id === item.id;
    const isSelected = selectedPrimary?.id === item.id;
    return `<article class="agent-model-row${isActive ? " is-active" : ""}" data-agent-candidate-id="${escapeHtml(item.id)}">
      <span class="agent-model-rank">${index + 1}</span>
      <span class="agent-candidate-main"><strong>${escapeHtml(item.model)}</strong><small>${escapeHtml(item.providerName)} · ${escapeHtml(item.endpoint || "未知接口")}</small></span>
      <span class="agent-candidate-metrics">${escapeHtml(renderHealth(item))}</span>
      ${isActive ? `<span class="agent-model-role">${isSelected ? "主模型" : "自动首选"}</span>` : `<button class="agent-model-primary-button" type="button" data-settings-action="set-agent-primary" data-candidate-id="${escapeHtml(item.id)}">设为主模型</button>`}
    </article>`;
  };
  const renderPendingRow = (item) => {
    const verifyState = providerAgentVerificationState.get(`${item.providerId}:${item.model}`);
    const verifying = verifyState?.state === "loading";
    const quality = verifyState && !verifying && verifyState.state !== "failed"
      ? CanvasAgentVerification?.classifyVerificationQuality(verifyState)
      : null;
    const feedback = verifying
      ? verifyState.stage === "probing" ? "正在验证文本与工具调用…" : "正在连接接口…"
      : verifyState?.state === "failed" ? verifyState.message || "验证失败，请重试"
      : quality ? `${quality.label}${verifyState.latencyMs ? ` · ${Math.round(verifyState.latencyMs)} ms` : ""}`
      : item.state === "unsupported" ? "可以对话，但未通过工具调用验证"
      : "验证通过后才会加入备用排名";
    return `<article class="agent-candidate-row is-${escapeHtml(item.state || "pending_verification")}">
      <span class="agent-candidate-state">${item.state === "unsupported" ? "不兼容" : "待验证"}</span>
      <span class="agent-candidate-main"><strong>${escapeHtml(item.model)}</strong><small>${escapeHtml(item.providerName)} · ${escapeHtml(item.endpoint || "未知接口")}</small></span>
      <small class="agent-candidate-metrics${verifyState?.state === "failed" ? " is-error" : ""}">${escapeHtml(feedback)}</small>
      ${item.state === "pending_verification" ? `<button class="agent-candidate-verify" type="button" data-agent-candidate-verify data-provider-id="${escapeHtml(item.providerId)}" data-model-id="${escapeHtml(item.model)}" ${verifying || quality?.state === "verified" || quality?.state === "slow" ? "disabled" : ""}>${verifying ? "验证中" : quality?.label || "验证"}</button>` : ""}
    </article>`;
  };
  panel.innerHTML = `<div class="agent-model-settings">
    <section class="agent-model-hero">
      <div class="agent-model-hero-copy"><span><i data-lucide="shield-check"></i>当前主模型</span>
        ${activePrimary ? `<h3>${escapeHtml(activePrimary.model)}</h3><p>${escapeHtml(activePrimary.providerName)} · ${escapeHtml(activePrimary.endpoint || "未知接口")}</p>` : "<h3>还没有可用模型</h3><p>完成一次 Agent 验证后即可自动接管任务</p>"}
      </div>
      <div class="agent-model-hero-state"><b>${needsReconfiguration ? "需要重新设置" : activePrimary ? "运行保障已开启" : "等待验证"}</b><small>${escapeHtml(status)}</small>${routing.primaryCandidateId ? '<button type="button" data-settings-action="clear-agent-primary">恢复自动选择</button>' : ""}</div>
    </section>
    <section class="agent-routing-card" aria-label="Agent 模型候选排名">
      <header><div><i data-lucide="list-ordered"></i><strong>备用顺序</strong><span>保存后保持不变，故障时按顺序自动接管</span></div><button type="button" data-settings-action="refresh-agent-candidates" title="刷新候选池" ${agentRoutingCandidateState.state === "loading" ? "disabled" : ""}><i data-lucide="refresh-cw"></i></button></header>
      <div class="agent-routing-summary"><span><b>${summary.ready || 0}</b> 可用</span><span><b>${summary.pendingVerification || 0}</b> 待验证</span>${summary.circuitOpen ? `<span class="is-warning"><b>${summary.circuitOpen}</b> 暂时冷却</span>` : ""}</div>
      <div class="agent-model-list">${readyCandidates.length ? readyCandidates.map(renderReadyRow).join("") : '<div class="agent-candidate-empty">尚无已验证的 Agent 模型。请在下方验证一个候选。</div>'}</div>
    </section>
    <details class="agent-pending-section" ${showPendingDetails ? "open" : ""}>
      <summary><span><i data-lucide="flask-conical"></i><strong>待验证</strong><small>仅验证文本与工具调用，不操作画布</small></span><b>${discovered.length}</b></summary>
      <div class="agent-candidate-list">${discovered.length ? discovered.map(renderPendingRow).join("") : '<div class="agent-candidate-empty">没有待验证候选。</div>'}</div>
    </details>
  </div>`;
  window.lucide?.createIcons({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
  const nextPending = panel.querySelector(".agent-pending-section");
  if (viewState.pendingOpen && nextPending) nextPending.open = true;
  const nextPendingList = panel.querySelector(".agent-candidate-list");
  if (nextPendingList) nextPendingList.scrollTop = viewState.pendingScrollTop;
  panel.scrollTop = viewState.panelScrollTop;
  if (viewState.focusedProviderId && viewState.focusedModelId) {
    const nextFocusedVerify = [...panel.querySelectorAll("[data-agent-candidate-verify]")].find((button) => (
      button.dataset.providerId === viewState.focusedProviderId
        && button.dataset.modelId === viewState.focusedModelId
    ));
    nextFocusedVerify?.focus({ preventScroll: true });
  }
}

function resolveCanvasAgentImageModel({ requestedModel = null, requiresEdit = false, size = null, resolution = null } = {}) {
  if (!window.CanvasImageModelRouting?.rankCandidates) return null;
  return window.CanvasImageModelRouting.rankCandidates(canvasImageModelCandidates, {
    ...(String(requestedModel || "").trim()
      ? { requestedModel: String(requestedModel).trim() }
      : { defaultModelFamily: "gpt-image-2" }),
    requiresEdit,
  }).find((candidate) => isCanvasAgentImageCandidateCompatible(candidate, { size, resolution })) || null;
}

async function ensureCanvasAgentImageModelCandidate(options = {}) {
  const cached = resolveCanvasAgentImageModel(options);
  if (cached) return cached;
  if (!canvasImageModelsLoadPromise) {
    canvasImageModelsLoadPromise = loadImageModels({ preserveOnError: true })
      .catch(() => canvasImageModelCandidates)
      .finally(() => {
        canvasImageModelsLoadPromise = null;
      });
  }
  await canvasImageModelsLoadPromise;
  return resolveCanvasAgentImageModel(options);
}

function isCanvasAgentImageCandidateCompatible(candidate, { size = null, resolution = null } = {}) {
  if (!size && !resolution) return true;
  return ImageResolutionRules.getCompatibility({
    platform: candidate.platform || getImageModelPlatform(candidate.id),
    family: candidate.family || getImageModelFamily(candidate.id),
    ratio: String(size || "auto").trim().toLowerCase(),
    resolution: String(resolution || "auto").trim().toLowerCase(),
    configuredResolutions: Array.isArray(candidate.resolutions)
      ? candidate.resolutions
      : getAllowedImageResolutionLevels(candidate.id),
  }).supported;
}

function getCanvasImageRoutingRequestedModel(model) {
  const current = canvasImageModelCandidates.find((candidate) => String(candidate?.id || "") === String(model || ""));
  return String(current?.family || current?.model || model || "").trim();
}

function isCanvasImageFailoverError(error) {
  return ["image_api_balance_failed", "image_api_auth_failed", "image_api_rate_limited"].includes(String(error?.code || ""));
}

async function resolveCanvasImageFailoverCandidate({
  currentModel,
  refs = [],
  size = null,
  resolution = null,
  attemptedModelIds = [],
} = {}) {
  const requestedModel = getCanvasImageRoutingRequestedModel(currentModel);
  try {
    await loadImageModels({ preserveOnError: true });
  } catch {
    // Retain the current candidate snapshot when the refresh itself is temporarily unavailable.
  }
  const compatibleCandidates = canvasImageModelCandidates.filter((candidate) => (
    isCanvasAgentImageCandidateCompatible(candidate, { size, resolution })
  ));
  const candidate = window.CanvasImageModelRouting?.selectFallbackCandidate?.(compatibleCandidates, {
    requestedModel,
    requiresEdit: refs.length > 0,
    excludeIds: [...new Set((Array.isArray(attemptedModelIds) ? attemptedModelIds : []).map(String))],
  }) || null;
  return candidate;
}

async function prepareCanvasImageNodeCandidate(node, {
  refs = [],
  size = null,
  resolution = null,
  guard = null,
} = {}) {
  guard?.assertActive();
  try {
    await loadImageModels({ preserveOnError: true });
  } catch {
    // A local candidate refresh must not block an otherwise usable canvas node.
  }
  guard?.assertActive();
  const modelSelect = node?.querySelector(".canvas-node-model");
  const currentModel = String(modelSelect?.value || node?.dataset?.canvasModel || "").trim();
  const current = canvasImageModelCandidates.find((candidate) => String(candidate?.id || "") === currentModel) || null;
  const requestedModel = getCanvasImageRoutingRequestedModel(currentModel);
  const best = window.CanvasImageModelRouting?.rankCandidates?.(canvasImageModelCandidates, {
    requestedModel,
    requiresEdit: refs.length > 0,
  }).find((candidate) => isCanvasAgentImageCandidateCompatible(candidate, { size, resolution })) || null;
  if (!window.CanvasImageModelRouting?.shouldReplaceCandidate?.(current, best)) {
    return { current, candidate: current || best, switched: false };
  }
  if (!applyCanvasImageCandidate(node, best)) return { current, candidate: current, switched: false };
  return { current, candidate: best, switched: true };
}

function applyCanvasImageCandidate(node, candidate) {
  const model = node?.querySelector(".canvas-node-model");
  if (!model || !candidate?.id) return false;
  fillCanvasNodeModelSelect(model, candidate.id);
  if (!Array.from(model.options).some((option) => option.value === candidate.id)) return false;
  model.value = candidate.id;
  node.dataset.canvasModel = candidate.id;
  model.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function renderSettingsPreferencePanels() {
  const canvas = document.querySelector('[data-settings-panel="canvas"]');
  const appearance = document.querySelector('[data-settings-panel="appearance"]');
  const storage = document.querySelector('[data-settings-panel="storage"]');
  if (!canvas || !appearance || !storage || !settingsState) return;
  canvas.innerHTML = `
    <div class="settings-section-card">
      <h3>画布交互</h3><p>这些设置会影响当前设备上的无限画布体验。</p>
      ${settingsToggle("keepAspect", "节点按媒体比例调整", "缩放图片和视频节点时保持原始比例。", settingsState.canvas.keepAspect, "canvas")}
      ${settingsToggle("controlBarBottom", "控制台始终显示在节点下方", "节点移动时控制项保持在节点底部。", settingsState.canvas.controlBarBottom, "canvas")}
      ${settingsToggle("disconnectMenu", "断线时弹出创建菜单", "从空白区域断开连接时显示节点创建选项。", settingsState.canvas.disconnectMenu, "canvas")}
    </div>`;
  appearance.innerHTML = `
    <div class="settings-section-card">
      <h3>主题</h3><p>界面主题会立即应用，并保存到当前浏览器。</p>
      <div class="settings-theme-choices">
        ${["light", "dark", "system"].map((theme) => `<button type="button" data-settings-theme="${theme}" class="${settingsState.appearance.theme === theme ? "active" : ""}"><i data-lucide="${theme === "light" ? "sun" : theme === "dark" ? "moon" : "monitor"}"></i><span>${theme === "light" ? "浅色" : theme === "dark" ? "深色" : "跟随系统"}</span></button>`).join("")}
      </div>
      <div class="settings-palette-block">
        <div class="settings-palette-head">
          <strong>配色</strong>
          <small>切换按钮、选中态和强调色。</small>
        </div>
        <div class="settings-palette-choices">
          ${COLOR_PALETTES.map((palette) => {
            const active = (settingsState.appearance.palette || "yellow-black") === palette.id;
            return `<button type="button" data-settings-palette="${palette.id}" class="settings-palette-button${active ? " active" : ""}" aria-pressed="${active}">
              <span class="settings-palette-swatches">${palette.colors.map((color) => `<span class="settings-palette-dot" style="--swatch:${color}"></span>`).join("")}</span>
              <span><strong>${palette.label}</strong><small>${palette.description}</small></span>
            </button>`;
          }).join("")}
        </div>
      </div>
      ${settingsToggle("animations", "界面动效", "保留浮层、按钮与节点的过渡动画。", settingsState.appearance.animations, "appearance")}
    </div>`;
  storage.innerHTML = `
    <div class="settings-section-card">
      <h3>本地数据</h3><p>画布、历史记录与 API 设置保存在本机。</p>
      <label class="settings-path-field"><span>当前目录</span><input readonly value="${escapeHtml(settingsState.storage.dataDirectory || "")}"><i data-lucide="folder"></i></label>
    </div>
    <div class="settings-section-card">
      <h3>自动保存</h3>
      ${settingsToggle("autoSave", "启用自动保存", "定时保存当前画布状态。", settingsState.storage.autoSave, "storage")}
      <label class="settings-number-field"><span><strong>保存间隔</strong><small>分钟</small></span><input type="number" min="1" max="120" data-settings-group="storage" data-settings-field="intervalMinutes" value="${Number(settingsState.storage.intervalMinutes || 5)}"></label>
    </div>`;
}

function getProviderMonitoringStateMeta(state) {
  const map = {
    online: { label: "\u53ef\u7528", icon: "circle-check", className: "is-online" },
    reachable: { label: "\u7f51\u7ad9\u5728\u7ebf", icon: "link", className: "is-reachable" },
    unstable: { label: "\u4e0d\u7a33\u5b9a", icon: "triangle-alert", className: "is-unstable" },
    slow: { label: "\u54cd\u5e94\u8f83\u6162", icon: "timer", className: "is-unstable" },
    degraded: { label: "\u670d\u52a1\u5f02\u5e38", icon: "triangle-alert", className: "is-unstable" },
    "auth-error": { label: "\u8d26\u53f7\u53d7\u9650", icon: "key-round", className: "is-unstable" },
    "account-limited": { label: "\u5e73\u53f0\u5728\u7ebf \u00b7 \u8d26\u53f7\u53d7\u9650", icon: "key-round", className: "is-unstable" },
    "balance-error": { label: "\u5e73\u53f0\u5728\u7ebf \u00b7 \u4f59\u989d\u4e0d\u8db3", icon: "wallet-cards", className: "is-unstable" },
    "connection-error": { label: "\u5f53\u524d\u8bbe\u5907\u8fde\u63a5\u5931\u8d25", icon: "unplug", className: "is-error" },
    offline: { label: "\u4e0d\u53ef\u7528", icon: "wifi-off", className: "is-error" },
    disabled: { label: "\u5df2\u505c\u7528", icon: "pause-circle", className: "is-disabled" },
    unknown: { label: "\u5f85\u68c0\u6d4b", icon: "circle-dashed", className: "is-unknown" },
  };
  return map[state] || map.unknown;
}

function getProviderMonitoringPresentation(provider) {
  provider = provider || {};
  const currentState = provider.currentState || provider.state || "unknown";
  const historicalState = provider.state || currentState;
  const showRecentFluctuation = historicalState === "unstable"
    && ["online", "reachable", "slow"].includes(currentState);
  return {
    currentState,
    historicalState,
    showRecentFluctuation,
  };
}

function renderProviderMonitoringBars(buckets = []) {
  const slots = buckets.length
    ? buckets.slice(-50)
    : Array.from({ length: 50 }, () => ({ state: "unknown", successRate: null, sampleCount: 0 }));
  return `<div class="provider-monitoring-health-bars" title="\u5f53\u524d\u65f6\u95f4\u8303\u56f4\u7684 50 \u4e2a\u65f6\u95f4\u6bb5">
    ${slots.map((item) => {
      const successRate = item.successRate === null || item.successRate === undefined ? null : Number(item.successRate);
      const height = successRate === null ? 16 : Math.max(16, Math.min(100, successRate));
      const timeText = item.startAt && item.endAt
        ? `${new Date(item.startAt).toLocaleString("zh-CN")} \u2014 ${new Date(item.endAt).toLocaleString("zh-CN")}`
        : "\u6682\u65e0\u6570\u636e";
      const detail = successRate === null
        ? `${timeText} \u00b7 \u65e0\u68c0\u6d4b`
        : `${timeText} \u00b7 \u6210\u529f\u7387 ${successRate}% \u00b7 ${Number(item.sampleCount || 0)} \u6b21`;
      return `<i class="${getProviderMonitoringStateMeta(item.state).className}" style="--health:${height}%" title="${escapeHtml(detail)}"></i>`;
    }).join("")}
  </div>`;
}
function renderProviderMonitoringRealtimeBars(samples = []) {
  const recent = (Array.isArray(samples) ? samples : []).slice(-50);
  const padding = Math.max(0, 50 - recent.length);
  const measuredLatencies = recent.map((item) => Number(item.latencyMs || 0)).filter((value) => value > 0);
  const maxLatency = Math.max(1, ...measuredLatencies);
  const slots = [...Array.from({ length: padding }, () => null), ...recent];
  return `<div class="provider-monitoring-health-bars is-realtime" title="\u6700\u8fd1 50 \u6b21\u5b9e\u65f6\u68c0\u6d4b">
    ${slots.map((item) => {
      if (!item) return `<i class="is-unknown" style="--health:16%" title="\u5c1a\u65e0\u68c0\u6d4b"></i>`;
      const latency = Math.max(0, Number(item.latencyMs || 0));
      const height = latency ? Math.max(38, Math.round(100 - (latency / maxLatency) * 62)) : 54;
      const timeText = item.checkedAt ? new Date(item.checkedAt).toLocaleString("zh-CN") : "\u65f6\u95f4\u672a\u77e5";
      const meta = getProviderMonitoringStateMeta(item.state);
      return `<i class="${meta.className}" style="--health:${height}%" title="${escapeHtml(`${timeText} \u00b7 ${meta.label} \u00b7 ${latency ? `${latency} ms` : "\u65e0\u5ef6\u8fdf\u6570\u636e"}`)}"></i>`;
    }).join("")}
  </div>`;
}


function renderSettingsMonitoring() {
  const panel = document.querySelector('[data-settings-panel="monitoring"]');
  if (!panel) return;
  const runtime = providerMonitoringState;
  const data = runtime.data;
  const summary = data?.summary || {};
  const providers = Array.isArray(data?.providers) ? data.providers : [];
  const rangeOptions = [
    ["realtime", "\u5b9e\u65f6\u68c0\u6d4b"],
    ["6h", "\u8fd1 6 \u5c0f\u65f6"],
    ["2d", "\u8fd1 2 \u5929"],
    ["7d", "\u8fd1 7 \u5929"],
    ["30d", "\u8fd1 30 \u5929"],
  ];
  panel.innerHTML = `
    <div class="provider-monitoring-dashboard${runtime.state === "loading" ? " is-loading" : ""}">
      <header class="provider-monitoring-head">
        <div>
          <span class="provider-monitoring-kicker"><i data-lucide="radio-tower"></i>\u957f\u671f\u5065\u5eb7\u8bb0\u5f55</span>
          <h3>\u5168\u90e8 API \u8fd0\u884c\u72b6\u6001</h3>
          <p>\u6bcf 5 \u5206\u949f\u5206\u5c42\u68c0\u67e5\u7f51\u7ad9\u3001<code>/v1/models</code> \u548c\u80fd\u529b\u7aef\u70b9\uff0c\u540c\u65f6\u7edf\u8ba1\u753b\u5e03\u4e2d\u7684\u5b9e\u9645\u8c03\u7528\u7ed3\u679c\u3002</p>
        </div>
        <button type="button" data-settings-action="refresh-provider-monitoring" ${runtime.state === "loading" ? "disabled" : ""}><i data-lucide="refresh-cw"></i><span>\u7acb\u5373\u68c0\u6d4b\u5168\u90e8</span></button>
      </header>
      <div class="provider-monitoring-toolbar">
        <div class="provider-monitoring-ranges" aria-label="\u8303\u56f4\u8d8b\u52bf">${rangeOptions.map(([value, label]) => `<button type="button" data-monitoring-range="${value}" class="${providerMonitoringRange === value ? "active" : ""}">${label}</button>`).join("")}</div>
        <span>${data?.generatedAt ? `\u66f4\u65b0\u4e8e ${new Date(data.generatedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}` : "\u7b49\u5f85\u9996\u6b21\u68c0\u6d4b"}</span>
      </div>
      <div class="provider-monitoring-summary">
        <article><i data-lucide="layers-3"></i><span><small>\u5168\u90e8\u63a5\u5165</small><strong>${Number(summary.total || settingsState?.providers?.length || 0)}</strong></span></article>
        <article class="is-online" title="\u6309\u6700\u540e\u4e00\u6b21\u68c0\u6d4b\u7ed3\u679c\u7edf\u8ba1"><i data-lucide="circle-check"></i><span><small>\u5f53\u524d\u53ef\u7528</small><strong>${Number(summary.online || 0)}</strong></span></article>
        <article class="is-unstable" title="\u6240\u9009\u8303\u56f4\u5185\u51fa\u73b0\u8fc7\u6ce2\u52a8\u6216\u8d26\u6237\u9650\u5236\uff0c\u53ef\u4e0e\u5f53\u524d\u53ef\u7528\u540c\u65f6\u5b58\u5728"><i data-lucide="triangle-alert"></i><span><small>\u8fd1\u671f\u9700\u5173\u6ce8</small><strong>${Number(summary.unstable || 0)}</strong></span></article>
        <article class="is-error" title="\u6309\u6700\u540e\u4e00\u6b21\u68c0\u6d4b\u7ed3\u679c\u7edf\u8ba1"><i data-lucide="wifi-off"></i><span><small>\u5f53\u524d\u4e0d\u53ef\u7528</small><strong>${Number(summary.unavailable || 0)}</strong></span></article>
      </div>
      ${runtime.error ? `<div class="provider-monitoring-error"><i data-lucide="circle-alert"></i>${escapeHtml(runtime.error)}</div>` : ""}
      <div class="provider-monitoring-grid">
        ${providers.length ? providers.map((provider) => {
          // The server already ranks providers by health, availability, and latency.
          const presentation = getProviderMonitoringPresentation(provider);
          const meta = getProviderMonitoringStateMeta(presentation.currentState);
          const availability = provider.availability === null ? "\u2014" : `${provider.availability}%`;
          if (presentation.currentState === "balance-error" && provider.balanceState === "negative") {
            meta.label = "\u5e73\u53f0\u5728\u7ebf \u00b7 \u4f59\u989d\u4e3a\u8d1f";
          } else if (presentation.currentState === "balance-error" && provider.balanceState === "depleted") {
            meta.label = "\u5e73\u53f0\u5728\u7ebf \u00b7 \u4f59\u989d\u4e3a\u96f6";
          } else if (presentation.currentState === "connection-error") {
            meta.label = "\u5f53\u524d\u8bbe\u5907\u8fde\u63a5\u5931\u8d25";
          }
          const latency = provider.avgLatencyMs === null ? "\u2014" : `${provider.avgLatencyMs} ms`;
          const usage = provider.usage || {};
          const actualUsage = Number(usage.totalCalls || 0) ? `${Number(usage.totalCalls)} \u6b21 \u00b7 ${Number(usage.successRate || 0)}%` : "0 \u6b21";
          const imageUsage = `${Number(usage.successfulImageCalls || 0)} / ${Number(usage.imageCalls || 0)}`;
          return `<article class="provider-monitoring-card ${meta.className}">
            <header>
              <span class="provider-avatar">${escapeHtml((provider.name || "A").slice(0, 1).toUpperCase())}</span>
              <span><strong>${escapeHtml(provider.name)}</strong><small>${escapeHtml(provider.baseUrl || "")}</small></span>
              <span class="provider-monitoring-statuses">
                <b title="${escapeHtml(provider.message || meta.label)}"><i data-lucide="${meta.icon}"></i>${meta.label}</b>
                ${presentation.showRecentFluctuation ? `<em title="\u5f53\u524d\u68c0\u6d4b\u53ef\u7528\uff0c\u4f46\u6240\u9009\u8303\u56f4\u5185\u66fe\u51fa\u73b0\u5931\u8d25"><i data-lucide="triangle-alert"></i>\u8fd1\u671f\u6709\u6ce2\u52a8</em>` : ""}
              </span>
            </header>
            <div class="provider-monitoring-metrics">
              <span><small>\u63a2\u6d4b\u6210\u529f\u7387</small><strong>${availability}</strong></span>
              <span><small>\u5e73\u5747\u5ef6\u8fdf</small><strong>${latency}</strong></span>
              <span><small>\u5b9e\u9645\u8c03\u7528\uff08\u6210\u529f\u7387\uff09</small><strong>${actualUsage}</strong></span>
              <span><small>\u751f\u56fe\u6210\u529f / \u8c03\u7528</small><strong>${imageUsage}</strong></span>
            </div>
            ${providerMonitoringRange === "realtime" ? renderProviderMonitoringRealtimeBars(provider.recent) : renderProviderMonitoringBars(provider.trend)}
            <footer>
              <span>${provider.lastCheckedAt ? new Date(provider.lastCheckedAt).toLocaleString("zh-CN") : "\u5c1a\u65e0\u5386\u53f2\u6570\u636e"}</span>
              <div>
                <button type="button" data-settings-action="view-monitored-provider" data-monitoring-provider-id="${escapeHtml(provider.id)}">\u67e5\u770b\u63a5\u5165</button>
                ${provider.managed ? "" : `<button type="button" data-settings-action="toggle-monitored-provider" data-monitoring-provider-id="${escapeHtml(provider.id)}">${provider.enabled ? "\u505c\u7528" : "\u6062\u590d"}</button>`}
              </div>
            </footer>
          </article>`;
        }).join("") : `<div class="provider-monitoring-empty"><i data-lucide="activity"></i><strong>${runtime.state === "loading" ? "\u6b63\u5728\u8bfb\u53d6\u76d1\u6d4b\u6570\u636e" : "\u6682\u65e0\u76d1\u6d4b\u8bb0\u5f55"}</strong><span>\u70b9\u51fb\u201c\u7acb\u5373\u68c0\u6d4b\u5168\u90e8\u201d\u5efa\u7acb\u7b2c\u4e00\u7ec4\u8bb0\u5f55\u3002</span></div>`}
      </div>
    </div>`;
}

async function loadProviderMonitoring({ refresh = false, silent = false } = {}) {
  const requestId = ++providerMonitoringRequestSerial;
  providerMonitoringState = { ...providerMonitoringState, state: "loading", error: "" };
  if (!silent) renderSettingsMonitoring();
  try {
    const response = await fetch(`${SETTINGS_PROVIDER_MONITORING_API_URL}?range=${encodeURIComponent(providerMonitoringRange)}`, {
      method: refresh ? "POST" : "GET",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "\u76d1\u6d4b\u6570\u636e\u8bfb\u53d6\u5931\u8d25\u3002");
    if (requestId !== providerMonitoringRequestSerial) return;
    providerMonitoringState = { state: "ready", data, error: "" };
  } catch (error) {
    if (requestId !== providerMonitoringRequestSerial) return;
    providerMonitoringState = { ...providerMonitoringState, state: "error", error: error.message };
  }
  renderSettingsMonitoring();
  window.lucide?.createIcons({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
}

function stopProviderMonitoringPolling() {
  if (providerMonitoringTimer) clearInterval(providerMonitoringTimer);
  providerMonitoringTimer = 0;
}

function startProviderMonitoringPolling() {
  stopProviderMonitoringPolling();
  if (!settingsState || activeSettingsTab !== "monitoring") return;
  loadProviderMonitoring();
  providerMonitoringTimer = setInterval(() => {
    if (document.querySelector("#settingsView")?.classList.contains("active") && activeSettingsTab === "monitoring") {
      loadProviderMonitoring({ silent: true });
    }
  }, 60000);
}

function settingsToggle(field, title, description, checked, group) {
  return `<label class="settings-toggle-row"><span><strong>${title}</strong><small>${description}</small></span><span class="settings-switch"><input type="checkbox" data-settings-group="${group}" data-settings-field="${field}" ${checked ? "checked" : ""}><span></span></span></label>`;
}

function renderModelCapabilityButton(model, capability, label, icon) {
  const active = model.capabilities?.includes(capability);
  const descriptions = {
    text: "用于普通文字对话",
    vision: "用于带图片的对话和画布识图节点",
    generation: "用于无参考图的图片生成",
    edit: "用于带参考图的图片编辑",
  };
  return `<button type="button" class="${active ? "active" : ""}" data-model-id="${escapeHtml(model.id)}" data-model-capability="${capability}" title="${descriptions[capability]}"><i data-lucide="${icon}"></i><span>${label}</span></button>`;
}

function renderModelResolutionTags(model) {
  if (!model.capabilities?.includes("generation")) return "";
  if (isMidjourneyModel(model.id)) return "";
  const active = normalizeImageResolutionValues(model.resolutions);
  const allowed = getSupportedImageResolutionLevels(model.id, model);
  return `<span class="model-resolution-picker" title="该生图模型支持的输出档位">
    ${allowed.map((level) => `<button type="button" class="${active.includes(level) ? "active" : ""}" data-model-id="${escapeHtml(model.id)}" data-model-resolution="${level}" aria-pressed="${active.includes(level)}">${formatImageResolutionLabel(level)}</button>`).join("")}
  </span>`;
}

function renderModelPlatformTags(model) {
  if (!model.capabilities?.includes("generation")) return "";
  if (isMidjourneyModel(model.id)) return "";
  const active = normalizeImagePlatform(model.platform, model.id);
  return `<span class="model-platform-picker" title="该生图模型使用的尺寸规范">
    ${["openai", "google"].map((platform) => `<button type="button" class="${active === platform ? "active" : ""}" data-model-id="${escapeHtml(model.id)}" data-model-platform="${platform}" aria-pressed="${active === platform}">${IMAGE_PLATFORM_LABELS[platform]}</button>`).join("")}
  </span>`;
}

function getProviderBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "")
    .replace(/\/v1\/api\/(?:generate|result)$/i, "")
    .replace(/\/models$/i, "")
    .replace(/\/chat\/completions$/i, "")
    .replace(/\/images\/(?:generations|edits)$/i, "");
}

function getProviderEndpointRows(baseUrl) {
  const clean = getProviderBaseUrl(baseUrl);
  const prefix = clean || "https://api.example.com/v1";
  const root = prefix.endsWith("/v1") ? prefix : `${prefix}/v1`;
  return [
    { label: "获取模型", icon: "list-restart", url: `${root}/models` },
    { label: "对话", icon: "message-square", url: `${root}/chat/completions` },
    { label: "图片生成", icon: "image", url: `${root}/images/generations` },
  ];
}

function recordProviderRuntimeCheck(providerId, status) {
  if (!providerId || !status?.state) return;
  const history = providerRuntimeHistory.get(providerId) || [];
  history.push({
    state: status.state,
    latencyMs: Number(status.latencyMs || 0),
    checkedAt: Date.now(),
  });
  providerRuntimeHistory.set(providerId, history.slice(-5));
}

function getProviderRuntimeHealth(providerId, status, runtimeState) {
  const history = providerRuntimeHistory.get(providerId) || [];
  const latestState = runtimeState === "error" ? "offline" : status?.state || "idle";
  const healthyStates = new Set(["online", "reachable"]);
  const healthyCount = history.filter((item) => healthyStates.has(item.state)).length;
  const failedCount = history.filter((item) => !healthyStates.has(item.state)).length;
  let state = latestState;
  if (latestState === "online" && Number(status?.latencyMs || 0) >= 4000) state = "slow";
  if (!["auth-error", "balance-error", "offline", "connection-error"].includes(latestState) && history.length >= 3 && healthyCount > 0 && failedCount > 0) {
    state = "unstable";
  }
  return { state, history, healthyCount, failedCount };
}

function renderProviderRuntimeHealthBars(health) {
  const history = health.history.slice(-5);
  const emptyCount = Math.max(0, 5 - history.length);
  const items = [
    ...Array.from({ length: emptyCount }, () => ({ state: "idle" })),
    ...history,
  ];
  return `<span class="provider-runtime-health-bars" title="最近 ${history.length} 次检测">
    ${items.map((item) => `<i class="is-${escapeHtml(item.state)}"></i>`).join("")}
  </span>`;
}

function formatProviderRuntimeFailure(message, state) {
  const raw = String(message || "");
  if (state === "balance-error") return "平台可以连接，但服务商明确返回余额不足，请充值后重试";
  if (state === "auth-error") return "\u5e73\u53f0\u4ecd\u53ef\u8fde\u63a5\uff0c\u4f46\u8d26\u53f7\u53ef\u80fd\u53d7 API Key\u3001\u6743\u9650\u6216\u4f59\u989d\u9650\u5236";
  if (/timeout|timed out|aborted/i.test(raw)) {
    return "\u8fde\u63a5\u8d85\u65f6\uff0c\u53ef\u80fd\u662f\u7ebf\u8def\u3001DNS \u6216\u670d\u52a1\u5546\u4e34\u65f6\u4e0d\u53ef\u8fbe";
  }
  if (/fetch failed|connect|network/i.test(raw)) return "\u65e0\u6cd5\u8fde\u63a5\u670d\u52a1\u5546\u7f51\u5173";
  return raw || "\u670d\u52a1\u5546\u5f53\u524d\u4e0d\u53ef\u8fbe";
}

function renderProviderRuntimeOverview(provider) {
  const runtime = providerRuntimeState.get(provider.id) || { state: "idle" };
  const loading = runtime.state === "loading";
  const status = runtime.status || {};
  const balance = runtime.balance || {};
  const pricing = runtime.pricing || {};
  const capability = runtime.capability || { state: "untested" };
  const health = getProviderRuntimeHealth(provider.id, status, runtime.state);
  const effectiveState = health.state;
  let statusLabel = loading
    ? "检测中"
    : status.state === "online"
      ? "可用"
      : status.state === "balance-error"
        ? "余额不足"
        : status.state === "auth-error"
        ? "鉴权失败"
        : runtime.state === "error" || ["offline", "connection-error"].includes(status.state)
          ? "不可用"
          : "待检测";
  let statusDetail = loading
    ? "正在连接模型接口"
    : status.state === "online"
      ? `${Number(status.latencyMs || 0)} ms · ${Number(status.modelCount || 0)} 个模型`
      : runtime.error || status.message || "打开设置后自动检测";
  if (!loading) {
    const labels = {
      unstable: "\u4e0d\u7a33\u5b9a",
      slow: "\u54cd\u5e94\u8f83\u6162",
      online: "\u53ef\u7528",
      reachable: "\u7f51\u7ad9\u5728\u7ebf",
      degraded: "\u670d\u52a1\u5f02\u5e38",
      "balance-error": "平台在线 · 余额不足",
      "auth-error": "\u8d26\u53f7\u53d7\u9650",
      offline: "\u4e0d\u53ef\u7528",
      idle: "\u5f85\u68c0\u6d4b",
      "connection-error": "\u5f53\u524d\u8bbe\u5907\u8fde\u63a5\u5931\u8d25",
    };
    statusLabel = labels[effectiveState] || labels.idle;
    if (effectiveState === "balance-error" && balance.state === "negative") statusLabel = "平台在线 · 余额为负";
    if (effectiveState === "balance-error" && balance.state === "depleted") statusLabel = "平台在线 · 余额为零";
    if (effectiveState === "unstable") {
      statusDetail = `\u8fd1 ${health.history.length} \u6b21 ${health.healthyCount} \u6b21\u6b63\u5e38 \u00b7 \u6700\u65b0 ${Number(status.latencyMs || 0)} ms`;
    } else if (effectiveState === "online" || effectiveState === "slow") {
      statusDetail = `${Number(status.latencyMs || 0)} ms \u00b7 ${Number(status.modelCount || 0)} \u4e2a\u6a21\u578b`;
    } else if (effectiveState === "reachable") {
      statusDetail = "\u7f51\u7ad9\u53ef\u4ee5\u8fde\u63a5\uff0c\u4f46\u672a\u63d0\u4f9b\u901a\u7528\u6a21\u578b\u5217\u8868\uff1b\u8bf7\u4ee5\u5b9e\u9645\u8c03\u7528\u7ed3\u679c\u4e3a\u51c6";
    } else if (effectiveState === "degraded") {
      statusDetail = `\u670d\u52a1\u5668\u6709\u54cd\u5e94\uff0c\u4f46\u5f53\u524d\u8fd4\u56de ${status.httpStatus || "\u5f02\u5e38"}`;
    } else if (effectiveState === "connection-error") {
      statusDetail = "\u672a\u6536\u5230 HTTP \u72b6\u6001\u7801\uff0c\u662f\u5f53\u524d\u8bbe\u5907\u7684 DNS\u3001TLS\u3001\u4ee3\u7406\u6216\u7f51\u7edc\u8def\u7531\u95ee\u9898\uff0c\u4e0d\u7b49\u4e8e\u5e73\u53f0\u505c\u673a";
    } else if (effectiveState === "balance-error" || effectiveState === "auth-error" || effectiveState === "offline") {
      statusDetail = effectiveState === "balance-error"
        ? balance.message || formatProviderRuntimeFailure(runtime.error || status.message, effectiveState)
        : formatProviderRuntimeFailure(runtime.error || status.message, effectiveState);
    }
  }
  const balanceLabel = loading
    ? "读取中"
    : balance.state === "available"
      ? formatProviderBalance(balance)
      : balance.state === "negative"
        ? formatProviderBalance(balance)
        : balance.state === "depleted"
      ? formatProviderBalance(balance)
      : balance.state === "insufficient"
        ? "余额不足"
        : balance.state === "error"
        ? "暂不可用"
        : balance.state === "unsupported"
          ? "未开放"
          : "待检测";
  const balanceDetail = balance.state === "available"
    ? getProviderBalanceCurrencyLabel(balance)
    : balance.state === "negative"
      ? balance.message || "当前 Key 余额为负，请充值或确认平台是否支持后付费"
      : balance.state === "depleted"
        ? balance.message || "当前 Key 余额为零，请充值后重试"
        : balance.state === "insufficient"
          ? balance.message || "平台已明确返回余额不足，请充值后重试"
          : balance.state === "unsupported"
            ? "服务商未开放余额接口，无法读取具体金额；真实调用返回余额不足时仍会提醒"
            : balance.message || "仅显示服务商公开接口数据";
  const priceItems = Array.isArray(pricing.items) ? pricing.items : [];
  const manualPriceItems = (provider.models || [])
    .filter((model) => model.capabilities?.includes("generation") && model.price)
    .map((model) => ({ model: model.alias || model.id, display: formatImagePriceValue(model.price) }));
  const visiblePriceItems = priceItems.length ? priceItems : manualPriceItems;
  const priceLabel = loading
    ? "读取中"
    : priceItems.length
      ? `${priceItems.length} 个实时报价`
      : manualPriceItems.length
        ? `${manualPriceItems.length} 个手动价格`
        : pricing.state === "unsupported"
          ? "未公开"
        : "待检测";
  const capabilityMeta = {
    verified: { label: "最近调用成功", detail: "真实请求已成功完成", icon: "badge-check" },
    untested: { label: "尚未验证", detail: "模型列表可读取，但尚无真实调用记录", icon: "circle-help" },
    "balance-error": { label: "调用失败 · 余额不足", detail: capability.message || "最近真实调用因余额不足失败", icon: "wallet-cards" },
    "auth-error": { label: "调用失败 · Key 无效", detail: capability.message || "最近真实调用鉴权失败", icon: "key-round" },
    "rate-limited": { label: "调用受限", detail: capability.message || "最近真实调用触发限流", icon: "timer-reset" },
    unstable: { label: "调用不稳定", detail: capability.message || "最近真实调用遇到网络或服务端错误", icon: "triangle-alert" },
    rejected: { label: "请求被拒绝", detail: capability.message || "最近真实调用参数或能力不受支持", icon: "ban" },
    failed: { label: "最近调用失败", detail: capability.message || "真实调用未成功", icon: "circle-x" },
  };
  const capabilityView = capabilityMeta[capability.state] || capabilityMeta.untested;
  const capabilityTime = capability.checkedAt
    ? new Date(capability.checkedAt).toLocaleString("zh-CN", {
        month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
      })
    : "";
  const updatedAt = runtime.checkedAt
    ? new Date(runtime.checkedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "";
  const stateClass = effectiveState === "online"
    ? "is-online"
    : effectiveState === "reachable"
      ? "is-reachable"
      : ["slow", "unstable", "degraded", "balance-error"].includes(effectiveState)
        ? "is-unstable"
        : ["offline", "connection-error"].includes(effectiveState)
          ? "is-error"
          : effectiveState === "auth-error" ? "is-unstable" : "";
  const statusIcon = effectiveState === "online"
    ? "circle-check"
    : effectiveState === "reachable"
      ? "link"
      : effectiveState === "balance-error"
        ? "wallet-cards"
        : effectiveState === "auth-error"
          ? "key-round"
          : effectiveState === "connection-error"
            ? "unplug"
            : ["slow", "unstable", "degraded"].includes(effectiveState) ? "triangle-alert" : "radio-tower";

  return `
    <section class="provider-runtime-overview ${stateClass}${loading ? " is-loading" : ""}" data-provider-runtime-id="${escapeHtml(provider.id)}">
      <header>
        <div><i data-lucide="activity"></i><strong>实时概况</strong><span>${updatedAt ? `更新于 ${updatedAt}` : "进入页面后自动刷新"}</span></div>
        <button type="button" data-settings-action="refresh-provider-runtime" title="刷新状态、余额和价格" ${loading ? "disabled" : ""}><i data-lucide="refresh-cw"></i><span>刷新</span></button>
      </header>
      <div class="provider-runtime-grid">
        <article class="provider-runtime-card runtime-status">
          <span class="provider-runtime-icon"><i data-lucide="${statusIcon}"></i>${renderProviderRuntimeHealthBars(health)}</span>
          <div><small>接口状态</small><strong>${escapeHtml(statusLabel)}</strong><p>${escapeHtml(statusDetail)}</p></div>
        </article>
        <article class="provider-runtime-card runtime-balance">
          <span class="provider-runtime-icon"><i data-lucide="wallet-cards"></i></span>
          <div class="provider-runtime-balance-content">
            <div class="provider-runtime-balance-copy">
              <small>充值余额</small><strong>${escapeHtml(balanceLabel)}</strong><p>${escapeHtml(balanceDetail)}</p>
            </div>
            <span class="provider-runtime-balance-actions">
              <button type="button" data-settings-action="open-provider-recharge"><i data-lucide="credit-card"></i>充值</button>
            </span>
          </div>
        </article>
        <article class="provider-runtime-card runtime-pricing">
          <span class="provider-runtime-icon"><i data-lucide="badge-dollar-sign"></i></span>
          <div>
            <small>模型价格</small><strong>${escapeHtml(priceLabel)}</strong>
            ${visiblePriceItems.length
              ? `<ul>${visiblePriceItems.slice(0, 3).map((item) => `<li><span>${escapeHtml(item.model)}</span><b>${escapeHtml(item.display)}</b></li>`).join("")}</ul>`
              : `<p>${escapeHtml(pricing.message || "价格必须由服务商接口返回")}</p>`}
          </div>
        </article>
        <article class="provider-runtime-card runtime-capability">
          <span class="provider-runtime-icon"><i data-lucide="${capabilityView.icon}"></i></span>
          <div>
            <small>真实调用</small><strong>${escapeHtml(capabilityView.label)}</strong>
            <p>${escapeHtml(`${capabilityView.detail}${capabilityTime ? ` · ${capabilityTime}` : ""}`)}</p>
          </div>
        </article>
      </div>
      <footer>平台、Key、余额和真实调用分别检测；模型列表可读取不代表生成一定成功。</footer>
    </section>
  `;
}

function formatProviderBalance(balance) {
  const value = Number(balance.value);
  if (!Number.isFinite(value)) return "未知";
  const formatted = value.toLocaleString("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: 4 });
  if (String(balance.currency || "").toUpperCase() === "CNY") return `¥ ${formatted}`;
  return balance.currency ? `${balance.currency} ${formatted}` : formatted;
}

function getProviderBalanceCurrencyLabel(balance) {
  const currency = String(balance.currency || "").toUpperCase();
  if (currency === "CNY") return "\u4eba\u6c11\u5e01 \u00b7 CNY";
  if (currency === "USD") return "\u7f8e\u5143 \u00b7 USD";
  if (currency) return `\u5e01\u79cd \u00b7 ${currency}`;
  return "\u5e73\u53f0\u989d\u5ea6 \u00b7 \u5e01\u79cd\u672a\u6807\u6ce8";
}

function getDefaultProviderRechargeUrl(baseUrl) {
  try {
    const url = new URL(getProviderBaseUrl(baseUrl));
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const routes = [
      { host: "ainb.plus", path: "/wallet" },
      { host: "uuapi.net", path: "/dashboard" },
      { host: "hyhawang.com", path: "/purchase" },
      { host: "clse-ai.com", path: "/dashboard" },
    ];
    const match = routes.find((item) => host === item.host || host.endsWith(`.${item.host}`));
    return match ? `${url.origin}${match.path}` : url.origin;
  } catch {
    return "";
  }
}

function getProviderRechargeUrl(provider) {
  return String(provider?.rechargeUrl || "").trim() || getDefaultProviderRechargeUrl(provider?.baseUrl);
}

function updateProviderRuntimeOverview(providerId = activeSettingsProviderId) {
  const provider = settingsState?.providers?.find((item) => item.id === providerId);
  const target = document.querySelector(`[data-provider-runtime-id="${CSS.escape(providerId)}"]`);
  if (!provider || !target) return;
  target.outerHTML = renderProviderRuntimeOverview(provider);
  window.lucide?.createIcons({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
}

async function verifyProviderAgent(modelId, providerId = activeSettingsProviderId, options = {}) {
  const provider = settingsState?.providers?.find((item) => item.id === providerId);
  const model = provider?.models?.find((item) => item.id === modelId) || (provider ? { id: modelId, capabilities: [] } : null);
  if (!provider || !model) return;
  const draftProvider = isAgentVerificationDraft(provider) ? createAgentVerificationDraft(provider) : null;
  const requestSignature = JSON.stringify({ providerId: provider.id, modelId: model.id, draftProvider });
  if (!provider.baseUrl || (draftProvider ? !draftProvider.apiKey : (!provider.apiKey && !provider.hasApiKey))) {
    if (!options.automatic) setSettingsSaveState(draftProvider ? "请先填写 API 地址与 Key。" : "请先填写并保存 API 地址与 Key。", true);
    return;
  }
  const key = `${provider.id}:${model.id}`;
  if (providerAgentVerificationState.get(key)?.state === "loading") return;
  providerAgentVerificationState.set(key, { state: "loading", stage: "connecting" });
  if (!options.automatic) setSettingsSaveState("正在连接接口并验证 Agent 能力…");
  updateProviderAgentVerification(provider, model);
  renderAgentModelSettings();
  const phaseTimer = setTimeout(() => {
    if (providerAgentVerificationState.get(key)?.state !== "loading") return;
    providerAgentVerificationState.set(key, { state: "loading", stage: "probing" });
    updateProviderAgentVerification(provider, model);
    renderAgentModelSettings();
  }, 320);
  try {
    const response = await fetch(SETTINGS_PROVIDER_AGENT_VERIFY_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        providerId: provider.id,
        modelId: model.id,
        ...(draftProvider ? { draftProvider } : {}),
      }),
      signal: options.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (options.automatic && (
      options.signal?.aborted
      || options.verificationEpoch !== agentAutoVerificationEpoch
      || !isAgentModelsSettingsVisible()
    )) {
      providerAgentVerificationState.delete(key);
      return { aborted: true };
    }
    if (!isAgentVerificationRequestCurrent(provider.id, model.id, requestSignature)) return { stale: true };
    if (!response.ok) throw new Error(data.error || "Agent 实测失败。");
    providerAgentVerificationState.set(key, { ...data, draft: Boolean(draftProvider && data.draft) });
    updateProviderAgentVerification(provider, model);
    renderAgentModelSettings();
    await loadAgentRoutingCandidates({ silent: true });
    const quality = CanvasAgentVerification.classifyVerificationQuality(data);
    if (!options.automatic) setSettingsSaveState(data.tools
      ? `${draftProvider ? "验证通过，尚未保存" : quality?.label || "Agent 实测通过"}：工具调用 ${Number(data.latencyMs || 0)} ms${draftProvider ? "，保存后加入 Agent 备用池" : ""}`
      : "模型可以推理，但工具调用尚未通过。", !data.tools);
    return;
  } catch (error) {
    if (options.automatic && (error?.name === "AbortError" || options.signal?.aborted)) {
      providerAgentVerificationState.delete(key);
      return { aborted: true };
    }
    if (!isAgentVerificationRequestCurrent(provider.id, model.id, requestSignature)) return { stale: true };
    providerAgentVerificationState.set(key, { state: "failed", message: error.message });
    updateProviderAgentVerification(provider, model);
    renderAgentModelSettings();
    if (!options.automatic) setSettingsSaveState(error.message, true);
  } finally {
    clearTimeout(phaseTimer);
  }
  await loadAgentRoutingCandidates({ silent: true });
  renderAgentModelSettings();
}

async function refreshProviderRuntime({ silent = false } = {}) {
  const provider = getActiveSettingsProvider();
  if (!provider) return;
  if (!provider.baseUrl || (!provider.apiKey && !provider.hasApiKey)) {
    providerRuntimeState.set(provider.id, { state: "idle" });
    updateProviderRuntimeOverview(provider.id);
    return;
  }
  const requestId = ++providerRuntimeRequestSerial;
  providerRuntimeRequestIds.set(provider.id, requestId);
  providerRuntimeState.set(provider.id, { ...providerRuntimeState.get(provider.id), state: "loading" });
  updateProviderRuntimeOverview(provider.id);
  try {
    const response = await fetch(SETTINGS_PROVIDER_RUNTIME_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId: provider.id, baseUrl: provider.baseUrl, apiKey: provider.apiKey }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "实时状态读取失败。");
    if (providerRuntimeRequestIds.get(provider.id) !== requestId) return;
    recordProviderRuntimeCheck(provider.id, data.status);
    providerRuntimeState.set(provider.id, { state: "ready", ...data });
  } catch (error) {
    if (providerRuntimeRequestIds.get(provider.id) !== requestId) return;
    const errorStatus = { state: "offline", latencyMs: 0 };
    recordProviderRuntimeCheck(provider.id, errorStatus);
    providerRuntimeState.set(provider.id, { state: "error", error: error.message, status: errorStatus });
    if (!silent) setSettingsSaveState(error.message, true);
  }
  updateProviderRuntimeOverview(provider.id);
}

function stopProviderRuntimePolling() {
  if (providerRuntimeTimer) clearInterval(providerRuntimeTimer);
  providerRuntimeTimer = 0;
}

function startProviderRuntimePolling() {
  stopProviderRuntimePolling();
  if (!settingsState || activeSettingsTab !== "api") return;
  refreshProviderRuntime({ silent: true });
  providerRuntimeTimer = setInterval(() => {
    if (document.querySelector("#settingsView")?.classList.contains("active") && activeSettingsTab === "api") {
      refreshProviderRuntime({ silent: true });
    }
  }, 60000);
}

async function handleSettingsClick(event) {
  const tab = event.target.closest("[data-settings-tab]");
  if (tab) {
    const agentSettingsWasVisible = isAgentModelsSettingsVisible();
    activeSettingsTab = tab.dataset.settingsTab;
    renderSettingsCenter();
    const agentSettingsIsVisible = isAgentModelsSettingsVisible();
    if (!agentSettingsWasVisible && agentSettingsIsVisible) beginAgentAutoVerificationSession();
    else if (agentSettingsWasVisible && !agentSettingsIsVisible) stopAgentAutoVerificationSession();
    if (activeSettingsTab === "api") {
      startProviderRuntimePolling();
    }
    else stopProviderRuntimePolling();
    if (activeSettingsTab === "agent-models") {
      void loadAgentRoutingCandidates({ silent: false, refresh: true });
    }
    if (activeSettingsTab === "monitoring") startProviderMonitoringPolling();
    else stopProviderMonitoringPolling();
    return;
  }
  const monitoringRangeButton = event.target.closest("[data-monitoring-range]");
  if (monitoringRangeButton) {
    providerMonitoringRange = monitoringRangeButton.dataset.monitoringRange || "realtime";
    await loadProviderMonitoring();
    return;
  }
  const candidateVerify = event.target.closest("[data-agent-candidate-verify]");
  if (candidateVerify) {
    await verifyProviderAgent(candidateVerify.dataset.modelId, candidateVerify.dataset.providerId);
    return;
  }
  const providerButton = event.target.closest("[data-provider-id]");
  if (providerButton) {
    activeSettingsProviderId = providerButton.dataset.providerId;
    renderSettingsCenter();
    startProviderRuntimePolling();
    return;
  }
  const theme = event.target.closest("[data-settings-theme]");
  if (theme) {
    settingsState.appearance.theme = theme.dataset.settingsTheme;
    setThemeMode(theme.dataset.settingsTheme);
    renderSettingsCenter();
    markSettingsDirty();
    return;
  }
  const palette = event.target.closest("[data-settings-palette]");
  if (palette) {
    settingsState.appearance.palette = palette.dataset.settingsPalette || "yellow-black";
    setColorPalette(settingsState.appearance.palette);
    renderSettingsCenter();
    markSettingsDirty();
    return;
  }
  const filter = event.target.closest("[data-model-filter]")?.dataset.modelFilter;
  if (filter) {
    fetchedProviderModelFilter = filter;
    renderModelPicker();
    return;
  }
  const modelChoice = event.target.closest("[data-fetched-model]");
  if (modelChoice) {
    const id = modelChoice.dataset.fetchedModel;
    if (selectedFetchedProviderModels.has(id)) selectedFetchedProviderModels.delete(id);
    else selectedFetchedProviderModels.add(id);
    renderModelPicker();
    return;
  }
  const capabilityButton = event.target.closest("[data-model-capability]");
  if (capabilityButton) {
    const provider = getActiveSettingsProvider();
    const model = provider?.models.find((item) => item.id === capabilityButton.dataset.modelId);
    if (model) {
      clearProviderAgentVerificationStates(provider.id);
      model.capabilities ||= [];
      const capability = capabilityButton.dataset.modelCapability;
      if (model.capabilities.includes(capability)) {
        model.capabilities = model.capabilities.filter((item) => item !== capability);
      } else {
        model.capabilities.push(capability);
        if (capability === "generation") model.resolutions = normalizeImageResolutionValues(model.resolutions);
      }
      renderSettingsCenter();
      markSettingsDirty();
    }
    return;
  }
  const resolutionButton = event.target.closest("[data-model-resolution]");
  if (resolutionButton) {
    const provider = getActiveSettingsProvider();
    const model = provider?.models.find((item) => item.id === resolutionButton.dataset.modelId);
    if (model) {
      const level = resolutionButton.dataset.modelResolution;
      const current = normalizeImageResolutionValues(model.resolutions);
      model.resolutions = current.includes(level)
        ? current.filter((item) => item !== level)
        : sortImageResolutionValues([...current, level]);
      if (!model.resolutions.length) model.resolutions = [level];
      renderSettingsCenter();
      markSettingsDirty();
    }
    return;
  }
  const platformButton = event.target.closest("[data-model-platform]");
  if (platformButton) {
    const provider = getActiveSettingsProvider();
    const model = provider?.models.find((item) => item.id === platformButton.dataset.modelId);
    if (model) {
      model.platform = normalizeImagePlatform(platformButton.dataset.modelPlatform, model.id);
      renderSettingsCenter();
      markSettingsDirty();
    }
    return;
  }
  const action = event.target.closest("[data-settings-action]")?.dataset.settingsAction;
  if (!action) return;
  if (action === "add-provider") {
    const customCount = settingsState.providers.filter((provider) => !provider.managed).length;
    const provider = { id: createId(), name: `New API ${customCount + 1}`, baseUrl: "", apiKey: "", rechargeUrl: "", enabled: true, models: [] };
    settingsState.providers.push(provider);
    activeSettingsProviderId = provider.id;
    renderSettingsCenter();
    markSettingsDirty();
  } else if (action === "delete-provider") {
    if (getActiveSettingsProvider()?.managed) return;
    settingsState.providers = settingsState.providers.filter((provider) => provider.id !== activeSettingsProviderId);
    activeSettingsProviderId = settingsState.providers[0]?.id || "";
    renderSettingsCenter();
    markSettingsDirty();
  } else if (action === "delete-model") {
    const button = event.target.closest('[data-settings-action="delete-model"]');
    const provider = getActiveSettingsProvider();
    const model = provider?.models?.find((item) => item.id === button?.dataset.modelId);
    if (!model || !removeProviderModelFromDraft(provider, model.id)) return;
    clearProviderAgentVerificationStates(provider.id);
    renderSettingsCenter();
    markSettingsDirty(`\u5df2\u79fb\u9664\u6a21\u578b ${model.alias || model.id}\uff0c\u8bf7\u4fdd\u5b58\u8bbe\u7f6e`);
  } else if (action === "toggle-key") {
    await toggleSettingsProviderKeyVisibility(event.target.closest('[data-settings-action="toggle-key"]'));
  } else if (action === "fetch-models") {
    await fetchSettingsProviderModels();
  } else if (action === "refresh-model-picker") {
    await fetchSettingsProviderModels(true);
  } else if (action === "close-model-picker") {
    closeSettingsModelPicker();
  } else if (action === "add-selected-models") {
    addSelectedProviderModels();
  } else if (action === "verify-provider-agent") {
    const modelId = event.target.closest('[data-settings-action="verify-provider-agent"]')?.dataset.modelId;
    if (modelId) await verifyProviderAgent(modelId);
  } else if (action === "refresh-agent-candidates") {
    await loadAgentRoutingCandidates({ refresh: true });
  } else if (action === "set-agent-primary") {
    const candidateId = event.target.closest('[data-settings-action="set-agent-primary"]')?.dataset.candidateId || "";
    settingsState.agentRouting = snapshotAgentRoutingDraft(candidateId);
    renderAgentModelSettings();
    markSettingsDirty("主模型已更改，请保存设置");
  } else if (action === "clear-agent-primary") {
    settingsState.agentRouting = snapshotAgentRoutingDraft("");
    renderAgentModelSettings();
    markSettingsDirty("已恢复自动选择，请保存设置");
  } else if (action === "refresh-provider-runtime") {
    await refreshProviderRuntime();
  } else if (action === "open-provider-recharge") {
    const url = getProviderRechargeUrl(getActiveSettingsProvider());
    if (!url) {
      setSettingsSaveState("\u8bf7\u5148\u586b\u5199\u5145\u503c\u9875\u9762\u5730\u5740\u3002", true);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  } else if (action === "refresh-provider-monitoring") {
    await loadProviderMonitoring({ refresh: true });
  } else if (action === "view-monitored-provider") {
    const providerId = event.target.closest("[data-monitoring-provider-id]")?.dataset.monitoringProviderId;
    if (!providerId) return;
    activeSettingsProviderId = providerId;
    activeSettingsTab = "api";
    renderSettingsCenter();
    stopProviderMonitoringPolling();
    startProviderRuntimePolling();
  } else if (action === "toggle-monitored-provider") {
    const providerId = event.target.closest("[data-monitoring-provider-id]")?.dataset.monitoringProviderId;
    const provider = settingsState.providers.find((item) => item.id === providerId);
    if (!provider || provider.managed) return;
    provider.enabled = !provider.enabled;
    markSettingsDirty(provider.enabled ? "\u5df2\u6062\u590d\u63a5\u5165\uff0c\u8bf7\u4fdd\u5b58\u8bbe\u7f6e" : "\u5df2\u505c\u7528\u63a5\u5165\uff0c\u53ef\u968f\u65f6\u6062\u590d");
    if (providerMonitoringState.data?.providers) {
      const row = providerMonitoringState.data.providers.find((item) => item.id === providerId);
      if (row) Object.assign(row, { enabled: provider.enabled, state: provider.enabled ? "unknown" : "disabled" });
    }
    renderSettingsMonitoring();
  } else if (action === "save") {
    await saveSettingsCenter();
  } else if (action === "reload") {
    await loadSettingsCenter();
  }
}

async function toggleSettingsProviderKeyVisibility(button) {
  const input = document.querySelector('[data-provider-field="apiKey"]');
  const provider = getActiveSettingsProvider();
  if (!input || !provider || !button) return;
  if (input.type === "text") {
    input.type = "password";
    button.title = "显示 Key";
    button.innerHTML = '<i data-lucide="eye"></i>';
    window.lucide?.createIcons({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
    return;
  }
  try {
    if (!input.value && provider.hasApiKey) {
      button.disabled = true;
      const response = await fetch(SETTINGS_PROVIDER_KEY_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: provider.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "读取 API Key 失败。");
      input.value = data.apiKey || "";
    }
    input.type = "text";
    button.title = "隐藏 Key";
    button.innerHTML = '<i data-lucide="eye-off"></i>';
  } catch (error) {
    setSettingsSaveState(error.message, true);
  } finally {
    button.disabled = false;
    window.lucide?.createIcons({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
  }
}

function handleSettingsInput(event) {
  if (!settingsState) return;
  const provider = getActiveSettingsProvider();
  const modelPriceId = event.target.dataset.modelPrice;
  if (provider && modelPriceId !== undefined) {
    const model = provider.models?.find((item) => item.id === modelPriceId);
    if (model) model.price = event.target.value;
    markSettingsDirty();
    return;
  }
  const providerField = event.target.dataset.providerField;
  if (provider && providerField) {
    if (provider.managed) return;
    provider[providerField] = event.target.type === "checkbox" ? event.target.checked : event.target.value;
    if (["baseUrl", "apiKey", "enabled"].includes(providerField)) clearProviderAgentVerificationStates(provider.id);
    if (providerField === "enabled") renderSettingsCenter();
    if (providerField === "baseUrl" || providerField === "apiKey") {
      providerRuntimeState.delete(provider.id);
      providerRuntimeHistory.delete(provider.id);
      updateProviderRuntimeOverview(provider.id);
    }
    markSettingsDirty();
    return;
  }
  const group = event.target.dataset.settingsGroup;
  const field = event.target.dataset.settingsField;
  if (group && field) {
    settingsState[group][field] = event.target.type === "checkbox" ? event.target.checked : Number(event.target.value);
    applySettingsPreferences();
    markSettingsDirty();
  }
}

async function fetchSettingsProviderModels(keepSelection = false) {
  const provider = getActiveSettingsProvider();
  if (!provider) return;
  setSettingsSaveState("正在获取模型...");
  try {
    const response = await fetch(SETTINGS_PROVIDER_MODELS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId: provider.id, baseUrl: provider.baseUrl, apiKey: provider.apiKey }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "获取模型失败。");
    fetchedProviderModels = data.models;
    if (!keepSelection) selectedFetchedProviderModels = new Set();
    fetchedProviderModelFilter = "all";
    openSettingsModelPicker();
    setSettingsSaveState(`已获取 ${data.models.length} 个模型`);
  } catch (error) {
    setSettingsSaveState(error.message, true);
  }
}

function openSettingsModelPicker() {
  const picker = document.querySelector("#settingsModelPicker");
  if (!picker) return;
  picker.hidden = false;
  document.querySelector("#modelPickerSearch").value = "";
  renderModelPicker();
}

function closeSettingsModelPicker() {
  const picker = document.querySelector("#settingsModelPicker");
  if (picker) picker.hidden = true;
}

function getFetchedModelKind(model) {
  const value = String(model || "").toLowerCase();
  return /image|banana|dall|flux|sdxl|stable|midjourney|ideogram/.test(value) ? "image" : "chat";
}

function renderModelPicker() {
  const list = document.querySelector("#modelPickerList");
  if (!list) return;
  const query = String(document.querySelector("#modelPickerSearch")?.value || "").trim().toLowerCase();
  const existing = new Set(getActiveSettingsProvider()?.models?.map((model) => model.id) || []);
  const visible = fetchedProviderModels.filter((model) => {
    const kind = getFetchedModelKind(model);
    return (!query || model.toLowerCase().includes(query))
      && (fetchedProviderModelFilter === "all" || fetchedProviderModelFilter === kind);
  });
  list.innerHTML = visible.length ? visible.map((model) => {
    const kind = getFetchedModelKind(model);
    const selected = selectedFetchedProviderModels.has(model);
    return `<button type="button" class="model-picker-row ${selected ? "selected" : ""}" data-fetched-model="${escapeHtml(model)}">
      <span class="model-picker-check"><i data-lucide="${selected ? "check" : "plus"}"></i></span>
      <span><strong>${escapeHtml(model)}</strong><small>${kind === "image" ? "图片模型" : "文本模型"}${existing.has(model) ? " · 已添加" : ""}</small></span>
      <b>${kind === "image" ? "图片" : "文本"}</b>
    </button>`;
  }).join("") : '<div class="provider-model-empty"><i data-lucide="search-x"></i><span>没有匹配的模型</span></div>';
  document.querySelector("#modelCountAll").textContent = fetchedProviderModels.length;
  document.querySelector("#modelCountChat").textContent = fetchedProviderModels.filter((model) => getFetchedModelKind(model) === "chat").length;
  document.querySelector("#modelCountImage").textContent = fetchedProviderModels.filter((model) => getFetchedModelKind(model) === "image").length;
  document.querySelector("#modelPickerSelection").textContent = `已选择 ${selectedFetchedProviderModels.size} 个模型`;
  document.querySelectorAll("[data-model-filter]").forEach((button) => button.classList.toggle("active", button.dataset.modelFilter === fetchedProviderModelFilter));
  window.lucide?.createIcons({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
}

function addSelectedProviderModels() {
  const provider = getActiveSettingsProvider();
  if (!provider || !selectedFetchedProviderModels.size) return;
  const existing = new Map(provider.models.map((model) => [model.id, model]));
  selectedFetchedProviderModels.forEach((id) => {
    if (!existing.has(id)) provider.models.push({ id, alias: "", capabilities: [] });
  });
  clearProviderAgentVerificationStates(provider.id);
  closeSettingsModelPicker();
  renderSettingsCenter();
  markSettingsDirty(`已添加 ${selectedFetchedProviderModels.size} 个模型，请分配用途后保存`);
}

async function saveSettingsCenter() {
  setSettingsSaveState("正在保存...");
  try {
    settingsState.agentRouting = snapshotAgentRoutingDraft();
    const response = await fetch(SETTINGS_API_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settingsState),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "设置保存失败。");
    settingsState = data;
    savedSettingsSnapshot = cloneSettingsState(data);
    promoteSavedDraftVerificationStates();
    applySettingsPreferences();
    renderSettingsCenter();
    await loadAgentRoutingCandidates({ silent: true, refresh: true });
    await Promise.all([loadChatModels(), loadVisionModels(), loadImageModels()]);
    setSettingsSaveState("设置已保存，模型列表已更新");
    startProviderRuntimePolling();
    startProviderMonitoringPolling();
  } catch (error) {
    setSettingsSaveState(error.message, true);
  }
}

function getActiveSettingsProvider() {
  return settingsState?.providers?.find((provider) => provider.id === activeSettingsProviderId) || null;
}

function createAgentVerificationDraft(provider) {
  return {
    id: String(provider?.id || ""),
    name: String(provider?.name || "未命名 API"),
    enabled: provider?.enabled !== false,
    baseUrl: String(provider?.baseUrl || "").trim(),
    apiKey: String(provider?.apiKey || "").trim(),
    models: (provider?.models || []).map((model) => ({
      id: String(model?.id || "").trim(),
      capabilities: [...new Set(Array.isArray(model?.capabilities) ? model.capabilities : [])].sort(),
    })).filter((model) => model.id),
  };
}

function isAgentVerificationDraft(provider) {
  if (!provider) return false;
  const saved = (savedSettingsSnapshot?.providers || []).find((item) => item.id === provider.id);
  if (!saved) return true;
  if (String(provider.apiKey || "").trim()) return true;
  const comparable = (item) => ({
    enabled: item?.enabled !== false,
    baseUrl: String(item?.baseUrl || "").trim(),
    models: (item?.models || []).map((model) => ({
      id: String(model?.id || "").trim(),
      capabilities: [...new Set(Array.isArray(model?.capabilities) ? model.capabilities : [])].sort(),
    })).filter((model) => model.id),
  });
  return JSON.stringify(comparable(provider)) !== JSON.stringify(comparable(saved));
}

function getAgentVerificationRequestSignature(provider, model) {
  if (!provider || !model) return "";
  const draftProvider = isAgentVerificationDraft(provider) ? createAgentVerificationDraft(provider) : null;
  return JSON.stringify({
    providerId: String(provider.id || ""),
    modelId: String(model.id || ""),
    draftProvider,
  });
}

function isAgentVerificationRequestCurrent(providerId, modelId, requestSignature) {
  const provider = settingsState?.providers?.find((item) => item.id === providerId);
  const model = provider?.models?.find((item) => item.id === modelId) || (provider ? { id: modelId, capabilities: [] } : null);
  return getAgentVerificationRequestSignature(provider, model) === requestSignature;
}

function clearProviderAgentVerificationStates(providerId) {
  const prefix = `${String(providerId || "")}:`;
  if (!prefix || prefix === ":") return;
  let changed = false;
  [...providerAgentVerificationState.keys()].forEach((key) => {
    if (!key.startsWith(prefix)) return;
    providerAgentVerificationState.delete(key);
    changed = true;
  });
  const provider = settingsState?.providers?.find((item) => item.id === providerId);
  if (changed && provider?.id === activeSettingsProviderId) {
    (provider.models || []).forEach((model) => updateProviderAgentVerification(provider, model));
  }
}

function promoteSavedDraftVerificationStates() {
  providerAgentVerificationState.forEach((state, key) => {
    if (state?.state !== "verified" || state.draft !== true) return;
    providerAgentVerificationState.set(key, { ...state, draft: false });
  });
}

function removeProviderModelFromDraft(provider, modelId) {
  if (!provider || !Array.isArray(provider.models)) return false;
  const index = provider.models.findIndex((model) => model.id === modelId);
  if (index < 0) return false;
  provider.models.splice(index, 1);
  return true;
}

function markSettingsDirty(message = "") {
  const changes = describeSettingsChanges();
  const summary = changes.length
    ? `未保存：${changes.slice(0, 2).join("；")}${changes.length > 2 ? ` 等 ${changes.length} 项` : ""}`
    : message || "有未保存的更改";
  setSettingsSaveState(summary, false, changes.join("\n") || summary);
}

function setSettingsSaveState(message, error = false, detail = "") {
  const target = document.querySelector("#settingsSaveState");
  if (!target) return;
  target.textContent = message;
  target.title = detail || message;
  target.classList.toggle("error", error);
  target.classList.toggle("dirty", message.startsWith("未保存：") || message.includes("未保存"));
}

function cloneSettingsState(value) {
  return value ? JSON.parse(JSON.stringify(value)) : null;
}

function describeSettingsChanges() {
  if (!settingsState || !savedSettingsSnapshot) return [];
  const changes = [];
  const beforeProviders = new Map((savedSettingsSnapshot.providers || []).map((provider) => [provider.id, provider]));
  const afterProviders = new Map((settingsState.providers || []).map((provider) => [provider.id, provider]));
  const capabilityNames = { text: "文本", vision: "识图", generation: "生图", edit: "编辑" };

  afterProviders.forEach((provider, id) => {
    const before = beforeProviders.get(id);
    if (!before) {
      changes.push(`新增 API「${provider.name}」`);
      return;
    }
    const providerName = provider.name || before.name || "未命名 API";
    if (provider.name !== before.name) changes.push(`API「${before.name}」名称`);
    if (provider.baseUrl !== before.baseUrl) changes.push(`「${providerName}」地址`);
    if (provider.apiKey) changes.push(`「${providerName}」Key`);
    if (provider.enabled !== before.enabled) changes.push(`「${providerName}」${provider.enabled ? "已启用" : "已停用"}`);

    const beforeModels = new Map((before.models || []).map((model) => [model.id, model]));
    const afterModels = new Map((provider.models || []).map((model) => [model.id, model]));
    afterModels.forEach((model, modelId) => {
      const oldModel = beforeModels.get(modelId);
      if (!oldModel) {
        changes.push(`「${providerName}」新增模型 ${model.alias || modelId}`);
        return;
      }
      const oldCapabilities = new Set(oldModel.capabilities || []);
      const newCapabilities = new Set(model.capabilities || []);
      [...new Set([...oldCapabilities, ...newCapabilities])].forEach((capability) => {
        if (oldCapabilities.has(capability) === newCapabilities.has(capability)) return;
        changes.push(`${model.alias || modelId}：${capabilityNames[capability] || capability}${newCapabilities.has(capability) ? "已开启" : "已关闭"}`);
      });
      const oldResolutions = normalizeImageResolutionValues(oldModel.resolutions).join("/");
      const newResolutions = normalizeImageResolutionValues(model.resolutions).join("/");
      if (oldResolutions !== newResolutions) changes.push(`${model.alias || modelId}：生图档位 ${newResolutions.split("/").map(formatImageResolutionLabel).join("、")}`);
      const oldPlatform = normalizeImagePlatform(oldModel.platform, oldModel.id);
      const newPlatform = normalizeImagePlatform(model.platform, model.id);
      if (oldPlatform !== newPlatform) changes.push(`${model.alias || modelId}：平台 ${IMAGE_PLATFORM_LABELS[newPlatform] || newPlatform}`);
      if (String(oldModel.price || "") !== String(model.price || "")) changes.push(`${model.alias || modelId}：单价 ${model.price ? formatImagePriceValue(model.price) : "已清空"}`);
    });
    beforeModels.forEach((model, modelId) => {
      if (!afterModels.has(modelId)) changes.push(`「${providerName}」移除模型 ${model.alias || modelId}`);
    });
  });
  beforeProviders.forEach((provider, id) => {
    if (!afterProviders.has(id)) changes.push(`移除 API「${provider.name}」`);
  });

  [["canvas", "画布偏好"], ["appearance", "个性化"], ["storage", "本地存储"]].forEach(([group, label]) => {
    if (JSON.stringify(settingsState[group] || {}) !== JSON.stringify(savedSettingsSnapshot[group] || {})) changes.push(`${label}设置`);
  });
  return [...new Set(changes)];
}

function applySettingsPreferences() {
  if (!settingsState) return;
  document.documentElement.dataset.canvasKeepAspect = String(Boolean(settingsState.canvas?.keepAspect));
  document.documentElement.dataset.canvasControlBottom = String(Boolean(settingsState.canvas?.controlBarBottom));
  document.documentElement.dataset.canvasDisconnectMenu = String(Boolean(settingsState.canvas?.disconnectMenu));
  document.documentElement.dataset.animations = settingsState.appearance?.animations === false ? "off" : "on";
  setColorPalette(settingsState.appearance?.palette || "yellow-black");
  if (settingsState.appearance?.theme) setThemeMode(settingsState.appearance.theme);
}

function initializeCanvasFirstShell() {
  const stage = document.querySelector(".stage");
  const nav = document.querySelector(".rail-nav");
  const canvasView = document.querySelector("#canvasView");
  if (!stage || !nav || !canvasView) return;

  document.body.classList.add("canvas-first-shell");
  document.querySelector('[data-tool="canvas"]')?.remove();
  document.querySelectorAll("[data-view]").forEach((view) => {
    view.classList.toggle("active", view.id === "canvasView");
    if (view.id !== "canvasView") {
      view.classList.add("canvas-tool-overlay");
      if (!view.querySelector(".canvas-overlay-close")) {
        const close = document.createElement("button");
        close.className = "canvas-overlay-close";
        close.type = "button";
        close.title = "关闭";
        close.setAttribute("aria-label", "关闭功能窗口");
        close.innerHTML = '<i data-lucide="x"></i>';
        close.addEventListener("click", () => setActiveTool("canvas"));
        view.prepend(close);
      }
    }
  });

  if (!nav.querySelector("[data-canvas-new]")) {
    const create = document.createElement("button");
    create.className = "canvas-create-button";
    create.type = "button";
    create.dataset.canvasNew = "true";
    create.title = "新建画布";
    create.setAttribute("aria-label", "新建画布");
    create.innerHTML = '<i data-lucide="plus"></i><span>新建画布</span>';
    create.addEventListener("click", () => {
      promptCreateCanvasBoard();
    });
    nav.prepend(create);
  }

  if (!nav.querySelector('[data-tool="settings"]')) {
    const settings = document.createElement("button");
    settings.className = "nav-item settings-nav-item";
    settings.type = "button";
    settings.dataset.tool = "settings";
    settings.innerHTML = '<span class="nav-icon"><i data-lucide="settings-2"></i></span><span>设置</span>';
    nav.append(settings);
  }

  const labels = {
    image: ["在线生图", "image-plus"],
    chat: ["GPT 对话", "message-square"],
    records: ["记录", "history"],
    settings: ["设置", "settings-2"],
  };
  nav.querySelectorAll(".nav-item").forEach((button) => {
    const [label] = labels[button.dataset.tool] || [button.textContent.trim()];
    button.classList.remove("active");
    button.title = label;
    button.setAttribute("aria-label", label);
  });

  if (!canvasView.querySelector(".canvas-start-gate")) {
    const gate = document.createElement("div");
    gate.className = "canvas-start-gate";
    gate.innerHTML = `
      <div class="canvas-start-copy">
        <strong>双击画布，开始创作</strong>
        <span>新建一个空白画布，或者继续之前的创作</span>
      </div>
      <div class="canvas-start-actions">
        <button type="button" data-start-action="new"><i data-lucide="plus"></i><span>新建画布</span></button>
        <button type="button" data-start-action="history"><i data-lucide="history"></i><span>历史画布</span></button>
      </div>
    `;
    gate.addEventListener("dblclick", (event) => {
      if (event.target.closest("button")) return;
      promptCreateCanvasBoard();
    });
    gate.querySelector('[data-start-action="new"]').addEventListener("click", () => {
      promptCreateCanvasBoard();
    });
    gate.querySelector('[data-start-action="history"]').addEventListener("click", () => {
      openCanvasBoardPanel();
    });
    canvasView.querySelector(".canvas-workspace")?.append(gate);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("canvas-overlay-open")) {
      setActiveTool("canvas");
    }
  });
}

function syncCanvasWorkspaceState() {
  const hasActiveBoard = Boolean(canvasState.activeBoardId);
  document.querySelector(".canvas-workspace")?.classList.toggle("has-active-board", hasActiveBoard);
  document.querySelector(".canvas-start-gate")?.classList.toggle("is-dismissed", hasActiveBoard);
  updateCanvasOrigin();
}

function initializeTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY) || "system";
  setThemeMode(saved, false);
  setColorPalette(localStorage.getItem(PALETTE_STORAGE_KEY) || "yellow-black", false);
  const systemQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
  systemQuery?.addEventListener?.("change", () => {
    if ((localStorage.getItem(THEME_STORAGE_KEY) || "system") === "system") applyTheme("system");
  });
}

function initializeRail() {
  const pinned = localStorage.getItem(RAIL_PIN_STORAGE_KEY) === "true";
  document.documentElement.classList.toggle("rail-pinned", pinned);
  updateRailToggle(pinned);
  railToggle?.addEventListener("click", () => {
    const nextPinned = !document.documentElement.classList.contains("rail-pinned");
    document.documentElement.classList.toggle("rail-pinned", nextPinned);
    localStorage.setItem(RAIL_PIN_STORAGE_KEY, String(nextPinned));
    updateRailToggle(nextPinned);
  });
}

function updateRailToggle(pinned) {
  if (!railToggle) return;
  railToggle.classList.toggle("is-pinned", pinned);
  railToggle.setAttribute("aria-pressed", String(pinned));
  railToggle.title = pinned ? "取消固定导航栏" : "固定导航栏";
  railToggle.querySelector("span").textContent = pinned ? "‹" : "›";
}

function initializeOnlineStatus() {
  const update = async () => {
    try {
      const response = await fetch(ONLINE_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: getOnlineClientId() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `${response.status}`);
      setOnlineCount(data.online);
    } catch {
      setOnlineCount(null);
    }
  };

  update();
  window.setInterval(update, 15000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) update();
  });
  window.addEventListener("pagehide", () => {
    const payload = JSON.stringify({ clientId: getOnlineClientId(), online: false });
    navigator.sendBeacon?.(ONLINE_API_URL, new Blob([payload], { type: "application/json" }));
  });
}

function getOnlineClientId() {
  let id = localStorage.getItem(ONLINE_CLIENT_STORAGE_KEY);
  if (!id) {
    id = `client_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(ONLINE_CLIENT_STORAGE_KEY, id);
  }
  return id;
}

function setOnlineCount(count) {
  const value = document.querySelector("#onlineCount");
  const status = document.querySelector(".mini-status");
  if (!value || !status) return;
  const online = Number(count);
  if (Number.isFinite(online) && online > 0) {
    value.textContent = String(online);
    status.classList.remove("is-offline");
  } else {
    value.textContent = "--";
    status.classList.add("is-offline");
  }
}

function setThemeMode(mode, persist = true) {
  const next = ["light", "dark", "system"].includes(mode) ? mode : "system";
  if (persist) localStorage.setItem(THEME_STORAGE_KEY, next);
  applyTheme(next);
}

function setColorPalette(palette, persist = true) {
  const next = COLOR_PALETTES.some((item) => item.id === palette) ? palette : "yellow-black";
  document.documentElement.dataset.palette = next;
  if (persist) localStorage.setItem(PALETTE_STORAGE_KEY, next);
}

function applyTheme(mode) {
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
  const resolved = mode === "system" ? (prefersDark ? "dark" : "light") : mode;
  document.documentElement.dataset.themeMode = mode;
  document.documentElement.dataset.theme = resolved;
  themeOptions.forEach((button) => {
    button.classList.toggle("active", button.dataset.themeChoice === mode);
    button.setAttribute("aria-pressed", String(button.dataset.themeChoice === mode));
  });
}

function ensureCanvasMarkup() {
  const nav = document.querySelector(".rail-nav");
  const stage = document.querySelector(".stage");
  if (!nav || !stage || document.querySelector('[data-tool="canvas"]')) return;

  const canvasTab = document.createElement("button");
  canvasTab.className = "nav-item";
  canvasTab.type = "button";
  canvasTab.dataset.tool = "canvas";
  canvasTab.innerHTML = '<span class="nav-icon"><i data-lucide="workflow"></i></span><span>无限画布</span>';

  const chatTab = nav.querySelector('[data-tool="chat"]');
  nav.insertBefore(canvasTab, chatTab || null);
  window.lucide?.createIcons({
    attrs: {
      "aria-hidden": "true",
      "stroke-width": 1.8,
    },
  });

  const canvasView = document.createElement("section");
  canvasView.className = "tool-view";
  canvasView.id = "canvasView";
  canvasView.dataset.view = "canvas";
  canvasView.innerHTML = `
    <section class="canvas-workspace">
      <div class="header-actions canvas-actions">
        <button id="canvasHistoryButton" class="text-action" type="button">历史</button>
        <button id="canvasNew" class="text-action primary-dark" type="button">＋ 新建画布</button>
        <button id="canvasReset" class="text-action" type="button">复位</button>
        <button id="canvasClear" class="text-action" type="button">清空</button>
      </div>
      <div class="canvas-status">
        <span id="canvasZoom">100%</span>
        <span>Ctrl 框选 · 中键拖动画布 · 滚轮缩放 · 双击文字编辑</span>
      </div>
      <div class="canvas-board-loading" id="canvasBoardLoading" role="status" aria-live="polite" aria-busy="true" hidden>
        <div class="canvas-board-loading-card">
          <span class="canvas-board-loading-spinner" aria-hidden="true"></span>
          <strong>正在打开画布</strong>
          <span class="canvas-board-loading-title" id="canvasBoardLoadingTitle"></span>
          <span class="canvas-board-loading-detail" id="canvasBoardLoadingDetail">正在准备节点…</span>
          <div class="canvas-board-loading-track" aria-hidden="true"><i id="canvasBoardLoadingBar"></i></div>
          <small id="canvasBoardLoadingPercent">0%</small>
        </div>
      </div>
      <div class="infinite-canvas" id="infiniteCanvas">
        <canvas id="canvasSceneLayer" class="canvas-scene-layer" aria-hidden="true"></canvas>
        <div class="canvas-plane" id="canvasPlane">
          <svg class="canvas-connections" id="canvasConnections" aria-hidden="true"></svg>
        </div>
        <div class="canvas-selection-box" id="canvasSelectionBox" hidden>
          <div class="canvas-selection-tools">
            <button type="button" data-selection-action="group">打组</button>
          </div>
        </div>
        <div class="canvas-origin">
          <strong>把图片和想法放到这里</strong>
          <span>点击“图片”导入素材，点击“文字”添加便签。</span>
        </div>
      </div>
      <div class="canvas-node-menu" id="canvasNodeMenu" hidden>
        <button type="button" data-canvas-node="upload"><span class="canvas-menu-icon"><i data-lucide="image-plus"></i></span><span>\u5bfc\u5165\u56fe\u7247</span></button>
        <button type="button" data-canvas-node="video"><span class="canvas-menu-icon"><i data-lucide="video"></i></span><span>导入视频</span></button>
        <button type="button" data-canvas-node="audio"><span class="canvas-menu-icon"><i data-lucide="audio-lines"></i></span><span>导入音频</span></button>
        <button type="button" data-canvas-node="minimax-h3"><span class="canvas-menu-icon"><i data-lucide="clapperboard"></i></span><span>MiniMax H3 生视频</span></button>
        <button type="button" data-canvas-node="video-output"><span class="canvas-menu-icon"><i data-lucide="play-square"></i></span><span>视频输出</span></button>
        <button type="button" data-canvas-node="generator"><span class="canvas-menu-icon"><i data-lucide="sparkles"></i></span><span>AI \u751f\u56fe</span></button>
        <button type="button" data-canvas-node="comfy"><span class="canvas-menu-icon"><i data-lucide="workflow"></i></span><span>ComfyUI \u5de5\u4f5c\u6d41</span></button>
        <button type="button" data-canvas-node="loop"><span class="canvas-menu-icon"><i data-lucide="repeat-2"></i></span><span>\u5faa\u73af\u6279\u5904\u7406</span></button>
        <button type="button" data-canvas-node="gallery"><span class="canvas-menu-icon"><i data-lucide="images"></i></span><span>\u7ed3\u679c\u56fe\u96c6</span></button>
        <button type="button" data-canvas-node="llm"><span class="canvas-menu-icon"><i data-lucide="bot"></i></span><span>LLM \u6587\u672c</span></button>
        <button type="button" data-canvas-node="text"><span class="canvas-menu-icon"><i data-lucide="type"></i></span><span>\u63d0\u793a\u8bcd\u6587\u672c</span></button>
      </div>
      <div class="canvas-node-menu canvas-connect-menu" id="canvasConnectMenu" hidden>
        <button type="button" data-connect-node="upload"><span class="canvas-menu-icon"><i data-lucide="image-plus"></i></span><span>\u8fde\u63a5\u5230\u56fe\u7247</span></button>
        <button type="button" data-connect-node="generator"><span class="canvas-menu-icon"><i data-lucide="sparkles"></i></span><span>\u8fde\u63a5\u5230 AI \u751f\u56fe</span></button>
        <button type="button" data-connect-node="comfy"><span class="canvas-menu-icon"><i data-lucide="workflow"></i></span><span>\u8fde\u63a5\u5230 ComfyUI</span></button>
        <button type="button" data-connect-node="loop"><span class="canvas-menu-icon"><i data-lucide="repeat-2"></i></span><span>\u8fde\u63a5\u5230\u5faa\u73af</span></button>
        <button type="button" data-connect-node="gallery"><span class="canvas-menu-icon"><i data-lucide="images"></i></span><span>\u8fde\u63a5\u5230\u56fe\u96c6</span></button>
        <button type="button" data-connect-node="llm"><span class="canvas-menu-icon"><i data-lucide="bot"></i></span><span>\u8fde\u63a5\u5230 LLM</span></button>
        <button type="button" data-connect-node="text"><span class="canvas-menu-icon"><i data-lucide="type"></i></span><span>\u8fde\u63a5\u5230\u63d0\u793a\u8bcd</span></button>
      </div>
      <div class="canvas-node-menu canvas-image-menu" id="canvasImageMenu" hidden>
        <button type="button" data-image-menu-action="download">下载图片</button>
        <button type="button" data-image-menu-action="crop">裁剪图片</button>
        <button type="button" data-image-menu-action="mask">绘制遮罩</button>
      </div>
      <div class="canvas-board-panel" id="canvasBoardPanel" hidden>
        <div class="canvas-board-card">
          <div class="canvas-board-head">
            <div>
              <strong id="canvasBoardTitle">选择画布</strong>
              <span id="canvasBoardCount">0 个</span>
              <p id="canvasBoardHint">打开已有画布，或者建立一个新的。</p>
            </div>
            <div class="canvas-board-tools">
              <button id="canvasBoardRefresh" class="canvas-board-icon-button" type="button" title="刷新画布列表" aria-label="刷新画布列表"><i data-lucide="refresh-cw"></i></button>
              <button id="canvasBoardTrash" class="canvas-board-icon-button" type="button" title="打开回收站" aria-label="打开回收站"><i data-lucide="trash"></i></button>
              <button id="canvasBoardNew" type="button" aria-label="新建画布"><i data-lucide="plus"></i><span>新建画布</span></button>
              <button id="canvasBoardClose" class="canvas-board-icon-button" type="button" title="关闭历史画布" aria-label="关闭历史画布"><i data-lucide="x"></i></button>
            </div>
          </div>
          <label class="canvas-board-search">
            <span>搜索</span>
            <input id="canvasBoardSearch" type="search" placeholder="输入画布名称..." autocomplete="off" />
          </label>
          <div class="canvas-board-list" id="canvasBoardList"></div>
        </div>
      </div>
      <div class="canvas-name-panel" id="canvasNamePanel" hidden>
        <form class="canvas-name-card" id="canvasNameForm">
          <div class="canvas-name-head">
            <div>
              <strong id="canvasNameTitle">新建画布</strong>
              <p id="canvasNameHint">给这个画布起一个方便识别的名字。</p>
            </div>
            <button id="canvasNameClose" type="button">×</button>
          </div>
          <label class="canvas-name-field">
            <span>画布名称</span>
            <input id="canvasNameInput" type="text" maxlength="80" autocomplete="off" />
          </label>
          <div class="canvas-name-actions">
            <button id="canvasNameCancel" type="button">取消</button>
            <button id="canvasNameSubmit" class="primary-dark" type="submit">创建</button>
          </div>
        </form>
      </div>
      <div class="canvas-confirm-panel" id="canvasClearConfirm" hidden>
        <div class="canvas-confirm-card">
          <div class="canvas-name-head">
            <div>
              <strong>清空当前画布？</strong>
              <p>会删除当前画布里的所有节点和连线，历史画布本身不会被删除。</p>
            </div>
            <button id="canvasClearConfirmClose" type="button">×</button>
          </div>
          <div class="canvas-name-actions">
            <button id="canvasClearCancel" type="button">取消</button>
            <button id="canvasClearConfirmButton" class="primary-dark" type="button">确认清空</button>
          </div>
        </div>
      </div>
      <div class="canvas-delete-confirm" id="canvasDeleteConfirm" hidden aria-hidden="true">
        <div class="canvas-delete-confirm-card" role="dialog" aria-modal="true" aria-labelledby="canvasDeleteConfirmTitle" aria-describedby="canvasDeleteConfirmMessage">
          <div class="canvas-delete-confirm-icon" aria-hidden="true"><i data-lucide="trash-2"></i></div>
          <div class="canvas-delete-confirm-copy">
            <strong id="canvasDeleteConfirmTitle">确认删除？</strong>
            <p id="canvasDeleteConfirmMessage">删除后仍可通过撤销恢复。</p>
          </div>
          <div class="canvas-delete-confirm-actions">
            <button id="canvasDeleteConfirmCancel" type="button">取消</button>
            <button id="canvasDeleteConfirmButton" class="is-danger" type="button">删除</button>
          </div>
        </div>
      </div>
      <div class="canvas-delete-undo" id="canvasDeleteUndo" hidden aria-hidden="true" aria-live="polite">
        <span class="canvas-delete-undo-icon" aria-hidden="true"><i data-lucide="trash-2"></i></span>
        <span class="canvas-delete-undo-copy">
          <strong id="canvasDeleteUndoMessage">已删除</strong>
          <small><b id="canvasDeleteUndoCountdown">10</b> 秒内可快捷撤销，之后仍可使用 Ctrl+Z</small>
        </span>
        <button class="canvas-delete-undo-action" id="canvasDeleteUndoAction" type="button">
          <i data-lucide="undo-2"></i>
          <span>撤销</span>
        </button>
        <button class="canvas-delete-undo-dismiss" id="canvasDeleteUndoDismiss" type="button" aria-label="关闭撤销提示">
          <i data-lucide="x"></i>
        </button>
      </div>
      <div class="canvas-board-menu" id="canvasBoardMenu" hidden>
        <button type="button" data-board-menu-action="rename">重命名</button>
      </div>
      <input id="canvasImageInput" type="file" accept="image/*" multiple hidden />
      <input id="canvasNodeImageInput" type="file" accept="image/*" hidden />
      <input id="canvasNodeVideoInput" type="file" accept="video/*" hidden />
      <input id="canvasNodeAudioInput" type="file" accept="audio/*" hidden />
    </section>
  `;

  const miniStatus = stage.querySelector(".mini-status");
  stage.insertBefore(canvasView, miniStatus || null);
  window.lucide?.createIcons({
    attrs: {
      "aria-hidden": "true",
      "stroke-width": 1.8,
    },
  });
}

function canVerifyProviderAgentModel(model) {
  const capabilities = new Set(model.capabilities || []);
  return capabilities.has("text") || !["generation", "edit"].some((item) => capabilities.has(item));
}

function renderProviderAgentVerification(provider, model) {
  if (!canVerifyProviderAgentModel(model)) return "";
  const key = `${provider.id}:${model.id}`;
  const state = providerAgentVerificationState.get(key) || { state: "idle" };
  const loading = state.state === "loading";
  const verified = state.state === "verified" && state.tools === true;
  const draftVerified = verified && state.draft === true;
  const quality = CanvasAgentVerification?.classifyVerificationQuality(state);
  const label = loading ? "验证中" : draftVerified ? "已验证，未保存" : verified ? quality?.label || "Agent 已验证" : state.state === "partial" ? "工具未通过" : state.state === "failed" ? "验证失败" : "验证 Agent";
  const detail = draftVerified
    ? `工具调用 · ${Number(state.latencyMs || 0)} ms · 保存后加入 Agent 备用池`
    : verified
    ? `工具调用 · ${Number(state.latencyMs || 0)} ms${quality?.state === "slow" ? " · 稳定性待观察" : ""}`
    : state.state === "partial" ? "推理可用 · 工具调用未通过" : state.state === "failed" ? String(state.message || "请重试") : "Agent 实测";
  return `<span class="provider-agent-verification${verified ? " is-verified" : state.state === "partial" ? " is-partial" : ""}${draftVerified ? " is-draft" : ""}">
    <button type="button" data-settings-action="verify-provider-agent" data-model-id="${escapeHtml(model.id)}" ${loading ? "disabled" : ""}><i data-lucide="${loading ? "loader-circle" : verified ? "badge-check" : "bot"}"></i><span>${label}</span></button>
    <small>${escapeHtml(detail)}</small>
  </span>`;
}

function updateProviderAgentVerification(provider, model) {
  const current = [...document.querySelectorAll('[data-settings-action="verify-provider-agent"]')]
    .find((button) => button.dataset.modelId === String(model?.id || ""))
    ?.closest(".provider-agent-verification");
  if (!current || provider?.id !== activeSettingsProviderId) return;
  const template = document.createElement("template");
  template.innerHTML = renderProviderAgentVerification(provider, model).trim();
  if (template.content.firstElementChild) current.replaceWith(template.content.firstElementChild);
  window.lucide?.createIcons({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
}

function setCanvasBoardLoading(open, { title = "", detail = "正在准备节点…", progress = 0 } = {}) {
  const overlay = document.querySelector("#canvasBoardLoading");
  if (!overlay) return;
  const safeProgress = Math.max(0, Math.min(100, Math.round(Number(progress) || 0)));
  overlay.hidden = !open;
  overlay.setAttribute("aria-busy", String(Boolean(open)));
  document.querySelector("#canvasBoardLoadingTitle").textContent = title;
  document.querySelector("#canvasBoardLoadingDetail").textContent = detail;
  document.querySelector("#canvasBoardLoadingPercent").textContent = `${safeProgress}%`;
  document.querySelector("#canvasBoardLoadingBar").style.width = `${safeProgress}%`;
}

function updateCanvasBoardLoading({ phase, completed = 0, total = 0 } = {}) {
  const rules = window.canvasBoardLoadingRules;
  const progress = rules.getCanvasBoardRestoreProgress(phase, completed, total);
  const detail = phase === "nodes"
    ? `正在恢复节点 ${completed} / ${total}`
    : phase === "refs"
      ? `正在整理节点关系 ${completed} / ${total}`
      : phase === "complete" ? "画布加载完成" : "正在完成画布…";
  setCanvasBoardLoading(true, { title: canvasState.activeBoardTitle, detail, progress });
}

function waitForCanvasRestorePaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}

function initializeCanvasBoard() {
  const viewport = document.querySelector("#infiniteCanvas");
  const plane = document.querySelector("#canvasPlane");
  const imageInput = document.querySelector("#canvasImageInput");
  const nodeImageInput = document.querySelector("#canvasNodeImageInput");
  const nodeVideoInput = document.querySelector("#canvasNodeVideoInput");
  const nodeAudioInput = document.querySelector("#canvasNodeAudioInput");
  const nodeMenu = document.querySelector("#canvasNodeMenu");
  const connectMenu = document.querySelector("#canvasConnectMenu");
  const imageMenu = document.querySelector("#canvasImageMenu");
  const selectionBox = document.querySelector("#canvasSelectionBox");
  if (!viewport || !plane || !imageInput || !nodeImageInput || !nodeVideoInput || !nodeAudioInput || !nodeMenu || !connectMenu || !imageMenu) return;
  ensureCanvasSceneLayer();
  window.addEventListener("resize", renderCanvasSceneLayer);

  plane.addEventListener("focusin", (event) => {
    const node = event.target.closest?.(".canvas-node");
    if (node?.dataset?.id) pinCanvasNode(node.dataset.id);
  });
  plane.addEventListener("focusout", (event) => {
    const node = event.target.closest?.(".canvas-node");
    if (!node?.dataset?.id) return;
    queueMicrotask(() => {
      syncCanvasNodeModel(node);
      const keepsFocus = node.contains(document.activeElement);
      const keepsSelection = node.classList.contains("is-selected");
      const keepsJob = CANVAS_IMAGE_JOB_ACTIVE_STATES.has(node.dataset.imageJobState);
      if (!keepsFocus && !keepsSelection && !keepsJob) unpinCanvasNode(node.dataset.id);
    });
  });

  document.querySelector("#canvasHistoryButton")?.addEventListener("click", openCanvasBoardPanel);
  document.querySelector("#canvasNew")?.addEventListener("click", promptCreateCanvasBoard);
  document.querySelector("#canvasBoardClose")?.addEventListener("click", closeCanvasBoardPanel);
  document.querySelector("#canvasBoardRefresh")?.addEventListener("click", loadCanvasBoards);
  document.querySelector("#canvasBoardTrash")?.addEventListener("click", toggleCanvasBoardTrash);
  document.querySelector("#canvasBoardNew")?.addEventListener("click", promptCreateCanvasBoard);
  document.querySelector("#canvasBoardSearch")?.addEventListener("input", (event) => {
    canvasState.boardSearchQuery = event.target.value || "";
    renderCanvasBoardList();
  });
  document.querySelector("#canvasBoardPanel")?.addEventListener("wheel", handleCanvasBoardPanelWheel, { passive: false });
  document.querySelector("#canvasNameForm")?.addEventListener("submit", submitCanvasBoardName);
  document.querySelector("#canvasNameClose")?.addEventListener("click", closeCanvasNamePanel);
  document.querySelector("#canvasNameCancel")?.addEventListener("click", closeCanvasNamePanel);
  document.querySelector("#canvasNamePanel")?.addEventListener("pointerdown", (event) => {
    if (event.target.id === "canvasNamePanel") closeCanvasNamePanel();
  });
  document.querySelector("#canvasClearConfirm")?.addEventListener("pointerdown", (event) => {
    if (event.target.id === "canvasClearConfirm") closeCanvasClearConfirm();
  });
  document.querySelector("#canvasClearConfirmClose")?.addEventListener("click", closeCanvasClearConfirm);
  document.querySelector("#canvasClearCancel")?.addEventListener("click", closeCanvasClearConfirm);
  document.querySelector("#canvasClearConfirmButton")?.addEventListener("click", confirmClearCanvasPlane);
  document.querySelector("#canvasDeleteConfirm")?.addEventListener("pointerdown", (event) => {
    if (event.target.id === "canvasDeleteConfirm") closeCanvasDeleteConfirmation();
  });
  document.querySelector("#canvasDeleteConfirmCancel")?.addEventListener("click", closeCanvasDeleteConfirmation);
  document.querySelector("#canvasDeleteConfirmButton")?.addEventListener("click", confirmCanvasDeleteAction);
  document.querySelector("#canvasDeleteUndoDismiss")?.addEventListener("click", hideCanvasDeleteUndo);
  document.querySelector("#canvasBoardMenu")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-board-menu-action]");
    if (!button) return;
    const id = event.currentTarget.dataset.boardId;
    hideCanvasBoardMenu();
    if (button.dataset.boardMenuAction === "rename") promptRenameCanvasBoard(id);
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest("#canvasBoardMenu")) hideCanvasBoardMenu();
  });
  document.querySelector("#canvasAddImage")?.addEventListener("click", () => imageInput.click());
  document.querySelector("#canvasAddText")?.addEventListener("click", () => addCanvasText());
  document.querySelector("#canvasGroup")?.addEventListener("click", () => createCanvasGroupFromSelection());
  window.addEventListener("pointerup", () => {
    if (!document.querySelector("#canvasView.active")) return;
    releaseCanvasGroupFocus();
  });
  selectionBox?.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".canvas-selection-tools")) event.stopPropagation();
  });
  selectionBox?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-selection-action]");
    if (!button) return;
    event.stopPropagation();
    if (button.dataset.selectionAction === "group") createCanvasGroupFromSelection(event);
  });
  document.querySelector("#canvasReset")?.addEventListener("click", () => {
    resetCanvasView();
    scheduleCanvasViewportSave();
  });
  document.querySelector("#canvasClear")?.addEventListener("click", () => {
    openCanvasClearConfirm();
  });

  imageInput.addEventListener("change", async () => {
    const files = Array.from(imageInput.files || []).filter((file) => file.type.startsWith("image/"));
    for (const file of files) {
      const url = await uploadCanvasImageFile(file);
      addCanvasImage(url, file.name);
    }
    imageInput.value = "";
    scheduleCanvasSave();
  });

  nodeImageInput.addEventListener("change", async () => {
    const file = nodeImageInput.files?.[0];
    const node = canvasState.activeNode;
    if (file && node?.classList.contains("canvas-node-image")) {
      await fillCanvasImageNode(node, file);
      scheduleCanvasSave();
    } else if (file && node?.classList.contains("canvas-node-llm")) {
      await addCanvasLlmImageFile(node, file);
      scheduleCanvasSave();
    }
    nodeImageInput.value = "";
  });

  nodeVideoInput.addEventListener("change", async () => {
    const file = nodeVideoInput.files?.[0];
    const node = canvasState.activeNode;
    if (file?.type.startsWith("video/") && node?.classList.contains("canvas-node-video")) {
      await fillCanvasMediaNode(node, file, "video");
    }
    nodeVideoInput.value = "";
  });

  nodeAudioInput.addEventListener("change", async () => {
    const file = nodeAudioInput.files?.[0];
    const node = canvasState.activeNode;
    if (file?.type.startsWith("audio/") && node?.classList.contains("canvas-node-audio")) {
      await fillCanvasMediaNode(node, file, "audio");
    }
    nodeAudioInput.value = "";
  });

  nodeMenu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-canvas-node]");
    if (!button || !canvasState.menuPoint) return;
    if (button.dataset.canvasNode === "upload") addCanvasUploadPlaceholder(canvasState.menuPoint);
    if (button.dataset.canvasNode === "video") addCanvasVideoNode(canvasState.menuPoint);
    if (button.dataset.canvasNode === "audio") addCanvasAudioNode(canvasState.menuPoint);
    if (button.dataset.canvasNode === "minimax-h3") addCanvasMinimaxH3Node(canvasState.menuPoint);
    if (button.dataset.canvasNode === "video-output") addCanvasVideoOutputNode(canvasState.menuPoint);
    if (button.dataset.canvasNode === "generator") addCanvasImagePlaceholder(canvasState.menuPoint);
    if (button.dataset.canvasNode === "comfy") addCanvasComfyNode(canvasState.menuPoint);
    if (button.dataset.canvasNode === "loop") addCanvasLoopNode(canvasState.menuPoint);
    if (button.dataset.canvasNode === "gallery") addCanvasGallery(canvasState.menuPoint);
    if (button.dataset.canvasNode === "llm") addCanvasLlmNode(canvasState.menuPoint);
    if (button.dataset.canvasNode === "text") addCanvasText(canvasState.menuPoint);
    hideCanvasNodeMenu();
    scheduleCanvasSave();
  });

  imageMenu.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-image-menu-action]")?.dataset.imageMenuAction;
    const node = canvasState.imageContextNode;
    hideCanvasImageMenu();
    if (!action || !node) return;
    if (action === "download") await downloadCanvasImage(node, event.target.closest("button"));
    if (action === "crop") startCanvasImageCrop(node);
    if (action === "mask") openCanvasMaskEditor(node);
  });

  connectMenu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-connect-node]");
    const pending = canvasState.connectMenu;
    if (!button || !pending) return;
    const newNode = createCanvasNodeFromConnectChoice(button.dataset.connectNode, pending.point);
    if (pending.direction === "input") {
      connectCanvasNodes(newNode.dataset.id, pending.toId, pending.toPort || "input");
    } else {
      connectCanvasNodes(pending.fromId, newNode.dataset.id, button.dataset.connectNode === "gallery" ? "input" : "input");
    }
    hideCanvasConnectMenu();
    scheduleCanvasSave();
  });

  plane.addEventListener("input", (event) => {
    if (event.target.closest(".canvas-node-prompt, .canvas-text")) scheduleCanvasSave();
    const textNode = event.target.closest(".canvas-node-text");
    if (textNode) refreshCanvasConnectedNodes(textNode.dataset.id);
  });

  plane.addEventListener("change", (event) => {
    const changedControl = event.target.closest(".canvas-node-model, .canvas-node-size, .canvas-node-resolution");
    if (changedControl) {
      scheduleCanvasSave();
      requestAnimationFrame(() => changedControl.blur?.());
    }
  });

  viewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 1) return;
    event.stopImmediatePropagation();
    beginCanvasPan(event);
  }, { capture: true });

  viewport.addEventListener("auxclick", (event) => {
    if (event.button === 1) event.preventDefault();
  }, { capture: true });

  viewport.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".canvas-gallery-history-panel, .canvas-gallery-history-toggle")) {
      closeCanvasGalleryHistoryPanels();
    }
    if (!event.target.closest(".canvas-video-history-panel, .canvas-video-history-toggle")) {
      closeCanvasVideoHistoryPanels();
    }
    if (!event.target.closest("#canvasGridMenu, .canvas-gallery-slice-toggle")) closeCanvasGridMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (!document.querySelector('#canvasView.active')) return;
    if (event.key === "Escape" && !document.querySelector("#canvasGridMenu")?.hidden) {
      closeCanvasGridMenu();
      event.preventDefault();
      return;
    }
    if (event.key === "Escape" && !document.querySelector("#canvasDeleteConfirm")?.hidden) {
      closeCanvasDeleteConfirmation();
      event.preventDefault();
      return;
    }
    if (event.key === "Escape" && closeCanvasGalleryHistoryPanels()) {
      event.preventDefault();
      return;
    }
    if (event.key === "Escape" && closeCanvasVideoHistoryPanels()) {
      event.preventDefault();
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && !isCanvasTypingTarget(event.target)) {
      deleteSelectedCanvasNodes(event);
      return;
    }
    if (!event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key.toLowerCase() === "c") {
      copySelectedCanvasNodes(event);
      return;
    }
    if (event.key.toLowerCase() === "v") {
      pasteCanvasNodes(event);
      return;
    }
    if (event.key.toLowerCase() === "z") {
      undoCanvasChange(event);
      return;
    }
    if (event.key.toLowerCase() === "g") {
      createCanvasGroupFromSelection(event);
    }
  });
  document.addEventListener("paste", handleCanvasClipboardPaste);

  viewport.addEventListener("wheel", (event) => {
    if (isCanvasWheelControlTarget(event.target)) return;
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const before = screenToCanvas(event.clientX - rect.left, event.clientY - rect.top);
    const factor = event.deltaY < 0 ? 1.08 : 0.92;
    canvasState.scale = normalizeCanvasScale(canvasState.scale * factor);
    canvasState.x = event.clientX - rect.left - before.x * canvasState.scale;
    canvasState.y = event.clientY - rect.top - before.y * canvasState.scale;
    scheduleCanvasTransform();
    scheduleCanvasViewportSave();
  }, { passive: false });

  viewport.addEventListener("pointerdown", (event) => {
    hideCanvasNodeMenu();
    if (!event.target.closest("#canvasImageMenu")) hideCanvasImageMenu();
    if (!event.target.closest("#canvasConnectMenu")) hideCanvasConnectMenu();
    const node = event.target.closest(".canvas-node");
    if (node) {
      if (!event.target.closest(".canvas-text")) blurActiveCanvasText();
      if (event.ctrlKey) {
        toggleCanvasNodeSelection(node);
        return;
      }
      if (!node.classList.contains("is-selected")) selectCanvasNode(node);
      beginCanvasNodeDrag(event, node);
      return;
    }
    if (event.button === 0 && canvasPagedStore.scenePage) {
      const viewportRect = viewport.getBoundingClientRect();
      const hit = canvasSceneLayer?.hitTest(
        event.clientX - viewportRect.left,
        event.clientY - viewportRect.top,
      );
      if (hit) {
        event.preventDefault();
        event.stopPropagation();
        canvasState.selectedIds.clear();
        canvasState.selectedIds.add(String(hit.id));
        setCanvasStatus("已选择高密度画布节点；放大后可进入完整编辑。", false);
        return;
      }
    }
    blurActiveCanvasText();
    if (event.ctrlKey) {
      beginCanvasMarquee(event);
      return;
    }
    clearCanvasSelection();
    beginCanvasPan(event);
  });

  viewport.addEventListener("dblclick", (event) => {
    if (event.target.closest(".canvas-node")) return;
    event.preventDefault();
    showCanvasNodeMenu(event);
  });

  viewport.addEventListener("contextmenu", (event) => {
    const imageNode = event.target.closest(".canvas-node-image.canvas-node-frameless");
    if (!imageNode?.dataset.imageSrc) return;
    event.preventDefault();
    event.stopPropagation();
    hideCanvasNodeMenu();
    hideCanvasConnectMenu();
    selectCanvasNode(imageNode);
    showCanvasImageMenu(event, imageNode);
  });

  viewport.addEventListener("dragover", (event) => {
    if (canvasState.draggedGalleryImage
      || event.dataTransfer?.types?.includes("application/x-canvas-gallery-image")
      || event.dataTransfer?.types?.includes("text/plain")
      || Array.from(event.dataTransfer?.items || []).some((item) => /^(image|video|audio)\//.test(item.type))) {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      viewport.classList.add("drag-over");
    }
  });

  viewport.addEventListener("dragleave", () => {
    viewport.classList.remove("drag-over");
  });

  viewport.addEventListener("drop", async (event) => {
    const galleryPayload = event.dataTransfer?.getData("application/x-canvas-gallery-image")
      || event.dataTransfer?.getData("text/plain");
    if (canvasState.draggedGalleryImage || galleryPayload) {
      event.preventDefault();
      viewport.classList.remove("drag-over");
      createCanvasImageFromGalleryDrop(canvasState.draggedGalleryImage || galleryPayload, getCanvasPointFromEvent(event), event);
      canvasState.draggedGalleryImage = null;
      return;
    }
    const allFiles = Array.from(event.dataTransfer?.files || []).filter((file) => /^(image|video|audio)\//.test(file.type));
    const mediaFiles = allFiles.filter((file) => file.type.startsWith("video/") || file.type.startsWith("audio/"));
    if (mediaFiles.length) {
      event.preventDefault();
      viewport.classList.remove("drag-over");
      const point = getCanvasPointFromEvent(event);
      for (const [index, file] of mediaFiles.entries()) {
        const uploaded = await uploadCanvasMediaFile(file);
        const itemPoint = { x: point.x + index * 36, y: point.y + index * 36 };
        if (file.type.startsWith("video/")) addCanvasVideoNode(itemPoint, { src: uploaded.url, name: file.name, mimeType: uploaded.mimeType });
        else addCanvasAudioNode(itemPoint, { src: uploaded.url, name: file.name, mimeType: uploaded.mimeType });
      }
      scheduleCanvasSave();
      return;
    }
    const files = allFiles.filter((file) => file.type.startsWith("image/"));
    if (!files.length) return;
    event.preventDefault();
    viewport.classList.remove("drag-over");
    const point = getCanvasPointFromEvent(event);
    const targetImageNode = findCanvasImageNodeAtClient(event.clientX, event.clientY);
    if (targetImageNode) {
      const url = await uploadCanvasImageFile(files[0]);
      replaceCanvasImageNode(targetImageNode, url, files[0].name || "图片");
      for (const [index, file] of files.slice(1).entries()) {
        const extraUrl = await uploadCanvasImageFile(file);
        addCanvasImage(extraUrl, file.name, { x: point.x + (index + 1) * 32, y: point.y + (index + 1) * 32 });
      }
      scheduleCanvasSave();
      return;
    }
    for (const [index, file] of files.entries()) {
      const url = await uploadCanvasImageFile(file);
      addCanvasImage(url, file.name, { x: point.x + index * 32, y: point.y + index * 32 });
    }
    scheduleCanvasSave();
  });

  prepareBlankCanvasLanding();
  loadCanvasBoards();
  updateCanvasGroupAction();
  startCanvasAutoSave();
}

function addCanvasImage(src, name, point) {
  const node = createCanvasNode("image");
  if (point) setCanvasNodePoint(node, point);
  renderCanvasImageNode(node, { src, name: name || "图片" });
  applyCanvasNodeSize(node);
  placeCanvasNode(node);
  scheduleCanvasSave();
  return node;
}

function addCanvasImagePlaceholder(point) {
  const node = createCanvasNode("image");
  if (point) setCanvasNodePoint(node, point);
  renderCanvasImageNode(node, { src: "", name: "生成节点" });
  applyCanvasNodeSize(node);
  placeCanvasNode(node);
  scheduleCanvasSave();
  return node;
}

function addCanvasUploadPlaceholder(point) {
  const node = createCanvasNode("image");
  if (point) setCanvasNodePoint(node, point);
  renderCanvasUploadNode(node, { src: "", name: "图片节点" });
  applyCanvasNodeSize(node);
  placeCanvasNode(node);
  scheduleCanvasSave();
  return node;
}

function addCanvasVideoNode(point, options = {}) {
  const node = createCanvasNode("video");
  if (point) setCanvasNodePoint(node, point);
  renderCanvasVideoNode(node, options);
  applyCanvasNodeSize(node);
  placeCanvasNode(node);
  scheduleCanvasSave();
  return node;
}

function addCanvasAudioNode(point, options = {}) {
  const node = createCanvasNode("audio");
  if (point) setCanvasNodePoint(node, point);
  renderCanvasAudioNode(node, options);
  applyCanvasNodeSize(node);
  placeCanvasNode(node);
  scheduleCanvasSave();
  return node;
}

async function fillCanvasMediaNode(node, file, kind) {
  setCanvasNodeStatus(node, "上传中...");
  try {
    const uploaded = await uploadCanvasMediaFile(file);
    const options = {
      src: uploaded.url,
      name: file.name || uploaded.filename || `${kind}素材`,
      mimeType: uploaded.mimeType || file.type,
    };
    if (kind === "video") renderCanvasVideoNode(node, options);
    else renderCanvasAudioNode(node, options);
    refreshCanvasConnectedNodes(node.dataset.id);
    scheduleCanvasSave();
  } catch (error) {
    setCanvasNodeStatus(node, `上传失败：${error.message}`);
  }
}

function renderCanvasVideoNode(node, options = {}) {
  renderCanvasMediaNode(node, "video", options);
}

function renderCanvasAudioNode(node, options = {}) {
  renderCanvasMediaNode(node, "audio", options);
}

function renderCanvasMediaNode(node, kind, { src = "", name = "", mimeType = "", duration = 0 } = {}) {
  node.innerHTML = "";
  const isVideo = kind === "video";
  const label = isVideo ? "视频素材" : "音频素材";
  const sourceKey = isVideo ? "videoSrc" : "audioSrc";
  node.dataset[sourceKey] = src || "";
  node.dataset.mediaName = name || label;
  node.dataset.mediaMimeType = mimeType || (isVideo ? "video/mp4" : "audio/mpeg");
  node.dataset.mediaDuration = String(Number(duration || 0));
  node.classList.toggle("has-media", Boolean(src));

  const outputPort = createCanvasPort("output");
  const bar = createCanvasNodeBar(name || label);
  const mediaShell = document.createElement("div");
  mediaShell.className = `canvas-media-shell canvas-media-shell-${kind}${src ? " has-media" : ""}`;
  if (src) {
    const media = document.createElement(kind);
    media.className = `canvas-${kind}-preview`;
    media.src = src;
    media.controls = true;
    media.preload = "metadata";
    if (isVideo) media.playsInline = true;
    media.addEventListener("loadedmetadata", () => {
      node.dataset.mediaDuration = String(Number.isFinite(media.duration) ? media.duration : 0);
      scheduleCanvasConnectionRender();
      scheduleCanvasSave();
    });
    mediaShell.append(media);
  } else {
    const icon = document.createElement("span");
    icon.className = "canvas-media-empty-icon";
    icon.innerHTML = `<i data-lucide="${isVideo ? "video" : "audio-lines"}"></i>`;
    const title = document.createElement("strong");
    title.textContent = isVideo ? "上传参考视频" : "上传参考音频";
    const hint = document.createElement("span");
    hint.textContent = "双击选择本地文件";
    mediaShell.append(icon, title, hint);
  }
  mediaShell.addEventListener("dblclick", (event) => {
    event.stopPropagation();
    selectCanvasNode(node);
    document.querySelector(isVideo ? "#canvasNodeVideoInput" : "#canvasNodeAudioInput")?.click();
  });

  const actions = document.createElement("div");
  actions.className = "canvas-media-actions";
  const replace = document.createElement("button");
  replace.type = "button";
  replace.textContent = src ? "替换" : "上传";
  replace.addEventListener("click", (event) => {
    event.stopPropagation();
    selectCanvasNode(node);
    document.querySelector(isVideo ? "#canvasNodeVideoInput" : "#canvasNodeAudioInput")?.click();
  });
  actions.append(replace);
  if (src) {
    const download = document.createElement("a");
    download.href = src;
    download.download = name || `${kind}-material`;
    download.textContent = "下载";
    download.addEventListener("pointerdown", (event) => event.stopPropagation());
    actions.append(download);
  }
  const status = document.createElement("span");
  status.className = "canvas-node-status";
  status.textContent = src ? "已就绪" : "等待上传";
  node.append(outputPort, bar, mediaShell, actions, status, createCanvasResizeHandle());
  window.lucide?.createIcons({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
  scheduleCanvasConnectionRender();
}

function addCanvasMinimaxH3Node(point, options = {}) {
  const node = createCanvasNode("minimax-h3");
  if (point) setCanvasNodePoint(node, point);
  renderCanvasMinimaxH3Node(node, options);
  applyCanvasNodeSize(node);
  placeCanvasNode(node);
  scheduleCanvasSave();
  return node;
}

function addCanvasVideoOutputNode(point, options = {}) {
  const node = createCanvasNode("video-output");
  if (point) setCanvasNodePoint(node, point);
  renderCanvasVideoOutputNode(node, options);
  applyCanvasNodeSize(node);
  placeCanvasNode(node);
  scheduleCanvasSave();
  return node;
}

function renderCanvasMinimaxH3Node(node, options = {}) {
  const requestedAspectRatio = options.aspectRatio || node.dataset.minimaxH3AspectRatio || "16:9";
  const previous = {
    prompt: options.prompt ?? node.querySelector(".canvas-h3-prompt")?.value ?? node.dataset.minimaxH3Prompt ?? "",
    aspectRatio: Object.hasOwn(MINIMAX_H3_ASPECT_RATIOS, requestedAspectRatio) ? requestedAspectRatio : "16:9",
    megapixels: Number(options.megapixels ?? node.dataset.minimaxH3Megapixels ?? 0.6) === 1 ? 1 : 0.6,
    steps: Number(options.steps ?? node.dataset.minimaxH3Steps ?? 4) === 8 ? 8 : 4,
    duration: Math.max(5, Math.min(15, Number(options.duration ?? node.dataset.minimaxH3Duration ?? 12) || 12)),
    refImageSize: options.refImageSize || node.dataset.minimaxH3RefImageSize || "match",
    seed: options.seed ?? node.dataset.minimaxH3Seed ?? "",
  };
  node.innerHTML = "";
  node.dataset.minimaxH3Prompt = String(previous.prompt || "");
  node.dataset.minimaxH3AspectRatio = previous.aspectRatio;
  node.dataset.minimaxH3Megapixels = String(previous.megapixels);
  node.dataset.minimaxH3Steps = String(previous.steps);
  node.dataset.minimaxH3Duration = String(previous.duration);
  node.dataset.minimaxH3RefImageSize = previous.refImageSize;
  node.dataset.minimaxH3Seed = String(previous.seed ?? "");

  const inputPort = createCanvasPort("input");
  const outputPort = createCanvasPort("output");
  const bar = createCanvasNodeBar("MiniMax H3 生视频");
  const intro = document.createElement("div");
  intro.className = "canvas-h3-intro";
  intro.innerHTML = "<strong>文生视频 · 多模态参考生成</strong><span>最多 9 图 · 3 视频 · 3 音频</span>";

  const references = document.createElement("div");
  references.className = "canvas-h3-reference-grid";

  const promptLabel = document.createElement("label");
  promptLabel.className = "canvas-h3-field canvas-h3-prompt-field";
  const promptCaption = document.createElement("span");
  promptCaption.textContent = "视频描述";
  const prompt = document.createElement("textarea");
  prompt.className = "canvas-h3-prompt";
  prompt.rows = 6;
  prompt.placeholder = "描述镜头、人物、动作、对白和声音；可使用 <Picture 1>、<Video 1>、<Audio 1> 引用素材。";
  prompt.value = previous.prompt;
  prompt.setAttribute("aria-autocomplete", "list");
  prompt.setAttribute("aria-expanded", "false");
  prompt.addEventListener("wheel", stopCanvasTextWheel);
  prompt.addEventListener("compositionstart", () => {
    prompt.dataset.h3Composing = "true";
    closeCanvasH3MentionMenu(prompt);
  });
  prompt.addEventListener("compositionend", () => {
    prompt.dataset.h3Composing = "";
    updateCanvasH3MentionFromTextarea(node, prompt);
  });
  prompt.addEventListener("input", () => {
    node.dataset.minimaxH3Prompt = prompt.value;
    updateCanvasH3MentionFromTextarea(node, prompt);
    scheduleCanvasSave();
  });
  prompt.addEventListener("keydown", (event) => handleCanvasH3MentionKeydown(event, node, prompt));
  prompt.addEventListener("click", () => updateCanvasH3MentionFromTextarea(node, prompt));
  prompt.addEventListener("blur", () => setTimeout(() => closeCanvasH3MentionMenu(prompt), 0));
  promptLabel.append(promptCaption, prompt);

  const controls = document.createElement("div");
  controls.className = "canvas-h3-controls";
  const aspectRatio = createCanvasH3Select("画幅", [
    ["1:1", "1:1 方形"],
    ["2:3", "2:3 竖版照片"],
    ["3:2", "3:2 横版照片"],
    ["3:4", "3:4 标准竖版"],
    ["4:3", "4:3 标准横版"],
    ["9:16", "9:16 竖屏"],
    ["16:9", "16:9 横屏"],
    ["21:9", "21:9 超宽屏"],
  ], previous.aspectRatio, "minimaxH3AspectRatio", node);
  const megapixels = createCanvasH3Select("分辨率", [
    ["0.6", "快速 · 标准分辨率"],
    ["1", "高清 · 高分辨率"],
  ], String(previous.megapixels), "minimaxH3Megapixels", node);
  const resolutionHint = document.createElement("small");
  resolutionHint.className = "canvas-h3-resolution-hint";
  megapixels.append(resolutionHint);
  const steps = createCanvasH3Select("采样质量", [
    ["4", "快速 · 4 步"],
    ["8", "高质量 · 8 步"],
  ], String(previous.steps), "minimaxH3Steps", node);
  const refImageSize = createCanvasH3Select("参考图", [
    ["match", "匹配输出"],
    ["max", "最大保真"],
  ], previous.refImageSize, "minimaxH3RefImageSize", node);
  const duration = createCanvasH3Number("时长（秒）", previous.duration, 5, 15, 1, "minimaxH3Duration", node);
  const seed = createCanvasH3Number("种子（留空随机）", previous.seed, 0, Number.MAX_SAFE_INTEGER, 1, "minimaxH3Seed", node, true);
  controls.append(aspectRatio, megapixels, steps, refImageSize, duration, seed);
  [aspectRatio, megapixels].forEach((field) => {
    field.querySelector("select")?.addEventListener("change", () => updateCanvasH3ResolutionHint(node));
  });

  const footer = document.createElement("div");
  footer.className = "canvas-h3-footer";
  const status = document.createElement("span");
  status.className = "canvas-h3-status";
  status.textContent = "输入描述即可生成，参考素材可选";
  const run = document.createElement("button");
  run.type = "button";
  run.className = "canvas-h3-run";
  run.innerHTML = '<i data-lucide="play"></i><span>生成视频</span>';
  run.addEventListener("click", () => runCanvasMinimaxH3Node(node));
  footer.append(status, run);

  node.append(inputPort, outputPort, bar, intro, references, promptLabel, controls, footer, createCanvasResizeHandle());
  updateCanvasH3ResolutionHint(node);
  renderCanvasMinimaxH3References(node);
  syncCanvasMinimaxH3Prompt(node);
  window.lucide?.createIcons({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
  scheduleCanvasConnectionRender();
}

function calculateCanvasH3Resolution(aspectRatio, megapixels, multiple = 32) {
  const [widthRatio, heightRatio] = MINIMAX_H3_ASPECT_RATIOS[aspectRatio] || MINIMAX_H3_ASPECT_RATIOS["16:9"];
  const normalizedMegapixels = Number(megapixels) === 1 ? 1 : 0.6;
  const scale = Math.sqrt((normalizedMegapixels * 1024 * 1024) / (widthRatio * heightRatio));
  return {
    width: Math.round((widthRatio * scale) / multiple) * multiple,
    height: Math.round((heightRatio * scale) / multiple) * multiple,
  };
}

function updateCanvasH3ResolutionHint(node) {
  const hint = node?.querySelector(".canvas-h3-resolution-hint");
  if (!hint) return;
  const resolution = calculateCanvasH3Resolution(
    node.dataset.minimaxH3AspectRatio || "16:9",
    node.dataset.minimaxH3Megapixels || 0.6,
  );
  hint.textContent = `预计输出：${resolution.width} × ${resolution.height}`;
}

function createCanvasH3Select(label, choices, value, datasetKey, node) {
  const field = document.createElement("label");
  field.className = "canvas-h3-field";
  const caption = document.createElement("span");
  caption.textContent = label;
  const select = document.createElement("select");
  choices.forEach(([choiceValue, choiceLabel]) => {
    const option = document.createElement("option");
    option.value = choiceValue;
    option.textContent = choiceLabel;
    select.append(option);
  });
  select.value = String(value);
  select.addEventListener("change", () => {
    node.dataset[datasetKey] = select.value;
    scheduleCanvasSave();
  });
  field.append(caption, select);
  return field;
}

function createCanvasH3Number(label, value, min, max, step, datasetKey, node, allowBlank = false) {
  const field = document.createElement("label");
  field.className = "canvas-h3-field";
  const caption = document.createElement("span");
  caption.textContent = label;
  const input = document.createElement("input");
  input.type = "number";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = value === "" && allowBlank ? "" : String(value);
  input.addEventListener("change", () => {
    if (allowBlank && input.value === "") node.dataset[datasetKey] = "";
    else {
      const next = Math.max(min, Math.min(max, Number(input.value) || min));
      input.value = String(next);
      node.dataset[datasetKey] = input.value;
    }
    scheduleCanvasSave();
  });
  field.append(caption, input);
  return field;
}

function getCanvasIncomingMinimaxH3Refs(node) {
  const items = getCanvasIncomingItems(node?.dataset.id || "");
  const images = applyCanvasH3ReferenceOrder(node, "images", items.filter((item) => item.type === "image" && item.url));
  const videos = applyCanvasH3ReferenceOrder(node, "videos", items.filter((item) => item.type === "video" && item.url));
  const audios = applyCanvasH3ReferenceOrder(node, "audios", items.filter((item) => item.type === "audio" && item.url));
  return { images, videos, audios };
}

const CANVAS_H3_MENTION_GROUPS = [
  { collection: "images", type: "image", typeLabel: "图片", promptType: "Picture" },
  { collection: "videos", type: "video", typeLabel: "视频", promptType: "Video" },
  { collection: "audios", type: "audio", typeLabel: "音频", promptType: "Audio" },
];

function getCanvasH3MentionItems(node) {
  const refs = getCanvasIncomingMinimaxH3Refs(node);
  const connections = canvasState.connections.filter((item) => item.to === node?.dataset.id);
  const items = [];
  CANVAS_H3_MENTION_GROUPS.forEach(({ collection, type, typeLabel, promptType }) => {
    const readyKeys = new Set();
    refs[collection].forEach((ref, index) => {
      readyKeys.add(ref.key);
      items.push({
        id: ref.key,
        type,
        typeLabel,
        promptLabel: `<${promptType} ${index + 1}>`,
        name: ref.name || `${typeLabel}${index + 1}`,
        url: ref.url,
        ready: true,
        thumbnail: type === "image" ? ref.url : "",
      });
    });
    connections.forEach((connection) => {
      const source = getCanvasNode(connection.from);
      const sourceType = source?.classList.contains("canvas-node-video")
        ? "video"
        : source?.classList.contains("canvas-node-audio")
          ? "audio"
          : source?.classList.contains("canvas-node-image") && source.dataset.uploadOnly === "true"
            ? "image"
            : "";
      const key = `${sourceType}:${connection.from}`;
      if (!source || sourceType !== type || readyKeys.has(key) || getCanvasNodeOutput(source)?.url) return;
      items.push({
        id: `pending:${key}`,
        type,
        typeLabel,
        promptLabel: "",
        name: source.dataset.mediaName || source.dataset.imageName || `${typeLabel}素材`,
        url: "",
        ready: false,
        thumbnail: "",
      });
    });
  });
  return items;
}

function getCanvasH3MentionTrigger(textarea) {
  if (!textarea || textarea.readOnly || textarea.disabled || textarea.selectionStart !== textarea.selectionEnd) return null;
  const end = textarea.selectionStart;
  const before = textarea.value.slice(0, end);
  const start = before.lastIndexOf("@");
  if (start < 0) return null;
  if (start > 0 && !/[\s，。！？；：、,.!?;:()[\]{}]/.test(before[start - 1])) return null;
  const query = before.slice(start + 1);
  if (/[\r\n]/.test(query)) return null;
  return { start, end, query };
}

function validateCanvasH3PromptReferences(prompt, refs) {
  const counts = {
    Picture: refs?.images?.length || 0,
    Video: refs?.videos?.length || 0,
    Audio: refs?.audios?.length || 0,
  };
  const missing = [];
  for (const match of String(prompt || "").matchAll(/<(Picture|Video|Audio)\s+(\d+)>/g)) {
    const index = Number(match[2]);
    if (index < 1 || index > counts[match[1]]) missing.push(match[0]);
  }
  return { ok: missing.length === 0, missing: [...new Set(missing)] };
}

let canvasH3MentionState = null;

function updateCanvasH3MentionFromTextarea(node, textarea) {
  if (textarea?.dataset.h3Composing === "true") return;
  const trigger = getCanvasH3MentionTrigger(textarea);
  if (!trigger) {
    closeCanvasH3MentionMenu(textarea);
    return;
  }
  openCanvasH3MentionMenu(node, textarea, trigger);
}

function openCanvasH3MentionMenu(node, textarea, trigger) {
  if (!node?.isConnected || !textarea?.isConnected || textarea.readOnly || !trigger) return;
  const previousMenu = canvasH3MentionState?.menu;
  if (canvasH3MentionState?.textarea !== textarea) closeCanvasH3MentionMenu();
  const field = textarea.closest(".canvas-h3-prompt-field");
  if (!field) return;
  const menu = previousMenu?.isConnected ? previousMenu : document.createElement("div");
  menu.className = "canvas-h3-mention-menu";
  menu.id = `canvas-h3-mention-${node.dataset.id}`;
  menu.setAttribute("role", "listbox");
  menu.addEventListener("pointerdown", (event) => event.stopPropagation());
  menu.addEventListener("mousedown", (event) => event.preventDefault());
  if (!menu.isConnected) field.append(menu);
  textarea.setAttribute("aria-controls", menu.id);
  textarea.setAttribute("aria-expanded", "true");
  canvasH3MentionState = {
    node,
    textarea,
    trigger,
    menu,
    items: [],
    activeIndex: -1,
  };
  renderCanvasH3MentionMenu();
}

function renderCanvasH3MentionMenu() {
  const state = canvasH3MentionState;
  if (!state?.node?.isConnected || !state.textarea?.isConnected || !state.menu?.isConnected) {
    closeCanvasH3MentionMenu();
    return;
  }
  const query = state.trigger.query.trim().toLocaleLowerCase("zh-CN");
  const allItems = getCanvasH3MentionItems(state.node);
  state.items = allItems.filter((item) => {
    if (!query) return true;
    const searchable = `${item.name} ${item.typeLabel} ${item.type} ${item.promptLabel}`.toLocaleLowerCase("zh-CN");
    return searchable.includes(query);
  });
  if (!state.items[state.activeIndex]?.ready) state.activeIndex = state.items.findIndex((item) => item.ready);
  state.menu.innerHTML = "";
  state.menu.classList.toggle("is-above", shouldShowCanvasH3MentionAbove(state.textarea));
  if (!allItems.length) {
    const empty = document.createElement("div");
    empty.className = "canvas-h3-mention-empty";
    empty.textContent = "请先连接参考素材";
    state.menu.append(empty);
  } else if (!state.items.length) {
    const empty = document.createElement("div");
    empty.className = "canvas-h3-mention-empty";
    empty.textContent = "没有匹配的参考素材";
    state.menu.append(empty);
  } else {
    CANVAS_H3_MENTION_GROUPS.forEach(({ type, typeLabel }) => {
      const groupItems = state.items.map((item, index) => ({ item, index })).filter(({ item }) => item.type === type);
      if (!groupItems.length) return;
      const heading = document.createElement("div");
      heading.className = "canvas-h3-mention-group";
      heading.setAttribute("role", "presentation");
      heading.textContent = typeLabel;
      state.menu.append(heading);
      groupItems.forEach(({ item, index }) => state.menu.append(createCanvasH3MentionOption(state, item, index)));
    });
  }
  const active = state.menu.querySelector(".canvas-h3-mention-option.is-active");
  if (active) state.textarea.setAttribute("aria-activedescendant", active.id);
  else state.textarea.removeAttribute("aria-activedescendant");
  window.lucide?.createIcons({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
}

function createCanvasH3MentionOption(state, item, index) {
  const option = document.createElement("button");
  option.type = "button";
  option.id = `${state.menu.id}-option-${index}`;
  option.className = `canvas-h3-mention-option${index === state.activeIndex ? " is-active" : ""}`;
  option.setAttribute("role", "option");
  option.setAttribute("aria-selected", index === state.activeIndex ? "true" : "false");
  option.setAttribute("aria-disabled", item.ready ? "false" : "true");
  option.setAttribute("aria-label", `${item.ready ? item.promptLabel : "等待上传"} ${item.name}`);
  if (item.thumbnail) {
    const image = document.createElement("img");
    image.src = item.thumbnail;
    image.alt = "";
    image.addEventListener("error", () => image.classList.add("is-error"), { once: true });
    option.append(image);
  } else {
    const icon = document.createElement("span");
    icon.className = "canvas-h3-mention-icon";
    icon.innerHTML = `<i data-lucide="${item.type === "video" ? "video" : item.type === "audio" ? "audio-lines" : "image"}"></i>`;
    option.append(icon);
  }
  const label = document.createElement("span");
  const promptLabel = document.createElement("b");
  promptLabel.textContent = item.ready ? item.promptLabel : "等待上传";
  const name = document.createElement("small");
  name.textContent = item.name;
  label.append(promptLabel, name);
  option.append(label);
  option.addEventListener("mouseenter", () => {
    if (!item.ready) return;
    state.activeIndex = index;
    updateCanvasH3MentionActiveOption();
  });
  option.addEventListener("click", () => {
    if (item.ready) insertCanvasH3Mention(item);
  });
  return option;
}

function shouldShowCanvasH3MentionAbove(textarea) {
  const rect = textarea?.getBoundingClientRect();
  return Boolean(rect && rect.bottom + 270 > window.innerHeight && rect.top > 270);
}

function updateCanvasH3MentionActiveOption() {
  const state = canvasH3MentionState;
  if (!state) return;
  state.menu.querySelectorAll(".canvas-h3-mention-option").forEach((option, index) => {
    const active = index === state.activeIndex;
    option.classList.toggle("is-active", active);
    option.setAttribute("aria-selected", active ? "true" : "false");
  });
  const active = state.menu.querySelector(".canvas-h3-mention-option.is-active");
  if (active) {
    state.textarea.setAttribute("aria-activedescendant", active.id);
    const optionTop = active.offsetTop;
    const optionBottom = optionTop + active.offsetHeight;
    if (optionTop < state.menu.scrollTop) state.menu.scrollTop = optionTop;
    else if (optionBottom > state.menu.scrollTop + state.menu.clientHeight) {
      state.menu.scrollTop = optionBottom - state.menu.clientHeight;
    }
  } else {
    state.textarea.removeAttribute("aria-activedescendant");
  }
}

function moveCanvasH3MentionActive(direction) {
  const state = canvasH3MentionState;
  if (!state) return false;
  const readyIndexes = state.items.map((item, index) => item.ready ? index : -1).filter((index) => index >= 0);
  if (!readyIndexes.length) return false;
  const current = readyIndexes.indexOf(state.activeIndex);
  const next = current < 0
    ? 0
    : (current + direction + readyIndexes.length) % readyIndexes.length;
  state.activeIndex = readyIndexes[next];
  updateCanvasH3MentionActiveOption();
  return true;
}

function handleCanvasH3MentionKeydown(event, node, textarea) {
  const state = canvasH3MentionState?.textarea === textarea ? canvasH3MentionState : null;
  if (!state) {
    if (event.key === "@") queueMicrotask(() => updateCanvasH3MentionFromTextarea(node, textarea));
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    closeCanvasH3MentionMenu(textarea);
    return;
  }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    if (moveCanvasH3MentionActive(event.key === "ArrowDown" ? 1 : -1)) event.preventDefault();
    return;
  }
  if (event.key === "Enter" || event.key === "Tab") {
    const item = state.items[state.activeIndex];
    if (!item?.ready) return;
    event.preventDefault();
    insertCanvasH3Mention(item);
  }
}

function insertCanvasH3Mention(item) {
  const state = canvasH3MentionState;
  if (!state?.textarea || !state.trigger || !item?.ready || !item.promptLabel) return;
  const suffix = state.textarea.value.slice(state.trigger.end);
  const spacer = /^\s/.test(suffix) ? "" : " ";
  state.textarea.setRangeText(`${item.promptLabel}${spacer}`, state.trigger.start, state.trigger.end, "end");
  const textarea = state.textarea;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  closeCanvasH3MentionMenu(textarea);
  textarea.focus();
}

function refreshCanvasH3MentionMenu(node) {
  const state = canvasH3MentionState;
  if (!state || state.node !== node) return;
  const trigger = getCanvasH3MentionTrigger(state.textarea);
  if (!trigger) {
    closeCanvasH3MentionMenu(state.textarea);
    return;
  }
  state.trigger = trigger;
  renderCanvasH3MentionMenu();
}

function closeCanvasH3MentionMenu(textarea = null) {
  const state = canvasH3MentionState;
  if (!state || (textarea && state.textarea !== textarea)) return;
  state.menu?.remove();
  state.textarea?.setAttribute("aria-expanded", "false");
  state.textarea?.removeAttribute("aria-controls");
  state.textarea?.removeAttribute("aria-activedescendant");
  canvasH3MentionState = null;
}

function getCanvasH3OrderKey(collection) {
  return collection === "images" ? "minimaxH3ImageOrder" : collection === "videos" ? "minimaxH3VideoOrder" : "minimaxH3AudioOrder";
}

function getCanvasH3ReferenceOrder(node, collection) {
  try {
    const value = JSON.parse(node?.dataset?.[getCanvasH3OrderKey(collection)] || "[]");
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

function applyCanvasH3ReferenceOrder(node, collection, refs) {
  const datasetKey = getCanvasH3OrderKey(collection);
  let order = getCanvasH3ReferenceOrder(node, collection);
  const keys = new Set(refs.map((item) => item.key));
  order = (Array.isArray(order) ? order : []).filter((key) => keys.has(key));
  refs.forEach((item) => { if (!order.includes(item.key)) order.push(item.key); });
  node.dataset[datasetKey] = JSON.stringify(order);
  const byKey = new Map(refs.map((item) => [item.key, item]));
  return order.map((key) => byKey.get(key)).filter(Boolean);
}

function renderCanvasMinimaxH3References(node) {
  const grid = node.querySelector(".canvas-h3-reference-grid");
  if (!grid) return;
  const refs = getCanvasIncomingMinimaxH3Refs(node);
  grid.innerHTML = "";
  [
    ["images", "Picture", "图片", 9],
    ["videos", "Video", "视频", 3],
    ["audios", "Audio", "音频", 3],
  ].forEach(([key, promptLabel, title, limit]) => {
    const section = document.createElement("section");
    section.className = `canvas-h3-reference-collection is-${key}`;
    const header = document.createElement("div");
    header.className = "canvas-h3-reference-head";
    header.innerHTML = `<strong>${title}</strong><span>${refs[key].length}/${limit}</span>`;
    const list = document.createElement("div");
    list.className = "canvas-h3-reference-list";
    if (!refs[key].length) {
      const empty = document.createElement("span");
      empty.className = "canvas-h3-reference-empty";
      empty.textContent = `连接${title}节点`;
      list.append(empty);
    }
    refs[key].forEach((ref, index) => {
      const item = document.createElement("div");
      item.className = "canvas-h3-reference-item";
      if (key === "images") {
        const image = createDeferredThumbnail(ref.url, ref.name || `${title}${index + 1}`);
        item.append(image);
      } else {
        const icon = document.createElement("span");
        icon.className = "canvas-h3-reference-icon";
        icon.innerHTML = `<i data-lucide="${key === "videos" ? "video" : "audio-lines"}"></i>`;
        item.append(icon);
      }
      const label = document.createElement("span");
      label.innerHTML = `<b>&lt;${promptLabel} ${index + 1}&gt;</b><small>${escapeHtml(ref.name || `${title}${index + 1}`)}</small>`;
      const move = document.createElement("div");
      move.className = "canvas-h3-reference-move";
      const back = document.createElement("button");
      back.type = "button";
      back.textContent = "←";
      back.disabled = index === 0;
      back.addEventListener("click", () => moveCanvasH3Reference(node, key, index, index - 1));
      const next = document.createElement("button");
      next.type = "button";
      next.textContent = "→";
      next.disabled = index === refs[key].length - 1;
      next.addEventListener("click", () => moveCanvasH3Reference(node, key, index, index + 1));
      move.append(back, next);
      item.append(label, move);
      list.append(item);
    });
    section.append(header, list);
    grid.append(section);
  });
  window.lucide?.createIcons({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
  refreshCanvasH3MentionMenu(node);
}

function moveCanvasH3Reference(node, collection, fromIndex, toIndex) {
  const refs = getCanvasIncomingMinimaxH3Refs(node)[collection];
  if (!refs[toIndex]) return;
  const order = refs.map((item) => item.key);
  const [moved] = order.splice(fromIndex, 1);
  order.splice(toIndex, 0, moved);
  node.dataset[getCanvasH3OrderKey(collection)] = JSON.stringify(order);
  renderCanvasMinimaxH3References(node);
  scheduleCanvasSave();
}

function syncCanvasMinimaxH3Prompt(node) {
  if (!node?.classList.contains("canvas-node-minimax-h3")) return;
  const prompt = node.querySelector(".canvas-h3-prompt");
  if (!prompt) return;
  const incoming = getCanvasIncomingTexts(node.dataset.id);
  if (incoming.length) {
    prompt.value = incoming.join("\n");
    prompt.readOnly = true;
    prompt.classList.add("is-synced");
    closeCanvasH3MentionMenu(prompt);
  } else {
    prompt.readOnly = false;
    prompt.classList.remove("is-synced");
    prompt.value = node.dataset.minimaxH3Prompt || prompt.value || "";
  }
}

async function runCanvasMinimaxH3Node(node, options) {
  const guard = options?.guard || null;
  guard?.assertActive();
  syncCanvasMinimaxH3Prompt(node);
  const prompt = node.querySelector(".canvas-h3-prompt")?.value.trim() || "";
  const refs = getCanvasIncomingMinimaxH3Refs(node);
  if (!prompt) {
    setCanvasH3Status(node, "请先输入视频描述", true);
    return;
  }

  const referenceCheck = validateCanvasH3PromptReferences(prompt, refs);
  if (!referenceCheck.ok) {
    setCanvasH3Status(node, `提示词引用的 ${referenceCheck.missing.join("、")} 当前不存在`, true);
    return;
  }

  if (refs.images.length > 9) {
    setCanvasH3Status(node, "图片参考最多 9 个，请断开多余连接。", true);
    return;
  }
  if (refs.videos.length > 3) {
    setCanvasH3Status(node, "视频参考最多 3 个，请断开多余连接。", true);
    return;
  }
  if (refs.audios.length > 3) {
    setCanvasH3Status(node, "音频参考最多 3 个，请断开多余连接。", true);
    return;
  }

  const runButton = node.querySelector(".canvas-h3-run");
  if (runButton) runButton.disabled = true;
  node.dataset.minimaxH3Prompt = node.querySelector(".canvas-h3-prompt")?.readOnly ? (node.dataset.minimaxH3Prompt || "") : prompt;
  setCanvasH3Status(node, "正在创建任务...");
  try {
    const response = await fetch(MINIMAX_H3_VIDEO_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        images: refs.images.map(canvasH3ReferencePayload),
        videos: refs.videos.map(canvasH3ReferencePayload),
        audios: refs.audios.map(canvasH3ReferencePayload),
        aspect_ratio: node.dataset.minimaxH3AspectRatio || "16:9",
        megapixels: Number(node.dataset.minimaxH3Megapixels || 0.6),
        steps: Number(node.dataset.minimaxH3Steps || 4),
        duration: Number(node.dataset.minimaxH3Duration || 12),
        ref_image_size: node.dataset.minimaxH3RefImageSize || "match",
        seed: node.dataset.minimaxH3Seed === "" ? "" : Number(node.dataset.minimaxH3Seed),
      }),
    });
    guard?.assertActive();
    const data = await response.json().catch(() => ({}));
    guard?.assertActive();
    if (!response.ok) throw new Error(data.error || data.message || `任务创建失败：${response.status}`);
    const task = await waitForCanvasMinimaxH3Task(node, data.task_id, guard);
    guard?.assertActive();
    const videoUrl = task.videos?.[0];
    if (!videoUrl) throw new Error("任务成功，但没有返回视频文件。");
    const output = getOrCreateCanvasVideoOutput(node);
    guard?.assertActive();
    appendCanvasVideoOutputHistory(output, {
      src: videoUrl,
      name: `MiniMax H3 ${new Date().toLocaleString()}.mp4`,
      mimeType: "video/mp4",
      promptSummary: prompt.slice(0, 180),
      createdAt: new Date().toISOString(),
    });
    setCanvasH3Status(node, "生成完成");
    scheduleCanvasSave();
  } catch (error) {
    setCanvasH3Status(node, `失败：${error.message}`, true);
  } finally {
    if (runButton) runButton.disabled = false;
  }
}

function canvasH3ReferencePayload(ref) {
  return { url: ref.url, name: ref.name || "reference" };
}

async function waitForCanvasMinimaxH3Task(node, taskId, guard = null) {
  if (!taskId) throw new Error("服务器没有返回任务编号。");
  for (let index = 0; index < 900; index += 1) {
    guard?.assertActive();
    const response = await fetch(`${UPSCALE_STATUS_API_URL}?id=${encodeURIComponent(taskId)}`);
    guard?.assertActive();
    const task = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(task.error || `状态查询失败：${response.status}`);
    setCanvasH3Status(node, `${task.message || "正在生成..."}${Number.isFinite(Number(task.progress)) ? ` · ${Math.round(Number(task.progress))}%` : ""}`);
    if (task.status === "success") return task;
    if (task.status === "failed") throw new Error(task.error || task.message || "视频生成失败。");
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("视频生成等待超时。");
}

function setCanvasH3Status(node, message, isError = false) {
  const status = node.querySelector(".canvas-h3-status");
  if (status) {
    status.textContent = message;
    status.classList.toggle("is-error", Boolean(isError));
  }
}

function getOrCreateCanvasVideoOutput(node) {
  const connected = canvasState.connections
    .filter((item) => item.from === node.dataset.id)
    .map((item) => getCanvasNode(item.to))
    .find((item) => item?.classList.contains("canvas-node-video-output"));
  if (connected) return connected;
  const width = Number(node.dataset.width || node.offsetWidth || 460);
  const output = addCanvasVideoOutputNode({
    x: Number(node.dataset.x || 0) + width + 90,
    y: Number(node.dataset.y || 0) + 24,
  });
  connectCanvasNodes(node.dataset.id, output.dataset.id, "input");
  return output;
}

function getCanvasVideoLegacyItem(node, options = {}) {
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

function getCanvasVideoHistory(node) {
  let stored = [];
  try {
    const parsed = JSON.parse(node?.dataset?.videoHistory || "[]");
    if (Array.isArray(parsed)) stored = parsed;
  } catch {
    stored = [];
  }
  const normalized = VideoHistoryRules.normalizeVideoHistory(stored, getCanvasVideoLegacyItem(node), createId);
  if (node) node.dataset.videoHistory = JSON.stringify(normalized);
  return normalized;
}

function syncCanvasVideoLegacyFields(node, active) {
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

function setCanvasVideoHistoryState(node, history, activeVideoId = "") {
  const normalized = VideoHistoryRules.normalizeVideoHistory(history, null, createId);
  const active = VideoHistoryRules.resolveActiveVideo(normalized, activeVideoId);
  node.dataset.videoHistory = JSON.stringify(normalized);
  if (active) node.dataset.videoActiveId = active.id;
  else delete node.dataset.videoActiveId;
  syncCanvasVideoLegacyFields(node, active);
  return active;
}

function getCanvasVideoActiveItem(node) {
  if (!node?.classList?.contains("canvas-node-video-output")) return null;
  const history = getCanvasVideoHistory(node);
  return setCanvasVideoHistoryState(node, history, node.dataset.videoActiveId || "");
}

function appendCanvasVideoOutputHistory(node, video) {
  if (!node?.classList?.contains("canvas-node-video-output")) return null;
  const result = VideoHistoryRules.appendVideoHistory(
    getCanvasVideoHistory(node),
    video,
    node.dataset.videoActiveId || "",
    createId,
  );
  const active = setCanvasVideoHistoryState(node, result.history, result.activeVideoId);
  renderCanvasVideoOutputNode(node);
  refreshCanvasConnectedNodes(node.dataset.id);
  scheduleCanvasConnectionRender();
  scheduleCanvasSave();
  return active;
}

function setCanvasVideoActiveItem(node, videoId) {
  if (!node?.classList?.contains("canvas-node-video-output")) return null;
  const history = getCanvasVideoHistory(node);
  const selected = history.find((video) => video.id === String(videoId || ""));
  if (!selected) return null;
  setCanvasVideoHistoryState(node, history, selected.id);
  renderCanvasVideoOutputNode(node);
  refreshCanvasConnectedNodes(node.dataset.id);
  scheduleCanvasConnectionRender();
  scheduleCanvasSave();
  setCanvasStatus(`已切换当前视频：${selected.name || "生成视频"}`);
  return selected;
}

function removeCanvasVideoHistoryItem(node, videoId) {
  if (!node?.classList?.contains("canvas-node-video-output")) return null;
  const result = VideoHistoryRules.removeVideoHistory(
    getCanvasVideoHistory(node),
    videoId,
    node.dataset.videoActiveId || "",
    createId,
  );
  const active = setCanvasVideoHistoryState(node, result.history, result.activeVideoId);
  renderCanvasVideoOutputNode(node);
  if (!result.history.length) node.classList.remove("is-video-history-open");
  refreshCanvasConnectedNodes(node.dataset.id);
  scheduleCanvasConnectionRender();
  scheduleCanvasSave();
  setCanvasStatus(result.history.length ? `已删除视频，历史中还剩 ${result.history.length} 个。` : "已清空视频历史。");
  return active;
}

function updateCanvasVideoHistoryDuration(node, videoId, duration) {
  const seconds = Number(duration || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  const history = getCanvasVideoHistory(node);
  const next = history.map((video) => video.id === videoId ? { ...video, duration: seconds } : video);
  setCanvasVideoHistoryState(node, next, node.dataset.videoActiveId || videoId);
  scheduleCanvasConnectionRender();
  scheduleCanvasSave();
}

function serializeCanvasVideoOutputState(node) {
  return {
    videoHistory: getCanvasVideoHistory(node),
    videoActiveId: getCanvasVideoActiveItem(node)?.id || "",
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

function getCanvasVideoOutputRenderOptions(item = {}) {
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

function renderCanvasVideoOutputNode(node, options = {}) {
  const wasHistoryOpen = node.classList.contains("is-video-history-open");
  const legacy = getCanvasVideoLegacyItem(node, options);
  let history;
  if (Array.isArray(options.videoHistory) || Array.isArray(options.history)) {
    history = VideoHistoryRules.normalizeVideoHistory(options.videoHistory || options.history, legacy, createId);
  } else {
    history = getCanvasVideoHistory(node);
    if (!history.length && legacy) history = VideoHistoryRules.normalizeVideoHistory([], legacy, createId);
  }
  const active = setCanvasVideoHistoryState(
    node,
    history,
    options.activeVideoId ?? node.dataset.videoActiveId ?? "",
  );
  const src = active?.src || "";
  node.innerHTML = "";

  const inputPort = createCanvasPort("input");
  const outputPort = createCanvasPort("output");
  const bar = createCanvasNodeBar(src ? "视频输出" : "等待视频");
  const stage = document.createElement("div");
  stage.className = "canvas-video-output-stage";
  if (src) {
    const video = document.createElement("video");
    video.src = src;
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.addEventListener("loadedmetadata", () => {
      updateCanvasVideoHistoryDuration(node, active.id, video.duration);
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
    setCanvasVideoHistoryOpen(node, node.querySelector(".canvas-video-history-panel")?.hidden !== false);
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
  historyClose.addEventListener("click", () => setCanvasVideoHistoryOpen(node, false));
  historyHeader.append(historyTitle, historyClose);
  const historyList = document.createElement("div");
  historyList.className = "canvas-video-history-list";
  const historyHint = document.createElement("footer");
  historyHint.className = "canvas-video-history-hint";
  historyHint.textContent = "点击视频可切换当前输出";
  historyPanel.append(historyHeader, historyList, historyHint);

  node.append(inputPort, outputPort, bar, stage, historyToggle, historyPanel, createCanvasResizeHandle());
  if (wasHistoryOpen && history.length) setCanvasVideoHistoryOpen(node, true);
  window.lucide?.createIcons({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
  scheduleCanvasConnectionRender();
}

function renderCanvasVideoOutputHistory(node) {
  const list = node?.querySelector(".canvas-video-history-list");
  const title = node?.querySelector(".canvas-video-history-title");
  const toggle = node?.querySelector(".canvas-video-history-toggle");
  if (!list || !title || !toggle) return;
  const history = getCanvasVideoHistory(node);
  const active = getCanvasVideoActiveItem(node);
  title.textContent = `视频历史 · ${history.length}`;
  toggle.querySelector("b")?.replaceChildren(String(history.length));
  toggle.hidden = !history.length;
  list.innerHTML = "";
  [...history].reverse().forEach((videoItem) => {
    const item = document.createElement("article");
    item.className = `canvas-video-history-item${videoItem.id === active?.id ? " is-active" : ""}`;
    item.dataset.videoHistoryId = videoItem.id;

    const preview = document.createElement("button");
    preview.type = "button";
    preview.className = "canvas-video-history-preview";
    preview.setAttribute("aria-current", videoItem.id === active?.id ? "true" : "false");
    preview.setAttribute("aria-label", `播放并设为当前视频：${videoItem.name || "生成视频"}`);
    const thumbnail = document.createElement("video");
    thumbnail.src = videoItem.src;
    thumbnail.muted = true;
    thumbnail.playsInline = true;
    thumbnail.preload = "none";
    thumbnail.tabIndex = -1;
    const details = document.createElement("span");
    const detailsName = document.createElement("strong");
    detailsName.textContent = videoItem.name || "生成视频";
    const detailsMeta = document.createElement("small");
    const durationLabel = Number(videoItem.duration || 0) > 0 ? `${Math.round(Number(videoItem.duration))} 秒` : "视频";
    const createdLabel = videoItem.createdAt ? new Date(videoItem.createdAt).toLocaleString() : "";
    detailsMeta.textContent = createdLabel ? `${durationLabel} · ${createdLabel}` : durationLabel;
    details.append(detailsName, detailsMeta);
    if (videoItem.promptSummary) {
      const detailsPrompt = document.createElement("small");
      detailsPrompt.className = "canvas-video-history-prompt";
      detailsPrompt.textContent = videoItem.promptSummary;
      details.append(detailsPrompt);
    }
    preview.append(thumbnail, details);
    preview.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setCanvasVideoActiveItem(node, videoItem.id);
    });

    const actions = document.createElement("span");
    actions.className = "canvas-video-history-actions";
    const play = document.createElement("button");
    play.type = "button";
    play.className = "canvas-video-history-action canvas-video-history-play";
    play.innerHTML = '<i data-lucide="play"></i>';
    play.title = "设为当前并播放";
    play.setAttribute("aria-label", "设为当前并播放");
    play.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setCanvasVideoActiveItem(node, videoItem.id);
      requestAnimationFrame(() => node.querySelector(".canvas-video-output-stage video")?.play().catch(() => {}));
    });
    const download = document.createElement("a");
    download.className = "canvas-video-history-action canvas-video-history-download";
    download.href = videoItem.src;
    download.download = videoItem.name || "minimax-h3.mp4";
    download.innerHTML = '<i data-lucide="download"></i>';
    download.title = "下载视频";
    download.setAttribute("aria-label", "下载视频");
    download.addEventListener("pointerdown", (event) => event.stopPropagation());
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "canvas-video-history-action canvas-video-history-remove";
    remove.innerHTML = '<i data-lucide="trash-2"></i>';
    remove.title = "从历史中删除";
    remove.setAttribute("aria-label", "从历史中删除");
    remove.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      requestCanvasVideoHistoryDelete(node, videoItem.id);
    });
    actions.append(play, download, remove);
    item.append(preview, actions);
    list.append(item);
  });
  window.lucide?.createIcons({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
}

function requestCanvasVideoHistoryDelete(node, videoId) {
  const history = getCanvasVideoHistory(node);
  const video = history.find((item) => item.id === String(videoId || ""));
  if (!video) return;
  const remaining = history.length - 1;
  const isActive = video.id === node.dataset.videoActiveId;
  const consequence = remaining
    ? `${isActive ? "这是当前视频，删除后会自动切换到最新的剩余视频。" : ""} 历史中还会保留 ${remaining} 个视频。`
    : "这是最后一个视频，删除后输出节点会变为空。";
  requestCanvasDeleteConfirmation({
    title: "删除这个历史视频？",
    message: `${consequence} 这只会移除画布历史，不会删除服务器上的视频文件。`,
    confirmLabel: "删除视频",
    onConfirm: () => {
      removeCanvasVideoHistoryItem(node, video.id);
      showCanvasDeleteUndo(`已从历史中删除“${video.name || "生成视频"}”。`);
    },
  });
}

function setCanvasVideoHistoryOpen(node, open) {
  const panel = node?.querySelector(".canvas-video-history-panel");
  const toggle = node?.querySelector(".canvas-video-history-toggle");
  if (!panel || !toggle) return false;
  if (open) {
    closeCanvasGalleryHistoryPanels();
    closeCanvasVideoHistoryPanels(node);
    renderCanvasVideoOutputHistory(node);
  }
  panel.hidden = !open;
  node.classList.toggle("is-video-history-open", Boolean(open));
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
  return Boolean(open);
}

function closeCanvasVideoHistoryPanels(exceptNode = null) {
  let closed = false;
  document.querySelectorAll("#canvasPlane .canvas-node-video-output.is-video-history-open").forEach((node) => {
    if (node === exceptNode) return;
    const panel = node.querySelector(".canvas-video-history-panel");
    const toggle = node.querySelector(".canvas-video-history-toggle");
    if (panel) panel.hidden = true;
    if (toggle) toggle.setAttribute("aria-expanded", "false");
    node.classList.remove("is-video-history-open");
    closed = true;
  });
  return closed;
}

function createCanvasNodeFromConnectChoice(choice, point) {
  if (choice === "video") return addCanvasVideoNode(point);
  if (choice === "audio") return addCanvasAudioNode(point);
  if (choice === "minimax-h3") return addCanvasMinimaxH3Node(point);
  if (choice === "video-output") return addCanvasVideoOutputNode(point);
  if (choice === "text") return addCanvasText(point, { focus: false });
  if (choice === "gallery") return addCanvasGallery(point);
  if (choice === "llm") return addCanvasLlmNode(point);
  if (choice === "comfy") return addCanvasComfyNode(point);
  if (choice === "loop") return addCanvasLoopNode(point);
  if (choice === "generator") return addCanvasImagePlaceholder(point);
  return addCanvasUploadPlaceholder(point);
}

function addCanvasLlmNode(point, options = {}) {
  const node = createCanvasNode("llm");
  if (point) setCanvasNodePoint(node, point);
  renderCanvasLlmNode(node, options);
  applyCanvasNodeSize(node);
  placeCanvasNode(node);
  scheduleCanvasSave();
  return node;
}

function addCanvasComfyNode(point, options = {}) {
  const node = createCanvasNode("comfy");
  if (point) setCanvasNodePoint(node, point);
  renderCanvasComfyNode(node, options);
  applyCanvasNodeSize(node);
  placeCanvasNode(node);
  scheduleCanvasSave();
  return node;
}

function addCanvasLoopNode(point) {
  const node = createCanvasNode("loop");
  if (point) setCanvasNodePoint(node, point);
  renderCanvasLoopNode(node);
  applyCanvasNodeSize(node);
  placeCanvasNode(node);
  scheduleCanvasSave();
  return node;
}

function addCanvasGallery(point) {
  const node = createCanvasNode("gallery");
  if (point) setCanvasNodePoint(node, point);
  renderCanvasGalleryNode(node, { images: [] });
  applyCanvasNodeSize(node);
  placeCanvasNode(node);
  scheduleCanvasSave();
  return node;
}

async function fillCanvasImageNode(node, file) {
  const url = await uploadCanvasImageFile(file);
  if (node.dataset.uploadOnly === "true") renderCanvasUploadNode(node, { src: url, name: file.name || "图片" });
  else renderCanvasImageNode(node, { src: url, name: file.name || "图片" });
  refreshCanvasConnectedNodes(node.dataset.id);
  scheduleCanvasSave();
}

function renderCanvasUploadNode(node, { src, name }) {
  const previousSize = node.dataset.canvasSize || "";
  const previousResolution = node.dataset.canvasResolution || "";
  node.innerHTML = "";
  node.dataset.imageSrc = src || "";
  node.dataset.imageName = name || "图片节点";
  node.dataset.originalSrc = src || "";
  if (previousSize) node.dataset.canvasSize = previousSize;
  if (previousResolution) node.dataset.canvasResolution = previousResolution;
  node.dataset.uploadOnly = "true";
  node.classList.toggle("canvas-node-frameless", Boolean(src));

  const outputPort = createCanvasPort("output");
  const media = document.createElement("div");
  media.className = `canvas-image-upload${src ? " has-image" : ""}`;
  media.title = src ? "双击替换图片" : "双击上传图片";
  if (src) {
    const img = document.createElement("img");
    img.alt = name || "画布图片";
    img.addEventListener("load", scheduleCanvasConnectionRender);
    registerCanvasDetailImage(img, src);
    media.append(img);
  } else {
    const title = document.createElement("strong");
    title.textContent = "上传图片";
    const hint = document.createElement("span");
    hint.textContent = "双击选择，或把图片拖进画布";
    media.append(title, hint);
  }
  media.addEventListener("dblclick", (event) => {
    event.stopPropagation();
    selectCanvasNode(node);
    document.querySelector("#canvasNodeImageInput")?.click();
  });

  const bar = createCanvasNodeBar(name || "图片节点");

  const hasIncoming = canvasState.connections.some((item) => item.to === node.dataset.id);
  if (hasIncoming) node.append(createCanvasPort("input"), outputPort, bar, media, createCanvasResizeHandle());
  else node.append(outputPort, bar, media, createCanvasResizeHandle());
  scheduleCanvasConnectionRender();
}

function renderCanvasImageNode(node, { src, name }) {
  const previousPrompt = node.querySelector(".canvas-node-prompt")?.value || "";
  const previousModel = node.querySelector(".canvas-node-model")?.value || node.dataset.canvasModel || imageModelInput.value || "";
  const previousSize = node.querySelector(".canvas-node-size")?.value || node.dataset.canvasSize || imageSizeInput.value || "1024x1024";
  const previousResolution = node.querySelector(".canvas-node-resolution")?.value || node.dataset.canvasResolution || imageResolutionInput.value || "1";
  const previousMidjourney = {
    version: node.querySelector(".canvas-midjourney-version")?.value || node.dataset.canvasMidjourneyVersion || MIDJOURNEY_DEFAULT_OPTIONS.version,
    mode: node.querySelector(".canvas-midjourney-mode")?.value || node.dataset.canvasMidjourneyMode || MIDJOURNEY_DEFAULT_OPTIONS.mode,
    speed: node.querySelector(".canvas-midjourney-speed")?.value || node.dataset.canvasMidjourneySpeed || MIDJOURNEY_DEFAULT_OPTIONS.speed,
    quality: node.querySelector(".canvas-midjourney-quality")?.value || node.dataset.canvasMidjourneyQuality || MIDJOURNEY_DEFAULT_OPTIONS.quality,
    style: node.querySelector(".canvas-midjourney-style")?.value || node.dataset.canvasMidjourneyStyle || MIDJOURNEY_DEFAULT_OPTIONS.style,
    stylize: Number(node.querySelector(".canvas-midjourney-stylize")?.value || node.dataset.canvasMidjourneyStylize || MIDJOURNEY_DEFAULT_OPTIONS.stylize),
  };
  node.innerHTML = "";
  node.dataset.imageSrc = src || "";
  node.dataset.imageName = name || "图片";
  node.dataset.originalSrc = src || "";
  delete node.dataset.maskSrc;
  delete node.dataset.maskName;
  delete node.dataset.openaiMaskSrc;
  delete node.dataset.openaiMaskName;
  delete node.dataset.maskBaseSrc;
  delete node.dataset.maskBaseName;
  node.dataset.canvasModel = previousModel;
  node.dataset.canvasSize = previousSize;
  node.dataset.canvasResolution = previousResolution;
  node.dataset.canvasMidjourneyVersion = previousMidjourney.version;
  node.dataset.canvasMidjourneyMode = previousMidjourney.mode;
  node.dataset.canvasMidjourneySpeed = previousMidjourney.speed;
  node.dataset.canvasMidjourneyQuality = previousMidjourney.quality;
  node.dataset.canvasMidjourneyStyle = previousMidjourney.style;
  node.dataset.canvasMidjourneyStylize = String(previousMidjourney.stylize);
  node.classList.toggle("canvas-node-frameless", Boolean(src));
  node.classList.toggle("canvas-node-generator", !src);

  const outputPort = createCanvasPort("output");
  const media = document.createElement("div");
  media.className = `canvas-image-upload${src ? " has-image" : ""}`;
  media.hidden = !src && Boolean(node.dataset.resultSrc);
  media.title = src ? "双击替换图片" : "双击上传图片";
  if (src) {
    const img = document.createElement("img");
    img.alt = name || "画布图片";
    img.addEventListener("load", scheduleCanvasConnectionRender);
    registerCanvasDetailImage(img, src);
    media.append(img);
  } else {
    const title = document.createElement("strong");
    title.textContent = "上传图片";
    const hint = document.createElement("span");
    hint.textContent = "点击选择，或把图片拖进画布";
    media.append(title, hint);
  }
  media.addEventListener("dblclick", (event) => {
    event.stopPropagation();
    selectCanvasNode(node);
    document.querySelector("#canvasNodeImageInput")?.click();
  });

  const refs = document.createElement("div");
  refs.className = "canvas-node-refs";

  const result = document.createElement("div");
  result.className = "canvas-node-result";
  result.hidden = !node.dataset.resultSrc;
  if (node.dataset.resultSrc) {
    const resultImg = document.createElement("img");
    resultImg.alt = "生成结果";
    resultImg.addEventListener("load", scheduleCanvasConnectionRender);
    registerCanvasDetailImage(resultImg, node.dataset.resultSrc);
    result.append(resultImg);
    result.append(createCanvasResultDownload(node));
  }

  const bar = createCanvasNodeBar(name || "图片");
  const hasIncoming = canvasState.connections.some((item) => item.to === node.dataset.id);
  if (src) {
    if (hasIncoming) {
      node.append(createCanvasPort("input"), outputPort, bar, media, refs, createCanvasResizeHandle());
      updateCanvasNodeRefs(node);
    } else {
      node.append(outputPort, bar, media, createCanvasResizeHandle());
    }
    scheduleCanvasConnectionRender();
    return;
  }

  const inputPort = createCanvasPort("input");
  const prompt = document.createElement("textarea");
  prompt.className = "canvas-node-prompt";
  prompt.rows = 3;
  prompt.placeholder = "输入生成提示词，连接文字节点后会自动填充";
  prompt.value = previousPrompt;
  prompt.addEventListener("wheel", stopCanvasTextWheel);

  const controls = document.createElement("div");
  controls.className = "canvas-node-controls";
  const model = document.createElement("select");
  model.className = "canvas-node-model";
  fillCanvasNodeModelSelect(model, previousModel);
  node.dataset.canvasModel = model.value;
  const size = document.createElement("select");
  size.className = "canvas-node-size";
  fillCanvasNodeSizeSelect(size, previousSize, model.value);
  const customSizeField = createCanvasCustomSizeField(node, previousSize);
  const resolution = document.createElement("select");
  resolution.className = "canvas-node-resolution";
  fillCanvasNodeResolutionSelect(resolution, previousResolution, model.value, size.value);
  const run = document.createElement("button");
  run.className = "canvas-node-run";
  run.type = "button";
  updateCanvasRunButtonLabel(run, model.value);
  run.addEventListener("click", () => runCanvasImageEdit(node));
  model.addEventListener("change", () => {
    const nextModel = model.value;
    node.dataset.canvasModel = nextModel;
    fillCanvasNodeSizeSelect(size, node.dataset.canvasSize, nextModel);
    node.dataset.canvasSize = size.value;
    syncCanvasCustomSizeField(node);
    const resolutionSize = size.value === "custom" ? node.dataset.canvasSize : size.value;
    fillCanvasNodeResolutionSelect(resolution, node.dataset.canvasResolution, nextModel, resolutionSize);
    node.dataset.canvasResolution = resolution.value;
    updateCanvasNodeResolutionAvailability(node);
    syncCanvasMidjourneyOptions(node, nextModel);
    updateCanvasRunButtonLabel(run, nextModel);
  });
  size.addEventListener("change", () => {
    node.dataset.canvasSize = size.value;
    syncCanvasCustomSizeField(node);
    const resolutionSize = size.value === "custom" ? node.dataset.canvasSize : size.value;
    fillCanvasNodeResolutionSelect(resolution, node.dataset.canvasResolution || resolution.value, model.value, resolutionSize);
    node.dataset.canvasResolution = resolution.value;
    updateCanvasNodeResolutionAvailability(node);
    updateCanvasRunButtonLabel(run, model.value);
  });
  resolution.addEventListener("change", () => {
    node.dataset.canvasResolution = resolution.value;
    rememberConcreteImageResolution(resolution);
    updateCanvasRunButtonLabel(run, model.value);
    syncCanvasNodeResolutionState(node);
  });
  const resolutionHelp = document.createElement("small");
  resolutionHelp.className = "canvas-node-resolution-help";
  resolutionHelp.hidden = true;
  const midjourneyOptions = createCanvasMidjourneyOptions(node, previousMidjourney);
  controls.append(model, size, resolution, run, customSizeField, resolutionHelp, midjourneyOptions);

  node.append(inputPort, outputPort, bar, refs, prompt, controls, createCanvasResizeHandle());
  updateCanvasNodeResolutionAvailability(node);
  syncCanvasMidjourneyOptions(node, model.value, previousMidjourney);
  updateCanvasNodeRefs(node);
  scheduleCanvasConnectionRender();
}

function renderCanvasGalleryNode(node, { images = [], title = "生成图集", activeImageId = "", columns = null, gap = null } = {}) {
  const previousColumns = Number(node.dataset.galleryColumns || 0);
  const previousGap = Number(node.dataset.galleryGap || 0);
  const hadPreviousGap = node.dataset.galleryGap !== undefined;
  node.innerHTML = "";
  const normalizedImages = normalizeCanvasGalleryImages(images);
  node.dataset.galleryImages = JSON.stringify(normalizedImages);
  node.dataset.galleryTitle = title;
  const resolvedColumns = Number.isInteger(columns) ? Math.max(1, Math.min(12, columns)) : previousColumns;
  const resolvedGap = hasCanvasAgentNumber(gap) ? Math.max(0, Number(gap)) : previousGap;
  if (resolvedColumns) node.dataset.galleryColumns = String(resolvedColumns);
  else delete node.dataset.galleryColumns;
  if (hasCanvasAgentNumber(gap) || hadPreviousGap) node.dataset.galleryGap = String(resolvedGap);
  else delete node.dataset.galleryGap;
  const activeImage = resolveCanvasGalleryActiveImage(normalizedImages, activeImageId);
  if (activeImage) node.dataset.galleryActiveImageId = activeImage.id;
  else delete node.dataset.galleryActiveImageId;
  node.classList.toggle("canvas-node-frameless", Boolean(activeImage));
  node.classList.toggle("canvas-gallery-frameless", Boolean(activeImage));
  const inputPort = createCanvasPort("input");
  const outputPort = createCanvasPort("output");
  const bar = createCanvasNodeBar(title);
  const barTitle = bar.querySelector(".canvas-node-title");
  const barDelete = bar.querySelector(".canvas-node-delete");
  if (barTitle) barTitle.innerHTML = `<i data-lucide="images"></i><span>${escapeHtml(title)}</span>`;
  if (barDelete) {
    barDelete.innerHTML = '<i data-lucide="x"></i>';
    barDelete.setAttribute("aria-label", "删除图集节点");
  }
  const stack = document.createElement("div");
  stack.className = "canvas-gallery-stack";
  const sliceToggle = document.createElement("button");
  sliceToggle.type = "button";
  sliceToggle.className = "canvas-gallery-slice-toggle";
  sliceToggle.title = "宫格裁切当前图片";
  sliceToggle.setAttribute("aria-label", "宫格裁切当前图片");
  sliceToggle.innerHTML = '<i data-lucide="grid-2x2"></i>';
  sliceToggle.hidden = !activeImage;
  sliceToggle.addEventListener("pointerdown", (event) => event.stopPropagation());
  sliceToggle.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openCanvasGridMenu(node);
  });
  const historyToggle = document.createElement("button");
  historyToggle.type = "button";
  historyToggle.className = "canvas-gallery-history-toggle";
  historyToggle.title = "查看此节点历史记录";
  historyToggle.setAttribute("aria-label", "查看此节点历史记录");
  historyToggle.setAttribute("aria-expanded", "false");
  historyToggle.addEventListener("pointerdown", (event) => event.stopPropagation());
  historyToggle.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setCanvasGalleryHistoryOpen(node, node.querySelector(".canvas-gallery-history-panel")?.hidden !== false);
  });
  const historyPanel = document.createElement("section");
  historyPanel.className = "canvas-gallery-history-panel";
  historyPanel.hidden = true;
  historyPanel.addEventListener("pointerdown", (event) => event.stopPropagation());
  historyPanel.addEventListener("click", (event) => event.stopPropagation());
  historyPanel.addEventListener("wheel", (event) => event.stopPropagation());
  const historyHeader = document.createElement("header");
  const historyTitle = document.createElement("strong");
  historyTitle.className = "canvas-gallery-history-title";
  const historyClose = document.createElement("button");
  historyClose.type = "button";
  historyClose.className = "canvas-gallery-history-close";
  historyClose.innerHTML = '<i data-lucide="x"></i>';
  historyClose.setAttribute("aria-label", "关闭历史记录");
  historyClose.addEventListener("click", () => setCanvasGalleryHistoryOpen(node, false));
  historyHeader.append(historyTitle, historyClose);
  const historyList = document.createElement("div");
  historyList.className = "canvas-gallery-history-list";
  const historyHint = document.createElement("footer");
  historyHint.className = "canvas-gallery-history-hint";
  historyHint.textContent = "点击设为当前图片，拖到画布可复制";
  historyPanel.append(historyHeader, historyList, historyHint);
  node.append(inputPort, outputPort, bar, stack, sliceToggle, historyToggle, historyPanel, createCanvasResizeHandle());
  applyCanvasGalleryLayoutPreferences(node);
  renderCanvasGalleryImages(node);
  requestAnimationFrame(() => {
    window.lucide?.createIcons({
      attrs: {
        "aria-hidden": "true",
        "stroke-width": 1.8,
      },
    });
  });
  scheduleCanvasConnectionRender();
}

function applyCanvasGalleryLayoutPreferences(node) {
  const list = node?.querySelector(".canvas-gallery-history-list");
  if (!list) return;
  const columns = Number(node.dataset.galleryColumns || 0);
  const gap = Number(node.dataset.galleryGap || 0);
  if (Number.isInteger(columns) && columns > 0) list.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
  else list.style.removeProperty("grid-template-columns");
  if (Number.isFinite(gap) && node.dataset.galleryGap !== undefined) list.style.gap = `${Math.max(0, gap)}px`;
  else list.style.removeProperty("gap");
}

function ensureCanvasGridMenuMarkup() {
  let menu = document.querySelector("#canvasGridMenu");
  if (menu) return menu;
  menu = document.createElement("div");
  menu.id = "canvasGridMenu";
  menu.className = "canvas-grid-menu";
  menu.hidden = true;
  const customOptions = Array.from({ length: 5 }, (_, index) => {
    const value = index + 1;
    return `<option value="${value}">${value}</option>`;
  }).join("");
  menu.innerHTML = `
    <div class="canvas-grid-menu-panel" role="dialog" aria-label="宫格裁切方式">
      <section data-grid-menu-view="presets">
        <header><strong>宫格裁切</strong><span>选择网格</span></header>
        <div class="canvas-grid-menu-options">
          <button type="button" class="canvas-grid-menu-option" data-grid-rows="2" data-grid-columns="2"><b>2×2</b><span>4 宫格</span></button>
          <button type="button" class="canvas-grid-menu-option" data-grid-rows="3" data-grid-columns="3"><b>3×3</b><span>9 宫格</span></button>
          <button type="button" class="canvas-grid-menu-option" data-grid-rows="4" data-grid-columns="4"><b>4×4</b><span>16 宫格</span></button>
          <button type="button" class="canvas-grid-menu-option" data-grid-rows="5" data-grid-columns="5"><b>5×5</b><span>25 宫格</span></button>
          <button type="button" class="canvas-grid-menu-option is-wide" data-grid-custom><b>自定义</b><span>1–5 行 × 1–5 列</span></button>
        </div>
      </section>
      <section data-grid-menu-view="custom" hidden>
        <header><button type="button" class="canvas-grid-menu-back" data-grid-back="presets" aria-label="返回预设">←</button><strong>自定义网格</strong></header>
        <div class="canvas-grid-menu-custom">
          <label><span>行</span><select data-grid-custom-rows>${customOptions}</select></label>
          <span>×</span>
          <label><span>列</span><select data-grid-custom-columns>${customOptions}</select></label>
        </div>
        <button type="button" class="canvas-grid-menu-option is-primary is-wide" data-grid-custom-confirm><b>继续</b><span>选择输出方式</span></button>
      </section>
      <section data-grid-menu-view="actions" hidden>
        <header><button type="button" class="canvas-grid-menu-back" data-grid-back="presets" aria-label="返回预设">←</button><strong data-grid-summary>宫格裁切</strong></header>
        <div class="canvas-grid-menu-options is-actions">
          <button type="button" class="canvas-grid-menu-option" data-grid-action="direct"><b>仅裁剪</b><span>生成独立图片节点</span></button>
          <button type="button" class="canvas-grid-menu-option" data-grid-action="editor"><b>创建格子</b><span>生成可编辑宫格节点</span></button>
        </div>
        <small class="canvas-grid-menu-status" aria-live="polite"></small>
      </section>
    </div>
  `;
  ["pointerdown", "click", "wheel"].forEach((type) => {
    menu.addEventListener(type, (event) => event.stopPropagation());
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    closeCanvasGridMenu();
  });
  menu.addEventListener("click", async (event) => {
    const state = canvasGridMenuState;
    if (!state || state.busy) return;
    const preset = event.target.closest("[data-grid-rows][data-grid-columns]");
    if (preset) {
      selectCanvasGridSpec(state.sourceNode, {
        rows: preset.dataset.gridRows,
        columns: preset.dataset.gridColumns,
      });
      return;
    }
    if (event.target.closest("[data-grid-custom]")) {
      state.view = "custom";
      renderCanvasGridMenu();
      return;
    }
    if (event.target.closest("[data-grid-custom-confirm]")) {
      selectCanvasGridSpec(state.sourceNode, {
        rows: menu.querySelector("[data-grid-custom-rows]")?.value,
        columns: menu.querySelector("[data-grid-custom-columns]")?.value,
      });
      return;
    }
    const back = event.target.closest("[data-grid-back]");
    if (back) {
      state.view = back.dataset.gridBack || "presets";
      state.spec = null;
      renderCanvasGridMenu();
      return;
    }
    const action = event.target.closest("[data-grid-action]")?.dataset.gridAction;
    if (!action || !state.spec) return;
    state.busy = true;
    state.status = action === "direct" ? "正在裁切并保存图片…" : "正在创建宫格编辑节点…";
    renderCanvasGridMenu();
    try {
      if (action === "direct") {
        await createCanvasDirectGridSlices(state.sourceNode, state.spec);
      } else if (typeof addCanvasGridEditorNode === "function") {
        await addCanvasGridEditorNode(state.sourceNode, { ...state.spec, source: state.active });
      } else {
        throw new Error("宫格编辑节点尚未就绪。");
      }
      state.busy = false;
      closeCanvasGridMenu();
    } catch (error) {
      state.busy = false;
      state.status = `操作失败：${error.message || "未知错误"}`;
      renderCanvasGridMenu();
    }
  });
  document.body.append(menu);
  return menu;
}

function positionCanvasGridMenu(menu, anchor) {
  if (!menu || !anchor) return;
  const anchorRect = anchor.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const margin = 12;
  let left = anchorRect.right + 10;
  if (left + menuRect.width > window.innerWidth - margin) left = anchorRect.left - menuRect.width - 10;
  const top = Math.max(margin, Math.min(window.innerHeight - menuRect.height - margin, anchorRect.top));
  menu.style.left = `${Math.max(margin, left)}px`;
  menu.style.top = `${top}px`;
}

function renderCanvasGridMenu() {
  const state = canvasGridMenuState;
  const menu = document.querySelector("#canvasGridMenu");
  if (!state || !menu) return;
  menu.querySelectorAll("[data-grid-menu-view]").forEach((view) => {
    view.hidden = view.dataset.gridMenuView !== state.view;
  });
  const summary = menu.querySelector("[data-grid-summary]");
  if (summary && state.spec) summary.textContent = `${state.spec.rows}×${state.spec.columns} 宫格`;
  const status = menu.querySelector(".canvas-grid-menu-status");
  if (status) status.textContent = state.status || "";
  menu.querySelectorAll("button, select").forEach((control) => {
    control.disabled = Boolean(state.busy);
  });
  window.lucide?.createIcons({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
}

function openCanvasGridMenu(sourceNode) {
  const active = getCanvasGalleryActiveImage(sourceNode);
  const src = active?.savedUrl || active?.src || active?.url;
  if (!sourceNode?.classList?.contains("canvas-node-gallery") || !src) {
    setCanvasStatus("当前图集没有可裁切的图片。");
    return false;
  }
  closeCanvasGridMenu({ restoreFocus: false });
  const menu = ensureCanvasGridMenuMarkup();
  canvasGridMenuState = {
    sourceNode,
    active: { ...active, src, savedUrl: active.savedUrl || src },
    returnFocus: document.activeElement,
    spec: null,
    view: "presets",
    busy: false,
    status: "",
  };
  menu.hidden = false;
  renderCanvasGridMenu();
  positionCanvasGridMenu(menu, sourceNode.querySelector(".canvas-gallery-slice-toggle"));
  menu.querySelector("[data-grid-menu-view=\"presets\"] button")?.focus();
  return true;
}

function closeCanvasGridMenu({ restoreFocus = true } = {}) {
  const state = canvasGridMenuState;
  if (state?.busy) return false;
  const menu = document.querySelector("#canvasGridMenu");
  if (menu) menu.hidden = true;
  canvasGridMenuState = null;
  if (restoreFocus && state?.returnFocus?.isConnected) state.returnFocus.focus?.();
  return true;
}

function selectCanvasGridSpec(sourceNode, spec) {
  const state = canvasGridMenuState;
  if (!state || state.sourceNode !== sourceNode) return null;
  state.spec = GridSlicingRules.normalizeGridSpec(spec?.rows, spec?.columns);
  state.view = "actions";
  state.status = "";
  renderCanvasGridMenu();
  return state.spec;
}

async function persistCanvasGridCrops(image, crops, { sourceName, outputSize = null } = {}) {
  const createdAt = new Date().toISOString();
  const settled = await Promise.allSettled(crops.map(async (crop) => {
    const width = outputSize?.width || Math.max(1, Math.round(crop.width));
    const height = outputSize?.height || Math.max(1, Math.round(crop.height));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(
      image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      width,
      height,
    );
    const blob = await canvasToPngBlob(canvas, `第 ${crop.row} 行第 ${crop.column} 列切片导出失败。`);
    const stem = String(sourceName || "grid-image").replace(/\.[^.]+$/, "");
    const name = `${stem}-r${String(crop.row).padStart(2, "0")}-c${String(crop.column).padStart(2, "0")}.png`;
    const savedUrl = await uploadCanvasImageFile(new File([blob], name, { type: "image/png" }));
    return {
      id: createId(),
      name,
      src: savedUrl,
      savedUrl,
      createdAt,
      width,
      height,
      row: crop.row,
      column: crop.column,
    };
  }));
  const failed = settled.find((result) => result.status === "rejected");
  if (failed) throw failed.reason || new Error("宫格切片保存失败。");
  return settled.map((result) => result.value);
}

function findCanvasGridImageBlockPoint(sourceNode, specValue, nodeSize) {
  const spec = GridSlicingRules.normalizeGridSpec(specValue?.rows, specValue?.columns);
  const sourceX = Number(sourceNode?.dataset.x || 0);
  const sourceY = Number(sourceNode?.dataset.y || 0);
  const sourceWidth = Number(sourceNode?.dataset.width || sourceNode?.offsetWidth || 292) || 292;
  const gap = 24;
  const blockWidth = spec.columns * nodeSize.width + (spec.columns - 1) * gap;
  const blockHeight = spec.rows * nodeSize.height + (spec.rows - 1) * gap;
  const nodes = Array.from(document.querySelectorAll("#canvasPlane .canvas-node")).filter((node) => node !== sourceNode);
  for (let step = 0; step < 32; step += 1) {
    const point = { x: sourceX + sourceWidth + 90, y: sourceY + step * (blockHeight + 48) };
    const overlaps = nodes.some((node) => {
      const box = getCanvasNodeBox(node);
      return point.x < box.right + 28
        && point.x + blockWidth + 28 > box.left
        && point.y < box.bottom + 28
        && point.y + blockHeight + 28 > box.top;
    });
    if (!overlaps) return point;
  }
  return { x: sourceX + sourceWidth + 90, y: sourceY + blockHeight + 48 };
}

function placeCanvasGridImageNodes(sourceNode, images, specValue) {
  const spec = GridSlicingRules.normalizeGridSpec(specValue?.rows, specValue?.columns);
  const first = images[0] || {};
  const ratio = Math.max(0.05, Number(first.height || 1) / Math.max(1, Number(first.width || 1)));
  const nodeWidth = Math.max(120, Math.min(220, Math.round(260 / ratio)));
  const nodeHeight = Math.max(72, Math.round(nodeWidth * ratio));
  const nodeSize = { width: nodeWidth, height: nodeHeight };
  const block = findCanvasGridImageBlockPoint(sourceNode, spec, nodeSize);
  const gap = 24;
  const nodes = images.map((image, index) => {
    const row = Number(image.row || Math.floor(index / spec.columns) + 1);
    const column = Number(image.column || (index % spec.columns) + 1);
    const point = {
      x: block.x + (column - 1) * (nodeWidth + gap),
      y: block.y + (row - 1) * (nodeHeight + gap),
    };
    const node = addCanvasImage(image.savedUrl || image.src, image.name, point);
    node.dataset.width = String(nodeWidth);
    node.dataset.gridSliceRow = String(row);
    node.dataset.gridSliceColumn = String(column);
    applyCanvasNodeSize(node);
    updateCanvasNodePosition(node);
    return node;
  });
  if (nodes[0]) selectCanvasNode(nodes[0]);
  scheduleCanvasConnectionRender();
  scheduleCanvasSave();
  return nodes;
}

async function createCanvasDirectGridSlices(sourceNode, specValue) {
  const active = canvasGridMenuState?.sourceNode === sourceNode
    ? canvasGridMenuState.active
    : getCanvasGalleryActiveImage(sourceNode);
  const src = active?.savedUrl || active?.src || active?.url;
  if (!sourceNode?.classList?.contains("canvas-node-gallery") || !src) {
    throw new Error("当前图集没有可裁切的图片。");
  }
  const image = await loadImageElement(src);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error("当前图片没有有效尺寸。");
  const spec = GridSlicingRules.normalizeGridSpec(specValue?.rows, specValue?.columns);
  const layout = GridSlicingRules.createGridLayout(width, height, spec.rows, spec.columns, 0);
  setCanvasStatus(`正在保存 ${layout.regions.length} 张裁切图片…`);
  const images = await persistCanvasGridCrops(image, layout.regions, { sourceName: active.name });
  const nodes = placeCanvasGridImageNodes(sourceNode, images, spec);
  setCanvasStatus(`已裁切并创建 ${nodes.length} 个独立图片节点。`);
  return nodes;
}

function createCanvasGridEditorState({ source = {}, sourceNodeId = "", width, height, rows, columns } = {}) {
  const layout = GridSlicingRules.createGridLayout(width, height, rows, columns, 0);
  return {
    version: 1,
    sourceNodeId: String(sourceNodeId || ""),
    sourceSrc: source.savedUrl || source.src || source.url || "",
    sourceName: source.name || "宫格来源.png",
    sourceWidth: Math.round(width),
    sourceHeight: Math.round(height),
    rows: layout.spec.rows,
    columns: layout.spec.columns,
    aspect: "match",
    uniformGap: 0,
    horizontalBands: layout.horizontalBands,
    verticalBands: layout.verticalBands,
    cellTransforms: GridSlicingRules.normalizeCellTransforms(layout.regions, []),
    selectedCellKey: layout.regions[0]?.key || "",
    selectedBand: null,
    editing: false,
    collapsed: false,
  };
}

function normalizeCanvasGridEditorState(value = {}) {
  const sourceWidth = Math.max(0, Math.round(Number(value.sourceWidth) || 0));
  const sourceHeight = Math.max(0, Math.round(Number(value.sourceHeight) || 0));
  const spec = GridSlicingRules.normalizeGridSpec(value.rows, value.columns);
  const aspect = ["match", "16:9", "9:16", "3:4", "4:3", "1:1"].includes(value.aspect)
    ? value.aspect
    : "match";
  const requestedGap = Math.max(0, Math.round(Number(value.uniformGap) || 0));
  const uniformGap = requestedGap - (requestedGap % 2);
  if (!value.sourceSrc || !sourceWidth || !sourceHeight) {
    return {
      version: 1,
      sourceNodeId: String(value.sourceNodeId || ""),
      sourceSrc: "",
      sourceName: "",
      sourceWidth: 0,
      sourceHeight: 0,
      rows: spec.rows,
      columns: spec.columns,
      aspect,
      uniformGap,
      horizontalBands: [],
      verticalBands: [],
      cellTransforms: [],
      selectedCellKey: "",
      selectedBand: null,
      editing: false,
      collapsed: Boolean(value.collapsed),
    };
  }
  const layout = GridSlicingRules.createGridLayout(
    sourceWidth,
    sourceHeight,
    spec.rows,
    spec.columns,
    uniformGap,
  );
  let horizontalBands = Array.isArray(value.horizontalBands)
    && value.horizontalBands.length === spec.rows - 1
    ? value.horizontalBands
    : layout.horizontalBands;
  let verticalBands = Array.isArray(value.verticalBands)
    && value.verticalBands.length === spec.columns - 1
    ? value.verticalBands
    : layout.verticalBands;
  let regions;
  try {
    regions = GridSlicingRules.getSliceRegions(sourceWidth, sourceHeight, verticalBands, horizontalBands)
      .map((region) => ({ ...region, key: `r${region.row}-c${region.column}` }));
  } catch {
    horizontalBands = layout.horizontalBands;
    verticalBands = layout.verticalBands;
    regions = layout.regions;
  }
  return {
    version: 1,
    sourceNodeId: String(value.sourceNodeId || ""),
    sourceSrc: String(value.sourceSrc || ""),
    sourceName: String(value.sourceName || "宫格来源.png"),
    sourceWidth,
    sourceHeight,
    rows: spec.rows,
    columns: spec.columns,
    aspect,
    uniformGap,
    horizontalBands,
    verticalBands,
    cellTransforms: GridSlicingRules.normalizeCellTransforms(regions, value.cellTransforms),
    selectedCellKey: regions.some((region) => region.key === value.selectedCellKey)
      ? value.selectedCellKey
      : regions[0]?.key || "",
    selectedBand: value.selectedBand || null,
    editing: Boolean(value.editing),
    collapsed: Boolean(value.collapsed),
  };
}

function getCanvasGridEditorState(node) {
  if (!node) return normalizeCanvasGridEditorState();
  try {
    return normalizeCanvasGridEditorState(JSON.parse(node.dataset.gridEditorState || "{}"));
  } catch {
    return normalizeCanvasGridEditorState();
  }
}

function setCanvasGridEditorState(node, state, { save = true } = {}) {
  if (!node) return null;
  const normalized = normalizeCanvasGridEditorState(state);
  node.dataset.gridEditorState = JSON.stringify(normalized);
  renderCanvasGridEditorNode(node, normalized);
  refreshCanvasConnectedNodes(node.dataset.id);
  if (save) scheduleCanvasSave();
  return normalized;
}

function getCanvasGridEditorRegions(state) {
  if (!state?.sourceWidth || !state?.sourceHeight) return [];
  return GridSlicingRules.getSliceRegions(
    state.sourceWidth,
    state.sourceHeight,
    state.verticalBands,
    state.horizontalBands,
  ).map((region) => ({ ...region, key: `r${region.row}-c${region.column}` }));
}

function createCanvasGridEditorTrackTemplate(regions, bands, axis) {
  const firstLine = regions.filter((region) => axis === "vertical" ? region.row === 1 : region.column === 1);
  const tracks = [];
  firstLine.forEach((region, index) => {
    tracks.push(`${axis === "vertical" ? region.width : region.height}fr`);
    const band = bands[index];
    if (band) tracks.push(`${Math.max(0, band.end - band.start)}fr`);
  });
  return tracks.join(" ");
}

function appendCanvasGridEditorBands(layer, state, axis, bands) {
  const dimension = axis === "vertical" ? state.sourceWidth : state.sourceHeight;
  bands.forEach((band, index) => {
    const element = document.createElement("div");
    const width = Math.max(0, band.end - band.start);
    element.className = `canvas-grid-editor-band is-${axis}${width === 0 ? " is-line" : ""}`;
    element.classList.toggle(
      "is-selected",
      state.selectedBand?.axis === axis && state.selectedBand?.id === band.id,
    );
    element.dataset.axis = axis;
    element.dataset.bandId = band.id;
    element.dataset.bandIndex = String(index);
    if (axis === "vertical") {
      element.style.left = `${(band.start / dimension) * 100}%`;
      element.style.width = `${(width / dimension) * 100}%`;
    } else {
      element.style.top = `${(band.start / dimension) * 100}%`;
      element.style.height = `${(width / dimension) * 100}%`;
    }
    element.innerHTML = `
      <button type="button" data-band-edge="start" aria-label="调整间隔起点"></button>
      <button type="button" data-band-edge="move" aria-label="移动分割线"></button>
      <button type="button" data-band-edge="end" aria-label="调整间隔终点"></button>
    `;
    element.addEventListener("pointerdown", (event) => startCanvasGridEditorBandDrag(event, layer.closest(".canvas-node")));
    layer.append(element);
  });
}

function renderCanvasGridEditorNode(node, stateValue) {
  const state = normalizeCanvasGridEditorState(stateValue || getCanvasGridEditorState(node));
  node.innerHTML = "";
  node.dataset.gridEditorState = JSON.stringify(state);
  node.classList.remove("canvas-node-frameless");
  node.classList.toggle("is-grid-editing", state.editing);
  node.classList.toggle("is-grid-collapsed", state.collapsed);
  const inputPort = createCanvasPort("input");
  const outputPort = createCanvasPort("output");
  const bar = createCanvasNodeBar("宫格编辑");
  const shell = document.createElement("div");
  shell.className = "canvas-grid-editor-shell";
  const toolbar = document.createElement("div");
  toolbar.className = "canvas-grid-editor-toolbar";
  toolbar.innerHTML = `
    <button type="button" class="canvas-grid-editor-aspect">比例 ${state.aspect === "match" ? "匹配" : state.aspect}</button>
    <button type="button" class="canvas-grid-editor-grid">网格 ${state.rows}×${state.columns}</button>
    <button type="button" class="canvas-grid-editor-edit" aria-pressed="${state.editing}">${state.editing ? "完成编辑" : "编辑"}</button>
    <button type="button" class="canvas-grid-editor-output">输出图集</button>
    <button type="button" class="canvas-grid-editor-clear">清空</button>
    <button type="button" class="canvas-grid-editor-collapse" aria-expanded="${!state.collapsed}">${state.collapsed ? "展开" : "折叠"}</button>
  `;
  const body = document.createElement("div");
  body.className = "canvas-grid-editor-body";
  body.hidden = state.collapsed;
  const editControls = document.createElement("div");
  editControls.className = "canvas-grid-editor-edit-controls";
  editControls.hidden = !state.editing || !state.sourceSrc;
  const selectedBand = state.selectedBand
    ? (state.selectedBand.axis === "vertical" ? state.verticalBands : state.horizontalBands)
      .find((band) => band.id === state.selectedBand.id)
    : null;
  const selectedTransform = state.cellTransforms.find((item) => item.key === state.selectedCellKey);
  editControls.innerHTML = `
    <label><span>统一间隔</span><input class="canvas-grid-editor-uniform-gap" type="number" min="0" step="2" value="${state.uniformGap}"><em>px</em></label>
    <label><span>选中线</span><input class="canvas-grid-editor-band-gap" type="number" min="0" step="2" value="${selectedBand ? selectedBand.end - selectedBand.start : 0}" ${selectedBand ? "" : "disabled"}><em>px</em></label>
    <label class="canvas-grid-editor-zoom-control"><span>选中格缩放</span><input class="canvas-grid-editor-zoom" type="range" min="1" max="8" step="0.05" value="${selectedTransform?.zoom || 1}"><output>${(selectedTransform?.zoom || 1).toFixed(2)}×</output></label>
  `;
  const preview = document.createElement("div");
  preview.className = "canvas-grid-editor-preview";
  const cells = document.createElement("div");
  cells.className = "canvas-grid-editor-cells";
  const bandLayer = document.createElement("div");
  bandLayer.className = "canvas-grid-editor-band-layer";
  bandLayer.hidden = !state.editing;
  const status = document.createElement("div");
  status.className = "canvas-grid-editor-status";
  status.setAttribute("aria-live", "polite");
  if (!state.sourceSrc) {
    const empty = document.createElement("div");
    empty.className = "canvas-grid-editor-empty";
    empty.textContent = "来源图片已清空";
    cells.append(empty);
    status.textContent = "重新创建宫格节点可继续编辑。";
  } else {
    const regions = getCanvasGridEditorRegions(state);
    const transforms = new Map(state.cellTransforms.map((transform) => [transform.key, transform]));
    const ratio = GridSlicingRules.resolveAspectRatio(state.aspect, {
      width: state.sourceWidth,
      height: state.sourceHeight,
      rows: state.rows,
      columns: state.columns,
    });
    cells.style.aspectRatio = `${state.sourceWidth} / ${state.sourceHeight}`;
    cells.style.gridTemplateColumns = createCanvasGridEditorTrackTemplate(regions, state.verticalBands, "vertical");
    cells.style.gridTemplateRows = createCanvasGridEditorTrackTemplate(regions, state.horizontalBands, "horizontal");
    regions.forEach((region, index) => {
      const crop = GridSlicingRules.getCellCrop(region, ratio, transforms.get(region.key));
      const cell = document.createElement("div");
      cell.className = "canvas-grid-editor-cell";
      cell.classList.toggle("is-selected", state.selectedCellKey === region.key);
      cell.dataset.cellKey = region.key;
      cell.dataset.crop = JSON.stringify({
        x: crop.x,
        y: crop.y,
        width: crop.width,
        height: crop.height,
        ratio,
      });
      cell.style.gridColumn = String((region.column - 1) * 2 + 1);
      cell.style.gridRow = String((region.row - 1) * 2 + 1);
      const frame = document.createElement("div");
      frame.className = "canvas-grid-editor-cell-frame";
      frame.tabIndex = 0;
      frame.dataset.cellKey = region.key;
      const regionRatio = region.width / region.height;
      if (ratio >= regionRatio) {
        frame.style.width = "100%";
        frame.style.height = `${Math.min(100, (region.width / ratio / region.height) * 100)}%`;
      } else {
        frame.style.height = "100%";
        frame.style.width = `${Math.min(100, (region.height * ratio / region.width) * 100)}%`;
      }
      const image = createDeferredThumbnail(
        state.sourceSrc,
        `${state.sourceName} 第 ${region.row} 行第 ${region.column} 列`,
      );
      image.draggable = false;
      image.style.width = `${(state.sourceWidth / crop.width) * 100}%`;
      image.style.height = `${(state.sourceHeight / crop.height) * 100}%`;
      image.style.left = `${-(crop.x / crop.width) * 100}%`;
      image.style.top = `${-(crop.y / crop.height) * 100}%`;
      const label = document.createElement("span");
      label.textContent = String(index + 1);
      frame.append(image, label);
      cell.append(frame);
      frame.addEventListener("pointerdown", (event) => startCanvasGridEditorCellPan(event, node, region.key));
      frame.addEventListener("click", (event) => {
        event.stopPropagation();
        const latest = getCanvasGridEditorState(node);
        if (latest.selectedCellKey === region.key) return;
        setCanvasGridEditorState(node, { ...latest, selectedCellKey: region.key });
      });
      frame.addEventListener("wheel", (event) => {
        if (!getCanvasGridEditorState(node).editing) return;
        event.preventDefault();
        event.stopPropagation();
        const current = getCanvasGridEditorState(node).cellTransforms.find((item) => item.key === region.key);
        const delta = event.deltaY < 0 ? 0.05 : -0.05;
        setCanvasGridEditorCellZoom(node, region.key, (current?.zoom || 1) + delta, { save: false });
        clearTimeout(canvasGridEditorWheelTimers.get(node.dataset.id));
        canvasGridEditorWheelTimers.set(node.dataset.id, setTimeout(() => {
          canvasGridEditorWheelTimers.delete(node.dataset.id);
          scheduleCanvasSave();
        }, 260));
      }, { passive: false });
      cells.append(cell);
    });
    appendCanvasGridEditorBands(bandLayer, state, "vertical", state.verticalBands);
    appendCanvasGridEditorBands(bandLayer, state, "horizontal", state.horizontalBands);
    status.textContent = `${state.rows * state.columns} 格 · ${state.sourceWidth} × ${state.sourceHeight}px 来源快照`;
  }
  preview.append(cells, bandLayer);
  body.append(editControls, preview, status);
  shell.append(toolbar, body);
  node.append(inputPort, outputPort, bar, shell, createCanvasResizeHandle());
  toolbar.addEventListener("pointerdown", (event) => event.stopPropagation());
  editControls.addEventListener("pointerdown", (event) => event.stopPropagation());
  toolbar.querySelector(".canvas-grid-editor-aspect")?.addEventListener("click", (event) => {
    toggleCanvasGridEditorPopover(node, "aspect", event.currentTarget);
  });
  toolbar.querySelector(".canvas-grid-editor-grid")?.addEventListener("click", (event) => {
    toggleCanvasGridEditorPopover(node, "grid", event.currentTarget);
  });
  toolbar.querySelector(".canvas-grid-editor-edit")?.addEventListener("click", () => {
    const latest = getCanvasGridEditorState(node);
    setCanvasGridEditorState(node, { ...latest, editing: !latest.editing, collapsed: false });
  });
  toolbar.querySelector(".canvas-grid-editor-output")?.addEventListener("click", () => {
    if (typeof outputCanvasGridEditorGallery === "function") outputCanvasGridEditorGallery(node);
    else setCanvasStatus("宫格输出功能尚未就绪。");
  });
  toolbar.querySelector(".canvas-grid-editor-clear")?.addEventListener("click", () => clearCanvasGridEditor(node));
  toolbar.querySelector(".canvas-grid-editor-collapse")?.addEventListener("click", () => {
    setCanvasGridEditorCollapsed(node, !getCanvasGridEditorState(node).collapsed);
  });
  editControls.querySelector(".canvas-grid-editor-uniform-gap")?.addEventListener("change", (event) => {
    setCanvasGridEditorUniformGap(node, event.target.value);
  });
  editControls.querySelector(".canvas-grid-editor-band-gap")?.addEventListener("change", (event) => {
    const latest = getCanvasGridEditorState(node);
    if (latest.selectedBand) {
      setCanvasGridEditorBandGap(node, latest.selectedBand.axis, latest.selectedBand.id, event.target.value);
    }
  });
  editControls.querySelector(".canvas-grid-editor-zoom")?.addEventListener("input", (event) => {
    const latest = getCanvasGridEditorState(node);
    setCanvasGridEditorCellZoom(node, latest.selectedCellKey, event.target.value, { save: false });
  });
  editControls.querySelector(".canvas-grid-editor-zoom")?.addEventListener("change", () => scheduleCanvasSave());
  window.lucide?.createIcons({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
  scheduleCanvasConnectionRender();
}

function findCanvasGridEditorPoint(sourceNode, estimatedWidth = 620, estimatedHeight = 520) {
  const sourceX = Number(sourceNode?.dataset.x || 0);
  const sourceY = Number(sourceNode?.dataset.y || 0);
  const sourceWidth = Number(sourceNode?.dataset.width || sourceNode?.offsetWidth || 292) || 292;
  const nodes = Array.from(document.querySelectorAll("#canvasPlane .canvas-node")).filter((node) => node !== sourceNode);
  for (let step = 0; step < 24; step += 1) {
    const point = { x: sourceX + sourceWidth + 90, y: sourceY + step * (estimatedHeight + 48) };
    const overlaps = nodes.some((node) => {
      const box = getCanvasNodeBox(node);
      return point.x < box.right + 28
        && point.x + estimatedWidth + 28 > box.left
        && point.y < box.bottom + 28
        && point.y + estimatedHeight + 28 > box.top;
    });
    if (!overlaps) return point;
  }
  return { x: sourceX + sourceWidth + 90, y: sourceY + estimatedHeight + 48 };
}

async function addCanvasGridEditorNode(sourceNode, options = {}) {
  options.guard?.assertActive();
  const source = options.source || (sourceNode?.classList?.contains("canvas-node-gallery")
    ? getCanvasGalleryActiveImage(sourceNode)
    : getCanvasNodeOutput(sourceNode));
  const src = source?.savedUrl || source?.src || source?.url;
  if (!sourceNode?.classList?.contains("canvas-node") || !src) {
    throw new Error("当前节点没有可编辑的图片。");
  }
  const image = await loadImageElement(src);
  options.guard?.assertActive();
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error("当前图片没有有效尺寸。");
  const state = createCanvasGridEditorState({
    source: { ...source, src, savedUrl: source.savedUrl || src },
    sourceNodeId: sourceNode.dataset.id,
    width,
    height,
    rows: options.rows,
    columns: options.columns,
  });
  const node = createCanvasNode("grid-editor");
  node.dataset.width = "620";
  setCanvasNodePoint(node, findCanvasGridEditorPoint(sourceNode));
  renderCanvasGridEditorNode(node, state);
  applyCanvasNodeSize(node);
  placeCanvasNode(node);
  connectCanvasNodes(sourceNode.dataset.id, node.dataset.id, "input");
  selectCanvasNode(node);
  scheduleCanvasConnectionRender();
  scheduleCanvasSave();
  setCanvasStatus(`已创建 ${state.rows}×${state.columns} 宫格编辑节点。`);
  return node;
}

function setCanvasGridEditorSpec(node, rows, columns) {
  const state = getCanvasGridEditorState(node);
  if (!state.sourceSrc) return state;
  const layout = GridSlicingRules.createGridLayout(
    state.sourceWidth,
    state.sourceHeight,
    rows,
    columns,
    state.uniformGap,
  );
  return setCanvasGridEditorState(node, {
    ...state,
    rows: layout.spec.rows,
    columns: layout.spec.columns,
    horizontalBands: layout.horizontalBands,
    verticalBands: layout.verticalBands,
    cellTransforms: GridSlicingRules.normalizeCellTransforms(layout.regions, state.cellTransforms),
    selectedCellKey: layout.regions[0]?.key || "",
    selectedBand: null,
  });
}

function setCanvasGridEditorAspect(node, aspect) {
  const state = getCanvasGridEditorState(node);
  const nextAspect = ["match", "16:9", "9:16", "3:4", "4:3", "1:1"].includes(aspect)
    ? aspect
    : "match";
  const regions = getCanvasGridEditorRegions(state);
  const cellTransforms = GridSlicingRules.normalizeCellTransforms(regions, state.cellTransforms);
  const next = setCanvasGridEditorState(node, {
    ...state,
    aspect: nextAspect,
    cellTransforms,
  }, { save: false });
  scheduleCanvasSave();
  return next;
}

function setCanvasGridEditorUniformGap(node, gapValue) {
  const state = getCanvasGridEditorState(node);
  if (!state.sourceSrc) return state;
  const rounded = Math.max(0, Math.round(Number(gapValue) || 0));
  const requested = rounded - (rounded % 2);
  const horizontal = GridSlicingRules.applyUniformGap(state.sourceHeight, state.horizontalBands, requested);
  const vertical = GridSlicingRules.applyUniformGap(state.sourceWidth, state.verticalBands, requested);
  const widths = [...horizontal, ...vertical].map((band) => band.end - band.start);
  const applied = widths.length ? Math.min(requested, ...widths) : requested;
  return setCanvasGridEditorState(node, {
    ...state,
    uniformGap: applied,
    horizontalBands: GridSlicingRules.applyUniformGap(state.sourceHeight, state.horizontalBands, applied),
    verticalBands: GridSlicingRules.applyUniformGap(state.sourceWidth, state.verticalBands, applied),
    selectedBand: null,
  });
}

function setCanvasGridEditorBandGap(node, axis, id, gapValue) {
  const state = getCanvasGridEditorState(node);
  if (!state.sourceSrc) return state;
  const vertical = axis === "vertical";
  const key = vertical ? "verticalBands" : "horizontalBands";
  const dimension = vertical ? state.sourceWidth : state.sourceHeight;
  return setCanvasGridEditorState(node, {
    ...state,
    [key]: GridSlicingRules.setBandGap(dimension, state[key], id, gapValue),
    selectedBand: { axis: vertical ? "vertical" : "horizontal", id: String(id) },
  });
}

function toggleCanvasGridEditorPopover(node, kind, anchor) {
  const shell = node?.querySelector(".canvas-grid-editor-shell");
  if (!shell) return null;
  const existing = shell.querySelector(".canvas-grid-editor-popover");
  if (existing?.dataset.kind === kind) {
    existing.remove();
    return null;
  }
  existing?.remove();
  const state = getCanvasGridEditorState(node);
  const popover = document.createElement("div");
  popover.className = "canvas-grid-editor-popover";
  popover.dataset.kind = kind;
  if (kind === "aspect") {
    popover.innerHTML = `
      <strong>同步裁切比例</strong>
      <div class="canvas-grid-editor-popover-options">
        ${[
          ["match", "匹配"],
          ["16:9", "16:9"],
          ["9:16", "9:16"],
          ["3:4", "3:4"],
          ["4:3", "4:3"],
          ["1:1", "1:1"],
        ].map(([value, label]) => `<button type="button" data-grid-editor-aspect="${value}" class="${state.aspect === value ? "is-active" : ""}">${label}</button>`).join("")}
      </div>
    `;
    popover.addEventListener("click", (event) => {
      const value = event.target.closest("[data-grid-editor-aspect]")?.dataset.gridEditorAspect;
      if (value) setCanvasGridEditorAspect(node, value);
    });
  } else {
    const options = Array.from({ length: 5 }, (_, index) => `<option value="${index + 1}">${index + 1}</option>`).join("");
    popover.innerHTML = `
      <strong>重新等分网格</strong>
      <div class="canvas-grid-editor-popover-options">
        ${[2, 3, 4, 5].map((value) => `<button type="button" data-grid-editor-rows="${value}" data-grid-editor-columns="${value}">${value}×${value}</button>`).join("")}
      </div>
      <div class="canvas-grid-editor-custom-spec">
        <label><span>行</span><select data-grid-editor-custom-rows>${options}</select></label>
        <span>×</span>
        <label><span>列</span><select data-grid-editor-custom-columns>${options}</select></label>
        <button type="button" data-grid-editor-custom-apply>应用</button>
      </div>
    `;
    popover.querySelector("[data-grid-editor-custom-rows]").value = String(state.rows);
    popover.querySelector("[data-grid-editor-custom-columns]").value = String(state.columns);
    popover.addEventListener("click", (event) => {
      const preset = event.target.closest("[data-grid-editor-rows][data-grid-editor-columns]");
      if (preset) {
        setCanvasGridEditorSpec(node, preset.dataset.gridEditorRows, preset.dataset.gridEditorColumns);
        return;
      }
      if (event.target.closest("[data-grid-editor-custom-apply]")) {
        setCanvasGridEditorSpec(
          node,
          popover.querySelector("[data-grid-editor-custom-rows]").value,
          popover.querySelector("[data-grid-editor-custom-columns]").value,
        );
      }
    });
  }
  popover.addEventListener("pointerdown", (event) => event.stopPropagation());
  popover.addEventListener("wheel", (event) => event.stopPropagation());
  shell.append(popover);
  const left = Math.min(
    Math.max(8, anchor?.offsetLeft || 8),
    Math.max(8, shell.clientWidth - popover.offsetWidth - 8),
  );
  popover.style.left = `${left}px`;
  popover.style.top = `${(anchor?.offsetTop || 0) + (anchor?.offsetHeight || 34) + 6}px`;
  return popover;
}

function startCanvasGridEditorBandDrag(event, node) {
  const bandElement = event.target.closest(".canvas-grid-editor-band");
  const state = getCanvasGridEditorState(node);
  if (!bandElement || !state.editing || !state.sourceSrc) return;
  event.preventDefault();
  event.stopPropagation();
  const axis = bandElement.dataset.axis;
  const id = bandElement.dataset.bandId;
  const edge = event.target.closest("[data-band-edge]")?.dataset.bandEdge || "move";
  const layer = bandElement.closest(".canvas-grid-editor-band-layer");
  const rect = layer.getBoundingClientRect();
  const vertical = axis === "vertical";
  const key = vertical ? "verticalBands" : "horizontalBands";
  const dimension = vertical ? state.sourceWidth : state.sourceHeight;
  const initialBand = state[key].find((band) => band.id === id);
  const coordinate = (pointerEvent) => {
    const ratio = vertical
      ? (pointerEvent.clientX - rect.left) / Math.max(1, rect.width)
      : (pointerEvent.clientY - rect.top) / Math.max(1, rect.height);
    return Math.max(0, Math.min(dimension, Math.round(ratio * dimension)));
  };
  const initialCoordinate = coordinate(event);
  const centerOffset = initialBand
    ? GridSlicingRules.getBandCenter(initialBand) - initialCoordinate
    : 0;
  let moved = false;
  const update = (moveEvent) => {
    moved = true;
    const latest = getCanvasGridEditorState(node);
    const target = coordinate(moveEvent);
    const bands = edge === "move"
      ? GridSlicingRules.moveBand(dimension, latest[key], id, target + centerOffset)
      : GridSlicingRules.resizeBandEdge(dimension, latest[key], id, edge, target);
    setCanvasGridEditorState(node, {
      ...latest,
      [key]: bands,
      selectedBand: { axis, id },
    }, { save: false });
  };
  const stop = () => {
    window.removeEventListener("pointermove", update);
    window.removeEventListener("pointerup", stop);
    window.removeEventListener("pointercancel", stop);
    if (!moved) {
      setCanvasGridEditorState(node, { ...getCanvasGridEditorState(node), selectedBand: { axis, id } }, { save: false });
    }
    scheduleCanvasSave();
  };
  window.addEventListener("pointermove", update);
  window.addEventListener("pointerup", stop, { once: true });
  window.addEventListener("pointercancel", stop, { once: true });
}

function startCanvasGridEditorCellPan(event, node, key) {
  const state = getCanvasGridEditorState(node);
  if (!state.sourceSrc) return;
  event.stopPropagation();
  if (!state.editing || event.button !== 0) {
    if (state.selectedCellKey !== key) setCanvasGridEditorState(node, { ...state, selectedCellKey: key });
    return;
  }
  event.preventDefault();
  const frame = event.currentTarget;
  const rect = frame.getBoundingClientRect();
  const start = state.cellTransforms.find((item) => item.key === key)
    || { key, centerX: 0.5, centerY: 0.5, zoom: 1 };
  const startX = event.clientX;
  const startY = event.clientY;
  let moved = false;
  const update = (moveEvent) => {
    moved = true;
    const deltaX = moveEvent.clientX - startX;
    const deltaY = moveEvent.clientY - startY;
    const nextTransform = {
      ...start,
      centerX: Math.max(0, Math.min(1, start.centerX - deltaX / Math.max(1, rect.width) / start.zoom)),
      centerY: Math.max(0, Math.min(1, start.centerY - deltaY / Math.max(1, rect.height) / start.zoom)),
    };
    const latest = getCanvasGridEditorState(node);
    setCanvasGridEditorState(node, {
      ...latest,
      selectedCellKey: key,
      cellTransforms: latest.cellTransforms.map((item) => item.key === key ? nextTransform : item),
    }, { save: false });
  };
  const stop = () => {
    window.removeEventListener("pointermove", update);
    window.removeEventListener("pointerup", stop);
    window.removeEventListener("pointercancel", stop);
    if (!moved) setCanvasGridEditorState(node, { ...getCanvasGridEditorState(node), selectedCellKey: key }, { save: false });
    scheduleCanvasSave();
  };
  window.addEventListener("pointermove", update);
  window.addEventListener("pointerup", stop, { once: true });
  window.addEventListener("pointercancel", stop, { once: true });
}

function setCanvasGridEditorCellZoom(node, key, zoomValue, { save = true } = {}) {
  const state = getCanvasGridEditorState(node);
  if (!state.sourceSrc || !key) return state;
  const raw = Number(zoomValue);
  const zoom = Math.max(1, Math.min(8, Math.round((Number.isFinite(raw) ? raw : 1) * 20) / 20));
  const regions = getCanvasGridEditorRegions(state);
  const nextTransforms = state.cellTransforms.map((item) => item.key === key ? { ...item, zoom } : item);
  return setCanvasGridEditorState(node, {
    ...state,
    selectedCellKey: key,
    cellTransforms: GridSlicingRules.normalizeCellTransforms(regions, nextTransforms),
  }, { save });
}

function clearCanvasGridEditor(node) {
  const now = Date.now();
  const confirmUntil = Number(node?.dataset.gridEditorClearConfirmUntil || 0);
  if (now > confirmUntil) {
    node.dataset.gridEditorClearConfirmUntil = String(now + 4500);
    const button = node.querySelector(".canvas-grid-editor-clear");
    if (button) button.textContent = "再次点击清空";
    setTimeout(() => {
      if (!node.isConnected || Date.now() <= Number(node.dataset.gridEditorClearConfirmUntil || 0)) return;
      delete node.dataset.gridEditorClearConfirmUntil;
      const current = node.querySelector(".canvas-grid-editor-clear");
      if (current) current.textContent = "清空";
    }, 4550);
    return false;
  }
  delete node.dataset.gridEditorClearConfirmUntil;
  const state = getCanvasGridEditorState(node);
  canvasState.connections = canvasState.connections.filter((item) => item.to !== node.dataset.id);
  setCanvasGridEditorState(node, {
    ...state,
    sourceNodeId: "",
    sourceSrc: "",
    sourceName: "",
    sourceWidth: 0,
    sourceHeight: 0,
    horizontalBands: [],
    verticalBands: [],
    cellTransforms: [],
    selectedCellKey: "",
    selectedBand: null,
    editing: false,
  });
  renderCanvasConnections();
  setCanvasStatus("已清空宫格编辑节点。可通过撤销恢复。");
  return true;
}

function setCanvasGridEditorCollapsed(node, collapsed) {
  const state = getCanvasGridEditorState(node);
  return setCanvasGridEditorState(node, { ...state, collapsed: Boolean(collapsed) });
}

async function outputCanvasGridEditorGallery(node, options) {
  const guard = options?.guard || null;
  guard?.assertActive();
  const state = getCanvasGridEditorState(node);
  const output = node?.querySelector(".canvas-grid-editor-output");
  const status = node?.querySelector(".canvas-grid-editor-status");
  if (!node?.classList?.contains("canvas-node-grid-editor") || node.dataset.gridEditorOutputting === "true") return null;
  if (!state.sourceSrc) {
    if (status) status.textContent = "没有可输出的来源图片。";
    return null;
  }
  node.dataset.gridEditorOutputting = "true";
  if (output) output.disabled = true;
  try {
    const image = await loadImageElement(state.sourceSrc);
    guard?.assertActive();
    const regions = getCanvasGridEditorRegions(state);
    const ratio = GridSlicingRules.resolveAspectRatio(state.aspect, {
      width: state.sourceWidth,
      height: state.sourceHeight,
      rows: state.rows,
      columns: state.columns,
    });
    const transforms = new Map(state.cellTransforms.map((item) => [item.key, item]));
    const crops = regions.map((region) => (
      GridSlicingRules.getCellCrop(region, ratio, transforms.get(region.key))
    ));
    const outputSize = GridSlicingRules.getCommonOutputSize(crops, ratio);
    if (status) status.textContent = `正在保存 ${crops.length} 张 ${outputSize.width} × ${outputSize.height}px PNG…`;
    const images = await persistCanvasGridCrops(image, crops, {
      sourceName: state.sourceName,
      outputSize,
    });
    guard?.assertActive();
    const gallery = createCanvasGridSliceGallery(node, images);
    if (status) status.textContent = `输出完成：${images.length} 张，统一尺寸 ${outputSize.width} × ${outputSize.height}px。`;
    setCanvasStatus(`宫格编辑输出完成：已生成 ${images.length} 张等尺寸图片。`);
    return gallery;
  } catch (error) {
    if (status) status.textContent = `输出失败：${error.message || "未知错误"}`;
    return null;
  } finally {
    delete node.dataset.gridEditorOutputting;
    if (output?.isConnected) output.disabled = false;
  }
}

function findCanvasGridSliceGalleryPoint(sourceNode) {
  const sourceX = Number(sourceNode?.dataset.x || 0);
  const sourceY = Number(sourceNode?.dataset.y || 0);
  const sourceWidth = Number(sourceNode?.dataset.width || sourceNode?.offsetWidth || 292) || 292;
  const estimatedWidth = 320;
  const estimatedHeight = 360;
  const nodes = Array.from(document.querySelectorAll("#canvasPlane .canvas-node")).filter((node) => node !== sourceNode);
  for (let step = 0; step < 24; step += 1) {
    const point = { x: sourceX + sourceWidth + 90, y: sourceY + step * 390 };
    const overlaps = nodes.some((node) => {
      const x = Number(node.dataset.x || 0);
      const y = Number(node.dataset.y || 0);
      const width = Number(node.dataset.width || node.offsetWidth || 292) || 292;
      const height = Number(node.dataset.height || node.offsetHeight || 260) || 260;
      return point.x < x + width + 28
        && point.x + estimatedWidth + 28 > x
        && point.y < y + height + 28
        && point.y + estimatedHeight + 28 > y;
    });
    if (!overlaps) return point;
  }
  return { x: sourceX + sourceWidth + 90, y: sourceY };
}

function createCanvasGridSliceGallery(sourceNode, images) {
  if (!sourceNode?.classList?.contains("canvas-node") || !Array.isArray(images) || !images.length) return null;
  const point = findCanvasGridSliceGalleryPoint(sourceNode);
  const gallery = addCanvasGallery(point);
  renderCanvasGalleryNode(gallery, {
    images,
    title: "宫格裁切图集",
    activeImageId: images[0].id,
  });
  applyCanvasNodeSize(gallery);
  selectCanvasNode(gallery);
  scheduleCanvasConnectionRender();
  scheduleCanvasSave();
  return gallery;
}

function renderCanvasComfyNode(node, { mode = "", resolution = "", padding = null, qwenAngle = null } = {}) {
  const previousMode = node.querySelector(".canvas-comfy-mode")?.value || node.dataset.comfyMode || mode || "upscale2";
  const previousResolution = normalizeCanvasComfyResolution(
    node.querySelector(".canvas-comfy-resolution")?.value || node.dataset.comfyResolution || resolution || "2048",
  );
  const previousQwenAngle = normalizeCanvasComfyQwenAngle(qwenAngle || {
    horizontal: node.querySelector(".canvas-comfy-qwen-horizontal")?.value || node.dataset.comfyQwenHorizontal,
    vertical: node.querySelector(".canvas-comfy-qwen-vertical")?.value || node.dataset.comfyQwenVertical,
    zoom: node.querySelector(".canvas-comfy-qwen-zoom")?.value || node.dataset.comfyQwenZoom,
  });
  node.innerHTML = "";
  node.dataset.comfyMode = previousMode;
  if (isCanvasComfyResolutionMode(previousMode)) node.dataset.comfyResolution = previousResolution;
  else delete node.dataset.comfyResolution;
  const previousPadding = normalizeCanvasComfyPadding(padding || {
    left: node.dataset.comfyOutpaintLeft,
    top: node.dataset.comfyOutpaintTop,
    right: node.dataset.comfyOutpaintRight,
    bottom: node.dataset.comfyOutpaintBottom,
  });
  setCanvasComfyPadding(node, previousPadding);
  setCanvasComfyQwenAngle(node, previousQwenAngle);

  const inputPort = createCanvasPort("input");
  const outputPort = createCanvasPort("output");
  const bar = createCanvasNodeBar("ComfyUI节点");

  const refs = document.createElement("div");
  refs.className = "canvas-node-refs";

  const controls = document.createElement("div");
  controls.className = "canvas-node-controls canvas-comfy-controls";
  const modeField = document.createElement("label");
  modeField.className = "canvas-comfy-field canvas-comfy-mode-field";
  const modeLabel = document.createElement("span");
  modeLabel.textContent = "工作流";
  const modeSelect = document.createElement("select");
  modeSelect.className = "canvas-node-model canvas-comfy-mode";
  [
    { value: "upscale", label: "图片放大" },
    { value: "upscale2", label: "图片放大2" },
    { value: "shoe-swap", label: "换鞋" },
    { value: "outpaint", label: "扩图 · Z-Image" },
    { value: "outpaint2", label: "扩图2 · RunningHub" },
    { value: "flux2-klein-edit", label: "Flux2 Klein 图片编辑" },
    { value: "qwen-edit-angle", label: "Qwen Edit \u89d2\u5ea6\u5207\u6362" },
  ].forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    modeSelect.append(option);
  });
  modeSelect.value = ["upscale", "upscale2", "shoe-swap", "outpaint", "outpaint2", "flux2-klein-edit", "qwen-edit-angle"].includes(previousMode) ? previousMode : "upscale2";
  modeSelect.addEventListener("change", () => {
    node.dataset.comfyMode = modeSelect.value;
    syncCanvasComfyResolutionOptions(modeSelect, resolutionSelect, node);
    setCanvasComfyResolutionFieldVisible(node, resolutionField, resolutionSelect, modeSelect.value);
    outpaintArea.hidden = !["outpaint", "outpaint2"].includes(modeSelect.value);
    qwenAngleArea.hidden = modeSelect.value !== "qwen-edit-angle";
    updateCanvasComfyOutpaintPreview(node);
    updateCanvasComfyHint(node);
    scheduleCanvasSave();
  });

  const resolutionSelect = document.createElement("select");
  resolutionSelect.className = "canvas-node-resolution canvas-comfy-resolution";
  const resolutionField = document.createElement("label");
  resolutionField.className = "canvas-comfy-field canvas-comfy-resolution-field";
  const resolutionLabel = document.createElement("span");
  resolutionLabel.textContent = "输出尺寸";
  resolutionSelect.value = previousResolution;
  syncCanvasComfyResolutionOptions(modeSelect, resolutionSelect, node);
  setCanvasComfyResolutionFieldVisible(node, resolutionField, resolutionSelect, modeSelect.value);
  resolutionSelect.addEventListener("change", () => {
    if (isCanvasComfyResolutionMode(modeSelect.value)) node.dataset.comfyResolution = resolutionSelect.value;
    else delete node.dataset.comfyResolution;
    updateCanvasComfyHint(node);
    scheduleCanvasSave();
  });

  const run = document.createElement("button");
  run.className = "canvas-node-run canvas-comfy-run";
  run.type = "button";
  run.textContent = "执行";
  run.addEventListener("click", () => runCanvasComfyNode(node));
  modeField.append(modeLabel, modeSelect);
  resolutionField.append(resolutionLabel, resolutionSelect);
  const actionRow = document.createElement("div");
  actionRow.className = "canvas-comfy-action-row";
  actionRow.append(resolutionField, run);
  controls.append(modeField, actionRow);

  const hint = document.createElement("p");
  hint.className = "canvas-comfy-hint";
  const inputSummary = document.createElement("section");
  inputSummary.className = "canvas-comfy-input-summary";
  inputSummary.append(refs, hint);

  const outpaintArea = createCanvasComfyOutpaintArea(node);
  outpaintArea.hidden = !["outpaint", "outpaint2"].includes(modeSelect.value);
  const qwenAngleArea = createCanvasComfyQwenAngleFields(node, previousQwenAngle);
  qwenAngleArea.hidden = modeSelect.value !== "qwen-edit-angle";

  node.append(inputPort, outputPort, bar, inputSummary, outpaintArea, qwenAngleArea, controls, createCanvasResizeHandle());
  updateCanvasNodeRefs(node);
  updateCanvasComfyOutpaintPreview(node);
  updateCanvasComfyHint(node);
  scheduleCanvasConnectionRender();
}

function normalizeCanvasComfyPadding(value = {}) {
  const normalize = (item, fallback) => Math.max(0, Math.min(1600, Math.round(Number(item ?? fallback) / 8) * 8));
  return {
    left: normalize(value.left, 200),
    top: normalize(value.top, 0),
    right: normalize(value.right, 200),
    bottom: normalize(value.bottom, 0),
  };
}

function setCanvasComfyPadding(node, padding) {
  node.dataset.comfyOutpaintLeft = String(padding.left);
  node.dataset.comfyOutpaintTop = String(padding.top);
  node.dataset.comfyOutpaintRight = String(padding.right);
  node.dataset.comfyOutpaintBottom = String(padding.bottom);
}

function getCanvasComfyPadding(node) {
  return normalizeCanvasComfyPadding({
    left: node.dataset.comfyOutpaintLeft,
    top: node.dataset.comfyOutpaintTop,
    right: node.dataset.comfyOutpaintRight,
    bottom: node.dataset.comfyOutpaintBottom,
  });
}

function createCanvasComfyOutpaintArea(node) {
  const area = document.createElement("section");
  area.className = "canvas-comfy-outpaint";
  area.innerHTML = `
    <div class="canvas-comfy-outpaint-head">
      <strong>扩展图片区域</strong>
      <span>从原图边缘向外拖动</span>
    </div>
    <div class="canvas-comfy-outpaint-preview">
      <div class="canvas-comfy-outpaint-frame">
        <div class="canvas-comfy-outpaint-image"><span>连接图片后预览</span></div>
        <button class="canvas-comfy-outpaint-handle is-top" type="button" data-comfy-outpaint-side="top" aria-label="从原图向上扩展"></button>
        <button class="canvas-comfy-outpaint-handle is-right" type="button" data-comfy-outpaint-side="right" aria-label="从原图向右扩展"></button>
        <button class="canvas-comfy-outpaint-handle is-bottom" type="button" data-comfy-outpaint-side="bottom" aria-label="从原图向下扩展"></button>
        <button class="canvas-comfy-outpaint-handle is-left" type="button" data-comfy-outpaint-side="left" aria-label="从原图向左扩展"></button>
        <button class="canvas-comfy-outpaint-handle is-top-left" type="button" data-comfy-outpaint-side="top-left" aria-label="从原图向左上扩展"></button>
        <button class="canvas-comfy-outpaint-handle is-top-right" type="button" data-comfy-outpaint-side="top-right" aria-label="从原图向右上扩展"></button>
        <button class="canvas-comfy-outpaint-handle is-bottom-right" type="button" data-comfy-outpaint-side="bottom-right" aria-label="从原图向右下扩展"></button>
        <button class="canvas-comfy-outpaint-handle is-bottom-left" type="button" data-comfy-outpaint-side="bottom-left" aria-label="从原图向左下扩展"></button>
      </div>
    </div>
    <div class="canvas-comfy-padding-grid">
      <label><span>上</span><input type="number" min="0" max="1600" step="8" data-padding-side="top"></label>
      <label><span>右</span><input type="number" min="0" max="1600" step="8" data-padding-side="right"></label>
      <label><span>下</span><input type="number" min="0" max="1600" step="8" data-padding-side="bottom"></label>
      <label><span>左</span><input type="number" min="0" max="1600" step="8" data-padding-side="left"></label>
    </div>
  `;
  const padding = getCanvasComfyPadding(node);
  area.querySelectorAll("[data-padding-side]").forEach((input) => {
    input.value = padding[input.dataset.paddingSide];
    input.addEventListener("input", () => {
      const next = getCanvasComfyPadding(node);
      next[input.dataset.paddingSide] = input.value;
      setCanvasComfyPadding(node, normalizeCanvasComfyPadding(next));
      updateCanvasComfyOutpaintPreview(node);
      updateCanvasComfyHint(node);
      scheduleCanvasSave();
    });
    input.addEventListener("change", () => syncCanvasComfyPaddingInputs(node));
  });
  area.addEventListener("pointerdown", (event) => handleCanvasComfyOutpaintDrag(event, node));
  return area;
}

function syncCanvasComfyPaddingInputs(node) {
  const padding = getCanvasComfyPadding(node);
  node.querySelectorAll("[data-padding-side]").forEach((input) => {
    input.value = padding[input.dataset.paddingSide];
  });
}

function handleCanvasComfyOutpaintDrag(event, node) {
  const handle = event.target.closest?.("[data-comfy-outpaint-side]");
  if (!handle) return;
  event.preventDefault();
  event.stopPropagation();
  const side = handle.dataset.comfyOutpaintSide || "";
  const startX = event.clientX;
  const startY = event.clientY;
  const start = getCanvasComfyPadding(node);
  const imageWrap = node.querySelector(".canvas-comfy-outpaint-image");
  const imageRect = imageWrap?.getBoundingClientRect();
  const sourceWidth = Math.max(1, Number(node.dataset.comfyOutpaintSourceWidth || 1024));
  const sourceHeight = Math.max(1, Number(node.dataset.comfyOutpaintSourceHeight || 768));
  const visualScaleX = Math.max(0.01, Number(imageRect?.width || 1) / sourceWidth);
  const visualScaleY = Math.max(0.01, Number(imageRect?.height || 1) / sourceHeight);
  handle.setPointerCapture?.(event.pointerId);

  const move = (moveEvent) => {
    const dx = (moveEvent.clientX - startX) / visualScaleX;
    const dy = (moveEvent.clientY - startY) / visualScaleY;
    const next = { ...start };
    if (side.includes("left")) next.left = start.left - dx;
    if (side.includes("right")) next.right = start.right + dx;
    if (side.includes("top")) next.top = start.top - dy;
    if (side.includes("bottom")) next.bottom = start.bottom + dy;
    setCanvasComfyPadding(node, normalizeCanvasComfyPadding(next));
    syncCanvasComfyPaddingInputs(node);
    updateCanvasComfyOutpaintPreview(node);
    updateCanvasComfyHint(node);
  };

  const up = (upEvent) => {
    handle.releasePointerCapture?.(upEvent.pointerId);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    scheduleCanvasSave();
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up, { once: true });
}

function updateCanvasComfyOutpaintPreview(node) {
  const preview = node.querySelector(".canvas-comfy-outpaint-preview");
  const frame = node.querySelector(".canvas-comfy-outpaint-frame");
  const imageWrap = node.querySelector(".canvas-comfy-outpaint-image");
  if (!preview || !frame || !imageWrap) return;
  const ref = applyCanvasRefOrder(node, getCanvasIncomingRefs(node.dataset.id)).find((item) => item.url);
  if (ref?.url) {
    frame.classList.remove("is-empty");
    let image = imageWrap.querySelector("img");
    if (!image || imageWrap.dataset.src !== ref.url) {
      imageWrap.innerHTML = "";
      image = document.createElement("img");
      image.alt = ref.name || "扩图输入";
      imageWrap.dataset.src = ref.url;
      image.addEventListener("load", () => {
        node.dataset.comfyOutpaintSourceWidth = String(Number(image.dataset.originalWidth) || image.naturalWidth || image.width || 1024);
        node.dataset.comfyOutpaintSourceHeight = String(Number(image.dataset.originalHeight) || image.naturalHeight || image.height || 1024);
        layoutCanvasComfyOutpaintFrame(node);
      });
      registerCanvasDetailImage(image, ref.url);
      imageWrap.append(image);
    }
  } else {
    frame.classList.add("is-empty");
    if (!imageWrap.querySelector("span")) imageWrap.innerHTML = "<span>连接图片后预览</span>";
    delete imageWrap.dataset.src;
  }
  layoutCanvasComfyOutpaintFrame(node);
}

function layoutCanvasComfyOutpaintFrame(node) {
  const preview = node.querySelector(".canvas-comfy-outpaint-preview");
  const frame = node.querySelector(".canvas-comfy-outpaint-frame");
  const imageWrap = node.querySelector(".canvas-comfy-outpaint-image");
  if (!preview || !frame || !imageWrap) return;
  const padding = getCanvasComfyPadding(node);
  const sourceWidth = Math.max(1, Number(node.dataset.comfyOutpaintSourceWidth || 1024));
  const sourceHeight = Math.max(1, Number(node.dataset.comfyOutpaintSourceHeight || 768));
  const totalWidth = sourceWidth + padding.left + padding.right;
  const totalHeight = sourceHeight + padding.top + padding.bottom;
  const centerX = preview.clientWidth / 2;
  const centerY = preview.clientHeight / 2;
  const halfWidth = Math.max(80, centerX - 18);
  const halfHeight = Math.max(70, centerY - 18);
  const horizontalExtent = sourceWidth / 2 + Math.max(padding.left, padding.right);
  const verticalExtent = sourceHeight / 2 + Math.max(padding.top, padding.bottom);
  const scale = Math.max(0.025, Math.min(halfWidth / horizontalExtent, halfHeight / verticalExtent, 0.28));
  node.dataset.comfyOutpaintVisualScale = String(scale);
  frame.style.width = `${Math.round(totalWidth * scale)}px`;
  frame.style.height = `${Math.round(totalHeight * scale)}px`;
  frame.style.left = `${Math.round(centerX - (sourceWidth / 2 + padding.left) * scale)}px`;
  frame.style.top = `${Math.round(centerY - (sourceHeight / 2 + padding.top) * scale)}px`;
  imageWrap.style.left = `${Math.round(padding.left * scale)}px`;
  imageWrap.style.top = `${Math.round(padding.top * scale)}px`;
  imageWrap.style.width = `${Math.round(sourceWidth * scale)}px`;
  imageWrap.style.height = `${Math.round(sourceHeight * scale)}px`;
}

function renderCanvasLoopNode(node) {
  node.innerHTML = "";
  const inputPort = createCanvasPort("input");
  const outputPort = createCanvasPort("output");
  const bar = createCanvasNodeBar("循环节点");
  const refs = document.createElement("div");
  refs.className = "canvas-node-refs";
  const hint = document.createElement("p");
  hint.className = "canvas-loop-hint";
  node.append(inputPort, outputPort, bar, refs, hint, createCanvasResizeHandle());
  updateCanvasNodeRefs(node);
  updateCanvasLoopHint(node);
  scheduleCanvasConnectionRender();
}


function normalizeCanvasComfyQwenAngle(value = {}) {
  const normalize = (item, fallback, min, max, decimals = 0) => {
    const number = Number(item ?? fallback);
    if (!Number.isFinite(number)) return fallback;
    const factor = 10 ** decimals;
    const rounded = Math.round(number * factor) / factor;
    return Math.max(min, Math.min(max, rounded));
  };
  return {
    horizontal: normalize(value.horizontal, 49, -180, 180),
    vertical: normalize(value.vertical, 0, -30, 60),
    zoom: normalize(value.zoom, 5, 0, 10, 1),
  };
}

function setCanvasComfyQwenAngle(node, value = {}) {
  const angle = normalizeCanvasComfyQwenAngle(value);
  node.dataset.comfyQwenHorizontal = String(angle.horizontal);
  node.dataset.comfyQwenVertical = String(angle.vertical);
  node.dataset.comfyQwenZoom = String(angle.zoom);
  return angle;
}

function getCanvasComfyQwenAngle(node) {
  return normalizeCanvasComfyQwenAngle({
    horizontal: node.dataset.comfyQwenHorizontal,
    vertical: node.dataset.comfyQwenVertical,
    zoom: node.dataset.comfyQwenZoom,
  });
}

function describeCanvasComfyQwenHorizontal(value) {
  const angle = Number(value) || 0;
  const abs = Math.abs(angle);
  const side = angle >= 0 ? "\u53f3" : "\u5de6";
  if (abs < 12) return "\u6b63\u9762";
  if (abs < 68) return side + "\u524d\u65b9";
  if (abs < 112) return side + "\u4fa7\u9762";
  if (abs < 158) return side + "\u540e\u65b9";
  return "\u80cc\u9762";
}

function describeCanvasComfyQwenVertical(value) {
  const angle = Number(value) || 0;
  if (angle > 18) return "\u4fef\u89c6";
  if (angle < -18) return "\u4ef0\u89c6";
  return "\u5e73\u89c6";
}

function describeCanvasComfyQwenZoom(value) {
  const zoom = Number(value) || 0;
  if (zoom > 6.7) return "近景";
  if (zoom < 3.4) return "远景";
  return "中景";
}

function getCanvasComfyQwenSvgPoint(svg, event) {
  const rect = svg.getBoundingClientRect();
  const viewBox = svg.viewBox.baseVal;
  const width = rect.width || viewBox.width || 260;
  const height = rect.height || viewBox.height || 170;
  return {
    x: ((event.clientX - rect.left) / width) * viewBox.width,
    y: ((event.clientY - rect.top) / height) * viewBox.height,
  };
}

function updateCanvasComfyQwenAngleUi(node, area = null) {
  const root = area || node.querySelector(".canvas-comfy-qwen-angle");
  if (!root) return;
  const angle = getCanvasComfyQwenAngle(node);
  root.querySelectorAll("[data-qwen-key]").forEach((input) => {
    const key = input.dataset.qwenKey;
    if (!key || !(key in angle)) return;
    if (input.type === "number" && document.activeElement === input) return;
    input.value = String(angle[key]);
  });

  const setText = (selector, value) => {
    const target = root.querySelector(selector);
    if (target) target.textContent = value;
  };
  setText('[data-qwen-value="horizontal"]', String(angle.horizontal) + "\u00b0");
  setText('[data-qwen-value="vertical"]', String(angle.vertical) + "\u00b0");
  setText('[data-qwen-value="zoom"]', String(angle.zoom));
  setText('[data-qwen-label="horizontal"]', describeCanvasComfyQwenHorizontal(angle.horizontal));
  setText('[data-qwen-label="vertical"]', describeCanvasComfyQwenVertical(angle.vertical));
  setText('[data-qwen-label="zoom"]', describeCanvasComfyQwenZoom(angle.zoom));

  const svg = root.querySelector(".canvas-comfy-qwen-svg");
  if (!svg) return;
  const orbitCx = 130;
  const orbitCy = 108;
  const orbitRx = 92;
  const orbitRy = 39;
  const targetX = 130;
  const targetY = 82;
  const radians = angle.horizontal * Math.PI / 180;
  const orbitX = orbitCx + Math.sin(radians) * orbitRx;
  const orbitY = orbitCy + Math.cos(radians) * orbitRy;
  const verticalProgress = (angle.vertical + 30) / 90;
  const inverseVerticalProgress = 1 - verticalProgress;
  const verticalX = inverseVerticalProgress ** 3 * 54 + 3 * inverseVerticalProgress ** 2 * verticalProgress * 24 + 3 * inverseVerticalProgress * verticalProgress ** 2 * 28 + verticalProgress ** 3 * 66;
  const verticalY = inverseVerticalProgress ** 3 * 142 + 3 * inverseVerticalProgress ** 2 * verticalProgress * 104 + 3 * inverseVerticalProgress * verticalProgress ** 2 * 54 + verticalProgress ** 3 * 22;
  const zoomProgress = angle.zoom / 10;
  const distanceScale = 1.12 - zoomProgress * 0.42;
  const cameraBaseX = targetX + (orbitX - targetX) * distanceScale;
  const cameraBaseY = targetY + (orbitY - targetY) * distanceScale;
  const overheadLift = verticalProgress * 92;
  const lowerLift = Math.max(0, -angle.vertical) * 0.18;
  const cameraX = Math.max(42, Math.min(216, cameraBaseX));
  const cameraY = Math.max(38, Math.min(124, cameraBaseY - overheadLift + lowerLift - 4));
  const viewLabel = describeCanvasComfyQwenHorizontal(angle.horizontal);
  const tiltLabel = describeCanvasComfyQwenVertical(angle.vertical);

  const cameraBehindPlane = Math.cos(radians) < -0.08;
  svg.querySelectorAll("[data-qwen-camera]").forEach((camera) => {
    const layer = camera.dataset.qwenCameraLayer || "front";
    camera.setAttribute("transform", "translate(" + cameraX.toFixed(1) + " " + cameraY.toFixed(1) + ")");
    camera.classList.toggle("is-camera-back", layer === "back");
    camera.classList.toggle("is-camera-front", layer !== "back");
    camera.setAttribute("opacity", layer === "back" ? (cameraBehindPlane ? "0.48" : "0") : (cameraBehindPlane ? "0" : "1"));
  });
  const orbitHandle = svg.querySelector("[data-qwen-orbit-handle]");
  if (orbitHandle) {
    orbitHandle.setAttribute("cx", orbitX.toFixed(1));
    orbitHandle.setAttribute("cy", orbitY.toFixed(1));
  }
  svg.classList.toggle("is-camera-behind-plane", cameraBehindPlane);
  const updateRay = (selector) => {
    const ray = svg.querySelector(selector);
    if (!ray) return;
    ray.setAttribute("x1", targetX.toFixed(1));
    ray.setAttribute("y1", targetY.toFixed(1));
    ray.setAttribute("x2", cameraX.toFixed(1));
    ray.setAttribute("y2", cameraY.toFixed(1));
  };
  updateRay("[data-qwen-camera-ray-back]");
  updateRay("[data-qwen-camera-ray-front]");
  const verticalHandle = svg.querySelector("[data-qwen-vertical-handle]");
  if (verticalHandle) {
    verticalHandle.setAttribute("cx", verticalX.toFixed(1));
    verticalHandle.setAttribute("cy", verticalY.toFixed(1));
  }
  const plane = svg.querySelector("[data-qwen-plane]");
  if (plane) plane.setAttribute("transform", "translate(" + targetX.toFixed(1) + " 78)");
  setText('[data-qwen-svg-label="view"]', viewLabel);
  setText('[data-qwen-svg-label="tilt"]', tiltLabel);
}

function createCanvasComfyQwenAngleFields(node, value = {}) {
  const angle = setCanvasComfyQwenAngle(node, value);
  const area = document.createElement("section");
  area.className = "canvas-comfy-qwen-angle";
  const stopQwenPointer = (event) => event.stopPropagation();
  ["pointerdown", "mousedown", "touchstart", "click", "dblclick", "dragstart"].forEach((type) => {
    area.addEventListener(type, stopQwenPointer);
  });
  area.addEventListener("wheel", stopQwenPointer, { passive: true });
  const head = document.createElement("div");
  head.className = "canvas-comfy-qwen-angle-head";
  const title = document.createElement("strong");
  title.textContent = "Qwen \u89d2\u5ea6\u53c2\u6570";
  const tip = document.createElement("div");
  tip.className = "canvas-comfy-qwen-legend";
  tip.innerHTML = [
    '<span class="is-horizontal"><i></i><b>\u7c89\u8272</b>\u6c34\u5e73\u73af\u7ed5</span>',
    '<span class="is-vertical"><i></i><b>\u9752\u8272</b>\u4e0a\u4e0b\u4fef\u4ef0</span>',
    '<span class="is-zoom"><i></i><b>\u9ec4\u8272</b>\u6444\u50cf\u673a\u8fdc\u8fd1</span>',
  ].join("");
  head.append(title, tip);

  const visual = document.createElement("div");
  visual.className = "canvas-comfy-qwen-visual";
  visual.innerHTML = [
    '<svg class="canvas-comfy-qwen-svg" viewBox="0 0 260 170" role="img" aria-label="Qwen camera angle visualizer">',
    '<defs><linearGradient id="qwenOrbitGradient" x1="0" x2="1"><stop offset="0" stop-color="#24e0c2"/><stop offset="1" stop-color="#ff3e8d"/></linearGradient><filter id="qwenGlow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>',
    '<g class="canvas-comfy-qwen-floor"><path d="M24 132 H236 M42 118 H218 M60 104 H200 M78 90 H182 M96 76 H164 M38 144 L112 50 M76 148 L126 50 M116 150 L138 50 M156 150 L150 50 M196 148 L164 50 M224 140 L176 50"/></g>',
    '<ellipse data-qwen-drag="horizontal" class="canvas-comfy-qwen-orbit" cx="130" cy="108" rx="92" ry="39"/>',
    '<ellipse class="canvas-comfy-qwen-inner-orbit" cx="130" cy="108" rx="31" ry="13"/>',
    '<line data-qwen-camera-ray-back class="canvas-comfy-qwen-ray canvas-comfy-qwen-ray-back" x1="130" y1="82" x2="130" y2="147"/>',
    '<g class="canvas-comfy-qwen-view-label"><text data-qwen-svg-label="view" x="130" y="15" text-anchor="middle">\u6b63\u9762</text><text data-qwen-svg-label="tilt" x="130" y="29" text-anchor="middle">\u5e73\u89c6</text></g>',
    '<g data-qwen-camera data-qwen-camera-layer="back" class="canvas-comfy-qwen-camera canvas-comfy-qwen-eye" transform="translate(130 147)"><ellipse class="canvas-comfy-qwen-eye-glow" cx="0" cy="0" rx="20" ry="15"/><path class="canvas-comfy-qwen-eye-white" d="M-17 0 C-10 -10 10 -10 17 0 C10 10 -10 10 -17 0 Z"/><circle class="canvas-comfy-qwen-eye-iris" cx="0" cy="0" r="7.2"/><circle class="canvas-comfy-qwen-eye-pupil" cx="0" cy="0" r="3.1"/><circle class="canvas-comfy-qwen-eye-spark" cx="-2.7" cy="-2.7" r="1.5"/></g>',
    '<g data-qwen-plane class="canvas-comfy-qwen-plane" transform="translate(130 78)"><ellipse class="canvas-comfy-qwen-plane-shadow" cx="0" cy="45" rx="30" ry="8"/><rect class="canvas-comfy-qwen-plane-card" x="-28" y="-42" width="56" height="84" rx="6"/><line x1="-20" y1="-24" x2="20" y2="-24"/><line x1="-20" y1="0" x2="20" y2="0"/><line x1="-20" y1="24" x2="20" y2="24"/><line x1="0" y1="-34" x2="0" y2="34"/><circle class="canvas-comfy-qwen-plane-center" cx="0" cy="0" r="2.2"/></g>',
    '<line data-qwen-camera-ray-front class="canvas-comfy-qwen-ray canvas-comfy-qwen-ray-front" x1="130" y1="82" x2="130" y2="147"/>',
    '<path data-qwen-drag="vertical" class="canvas-comfy-qwen-tilt-rail" d="M54 142 C24 104 28 54 66 22"/>',
    '<circle data-qwen-vertical-handle data-qwen-drag="vertical" class="canvas-comfy-qwen-tilt-handle" cx="54" cy="83" r="10"/>',
    '<circle data-qwen-orbit-handle data-qwen-drag="horizontal" class="canvas-comfy-qwen-orbit-handle" cx="130" cy="147" r="10"/>',
    '<g data-qwen-camera data-qwen-camera-layer="front" class="canvas-comfy-qwen-camera canvas-comfy-qwen-eye" transform="translate(130 147)"><ellipse class="canvas-comfy-qwen-eye-glow" cx="0" cy="0" rx="20" ry="15"/><path class="canvas-comfy-qwen-eye-white" d="M-17 0 C-10 -10 10 -10 17 0 C10 10 -10 10 -17 0 Z"/><circle class="canvas-comfy-qwen-eye-iris" cx="0" cy="0" r="7.2"/><circle class="canvas-comfy-qwen-eye-pupil" cx="0" cy="0" r="3.1"/><circle class="canvas-comfy-qwen-eye-spark" cx="-2.7" cy="-2.7" r="1.5"/></g>',
    '</svg>',
  ].join("");

  const readout = document.createElement("div");
  readout.className = "canvas-comfy-qwen-readout";
  readout.innerHTML = [
    '<div><span>\u6c34\u5e73</span><strong data-qwen-value="horizontal">' + angle.horizontal + '\u00b0</strong><em data-qwen-label="horizontal"></em></div>',
    '<div><span>\u5782\u76f4</span><strong data-qwen-value="vertical">' + angle.vertical + '\u00b0</strong><em data-qwen-label="vertical"></em></div>',
    '<div><span>\u7f29\u653e</span><strong data-qwen-value="zoom">' + angle.zoom + '</strong><em data-qwen-label="zoom"></em></div>',
  ].join("");

  const grid = document.createElement("div");
  grid.className = "canvas-comfy-qwen-angle-grid";
  const applyAngle = (nextValue) => {
    setCanvasComfyQwenAngle(node, nextValue);
    updateCanvasComfyQwenAngleUi(node, area);
    updateCanvasComfyHint(node);
    scheduleCanvasSave();
  };
  [
    { key: "horizontal", className: "canvas-comfy-qwen-horizontal", label: "水平角", min: -180, max: 180, step: 1 },
    { key: "vertical", className: "canvas-comfy-qwen-vertical", label: "垂直角", min: -30, max: 60, step: 1 },
    { key: "zoom", className: "canvas-comfy-qwen-zoom", label: "缩放", min: 0, max: 10, step: 0.1 },
  ].forEach((field) => {
    const label = document.createElement("label");
    const span = document.createElement("span");
    span.textContent = field.label;
    const row = document.createElement("div");
    row.className = "canvas-comfy-qwen-field-row";
    const numberInput = document.createElement("input");
    numberInput.type = "number";
    numberInput.className = field.className;
    numberInput.dataset.qwenKey = field.key;
    numberInput.min = String(field.min);
    numberInput.max = String(field.max);
    numberInput.step = String(field.step || 1);
    numberInput.value = String(angle[field.key]);
    const rangeInput = document.createElement("input");
    rangeInput.type = "range";
    rangeInput.className = "canvas-comfy-qwen-range";
    rangeInput.dataset.qwenKey = field.key;
    rangeInput.min = String(field.min);
    rangeInput.max = String(field.max);
    rangeInput.step = String(field.step || 1);
    rangeInput.value = String(angle[field.key]);
    const onInput = (event) => {
      const next = getCanvasComfyQwenAngle(node);
      next[field.key] = event.currentTarget.value;
      applyAngle(next);
    };
    numberInput.addEventListener("input", onInput);
    rangeInput.addEventListener("input", onInput);
    numberInput.addEventListener("change", () => updateCanvasComfyQwenAngleUi(node, area));
    row.append(numberInput, rangeInput);
    label.append(span, row);
    grid.append(label);
  });

  const svg = visual.querySelector(".canvas-comfy-qwen-svg");
  const clampLocal = (item, min, max) => Math.max(min, Math.min(max, item));
  const updateFromPointer = (event, dragType) => {
    const point = getCanvasComfyQwenSvgPoint(svg, event);
    const next = getCanvasComfyQwenAngle(node);
    if (dragType === "vertical") {
      const y = clampLocal(point.y, 24, 142);
      next.vertical = Math.round(((142 - y) / 118) * 90 - 30);
    } else if (dragType === "zoom") {
      const x = clampLocal(point.x, 64, 196);
      next.zoom = Math.round(((x - 64) / 132) * 100) / 10;
    } else {
      const radians = Math.atan2((point.x - 130) / 92, (point.y - 108) / 39);
      next.horizontal = Math.round(radians * 180 / Math.PI);
    }
    applyAngle(next);
  };
  svg.addEventListener("pointerdown", (event) => {
    const dragNode = event.target.closest?.("[data-qwen-drag]");
    if (!dragNode) return;
    const dragType = dragNode.dataset.qwenDrag;
    event.preventDefault();
    event.stopPropagation();
    svg.setPointerCapture?.(event.pointerId);
    const move = (moveEvent) => {
      moveEvent.preventDefault();
      moveEvent.stopPropagation();
      updateFromPointer(moveEvent, dragType);
    };
    const up = (upEvent) => {
      svg.releasePointerCapture?.(upEvent.pointerId);
      svg.removeEventListener("pointermove", move);
      svg.removeEventListener("pointerup", up);
      svg.removeEventListener("pointercancel", up);
    };
    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerup", up);
    svg.addEventListener("pointercancel", up);
    updateFromPointer(event, dragType);
  });

  const visualColumn = document.createElement("div");
  visualColumn.className = "canvas-comfy-qwen-visual-column";
  visualColumn.append(visual, readout);
  const body = document.createElement("div");
  body.className = "canvas-comfy-qwen-body";
  body.append(visualColumn, grid);
  area.append(head, body);
  updateCanvasComfyQwenAngleUi(node, area);
  return area;
}

function isCanvasComfyResolutionMode(mode) {
  return ["upscale", "upscale2"].includes(mode);
}

function normalizeCanvasComfyResolution(value) {
  const resolution = String(value || "2048");
  if (resolution === "8192") return "6144";
  return ["2048", "4096", "6144"].includes(resolution) ? resolution : "2048";
}

function setCanvasComfyResolutionFieldVisible(node, resolutionField, resolutionSelect, mode) {
  const visible = isCanvasComfyResolutionMode(mode);
  resolutionField.hidden = !visible;
  resolutionField.style.display = visible ? "" : "none";
  resolutionSelect.disabled = !visible;
  if (node && !visible) delete node.dataset.comfyResolution;
}

function syncCanvasComfyResolutionOptions(modeSelect, resolutionSelect, node) {
  const mode = modeSelect?.value || node?.dataset.comfyMode || "upscale2";
  const options = mode === "upscale2"
    ? [
      { value: "2048", label: "2K" },
      { value: "4096", label: "4K" },
    ]
    : [
      { value: "2048", label: "2K" },
      { value: "4096", label: "4K" },
      { value: "6144", label: "6K" },
    ];
  const current = normalizeCanvasComfyResolution(resolutionSelect?.value || node?.dataset.comfyResolution || "2048");
  resolutionSelect.innerHTML = "";
  options.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    resolutionSelect.append(option);
  });
  const nextValue = options.some((item) => item.value === current) ? current : options[options.length - 1].value;
  resolutionSelect.value = nextValue;
  if (node && isCanvasComfyResolutionMode(mode)) node.dataset.comfyResolution = nextValue;
}

function updateCanvasLoopHint(node) {
  const hint = node.querySelector(".canvas-loop-hint");
  if (!hint) return;
  const count = getCanvasIncomingRefs(node.dataset.id).length;
  hint.textContent = count
    ? `会按顺序循环处理 ${count} 张图。`
    : "连接图片或图片组后，再连接到 ComfyUI 节点。";
}

function updateCanvasComfyHint(node) {
  const hint = node.querySelector(".canvas-comfy-hint");
  if (!hint) return;
  const mode = node.querySelector(".canvas-comfy-mode")?.value || node.dataset.comfyMode || "upscale2";
  const resolution = node.querySelector(".canvas-comfy-resolution")?.value || node.dataset.comfyResolution || "2048";
  const resolutionLabel = resolution === "6144" ? "6K" : (resolution === "4096" ? "4K" : "2K");
  const count = getCanvasIncomingRefs(node.dataset.id).length;
  if (mode === "shoe-swap") {
    hint.textContent = `输入 ${count}/2 · 人物原图 + 鞋子参考图`;
  } else if (["outpaint", "outpaint2"].includes(mode)) {
    const padding = getCanvasComfyPadding(node);
    const provider = mode === "outpaint2" ? "RunningHub" : "Z-Image / ComfyUI";
    hint.textContent = `输入 ${count}/1 · ${provider} · 上 ${padding.top} 右 ${padding.right} 下 ${padding.bottom} 左 ${padding.left}`;
  } else if (mode === "flux2-klein-edit") {
    const promptCount = getCanvasIncomingPromptTexts(node.dataset.id).length;
    hint.textContent = `\u8f93\u5165 ${count}/1 \u00b7 Flux2 Klein \u56fe\u7247\u7f16\u8f91 \u00b7 \u6587\u5b57\u63d0\u793a ${promptCount ? "\u5df2\u8fde\u63a5" : "\u53ef\u9009"}`;
  } else if (mode === "qwen-edit-angle") {
    const angle = getCanvasComfyQwenAngle(node);
    hint.textContent = "\u8f93\u5165 " + count + "/1 \u00b7 Qwen \u89d2\u5ea6\u5207\u6362 \u00b7 \u6c34\u5e73 " + angle.horizontal + "\u00b0 \u5782\u76f4 " + angle.vertical + "\u00b0 \u7f29\u653e " + angle.zoom;
  } else if (mode === "upscale") {
    hint.textContent = `输入 ${count}/1 · 图片放大 · 目标长边 ${resolutionLabel}`;
  } else {
    hint.textContent = `输入 ${count}/1 · 图片放大2 · 目标长边 ${resolutionLabel}`;
  }
}

function renderCanvasLlmNode(node, { prompt = "", model = "", images = [], output = "" } = {}) {
  const previousPrompt = node.querySelector(".canvas-llm-prompt")?.value || node.dataset.llmPrompt || prompt;
  const previousModel = node.querySelector(".canvas-llm-model")?.value || node.dataset.llmModel || model || chatModelInput.value || CANVAS_LLM_MODELS[0];
  const previousOutput = node.dataset.llmOutput || output || "";
  const previousImages = images.length ? images : getCanvasLlmImages(node);
  node.innerHTML = "";
  node.dataset.llmPrompt = previousPrompt;
  node.dataset.llmModel = previousModel;
  node.dataset.llmImages = JSON.stringify(previousImages);
  node.dataset.llmOutput = previousOutput;

  const inputPort = createCanvasPort("input");
  const outputPort = createCanvasPort("output");
  const bar = createCanvasNodeBar("LLM语言节点");

  const imageStrip = document.createElement("div");
  imageStrip.className = "canvas-llm-images";
  renderCanvasLlmImages(node, imageStrip);

  const upload = document.createElement("button");
  upload.type = "button";
  upload.className = "canvas-llm-upload";
  upload.textContent = "＋ 上传图片";
  upload.addEventListener("click", (event) => {
    event.stopPropagation();
    selectCanvasNode(node);
    document.querySelector("#canvasNodeImageInput")?.click();
  });

  const promptBox = document.createElement("textarea");
  promptBox.className = "canvas-node-prompt canvas-llm-prompt";
  promptBox.rows = 4;
  promptBox.placeholder = "输入要让模型回答或反推图片的要求...";
  promptBox.value = previousPrompt;
  promptBox.addEventListener("wheel", stopCanvasTextWheel);
  promptBox.addEventListener("input", () => {
    node.dataset.llmPrompt = promptBox.value;
  });
  const presetBar = createCanvasLlmPresetBar(node, promptBox);

  const controls = document.createElement("div");
  controls.className = "canvas-llm-controls";
  const select = document.createElement("select");
  select.className = "canvas-node-model canvas-llm-model";
  fillCanvasLlmModelSelect(select, previousModel);
  select.addEventListener("change", () => {
    node.dataset.llmModel = select.value;
  });
  const run = document.createElement("button");
  run.className = "canvas-node-run canvas-llm-run";
  run.type = "button";
  run.textContent = "生成文字";
  run.addEventListener("click", () => runCanvasLlmNode(node));
  controls.append(select, run);

  node.append(inputPort, outputPort, bar, imageStrip, upload, promptBox, presetBar, controls, createCanvasResizeHandle());
  updateCanvasNodeRefs(node);
  syncCanvasLlmPromptState(node);
  scheduleCanvasConnectionRender();
}

function getCanvasLlmCustomPresets() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CANVAS_LLM_PRESETS_STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        label: String(item?.label || "").trim(),
        text: String(item?.text || "").trim(),
      }))
      .filter((item) => item.label && item.text);
  } catch {
    return [];
  }
}

function saveCanvasLlmCustomPresets(presets) {
  try {
    localStorage.setItem(CANVAS_LLM_PRESETS_STORAGE_KEY, JSON.stringify(Array.isArray(presets) ? presets : []));
  } catch {
    setCanvasStatus("预设提示词保存失败，浏览器本地存储不可用。");
  }
}

function getCanvasLlmHiddenPresetLabels() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CANVAS_LLM_HIDDEN_PRESETS_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveCanvasLlmHiddenPresetLabels(labels) {
  try {
    const unique = [...new Set((Array.isArray(labels) ? labels : []).map((item) => String(item || "").trim()).filter(Boolean))];
    localStorage.setItem(CANVAS_LLM_HIDDEN_PRESETS_STORAGE_KEY, JSON.stringify(unique));
  } catch {
    setCanvasStatus("预设标签删除状态保存失败，浏览器本地存储不可用。");
  }
}

function getCanvasLlmPromptPresets() {
  const seen = new Set();
  const hiddenDefaults = new Set(getCanvasLlmHiddenPresetLabels());
  const defaults = CANVAS_LLM_DEFAULT_PRESETS
    .filter((item) => !hiddenDefaults.has(item.label))
    .map((item) => ({ ...item, source: "default" }));
  const custom = getCanvasLlmCustomPresets().map((item) => ({ ...item, source: "custom" }));
  return [...defaults, ...custom]
    .map((item) => ({
      label: String(item.label || "").trim(),
      text: String(item.text || "").trim(),
      source: item.source || "custom",
    }))
    .filter((item) => {
      if (!item.label || !item.text || seen.has(item.label)) return false;
      seen.add(item.label);
      return true;
    });
}

function applyCanvasLlmPreset(node, promptBox, preset) {
  if (!node || !promptBox || promptBox.readOnly) {
    setCanvasStatus("已连接提示词节点，预设暂不可填充。");
    return;
  }
  promptBox.value = preset.text;
  promptBox.dispatchEvent(new Event("input", { bubbles: true }));
  node.dataset.llmPrompt = preset.text;
  promptBox.focus();
  scheduleCanvasSave();
  setCanvasStatus(`已填充预设提示词：${preset.label}`);
}

function resetCanvasLlmPresetDeleteConfirm(list) {
  list?.querySelectorAll?.(".canvas-llm-preset-item.is-confirming").forEach((item) => {
    window.clearTimeout(item._canvasLlmDeleteTimer);
    item._canvasLlmDeleteTimer = 0;
    item.classList.remove("is-confirming");
    const remove = item.querySelector(".canvas-llm-preset-delete");
    const label = item.dataset.presetLabel || "";
    if (remove) {
      remove.textContent = "×";
      remove.title = label ? `删除预设标签：${label}` : "删除预设标签";
      remove.setAttribute("aria-label", remove.title);
    }
  });
}

function deleteCanvasLlmPreset(preset) {
  const label = String(preset?.label || "").trim();
  if (!label) return;
  if (preset.source === "default") {
    saveCanvasLlmHiddenPresetLabels([...getCanvasLlmHiddenPresetLabels(), label]);
  } else {
    saveCanvasLlmCustomPresets(getCanvasLlmCustomPresets().filter((item) => item.label !== label));
  }
  refreshCanvasLlmPresetBars();
  setCanvasStatus(`已删除预设标签：${label}`);
}

function renderCanvasLlmPresetChips(node, promptBox, list) {
  if (!list) return;
  const addToggle = list.querySelector(".canvas-llm-preset-add");
  list.innerHTML = "";
  getCanvasLlmPromptPresets().forEach((preset) => {
    const item = document.createElement("span");
    item.className = "canvas-llm-preset-item";
    item.dataset.presetLabel = preset.label;
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "canvas-llm-preset-chip";
    chip.textContent = preset.label;
    chip.title = preset.text;
    chip.addEventListener("click", () => {
      resetCanvasLlmPresetDeleteConfirm(list);
      applyCanvasLlmPreset(node, promptBox, preset);
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "canvas-llm-preset-delete";
    remove.textContent = "×";
    remove.title = `删除预设标签：${preset.label}`;
    remove.setAttribute("aria-label", `删除预设标签：${preset.label}`);
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      if (item.classList.contains("is-confirming")) {
        window.clearTimeout(item._canvasLlmDeleteTimer);
        deleteCanvasLlmPreset(preset);
        return;
      }
      resetCanvasLlmPresetDeleteConfirm(list);
      item.classList.add("is-confirming");
      remove.textContent = "确认";
      remove.title = `再次点击确认删除：${preset.label}`;
      remove.setAttribute("aria-label", remove.title);
      item._canvasLlmDeleteTimer = window.setTimeout(() => resetCanvasLlmPresetDeleteConfirm(list), CANVAS_LLM_DELETE_CONFIRM_MS);
      setCanvasStatus(`再次点击确认删除：${preset.label}`);
    });

    item.append(chip, remove);
    list.append(item);
  });
  if (addToggle) list.append(addToggle);
}

function createCanvasLlmPresetBar(node, promptBox) {
  const wrap = document.createElement("section");
  wrap.className = "canvas-llm-presets";
  wrap.setAttribute("aria-label", "预设提示词");
  ["pointerdown", "mousedown", "touchstart", "click", "dblclick", "dragstart"].forEach((type) => {
    wrap.addEventListener(type, (event) => event.stopPropagation());
  });

  const list = document.createElement("div");
  list.className = "canvas-llm-preset-list";
  renderCanvasLlmPresetChips(node, promptBox, list);

  const addToggle = document.createElement("button");
  addToggle.type = "button";
  addToggle.className = "canvas-llm-preset-add";
  addToggle.textContent = "+";
  addToggle.title = "添加预设提示词";
  addToggle.setAttribute("aria-label", "添加预设提示词");
  addToggle.setAttribute("aria-expanded", "false");
  list.append(addToggle);

  const editor = createCanvasLlmPresetEditor();
  addToggle.addEventListener("click", () => {
    resetCanvasLlmPresetDeleteConfirm(list);
    editor.hidden = !editor.hidden;
    addToggle.classList.toggle("is-open", !editor.hidden);
    wrap.classList.toggle("is-editing", !editor.hidden);
    addToggle.setAttribute("aria-expanded", String(!editor.hidden));
    if (!editor.hidden) editor.querySelector(".canvas-llm-preset-name")?.focus();
  });

  wrap.append(list, editor);
  return wrap;
}

function createCanvasLlmPresetEditor() {
  const editor = document.createElement("div");
  editor.className = "canvas-llm-preset-editor";
  editor.hidden = true;

  const row = document.createElement("div");
  row.className = "canvas-llm-preset-editor-row";

  const nameInput = document.createElement("input");
  nameInput.className = "canvas-llm-preset-name";
  nameInput.type = "text";
  nameInput.maxLength = 12;
  nameInput.placeholder = "提示词标签命名";

  const save = document.createElement("button");
  save.type = "button";
  save.className = "canvas-llm-preset-save";
  save.textContent = "添加";

  const textInput = document.createElement("textarea");
  textInput.className = "canvas-llm-preset-text";
  textInput.rows = 5;
  textInput.placeholder = "预设提示词填写区";
  textInput.addEventListener("wheel", stopCanvasTextWheel);

  save.addEventListener("click", () => {
    const label = nameInput.value.trim();
    const text = textInput.value.trim();
    if (!label || !text) {
      setCanvasStatus("请先填写标签名和预设提示词。");
      return;
    }
    const presets = getCanvasLlmCustomPresets().filter((item) => item.label !== label);
    presets.push({ label, text });
    saveCanvasLlmCustomPresets(presets);
    nameInput.value = "";
    textInput.value = "";
    refreshCanvasLlmPresetBars();
    setCanvasStatus(`已添加预设提示词：${label}`);
  });

  row.append(nameInput, save);
  editor.append(row, textInput);
  return editor;
}

function refreshCanvasLlmPresetBars() {
  document.querySelectorAll("#canvasPlane .canvas-node-llm").forEach((node) => {
    const promptBox = node.querySelector(".canvas-llm-prompt");
    const list = node.querySelector(".canvas-llm-preset-list");
    if (!promptBox || !list) return;
    renderCanvasLlmPresetChips(node, promptBox, list);
    syncCanvasLlmPromptState(node);
  });
}

function fillCanvasLlmModelSelect(select, preferred) {
  const available = visionModelOptions;
  const fallback = available.length ? available : CANVAS_LLM_MODELS;
  select.innerHTML = "";
  fallback.forEach((model) => {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = getModelDisplayName(model);
    select.append(option);
  });
  select.value = fallback.includes(preferred) ? preferred : fallback[0];
}

function refreshCanvasLlmModelSelects() {
  document.querySelectorAll("#canvasPlane .canvas-llm-model").forEach((select) => {
    const current = select.value;
    fillCanvasLlmModelSelect(select, current);
  });
}

function getCanvasLlmImages(node) {
  try {
    const images = JSON.parse(node?.dataset?.llmImages || "[]");
    return Array.isArray(images) ? images : [];
  } catch {
    return [];
  }
}

function setCanvasLlmImages(node, images) {
  node.dataset.llmImages = JSON.stringify(Array.isArray(images) ? images : []);
  renderCanvasLlmImages(node);
}

function renderCanvasLlmImages(node, target = node.querySelector(".canvas-llm-images")) {
  if (!target) return;
  const uploaded = getCanvasLlmImages(node);
  const incoming = getCanvasIncomingRefs(node.dataset.id);
  target.innerHTML = "";
  if (!uploaded.length && !incoming.length) {
    const empty = document.createElement("span");
    empty.textContent = "可上传图片，或连接图片节点作为视觉输入";
    target.append(empty);
    return;
  }
  [...uploaded, ...incoming].forEach((image, index) => {
    const item = document.createElement("span");
    item.className = "canvas-llm-thumb";
    const img = createDeferredThumbnail(image.value || image.url, image.name || `图片 ${index + 1}`);
    item.append(img);
    if (index < uploaded.length) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "×";
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        const next = getCanvasLlmImages(node);
        next.splice(index, 1);
        setCanvasLlmImages(node, next);
        scheduleCanvasSave();
      });
      item.append(remove);
    }
    target.append(item);
  });
}

async function addCanvasLlmImageFile(node, file) {
  const value = await fileToCompressedImage(file);
  const images = getCanvasLlmImages(node);
  images.push({ name: file.name || `图片 ${images.length + 1}`, value });
  setCanvasLlmImages(node, images);
}

function normalizeCanvasGalleryImages(images) {
  return (Array.isArray(images) ? images : []).map((image, index) => {
    const item = image && typeof image === "object" ? image : {};
    const src = item.src || item.url || item.savedUrl || "";
    return {
      ...item,
      id: String(item.id || createId()),
      src,
      name: item.name || `生成图 ${index + 1}`,
      savedUrl: item.savedUrl || src,
      createdAt: item.createdAt || "",
    };
  }).filter((image) => image.src);
}

function resolveCanvasGalleryActiveImage(images, preferredId) {
  const list = Array.isArray(images) ? images : [];
  return list.find((image) => image.id === String(preferredId || "")) || list[list.length - 1] || null;
}

function getCanvasGalleryImages(node) {
  try {
    const images = JSON.parse(node.dataset.galleryImages || "[]");
    const normalized = normalizeCanvasGalleryImages(images);
    const serialized = JSON.stringify(normalized);
    if (node.dataset.galleryImages !== serialized) node.dataset.galleryImages = serialized;
    return normalized;
  } catch {
    return [];
  }
}

function setCanvasGalleryImages(node, images) {
  const normalized = normalizeCanvasGalleryImages(images);
  node.dataset.galleryImages = JSON.stringify(normalized);
  const active = resolveCanvasGalleryActiveImage(normalized, node.dataset.galleryActiveImageId);
  if (active) node.dataset.galleryActiveImageId = active.id;
  else delete node.dataset.galleryActiveImageId;
  renderCanvasGalleryImages(node);
}

function getCanvasGalleryActiveImage(node) {
  const active = resolveCanvasGalleryActiveImage(getCanvasGalleryImages(node), node?.dataset.galleryActiveImageId);
  if (active && node.dataset.galleryActiveImageId !== active.id) node.dataset.galleryActiveImageId = active.id;
  if (!active) delete node.dataset.galleryActiveImageId;
  return active;
}

function setCanvasGalleryActiveImage(node, imageId) {
  if (!node?.classList?.contains("canvas-node-gallery")) return null;
  const image = getCanvasGalleryImages(node).find((item) => item.id === String(imageId || ""));
  if (!image) return null;
  node.dataset.galleryActiveImageId = image.id;
  renderCanvasGalleryImages(node);
  refreshCanvasConnectedNodes(node.dataset.id);
  scheduleCanvasConnectionRender();
  scheduleCanvasSave();
  setCanvasStatus(`已切换当前图片：${image.name || "生成图"}`);
  return image;
}

function removeCanvasGalleryImage(node, index) {
  if (!node?.classList?.contains("canvas-node-gallery")) return;
  const images = getCanvasGalleryImages(node);
  if (index < 0 || index >= images.length) return;
  images.splice(index, 1);
  const fallback = resolveCanvasGalleryActiveImage(images, node.dataset.galleryActiveImageId);
  if (fallback) node.dataset.galleryActiveImageId = fallback.id;
  else delete node.dataset.galleryActiveImageId;
  setCanvasGalleryImages(node, images);
  refreshCanvasConnectedNodes(node.dataset.id);
  scheduleCanvasConnectionRender();
  scheduleCanvasSave();
  setCanvasStatus(images.length ? "\u5df2\u5220\u9664\u56fe\u96c6\u56fe\u7247\uff0c\u8fd8\u5269 " + images.length + " \u5f20\u3002" : "\u5df2\u6e05\u7a7a\u56fe\u96c6\u56fe\u7247\u3002");
}

function requestCanvasGalleryImageDelete(node, index) {
  if (!node?.classList?.contains("canvas-node-gallery")) return;
  const images = getCanvasGalleryImages(node);
  const image = images[index];
  if (!image) return;
  const isActive = image.id === node.dataset.galleryActiveImageId;
  const remaining = images.length - 1;
  const consequence = remaining
    ? `${isActive ? "这是当前图片，删除后会自动切换到其他结果。" : ""} 图集中还会保留 ${remaining} 张图片。`
    : "这是图集中的最后一张图片，删除后图集将变为空图集。";
  requestCanvasDeleteConfirmation({
    title: "删除这张图片？",
    message: `${consequence} 删除后可立即撤销，也可稍后使用 Ctrl+Z 恢复。`,
    confirmLabel: "删除图片",
    onConfirm: () => {
      removeCanvasGalleryImage(node, index);
      showCanvasDeleteUndo(`已删除「${image.name || `生成图 ${index + 1}`}」`);
    },
  });
}

function requestCanvasGalleryNodeDelete(node) {
  if (!node?.classList?.contains("canvas-node-gallery")) return;
  const imageCount = getCanvasGalleryImages(node).length;
  const connectionCount = canvasState.connections.filter((item) => (
    item.from === node.dataset.id || item.to === node.dataset.id
  )).length;
  const imageLabel = imageCount ? `${imageCount} 张历史图片` : "空图集";
  const connectionLabel = connectionCount ? `和 ${connectionCount} 条相关连线` : "";
  requestCanvasDeleteConfirmation({
    title: "删除整个图集？",
    message: `将删除这个节点中的${imageLabel}${connectionLabel}。删除后可立即撤销，也可稍后使用 Ctrl+Z 恢复。`,
    confirmLabel: "删除图集",
    onConfirm: () => {
      deleteCanvasNodes([node]);
      showCanvasDeleteUndo(imageCount ? `已删除图集和 ${imageCount} 张历史图片` : "已删除图集");
    },
  });
}

function syncCanvasGalleryAspectRatio(node, imageElement) {
  const width = Number(imageElement?.naturalWidth || 0);
  const height = Number(imageElement?.naturalHeight || 0);
  if (!node || width <= 0 || height <= 0) return false;
  const ratio = width / height;
  if (!Number.isFinite(ratio) || ratio <= 0) return false;
  node.dataset.galleryAspectRatio = String(ratio);
  node.style.setProperty("--canvas-gallery-aspect-ratio", String(ratio));
  delete node.dataset.height;
  node.style.removeProperty("--canvas-node-media-height");
  scheduleCanvasConnectionRender({ trailing: false });
  scheduleCanvasSave();
  return true;
}

function renderCanvasGalleryImages(node) {
  const stack = node.querySelector(".canvas-gallery-stack");
  const historyToggle = node.querySelector(".canvas-gallery-history-toggle");
  const sliceToggle = node.querySelector(".canvas-gallery-slice-toggle");
  if (!stack || !historyToggle) return;
  const images = getCanvasGalleryImages(node);
  const active = getCanvasGalleryActiveImage(node);
  if (sliceToggle) sliceToggle.hidden = !active;
  node.classList.toggle("canvas-node-frameless", Boolean(active));
  node.classList.toggle("canvas-gallery-frameless", Boolean(active));
  stack.innerHTML = "";
  historyToggle.innerHTML = "";
  historyToggle.innerHTML = '<i class="canvas-gallery-history-icon" data-lucide="images"></i>';
  const historyBadge = document.createElement("b");
  historyBadge.textContent = String(images.length);
  historyToggle.append(historyBadge);
  historyToggle.hidden = !images.length;
  if (!images.length) {
    const empty = document.createElement("div");
    empty.className = "canvas-gallery-empty";
    empty.textContent = "生成后的图片会排在这里";
    stack.append(empty);
    setCanvasGalleryHistoryOpen(node, false);
    window.lucide?.createIcons({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
    return;
  }
  const layerCount = Math.min(5, Math.max(0, images.length - 1));
  for (let layer = layerCount; layer >= 1; layer -= 1) {
    const back = document.createElement("span");
    back.className = "canvas-gallery-stack-layer";
    back.style.setProperty("--gallery-stack-layer", String(layer));
    back.style.setProperty("--gallery-stack-scale", String(1 - layer * 0.006));
    stack.append(back);
  }
  const cover = document.createElement("button");
  cover.type = "button";
  cover.className = "canvas-gallery-cover";
  cover.dataset.galleryIndex = String(images.findIndex((image) => image.id === active.id));
  const image = document.createElement("img");
  image.alt = active.name || "当前生成图";
  const syncAspect = () => syncCanvasGalleryAspectRatio(node, image);
  image.addEventListener("load", syncAspect, { once: true });
  registerCanvasDetailImage(image, active.src || active.url);
  cover.append(image);
  if (image.complete) syncAspect();
  bindCanvasGalleryCoverInteraction(cover, node, Number(cover.dataset.galleryIndex));
  stack.append(cover);
  renderCanvasGalleryHistory(node);
  window.lucide?.createIcons({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
  requestAnimationFrame(() => scheduleCanvasConnectionRender({ trailing: false }));
}

function renderCanvasGalleryHistory(node) {
  const list = node.querySelector(".canvas-gallery-history-list");
  const title = node.querySelector(".canvas-gallery-history-title");
  if (!list || !title) return;
  const images = getCanvasGalleryImages(node);
  const active = getCanvasGalleryActiveImage(node);
  title.textContent = `结果 \u00b7 ${images.length}`;
  list.innerHTML = "";
  [...images].reverse().forEach((galleryImage) => {
    const index = images.findIndex((item) => item.id === galleryImage.id);
    const item = document.createElement("article");
    item.className = `canvas-gallery-history-item${galleryImage.id === active?.id ? " is-active" : ""}`;
    item.dataset.galleryImageId = galleryImage.id;
    const select = document.createElement("button");
    select.type = "button";
    select.className = "canvas-gallery-history-select";
    select.setAttribute("aria-label", `设为当前图片：${galleryImage.name || `生成图 ${index + 1}`}`);
    select.setAttribute("aria-current", galleryImage.id === active?.id ? "true" : "false");
    select.title = galleryImage.name || `生成图 ${index + 1}`;
    const img = createDeferredThumbnail(
      galleryImage.src || galleryImage.url,
      galleryImage.name || `生成图 ${index + 1}`,
    );
    img.draggable = false;
    select.append(img);
    const actions = document.createElement("span");
    actions.className = "canvas-gallery-history-actions";
    const download = document.createElement("button");
    download.type = "button";
    download.className = "canvas-gallery-history-action canvas-gallery-history-download";
    download.innerHTML = '<i data-lucide="download"></i>';
    download.title = "下载图片";
    download.setAttribute("aria-label", "下载图片");
    download.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await downloadAsset(galleryImage.savedUrl || galleryImage.src, `${galleryImage.name || `生成图-${index + 1}`}.png`, event.currentTarget);
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "canvas-gallery-history-action canvas-gallery-history-remove";
    remove.innerHTML = '<i data-lucide="trash-2"></i>';
    remove.title = "删除图片";
    remove.setAttribute("aria-label", "删除图片");
    remove.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      requestCanvasGalleryImageDelete(node, index);
    });
    actions.append(download, remove);
    item.append(select, actions);
    bindCanvasGalleryItemDrag(item, galleryImage, index, {
      onClick: () => setCanvasGalleryActiveImage(node, galleryImage.id),
    });
    list.append(item);
  });
  window.lucide?.createIcons({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
}

function setCanvasGalleryHistoryOpen(node, open) {
  const panel = node?.querySelector(".canvas-gallery-history-panel");
  const toggle = node?.querySelector(".canvas-gallery-history-toggle");
  if (!panel || !toggle) return false;
  if (open) {
    closeCanvasVideoHistoryPanels();
    closeCanvasGalleryHistoryPanels(node);
    renderCanvasGalleryHistory(node);
  }
  panel.hidden = !open;
  node.classList.toggle("is-gallery-history-open", Boolean(open));
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
  return Boolean(open);
}

function closeCanvasGalleryHistoryPanels(exceptNode = null) {
  let closed = false;
  document.querySelectorAll("#canvasPlane .canvas-node-gallery.is-gallery-history-open").forEach((node) => {
    if (node === exceptNode) return;
    const panel = node.querySelector(".canvas-gallery-history-panel");
    const toggle = node.querySelector(".canvas-gallery-history-toggle");
    if (panel) panel.hidden = true;
    if (toggle) toggle.setAttribute("aria-expanded", "false");
    node.classList.remove("is-gallery-history-open");
    closed = true;
  });
  return closed;
}

function updateCanvasGalleryLayout(node, options = {}) {
  if (!node?.classList?.contains("canvas-node-gallery")) return;
  const grid = node.querySelector(".canvas-gallery-grid");
  const items = Array.from(grid?.querySelectorAll(".canvas-gallery-item") || []);
  const count = items.length;
  if (!grid || !count) return;

  const style = getComputedStyle(grid);
  const gap = Number.parseFloat(style.columnGap || style.gap) || 10;
  const paddingX = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
  const paddingY = (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0);
  const width = Math.max(1, grid.clientWidth - paddingX);
  const height = Math.max(1, grid.clientHeight - paddingY);
  const ratios = items
    .map((item) => {
      const img = item.querySelector("img");
      return img?.naturalWidth > 0 && img?.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1;
    })
    .filter((ratio) => Number.isFinite(ratio) && ratio > 0);
  const averageRatio = ratios.length
    ? ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length
    : 1;
  const fitRatio = clampNumber(averageRatio, 0.35, 2.4);
  let bestColumns = 1;
  let bestRowHeight = 0;
  let bestItemWidth = 0;

  let bestScore = 0;

  for (let columns = 1; columns <= count; columns += 1) {
    const rows = Math.ceil(count / columns);
    const maxRowHeight = (height - gap * (rows - 1)) / rows;
    const maxItemWidth = (width - gap * (columns - 1)) / columns;
    const itemWidth = Math.min(maxItemWidth, maxRowHeight * fitRatio);
    const rowHeight = itemWidth / fitRatio;
    const usedWidth = itemWidth * Math.min(columns, count) + gap * (Math.min(columns, count) - 1);
    const usedHeight = rowHeight * rows + gap * (rows - 1);
    const fillScore = (itemWidth * rowHeight) + (usedWidth / width) * 120 + (usedHeight / height) * 40;
    if (fillScore > bestScore) {
      bestScore = fillScore;
      bestColumns = columns;
      bestRowHeight = rowHeight;
      bestItemWidth = itemWidth;
    }
  }

  if (!bestScore) {
    bestColumns = count;
    bestItemWidth = Math.max(1, (width - gap * (count - 1)) / count);
    bestRowHeight = Math.min(height, bestItemWidth / fitRatio);
  }

  const nextColumns = String(bestColumns);
  const nextItemWidth = `${Math.max(1, Math.floor(bestItemWidth))}px`;
  const nextRowHeight = `${Math.max(1, Math.floor(bestRowHeight))}px`;
  if (grid.style.getPropertyValue("--canvas-gallery-columns") !== nextColumns) grid.style.setProperty("--canvas-gallery-columns", nextColumns);
  if (grid.style.getPropertyValue("--canvas-gallery-item-width") !== nextItemWidth) grid.style.setProperty("--canvas-gallery-item-width", nextItemWidth);
  if (grid.style.getPropertyValue("--canvas-gallery-row-height") !== nextRowHeight) grid.style.setProperty("--canvas-gallery-row-height", nextRowHeight);
  if (options.renderConnections !== false) scheduleCanvasConnectionRender({ trailing: false });
}

function bindCanvasGalleryCoverInteraction(cover, node, index) {
  let start = null;
  let moved = false;
  let suppressClick = false;

  const stop = (event, cancelled = false) => {
    if (!start) return;
    event?.stopPropagation?.();
    cover.releasePointerCapture?.(event?.pointerId);
    cover.classList.remove("is-dragging");
    if (moved && !cancelled) {
      updateCanvasGroupMembership(start.nodes.map((item) => item.node));
      releaseCanvasGroupFocus();
      scheduleCanvasSave();
      suppressClick = true;
      window.setTimeout(() => { suppressClick = false; }, 0);
    }
    start = null;
    moved = false;
  };

  cover.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (!node.classList.contains("is-selected")) selectCanvasNode(node);
    const selectedNodes = getCanvasDragNodes(getSelectedCanvasNodes());
    start = {
      x: event.clientX,
      y: event.clientY,
      nodes: selectedNodes.map((item) => ({
        node: item,
        x: Number(item.dataset.x),
        y: Number(item.dataset.y),
      })),
    };
    moved = false;
    cover.setPointerCapture?.(event.pointerId);
  });

  cover.addEventListener("pointermove", (event) => {
    if (!start) return;
    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (distance < 6) return;
    if (!moved) {
      moved = true;
      cover.classList.add("is-dragging");
    }
    const deltaX = (event.clientX - start.x) / canvasState.scale;
    const deltaY = (event.clientY - start.y) / canvasState.scale;
    start.nodes.forEach((item) => {
      item.node.dataset.x = String(item.x + deltaX);
      item.node.dataset.y = String(item.y + deltaY);
      updateCanvasNodePosition(item.node);
    });
    event.preventDefault();
  });

  cover.addEventListener("pointerup", (event) => stop(event));
  cover.addEventListener("pointercancel", (event) => stop(event, true));
  cover.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (!node.classList.contains("is-selected")) selectCanvasNode(node);
  });
}

function bindCanvasGalleryItemDrag(item, image, index, options = {}) {
  const payload = {
    src: image.src || image.url,
    savedUrl: image.savedUrl || image.src || image.url,
    name: image.name || `生成图 ${index + 1}`,
  };
  let start = null;
  let moved = false;
  let suppressClick = false;

  item.draggable = false;
  item.addEventListener("dragstart", (event) => {
    if (event.target.closest?.(".canvas-gallery-history-action, .canvas-gallery-history-close, .canvas-gallery-history-toggle")) {
      event.preventDefault();
      return;
    }
    const serialized = JSON.stringify(payload);
    event.dataTransfer?.setData("application/x-canvas-gallery-image", serialized);
    event.dataTransfer?.setData("text/plain", serialized);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
    canvasState.draggedGalleryImage = payload;
    item.classList.add("is-dragging");
    suppressClick = true;
  });

  item.addEventListener("dragend", () => {
    item.classList.remove("is-dragging");
    canvasState.draggedGalleryImage = null;
    window.setTimeout(() => { suppressClick = false; }, 0);
  });

  item.addEventListener("mousedown", (event) => {
    if (event.target.closest?.(".canvas-gallery-remove, .canvas-gallery-history-action, .canvas-gallery-history-close, .canvas-gallery-history-toggle")) return;
    if (event.button !== 0) return;
    event.stopPropagation();
    start = { x: event.clientX, y: event.clientY };
    moved = false;
    canvasState.draggedGalleryImage = payload;

    const move = (moveEvent) => {
      if (!start) return;
      const distance = Math.hypot(moveEvent.clientX - start.x, moveEvent.clientY - start.y);
      if (distance < 8) return;
      moved = true;
      item.classList.add("is-dragging");
      updateCanvasGalleryDragGhost(payload, moveEvent.clientX, moveEvent.clientY);
      moveEvent.preventDefault();
    };

    const up = (upEvent) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      item.classList.remove("is-dragging");
      const sourceGallery = item.closest(".canvas-node-gallery");
      const sourcePanel = item.closest(".canvas-gallery-history-panel");
      const shouldCopy = moved && isCanvasClientPoint(upEvent.clientX, upEvent.clientY)
        && !isClientPointInsideElement(sourceGallery, upEvent.clientX, upEvent.clientY)
        && !isClientPointInsideElement(sourcePanel, upEvent.clientX, upEvent.clientY);
      if (moved) {
        suppressClick = true;
        window.setTimeout(() => { suppressClick = false; }, 0);
      }
      if (shouldCopy) {
        createCanvasImageFromGalleryDrop(payload, getCanvasPointFromClient(upEvent.clientX, upEvent.clientY), upEvent);
      }
      removeCanvasGalleryDragGhost();
      start = null;
      moved = false;
      canvasState.draggedGalleryImage = null;
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up, { once: true });
  });

  item.addEventListener("pointerdown", (event) => {
    if (event.target.closest?.(".canvas-gallery-remove, .canvas-gallery-history-action, .canvas-gallery-history-close, .canvas-gallery-history-toggle")) return;
    if (event.button !== 0) return;
    event.stopPropagation();
    if (event.pointerType === "mouse") return;
    start = { x: event.clientX, y: event.clientY };
    moved = false;
    canvasState.draggedGalleryImage = payload;
    item.setPointerCapture?.(event.pointerId);
  });

  item.addEventListener("pointermove", (event) => {
    if (!start) return;
    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (distance < 8) return;
    moved = true;
    item.classList.add("is-dragging");
    updateCanvasGalleryDragGhost(payload, event.clientX, event.clientY);
    event.preventDefault();
  });

  item.addEventListener("pointerup", (event) => {
    if (!start) return;
    event.stopPropagation();
    item.releasePointerCapture?.(event.pointerId);
    item.classList.remove("is-dragging");
    const sourceGallery = item.closest(".canvas-node-gallery");
    const sourcePanel = item.closest(".canvas-gallery-history-panel");
    const shouldCopy = moved && isCanvasClientPoint(event.clientX, event.clientY)
      && !isClientPointInsideElement(sourceGallery, event.clientX, event.clientY)
      && !isClientPointInsideElement(sourcePanel, event.clientX, event.clientY);
    if (moved) {
      suppressClick = true;
      window.setTimeout(() => { suppressClick = false; }, 0);
    }
    if (shouldCopy) {
      createCanvasImageFromGalleryDrop(payload, getCanvasPointFromClient(event.clientX, event.clientY), event);
    }
    removeCanvasGalleryDragGhost();
    start = null;
    moved = false;
    canvasState.draggedGalleryImage = null;
  });

  item.addEventListener("pointercancel", () => {
    removeCanvasGalleryDragGhost();
    start = null;
    moved = false;
    canvasState.draggedGalleryImage = null;
    item.classList.remove("is-dragging");
  });

  item.addEventListener("click", (event) => {
    if (event.target.closest?.(".canvas-gallery-remove, .canvas-gallery-history-action, .canvas-gallery-history-close, .canvas-gallery-history-toggle")) return;
    event.stopPropagation();
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (typeof options.onClick === "function") options.onClick();
    else openCanvasGalleryPreview(item.closest(".canvas-node-gallery"), index);
  });
}

function openCanvasGalleryPreview(node, index = 0) {
  const images = getCanvasGalleryImages(node).map((image, itemIndex) => ({
    src: image.src || image.url,
    savedUrl: image.savedUrl || image.src || image.url,
    name: image.name || `生成图 ${itemIndex + 1}`,
  })).filter((image) => image.src);
  const selected = images[index] || images[0];
  if (!selected) return;
  openPreview(selected.src, selected.savedUrl || selected.src, { gallery: images, index });
}

function updateCanvasGalleryDragGhost(image, clientX, clientY) {
  if (!canvasState.galleryDragGhost) {
    const ghost = document.createElement("div");
    ghost.className = "canvas-gallery-drag-ghost";
    const img = document.createElement("img");
    img.alt = image.name || "拖拽图片";
    ghost.append(img);
    document.body.append(ghost);
    canvasState.galleryDragGhost = ghost;
  }
  const ghost = canvasState.galleryDragGhost;
  const img = ghost.querySelector("img");
  if (img && img.src !== image.src) img.src = image.src;
  ghost.style.transform = `translate(${clientX + 18}px, ${clientY + 18}px)`;
}

function removeCanvasGalleryDragGhost() {
  canvasState.galleryDragGhost?.remove();
  canvasState.galleryDragGhost = null;
}

function isCanvasClientPoint(clientX, clientY) {
  const viewport = document.querySelector("#infiniteCanvas");
  const rect = viewport?.getBoundingClientRect();
  return Boolean(rect
    && clientX >= rect.left
    && clientX <= rect.right
    && clientY >= rect.top
    && clientY <= rect.bottom);
}

function isClientPointInsideElement(element, clientX, clientY) {
  const rect = element?.getBoundingClientRect?.();
  return Boolean(rect
    && rect.width > 0
    && rect.height > 0
    && clientX >= rect.left
    && clientX <= rect.right
    && clientY >= rect.top
    && clientY <= rect.bottom);
}

function createCanvasImageFromGalleryDrop(payload, point, event) {
  let image;
  if (typeof payload === "string") {
    try {
      image = JSON.parse(payload);
    } catch {
      setCanvasStatus("图集图片数据读取失败。");
      return;
    }
  } else {
    image = payload;
  }
  const src = image?.savedUrl || image?.src || image?.url;
  if (!src) {
    setCanvasStatus("图集图片没有可用地址。");
    return;
  }
  const node = addCanvasImage(src, image.name || "图集图片", point);
  node.dataset.imageSrc = src;
  node.dataset.x = String(point.x - node.offsetWidth / 2);
  node.dataset.y = String(point.y - node.offsetHeight / 2);
  updateCanvasNodePosition(node);
  selectCanvasNode(node);
  scheduleCanvasSave();
  setCanvasStatus("已从图集复制为图片节点。");
}

function replaceCanvasImageNode(node, src, name) {
  if (!node || !src) return;
  if (node.dataset.uploadOnly === "true") renderCanvasUploadNode(node, { src, name });
  else renderCanvasImageNode(node, { src, name });
  refreshCanvasConnectedNodes(node.dataset.id);
  refreshCanvasGroupsContainingNode(node.dataset.id);
  updateCanvasGroupMembership([node]);
  scheduleCanvasSave();
  setCanvasStatus("已替换图片节点。");
}

function getCanvasModelPortPoint(id, kind = "input") {
  const model = getCanvasNodeModel(id);
  if (!model) return null;
  const rect = canvasVirtualStore.getRect(id);
  if (!rect) return null;
  const height = rect.bottom - rect.top;
  if (kind === "output") return { x: rect.right, y: rect.top + height * 0.5 };
  if (kind === "prompt") return { x: rect.left, y: rect.top + height * 0.72 };
  return { x: rect.left, y: rect.top + height * 0.5 };
}

function getCanvasConnectionPortPoint(id, kind) {
  return getCanvasModelPortPoint(id, kind);
}

function getCanvasConnectionPathData(from, to) {
  const distance = Math.max(80, Math.abs(to.x - from.x) * 0.45);
  return `M ${from.x} ${from.y} C ${from.x + distance} ${from.y}, ${to.x - distance} ${to.y}, ${to.x} ${to.y}`;
}

function getVisibleCanvasConnections() {
  const viewport = document.querySelector("#infiniteCanvas");
  const rules = window.CanvasVirtualizationRules;
  if (!viewport || !rules) return [];
  const visibleRect = rules.getViewportCanvasRect(
    { width: viewport.clientWidth, height: viewport.clientHeight },
    canvasState,
    360,
  );
  const visible = canvasState.connections.flatMap((item, index) => {
    if (!canvasVirtualStore.has(item.from) || !canvasVirtualStore.has(item.to)) return [];
    const from = getCanvasConnectionPortPoint(item.from, "output");
    const to = getCanvasConnectionPortPoint(item.to, item.toPort || "input");
    if (!from || !to) return [];
    const bounds = rules.getConnectionBounds(from, to);
    if (!rules.rectsIntersect(bounds, visibleRect)) return [];
    return [{ item, index, from, to, key: `${item.from}->${item.to}:${item.toPort || "input"}:${index}` }];
  });
  const maximum = canvasState.scale < 0.15
    ? 80
    : canvasState.scale < 0.3
      ? 240
      : canvasState.scale < 0.65
        ? 1200
        : Number.POSITIVE_INFINITY;
  if (visible.length <= maximum) return visible;
  return Array.from({ length: maximum }, (_, index) => (
    visible[Math.min(visible.length - 1, Math.floor(index * visible.length / maximum))]
  ));
}

function initializeCanvasConnectionSvg(svg) {
  if (canvasConnectionSvg === svg) return;
  canvasConnectionSvg = svg;
  canvasConnectionElements.clear();
  canvasTempConnectionPath = null;
  svg.replaceChildren();
  svg.addEventListener("click", (event) => {
    const hit = event.target.closest?.(".canvas-connection-hit[data-connection-from][data-connection-to]");
    if (!hit) return;
    event.stopPropagation();
    disconnectCanvasNodes(hit.dataset.connectionFrom, hit.dataset.connectionTo);
  });
}

function renderCanvasConnections() {
  const svg = document.querySelector("#canvasConnections");
  if (!svg) return;
  initializeCanvasConnectionSvg(svg);
  const visible = getVisibleCanvasConnections();
  const interactive = canvasState.scale >= 0.3;
  const activeKeys = new Set();
  visible.forEach(({ item, from, to, key }) => {
    activeKeys.add(key);
    let entry = canvasConnectionElements.get(key);
    if (!entry) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("class", "canvas-connection-path");
      svg.append(path);
      entry = { path, hit: null };
      canvasConnectionElements.set(key, entry);
    }
    if (interactive && !entry.hit) {
      const hit = document.createElementNS("http://www.w3.org/2000/svg", "path");
      hit.setAttribute("class", "canvas-connection-hit");
      hit.dataset.connectionFrom = String(item.from);
      hit.dataset.connectionTo = String(item.to);
      svg.append(hit);
      entry.hit = hit;
    } else if (!interactive && entry.hit) {
      entry.hit.remove();
      entry.hit = null;
    }
    const d = getCanvasConnectionPathData(from, to);
    if (entry.path.getAttribute("d") !== d) entry.path.setAttribute("d", d);
    if (entry.hit && entry.hit.getAttribute("d") !== d) entry.hit.setAttribute("d", d);
  });
  canvasConnectionElements.forEach((entry, key) => {
    if (activeKeys.has(key)) return;
    entry.path.remove();
    entry.hit?.remove();
    canvasConnectionElements.delete(key);
  });

  if (canvasState.tempConnection) {
    const reverse = canvasState.tempConnection.direction === "input";
    const from = reverse
      ? canvasState.tempConnection.fromPoint
      : getCanvasConnectionPortPoint(canvasState.tempConnection.from, "output");
    const to = reverse
      ? getCanvasConnectionPortPoint(canvasState.tempConnection.to, canvasState.tempConnection.toPort || "input")
      : canvasState.tempConnection.to;
    if (from && to) {
      if (!canvasTempConnectionPath) {
        canvasTempConnectionPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        canvasTempConnectionPath.setAttribute("class", "canvas-connection-path canvas-connection-temp");
        svg.append(canvasTempConnectionPath);
      }
      canvasTempConnectionPath.setAttribute("d", getCanvasConnectionPathData(from, to));
    }
  } else if (canvasTempConnectionPath) {
    canvasTempConnectionPath.remove();
    canvasTempConnectionPath = null;
  }
}

function scheduleCanvasConnectionRender(options = {}) {
  const trailing = options.trailing !== false;
  if (!canvasConnectionRenderFrame) {
    canvasConnectionRenderFrame = requestAnimationFrame(() => {
      canvasConnectionRenderFrame = 0;
      renderCanvasConnections();
    });
  }
  if (!trailing) return;
  if (canvasConnectionRenderTimer) window.clearTimeout(canvasConnectionRenderTimer);
  canvasConnectionRenderTimer = window.setTimeout(() => {
    canvasConnectionRenderTimer = 0;
    if (!canvasConnectionRenderFrame) renderCanvasConnections();
  }, 160);
}

function getCanvasPortPoint(node, kind) {
  if (!node) return null;
  const port = node.querySelector(`.canvas-port-${kind}`) || (kind === "prompt" ? node.querySelector(".canvas-port-input") : null);
  if (!port) return null;
  const nodeX = Number(node.dataset.x);
  const nodeY = Number(node.dataset.y);
  if (Number.isFinite(nodeX) && Number.isFinite(nodeY)) {
    return {
      x: nodeX + port.offsetLeft + port.offsetWidth / 2,
      y: nodeY + port.offsetTop,
    };
  }
  const viewport = document.querySelector("#infiniteCanvas");
  if (!viewport) return null;
  const portRect = port.getBoundingClientRect();
  const viewportRect = viewport.getBoundingClientRect();
  return screenToCanvas(
    portRect.left + portRect.width / 2 - viewportRect.left,
    portRect.top + portRect.height / 2 - viewportRect.top,
  );
}

function createCanvasPort(kind) {
  const port = document.createElement("button");
  port.className = `canvas-port canvas-port-${kind}`;
  port.type = "button";
  port.title = kind === "output" ? "连接到其它节点" : "接收图片或提示词连接";
  if (kind === "output") {
    port.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      port.setPointerCapture?.(event.pointerId);
      const node = port.closest(".canvas-node");
      if (node) startCanvasConnectionDrag(node, event);
    });
  } else if (kind === "input") {
    port.addEventListener("pointerdown", (event) => {
      if (canvasState.pendingConnection) return;
      event.preventDefault();
      event.stopPropagation();
      port.setPointerCapture?.(event.pointerId);
      const node = port.closest(".canvas-node");
      if (node) startCanvasInputConnectionDrag(node, event, "input");
    });
  }
  port.addEventListener("click", (event) => {
    event.stopPropagation();
    const node = port.closest(".canvas-node");
    if (!node) return;
    if (kind === "output") {
      canvasState.pendingConnection = node.dataset.id;
      document.querySelectorAll(".canvas-node.is-connecting").forEach((item) => item.classList.remove("is-connecting"));
      node.classList.add("is-connecting");
      return;
    }
    if (!canvasState.pendingConnection) return;
    connectCanvasNodes(canvasState.pendingConnection, node.dataset.id, kind);
  });
  return port;
}

function startCanvasInputConnectionDrag(targetNode, startEvent, toPort = "input") {
  canvasState.tempConnection = {
    direction: "input",
    to: targetNode.dataset.id,
    toPort,
    fromPoint: getCanvasPointFromClient(startEvent.clientX, startEvent.clientY),
  };
  document.querySelectorAll(".canvas-node.is-connecting").forEach((item) => item.classList.remove("is-connecting"));
  targetNode.classList.add("is-connecting");
  setCanvasStatus("拖到已有节点，或松开后新建图片/提示词节点。");
  scheduleCanvasConnectionRender({ trailing: false });

  const move = (event) => {
    canvasState.tempConnection = {
      direction: "input",
      to: targetNode.dataset.id,
      toPort,
      fromPoint: getCanvasPointFromClient(event.clientX, event.clientY),
    };
    scheduleCanvasConnectionRender({ trailing: false });
  };

  const finish = (event) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", cancel);
    canvasState.tempConnection = null;
    const sourceNode = findCanvasNodeAtClient(event.clientX, event.clientY, targetNode);
    if (sourceNode && sourceNode !== targetNode) {
      connectCanvasNodes(sourceNode.dataset.id, targetNode.dataset.id, toPort);
      return;
    }
    targetNode.classList.remove("is-connecting");
    renderCanvasConnections();
    showCanvasConnectMenu(event, null, { direction: "input", toId: targetNode.dataset.id, toPort });
  };

  const cancel = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", cancel);
    canvasState.tempConnection = null;
    targetNode.classList.remove("is-connecting");
    renderCanvasConnections();
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", finish, { once: true });
  window.addEventListener("pointercancel", cancel, { once: true });
}

function startCanvasConnectionDrag(sourceNode, startEvent) {
  const isEmptyMaterialNode = sourceNode?.dataset.uploadOnly === "true"
    || sourceNode?.classList.contains("canvas-node-video")
    || sourceNode?.classList.contains("canvas-node-audio");
  if (!getCanvasNodeOutput(sourceNode) && !isEmptyMaterialNode) {
    setCanvasStatus("这个节点还没有可连接的内容。");
    return;
  }
  canvasState.pendingConnection = sourceNode.dataset.id;
  canvasState.tempConnection = {
    from: sourceNode.dataset.id,
    to: getCanvasPointFromClient(startEvent.clientX, startEvent.clientY),
  };
  document.querySelectorAll(".canvas-node.is-connecting").forEach((item) => item.classList.remove("is-connecting"));
  sourceNode.classList.add("is-connecting");
  setCanvasStatus("拖到目标图片节点的左侧圆点，或直接松在目标节点上。");
  scheduleCanvasConnectionRender({ trailing: false });

  const move = (event) => {
    canvasState.tempConnection = {
      from: sourceNode.dataset.id,
      to: getCanvasPointFromClient(event.clientX, event.clientY),
    };
    scheduleCanvasConnectionRender({ trailing: false });
  };

  const finish = (event) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", cancel);
    canvasState.tempConnection = null;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const targetNode = findCanvasNodeAtClient(event.clientX, event.clientY, sourceNode);
    if (targetNode && targetNode !== sourceNode) {
      connectCanvasNodes(sourceNode.dataset.id, targetNode.dataset.id, "input");
      return;
    }
    canvasState.pendingConnection = null;
    sourceNode.classList.remove("is-connecting");
    renderCanvasConnections();
    showCanvasConnectMenu(event, sourceNode.dataset.id, { direction: "output" });
  };

  const cancel = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", finish);
    window.removeEventListener("pointercancel", cancel);
    canvasState.pendingConnection = null;
    canvasState.tempConnection = null;
    sourceNode.classList.remove("is-connecting");
    renderCanvasConnections();
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", finish, { once: true });
  window.addEventListener("pointercancel", cancel, { once: true });
}

function findCanvasNodeAtClient(clientX, clientY, excludedNode) {
  const direct = document.elementFromPoint(clientX, clientY)?.closest?.(".canvas-node");
  if (direct && direct !== excludedNode) return direct;
  return Array.from(document.querySelectorAll("#canvasPlane .canvas-node"))
    .filter((node) => node !== excludedNode)
    .reverse()
    .find((node) => {
      const rect = node.getBoundingClientRect();
      return clientX >= rect.left - 14 && clientX <= rect.right + 14 && clientY >= rect.top - 14 && clientY <= rect.bottom + 14;
    });
}

function findCanvasImageNodeAtClient(clientX, clientY) {
  const direct = document.elementFromPoint(clientX, clientY)?.closest?.(".canvas-node-image");
  if (direct) return direct;
  return Array.from(document.querySelectorAll("#canvasPlane .canvas-node-image"))
    .reverse()
    .find((node) => {
      const rect = node.getBoundingClientRect();
      return clientX >= rect.left - 14 && clientX <= rect.right + 14 && clientY >= rect.top - 14 && clientY <= rect.bottom + 14;
    });
}

function showCanvasConnectMenu(event, fromId, options = {}) {
  const menu = document.querySelector("#canvasConnectMenu");
  const viewport = document.querySelector("#infiniteCanvas");
  if (!menu || !viewport) return;
  const rect = viewport.getBoundingClientRect();
  const localX = event.clientX - rect.left;
  const localY = event.clientY - rect.top;
  canvasState.connectMenu = {
    fromId,
    point: screenToCanvas(localX, localY),
    direction: options.direction || "output",
    toId: options.toId || "",
    toPort: options.toPort || "input",
  };
  const isInputDrag = canvasState.connectMenu.direction === "input";
  const buttons = Array.from(menu.querySelectorAll("[data-connect-node]"));
  buttons.forEach((button) => {
    button.hidden = false;
  });
  if (isInputDrag) {
    const targetNode = getCanvasNode(canvasState.connectMenu.toId);
    if (targetNode?.classList.contains("canvas-node-text")) {
      buttons.forEach((button) => {
        button.hidden = button.dataset.connectNode !== "llm";
      });
    } else if (targetNode?.classList.contains("canvas-node-llm")) {
      buttons.forEach((button) => {
        button.hidden = !["upload", "text"].includes(button.dataset.connectNode);
      });
    } else if (targetNode?.classList.contains("canvas-node-comfy")) {
      buttons.forEach((button) => {
        button.hidden = !["upload", "loop"].includes(button.dataset.connectNode);
      });
    } else if (targetNode?.classList.contains("canvas-node-loop")) {
      buttons.forEach((button) => {
        button.hidden = button.dataset.connectNode !== "upload";
      });
    } else {
      menu.querySelector('[data-connect-node="gallery"]')?.toggleAttribute("hidden", true);
      menu.querySelector('[data-connect-node="generator"]')?.toggleAttribute("hidden", true);
      menu.querySelector('[data-connect-node="llm"]')?.toggleAttribute("hidden", true);
      menu.querySelector('[data-connect-node="comfy"]')?.toggleAttribute("hidden", true);
    }
  } else {
    const sourceNode = getCanvasNode(fromId);
    const sourceOutput = getCanvasNodeOutput(sourceNode) || (sourceNode?.classList.contains("canvas-node-loop")
      ? { type: "loop", name: "循环节点", images: [] }
      : null);
    if (sourceOutput?.type === "generator") {
      buttons.forEach((button) => {
        button.hidden = button.dataset.connectNode !== "gallery";
      });
    } else if (sourceOutput?.type === "loop") {
      buttons.forEach((button) => {
        button.hidden = button.dataset.connectNode !== "comfy";
      });
    } else if (sourceOutput?.type === "llm") {
      buttons.forEach((button) => {
        button.hidden = button.dataset.connectNode !== "text";
      });
    } else if (sourceOutput?.type === "text") {
      buttons.forEach((button) => {
        button.hidden = !["generator", "llm"].includes(button.dataset.connectNode);
      });
    } else if (sourceOutput?.type === "image" || sourceOutput?.type === "group") {
      buttons.forEach((button) => {
        button.hidden = !["generator", "llm", "comfy", "loop"].includes(button.dataset.connectNode);
      });
    }
  }
  menu.style.left = `${localX}px`;
  menu.style.top = `${localY}px`;
  menu.hidden = false;
  setCanvasStatus("选择要创建并连接的新节点。");
}

function hideCanvasConnectMenu() {
  const menu = document.querySelector("#canvasConnectMenu");
  if (menu) menu.hidden = true;
  canvasState.connectMenu = null;
}

function createCanvasMidjourneyOptions(node, preferred = {}) {
  const container = document.createElement("div");
  container.className = "canvas-midjourney-options midjourney-options";
  const fields = [
    ["version", "Version", "select", "canvas-midjourney-version"],
    ["mode", "Mode", "select", "canvas-midjourney-mode"],
    ["speed", "Speed", "select", "canvas-midjourney-speed"],
    ["quality", "Quality", "select", "canvas-midjourney-quality"],
    ["style", "Style", "select", "canvas-midjourney-style"],
    ["stylize", "Stylize", "input", "canvas-midjourney-stylize"],
  ];
  fields.forEach(([field, labelText, type, className]) => {
    const label = document.createElement("label");
    const title = document.createElement("span");
    title.textContent = ({ version: "版本", mode: "模式", speed: "速度", quality: "画质", style: "风格", stylize: "风格化" })[field] || labelText;
    if (field === "quality") label.dataset.midjourneyQualityField = "";
    const input = document.createElement(type);
    input.className = className;
    input.dataset.midjourneyField = field;
    if (field === "stylize") {
      input.type = "number";
      input.min = "0";
      input.max = "1000";
      input.step = "1";
    }
    label.append(title, input);
    container.append(label);
  });
  const version = getMidjourneyField(container, "version");
  MIDJOURNEY_STANDARD_VERSIONS.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = "V" + value;
    version.append(option);
  });
  const mode = getMidjourneyField(container, "mode");
  [
    ["standard", "Standard"],
    ["niji", "Niji"],
  ].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    mode.append(option);
  });
  const speed = getMidjourneyField(container, "speed");
  [["relax", "Relax"], ["fast", "Fast"], ["turbo", "Turbo"]].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    speed.append(option);
  });
  const quality = getMidjourneyField(container, "quality");
  [["sd", "SD"], ["hd", "HD"]].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    quality.append(option);
  });
  const style = getMidjourneyField(container, "style");
  [["raw", "Raw"], ["standard", "Standard"]].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    style.append(option);
  });
  const stylize = getMidjourneyField(container, "stylize");
  stylize.value = String(preferred.stylize ?? MIDJOURNEY_DEFAULT_OPTIONS.stylize);
  container.querySelectorAll("select, input").forEach((input) => {
    input.addEventListener("change", () => syncCanvasMidjourneyOptions(node, node.querySelector(".canvas-node-model")?.value || node.dataset.canvasModel || ""));
    input.addEventListener("input", () => {
      const options = readMidjourneyOptions(container);
      node.dataset.canvasMidjourneyVersion = options.version;
      node.dataset.canvasMidjourneyMode = options.mode;
      node.dataset.canvasMidjourneySpeed = options.speed;
      node.dataset.canvasMidjourneyQuality = options.quality;
      node.dataset.canvasMidjourneyStyle = options.style;
      node.dataset.canvasMidjourneyStylize = String(options.stylize);
      scheduleCanvasSave();
    });
  });
  return container;
}

function syncCanvasMidjourneyOptions(node, model, preferred = {}) {
  const container = node?.querySelector(".canvas-midjourney-options");
  if (!container) return;
  syncMidjourneyControls(container, model, preferred);
  const options = readMidjourneyOptions(container);
  node.dataset.canvasMidjourneyVersion = options.version;
  node.dataset.canvasMidjourneyMode = options.mode;
  node.dataset.canvasMidjourneySpeed = options.speed;
  node.dataset.canvasMidjourneyQuality = options.quality;
  node.dataset.canvasMidjourneyStyle = options.style;
  node.dataset.canvasMidjourneyStylize = String(options.stylize);
}

function fillCanvasNodeModelSelect(select, preferred) {
  const imageModels = Array.from(imageModelInput.options || []).map((option) => ({
    value: option.value,
    label: option.textContent || option.value,
  }));
  if (!imageModels.length) {
    const fallback = document.createElement("option");
    fallback.value = imageModelInput.value || "gpt-image-1";
    fallback.textContent = getModelDisplayName(fallback.value);
    select.append(fallback);
    return;
  }
  select.innerHTML = "";
  imageModels.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    select.append(option);
  });
  select.value = imageModels.some((item) => item.value === preferred) ? preferred : (imageModels[0]?.value || "");
}

function refreshCanvasImageModelSelects() {
  document.querySelectorAll("#canvasPlane .canvas-node-image:not([data-upload-only='true']) .canvas-node-model").forEach((select) => {
    const node = select.closest(".canvas-node");
    const current = node?.dataset.canvasModel || select.value || imageModelInput.value || "";
    fillCanvasNodeModelSelect(select, current);
    if (node) node.dataset.canvasModel = select.value;
    const size = node?.querySelector(".canvas-node-size");
    if (size) {
      fillCanvasNodeSizeSelect(size, node.dataset.canvasSize || size.value, select.value);
      node.dataset.canvasSize = size.value;
    }
    const resolution = node?.querySelector(".canvas-node-resolution");
    if (resolution) {
      fillCanvasNodeResolutionSelect(resolution, node.dataset.canvasResolution || resolution.value, select.value, size?.value || node?.dataset.canvasSize);
      node.dataset.canvasResolution = resolution.value;
    }
    if (node) {
      updateCanvasNodeResolutionAvailability(node);
      syncCanvasMidjourneyOptions(node, select.value);
    }
    const run = node?.querySelector(".canvas-node-run");
    if (run) updateCanvasRunButtonLabel(run, select.value);
  });
}

function fillCanvasNodeSizeSelect(select, preferred, model = imageModelInput.value) {
  const sizes = getImageSizePresets(model);
  const preferredValue = normalizeImageSizeChoiceForModel(preferred, model);
  const fallbackSizes = sizes.length ? sizes : [
    { value: "auto", label: "Auto" },
    { value: "1024x1024", label: "1:1" },
    { value: "1024x1536", label: "2:3" },
    { value: "1536x1024", label: "3:2" },
    { value: "1024x1792", label: "9:16" },
    { value: "1792x1024", label: "16:9" },
  ];
  select.innerHTML = "";
  fallbackSizes.forEach((item) => {
    addImageSizeOption(select, item.value, item.label);
  });
  if (!fallbackSizes.some((item) => item.value === preferredValue) && isOpenAIImageCustomSize(preferredValue, model)) {
    addImageSizeOption(select, preferredValue, "\u81ea\u5b9a\u4e49 " + preferredValue);
  }
  select.value = fallbackSizes.some((item) => item.value === preferredValue) ? preferredValue : fallbackSizes[0].value;
  if (isOpenAIImageCustomSize(preferredValue, model)) select.value = preferredValue;
  select.dataset.previousSize = select.value === "custom" ? (normalizeOpenAIImageCustomSize(preferred, model) || "1024x1024") : select.value;
}

function getImageResolutionChoiceContext(model, size = "auto") {
  return {
    platform: getImageModelPlatform(model),
    family: getImageModelFamily(model),
    ratio: String(size || "auto").trim().toLowerCase(),
    configuredResolutions: getAllowedImageResolutionLevels(model),
  };
}

function getResolutionChoiceExactSize(value) {
  return ImageResolutionRules.parseResolutionChoice(value).exactSize || "";
}

function getResolutionChoiceLevel(value) {
  return ImageResolutionRules.parseResolutionChoice(value).level || normalizeImageResolutionValue(value) || "1";
}

function pickImageResolutionChoiceValue(choices, preferred, context, remembered = "") {
  const items = Array.isArray(choices) ? choices : [];
  const preferredValue = String(preferred || "").trim().toLowerCase();
  const rememberedValue = String(remembered || "").trim().toLowerCase();
  const isStandard = (value) => ["512", "1", "2", "4"].includes(value);
  let nextRemembered = rememberedValue;

  if (context?.platform === "openai" && context?.ratio === "auto") {
    if (isStandard(preferredValue)) nextRemembered = preferredValue;
    const automatic = items.find((item) => item.value === "auto" && !item.disabled);
    return { value: automatic?.value || "", remembered: nextRemembered };
  }

  const candidate = preferredValue === "auto" ? nextRemembered : preferredValue;
  const matched = items.find((item) => item.value === candidate && !item.disabled);
  const fallback = items.find((item) => isStandard(item.value) && !item.disabled)
    || items.find((item) => !item.disabled);
  const value = matched?.value || fallback?.value || "";
  if (isStandard(value)) nextRemembered = value;
  return { value, remembered: nextRemembered };
}

function rememberConcreteImageResolution(select) {
  const value = String(select?.value || "");
  if (["512", "1", "2", "4"].includes(value)) {
    select.dataset.previousConcreteResolution = value;
  }
}

function fillCanvasNodeResolutionSelect(select, preferred, model = imageModelInput.value, size = "auto") {
  const context = getImageResolutionChoiceContext(model, size);
  const choices = ImageResolutionRules.getResolutionChoices(context);
  select.innerHTML = "";
  choices.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    option.disabled = Boolean(item.disabled);
    option.dataset.reason = item.reason || "";
    option.dataset.level = item.level || getResolutionChoiceLevel(item.value);
    select.append(option);
  });
  const picked = pickImageResolutionChoiceValue(
    choices,
    preferred,
    context,
    select.dataset.previousConcreteResolution,
  );
  select.value = picked.value;
  select.dataset.previousConcreteResolution = picked.remembered;
}

function getCanvasNodeResolutionCompatibility(node) {
  const model = node?.querySelector(".canvas-node-model")?.value || node?.dataset.canvasModel || "";
  const sizeSelect = node?.querySelector(".canvas-node-size");
  const size = sizeSelect?.value === "custom"
    ? getCustomSizeFieldValue(node?.querySelector(".canvas-custom-size-field"), model) || node?.dataset.canvasSize || "custom"
    : sizeSelect?.value || node?.dataset.canvasSize || "auto";
  const resolution = node?.querySelector(".canvas-node-resolution");
  if (!supportsSeparateImageResolution(model) || !resolution) {
    return { supported: true, requestedSize: size, level: "auto", reason: "", alternative: null };
  }
  return ImageResolutionRules.getCompatibility({
    ...getImageResolutionChoiceContext(model, size),
    resolution: resolution.value || node?.dataset.canvasResolution || "1",
  });
}

function getDisabledResolutionSummary(select) {
  const disabled = Array.from(select?.options || []).filter((option) => option.disabled);
  if (!disabled.length) return "";
  const reasons = [...new Set(disabled
    .map((option) => option.dataset.reason)
    .filter(Boolean)
    .map((reason) => select?.value === "auto"
      ? reason.replace(/，?请选择“自动尺寸”/g, "")
      : reason))];
  const alternative = Array.from(select.options || []).find((option) => option.value.startsWith("exact:"));
  const message = reasons.join("；");
  return alternative ? `${message}；可选“${alternative.textContent}”` : message;
}

function syncCanvasNodeResolutionState(node) {
  const resolution = node?.querySelector(".canvas-node-resolution");
  const help = node?.querySelector(".canvas-node-resolution-help");
  const run = node?.querySelector(".canvas-node-run");
  if (!resolution) return { supported: true, reason: "" };
  const compatibility = getCanvasNodeResolutionCompatibility(node);
  const hasUnsupported = Array.from(resolution.options || []).some((option) => option.disabled);
  if (help) {
    help.hidden = compatibility.supported && !hasUnsupported;
    help.textContent = compatibility.supported
      ? getDisabledResolutionSummary(resolution)
      : compatibility.reason;
    help.classList.toggle("is-error", !compatibility.supported);
  }
  const isGenerating = node?.dataset.canvasGenerating === "true";
  if (run && !isGenerating) {
    run.disabled = false;
    updateCanvasRunButtonLabel(run, node?.querySelector(".canvas-node-model")?.value || node?.dataset.canvasModel || "");
    run.disabled = !compatibility.supported;
  } else if (run) {
    run.disabled = true;
  }
  return compatibility;
}

function setCanvasImageNodeGenerationState(node, isGenerating) {
  const run = node?.querySelector(".canvas-node-run");
  const active = Boolean(isGenerating);
  node?.classList.toggle("is-generating", active);
  if (active) {
    node.dataset.canvasGenerating = "true";
    pinCanvasNode(node.dataset.id);
  } else if (node?.dataset) {
    delete node.dataset.canvasGenerating;
    syncCanvasNodeModel(node);
    const keepsFocus = node.contains(document.activeElement);
    const keepsSelection = node.classList.contains("is-selected");
    if (!keepsFocus && !keepsSelection) unpinCanvasNode(node.dataset.id);
  }
  if (!run) return;
  if (active) run.setAttribute("aria-busy", "true");
  else run.removeAttribute("aria-busy");
  if (active) {
    run.disabled = true;
    run.textContent = "生成中…";
  }
}

function updateCanvasNodeResolutionAvailability(node) {
  const model = node?.querySelector(".canvas-node-model")?.value || node?.dataset.canvasModel || "";
  const resolution = node?.querySelector(".canvas-node-resolution");
  if (!resolution) return;
  const resolutionVisible = supportsSeparateImageResolution(model);
  resolution.hidden = !resolutionVisible;
  resolution.disabled = !resolutionVisible;
  node?.classList.toggle("canvas-resolution-hidden", !resolutionVisible);
  syncCanvasNodeResolutionState(node);
}

function getCanvasOutputSize(node) {
  const model = node.querySelector(".canvas-node-model")?.value || node.dataset.canvasModel || imageModelInput.value;
  const selectedSize = node.querySelector(".canvas-node-size")?.value || node.dataset.canvasSize || "1024x1024";
  const size = selectedSize === "custom"
    ? getCustomSizeFieldValue(node.querySelector(".canvas-custom-size-field"), model) || node.dataset.canvasSize || "1024x1024"
    : selectedSize;
  const exactSize = isMidjourneyModel(model) ? "" : getResolutionChoiceExactSize(node.querySelector(".canvas-node-resolution")?.value || node.dataset.canvasResolution);
  if (exactSize) return exactSize;
  if (isMidjourneyModel(model)) return size;
  if (isGptImage2LikeModel(model)) {
    return getGptImage2OutputSize(size, node.querySelector(".canvas-node-resolution")?.value || node.dataset.canvasResolution || "1");
  }
  if (size === "auto") return "auto";
  if (getImageModelPlatform(model) === "google") return size;
  return size;
}

function getCanvasResolutionLabel(node) {
  const value = node.querySelector(".canvas-node-resolution")?.value || node.dataset.canvasResolution || "1";
  const option = node.querySelector(`.canvas-node-resolution option[value="${CSS.escape(value)}"]`);
  return option?.textContent || formatImageResolutionLabel(value);
}

function getCanvasPromptWithResolution(node, prompt) {
  const resolution = getCanvasResolutionLabel(node);
  const ratio = getCanvasSizeLabel(node);
  const hints = [];
  if (ratio && ratio !== "Auto") hints.push(`Aspect ratio: ${ratio}.`);
  if (resolution && resolution !== "1K") hints.push(`Target output quality: ${resolution}.`);
  if (!hints.length) return prompt;
  return `${prompt}\n\n${hints.join(" ")} Generate a high-detail image while keeping the requested aspect ratio.`;
}

function getCanvasSizeLabel(node) {
  const value = node.querySelector(".canvas-node-size")?.value || node.dataset.canvasSize || "1024x1024";
  if (value === "custom") return getCustomSizeFieldValue(node.querySelector(".canvas-custom-size-field"), node.querySelector(".canvas-node-model")?.value || node.dataset.canvasModel || imageModelInput.value) || node.dataset.canvasSize || "自定义尺寸";
  const option = node.querySelector(`.canvas-node-size option[value="${CSS.escape(value)}"]`);
  return option?.textContent || value;
}

function getScaledImageSizeByLongEdge(size, resolution) {
  const dimensions = getGptImage2DimensionsByRatio(size, resolution);
  return isValidGptImage2Dimensions(dimensions) ? dimensions.width + "x" + dimensions.height : "";
}

function getGptImage2DimensionsByRatio(size, resolution) {
  const compatibility = ImageResolutionRules.getCompatibility({
    platform: "openai",
    ratio: size,
    resolution,
    configuredResolutions: ["1", "2", "4"],
  });
  const pixels = String(compatibility.requestedSize || "").match(/^(\d+)x(\d+)$/);
  return pixels ? { width: Number(pixels[1]), height: Number(pixels[2]) } : null;
}

function isValidGptImage2Dimensions(dimensions) {
  if (!dimensions) return false;
  return ImageResolutionRules.validateOpenAiDimensions(dimensions.width, dimensions.height).supported;
}

function isGptImage2ResolutionAllowedForSize(size, resolution) {
  return ImageResolutionRules.getCompatibility({
    platform: "openai",
    ratio: size,
    resolution,
    configuredResolutions: ["1", "2", "4"],
  }).supported;
}

function getCanvasSizeRatio(size) {
  const known = {
    "1024x1024": { width: 1, height: 1 },
    "1024x1536": { width: 2, height: 3 },
    "1536x1024": { width: 3, height: 2 },
    "1024x1792": { width: 9, height: 16 },
    "1792x1024": { width: 16, height: 9 },
    "2048x2048": { width: 1, height: 1 },
    "2048x1152": { width: 16, height: 9 },
    "1152x2048": { width: 9, height: 16 },
    "3840x2160": { width: 16, height: 9 },
    "2160x3840": { width: 9, height: 16 },
  };
  const text = String(size || "").trim().toLowerCase();
  if (known[text]) return known[text];
  const ratioMatch = text.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (ratioMatch) {
    const width = Number(ratioMatch[1]);
    const height = Number(ratioMatch[2]);
    return width && height ? { width, height } : null;
  }
  const [width, height] = text.split("x").map(Number);
  if (!width || !height) return null;
  return { width, height };
}

function roundImageEdge(value) {
  return Math.max(16, Math.floor(Number(value || 0) / 16) * 16);
}

function isHighResolutionCanvasRequest(node) {
  const model = node.querySelector(".canvas-node-model")?.value || node.dataset.canvasModel || "";
  const size = node.querySelector(".canvas-node-size")?.value || node.dataset.canvasSize || "auto";
  const level = getEffectiveImageResolutionLevel(model, node.querySelector(".canvas-node-resolution")?.value || node.dataset.canvasResolution || 1, size);
  return getImageResolutionRank(level) >= 4;
}

function getCanvasImageQuality(node) {
  const model = node.querySelector(".canvas-node-model")?.value || node.dataset.canvasModel || "";
  if (!isGptImage2LikeModel(model)) return "auto";
  const size = node.querySelector(".canvas-node-size")?.value || node.dataset.canvasSize || "auto";
  const level = getEffectiveImageResolutionLevel(model, node.querySelector(".canvas-node-resolution")?.value || node.dataset.canvasResolution || 1, size);
  const rank = getImageResolutionRank(level);
  if (rank >= 4) return "high";
  if (rank >= 2) return "medium";
  return "auto";
}

function getCanvasImageResolution(node) {
  const model = node.querySelector(".canvas-node-model")?.value || node.dataset.canvasModel || "";
  if (!supportsSeparateImageResolution(model)) return "auto";
  const size = node.querySelector(".canvas-node-size")?.value || node.dataset.canvasSize || "auto";
  const level = getEffectiveImageResolutionLevel(model, node.querySelector(".canvas-node-resolution")?.value || node.dataset.canvasResolution || 1, size);
  return formatImageResolutionApiValue(level);
}

function isGptImage2CanvasNode(node) {
  return isGptImage2LikeModel(node.querySelector(".canvas-node-model")?.value || node.dataset.canvasModel || "");
}

function connectCanvasNodes(fromId, toId, toPort = "input") {
  if (!fromId || !toId || fromId === toId) {
    setCanvasStatus("请选择另一个图片节点作为目标。");
    return;
  }
  const sourceNode = getCanvasNode(fromId);
  const targetNode = getCanvasNode(toId);
  const sourceOutput = getCanvasNodeOutput(sourceNode);
  const emptyLoopToComfy = sourceNode?.classList.contains("canvas-node-loop")
    && targetNode?.classList.contains("canvas-node-comfy");
  const allowEmptyUploadToInput = sourceNode?.dataset.uploadOnly === "true"
    && (targetNode?.classList.contains("canvas-node-image")
      || targetNode?.classList.contains("canvas-node-llm")
      || targetNode?.classList.contains("canvas-node-comfy")
      || targetNode?.classList.contains("canvas-node-loop"));
  const emptyH3MaterialType = targetNode?.classList.contains("canvas-node-minimax-h3")
    ? sourceNode?.classList.contains("canvas-node-video")
      ? "video"
      : sourceNode?.classList.contains("canvas-node-audio")
        ? "audio"
        : sourceNode?.dataset.uploadOnly === "true"
          ? "image"
          : ""
    : "";
  if (!sourceOutput && !allowEmptyUploadToInput && !emptyLoopToComfy && !emptyH3MaterialType) {
    setCanvasStatus("源节点还没有可连接的内容。");
    return;
  }
  const output = sourceOutput || (emptyLoopToComfy
    ? { type: "loop", name: "循环节点", images: [] }
    : emptyH3MaterialType
      ? { type: emptyH3MaterialType, name: sourceNode?.dataset.mediaName || sourceNode?.dataset.imageName || "H3 参考素材", url: "" }
      : { type: "image", name: sourceNode?.dataset.imageName || "图片节点", url: "" });
  const resolvedPort = toPort === "prompt" ? "input" : toPort;
  if (!getCanvasPortPoint(targetNode, resolvedPort)) {
    setCanvasStatus("这个节点不能接收这种连接。");
    return;
  }
  const compatibility = getCanvasConnectionCompatibility(sourceNode, targetNode, output);
  if (!compatibility.ok) {
    setCanvasStatus(compatibility.message);
    return;
  }
  if (!canvasState.connections.some((item) => item.from === fromId && item.to === toId && (item.toPort || "input") === resolvedPort)) {
    const connection = normalizeVisibleCanvasConnection({ from: fromId, to: toId, toPort: resolvedPort });
    canvasState.connections.push(connection);
    const forward = {
      type: "connection.upsert",
      entityId: connection.id,
      before: null,
      after: cloneCanvasOperationValue(connection),
    };
    recordCanvasUndo({
      label: "连接节点",
      forward: [forward],
      inverse: [{
        type: "connection.delete",
        entityId: connection.id,
        before: cloneCanvasOperationValue(connection),
        after: null,
      }],
    });
    stageCanvasOperation(forward);
  }
  canvasState.pendingConnection = null;
  document.querySelectorAll(".canvas-node.is-connecting").forEach((item) => item.classList.remove("is-connecting"));
  updateCanvasNodeRefs(getCanvasNode(toId));
  syncCanvasTextFromLlmInputs(getCanvasNode(toId));
  renderCanvasConnections();
  setCanvasStatus(compatibility.message || "已连接。");
  scheduleCanvasSave();
}

function getCanvasH3ConnectionCapacity(sourceNode, targetNode, output) {
  if (!targetNode?.classList.contains("canvas-node-minimax-h3")) return { ok: true };
  const sourceId = sourceNode?.dataset.id || "";
  const targetId = targetNode.dataset.id || "";
  if (canvasState.connections.some((item) => item.from === sourceId && item.to === targetId)) return { ok: true };

  let type = "";
  let additional = 0;
  let limit = 0;
  let label = "";
  if (output.type === "image") {
    type = "image";
    additional = output.url ? 1 : 0;
    limit = 9;
    label = "图片";
  } else if (output.type === "group") {
    type = "image";
    additional = (output.images || []).filter((item) => item?.url).length;
    limit = 9;
    label = "图片";
  } else if (output.type === "video") {
    type = "video";
    additional = output.url ? 1 : 0;
    limit = 3;
    label = "视频";
  } else if (output.type === "audio") {
    type = "audio";
    additional = output.url ? 1 : 0;
    limit = 3;
    label = "音频";
  } else {
    return { ok: true };
  }

  const current = getCanvasIncomingItems(targetId).filter((item) => item.type === type && item.url).length;
  return current + additional <= limit
    ? { ok: true }
    : { ok: false, message: `${label}参考最多 ${limit} 个，请先断开多余连接。` };
}

function getCanvasConnectionCompatibility(sourceNode, targetNode, output) {
  if (!sourceNode || !targetNode || !output) return { ok: false, message: "连接内容不可用。" };
  const h3Capacity = getCanvasH3ConnectionCapacity(sourceNode, targetNode, output);
  if (!h3Capacity.ok) return h3Capacity;
  if (output.type === "video-generator") {
    return targetNode.classList.contains("canvas-node-video-output")
      ? { ok: true, message: "已连接，生成结果会更新到视频输出节点。" }
      : { ok: false, message: "MiniMax H3 生成端只能连接到视频输出节点。" };
  }
  if (output.type === "generator") {
    return targetNode.classList.contains("canvas-node-gallery")
      ? { ok: true, message: "已连接，生成结果会追加到图集。" }
      : { ok: false, message: "生成节点只能连接到生成图集节点。" };
  }
  if (output.type === "loop") {
    return targetNode.classList.contains("canvas-node-comfy")
      ? { ok: true, message: "已连接，ComfyUI 会按循环节点里的图片逐张处理。" }
      : { ok: false, message: "循环节点只能连接到 ComfyUI 节点。" };
  }
  if (output.type === "llm") {
    if (targetNode.classList.contains("canvas-node-minimax-h3")) return { ok: true, message: "已连接，LLM 文本会作为视频描述。" };
    return targetNode.classList.contains("canvas-node-text")
      ? { ok: true, message: "已连接，LLM 生成文字会填充到提示词节点。" }
      : { ok: false, message: "LLM 节点只能连接到提示词节点。" };
  }
  if (output.type === "text") {
    if (targetNode.classList.contains("canvas-node-minimax-h3")) {
      return { ok: true, message: "已连接，提示词会作为视频描述。" };
    }
    if (targetNode.classList.contains("canvas-node-llm")) {
      return { ok: true, message: "已连接，提示词会作为 LLM 输入。" };
    }
    if (targetNode.classList.contains("canvas-node-comfy")) {
      return { ok: true, message: "已连接，提示词会作为 ComfyUI 图片编辑描述。" };
    }
    if (targetNode.classList.contains("canvas-node-image") && targetNode.dataset.uploadOnly !== "true" && !targetNode.dataset.imageSrc) {
      return { ok: true, message: "已连接，提示词会填充到生成节点。" };
    }
    return { ok: false, message: "提示词节点只能连接到生成节点或 LLM 节点。" };
  }
  if (output.type === "image" || output.type === "group") {
    if (targetNode.classList.contains("canvas-node-grid-editor")) return { ok: true, message: "已连接宫格来源快照。" };
    if (targetNode.classList.contains("canvas-node-minimax-h3")) return { ok: true, message: "已连接，图片会作为 H3 参考素材。" };
    if (targetNode.classList.contains("canvas-node-llm")) return { ok: true, message: "已连接，图片会作为 LLM 视觉输入。" };
    if (targetNode.classList.contains("canvas-node-comfy")) return { ok: true, message: "已连接，图片会作为 ComfyUI 输入。" };
    if (targetNode.classList.contains("canvas-node-loop")) return { ok: true, message: "已连接，图片会进入循环队列。" };
    if (targetNode.classList.contains("canvas-node-image") && targetNode.dataset.uploadOnly !== "true" && !targetNode.dataset.imageSrc) {
      return { ok: true, message: "已连接，图片会作为生成参考图。" };
    }
    return { ok: false, message: "图片只能连接到生成节点、LLM 节点、循环节点或 ComfyUI 节点。" };
  }
  if (output.type === "video" || output.type === "audio") {
    return targetNode.classList.contains("canvas-node-minimax-h3")
      ? { ok: true, message: `已连接，${output.type === "video" ? "视频" : "音频"}会作为 H3 参考素材。` }
      : { ok: false, message: "视频和音频素材目前只能连接到 MiniMax H3 节点。" };
  }
  return { ok: false, message: "这种节点暂不支持连接。" };
}

function disconnectCanvasNodes(fromId, toId) {
  const removed = canvasState.connections
    .filter((item) => item.from === fromId && item.to === toId)
    .map(normalizeVisibleCanvasConnection);
  canvasState.connections = canvasState.connections.filter((item) => item.from !== fromId || item.to !== toId);
  const forward = removed.map((connection) => ({
    type: "connection.delete",
    entityId: connection.id,
    before: cloneCanvasOperationValue(connection),
    after: null,
  }));
  if (forward.length) {
    recordCanvasUndo({
      label: "断开连接",
      forward,
      inverse: removed.map((connection) => ({
        type: "connection.upsert",
        entityId: connection.id,
        before: null,
        after: cloneCanvasOperationValue(connection),
      })),
    });
    forward.forEach((operation) => stageCanvasOperation(operation));
  }
  updateCanvasNodeRefs(getCanvasNode(toId));
  renderCanvasConnections();
  setCanvasStatus("已断开连接。");
  scheduleCanvasSave();
}

function updateCanvasNodeRefs(node) {
  if (!node) return;
  if (node.classList.contains("canvas-node-minimax-h3")) {
    renderCanvasMinimaxH3References(node);
    syncCanvasMinimaxH3Prompt(node);
  }
  if (node.classList.contains("canvas-node-llm")) {
    renderCanvasLlmImages(node);
    syncCanvasLlmPromptState(node);
  }
  if (node.classList.contains("canvas-node-comfy")) {
    updateCanvasComfyHint(node);
    updateCanvasComfyOutpaintPreview(node);
  }
  if (node.classList.contains("canvas-node-loop")) {
    updateCanvasLoopHint(node);
  }
  if (node.classList.contains("canvas-node-text")) {
    syncCanvasTextFromLlmInputs(node);
  }
  const refs = node.querySelector(".canvas-node-refs");
  if (!refs) return;
  const imageRefs = getCanvasIncomingRefs(node.dataset.id);
  const orderedRefs = applyCanvasRefOrder(node, imageRefs);
  refs.innerHTML = "";
  refs.hidden = !orderedRefs.length;
  orderedRefs.forEach((ref, index) => {
    const thumb = document.createElement("button");
    thumb.type = "button";
    thumb.className = "canvas-ref-thumb";
    thumb.draggable = false;
    thumb.dataset.refKey = ref.key;
    thumb.dataset.index = String(index);
    const img = createDeferredThumbnail(ref.url, ref.name || "参考图");
    const badge = document.createElement("span");
    badge.className = "canvas-ref-index";
    badge.textContent = String(index + 1);
    const label = document.createElement("span");
    label.className = "canvas-ref-label";
    label.textContent = ref.name || "参考图";
    thumb.append(img, badge, label);
    bindCanvasRefPointerSort(thumb, node, ref.key);
    thumb.addEventListener("dragstart", (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer?.setData("text/plain", ref.key);
      event.dataTransfer.effectAllowed = "move";
      thumb.classList.add("is-dragging");
    });
    thumb.addEventListener("dragend", () => thumb.classList.remove("is-dragging"));
    thumb.addEventListener("dragover", (event) => {
      event.preventDefault();
      thumb.classList.add("is-over");
    });
    thumb.addEventListener("dragleave", () => thumb.classList.remove("is-over"));
    thumb.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      thumb.classList.remove("is-over");
      const fromKey = event.dataTransfer?.getData("text/plain");
      reorderCanvasNodeRefs(node, fromKey, ref.key);
    });
    refs.append(thumb);
  });
  syncCanvasPromptFromTextInputs(node);
}

function bindCanvasRefPointerSort(thumb, node, refKey) {
  let start = null;
  let moved = false;
  thumb.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    start = { x: event.clientX, y: event.clientY };
    moved = false;
    thumb.setPointerCapture?.(event.pointerId);
    event.stopPropagation();
  });
  thumb.addEventListener("pointermove", (event) => {
    if (!start) return;
    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (distance < 6) return;
    moved = true;
    thumb.classList.add("is-dragging");
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.(".canvas-ref-thumb");
    node.querySelectorAll(".canvas-ref-thumb.is-over").forEach((item) => {
      if (item !== target) item.classList.remove("is-over");
    });
    if (target && target !== thumb && target.closest(".canvas-node") === node) target.classList.add("is-over");
    event.preventDefault();
  });
  const finish = (event) => {
    if (!start) return;
    thumb.releasePointerCapture?.(event.pointerId);
    thumb.classList.remove("is-dragging");
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.(".canvas-ref-thumb");
    node.querySelectorAll(".canvas-ref-thumb.is-over").forEach((item) => item.classList.remove("is-over"));
    if (moved && target && target !== thumb && target.closest(".canvas-node") === node) {
      reorderCanvasNodeRefs(node, refKey, target.dataset.refKey);
    }
    start = null;
    moved = false;
  };
  thumb.addEventListener("pointerup", finish);
  thumb.addEventListener("pointercancel", finish);
}

function getCanvasIncomingItems(nodeId) {
  return canvasState.connections
    .filter((item) => item.to === nodeId)
    .flatMap((item) => {
      const node = getCanvasNode(item.from);
      const output = getCanvasNodeOutput(node);
      if (!output) return [];
      if (output.type === "group") {
        return (output.images || []).map((image, index) => ({
          ...image,
          type: "image",
          key: `group:${item.from}:${index}`,
        }));
      }
      if (output.type === "loop") {
        return (output.images || []).map((image, index) => ({
          ...image,
          type: "image",
          loopSource: item.from,
          key: `loop:${item.from}:${index}`,
        }));
      }
      if (output.type === "generator") return [];
      return [{
        ...output,
        key: `${output.type}:${item.from}`,
      }];
    })
    .filter(Boolean);
}

function getCanvasIncomingRefs(nodeId) {
  return getCanvasIncomingItems(nodeId).filter((item) => item.type === "image" && item.url);
}

function getCanvasIncomingLoopRefs(nodeId) {
  return getCanvasIncomingItems(nodeId).filter((item) => item.type === "image" && item.url && item.loopSource);
}

function getCanvasIncomingTexts(nodeId) {
  return getCanvasIncomingItems(nodeId)
    .filter((item) => item.type === "text" || item.type === "llm")
    .map((item) => item.text)
    .filter(Boolean);
}

function getCanvasIncomingPromptTexts(nodeId) {
  return getCanvasIncomingItems(nodeId)
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .filter(Boolean);
}

function syncCanvasLlmPromptState(node) {
  if (!node?.classList.contains("canvas-node-llm")) return;
  const promptBox = node.querySelector(".canvas-llm-prompt");
  if (!promptBox) return;
  const hasExternalPrompt = getCanvasIncomingPromptTexts(node.dataset.id).length > 0;
  promptBox.readOnly = hasExternalPrompt;
  promptBox.classList.toggle("is-overridden", hasExternalPrompt);
  promptBox.title = hasExternalPrompt ? "已连接提示词节点，此处内容暂不参与执行" : "";
  const presets = node.querySelector(".canvas-llm-presets");
  presets?.classList.toggle("is-overridden", hasExternalPrompt);
  if (hasExternalPrompt && presets) {
    presets.classList.remove("is-editing");
    const editor = presets.querySelector(".canvas-llm-preset-editor");
    if (editor) editor.hidden = true;
    const addToggle = presets.querySelector(".canvas-llm-preset-add");
    addToggle?.classList.remove("is-open");
    addToggle?.setAttribute("aria-expanded", "false");
  }
  node.querySelectorAll(".canvas-llm-preset-chip, .canvas-llm-preset-delete, .canvas-llm-preset-add, .canvas-llm-preset-save, .canvas-llm-preset-name, .canvas-llm-preset-text")
    .forEach((control) => {
      control.disabled = hasExternalPrompt;
    });
}

function applyCanvasRefOrder(node, refs) {
  const current = Array.from(refs || []);
  const keys = new Set(current.map((ref) => ref.key));
  const order = getCanvasNodeRefOrder(node).filter((key) => keys.has(key));
  current.forEach((ref) => {
    if (!order.includes(ref.key)) order.push(ref.key);
  });
  setCanvasNodeRefOrder(node, order);
  const byKey = new Map(current.map((ref) => [ref.key, ref]));
  return order.map((key) => byKey.get(key)).filter(Boolean);
}

function reorderCanvasNodeRefs(node, fromKey, toKey) {
  if (!fromKey || !toKey || fromKey === toKey) return;
  const refs = getCanvasIncomingRefs(node.dataset.id);
  const order = applyCanvasRefOrder(node, refs).map((ref) => ref.key);
  const fromIndex = order.indexOf(fromKey);
  const toIndex = order.indexOf(toKey);
  if (fromIndex < 0 || toIndex < 0) return;
  const [moved] = order.splice(fromIndex, 1);
  order.splice(toIndex, 0, moved);
  setCanvasNodeRefOrder(node, order);
  updateCanvasNodeRefs(node);
  scheduleCanvasSave();
  setCanvasStatus("已调整参考图顺序。");
}

function getCanvasNodeRefOrder(node) {
  try {
    const order = JSON.parse(node.dataset.refOrder || "[]");
    return Array.isArray(order) ? order.map(String) : [];
  } catch {
    return [];
  }
}

function setCanvasNodeRefOrder(node, order) {
  node.dataset.refOrder = JSON.stringify((Array.isArray(order) ? order : []).map(String));
}

function syncCanvasPromptFromTextInputs(node) {
  if (!node?.classList.contains("canvas-node-image")) return;
  const prompt = node.querySelector(".canvas-node-prompt");
  if (!prompt) return;
  const textPrompts = getCanvasIncomingTexts(node.dataset.id);
  if (!textPrompts.length) {
    if (prompt.dataset.syncedFromText === "true") {
      prompt.value = "";
      prompt.dataset.syncedFromText = "";
    }
    prompt.readOnly = false;
    prompt.classList.remove("is-synced");
    return;
  }
  prompt.value = textPrompts.join("\n");
  prompt.dataset.syncedFromText = "true";
  prompt.readOnly = true;
  prompt.classList.add("is-synced");
}

function syncCanvasTextFromLlmInputs(node) {
  if (!node?.classList.contains("canvas-node-text")) return;
  const text = node.querySelector(".canvas-text");
  if (!text) return;
  const llmTexts = getCanvasIncomingItems(node.dataset.id)
    .filter((item) => item.type === "llm")
    .map((item) => item.text)
    .filter(Boolean);
  if (!llmTexts.length) {
    text.dataset.syncedFromLlm = "";
    return;
  }
  const next = llmTexts.join("\n");
  if (text.textContent !== next) text.textContent = next;
  text.dataset.syncedFromLlm = "true";
}

function getCanvasNodeOutput(node) {
  if (!node) return null;
  if (node.classList.contains("canvas-node-grid-editor")) {
    const state = getCanvasGridEditorState(node);
    if (!state.sourceSrc) return null;
    return {
      type: "grid-editor",
      name: "宫格编辑节点",
      url: state.sourceSrc,
      originalUrl: state.sourceSrc,
    };
  }
  if (node.classList.contains("canvas-node-minimax-h3")) {
    return { type: "video-generator", name: "MiniMax H3 生视频" };
  }
  if (node.classList.contains("canvas-node-video-output")) {
    const active = getCanvasVideoActiveItem(node);
    if (!active?.src) return null;
    return {
      type: "video",
      name: active.name || "视频",
      url: active.src,
      mimeType: active.mimeType || "video/mp4",
      duration: Number(active.duration || 0),
    };
  }
  if (node.classList.contains("canvas-node-video")) {
    const url = node.dataset.videoSrc || "";
    if (!url) return null;
    return {
      type: "video",
      name: node.dataset.mediaName || node.dataset.videoName || "视频",
      url,
      mimeType: node.dataset.mediaMimeType || "video/mp4",
      duration: Number(node.dataset.mediaDuration || 0),
    };
  }
  if (node.classList.contains("canvas-node-audio")) {
    const url = node.dataset.audioSrc || "";
    if (!url) return null;
    return {
      type: "audio",
      name: node.dataset.mediaName || "音频",
      url,
      mimeType: node.dataset.mediaMimeType || "audio/mpeg",
      duration: Number(node.dataset.mediaDuration || 0),
    };
  }
  if (node.classList.contains("canvas-node-image")) {
    const url = node.dataset.resultSrc || node.dataset.imageSrc;
    if (node.dataset.uploadOnly === "true" && !url) return null;
    if (!url) return { type: "generator", name: node.dataset.imageName || "生成节点" };
    return {
      type: "image",
      name: node.dataset.imageName || "参考图",
      url,
      originalUrl: node.dataset.originalSrc || url,
      maskUrl: node.dataset.maskSrc || "",
      maskName: node.dataset.maskName || "",
      openaiMaskUrl: node.dataset.openaiMaskSrc || "",
      openaiMaskName: node.dataset.openaiMaskName || "",
      maskBaseUrl: node.dataset.maskBaseSrc || "",
      maskBaseName: node.dataset.maskBaseName || "",
    };
  }
  if (node.classList.contains("canvas-node-text")) {
    const text = node.querySelector(".canvas-text")?.textContent?.trim();
    if (!text) return null;
    return {
      type: "text",
      text,
    };
  }
  if (node.classList.contains("canvas-node-llm")) {
    return {
      type: "llm",
      text: node.dataset.llmOutput || "",
    };
  }
  if (node.classList.contains("canvas-node-comfy")) {
    return {
      type: "generator",
      name: "ComfyUI节点",
    };
  }
  if (node.classList.contains("canvas-node-loop")) {
    const images = getCanvasIncomingRefs(node.dataset.id);
    if (!images.length) return null;
    return {
      type: "loop",
      name: "循环节点",
      images,
    };
  }
  if (node.classList.contains("canvas-node-group")) {
    const images = getCanvasGroupImages(node);
    if (!images.length) return null;
    return {
      type: "group",
      name: node.dataset.groupTitle || "图片组",
      images,
    };
  }
  if (node.classList.contains("canvas-node-gallery")) {
    const image = getCanvasGalleryActiveImage(node);
    const url = image?.savedUrl || image?.src || image?.url;
    if (!url) return null;
    return {
      type: "image",
      name: image.name || "生成图",
      url,
      originalUrl: image.src || image.url || url,
    };
  }
  return null;
}

async function prepareOpenAIEditRefs(refs, model) {
  if (getImageModelPlatform(model) === "google") return refs;
  const prepared = [];
  for (const ref of refs) {
    if (!ref?.maskUrl) {
      prepared.push(ref);
      continue;
    }
    const next = { ...ref };
    const maskImage = await loadImageElement(ref.maskUrl);
    const maskWidth = maskImage.naturalWidth || maskImage.width || 0;
    const maskHeight = maskImage.naturalHeight || maskImage.height || 0;
    if (!maskWidth || !maskHeight) {
      prepared.push(next);
      continue;
    }
    if (!next.openaiMaskUrl) {
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = maskWidth;
      maskCanvas.height = maskHeight;
      maskCanvas.getContext("2d").drawImage(maskImage, 0, 0, maskWidth, maskHeight);
      const baseName = (ref.maskName || ref.name || "openai-edit").replace(/\.[^.]+$/, "");
      const openaiMaskName = baseName + "-openai-mask.png";
      const openaiMaskBlob = await createOpenAIEditMaskPngBlob(maskCanvas, maskWidth, maskHeight);
      next.openaiMaskUrl = await uploadCanvasImageFile(new File([openaiMaskBlob], openaiMaskName, { type: "image/png" }));
      next.openaiMaskName = openaiMaskName;
    }
    if (!next.maskBaseUrl || !String(next.maskBaseName || "").includes("openai-edit-input")) {
      const baseImage = await loadImageElement(ref.originalUrl || ref.url);
      const baseName = (ref.name || "openai-edit-input").replace(/\.[^.]+$/, "") + "-openai-edit-input.png";
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = maskWidth;
      maskCanvas.height = maskHeight;
      maskCanvas.getContext("2d").drawImage(maskImage, 0, 0, maskWidth, maskHeight);
      const baseBlob = await createOpenAIEditInputPngBlob(baseImage, maskCanvas, maskWidth, maskHeight);
      next.maskBaseUrl = await uploadCanvasImageFile(new File([baseBlob], baseName, { type: "image/png" }));
      next.maskBaseName = baseName;
    }
    prepared.push(next);
  }
  return prepared;
}

function waitForCanvasImageJobPoll(delay = CANVAS_IMAGE_JOB_POLL_MS) {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function assertCanvasImageJobScope(job, node, guard) {
  guard?.assertActive();
  const activeBoardId = String(canvasState.activeBoardId || "");
  const nodeId = String(node?.dataset?.id || "");
  if (!node?.isConnected || String(job?.boardId || "") !== activeBoardId || String(job?.nodeId || "") !== nodeId) {
    const error = new Error("生图任务不属于当前画布或节点，已停止接收其结果。");
    error.code = "scope_mismatch";
    throw error;
  }
}

function syncCanvasImageJobProgress(node, job) {
  if (!node || !job) return;
  const previousJobId = String(node.dataset.imageJobId || "");
  const previousState = String(node.dataset.imageJobState || "");
  node.dataset.imageJobId = String(job.id || node.dataset.imageJobId || "");
  node.dataset.imageJobState = String(job.state || "unknown");
  if (CANVAS_IMAGE_JOB_ACTIVE_STATES.has(job.state)) {
    setCanvasImageNodeGenerationState(node, true);
    setCanvasNodeStatus(node, job.state === "queued" ? "已提交，等待图片服务…" : "图片生成中…");
  }
  if (previousJobId !== node.dataset.imageJobId || previousState !== node.dataset.imageJobState) scheduleCanvasSave();
}

async function createCanvasImageJob(requestBody, node, guard) {
  guard?.assertActive();
  const boardId = String(canvasState.activeBoardId || "");
  const nodeId = String(node?.dataset?.id || "");
  if (!boardId || !nodeId) throw new Error("当前画布或节点无效，无法创建生图任务。");
  let response;
  try {
    response = await fetch(IMAGE_JOBS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...requestBody, board_id: boardId, node_id: nodeId }),
    });
  } catch (cause) {
    const error = new Error("创建生图任务时连接中断，无法确认服务端是否已经受理；为避免重复扣费，系统不会自动重新提交。");
    error.code = "image_job_result_unknown";
    error.cause = cause;
    throw error;
  }
  guard?.assertActive();
  const data = await response.json().catch(() => ({}));
  if (response.ok && !data?.job?.id) {
    const error = new Error("生图任务已发送，但服务端没有返回任务编号；为避免重复扣费，系统不会自动重新提交。");
    error.code = "image_job_result_unknown";
    throw error;
  }
  if (!response.ok) {
    throw new Error(data.error?.message || data.message || data.error || `${response.status} ${response.statusText}`);
  }
  assertCanvasImageJobScope(data.job, node, guard);
  syncCanvasImageJobProgress(node, data.job);
  return data.job;
}

async function waitForCanvasImageJob(jobId, node, options = {}) {
  const guard = options.guard || null;
  let deadlineAt = Number(options.deadlineAt || 0);
  let consecutiveNetworkErrors = 0;
  while (jobId) {
    guard?.assertActive();
    let response;
    let data;
    try {
      response = await fetch(`${IMAGE_JOBS_API_URL}/${encodeURIComponent(jobId)}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      data = await response.json().catch(() => ({}));
      consecutiveNetworkErrors = 0;
    } catch (error) {
      consecutiveNetworkErrors += 1;
      if (deadlineAt && Date.now() > deadlineAt + 60_000) {
        const unavailable = new Error("暂时无法查询生图任务状态。任务记录已保留，恢复连接后可继续查看；系统不会重复提交。");
        unavailable.code = "image_job_result_unknown";
        throw unavailable;
      }
      await waitForCanvasImageJobPoll(Math.min(5000, CANVAS_IMAGE_JOB_POLL_MS * consecutiveNetworkErrors));
      continue;
    }
    if (!response.ok || !data?.job) {
      const error = new Error(data.error?.message || data.message || data.error || `${response.status} ${response.statusText}`);
      error.code = response.status === 404 ? "image_job_not_found" : "image_job_status_failed";
      throw error;
    }
    const job = data.job;
    if (!deadlineAt && job.deadlineAt) deadlineAt = Date.parse(job.deadlineAt) || 0;
    assertCanvasImageJobScope(job, node, guard);
    syncCanvasImageJobProgress(node, job);
    if (!CANVAS_IMAGE_JOB_ACTIVE_STATES.has(job.state)) return job;
    await waitForCanvasImageJobPoll();
  }
  throw new Error("生图任务编号无效。");
}

function createCanvasImageJobTerminalError(job) {
  const error = new Error(job?.error || "图片生成任务未完成。");
  error.code = String(job?.code || (job?.state === "unknown" ? "image_job_result_unknown" : "image_job_failed"));
  error.imageJobState = String(job?.state || "unknown");
  return error;
}

function commitCanvasImageJobResult(node, job, prompt, fallback, guard) {
  assertCanvasImageJobScope(job, node, guard);
  const data = job?.result || {};
  const [returnedImage] = extractImages(data);
  if (!returnedImage) throw new Error("empty-image-response");
  if (node.dataset.imageJobCommittedId === job.id) {
    return { ok: true, image: returnedImage, gallery: null, model: data.model || job.model, ...(fallback ? { fallback } : {}) };
  }
  const appended = appendCanvasGenerationToGallery(node, returnedImage);
  node.dataset.imageJobCommittedId = String(job.id || "");
  node.dataset.imageJobState = "completed";
  void saveImageHistory(`画布编辑：${prompt}`, [returnedImage], data.model || job.model, "canvas").catch(() => {
    // History is secondary: a returned image already committed to the canvas must remain successful.
  });
  const size = getCanvasOutputSize(node);
  const sizeNote = getImageSizeNote(size, [returnedImage]);
  const sizeMismatch = hasImageSizeMismatch(size, [returnedImage]);
  setCanvasNodeStatus(node, sizeNote ? `${sizeMismatch ? "尺寸不一致" : "完成"} · ${sizeNote}` : "完成");
  refreshCanvasConnectedNodes(node.dataset.id);
  scheduleCanvasSave();
  return { ok: true, image: returnedImage, gallery: appended?.gallery || null, model: data.model || job.model, ...(fallback ? { fallback } : {}) };
}

async function resumeCanvasImageNodeJob(node) {
  const jobId = String(node?.dataset?.imageJobId || "");
  if (!jobId || !CANVAS_IMAGE_JOB_ACTIVE_STATES.has(node.dataset.imageJobState)) return null;
  setCanvasImageNodeGenerationState(node, true);
  try {
    const job = await waitForCanvasImageJob(jobId, node);
    if (job.state === "completed") {
      return commitCanvasImageJobResult(
        node,
        job,
        node.querySelector(".canvas-node-prompt")?.value || "",
        null,
        null,
      );
    }
    throw createCanvasImageJobTerminalError(job);
  } catch (error) {
    if (String(error?.code || "") === "scope_mismatch") return null;
    const safeError = getSafeCanvasImageGenerationError(error);
    setCanvasNodeStatus(node, `失败：${safeError.error}`);
    return safeError;
  } finally {
    if (!CANVAS_IMAGE_JOB_ACTIVE_STATES.has(node?.dataset?.imageJobState)) {
      setCanvasImageNodeGenerationState(node, false);
      syncCanvasNodeResolutionState(node);
    }
  }
}

async function runCanvasImageEdit(node, options) {
  const guard = options?.guard || null;
  const autoFailover = options?.autoFailover === true;
  guard?.assertActive();
  syncCanvasPromptFromTextInputs(node);
  const prompt = node.querySelector(".canvas-node-prompt")?.value.trim();
  let activeModel = node.querySelector(".canvas-node-model")?.value;
  const refs = getCanvasIncomingRefs(node.dataset.id);
  if (!prompt) {
    setCanvasNodeStatus(node, "请输入提示词");
    return { ok: false, code: "prompt_required", error: "请输入提示词" };
  }
  if (!activeModel) {
    setCanvasNodeStatus(node, "请选择模型");
    return { ok: false, code: "model_required", error: "请选择模型" };
  }
  if (!refs.length && node.dataset.imageSrc) refs.push({ name: node.dataset.imageName || "当前图片", url: node.dataset.imageSrc });

  const runButton = node.querySelector(".canvas-node-run");
  setCanvasImageNodeGenerationState(node, true);
  setCanvasNodeStatus(node, "编辑中...");
  const attemptedModelIds = new Set();
  let fallback = null;
  try {
    if (autoFailover) {
      const prepared = await prepareCanvasImageNodeCandidate(node, {
        refs,
        size: getCanvasOutputSize(node),
        resolution: getCanvasImageResolution(node),
        guard,
      });
      if (prepared.switched && prepared.candidate?.id) {
        const previousModel = activeModel;
        activeModel = prepared.candidate.id;
        fallback = { from: previousModel, to: activeModel, reason: "preflight" };
        setCanvasNodeStatus(node, "原接口状态异常，已切换到健康的备用接口生成...");
      }
    }
    while (activeModel) {
      guard?.assertActive();
      if (node.querySelector(".canvas-node-size")?.value === "custom" && !applyCanvasCustomImageSize(node)) {
        setCanvasNodeStatus(node, "自定义尺寸不符合 OpenAI 规则");
        return { ok: false, code: "invalid_size", error: "自定义尺寸不符合 OpenAI 规则" };
      }
      const compatibility = syncCanvasNodeResolutionState(node);
      if (!compatibility.supported) {
        setCanvasNodeStatus(node, compatibility.reason);
        return { ok: false, code: "unsupported_resolution", error: compatibility.reason };
      }

      const size = getCanvasOutputSize(node);
      const resolution = getCanvasImageResolution(node);
      const requestPrompt = isMidjourneyModel(activeModel) ? prompt : getCanvasPromptWithResolution(node, prompt);
      let requestRefs;
      try {
        requestRefs = isMidjourneyModel(activeModel) ? refs : await prepareOpenAIEditRefs(refs, activeModel);
      } catch (error) {
        const safeError = getSafeCanvasImageGenerationError(error, "reference_prepare_failed");
        setCanvasNodeStatus(node, `失败：${safeError.error}`);
        return safeError;
      }
      guard?.assertActive();
      attemptedModelIds.add(activeModel);
      let returnedImage = null;
      try {
        const requestBody = { model: activeModel, prompt: requestPrompt, size, n: 1, reference_images: requestRefs };
        if (isMidjourneyModel(activeModel)) Object.assign(requestBody, getMidjourneyPayload(node.querySelector(".canvas-midjourney-options")));
        else Object.assign(requestBody, { quality: getCanvasImageQuality(node), resolution });
        const createdJob = await createCanvasImageJob(requestBody, node, guard);
        const completedJob = await waitForCanvasImageJob(createdJob.id, node, {
          guard,
          deadlineAt: Date.parse(createdJob.deadlineAt) || 0,
        });
        if (completedJob.state !== "completed") throw createCanvasImageJobTerminalError(completedJob);
        returnedImage = extractImages(completedJob.result || {})[0] || null;
        return commitCanvasImageJobResult(node, completedJob, prompt, fallback, guard);
      } catch (error) {
        if (["scope_expired", "scope_mismatch"].includes(String(error?.code || ""))) throw error;
        const safeError = returnedImage
          ? { ok: false, code: "gallery_update_failed", error: "图片已经生成，但暂时没有写入图集。", image: returnedImage }
          : getSafeCanvasImageGenerationError(error);
        if (autoFailover && !returnedImage && (isCanvasImageFailoverError(safeError) || safeError.code === "generation_timeout")) {
          const nextCandidate = await resolveCanvasImageFailoverCandidate({
            currentModel: activeModel,
            refs,
            size,
            resolution,
            attemptedModelIds: [...attemptedModelIds],
          });
          guard?.assertActive();
          if (nextCandidate && applyCanvasImageCandidate(node, nextCandidate)) {
            const previousModel = activeModel;
            activeModel = nextCandidate.id;
            fallback ||= { from: previousModel, to: activeModel, reason: safeError.code };
            if (safeError.code === "generation_timeout") {
              safeError.error = `${safeError.error}；已为该节点切换到健康的备用接口，继续任务时将使用备用接口。`;
              setCanvasNodeStatus(node, `失败：${safeError.error}`);
              return { ...safeError, fallback };
            }
            setCanvasNodeStatus(node, "当前接口无法受理，已自动切换备用接口继续生成...");
            continue;
          }
          safeError.error = `${safeError.error}；系统已自动检查同模型备用接口，但没有可继续的可用接口。`;
        }
        setCanvasNodeStatus(node, `失败：${safeError.error}`);
        return safeError;
      }
    }
    return { ok: false, code: "model_required", error: "请选择模型" };
  } finally {
    if (CANVAS_IMAGE_JOB_ACTIVE_STATES.has(node?.dataset?.imageJobState)) {
      setCanvasImageNodeGenerationState(node, true);
      if (guard) queueMicrotask(() => resumeCanvasImageNodeJob(node));
    } else {
      setCanvasImageNodeGenerationState(node, false);
      if (runButton) syncCanvasNodeResolutionState(node);
    }
  }
}

async function runCanvasLlmNode(node, options) {
  const guard = options?.guard || null;
  guard?.assertActive();
  const ownPrompt = node.querySelector(".canvas-llm-prompt")?.value.trim();
  const incomingPrompts = getCanvasIncomingPromptTexts(node.dataset.id);
  const prompt = incomingPrompts.length ? incomingPrompts.join("\n") : ownPrompt;
  const model = node.querySelector(".canvas-llm-model")?.value;
  if (!prompt) {
    setCanvasNodeStatus(node, "请输入要求");
    return;
  }
  if (!model) {
    setCanvasNodeStatus(node, "请选择模型");
    return;
  }
  const runButton = node.querySelector(".canvas-llm-run");
  if (runButton) {
    runButton.disabled = true;
    runButton.textContent = "生成中";
  }
  setCanvasNodeStatus(node, "生成中...");
  try {
    const images = await getCanvasLlmVisionImages(node);
    guard?.assertActive();
    const response = await fetch(CHAT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{
          role: "user",
          content: buildCanvasLlmMessageContent(prompt, images),
        }],
      }),
    });
    guard?.assertActive();
    const data = await response.json().catch(() => ({}));
    guard?.assertActive();
    if (!response.ok) throw new Error(data.error?.message || data.message || data.error || `${response.status} ${response.statusText}`);
    const content = extractChatText(data);
    if (!content) throw new Error("接口返回成功，但没有找到文字内容。");
    guard?.assertActive();
    node.dataset.llmPrompt = ownPrompt || "";
    node.dataset.llmModel = model;
    node.dataset.llmOutput = content;
    fillOrCreatePromptNodeFromLlm(node, content);
    setCanvasNodeStatus(node, "完成");
    refreshCanvasConnectedNodes(node.dataset.id);
    scheduleCanvasSave();
  } catch (error) {
    setCanvasNodeStatus(node, `失败：${error.message}`);
  } finally {
    if (runButton) {
      runButton.disabled = false;
      runButton.textContent = "生成文字";
    }
  }
}

async function runCanvasComfyNode(node, options) {
  const guard = options?.guard || null;
  guard?.assertActive();
  const mode = node.querySelector(".canvas-comfy-mode")?.value || node.dataset.comfyMode || "upscale2";
  const ttpResolution = Number(node.querySelector(".canvas-comfy-resolution")?.value || node.dataset.comfyResolution || 2048);
  const refs = applyCanvasRefOrder(node, getCanvasIncomingRefs(node.dataset.id)).filter((ref) => ref.url);
  const loopRefs = mode === "shoe-swap" ? [] : applyCanvasRefOrder(node, getCanvasIncomingLoopRefs(node.dataset.id)).filter((ref) => ref.url);
  const required = mode === "shoe-swap" ? 2 : 1;
  if (refs.length < required) {
    setCanvasNodeStatus(node, mode === "shoe-swap" ? "请连接人物图和鞋子图" : "请连接一张图片");
    return;
  }

  const runButton = node.querySelector(".canvas-comfy-run");
  if (runButton) {
    runButton.disabled = true;
    runButton.textContent = "执行中";
  }
  setCanvasNodeStatus(node, "提交 ComfyUI...");

  try {
    const apiUrl = ({
      "shoe-swap": SHOE_SWAP_API_URL,
      upscale: UPSCALE_API_URL,
      outpaint: OUTPAINT_API_URL,
      outpaint2: RUNNINGHUB_OUTPAINT_API_URL,
      "flux2-klein-edit": FLUX2_KLEIN_EDIT_API_URL,
      "qwen-edit-angle": QWEN_EDIT_ANGLE_API_URL,
    })[mode] || UPSCALE2_API_URL;
    const queue = loopRefs.length ? loopRefs : (mode === "shoe-swap" ? [refs[0]] : [refs[0]]);
    const images = [];
    for (const [index, ref] of queue.entries()) {
      guard?.assertActive();
      setCanvasNodeStatus(node, loopRefs.length ? `提交第 ${index + 1}/${queue.length} 张...` : "提交 ComfyUI...");
      let body = mode === "shoe-swap"
        ? {
          person_image: refs[0].url,
          person_name: refs[0].name || "person.png",
          shoe_image: refs[1].url,
          shoe_name: refs[1].name || "shoe.png",
          image_size: "2K",
        }
        : {
          image: ref.url,
          name: ref.name || `loop_${index + 1}.png`,
          ...(["upscale", "upscale2"].includes(mode) ? { resolution: ttpResolution } : {}),
        };
      if (mode === "outpaint") {
        const expandedInput = await createOutpaintAlphaInput(ref.url, getCanvasComfyPadding(node));
        body = {
          image: expandedInput.dataUrl,
          name: "canvas_outpaint_alpha_input.png",
          alphaMaskInput: true,
          direction: "custom",
          ...expandedInput.padding,
        };
      } else if (mode === "outpaint2") {
        body = {
          image: ref.url,
          name: ref.name || "runninghub_outpaint_input.png",
          direction: "custom",
          ...getCanvasComfyPadding(node),
          prompt: "自然延展原图画面，保持原图主体、场景、光线、色调、材质、构图和透视一致，只补全扩展区域，不改变原图内容。",
        };
      } else if (mode === "flux2-klein-edit") {
        if (ref.maskUrl && String(ref.maskUrl).startsWith("data:")) {
          throw new Error("遮罩还没有保存成文件，请重新打开遮罩并点击保存。");
        }
        const comfyMaskUrl = ref.maskUrl ? await createFlux2ComfyMaskDataUrl(ref.maskUrl) : "";
        body = {
          image: ref.originalUrl || ref.url,
          name: ref.name || "flux2_klein_input.png",
          ...(comfyMaskUrl ? { mask_image: comfyMaskUrl, mask_name: ref.maskName || "flux2_klein_mask.png" } : {}),
          prompt: getCanvasIncomingPromptTexts(node.dataset.id).join("\n") || "\u4fdd\u6301\u4e3b\u4f53\u6784\u56fe\u3001\u6750\u8d28\u3001\u989c\u8272\u548c\u4f4d\u7f6e\u81ea\u7136\u4e00\u81f4\uff0c\u53ea\u6309\u63d0\u793a\u8fdb\u884c\u56fe\u7247\u7f16\u8f91\u3002",
        };
      } else if (mode === "qwen-edit-angle") {
        const angle = getCanvasComfyQwenAngle(node);
        body = {
          image: ref.originalUrl || ref.url,
          name: ref.name || "qwen_angle_input.png",
          horizontal_angle: angle.horizontal,
          vertical_angle: angle.vertical,
          zoom: angle.zoom,
        };
      }

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      guard?.assertActive();
      const data = await response.json().catch(() => ({}));
      guard?.assertActive();
      if (!response.ok || data.error) throw new Error(data.error || data.message || `${response.status} ${response.statusText}`);
      if (!data.task_id) throw new Error("后端没有返回 ComfyUI 任务 ID。");

      const task = await waitForUpscaleTask(data.task_id, (value, message) => {
        const prefix = loopRefs.length ? `第 ${index + 1}/${queue.length} 张 · ` : "";
        setCanvasNodeStatus(node, `${prefix}${message || `ComfyUI处理中 ${Math.round(value || 0)}%`}`);
      });
      guard?.assertActive();
      const taskImages = (task.images || []).map((url) => ({ src: url, savedUrl: url })).filter((item) => item.src);
      if (!taskImages.length) throw new Error("ComfyUI \u6ca1\u6709\u8fd4\u56de\u56fe\u7247\u3002");
      taskImages.forEach((image) => appendCanvasGenerationToGallery(node, image));
      images.push(...taskImages);
    }
    if (!images.length) throw new Error("ComfyUI 没有返回图片。");
    const modeName = ({
      "shoe-swap": "\u753b\u5e03\u6362\u978b",
      upscale: "\u753b\u5e03\u653e\u5927",
      outpaint: "\u753b\u5e03\u6269\u56fe",
      outpaint2: "\u753b\u5e03\u6269\u56fe2",
      "flux2-klein-edit": "Flux2 Klein \u56fe\u7247\u7f16\u8f91",
      "qwen-edit-angle": "Qwen \u89d2\u5ea6\u5207\u6362",
    })[mode] || "\u753b\u5e03\u653e\u59272";
    const historyModel = ({
      "shoe-swap": "\u6362\u978b / ComfyUI",
      upscale: "TTP / ComfyUI",
      outpaint: "Z-Image\u6269\u56fe / ComfyUI",
      outpaint2: "RunningHub\u6269\u56fe\u5de5\u4f5c\u6d41",
      "flux2-klein-edit": "Flux2 Klein / ComfyUI",
      "qwen-edit-angle": "Qwen Edit \u89d2\u5ea6\u5207\u6362 / ComfyUI",
    })[mode] || "SeedVR2 / ComfyUI";
    await saveImageHistory(`${modeName}：${refs[0].name || "图片"}`, images, historyModel, "canvas");
    guard?.assertActive();
    setCanvasNodeStatus(node, "完成");
    refreshCanvasConnectedNodes(node.dataset.id);
    scheduleCanvasSave();
  } catch (error) {
    setCanvasNodeStatus(node, `失败：${error.message}`);
  } finally {
    if (runButton) {
      runButton.disabled = false;
      runButton.textContent = "执行";
    }
  }
}

function buildCanvasLlmMessageContent(prompt, images) {
  if (!images.length) return prompt;
  return [
    { type: "text", text: prompt },
    ...images.map((image) => ({
      type: "image_url",
      image_url: { url: image.value || image.url },
    })),
  ];
}

async function getCanvasLlmVisionImages(node) {
  const uploaded = getCanvasLlmImages(node)
    .map((image) => ({ name: image.name || "上传图片", value: image.value || image.url }))
    .filter((image) => image.value);
  const incoming = getCanvasIncomingRefs(node.dataset.id);
  const converted = [];
  for (const ref of incoming) {
    if (!ref.url) continue;
    const value = ref.url.startsWith("data:") ? ref.url : await imageUrlToDataUrl(ref.url);
    converted.push({ name: ref.name || "参考图", value });
  }
  return [...uploaded, ...converted];
}

function fillOrCreatePromptNodeFromLlm(node, content) {
  let targets = canvasState.connections
    .filter((item) => item.from === node.dataset.id)
    .map((item) => getCanvasNode(item.to))
    .filter((target) => target?.classList.contains("canvas-node-text"));

  if (!targets.length) {
    const point = {
      x: Number(node.dataset.x || 0) + (Number(node.dataset.width || node.offsetWidth || 292) || 292) + 90,
      y: Number(node.dataset.y || 0),
    };
    const promptNode = addCanvasText(point, { text: content, focus: false });
    connectCanvasNodes(node.dataset.id, promptNode.dataset.id, "input");
    targets = [promptNode];
  }

  targets.forEach((target) => {
    const text = target.querySelector(".canvas-text");
    if (text) text.textContent = content;
    syncCanvasTextFromLlmInputs(target);
    refreshCanvasConnectedNodes(target.dataset.id);
  });
}

function extractChatText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    return content
      .map((part) => typeof part === "string" ? part : (part.text || part.content || ""))
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  if (typeof content === "string") return content.trim();
  return String(data?.output_text || "").trim();
}

function updateCanvasGenerationResult(node, image) {
  const src = typeof image === "string" ? image : image?.src;
  const savedUrl = typeof image === "string" ? image : image?.savedUrl || image?.src;
  if (!src) return;
  node.dataset.resultSrc = src;
  node.dataset.resultDownloadUrl = savedUrl || src;
  node.dataset.imageName = "编辑结果";
  const media = node.querySelector(".canvas-image-upload");
  if (media && !node.dataset.imageSrc) media.hidden = true;
  const result = node.querySelector(".canvas-node-result");
  if (!result) return;
  const refs = node.querySelector(".canvas-node-refs");
  if (refs && result.nextElementSibling !== refs) refs.before(result);
  result.innerHTML = "";
  result.hidden = false;
  const img = document.createElement("img");
  img.alt = "生成结果";
  img.addEventListener("load", scheduleCanvasConnectionRender);
  registerCanvasDetailImage(img, src);
  result.append(img);
  result.append(createCanvasResultDownload(node));
  scheduleCanvasConnectionRender();
}

function appendCanvasGenerationToGallery(sourceNode, image) {
  const src = typeof image === "string" ? image : image?.src;
  const savedUrl = typeof image === "string" ? image : image?.savedUrl || image?.src;
  if (!src) return null;
  const gallery = getOrCreateCanvasGalleryForNode(sourceNode);
  const images = getCanvasGalleryImages(gallery);
  const nextImage = {
    id: createId(),
    name: `生成图 ${images.length + 1}`,
    src,
    savedUrl: savedUrl || src,
    createdAt: new Date().toISOString(),
  };
  images.push(nextImage);
  setCanvasGalleryImages(gallery, images);
  setCanvasGalleryActiveImage(gallery, nextImage.id);
  setCanvasStatus(`已追加到生成图集：${images.length} 张`);
  return { gallery, image: nextImage };
}

function migrateLegacyCanvasResultsToGalleries(results) {
  if (!Array.isArray(results) || !results.length) return 0;
  let migrated = 0;
  results.forEach((item) => {
    const sourceNode = getCanvasNode(item.sourceId);
    const src = item.src || item.savedUrl;
    if (!sourceNode || !src) return;
    const gallery = getOrCreateCanvasGalleryForNode(sourceNode);
    const images = getCanvasGalleryImages(gallery);
    const exists = images.some((image) => {
      const existingSrc = image?.src || image?.savedUrl || image?.url;
      return existingSrc && existingSrc === src;
    });
    if (exists) return;
    images.push({
      name: `生成图 ${images.length + 1}`,
      src,
      savedUrl: item.savedUrl || src,
      createdAt: item.createdAt || new Date().toISOString(),
    });
    setCanvasGalleryImages(gallery, images);
    migrated += 1;
  });
  return migrated;
}

function getOrCreateCanvasGalleryForNode(sourceNode) {
  const existing = findConnectedCanvasGallery(sourceNode);
  if (existing) return existing;

  const point = {
    x: Number(sourceNode.dataset.x || 0) + (Number(sourceNode.dataset.width || sourceNode.offsetWidth || 292) || 292) + 90,
    y: Number(sourceNode.dataset.y || 0),
  };
  const gallery = addCanvasGallery(point);
  connectCanvasNodes(sourceNode.dataset.id, gallery.dataset.id, "input");
  return gallery;
}

function findConnectedCanvasGallery(sourceNode) {
  if (!sourceNode) return null;
  return canvasState.connections
    .filter((item) => item.from === sourceNode.dataset.id)
    .map((item) => getCanvasNode(item.to))
    .find((node) => node?.classList.contains("canvas-node-gallery")) || null;
}

function ensureAgentCanvasImageInGallery(sourceNode, image, context) {
  assertCanvasAgentContext(context);
  const src = image?.src || image?.savedUrl || image?.url || "";
  if (!src) return null;
  const gallery = findConnectedCanvasGallery(sourceNode) || getOrCreateCanvasGalleryForNode(sourceNode);
  gallery.dataset.boardId = String(context.scope.boardId);
  if (!canvasState.connections.some((item) => item.from === sourceNode.dataset.id && item.to === gallery.dataset.id)) {
    connectCanvasNodes(sourceNode.dataset.id, gallery.dataset.id, "input");
  }
  const images = getCanvasGalleryImages(gallery);
  if (!images.some((item) => (item.savedUrl || item.src || item.url) === (image.savedUrl || src)
    || (item.src || item.url) === src)) {
    images.push({
      id: createId(),
      name: `生成图 ${images.length + 1}`,
      src,
      savedUrl: image.savedUrl || src,
      createdAt: new Date().toISOString(),
    });
    setCanvasGalleryImages(gallery, images);
  }
  assertCanvasAgentContext(context);
  return gallery;
}

function createCanvasResultDownload(node) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "canvas-result-download";
  button.textContent = "下载";
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    downloadCanvasImage({ dataset: { imageSrc: node.dataset.resultDownloadUrl || node.dataset.resultSrc, imageName: "生成结果.png" } }, event.currentTarget);
  });
  return button;
}

function setCanvasNodeStatus(node, message) {
  const bar = node.querySelector(".canvas-node-bar span");
  if (bar) bar.textContent = message;
}

function refreshCanvasConnectedNodes(sourceId) {
  refreshCanvasDownstreamNodes(sourceId);
  refreshCanvasGroupsContainingNode(sourceId);
  renderCanvasConnections();
}

function refreshCanvasDownstreamNodes(sourceId, visited = new Set()) {
  if (!sourceId || visited.has(String(sourceId))) return;
  visited.add(String(sourceId));
  canvasState.connections
    .filter((item) => item.from === sourceId || item.to === sourceId)
    .forEach((item) => {
      const target = getCanvasNode(item.to);
      updateCanvasNodeRefs(target);
      syncCanvasTextFromLlmInputs(target);
      if (item.from === sourceId) refreshCanvasDownstreamNodes(item.to, visited);
    });
}

function refreshCanvasGroupsContainingNode(sourceId) {
  document.querySelectorAll("#canvasPlane .canvas-node-group").forEach((group) => {
    if (!getCanvasGroupMemberIds(group).includes(String(sourceId))) return;
    updateCanvasGroupCounts();
    refreshCanvasDownstreamNodes(group.dataset.id);
  });
}

function getCanvasNode(id) {
  return canvasVirtualStore.getMounted(String(id || ""));
}

async function downloadCanvasImage(node, trigger) {
  const src = node?.dataset.imageSrc;
  if (!src) return;
  const name = (node.dataset.imageName || "canvas-image").replace(/[\\/:*?"<>|]+/g, "-");
  await downloadAsset(src, name.includes(".") ? name : `${name}.png`, trigger);
}

async function downloadAsset(src, filename = "image.png", trigger) {
  if (!src) return;
  const originalText = trigger?.textContent;
  if (trigger) {
    trigger.disabled = true;
    trigger.classList?.add("is-downloading");
    trigger.textContent = "下载中";
  }
  try {
    const blob = await fetchImageBlob(src);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = sanitizeDownloadName(filename);
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch (error) {
    console.warn("Download failed", error);
    const link = document.createElement("a");
    link.href = src;
    link.download = sanitizeDownloadName(filename);
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    if (trigger) {
      trigger.disabled = false;
      trigger.classList?.remove("is-downloading");
      trigger.textContent = originalText || "下载";
    }
  }
}

async function fetchImageBlob(src) {
  const response = await fetch(src, src.startsWith("data:") ? undefined : { cache: "force-cache" });
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  return response.blob();
}

function sanitizeDownloadName(name) {
  return String(name || "image.png").replace(/[\\/:*?"<>|]+/g, "-");
}

function getCanvasNodeModel(id) {
  return canvasVirtualStore.get(String(id || ""));
}

function mountCanvasVirtualNode(id, level = "full") {
  const model = getCanvasNodeModel(id);
  if (!model) return null;
  const context = canvasVirtualRestoreContext || {
    maxId: 0,
    legacyResults: [],
    migratedLegacyCount: 0,
  };
  context.virtualizedMount = true;
  try {
    return restoreCanvasBoardNode(model, canvasVirtualBoard || {}, context);
  } catch (error) {
    console.error(`Canvas node ${String(id)} failed to mount:`, error);
    setCanvasStatus(`节点加载失败：${error.message}`);
    return null;
  }
}

function syncCanvasNodeModel(node) {
  if (!node?.dataset?.id) return null;
  const serialized = serializeCanvasNode(node);
  return canvasVirtualStore.mergeSerialized(node.dataset.id, serialized);
}

function syncMountedCanvasModels() {
  canvasVirtualStore.mountedElements().forEach((node) => syncCanvasNodeModel(node));
  return canvasVirtualStore.serialize();
}

function unmountCanvasVirtualNode(id, node) {
  if (!node) return;
  syncCanvasNodeModel(node);
  node.querySelectorAll("img[data-canvas-original-src]").forEach(cancelCanvasMediaImage);
  window.imageResources?.disconnect(node);
  canvasNodeResizeObserver?.unobserve(node);
  if (canvasState.activeNode === node) canvasState.activeNode = null;
  node.remove();
}

function replaceCanvasVirtualNode(id, current, fromLevel, toLevel) {
  if (!current) return mountCanvasVirtualNode(id, toLevel);
  if (fromLevel === "full") syncCanvasNodeModel(current);
  const wasSelected = current.classList.contains("is-selected") || canvasState.activeNode === current;
  const replacement = mountCanvasVirtualNode(id, toLevel);
  if (!replacement) return null;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const transitioning = !reducedMotion
    && document.querySelectorAll("#canvasPlane .is-virtual-entering").length < 80;
  if (transitioning) replacement.classList.add("is-virtual-entering");
  unmountCanvasVirtualNode(id, current);
  if (wasSelected) {
    replacement.classList.add("is-selected");
    canvasState.activeNode = replacement;
  }
  if (transitioning) requestAnimationFrame(() => replacement.classList.remove("is-virtual-entering"));
  return replacement;
}

function ensureCanvasNodeMounted(id) {
  return canvasVirtualizer.ensureMounted(String(id || ""), "full");
}

function pinCanvasNode(id) {
  if (id !== undefined && id !== null && String(id)) canvasVirtualizer.pin(String(id));
}

function unpinCanvasNode(id) {
  if (id !== undefined && id !== null && String(id)) canvasVirtualizer.unpin(String(id));
}

function removeCanvasNodeModels(ids) {
  Array.from(ids || []).map(String).forEach((id) => {
    canvasVirtualizer.unmountId(id);
    canvasVirtualStore.remove(id);
  });
}

function clearCanvasPlane() {
  canvasViewportDataSource.cancel();
  closeCanvasGridMenu({ restoreFocus: false });
  const plane = document.querySelector("#canvasPlane");
  if (plane) window.imageResources?.disconnect(plane);
  clearTimeout(canvasDetailTimer);
  canvasDetailTimer = 0;
  clearTimeout(canvasVirtualRefreshTimer);
  canvasVirtualRefreshTimer = 0;
  canvasDetailReady = false;
  canvasVirtualizer.reset();
  plane?.querySelectorAll(".canvas-node").forEach((node) => {
    canvasNodeResizeObserver?.unobserve(node);
    node.remove();
  });
  canvasVirtualStore.clear();
  canvasSceneLayer?.clear();
  canvasSceneTextureCache.clear();
  document.querySelector("#infiniteCanvas")?.classList.remove("has-scene-layer");
  canvasPersistedNodes.clear();
  canvasPersistedConnections.clear();
  canvasVisibleConnectionBaselineIds = new Set();
  canvasVirtualBoard = null;
  canvasVirtualRestoreContext = null;
  canvasState.connections = [];
  canvasState.pendingConnection = null;
  canvasState.tempConnection = null;
  canvasState.nextNode = 1;
  canvasState.selectedIds.clear();
  canvasState.selectionFrameVisible = false;
  canvasState.activeNode = null;
  renderCanvasConnections();
  updateCanvasOrigin();
  updateCanvasGroupAction();
}

function serializeCanvasBoard() {
  const nodes = syncMountedCanvasModels();
  return {
    id: canvasState.activeBoardId || createId(),
    title: getCanvasBoardTitle(nodes),
    createdAt: canvasState.activeBoardCreatedAt || new Date().toISOString(),
    viewport: { x: canvasState.x, y: canvasState.y, scale: canvasState.scale },
    nodes,
    connections: canvasState.connections,
  };
}

function serializeCanvasNode(node) {
    const base = {
      id: node.dataset.id,
      kind: getCanvasNodeKind(node),
      x: Number(node.dataset.x || 0),
      y: Number(node.dataset.y || 0),
      width: Number(node.dataset.width || 0),
      height: Number(node.dataset.height || 0),
    };
  if (base.kind === "text") {
    base.text = node.querySelector(".canvas-text")?.textContent || "";
    } else if (base.kind === "group") {
      base.groupTitle = node.dataset.groupTitle || "图片组";
      base.groupMembers = getCanvasGroupMemberIds(node);
      base.groupImages = getCanvasGroupImages(node);
    } else if (base.kind === "gallery") {
      base.galleryTitle = node.dataset.galleryTitle || "生成图集";
      base.galleryImages = getCanvasGalleryImages(node);
      base.galleryActiveImageId = node.dataset.galleryActiveImageId || "";
      base.galleryColumns = Number(node.dataset.galleryColumns || 0) || null;
      base.galleryGap = node.dataset.galleryGap === undefined ? null : Number(node.dataset.galleryGap || 0);
    } else if (base.kind === "grid-editor") {
      base.gridEditorState = { ...getCanvasGridEditorState(node), editing: false };
    } else if (base.kind === "llm") {
      base.llmPrompt = node.querySelector(".canvas-llm-prompt")?.value || node.dataset.llmPrompt || "";
      base.llmModel = node.querySelector(".canvas-llm-model")?.value || node.dataset.llmModel || "";
      base.llmImages = getCanvasLlmImages(node);
      base.llmOutput = node.dataset.llmOutput || "";
    } else if (base.kind === "minimax-h3") {
      base.minimaxH3Prompt = node.dataset.minimaxH3Prompt || node.querySelector(".canvas-h3-prompt")?.value || "";
      base.minimaxH3AspectRatio = node.dataset.minimaxH3AspectRatio || "16:9";
      base.minimaxH3Megapixels = Number(node.dataset.minimaxH3Megapixels || 0.6);
      base.minimaxH3Steps = Number(node.dataset.minimaxH3Steps || 4);
      base.minimaxH3Duration = Number(node.dataset.minimaxH3Duration || 12);
      base.minimaxH3RefImageSize = node.dataset.minimaxH3RefImageSize || "match";
      base.minimaxH3Seed = node.dataset.minimaxH3Seed || "";
      base.minimaxH3ImageOrder = getCanvasH3ReferenceOrder(node, "images");
      base.minimaxH3VideoOrder = getCanvasH3ReferenceOrder(node, "videos");
      base.minimaxH3AudioOrder = getCanvasH3ReferenceOrder(node, "audios");
    } else if (base.kind === "video-output") {
      Object.assign(base, serializeCanvasVideoOutputState(node));
    } else if (base.kind === "video" || base.kind === "audio") {
      base.mediaSrc = base.kind === "video" ? (node.dataset.videoSrc || "") : (node.dataset.audioSrc || "");
      base.mediaName = node.dataset.mediaName || (base.kind === "video" ? "视频素材" : "音频素材");
      base.mediaMimeType = node.dataset.mediaMimeType || "";
      base.mediaDuration = Number(node.dataset.mediaDuration || 0);
    } else if (base.kind === "comfy") {
      base.comfyMode = node.querySelector(".canvas-comfy-mode")?.value || node.dataset.comfyMode || "upscale2";
      if (isCanvasComfyResolutionMode(base.comfyMode)) base.comfyResolution = node.querySelector(".canvas-comfy-resolution")?.value || node.dataset.comfyResolution || "2048";
      base.comfyPadding = getCanvasComfyPadding(node);
      base.comfyQwenAngle = getCanvasComfyQwenAngle(node);
      base.refOrder = getCanvasNodeRefOrder(node);
    } else if (base.kind === "loop") {
      base.refOrder = getCanvasNodeRefOrder(node);
    } else {
      base.imageSrc = node.dataset.imageSrc || "";
      base.uploadOnly = node.dataset.uploadOnly === "true";
      base.resultSrc = node.dataset.resultSrc || "";
      base.resultDownloadUrl = node.dataset.resultDownloadUrl || "";
      base.imageName = node.dataset.imageName || "图片";
      base.originalSrc = node.dataset.originalSrc || node.dataset.imageSrc || "";
      base.maskSrc = node.dataset.maskSrc || "";
      base.maskName = node.dataset.maskName || "";
      base.openaiMaskSrc = node.dataset.openaiMaskSrc || "";
      base.openaiMaskName = node.dataset.openaiMaskName || "";
      base.maskBaseSrc = node.dataset.maskBaseSrc || "";
      base.maskBaseName = node.dataset.maskBaseName || "";
      base.imageJobId = node.dataset.imageJobId || "";
      base.imageJobState = node.dataset.imageJobState || "";
      base.imageJobCommittedId = node.dataset.imageJobCommittedId || "";
      base.prompt = node.querySelector(".canvas-node-prompt")?.value || "";
      base.model = node.querySelector(".canvas-node-model")?.value || node.dataset.canvasModel || "";
      base.size = node.querySelector(".canvas-node-size")?.value || node.dataset.canvasSize || "1024x1024";
      base.resolution = node.querySelector(".canvas-node-resolution")?.value || node.dataset.canvasResolution || "1";
      base.midjourneyVersion = node.querySelector(".canvas-midjourney-version")?.value || node.dataset.canvasMidjourneyVersion || MIDJOURNEY_DEFAULT_OPTIONS.version;
      base.midjourneyMode = node.querySelector(".canvas-midjourney-mode")?.value || node.dataset.canvasMidjourneyMode || MIDJOURNEY_DEFAULT_OPTIONS.mode;
      base.midjourneySpeed = node.querySelector(".canvas-midjourney-speed")?.value || node.dataset.canvasMidjourneySpeed || MIDJOURNEY_DEFAULT_OPTIONS.speed;
      base.midjourneyQuality = node.querySelector(".canvas-midjourney-quality")?.value || node.dataset.canvasMidjourneyQuality || MIDJOURNEY_DEFAULT_OPTIONS.quality;
      base.midjourneyStyle = node.querySelector(".canvas-midjourney-style")?.value || node.dataset.canvasMidjourneyStyle || MIDJOURNEY_DEFAULT_OPTIONS.style;
      base.midjourneyStylize = Number(node.querySelector(".canvas-midjourney-stylize")?.value || node.dataset.canvasMidjourneyStylize || MIDJOURNEY_DEFAULT_OPTIONS.stylize);
      base.refOrder = getCanvasNodeRefOrder(node);
  }
  return base;
}

function resetCanvasUndoHistory() {
  canvasState.undoStack = [];
  canvasState.redoStack = [];
}

function recordCanvasUndo(command) {
  if (canvasState.isRestoring || canvasState.isUndoing || !command) return false;
  const estimatedBytes = new TextEncoder().encode(JSON.stringify(command)).byteLength;
  const entry = { ...command, estimatedBytes };
  canvasState.undoStack.push(entry);
  canvasState.redoStack = [];
  let bytes = canvasState.undoStack.reduce((total, item) => total + item.estimatedBytes, 0);
  while (canvasState.undoStack.length > canvasState.undoLimit || bytes > 32 * 1024 * 1024) {
    bytes -= canvasState.undoStack.shift().estimatedBytes;
  }
  return true;
}

function applyCanvasOperationLocally(operation) {
  const entityId = String(operation.entityId || operation.after?.id || operation.before?.id || "");
  if (operation.type === "node.delete") {
    const mounted = canvasPagedStore.getMounted(entityId);
    if (mounted) {
      canvasNodeResizeObserver?.unobserve(mounted);
      mounted.remove();
      canvasPagedStore.setMounted(entityId, null);
    }
  } else if (operation.type === "node.upsert" && operation.after) {
    const mounted = canvasPagedStore.getMounted(entityId);
    if (mounted) {
      ["x", "y", "width", "height"].forEach((field) => {
        if (operation.after[field] !== undefined) mounted.dataset[field] = String(operation.after[field]);
      });
      if (operation.after.text !== undefined) {
        const text = mounted.querySelector(".canvas-text");
        if (text) text.textContent = operation.after.text;
      }
      updateCanvasNodePosition(mounted);
    } else {
      canvasVirtualizer.schedule();
    }
  } else if (String(operation.type || "").startsWith("connection.")) {
    syncVisibleCanvasConnections();
    scheduleCanvasConnectionRender();
  }
}

function stageCanvasOperation(operation, options = {}) {
  if (!operation || typeof operation !== "object") return null;
  const entityId = String(operation.entityId || operation.after?.id || operation.before?.id || canvasState.activeBoardId || "");
  const pending = canvasPagedStore.getPendingOperations();
  const existing = pending.find((item) => (
    item.type === operation.type && String(item.entityId || "") === entityId
  ));
  const next = {
    ...operation,
    entityId,
    operationId: existing?.operationId || operation.operationId || createId(),
    before: existing?.before ?? operation.before ?? null,
  };
  canvasPagedStore.stageOperation(next);
  if (options.applyLocal) applyCanvasOperationLocally(next);
  canvasState.hasUnsavedChanges = true;
  clearTimeout(canvasState.saveTimer);
  canvasState.saveTimer = setTimeout(saveCanvasBoardNow, 500);
  return next;
}

function undoCanvasCommand() {
  const command = canvasState.undoStack.pop();
  if (!command) return false;
  canvasState.isUndoing = true;
  (command.inverse || []).forEach((operation) => stageCanvasOperation(
    { ...operation, operationId: createId() },
    { applyLocal: true },
  ));
  canvasState.isUndoing = false;
  canvasState.redoStack.push(command);
  return true;
}

function redoCanvasCommand() {
  const command = canvasState.redoStack.pop();
  if (!command) return false;
  canvasState.isUndoing = true;
  (command.forward || []).forEach((operation) => stageCanvasOperation(
    { ...operation, operationId: createId() },
    { applyLocal: true },
  ));
  canvasState.isUndoing = false;
  canvasState.undoStack.push(command);
  return true;
}

function undoCanvasChange(event) {
  if (!document.querySelector("#canvasView.active") || isCanvasTypingTarget(document.activeElement)) return;
  event?.preventDefault();
  if (!undoCanvasCommand()) {
    setCanvasStatus("没有可以撤销的操作。");
    return;
  }
  setCanvasStatus("已撤销上一步操作。");
}

function getCanvasNodeKind(node) {
  if (node.classList.contains("canvas-node-text")) return "text";
  if (node.classList.contains("canvas-node-grid-editor")) return "grid-editor";
  if (node.classList.contains("canvas-node-video-output")) return "video-output";
  if (node.classList.contains("canvas-node-minimax-h3")) return "minimax-h3";
  if (node.classList.contains("canvas-node-video")) return "video";
  if (node.classList.contains("canvas-node-audio")) return "audio";
  if (node.classList.contains("canvas-node-group")) return "group";
  if (node.classList.contains("canvas-node-gallery")) return "gallery";
  if (node.classList.contains("canvas-node-llm")) return "llm";
  if (node.classList.contains("canvas-node-comfy")) return "comfy";
  if (node.classList.contains("canvas-node-loop")) return "loop";
  return "image";
}

function getCanvasBoardTitle(nodes) {
  const currentTitle = normalizeCanvasBoardTitle(canvasState.activeBoardTitle);
  if (currentTitle) return currentTitle;
  const textNode = nodes.find((node) => node.kind === "text" && node.text?.trim());
  if (textNode) return textNode.text.trim().slice(0, 24);
  const imageNode = nodes.find((node) => node.kind === "image" && node.imageName && node.imageName !== "图片卡片");
  if (imageNode) return imageNode.imageName.slice(0, 24);
  const mediaNode = nodes.find((node) => ["video", "audio", "video-output"].includes(node.kind) && node.mediaName);
  if (mediaNode) return mediaNode.mediaName.slice(0, 24);
  return canvasState.activeBoardTitle || "未命名画布";
}

function cloneCanvasOperationValue(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function toCanvasOperationNode(model) {
  const payload = cloneCanvasOperationValue(model) || {};
  delete payload.revision;
  return payload;
}

function sameCanvasOperationValue(left, right) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function collectCanvasDirtyOperations() {
  if (canvasState.isRestoring) return [];
  const staged = [];
  canvasPagedStore.mountedElements().forEach((node) => {
    if (!node?.dataset?.id) return;
    const model = syncCanvasNodeModel(node);
    if (!model) return;
    const id = String(model.id);
    const after = toCanvasOperationNode(model);
    const before = canvasPersistedNodes.has(id)
      ? toCanvasOperationNode(canvasPersistedNodes.get(id))
      : null;
    if (sameCanvasOperationValue(before, after)) return;
    const alreadyPending = canvasPagedStore.getPendingOperations().some((item) => (
      item.type === "node.upsert" && String(item.entityId) === id
    ));
    const operation = stageCanvasOperation({
      type: "node.upsert",
      entityId: id,
      before,
      after,
    });
    if (operation) staged.push(operation);
    if (!alreadyPending) {
      recordCanvasUndo({
        label: before ? "编辑节点" : "创建节点",
        forward: [{ type: "node.upsert", entityId: id, before, after }],
        inverse: before
          ? [{ type: "node.upsert", entityId: id, before: after, after: before }]
          : [{ type: "node.delete", entityId: id, before: after, after: null }],
      });
    }
  });

  const currentConnections = new Map();
  canvasState.connections = canvasState.connections.map((item) => {
    const connection = normalizeVisibleCanvasConnection(item);
    currentConnections.set(connection.id, connection);
    return connection;
  });
  currentConnections.forEach((after, id) => {
    const before = canvasPersistedConnections.get(id) || null;
    if (sameCanvasOperationValue(before, after)) return;
    const operation = stageCanvasOperation({
      type: "connection.upsert",
      entityId: id,
      before: cloneCanvasOperationValue(before),
      after: cloneCanvasOperationValue(after),
    });
    if (operation) staged.push(operation);
  });
  canvasVisibleConnectionBaselineIds.forEach((id) => {
    if (currentConnections.has(id)) return;
    const before = canvasPersistedConnections.get(id);
    if (!before) return;
    const operation = stageCanvasOperation({
      type: "connection.delete",
      entityId: id,
      before: cloneCanvasOperationValue(before),
      after: null,
    });
    if (operation) staged.push(operation);
  });
  return staged;
}

async function ensureCanvasBoardPersisted() {
  ensureCanvasBoardIdentity();
  if (canvasState.activeBoardPersisted) return true;
  const response = await fetch(CANVAS_BOARDS_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: canvasState.activeBoardId,
      title: canvasState.activeBoardTitle || "未命名画布",
      createdAt: canvasState.activeBoardCreatedAt || new Date().toISOString(),
      viewport: { x: canvasState.x, y: canvasState.y, scale: canvasState.scale },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok && data.code !== "board_already_exists") {
    throw new Error(data.error || "画布创建失败");
  }
  canvasState.activeBoardPersisted = true;
  canvasState.activeBoardRevision = Number(data.revision || 0);
  canvasPagedStore.boardRevision = canvasState.activeBoardRevision;
  return true;
}

function applyCanvasOperationAcknowledgements(batch, result) {
  const acknowledged = new Set(
    (result.results || [])
      .filter((item) => ["applied", "duplicate"].includes(item.status))
      .map((item) => String(item.operationId)),
  );
  batch.forEach((operation) => {
    if (!acknowledged.has(String(operation.operationId))) return;
    const id = String(operation.entityId || "");
    if (operation.type === "node.upsert") canvasPersistedNodes.set(id, cloneCanvasOperationValue(operation.after));
    else if (operation.type === "node.delete") canvasPersistedNodes.delete(id);
    else if (operation.type === "connection.upsert") {
      canvasPersistedConnections.set(id, cloneCanvasOperationValue(operation.after));
      canvasVisibleConnectionBaselineIds.add(id);
    } else if (operation.type === "connection.delete") {
      canvasPersistedConnections.delete(id);
      canvasVisibleConnectionBaselineIds.delete(id);
    }
  });
}

async function flushCanvasOperations(options = {}) {
  if (canvasOperationFlushPromise) return canvasOperationFlushPromise;
  canvasOperationFlushPromise = (async () => {
    await ensureCanvasBoardPersisted();
    const batch = canvasPagedStore.getPendingOperations().slice(0, 500);
    if (!batch.length) {
      canvasState.hasUnsavedChanges = false;
      return { boardRevision: canvasState.activeBoardRevision, results: [] };
    }
    const send = async () => {
      const response = await fetch(`${CANVAS_BOARDS_API_URL}/${encodeURIComponent(canvasState.activeBoardId)}/operations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseRevision: canvasState.activeBoardRevision,
          operations: batch,
        }),
        keepalive: Boolean(options.keepalive),
      });
      const data = await response.json().catch(() => ({}));
      return { response, data };
    };
    let sent = await send();
    if (sent.response.status === 409) {
      const metaResponse = await fetch(`${CANVAS_BOARDS_API_URL}/${encodeURIComponent(canvasState.activeBoardId)}/meta`);
      const meta = await metaResponse.json().catch(() => ({}));
      if (metaResponse.ok) {
        canvasState.activeBoardRevision = Number(meta.revision || 0);
        canvasPagedStore.boardRevision = canvasState.activeBoardRevision;
        sent = await send();
      }
    }
    if (!sent.response.ok) throw new Error(sent.data.error || "画布增量保存失败");
    canvasState.activeBoardRevision = Number(sent.data.boardRevision ?? canvasState.activeBoardRevision);
    canvasPagedStore.ackOperations(sent.data);
    applyCanvasOperationAcknowledgements(batch, sent.data);
    canvasState.hasUnsavedChanges = canvasPagedStore.getPendingOperations().length > 0;
    if (canvasState.hasUnsavedChanges) {
      clearTimeout(canvasState.saveTimer);
      canvasState.saveTimer = setTimeout(saveCanvasBoardNow, 0);
    }
    return sent.data;
  })();
  try {
    return await canvasOperationFlushPromise;
  } finally {
    canvasOperationFlushPromise = null;
  }
}

async function saveCanvasBoardNow() {
  if (canvasState.isRestoring) return;
  clearTimeout(canvasState.saveTimer);
  clearTimeout(canvasViewportSaveTimer);
  canvasViewportSaveTimer = 0;
  if (!canvasState.activeBoardId && !hasCanvasContent()) {
    canvasState.hasUnsavedChanges = false;
    return;
  }
  collectCanvasDirtyOperations();
  try {
    await flushCanvasOperations();
  } catch (error) {
    setCanvasStatus(error.message);
  }
}

function ensureCanvasBoardIdentity() {
  if (!canvasState.activeBoardId) {
    canvasState.activeBoardId = createId();
    canvasState.activeBoardTitle = normalizeCanvasBoardTitle(canvasState.activeBoardTitle) || `画布 ${canvasState.boards.length + 1}`;
    canvasState.activeBoardCreatedAt = new Date().toISOString();
    canvasState.activeBoardRevision = 0;
    canvasState.activeBoardPersisted = false;
    syncCanvasWorkspaceState();
    dispatchCanvasBoardChanged();
  }
  document.querySelectorAll("#canvasPlane .canvas-node").forEach((node) => {
    if (!node.dataset.boardId) node.dataset.boardId = String(canvasState.activeBoardId || "");
  });
  return { id: canvasState.activeBoardId, title: canvasState.activeBoardTitle };
}

function getActiveCanvasBoardInfo() {
  return {
    id: String(canvasState.activeBoardId || ""),
    title: String(canvasState.activeBoardTitle || ""),
  };
}

function dispatchCanvasBoardChanged(options = {}) {
  const boardId = String(canvasState.activeBoardId || "");
  if (!options.force && canvasLastDispatchedBoardId === boardId) return;
  canvasLastDispatchedBoardId = boardId;
  window.dispatchEvent(new CustomEvent("canvas:board-changed", { detail: {
    boardId,
    title: String(canvasState.activeBoardTitle || ""),
  } }));
}

function scheduleCanvasViewportSave() {
  if (canvasState.isRestoring) return;
  stageCanvasOperation({
    type: "board.patch",
    entityId: String(canvasState.activeBoardId || ""),
    before: null,
    after: { viewport: { x: canvasState.x, y: canvasState.y, scale: canvasState.scale } },
  });
  clearTimeout(canvasViewportSaveTimer);
  canvasViewportSaveTimer = window.setTimeout(() => {
    canvasViewportSaveTimer = 0;
    saveCanvasBoardNow();
  }, 300);
}

function scheduleCanvasSave() {
  if (canvasState.isRestoring) return;
  collectCanvasDirtyOperations();
  canvasState.hasUnsavedChanges = true;
  clearTimeout(canvasState.saveTimer);
  canvasState.saveTimer = setTimeout(saveCanvasBoardNow, 500);
}

function startCanvasAutoSave() {
  if (canvasState.autoSaveTimer) return;
  canvasState.autoSaveTimer = window.setInterval(() => {
    if (canvasState.hasUnsavedChanges) saveCanvasBoardNow();
  }, 5000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushCanvasSave();
  });
  window.addEventListener("beforeunload", flushCanvasSave);
}

function flushCanvasSave() {
  if (canvasState.isRestoring || !canvasState.hasUnsavedChanges) return;
  clearTimeout(canvasState.saveTimer);
  clearTimeout(canvasViewportSaveTimer);
  canvasViewportSaveTimer = 0;
  if (!canvasState.activeBoardId && !hasCanvasContent()) {
    canvasState.hasUnsavedChanges = false;
    return;
  }
  collectCanvasDirtyOperations();
  flushCanvasOperations({ keepalive: true }).catch(() => {});
}

async function loadCanvasBoards(options = {}) {
  const { restoreFirst = false, createIfEmpty = false } = options || {};
  try {
    const response = await fetch(CANVAS_BOARDS_API_URL);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "画布历史读取失败");
    updateCanvasBoardStores(data);
    if (restoreFirst && canvasState.boards.length) await openCanvasBoardFromHistory(canvasState.boards[0]);
    else if (createIfEmpty && !canvasState.boards.length) await createNewCanvasBoard("未命名画布");
    renderCanvasBoardList();
  } catch (error) {
    setCanvasStatus(error.message);
  }
}

function updateCanvasBoardStores(data) {
  canvasState.boards = Array.isArray(data?.boards) ? data.boards : [];
  canvasState.trashedBoards = Array.isArray(data?.trash) ? data.trash : [];
}

function hasCanvasContent() {
  return canvasVirtualStore.size > 0 || canvasState.connections.length > 0;
}

function prepareBlankCanvasLanding() {
  canvasState.isRestoring = true;
  clearCanvasPlane();
  resetCanvasView();
  canvasState.activeBoardId = null;
  canvasState.activeBoardTitle = "";
  canvasState.activeBoardCreatedAt = null;
  canvasState.activeBoardRevision = 0;
  canvasState.activeBoardPersisted = false;
  canvasState.hasUnsavedChanges = false;
  syncCanvasWorkspaceState();
  canvasState.isRestoring = false;
  resetCanvasUndoHistory();
  renderCanvasBoardList();
  setCanvasStatus("空白画布");
  dispatchCanvasBoardChanged();
}

function beginCanvasBoardRestore(board) {
  canvasState.isRestoring = true;
  clearCanvasPlane();
  canvasState.activeBoardId = board.id;
  canvasState.activeBoardTitle = board.title || "未命名画布";
  canvasState.activeBoardCreatedAt = board.createdAt || new Date().toISOString();
  canvasState.activeBoardRevision = Number(board.revision || 0);
  canvasState.activeBoardPersisted = Number.isFinite(Number(board.revision));
  canvasVirtualBoard = board;
  canvasVirtualRestoreContext = {
    maxId: 0,
    legacyResults: [],
    migratedLegacyCount: 0,
  };
  return canvasVirtualRestoreContext;
}

function addCanvasBoardModelToVirtualStore(item, board, context) {
  const model = canvasVirtualStore.upsert(item);
  context.maxId = Math.max(context.maxId, Number(model.id) || 0);
  if (model.resultSrc) {
    context.legacyResults.push({
      sourceId: String(model.id),
      src: model.resultSrc,
      savedUrl: model.resultDownloadUrl || model.resultSrc,
      createdAt: model.updatedAt || model.createdAt || board.updatedAt || board.createdAt,
    });
  }
  return model;
}

function restoreCanvasBoardNode(item, board, context) {
  const node = createCanvasNode(getCanvasCreateKindFromSerialized(item.kind));
  node.dataset.id = String(item.id);
  node.dataset.x = String(Number(item.x || 0));
  node.dataset.y = String(Number(item.y || 0));
  if (item.width) node.dataset.width = String(item.width);
  if (item.height) node.dataset.height = String(item.height);
  context.maxId = Math.max(context.maxId, Number(item.id) || 0);
  if (item.kind === "text") {
    renderCanvasTextNode(node, item.text || "写下一个想法");
  } else if (item.kind === "group") {
    renderCanvasGroupNode(node, {
      title: item.groupTitle || "图片组",
      memberIds: Array.isArray(item.groupMembers) ? item.groupMembers : [],
      images: Array.isArray(item.groupImages) ? item.groupImages : [],
    });
  } else if (item.kind === "gallery") {
    renderCanvasGalleryNode(node, {
      title: item.galleryTitle || "生成图集",
      images: Array.isArray(item.galleryImages) ? item.galleryImages : [],
      activeImageId: item.galleryActiveImageId || "",
      columns: item.galleryColumns ?? null,
      gap: item.galleryGap ?? null,
    });
  } else if (item.kind === "grid-editor") {
    renderCanvasGridEditorNode(node, { ...(item.gridEditorState || {}), editing: false });
  } else if (item.kind === "llm") {
    renderCanvasLlmNode(node, {
      prompt: item.llmPrompt || "",
      model: item.llmModel || "",
      images: Array.isArray(item.llmImages) ? item.llmImages : [],
      output: item.llmOutput || "",
    });
  } else if (item.kind === "minimax-h3") {
    renderCanvasMinimaxH3Node(node, {
      prompt: item.minimaxH3Prompt || "",
      aspectRatio: item.minimaxH3AspectRatio || "16:9",
      megapixels: item.minimaxH3Megapixels ?? 0.6,
      steps: item.minimaxH3Steps ?? 4,
      duration: item.minimaxH3Duration ?? 12,
      refImageSize: item.minimaxH3RefImageSize || "match",
      seed: item.minimaxH3Seed ?? "",
    });
    node.dataset.minimaxH3ImageOrder = JSON.stringify(item.minimaxH3ImageOrder || []);
    node.dataset.minimaxH3VideoOrder = JSON.stringify(item.minimaxH3VideoOrder || []);
    node.dataset.minimaxH3AudioOrder = JSON.stringify(item.minimaxH3AudioOrder || []);
  } else if (item.kind === "video-output") {
    renderCanvasVideoOutputNode(node, getCanvasVideoOutputRenderOptions(item));
  } else if (item.kind === "video") {
    renderCanvasVideoNode(node, {
      src: item.mediaSrc || item.videoSrc || "",
      name: item.mediaName || "视频素材",
      mimeType: item.mediaMimeType || "video/mp4",
      duration: item.mediaDuration || 0,
    });
  } else if (item.kind === "audio") {
    renderCanvasAudioNode(node, {
      src: item.mediaSrc || item.audioSrc || "",
      name: item.mediaName || "音频素材",
      mimeType: item.mediaMimeType || "audio/mpeg",
      duration: item.mediaDuration || 0,
    });
  } else if (item.kind === "comfy") {
    renderCanvasComfyNode(node, {
      mode: item.comfyMode || "upscale2",
      resolution: isCanvasComfyResolutionMode(item.comfyMode) ? (item.comfyResolution || "2048") : "2048",
      padding: item.comfyPadding,
      qwenAngle: item.comfyQwenAngle,
    });
    if (Array.isArray(item.refOrder)) setCanvasNodeRefOrder(node, item.refOrder);
  } else if (item.kind === "loop") {
    renderCanvasLoopNode(node);
    if (Array.isArray(item.refOrder)) setCanvasNodeRefOrder(node, item.refOrder);
  } else {
    if (!item.uploadOnly) {
      if (item.model) node.dataset.canvasModel = item.model;
      if (item.size) node.dataset.canvasSize = item.size;
      if (item.resolution) node.dataset.canvasResolution = item.resolution;
      if (item.midjourneyVersion) node.dataset.canvasMidjourneyVersion = item.midjourneyVersion;
      if (item.midjourneyMode) node.dataset.canvasMidjourneyMode = item.midjourneyMode;
      if (item.midjourneySpeed) node.dataset.canvasMidjourneySpeed = item.midjourneySpeed;
      if (item.midjourneyQuality) node.dataset.canvasMidjourneyQuality = item.midjourneyQuality;
      if (item.midjourneyStyle) node.dataset.canvasMidjourneyStyle = item.midjourneyStyle;
      if (item.midjourneyStylize !== undefined) node.dataset.canvasMidjourneyStylize = String(item.midjourneyStylize);
    }
    if (item.uploadOnly) renderCanvasUploadNode(node, { src: item.imageSrc || "", name: item.imageName || "图片节点" });
    else renderCanvasImageNode(node, { src: item.imageSrc || "", name: item.imageName || "图片卡片" });
    if (item.imageJobId) {
      node.dataset.imageJobId = item.imageJobId;
      node.dataset.imageJobState = item.imageJobState || "unknown";
      if (item.imageJobCommittedId) node.dataset.imageJobCommittedId = item.imageJobCommittedId;
      queueMicrotask(() => resumeCanvasImageNodeJob(node));
    }
    if (item.originalSrc) node.dataset.originalSrc = item.originalSrc;
    if (item.maskSrc) node.dataset.maskSrc = item.maskSrc;
    if (item.maskName) node.dataset.maskName = item.maskName;
    if (item.openaiMaskSrc) node.dataset.openaiMaskSrc = item.openaiMaskSrc;
    if (item.openaiMaskName) node.dataset.openaiMaskName = item.openaiMaskName;
    if (item.maskBaseSrc) node.dataset.maskBaseSrc = item.maskBaseSrc;
    if (item.maskBaseName) node.dataset.maskBaseName = item.maskBaseName;
    updateCanvasImageMaskPreview(node);
    if (Array.isArray(item.refOrder)) setCanvasNodeRefOrder(node, item.refOrder);
    if (item.resultSrc) {
      updateCanvasGenerationResult(node, {
        src: item.resultSrc,
        savedUrl: item.resultDownloadUrl || item.resultSrc,
      });
    }
    if (!item.uploadOnly) {
      const prompt = node.querySelector(".canvas-node-prompt");
      if (prompt) prompt.value = item.prompt || "";
      if (item.model) node.dataset.canvasModel = item.model;
      const model = node.querySelector(".canvas-node-model");
      if (model && item.model) {
        model.value = item.model;
        if (!model.value) model.dataset.pendingModel = item.model;
      }
      const size = node.querySelector(".canvas-node-size");
      if (size && item.size) {
        fillCanvasNodeSizeSelect(size, item.size, node.dataset.canvasModel || model?.value || item.model);
        size.value = item.size;
        node.dataset.canvasSize = size.value;
      }
      const resolution = node.querySelector(".canvas-node-resolution");
      if (resolution && item.resolution) {
        resolution.value = item.resolution;
        node.dataset.canvasResolution = resolution.value;
      }
      syncCanvasMidjourneyOptions(node, node.dataset.canvasModel || model?.value || item.model || "", {
        version: item.midjourneyVersion,
        mode: item.midjourneyMode,
        speed: item.midjourneySpeed,
        style: item.midjourneyStyle,
        stylize: item.midjourneyStylize,
      });
    }
  }
  if (context.virtualizedMount) {
    node.dataset.virtualManaged = "true";
    node.dataset.virtualMounting = "true";
  }
  placeCanvasNode(node);
  delete node.dataset.virtualMounting;
  applyCanvasNodeSize(node);
  return node;
}

function prepareCanvasBoardRestoreFinalState(board, context) {
  canvasState.nextNode = Math.max(canvasState.nextNode, context.maxId + 1);
  canvasPagedStore.upsertConnections(Array.isArray(board.connections) ? board.connections : []);
  syncVisibleCanvasConnections();
  context.migratedLegacyCount = 0;
  canvasState.x = Number(board.viewport?.x ?? 80);
  canvasState.y = Number(board.viewport?.y ?? 60);
  canvasState.scale = normalizeCanvasScale(board.viewport?.scale, 1);
  applyCanvasTransform();
}

function completeCanvasBoardRestore(context, { refsAlreadyRefreshed = false } = {}) {
  if (!refsAlreadyRefreshed) refreshAllCanvasRefs();
  refreshCanvasImageModelSelects();
  syncCanvasWorkspaceState();
  canvasState.isRestoring = false;
  scheduleCanvasConnectionRender();
  if (context.migratedLegacyCount) scheduleCanvasSave();
  if (!canvasState.isUndoing) resetCanvasUndoHistory();
  setCanvasStatus(`已打开：${canvasState.activeBoardTitle}`);
  dispatchCanvasBoardChanged();
}

function restoreCanvasBoardVirtually(board) {
  const context = beginCanvasBoardRestore(board);
  const nodes = Array.isArray(board.nodes) ? board.nodes : [];
  nodes.forEach((item) => addCanvasBoardModelToVirtualStore(item, board, context));
  prepareCanvasBoardRestoreFinalState(board, context);
  canvasVirtualizer.flushNow();
  completeCanvasBoardRestore(context);
  return true;
}

function restoreCanvasBoard(board) {
  return restoreCanvasBoardVirtually(board);
}

function refreshAllCanvasRefs() {
  document.querySelectorAll("#canvasPlane .canvas-node").forEach((node) => updateCanvasNodeRefs(node));
  updateCanvasGroupCounts();
  scheduleCanvasConnectionRender();
}

async function refreshCanvasRefsProgressively(onProgress) {
  const rules = window.canvasBoardLoadingRules;
  const nodes = Array.from(document.querySelectorAll("#canvasPlane .canvas-node"));
  let batchStartedAt = performance.now();
  if (!nodes.length) onProgress?.({ phase: "refs", completed: 0, total: 0 });
  for (let index = 0; index < nodes.length; index += 1) {
    updateCanvasNodeRefs(nodes[index]);
    onProgress?.({ phase: "refs", completed: index + 1, total: nodes.length });
    if (performance.now() - batchStartedAt >= rules.FRAME_BUDGET_MS && index < nodes.length - 1) {
      await waitForCanvasRestorePaint();
      batchStartedAt = performance.now();
    }
  }
  updateCanvasGroupCounts();
  scheduleCanvasConnectionRender();
}

async function restoreCanvasBoardProgressively(board, onProgress) {
  const rules = window.canvasBoardLoadingRules;
  const nodes = Array.isArray(board.nodes) ? board.nodes : [];
  const context = beginCanvasBoardRestore(board);
  let batchStartedAt = performance.now();
  if (!nodes.length) onProgress?.({ phase: "nodes", completed: 0, total: 0 });
  for (let index = 0; index < nodes.length; index += 1) {
    addCanvasBoardModelToVirtualStore(nodes[index], board, context);
    onProgress?.({ phase: "nodes", completed: index + 1, total: nodes.length });
    if (performance.now() - batchStartedAt >= rules.FRAME_BUDGET_MS && index < nodes.length - 1) {
      await waitForCanvasRestorePaint();
      batchStartedAt = performance.now();
    }
  }
  prepareCanvasBoardRestoreFinalState(board, context);
  canvasVirtualizer.flushNow();
  await refreshCanvasRefsProgressively(onProgress);
  onProgress?.({ phase: "finalize" });
  await waitForCanvasRestorePaint();
  completeCanvasBoardRestore(context, { refsAlreadyRefreshed: true });
}

async function openCanvasBoardFromHistory(board) {
  if (!board || canvasState.boardOpening) return false;
  closeCanvasBoardPanel();
  if (Array.isArray(board.nodes)) {
    const rules = window.canvasBoardLoadingRules;
    if (!rules.shouldUseProgressiveRestore(board.nodes.length)) {
      restoreCanvasBoard(board);
      return true;
    }
    canvasState.boardOpening = true;
    const startedAt = performance.now();
    canvasState.activeBoardTitle = board.title || "未命名画布";
    setCanvasBoardLoading(true, { title: canvasState.activeBoardTitle, progress: 0 });
    try {
      await waitForCanvasRestorePaint();
      await restoreCanvasBoardProgressively(board, updateCanvasBoardLoading);
      updateCanvasBoardLoading({ phase: "complete" });
      const remaining = rules.MIN_VISIBLE_MS - (performance.now() - startedAt);
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
      return true;
    } catch (error) {
      canvasState.isRestoring = false;
      prepareBlankCanvasLanding();
      setCanvasStatus(`画布打开失败：${error.message}`);
      return false;
    } finally {
      setCanvasBoardLoading(false);
      canvasState.boardOpening = false;
    }
  }

  canvasState.boardOpening = true;
  canvasState.isRestoring = true;
  canvasState.activeBoardTitle = board.title || "未命名画布";
  setCanvasBoardLoading(true, { title: canvasState.activeBoardTitle, progress: 0 });
  try {
    clearCanvasPlane();
    canvasState.activeBoardId = String(board.id);
    canvasState.activeBoardTitle = board.title || "未命名画布";
    canvasState.activeBoardCreatedAt = board.createdAt || new Date().toISOString();
    canvasState.activeBoardRevision = Number(board.revision || 0);
    canvasState.activeBoardPersisted = true;
    canvasPagedStore.boardRevision = canvasState.activeBoardRevision;
    canvasState.x = Number(board.viewport?.x ?? 80);
    canvasState.y = Number(board.viewport?.y ?? 60);
    canvasState.scale = normalizeCanvasScale(board.viewport?.scale, 1);
    canvasVirtualBoard = board;
    canvasVirtualRestoreContext = { maxId: 0, legacyResults: [], migratedLegacyCount: 0 };
    applyCanvasTransformNow();
    let page;
    do {
      const { mountRect } = canvasVirtualizer.getRects();
      page = await requestCanvasViewportPage({ ...mountRect, scale: canvasState.scale });
      if (page?.state === "migrating") {
        updateCanvasBoardLoading(page.progress || { phase: "nodes", completed: 0, total: 1 });
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } while (page?.state === "migrating" && canvasState.activeBoardId === String(board.id));
    canvasVirtualizer.flushNow();
    completeCanvasBoardRestore(canvasVirtualRestoreContext);
    updateCanvasBoardLoading({ phase: "complete" });
    return true;
  } catch (error) {
    canvasState.isRestoring = false;
    prepareBlankCanvasLanding();
    setCanvasStatus(`画布打开失败：${error.message}`);
    return false;
  } finally {
    setCanvasBoardLoading(false);
    canvasState.boardOpening = false;
  }
}

function getSafeCanvasImageGenerationError(error, fallbackCode = "generation_failed") {
  const text = String(error?.message || error || "").toLowerCase();
  const errorCode = String(error?.code || "");
  if (["image_job_timeout_unknown", "image_job_result_unknown", "image_job_interrupted_unknown"].includes(errorCode)) {
    return {
      ok: false,
      code: "generation_timeout",
      error: String(error?.message || "图片任务结果暂时无法确认；任务记录已保留，为避免重复扣费，系统不会自动重新提交。"),
    };
  }
  if (/timeout|timed out|aborted/.test(text)) {
    return { ok: false, code: "generation_timeout", error: "图片服务响应超时；为避免重复扣费，本次不会自动重试。" };
  }
  if (/\b429\b|rate.?limit|too many requests|请求过于频繁/.test(text)) {
    return { ok: false, code: "image_api_rate_limited", error: "生图接口请求受限，正在切换备用接口。" };
  }
  if (/401|403|unauthorized|forbidden|auth|api.?key/.test(text)) {
    return { ok: false, code: "image_api_auth_failed", error: "生图接口认证失败，请在设置中检查该接口。" };
  }
  if (/balance|quota|credit|余额|额度/.test(text)) {
    return { ok: false, code: "image_api_balance_failed", error: "生图接口余额或额度不足，请在设置中更换可用接口。" };
  }
  if (/empty-image-response/.test(text)) {
    return { ok: false, code: "empty_image_response", error: "图片服务没有返回可用图片，请稍后重试。" };
  }
  return { ok: false, code: fallbackCode, error: "图片服务暂时不可用，请稍后重试或在设置中检查接口。" };
}

async function createNewCanvasBoard(title = `画布 ${canvasState.boards.length + 1}`) {
  const boardTitle = normalizeCanvasBoardTitle(title) || `画布 ${canvasState.boards.length + 1}`;
  canvasState.isRestoring = true;
  clearCanvasPlane();
  resetCanvasView();
  canvasState.activeBoardId = createId();
  canvasState.activeBoardTitle = boardTitle;
  canvasState.activeBoardCreatedAt = new Date().toISOString();
  canvasState.activeBoardRevision = 0;
  canvasState.activeBoardPersisted = false;
  syncCanvasWorkspaceState();
  canvasState.isRestoring = false;
  dispatchCanvasBoardChanged();
  resetCanvasUndoHistory();
  closeCanvasBoardPanel();
  await saveCanvasBoardNow();
  setCanvasStatus(`已新建：${boardTitle}`);
}

function promptCreateCanvasBoard() {
  const fallback = `画布 ${canvasState.boards.length + 1}`;
  const panel = document.querySelector("#canvasNamePanel");
  const input = document.querySelector("#canvasNameInput");
  const title = document.querySelector("#canvasNameTitle");
  const hint = document.querySelector("#canvasNameHint");
  const submit = document.querySelector("#canvasNameSubmit");
  if (!panel || !input) {
    createNewCanvasBoard(fallback);
    return;
  }
  canvasState.boardRenameId = null;
  panel.dataset.mode = "create";
  if (title) title.textContent = "新建画布";
  if (hint) hint.textContent = "给这个画布起一个方便识别的名字。";
  if (submit) submit.textContent = "创建";
  input.value = fallback;
  panel.hidden = false;
  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}

function closeCanvasNamePanel() {
  const panel = document.querySelector("#canvasNamePanel");
  if (panel) panel.hidden = true;
  canvasState.boardRenameId = null;
}

function openCanvasClearConfirm() {
  const panel = document.querySelector("#canvasClearConfirm");
  if (!panel) {
    confirmClearCanvasPlane();
    return;
  }
  panel.hidden = false;
}

function closeCanvasClearConfirm() {
  const panel = document.querySelector("#canvasClearConfirm");
  if (panel) panel.hidden = true;
}

function confirmClearCanvasPlane() {
  closeCanvasClearConfirm();
  clearCanvasPlane();
  scheduleCanvasSave();
  setCanvasStatus("当前画布已清空。");
}

function requestCanvasDeleteConfirmation({
  title = "确认删除？",
  message = "删除后仍可通过撤销恢复。",
  confirmLabel = "删除",
  onConfirm,
} = {}) {
  const panel = document.querySelector("#canvasDeleteConfirm");
  const titleElement = document.querySelector("#canvasDeleteConfirmTitle");
  const messageElement = document.querySelector("#canvasDeleteConfirmMessage");
  const confirmButton = document.querySelector("#canvasDeleteConfirmButton");
  const cancelButton = document.querySelector("#canvasDeleteConfirmCancel");
  if (!panel || typeof onConfirm !== "function") return false;
  canvasState.pendingDeleteAction = onConfirm;
  if (titleElement) titleElement.textContent = title;
  if (messageElement) messageElement.textContent = message;
  if (confirmButton) confirmButton.textContent = confirmLabel;
  panel.hidden = false;
  panel.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => cancelButton?.focus());
  return true;
}

function closeCanvasDeleteConfirmation() {
  const panel = document.querySelector("#canvasDeleteConfirm");
  if (panel) {
    panel.hidden = true;
    panel.setAttribute("aria-hidden", "true");
  }
  canvasState.pendingDeleteAction = null;
}

function confirmCanvasDeleteAction() {
  const action = canvasState.pendingDeleteAction;
  closeCanvasDeleteConfirmation();
  if (typeof action === "function") action();
}

function hideCanvasDeleteUndo() {
  const toast = document.querySelector("#canvasDeleteUndo");
  if (canvasState.deleteUndoTimer) window.clearTimeout(canvasState.deleteUndoTimer);
  if (canvasState.deleteUndoCountdownTimer) window.clearInterval(canvasState.deleteUndoCountdownTimer);
  canvasState.deleteUndoTimer = null;
  canvasState.deleteUndoCountdownTimer = null;
  canvasState.deleteUndoStackDepth = null;
  if (!toast) return;
  toast.hidden = true;
  toast.setAttribute("aria-hidden", "true");
}

function showCanvasDeleteUndo(message) {
  const toast = document.querySelector("#canvasDeleteUndo");
  const messageElement = document.querySelector("#canvasDeleteUndoMessage");
  const action = document.querySelector("#canvasDeleteUndoAction");
  const countdown = document.querySelector("#canvasDeleteUndoCountdown");
  if (!toast) return;
  if (canvasState.deleteUndoTimer) window.clearTimeout(canvasState.deleteUndoTimer);
  if (canvasState.deleteUndoCountdownTimer) window.clearInterval(canvasState.deleteUndoCountdownTimer);
  if (messageElement) messageElement.textContent = message || "已删除";
  canvasState.deleteUndoStackDepth = canvasState.undoStack.length;
  toast.hidden = false;
  toast.setAttribute("aria-hidden", "false");
  const deadline = Date.now() + 10000;
  const updateCountdown = () => {
    const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    if (countdown) countdown.textContent = String(seconds);
  };
  updateCountdown();
  canvasState.deleteUndoCountdownTimer = window.setInterval(updateCountdown, 250);
  action?.focus({ preventScroll: true });
  canvasState.deleteUndoTimer = window.setTimeout(hideCanvasDeleteUndo, 10000);
  action.onclick = () => {
    hideCanvasDeleteUndo();
    undoCanvasChange();
  };
}

function submitCanvasBoardName(event) {
  event.preventDefault();
  const input = document.querySelector("#canvasNameInput");
  const fallback = `画布 ${canvasState.boards.length + 1}`;
  const title = normalizeCanvasBoardTitle(input?.value) || fallback;
  if (document.querySelector("#canvasNamePanel")?.dataset.mode === "rename") {
    renameCanvasBoard(canvasState.boardRenameId, title);
    closeCanvasNamePanel();
    return;
  }
  closeCanvasNamePanel();
  createNewCanvasBoard(title);
}

function promptRenameCanvasBoard(id) {
  const board = canvasState.boards.find((item) => item.id === id);
  if (!board) return;
  const panel = document.querySelector("#canvasNamePanel");
  const input = document.querySelector("#canvasNameInput");
  const title = document.querySelector("#canvasNameTitle");
  const hint = document.querySelector("#canvasNameHint");
  const submit = document.querySelector("#canvasNameSubmit");
  if (!panel || !input) return;
  canvasState.boardRenameId = id;
  panel.dataset.mode = "rename";
  if (title) title.textContent = "重命名画布";
  if (hint) hint.textContent = "修改历史画布的名称，不会改变画布内容。";
  if (submit) submit.textContent = "保存";
  input.value = board.title || "未命名画布";
  panel.hidden = false;
  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}

function normalizeCanvasBoardTitle(title) {
  return String(title || "").replace(/\s+/g, " ").trim().slice(0, 80);
}

function openCanvasBoardPanel() {
  renderCanvasBoardList();
  const panel = document.querySelector("#canvasBoardPanel");
  if (panel) panel.hidden = false;
}

function closeCanvasBoardPanel() {
  const panel = document.querySelector("#canvasBoardPanel");
  if (panel) panel.hidden = true;
  syncCanvasWorkspaceState();
}

function toggleCanvasBoardTrash() {
  canvasState.boardView = canvasState.boardView === "trash" ? "active" : "trash";
  canvasState.boardSearchQuery = "";
  renderCanvasBoardList();
}

function renderCanvasBoardList() {
  const list = document.querySelector("#canvasBoardList");
  const count = document.querySelector("#canvasBoardCount");
  const title = document.querySelector("#canvasBoardTitle");
  const hint = document.querySelector("#canvasBoardHint");
  const trashButton = document.querySelector("#canvasBoardTrash");
  const search = document.querySelector("#canvasBoardSearch");
  const isTrash = canvasState.boardView === "trash";
  const sourceBoards = isTrash ? canvasState.trashedBoards : canvasState.boards;
  const query = normalizeCanvasSearchText(canvasState.boardSearchQuery);
  const boards = query ? sourceBoards.filter((board) => fuzzyMatchCanvasBoard(board, query)) : sourceBoards;
  if (title) title.textContent = isTrash ? "回收站" : "选择画布";
  if (hint) hint.textContent = isTrash ? "这些画布已删除，可以恢复或彻底删除。" : "打开已有画布，或者建立一个新的。";
  if (count) count.textContent = query ? `${boards.length}/${sourceBoards.length} 个` : `${sourceBoards.length} 个`;
  if (search && search.value !== canvasState.boardSearchQuery) search.value = canvasState.boardSearchQuery;
  if (trashButton) {
    trashButton.classList.toggle("active", isTrash);
    trashButton.innerHTML = isTrash ? '<i data-lucide="arrow-left"></i>' : '<i data-lucide="trash"></i>';
    trashButton.title = isTrash ? "返回画布历史" : "回收站";
    trashButton.setAttribute("aria-label", trashButton.title);
    window.lucide?.createIcons({ attrs: { "aria-hidden": "true", "stroke-width": 1.8 } });
  }
  if (!list) return;
  list.innerHTML = "";
  if (!boards.length) {
    const empty = document.createElement("div");
    empty.className = "canvas-board-empty";
    empty.textContent = query ? "没有找到匹配的画布" : (isTrash ? "回收站是空的" : "还没有画布");
    list.append(empty);
    return;
  }
  boards.forEach((board) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `canvas-board-item${board.id === canvasState.activeBoardId ? " active" : ""}`;
    card.dataset.boardId = board.id;
    const title = document.createElement("strong");
    title.textContent = board.title || "未命名画布";
    const meta = document.createElement("span");
    meta.textContent = formatCanvasDate(board.updatedAt || board.createdAt);
    const badge = document.createElement("small");
    badge.textContent = `${Number(board.nodeCount ?? board.nodes?.length ?? 0)} 节点`;
    card.append(createCanvasBoardPreview(board));
    const remove = document.createElement("i");
    remove.textContent = isTrash ? "删" : "×";
    remove.title = isTrash ? "彻底删除" : "移入回收站";
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      if (isTrash) permanentlyDeleteCanvasBoard(board.id);
      else deleteCanvasBoard(board.id);
    });
    card.append(badge, title, meta, remove);
    if (isTrash) {
      const restore = document.createElement("em");
      restore.textContent = "恢复";
      restore.title = "恢复画布";
      restore.addEventListener("click", (event) => {
        event.stopPropagation();
        restoreDeletedCanvasBoard(board.id);
      });
      card.append(restore);
    }
    card.addEventListener("pointerdown", (event) => event.stopPropagation());
    card.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!isTrash) showCanvasBoardMenu(board.id, event.clientX, event.clientY);
    });
    card.addEventListener("click", async (event) => {
      event.preventDefault();
      if (isTrash) return;
      await openCanvasBoardFromHistory(board);
    });
    list.append(card);
  });
}

function fuzzyMatchCanvasBoard(board, normalizedQuery) {
  const title = normalizeCanvasSearchText(board?.title || "");
  if (!normalizedQuery) return true;
  if (title.includes(normalizedQuery)) return true;
  let index = 0;
  for (const char of normalizedQuery) {
    index = title.indexOf(char, index);
    if (index === -1) return false;
    index += 1;
  }
  return true;
}

function normalizeCanvasSearchText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

function showCanvasBoardMenu(id, clientX, clientY) {
  const menu = document.querySelector("#canvasBoardMenu");
  const workspace = document.querySelector(".canvas-workspace");
  if (!menu || !workspace) return;
  const rect = workspace.getBoundingClientRect();
  menu.dataset.boardId = id;
  menu.style.left = `${clientX - rect.left}px`;
  menu.style.top = `${clientY - rect.top}px`;
  menu.hidden = false;
}

function hideCanvasBoardMenu() {
  const menu = document.querySelector("#canvasBoardMenu");
  if (menu) menu.hidden = true;
}

function createCanvasBoardPreview(board) {
  const preview = document.createElement("div");
  preview.className = "canvas-board-preview";
  const images = getCanvasBoardPreviewImages(board);
  if (!images.length) {
    const empty = document.createElement("div");
    empty.className = "canvas-board-preview-empty";
    empty.textContent = board.title || "未命名画布";
    preview.append(empty);
    return preview;
  }
  const grid = document.createElement("div");
  grid.className = `canvas-board-preview-grid count-${Math.min(images.length, 4)}`;
  images.slice(0, 4).forEach((image) => {
    const thumbnail = createDeferredThumbnail(image, board.title || "画布预览", {
      allowOriginalFallback: false,
      unload: false,
    });
    const markError = () => thumbnail.classList.add("is-error");
    thumbnail.addEventListener("error", markError);
    thumbnail.addEventListener("image-resource-state", (event) => {
      if (event.detail?.state === "error") markError();
    });
    grid.append(thumbnail);
  });
  preview.append(grid);
  return preview;
}

function getCanvasBoardPreviewImages(board) {
  const indexed = Array.isArray(board?.previewImages)
    ? board.previewImages.map(String).filter(Boolean)
    : [];
  if (indexed.length) return [...new Set(indexed)].slice(0, 4);
  const images = [];
  (board?.nodes || []).forEach((node) => {
    if (node.resultSrc) images.push(node.resultSrc);
    if (node.imageSrc) images.push(node.imageSrc);
    if (node.kind === "gallery" && node.galleryImages) {
      try {
        const galleryImages = Array.isArray(node.galleryImages)
          ? node.galleryImages
          : JSON.parse(node.galleryImages || "[]");
        galleryImages.forEach((item) => {
          const src = item?.src || item?.savedUrl || item?.url;
          if (src) images.push(src);
        });
      } catch {
        // Ignore malformed legacy gallery data.
      }
    }
  });
  return [...new Set(images)].slice(0, 4);
}

async function deleteCanvasBoard(id) {
  try {
    const response = await fetch(`${CANVAS_BOARDS_API_URL}/${encodeURIComponent(id)}/trash`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operationId: createId() }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "删除失败");
    await loadCanvasBoards();
    if (id === canvasState.activeBoardId) {
      if (canvasState.boards.length) await openCanvasBoardFromHistory(canvasState.boards[0]);
      else await createNewCanvasBoard("未命名画布");
    }
    renderCanvasBoardList();
    renderUnifiedHistory();
    setCanvasStatus("已移入回收站。");
  } catch (error) {
    setCanvasStatus(error.message);
  }
}

async function renameCanvasBoard(id, title) {
  if (!id || !title) return;
  try {
    const board = [...canvasState.boards, ...canvasState.trashedBoards].find((item) => item.id === id);
    const response = await fetch(`${CANVAS_BOARDS_API_URL}/${encodeURIComponent(id)}/operations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseRevision: Number(board?.revision || 0),
        operations: [{
          operationId: createId(),
          type: "board.patch",
          entityId: id,
          before: { title: board?.title || "" },
          after: { title },
        }],
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "重命名失败");
    await loadCanvasBoards();
    if (id === canvasState.activeBoardId) canvasState.activeBoardTitle = title;
    renderCanvasBoardList();
    renderUnifiedHistory();
    setCanvasStatus(`已重命名：${title}`);
  } catch (error) {
    setCanvasStatus(error.message);
  }
}

async function restoreDeletedCanvasBoard(id) {
  try {
    const response = await fetch(`${CANVAS_BOARDS_API_URL}/${encodeURIComponent(id)}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operationId: createId() }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "恢复失败");
    await loadCanvasBoards();
    canvasState.boardView = "active";
    const board = canvasState.boards.find((item) => item.id === id);
    if (board) await openCanvasBoardFromHistory(board);
    renderCanvasBoardList();
    renderUnifiedHistory();
    setCanvasStatus("已恢复画布。");
  } catch (error) {
    setCanvasStatus(error.message);
  }
}

async function permanentlyDeleteCanvasBoard(id) {
  try {
    const response = await fetch(`${CANVAS_BOARDS_API_URL}/${encodeURIComponent(id)}/permanent`, {
      method: "DELETE",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "彻底删除失败");
    await loadCanvasBoards({ silent: true });
    renderCanvasBoardList();
    renderUnifiedHistory();
    setCanvasStatus("已彻底删除。");
  } catch (error) {
    setCanvasStatus(error.message);
  }
}

function formatCanvasDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function getCanvasCopySourceNode() {
  if (canvasState.activeNode?.isConnected) return canvasState.activeNode;
  const selected = getSelectedCanvasNodes();
  if (selected.length) return selected.at(-1);
  return document.querySelector("#canvasPlane .canvas-node-image:hover");
}

function copySelectedCanvasNodes(event) {
  if (isCanvasTypingTarget(document.activeElement)) return;
  const sourceNode = getCanvasCopySourceNode();
  if (!sourceNode) return;
  event.preventDefault();
  if (!sourceNode.classList.contains("is-selected")) selectCanvasNode(sourceNode);
  const selected = getSelectedCanvasNodes();
  const ids = selected.length
    ? new Set(selected.map((node) => node.dataset.id))
    : new Set([sourceNode.dataset.id]);
  const nodes = Array.from(ids)
    .map((id) => getCanvasNode(id))
    .filter(Boolean)
    .map(serializeCanvasNode);
  const selectedId = (canvasState.activeNode?.isConnected ? canvasState.activeNode : sourceNode).dataset.id;
  const internalConnections = canvasState.connections
    .filter((item) => ids.has(String(item.from)) && ids.has(String(item.to)));
  const externalConnections = canvasState.connections
    .filter((item) => ids.has(String(item.from)) !== ids.has(String(item.to)))
    .map((item) => ({ ...item, selectedSide: ids.has(String(item.from)) ? "from" : "to" }));
  canvasState.clipboard = { selectedId, nodes, connections: internalConnections, externalConnections };
  setCanvasStatus(`已复制 ${nodes.length} 个节点。`);
}

function getCanvasCreateKindFromSerialized(kind) {
  if (["text", "group", "gallery", "grid-editor", "llm", "comfy", "loop", "video", "audio", "minimax-h3", "video-output"].includes(kind)) return kind;
  return "image";
}

function remapCanvasGridEditorState(stateValue, idMap) {
  const state = normalizeCanvasGridEditorState({ ...(stateValue || {}), editing: false });
  const sourceNodeId = String(state.sourceNodeId || "");
  if (!sourceNodeId) return state;
  const mapped = idMap?.get(sourceNodeId);
  if (mapped) return { ...state, sourceNodeId: String(mapped) };
  return getCanvasNode(sourceNodeId) ? state : { ...state, sourceNodeId: "" };
}

function remapCanvasH3ReferenceOrder(order, idMap) {
  return (Array.isArray(order) ? order : []).map((key) => {
    const parts = String(key).split(":");
    if (parts.length < 2) return String(key);
    const mappedId = idMap.get(parts[1]);
    if (mappedId) parts[1] = mappedId;
    return parts.join(":");
  });
}

function pasteCanvasNodes(event) {
  if (!canvasState.clipboard || isCanvasTypingTarget(document.activeElement)) return;
  event.preventDefault();
  const idMap = new Map();
  const pasted = [];
  canvasState.clipboard.nodes.forEach((item) => {
    const node = createCanvasNode(getCanvasCreateKindFromSerialized(item.kind));
    idMap.set(String(item.id), node.dataset.id);
    node.dataset.x = String(Number(item.x || 0) + 48);
    node.dataset.y = String(Number(item.y || 0) + 48);
    if (item.width) node.dataset.width = String(item.width);
    if (item.height) node.dataset.height = String(item.height);
    if (item.kind === "text") {
      renderCanvasTextNode(node, item.text || "写下一个想法");
    } else if (item.kind === "group") {
      renderCanvasGroupNode(node, {
        title: item.groupTitle || "图片组",
        memberIds: Array.isArray(item.groupMembers) ? item.groupMembers : [],
        images: Array.isArray(item.groupImages) ? item.groupImages : [],
      });
    } else if (item.kind === "gallery") {
      renderCanvasGalleryNode(node, {
        title: item.galleryTitle || "生成图集",
        images: Array.isArray(item.galleryImages) ? item.galleryImages : [],
        activeImageId: item.galleryActiveImageId || "",
        columns: item.galleryColumns ?? null,
        gap: item.galleryGap ?? null,
      });
    } else if (item.kind === "grid-editor") {
      renderCanvasGridEditorNode(node, { ...(item.gridEditorState || {}), editing: false });
    } else if (item.kind === "llm") {
      renderCanvasLlmNode(node, {
        prompt: item.llmPrompt || "",
        model: item.llmModel || "",
        images: Array.isArray(item.llmImages) ? item.llmImages : [],
        output: item.llmOutput || "",
      });
    } else if (item.kind === "minimax-h3") {
      renderCanvasMinimaxH3Node(node, {
        prompt: item.minimaxH3Prompt || "",
        aspectRatio: item.minimaxH3AspectRatio || "16:9",
        megapixels: item.minimaxH3Megapixels ?? 0.6,
        steps: item.minimaxH3Steps ?? 4,
        duration: item.minimaxH3Duration ?? 12,
        refImageSize: item.minimaxH3RefImageSize || "match",
        seed: item.minimaxH3Seed ?? "",
      });
      node.dataset.minimaxH3ImageOrder = JSON.stringify(item.minimaxH3ImageOrder || []);
      node.dataset.minimaxH3VideoOrder = JSON.stringify(item.minimaxH3VideoOrder || []);
      node.dataset.minimaxH3AudioOrder = JSON.stringify(item.minimaxH3AudioOrder || []);
    } else if (item.kind === "video-output") {
      renderCanvasVideoOutputNode(node, getCanvasVideoOutputRenderOptions(item));
    } else if (item.kind === "video") {
      renderCanvasVideoNode(node, {
        src: item.mediaSrc || item.videoSrc || "",
        name: item.mediaName || "视频素材",
        mimeType: item.mediaMimeType || "video/mp4",
        duration: item.mediaDuration || 0,
      });
    } else if (item.kind === "audio") {
      renderCanvasAudioNode(node, {
        src: item.mediaSrc || item.audioSrc || "",
        name: item.mediaName || "音频素材",
        mimeType: item.mediaMimeType || "audio/mpeg",
        duration: item.mediaDuration || 0,
      });
    } else if (item.kind === "comfy") {
      renderCanvasComfyNode(node, {
        mode: item.comfyMode || "upscale2",
        resolution: isCanvasComfyResolutionMode(item.comfyMode) ? (item.comfyResolution || "2048") : "2048",
        padding: item.comfyPadding,
        qwenAngle: item.comfyQwenAngle,
      });
      if (Array.isArray(item.refOrder)) setCanvasNodeRefOrder(node, item.refOrder);
    } else if (item.kind === "loop") {
      renderCanvasLoopNode(node);
      if (Array.isArray(item.refOrder)) setCanvasNodeRefOrder(node, item.refOrder);
    } else {
      if (item.uploadOnly) renderCanvasUploadNode(node, { src: item.imageSrc || "", name: item.imageName || "图片节点" });
      else renderCanvasImageNode(node, { src: item.imageSrc || "", name: item.imageName || "图片卡片" });
      if (item.originalSrc) node.dataset.originalSrc = item.originalSrc;
      if (item.maskSrc) node.dataset.maskSrc = item.maskSrc;
      if (item.maskName) node.dataset.maskName = item.maskName;
      if (item.openaiMaskSrc) node.dataset.openaiMaskSrc = item.openaiMaskSrc;
      if (item.openaiMaskName) node.dataset.openaiMaskName = item.openaiMaskName;
      if (item.maskBaseSrc) node.dataset.maskBaseSrc = item.maskBaseSrc;
      if (item.maskBaseName) node.dataset.maskBaseName = item.maskBaseName;
      updateCanvasImageMaskPreview(node);
      if (Array.isArray(item.refOrder)) setCanvasNodeRefOrder(node, item.refOrder);
      if (!item.uploadOnly) {
        const prompt = node.querySelector(".canvas-node-prompt");
        if (prompt) prompt.value = item.prompt || "";
        if (item.model) node.dataset.canvasModel = item.model;
        const model = node.querySelector(".canvas-node-model");
        if (model && item.model) model.value = item.model;
        const size = node.querySelector(".canvas-node-size");
        if (size && item.size) {
          size.value = item.size;
          node.dataset.canvasSize = size.value;
        }
        const resolution = node.querySelector(".canvas-node-resolution");
        if (resolution && item.resolution) {
          resolution.value = item.resolution;
          node.dataset.canvasResolution = resolution.value;
        }
        syncCanvasMidjourneyOptions(node, node.dataset.canvasModel || model?.value || item.model || "", {
          version: item.midjourneyVersion,
          mode: item.midjourneyMode,
          speed: item.midjourneySpeed,
          style: item.midjourneyStyle,
          stylize: item.midjourneyStylize,
        });
      }
    }
    applyCanvasNodeSize(node);
    placeCanvasNode(node);
    pasted.push(node);
  });
  canvasState.clipboard.connections.forEach((item) => {
    const from = idMap.get(String(item.from));
    const to = idMap.get(String(item.to));
    if (from && to) canvasState.connections.push({ from, to, toPort: item.toPort || "input" });
  });
  canvasState.clipboard.externalConnections?.forEach((item) => {
    if (item.selectedSide === "from" && getCanvasNode(item.to)) {
      const from = idMap.get(String(item.from));
      if (from) canvasState.connections.push({ from, to: item.to, toPort: item.toPort || "input" });
    }
    if (item.selectedSide === "to" && getCanvasNode(item.from)) {
      const to = idMap.get(String(item.to));
      if (to) canvasState.connections.push({ from: item.from, to, toPort: item.toPort || "input" });
    }
  });
  pasted.forEach((node) => {
    if (node.classList.contains("canvas-node-grid-editor")) {
      const remapped = remapCanvasGridEditorState(getCanvasGridEditorState(node), idMap);
      renderCanvasGridEditorNode(node, remapped);
    }
    if (node.classList.contains("canvas-node-minimax-h3")) {
      node.dataset.minimaxH3ImageOrder = JSON.stringify(remapCanvasH3ReferenceOrder(getCanvasH3ReferenceOrder(node, "images"), idMap));
      node.dataset.minimaxH3VideoOrder = JSON.stringify(remapCanvasH3ReferenceOrder(getCanvasH3ReferenceOrder(node, "videos"), idMap));
      node.dataset.minimaxH3AudioOrder = JSON.stringify(remapCanvasH3ReferenceOrder(getCanvasH3ReferenceOrder(node, "audios"), idMap));
    }
    updateCanvasNodeRefs(node);
  });
  const selectedCloneId = idMap.get(String(canvasState.clipboard.selectedId));
  clearCanvasSelection();
  pasted.forEach((node) => addCanvasNodeToSelection(node));
  if (selectedCloneId) canvasState.activeNode = getCanvasNode(selectedCloneId);
  scheduleCanvasConnectionRender();
  scheduleCanvasSave();
  setCanvasStatus(`已粘贴 ${pasted.length} 个节点。`);
}

async function handleCanvasClipboardPaste(event) {
  if (!document.querySelector("#canvasView.active") || isCanvasTypingTarget(document.activeElement)) return;
  const clipboard = event.clipboardData;
  if (!clipboard) return;
  const itemFiles = Array.from(clipboard.items || [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter(Boolean);
  const fileImages = Array.from(clipboard.files || []).filter((file) => file.type.startsWith("image/"));
  const imageFiles = itemFiles.length ? itemFiles : fileImages;
  const text = clipboard.getData("text/plain")?.trim();
  if (!imageFiles.length && !text) return;

  event.preventDefault();
  const basePoint = getCanvasViewportCenterPoint();
  const created = [];
  for (const [index, file] of imageFiles.entries()) {
    const url = await uploadCanvasImageFile(file);
    created.push(addCanvasImage(url, file.name || `剪贴板图片 ${index + 1}.png`, {
      x: basePoint.x + index * 34,
      y: basePoint.y + index * 34,
    }));
  }
  if (text) {
    created.push(addCanvasText({
      x: basePoint.x + imageFiles.length * 34,
      y: basePoint.y + imageFiles.length * 34,
    }, { text, focus: false }));
  }
  clearCanvasSelection();
  created.forEach((node) => addCanvasNodeToSelection(node));
  scheduleCanvasSave();
  setCanvasStatus(`已从剪贴板粘贴 ${created.length} 个节点。`);
}

function isCanvasTypingTarget(target) {
  return Boolean(target?.closest?.("textarea, input, select, [contenteditable='true']"));
}

function isCanvasWheelControlTarget(target) {
  if (!target?.closest) return false;
  if (target.closest("textarea, input, [contenteditable='true'], .canvas-custom-size-field, .canvas-board-panel")) return true;
  const select = target.closest("select");
  if (!select) return false;
  try {
    return select.matches(":open");
  } catch {
    return false;
  }
}

function handleCanvasBoardPanelWheel(event) {
  const panel = document.querySelector("#canvasBoardPanel");
  if (!panel || panel.hidden) return;
  const list = document.querySelector("#canvasBoardList");
  if (!list) return;
  event.preventDefault();
  event.stopPropagation();
  list.scrollTop += event.deltaY;
  if (event.deltaX) list.scrollLeft += event.deltaX;
}

function createCanvasGroupFromSelection(event) {
  if (event) event.preventDefault();
  if (isCanvasTypingTarget(document.activeElement)) return;
  const selected = getSelectedCanvasNodes()
    .filter((node) => !node.classList.contains("canvas-node-group") && !node.closest(".canvas-node-group"));
  const imageNodes = selected.filter((node) => {
    const output = getCanvasNodeOutput(node);
    return output?.type === "image";
  });
  if (!imageNodes.length) {
    setCanvasStatus("请选择至少一个有图片内容的节点再打组。");
    return;
  }
  const ordered = sortCanvasNodesByPosition(imageNodes);
  const bounds = getCanvasNodesBounds(ordered);
  const node = createCanvasNode("group");
  const paddingX = 36;
  const paddingTop = 58;
  const paddingBottom = 34;
  setCanvasNodePoint(node, {
    x: bounds.left - paddingX,
    y: bounds.top - paddingTop,
  });
  node.dataset.width = String(Math.max(280, Math.round(bounds.right - bounds.left + paddingX * 2)));
  node.dataset.height = String(Math.max(180, Math.round(bounds.bottom - bounds.top + paddingTop + paddingBottom)));
  renderCanvasGroupNode(node, {
    title: "GROUP",
    memberIds: ordered.map((item) => item.dataset.id),
  });
  applyCanvasNodeSize(node);
  placeCanvasNode(node);
  mergeGroupedImageConnections(node, ordered);
  canvasState.selectionFrameVisible = false;
  clearCanvasSelection();
  ordered.forEach((item) => addCanvasNodeToSelection(item));
  scheduleCanvasSave();
  setCanvasStatus("已打组，并把单独图片连接收拢为组连接。");
  return node;
}

function mergeGroupedImageConnections(groupNode, memberNodes) {
  if (!groupNode || !memberNodes?.length) return;
  const memberIds = new Set(memberNodes.map((node) => String(node.dataset.id)));
  const outgoing = canvasState.connections.filter((item) => memberIds.has(String(item.from)));
  if (!outgoing.length) return;

  const targetGroups = new Map();
  outgoing.forEach((item) => {
    const key = `${item.to}:${item.toPort || "input"}`;
    if (!targetGroups.has(key)) targetGroups.set(key, []);
    targetGroups.get(key).push(item);
  });

  const replacementTargets = [];
  targetGroups.forEach((items) => {
    const connectedMemberIds = new Set(items.map((item) => String(item.from)));
    const allMembersConnected = memberNodes.every((node) => connectedMemberIds.has(String(node.dataset.id)));
    if (allMembersConnected) {
      replacementTargets.push({
        to: items[0].to,
        toPort: items[0].toPort || "input",
      });
    }
  });

  if (!replacementTargets.length) return;

  const replacementKeys = new Set(replacementTargets.map((item) => `${item.to}:${item.toPort || "input"}`));
  canvasState.connections = canvasState.connections.filter((item) => {
    const key = `${item.to}:${item.toPort || "input"}`;
    return !(memberIds.has(String(item.from)) && replacementKeys.has(key));
  });

  replacementTargets.forEach((item) => {
    if (!canvasState.connections.some((connection) => connection.from === groupNode.dataset.id && connection.to === item.to && (connection.toPort || "input") === item.toPort)) {
      canvasState.connections.push({ from: groupNode.dataset.id, to: item.to, toPort: item.toPort });
    }
    updateCanvasNodeRefs(getCanvasNode(item.to));
    syncCanvasTextFromLlmInputs(getCanvasNode(item.to));
  });
  renderCanvasConnections();
}

function renderCanvasGroupNode(node, { title = "GROUP", memberIds = [], images = [] } = {}) {
  node.innerHTML = "";
  node.dataset.groupTitle = title || "GROUP";
  setCanvasGroupMemberIds(node, memberIds);
  if (images.length) setCanvasGroupImages(node, images);
  const outputPort = createCanvasPort("output");
  const bar = createCanvasNodeBar("组");
  bar.classList.add("canvas-group-bar");
  const titleText = bar.querySelector("span");
  if (titleText) {
    titleText.contentEditable = "true";
    titleText.textContent = node.dataset.groupTitle;
    titleText.addEventListener("input", () => {
      node.dataset.groupTitle = titleText.textContent.trim() || "GROUP";
      scheduleCanvasSave();
    });
  }
  const count = document.createElement("div");
  count.className = "canvas-group-count";
  count.textContent = `${getCanvasGroupImages(node).length} 张图`;
  node.append(outputPort, bar, count, createCanvasResizeHandle());
  scheduleCanvasConnectionRender();
}

function getCanvasGroupMemberIds(node) {
  try {
    const ids = JSON.parse(node.dataset.groupMembers || "[]");
    return Array.isArray(ids) ? ids.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function setCanvasGroupMemberIds(node, ids) {
  node.dataset.groupMembers = JSON.stringify((Array.isArray(ids) ? ids : []).map(String).filter(Boolean));
}

function sortCanvasNodesByPosition(nodes) {
  return Array.from(nodes || []).sort((a, b) => {
    const ay = Number(a.dataset.y || 0);
    const by = Number(b.dataset.y || 0);
    if (Math.abs(ay - by) > 24) return ay - by;
    return Number(a.dataset.x || 0) - Number(b.dataset.x || 0);
  });
}

function updateCanvasGroupCounts() {
  document.querySelectorAll("#canvasPlane .canvas-node-group").forEach((node) => {
    const count = node.querySelector(".canvas-group-count");
    if (count) count.textContent = `${getCanvasGroupImages(node).length} 张图`;
  });
}

function renderCanvasGroupList(node, list = node.querySelector(".canvas-group-list")) {
  if (!list) return;
}

function reorderCanvasGroupImage(node, fromIndex, toIndex) {
  const ids = getCanvasGroupMemberIds(node);
  if (!ids.length) {
    const images = getCanvasGroupFallbackImages(node);
    if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= images.length || toIndex < 0 || toIndex >= images.length) return;
    const [moved] = images.splice(fromIndex, 1);
    images.splice(toIndex, 0, moved);
    setCanvasGroupImages(node, images);
    refreshCanvasConnectedNodes(node.dataset.id);
    scheduleCanvasSave();
  }
}

function getCanvasGroupImages(node) {
  const memberImages = getCanvasGroupMemberIds(node)
    .map((id) => getCanvasNode(id))
    .map(getCanvasNodeOutput)
    .filter((item) => item?.type === "image");
  if (memberImages.length) return memberImages.map((item) => ({ name: item.name || "参考图", url: item.url }));
  return getCanvasGroupFallbackImages(node);
}

function getCanvasGroupFallbackImages(node) {
  try {
    const images = JSON.parse(node.dataset.groupImages || "[]");
    return Array.isArray(images)
      ? images.filter((item) => item?.url).map((item) => ({ name: item.name || "参考图", url: item.url }))
      : [];
  } catch {
    return [];
  }
}

function setCanvasGroupImages(node, images) {
  node.dataset.groupImages = JSON.stringify(
    (Array.isArray(images) ? images : [])
      .filter((item) => item?.url)
      .map((item) => ({ name: item.name || "参考图", url: item.url }))
  );
}

function addCanvasText(point, options = {}) {
  const node = createCanvasNode("text");
  if (point) setCanvasNodePoint(node, point);
  renderCanvasTextNode(node, options.text || "写下一个想法");
  placeCanvasNode(node);
  scheduleCanvasSave();
  const text = node.querySelector(".canvas-text");
  if (text && options.focus !== false) {
    text.focus();
    const range = document.createRange();
    range.selectNodeContents(text);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
  return node;
}

function getCanvasViewportCenterPoint() {
  const viewport = document.querySelector("#infiniteCanvas");
  if (!viewport) return { x: 0, y: 0 };
  const rect = viewport.getBoundingClientRect();
  return screenToCanvas(rect.width / 2, rect.height / 2);
}

function getAgentCanvasNodeSize(node) {
  return {
    width: Math.max(1, Number(node?.offsetWidth || node?.dataset?.width || 320)),
    height: Math.max(1, Number(node?.offsetHeight || node?.dataset?.height || 260)),
  };
}

function getAgentCanvasOpenRowPoints(sizes, gap = 90, excludedNodes = []) {
  const excluded = new Set(excludedNodes);
  const center = getCanvasViewportCenterPoint();
  const offsets = [
    { x: 0, y: 0 },
    { x: 0, y: 120 },
    { x: 0, y: -120 },
    { x: 140, y: 0 },
    { x: -140, y: 0 },
    { x: 0, y: 240 },
  ];
  const occupied = Array.from(document.querySelectorAll("#canvasPlane .canvas-node"))
    .filter((node) => !excluded.has(node))
    .map((node) => ({
      x: Number(node.dataset.x || 0),
      y: Number(node.dataset.y || 0),
      ...getAgentCanvasNodeSize(node),
    }));
  for (const offset of offsets) {
    const points = window.CanvasAgentCore.planCenteredRowLayout(
      { x: center.x + offset.x, y: center.y + offset.y },
      sizes,
      gap,
    );
    const blocked = points.some((point, index) => occupied.some((rect) => {
      const size = sizes[index];
      const padding = 28;
      return point.x < rect.x + rect.width + padding
        && point.x + size.width + padding > rect.x
        && point.y < rect.y + rect.height + padding
        && point.y + size.height + padding > rect.y;
    }));
    if (!blocked) return points;
  }
  return window.CanvasAgentCore.planCenteredRowLayout(center, sizes, gap);
}

function centerAgentCanvasNodesInViewport(nodes, gap = 90) {
  const targets = (Array.isArray(nodes) ? nodes : []).filter(Boolean);
  if (!targets.length || !window.CanvasAgentCore?.planCenteredRowLayout) return;
  const points = getAgentCanvasOpenRowPoints(targets.map(getAgentCanvasNodeSize), gap, targets);
  targets.forEach((node, index) => {
    setCanvasNodePoint(node, points[index]);
    updateCanvasNodePosition(node);
  });
  scheduleCanvasConnectionRender();
}

function focusAgentCanvasNodesInViewport(nodes) {
  const targets = (Array.isArray(nodes) ? nodes : []).filter(Boolean);
  const bounds = getCanvasNodesBounds(targets);
  const viewport = document.querySelector("#infiniteCanvas");
  if (!bounds || !viewport) return false;
  const rect = viewport.getBoundingClientRect();
  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;
  canvasState.x = rect.width / 2 - centerX * canvasState.scale;
  canvasState.y = rect.height / 2 - centerY * canvasState.scale;
  clearCanvasSelection();
  targets.forEach((node) => {
    addCanvasNodeToSelection(node);
    node.classList.add("is-agent-focus");
  });
  scheduleCanvasTransform();
  scheduleCanvasViewportSave();
  return true;
}

function renderCanvasTextNode(node, content = "写下一个想法") {
  node.innerHTML = "";
  const inputPort = createCanvasPort("input");
  const outputPort = createCanvasPort("output");
  const text = document.createElement("div");
  text.className = "canvas-text";
  text.contentEditable = "true";
  text.textContent = content || "写下一个想法";
  text.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  text.addEventListener("wheel", stopCanvasTextWheel);
  text.addEventListener("blur", scheduleCanvasSave);
  node.append(inputPort, outputPort, createCanvasNodeBar("文字"), text, createCanvasResizeHandle());
  syncCanvasTextFromLlmInputs(node);
  scheduleCanvasConnectionRender();
}

function stopCanvasTextWheel(event) {
  event.stopPropagation();
}

function createCanvasResizeHandle() {
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "canvas-resize-handle";
  handle.setAttribute("aria-label", "拖动缩放节点");
  handle.addEventListener("pointerdown", beginCanvasNodeResize);
  return handle;
}

function createCanvasNode(kind) {
  const node = document.createElement("article");
  node.className = `canvas-node canvas-node-${kind}`;
  node.dataset.boardId = String(canvasState.activeBoardId || "");
  node.dataset.x = String(-canvasState.x / canvasState.scale + 120 + canvasState.nextNode * 18);
  node.dataset.y = String(-canvasState.y / canvasState.scale + 110 + canvasState.nextNode * 18);
  node.dataset.id = String(canvasState.nextNode);
  canvasState.nextNode += 1;
  canvasNodeResizeObserver?.observe(node);
  return node;
}

function setCanvasNodePoint(node, point) {
  node.dataset.x = String(point.x);
  node.dataset.y = String(point.y);
}

function createCanvasNodeBar(label) {
  const bar = document.createElement("div");
  bar.className = "canvas-node-bar";
  const title = document.createElement("span");
  title.className = "canvas-node-title";
  title.textContent = label;
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "canvas-node-delete";
  remove.textContent = "×";
  remove.addEventListener("click", (event) => {
    event.stopPropagation();
    const node = bar.closest(".canvas-node");
    if (!node) return;
    if (node.classList.contains("canvas-node-gallery")) requestCanvasGalleryNodeDelete(node);
    else deleteCanvasNodes([node]);
  });
  bar.append(title, remove);
  return bar;
}

function deleteSelectedCanvasNodes(event) {
  const selected = getSelectedCanvasNodes();
  const targets = selected.length ? selected : canvasState.activeNode ? [canvasState.activeNode] : [];
  if (!targets.length) return;
  event?.preventDefault();
  deleteCanvasNodes(targets);
}

function deleteCanvasNodes(nodes) {
  const targets = Array.from(new Set((nodes || []).filter(Boolean)));
  if (!targets.length) return;
  if (canvasGridMenuState?.sourceNode && targets.includes(canvasGridMenuState.sourceNode)) {
    closeCanvasGridMenu({ restoreFocus: false });
  }
  const ids = new Set(targets.map((node) => node.dataset.id).filter(Boolean));
  const deletedModels = targets.map((node) => (
    toCanvasOperationNode(syncCanvasNodeModel(node) || serializeCanvasNode(node))
  ));
  const deletedConnections = canvasState.connections
    .filter((item) => ids.has(String(item.from)) || ids.has(String(item.to)))
    .map(normalizeVisibleCanvasConnection);
  const forward = [
    ...deletedConnections.map((item) => ({
      type: "connection.delete",
      entityId: item.id,
      before: cloneCanvasOperationValue(item),
      after: null,
    })),
    ...deletedModels.map((item) => ({
      type: "node.delete",
      entityId: String(item.id),
      before: cloneCanvasOperationValue(item),
      after: null,
    })),
  ];
  const inverse = [
    ...deletedModels.map((item) => ({
      type: "node.upsert",
      entityId: String(item.id),
      before: null,
      after: cloneCanvasOperationValue(item),
    })),
    ...deletedConnections.map((item) => ({
      type: "connection.upsert",
      entityId: item.id,
      before: null,
      after: cloneCanvasOperationValue(item),
    })),
  ];
  recordCanvasUndo({ label: "删除节点", forward, inverse });
  const affectedTargets = new Set();
  canvasState.connections.forEach((item) => {
    if (ids.has(item.from) || ids.has(item.to)) affectedTargets.add(item.to);
  });
  canvasState.connections = canvasState.connections.filter((item) => !ids.has(item.from) && !ids.has(item.to));
  forward.forEach((operation) => stageCanvasOperation(operation));
  document.querySelectorAll("#canvasPlane .canvas-node-group").forEach((group) => {
    const nextIds = getCanvasGroupMemberIds(group).filter((id) => !ids.has(id));
    setCanvasGroupMemberIds(group, nextIds);
  });
  targets.forEach((node) => {
    canvasState.selectedIds.delete(node.dataset.id);
    if (canvasState.activeNode === node) canvasState.activeNode = null;
  });
  removeCanvasNodeModels(ids);
  canvasState.activeNode = getSelectedCanvasNodes()[0] || null;
  affectedTargets.forEach((id) => updateCanvasNodeRefs(getCanvasNode(id)));
  updateCanvasGroupCounts();
  renderCanvasConnections();
  scheduleCanvasSave();
  updateCanvasGroupAction();
  updateCanvasSelectionFrame();
  updateCanvasOrigin();
}

function createCanvasOperationGuard(context) {
  return Object.freeze({
    assertActive() {
      assertCanvasAgentContext(context);
      return true;
    },
  });
}

function assertCanvasAgentContext(context) {
  if (!context?.scope || typeof context.assertActive !== "function") {
    const error = new Error("画布操作缺少有效任务作用域。");
    error.code = "scope_mismatch";
    throw error;
  }
  context.assertActive(context.scope);
  const activeBoardId = String(canvasState.activeBoardId || "");
  if (!activeBoardId || activeBoardId !== String(context.scope.boardId || "")) {
    const error = new Error("当前画布已改变，旧任务已安全停止。");
    error.code = "scope_expired";
    throw error;
  }
  return activeBoardId;
}

function findAgentOwnedCanvasNode(id, context) {
  const boardId = assertCanvasAgentContext(context);
  const nodeId = String(id || "");
  const node = ensureCanvasNodeMounted(nodeId);
  if (!node?.isConnected || node.closest("#canvasPlane") === null) {
    const error = new Error(`当前画布中找不到节点 ${nodeId || "(empty)"}。`);
    error.code = "node_missing";
    throw error;
  }
  if (String(node.dataset.boardId || "") !== boardId) {
    const error = new Error("目标节点不属于当前画布，已阻止执行。");
    error.code = "scope_mismatch";
    throw error;
  }
  return node;
}

function getAgentCanvasNodeResult(node) {
  return {
    node_id: String(node?.dataset?.id || ""),
    kind: node ? getCanvasNodeKind(node) : "unknown",
    x: Number(node?.dataset?.x || 0),
    y: Number(node?.dataset?.y || 0),
  };
}

function hasCanvasAgentNumber(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function getAgentCanvasPoint(args = {}, anchor = null) {
  if (hasCanvasAgentNumber(args.x) && hasCanvasAgentNumber(args.y)) {
    return { x: Number(args.x), y: Number(args.y) };
  }
  if (anchor) {
    return {
      x: Number(anchor.dataset.x || 0) + (anchor.offsetWidth || Number(anchor.dataset.width || 320)) + 90,
      y: Number(anchor.dataset.y || 0),
    };
  }
  return getCanvasViewportCenterPoint();
}

function connectAgentReferenceNodes(referenceIds, targetId, context) {
  (Array.isArray(referenceIds) ? referenceIds : []).forEach((id) => {
    const source = findAgentOwnedCanvasNode(id, context);
    connectCanvasNodes(source.dataset.id, targetId, "input");
  });
}

async function createAgentCanvasNode(kind, args = {}, context) {
  assertCanvasAgentContext(context);
  const normalizedKind = String(kind || "");
  const anchorId = args.source_node_id || args.reference_node_ids?.[0] || "";
  const anchor = anchorId ? findAgentOwnedCanvasNode(anchorId, context) : null;
  const point = getAgentCanvasPoint(args, anchor);
  let node;
  let promptNode = null;
  if (normalizedKind === "text") {
    node = addCanvasText(point, { text: String(args.content || ""), focus: false });
  } else if (normalizedKind === "image") {
    if (args.source_node_id) {
      const sourceNode = findAgentOwnedCanvasNode(args.source_node_id, context);
      const output = getCanvasNodeOutput(sourceNode);
      const src = output?.savedUrl || output?.src || output?.url;
      if (!src) throw new Error("来源节点没有可用图片结果。");
      node = addCanvasImage(src, String(args.name || output.name || "图片素材"), point);
    } else {
      node = addCanvasImagePlaceholder(point);
      applyAgentCanvasNodeChanges(node, {
        prompt: args.prompt,
        model: args.model,
        size: args.size,
        resolution: args.resolution,
      });
    }
  } else if (normalizedKind === "llm") {
    node = addCanvasLlmNode(point, { prompt: String(args.prompt || ""), model: String(args.model || "") });
  } else if (normalizedKind === "comfy") {
    if (String(args.prompt || "").trim() && String(args.mode || "") !== "flux2-klein-edit") {
      throw new Error("ComfyUI 提示词仅用于 Flux2 Klein 图片编辑工作流。");
    }
    node = addCanvasComfyNode(point, {
      mode: String(args.mode || ""),
      resolution: String(args.resolution || ""),
      padding: args.padding || null,
      qwenAngle: args.qwen_angle || null,
    });
    if (String(args.prompt || "").trim()) {
      promptNode = addCanvasText({ x: point.x - 360, y: point.y }, { text: String(args.prompt), focus: false });
      promptNode.dataset.boardId = String(context.scope.boardId);
      connectCanvasNodes(promptNode.dataset.id, node.dataset.id, "input");
    }
  } else if (normalizedKind === "minimax-h3") {
    node = addCanvasMinimaxH3Node(point, {
      prompt: String(args.prompt || ""),
      aspectRatio: String(args.aspect_ratio || "16:9"),
      duration: Number(args.duration || 8),
    });
  } else if (normalizedKind === "gallery") {
    node = addCanvasGallery(point);
    renderCanvasGalleryNode(node, { images: [], title: String(args.title || "生成图集") });
  } else if (normalizedKind === "loop") {
    node = addCanvasLoopNode(point);
  } else if (normalizedKind === "grid-editor") {
    const sourceNode = findAgentOwnedCanvasNode(args.source_node_id, context);
    const rows = Number(args.rows || 2);
    const columns = Number(args.columns || 2);
    const maxTargets = window.CanvasAgentCapabilities?.MAX_BATCH_TARGETS || 40;
    if (rows * columns > maxTargets) throw new Error(`Agent 一次最多输出 ${maxTargets} 个宫格。`);
    node = await addCanvasGridEditorNode(sourceNode, {
      rows,
      columns,
      guard: createCanvasOperationGuard(context),
    });
    if (hasCanvasAgentNumber(args.x) && hasCanvasAgentNumber(args.y)) {
      setCanvasNodePoint(node, point);
      updateCanvasNodePosition(node);
    }
  } else if (["video", "audio"].includes(normalizedKind)) {
    const sourceNode = findAgentOwnedCanvasNode(args.source_node_id, context);
    const output = getCanvasNodeOutput(sourceNode);
    if (!output?.url) throw new Error("来源节点没有可用媒体结果。");
    const options = { src: output.url, name: String(args.name || output.name || `${normalizedKind}素材`) };
    node = normalizedKind === "video" ? addCanvasVideoNode(point, options) : addCanvasAudioNode(point, options);
  } else {
    throw new Error(`不支持创建 ${normalizedKind || "unknown"} 节点。`);
  }
  assertCanvasAgentContext(context);
  node.dataset.boardId = String(context.scope.boardId);
  if (node && args.reference_node_ids) connectAgentReferenceNodes(args.reference_node_ids, node.dataset.id, context);
  if (!hasCanvasAgentNumber(args.x) && !hasCanvasAgentNumber(args.y) && !anchor) {
    centerAgentCanvasNodesInViewport(promptNode ? [promptNode, node] : [node]);
  }
  scheduleCanvasConnectionRender();
  scheduleCanvasSave();
  return {
    ...getAgentCanvasNodeResult(node),
    ...(promptNode ? { prompt_node_id: promptNode.dataset.id } : {}),
  };
}

function applyAgentCanvasNodeChanges(node, changes = {}) {
  if (!node) return;
  if (changes.content !== null && changes.content !== undefined && node.classList.contains("canvas-node-text")) {
    const text = node.querySelector(".canvas-text");
    if (text) text.textContent = String(changes.content);
  }
  const prompt = node.querySelector(".canvas-node-prompt, .canvas-llm-prompt, .canvas-h3-prompt");
  if (changes.prompt !== null && changes.prompt !== undefined && prompt) {
    prompt.value = String(changes.prompt);
    prompt.dispatchEvent(new Event("input", { bubbles: true }));
  }
  if (changes.title !== null && changes.title !== undefined && node.classList.contains("canvas-node-gallery")) {
    renderCanvasGalleryNode(node, {
      images: getCanvasGalleryImages(node),
      title: String(changes.title || "生成图集"),
      activeImageId: node.dataset.galleryActiveImageId || "",
    });
  }
  const model = node.querySelector(".canvas-node-model, .canvas-llm-model");
  if (changes.model && model) {
    if (node.classList.contains("canvas-node-image")) fillCanvasNodeModelSelect(model, String(changes.model));
    model.value = String(changes.model);
    model.dispatchEvent(new Event("change", { bubbles: true }));
  }
  const size = node.querySelector(".canvas-node-size");
  if (changes.size && size) {
    fillCanvasNodeSizeSelect(size, String(changes.size), model?.value || "");
    size.value = String(changes.size);
    node.dataset.canvasSize = size.value || String(changes.size);
    size.dispatchEvent(new Event("change", { bubbles: true }));
  }
  const resolution = node.querySelector(".canvas-node-resolution");
  if (changes.resolution && resolution) {
    fillCanvasNodeResolutionSelect(resolution, String(changes.resolution), model?.value || "", size?.value || "auto");
    resolution.value = String(changes.resolution);
    node.dataset.canvasResolution = resolution.value || String(changes.resolution);
    resolution.dispatchEvent(new Event("change", { bubbles: true }));
  }
  if (changes.aspect_ratio && node.classList.contains("canvas-node-minimax-h3")) {
    node.dataset.minimaxH3AspectRatio = String(changes.aspect_ratio);
    const select = node.querySelector('[data-canvas-key="minimaxH3AspectRatio"]');
    if (select) select.value = String(changes.aspect_ratio);
  }
  if (changes.duration !== null && changes.duration !== undefined && node.classList.contains("canvas-node-minimax-h3")) {
    const duration = Math.max(5, Math.min(15, Number(changes.duration) || 8));
    node.dataset.minimaxH3Duration = String(duration);
    const input = node.querySelector('[data-canvas-key="minimaxH3Duration"]');
    if (input) input.value = String(duration);
  }
  if (node.classList.contains("canvas-node-comfy") && [
    changes.comfy_mode,
    changes.comfy_resolution,
    changes.comfy_padding,
    changes.comfy_qwen_angle,
  ].some((value) => value !== null && value !== undefined)) {
    renderCanvasComfyNode(node, {
      mode: changes.comfy_mode ?? node.querySelector(".canvas-comfy-mode")?.value ?? node.dataset.comfyMode ?? "upscale2",
      resolution: changes.comfy_resolution ?? node.querySelector(".canvas-comfy-resolution")?.value ?? node.dataset.comfyResolution ?? "2048",
      padding: changes.comfy_padding ?? getCanvasComfyPadding(node),
      qwenAngle: changes.comfy_qwen_angle ?? getCanvasComfyQwenAngle(node),
    });
  }
  if (hasCanvasAgentNumber(changes.x) && hasCanvasAgentNumber(changes.y)) {
    setCanvasNodePoint(node, { x: Number(changes.x), y: Number(changes.y) });
    updateCanvasNodePosition(node);
  }
  if (changes.result_url && node.classList.contains("canvas-node-image")) {
    updateCanvasGenerationResult(node, { src: String(changes.result_url), savedUrl: String(changes.result_url) });
  }
}

async function updateAgentCanvasNodeFields(ids, changes = {}, context) {
  const nodeIds = Array.isArray(ids) ? ids : [ids];
  const results = await context.forEachBatched(nodeIds, async (id) => {
    const node = findAgentOwnedCanvasNode(id, context);
    applyAgentCanvasNodeChanges(node, changes || {});
    return getAgentCanvasNodeResult(node);
  });
  scheduleCanvasConnectionRender();
  scheduleCanvasSave();
  return { node_ids: results.map((item) => item.node_id), nodes: results };
}

async function duplicateAgentCanvasNodes(args = {}, context) {
  const nodes = (args.node_ids || []).map((id) => findAgentOwnedCanvasNode(id, context));
  const idMap = new Map();
  const created = [];
  await context.forEachBatched(nodes, async (source) => {
    assertCanvasAgentContext(context);
    const item = serializeCanvasNode(source);
    const nextId = String(canvasState.nextNode);
    idMap.set(String(item.id), nextId);
    item.id = nextId;
    item.x += Number(args.offset_x || 48);
    item.y += Number(args.offset_y || 48);
    if (Array.isArray(item.groupMembers)) item.groupMembers = [];
    const restoreContext = { maxId: 0, legacyResults: [], migratedLegacyCount: 0 };
    const node = restoreCanvasBoardNode(item, serializeCanvasBoard(), restoreContext);
    node.dataset.boardId = String(context.scope.boardId);
    if (item.resultSrc && node.classList.contains("canvas-node-image")) {
      updateCanvasGenerationResult(node, { src: item.resultSrc, savedUrl: item.resultDownloadUrl || item.resultSrc });
    }
    created.push(node);
  });
  canvasState.connections
    .filter((item) => idMap.has(String(item.from)) && idMap.has(String(item.to)))
    .map((item) => ({ from: idMap.get(String(item.from)), to: idMap.get(String(item.to)), toPort: item.toPort || "input" }))
    .forEach((item) => canvasState.connections.push(item));
  scheduleCanvasConnectionRender();
  scheduleCanvasSave();
  return { node_ids: created.map((node) => node.dataset.id), nodes: created.map(getAgentCanvasNodeResult) };
}

async function moveAgentCanvasNodes(args = {}, context) {
  const nodes = (args.node_ids || []).map((id) => findAgentOwnedCanvasNode(id, context));
  await context.forEachBatched(nodes, async (node) => {
    setCanvasNodePoint(node, {
      x: Number(node.dataset.x || 0) + Number(args.delta_x || 0),
      y: Number(node.dataset.y || 0) + Number(args.delta_y || 0),
    });
    updateCanvasNodePosition(node);
  });
  scheduleCanvasConnectionRender();
  scheduleCanvasSave();
  return { node_ids: nodes.map((node) => node.dataset.id) };
}

async function arrangeAgentCanvasNodes(args = {}, context) {
  const nodes = (args.node_ids || []).map((id) => findAgentOwnedCanvasNode(id, context));
  if (!nodes.length) throw new Error("排列至少需要一个节点。");
  const direction = ["row", "column", "grid"].includes(args.direction) ? args.direction : "row";
  const gap = Math.max(24, Math.min(800, Number(args.gap) || 80));
  const startX = hasCanvasAgentNumber(args.start_x) ? Number(args.start_x) : Math.min(...nodes.map((node) => Number(node.dataset.x || 0)));
  const startY = hasCanvasAgentNumber(args.start_y) ? Number(args.start_y) : Math.min(...nodes.map((node) => Number(node.dataset.y || 0)));
  const offsets = window.CanvasAgentCore.planArrangementOffsets(nodes.map((node) => ({
    width: node.offsetWidth || Number(node.dataset.width || 320),
    height: node.offsetHeight || Number(node.dataset.height || 260),
  })), direction, gap);
  await context.forEachBatched(nodes, async (node, index) => {
    setCanvasNodePoint(node, { x: startX + offsets[index].x, y: startY + offsets[index].y });
    updateCanvasNodePosition(node);
  });
  scheduleCanvasConnectionRender();
  scheduleCanvasSave();
  return { node_ids: nodes.map((node) => node.dataset.id), direction };
}

function focusAgentCanvasNodes(ids, context) {
  const nodes = (Array.isArray(ids) ? ids : []).map((id) => findAgentOwnedCanvasNode(id, context));
  if (!nodes.length) throw new Error("请先指定要定位的画布节点。");
  const focused = focusAgentCanvasNodesInViewport(nodes);
  assertCanvasAgentContext(context);
  if (!focused) throw new Error("暂时无法定位这些画布节点。");
  return {
    node_ids: nodes.map((node) => node.dataset.id),
    nodes: nodes.map(getAgentCanvasNodeResult),
    focused: true,
  };
}

function getAgentCanvasNodesToOrganize(args = {}, context) {
  const requestedIds = [...new Set((Array.isArray(args.node_ids) ? args.node_ids : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean))];
  if (requestedIds.length) return requestedIds.map((id) => findAgentOwnedCanvasNode(id, context));

  const boardId = assertCanvasAgentContext(context);
  const groupedIds = new Set(Array.from(document.querySelectorAll("#canvasPlane .canvas-node-group"))
    .filter((node) => String(node.dataset.boardId || "") === boardId)
    .flatMap((node) => getCanvasGroupMemberIds(node)));
  return Array.from(document.querySelectorAll("#canvasPlane .canvas-node"))
    .filter((node) => String(node.dataset.boardId || "") === boardId)
    .filter((node) => !node.classList.contains("canvas-node-group"))
    .filter((node) => !groupedIds.has(String(node.dataset.id || "")));
}

function resolveAgentCanvasOrganizationDirection(requested, nodes) {
  if (["row", "column", "grid"].includes(requested)) return requested;
  if (nodes.length <= 3) return "row";
  return "grid";
}

async function organizeAgentCanvasNodes(args = {}, context) {
  const nodes = getAgentCanvasNodesToOrganize(args, context);
  if (!nodes.length) {
    return {
      node_ids: [],
      organized_count: 0,
      skipped_grouped_nodes: true,
      message: "当前画布没有可独立整理的节点。",
    };
  }
  const requestedDirection = String(args.direction || "auto");
  const gap = Math.max(24, Math.min(800, Number(args.gap) || 80));
  const startX = Math.min(...nodes.map((node) => Number(node.dataset.x || 0)));
  const startY = Math.min(...nodes.map((node) => Number(node.dataset.y || 0)));
  const nodeIds = new Set(nodes.map((node) => String(node.dataset.id || "")));
  const internalConnections = canvasState.connections.filter((connection) => (
    nodeIds.has(String(connection.from || "")) && nodeIds.has(String(connection.to || ""))
  ));
  const useWorkflowLayout = requestedDirection === "auto"
    && internalConnections.length > 0
    && typeof window.CanvasAgentCore.planWorkflowArrangement === "function";
  const direction = useWorkflowLayout ? "workflow" : resolveAgentCanvasOrganizationDirection(requestedDirection, nodes);
  const layoutItems = nodes.map((node) => ({
    id: node.dataset.id,
    width: node.offsetWidth || Number(node.dataset.width || 320),
    height: node.offsetHeight || Number(node.dataset.height || 260),
    x: Number(node.dataset.x || 0),
    y: Number(node.dataset.y || 0),
  }));
  const offsets = useWorkflowLayout
    ? window.CanvasAgentCore.planWorkflowArrangement(layoutItems, internalConnections, gap)
    : window.CanvasAgentCore.planArrangementOffsets(layoutItems, direction, gap);
  await context.forEachBatched(nodes, async (node, index) => {
    setCanvasNodePoint(node, { x: startX + offsets[index].x, y: startY + offsets[index].y });
    updateCanvasNodePosition(node);
  });
  assertCanvasAgentContext(context);
  scheduleCanvasConnectionRender();
  scheduleCanvasSave();
  const focused = args.center_view === true ? focusAgentCanvasNodesInViewport(nodes) : false;
  return {
    node_ids: nodes.map((node) => node.dataset.id),
    organized_count: nodes.length,
    direction,
    focused,
  };
}

function parseAgentCanvasCropRatio(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d+(?:\.\d+)?)\s*[:x×/]\s*(\d+(?:\.\d+)?)$/i);
  if (!match) throw new Error("裁切比例请使用 1:1、4:5 或 16:9 这样的格式。");
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!(width > 0) || !(height > 0)) throw new Error("裁切比例必须大于 0。");
  return width / height;
}

function getAgentCanvasCropSource(node) {
  return String(node?.dataset?.imageSrc || node?.dataset?.resultSrc || "").trim();
}

function getAgentCanvasCropRect(width, height, ratio, position = "center") {
  const sourceRatio = width / height;
  const cropWidth = sourceRatio > ratio ? Math.round(height * ratio) : width;
  const cropHeight = sourceRatio > ratio ? height : Math.round(width / ratio);
  let x = Math.round((width - cropWidth) / 2);
  let y = Math.round((height - cropHeight) / 2);
  if (position === "top") y = 0;
  if (position === "bottom") y = height - cropHeight;
  if (position === "left") x = 0;
  if (position === "right") x = width - cropWidth;
  return { x: Math.max(0, x), y: Math.max(0, y), width: Math.max(1, cropWidth), height: Math.max(1, cropHeight) };
}

async function cropAgentCanvasImage(args = {}, context) {
  const sourceNode = findAgentOwnedCanvasNode(args.node_id, context);
  if (!sourceNode.classList.contains("canvas-node-image")) throw new Error("目标不是可裁切的图片节点。");
  focusAgentCanvasNodesInViewport([sourceNode]);
  const source = getAgentCanvasCropSource(sourceNode);
  if (!source) throw new Error("这个图片节点还没有可裁切的图片结果。");
  if (args.aspect_ratio === null || args.aspect_ratio === undefined || !String(args.aspect_ratio).trim()) {
    startCanvasImageCrop(sourceNode);
    return { node_id: sourceNode.dataset.id, editor_open: true, focused: true };
  }

  let image;
  try {
    image = await loadImageElement(source);
  } catch {
    throw new Error("裁切原图加载失败，请稍后重试。");
  }
  assertCanvasAgentContext(context);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!(width > 0) || !(height > 0)) throw new Error("裁切原图尺寸无效。");
  const ratio = parseAgentCanvasCropRatio(args.aspect_ratio);
  const rect = getAgentCanvasCropRect(width, height, ratio, String(args.position || "center"));
  const canvas = document.createElement("canvas");
  canvas.width = rect.width;
  canvas.height = rect.height;
  const draw = canvas.getContext("2d");
  draw.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  const cropped = canvas.toDataURL("image/png");
  const name = appendNameSuffix(sourceNode.dataset.imageName || "image.png", "裁剪");
  let targetNode = sourceNode;
  if (args.create_copy !== false) {
    const point = {
      x: Number(sourceNode.dataset.x || 0) + (sourceNode.offsetWidth || Number(sourceNode.dataset.width || 320)) + 72,
      y: Number(sourceNode.dataset.y || 0),
    };
    targetNode = addCanvasImage(cropped, name, point);
    targetNode.dataset.boardId = String(context.scope.boardId);
  } else {
    if (targetNode.dataset.uploadOnly === "true") renderCanvasUploadNode(targetNode, { src: cropped, name });
    else renderCanvasImageNode(targetNode, { src: cropped, name });
    updateCanvasNodePosition(targetNode);
  }
  assertCanvasAgentContext(context);
  refreshCanvasConnectedNodes(targetNode.dataset.id);
  scheduleCanvasConnectionRender();
  scheduleCanvasSave();
  focusAgentCanvasNodesInViewport(targetNode === sourceNode ? [targetNode] : [sourceNode, targetNode]);
  return {
    node_id: targetNode.dataset.id,
    source_node_id: sourceNode.dataset.id,
    aspect_ratio: String(args.aspect_ratio),
    position: String(args.position || "center"),
    created_copy: targetNode !== sourceNode,
    focused: true,
  };
}

async function openAgentCanvasMaskEditor(id, context) {
  const node = findAgentOwnedCanvasNode(id, context);
  if (!node.classList.contains("canvas-node-image") || !getAgentCanvasCropSource(node)) {
    throw new Error("目标不是可编辑的图片节点。");
  }
  focusAgentCanvasNodesInViewport([node]);
  const opened = await openCanvasMaskEditor(node);
  assertCanvasAgentContext(context);
  if (!opened) throw new Error("遮罩编辑器暂时无法打开，请稍后重试。");
  return { node_id: node.dataset.id, editor_open: true, focused: true };
}

function connectAgentCanvasNodes(args = {}, context) {
  const from = findAgentOwnedCanvasNode(args.from_id, context);
  const to = findAgentOwnedCanvasNode(args.to_id, context);
  connectCanvasNodes(from.dataset.id, to.dataset.id, args.to_port || "input");
  return { from_id: from.dataset.id, to_id: to.dataset.id, to_port: args.to_port || "input" };
}

function disconnectAgentCanvasNodes(args = {}, context) {
  const from = findAgentOwnedCanvasNode(args.from_id, context);
  const to = findAgentOwnedCanvasNode(args.to_id, context);
  disconnectCanvasNodes(from.dataset.id, to.dataset.id);
  scheduleCanvasSave();
  return { from_id: from.dataset.id, to_id: to.dataset.id };
}

function setAgentCanvasReferenceOrder(args = {}, context) {
  const node = findAgentOwnedCanvasNode(args.node_id, context);
  const order = (args.reference_node_ids || []).map((id) => findAgentOwnedCanvasNode(id, context).dataset.id);
  setCanvasNodeRefOrder(node, order);
  updateCanvasNodeRefs(node);
  scheduleCanvasSave();
  return { node_id: node.dataset.id, reference_node_ids: order };
}

function groupAgentCanvasNodes(args = {}, context) {
  const members = (args.node_ids || []).map((id) => findAgentOwnedCanvasNode(id, context))
    .filter((node) => !node.classList.contains("canvas-node-group"));
  if (!members.length) throw new Error("分组至少需要一个普通节点。");
  let group = args.group_id ? findAgentOwnedCanvasNode(args.group_id, context) : null;
  if (group && !group.classList.contains("canvas-node-group")) throw new Error("目标不是分组节点。");
  if (!group) {
    const bounds = getCanvasNodesBounds(members);
    group = createCanvasNode("group");
    setCanvasNodePoint(group, { x: bounds.left - 36, y: bounds.top - 58 });
    group.dataset.width = String(Math.max(280, Math.round(bounds.right - bounds.left + 72)));
    group.dataset.height = String(Math.max(180, Math.round(bounds.bottom - bounds.top + 92)));
    renderCanvasGroupNode(group, { title: String(args.title || "GROUP"), memberIds: members.map((node) => node.dataset.id) });
    applyCanvasNodeSize(group);
    placeCanvasNode(group);
  } else {
    setCanvasGroupMemberIds(group, Array.from(new Set([...getCanvasGroupMemberIds(group), ...members.map((node) => node.dataset.id)])));
    updateCanvasGroupCounts();
  }
  group.dataset.boardId = String(context.scope.boardId);
  mergeGroupedImageConnections(group, members);
  scheduleCanvasSave();
  return { group_id: group.dataset.id, node_ids: getCanvasGroupMemberIds(group) };
}

function ungroupAgentCanvasNodes(args = {}, context) {
  const group = findAgentOwnedCanvasNode(args.group_id, context);
  if (!group.classList.contains("canvas-node-group")) throw new Error("目标不是分组节点。");
  const current = getCanvasGroupMemberIds(group);
  const remove = new Set((args.node_ids || []).map(String));
  const remaining = remove.size ? current.filter((id) => !remove.has(id)) : [];
  if (remaining.length) {
    setCanvasGroupMemberIds(group, remaining);
    updateCanvasGroupCounts();
  } else {
    deleteCanvasNodes([group]);
  }
  scheduleCanvasSave();
  return { group_id: args.group_id, remaining_node_ids: remaining };
}

function updateAgentCanvasGallery(args = {}, context) {
  const node = findAgentOwnedCanvasNode(args.node_id, context);
  if (!node.classList.contains("canvas-node-gallery")) throw new Error("目标不是图集节点。");
  let images = getCanvasGalleryImages(node);
  const remove = new Set((args.remove_image_ids || []).map(String));
  if (remove.size) images = images.filter((image) => !remove.has(String(image.id)));
  if (Array.isArray(args.image_ids) && args.image_ids.length) {
    const byId = new Map(images.map((image) => [String(image.id), image]));
    images = args.image_ids.map((id) => byId.get(String(id))).filter(Boolean);
  }
  const addedBySourceId = new Map();
  let alreadyPresent = false;
  (args.add_node_ids || []).forEach((sourceId) => {
    const sourceNode = findAgentOwnedCanvasNode(sourceId, context);
    if (sourceNode === node) throw new Error("不能把图集自身重复加入图集。");
    const isConnectedGenerator = sourceNode.classList.contains("canvas-node-image")
      && canvasState.connections.some((item) => item.from === sourceNode.dataset.id && item.to === node.dataset.id);
    if (isConnectedGenerator && images.length) {
      alreadyPresent = true;
      const active = images.find((image) => String(image.id) === String(node.dataset.galleryActiveImageId || "")) || images.at(-1);
      if (active) addedBySourceId.set(String(sourceNode.dataset.id), active);
      return;
    }
    const output = getCanvasNodeOutput(sourceNode);
    const src = output?.url || output?.originalUrl || "";
    if (!src || !["image", "grid-editor"].includes(String(output?.type || ""))) {
      throw new Error(`节点 ${sourceNode.dataset.id} 当前没有可加入图集的图片。`);
    }
    const existing = images.find((image) => (image.src || image.savedUrl || image.url) === src);
    if (existing) {
      addedBySourceId.set(String(sourceNode.dataset.id), existing);
      return;
    }
    const image = {
      id: createId(),
      sourceNodeId: String(sourceNode.dataset.id),
      name: output.name || `画布图片 ${images.length + 1}`,
      src,
      savedUrl: output.url || src,
      createdAt: new Date().toISOString(),
    };
    images.push(image);
    addedBySourceId.set(String(sourceNode.dataset.id), image);
  });
  let activeImageId = node.dataset.galleryActiveImageId || "";
  if (args.active_image_id !== null && args.active_image_id !== undefined) {
    const requested = String(args.active_image_id);
    const active = images.find((image) => String(image.id) === requested) || addedBySourceId.get(requested);
    if (!active) throw new Error(`图集中找不到图片 ${requested}。`);
    activeImageId = active.id;
  }
  renderCanvasGalleryNode(node, {
    images,
    title: args.title === null || args.title === undefined ? node.dataset.galleryTitle || "生成图集" : String(args.title),
    activeImageId,
    columns: args.columns,
    gap: args.gap,
  });
  scheduleCanvasSave();
  return {
    node_id: node.dataset.id,
    image_count: images.length,
    active_image_id: node.dataset.galleryActiveImageId || "",
    image_ids: getCanvasGalleryImages(node).map((image) => image.id),
    ...(alreadyPresent ? { already_present: true } : {}),
  };
}

function updateAgentCanvasGrid(args = {}, context) {
  const node = findAgentOwnedCanvasNode(args.node_id, context);
  if (!node.classList.contains("canvas-node-grid-editor")) throw new Error("目标不是宫格编辑节点。");
  if (Number.isInteger(args.rows) || Number.isInteger(args.columns)) {
    const state = getCanvasGridEditorState(node);
    const rows = Number.isInteger(args.rows) ? args.rows : state.rows;
    const columns = Number.isInteger(args.columns) ? args.columns : state.columns;
    const maxTargets = window.CanvasAgentCapabilities?.MAX_BATCH_TARGETS || 40;
    if (rows * columns > maxTargets) throw new Error(`Agent 一次最多输出 ${maxTargets} 个宫格。`);
    setCanvasGridEditorSpec(node, rows, columns);
  }
  if (hasCanvasAgentNumber(args.uniform_gap)) setCanvasGridEditorUniformGap(node, Number(args.uniform_gap));
  if (args.cell_key && hasCanvasAgentNumber(args.cell_zoom)) setCanvasGridEditorCellZoom(node, String(args.cell_key), Number(args.cell_zoom));
  scheduleCanvasSave();
  return { node_id: node.dataset.id, state: getCanvasGridEditorState(node) };
}

async function extractAgentCanvasGrid(args = {}, context) {
  const node = findAgentOwnedCanvasNode(args.node_id, context);
  if (!node.classList.contains("canvas-node-grid-editor")) throw new Error("目标不是宫格编辑节点。");
  const state = getCanvasGridEditorState(node);
  const maxTargets = window.CanvasAgentCapabilities?.MAX_BATCH_TARGETS || 40;
  if (state.rows * state.columns > maxTargets) throw new Error(`Agent 一次最多输出 ${maxTargets} 个宫格。`);
  const gallery = await outputCanvasGridEditorGallery(node, { guard: createCanvasOperationGuard(context) });
  assertCanvasAgentContext(context);
  if (!gallery) throw new Error("宫格切片没有生成图集。");
  gallery.dataset.boardId = String(context.scope.boardId);
  return getAgentCanvasNodeResult(gallery);
}

async function generateAgentCanvasImageToGallery(args = {}, context) {
  assertCanvasAgentContext(context);
  const prompt = String(args.prompt || "").trim();
  if (!prompt) return { ok: false, code: "prompt_required", error: "请先描述要生成的图片。" };

  const referenceIds = [...new Set((Array.isArray(args.reference_node_ids) ? args.reference_node_ids : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean))];
  const referenceNodes = referenceIds.map((id) => findAgentOwnedCanvasNode(id, context));
  const requiresEdit = referenceNodes.some((referenceNode) => {
    const output = getCanvasNodeOutput(referenceNode);
    return ["image", "grid-editor", "group", "loop"].includes(String(output?.type || ""));
  });
  const explicitModel = String(args.model || "").trim() || null;
  const candidate = await ensureCanvasAgentImageModelCandidate({
    requestedModel: explicitModel,
    requiresEdit,
    size: args.size,
    resolution: args.resolution,
  });
  assertCanvasAgentContext(context);
  if (!candidate) {
    return {
      ok: false,
      code: "no_usable_image_model",
      error: explicitModel
        ? `当前没有可用的“${explicitModel}”生图模型，已停止执行；请在设置中启用该模型后重试。`
        : requiresEdit
          ? "当前没有可用且支持参考图编辑的 image2 模型，已停止执行；请先在设置中启用一个。"
          : "当前没有可用的 image2 生图模型，已停止执行；请先在设置中启用一个。",
    };
  }

  const [generatorPoint] = getAgentCanvasOpenRowPoints([
    { width: 320, height: 380 },
    { width: 320, height: 380 },
  ], 90);
  const node = addCanvasImagePlaceholder(generatorPoint);
  node.dataset.boardId = String(context.scope.boardId);
  applyAgentCanvasNodeChanges(node, {
    prompt,
    model: candidate.id,
    size: args.size,
    resolution: args.resolution,
  });
  connectAgentReferenceNodes(referenceIds, node.dataset.id, context);
  scheduleCanvasConnectionRender();
  scheduleCanvasSave();

  const guard = createCanvasOperationGuard(context);
  const generated = await runCanvasImageEdit(node, { guard, autoFailover: true });
  assertCanvasAgentContext(context);
  if (!generated?.ok && !generated?.image) {
    return {
      ok: false,
      code: generated?.code || "generation_failed",
      error: generated?.error || "图片生成失败。",
      node_id: node.dataset.id,
    };
  }

  let gallery;
  try {
    gallery = ensureAgentCanvasImageInGallery(node, generated.image, context);
  } catch {
    return {
      ok: false,
      code: "gallery_update_failed",
      error: "图片已经生成，但暂时没有写入图集；生成节点和结果已保留。",
      node_id: node.dataset.id,
    };
  }
  if (!gallery) {
    return { ok: false, code: "gallery_empty", error: "图片已返回，但没有成功加入图集。", node_id: node.dataset.id };
  }
  gallery.dataset.boardId = String(context.scope.boardId);
  if (String(args.title || "").trim()) applyAgentCanvasNodeChanges(gallery, { title: String(args.title).trim() });
  const images = getCanvasGalleryImages(gallery);
  const connected = canvasState.connections.some((item) => item.from === node.dataset.id && item.to === gallery.dataset.id);
  if (!connected || !images.length) {
    return { ok: false, code: "gallery_empty", error: "图片已返回，但没有成功加入图集。", node_id: node.dataset.id };
  }
  centerAgentCanvasNodesInViewport([node, gallery]);
  scheduleCanvasConnectionRender();
  scheduleCanvasSave();
  return {
    node_id: node.dataset.id,
    gallery_node_id: gallery.dataset.id,
    image_count: images.length,
    status: "图片已生成并加入图集",
    model: generated.model || String(node.querySelector(".canvas-node-model")?.value || ""),
    ...(generated.fallback ? { fallback: generated.fallback } : {}),
  };
}

function requestAgentImageNodeChoice(args = {}, context) {
  const node = findAgentOwnedCanvasNode(args.node_id, context);
  if (!node.classList.contains("canvas-node-image") || node.dataset.uploadOnly === "true") {
    throw new Error("目标不是可执行的图片生成节点。");
  }
  const before = { x: String(node.dataset.x || "0"), y: String(node.dataset.y || "0") };
  focusAgentCanvasNodesInViewport([node]);
  assertCanvasAgentContext(context);
  if (before.x !== String(node.dataset.x || "0") || before.y !== String(node.dataset.y || "0")) {
    throw new Error("定位节点时不能改变节点位置。");
  }
  const gallery = findConnectedCanvasGallery(node);
  const images = gallery ? getCanvasGalleryImages(gallery) : [];
  return {
    ok: true,
    decision_required: true,
    node_id: node.dataset.id,
    current_prompt: String(node.querySelector(".canvas-node-prompt")?.value || "").trim(),
    suggested_prompt: String(args.suggested_prompt || "").trim(),
    model: String(node.querySelector(".canvas-node-model")?.value || node.dataset.canvasModel || ""),
    has_result: Boolean(node.dataset.resultSrc || images.length),
    gallery_node_id: gallery?.dataset.id || null,
    options: ["rerun", "update", "new"],
  };
}

async function runAgentCanvasNodeWithGuard(id, context) {
  const node = findAgentOwnedCanvasNode(id, context);
  const guard = createCanvasOperationGuard(context);
  let generated = null;
  if (node.classList.contains("canvas-node-image")) generated = await runCanvasImageEdit(node, { guard, autoFailover: true });
  else if (node.classList.contains("canvas-node-llm")) await runCanvasLlmNode(node, { guard });
  else if (node.classList.contains("canvas-node-comfy")) await runCanvasComfyNode(node, { guard });
  else if (node.classList.contains("canvas-node-minimax-h3")) await runCanvasMinimaxH3Node(node, { guard });
  else throw new Error("这个节点不能执行生成。");
  assertCanvasAgentContext(context);
  if (node.classList.contains("canvas-node-image")) {
    if (!generated?.ok) {
      return {
        ok: false,
        node_id: node.dataset.id,
        code: generated?.code || "generation_failed",
        error: generated?.error || "图片生成失败。",
      };
    }
    const gallery = generated.gallery || findConnectedCanvasGallery(node);
    const images = gallery ? getCanvasGalleryImages(gallery) : [];
    if (!gallery || !images.length) {
      return {
        ok: false,
        node_id: node.dataset.id,
        code: "gallery_empty",
        error: "图片已返回，但没有成功加入图集。",
      };
    }
    gallery.dataset.boardId = String(context.scope.boardId);
    return {
      ok: true,
      node_id: node.dataset.id,
      gallery_node_id: gallery.dataset.id,
      image_count: images.length,
      status: "图片已生成并加入图集",
      output: generated.image || null,
      model: generated.model || String(node.querySelector(".canvas-node-model")?.value || ""),
      ...(generated.fallback ? { fallback: generated.fallback } : {}),
    };
  }
  const status = String(node.querySelector(".canvas-h3-status, .canvas-node-status")?.textContent || "").trim();
  if (/失败|错误/.test(status)) return { ok: false, node_id: node.dataset.id, code: "generation_failed", error: status };
  return { node_id: node.dataset.id, status: status || "执行完成", output: getCanvasNodeOutput(node) || null };
}

function deleteAgentCanvasNodes(ids, context) {
  const nodes = (ids || []).map((id) => findAgentOwnedCanvasNode(id, context));
  const nodeIds = nodes.map((node) => node.dataset.id);
  deleteCanvasNodes(nodes);
  return { node_ids: nodeIds, deleted_count: nodeIds.length };
}

const CanvasAgentCanvasApi = Object.freeze({
  getBoardId: () => String(canvasState.activeBoardId || ""),
  getNode: (id, context) => findAgentOwnedCanvasNode(id, context),
  getNodes: (ids, context) => (ids || []).map((id) => findAgentOwnedCanvasNode(id, context)),
  createNode: createAgentCanvasNode,
  updateNode: updateAgentCanvasNodeFields,
  duplicateNodes: duplicateAgentCanvasNodes,
  moveNodes: moveAgentCanvasNodes,
  arrangeNodes: arrangeAgentCanvasNodes,
  connect: connectAgentCanvasNodes,
  disconnect: disconnectAgentCanvasNodes,
  setReferenceOrder: setAgentCanvasReferenceOrder,
  group: groupAgentCanvasNodes,
  ungroup: ungroupAgentCanvasNodes,
  updateGallery: updateAgentCanvasGallery,
  updateGrid: updateAgentCanvasGrid,
  extractGrid: extractAgentCanvasGrid,
  focusNodes: focusAgentCanvasNodes,
  organizeNodes: organizeAgentCanvasNodes,
  cropImage: cropAgentCanvasImage,
  openMaskEditor: openAgentCanvasMaskEditor,
  runNode: runAgentCanvasNodeWithGuard,
  generateImageToGallery: generateAgentCanvasImageToGallery,
  requestImageNodeChoice: requestAgentImageNodeChoice,
  deleteNodes: deleteAgentCanvasNodes,
  scheduleCheckpoint: (context) => {
    assertCanvasAgentContext(context);
    scheduleCanvasConnectionRender();
    scheduleCanvasSave();
  },
});
window.CanvasAgentCanvasApi = CanvasAgentCanvasApi;

function placeCanvasNode(node) {
  document.querySelector("#canvasPlane")?.append(node);
  canvasVirtualStore.setMounted(node.dataset.id, node, node.dataset.virtualLevel || "full");
  if (node.dataset.virtualManaged !== "true") {
    canvasVirtualStore.mergeSerialized(node.dataset.id, serializeCanvasNode(node));
    node.dataset.virtualManaged = "true";
  }
  updateCanvasNodePosition(node);
  updateCanvasOrigin();
}

function beginCanvasPan(event) {
  if (event.button !== 0 && event.button !== 1) return;
  const start = { x: event.clientX, y: event.clientY, offsetX: canvasState.x, offsetY: canvasState.y };
  event.preventDefault();
  const move = (moveEvent) => {
    canvasState.x = start.offsetX + moveEvent.clientX - start.x;
    canvasState.y = start.offsetY + moveEvent.clientY - start.y;
    scheduleCanvasTransform();
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    scheduleCanvasViewportSave();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up, { once: true });
  window.addEventListener("pointercancel", up, { once: true });
}

function beginCanvasNodeDrag(event, node) {
  if (event.target.closest("button, textarea, select, input, .canvas-text, .canvas-resize-handle, .canvas-group-thumb")) return;
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  if (!node.classList.contains("is-selected")) selectCanvasNode(node);
  const selectedNodes = getCanvasDragNodes(getSelectedCanvasNodes());
  const start = {
    x: event.clientX,
    y: event.clientY,
    nodes: selectedNodes.map((item) => ({
      node: item,
      x: Number(item.dataset.x),
      y: Number(item.dataset.y),
      before: toCanvasOperationNode(syncCanvasNodeModel(item) || serializeCanvasNode(item)),
    })),
  };
  const move = (moveEvent) => {
    const deltaX = (moveEvent.clientX - start.x) / canvasState.scale;
    const deltaY = (moveEvent.clientY - start.y) / canvasState.scale;
    start.nodes.forEach((item) => {
      item.node.dataset.x = String(item.x + deltaX);
      item.node.dataset.y = String(item.y + deltaY);
      updateCanvasNodePosition(item.node);
    });
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    updateCanvasGroupMembership(start.nodes.map((item) => item.node));
    const forward = start.nodes.map((item) => {
      const after = toCanvasOperationNode(syncCanvasNodeModel(item.node) || serializeCanvasNode(item.node));
      return {
        type: "node.upsert",
        entityId: String(after.id),
        before: item.before,
        after,
      };
    });
    if (forward.some((operation) => !sameCanvasOperationValue(operation.before, operation.after))) {
      recordCanvasUndo({
        label: "移动节点",
        forward,
        inverse: forward.map((operation) => ({
          type: "node.upsert",
          entityId: operation.entityId,
          before: operation.after,
          after: operation.before,
        })),
      });
      forward.forEach((operation) => stageCanvasOperation(operation));
    }
    scheduleCanvasSave();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up, { once: true });
  window.addEventListener("pointercancel", up, { once: true });
}

function getCanvasDragNodes(nodes) {
  const dragNodes = new Map();
  Array.from(nodes || []).forEach((item) => {
    if (!item) return;
    dragNodes.set(item.dataset.id, item);
    if (item.classList.contains("canvas-node-group")) {
      getCanvasGroupMemberIds(item)
        .map((id) => getCanvasNode(id))
        .filter(Boolean)
        .forEach((member) => dragNodes.set(member.dataset.id, member));
    }
  });
  return Array.from(dragNodes.values());
}

function updateCanvasGroupMembership(movedNodes) {
  const groups = Array.from(document.querySelectorAll("#canvasPlane .canvas-node-group"));
  if (!groups.length) return;
  const moved = Array.from(movedNodes || [])
    .filter((node) => node && !node.classList.contains("canvas-node-group"));
  if (!moved.length) return;
  const changedGroups = new Set();
  moved.forEach((node) => {
    const targetGroup = findContainingCanvasGroup(node);
    if (targetGroup) {
      const box = getCanvasNodeBox(targetGroup);
      const nodeBox = getCanvasNodeBox(node);
      const padding = 28;
      const nextRight = Math.max(box.right, nodeBox.right + padding);
      const nextBottom = Math.max(box.bottom, nodeBox.bottom + padding);
      if (nextRight > box.right || nextBottom > box.bottom) {
        targetGroup.dataset.width = String(Math.round(nextRight - box.left));
        targetGroup.dataset.height = String(Math.round(nextBottom - box.top));
        applyCanvasNodeSize(targetGroup);
      }
    }
    groups.forEach((group) => {
      const ids = getCanvasGroupMemberIds(group);
      const has = ids.includes(node.dataset.id);
      const shouldHave = targetGroup === group;
      if (shouldHave && !has) {
        ids.push(node.dataset.id);
        setCanvasGroupMemberIds(group, sortCanvasGroupMemberIds(ids));
        changedGroups.add(group);
      }
      if (!shouldHave && has) {
        setCanvasGroupMemberIds(group, ids.filter((id) => id !== node.dataset.id));
        changedGroups.add(group);
      }
    });
  });
  changedGroups.forEach((group) => {
    updateCanvasGroupCounts();
    refreshCanvasConnectedNodes(group.dataset.id);
  });
  if (changedGroups.size) setCanvasStatus("已更新组内节点。");
}

function refreshCanvasGroupMembership(group) {
  if (!group?.classList?.contains("canvas-node-group")) return;
  const currentIds = getCanvasGroupMemberIds(group);
  const nodes = Array.from(document.querySelectorAll("#canvasPlane .canvas-node"))
    .filter((node) => !node.classList.contains("canvas-node-group"))
    .filter((node) => isCanvasNodeInsideGroup(node, group));
  const nextIds = sortCanvasNodesByPosition(nodes).map((node) => node.dataset.id);
  if (nextIds.join("|") === currentIds.join("|")) return;
  setCanvasGroupMemberIds(group, nextIds);
  updateCanvasGroupCounts();
  refreshCanvasConnectedNodes(group.dataset.id);
  setCanvasStatus("已更新组内节点。");
}

function findContainingCanvasGroup(node) {
  const center = getCanvasNodeCenter(node);
  return Array.from(document.querySelectorAll("#canvasPlane .canvas-node-group"))
    .filter((group) => group.dataset.id !== node.dataset.id)
    .find((group) => {
      const box = getCanvasNodeBox(group);
      return center.x >= box.left && center.x <= box.right && center.y >= box.top && center.y <= box.bottom;
    }) || null;
}

function isCanvasNodeInsideGroup(node, group) {
  const center = getCanvasNodeCenter(node);
  const box = getCanvasNodeBox(group);
  return center.x >= box.left && center.x <= box.right && center.y >= box.top && center.y <= box.bottom;
}

function getCanvasNodeCenter(node) {
  const box = getCanvasNodeBox(node);
  return {
    x: (box.left + box.right) / 2,
    y: (box.top + box.bottom) / 2,
  };
}

function getCanvasNodeBox(node) {
  const x = Number(node.dataset.x || 0);
  const y = Number(node.dataset.y || 0);
  return {
    left: x,
    top: y,
    right: x + (node.offsetWidth || Number(node.dataset.width || 292)),
    bottom: y + (node.offsetHeight || Number(node.dataset.height || 180)),
  };
}

function sortCanvasGroupMemberIds(ids) {
  return sortCanvasNodesByPosition(ids.map((id) => getCanvasNode(id)).filter(Boolean))
    .map((node) => node.dataset.id);
}

function getCanvasNodeMinWidth(node) {
  if (node.classList.contains("canvas-node-group")) return 180;
  if (node.classList.contains("canvas-node-grid-editor")) return 420;
  if (node.classList.contains("canvas-node-generator")) return 320;
  return 220;
}

function beginCanvasNodeResize(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.setPointerCapture?.(event.pointerId);
  const node = event.currentTarget.closest(".canvas-node");
  if (!node) return;
  selectCanvasNode(node);
  const start = {
    x: event.clientX,
    y: event.clientY,
    width: node.offsetWidth,
    height: Number(node.dataset.height || getCanvasNodeBodyHeight(node)),
  };
  const move = (moveEvent) => {
    const deltaX = (moveEvent.clientX - start.x) / canvasState.scale;
    const deltaY = (moveEvent.clientY - start.y) / canvasState.scale;
    const minWidth = getCanvasNodeMinWidth(node);
    const minHeight = node.classList.contains("canvas-node-group") ? 120 : 120;
    const wideNode = node.classList.contains("canvas-node-group")
      || node.classList.contains("canvas-node-gallery")
      || node.classList.contains("canvas-node-grid-editor");
    const maxWidth = wideNode ? 1600 : 820;
    const maxHeight = node.classList.contains("canvas-node-group") || node.classList.contains("canvas-node-grid-editor")
      ? 1600
      : node.classList.contains("canvas-node-gallery") ? 1200 : 760;
    const width = Math.max(minWidth, Math.min(maxWidth, start.width + deltaX));
    const height = Math.max(minHeight, Math.min(maxHeight, start.height + deltaY));
    node.dataset.width = String(Math.round(width));
    if (node.classList.contains("canvas-node-gallery") || node.classList.contains("canvas-node-grid-editor")) {
      delete node.dataset.height;
      node.style.removeProperty("--canvas-node-media-height");
    } else {
      node.dataset.height = String(Math.round(height));
    }
    applyCanvasNodeSize(node);
    if (node.classList.contains("canvas-node-gallery")) {
      void node.offsetWidth;
      updateCanvasGalleryLayout(node);
    } else {
      scheduleCanvasConnectionRender({ trailing: false });
    }
    if (node.classList.contains("canvas-node-group")) refreshCanvasGroupMembership(node);
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    if (node.classList.contains("canvas-node-group")) refreshCanvasGroupMembership(node);
    releaseCanvasGroupFocus();
    scheduleCanvasSave();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up, { once: true });
  window.addEventListener("pointercancel", up, { once: true });
}

function releaseCanvasGroupFocus() {
  const release = () => {
    document.querySelectorAll("#canvasPlane .canvas-node-group.is-selected").forEach((group) => {
      group.classList.remove("is-selected");
      canvasState.selectedIds.delete(group.dataset.id);
      if (canvasState.activeNode === group) canvasState.activeNode = null;
    });
    updateCanvasSelectionFrame();
    updateCanvasGroupAction();
  };
  release();
  requestAnimationFrame(release);
}

function applyCanvasNodeSize(node) {
  const width = Number(node.dataset.width || 0);
  const height = Number(node.dataset.height || 0);
  if (width > 0) {
    node.style.width = `${width}px`;
    if (node.classList.contains("canvas-node-grid-editor")) {
      node.style.setProperty("--canvas-grid-editor-width", `${width}px`);
    }
  }
  if (height > 0) {
    if (node.classList.contains("canvas-node-group")) node.style.height = `${height}px`;
    else if (node.classList.contains("canvas-node-text")) node.style.setProperty("--canvas-node-text-height", `${height}px`);
    else if (node.classList.contains("canvas-node-grid-editor")) node.style.setProperty("--canvas-grid-editor-body-height", `${height}px`);
    else if ((node.classList.contains("canvas-node-image") && !node.dataset.imageSrc && !node.dataset.uploadOnly)
      || node.classList.contains("canvas-node-llm")) {
      node.style.setProperty("--canvas-node-prompt-height", `${height}px`);
    }
    else node.style.setProperty("--canvas-node-media-height", `${height}px`);
  }
}

function getCanvasNodeBodyHeight(node) {
  const sized = node.querySelector(".canvas-grid-editor-shell, .canvas-node-result:not([hidden]), .canvas-image-upload:not([hidden]), .canvas-node-prompt, .canvas-text");
  return sized?.offsetHeight || 180;
}

function dispatchCanvasSelectionChange() {
  if (canvasSelectionChangeQueued) return;
  canvasSelectionChangeQueued = true;
  queueMicrotask(() => {
    canvasSelectionChangeQueued = false;
    window.dispatchEvent(new CustomEvent("canvas:selectionchange", {
      detail: {
        selectedIds: getSelectedCanvasNodes().map((node) => String(node.dataset.id || "")).filter(Boolean),
      },
    }));
  });
}

function selectCanvasNode(node) {
  canvasState.selectionFrameVisible = false;
  clearCanvasSelection();
  addCanvasNodeToSelection(node);
  canvasState.activeNode = node;
  dispatchCanvasSelectionChange();
}

function clearCanvasSelection() {
  const selectedIds = Array.from(canvasState.selectedIds);
  document.querySelectorAll(".canvas-node.is-selected, .canvas-node.is-agent-focus")
    .forEach((item) => item.classList.remove("is-selected", "is-agent-focus"));
  canvasState.selectedIds.clear();
  selectedIds.forEach((id) => unpinCanvasNode(id));
  canvasState.activeNode = null;
  canvasState.selectionFrameVisible = false;
  updateCanvasGroupAction();
  updateCanvasSelectionFrame();
  dispatchCanvasSelectionChange();
}

function addCanvasNodeToSelection(node) {
  if (!node) return;
  node.classList.add("is-selected");
  canvasState.selectedIds.add(node.dataset.id);
  pinCanvasNode(node.dataset.id);
  canvasState.activeNode = node;
  updateCanvasGroupAction();
  updateCanvasSelectionFrame();
  dispatchCanvasSelectionChange();
}

function toggleCanvasNodeSelection(node) {
  if (!node) return;
  canvasState.selectionFrameVisible = false;
  if (node.classList.contains("is-selected")) {
    node.classList.remove("is-selected");
    canvasState.selectedIds.delete(node.dataset.id);
    unpinCanvasNode(node.dataset.id);
    canvasState.activeNode = getSelectedCanvasNodes().at(-1) || null;
  } else {
    addCanvasNodeToSelection(node);
  }
  updateCanvasGroupAction();
  updateCanvasSelectionFrame();
  dispatchCanvasSelectionChange();
}

function getSelectedCanvasNodes() {
  return Array.from(document.querySelectorAll("#canvasPlane .canvas-node.is-selected"));
}

function updateCanvasGroupAction() {
  const button = document.querySelector("#canvasGroup");
  if (!button) return;
  const canGroup = getSelectedCanvasNodes().some((node) => {
    const output = getCanvasNodeOutput(node);
    return output?.type === "image" || output?.type === "group";
  });
  button.disabled = !canGroup;
}

function updateCanvasSelectionFrame() {
  const box = document.querySelector("#canvasSelectionBox");
  const viewport = document.querySelector("#infiniteCanvas");
  if (!box || !viewport || box.classList.contains("is-marquee")) return;
  const selected = getSelectedCanvasNodes();
  if (!canvasState.selectionFrameVisible || selected.length < 2) {
    box.hidden = true;
    return;
  }
  const rects = selected.map((node) => node.getBoundingClientRect());
  const viewportRect = viewport.getBoundingClientRect();
  const left = Math.min(...rects.map((rect) => rect.left)) - viewportRect.left - 8;
  const top = Math.min(...rects.map((rect) => rect.top)) - viewportRect.top - 8;
  const right = Math.max(...rects.map((rect) => rect.right)) - viewportRect.left + 8;
  const bottom = Math.max(...rects.map((rect) => rect.bottom)) - viewportRect.top + 8;
  box.hidden = false;
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
  box.style.width = `${Math.max(0, right - left)}px`;
  box.style.height = `${Math.max(0, bottom - top)}px`;
}

function getCanvasNodesBounds(nodes) {
  const list = Array.from(nodes || []).filter(Boolean);
  if (!list.length) return null;
  return list.reduce((bounds, node) => {
    const x = Number(node.dataset.x || 0);
    const y = Number(node.dataset.y || 0);
    const width = node.offsetWidth || Number(node.dataset.width || 292);
    const height = node.offsetHeight || Number(node.dataset.height || 180);
    return {
      left: Math.min(bounds.left, x),
      top: Math.min(bounds.top, y),
      right: Math.max(bounds.right, x + width),
      bottom: Math.max(bounds.bottom, y + height),
    };
  }, { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
}

function beginCanvasMarquee(event) {
  if (event.button !== 0) return;
  const viewport = document.querySelector("#infiniteCanvas");
  const box = document.querySelector("#canvasSelectionBox");
  if (!viewport || !box) return;
  canvasState.selectionFrameVisible = true;
  const rect = viewport.getBoundingClientRect();
  const start = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
  event.preventDefault();
  box.hidden = false;
  box.classList.add("is-marquee");
  box.style.left = `${start.x}px`;
  box.style.top = `${start.y}px`;
  box.style.width = "0px";
  box.style.height = "0px";

  const move = (moveEvent) => {
    const currentX = moveEvent.clientX - rect.left;
    const currentY = moveEvent.clientY - rect.top;
    const left = Math.min(start.x, currentX);
    const top = Math.min(start.y, currentY);
    const width = Math.abs(currentX - start.x);
    const height = Math.abs(currentY - start.y);
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.width = `${width}px`;
    box.style.height = `${height}px`;
    selectCanvasNodesInScreenRect({
      left: rect.left + left,
      top: rect.top + top,
      right: rect.left + left + width,
      bottom: rect.top + top + height,
    });
  };

  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    box.classList.remove("is-marquee");
    updateCanvasSelectionFrame();
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up, { once: true });
  window.addEventListener("pointercancel", up, { once: true });
}

function selectCanvasNodesInScreenRect(rect) {
  document.querySelectorAll(".canvas-node.is-selected").forEach((item) => item.classList.remove("is-selected"));
  canvasState.selectedIds.clear();
  canvasState.activeNode = null;
  document.querySelectorAll("#canvasPlane .canvas-node").forEach((node) => {
    const nodeRect = node.getBoundingClientRect();
    const hit = nodeRect.left < rect.right
      && nodeRect.right > rect.left
      && nodeRect.top < rect.bottom
      && nodeRect.bottom > rect.top;
    if (hit) addCanvasNodeToSelection(node);
  });
  updateCanvasGroupAction();
  dispatchCanvasSelectionChange();
}

function blurActiveCanvasText() {
  if (document.activeElement?.classList?.contains("canvas-text")) document.activeElement.blur();
}

function registerCanvasDetailImage(img, source) {
  if (!img || !source) return img;
  img.draggable = false;
  img.decoding = "async";
  if (window.imageResources) window.imageResources.registerCanvasImage(img, source);
  else {
    img.loading = "lazy";
    img.src = source;
  }
  scheduleCanvasImageQualityUpdate();
  return img;
}

function cancelCanvasMediaImage(img, { unload = true } = {}) {
  const key = canvasMediaTaskKeys.get(img);
  if (key) canvasMediaScheduler.cancelKey(key);
  canvasMediaTaskKeys.delete(img);
  if (unload) window.imageResources?.unload(img);
}

function scheduleCanvasMediaImage(img, quality, priority = 0) {
  if (!img || !quality || !window.imageResources) {
    if (img) cancelCanvasMediaImage(img);
    return "";
  }
  const previousKey = canvasMediaTaskKeys.get(img);
  if (
    previousKey
    && img.dataset.canvasScheduledQuality === quality
    && (
      img.dataset.requestedQuality === quality
      || img.dataset.imageQuality === quality
      || (quality === "thumbnail" && img.dataset.imageQuality === "original")
    )
  ) return previousKey;
  if (previousKey) canvasMediaScheduler.cancelKey(previousKey);
  const nodeId = img.closest(".canvas-node")?.dataset.id || "detached";
  if (!img.dataset.canvasMediaTaskId) img.dataset.canvasMediaTaskId = `${nodeId}:${createId()}`;
  img.dataset.canvasScheduledQuality = quality;
  const key = canvasMediaScheduler.enqueue({
    nodeId: img.dataset.canvasMediaTaskId,
    quality,
    priority,
    release() {},
    run(signal) {
      return new Promise((resolve, reject) => {
        const abort = () => {
          reject(Object.assign(new Error("Canvas media request aborted."), { name: "AbortError" }));
        };
        if (signal.aborted) {
          abort();
          return;
        }
        signal.addEventListener("abort", abort, { once: true });
        const request = quality === "original"
          ? window.imageResources.showOriginal(img)
          : window.imageResources.showThumbnail(img);
        Promise.resolve(request).then((result) => {
          signal.removeEventListener("abort", abort);
          if (!signal.aborted) resolve(result);
        }, (error) => {
          signal.removeEventListener("abort", abort);
          if (!signal.aborted) reject(error);
        });
      });
    },
  });
  canvasMediaTaskKeys.set(img, key);
  return key;
}

function scheduleCanvasImageQualityUpdate() {
  if (canvasImageQualityFrame) return;
  canvasImageQualityFrame = requestAnimationFrame(updateCanvasImageQualities);
}

function updateCanvasImageQualities() {
  canvasImageQualityFrame = 0;
  const viewport = document.querySelector("#infiniteCanvas");
  const rules = window.ImageLoadingRules;
  const resources = window.imageResources;
  if (!viewport || !rules || !resources || document.body.classList.contains("canvas-overlay-open")) return;
  if (canvasPagedStore.scenePage) {
    canvasVirtualStore.mountedElements().forEach((node) => {
      node.querySelectorAll("img[data-canvas-original-src]").forEach(cancelCanvasMediaImage);
    });
    return;
  }
  const visibleRect = rules.getCanvasVisibleRect(
    { width: viewport.clientWidth, height: viewport.clientHeight },
    canvasState,
    280,
  );
  canvasVirtualStore.mountedElements().forEach((mountedNode) => mountedNode.querySelectorAll("img[data-canvas-original-src]").forEach((img) => {
    const node = img.closest(".canvas-node");
    if (!node) return;
    const x = Number(node.dataset.x || 0);
    const y = Number(node.dataset.y || 0);
    const width = Number(node.dataset.renderedWidth || node.dataset.width || 320);
    const height = Number(node.dataset.renderedHeight || node.dataset.height || 320);
    const visible = rules.rectsIntersect(visibleRect, {
      left: x,
      top: y,
      right: x + width,
      bottom: y + height,
    });
    const quality = rules.chooseCanvasImageQuality({
      visible,
      scale: canvasState.scale,
      detailReady: canvasDetailReady,
      currentQuality: img.dataset.imageQuality,
      displayedMaxSide: Math.max(width, height) * canvasState.scale,
    });
    if (img.dataset.canvasForceOriginal === "true" || quality === "original") {
      scheduleCanvasMediaImage(img, "original", visible ? 100 : 10);
    } else if (quality === "thumbnail") {
      scheduleCanvasMediaImage(img, "thumbnail", visible ? 80 : 5);
    } else cancelCanvasMediaImage(img);
  }));
}

function markCanvasViewportInteraction() {
  const rules = window.ImageLoadingRules;
  canvasDetailReady = false;
  canvasMediaScheduler.setInteractionActive(true);
  clearTimeout(canvasDetailTimer);
  canvasDetailTimer = 0;
  // Thumbnails are cheap and keep nodes identifiable during every zoom gesture.
  // The scheduler still pauses original-resolution work until interaction ends.
  scheduleCanvasImageQualityUpdate();
  if (!rules) return;
  canvasDetailTimer = window.setTimeout(() => {
    canvasDetailTimer = 0;
    canvasMediaScheduler.setInteractionActive(false);
    if (document.body.classList.contains("canvas-overlay-open")) return;
    canvasDetailReady = true;
    scheduleCanvasImageQualityUpdate();
  }, rules.DETAIL_IDLE_MS);
}

function suspendCanvasImageLoading() {
  clearTimeout(canvasDetailTimer);
  canvasDetailTimer = 0;
  canvasDetailReady = false;
  canvasMediaScheduler.setInteractionActive(true);
  canvasVirtualStore.mountedElements().forEach((node) => {
    node.querySelectorAll("img[data-canvas-original-src]").forEach(cancelCanvasMediaImage);
  });
}

function updateCanvasNodePosition(node) {
  node.style.transform = `translate(${Number(node.dataset.x)}px, ${Number(node.dataset.y)}px)`;
  if (canvasVirtualStore.has(node.dataset.id)) {
    canvasVirtualStore.setGeometry(node.dataset.id, {
      x: Number(node.dataset.x || 0),
      y: Number(node.dataset.y || 0),
      width: Number(node.dataset.width || node.dataset.renderedWidth || 0),
      height: Number(node.dataset.height || node.dataset.renderedHeight || 0),
    });
  }
  scheduleCanvasConnectionRender({ trailing: false });
  scheduleCanvasImageQualityUpdate();
  if (node.dataset.virtualMounting !== "true") canvasVirtualizer.schedule();
  updateCanvasSelectionFrame();
}

function applyCanvasTransformNow() {
  const plane = document.querySelector("#canvasPlane");
  const viewport = document.querySelector("#infiniteCanvas");
  if (!plane) return;
  plane.style.transform = `translate(${canvasState.x}px, ${canvasState.y}px) scale(${canvasState.scale})`;
  if (viewport) {
    viewport.classList.toggle("is-overview-lod", canvasState.scale < 0.15);
    let gridSize = 34 * canvasState.scale;
    while (gridSize < 16) gridSize *= 5;
    viewport.style.backgroundSize = `${gridSize}px ${gridSize}px`;
    viewport.style.backgroundPosition = `${canvasState.x}px ${canvasState.y}px`;
  }
  const zoom = document.querySelector("#canvasZoom");
  if (zoom) zoom.textContent = `${Math.round(canvasState.scale * 100)}%`;
  reprojectCanvasSceneLayer();
  updateCanvasSelectionFrame();
}

function scheduleCanvasTransform() {
  markCanvasViewportInteraction();
  if (canvasTransformFrame) return;
  canvasTransformFrame = requestAnimationFrame(() => {
    canvasTransformFrame = 0;
    applyCanvasTransformNow();
    if (canvasState.scale >= 0.15) {
      document.querySelector("#infiniteCanvas")?.classList.remove("is-low-zoom-panning");
      clearTimeout(canvasVirtualRefreshTimer);
      canvasVirtualRefreshTimer = 0;
      canvasVirtualizer.schedule();
      scheduleCanvasImageQualityUpdate();
    } else {
      document.querySelector("#infiniteCanvas")?.classList.add("is-low-zoom-panning");
      clearTimeout(canvasVirtualRefreshTimer);
      canvasVirtualRefreshTimer = window.setTimeout(() => {
        canvasVirtualRefreshTimer = 0;
        document.querySelector("#infiniteCanvas")?.classList.remove("is-low-zoom-panning");
        canvasVirtualizer.schedule();
        scheduleCanvasImageQualityUpdate();
        scheduleCanvasConnectionRender({ trailing: false });
      }, 120);
    }
  });
}

function applyCanvasTransform() {
  scheduleCanvasTransform();
}

function resetCanvasView() {
  canvasState.scale = 1;
  canvasState.x = 80;
  canvasState.y = 60;
  applyCanvasTransform();
}

function screenToCanvas(x, y) {
  return {
    x: (x - canvasState.x) / canvasState.scale,
    y: (y - canvasState.y) / canvasState.scale,
  };
}

function getCanvasPointFromClient(clientX, clientY) {
  const rect = document.querySelector("#infiniteCanvas").getBoundingClientRect();
  return screenToCanvas(clientX - rect.left, clientY - rect.top);
}

function getCanvasPointFromEvent(event) {
  return getCanvasPointFromClient(event.clientX, event.clientY);
}

function showCanvasNodeMenu(event) {
  const menu = document.querySelector("#canvasNodeMenu");
  const viewport = document.querySelector("#infiniteCanvas");
  if (!menu || !viewport) return;
  const rect = viewport.getBoundingClientRect();
  const localX = event.clientX - rect.left;
  const localY = event.clientY - rect.top;
  canvasState.menuPoint = screenToCanvas(localX, localY);
  menu.style.left = `${localX}px`;
  menu.style.top = `${localY}px`;
  menu.hidden = false;
  const edgePadding = 12;
  const menuOffset = 10;
  const menuWidth = menu.offsetWidth;
  const menuHeight = menu.offsetHeight;
  const openAbove = localY + menuOffset + menuHeight > rect.height - edgePadding;
  const minLeft = edgePadding - menuOffset;
  const maxLeft = Math.max(minLeft, rect.width - menuWidth - edgePadding - menuOffset);
  const nextLeft = Math.max(minLeft, Math.min(localX, maxLeft));
  const verticalOffset = openAbove ? -menuOffset : menuOffset;
  const preferredTop = openAbove ? localY - menuHeight : localY;
  const minTop = edgePadding - verticalOffset;
  const maxTop = Math.max(minTop, rect.height - menuHeight - edgePadding - verticalOffset);
  const nextTop = Math.max(minTop, Math.min(preferredTop, maxTop));
  menu.style.left = `${nextLeft}px`;
  menu.style.top = `${nextTop}px`;
  menu.style.transform = `translate(${menuOffset}px, ${verticalOffset}px)`;
}

function hideCanvasNodeMenu() {
  const menu = document.querySelector("#canvasNodeMenu");
  if (menu) menu.hidden = true;
}

function showCanvasImageMenu(event, node) {
  const menu = document.querySelector("#canvasImageMenu");
  const viewport = document.querySelector("#infiniteCanvas");
  if (!menu || !viewport) return;
  const rect = viewport.getBoundingClientRect();
  menu.style.left = `${event.clientX - rect.left}px`;
  menu.style.top = `${event.clientY - rect.top}px`;
  canvasState.imageContextNode = node;
  menu.hidden = false;
}

function hideCanvasImageMenu() {
  const menu = document.querySelector("#canvasImageMenu");
  if (menu) menu.hidden = true;
  canvasState.imageContextNode = null;
}

function startCanvasImageCrop(node) {
  if (!node?.dataset.imageSrc) return;
  cancelCanvasImageCrop(node);
  const media = node.querySelector(".canvas-image-upload.has-image");
  const img = media?.querySelector("img");
  if (!media || !img) return;
  img.dataset.canvasForceOriginal = "true";
  window.imageResources?.showOriginal(img);

  const overlay = document.createElement("div");
  overlay.className = "canvas-crop-overlay";
  overlay.innerHTML = `
    <div class="canvas-crop-shade"></div>
    <div class="canvas-crop-box">
      <span data-crop-handle="nw"></span>
      <span data-crop-handle="ne"></span>
      <span data-crop-handle="sw"></span>
      <span data-crop-handle="se"></span>
    </div>
    <div class="canvas-crop-actions">
      <button type="button" data-crop-action="cancel">取消</button>
      <button type="button" data-crop-action="apply">应用裁剪</button>
    </div>
  `;
  media.append(overlay);

  const box = overlay.querySelector(".canvas-crop-box");
  const initial = getInitialCropBox(media);
  setCropBox(box, initial);

  overlay.addEventListener("pointerdown", (event) => handleCanvasCropPointerDown(event, media, box));
  overlay.addEventListener("click", async (event) => {
    const action = event.target.closest("[data-crop-action]")?.dataset.cropAction;
    if (!action) return;
    event.stopPropagation();
    if (action === "cancel") cancelCanvasImageCrop(node);
    if (action === "apply") await applyCanvasImageCrop(node, box);
  });
}

function getInitialCropBox(media) {
  const width = media.clientWidth;
  const height = media.clientHeight;
  const insetX = Math.max(16, width * 0.08);
  const insetY = Math.max(16, height * 0.08);
  return { x: insetX, y: insetY, width: Math.max(48, width - insetX * 2), height: Math.max(48, height - insetY * 2) };
}

function setCropBox(box, crop) {
  box.style.left = `${crop.x}px`;
  box.style.top = `${crop.y}px`;
  box.style.width = `${crop.width}px`;
  box.style.height = `${crop.height}px`;
}

function getCropBox(box) {
  return {
    x: parseFloat(box.style.left) || 0,
    y: parseFloat(box.style.top) || 0,
    width: parseFloat(box.style.width) || box.offsetWidth,
    height: parseFloat(box.style.height) || box.offsetHeight,
  };
}

function handleCanvasCropPointerDown(event, media, box) {
  const handle = event.target.closest("[data-crop-handle]")?.dataset.cropHandle || (event.target.closest(".canvas-crop-box") ? "move" : "");
  if (!handle) return;
  event.preventDefault();
  event.stopPropagation();
  const start = getCropBox(box);
  const bounds = { width: media.clientWidth, height: media.clientHeight };
  const startX = event.clientX;
  const startY = event.clientY;
  const minSize = 36;
  box.setPointerCapture?.(event.pointerId);

  const move = (moveEvent) => {
    const dx = (moveEvent.clientX - startX) / canvasState.scale;
    const dy = (moveEvent.clientY - startY) / canvasState.scale;
    let next = { ...start };
    if (handle === "move") {
      next.x = clamp(start.x + dx, 0, bounds.width - start.width);
      next.y = clamp(start.y + dy, 0, bounds.height - start.height);
    } else {
      if (handle.includes("w")) {
        const x = clamp(start.x + dx, 0, start.x + start.width - minSize);
        next.width = start.width + start.x - x;
        next.x = x;
      }
      if (handle.includes("e")) next.width = clamp(start.width + dx, minSize, bounds.width - start.x);
      if (handle.includes("n")) {
        const y = clamp(start.y + dy, 0, start.y + start.height - minSize);
        next.height = start.height + start.y - y;
        next.y = y;
      }
      if (handle.includes("s")) next.height = clamp(start.height + dy, minSize, bounds.height - start.y);
    }
    setCropBox(box, next);
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up, { once: true });
}

async function applyCanvasImageCrop(node, box) {
  const displayImg = node.querySelector(".canvas-image-upload.has-image img");
  const source = node.dataset.imageSrc || node.dataset.resultSrc || displayImg?.dataset.canvasOriginalSrc || "";
  if (!displayImg || !source) return;
  let sourceImage;
  try {
    sourceImage = await loadImageElement(source);
  } catch {
    setCanvasStatus("裁剪原图加载失败，请稍后重试。");
    return;
  }
  const crop = getCropBox(box);
  const scaleX = sourceImage.naturalWidth / Math.max(1, displayImg.clientWidth);
  const scaleY = sourceImage.naturalHeight / Math.max(1, displayImg.clientHeight);
  const sx = Math.max(0, Math.round(crop.x * scaleX));
  const sy = Math.max(0, Math.round(crop.y * scaleY));
  const sw = Math.max(1, Math.round(crop.width * scaleX));
  const sh = Math.max(1, Math.round(crop.height * scaleY));
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(sourceImage, sx, sy, sw, sh, 0, 0, sw, sh);
  const cropped = canvas.toDataURL("image/png");
  const name = appendNameSuffix(node.dataset.imageName || "image.png", "裁剪");
  const point = { x: Number(node.dataset.x || 0), y: Number(node.dataset.y || 0) };
  if (node.dataset.uploadOnly === "true") renderCanvasUploadNode(node, { src: cropped, name });
  else renderCanvasImageNode(node, { src: cropped, name });
  setCanvasNodePoint(node, point);
  refreshCanvasConnectedNodes(node.dataset.id);
  scheduleCanvasConnectionRender();
  scheduleCanvasSave();
}

function cancelCanvasImageCrop(node) {
  node?.querySelector(".canvas-crop-overlay")?.remove();
  const img = node?.querySelector(".canvas-image-upload.has-image img");
  if (img) delete img.dataset.canvasForceOriginal;
  scheduleCanvasImageQualityUpdate();
}

function appendNameSuffix(name, suffix) {
  const value = String(name || "image.png");
  const dot = value.lastIndexOf(".");
  if (dot > 0) return `${value.slice(0, dot)}-${suffix}${value.slice(dot)}`;
  return `${value}-${suffix}.png`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function updateCanvasOrigin() {
  const origin = document.querySelector(".canvas-origin");
  const hasNodes = canvasVirtualStore.size > 0;
  if (origin) origin.hidden = !canvasState.activeBoardId || hasNodes;
}

function setCanvasStatus(message) {
  const status = document.querySelector(".canvas-status span:last-child");
  if (status) status.textContent = message;
}

function initializeChatLayoutCopy() {
  const chatTitle = document.querySelector("#chatView .studio-header h1");
  const chatSubtitle = document.querySelector("#chatView .studio-header p") || document.createElement("p");
  if (chatTitle) chatTitle.textContent = "GPT 对话";
  chatSubtitle.textContent = "对话工作台";
  if (chatTitle && !chatSubtitle.parentElement) chatTitle.after(chatSubtitle);
  chatPromptInput.placeholder = "输入消息，Enter 发送，Shift + Enter 换行";
  resizeChatPrompt();
  window.lucide?.createIcons({
    attrs: {
      "aria-hidden": "true",
      "stroke-width": 1.8,
    },
  });
}

function resizeChatPrompt() {
  if (!chatPromptInput) return;
  const composer = chatPromptInput.closest(".chat-composer");
  const value = chatPromptInput.value || "";
  const hasText = value.length > 0;
  const hasAttachments = chatAttachments.length > 0;

  composer?.classList.remove("is-expanded");
  composer?.classList.remove("is-multiline-input");
  chatPromptInput.style.height = "auto";
  const collapsedScrollHeight = chatPromptInput.scrollHeight;
  const multiline = hasText && (value.includes("\n") || collapsedScrollHeight > 52);
  const expanded = hasAttachments || multiline;

  composer?.classList.toggle("is-expanded", expanded);
  composer?.classList.toggle("is-multiline-input", multiline);
  const minHeight = multiline ? 48 : 34;
  const maxHeight = multiline ? 150 : 34;
  chatPromptInput.style.height = "auto";
  chatPromptInput.style.height = `${Math.min(Math.max(chatPromptInput.scrollHeight, minHeight), maxHeight)}px`;
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const random = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${random}`;
}

function fillSelect(select, values) {
  select.innerHTML = "";
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = getModelDisplayName(value);
    select.append(option);
  });
}

function getModelDisplayName(model) {
  return DYNAMIC_MODEL_DISPLAY_NAMES[model] || MODEL_DISPLAY_NAMES[model] || model;
}

function getImageModelPrice(model, resolution = 1) {
  const rawKey = String(model || "");
  const dynamicPrice = DYNAMIC_IMAGE_MODEL_PRICES[rawKey];
  if (dynamicPrice) return String(dynamicPrice);
  if (Object.prototype.hasOwnProperty.call(DYNAMIC_MODEL_DISPLAY_NAMES, rawKey)) return "";
  const key = rawKey.toLowerCase();
  if (key === "gpt-image-2-apimart") {
    const level = Number(resolution || 1);
    if (level >= 4) return APIMART_IMAGE_MODEL_PRICES[4];
    if (level >= 2) return APIMART_IMAGE_MODEL_PRICES[2];
    return APIMART_IMAGE_MODEL_PRICES[1];
  }
  return IMAGE_MODEL_PRICES[key] || "";
}

function formatImagePriceValue(price) {
  const value = String(price || "").trim();
  if (!value) return "";
  return value.startsWith("$") ? `${value}/张` : `￥${value.replace(/^￥\s*/, "")}/张`;
}

function getImagePriceText(model, resolution = 1) {
  const price = getImageModelPrice(model, resolution);
  return formatImagePriceValue(price);
}

function updateGenerateButtonLabel() {
  if (!generateButton || generateButton.disabled) return;
  const price = getImagePriceText(imageModelInput.value, imageResolutionInput.value);
  generateButton.replaceChildren();
  const icon = document.createElement("span");
  icon.textContent = "⚡";
  generateButton.append(icon, document.createTextNode(price ? `生成图片 · ${price}` : "生成图片"));
}

function updateCanvasRunButtonLabel(button, model) {
  if (!button || button.disabled) return;
  const node = button.closest(".canvas-node");
  const resolution = node?.querySelector(".canvas-node-resolution")?.value || node?.dataset.canvasResolution || imageResolutionInput.value || 1;
  const price = getImagePriceText(model, resolution);
  button.replaceChildren();
  const label = document.createElement("span");
  label.className = "canvas-run-label";
  label.textContent = "生成";
  button.append(label);
  if (price) {
    const priceLabel = document.createElement("span");
    priceLabel.className = "canvas-run-price";
    priceLabel.textContent = price;
    button.append(priceLabel);
  }
}

function extractImages(data) {
  return (data.data || [])
    .map((item, index) => {
      const saved = data.saved_images?.[index] || {};
      return {
        src: item.local_url || saved.url || item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : ""),
        savedUrl: item.local_url || saved.url || item.url || "",
        width: Number(item.width || saved.width || 0),
        height: Number(item.height || saved.height || 0),
      };
    })
    .filter((item) => item.src);
}

function getImagesDimensionText(images) {
  const sizes = (Array.isArray(images) ? images : [])
    .map((image) => Number(image?.width) && Number(image?.height) ? `${Number(image.width)}\u00d7${Number(image.height)}` : "")
    .filter(Boolean);
  return [...new Set(sizes)].join("\u3001");
}

function getImageSizeNote(requestedSize, images) {
  const actualText = getImagesDimensionText(images);
  if (!actualText) return "";
  const requested = parseOutputPixelSize(requestedSize);
  if (!requested) return `\u5b9e\u9645\u5c3a\u5bf8\uff1a${actualText}`;
  const requestedText = `${requested.width}\u00d7${requested.height}`;
  return actualText === requestedText
    ? `\u5b9e\u9645\u5c3a\u5bf8\uff1a${actualText}`
    : `\u8bf7\u6c42\u5c3a\u5bf8\uff1a${requestedText}\uff0c\u5b9e\u9645\u8fd4\u56de\uff1a${actualText}`;
}

function hasImageSizeMismatch(requestedSize, images) {
  const requested = parseOutputPixelSize(requestedSize);
  if (!requested) return false;
  return (Array.isArray(images) ? images : []).some((image) => {
    const width = Number(image?.width);
    const height = Number(image?.height);
    return width && height && (width !== requested.width || height !== requested.height);
  });
}

function parseOutputPixelSize(value) {
  const match = String(value || "").trim().toLowerCase().match(/^(\d{2,5})x(\d{2,5})$/);
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}

function renderImages(images, prompt) {
  imageStage.innerHTML = "";
  renderImageCards(imageStage, images, prompt);
}

function renderUpscaleImages(images, prompt, beforeSrc) {
  upscaleStage.innerHTML = "";
  renderImageCards(upscaleStage, images, prompt, beforeSrc);
}

function renderUpscale2Images(images, prompt, beforeSrc) {
  upscale2Stage.innerHTML = "";
  renderImageCards(upscale2Stage, images, prompt, beforeSrc);
}

function renderShoeSwapImages(images, prompt, beforeSrc) {
  shoeSwapStage.innerHTML = "";
  renderImageCards(shoeSwapStage, images.slice(-1), prompt, beforeSrc);
}

function renderOutpaintImages(images, prompt, beforeSrc, padding = null) {
  outpaintStage.innerHTML = "";
  renderImageCards(outpaintStage, images.slice(-1), prompt, beforeSrc, padding ? { outpaintPadding: padding, afterLabel: "扩图后" } : {});
}

function renderOutpaint2Images(images, prompt, beforeSrc, padding = null) {
  outpaint2Stage.innerHTML = "";
  renderImageCards(outpaint2Stage, images.slice(-1), prompt);
}

function renderImageCards(container, images, prompt, beforeSrc = "", compareOptions = {}) {
  images.forEach((image, index) => {
    const figure = document.createElement("figure");
    figure.className = "image-card";

    const preview = beforeSrc
      ? createComparePreview(beforeSrc, image.src, prompt, compareOptions)
      : createImagePreview(image, prompt);

    const caption = document.createElement("figcaption");
    const dimensionText = getImagesDimensionText([image]);
    caption.innerHTML = `
      <span>${beforeSrc ? "对比" : "结果"} ${index + 1}${dimensionText ? ` · ${dimensionText}` : ""}</span>
      <span class="image-actions">
        <button type="button" data-preview="${index}">预览</button>
        <a href="${image.savedUrl || image.src}" download>下载</a>
      </span>
    `;
    caption.querySelector("button").addEventListener("click", () => {
      if (beforeSrc) openComparePreview(beforeSrc, image.src, image.savedUrl || image.src, prompt, compareOptions);
      else openPreview(image.src, image.savedUrl || image.src);
    });
    const downloadLink = caption.querySelector("a");
    downloadLink.addEventListener("click", (event) => {
      event.preventDefault();
      downloadAsset(image.savedUrl || image.src, `image-${index + 1}.png`, event.currentTarget);
    });

    figure.append(preview, caption);
    container.append(figure);
  });
}

function createImagePreview(image, prompt) {
  const imgButton = document.createElement("button");
  imgButton.className = "image-preview-button";
  imgButton.type = "button";
  imgButton.addEventListener("click", () => openPreview(image.src, image.savedUrl || image.src));

  const img = document.createElement("img");
  img.src = image.src;
  img.alt = prompt;
  imgButton.append(img);
  return imgButton;
}

function createComparePreview(beforeSrc, afterSrc, prompt, options = {}) {
  const compare = document.createElement("div");
  compare.className = "compare-viewer";
  compare.style.setProperty("--split", "50%");

  const before = document.createElement("img");
  before.className = "compare-image compare-before";
  before.src = beforeSrc;
  before.alt = `${prompt} 原图`;
  if (options.outpaintPadding) {
    createAlignedOutpaintPair(beforeSrc, afterSrc, options.outpaintPadding)
      .then((aligned) => {
        if (aligned?.beforeSrc) before.src = aligned.beforeSrc;
        if (aligned?.afterSrc) after.src = aligned.afterSrc;
      })
      .catch(() => {
        before.src = beforeSrc;
        after.src = afterSrc;
      });
  }

  const afterWrap = document.createElement("div");
  afterWrap.className = "compare-after-wrap";
  const after = document.createElement("img");
  after.className = "compare-image compare-after";
  after.src = afterSrc;
  after.alt = `${prompt} 放大后`;
  afterWrap.append(after);

  const beforeLabel = document.createElement("span");
  beforeLabel.className = "compare-label compare-label-before";
  beforeLabel.textContent = "原图";

  const afterLabel = document.createElement("span");
  afterLabel.className = "compare-label compare-label-after";
  afterLabel.textContent = options.afterLabel || "放大后";

  const handle = document.createElement("span");
  handle.className = "compare-handle";
  handle.setAttribute("aria-hidden", "true");

  const slider = document.createElement("input");
  slider.className = "compare-slider";
  slider.type = "range";
  slider.min = "0";
  slider.max = "100";
  slider.value = "50";
  slider.setAttribute("aria-label", "左右拖动对比原图和放大图");
  slider.addEventListener("input", () => {
    compare.style.setProperty("--split", `${slider.value}%`);
  });

  compare.append(before, afterWrap, beforeLabel, afterLabel, handle, slider);
  return compare;
}

function updateCanvasImageMaskPreview(node) {
  const media = node?.querySelector?.(".canvas-image-upload.has-image");
  if (!media) return;
  let preview = media.querySelector(".canvas-image-mask-preview");
  const src = node.dataset.maskSrc || "";
  if (!src) {
    preview?.remove();
    return;
  }
  if (!preview) {
    preview = document.createElement("img");
    preview.className = "canvas-image-mask-preview";
    preview.alt = "遮罩预览";
    preview.draggable = false;
    media.append(preview);
  }
  if (preview.src !== src) preview.src = src;
}
async function openCanvasMaskEditor(node) {
  const src = node?.dataset?.imageSrc || node?.dataset?.resultSrc || "";
  if (!src) {
    setCanvasStatus("请先在图片节点里放入图片。");
    return false;
  }

  let image;
  try {
    image = await loadImageElement(src);
  } catch (error) {
    setCanvasStatus("遮罩编辑器打开失败：" + (error.message || error));
    return false;
  }

  let existingMask = null;
  const existingMaskSrc = node?.dataset?.maskSrc || "";
  if (existingMaskSrc) {
    try {
      existingMask = await loadImageElement(existingMaskSrc);
    } catch {
      existingMask = null;
    }
  }

  const width = image.naturalWidth || image.width || 1;
  const height = image.naturalHeight || image.height || 1;
  const modal = document.createElement("div");
  modal.className = "canvas-mask-modal";
  modal.innerHTML = [
    "<div class=\"canvas-mask-dialog\" role=\"dialog\" aria-modal=\"true\" aria-label=\"绘制遮罩\">",
    "<header class=\"canvas-mask-header\"><div><strong>绘制遮罩</strong><span>红色区域会作为 ComfyUI mask 传入</span></div><button type=\"button\" class=\"canvas-mask-close\" aria-label=\"关闭\">×</button></header>",
    "<div class=\"canvas-mask-stage\"><img class=\"canvas-mask-image\" alt=\"遮罩底图\"><canvas class=\"canvas-mask-canvas\"></canvas><span class=\"canvas-mask-brush-cursor\" hidden></span></div>",
    "<footer class=\"canvas-mask-toolbar\"><label class=\"canvas-mask-brush-control\">画笔 <input class=\"canvas-mask-size\" type=\"range\" min=\"1\" max=\"220\" step=\"1\" value=\"56\"></label><div class=\"canvas-mask-zoom-controls\" aria-label=\"图片缩放\"><button type=\"button\" class=\"canvas-mask-zoom-out\" aria-label=\"缩小\">−</button><input class=\"canvas-mask-zoom\" type=\"range\" min=\"100\" max=\"500\" step=\"10\" value=\"100\" aria-label=\"图片缩放\"><button type=\"button\" class=\"canvas-mask-zoom-in\" aria-label=\"放大\">＋</button><button type=\"button\" class=\"canvas-mask-zoom-reset\">100%</button></div><button type=\"button\" class=\"canvas-mask-paint is-active\">画遮罩</button><button type=\"button\" class=\"canvas-mask-erase\">擦除</button><button type=\"button\" class=\"canvas-mask-pan\">移动</button><button type=\"button\" class=\"canvas-mask-clear\">清空</button><span class=\"canvas-mask-hint\">滚轮缩放，移动模式拖动画面</span><button type=\"button\" class=\"canvas-mask-save\">保存遮罩</button></footer>",
    "</div>",
  ].join("");
  document.body.append(modal);

  const stage = modal.querySelector(".canvas-mask-stage");
  const img = modal.querySelector(".canvas-mask-image");
  const canvas = modal.querySelector(".canvas-mask-canvas");
  const ctx = canvas.getContext("2d");
  const maskCanvas = document.createElement("canvas");
  const maskCtx = maskCanvas.getContext("2d");
  const sizeInput = modal.querySelector(".canvas-mask-size");
  const zoomInput = modal.querySelector(".canvas-mask-zoom");
  const zoomReset = modal.querySelector(".canvas-mask-zoom-reset");
  const brushCursor = modal.querySelector(".canvas-mask-brush-cursor");
  const view = { zoom: 1, x: 0, y: 0 };
  let mode = "paint";
  let drawing = false;
  let panning = false;
  let lastPoint = null;
  let panStart = null;

  // Expose a deterministic outcome for the Agent bridge while preserving the
  // existing direct UI callers, which do not consume a return value.
  const opened = true;

  img.src = src;
  canvas.width = width;
  canvas.height = height;
  maskCanvas.width = width;
  maskCanvas.height = height;
  if (existingMask) initializeMaskFromSavedMask(existingMask, maskCtx, width, height);
  else initializeMaskFromImageAlpha(image, maskCtx, width, height);
  redrawMaskPreview(ctx, maskCanvas);

  const close = () => modal.remove();
  const setMode = (nextMode) => {
    mode = nextMode;
    modal.querySelector(".canvas-mask-paint")?.classList.toggle("is-active", mode === "paint");
    modal.querySelector(".canvas-mask-erase")?.classList.toggle("is-active", mode === "erase");
    modal.querySelector(".canvas-mask-pan")?.classList.toggle("is-active", mode === "pan");
    canvas.classList.toggle("is-pan-mode", mode === "pan");
    if (mode === "pan") hideBrushCursor();
    updateBrushCursor();
  };
  const clampMaskView = () => {
    const stageWidth = stage.clientWidth || 1;
    const stageHeight = stage.clientHeight || 1;
    const scaledWidth = stageWidth * view.zoom;
    const scaledHeight = stageHeight * view.zoom;
    view.x = scaledWidth <= stageWidth ? (stageWidth - scaledWidth) / 2 : clamp(view.x, stageWidth - scaledWidth, 0);
    view.y = scaledHeight <= stageHeight ? (stageHeight - scaledHeight) / 2 : clamp(view.y, stageHeight - scaledHeight, 0);
  };
  const applyMaskView = () => {
    clampMaskView();
    const transform = `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`;
    img.style.transform = transform;
    canvas.style.transform = transform;
    if (zoomInput) zoomInput.value = String(Math.round(view.zoom * 100));
    if (zoomReset) zoomReset.textContent = `${Math.round(view.zoom * 100)}%`;
    updateBrushCursor();
  };
  const setZoom = (nextZoom, focus = null) => {
    const currentZoom = view.zoom || 1;
    const targetZoom = clamp(Number(nextZoom) || 1, 1, 5);
    const rect = stage.getBoundingClientRect();
    const point = focus || { x: rect.width / 2, y: rect.height / 2 };
    const imageX = (point.x - view.x) / currentZoom;
    const imageY = (point.y - view.y) / currentZoom;
    view.zoom = targetZoom;
    view.x = point.x - imageX * view.zoom;
    view.y = point.y - imageY * view.zoom;
    applyMaskView();
  };
  const getPoint = (event) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp(((event.clientX - rect.left) / Math.max(1, rect.width)) * width, 0, width),
      y: clamp(((event.clientY - rect.top) / Math.max(1, rect.height)) * height, 0, height),
    };
  };
  const updateBrushCursor = () => {
    if (!brushCursor) return;
    if (mode === "pan") {
      brushCursor.hidden = true;
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const displayScale = Math.min(rect.width / Math.max(1, width), rect.height / Math.max(1, height)) || 1;
    const brush = Number(sizeInput.value || 56);
    const displaySize = Math.max(4, Math.round(brush * displayScale));
    brushCursor.style.width = displaySize + "px";
    brushCursor.style.height = displaySize + "px";
    brushCursor.classList.toggle("is-erase", mode === "erase");
  };
  const positionBrushCursor = (event) => {
    if (!brushCursor) return;
    if (mode === "pan") {
      hideBrushCursor();
      return;
    }
    const rect = stage.getBoundingClientRect();
    brushCursor.hidden = false;
    brushCursor.style.left = (event.clientX - rect.left) + "px";
    brushCursor.style.top = (event.clientY - rect.top) + "px";
    updateBrushCursor();
  };
  const hideBrushCursor = () => {
    if (brushCursor) brushCursor.hidden = true;
  };
  const drawTo = (point) => {
    const brush = Number(sizeInput.value || 56);
    maskCtx.save();
    maskCtx.lineCap = "round";
    maskCtx.lineJoin = "round";
    maskCtx.lineWidth = brush;
    maskCtx.globalCompositeOperation = mode === "erase" ? "destination-out" : "source-over";
    maskCtx.strokeStyle = "rgba(255,255,255,1)";
    maskCtx.fillStyle = "rgba(255,255,255,1)";
    if (!lastPoint) {
      maskCtx.beginPath();
      maskCtx.arc(point.x, point.y, brush / 2, 0, Math.PI * 2);
      maskCtx.fill();
    } else {
      maskCtx.beginPath();
      maskCtx.moveTo(lastPoint.x, lastPoint.y);
      maskCtx.lineTo(point.x, point.y);
      maskCtx.stroke();
    }
    maskCtx.restore();
    lastPoint = point;
    redrawMaskPreview(ctx, maskCanvas);
  };

  canvas.addEventListener("pointerenter", positionBrushCursor);
  canvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (mode === "pan" || event.button === 1) {
      canvas.setPointerCapture?.(event.pointerId);
      panning = true;
      panStart = { x: event.clientX, y: event.clientY, viewX: view.x, viewY: view.y };
      canvas.classList.add("is-panning");
      hideBrushCursor();
      return;
    }
    positionBrushCursor(event);
    canvas.setPointerCapture?.(event.pointerId);
    drawing = true;
    lastPoint = null;
    drawTo(getPoint(event));
  });
  canvas.addEventListener("pointermove", (event) => {
    if (panning && panStart) {
      event.preventDefault();
      view.x = panStart.viewX + event.clientX - panStart.x;
      view.y = panStart.viewY + event.clientY - panStart.y;
      applyMaskView();
      return;
    }
    positionBrushCursor(event);
    if (!drawing) return;
    event.preventDefault();
    drawTo(getPoint(event));
  });
  const stopInteraction = () => {
    drawing = false;
    panning = false;
    lastPoint = null;
    panStart = null;
    canvas.classList.remove("is-panning");
  };
  canvas.addEventListener("pointerup", stopInteraction);
  canvas.addEventListener("pointercancel", stopInteraction);
  canvas.addEventListener("pointerleave", () => {
    hideBrushCursor();
    if (!panning) stopInteraction();
  });
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = stage.getBoundingClientRect();
    const zoomFactor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    setZoom(view.zoom * zoomFactor, {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  }, { passive: false });

  modal.querySelector(".canvas-mask-close")?.addEventListener("click", close);
  modal.querySelector(".canvas-mask-paint")?.addEventListener("click", () => setMode("paint"));
  modal.querySelector(".canvas-mask-erase")?.addEventListener("click", () => setMode("erase"));
  modal.querySelector(".canvas-mask-pan")?.addEventListener("click", () => setMode("pan"));
  modal.querySelector(".canvas-mask-zoom-out")?.addEventListener("click", () => setZoom(view.zoom / 1.2));
  modal.querySelector(".canvas-mask-zoom-in")?.addEventListener("click", () => setZoom(view.zoom * 1.2));
  zoomInput?.addEventListener("input", () => setZoom(Number(zoomInput.value || 100) / 100));
  zoomReset?.addEventListener("click", () => {
    view.zoom = 1;
    view.x = 0;
    view.y = 0;
    applyMaskView();
  });
  modal.querySelector(".canvas-mask-clear")?.addEventListener("click", () => {
    maskCtx.clearRect(0, 0, width, height);
    redrawMaskPreview(ctx, maskCanvas);
  });
  sizeInput?.addEventListener("input", updateBrushCursor);
  modal.addEventListener("pointerdown", (event) => {
    if (event.target === modal) close();
  });
  modal.querySelector(".canvas-mask-save")?.addEventListener("click", async (event) => {
    const saveButton = event.currentTarget;
    try {
      saveButton.disabled = true;
      saveButton.textContent = "保存中...";
      const baseName = (node.dataset.imageName || "masked-image").replace(/\.[^.]+$/, "");
      const nextName = baseName + "-mask.png";
      const maskBlob = await createFlux2MaskPngBlob(maskCanvas, width, height);
      const maskFile = new File([maskBlob], nextName, { type: "image/png" });
      const masked = await uploadCanvasImageFile(maskFile);
      const openaiMaskName = baseName + "-openai-mask.png";
      const openaiMaskBlob = await createOpenAIEditMaskPngBlob(maskCanvas, width, height);
      const openaiMaskFile = new File([openaiMaskBlob], openaiMaskName, { type: "image/png" });
      const openaiMask = await uploadCanvasImageFile(openaiMaskFile);
      const basePngName = baseName + "-openai-edit-input.png";
      const basePngBlob = await createOpenAIEditInputPngBlob(image, maskCanvas, width, height);
      const basePngFile = new File([basePngBlob], basePngName, { type: "image/png" });
      const basePng = await uploadCanvasImageFile(basePngFile);
      if (!node.dataset.originalSrc) node.dataset.originalSrc = src;
      node.dataset.maskSrc = masked;
      node.dataset.maskName = nextName;
      node.dataset.openaiMaskSrc = openaiMask;
      node.dataset.openaiMaskName = openaiMaskName;
      node.dataset.maskBaseSrc = basePng;
      node.dataset.maskBaseName = basePngName;
      updateCanvasImageMaskPreview(node);
      setCanvasStatus("\u5df2\u4fdd\u5b58\u906e\u7f69\uff0cOpenAI/GPT Image \u4f1a\u7f16\u8f91\u6d82\u62b9\u533a\u57df\uff0cFlux2 Klein \u4e5f\u4f1a\u8bfb\u53d6\u8be5\u533a\u57df\u3002");
      scheduleCanvasSave();
      refreshCanvasConnectedNodes(node.dataset.id);
      close();
    } catch (error) {
      setCanvasStatus("保存遮罩失败：" + (error.message || error));
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "保存遮罩";
    }
  });

  requestAnimationFrame(() => {
    const maxWidth = Math.min(window.innerWidth - 96, 980);
    const maxHeight = Math.min(window.innerHeight - 190, 720);
    const scale = Math.min(maxWidth / width, maxHeight / height, 1);
    stage.style.width = Math.max(240, Math.round(width * scale)) + "px";
    stage.style.height = Math.max(180, Math.round(height * scale)) + "px";
    applyMaskView();
  });
  return opened;
}

function initializeMaskFromSavedMask(maskImage, maskCtx, width, height) {
  const source = document.createElement("canvas");
  source.width = width;
  source.height = height;
  const sourceCtx = source.getContext("2d");
  sourceCtx.clearRect(0, 0, width, height);
  sourceCtx.drawImage(maskImage, 0, 0, width, height);
  let data;
  try {
    data = sourceCtx.getImageData(0, 0, width, height);
  } catch {
    return;
  }
  const mask = maskCtx.createImageData(width, height);
  let hasMask = false;
  for (let i = 0; i < data.data.length; i += 4) {
    const alpha = data.data[i + 3];
    const luminance = Math.max(data.data[i], data.data[i + 1], data.data[i + 2]);
    const paintedAlpha = alpha < 250 ? alpha : Math.round((luminance / 255) * alpha);
    if (paintedAlpha > 4) hasMask = true;
    mask.data[i] = 255;
    mask.data[i + 1] = 255;
    mask.data[i + 2] = 255;
    mask.data[i + 3] = paintedAlpha > 4 ? paintedAlpha : 0;
  }
  if (hasMask) maskCtx.putImageData(mask, 0, 0);
}

function initializeMaskFromImageAlpha(image, maskCtx, width, height) {
  const source = document.createElement("canvas");
  source.width = width;
  source.height = height;
  const sourceCtx = source.getContext("2d");
  sourceCtx.drawImage(image, 0, 0, width, height);
  let data;
  try {
    data = sourceCtx.getImageData(0, 0, width, height);
  } catch {
    return;
  }
  const mask = maskCtx.createImageData(width, height);
  let hasMask = false;
  for (let i = 0; i < data.data.length; i += 4) {
    const masked = data.data[i + 3] < 250;
    if (masked) hasMask = true;
    mask.data[i] = 255;
    mask.data[i + 1] = 255;
    mask.data[i + 2] = 255;
    mask.data[i + 3] = masked ? 255 : 0;
  }
  if (hasMask) maskCtx.putImageData(mask, 0, 0);
}

function redrawMaskPreview(ctx, maskCanvas) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.save();
  ctx.globalAlpha = 0.52;
  ctx.drawImage(tintMaskCanvas(maskCanvas, "#ff2f3d"), 0, 0);
  ctx.restore();
}

function tintMaskCanvas(maskCanvas, color) {
  const tinted = document.createElement("canvas");
  tinted.width = maskCanvas.width;
  tinted.height = maskCanvas.height;
  const tintedCtx = tinted.getContext("2d");
  tintedCtx.fillStyle = color;
  tintedCtx.fillRect(0, 0, tinted.width, tinted.height);
  tintedCtx.globalCompositeOperation = "destination-in";
  tintedCtx.drawImage(maskCanvas, 0, 0);
  return tinted;
}

async function createFlux2ComfyMaskDataUrl(maskUrl) {
  const mask = await loadImageElement(maskUrl);
  const width = mask.naturalWidth || mask.width;
  const height = mask.naturalHeight || mask.height;
  if (!width || !height) throw new Error("?????????");
  const source = document.createElement("canvas");
  source.width = width;
  source.height = height;
  const sourceCtx = source.getContext("2d");
  sourceCtx.drawImage(mask, 0, 0, width, height);
  const sourceData = sourceCtx.getImageData(0, 0, width, height);

  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const outputCtx = output.getContext("2d");
  const outputData = outputCtx.createImageData(width, height);
  for (let offset = 0; offset < outputData.data.length; offset += 4) {
    const paintedAlpha = sourceData.data[offset + 3];
    outputData.data[offset] = 255;
    outputData.data[offset + 1] = 255;
    outputData.data[offset + 2] = 255;
    outputData.data[offset + 3] = 255 - paintedAlpha;
  }
  outputCtx.putImageData(outputData, 0, 0);
  return output.toDataURL("image/png");
}

function createCanvasImagePngBlob(image, width, height) {
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const outputCtx = output.getContext("2d");
  outputCtx.clearRect(0, 0, width, height);
  outputCtx.drawImage(image, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    output.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("OpenAI edit base image export failed."));
    }, "image/png");
  });
}
function createFlux2MaskPngBlob(maskCanvas, width, height) {
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const outputCtx = output.getContext("2d");
  outputCtx.clearRect(0, 0, width, height);
  outputCtx.drawImage(maskCanvas, 0, 0);
  return canvasToPngBlob(output, "\u906e\u7f69\u56fe\u7247\u5bfc\u51fa\u5931\u8d25\u3002");
}

function createOpenAIEditInputPngBlob(image, maskCanvas, width, height) {
  const imageCanvas = document.createElement("canvas");
  imageCanvas.width = width;
  imageCanvas.height = height;
  const imageCtx = imageCanvas.getContext("2d");
  imageCtx.clearRect(0, 0, width, height);
  imageCtx.drawImage(image, 0, 0, width, height);
  const imageData = imageCtx.getImageData(0, 0, width, height);

  const maskSource = document.createElement("canvas");
  maskSource.width = width;
  maskSource.height = height;
  const maskSourceCtx = maskSource.getContext("2d");
  maskSourceCtx.clearRect(0, 0, width, height);
  maskSourceCtx.drawImage(maskCanvas, 0, 0, width, height);
  const maskData = maskSourceCtx.getImageData(0, 0, width, height);

  for (let offset = 0; offset < imageData.data.length; offset += 4) {
    const originalAlpha = imageData.data[offset + 3];
    const paintedAlpha = maskData.data[offset + 3];
    imageData.data[offset + 3] = Math.min(originalAlpha, 255 - paintedAlpha);
  }
  imageCtx.putImageData(imageData, 0, 0);
  return canvasToPngBlob(imageCanvas, "OpenAI \u7f16\u8f91\u8f93\u5165\u56fe\u5bfc\u51fa\u5931\u8d25\u3002");
}

function createOpenAIEditMaskPngBlob(maskCanvas, width, height) {
  const source = document.createElement("canvas");
  source.width = width;
  source.height = height;
  const sourceCtx = source.getContext("2d");
  sourceCtx.clearRect(0, 0, width, height);
  sourceCtx.drawImage(maskCanvas, 0, 0, width, height);
  const sourceData = sourceCtx.getImageData(0, 0, width, height);
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const outputCtx = output.getContext("2d");
  const outputData = outputCtx.createImageData(width, height);
  for (let offset = 0; offset < outputData.data.length; offset += 4) {
    const paintedAlpha = sourceData.data[offset + 3];
    outputData.data[offset] = 255;
    outputData.data[offset + 1] = 255;
    outputData.data[offset + 2] = 255;
    outputData.data[offset + 3] = 255 - paintedAlpha;
  }
  outputCtx.putImageData(outputData, 0, 0);
  return canvasToPngBlob(output, "OpenAI \u906e\u7f69\u56fe\u7247\u5bfc\u51fa\u5931\u8d25\u3002");
}

function canvasToPngBlob(canvas, errorMessage = "\u56fe\u7247\u5bfc\u51fa\u5931\u8d25\u3002") {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error(errorMessage));
    }, "image/png");
  });
}
function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function createAlignedOutpaintPair(beforeSrc, afterSrc, padding) {
  const [before, after] = await Promise.all([loadImageElement(beforeSrc), loadImageElement(afterSrc)]);
  const rawLeft = Math.max(0, Number(padding?.left || 0));
  const rawTop = Math.max(0, Number(padding?.top || 0));
  const rawRight = Math.max(0, Number(padding?.right || 0));
  const rawBottom = Math.max(0, Number(padding?.bottom || 0));
  const sourceWidth = before.naturalWidth || before.width || 1;
  const sourceHeight = before.naturalHeight || before.height || 1;
  const targetWidth = Math.max(1, Math.round(sourceWidth + rawLeft + rawRight));
  const targetHeight = Math.max(1, Math.round(sourceHeight + rawTop + rawBottom));

  const beforeCanvas = document.createElement("canvas");
  beforeCanvas.width = targetWidth;
  beforeCanvas.height = targetHeight;
  const beforeCtx = beforeCanvas.getContext("2d");
  beforeCtx.fillStyle = "#f6f8fb";
  beforeCtx.fillRect(0, 0, targetWidth, targetHeight);
  beforeCtx.drawImage(before, rawLeft, rawTop, sourceWidth, sourceHeight);

  const afterCanvas = document.createElement("canvas");
  afterCanvas.width = targetWidth;
  afterCanvas.height = targetHeight;
  const afterCtx = afterCanvas.getContext("2d");
  afterCtx.fillStyle = "#f6f8fb";
  afterCtx.fillRect(0, 0, targetWidth, targetHeight);
  afterCtx.drawImage(after, 0, 0, targetWidth, targetHeight);

  return {
    beforeSrc: beforeCanvas.toDataURL("image/png"),
    afterSrc: afterCanvas.toDataURL("image/png"),
  };
}

async function compositeOutpaint2Images(images, originalSrc, padding) {
  return Promise.all(
    images.map(async (image, index) => {
      const fixedSrc = await compositeOutpaint2Image(image.src, originalSrc, padding);
      return {
        ...image,
        src: fixedSrc,
        savedUrl: fixedSrc,
        name: image.name || `outpaint2-${index + 1}.png`,
      };
    })
  );
}

async function compositeOutpaint2Image(afterSrc, originalSrc, padding) {
  const [original, after] = await Promise.all([loadImageElement(originalSrc), loadImageElement(afterSrc)]);
  const left = Math.max(0, Number(padding?.left || 0));
  const top = Math.max(0, Number(padding?.top || 0));
  const right = Math.max(0, Number(padding?.right || 0));
  const bottom = Math.max(0, Number(padding?.bottom || 0));
  const sourceWidth = original.naturalWidth || original.width || 1;
  const sourceHeight = original.naturalHeight || original.height || 1;
  const targetWidth = Math.max(1, Math.round(sourceWidth + left + right));
  const targetHeight = Math.max(1, Math.round(sourceHeight + top + bottom));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.drawImage(after, 0, 0, targetWidth, targetHeight);
  ctx.drawImage(original, left, top, sourceWidth, sourceHeight);
  return canvas.toDataURL("image/png");
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

async function setUpscaleImage(file) {
  if (!file.type.startsWith("image/")) {
    setUpscaleStatus("只能上传图片文件。");
    return;
  }

  setUpscaleStatus("正在上传图片...");
  const url = await uploadCanvasImageFile(file);
  upscaleImage = { name: file.name, url };
  upscaleInputPreview.src = url;
  upscaleInputPreview.hidden = false;
  upscaleDrop.classList.add("has-image");
  setUpscaleStatus(`已选择：${file.name}`);
}

async function setUpscale2Image(file) {
  if (!file.type.startsWith("image/")) {
    setUpscale2Status("只能上传图片文件。");
    return;
  }

  const url = await fileToDataUrl(file);
  upscale2Image = { name: file.name, url };
  upscale2InputPreview.src = url;
  upscale2InputPreview.hidden = false;
  upscale2Drop.classList.add("has-image");
  setUpscale2Status(`已选择：${file.name}`);
}

function bindShoeSwapDrop(drop, input, setter) {
  const handleFile = async (file) => {
    try {
      await setter(file);
    } catch (error) {
      setShoeSwapStatus(`图片上传失败：${error.message}`);
    }
  };

  drop.addEventListener("click", () => input.click());
  drop.addEventListener("dragover", (event) => {
    event.preventDefault();
    drop.classList.add("drag-over");
  });
  drop.addEventListener("dragleave", () => {
    drop.classList.remove("drag-over");
  });
  drop.addEventListener("drop", async (event) => {
    event.preventDefault();
    drop.classList.remove("drag-over");
    const file = event.dataTransfer.files?.[0];
    if (file) await handleFile(file);
  });
  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (file) await handleFile(file);
    input.value = "";
  });
}

async function setShoeSwapPersonImage(file) {
  if (!file.type.startsWith("image/")) {
    setShoeSwapStatus("只能上传图片文件。");
    return;
  }

  setShoeSwapStatus("正在上传人物原图...");
  const url = await uploadCanvasImageFile(file);
  shoeSwapPersonImage = { name: file.name, url };
  shoeSwapPersonPreview.src = url;
  shoeSwapPersonPreview.hidden = false;
  shoeSwapPersonDrop.classList.add("has-image");
  setShoeSwapStatus(shoeSwapShoeImage ? "已选择两张图片，可以开始换鞋。" : `已选择人物图：${file.name}`);
}

async function setShoeSwapShoeImage(file) {
  if (!file.type.startsWith("image/")) {
    setShoeSwapStatus("只能上传图片文件。");
    return;
  }

  setShoeSwapStatus("正在上传鞋子参考图...");
  const url = await uploadCanvasImageFile(file);
  shoeSwapShoeImage = { name: file.name, url };
  shoeSwapShoePreview.src = url;
  shoeSwapShoePreview.hidden = false;
  shoeSwapShoeDrop.classList.add("has-image");
  setShoeSwapStatus(shoeSwapPersonImage ? "已选择两张图片，可以开始换鞋。" : `已选择鞋子图：${file.name}`);
}

async function setShoeSwapShoeExample(src, name) {
  if (!src) return;
  const url = normalizeLocalAssetUrl(src);
  shoeSwapShoeImage = { name, url };
  shoeSwapShoePreview.src = url;
  shoeSwapShoePreview.hidden = false;
  shoeSwapShoeDrop.classList.add("has-image");
  setShoeSwapStatus(shoeSwapPersonImage ? "已选择两张图片，可以开始换鞋。" : `已选择鞋子示例：${name}`);
}

async function setOutpaintImage(file) {
  if (!file.type.startsWith("image/")) {
    setOutpaintStatus("只能上传图片文件。");
    return;
  }

  setOutpaintStatus("正在上传图片...");
  const url = await uploadCanvasImageFile(file);
  const dimensions = await getImageDimensions(url).catch(() => ({ width: 1024, height: 1024 }));
  outpaintImage = { name: file.name, url, ...dimensions };
  outpaintInputPreview.src = url;
  outpaintInputPreview.hidden = false;
  outpaintDrop.classList.add("has-image");
  outpaintPadding = { left: 0, top: 0, right: 0, bottom: 0 };
  updateOutpaintEditor();
  setOutpaintStatus(`已选择：${file.name}`);
}

async function setOutpaint2Image(file) {
  if (!file.type.startsWith("image/")) {
    setOutpaint2Status("只能上传图片文件。");
    return;
  }

  setOutpaint2Status("正在上传图片...");
  const url = await uploadCanvasImageFile(file);
  const dimensions = await getImageDimensions(url).catch(() => ({ width: 1024, height: 1024 }));
  outpaint2Image = { name: file.name, url, ...dimensions };
  outpaint2InputPreview.src = url;
  outpaint2InputPreview.hidden = false;
  outpaint2Drop.classList.add("has-image");
  outpaint2Padding = { left: 0, top: 0, right: 0, bottom: 0 };
  updateOutpaint2Editor();
  setOutpaint2Status(`已选择：${file.name}`);
}

function getImageDimensions(src) {
  return loadImageElement(src).then((img) => ({
    width: img.naturalWidth || img.width || 1024,
    height: img.naturalHeight || img.height || 1024,
  }));
}

function applyOutpaintPreset() {
  const amount = Number(outpaintAmountInput?.value || 200);
  const direction = outpaintDirectionInput?.value || "horizontal";
  const next = { left: 0, top: 0, right: 0, bottom: 0 };
  if (direction === "horizontal" || direction === "all" || direction === "left") next.left = amount;
  if (direction === "horizontal" || direction === "all" || direction === "right") next.right = amount;
  if (direction === "vertical" || direction === "all" || direction === "top") next.top = amount;
  if (direction === "vertical" || direction === "all" || direction === "bottom") next.bottom = amount;
  outpaintPadding = next;
  updateOutpaintEditor();
}

function updateOutpaintEditor() {
  if (!outpaintEditorBlock || !outpaintFrame || !outpaintEditorImage || !outpaintPaddingReadout) return;
  if (!outpaintImage) {
    outpaintEditorBlock.hidden = true;
    return;
  }
  outpaintEditorBlock.hidden = false;
  const imageWidth = Math.max(1, Number(outpaintImage.width || 1024));
  const imageHeight = Math.max(1, Number(outpaintImage.height || 1024));
  const maxImageWidth = 260;
  const maxImageHeight = 210;
  outpaintEditorScale = Math.min(maxImageWidth / imageWidth, maxImageHeight / imageHeight, 0.32);
  const left = Math.round(outpaintPadding.left * outpaintEditorScale);
  const top = Math.round(outpaintPadding.top * outpaintEditorScale);
  const right = Math.round(outpaintPadding.right * outpaintEditorScale);
  const bottom = Math.round(outpaintPadding.bottom * outpaintEditorScale);
  const visualWidth = Math.max(160, Math.round(imageWidth * outpaintEditorScale) + left + right);
  const visualHeight = Math.max(140, Math.round(imageHeight * outpaintEditorScale) + top + bottom);
  outpaintFrame.style.width = `${visualWidth}px`;
  outpaintFrame.style.height = `${visualHeight}px`;
  outpaintEditorImage.src = outpaintImage.url;
  outpaintEditorImage.style.left = `${left}px`;
  outpaintEditorImage.style.top = `${top}px`;
  outpaintEditorImage.style.width = `${Math.round(imageWidth * outpaintEditorScale)}px`;
  outpaintEditorImage.style.height = `${Math.round(imageHeight * outpaintEditorScale)}px`;
  const snapped = getSnappedOutpaintPadding();
  outpaintPaddingReadout.textContent = `左 ${snapped.left}px · 上 ${snapped.top}px · 右 ${snapped.right}px · 下 ${snapped.bottom}px`;
}

function handleOutpaintHandlePointerDown(event) {
  const handle = event.target.closest?.(".outpaint-handle");
  if (!handle || !outpaintImage) return;
  event.preventDefault();
  event.stopPropagation();
  const side = handle.dataset.outpaintSide || "";
  const startX = event.clientX;
  const startY = event.clientY;
  const start = { ...outpaintPadding };
  const scale = outpaintEditorScale || 1;
  handle.setPointerCapture?.(event.pointerId);

  const move = (moveEvent) => {
    const dx = (moveEvent.clientX - startX) / scale;
    const dy = (moveEvent.clientY - startY) / scale;
    const next = { ...start };
    if (side.includes("left")) next.left = clampOutpaintPadding(start.left - dx);
    if (side.includes("right")) next.right = clampOutpaintPadding(start.right + dx);
    if (side.includes("top")) next.top = clampOutpaintPadding(start.top - dy);
    if (side.includes("bottom")) next.bottom = clampOutpaintPadding(start.bottom + dy);
    outpaintPadding = next;
    updateOutpaintEditor();
  };

  const up = (upEvent) => {
    handle.releasePointerCapture?.(upEvent.pointerId);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up, { once: true });
}

function clampOutpaintPadding(value) {
  return Math.round(clampNumber(value, 0, 2048));
}

function updateOutpaint2Editor() {
  if (!outpaint2EditorBlock || !outpaint2Frame || !outpaint2EditorImage || !outpaint2PaddingReadout) return;
  if (!outpaint2Image) {
    outpaint2EditorBlock.hidden = true;
    return;
  }
  outpaint2EditorBlock.hidden = false;
  const imageWidth = Math.max(1, Number(outpaint2Image.width || 1024));
  const imageHeight = Math.max(1, Number(outpaint2Image.height || 1024));
  outpaint2EditorScale = Math.min(260 / imageWidth, 210 / imageHeight, 0.32);
  const left = Math.round(outpaint2Padding.left * outpaint2EditorScale);
  const top = Math.round(outpaint2Padding.top * outpaint2EditorScale);
  const right = Math.round(outpaint2Padding.right * outpaint2EditorScale);
  const bottom = Math.round(outpaint2Padding.bottom * outpaint2EditorScale);
  const visualWidth = Math.max(160, Math.round(imageWidth * outpaint2EditorScale) + left + right);
  const visualHeight = Math.max(140, Math.round(imageHeight * outpaint2EditorScale) + top + bottom);
  outpaint2Frame.style.width = `${visualWidth}px`;
  outpaint2Frame.style.height = `${visualHeight}px`;
  outpaint2EditorImage.src = outpaint2Image.url;
  outpaint2EditorImage.style.left = `${left}px`;
  outpaint2EditorImage.style.top = `${top}px`;
  outpaint2EditorImage.style.width = `${Math.round(imageWidth * outpaint2EditorScale)}px`;
  outpaint2EditorImage.style.height = `${Math.round(imageHeight * outpaint2EditorScale)}px`;
  const snapped = getSnappedOutpaint2Padding();
  outpaint2PaddingReadout.textContent = `左 ${snapped.left}px · 上 ${snapped.top}px · 右 ${snapped.right}px · 下 ${snapped.bottom}px`;
}

function handleOutpaint2HandlePointerDown(event) {
  const handle = event.target.closest?.(".outpaint-handle");
  if (!handle || !outpaint2Image) return;
  event.preventDefault();
  event.stopPropagation();
  const side = handle.dataset.outpaintSide || "";
  const startX = event.clientX;
  const startY = event.clientY;
  const start = { ...outpaint2Padding };
  const scale = outpaint2EditorScale || 1;
  handle.setPointerCapture?.(event.pointerId);

  const move = (moveEvent) => {
    const dx = (moveEvent.clientX - startX) / scale;
    const dy = (moveEvent.clientY - startY) / scale;
    const next = { ...start };
    if (side.includes("left")) next.left = clampOutpaintPadding(start.left - dx);
    if (side.includes("right")) next.right = clampOutpaintPadding(start.right + dx);
    if (side.includes("top")) next.top = clampOutpaintPadding(start.top - dy);
    if (side.includes("bottom")) next.bottom = clampOutpaintPadding(start.bottom + dy);
    outpaint2Padding = next;
    updateOutpaint2Editor();
  };

  const up = (upEvent) => {
    handle.releasePointerCapture?.(upEvent.pointerId);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up, { once: true });
}

function snapOutpaintPadding(value) {
  return Math.round(clampNumber(value, 0, 2048) / 16) * 16;
}

function getSnappedOutpaintPadding() {
  return {
    left: snapOutpaintPadding(outpaintPadding.left),
    top: snapOutpaintPadding(outpaintPadding.top),
    right: snapOutpaintPadding(outpaintPadding.right),
    bottom: snapOutpaintPadding(outpaintPadding.bottom),
  };
}

function getSnappedOutpaint2Padding() {
  return {
    left: snapOutpaintPadding(outpaint2Padding.left),
    top: snapOutpaintPadding(outpaint2Padding.top),
    right: snapOutpaintPadding(outpaint2Padding.right),
    bottom: snapOutpaintPadding(outpaint2Padding.bottom),
  };
}

async function createOutpaintAlphaInput(src, padding) {
  const img = await loadImageElement(src);
  const sourceWidth = img.naturalWidth || img.width || 1;
  const sourceHeight = img.naturalHeight || img.height || 1;
  const targetWidth = Math.ceil((sourceWidth + padding.left + padding.right) / 16) * 16;
  const targetHeight = Math.ceil((sourceHeight + padding.top + padding.bottom) / 16) * 16;
  const effectivePadding = {
    left: padding.left,
    top: padding.top,
    right: padding.right + Math.max(0, targetWidth - sourceWidth - padding.left - padding.right),
    bottom: padding.bottom + Math.max(0, targetHeight - sourceHeight - padding.top - padding.bottom),
  };
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, effectivePadding.left, effectivePadding.top, sourceWidth, sourceHeight);
  return { dataUrl: canvas.toDataURL("image/png"), padding: effectivePadding };
}

async function createOutpaintWhiteInput(src, padding) {
  const img = await loadImageElement(src);
  const sourceWidth = img.naturalWidth || img.width || 1;
  const sourceHeight = img.naturalHeight || img.height || 1;
  const targetWidth = Math.ceil((sourceWidth + padding.left + padding.right) / 16) * 16;
  const targetHeight = Math.ceil((sourceHeight + padding.top + padding.bottom) / 16) * 16;
  const effectivePadding = {
    left: padding.left,
    top: padding.top,
    right: padding.right + Math.max(0, targetWidth - sourceWidth - padding.left - padding.right),
    bottom: padding.bottom + Math.max(0, targetHeight - sourceHeight - padding.top - padding.bottom),
  };
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, effectivePadding.left, effectivePadding.top, sourceWidth, sourceHeight);
  return {
    dataUrl: canvas.toDataURL("image/png"),
    padding: effectivePadding,
    width: targetWidth,
    height: targetHeight,
  };
}

function normalizeLocalAssetUrl(src) {
  const value = String(src || "");
  if (value.startsWith("./")) return `/${value.slice(2)}`;
  return value;
}

async function imageUrlToDataUrl(src) {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`示例图读取失败：${response.status}`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function setReferenceImage(index, file) {
  if (!file.type.startsWith("image/")) {
    setImageStatus("只能上传图片文件。");
    return;
  }

  const dataUrl = await compressImageToDataUrl(file);
  referenceImages[index] = {
    name: file.name,
    url: dataUrl,
  };
  renderReferenceSlot(index);
  setImageStatus(`已添加参考图：${file.name}`);
}

function clearReferenceImage(index) {
  referenceImages[index] = null;
  renderReferenceSlot(index);
  setImageStatus("已移除参考图。");
}

function renderReferenceSlot(index) {
  const slot = referenceSlots[index];
  const labels = ["主图", "参考 A", "参考 B"];
  const ref = referenceImages[index];

  if (!ref) {
    slot.classList.remove("has-image");
    slot.innerHTML = `<span>+</span><strong>${labels[index]}</strong>`;
    return;
  }

  slot.classList.add("has-image");
  slot.innerHTML = `
    <img src="${ref.url}" alt="${ref.name}">
    <button class="remove-reference" type="button" aria-label="移除参考图">×</button>
  `;
  slot.querySelector(".remove-reference").addEventListener("click", (event) => {
    event.stopPropagation();
    clearReferenceImage(index);
  });
}

function compressImageToDataUrl(file, maxSide = 1536, quality = 0.86) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      image.onerror = reject;
      image.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function uploadCanvasImageFile(file) {
  if (file.size > 6 * 1024 * 1024) return uploadImageFileInChunks(file);

  let response;
  try {
    response = await fetch(IMAGE_UPLOAD_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "X-File-Name": encodeURIComponent(file.name || "image.png"),
      },
      body: file,
    });
  } catch (error) {
    throw new Error(`无法连接上传接口：${error.message}`);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || `图片上传失败：${response.status}`);
  const url = data.url || data.local_url || data.path;
  if (!url) throw new Error("上传接口没有返回图片地址。");
  return url;
}

async function uploadImageFileInChunks(file) {
  const chunkSize = 4 * 1024 * 1024;
  const total = Math.ceil(file.size / chunkSize);
  const uploadId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  let completed = null;

  for (let index = 0; index < total; index += 1) {
    const start = index * chunkSize;
    const chunk = file.slice(start, Math.min(file.size, start + chunkSize));
    let response;
    try {
      response = await fetch(IMAGE_CHUNK_UPLOAD_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Upload-Id": uploadId,
          "X-Chunk-Index": String(index),
          "X-Chunk-Total": String(total),
          "X-File-Name": encodeURIComponent(file.name || "image.png"),
          "X-File-Type": file.type || "image/png",
        },
        body: chunk,
      });
    } catch (error) {
      throw new Error(`无法连接上传接口：${error.message}`);
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || data.message || `分片上传失败：${response.status}`);
    if (data.complete) completed = data;
  }

  const url = completed?.url || completed?.local_url || completed?.path;
  if (!url) throw new Error("分片上传完成但没有返回图片地址。");
  return url;
}

async function uploadCanvasMediaFile(file) {
  if (!file || !/^(image|video|audio)\//.test(file.type || "")) throw new Error("只支持图片、视频或音频文件。");
  if (file.size > 6 * 1024 * 1024) return uploadMediaFileInChunks(file);
  let response;
  try {
    response = await fetch(MEDIA_UPLOAD_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "X-File-Name": encodeURIComponent(file.name || "media"),
      },
      body: file,
    });
  } catch (error) {
    throw new Error(`无法连接媒体上传接口：${error.message}`);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || `媒体上传失败：${response.status}`);
  const url = data.url || data.local_url || data.path;
  if (!url) throw new Error("媒体上传接口没有返回文件地址。");
  return { url, filename: data.filename || file.name, mimeType: data.mimeType || file.type };
}

async function uploadMediaFileInChunks(file) {
  const chunkSize = 4 * 1024 * 1024;
  const total = Math.ceil(file.size / chunkSize);
  const uploadId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  let completed = null;
  for (let index = 0; index < total; index += 1) {
    const chunk = file.slice(index * chunkSize, Math.min(file.size, (index + 1) * chunkSize));
    let response;
    try {
      response = await fetch(MEDIA_CHUNK_UPLOAD_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Upload-Id": uploadId,
          "X-Chunk-Index": String(index),
          "X-Chunk-Total": String(total),
          "X-File-Name": encodeURIComponent(file.name || "media"),
          "X-File-Type": file.type || "application/octet-stream",
        },
        body: chunk,
      });
    } catch (error) {
      throw new Error(`无法连接媒体上传接口：${error.message}`);
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || data.message || `媒体分片上传失败：${response.status}`);
    if (data.complete) completed = data;
  }
  const url = completed?.url || completed?.local_url || completed?.path;
  if (!url) throw new Error("媒体分片上传完成但没有返回文件地址。");
  return { url, filename: completed.filename || file.name, mimeType: completed.mimeType || file.type };
}

function openPreview(src, downloadUrl, options = {}) {
  previewState.compare = null;
  const galleryItems = normalizePreviewGallery(options.gallery);
  if (galleryItems.length > 1) {
    const srcIndex = galleryItems.findIndex((item) => item.src === src);
    const requestedIndex = Object.prototype.hasOwnProperty.call(options, "index") ? Number(options.index) : srcIndex;
    const index = clampNumber(Number.isFinite(requestedIndex) ? requestedIndex : 0, 0, galleryItems.length - 1);
    previewState.gallery = { items: galleryItems, index };
    src = galleryItems[index].src;
    downloadUrl = galleryItems[index].savedUrl || galleryItems[index].src;
  } else {
    previewState.gallery = null;
  }
  resetPreviewTransform();
  lightbox.querySelector(".lightbox-compare")?.remove();
  lightboxImage.hidden = false;
  lightboxImage.src = src;
  lightboxDownload.href = downloadUrl || src;
  updatePreviewGalleryControls();
  lightbox.hidden = false;
}

function openComparePreview(beforeSrc, afterSrc, downloadUrl, prompt = "", compareOptions = {}) {
  previewState.compare = { beforeSrc, afterSrc, prompt };
  previewState.gallery = null;
  resetPreviewTransform();
  lightboxImage.hidden = true;
  lightboxImage.src = "";
  lightbox.querySelector(".lightbox-compare")?.remove();
  updatePreviewGalleryControls();
  const compare = createComparePreview(beforeSrc, afterSrc, prompt, compareOptions);
  compare.classList.add("lightbox-compare");
  lightbox.insertBefore(compare, lightboxDownload);
  lightboxDownload.href = downloadUrl || afterSrc;
  lightbox.hidden = false;
}

function closePreview() {
  lightbox.hidden = true;
  lightboxImage.src = "";
  lightboxImage.hidden = false;
  lightbox.querySelector(".lightbox-compare")?.remove();
  previewState.compare = null;
  previewState.gallery = null;
  updatePreviewGalleryControls();
  resetPreviewTransform();
}

function normalizePreviewGallery(images) {
  return (Array.isArray(images) ? images : [])
    .map((image, index) => ({
      src: image?.src || image?.url || image?.savedUrl || "",
      savedUrl: image?.savedUrl || image?.src || image?.url || "",
      name: image?.name || `图片 ${index + 1}`,
    }))
    .filter((image) => image.src);
}

function handlePreviewGalleryEdgeClick(event) {
  const gallery = previewState.gallery;
  if (!gallery?.items || gallery.items.length <= 1 || previewState.compare) return false;
  if (event.target.closest?.(".lightbox-gallery-controls button")) return false;
  const controls = lightbox.querySelector(".lightbox-gallery-controls");
  if (!controls) return false;
  const hotPadding = 18;
  for (const button of controls.querySelectorAll("button")) {
    const rect = button.getBoundingClientRect();
    const inHotZone = event.clientX >= rect.left - hotPadding
      && event.clientX <= rect.right + hotPadding
      && event.clientY >= rect.top - hotPadding
      && event.clientY <= rect.bottom + hotPadding;
    if (!inHotZone) continue;
    event.preventDefault();
    event.stopPropagation();
    showPreviewGalleryImage(button.classList.contains("lightbox-gallery-next") ? 1 : -1);
    return true;
  }
  return false;
}
function showPreviewGalleryImage(step) {
  const gallery = previewState.gallery;
  if (!gallery?.items?.length) return;
  const next = typeof step === "number" && Math.abs(step) > 1
    ? step
    : (gallery.index + Number(step || 0) + gallery.items.length) % gallery.items.length;
  gallery.index = (next + gallery.items.length) % gallery.items.length;
  const item = gallery.items[gallery.index];
  lightboxImage.src = item.src;
  lightboxDownload.href = item.savedUrl || item.src;
  resetPreviewTransform();
  updatePreviewGalleryControls();
}

function updatePreviewGalleryControls() {
  let controls = lightbox.querySelector(".lightbox-gallery-controls");
  const gallery = previewState.gallery;
  if (!gallery?.items || gallery.items.length <= 1 || previewState.compare) {
    controls?.remove();
    return;
  }
  if (!controls) {
    controls = document.createElement("div");
    controls.className = "lightbox-gallery-controls";
    controls.addEventListener("click", (event) => event.stopPropagation());
    controls.addEventListener("pointerdown", (event) => event.stopPropagation());
    controls.innerHTML = `
      <button class="lightbox-gallery-prev" type="button" aria-label="上一张">‹</button>
      <span class="lightbox-gallery-count"></span>
      <button class="lightbox-gallery-next" type="button" aria-label="下一张">›</button>
    `;
    controls.querySelector(".lightbox-gallery-prev").addEventListener("click", (event) => {
      event.stopPropagation();
      showPreviewGalleryImage(-1);
    });
    controls.querySelector(".lightbox-gallery-next").addEventListener("click", (event) => {
      event.stopPropagation();
      showPreviewGalleryImage(1);
    });
    lightbox.append(controls);
  }
  controls.querySelector(".lightbox-gallery-count").textContent = `${gallery.index + 1} / ${gallery.items.length}`;
}

function resetPreviewTransform() {
  previewState.scale = 1;
  previewState.x = 0;
  previewState.y = 0;
  previewState.dragging = false;
  applyPreviewTransform();
}

function applyPreviewTransform() {
  const target = lightbox.querySelector(".lightbox-compare") || lightboxImage;
  if (!target) return;
  if (lightboxZoom) lightboxZoom.textContent = `${Math.round(previewState.scale * 100)}%`;
  target.style.setProperty("--preview-scale", String(previewState.scale));
  target.style.setProperty("--preview-x", `${previewState.x}px`);
  target.style.setProperty("--preview-y", `${previewState.y}px`);
  target.classList.toggle("is-zoomed", previewState.scale > 1.01);
  if (target !== lightboxImage) lightboxImage.classList.remove("is-zoomed", "is-panning");
  if (target !== lightboxImage) return;
  lightboxImage.style.setProperty("--preview-scale", String(previewState.scale));
  lightboxImage.style.setProperty("--preview-x", `${previewState.x}px`);
  lightboxImage.style.setProperty("--preview-y", `${previewState.y}px`);
  lightboxImage.classList.toggle("is-zoomed", previewState.scale > 1.01);
}

function togglePreviewZoom() {
  if (previewState.scale === 1) {
    previewState.scale = 2;
  } else {
    previewState.scale = 1;
    previewState.x = 0;
    previewState.y = 0;
  }
  applyPreviewTransform();
}

function handlePreviewWheel(event) {
  if (lightbox.hidden) return;
  event.preventDefault();
  const previousScale = previewState.scale;
  const nextScale = clamp(previousScale * (event.deltaY < 0 ? 1.12 : 0.89), 1, 6);
  if (nextScale === previousScale) return;

  const target = lightbox.querySelector(".lightbox-compare") || lightboxImage;
  const rect = target.getBoundingClientRect();
  const pointerX = event.clientX - (rect.left + rect.width / 2);
  const pointerY = event.clientY - (rect.top + rect.height / 2);
  const ratio = nextScale / previousScale;
  previewState.x = pointerX - (pointerX - previewState.x) * ratio;
  previewState.y = pointerY - (pointerY - previewState.y) * ratio;
  previewState.scale = nextScale;
  if (nextScale <= 1.01) {
    previewState.scale = 1;
    previewState.x = 0;
    previewState.y = 0;
  }
  applyPreviewTransform();
}

function startPreviewPan(event) {
  if (previewState.scale <= 1.01) return;
  const target = lightbox.querySelector(".lightbox-compare") || lightboxImage;
  const isCompareSlider = Boolean(event.target.closest?.(".compare-slider"));
  if (isCompareSlider && event.button !== 1) return;
  if (!isCompareSlider && ![0, 1].includes(event.button)) return;
  event.preventDefault();
  previewState.dragging = true;
  previewState.startX = event.clientX;
  previewState.startY = event.clientY;
  previewState.originX = previewState.x;
  previewState.originY = previewState.y;
  target.setPointerCapture?.(event.pointerId);
  target.classList.add("is-panning");

  const move = (moveEvent) => {
    if (!previewState.dragging) return;
    previewState.x = previewState.originX + moveEvent.clientX - previewState.startX;
    previewState.y = previewState.originY + moveEvent.clientY - previewState.startY;
    applyPreviewTransform();
  };
  const stop = (stopEvent) => {
    previewState.dragging = false;
    target.releasePointerCapture?.(stopEvent.pointerId);
    target.classList.remove("is-panning");
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
    window.removeEventListener("pointercancel", stop);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop, { once: true });
  window.addEventListener("pointercancel", stop, { once: true });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createDeferredThumbnail(source, alt = "", options = {}) {
  const img = document.createElement("img");
  img.alt = alt;
  img.draggable = options.draggable === true;
  if (source && window.imageResources) {
    window.imageResources.observe(img, source, {
      unload: options.unload !== false,
      maxQuality: "thumbnail",
      allowOriginalFallback: options.allowOriginalFallback !== false,
    });
  } else if (source) {
    img.loading = "lazy";
    img.decoding = "async";
    img.src = source;
  }
  return img;
}

async function saveImageHistory(prompt, images, model, category = "image") {
  await saveServerHistory(IMAGE_HISTORY_API_URL, { id: createId(), prompt, model, images, category, createdAt: Date.now() });
  await renderImageHistory();
  await renderUnifiedHistory();
}

async function renderImageHistory() {
  const records = (await loadServerHistory(IMAGE_HISTORY_API_URL))
    .filter((record) => getHistoryCategory(record) === "image");
  const availableIds = new Set(records.map((record) => String(record.id || "")).filter(Boolean));
  Array.from(selectedImageHistoryIds).forEach((id) => {
    if (!availableIds.has(id)) selectedImageHistoryIds.delete(id);
  });
  imageHistoryEl.innerHTML = "";

  if (!records.length) {
    selectedImageHistoryIds.clear();
    resetImageHistoryDeleteConfirmation();
    imageHistoryEl.innerHTML = '<div class="history-chat"><p>暂无图片历史。</p></div>';
    updateImageHistoryManagementUi();
    return;
  }

  records.forEach((record) => {
    const recordId = String(record.id || "");
    const button = document.createElement("button");
    button.className = "history-thumb";
    button.type = "button";
    if (recordId) button.dataset.historyId = recordId;
    button.innerHTML = `
      <span class="history-thumb-check" aria-hidden="true">✓</span>
      <p>${record.prompt}</p>
    `;
    button.querySelector(".history-thumb-check")?.after(
      createDeferredThumbnail(record.images[0]?.src || record.images[0]?.savedUrl || ""),
    );
    updateImageHistoryCardSelection(button);
    button.setAttribute(
      "aria-label",
      imageHistoryManaging
        ? `${selectedImageHistoryIds.has(recordId) ? "取消选择" : "选择"}历史图片：${record.prompt}`
        : `打开历史图片：${record.prompt}`,
    );
    button.addEventListener("click", () => {
      if (imageHistoryManaging) {
        if (!recordId) return;
        if (selectedImageHistoryIds.has(recordId)) {
          selectedImageHistoryIds.delete(recordId);
        } else {
          selectedImageHistoryIds.add(recordId);
        }
        resetImageHistoryDeleteConfirmation();
        updateImageHistoryCardSelection(button);
        button.setAttribute(
          "aria-label",
          `${selectedImageHistoryIds.has(recordId) ? "取消选择" : "选择"}历史图片：${record.prompt}`,
        );
        updateImageHistoryManagementUi();
        return;
      }
      imagePromptInput.value = record.prompt;
      renderImages(record.images, record.prompt);
      setImageStatus(`历史记录 · 模型：${getModelDisplayName(record.model)}`);
    });
    imageHistoryEl.append(button);
  });
  updateImageHistoryManagementUi();
}

async function renderUnifiedHistory() {
  if (!recordsHistoryEl) return;
  const [imageRecords, boardData] = await Promise.all([
    loadServerHistory(IMAGE_HISTORY_API_URL),
    loadCanvasBoardHistory(),
  ]);
      const records = [
    ...boardData.boards.map((board) => ({ kind: "board", board, createdAt: new Date(board.updatedAt || board.createdAt || 0).getTime() })),
      ...imageRecords
        .map((record) => ({ ...record, category: getHistoryCategory(record), kind: "image-record" }))
        .filter((record) => ["upscale", "shoe", "outpaint", "canvas"].includes(record.category)),
  ].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));

  recordsHistoryEl.innerHTML = "";
  if (recordsCountEl) recordsCountEl.textContent = `${records.length} 个`;
  if (!records.length) {
    recordsHistoryEl.innerHTML = '<div class="history-chat"><p>暂无统一历史记录。</p></div>';
    return;
  }

  records.forEach((record) => {
    const button = document.createElement("button");
    button.className = "record-card";
    button.type = "button";
    if (record.kind === "board") {
      const board = record.board;
      const thumbs = getCanvasBoardThumbnails(board).slice(0, 3);
      button.innerHTML = `
        <div class="record-preview ${thumbs.length ? "" : "is-empty"}"></div>
        <div class="record-copy">
          <strong>${escapeHtml(board.title || "未命名画布")}</strong>
          <p>画布 · ${Number(board.nodeCount ?? board.nodes?.length ?? 0)} 节点 · ${formatCanvasDate(board.updatedAt || board.createdAt)}</p>
        </div>
      `;
      const preview = button.querySelector(".record-preview");
      if (thumbs.length) thumbs.forEach((source) => preview.append(createDeferredThumbnail(source)));
      else {
        const empty = document.createElement("span");
        empty.textContent = "画布";
        preview.append(empty);
      }
      button.addEventListener("click", async () => {
        setActiveTool("canvas");
        await openCanvasBoardFromHistory(board);
      });
    } else {
      const categoryLabel = getHistoryCategoryLabel(record.category);
      button.innerHTML = `
        <div class="record-preview"></div>
        <div class="record-copy">
          <strong>${escapeHtml(record.prompt || categoryLabel)}</strong>
          <p>${categoryLabel} · ${escapeHtml(getModelDisplayName(record.model || ""))} · ${formatCanvasDate(record.createdAt)}</p>
        </div>
      `;
      button.querySelector(".record-preview")?.append(
        createDeferredThumbnail(record.images?.[0]?.src || record.images?.[0]?.savedUrl || ""),
      );
      button.addEventListener("click", () => openUnifiedHistoryRecord(record));
    }
    recordsHistoryEl.append(button);
  });
}

async function loadCanvasBoardHistory() {
  try {
    const response = await fetch(CANVAS_BOARDS_API_URL);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "画布历史读取失败");
    updateCanvasBoardStores(data);
    return { boards: canvasState.boards, trash: canvasState.trashedBoards };
  } catch {
    return { boards: canvasState.boards || [], trash: canvasState.trashedBoards || [] };
  }
}

function openUnifiedHistoryRecord(record) {
  const images = record.images || [];
  if (record.category === "shoe") {
    setActiveTool("shoeSwap");
    renderShoeSwapImages(images, record.prompt || "换鞋历史");
    setShoeSwapStatus(`历史记录 · ${getModelDisplayName(record.model || "")}`);
    return;
  }
  if (record.category === "outpaint") {
    setActiveTool("outpaint");
    renderOutpaintImages(images, record.prompt || "扩图历史");
    setOutpaintStatus(`历史记录 · ${getModelDisplayName(record.model || "")}`);
    return;
  }
  if (record.category === "upscale") {
    const isSeed = /SeedVR2/i.test(record.model || "") || String(record.prompt || "").includes("高清放大2");
    setActiveTool(isSeed ? "upscale2" : "upscale");
    if (isSeed) {
      renderUpscale2Images(images, record.prompt || "放大历史");
      setUpscale2Status(`历史记录 · ${getModelDisplayName(record.model || "")}`);
    } else {
      renderUpscaleImages(images, record.prompt || "放大历史");
      setUpscaleStatus(`历史记录 · ${getModelDisplayName(record.model || "")}`);
    }
    return;
  }
  if (record.category === "canvas") {
    openPreview(images[0]?.src || images[0]?.savedUrl || "", images[0]?.savedUrl || images[0]?.src || "");
  }
}

function getHistoryCategory(record) {
  if (record?.category) return record.category;
  const model = String(record?.model || "");
  const prompt = String(record?.prompt || "");
  if (/换鞋/i.test(model) || prompt.startsWith("换鞋：")) return "shoe";
  if (/扩图|Outpaint|Z-Image/i.test(model) || prompt.startsWith("扩图：")) return "outpaint";
  if (/TTP|SeedVR2|ComfyUI/i.test(model) || prompt.startsWith("高清放大")) return "upscale";
  if (prompt.startsWith("画布") || /画布/.test(prompt)) return "canvas";
  return "image";
}

function getHistoryCategoryLabel(category) {
  if (category === "shoe") return "换鞋";
  if (category === "outpaint") return "扩图";
  if (category === "upscale") return "高清放大";
  if (category === "canvas") return "画布";
  return "在线生图";
}

function getCanvasBoardThumbnails(board) {
  const thumbs = [];
  (board.nodes || []).forEach((node) => {
    if (node.imageSrc || node.resultSrc || node.imageUrl) thumbs.push(node.imageSrc || node.resultSrc || node.imageUrl);
    if (Array.isArray(node.galleryImages)) {
      node.galleryImages.forEach((image) => thumbs.push(image.src || image.savedUrl || ""));
    }
    if (Array.isArray(node.groupImages)) {
      node.groupImages.forEach((image) => thumbs.push(image.src || image.savedUrl || ""));
    }
  });
  return thumbs.filter(Boolean);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function saveConversationHistory(model) {
  const firstUserMessage = history.find((item) => item.role === "user")?.content || "新对话";
  const record = {
    id: currentConversationId,
    title: firstUserMessage,
    model,
    messages: history.slice(),
    updatedAt: Date.now(),
  };

  await saveServerHistory(CHAT_HISTORY_API_URL, record);
  await renderChatHistory();
}

async function renderChatHistory() {
  const records = await loadServerHistory(CHAT_HISTORY_API_URL);
  const availableIds = new Set(records.map((record) => String(record.id || "")).filter(Boolean));
  Array.from(selectedChatHistoryIds).forEach((id) => {
    if (!availableIds.has(id)) selectedChatHistoryIds.delete(id);
  });
  chatHistoryEl.innerHTML = "";

  if (!records.length) {
    selectedChatHistoryIds.clear();
    resetChatHistoryDeleteConfirmation();
    chatHistoryEl.innerHTML = '<div class="history-chat"><p>暂无对话历史。</p></div>';
    updateChatHistoryManagementUi();
    return;
  }

  records.forEach((record) => {
    const recordId = String(record.id || "");
    const row = document.createElement("div");
    row.className = "history-chat-row";
    if (recordId) row.dataset.historyId = recordId;
    row.classList.toggle("active", record.id === currentConversationId);

    const button = document.createElement("button");
    button.className = "history-chat";
    button.type = "button";
    const title = document.createElement("p");
    title.textContent = getChatHistoryTitle(record);
    const titleText = title.textContent;
    const heading = document.createElement("strong");
    heading.textContent = titleText;
    const meta = document.createElement("p");
    const modelName = getModelDisplayName(record.model || "未指定模型");
    const timeText = formatCanvasDate(record.updatedAt || record.createdAt);
    meta.textContent = timeText ? `${modelName} · ${timeText}` : modelName;
    button.append(heading, meta);
    updateChatHistoryRowSelection(row, button);
    button.setAttribute(
      "aria-label",
      chatHistoryManaging
        ? `${selectedChatHistoryIds.has(recordId) ? "取消选择" : "选择"}对话：${titleText}`
        : `打开对话：${titleText}`,
    );
    button.addEventListener("click", () => {
      if (chatHistoryManaging) {
        if (!recordId) return;
        if (selectedChatHistoryIds.has(recordId)) {
          selectedChatHistoryIds.delete(recordId);
        } else {
          selectedChatHistoryIds.add(recordId);
        }
        resetChatHistoryDeleteConfirmation();
        updateChatHistoryRowSelection(row, button);
        button.setAttribute(
          "aria-label",
          `${selectedChatHistoryIds.has(recordId) ? "取消选择" : "选择"}对话：${titleText}`,
        );
        updateChatHistoryManagementUi();
        return;
      }
      currentConversationId = record.id || createId();
      history.length = 0;
      if (record.messages?.length) {
        history.push(...record.messages);
      } else if (record.prompt || record.answer) {
        if (record.prompt) history.push({ role: "user", content: record.prompt });
        if (record.answer) history.push({ role: "assistant", content: record.answer });
      }
      renderConversationMessages();
      setChatStatus(`历史记录 · 模型：${record.model}`);
      document.querySelector(".chat-history-panel")?.classList.remove("is-collapsed");
    });

    const check = document.createElement("span");
    check.className = "chat-history-check";
    check.setAttribute("aria-hidden", "true");
    check.textContent = "✓";
    const more = document.createElement("button");
    more.className = "history-chat-more";
    more.type = "button";
    more.title = "更多操作";
    more.setAttribute("aria-label", `管理对话：${titleText}`);
    more.innerHTML = '<i data-lucide="ellipsis"></i>';

    const menu = document.createElement("div");
    menu.className = "history-chat-menu";
    menu.hidden = true;
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "history-chat-delete";
    deleteButton.innerHTML = '<i data-lucide="trash-2"></i><span>删除对话</span>';
    deleteButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      await deleteServerHistoryRecord(CHAT_HISTORY_API_URL, record.id);
      if (record.id === currentConversationId) {
        currentConversationId = createId();
        resetCurrentChat();
      }
      await renderChatHistory();
      setChatStatus("已删除对话。");
    });
    menu.append(deleteButton);
    more.addEventListener("click", (event) => {
      event.stopPropagation();
      if (chatHistoryManaging) return;
      const willOpen = menu.hidden;
      document.querySelectorAll(".history-chat-menu").forEach((item) => {
        item.hidden = true;
      });
      menu.hidden = !willOpen;
    });
    row.append(button, check, more, menu);
    chatHistoryEl.append(row);
  });

  updateChatHistoryManagementUi();
  window.lucide?.createIcons({
    attrs: {
      "aria-hidden": "true",
      "stroke-width": 1.8,
    },
  });
}

function getChatHistoryTitle(record) {
  const source = record?.title || record?.prompt || record?.messages?.find((message) => message.role === "user")?.displayContent || record?.messages?.find((message) => message.role === "user")?.content;
  if (typeof source === "string") {
    const cleaned = source
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned && !cleaned.includes("[object Object]") ? cleaned.slice(0, 120) : "包含附件的对话";
  }
  if (Array.isArray(source)) {
    const textPart = source.find((item) => item?.type === "text" || item?.text)?.text;
    return typeof textPart === "string" && textPart.trim() ? textPart.trim().slice(0, 120) : "包含附件的对话";
  }
  if (source && typeof source === "object" && typeof source.text === "string") {
    return source.text.trim() ? source.text.trim().slice(0, 120) : "包含附件的对话";
  }
  return "历史对话";
}

function resetCurrentChat() {
  history.length = 0;
  messagesEl.innerHTML = "";
  chatPromptInput.value = "";
  resizeChatPrompt();
  clearChatAttachments();
  renderChatWelcome();
}

function renderConversationMessages() {
  messagesEl.innerHTML = "";
  if (!history.length) {
    renderChatWelcome();
    return;
  }

  history.forEach((message) => addMessage(message.role, message.displayContent || formatChatMessageForDisplay(message.content)));
}

function formatChatMessageForDisplay(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "包含结构化内容的消息";
  const text = content
    .filter((item) => item?.type === "text" && typeof item.text === "string")
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join("\n");
  const images = content
    .filter((item) => item?.type === "image_url")
    .map((item) => normalizeDisplayImage(item.image_url?.url || item.image_url))
    .filter(Boolean);
  return images.length ? { text: text || "包含附件的消息", images } : text || "包含附件的消息";
}

async function addChatAttachment(file) {
  const id = createId();
  const isImage = file.type.startsWith("image/");
  const isText = isReadableTextFile(file);

  if (!isImage && !isText) {
    chatAttachments.push({ id, name: file.name, type: file.type || "file", unsupported: true });
    renderChatAttachments();
    setChatStatus("该文件类型暂不读取内容，仅显示附件名。");
    return;
  }

  const value = isImage ? await fileToCompressedImage(file) : await file.text();
  chatAttachments.push({
    id,
    name: file.name,
    type: file.type,
    kind: isImage ? "image" : "text",
    value,
  });
  renderChatAttachments();
}

function renderChatAttachments() {
  chatAttachmentsEl.innerHTML = "";
  chatAttachments.forEach((file) => {
    const item = document.createElement("span");
    item.className = file.kind === "image" ? "attachment-preview" : "attachment-chip";

    if (file.kind === "image") {
      const image = document.createElement("img");
      image.src = file.value;
      image.alt = file.name || "上传图片";
      item.append(image);
    } else {
      const label = document.createElement("span");
      label.textContent = `${file.kind === "text" ? "文件" : "附件"}：${file.name}`;
      item.append(label);
    }

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "×";
    removeButton.setAttribute("aria-label", `移除 ${file.name}`);
    removeButton.addEventListener("click", () => {
      const index = chatAttachments.findIndex((attachment) => attachment.id === file.id);
      if (index >= 0) chatAttachments.splice(index, 1);
      renderChatAttachments();
    });
    item.append(removeButton);
    chatAttachmentsEl.append(item);
  });
  resizeChatPrompt();
}
function clearChatAttachments() {
  chatAttachments.length = 0;
  renderChatAttachments();
}

function buildUserMessageContent(prompt) {
  const images = chatAttachments.filter((file) => file.kind === "image");
  const textFiles = chatAttachments.filter((file) => file.kind === "text");
  const unsupportedFiles = chatAttachments.filter((file) => file.unsupported);

  const fileText = textFiles
    .map((file) => `\n\n[文件：${file.name}]\n${file.value}`)
    .join("");
  const unsupportedText = unsupportedFiles.length
    ? `\n\n[未读取内容的附件：${unsupportedFiles.map((file) => file.name).join("、")}]`
    : "";
  const text = `${prompt}${fileText}${unsupportedText}`;

  if (!images.length) return text;

  return [
    { type: "text", text },
    ...images.map((file) => ({
      type: "image_url",
      image_url: { url: file.value },
    })),
  ];
}

function buildUserDisplayContent(prompt) {
  const images = chatAttachments
    .filter((file) => file.kind === "image")
    .map((file) => ({ url: file.value, alt: file.name || "上传图片" }));
  const otherAttachments = chatAttachments.filter((file) => file.kind !== "image");
  const attachmentText = otherAttachments.length
    ? `\n\n附件：${otherAttachments.map((file) => file.name).join("、")}`
    : "";
  return images.length ? { text: `${prompt}${attachmentText}`, images } : `${prompt}${attachmentText}`;
}

async function initializeSharedHistory() {
  await migrateLegacyHistory();
  await Promise.all([renderImageHistory(), renderChatHistory(), renderUnifiedHistory()]);
}

async function migrateLegacyHistory() {
  if (localStorage.getItem(HISTORY_MIGRATION_KEY)) return;

  const imageRecords = getLocalHistoryRecords(LEGACY_IMAGE_HISTORY_KEY);
  const chatRecords = getLocalHistoryRecords(LEGACY_CHAT_HISTORY_KEY);

  for (const record of imageRecords.slice().reverse()) {
    await saveServerHistory(IMAGE_HISTORY_API_URL, record);
  }

  for (const record of chatRecords.slice().reverse()) {
    await saveServerHistory(CHAT_HISTORY_API_URL, record);
  }

  localStorage.setItem(HISTORY_MIGRATION_KEY, String(Date.now()));
}

function getLocalHistoryRecords(key) {
  try {
    const records = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

async function loadServerHistory(url) {
  try {
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "历史记录读取失败。");
    return Array.isArray(data.records) ? data.records : [];
  } catch (error) {
    console.warn(error);
    return [];
  }
}

async function saveServerHistory(url, record) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ record }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "历史记录保存失败。");
  return Array.isArray(data.records) ? data.records : [];
}

async function clearServerHistory(url) {
  try {
    await fetch(url, { method: "DELETE" });
  } catch (error) {
    console.warn(error);
  }
}

async function deleteServerHistoryRecord(url, id) {
  if (!id) return;
  const separator = url.includes("?") ? "&" : "?";
  const response = await fetch(`${url}${separator}id=${encodeURIComponent(id)}`, { method: "DELETE" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "历史记录删除失败。");
}

function isReadableTextFile(file) {
  const textTypes = ["text/", "application/json", "application/xml", "application/javascript"];
  const textExtensions = [".txt", ".md", ".csv", ".json", ".xml", ".html", ".css", ".js", ".ts"];
  const name = file.name.toLowerCase();
  return textTypes.some((type) => file.type.startsWith(type) || file.type === type) || textExtensions.some((ext) => name.endsWith(ext));
}

function fileToCompressedImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxSide = 1536;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.86));
      };
      image.onerror = reject;
      image.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function addMessage(role, content) {
  messagesEl.querySelector(".chat-welcome")?.remove();
  const article = document.createElement("article");
  article.className = `message ${role}`;

  const label = document.createElement("span");
  label.textContent = role === "user" ? "You" : role === "error" ? "Error" : "Assistant";

  const display = normalizeMessageDisplay(content);
  article.classList.toggle("has-images", display.images.length > 0);
  const text = document.createElement("p");
  renderMessageText(text, display.text, role);

  article.append(label, text);
  if (display.images.length) {
    const gallery = document.createElement("div");
    gallery.className = "message-images";
    if (display.images.length === 1) gallery.classList.add("single");
    display.images.forEach((image) => {
      const frame = document.createElement("button");
      frame.className = "message-image";
      frame.type = "button";
      frame.title = image.alt || "查看图片";
      const img = createDeferredThumbnail(image.url, image.alt || "图片");
      frame.append(img);
      frame.addEventListener("click", () => openPreview(image.url, image.url));
      gallery.append(frame);
    });
    article.insertBefore(gallery, text);
  }
  if (display.sources.length) {
    const sources = document.createElement("div");
    sources.className = "message-sources";
    display.sources.slice(0, 5).forEach((source, index) => {
      const link = document.createElement("a");
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = source.title || `来源 ${index + 1}`;
      sources.append(link);
    });
    article.append(sources);
  }
  messagesEl.append(article);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return article;
}

function normalizeMessageDisplay(content) {
  if (content && typeof content === "object" && !Array.isArray(content)) {
    return {
      text: typeof content.text === "string" ? content.text : "",
      images: Array.isArray(content.images) ? content.images.map(normalizeDisplayImage).filter(Boolean) : [],
      sources: Array.isArray(content.sources) ? content.sources.map(normalizeDisplaySource).filter(Boolean) : [],
    };
  }
  return { text: String(content || ""), images: [], sources: [] };
}

function renderMessageText(element, value, role) {
  const text = String(value || "");
  if (role !== "assistant") {
    element.textContent = text;
    return;
  }
  element.innerHTML = renderAssistantMarkdown(text);
}

function renderAssistantMarkdown(value) {
  const lines = String(value || "").split(/\r?\n/);
  const html = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (isMarkdownTableStart(lines, index)) {
      const tableLines = [];
      while (index < lines.length && /^\s*\|.+\|\s*$/.test(lines[index])) {
        tableLines.push(lines[index]);
        index += 1;
      }
      index -= 1;
      html.push(renderMarkdownTable(tableLines));
      continue;
    }
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      html.push(`<span class="message-line bullet">• ${formatInlineMarkdown(bullet[1])}</span>`);
      continue;
    }
    html.push(`<span class="message-line">${formatInlineMarkdown(trimmed)}</span>`);
  }
  return html.join("");
}

function isMarkdownTableStart(lines, index) {
  return /^\s*\|.+\|\s*$/.test(lines[index] || "") && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1] || "");
}

function renderMarkdownTable(lines) {
  const rows = lines
    .filter((line, index) => index !== 1)
    .map((line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));
  if (!rows.length) return "";
  const [head, ...body] = rows;
  return `<span class="message-table-wrap"><table class="message-table"><thead><tr>${head.map((cell) => `<th>${formatInlineMarkdown(cell)}</th>`).join("")}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${formatInlineMarkdown(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></span>`;
}

function formatInlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function normalizeDisplaySource(value) {
  if (!value || typeof value !== "object") return null;
  const url = value.url || value.href || value.link;
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return null;
  let fallbackTitle = "来源";
  try {
    fallbackTitle = new URL(url).hostname;
  } catch {}
  return {
    title: String(value.title || value.name || value.source || fallbackTitle),
    url,
  };
}

function normalizeDisplayImage(value) {
  if (!value) return null;
  if (typeof value === "string") return { url: value, alt: "图片" };
  const url = value.url || value.local_url || value.src || value.image_url?.url || value.image_url;
  if (typeof url !== "string") return null;
  return { url, alt: value.alt || value.name || value.filename || "图片" };
}

function extractSavedImageUrls(data) {
  const images = [];
  const add = (value) => {
    const image = normalizeDisplayImage(value);
    if (image && !images.some((item) => item.url === image.url)) images.push(image);
  };
  const saved = Array.isArray(data?.saved_images) ? data.saved_images : [];
  saved.forEach((item) => {
    if (typeof item === "string") add(item);
    else add(item?.url || item?.local_url || item);
  });
  const direct = Array.isArray(data?.images) ? data.images : [];
  direct.forEach(add);
  return images;
}

function renderChatWelcome() {
  messagesEl.innerHTML = `
    <div class="chat-welcome">
      <h2>我们先从哪里开始呢？</h2>
      <div class="chat-suggestions" aria-label="快捷开始">
        <button type="button" data-chat-suggestion="帮我生成一张产品宣传图">生成图片</button>
        <button type="button" data-chat-suggestion="帮我润色并改写这段文案">撰写或编辑</button>
        <button type="button" data-chat-suggestion="帮我分析这份资料并总结重点">查找资料</button>
      </div>
    </div>
  `;
}

function setChatLoading(isLoading) {
  sendButton.disabled = isLoading;
  sendButton.classList.toggle("is-loading", isLoading);
  sendButton.innerHTML = isLoading
    ? '<i class="send-stop" aria-hidden="true"></i><span class="send-label">生成中</span>'
    : '<i data-lucide="arrow-up" class="send-arrow"></i><span class="send-label">发送</span>';
  window.lucide?.createIcons({
    attrs: {
      "aria-hidden": "true",
      "stroke-width": 1.8,
    },
  });
  if (isLoading) {
    chatLoadingMessage = addMessage("assistant typing", "正在思考");
    setChatStatus("AI 正在生成回复...");
  } else if (chatLoadingMessage) {
    chatLoadingMessage.remove();
    chatLoadingMessage = null;
  }
}

function setImageLoading(isLoading) {
  generateButton.disabled = isLoading;
  if (isLoading) {
    generateButton.textContent = "生成中...";
  } else {
    updateGenerateButtonLabel();
  }
  if (isLoading) setImageStatus("正在生成图片...");
  else syncMainImageResolutionState();
}

function setUpscaleLoading(isLoading) {
  upscaleButton.disabled = isLoading;
  upscaleButton.innerHTML = isLoading ? "<span>⇧</span>正在高清放大" : "<span>⇧</span>开始高清放大";
  if (isLoading) {
    setUpscaleStatus("正在提交 ComfyUI，请稍等...");
    stopUpscaleProgress();
    setUpscaleProgress(5);
  } else {
    stopUpscaleProgress();
  }
}

function setUpscale2Loading(isLoading) {
  upscale2Button.disabled = isLoading;
  upscale2Button.innerHTML = isLoading ? "<span>⇪</span>正在高清放大2" : "<span>⇪</span>开始高清放大2";
  if (isLoading) {
    setUpscale2Status("正在提交 ComfyUI，请稍等...");
    stopUpscale2Progress();
    setUpscale2Progress(5);
  } else {
    stopUpscale2Progress();
  }
}

function setShoeSwapLoading(isLoading) {
  shoeSwapButton.disabled = isLoading;
  shoeSwapButton.innerHTML = isLoading ? "<span>↔</span>正在换鞋" : "<span>↔</span>开始换鞋";
  if (isLoading) {
    setShoeSwapStatus("正在提交 ComfyUI，请稍等...");
    stopShoeSwapProgress();
    setShoeSwapProgress(5);
  } else {
    stopShoeSwapProgress();
  }
}

function setOutpaintLoading(isLoading) {
  outpaintButton.disabled = isLoading;
  outpaintButton.innerHTML = isLoading ? "<span>⇱</span>正在扩图" : "<span>⇱</span>开始扩图";
  if (isLoading) {
    setOutpaintStatus("正在提交 ComfyUI，请稍等...");
    stopOutpaintProgress();
    setOutpaintProgress(5);
  } else {
    stopOutpaintProgress();
  }
}

function setOutpaint2Loading(isLoading) {
  outpaint2Button.disabled = isLoading;
  outpaint2Button.innerHTML = isLoading ? "<span>⇲</span>正在扩图2" : "<span>⇲</span>开始扩图2";
  if (isLoading) {
    setOutpaint2Status("正在提交 RunningHub，请稍等...");
    stopOutpaint2Progress();
    setOutpaint2Progress(5);
  } else {
    stopOutpaint2Progress();
  }
}

function startUpscaleProgress() {
  setUpscaleProgress(8);
  let progress = 8;
  clearInterval(upscaleProgressTimer);
  upscaleProgressTimer = setInterval(() => {
    progress = Math.min(92, progress + Math.max(1, Math.round((94 - progress) / 12)));
    setUpscaleProgress(progress);
  }, 1400);
}

function stopUpscaleProgress() {
  clearInterval(upscaleProgressTimer);
  upscaleProgressTimer = null;
}

function stopUpscale2Progress() {
  clearInterval(upscale2ProgressTimer);
  upscale2ProgressTimer = null;
}

function stopShoeSwapProgress() {
  clearInterval(shoeSwapProgressTimer);
  shoeSwapProgressTimer = null;
}

function stopOutpaintProgress() {
  clearInterval(outpaintProgressTimer);
  outpaintProgressTimer = null;
}

function stopOutpaint2Progress() {
  clearInterval(outpaint2ProgressTimer);
  outpaint2ProgressTimer = null;
}

function setUpscaleProgress(value, message) {
  upscaleProgress.setAttribute("aria-hidden", value <= 0 ? "true" : "false");
  upscaleProgressBar.style.width = `${Math.max(0, Math.min(100, value))}%`;
  if (message) setUpscaleStatus(message);
}

function setUpscale2Progress(value, message) {
  upscale2Progress.setAttribute("aria-hidden", value <= 0 ? "true" : "false");
  upscale2ProgressBar.style.width = `${Math.max(0, Math.min(100, value))}%`;
  if (message) setUpscale2Status(message);
}

function setShoeSwapProgress(value, message) {
  shoeSwapProgress.setAttribute("aria-hidden", value <= 0 ? "true" : "false");
  shoeSwapProgressBar.style.width = `${Math.max(0, Math.min(100, value))}%`;
  if (message) setShoeSwapStatus(message);
}

function setOutpaintProgress(value, message) {
  outpaintProgress.setAttribute("aria-hidden", value <= 0 ? "true" : "false");
  outpaintProgressBar.style.width = `${Math.max(0, Math.min(100, value))}%`;
  if (message) setOutpaintStatus(message);
}

function setOutpaint2Progress(value, message) {
  outpaint2Progress.setAttribute("aria-hidden", value <= 0 ? "true" : "false");
  outpaint2ProgressBar.style.width = `${Math.max(0, Math.min(100, value))}%`;
  if (message) setOutpaint2Status(message);
}

function setChatStatus(message) {
  chatStatusText.textContent = message;
}

function updateChatWebSearchButton() {
  if (!webSearchButton) return;
  webSearchButton.classList.toggle("active", chatWebSearchEnabled);
  webSearchButton.setAttribute("aria-pressed", String(chatWebSearchEnabled));
  webSearchButton.title = chatWebSearchEnabled ? "联网搜索已开启" : "联网搜索";
}

function setImageStatus(message) {
  imageStatusText.textContent = message;
}

function setUpscaleStatus(message) {
  upscaleStatusText.textContent = message;
}

function setUpscale2Status(message) {
  upscale2StatusText.textContent = message;
}

function setShoeSwapStatus(message) {
  shoeSwapStatusText.textContent = message;
}

function setOutpaintStatus(message) {
  outpaintStatusText.textContent = message;
}

function setOutpaint2Status(message) {
  outpaint2StatusText.textContent = message;
}

function saveImageSettings() {
  localStorage.setItem(
    IMAGE_STORAGE_KEY,
    JSON.stringify({
      model: imageModelInput.value,
      size: getOutputSize(),
      resolution: imageResolutionInput.value,
      count: imageCountInput.value,
      remember: rememberImageInput.checked,
      midjourney: readMidjourneyOptions(imageMidjourneyOptions),
    }),
  );
}

function loadImageSettings() {
  const settings = getSavedSettings(IMAGE_STORAGE_KEY);
  if (!settings) return;
  imageSizeInput.value = settings.size || imageSizeInput.value;
  imageResolutionInput.value = settings.resolution || imageResolutionInput.value;
  imageCountInput.value = settings.count || imageCountInput.value;
  rememberImageInput.checked = Boolean(settings.remember);
  syncMidjourneyControls(imageMidjourneyOptions, imageModelInput.value, settings.midjourney || {});
  updateImageResolutionAvailability();
}

function refreshImageSizeOptions(preferred = imageSizeInput.value) {
  if (!imageSizeInput) return;
  const model = imageModelInput.value;
  const presets = getImageSizePresets(model);
  const preferredValue = normalizeImageSizeChoiceForModel(preferred, model);
  imageSizeInput.innerHTML = "";
  presets.forEach((item) => {
    addImageSizeOption(imageSizeInput, item.value, item.label);
  });
  if (!presets.some((item) => item.value === preferredValue) && isOpenAIImageCustomSize(preferredValue, model)) {
    addImageSizeOption(imageSizeInput, preferredValue, "\u81ea\u5b9a\u4e49 " + preferredValue);
  }
  imageSizeInput.value = presets.some((item) => item.value === preferredValue) ? preferredValue : presets[0]?.value || "1024x1024";
  if (isOpenAIImageCustomSize(preferredValue, model)) imageSizeInput.value = preferredValue;
  imageSizeInput.dataset.previousSize = imageSizeInput.value === "custom" ? (normalizeOpenAIImageCustomSize(preferred, model) || "1024x1024") : imageSizeInput.value;
  const resolutionVisible = supportsSeparateImageResolution(model);
  refreshImageResolutionOptions(model, imageResolutionInput.value, imageSizeInput.value);
  imageResolutionInput.hidden = !resolutionVisible;
  imageResolutionInput.disabled = !resolutionVisible;
  imageResolutionInput.closest(".size-row")?.classList.toggle("resolution-hidden", !resolutionVisible);
  syncMainCustomImageSizeField(preferred);
}

function getImageSizePresets(model) {
  if (isMidjourneyModel(model)) return MIDJOURNEY_IMAGE_RATIOS;
  if (isGptImage2LikeModel(model)) return GPT_IMAGE2_IMAGE_RATIOS;
  if (getImageModelPlatform(model) !== "google") {
    const allowed = getAllowedImageResolutionLevels(model);
    return IMAGE_SIZE_PRESETS.openai.filter((item) => !item.level || allowed.includes(item.level));
  }
  return getImageModelFamily(model) === "gemini-3.1-flash-image"
    ? GOOGLE_IMAGE_RATIOS_FLASH_31
    : GOOGLE_IMAGE_RATIOS_STANDARD;
}

function addImageSizeOption(select, value, label) {
  if (!select || Array.from(select.options || []).some((option) => option.value === value)) return;
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  select.append(option);
}

function getMainCustomImageSizeField() {
  let field = document.querySelector("#imageCustomSizeField");
  if (field) return field;
  const sizeRow = imageSizeInput?.closest(".size-row");
  if (!sizeRow) return null;
  field = document.createElement("div");
  field.id = "imageCustomSizeField";
  field.className = "image-custom-size-field";
  field.hidden = true;
  const label = document.createElement("span");
  label.className = "custom-size-title";
  label.textContent = "自定义尺寸";
  const widthBox = createCustomSizeNumberBox("W", "width");
  const link = document.createElement("span");
  link.className = "custom-size-link";
  link.textContent = "↔";
  const heightBox = createCustomSizeNumberBox("H", "height");
  const hint = document.createElement("small");
  hint.textContent = getCustomSizeHint(imageModelInput.value);
  [widthBox, heightBox].forEach((box) => {
    const input = box.querySelector("input");
    input.addEventListener("input", () => {
      validateMainCustomImageSize();
      if (rememberImageInput.checked) saveImageSettings();
      updateGenerateButtonLabel();
    });
    input.addEventListener("blur", validateMainCustomImageSize);
  });
  field.append(label, widthBox, link, heightBox, hint);
  sizeRow.insertAdjacentElement("afterend", field);
  return field;
}

function syncMainCustomImageSizeField(preferred = "") {
  const field = getMainCustomImageSizeField();
  if (!field) return;
  const isCustom = imageSizeInput.value === "custom";
  field.hidden = !isCustom;
  field.querySelector("small").textContent = getCustomSizeHint(imageModelInput.value);
  if (isCustom) setCustomSizeFieldValue(field, normalizeOpenAIImageCustomSize(preferred, imageModelInput.value) || imageSizeInput.dataset.previousSize || "1024x1024", false, imageModelInput.value);
  validateMainCustomImageSize();
}

function validateMainCustomImageSize() {
  const field = getMainCustomImageSizeField();
  if (!field || field.hidden) return true;
  const normalized = getCustomSizeFieldValue(field, imageModelInput.value);
  field.classList.toggle("is-invalid", !normalized);
  field.querySelector("small").textContent = normalized ? getCustomSizeHint(imageModelInput.value) : getCustomSizeError(imageModelInput.value);
  if (normalized) imageSizeInput.dataset.previousSize = normalized;
  return Boolean(normalized);
}

function getMainCustomImageSizeValue() {
  const field = getMainCustomImageSizeField();
  if (!field || field.hidden) return "";
  return getCustomSizeFieldValue(field, imageModelInput.value);
}

function createCanvasCustomSizeField(node, previousSize = "") {
  const field = document.createElement("div");
  field.className = "canvas-custom-size-field";
  field.hidden = true;
  const label = document.createElement("span");
  label.className = "custom-size-title";
  label.textContent = "自定义尺寸";
  const widthBox = createCustomSizeNumberBox("W", "width");
  const link = document.createElement("span");
  link.className = "custom-size-link";
  link.textContent = "↔";
  const heightBox = createCustomSizeNumberBox("H", "height");
  const hint = document.createElement("small");
  hint.textContent = getCustomSizeHint(node?.querySelector(".canvas-node-model")?.value || node?.dataset.canvasModel || imageModelInput.value);
  [widthBox, heightBox].forEach((box) => {
    const input = box.querySelector("input");
    input.addEventListener("input", () => applyCanvasCustomImageSize(node));
    input.addEventListener("blur", () => applyCanvasCustomImageSize(node));
  });
  field.append(label, widthBox, link, heightBox, hint);
  setCustomSizeFieldValue(field, normalizeOpenAIImageCustomSize(previousSize, node?.dataset.canvasModel || imageModelInput.value) || "", false, node?.dataset.canvasModel || imageModelInput.value);
  return field;
}

function syncCanvasCustomSizeField(node) {
  const size = node?.querySelector(".canvas-node-size");
  const field = node?.querySelector(".canvas-custom-size-field");
  if (!size || !field) return;
  const isCustom = size.value === "custom";
  field.hidden = !isCustom;
  node.classList.toggle("has-canvas-custom-size", isCustom);
  const model = node.querySelector(".canvas-node-model")?.value || node.dataset.canvasModel || imageModelInput.value;
  field.querySelector("small").textContent = getCustomSizeHint(model);
  if (!isCustom) {
    field.classList.remove("is-invalid");
    size.dataset.previousSize = size.value;
    node.dataset.canvasSize = size.value;
    return;
  }
  setCustomSizeFieldValue(field, normalizeOpenAIImageCustomSize(node.dataset.canvasSize, model) || size.dataset.previousSize || "1024x1024", false, model);
  applyCanvasCustomImageSize(node);
  const input = field.querySelector('input[data-size-axis="width"]');
  input?.focus();
  input?.select();
}

function applyCanvasCustomImageSize(node) {
  const field = node?.querySelector(".canvas-custom-size-field");
  if (!field || field.hidden) return true;
  const model = node.querySelector(".canvas-node-model")?.value || node.dataset.canvasModel || imageModelInput.value;
  const normalized = getCustomSizeFieldValue(field, model);
  field.classList.toggle("is-invalid", !normalized);
  field.querySelector("small").textContent = normalized ? getCustomSizeHint(model) : getCustomSizeError(model);
  if (normalized) {
    node.dataset.canvasSize = normalized;
    const size = node.querySelector(".canvas-node-size");
    if (size) size.dataset.previousSize = normalized;
    const resolution = node.querySelector(".canvas-node-resolution");
    if (resolution) {
      fillCanvasNodeResolutionSelect(resolution, resolution.value || node.dataset.canvasResolution, model, normalized);
      node.dataset.canvasResolution = resolution.value;
      syncCanvasNodeResolutionState(node);
    }
    scheduleCanvasSave();
  }
  return Boolean(normalized);
}

function createCustomSizeNumberBox(labelText, axis) {
  const box = document.createElement("label");
  box.className = "custom-size-number";
  const label = document.createElement("span");
  label.textContent = labelText;
  const input = document.createElement("input");
  input.type = "number";
  input.inputMode = "numeric";
  input.step = "16";
  input.min = "16";
  input.max = "3840";
  input.dataset.sizeAxis = axis;
  input.autocomplete = "off";
  box.append(label, input);
  return box;
}

function setCustomSizeFieldValue(field, value, overwrite = true, model = imageModelInput.value) {
  const normalized = normalizeOpenAIImageCustomSize(value, model) || String(value || "");
  const match = normalized.match(/^(\d{2,5})x(\d{2,5})$/);
  if (!match) return;
  const widthInput = field.querySelector('input[data-size-axis="width"]');
  const heightInput = field.querySelector('input[data-size-axis="height"]');
  if (widthInput && (overwrite || !widthInput.value)) widthInput.value = match[1];
  if (heightInput && (overwrite || !heightInput.value)) heightInput.value = match[2];
}

function getCustomSizeFieldValue(field, model = imageModelInput.value) {
  const width = Number(field?.querySelector('input[data-size-axis="width"]')?.value || 0);
  const height = Number(field?.querySelector('input[data-size-axis="height"]')?.value || 0);
  return isValidOpenAIImageSize(width, height, model) ? `${width}x${height}` : "";
}

function getCustomSizeHint() {
  return "最大边长 3840，16 的倍数，比例 <= 3:1，像素 655360~8294400";
}

function getCustomSizeError() {
  return "需满足：最大边长 3840、16 的倍数、比例 <= 3:1、像素 655360~8294400";
}

function normalizeOpenAIImageCustomSize(value, model = imageModelInput.value) {
  const match = String(value || "").trim().toLowerCase().match(/^(\d{2,5})\s*x\s*(\d{2,5})$/);
  if (!match) return "";
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!isValidOpenAIImageSize(width, height, model)) return "";
  return `${width}x${height}`;
}

function isOpenAIImageCustomSize(value, model = imageModelInput.value) {
  if (getImageModelPlatform(model) === "google") return false;
  return Boolean(normalizeOpenAIImageCustomSize(value, model));
}

function isValidOpenAIImageSize(width, height, model = imageModelInput.value) {
  if (!Number.isInteger(width) || !Number.isInteger(height)) return false;
  if (width <= 0 || height <= 0 || width > 3840 || height > 3840) return false;
  if (width % 16 !== 0 || height % 16 !== 0) return false;
  if (Math.max(width, height) / Math.min(width, height) > 3) return false;
  const pixels = width * height;
  return pixels >= 655360 && pixels <= 8294400;
}

function normalizeImagePlatform(value, model = "") {
  if (isMidjourneyModel(model)) return "midjourney";
  const platform = String(value || "").toLowerCase();
  if (["openai", "google"].includes(platform)) return platform;
  return inferImagePlatform(model);
}

function inferImagePlatform(model = "") {
  if (isMidjourneyModel(model)) return "midjourney";
  const value = String(model || "").toLowerCase();
  return value.includes("nano-banana") || value.includes("gemini") ? "google" : "openai";
}

function isMidjourneyModel(model = "") {
  return String(model || "").trim().toLowerCase() === "midjourney";
}

function getMidjourneyField(container, field) {
  return container?.querySelector("[data-midjourney-field=\"" + field + "\"]") || null;
}

function readMidjourneyOptions(container) {
  const mode = getMidjourneyField(container, "mode")?.value === "niji" ? "niji" : "standard";
  const version = getMidjourneyField(container, "version")?.value || MIDJOURNEY_DEFAULT_OPTIONS.version;
  const quality = getMidjourneyField(container, "quality")?.value === "hd" ? "hd" : "sd";
  const rawStylize = Number(getMidjourneyField(container, "stylize")?.value || MIDJOURNEY_DEFAULT_OPTIONS.stylize);
  return {
    version,
    mode,
    niji: mode === "niji",
    speed: getMidjourneyField(container, "speed")?.value || MIDJOURNEY_DEFAULT_OPTIONS.speed,
    quality,
    hd: supportsMidjourneyHd(version, mode) && quality === "hd",
    style: getMidjourneyField(container, "style")?.value || MIDJOURNEY_DEFAULT_OPTIONS.style,
    stylize: Number.isInteger(rawStylize) ? Math.max(0, Math.min(1000, rawStylize)) : MIDJOURNEY_DEFAULT_OPTIONS.stylize,
  };
}

function supportsMidjourneyHd(version, mode = "standard") {
  return mode === "standard" && ["8.2", "8.1"].includes(String(version || ""));
}

function getMidjourneyPayload(container) {
  const options = readMidjourneyOptions(container);
  const payload = {
    version: options.version,
    niji: options.mode === "niji",
    speed: options.speed,
    style: options.style,
    stylize: options.stylize,
  };
  if (options.hd) payload.hd = true;
  return payload;
}
function syncMidjourneyControls(container, model, preferred = {}) {
  if (!container) return;
  const enabled = isMidjourneyModel(model);
  container.hidden = !enabled;
  container.querySelectorAll("select, input").forEach((input) => { input.disabled = !enabled; });
  if (!enabled) return;
  const current = readMidjourneyOptions(container);
  const preferredMode = preferred.mode || (typeof preferred.niji === "boolean" ? (preferred.niji ? "niji" : "standard") : "");
  const mode = preferredMode || current.mode || MIDJOURNEY_DEFAULT_OPTIONS.mode;
  const versions = mode === "niji" ? MIDJOURNEY_NIJI_VERSIONS : MIDJOURNEY_STANDARD_VERSIONS;
  const versionInput = getMidjourneyField(container, "version");
  const preferredVersion = String(preferred.version || current.version || "");
  if (versionInput) {
    versionInput.innerHTML = "";
    versions.forEach((version) => {
      const option = document.createElement("option");
      option.value = version;
      option.textContent = "V" + version;
      versionInput.append(option);
    });
    versionInput.value = versions.includes(preferredVersion) ? preferredVersion : "7";
  }
  const modeInput = getMidjourneyField(container, "mode");
  if (modeInput) modeInput.value = mode;
  const speedInput = getMidjourneyField(container, "speed");
  if (speedInput) speedInput.value = ["relax", "fast", "turbo"].includes(preferred.speed || current.speed) ? (preferred.speed || current.speed) : "fast";
  const qualityInput = getMidjourneyField(container, "quality");
  const qualityField = qualityInput?.closest("label");
  const qualityAvailable = supportsMidjourneyHd(versionInput?.value, mode);
  const preferredQuality = preferred.quality || (typeof preferred.hd === "boolean" ? (preferred.hd ? "hd" : "sd") : current.quality);
  if (qualityField) qualityField.hidden = !qualityAvailable;
  if (qualityInput) {
    qualityInput.disabled = !qualityAvailable;
    qualityInput.value = qualityAvailable && preferredQuality === "hd" ? "hd" : "sd";
  }
  const styleInput = getMidjourneyField(container, "style");
  if (styleInput) styleInput.value = ["raw", "standard"].includes(preferred.style || current.style) ? (preferred.style || current.style) : "raw";
  const stylizeInput = getMidjourneyField(container, "stylize");
  if (stylizeInput) stylizeInput.value = String(Number.isInteger(Number(preferred.stylize ?? current.stylize)) ? Math.max(0, Math.min(1000, Number(preferred.stylize ?? current.stylize))) : 100);
}
function isGptImage2LikeModel(model) {
  const value = String(model || "").toLowerCase();
  const label = String(DYNAMIC_MODEL_DISPLAY_NAMES[model] || MODEL_DISPLAY_NAMES[model] || "").toLowerCase();
  const family = String(IMAGE_MODEL_FAMILIES[model] || "").toLowerCase();
  return value.includes("gpt-image-2") || label.includes("gpt-image-2") || family.includes("gpt-image-2");
}
function supportsSeparateImageResolution(model) {
  return getImageModelPlatform(model) === "google" || isGptImage2LikeModel(model);
}
function normalizeImageSizeChoiceForModel(value, model = imageModelInput.value) {
  const text = String(value || "").trim().toLowerCase();
  if (!isGptImage2LikeModel(model)) return value;
  if (!text || text === "auto" || text === "custom") return text || value;
  if (getCanvasSizeRatio(text) && !/^\d{2,5}x\d{2,5}$/.test(text)) return text;
  const pixels = text.match(/^(\d{2,5})x(\d{2,5})$/);
  if (!pixels) return value;
  return closestImageAspectRatio(Number(pixels[1]), Number(pixels[2]), GPT_IMAGE2_IMAGE_RATIOS.map((item) => item.value));
}
function closestImageAspectRatio(width, height, candidates) {
  const ratio = width / Math.max(1, height);
  let best = "1:1";
  let bestDiff = Infinity;
  for (const candidate of candidates) {
    if (candidate === "auto" || candidate === "custom") continue;
    const item = getCanvasSizeRatio(candidate);
    if (!item) continue;
    const diff = Math.abs(ratio - (item.width / item.height));
    if (diff < bestDiff) {
      best = candidate;
      bestDiff = diff;
    }
  }
  return best;
}
function getGptImage2OutputSize(size, resolution) {
  const text = String(size || "auto").trim().toLowerCase();
  if (!text || text === "auto") return "auto";
  const normalized = normalizeOpenAIImageCustomSize(text, "gpt-image-2");
  if (normalized) return normalized;
  return getScaledImageSizeByLongEdge(text, resolution);
}
function getImageModelPlatform(model) {
  return normalizeImagePlatform(IMAGE_MODEL_PLATFORMS[model], model);
}

function normalizeImageModelFamily(value, model = "") {
  if (isMidjourneyModel(model)) return "midjourney";
  const raw = String(value || model || "").toLowerCase();
  if (raw.includes("gpt-image-2")) return "gpt-image-2";
  if (raw.includes("3.1-flash-lite") || raw.includes("flash-lite-image")) return "gemini-3.1-flash-lite-image";
  if (raw.includes("3.1") || raw.includes("nano-banana-2")) return "gemini-3.1-flash-image";
  if (raw.includes("3-pro") || raw.includes("3 pro") || raw.includes("nano-banana-pro")) return "gemini-3-pro-image";
  if (raw.includes("2.5") || raw === "nano-banana") return "gemini-2.5-flash-image";
  return getImageModelPlatform(model) === "google" ? "gemini-3.1-flash-image" : "openai-image";
}

function getImageModelFamily(model) {
  return normalizeImageModelFamily(IMAGE_MODEL_FAMILIES[model], model);
}

function getCurrentImageSizeChoice() {
  return imageSizeInput.value === "custom"
    ? getMainCustomImageSizeValue() || imageSizeInput.dataset.previousSize || "1024x1024"
    : imageSizeInput.value;
}

function getOutputSize() {
  const model = imageModelInput.value;
  const size = getCurrentImageSizeChoice();
  if (isMidjourneyModel(model)) return size;
  const exactSize = getResolutionChoiceExactSize(imageResolutionInput.value);
  if (exactSize) return exactSize;
  if (isGptImage2LikeModel(model)) {
    const compatibility = ImageResolutionRules.getCompatibility({
      ...getImageResolutionChoiceContext(model, size),
      resolution: imageResolutionInput.value,
    });
    return compatibility.supported ? compatibility.requestedSize : "";
  }
  if (size === "auto") return "auto";
  if (getImageModelPlatform(model) === "google") return size;
  return size;
}

function getOutputQuality() {
  const model = imageModelInput.value;
  if (!isGptImage2LikeModel(model)) return "auto";
  const size = getCurrentImageSizeChoice();
  const level = getResolutionChoiceLevel(imageResolutionInput.value);
  const rank = getImageResolutionRank(level);
  if (rank >= 4) return "high";
  if (rank >= 2) return "medium";
  return "auto";
}

function getOutputResolution() {
  if (!supportsSeparateImageResolution(imageModelInput.value)) return "auto";
  return formatImageResolutionApiValue(getResolutionChoiceLevel(imageResolutionInput.value));
}

function refreshImageResolutionOptions(model, preferred = imageResolutionInput?.value, size = imageSizeInput?.value) {
  if (!imageResolutionInput) return;
  const select = imageResolutionInput;
  const context = getImageResolutionChoiceContext(model, size);
  const choices = ImageResolutionRules.getResolutionChoices(context);
  select.innerHTML = "";
  choices.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    option.disabled = Boolean(item.disabled);
    option.dataset.reason = item.reason || "";
    option.dataset.level = item.level || getResolutionChoiceLevel(item.value);
    select.append(option);
  });
  const picked = pickImageResolutionChoiceValue(
    choices,
    preferred,
    context,
    select.dataset.previousConcreteResolution,
  );
  select.value = picked.value;
  select.dataset.previousConcreteResolution = picked.remembered;
}

function getMainImageResolutionCompatibility() {
  if (!imageResolutionInput || !supportsSeparateImageResolution(imageModelInput.value)) {
    return { supported: true, reason: "" };
  }
  return ImageResolutionRules.getCompatibility({
    ...getImageResolutionChoiceContext(imageModelInput.value, getCurrentImageSizeChoice()),
    resolution: imageResolutionInput.value,
  });
}

function syncMainImageResolutionState() {
  if (!imageResolutionInput) return { supported: true, reason: "" };
  const row = imageResolutionInput.closest(".size-row");
  let help = document.querySelector("#imageResolutionHelp");
  if (!help && row) {
    help = document.createElement("small");
    help.id = "imageResolutionHelp";
    help.className = "image-resolution-help";
    row.after(help);
  }
  const compatibility = getMainImageResolutionCompatibility();
  const hasUnsupported = Array.from(imageResolutionInput.options || []).some((option) => option.disabled);
  if (help) {
    help.hidden = compatibility.supported && !hasUnsupported;
    help.textContent = compatibility.supported
      ? getDisabledResolutionSummary(imageResolutionInput)
      : compatibility.reason;
    help.classList.toggle("is-error", !compatibility.supported);
  }
  generateButton.disabled = !compatibility.supported;
  return compatibility;
}

function updateImageResolutionAvailability() {
  if (!imageResolutionInput) return;
  syncMainImageResolutionState();
}

function normalizeImageResolutionValues(values) {
  const items = Array.isArray(values) ? values : ["1", "2", "4"];
  const normalized = sortImageResolutionValues([...new Set(items.map(normalizeImageResolutionValue).filter(Boolean))]);
  return normalized.length ? normalized : ["1"];
}

function normalizeImageResolutionValue(item) {
  const value = String(item || "").toLowerCase().replace(/px$/, "").replace(/k$/, "");
  if (value === "0.5" || value === "512") return "512";
  if (["1", "2", "4"].includes(value)) return value;
  return "";
}

function sortImageResolutionValues(values) {
  const order = ["512", "1", "2", "4"];
  return [...new Set(values.map(normalizeImageResolutionValue).filter(Boolean))]
    .sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

function formatImageResolutionLabel(value) {
  const normalized = normalizeImageResolutionValue(value) || "1";
  return normalized === "512" ? "512" : `${normalized}K`;
}

function formatImageResolutionApiValue(value) {
  if (ImageResolutionRules.parseResolutionChoice(value).type === "auto") return "auto";
  const normalized = normalizeImageResolutionValue(value) || "1";
  return normalized === "512" ? "512" : `${normalized}k`;
}

function getImageResolutionRank(value) {
  const normalized = normalizeImageResolutionValue(value) || "1";
  if (normalized === "512") return 0.5;
  return Number(normalized) || 1;
}

function getAllowedImageResolutionLevels(model, modelConfig = null) {
  const key = String(model || "").toLowerCase();
  if (IMAGE_MODEL_RESOLUTIONS[model]) return IMAGE_MODEL_RESOLUTIONS[model];
  return getSupportedImageResolutionLevels(model, modelConfig);
}

function getAllowedImageResolutionLevelsForSize(model, size = "auto", modelConfig = null) {
  return getAllowedImageResolutionLevels(model, modelConfig);
}

function getSupportedImageResolutionLevels(model, modelConfig = null) {
  if (isMidjourneyModel(model)) return [];
  const key = String(model || "").toLowerCase();
  const platform = modelConfig?.platform ? normalizeImagePlatform(modelConfig.platform, model) : getImageModelPlatform(model);
  if (platform === "google") {
    const family = modelConfig?.family ? normalizeImageModelFamily(modelConfig.family, model) : getImageModelFamily(model);
    if (family === "gemini-3.1-flash-image") return ["512", "1", "2", "4"];
    if (family === "gemini-2.5-flash-image" || family === "gemini-3.1-flash-lite-image") return ["1"];
    return ["1", "2", "4"];
  }
  return ["1", "2", "4"];
}

function pickClosestAllowedImageResolution(allowed, preferred) {
  const values = (Array.isArray(allowed) ? allowed : []).map(normalizeImageResolutionValue).filter(Boolean);
  if (!values.length) return "1";
  const value = normalizeImageResolutionValue(preferred) || values[0];
  if (values.includes(value)) return value;
  const rank = getImageResolutionRank(value);
  const sorted = [...values].sort((a, b) => getImageResolutionRank(b) - getImageResolutionRank(a));
  return sorted.find((item) => getImageResolutionRank(item) <= rank) || sorted[sorted.length - 1] || values[0];
}

function getEffectiveImageResolutionLevel(model, resolution, size = null) {
  const parsed = ImageResolutionRules.parseResolutionChoice(resolution);
  if (parsed.type === "auto") return "auto";
  if (parsed.type === "exact") return parsed.level;
  const allowed = size === null ? getAllowedImageResolutionLevels(model) : getAllowedImageResolutionLevelsForSize(model, size);
  return pickClosestAllowedImageResolution(allowed, resolution);
}

function getSavedSettings(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}
