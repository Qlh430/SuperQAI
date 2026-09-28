"use strict";

const defaultCrypto = require("node:crypto");

function createApiVideoHttpService({
  mediaTaskService,
  mediaProviderBridge,
  taskService,
  readJson,
  sendJson,
  getPublicProviderModelCatalog,
  findPublicProviderCatalogModel,
  imageReferenceToFile,
  cleanupTasks,
  isVideoMediaUrl,
  saveRemoteVideo,
  registerVideoOutput,
  providerExecutionHttpStatus,
  formatErrorMessage,
  crypto = defaultCrypto,
  now = Date.now,
} = {}) {
  for (const [name, dependency] of Object.entries({
    mediaTaskService,
    mediaProviderBridge,
    taskService,
    readJson,
    sendJson,
    getPublicProviderModelCatalog,
    findPublicProviderCatalogModel,
    imageReferenceToFile,
    cleanupTasks,
    isVideoMediaUrl,
    saveRemoteVideo,
    registerVideoOutput,
    providerExecutionHttpStatus,
    formatErrorMessage,
  })) {
    if (!dependency) throw new TypeError(`API video HTTP service requires ${name}.`);
  }

  async function handleSubmit(req, res) {
    try {
      const payload = await readJson(req);
      const prompt = String(payload.prompt || "").trim();
      if (!prompt) {
        sendJson(res, 400, { error: "请先输入视频描述。" });
        return;
      }
      const catalog = getPublicProviderModelCatalog("video.generate");
      const requestedModel = String(payload.modelId || payload.model_id || payload.model || "").trim();
      const catalogModel = findPublicProviderCatalogModel(
        catalog.models,
        requestedModel,
        String(payload.providerId || payload.provider_id || "").trim(),
      );
      if (!catalog.models.length) {
        sendJson(res, 400, {
          error: "还没有可用的视频模型，请先在 API 设置里添加支持视频的接入（例如即梦 CLI）。",
          code: "NO_VIDEO_MODEL",
        });
        return;
      }
      const preferredProviderId = String(
        payload.providerId || payload.provider_id || catalogModel?.providerId || "",
      ).trim();
      const preferredModelId = String(catalogModel?.modelId || requestedModel || "").trim();
      const refs = (payload.reference_images || []).filter((ref) => ref && ref.url);
      const inputImages = await Promise.all(refs.slice(0, 1).map((ref, index) => imageReferenceToFile(
        ref.url,
        ref.name || `reference_${index + 1}.png`,
      ).then(async (file) => {
        const bytes = Buffer.from(await file.blob.arrayBuffer());
        return `data:${file.blob.type || "image/png"};base64,${bytes.toString("base64")}`;
      })));
      const duration = payload.duration === undefined
        || payload.duration === null
        || String(payload.duration).trim() === ""
        ? undefined
        : Number(payload.duration);
      let submission = null;
      const result = await mediaProviderBridge.generateVideo({
        prompt,
        providerId: preferredProviderId,
        modelId: preferredModelId,
        size: String(payload.aspect_ratio || payload.size || "").trim(),
        resolution: String(payload.resolution || "").trim(),
        ...(duration === undefined ? {} : { duration }),
        ...(inputImages.length ? { inputImages } : {}),
        options: {
          onTaskSubmitted: (task) => { submission = task; },
        },
      });
      const submissionTask = submission;
      if (!submissionTask?.taskId) {
        const direct = [...new Set((Array.isArray(result?.data) ? result.data : [])
          .map((item) => String(item?.url || ""))
          .filter(isVideoMediaUrl))];
        if (!direct.length) {
          sendJson(res, 502, { error: "视频服务既没有返回任务编号，也没有返回视频文件。" });
          return;
        }
        const videos = [];
        for (const remoteUrl of direct.slice(0, 4)) {
          const saved = await saveRemoteVideo(remoteUrl, `api_video_${now()}_`);
          if (saved && !videos.includes(saved)) videos.push(saved);
        }
        if (!videos.length) throw new Error("视频已生成，但没有可用的本地文件。");
        for (const url of videos) await registerVideoOutput(req.auth.user.id, url);
        sendJson(res, 200, { videos });
        return;
      }
      cleanupTasks();
      const taskId = crypto.randomUUID();
      mediaTaskService.set(taskId, {
        id: taskId,
        type: "api-video",
        status: "running",
        progress: 8,
        message: "任务已提交，正在生成视频...",
        created_at: now(),
        updated_at: now(),
        images: [],
        videos: [],
        resume: {
          userId: req.auth.user.id,
          prompt,
          providerId: preferredProviderId,
          modelId: preferredModelId,
          resumeTask: submissionTask,
        },
      });
      taskService.startPolling(taskId, "任务已提交，正在生成视频...");
      sendJson(res, 202, { task_id: taskId });
    } catch (error) {
      sendJson(res, providerExecutionHttpStatus(error), {
        error: formatErrorMessage(error),
        code: String(error?.code || ""),
      });
    }
  }

  return Object.freeze({ handleSubmit });
}

module.exports = { createApiVideoHttpService };
