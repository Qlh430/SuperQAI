(function initCanvasGridEditorRules(root, factory) {
  const api = factory(root?.GridSlicingRules);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasGridEditorRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasGridEditorRules(GridSlicingRules) {
  if (!GridSlicingRules) {
    throw new Error("Grid slicing rules must load before canvas grid editor rules.");
  }

  function createState({ source = {}, sourceNodeId = "", width, height, rows, columns } = {}) {
    const layout = GridSlicingRules.createGridLayout(width, height, rows, columns, 0);
    return {
      version: 1,
      sourceNodeId: String(sourceNodeId || ""),
      sourceSrc: source.savedUrl || source.src || source.url || "",
      sourceName: source.name || "宫格来源.png",
      sourceWidth: Math.round(width),
      sourceHeight: Math.round(height),
      rows: layout.spec.rows,
      columns: layout.spec.columns,
      aspect: "match",
      uniformGap: 0,
      horizontalBands: layout.horizontalBands,
      verticalBands: layout.verticalBands,
      cellTransforms: GridSlicingRules.normalizeCellTransforms(layout.regions, []),
      selectedCellKey: layout.regions[0]?.key || "",
      selectedBand: null,
      editing: false,
      collapsed: false,
    };
  }

  function normalizeState(value = {}) {
    const sourceWidth = Math.max(0, Math.round(Number(value.sourceWidth) || 0));
    const sourceHeight = Math.max(0, Math.round(Number(value.sourceHeight) || 0));
    const spec = GridSlicingRules.normalizeGridSpec(value.rows, value.columns);
    const aspect = ["match", "16:9", "9:16", "3:4", "4:3", "1:1"].includes(value.aspect)
      ? value.aspect
      : "match";
    const requestedGap = Math.max(0, Math.round(Number(value.uniformGap) || 0));
    const uniformGap = requestedGap - (requestedGap % 2);
    if (!value.sourceSrc || !sourceWidth || !sourceHeight) {
      return {
        version: 1,
        sourceNodeId: String(value.sourceNodeId || ""),
        sourceSrc: "",
        sourceName: "",
        sourceWidth: 0,
        sourceHeight: 0,
        rows: spec.rows,
        columns: spec.columns,
        aspect,
        uniformGap,
        horizontalBands: [],
        verticalBands: [],
        cellTransforms: [],
        selectedCellKey: "",
        selectedBand: null,
        editing: false,
        collapsed: Boolean(value.collapsed),
      };
    }
    const layout = GridSlicingRules.createGridLayout(
      sourceWidth,
      sourceHeight,
      spec.rows,
      spec.columns,
      uniformGap,
    );
    let horizontalBands = Array.isArray(value.horizontalBands)
      && value.horizontalBands.length === spec.rows - 1
      ? value.horizontalBands
      : layout.horizontalBands;
    let verticalBands = Array.isArray(value.verticalBands)
      && value.verticalBands.length === spec.columns - 1
      ? value.verticalBands
      : layout.verticalBands;
    let regions;
    try {
      regions = GridSlicingRules.getSliceRegions(sourceWidth, sourceHeight, verticalBands, horizontalBands)
        .map((region) => ({ ...region, key: `r${region.row}-c${region.column}` }));
    } catch {
      horizontalBands = layout.horizontalBands;
      verticalBands = layout.verticalBands;
      regions = layout.regions;
    }
    return {
      version: 1,
      sourceNodeId: String(value.sourceNodeId || ""),
      sourceSrc: String(value.sourceSrc || ""),
      sourceName: String(value.sourceName || "宫格来源.png"),
      sourceWidth,
      sourceHeight,
      rows: spec.rows,
      columns: spec.columns,
      aspect,
      uniformGap,
      horizontalBands,
      verticalBands,
      cellTransforms: GridSlicingRules.normalizeCellTransforms(regions, value.cellTransforms),
      selectedCellKey: regions.some((region) => region.key === value.selectedCellKey)
        ? value.selectedCellKey
        : regions[0]?.key || "",
      selectedBand: value.selectedBand || null,
      editing: Boolean(value.editing),
      collapsed: Boolean(value.collapsed),
    };
  }

  function getRegions(state) {
    if (!state?.sourceWidth || !state?.sourceHeight) return [];
    return GridSlicingRules.getSliceRegions(
      state.sourceWidth,
      state.sourceHeight,
      state.verticalBands,
      state.horizontalBands,
    ).map((region) => ({ ...region, key: `r${region.row}-c${region.column}` }));
  }

  function createTrackTemplate(regions, bands, axis) {
    const firstLine = regions.filter((region) => axis === "vertical" ? region.row === 1 : region.column === 1);
    const tracks = [];
    firstLine.forEach((region, index) => {
      tracks.push(`${axis === "vertical" ? region.width : region.height}fr`);
      const band = bands[index];
      if (band) tracks.push(`${Math.max(0, band.end - band.start)}fr`);
    });
    return tracks.join(" ");
  }

  return Object.freeze({
    createState,
    normalizeState,
    getRegions,
    createTrackTemplate,
  });
});
