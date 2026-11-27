"use strict";

const fs = require("node:fs");
const path = require("node:path");

function rows(markdown) {
  return String(markdown || "").split(/\r?\n/).filter(line => /^\s*\|/.test(line))
    .map(line => line.trim().replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map(cell => cell.trim()));
}

function tableEntries(markdown, idPattern) {
  return rows(markdown).filter(cells => cells.length >= 3 && idPattern.test(cells[0]))
    .map(cells => ({ id: cells[0], name: cells[1].replace(/`/g, ""), detail: cells.slice(2).join(" | ") }));
}

function cleanCell(value) {
  return String(value || "").replace(/<[^>]+>/g, "").replace(/\*\*/g, "").replace(/`/g, "").trim();
}

function parseCamera(markdown) {
  const entries = tableEntries(markdown, /^(?:CAM|LEN)\d{2}$/);
  const shared = (markdown.match(/(^> 仅基于[\s\S]*?)(?=\n\n\*\*关键区别)/m) || [null, ""])[1];
  const sharedPrompt = cleanCell(shared.replace(/^.*?>\s*/gm, "").replace(/\n/g, " "));
  return entries.map(item => {
    const [fileName, ...promptParts] = item.detail.split("|").map(cleanCell);
    const type = item.id.startsWith("CAM") ? "camera" : "lens";
    return {
      id: item.id,
      batch: "camera",
      type,
      group: type,
      subgroup: type,
      name: item.name,
      modelName: item.name,
      fileName,
      previewGenerationPrompt: [sharedPrompt, promptParts.join(" ").trim()].filter(Boolean).join("；"),
      previewPath: `/visual-presets/camera/${type === "camera" ? "cameras" : "lenses"}/${fileName.replace(/\.png$/i, ".webp")}`,
      sourcePath: `AI_OS_CAMERA_PREVIEWS/${type === "camera" ? "cameras" : "lenses"}/${fileName}`,
    };
  });
}

function parseCharacter(markdown) {
  const negativePrompt = cleanCell((markdown.match(/\*\*统一负面约束\*\*：`([^`]+)`/) || [null, ""])[1]);
  const groupLabels = new Map();
  const categoryPrompts = new Map();
  for (const line of String(markdown || "").split(/\r?\n/)) {
    const heading = line.match(/^####\s+[A-Z]\d+\.\s+(.+?)\s*`((?:LOOK|FACE|BODY|HAIR|STYLE)-[A-Z]+)`/);
    if (heading) groupLabels.set(heading[2], heading[1].replace(/（多选）/g, "").trim());
  }
  for (const cells of rows(markdown)) {
    const match = cells[0]?.match(/^`((?:LOOK|FACE|BODY|HAIR|STYLE)-[A-Z]+)`/);
    if (match && cells.length >= 3) {
      let prompt = cleanCell(cells.slice(2).join(" "));
      if (match[1] === "LOOK-ACCESSORY") prompt = prompt.replace(/`无`使用[\s\S]*$/, "").trim();
      categoryPrompts.set(match[1], prompt);
    }
  }
  const entries = tableEntries(markdown, /^(?:LOOK|FACE|BODY|HAIR|STYLE)-[A-Z]+-\d{2}$/);
  return entries.map(item => {
    const group = item.id.replace(/-\d{2}$/, "");
    const top = item.id.split("-")[0];
    const general = categoryPrompts.get(group) || "";
    const multi = group === "LOOK-ACCESSORY" || group === "FACE-MARK";
    return {
      id: item.id,
      batch: "character",
      type: "character",
      group,
      subgroup: ({
        LOOK: "妆容与穿搭",
        FACE: "五官",
        BODY: "体型",
        HAIR: "发型",
        STYLE: "风格",
      })[top] || top,
      groupLabel: groupLabels.get(group) || group,
      name: cleanCell(item.name),
      previewGenerationPrompt: [general, cleanCell(item.detail), negativePrompt].filter(Boolean).join("；"),
      selectionMode: multi ? "multi" : "single",
      ...(group === "LOOK-PALETTE" ? { paletteColors: item.detail.match(/#[0-9A-Fa-f]{6}/g) || [] } : {}),
      needsLabelConfirmation: group === "STYLE-LIGHT",
      previewPath: `/visual-presets/character/${({
        LOOK: "look",
        FACE: "face",
        BODY: "body",
        HAIR: "hair",
        STYLE: "style",
      })[top]}/${group.split("-")[1].toLowerCase()}/${item.id}.webp`,
      sourcePath: `AI_OS_CHARACTER_PREVIEWS/assets/character-design-previews/${({
        LOOK: "look",
        FACE: "face",
        BODY: "body",
        HAIR: "hair",
        STYLE: "style",
      })[top]}/${group.split("-")[1].toLowerCase()}/${item.id}.png`,
    };
  });
}

function stableAliases(entries, existingPresets) {
  const normalizeName = value => String(value || "").toLocaleLowerCase().replace(/[\s/·（）()_-]/g, "");
  const byGroupAndName = new Map(existingPresets.map(preset =>
    [`${preset.group}\0${normalizeName(preset.name)}`, preset.id]));
  const aliases = {
    R01: "style-documentary-cinematic",
    R08: "style-natural-lifestyle",
    R10: "style-minimal-commercial",
    R13: "style-film-grain",
    T04: "style-3d-concept",
    FG01: "filter-original",
    FG05: "filter-soft-film",
    FG07: "filter-cinematic-light",
    FG08: "filter-hdr",
    FG12: "filter-vintage",
    CAM01: "camera-hasselblad",
    CAM02: "camera-leica",
    CAM06: "camera-arri",
    LEN01: "lens-hawk-class-x",
    LEN02: "lens-zeiss-ultra-prime",
  };
  return entries.map(entry => {
    const exact = byGroupAndName.get(`${entry.group}\0${normalizeName(entry.name)}`);
    const legacyId = aliases[entry.id] || exact;
    return legacyId ? { ...entry, legacyId } : entry;
  });
}

function validateLibrary(library) {
  const entries = Array.isArray(library?.entries) ? library.entries : [];
  const seen = new Set();
  const duplicateIds = [];
  const invalidEntries = [];
  const counts = { style: 0, preset: 0, camera: 0, character: 0 };
  for (const entry of entries) {
    if (seen.has(entry.id)) duplicateIds.push(entry.id);
    seen.add(entry.id);
    if (Object.hasOwn(counts, entry.batch)) counts[entry.batch]++;
    if (!entry.id || !entry.name || !(entry.previewGenerationPrompt || entry.prompt) || !entry.previewPath || !entry.batch) invalidEntries.push(entry.id || "(missing-id)");
  }
  return { total: entries.length, counts, duplicateIds, invalidEntries };
}

function buildLibrary(options) {
  const styleManifest = JSON.parse(fs.readFileSync(options.styleManifest, "utf8"));
  const presetManifest = JSON.parse(fs.readFileSync(options.presetManifest, "utf8"));
  const existing = JSON.parse(fs.readFileSync(options.existingPresets, "utf8"));
  const style = styleManifest.items.map(item => ({
    id: item.id,
    batch: "style",
    type: "style",
    group: "stylePreset",
    subgroup: ({ real: "真人风格", mv: "MV 风格", "2d": "2D 风格", "3d": "3D 风格" })[item.category] || item.category,
    name: item.styleName,
    previewGenerationPrompt: item.previewGenerationPrompt ?? item.prompt,
    fileName: path.posix.basename(item.filePath),
    sourcePath: `AI_OS_STYLE_PREVIEWS/${item.filePath}`,
    previewPath: `/visual-presets/style/${item.filePath.replace(/\.png$/i, ".webp")}`,
    assetStatus: fs.existsSync(path.join(options.styleRoot, ...item.filePath.split("/"))) ? "available" : "missing",
    taskStatus: item.status || "unknown",
  }));
  const preset = presetManifest.items.map(item => ({
    id: item.id,
    batch: "preset",
    type: item.category === "functions" ? "function" : "filter",
    group: item.category === "functions" ? "functionPreset" : "filterPreset",
    subgroup: item.categoryLabel || item.category,
    name: item.name,
    previewGenerationPrompt: item.previewGenerationPrompt ?? item.prompt,
    requiresReference: String(item.category || "").startsWith("filters/"),
    fileName: path.posix.basename(item.filePath || item.file),
    sourcePath: `AI_OS_PRESET_PREVIEWS/${item.filePath || item.file}`,
    previewPath: `/visual-presets/preset/${(item.filePath || item.file).replace(/\.png$/i, ".webp")}`,
    assetStatus: fs.existsSync(path.join(options.presetRoot, ...String(item.filePath || item.file).split("/"))) ? "available" : "missing",
    taskStatus: item.status || "unknown",
    taskId: item.taskId || "",
  }));
  const cameraMarkdown = fs.readFileSync(options.cameraDocument, "utf8");
  const characterMarkdown = fs.readFileSync(options.characterDocument, "utf8");
  const camera = parseCamera(cameraMarkdown).map(item => ({
    ...item,
    assetStatus: fs.existsSync(path.join(options.cameraRoot, item.group === "camera" ? "cameras" : "lenses", item.fileName)) ? "available" : "missing",
    taskStatus: "not-submitted",
  }));
  const character = parseCharacter(characterMarkdown).map(item => ({
    ...item,
    assetStatus: fs.existsSync(path.join(options.characterRoot, ...item.sourcePath.replace(/^AI_OS_CHARACTER_PREVIEWS\//, "").split("/"))) ? "available" : "missing",
    taskStatus: "not-submitted",
  }));
  const entries = stableAliases([...style, ...preset, ...camera, ...character], existing.presets);
  const library = { version: 1, entries };
  const validation = validateLibrary(library);
  const expected = { style: 80, preset: 30, camera: 12, character: 317 };
  if (validation.total !== 439 || Object.keys(expected).some(key => validation.counts[key] !== expected[key])
    || validation.duplicateIds.length || validation.invalidEntries.length) {
    throw new Error(`预设目录校验失败：${JSON.stringify(validation)}`);
  }
  return library;
}

module.exports = { buildLibrary, parseCamera, parseCharacter, validateLibrary };
