(function initCanvasRepresentationManager(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CanvasRepresentationManager = api.CanvasRepresentationManager;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCanvasRepresentationManager() {
  const SAMPLE_LIMIT = 512;
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const budget = (value, fallback) => Math.max(0, Math.floor(finite(value, fallback)));
  const compare = (a, b) => a.distance - b.distance || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const emptyMetrics = () => ({ count: 0, peak: 0, samples: [], cursor: 0 });

  class CanvasRepresentationManager {
    constructor({
      getFlags = () => ({}),
      now = () => typeof performance !== 'undefined' ? performance.now() : Date.now(),
      onSchedule = () => {},
      fullBudget = 5,
      lightBudget = 8,
      demoteDelay = 500,
    } = {}) {
      this.getFlags = getFlags;
      this.now = now;
      this.onSchedule = onSchedule;
      this.fullBudget = budget(fullBudget, 5);
      this.lightBudget = budget(lightBudget, 8);
      this.demoteDelay = Math.max(0, finite(demoteDelay, 500));
      this.levels = new Map();
      this.demoteAt = new Map();
      this.timer = null;
      this.reset();
    }

    clearBoardState() {
      if (this.timer !== null) clearTimeout(this.timer);
      this.timer = null;
      this.levels.clear();
      this.demoteAt.clear();
      this.visibleCount = 0;
      this.protectedCount = 0;
      this.protectedExceptions = 0;
      this.protectedReasons = {};
      this.protectedExceptionsByReason = {};
      this.activeFullBudget = this.fullBudget;
    }

    reset() {
      this.clearBoardState();
      this.planCount = 0;
      this.transitions = { hydrate: emptyMetrics(), dehydrate: emptyMetrics() };
    }

    scheduleAt(deadline, time) {
      if (this.timer !== null) clearTimeout(this.timer);
      this.timer = null;
      if (!Number.isFinite(deadline)) return;
      this.timer = setTimeout(() => {
        this.timer = null;
        this.onSchedule();
      }, Math.max(1, deadline - time));
      // Diagnostics alone must not keep a Node process alive.
      if (typeof this.timer?.unref === 'function') this.timer.unref();
    }

    plan({
      visibleIds = [], viewport = {}, store,
      protectedReasons = new Map(), selectedIds = new Set(),
      primaryId = null, hoveredId = null, interacting = false,
    } = {}) {
      const flags = this.getFlags() || {};
      if (['representationManager', 'detailHydration', 'detailCulling'].some(key => flags[key] === false)) {
        this.clearBoardState();
        return null;
      }
      this.planCount++;
      const time = this.now();
      const scale = Math.max(0.001, finite(viewport.scale, 1));
      const centerX = (finite(viewport.width) / 2 - finite(viewport.x)) / scale;
      const centerY = (finite(viewport.height) / 2 - finite(viewport.y)) / scale;
      const visible = new Set(Array.from(visibleIds, String));
      const selected = new Set(Array.from(selectedIds, String));
      const protectedRows = new Map();
      const rows = new Map();
      const read = id => {
        if (rows.has(id)) return rows.get(id);
        const model = store?.get(id);
        if (!model) return null;
        const rect = store.getRect?.(id);
        const left = finite(rect?.left, finite(model.x));
        const top = finite(rect?.top, finite(model.y));
        const width = Math.max(0, finite(rect?.right, left + finite(model.width)) - left);
        const height = Math.max(0, finite(rect?.bottom, top + finite(model.height)) - top);
        const row = {
          id, kind: model.kind, width: width * scale,
          distance: (left + width / 2 - centerX) ** 2 + (top + height / 2 - centerY) ** 2,
        };
        rows.set(id, row);
        return row;
      };
      visible.forEach(read);
      protectedReasons.forEach((reasons, rawId) => {
        const id = String(rawId);
        const meaningful = Array.from(new Set((Array.isArray(reasons) ? reasons : []).filter(reason => typeof reason === 'string' && reason.length)));
        if (meaningful.length && read(id)) protectedRows.set(id, meaningful);
      });
      // Selection is visual state. Full is requested only by an interaction
      // intent or an unsafe active operation supplied through protectedReasons.

      const nextLevels = new Map();
      const desired = new Map();
      const sortedProtected = [...protectedRows.keys()].map(read).sort(compare);
      this.activeFullBudget = interacting ? Math.max(this.fullBudget, 8) : this.fullBudget;
      this.protectedCount = sortedProtected.length;
      this.protectedExceptions = Math.max(0, this.protectedCount - this.activeFullBudget);
      this.protectedReasons = {};
      this.protectedExceptionsByReason = {};
      sortedProtected.forEach((row, index) => {
        desired.set(row.id, 'full');
        nextLevels.set(row.id, 'full');
        this.demoteAt.delete(row.id);
        protectedRows.get(row.id).forEach(reason => {
          this.protectedReasons[reason] = (this.protectedReasons[reason] || 0) + 1;
          if (index >= this.activeFullBudget) {
            this.protectedExceptionsByReason[reason] = (this.protectedExceptionsByReason[reason] || 0) + 1;
          }
        });
      });

      const grace = [];
      this.levels.forEach((level, id) => {
        if (level !== 'full' || protectedRows.has(id) || !read(id)) return;
        if (!this.demoteAt.has(id)) this.demoteAt.set(id, time + this.demoteDelay);
        if (this.demoteAt.get(id) > time) grace.push(read(id));
      });
      grace.sort(compare).slice(0, Math.max(0, this.activeFullBudget - desired.size)).forEach(row => {
        desired.set(row.id, 'full');
        nextLevels.set(row.id, 'full');
      });
      let nextDeadline = Infinity;
      this.demoteAt.forEach((deadline, id) => {
        if (desired.get(id) !== 'full' || protectedRows.has(id)) this.demoteAt.delete(id);
        else nextDeadline = Math.min(nextDeadline, deadline);
      });

      const light = [];
      visible.forEach(id => {
        const row = read(id);
        if (!row || desired.get(id) === 'full') return;
        const previous = this.levels.get(id);
        const rich = row.width >= (previous === 'canvas-rich' || previous === 'light' ? 120 : 140);
        // Group shells must remain transparent to their member nodes. Their
        // membership/layout controls are available only through protected Full.
        const lightEligible = row.kind !== 'group';
        // Hover is a small interaction overlay (ports/tooling), not a request
        // to replace the stable media renderer with a different representation.
        nextLevels.set(id, rich ? 'canvas-rich' : 'canvas');
        if (lightEligible && row.width >= (previous === 'light' ? 220 : 260)) light.push(row);
      });
      light.sort(compare).slice(0, this.lightBudget).forEach(row => {
        desired.set(row.id, 'light');
        nextLevels.set(row.id, 'light');
      });
      this.levels = nextLevels;
      this.visibleCount = [...visible].filter(id => rows.has(id)).length;
      this.scheduleAt(nextDeadline, time);
      return desired;
    }

    recordTransition(kind, ms) {
      const metric = this.transitions[kind];
      if (!metric || !Number.isFinite(ms) || ms < 0) return;
      metric.count++;
      metric.peak = Math.max(metric.peak, ms);
      if (metric.samples.length < SAMPLE_LIMIT) metric.samples.push(ms);
      else {
        metric.samples[metric.cursor] = ms;
        metric.cursor = (metric.cursor + 1) % SAMPLE_LIMIT;
      }
    }

    snapshot() {
      const levels = { full: 0, light: 0, canvas: 0, canvasRich: 0 };
      this.levels.forEach(level => {
        const key = level === 'canvas-rich' ? 'canvasRich' : level;
        if (key in levels) levels[key]++;
      });
      const result = {
        levels, ...levels,
        visibleCount: this.visibleCount,
        protectedCount: this.protectedCount,
        protectedExceptions: this.protectedExceptions,
        protectedReasons: { ...this.protectedReasons },
        protectedExceptionsByReason: { ...this.protectedExceptionsByReason },
        fullBudget: this.activeFullBudget,
        lightBudget: this.lightBudget,
        planCount: this.planCount,
      };
      Object.entries(this.transitions).forEach(([kind, metric]) => {
        const sorted = metric.samples.slice().sort((a, b) => a - b);
        const quantile = percentile => sorted.length ? sorted[Math.ceil(sorted.length * percentile) - 1] : 0;
        result[`${kind}Count`] = metric.count;
        result[`${kind}Peak`] = metric.peak;
        result[`${kind}Samples`] = sorted.length;
        result[`${kind}P50`] = quantile(0.5);
        result[`${kind}P95`] = quantile(0.95);
      });
      return result;
    }
  }

  return { CanvasRepresentationManager };
});
