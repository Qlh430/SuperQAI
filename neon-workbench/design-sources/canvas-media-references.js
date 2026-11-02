"use strict";
function mediaReferenceKey(value) {
  if (typeof value !== "string") return "";
  if (/^https?:\/\//i.test(value)) {
    try { value = new URL(value).pathname; } catch { return ""; }
  }
  if (!value.startsWith("/output/")) return "";
  let ref;
  try { ref = decodeURIComponent(value.split(/[?#]/, 1)[0]); } catch { return ""; }
  if (/[\\:\u0000-\u001f]/.test(ref) || ref.slice(1).split("/").some(part => !part || part === "." || part === "..")) return "";
  return process.platform === "win32" ? ref.toLowerCase() : ref;
}
function collectMediaReferences(value, refs = new Map()) {
  if (typeof value === "string") {
    const key = mediaReferenceKey(value);
    if (key) refs.set(key, value);
    else if (/^\s*[\[{]/.test(value)) { try { collectMediaReferences(JSON.parse(value), refs); } catch {} }
  } else if (Array.isArray(value)) value.forEach(item => collectMediaReferences(item, refs));
  else if (value && typeof value === "object") Object.values(value).forEach(item => collectMediaReferences(item, refs));
  return refs;
}
module.exports = { mediaReferenceKey, collectMediaReferences };
