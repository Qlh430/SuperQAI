"use strict";

const { publicAccess, sanitizeShare } = require("./resource-access");
const { mediaReferenceKey } = require("./canvas-media-references");

function requestPathname(req) {
  try {
    return new URL(req?.url || "/", `http://${req?.headers?.host || "localhost"}`).pathname;
  } catch {
    return "/";
  }
}

function decodeRouteId(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return "";
  }
}

function generatedDisplayName(resource) {
  const title = String(resource?.title || "");
  const generated = String(resource?.metadata?.generatedName || "");
  if (title !== generated) return title;
  return generated.replace(/^BD_(image|video|audio)_(\d{5,})$/, "$1_$2");
}

function createResourceHttpApi({
  resourceAccess,
  listMediaResources = () => [],
  getShareForResource,
  readJson,
  sendJson,
  sendError,
  readPreviewJobs = () => new Map(),
  readPreviewBoards = async () => new Map(),
  resolvePreview = () => null,
  resolveStats = () => null,
} = {}) {
  if (!resourceAccess || typeof resourceAccess.listVisible !== "function") {
    throw new TypeError("Resource HTTP API requires resource access.");
  }
  if (typeof getShareForResource !== "function") {
    throw new TypeError("Resource HTTP API requires a share lookup.");
  }
  if (typeof readJson !== "function" || typeof sendJson !== "function" || typeof sendError !== "function") {
    throw new TypeError("Resource HTTP API requires HTTP helpers.");
  }
  if (typeof readPreviewJobs !== "function" || typeof readPreviewBoards !== "function") {
    throw new TypeError("Resource HTTP API requires preview providers.");
  }
  if (typeof resolvePreview !== "function" || typeof resolveStats !== "function") {
    throw new TypeError("Resource HTTP API requires preview resolvers.");
  }

  async function handle(req, res) {
    const requestPath = requestPathname(req);
    const matches = requestPath === "/api/resources"
      || requestPath.startsWith("/api/resources/")
      || requestPath.startsWith("/api/shares/");
    if (!matches) return false;

    const userId = req?.auth?.user?.id;
    const parts = requestPath.split("/").filter(Boolean);
    try {
      if (!userId) {
        throw Object.assign(new Error("Authentication required"), {
          code: "unauthorized",
          statusCode: 401,
        });
      }

      if (parts[1] === "resources" && !parts[2]) {
        if (req.method === "GET") {
          const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
          const type = url.searchParams.get("type") || null;
          let resources = await resourceAccess.listVisible(userId, type);
          if (url.searchParams.get("scope") === "mine" || url.searchParams.get("history") === "1") resources = resources.filter(resource => resource.ownerUserId === userId);
          if (url.searchParams.get("history") === "1") resources = resources.filter(resource => !Array.isArray(resource.metadata?.historyHiddenFor) || !resource.metadata.historyHiddenFor.includes(userId));
          const entries = [];
          let hasPreviewCandidates = false;
          for (const resource of resources) {
            try {
              const access = await resourceAccess.assertRead(userId, resource.id);
              entries.push({ resource, access: publicAccess(access) });
              hasPreviewCandidates = true;
            } catch (error) {
              if (error?.code !== "share_password_required") throw error;
              const share = getShareForResource(resource.id);
              entries.push({
                resource,
                access: {
                  permission: share?.permission || "read",
                  capabilities: { read: false, comment: false, edit: false, copy: false, share: false, delete: false },
                  share: sanitizeShare(share),
                  locked: true,
                },
              });
            }
          }
          const previewContext = hasPreviewCandidates
            ? { jobs: readPreviewJobs(), boards: await readPreviewBoards() }
            : null;
          const deletedMedia = new Set(listMediaResources().filter(resource => resource.deletedAt).map(resource => mediaReferenceKey(resource.refId)).filter(Boolean));
          const isDeletedMedia = url => deletedMedia.has(mediaReferenceKey(url));
          const withPreviews = entries.map((entry) => {
            const job = entry.resource.refType === "image_job" ? previewContext?.jobs?.get?.(entry.resource.refId) : null;
            const resultImages = job ? [...(job.result?.saved_images || []), ...(job.result?.data || [])]
              .map(item => item?.local_url || item?.url || item?.savedUrl || item?.src)
              .filter(url => typeof url === "string" && url.startsWith("/output/") && !isDeletedMedia(url)) : [];
            const preview = previewContext && !entry.access?.locked ? resolvePreview(entry.resource, previewContext) : null;
            const metadata = entry.resource.metadata;
            const safeResource = metadata ? { ...entry.resource, title: entry.resource.refType === "output_media" ? generatedDisplayName(entry.resource) : entry.resource.title, metadata: { ...metadata, resultImages: metadata.resultImages?.filter(url => !isDeletedMedia(url)) } } : entry.resource;
            return {
            ...entry,
            resource: job ? { ...safeResource, metadata: { ...safeResource.metadata, status: job.state, error: String(job.error || ""), model: String(job.model || ""), boardId: job.boardId, nodeId: job.nodeId, resultImages: [...new Set(resultImages)] } } : safeResource,
            preview: preview && isDeletedMedia(preview.url) ? null : preview,
            stats: previewContext && !entry.access?.locked
              ? resolveStats(entry.resource, previewContext)
              : null,
          }; });
          sendJson(res, 200, { resources: withPreviews }, { "Cache-Control": "no-store" });
          return true;
        }
        if (req.method === "POST") {
          const payload = await readJson(req);
          if (["output_media", "canvas", "history_image", "history_chat", "image_job"].includes(String(payload.refType || ""))) {
            sendJson(res, 403, { error: "媒体、画布和历史记录的归属由宿主服务管理。", code: "forbidden" });
            return true;
          }
          const allowedTypes = new Set(["file", "canvas", "chat", "image", "video", "audio", "job"]);
          if (!allowedTypes.has(String(payload.type || ""))) {
            sendJson(res, 400, { error: "Unsupported resource type.", code: "invalid_resource_type" });
            return true;
          }
          const resource = await resourceAccess.registerResource({
            type: payload.type,
            ownerUserId: userId,
            workspaceId: payload.workspaceId,
            title: payload.title,
            storagePath: payload.storagePath,
            metadata: payload.metadata,
            refType: payload.refType,
            refId: payload.refId,
          });
          sendJson(res, 201, { resource });
          return true;
        }
        sendJson(res, 405, { error: "Method not allowed", code: "method_not_allowed" });
        return true;
      }

      if (parts[1] === "resources" && parts[2]) {
        const resourceId = decodeRouteId(parts[2]);
        const action = parts[3] || "";
        if (action === "shares" && req.method === "POST") {
          const share = await resourceAccess.createShare(userId, resourceId, await readJson(req));
          sendJson(res, 201, { share });
          return true;
        }
        if (!action && req.method === "GET") {
          const access = await resourceAccess.assertRead(userId, resourceId);
          sendJson(res, 200, { resource: access.resource, access: publicAccess(access) });
          return true;
        }
        if (!action && req.method === "PATCH") {
          const payload = await readJson(req);
          const patch = {};
          for (const key of ["title", "workspaceId", "metadata"]) {
            if (payload[key] !== undefined) patch[key] = payload[key];
          }
          const resource = await resourceAccess.updateResource(userId, resourceId, patch);
          sendJson(res, 200, { resource });
          return true;
        }
        if (!action && req.method === "DELETE") {
          const deleted = await resourceAccess.deleteResource(userId, resourceId);
          sendJson(res, 200, { deleted });
          return true;
        }
        sendJson(res, 404, { error: "Resource route not found.", code: "not_found" });
        return true;
      }

      if (parts[1] === "shares" && parts[2]) {
        const shareId = decodeRouteId(parts[2]);
        const action = parts[3] || "";
        if (action === "unlock" && req.method === "POST") {
          const unlocked = await resourceAccess.unlockShare(userId, shareId, (await readJson(req)).password);
          sendJson(res, 200, { unlocked });
          return true;
        }
        if (!action && req.method === "PATCH") {
          const share = await resourceAccess.updateShare(userId, shareId, await readJson(req));
          sendJson(res, 200, { share });
          return true;
        }
        if (!action && req.method === "DELETE") {
          const deleted = await resourceAccess.deleteShare(userId, shareId);
          sendJson(res, 200, { deleted });
          return true;
        }
        sendJson(res, 404, { error: "Share route not found.", code: "not_found" });
        return true;
      }
      sendJson(res, 404, { error: "Resource route not found.", code: "not_found" });
      return true;
    } catch (error) {
      sendError(res, error);
      return true;
    }
  }

  return Object.freeze({ handle });
}

module.exports = { createResourceHttpApi, generatedDisplayName };
