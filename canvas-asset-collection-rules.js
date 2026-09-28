(function initCanvasAssetCollectionRules(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasAssetCollectionRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasAssetCollectionRules() {
  const KINDS = new Set(["image", "video", "audio"]);
  let generatedId = 0;

  function detectKind({ mimeType = "", url = "", name = "" } = {}) {
    const mime = String(mimeType).toLowerCase();
    if (mime.startsWith("video/")) return "video";
    if (mime.startsWith("audio/")) return "audio";
    if (mime.startsWith("image/")) return "image";
    const value = `${url || name}`.toLowerCase().split(/[?#]/)[0];
    if (/\.(mp4|webm|mov|m4v)$/.test(value)) return "video";
    if (/\.(mp3|wav|m4a|aac|ogg|flac)$/.test(value)) return "audio";
    if (/\.(png|jpe?g|webp|gif|avif)$/.test(value)) return "image";
    return "";
  }

  function createMemberId() {
    generatedId += 1;
    return `asset-${Date.now()}-${generatedId}`;
  }

  function normalizeMember(input = {}, fallback = {}) {
    const src = String(input.src || input.url || fallback.src || "").trim();
    const savedUrl = String(input.savedUrl || input.downloadUrl || fallback.savedUrl || src).trim();
    const kind = KINDS.has(input.kind)
      ? input.kind
      : detectKind({
        mimeType: input.mimeType || fallback.mimeType,
        url: src,
        name: input.name || fallback.name,
      });
    if (!kind || !src) return null;
    return {
      id: String(input.id || fallback.id || createMemberId()),
      kind,
      name: String(input.name || fallback.name || "素材"),
      src,
      savedUrl,
      mimeType: String(input.mimeType || fallback.mimeType || ""),
      createdAt: String(input.createdAt || fallback.createdAt || new Date().toISOString()),
      duration: Number.isFinite(Number(input.duration)) ? Number(input.duration) : 0,
      source: String(input.source || fallback.source || "output"),
      sourceNodeId: String(input.sourceNodeId || fallback.sourceNodeId || ""),
      promptSummary: String(input.promptSummary || fallback.promptSummary || ""),
    };
  }

  function memberKey(member) {
    const url = String(member?.savedUrl || member?.src || "").trim();
    if (!url) return "";
    // The same file re-arriving from the same generator is a duplicate; the
    // same file from two different sources stays two separate materials.
    return `${String(member?.sourceNodeId || "")}|${url}`;
  }

  function compareMembers(left, right) {
    const leftTime = Date.parse(left?.createdAt || "") || 0;
    const rightTime = Date.parse(right?.createdAt || "") || 0;
    if (rightTime !== leftTime) return rightTime - leftTime;
    return 0;
  }

  function normalizeMembers(members) {
    const result = [];
    const keys = new Set();
    (Array.isArray(members) ? members : []).forEach((input) => {
      const member = normalizeMember(input);
      if (!member) return;
      const key = memberKey(member);
      if (key && keys.has(key)) return;
      if (key) keys.add(key);
      result.push(member);
    });
    return result
      .map((member, index) => ({ member, index }))
      .sort((left, right) => compareMembers(left.member, right.member) || left.index - right.index)
      .map(({ member }) => member);
  }

  function appendMember(members, input) {
    const current = normalizeMembers(members);
    const member = normalizeMember(input);
    if (!member) return current;
    const key = memberKey(member);
    if (key && current.some((item) => memberKey(item) === key)) return current;
    return normalizeMembers([...current, member]);
  }

  function getOutput(members) {
    return {
      type: "assets",
      assets: normalizeMembers(members),
    };
  }

  function canConnect(kind, targetKind) {
    const sourceKind = String(kind || "").trim();
    const target = String(targetKind || "").trim().toLowerCase();
    if (!KINDS.has(sourceKind)) return false;
    if (target === "video-generator") return true;
    if (target.includes("audio")) return sourceKind === "audio";
    if (target === "image" || target.includes("image-generator") || target === "generator") {
      return sourceKind === "image";
    }
    if (target === "asset-collection" || target === "assets") return true;
    return false;
  }

  return Object.freeze({
    KINDS: Object.freeze([...KINDS]),
    detectKind,
    normalizeMember,
    normalizeMembers,
    appendMember,
    getOutput,
    canConnect,
  });
});
