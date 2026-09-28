"use strict";

const defaultFs = require("node:fs");
const path = require("node:path");

function requestPathname(req) {
  try {
    return new URL(req?.url || "/", `http://${req?.headers?.host || "localhost"}`).pathname;
  } catch {
    return "/";
  }
}

function createSystemHttpApi({
  fs = defaultFs,
  dataDir,
  port,
  version = "0.1.0-mvp",
  getLanUrls,
  getAuthContext,
  publicUser,
  authDisabled = false,
  getAuthDisabledUser,
  systemDb,
  requireSuperAdmin,
  backupService,
  readJson,
  sendJson,
  appendAudit,
  getServerComponents,
} = {}) {
  for (const [name, dependency] of Object.entries({
    dataDir,
    getLanUrls,
    getAuthContext,
    publicUser,
    getAuthDisabledUser,
    systemDb,
    requireSuperAdmin,
    backupService,
    readJson,
    sendJson,
    appendAudit,
  })) {
    if (!dependency) throw new TypeError(`System HTTP API requires ${name}.`);
  }
  if (!Number.isFinite(Number(port)) || Number(port) <= 0) {
    throw new TypeError("System HTTP API requires a valid port.");
  }

  function sendMethodNotAllowed(res) {
    sendJson(res, 405, { error: "Method not allowed", code: "method_not_allowed" });
  }

  async function handlePublic(req, res) {
    const requestPath = requestPathname(req);
    if (requestPath === "/api/system/ready") {
      if (req.method !== "GET") {
        sendMethodNotAllowed(res);
        return true;
      }
      sendJson(res, 200, {
        ok: true,
        version,
        uptime: Math.round(process.uptime()),
        port: Number(port),
        lanUrls: getLanUrls(Number(port)),
      });
      return true;
    }
    if (requestPath !== "/api/system/health") return false;
    if (req.method !== "GET") {
      sendMethodNotAllowed(res);
      return true;
    }

    let freeBytes = null;
    try {
      const stats = fs.statfsSync(dataDir);
      freeBytes = Number(stats.bavail * stats.bsize);
    } catch {}
    const auth = authDisabled
      ? { user: publicUser(getAuthDisabledUser()) }
      : await getAuthContext(req);
    const database = systemDb.quickCheck();
    sendJson(res, database.ok ? 200 : 503, {
      ok: database.ok,
      version,
      uptime: Math.round(process.uptime()),
      port: Number(port),
      dataDir: auth ? dataDir : null,
      freeBytes,
      lanUrls: getLanUrls(Number(port)),
      database: database.result,
    });
    return true;
  }

  async function handle(req, res) {
    const requestPath = requestPathname(req);
    if (
      requestPath !== "/api/admin/backup"
      && requestPath !== "/api/system/backup/status"
      && requestPath !== "/api/system/components"
    ) {
      return false;
    }
    const admin = await requireSuperAdmin(req, res);
    if (!admin) return true;
    try {
      if (requestPath === "/api/system/components" && req.method === "GET") {
        const state = typeof getServerComponents === "function" ? getServerComponents() : null;
        sendJson(res, 200, state || { format: 1, started: false, components: [] });
        return true;
      }
      if (requestPath === "/api/system/backup/status" && req.method === "GET") {
        sendJson(res, 200, { snapshots: backupService.listSnapshots() });
        return true;
      }
      if (requestPath === "/api/admin/backup" && req.method === "POST") {
        const payload = await readJson(req);
        const snapshot = backupService.createSnapshot({ includeMedia: payload.includeMedia !== false });
        appendAudit({
          actorUserId: admin.user.id,
          action: "admin.backup_created",
          targetType: "snapshot",
          targetId: path.basename(snapshot.path),
        });
        sendJson(res, 201, { snapshot });
        return true;
      }
      sendMethodNotAllowed(res);
      return true;
    } catch (error) {
      sendJson(res, 500, {
        error: String(error?.message || "Backup failed."),
        code: error?.code || "backup_failed",
      });
      return true;
    }
  }

  return Object.freeze({ handle, publicHandle: handlePublic });
}

module.exports = { createSystemHttpApi };
