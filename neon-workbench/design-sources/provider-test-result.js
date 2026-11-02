(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AiOsProviderTestResult = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const MAX_TEXT = 64_000;
  const MAX_IMAGE = 32 * 1024 * 1024;
  const containers = new Set(["data", "images", "image", "videos", "video", "audios", "audio", "result", "results", "output", "outputs", "response", "diagnostics"]);
  const urlKeys = new Set(["url", "image_url", "imageUrl", "imageURL", "video_url", "videoUrl", "audio_url", "audioUrl", "fileUrl", "fileURL", "outputUrl"]);
  const base64Keys = new Set(["b64_json", "b64", "image_base64", "imageBase64", "video_base64", "videoBase64", "audio_base64", "audioBase64"]);
  const mimePatterns = { image: /^(?:png|jpeg|webp|gif|avif)$/i, video: /^(?:mp4|webm|ogg|quicktime)$/i, audio: /^(?:mpeg|mp3|wav|x-wav|ogg|opus|aac|mp4|webm|flac)$/i };
  const extensions = { image: /\.(?:png|jpe?g|webp|gif|avif)$/i, video: /\.(?:mp4|webm|ogv|mov)$/i, audio: /\.(?:mp3|wav|ogg|opus|aac|m4a|flac)$/i };

  function safeImageSource(value) {
    return safeMediaSource(value, "image");
  }

  function safeMediaSource(value, kind) {
    const source = typeof value === "string" ? value.trim() : "";
    if (!source || source.length > MAX_IMAGE) return "";
    const data = source.match(/^data:([^/]+)\/([^;,]+);base64,([a-z0-9+/]+={0,2})$/i);
    if (data) return data[1].toLowerCase() === kind && mimePatterns[kind]?.test(data[2]) ? source : "";
    if (source.length > 16_384) return "";
    try {
      const url = new URL(source);
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return "";
      if ([...url.searchParams.keys()].some(key => /^(?:api[_-]?key|wallet[_-]?key|authorization|token|password|cookie)$/i.test(key))) return "";
      if (Object.entries(extensions).some(([type, pattern]) => type !== kind && pattern.test(url.pathname))) return "";
      return source;
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
    const images = [], videos = [], audios = [];
    const kind = String(intent).startsWith("image.") ? "image" : String(intent).startsWith("video.") ? "video" : String(intent).startsWith("audio.") ? "audio" : "";
    const media = kind === "image" ? images : kind === "video" ? videos : audios;
    let taskId = "", failed = false, processing = false;
    const visit = (value, depth = 0, declaredKind = "") => {
      if (depth > 8 || !value) return;
      const add = (source, declared = "") => {
        if (!kind || (declared && declared !== kind)) return;
        const safe = safeMediaSource(source, kind);
        let decoded = safe;
        try { decoded = decodeURIComponent(safe); } catch {}
        if (safe && media.length < 8 && !media.includes(safe) && !secrets.some(secret => secret && (safe.includes(secret) || decoded.includes(secret)))) media.push(safe);
      };
      if (typeof value === "string") { add(value, declaredKind); return; }
      if (Array.isArray(value)) { value.forEach(item => visit(item, depth + 1, declaredKind)); return; }
      if (typeof value !== "object") return;
      const code = Number(value.code ?? value.statusCode ?? 0);
      if (["pending", "queued", "running", "processing", "submitted", "accepted", "in_progress", "in-progress", "waiting"].includes(String(value.status || value.state || value.task_status || "").toLowerCase())) processing = true;
      if (["failed", "fail", "failure", "error", "cancelled", "canceled", "violation", "rejected"].includes(String(value.status || value.state || value.task_status || "").toLowerCase()) || value.success === false || value.error
        || (Number.isFinite(code) && code !== 0 && !(code >= 200 && code < 300))) failed = true;
      taskId ||= String(value.task_id || value.taskId || value.task?.id || "");
      for (const [key, item] of Object.entries(value)) {
        if (urlKeys.has(key)) {
          const declared = /^image/i.test(key) ? "image" : /^video/i.test(key) ? "video" : /^audio/i.test(key) ? "audio" : String(value.mime_type || value.mimeType || "").split("/")[0] || declaredKind;
          if (item && typeof item === "object") visit(item, depth + 1, declared);
          else add(item, declared);
        } else if (base64Keys.has(key) && typeof item === "string") {
          const mime = value.mime_type || value.mimeType || (kind === "image" ? "image/png" : "");
          if (item.startsWith("data:")) add(item, declaredKind);
          else if (mime) add(`data:${mime};base64,${item}`, declaredKind);
        } else if (containers.has(key)) visit(item, depth + 1, /^images?$/.test(key) ? "image" : /^videos?$/.test(key) ? "video" : /^audios?$/.test(key) ? "audio" : declaredKind);
      }
    };
    visit(result);
    const originalText = kind ? "" : replyText(result);
    const text = redact(originalText, secrets);
    const toolCalls = result?.toolCalls || result?.tool_calls;
    const toolCallCount = Array.isArray(toolCalls) ? toolCalls.filter(call => call && (call.name || call.function?.name)).length : 0;
    const status = failed ? "failed" : kind && processing ? "pending" : kind
      ? media.length ? "succeeded" : taskId ? "pending" : "invalid"
      : intent === "llm.tools" ? toolCallCount ? "succeeded" : "invalid"
        : text.trim() ? "succeeded" : "invalid";
    return {
      status,
      text,
      images,
      videos,
      audios,
      taskId: redact(taskId, secrets).slice(0, 512),
      toolCallCount,
      truncated: originalText.length > MAX_TEXT,
      elapsedMs: Number.isFinite(elapsedMs) ? Math.max(0, Math.round(elapsedMs)) : 0,
      ...(status === "pending" ? { message: "上游已返回任务编号，尚未确认生成完成；请查看服务平台的任务记录。" } : {}),
      ...(status === "failed" ? { code: "provider_test_failed", message: "上游任务失败，请检查模型权限、提示词和服务平台的任务记录。" } : {}),
      ...(status === "invalid" ? { code: "provider_test_invalid_response", message: intent === "llm.tools" ? "上游没有返回实际工具调用，请检查模型工具能力和协议。" : "上游没有返回当前能力的有效内容，请检查模型 ID、协议和参数。" } : {}),
    };
  }
  return Object.freeze({ presentTestResult, safeImageSource, safeMediaSource });
});
