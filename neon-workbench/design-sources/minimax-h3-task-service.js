"use strict";

const path = require("node:path");
const H3_COMMERCE_WORKFLOW_NAME = "h3-commerce-video.json";
const H3_COMMERCE_PROTOCOL = "ai-os.h3-commerce.v1";
const H3_COMMERCE_IMAGE_EXTENSION = /\.(?:png|jpe?g|webp)$/i;

// 首尾帧等模式使用同一工作流目录下的另一份模板；缺少模板时给出中文错误。
const H3_FRAMES_WORKFLOW_NAME = "minimax-h3-video-frames.json";
const H3_FRAMES_MODES = ["text", "first", "last"];

function createMinimaxH3TaskService({
  mediaTaskService,
  registerMedia,
  updateTask,
  cleanupTasks,
  workflowFile,
  commerceWorkflowFile = path.join(__dirname, "workflows", H3_COMMERCE_WORKFLOW_NAME),
  normalizeRequest,
  prepareWorkflow,
  prepareCommerceWorkflow,
  assertCommerceWorkflowContract,
  normalizeCommerceParameters,
  sanitizeReferenceName,
  mediaReferenceToFile,
  comfyClient,
  formatErrorMessage,
  makeUploadToken,
  makeUploadFilename,
  crypto = require("node:crypto"),
  fs = require("node:fs"),
  now = Date.now,
} = {}) {
  for (const [name, dependency] of Object.entries({
    mediaTaskService,
    updateTask,
    cleanupTasks,
    workflowFile,
    normalizeRequest,
    prepareWorkflow,
    sanitizeReferenceName,
    mediaReferenceToFile,
    comfyClient,
    formatErrorMessage,
    makeUploadToken,
    makeUploadFilename,
  })) {
    if (!dependency) throw new TypeError(`MiniMax H3 task service requires ${name}.`);
  }

  async function handleVideoRequest(req, res, {
    readJson,
    sendJson,
    generateVideo,
    getDefaultProviderId = () => "",
  } = {}) {
    if (typeof readJson !== "function" || typeof sendJson !== "function" || typeof generateVideo !== "function") {
      throw new TypeError("MiniMax H3 video request requires readJson, sendJson, and generateVideo.");
    }
    try {
      const payload = await readJson(req);
      const modelId = payload.modelId || payload.model_id || payload.model || "minimax-h3";
      if ((payload.commerce_mode !== undefined && payload.commerce_mode !== false)
        || Object.hasOwn(payload, "prompt_b") || modelId === "h3-commerce" || payload.mode === "commerce") {
        throw new Error("H3 带货必须使用专用生成接口。");
      }
      if (payload.mode && payload.mode !== "reference" && !H3_FRAMES_MODES.includes(payload.mode)) {
        throw new Error("MiniMax H3 生成模式无效。");
      }
      const result = await generateVideo({
        mode: payload.mode,
        // 媒体桥只转发固定的参数键，生成方式通过 params 原样带到 ComfyUI 适配器。
        params: { mode: payload.mode },
        prompt: payload.prompt,
        images: payload.images,
        videos: payload.videos,
        audios: payload.audios,
        aspectRatio: payload.aspect_ratio,
        megapixels: payload.megapixels,
        steps: payload.steps,
        duration: payload.duration,
        refImageSize: payload.ref_image_size,
        seed: payload.seed,
        providerId: payload.providerId || payload.provider_id || getDefaultProviderId(),
        modelId,
      });
      updateTask(result.task_id, { ownerUserId: req.auth?.user?.id });
      // A fast provider may complete before its request returns the task ID.
      await registerTaskVideos(result.task_id, mediaTaskService.get(result.task_id)?.videos || []);
      sendJson(res, 202, { task_id: result.task_id });
    } catch (error) {
      sendJson(res, 400, { error: formatErrorMessage(error) });
    }
  }

  function loadCommerceTemplate() {
    if (typeof prepareCommerceWorkflow !== "function" || typeof assertCommerceWorkflowContract !== "function"
      || typeof normalizeCommerceParameters !== "function"
      || !fs.existsSync(commerceWorkflowFile)) {
      throw Object.assign(new Error("H3 带货工作流尚未部署。"), { statusCode: 503 });
    }
    try {
      const template = JSON.parse(fs.readFileSync(commerceWorkflowFile, "utf8"));
      assertCommerceWorkflowContract(template);
      return template;
    } catch (error) {
      throw Object.assign(new Error("H3 带货工作流未能加载或校验失败。", { cause: error }), { statusCode: 503 });
    }
  }

  function handleCommerceCapabilities(_req, res, { sendJson }) {
    try {
      loadCommerceTemplate();
      sendJson(res, 200, { protocol: H3_COMMERCE_PROTOCOL, available: true, resolution_parameters: true }, { "Cache-Control": "no-store" });
    } catch {
      sendJson(res, 503, { protocol: H3_COMMERCE_PROTOCOL, available: false, error: "H3 带货服务尚未部署或工作流不可用。" }, { "Cache-Control": "no-store" });
    }
  }

  async function handleCommerceVideoRequest(req, res, { readJson, sendJson, getComfyUrl, authorizeImage }) {
    try {
      const payload = await readJson(req);
      if (payload.commerce_mode !== true || (payload.mode !== undefined && payload.mode !== "reference")) {
        throw new Error("H3 带货生成模式无效。");
      }
      const result = await executeH3Commerce({
        payload, comfyUrl: getComfyUrl(), ownerUserId: req.auth?.user?.id, authorizeImage,
      });
      sendJson(res, 202, result);
    } catch (error) {
      sendJson(res, error.statusCode || 400, { error: formatErrorMessage(error) });
    }
  }

  async function executeH3Commerce({ payload, comfyUrl, ownerUserId, authorizeImage }) {
    if (!ownerUserId) throw Object.assign(new Error("请登录后提交 H3 带货生成。"), { statusCode: 401 });
    const template = loadCommerceTemplate();
    const commerceParameters = normalizeCommerceParameters(payload);
    const promptA = String(payload.prompt || "").trim();
    const promptB = String(payload.prompt_b || "").trim();
    const images = payload.images;
    if (!promptA || !promptB || !Array.isArray(images) || images.length !== 4) {
      throw new Error("H3 带货需要完整的提示词 A、B 和四张参考图片。");
    }
    for (const [index, image] of images.entries()) {
      if (typeof image?.url !== "string" || !image.url.startsWith("/output/")
        || !H3_COMMERCE_IMAGE_EXTENSION.test(image.url) || !String(image.name || "").trim()) {
        throw new Error(`H3 带货素材 ${index + 1} 不是有效的已保存图片。`);
      }
    }
    const normalizedComfyUrl = comfyClient.normalizeUrl(comfyUrl);
    const taskId = crypto.randomUUID();
    const token = makeUploadToken(taskId);
    const preparedImages = [];
    for (const [index, image] of images.entries()) {
      try {
        await authorizeImage(ownerUserId, image.url);
        preparedImages.push(await prepareMediaReference(image, "image", index, token));
      } catch (error) {
        throw Object.assign(new Error(`H3 带货素材 ${index + 1} 无法读取，请替换为可访问的图片。`), { statusCode: error.statusCode || 400 });
      }
    }
    return enqueueTask(taskId, {
      mode: "commerce", prompt: promptA, promptB, images, videos: [], audios: [],
      commerceTemplate: template, commerceParameters, preparedImages, comfyUrl: normalizedComfyUrl,
    }, ownerUserId);
  }

  async function executeComfyVideoProvider({ provider, input = {}, params = {} } = {}) {
    if ((params.commerce_mode !== undefined && params.commerce_mode !== false)
      || Object.hasOwn(params, "commerce_prompt_b") || params.mode === "commerce") {
      throw new Error("H3 带货必须使用专用生成接口。");
    }
    if (params.mode && params.mode !== "reference" && !H3_FRAMES_MODES.includes(params.mode)) {
      throw new Error("MiniMax H3 生成模式无效。");
    }
    if (!fs.existsSync(workflowFile)) throw new Error("MiniMax H3 工作流文件不存在，请检查工作流配置。");
    const normalized = normalizeRequest({
      mode: params.mode,
      prompt: input.prompt,
      images: input.images,
      videos: input.videos,
      audios: input.audios,
      aspect_ratio: params.aspectRatio,
      megapixels: params.megapixels,
      steps: params.steps,
      duration: params.duration,
      ref_image_size: params.refImageSize,
      seed: params.seed,
    });
    return enqueueTask(crypto.randomUUID(), { ...normalized, comfyUrl: provider.baseUrl });
  }

  function enqueueTask(taskId, request, ownerUserId) {
    cleanupTasks();
    const commerceMode = Boolean(request.commerceTemplate);
    mediaTaskService.set(taskId, {
      id: taskId,
      type: "minimax-h3-video",
      status: "queued",
      progress: 5,
      message: "任务已创建，准备上传参考素材...",
      created_at: now(),
      updated_at: now(),
      images: [],
      promptB: commerceMode ? request.promptB : "",
      commerceMode,
      ...(ownerUserId ? { ownerUserId } : {}),
      videos: [],
    });
    runTask(taskId, request).catch((error) => {
      const message = formatErrorMessage(error);
      updateTask(taskId, {
        status: "failed",
        progress: 0,
        message: `MiniMax H3 生成失败：${message}`,
        error: message,
      });
    });
    return { task_id: taskId };
  }

  async function runTask(taskId, request) {
    const commerceMode = Boolean(request.commerceTemplate);
    updateTask(taskId, { status: "running", progress: 10, message: "正在上传参考素材到 ComfyUI..." });
    const comfyUrl = comfyClient.normalizeUrl(request.comfyUrl);
    const uploadToken = makeUploadToken(taskId);
    const uploaded = { images: [], videos: [], audios: [] };
    const groups = [
      ["images", "image"],
      ["videos", "video"],
      ["audios", "audio"],
    ];

    let uploadedCount = 0;
    const totalUploads = request.images.length + request.videos.length + request.audios.length;
    for (const [collection, kind] of groups) {
      for (const [index, reference] of request[collection].entries()) {
        const media = request.preparedImages?.[index] || await prepareMediaReference(reference, kind, index, uploadToken);
        const result = await comfyClient.uploadFile(comfyUrl, media);
        const name = [result.subfolder, result.name || media.filename].filter(Boolean).join("/");
        uploaded[collection].push({ ...reference, name });
        uploadedCount += 1;
        updateTask(taskId, {
          progress: 10 + Math.round((uploadedCount / Math.max(1, totalUploads)) * 18),
          message: `正在上传参考素材 (${uploadedCount}/${totalUploads})...`,
        });
      }
    }

    const seed = Number.isSafeInteger(request.seed) ? request.seed : crypto.randomInt(1, 2147483647);
    const framesMode = H3_FRAMES_MODES.includes(String(request.mode || ""));
    const templatePath = framesMode ? path.join(path.dirname(workflowFile), H3_FRAMES_WORKFLOW_NAME) : workflowFile;
    if (framesMode && !fs.existsSync(templatePath)) {
      throw new Error(`MiniMax H3 首尾帧工作流模板缺失：${H3_FRAMES_WORKFLOW_NAME}，请重新部署后再试。`);
    }
    const workflowTemplate = request.commerceTemplate || JSON.parse(fs.readFileSync(templatePath, "utf8"));
    const outputPrefix = `video/minimax_h3_${now()}_${taskId.slice(0, 8)}`;
    let workflow;
    if (commerceMode) {
      workflow = prepareCommerceWorkflow(workflowTemplate, {
        ...request.commerceParameters,
        prompt_a: request.prompt,
        prompt_b: request.promptB,
        images: uploaded.images,
      }, outputPrefix);
    } else {
      workflow = prepareWorkflow(workflowTemplate, {
        ...request,
        seed,
        images: uploaded.images,
        videos: uploaded.videos,
        audios: uploaded.audios,
      }, outputPrefix);
    }

    const outputIds = commerceMode
      ? workflow["604"]?.class_type === "VHS_VideoCombine" && workflow["604"]?.inputs?.save_output === true ? ["604"] : []
      : Object.entries(workflow)
        .filter(([, node]) => node?.class_type === "SaveVideo")
        .map(([id]) => id);
    if (!outputIds.length) throw new Error("MiniMax H3 工作流缺少保存视频的节点，请检查工作流配置。");

    updateTask(taskId, {
      progress: 30,
      message: commerceMode ? "正在提交 H3 带货工作流..." : "正在提交 MiniMax H3 工作流...",
      seed,
    });
    const promptId = await comfyClient.submitPrompt(comfyUrl, workflow);
    updateTask(taskId, {
      progress: 35,
      message: "ComfyUI 已接收任务，正在生成视频...",
      prompt_id: promptId,
    });

    const history = await comfyClient.waitForHistory(comfyUrl, promptId, (status) => updateTask(taskId, {
      ...status,
      message: status.message || "MiniMax H3 正在生成视频，可能需要几分钟...",
    }));
    updateTask(taskId, { progress: 94, message: "视频生成完成，正在保存到本地..." });
    const videos = await comfyClient.saveHistoryVideos(comfyUrl, history, `minimax_h3_${now()}_`, outputIds);
    if (!videos.length) {
      const observed = Object.keys(history?.outputs || {}).join("、") || "无";
      throw new Error(`ComfyUI 已完成，但未找到可保存的视频。保存节点：${outputIds.join("、")}；返回节点：${observed}。`);
    }

    await registerTaskVideos(taskId, videos);
    updateTask(taskId, {
      status: "success",
      progress: 100,
      message: commerceMode ? "H3 带货视频生成完成。" : "MiniMax H3 视频生成完成。",
      videos,
      comfy: comfyUrl,
      seed,
    });
  }

  async function registerTaskVideos(taskId, videos) {
    const owner = mediaTaskService.get(taskId)?.ownerUserId;
    if (owner && registerMedia) for (const video of videos) {
      const url = typeof video === "string" ? video : video.url;
      if (url?.startsWith("/output/")) await registerMedia(owner, { url, filename: path.basename(url) }, "video/mp4", { source: "generated" });
    }
  }

  function prepareMediaReference(reference, kind, index, token) {
    const sanitized = sanitizeReferenceName(reference.name, kind, index);
    const uploadName = makeUploadFilename(sanitized, `${token}_${kind}_${index + 1}`);
    return mediaReferenceToFile(reference.url, uploadName, kind);
  }

  return Object.freeze({
    handleVideoRequest,
    handleCommerceCapabilities,
    handleCommerceVideoRequest,
    executeComfyVideoProvider,
    runTask,
  });
}

module.exports = { createMinimaxH3TaskService };
