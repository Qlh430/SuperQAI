"use strict";

const { inferModelConfiguration, normalizeProviderBaseUrl } = require("./provider-model-rules");
const { presentTestResult } = require("./provider-test-result");
const { analyzeProviderAgentCoverage } = require("./provider-agent-coverage");

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
  "/api/providers/agent-coverage",
  "/api/providers/agent-settings",
  ...Object.keys(TEST_INTENTS),
  "/api/protocols",
  "/api/protocols/custom",
  "/api/protocols/route-test",
]);

const JIMENG_PATHS = new Set([
  "/api/jimeng-cli/status",
  "/api/jimeng-cli/path",
  "/api/jimeng-cli/login",
  "/api/jimeng-cli/relogin",
  "/api/jimeng-cli/login-status",
  "/api/jimeng-cli/logout",
  "/api/jimeng-cli/models",
]);

const SENSITIVE_KEYS = new Set([
  "apikey",
  "api_key",
  "walletkey",
  "wallet_api_key",
  "authorization",
  "encryptedapikey",
  "encryptedwalletkey",
  "token",
  "cookie",
  "password",
  "stdout",
  "stderr",
  "raw",
  "qr",
  "devicecode",
  "device_code",
  "verification_uri",
  "login_url",
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
    || JIMENG_PATHS.has(pathname)
    || /^\/api\/protocols\/custom\/[^/]+$/.test(pathname)
    || Boolean(providerIdFromPath(pathname))
    || Boolean(enabledProviderIdFromPath(pathname))
    || pathname === "/api/settings/providers/key";
}

function responseStatus(error, pathname = "") {
  if (Number.isInteger(Number(error?.statusCode))) return Number(error.statusCode);
  if (Number.isInteger(Number(error?.status))) return Number(error.status);
  if (error?.code === "provider_not_found") return 404;
  if (["PROVIDER_VAULT_KEY_MISSING", "PROVIDER_VAULT_KEY_INVALID", "PROVIDER_SUBSYSTEM_LOCKED"].includes(error?.code)) return 503;
  if (error?.code === "UPSTREAM_TIMEOUT") return 504;
  if (error?.code === "UPSTREAM_RATE_LIMIT") return 429;
  if (String(error?.code || "").startsWith("UPSTREAM_")) return 502;
  if ([
    "/api/providers/verify-protocol",
    "/api/providers/models",
    "/api/providers/agent-coverage",
    ...Object.keys(TEST_INTENTS),
  ].includes(pathname) && !error?.code) return 502;
  return 400;
}

function inferDiscoveredModels(models, provider, inferConfiguration) {
  const modelConfigurations = [];
  const skippedModels = [];
  for (const model of models) {
    const id = String(typeof model === "string" ? model : model?.id || model?.model || model?.name || "").trim();
    try {
      const configuration = typeof model === "string" ? { id } : { ...model, id };
      modelConfigurations.push(inferConfiguration(configuration, provider));
    } catch (error) {
      skippedModels.push({ id, code: String(error?.code || "invalid_model_configuration") });
    }
  }
  return { modelConfigurations, skippedModels };
}

function createProviderHttpApi({
  store,
  registry,
  engine,
  protocolCenter = null,
  jimengCli = null,
  requireSignedIn,
  requireRole,
  readJson,
  sendJson,
  appendAudit = () => {},
  onCatalogChange = () => {},
  readCatalogRevision = () => 0,
  assertAvailable = () => true,
  agentModelSettings = null,
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

  function catalogChanged() {
    const revision = Number(onCatalogChange());
    return Number.isFinite(revision) && revision > 0 ? revision : Math.max(0, Number(readCatalogRevision()) || 0);
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

  function mergeDraftProvider(payload, { validateModels = true } = {}) {
    const draft = payload?.provider && typeof payload.provider === "object" ? payload.provider : payload;
    const providerId = String(payload?.providerId || draft?.id || "").trim();
    let stored = null;
    if (providerId) {
      try { stored = store.reveal(providerId); }
      catch (error) { if (error?.code !== "provider_not_found") throw error; }
    }
    const merged = { ...(stored || {}), ...(draft || {}), id: providerId || draft?.id };
    merged.protocol = registry.platformProtocolId?.(merged.protocol || merged.providerProtocol) || merged.protocol || merged.providerProtocol;
    if (!draft?.apiKey || isMaskedSecret(draft.apiKey)) merged.apiKey = stored?.apiKey || "";
    if (!draft?.walletKey || isMaskedSecret(draft.walletKey)) merged.walletKey = stored?.walletKey || "";
    merged.apiKey = String(merged.apiKey || "").trim();
    merged.walletKey = String(merged.walletKey || "").trim();
    merged.baseUrl = merged.protocol === "cli:jimeng" ? "" : normalizeProviderBaseUrl(merged.baseUrl);
    const models = Array.isArray(merged.models) ? merged.models : [];
    merged.models = validateModels
      ? models.map(model => ({ ...model, ...(registry.inferModelConfiguration || inferModelConfiguration)(model, merged) }))
      : [];
    return merged;
  }

  function modelFor(provider, modelId) {
    const id = String(modelId || "").trim();
    if (!id) throw httpError("invalid_provider_model", "modelId is required.");
    const model = (provider.models || []).find((item) => item.id === id);
    if (!model) throw httpError("provider_model_not_found", "Provider model was not found.", 404);
    return model;
  }

  function validateProviderTestResult(result, intent) {
    const llmIntent = String(intent || "").startsWith("llm.");
    if (llmIntent) {
      const meaningful = value => {
        if (typeof value === "string") return Boolean(value.trim());
        if (Array.isArray(value)) return value.some(meaningful);
        if (!value || typeof value !== "object") return false;
        return ["text", "content", "output", "response", "answer"].some(key => meaningful(value[key]))
          || Boolean(value.message && typeof value.message === "object" && meaningful(value.message));
      };
      const toolCalls = Array.isArray(result?.toolCalls) ? result.toolCalls : Array.isArray(result?.tool_calls) ? result.tool_calls : [];
      const hasChoices = Array.isArray(result?.choices) && result.choices.some(choice => meaningful(choice));
      const hasCandidates = Array.isArray(result?.candidates) && result.candidates.some(candidate => meaningful(candidate));
      if (!meaningful(result) && !hasChoices && !hasCandidates && !toolCalls.length) {
        throw httpError("provider_test_invalid_response", "上游已响应，但没有返回可用的 LLM 内容；请检查模型协议和模型 ID。", 502);
      }
      return;
    }
    if (String(intent || "").startsWith("image.")) {
      const imageLeafKeys = new Set(["url", "image_url", "imageUrl", "imageURL", "fileUrl", "fileURL", "outputUrl", "b64_json", "b64", "image_base64", "imageBase64"]);
      const imageContainerKeys = new Set(["data", "images", "image", "result", "results", "output", "outputs", "response"]);
      const hasImageValue = (value, key = "") => {
        if (typeof value === "string") {
          const text = value.trim();
          if (!text) return false;
          return imageLeafKeys.has(key) || /^https?:\/\/|^data:image\//i.test(text);
        }
        if (Array.isArray(value)) return value.some(item => hasImageValue(item, key));
        if (!value || typeof value !== "object") return false;
        if (["task_id", "taskId"].some(name => String(value[name] || "").trim())) return true;
        return Object.entries(value).some(([entryKey, entryValue]) => (
          imageLeafKeys.has(entryKey) || imageContainerKeys.has(entryKey)
            ? hasImageValue(entryValue, entryKey)
            : (entryValue && typeof entryValue === "object" && hasImageValue(entryValue, entryKey))
        ));
      };
      if (!hasImageValue(result)) {
        throw httpError("provider_test_invalid_response", "上游已响应，但没有返回图片或任务编号；请检查图片模型协议和模型 ID。", 502);
      }
    }
  }

  function requireJimengCli() {
    if (!jimengCli) throw httpError("jimeng_cli_unavailable", "即梦 CLI 服务尚未就绪。", 503);
    return jimengCli;
  }

  function publicJimengStatus(value) {
    const current = value && typeof value === "object" ? value : {};
    const allowedStates = new Set(["missing", "version-incompatible", "runtime-error", "ready-signed-in", "ready-signed-out", "login-running", "login-failed"]);
    return {
      state: allowedStates.has(current.state) ? current.state : "runtime-error",
      executable: String(current.executable || ""),
      source: String(current.source || ""),
      version: String(current.version || ""),
      minimumVersion: String(current.minimumVersion || ""),
      signedIn: current.signedIn === true,
      account: redactText(current.account || ""),
      credits: typeof current.credits === "number" && Number.isFinite(current.credits) ? current.credits : null,
      message: redactText(current.message || ""),
      // The authorization material is what the operator needs to finish a login,
      // and it is the CLI's own console output. The device code stays server side
      // because it authorizes polling.
      authUrl: /^https:\/\/[^\s"'<>]+$/i.test(String(current.authUrl || "")) ? String(current.authUrl).slice(0, 300) : "",
      userCode: String(current.userCode || "").replace(/[^A-Za-z0-9-]/g, "").slice(0, 24),
      // The active session is normally obtained by the official CLI outside this
      // host, so the panel states where it came from instead of implying a
      // sign-in through AI OS.
      loginSource: String(current.loginSource || "").replace(/[^a-z-]/gi, "").slice(0, 40),
    };
  }

  // Dreamina image models are published as "jimeng-5.0Pro" and video models as
  // Seedance names, so both shapes are accepted. A bare version is still let
  // through for an older saved catalog, and anything else is dropped.
  function publicJimengModels(models) {
    return [...new Set((Array.isArray(models) ? models : [])
      .map((model) => String(model || "").trim())
      .filter((model) => /^(?:seedance[a-z0-9._-]*|jimeng-\d+(?:\.\d+)+[a-z]*|\d+(?:\.\d+)+[a-z]*)$/i.test(model)))];
  }

  async function handle(req, res) {
    const pathname = requestPath(req);
    if (!isRecognizedPath(pathname)) return false;
    let auth;
    let payload = {};
    let secrets = [];
    try {
      if (pathname === "/api/settings/providers/key") {
        auth = await authorize(req);
        publicSend(res, 410, { error: "Provider keys are no longer returned to browsers.", code: "provider_key_reveal_removed" });
        return true;
      }
      auth = await authorize(req);
      availabilityCheck();
      if (!["GET", "DELETE"].includes(String(req.method || "").toUpperCase())) {
        payload = await readJson(req);
        secrets = [payload?.apiKey, payload?.walletKey, payload?.provider?.apiKey, payload?.provider?.walletKey].filter(Boolean);
      }

      if (pathname === "/api/jimeng-cli/status" && req.method === "GET") {
        publicSend(res, 200, { status: publicJimengStatus(await requireJimengCli().status()) });
        return true;
      }
      if (pathname === "/api/jimeng-cli/path" && req.method === "POST") {
        publicSend(res, 200, { status: publicJimengStatus(await requireJimengCli().setPath(payload.executablePath)) });
        audit(auth, "jimeng_cli.path_changed", "jimeng-cli", ["executablePath"]);
        return true;
      }
      if (pathname === "/api/jimeng-cli/login" && req.method === "POST") {
        publicSend(res, 200, { status: publicJimengStatus(await requireJimengCli().login()) });
        audit(auth, "jimeng_cli.login_started", "jimeng-cli", []);
        return true;
      }
      if (pathname === "/api/jimeng-cli/relogin" && req.method === "POST") {
        publicSend(res, 200, { status: publicJimengStatus(await requireJimengCli().relogin()) });
        audit(auth, "jimeng_cli.relogin_started", "jimeng-cli", []);
        return true;
      }
      if (pathname === "/api/jimeng-cli/login-status" && req.method === "GET") {
        publicSend(res, 200, { status: publicJimengStatus(await requireJimengCli().loginStatus()) });
        return true;
      }
      if (pathname === "/api/jimeng-cli/logout" && req.method === "POST") {
        publicSend(res, 200, { status: publicJimengStatus(await requireJimengCli().logout()) });
        audit(auth, "jimeng_cli.logout", "jimeng-cli", []);
        return true;
      }
      if (pathname === "/api/jimeng-cli/models" && req.method === "POST") {
        const models = publicJimengModels(await requireJimengCli().models());
        publicSend(res, 200, { models });
        audit(auth, "jimeng_cli.models_refreshed", "jimeng-cli", []);
        return true;
      }

      if (pathname === "/api/providers" && req.method === "GET") {
        publicSend(res, 200, {
          providers: store.listPublic(),
          catalogRevision: Math.max(0, Number(readCatalogRevision()) || 0),
        });
        return true;
      }
      if (pathname === "/api/providers" && req.method === "POST") {
        const existed = Boolean(store.getPublic?.(payload.id));
        const saved = store.save(payload);
        const catalogRevision = catalogChanged();
        audit(auth, existed ? "provider.updated" : "provider.created", saved.id, changedFields(payload, [
          "name", "baseUrl", "protocol", "source", "cliTool", "apiKey", "walletKey", "clearApiKey", "clearWalletKey", "enabled", "sortOrder", "capabilitySort", "models",
        ]));
        publicSend(res, existed ? 200 : 201, { provider: saved, catalogRevision }, secrets);
        return true;
      }
      const enabledProviderId = enabledProviderIdFromPath(pathname);
      if (enabledProviderId && req.method === "POST") {
        const provider = store.setEnabled(enabledProviderId, Boolean(payload.enabled));
        catalogChanged();
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
        catalogChanged();
        audit(auth, "provider.deleted", providerId, ["id"]);
        publicSend(res, 200, { ok: true, providerId });
        return true;
      }
      if (pathname === "/api/providers/reorder" && req.method === "POST") {
        const providers = store.reorderProviders(payload.providerIds);
        catalogChanged();
        audit(auth, "provider.reordered", "providers", ["providerIds"]);
        publicSend(res, 200, { providers });
        return true;
      }
      if (pathname === "/api/providers/models/reorder" && req.method === "POST") {
        const provider = store.reorderModels(payload.providerId, payload.modelIds);
        catalogChanged();
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
      if (pathname === "/api/providers/agent-settings" && req.method === "GET") {
        if (!agentModelSettings?.get) throw httpError("agent_settings_unavailable", "Agent 设置服务尚未就绪。", 503);
        publicSend(res, 200, agentModelSettings.get());
        return true;
      }
      if (pathname === "/api/providers/agent-settings" && req.method === "POST") {
        if (!agentModelSettings?.save) throw httpError("agent_settings_unavailable", "Agent 设置服务尚未就绪。", 503);
        const result = agentModelSettings.save(payload);
        audit(auth, "provider.agent_settings_updated", "agent-model-settings", ["primary", "candidates"]);
        publicSend(res, 200, result);
        return true;
      }
      if (pathname === "/api/providers/verify-protocol" && req.method === "POST") {
        const provider = mergeDraftProvider(payload, { validateModels: false });
        secrets.push(provider.apiKey, provider.walletKey);
        const verified = await engine.verifyProtocol(provider, payload.options || {});
        publicSend(res, 200, { ...verified, baseUrl: provider.baseUrl }, secrets);
        return true;
      }
      if (pathname === "/api/providers/infer-protocols" && req.method === "POST") {
        const models = Array.isArray(payload.models) ? payload.models : [];
        const inferred = inferDiscoveredModels(models, payload, registry.inferModelConfiguration || inferModelConfiguration);
        publicSend(res, 200, {
          candidates: registry.candidatesForBaseUrl(payload.baseUrl, payload.protocol),
          models: inferred.modelConfigurations,
          skippedModels: inferred.skippedModels,
        });
        return true;
      }
      if (pathname === "/api/providers/models" && req.method === "POST") {
        const provider = mergeDraftProvider(payload, { validateModels: false });
        secrets.push(provider.apiKey, provider.walletKey);
        const models = await engine.fetchModels(provider, { ...(payload.options || {}), verifyCatalog: true });
        const inferred = inferDiscoveredModels(models, provider, registry.inferModelConfiguration || inferModelConfiguration);
        publicSend(res, 200, {
          models,
          platformProtocol: registry.platformProtocolId?.(provider.protocol) || provider.protocol,
          modelConfigurations: inferred.modelConfigurations,
          skippedModels: inferred.skippedModels,
        }, secrets);
        return true;
      }
      if (pathname === "/api/providers/agent-coverage" && req.method === "POST") {
        const refreshModels = payload.refreshModels === true;
        const provider = mergeDraftProvider(payload, { validateModels: !refreshModels });
        secrets.push(provider.apiKey, provider.walletKey);
        let models = provider.models || [];
        let skippedModels = [];
        if (refreshModels) {
          const discovered = await engine.fetchModels(provider, { ...(payload.options || {}), verifyCatalog: true });
          const inferred = inferDiscoveredModels(discovered, provider, registry.inferModelConfiguration || inferModelConfiguration);
          models = [
            ...inferred.modelConfigurations,
            ...inferred.skippedModels.map(model => ({ id: model.id, protocol: "", capabilities: [] })),
          ];
          skippedModels = inferred.skippedModels;
        }
        const coverage = analyzeProviderAgentCoverage({
          provider,
          models,
          registry,
          source: refreshModels ? "live" : "saved",
        });
        audit(auth, "provider.agent_coverage_checked", provider.id, refreshModels ? ["refreshModels"] : []);
        publicSend(res, 200, { coverage, skippedModels }, secrets);
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
        const started = Date.now();
        const result = await engine.execute(provider, model, intent, payload.input || { prompt: "ping" }, payload.params || {}, payload.options || {});
        validateProviderTestResult(result, intent);
        const test = presentTestResult(result, intent, Date.now() - started, secrets);
        if (intent.startsWith("image.") && ["invalid", "failed"].includes(test.status)) {
          throw httpError("provider_test_invalid_response", test.status === "failed"
            ? "图片任务生成失败，请检查提示词、模型权限或平台任务记录。"
            : "上游未返回可预览的图片或有效任务编号，请检查模型协议。", 502);
        }
        // Diagnostic redaction truncates strings. Keep the whitelisted test
        // presentation separate so replies and base64 images remain usable.
        sendJson(res, 200, { result: sanitizeForBrowser(result, secrets), test });
        return true;
      }
      if (pathname === "/api/protocols" && req.method === "GET") {
        publicSend(res, 200, protocolCenter ? protocolCenter.list() : { protocols: registry.listPublic() });
        return true;
      }
      if (protocolCenter && pathname === "/api/protocols/custom" && req.method === "POST") {
        const existing = registry.getCustom(payload.id);
        const protocol = protocolCenter.save(payload);
        catalogChanged();
        audit(auth, "protocol.saved", protocol.id, ["scope", "runtimeProtocol", "capabilities", "label", "summary"]);
        publicSend(res, existing ? 200 : 201, { protocol });
        return true;
      }
      if (protocolCenter && /^\/api\/protocols\/custom\/[^/]+$/.test(pathname) && req.method === "DELETE") {
        const id = decodeURIComponent(pathname.split("/").at(-1));
        protocolCenter.remove(id);
        catalogChanged();
        audit(auth, "protocol.deleted", id, ["id"]);
        publicSend(res, 200, { ok:true });
        return true;
      }
      if (protocolCenter && pathname === "/api/protocols/route-test" && req.method === "POST") {
        publicSend(res, 200, protocolCenter.routeTest(payload));
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
