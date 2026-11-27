const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../host-sources/app/startup-overlay.js"), "utf8");

function boot({ frame = false, mounted = false, authenticated = true, devRefresh = false } = {}) {
  const listeners = new Map(), timers = new Map(), classes = new Set();
  const nodes = Object.fromEntries(["Status", "Detail", "Progress", "Continue"].map(name => [
    `#aiOsStartup${name}`, { textContent: "", style: {}, hidden: true, addEventListener(type, fn) { this[type] = fn; } },
  ]));
  const gate = {
    hidden: false, querySelector: selector => nodes[selector], setAttribute() {},
    classList: { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)), contains: name => classes.has(name) },
  };
  const root = { childElementCount: mounted ? 1 : 0, children: mounted ? [{}] : [] };
  const iframe = { contentDocument: { querySelector: selector => selector === "#root" ? root : null } };
  let timerId = 0, reloads = 0;
  const storage = { getItem: () => devRefresh ? String(Date.now()) : null, removeItem() {} };
  const window = {
    addEventListener(type, fn) { listeners.set(type, fn); },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    setInterval(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay, interval: true }); return id; },
    clearInterval: id => timers.delete(id),
    location: { reload() { reloads++; } },
    AiOsDesktop: { getSession: () => authenticated ? { user: { id: "isolated-test" } } : null },
  };
  const document = { querySelector(selector) {
    if (selector === "#aiOsStartupGate") return gate;
    if (selector === "#aiOsDesktopHomeApps") return { children: [{}] };
    if (selector === "#aiOsDesktop") return { hidden: !authenticated };
    if (selector.includes("#aiOsNeonFrame")) return frame ? iframe : null;
    return null;
  } };
  vm.runInNewContext(source, { window, document, location: window.location, sessionStorage: storage, localStorage: storage, Date });
  return {
    gate, classes, nodes, window, root,
    get reloads() { return reloads; },
    emit(type, detail = {}) { listeners.get(type)?.({ detail }); },
    tick(delay) {
      for (const [id, timer] of [...timers]) {
        if (timer.delay <= delay && timers.has(id)) {
          if (!timer.interval) timers.delete(id);
          timer.fn();
        }
      }
    },
    mount() { root.childElementCount = 1; root.children = [{}]; },
  };
}

function complete(host) {
  host.emit("ai-os-critical-load-complete");
  host.emit("ai-os-legacy-workbench-ready");
  host.emit("ai-os-module-load-complete");
}

test("an empty iframe must not release the startup gate", () => {
  const host = boot({ frame: true });
  complete(host);
  host.tick(500); host.tick(500);
  assert.equal(host.gate.hidden, false, "iframe creation is not a rendered workbench");
});

test("an authenticated desktop waits for the actual Neon frame", () => {
  const host = boot();
  complete(host);
  host.tick(500); host.tick(500);
  assert.equal(host.gate.hidden, false);
});

test("a mounted workbench releases the gate after the critical phase", () => {
  const host = boot({ frame: true });
  complete(host);
  host.mount();
  host.tick(500); host.tick(500); host.tick(500);
  assert.equal(host.gate.hidden, true);
  assert.equal(host.classes.has("has-error"), false);
});

test("later progress and degraded events preserve the real failure", () => {
  const host = boot({ frame: true });
  const failure = { componentLabel: "桌面壳体", src: "./desktop-shell.js?v=test", critical: true, required: true };
  host.emit("ai-os-component-load-failed", failure);
  host.emit("ai-os-critical-load-complete", { failed: true, failures: [failure] });
  host.emit("ai-os-module-load-progress", { completed: 105, total: 105, componentLabel: "无关组件" });
  host.emit("ai-os-module-load-complete", { degraded: true });
  host.tick(500);
  assert.match(host.nodes["#aiOsStartupStatus"].textContent, /失败/);
  assert.match(host.nodes["#aiOsStartupDetail"].textContent, /桌面壳体/);
  assert.match(host.nodes["#aiOsStartupDetail"].textContent, /desktop-shell\.js/);
  assert.equal(host.gate.hidden, false);
});

test("reload actually reloads instead of hiding the error", () => {
  const host = boot();
  host.emit("ai-os-module-load-failed", { error: { message: "required component failed" } });
  host.nodes["#aiOsStartupContinue"].click();
  assert.equal(host.reloads, 1);
  assert.equal(host.gate.hidden, false);
});

test("slow iframe startup keeps an actionable gate", () => {
  const host = boot({ frame: true });
  complete(host);
  host.tick(12_000);
  assert.equal(host.gate.hidden, false);
  assert.equal(host.nodes["#aiOsStartupContinue"].hidden, false);
});

test("development refresh waits for restoration as well as rendered content", () => {
  const host = boot({ frame: true, mounted: true, devRefresh: true });
  complete(host);
  host.tick(500); host.tick(500);
  assert.equal(host.gate.hidden, false);
  host.window.AiOsDevRefreshGate.complete();
  host.tick(500); host.tick(500);
  assert.equal(host.gate.hidden, true);
});

test("login shell can complete without an authenticated Neon frame", () => {
  const host = boot({ authenticated: false });
  complete(host);
  host.tick(500); host.tick(500);
  assert.equal(host.gate.hidden, true);
});
