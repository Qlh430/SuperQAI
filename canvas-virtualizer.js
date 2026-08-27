(function initCanvasVirtualizer(root, factory) {
  const rules = typeof module === "object" && module.exports
    ? require("./canvas-virtualization-rules")
    : root?.CanvasVirtualizationRules;
  const api = factory(rules);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasVirtualizer = api.CanvasVirtualizer;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasVirtualizer(defaultRules) {
  class CanvasVirtualizer {
    constructor({
      store,
      rules = defaultRules,
      getViewport,
      mount,
      unmount,
      replace = null,
      requestData = null,
      afterFlush = () => {},
      requestFrame = (callback) => requestAnimationFrame(callback),
      cancelFrame = (id) => cancelAnimationFrame(id),
      now = () => performance.now(),
    } = {}) {
      if (!store || !rules || typeof getViewport !== "function" || typeof mount !== "function" || typeof unmount !== "function") {
        throw new Error("CanvasVirtualizer requires store, rules, viewport, mount, and unmount adapters.");
      }
      this.store = store;
      this.rules = rules;
      this.getViewport = getViewport;
      this.mountAdapter = mount;
      this.unmountAdapter = unmount;
      this.replaceAdapter = typeof replace === "function" ? replace : null;
      this.requestData = typeof requestData === "function" ? requestData : null;
      this.afterFlush = afterFlush;
      this.requestFrame = requestFrame;
      this.cancelFrame = cancelFrame;
      this.now = now;
      this.pinnedIds = new Set();
      this.frame = 0;
      this.generation = 0;
      this.requestedDataGeneration = -1;
    }

    getOverviewRepresentatives(visibleIds, viewport, mountRect) {
      const ids = Array.from(visibleIds || []);
      const scale = Math.max(0.01, Number(viewport?.scale) || 1);
      const maximum = 800;
      if (ids.length <= maximum) return ids;
      const bucketSize = 96 / scale;
      const representatives = new Map();
      const visiblePinned = ids.filter((id) => this.pinnedIds.has(String(id)));
      ids.filter((id) => !this.pinnedIds.has(String(id))).forEach((id) => {
        const rect = this.store.getRect(id);
        if (!rect) return;
        const centerX = (rect.left + rect.right) / 2;
        const centerY = (rect.top + rect.bottom) / 2;
        const key = `${Math.floor(centerX / bucketSize)}:${Math.floor(centerY / bucketSize)}`;
        if (!representatives.has(key)) representatives.set(key, id);
      });
      const centerX = (mountRect.left + mountRect.right) / 2;
      const centerY = (mountRect.top + mountRect.bottom) / 2;
      const remainingCapacity = Math.max(0, maximum - visiblePinned.length);
      const selected = Array.from(representatives.values())
        .map((id) => {
          const rect = this.store.getRect(id);
          const x = rect ? (rect.left + rect.right) / 2 : centerX;
          const y = rect ? (rect.top + rect.bottom) / 2 : centerY;
          return { id, distance: (x - centerX) ** 2 + (y - centerY) ** 2 };
        })
        .sort((a, b) => a.distance - b.distance || String(a.id).localeCompare(String(b.id)))
        .slice(0, remainingCapacity)
        .map((item) => item.id);
      return [...visiblePinned.slice(0, maximum), ...selected];
    }

    schedule() {
      this.generation += 1;
      if (this.frame) return;
      this.frame = this.requestFrame(() => {
        this.frame = 0;
        this.flush(this.generation, { ignoreBudget: false });
      });
    }

    requestContinuation(generation) {
      if (this.frame || generation !== this.generation) return;
      this.frame = this.requestFrame(() => {
        this.frame = 0;
        this.flush(generation, { ignoreBudget: false });
      });
    }

    flushNow() {
      this.generation += 1;
      if (this.frame) {
        this.cancelFrame(this.frame);
        this.frame = 0;
      }
      return this.flush(this.generation, { ignoreBudget: true });
    }

    getRects() {
      const viewport = this.getViewport() || {};
      const view = { width: viewport.width, height: viewport.height };
      const transform = { x: viewport.x, y: viewport.y, scale: viewport.scale };
      return {
        viewport,
        mountRect: this.rules.getViewportCanvasRect(view, transform, this.rules.MOUNT_OVERSCAN_PX),
        retainRect: this.rules.getViewportCanvasRect(view, transform, this.rules.RETAIN_OVERSCAN_PX),
      };
    }

    flush(generation, { ignoreBudget = false } = {}) {
      if (generation !== this.generation) {
        this.requestContinuation(this.generation);
        return { mounted: 0, unmounted: 0, remaining: 0 };
      }
      const startedAt = this.now();
      const { viewport, mountRect, retainRect } = this.getRects();
      const needsData = this.store.isViewportComplete?.(mountRect) === false;
      if (needsData && this.requestData && this.requestedDataGeneration !== generation) {
        this.requestedDataGeneration = generation;
        try {
          this.requestData({ mountRect, viewport, generation });
        } catch {
          // Data-source failures are surfaced by the data source without breaking retained rendering.
        }
      }
      const visibleIds = this.store.query(mountRect);
      const sceneMode = Boolean(this.store.scenePage);
      const renderIds = sceneMode ? [] : Array.from(visibleIds).slice(0, 800);
      const isClusteredOverview = renderIds.length < visibleIds.length;
      const desired = new Map();
      renderIds.forEach((id) => {
        desired.set(id, "full");
      });
      this.pinnedIds.forEach((id) => {
        if (this.store.has(id)) desired.set(id, "full");
      });

      let unmountedCount = 0;
      this.store.mountedIds().forEach((id) => {
        if (desired.has(id)) return;
        const rect = this.store.getRect(id);
        if (isClusteredOverview && rect && this.rules.rectsIntersect(rect, mountRect)) {
          this.unmountId(id);
          unmountedCount += 1;
          return;
        }
        if (rect && this.rules.rectsIntersect(rect, retainRect)) {
          desired.set(id, this.store.getMountedLevel(id) || "full");
          return;
        }
        this.unmountId(id);
        unmountedCount += 1;
      });

      const center = {
        x: (mountRect.left + mountRect.right) / 2,
        y: (mountRect.top + mountRect.bottom) / 2,
      };
      const missing = [];
      desired.forEach((level, id) => {
        const mounted = this.store.getMounted(id);
        if (mounted && this.store.getMountedLevel(id) === level) return;
        const rect = this.store.getRect(id);
        const distance = rect
          ? ((rect.left + rect.right) / 2 - center.x) ** 2 + ((rect.top + rect.bottom) / 2 - center.y) ** 2
          : Number.MAX_SAFE_INTEGER;
        missing.push({
          id,
          level,
          distance,
          current: mounted,
          fromLevel: mounted ? this.store.getMountedLevel(id) : "",
        });
      });
      missing.sort((a, b) => a.distance - b.distance || String(a.id).localeCompare(String(b.id)));

      let mountedCount = 0;
      let replacedCount = 0;
      let failedReplacementCount = 0;
      let cursor = 0;
      for (; cursor < missing.length; cursor += 1) {
        const item = missing[cursor];
        let element = null;
        if (item.current && this.replaceAdapter) {
          element = this.replaceAdapter(item.id, item.current, item.fromLevel, item.level);
          if (element) replacedCount += 1;
          else failedReplacementCount += 1;
        } else {
          if (item.current) {
            this.unmountId(item.id);
            unmountedCount += 1;
          }
          element = this.mountAdapter(item.id, item.level);
        }
        if (element) {
          this.store.setMounted(item.id, element, item.level);
          if (!item.current) mountedCount += 1;
        }
        if (!ignoreBudget && cursor < missing.length - 1 && this.now() - startedAt >= this.rules.FRAME_BUDGET_MS) {
          cursor += 1;
          break;
        }
      }

      const remaining = Math.max(0, missing.length - cursor);
      if (remaining) this.requestContinuation(generation);
      const detail = {
        mounted: mountedCount,
        unmounted: unmountedCount,
        replaced: replacedCount,
        transitioned: Math.min(80, replacedCount),
        failedReplacements: failedReplacementCount,
        clustered: isClusteredOverview,
        remaining,
        visible: visibleIds.length,
        totalMounted: this.store.mountedSize,
        needsData,
      };
      this.afterFlush(detail);
      return detail;
    }

    unmountId(id) {
      const element = this.store.getMounted(id);
      if (!element) return false;
      this.unmountAdapter(String(id), element);
      this.store.setMounted(id, null);
      return true;
    }

    ensureMounted(id, level = "full") {
      const key = String(id);
      if (!this.store.has(key)) return null;
      const current = this.store.getMounted(key);
      if (current && this.store.getMountedLevel(key) === level) return current;
      if (current && this.replaceAdapter) {
        const replacement = this.replaceAdapter(
          key,
          current,
          this.store.getMountedLevel(key),
          level,
        );
        if (replacement) this.store.setMounted(key, replacement, level);
        return replacement || current;
      }
      if (current) this.unmountId(key);
      const element = this.mountAdapter(key, level);
      if (element) this.store.setMounted(key, element, level);
      return element || null;
    }

    pin(id) {
      const key = String(id);
      if (!key) return;
      this.pinnedIds.add(key);
      this.schedule();
    }

    unpin(id) {
      this.pinnedIds.delete(String(id));
      this.schedule();
    }

    isPinned(id) {
      return this.pinnedIds.has(String(id));
    }

    reset() {
      this.generation += 1;
      if (this.frame) this.cancelFrame(this.frame);
      this.frame = 0;
      this.store.mountedIds().forEach((id) => this.unmountId(id));
      this.pinnedIds.clear();
      this.requestedDataGeneration = -1;
      this.store.clearMounted();
    }
  }

  return { CanvasVirtualizer };
});
