"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const BACKUP_FORMAT_VERSION = 1;

function hashFile(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function safeTimestamp(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const output = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile()) output.push(fullPath);
    }
  };
  visit(directory);
  return output.sort();
}

function isInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function copyTree(source, destination, filter) {
  if (!filter(source)) return;
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const entry of fs.readdirSync(source)) {
      copyTree(path.join(source, entry), path.join(destination, entry), filter);
    }
    return;
  }
  if (stat.isFile()) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
}

function createBackupService({ db, dataDir, backupDir, clock = () => new Date() } = {}) {
  if (!db?.dbPath) throw new TypeError("Backup service requires the system database repository.");
  if (!dataDir || !backupDir) throw new TypeError("Backup service requires dataDir and backupDir.");
  const resolvedDataDir = path.resolve(dataDir);
  const resolvedBackupDir = path.resolve(backupDir);
  fs.mkdirSync(resolvedDataDir, { recursive: true });
  fs.mkdirSync(resolvedBackupDir, { recursive: true });

  function currentDate() {
    const value = clock();
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) throw new TypeError("Backup clock returned an invalid date.");
    return date;
  }

  function createSnapshot({ includeMedia = true, kind = "snapshot" } = {}) {
    const createdAt = currentDate();
    const prefix = kind === "pre-restore" ? "pre-restore" : "snapshot";
    let snapshotPath = path.join(resolvedBackupDir, `${prefix}-${safeTimestamp(createdAt)}`);
    let suffix = 1;
    while (fs.existsSync(snapshotPath)) snapshotPath = path.join(resolvedBackupDir, `${prefix}-${safeTimestamp(createdAt)}-${suffix++}`);
    fs.mkdirSync(snapshotPath, { recursive: false });

    const snapshotDbPath = path.join(snapshotPath, "system.sqlite");
    const source = new DatabaseSync(db.dbPath, { timeout: 5000 });
    try {
      const escaped = snapshotDbPath.replace(/'/g, "''");
      source.exec(`VACUUM INTO '${escaped}'`);
    } finally {
      source.close();
    }

    const dataSnapshotPath = path.join(snapshotPath, "data");
    copyTree(resolvedDataDir, dataSnapshotPath, (sourcePath) => {
        const resolved = path.resolve(sourcePath);
        if (isInside(resolvedBackupDir, resolved)) return false;
        const relative = path.relative(resolvedDataDir, resolved).replace(/\\/g, "/");
        if (!relative) return true;
        if (relative === ".env" || relative.startsWith("tmp/") || relative.startsWith("cache/")) return false;
        if (/^system\.sqlite(?:-(?:wal|shm))?$/i.test(relative)) return false;
        if (!includeMedia && (relative.startsWith("media/") || relative.startsWith("output/"))) return false;
        return true;
    });

    const files = [snapshotDbPath, ...listFiles(dataSnapshotPath)].map((filePath) => ({
      path: path.relative(snapshotPath, filePath).replace(/\\/g, "/"),
      bytes: fs.statSync(filePath).size,
      sha256: hashFile(filePath),
    }));
    const manifest = {
      formatVersion: BACKUP_FORMAT_VERSION,
      kind: prefix,
      createdAt: createdAt.toISOString(),
      includeMedia: Boolean(includeMedia),
      files,
    };
    fs.writeFileSync(path.join(snapshotPath, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    return { path: snapshotPath, ...manifest };
  }

  function verifySnapshot(snapshotPath) {
    const resolvedSnapshot = path.resolve(snapshotPath);
    if (!isInside(resolvedBackupDir, resolvedSnapshot) || resolvedSnapshot === resolvedBackupDir) {
      return { ok: false, databaseOk: false, filesChecked: 0, errors: ["Snapshot path is outside the backup directory."] };
    }
    const errors = [];
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(resolvedSnapshot, "manifest.json"), "utf8"));
    } catch {
      return { ok: false, databaseOk: false, filesChecked: 0, errors: ["Snapshot manifest is missing or invalid."] };
    }
    let filesChecked = 0;
    for (const file of Array.isArray(manifest.files) ? manifest.files : []) {
      const filePath = path.resolve(resolvedSnapshot, String(file.path || ""));
      if (!isInside(resolvedSnapshot, filePath) || !fs.existsSync(filePath)) {
        errors.push(`Missing file: ${file.path}`);
        continue;
      }
      filesChecked += 1;
      if (fs.statSync(filePath).size !== Number(file.bytes) || hashFile(filePath) !== file.sha256) {
        errors.push(`Checksum mismatch: ${file.path}`);
      }
    }
    let databaseOk = false;
    let encryptedProviderSecretCount = 0;
    let snapshotDb = null;
    try {
      snapshotDb = new DatabaseSync(path.join(resolvedSnapshot, "system.sqlite"), { readOnly: true });
      const row = snapshotDb.prepare("PRAGMA quick_check").get();
      databaseOk = String(row?.quick_check || Object.values(row || {})[0] || "") === "ok";
      if (!databaseOk) errors.push("Snapshot database quick check failed.");
      const providerTable = snapshotDb.prepare(`
        SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'providers'
      `).get();
      if (providerTable) {
        const secretRow = snapshotDb.prepare(`
          SELECT
            SUM(CASE WHEN encrypted_api_key <> '' THEN 1 ELSE 0 END) +
            SUM(CASE WHEN encrypted_wallet_key <> '' THEN 1 ELSE 0 END) AS count
          FROM providers
        `).get();
        encryptedProviderSecretCount = Number(secretRow?.count || 0);
      }
    } catch (error) {
      errors.push(`Snapshot database failed to open: ${error.message}`);
    } finally {
      if (snapshotDb) snapshotDb.close();
    }

    if (encryptedProviderSecretCount > 0) {
      const keyRelativePath = "data/security/provider-master.key";
      const keyEntry = (Array.isArray(manifest.files) ? manifest.files : []).find((file) => (
        String(file.path || "").replace(/\\/g, "/") === keyRelativePath
      ));
      const keyPath = path.join(resolvedSnapshot, ...keyRelativePath.split("/"));
      if (!keyEntry || !fs.existsSync(keyPath)) {
        errors.push("Provider master key is missing from a snapshot that contains encrypted provider secrets.");
      } else if (fs.statSync(keyPath).size !== 32) {
        errors.push("Provider master key must be exactly 32 bytes when encrypted provider secrets are present.");
      }
    }
    return { ok: databaseOk && errors.length === 0, databaseOk, filesChecked, errors, manifest };
  }

  function listSnapshots() {
    if (!fs.existsSync(resolvedBackupDir)) return [];
    return fs.readdirSync(resolvedBackupDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        const snapshotPath = path.join(resolvedBackupDir, entry.name);
        try {
          const manifest = JSON.parse(fs.readFileSync(path.join(snapshotPath, "manifest.json"), "utf8"));
          return [{ path: snapshotPath, name: entry.name, kind: manifest.kind, createdAt: manifest.createdAt, includeMedia: manifest.includeMedia }];
        } catch {
          return [];
        }
      })
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
  }

  function restoreSnapshot(snapshotPath) {
    const verification = verifySnapshot(snapshotPath);
    if (!verification.ok) {
      const error = new Error(`Snapshot verification failed: ${verification.errors.join("; ")}`);
      error.code = "invalid_snapshot";
      throw error;
    }
    const safetySnapshot = createSnapshot({ includeMedia: true, kind: "pre-restore" });
    db.close();
    const resolvedSnapshot = path.resolve(snapshotPath);
    fs.copyFileSync(path.join(resolvedSnapshot, "system.sqlite"), db.dbPath);
    for (const suffix of ["-wal", "-shm"]) {
      const sidecar = `${db.dbPath}${suffix}`;
      if (fs.existsSync(sidecar)) fs.rmSync(sidecar, { force: true });
    }
    const snapshotData = path.join(resolvedSnapshot, "data");
    if (fs.existsSync(snapshotData)) fs.cpSync(snapshotData, resolvedDataDir, { recursive: true, force: true });
    return { ok: true, requiresRestart: true, restoredFrom: resolvedSnapshot, safetySnapshot: safetySnapshot.path };
  }

  return {
    createSnapshot,
    listSnapshots,
    verifySnapshot,
    restoreSnapshot,
  };
}

module.exports = {
  BACKUP_FORMAT_VERSION,
  createBackupService,
  hashFile,
};
