"use strict";

const fs = require("node:fs");
const path = require("node:path");

const visualPresetInputs = [
  "design-sources/flora-generator-composer.js",
  "design-sources/visual-preset-categories.json",
  "design-sources/visual-presets.json",
  "design-sources/visual-presets-runtime.js",
  "design-sources/visual-preset-previews.json",
  "design-sources/visual-preset-assets.json",
  "design-sources/visual-preset-library.json",
  "visual-presets-build.cjs",
  "design-sources/visual-preset-effects.json",
];

function compileGeneratorComposer(source) {
  const read = name => fs.readFileSync(path.join(source, name), "utf8");
  const categories = JSON.parse(read(visualPresetInputs[1]));
  const presets = JSON.parse(read(visualPresetInputs[2]));
  const previewManifest = JSON.parse(read(visualPresetInputs[4]));
  const assetManifest = JSON.parse(read(visualPresetInputs[5]));
  const library = JSON.parse(read(visualPresetInputs[6]));
  const { effects } = JSON.parse(read(visualPresetInputs[8]));
  const categoryConfig = extendCategories(categories, library.entries);
  const assetRoot = path.join(source, "public/visual-presets");
  const runtimePresets = extendPresets(
    presets.presets, library.entries, assetRoot, assetManifest, previewManifest, effects,
  ).map(({ promptPositive, promptNegative, ...preset }) => ({
    ...preset,
    runtimeEffectPrompt: formatRuntimeEffect(categoryConfig.categories, preset.group, promptPositive),
    runtimeNegativePrompt: promptNegative.trim(),
  }));
  const config = {
    ...categoryConfig,
    presets: runtimePresets,
    library: library.entries.map(({ previewGenerationPrompt, prompt, ...metadata }) => metadata),
    previews: {},
  };
  const json = JSON.stringify(config).replaceAll("<", "\\u003c");
  return `globalThis.FloraVisualPresetConfig = ${json};\n${read(visualPresetInputs[3])}\n${read(visualPresetInputs[0])}`;
}

function formatRuntimeEffect(categories, group, prompt) {
  const body = prompt.trim();
  if (!body) return "";
  const labels = {
    gender: "性别",
    age: "年龄",
    era: "时代",
    "LOOK-COSTUME": "服装",
    "HAIR-LENGTH": "发长",
    "HAIR-TYPE": "发型",
    "STYLE-RENDER": "整体风格",
    stylePreset: "整体风格",
    functionPreset: "功能输出",
    filterPreset: "滤镜效果",
  };
  const role = categories.find(category => category.id === "characterDesign");
  const optics = categories.find(category => category.id === "cameraControl");
  const label = labels[group]
    || role.groups.find(item => item.id === group)?.label.split(" / ").at(-1)
    || optics.tabs.find(item => item.id === group)?.label;
  if (!label) throw new Error(`视觉预设缺少运行时属性标签：${group}`);
  return `${label}：${body}${/[。！？.!?]$/.test(body) ? "" : "。"}`;
}

function extendCategories(categories, entries) {
  const next = JSON.parse(JSON.stringify(categories));
  const role = next.categories.find(category => category.id === "characterDesign");
  const groups = new Map((role.groups || []).map(group => [group.id, group]));
  for (const entry of entries.filter(item => item.batch === "character")) {
    if (!groups.has(entry.group)) {
      groups.set(entry.group, {
        id: entry.group,
        label: `${entry.subgroup ? `${entry.subgroup} / ` : ""}${entry.groupLabel || entry.group}`,
        selectionMode: entry.selectionMode || "single",
      });
    }
  }
  role.groups = [...groups.values()];
  role.tabs = [
    { id: "basic", label: "基础", groups: ["gender", "age", "ethnicity", "era", "profession"] },
    { id: "look", label: "妆容与穿搭", groups: ["LOOK-COSTUME", "LOOK-TOP", "LOOK-BOTTOM", "LOOK-PALETTE", "LOOK-ACCESSORY", "LOOK-MAKEUP"] },
    { id: "face", label: "五官", groups: ["FACE-SHAPE", "FACE-EYE", "FACE-BROW", "FACE-NOSE", "FACE-LIP", "FACE-SKIN", "FACE-AURA", "FACE-MARK"] },
    { id: "body", label: "体型", groups: ["BODY-SHAPE", "BODY-HEIGHT", "BODY-POSE"] },
    { id: "hair", label: "发型", groups: ["HAIR-LENGTH", "HAIR-TYPE", "HAIR-BANG", "HAIR-COLOR"] },
    { id: "character-style", label: "风格", groups: ["STYLE-PERSONALITY", "STYLE-ATMOSPHERE", "STYLE-RENDER", "STYLE-FRAME", "STYLE-ANGLE", "STYLE-LIGHT"] },
  ];
  const style = next.categories.find(category => category.id === "stylePreset");
  style.tabs = [
    { id: "real", label: "真人风格", presetTags: ["真人风格"] },
    { id: "mv", label: "MV 风格", presetTags: ["MV 风格"] },
    { id: "2d", label: "2D 风格", presetTags: ["2D 风格"] },
    { id: "3d", label: "3D 风格", presetTags: ["3D 风格"] },
  ];
  const filter = next.categories.find(category => category.id === "filterPreset");
  filter.label = "滤镜";
  filter.tabs = [
    { id: "general", label: "通用", presetTags: ["general"] },
    { id: "portrait", label: "人像质感", presetTags: ["portrait"] },
  ];
  const camera = next.categories.find(category => category.id === "cameraControl");
  camera.tabs = [
    { id: "camera", label: "相机", groups: [{ id: "camera", label: "相机" }] },
    { id: "lens", label: "镜头", groups: [{ id: "lens", label: "镜头" }] },
    { id: "focalLength", label: "焦距", groups: [{ id: "focalLength", label: "焦距" }] },
    { id: "aperture", label: "光圈", groups: [{ id: "aperture", label: "光圈" }] },
  ];
  if (!next.categories.some(category => category.id === "functionPreset")) {
    next.categories.push({
      id: "functionPreset",
      label: "功能预设",
      icon: "scan-eye",
      selectionMode: "single",
    });
  }
  return next;
}

function sha256File(file) {
  if (!fs.existsSync(file)) return "";
  return require("node:crypto").createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function mappedAsset(entry, assetRoot, assetManifest) {
  const asset = assetManifest?.assets?.[entry.previewPath];
  if (!asset || !["available", "preserved-existing"].includes(asset.status)) return null;
  const thumbnail = path.join(assetRoot, entry.previewPath.replace(/^\/visual-presets\//, ""));
  if (!fs.existsSync(thumbnail) || !asset.thumbnailSha256 || sha256File(thumbnail) !== asset.thumbnailSha256) return null;
  let previewSource = "";
  if (entry.batch === "camera" && !asset.originalConflict) {
    const originalPath = asset.originalPath || entry.previewPath
      .replace(/\/(cameras|lenses)\//, "/originals/$1/")
      .replace(/\.webp$/i, ".png");
    const originalSha256 = asset.originalSha256 || asset.sourceSha256;
    const original = path.join(assetRoot, originalPath.replace(/^\/visual-presets\//, ""));
    if (originalSha256 && fs.existsSync(original) && sha256File(original) === originalSha256) {
      previewSource = originalPath;
    }
  }
  return { thumbnail: entry.previewPath, previewSource };
}

function verifiedLegacyCameraOriginal(preset, assetRoot, previewManifest) {
  if (!["camera", "lens", "focalLength", "aperture"].includes(preset.group)
    || !String(preset.thumbnail || "").startsWith("asset:visual-presets/camera/")) return "";
  const manifestEntry = previewManifest?.images?.[preset.thumbnail];
  if (!manifestEntry?.sha256) return "";
  const assetRelative = preset.thumbnail.slice("asset:".length);
  const source = path.resolve("Q:/assets", assetRelative);
  if (!fs.existsSync(source) || sha256File(source) !== manifestEntry.sha256) return "";
  const relative = assetRelative.replace(/^visual-presets\//, "");
  const originalPath = `/visual-presets/originals/${relative}`;
  const packaged = path.join(assetRoot, "originals", relative);
  if (!fs.existsSync(packaged) || sha256File(packaged) !== manifestEntry.sha256) return "";
  return originalPath;
}

function extendPresets(existing, entries, assetRoot, assetManifest = null, previewManifest = null, effects = {}) {
  const next = existing.map(item => {
    const thumbnail = path.join(assetRoot, "legacy", `${item.id}.webp`);
    return {
      ...item,
      thumbnail: item.thumbnail?.startsWith("asset:") ? (fs.existsSync(thumbnail) ? `/visual-presets/legacy/${item.id}.webp` : "") : item.thumbnail,
      previewSource: verifiedLegacyCameraOriginal(item, assetRoot, previewManifest),
      requiresReference: item.group === "filterPreset" && item.id !== "filter-original",
      ...(item.group === "filterPreset" ? { tags: ["general"] } : {}),
      tags: [...(item.tags || [])],
    };
  });
  const byId = new Map(next.map(item => [item.id, item]));
  const orderByGroup = new Map();
  for (const item of entries) {
    const id = item.legacyId || item.id;
    if (!Object.hasOwn(effects, id)) throw new Error(`视觉预设缺少独立运行时效果：${id}`);
    const previous = byId.get(id);
    const asset = mappedAsset(item, assetRoot, assetManifest);
    const previewExists = Boolean(asset);
    if (previous) {
      previous.libraryId = item.id;
      if (item.batch === "camera") previous.name = item.name;
      previous.thumbnail = asset?.thumbnail || "";
      previous.previewSource = asset?.previewSource || previous.previewSource || "";
      previous.assetStatus = previewExists ? "available" : "missing";
      previous.tags = item.group === "filterPreset"
        ? [item.id.startsWith("FP") ? "portrait" : "general"]
        : [...new Set([...(previous.tags || []), item.subgroup].filter(Boolean))];
      continue;
    }
    const order = (orderByGroup.get(item.group) || 0) + 1;
    orderByGroup.set(item.group, order);
    const preset = {
      id,
      libraryId: item.id,
      type: item.type,
      group: item.group,
      subgroup: item.subgroup || item.group,
      name: item.name,
      thumbnail: asset?.thumbnail || "",
      previewSource: asset?.previewSource || "",
      description: item.name,
      selectionMode: item.selectionMode || "single",
      promptPositive: "",
      promptNegative: "",
      order,
      tags: item.group === "stylePreset"
        ? [item.subgroup]
        : item.group === "filterPreset"
          ? [item.id.startsWith("FP") ? "portrait" : "general"]
          : [item.subgroup || item.group],
      assetStatus: previewExists ? "available" : "missing",
      taskStatus: asset?.sourceStatus || item.taskStatus,
      requiresReference: Boolean(item.requiresReference),
      ...(Array.isArray(item.paletteColors) ? { paletteColors: item.paletteColors } : {}),
    };
    next.push(preset);
    byId.set(id, preset);
  }
  for (const [id, effect] of Object.entries(effects)) {
    const preset = byId.get(id);
    if (!preset || typeof effect?.runtimeEffectPrompt !== "string"
      || (!effect.runtimeEffectPrompt.trim() && id !== "filter-original" && id !== "LOOK-ACCESSORY-01")
      || (effect.runtimeNegativePrompt !== undefined && typeof effect.runtimeNegativePrompt !== "string")) {
      throw new Error(`视觉预设运行时效果无效：${id}`);
    }
    preset.promptPositive = effect.runtimeEffectPrompt;
    preset.promptNegative = effect.runtimeNegativePrompt ?? "";
  }
  return next;
}

module.exports = {
  compileGeneratorComposer, extendCategories, extendPresets, visualPresetInputs, mappedAsset,
  verifiedLegacyCameraOriginal,
};
