"use strict";

function requestPathname(req) {
  try {
    return new URL(req?.url || "/", `http://${req?.headers?.host || "localhost"}`).pathname;
  } catch {
    return "/";
  }
}

function decodeRouteId(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return "";
  }
}

function createAssetLibraryHttpApi({
  assetLibrary,
  readJson,
  sendJson,
  readBodyBuffer,
  decodeHeaderFilename,
  inferMediaMimeType,
  isSupportedMediaMime,
  maxMediaUploadBytes,
  saveBinaryMedia,
} = {}) {
  if (!assetLibrary || typeof assetLibrary.listAssets !== "function") {
    throw new TypeError("Asset library HTTP API requires an asset library service.");
  }
  if (typeof readJson !== "function" || typeof sendJson !== "function" || typeof readBodyBuffer !== "function") {
    throw new TypeError("Asset library HTTP API requires HTTP helpers.");
  }
  if (typeof decodeHeaderFilename !== "function" || typeof inferMediaMimeType !== "function"
    || typeof isSupportedMediaMime !== "function" || typeof saveBinaryMedia !== "function") {
    throw new TypeError("Asset library HTTP API requires media helpers.");
  }
  const uploadLimit = Number(maxMediaUploadBytes);
  if (!Number.isSafeInteger(uploadLimit) || uploadLimit <= 0) {
    throw new TypeError("Asset library HTTP API requires a positive media upload limit.");
  }

  async function handle(req, res) {
    const requestPath = requestPathname(req);
    if (requestPath !== "/api/assets" && !requestPath.startsWith("/api/assets/")) return false;
    const userId = req?.auth?.user?.id;

    try {
      if (!userId) {
        throw Object.assign(new Error("Authentication required"), {
          code: "unauthorized",
          statusCode: 401,
        });
      }
      const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      if (requestPath === "/api/assets" && req.method === "GET") {
        const result = await assetLibrary.listAssets(userId, {
          scope: requestUrl.searchParams.get("scope") || "mine",
          projectId: requestUrl.searchParams.get("projectId") || "",
          kind: requestUrl.searchParams.get("kind") || "all",
          search: requestUrl.searchParams.get("search") || "",
          cursor: requestUrl.searchParams.get("cursor") || "",
          limit: requestUrl.searchParams.get("limit") || 40,
        });
        sendJson(res, 200, result, { "Cache-Control": "no-store" });
        return true;
      }
      if (requestPath === "/api/assets/import" && req.method === "POST") {
        const declaredType = String(req.headers["content-type"] || "application/octet-stream");
        const filename = decodeHeaderFilename(req.headers["x-file-name"]) || "asset-media";
        const mimeType = inferMediaMimeType(filename, declaredType);
        if (!isSupportedMediaMime(mimeType)) {
          sendJson(res, 400, { error: "Only image, video, and audio files are supported.", code: "invalid_asset_media" });
          return true;
        }
        const buffer = await readBodyBuffer(req);
        if (buffer.length > uploadLimit) {
          throw Object.assign(
            new Error(`Upload is too large. Current media limit is ${Math.round(uploadLimit / 1024 / 1024)}MB.`),
            { code: "asset_too_large", statusCode: 413 },
          );
        }
        const saved = saveBinaryMedia(buffer, filename, mimeType);
        const asset = await assetLibrary.registerMedia(userId, { ...saved, filename }, mimeType, {
          projectId: requestUrl.searchParams.get("projectId") || "",
          boardId: requestUrl.searchParams.get("boardId") || "",
          source: "upload",
        });
        sendJson(res, 201, { ...saved, mimeType, asset });
        return true;
      }

      const parts = requestPath.split("/").filter(Boolean);
      const assetId = parts[2] ? decodeRouteId(parts[2]) : "";
      const action = parts[3] || "";
      if (!assetId) {
        sendJson(res, 404, { error: "Asset route not found.", code: "not_found" });
        return true;
      }
      if (!action && req.method === "GET") {
        sendJson(res, 200, { asset: await assetLibrary.getAsset(userId, assetId) }, { "Cache-Control": "no-store" });
        return true;
      }
      if (action === "use" && req.method === "POST") {
        const link = await assetLibrary.recordUse(userId, assetId, await readJson(req));
        sendJson(res, 200, { link });
        return true;
      }
      if (action === "share" && req.method === "PATCH") {
        const asset = await assetLibrary.setShare(userId, assetId, await readJson(req));
        sendJson(res, 200, { asset });
        return true;
      }
      if (action === "like" && (req.method === "PUT" || req.method === "DELETE")) {
        const asset = await assetLibrary.setLike(userId, assetId, req.method === "PUT");
        sendJson(res, 200, { asset });
        return true;
      }
      if (action === "favorite" && (req.method === "PUT" || req.method === "DELETE")) {
        const asset = await assetLibrary.setFavorite(userId, assetId, req.method === "PUT");
        sendJson(res, 200, { asset });
        return true;
      }
      sendJson(res, 404, { error: "Asset route not found.", code: "not_found" });
      return true;
    } catch (error) {
      sendJson(res, Number(error?.statusCode || error?.status || 400), {
        error: String(error?.message || "Asset request failed."),
        code: String(error?.code || "asset_request_failed"),
      });
      return true;
    }
  }

  return Object.freeze({ handle });
}

module.exports = { createAssetLibraryHttpApi };
