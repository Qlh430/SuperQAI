"use strict";

const { inferModelConfiguration, normalizeProviderBaseUrl } = require("./provider-model-rules");
const { presentTestResult, safeImageSource } = require("./provider-test-result");
const { analyzeProviderAgentCoverage } = require("./provider-agent-coverage");

const TEST_INTENTS = Object.freeze({
  "/api/providers/test": "llm.chat",
  "/api/providers/test-image": "image.generate",
  "/api/providers/test-video": "video.generate",
  "/api/providers/test-audio": "audio.generate",
  "/api/providers/test-vision": "llm.chat.vision",
  "/api/providers/test-image-edit": "image.edit",
  "/api/providers/test-tools": "llm.tools",
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
  "/api/providers/generate-audio",
  "/api/providers/audio-models",
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

function diagnosticErrorMessage(error) {
  const messages = {
    UPSTREAM_AUTH: "上游拒绝了身份验证，请检查密钥是否正确、是否过期，以及模型访问权限。",
    UPSTREAM_RATE_LIMIT: "上游请求过于频繁，请稍后重试或检查服务限额。",
    UPSTREAM_QUOTA_EXHAUSTED: "上游账户余额或额度不足，请检查账户余额和模型额度。",
    UPSTREAM_TIMEOUT: "等待上游响应超时，请检查 API 地址、网络线路或服务状态。",
    UPSTREAM_TASK_FAILED: "上游生成任务失败，请检查提示词、模型权限和平台任务记录。",
    REQUEST_ABORTED: "已停止等待，请查看平台任务记录确认任务状态。",
    invalid_provider_model: "尚未选择测试模型，请填写有效的模型 ID。",
    provider_model_not_found: "当前草稿没有此模型，请重新选择后测试。",
  };
  if (messages[error?.code]) return messages[error.code];
  const reason = String(error?.safeMessage || error?.message || "");
  if (/[\u3400-\u9fff]/.test(reason)) return /请/.test(reason) ? reason : `${reason}请检查模型设置与服务状态。`;
  return "模型测试失败，请检查 API 地址、密钥、模型协议和参数后重试。";
}

function prepareDiagnosticInput(raw, intent) {
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : { prompt: "请回复测试成功" };
  if (["llm.chat.vision", "image.edit"].includes(intent)) {
    const images = Array.isArray(input.inputImages) ? input.inputImages : [];
    const messageImages = (Array.isArray(input.messages) ? input.messages : [])
      .flatMap(message => Array.isArray(message?.content) ? message.content : [])
      .map(part => part?.image_url?.url || part?.image_url || (part?.type === "input_image" ? part.image_url || part.url : ""))
      .filter(Boolean);
    const references = intent === "image.edit" ? images : [...images, ...messageImages];
    if (!references.length) throw httpError("provider_test_reference_required", "此能力需要真实图片素材，请添加测试参考图。");
    if (references.some(image => !safeImageSource(image) || !String(image).startsWith("data:image/"))) {
      throw httpError("provider_test_reference_invalid", "图片素材格式无效，请使用 PNG、JPEG、WebP、GIF 或 AVIF 图片重新上传。");
    }
    if (intent === "llm.chat.vision" && images.length) {
      const messages = Array.isArray(input.messages) && input.messages.length ? input.messages.map(message => ({ ...message })) : [{ role: "user", content: String(input.prompt || "请描述参考图") }];
      const index = messages.findLastIndex(message => message.role === "user");
      if (index < 0) messages.push({ role: "user", content: [] });
      const target = messages[index < 0 ? messages.length - 1 : index];
      target.content = [...(Array.isArray(target.content) ? target.content : [{ type: "text", text: String(target.content || input.prompt || "请描述参考图") }]), ...images.filter(image => !messageImages.includes(image)).map(image => ({ type: "image_url", image_url: { url: image } }))];
      input.messages = messages;
    }
  }
  if (intent === "llm.tools") {
    if (!Array.isArray(input.tools) || !input.tools.length) input.tools = [{ type: "function", function: { name: "ping", description: "执行一次测试工具调用", parameters: { type: "object", properties: {}, additionalProperties: false } } }];
    input.prompt ||= "请调用 ping 工具完成测试。";
    input.toolChoice ||= "required";
  }
  return input;
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

function secretProviderIdFromPath(pathname) {
  const match = pathname.match(/^\/api\/providers\/([^/]+)\/secret$/);
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
    || Boolean(secretProviderIdFromPath(pathname))
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
  persistGeneratedAudio = null,
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
    if (draft?.clearApiKey === true) merged.apiKey = "";
    else if (!Object.hasOwn(draft || {}, "apiKey") || isMaskedSecret(draft.apiKey)) merged.apiKey = stored?.apiKey || "";
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
    const secretProviderId = secretProviderIdFromPath(pathname);
    if (secretProviderId) res.setHeader("Cache-Control", "no-store");
    let auth;
    let payload = {};
    let secrets = [];
    let testStarted = 0;
    try {
      if (pathname === "/api/settings/providers/key") {
        auth = await authorize(req);
        publicSend(res, 410, { error: "Provider keys are no longer returned to browsers.", code: "provider_key_reveal_removed" });
        return true;
      }
      auth = ["/api/providers/generate-audio", "/api/providers/audio-models"].includes(pathname) ? await requireSignedIn(req) : await authorize(req);
      availabilityCheck();
      if (secretProviderId && req.method === "POST") {
        const provider = revealProvider(secretProviderId);
        sendJson(res, 200, { apiKey: String(provider.apiKey || "") });
        return true;
      }
      if (!["GET", "DELETE"].includes(String(req.method || "").toUpperCase())) {
        payload = await readJson(req);
        secrets = [payload?.apiKey, payload?.walletKey, payload?.provider?.apiKey, payload?.provider?.walletKey].filter(Boolean);
      }

      if (pathname === "/api/providers/audio-models" && req.method === "GET") {
        const models = [];
        for (const provider of store.listPublic()) {
          if (provider.enabled === false) continue;
          for (const configuration of provider.models || []) {
            const model = (registry.inferModelConfiguration || inferModelConfiguration)(configuration, provider);
            if (!model.capabilities?.includes("audio.generate")) continue;
            const parameterOverrides = sanitizeForBrowser(configuration.metadata?.parameterOverrides || {});
            models.push({
              id: `custom:${provider.id}:${Buffer.from(model.id).toString("base64url")}`,
              providerId: provider.id, providerName: provider.name, modelId: model.id,
              displayName: configuration.displayName || model.id,
              capabilities: [...model.capabilities], modelProtocol: model.protocol || configuration.modelProtocol,
              metadata: { parameterOverrides: { ...parameterOverrides } }, parameterOverrides,
            });
          }
        }
        publicSend(res, 200, { models, revision: Math.max(0, Number(readCatalogRevision()) || 0) });
        return true;
      }
      if (pathname === "/api/providers/generate-audio" && req.method === "POST") {
        if (["provider", "apiKey", "walletKey", "baseUrl", "protocol", "options"].some(key => Object.hasOwn(payload, key))) throw httpError("invalid_audio_input", "音频生成只能使用已保存的服务和模型配置。");
        if (!String(payload.providerId || "").trim()) throw httpError("invalid_audio_input", "请先选择已保存的音频服务。");
        const provider = revealProvider(payload.providerId);
        secrets.push(provider.apiKey, provider.walletKey);
        if (provider.enabled === false) throw httpError("provider_disabled", "此服务已停用，请选择其他音频模型。", 403);
        const model = (provider.models || []).find(item => item.id === String(payload.modelId || "").trim());
        if (!model) throw httpError("provider_model_not_found", "所选音频模型已移除，请重新选择。", 404);
        if (!model.capabilities?.includes("audio.generate")) throw httpError("audio_capability_missing", "所选模型不支持音频生成。");
        const prompt = String(payload.prompt || payload.input?.prompt || "").trim();
        if (!prompt) throw httpError("invalid_audio_input", "请先输入要生成的音频内容。");
        if (prompt.length > 4096) throw httpError("invalid_audio_input", "音频文本不能超过 4096 个字符。");
        if (payload.reference_audio || payload.input?.reference_audio || payload.input?.inputAudio) throw httpError("audio_reference_unsupported", "当前音频协议尚不支持参考音频。");
        const parameters = payload.parameters || payload.params || {};
        if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) throw httpError("invalid_audio_input", "音频参数必须是有效的配置对象。");
        const forbidden = new Set(["model", "intent", "input", "prompt", "apiKey", "api_key", "baseUrl", "authorization", "reference_audio", "url", "provider"]);
        if (Object.keys(parameters).some(key => forbidden.has(key))) throw httpError("invalid_audio_input", "音频参数不能覆盖模型或连接配置。");
        const result = await engine.execute(provider, model, "audio.generate", { prompt }, parameters);
        const presented = presentTestResult(result, "audio.generate", 0, secrets);
        if (presented.status !== "succeeded" || !presented.audios.length) throw httpError("audio_generation_failed", presented.status === "pending" ? "上游返回了未完成的音频任务，请在服务平台查询任务，避免重复提交。" : "音频生成没有返回可播放的文件，请检查模型协议、权限和参数。", 502);
        let url = presented.audios[0];
        const contentType = url.match(/^data:([^;]+);base64,/)?.[1] || "audio/mpeg";
        if (typeof persistGeneratedAudio === "function" && url.startsWith("data:")) {
          const persisted = await persistGeneratedAudio({ data: Buffer.from(url.split(",")[1], "base64"), contentType, auth });
          url = typeof persisted === "string" ? persisted : persisted?.url;
          if (!url) throw httpError("audio_save_failed", "音频已生成，但文件保存失败，请勿重复提交。", 500);
        }
        sendJson(res, 200, { audio: { url, contentType, modelId: model.id, providerId: provider.id } });
        return true;
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
        const catalogRevision = catalogChanged();
        audit(auth, "provider.enabled_changed", enabledProviderId, ["enabled"]);
        publicSend(res, 200, { provider, catalogRevision });
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
        const catalogRevision = catalogChanged();
        audit(auth, "provider.deleted", providerId, ["id"]);
        publicSend(res, 200, { ok: true, providerId, catalogRevision });
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
        const verified = await engine.verifyProtocol(provider, { ...(payload.options || {}), suggestAlternatives: true });
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
        testStarted = Date.now();
        const provider = mergeDraftProvider(payload);
        const model = modelFor(provider, payload.modelId);
        const intent = TEST_INTENTS[pathname];
        if (Array.isArray(model.capabilities) && !model.capabilities.includes(intent)) {
          throw httpError("provider_model_capability_missing", "所选模型未配置此测试能力，请先检查模型的能力标签。");
        }
        secrets.push(provider.apiKey, provider.walletKey);
        const input = prepareDiagnosticInput(payload.input, intent);
        let submittedTask = null;
        let result;
        try {
          result = await engine.execute(provider, model, intent, input, payload.params || {}, {
            ...(payload.options || {}),
            onTaskSubmitted: task => { submittedTask = task; },
          });
        } catch (error) {
          if (error?.code === "UPSTREAM_TASK_PENDING" && submittedTask?.taskId) {
            result = { task_id: submittedTask.taskId, status: "pending" };
          } else {
            if (submittedTask?.taskId) error.diagnosticTaskId = submittedTask.taskId;
            throw error;
          }
        }
        const test = presentTestResult(result, intent, Date.now() - testStarted, secrets);
        if (["invalid", "failed"].includes(test.status)) {
          throw httpError(test.code || "provider_test_invalid_response", test.message, 502, { test });
        }
        // Only the presentation contract may cross the diagnostic boundary.
        // Raw upstream data can contain credentials in encoded media URLs.
        sendJson(res, 200, { test });
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
      const diagnostic = Object.hasOwn(TEST_INTENTS, pathname) || pathname === "/api/providers/verify-protocol";
      const audioError = ["/api/providers/generate-audio", "/api/providers/audio-models"].includes(pathname);
      const message = diagnostic ? diagnosticErrorMessage(error)
        : audioError && error?.code === "provider_not_found" ? "所选音频服务已移除，请重新选择。"
          : audioError && !/[\u4e00-\u9fff]/.test(error?.safeMessage || error?.message || "") ? "音频服务请求失败，请检查登录、连接配置和使用权限。"
            : error?.safeMessage || error?.message || "Provider request failed.";
      const test = Object.hasOwn(TEST_INTENTS, pathname) ? error?.test || {
        ...presentTestResult(error?.diagnosticTaskId ? { task_id: error.diagnosticTaskId } : {}, TEST_INTENTS[pathname], testStarted ? Date.now() - testStarted : 0, secrets),
        status: "failed", message: redactText(message, secrets), code: String(error?.code || "provider_request_failed"),
      } : null;
      publicSend(res, status, {
        error: redactText(message, secrets),
        code: String(error?.code || "provider_request_failed"),
        ...(test ? { test } : {}),
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
