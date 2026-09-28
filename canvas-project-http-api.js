"use strict";

function requestPathname(req) {
  try {
    return new URL(req?.url || "/", `http://${req?.headers?.host || "localhost"}`).pathname;
  } catch {
    return "/";
  }
}

function createCanvasProjectHttpApi({
  db,
  projectService,
  getCanvasStorage,
  readJson,
  sendJson,
} = {}) {
  if (!db || typeof db.listCanvasProjects !== "function") {
    throw new TypeError("Canvas project HTTP API requires a system database.");
  }
  if (!projectService || typeof projectService.requireOwnerProject !== "function") {
    throw new TypeError("Canvas project HTTP API requires a canvas project service.");
  }
  if (typeof getCanvasStorage !== "function") {
    throw new TypeError("Canvas project HTTP API requires canvas storage.");
  }
  if (typeof readJson !== "function" || typeof sendJson !== "function") {
    throw new TypeError("Canvas project HTTP API requires HTTP helpers.");
  }

  async function handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const requestPath = requestPathname(req);
    if (requestPath !== "/api/canvas/projects" && !requestPath.startsWith("/api/canvas/projects/")) return false;
    const parts = url.pathname.split("/").filter(Boolean);
    const projectId = parts[3] ? decodeURIComponent(parts[3]) : "";
    const userId = req?.auth?.user?.id;
    try {
      if (!userId) {
        throw Object.assign(new Error("Authentication required"), {
          code: "unauthorized",
          statusCode: 401,
        });
      }
      if (req.method === "GET" && !projectId) {
        const projects = db.listCanvasProjects(userId);
        const { repository } = getCanvasStorage();
        const boards = await repository.listBoards();
        const counts = new Map();
        for (const board of boards) {
          const id = String(board.projectId || "");
          if (id) counts.set(id, (counts.get(id) || 0) + 1);
        }
        sendJson(res, 200, {
          projects: projects.map((project) => ({ ...project, canvasCount: counts.get(project.id) || 0 })),
        });
        return true;
      }
      if (req.method === "POST" && !projectId) {
        const payload = await readJson(req);
        const project = db.createCanvasProject({
          id: payload?.id,
          ownerUserId: userId,
          name: payload?.name,
        });
        sendJson(res, 201, { project });
        return true;
      }
      if (projectId && req.method === "PATCH") {
        projectService.requireOwnerProject(userId, projectId);
        const payload = await readJson(req);
        const project = db.renameCanvasProject(projectId, payload?.name);
        sendJson(res, 200, { project });
        return true;
      }
      if (projectId && req.method === "GET") {
        const project = projectService.requireOwnerProject(userId, projectId);
        sendJson(res, 200, { project });
        return true;
      }
      sendJson(res, 405, { error: "Method not allowed", code: "canvas_project_method_not_allowed" });
      return true;
    } catch (error) {
      sendJson(res, Number(error?.statusCode || error?.status || 400), {
        error: String(error?.message || error || "Canvas project request failed."),
        code: String(error?.code || "canvas_project_error"),
      });
      return true;
    }
  }

  return Object.freeze({ handle });
}

module.exports = { createCanvasProjectHttpApi };
