"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ENVELOPE_PREFIX = "aiosenc:v1:";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

function vaultError(message, code, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

function normalizeRandomBytes(randomBytesImpl, length) {
  const value = Buffer.from(randomBytesImpl(length));
  if (value.length !== length) {
    throw vaultError("Provider secret vault received invalid random bytes.", "PROVIDER_VAULT_RANDOM_INVALID");
  }
  return value;
}

function createProviderSecretVault({ dataDir, keyFile, randomBytesImpl = crypto.randomBytes } = {}) {
  if (!dataDir || typeof dataDir !== "string") {
    throw new TypeError("Provider secret vault requires dataDir.");
  }
  if (typeof randomBytesImpl !== "function") {
    throw new TypeError("Provider secret vault requires randomBytesImpl to be a function.");
  }

  const resolvedKeyFile = path.resolve(keyFile || path.join(dataDir, "security", "provider-master.key"));
  let cachedKey = null;

  function readExistingKey() {
    if (!fs.existsSync(resolvedKeyFile)) return null;
    const key = fs.readFileSync(resolvedKeyFile);
    if (key.length !== KEY_BYTES) {
      throw vaultError(
        "Provider master key is invalid. Restore the database and master key from the same backup.",
        "PROVIDER_VAULT_KEY_INVALID",
      );
    }
    return key;
  }

  function loadKeyForDecryption() {
    if (cachedKey) return cachedKey;
    const key = readExistingKey();
    if (!key) {
      throw vaultError(
        "Provider master key is missing. Restore it from the backup that contains the provider database.",
        "PROVIDER_VAULT_KEY_MISSING",
      );
    }
    cachedKey = key;
    return cachedKey;
  }

  function createKeyIfMissing() {
    if (cachedKey) return cachedKey;
    const existing = readExistingKey();
    if (existing) {
      cachedKey = existing;
      return cachedKey;
    }

    fs.mkdirSync(path.dirname(resolvedKeyFile), { recursive: true });
    const generated = normalizeRandomBytes(randomBytesImpl, KEY_BYTES);
    let handle;
    try {
      handle = fs.openSync(resolvedKeyFile, "wx", 0o600);
      fs.writeFileSync(handle, generated);
      fs.fsyncSync(handle);
      cachedKey = generated;
      return cachedKey;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const concurrentKey = readExistingKey();
      if (!concurrentKey) throw error;
      cachedKey = concurrentKey;
      return cachedKey;
    } finally {
      if (handle !== undefined) fs.closeSync(handle);
    }
  }

  function isEncrypted(value) {
    return typeof value === "string" && value.startsWith(ENVELOPE_PREFIX);
  }

  function encrypt(plainText) {
    if (plainText === "" || plainText === null || plainText === undefined) return "";
    if (typeof plainText !== "string") throw new TypeError("Provider secret must be a string.");

    const key = createKeyIfMissing();
    const iv = normalizeRandomBytes(randomBytesImpl, IV_BYTES);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return ENVELOPE_PREFIX + Buffer.concat([iv, authTag, ciphertext]).toString("base64");
  }

  function decrypt(envelope) {
    if (envelope === "" || envelope === null || envelope === undefined) return "";
    if (!isEncrypted(envelope)) {
      throw vaultError("Provider secret envelope is invalid.", "PROVIDER_VAULT_ENVELOPE_INVALID");
    }

    try {
      const payload = Buffer.from(envelope.slice(ENVELOPE_PREFIX.length), "base64");
      if (payload.length <= IV_BYTES + AUTH_TAG_BYTES) {
        throw new Error("Encrypted payload is too short.");
      }
      const iv = payload.subarray(0, IV_BYTES);
      const authTag = payload.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
      const ciphertext = payload.subarray(IV_BYTES + AUTH_TAG_BYTES);
      const decipher = crypto.createDecipheriv("aes-256-gcm", loadKeyForDecryption(), iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    } catch (error) {
      if (error?.code === "PROVIDER_VAULT_KEY_MISSING" || error?.code === "PROVIDER_VAULT_KEY_INVALID") {
        throw error;
      }
      throw vaultError(
        "Unable to decrypt provider secret. The encrypted value or master key is invalid.",
        "PROVIDER_VAULT_DECRYPT_FAILED",
        error,
      );
    }
  }

  function mask(secret) {
    if (typeof secret !== "string" || !secret) return "";
    if (secret.length <= 8) return "••••";
    return secret.slice(0, 4) + "••••" + secret.slice(-4);
  }

  function assertReady({ encryptedSecretCount = 0 } = {}) {
    const count = Number(encryptedSecretCount);
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new TypeError("encryptedSecretCount must be a non-negative integer.");
    }
    const existing = readExistingKey();
    if (count > 0 && !existing) {
      throw vaultError(
        "Provider master key is missing. Restore it before loading encrypted providers.",
        "PROVIDER_VAULT_KEY_MISSING",
      );
    }
    if (existing) cachedKey = existing;
    return true;
  }

  return Object.freeze({
    encrypt,
    decrypt,
    isEncrypted,
    mask,
    assertReady,
    keyFile: resolvedKeyFile,
  });
}

module.exports = {
  AUTH_TAG_BYTES,
  ENVELOPE_PREFIX,
  IV_BYTES,
  KEY_BYTES,
  createProviderSecretVault,
};
