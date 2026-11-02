"use strict";

const path = require("node:path");

function requestPathname(req) {
  try {
    return new URL(req?.url || "/", `http://${req?.headers?.host || "localhost"}`).pathname;
  } catch {
    return "/";
  }
}

function createThumbnailHttpApi({
  thumbnailStore,
  serverThumbnails,
  assertOutputMediaRead,
  readBodyBuffer,
  registerSavedMedia,
  sendJson,
  sendError,
} = {}) {
  if (!thumbnailStore || typeof thumbnailStore.lookup !== "function" || typeof thumbnailStore.save !== "function") {
    throw new TypeError("Thumbnail HTTP API requires a thumbnail store.");
  }
  if (!serverThumbnails || typeof serverThumbnails.ensure !== "function") {
    throw new TypeError("Thumbnail HTTP API requires the server thumbnail service.");
  }
  if (typeof assertOutputMediaRead !== "function" || typeof readBodyBuffer !== "function") {
    throw new TypeError("Thumbnail HTTP API requires media access helpers.");
  }
  if (typeof registerSavedMedia !== "function") throw new TypeError("Thumbnail HTTP API requires media registration.");
  if (typeof sendJson !== "function" || typeof sendError !== "function") {
    throw new TypeError("Thumbnail HTTP API requires HTTP helpers.");
  }

  async function handle(req, res) {
    if (!requestPathname(req).startsWith("/api/image-thumbnails")) return false;
    const userId = req?.auth?.user?.id;
    try {
      if (!userId) {
        throw Object.assign(new Error("Authentication required"), {
          code: "unauthorized",
          statusCode: 401,
        });
      }
      const requestUrl = new URL(req.url, "http://localhost");
      if (req.method === "GET") {
        const source = requestUrl.searchParams.get("source") || "";
        if (!source) {
          sendJson(res, 400, { error: "Missing thumbnail source." });
          return true;
        }
        if (source.startsWith("/output/")) await assertOutputMediaRead(userId, source);
        let item = thumbnailStore.lookup(source);
        if (source.startsWith("/output/")) {
          // Generate locally before asking any LAN browser to transfer a full 4K original.
          // ensure also refreshes previews created with an older size profile.
          item = await serverThumbnails.ensure(source).catch(() => null);
        }
        if (item?.thumbnailUrl?.startsWith("/output/") && !source.startsWith("/output/")) {
          await assertOutputMediaRead(userId, item.thumbnailUrl);
        }
        sendJson(res, 200, { item }, { "Cache-Control": "no-store" });
        return true;
      }

      if (req.method === "POST") {
        try {
          const source = decodeHeaderFilename(req.headers["x-source-url"]);
          if (source.startsWith("/output/")) await assertOutputMediaRead(userId, source);
          else {
            const existing = thumbnailStore.lookup(source);
            if (existing?.thumbnailUrl?.startsWith("/output/")) await assertOutputMediaRead(userId, existing.thumbnailUrl);
          }
          const lightweight = String(req.headers["x-thumbnail-lightweight"] || "").toLowerCase() === "true";
          const mimeType = String(req.headers["content-type"] || "image/webp").split(";")[0].trim().toLowerCase();
          const buffer = lightweight ? Buffer.alloc(0) : await readBodyBuffer(req, 2 * 1024 * 1024);
          const item = thumbnailStore.save({
            source,
            buffer,
            mimeType,
            width: Number(req.headers["x-image-width"] || 0),
            height: Number(req.headers["x-image-height"] || 0),
            lightweight,
          });
          if (!source.startsWith("/output/") && item.thumbnailUrl.startsWith("/output/") && !item.lightweight) {
            await registerSavedMedia(
              { auth: req.auth },
              { url: item.thumbnailUrl, filename: path.basename(item.thumbnailUrl) },
              mimeType,
            );
          }
          sendJson(res, 200, { item });
        } catch (error) {
          sendJson(res, Number(error?.statusCode || 400), { error: error.message, code: error?.code });
        }
        return true;
      }

      sendJson(res, 405, { error: "Method not allowed" });
      return true;
    } catch (error) {
      sendError(res, error);
      return true;
    }
  }

  return Object.freeze({ handle });
}

function decodeHeaderFilename(value) {
  if (!value) return "";
  try {
    return decodeURIComponent(String(value));
  } catch {
    return String(value);
  }
}

module.exports = { createThumbnailHttpApi };
