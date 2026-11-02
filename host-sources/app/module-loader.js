(function bootAiOsModules() {
  "use strict";

  const kernel = window.AiOsKernel;
  if (!kernel) throw new Error("AI OS module kernel is unavailable.");

  const plan = kernel.getLoadPlan();
  const componentById = new Map(
    (kernel.listComponents?.() || []).map((component) => [component.id, component]),
  );
  let report = Object.freeze({
    status: "loading",
    completed: 0,
    total: plan.length,
    failures: Object.freeze([]),
    skipped: Object.freeze([]),
    degraded: false,
    criticalReady: false,
  });
  let ensureImplementation = () => Promise.resolve({ ok: true, components: {}, missing: [] });
  window.AiOsModuleLoader = Object.freeze({
    plan,
    getReport: () => report,
    ensure: (componentIds) => ensureImplementation(componentIds),
    componentForScript(src) {
      const match = plan.find((item) => item.src === src);
      return match?.componentId || "";
    },
  });

  function componentFor(item) {
    return componentById.get(item.componentId) || {
      id: item.componentId,
      label: item.componentLabel || item.componentId,
      priority: Number.isFinite(Number(item.priority)) ? Number(item.priority) : 100,
      required: item.required !== false,
      dependencies: Array.isArray(item.dependencies) ? item.dependencies : [],
      optionalDependencies: Array.isArray(item.optionalDependencies) ? item.optionalDependencies : [],
      deferOptionalDependencies: item.deferOptionalDependencies === true,
      startupCritical: item.startupCritical === true,
    };
  }

  function emitProgress(item, completed, total, status, extra = {}) {
    window.dispatchEvent?.(new CustomEvent("ai-os-module-load-progress", {
      detail: {
        componentId: item.componentId,
        componentLabel: item.componentLabel,
        src: item.src,
        completed,
        total,
        status,
        ...extra,
      },
    }));
  }

  const MAX_CONCURRENT_COMPONENTS = 8;

  function groupPlanByComponent() {
    const groups = [];
    const groupsById = new Map();
    for (const item of plan) {
      let group = groupsById.get(item.componentId);
      if (!group) {
        const component = componentFor(item);
        group = {
          id: component.id,
          label: component.label,
          priority: component.priority,
          required: component.required !== false,
          dependencies: Array.isArray(component.dependencies) ? component.dependencies.slice() : [],
          optionalDependencies: Array.isArray(component.optionalDependencies) ? component.optionalDependencies.slice() : [],
          deferOptionalDependencies: component.deferOptionalDependencies === true,
          startupCritical: component.startupCritical === true,
          items: [],
          state: "pending",
          order: groups.length,
        };
        groupsById.set(group.id, group);
        groups.push(group);
      }
      group.items.push(item);
    }
    return groups;
  }

  function criticalGroupIds(groups) {
    const groupsById = new Map(groups.map((group) => [group.id, group]));
    const critical = new Set();
    function visit(componentId) {
      if (critical.has(componentId)) return;
      const group = groupsById.get(componentId);
      if (!group) return;
      critical.add(componentId);
      for (const dependency of group.dependencies) visit(dependency);
    }
    for (const group of groups) {
      if (group.startupCritical) visit(group.id);
    }
    return critical;
  }

  async function loadComponents() {
    const failures = [];
    const skipped = [];
    const groups = groupPlanByComponent();
    const groupStates = new Map();
    const groupDone = new Map();
    const settledGroups = new Set();
    const total = plan.length;
    const criticalIds = criticalGroupIds(groups);
    const stagedStartup = criticalIds.size > 0;
    const criticalTotal = plan.filter((item) => criticalIds.has(item.componentId)).length;
    let completed = 0;
    let activeComponents = 0;
    let pumping = false;
    let repump = false;
    let criticalSettled = !stagedStartup;
    let deferredStarted = !stagedStartup;
    let loadFailed = false;

    for (const group of groups) {
      group.state = stagedStartup && !criticalIds.has(group.id) ? "deferred" : "pending";
      groupStates.set(group.id, group.state);
      let resolveDone;
      groupDone.set(group.id, new Promise((resolve) => {
        resolveDone = resolve;
      }));
      group.resolveDone = resolveDone;
    }
    const groupsById = new Map(groups.map((group) => [group.id, group]));

    function resolveGroup(group) {
      if (settledGroups.has(group.id)) return;
      settledGroups.add(group.id);
      group.resolveDone?.();
    }

    function dependencyState(componentId) {
      return groupStates.get(componentId) || "loaded";
    }

    function dependenciesSettled(group) {
      const optionalDependencies = group.deferOptionalDependencies ? [] : group.optionalDependencies;
      return [...group.dependencies, ...optionalDependencies]
        .every((dependency) => !["pending", "loading", "deferred"].includes(dependencyState(dependency)));
    }

    function blockersFor(group) {
      const blockers = [];
      for (const dependency of group.dependencies) {
        const state = dependencyState(dependency);
        if (state === "failed") blockers.push({ dependency, reason: "failed" });
        else if (state === "blocked") blockers.push({ dependency, reason: "blocked" });
      }
      return blockers;
    }

    function recordSkipped(group, item, reason, extra = {}) {
      skipped.push({
        componentId: group.id,
        componentLabel: group.label,
        src: item.src,
        required: group.required,
        ...extra,
        reason,
      });
      completed += 1;
      emitProgress(item, completed, total, "skipped", { reason, ...extra });
    }

    async function runComponent(group) {
      const blockers = blockersFor(group);
      if (blockers.length) {
        group.state = "blocked";
        groupStates.set(group.id, group.state);
        for (const item of group.items) {
          recordSkipped(group, item, "dependency-unavailable", { blockedBy: blockers });
        }
        resolveGroup(group);
        return;
      }

      group.state = "loading";
      groupStates.set(group.id, group.state);
      let componentFailed = false;
      for (const item of group.items) {
        if (componentFailed) {
          recordSkipped(group, item, "component-failed", { blockedBy: [] });
          continue;
        }
        let itemFailed = false;
        emitProgress(item, completed, total, "loading");
        try {
          await new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = item.src;
            script.async = false;
            script.dataset.aiOsComponent = item.componentId;
            script.dataset.aiOsKind = item.kind;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`AI OS component failed to load: ${item.componentId} (${item.src})`));
            document.head.append(script);
          });
        } catch (error) {
          itemFailed = true;
          componentFailed = true;
          const failure = {
            componentId: group.id,
            componentLabel: group.label,
            src: item.src,
            required: group.required,
            critical: criticalIds.has(group.id),
            message: String(error?.message || error),
          };
          failures.push(failure);
          window.dispatchEvent?.(new CustomEvent("ai-os-component-load-failed", {
            detail: failure,
          }));
        }
        completed += 1;
        emitProgress(item, completed, total, itemFailed ? "failed" : "loaded");
      }
      group.state = componentFailed ? "failed" : "loaded";
      groupStates.set(group.id, group.state);
      resolveGroup(group);
    }

    function startDeferredGroups() {
      if (deferredStarted) return;
      deferredStarted = true;
      for (const group of groups) {
        if (group.state === "deferred") {
          group.state = "pending";
          groupStates.set(group.id, group.state);
        }
      }
    }

    function settleCriticalPhase() {
      if (criticalSettled) return false;
      const criticalGroups = groups.filter((group) => criticalIds.has(group.id));
      if (criticalGroups.some((group) => ["pending", "loading"].includes(group.state))) return false;
      criticalSettled = true;
      const criticalFailures = failures.filter((failure) => criticalIds.has(failure.componentId));
      const criticalSkipped = skipped.filter((entry) => criticalIds.has(entry.componentId));
      report = Object.freeze({
        ...report,
        criticalReady: true,
        criticalCompleted: criticalTotal,
        criticalTotal,
        criticalFailures: Object.freeze(criticalFailures.slice()),
      });
      window.dispatchEvent?.(new CustomEvent("ai-os-critical-load-complete", {
        detail: {
          criticalCompleted: criticalTotal,
          criticalTotal,
          failed: criticalFailures.length > 0 || criticalSkipped.length > 0,
          failures: criticalFailures,
          skipped: criticalSkipped,
        },
      }));
      startDeferredGroups();
      return true;
    }

    function finalizeReport() {
      const requiredFailures = failures.filter((failure) => failure.required);
      const requiredSkipped = skipped.filter((item) => item.required);
      report = Object.freeze({
        ...report,
        status: requiredFailures.length || requiredSkipped.length ? "failed" : "ready",
        completed,
        total,
        failures: Object.freeze(failures.slice()),
        skipped: Object.freeze(skipped.slice()),
        degraded: failures.length > 0 || skipped.length > 0,
        criticalReady: true,
      });
      return { requiredFailures, requiredSkipped };
    }

    function completePlan() {
      if (loadFailed) return;
      if (groups.some((group) => ["pending", "loading", "deferred"].includes(group.state))) return;
      loadFailed = true;
      const { requiredFailures, requiredSkipped } = finalizeReport();
      if (requiredFailures.length || requiredSkipped.length) {
        const error = Object.assign(
          new Error(`AI OS required components failed to load: ${[
            ...requiredFailures.map((failure) => failure.componentId),
            ...requiredSkipped.map((item) => item.componentId),
          ].join(", ")}`),
          { failures: requiredFailures, skipped: requiredSkipped, report },
        );
        console.error(error);
        window.dispatchEvent?.(new CustomEvent("ai-os-module-load-failed", { detail: { error } }));
        return;
      }
      if (report.degraded) {
        window.dispatchEvent?.(new CustomEvent("ai-os-module-load-degraded", {
          detail: { failures, skipped, report },
        }));
      }
      window.dispatchEvent?.(new CustomEvent("ai-os-module-load-complete", {
        detail: {
          completed,
          total,
          degraded: report.degraded,
          failures,
          skipped,
        },
      }));
    }

    function pump() {
      if (pumping) {
        repump = true;
        return;
      }
      pumping = true;
      do {
        repump = false;
        while (activeComponents < MAX_CONCURRENT_COMPONENTS) {
          const next = groups
            .filter((group) => group.state === "pending" && dependenciesSettled(group))
            .sort((left, right) => left.priority - right.priority || left.order - right.order)[0];
          if (!next) break;
          next.state = "loading";
          groupStates.set(next.id, next.state);
          activeComponents += 1;
          Promise.resolve()
            .then(() => runComponent(next))
            .catch((error) => {
              const failure = {
                componentId: next.id,
                componentLabel: next.label,
                src: next.items[0]?.src || "",
                required: next.required,
                critical: criticalIds.has(next.id),
                message: String(error?.message || error),
              };
              failures.push(failure);
              next.state = "failed";
              groupStates.set(next.id, next.state);
              resolveGroup(next);
            })
            .finally(() => {
              activeComponents -= 1;
              pump();
              completePlan();
            });
        }
        if (settleCriticalPhase()) repump = true;
      } while (repump);
      pumping = false;
      completePlan();
    }

    ensureImplementation = async (componentIds) => {
      const requested = [...new Set(
        (Array.isArray(componentIds) ? componentIds : [componentIds])
          .map((componentId) => String(componentId || "").trim())
          .filter(Boolean),
      )];
      const missing = requested.filter((componentId) => !groupsById.has(componentId));
      await Promise.all(requested
        .filter((componentId) => groupsById.has(componentId))
        .map((componentId) => groupDone.get(componentId)));
      const components = Object.fromEntries(requested.map((componentId) => [
        componentId,
        groupsById.has(componentId) ? groupStates.get(componentId) : "missing",
      ]));
      const ok = requested.every((componentId) => {
        const state = components[componentId];
        return state !== "failed" && state !== "blocked" && state !== "missing";
      });
      return { ok, components, missing };
    };

    pump();
  }

  loadComponents().catch((error) => {
    console.error(error);
    window.dispatchEvent?.(new CustomEvent("ai-os-module-load-failed", { detail: { error } }));
  });
})();
