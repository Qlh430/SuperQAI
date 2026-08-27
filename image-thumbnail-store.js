const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

function stableThumbnailKey(source) {
  return crypto.createHash("sha256").update(normalizeSource(source)).digest("hex").slice(0, 32);
}

function normalizeSource(source) {
  const value = String(source || "").trim();
  if (
    !value
    || value.includes("\0")
    || value.startsWith("../")
    || value.startsWith("..\\")
    || value.includes("/../")
    || value.includes("\\..\\")
  ) {
    throw new Error("Invalid thumbnail source.");
  }
  return value;
}

function readRegistry(dataFile) {
  try {
    if (!fs.existsSync(dataFile)) return Object.create(null);
    const value = JSON.parse(fs.readFileSync(dataFile, "utf8") || "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? Object.assign(Object.create(null), value)
      : Object.create(null);
  } catch {
    return Object.create(null);
  }
}

function createThumbnailStore({ outputDir, dataFile, maxBytes = DEFAULT_MAX_BYTES }) {
  const resolvedOutputDir = path.resolve(outputDir);
  const thumbnailsDir = path.join(resolvedOutputDir, "thumbnails");
  const resolvedDataFile = path.resolve(dataFile);
  const resolvedMaxBytes = Math.max(1, Number(maxBytes) || DEFAULT_MAX_BYTES);
  fs.mkdirSync(thumbnailsDir, { recursive: true });
  fs.mkdirSync(path.dirname(resolvedDataFile), { recursive: true });
  let registry = readRegistry(resolvedDataFile);

  function writeRegistry() {
    const temporary = `${resolvedDataFile}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(registry, null, 2));
    fs.renameSync(temporary, resolvedDataFile);
  }

  function resolveUrlPath(urlPath) {
    const value = String(urlPath || "");
    if (!value.startsWith("/output/thumbnails/")) return "";
    const relative = decodeURIComponent(value.slice("/output/".length)).replace(/\\/g, "/");
    const resolved = path.resolve(resolvedOutputDir, relative);
    const prefix = `${resolvedOutputDir}${path.sep}`;
    return resolved.startsWith(prefix) ? resolved : "";
  }

  function persist(source, item) {
    registry[source] = item;
    writeRegistry();
    return { ...item };
  }

  function lookup(source) {
    let normalized;
    try {
      normalized = normalizeSource(source);
    } catch {
      return null;
    }
    const item = registry[normalized];
    if (!item || typeof item !== "object") return null;
    if (!item.lightweight) {
      const filePath = resolveUrlPath(item.thumbnailUrl);
      if (!filePath || !fs.existsSync(filePath)) {
        delete registry[normalized];
        writeRegistry();
        return null;
      }
    }
    return { ...item };
  }

  function save({ source, buffer, mimeType, width = 0, height = 0, lightweight = false }) {
    const normalized = normalizeSource(source);
    const dimensions = {
      width: Math.max(0, Number(width) || 0),
      height: Math.max(0, Number(height) || 0),
    };
    if (lightweight) {
      return persist(normalized, {
        source: normalized,
        thumbnailUrl: normalized,
        ...dimensions,
        lightweight: true,
        updatedAt: Date.now(),
      });
    }
    if (!["image/webp", "image/jpeg"].includes(mimeType)) {
      throw new Error("Unsupported thumbnail type.");
    }
    if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > resolvedMaxBytes) {
      throw new Error("Thumbnail is empty or too large.");
    }
    const extension = mimeType === "image/jpeg" ? ".jpg" : ".webp";
    const filename = `${stableThumbnailKey(normalized)}${extension}`;
    fs.writeFileSync(path.join(thumbnailsDir, filename), buffer);
    return persist(normalized, {
      source: normalized,
      thumbnailUrl: `/output/thumbnails/${filename}`,
      ...dimensions,
      lightweight: false,
      updatedAt: Date.now(),
    });
  }

  return {
    lookup,
    save,
    resolveUrlPath,
  };
}

module.exports = {
  createThumbnailStore,
  stableThumbnailKey,
};
