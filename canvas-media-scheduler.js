(function initCanvasMediaScheduler(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CanvasMediaScheduler = api.CanvasMediaScheduler;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanvasMediaScheduler() {
  const QUALITIES = new Set(["thumbnail", "original"]);
  const DEFAULT_RETRY_DELAYS = Object.freeze([250, 1000, 4000]);

  function positiveInteger(value, fallback) {
    const number = Math.trunc(Number(value));
    return Number.isFinite(number) && number > 0 ? number : fallback;
  }

  function abortError(error) {
    return error?.name === "AbortError" || String(error?.code || "") === "ABORT_ERR";
  }

  class CanvasMediaScheduler {
    constructor({
      maxThumbnails = 6,
      maxOriginals = 2,
      now = () => Date.now(),
      setTimer = (callback, delay) => setTimeout(callback, delay),
      clearTimer = (timer) => clearTimeout(timer),
    } = {}) {
      this.limits = {
        thumbnail: positiveInteger(maxThumbnails, 6),
        original: positiveInteger(maxOriginals, 2),
      };
      this.now = now;
      this.setTimer = setTimer;
      this.clearTimer = clearTimer;
      this.queues = { thumbnail: [], original: [] };
      this.entries = new Map();
      this.running = new Map();
      this.timers = new Map();
      this.retryDelays = DEFAULT_RETRY_DELAYS;
      this.interactionActive = false;
      this.disposed = false;
      this.sequence = 0;
    }

    makeKey(nodeId, quality) {
      return `${String(nodeId)}:${String(quality)}`;
    }

    releaseEntry(entry) {
      if (!entry || entry.released) return;
      entry.released = true;
      try { entry.release?.(); } catch {}
    }

    removeFromQueues(entry) {
      if (!entry) return;
      for (const quality of QUALITIES) {
        this.queues[quality] = this.queues[quality].filter((item) => item !== entry);
      }
    }

    sortQueue(quality) {
      this.queues[quality].sort((left, right) => (
        Number(right.priority || 0) - Number(left.priority || 0)
        || Number(left.sequence) - Number(right.sequence)
      ));
    }

    enqueue(task = {}) {
      if (this.disposed) return "";
      const nodeId = String(task.nodeId ?? "").trim();
      const quality = String(task.quality || "");
      if (!nodeId) throw new Error("Canvas media task requires a nodeId.");
      if (!QUALITIES.has(quality)) throw new Error(`Unknown canvas media quality: ${quality}`);
      if (typeof task.run !== "function") throw new Error("Canvas media task requires run(signal).");
      const key = this.makeKey(nodeId, quality);
      this.cancelKey(key);
      const entry = {
        ...task,
        key,
        nodeId,
        quality,
        priority: Number(task.priority || 0),
        sequence: this.sequence += 1,
        queuedAt: Number(this.now?.() || 0),
        attempt: 0,
        released: false,
        canceled: false,
        pauseRequested: false,
        state: "queued",
      };
      this.entries.set(key, entry);
      this.queues[quality].push(entry);
      this.sortQueue(quality);
      this.pump();
      return key;
    }

    runningCount(quality) {
      let count = 0;
      for (const item of this.running.values()) {
        if (item.entry.quality === quality) count += 1;
      }
      return count;
    }

    pumpQuality(quality) {
      if (quality === "original" && this.interactionActive) return;
      while (this.runningCount(quality) < this.limits[quality] && this.queues[quality].length) {
        const entry = this.queues[quality].shift();
        if (this.entries.get(entry.key) !== entry || entry.canceled) continue;
        this.start(entry);
      }
    }

    pump() {
      if (this.disposed) return;
      this.pumpQuality("thumbnail");
      this.pumpQuality("original");
    }

    start(entry) {
      const controller = new AbortController();
      entry.state = "running";
      this.running.set(entry.key, { entry, controller });
      Promise.resolve()
        .then(() => entry.run(controller.signal))
        .then(() => this.finish(entry))
        .catch((error) => this.handleFailure(entry, error));
    }

    finish(entry) {
      const running = this.running.get(entry.key);
      if (running?.entry === entry) this.running.delete(entry.key);
      if (this.entries.get(entry.key) === entry && !entry.canceled) entry.state = "complete";
      this.pump();
    }

    handleFailure(entry, error) {
      const running = this.running.get(entry.key);
      if (running?.entry === entry) this.running.delete(entry.key);
      if (this.entries.get(entry.key) !== entry || entry.canceled) {
        this.pump();
        return;
      }
      if (abortError(error) && entry.pauseRequested) {
        entry.pauseRequested = false;
        entry.state = "queued";
        this.queues[entry.quality].push(entry);
        this.sortQueue(entry.quality);
        this.pump();
        return;
      }
      if (!abortError(error) && entry.attempt < this.retryDelays.length) {
        const delay = this.retryDelays[entry.attempt];
        entry.attempt += 1;
        entry.state = "retrying";
        const timer = this.setTimer(() => {
          this.timers.delete(entry.key);
          if (this.entries.get(entry.key) !== entry || entry.canceled || this.disposed) return;
          entry.state = "queued";
          this.queues[entry.quality].push(entry);
          this.sortQueue(entry.quality);
          this.pump();
        }, delay);
        this.timers.set(entry.key, timer);
        this.pump();
        return;
      }
      this.entries.delete(entry.key);
      entry.state = "failed";
      this.releaseEntry(entry);
      this.pump();
    }

    cancelKey(key) {
      const entry = this.entries.get(String(key));
      if (!entry) return false;
      entry.canceled = true;
      this.entries.delete(entry.key);
      this.removeFromQueues(entry);
      const timer = this.timers.get(entry.key);
      if (timer !== undefined) {
        this.clearTimer(timer);
        this.timers.delete(entry.key);
      }
      const running = this.running.get(entry.key);
      if (running?.entry === entry) {
        this.running.delete(entry.key);
        running.controller.abort();
      }
      this.releaseEntry(entry);
      this.pump();
      return true;
    }

    cancelNode(nodeId) {
      const id = String(nodeId);
      const keys = [...this.entries.values()]
        .filter((entry) => entry.nodeId === id)
        .map((entry) => entry.key);
      keys.forEach((key) => this.cancelKey(key));
      return keys.length;
    }

    setInteractionActive(active) {
      const next = Boolean(active);
      if (next === this.interactionActive) return;
      this.interactionActive = next;
      if (next) {
        for (const { entry, controller } of this.running.values()) {
          if (entry.quality !== "original") continue;
          entry.pauseRequested = true;
          controller.abort();
        }
      }
      this.pump();
    }

    getDiagnostics() {
      return {
        queuedThumbnails: this.queues.thumbnail.length,
        queuedOriginals: this.queues.original.length,
        runningThumbnails: this.runningCount("thumbnail"),
        runningOriginals: this.runningCount("original"),
        interactionActive: this.interactionActive,
        entryCount: this.entries.size,
      };
    }

    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      [...this.entries.keys()].forEach((key) => this.cancelKey(key));
      this.queues.thumbnail = [];
      this.queues.original = [];
    }
  }

  return { CanvasMediaScheduler, DEFAULT_RETRY_DELAYS };
});
