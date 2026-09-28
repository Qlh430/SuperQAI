"use strict";

const { publicAccess } = require("./resource-access");

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

/**
 * Shapes an accepted operation batch for the collaboration room.
 *
 * `before` is dropped: a receiver only needs the state that won, and a node's
 * previous payload can be as large as the new one. Per-client viewport patches
 * are dropped as well, so moving your own camera never moves a collaborator's.
 */
function collaborationOperations(operations) {
  const shared = [];
  for (const operation of Array.isArray(operations) ? operations : []) {
    if (!operation || typeof operation !== "object") continue;
    const type = String(operation.type || "");
    const next = {
      operationId: String(operation.operationId || ""),
      type,
      entityId: String(operation.entityId || ""),
    };
    if (type === "board.patch") {
      const title = operation.after?.title;
      if (title === undefined) continue;
      next.after = { title: String(title) };
    } else if (operation.after) {
      next.after = operation.after;
    }
    shared.push(next);
  }
  return shared;
}

function createCanvasStorageHttpApi({
  getCanvasStorage,
  projectService,
  db,
  resourceAccess,
  ensureReferencedResource,
  validateCanvasMediaReferences,
  getCanvasCollabHub,
  readJson,
  sendJson,
  publicUser,
} = {}) {
  if (typeof getCanvasStorage !== "function") {
    throw new TypeError("Canvas storage HTTP API requires canvas storage.");
  }
  if (!projectService || typeof projectService.ensureUnclassifiedProject !== "function") {
    throw new TypeError("Canvas storage HTTP API requires a canvas project service.");
  }
  if (!db || typeof db.listCanvasProjects !== "function") {
    throw new TypeError("Canvas storage HTTP API requires a system database.");
  }
  if (!resourceAccess || typeof resourceAccess.assertRead !== "function") {
    throw new TypeError("Canvas storage HTTP API requires resource access.");
  }
  if (typeof ensureReferencedResource !== "function" || typeof validateCanvasMediaReferences !== "function") {
    throw new TypeError("Canvas storage HTTP API requires canvas resource helpers.");
  }
  if (typeof getCanvasCollabHub !== "function") {
    throw new TypeError("Canvas storage HTTP API requires a collaboration hub.");
  }
  if (typeof readJson !== "function" || typeof sendJson !== "function" || typeof publicUser !== "function") {
    throw new TypeError("Canvas storage HTTP API requires HTTP helpers.");
  }

  async function handle(req, res) {
    const requestPath = requestPathname(req);
    const matches = requestPath === "/api/canvas/boards"
      || requestPath.startsWith("/api/canvas/boards/")
      || requestPath === "/api/canvas/import";
    if (!matches) return false;

    const {
      repository,
      queryService,
      commandService,
      streamCanvasExport,
      importCanvasStream,
    } = getCanvasStorage();
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const parts = url.pathname.split("/").filter(Boolean);
    const boardId = parts[3] ? decodeRouteId(parts[3]) : "";
    const action = parts[4] || "";
    const userId = req?.auth?.user?.id;
    try {
      if (!userId) {
        throw Object.assign(new Error("Authentication required"), {
          code: "unauthorized",
          statusCode: 401,
        });
      }
      const defaultProject = projectService.ensureUnclassifiedProject(userId);
      const requestedProjectId = String(url.searchParams.get("projectId") || "").trim();
      let migrationProjectId = requestedProjectId || defaultProject.id;
      if (!boardId && requestedProjectId) projectService.requireOwnerProject(userId, requestedProjectId);
      let boardAccess = null;
      if (boardId) {
        const boardResource = await ensureReferencedResource(userId, {
          type: "canvas",
          title: `画布 ${boardId}`,
          refType: "canvas",
          refId: boardId,
        });
        if (!requestedProjectId) {
          migrationProjectId = projectService.ensureUnclassifiedProject(boardResource.ownerUserId).id;
        }
        const readOnlyAction = req.method === "GET";
        boardAccess = readOnlyAction
          ? await resourceAccess.assertRead(userId, boardResource.id)
          : await resourceAccess.assertWrite(userId, boardResource.id);
        if (["trash", "restore", "permanent", "project"].includes(action) && !boardAccess.capabilities.delete) {
          sendJson(res, 403, { error: "Only the canvas owner can move or permanently delete it.", code: "forbidden" });
          return true;
        }
      }
      const canvasCollabHub = getCanvasCollabHub();
      let result;
      let status = 200;
      if (req.method === "POST" && url.pathname === "/api/canvas/import") {
        result = await importCanvasStream({
          repository,
          readable: req,
          boardId: String(url.searchParams.get("boardId") || ""),
          validateNodes: (nodes) => validateCanvasMediaReferences(userId, nodes),
        });
        await repository.setBoardProject({ boardId: result.boardId, projectId: defaultProject.id });
        await ensureReferencedResource(userId, {
          type: "canvas",
          workspaceId: defaultProject.id,
          title: `导入画布 ${result.boardId}`,
          refType: "canvas",
          refId: result.boardId,
        }, { currentUserOwnsNew: true });
        status = 201;
      } else if (req.method === "GET" && !boardId) {
        result = await queryService.listBoards();
        const scopeCounts = { all: 0, mine: 0, shared: 0, trash: 0 };
        const projectCounts = new Map();
        for (const collectionName of ["boards", "trash"]) {
          const visible = [];
          for (const board of Array.isArray(result?.[collectionName]) ? result[collectionName] : []) {
            const resource = await ensureReferencedResource(userId, {
              type: "canvas",
              title: board.title || `画布 ${board.id}`,
              refType: "canvas",
              refId: board.id,
            }, { syncTitle: Boolean(board.title) });
            if (!board.projectId) {
              const ownerProject = projectService.ensureUnclassifiedProject(resource.ownerUserId);
              board.projectId = ownerProject.id;
              if (resource.ownerUserId === userId && board.migrationState === "active") {
                await repository.setBoardProject({ boardId: board.id, projectId: ownerProject.id });
              }
            }
            if (board.projectId && resource.ownerUserId === userId && resource.workspaceId !== board.projectId) {
              db.updateResource(resource.id, { workspaceId: board.projectId });
            }
            board.isOwner = resource.ownerUserId === userId;
            board.resourceId = resource.id;
            board.ownerUserId = resource.ownerUserId;
            board.ownerDisplayName = db.getUserById(resource.ownerUserId)?.displayName || "";
            board.mine = board.isOwner;
            try {
              const access = await resourceAccess.assertRead(userId, resource.id);
              board.access = publicAccess(access);
              board.share = access.share;
              board.visibility = access.share?.visibility || "private";
              board.permission = access.permission;
              if (collectionName === "boards") {
                scopeCounts.all += 1;
                scopeCounts[board.isOwner ? "mine" : "shared"] += 1;
                if (board.isOwner && board.projectId) {
                  projectCounts.set(board.projectId, (projectCounts.get(board.projectId) || 0) + 1);
                }
              } else {
                scopeCounts.trash += 1;
              }
              if (requestedProjectId && board.projectId !== requestedProjectId) continue;
              if (url.searchParams.get("scope") === "mine" && !board.isOwner) continue;
              if (url.searchParams.get("scope") === "shared" && board.isOwner) continue;
              visible.push(board);
            } catch (error) {
              if (!["forbidden", "share_password_required"].includes(error?.code)) throw error;
            }
          }
          result[collectionName] = visible;
        }
        result.counts = scopeCounts;
        result.projects = db.listCanvasProjects(userId).map((project) => ({
          ...project,
          canvasCount: projectCounts.get(project.id) || 0,
        }));
      } else if (req.method === "POST" && !boardId) {
        const payload = await readJson(req);
        const projectId = String(payload?.projectId || defaultProject.id).trim();
        projectService.requireOwnerProject(userId, projectId);
        result = await commandService.createBoard({ ...payload, projectId });
        await ensureReferencedResource(userId, {
          type: "canvas",
          workspaceId: result.projectId || defaultProject.id,
          title: result.title || `画布 ${result.id}`,
          refType: "canvas",
          refId: result.id,
        }, { currentUserOwnsNew: true });
        status = 201;
      } else if (req.method === "GET" && action === "meta") {
        result = await queryService.getMeta(boardId, migrationProjectId);
      } else if (req.method === "GET" && action === "viewport") {
        result = await queryService.queryViewport(boardId, Object.fromEntries(url.searchParams), migrationProjectId);
      } else if (req.method === "GET" && action === "node") {
        result = await queryService.getNode(boardId, url.searchParams.get("nodeId"), migrationProjectId);
      } else if (req.method === "GET" && action === "nodes") {
        result = await queryService.getNodes(boardId, url.searchParams.getAll("nodeId"), migrationProjectId);
      } else if (req.method === "POST" && action === "operations") {
        const payload = await readJson(req);
        await validateCanvasMediaReferences(userId, (payload.operations || []).filter((op) => op.type === "node.upsert").map((op) => op.after));
        result = await commandService.apply(boardId, payload);
        const renamedTitle = (payload.operations || [])
          .filter((op) => op.type === "board.patch" && op.after?.title !== undefined)
          .map((op) => String(op.after.title).trim())
          .filter(Boolean)
          .pop();
        if (renamedTitle && boardAccess?.resource?.id && boardAccess.resource.ownerUserId === userId) {
          db.updateResource(boardAccess.resource.id, { title: renamedTitle });
        }
        canvasCollabHub.broadcastPatch(boardId, {
          boardRevision: Number(result?.boardRevision || 0),
          operations: collaborationOperations(payload.operations),
          actor: publicUser(req.auth.user),
        }, String(payload?.clientId || ""));
      } else if (req.method === "POST" && action === "trash") {
        const body = await readJson(req);
        result = await commandService.trash(boardId, String(body?.operationId || ""));
        canvasCollabHub.broadcastBoardState(boardId, "trashed", publicUser(req.auth.user));
      } else if (req.method === "POST" && action === "restore") {
        const body = await readJson(req);
        result = await commandService.restore(boardId, String(body?.operationId || ""));
        canvasCollabHub.broadcastBoardState(boardId, "restored", publicUser(req.auth.user));
      } else if (req.method === "DELETE" && action === "permanent") {
        result = await commandService.deletePermanently(boardId);
        canvasCollabHub.broadcastBoardState(boardId, "deleted", publicUser(req.auth.user));
        if (boardAccess?.resource?.id) await resourceAccess.deleteResource(userId, boardAccess.resource.id);
      } else if ((req.method === "PATCH" || req.method === "POST") && action === "project") {
        const payload = await readJson(req);
        const projectId = String(payload?.projectId || "").trim();
        projectService.requireOwnerProject(userId, projectId);
        result = await commandService.setProject(boardId, projectId);
        if (boardAccess?.resource?.id) {
          db.updateResource(boardAccess.resource.id, { workspaceId: projectId });
        }
      } else if (req.method === "GET" && action === "export") {
        const metadata = await queryService.getMeta(boardId, migrationProjectId);
        if (metadata?.httpStatus === 202) {
          sendJson(res, 202, metadata);
          return true;
        }
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="canvas-${encodeURIComponent(boardId)}.json"`,
          "Cache-Control": "no-store",
        });
        await streamCanvasExport({ repository, boardId, writable: res });
        return true;
      } else if (req.method === "GET" && action === "export-page") {
        result = await queryService.exportPage(boardId, Object.fromEntries(url.searchParams), migrationProjectId);
      } else {
        sendJson(res, 404, {
          error: "Canvas route not found.",
          code: "canvas_route_not_found",
        });
        return true;
      }
      status = Number(result?.httpStatus || status);
      sendJson(res, status, result);
      return true;
    } catch (error) {
      if (res.headersSent) {
        res.destroy(error);
        return true;
      }
      sendJson(res, Number(error?.statusCode || error?.status || 500), {
        error: String(error?.message || error || "Canvas storage failed."),
        code: String(error?.code || "canvas_storage_error"),
      });
      return true;
    }
  }

  return Object.freeze({ handle });
}

module.exports = { createCanvasStorageHttpApi };
