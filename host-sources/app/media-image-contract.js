"use strict";

function providerHasHost(provider, domain) {
  try {
    const host = new URL(provider?.baseUrl || provider?.base_url).hostname.toLowerCase();
    return host === domain || host.endsWith(`.${domain}`);
  } catch { return false; }
}

function imageResolution(explicit, size) {
  const requested = String(explicit || "").trim().toLowerCase();
  if (/^[124](?:\.0)?k?$/.test(requested)) return `${Number.parseInt(requested, 10)}k`;
  const pixels = String(size || "").trim().toLowerCase().match(/^(\d+)\s*[x*]\s*(\d+)$/);
  if (!pixels) return /^[124]k$/.test(String(size || "").toLowerCase()) ? String(size).toLowerCase() : "1k";
  const width = Number(pixels[1]), height = Number(pixels[2]);
  const longEdge = Math.max(width, height), area = width * height;
  return longEdge >= 3000 || area > 4_500_000 ? "4k" : longEdge >= 1800 || area > 1_800_000 ? "2k" : "1k";
}

function geminiImageConfig(params = {}) {
  const existing = params.generationConfig?.imageConfig || {};
  let aspectRatio = params.aspectRatio || params.aspect_ratio || existing.aspectRatio;
  if (!aspectRatio) {
    const size = String(params.size || "").trim();
    if (/^\d+\s*:\s*\d+$/.test(size)) aspectRatio = size.replace(/\s/g, "");
    const pixels = size.match(/^(\d+)\s*[x*]\s*(\d+)$/i);
    if (pixels) {
      const width = Number(pixels[1]), height = Number(pixels[2]);
      let a = width, b = height;
      while (b) [a, b] = [b, a % b];
      if (a > 0) aspectRatio = `${width / a}:${height / a}`;
    }
  }
  return {
    ...existing,
    aspectRatio: String(aspectRatio || "1:1"),
    imageSize: imageResolution(params.resolution || params.imageSize || params.image_size || existing.imageSize, params.size).toUpperCase(),
  };
}

async function imageDataUrl(value) {
  if (typeof value === "string") return value;
  const blob = value instanceof Blob ? value : value?.blob;
  if (blob instanceof Blob) {
    const bytes = Buffer.from(await blob.arrayBuffer());
    return `data:${blob.type || "image/png"};base64,${bytes.toString("base64")}`;
  }
  if (value?.b64_json) return `data:${value.mime_type || value.mimeType || "image/png"};base64,${value.b64_json}`;
  return String(value?.data || value?.url || "");
}

async function serializedImages(input = {}) {
  return (await Promise.all((Array.isArray(input.inputImages) ? input.inputImages : []).map(imageDataUrl))).filter(Boolean);
}

function usesGenerationImageEdit(model) {
  return /(?:gemini.*image|nano[-_.]?banana)/i.test(String(model?.id || model?.model || model || ""));
}

const IMAGE_CONTAINERS = new Set(["data", "images", "image", "result", "results", "output", "outputs", "response"]);
const IMAGE_URL_KEYS = new Set(["url", "image_url", "imageUrl", "imageURL", "fileUrl", "fileURL", "outputUrl"]);
const IMAGE_BASE64_KEYS = new Set(["b64_json", "b64", "image_base64", "imageBase64"]);

function normalizeImageResultData(payload) {
  const output = [], seen = new Set(), visited = new Set();
  const add = (value, base64 = false, mime = "") => {
    if (Array.isArray(value)) { value.forEach(item => add(item, base64, mime)); return; }
    if (typeof value !== "string") return;
    const text = value.trim();
    if (!text || (!base64 && !/^https?:\/\/|^data:image\//i.test(text))) return;
    const key = `${base64 ? "b64" : "url"}:${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    output.push(base64 ? { b64_json: text, ...(mime ? { mime_type: mime } : {}) } : { url: text });
  };
  const visit = (value, depth = 0) => {
    if (depth > 8 || !value) return;
    if (typeof value === "string") { add(value); return; }
    if (Array.isArray(value)) { value.forEach(item => visit(item, depth + 1)); return; }
    if (typeof value !== "object" || visited.has(value)) return;
    visited.add(value);
    for (const [key, item] of Object.entries(value)) {
      if (IMAGE_URL_KEYS.has(key)) {
        if (item && typeof item === "object" && !Array.isArray(item)) visit(item, depth + 1);
        else add(item);
      } else if (IMAGE_BASE64_KEYS.has(key)) add(item, true, value.mime_type || value.mimeType || "");
      else if (IMAGE_CONTAINERS.has(key)) visit(item, depth + 1);
    }
  };
  visit(payload);
  return output;
}

module.exports = { providerHasHost, imageResolution, geminiImageConfig, serializedImages, usesGenerationImageEdit, normalizeImageResultData };
