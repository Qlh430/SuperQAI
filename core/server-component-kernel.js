"use strict";

const COMPONENT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

function componentError(code, message, cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), { code });
}

function createServerComponentKernel({ logger = console } = {}) {
  const definitions = new Map();
  const states = new Map();
  let registrationOrder = [];
  let loadOrder = [];
  let started = false;

  function normalizeId(value, label = "component id") {
    const id = String(value || "").trim();
    if (!COMPONENT_ID_PATTERN.test(id)) throw new TypeError(`Invalid server ${label}: ${value}`);
    return id;
  }

  function normalizeIds(value, fallback = []) {
    return [...new Set((Array.isArray(value) ? value : fallback).map((id) => normalizeId(id, "dependency id")))];
  }

  function normalizeDefinition(input) {
    const id = normalizeId(input?.id);
    const label = String(input?.label || id).trim();
    const version = String(input?.version || "1.0.0").trim();
    const kind = String(input?.kind || "service").trim();
    const priority = Number.isFinite(Number(input?.priority)) ? Number(input.priority) : 100;
    const handle = typeof input?.handle === "function" ? input.handle : null;
    const publicHandle = typeof input?.publicHandle === "function" ? input.publicHandle : null;
    const start = typeof input?.start === "function" ? input.start : null;
    const stop = typeof input?.stop === "function" ? input.stop : null;
    if (!label || !version || !kind) throw new TypeError(`Server component ${id} has incomplete metadata.`);
    if (!handle && !publicHandle && !start && !stop) throw new TypeError(`Server component ${id} does not expose any lifecycle hook.`);
    return Object.freeze({
      id,
      label,
      version,
      kind,
      priority,
      required: input?.required !== false,
      dependencies: Object.freeze(normalizeIds(input?.dependencies)),
      optionalDependencies: Object.freeze(normalizeIds(input?.optionalDependencies)),
      handle,
      publicHandle,
      start,
      stop,
    });
  }

  function register(input) {
    if (started) throw componentError("server_component_started", "Cannot register a component after startup.");
    const definition = normalizeDefinition(input);
    if (definitions.has(definition.id)) throw componentError("server_component_duplicate", `Server component already registered: ${definition.id}`);
    definitions.set(definition.id, definition);
    registrationOrder.push(definition.id);
    states.set(definition.id, { status: "registered", error: null });
    loadOrder = [];
    return definition;
  }

  function resolveLoadOrder() {
    if (loadOrder.length) return loadOrder;
    const resolved = [];
    const visiting = new Set();
    const visited = new Set();

    function visit(id, trail) {
      if (visited.has(id)) return;
      if (visiting.has(id)) throw componentError("server_component_cycle", `Server component dependency cycle: ${[...trail, id].join(" -> ")}`);
      const definition = definitions.get(id);
      if (!definition) {
        const requiredBy = trail.at(-1) || "server";
        throw componentError("server_component_missing", `Server component ${requiredBy} requires missing component ${id}.`);
      }
      visiting.add(id);
      definition.dependencies.forEach((dependency) => visit(dependency, [...trail, id]));
      definition.optionalDependencies.forEach((dependency) => {
        if (definitions.has(dependency)) visit(dependency, [...trail, id]);
      });
      visiting.delete(id);
      visited.add(id);
      resolved.push(id);
    }

    registrationOrder
      .map((id) => definitions.get(id))
      .sort((left, right) => left.priority - right.priority || registrationOrder.indexOf(left.id) - registrationOrder.indexOf(right.id))
      .forEach((definition) => visit(definition.id, []));
    loadOrder = resolved;
    return loadOrder;
  }

  function dependencyFailed(definition) {
    return [...definition.dependencies, ...definition.optionalDependencies]
      .filter((id) => definitions.has(id))
      .find((id) => states.get(id)?.status === "failed") || "";
  }

  async function rollbackStartedComponents() {
    for (const id of [...resolveLoadOrder()].reverse()) {
      const definition = definitions.get(id);
      const state = states.get(id);
      if (!definition.stop || state.status !== "running") continue;
      try {
        await definition.stop({ id, definition });
        state.status = "stopped";
        state.error = null;
      } catch (error) {
        state.status = "failed";
        state.error = error;
        logger.error?.(`[server-component] ${id} failed to roll back: ${error?.message || error}`);
      }
    }
  }

  async function start() {
    if (started) return getState();
    started = true;
    try {
      for (const id of resolveLoadOrder()) {
        const definition = definitions.get(id);
        const state = states.get(id);
        const failedDependency = dependencyFailed(definition);
        if (failedDependency && definition.dependencies.includes(failedDependency)) {
          state.status = "failed";
          state.error = `required dependency failed: ${failedDependency}`;
          if (definition.required) {
            throw componentError(
              "server_component_dependency_failed",
              `Server component ${id} cannot start because ${failedDependency} failed.`,
            );
          }
          continue;
        }
        try {
          state.status = "starting";
          await definition.start?.({ id, definition });
          state.status = "running";
          state.error = null;
        } catch (error) {
          state.status = "failed";
          state.error = error;
          if (definition.required) {
            throw componentError("server_component_start_failed", `Server component ${id} failed to start: ${error?.message || error}`, error);
          }
          logger.error?.(`[server-component] ${id} failed to start: ${error?.message || error}`);
        }
      }
      return getState();
    } catch (error) {
      await rollbackStartedComponents();
      started = false;
      throw error;
    }
  }

  async function handleWith(handlerName, req, res) {
    if (!started) await start();
    for (const id of resolveLoadOrder()) {
      const definition = definitions.get(id);
      const state = states.get(id);
      const handler = definition[handlerName];
      if (!handler || state.status !== "running") continue;
      try {
        if (await handler(req, res)) return true;
      } catch (error) {
        error.componentId = id;
        throw error;
      }
    }
    return false;
  }

  async function handle(req, res) {
    return handleWith("handle", req, res);
  }

  async function handlePublic(req, res) {
    return handleWith("publicHandle", req, res);
  }

  async function stop() {
    for (const id of [...resolveLoadOrder()].reverse()) {
      const definition = definitions.get(id);
      const state = states.get(id);
      if (!definition.stop || state.status !== "running") continue;
      try {
        await definition.stop({ id, definition });
        state.status = "stopped";
        state.error = null;
      } catch (error) {
        state.status = "failed";
        state.error = error;
        logger.error?.(`[server-component] ${id} failed to stop: ${error?.message || error}`);
      }
    }
    started = false;
  }

  function list() {
    return resolveLoadOrder().map((id) => {
      const definition = definitions.get(id);
      const state = states.get(id);
      return {
        id,
        label: definition.label,
        version: definition.version,
        kind: definition.kind,
        priority: definition.priority,
        required: definition.required,
        dependencies: [...definition.dependencies],
        optionalDependencies: [...definition.optionalDependencies],
        status: state.status,
        error: state.error ? String(state.error?.message || state.error) : "",
      };
    });
  }

  function getState() {
    return {
      format: 1,
      started,
      components: list(),
    };
  }

  return Object.freeze({
    register,
    start,
    stop,
    handle,
    handlePublic,
    get: (id) => definitions.get(normalizeId(id)) || null,
    list,
    getState,
  });
}

module.exports = { createServerComponentKernel };
