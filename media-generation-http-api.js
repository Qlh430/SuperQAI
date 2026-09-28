"use strict";

function requestPathname(req) {
  try {
    return new URL(req?.url || "/", `http://${req?.headers?.host || "localhost"}`).pathname;
  } catch {
    return "/";
  }
}

function createMediaGenerationHttpApi({
  handleApiVideo,
  handleApiVideoResume,
  handleMinimaxH3Video,
  handleUpscale,
  handleUpscaleStatus,
} = {}) {
  for (const [name, handler] of Object.entries({
    handleApiVideo,
    handleApiVideoResume,
    handleMinimaxH3Video,
    handleUpscale,
    handleUpscaleStatus,
  })) {
    if (typeof handler !== "function") throw new TypeError(`Media generation HTTP API requires ${name}.`);
  }

  const upscaleRoutes = new Map([
    ["/api/upscale", "ttp"],
    ["/api/upscale2", "seedvr2"],
    ["/api/shoe-swap", "shoe-swap"],
    ["/api/outpaint", "outpaint"],
    ["/api/runninghub-outpaint", "runninghub-outpaint"],
    ["/api/flux2-klein-edit", "flux2-klein-edit"],
    ["/api/qwen-edit-angle", "qwen-edit-angle"],
    ["/api/comfy-remove-background", "remove-background"],
  ]);

  async function handle(req, res) {
    const pathname = requestPathname(req);

    if (req.method === "POST" && pathname === "/api/minimax-h3-video") {
      await handleMinimaxH3Video(req, res);
      return true;
    }

    if (req.method === "POST" && pathname === "/api/videos") {
      await handleApiVideo(req, res);
      return true;
    }

    const resumeMatch = req.method === "POST"
      ? pathname.match(/^\/api\/videos\/([a-zA-Z0-9_-]{1,80})\/resume$/)
      : null;
    if (resumeMatch) {
      await handleApiVideoResume(req, res, resumeMatch[1]);
      return true;
    }

    if (req.method === "POST" && upscaleRoutes.has(pathname)) {
      await handleUpscale(req, res, upscaleRoutes.get(pathname));
      return true;
    }

    if (req.method === "GET" && pathname === "/api/upscale/status") {
      handleUpscaleStatus(req, res);
      return true;
    }

    return false;
  }

  return Object.freeze({ handle });
}

module.exports = { createMediaGenerationHttpApi };
