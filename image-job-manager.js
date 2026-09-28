const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ACTIVE_STATES = new Set(["queued", "submitting", "running", "syncing"]);
const TERMINAL_STATES = new Set(["completed", "sync_failed", "task_pending", "failed", "unknown"]);

function createImageJobManager({ filePath, timeoutMs, execute, mediaBridge, recover: recoverImpl, recoverTask, now = () => Date.now() } = {}) {
  if (!filePath) throw new Error("Image job manager requires filePath.");
  const executeJob = typeof execute === "function"
    ? execute
    : mediaBridge && typeof mediaBridge.generateImage === "function"
      ? async (payload, context) => ({
        status: 200,
        body: await mediaBridge.generateImage({ ...payload, signal: context.signal }),
      })
      : null;
  if (!executeJob) throw new Error("Image job manager requires execute or mediaBridge.");
  const deadlineMs = Math.max(1, Number(timeoutMs || 15 * 60 * 1000));
  const jobs = readJobs(filePath);
  const payloads = new Map();
  const controllers = new Map();
  const recoveryPromises = new Map();

  recoverInterrupted();

  function create(payload = {}, metadata = {}) {
    const timestamp = new Date(now()).toISOString();
    const id = `imgjob_${now()}_${crypto.randomBytes(5).toString("hex")}`;
    jobs[id] = {
      id,
      state: "queued",
      boardId: String(metadata.boardId || ""),
      nodeId: String(metadata.nodeId || ""),
      model: String(payload.model || ""),
      createdAt: timestamp,
      updatedAt: timestamp,
      deadlineAt: new Date(now() + deadlineMs).toISOString(),
      result: null,
      remoteTask: null,
      error: "",
      code: "",
    };
    payloads.set(id, payload);
    persist();
    setImmediate(() => start(id));
    return publicJob(jobs[id]);
  }

  async function start(id) {
    const job = jobs[id];
    const payload = payloads.get(id);
    if (!job || !payload || job.state !== "queued") return publicJob(job);
    const controller = new AbortController();
    controllers.set(id, controller);
    transition(job, "submitting");
    const timer = setTimeout(() => {
      if (TERMINAL_STATES.has(job.state)) return;
      controller.abort(new Error("Image job deadline exceeded."));
      if (job.state === "syncing" && job.result) {
        transition(job, "sync_failed", {
          code: "image_sync_failed",
          error: "图片已生成，但原图同步超时；可继续恢复原图，系统不会重新提交生图。",
        });
      } else if (job.remoteTask) {
        markTaskPending(job);
      } else {
        transition(job, "unknown", {
          code: "image_job_timeout_unknown",
          error: "图片服务等待超过上限，结果待确认；为避免重复扣费，系统不会自动重新提交。",
        });
      }
    }, deadlineMs);
    try {
      transition(job, "running");
      const response = await executeJob(payload, {
        jobId: id,
        signal: controller.signal,
        report: (state, details = {}) => {
          if (!ACTIVE_STATES.has(job.state) || !["submitting", "running", "syncing"].includes(state)) return;
          const nextDetails = { ...details };
          if (nextDetails.remoteTask) nextDetails.remoteTask = sanitizeRemoteTask(nextDetails.remoteTask);
          if (nextDetails.remoteResult && !nextDetails.result) nextDetails.result = nextDetails.remoteResult;
          delete nextDetails.remoteResult;
          transition(job, state, nextDetails);
        },
      });
      if (TERMINAL_STATES.has(job.state)) return publicJob(job);
      const status = Number(response?.status || 500);
      const body = response?.body && typeof response.body === "object" ? response.body : {};
      if (status >= 200 && status < 300) {
        const completed = hasVerifiedLocalImages(body);
        if (completed) {
          transition(job, "completed", { result: body, code: "", error: "" });
        } else if (sanitizeRemoteTask(job.remoteTask) && !hasRecoverableRemoteImages(body)) {
          markTaskPending(job, "任务已提交，正在等待生成结果。");
        } else if (!hasImagePayload(body)) {
          transition(job, "failed", {
            result: body,
            code: "image_result_empty",
            error: "图片服务没有返回可用的图片结果。",
          });
        } else {
          transition(job, "sync_failed", {
            result: body,
            code: "image_sync_failed",
            error: String(body.sync_error || "图片已由接口生成，但原图尚未保存到本机。"),
          });
        }
      } else {
        transition(job, "failed", {
          result: null,
          code: String(body.code || "image_job_failed"),
          error: getErrorMessage(body, `图片生成失败 (${status})`),
        });
      }
      return publicJob(job);
    } catch (error) {
      if (TERMINAL_STATES.has(job.state)) return publicJob(job);
      if (job.state === "syncing" && job.result) {
        transition(job, "sync_failed", {
          code: "image_sync_failed",
          error: String(error?.message || error || "图片原图同步失败。"),
        });
        return publicJob(job);
      }
      if (job.remoteTask && !isTerminalTaskFailure(error)) {
        markTaskPending(job, error?.message);
        return publicJob(job);
      }
      const ambiguous = isAmbiguousSubmissionError(error);
      transition(job, ambiguous ? "unknown" : "failed", {
        result: null,
        code: ambiguous
          ? "image_job_result_unknown"
          : isTerminalTaskFailure(error)
            ? "image_task_failed"
            : error?.submissionState === "not_submitted" ? "image_job_not_submitted" : "image_job_failed",
        error: ambiguous
          ? "图片服务连接中断，结果待确认；为避免重复扣费，系统不会自动重新提交。"
          : String(error?.message || error || "图片生成失败。"),
      });
      return publicJob(job);
    } finally {
      clearTimeout(timer);
      controllers.delete(id);
      payloads.delete(id);
    }
  }

  function get(id) {
    return publicJob(jobs[String(id || "")] || null);
  }

  async function recover(id) {
    const job = jobs[String(id || "")];
    if (!job) return null;
    if (recoveryPromises.has(job.id)) return recoveryPromises.get(job.id);
    const taskRecovery = Boolean(sanitizeRemoteTask(job.remoteTask))
      && (job.state === "task_pending" || (job.state === "sync_failed" && !hasRecoverableRemoteImages(job.result)));
    if (job.state !== "sync_failed" && !taskRecovery) return publicJob(job);
    const promise = Promise.resolve().then(async () => {
      transition(job, taskRecovery ? "running" : "syncing", { error: "", code: "", deadlineAt: new Date(now() + deadlineMs).toISOString() });
      const controller = new AbortController();
      let timer;
      try {
        const recovery = taskRecovery ? recoverTask : recoverImpl;
        if (typeof recovery !== "function") throw new Error("此图片任务暂不支持恢复结果。");
        const response = await Promise.race([
          recovery(taskRecovery ? job.remoteTask : job.result, {
            jobId: job.id, model: job.model, signal: controller.signal,
            report: (state, details = {}) => {
              if (!ACTIVE_STATES.has(job.state) || state !== "syncing") return;
              transition(job, state, { result: details.remoteResult || details.result || job.result });
            },
          }),
          new Promise((_, reject) => { timer = setTimeout(() => {
            const error = new Error("恢复结果等待超时，请稍后继续查询。");
            controller.abort(error); reject(error);
          }, deadlineMs); }),
        ]);
        const body = response?.body && typeof response.body === "object" ? response.body : {};
        if (taskRecovery && Number(response?.status) >= 400 && isTerminalTaskFailure(body)) {
          transition(job, "failed", { error: getErrorMessage(body, "图片任务失败。"), code: "image_task_failed" });
          return publicJob(job);
        }
        if (!hasVerifiedLocalImages(body)) throw new Error(getErrorMessage(body, "图片原图仍未同步到本机。"));
        transition(job, "completed", { result: body, error: "", code: "" });
      } catch (error) {
        if (taskRecovery && !(job.state === "syncing" && job.result)) {
          if (isTerminalTaskFailure(error)) transition(job, "failed", { error: error.message, code: "image_task_failed" });
          else markTaskPending(job, error?.message);
        } else transition(job, "sync_failed", {
          code: "image_sync_failed",
          error: String(error?.message || error || "图片原图同步失败。"),
        });
      } finally {
        clearTimeout(timer);
        recoveryPromises.delete(job.id);
      }
      return publicJob(job);
    });
    recoveryPromises.set(job.id, promise);
    return promise;
  }

  function recoverInterrupted() {
    let changed = false;
    for (const job of Object.values(jobs)) {
      if (job?.state === "sync_failed" && !hasRecoverableRemoteImages(job.result)) {
        if (sanitizeRemoteTask(job.remoteTask)) markTaskPending(job, "任务已提交，正在等待生成结果。", false);
        else transition(job, "failed", {
          code: "image_result_empty",
          error: "图片服务没有返回可用的图片结果。",
        }, false);
        changed = true;
        continue;
      }
      if (
        job?.state === "completed"
        && !hasVerifiedLocalImages(job.result)
        && hasRecoverableRemoteImages(job.result)
      ) {
        transition(job, "sync_failed", {
          code: "image_sync_failed",
          error: "旧任务已生成图片，但原图尚未保存到本机；可继续恢复原图，系统不会重新提交生图。",
        }, false);
        changed = true;
        continue;
      }
      if (!ACTIVE_STATES.has(job?.state)) continue;
      if (job.state === "syncing" && job.result) {
        transition(job, "sync_failed", {
          code: "image_sync_failed",
          error: "服务曾在同步原图期间中断，可继续恢复原图；系统不会重新提交生图。",
        }, false);
        changed = true;
        continue;
      }
      if (sanitizeRemoteTask(job.remoteTask)) {
        markTaskPending(job, "服务曾中断，已保留上游任务编号，可以继续查询。", false);
        changed = true;
        continue;
      }
      transition(job, "unknown", {
        result: null,
        code: "image_job_interrupted_unknown",
        error: "服务曾在生成期间中断，结果待确认；系统不会自动重新提交。",
      }, false);
      changed = true;
    }
    if (changed) persist();
  }

  function transition(job, state, details = {}, shouldPersist = true) {
    if (!job) return;
    job.state = state;
    job.updatedAt = new Date(now()).toISOString();
    Object.assign(job, details);
    if (shouldPersist) persist();
  }

  function markTaskPending(job, message = "", shouldPersist = true) {
    transition(job, "task_pending", {
      code: "image_task_pending",
      error: message || "任务已提交，暂时无法取得结果；可继续查询，系统不会重复提交。",
    }, shouldPersist);
  }

  function persist() {
    const directory = path.dirname(filePath);
    fs.mkdirSync(directory, { recursive: true });
    const temporary = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ version: 1, jobs }, null, 2));
    fs.renameSync(temporary, filePath);
  }

  return Object.freeze({ create, get, start, recover, recoverInterrupted });
}

function readJobs(filePath) {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return value?.jobs && typeof value.jobs === "object" ? value.jobs : {};
  } catch {
    return {};
  }
}

function publicJob(job) {
  if (!job) return null;
  const taskRecovery = Boolean(sanitizeRemoteTask(job.remoteTask))
    && (job.state === "task_pending" || (job.state === "sync_failed" && !hasRecoverableRemoteImages(job.result)));
  return {
    id: String(job.id || ""),
    state: String(job.state || "unknown"),
    boardId: String(job.boardId || ""),
    nodeId: String(job.nodeId || ""),
    model: String(job.model || ""),
    createdAt: String(job.createdAt || ""),
    updatedAt: String(job.updatedAt || ""),
    deadlineAt: String(job.deadlineAt || ""),
    result: sanitizePublicResult(job.result),
    error: String(job.error || ""),
    code: String(job.code || ""),
    canResume: taskRecovery,
  };
}

function hasVerifiedLocalImages(body) {
  const items = Array.isArray(body?.data) ? body.data : [];
  return items.length > 0 && items.every((item) => (
    /^\/output\//.test(String(item?.local_url || ""))
      || /^\/output\//.test(String(item?.url || ""))
  ));
}

function hasImagePayload(body) {
  const items = Array.isArray(body?.data) ? body.data : [];
  return items.some((item) => (
    /^\/output\//.test(String(item?.local_url || ""))
      || /^\/output\//.test(String(item?.url || ""))
      || /^https?:\/\//i.test(String(item?.url || ""))
      || /^https?:\/\//i.test(String(item?.remote_url || ""))
      || String(item?.b64_json || "").trim().length > 0
  ));
}

function hasRecoverableRemoteImages(body) {
  const items = Array.isArray(body?.data) ? body.data : [];
  return items.some((item) => [item?.url, item?.remote_url, item?.local_url]
    .some((value) => /^https?:\/\//i.test(String(value || ""))));
}

function sanitizePublicResult(result) {
  if (!result || typeof result !== "object") return null;
  const data = Array.isArray(result.data) ? result.data.map((item) => {
    const localUrl = [item?.local_url, item?.url].find((value) => /^\/output\//.test(String(value || ""))) || "";
    return {
      ...(localUrl ? { url: localUrl, local_url: localUrl } : {}),
      width: Math.max(0, Number(item?.width || 0)),
      height: Math.max(0, Number(item?.height || 0)),
    };
  }) : [];
  return {
    ...result,
    data,
    saved_images: Array.isArray(result.saved_images)
      ? result.saved_images.map((item) => ({
        ...(/^\/output\//.test(String(item?.url || "")) ? { url: item.url } : {}),
        ...(item?.error ? { error: String(item.error) } : {}),
        width: Math.max(0, Number(item?.width || 0)),
        height: Math.max(0, Number(item?.height || 0)),
      }))
      : [],
  };
}

function getErrorMessage(body, fallback) {
  return String(body?.error?.message || body?.error || body?.message || fallback);
}

function isAmbiguousSubmissionError(error) {
  if (error?.submissionState === "not_submitted") return false;
  if (["unknown", "submitted"].includes(error?.submissionState) || error?.code === "UPSTREAM_TASK_PENDING") return true;
  const text = `${error?.name || ""} ${error?.code || ""} ${error?.message || error || ""}`.toLowerCase();
  return /abort|timeout|timed out|fetch failed|socket|network|connection reset|econnreset/.test(text);
}

function isTerminalTaskFailure(error) {
  return ["UPSTREAM_TASK_FAILED", "jimeng_cli_task_failed"].includes(String(error?.code || ""));
}

// The CLI transports report their own protocol id, so the resume whitelist has
// to name every transport that can hand back a task id instead of only the two
// HTTP relays. A task id that is dropped here can never be queried again.
const RESUMABLE_PROTOCOLS = ["apimart", "image-relay", "cli:jimeng"];

function sanitizeRemoteTask(value) {
  if (!value || !RESUMABLE_PROTOCOLS.includes(value.protocol) || !value.taskId || !value.providerId || !value.modelId) return null;
  return Object.fromEntries(["protocol", "taskId", "providerId", "modelId", "baseUrl"].map(key => [key, String(value[key] || "")]));
}

module.exports = {
  ACTIVE_STATES,
  TERMINAL_STATES,
  createImageJobManager,
  hasVerifiedLocalImages,
  isAmbiguousSubmissionError,
};
