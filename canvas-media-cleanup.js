const fs = require("node:fs");
const path = require("node:path");

function resolveOutputMedia(url, { outputDir } = {}) {
  const source = String(url || "").trim();
  if (!source.startsWith("/output/")) return null;
  let relative;
  try {
    relative = decodeURIComponent(source.slice("/output/".length)).replace(/\\/g, "/");
  } catch {
    return null;
  }
  if (!relative || relative.split("/").some((part) => part === "." || part === ".." || !part)) return null;
  const root = path.resolve(String(outputDir || ""));
  if (!root) return null;
  const filePath = path.resolve(root, relative);
  if (!filePath.startsWith(`${root}${path.sep}`)) return null;
  return {
    url: `/output/${relative}`,
    filePath,
  };
}

function collectOutputMediaUrls(value, options = {}, urls = new Set(), visited = new WeakSet()) {
  if (typeof value === "string") {
    const resolved = resolveOutputMedia(value, options);
    if (resolved) urls.add(resolved.url);
    return urls;
  }
  if (!value || typeof value !== "object") return urls;
  if (visited.has(value)) return urls;
  visited.add(value);
  if (Array.isArray(value)) value.forEach((item) => collectOutputMediaUrls(item, options, urls, visited));
  else Object.values(value).forEach((item) => collectOutputMediaUrls(item, options, urls, visited));
  return urls;
}

function deleteUnreferencedOutputMedia({
  candidateUrls,
  referencedUrls,
  outputDir,
  thumbnailStore,
} = {}) {
  const referenced = referencedUrls instanceof Set
    ? referencedUrls
    : collectOutputMediaUrls(referencedUrls, { outputDir });
  const deletedUrls = [];
  const retainedUrls = [];
  const missingUrls = [];
  const ignoredUrls = [];
  const uniqueCandidates = [...new Set(Array.isArray(candidateUrls) ? candidateUrls.map(String) : [])];

  uniqueCandidates.forEach((candidate) => {
    const resolved = resolveOutputMedia(candidate, { outputDir });
    if (!resolved) {
      ignoredUrls.push(candidate);
      return;
    }
    if (referenced.has(resolved.url)) {
      retainedUrls.push(resolved.url);
      return;
    }
    if (!fs.existsSync(resolved.filePath)) {
      missingUrls.push(resolved.url);
      return;
    }
    fs.unlinkSync(resolved.filePath);
    thumbnailStore?.remove?.(resolved.url);
    deletedUrls.push(resolved.url);
  });

  return { deletedUrls, retainedUrls, missingUrls, ignoredUrls };
}

module.exports = {
  collectOutputMediaUrls,
  deleteUnreferencedOutputMedia,
  resolveOutputMedia,
};
