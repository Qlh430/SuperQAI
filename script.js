const CHAT_API_URL = "/api/chat";
const CHAT_MODELS_API_URL = "/api/models";
const IMAGE_API_URL = "/api/images";
const IMAGE_MODELS_API_URL = "/api/image-models";
const IMAGE_UPLOAD_API_URL = "/api/upload-image";
const UPSCALE_API_URL = "/api/upscale";
const UPSCALE2_API_URL = "/api/upscale2";
const SHOE_SWAP_API_URL = "/api/shoe-swap";
const IMAGE_CHUNK_UPLOAD_API_URL = "/api/upload-image/chunk";
const UPSCALE_STATUS_API_URL = "/api/upscale/status";
const CHAT_HISTORY_API_URL = "/api/history/chat";
const IMAGE_HISTORY_API_URL = "/api/history/images";
const CANVAS_BOARDS_API_URL = "/api/canvas/boards";
const LEGACY_CHAT_HISTORY_KEY = "ai-chat-history";
const LEGACY_IMAGE_HISTORY_KEY = "ai-image-history";
const HISTORY_MIGRATION_KEY = "ai-shared-history-migrated";
const THEME_STORAGE_KEY = "ai-theme-mode";

ensureCanvasMarkup();

const tabs = document.querySelectorAll(".nav-item");
const views = document.querySelectorAll("[data-view]");
const themeOptions = document.querySelectorAll("[data-theme-choice]");

const chatModelInput = document.querySelector("#chatModel");
const messagesEl = document.querySelector("#messages");
const chatPromptInput = document.querySelector("#chatPrompt");
const chatStatusText = document.querySelector("#chatStatus");
const sendButton = document.querySelector("#sendButton");
const attachButton = document.querySelector("#attachButton");
const chatFileInput = document.querySelector("#chatFileInput");
const chatAttachmentsEl = document.querySelector("#chatAttachments");
const upscaleForm = document.querySelector("#upscaleForm");
const upscaleDrop = document.querySelector("#upscaleDrop");
const upscaleFileInput = document.querySelector("#upscaleFileInput");
const upscaleInputPreview = document.querySelector("#upscaleInputPreview");
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

const imageModelInput = document.querySelector("#imageModel");
const imageSizeInput = document.querySelector("#imageSize");
const imageResolutionInput = document.querySelector("#imageResolution");
const imageCountInput = document.querySelector("#imageCount");
const rememberImageInput = document.querySelector("#rememberImage");
const imagePromptInput = document.querySelector("#imagePrompt");
const imageStage = document.querySelector("#imageStage");
const imageStatusText = document.querySelector("#imageStatus");
const generateButton = document.querySelector("#generateButton");
const referenceFileInput = document.querySelector("#referenceFileInput");
const referenceSlots = document.querySelectorAll(".reference-slot");
const imageHistoryEl = document.querySelector("#imageHistory");
const chatHistoryEl = document.querySelector("#chatHistory");
const lightbox = document.querySelector("#lightbox");
const lightboxImage = document.querySelector("#lightboxImage");
const lightboxDownload = document.querySelector("#lightboxDownload");
const lightboxClose = document.querySelector("#lightboxClose");

const IMAGE_STORAGE_KEY = "ai-image-preferences";
const MODEL_DISPLAY_NAMES = {
  "gemini-3.1-flash-image-preview": "nano-banana-2",
  "nano-banana-pro": "nano-banana-pro",
};
const IMAGE_MODEL_PRICES = {
  "gemini-3.1-flash-image-preview": "0.27",
  "nano-banana-pro": "0.27",
  "gpt-image-2": "0.054",
  "gpt-image-1": "0.081",
};
const history = [];
const chatAttachments = [];
const previewState = {
  scale: 1,
  x: 0,
  y: 0,
  dragging: false,
  startX: 0,
  startY: 0,
  originX: 0,
  originY: 0,
};
let currentConversationId = createId();
const referenceImages = [null, null, null];
let activeReferenceIndex = 0;
let upscaleImage = null;
let upscale2Image = null;
let shoeSwapPersonImage = null;
let shoeSwapShoeImage = null;
let upscaleProgressTimer = null;
let upscale2ProgressTimer = null;
let shoeSwapProgressTimer = null;
const canvasState = {
  scale: 1,
  x: 0,
  y: 0,
  nextNode: 1,
  activeNode: null,
  menuPoint: null,
  pendingConnection: null,
  tempConnection: null,
  connectMenu: null,
  connections: [],
  clipboard: null,
  selectedIds: new Set(),
  selectionFrameVisible: false,
  boards: [],
  activeBoardId: null,
  activeBoardTitle: "未命名画布",
  activeBoardCreatedAt: null,
  saveTimer: null,
  autoSaveTimer: null,
  hasUnsavedChanges: false,
  isRestoring: false,
  draggedGalleryImage: null,
  galleryDragGhost: null,
};

initializeTheme();
loadImageSettings();
initializeChatLayoutCopy();
initializeCanvasBoard();
loadChatModels();
loadImageModels();
initializeSharedHistory();

tabs.forEach((tab) => {
  tab.addEventListener("click", () => setActiveTool(tab.dataset.tool));
});

themeOptions.forEach((button) => {
  button.addEventListener("click", () => setThemeMode(button.dataset.themeChoice || "system"));
});

document.querySelector("#clearChat").addEventListener("click", () => {
  document.querySelector(".chat-history-panel")?.classList.toggle("is-open");
});

document.querySelector("#newChat").addEventListener("click", () => {
  currentConversationId = createId();
  resetCurrentChat();
  setChatStatus("已开始新对话。");
});

document.querySelector("#clearImages").addEventListener("click", () => {
  imageStage.innerHTML = '<div class="empty-state"><span>图片预览</span><p>生成结果会显示在这里，并自动保存到本地 output 文件夹。</p></div>';
  setImageStatus("已清空图片结果。");
});

attachButton.addEventListener("click", () => chatFileInput.click());

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

document.querySelector("#clearImageHistory").addEventListener("click", () => {
  clearServerHistory(IMAGE_HISTORY_API_URL);
  renderImageHistory();
});

document.querySelector("#clearChatHistory").addEventListener("click", () => {
  clearServerHistory(CHAT_HISTORY_API_URL);
  renderChatHistory();
});

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

lightboxClose.addEventListener("click", closePreview);
lightbox.addEventListener("click", (event) => {
  if (event.target === lightbox) closePreview();
});
lightbox.addEventListener("wheel", handlePreviewWheel, { passive: false });
lightboxImage.addEventListener("pointerdown", startPreviewPan);
lightboxImage.addEventListener("dblclick", () => {
  if (previewState.scale === 1) {
    previewState.scale = 2;
  } else {
    previewState.scale = 1;
    previewState.x = 0;
    previewState.y = 0;
  }
  applyPreviewTransform();
});
lightboxDownload.addEventListener("click", (event) => {
  event.preventDefault();
  downloadAsset(lightboxDownload.href, "preview.png", event.currentTarget);
});

document.querySelector("#imageForm").addEventListener("input", () => {
  if (rememberImageInput.checked) saveImageSettings();
  updateGenerateButtonLabel();
});

imageModelInput.addEventListener("change", () => {
  if (rememberImageInput.checked) saveImageSettings();
  updateGenerateButtonLabel();
});

rememberImageInput.addEventListener("change", () => {
  if (rememberImageInput.checked) saveImageSettings();
  else localStorage.removeItem(IMAGE_STORAGE_KEY);
});

document.querySelector("#chatForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const prompt = chatPromptInput.value.trim();
  const model = chatModelInput.value.trim();

  if (!model || !prompt) {
    setChatStatus("请先选择模型并输入内容。");
    return;
  }

  const userContent = buildUserMessageContent(prompt);
  const displayText = buildUserDisplayText(prompt);
  addMessage("user", displayText);
  history.push({ role: "user", content: userContent, displayContent: displayText });
  chatPromptInput.value = "";
  clearChatAttachments();
  setChatLoading(true);

  try {
    const response = await fetch(CHAT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: history.map(({ role, content }) => ({ role, content })),
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || data.message || data.error || `${response.status} ${response.statusText}`);

    const content = data.choices?.[0]?.message?.content || data.output_text || "";
    if (!content) throw new Error("接口返回成功，但没有找到可展示的文本内容。");

    const returnedModel = data.model || model;
    history.push({ role: "assistant", content });
    addMessage("assistant", content);
    await saveConversationHistory(returnedModel);
    setChatStatus(`请求完成 · 模型：${returnedModel}`);
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

  setImageLoading(true);

  try {
    const response = await fetch(IMAGE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        size: getOutputSize(),
        quality: getOutputQuality(),
        n: Number(imageCountInput.value),
        reference_images: referenceImages.filter(Boolean),
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || data.message || data.error || `${response.status} ${response.statusText}`);

    const images = extractImages(data);
    if (!images.length) throw new Error("接口返回成功，但没有找到图片链接或 base64 图片。");

    renderImages(images, prompt);
    const returnedModel = data.model || model;
    await saveImageHistory(prompt, images, returnedModel);
    setImageStatus(`生成完成 · 模型：${getModelDisplayName(returnedModel)}`);
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
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || data.message || `${response.status} ${response.statusText}`);
    if (!data.task_id) throw new Error("后端没有返回放大任务 ID。");

    const task = await waitForUpscaleTask(data.task_id);
    const images = (task.images || []).map((url) => ({ src: url, savedUrl: url })).filter((item) => item.src);
    if (!images.length) throw new Error("ComfyUI 没有返回放大图片。");

    renderUpscaleImages(images, upscaleImage.name, upscaleImage.url);
    await saveImageHistory(`高清放大：${upscaleImage.name}`, images, "TTP / ComfyUI");
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
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || data.message || `${response.status} ${response.statusText}`);
    if (!data.task_id) throw new Error("后端没有返回放大任务 ID。");

    const task = await waitForUpscaleTask(data.task_id, setUpscale2Progress);
    const images = (task.images || []).map((url) => ({ src: url, savedUrl: url })).filter((item) => item.src);
    if (!images.length) throw new Error("ComfyUI 没有返回放大图片。");

    renderUpscale2Images(images, upscale2Image.name, upscale2Image.url);
    await saveImageHistory(`高清放大2：${upscale2Image.name}`, images, "SeedVR2 / ComfyUI");
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
    await saveImageHistory(`换鞋：${shoeSwapPersonImage.name}`, images, "换鞋 / ComfyUI");
    setShoeSwapProgress(100);
    setShoeSwapStatus(`换鞋完成 · ${task.comfy || "ComfyUI"}`);
  } catch (error) {
    setShoeSwapProgress(0);
    setShoeSwapStatus(`换鞋失败：${error.message}`);
  } finally {
    setShoeSwapLoading(false);
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

async function loadChatModels() {
  try {
    const response = await fetch(CHAT_MODELS_API_URL);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "对话模型读取失败。");
    fillSelect(chatModelInput, data.models);
    chatModelInput.value = data.defaultModel;
    setChatStatus("准备就绪");
  } catch (error) {
    fillSelect(chatModelInput, ["模型列表读取失败"]);
    setChatStatus(error.message);
  }
}

async function loadImageModels() {
  const saved = getSavedSettings(IMAGE_STORAGE_KEY);
  try {
    const response = await fetch(IMAGE_MODELS_API_URL);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "图片模型读取失败。");
    fillSelect(imageModelInput, data.models);
    const preferredModel = saved?.model || data.defaultModel;
    imageModelInput.value = data.models.includes(preferredModel) ? preferredModel : data.defaultModel;
    updateGenerateButtonLabel();
    setImageStatus("准备就绪");
  } catch (error) {
    fillSelect(imageModelInput, ["模型列表读取失败"]);
    updateGenerateButtonLabel();
    setImageStatus(error.message);
  }
}

function setActiveTool(tool) {
  tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tool === tool));
  views.forEach((view) => view.classList.toggle("active", view.dataset.view === tool));
  if (tool === "canvas") scheduleCanvasConnectionRender();
}

function initializeTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY) || "system";
  setThemeMode(saved, false);
  const systemQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
  systemQuery?.addEventListener?.("change", () => {
    if ((localStorage.getItem(THEME_STORAGE_KEY) || "system") === "system") applyTheme("system");
  });
}

function setThemeMode(mode, persist = true) {
  const next = ["light", "dark", "system"].includes(mode) ? mode : "system";
  if (persist) localStorage.setItem(THEME_STORAGE_KEY, next);
  applyTheme(next);
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
  canvasTab.innerHTML = '<span class="nav-icon">◇</span><span>无限画布</span>';

  const chatTab = nav.querySelector('[data-tool="chat"]');
  nav.insertBefore(canvasTab, chatTab || null);

  const canvasView = document.createElement("section");
  canvasView.className = "tool-view";
  canvasView.id = "canvasView";
  canvasView.dataset.view = "canvas";
  canvasView.innerHTML = `
    <section class="canvas-workspace">
      <div class="header-actions canvas-actions">
        <button id="canvasHistoryButton" class="text-action" type="button">历史</button>
        <button id="canvasNew" class="text-action primary-dark" type="button">＋ 新建画布</button>
        <button id="canvasAddImage" class="text-action" type="button">＋ 图片</button>
        <button id="canvasAddText" class="text-action" type="button">＋ 文字</button>
        <button id="canvasGroup" class="text-action" type="button">打组</button>
        <button id="canvasReset" class="text-action" type="button">复位</button>
        <button id="canvasClear" class="text-action" type="button">清空</button>
      </div>
      <div class="canvas-status">
        <span id="canvasZoom">100%</span>
        <span>Ctrl 框选 · 滚轮缩放 · 双击文字编辑</span>
      </div>
      <div class="infinite-canvas" id="infiniteCanvas">
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
        <button type="button" data-canvas-node="upload">▧ 图片卡片</button>
        <button type="button" data-canvas-node="generator">▦ 生成节点</button>
        <button type="button" data-canvas-node="gallery">▦ 生成图集</button>
        <button type="button" data-canvas-node="text">¶ 提示词</button>
      </div>
      <div class="canvas-node-menu canvas-connect-menu" id="canvasConnectMenu" hidden>
        <button type="button" data-connect-node="upload">▧ 新建图片节点</button>
        <button type="button" data-connect-node="generator">▦ 新建生成节点</button>
        <button type="button" data-connect-node="gallery">▦ 新建生成图集</button>
        <button type="button" data-connect-node="text">¶ 新建提示词</button>
      </div>
      <div class="canvas-board-panel" id="canvasBoardPanel" hidden>
        <div class="canvas-board-card">
          <div class="canvas-board-head">
            <div>
              <strong>选择画布</strong>
              <span id="canvasBoardCount">0 个</span>
              <p>打开已有画布，或者建立一个新的。</p>
            </div>
            <div class="canvas-board-tools">
              <button id="canvasBoardRefresh" type="button">↻</button>
              <button id="canvasBoardNew" type="button">＋ 新建画布</button>
              <button id="canvasBoardClose" type="button">×</button>
            </div>
          </div>
          <div class="canvas-board-list" id="canvasBoardList"></div>
        </div>
      </div>
      <input id="canvasImageInput" type="file" accept="image/*" multiple hidden />
      <input id="canvasNodeImageInput" type="file" accept="image/*" hidden />
    </section>
  `;

  const miniStatus = stage.querySelector(".mini-status");
  stage.insertBefore(canvasView, miniStatus || null);
}

function initializeCanvasBoard() {
  const viewport = document.querySelector("#infiniteCanvas");
  const plane = document.querySelector("#canvasPlane");
  const imageInput = document.querySelector("#canvasImageInput");
  const nodeImageInput = document.querySelector("#canvasNodeImageInput");
  const nodeMenu = document.querySelector("#canvasNodeMenu");
  const connectMenu = document.querySelector("#canvasConnectMenu");
  const selectionBox = document.querySelector("#canvasSelectionBox");
  if (!viewport || !plane || !imageInput || !nodeImageInput || !nodeMenu || !connectMenu) return;

  document.querySelector("#canvasHistoryButton")?.addEventListener("click", openCanvasBoardPanel);
  document.querySelector("#canvasNew")?.addEventListener("click", () => createNewCanvasBoard());
  document.querySelector("#canvasBoardClose")?.addEventListener("click", closeCanvasBoardPanel);
  document.querySelector("#canvasBoardRefresh")?.addEventListener("click", loadCanvasBoards);
  document.querySelector("#canvasBoardNew")?.addEventListener("click", () => createNewCanvasBoard());
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
    scheduleCanvasSave();
  });
  document.querySelector("#canvasClear")?.addEventListener("click", () => {
    clearCanvasPlane();
    scheduleCanvasSave();
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
    }
    nodeImageInput.value = "";
  });

  nodeMenu.addEventListener("click", (event) => {
    const button = event.target.closest("[data-canvas-node]");
    if (!button || !canvasState.menuPoint) return;
    if (button.dataset.canvasNode === "upload") addCanvasUploadPlaceholder(canvasState.menuPoint);
    if (button.dataset.canvasNode === "generator") addCanvasImagePlaceholder(canvasState.menuPoint);
    if (button.dataset.canvasNode === "gallery") addCanvasGallery(canvasState.menuPoint);
    if (button.dataset.canvasNode === "text") addCanvasText(canvasState.menuPoint);
    hideCanvasNodeMenu();
    scheduleCanvasSave();
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
    if (event.target.closest(".canvas-node-model, .canvas-node-size, .canvas-node-resolution")) scheduleCanvasSave();
  });

  document.addEventListener("keydown", (event) => {
    if (!document.querySelector('#canvasView.active')) return;
    if (!event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key.toLowerCase() === "c") {
      copySelectedCanvasNodes(event);
      return;
    }
    if (event.key.toLowerCase() === "v") {
      pasteCanvasNodes(event);
      return;
    }
    if (event.key.toLowerCase() === "g") {
      createCanvasGroupFromSelection(event);
    }
  });

  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const before = screenToCanvas(event.clientX - rect.left, event.clientY - rect.top);
    const factor = event.deltaY < 0 ? 1.08 : 0.92;
    canvasState.scale = Math.max(0.25, Math.min(3, canvasState.scale * factor));
    canvasState.x = event.clientX - rect.left - before.x * canvasState.scale;
    canvasState.y = event.clientY - rect.top - before.y * canvasState.scale;
    applyCanvasTransform();
    scheduleCanvasSave();
  }, { passive: false });

  viewport.addEventListener("pointerdown", (event) => {
    hideCanvasNodeMenu();
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

  viewport.addEventListener("dragover", (event) => {
    if (canvasState.draggedGalleryImage
      || event.dataTransfer?.types?.includes("application/x-canvas-gallery-image")
      || event.dataTransfer?.types?.includes("text/plain")
      || Array.from(event.dataTransfer?.items || []).some((item) => item.type.startsWith("image/"))) {
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
      createCanvasImageFromGalleryDrop(canvasState.draggedGalleryImage || galleryPayload, getCanvasPointFromEvent(event));
      canvasState.draggedGalleryImage = null;
      return;
    }
    const files = Array.from(event.dataTransfer?.files || []).filter((file) => file.type.startsWith("image/"));
    if (!files.length) return;
    event.preventDefault();
    viewport.classList.remove("drag-over");
    const point = getCanvasPointFromEvent(event);
    for (const [index, file] of files.entries()) {
      const url = await uploadCanvasImageFile(file);
      addCanvasImage(url, file.name, { x: point.x + index * 32, y: point.y + index * 32 });
    }
    scheduleCanvasSave();
  });

  resetCanvasView();
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

function createCanvasNodeFromConnectChoice(choice, point) {
  if (choice === "text") return addCanvasText(point, { focus: false });
  if (choice === "gallery") return addCanvasGallery(point);
  if (choice === "generator") return addCanvasImagePlaceholder(point);
  return addCanvasUploadPlaceholder(point);
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
    img.src = src;
    img.alt = name || "画布图片";
    img.addEventListener("load", scheduleCanvasConnectionRender);
    img.addEventListener("click", () => openPreview(src, src));
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
  if (src) {
    const download = document.createElement("button");
    download.type = "button";
    download.className = "canvas-node-download";
    download.textContent = "下载";
    download.addEventListener("click", (event) => {
      event.stopPropagation();
      downloadCanvasImage(node, event.currentTarget);
    });
    bar.insertBefore(download, bar.lastElementChild);
  }

  const hasIncoming = canvasState.connections.some((item) => item.to === node.dataset.id);
  if (hasIncoming) node.append(createCanvasPort("input"), outputPort, bar, media, createCanvasResizeHandle());
  else node.append(outputPort, bar, media, createCanvasResizeHandle());
  scheduleCanvasConnectionRender();
}

function renderCanvasImageNode(node, { src, name }) {
  const previousPrompt = node.querySelector(".canvas-node-prompt")?.value || "";
  const previousModel = node.querySelector(".canvas-node-model")?.value || imageModelInput.value || "";
  const previousSize = node.querySelector(".canvas-node-size")?.value || node.dataset.canvasSize || imageSizeInput.value || "1024x1024";
  const previousResolution = node.querySelector(".canvas-node-resolution")?.value || node.dataset.canvasResolution || imageResolutionInput.value || "1";
  node.innerHTML = "";
  node.dataset.imageSrc = src || "";
  node.dataset.imageName = name || "图片";
  node.dataset.canvasSize = previousSize;
  node.dataset.canvasResolution = previousResolution;
  node.classList.toggle("canvas-node-frameless", Boolean(src));

  const outputPort = createCanvasPort("output");
  const media = document.createElement("div");
  media.className = `canvas-image-upload${src ? " has-image" : ""}`;
  media.hidden = !src && Boolean(node.dataset.resultSrc);
  media.title = src ? "双击替换图片" : "双击上传图片";
  if (src) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = name || "画布图片";
    img.addEventListener("load", scheduleCanvasConnectionRender);
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
    resultImg.src = node.dataset.resultSrc;
    resultImg.alt = "生成结果";
    resultImg.addEventListener("load", scheduleCanvasConnectionRender);
    resultImg.addEventListener("click", () => openPreview(node.dataset.resultSrc, node.dataset.resultDownloadUrl || node.dataset.resultSrc));
    result.append(resultImg);
    result.append(createCanvasResultDownload(node));
  }

  const bar = createCanvasNodeBar(name || "图片");
  if (src) {
    const download = document.createElement("button");
    download.type = "button";
    download.className = "canvas-node-download";
    download.textContent = "下载";
    download.addEventListener("click", (event) => {
      event.stopPropagation();
      downloadCanvasImage(node, event.currentTarget);
    });
    bar.insertBefore(download, bar.lastElementChild);
  }

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

  const controls = document.createElement("div");
  controls.className = "canvas-node-controls";
  const model = document.createElement("select");
  model.className = "canvas-node-model";
  fillCanvasNodeModelSelect(model, previousModel);
  model.addEventListener("change", () => updateCanvasRunButtonLabel(run, model.value));
  const size = document.createElement("select");
  size.className = "canvas-node-size";
  fillCanvasNodeSizeSelect(size, previousSize);
  size.addEventListener("change", () => {
    node.dataset.canvasSize = size.value;
  });
  const resolution = document.createElement("select");
  resolution.className = "canvas-node-resolution";
  fillCanvasNodeResolutionSelect(resolution, previousResolution);
  resolution.addEventListener("change", () => {
    node.dataset.canvasResolution = resolution.value;
  });
  const run = document.createElement("button");
  run.className = "canvas-node-run";
  run.type = "button";
  updateCanvasRunButtonLabel(run, model.value);
  run.addEventListener("click", () => runCanvasImageEdit(node));
  controls.append(model, size, resolution, run);

  node.append(inputPort, outputPort, bar, refs, prompt, controls, createCanvasResizeHandle());
  updateCanvasNodeRefs(node);
  scheduleCanvasConnectionRender();
}

function renderCanvasGalleryNode(node, { images = [], title = "生成图集" } = {}) {
  node.innerHTML = "";
  node.dataset.galleryImages = JSON.stringify(images);
  node.dataset.galleryTitle = title;
  const inputPort = createCanvasPort("input");
  const outputPort = createCanvasPort("output");
  const bar = createCanvasNodeBar(title);
  const grid = document.createElement("div");
  grid.className = "canvas-gallery-grid";
  node.append(inputPort, outputPort, bar, grid, createCanvasResizeHandle());
  renderCanvasGalleryImages(node);
  scheduleCanvasConnectionRender();
}

function getCanvasGalleryImages(node) {
  try {
    const images = JSON.parse(node.dataset.galleryImages || "[]");
    return Array.isArray(images) ? images : [];
  } catch {
    return [];
  }
}

function setCanvasGalleryImages(node, images) {
  node.dataset.galleryImages = JSON.stringify(images);
  renderCanvasGalleryImages(node);
}

function renderCanvasGalleryImages(node) {
  const grid = node.querySelector(".canvas-gallery-grid");
  if (!grid) return;
  const images = getCanvasGalleryImages(node);
  grid.innerHTML = "";
  if (!images.length) {
    const empty = document.createElement("div");
    empty.className = "canvas-gallery-empty";
    empty.textContent = "生成后的图片会排在这里";
    grid.append(empty);
    return;
  }
  images.forEach((image, index) => {
    const item = document.createElement("figure");
    item.className = "canvas-gallery-item";
    item.draggable = false;
    item.dataset.galleryIndex = String(index);
    const img = document.createElement("img");
    img.src = image.src || image.url;
    img.alt = image.name || `生成图 ${index + 1}`;
    img.draggable = false;
    img.addEventListener("load", scheduleCanvasConnectionRender);
    const caption = document.createElement("figcaption");
    caption.textContent = String(index + 1);
    item.append(img, caption);
    bindCanvasGalleryItemDrag(item, image, index);
    grid.append(item);
  });
}

function bindCanvasGalleryItemDrag(item, image, index) {
  const payload = {
    src: image.src || image.url,
    savedUrl: image.savedUrl || image.src || image.url,
    name: image.name || `生成图 ${index + 1}`,
  };
  let start = null;
  let moved = false;
  let suppressClick = false;

  item.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.stopPropagation();
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
    const shouldCopy = moved && !item.closest(".canvas-node-gallery")?.contains(document.elementFromPoint(event.clientX, event.clientY));
    if (shouldCopy) {
      createCanvasImageFromGalleryDrop(payload, getCanvasPointFromClient(event.clientX, event.clientY));
      suppressClick = true;
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
    event.stopPropagation();
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    openPreview(payload.src, payload.savedUrl || payload.src);
  });
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

function createCanvasImageFromGalleryDrop(payload, point) {
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
  setCanvasStatus("已从图集拖出为图片节点。");
}

function renderCanvasConnections() {
  const svg = document.querySelector("#canvasConnections");
  if (!svg) return;
  svg.innerHTML = "";
  canvasState.connections = canvasState.connections.filter((item) => getCanvasNode(item.from) && getCanvasNode(item.to));
  canvasState.connections.forEach((item) => {
    const fromNode = getCanvasNode(item.from);
    const toNode = getCanvasNode(item.to);
    const from = getCanvasPortPoint(fromNode, "output");
    const to = getCanvasPortPoint(toNode, item.toPort || "input");
    if (!from || !to) return;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const distance = Math.max(80, Math.abs(to.x - from.x) * 0.45);
    const d = `M ${from.x} ${from.y} C ${from.x + distance} ${from.y}, ${to.x - distance} ${to.y}, ${to.x} ${to.y}`;
    path.setAttribute("d", d);
    path.setAttribute("class", "canvas-connection-path");
    const hit = document.createElementNS("http://www.w3.org/2000/svg", "path");
    hit.setAttribute("d", d);
    hit.setAttribute("class", "canvas-connection-hit");
    hit.addEventListener("click", (event) => {
      event.stopPropagation();
      disconnectCanvasNodes(item.from, item.to);
    });
    svg.append(path, hit);
  });
  if (canvasState.tempConnection) {
    const reverse = canvasState.tempConnection.direction === "input";
    const fromNode = reverse ? null : getCanvasNode(canvasState.tempConnection.from);
    const toNode = reverse ? getCanvasNode(canvasState.tempConnection.to) : null;
    const from = reverse ? canvasState.tempConnection.fromPoint : getCanvasPortPoint(fromNode, "output");
    const to = reverse ? getCanvasPortPoint(toNode, canvasState.tempConnection.toPort || "input") : canvasState.tempConnection.to;
    if (from && to) {
      const temp = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const distance = Math.max(80, Math.abs(to.x - from.x) * 0.45);
      temp.setAttribute("d", `M ${from.x} ${from.y} C ${from.x + distance} ${from.y}, ${to.x - distance} ${to.y}, ${to.x} ${to.y}`);
      temp.setAttribute("class", "canvas-connection-path canvas-connection-temp");
      svg.append(temp);
    }
  }
}

function scheduleCanvasConnectionRender() {
  requestAnimationFrame(() => {
    requestAnimationFrame(renderCanvasConnections);
  });
  window.setTimeout(renderCanvasConnections, 120);
  window.setTimeout(renderCanvasConnections, 450);
}

function getCanvasPortPoint(node, kind) {
  if (!node) return null;
  const x = Number(node.dataset.x);
  const y = Number(node.dataset.y);
  const port = node.querySelector(`.canvas-port-${kind}`) || (kind === "prompt" ? node.querySelector(".canvas-port-input") : null);
  if (!port) return null;
  return {
    x: x + (kind === "output" ? node.offsetWidth : 0),
    y: y + port.offsetTop + port.offsetHeight / 2,
  };
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
  renderCanvasConnections();

  const move = (event) => {
    canvasState.tempConnection = {
      direction: "input",
      to: targetNode.dataset.id,
      toPort,
      fromPoint: getCanvasPointFromClient(event.clientX, event.clientY),
    };
    renderCanvasConnections();
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
  if (!getCanvasNodeOutput(sourceNode)) {
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
  renderCanvasConnections();

  const move = (event) => {
    canvasState.tempConnection = {
      from: sourceNode.dataset.id,
      to: getCanvasPointFromClient(event.clientX, event.clientY),
    };
    renderCanvasConnections();
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
  menu.querySelector('[data-connect-node="gallery"]')?.toggleAttribute("hidden", isInputDrag);
  menu.querySelector('[data-connect-node="generator"]')?.toggleAttribute("hidden", isInputDrag);
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

function fillCanvasNodeSizeSelect(select, preferred) {
  const sizes = [
    { value: "auto", label: "Auto" },
    ...Array.from(imageSizeInput.options || []).map((option) => ({
    value: option.value,
    label: option.textContent || option.value,
    })),
  ];
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
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    select.append(option);
  });
  select.value = fallbackSizes.some((item) => item.value === preferred) ? preferred : fallbackSizes[0].value;
}

function fillCanvasNodeResolutionSelect(select, preferred) {
  const resolutions = Array.from(imageResolutionInput.options || []).map((option) => ({
    value: option.value,
    label: option.textContent || `${option.value}K`,
  }));
  const fallbackResolutions = resolutions.length ? resolutions : [
    { value: "1", label: "1K" },
    { value: "2", label: "2K" },
    { value: "4", label: "4K" },
  ];
  select.innerHTML = "";
  fallbackResolutions.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    select.append(option);
  });
  select.value = fallbackResolutions.some((item) => item.value === preferred) ? preferred : fallbackResolutions[0].value;
}

function getCanvasOutputSize(node) {
  const size = node.querySelector(".canvas-node-size")?.value || node.dataset.canvasSize || "1024x1024";
  if (size === "auto") return "auto";
  return getScaledImageSizeByLongEdge(size, node.querySelector(".canvas-node-resolution")?.value || node.dataset.canvasResolution || "1");
}

function getCanvasResolutionLabel(node) {
  const value = node.querySelector(".canvas-node-resolution")?.value || node.dataset.canvasResolution || "1";
  const option = node.querySelector(`.canvas-node-resolution option[value="${CSS.escape(value)}"]`);
  return option?.textContent || `${value}K`;
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
  const option = node.querySelector(`.canvas-node-size option[value="${CSS.escape(value)}"]`);
  return option?.textContent || value;
}

function getScaledImageSizeByLongEdge(size, resolution) {
  const ratio = getCanvasSizeRatio(size);
  const level = Number(resolution || 1);
  if (!ratio || !level) return size;
  if (level <= 1) return size;
  const targetLongEdge = level >= 4 ? 3840 : level * 1024;
  const maxPixels = level >= 4 ? 8294400 : Number.POSITIVE_INFINITY;
  const landscape = ratio.width >= ratio.height;
  let longEdge = targetLongEdge;
  let width = 0;
  let height = 0;
  do {
    if (landscape) {
      width = roundImageEdge(longEdge);
      height = roundImageEdge((longEdge * ratio.height) / ratio.width);
    } else {
      height = roundImageEdge(longEdge);
      width = roundImageEdge((longEdge * ratio.width) / ratio.height);
    }
    if (width * height <= maxPixels) break;
    longEdge -= 16;
  } while (longEdge >= 1024);
  return `${width}x${height}`;
}

function getCanvasSizeRatio(size) {
  const known = {
    "1024x1024": { width: 1, height: 1 },
    "1024x1536": { width: 2, height: 3 },
    "1536x1024": { width: 3, height: 2 },
    "1024x1792": { width: 9, height: 16 },
    "1792x1024": { width: 16, height: 9 },
  };
  if (known[size]) return known[size];
  const [width, height] = String(size || "").split("x").map(Number);
  if (!width || !height) return null;
  return { width, height };
}

function roundImageEdge(value) {
  return Math.max(16, Math.floor(Number(value || 0) / 16) * 16);
}

function isHighResolutionCanvasRequest(node) {
  const level = Number(node.querySelector(".canvas-node-resolution")?.value || node.dataset.canvasResolution || 1);
  return level >= 4;
}

function getCanvasImageQuality(node) {
  if (isGptImage2CanvasNode(node) && isHighResolutionCanvasRequest(node)) {
    return "high";
  }
  return "auto";
}

function isGptImage2CanvasNode(node) {
  return String(node.querySelector(".canvas-node-model")?.value || "").toLowerCase() === "gpt-image-2";
}

function connectCanvasNodes(fromId, toId, toPort = "input") {
  if (!fromId || !toId || fromId === toId) {
    setCanvasStatus("请选择另一个图片节点作为目标。");
    return;
  }
  const sourceNode = getCanvasNode(fromId);
  const targetNode = getCanvasNode(toId);
  const sourceOutput = getCanvasNodeOutput(sourceNode);
  const allowEmptyUploadToInput = sourceNode?.dataset.uploadOnly === "true" && targetNode?.classList.contains("canvas-node-image");
  if (!sourceOutput && !allowEmptyUploadToInput) {
    setCanvasStatus("源节点还没有可连接的内容。");
    return;
  }
  const output = sourceOutput || { type: "image", name: sourceNode?.dataset.imageName || "图片节点", url: "" };
  const resolvedPort = toPort === "prompt" ? "input" : toPort;
  if (!getCanvasPortPoint(targetNode, resolvedPort)) {
    setCanvasStatus("这个节点不能接收这种连接。");
    return;
  }
  if (output?.type === "generator" && !targetNode?.classList.contains("canvas-node-gallery")) {
    setCanvasStatus("生成节点只能连接到生成图集节点。");
    return;
  }
  if (!canvasState.connections.some((item) => item.from === fromId && item.to === toId && (item.toPort || "input") === resolvedPort)) {
    canvasState.connections.push({ from: fromId, to: toId, toPort: resolvedPort });
  }
  canvasState.pendingConnection = null;
  document.querySelectorAll(".canvas-node.is-connecting").forEach((item) => item.classList.remove("is-connecting"));
  updateCanvasNodeRefs(getCanvasNode(toId));
  renderCanvasConnections();
  setCanvasStatus("已连接，目标节点会把连入图片作为参考图。");
  scheduleCanvasSave();
}

function disconnectCanvasNodes(fromId, toId) {
  canvasState.connections = canvasState.connections.filter((item) => item.from !== fromId || item.to !== toId);
  updateCanvasNodeRefs(getCanvasNode(toId));
  renderCanvasConnections();
  setCanvasStatus("已断开连接。");
  scheduleCanvasSave();
}

function updateCanvasNodeRefs(node) {
  if (!node) return;
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
    thumb.draggable = true;
    thumb.dataset.refKey = ref.key;
    thumb.dataset.index = String(index);
    const img = document.createElement("img");
    thumb.src = ref.url;
    img.src = ref.url;
    img.alt = ref.name || "参考图";
    const badge = document.createElement("span");
    badge.className = "canvas-ref-index";
    badge.textContent = String(index + 1);
    const label = document.createElement("span");
    label.className = "canvas-ref-label";
    label.textContent = ref.name || "参考图";
    thumb.append(img, badge, label);
    thumb.addEventListener("dragstart", (event) => {
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
      if (output.type === "generator") return [];
      return [{
        ...output,
        key: `${output.type}:${item.from}`,
      }];
    })
    .filter(Boolean);
}

function getCanvasIncomingRefs(nodeId) {
  return getCanvasIncomingItems(nodeId).filter((item) => item.type === "image");
}

function getCanvasIncomingTexts(nodeId) {
  return getCanvasIncomingItems(nodeId)
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .filter(Boolean);
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

function getCanvasNodeOutput(node) {
  if (!node) return null;
  if (node.classList.contains("canvas-node-image")) {
    const url = node.dataset.resultSrc || node.dataset.imageSrc;
    if (node.dataset.uploadOnly === "true" && !url) return null;
    if (!url) return { type: "generator", name: node.dataset.imageName || "生成节点" };
    return {
      type: "image",
      name: node.dataset.imageName || "参考图",
      url,
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
    const images = getCanvasGalleryImages(node).map((image) => ({
      name: image.name || "生成图",
      url: image.savedUrl || image.src || image.url,
    })).filter((image) => image.url);
    if (!images.length) return null;
    return {
      type: "group",
      name: node.dataset.galleryTitle || "生成图集",
      images,
    };
  }
  return null;
}

async function runCanvasImageEdit(node) {
  syncCanvasPromptFromTextInputs(node);
  const prompt = node.querySelector(".canvas-node-prompt")?.value.trim();
  const requestPrompt = getCanvasPromptWithResolution(node, prompt);
  const model = node.querySelector(".canvas-node-model")?.value;
  const size = getCanvasOutputSize(node);
  const refs = getCanvasIncomingRefs(node.dataset.id);
  if (!prompt) {
    setCanvasNodeStatus(node, "请输入提示词");
    return;
  }
  if (!model) {
    setCanvasNodeStatus(node, "请选择模型");
    return;
  }
  if (!refs.length && node.dataset.imageSrc) refs.push({ name: node.dataset.imageName || "当前图片", url: node.dataset.imageSrc });

  const runButton = node.querySelector(".canvas-node-run");
  if (runButton) {
    runButton.disabled = true;
    runButton.textContent = "生成中";
  }
  setCanvasNodeStatus(node, "编辑中...");
  try {
    const response = await fetch(IMAGE_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: requestPrompt,
        size,
        quality: getCanvasImageQuality(node),
        n: 1,
        reference_images: refs,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || data.message || data.error || `${response.status} ${response.statusText}`);
    const [image] = extractImages(data);
    if (!image) throw new Error("接口返回成功，但没有找到图片。");
    appendCanvasGenerationToGallery(node, image);
    await saveImageHistory(`画布编辑：${prompt}`, [image], data.model || model);
    setCanvasNodeStatus(node, "完成");
    refreshCanvasConnectedNodes(node.dataset.id);
    scheduleCanvasSave();
  } catch (error) {
    setCanvasNodeStatus(node, `失败：${error.message}`);
  } finally {
    if (runButton) {
      runButton.disabled = false;
      updateCanvasRunButtonLabel(runButton, model);
    }
  }
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
  img.src = src;
  img.alt = "生成结果";
  img.addEventListener("load", scheduleCanvasConnectionRender);
  img.addEventListener("click", () => openPreview(src, savedUrl || src));
  result.append(img);
  result.append(createCanvasResultDownload(node));
  scheduleCanvasConnectionRender();
}

function appendCanvasGenerationToGallery(sourceNode, image) {
  const src = typeof image === "string" ? image : image?.src;
  const savedUrl = typeof image === "string" ? image : image?.savedUrl || image?.src;
  if (!src) return;
  const gallery = getOrCreateCanvasGalleryForNode(sourceNode);
  const images = getCanvasGalleryImages(gallery);
  images.push({
    name: `生成图 ${images.length + 1}`,
    src,
    savedUrl: savedUrl || src,
    createdAt: new Date().toISOString(),
  });
  setCanvasGalleryImages(gallery, images);
  setCanvasStatus(`已追加到生成图集：${images.length} 张`);
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
  const existing = canvasState.connections
    .filter((item) => item.from === sourceNode.dataset.id)
    .map((item) => getCanvasNode(item.to))
    .find((node) => node?.classList.contains("canvas-node-gallery"));
  if (existing) return existing;

  const point = {
    x: Number(sourceNode.dataset.x || 0) + (Number(sourceNode.dataset.width || sourceNode.offsetWidth || 292) || 292) + 90,
    y: Number(sourceNode.dataset.y || 0),
  };
  const gallery = addCanvasGallery(point);
  connectCanvasNodes(sourceNode.dataset.id, gallery.dataset.id, "input");
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
  canvasState.connections
    .filter((item) => item.from === sourceId || item.to === sourceId)
    .forEach((item) => updateCanvasNodeRefs(getCanvasNode(item.to)));
  refreshCanvasGroupsContainingNode(sourceId);
  renderCanvasConnections();
}

function refreshCanvasGroupsContainingNode(sourceId) {
  document.querySelectorAll("#canvasPlane .canvas-node-group").forEach((group) => {
    if (!getCanvasGroupMemberIds(group).includes(String(sourceId))) return;
    updateCanvasGroupCounts();
    canvasState.connections
      .filter((item) => item.from === group.dataset.id)
      .forEach((item) => updateCanvasNodeRefs(getCanvasNode(item.to)));
  });
}

function getCanvasNode(id) {
  return document.querySelector(`#canvasPlane .canvas-node[data-id="${CSS.escape(String(id))}"]`);
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

function clearCanvasPlane() {
  const plane = document.querySelector("#canvasPlane");
  plane?.querySelectorAll(".canvas-node").forEach((node) => node.remove());
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
  const nodes = Array.from(document.querySelectorAll("#canvasPlane .canvas-node")).map((node) => {
    return serializeCanvasNode(node);
  });
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
    } else {
      base.imageSrc = node.dataset.imageSrc || "";
      base.uploadOnly = node.dataset.uploadOnly === "true";
      base.resultSrc = node.dataset.resultSrc || "";
      base.resultDownloadUrl = node.dataset.resultDownloadUrl || "";
      base.imageName = node.dataset.imageName || "图片";
      base.prompt = node.querySelector(".canvas-node-prompt")?.value || "";
      base.model = node.querySelector(".canvas-node-model")?.value || "";
      base.size = node.querySelector(".canvas-node-size")?.value || node.dataset.canvasSize || "1024x1024";
      base.resolution = node.querySelector(".canvas-node-resolution")?.value || node.dataset.canvasResolution || "1";
      base.refOrder = getCanvasNodeRefOrder(node);
  }
  return base;
}

function getCanvasNodeKind(node) {
  if (node.classList.contains("canvas-node-text")) return "text";
  if (node.classList.contains("canvas-node-group")) return "group";
  if (node.classList.contains("canvas-node-gallery")) return "gallery";
  return "image";
}

function getCanvasBoardTitle(nodes) {
  const textNode = nodes.find((node) => node.kind === "text" && node.text?.trim());
  if (textNode) return textNode.text.trim().slice(0, 24);
  const imageNode = nodes.find((node) => node.kind === "image" && node.imageName && node.imageName !== "图片卡片");
  if (imageNode) return imageNode.imageName.slice(0, 24);
  return canvasState.activeBoardTitle || "未命名画布";
}

async function saveCanvasBoardNow() {
  if (canvasState.isRestoring) return;
  clearTimeout(canvasState.saveTimer);
  const board = serializeCanvasBoard();
  canvasState.activeBoardId = board.id;
  canvasState.activeBoardTitle = board.title;
  canvasState.activeBoardCreatedAt = board.createdAt;
  try {
    const response = await fetch(CANVAS_BOARDS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(board),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "画布保存失败");
    canvasState.boards = data.boards || [];
    canvasState.hasUnsavedChanges = false;
    renderCanvasBoardList();
  } catch (error) {
    setCanvasStatus(error.message);
  }
}

function scheduleCanvasSave() {
  if (canvasState.isRestoring) return;
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
  const board = serializeCanvasBoard();
  canvasState.activeBoardId = board.id;
  canvasState.activeBoardTitle = board.title;
  canvasState.activeBoardCreatedAt = board.createdAt;
  const payload = JSON.stringify(board);
  if (navigator.sendBeacon) {
    const blob = new Blob([payload], { type: "application/json" });
    navigator.sendBeacon(CANVAS_BOARDS_API_URL, blob);
    canvasState.hasUnsavedChanges = false;
    return;
  }
  fetch(CANVAS_BOARDS_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {});
  canvasState.hasUnsavedChanges = false;
}

async function loadCanvasBoards() {
  try {
    const response = await fetch(CANVAS_BOARDS_API_URL);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "画布历史读取失败");
    canvasState.boards = data.boards || [];
    if (canvasState.boards.length) restoreCanvasBoard(canvasState.boards[0]);
    else await createNewCanvasBoard("未命名画布");
    renderCanvasBoardList();
  } catch (error) {
    setCanvasStatus(error.message);
    await createNewCanvasBoard("未命名画布");
  }
}

function restoreCanvasBoard(board) {
  canvasState.isRestoring = true;
  clearCanvasPlane();
  canvasState.activeBoardId = board.id;
  canvasState.activeBoardTitle = board.title || "未命名画布";
  canvasState.activeBoardCreatedAt = board.createdAt || new Date().toISOString();
  const nodes = Array.isArray(board.nodes) ? board.nodes : [];
  const legacyResults = [];
  let maxId = 0;
  nodes.forEach((item) => {
    const node = createCanvasNode(item.kind === "text" ? "text" : (item.kind === "group" ? "group" : (item.kind === "gallery" ? "gallery" : "image")));
    node.dataset.id = String(item.id);
    node.dataset.x = String(Number(item.x || 0));
    node.dataset.y = String(Number(item.y || 0));
    if (item.width) node.dataset.width = String(item.width);
    if (item.height) node.dataset.height = String(item.height);
    maxId = Math.max(maxId, Number(item.id) || 0);
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
      });
    } else {
      if (item.uploadOnly) renderCanvasUploadNode(node, { src: item.imageSrc || "", name: item.imageName || "图片节点" });
      else renderCanvasImageNode(node, { src: item.imageSrc || "", name: item.imageName || "图片卡片" });
      if (Array.isArray(item.refOrder)) setCanvasNodeRefOrder(node, item.refOrder);
      if (item.resultSrc) {
        legacyResults.push({
          sourceId: String(item.id),
          src: item.resultSrc,
          savedUrl: item.resultDownloadUrl || item.resultSrc,
          createdAt: item.updatedAt || item.createdAt || board.updatedAt || board.createdAt,
        });
      }
      if (!item.uploadOnly) {
        const prompt = node.querySelector(".canvas-node-prompt");
        if (prompt) prompt.value = item.prompt || "";
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
      }
    }
    placeCanvasNode(node);
    applyCanvasNodeSize(node);
  });
  canvasState.nextNode = Math.max(canvasState.nextNode, maxId + 1);
  canvasState.connections = Array.isArray(board.connections) ? board.connections : [];
  const migratedLegacyCount = migrateLegacyCanvasResultsToGalleries(legacyResults);
  canvasState.x = Number(board.viewport?.x ?? 80);
  canvasState.y = Number(board.viewport?.y ?? 60);
  canvasState.scale = Number(board.viewport?.scale ?? 1);
  applyCanvasTransform();
  refreshAllCanvasRefs();
  updateCanvasOrigin();
  canvasState.isRestoring = false;
  scheduleCanvasConnectionRender();
  if (migratedLegacyCount) scheduleCanvasSave();
  setCanvasStatus(`已打开：${canvasState.activeBoardTitle}`);
}

function refreshAllCanvasRefs() {
  document.querySelectorAll("#canvasPlane .canvas-node").forEach((node) => updateCanvasNodeRefs(node));
  updateCanvasGroupCounts();
  scheduleCanvasConnectionRender();
}

async function createNewCanvasBoard(title = `画布 ${canvasState.boards.length + 1}`) {
  canvasState.isRestoring = true;
  clearCanvasPlane();
  resetCanvasView();
  canvasState.activeBoardId = createId();
  canvasState.activeBoardTitle = title;
  canvasState.activeBoardCreatedAt = new Date().toISOString();
  canvasState.isRestoring = false;
  closeCanvasBoardPanel();
  await saveCanvasBoardNow();
  setCanvasStatus(`已新建：${title}`);
}

function openCanvasBoardPanel() {
  renderCanvasBoardList();
  const panel = document.querySelector("#canvasBoardPanel");
  if (panel) panel.hidden = false;
}

function closeCanvasBoardPanel() {
  const panel = document.querySelector("#canvasBoardPanel");
  if (panel) panel.hidden = true;
}

function renderCanvasBoardList() {
  const list = document.querySelector("#canvasBoardList");
  const count = document.querySelector("#canvasBoardCount");
  if (count) count.textContent = `${canvasState.boards.length} 个`;
  if (!list) return;
  list.innerHTML = "";
  if (!canvasState.boards.length) {
    const empty = document.createElement("div");
    empty.className = "canvas-board-empty";
    empty.textContent = "还没有画布";
    list.append(empty);
    return;
  }
  canvasState.boards.forEach((board) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `canvas-board-item${board.id === canvasState.activeBoardId ? " active" : ""}`;
    card.dataset.boardId = board.id;
    const title = document.createElement("strong");
    title.textContent = board.title || "未命名画布";
    const meta = document.createElement("span");
    meta.textContent = formatCanvasDate(board.updatedAt || board.createdAt);
    const badge = document.createElement("small");
    badge.textContent = `${board.nodes?.length || 0} 节点`;
    const remove = document.createElement("i");
    remove.textContent = "×";
    remove.title = "删除";
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      deleteCanvasBoard(board.id);
    });
    card.append(badge, title, meta, remove);
    card.addEventListener("pointerdown", (event) => event.stopPropagation());
    card.addEventListener("click", (event) => {
      event.preventDefault();
      restoreCanvasBoard(board);
      closeCanvasBoardPanel();
    });
    list.append(card);
  });
}

async function deleteCanvasBoard(id) {
  try {
    const response = await fetch(CANVAS_BOARDS_API_URL, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "删除失败");
    canvasState.boards = data.boards || [];
    if (id === canvasState.activeBoardId) {
      if (canvasState.boards.length) restoreCanvasBoard(canvasState.boards[0]);
      else await createNewCanvasBoard("未命名画布");
    }
    renderCanvasBoardList();
  } catch (error) {
    setCanvasStatus(error.message);
  }
}

function formatCanvasDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function copySelectedCanvasNodes(event) {
  if (!canvasState.activeNode || isCanvasTypingTarget(document.activeElement)) return;
  event.preventDefault();
  const ids = getSelectedCanvasNodes().length
    ? new Set(getSelectedCanvasNodes().map((node) => node.dataset.id))
    : new Set([canvasState.activeNode.dataset.id]);
  const nodes = Array.from(ids)
    .map((id) => getCanvasNode(id))
    .filter(Boolean)
    .map(serializeCanvasNode);
  const selectedId = canvasState.activeNode.dataset.id;
  const internalConnections = canvasState.connections
    .filter((item) => ids.has(String(item.from)) && ids.has(String(item.to)));
  const externalConnections = canvasState.connections
    .filter((item) => ids.has(String(item.from)) !== ids.has(String(item.to)))
    .map((item) => ({ ...item, selectedSide: ids.has(String(item.from)) ? "from" : "to" }));
  canvasState.clipboard = { selectedId, nodes, connections: internalConnections, externalConnections };
  setCanvasStatus(`已复制 ${nodes.length} 个节点。`);
}

function pasteCanvasNodes(event) {
  if (!canvasState.clipboard || isCanvasTypingTarget(document.activeElement)) return;
  event.preventDefault();
  const idMap = new Map();
  const pasted = [];
  canvasState.clipboard.nodes.forEach((item) => {
    const node = createCanvasNode(item.kind === "text" ? "text" : (item.kind === "group" ? "group" : (item.kind === "gallery" ? "gallery" : "image")));
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
      });
    } else {
      if (item.uploadOnly) renderCanvasUploadNode(node, { src: item.imageSrc || "", name: item.imageName || "图片节点" });
      else renderCanvasImageNode(node, { src: item.imageSrc || "", name: item.imageName || "图片卡片" });
      if (Array.isArray(item.refOrder)) setCanvasNodeRefOrder(node, item.refOrder);
      if (!item.uploadOnly) {
        const prompt = node.querySelector(".canvas-node-prompt");
        if (prompt) prompt.value = item.prompt || "";
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
  pasted.forEach((node) => updateCanvasNodeRefs(node));
  const selectedCloneId = idMap.get(String(canvasState.clipboard.selectedId));
  clearCanvasSelection();
  pasted.forEach((node) => addCanvasNodeToSelection(node));
  if (selectedCloneId) canvasState.activeNode = getCanvasNode(selectedCloneId);
  scheduleCanvasConnectionRender();
  scheduleCanvasSave();
  setCanvasStatus(`已粘贴 ${pasted.length} 个节点。`);
}

function isCanvasTypingTarget(target) {
  return Boolean(target?.closest?.("textarea, input, select, [contenteditable='true']"));
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
  canvasState.selectionFrameVisible = false;
  clearCanvasSelection();
  ordered.forEach((item) => addCanvasNodeToSelection(item));
  scheduleCanvasSave();
  setCanvasStatus("已打组，节点位置保持不变。");
  return node;
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
  renderCanvasTextNode(node, "写下一个想法");
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

function renderCanvasTextNode(node, content = "写下一个想法") {
  node.innerHTML = "";
  const outputPort = createCanvasPort("output");
  const text = document.createElement("div");
  text.className = "canvas-text";
  text.contentEditable = "true";
  text.textContent = content || "写下一个想法";
  text.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  text.addEventListener("blur", scheduleCanvasSave);
  node.append(outputPort, createCanvasNodeBar("文字"), text, createCanvasResizeHandle());
  scheduleCanvasConnectionRender();
}

function createCanvasResizeHandle() {
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "canvas-resize-handle";
  handle.title = "拖动缩放节点";
  handle.addEventListener("pointerdown", beginCanvasNodeResize);
  return handle;
}

function createCanvasNode(kind) {
  const node = document.createElement("article");
  node.className = `canvas-node canvas-node-${kind}`;
  node.dataset.x = String(-canvasState.x / canvasState.scale + 120 + canvasState.nextNode * 18);
  node.dataset.y = String(-canvasState.y / canvasState.scale + 110 + canvasState.nextNode * 18);
  node.dataset.id = String(canvasState.nextNode);
  canvasState.nextNode += 1;
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
    if (node) {
      const affectedTargets = canvasState.connections
        .filter((item) => item.from === node.dataset.id || item.to === node.dataset.id)
        .map((item) => item.to);
      canvasState.connections = canvasState.connections.filter((item) => item.from !== node.dataset.id && item.to !== node.dataset.id);
      document.querySelectorAll("#canvasPlane .canvas-node-group").forEach((group) => {
        const ids = getCanvasGroupMemberIds(group).filter((id) => id !== node.dataset.id);
        setCanvasGroupMemberIds(group, ids);
      });
      canvasState.selectedIds.delete(node.dataset.id);
      if (canvasState.activeNode === node) canvasState.activeNode = getSelectedCanvasNodes().find((item) => item !== node) || null;
      node.remove();
      affectedTargets.forEach((id) => updateCanvasNodeRefs(getCanvasNode(id)));
      updateCanvasGroupCounts();
      renderCanvasConnections();
      scheduleCanvasSave();
      updateCanvasGroupAction();
    }
    updateCanvasOrigin();
  });
  bar.append(title, remove);
  return bar;
}

function placeCanvasNode(node) {
  document.querySelector("#canvasPlane")?.append(node);
  updateCanvasNodePosition(node);
  updateCanvasOrigin();
}

function beginCanvasPan(event) {
  if (event.button !== 0) return;
  const start = { x: event.clientX, y: event.clientY, offsetX: canvasState.x, offsetY: canvasState.y };
  event.preventDefault();
  const move = (moveEvent) => {
    canvasState.x = start.offsetX + moveEvent.clientX - start.x;
    canvasState.y = start.offsetY + moveEvent.clientY - start.y;
    applyCanvasTransform();
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    updateCanvasGroupMembership(start.nodes.map((item) => item.node));
    releaseCanvasGroupFocus();
    scheduleCanvasSave();
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
    const minWidth = node.classList.contains("canvas-node-group") ? 180 : 220;
    const minHeight = node.classList.contains("canvas-node-group") ? 120 : 120;
    const maxWidth = node.classList.contains("canvas-node-group") ? 1600 : 820;
    const maxHeight = node.classList.contains("canvas-node-group") ? 1600 : 760;
    const width = Math.max(minWidth, Math.min(maxWidth, start.width + deltaX));
    const height = Math.max(minHeight, Math.min(maxHeight, start.height + deltaY));
    node.dataset.width = String(Math.round(width));
    node.dataset.height = String(Math.round(height));
    applyCanvasNodeSize(node);
    if (node.classList.contains("canvas-node-group")) refreshCanvasGroupMembership(node);
    scheduleCanvasConnectionRender();
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
  if (width > 0) node.style.width = `${width}px`;
  if (height > 0) {
    if (node.classList.contains("canvas-node-group")) node.style.height = `${height}px`;
    else node.style.setProperty("--canvas-node-media-height", `${height}px`);
  }
}

function getCanvasNodeBodyHeight(node) {
  const sized = node.querySelector(".canvas-node-result:not([hidden]), .canvas-image-upload:not([hidden]), .canvas-text");
  return sized?.offsetHeight || 180;
}

function selectCanvasNode(node) {
  canvasState.selectionFrameVisible = false;
  clearCanvasSelection();
  addCanvasNodeToSelection(node);
  canvasState.activeNode = node;
}

function clearCanvasSelection() {
  document.querySelectorAll(".canvas-node.is-selected").forEach((item) => item.classList.remove("is-selected"));
  canvasState.selectedIds.clear();
  canvasState.activeNode = null;
  canvasState.selectionFrameVisible = false;
  updateCanvasGroupAction();
  updateCanvasSelectionFrame();
}

function addCanvasNodeToSelection(node) {
  if (!node) return;
  node.classList.add("is-selected");
  canvasState.selectedIds.add(node.dataset.id);
  canvasState.activeNode = node;
  updateCanvasGroupAction();
  updateCanvasSelectionFrame();
}

function toggleCanvasNodeSelection(node) {
  if (!node) return;
  canvasState.selectionFrameVisible = false;
  if (node.classList.contains("is-selected")) {
    node.classList.remove("is-selected");
    canvasState.selectedIds.delete(node.dataset.id);
    canvasState.activeNode = getSelectedCanvasNodes().at(-1) || null;
  } else {
    addCanvasNodeToSelection(node);
  }
  updateCanvasGroupAction();
  updateCanvasSelectionFrame();
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
}

function blurActiveCanvasText() {
  if (document.activeElement?.classList?.contains("canvas-text")) document.activeElement.blur();
}

function updateCanvasNodePosition(node) {
  node.style.transform = `translate(${Number(node.dataset.x)}px, ${Number(node.dataset.y)}px)`;
  renderCanvasConnections();
  updateCanvasSelectionFrame();
}

function applyCanvasTransform() {
  const plane = document.querySelector("#canvasPlane");
  if (!plane) return;
  plane.style.transform = `translate(${canvasState.x}px, ${canvasState.y}px) scale(${canvasState.scale})`;
  const zoom = document.querySelector("#canvasZoom");
  if (zoom) zoom.textContent = `${Math.round(canvasState.scale * 100)}%`;
  updateCanvasSelectionFrame();
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
}

function hideCanvasNodeMenu() {
  const menu = document.querySelector("#canvasNodeMenu");
  if (menu) menu.hidden = true;
}

function updateCanvasOrigin() {
  const origin = document.querySelector(".canvas-origin");
  const hasNodes = Boolean(document.querySelector("#canvasPlane .canvas-node"));
  if (origin) origin.hidden = hasNodes;
}

function setCanvasStatus(message) {
  const status = document.querySelector(".canvas-status span:last-child");
  if (status) status.textContent = message;
}

function initializeChatLayoutCopy() {
  const chatTitle = document.querySelector("#chatView .studio-header h1");
  const chatSubtitle = document.querySelector("#chatView .studio-header p") || document.createElement("p");
  if (chatTitle) chatTitle.textContent = "你好";
  chatSubtitle.textContent = "GPT 对话";
  if (chatTitle && !chatSubtitle.parentElement) chatTitle.after(chatSubtitle);
  document.querySelector("#newChat").textContent = "+ NEW";
  document.querySelector("#clearChat").textContent = "↺ HISTORY";
  chatPromptInput.placeholder = "输入消息，Enter 发送...";
  attachButton.textContent = "＋ 上传";
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
  return MODEL_DISPLAY_NAMES[model] || model;
}

function getImageModelPrice(model) {
  return IMAGE_MODEL_PRICES[String(model || "").toLowerCase()] || "";
}

function getImagePriceText(model) {
  const price = getImageModelPrice(model);
  return price ? `￥${price}/张` : "";
}

function updateGenerateButtonLabel() {
  if (!generateButton || generateButton.disabled) return;
  const price = getImagePriceText(imageModelInput.value);
  generateButton.replaceChildren();
  const icon = document.createElement("span");
  icon.textContent = "⚡";
  generateButton.append(icon, document.createTextNode(price ? `生成图片 · ${price}` : "生成图片"));
}

function updateCanvasRunButtonLabel(button, model) {
  if (!button || button.disabled) return;
  const price = getImagePriceText(model);
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
    .map((item, index) => ({
      src: item.local_url || data.saved_images?.[index]?.url || item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : ""),
      savedUrl: item.local_url || data.saved_images?.[index]?.url || item.url || "",
    }))
    .filter((item) => item.src);
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

function renderImageCards(container, images, prompt, beforeSrc = "") {
  images.forEach((image, index) => {
    const figure = document.createElement("figure");
    figure.className = "image-card";

    const preview = beforeSrc
      ? createComparePreview(beforeSrc, image.src, prompt)
      : createImagePreview(image, prompt);

    const caption = document.createElement("figcaption");
    caption.innerHTML = `
      <span>${beforeSrc ? "对比" : "结果"} ${index + 1}</span>
      <span class="image-actions">
        <button type="button" data-preview="${index}">预览</button>
        <a href="${image.savedUrl || image.src}" download>下载</a>
      </span>
    `;
    caption.querySelector("button").addEventListener("click", () => openPreview(image.src, image.savedUrl || image.src));
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

function createComparePreview(beforeSrc, afterSrc, prompt) {
  const compare = document.createElement("div");
  compare.className = "compare-viewer";
  compare.style.setProperty("--split", "50%");

  const before = document.createElement("img");
  before.className = "compare-image compare-before";
  before.src = beforeSrc;
  before.alt = `${prompt} 原图`;

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
  afterLabel.textContent = "放大后";

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

function openPreview(src, downloadUrl) {
  resetPreviewTransform();
  lightboxImage.src = src;
  lightboxDownload.href = downloadUrl || src;
  lightbox.hidden = false;
}

function closePreview() {
  lightbox.hidden = true;
  lightboxImage.src = "";
  resetPreviewTransform();
}

function resetPreviewTransform() {
  previewState.scale = 1;
  previewState.x = 0;
  previewState.y = 0;
  previewState.dragging = false;
  applyPreviewTransform();
}

function applyPreviewTransform() {
  lightboxImage.style.setProperty("--preview-scale", String(previewState.scale));
  lightboxImage.style.setProperty("--preview-x", `${previewState.x}px`);
  lightboxImage.style.setProperty("--preview-y", `${previewState.y}px`);
  lightboxImage.classList.toggle("is-zoomed", previewState.scale > 1.01);
}

function handlePreviewWheel(event) {
  if (lightbox.hidden) return;
  event.preventDefault();
  const previousScale = previewState.scale;
  const nextScale = clamp(previousScale * (event.deltaY < 0 ? 1.12 : 0.89), 1, 6);
  if (nextScale === previousScale) return;

  const rect = lightboxImage.getBoundingClientRect();
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
  event.preventDefault();
  previewState.dragging = true;
  previewState.startX = event.clientX;
  previewState.startY = event.clientY;
  previewState.originX = previewState.x;
  previewState.originY = previewState.y;
  lightboxImage.setPointerCapture?.(event.pointerId);
  lightboxImage.classList.add("is-panning");

  const move = (moveEvent) => {
    if (!previewState.dragging) return;
    previewState.x = previewState.originX + moveEvent.clientX - previewState.startX;
    previewState.y = previewState.originY + moveEvent.clientY - previewState.startY;
    applyPreviewTransform();
  };
  const stop = (stopEvent) => {
    previewState.dragging = false;
    lightboxImage.releasePointerCapture?.(stopEvent.pointerId);
  lightboxImage.classList.remove("is-panning");
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

async function saveImageHistory(prompt, images, model) {
  await saveServerHistory(IMAGE_HISTORY_API_URL, { id: createId(), prompt, model, images, createdAt: Date.now() });
  await renderImageHistory();
}

async function renderImageHistory() {
  const records = await loadServerHistory(IMAGE_HISTORY_API_URL);
  imageHistoryEl.innerHTML = "";

  if (!records.length) {
    imageHistoryEl.innerHTML = '<div class="history-chat"><p>暂无图片历史。</p></div>';
    return;
  }

  records.forEach((record) => {
    const button = document.createElement("button");
    button.className = "history-thumb";
    button.type = "button";
    button.innerHTML = `<img src="${record.images[0]?.src || ""}" alt=""><p>${record.prompt}</p>`;
    button.addEventListener("click", () => {
      imagePromptInput.value = record.prompt;
      renderImages(record.images, record.prompt);
      setImageStatus(`历史记录 · 模型：${getModelDisplayName(record.model)}`);
    });
    imageHistoryEl.append(button);
  });
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
  chatHistoryEl.innerHTML = "";

  if (!records.length) {
    chatHistoryEl.innerHTML = '<div class="history-chat"><p>暂无对话历史。</p></div>';
    return;
  }

  records.forEach((record) => {
    const button = document.createElement("button");
    button.className = "history-chat";
    button.type = "button";
    button.innerHTML = `<strong>${record.model}</strong><p>${record.title || record.prompt || record.messages?.[0]?.content || "历史对话"}</p>`;
    button.addEventListener("click", () => {
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
      document.querySelector(".chat-history-panel")?.classList.remove("is-open");
    });
    chatHistoryEl.append(button);
  });
}

function resetCurrentChat() {
  history.length = 0;
  messagesEl.innerHTML = "";
  addMessage("assistant", "你好，我已经准备好了。直接输入你的问题就可以开始。");
}

function renderConversationMessages() {
  messagesEl.innerHTML = "";
  if (!history.length) {
    addMessage("assistant", "你好，我已经准备好了。直接输入你的问题就可以开始。");
    return;
  }

  history.forEach((message) => addMessage(message.role, message.displayContent || message.content));
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

function buildUserDisplayText(prompt) {
  if (!chatAttachments.length) return prompt;
  return `${prompt}\n\n附件：${chatAttachments.map((file) => file.name).join("、")}`;
}

async function initializeSharedHistory() {
  await migrateLegacyHistory();
  await Promise.all([renderImageHistory(), renderChatHistory()]);
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
  const article = document.createElement("article");
  article.className = `message ${role}`;

  const label = document.createElement("span");
  label.textContent = role === "user" ? "You" : role === "error" ? "Error" : "Assistant";

  const text = document.createElement("p");
  text.textContent = content;

  article.append(label, text);
  messagesEl.append(article);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setChatLoading(isLoading) {
  sendButton.disabled = isLoading;
  sendButton.textContent = isLoading ? "发送中" : "发送";
  if (isLoading) setChatStatus("正在请求 AI...");
}

function setImageLoading(isLoading) {
  generateButton.disabled = isLoading;
  if (isLoading) {
    generateButton.textContent = "生成中...";
  } else {
    updateGenerateButtonLabel();
  }
  if (isLoading) setImageStatus("正在生成图片...");
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

function setChatStatus(message) {
  chatStatusText.textContent = message;
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

function saveImageSettings() {
  localStorage.setItem(
    IMAGE_STORAGE_KEY,
    JSON.stringify({
      model: imageModelInput.value,
      size: imageSizeInput.value,
      resolution: imageResolutionInput.value,
      count: imageCountInput.value,
      remember: rememberImageInput.checked,
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
}

function getOutputSize() {
  return getScaledImageSizeByLongEdge(imageSizeInput.value, imageResolutionInput.value);
}

function getOutputQuality() {
  const model = String(imageModelInput.value || "").toLowerCase();
  const level = Number(imageResolutionInput.value || 1);
  return model === "gpt-image-2" && level >= 4 ? "high" : "auto";
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
