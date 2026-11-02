(function initializeImageResourceManager(root) {
  if (!root?.document) return;

  class ImageResourceManager {
    constructor() {
      this.thumbnailEndpoint = "/api/image-thumbnails";
      // Match the canvas scheduler and the browser's practical per-origin
      // concurrency so a zoomed-out board does not reveal empty image slots.
      // Originals remain separately throttled to protect memory and decoding.
      this.thumbnailConcurrency = 6;
      this.originalConcurrency = 2;
      this.failureBackoffMs = 60_000;
      this.thumbnailActive = 0;
      this.originalActive = 0;
      this.thumbnailQueue = [];
      this.originalQueue = [];
      this.thumbnailCache = new Map();
      this.thumbnailPromises = new Map();
      this.failures = new Map();
      this.options = new WeakMap();
      this.unloadTimers = new WeakMap();
      this.requestVersions = new WeakMap();
      this.originalPromises = new WeakMap();
      this.paintCleanups = new WeakMap();
      this.worker = null;
      this.workerJobs = new Map();
      this.nextWorkerJob = 1;
      this.observer = typeof IntersectionObserver === "function"
        ? new IntersectionObserver((entries) => this.handleIntersections(entries), { rootMargin: "300px" })
        : null;
      this.removalObserver = typeof MutationObserver === "function"
        ? new MutationObserver((records) => {
          records.forEach((record) => record.removedNodes.forEach((node) => this.releaseRemovedNode(node)));
        })
        : null;
      this.removalObserver?.observe(document.documentElement, { childList: true, subtree: true });
    }

    observe(img, source, options = {}) {
      if (!img || !source) return img;
      img.removeAttribute("src");
      img.setAttribute("data-original-src", source);
      img.dataset.imageQuality = "unloaded";
      img.dataset.requestedQuality = "unloaded";
      img.dataset.imagePaintQuality = "unloaded";
      img.decoding = "async";
      img.classList.add("deferred-image");
      this.bindImageEvents(img);
      this.options.set(img, {
        unload: options.unload !== false,
        maxQuality: options.maxQuality || "thumbnail",
        allowOriginalFallback: options.allowOriginalFallback !== false,
        canvas: false,
      });
      if (this.observer) this.observer.observe(img);
      else this.showThumbnail(img, {
        allowOriginalFallback: options.allowOriginalFallback !== false,
      });
      return img;
    }

    registerCanvasImage(img, source) {
      if (!img || !source) return img;
      img.removeAttribute("src");
      img.setAttribute("data-original-src", source);
      img.setAttribute("data-canvas-original-src", source);
      img.dataset.imageQuality = "unloaded";
      img.dataset.requestedQuality = "unloaded";
      img.dataset.imagePaintQuality = "unloaded";
      img.decoding = "async";
      img.classList.add("deferred-image");
      this.bindImageEvents(img);
      this.options.set(img, { unload: true, maxQuality: "original", allowOriginalFallback: false, canvas: true });
      return img;
    }

    bindImageEvents(img) {
      if (!img || img.dataset.resourceEventsBound === "true") return;
      img.dataset.resourceEventsBound = "true";
      img.addEventListener("load", () => {
        if (!img.isConnected) return;
        if (img.dataset.requestedQuality === "original" || img.dataset.fallbackStage === "original") {
          img.dataset.imageQuality = "original";
        } else if (img.dataset.requestedQuality === "thumbnail") {
          img.dataset.imageQuality = "thumbnail";
          img.dataset.imagePaintQuality = "thumbnail";
        }
        delete img.dataset.fallbackStage;
      });
      img.addEventListener("error", () => {
        if (img.dataset.imageUpgradePending === "true") return;
        this.handleImageError(img);
      });
    }

    beginImageRequest(img, quality, source) {
      const version = Number(this.requestVersions.get(img) || 0) + 1;
      this.requestVersions.set(img, version);
      img.dataset.requestedQuality = quality;
      return { version, quality, source };
    }

    isCurrentImageRequest(img, request) {
      return Boolean(
        img?.isConnected
        && Number(this.requestVersions.get(img) || 0) === request.version
        && img.dataset.requestedQuality === request.quality
        && img.getAttribute("data-original-src") === request.source
      );
    }

    hasDisplayedImage(img) {
      return Boolean(
        img?.hasAttribute("src")
        && ["thumbnail", "original"].includes(img.dataset.imageQuality || "")
      );
    }

    preserveCanvasImagePaint(img) {
      this.paintCleanups.get(img)?.();
      const previousSrc = img?.getAttribute("src") || "";
      if (!img || !previousSrc) return () => {};
      const computed = root.getComputedStyle?.(img);
      img.style.backgroundImage = `url(${JSON.stringify(previousSrc)})`;
      img.style.backgroundPosition = computed?.objectPosition || "center";
      img.style.backgroundRepeat = "no-repeat";
      img.style.backgroundSize = computed?.objectFit || "cover";
      img.dataset.imageUpgradePending = "true";
      let cleaned = false;
      const cleanup = () => {
        if (cleaned || this.paintCleanups.get(img) !== cleanup) return;
        cleaned = true;
        this.paintCleanups.delete(img);
        delete img.dataset.imageUpgradePending;
        img.style.backgroundImage = "";
        img.style.backgroundPosition = "";
        img.style.backgroundRepeat = "";
        img.style.backgroundSize = "";
      };
      this.paintCleanups.set(img, cleanup);
      return cleanup;
    }

    handleImageError(img) {
      if (!img?.isConnected) return;
      const stage = img.dataset.fallbackStage || "";
      if (stage === "original") {
        this.fallbackToThumbnail(img);
        return;
      }
      if (stage === "thumbnail") {
        this.markImageError(img);
        return;
      }
      if (img.getAttribute("src") === img.getAttribute("data-original-src")) {
        this.markImageError(img);
        return;
      }
      if (this.options.get(img)?.allowOriginalFallback === false) {
        this.markImageError(img);
        return;
      }
      this.fallbackToOriginal(img);
    }

    fallbackToOriginal(img) {
      const source = img?.getAttribute("data-original-src") || "";
      if (!img || !source) {
        this.markImageError(img);
        return false;
      }
      void this.showOriginal(img);
      return true;
    }

    fallbackToThumbnail(img) {
      if (!img) return Promise.resolve(null);
      img.dataset.fallbackStage = "thumbnail";
      return this.showThumbnail(img, { allowOriginalFallback: false });
    }

    markImageError(img) {
      if (!img) return;
      img.removeAttribute("src");
      img.dataset.requestedQuality = "error";
      img.dataset.imageQuality = "error";
      img.dataset.imagePaintQuality = "error";
      img.dispatchEvent(new CustomEvent("image-resource-state", { detail: { state: "error" } }));
    }

    handleIntersections(entries) {
      entries.forEach((entry) => {
        const img = entry.target;
        const timer = this.unloadTimers.get(img);
        if (entry.isIntersecting) {
          if (timer) clearTimeout(timer);
          this.unloadTimers.delete(img);
          this.showThumbnail(img, {
            allowOriginalFallback: this.options.get(img)?.allowOriginalFallback !== false,
          });
          return;
        }
        if (this.options.get(img)?.unload === false) return;
        if (timer) clearTimeout(timer);
        this.unloadTimers.set(img, setTimeout(() => {
          this.unloadTimers.delete(img);
          if (!img.isConnected) this.observer?.unobserve(img);
          this.unload(img);
        }, 1000));
      });
    }

    requestThumbnail(source) {
      const value = String(source || "").trim();
      if (!value) return Promise.resolve(null);
      if (value.startsWith("data:") || value.startsWith("blob:")) {
        return Promise.resolve({ source: value, thumbnailUrl: value, lightweight: true });
      }
      if (this.thumbnailCache.has(value)) return Promise.resolve(this.thumbnailCache.get(value));
      const failedAt = this.failures.get(value) || 0;
      if (Date.now() - failedAt < this.failureBackoffMs) return Promise.resolve(null);
      if (this.thumbnailPromises.has(value)) return this.thumbnailPromises.get(value);

      const promise = new Promise((resolve) => {
        this.thumbnailQueue.push({ source: value, resolve });
        this.pumpThumbnailQueue();
      }).finally(() => this.thumbnailPromises.delete(value));
      this.thumbnailPromises.set(value, promise);
      return promise;
    }

    pumpThumbnailQueue() {
      while (this.thumbnailActive < this.thumbnailConcurrency && this.thumbnailQueue.length) {
        const task = this.thumbnailQueue.shift();
        this.thumbnailActive += 1;
        this.resolveThumbnail(task.source)
          .then((item) => {
            if (item?.thumbnailUrl) this.thumbnailCache.set(task.source, item);
            else this.failures.set(task.source, Date.now());
            task.resolve(item || null);
          })
          .catch(() => {
            this.failures.set(task.source, Date.now());
            task.resolve(null);
          })
          .finally(() => {
            this.thumbnailActive -= 1;
            this.pumpThumbnailQueue();
          });
      }
    }

    async resolveThumbnail(source) {
      const lookup = await fetch(`${this.thumbnailEndpoint}?source=${encodeURIComponent(source)}`, { cache: "no-store" });
      if (!lookup.ok) throw new Error(`Thumbnail lookup failed: ${lookup.status}`);
      const lookupData = await lookup.json().catch(() => ({}));
      if (lookupData.item?.thumbnailUrl) return lookupData.item;
      // Local previews belong on the server. A missing preview must not silently
      // download the whole original on every LAN client to generate it again.
      if (source.startsWith("/output/")) throw new Error("Local thumbnail is unavailable.");
      const generated = await this.generateThumbnail(source);
      return this.uploadThumbnail(generated);
    }

    getWorker() {
      if (this.worker) return this.worker;
      if (typeof Worker !== "function") return null;
      this.worker = new Worker("./image-thumbnail-worker.js?v=20260815-demand-loading");
      this.worker.onmessage = (event) => {
        const job = this.workerJobs.get(event.data?.id);
        if (!job) return;
        this.workerJobs.delete(event.data.id);
        if (event.data.error) job.reject(new Error(event.data.error));
        else job.resolve(event.data);
      };
      this.worker.onerror = (event) => {
        this.workerJobs.forEach((job) => job.reject(new Error(event.message || "Thumbnail worker failed.")));
        this.workerJobs.clear();
        this.worker?.terminate();
        this.worker = null;
      };
      return this.worker;
    }

    generateThumbnail(source) {
      const worker = this.getWorker();
      if (!worker) return this.generateThumbnailOnMainThread(source);
      const id = this.nextWorkerJob;
      this.nextWorkerJob += 1;
      return new Promise((resolve, reject) => {
        this.workerJobs.set(id, { resolve, reject });
        worker.postMessage({
          id,
          source,
          maxSide: root.ImageLoadingRules?.THUMBNAIL_MAX_SIDE || 640,
          quality: root.ImageLoadingRules?.THUMBNAIL_QUALITY || 0.76,
        });
      });
    }

    async generateThumbnailOnMainThread(source) {
      const response = await fetch(source, { cache: "force-cache" });
      if (!response.ok) throw new Error(`Image fetch failed: ${response.status}`);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      const width = bitmap.width;
      const height = bitmap.height;
      if (Math.max(width, height) <= (root.ImageLoadingRules?.THUMBNAIL_MAX_SIDE || 640) && blob.size <= 1024 * 1024) {
        bitmap.close();
        return { source, width, height, bytes: blob.size, lightweight: true };
      }
      const maxSide = root.ImageLoadingRules?.THUMBNAIL_MAX_SIDE || 640;
      const scale = Math.min(1, maxSide / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      canvas.getContext("2d", { alpha: true }).drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const thumbnail = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (value) => value ? resolve(value) : reject(new Error("Thumbnail conversion failed.")),
          "image/webp",
          root.ImageLoadingRules?.THUMBNAIL_QUALITY || 0.76,
        );
      });
      return { source, width, height, bytes: blob.size, lightweight: false, thumbnail };
    }

    async uploadThumbnail(result) {
      const headers = {
        "X-Source-Url": encodeURIComponent(result.source),
        "X-Image-Width": String(result.width || 0),
        "X-Image-Height": String(result.height || 0),
        "X-Thumbnail-Lightweight": result.lightweight ? "true" : "false",
        "Content-Type": result.lightweight ? "application/octet-stream" : (result.thumbnail?.type || "image/webp"),
      };
      const response = await fetch(this.thumbnailEndpoint, {
        method: "POST",
        headers,
        body: result.lightweight ? undefined : result.thumbnail,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.item?.thumbnailUrl) throw new Error(data.error || "Thumbnail upload failed.");
      return data.item;
    }

    showThumbnail(img, { allowOriginalFallback = true } = {}) {
      if (!img) return Promise.resolve(null);
      if (this.options.get(img)?.allowOriginalFallback === false) allowOriginalFallback = false;
      const source = img.getAttribute("data-original-src") || "";
      if (!source) return Promise.resolve(null);
      if (img.dataset.imageQuality === "original" && img.getAttribute("src") === source) {
        img.dataset.requestedQuality = "original";
        return Promise.resolve({ source, thumbnailUrl: source, lightweight: false });
      }
      const request = this.beginImageRequest(img, "thumbnail", source);
      const hadDisplayedImage = this.hasDisplayedImage(img);
      if (!hadDisplayedImage) img.dataset.imageQuality = "loading";
      return this.requestThumbnail(source).then((item) => {
        if (!this.isCurrentImageRequest(img, request)) return item;
        if (item?.thumbnailUrl) {
          if (item.width) img.dataset.originalWidth = String(item.width);
          if (item.height) img.dataset.originalHeight = String(item.height);
          if (img.getAttribute("src") !== item.thumbnailUrl) img.src = item.thumbnailUrl;
          img.dataset.imageQuality = "thumbnail";
          img.dataset.requestedQuality = "thumbnail";
          img.dataset.imagePaintQuality = "thumbnail";
          img.dataset.fallbackStage = "thumbnail";
        } else if (hadDisplayedImage) {
          img.dataset.requestedQuality = img.dataset.imageQuality;
        } else if (allowOriginalFallback) {
          this.fallbackToOriginal(img);
        } else {
          this.markImageError(img);
        }
        return item;
      });
    }

    showOriginal(img) {
      if (!img) return Promise.resolve(false);
      const source = img.getAttribute("data-original-src") || "";
      if (!source) return Promise.resolve(false);
      if (img.dataset.imageQuality === "original" && img.getAttribute("src") === source) return Promise.resolve(true);
      const pending = this.originalPromises.get(img);
      if (pending?.source === source && img.dataset.requestedQuality === "original") return pending.promise;
      const request = this.beginImageRequest(img, "original", source);
      if (!this.hasDisplayedImage(img)) img.dataset.imageQuality = "loading";
      let task;
      const promise = new Promise((resolve) => {
        task = { img, source, request, resolve, promise: null };
        this.originalQueue.push(task);
        this.pumpOriginalQueue();
      });
      task.promise = promise;
      this.originalPromises.set(img, { source, promise });
      return promise;
    }

    pumpOriginalQueue() {
      while (this.originalActive < this.originalConcurrency && this.originalQueue.length) {
        const task = this.originalQueue.shift();
        if (!this.isCurrentImageRequest(task.img, task.request)) {
          const pending = this.originalPromises.get(task.img);
          if (pending?.promise === task.promise) this.originalPromises.delete(task.img);
          task.resolve(false);
          continue;
        }
        this.originalActive += 1;
        const preload = new Image();
        preload.decoding = "async";
        let finished = false;
        const finish = (success) => {
          if (finished) return;
          finished = true;
          const pending = this.originalPromises.get(task.img);
          if (pending?.promise === task.promise) this.originalPromises.delete(task.img);
          task.resolve(success);
          this.originalActive -= 1;
          this.pumpOriginalQueue();
        };
        preload.onload = async () => {
          try { await preload.decode?.(); } catch {}
          if (!this.isCurrentImageRequest(task.img, task.request)) {
            finish(false);
            return;
          }
          if (preload.naturalWidth) task.img.dataset.originalWidth = String(preload.naturalWidth);
          if (preload.naturalHeight) task.img.dataset.originalHeight = String(preload.naturalHeight);
          const previousSrc = task.img.getAttribute("src") || "";
          const previousQuality = task.img.dataset.imageQuality || "unloaded";
          const previousPaintQuality = task.img.dataset.imagePaintQuality || previousQuality;
          const clearPaint = this.preserveCanvasImagePaint(task.img);
          task.img.src = task.source;
          let decoded = true;
          try { await task.img.decode?.(); } catch { decoded = Boolean(task.img.complete && task.img.naturalWidth); }
          if (!decoded || !this.isCurrentImageRequest(task.img, task.request)) {
            if (task.img.getAttribute("src") === task.source && previousSrc) {
              task.img.src = previousSrc;
              task.img.dataset.imageQuality = previousQuality;
              task.img.dataset.imagePaintQuality = previousPaintQuality;
            }
            clearPaint();
            finish(false);
            return;
          }
          task.img.dataset.imageQuality = "original";
          task.img.dataset.requestedQuality = "original";
          task.img.dataset.fallbackStage = "original";
          task.img.dataset.imagePaintQuality = task.img.hasAttribute("data-canvas-original-src")
            ? "pending"
            : "original";
          await new Promise((resolve) => {
            const schedule = root.requestAnimationFrame || ((callback) => setTimeout(callback, 0));
            schedule(resolve);
          });
          clearPaint();
          if (task.img.hasAttribute("data-canvas-original-src")) {
            task.img.dispatchEvent(new CustomEvent("canvas-image-original-ready", {
              bubbles: true,
              detail: { source: task.source },
            }));
          }
          finish(true);
        };
        preload.onerror = () => {
          if (this.isCurrentImageRequest(task.img, task.request)) {
            if (this.hasDisplayedImage(task.img)) {
              task.img.dataset.requestedQuality = task.img.dataset.imageQuality;
            } else {
              task.img.dataset.requestedQuality = "thumbnail";
              void this.showThumbnail(task.img, { allowOriginalFallback: false });
            }
          }
          finish(false);
        };
        preload.src = task.source;
      }
    }

    unload(img) {
      if (!img) return;
      this.requestVersions.set(img, Number(this.requestVersions.get(img) || 0) + 1);
      this.originalPromises.delete(img);
      this.paintCleanups.get(img)?.();
      img.dataset.requestedQuality = "unloaded";
      img.removeAttribute("src");
      img.dataset.imageQuality = "unloaded";
      img.dataset.imagePaintQuality = "unloaded";
    }

    releaseRemovedNode(node) {
      if (!node || node.nodeType !== 1) return;
      if (node.matches?.("img[data-original-src]") && !node.isConnected) this.releaseImage(node);
      node.querySelectorAll?.("img[data-original-src]").forEach((img) => {
        if (!img.isConnected) this.releaseImage(img);
      });
    }

    releaseImage(img) {
      this.observer?.unobserve(img);
      const timer = this.unloadTimers.get(img);
      if (timer) clearTimeout(timer);
      this.unloadTimers.delete(img);
      this.options.delete(img);
      this.unload(img);
    }

    disconnect(container) {
      if (container?.matches?.("img[data-original-src]")) this.releaseImage(container);
      container?.querySelectorAll?.("img[data-original-src]").forEach((img) => this.releaseImage(img));
    }
  }

  root.ImageResourceManager = ImageResourceManager;
  root.imageResources = new ImageResourceManager();
})(typeof window !== "undefined" ? window : null);
