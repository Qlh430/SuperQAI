"use strict";

const error = (code, message, statusCode) => Object.assign(new Error(message), { code, statusCode });
async function readSmallJson(req) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 32 * 1024) throw error("comfy_input_too_large", "ComfyUI 配置请求过大。", 413);
    chunks.push(Buffer.from(chunk));
  }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { throw error("invalid_json", "配置数据格式无效。", 400); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw error("invalid_json", "配置数据必须是对象。", 400);
  return value;
}

function validateWrite(req) {
  if (req.headers["sec-fetch-site"] === "cross-site") throw error("cross_origin_denied", "不允许跨站点控制 ComfyUI。", 403);
  if (req.headers.origin) {
    let origin;
    try { origin = new URL(req.headers.origin); } catch {}
    if (!origin || !["http:", "https:"].includes(origin.protocol) || origin.host !== req.headers.host) {
      throw error("cross_origin_denied", "请从当前 AI OS 页面操作 ComfyUI。", 403);
    }
  }
  if (!/^application\/json(?:;|$)/i.test(req.headers["content-type"] || "")) throw error("json_required", "ComfyUI 设置仅接受 JSON 请求。", 415);
}

function createComfyHttpApi({ service, requireAdmin, sendJson, appendAudit = () => {} }) {
  async function handle(req, res) {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (!pathname.startsWith("/api/comfyui/")) return false;
    try {
      const auth = await requireAdmin(req, res);
      if (!auth) return true;
      const action = pathname.slice("/api/comfyui/".length);
      const method = req.method;
      const expected = { settings: ["GET", "PUT"], status: ["GET"], detect: ["POST"], test: ["POST"], start: ["POST"], stop: ["POST"] };
      if (!expected[action]) throw error("not_found", "ComfyUI 接口不存在。", 404);
      if (!expected[action].includes(method)) throw error("method_not_allowed", "请求方法不支持。", 405);
      let input = {};
      if (method !== "GET") {
        validateWrite(req);
        input = await readSmallJson(req);
      }
      let result;
      if (action === "settings") result = method === "GET" ? service.configuration() : await service.save(input);
      else result = await service[action](input);
      if ((action === "settings" && method === "PUT") || ["start", "stop"].includes(action)) {
        appendAudit({ actorUserId: auth.user.id, action: `comfyui.${action === "settings" ? "settings_saved" : action}`,
          targetType: "comfyui", targetId: "default", details: { mode: result.config?.mode } });
      }
      sendJson(res, 200, result);
    } catch (failure) {
      sendJson(res, failure.statusCode || 400, {
        code: failure.code || "comfy_operation_failed",
        error: failure.code ? failure.message : "ComfyUI 操作未完成，请检查配置和服务主机权限。",
      });
    }
    return true;
  }
  return { handle };
}

module.exports = { createComfyHttpApi };
