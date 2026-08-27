(function initGridSlicingRules(globalScope, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (globalScope) globalScope.GridSlicingRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createGridSlicingRules() {
  const MAX_LINES = 4;
  const MAX_GRID_SIZE = 5;
  const CELL_ZOOM_MIN = 1;
  const CELL_ZOOM_MAX = 8;
  const BAND_CENTER = Symbol("grid-slicing-band-center");

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeLength(value) {
    const length = Math.round(Number(value));
    if (!Number.isFinite(length) || length < 1) throw new Error("Invalid image length.");
    return length;
  }

  function normalizeCount(value) {
    return clamp(Math.round(Number(value) || 0), 0, MAX_LINES);
  }

  function normalizeGap(value) {
    const gap = Math.max(0, Math.round(Number(value) || 0));
    return gap - (gap % 2);
  }

  function getBandCenter(band) {
    const stored = band?.[BAND_CENTER];
    if (Number.isFinite(stored)) return stored;
    return (Number(band?.start) + Number(band?.end)) / 2;
  }

  function withBandCenter(band, centerValue) {
    const fallback = (Number(band?.start) + Number(band?.end)) / 2;
    const center = Number(centerValue);
    Object.defineProperty(band, BAND_CENTER, {
      value: Number.isFinite(center) ? center : fallback,
      enumerable: false,
      configurable: true,
    });
    return band;
  }

  function getCenter(band) {
    return getBandCenter(band);
  }

  function sortBands(bands) {
    return (Array.isArray(bands) ? bands : [])
      .map((band, index) => withBandCenter({
        id: String(band?.id || `line-${index + 1}`),
        start: Math.round(Number(band?.start) || 0),
        end: Math.round(Number(band?.end) || 0),
        override: Boolean(band?.override),
      }, getCenter(band)))
      .sort((left, right) => getCenter(left) - getCenter(right));
  }

  function makeCenteredBand(id, center, gap, override) {
    const width = normalizeGap(gap);
    const logicalCenter = Number(center);
    const start = Math.round(logicalCenter - width / 2);
    return withBandCenter(
      { id: String(id), start, end: start + width, override: Boolean(override) },
      logicalCenter,
    );
  }

  function bandsAreValid(length, bands) {
    let cursor = 0;
    for (const band of bands) {
      if (band.start < cursor + 1 || band.end < band.start || band.end > length - 1) return false;
      cursor = band.end;
    }
    return length - cursor >= 1;
  }

  function applyUniformGap(lengthValue, bandsValue, gapValue) {
    const length = normalizeLength(lengthValue);
    const bands = sortBands(bandsValue);
    let gap = normalizeGap(gapValue);
    while (gap > 0) {
      const next = bands.map((band) => makeCenteredBand(band.id, getCenter(band), gap, false));
      if (bandsAreValid(length, next)) return next;
      gap -= 2;
    }
    return bands.map((band) => makeCenteredBand(band.id, clamp(Math.round(getCenter(band)), 1, length - 1), 0, false));
  }

  function createEvenBands(lengthValue, countValue, gapValue = 0, prefix = "line") {
    const length = normalizeLength(lengthValue);
    const count = Math.min(normalizeCount(countValue), length - 1);
    const bands = Array.from({ length: count }, (_, index) => {
      const center = Math.round((length * (index + 1)) / (count + 1));
      return makeCenteredBand(`${prefix}-${index + 1}`, center, 0, false);
    });
    return applyUniformGap(length, bands, gapValue);
  }

  function getTargetContext(lengthValue, bandsValue, id) {
    const length = normalizeLength(lengthValue);
    const bands = sortBands(bandsValue);
    const index = bands.findIndex((band) => band.id === String(id));
    if (index < 0) return null;
    return {
      length,
      bands,
      index,
      band: bands[index],
      lower: index > 0 ? bands[index - 1].end + 1 : 1,
      upper: index < bands.length - 1 ? bands[index + 1].start - 1 : length - 1,
    };
  }

  function replaceTarget(context, nextBand) {
    const next = context.bands.slice();
    next[context.index] = nextBand;
    return next;
  }

  function moveBand(length, bands, id, centerValue) {
    const context = getTargetContext(length, bands, id);
    if (!context) return sortBands(bands);
    const width = context.band.end - context.band.start;
    const maxWidth = Math.max(0, context.upper - context.lower);
    const nextWidth = Math.min(width, maxWidth);
    const requestedCenter = Number(centerValue);
    const desiredStart = Math.round(requestedCenter - nextWidth / 2);
    const start = clamp(desiredStart, context.lower, context.upper - nextWidth);
    const logicalCenter = start === desiredStart ? requestedCenter : start + nextWidth / 2;
    return replaceTarget(context, withBandCenter({
      ...context.band,
      start,
      end: start + nextWidth,
      override: true,
    }, logicalCenter));
  }

  function setBandGap(length, bands, id, gapValue) {
    const context = getTargetContext(length, bands, id);
    if (!context) return sortBands(bands);
    const availableWidth = normalizeGap(Math.max(0, context.upper - context.lower));
    const width = Math.min(normalizeGap(gapValue), availableWidth);
    const previousCenter = getCenter(context.band);
    const desiredStart = Math.round(previousCenter - width / 2);
    const start = clamp(desiredStart, context.lower, context.upper - width);
    const logicalCenter = start === desiredStart ? previousCenter : start + width / 2;
    return replaceTarget(context, withBandCenter({
      ...context.band,
      start,
      end: start + width,
      override: true,
    }, logicalCenter));
  }

  function resizeBandEdge(length, bands, id, edge, coordinateValue) {
    const context = getTargetContext(length, bands, id);
    if (!context) return sortBands(bands);
    const coordinate = Math.round(Number(coordinateValue));
    const next = { ...context.band, override: true };
    if (edge === "start") {
      const requestedStart = clamp(coordinate, context.lower, next.end);
      const width = normalizeGap(next.end - requestedStart);
      next.start = Math.max(context.lower, next.end - width);
    } else if (edge === "end") {
      const requestedEnd = clamp(coordinate, next.start, context.upper);
      const width = normalizeGap(requestedEnd - next.start);
      next.end = Math.min(context.upper, next.start + width);
    }
    return replaceTarget(context, withBandCenter(next, (next.start + next.end) / 2));
  }

  function getRegions(lengthValue, bandsValue) {
    const length = normalizeLength(lengthValue);
    const bands = sortBands(bandsValue);
    if (!bandsAreValid(length, bands)) throw new Error("Invalid slicing bands.");
    const regions = [];
    let cursor = 0;
    bands.forEach((band) => {
      regions.push({ start: cursor, end: band.start, size: band.start - cursor });
      cursor = band.end;
    });
    regions.push({ start: cursor, end: length, size: length - cursor });
    return regions;
  }

  function getSliceRegions(widthValue, heightValue, verticalBands, horizontalBands) {
    const columns = getRegions(widthValue, verticalBands);
    const rows = getRegions(heightValue, horizontalBands);
    const slices = [];
    rows.forEach((row, rowIndex) => {
      columns.forEach((column, columnIndex) => {
        slices.push({
          row: rowIndex + 1,
          column: columnIndex + 1,
          x: column.start,
          y: row.start,
          width: column.size,
          height: row.size,
        });
      });
    });
    return slices;
  }

  function normalizeGridSpec(rowsValue, columnsValue) {
    return {
      rows: clamp(Math.round(Number(rowsValue) || 1), 1, MAX_GRID_SIZE),
      columns: clamp(Math.round(Number(columnsValue) || 1), 1, MAX_GRID_SIZE),
    };
  }

  function createGridLayout(widthValue, heightValue, rowsValue, columnsValue, gapValue = 0) {
    const width = normalizeLength(widthValue);
    const height = normalizeLength(heightValue);
    const spec = normalizeGridSpec(rowsValue, columnsValue);
    const horizontalBands = createEvenBands(height, spec.rows - 1, gapValue, "h");
    const verticalBands = createEvenBands(width, spec.columns - 1, gapValue, "v");
    const regions = getSliceRegions(width, height, verticalBands, horizontalBands)
      .map((region) => ({ ...region, key: `r${region.row}-c${region.column}` }));
    return { spec, horizontalBands, verticalBands, regions };
  }

  function resolveAspectRatio(value, context = {}) {
    const ratios = {
      "16:9": 16 / 9,
      "9:16": 9 / 16,
      "3:4": 3 / 4,
      "4:3": 4 / 3,
      "1:1": 1,
    };
    if (ratios[value]) return ratios[value];
    const width = normalizeLength(context.width);
    const height = normalizeLength(context.height);
    const spec = normalizeGridSpec(context.rows, context.columns);
    return (width / spec.columns) / (height / spec.rows);
  }

  function normalizeCellTransform(region, transform = {}) {
    const rawCenterX = Number(transform.centerX);
    const rawCenterY = Number(transform.centerY);
    const rawZoom = Number(transform.zoom);
    return {
      key: String(region.key || transform.key || ""),
      centerX: clamp(Number.isFinite(rawCenterX) ? rawCenterX : 0.5, 0, 1),
      centerY: clamp(Number.isFinite(rawCenterY) ? rawCenterY : 0.5, 0, 1),
      zoom: clamp(Number.isFinite(rawZoom) ? rawZoom : 1, CELL_ZOOM_MIN, CELL_ZOOM_MAX),
    };
  }

  function normalizeCellTransforms(regionsValue, transformsValue) {
    const transforms = new Map(
      (Array.isArray(transformsValue) ? transformsValue : [])
        .filter((transform) => transform && transform.key)
        .map((transform) => [String(transform.key), transform]),
    );
    return (Array.isArray(regionsValue) ? regionsValue : []).map((region) => (
      normalizeCellTransform(region, transforms.get(String(region.key)))
    ));
  }

  function getCellCrop(region, aspectRatioValue, transformValue = {}) {
    const ratio = Math.max(0.0001, Number(aspectRatioValue) || 1);
    const transform = normalizeCellTransform(region, transformValue);
    const fitWidth = Math.min(region.width, region.height * ratio);
    const fitHeight = fitWidth / ratio;
    const width = fitWidth / transform.zoom;
    const height = fitHeight / transform.zoom;
    const desiredX = region.x + transform.centerX * region.width - width / 2;
    const desiredY = region.y + transform.centerY * region.height - height / 2;
    return {
      key: region.key,
      row: region.row,
      column: region.column,
      x: clamp(desiredX, region.x, region.x + region.width - width),
      y: clamp(desiredY, region.y, region.y + region.height - height),
      width,
      height,
      ...transform,
    };
  }

  function getCommonOutputSize(cropsValue, aspectRatioValue) {
    const crops = Array.isArray(cropsValue) ? cropsValue : [];
    if (!crops.length) throw new Error("Grid crop output is empty.");
    const ratio = Math.max(0.0001, Number(aspectRatioValue) || 1);
    const maxWidth = Math.floor(Math.min(...crops.map((crop) => Number(crop.width) || 0)));
    const maxHeight = Math.floor(Math.min(...crops.map((crop) => Number(crop.height) || 0)));
    const height = Math.min(maxHeight, Math.floor(maxWidth / ratio));
    const width = Math.floor(height * ratio);
    if (width < 1 || height < 1) throw new Error("Grid crop output is too small.");
    return { width, height };
  }

  return {
    MAX_LINES,
    MAX_GRID_SIZE,
    CELL_ZOOM_MIN,
    CELL_ZOOM_MAX,
    getBandCenter,
    createEvenBands,
    applyUniformGap,
    moveBand,
    resizeBandEdge,
    setBandGap,
    getRegions,
    getSliceRegions,
    normalizeGridSpec,
    createGridLayout,
    resolveAspectRatio,
    getCellCrop,
    getCommonOutputSize,
    normalizeCellTransforms,
  };
});
