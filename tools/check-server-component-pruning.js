"use strict";

const assert = require("node:assert/strict");
const { createServerComponentKernel } = require("../core/server-component-kernel");
const { SERVER_COMPONENT_MANIFEST } = require("../server-components/manifest");
const { registerServerComponents, matchesRoutePrefix } = require("../server-components");

function request(url, method = "GET") {
  return { url, method, headers: { host: "localhost" } };
}

function responseRecorder() {
  return {
    status: 0,
    body: null,
    sendJson(_res, status, body) {
      this.status = status;
      this.body = body;
    },
  };
}

function stubInstances(ids) {
  return Object.fromEntries(ids.map((id) => [id, { handle: () => false }]));
}

const REQUIRED_IDS = SERVER_COMPONENT_MANIFEST
  .filter((component) => component.required)
  .map((component) => component.id);
const OPTIONAL_IDS = SERVER_COMPONENT_MANIFEST
  .filter((component) => !component.required)
  .map((component) => component.id);

function checkManifestShape() {
  const ids = SERVER_COMPONENT_MANIFEST.map((component) => component.id);
  assert.equal(new Set(ids).size, ids.length, "Server component ids must be unique.");
  assert.ok(REQUIRED_IDS.length > 0, "The manifest must keep a required spine.");
  assert.ok(OPTIONAL_IDS.length > 0, "The manifest must expose prunable feature components.");

  const requiredSet = new Set(REQUIRED_IDS);
  for (const component of SERVER_COMPONENT_MANIFEST) {
    for (const dependency of component.dependencies || []) {
      assert.ok(
        requiredSet.has(dependency),
        `${component.id} hard-depends on prunable component ${dependency}; pruning would break startup.`,
      );
    }
  }

  for (const component of SERVER_COMPONENT_MANIFEST) {
    if (component.kind !== "http-api") continue;
    assert.ok(
      Array.isArray(component.routePrefixes) && component.routePrefixes.length > 0,
      `HTTP API component ${component.id} must declare routePrefixes so pruning degrades visibly.`,
    );
  }
}

function checkFullRegistrationStillWorks() {
  const kernel = createServerComponentKernel();
  const report = registerServerComponents({
    kernel,
    instances: stubInstances(SERVER_COMPONENT_MANIFEST.map((component) => component.id)),
    sendJson: () => {},
  });
  assert.deepStrictEqual([...report.pruned], []);
  assert.deepStrictEqual([...report.disabled], []);
  assert.deepStrictEqual([...report.failed], []);
  assert.equal(kernel.list().length, SERVER_COMPONENT_MANIFEST.length);
}

async function checkFactoriesAreLazyAndRunOnce() {
  const calls = [];
  const kernel = createServerComponentKernel();
  const instances = stubInstances(REQUIRED_IDS);
  instances["thumbnail-http-api"] = ({ id }) => {
    calls.push(id);
    return { handle: () => false };
  };
  const report = registerServerComponents({
    kernel,
    instances,
    disabled: ["thumbnail-http-api"],
    sendJson: () => {},
  });
  assert.deepStrictEqual(calls, [], "A disabled component factory must never run.");
  assert.deepStrictEqual([...report.disabled], ["thumbnail-http-api"]);

  const enabledKernel = createServerComponentKernel();
  const enabledInstances = stubInstances(REQUIRED_IDS);
  enabledInstances["thumbnail-http-api"] = ({ id }) => {
    calls.push(`enabled:${id}`);
    return { handle: () => false };
  };
  registerServerComponents({
    kernel: enabledKernel,
    instances: enabledInstances,
    sendJson: () => {},
  });
  assert.deepStrictEqual(calls, ["enabled:thumbnail-http-api"], "An enabled factory must run exactly once.");
  await enabledKernel.start();
}

async function checkOptionalFactoryFailureDegrades() {
  const kernel = createServerComponentKernel({ logger: { error: () => {} } });
  const instances = stubInstances(REQUIRED_IDS);
  instances["thumbnail-http-api"] = () => {
    throw new Error("expected thumbnail factory failure");
  };
  const report = registerServerComponents({
    kernel,
    instances,
    sendJson: (res, status, body) => res.sendJson(res, status, body),
  });
  assert.ok(report.pruned.includes("thumbnail-http-api"));
  assert.deepStrictEqual(report.failed.map((entry) => entry.id), ["thumbnail-http-api"]);
  assert.match(report.failed[0].error.message, /expected thumbnail factory failure/);
  assert.ok(report.unavailable.includes("thumbnail-http-api"));

  const response = responseRecorder();
  const claimed = await kernel.handle(request("/api/image-thumbnails"), response);
  assert.equal(claimed, true);
  assert.equal(response.status, 503);
  assert.equal(response.body.componentId, "thumbnail-http-api");
}

function checkRequiredFactoryFailureStopsStartup() {
  const kernel = createServerComponentKernel();
  const instances = stubInstances(SERVER_COMPONENT_MANIFEST.map((component) => component.id));
  instances["auth-http-api"] = () => {
    throw new Error("expected auth factory failure");
  };
  assert.throws(
    () => registerServerComponents({ kernel, instances, sendJson: () => {} }),
    /Server component failed to construct: auth-http-api: expected auth factory failure/,
  );
}

async function checkPrunedOptionalComponentsDegrade() {
  const kernel = createServerComponentKernel({ logger: { error: () => {} } });
  const report = registerServerComponents({
    kernel,
    instances: stubInstances(REQUIRED_IDS),
    sendJson: (res, status, body) => res.sendJson(res, status, body),
  });

  assert.deepStrictEqual([...report.pruned].sort(), [...OPTIONAL_IDS].sort());
  assert.ok(report.unavailable.length > 0, "Pruned HTTP components must still claim their routes.");

  const state = await kernel.start();
  assert.equal(state.started, true);
  for (const component of state.components) {
    assert.equal(component.status, "running", `${component.id} should be running after pruning optional peers.`);
  }

  const pending = kernel.list();
  for (const id of REQUIRED_IDS) {
    assert.ok(pending.some((component) => component.id === id), `${id} must survive pruning.`);
  }

  // A pruned feature must answer on its own route with an explicit reason.
  const prunedRoute = kernel.list().some((component) => component.id === "thumbnail-http-api");
  assert.equal(prunedRoute, true);
  const response = responseRecorder();
  const claimed = await kernel.handle(request("/api/image-thumbnails"), response);
  assert.equal(claimed, true);
  assert.equal(response.status, 503);
  assert.equal(response.body.code, "server_component_unavailable");
  assert.equal(response.body.componentId, "thumbnail-http-api");

  // Routes nobody owns must still fall through untouched.
  assert.equal(await kernel.handle(request("/api/not-owned"), responseRecorder()), false);
}

async function checkDisabledOptionalComponentDegrades() {
  const kernel = createServerComponentKernel({ logger: { error: () => {} } });
  const report = registerServerComponents({
    kernel,
    instances: stubInstances(SERVER_COMPONENT_MANIFEST.map((component) => component.id)),
    disabled: ["background-removal-http-api", "canvas-agent-http-api"],
    sendJson: () => {},
  });
  assert.deepStrictEqual([...report.disabled].sort(), ["background-removal-http-api", "canvas-agent-http-api"]);
  assert.deepStrictEqual([...report.pruned], []);
  assert.ok(report.unavailable.includes("background-removal-http-api"));
  await kernel.start();
  assert.equal(kernel.getState().started, true);
}

function checkMissingRequiredComponentStillFails() {
  const kernel = createServerComponentKernel();
  assert.throws(
    () => registerServerComponents({
      kernel,
      instances: stubInstances(OPTIONAL_IDS),
      sendJson: () => {},
    }),
    /Server component instance is missing: provider-telemetry-service/,
  );
}

function checkDisablingRequiredComponentFails() {
  const kernel = createServerComponentKernel();
  assert.throws(
    () => registerServerComponents({
      kernel,
      instances: stubInstances(SERVER_COMPONENT_MANIFEST.map((component) => component.id)),
      disabled: ["auth-http-api"],
      sendJson: () => {},
    }),
    /required and cannot be disabled: auth-http-api/,
  );
}

function checkRouteMatching() {
  assert.equal(matchesRoutePrefix("/api/image-jobs", ["/api/image-jobs"]), true);
  assert.equal(matchesRoutePrefix("/api/image-jobs/42", ["/api/image-jobs"]), true);
  assert.equal(matchesRoutePrefix("/api/image-jobs-extra", ["/api/image-jobs"]), false);
  assert.equal(matchesRoutePrefix("/api/canvas-agent/turn", ["/api/canvas-agent/"]), true);
  assert.equal(matchesRoutePrefix("/api/canvas-agent", ["/api/canvas-agent/"]), false);
}

async function runServerComponentPruningChecks() {
  checkManifestShape();
  checkFullRegistrationStillWorks();
  await checkFactoriesAreLazyAndRunOnce();
  await checkOptionalFactoryFailureDegrades();
  checkRequiredFactoryFailureStopsStartup();
  await checkPrunedOptionalComponentsDegrade();
  await checkDisabledOptionalComponentDegrades();
  checkMissingRequiredComponentStillFails();
  checkDisablingRequiredComponentFails();
  checkRouteMatching();
}

module.exports = { runServerComponentPruningChecks };

if (require.main === module) {
  runServerComponentPruningChecks().then(() => {
    console.log("Server component pruning checks passed.");
  }).catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}
