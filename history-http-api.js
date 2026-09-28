"use strict";

const fs = require("node:fs");

function requestPathname(req) {
  try {
    return new URL(req?.url || "/", `http://${req?.headers?.host || "localhost"}`).pathname;
  } catch {
    return "/";
  }
}

function getHistoryRecordCategory(record) {
  if (record?.category) return record.category;
  const model = String(record?.model || "");
  const prompt = String(record?.prompt || "");
  if (/换鞋/i.test(model) || prompt.startsWith("换鞋：")) return "shoe";
  if (/扩图|Outpaint|Z-Image/i.test(model) || prompt.startsWith("扩图：")) return "outpaint";
  if (/TTP|SeedVR2|ComfyUI/i.test(model) || prompt.startsWith("高清放大")) return "upscale";
  if (prompt.startsWith("画布") || /画布/.test(prompt)) return "canvas";
  return "image";
}

function createHistoryHttpApi({
  imageHistoryFile,
  chatHistoryFile,
  resolveHistoryFile,
  ensureReferencedResource,
  getResourceByRef,
  deleteResource,
  readJson,
  sendJson,
} = {}) {
  if (!imageHistoryFile || !chatHistoryFile) throw new TypeError("History HTTP API requires history file paths.");
  if (typeof resolveHistoryFile !== "function" || typeof ensureReferencedResource !== "function") {
    throw new TypeError("History HTTP API requires user resource helpers.");
  }
  if (typeof getResourceByRef !== "function" || typeof deleteResource !== "function") {
    throw new TypeError("History HTTP API requires resource storage helpers.");
  }
  if (typeof readJson !== "function" || typeof sendJson !== "function") {
    throw new TypeError("History HTTP API requires HTTP helpers.");
  }

  function readHistoryFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) return [];
      const records = JSON.parse(fs.readFileSync(filePath, "utf8") || "[]");
      return Array.isArray(records) ? records : [];
    } catch {
      return [];
    }
  }

  function writeHistoryFile(filePath, records) {
    fs.writeFileSync(filePath, JSON.stringify(records, null, 2));
  }

  async function registerHistoryRecord(record, options) {
    const refId = String(record?.id || "").trim();
    if (!refId || !options?.userId || !options?.refType) return null;
    const title = String(record?.title || record?.prompt || `${options.resourceType || "history"} ${refId}`)
      .trim()
      .slice(0, 240);
    return ensureReferencedResource(options.userId, {
      type: options.resourceType || "file",
      title: title || refId,
      refType: options.refType,
      refId,
      metadata: { record },
    }, { currentUserOwnsNew: true });
  }

  async function handleHistory(req, res, filePath, limit, options = {}) {
    if (req.method === "GET") {
      const records = readHistoryFile(filePath);
      for (const record of records) await registerHistoryRecord(record, options);
      sendJson(res, 200, { records });
      return;
    }

    if (req.method === "POST") {
      try {
        const payload = await readJson(req);
        const record = payload.record;
        if (!record || typeof record !== "object") {
          sendJson(res, 400, { error: "Missing history record." });
          return;
        }
        const records = readHistoryFile(filePath);
        const existingIndex = record.id ? records.findIndex((item) => item.id === record.id) : -1;
        if (existingIndex >= 0) records.splice(existingIndex, 1);
        records.unshift(record);
        writeHistoryFile(filePath, records.slice(0, limit));
        await registerHistoryRecord(record, options);
        sendJson(res, 200, { records: readHistoryFile(filePath) });
      } catch (error) {
        sendJson(res, 500, { error: error.message });
      }
      return;
    }

    if (req.method === "DELETE") {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const category = url.searchParams.get("category");
      const id = url.searchParams.get("id");
      const previousRecords = readHistoryFile(filePath);
      let records;
      if (id) {
        records = previousRecords.filter((record) => String(record.id || "") !== id);
        writeHistoryFile(filePath, records);
      } else if (category) {
        records = previousRecords.filter((record) => getHistoryRecordCategory(record) !== category);
        writeHistoryFile(filePath, records);
      } else {
        records = [];
        writeHistoryFile(filePath, []);
      }
      const remainingIds = new Set(records.map((record) => String(record?.id || "")));
      for (const record of previousRecords) {
        const refId = String(record?.id || "");
        if (!refId || remainingIds.has(refId)) continue;
        const resource = getResourceByRef(options.refType, refId);
        if (resource?.ownerUserId === options.userId) deleteResource(resource.id);
      }
      sendJson(res, 200, { records });
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  }

  async function handle(req, res) {
    const requestPath = requestPathname(req);
    const isImageHistory = requestPath === "/api/history/images";
    const isChatHistory = requestPath === "/api/history/chat";
    if (!isImageHistory && !isChatHistory) return false;
    const userId = req?.auth?.user?.id;
    if (!userId) {
      sendJson(res, 401, { error: "Authentication required", code: "unauthorized" });
      return true;
    }
    if (isImageHistory) {
      await handleHistory(req, res, resolveHistoryFile(userId, imageHistoryFile), 200, {
        userId,
        resourceType: "image",
        refType: "history_image",
      });
    } else {
      await handleHistory(req, res, resolveHistoryFile(userId, chatHistoryFile), 50, {
        userId,
        resourceType: "chat",
        refType: "history_chat",
      });
    }
    return true;
  }

  return Object.freeze({ handle });
}

module.exports = { createHistoryHttpApi };
