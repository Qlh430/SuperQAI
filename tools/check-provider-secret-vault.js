"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createProviderSecretVault } = require("../provider-secret-vault");

function tamperEnvelope(envelope) {
  const prefix = "aiosenc:v1:";
  const payload = Buffer.from(envelope.slice(prefix.length), "base64");
  payload[payload.length - 1] ^= 0xff;
  return prefix + payload.toString("base64");
}

function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aios-provider-vault-"));
  const otherRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aios-provider-vault-other-"));
  const missingRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aios-provider-vault-missing-"));

  try {
    const vault = createProviderSecretVault({ dataDir: root });
    assert.equal(fs.existsSync(vault.keyFile), false, "the key is created lazily");
    assert.equal(vault.assertReady({ encryptedSecretCount: 0 }), true);

    const first = vault.encrypt("sk-test-secret");
    const second = vault.encrypt("sk-test-secret");
    assert.match(first, /^aiosenc:v1:[A-Za-z0-9+/=]+$/);
    assert.notEqual(first, second, "each encryption must use a fresh IV");
    assert.equal(vault.decrypt(first), "sk-test-secret");
    assert.equal(vault.isEncrypted(first), true);
    assert.equal(vault.isEncrypted("sk-test-secret"), false);
    assert.equal(fs.readFileSync(vault.keyFile).length, 32);

    assert.throws(
      () => vault.decrypt(tamperEnvelope(first)),
      /decrypt|authentication|invalid/i,
      "authenticated encryption must reject modified ciphertext",
    );

    const wrongKeyVault = createProviderSecretVault({ dataDir: otherRoot });
    wrongKeyVault.encrypt("initialize-a-different-key");
    assert.throws(
      () => wrongKeyVault.decrypt(first),
      /decrypt|authentication|invalid/i,
      "a ciphertext cannot be opened with another host key",
    );

    const missingKeyVault = createProviderSecretVault({ dataDir: missingRoot });
    assert.throws(
      () => missingKeyVault.assertReady({ encryptedSecretCount: 1 }),
      /master key|recover|missing/i,
    );
    assert.equal(fs.existsSync(missingKeyVault.keyFile), false, "readiness must not replace a missing key");

    assert.equal(vault.mask("sk-test-secret"), "sk-t••••cret");
    assert.equal(vault.mask("short"), "••••");
    assert.equal(vault.mask(""), "");

    console.log("Provider secret vault checks passed.");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(otherRoot, { recursive: true, force: true });
    fs.rmSync(missingRoot, { recursive: true, force: true });
  }
}

main();
