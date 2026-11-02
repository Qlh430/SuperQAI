"use strict";

// Backward-compatible names for existing provider settings and extensions.
// New code uses canvas-agent-llm-connectors directly.
const connectors = require("./canvas-agent-llm-connectors");

module.exports = Object.freeze({
  ...connectors,
  normalizeModelAdapterId: connectors.normalizeLlmConnectorId,
  registerModelAdapter: connectors.registerLlmConnector,
  getModelAdapter: connectors.getLlmConnector,
  resolveModelAdapter: connectors.resolveLlmConnector,
  listModelAdapters: connectors.listLlmConnectors,
});
