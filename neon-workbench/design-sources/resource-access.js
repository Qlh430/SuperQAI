"use strict";

const { hashPassword, verifyPassword } = require("./auth-crypto");
const { createProjectShareAccess } = require("./project-share-access");

const DEFAULT_UNLOCK_TTL_MS = 10 * 60 * 1000;

function accessError(code, message, statusCode = 403) {
  return Object.assign(new Error(message), { code, statusCode });
}

function sanitizeShare(share) {
  if (!share) return null;
  return {
    id: share.id,
    resourceId: share.resourceId,
    createdBy: share.createdBy,
    visibility: share.visibility,
    permission: share.permission,
    passwordProtected: Boolean(share.passwordHash),
    expiresAt: share.expiresAt || null,
    createdAt: share.createdAt,
    updatedAt: share.updatedAt,
    userIds: [...(share.userIds || [])],
  };
}

function permissionCapabilities(permission) {
  return {
    read: true,
    comment: permission === "comment" || permission === "edit" || permission === "owner",
    edit: permission === "edit" || permission === "owner",
    copy: permission === "copy" || permission === "edit" || permission === "owner",
    share: permission === "owner",
    delete: permission === "owner",
  };
}

function publicAccess(access) {
  return {
    permission: access.permission,
    capabilities: access.capabilities,
    share: access.share,
    locked: false,
    ...(access.sharedViaProject ? { sharedViaProject: true, projectId: access.projectId, projectOwnerDisplayName: access.projectOwnerDisplayName } : {}),
  };
}

function createResourceAccess({ db, now = () => new Date(), unlockTtlMs = DEFAULT_UNLOCK_TTL_MS, projectShareAccess = null } = {}) {
  if (!db) throw new TypeError("Resource access requires a system database.");
  const safeUnlockTtlMs = Number(unlockTtlMs);
  if (!Number.isSafeInteger(safeUnlockTtlMs) || safeUnlockTtlMs <= 0) {
    throw new TypeError("unlockTtlMs must be a positive integer.");
  }
  const unlocks = new Map();
  const projectSharing = projectShareAccess || createProjectShareAccess({ db });

  function nowMs() {
    const value = now();
    const timestamp = (value instanceof Date ? value : new Date(value)).getTime();
    if (!Number.isFinite(timestamp)) throw new TypeError("Resource access clock returned an invalid date.");
    return timestamp;
  }

  function activeUser(userId) {
    const user = db.getUserById(userId);
    if (!user || user.status !== "active") {
      throw accessError("not_authenticated", "An active account is required.", 401);
    }
    return user;
  }

  function activeResource(resourceId) {
    const resource = db.getResource(resourceId);
    if (!resource || resource.deletedAt) {
      throw accessError("resource_not_found", "Resource was not found.", 404);
    }
    return resource;
  }

  function shareIsCurrent(share) {
    return Boolean(share) && (!share.expiresAt || Date.parse(share.expiresAt) > nowMs());
  }

  function unlockKey(userId, shareId) {
    return `${String(userId)}:${String(shareId)}`;
  }

  function hasUnlock(userId, share) {
    const key = unlockKey(userId, share.id);
    const unlocked = unlocks.get(key);
    if (!unlocked || unlocked.expiresAt <= nowMs() || unlocked.resourceId !== share.resourceId) {
      unlocks.delete(key);
      return false;
    }
    return true;
  }

  function accessFor(userId, resource) {
    if (resource.type === "canvas" && resource.metadata?.canvasTrashed && resource.ownerUserId !== userId) throw accessError("forbidden", "回收站中的画布不能共享访问。", 403);
    if (resource.ownerUserId === userId) {
      // 所有者也要看到自己这条共享：共享面板要回显当前的可见范围和权限。
      // 以前这里固定给 share: null，于是面板每次都以 HTML 默认值（仅自己 + 只读）打开，
      // 用户点一下「保存共享」就把「所有账号 + 可编辑」悄悄降级成了私有。
      const ownShare = db.getShareForResource(resource.id);
      return {
        resource,
        share: shareIsCurrent(ownShare) ? sanitizeShare(ownShare) : null,
        permission: "owner",
        capabilities: permissionCapabilities("owner"),
      };
    }
    const inherited = projectSharing.getCanvasProjectAccess(resource, userId);
    const inheritedAccess = inherited ? {
      resource, share: null, permission: inherited.permission,
      capabilities: { ...permissionCapabilities(inherited.permission), share: false, delete: false },
      sharedViaProject: true, projectId: inherited.projectId, projectOwnerDisplayName: inherited.projectOwnerDisplayName,
    } : null;
    const curated = typeof db.listCuratedAssets === "function" && db.listCuratedAssets().some(asset => asset.resourceId === resource.id && (asset.ownerUserId === userId || ((!asset.expiresAt || Date.parse(asset.expiresAt) > nowMs()) && (asset.visibility === "all" || (asset.visibility === "users" && asset.userIds?.includes(userId))))));
    const curatedAccess = curated ? { resource, share: null, permission: "read", capabilities: permissionCapabilities("read") } : null;
    const fallback = inheritedAccess || curatedAccess;
    const share = db.getShareForResource(resource.id);
    if (!shareIsCurrent(share) || share.visibility === "private") {
      if (fallback) return fallback;
      throw accessError("forbidden", "This resource is private.");
    }
    if (share.visibility === "users" && !share.userIds.includes(userId)) {
      if (fallback) return fallback;
      throw accessError("forbidden", "This resource was not shared with this account.");
    }
    if (share.visibility === "password" && !hasUnlock(userId, share)) {
      if (fallback) return fallback;
      throw accessError("share_password_required", "A share password is required.", 401);
    }
    const directCapabilities = permissionCapabilities(share.permission);
    if (inheritedAccess) {
      const capabilities = Object.fromEntries(Object.keys(directCapabilities).map(key => [key, Boolean(directCapabilities[key] || inheritedAccess.capabilities[key])]));
      return { ...inheritedAccess, share: sanitizeShare(share), permission: capabilities.edit ? "edit" : share.permission, capabilities };
    }
    return {
      resource,
      share: sanitizeShare(share),
      permission: share.permission,
      capabilities: permissionCapabilities(share.permission),
    };
  }

  async function registerResource(input = {}) {
    activeUser(input.ownerUserId);
    const existing = input.refType && input.refId ? db.getResourceByRef(input.refType, input.refId) : input.id ? db.getResource(input.id) : null;
    if (existing && existing.ownerUserId !== input.ownerUserId) throw accessError("forbidden", "不能覆盖其他账户的资源归属。", 403);
    return db.registerResource(input);
  }

  async function assertRead(userId, resourceId) {
    activeUser(userId);
    return accessFor(userId, activeResource(resourceId));
  }

  async function assertWrite(userId, resourceId, options = {}) {
    activeUser(userId);
    const access = accessFor(userId, activeResource(resourceId));
    const action = String(options.action || "edit");
    const capability = action === "comment" ? "comment" : action === "copy" ? "copy" : "edit";
    if (!access.capabilities[capability]) {
      throw accessError("forbidden", `This share does not allow ${capability} access.`);
    }
    return access;
  }

  async function listVisible(userId, type = null) {
    activeUser(userId);
    const resources = new Map(db.listVisibleResources(userId, type).map((item) => [item.id, item]));
    for (const resource of projectSharing.listInheritedCanvases(userId)) {
      if (!type || resource.type === type) resources.set(resource.id, resource);
    }
    if (typeof db.listCuratedAssets === "function") for (const asset of db.listCuratedAssets()) {
      if (asset.ownerUserId !== userId && asset.expiresAt && Date.parse(asset.expiresAt) <= nowMs()) continue;
      if (!(asset.ownerUserId === userId || asset.visibility === "all" || (asset.visibility === "users" && asset.userIds?.includes(userId)))) continue;
      const resource = db.getResource(asset.resourceId);
      if (resource && !resource.deletedAt && (!type || resource.type === type)) resources.set(resource.id, resource);
    }
    const prefix = `${String(userId)}:`;
    for (const [key, unlocked] of unlocks) {
      if (!key.startsWith(prefix)) continue;
      if (unlocked.expiresAt <= nowMs()) {
        unlocks.delete(key);
        continue;
      }
      const share = db.getShare(key.slice(prefix.length));
      if (!shareIsCurrent(share) || share.visibility !== "password" || share.resourceId !== unlocked.resourceId) {
        unlocks.delete(key);
        continue;
      }
      const resource = db.getResource(unlocked.resourceId);
      if (resource && !resource.deletedAt && (!type || resource.type === type)) resources.set(resource.id, resource);
    }
    const aliases = new Map((db.listCuratedAssets?.() || []).filter(item => item.ownerUserId === userId).map(item => [item.resourceId, item.name]));
    return [...resources.values()].map(resource => aliases.has(resource.id) ? { ...resource, title: aliases.get(resource.id) } : resource).filter(resource => resource.ownerUserId === userId || resource.type !== "canvas" || !resource.metadata?.canvasTrashed).sort((left, right) => {
      const byDate = String(right.updatedAt).localeCompare(String(left.updatedAt));
      return byDate || left.id.localeCompare(right.id);
    });
  }

  async function createShare(userId, resourceId, input = {}) {
    activeUser(userId);
    const resource = activeResource(resourceId);
    if (resource.ownerUserId !== userId) {
      throw accessError("forbidden", "Only the resource owner can change sharing.");
    }
    const visibility = String(input.visibility || "private");
    const userIds = [...new Set((Array.isArray(input.userIds) ? input.userIds : []).map(String).filter(Boolean))];
    if (visibility === "users") {
      for (const memberId of userIds) {
        if (!db.getUserById(memberId)) {
          throw accessError("invalid_share_member", "A selected share member does not exist.", 400);
        }
      }
    }
    let passwordHash = null;
    if (visibility === "password") {
      passwordHash = await hashPassword(input.password);
    }
    const share = db.createShare({
      resourceId,
      createdBy: userId,
      visibility,
      permission: input.permission || "read",
      passwordHash,
      expiresAt: input.expiresAt || null,
      userIds,
    });
    db.appendAudit({
      actorUserId: userId,
      action: "resource.share_updated",
      targetType: "resource",
      targetId: resourceId,
      details: { visibility: share.visibility, permission: share.permission, userIds: share.userIds },
    });
    return sanitizeShare(share);
  }

  async function updateResource(userId, resourceId, patch = {}) {
    const access = await assertWrite(userId, resourceId);
    if (access.resource.refType === "output_media" && access.resource.ownerUserId !== userId) throw accessError("forbidden", "只有素材所有者可以修改原素材信息。");
    if (access.resource.refType === "output_media" && patch.title !== undefined) {
      const title = String(patch.title || "").replace(/\s+/g, " ").trim().slice(0, 120);
      if (!title) throw accessError("invalid_asset_name", "请填写素材名称。", 400);
      patch = { ...patch, title };
    }
    if (access.resource.type === "canvas" && access.resource.ownerUserId !== userId) {
      throw accessError("forbidden", "只有画布所有者可以修改名称、归属与管理信息。");
    }
    const resource = db.runInTransaction(() => {
      const saved = db.updateResource(resourceId, patch);
      if (saved.refType === "output_media" && patch.title !== undefined) {
        for (const asset of db.listCuratedAssets()) if (asset.resourceId === resourceId && asset.ownerUserId === userId) db.saveCuratedAsset({ ...asset, name: saved.title });
      }
      return saved;
    });
    db.appendAudit({
      actorUserId: userId,
      action: "resource.updated",
      targetType: "resource",
      targetId: resourceId,
    });
    return resource;
  }

  async function deleteResource(userId, resourceId) {
    activeUser(userId);
    const resource = activeResource(resourceId);
    if (resource.ownerUserId !== userId) {
      throw accessError("forbidden", "Only the resource owner can delete this resource.");
    }
    // Media may still be referenced by persisted canvases or another user's
    // curation. Removing it from history never removes the shared source.
    if (resource.refType === "output_media") {
      db.updateResource(resource.id, { metadata: { ...resource.metadata, historyHiddenFor: [...new Set([...(Array.isArray(resource.metadata?.historyHiddenFor) ? resource.metadata.historyHiddenFor : []), userId])] } });
      return true;
    }
    if (typeof db.listCuratedAssets === "function" && db.listCuratedAssets().some(asset => asset.resourceId === resource.id)) {
      throw accessError("resource_in_use", "该资源仍被素材库引用，请先移除素材库条目。", 409);
    }
    const deleted = db.deleteResource(resourceId);
    if (deleted) {
      db.appendAudit({
        actorUserId: userId,
        action: "resource.deleted",
        targetType: "resource",
        targetId: resourceId,
      });
    }
    return deleted;
  }

  async function updateShare(userId, shareId, input = {}) {
    activeUser(userId);
    const existing = db.getShare(shareId);
    if (!existing) throw accessError("resource_not_found", "Share was not found.", 404);
    const resource = activeResource(existing.resourceId);
    if (resource.ownerUserId !== userId) {
      throw accessError("forbidden", "Only the resource owner can change sharing.");
    }
    const visibility = input.visibility === undefined ? existing.visibility : String(input.visibility);
    const patch = { ...input, visibility };
    delete patch.password;
    if (visibility === "password") {
      if (typeof input.password === "string" && input.password.length) patch.passwordHash = await hashPassword(input.password);
      else if (!existing.passwordHash) throw accessError("invalid_password", "A share password is required.", 400);
    } else {
      patch.passwordHash = null;
    }
    if (visibility === "users") {
      const userIds = input.userIds === undefined ? existing.userIds : input.userIds;
      for (const memberId of Array.isArray(userIds) ? userIds : []) {
        if (!db.getUserById(memberId)) throw accessError("invalid_share_member", "A selected share member does not exist.", 400);
      }
    }
    const share = db.updateShare(shareId, patch);
    db.appendAudit({
      actorUserId: userId,
      action: "resource.share_updated",
      targetType: "resource",
      targetId: resource.id,
      details: { visibility: share.visibility, permission: share.permission, userIds: share.userIds },
    });
    return sanitizeShare(share);
  }

  async function deleteShare(userId, shareId) {
    activeUser(userId);
    const share = db.getShare(shareId);
    if (!share) return false;
    const resource = activeResource(share.resourceId);
    if (resource.ownerUserId !== userId) {
      throw accessError("forbidden", "Only the resource owner can stop sharing.");
    }
    const deleted = db.deleteShare(shareId);
    if (deleted) {
      db.appendAudit({
        actorUserId: userId,
        action: "resource.share_revoked",
        targetType: "resource",
        targetId: resource.id,
      });
    }
    return deleted;
  }

  async function unlockShare(userId, shareId, password) {
    activeUser(userId);
    const share = db.getShare(shareId);
    if (!share || !shareIsCurrent(share)) {
      throw accessError("resource_not_found", "Share was not found.", 404);
    }
    if (share.visibility !== "password" || !share.passwordHash) {
      throw accessError("forbidden", "This share does not use a password.");
    }
    if (!(await verifyPassword(password, share.passwordHash))) {
      throw accessError("invalid_share_password", "Share password is incorrect.");
    }
    const expiresAt = nowMs() + safeUnlockTtlMs;
    unlocks.set(unlockKey(userId, share.id), {
      resourceId: share.resourceId,
      expiresAt,
    });
    return { resourceId: share.resourceId, shareId: share.id, expiresAt: new Date(expiresAt).toISOString() };
  }

  return {
    registerResource,
    assertRead,
    assertWrite,
    listVisible,
    createShare,
    updateResource,
    deleteResource,
    updateShare,
    deleteShare,
    unlockShare,
  };
}

module.exports = {
  DEFAULT_UNLOCK_TTL_MS,
  createResourceAccess,
  permissionCapabilities,
  publicAccess,
  sanitizeShare,
};
