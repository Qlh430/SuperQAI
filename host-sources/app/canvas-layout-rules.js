(function initCanvasLayoutRules(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasLayoutRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasLayoutRules() {
  const COLUMN_GAP = 96;
  const ROW_GAP = 48;
  const BAND_GAP = 132;
  const MIN_COLUMN_BUDGET = 4;
  const MAX_COLUMN_BUDGET = 10;
  const FALLBACK_SIZE = Object.freeze({ width: 292, height: 180 });

  function finiteNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function positiveNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  function compareIds(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
  }

  function compareBlocks(left, right) {
    if (left.y !== right.y) return left.y - right.y;
    if (left.x !== right.x) return left.x - right.x;
    return compareIds(left.id, right.id);
  }

  // A long chain would otherwise become one endless row. The column budget
  // keeps the result roughly square by wrapping the flow into bands, the same
  // way a text editor wraps a long line.
  function defaultColumnBudget(count) {
    const target = Math.ceil(Math.sqrt(Math.max(1, count)));
    return Math.max(MIN_COLUMN_BUDGET, Math.min(MAX_COLUMN_BUDGET, target));
  }

  function chunk(items, size) {
    const bands = [];
    for (let index = 0; index < items.length; index += size) {
      bands.push(items.slice(index, index + size));
    }
    return bands;
  }

  // Blocks are already-sized rectangles. Anything unusable is dropped rather
  // than guessed at, so a corrupt model can never produce an overlap.
  function normalizeBlocks(blocks) {
    const list = [];
    const seen = new Set();
    (Array.isArray(blocks) ? blocks : []).forEach((block) => {
      const id = String(block?.id ?? "").trim();
      if (!id || seen.has(id)) return;
      const width = positiveNumber(block?.width, 0) || FALLBACK_SIZE.width;
      const height = positiveNumber(block?.height, 0) || FALLBACK_SIZE.height;
      if (!Number.isFinite(Number(block?.x)) || !Number.isFinite(Number(block?.y))) return;
      seen.add(id);
      list.push({
        id,
        x: Number(block.x),
        y: Number(block.y),
        width,
        height,
      });
    });
    return list;
  }

  function normalizeLinks(links, ids) {
    const pairs = [];
    const seen = new Set();
    (Array.isArray(links) ? links : []).forEach((link) => {
      const from = String(link?.from ?? "").trim();
      const to = String(link?.to ?? "").trim();
      if (!from || !to || from === to) return;
      if (!ids.has(from) || !ids.has(to)) return;
      const key = `${from}\u0000${to}`;
      if (seen.has(key)) return;
      seen.add(key);
      pairs.push([from, to]);
    });
    return pairs;
  }

  function buildGraph(pairs) {
    const outgoing = new Map();
    const incoming = new Map();
    pairs.forEach(([from, to]) => {
      if (!outgoing.has(from)) outgoing.set(from, []);
      if (!incoming.has(to)) incoming.set(to, []);
      outgoing.get(from).push(to);
      incoming.get(to).push(from);
    });
    return { outgoing, incoming };
  }

  // Undirected components decide which nodes belong to the same flow. A
  // component without links holds a single loose node.
  function collectComponents(blocks, pairs) {
    const neighbors = new Map(blocks.map((block) => [block.id, []]));
    pairs.forEach(([from, to]) => {
      neighbors.get(from).push(to);
      neighbors.get(to).push(from);
    });
    const visited = new Set();
    const components = [];
    blocks.forEach((block) => {
      if (visited.has(block.id)) return;
      visited.add(block.id);
      const stack = [block.id];
      const ids = [];
      let hasLinks = false;
      while (stack.length) {
        const id = stack.pop();
        ids.push(id);
        neighbors.get(id).forEach((next) => {
          hasLinks = true;
          if (visited.has(next)) return;
          visited.add(next);
          stack.push(next);
        });
      }
      components.push({ ids, hasLinks });
    });
    return components;
  }

  // Kahn layers with a deterministic fallback for cycles: every node still
  // reaches a column, back edges are ignored and the loop always terminates.
  function assignLevels(ids, graph, byId) {
    const scope = new Set(ids);
    const level = new Map();
    const indegree = new Map();
    ids.forEach((id) => {
      indegree.set(id, (graph.incoming.get(id) || []).filter((source) => scope.has(source)).length);
    });
    const queue = ids.filter((id) => indegree.get(id) === 0);
    queue.forEach((id) => level.set(id, 0));
    for (let index = 0; index < queue.length; index += 1) {
      const id = queue[index];
      const current = level.get(id) ?? 0;
      (graph.outgoing.get(id) || []).forEach((target) => {
        if (!scope.has(target)) return;
        level.set(target, Math.max(level.get(target) ?? 0, current + 1));
        const remaining = (indegree.get(target) || 0) - 1;
        indegree.set(target, remaining);
        if (remaining === 0) queue.push(target);
      });
    }
    // Cycle leftovers are walked in the same top-to-bottom order the board
    // already shows, so breaking the loop keeps the familiar reading order.
    ids.filter((id) => !level.has(id))
      .sort((left, right) => compareBlocks(byId.get(left), byId.get(right)))
      .forEach((id) => {
      const sources = (graph.incoming.get(id) || []).filter((source) => scope.has(source) && level.has(source));
      level.set(id, sources.length ? Math.max(...sources.map((source) => level.get(source) + 1)) : 0);
    });
    return level;
  }

  // One connected flow becomes a left-to-right block of columns; columns past
  // the budget wrap into the next band instead of stretching the board.
  function layoutFlowComponent(ids, byId, graph, gaps, columnBudget) {
    const levels = assignLevels(ids, graph, byId);
    const columns = new Map();
    ids.forEach((id) => {
      const level = levels.get(id) ?? 0;
      if (!columns.has(level)) columns.set(level, []);
      columns.get(level).push(id);
    });
    const positions = {};
    const columnIds = [];
    const orderedLevels = [...columns.keys()].sort((left, right) => left - right);
    let bandTop = 0;
    let width = 0;
    chunk(orderedLevels, columnBudget).forEach((bandLevels) => {
      let cursorX = 0;
      let bandHeight = 0;
      bandLevels.forEach((level) => {
        const column = columns.get(level).map((id) => byId.get(id)).sort(compareBlocks);
        let cursorY = bandTop;
        let columnWidth = 0;
        column.forEach((block) => {
          positions[block.id] = { x: cursorX, y: cursorY };
          cursorY += block.height + gaps.row;
          columnWidth = Math.max(columnWidth, block.width);
        });
        bandHeight = Math.max(bandHeight, Math.max(0, cursorY - gaps.row - bandTop));
        cursorX += columnWidth + gaps.column;
        columnIds.push(column.map((block) => block.id));
      });
      width = Math.max(width, Math.max(0, cursorX - gaps.column));
      bandTop += bandHeight + gaps.band;
    });
    return { positions, width, height: Math.max(0, bandTop - gaps.band), columns: columnIds };
  }

  // Loose nodes become one grid block so a handful of stray uploads does not
  // stretch the board into a single extremely tall column.
  function layoutLooseComponent(ids, byId, gaps, requestedColumns, columnBudget) {
    const list = ids.map((id) => byId.get(id)).filter(Boolean).sort(compareBlocks);
    const count = list.length;
    const columnCount = Math.max(1, Math.min(
      count,
      columnBudget,
      Math.round(positiveNumber(requestedColumns, Math.ceil(Math.sqrt(count)))),
    ));
    const cellWidth = Math.max(...list.map((block) => block.width));
    const cellHeight = Math.max(...list.map((block) => block.height));
    const positions = {};
    list.forEach((block, index) => {
      const column = index % columnCount;
      const row = Math.floor(index / columnCount);
      positions[block.id] = {
        x: column * (cellWidth + gaps.column),
        y: row * (cellHeight + gaps.row),
      };
    });
    const rows = Math.ceil(count / columnCount);
    return {
      positions,
      width: columnCount * cellWidth + (columnCount - 1) * gaps.column,
      height: rows * cellHeight + (rows - 1) * gaps.row,
      columns: [],
    };
  }

  function anchorOf(ids, byId) {
    return ids.reduce((anchor, id) => {
      const block = byId.get(id);
      if (!block) return anchor;
      return { x: Math.min(anchor.x, block.x), y: Math.min(anchor.y, block.y) };
    }, { x: Infinity, y: Infinity });
  }

  function planCanvasLayout(options = {}) {
    const blocks = normalizeBlocks(options.blocks);
    if (!blocks.length) return { positions: {}, bounds: null, columns: [], blocks: [] };
    const byId = new Map(blocks.map((block) => [block.id, block]));
    const gaps = {
      column: positiveNumber(options.columnGap, COLUMN_GAP),
      row: positiveNumber(options.rowGap, ROW_GAP),
      band: positiveNumber(options.bandGap, BAND_GAP),
    };
    const pairs = normalizeLinks(options.links, new Set(byId.keys()));
    const graph = buildGraph(pairs);
    const components = collectComponents(blocks, pairs);
    const columnBudget = Math.max(
      1,
      Math.round(positiveNumber(options.maxColumns, defaultColumnBudget(blocks.length))),
    );

    // Flow groups are ordered by where they already sit on the board so the
    // result matches the user's reading order; loose nodes land on the right.
    const flows = components
      .filter((component) => component.hasLinks)
      .map((component) => ({ ids: component.ids, anchor: anchorOf(component.ids, byId) }))
      .sort((left, right) => (left.anchor.y - right.anchor.y) || (left.anchor.x - right.anchor.x))
      .map((entry) => layoutFlowComponent(entry.ids, byId, graph, gaps, columnBudget));
    const looseIds = components
      .filter((component) => !component.hasLinks)
      .flatMap((component) => component.ids);
    if (looseIds.length) {
      flows.push(layoutLooseComponent(looseIds, byId, gaps, options.looseColumns, columnBudget));
    }

    const originX = Number.isFinite(Number(options.origin?.x))
      ? Number(options.origin.x)
      : Math.min(...blocks.map((block) => block.x));
    const originY = Number.isFinite(Number(options.origin?.y))
      ? Number(options.origin.y)
      : Math.min(...blocks.map((block) => block.y));

    const positions = {};
    const columns = [];
    let cursorX = originX;
    let bottom = originY;
    flows.forEach((layout) => {
      Object.entries(layout.positions).forEach(([id, point]) => {
        positions[id] = { x: cursorX + point.x, y: originY + point.y };
      });
      layout.columns.forEach((column) => columns.push(column));
      bottom = Math.max(bottom, originY + layout.height);
      cursorX += layout.width + gaps.column;
    });
    const right = Math.max(cursorX - gaps.column, originX);
    return {
      positions,
      bounds: { left: originX, top: originY, right, bottom },
      columns,
      blocks,
    };
  }

  return Object.freeze({
    COLUMN_GAP,
    ROW_GAP,
    BAND_GAP,
    MIN_COLUMN_BUDGET,
    MAX_COLUMN_BUDGET,
    FALLBACK_SIZE,
    defaultColumnBudget,
    planCanvasLayout,
  });
});
