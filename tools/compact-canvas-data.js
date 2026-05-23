const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const dataFile = path.join(root, "data", "canvas-boards.json");
const outputDir = path.join(root, "output");

if (!fs.existsSync(dataFile)) {
  console.log(`Canvas data not found: ${dataFile}`);
  process.exit(0);
}

fs.mkdirSync(outputDir, { recursive: true });

const beforeBytes = fs.statSync(dataFile).size;
const raw = fs.readFileSync(dataFile, "utf8");
const data = JSON.parse(raw || "[]");
const backupFile = `${dataFile}.bak-${Date.now()}`;

let extracted = 0;
let extractedBytes = 0;
let normalizedRefKeys = 0;

function walk(value) {
  if (Array.isArray(value)) {
    value.forEach(walk);
    return;
  }
  if (!value || typeof value !== "object") return;
  Object.keys(value).forEach((key) => {
    const current = value[key];
    if (key === "refOrder" && Array.isArray(current)) {
      const normalized = current.map(normalizeRefOrderKey).filter(Boolean);
      if (JSON.stringify(normalized) !== JSON.stringify(current)) {
        normalizedRefKeys += current.length;
        value[key] = normalized;
      }
      return;
    }
    if (typeof current === "string" && current.startsWith("data:image/")) {
      const converted = saveDataUrl(current);
      if (converted) value[key] = converted;
      return;
    }
    walk(current);
  });
}

function saveDataUrl(dataUrl) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return "";
  const mime = match[1].toLowerCase();
  const ext = mime.includes("jpeg") ? "jpg" : (mime.split("/")[1] || "png").replace("svg+xml", "svg");
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length) return "";
  const hash = crypto.createHash("sha1").update(buffer).digest("hex").slice(0, 16);
  const filename = `canvas_${Date.now()}_${hash}.${ext}`;
  fs.writeFileSync(path.join(outputDir, filename), buffer);
  extracted += 1;
  extractedBytes += buffer.length;
  return `/output/${filename}`;
}

function normalizeRefOrderKey(value) {
  const text = String(value || "");
  if (!text) return "";
  const parts = text.split(":");
  if (parts[0] === "image" || parts[0] === "text") return `${parts[0]}:${parts[1] || ""}`;
  if (parts[0] === "group") return `group:${parts[1] || ""}:${parts.at(-1) || "0"}`;
  return text.length > 512 ? "" : text;
}

walk(data);

if (!extracted && !normalizedRefKeys) {
  console.log(`No embedded canvas images or long reference keys found. Size: ${Math.round(beforeBytes / 1024)} KB`);
  process.exit(0);
}

fs.copyFileSync(dataFile, backupFile);
fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), "utf8");

const afterBytes = fs.statSync(dataFile).size;
console.log(`Extracted ${extracted} embedded image(s), ${Math.round(extractedBytes / 1024)} KB.`);
console.log(`Normalized ${normalizedRefKeys} reference order key(s).`);
console.log(`Canvas data: ${Math.round(beforeBytes / 1024)} KB -> ${Math.round(afterBytes / 1024)} KB`);
console.log(`Backup: ${backupFile}`);
