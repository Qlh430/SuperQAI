"use strict";

const path = require("node:path");

function requestPathname(req) {
  try {
    return new URL(req?.url || "/", `http://${req?.headers?.host || "localhost"}`).pathname;
  } catch {
    return "/";
  }
}

function createImageJobHttpApi({
  imageJobManager,
  normalizeBoardId,
  resourceAccess,
  getCanvasStorage,
  getResourceByRef,
  registerMedia,
  outputMediaRef,
  ensureReferencedResource,
  formatUpstreamError,
  readJson,
  sendJson,
} = {}) {
  if (!imageJobManager || typeof imageJobManager.create !== "function"
    || typeof imageJobManager.recover !== "function" || typeof imageJobManager.get !== "function") {
    throw new TypeError("Image job HTTP API requires an image job manager.");
  }
  if (typeof normalizeBoardId !== "function" || typeof ensureReferencedResource !== "function") {
    throw new TypeError("Image job HTTP API requires canvas resource helpers.");
  }
  if (!resourceAccess || typeof resourceAccess.assertWrite !== "function" || typeof resourceAccess.assertRead !== "function") {
    throw new TypeError("Image job HTTP API requires resource access.");
  }
  if (typeof getCanvasStorage !== "function" || typeof getResourceByRef !== "function"
    || typeof registerMedia !== "function" || typeof outputMediaRef !== "function") {
    throw new TypeError("Image job HTTP API requires media ownership helpers.");
  }
  if (typeof formatUpstreamError !== "function" || typeof readJson !== "function" || typeof sendJson !== "function") {
    throw new TypeError("Image job HTTP API requires HTTP helpers.");
  }

  async function assertImageJobAccess(userId, resource, mode) {
    const assertAccess = mode === "write" ? resourceAccess.assertWrite : resourceAccess.assertRead;
    try {
      return await assertAccess(userId, resource.id);
    } catch (error) {
      if (!["forbidden", "share_password_required"].includes(error.code)) throw error;
      const boardId = resource.metadata?.boardId;
      const canvasResource = boardId ? getResourceByRef("canvas", boardId) : null;
      if (!canvasResource) throw error;
      const board = await getCanvasStorage().repository.getBoardState(boardId);
      if (board.deletedAt) throw error;
      return assertAccess(userId, canvasResource.id);
    }
  }

  async function registerImageJobMedia(ownerUserId, job) {
    const images = Array.isArray(job?.result?.saved_images) ? job.result.saved_images : [];
    for (const image of images) {
      const url = String(image?.url || image?.local_url || "");
      if (!url.startsWith("/output/")) continue;
      const refId = outputMediaRef(url);
      if (getResourceByRef("output_media", refId)) continue;
      await registerMedia(ownerUserId, { url, filename: path.basename(refId) }, "image/png", { source: "generated" });
    }
  }

  async function handle(req, res) {
    const requestPath = requestPathname(req);
    const isCollection = requestPath === "/api/image-jobs";
    const isRecover = /^\/api\/image-jobs\/[a-zA-Z0-9_-]{1,160}\/recover$/.test(requestPath);
    const isJob = /^\/api\/image-jobs\/[a-zA-Z0-9_-]{1,160}$/.test(requestPath);
    if (!isCollection && !isRecover && !isJob) return false;
    if (!req?.auth?.user?.id) {
      sendJson(res, 401, { error: "Authentication required", code: "unauthorized" });
      return true;
    }
    const userId = req.auth.user.id;

    if (isCollection && req.method === "POST") {
      try {
        const payload = await readJson(req);
        const boardId = normalizeBoardId(payload.board_id);
        const nodeId = String(payload.node_id || "").trim();
        if (!nodeId || nodeId.length > 160) throw new Error("图片任务缺少有效的画布节点。");
        const canvasResource = getResourceByRef("canvas", boardId);
        if (canvasResource) await resourceAccess.assertWrite(userId, canvasResource.id);
        const job = imageJobManager.create(payload, { boardId, nodeId });
        await ensureReferencedResource(userId, {
          type: "job",
          title: String(payload.prompt || "图片生成任务").slice(0, 240),
          refType: "image_job",
          refId: job.id,
          metadata: { boardId, nodeId },
        }, { currentUserOwnsNew: true });
        sendJson(res, 202, { job_id: job.id, job });
      } catch (error) {
        sendJson(res, Number(error?.statusCode || 400), { error: formatUpstreamError(error), code: error?.code });
      }
      return true;
    }

    try {
      if (isRecover && req.method === "POST") {
        const jobId = requestPath.split("/")[3];
        const resource = await ensureReferencedResource(userId, {
          type: "job",
          title: `图片生成任务 ${jobId}`,
          refType: "image_job",
          refId: jobId,
        });
        await assertImageJobAccess(userId, resource, "write");
        const job = await imageJobManager.recover(jobId);
        if (!job) {
          sendJson(res, 404, { error: "没有找到这个图片任务。" });
          return true;
        }
        await registerImageJobMedia(resource.ownerUserId, job);
        sendJson(res, job.state === "completed" ? 200 : 202, { job });
        return true;
      }

      if (isJob && req.method === "GET") {
        const jobId = requestPath.split("/")[3];
        const job = imageJobManager.get(jobId);
        if (!job) {
          sendJson(res, 404, { error: "没有找到这个图片任务。" });
          return true;
        }
        const resource = await ensureReferencedResource(userId, {
          type: "job",
          title: `图片生成任务 ${job.id}`,
          refType: "image_job",
          refId: job.id,
        });
        await assertImageJobAccess(userId, resource, "read");
        await registerImageJobMedia(resource.ownerUserId, job);
        sendJson(res, 200, { job });
        return true;
      }

      sendJson(res, 405, { error: "Method not allowed" });
    } catch (error) {
      sendJson(res, Number(error?.statusCode || 400), {
        error: error.message,
        code: error?.code || "image_job_error",
      });
    }
    return true;
  }

  return Object.freeze({ handle });
}

module.exports = { createImageJobHttpApi };
