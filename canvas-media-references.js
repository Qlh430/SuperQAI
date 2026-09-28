"use strict";

function mediaReferenceKey(value) {
  if (typeof value !== "string" || !value.startsWith("/output/")) return "";
  let ref;
  try { ref = decodeURIComponent(value.split(/[?#]/, 1)[0]).replace(/\\/g, "/"); } catch { return ""; }
  if (ref.includes("\0") || ref.slice(1).split("/").some((part) => !part || part === "." || part === "..")) return "";
  return process.platform === "win32" ? ref.toLowerCase() : ref;
}

function collectMediaReferences(value, refs = new Map()) {
  if (typeof value === "string") {
    const key = mediaReferenceKey(value);
    if (key) refs.set(key, value);
    else if (value.startsWith("[") || value.startsWith("{")) {
      try { collectMediaReferences(JSON.parse(value), refs); } catch {}
    }
  } else if (Array.isArray(value)) value.forEach((item) => collectMediaReferences(item, refs));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectMediaReferences(item, refs));
  return refs;
}

module.exports = { mediaReferenceKey, collectMediaReferences };
