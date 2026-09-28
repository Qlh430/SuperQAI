"use strict";

/**
 * Server component composition root.
 *
 * server.js owns configuration, host services and the HTTP entry point; this
 * module owns the wiring between components. Everything it needs arrives in
 * `host`, and a Proxy guard turns a forgotten host entry into a loud
 * ReferenceError at boot instead of a silent `undefined` in production.
 */
function createServerComposition({ host = {} } = {}) {
  const guardedHost = new Proxy(host, {
    get(target, property) {
      if (typeof property === "string" && !Object.prototype.hasOwnProperty.call(target, property)) {
        throw new ReferenceError(`Server composition host is missing "${property}"`);
      }
      return target[property];
    },
  });

  const {
    AINB_IMAGE_MODEL_ALIAS,
    AI_OS_AUTH_DISABLED,
    AI_OS_SESSION_TTL_MS,
    APIMART_IMAGE_MODEL_ALIAS,
    API_KEY,
    API_VIDEO_POLL_MS,
    API_VIDEO_TASK_TIMEOUT_MS,
    API_VIDEO_WATCH_MAX_MS,
    API_VIDEO_WATCH_MS,
    BACKGROUND_REMOVAL_WORKFLOW_FILE,
    BACKUP_DIR,
    BUNDLED_SKILLS_DIR,
    CANVAS_AGENT_CONNECT_TIMEOUT_MS,
    CANVAS_AGENT_FIRST_EVENT_TIMEOUT_MS,
    CANVAS_AGENT_MAX_SESSIONS,
    CANVAS_AGENT_REASONING_EFFORT,
    CANVAS_AGENT_SESSION_TTL_MS,
    CANVAS_AGENT_TOTAL_TIMEOUT_MS,
    CANVAS_SKILLS_DIR,
    CHAT_HISTORY_FILE,
    CLSE_IMAGE_MODEL_ALIAS,
    COMFYUI_URL,
    COMFY_DOWNLOAD_TIMEOUT_MS,
    COMFY_POLL_TIMEOUT_MS,
    COMFY_PROMPT_TIMEOUT_MS,
    COMFY_UPLOAD_TIMEOUT_MS,
    CUSTOM_SKILLS_DIR,
    DISABLED_SERVER_COMPONENTS,
    CanvasAgentConversation,
    CanvasAgentRuntime,
    CanvasImageModelRouting,
    ComfyBackgroundRemoval,
    DATA_DIR,
    FLUX2_KLEIN_EDIT_WORKFLOW_FILE,
    IMAGE_CHAT_API_KEY,
    IMAGE_HISTORY_FILE,
    IMAGE_JOBS_FILE,
    IMAGE_JOB_TIMEOUT_MS,
    ImageResolutionRules,
    MAX_MEDIA_UPLOAD_BYTES,
    MAX_REQUEST_BYTES,
    MAX_SYNC_IMAGE_BYTES,
    MAX_UPLOAD_CHUNKS,
    MIDJOURNEY_IMAGE_MODEL_ALIAS,
    MINIMAX_H3_WORKFLOW_FILE,
    ONLINE_TTL_MS,
    OUTPAINT_WORKFLOW_FILE,
    OUTPUT_DIR,
    PORT,
    PROVIDER_MONITORING_FILE,
    PUBLIC_DIR,
    QWEN_EDIT_ANGLE_WORKFLOW_FILE,
    RUNNINGHUB_API_KEY,
    RUNNINGHUB_BASE_URL,
    RUNNINGHUB_OUTPAINT_WORKFLOW_FILE,
    RUNNINGHUB_OUTPAINT_WORKFLOW_ID,
    SHOE_SWAP_PROMPT,
    SHOE_SWAP_WORKFLOW_FILE,
    SYSTEM_DB_FILE,
    THUMBNAIL_REGISTRY_FILE,
    UPLOAD_TMP_DIR,
    UPLOAD_TMP_TTL_MS,
    UPSCALE2_WORKFLOW_FILE,
    UPSCALE_WORKFLOW_FILE,
    WORKFLOW_DIR,
    assertOutputMediaRead,
    buildChatCompletionMessages,
    buildOutputImagePath,
    canonicalOutputMedia,
    canvasAgentConversationStore,
    chatMessageService,
    chatSearchService,
    cleanupUpscaleTasks,
    collectComfyVideoOutputs,
    compactImageJobResponse,
    createAgentModelSettingsService,
    createApiVideoHttpService,
    createApiVideoTaskService,
    createAssetLibraryHttpApi,
    createAssetLibraryService,
    createAuthHttpApi,
    createAuthService,
    createBackgroundRemovalHttpApi,
    createBackupService,
    createCanvasAgentHttpApi,
    createCanvasAgentProviderBridge,
    createCanvasProjectHttpApi,
    createCanvasProjectService,
    createCanvasStorageHttpApi,
    createCapabilityResolver,
    createChatHttpApi,
    createComfyHttpApi,
    createComfyService,
    createComfyUiClient,
    createComfyWorkflowTaskService,
    createHistoryHttpApi,
    createImageGenerationHttpApi,
    createImageGenerationService,
    createImageJobHttpApi,
    createImageJobManager,
    createImageModelCatalog,
    createImageSyncHttpApi,
    createImageSyncService,
    createJimengCliService,
    createMediaGenerationHttpApi,
    createMediaHttpApi,
    createMediaProtocolAdapters,
    createMediaProviderBridge,
    createMinimaxH3TaskService,
    createOnlineHttpApi,
    createPreferencesHttpApi,
    createProtocolCenter,
    createProtocolEngine,
    createProtocolRegistry,
    createProviderBootstrapService,
    createProviderCatalogHttpApi,
    createProviderCatalogService,
    createProviderExecutor,
    createProviderHttpApi,
    createProviderSecretVault,
    createProviderStore,
    createProviderTelemetryService,
    createRemoteImageUrlValidator,
    createResourceAccess,
    createResourceHttpApi,
    createRunningHubOutpaintService,
    createServerComponentKernel,
    createServerThumbnailService,
    createSkillHttpApi,
    createSkillRegistry,
    createStaticHttpApi,
    createSystemDb,
    createSystemHttpApi,
    createThumbnailHttpApi,
    createThumbnailStore,
    crypto,
    dataUrlToFile,
    decodeHeaderFilename,
    ensurePngFilename,
    ensureReferencedResource,
    extractLatestUserText,
    fetch,
    formatErrorMessage,
    formatUpstreamError,
    fs,
    getCanvasStorage,
    getImageDimensionsFromBuffer,
    getImageReferenceDimensions,
    getLanUrls,
    getNanoBananaImageOptions,
    getOpenAIEditMaskRef,
    getSettingsResponse,
    getUserHistoryFile,
    hasVisionMessage,
    imageReferenceToFile,
    inferMediaMimeType,
    inspectComfyHistory,
    isAmbiguousSubmissionError,
    isMidjourneyImageModel,
    isSupportedMediaMime,
    isVideoMediaUrl,
    legacyCanvasAgentEnvironmentProviderForMigration,
    legacyEnvironmentProvidersForMigration,
    legacySettingsProvidersForMigration,
    makeCustomModelClientId,
    mediaFileService,
    mediaReferenceToFile,
    mediaTaskService,
    normalizeBoardId,
    normalizeMinimaxH3Request,
    outputMediaRef,
    prepareMinimaxH3Workflow,
    publicUser,
    readBodyBuffer,
    readJson,
    readResourcePreviewBoards,
    readResourcePreviewJobs,
    readSettingsFile,
    registerSavedMedia,
    registerServerComponents,
    registerVideoOutput,
    resolveResourcePreview,
    resolveResourceStats,
    sanitizeReferenceName,
    saveBinaryImage,
    saveBinaryMedia,
    saveGeneratedImages,
    saveRemoteVideo,
    sendJson,
    updateUpscaleTask,
    validateCanvasMediaReferences,
    waitForAbortableDelay,
  } = guardedHost;

  // The collaboration hub is created after the composition because it needs
  // the lazy canvas storage; components only reach it through this late binding.
  let canvasCollabHub = null;
  function setCanvasCollabHub(hub) {
    canvasCollabHub = hub;
  }

// 可选组件的构造同样要隔离：模块加载失败或工厂抛错时只让这个组件降级为
// "未安装"，而不是把整个进程拖死。主干组件不在此列，它们必须构造成功。
const disabledServerComponents = new Set(DISABLED_SERVER_COMPONENTS);
function createLazyValue(factory) {
  let initialized = false;
  let value;
  function getLazyValue() {
    if (initialized) return value;
    value = factory();
    initialized = true;
    return value;
  }
  getLazyValue.hasValue = () => initialized;
  getLazyValue.peek = () => initialized ? value : undefined;
  return getLazyValue;
}
const imageModelsInstanceId = crypto.randomUUID();
let imageModelsRevision = Date.now();

// 图片模型规则（家族 / 平台 / 分辨率档位 / 画布候选项）由独立组件拥有，
// 这里只注入读取器，server.js 不再自己实现模型判断逻辑。
const imageModelCatalog = createImageModelCatalog({
  imageResolutionRules: ImageResolutionRules,
  imageModelRouting: CanvasImageModelRouting,
  readSettings: () => readSettingsFile(),
  buildSettingsResponse: (settings) => getSettingsResponse(settings, {
    instanceId: imageModelsInstanceId,
    revision: imageModelsRevision,
  }),
  readTelemetryHistory: () => providerTelemetryService.readHistory(),
  makeCustomModelClientId,
  midjourneyImageModelAlias: MIDJOURNEY_IMAGE_MODEL_ALIAS,
  systemModelLabels: {
    [AINB_IMAGE_MODEL_ALIAS.toLowerCase()]: "gpt-image-2 \u00b7 ainb",
    [CLSE_IMAGE_MODEL_ALIAS.toLowerCase()]: "gpt-image-2 \u00b7 clse",
    [APIMART_IMAGE_MODEL_ALIAS.toLowerCase()]: "gpt-image-2 \u00b7 apimart",
    [MIDJOURNEY_IMAGE_MODEL_ALIAS]: "Midjourney",
    "gpt-image-2-vip-grsai": "gpt-image-2-vip \u00b7 grsai",
    "gpt-image-2-grsai": "gpt-image-2 \u00b7 grsai",
    "nano-banana-pro-grsai": "nano-banana-pro \u00b7 grsai",
    "nano-banana-2-grsai": "nano-banana-2 \u00b7 grsai",
  },
});
const {
  normalizeImageResolutions,
  normalizeImagePlatform,
  normalizeImageModelFamily,
  getImageModelFamily,
  getImageModelPlatform,
  validateImageOutputRequest,
  resolveCustomModel,
} = imageModelCatalog;

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(WORKFLOW_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_TMP_DIR, { recursive: true });
const systemDb = createSystemDb({ dbPath: SYSTEM_DB_FILE });
systemDb.migrate();
// This service owns an AI OS-local CLI home. It never reads DX OS data or
// imports sessions from another application.
const jimengCliService = createJimengCliService({ dataDir: DATA_DIR, settings: systemDb });
const authService = createAuthService({
  db: systemDb,
  sessionTtlMs: AI_OS_SESSION_TTL_MS,
});
let authDisabledUser = null;
if (AI_OS_AUTH_DISABLED) {
  authDisabledUser = systemDb.listUsers().find((user) => user.role === "superadmin") || systemDb.insertUser({
    id: "legacy-test-superadmin",
    username: "legacy-test-superadmin",
    displayName: "Legacy test superadmin",
    passwordHash: "authentication-disabled",
    role: "superadmin",
    status: "active",
    mustChangePassword: false,
  });
}
const authHttpApi = createAuthHttpApi({
  authService,
  systemDb,
  sessionTtlMs: AI_OS_SESSION_TTL_MS,
  authDisabled: AI_OS_AUTH_DISABLED,
  getAuthDisabledUser: () => authDisabledUser,
  readJson,
  sendJson,
});
const {
  getAuthContext,
  requireAuth,
  requireSuperAdmin,
  sendAuthError,
} = authHttpApi;
const preferencesHttpApi = createPreferencesHttpApi({
  systemDb,
  readJson,
  sendJson,
  requireSuperAdmin,
});
const staticHttpApi = createStaticHttpApi({
  publicDir: PUBLIC_DIR,
  outputDir: OUTPUT_DIR,
  mimeTypes: mediaFileService.mimeTypes,
  authDisabled: AI_OS_AUTH_DISABLED,
  getAuthDisabledUser: () => authDisabledUser,
  publicUser,
  requireAuth,
  assertOutputMediaRead,
  sendJson,
  sendAuthError,
});
const resourceAccess = createResourceAccess({ db: systemDb });
const canvasProjectService = createCanvasProjectService({ db: systemDb });
const assetLibrary = createAssetLibraryService({ db: systemDb, resourceAccess, projectService: canvasProjectService });
const backupService = createBackupService({ db: systemDb, dataDir: DATA_DIR, backupDir: BACKUP_DIR });
const systemHttpApi = createSystemHttpApi({
  dataDir: DATA_DIR,
  port: PORT,
  getLanUrls,
  getAuthContext,
  publicUser,
  authDisabled: AI_OS_AUTH_DISABLED,
  getAuthDisabledUser: () => authDisabledUser,
  systemDb,
  requireSuperAdmin,
  backupService,
  readJson,
  sendJson,
  appendAudit: (entry) => systemDb.appendAudit(entry),
  getServerComponents: () => serverComponents.getState(),
});
const providerSecretVault = createProviderSecretVault({ dataDir: DATA_DIR });
const getComfyService = createLazyValue(() => createComfyService({
  settings: systemDb,
  defaultUrl: COMFYUI_URL,
  // Keep legacy IDs/models and encrypted fields intact; the new page owns connection settings.
  getConnections: () => systemDb.listProviderRecords().filter(provider => provider.providerProtocol === "comfyui"),
  updateConnection: (id, baseUrl) => {
    const provider = systemDb.getProviderRecord(id);
    if (!provider || provider.providerProtocol !== "comfyui") {
      throw Object.assign(new Error("所选 ComfyUI 连接已不存在，请刷新设置。"), { code: "comfy_connection_missing", statusCode: 409 });
    }
    systemDb.saveProviderRecord({ ...provider, baseUrl, metadata: { ...provider.metadata, networkMode: "direct" } });
  },
}));
const getComfyClient = createLazyValue(() => createComfyUiClient({
  getDefaultUrl: () => getComfyService().resolveUrl(),
  fetchImpl: fetch,
  imageReferenceToFile,
  outputDir: OUTPUT_DIR,
  inspectHistory: inspectComfyHistory,
  collectVideoOutputs: collectComfyVideoOutputs,
  formatErrorMessage,
  promptTimeoutMs: COMFY_PROMPT_TIMEOUT_MS,
  pollTimeoutMs: COMFY_POLL_TIMEOUT_MS,
  uploadTimeoutMs: COMFY_UPLOAD_TIMEOUT_MS,
  downloadTimeoutMs: COMFY_DOWNLOAD_TIMEOUT_MS,
  crypto,
  fs,
}));
const getComfyWorkflowTaskService = createLazyValue(() => createComfyWorkflowTaskService({
  mediaTaskService,
  workflowFiles: {
    ttp: UPSCALE_WORKFLOW_FILE,
    seedvr2: UPSCALE2_WORKFLOW_FILE,
    shoeSwap: SHOE_SWAP_WORKFLOW_FILE,
    outpaint: OUTPAINT_WORKFLOW_FILE,
    runninghubOutpaint: RUNNINGHUB_OUTPAINT_WORKFLOW_FILE,
    flux2KleinEdit: FLUX2_KLEIN_EDIT_WORKFLOW_FILE,
    qwenEditAngle: QWEN_EDIT_ANGLE_WORKFLOW_FILE,
    removeBackground: BACKGROUND_REMOVAL_WORKFLOW_FILE,
  },
  comfyClient: getComfyClient(),
  comfyBackgroundRemoval: ComfyBackgroundRemoval,
  getImageReferenceDimensions,
  runRunningHubOutpaintTask: (taskId, payload) => getRunningHubOutpaintService().runOutpaintTask(taskId, payload),
  readJson,
  sendJson,
  formatErrorMessage,
  shoeSwapPrompt: SHOE_SWAP_PROMPT,
  shoeSwapApiKey: IMAGE_CHAT_API_KEY || API_KEY,
  crypto,
  fs,
}));
const getRunningHubOutpaintService = createLazyValue(() => createRunningHubOutpaintService({
  updateTask: updateUpscaleTask,
  imageReferenceToFile,
  fetchImpl: fetch,
  normalizeOutpaintPadding: getComfyWorkflowTaskService().normalizeOutpaintPadding,
  outputDir: OUTPUT_DIR,
  baseUrl: RUNNINGHUB_BASE_URL,
  apiKey: RUNNINGHUB_API_KEY,
  workflowId: RUNNINGHUB_OUTPAINT_WORKFLOW_ID,
  formatErrorMessage,
  crypto,
  fs,
}));
const getMinimaxH3TaskService = createLazyValue(() => createMinimaxH3TaskService({
  mediaTaskService,
  updateTask: updateUpscaleTask,
  cleanupTasks: cleanupUpscaleTasks,
  workflowFile: MINIMAX_H3_WORKFLOW_FILE,
  normalizeRequest: normalizeMinimaxH3Request,
  prepareWorkflow: prepareMinimaxH3Workflow,
  sanitizeReferenceName,
  mediaReferenceToFile,
  comfyClient: getComfyClient(),
  formatErrorMessage,
  makeUploadToken: getComfyWorkflowTaskService().makeUploadToken,
  makeUploadFilename: getComfyWorkflowTaskService().makeUploadFilename,
  crypto,
  fs,
}));
const providerProtocolRegistry = createProtocolRegistry({
  adapters: createMediaProtocolAdapters({
    executeComfyVideo: (...args) => getMinimaxH3TaskService().executeComfyVideoProvider(...args),
    jimengCliService,
  }),
  getCustomProtocols: () => systemDb.getSetting("custom_protocols") || [],
});
const providerStore = createProviderStore({ db: systemDb, vault: providerSecretVault, registry:providerProtocolRegistry });
const providerTelemetryService = createProviderTelemetryService({
  filePath: PROVIDER_MONITORING_FILE,
  fs,
  providerStore,
});
const providerBootstrapService = createProviderBootstrapService({
  providerStore,
  secretVault: providerSecretVault,
  systemDb,
  createSnapshot: () => backupService.createSnapshot({ includeMedia: false }),
  getLegacySettingsProviders: legacySettingsProvidersForMigration,
  getLegacyEnvironmentProviders: legacyEnvironmentProvidersForMigration,
  getLegacyAgentProvider: legacyCanvasAgentEnvironmentProviderForMigration,
  getLocalVideoProvider: () => ({
    id: "local-comfyui",
    name: "本机 ComfyUI",
    baseUrl: COMFYUI_URL,
    protocol: "comfyui",
    source: "local",
    enabled: true,
    models: [{
      id: "minimax-h3",
      displayName: "MiniMax H3",
      protocol: "comfyui",
      capabilities: ["video.generate"],
    }],
  }),
});
const getProviderSubsystemError = () => providerBootstrapService.getSubsystemError();
const providerCatalogService = createProviderCatalogService({
  providerStore,
  telemetryService: providerTelemetryService,
  getProviderSubsystemError,
  imageCatalog: imageModelCatalog,
});
const {
  getPublicProviderModelCatalog,
  findPublicProviderCatalogModel,
  providerExecutionHttpStatus,
} = providerCatalogService;
const createProviderCatalogHttpApiComponent = () => createProviderCatalogHttpApi({
  getPublicProviderModelCatalog,
  providerExecutionHttpStatus,
  readCatalogIdentity: () => ({
    instanceId: imageModelsInstanceId,
    revision: imageModelsRevision,
  }),
  sendJson,
});
const createComfyHttpApiComponent = () => createComfyHttpApi({
  service: getComfyService(),
  requireAdmin: requireSuperAdmin,
  sendJson,
  appendAudit: entry => systemDb.appendAudit(entry),
});
const providerProtocolEngine = createProtocolEngine({
  registry: providerProtocolRegistry,
  outboundFetch: fetch,
});
const providerCapabilityResolver = createCapabilityResolver({
  store: providerStore,
  candidateHealth: providerTelemetryService.getCandidateHealth,
});
const getAgentModelSettings = createLazyValue(() => createAgentModelSettingsService({
  db: systemDb,
  store: providerStore,
}));
const getSkillRegistry = createLazyValue(() => createSkillRegistry({
  dataDir: DATA_DIR,
  systemDir: CANVAS_SKILLS_DIR,
  bundledCustomDir: BUNDLED_SKILLS_DIR,
  customDir: CUSTOM_SKILLS_DIR,
}));
// 本地 AI 抠图：不依赖 ComfyUI 与显卡，权重跟着应用内置分发（assets/models/background-removal）。
const createBackgroundRemovalHttpApiComponent = () => {
  const { createBackgroundRemovalService } = require("../background-removal-service");
  const service = createBackgroundRemovalService({ dataDir: DATA_DIR, fetchImpl: fetch });
  return createBackgroundRemovalHttpApi({
    service,
    readJson,
    sendJson,
    imageReferenceToFile,
    saveBinaryImage,
    registerSavedMedia,
    formatErrorMessage,
  });
};
const getProviderExecutor = createLazyValue(() => createProviderExecutor({
  resolver: providerCapabilityResolver,
  engine: providerProtocolEngine,
  jimengCli: jimengCliService,
  onAttemptResult: ({ provider, model, intent, success, latencyMs, error }) => {
    const value = String(intent || "");
    if (!value.startsWith("llm.") && !value.startsWith("image.")) return;
    providerTelemetryService.recordUsageEvent(provider, {
      kind: value === "llm.tools" ? "agent" : value.startsWith("llm.") ? "chat" : "image",
      model: model?.id,
      success,
      latencyMs,
      httpStatus: error?.statusCode || error?.httpStatus || 0,
      message: success ? "" : `${error?.code || ""} ${error?.safeMessage || error?.message || ""}`.trim(),
    });
  },
}));
const getCanvasAgentProviderBridge = createLazyValue(() => createCanvasAgentProviderBridge({
  executor: getProviderExecutor(),
}));
const getMediaProviderBridge = createLazyValue(() => createMediaProviderBridge({
  executor: getProviderExecutor(),
}));
const getImageGenerationService = createLazyValue(() => createImageGenerationService({
  routing: CanvasImageModelRouting,
  getPublicProviderModelCatalog,
  findPublicProviderCatalogModel,
  isMidjourneyImageModel,
  validateImageOutputRequest,
  mediaProviderBridge: getMediaProviderBridge(),
  getNanoBananaImageOptions,
  imageReferenceToFile,
  getOpenAIEditMaskRef,
  ensurePngFilename,
  saveGeneratedImages: (data, options) => saveGeneratedImages(data, options),
  providerExecutionHttpStatus,
  isAmbiguousSubmissionError,
}));
const createProviderHttpApiComponent = () => createProviderHttpApi({
  store: providerStore,
  registry: providerProtocolRegistry,
  engine: providerProtocolEngine,
  jimengCli: jimengCliService,
  protocolCenter: createProtocolCenter({ db:systemDb, store:providerStore, registry:providerProtocolRegistry, resolver:providerCapabilityResolver, engine:providerProtocolEngine }),
  requireSignedIn: async (req) => {
    const auth = req.auth || await getAuthContext(req);
    if (!auth) {
      const error = new Error("Authentication required");
      error.code = "unauthorized";
      error.statusCode = 401;
      throw error;
    }
    return auth;
  },
  requireRole: (auth, role) => authService.requireRole(auth, role),
  readJson,
  sendJson,
  appendAudit: (entry) => systemDb.appendAudit(entry),
  onCatalogChange: () => {
    imageModelsRevision += 1;
    return imageModelsRevision;
  },
  readCatalogRevision: () => imageModelsRevision,
  agentModelSettings: getAgentModelSettings(),
  assertAvailable: () => {
    const providerSubsystemError = getProviderSubsystemError();
    if (!providerSubsystemError) return true;
    const error = new Error("模型服务凭据暂时锁定，请从包含 Provider 主密钥的完整备份恢复。");
    error.code = String(providerSubsystemError?.code || "PROVIDER_SUBSYSTEM_LOCKED");
    error.statusCode = 503;
    throw error;
  },
});
const createSkillHttpApiComponent = () => createSkillHttpApi({
  skillRegistry: getSkillRegistry(),
  agentModelSettings: getAgentModelSettings(),
  canvasAgentRuntime: CanvasAgentRuntime,
  capabilityResolver: providerCapabilityResolver,
  requireSuperAdmin,
  readJson,
  sendJson,
  appendAudit: entry => systemDb.appendAudit(entry),
});
const createResourceHttpApiComponent = () => createResourceHttpApi({
  resourceAccess,
  getShareForResource: (resourceId) => systemDb.getShareForResource(resourceId),
  readJson,
  sendJson,
  sendError: sendAuthError,
  readPreviewJobs: readResourcePreviewJobs,
  readPreviewBoards: readResourcePreviewBoards,
  resolvePreview: resolveResourcePreview,
  resolveStats: resolveResourceStats,
});
const createAssetLibraryHttpApiComponent = () => createAssetLibraryHttpApi({
  assetLibrary,
  readJson,
  sendJson,
  readBodyBuffer,
  decodeHeaderFilename,
  inferMediaMimeType,
  isSupportedMediaMime,
  maxMediaUploadBytes: MAX_MEDIA_UPLOAD_BYTES,
  saveBinaryMedia,
});
const createMediaHttpApiComponent = () => createMediaHttpApi({
  uploadTmpDir: UPLOAD_TMP_DIR,
  maxRequestBytes: MAX_REQUEST_BYTES,
  maxMediaUploadBytes: MAX_MEDIA_UPLOAD_BYTES,
  maxUploadChunks: MAX_UPLOAD_CHUNKS,
  uploadTmpTtlMs: UPLOAD_TMP_TTL_MS,
  readBodyBuffer,
  readJson,
  sendJson,
  registerSavedMedia,
  saveBinaryImage,
  saveBinaryMedia,
  dataUrlToFile,
  buildOutputImagePath,
  inferMediaMimeType,
  isSupportedMediaMime,
  formatErrorMessage,
});
const createCanvasProjectHttpApiComponent = () => createCanvasProjectHttpApi({
  db: systemDb,
  projectService: canvasProjectService,
  getCanvasStorage,
  readJson,
  sendJson,
});
const createCanvasStorageHttpApiComponent = () => createCanvasStorageHttpApi({
  getCanvasStorage,
  projectService: canvasProjectService,
  db: systemDb,
  resourceAccess,
  ensureReferencedResource,
  validateCanvasMediaReferences,
  getCanvasCollabHub: () => canvasCollabHub,
  readJson,
  sendJson,
  publicUser,
});
const createCanvasAgentHttpApiComponent = () => createCanvasAgentHttpApi({
  CanvasAgentConversation,
  conversationStore: canvasAgentConversationStore,
  normalizeBoardId,
  CanvasAgentRuntime,
  skillRegistry: getSkillRegistry(),
  agentModelSettings: getAgentModelSettings(),
  canvasAgentProviderBridge: getCanvasAgentProviderBridge(),
  ensureReferencedResource,
  resourceAccess,
  readJson,
  sendJson,
  maxSessions: CANVAS_AGENT_MAX_SESSIONS,
  sessionTtlMs: CANVAS_AGENT_SESSION_TTL_MS,
  connectTimeoutMs: CANVAS_AGENT_CONNECT_TIMEOUT_MS,
  firstEventTimeoutMs: CANVAS_AGENT_FIRST_EVENT_TIMEOUT_MS,
  totalTimeoutMs: CANVAS_AGENT_TOTAL_TIMEOUT_MS,
  reasoningEffort: CANVAS_AGENT_REASONING_EFFORT,
});
const thumbnailStore = createThumbnailStore({
  outputDir: OUTPUT_DIR,
  dataFile: THUMBNAIL_REGISTRY_FILE,
  maxBytes: 2 * 1024 * 1024,
});
const createThumbnailHttpApiComponent = () => {
  const serverThumbnails = createServerThumbnailService({
    store: thumbnailStore,
    resolveSourcePath: (source) => {
      const media = canonicalOutputMedia(source);
      return media ? staticHttpApi.resolveOutputPath(media.url) : "";
    },
  });
  return createThumbnailHttpApi({
    thumbnailStore,
    serverThumbnails,
    assertOutputMediaRead,
    readBodyBuffer,
    registerSavedMedia,
    sendJson,
    sendError: sendAuthError,
  });
};
const getImageSyncService = createLazyValue(() => createImageSyncService({
  outputDir: OUTPUT_DIR,
  fetchImpl: fetch,
  validateRemoteUrl: createRemoteImageUrlValidator(),
  maxImageBytes: MAX_SYNC_IMAGE_BYTES,
  inspectBuffer: getImageDimensionsFromBuffer,
}));
const createImageSyncHttpApiComponent = () => createImageSyncHttpApi({
  imageSyncService: getImageSyncService(),
  readJson,
  sendJson,
});
const createImageJobHttpApiComponent = () => {
  const imageJobManager = createImageJobManager({
    filePath: IMAGE_JOBS_FILE,
    timeoutMs: IMAGE_JOB_TIMEOUT_MS,
    execute: async (payload, context) => {
      const response = await getImageGenerationService().execute(payload, {
        signal: context.signal,
        preserveRemoteOnSyncFailure: true,
        preserveAmbiguousSubmissionFailure: true,
        onTaskSubmitted: (remoteTask) => context.report("running", { remoteTask }),
        onRemoteResult: (body) => context.report("syncing", {
          remoteResult: compactImageJobResponse(body),
        }),
      });
      return {
        ...response,
        body: response.status >= 200 && response.status < 300
          ? compactImageJobResponse(response.body)
          : response.body,
      };
    },
    recoverTask: async (remoteTask, context) => getImageGenerationService().execute({
      model: context.model,
      providerId: remoteTask.providerId,
      modelId: remoteTask.modelId,
      prompt: "恢复已提交的图片任务",
    }, {
      signal: context.signal,
      resumeTask: remoteTask,
      preserveRemoteOnSyncFailure: true,
      preserveAmbiguousSubmissionFailure: true,
      onRemoteResult: (body) => context.report("syncing", { remoteResult: compactImageJobResponse(body) }),
    }),
    recover: async (result, context) => {
      const synchronized = await getImageSyncService().recover(result?.data || [], { signal: context.signal });
      return {
        status: 200,
        body: compactImageJobResponse({
          ...result,
          data: synchronized.data,
          saved_images: synchronized.savedImages,
          code: "",
          sync_error: "",
        }),
      };
    },
  });
  return createImageJobHttpApi({
    imageJobManager,
    normalizeBoardId,
    resourceAccess,
    getCanvasStorage,
    getResourceByRef: (type, refId) => systemDb.getResourceByRef(type, refId),
    registerMedia: (userId, saved, mimeType, options) => assetLibrary.registerMedia(userId, saved, mimeType, options),
    outputMediaRef,
    ensureReferencedResource,
    formatUpstreamError,
    readJson,
    sendJson,
  });
};
const createHistoryHttpApiComponent = () => createHistoryHttpApi({
  imageHistoryFile: IMAGE_HISTORY_FILE,
  chatHistoryFile: CHAT_HISTORY_FILE,
  resolveHistoryFile: getUserHistoryFile,
  ensureReferencedResource,
  getResourceByRef: (type, refId) => systemDb.getResourceByRef(type, refId),
  deleteResource: (resourceId) => systemDb.deleteResource(resourceId),
  readJson,
  sendJson,
});
const createImageGenerationHttpApiComponent = () => createImageGenerationHttpApi({
  executeImageGenerationPayload: (...args) => getImageGenerationService().execute(...args),
  registerSavedMedia,
  formatUpstreamError,
  readJson,
  sendJson,
});
const getApiVideoTaskService = createLazyValue(() => createApiVideoTaskService({
  mediaTaskService,
  mediaProviderBridge: getMediaProviderBridge(),
  updateTask: updateUpscaleTask,
  isVideoMediaUrl,
  saveRemoteVideo: (remoteUrl, prefix) => saveRemoteVideo(remoteUrl, prefix, {
    timeoutMs: COMFY_DOWNLOAD_TIMEOUT_MS,
  }),
  registerVideoOutput,
  waitForAbortableDelay,
  formatErrorMessage,
  sendJson,
  pollMs: API_VIDEO_POLL_MS,
  taskTimeoutMs: API_VIDEO_TASK_TIMEOUT_MS,
  watchMs: API_VIDEO_WATCH_MS,
  watchMaxMs: API_VIDEO_WATCH_MAX_MS,
}));
const createMediaGenerationHttpApiComponent = () => {
  const apiVideoTaskService = getApiVideoTaskService();
  const apiVideoHttpService = createApiVideoHttpService({
    mediaTaskService,
    mediaProviderBridge: getMediaProviderBridge(),
    taskService: apiVideoTaskService,
    readJson,
    sendJson,
    getPublicProviderModelCatalog,
    findPublicProviderCatalogModel,
    imageReferenceToFile,
    cleanupTasks: cleanupUpscaleTasks,
    isVideoMediaUrl,
    saveRemoteVideo: (remoteUrl, prefix) => saveRemoteVideo(remoteUrl, prefix, {
      timeoutMs: COMFY_DOWNLOAD_TIMEOUT_MS,
    }),
    registerVideoOutput,
    providerExecutionHttpStatus,
    formatErrorMessage,
    crypto,
  });
  return createMediaGenerationHttpApi({
    handleApiVideo: apiVideoHttpService.handleSubmit,
    handleApiVideoResume: apiVideoTaskService.handleResume,
    handleMinimaxH3Video: (req, res) => getMinimaxH3TaskService().handleVideoRequest(req, res, {
      readJson,
      sendJson,
      generateVideo: getMediaProviderBridge().generateVideo,
      getDefaultProviderId: () => getComfyService().configuration().config.providerId,
    }),
    handleUpscale: getComfyWorkflowTaskService().handleUpscale,
    handleUpscaleStatus: getComfyWorkflowTaskService().handleUpscaleStatus,
  });
};
async function closeComfyService() {
  if (!getComfyService.hasValue()) return;
  await getComfyService().close();
}
const createOnlineHttpApiComponent = () => createOnlineHttpApi({
  ttlMs: ONLINE_TTL_MS,
  readJson,
  sendJson,
});
const createChatHttpApiComponent = () => createChatHttpApi({
  getProviderSubsystemError,
  readJson,
  sendJson,
  performWebSearch: chatSearchService.performWebSearch,
  extractLatestUserText,
  buildDirectWeatherAnswer: chatSearchService.buildDirectWeatherAnswer,
  formatUpstreamError,
  buildChatCompletionMessages,
  hasVisionMessage,
  getPublicProviderModelCatalog,
  findPublicProviderCatalogModel,
  providerExecutor: getProviderExecutor(),
  normalizeChatImageResponse: getImageGenerationService().normalizeChatImageResponse,
  saveGeneratedImages,
  providerExecutionHttpStatus,
});
const serverComponents = createServerComponentKernel();
const serverComponentRegistration = registerServerComponents({
  kernel: serverComponents,
  disabled: [...disabledServerComponents],
  sendJson,
  instances: {
    "provider-telemetry-service": providerTelemetryService,
    "provider-bootstrap-service": providerBootstrapService,
    "provider-catalog-service": providerCatalogService,
    "chat-message-service": chatMessageService,
    "static-http-api": staticHttpApi,
    "system-http-api": systemHttpApi,
    "auth-http-api": authHttpApi,
    "preferences-http-api": preferencesHttpApi,
    "provider-catalog-http-api": createProviderCatalogHttpApiComponent,
    "provider-http-api": createProviderHttpApiComponent,
    "comfyui-http-api": createComfyHttpApiComponent,
    "skill-http-api": createSkillHttpApiComponent,
    "background-removal-http-api": createBackgroundRemovalHttpApiComponent,
    "image-model-catalog": imageModelCatalog,
    "image-generation-http-api": createImageGenerationHttpApiComponent,
    "media-generation-http-api": createMediaGenerationHttpApiComponent,
    "online-http-api": createOnlineHttpApiComponent,
    "resource-http-api": createResourceHttpApiComponent,
    "media-http-api": createMediaHttpApiComponent,
    "image-sync-http-api": createImageSyncHttpApiComponent,
    "image-job-http-api": createImageJobHttpApiComponent,
    "asset-library-http-api": createAssetLibraryHttpApiComponent,
    "canvas-project-http-api": createCanvasProjectHttpApiComponent,
    "canvas-storage-http-api": createCanvasStorageHttpApiComponent,
    "canvas-agent-http-api": createCanvasAgentHttpApiComponent,
    "chat-http-api": createChatHttpApiComponent,
    "history-http-api": createHistoryHttpApiComponent,
    "thumbnail-http-api": createThumbnailHttpApiComponent,
  },
});

{
  const { pruned, disabled, unavailable, failed } = serverComponentRegistration;
  if (pruned.length || disabled.length) {
    console.warn(`[server-component] pruned: ${pruned.join(", ") || "-"}; disabled: ${disabled.join(", ") || "-"}`);
  }
  if (unavailable.length) {
    console.warn(`[server-component] pruned component routes answer 503: ${unavailable.join(", ")}`);
  }
  for (const { id, error } of failed) {
    console.warn(`[server-component] ${id} degraded after construction failure: ${error?.message || error}`);
  }
}

  return Object.freeze({
    systemDb,
    jimengCliService,
    authDisabledUser,
    authHttpApi,
    staticHttpApi,
    resourceAccess,
    assetLibrary,
    closeComfyService,
    thumbnailStore,
    getImageSyncService,
    getApiVideoTaskService,
    serverComponents,
    serverComponentRegistration,
    getAuthContext,
    requireAuth,
    requireSuperAdmin,
    getImageModelFamily,
    normalizeImageModelFamily,
    normalizeImagePlatform,
    normalizeImageResolutions,
    resolveCustomModel,
    setCanvasCollabHub,
  });
}

module.exports = { createServerComposition };
