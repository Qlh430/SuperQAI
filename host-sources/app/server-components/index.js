"use strict";

const { SERVER_COMPONENT_MANIFEST } = require("./manifest");

function requestPathname(req) {
  try {
    return new URL(req?.url || "/", `http://${req?.headers?.host || "localhost"}`).pathname;
  } catch {
    return "/";
  }
}

function matchesRoutePrefix(pathname, prefixes) {
  return prefixes.some((prefix) => (
    pathname === prefix
    || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`)
  ));
}

function hasLifecycleHook(instance) {
  return Boolean(instance) && (
    typeof instance.handle === "function"
    || typeof instance.publicHandle === "function"
    || typeof instance.start === "function"
    || typeof instance.stop === "function"
  );
}

function resolveComponentInstance(source, definition) {
  if (typeof source !== "function") return source;
  const instance = source({ id: definition.id, definition });
  if (instance && typeof instance.then === "function") {
    throw new TypeError(`Server component factory must be synchronous: ${definition.id}`);
  }
  return instance;
}

/**
 * When an optional component is pruned we still occupy its routes so a client
 * gets an explicit reason instead of a generic 404 that looks like a bad URL.
 */
function createUnavailableHandler(definition) {
  const prefixes = [...(definition.routePrefixes || [])];
  if (!prefixes.length) return null;
  return function handleUnavailable(req, res, { sendJson }) {
    if (!matchesRoutePrefix(requestPathname(req), prefixes)) return false;
    sendJson(res, 503, {
      error: `${definition.label} 组件未安装，功能暂不可用。`,
      code: "server_component_unavailable",
      componentId: definition.id,
      routes: prefixes,
    });
    return true;
  };
}

function registerServerComponents({
  kernel,
  instances = {},
  disabled = [],
  sendJson,
} = {}) {
  if (!kernel || typeof kernel.register !== "function") {
    throw new TypeError("Server component registration requires a component kernel.");
  }
  const disabledIds = new Set((Array.isArray(disabled) ? disabled : []).map((id) => String(id || "").trim()).filter(Boolean));
  const report = { pruned: [], disabled: [], unavailable: [], failed: [] };

  function registerUnavailable(definition) {
    if (typeof sendJson !== "function") return;
    const handle = createUnavailableHandler(definition);
    if (!handle) return;
    report.unavailable.push(definition.id);
    kernel.register({
      ...definition,
      required: false,
      handle: (req, res) => handle(req, res, { sendJson }),
    });
  }

  for (const definition of SERVER_COMPONENT_MANIFEST) {
    const explicitlyDisabled = disabledIds.has(definition.id);

    if (explicitlyDisabled) {
      if (definition.required) {
        throw new TypeError(`Server component is required and cannot be disabled: ${definition.id}`);
      }
      report.disabled.push(definition.id);
      registerUnavailable(definition);
      continue;
    }

    let instance;
    try {
      instance = resolveComponentInstance(instances[definition.id], definition);
    } catch (error) {
      if (definition.required) {
        throw new TypeError(`Server component failed to construct: ${definition.id}: ${error?.message || error}`, { cause: error });
      }
      report.failed.push(Object.freeze({ id: definition.id, error }));
      report.pruned.push(definition.id);
      registerUnavailable(definition);
      continue;
    }

    if (hasLifecycleHook(instance)) {
      kernel.register({
        ...definition,
        handle: instance.handle,
        publicHandle: instance.publicHandle,
        start: instance.start,
        stop: instance.stop,
      });
      continue;
    }

    if (definition.required) {
      throw new TypeError(`Server component instance is missing: ${definition.id}`);
    }
    report.pruned.push(definition.id);
    registerUnavailable(definition);
  }

  return Object.freeze({
    kernel,
    pruned: Object.freeze([...report.pruned]),
    disabled: Object.freeze([...report.disabled]),
    unavailable: Object.freeze([...report.unavailable]),
    failed: Object.freeze([...report.failed]),
  });
}

module.exports = { registerServerComponents, matchesRoutePrefix };
