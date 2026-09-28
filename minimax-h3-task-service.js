"use strict";

const path = require("node:path");

function createMinimaxH3TaskService({
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
      const result = await generateVideo({
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
        modelId: payload.modelId || payload.model_id || payload.model || "minimax-h3",
      });
      sendJson(res, 202, { task_id: result.task_id });
    } catch (error) {
      sendJson(res, 400, { error: formatErrorMessage(error) });
    }
  }

  async function executeComfyVideoProvider({ provider, input = {}, params = {} } = {}) {
    if (!fs.existsSync(workflowFile)) throw new Error("MiniMax H3 workflow file is missing.");
    const normalized = normalizeRequest({
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
    cleanupTasks();
    const taskId = crypto.randomUUID();
    mediaTaskService.set(taskId, {
      id: taskId,
      type: "minimax-h3-video",
      status: "queued",
      progress: 5,
      message: "任务已创建，准备上传参考素材...",
      created_at: now(),
      updated_at: now(),
      images: [],
      videos: [],
    });
    runTask(taskId, { ...normalized, comfyUrl: provider.baseUrl }).catch((error) => {
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
        const result = await uploadMediaReferenceToComfy(comfyUrl, reference, kind, index, uploadToken);
        uploaded[collection].push({ ...reference, name: result.name });
        uploadedCount += 1;
        updateTask(taskId, {
          progress: 10 + Math.round((uploadedCount / Math.max(1, totalUploads)) * 18),
          message: `正在上传参考素材 (${uploadedCount}/${totalUploads})...`,
        });
      }
    }

    const seed = Number.isSafeInteger(request.seed) ? request.seed : crypto.randomInt(1, 2147483647);
    const workflowTemplate = JSON.parse(fs.readFileSync(workflowFile, "utf8"));
    const outputPrefix = `video/minimax_h3_${now()}_${taskId.slice(0, 8)}`;
    const workflow = prepareWorkflow(workflowTemplate, {
      ...request,
      seed,
      images: uploaded.images,
      videos: uploaded.videos,
      audios: uploaded.audios,
    }, outputPrefix);

    updateTask(taskId, { progress: 30, message: "正在提交 MiniMax H3 工作流...", seed });
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
    const videos = await comfyClient.saveHistoryVideos(comfyUrl, history, `minimax_h3_${now()}_`, ["230"]);
    if (!videos.length) {
      const observed = Object.keys(history?.outputs || {}).join(", ") || "none";
      throw new Error(`ComfyUI completed, but no video output was found. Observed output nodes: ${observed}.`);
    }

    updateTask(taskId, {
      status: "success",
      progress: 100,
      message: "MiniMax H3 视频生成完成。",
      videos,
      comfy: comfyUrl,
      seed,
    });
  }

  async function uploadMediaReferenceToComfy(comfyUrl, reference, kind, index, token) {
    const sanitized = sanitizeReferenceName(reference.name, kind, index);
    const uploadName = makeUploadFilename(sanitized, `${token}_${kind}_${index + 1}`);
    const media = await mediaReferenceToFile(reference.url, uploadName, kind);
    const data = await comfyClient.uploadFile(comfyUrl, media);
    const name = [data.subfolder, data.name || media.filename].filter(Boolean).join("/");
    return { ...data, name };
  }

  return Object.freeze({
    handleVideoRequest,
    executeComfyVideoProvider,
    runTask,
  });
}

module.exports = { createMinimaxH3TaskService };
