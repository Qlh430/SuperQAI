"use strict";

const assert = require("node:assert/strict");
const { createServerComponentKernel } = require("../core/server-component-kernel");
const { SERVER_COMPONENT_MANIFEST } = require("../server-components/manifest");
const { registerServerComponents } = require("../server-components");
const { runServerComponentPruningChecks } = require("./check-server-component-pruning");
const { runComponentContainerChecks } = require("./check-component-container");

async function checkStartupIsolation() {
  const events = [];
  const kernel = createServerComponentKernel({ logger: { error: () => {} } });
  kernel.register({
    id: "optional-failure",
    label: "Optional failure",
    required: false,
    priority: 10,
    start() {
      throw new Error("expected optional failure");
    },
  });
  kernel.register({
    id: "dependent-service",
    label: "Dependent service",
    priority: 20,
    optionalDependencies: ["optional-failure"],
    start() {
      events.push("dependent-service");
    },
    handle() {
      return false;
    },
  });
  kernel.register({
    id: "later-service",
    label: "Later service",
    priority: 30,
    start() {
      events.push("later-service");
    },
    handle() {
      return false;
    },
  });

  const state = await kernel.start();
  assert.deepStrictEqual(events, ["dependent-service", "later-service"]);
  assert.equal(state.components.find((component) => component.id === "optional-failure").status, "failed");
  assert.equal(state.components.find((component) => component.id === "dependent-service").status, "running");
  assert.equal(state.components.find((component) => component.id === "later-service").status, "running");
}

async function checkHandleOrderAndClaims() {
  const calls = [];
  const kernel = createServerComponentKernel();
  kernel.register({
    id: "late-handler",
    label: "Late handler",
    priority: 20,
    handle() {
      calls.push("late-handler");
      return false;
    },
  });
  kernel.register({
    id: "early-handler",
    label: "Early handler",
    priority: 10,
    handle() {
      calls.push("early-handler");
      return true;
    },
  });
  kernel.register({
    id: "never-reached",
    label: "Never reached",
    priority: 30,
    handle() {
      calls.push("never-reached");
      return true;
    },
  });
  assert.equal(await kernel.handle({}, {}), true);
  assert.deepStrictEqual(calls, ["early-handler"]);
}

async function checkRequiredFailureStopsStartup() {
  const events = [];
  const kernel = createServerComponentKernel();
  kernel.register({
    id: "early-service",
    label: "Early service",
    priority: 10,
    start() {
      events.push("early-service:start");
    },
    stop() {
      events.push("early-service:stop");
    },
  });
  kernel.register({
    id: "required-failure",
    label: "Required failure",
    priority: 20,
    start() {
      events.push("required-failure:start");
      throw new Error("required failure");
    },
  });
  await assert.rejects(() => kernel.start(), /required-failure failed to start/);
  assert.deepStrictEqual(events, ["early-service:start", "required-failure:start", "early-service:stop"]);
  assert.equal(kernel.getState().started, false);
  assert.equal(kernel.list().find((component) => component.id === "early-service").status, "stopped");
}

async function checkPublicHandlerPhase() {
  const calls = [];
  const kernel = createServerComponentKernel();
  kernel.register({
    id: "public-health",
    label: "Public health",
    publicHandle() {
      calls.push("public");
      return true;
    },
    handle() {
      calls.push("authenticated");
      return true;
    },
  });
  assert.equal(await kernel.handlePublic({}, {}), true);
  assert.deepStrictEqual(calls, ["public"]);
  assert.equal(await kernel.handle({}, {}), true);
  assert.deepStrictEqual(calls, ["public", "authenticated"]);
}

function checkManifestRegistration() {
  const kernel = createServerComponentKernel();
  const instances = Object.fromEntries(SERVER_COMPONENT_MANIFEST.map((component) => [
    component.id,
    { handle: () => false },
  ]));
  registerServerComponents({ kernel, instances });
  assert.equal(kernel.list().length, SERVER_COMPONENT_MANIFEST.length);
  assert.deepStrictEqual(
    kernel.list().map((component) => component.id),
    [
      "provider-telemetry-service",
      "provider-bootstrap-service",
      "image-model-catalog",
      "provider-catalog-service",
      "static-http-api",
      "system-http-api",
      "auth-http-api",
      "preferences-http-api",
      "provider-catalog-http-api",
      "provider-http-api",
      "comfyui-http-api",
      "skill-http-api",
      "background-removal-http-api",
      "image-generation-http-api",
      "media-generation-http-api",
      "resource-http-api",
      "online-http-api",
      "media-http-api",
      "image-sync-http-api",
      "image-job-http-api",
      "asset-library-http-api",
      "canvas-project-http-api",
      "canvas-storage-http-api",
      "canvas-agent-http-api",
      "chat-message-service",
      "chat-http-api",
      "history-http-api",
      "thumbnail-http-api",
    ],
  );
}

(async () => {
  await checkStartupIsolation();
  await checkHandleOrderAndClaims();
  await checkRequiredFailureStopsStartup();
  await checkPublicHandlerPhase();
  checkManifestRegistration();
  runComponentContainerChecks();
  await runServerComponentPruningChecks();
  console.log("Server component kernel checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
