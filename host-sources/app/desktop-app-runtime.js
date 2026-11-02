"use strict";

(function exposeAppRuntime(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.AiOsAppRuntime = api;
  }
})(typeof globalThis === "object" ? globalThis : this, function createApi() {
  const PROTOCOL = "ai-os/v1";
  const IFRAME_SANDBOX = "allow-scripts allow-forms";
  const MAX_MESSAGE_ARGS_BYTES = 256 * 1024;

  function createAppRuntime(options) {
    const config = options || {};
    const documentRef = config.document;
    const sessionProvider = typeof config.sessionProvider === "function" ? config.sessionProvider : () => null;
    const invokeHost = typeof config.invokeHost === "function" ? config.invokeHost : null;
    const apps = new Map();
    const mounts = new Map();

    function register(manifest) {
      const app = normalizeManifest(manifest);
      if (apps.has(app.id)) {
        throw new Error("An app manifest is already registered for id: " + app.id);
      }
      apps.set(app.id, app);
      return api;
    }

    function listVisible() {
      const session = currentSession();
      if (!session) return [];
      return Array.from(apps.values())
        .filter((app) => canAccess(app, session))
        .map(publicManifest);
    }

    function mount(appId, options) {
      const app = requireApp(appId);
      const session = requireSession(app);
      const mountOptions = normalizeMountOptions(options);
      const instanceId = mountOptions.instanceId || app.id;
      const existing = findMount(app.id, instanceId);
      if (existing) return existing;

      if (!app.multiInstance) {
        const singleMount = findAnyMount(app.id);
        if (singleMount) return singleMount;
      }

      if (!mountOptions.container || typeof mountOptions.container.appendChild !== "function") {
        throw new TypeError("Mounting an app requires a container with appendChild.");
      }

      const record = {
        appId: app.id,
        instanceId,
        app: publicManifest(app),
        container: mountOptions.container,
        node: null,
        active: false
      };

      if (app.adapter === "iframe") {
        record.node = mountIframe(documentRef, app, mountOptions.container);
      } else {
        const context = createContext(app, record, session);
        const node = callLegacy(app, "mount", context);
        if (node && typeof node === "object") {
          record.node = node;
          if (node.parentNode !== mountOptions.container) mountOptions.container.appendChild(node);
        }
      }

      mounts.set(mountKey(app.id, instanceId), record);
      return record;
    }

    function activate(appId, options) {
      const record = requireMount(appId, options);
      if (record.active) return record;
      if (record.app.adapter === "legacy-dom") {
        callLegacy(requireApp(record.appId), "onActivate", createContext(requireApp(record.appId), record, currentSession()));
      }
      record.active = true;
      return record;
    }

    function deactivate(appId, options) {
      const record = requireMount(appId, options);
      if (!record.active) return record;
      if (record.app.adapter === "legacy-dom") {
        callLegacy(requireApp(record.appId), "onDeactivate", createContext(requireApp(record.appId), record, currentSession()));
      }
      record.active = false;
      return record;
    }

    function unmount(appId, options) {
      const record = requireMount(appId, options);
      const app = requireApp(record.appId);
      if (app.adapter === "legacy-dom") {
        callLegacy(app, "unmount", createContext(app, record, currentSession()));
      }
      if (record.node && record.node.parentNode && typeof record.node.parentNode.removeChild === "function") {
        record.node.parentNode.removeChild(record.node);
      }
      mounts.delete(mountKey(record.appId, record.instanceId));
      return record;
    }

    async function handleMessage(event) {
      const data = event && event.data;
      if (!data || typeof data !== "object" || data.protocol !== PROTOCOL || typeof data.id !== "string" || !data.id || typeof data.action !== "string") {
        return false;
      }
      const record = Array.from(mounts.values()).find((mount) => mount.app.adapter === "iframe" && mount.node && mount.node.contentWindow === event.source);
      if (!record) return false;

      if (event.origin !== "null") return false;
      const targetOrigin = "*";
      const app = requireApp(record.appId);
      if (!app.allowedActions.includes(data.action)) {
        sendReply(record.node.contentWindow, {
          protocol: PROTOCOL,
          id: data.id,
          ok: false,
          error: "Host action is not permitted for this app."
        }, targetOrigin);
        return true;
      }

      try {
        const session = requireSession(app);
        const safeArgs = validateMessageArgs(data.args);
        if (!invokeHost) throw new Error("No host action handler is available.");
        const result = await invokeHost({ appId: app.id, action: data.action, args: safeArgs, session });
        sendReply(record.node.contentWindow, { protocol: PROTOCOL, id: data.id, ok: true, result }, targetOrigin);
        return true;
      } catch (error) {
        sendReply(record.node.contentWindow, { protocol: PROTOCOL, id: data.id, ok: false, error: errorMessage(error) }, targetOrigin);
        return true;
      }
    }

    const api = { register, listVisible, mount, activate, deactivate, unmount, handleMessage };
    return api;

    function currentSession() {
      return sessionProvider() || null;
    }

    function requireSession(app) {
      const session = currentSession();
      if (!session) throw new Error("Mounting an app requires an active session.");
      if (!canAccess(app, session)) throw new Error("App is not permitted for the current role.");
      return session;
    }

    function requireApp(appId) {
      if (typeof appId !== "string" || !apps.has(appId)) {
        throw new Error("No app manifest is registered for id: " + appId);
      }
      return apps.get(appId);
    }

    function findMount(appId, instanceId) {
      return mounts.get(mountKey(appId, instanceId)) || null;
    }

    function findAnyMount(appId) {
      return Array.from(mounts.values()).find((mount) => mount.appId === appId) || null;
    }

    function requireMount(appId, options) {
      const mountOptions = normalizeMountOptions(options);
      const record = findMount(appId, mountOptions.instanceId || appId) || (!mountOptions.instanceId && findAnyMount(appId));
      if (!record) throw new Error("App is not mounted: " + appId);
      return record;
    }
  }

  function normalizeManifest(manifest) {
    if (!manifest || typeof manifest !== "object") throw manifestError("an object");
    const id = requiredString(manifest.id, "id");
    const label = requiredString(manifest.label, "label");
    if (manifest.adapter !== "legacy-dom" && manifest.adapter !== "iframe") throw manifestError("a supported adapter");
    if (!Array.isArray(manifest.roles) || manifest.roles.length === 0 || manifest.roles.some((role) => typeof role !== "string" || !role)) throw manifestError("roles as a non-empty array of non-empty strings");
    validateSize(manifest.defaultSize, "defaultSize");
    validateSize(manifest.minSize, "minSize");
    if (typeof manifest.multiInstance !== "boolean") throw manifestError("multiInstance as a boolean");
    if (manifest.defaultSize.width < manifest.minSize.width || manifest.defaultSize.height < manifest.minSize.height) {
      throw manifestError("defaultSize no smaller than minSize");
    }

    const normalized = {
      id,
      label,
      adapter: manifest.adapter,
      roles: manifest.roles.slice(),
      defaultSize: { width: manifest.defaultSize.width, height: manifest.defaultSize.height },
      minSize: { width: manifest.minSize.width, height: manifest.minSize.height },
      multiInstance: manifest.multiInstance,
      legacy: manifest.legacy || manifest
    };
    if (manifest.adapter === "iframe") {
      if (!isRelativeTarget(manifest.target)) throw manifestError("a same-origin relative iframe target");
      if (!Array.isArray(manifest.allowedActions) || manifest.allowedActions.some((action) => typeof action !== "string" || !action)) {
        throw manifestError("allowedActions as an array of non-empty strings");
      }
      normalized.target = manifest.target;
      normalized.allowedActions = manifest.allowedActions.slice();
    }
    return Object.freeze(normalized);
  }

  function publicManifest(app) {
    return Object.freeze({
      id: app.id,
      label: app.label,
      adapter: app.adapter,
      roles: app.roles.slice(),
      defaultSize: { width: app.defaultSize.width, height: app.defaultSize.height },
      minSize: { width: app.minSize.width, height: app.minSize.height },
      multiInstance: app.multiInstance,
      ...(app.adapter === "iframe" ? { target: app.target, allowedActions: app.allowedActions.slice() } : {})
    });
  }

  function validateSize(value, label) {
    if (!value || typeof value !== "object" || !isPositiveNumber(value.width) || !isPositiveNumber(value.height)) {
      throw manifestError(label + " with positive width and height");
    }
  }

  function isPositiveNumber(value) {
    return typeof value === "number" && Number.isFinite(value) && value > 0;
  }

  function requiredString(value, label) {
    if (typeof value !== "string" || !value.trim()) throw manifestError(label + " as a non-empty string");
    return value;
  }

  function manifestError(detail) {
    return new TypeError("Invalid app manifest: expected " + detail + ".");
  }

  function isRelativeTarget(value) {
    if (typeof value !== "string"
      || value === ""
      || /[\u0000-\u0020\u007f]/.test(value)
      || value.includes("\\")
      || value.startsWith("//")
      || /^[a-z][a-z0-9+.-]*:/i.test(value)) {
      return false;
    }
    try {
      const base = new URL("https://ai-os.invalid/");
      const resolved = new URL(value, base);
      return resolved.origin === base.origin;
    } catch (_error) {
      return false;
    }
  }

  function validateMessageArgs(args) {
    if (args === undefined) return undefined;
    assertJsonCompatible(args);
    let serialized;
    try {
      serialized = JSON.stringify(args);
    } catch (_error) {
      throw new Error("Host action arguments must be JSON-serializable.");
    }
    if (typeof serialized !== "string") {
      throw new Error("Host action arguments must be JSON-serializable.");
    }
    if (utf8ByteLength(serialized) > MAX_MESSAGE_ARGS_BYTES) {
      throw new Error("Host action arguments exceed the 256 KiB limit.");
    }
    return JSON.parse(serialized);
  }

  function assertJsonCompatible(root) {
    const stack = [root];
    const seen = new WeakSet();
    let nodes = 0;
    while (stack.length) {
      const value = stack.pop();
      if (value === null || typeof value === "string" || typeof value === "boolean") continue;
      if (typeof value === "number") {
        if (!Number.isFinite(value)) throw new Error("Host action arguments must contain finite JSON numbers.");
        continue;
      }
      if (typeof value !== "object") {
        throw new Error("Host action arguments must contain JSON values only.");
      }
      if (seen.has(value)) throw new Error("Host action arguments must be JSON-serializable.");
      seen.add(value);
      nodes += 1;
      if (nodes > 10000) throw new Error("Host action arguments contain too many values.");

      const prototype = Object.getPrototypeOf(value);
      if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
        throw new Error("Host action arguments must contain JSON objects and arrays only.");
      }
      const keys = Reflect.ownKeys(value);
      if (keys.some((key) => typeof key === "symbol")) {
        throw new Error("Host action arguments must not contain symbol keys.");
      }
      if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index += 1) {
          if (!Object.prototype.hasOwnProperty.call(value, index)) {
            throw new Error("Host action argument arrays must not contain empty slots.");
          }
        }
      }
      for (const key of keys) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || descriptor.get || descriptor.set) {
          throw new Error("Host action arguments must contain data properties only.");
        }
        if (descriptor.enumerable) stack.push(descriptor.value);
      }
    }
  }

  function utf8ByteLength(value) {
    let length = 0;
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code <= 0x7f) {
        length += 1;
      } else if (code <= 0x7ff) {
        length += 2;
      } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
        const next = value.charCodeAt(index + 1);
        if (next >= 0xdc00 && next <= 0xdfff) {
          length += 4;
          index += 1;
        } else {
          length += 3;
        }
      } else {
        length += 3;
      }
    }
    return length;
  }

  function canAccess(app, session) {
    const roles = Array.isArray(session && session.roles)
      ? session.roles
      : Array.isArray(session && session.user && session.user.roles)
        ? session.user.roles
        : typeof (session && session.user && session.user.role) === "string"
          ? [session.user.role]
          : typeof (session && session.role) === "string" ? [session.role] : [];
    return app.roles.some((role) => roles.includes(role));
  }

  function normalizeMountOptions(options) {
    if (options && typeof options.appendChild === "function") return { container: options };
    return options && typeof options === "object" ? options : {};
  }

  function mountKey(appId, instanceId) {
    return appId + "\u0000" + instanceId;
  }

  function mountIframe(documentRef, app, container) {
    if (!documentRef || typeof documentRef.createElement !== "function") {
      throw new Error("Mounting an iframe app requires a document.");
    }
    const iframe = documentRef.createElement("iframe");
    iframe.setAttribute("src", app.target);
    iframe.setAttribute("sandbox", IFRAME_SANDBOX);
    container.appendChild(iframe);
    return iframe;
  }

  function callLegacy(app, method, context) {
    const handler = app.legacy && app.legacy[method];
    return typeof handler === "function" ? handler(context) : undefined;
  }

  function createContext(app, record, session) {
    return { app: publicManifest(app), instanceId: record.instanceId, container: record.container, node: record.node, session: session || null };
  }

  function sendReply(target, message, origin) {
    if (target && typeof target.postMessage === "function") target.postMessage(message, origin);
  }

  function errorMessage(error) {
    return error && typeof error.message === "string" ? error.message : "Host action failed.";
  }

  return { createAppRuntime };
});
