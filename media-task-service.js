"use strict";

const fsDefault = require("node:fs");

const DEFAULT_TASK_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PERSIST_DELAY_MS = 400;

function normalizeTaskId(value) {
  return String(value || "");
}

function createMediaTaskService({
  filePath,
  fs = fsDefault,
  now = Date.now,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  persistDelayMs = DEFAULT_PERSIST_DELAY_MS,
  taskTtlMs = DEFAULT_TASK_TTL_MS,
  logger = console,
} = {}) {
  if (!filePath) throw new TypeError("Media task service requires a persistence file path.");
  if (!fs || typeof fs.existsSync !== "function" || typeof fs.readFileSync !== "function" || typeof fs.writeFileSync !== "function") {
    throw new TypeError("Media task service requires a filesystem adapter.");
  }

  const tasks = new Map();
  const watchers = new Map();
  let persistTimer = null;

  function get(taskId) {
    return tasks.get(normalizeTaskId(taskId));
  }

  function has(taskId) {
    return tasks.has(normalizeTaskId(taskId));
  }

  function set(taskId, task) {
    const id = normalizeTaskId(taskId);
    if (!id) throw new Error("Media task id is required.");
    const normalized = task && typeof task === "object" ? { ...task, id } : task;
    tasks.set(id, normalized);
    if (normalized?.type === "api-video") schedulePersist();
    return normalized;
  }

  function remove(taskId) {
    const id = normalizeTaskId(taskId);
    const removed = tasks.delete(id);
    stopWatcher(id);
    if (removed) schedulePersist();
    return removed;
  }

  function update(taskId, patch) {
    const id = normalizeTaskId(taskId);
    const task = tasks.get(id);
    if (!task) return null;
    const updated = {
      ...task,
      ...(patch && typeof patch === "object" ? patch : {}),
      updated_at: now(),
    };
    tasks.set(id, updated);
    if (updated.type === "api-video") schedulePersist();
    return updated;
  }

  function snapshotApiVideoTasks() {
    const snapshot = {};
    for (const [taskId, task] of tasks.entries()) {
      if (task?.type !== "api-video" || !task.resume?.resumeTask?.taskId) continue;
      snapshot[taskId] = {
        id: taskId,
        type: "api-video",
        status: task.status,
        progress: task.progress,
        message: task.message || "",
        error: task.error || "",
        created_at: task.created_at,
        updated_at: task.updated_at,
        videos: Array.isArray(task.videos) ? task.videos : [],
        images: Array.isArray(task.images) ? task.images : [],
        resume: task.resume,
      };
    }
    return snapshot;
  }

  function persistNow() {
    if (persistTimer) {
      clearTimeoutFn(persistTimer);
      persistTimer = null;
    }
    try {
      fs.writeFileSync(filePath, JSON.stringify(snapshotApiVideoTasks(), null, 2));
      return true;
    } catch {
      // Persistence failure must not stop media generation already in memory.
      return false;
    }
  }

  function schedulePersist() {
    if (persistTimer) return;
    persistTimer = setTimeoutFn(() => {
      persistTimer = null;
      persistNow();
    }, Math.max(0, Number(persistDelayMs) || 0));
    persistTimer?.unref?.();
  }

  function restoreApiVideoTasks({ onRestore } = {}) {
    let stored = {};
    try {
      if (!fs.existsSync(filePath)) return 0;
      stored = JSON.parse(fs.readFileSync(filePath, "utf8") || "{}");
    } catch {
      return 0;
    }
    if (!stored || typeof stored !== "object") return 0;

    let restored = 0;
    for (const [taskId, storedTask] of Object.entries(stored)) {
      if (!storedTask || typeof storedTask !== "object") continue;
      if (storedTask.type !== "api-video" || !storedTask.resume?.resumeTask?.taskId) continue;
      if (tasks.has(taskId)) continue;
      const finished = storedTask.status === "success";
      const task = {
        ...storedTask,
        id: taskId,
        type: "api-video",
        images: Array.isArray(storedTask.images) ? storedTask.images : [],
        videos: Array.isArray(storedTask.videos) ? storedTask.videos : [],
        status: finished ? "success" : "pending",
        progress: finished ? 100 : Math.max(10, Number(storedTask.progress) || 10),
        error: "",
        message: finished
          ? storedTask.message || "视频已生成。"
          : "服务重启过，任务仍在排队或生成中；点“继续查询视频”取回结果，不会重复扣费。",
        updated_at: now(),
      };
      tasks.set(taskId, task);
      if (!finished && typeof onRestore === "function") onRestore(taskId, task);
      restored += 1;
    }
    if (restored) logger?.log?.(`Restored ${restored} API video task(s) from ${filePath}`);
    return restored;
  }

  function setWatcher(taskId, timer) {
    const id = normalizeTaskId(taskId);
    if (!id || !timer) return;
    watchers.set(id, timer);
  }

  function hasWatcher(taskId) {
    return watchers.has(normalizeTaskId(taskId));
  }

  function deleteWatcher(taskId) {
    return watchers.delete(normalizeTaskId(taskId));
  }

  function stopWatcher(taskId) {
    const id = normalizeTaskId(taskId);
    const timer = watchers.get(id);
    if (!timer) return false;
    clearTimeoutFn(timer);
    watchers.delete(id);
    return true;
  }

  function cleanupExpired() {
    const expiresAt = now() - Math.max(0, Number(taskTtlMs) || 0);
    let droppedApiVideo = false;
    for (const [taskId, task] of tasks.entries()) {
      if ((task.updated_at || task.created_at || 0) >= expiresAt) continue;
      tasks.delete(taskId);
      stopWatcher(taskId);
      if (task.type === "api-video") droppedApiVideo = true;
    }
    if (droppedApiVideo) schedulePersist();
    return droppedApiVideo;
  }

  function dispose() {
    if (persistTimer) {
      clearTimeoutFn(persistTimer);
      persistTimer = null;
    }
    for (const timer of watchers.values()) clearTimeoutFn(timer);
    watchers.clear();
  }

  return Object.freeze({
    get,
    has,
    set,
    update,
    remove,
    snapshotApiVideoTasks,
    persistNow,
    schedulePersist,
    restoreApiVideoTasks,
    setWatcher,
    hasWatcher,
    deleteWatcher,
    stopWatcher,
    cleanupExpired,
    dispose,
  });
}

module.exports = { createMediaTaskService };
