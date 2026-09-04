const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ACTIVE_STATES = new Set(["queued", "submitting", "running"]);
const TERMINAL_STATES = new Set(["completed", "failed", "unknown"]);

function createImageJobManager({ filePath, timeoutMs, execute, mediaBridge, now = () => Date.now() } = {}) {
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
      transition(job, "unknown", {
        code: "image_job_timeout_unknown",
        error: "图片服务等待超过上限，结果待确认；为避免重复扣费，系统不会自动重新提交。",
      });
    }, deadlineMs);
    try {
      transition(job, "running");
      const response = await executeJob(payload, {
        jobId: id,
        signal: controller.signal,
        report: (state, details = {}) => {
          if (!ACTIVE_STATES.has(job.state) || !["submitting", "running"].includes(state)) return;
          transition(job, state, details);
        },
      });
      if (TERMINAL_STATES.has(job.state)) return publicJob(job);
      const status = Number(response?.status || 500);
      const body = response?.body && typeof response.body === "object" ? response.body : {};
      if (status >= 200 && status < 300) {
        transition(job, "completed", { result: body, error: "", code: "" });
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
      const ambiguous = isAmbiguousSubmissionError(error);
      transition(job, ambiguous ? "unknown" : "failed", {
        result: null,
        code: ambiguous ? "image_job_result_unknown" : "image_job_failed",
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

  function recoverInterrupted() {
    let changed = false;
    for (const job of Object.values(jobs)) {
      if (!ACTIVE_STATES.has(job?.state)) continue;
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

  function persist() {
    const directory = path.dirname(filePath);
    fs.mkdirSync(directory, { recursive: true });
    const temporary = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ version: 1, jobs }, null, 2));
    fs.renameSync(temporary, filePath);
  }

  return Object.freeze({ create, get, start, recoverInterrupted });
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
  return {
    id: String(job.id || ""),
    state: String(job.state || "unknown"),
    boardId: String(job.boardId || ""),
    nodeId: String(job.nodeId || ""),
    model: String(job.model || ""),
    createdAt: String(job.createdAt || ""),
    updatedAt: String(job.updatedAt || ""),
    deadlineAt: String(job.deadlineAt || ""),
    result: job.result || null,
    error: String(job.error || ""),
    code: String(job.code || ""),
  };
}

function getErrorMessage(body, fallback) {
  return String(body?.error?.message || body?.error || body?.message || fallback);
}

function isAmbiguousSubmissionError(error) {
  const text = `${error?.name || ""} ${error?.code || ""} ${error?.message || error || ""}`.toLowerCase();
  return /abort|timeout|timed out|fetch failed|socket|network|connection reset|econnreset/.test(text);
}

module.exports = {
  ACTIVE_STATES,
  TERMINAL_STATES,
  createImageJobManager,
  isAmbiguousSubmissionError,
};
