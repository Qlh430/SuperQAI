const fs = require("node:fs");
const path = require("node:path");
const { sanitizeRouteState } = require("./outbound-route-policy");

function createOutboundRouteStateStore({ filePath, machineId } = {}) {
  const resolvedPath = path.resolve(String(filePath || ""));
  const activeMachineId = String(machineId || "").trim();
  if (!filePath) throw new Error("Outbound route state requires filePath.");
  if (!activeMachineId) throw new Error("Outbound route state requires machineId.");

  function load() {
    try {
      const value = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
      if (String(value?.machineId || "") !== activeMachineId) return emptyState();
      return sanitizeRouteState(value);
    } catch {
      return emptyState();
    }
  }

  function save(snapshot) {
    const clean = sanitizeRouteState(snapshot);
    writeAtomicJson(resolvedPath, {
      version: 1,
      machineId: activeMachineId,
      hosts: clean.hosts,
    });
    return clean;
  }

  function clearRuntime() {
    return save(emptyState());
  }

  return Object.freeze({ load, save, clearRuntime });
}

function emptyState() {
  return { version: 1, hosts: {} };
}

function writeAtomicJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2), "utf8");
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    try {
      if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    } catch {
      // Preserve the original write failure.
    }
    throw error;
  }
}

module.exports = {
  createOutboundRouteStateStore,
};
