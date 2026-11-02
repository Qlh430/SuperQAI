"use strict";

function createApiVideoTaskService({
  mediaTaskService,
  mediaProviderBridge,
  updateTask,
  isVideoMediaUrl,
  saveRemoteVideo,
  registerVideoOutput,
  waitForAbortableDelay,
  formatErrorMessage,
  sendJson,
  pollMs,
  taskTimeoutMs,
  watchMs,
  watchMaxMs,
  now = Date.now,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  for (const [name, dependency] of Object.entries({
    mediaTaskService,
    mediaProviderBridge,
    updateTask,
    isVideoMediaUrl,
    saveRemoteVideo,
    registerVideoOutput,
    waitForAbortableDelay,
    formatErrorMessage,
    sendJson,
  })) {
    if (!dependency) throw new TypeError(`API video task service requires ${name}.`);
  }

  const running = new Set();

  // Dreamina answers a queued clip with a queue position. Saying "排队中" is the
  // difference between an operator waiting and an operator resubmitting a paid job.
  function queueMessage(progress) {
    if (!progress || typeof progress !== "object") return "";
    const position = Number(progress.position);
    if (!Number.isFinite(position) || position <= 0) return "";
    const length = Number(progress.length);
    return Number.isFinite(length) && length > 0
      ? `即梦排队中：前面还有 ${Math.round(position)} 位（共 ${Math.round(length)} 位）`
      : `即梦排队中：前面还有 ${Math.round(position)} 位`;
  }

  // A query that failed while the task kept its upstream id is a slow task, not a
  // lost one: the same task is polled again instead of reporting a failure.
  function isPendingError(error) {
    const code = String(error?.code || "");
    if (["UPSTREAM_TASK_PENDING", "UPSTREAM_TIMEOUT", "jimeng_cli_query_failed"].includes(code)) return true;
    if (["submitted", "unknown"].includes(String(error?.submissionState || ""))) return true;
    return error?.retryable === true;
  }

  async function runTask(taskId, context, options = {}) {
    const startedAt = now();
    const timeoutMs = Number.isFinite(Number(options.timeoutMs)) && Number(options.timeoutMs) > 0
      ? Number(options.timeoutMs)
      : taskTimeoutMs;
    const deadline = startedAt + timeoutMs;
    // 排队时长要按任务本身算，不然后台每次补查都会显示"已等待 3 秒"。
    const taskStartedAt = Number(mediaTaskService.get(taskId)?.created_at) || startedAt;
    let attempt = 0;
    let pendingMessage = "";
    while (now() < deadline) {
      if (attempt > 0) await waitForAbortableDelay(pollMs);
      attempt += 1;
      let result;
      try {
        result = await mediaProviderBridge.generateVideo({
          prompt: context.prompt,
          providerId: context.providerId,
          modelId: context.modelId,
          options: { resumeTask: context.resumeTask },
        });
      } catch (error) {
        if (!isPendingError(error)) throw error;
        pendingMessage = pendingMessage || "视频仍在排队或生成中，任务已保留；稍后可继续查询。";
        updateTask(taskId, {
          progress: Math.min(90, 12 + attempt * 4),
          message: pendingMessage,
        });
        continue;
      }
      const data = Array.isArray(result?.data) ? result.data : [];
      const remoteUrls = [...new Set(data.map((item) => String(item?.url || "")).filter(isVideoMediaUrl))];
      if (!remoteUrls.length) {
        const waited = Math.round((now() - taskStartedAt) / 1000);
        const queued = queueMessage(result?.progress);
        if (queued) pendingMessage = queued;
        updateTask(taskId, {
          progress: Math.min(90, 12 + attempt * 4),
          message: queued || `视频正在生成，已等待 ${waited} 秒...`,
        });
        continue;
      }
      updateTask(taskId, { progress: 94, message: "视频生成完成，正在保存到本地..." });
      const videos = [];
      for (const remoteUrl of remoteUrls.slice(0, 4)) {
        const saved = await saveRemoteVideo(remoteUrl, `api_video_${Date.now()}_`);
        if (saved && !videos.includes(saved)) videos.push(saved);
      }
      if (!videos.length) throw new Error("视频已生成，但没有可用的本地文件。");
      for (const url of videos) await registerVideoOutput(context.userId, url);
      updateTask(taskId, { status: "success", progress: 100, message: "视频生成完成。", videos });
      return;
    }
    // The wait budget ran out while the upstream task still exists. Reporting a
    // failure here would invite a second paid submission for a clip that is merely
    // queued or still rendering.
    updateTask(taskId, {
      status: "pending",
      progress: 90,
      error: "",
      message: pendingMessage || "视频仍在排队或生成中，任务已保留；稍后可继续查询。",
    });
    scheduleWatch(taskId);
  }

  // Polling is restartable: the first submission and every later "继续查询" go
  // through the same loop, so a queued clip is never re-submitted.
  function startPolling(taskId, message) {
    const task = mediaTaskService.get(taskId);
    const context = task?.resume;
    if (!context?.resumeTask?.taskId) throw new Error("这个视频任务没有可继续查询的上游任务编号。");
    if (running.has(taskId)) return false;
    running.add(taskId);
    // 手动"继续查询"和后台跟进不能同时跑同一笔任务。
    stopWatch(taskId);
    updateTask(taskId, {
      status: "running",
      progress: Math.max(8, Number(task.progress) || 0),
      error: "",
      message: message || "正在查询已提交的视频任务...",
    });
    runTask(taskId, context)
      .catch((error) => {
        updateTask(taskId, {
          status: "failed",
          progress: 0,
          message: `视频生成失败：${formatErrorMessage(error)}`,
          error: formatErrorMessage(error),
        });
      })
      .finally(() => { running.delete(taskId); });
    return true;
  }

  function stopWatch(taskId) {
    return mediaTaskService.stopWatcher(taskId);
  }

  /**
   * 排队中的视频任务在快速轮询窗口结束后由这里接手：隔几分钟探一次，直到出片、
   * 真正失败、记录消失或超过跟进时限。这样即使要等十几小时，结果也会自己落回
   * 画布，而不是等用户想起再点一次。
   */
  function scheduleWatch(taskId, delayMs = watchMs) {
    const id = String(taskId || "");
    if (!id || mediaTaskService.hasWatcher(id)) return false;
    const task = mediaTaskService.get(id);
    if (!task || task.type !== "api-video" || !task.resume?.resumeTask?.taskId) return false;
    if (task.status === "success" || task.status === "failed") return false;
    if (now() - (task.created_at || now()) > watchMaxMs) return false;
    const timer = setTimeoutFn(() => {
      mediaTaskService.deleteWatcher(id);
      const current = mediaTaskService.get(id);
      if (!current || current.status === "success" || current.status === "failed") return;
      if (now() - (current.created_at || now()) > watchMaxMs) return;
      if (running.has(id)) {
        scheduleWatch(id);
        return;
      }
      running.add(id);
      // 一次补查只探很短一段，避免后台长期占着轮询循环。
      runTask(id, current.resume, { timeoutMs: pollMs })
        .catch((error) => {
          updateTask(id, {
            status: "failed",
            progress: 0,
            message: `视频生成失败：${formatErrorMessage(error)}`,
            error: formatErrorMessage(error),
          });
        })
        .finally(() => {
          running.delete(id);
          const latest = mediaTaskService.get(id);
          if (latest && latest.status !== "success" && latest.status !== "failed") scheduleWatch(id);
        });
    }, Math.max(1_000, Number(delayMs) || watchMs));
    timer.unref?.();
    mediaTaskService.setWatcher(id, timer);
    return true;
  }

  async function handleResume(req, res, taskId) {
    try {
      const task = mediaTaskService.get(taskId);
      if (!task || task.type !== "api-video") {
        sendJson(res, 404, { error: "没有找到这个视频任务。", code: "VIDEO_TASK_NOT_FOUND" });
        return;
      }
      if (task.status === "success") {
        sendJson(res, 200, { task_id: task.id, status: task.status, videos: task.videos || [] });
        return;
      }
      startPolling(task.id, "正在继续查询已提交的视频任务...");
      sendJson(res, 202, { task_id: task.id, status: "running" });
    } catch (error) {
      sendJson(res, 400, { error: formatErrorMessage(error), code: String(error?.code || "") });
    }
  }

  return Object.freeze({
    runTask,
    startPolling,
    stopWatch,
    scheduleWatch,
    handleResume,
    isRunning: (taskId) => running.has(String(taskId || "")),
  });
}

module.exports = { createApiVideoTaskService };
