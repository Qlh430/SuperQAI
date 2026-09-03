"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { hashPassword } = require("../auth-crypto");
const { createBackupService, hashFile } = require("../backup-service");
const { createProviderSecretVault } = require("../provider-secret-vault");
const { createProviderStore } = require("../provider-store");
const { createSystemDb } = require("../system-db");

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-backup-"));
  const dataDir = path.join(root, "data");
  const backupDir = path.join(dataDir, "backups");
  const dbPath = path.join(dataDir, "system.sqlite");
  fs.mkdirSync(path.join(dataDir, "users", "owner"), { recursive: true });
  fs.writeFileSync(path.join(dataDir, "users", "owner", "note.txt"), "snapshot version", "utf8");
  fs.mkdirSync(path.join(dataDir, "tmp", "uploads"), { recursive: true });
  fs.writeFileSync(path.join(dataDir, "tmp", "uploads", "ignored.part"), "temporary", "utf8");
  fs.writeFileSync(path.join(dataDir, ".env"), "SECRET=must-not-back-up", "utf8");

  let db = createSystemDb({ dbPath });
  db.migrate();
  const owner = db.insertUser({
    username: "owner",
    displayName: "Owner",
    passwordHash: await hashPassword("backup test password"),
    mustChangePassword: false,
  });
  db.registerResource({ type: "file", ownerUserId: owner.id, title: "Note", refType: "file", refId: "note-1" });
  const vault = createProviderSecretVault({ dataDir });
  const providerStore = createProviderStore({ db, vault });
  providerStore.save({
    id: "backup-provider",
    name: "Backup Provider",
    baseUrl: "https://api.example.test",
    protocol: "openai",
    apiKey: "sk-backup-test",
    models: [],
  });

  try {
    const backup = createBackupService({ db, dataDir, backupDir, clock: () => new Date("2026-09-03T06:07:08.000Z") });
    const snapshot = backup.createSnapshot({ includeMedia: true });
    assert.equal(fs.existsSync(path.join(snapshot.path, "manifest.json")), true);
    assert.equal(fs.existsSync(path.join(snapshot.path, "system.sqlite")), true);
    assert.equal(fs.existsSync(path.join(snapshot.path, "data", "users", "owner", "note.txt")), true);
    assert.equal(fs.existsSync(path.join(snapshot.path, "data", ".env")), false);
    assert.equal(fs.existsSync(path.join(snapshot.path, "data", "tmp", "uploads", "ignored.part")), false);
    assert.equal(fs.readFileSync(path.join(snapshot.path, "data", "security", "provider-master.key")).length, 32);
    const verified = backup.verifySnapshot(snapshot.path);
    assert.equal(verified.ok, true, JSON.stringify(verified));
    assert.equal(verified.databaseOk, true);
    assert.ok(verified.filesChecked >= 2);
    assert.equal(backup.listSnapshots().length, 1);

    const missingKeySnapshot = path.join(backupDir, "snapshot-missing-provider-key");
    fs.cpSync(snapshot.path, missingKeySnapshot, { recursive: true });
    fs.rmSync(path.join(missingKeySnapshot, "data", "security", "provider-master.key"));
    const missingManifestPath = path.join(missingKeySnapshot, "manifest.json");
    const missingManifest = JSON.parse(fs.readFileSync(missingManifestPath, "utf8"));
    missingManifest.files = missingManifest.files.filter((file) => file.path !== "data/security/provider-master.key");
    fs.writeFileSync(missingManifestPath, JSON.stringify(missingManifest, null, 2), "utf8");
    const missingKeyVerification = backup.verifySnapshot(missingKeySnapshot);
    assert.equal(missingKeyVerification.ok, false);
    assert.match(missingKeyVerification.errors.join("\n"), /provider master key.*missing/i);

    const shortKeySnapshot = path.join(backupDir, "snapshot-short-provider-key");
    fs.cpSync(snapshot.path, shortKeySnapshot, { recursive: true });
    const shortKeyPath = path.join(shortKeySnapshot, "data", "security", "provider-master.key");
    fs.writeFileSync(shortKeyPath, "too-short", "utf8");
    const shortManifestPath = path.join(shortKeySnapshot, "manifest.json");
    const shortManifest = JSON.parse(fs.readFileSync(shortManifestPath, "utf8"));
    const shortKeyEntry = shortManifest.files.find((file) => file.path === "data/security/provider-master.key");
    shortKeyEntry.bytes = fs.statSync(shortKeyPath).size;
    shortKeyEntry.sha256 = hashFile(shortKeyPath);
    fs.writeFileSync(shortManifestPath, JSON.stringify(shortManifest, null, 2), "utf8");
    const shortKeyVerification = backup.verifySnapshot(shortKeySnapshot);
    assert.equal(shortKeyVerification.ok, false);
    assert.match(shortKeyVerification.errors.join("\n"), /provider master key.*32 bytes/i);

    db.updateUser(owner.id, { displayName: "Changed Owner" });
    fs.writeFileSync(path.join(dataDir, "users", "owner", "note.txt"), "changed version", "utf8");
    const restored = backup.restoreSnapshot(snapshot.path);
    assert.equal(restored.ok, true);
    assert.equal(restored.requiresRestart, true);
    assert.ok(backup.listSnapshots().some((item) => item.kind === "pre-restore"));
    db = createSystemDb({ dbPath });
    db.migrate();
    assert.equal(db.getUserById(owner.id).displayName, "Owner");
    assert.equal(fs.readFileSync(path.join(dataDir, "users", "owner", "note.txt"), "utf8"), "snapshot version");

    const tampered = path.join(snapshot.path, "data", "users", "owner", "note.txt");
    fs.writeFileSync(tampered, "tampered", "utf8");
    assert.equal(backup.verifySnapshot(snapshot.path).ok, false);
    console.log("Backup service checks passed.");
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
