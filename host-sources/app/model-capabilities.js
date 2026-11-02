"use strict";

const MODEL_CAPABILITIES = Object.freeze([
  "llm.chat",
  "llm.chat.vision",
  "llm.tools",
  "image.generate",
  "image.edit",
  "video.generate",
  "audio.generate",
]);

const MODEL_CAPABILITY_SET = new Set(MODEL_CAPABILITIES);

function normalizeCapability(value) {
  return String(value || "").trim().toLowerCase();
}

function assertCapability(value, label = "capability") {
  const capability = normalizeCapability(value);
  if (!MODEL_CAPABILITY_SET.has(capability)) {
    const error = new Error(`${label} is not supported: ${capability || "(empty)"}`);
    error.code = "INVALID_MODEL_CAPABILITY";
    throw error;
  }
  return capability;
}

function normalizeCapabilityList(values, label = "capability") {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => assertCapability(value, label)))];
}

module.exports = {
  MODEL_CAPABILITIES,
  assertCapability,
  normalizeCapability,
  normalizeCapabilityList,
};
