"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "module-loader.js"), "utf8");

class FakeCustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
}

function component(id, options = {}) {
  return {
    id,
    label: options.label || id,
    required: options.required !== false,
    dependencies: options.dependencies || [],
    optionalDependencies: options.optionalDependencies || [],
  };
}

function item(id, src, options = {}) {
  const definition = component(id, options);
  return {
    componentId: id,
    componentLabel: definition.label,
    kind: options.required === false ? "optional" : "required",
    scope: "test",
    required: definition.required,
    dependencies: definition.dependencies,
    optionalDependencies: definition.optionalDependencies,
    src,
  };
}

function runScenario(plan, failingSources = []) {
  const events = [];
  const appended = [];
  const components = [...new Map(plan.map((entry) => [entry.componentId, component(entry.componentId, entry)])).values()];
  const window = {
    AiOsKernel: {
      getLoadPlan: () => plan,
      listComponents: () => components,
    },
    CustomEvent: FakeCustomEvent,
    dispatchEvent: (event) => events.push(event),
  };
  const document = {
    head: {
      append(script) {
        appended.push(script.src);
        queueMicrotask(() => {
          if (failingSources.includes(script.src)) script.onerror();
          else script.onload();
        });
      },
    },
    createElement() {
      return { dataset: {}, onload: null, onerror: null, src: "", async: true };
    },
  };

  vm.runInNewContext(source, {
    window,
    document,
    CustomEvent: FakeCustomEvent,
    console: { error: () => {} },
  });

  return { events, appended, window };
}

const optionalPlan = [
  item("optional-failure", "./optional-fails.js", { required: false }),
  item("dependent-on-optional", "./dependent.js", {
    required: false,
    dependencies: ["optional-failure"],
  }),
  item("required-sibling", "./required-sibling.js"),
];
const optionalScenario = runScenario(optionalPlan, ["./optional-fails.js"]);

const optionalDependencyPlan = [
  item("optional-failure", "./optional-fails.js", { required: false }),
  item("optional-consumer", "./consumer.js", {
    required: false,
    optionalDependencies: ["optional-failure"],
  }),
];
const optionalDependencyScenario = runScenario(optionalDependencyPlan, ["./optional-fails.js"]);

const requiredPlan = [
  item("required-failure", "./required-fails.js"),
  item("dependent-on-required", "./dependent-required.js", {
    dependencies: ["required-failure"],
  }),
  item("independent", "./independent.js"),
];
const requiredScenario = runScenario(requiredPlan, ["./required-fails.js"]);

setImmediate(() => {
  assert.deepStrictEqual(
    optionalScenario.appended,
    ["./optional-fails.js", "./required-sibling.js"],
    "an optional failure must load unrelated components and skip only hard dependents",
  );
  assert.equal(
    optionalScenario.events.some((event) => event.type === "ai-os-module-load-failed"),
    false,
    "an optional failure must not emit the fatal aggregate load failure",
  );
  const optionalComplete = optionalScenario.events.find((event) => event.type === "ai-os-module-load-complete");
  assert.ok(optionalComplete, "an optional failure must still complete the load plan");
  assert.equal(optionalComplete.detail.degraded, true);
  assert.deepStrictEqual(
    Array.from(optionalComplete.detail.failures, (failure) => failure.componentId),
    ["optional-failure"],
  );
  assert.deepStrictEqual(
    Array.from(optionalComplete.detail.skipped, (entry) => entry.componentId),
    ["dependent-on-optional"],
  );
  const optionalStatuses = optionalScenario.events
    .filter((event) => event.type === "ai-os-module-load-progress")
    .map((event) => event.detail.status);
  for (const status of ["loading", "failed", "skipped", "loaded"]) {
    assert.ok(optionalStatuses.includes(status), `optional concurrency must preserve ${status} progress`);
  }
  assert.equal(optionalStatuses.filter((status) => status === "failed").length, 1);
  assert.equal(optionalStatuses.filter((status) => status === "skipped").length, 1);
  assert.equal(
    optionalScenario.events.some((event) => event.type === "ai-os-module-load-degraded"),
    true,
  );
  assert.equal(optionalScenario.window.AiOsModuleLoader.getReport().status, "ready");

  assert.deepStrictEqual(
    optionalDependencyScenario.appended,
    ["./optional-fails.js", "./consumer.js"],
    "an optional dependency failure must not block its consumer",
  );
  const optionalDependencyComplete = optionalDependencyScenario.events
    .find((event) => event.type === "ai-os-module-load-complete");
  assert.ok(optionalDependencyComplete);
  assert.equal(optionalDependencyComplete.detail.degraded, true);
  assert.equal(optionalDependencyComplete.detail.skipped.length, 0);

  assert.deepStrictEqual(
    requiredScenario.appended,
    ["./required-fails.js", "./independent.js"],
    "a required failure must not prevent independent components from loading",
  );
  const requiredFailure = requiredScenario.events.find((event) => event.type === "ai-os-module-load-failed");
  assert.ok(requiredFailure, "a required component failure must emit the aggregate load failure");
  assert.deepStrictEqual(
    Array.from(requiredFailure.detail.error.failures, (failure) => failure.componentId),
    ["required-failure"],
  );
  assert.deepStrictEqual(
    Array.from(requiredFailure.detail.error.skipped, (entry) => entry.componentId),
    ["dependent-on-required"],
  );
  assert.equal(
    requiredScenario.events.some((event) => event.type === "ai-os-module-load-complete"),
    false,
  );
  assert.equal(requiredScenario.window.AiOsModuleLoader.getReport().status, "failed");

  console.log("Module loader failure isolation checks passed.");
});
