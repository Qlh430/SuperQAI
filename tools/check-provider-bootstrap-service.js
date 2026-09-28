"use strict";

const assert = require("node:assert/strict");

const { createProviderBootstrapService } = require("../provider-bootstrap-service");

function fixture(overrides = {}) {
  const calls = [];
  const migration = (name) => (input) => {
    calls.push({ name, input });
    return { updated: 0 };
  };
  const migrations = {
    migrateLegacyProviders: migration("providers"),
    migrateLegacyAgentProviders: migration("agent"),
    migrateLegacyMediaProviders: migration("media"),
    migrateLegacyMediaModelProfiles: migration("media-profiles"),
    migrateLegacyApimartPlatforms: migration("apimart"),
    migrateLegacyCatalogModelIds: migration("catalog-ids"),
    ...overrides.migrations,
  };
  const service = createProviderBootstrapService({
    providerStore: {
      validateSecrets: () => {
        calls.push({ name: "validate" });
        return { ok: true };
      },
      repairProtocolAssignments: () => calls.push({ name: "repair" }),
    },
    secretVault: {
      assertReady: (input) => {
        calls.push({ name: "vault", input });
        if (overrides.vaultError) throw overrides.vaultError;
      },
    },
    systemDb: { hasEncryptedProviderSecrets: () => 2 },
    createSnapshot: () => ({ id: "snapshot" }),
    migrations,
    getLegacySettingsProviders: () => [{ id: "settings" }],
    getLegacyEnvironmentProviders: () => [{ id: "environment" }],
    getLegacyAgentProvider: () => ({ id: "agent" }),
    getLocalVideoProvider: () => ({ id: "local-comfyui" }),
  });
  return { calls, service };
}

const success = fixture();
const state = success.service.start();
assert.deepEqual(state, { ready: true, subsystemError: null, migrationWarning: null });
assert.deepEqual(success.calls.map((item) => item.name), [
  "vault",
  "providers",
  "agent",
  "media",
  "media-profiles",
  "apimart",
  "repair",
  "catalog-ids",
  "validate",
]);
assert.deepEqual(success.calls[0].input, { encryptedSecretCount: 2 });
assert.deepEqual(success.calls[1].input.settingsProviders, [{ id: "settings" }]);
assert.deepEqual(success.calls[1].input.environmentProviders, [{ id: "environment" }]);
assert.deepEqual(success.calls[2].input.agentProvider, { id: "agent" });
assert.deepEqual(success.calls[3].input.localVideoProvider, { id: "local-comfyui" });
assert.equal(typeof success.calls[1].input.createSnapshot, "function");

const migrationError = Object.assign(new Error("bad legacy config"), { code: "legacy_broken" });
const warned = fixture({
  migrations: {
    migrateLegacyAgentProviders() {
      throw migrationError;
    },
  },
});
const warnedState = warned.service.bootstrap();
assert.equal(warnedState.ready, true);
assert.equal(warnedState.subsystemError, null);
assert.deepEqual(warnedState.migrationWarning, {
  code: "legacy_broken",
  message: "旧 API 配置未能自动导入；兼容配置仍保留。",
});
assert.equal(warned.calls.some((item) => item.name === "validate"), true, "a migration warning must still validate existing secrets");
assert.equal(warned.calls.some((item) => item.name === "media"), false, "migration stops at the first failure");

const vaultError = Object.assign(new Error("missing master key"), { code: "PROVIDER_VAULT_KEY_MISSING" });
const failed = fixture({ vaultError });
const failedState = failed.service.start();
assert.equal(failedState.ready, false);
assert.equal(failedState.subsystemError, vaultError);
assert.equal(failed.service.getSubsystemError(), vaultError);
assert.equal(failed.calls.some((item) => item.name === "providers"), false);

console.log("Provider bootstrap service checks passed.");
