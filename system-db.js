"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const SCHEMA_VERSION = 4;
const USER_ROLES = new Set(["superadmin", "user"]);
const USER_STATUSES = new Set(["active", "disabled"]);
const SHARE_VISIBILITIES = new Set(["private", "all", "users", "password"]);
const SHARE_PERMISSIONS = new Set(["read", "comment", "edit", "copy"]);

function codedError(code, message) {
  return Object.assign(new Error(message), { code });
}

function requiredText(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw codedError("invalid_input", `${label} is required.`);
  return text;
}

function optionalText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeCanvasProjectName(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!text) throw codedError("invalid_canvas_project", "Canvas project name is required.");
  return text;
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function booleanInt(value) {
  return value ? 1 : 0;
}

function jsonObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
}

function jsonArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

function safeSortOrder(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) return fallback;
  return number;
}

function mergeJsonObjects(current, patch) {
  const output = { ...jsonObject(current) };
  for (const [key, value] of Object.entries(jsonObject(patch))) {
    if (jsonObject(value, null) && jsonObject(output[key], null)) {
      output[key] = mergeJsonObjects(output[key], value);
    } else if (value !== undefined) {
      output[key] = value;
    }
  }
  return output;
}

function changesOf(result) {
  return Number(result?.changes || 0);
}

function createSystemDb({ dbPath, clock = () => new Date() } = {}) {
  if (!dbPath) throw new Error("System database requires dbPath.");
  const resolvedPath = path.resolve(dbPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  const database = new DatabaseSync(resolvedPath, {
    timeout: 5000,
    defensive: true,
  });
  database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
  let closed = false;
  let transactionDepth = 0;

  function nowIso() {
    const value = clock();
    return (value instanceof Date ? value : new Date(value)).toISOString();
  }

  function assertOpen() {
    if (closed) throw codedError("database_closed", "System database is closed.");
  }

  function transaction(action) {
    assertOpen();
    if (transactionDepth > 0) return action();
    database.exec("BEGIN IMMEDIATE");
    transactionDepth += 1;
    try {
      const result = action();
      database.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        database.exec("ROLLBACK");
      } catch {}
      throw error;
    } finally {
      transactionDepth -= 1;
    }
  }

  function migrate() {
    assertOpen();
    database.exec(`
      CREATE TABLE IF NOT EXISTS schema_meta (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        version INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL COLLATE NOCASE UNIQUE,
        display_name TEXT NOT NULL,
        avatar_path TEXT,
        role TEXT NOT NULL CHECK (role IN ('superadmin', 'user')),
        status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
        password_hash TEXT NOT NULL,
        must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0, 1)),
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_login_at TEXT
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        user_agent TEXT,
        ip_address TEXT,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT
      );
      CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

      CREATE TABLE IF NOT EXISTS resources (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        workspace_id TEXT,
        title TEXT NOT NULL,
        storage_path TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        ref_type TEXT,
        ref_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      CREATE INDEX IF NOT EXISTS resources_owner_idx ON resources(owner_user_id, type, deleted_at);
      CREATE UNIQUE INDEX IF NOT EXISTS resources_ref_idx
        ON resources(ref_type, ref_id)
        WHERE ref_type IS NOT NULL AND ref_id IS NOT NULL;

      CREATE TABLE IF NOT EXISTS canvas_projects (
        id TEXT PRIMARY KEY,
        owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(owner_user_id, name)
      );
      CREATE INDEX IF NOT EXISTS canvas_projects_owner_idx
        ON canvas_projects(owner_user_id, updated_at DESC, id);

      CREATE TABLE IF NOT EXISTS shares (
        id TEXT PRIMARY KEY,
        resource_id TEXT NOT NULL UNIQUE REFERENCES resources(id) ON DELETE CASCADE,
        created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        visibility TEXT NOT NULL CHECK (visibility IN ('private', 'all', 'users', 'password')),
        permission TEXT NOT NULL CHECK (permission IN ('read', 'comment', 'edit', 'copy')),
        password_hash TEXT,
        expires_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS shares_resource_idx ON shares(resource_id);

      CREATE TABLE IF NOT EXISTS share_members (
        share_id TEXT NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY (share_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS share_members_user_idx ON share_members(user_id);

      CREATE TABLE IF NOT EXISTS asset_project_links (
        resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES canvas_projects(id) ON DELETE CASCADE,
        board_id TEXT NOT NULL DEFAULT '',
        last_used_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (resource_id, project_id, board_id)
      );
      CREATE INDEX IF NOT EXISTS asset_project_links_project_idx
        ON asset_project_links(project_id, last_used_at DESC, resource_id);

      CREATE TABLE IF NOT EXISTS asset_likes (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        PRIMARY KEY (user_id, resource_id)
      );
      CREATE INDEX IF NOT EXISTS asset_likes_resource_idx
        ON asset_likes(resource_id, created_at DESC, user_id);

      CREATE TABLE IF NOT EXISTS asset_favorites (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        PRIMARY KEY (user_id, resource_id)
      );
      CREATE INDEX IF NOT EXISTS asset_favorites_user_idx
        ON asset_favorites(user_id, created_at DESC, resource_id);

      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        action TEXT NOT NULL,
        target_type TEXT,
        target_id TEXT,
        details_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events(created_at DESC);

      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        provider_protocol TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'api',
        cli_tool TEXT,
        encrypted_api_key TEXT NOT NULL DEFAULT '',
        encrypted_wallet_key TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
        sort_order INTEGER NOT NULL,
        capability_sort_json TEXT NOT NULL DEFAULT '{}',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS providers_sort_idx ON providers(sort_order, id);

      CREATE TABLE IF NOT EXISTS provider_models (
        provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        model_id TEXT NOT NULL,
        display_name TEXT,
        model_protocol TEXT NOT NULL,
        capabilities_json TEXT NOT NULL DEFAULT '[]',
        sort_order INTEGER NOT NULL,
        capability_sort_json TEXT NOT NULL DEFAULT '{}',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        PRIMARY KEY(provider_id, model_id)
      );
      CREATE INDEX IF NOT EXISTS provider_models_sort_idx
        ON provider_models(provider_id, sort_order, model_id);

      CREATE TABLE IF NOT EXISTS provider_settings (
        singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
        auto_fallback INTEGER NOT NULL DEFAULT 1 CHECK (auto_fallback IN (0, 1)),
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_preferences (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    database.prepare(`
      INSERT INTO provider_settings(singleton, auto_fallback, updated_at)
      VALUES (1, 1, ?)
      ON CONFLICT(singleton) DO NOTHING
    `).run(nowIso());
    database.prepare(`
      INSERT INTO schema_meta(singleton, version) VALUES (1, ?)
      ON CONFLICT(singleton) DO UPDATE SET version = excluded.version
    `).run(SCHEMA_VERSION);
    return { schemaVersion: SCHEMA_VERSION };
  }

  function quickCheck() {
    assertOpen();
    const row = database.prepare("PRAGMA quick_check").get();
    const result = String(row?.quick_check || Object.values(row || {})[0] || "");
    return { ok: result === "ok", result };
  }

  function mapUser(row) {
    if (!row) return null;
    return {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      avatarPath: row.avatar_path,
      role: row.role,
      status: row.status,
      passwordHash: row.password_hash,
      mustChangePassword: Boolean(row.must_change_password),
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastLoginAt: row.last_login_at,
    };
  }

  function countUsers() {
    assertOpen();
    return Number(database.prepare("SELECT COUNT(*) AS count FROM users").get().count);
  }

  function getUserById(id) {
    assertOpen();
    return mapUser(database.prepare("SELECT * FROM users WHERE id = ?").get(String(id || "")));
  }

  function getUserByUsername(username) {
    assertOpen();
    return mapUser(database.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(String(username || "").trim()));
  }

  function listUsers() {
    assertOpen();
    return database.prepare("SELECT * FROM users ORDER BY CASE role WHEN 'superadmin' THEN 0 ELSE 1 END, username COLLATE NOCASE").all().map(mapUser);
  }

  function mapCanvasProject(row) {
    if (!row) return null;
    return {
      id: row.id,
      ownerUserId: row.owner_user_id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function getCanvasProject(id) {
    assertOpen();
    return mapCanvasProject(database.prepare("SELECT * FROM canvas_projects WHERE id = ?").get(String(id || "")));
  }

  function listCanvasProjects(ownerUserId) {
    assertOpen();
    const ownerId = requiredText(ownerUserId, "ownerUserId");
    return database.prepare(`
      SELECT * FROM canvas_projects
      WHERE owner_user_id = ?
      ORDER BY updated_at DESC, id
    `).all(ownerId).map(mapCanvasProject);
  }

  function createCanvasProject(input = {}) {
    assertOpen();
    const ownerUserId = requiredText(input.ownerUserId, "ownerUserId");
    const owner = getUserById(ownerUserId);
    if (!owner || owner.status !== "active") throw codedError("canvas_project_owner_not_found", "Canvas project owner is not active.");
    const id = optionalText(input.id) || crypto.randomUUID();
    const name = normalizeCanvasProjectName(input.name);
    const timestamp = nowIso();
    try {
      database.prepare(`
        INSERT INTO canvas_projects(id, owner_user_id, name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, ownerUserId, name, timestamp, timestamp);
    } catch (error) {
      if (/canvas_projects\.owner_user_id|UNIQUE constraint failed: canvas_projects\.owner_user_id, canvas_projects\.name/i.test(error.message)) {
        throw codedError("canvas_project_already_exists", "Canvas project name is already in use.");
      }
      throw error;
    }
    return getCanvasProject(id);
  }

  function renameCanvasProject(id, name) {
    assertOpen();
    const projectId = requiredText(id, "id");
    if (!getCanvasProject(projectId)) throw codedError("canvas_project_not_found", "Canvas project not found.");
    const normalizedName = normalizeCanvasProjectName(name);
    try {
      database.prepare("UPDATE canvas_projects SET name = ?, updated_at = ? WHERE id = ?").run(normalizedName, nowIso(), projectId);
    } catch (error) {
      if (/canvas_projects\.owner_user_id|UNIQUE constraint failed: canvas_projects\.owner_user_id, canvas_projects\.name/i.test(error.message)) {
        throw codedError("canvas_project_already_exists", "Canvas project name is already in use.");
      }
      throw error;
    }
    return getCanvasProject(projectId);
  }

  function insertUser(input = {}) {
    assertOpen();
    const id = optionalText(input.id) || crypto.randomUUID();
    const username = requiredText(input.username, "username");
    const displayName = requiredText(input.displayName ?? username, "displayName");
    const role = optionalText(input.role) || "user";
    const status = optionalText(input.status) || "active";
    const passwordHash = requiredText(input.passwordHash, "passwordHash");
    if (!USER_ROLES.has(role)) throw codedError("invalid_role", `Unsupported user role: ${role}`);
    if (!USER_STATUSES.has(status)) throw codedError("invalid_status", `Unsupported user status: ${status}`);
    const timestamp = nowIso();
    try {
      database.prepare(`
        INSERT INTO users (
          id, username, display_name, avatar_path, role, status, password_hash,
          must_change_password, created_by, created_at, updated_at, last_login_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        username,
        displayName,
        optionalText(input.avatarPath),
        role,
        status,
        passwordHash,
        booleanInt(input.mustChangePassword !== false),
        optionalText(input.createdBy),
        timestamp,
        timestamp,
        optionalText(input.lastLoginAt),
      );
    } catch (error) {
      if (/users\.username|UNIQUE constraint failed: users\.username/i.test(error.message)) {
        throw codedError("username_exists", "Username is already in use.");
      }
      throw error;
    }
    return getUserById(id);
  }

  function updateUser(id, patch = {}) {
    assertOpen();
    const fieldMap = {
      username: "username",
      displayName: "display_name",
      avatarPath: "avatar_path",
      role: "role",
      status: "status",
      passwordHash: "password_hash",
      mustChangePassword: "must_change_password",
      lastLoginAt: "last_login_at",
    };
    if (patch.role !== undefined && !USER_ROLES.has(String(patch.role))) {
      throw codedError("invalid_role", `Unsupported user role: ${patch.role}`);
    }
    if (patch.status !== undefined && !USER_STATUSES.has(String(patch.status))) {
      throw codedError("invalid_status", `Unsupported user status: ${patch.status}`);
    }
    const assignments = [];
    const values = [];
    for (const [key, column] of Object.entries(fieldMap)) {
      if (patch[key] === undefined) continue;
      assignments.push(`${column} = ?`);
      if (key === "mustChangePassword") values.push(booleanInt(patch[key]));
      else if (["avatarPath", "lastLoginAt"].includes(key)) values.push(optionalText(patch[key]));
      else values.push(requiredText(patch[key], key));
    }
    if (!assignments.length) return getUserById(id);
    assignments.push("updated_at = ?");
    values.push(nowIso(), String(id || ""));
    try {
      const result = database.prepare(`UPDATE users SET ${assignments.join(", ")} WHERE id = ?`).run(...values);
      if (!changesOf(result)) throw codedError("user_not_found", "User was not found.");
    } catch (error) {
      if (/users\.username|UNIQUE constraint failed: users\.username/i.test(error.message)) {
        throw codedError("username_exists", "Username is already in use.");
      }
      throw error;
    }
    return getUserById(id);
  }

  function mapSession(row) {
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      tokenHash: row.token_hash,
      userAgent: row.user_agent,
      ipAddress: row.ip_address,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
    };
  }

  function createSession(input = {}) {
    assertOpen();
    const id = optionalText(input.id) || crypto.randomUUID();
    database.prepare(`
      INSERT INTO sessions (id, user_id, token_hash, user_agent, ip_address, created_at, expires_at, revoked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
    `).run(
      id,
      requiredText(input.userId, "userId"),
      requiredText(input.tokenHash, "tokenHash"),
      optionalText(input.userAgent),
      optionalText(input.ipAddress),
      optionalText(input.createdAt) || nowIso(),
      requiredText(input.expiresAt, "expiresAt"),
    );
    return mapSession(database.prepare("SELECT * FROM sessions WHERE id = ?").get(id));
  }

  function getSessionByTokenHash(tokenHash) {
    assertOpen();
    return mapSession(database.prepare("SELECT * FROM sessions WHERE token_hash = ?").get(String(tokenHash || "")));
  }

  function revokeSession(id) {
    assertOpen();
    return changesOf(database.prepare("UPDATE sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ? AND revoked_at IS NULL").run(nowIso(), String(id || ""))) > 0;
  }

  function revokeUserSessions(userId, exceptSessionId = null) {
    assertOpen();
    if (exceptSessionId) {
      return changesOf(database.prepare(`
        UPDATE sessions SET revoked_at = ?
        WHERE user_id = ? AND revoked_at IS NULL AND id <> ?
      `).run(nowIso(), String(userId || ""), String(exceptSessionId)));
    }
    return changesOf(database.prepare(`
      UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL
    `).run(nowIso(), String(userId || "")));
  }

  function mapResource(row) {
    if (!row) return null;
    return {
      id: row.id,
      type: row.type,
      ownerUserId: row.owner_user_id,
      workspaceId: row.workspace_id,
      title: row.title,
      storagePath: row.storage_path,
      metadata: parseJson(row.metadata_json, {}),
      refType: row.ref_type,
      refId: row.ref_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
    };
  }

  function getResource(id) {
    assertOpen();
    return mapResource(database.prepare("SELECT * FROM resources WHERE id = ?").get(String(id || "")));
  }

  function getResourceByRef(refType, refId) {
    assertOpen();
    return mapResource(database.prepare(`
      SELECT * FROM resources WHERE ref_type = ? AND ref_id = ?
    `).get(String(refType || ""), String(refId || "")));
  }

  function registerResource(input = {}) {
    assertOpen();
    const refType = optionalText(input.refType);
    const refId = optionalText(input.refId);
    let existing = null;
    if (refType && refId) {
      existing = mapResource(database.prepare("SELECT * FROM resources WHERE ref_type = ? AND ref_id = ?").get(refType, refId));
    }
    if (!existing && input.id) existing = getResource(input.id);
    const timestamp = nowIso();
    const metadataJson = JSON.stringify(input.metadata && typeof input.metadata === "object" ? input.metadata : {});
    if (existing) {
      database.prepare(`
        UPDATE resources SET type = ?, owner_user_id = ?, workspace_id = ?, title = ?,
          storage_path = ?, metadata_json = ?, ref_type = ?, ref_id = ?, updated_at = ?, deleted_at = NULL
        WHERE id = ?
      `).run(
        requiredText(input.type ?? existing.type, "type"),
        requiredText(input.ownerUserId ?? existing.ownerUserId, "ownerUserId"),
        input.workspaceId === undefined ? existing.workspaceId : optionalText(input.workspaceId),
        requiredText(input.title ?? existing.title, "title"),
        input.storagePath === undefined ? existing.storagePath : optionalText(input.storagePath),
        input.metadata === undefined ? JSON.stringify(existing.metadata) : metadataJson,
        refType ?? existing.refType,
        refId ?? existing.refId,
        timestamp,
        existing.id,
      );
      return getResource(existing.id);
    }

    const id = optionalText(input.id) || crypto.randomUUID();
    database.prepare(`
      INSERT INTO resources (
        id, type, owner_user_id, workspace_id, title, storage_path, metadata_json,
        ref_type, ref_id, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
    `).run(
      id,
      requiredText(input.type, "type"),
      requiredText(input.ownerUserId, "ownerUserId"),
      optionalText(input.workspaceId),
      requiredText(input.title, "title"),
      optionalText(input.storagePath),
      metadataJson,
      refType,
      refId,
      timestamp,
      timestamp,
    );
    return getResource(id);
  }

  function updateResource(id, patch = {}) {
    assertOpen();
    const existing = getResource(id);
    if (!existing || existing.deletedAt) throw codedError("resource_not_found", "Resource was not found.");
    const fieldMap = {
      type: "type",
      workspaceId: "workspace_id",
      title: "title",
      storagePath: "storage_path",
      refType: "ref_type",
      refId: "ref_id",
    };
    const assignments = [];
    const values = [];
    for (const [key, column] of Object.entries(fieldMap)) {
      if (patch[key] === undefined) continue;
      assignments.push(`${column} = ?`);
      if (["workspaceId", "storagePath", "refType", "refId"].includes(key)) values.push(optionalText(patch[key]));
      else values.push(requiredText(patch[key], key));
    }
    if (patch.metadata !== undefined) {
      if (!patch.metadata || typeof patch.metadata !== "object" || Array.isArray(patch.metadata)) {
        throw codedError("invalid_input", "metadata must be an object.");
      }
      assignments.push("metadata_json = ?");
      values.push(JSON.stringify(patch.metadata));
    }
    if (!assignments.length) return existing;
    assignments.push("updated_at = ?");
    values.push(nowIso(), existing.id);
    database.prepare(`UPDATE resources SET ${assignments.join(", ")} WHERE id = ?`).run(...values);
    return getResource(existing.id);
  }

  function deleteResource(id) {
    assertOpen();
    const timestamp = nowIso();
    return changesOf(database.prepare(`
      UPDATE resources SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL
    `).run(timestamp, timestamp, String(id || ""))) > 0;
  }

  function listVisibleResources(userId, type = null) {
    assertOpen();
    const timestamp = nowIso();
    const parameters = [String(userId || ""), timestamp, String(userId || "")];
    let typeClause = "";
    if (type) {
      typeClause = " AND r.type = ?";
      parameters.push(String(type));
    }
    return database.prepare(`
      SELECT DISTINCT r.*
      FROM resources r
      LEFT JOIN shares s ON s.resource_id = r.id
      LEFT JOIN share_members sm ON sm.share_id = s.id
      WHERE r.deleted_at IS NULL
        AND (
          r.owner_user_id = ?
          OR (
            (s.expires_at IS NULL OR s.expires_at > ?)
            AND (s.visibility IN ('all', 'password') OR (s.visibility = 'users' AND sm.user_id = ?))
          )
        )
        ${typeClause}
      ORDER BY r.updated_at DESC, r.id
    `).all(...parameters).map(mapResource);
  }

  function mapAssetProjectLink(row) {
    if (!row) return null;
    return {
      resourceId: row.resource_id,
      projectId: row.project_id,
      boardId: row.board_id,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
    };
  }

  function linkAssetProject(input = {}) {
    assertOpen();
    const resourceId = requiredText(input.resourceId, "resourceId");
    const projectId = requiredText(input.projectId, "projectId");
    const boardId = String(input.boardId || "").trim();
    const resource = getResource(resourceId);
    if (!resource || resource.deletedAt) throw codedError("asset_resource_not_found", "Asset resource was not found.");
    if (!getCanvasProject(projectId)) throw codedError("canvas_project_not_found", "Canvas project was not found.");
    const timestamp = nowIso();
    database.prepare(`
      INSERT INTO asset_project_links(resource_id, project_id, board_id, last_used_at, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(resource_id, project_id, board_id) DO UPDATE SET
        last_used_at = excluded.last_used_at
    `).run(resourceId, projectId, boardId, timestamp, timestamp);
    return mapAssetProjectLink(database.prepare(`
      SELECT * FROM asset_project_links
      WHERE resource_id = ? AND project_id = ? AND board_id = ?
    `).get(resourceId, projectId, boardId));
  }

  function listAssetProjectLinks(resourceId) {
    assertOpen();
    return database.prepare(`
      SELECT * FROM asset_project_links
      WHERE resource_id = ?
      ORDER BY last_used_at DESC, project_id, board_id
    `).all(String(resourceId || "")).map(mapAssetProjectLink);
  }

  function getAssetEngagement(resourceId, userId) {
    assertOpen();
    const resourceKey = requiredText(resourceId, "resourceId");
    const userKey = requiredText(userId, "userId");
    const row = database.prepare(`
      SELECT
        (SELECT COUNT(*) FROM asset_likes WHERE resource_id = ?) AS like_count,
        EXISTS(SELECT 1 FROM asset_likes WHERE resource_id = ? AND user_id = ?) AS liked,
        EXISTS(SELECT 1 FROM asset_favorites WHERE resource_id = ? AND user_id = ?) AS favorited
    `).get(resourceKey, resourceKey, userKey, resourceKey, userKey);
    return {
      likeCount: Number(row?.like_count || 0),
      liked: Boolean(row?.liked),
      favorited: Boolean(row?.favorited),
    };
  }

  function setAssetLike(userId, resourceId, liked) {
    assertOpen();
    const userKey = requiredText(userId, "userId");
    const resourceKey = requiredText(resourceId, "resourceId");
    if (liked) {
      database.prepare(`
        INSERT INTO asset_likes(user_id, resource_id, created_at)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, resource_id) DO NOTHING
      `).run(userKey, resourceKey, nowIso());
    } else {
      database.prepare("DELETE FROM asset_likes WHERE user_id = ? AND resource_id = ?").run(userKey, resourceKey);
    }
    return getAssetEngagement(resourceKey, userKey);
  }

  function setAssetFavorite(userId, resourceId, favorited) {
    assertOpen();
    const userKey = requiredText(userId, "userId");
    const resourceKey = requiredText(resourceId, "resourceId");
    if (favorited) {
      database.prepare(`
        INSERT INTO asset_favorites(user_id, resource_id, created_at)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, resource_id) DO NOTHING
      `).run(userKey, resourceKey, nowIso());
    } else {
      database.prepare("DELETE FROM asset_favorites WHERE user_id = ? AND resource_id = ?").run(userKey, resourceKey);
    }
    return getAssetEngagement(resourceKey, userKey);
  }

  function listFavoriteResourceIds(userId) {
    assertOpen();
    return database.prepare(`
      SELECT f.resource_id
      FROM asset_favorites f
      JOIN resources r ON r.id = f.resource_id AND r.deleted_at IS NULL
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC, f.resource_id
    `).all(String(userId || "")).map((row) => row.resource_id);
  }

  function normalizeShareInput(input, existing = {}) {
    const visibility = input.visibility === undefined ? existing.visibility : String(input.visibility);
    const permission = input.permission === undefined ? existing.permission : String(input.permission);
    if (!SHARE_VISIBILITIES.has(visibility)) throw codedError("invalid_visibility", `Unsupported visibility: ${visibility}`);
    if (!SHARE_PERMISSIONS.has(permission)) throw codedError("invalid_permission", `Unsupported permission: ${permission}`);
    const userIds = input.userIds === undefined
      ? existing.userIds || []
      : [...new Set((Array.isArray(input.userIds) ? input.userIds : []).map(String).filter(Boolean))].sort();
    return {
      visibility,
      permission,
      passwordHash: input.passwordHash === undefined ? existing.passwordHash || null : optionalText(input.passwordHash),
      expiresAt: input.expiresAt === undefined ? existing.expiresAt || null : optionalText(input.expiresAt),
      userIds,
    };
  }

  function mapShare(row) {
    if (!row) return null;
    const userIds = database.prepare("SELECT user_id FROM share_members WHERE share_id = ? ORDER BY user_id").all(row.id).map((item) => item.user_id);
    return {
      id: row.id,
      resourceId: row.resource_id,
      createdBy: row.created_by,
      visibility: row.visibility,
      permission: row.permission,
      passwordHash: row.password_hash,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      userIds,
    };
  }

  function getShare(id) {
    assertOpen();
    return mapShare(database.prepare("SELECT * FROM shares WHERE id = ?").get(String(id || "")));
  }

  function getShareForResource(resourceId) {
    assertOpen();
    return mapShare(database.prepare("SELECT * FROM shares WHERE resource_id = ?").get(String(resourceId || "")));
  }

  function replaceShareMembers(shareId, userIds) {
    database.prepare("DELETE FROM share_members WHERE share_id = ?").run(shareId);
    const insertMember = database.prepare("INSERT INTO share_members (share_id, user_id) VALUES (?, ?)");
    for (const userId of userIds) insertMember.run(shareId, userId);
  }

  function createShare(input = {}) {
    assertOpen();
    const values = normalizeShareInput(input, { visibility: "private", permission: "read", userIds: [] });
    const id = optionalText(input.id) || crypto.randomUUID();
    const timestamp = nowIso();
    return transaction(() => {
      database.prepare("DELETE FROM shares WHERE resource_id = ?").run(requiredText(input.resourceId, "resourceId"));
      database.prepare(`
        INSERT INTO shares (
          id, resource_id, created_by, visibility, permission, password_hash,
          expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        input.resourceId,
        requiredText(input.createdBy, "createdBy"),
        values.visibility,
        values.permission,
        values.passwordHash,
        values.expiresAt,
        timestamp,
        timestamp,
      );
      replaceShareMembers(id, values.visibility === "users" ? values.userIds : []);
      return getShare(id);
    });
  }

  function updateShare(id, patch = {}) {
    assertOpen();
    const existing = getShare(id);
    if (!existing) throw codedError("share_not_found", "Share was not found.");
    const values = normalizeShareInput(patch, existing);
    return transaction(() => {
      database.prepare(`
        UPDATE shares SET visibility = ?, permission = ?, password_hash = ?, expires_at = ?, updated_at = ?
        WHERE id = ?
      `).run(values.visibility, values.permission, values.passwordHash, values.expiresAt, nowIso(), existing.id);
      replaceShareMembers(existing.id, values.visibility === "users" ? values.userIds : []);
      return getShare(existing.id);
    });
  }

  function deleteShare(id) {
    assertOpen();
    return changesOf(database.prepare("DELETE FROM shares WHERE id = ?").run(String(id || ""))) > 0;
  }

  function mapAudit(row) {
    if (!row) return null;
    return {
      id: row.id,
      actorUserId: row.actor_user_id,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      details: parseJson(row.details_json, {}),
      createdAt: row.created_at,
    };
  }

  function appendAudit(input = {}) {
    assertOpen();
    const id = optionalText(input.id) || crypto.randomUUID();
    database.prepare(`
      INSERT INTO audit_events (id, actor_user_id, action, target_type, target_id, details_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      optionalText(input.actorUserId),
      requiredText(input.action, "action"),
      optionalText(input.targetType),
      optionalText(input.targetId),
      JSON.stringify(input.details && typeof input.details === "object" ? input.details : {}),
      optionalText(input.createdAt) || nowIso(),
    );
    return mapAudit(database.prepare("SELECT * FROM audit_events WHERE id = ?").get(id));
  }

  function listAudit({ limit = 100, actorUserId = null } = {}) {
    assertOpen();
    const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 100));
    if (actorUserId) {
      return database.prepare(`
        SELECT * FROM audit_events WHERE actor_user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?
      `).all(String(actorUserId), safeLimit).map(mapAudit);
    }
    return database.prepare("SELECT * FROM audit_events ORDER BY created_at DESC, id DESC LIMIT ?").all(safeLimit).map(mapAudit);
  }

  function getSetting(key) {
    assertOpen();
    const row = database.prepare("SELECT value_json FROM system_settings WHERE key = ?").get(String(key || ""));
    return row ? parseJson(row.value_json, null) : null;
  }

  function setSetting(key, value) {
    assertOpen();
    database.prepare(`
      INSERT INTO system_settings (key, value_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
    `).run(requiredText(key, "key"), JSON.stringify(value), nowIso());
    return value;
  }

  function mapProviderModel(row) {
    if (!row) return null;
    return {
      id: row.model_id,
      displayName: row.display_name,
      modelProtocol: row.model_protocol,
      capabilities: parseJson(row.capabilities_json, []),
      sortOrder: Number(row.sort_order),
      capabilitySort: parseJson(row.capability_sort_json, {}),
      metadata: parseJson(row.metadata_json, {}),
    };
  }

  function listProviderModels(providerId) {
    assertOpen();
    return database.prepare(`
      SELECT * FROM provider_models
      WHERE provider_id = ?
      ORDER BY sort_order, model_id
    `).all(String(providerId || "")).map(mapProviderModel);
  }

  function mapProvider(row) {
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      baseUrl: row.base_url,
      providerProtocol: row.provider_protocol,
      source: row.source,
      cliTool: row.cli_tool,
      encryptedApiKey: row.encrypted_api_key,
      encryptedWalletKey: row.encrypted_wallet_key,
      enabled: Boolean(row.enabled),
      sortOrder: Number(row.sort_order),
      capabilitySort: parseJson(row.capability_sort_json, {}),
      metadata: parseJson(row.metadata_json, {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      models: listProviderModels(row.id),
    };
  }

  function listProviderRecords() {
    assertOpen();
    return database.prepare("SELECT * FROM providers ORDER BY sort_order, id").all().map(mapProvider);
  }

  function getProviderRecord(providerId) {
    assertOpen();
    return mapProvider(database.prepare("SELECT * FROM providers WHERE id = ?").get(String(providerId || "")));
  }

  function saveProviderRecord(input = {}) {
    assertOpen();
    const id = requiredText(input.id, "providerId");
    const existing = getProviderRecord(id);
    const maxSortOrder = Number(database.prepare("SELECT COALESCE(MAX(sort_order), -1) AS value FROM providers").get().value);
    const timestamp = nowIso();
    const models = input.models === undefined ? existing?.models || [] : jsonArray(input.models);
    const providerProtocol = requiredText(input.providerProtocol ?? existing?.providerProtocol, "provider protocol");
    const source = requiredText(input.source ?? existing?.source ?? "api", "provider source");
    const baseUrlInput = input.baseUrl ?? existing?.baseUrl;
    const normalized = {
      id,
      name: requiredText(input.name ?? existing?.name, "provider name"),
      baseUrl: source === "cli" ? String(baseUrlInput ?? "").trim() : requiredText(baseUrlInput, "provider baseUrl"),
      providerProtocol,
      source,
      cliTool: input.cliTool === undefined ? existing?.cliTool || null : optionalText(input.cliTool),
      encryptedApiKey: String(input.encryptedApiKey ?? existing?.encryptedApiKey ?? ""),
      encryptedWalletKey: String(input.encryptedWalletKey ?? existing?.encryptedWalletKey ?? ""),
      enabled: input.enabled === undefined ? existing?.enabled !== false : Boolean(input.enabled),
      sortOrder: safeSortOrder(input.sortOrder, existing?.sortOrder ?? maxSortOrder + 1),
      capabilitySort: jsonObject(input.capabilitySort, existing?.capabilitySort || {}),
      metadata: jsonObject(input.metadata, existing?.metadata || {}),
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
      models: models.map((model, index) => ({
        id: requiredText(model?.id, "modelId"),
        displayName: optionalText(model?.displayName),
        modelProtocol: requiredText(model?.modelProtocol ?? providerProtocol, "model protocol"),
        capabilities: [...new Set(jsonArray(model?.capabilities).map((item) => requiredText(item, "model capability")))],
        sortOrder: safeSortOrder(model?.sortOrder, index),
        capabilitySort: jsonObject(model?.capabilitySort),
        metadata: jsonObject(model?.metadata),
      })),
    };

    return transaction(() => {
      database.prepare(`
        INSERT INTO providers (
          id, name, base_url, provider_protocol, source, cli_tool,
          encrypted_api_key, encrypted_wallet_key, enabled, sort_order,
          capability_sort_json, metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          base_url = excluded.base_url,
          provider_protocol = excluded.provider_protocol,
          source = excluded.source,
          cli_tool = excluded.cli_tool,
          encrypted_api_key = excluded.encrypted_api_key,
          encrypted_wallet_key = excluded.encrypted_wallet_key,
          enabled = excluded.enabled,
          sort_order = excluded.sort_order,
          capability_sort_json = excluded.capability_sort_json,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at
      `).run(
        normalized.id,
        normalized.name,
        normalized.baseUrl,
        normalized.providerProtocol,
        normalized.source,
        normalized.cliTool,
        normalized.encryptedApiKey,
        normalized.encryptedWalletKey,
        booleanInt(normalized.enabled),
        normalized.sortOrder,
        JSON.stringify(normalized.capabilitySort),
        JSON.stringify(normalized.metadata),
        normalized.createdAt,
        normalized.updatedAt,
      );

      database.prepare("DELETE FROM provider_models WHERE provider_id = ?").run(normalized.id);
      const insertModel = database.prepare(`
        INSERT INTO provider_models (
          provider_id, model_id, display_name, model_protocol, capabilities_json,
          sort_order, capability_sort_json, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const model of normalized.models) {
        insertModel.run(
          normalized.id,
          model.id,
          model.displayName,
          model.modelProtocol,
          JSON.stringify(model.capabilities),
          model.sortOrder,
          JSON.stringify(model.capabilitySort),
          JSON.stringify(model.metadata),
        );
      }
      return getProviderRecord(normalized.id);
    });
  }

  function deleteProviderRecord(providerId) {
    assertOpen();
    return changesOf(database.prepare("DELETE FROM providers WHERE id = ?").run(String(providerId || ""))) > 0;
  }

  function validateExactOrder(ids, expectedIds, code, label) {
    if (!Array.isArray(ids)) throw codedError(code, `${label} order must be an array.`);
    const normalized = ids.map((id) => requiredText(id, label));
    if (new Set(normalized).size !== normalized.length) throw codedError(code, `${label} order contains duplicates.`);
    const expected = [...expectedIds].sort();
    const received = [...normalized].sort();
    if (expected.length !== received.length || expected.some((id, index) => id !== received[index])) {
      throw codedError(code, `${label} order must include every existing id exactly once.`);
    }
    return normalized;
  }

  function reorderProviderRecords(providerIds) {
    assertOpen();
    const ordered = validateExactOrder(
      providerIds,
      listProviderRecords().map((provider) => provider.id),
      "invalid_provider_order",
      "provider",
    );
    return transaction(() => {
      const update = database.prepare("UPDATE providers SET sort_order = ?, updated_at = ? WHERE id = ?");
      ordered.forEach((id, index) => update.run(index, nowIso(), id));
      return listProviderRecords();
    });
  }

  function reorderProviderModelRecords(providerId, modelIds) {
    assertOpen();
    const id = requiredText(providerId, "providerId");
    if (!getProviderRecord(id)) throw codedError("provider_not_found", "Provider was not found.");
    const ordered = validateExactOrder(
      modelIds,
      listProviderModels(id).map((model) => model.id),
      "invalid_model_order",
      "model",
    );
    return transaction(() => {
      const update = database.prepare(`
        UPDATE provider_models SET sort_order = ? WHERE provider_id = ? AND model_id = ?
      `);
      ordered.forEach((modelId, index) => update.run(index, id, modelId));
      database.prepare("UPDATE providers SET updated_at = ? WHERE id = ?").run(nowIso(), id);
      return getProviderRecord(id);
    });
  }

  function getProviderSettings() {
    assertOpen();
    const row = database.prepare("SELECT auto_fallback FROM provider_settings WHERE singleton = 1").get();
    return { autoFallback: row ? Boolean(row.auto_fallback) : true };
  }

  function setProviderSettings(patch = {}) {
    assertOpen();
    const current = getProviderSettings();
    const next = {
      autoFallback: patch.autoFallback === undefined ? current.autoFallback : Boolean(patch.autoFallback),
    };
    database.prepare(`
      INSERT INTO provider_settings(singleton, auto_fallback, updated_at) VALUES (1, ?, ?)
      ON CONFLICT(singleton) DO UPDATE SET
        auto_fallback = excluded.auto_fallback,
        updated_at = excluded.updated_at
    `).run(booleanInt(next.autoFallback), nowIso());
    return next;
  }

  function hasEncryptedProviderSecrets() {
    assertOpen();
    const row = database.prepare(`
      SELECT
        SUM(CASE WHEN encrypted_api_key <> '' THEN 1 ELSE 0 END) +
        SUM(CASE WHEN encrypted_wallet_key <> '' THEN 1 ELSE 0 END) AS count
      FROM providers
    `).get();
    return Number(row?.count || 0);
  }

  function getUserPreferences(userId) {
    assertOpen();
    const row = database.prepare("SELECT value_json FROM user_preferences WHERE user_id = ?").get(String(userId || ""));
    return row ? jsonObject(parseJson(row.value_json, {})) : {};
  }

  function setUserPreferences(userId, patch = {}) {
    assertOpen();
    const id = requiredText(userId, "userId");
    const next = mergeJsonObjects(getUserPreferences(id), patch);
    return replaceUserPreferences(id, next);
  }

  function replaceUserPreferences(userId, value = {}) {
    assertOpen();
    const id = requiredText(userId, "userId");
    const next = jsonObject(value);
    database.prepare(`
      INSERT INTO user_preferences(user_id, value_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `).run(id, JSON.stringify(next), nowIso());
    return next;
  }

  function close() {
    if (closed) return;
    closed = true;
    database.close();
  }

  return {
    dbPath: resolvedPath,
    migrate,
    quickCheck,
    countUsers,
    getUserById,
    getUserByUsername,
    listUsers,
    getCanvasProject,
    listCanvasProjects,
    createCanvasProject,
    renameCanvasProject,
    insertUser,
    updateUser,
    createSession,
    getSessionByTokenHash,
    revokeSession,
    revokeUserSessions,
    registerResource,
    getResource,
    getResourceByRef,
    updateResource,
    deleteResource,
    listVisibleResources,
    linkAssetProject,
    listAssetProjectLinks,
    getAssetEngagement,
    setAssetLike,
    setAssetFavorite,
    listFavoriteResourceIds,
    createShare,
    getShare,
    getShareForResource,
    updateShare,
    deleteShare,
    appendAudit,
    listAudit,
    getSetting,
    setSetting,
    listProviderRecords,
    getProviderRecord,
    saveProviderRecord,
    deleteProviderRecord,
    reorderProviderRecords,
    reorderProviderModelRecords,
    getProviderSettings,
    setProviderSettings,
    hasEncryptedProviderSecrets,
    getUserPreferences,
    setUserPreferences,
    replaceUserPreferences,
    runInTransaction: transaction,
    close,
  };
}

module.exports = {
  SCHEMA_VERSION,
  USER_ROLES,
  USER_STATUSES,
  SHARE_VISIBILITIES,
  SHARE_PERMISSIONS,
  normalizeCanvasProjectName,
  createSystemDb,
};
