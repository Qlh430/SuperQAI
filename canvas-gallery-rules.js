(function initCanvasGalleryRules(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasGalleryRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasGalleryRules() {
  const DEFAULT_GAP = 16;
  const DEFAULT_CELL_WIDTH = 120;
  const MINIMUM_CELL_WIDTH = 96;
  const PREVIEW_INSET = 8;
  const HEADER_HEIGHT = 56;
  const FOOTER_HEIGHT = 32;
  const STANDARD_WIDTH = 292;

  function suggestedColumns(count) {
    const value = Math.max(0, Number(count) || 0);
    if (value <= 1) return 1;
    if (value <= 4) return 2;
    if (value <= 9) return 3;
    if (value <= 16) return 4;
    return 5;
  }

  function minimumWidthForColumns(columns, gap = DEFAULT_GAP) {
    // The preview surface insets 8px from the node shell and keeps 16px between
    // media cells (BENDO asset-group contract). The 96px cell floor is the
    // readable-thumbnail baseline for this project.
    const count = Math.max(1, Math.floor(Number(columns) || 1));
    const resolvedGap = Math.max(0, Number(gap) || 0);
    // The floor is the shared node width, so a resized asset group cannot drift
    // below the width every other node on the board uses.
    return Math.max(
      STANDARD_WIDTH,
      PREVIEW_INSET * 2 + count * MINIMUM_CELL_WIDTH + Math.max(0, count - 1) * resolvedGap,
    );
  }

  function freeGridLayout(options = {}) {
    const members = Array.isArray(options.members)
      ? options.members
      : Array.from({ length: Math.max(0, Number(options.count) || 0) }, () => ({}));
    const memberCount = members.length;
    const gap = Math.max(0, Number(options.gap) || DEFAULT_GAP);
    // Band geometry mirrors the node skeleton: title, status and preview inset.
    const defaultColumns = suggestedColumns(memberCount);
    const minWidth = Math.max(STANDARD_WIDTH, PREVIEW_INSET * 2 + MINIMUM_CELL_WIDTH);
    const defaultWidth = Math.max(
      STANDARD_WIDTH,
      PREVIEW_INSET * 2 + defaultColumns * DEFAULT_CELL_WIDTH + Math.max(0, defaultColumns - 1) * gap,
    );
    const layoutMode = options.layoutMode === "manual" ? "manual" : "default";
    const requestedHeight = Math.max(0, Number(options.height) || 0);
    const requestedManualColumns = Math.max(0, Math.floor(Number(options.manualColumns) || 0));
    const width = Math.max(
      minWidth,
      layoutMode === "manual" && Number(options.width) > 0 ? Number(options.width) : defaultWidth,
    );
    const contentWidth = Math.max(MINIMUM_CELL_WIDTH, width - PREVIEW_INSET * 2);
    const maximumColumns = Math.max(
      1,
      Math.floor((contentWidth + gap) / (MINIMUM_CELL_WIDTH + gap)),
    );
    const getLayoutForColumns = (columns) => {
      const rows = Math.max(1, Math.ceil(Math.max(1, memberCount) / columns));
      const cellWidth = Math.max(
        MINIMUM_CELL_WIDTH,
        (contentWidth - Math.max(0, columns - 1) * gap) / columns,
      );
      const rowHeights = Array.from({ length: rows }, () => 0);
      members.forEach((member, index) => {
        const sourceWidth = Number(member?.width);
        const sourceHeight = Number(member?.height);
        const ratio = sourceWidth > 0 && sourceHeight > 0 ? sourceHeight / sourceWidth : 1;
        const row = Math.floor(index / columns);
        rowHeights[row] = Math.max(rowHeights[row], Math.max(1, cellWidth * ratio));
      });
      if (!memberCount) rowHeights[0] = MINIMUM_CELL_WIDTH;
      const contentHeight = rowHeights.reduce((total, rowHeight) => total + rowHeight, 0)
        + Math.max(0, rows - 1) * gap;
      return {
        columns,
        rows,
        cellWidth,
        rowHeights,
        contentHeight,
        minHeight: HEADER_HEIGHT + FOOTER_HEIGHT + PREVIEW_INSET * 2 + contentHeight,
      };
    };
    const availableColumns = Math.min(maximumColumns, Math.max(1, memberCount));
    let resolved;
    if (
      layoutMode === "manual"
      && requestedHeight > 0
      && (options.resizeAxis === "height" || requestedManualColumns > 0)
    ) {
      const currentColumns = requestedManualColumns
        ? Math.min(availableColumns, requestedManualColumns)
        : availableColumns;
      const firstCandidate = Math.max(1, currentColumns - 1);
      const lastCandidate = Math.min(availableColumns, currentColumns + 1);
      resolved = Array.from(
        { length: lastCandidate - firstCandidate + 1 },
        (_, index) => getLayoutForColumns(firstCandidate + index),
      ).reduce((best, candidate) => (
        Math.abs(candidate.minHeight - requestedHeight) < Math.abs(best.minHeight - requestedHeight)
          ? candidate
          : best
      ));
    } else {
      const resolvedColumns = layoutMode === "manual"
        ? (requestedManualColumns ? Math.min(availableColumns, requestedManualColumns) : availableColumns)
        : Math.min(maximumColumns, defaultColumns);
      resolved = getLayoutForColumns(resolvedColumns);
    }
    const { columns, rows, cellWidth, rowHeights, contentHeight, minHeight } = resolved;
    return {
      columns,
      rows,
      cellWidth,
      cellHeight: Math.max(...rowHeights),
      rowHeights,
      gap,
      inset: PREVIEW_INSET,
      contentWidth,
      contentHeight,
      minWidth,
      minHeight,
      width,
      height: minHeight,
    };
  }

  function containerLayout(count, gap = 10, preferredColumns = null) {
    const columns = Number.isInteger(Number(preferredColumns)) && Number(preferredColumns) > 0
      ? Math.min(5, Number(preferredColumns))
      : suggestedColumns(Math.max(0, Number(count) || 0));
    const rows = Math.max(1, Math.ceil(Math.max(1, Number(count) || 0) / columns));
    const cellSize = DEFAULT_CELL_WIDTH;
    const resolvedGap = DEFAULT_GAP;
    const padding = 0;
    const chrome = 68;
    return {
      columns,
      rows,
      cellSize,
      gap: resolvedGap,
      width: columns * cellSize + Math.max(0, columns - 1) * resolvedGap + padding,
      minHeight: chrome,
    };
  }

  function shouldRenderMemberOutput(memberCount) {
    return Number(memberCount) > 1;
  }

  function memberColumnIndices(members, columns, cellSize = DEFAULT_CELL_WIDTH) {
    const count = Math.max(1, Math.floor(Number(columns) || 1));
    const width = Math.max(1, Number(cellSize) || DEFAULT_CELL_WIDTH);
    const columnHeights = Array.from({ length: count }, () => 0);
    return (Array.isArray(members) ? members : []).map((member) => {
      const sourceWidth = Number(member?.width);
      const sourceHeight = Number(member?.height);
      const estimatedHeight = sourceWidth > 0 && sourceHeight > 0
        ? width * (sourceHeight / sourceWidth)
        : width;
      let target = 0;
      for (let index = 1; index < columnHeights.length; index += 1) {
        if (columnHeights[index] < columnHeights[target]) target = index;
      }
      columnHeights[target] += Math.max(1, estimatedHeight);
      return target;
    });
  }

  return Object.freeze({
    DEFAULT_GAP,
    DEFAULT_CELL_WIDTH,
    MINIMUM_CELL_WIDTH,
    PREVIEW_INSET,
    suggestedColumns,
    minimumWidthForColumns,
    freeGridLayout,
    containerLayout,
    shouldRenderMemberOutput,
    memberColumnIndices,
  });
});
