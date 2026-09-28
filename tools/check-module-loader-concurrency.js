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

function createScenario(plan, delays = {}) {
  const events = [];
  let active = 0;
  let maxActive = 0;
  const appended = [];
  const completed = [];
  const components = [...new Map(
    plan.map((entry) => [entry.componentId, {
      id: entry.componentId,
      label: entry.componentId,
      priority: Number.isFinite(Number(entry.priority)) ? Number(entry.priority) : 100,
      required: entry.required !== false,
      dependencies: entry.dependencies || [],
      optionalDependencies: entry.optionalDependencies || [],
      deferOptionalDependencies: entry.deferOptionalDependencies === true,
      startupCritical: entry.startupCritical === true,
    }]),
  ).values()];
  const window = {
    AiOsKernel: {
      getLoadPlan: () => plan,
      listComponents: () => components,
    },
    CustomEvent: FakeCustomEvent,
    dispatchEvent(event) {
      events.push(event);
    },
  };
  const document = {
    head: {
      append(script) {
        active += 1;
        maxActive = Math.max(maxActive, active);
        appended.push(script.src);
        setTimeout(() => {
          active -= 1;
          completed.push(script.src);
          script.onload();
        }, delays[script.src] || 1);
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
    setTimeout,
    Promise,
  });

  return {
    window,
    events,
    appended,
    completed,
    get maxActive() {
      return maxActive;
    },
  };
}

function item(componentId, src, dependencies = [], options = {}) {
  return {
    componentId,
    componentLabel: componentId,
    kind: "test",
    scope: "test",
    required: options.required !== false,
    priority: Number.isFinite(Number(options.priority)) ? Number(options.priority) : 100,
    dependencies,
    optionalDependencies: options.optionalDependencies || [],
    deferOptionalDependencies: options.deferOptionalDependencies === true,
    startupCritical: options.startupCritical === true,
    src,
  };
}

async function waitForReport(scenario) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const report = scenario.window.AiOsModuleLoader.getReport();
    if (report.status !== "loading") return report;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("module loader did not finish");
}

async function waitForEvent(events, type) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const event = events.find((candidate) => candidate.type === type);
    if (event) return event;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`module loader did not emit ${type}`);
}

(async () => {
  const parallelPlan = Array.from({ length: 6 }, (_, index) => item(
    `parallel-${index}`,
    `./parallel-${index}.js`,
  ));
  const parallel = createScenario(parallelPlan, Object.fromEntries(
    parallelPlan.map((entry) => [entry.src, 30]),
  ));
  const parallelReport = await waitForReport(parallel);
  assert.equal(parallelReport.status, "ready");
  assert.ok(parallel.maxActive > 1, "independent components must load concurrently");
  assert.equal(parallel.completed.length, parallelPlan.length);

  const dependencyPlan = [
    item("dependency", "./dependency.js"),
    item("consumer", "./consumer.js", ["dependency"]),
  ];
  const dependency = createScenario(dependencyPlan, {
    "./dependency.js": 30,
    "./consumer.js": 1,
  });
  const dependencyReport = await waitForReport(dependency);
  assert.equal(dependencyReport.status, "ready");
  assert.deepStrictEqual(dependency.appended, ["./dependency.js", "./consumer.js"]);
  assert.deepStrictEqual(dependency.completed, ["./dependency.js", "./consumer.js"]);

  const priorityPlan = [
    item("optional-slow", "./optional-slow.js", [], { required: false, priority: 100 }),
    item("optional-slower", "./optional-slower.js", [], { required: false, priority: 100 }),
    item("critical", "./critical.js", [], { priority: 1 }),
  ];
  const priority = createScenario(priorityPlan, {
    "./optional-slow.js": 40,
    "./optional-slower.js": 40,
    "./critical.js": 1,
  });
  const priorityReport = await waitForReport(priority);
  assert.equal(priorityReport.status, "ready");
  assert.equal(
    priority.appended[0],
    "./critical.js",
    "a critical component must start before lower-priority optional work",
  );

  const optionalTailPlan = [
    item("optional-tail", "./optional-tail.js", [], { required: false, priority: 100 }),
    item("critical-dependency", "./critical-dependency.js", [], { priority: 10 }),
    item("critical-consumer", "./critical-consumer.js", ["critical-dependency"], {
      priority: 20,
      optionalDependencies: ["optional-tail"],
      deferOptionalDependencies: true,
    }),
  ];
  const optionalTail = createScenario(optionalTailPlan, {
    "./optional-tail.js": 40,
    "./critical-dependency.js": 1,
    "./critical-consumer.js": 1,
  });
  const optionalTailReport = await waitForReport(optionalTail);
  assert.equal(optionalTailReport.status, "ready");
  assert.ok(
    optionalTail.completed.indexOf("./critical-consumer.js") < optionalTail.completed.indexOf("./optional-tail.js"),
    "optional dependencies must not hold the critical path",
  );

  const blockingOptionalPlan = [
    item("blocking-optional", "./blocking-optional.js", [], { required: false, priority: 100 }),
    item("ordered-consumer", "./ordered-consumer.js", [], {
      priority: 1,
      optionalDependencies: ["blocking-optional"],
    }),
  ];
  const blockingOptional = createScenario(blockingOptionalPlan, {
    "./blocking-optional.js": 30,
    "./ordered-consumer.js": 1,
  });
  const blockingOptionalReport = await waitForReport(blockingOptional);
  assert.equal(blockingOptionalReport.status, "ready");
  assert.ok(
    blockingOptional.completed.indexOf("./blocking-optional.js") < blockingOptional.completed.indexOf("./ordered-consumer.js"),
    "regular optional dependencies must keep their initialization order",
  );

  const stagedPlan = [
    item("deferred-tail", "./deferred-tail.js", [], {
      required: false,
      priority: 1,
    }),
    item("critical-runtime", "./critical-runtime.js", [], {
      required: true,
      priority: 10,
      startupCritical: true,
    }),
  ];
  const staged = createScenario(stagedPlan, {
    "./deferred-tail.js": 20,
    "./critical-runtime.js": 10,
  });
  const deferredReady = staged.window.AiOsModuleLoader.ensure(["deferred-tail"]);
  await waitForEvent(staged.events, "ai-os-critical-load-complete");
  assert.equal(
    staged.appended[0],
    "./critical-runtime.js",
    "the critical component must start before deferred work",
  );
  assert.equal((await deferredReady).ok, true, "ensure() must wait for a deferred component on demand");
  assert.deepStrictEqual(staged.completed, ["./critical-runtime.js", "./deferred-tail.js"]);

  console.log("Module loader concurrency checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
