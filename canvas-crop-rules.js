(function initCanvasCropRules(root, factory) {
  const api = factory(root?.GridSlicingRules);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasCropRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasCropRules(GridSlicingRules) {
  if (!GridSlicingRules) {
    throw new Error("Grid slicing rules must load before canvas crop rules.");
  }

  const RATIOS = Object.freeze({
    "1:1": 1,
    "4:3": 4 / 3,
    "3:4": 3 / 4,
    "3:2": 3 / 2,
    "2:3": 2 / 3,
    "16:9": 16 / 9,
    "9:16": 9 / 16,
  });

  function createWorkbenchState(source, member) {
    return {
      sourceNode: source,
      memberId: String(member?.id || ""),
      source: member || {},
      sourceWidth: Math.max(0, Math.round(Number(member?.width) || 0)),
      sourceHeight: Math.max(0, Math.round(Number(member?.height) || 0)),
      mode: "ratio",
      aspectRatio: "1:1",
      freeRect: { x: 0.15, y: 0.15, width: 0.7, height: 0.7 },
      rows: 2,
      columns: 2,
      cellTransforms: [],
      selectedCellKey: "",
      busy: false,
      error: "",
    };
  }

  function resolveAspectRatio(value) {
    return RATIOS[value] || RATIOS["1:1"];
  }

  function normalizeFreeRect(rectValue = {}) {
    const x = Math.max(0, Math.min(1, Number(rectValue.x) || 0));
    const y = Math.max(0, Math.min(1, Number(rectValue.y) || 0));
    const width = Math.max(0, Math.min(1 - x, Number(rectValue.width) || 0));
    const height = Math.max(0, Math.min(1 - y, Number(rectValue.height) || 0));
    return { x, y, width, height };
  }

  function getRatioCrop(state) {
    const sourceWidth = Math.max(0, Math.round(Number(state?.sourceWidth) || 0));
    const sourceHeight = Math.max(0, Math.round(Number(state?.sourceHeight) || 0));
    const ratio = resolveAspectRatio(state?.aspectRatio);
    const width = Math.min(sourceWidth, sourceHeight * ratio);
    const height = width / ratio;
    return {
      key: "ratio",
      row: 1,
      column: 1,
      x: Math.max(0, (sourceWidth - width) / 2),
      y: Math.max(0, (sourceHeight - height) / 2),
      width,
      height,
    };
  }

  function getFreeCrop(state) {
    const sourceWidth = Math.max(0, Math.round(Number(state?.sourceWidth) || 0));
    const sourceHeight = Math.max(0, Math.round(Number(state?.sourceHeight) || 0));
    const rect = normalizeFreeRect(state?.freeRect);
    return {
      key: "free",
      row: 1,
      column: 1,
      x: Math.floor(rect.x * sourceWidth),
      y: Math.floor(rect.y * sourceHeight),
      width: Math.max(0, Math.ceil(rect.width * sourceWidth)),
      height: Math.max(0, Math.ceil(rect.height * sourceHeight)),
    };
  }

  function getGridCrops(state) {
    const spec = GridSlicingRules.normalizeGridSpec(state?.rows, state?.columns);
    const regions = GridSlicingRules.getSliceRegions(
      state.sourceWidth,
      state.sourceHeight,
      GridSlicingRules.createEvenBands(state.sourceWidth, spec.columns - 1, 0, "v"),
      GridSlicingRules.createEvenBands(state.sourceHeight, spec.rows - 1, 0, "h"),
    ).map((region) => ({ ...region, key: `r${region.row}-c${region.column}` }));
    const transforms = GridSlicingRules.normalizeCellTransforms(regions, state.cellTransforms);
    const transformMap = new Map(transforms.map((item) => [item.key, item]));
    return regions.map((region) => GridSlicingRules.getCellCrop(
      region,
      region.width / region.height,
      transformMap.get(region.key),
    ));
  }

  function validateCrops(state) {
    const sourceWidth = Math.max(0, Math.round(Number(state?.sourceWidth) || 0));
    const sourceHeight = Math.max(0, Math.round(Number(state?.sourceHeight) || 0));
    if (!sourceWidth || !sourceHeight) {
      return { valid: false, crops: [], error: "当前图片缺少原图尺寸，无法裁切。" };
    }
    try {
      const crops = state.mode === "free"
        ? [getFreeCrop(state)]
        : state.mode === "grid"
          ? getGridCrops(state)
          : [getRatioCrop(state)];
      const invalid = crops.find((crop) => (
        !Number.isFinite(crop.x)
        || !Number.isFinite(crop.y)
        || !Number.isFinite(crop.width)
        || !Number.isFinite(crop.height)
        || crop.width < 1
        || crop.height < 1
        || crop.x < 0
        || crop.y < 0
        || crop.x + crop.width > sourceWidth + 0.001
        || crop.y + crop.height > sourceHeight + 0.001
      ));
      if (invalid) {
        return {
          valid: false,
          crops: [],
          error: `裁切区域无效：第 ${invalid.row || 1} 行第 ${invalid.column || 1} 列必须至少为 1×1 像素。`,
        };
      }
      return { valid: true, crops, error: "" };
    } catch (error) {
      return { valid: false, crops: [], error: `裁切区域无效：${error.message || "未知错误"}` };
    }
  }

  return Object.freeze({
    RATIOS,
    createWorkbenchState,
    resolveAspectRatio,
    normalizeFreeRect,
    getRatioCrop,
    getFreeCrop,
    getGridCrops,
    validateCrops,
  });
});
