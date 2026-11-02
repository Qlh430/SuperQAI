(function initCanvasAgentVerification(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasAgentVerification = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasAgentVerification() {
  function text(value) {
    return String(value || "").trim();
  }

  function normalizeEndpoint(value) {
    const raw = text(value).replace(/\/+$/, "");
    if (!raw) return "";
    try {
      const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      const pathname = url.pathname.replace(/\/+$/, "");
      return `${url.protocol.toLowerCase()}//${url.host.toLowerCase()}${pathname === "/" ? "" : pathname}`;
    } catch {
      return raw;
    }
  }

  function candidateKey(candidate) {
    return `${text(candidate?.providerId)}:${text(candidate?.model)}`;
  }

  function isLikelyAgentModel(modelId) {
    const model = text(modelId).toLowerCase();
    if (!model || /(image|video|audio|tts|embedding|rerank|whisper|flux|midjourney)/.test(model)) return false;
    return /(gpt|claude|gemini|qwen|deepseek|glm|kimi|minimax|mistral|llama|command|doubao)/.test(model);
  }

  function modelPriority(candidate, readyModels) {
    const model = text(candidate?.model).toLowerCase();
    if (readyModels.has(model)) return 0;
    if (/gpt-5\.6-terra/.test(model)) return 1;
    if (/gpt-5\.(6|5|4|3|2)/.test(model)) return 2;
    return 3;
  }

  function selectAutoVerificationTargets(pool = {}, options = {}) {
    const maxReadyEndpoints = Math.max(1, Number(options.maxReadyEndpoints || 3));
    const maxTargets = Math.max(0, Number(options.maxTargets || 3));
    const attemptedKeys = options.attemptedKeys instanceof Set ? options.attemptedKeys : new Set(options.attemptedKeys || []);
    const ready = Array.isArray(pool.candidates) ? pool.candidates.filter((item) => item?.state === "ready") : [];
    const readyEndpoints = new Set(ready.map((item) => normalizeEndpoint(item.endpointIdentity || item.endpoint)).filter(Boolean));
    const readyModels = new Set(ready.map((item) => text(item.model).toLowerCase()).filter(Boolean));
    const needed = Math.min(maxTargets, Math.max(0, maxReadyEndpoints - readyEndpoints.size));
    if (!needed) return [];

    const seenEndpoints = new Set(readyEndpoints);
    return (Array.isArray(pool.discovered) ? pool.discovered : [])
      .filter((item) => item?.state === "pending_verification")
      .filter((item) => isLikelyAgentModel(item.model))
      .filter((item) => !attemptedKeys.has(candidateKey(item)))
      .sort((left, right) => {
        const priority = modelPriority(left, readyModels) - modelPriority(right, readyModels);
        if (priority) return priority;
        return candidateKey(left).localeCompare(candidateKey(right), "zh-CN");
      })
      .filter((item) => {
        const endpoint = normalizeEndpoint(item.endpointIdentity || item.endpoint);
        if (!endpoint || seenEndpoints.has(endpoint)) return false;
        seenEndpoints.add(endpoint);
        return true;
      })
      .slice(0, needed);
  }

  function classifyVerificationQuality(result = {}) {
    if (result.tools !== true) return { state: "partial", label: "工具未通过", tone: "warning" };
    if (Math.max(0, Number(result.latencyMs || 0)) > 10_000) {
      return { state: "slow", label: "已验证 · 响应较慢", tone: "warning" };
    }
    return { state: "verified", label: "Agent 已验证", tone: "success" };
  }

  return {
    candidateKey,
    classifyVerificationQuality,
    isLikelyAgentModel,
    normalizeEndpoint,
    selectAutoVerificationTargets,
  };
});
