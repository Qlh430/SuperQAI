"use strict";

function httpError(code, message, statusCode = 400) {
  return Object.assign(new Error(message), { code, statusCode });
}

function sendBinaryResponse(res, buffer, contentType) {
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": buffer.length,
    "Cache-Control": "no-store",
  });
  res.end(buffer);
}

async function readBackgroundRemovalInput(payload, imageReferenceToFile) {
  if (!payload.image) throw httpError("missing_image", "缺少要抠图的图片。", 400);
  const file = await imageReferenceToFile(payload.image, payload.name || "background-removal.png");
  return Buffer.from(await file.blob.arrayBuffer());
}

function createBackgroundRemovalHttpApi({
  service,
  readJson,
  sendJson,
  imageReferenceToFile,
  saveBinaryImage,
  registerSavedMedia,
  formatErrorMessage = (error) => String(error?.message || error || ""),
} = {}) {
  if (!service || typeof service.status !== "function" || typeof service.prepare !== "function") {
    throw new TypeError("Background removal HTTP API requires a compatible background removal service.");
  }
  if (typeof readJson !== "function" || typeof sendJson !== "function") {
    throw new TypeError("Background removal HTTP API requires HTTP helpers.");
  }
  if (typeof imageReferenceToFile !== "function" || typeof saveBinaryImage !== "function" || typeof registerSavedMedia !== "function") {
    throw new TypeError("Background removal HTTP API requires media helpers.");
  }

  let updateProgress = null;

  async function handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;
    if (!pathname.startsWith("/api/background-removal")) return false;
    try {
      if (pathname === "/api/background-removal/models" && req.method === "GET") {
        sendJson(res, 200, service.status());
        return true;
      }
      if (pathname === "/api/background-removal/models/import" && req.method === "POST") {
        const payload = await readJson(req);
        const model = await service.importModelFile(payload.path, payload.id || undefined);
        sendJson(res, 200, { ok: true, model });
        return true;
      }
      if (pathname === "/api/background-removal/models/check" && req.method === "POST") {
        const payload = await readJson(req);
        sendJson(res, 200, await service.checkForUpdate(payload.id || undefined));
        return true;
      }
      if (pathname === "/api/background-removal/models/update" && req.method === "POST") {
        const payload = await readJson(req);
        // Large model downloads expose bounded in-memory progress for polling.
        updateProgress = { phase: "connecting", received: 0, total: 0, message: "正在连接发布源…", updatedAt: Date.now() };
        try {
          const result = await service.downloadUpdate(payload.id || undefined, {
            onProgress: (event) => {
              updateProgress = { ...updateProgress, ...event, updatedAt: Date.now() };
            },
          });
          updateProgress = {
            ...updateProgress,
            phase: "done",
            received: updateProgress.total,
            message: "模型更新完成。",
            updatedAt: Date.now(),
          };
          sendJson(res, 200, { ok: true, ...result });
        } catch (error) {
          updateProgress = {
            ...updateProgress,
            phase: "failed",
            message: formatErrorMessage(error),
            updatedAt: Date.now(),
          };
          throw error;
        }
        return true;
      }
      if (pathname === "/api/background-removal/models/update/progress" && req.method === "GET") {
        sendJson(res, 200, { progress: updateProgress });
        return true;
      }
      if (pathname === "/api/background-removal/models/reset" && req.method === "POST") {
        const payload = await readJson(req);
        sendJson(res, 200, { ok: true, ...service.removeStoredModel(payload.id || undefined) });
        return true;
      }
      if (pathname === "/api/background-removal/prepare" && req.method === "POST") {
        const payload = await readJson(req);
        const imageBuffer = await readBackgroundRemovalInput(payload, imageReferenceToFile);
        const started = Date.now();
        const prepared = await service.prepare(imageBuffer, payload.model);
        sendJson(res, 200, {
          ...prepared,
          elapsed_ms: Date.now() - started,
          mask_url: `/api/background-removal/mask?id=${encodeURIComponent(prepared.token)}`,
          preview_url: `/api/background-removal/preview?id=${encodeURIComponent(prepared.token)}`,
        });
        return true;
      }
      if (pathname === "/api/background-removal/apply" && req.method === "POST") {
        const payload = await readJson(req);
        const result = await service.applySettings(payload.token, {
          mode: payload.mode,
          settings: payload.settings,
        });
        const name = String(payload.name || "抠图").replace(/\.(png|jpe?g|webp|bmp)$/i, "") + "-抠图.png";
        const saved = saveBinaryImage(result.buffer, name, "image/png");
        const asset = await registerSavedMedia(req, saved, "image/png");
        sendJson(res, 200, {
          ok: true,
          ...saved,
          asset,
          width: result.width,
          height: result.height,
          mode: result.mode,
          model: result.model,
          coverage: result.coverage,
        });
        return true;
      }
      if (pathname === "/api/background-removal/mask" && req.method === "GET") {
        sendBinaryResponse(res, await service.maskPng(url.searchParams.get("id")), "image/png");
        return true;
      }
      if (pathname === "/api/background-removal/preview" && req.method === "GET") {
        sendBinaryResponse(res, await service.previewPng(url.searchParams.get("id")), "image/png");
        return true;
      }
      sendJson(res, 404, { code: "background_removal_not_found", error: "抠图接口不存在。" });
      return true;
    } catch (error) {
      sendJson(res, Number(error?.statusCode || 500), {
        code: error?.code || "background_removal_failed",
        error: formatErrorMessage(error) || "抠图失败，请稍后重试。",
      });
      return true;
    }
  }

  return { handle };
}

module.exports = { createBackgroundRemovalHttpApi };
