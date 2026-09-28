"use strict";

const path = require("node:path");

function requestPathname(req) {
  try {
    return new URL(req?.url || "/", `http://${req?.headers?.host || "localhost"}`).pathname;
  } catch {
    return "/";
  }
}

function createImageGenerationHttpApi({
  executeImageGenerationPayload,
  registerSavedMedia,
  formatUpstreamError,
  readJson,
  sendJson,
} = {}) {
  if (typeof executeImageGenerationPayload !== "function") {
    throw new TypeError("Image generation HTTP API requires an image executor.");
  }
  if (typeof registerSavedMedia !== "function") {
    throw new TypeError("Image generation HTTP API requires media registration.");
  }
  if (typeof formatUpstreamError !== "function" || typeof readJson !== "function" || typeof sendJson !== "function") {
    throw new TypeError("Image generation HTTP API requires HTTP helpers.");
  }

  async function handle(req, res) {
    if (req?.method !== "POST" || requestPathname(req) !== "/api/images") return false;
    if (!req?.auth?.user?.id) {
      sendJson(res, 401, { error: "Authentication required", code: "unauthorized" });
      return true;
    }
    try {
      const payload = await readJson(req);
      const response = await executeImageGenerationPayload(payload);
      if (response.status >= 200 && response.status < 300) {
        const savedImages = Array.isArray(response.body?.saved_images) ? response.body.saved_images : [];
        for (const [index, saved] of savedImages.entries()) {
          const url = saved?.url || saved?.local_url;
          if (!url) continue;
          await registerSavedMedia(req, {
            url,
            filename: path.basename(String(url).split("?", 1)[0]) || `generated-${index + 1}.png`,
          }, "image/png");
        }
      }
      sendJson(res, response.status, response.body);
    } catch (error) {
      sendJson(res, 500, { error: formatUpstreamError(error) });
    }
    return true;
  }

  return Object.freeze({ handle });
}

module.exports = { createImageGenerationHttpApi };
