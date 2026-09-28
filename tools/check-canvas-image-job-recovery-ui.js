const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { readServerSource } = require("./server-source");

const root = path.join(__dirname, "..");
const clientSource = fs.readFileSync(path.join(root, "script.js"), "utf8");
const serverSource = readServerSource();
const imageSyncApiSource = fs.readFileSync(path.join(root, "image-sync-http-api.js"), "utf8");
const styleSource = fs.readFileSync(path.join(root, "styles.css"), "utf8");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `Missing function ${name}`);
  const bodyStart = source.indexOf("{", source.indexOf(")", start));
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unterminated function ${name}`);
}

assert.match(clientSource, /CANVAS_IMAGE_JOB_ACTIVE_STATES[^;]+syncing/);
assert.match(clientSource, /function recoverCanvasImageJob\(/);
assert.match(clientSource, /图片已生成，正在同步原图到本机/);
assert.match(clientSource, /恢复原图/);
assert.match(clientSource, /function recoverCanvasGalleryContainerMember\(/);
assert.match(clientSource, /getCanvasGalleryContainer\(node\)/);
assert.match(clientSource, /setCanvasGalleryContainer\(node/);
assert.match(clientSource, /function applyRecoveredCanvasGalleryImage\(/);
assert.match(clientSource, /function reconcilePersistedCanvasGallerySyncStates\(/);
assert.match(clientSource, /syncState\s*===\s*"syncing"[\s\S]{0,260}syncState:\s*"pending"/);
assert.match(clientSource, /node\.dataset\.imageJobState\s*===\s*"completed"/);
assert.match(clientSource, /delete node\.dataset\.imageJobCommittedId/);
assert.ok(clientSource.includes("/^\\/output\\//"), "Recovered images must require a verified local /output/ URL");
assert.match(imageSyncApiSource, /\/api\/image-sync\/localize/);
assert.match(serverSource, /createImageSyncHttpApi/);
assert.match(serverSource, /getImageSyncService\(\)\.recover/);
assert.match(styleSource, /\.canvas-gallery-member-pending/);
assert.match(styleSource, /\.canvas-image-job-recover/);

(async () => {
const jobProgress = { statuses: [], recoveries: [], dataset: {} };
const progressContext = {
  CANVAS_IMAGE_JOB_ACTIVE_STATES: new Set(["queued", "submitting", "running", "syncing"]),
  setCanvasImageNodeGenerationState: (_node, active) => { jobProgress.active = active; },
  setCanvasNodeStatus: (_node, status) => jobProgress.statuses.push(status),
  renderCanvasImageRecoveryAction: (_node, jobId) => jobProgress.recoveries.push(jobId),
  clearCanvasImageRecoveryAction: () => { throw new Error("pending task recovery action must remain available"); },
  scheduleCanvasSave: () => {},
};
vm.runInNewContext(extractFunction(clientSource, "syncCanvasImageJobProgress"), progressContext);
progressContext.syncCanvasImageJobProgress(jobProgress, { id: "submitted-task", state: "task_pending", canResume: true });
assert.equal(jobProgress.active, false);
assert.equal(jobProgress.dataset.imageJobState, "task_pending");
assert.equal(jobProgress.recoveries[0], "submitted-task");
assert.match(jobProgress.statuses[0], /任务已提交.*继续查询/);
const safeErrorContext = {};
vm.runInNewContext(extractFunction(clientSource, "getSafeCanvasImageGenerationError"), safeErrorContext);
assert.equal(safeErrorContext.getSafeCanvasImageGenerationError({ code: "image_task_pending", message: "HTTP 503" }).code, "image_task_pending", "a query failure must not become a new-generation fallback");
assert.equal(safeErrorContext.getSafeCanvasImageGenerationError({ code: "image_job_not_submitted", message: "未能连接图片服务，请求尚未提交" }).code, "image_job_not_submitted");
const upstreamRejected = safeErrorContext.getSafeCanvasImageGenerationError({
  code: "UPSTREAM_PROTOCOL",
  message: "图片生成失败：上游服务返回 HTTP 400：unsupported 10k image model: gpt-image-medium",
});
assert.equal(upstreamRejected.code, "image_api_upstream_rejected");
assert.match(upstreamRejected.error, /切换同模型备用接口/);
const contentRejected = safeErrorContext.getSafeCanvasImageGenerationError({
  code: "UPSTREAM_PROTOCOL",
  message: "HTTP 400: content policy rejected the prompt",
});
assert.notEqual(contentRejected.code, "image_api_upstream_rejected", "content moderation must not trigger another provider request");
for (const staleState of ["sync_failed", "task_pending"]) {
  let queried = 0;
  let committed = 0;
  const restored = { dataset: { imageJobId: "restored-job", imageJobState: staleState }, querySelector: () => null };
  const resumeContext = {
    CANVAS_IMAGE_JOB_ACTIVE_STATES: new Set(["queued", "submitting", "running", "syncing"]),
    waitForCanvasImageJob: async () => { queried++; return { id: "restored-job", state: "completed" }; },
    commitCanvasImageJobResult: () => { committed++; return { ok: true }; },
    setCanvasImageNodeGenerationState: () => {}, setCanvasNodeStatus: () => {},
    renderCanvasImageRecoveryAction: () => {}, syncCanvasNodeResolutionState: () => {},
    getSafeCanvasImageGenerationError: safeErrorContext.getSafeCanvasImageGenerationError,
  };
  vm.runInNewContext(`async ${extractFunction(clientSource, "resumeCanvasImageNodeJob")}`, resumeContext);
  await resumeContext.resumeCanvasImageNodeJob(restored);
  assert.equal(queried, 1, "reopening a failed node must recheck the persisted server task");
  assert.equal(committed, 1, "a task recovered on another client must appear after reopening");
}
const completedContext = { ...progressContext, clearCanvasImageRecoveryAction: () => { jobProgress.cleared = true; } };
vm.runInNewContext(extractFunction(clientSource, "syncCanvasImageJobProgress"), completedContext);
completedContext.syncCanvasImageJobProgress(jobProgress, { id: "submitted-task", state: "syncing" });
completedContext.syncCanvasImageJobProgress(jobProgress, { id: "submitted-task", state: "completed" });
assert.equal(jobProgress.active, false, "successful recovery must stop the generating button state");
assert.equal(jobProgress.cleared, true);
const failureStatuses = [];
const failedContext = {
  ...progressContext,
  clearCanvasImageRecoveryAction: () => { jobProgress.failedCleared = true; },
  setCanvasNodeStatus: (_node, status) => failureStatuses.push(status),
};
vm.runInNewContext(extractFunction(clientSource, "syncCanvasImageJobProgress"), failedContext);
failedContext.syncCanvasImageJobProgress(jobProgress, { id: "dead-task", state: "failed", code: "image_result_empty", error: "图片服务没有返回可用的图片结果。" });
assert.equal(jobProgress.failedCleared, true, "a terminal failure must drop the recovery button");
assert.match(failureStatuses[0], /失败：图片服务没有返回可用的图片结果。/, "a terminal failure must replace the stale 'already generated' text");
const recoveryContext = {};
vm.runInNewContext(extractFunction(clientSource, "applyRecoveredCanvasGalleryImage"), recoveryContext);
const originalMembers = [
  { id: "active", name: "Active", src: "/output/active.png", savedUrl: "/output/active.png", syncState: "ready" },
  { id: "remote", name: "Remote", src: "https://example.test/remote.png", savedUrl: "https://example.test/remote.png", syncState: "pending" },
  { id: "other", name: "Other", src: "/output/other.png", savedUrl: "/output/other.png", syncState: "ready" },
];
const recoveredMembers = recoveryContext.applyRecoveredCanvasGalleryImage(originalMembers, "remote", {
  local_url: "/output/recovered.png",
  width: 1024,
  height: 768,
});
assert.deepEqual(JSON.parse(JSON.stringify(recoveredMembers)), [
  originalMembers[0],
  { id: "remote", name: "Remote", src: "/output/recovered.png", savedUrl: "/output/recovered.png", syncState: "ready", width: 1024, height: 768 },
  originalMembers[2],
], "recovering one container member must preserve member order and unrelated members");

const localizeRuntime = new Function("fetchImpl", `
  const IMAGE_SYNC_LOCALIZE_API_URL = "/api/image-sync/localize";
  const canvasGalleryLocalizationPromises = new Map();
  const fetch = fetchImpl;
  async ${extractFunction(clientSource, "localizeCanvasRemoteImage")}
  return { localizeCanvasRemoteImage };
`);
let localizationRequests = 0;
const localize = localizeRuntime(async () => {
  localizationRequests += 1;
  return { ok: true, json: async () => ({ item: { local_url: "/output/recovered.png" } }) };
});
await Promise.all([
  localize.localizeCanvasRemoteImage("https://example.test/remote.png"),
  localize.localizeCanvasRemoteImage("https://example.test/remote.png"),
]);
assert.equal(localizationRequests, 1, "duplicate requests for one remote container member must share one localization request");

const containerRecoveryRuntime = new Function("localizeImpl", `
  function getCanvasGalleryContainer(node) { return node.container; }
  function setCanvasGalleryContainer(node, value) { node.container = value; return value; }
  function refreshCanvasConnectedNodes() {}
  function scheduleCanvasConnectionRender() {}
  function scheduleCanvasSave() {}
  function setCanvasStatus() {}
  function isCanvasGalleryImageReady(image) { return image.syncState === "ready"; }
  function getCanvasGalleryImageSyncLabel() { return "正在同步原图到本机…"; }
  async function localizeCanvasRemoteImage(source) { return localizeImpl(source); }
  ${extractFunction(clientSource, "applyRecoveredCanvasGalleryImage")}
  async ${extractFunction(clientSource, "recoverCanvasGalleryContainerMember")}
  return { recoverCanvasGalleryContainerMember };
`)(async () => ({ local_url: "/output/recovered.png", width: 1024, height: 768 }));
const recoveryNode = {
  dataset: { id: "gallery" },
  classList: { contains: (name) => name === "canvas-node-gallery-container" },
  container: { title: "图集", activeMemberId: "active", members: originalMembers },
};
await containerRecoveryRuntime.recoverCanvasGalleryContainerMember(recoveryNode, "remote");
assert.equal(recoveryNode.container.activeMemberId, "active", "member recovery must preserve the currently active member");
assert.deepEqual(
  JSON.parse(JSON.stringify(recoveryNode.container.members.map((member) => member.id))),
  ["active", "remote", "other"],
  "member recovery must preserve the container member sequence",
);
assert.equal(recoveryNode.container.members[1].savedUrl, "/output/recovered.png");

const failedRecoveryRuntime = new Function("localizeImpl", `
  function getCanvasGalleryContainer(node) { return node.container; }
  function setCanvasGalleryContainer(node, value) { node.container = value; return value; }
  function refreshCanvasConnectedNodes() {}
  function scheduleCanvasConnectionRender() {}
  function scheduleCanvasSave() {}
  function setCanvasStatus() {}
  async function localizeCanvasRemoteImage(source) { return localizeImpl(source); }
  ${extractFunction(clientSource, "applyRecoveredCanvasGalleryImage")}
  async ${extractFunction(clientSource, "recoverCanvasGalleryContainerMember")}
  return { recoverCanvasGalleryContainerMember };
`)(async () => { throw new Error("network failed"); });
const failedRecoveryNode = {
  dataset: { id: "failed-gallery" },
  classList: { contains: (name) => name === "canvas-node-gallery-container" },
  container: { title: "图集", activeMemberId: "active", members: originalMembers },
};
await assert.rejects(() => failedRecoveryRuntime.recoverCanvasGalleryContainerMember(failedRecoveryNode, "remote"), /network failed/);
assert.equal(failedRecoveryNode.container.activeMemberId, "active", "failed recovery must preserve the currently active member");
assert.equal(failedRecoveryNode.container.members[1].syncState, "sync_failed", "failed recovery must mark only its target member as retryable");

console.log("Canvas image job recovery UI checks passed.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
