"use strict";

const defaultMigrations = require("./provider-migration");

function createProviderBootstrapService({
  providerStore,
  secretVault,
  systemDb,
  createSnapshot,
  migrations = defaultMigrations,
  getLegacySettingsProviders = () => [],
  getLegacyEnvironmentProviders = () => [],
  getLegacyAgentProvider = () => null,
  getLocalVideoProvider = () => null,
} = {}) {
  if (!providerStore || typeof providerStore.validateSecrets !== "function") {
    throw new TypeError("Provider bootstrap service requires a compatible Provider Store.");
  }
  if (!secretVault || typeof secretVault.assertReady !== "function") {
    throw new TypeError("Provider bootstrap service requires a Provider secret vault.");
  }
  if (!systemDb || typeof systemDb.hasEncryptedProviderSecrets !== "function") {
    throw new TypeError("Provider bootstrap service requires a compatible system database.");
  }
  if (typeof createSnapshot !== "function") {
    throw new TypeError("Provider bootstrap service requires a snapshot factory.");
  }
  for (const name of [
    "migrateLegacyProviders",
    "migrateLegacyAgentProviders",
    "migrateLegacyMediaProviders",
    "migrateLegacyMediaModelProfiles",
    "migrateLegacyApimartPlatforms",
    "migrateLegacyCatalogModelIds",
  ]) {
    if (typeof migrations?.[name] !== "function") {
      throw new TypeError(`Provider bootstrap service requires migration: ${name}`);
    }
  }

  let state = Object.freeze({
    ready: false,
    subsystemError: null,
    migrationWarning: null,
  });

  function migrateLegacyConfiguration() {
    migrations.migrateLegacyProviders({
      db: systemDb,
      store: providerStore,
      settingsProviders: getLegacySettingsProviders(),
      environmentProviders: getLegacyEnvironmentProviders(),
      createSnapshot,
    });
    migrations.migrateLegacyAgentProviders({
      db: systemDb,
      store: providerStore,
      agentProvider: getLegacyAgentProvider(),
      createSnapshot,
    });
    migrations.migrateLegacyMediaProviders({
      db: systemDb,
      store: providerStore,
      localVideoProvider: getLocalVideoProvider(),
      createSnapshot,
    });
    migrations.migrateLegacyMediaModelProfiles({
      db: systemDb,
      store: providerStore,
      createSnapshot,
    });
    migrations.migrateLegacyApimartPlatforms({
      db: systemDb,
      store: providerStore,
      createSnapshot,
    });
    providerStore.repairProtocolAssignments?.();
    migrations.migrateLegacyCatalogModelIds({
      db: systemDb,
      createSnapshot,
    });
  }

  function bootstrap() {
    let subsystemError = null;
    let migrationWarning = null;
    try {
      secretVault.assertReady({
        encryptedSecretCount: systemDb.hasEncryptedProviderSecrets(),
      });
      try {
        migrateLegacyConfiguration();
      } catch (error) {
        migrationWarning = {
          code: String(error?.code || "provider_migration_failed"),
          message: "旧 API 配置未能自动导入；兼容配置仍保留。",
        };
      }
      providerStore.validateSecrets();
    } catch (error) {
      subsystemError = error;
    }
    state = Object.freeze({
      ready: !subsystemError,
      subsystemError,
      migrationWarning,
    });
    return getState();
  }

  function getState() {
    return Object.freeze({
      ready: state.ready,
      subsystemError: state.subsystemError,
      migrationWarning: state.migrationWarning,
    });
  }

  function start() {
    return bootstrap();
  }

  return Object.freeze({
    bootstrap,
    start,
    getState,
    getSubsystemError: () => state.subsystemError,
    getMigrationWarning: () => state.migrationWarning,
  });
}

module.exports = { createProviderBootstrapService };
