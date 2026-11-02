(function attachAiOsKernel(root) {
  "use strict";

  const STORAGE_KEY = "ai-os-disabled-components";
  const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;
  const registered = [];
  const registry = new Map();
  let stateCache = null;
  let disabled = readDisabled();

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function normalizeId(value) {
    const id = String(value || "").trim();
    if (!ID_PATTERN.test(id)) throw new Error(`Invalid AI OS component id: ${value}`);
    return id;
  }

  function normalizeScript(value) {
    const script = typeof value === "string" ? { src: value } : value;
    const src = String(script?.src || "").trim();
    if (!src || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(src)) {
      throw new Error(`AI OS component script must stay local: ${src}`);
    }
    if (src.split(/[?#]/, 1)[0].split(/[\\/]/).includes("..")) {
      throw new Error(`AI OS component script escapes the runtime root: ${src}`);
    }
    return { src };
  }

  function normalizeDependencies(value) {
    return [...new Set((Array.isArray(value) ? value : []).map(normalizeId))];
  }

  function normalizeComponent(definition) {
    const id = normalizeId(definition?.id);
    const label = String(definition?.label || id).trim();
    const version = String(definition?.version || "1.0.0").trim();
    const kind = String(definition?.kind || "module").trim();
    const scope = String(definition?.scope || kind).trim();
    const priority = Number.isFinite(Number(definition?.priority)) ? Number(definition.priority) : 100;
    const scripts = (Array.isArray(definition?.scripts) ? definition.scripts : []).map(normalizeScript);
    if (!label || !version || !kind || !scope) {
      throw new Error(`AI OS component ${id} has incomplete metadata.`);
    }
    return Object.freeze({
      id,
      label,
      version,
      kind,
      scope,
      priority,
      scripts: Object.freeze(scripts),
      dependencies: Object.freeze(normalizeDependencies(definition?.dependencies)),
      optionalDependencies: Object.freeze(normalizeDependencies(definition?.optionalDependencies)),
      deferOptionalDependencies: definition?.deferOptionalDependencies === true,
      startupCritical: definition?.startupCritical === true,
      loadAfter: Object.freeze(normalizeDependencies(definition?.loadAfter)),
      required: definition?.required !== false,
      enabledByDefault: definition?.enabledByDefault !== false,
    });
  }

  function readDisabled() {
    const values = new Set();
    if (Array.isArray(root.__AI_OS_DISABLED_COMPONENTS__)) {
      for (const value of root.__AI_OS_DISABLED_COMPONENTS__) {
        try { values.add(normalizeId(value)); } catch {}
      }
    }
    try {
      const stored = JSON.parse(root.localStorage?.getItem(STORAGE_KEY) || "[]");
      if (Array.isArray(stored)) {
        for (const value of stored) {
          try { values.add(normalizeId(value)); } catch {}
        }
      }
    } catch {}
    return values;
  }

  function persistDisabled() {
    try {
      root.localStorage?.setItem(STORAGE_KEY, JSON.stringify([...disabled].sort()));
    } catch {}
    try {
      root.dispatchEvent?.(new CustomEvent("ai-os-component-state-change", {
        detail: { disabled: [...disabled].sort() },
      }));
    } catch {}
  }

  function registerComponent(definition) {
    const component = normalizeComponent(definition);
    if (registry.has(component.id)) throw new Error(`AI OS component already registered: ${component.id}`);
    registry.set(component.id, component);
    registered.push(component.id);
    stateCache = null;
    return component;
  }

  function componentState(id, trail = new Set()) {
    const component = registry.get(id);
    if (!component) return { id, known: false, enabled: false, reason: "missing" };
    if (disabled.has(id) || (!component.enabledByDefault && !trail.has(`enabled:${id}`))) {
      return { id, known: true, enabled: false, reason: "disabled" };
    }
    if (trail.has(id)) throw new Error(`AI OS component dependency cycle: ${[...trail, id].join(" -> ")}`);
    const nextTrail = new Set(trail);
    nextTrail.add(id);
    for (const dependency of component.dependencies) {
      const state = componentState(dependency, nextTrail);
      if (!state.enabled) return { id, known: true, enabled: false, reason: `dependency:${dependency}` };
    }
    for (const dependency of component.loadAfter) {
      if (!registry.has(dependency)) continue;
      const state = componentState(dependency, nextTrail);
      if (!state.enabled) return { id, known: true, enabled: false, reason: `loadAfter:${dependency}` };
    }
    return { id, known: true, enabled: true, reason: "" };
  }

  function resolveStates() {
    if (stateCache) return stateCache;
    const states = new Map();
    for (const id of registered) states.set(id, componentState(id));
    stateCache = states;
    return states;
  }

  function getLoadPlan() {
    const states = resolveStates();
    const planned = new Set();
    const visiting = new Set();
    const scripts = [];

    function visit(id) {
      if (planned.has(id)) return;
      const component = registry.get(id);
      if (!component || !states.get(id)?.enabled) return;
      if (visiting.has(id)) throw new Error(`AI OS component dependency cycle: ${[...visiting, id].join(" -> ")}`);
      visiting.add(id);
      for (const dependency of component.dependencies) visit(dependency);
      for (const dependency of component.optionalDependencies) visit(dependency);
      for (const dependency of component.loadAfter) visit(dependency);
      visiting.delete(id);
      planned.add(id);
      for (const script of component.scripts) {
        scripts.push({
          componentId: component.id,
          componentLabel: component.label,
          kind: component.kind,
          scope: component.scope,
          priority: component.priority,
          required: component.required,
          dependencies: component.dependencies.slice(),
          optionalDependencies: component.optionalDependencies.slice(),
          deferOptionalDependencies: component.deferOptionalDependencies,
          startupCritical: component.startupCritical,
          src: script.src,
        });
      }
    }

    for (const id of registered) visit(id);
    return scripts;
  }

  function listComponents() {
    const states = resolveStates();
    return registered.map((id) => ({ ...clone(registry.get(id)), ...clone(states.get(id)) }));
  }

  function setComponentEnabled(id, enabled) {
    const normalized = normalizeId(id);
    if (!registry.has(normalized)) throw new Error(`Unknown AI OS component: ${normalized}`);
    if (!enabled && registry.get(normalized).required) {
      throw new Error(`AI OS component is required and cannot be disabled: ${normalized}`);
    }
    if (enabled) disabled.delete(normalized);
    else disabled.add(normalized);
    stateCache = null;
    persistDisabled();
    return componentState(normalized);
  }

  function getState() {
    return {
      format: 1,
      disabled: [...disabled].sort(),
      components: listComponents(),
      loadPlan: getLoadPlan(),
    };
  }

  root.AiOsKernel = Object.freeze({
    storageKey: STORAGE_KEY,
    registerComponent,
    getComponent: (id) => clone(registry.get(normalizeId(id))),
    listComponents,
    getLoadPlan,
    getState,
    isComponentEnabled: (id) => Boolean(componentState(normalizeId(id)).enabled),
    setComponentEnabled,
  });
})(typeof window !== "undefined" ? window : globalThis);
