(function initCanvasViewportDataSource(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasViewportDataSource = api.CanvasViewportDataSource;
})(typeof globalThis !== "undefined" ? globalThis : this, function createViewportDataSource() {
  function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizeRect(input = {}) {
    const left = finite(input.left);
    const top = finite(input.top);
    const right = finite(input.right, left);
    const bottom = finite(input.bottom, top);
    return {
      left: Math.min(left, right),
      top: Math.min(top, bottom),
      right: Math.max(left, right),
      bottom: Math.max(top, bottom),
    };
  }

  function expandRect(input, factor) {
    const rect = normalizeRect(input);
    const width = Math.max(1, rect.right - rect.left);
    const height = Math.max(1, rect.bottom - rect.top);
    const safeFactor = Math.max(1, finite(factor, 1));
    const horizontal = width * (safeFactor - 1) / 2;
    const vertical = height * (safeFactor - 1) / 2;
    return {
      left: rect.left - horizontal,
      top: rect.top - vertical,
      right: rect.right + horizontal,
      bottom: rect.bottom + vertical,
    };
  }

  function containsRect(outer, inner) {
    return outer.left <= inner.left
      && outer.top <= inner.top
      && outer.right >= inner.right
      && outer.bottom >= inner.bottom;
  }

  function lodBand(scale) {
    return Math.max(0.01, finite(scale, 1)) < 0.3 ? "lod" : "detail";
  }

  class CanvasViewportDataSource {
    constructor({
      fetchImpl,
      store,
      endpointBase = "/api/canvas/boards",
      getBoardId,
      overscanFactor = 1.5,
      onStatus = () => {},
    } = {}) {
      if (typeof fetchImpl !== "function" || !store || typeof getBoardId !== "function") {
        throw new Error("CanvasViewportDataSource requires fetch, store, and board adapters.");
      }
      this.fetchImpl = fetchImpl;
      this.store = store;
      this.endpointBase = String(endpointBase || "/api/canvas/boards").replace(/\/+$/, "");
      this.getBoardId = getBoardId;
      this.overscanFactor = Math.max(1, finite(overscanFactor, 1.5));
      this.onStatus = typeof onStatus === "function" ? onStatus : () => {};
      this.generation = 0;
      this.controller = null;
      this.controllerGeneration = "";
      this.lastFulfilled = null;
      this.disposed = false;
    }

    buildUrl(boardId, viewport, rect, generation) {
      const url = new URL(
        `${this.endpointBase}/${encodeURIComponent(boardId)}/viewport`,
        typeof location === "object" && location?.origin ? location.origin : "http://localhost",
      );
      for (const [key, value] of Object.entries({
        ...rect,
        scale: Math.max(0.01, finite(viewport.scale, 1)),
        nodeLimit: 800,
        connectionLimit: 1200,
        generation,
      })) url.searchParams.set(key, String(value));
      if (url.origin === "http://localhost" && !/^https?:/i.test(this.endpointBase)) {
        return `${url.pathname}${url.search}`;
      }
      return url.toString();
    }

    canReuse(boardId, rect, viewport) {
      const fulfilled = this.lastFulfilled;
      if (!fulfilled || fulfilled.boardId !== boardId) return false;
      if (!containsRect(fulfilled.rect, rect)) return false;
      if (Number(this.store.boardRevision) !== Number(fulfilled.boardRevision)) return false;
      return fulfilled.lodBand === lodBand(viewport.scale)
        && fulfilled.mode === (this.store.lodPage ? "lod" : "detail");
    }

    abortActive(emitStatus = true) {
      if (!this.controller || this.controller.signal.aborted) return;
      const generation = this.controllerGeneration;
      this.controller.abort();
      if (emitStatus) this.onStatus({ state: "aborted", generation, error: null });
    }

    async request(viewport = {}, options = {}) {
      if (this.disposed) return { ignored: true, disposed: true };
      const boardId = String(this.getBoardId() || "").trim();
      if (!boardId) {
        const error = new Error("Canvas viewport request requires an active board.");
        error.code = "canvas_board_missing";
        this.onStatus({ state: "error", generation: String(this.generation), error });
        throw error;
      }
      const factor = options.prefetch ? this.overscanFactor * 1.5 : this.overscanFactor;
      const rect = expandRect(viewport, factor);
      if (this.canReuse(boardId, rect, viewport)) {
        return { skipped: true, generation: String(this.generation) };
      }

      this.abortActive(true);
      this.generation += 1;
      const generation = String(this.generation);
      const controller = new AbortController();
      this.controller = controller;
      this.controllerGeneration = generation;
      this.onStatus({ state: "loading", generation, error: null });
      const url = this.buildUrl(boardId, viewport, rect, generation);
      try {
        const response = await this.fetchImpl(url, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response?.ok) {
          throw new Error(`Canvas viewport request failed: ${Number(response?.status || 0)}`);
        }
        const page = await response.json();
        if (generation !== String(this.generation) || controller.signal.aborted || this.disposed) {
          return { ignored: true, generation };
        }
        if (page?.state === "migrating") {
          this.onStatus({ state: "loading", generation, error: null, progress: page.progress });
          return { ...page, generation };
        }
        const nextPage = { ...page, generation, bounds: rect };
        this.store.applyViewportPage(nextPage);
        this.lastFulfilled = {
          boardId,
          rect,
          boardRevision: Number(page.boardRevision || 0),
          mode: String(page.mode || "detail"),
          lodBand: lodBand(viewport.scale),
        };
        this.onStatus({ state: "ready", generation, error: null });
        return nextPage;
      } catch (error) {
        if (controller.signal.aborted || generation !== String(this.generation) || this.disposed) {
          return { ignored: true, aborted: true, generation };
        }
        this.onStatus({ state: "error", generation, error });
        throw error;
      } finally {
        if (this.controller === controller) {
          this.controller = null;
          this.controllerGeneration = "";
        }
      }
    }

    prefetch(viewport) {
      return this.request(viewport, { prefetch: true });
    }

    cancel() {
      this.generation += 1;
      this.abortActive(true);
      this.controller = null;
      this.controllerGeneration = "";
    }

    dispose() {
      if (this.disposed) return;
      this.cancel();
      this.disposed = true;
      this.lastFulfilled = null;
    }
  }

  return { CanvasViewportDataSource, normalizeRect, expandRect };
});
