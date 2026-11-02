"use strict";

const MEDIA_KINDS = new Set(["image", "video", "audio"]);
const ASSET_SCOPES = new Set(["mine", "project", "public", "shared", "favorites"]);
const MEDIA_EXTENSIONS = /\.(png|jpe?g|webp|gif|avif|bmp|tiff?|svg|mp4|webm|mov|mkv|m4v|mp3|wav|ogg|opus|aac|flac|m4a)$/i;
function uploadDisplayName(value, kind) {
  return String(value || "").split(/[\\/]/).pop().replace(MEDIA_EXTENSIONS, "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 120) || ({ image: "图片", video: "视频", audio: "音频" })[kind];
}
function generatedDisplayName(resource, name = resource?.title) {
  const original = String(resource?.title || "");
  const generated = String(resource?.metadata?.generatedName || "");
  const value = String(name || "");
  // Older automatic titles are identified by both their creation metadata and
  // the still-unmodified resource title. A resource or alias renamed by a user
  // therefore remains untouched, and no stored resource data is migrated.
  if (original !== generated || value !== generated) return value;
  return generated.replace(/^BD_(image|video|audio)_(\d{5,})$/, "$1_$2");
}
function downloadName(resource, name) {
  const file = String(resource.metadata?.filename || resource.refId || "").split(/[?#]/, 1)[0];
  const suffix = file.match(MEDIA_EXTENSIONS)?.[0] || ({ "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "video/mp4": ".mp4", "video/webm": ".webm", "audio/mpeg": ".mp3", "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/mp4": ".m4a", "audio/flac": ".flac", "audio/ogg": ".ogg" })[resource.metadata?.mimeType] || "";
  const base = String(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/, "").replace(MEDIA_EXTENSIONS, "") || "素材";
  return (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base) ? "_" + base : base) + suffix;
}

// Resource keys use decoded filenames; browser URLs encode them exactly once.
// Keeping this key matches uploads already registered by older app versions.
function outputMediaRef(url) {
  const value = String(url || "");
  if (!value.startsWith("/output/")) return value;
  try { return decodeURIComponent(value.split(/[?#]/, 1)[0]); } catch { return value; }
}

function assetError(code, message, statusCode = 400) {
  return Object.assign(new Error(message), { code, statusCode });
}

function detectAssetKind(resource) {
  const type = String(resource?.type || "").toLowerCase();
  if (MEDIA_KINDS.has(type)) return type;
  const mimeType = String(resource?.metadata?.mimeType || "").toLowerCase();
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  return null;
}

function isCurrentShare(share, nowMs) {
  return Boolean(share)
    && share.visibility !== "private"
    && (!share.expiresAt || Date.parse(share.expiresAt) > nowMs);
}

function encodeCursor(item) {
  return Buffer.from(JSON.stringify({ updatedAt: item.updatedAt, id: item.id }), "utf8").toString("base64url");
}

function decodeCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
    if (!parsed?.updatedAt || !parsed?.id) throw new Error("invalid");
    return { updatedAt: String(parsed.updatedAt), id: String(parsed.id) };
  } catch {
    throw assetError("invalid_asset_cursor", "Asset cursor is invalid.", 400);
  }
}

function createAssetLibraryService({ db, resourceAccess, projectService, now = () => new Date() } = {}) {
  if (!db) throw new TypeError("Asset library service requires a system database.");
  if (!resourceAccess) throw new TypeError("Asset library service requires resource access.");
  if (!projectService) throw new TypeError("Asset library service requires a canvas project service.");

  function nowMs() {
    const value = now();
    const timestamp = (value instanceof Date ? value : new Date(value)).getTime();
    if (!Number.isFinite(timestamp)) throw new TypeError("Asset library clock returned an invalid date.");
    return timestamp;
  }

  function requireMediaResource(resource) {
    const kind = detectAssetKind(resource);
    const url = String(resource?.metadata?.url || (resource?.refType === "output_media" ? resource?.refId : "") || "").trim();
    if (!resource || resource.deletedAt || !kind || !url) {
      throw assetError("asset_not_found", "Media asset was not found.", 404);
    }
    return { resource, kind, url };
  }

  function shareFor(resourceId) {
    const share = db.getShareForResource(resourceId);
    return isCurrentShare(share, nowMs()) ? share : null;
  }

  function normalizeAsset(resource, userId, permission = null) {
    const { kind, url } = requireMediaResource(resource);
    const share = shareFor(resource.id);
    const owner = db.getUserById(resource.ownerUserId);
    const engagement = db.getAssetEngagement(resource.id, userId);
    const projectIds = [...new Set(db.listAssetProjectLinks(resource.id).map((link) => link.projectId))];
    const mine = resource.ownerUserId === userId;
    const actor = db.getUserById(userId);
    const alias = db.listCuratedAssets().find(item => item.ownerUserId === userId && item.resourceId === resource.id);
    const rawName = alias?.name || resource.title || resource.metadata?.filename || `${kind} 素材`;
    const name = generatedDisplayName(resource, rawName);
    return {
      id: resource.id,
      name,
      downloadName: downloadName(resource, name),
      kind,
      mimeType: String(resource.metadata?.mimeType || `${kind}/*`),
      url,
      thumbnailUrl: String(resource.metadata?.thumbnailUrl || (kind === "image" ? url : "")),
      owner: owner ? { id: owner.id, displayName: owner.displayName, username: owner.username } : { id: resource.ownerUserId, displayName: "未知用户", username: "" },
      mine,
      visibility: share?.visibility || "private",
      shareUserIds: share?.visibility === "users" ? [...share.userIds] : [],
      projectIds,
      permission: permission || (mine ? "owner" : share?.permission || "read"),
      liked: engagement.liked,
      likeCount: engagement.likeCount,
      favorited: engagement.favorited,
      canManage: mine,
      canUnpublish: mine || (actor?.role === "superadmin" && share?.visibility === "all"),
      createdAt: resource.createdAt,
      updatedAt: resource.updatedAt,
    };
  }

  async function visibleAssets(userId) {
    const resources = await resourceAccess.listVisible(userId);
    const items = [];
    for (const resource of resources) {
      try {
        const access = await resourceAccess.assertRead(userId, resource.id);
        items.push(normalizeAsset(resource, userId, access.permission));
      } catch (error) {
        if (error?.code !== "asset_not_found") throw error;
      }
    }
    return items;
  }

  function matchesScope(item, scope, userId, projectId, favoriteIds) {
    if (scope === "mine") return item.owner.id === userId;
    if (scope === "project") return item.projectIds.includes(projectId);
    if (scope === "public") return item.visibility === "all";
    if (scope === "shared") return item.owner.id !== userId && item.visibility === "users";
    if (scope === "favorites") return favoriteIds.has(item.id);
    return false;
  }

  async function listAssets(userId, query = {}) {
    const scope = String(query.scope || "mine");
    const kind = String(query.kind || "all");
    if (!ASSET_SCOPES.has(scope)) throw assetError("invalid_asset_scope", "Unsupported asset scope.", 400);
    if (kind !== "all" && !MEDIA_KINDS.has(kind)) throw assetError("invalid_asset_kind", "Unsupported asset kind.", 400);
    const projectId = String(query.projectId || "").trim();
    if (scope === "project") {
      if (!projectId) throw assetError("asset_project_required", "A project is required for project assets.", 400);
      projectService.requireOwnerProject(userId, projectId);
    }
    const all = await visibleAssets(userId);
    const favoriteIds = new Set(db.listFavoriteResourceIds(userId));
    const counts = Object.fromEntries([...ASSET_SCOPES].map((value) => [
      value,
      all.filter((item) => value !== "project" || projectId ? matchesScope(item, value, userId, projectId, favoriteIds) : false).length,
    ]));
    const search = String(query.search || "").trim().toLocaleLowerCase("zh-CN");
    let filtered = all.filter((item) => matchesScope(item, scope, userId, projectId, favoriteIds));
    if (kind !== "all") filtered = filtered.filter((item) => item.kind === kind);
    if (search) filtered = filtered.filter((item) => `${item.name}\n${item.owner.displayName}`.toLocaleLowerCase("zh-CN").includes(search));
    filtered.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)) || left.id.localeCompare(right.id));
    const cursor = decodeCursor(query.cursor);
    if (cursor) {
      filtered = filtered.filter((item) => String(item.updatedAt).localeCompare(cursor.updatedAt) < 0 || (item.updatedAt === cursor.updatedAt && item.id.localeCompare(cursor.id) > 0));
    }
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 40));
    const items = filtered.slice(0, limit);
    return {
      items,
      nextCursor: filtered.length > limit && items.length ? encodeCursor(items[items.length - 1]) : null,
      counts,
    };
  }

  async function getAsset(userId, resourceId) {
    const access = await resourceAccess.assertRead(userId, resourceId);
    return normalizeAsset(access.resource, userId, access.permission);
  }

  async function getAssetByUrl(userId, url) {
    const resource = db.getResourceByRef("output_media", outputMediaRef(url));
    if (!resource || resource.deletedAt) throw assetError("asset_not_found", "素材记录不存在。", 404);
    return getAsset(userId, resource.id);
  }

  async function registerMedia(userId, saved = {}, mimeType, context = {}) {
    const kind = detectAssetKind({ type: "file", metadata: { mimeType } });
    const url = String(saved.url || "").trim();
    if (!kind || !url) throw assetError("invalid_asset_media", "Only image, video, and audio assets are supported.", 400);
    const refId = outputMediaRef(url);
    if (db.getUserById(userId)?.status !== "active") throw assetError("unauthorized", "请先登录有效账户。", 401);
    // Allocation and insertion share one SQLite write transaction. Never await
    // inside it: duplicate callbacks and other server writers must see one ID.
    const resource = db.runInTransaction(() => {
      const existing = db.getResourceByRef("output_media", refId);
      if (existing) {
        if (existing.ownerUserId !== userId) throw assetError("forbidden", "该素材属于其他账户。", 403);
        if (existing.deletedAt) throw assetError("asset_not_found", "素材已清理，不能重新引用。", 404);
        return existing; // Preserve user names, sequence, ownership and metadata.
      }
      let title = uploadDisplayName(context.originalName || saved.originalName || saved.filename, kind);
      let naming = {};
      if (context.source === "generated") {
        const key = `media_name_sequence:v1:${userId}:${kind}`;
        const sequence = Number(db.getSetting(key) || 0) + 1;
        if (!Number.isSafeInteger(sequence) || sequence < 1) throw assetError("invalid_media_sequence", "素材编号状态异常，请联系管理员。", 500);
        db.setSetting(key, sequence);
        title = `${kind}_${String(sequence).padStart(5, "0")}`;
        naming = { generationSequence: sequence, generatedName: title };
      }
      return db.registerResource({
        type: kind,
        ownerUserId: userId,
        workspaceId: context.projectId || null,
        title,
        refType: "output_media",
        refId,
        metadata: { url, filename: saved.filename || null, mimeType: mimeType || null, source: context.source || "upload", ...naming },
      });
    });
    if (context.projectId) await recordUse(userId, resource.id, context);
    return getAsset(userId, resource.id);
  }

  async function recordUse(userId, resourceId, input = {}) {
    const access = await resourceAccess.assertRead(userId, resourceId);
    requireMediaResource(access.resource);
    const project = projectService.requireOwnerProject(userId, input.projectId);
    return db.linkAssetProject({ resourceId, projectId: project.id, boardId: String(input.boardId || "") });
  }

  async function setShare(userId, resourceId, input = {}) {
    const resource = db.getResource(resourceId);
    requireMediaResource(resource);
    const visibility = String(input.visibility || "private");
    if (!["private", "all", "users"].includes(visibility)) throw assetError("invalid_asset_visibility", "Unsupported asset visibility.", 400);
    const userIds = visibility === "users" ? [...new Set((Array.isArray(input.userIds) ? input.userIds : []).map(String).filter(Boolean))] : [];
    if (visibility === "users" && !userIds.length) throw assetError("invalid_share_member", "Select at least one account.", 400);
    if (resource.ownerUserId === userId) {
      const existing = db.getShareForResource(resourceId);
      if (existing) await resourceAccess.updateShare(userId, existing.id, { visibility, permission: "read", userIds, passwordHash: null });
      else await resourceAccess.createShare(userId, resourceId, { visibility, permission: "read", userIds });
      return getAsset(userId, resourceId);
    }
    const actor = db.getUserById(userId);
    const existing = db.getShareForResource(resourceId);
    if (actor?.role !== "superadmin" || visibility !== "private" || !isCurrentShare(existing, nowMs()) || existing.visibility !== "all") {
      throw assetError("forbidden", "Only the asset owner can change sharing.", 403);
    }
    db.updateShare(existing.id, { visibility: "private", permission: "read", userIds: [], passwordHash: null });
    db.appendAudit({ actorUserId: userId, action: "asset.public_unpublished", targetType: "resource", targetId: resourceId });
    return { id: resourceId, visibility: "private" };
  }

  async function setLike(userId, resourceId, liked) {
    const access = await resourceAccess.assertRead(userId, resourceId);
    requireMediaResource(access.resource);
    const share = shareFor(resourceId);
    if (!share || share.visibility !== "all") throw assetError("asset_not_public", "Only public curated assets can be liked.", 409);
    db.setAssetLike(userId, resourceId, Boolean(liked));
    return getAsset(userId, resourceId);
  }

  async function setFavorite(userId, resourceId, favorited) {
    const access = await resourceAccess.assertRead(userId, resourceId);
    requireMediaResource(access.resource);
    db.setAssetFavorite(userId, resourceId, Boolean(favorited));
    return getAsset(userId, resourceId);
  }

  return {
    registerMedia,
    listAssets,
    getAsset,
    getAssetByUrl,
    recordUse,
    setShare,
    setLike,
    setFavorite,
  };
}

module.exports = {
  outputMediaRef,
  ASSET_SCOPES,
  MEDIA_KINDS,
  generatedDisplayName,
  createAssetLibraryService,
  detectAssetKind,
};
