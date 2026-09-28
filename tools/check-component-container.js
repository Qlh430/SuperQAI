"use strict";

const assert = require("node:assert/strict");
const { createComponentContainer } = require("../core/component-container");

const silentLogger = { warn: () => {}, error: () => {} };

function checkConstructionIsDeferredUntilBoot() {
  const calls = [];
  const container = createComponentContainer({ logger: silentLogger });
  container.define("optional-thing", {
    component: "optional-thing",
    required: false,
    factory: () => {
      calls.push("optional-thing");
      return {};
    },
  });
  container.define("used", {
    component: "core",
    factory: () => {
      calls.push("used");
      return { ready: true };
    },
  });
  assert.deepStrictEqual(calls, [], "Defining a node must not construct it.");
  container.boot();
  assert.deepStrictEqual(calls, ["optional-thing", "used"], "Boot must build every enabled node, in definition order.");
}

function checkDisabledComponentNeverConstructs() {
  const calls = [];
  const container = createComponentContainer({ disabled: ["thumbnail-http-api"], logger: silentLogger });
  container.define("thumbnail-store", {
    component: "thumbnail-http-api",
    required: false,
    factory: () => {
      calls.push("thumbnail-store");
      return { heavy: true };
    },
  });
  container.define("required-core", {
    component: "platform-core",
    factory: () => "core",
  });

  container.boot();
  assert.deepStrictEqual(calls, [], "A disabled component's factories must never run.");
  assert.equal(container.get("required-core"), "core");
  assert.equal(container.tryGet("thumbnail-store"), null);
  assert.equal(container.isDisabled("thumbnail-http-api"), true);
  assert.throws(() => container.get("thumbnail-store"), /is disabled/);
  const entry = container.report().find((node) => node.id === "thumbnail-store");
  assert.equal(entry.status, "disabled");
}

function checkOptionalFailureIsIsolated() {
  const container = createComponentContainer({ logger: silentLogger });
  container.define("flaky-optional", {
    component: "chat-http-api",
    required: false,
    factory: () => {
      throw new Error("expected optional boom");
    },
  });
  container.define("still-required", {
    component: "platform-core",
    factory: () => "alive",
  });

  const report = container.boot();
  assert.equal(container.get("still-required"), "alive");
  assert.equal(container.tryGet("flaky-optional"), null);
  assert.equal(report.find((node) => node.id === "flaky-optional").status, "failed");
}

function checkRequiredFailureStopsBoot() {
  const container = createComponentContainer({ logger: silentLogger });
  container.define("required-boom", {
    component: "platform-core",
    factory: () => {
      throw new Error("expected required boom");
    },
  });
  assert.throws(() => container.boot(), /expected required boom/);
  assert.throws(() => container.get("required-boom"), /expected required boom/);
}

function checkDependenciesAreInjectedInOrder() {
  const container = createComponentContainer({ logger: silentLogger });
  container.define("first", { component: "core", factory: () => 1 });
  container.define("second", { component: "core", factory: () => 2 });
  container.define("combined", {
    component: "core",
    requires: ["first", "second"],
    factory: ({ dependencies }) => dependencies[0] + dependencies[1],
  });
  assert.equal(container.get("combined"), 3);
}

function checkFailedDependencyBlocksDependent() {
  const container = createComponentContainer({ logger: silentLogger });
  container.define("broken-optional", {
    component: "optional-feature",
    required: false,
    factory: () => {
      throw new Error("upstream gone");
    },
  });
  container.define("dependent-optional", {
    component: "optional-feature",
    required: false,
    requires: ["broken-optional"],
    factory: () => "unreachable",
  });
  const report = container.boot();
  const dependent = report.find((node) => node.id === "dependent-optional");
  assert.equal(dependent.status, "failed");
  assert.match(dependent.error, /dependency broken-optional is unavailable/);
  assert.equal(container.tryGet("dependent-optional"), null);
}

function checkMissingAndUnknownNodes() {
  const container = createComponentContainer({ logger: silentLogger });
  container.define("lonely", {
    component: "core",
    requires: ["does-not-exist"],
    required: false,
    factory: () => "unreachable",
  });
  container.boot();
  assert.throws(() => container.get("nope"), /Unknown component node/);
  assert.equal(container.tryGet("nope"), null);
  assert.match(container.report().find((node) => node.id === "lonely").error, /requires undefined node/);
}

function checkCycleDetection() {
  const container = createComponentContainer({ logger: silentLogger });
  container.define("a", { component: "core", requires: ["b"], factory: () => "a" });
  container.define("b", { component: "core", requires: ["a"], factory: () => "b" });
  assert.throws(() => container.get("a"), /dependency cycle/);
}

function checkDefinitionsAreFrozenAfterBoot() {
  const container = createComponentContainer({ logger: silentLogger });
  container.define("a", { component: "core", factory: () => "a" });
  assert.throws(() => container.define("a", { component: "core", factory: () => "a" }), /already defined/);
  container.boot();
  assert.throws(() => container.define("b", { component: "core", factory: () => "b" }), /after the container has booted/);
}

function checkDisableAfterDefinition() {
  const calls = [];
  const container = createComponentContainer({ logger: silentLogger });
  container.define("late-disabled", {
    component: "late-feature",
    required: false,
    factory: () => {
      calls.push("late-disabled");
      return "built";
    },
  });
  container.disable("late-feature");
  container.boot();
  assert.deepStrictEqual(calls, []);
  assert.equal(container.tryGet("late-disabled"), null);
}

function runComponentContainerChecks() {
  checkConstructionIsDeferredUntilBoot();
  checkDisabledComponentNeverConstructs();
  checkOptionalFailureIsIsolated();
  checkRequiredFailureStopsBoot();
  checkDependenciesAreInjectedInOrder();
  checkFailedDependencyBlocksDependent();
  checkMissingAndUnknownNodes();
  checkCycleDetection();
  checkDefinitionsAreFrozenAfterBoot();
  checkDisableAfterDefinition();
}

module.exports = { runComponentContainerChecks };

if (require.main === module) {
  runComponentContainerChecks();
  console.log("Component container checks passed.");
}
