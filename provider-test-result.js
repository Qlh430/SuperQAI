(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AiOsProviderTestResult = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const MAX_TEXT = 64_000;
  const MAX_IMAGE = 32 * 1024 * 1024;
  const containers = new Set(["data", "images", "image", "result", "results", "output", "outputs", "response"]);
  const urlKeys = new Set(["url", "image_url", "imageUrl", "imageURL", "fileUrl", "fileURL", "outputUrl"]);
  const base64Keys = new Set(["b64_json", "b64", "image_base64", "imageBase64"]);

  function safeImageSource(value) {
    const source = typeof value === "string" ? value.trim() : "";
    if (!source || source.length > MAX_IMAGE) return "";
    if (/^data:image\/(?:png|jpeg|webp|gif|avif);base64,[a-z0-9+/]+={0,2}$/i.test(source)) return source;
    if (source.length > 16_384) return "";
    try {
      const url = new URL(source);
      return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? source : "";
    } catch { return ""; }
  }

  function redact(value, secrets) {
    let text = String(value || "").slice(0, MAX_TEXT);
    for (const secret of secrets.filter(Boolean).map(String)) text = text.split(secret).join("[REDACTED]");
    return text.replace(/\bBearer\s+[A-Za-z0-9._~+/-]+/gi, "Bearer [REDACTED]")
      .replace(/\b(?:sk|rk|pk|key)-[A-Za-z0-9._-]{4,}/gi, "[REDACTED]");
  }

  function replyText(value, depth = 0) {
    if (depth > 8 || !value) return "";
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map(item => replyText(item, depth + 1)).filter(Boolean).join("\n");
    if (typeof value !== "object") return "";
    for (const key of ["text", "content", "output_text", "output", "response", "answer", "message", "choices", "candidates", "parts"]) {
      if (key === "message" && typeof value[key] === "string") continue;
      const found = replyText(value[key], depth + 1);
      if (found.trim()) return found;
    }
    return "";
  }

  function presentTestResult(result, intent, elapsedMs = 0, secrets = []) {
    const images = [];
    let taskId = "", failed = false;
    const visit = (value, depth = 0) => {
      if (depth > 8 || !value) return;
      const add = source => {
        const safe = safeImageSource(source);
        if (safe && images.length < 8 && !images.includes(safe) && !secrets.some(secret => secret && safe.includes(secret))) images.push(safe);
      };
      if (typeof value === "string") { add(value); return; }
      if (Array.isArray(value)) { value.forEach(item => visit(item, depth + 1)); return; }
      if (typeof value !== "object") return;
      if (["failed", "failure", "error", "cancelled", "canceled", "violation"].includes(String(value.status || value.state || "").toLowerCase())) failed = true;
      taskId ||= String(value.task_id || value.taskId || "");
      for (const [key, item] of Object.entries(value)) {
        if (urlKeys.has(key)) {
          if (item && typeof item === "object") visit(item, depth + 1);
          else add(item);
        } else if (base64Keys.has(key) && typeof item === "string") {
          add(item.startsWith("data:") ? item : `data:${value.mime_type || value.mimeType || "image/png"};base64,${item}`);
        } else if (containers.has(key)) visit(item, depth + 1);
      }
    };
    const isImage = String(intent).startsWith("image.");
    if (isImage) visit(result);
    const originalText = isImage ? "" : replyText(result);
    const text = redact(originalText, secrets);
    const toolCalls = result?.toolCalls || result?.tool_calls;
    const toolCallCount = Array.isArray(toolCalls) ? toolCalls.length : 0;
    return {
      status: failed ? "failed" : isImage
        ? images.length ? "succeeded" : taskId ? "pending" : "invalid"
        : text.trim() || toolCallCount ? "succeeded" : "invalid",
      text,
      images,
      taskId: redact(taskId, secrets).slice(0, 512),
      toolCallCount,
      truncated: originalText.length > MAX_TEXT,
      elapsedMs: Number.isFinite(elapsedMs) ? Math.max(0, Math.round(elapsedMs)) : 0,
    };
  }
  return Object.freeze({ presentTestResult, safeImageSource });
});
