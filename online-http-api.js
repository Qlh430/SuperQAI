"use strict";

const crypto = require("node:crypto");

function createOnlineHttpApi({
  ttlMs = 45_000,
  now = Date.now,
  readJson,
  sendJson,
} = {}) {
  if (typeof readJson !== "function" || typeof sendJson !== "function") {
    throw new TypeError("Online HTTP API requires JSON request helpers.");
  }

  const clients = new Map();

  function cleanup() {
    const current = now();
    for (const [clientId, lastSeen] of clients.entries()) {
      if (current - lastSeen > ttlMs) clients.delete(clientId);
    }
  }

  async function handle(req, res) {
    const requestPath = (() => {
      try {
        return new URL(req?.url || "/", `http://${req?.headers?.host || "localhost"}`).pathname;
      } catch {
        return "/";
      }
    })();
    if (requestPath !== "/api/online") return false;

    cleanup();
    if (req.method === "GET") {
      sendJson(res, 200, { online: clients.size });
      return true;
    }
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return true;
    }

    try {
      const payload = await readJson(req);
      const rawId = String(payload.clientId || "").trim();
      const fallbackId = `${req.socket?.remoteAddress || "unknown"}:${req.headers?.["user-agent"] || "browser"}`;
      const clientId = rawId || crypto.createHash("sha1").update(fallbackId).digest("hex");
      if (payload.online === false) clients.delete(clientId);
      else clients.set(clientId, now());
      cleanup();
      sendJson(res, 200, { online: clients.size });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return true;
  }

  return Object.freeze({ handle, cleanup, count: () => clients.size });
}

module.exports = { createOnlineHttpApi };
