const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { createServerComponentKernel } = require("./core/server-component-kernel");
const { registerServerComponents } = require("./server-components");
const { createServerComposition } = require("./server-components/composition");
const ImageResolutionRules = require("./image-resolution-rules");
const CanvasImageModelRouting = require("./image-model-routing");
const { createThumbnailStore } = require("./image-thumbnail-store");
const { createServerThumbnailService } = require("./server-image-thumbnails");
const { collectOutputMediaUrls, deleteUnreferencedOutputMedia } = require("./canvas-media-cleanup");
const { createProxyAwareFetch } = require("./outbound-fetch");
const { createOutboundRoutePolicy, normalizeRouteMode } = require("./outbound-route-policy");
const { createOutboundRouteStateStore } = require("./outbound-route-state");
const { createImageSyncService, createRemoteImageUrlValidator } = require("./image-sync-service");
const CanvasAgentRuntime = require("./canvas-agent-runtime");
const CanvasAgentRouter = require("./canvas-agent-router");
const CanvasAgentConversation = require("./canvas-agent-conversation");
const { createCanvasAgentConversationStore, normalizeBoardId } = require("./canvas-agent-conversation-store");
const { createImageJobManager, isAmbiguousSubmissionError } = require("./image-job-manager");
const { createSystemDb } = require("./system-db");
const { createCanvasProjectService } = require("./canvas-project-service");
const { createCanvasCollabHub } = require("./canvas-collab-hub");
const { createAssetLibraryService, outputMediaRef } = require("./asset-library-service");
const { collectMediaReferences } = require("./canvas-media-references");
const { createAuthService, publicUser } = require("./auth-service");
const { createAuthHttpApi } = require("./auth-http-api");
const { createPreferencesHttpApi } = require("./preferences-http-api");
const { createProviderCatalogHttpApi } = require("./provider-catalog-http-api");
const {
  createProviderCatalogService,
  makeCustomModelClientId,
  normalizeModelPrice,
} = require("./provider-catalog-service");
const { createStaticHttpApi } = require("./static-http-api");
const { createResourceAccess, publicAccess } = require("./resource-access");
const { resolveResourcePreview, resolveResourceStats } = require("./resource-preview");
const { createBackupService } = require("./backup-service");
const { createSystemHttpApi } = require("./system-http-api");
const { createProviderSecretVault } = require("./provider-secret-vault");
const { createProviderStore } = require("./provider-store");
const { createProviderBootstrapService } = require("./provider-bootstrap-service");
const { createProtocolRegistry } = require("./provider-protocol-registry");
const { createProtocolEngine } = require("./provider-protocol-engine");
const { createCapabilityResolver } = require("./provider-capability-resolver");
const { createProviderExecutor } = require("./provider-executor");
const { createAgentModelSettingsService } = require("./agent-model-settings");
const { createSkillRegistry } = require("./skill-registry");
const { createCanvasAgentProviderBridge } = require("./canvas-agent-provider-bridge");
const { createMediaProviderBridge } = require("./media-provider-bridge");
const { createImageGenerationService } = require("./image-generation-service");
const { createImageProviderRequestRules } = require("./image-provider-request-rules");
const { createServerSettingsService } = require("./server-settings-service");
const { createBackgroundRemovalHttpApi } = require("./background-removal-http-api");
const { createSkillHttpApi } = require("./skill-http-api");
const { createResourceHttpApi } = require("./resource-http-api");
const { createAssetLibraryHttpApi } = require("./asset-library-http-api");
const { createCanvasProjectHttpApi } = require("./canvas-project-http-api");
const { createCanvasStorageHttpApi } = require("./canvas-storage-http-api");
const { createCanvasAgentHttpApi } = require("./canvas-agent-http-api");
const { createThumbnailHttpApi } = require("./thumbnail-http-api");
const { createMediaHttpApi } = require("./media-http-api");
const { createImageSyncHttpApi } = require("./image-sync-http-api");
const { createImageJobHttpApi } = require("./image-job-http-api");
const { createHistoryHttpApi } = require("./history-http-api");
const { createImageGenerationHttpApi } = require("./image-generation-http-api");
const { createMediaGenerationHttpApi } = require("./media-generation-http-api");
const { createMediaTaskService } = require("./media-task-service");
const { createMediaFileService } = require("./media-file-service");
const { createApiVideoTaskService } = require("./api-video-task-service");
const { createApiVideoHttpService } = require("./api-video-http-service");
const { createMinimaxH3TaskService } = require("./minimax-h3-task-service");
const { createComfyUiClient } = require("./comfyui-client");
const { createComfyWorkflowTaskService } = require("./comfy-workflow-task-service");
const { createRunningHubOutpaintService } = require("./runninghub-outpaint-service");
const { createOnlineHttpApi } = require("./online-http-api");
const { createChatHttpApi } = require("./chat-http-api");
const { createChatMessageService } = require("./chat-message-service");
const { createChatSearchService } = require("./chat-search-service");
const { createImageModelCatalog } = require("./image-model-catalog");
const ComfyBackgroundRemoval = require("./comfyui-background-removal");
const { createMediaProtocolAdapters } = require("./media-protocol-adapters");
const { createJimengCliService } = require("./jimeng-cli-service");
const { createComfyService } = require("./comfyui-service");
const { createComfyHttpApi } = require("./comfyui-http-api");
const { createProviderHttpApi } = require("./provider-http-api");
const { createProtocolCenter } = require("./protocol-center");
const { createProviderTelemetryService } = require("./provider-telemetry-service");
const {
  normalizeMinimaxH3Request,
  prepareMinimaxH3Workflow,
  collectComfyVideoOutputs,
  inspectComfyHistory,
  sanitizeReferenceName,
} = require("./minimax-h3-workflow");
const {
  createServerConfig,
  normalizeApiUrl,
  normalizeGrsaiImageApiUrl,
  normalizeGrsaiImageResultApiUrl,
  normalizeImageApiUrl,
  normalizeImageEditApiUrl,
  normalizeMidjourneyApiUrl,
} = require("./server-config");

const SERVER_CONFIG = createServerConfig({
  rootDir: __dirname,
  normalizeAgentApiUrl: CanvasAgentRuntime.normalizeResponsesApiUrl,
});
const {
  AINB_IMAGE_API_KEY,
  AINB_IMAGE_API_URL,
  AINB_IMAGE_EDIT_API_URL,
  AINB_IMAGE_MODEL_ALIAS,
  AI_OS_AUTH_DISABLED,
  AI_OS_SESSION_TTL_MS,
  API_KEY,
  API_URL,
  API_VIDEO_POLL_MS,
  API_VIDEO_TASK_TIMEOUT_MS,
  API_VIDEO_TASKS_FILE,
  API_VIDEO_WATCH_MAX_MS,
  API_VIDEO_WATCH_MS,
  APIMART_IMAGE_API_KEY,
  APIMART_IMAGE_API_URL,
  APIMART_IMAGE_MODEL_ALIAS,
  APIMART_IMAGE_TASK_API_URL,
  APIMART_IMAGE_UPSTREAM_MODEL,
  AVAILABLE_IMAGE_MODELS,
  AVAILABLE_MODELS,
  BACKGROUND_REMOVAL_WORKFLOW_FILE,
  BACKUP_DIR,
  BUNDLED_SKILLS_DIR,
  BAILIAN_API_KEY,
  BAILIAN_API_URL,
  BAILIAN_MODELS,
  CANVAS_AGENT_API_KEY,
  CANVAS_AGENT_API_URL,
  CANVAS_AGENT_CONNECT_TIMEOUT_MS,
  CANVAS_AGENT_CONVERSATIONS_FILE,
  CANVAS_AGENT_FIRST_EVENT_TIMEOUT_MS,
  CANVAS_AGENT_MAX_SESSIONS,
  CANVAS_AGENT_MODEL,
  CANVAS_AGENT_REASONING_EFFORT,
  CANVAS_AGENT_SESSION_TTL_MS,
  CANVAS_AGENT_TIMEOUT_MS,
  CANVAS_AGENT_TOTAL_TIMEOUT_MS,
  CANVAS_BACKUP_DIR,
  CANVAS_BOARDS_FILE,
  CANVAS_DB_FILE,
  CANVAS_SKILLS_DIR,
  CHAT_HISTORY_FILE,
  CLSE_IMAGE_API_KEY,
  CLSE_IMAGE_API_URL,
  CLSE_IMAGE_EDIT_API_URL,
  CLSE_IMAGE_MODEL_ALIAS,
  CLSE_IMAGE_UPSTREAM_MODEL,
  COMFYUI_URL,
  COMFY_DOWNLOAD_TIMEOUT_MS,
  COMFY_POLL_TIMEOUT_MS,
  COMFY_PROMPT_TIMEOUT_MS,
  COMFY_UPLOAD_TIMEOUT_MS,
  CUSTOM_SKILLS_DIR,
  DATA_DIR,
  DEFAULT_MODEL,
  DISABLED_SERVER_COMPONENTS,
  FLUX2_KLEIN_EDIT_WORKFLOW_FILE,
  GEMINI_API_KEY,
  GEMINI_API_URL,
  GEMINI_MODELS,
  GRSAI_IMAGE_API_KEY,
  GRSAI_IMAGE_API_URL,
  GRSAI_IMAGE_BASE_URL,
  GRSAI_IMAGE_FETCH_TIMEOUT_MS,
  GRSAI_IMAGE_MODELS,
  GRSAI_IMAGE_RESULT_API_URL,
  HOST,
  IMAGE_API_URL,
  IMAGE_CHAT_API_KEY,
  IMAGE_CHAT_API_URL,
  IMAGE_DEFAULT_MODEL,
  IMAGE_EDIT_API_URL,
  IMAGE_HISTORY_FILE,
  IMAGE_JOBS_FILE,
  IMAGE_JOB_TIMEOUT_MINUTES,
  IMAGE_JOB_TIMEOUT_MS,
  MAX_MEDIA_UPLOAD_BYTES,
  MAX_REQUEST_BYTES,
  MAX_SYNC_IMAGE_BYTES,
  MAX_UPLOAD_CHUNKS,
  MIDJOURNEY_IMAGE_API_URL,
  MIDJOURNEY_IMAGE_MODEL_ALIAS,
  MIDJOURNEY_IMAGE_TASK_API_URL,
  MINIMAX_H3_WORKFLOW_FILE,
  ONLINE_TTL_MS,
  OUTBOUND_NO_PROXY,
  OUTBOUND_PROXY_URL,
  OUTBOUND_ROUTE_STATE_FILE,
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
  SETTINGS_FILE,
  SHOE_SWAP_PROMPT,
  SHOE_SWAP_WORKFLOW_FILE,
  SYSTEM_DB_FILE,
  THUMBNAIL_REGISTRY_FILE,
  UPLOAD_TMP_DIR,
  UPLOAD_TMP_TTL_MS,
  UPSCALE2_WORKFLOW_FILE,
  UPSCALE_WORKFLOW_FILE,
  WORKFLOW_DIR,
} = SERVER_CONFIG;

const {
  ensurePngFilename,
  getGptImage2CompatHints,
  getGrsaiImageParams,
  getGrsaiUpstreamImageModel,
  getImageResponseFormat,
  getImageResponseModel,
  getLegacyEnvironmentUpstreamModel,
  getNanoBananaImageOptions,
  getNanoBananaImageSize,
  getOpenAIEditMaskRef,
  getUpstreamImageModel,
  isAinbImageModel,
  isApimartImageModel,
  isClseImageModel,
  isGptImage2LikeModel,
  isGptImage2RequestModel,
  isGrsaiImageModel,
  isMidjourneyImageModel,
  isNanoBananaProModel,
  isOfficialOpenAIUrl,
  normalizeApimartSize,
  normalizeGptImage2AspectRatio,
  normalizeGptImage2Quality,
  normalizeGptImage2RequestSize,
  normalizeGptImage2ResolutionLabel,
  normalizeGrsaiGptImageSize,
  normalizeImageAspectRatio,
  normalizeMidjourneyOptions,
  normalizeMidjourneySize,
  shouldSendGptImage2CompatHints,
} = createImageProviderRequestRules({
  imageResolutionRules: ImageResolutionRules,
  getImageModelFamily: (...args) => getImageModelFamily(...args),
  resolveCustomModel: (...args) => resolveCustomModel(...args),
  ainbImageModelAlias: AINB_IMAGE_MODEL_ALIAS,
  clseImageModelAlias: CLSE_IMAGE_MODEL_ALIAS,
  clseImageUpstreamModel: CLSE_IMAGE_UPSTREAM_MODEL,
  apimartImageModelAlias: APIMART_IMAGE_MODEL_ALIAS,
  apimartImageUpstreamModel: APIMART_IMAGE_UPSTREAM_MODEL,
  midjourneyImageModelAlias: MIDJOURNEY_IMAGE_MODEL_ALIAS,
  grsaiImageModels: GRSAI_IMAGE_MODELS,
});

const {
  getDefaultSettings,
  getSettingsResponse,
  normalizeSettings,
  readSettingsFile,
  sanitizeSettings,
  writeSettingsFile,
} = createServerSettingsService({
  crypto,
  fs,
  settingsFile: SETTINGS_FILE,
  dataDir: DATA_DIR,
  getSystemProviders: (...args) => getSystemProviders(...args),
  normalizeProviderBaseUrl: (...args) => normalizeProviderBaseUrl(...args),
  normalizeRouteMode,
  normalizeImageResolutions: (...args) => normalizeImageResolutions(...args),
  normalizeImagePlatform: (...args) => normalizeImagePlatform(...args),
  normalizeImageModelFamily: (...args) => normalizeImageModelFamily(...args),
  normalizeModelPrice,
  normalizeAgentRouting: (...args) => CanvasAgentRouter.normalizeAgentRouting(...args),
});

const LEGACY_PROVIDER_ADMIN_PATHS = new Set([
  "/api/settings/agent-candidates",
  "/api/settings/providers/key",
  "/api/settings/providers/models",
  "/api/settings/providers/runtime",
  "/api/settings/providers/agent-verify",
  "/api/settings/providers/monitoring",
]);

const outboundRouteStateStore = createOutboundRouteStateStore({
  filePath: OUTBOUND_ROUTE_STATE_FILE,
  machineId: getOutboundMachineId(),
});
const outboundRoutePolicy = createOutboundRoutePolicy({
  initialState: outboundRouteStateStore.load(),
});
let outboundRoutePendingSnapshot = null;
let outboundRouteSaveTimer = null;
const fetch = createProxyAwareFetch({
  proxyUrl: OUTBOUND_PROXY_URL,
  noProxy: OUTBOUND_NO_PROXY,
  routePolicy: outboundRoutePolicy,
  onRouteStateChange: queueOutboundRouteStateSave,
});
const chatSearchService = createChatSearchService({ fetchImpl: fetch });
const chatMessageService = createChatMessageService();
const {
  buildChatCompletionMessages,
  extractLatestUserText,
  hasVisionMessage,
} = chatMessageService;
const mediaTaskService = createMediaTaskService({ filePath: API_VIDEO_TASKS_FILE, fs });
const mediaFileService = createMediaFileService({
  outputDir: OUTPUT_DIR,
  publicDir: PUBLIC_DIR,
  fetchImpl: fetch,
  maxRequestBytes: MAX_REQUEST_BYTES,
  crypto,
  fs,
});
const {
  extensionFromContentType,
  extensionFromFilePath,
  decodeHeaderFilename,
  inferMediaMimeType,
  isSupportedMediaMime,
  isVideoMediaUrl,
  buildOutputImagePath,
  saveBinaryImage,
  saveBinaryMedia,
  saveRemoteVideo,
  dataUrlToFile,
  resolveLocalImageReference,
  localImageFileToUpload,
  getImageReferenceDimensions,
  getImageDimensionsFromBuffer,
  decodeImageBase64,
  fetchWithTimeout,
  imageReferenceToFile,
  mediaReferenceToFile,
  readBodyBuffer,
} = mediaFileService;
const canvasAgentConversationStore = createCanvasAgentConversationStore({ filePath: CANVAS_AGENT_CONVERSATIONS_FILE });

const SERVER_COMPOSITION_HOST = {
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
};

const {
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
} = createServerComposition({ host: SERVER_COMPOSITION_HOST });

let canvasStorage = null;
let canvasShutdownPromise = null;

function getCanvasStorage() {
  if (canvasStorage) return canvasStorage;
  const { createCanvasRepository } = require("./canvas-repository");
  const { createCanvasLegacyMigrator } = require("./canvas-legacy-migrator");
  const { createCanvasQueryService } = require("./canvas-query-service");
  const { createCanvasCommandService } = require("./canvas-command-service");
  const { streamCanvasExport, importCanvasStream } = require("./canvas-export-service");
  const repository = createCanvasRepository({ dbPath: CANVAS_DB_FILE, requestTimeoutMs: 30_000 });
  const migrator = createCanvasLegacyMigrator({
    legacyFile: CANVAS_BOARDS_FILE,
    repository,
    backupDirectory: CANVAS_BACKUP_DIR,
    batchSize: 500,
  });
  canvasStorage = {
    repository,
    migrator,
    queryService: createCanvasQueryService({ repository, migrator }),
    commandService: createCanvasCommandService({ repository }),
    streamCanvasExport,
    importCanvasStream,
  };
  return canvasStorage;
}

function shutdownCanvasStorage() {
  if (!canvasShutdownPromise) {
    canvasShutdownPromise = canvasStorage
      ? canvasStorage.repository.close()
      : Promise.resolve();
  }
  return canvasShutdownPromise;
}

/**
 * Live canvas collaboration.
 *
 * The hub only decides *who is looking at which board*; every message it
 * relays was already persisted by the storage layer, so a client that misses
 * one can always recover by re-reading the board. Authorization reuses the
 * same resource access layer as the HTTP routes: a socket is refused unless the
 * account can read the canvas.
 */
const canvasCollabHub = createCanvasCollabHub({
  readBoardRevision: async (boardId) => {
    const { repository } = getCanvasStorage();
    const meta = await repository.getBoardMeta(boardId);
    return Number(meta?.revision || 0);
  },
  authorize: async (request, boardId) => {
    if (AI_OS_AUTH_DISABLED) return { user: publicUser(authDisabledUser) };
    const auth = await getAuthContext(request);
    if (!auth) return null;
    const resource = await ensureReferencedResource(auth.user.id, {
      type: "canvas",
      title: `画布 ${boardId}`,
      refType: "canvas",
      refId: boardId,
    });
    await resourceAccess.assertRead(auth.user.id, resource.id);
    return { user: publicUser(auth.user) };
  },
});
// Components reach the hub through the composition's late binding; the hub
// itself is created here because it needs the lazy canvas storage.
setCanvasCollabHub(canvasCollabHub);

const server = http.createServer(async (req, res) => {
  const requestPath = getRequestPath(req);
  if (await serverComponents.handlePublic(req, res)) return;
  if (requestPath.startsWith("/api/")) {
    const auth = AI_OS_AUTH_DISABLED
      ? { user: publicUser(authDisabledUser), sessionId: "authentication-disabled" }
      : await requireAuth(req, res);
    if (!auth) return;
    req.auth = auth;
    if (auth.user.mustChangePassword) {
      sendJson(res, 403, {
        error: "Change the temporary password before using this system.",
        code: "password_change_required",
      });
      return;
    }
  }

  if (await authHttpApi.handle(req, res)) return;

  if (LEGACY_PROVIDER_ADMIN_PATHS.has(requestPath)) {
    await handleRetiredProviderControlPlane(req, res);
    return;
  }

  if (await serverComponents.handle(req, res)) return;

  if (req.method === "POST" && req.url === "/api/canvas/media/cleanup") {
    await handleCanvasGalleryMediaCleanup(req, res);
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

// Registering an upgrade listener takes the socket away from Node's default
// "destroy unknown upgrades" behaviour, so every path the hub does not claim is
// still closed explicitly.
server.on("upgrade", (request, socket, head) => {
  if (canvasCollabHub.handleUpgrade(request, socket, head)) return;
  socket.destroy();
});

async function startServer() {
  await serverComponents.start();
  // 排队中的视频任务在重启后要能继续查询，而不是看起来像失败了。
  const mediaGeneration = serverComponents.getState().components
    .find((component) => component.id === "media-generation-http-api");
  if (mediaGeneration?.status === "running") {
    const apiVideoTaskService = getApiVideoTaskService();
    mediaTaskService.restoreApiVideoTasks({ onRestore: (taskId) => apiVideoTaskService.scheduleWatch(taskId) });
  }
  server.listen(PORT, HOST, () => {
    console.log(`AI API console running at http://localhost:${PORT}`);
    getLanUrls(PORT).forEach((url) => console.log(`LAN access: ${url}`));
  });
  // Static assets and authentication do not need the canvas database. Let the
  // HTTP listener come up first, then open the worker/database in the
  // background so a cold database cannot delay the first usable desktop.
  void Promise.race([
    getCanvasStorage().repository.ready(),
    new Promise((resolve) => {
      const timer = setTimeout(resolve, 5_000);
      timer.unref?.();
    }),
  ]).catch((error) => {
    console.error("Canvas storage warmup:", error?.message || error);
  });
}

startServer().catch((error) => {
  console.error("AI API startup failed:", error?.message || error);
  process.exitCode = 1;
});

// Quitting must never wait for a slow provider, an in-flight image download or a
// client that keeps a socket open, so every step below is bounded.
const SHUTDOWN_CONNECTION_GRACE_MS = 600;
const SHUTDOWN_STEP_TIMEOUT_MS = 2_000;

function shutdownDelay(ms) {
  return new Promise(resolve => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

let localDataClosePromise = null;
function closeLocalData() {
  if (!localDataClosePromise) {
    localDataClosePromise = Promise.resolve(shutdownCanvasStorage())
      .catch(error => console.error("Canvas cleanup:", error.message))
      .then(() => {
        try { systemDb.close(); } catch (error) { console.error("Database cleanup:", error.message); }
      });
  }
  return localDataClosePromise;
}

let serverShutdownStarted = false;
async function shutdownServer() {
  if (serverShutdownStarted) return;
  serverShutdownStarted = true;
  flushOutboundRouteState();
  jimengCliService.close();
  // Collaboration sockets are upgraded connections, so the HTTP server does not
  // count them as active requests: without dropping them first its close callback
  // never fires while the canvas editor is open, and the desktop host would sit
  // out its whole stop timeout on every quit.
  try { canvasCollabHub.close(); } catch {}
  const connectionsClosed = new Promise(resolve => {
    server.close(() => resolve());
    server.closeIdleConnections?.();
    shutdownDelay(SHUTDOWN_CONNECTION_GRACE_MS).then(() => {
      try { server.closeAllConnections?.(); } catch {}
      resolve();
    });
  });
  await Promise.race([connectionsClosed, shutdownDelay(SHUTDOWN_STEP_TIMEOUT_MS)]);
  await Promise.race([serverComponents.stop(), shutdownDelay(SHUTDOWN_STEP_TIMEOUT_MS)]);
  try { await Promise.race([closeComfyService(), shutdownDelay(SHUTDOWN_STEP_TIMEOUT_MS)]); }
  catch (error) { console.error("ComfyUI cleanup:", error.message); }
  await Promise.race([closeLocalData(), shutdownDelay(SHUTDOWN_STEP_TIMEOUT_MS)]);
  process.exit(0);
}
process.once("SIGINT", shutdownServer);
process.once("SIGTERM", shutdownServer);
if (process.connected) process.on("message", message => {
  if (message?.type === "ai-os.shutdown") shutdownServer();
});
server.once("close", () => {
  jimengCliService.close();
  closeLocalData().catch(() => {});
});

function getRequestPath(req) {
  try {
    return new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;
  } catch {
    return "/";
  }
}

/**
 * 图片任务表与画布预览图，用于给资源列表补缩略图。
 *
 * 两者都按每次请求批量取一次：任务表按文件修改时间缓存，画布预览走一次
 * 画布元数据查询，避免按资源逐条回源。
 */
let resourcePreviewJobsCache = { mtimeMs: 0, jobs: null };

function readResourcePreviewJobs() {
  try {
    const stats = fs.statSync(IMAGE_JOBS_FILE);
    if (resourcePreviewJobsCache.jobs && resourcePreviewJobsCache.mtimeMs === stats.mtimeMs) {
      return resourcePreviewJobsCache.jobs;
    }
    const parsed = JSON.parse(fs.readFileSync(IMAGE_JOBS_FILE, "utf8"));
    const jobs = parsed && typeof parsed === "object" && parsed.jobs && typeof parsed.jobs === "object" ? parsed.jobs : parsed;
    const index = jobs && typeof jobs === "object" ? new Map(Object.entries(jobs)) : new Map();
    resourcePreviewJobsCache = { mtimeMs: stats.mtimeMs, jobs: index };
    return index;
  } catch {
    return new Map();
  }
}

/** 旧版画布摘要按文件 mtime 缓存：一个进程只解析一次，不落在每次请求上。 */
let legacyCanvasSummaryCache = { mtimeMs: 0, boards: [] };

function readLegacyCanvasSummaries() {
  try {
    const stats = fs.statSync(CANVAS_BOARDS_FILE);
    if (legacyCanvasSummaryCache.mtimeMs === stats.mtimeMs) return legacyCanvasSummaryCache.boards;
    const boards = getCanvasStorage().migrator.listLegacySummaries() || [];
    legacyCanvasSummaryCache = { mtimeMs: stats.mtimeMs, boards };
    return boards;
  } catch {
    return [];
  }
}

async function readResourcePreviewBoards() {
  const index = new Map();
  try {
    // 画布仓库是懒加载的单例，必须走 getCanvasStorage()：之前的裸 repository
    // 只是 getCanvasStorage() 里的局部变量，这里引用会抛 ReferenceError，
    // 被下面的 catch 吞掉后所有画布卡片就再也拿不到封面。
    const boards = await getCanvasStorage().repository.listBoards();
    for (const board of Array.isArray(boards) ? boards : []) {
      if (board?.id) index.set(String(board.id), board);
    }
  } catch {
    // 画布元数据取不到时其它类型照常显示缩略图。
  }
  // 旧版画布文件里还没迁进 canvas.db 的画布：资源行还在，但仓库查不到，
  // 于是卡片的节点数会缺席。这里补上旧版摘要（按文件 mtime 缓存，一次运行只读一次），
  // 让每张画布卡片都能标出规模。
  for (const board of readLegacyCanvasSummaries()) {
    const id = String(board?.id || "");
    if (id && !index.has(id)) index.set(id, board);
  }
  return index;
}

function getLegacyOwnerUserId(fallbackUserId) {
  return systemDb.listUsers().find((user) => user.role === "superadmin")?.id || fallbackUserId;
}

function canonicalOutputMedia(url) {
  const filePath = staticHttpApi.resolveOutputPath(url);
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
  const relative = path.relative(fs.realpathSync.native(OUTPUT_DIR), fs.realpathSync.native(filePath));
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
  const segments = relative.split(path.sep);
  return { refId: `/output/${segments.join("/")}`, url: `/output/${segments.map(encodeURIComponent).join("/")}` };
}

async function assertOutputMediaRead(userId, url, visited = new Set()) {
  const media = canonicalOutputMedia(url);
  if (!media || visited.has(media.refId)) throw Object.assign(new Error("图片或媒体文件不存在。"), { code: "not_found", statusCode: 404 });
  visited.add(media.refId);
  const original = thumbnailStore.sourceForThumbnail(media.refId);
  if (original?.startsWith("/output/")) return assertOutputMediaRead(userId, original, visited);
  const resource = await ensureReferencedResource(userId, {
    type: /\.(mp4|webm|mov|mkv)$/i.test(media.refId) ? "video" : "image",
    title: path.basename(media.refId), refType: "output_media", refId: media.refId, metadata: { url: media.url },
  });
  try { return await resourceAccess.assertRead(userId, resource.id); } catch (error) {
    if (!["forbidden", "share_password_required"].includes(error.code)) throw error;
    // Persisted node membership is indexed. Recheck the share on every read so
    // removing a node or revoking a share immediately revokes media access.
    const boards = await getCanvasStorage().repository.invoke("boardsReferencingMedia", { source: media.url });
    for (const board of boards) {
      const canvasResource = systemDb.getResourceByRef("canvas", board.id);
      if (!canvasResource) continue;
      try {
        await resourceAccess.assertRead(userId, canvasResource.id);
        return { resource, permission: "read", capabilities: { read: true } };
      } catch (boardError) {
        if (!["forbidden", "share_password_required", "resource_not_found"].includes(boardError.code)) throw boardError;
      }
    }
    throw error;
  }
}

async function validateCanvasMediaReferences(userId, nodes) {
  for (const source of collectMediaReferences(nodes).values()) {
    // Missing historic files can remain while the user repairs their canvas.
    if (canonicalOutputMedia(source)) await assertOutputMediaRead(userId, source);
  }
}

async function ensureReferencedResource(currentUserId, input, { currentUserOwnsNew = false, syncTitle = false } = {}) {
  const refType = String(input.refType || "");
  const refId = String(input.refId || "");
  let resource = systemDb.getResourceByRef(refType, refId);
  if (resource) {
    // 画布的资源名一开始只能写成“画布 <boardId>”（创建时还没标题），改名之后
    // 资源名不会自己跟上，共享面板和“文件与共享”里就会一直挂着那串 UUID。
    // 只有资源的owner在列举自己的画布时才回写，别人读一次不能改掉作者的名字。
    const nextTitle = String(input.title || "").trim();
    if (syncTitle && nextTitle && resource.title !== nextTitle && resource.ownerUserId === currentUserId) {
      resource = systemDb.updateResource(resource.id, { title: nextTitle }) || resource;
    }
    return resource;
  }
  let ownerUserId = currentUserOwnsNew ? currentUserId : getLegacyOwnerUserId(currentUserId);
  if (refType === "canvas" && !currentUserOwnsNew) {
    const { repository, migrator } = getCanvasStorage();
    let board;
    try { board = await repository.getBoardState(refId); } catch (error) {
      if (error.code !== "board_not_found") throw error;
      board = migrator.listLegacySummaries().find((item) => item.id === refId);
      if (!board) throw Object.assign(new Error("画布尚未保存或已不存在。"), { code: "canvas_board_not_found", statusCode: 404 });
    }
    // The persisted project identifies the creator even if a read races the
    // create response. A read must never register an unsaved canvas for admin.
    ownerUserId = systemDb.getCanvasProject(board.projectId)?.ownerUserId || ownerUserId;
  }
  resource = await resourceAccess.registerResource({
    ...input,
    ownerUserId,
  });
  return resource;
}

function getUserDataDirectory(userId) {
  const safeUserId = String(userId || "").replace(/[^a-zA-Z0-9_-]/g, "_");
  const directory = path.join(DATA_DIR, "users", safeUserId);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function getUserHistoryFile(userId, legacyFile) {
  const userFile = path.join(getUserDataDirectory(userId), path.basename(legacyFile));
  if (!fs.existsSync(userFile) && userId === getLegacyOwnerUserId(userId) && fs.existsSync(legacyFile)) {
    fs.copyFileSync(legacyFile, userFile);
  }
  return userFile;
}

async function handleRetiredProviderControlPlane(req, res) {
  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;
  sendJson(res, 410, {
    error: "旧模型管理接口已停用，请使用系统设置中的“API 设置”。",
    code: "provider_control_plane_retired",
    replacement: "/api/providers",
  });
}

function formatUpstreamError(error) {
  const message = error?.message || String(error || "Unknown error");
  const causeMessage = error?.cause?.message || error?.cause?.code || "";
  return causeMessage && causeMessage !== message ? `${message}: ${causeMessage}` : message;
}

function extractUpstreamErrorMessage(text, contentType = "") {
  const raw = String(text || "").trim();
  if (!raw) return "";
  if (contentType.includes("json") || /^[\[{]/.test(raw)) {
    try {
      const data = JSON.parse(raw);
      const message = data?.error?.message || data?.error || data?.message || data?.detail || data?.details;
      if (message) return String(message).slice(0, 800);
    } catch {}
  }
  const withoutTags = raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return (withoutTags || raw).slice(0, 800);
}
function compactImageJobResponse(body = {}) {
  const data = Array.isArray(body.data) ? body.data.map((item, index) => {
    const saved = body.saved_images?.[index] || {};
    const localUrl = [item?.local_url, saved.url, item?.url]
      .find((value) => /^\/output\//.test(String(value || ""))) || "";
    const remoteUrl = [item?.remote_url, item?.url, item?.local_url]
      .find((value) => /^https?:\/\//i.test(String(value || ""))) || "";
    return {
      ...(localUrl ? { url: localUrl, local_url: localUrl } : {}),
      ...(!localUrl && remoteUrl ? { remote_url: remoteUrl } : {}),
      width: Number(item?.width || saved.width || 0),
      height: Number(item?.height || saved.height || 0),
    };
  }) : [];
  return { ...body, data };
}

async function registerSavedMedia(req, saved, mimeType) {
  if (!req.auth?.user?.id || !saved?.url) return null;
  return assetLibrary.registerMedia(req.auth.user.id, saved, mimeType, { source: "generated" });
}

async function registerVideoOutput(userId, url) {
  const refId = outputMediaRef(url);
  if (systemDb.getResourceByRef("output_media", refId)) return;
  await assetLibrary.registerMedia(userId, { url, filename: path.basename(refId) }, "video/mp4", { source: "generated" });
}

async function collectReferencedCanvasOutputUrls() {
  const { repository } = getCanvasStorage();
  const referencedUrls = new Set();
  const boards = await repository.listBoards();
  for (const board of boards) {
    const boardId = String(board?.id || "");
    if (!boardId) continue;
    let cursor = "";
    do {
      const page = await repository.exportBoardPage({
        boardId,
        entity: "nodes",
        cursor,
        limit: 500,
      });
      collectOutputMediaUrls(page.items, { outputDir: OUTPUT_DIR }, referencedUrls);
      cursor = String(page.nextCursor || "");
    } while (cursor);
  }
  return referencedUrls;
}

async function handleCanvasGalleryMediaCleanup(req, res) {
  try {
    const payload = await readJson(req);
    const candidateUrls = Array.isArray(payload?.candidateUrls)
      ? payload.candidateUrls.slice(0, 250).map(String)
      : [];
    const referencedUrls = await collectReferencedCanvasOutputUrls();
    const result = deleteUnreferencedOutputMedia({
      candidateUrls,
      referencedUrls,
      outputDir: OUTPUT_DIR,
      thumbnailStore,
    });
    sendJson(res, 200, {
      ...result,
      deletedCount: result.deletedUrls.length,
      retainedCount: result.retainedUrls.length,
    });
  } catch (error) {
    sendJson(res, 500, { error: String(error?.message || error || "图集图片清理失败") });
  }
}

function getOutboundMachineId() {
  return crypto
    .createHash("sha256")
    .update(`${os.hostname()}\n${process.platform}\n${process.arch}`)
    .digest("hex")
    .slice(0, 24);
}

function queueOutboundRouteStateSave(snapshot) {
  outboundRoutePendingSnapshot = snapshot;
  if (outboundRouteSaveTimer) return;
  outboundRouteSaveTimer = setTimeout(flushOutboundRouteState, 250);
  outboundRouteSaveTimer.unref?.();
}

function flushOutboundRouteState() {
  if (outboundRouteSaveTimer) clearTimeout(outboundRouteSaveTimer);
  outboundRouteSaveTimer = null;
  const snapshot = outboundRoutePendingSnapshot;
  outboundRoutePendingSnapshot = null;
  if (!snapshot) return;
  try {
    outboundRouteStateStore.save(snapshot);
  } catch (error) {
    console.warn(`Outbound route state was not saved: ${String(error?.message || error)}`);
  }
}

function getImageProvider(model, mode) {
  const customModel = resolveCustomModel(model, mode === "edit" ? "edit" : "generation");
  if (customModel) {
    if (!customModel.provider.apiKey) throw new Error(`API 接入“${customModel.provider.name}”缺少 API Key。`);
    return {
      url: mode === "edit" ? normalizeImageEditApiUrl(customModel.provider.baseUrl) : normalizeImageApiUrl(customModel.provider.baseUrl),
      key: customModel.provider.apiKey,
      custom: true,
      providerId: customModel.provider.id,
      providerName: customModel.provider.name,
      baseUrl: customModel.provider.baseUrl,
      networkMode: normalizeRouteMode(customModel.provider.networkMode, customModel.provider.baseUrl),
    };
  }
  if (isAinbImageModel(model)) {
    if (!AINB_IMAGE_API_KEY) throw new Error("后端缺少 AINB_IMAGE_API_KEY，请先在 .env 里配置。");
    return {
      url: mode === "edit" ? AINB_IMAGE_EDIT_API_URL : AINB_IMAGE_API_URL,
      key: AINB_IMAGE_API_KEY,
      providerId: "system-ainb-image",
      providerName: "AINB",
      baseUrl: AINB_IMAGE_API_URL,
      networkMode: normalizeRouteMode("", AINB_IMAGE_API_URL),
    };
  }
  if (isClseImageModel(model)) {
    if (!CLSE_IMAGE_API_KEY) throw new Error("Server missing CLSE_IMAGE_API_KEY environment variable.");
    return {
      url: mode === "edit" ? CLSE_IMAGE_EDIT_API_URL : CLSE_IMAGE_API_URL,
      key: CLSE_IMAGE_API_KEY,
      providerId: "system-clse-image",
      providerName: "CLSE",
      baseUrl: CLSE_IMAGE_API_URL,
      networkMode: normalizeRouteMode("", CLSE_IMAGE_API_URL),
    };
  }
  if (!API_KEY) throw new Error("Server missing AI_API_KEY environment variable.");
  return {
    url: mode === "edit" ? IMAGE_EDIT_API_URL : IMAGE_API_URL,
    key: API_KEY,
    providerId: "system-ai-image",
    providerName: "OpenAI",
    baseUrl: IMAGE_API_URL,
    networkMode: normalizeRouteMode("", IMAGE_API_URL),
  };
}

function shouldUseGeminiNativeImageApi(customModel) {
  if (!customModel) return false;
  const platform = normalizeImagePlatform(customModel.model.platform, customModel.model.id);
  if (platform !== "google") return false;
  return isGeminiNativeImageProvider(customModel.provider.baseUrl);
}

function isGeminiNativeImageProvider(baseUrl) {
  const value = String(baseUrl || "");
  try {
    const host = new URL(normalizeGeminiNativeBaseUrl(value)).hostname.toLowerCase();
    return host === "uuapi.net" || host.endsWith(".uuapi.net") || host === "generativelanguage.googleapis.com" || host.endsWith(".generativelanguage.googleapis.com");
  } catch {
    return /(^|\.)uuapi\.net\b|generativelanguage\.googleapis\.com/i.test(value);
  }
}

function normalizeGeminiNativeBaseUrl(url) {
  return normalizeProviderBaseUrl(url)
    .replace(/\/v1$/i, "")
    .replace(/\/v1beta$/i, "")
    .replace(/\/v1beta\/models\/[^/]+:generateContent$/i, "");
}

function updateUpscaleTask(taskId, patch) {
  return mediaTaskService.update(taskId, patch);
}

function cleanupUpscaleTasks() {
  return mediaTaskService.cleanupExpired();
}

function formatErrorMessage(error) {
  const value = error?.message || error;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function saveGeneratedImages(data, options = {}) {
  const result = await getImageSyncService().syncResponse(data, options);
  return result.savedImages;
}

function waitForAbortableDelay(delayMs, signal) {
  if (!signal) return new Promise((resolve) => setTimeout(resolve, delayMs));
  if (signal.aborted) return Promise.reject(signal.reason || new Error("The operation was aborted."));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason || new Error("The operation was aborted."));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function getSystemProviders() {
  const primaryChatModels = AVAILABLE_MODELS.filter((model) => !GEMINI_MODELS.includes(model) && !BAILIAN_MODELS.includes(model));
  const specializedImageModels = new Set([
    AINB_IMAGE_MODEL_ALIAS,
    CLSE_IMAGE_MODEL_ALIAS,
    APIMART_IMAGE_MODEL_ALIAS,
    APIMART_IMAGE_UPSTREAM_MODEL,
    MIDJOURNEY_IMAGE_MODEL_ALIAS,
    ...GRSAI_IMAGE_MODELS,
  ]);
  const primaryImageModels = AVAILABLE_IMAGE_MODELS.filter((model) => !specializedImageModels.has(model));
  const candidates = [
    makeSystemProvider("system-ai-chat", "主对话 API", API_URL, API_KEY, primaryChatModels, "chat"),
    makeSystemProvider("system-gemini-chat", "Gemini 对话 API", GEMINI_API_URL, GEMINI_API_KEY, GEMINI_MODELS, "chat"),
    makeSystemProvider("system-bailian-chat", "百炼对话 API", BAILIAN_API_URL, BAILIAN_API_KEY, BAILIAN_MODELS, "chat"),
    makeSystemProvider("system-ai-image", "主图片 API", IMAGE_API_URL, API_KEY, primaryImageModels, "image"),
    makeSystemProvider("system-ainb-image", "AINB 图片 API", AINB_IMAGE_API_URL, AINB_IMAGE_API_KEY, [AINB_IMAGE_MODEL_ALIAS], "image"),
    makeSystemProvider("system-clse-image", "CLSE 图片 API", CLSE_IMAGE_API_URL, CLSE_IMAGE_API_KEY, [CLSE_IMAGE_MODEL_ALIAS], "image"),
    makeSystemProvider("system-apimart-image", "APIMART 图片 API", APIMART_IMAGE_API_URL, APIMART_IMAGE_API_KEY, [APIMART_IMAGE_UPSTREAM_MODEL, MIDJOURNEY_IMAGE_MODEL_ALIAS], "image"),
    makeSystemProvider("system-grsai-image", "GRSAI 图片 API", GRSAI_IMAGE_API_URL, GRSAI_IMAGE_API_KEY, GRSAI_IMAGE_MODELS, "image"),
  ];
  const grouped = new Map();
  candidates.filter((provider) => provider.hasApiKey && provider.models.length).forEach((provider) => {
    const groupKey = `${provider.baseUrl}\n${provider.secretFingerprint}`;
    const existing = grouped.get(groupKey);
    if (!existing) {
      grouped.set(groupKey, provider);
      return;
    }
    existing.models.push(...provider.models);
    existing.endpoints = [...new Set([...existing.endpoints, ...provider.endpoints])];
  });
  const providers = [...grouped.values()];
  const hostCounts = providers.reduce((counts, provider) => {
    counts.set(provider.name, (counts.get(provider.name) || 0) + 1);
    return counts;
  }, new Map());
  return providers.map((provider) => {
    if ((hostCounts.get(provider.name) || 0) > 1) provider.name = `${provider.name} · ${provider.apiKeyMasked.slice(-4)}`;
    delete provider.secretFingerprint;
    return provider;
  });
}

function makeSystemProvider(id, name, endpointUrl, apiKey, models, type) {
  const baseUrl = normalizeProviderBaseUrl(endpointUrl);
  const chatCapabilities = baseUrl.includes("generativelanguage.googleapis.com")
    ? ["text", "vision"]
    : ["text", "vision", "tools"];
  return {
    id: `system-${crypto.createHash("sha1").update(`${baseUrl}\n${apiKey}`).digest("hex").slice(0, 12)}`,
    name: getProviderDisplayName(baseUrl, name),
    baseUrl,
    networkMode: normalizeRouteMode("", baseUrl),
    apiKey,
    apiKeyMasked: maskApiKey(apiKey),
    hasApiKey: Boolean(apiKey),
    enabled: Boolean(apiKey),
    managed: true,
    secretFingerprint: crypto.createHash("sha1").update(String(apiKey || "")).digest("hex"),
    endpoints: [type],
    source: "env",
    sourceLabel: ".env 系统配置",
    models: [...new Set(models || [])].filter(Boolean).map((model) => ({
      id: model,
      alias: "",
      capabilities: type === "chat" ? chatCapabilities : ["generation", "edit"],
      ...(type === "image" ? { metadata: { upstreamModel: getLegacyEnvironmentUpstreamModel(model) } } : {}),
      ...(String(model || "").trim().toLowerCase() === MIDJOURNEY_IMAGE_MODEL_ALIAS ? { resolutions: [], platform: "midjourney", family: "midjourney" } : {}),
      price: "",
    })),
  };
}

function inferLegacyProviderProtocol(provider) {
  const explicit = String(provider?.protocol || provider?.providerProtocol || "").trim().toLowerCase();
  if (explicit) return explicit;
  const baseUrl = String(provider?.baseUrl || provider?.url || "").toLowerCase();
  const modelIds = (provider?.models || []).map((model) => String(model?.id || "").toLowerCase());
  if (baseUrl.includes("generativelanguage.googleapis.com")) return "gemini";
  if (baseUrl.includes("api.anthropic.com")) return "anthropic";
  if (baseUrl.includes("runninghub")) return "runninghub";
  if (/^(?:https?:\/\/)?(?:localhost|127\.0\.0\.1):8188(?:\/|$)/.test(baseUrl)) return "comfyui";
  if (baseUrl.includes("apimart") || modelIds.some((id) => id.includes("midjourney"))) return "apimart";
  const capabilities = (provider?.models || []).flatMap((model) => model?.capabilities || []);
  return capabilities.length && capabilities.every((capability) => ["generation", "edit", "image.generate", "image.edit"].includes(capability))
    ? "openai-images"
    : "openai";
}

function inferLegacyModelProtocol(providerProtocol, model) {
  const explicit = String(model?.protocol || model?.modelProtocol || "").trim().toLowerCase();
  if (explicit) return explicit;
  const modelId = String(model?.id || "").toLowerCase();
  const capabilities = Array.isArray(model?.capabilities) ? model.capabilities : [];
  if (modelId.includes("midjourney")) return "midjourney";
  if (providerProtocol === "gemini") return "gemini";
  if (providerProtocol === "anthropic") return "anthropic";
  if (capabilities.some((capability) => ["generation", "edit", "image.generate", "image.edit"].includes(capability))) return "openai-images";
  return providerProtocol === "apimart" ? "openai" : providerProtocol;
}

function legacyProviderForMigration(provider) {
  const protocol = inferLegacyProviderProtocol(provider);
  return {
    id: provider.id,
    name: provider.name,
    baseUrl: normalizeProviderBaseUrl(provider.baseUrl || provider.url || ""),
    protocol,
    source: provider.source || (provider.importedSystem ? "environment" : "settings"),
    apiKey: provider.apiKey || "",
    walletKey: provider.walletKey || "",
    enabled: provider.enabled !== false,
    capabilitySort: provider.capabilitySort || {},
    metadata: {
      legacyNetworkMode: provider.networkMode || "",
      importedSystem: Boolean(provider.importedSystem),
    },
    models: (Array.isArray(provider.models) ? provider.models : []).map((model) => ({
      id: model.id,
      displayName: model.alias || model.displayName || model.id,
      protocol: inferLegacyModelProtocol(protocol, model),
      capabilities: (model.capabilities || []).map((capability) => capability === "text" ? "chat" : capability),
      capabilitySort: model.capabilitySort || {},
      metadata: {
        ...(model.metadata && typeof model.metadata === "object" ? model.metadata : {}),
        resolutions: model.resolutions || [],
        platform: model.platform || "",
        family: model.family || "",
        price: model.price || "",
      },
    })),
  };
}

function legacySettingsProvidersForMigration() {
  return (readSettingsFile().providers || [])
    .filter((provider) => provider?.id && provider?.baseUrl)
    .map(legacyProviderForMigration);
}

function legacyEnvironmentProvidersForMigration() {
  const providers = [...getSystemProviders()];
  const canvasAgentProvider = legacyCanvasAgentEnvironmentProviderForMigration();
  if (canvasAgentProvider) providers.push(canvasAgentProvider);
  return providers
    .filter((provider) => provider?.id && provider?.baseUrl && provider?.apiKey)
    .map(legacyProviderForMigration);
}

function legacyCanvasAgentEnvironmentProviderForMigration() {
  if (!CANVAS_AGENT_API_KEY || !CANVAS_AGENT_MODEL) return null;
  return {
    id: "canvas-agent-env-fallback",
    name: "Canvas Agent API",
    baseUrl: CanvasAgentRouter.normalizeAgentBaseUrl(CANVAS_AGENT_API_URL),
    protocol: "openai-responses",
    source: "environment",
    apiKey: CANVAS_AGENT_API_KEY,
    enabled: true,
    models: [{
      id: CANVAS_AGENT_MODEL,
      displayName: CANVAS_AGENT_MODEL,
      protocol: "openai-responses",
      capabilities: ["llm.chat", "llm.chat.vision", "llm.tools"],
    }],
  };
}

function getProviderDisplayName(baseUrl, fallback) {
  try {
    return new URL(baseUrl).hostname.replace(/^api\./i, "") || fallback;
  } catch {
    return fallback;
  }
}

function maskApiKey(key) {
  const value = String(key || "");
  if (!value) return "";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••••••${value.slice(-4)}`;
}

function normalizeModelsApiUrl(url) {
  const cleanUrl = normalizeProviderBaseUrl(url);
  if (cleanUrl.endsWith("/v1")) return `${cleanUrl}/models`;
  return `${cleanUrl}/v1/models`;
}

function normalizeProviderBaseUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "")
    .replace(/\/v1\/api\/(?:generate|result)$/i, "")
    .replace(/\/models$/i, "")
    .replace(/\/chat\/completions$/i, "")
    .replace(/\/images\/(?:generations|edits)$/i, "");
}

function extractProviderModelIds(data) {
  const list = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
  return [...new Set(list.map((item) => String(item?.id || item?.name || item || "").trim()).filter(Boolean))].sort();
}

function getLanUrls(port) {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((info) => info && info.family === "IPv4" && !info.internal)
    .map((info) => `http://${info.address}:${port}`);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_REQUEST_BYTES) {
        req.destroy();
        reject(new Error(`Request body too large. Current limit is ${Math.round(MAX_REQUEST_BYTES / 1024 / 1024)}MB.`));
        return;
      }
      chunks.push(buffer);
    });

    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString("utf8");
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });

    req.on("error", reject);
  });
}

function sendJson(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(JSON.stringify(body));
}
