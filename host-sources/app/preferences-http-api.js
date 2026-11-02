"use strict";

const { normalizePreferences } = require("./ai-os-display");

const USER_PREFERENCE_FIELDS = Object.freeze({
  appearance: new Set(["theme", "scale", "animations"]),
});

function requestPathname(req) {
  try {
    return new URL(req?.url || "/", `http://${req?.headers?.host || "localhost"}`).pathname;
  } catch {
    return "/";
  }
}

function invalidPreferenceField(field) {
  return Object.assign(new Error(`不允许修改偏好字段：${field}`), {
    code: "invalid_preference_field",
    statusCode: 400,
  });
}

function assertPreferencePatch(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidPreferenceField("request");
  for (const [group, fields] of Object.entries(value)) {
    if (!Object.hasOwn(USER_PREFERENCE_FIELDS, group)) throw invalidPreferenceField(group);
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) throw invalidPreferenceField(group);
    for (const field of Object.keys(fields)) {
      if (!USER_PREFERENCE_FIELDS[group].has(field)) throw invalidPreferenceField(`${group}.${field}`);
    }
  }
}

function createPreferencesHttpApi({
  systemDb,
  readJson,
  sendJson,
  requireSuperAdmin,
  normalizeUserPreferences = normalizePreferences,
} = {}) {
  for (const [name, dependency] of Object.entries({
    systemDb,
    readJson,
    sendJson,
    requireSuperAdmin,
    normalizeUserPreferences,
  })) {
    if (!dependency) throw new TypeError(`Preferences HTTP API requires ${name}.`);
  }

  async function handlePreferences(req, res) {
    const userId = req.auth.user.id;
    if (req.method === "GET") {
      const preferences = normalizeUserPreferences(systemDb.getUserPreferences(userId));
      sendJson(res, 200, { preferences }, { "Cache-Control": "no-store" });
      return;
    }
    if (req.method !== "PATCH") {
      sendJson(res, 405, { error: "Method not allowed", code: "method_not_allowed" });
      return;
    }
    try {
      const patch = await readJson(req);
      assertPreferencePatch(patch);
      const current = normalizeUserPreferences(systemDb.getUserPreferences(userId));
      const next = normalizeUserPreferences(patch, current);
      const preferences = systemDb.replaceUserPreferences(userId, next);
      sendJson(res, 200, { preferences: normalizeUserPreferences(preferences) }, { "Cache-Control": "no-store" });
    } catch (error) {
      sendJson(res, Number(error?.statusCode || 400), {
        error: String(error?.message || "偏好设置无效。"),
        code: String(error?.code || "invalid_preferences"),
      });
    }
  }

  async function handleSettings(req, res) {
    if (req.method === "GET") {
      const preferences = normalizeUserPreferences(systemDb.getUserPreferences(req.auth.user.id));
      sendJson(res, 200, {
        appearance: preferences.appearance,
        deprecated: true,
        replacement: "/api/preferences",
      }, { "Cache-Control": "no-store" });
      return;
    }
    if (req.method !== "PUT") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    try {
      const payload = await readJson(req);
      if (Object.hasOwn(payload, "providers") || Object.hasOwn(payload, "agentRouting")) {
        const admin = await requireSuperAdmin(req, res);
        if (!admin) return;
        sendJson(res, 410, {
          error: "旧模型设置入口已停用，请使用系统设置中的“API 设置”。",
          code: "provider_control_plane_retired",
          replacement: "/api/providers",
        });
        return;
      }
      sendJson(res, 410, {
        error: "旧设置保存入口已停用，请使用账号偏好接口。",
        code: "settings_control_plane_retired",
        replacement: "/api/preferences",
      });
    } catch (error) {
      sendJson(res, Number(error?.statusCode || 400), {
        error: error.message,
        code: error?.code || "conversation_error",
      });
    }
  }

  async function handle(req, res) {
    const requestPath = requestPathname(req);
    if (requestPath === "/api/preferences") {
      await handlePreferences(req, res);
      return true;
    }
    if (requestPath === "/api/settings") {
      await handleSettings(req, res);
      return true;
    }
    return false;
  }

  return Object.freeze({ handle });
}

module.exports = {
  createPreferencesHttpApi,
  assertPreferencePatch,
};
