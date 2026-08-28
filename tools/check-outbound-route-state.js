const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createOutboundRouteStateStore } = require("../outbound-route-state");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "outbound-route-state-"));
const filePath = path.join(directory, "state.json");

try {
  const firstMachine = createOutboundRouteStateStore({ filePath, machineId: "machine-a" });
  assert.deepEqual(firstMachine.load(), { version: 1, hosts: {} });

  firstMachine.save({
    version: 1,
    hosts: {
      "https://api.example.com:443": {
        preferred: "direct",
        direct: {
          successes: 2,
          failures: 0,
          consecutiveFailures: 0,
          latencyMs: 320,
          lastStage: "complete",
          updatedAt: 1234,
          apiKey: "must-not-persist",
        },
      },
      "https://cdn.example.com/image.png?signature=secret": {
        preferred: "proxy",
      },
    },
    proxyUrl: "http://user:password@127.0.0.1:7890",
  });

  const raw = fs.readFileSync(filePath, "utf8");
  assert.equal(raw.includes("must-not-persist"), false);
  assert.equal(raw.includes("password"), false);
  assert.equal(raw.includes("image.png"), false);
  assert.deepEqual(firstMachine.load(), {
    version: 1,
    hosts: {
      "https://api.example.com:443": {
        preferred: "direct",
        direct: {
          successes: 2,
          failures: 0,
          consecutiveFailures: 0,
          latencyMs: 320,
          lastStage: "complete",
          updatedAt: 1234,
        },
      },
    },
  });

  const migratedMachine = createOutboundRouteStateStore({ filePath, machineId: "machine-b" });
  assert.deepEqual(
    migratedMachine.load(),
    { version: 1, hosts: {} },
    "another computer must not inherit latency, proxy ports, or circuit state",
  );

  assert.deepEqual(firstMachine.clearRuntime(), { version: 1, hosts: {} });
  assert.deepEqual(firstMachine.load(), { version: 1, hosts: {} });

  fs.writeFileSync(filePath, "{broken", "utf8");
  assert.deepEqual(firstMachine.load(), { version: 1, hosts: {} });
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}

console.log("Outbound route state checks passed.");
