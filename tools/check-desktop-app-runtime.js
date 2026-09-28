"use strict";

const assert = require("node:assert/strict");
const { createAppRuntime } = require("../desktop-app-runtime");

function createContainer() {
  return {
    children: [],
    appendChild(node) {
      this.children.push(node);
      node.parentNode = this;
      return node;
    },
    removeChild(node) {
      const index = this.children.indexOf(node);
      if (index >= 0) this.children.splice(index, 1);
      node.parentNode = null;
      return node;
    }
  };
}

function createFakeDocument() {
  const frames = [];
  return {
    location: { origin: "https://desktop.test" },
    frames,
    createElement(tagName) {
      assert.equal(tagName, "iframe", "iframe apps may only create iframe elements");
      const attributes = new Map();
      const frame = {
        attributes,
        contentWindow: {
          messages: [],
          postMessage(message, origin) {
            this.messages.push({ message, origin });
          }
        },
        setAttribute(name, value) {
          attributes.set(name, String(value));
        },
        getAttribute(name) {
          return attributes.get(name) || null;
        }
      };
      frames.push(frame);
      return frame;
    }
  };
}

function legacyManifest(id, roles, multiInstance, lifecycle) {
  return {
    id,
    label: id + " app",
    adapter: "legacy-dom",
    roles,
    defaultSize: { width: 640, height: 420 },
    minSize: { width: 320, height: 240 },
    multiInstance,
    legacy: lifecycle
  };
}

async function main() {
{
  const runtime = createAppRuntime({ document: createFakeDocument(), sessionProvider: () => ({ roles: ["member"] }) });
  for (const field of ["id", "label", "adapter", "roles", "defaultSize", "minSize", "multiInstance"]) {
    const manifest = legacyManifest("broken", ["member"], false, {});
    delete manifest[field];
    assert.throws(() => runtime.register(manifest), /manifest/i, "register validates " + field);
  }
  assert.throws(
    () => runtime.register({
      id: "bad-frame", label: "Bad frame", adapter: "iframe", roles: ["member"],
      defaultSize: { width: 640, height: 420 }, minSize: { width: 320, height: 240 }, multiInstance: false,
      target: "https://untrusted.example/app", allowedActions: ["ping"]
    }),
    /target/i,
    "iframe manifests require a same-origin relative target"
  );
  assert.throws(
    () => runtime.register({
      id: "spaced-frame", label: "Spaced frame", adapter: "iframe", roles: ["member"],
      defaultSize: { width: 640, height: 420 }, minSize: { width: 320, height: 240 }, multiInstance: false,
      target: "  //untrusted.example/app", allowedActions: ["ping"]
    }),
    /target/i,
    "iframe target validation cannot be bypassed with leading whitespace"
  );
  for (const target of ["h\tttps://untrusted.example/app", "java\nscript:alert(1)"]) {
    assert.throws(
      () => runtime.register({
        id: "control-frame", label: "Control frame", adapter: "iframe", roles: ["member"],
        defaultSize: { width: 640, height: 420 }, minSize: { width: 320, height: 240 }, multiInstance: false,
        target, allowedActions: ["ping"]
      }),
      /target/i,
      "iframe target validation rejects embedded ASCII whitespace"
    );
  }
  for (const target of ["https://ai-os.invalid/app", "//ai-os.invalid/app"]) {
    assert.throws(
      () => runtime.register({
        id: "absolute-frame", label: "Absolute frame", adapter: "iframe", roles: ["member"],
        defaultSize: { width: 640, height: 420 }, minSize: { width: 320, height: 240 }, multiInstance: false,
        target, allowedActions: ["ping"]
      }),
      /target/i,
      "iframe targets must be relative even when they resemble the validator base"
    );
  }
  assert.throws(
    () => runtime.register({
      id: "no-actions", label: "No actions", adapter: "iframe", roles: ["member"],
      defaultSize: { width: 640, height: 420 }, minSize: { width: 320, height: 240 }, multiInstance: false,
      target: "/apps/frame.html"
    }),
    /allowedActions/i,
    "iframe manifests require an action whitelist"
  );
  assert.throws(
    () => runtime.register(legacyManifest("no-roles", [], false, {})),
    /roles/i,
    "role allowlists fail closed when empty"
  );
}

{
  let session = { roles: ["member"] };
  const runtime = createAppRuntime({ document: createFakeDocument(), sessionProvider: () => session });
  runtime.register(legacyManifest("notes", ["member"], false, {}));
  runtime.register(legacyManifest("admin", ["admin"], false, {}));
  assert.deepEqual(runtime.listVisible().map((app) => app.id), ["notes"], "visible apps are role-filtered");
  assert.throws(() => runtime.mount("admin", { container: createContainer() }), /not permitted/i, "mount rejects a role denied by the manifest");
  session = null;
  assert.deepEqual(runtime.listVisible(), [], "a signed-out user sees no business apps");
  assert.throws(() => runtime.mount("notes", { container: createContainer() }), /active session/i, "mount rejects signed-out users");
}

{
  const runtime = createAppRuntime({ document: createFakeDocument(), sessionProvider: () => ({ user: { role: "superadmin" } }) });
  runtime.register(legacyManifest("accounts", ["superadmin"], false, {}));
  assert.deepEqual(runtime.listVisible().map((app) => app.id), ["accounts"], "the runtime supports the real auth session user.role shape");
}

{
  const lifecycle = [];
  const runtime = createAppRuntime({ document: createFakeDocument(), sessionProvider: () => ({ roles: ["member"] }) });
  runtime.register(legacyManifest("notes", ["member"], false, {
    mount() {
      lifecycle.push("mount");
      return { kind: "legacy-node" };
    },
    onActivate() { lifecycle.push("activate"); },
    onDeactivate() { lifecycle.push("deactivate"); },
    unmount() { lifecycle.push("unmount"); }
  }));
  const container = createContainer();
  const first = runtime.mount("notes", { container });
  const second = runtime.mount("notes", { container: createContainer() });
  assert.equal(first, second, "single-instance apps reuse the existing mount");
  assert.deepEqual(lifecycle, ["mount"], "a reused mount does not rerun legacy setup");
  assert.equal(container.children[0].kind, "legacy-node", "legacy mount output is attached to the supplied host");
  runtime.activate("notes");
  runtime.deactivate("notes");
  runtime.unmount("notes");
  assert.deepEqual(lifecycle, ["mount", "activate", "deactivate", "unmount"], "legacy lifecycle hooks run explicitly");
}

{
  let activateAttempts = 0;
  let deactivateAttempts = 0;
  const runtime = createAppRuntime({ document: createFakeDocument(), sessionProvider: () => ({ roles: ["member"] }) });
  runtime.register(legacyManifest("retryable", ["member"], false, {
    mount() { return { kind: "legacy-node" }; },
    onActivate() {
      activateAttempts += 1;
      if (activateAttempts === 1) throw new Error("activate failed");
    },
    onDeactivate() {
      deactivateAttempts += 1;
      if (deactivateAttempts === 1) throw new Error("deactivate failed");
    }
  }));
  runtime.mount("retryable", { container: createContainer() });
  assert.throws(() => runtime.activate("retryable"), /activate failed/);
  runtime.activate("retryable");
  assert.equal(activateAttempts, 2, "a failed activation can be retried");
  assert.throws(() => runtime.deactivate("retryable"), /deactivate failed/);
  runtime.deactivate("retryable");
  assert.equal(deactivateAttempts, 2, "a failed deactivation can be retried");
}

{
  const document = createFakeDocument();
  const calls = [];
  const runtime = createAppRuntime({
    document,
    sessionProvider: () => ({ id: "alice", roles: ["member"] }),
    invokeHost(request) {
      calls.push(request);
      if (request.action === "fail") throw new Error("host rejected action");
      return { echoed: request.args };
    }
  });
  runtime.register({
    id: "embed", label: "Embed", adapter: "iframe", roles: ["member"],
    defaultSize: { width: 700, height: 480 }, minSize: { width: 360, height: 260 }, multiInstance: true,
    target: "/apps/embed.html", allowedActions: ["ping", "fail"]
  });
  const firstHost = createContainer();
  const first = runtime.mount("embed", { instanceId: "embed:1", container: firstHost });
  const second = runtime.mount("embed", { instanceId: "embed:2", container: createContainer() });
  assert.notEqual(first, second, "multi-instance apps allow distinct instance ids");
  const frame = first.node;
  assert.equal(frame.getAttribute("src"), "/apps/embed.html");
  assert.equal(frame.getAttribute("sandbox"), "allow-scripts allow-forms", "iframe sandbox grants only scripts and forms");
  assert.equal(firstHost.children[0], frame);

  return Promise.resolve()
    .then(() => runtime.handleMessage({ source: {}, data: { protocol: "ai-os/v1", id: "x", action: "ping" }, origin: "null" }))
    .then(() => runtime.handleMessage({ source: frame.contentWindow, data: { protocol: "wrong", id: "x", action: "ping" }, origin: "null" }))
    .then(() => runtime.handleMessage({ source: frame.contentWindow, data: { protocol: "ai-os/v1", action: "ping" }, origin: "null" }))
    .then(() => runtime.handleMessage({ source: frame.contentWindow, data: { protocol: "ai-os/v1", id: "wrong-origin", action: "ping" }, origin: "https://desktop.test" }))
    .then(() => runtime.handleMessage({ source: frame.contentWindow, data: { protocol: "ai-os/v1", id: "missing-origin", action: "ping" } }))
    .then(() => runtime.handleMessage({ source: frame.contentWindow, data: { protocol: "ai-os/v1", id: "blocked", action: "delete" }, origin: "null" }))
    .then((handled) => {
      assert.equal(handled, true, "a correlated permission error counts as a handled request");
      assert.equal(calls.length, 0, "untrusted sources, protocols, ids, and actions never invoke the host");
      assert.deepEqual(frame.contentWindow.messages.at(-1), {
        message: { protocol: "ai-os/v1", id: "blocked", ok: false, error: "Host action is not permitted for this app." },
        origin: "*"
      }, "recognized iframe requests receive a correlated whitelist error");
      return runtime.handleMessage({
        source: frame.contentWindow,
        data: { protocol: "ai-os/v1", id: "oversized", action: "ping", args: { payload: "x".repeat(300 * 1024) } },
        origin: "null"
      });
    })
    .then((handled) => {
      assert.equal(handled, true, "an oversized correlated request counts as handled");
      assert.equal(calls.length, 0, "oversized arguments are rejected before invoking the host");
      assert.match(frame.contentWindow.messages.at(-1).message.error, /arguments|256|size/i, "oversized arguments receive a useful error");
      assert.equal(frame.contentWindow.messages.at(-1).message.id, "oversized", "oversized errors preserve the request id");
      return runtime.handleMessage({
        source: frame.contentWindow,
        data: { protocol: "ai-os/v1", id: "structured-clone", action: "ping", args: { payload: new ArrayBuffer(300 * 1024) } },
        origin: "null"
      });
    })
    .then((handled) => {
      assert.equal(handled, true, "a non-JSON structured-clone request counts as handled");
      assert.equal(calls.length, 0, "structured-clone types cannot bypass the argument size boundary");
      assert.match(frame.contentWindow.messages.at(-1).message.error, /JSON|arguments/i, "non-JSON arguments receive a useful error");
      assert.equal(frame.contentWindow.messages.at(-1).message.id, "structured-clone", "non-JSON errors preserve the request id");
      return runtime.handleMessage({ source: frame.contentWindow, data: { protocol: "ai-os/v1", id: "request-1", action: "ping", args: { value: 7 } }, origin: "null" });
    })
    .then((handled) => {
      assert.equal(handled, true, "a correlated success counts as a handled request");
      assert.deepEqual(calls, [{ appId: "embed", action: "ping", args: { value: 7 }, session: { id: "alice", roles: ["member"] } }]);
      assert.deepEqual(frame.contentWindow.messages.at(-1), {
        message: { protocol: "ai-os/v1", id: "request-1", ok: true, result: { echoed: { value: 7 } } },
        origin: "*"
      }, "allowed requests receive a correlated success reply through their source iframe");
      assert.equal(second.node.contentWindow.messages.length, 0, "a reply is never broadcast to another app instance");
      return runtime.handleMessage({ source: frame.contentWindow, data: { protocol: "ai-os/v1", id: "request-2", action: "fail" }, origin: "null" });
    })
    .then((handled) => {
      assert.equal(handled, true, "a correlated host failure counts as a handled request");
      assert.deepEqual(frame.contentWindow.messages.at(-1), {
        message: { protocol: "ai-os/v1", id: "request-2", ok: false, error: "host rejected action" },
        origin: "*"
      }, "host failures return a correlated error reply");
    });
}

}

main().then(
  () => console.log("Desktop app runtime checks passed."),
  (error) => {
    console.error(error);
    process.exitCode = 1;
  }
);
