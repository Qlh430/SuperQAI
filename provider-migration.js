"use strict";

const crypto = require("node:crypto");
const path = require("node:path");

const MIGRATION_KEY = "providers.migration.v1";
const AGENT_BRIDGE_MIGRATION_KEY = "providers.agent-bridge.v1";
const MEDIA_BRIDGE_MIGRATION_KEY = "providers.media-bridge.v1";
const CAPABILITY_ALIASES = Object.freeze({
  chat: "llm.chat",
  conversation: "llm.chat",
  vision: "llm.chat.vision",
  tools: "llm.tools",
  tool: "llm.tools",
  generation: "image.generate",
  generate: "image.generate",
  "image-generation": "image.generate",
  edit: "image.edit",
  "image-edit": "image.edit",
  video: "video.generate",
  audio: "audio.generate",
});

function requiredText(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function normalizeBaseUrl(value) {
  const text = requiredText(value, "provider baseUrl");
  try {
    const url = new URL(text);
    if (!["http:", "https:"].includes(url.protocol.toLowerCase())) {
      throw new Error("Unsupported provider URL protocol.");
    }
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new Error("provider baseUrl must be a valid HTTP or HTTPS URL.");
  }
}

function normalizeCapability(value) {
  const capability = requiredText(value, "model capability");
  return CAPABILITY_ALIASES[capability.toLowerCase()] || capability;
}

function normalizeModel(model, providerProtocol, sortOrder) {
  const id = requiredText(model?.id ?? model?.model, "model id");
  return {
    id,
    displayName: String(model?.displayName ?? model?.name ?? id).trim() || id,
    protocol: requiredText(model?.protocol ?? model?.modelProtocol ?? providerProtocol, "model protocol"),
    capabilities: [...new Set((Array.isArray(model?.capabilities) ? model.capabilities : []).map(normalizeCapability))],
    sortOrder,
    capabilitySort: model?.capabilitySort && typeof model.capabilitySort === "object"
      ? { ...model.capabilitySort }
      : {},
    metadata: model?.metadata && typeof model.metadata === "object" ? { ...model.metadata } : {},
  };
}

function normalizeProvider(provider, source, sortOrder) {
  const protocol = requiredText(provider?.protocol ?? provider?.providerProtocol, "provider protocol");
  const baseUrl = normalizeBaseUrl(provider?.baseUrl ?? provider?.url ?? provider?.apiUrl);
  const id = requiredText(provider?.id ?? provider?.name, "provider id");
  return {
    id,
    name: requiredText(provider?.name ?? id, "provider name"),
    baseUrl,
    protocol,
    source: requiredText(provider?.source ?? source, "provider source"),
    cliTool: provider?.cliTool ?? null,
    apiKey: String(provider?.apiKey ?? ""),
    walletKey: String(provider?.walletKey ?? ""),
    enabled: provider?.enabled !== false,
    sortOrder,
    capabilitySort: provider?.capabilitySort && typeof provider.capabilitySort === "object"
      ? { ...provider.capabilitySort }
      : provider?.capabilities && typeof provider.capabilities === "object" && !Array.isArray(provider.capabilities)
        ? { ...provider.capabilities }
        : {},
    metadata: {
      ...(provider?.metadata && typeof provider.metadata === "object" ? provider.metadata : {}),
      migratedFrom: source,
    },
    models: (Array.isArray(provider?.models) ? provider.models : []).map((model, index) => (
      normalizeModel(model, protocol, index)
    )),
  };
}

function secretFingerprint(secret) {
  return crypto.createHash("sha256").update(String(secret || ""), "utf8").digest("hex");
}

function providerIdentity(provider) {
  return provider.baseUrl.toLowerCase() + "\n" + secretFingerprint(provider.apiKey);
}

function mergeModels(primary, supplement) {
  const result = primary.map((model) => ({ ...model, capabilities: [...model.capabilities] }));
  const byId = new Map(result.map((model) => [model.id, model]));
  for (const model of supplement) {
    const existing = byId.get(model.id);
    if (existing) {
      existing.capabilities = [...new Set([...existing.capabilities, ...model.capabilities])];
      continue;
    }
    const appended = { ...model, sortOrder: result.length, capabilities: [...model.capabilities] };
    result.push(appended);
    byId.set(appended.id, appended);
  }
  return result;
}

function mergeProvider(primary, supplement) {
  return {
    ...primary,
    enabled: primary.enabled || supplement.enabled,
    models: mergeModels(primary.models, supplement.models),
    metadata: {
      ...supplement.metadata,
      ...primary.metadata,
      migratedSources: [...new Set([
        primary.metadata?.migratedFrom,
        supplement.metadata?.migratedFrom,
      ].filter(Boolean))],
    },
  };
}

function snapshotIdentifier(snapshot) {
  if (!snapshot) return null;
  if (snapshot.id) return String(snapshot.id);
  if (snapshot.name) return String(snapshot.name);
  if (snapshot.path) return path.basename(String(snapshot.path));
  return null;
}

function migrateLegacyProviders({
  db,
  store,
  settingsProviders = [],
  environmentProviders = [],
  createSnapshot,
} = {}) {
  if (!db || typeof db.getSetting !== "function" || typeof db.setSetting !== "function" || typeof db.runInTransaction !== "function") {
    throw new TypeError("Provider migration requires a transaction-capable system database.");
  }
  if (!store || typeof store.save !== "function") {
    throw new TypeError("Provider migration requires the Provider Store.");
  }
  if (!Array.isArray(settingsProviders) || !Array.isArray(environmentProviders)) {
    throw new TypeError("Legacy provider sources must be arrays.");
  }

  const sources = [
    ...settingsProviders.map((provider) => ({ provider, source: "settings" })),
    ...environmentProviders.map((provider) => ({ provider, source: "environment" })),
  ];
  const completed = db.getSetting(MIGRATION_KEY);
  if (completed?.completed) {
    return {
      migrated: 0,
      skipped: sources.length,
      providerIds: Array.isArray(completed.providerIds) ? completed.providerIds : [],
      snapshotId: completed.snapshotId || null,
    };
  }

  if (sources.length && typeof createSnapshot !== "function") {
    throw new TypeError("Provider migration requires a pre-migration snapshot callback.");
  }
  const snapshotId = sources.length ? snapshotIdentifier(createSnapshot()) : null;
  const deduplicated = [];
  const byIdentity = new Map();
  let skipped = 0;

  for (const { provider, source } of sources) {
    const normalized = normalizeProvider(provider, source, deduplicated.length);
    const identity = providerIdentity(normalized);
    const existingIndex = byIdentity.get(identity);
    if (existingIndex !== undefined) {
      deduplicated[existingIndex] = mergeProvider(deduplicated[existingIndex], normalized);
      skipped += 1;
      continue;
    }
    byIdentity.set(identity, deduplicated.length);
    deduplicated.push(normalized);
  }

  const usedIds = new Set();
  for (const provider of deduplicated) {
    const baseId = provider.id;
    let candidate = baseId;
    let suffix = 2;
    while (usedIds.has(candidate)) candidate = `${baseId}-${suffix++}`;
    provider.id = candidate;
    provider.sortOrder = usedIds.size;
    usedIds.add(candidate);
  }

  const providerIds = deduplicated.map((provider) => provider.id);
  db.runInTransaction(() => {
    for (const provider of deduplicated) store.save(provider);
    db.setSetting(MIGRATION_KEY, {
      completed: true,
      version: 1,
      completedAt: new Date().toISOString(),
      snapshotId,
      providerIds,
      sourceCount: sources.length,
    });
  });

  return {
    migrated: deduplicated.length,
    skipped,
    providerIds,
    snapshotId,
  };
}

function supportsLegacyAgentTools(protocol) {
  return ["openai", "openai-responses", "anthropic"].includes(String(protocol || "").toLowerCase());
}

function mergeAgentModel(provider, agentProvider) {
  const models = provider.models.map((model) => ({
    ...model,
    capabilities: [...model.capabilities],
  }));
  let changed = false;
  if (provider.source === "environment") {
    for (const model of models) {
      if (!model.capabilities.includes("llm.chat") || model.capabilities.includes("llm.tools")) continue;
      if (!supportsLegacyAgentTools(model.protocol || provider.protocol)) continue;
      model.capabilities.push("llm.tools");
      changed = true;
    }
  }
  if (agentProvider) {
    for (const agentModel of agentProvider.models) {
      const existing = models.find((model) => model.id === agentModel.id);
      if (existing) {
        const capabilities = [...new Set([...existing.capabilities, ...agentModel.capabilities])];
        if (capabilities.length !== existing.capabilities.length) {
          existing.capabilities = capabilities;
          changed = true;
        }
      } else {
        models.push({ ...agentModel, sortOrder: models.length, capabilities: [...agentModel.capabilities] });
        changed = true;
      }
    }
  }
  return { changed, provider: { ...provider, models } };
}

function migrateLegacyAgentProviders({ db, store, agentProvider = null, createSnapshot } = {}) {
  if (!db || typeof db.getSetting !== "function" || typeof db.setSetting !== "function" || typeof db.runInTransaction !== "function") {
    throw new TypeError("Agent Provider migration requires a transaction-capable system database.");
  }
  if (!store || typeof store.listInternal !== "function" || typeof store.save !== "function") {
    throw new TypeError("Agent Provider migration requires the Provider Store.");
  }
  const completed = db.getSetting(AGENT_BRIDGE_MIGRATION_KEY);
  if (completed?.completed) {
    return {
      updated: 0,
      providerIds: Array.isArray(completed.providerIds) ? completed.providerIds : [],
      snapshotId: completed.snapshotId || null,
    };
  }

  const existingProviders = store.listInternal();
  const normalizedAgent = agentProvider ? normalizeProvider(agentProvider, "environment", existingProviders.length) : null;
  const matchingProvider = normalizedAgent
    ? existingProviders.find((provider) => providerIdentity(provider) === providerIdentity(normalizedAgent))
    : null;
  const updates = [];
  for (const provider of existingProviders) {
    const merged = mergeAgentModel(provider, matchingProvider?.id === provider.id ? normalizedAgent : null);
    if (merged.changed) updates.push(merged.provider);
  }
  if (normalizedAgent && !matchingProvider) {
    const usedIds = new Set(existingProviders.map((provider) => provider.id));
    let id = normalizedAgent.id;
    let suffix = 2;
    while (usedIds.has(id)) id = `${normalizedAgent.id}-${suffix++}`;
    updates.push({ ...normalizedAgent, id, sortOrder: existingProviders.length });
  }

  if (updates.length && typeof createSnapshot !== "function") {
    throw new TypeError("Agent Provider migration requires a pre-migration snapshot callback.");
  }
  const snapshotId = updates.length ? snapshotIdentifier(createSnapshot()) : null;
  const providerIds = updates.map((provider) => provider.id);
  db.runInTransaction(() => {
    updates.forEach((provider) => store.save(provider));
    db.setSetting(AGENT_BRIDGE_MIGRATION_KEY, {
      completed: true,
      version: 1,
      completedAt: new Date().toISOString(),
      snapshotId,
      providerIds,
    });
  });
  return { updated: updates.length, providerIds, snapshotId };
}

function migratedMediaProtocol(provider, model) {
  const capabilities = new Set(Array.isArray(model?.capabilities) ? model.capabilities : []);
  if (!capabilities.has("image.generate") && !capabilities.has("image.edit")) {
    return String(model?.protocol || provider?.protocol || "");
  }
  const baseUrl = String(provider?.baseUrl || "").toLowerCase();
  const modelId = String(model?.id || "").toLowerCase();
  const current = String(model?.protocol || provider?.protocol || "").toLowerCase();
  if (baseUrl.includes("grsai") || modelId.endsWith("-grsai")) return "image-relay";
  if (modelId.includes("midjourney") || /^mj[-_]/.test(modelId)) return "apimart";
  if (current === "gemini" || String(provider?.protocol || "").toLowerCase() === "gemini") return "gemini";
  return "openai-images";
}

function migratedUpstreamModel(model) {
  const existing = String(model?.metadata?.upstreamModel || "").trim();
  if (existing) return existing;
  const id = String(model?.id || "").trim();
  if (/-grsai$/i.test(id)) return id.replace(/-grsai$/i, "");
  if (/-(?:ainb|clse|apimart)$/i.test(id)) return id.replace(/-(?:ainb|clse|apimart)$/i, "");
  return "";
}

function migrateLegacyMediaProviders({ db, store, localVideoProvider = null, createSnapshot } = {}) {
  if (!db || typeof db.getSetting !== "function" || typeof db.setSetting !== "function" || typeof db.runInTransaction !== "function") {
    throw new TypeError("Media Provider migration requires a transaction-capable system database.");
  }
  if (!store || typeof store.listInternal !== "function" || typeof store.save !== "function") {
    throw new TypeError("Media Provider migration requires the Provider Store.");
  }
  const completed = db.getSetting(MEDIA_BRIDGE_MIGRATION_KEY);
  if (completed?.completed) {
    return {
      updated: 0,
      providerIds: Array.isArray(completed.providerIds) ? completed.providerIds : [],
      snapshotId: completed.snapshotId || null,
    };
  }

  const existing = store.listInternal();
  const updates = [];
  for (const provider of existing) {
    let changed = false;
    const models = provider.models.map((model) => {
      const protocol = migratedMediaProtocol(provider, model);
      const upstreamModel = migratedUpstreamModel(model);
      const metadata = upstreamModel && model.metadata?.upstreamModel !== upstreamModel
        ? { ...(model.metadata || {}), upstreamModel }
        : model.metadata;
      if (protocol === model.protocol && metadata === model.metadata) return model;
      changed = true;
      return { ...model, protocol, metadata };
    });
    if (changed) updates.push({ ...provider, models });
  }

  if (localVideoProvider) {
    const normalized = normalizeProvider(localVideoProvider, "local", existing.length);
    const duplicate = existing.some((provider) => provider.id === normalized.id
      || (provider.baseUrl === normalized.baseUrl && provider.models.some((model) => (
        normalized.models.some((candidate) => candidate.id === model.id)
      ))));
    if (!duplicate) updates.push(normalized);
  }

  if (updates.length && typeof createSnapshot !== "function") {
    throw new TypeError("Media Provider migration requires a pre-migration snapshot callback.");
  }
  const snapshotId = updates.length ? snapshotIdentifier(createSnapshot()) : null;
  const providerIds = updates.map((provider) => provider.id);
  db.runInTransaction(() => {
    updates.forEach((provider) => store.save(provider));
    db.setSetting(MEDIA_BRIDGE_MIGRATION_KEY, {
      completed: true,
      version: 1,
      completedAt: new Date().toISOString(),
      snapshotId,
      providerIds,
    });
  });
  return { updated: updates.length, providerIds, snapshotId };
}

module.exports = {
  AGENT_BRIDGE_MIGRATION_KEY,
  CAPABILITY_ALIASES,
  MIGRATION_KEY,
  MEDIA_BRIDGE_MIGRATION_KEY,
  migrateLegacyAgentProviders,
  migrateLegacyMediaProviders,
  migrateLegacyProviders,
  normalizeBaseUrl,
  normalizeCapability,
};
