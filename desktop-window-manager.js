"use strict";

(function exposeWindowManager(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.DesktopWindowManager = api;
    root.AiOsWindowManager = api;
  }
})(typeof globalThis === "object" ? globalThis : this, function createApi() {
  const SMALL_VIEWPORT_WIDTH = 860;
  const CASCADE_OFFSET = 32;
  const TITLEBAR_HEIGHT = 42;
  const REACHABLE_TITLEBAR_WIDTH = 120;
  const REACHABLE_TITLEBAR_HEIGHT = 24;

  function createWindowManager(options) {
    const config = options || {};
    const storage = config.storage;
    const storageKey = typeof config.storageKey === "string" && config.storageKey ? config.storageKey : "desktop-window-layout";
    const onChange = typeof config.onChange === "function" ? config.onChange : null;
    const apps = new Map();
    const savedLayouts = readLayouts(storage, storageKey);
    let viewport = normalizeViewport(config.viewport);
    let windows = [];
    let zIndex = 0;
    let nextInstance = new Map();

    function registerApp(app) {
      if (!app || typeof app.id !== "string" || !app.id) {
        throw new TypeError("A registered app requires a non-empty id.");
      }
      apps.set(app.id, normalizeApp(app));
      publish({ type: "registerApp", appId: app.id });
      return api;
    }

    function open(appId) {
      const app = requireApp(appId);
      if (!app.multiInstance) {
        const existing = windows.find((window) => window.appId === appId);
        if (existing) {
          if (existing.minimized) existing.minimized = false;
          revealWindow(existing);
          focusWindow(existing);
          commit({ type: "open", appId, id: existing.id, reused: true });
          return getWindow(existing.id);
        }
      }

      if (isSmallViewport()) {
        windows.forEach((window) => {
          if (window.responsiveMinimized == null) window.responsiveMinimized = window.minimized;
          window.minimized = true;
        });
      }

      const id = createWindowId(app);
      const layout = savedLayouts[id] || savedLayouts[appId];
      const bounds = layout ? layoutToBounds(layout, app) : initialBounds(app);
      const responsiveMaximized = isSmallViewport() && !(layout && layout.restoreBounds);
      const isMaximized = Boolean(layout && layout.restoreBounds) || responsiveMaximized;
      const window = {
        id,
        appId,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        zIndex: ++zIndex,
        minimized: false,
        maximized: isMaximized,
        restoreBounds: layout && layout.restoreBounds
          ? constrainBounds(layout.restoreBounds, app)
          : responsiveMaximized && layout ? currentBounds(layout) : null,
        responsiveMaximized
      };

      if (isSmallViewport()) window.responsiveMinimized = false;
      if (window.maximized) applyMaximizedBounds(window);
      else revealWindow(window);
      windows.push(window);
      commit({ type: "open", appId, id });
      return getWindow(id);
    }

    function focus(id, options) {
      const window = findWindow(id);
      if (!window) return null;
      if (isSmallViewport()) {
        windows.forEach((item) => {
          if (item.responsiveMinimized == null) item.responsiveMinimized = item.minimized;
          item.minimized = item.id !== id;
        });
        if (!window.maximized) {
          window.restoreBounds = currentBounds(window);
          window.maximized = true;
          window.responsiveMaximized = true;
        }
        applyMaximizedBounds(window);
      }
      if (window.minimized) window.minimized = false;
      if (options && options.reveal) revealWindow(window);
      focusWindow(window);
      commit({ type: "focus", id });
      return getWindow(id);
    }

    function move(id, x, y) {
      const window = findWindow(id);
      if (!window || window.maximized) return window ? getWindow(id) : null;
      const bounds = constrainBounds({ x, y, width: window.width, height: window.height }, apps.get(window.appId));
      Object.assign(window, bounds);
      commit({ type: "move", id });
      return getWindow(id);
    }

    function resize(id, width, height) {
      const window = findWindow(id);
      if (!window || window.maximized) return window ? getWindow(id) : null;
      const bounds = constrainBounds({ x: window.x, y: window.y, width, height }, apps.get(window.appId));
      Object.assign(window, bounds);
      commit({ type: "resize", id });
      return getWindow(id);
    }

    function setBounds(id, nextBounds) {
      const window = findWindow(id);
      if (!window || window.maximized) return window ? getWindow(id) : null;
      const requested = nextBounds || {};
      const bounds = constrainBounds({
        x: requested.x,
        y: requested.y,
        width: requested.width,
        height: requested.height
      }, apps.get(window.appId));
      Object.assign(window, bounds);
      commit({ type: "setBounds", id });
      return getWindow(id);
    }

    function minimize(id) {
      const window = findWindow(id);
      if (!window) return null;
      window.minimized = true;
      commit({ type: "minimize", id });
      return getWindow(id);
    }

    function maximize(id) {
      const window = findWindow(id);
      if (!window) return null;
      if (!window.maximized) {
        window.restoreBounds = currentBounds(window);
        window.maximized = true;
      }
      window.minimized = false;
      applyMaximizedBounds(window);
      focusWindow(window);
      commit({ type: "maximize", id });
      return getWindow(id);
    }

    function restore(id) {
      const window = findWindow(id);
      if (!window) return null;
      let changed = false;
      if (window.maximized && window.restoreBounds && !isSmallViewport()) {
        Object.assign(window, constrainBounds(window.restoreBounds, apps.get(window.appId)));
        window.restoreBounds = null;
        window.maximized = false;
        window.responsiveMaximized = false;
        changed = true;
      }
      if (window.minimized) {
        window.minimized = false;
        changed = true;
      }
      if (changed) focusWindow(window);
      commit({ type: "restore", id });
      return getWindow(id);
    }

    function toggleMaximize(id) {
      const window = findWindow(id);
      if (!window) return null;
      if (window.maximized && window.restoreBounds) return restore(id);
      return maximize(id);
    }

    // Windows behaviour: pulling a maximized window away from the top restores its
    // previous size so the caller can finish the drag in the same gesture.
    function restoreForDrag(id) {
      const window = findWindow(id);
      if (!window) return null;
      if (!window.maximized || isSmallViewport()) return getWindow(id);
      const app = apps.get(window.appId);
      const target = window.restoreBounds
        ? constrainBounds(window.restoreBounds, app)
        : centeredBounds(app);
      window.restoreBounds = null;
      window.responsiveMaximized = false;
      window.maximized = false;
      Object.assign(window, target);
      focusWindow(window);
      commit({ type: "restore", id });
      return getWindow(id);
    }

    function close(id) {
      const window = findWindow(id);
      if (!window) return null;
      rememberLayout(window);
      windows = windows.filter((item) => item.id !== id);
      commit({ type: "close", id });
      return snapshotWindow(window);
    }

    function closeAll() {
      if (!windows.length) return getSnapshot();
      windows.forEach(rememberLayout);
      windows = [];
      commit({ type: "closeAll" });
      return getSnapshot();
    }

    function getWindow(id) {
      const window = findWindow(id);
      return window ? snapshotWindow(window) : null;
    }

    function isReachable(id) {
      const window = findWindow(id);
      return Boolean(window && hasReachableTitlebar(window));
    }

    function getSnapshot() {
      return freeze({
        viewport: { width: viewport.width, height: viewport.height },
        windows: windows.map(snapshotWindow)
      });
    }

    function setViewport(nextViewport) {
      const wasSmallViewport = isSmallViewport();
      viewport = normalizeViewport(nextViewport);
      if (isSmallViewport()) {
        const topWindow = windows.slice().sort((a, b) => b.zIndex - a.zIndex)[0];
        windows.forEach((window) => {
          if (!wasSmallViewport && window.responsiveMinimized == null) {
            window.responsiveMinimized = window.minimized;
          }
          window.minimized = !topWindow || window.id !== topWindow.id;
          if (window === topWindow) {
            if (!wasSmallViewport && !window.maximized) {
              window.restoreBounds = currentBounds(window);
              window.responsiveMaximized = true;
            }
            window.maximized = true;
            applyMaximizedBounds(window);
          }
        });
      } else {
        windows.forEach((window) => {
          if (wasSmallViewport && window.responsiveMaximized) {
            const restored = window.restoreBounds || centeredBounds(apps.get(window.appId));
            Object.assign(window, constrainBounds(restored, apps.get(window.appId)));
            window.restoreBounds = null;
            window.maximized = false;
            window.responsiveMaximized = false;
          } else if (window.maximized) applyMaximizedBounds(window);
          else Object.assign(window, constrainBounds(window, apps.get(window.appId)));
          if (wasSmallViewport && window.responsiveMinimized != null) {
            window.minimized = window.responsiveMinimized;
            window.responsiveMinimized = null;
          }
        });
      }
      commit({ type: "setViewport" });
      return getSnapshot();
    }

    function createWindowId(app) {
      if (!app.multiInstance) return app.id;
      const instance = (nextInstance.get(app.id) || 0) + 1;
      nextInstance.set(app.id, instance);
      return `${app.id}:${instance}`;
    }

    function initialBounds(app) {
      if (isSmallViewport()) return { x: 0, y: 0, width: viewport.width, height: viewport.height };
      const highest = windows.slice().sort((a, b) => b.zIndex - a.zIndex)[0];
      const centered = centeredBounds(app);
      if (!highest) return centered;
      return constrainBounds({
        x: highest.x + CASCADE_OFFSET,
        y: highest.y + CASCADE_OFFSET,
        width: app.defaultSize.width,
        height: app.defaultSize.height
      }, app);
    }

    function centeredBounds(app) {
      return constrainBounds({
        x: Math.round((viewport.width - app.defaultSize.width) / 2),
        y: Math.round((viewport.height - app.defaultSize.height) / 2),
        width: app.defaultSize.width,
        height: app.defaultSize.height
      }, app);
    }

    function layoutToBounds(layout, app) {
      return constrainBounds(layout, app);
    }

    function applyMaximizedBounds(window) {
      Object.assign(window, { x: 0, y: 0, width: viewport.width, height: viewport.height });
    }

    function constrainBounds(bounds, app) {
      const requestedWidth = finite(bounds.width, app.defaultSize.width);
      const requestedHeight = finite(bounds.height, app.defaultSize.height);
      const width = clamp(requestedWidth, Math.min(app.minSize.width, viewport.width), viewport.width);
      const height = clamp(requestedHeight, Math.min(app.minSize.height, viewport.height), viewport.height);
      return {
        // Keep the titlebar below the menu bar (the work area's y=0).
        // Both side edges and the bottom remain unbounded for free dragging.
        x: finite(bounds.x, 0),
        y: Math.max(0, finite(bounds.y, 0)),
        width,
        height
      };
    }

    function focusWindow(window) {
      window.zIndex = ++zIndex;
    }

    function hasReachableTitlebar(window) {
      const visibleWidth = Math.min(viewport.width, window.x + window.width) - Math.max(0, window.x);
      const visibleHeight = Math.min(viewport.height, window.y + TITLEBAR_HEIGHT) - Math.max(0, window.y);
      return window.maximized || (
        visibleWidth >= Math.min(REACHABLE_TITLEBAR_WIDTH, window.width)
        && visibleHeight >= REACHABLE_TITLEBAR_HEIGHT
      );
    }

    function revealWindow(window) {
      // Recovery is opt-in on launch/Dock focus, never part of dragging.
      if (hasReachableTitlebar(window)) return;
      window.x = Math.max(0, Math.round((viewport.width - window.width) / 2));
      window.y = Math.max(0, Math.round((viewport.height - window.height) / 2));
    }

    function findWindow(id) {
      return windows.find((window) => window.id === id) || null;
    }

    function requireApp(appId) {
      const app = apps.get(appId);
      if (!app) throw new Error(`Unknown desktop app: ${appId}`);
      return app;
    }

    function isSmallViewport() {
      return viewport.width < SMALL_VIEWPORT_WIDTH;
    }

    function commit(event) {
      persistLayouts();
      publish(event);
    }

    function publish(event) {
      if (onChange) onChange(getSnapshot(), freeze({ ...event }));
    }

    function persistLayouts() {
      if (!storage || typeof storage.setItem !== "function") return;
      windows.forEach(rememberLayout);
      try {
        storage.setItem(storageKey, JSON.stringify({ windows: savedLayouts }));
      } catch (_) {
        // Persistence is optional; a full or unavailable store must not break window actions.
      }
    }

    function rememberLayout(window) {
      const bounds = window.responsiveMaximized && window.restoreBounds
        ? currentBounds(window.restoreBounds)
        : currentBounds(window);
      savedLayouts[window.id] = {
        ...bounds,
        restoreBounds: window.responsiveMaximized
          ? null
          : window.restoreBounds ? currentBounds(window.restoreBounds) : null
      };
    }

    const api = {
      registerApp,
      open,
      focus,
      move,
      resize,
      setBounds,
      minimize,
      maximize,
      restore,
      toggleMaximize,
      restoreForDrag,
      close,
      closeAll,
      getWindow,
      isReachable,
      getSnapshot,
      setViewport
    };

    return api;
  }

  function normalizeApp(app) {
    const defaultSize = app.defaultSize || {};
    const minSize = app.minSize || {};
    return {
      id: app.id,
      multiInstance: Boolean(app.multiInstance),
      defaultSize: {
        width: Math.max(1, finite(defaultSize.width, 640)),
        height: Math.max(1, finite(defaultSize.height, 440))
      },
      minSize: {
        width: Math.max(1, finite(minSize.width, 240)),
        height: Math.max(1, finite(minSize.height, 160))
      }
    };
  }

  function normalizeViewport(value) {
    const viewport = value || {};
    return {
      width: Math.max(1, finite(viewport.width, 1280)),
      height: Math.max(1, finite(viewport.height, 720))
    };
  }

  function readLayouts(storage, storageKey) {
    if (!storage || typeof storage.getItem !== "function") return {};
    try {
      const raw = storage.getItem(storageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.windows || typeof parsed.windows !== "object" || Array.isArray(parsed.windows)) return {};
      return Object.fromEntries(Object.entries(parsed.windows).flatMap(([id, layout]) => {
        if (!validBounds(layout)) return [];
        if (layout.restoreBounds != null && !validBounds(layout.restoreBounds)) return [];
        return [[id, {
          ...currentBounds(layout),
          restoreBounds: layout.restoreBounds ? currentBounds(layout.restoreBounds) : null
        }]];
      }));
    } catch (_) {
      return {};
    }
  }

  function currentBounds(bounds) {
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  }

  function validBounds(bounds) {
    return Boolean(
      bounds
      && typeof bounds === "object"
      && !Array.isArray(bounds)
      && Number.isFinite(bounds.x)
      && Number.isFinite(bounds.y)
      && Number.isFinite(bounds.width)
      && bounds.width > 0
      && Number.isFinite(bounds.height)
      && bounds.height > 0
    );
  }

  function snapshotWindow(window) {
    return freeze({
      id: window.id,
      appId: window.appId,
      x: window.x,
      y: window.y,
      width: window.width,
      height: window.height,
      zIndex: window.zIndex,
      minimized: window.minimized,
      maximized: window.maximized
    });
  }

  function freeze(value) {
    Object.keys(value).forEach((key) => {
      if (value[key] && typeof value[key] === "object" && !Object.isFrozen(value[key])) freeze(value[key]);
    });
    return Object.freeze(value);
  }

  function finite(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  return { createWindowManager };
});
