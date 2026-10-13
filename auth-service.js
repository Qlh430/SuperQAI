"use strict";

const crypto = require("node:crypto");

const { createOpaqueToken, hashPassword, verifyPassword } = require("./auth-crypto");

const SESSION_COOKIE_NAME = "ai_os_session";
const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 200;

function authError(code, message, statusCode = 400) {
  return Object.assign(new Error(message), { code, statusCode });
}

// One policy for every entry point that sets a password: the first
// administrator, an administrator-created account and a user's own change.
// The browser form states the same rule; the server is what enforces it.
function assertPasswordPolicy(password, { currentPassword = "", field = "新密码" } = {}) {
  const value = typeof password === "string" ? password : "";
  if (value.trim().length < PASSWORD_MIN_LENGTH) {
    throw authError("weak_password", `${field}至少需要 ${PASSWORD_MIN_LENGTH} 位字符，且不能只包含空格。`, 400);
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    throw authError("weak_password", `${field}不能超过 ${PASSWORD_MAX_LENGTH} 位字符。`, 400);
  }
  if (currentPassword && value === currentPassword) {
    throw authError("weak_password", `${field}不能与当前密码相同。`, 400);
  }
  return value;
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
      throw authError("already_initialized", "系统已经有超级管理员，请直接登录。", 409);
    }
    assertPasswordPolicy(input.password, { field: "管理员密码" });
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
      throw authError("invalid_credentials", "账号或密码不正确。", 401);
    }
    if (user.status !== "active") {
      throw authError("account_disabled", "该账户已被停用，请联系管理员。", 403);
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
    if (!auth) throw authError("unauthorized", "登录状态已失效，请重新登录。", 401);
    const user = db.getUserById(auth.user.id);
    if (!user || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw authError("invalid_credentials", "当前密码不正确。", 401);
    }
    assertPasswordPolicy(input.newPassword, { currentPassword: input.currentPassword });
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
    if (!auth?.user) throw authError("unauthorized", "登录状态已失效，请重新登录。", 401);
    const acceptedRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    if (!acceptedRoles.includes(auth.user.role)) {
      throw authError("forbidden", "当前账户没有执行该操作的权限。", 403);
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
    assertPasswordPolicy,
    PASSWORD_MIN_LENGTH,
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
