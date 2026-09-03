"use strict";

const TEST_INTENTS = Object.freeze({
  "/api/providers/test": "llm.chat",
  "/api/providers/test-image": "image.generate",
  "/api/providers/test-video": "video.generate",
  "/api/providers/test-audio": "audio.generate",
  "/api/providers/test-vision": "llm.chat.vision",
});

const STATIC_PROVIDER_PATHS = new Set([
  "/api/providers",
  "/api/providers/reorder",
  "/api/providers/models/reorder",
  "/api/providers/auto-fallback",
  "/api/providers/verify-protocol",
  "/api/providers/infer-protocols",
  "/api/providers/models",
  ...Object.keys(TEST_INTENTS),
  "/api/protocols",
]);

const SENSITIVE_KEYS = new Set([
  "apikey",
  "api_key",
  "walletkey",
  "wallet_api_key",
  "authorization",
  "encryptedapikey",
  "encryptedwalletkey",
]);

function httpError(code, message, statusCode = 400, details = {}) {
  return Object.assign(new Error(message), { code, statusCode, ...details });
}

function requestPath(req) {
  try {
    return new URL(req?.url || "/", `http://${req?.headers?.host || "localhost"}`).pathname;
  } catch {
    return "/";
  }
}

function redactText(value, secrets = []) {
  let text = String(value || "").slice(0, 2_000);
  for (const secret of secrets.map(String).filter(Boolean)) text = text.split(secret).join("[REDACTED]");
  return text
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(?:sk|rk|pk|key)-[A-Za-z0-9._-]{4,}/gi, "[REDACTED]");
}

function sanitizeForBrowser(value, secrets = [], seen = new WeakSet()) {
  if (typeof value === "string") return redactText(value, secrets);
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeForBrowser(item, secrets, seen));
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) continue;
    output[key] = sanitizeForBrowser(item, secrets, seen);
  }
  return output;
}

function isMaskedSecret(value) {
  const text = String(value || "");
  return text.includes("••••") || /^\*+$/.test(text);
}

function changedFields(payload, allowed) {
  return allowed.filter((field) => Object.hasOwn(payload || {}, field));
}

function providerIdFromPath(pathname) {
  if (STATIC_PROVIDER_PATHS.has(pathname)) return "";
  const match = pathname.match(/^\/api\/providers\/([^/]+)$/);
  if (!match) return "";
  try { return decodeURIComponent(match[1]); }
  catch { return ""; }
}

function enabledProviderIdFromPath(pathname) {
  const match = pathname.match(/^\/api\/providers\/([^/]+)\/enabled$/);
  if (!match) return "";
  try { return decodeURIComponent(match[1]); }
  catch { return ""; }
}

function isRecognizedPath(pathname) {
  return STATIC_PROVIDER_PATHS.has(pathname)
    || Boolean(providerIdFromPath(pathname))
    || Boolean(enabledProviderIdFromPath(pathname))
    || pathname === "/api/settings/providers/key";
}

function responseStatus(error, pathname = "") {
  if (Number.isInteger(Number(error?.statusCode))) return Number(error.statusCode);
  if (error?.code === "provider_not_found") return 404;
  if (["PROVIDER_VAULT_KEY_MISSING", "PROVIDER_VAULT_KEY_INVALID", "PROVIDER_SUBSYSTEM_LOCKED"].includes(error?.code)) return 503;
  if (error?.code === "UPSTREAM_TIMEOUT") return 504;
  if (error?.code === "UPSTREAM_RATE_LIMIT") return 429;
  if (String(error?.code || "").startsWith("UPSTREAM_")) return 502;
  if ([
    "/api/providers/verify-protocol",
    "/api/providers/models",
    ...Object.keys(TEST_INTENTS),
  ].includes(pathname) && !error?.code) return 502;
  return 400;
}

function createProviderHttpApi({
  store,
  registry,
  engine,
  requireSignedIn,
  requireRole,
  readJson,
  sendJson,
  appendAudit = () => {},
  assertAvailable = () => true,
} = {}) {
  if (!store || typeof store.listPublic !== "function" || typeof store.reveal !== "function") {
    throw new TypeError("Provider HTTP API requires a compatible Provider Store.");
  }
  if (!registry || typeof registry.listPublic !== "function") throw new TypeError("Provider HTTP API requires a Protocol Registry.");
  if (!engine || typeof engine.execute !== "function" || typeof engine.fetchModels !== "function") {
    throw new TypeError("Provider HTTP API requires a Protocol Engine.");
  }
  if (typeof requireSignedIn !== "function" || typeof requireRole !== "function") {
    throw new TypeError("Provider HTTP API requires authentication gates.");
  }
  if (typeof readJson !== "function" || typeof sendJson !== "function") {
    throw new TypeError("Provider HTTP API requires HTTP helpers.");
  }
  let availabilityCheck = assertAvailable;

  function audit(auth, action, targetId, fields) {
    appendAudit({
      actorUserId: auth.user.id,
      action,
      targetType: "provider",
      targetId: String(targetId || ""),
      details: { fields: [...new Set(fields.map(String))] },
    });
  }

  function publicSend(res, status, body, secrets = []) {
    sendJson(res, status, sanitizeForBrowser(body, secrets));
  }

  async function authorize(req) {
    const auth = await requireSignedIn(req);
    await requireRole(auth, "superadmin");
    return auth;
  }

  function revealProvider(providerId) {
    const id = String(providerId || "").trim();
    if (!id) throw httpError("invalid_provider_input", "providerId is required.");
    return store.reveal(id);
  }

  function mergeDraftProvider(payload) {
    const draft = payload?.provider && typeof payload.provider === "object" ? payload.provider : payload;
    const providerId = String(payload?.providerId || draft?.id || "").trim();
    let stored = null;
    if (providerId) {
      try { stored = store.reveal(providerId); }
      catch (error) { if (error?.code !== "provider_not_found") throw error; }
    }
    const merged = { ...(stored || {}), ...(draft || {}), id: providerId || draft?.id };
    if (!draft?.apiKey || isMaskedSecret(draft.apiKey)) merged.apiKey = stored?.apiKey || "";
    if (!draft?.walletKey || isMaskedSecret(draft.walletKey)) merged.walletKey = stored?.walletKey || "";
    return merged;
  }

  function modelFor(provider, modelId) {
    const id = String(modelId || "").trim();
    if (!id) throw httpError("invalid_provider_model", "modelId is required.");
    const model = (provider.models || []).find((item) => item.id === id);
    if (!model) throw httpError("provider_model_not_found", "Provider model was not found.", 404);
    return model;
  }

  async function handle(req, res) {
    const pathname = requestPath(req);
    if (!isRecognizedPath(pathname)) return false;
    let auth;
    let payload = {};
    let secrets = [];
    try {
      if (pathname === "/api/settings/providers/key") {
        await requireSignedIn(req);
        publicSend(res, 410, { error: "Provider keys are no longer returned to browsers.", code: "provider_key_reveal_removed" });
        return true;
      }
      auth = await authorize(req);
      availabilityCheck();
      if (!["GET", "DELETE"].includes(String(req.method || "").toUpperCase())) {
        payload = await readJson(req);
        secrets = [payload?.apiKey, payload?.walletKey, payload?.provider?.apiKey, payload?.provider?.walletKey].filter(Boolean);
      }

      if (pathname === "/api/providers" && req.method === "GET") {
        publicSend(res, 200, { providers: store.listPublic() });
        return true;
      }
      if (pathname === "/api/providers" && req.method === "POST") {
        const existed = Boolean(store.getPublic?.(payload.id));
        const saved = store.save(payload);
        audit(auth, existed ? "provider.updated" : "provider.created", saved.id, changedFields(payload, [
          "name", "baseUrl", "protocol", "source", "cliTool", "apiKey", "walletKey", "clearApiKey", "clearWalletKey", "enabled", "sortOrder", "capabilitySort", "models",
        ]));
        publicSend(res, existed ? 200 : 201, { provider: saved }, secrets);
        return true;
      }
      const enabledProviderId = enabledProviderIdFromPath(pathname);
      if (enabledProviderId && req.method === "POST") {
        const provider = store.setEnabled(enabledProviderId, Boolean(payload.enabled));
        audit(auth, "provider.enabled_changed", enabledProviderId, ["enabled"]);
        publicSend(res, 200, { provider });
        return true;
      }
      const providerId = providerIdFromPath(pathname);
      if (providerId && req.method === "GET") {
        const provider = store.getPublic(providerId);
        if (!provider) throw httpError("provider_not_found", "Provider was not found.", 404);
        publicSend(res, 200, { provider });
        return true;
      }
      if (providerId && req.method === "DELETE") {
        if (!store.remove(providerId)) throw httpError("provider_not_found", "Provider was not found.", 404);
        audit(auth, "provider.deleted", providerId, ["id"]);
        publicSend(res, 200, { ok: true, providerId });
        return true;
      }
      if (pathname === "/api/providers/reorder" && req.method === "POST") {
        const providers = store.reorderProviders(payload.providerIds);
        audit(auth, "provider.reordered", "providers", ["providerIds"]);
        publicSend(res, 200, { providers });
        return true;
      }
      if (pathname === "/api/providers/models/reorder" && req.method === "POST") {
        const provider = store.reorderModels(payload.providerId, payload.modelIds);
        audit(auth, "provider.models_reordered", payload.providerId, ["modelIds"]);
        publicSend(res, 200, { provider });
        return true;
      }
      if (pathname === "/api/providers/auto-fallback" && req.method === "GET") {
        publicSend(res, 200, { enabled: store.getAutoFallback() });
        return true;
      }
      if (pathname === "/api/providers/auto-fallback" && req.method === "POST") {
        const enabled = store.setAutoFallback(Boolean(payload.enabled));
        audit(auth, "provider.auto_fallback_changed", "provider-settings", ["enabled"]);
        publicSend(res, 200, { enabled });
        return true;
      }
      if (pathname === "/api/providers/verify-protocol" && req.method === "POST") {
        const provider = mergeDraftProvider(payload);
        secrets.push(provider.apiKey, provider.walletKey);
        publicSend(res, 200, await engine.verifyProtocol(provider, payload.options || {}), secrets);
        return true;
      }
      if (pathname === "/api/providers/infer-protocols" && req.method === "POST") {
        const models = Array.isArray(payload.models) ? payload.models : [];
        publicSend(res, 200, {
          candidates: registry.candidatesForBaseUrl(payload.baseUrl, payload.protocol),
          models: models.map((model) => ({ id: String(model?.id || ""), protocol: registry.inferModelProtocol(model) })),
        });
        return true;
      }
      if (pathname === "/api/providers/models" && req.method === "POST") {
        const provider = mergeDraftProvider(payload);
        secrets.push(provider.apiKey, provider.walletKey);
        publicSend(res, 200, { models: await engine.fetchModels(provider, payload.options || {}) }, secrets);
        return true;
      }
      if (Object.hasOwn(TEST_INTENTS, pathname) && req.method === "POST") {
        const provider = mergeDraftProvider(payload);
        const model = modelFor(provider, payload.modelId);
        const intent = TEST_INTENTS[pathname];
        if (Array.isArray(model.capabilities) && !model.capabilities.includes(intent)) {
          throw httpError("provider_model_capability_missing", `The selected model does not support ${intent}.`);
        }
        secrets.push(provider.apiKey, provider.walletKey);
        const result = await engine.execute(provider, model, intent, payload.input || { prompt: "ping" }, payload.params || {}, payload.options || {});
        publicSend(res, 200, { result }, secrets);
        return true;
      }
      if (pathname === "/api/protocols" && req.method === "GET") {
        publicSend(res, 200, { protocols: registry.listPublic() });
        return true;
      }
      publicSend(res, 405, { error: "Method not allowed", code: "method_not_allowed" });
      return true;
    } catch (error) {
      const status = responseStatus(error, pathname);
      publicSend(res, status, {
        error: redactText(error?.safeMessage || error?.message || "Provider request failed.", secrets),
        code: String(error?.code || "provider_request_failed"),
        ...(status === 503 ? { recoverable: true } : {}),
      }, secrets);
      return true;
    }
  }

  return Object.freeze({
    handle,
    setAvailability(nextCheck) {
      if (typeof nextCheck !== "function") throw new TypeError("Availability check must be a function.");
      availabilityCheck = nextCheck;
    },
  });
}

module.exports = {
  createProviderHttpApi,
  sanitizeForBrowser,
};
