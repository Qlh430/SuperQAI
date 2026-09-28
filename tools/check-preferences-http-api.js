"use strict";

const assert = require("node:assert/strict");

const { createPreferencesHttpApi } = require("../preferences-http-api");

function request(url, {
  method = "GET",
  body,
  userId = "user-1",
} = {}) {
  return {
    url,
    method,
    headers: { host: "localhost" },
    auth: userId ? { user: { id: userId } } : null,
    body,
  };
}

function responseRecorder() {
  return {
    status: 0,
    body: null,
    headers: {},
    sendJson(_res, status, body, headers = {}) {
      this.status = status;
      this.body = body;
      this.headers = headers;
    },
  };
}

async function call(api, req) {
  const response = responseRecorder();
  const handled = await api.handle(req, response);
  return { handled, response };
}

async function main() {
  const stored = new Map();
  const calls = { audits: [], roleChecks: 0 };
  const api = createPreferencesHttpApi({
    systemDb: {
      getUserPreferences: (userId) => stored.get(userId) || {},
      replaceUserPreferences: (userId, value) => {
        stored.set(userId, value);
        return value;
      },
    },
    readJson: async (req) => req.body || {},
    sendJson: (res, status, body, headers) => res.sendJson(res, status, body, headers),
    requireSuperAdmin: async () => {
      calls.roleChecks += 1;
      return { user: { id: "admin-1" } };
    },
  });

  assert.equal((await call(api, request("/api/models"))).handled, false);

  const initial = await call(api, request("/api/preferences"));
  assert.equal(initial.handled, true);
  assert.equal(initial.response.status, 200);
  assert.deepEqual(initial.response.body.preferences, {
    appearance: { theme: "system", scale: 1, animations: "full" },
  });
  assert.equal(initial.response.headers["Cache-Control"], "no-store");

  const updated = await call(api, request("/api/preferences", {
    method: "PATCH",
    body: {
      appearance: {
        theme: "dark",
        scale: 1.25,
        animations: "reduced",
      },
    },
  }));
  assert.equal(updated.response.status, 200);
  assert.deepEqual(updated.response.body.preferences, {
    appearance: { theme: "dark", scale: 1.25, animations: "reduced" },
  });
  assert.deepEqual(stored.get("user-1"), updated.response.body.preferences);

  const invalid = await call(api, request("/api/preferences", {
    method: "PATCH",
    body: { appearance: { palettes: ["blue"] } },
  }));
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.response.body.code, "invalid_preference_field");

  const methodNotAllowed = await call(api, request("/api/preferences", { method: "DELETE" }));
  assert.equal(methodNotAllowed.response.status, 405);
  assert.equal(methodNotAllowed.response.body.code, "method_not_allowed");

  const legacyGet = await call(api, request("/api/settings"));
  assert.equal(legacyGet.response.status, 200);
  assert.equal(legacyGet.response.body.deprecated, true);
  assert.equal(legacyGet.response.body.replacement, "/api/preferences");
  assert.deepEqual(legacyGet.response.body.appearance, updated.response.body.preferences.appearance);

  const legacyProviderWrite = await call(api, request("/api/settings", {
    method: "PUT",
    body: { providers: [], agentRouting: {} },
  }));
  assert.equal(legacyProviderWrite.response.status, 410);
  assert.equal(legacyProviderWrite.response.body.code, "provider_control_plane_retired");
  assert.equal(calls.roleChecks, 1);

  console.log("Preferences HTTP API checks passed.");
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
