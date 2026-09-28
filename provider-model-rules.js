"use strict";

// Model names describe capabilities; the configured site describes transport.
// An OpenAI-compatible relay can serve Claude/Gemini without native endpoints.
function modelType(model) {
  const id = String(model?.id || model?.model || model?.name || "").toLowerCase();
  if (/embedding|embed-|(?:^|[/_-])(?:bge|gte|e5)[-_/]|moderation|rerank/.test(id)) return "other";
  if (/whisper|transcrib|(?:^|[-_])stt(?:[-_]|$)/.test(id)) return "other";
  if (/tts|speech|voice|suno|music|udio/.test(id)) return "audio";
  if (/video|seedance|sora|veo|kling|hailuo|pixverse|runway|vidu|(?:^|[-_])wan[-\d]/.test(id) && !/image/.test(id)) return "video";
  if (/image|dall.?e|flux|stable.?diffusion|sdxl|sd3|midjourney|(?:^|[/_-])mj(?:[-_]|$)|imagen|recraft|ideogram|cogview|seedream|nano[-_.]?banana/.test(id)) return "image";
  const capabilities = Array.isArray(model?.capabilities) ? model.capabilities : [];
  if (capabilities.some(value => value.startsWith("image."))) return "image";
  if (capabilities.includes("video.generate")) return "video";
  if (capabilities.includes("audio.generate")) return "audio";
  return "llm";
}

function hostOf(provider) {
  try { return new URL(provider?.baseUrl || provider?.base_url).hostname.toLowerCase(); } catch { return ""; }
}

function isApimartHost(host) {
  const normalized = String(host || "").toLowerCase();
  return normalized === "apimart.ai"
    || normalized.endsWith(".apimart.ai")
    || normalized === "apib.ai"
    || normalized.endsWith(".apib.ai");
}

// Dreamina publishes an image model as "jimeng-5.0Pro" while the CLI itself only
// accepts the bare version. A provider row saved before the prefix existed still
// holds the bare name, and both names describe the same client model, so the
// published form is what gets stored. Anything else is left alone.
function canonicalJimengImageModelId(id) {
  const bare = String(id || "").trim().replace(/^jimeng[-_ ]?/i, "");
  return /^\d+(?:\.\d+)+(?:pro)?$/i.test(bare) ? `jimeng-${bare}` : "";
}

function inferModelConfiguration(model = {}, provider = {}) {
  if (typeof model === "string") model = { id: model };
  const id = String(model.id || model.model || model.name || "").trim();
  const host = hostOf(provider);
  const siteProtocol = String(provider.protocol || provider.providerProtocol || "").toLowerCase();
  const apimartTransport = siteProtocol === "apimart" || isApimartHost(host);
  const aliases = { "openai-chat": "openai", "openai-image": "openai-images", "gemini-chat": "gemini", "gemini-image": "gemini", "gemini-generations": "openai-images", "anthropic-chat": "anthropic", "apimart-midjourney": "midjourney" };
  const rawProtocol = String(model.protocol || model.modelProtocol || "").toLowerCase();
  const explicit = aliases[rawProtocol] || rawProtocol;
  const type = explicit === "midjourney" ? "image" : modelType(model);
  if (siteProtocol === "cli:jimeng") {
    // Dreamina exposes image models as versions published with a "jimeng-"
    // prefix (jimeng-5.0Pro) and video models as Seedance names
    // (seedance2.0_vip), so neither shape is matched by the generic keyword
    // rules above. The command each one maps to is fixed by the CLI itself:
    // text2image/image2image for images, text2video/image2video for videos.
    const jimengType = /^seedance/i.test(id) ? "video" : /^(?:jimeng[-_ ]?)?\d+(?:\.\d+)+(?:pro)?$/i.test(id) ? "image" : type;
    const jimengVersion = Number.parseFloat(String(id).replace(/^jimeng[-_ ]?/i, ""));
    const jimengCapabilities = Array.isArray(model.capabilities)
      ? [...model.capabilities]
      : jimengType === "image"
        ? (jimengVersion >= 4 ? ["image.generate", "image.edit"] : ["image.generate"])
        : jimengType === "video" ? ["video.generate"] : [];
    return { id, protocol: "cli:jimeng", capabilities: jimengCapabilities, type: jimengType };
  }
  let protocol = explicit;
  // `openai` is the canonical OpenAI-compatible model profile for chat,
  // vision, tools, image generation and image editing. Only infer a profile
  // when the caller did not explicitly choose one; this prevents an image
  // model selected as `openai` from being silently rewritten to the legacy
  // `openai-images` profile.
  if (!protocol || protocol === "auto") {
    if (type === "image") {
      if (apimartTransport && /midjourney|^mj(?:[-_]|$)/i.test(id)) protocol = "midjourney";
      else if (host === "generativelanguage.googleapis.com" || siteProtocol === "gemini") protocol = "gemini";
      else if (["image-relay", "comfyui", "runninghub"].includes(siteProtocol)) protocol = siteProtocol;
      else if (apimartTransport && /gemini|imagen/i.test(id)) protocol = "gemini";
      else if (apimartTransport) protocol = "openai-images";
      else protocol = "openai";
    } else if (type === "video") protocol = ["comfyui", "runninghub"].includes(siteProtocol) ? siteProtocol : "video-adapter";
    else if (type === "audio") protocol = "audio-adapter";
    else if (["anthropic", "gemini", "openai-responses"].includes(siteProtocol)) protocol = siteProtocol;
    else if (host === "api.anthropic.com") protocol = "anthropic";
    else if (host === "generativelanguage.googleapis.com") protocol = "gemini";
    else if (siteProtocol || host) protocol = "openai";
    else if (/claude/i.test(id)) protocol = "anthropic";
    else if (/gemini/i.test(id)) protocol = "gemini";
    else protocol = "openai";
  } else if (protocol === "apimart" && type === "llm") {
    protocol = /claude/i.test(id) ? "anthropic" : /gemini/i.test(id) ? "gemini" : "openai";
  }
  const inferredCapabilities = type === "image"
    ? ["image.generate", ...(/gpt-image|gemini|nano[-_.]?banana|seedream|flux.*(?:kontext|klein)/i.test(id) ? ["image.edit"] : [])]
    : type === "video" ? ["video.generate"]
      : type === "audio" ? ["audio.generate"] : type === "other" ? [] : ["llm.chat", "llm.chat.vision", "llm.tools"];
  // An empty capability array is how older saved catalogs represented an
  // unannotated model. Preserve non-empty user selections, and allow the
  // settings UI to explicitly keep an empty selection with a metadata marker.
  const explicitCapabilities = Array.isArray(model.capabilities) && model.capabilities.length > 0;
  const explicitlyEmpty = model.metadata?.capabilitiesExplicit === true;
  let capabilities = explicitCapabilities || explicitlyEmpty ? [...(model.capabilities || [])] : inferredCapabilities;
  // The Midjourney protocol serves imagine, edit and blend through one profile,
  // so a Midjourney model that can generate can also take reference images.
  if (protocol === "midjourney" && capabilities.includes("image.generate") && !capabilities.includes("image.edit")) {
    capabilities = [...capabilities, "image.edit"];
  }
  return {
    id,
    protocol,
    capabilities,
    type,
  };
}

function normalizeProviderBaseUrl(value) {
  let url;
  try { url = new URL(String(value || "").trim()); } catch { throw new Error("Base URL 必须是有效的 HTTP(S) 地址。"); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Base URL 只允许 HTTP 或 HTTPS。");
  if (url.username || url.password || url.search || url.hash) throw new Error("Base URL 请只填写接口地址，不要包含账号、查询参数或片段；密钥请填写到 API Key。");
  url.pathname = url.pathname.replace(/\/+$/, "")
    .replace(/\/v1\/(?:chat\/completions|responses|messages|models|images\/(?:generations|edits)|midjourney\/generations(?:\/(?:edits|blend))?|tasks(?:\/[^/]+)?)$/i, "/v1")
    .replace(/\/v1beta\/models(?:\/[^/]+:(?:generateContent|streamGenerateContent))?$/i, "/v1beta");
  return url.toString().replace(/\/+$/, "");
}

module.exports = { inferModelConfiguration, isApimartHost, normalizeProviderBaseUrl, canonicalJimengImageModelId };
