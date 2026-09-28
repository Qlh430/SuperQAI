"use strict";

const {
  SESSION_COOKIE_NAME,
  parseCookies,
  publicUser,
  serializeSessionCookie,
} = require("./auth-service");
const { createOpaqueToken, hashPassword } = require("./auth-crypto");

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

function createAuthHttpApi({
  authService,
  systemDb,
  sessionTtlMs,
  authDisabled = false,
  getAuthDisabledUser,
  readJson,
  sendJson,
  parseCookieHeader = parseCookies,
  serializeCookie = serializeSessionCookie,
  toPublicUser = publicUser,
  createToken = createOpaqueToken,
  hashUserPassword = hashPassword,
} = {}) {
  for (const [name, dependency] of Object.entries({
    authService,
    systemDb,
    getAuthDisabledUser,
    readJson,
    sendJson,
    parseCookieHeader,
    serializeCookie,
    toPublicUser,
    createToken,
    hashUserPassword,
  })) {
    if (!dependency) throw new TypeError(`Auth HTTP API requires ${name}.`);
  }

  const ttlMs = Number(sessionTtlMs);
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new TypeError("Auth HTTP API requires a valid session TTL.");
  }

  function sendMethodNotAllowed(res) {
    sendJson(res, 405, { error: "Method not allowed", code: "method_not_allowed" });
  }

  function getSessionToken(req) {
    return parseCookieHeader(req?.headers?.cookie || "")[SESSION_COOKIE_NAME] || "";
  }

  async function getAuthContext(req) {
    return authService.resolveSession(getSessionToken(req));
  }

  async function requireAuth(req, res) {
    const auth = await getAuthContext(req);
    if (auth) return auth;
    sendJson(res, 401, {
      error: "Authentication required",
      code: "unauthorized",
      authenticated: false,
      needsBootstrap: systemDb.countUsers() === 0,
    });
    return null;
  }

  function sendAuthError(res, error) {
    const knownStatus = Number(error?.statusCode);
    const status = Number.isInteger(knownStatus) && knownStatus >= 400 && knownStatus < 500
      ? knownStatus
      : error?.code === "username_exists"
        ? 409
        : 400;
    const safeMessage = status >= 500 ? "Authentication request failed." : String(error?.message || "Authentication request failed.");
    sendJson(res, status, {
      error: safeMessage,
      code: String(error?.code || "auth_request_failed"),
    });
  }

  async function requireSuperAdmin(req, res) {
    const auth = req?.auth || await requireAuth(req, res);
    if (!auth) return null;
    try {
      return authService.requireRole(auth, "superadmin");
    } catch (error) {
      sendAuthError(res, error);
      return null;
    }
  }

  function isLoopbackRequest(req) {
    const address = String(req?.socket?.remoteAddress || "").toLowerCase();
    return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
  }

  function authDisabledContext() {
    return {
      user: toPublicUser(getAuthDisabledUser()),
      sessionId: "authentication-disabled",
    };
  }

  async function handlePublic(req, res) {
    const requestPath = requestPathname(req);
    if (!requestPath.startsWith("/api/auth/")) return false;

    try {
      if (requestPath === "/api/auth/session") {
        if (req.method !== "GET") {
          sendMethodNotAllowed(res);
          return true;
        }
        const auth = authDisabled ? authDisabledContext() : await getAuthContext(req);
        if (!auth) {
          sendJson(res, 401, {
            error: "Authentication required",
            code: "unauthorized",
            authenticated: false,
            needsBootstrap: systemDb.countUsers() === 0,
          });
          return true;
        }
        sendJson(res, 200, { authenticated: true, ...auth });
        return true;
      }

      if (requestPath === "/api/auth/bootstrap") {
        if (req.method !== "POST") {
          sendMethodNotAllowed(res);
          return true;
        }
        if (!isLoopbackRequest(req)) {
          sendJson(res, 403, {
            error: "Initial administrator setup must be completed on the host computer.",
            code: "host_setup_required",
          });
          return true;
        }
        const payload = await readJson(req);
        const user = await authService.bootstrapSuperAdmin(payload);
        sendJson(res, 201, { user });
        return true;
      }

      if (requestPath === "/api/auth/login") {
        if (req.method !== "POST") {
          sendMethodNotAllowed(res);
          return true;
        }
        const payload = await readJson(req);
        const result = await authService.login({
          username: payload.username,
          password: payload.password,
          userAgent: req.headers["user-agent"],
          ipAddress: req.socket?.remoteAddress,
        });
        sendJson(
          res,
          200,
          { authenticated: true, expiresAt: result.expiresAt, ...result.auth },
          { "Set-Cookie": serializeCookie(result.token, Math.floor(ttlMs / 1000)) },
        );
        return true;
      }

      if (requestPath === "/api/auth/logout") {
        if (req.method !== "POST") {
          sendMethodNotAllowed(res);
          return true;
        }
        await authService.logout(getSessionToken(req));
        sendJson(
          res,
          200,
          { authenticated: false },
          { "Set-Cookie": serializeCookie("", 0) },
        );
        return true;
      }

      if (requestPath === "/api/auth/change-password") {
        if (req.method !== "POST") {
          sendMethodNotAllowed(res);
          return true;
        }
        const payload = await readJson(req);
        const result = await authService.changePassword({
          token: getSessionToken(req),
          currentPassword: payload.currentPassword,
          newPassword: payload.newPassword,
        });
        sendJson(res, 200, { authenticated: true, ...result.auth });
        return true;
      }

      sendJson(res, 404, { error: "Not found", code: "not_found" });
    } catch (error) {
      sendAuthError(res, error);
    }
    return true;
  }

  function activeSuperAdminCount() {
    return systemDb.listUsers()
      .filter((user) => user.role === "superadmin" && user.status === "active")
      .length;
  }

  function handleUserDirectory(req, res) {
    if (req.method !== "GET") {
      sendMethodNotAllowed(res);
      return;
    }
    const users = systemDb.listUsers()
      .filter((user) => user.status === "active")
      .map((user) => ({ id: user.id, username: user.username, displayName: user.displayName }));
    sendJson(res, 200, { users });
  }

  async function handleAdminUsersRoute(req, res, requestPath) {
    const admin = await requireSuperAdmin(req, res);
    if (!admin) return;
    const parts = requestPath.split("/").filter(Boolean);
    const userId = decodeRouteId(parts[3]);
    const action = parts[4] || "";

    try {
      if (!userId && req.method === "GET") {
        sendJson(res, 200, { users: systemDb.listUsers().map(toPublicUser) });
        return;
      }
      if (!userId && req.method === "POST") {
        const payload = await readJson(req);
        const temporaryPassword = typeof payload.password === "string" && payload.password.length
          ? payload.password
          : createToken(12);
        const user = systemDb.insertUser({
          username: payload.username,
          displayName: payload.displayName || payload.username,
          passwordHash: await hashUserPassword(temporaryPassword),
          role: "user",
          status: "active",
          mustChangePassword: true,
          createdBy: admin.user.id,
        });
        systemDb.appendAudit({
          actorUserId: admin.user.id,
          action: "admin.user_created",
          targetType: "user",
          targetId: user.id,
        });
        sendJson(res, 201, { user: toPublicUser(user), temporaryPassword });
        return;
      }

      const target = systemDb.getUserById(userId);
      if (!target) {
        sendJson(res, 404, { error: "User was not found.", code: "user_not_found" });
        return;
      }
      if (req.method === "PATCH" && !action) {
        const payload = await readJson(req);
        if (target.role === "superadmin" && payload.status === "disabled" && activeSuperAdminCount() <= 1) {
          sendJson(res, 409, { error: "The last active super administrator cannot be disabled.", code: "last_superadmin" });
          return;
        }
        const patch = {};
        for (const key of ["username", "displayName", "status"]) {
          if (payload[key] !== undefined) patch[key] = payload[key];
        }
        const user = systemDb.updateUser(userId, patch);
        if (user.status === "disabled") systemDb.revokeUserSessions(user.id);
        systemDb.appendAudit({
          actorUserId: admin.user.id,
          action: "admin.user_updated",
          targetType: "user",
          targetId: user.id,
          details: { fields: Object.keys(patch) },
        });
        sendJson(res, 200, { user: toPublicUser(user) });
        return;
      }
      if (req.method === "POST" && action === "reset-password") {
        const payload = await readJson(req);
        const temporaryPassword = typeof payload.password === "string" && payload.password.length
          ? payload.password
          : createToken(12);
        const user = systemDb.updateUser(userId, {
          passwordHash: await hashUserPassword(temporaryPassword),
          mustChangePassword: true,
        });
        systemDb.revokeUserSessions(user.id);
        systemDb.appendAudit({
          actorUserId: admin.user.id,
          action: "admin.password_reset",
          targetType: "user",
          targetId: user.id,
        });
        sendJson(res, 200, { user: toPublicUser(user), temporaryPassword });
        return;
      }
      if (req.method === "POST" && action === "revoke-sessions") {
        const revokedSessions = systemDb.revokeUserSessions(userId);
        systemDb.appendAudit({
          actorUserId: admin.user.id,
          action: "admin.sessions_revoked",
          targetType: "user",
          targetId: userId,
          details: { revokedSessions },
        });
        sendJson(res, 200, { revokedSessions });
        return;
      }
      sendMethodNotAllowed(res);
    } catch (error) {
      sendAuthError(res, error);
    }
  }

  async function handle(req, res) {
    const requestPath = requestPathname(req);
    if (requestPath === "/api/users/directory") {
      handleUserDirectory(req, res);
      return true;
    }
    if (requestPath !== "/api/admin/users" && !requestPath.startsWith("/api/admin/users/")) {
      return false;
    }
    await handleAdminUsersRoute(req, res, requestPath);
    return true;
  }

  return Object.freeze({
    handle,
    publicHandle: handlePublic,
    getSessionToken,
    getAuthContext,
    requireAuth,
    requireSuperAdmin,
    sendAuthError,
    isLoopbackRequest,
  });
}

module.exports = {
  createAuthHttpApi,
  decodeRouteId,
};
