"use strict";

function projectError(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function createCanvasProjectService({ db } = {}) {
  if (!db) throw new TypeError("Canvas project service requires a system database.");

  function ensureUnclassifiedProject(ownerUserId) {
    const existing = db.listCanvasProjects(ownerUserId).find((project) => project.name === "未分类");
    return existing || db.createCanvasProject({ ownerUserId, name: "未分类" });
  }

  function requireOwnerProject(ownerUserId, projectId) {
    const project = db.getCanvasProject(projectId);
    if (!project) throw projectError("canvas_project_not_found", "Canvas project not found.", 404);
    if (project.ownerUserId !== ownerUserId) {
      throw projectError("canvas_project_forbidden", "Canvas project is owned by another user.", 403);
    }
    return project;
  }

  return {
    ensureUnclassifiedProject,
    requireOwnerProject,
  };
}

module.exports = {
  createCanvasProjectService,
};
