"use strict";

const PROJECT_SHARE_PREFIX = "canvas_project_share:";

function createProjectShareAccess({ db } = {}) {
  if (!db) throw new TypeError("Project sharing requires a system database.");
  const userIdOf = user => String(typeof user === "string" ? user : user?.id || "");
  const active = user => db.getUserById(userIdOf(user))?.status === "active";

  function getProjectAccess(projectOrId, user) {
    const project = typeof projectOrId === "object" ? projectOrId : db.getCanvasProject(projectOrId);
    if (!project) return { allowed: false, isOwner: false, permission: "read" };
    const stored = db.getSetting(PROJECT_SHARE_PREFIX + project.id) || {};
    const visibility = ["all", "users"].includes(stored.visibility) ? stored.visibility : "private";
    const permission = stored.permission === "edit" ? "edit" : "read";
    const userIds = Array.isArray(stored.userIds) ? stored.userIds.map(String) : [];
    const owner = db.getUserById(project.ownerUserId);
    const userId = userIdOf(user);
    const isOwner = project.ownerUserId === userId;
    return {
      allowed: active(user) && (isOwner || visibility === "all" || (visibility === "users" && userIds.includes(userId))),
      isOwner,
      permission: isOwner ? "owner" : permission,
      sharePermission: permission,
      ownerUserId: project.ownerUserId,
      ownerDisplayName: owner?.displayName || owner?.username || "",
      visibility,
      userIds,
      projectId: project.id,
    };
  }

  function describeProject(project, user) {
    const access = getProjectAccess(project, user);
    return { ...project, isOwner: access.isOwner, ownerDisplayName: access.ownerDisplayName, permission: access.sharePermission, visibility: access.visibility, userIds: access.isOwner ? access.userIds : [] };
  }

  function listSharedProjects(user) {
    if (!active(user)) return [];
    return db.listUsers().flatMap(owner => owner.id === userIdOf(user) ? [] : db.listCanvasProjects(owner.id)).filter(project => getProjectAccess(project, user).allowed);
  }

  function getCanvasProjectAccess(canvasId, user) {
    const resource = typeof canvasId === "object" ? canvasId : db.getResourceByRef("canvas", canvasId);
    if (!resource || resource.deletedAt || resource.metadata?.canvasTrashed || resource.type !== "canvas" || !resource.workspaceId) return null;
    const project = db.getCanvasProject(resource.workspaceId);
    if (!project || project.ownerUserId !== resource.ownerUserId) return null;
    const access = getProjectAccess(project, user);
    if (!access.allowed || access.isOwner) return null;
    return { ...access, sharedViaProject: true, projectOwnerDisplayName: access.ownerDisplayName };
  }

  function listInheritedCanvases(user) {
    const output = new Map();
    for (const project of listSharedProjects(user)) {
      for (const resource of db.listVisibleResources(project.ownerUserId, "canvas")) {
        if (resource.ownerUserId === project.ownerUserId && resource.workspaceId === project.id && !resource.deletedAt && !resource.metadata?.canvasTrashed) output.set(resource.id, resource);
      }
    }
    return [...output.values()];
  }

  return Object.freeze({ getProjectAccess, describeProject, listSharedProjects, getCanvasProjectAccess, listInheritedCanvases });
}

module.exports = { PROJECT_SHARE_PREFIX, createProjectShareAccess };
