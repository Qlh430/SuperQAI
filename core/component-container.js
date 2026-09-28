"use strict";

const NODE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

function containerError(code, message, cause) {
  return Object.assign(new Error(message, cause ? { cause } : undefined), { code });
}

/**
 * Lazy, failure-isolated dependency container for server components.
 *
 * The point is not elegance, it is blast radius: a node that belongs to a
 * disabled component is never constructed at all, and a node that blows up
 * while being optional degrades to `null` instead of taking the process down
 * with it. Required nodes still fail loudly, because a half-built system that
 * pretends to be healthy is worse than a startup error.
 */
function createComponentContainer({ logger = console, disabled = [] } = {}) {
  const definitions = new Map();
  const states = new Map();
  const order = [];
  const resolving = [];
  const disabledComponents = new Set(
    (Array.isArray(disabled) ? disabled : []).map((id) => String(id || "").trim()).filter(Boolean),
  );
  let booted = false;

  function normalizeId(value, label = "node id") {
    const id = String(value || "").trim();
    if (!NODE_ID_PATTERN.test(id)) throw new TypeError(`Invalid component container ${label}: ${value}`);
    return id;
  }

  function define(id, spec = {}) {
    if (booted) throw containerError("container_booted", "Cannot define a node after the container has booted.");
    const nodeId = normalizeId(id);
    if (definitions.has(nodeId)) throw containerError("container_duplicate", `Component node already defined: ${nodeId}`);
    if (typeof spec.factory !== "function") throw new TypeError(`Component node ${nodeId} requires a factory.`);
    const component = spec.component ? String(spec.component).trim() : "";
    const definition = Object.freeze({
      id: nodeId,
      component,
      required: spec.required !== false,
      requires: Object.freeze([...(spec.requires || [])].map((value) => normalizeId(value, "dependency id"))),
      factory: spec.factory,
    });
    definitions.set(nodeId, definition);
    order.push(nodeId);
    states.set(nodeId, { status: "defined", value: undefined, error: null });
    return definition;
  }

  function isComponentDisabled(definition) {
    return Boolean(definition.component) && disabledComponents.has(definition.component);
  }

  function resolveRequiredDependencies(definition) {
    const values = [];
    for (const dependencyId of definition.requires) {
      const dependency = definitions.get(dependencyId);
      if (!dependency) {
        throw containerError("container_missing_dependency", `Component node ${definition.id} requires undefined node ${dependencyId}.`);
      }
      try {
        values.push(get(dependencyId));
      } catch (error) {
        throw containerError(
          "container_dependency_failed",
          `Component node ${definition.id} cannot build because dependency ${dependencyId} is unavailable: ${error?.message || error}`,
          error,
        );
      }
    }
    return values;
  }

  function build(definition) {
    const state = states.get(definition.id);
    if (state.status === "ready" || state.status === "failed" || state.status === "disabled") return state;
    if (resolving.includes(definition.id)) {
      throw containerError("container_cycle", `Component container dependency cycle: ${[...resolving, definition.id].join(" -> ")}`);
    }
    resolving.push(definition.id);
    try {
      const dependencies = resolveRequiredDependencies(definition);
      state.status = "building";
      state.value = definition.factory({ get, tryGet, dependencies, definition });
      state.status = "ready";
      state.error = null;
    } catch (error) {
      state.status = "failed";
      state.error = error;
      state.value = undefined;
      if (definition.required) throw error;
      logger.warn?.(`[component-container] ${definition.id} degraded: ${error?.message || error}`);
    } finally {
      resolving.pop();
    }
    return state;
  }

  function get(id) {
    const nodeId = normalizeId(id);
    const definition = definitions.get(nodeId);
    if (!definition) throw containerError("container_unknown", `Unknown component node: ${nodeId}`);
    const state = states.get(nodeId);
    if (state.status === "defined") {
      if (isComponentDisabled(definition)) {
        state.status = "disabled";
        state.value = undefined;
      } else {
        build(definition);
      }
    }
    if (state.status === "disabled") {
      throw containerError("container_component_disabled", `Component node ${nodeId} is disabled (${definition.component}).`);
    }
    if (state.status === "failed") {
      throw state.error || containerError("container_failed", `Component node ${nodeId} failed.`);
    }
    return state.value;
  }

  function tryGet(id) {
    try {
      return get(id);
    } catch {
      return null;
    }
  }

  function boot() {
    if (booted) return report();
    booted = true;
    for (const id of order) {
      const definition = definitions.get(id);
      try {
        get(id);
      } catch (error) {
        if (definition.required) throw error;
      }
    }
    return report();
  }

  function report() {
    return order.map((id) => {
      const definition = definitions.get(id);
      const state = states.get(id);
      return {
        id,
        component: definition.component,
        required: definition.required,
        requires: [...definition.requires],
        status: state.status,
        error: state.error ? String(state.error?.message || state.error) : "",
      };
    });
  }

  function isDisabled(componentId) {
    return disabledComponents.has(String(componentId || "").trim());
  }

  function disable(componentId) {
    const value = String(componentId || "").trim();
    if (!value) return;
    disabledComponents.add(value);
  }

  return Object.freeze({
    define,
    get,
    tryGet,
    boot,
    report,
    isDisabled,
    disable,
    disabledComponents: () => [...disabledComponents],
  });
}

module.exports = { createComponentContainer };
