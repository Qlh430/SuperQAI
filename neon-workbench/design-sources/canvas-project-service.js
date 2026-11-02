"use strict";
const { createProjectShareAccess, PROJECT_SHARE_PREFIX } = require("./project-share-access");
const { withMediaMutation } = require("./canvas-media-lifecycle");
const DEFAULT_PROJECT_PREFIX = "canvas_default_project:";
const DELETED_PROJECT_PREFIX = "canvas_deleted_project:";

function projectError(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function createCanvasProjectService({ db } = {}) {
  if (!db) throw new TypeError("Canvas project service requires a system database.");
  const projectShareAccess = createProjectShareAccess({ db });
  const deletingProjects = new Set();

  function ensureUnclassifiedProject(ownerUserId) {
    const stored = db.getCanvasProject(db.getSetting(DEFAULT_PROJECT_PREFIX + ownerUserId));
    if (stored?.ownerUserId === ownerUserId) return stored;
    const existing = db.listCanvasProjects(ownerUserId).find((project) => project.name === "未分类");
    const project = existing || db.createCanvasProject({ ownerUserId, name: "未分类" });
    db.setSetting(DEFAULT_PROJECT_PREFIX + ownerUserId, project.id);
    return project;
  }

  function isDefaultProject(project) {
    return project.name === "未分类" || db.getSetting(DEFAULT_PROJECT_PREFIX + project.ownerUserId) === project.id;
  }

  function describeProject(project, userId) {
    return { ...projectShareAccess.describeProject(project, userId), canDelete: project.ownerUserId === userId && !isDefaultProject(project) && !deletingProjects.has(project.id) };
  }

  function requireOwnerProject(ownerUserId, projectId) {
    const project = db.getCanvasProject(projectId);
    if (!project) throw projectError("canvas_project_not_found", "项目不存在或已被移除。", 404);
    if (project.ownerUserId !== ownerUserId) {
      throw projectError("canvas_project_forbidden", "只有项目所有者可以管理项目。", 403);
    }
    if (deletingProjects.has(project.id)) throw projectError("canvas_project_deleting", "项目正在删除，请稍后重试。", 409);
    // Remember the recovery directory before it can be renamed.
    if (project.name === "未分类" && !db.getCanvasProject(db.getSetting(DEFAULT_PROJECT_PREFIX + ownerUserId))) db.setSetting(DEFAULT_PROJECT_PREFIX + ownerUserId, project.id);
    return project;
  }

  function requireReadableProject(userId, projectId) {
    const project = db.getCanvasProject(projectId);
    if (!project) throw projectError("canvas_project_not_found", "项目不存在或已被移除。", 404);
    if (!projectShareAccess.getProjectAccess(project, userId).allowed) throw projectError("canvas_project_forbidden", "当前账户没有查看此项目的权限。", 403);
    return project;
  }

  function listProjects(userId) {
    return [...db.listCanvasProjects(userId), ...projectShareAccess.listSharedProjects(userId)]
      .map(project => describeProject(project, userId));
  }

  async function deleteProject(userId, projectId, { repository, migrator } = {}) {
    if (!repository || typeof repository.invoke !== "function") throw new TypeError("Project deletion requires canvas storage.");
    if (db.getUserById(userId)?.status !== "active") throw projectError("unauthorized", "请登录有效账户后重试。", 401);
    if (!db.getCanvasProject(projectId)) {
      const previous = db.getSetting(DELETED_PROJECT_PREFIX + projectId);
      if (previous?.ownerUserId === userId) return previous.result;
    }
    const project = requireOwnerProject(userId, projectId);
    if (isDefaultProject(project)) throw projectError("canvas_default_project_protected", "未分类是系统恢复目录，不能删除。", 409);
    deletingProjects.add(projectId);
    try {
      return await withMediaMutation(async () => {
        const current = db.getCanvasProject(projectId);
        if (!current || current.ownerUserId !== userId) throw projectError("canvas_project_not_found", "项目不存在或已被移除。", 404);
        if (isDefaultProject(current)) throw projectError("canvas_default_project_protected", "未分类是系统恢复目录，不能删除。", 409);
        const registeredChildren = db.listAllResources().filter(resource => resource.type === "canvas" && resource.workspaceId === projectId);
        if (registeredChildren.some(resource => resource.ownerUserId !== userId)) throw projectError("canvas_project_ownership_conflict", "项目中存在其他账户的画布，无法删除，请先调整画布归属。", 409);
        for (const resource of registeredChildren) {
          const metadata = await repository.getBoardMeta(resource.refId).catch(error => {
            if (error?.code === "board_not_found") return null;
            throw error;
          });
          if (!metadata || metadata.migrationState !== "active") {
            if (typeof migrator?.ensureMigrated !== "function") throw projectError("canvas_project_migration_required", "项目中仍有未迁移画布，请先打开画布后重试。", 409);
            await migrator.ensureMigrated(resource.refId, () => {}, { projectId });
          }
        }
        const children = await repository.listBoards({ projectId });
        for (const board of children) {
          const resource = db.getResourceByRef("canvas", board.id);
          if (resource && resource.ownerUserId !== userId) throw projectError("canvas_project_ownership_conflict", "项目中存在其他账户的画布，无法删除，请先调整画布归属。", 409);
        }
        const destination = ensureUnclassifiedProject(userId);
        const mutation = await repository.invoke("trashProjectBoards", { projectId, destinationProjectId: destination.id });
        const result = { deletedProjectId: projectId, trashedCanvasCount: mutation.boards.length, newlyTrashedCanvasCount: mutation.snapshots.filter(board => !board.deletedAt).length, destinationProjectId: destination.id, boards: mutation.boards };
        try {
          db.runInTransaction(() => {
            for (const board of mutation.boards) {
              const resource = db.getResourceByRef("canvas", board.id);
              if (!resource || resource.deletedAt) continue;
              if (resource.ownerUserId !== userId) throw projectError("canvas_project_ownership_conflict", "项目中存在其他账户的画布，无法删除。", 409);
              db.updateResource(resource.id, { workspaceId: destination.id, metadata: { ...resource.metadata, projectId: destination.id, canvasTrashed: true } });
            }
            db.deleteCanvasProject(projectId, userId);
            db.setSetting(DELETED_PROJECT_PREFIX + projectId, { ownerUserId: userId, result });
            db.appendAudit({ actorUserId: userId, action: "canvas_project.deleted", targetType: "canvas_project", targetId: projectId, details: { name: current.name, trashedCanvasCount: result.trashedCanvasCount, destinationProjectId: destination.id } });
          });
        } catch (error) {
          try { await repository.invoke("restoreProjectBoards", { snapshots: mutation.snapshots, destinationProjectId: destination.id }); }
          catch (restoreError) { throw projectError("canvas_project_delete_restore_failed", "项目删除未完成，画布恢复失败，请重新加载并检查回收站。", 500); }
          throw error;
        }
        return result;
      });
    } finally { deletingProjects.delete(projectId); }
  }

  function updateShare(userId, projectId, input = {}) {
    const project = requireOwnerProject(userId, projectId);
    if (db.getUserById(userId)?.status !== "active") throw projectError("unauthorized", "请登录有效账户后重试。", 401);
    const visibility = String(input.visibility || "private");
    const permission = String(input.permission || "read");
    if (!["private", "all", "users"].includes(visibility) || !["read", "edit"].includes(permission)) throw projectError("invalid_project_share", "请选择有效的共享范围和访问权限。");
    const userIds = visibility === "users" ? [...new Set((Array.isArray(input.userIds) ? input.userIds : []).map(String).filter(Boolean))] : [];
    if (visibility === "users" && (!userIds.length || userIds.some(id => db.getUserById(id)?.status !== "active"))) throw projectError("invalid_share_member", "请选择至少一个有效账户。");
    db.setSetting(PROJECT_SHARE_PREFIX + projectId, { visibility, permission, userIds });
    db.appendAudit({ actorUserId: userId, action: "canvas_project.share_updated", targetType: "canvas_project", targetId: projectId, details: { visibility, permission, userIds } });
    return describeProject(project, userId);
  }

  return {
    ensureUnclassifiedProject,
    requireOwnerProject,
    requireReadableProject,
    listProjects,
    describeProject,
    deleteProject,
    updateShare,
    projectShareAccess,
  };
}

module.exports = {
  createCanvasProjectService,
};
