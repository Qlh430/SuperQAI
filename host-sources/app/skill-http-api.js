"use strict";

function createSkillHttpApi({
  skillRegistry,
  agentModelSettings,
  canvasAgentRuntime,
  capabilityResolver,
  requireSuperAdmin,
  readJson,
  sendJson,
  appendAudit = () => {},
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
  if (typeof requireSuperAdmin !== "function" || typeof readJson !== "function" || typeof sendJson !== "function") {
    throw new TypeError("Skill HTTP API requires HTTP authorization helpers.");
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
      sendJson(res, 500, { error: `Skill 目录读取失败：${error.message}`, code: "skill_catalog_failed" });
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
      const status = Number(error?.statusCode);
      sendJson(res, Number.isInteger(status) && status >= 400 && status < 500 ? status : 400, {
        error: String(error?.message || "Skill 更新失败。"),
        code: error?.code || "skill_update_failed",
      });
    }
  }

  async function handleAgentCatalog(req, res) {
    try {
      const skills = skillRegistry.loadAgentCatalog();
      const agentSettings = agentModelSettings.get();
      const candidates = agentSettings.models;
      const publicSkills = canvasAgentRuntime.getPublicSkillMetadata(skills);
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
        pickerSkills: publicSkills.filter((skill) => skill.origin === "custom"),
      });
    } catch (error) {
      sendJson(res, 500, { error: `Canvas Agent skills failed to load: ${error.message}` });
    }
  }

  async function handleReference(req, res) {
    try {
      const url = new URL(req.url, "http://localhost");
      const reference = skillRegistry.readReference(
        url.searchParams.get("skill_id"),
        url.searchParams.get("path"),
      );
      sendJson(res, 200, reference, { "Cache-Control": "no-store" });
    } catch (error) {
      sendJson(res, Number(error?.statusCode || 400), {
        error: error?.safeMessage || error?.message || "参考文档读取失败。",
        code: error?.code || "skill_reference_failed",
      });
    }
  }

  async function handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/api/skills") {
      await handleCatalog(req, res);
      return true;
    }
    if (url.pathname === "/api/skills/enabled") {
      await handleEnabled(req, res);
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
