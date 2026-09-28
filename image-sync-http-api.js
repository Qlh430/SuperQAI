"use strict";

function requestPathname(req) {
  try {
    return new URL(req?.url || "/", `http://${req?.headers?.host || "localhost"}`).pathname;
  } catch {
    return "/";
  }
}

function createImageSyncHttpApi({
  imageSyncService,
  readJson,
  sendJson,
} = {}) {
  if (!imageSyncService || typeof imageSyncService.recover !== "function") {
    throw new TypeError("Image sync HTTP API requires an image sync service.");
  }
  if (typeof readJson !== "function" || typeof sendJson !== "function") {
    throw new TypeError("Image sync HTTP API requires HTTP helpers.");
  }

  async function handle(req, res) {
    if (req?.method !== "POST" || requestPathname(req) !== "/api/image-sync/localize") return false;
    if (!req?.auth?.user?.id) {
      sendJson(res, 401, { error: "Authentication required", code: "unauthorized" });
      return true;
    }
    try {
      const payload = await readJson(req);
      const source = String(payload.source || "").trim();
      if (!/^https?:\/\//i.test(source) || source.length > 32_768) {
        sendJson(res, 400, { error: "缺少有效的远程图片地址。" });
        return true;
      }
      const synchronized = await imageSyncService.recover([{ url: source }]);
      const item = synchronized.data?.[0] || {};
      sendJson(res, 200, {
        item: {
          local_url: item.local_url,
          width: Math.max(0, Number(item.width || 0)),
          height: Math.max(0, Number(item.height || 0)),
        },
      });
    } catch (error) {
      sendJson(res, 502, { error: String(error?.message || error || "原图同步失败。") });
    }
    return true;
  }

  return Object.freeze({ handle });
}

module.exports = { createImageSyncHttpApi };
