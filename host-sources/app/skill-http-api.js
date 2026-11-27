"use strict";

const crypto = require("node:crypto");

function createSkillHttpApi({
  skillRegistry,
  skillImportManager,
  agentModelSettings,
  canvasAgentRuntime,
  capabilityResolver,
  requireAuth,
  requireSuperAdmin,
  readJson,
  sendJson,
  appendAudit = () => {},
  authorizePresentationMedia,
  servePresentationMedia,
  onInstallDiagnostic = (record) => console.warn(`[skill-install] ${JSON.stringify(record)}`),
  onSkillApiDiagnostic = (record) => console.warn(`[skill-api] ${JSON.stringify(record)}`),
  maxImportRequestBytes = 36 * 1024 * 1024,
} = {}) {
  if (!skillRegistry || typeof skillRegistry.snapshot !== "function") {
    throw new TypeError("Skill HTTP API requires a compatible Skill Registry.");
  }
  if (!agentModelSettings || typeof agentModelSettings.get !== "function") {
    throw new TypeError("Skill HTTP API requires Agent model settings.");
  }
  if (!canvasAgentRuntime || typeof canvasAgentRuntime.getPublicSkillMetadata !== "function") {
    throw new TypeError("Skill HTTP API requires the Canvas Agent runtime.");
  }
  if (!skillImportManager || typeof skillImportManager.preview !== "function") {
    throw new TypeError("Skill HTTP API requires a compatible Skill Import Manager.");
  }
  if (typeof requireSuperAdmin !== "function" || typeof readJson !== "function" || typeof sendJson !== "function") {
    throw new TypeError("Skill HTTP API requires HTTP authorization helpers.");
  }

  async function authenticatedUser(req, res, { writeUnauthorized = true } = {}) {
    const auth = req?.auth || await requireAuth?.(req, res);
    const userId = String(auth?.user?.id || "").trim();
    if (!userId) {
      if (writeUnauthorized && !res.writableEnded && !res.status) {
        sendJson(res, 401, { error: "需要登录后管理个人 Skill。", code: "unauthorized" });
      }
      return "";
    }
    req.auth = auth;
    return userId;
  }

  async function authorizedSuperAdmin(req, res) {
    const admin = await requireSuperAdmin(req, res);
    if (!admin && !res.writableEnded && !res.status) {
      sendJson(res, 403, { error: "只有管理员可以管理实例公共 Skill。", code: "forbidden" });
    }
    return admin;
  }

  async function checkPresentationMedia(userId, value) {
    if (!authorizePresentationMedia || typeof value !== "string" || !value.startsWith("/output/")) {
      throw Object.assign(new Error("只能引用已授权的本机素材。"), { statusCode: 403 });
    }
    const canonical = await authorizePresentationMedia(userId, value);
    if (canonical !== value) throw Object.assign(new Error("素材地址格式不正确，请重新选择。"), {
      code: "invalid_skill_media_url",
      safeMessage: "素材地址格式不正确，请重新选择。",
      statusCode: 400,
    });
  }

  function sendSkillError(res, error, fallback = "Skill 操作失败。", endpoint = "") {
    const explicitStatus = Number(error?.statusCode);
    const status = Number.isInteger(explicitStatus) && explicitStatus >= 400 && explicitStatus < 600
      ? explicitStatus
      : 500;
    const rawCode = String(error?.code || "");
    if (status >= 500) {
      const diagnosticId = crypto.randomBytes(8).toString("hex");
      const code = /^[a-zA-Z0-9_.-]{1,64}$/.test(rawCode)
        ? rawCode
        : ["/api/skills/library", "/api/skills/mine", "/api/skills/public", "/api/canvas-agent/skills"].includes(endpoint)
          ? "skill_registry_read_failed"
          : "skill_operation_failed";
      const record = {
        event: "skill_api_failed",
        diagnosticId,
        endpoint,
        category: endpoint.startsWith("/api/skills") || endpoint === "/api/canvas-agent/skills" ? "registry" : "operation",
        statusCode: status,
        errorCode: code,
        errorName: String(error?.name || "Error").slice(0, 48),
      };
      try { onSkillApiDiagnostic(record); } catch {}
      sendJson(res, status, {
        error: `${fallback} 请稍后重试。（诊断编号：${diagnosticId}）`,
        code,
        diagnosticId,
      }, { "Cache-Control": "no-store" });
      return;
    }
    sendJson(res, status, {
      error: String(error?.safeMessage || error?.message || fallback),
      code: String(error?.code || "skill_operation_failed"),
    }, { "Cache-Control": "no-store" });
  }

  function installDiagnostic(phase, error) {
    const diagnosticId = crypto.randomBytes(8).toString("hex");
    const status = Number(error?.statusCode);
    const rawCode = String(error?.code || "");
    const isFilesystemError = /^E(?:ACCES|PERM|NOSPC|ROFS|BUSY|EXIST|NOENT|NOTDIR|ISDIR|IO|MFILE|NFILE)$/.test(rawCode);
    const category = phase === "authentication" || status === 401
      ? "session"
      : rawCode === "skill_preview_expired" || phase === "preview-credential"
        ? "preview_credential"
        : phase === "request-validation"
          ? "parameters"
          : isFilesystemError || phase === "file-processing"
            ? "file_processing"
            : status >= 400 && status < 500 || phase === "skill-validation"
              ? "validation"
              : "registration";
    const record = {
      event: "skill_install_confirm_failed",
      diagnosticId,
      phase,
      category,
      statusCode: Number.isInteger(status) && status >= 400 ? status : 500,
      errorCode: /^[a-zA-Z0-9_.-]{1,64}$/.test(rawCode) ? rawCode : "internal_error",
      errorName: String(error?.name || "Error").slice(0, 48),
    };
    try { onInstallDiagnostic(record); } catch {}
    return { diagnosticId, isFilesystemError, rawCode };
  }

  function sendInstallConfirmError(res, error, phase) {
    const diagnostic = installDiagnostic(phase, error);
    const explicitStatus = Number(error?.statusCode);
    const status = Number.isInteger(explicitStatus) && explicitStatus >= 400
      ? explicitStatus
      : phase === "request-validation" ? 400 : 500;
    let code = String(error?.code || "skill_install_failed");
    let message = "";

    if (status < 500) {
      if (phase === "request-validation" && !error?.statusCode) {
        code = "invalid_install_request";
        message = "安装确认请求格式无效，请重新预览后确认。";
      } else {
        message = String(error?.safeMessage || error?.message || "安装请求未通过校验。");
      }
    } else if (diagnostic.rawCode === "EACCES" || diagnostic.rawCode === "EPERM") {
      code = "skill_storage_permission_denied";
      message = "当前账户 Skill 目录不可写，安装未完成。请检查本机数据目录权限后重试。";
    } else if (diagnostic.rawCode === "ENOSPC") {
      code = "skill_storage_full";
      message = "存储空间不足，Skill 安装未完成。释放空间后可重新导入安装。";
    } else if (diagnostic.rawCode === "EROFS") {
      code = "skill_storage_read_only";
      message = "Skill 数据目录当前为只读状态，安装未完成。";
    } else if (diagnostic.rawCode === "EBUSY") {
      code = "skill_storage_busy";
      message = "Skill 数据目录正被其他操作占用，安装未完成。稍后可重试。";
    } else if (phase === "registration-visibility") {
      code = "skill_install_visibility_failed";
      message = "安装后的账户列表读取失败。请刷新“我的 Skill”确认状态，暂勿重复安装。";
    } else if (phase === "authentication") {
      code = "skill_session_check_failed";
      message = "无法验证当前登录会话，请重新登录后重试。";
    } else if (error?.safeMessage) {
      message = String(error.safeMessage);
    } else {
      code = "skill_install_failed";
      message = "Skill 安装未能完成。请稍后重试；如再次失败，请提供诊断编号。";
    }

    sendJson(res, status, {
      error: `${message}（诊断编号：${diagnostic.diagnosticId}）`,
      code,
      diagnosticId: diagnostic.diagnosticId,
    }, { "Cache-Control": "no-store" });
  }

  async function handleCatalog(req, res) {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Method not allowed", code: "method_not_allowed" });
      return;
    }
    const admin = await requireSuperAdmin(req, res);
    if (!admin) return;
    try {
      sendJson(res, 200, skillRegistry.snapshot(), { "Cache-Control": "no-store" });
    } catch (error) {
      sendSkillError(res, error, "Skill 目录读取失败。", "/api/skills");
    }
  }

  async function handleEnabled(req, res) {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed", code: "method_not_allowed" });
      return;
    }
    const admin = await requireSuperAdmin(req, res);
    if (!admin) return;
    try {
      const payload = await readJson(req);
      const snapshot = skillRegistry.setEnabled(payload?.id, payload?.enabled !== false);
      try {
        appendAudit({
          actorUserId: admin.user.id,
          action: "skill.enabled_updated",
          targetType: "skill",
          targetId: String(payload?.id || ""),
          details: { enabled: payload?.enabled !== false },
        });
      } catch {
        // Audit failures must not roll back a valid Skill toggle.
      }
      sendJson(res, 200, snapshot, { "Cache-Control": "no-store" });
    } catch (error) {
      sendSkillError(res, error, "Skill 状态更新失败。", "/api/skills/enabled");
    }
  }

  async function handleValidation(req, res) {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed", code: "method_not_allowed" });
      return;
    }
    try {
      const userId = await authenticatedUser(req, res);
      if (!userId) return;
      const payload = await readJson(req, 32 * 1024);
      const scope = payload?.scope === "personal" ? "personal" : "shared";
      if ((scope !== "personal" || payload?.status === "verified") && !await authorizedSuperAdmin(req, res)) return;
      const result = skillRegistry.setValidation(payload?.id, payload?.status, payload?.evidence, userId, scope, payload?.fingerprint);
      try {
        appendAudit({
          actorUserId: userId,
          action: "skill.validation_updated",
          targetType: "skill",
          targetId: String(payload?.id || ""),
          details: { scope, status: String(payload?.status || ""), testedAt: result?.last_tested_at || "" },
        });
      } catch {}
      sendJson(res, 200, result, { "Cache-Control": "no-store" });
    } catch (error) {
      sendSkillError(res, error, "Skill 验收状态更新失败。", "/api/skills/validation");
    }
  }

  async function handleAgentCatalog(req, res) {
    try {
      const userId = await authenticatedUser(req, res);
      if (!userId) return;
      const skills = skillRegistry.loadAgentCatalog(userId);
      const agentSettings = agentModelSettings.get();
      const candidates = agentSettings.models;
      const publicSkills = canvasAgentRuntime.getPublicSkillMetadata(skills);
      const library = skillRegistry.listLibrary(userId);
      const pickerSkills = publicSkills.filter((skill) => skill.origin === "custom").map(skill => {
        const entry = library.find(item => item.id === skill.id && item.scope === "personal")
          || library.find(item => item.id === skill.id && item.scope === "public");
        return entry ? { ...skill, scope: entry.scope, categories: entry.categories,
          presentation: entry.presentation, coverId: entry.coverId, coverMedia: entry.coverMedia } : skill;
      });
      sendJson(res, 200, {
        configured: candidates.length > 0,
        autoFallback: capabilityResolver?.getAutoFallback?.() || false,
        agentSettings: {
          configured: agentSettings.configured,
          primary: agentSettings.settings.primary,
          candidateCount: agentSettings.settings.candidates.length,
          availableCount: candidates.length,
          unavailableCount: agentSettings.unavailable.length,
        },
        models: candidates.map(model => ({ ...model, vision: true })),
        skills: publicSkills,
        pickerSkills,
      });
    } catch (error) {
      sendSkillError(res, error, "Agent Skill 列表暂时无法读取。", "/api/canvas-agent/skills");
    }
  }

  async function handleReference(req, res) {
    try {
      const userId = await authenticatedUser(req, res);
      if (!userId) return;
      const url = new URL(req.url, "http://localhost");
      const reference = skillRegistry.readReference(
        url.searchParams.get("skill_id"),
        url.searchParams.get("path"),
        userId,
      );
      sendJson(res, 200, reference, { "Cache-Control": "no-store" });
    } catch (error) {
      sendSkillError(res, error, "Skill 参考文档读取失败。", "/api/skills/reference");
    }
  }

  async function handlePersonal(req, res, url) {
    const confirmRoute = url.pathname === "/api/skills/install/confirm" && req.method === "POST";
    let userId;
    try {
      userId = await authenticatedUser(req, res, { writeUnauthorized: !confirmRoute });
    } catch (error) {
      if (!confirmRoute) throw error;
      sendInstallConfirmError(res, error, "authentication");
      return true;
    }
    if (!userId) {
      if (confirmRoute) {
        sendInstallConfirmError(res, Object.assign(new Error("需要登录后管理个人 Skill。"), {
          code: "unauthorized",
          safeMessage: "需要登录后管理个人 Skill。",
          statusCode: 401,
        }), "authentication");
      }
      return true;
    }
    let confirmPhase = "";
    try {
      if (url.pathname === "/api/skills/mine" && req.method === "GET") {
        sendJson(res, 200, { skills: skillImportManager.list(userId) }, { "Cache-Control": "no-store" });
        return true;
      }
      if (url.pathname === "/api/skills/public" && req.method === "GET") {
        sendJson(res, 200, { skills: skillImportManager.listPublic(userId) }, { "Cache-Control": "no-store" });
        return true;
      }
      if (url.pathname === "/api/skills/install/preview" && req.method === "POST") {
        const payload = await readJson(req, maxImportRequestBytes);
        if (payload?.scope === "public" && !await authorizedSuperAdmin(req, res)) return true;
        const preview = await skillImportManager.preview(userId, payload || {});
        sendJson(res, 200, preview, { "Cache-Control": "no-store" });
        return true;
      }
      if (url.pathname === "/api/skills/install/confirm" && req.method === "POST") {
        confirmPhase = "request-validation";
        const payload = await readJson(req, 16 * 1024);
        if (typeof payload?.previewToken !== "string" || !/^[A-Za-z0-9_-]{32,128}$/.test(payload.previewToken)) {
          throw Object.assign(new Error("安装确认凭证格式无效，请重新预览该 Skill。"), {
            code: "invalid_preview_credential",
            safeMessage: "安装确认凭证格式无效，请重新预览该 Skill。",
            statusCode: 400,
          });
        }
        confirmPhase = "preview-credential";
        const scope = skillImportManager.previewScope(userId, payload.previewToken);
        if (scope === "public") {
          confirmPhase = "authorization";
          if (!await authorizedSuperAdmin(req, res)) return true;
        }
        confirmPhase = "skill-validation";
        const skill = skillImportManager.confirm(userId, payload?.previewToken);
        confirmPhase = "registration-visibility";
        try {
          appendAudit({
            actorUserId: userId,
            action: skill?.install?.scope === "public" ? "skill.public_installed" : "skill.personal_installed",
            targetType: "skill",
            targetId: String(skill?.id || ""),
            details: {
              scope: String(skill?.install?.scope || "personal"),
              sourceType: String(skill?.install?.sourceType || ""),
              source: String(skill?.install?.source || ""),
            },
          });
        } catch {}
        sendJson(res, 201, {
          skill,
          skills: skillImportManager.list(userId),
          publicSkills: skillImportManager.listPublic(userId),
        }, { "Cache-Control": "no-store" });
        return true;
      }
      if (url.pathname === "/api/skills/install/cancel" && req.method === "POST") {
        const payload = await readJson(req, 16 * 1024);
        sendJson(res, 200, { cancelled: skillImportManager.cancelPreview(userId, payload?.previewToken) });
        return true;
      }
      if (url.pathname === "/api/skills/mine/enabled" && req.method === "POST") {
        const payload = await readJson(req, 16 * 1024);
        const skill = skillImportManager.setEnabled(userId, payload?.id, payload?.enabled !== false);
        sendJson(res, 200, { skill, skills: skillImportManager.list(userId) }, { "Cache-Control": "no-store" });
        return true;
      }
      const publishMatch = url.pathname.match(/^\/api\/skills\/mine\/([a-z0-9][a-z0-9-]{0,63})\/publish$/);
      if (publishMatch && req.method === "POST") {
        const skill = await skillImportManager.publishPersonal(userId, publishMatch[1], checkPresentationMedia);
        try {
          appendAudit({
            actorUserId: userId,
            action: "skill.personal_published",
            targetType: "skill",
            targetId: publishMatch[1],
            details: { scope: "public" },
          });
        } catch {}
        sendJson(res, 201, {
          skill,
          skills: skillImportManager.list(userId),
          publicSkills: skillImportManager.listPublic(userId),
        }, { "Cache-Control": "no-store" });
        return true;
      }
      const uninstallMatch = url.pathname.match(/^\/api\/skills\/mine\/([a-z0-9][a-z0-9-]{0,63})$/);
      if (uninstallMatch && req.method === "DELETE") {
        const removed = skillImportManager.uninstall(userId, uninstallMatch[1]);
        try {
          appendAudit({
            actorUserId: userId,
            action: "skill.personal_uninstalled",
            targetType: "skill",
            targetId: uninstallMatch[1],
            details: {},
          });
        } catch {}
        sendJson(res, 200, { removed, skills: skillImportManager.list(userId) }, { "Cache-Control": "no-store" });
        return true;
      }
      const publicUninstallMatch = url.pathname.match(/^\/api\/skills\/public\/([a-z0-9][a-z0-9-]{0,63})$/);
      if (publicUninstallMatch && req.method === "DELETE") {
        const admin = await authorizedSuperAdmin(req, res);
        if (!admin) return true;
        const removed = skillImportManager.uninstallPublic(userId, publicUninstallMatch[1]);
        try {
          appendAudit({
            actorUserId: userId,
            action: "skill.public_uninstalled",
            targetType: "skill",
            targetId: publicUninstallMatch[1],
            details: {},
          });
        } catch {}
        sendJson(res, 200, { removed, skills: skillRegistry.snapshot() }, { "Cache-Control": "no-store" });
        return true;
      }
      if (url.pathname.startsWith("/api/skills/mine")
        || url.pathname.startsWith("/api/skills/public")
        || url.pathname.startsWith("/api/skills/install/")) {
        sendJson(res, 405, { error: "Skill 管理请求方法不受支持。", code: "method_not_allowed" });
        return true;
      }
      return false;
    } catch (error) {
      if (confirmRoute) sendInstallConfirmError(res, error, error?.skillInstallPhase || confirmPhase || "request-validation");
      else sendSkillError(res, error, "Skill 管理请求失败。", url.pathname);
      return true;
    }
  }

  async function handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (["/api/skills/library", "/api/skills/detail", "/api/skills/media", "/api/skills/featured", "/api/skills/presentation"].includes(url.pathname)) {
      const userId = await authenticatedUser(req, res);
      if (!userId) return true;
      try {
        const id = url.searchParams.get("skill_id");
        const scope = url.searchParams.get("scope") === "public" ? "public" : undefined;
        if (url.pathname === "/api/skills/presentation" && req.method === "POST") {
          const detail = skillRegistry.getDetail(id, userId, scope);
          const isAdmin = req.auth?.user?.role === "superadmin";
          if (detail.scope !== "personal" && !isAdmin) {
            sendJson(res, 403, { error: "只有管理员可以修改公共 Skill 展示资料。", code: "forbidden" });
            return true;
          }
          const payload = await readJson(req, 64 * 1024);
          if (!Array.isArray(payload?.media) || payload.media.length > 16) throw Object.assign(new Error("最多配置 16 个案例。"), {
            code: "invalid_skill_presentation",
            safeMessage: "最多配置 16 个案例。",
            statusCode: 400,
          });
          const authorizedUrls = new Set();
          for (const item of Array.isArray(payload?.media) ? payload.media : []) {
            for (const value of [item?.url, item?.posterUrl].filter(Boolean)) {
              await checkPresentationMedia(userId, value);
              authorizedUrls.add(value);
            }
          }
          const saved = skillRegistry.setPresentation(id, userId, payload, { isAdmin, authorizedUrls, scope });
          sendJson(res, 200, { ...saved, canManagePresentation: true }, { "Cache-Control": "no-store" });
        } else if (url.pathname === "/api/skills/featured" && req.method === "POST") {
          if (!await authorizedSuperAdmin(req, res)) return true;
          const payload = await readJson(req, 16 * 1024);
          sendJson(res, 200, skillRegistry.setFeatured(payload?.id, payload?.featured === true));
        } else if (req.method !== "GET" || ["/api/skills/featured", "/api/skills/presentation"].includes(url.pathname)) {
          sendJson(res, 405, { error: "请求方法不受支持。", code: "method_not_allowed" });
        } else if (url.pathname === "/api/skills/library") {
          sendJson(res, 200, { skills: skillRegistry.listLibrary(userId), categories: skillRegistry.categoryOptions }, { "Cache-Control": "no-store" });
        } else if (url.pathname === "/api/skills/detail") {
          const detail = skillRegistry.getDetail(id, userId, scope);
          sendJson(res, 200, { ...detail, canManagePresentation: detail.scope === "personal" || req.auth?.user?.role === "superadmin" }, { "Cache-Control": "no-store" });
        } else {
          const item = url.searchParams.has("media_id") ? skillRegistry.presentationMedia(id, url.searchParams.get("media_id"), userId, scope) : null;
          if (servePresentationMedia) {
            const poster = url.searchParams.get("poster") === "1";
            if (poster && !item?.posterUrl) throw Object.assign(new Error("此案例尚未配置视频封面。"), {
              code: "skill_poster_not_found",
              safeMessage: "此案例尚未配置视频封面。",
              statusCode: 404,
            });
            const media = item?.url || poster
              ? { url: poster ? item.posterUrl : item.url, contentType: poster ? "" : item.type }
              : skillRegistry.readMedia(id, item?.path || url.searchParams.get("path"), userId, { metadataOnly: true, scope });
            await servePresentationMedia(req, res, media, url.searchParams.get("thumbnail") === "1");
            return true;
          }
          const media = skillRegistry.readMedia(id, item?.path || url.searchParams.get("path"), userId, { scope });
          res.writeHead(200, { "Content-Type": media.contentType, "Content-Length": media.content.length,
            "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox" });
          res.end(media.content);
        }
      } catch (error) { sendSkillError(res, error, "Skill 展示资料读取失败。", url.pathname); }
      return true;
    }
    if (url.pathname.startsWith("/api/skills/mine")
      || url.pathname === "/api/skills/public"
      || url.pathname.startsWith("/api/skills/public/")
      || url.pathname.startsWith("/api/skills/install/")) {
      return handlePersonal(req, res, url);
    }
    if (url.pathname === "/api/skills") {
      await handleCatalog(req, res);
      return true;
    }
    if (url.pathname === "/api/skills/enabled") {
      await handleEnabled(req, res);
      return true;
    }
    if (url.pathname === "/api/skills/validation") {
      await handleValidation(req, res);
      return true;
    }
    if (url.pathname === "/api/canvas-agent/skills") {
      await handleAgentCatalog(req, res);
      return true;
    }
    if (url.pathname === "/api/skills/reference") {
      await handleReference(req, res);
      return true;
    }
    return false;
  }

  return { handle };
}

module.exports = { createSkillHttpApi };
