"use strict";

const crypto = require("node:crypto");

const { createOpaqueToken, hashPassword, verifyPassword } = require("./auth-crypto");

const SESSION_COOKIE_NAME = "ai_os_session";
const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function authError(code, message, statusCode = 400) {
  return Object.assign(new Error(message), { code, statusCode });
}

function toDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError("Authentication clock returned an invalid date.");
  return date;
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarPath: user.avatarPath || null,
    role: user.role,
    status: user.status,
    mustChangePassword: Boolean(user.mustChangePassword),
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt || null,
  };
}

function hashSessionToken(token) {
  return crypto.createHash("sha256").update(String(token || ""), "utf8").digest("base64url");
}

function parseCookies(header) {
  const cookies = {};
  if (typeof header !== "string" || !header.trim()) return cookies;
  for (const segment of header.split(";")) {
    const separator = segment.indexOf("=");
    if (separator < 1) continue;
    const name = segment.slice(0, separator).trim();
    const rawValue = segment.slice(separator + 1).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      cookies[name] = rawValue;
    }
  }
  return cookies;
}

function serializeSessionCookie(token, maxAgeSeconds) {
  const safeAge = Math.max(0, Math.floor(Number(maxAgeSeconds) || 0));
  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(String(token || ""))}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${safeAge}`,
  ].join("; ");
}

function createAuthService({ db, sessionTtlMs = DEFAULT_SESSION_TTL_MS, now = () => new Date() } = {}) {
  if (!db) throw new TypeError("Authentication service requires a system database.");
  const ttlMs = Number(sessionTtlMs);
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new TypeError("sessionTtlMs must be a positive integer.");
  }

  function currentDate() {
    return toDate(now());
  }

  function authContext(session, user) {
    return {
      user: publicUser(user),
      sessionId: session.id,
    };
  }

  async function bootstrapSuperAdmin(input = {}) {
    if (db.countUsers() !== 0) {
      throw authError("already_initialized", "The system already has an administrator.", 409);
    }
    const passwordHash = await hashPassword(input.password);
    const user = db.insertUser({
      username: input.username,
      displayName: input.displayName || input.username,
      passwordHash,
      role: "superadmin",
      status: "active",
      mustChangePassword: false,
    });
    db.appendAudit({
      actorUserId: user.id,
      action: "system.bootstrap",
      targetType: "user",
      targetId: user.id,
    });
    return publicUser(user);
  }

  async function login(input = {}) {
    const username = String(input.username || "").trim();
    const password = typeof input.password === "string" ? input.password : "";
    const user = db.getUserByUsername(username);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw authError("invalid_credentials", "Username or password is incorrect.", 401);
    }
    if (user.status !== "active") {
      throw authError("account_disabled", "This account has been disabled.", 403);
    }

    const issuedAt = currentDate();
    const expiresAt = new Date(issuedAt.getTime() + ttlMs);
    const token = createOpaqueToken(32);
    const session = db.createSession({
      userId: user.id,
      tokenHash: hashSessionToken(token),
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
      createdAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
    const updatedUser = db.updateUser(user.id, { lastLoginAt: issuedAt.toISOString() });
    db.appendAudit({
      actorUserId: user.id,
      action: "auth.login",
      targetType: "session",
      targetId: session.id,
      details: { ipAddress: input.ipAddress || null },
    });
    return {
      token,
      expiresAt: expiresAt.toISOString(),
      auth: authContext(session, updatedUser),
    };
  }

  async function resolveSession(token) {
    if (typeof token !== "string" || !token) return null;
    const session = db.getSessionByTokenHash(hashSessionToken(token));
    if (!session || session.revokedAt) return null;
    if (Date.parse(session.expiresAt) <= currentDate().getTime()) {
      db.revokeSession(session.id);
      return null;
    }
    const user = db.getUserById(session.userId);
    if (!user || user.status !== "active") {
      db.revokeSession(session.id);
      return null;
    }
    return authContext(session, user);
  }

  async function logout(token) {
    if (typeof token !== "string" || !token) return false;
    const session = db.getSessionByTokenHash(hashSessionToken(token));
    if (!session || session.revokedAt) return false;
    const revoked = db.revokeSession(session.id);
    if (revoked) {
      db.appendAudit({
        actorUserId: session.userId,
        action: "auth.logout",
        targetType: "session",
        targetId: session.id,
      });
    }
    return revoked;
  }

  async function changePassword(input = {}) {
    const auth = await resolveSession(input.token);
    if (!auth) throw authError("unauthorized", "Authentication is required.", 401);
    const user = db.getUserById(auth.user.id);
    if (!user || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw authError("invalid_credentials", "Current password is incorrect.", 401);
    }
    const passwordHash = await hashPassword(input.newPassword);
    const updatedUser = db.updateUser(user.id, {
      passwordHash,
      mustChangePassword: false,
    });
    db.revokeUserSessions(user.id, auth.sessionId);
    db.appendAudit({
      actorUserId: user.id,
      action: "auth.password_changed",
      targetType: "user",
      targetId: user.id,
    });
    return { auth: authContext({ id: auth.sessionId }, updatedUser) };
  }

  function requireRole(auth, requiredRole) {
    if (!auth?.user) throw authError("unauthorized", "Authentication is required.", 401);
    const acceptedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    if (!acceptedRoles.includes(auth.user.role)) {
      throw authError("forbidden", "This account does not have permission for that action.", 403);
    }
    return auth;
  }

  return {
    bootstrapSuperAdmin,
    login,
    logout,
    resolveSession,
    changePassword,
    requireRole,
  };
}

module.exports = {
  SESSION_COOKIE_NAME,
  DEFAULT_SESSION_TTL_MS,
  createAuthService,
  hashSessionToken,
  parseCookies,
  publicUser,
  serializeSessionCookie,
};
