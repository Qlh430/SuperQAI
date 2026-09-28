"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = fs.promises;
const path = require("node:path");
const readline = require("node:readline");
const { DatabaseSync } = require("node:sqlite");
const { createProviderSecretVault } = require("../provider-secret-vault");

const GENERATED_DIRECTORIES = new Set([".desktop", ".logs", ".tmp"]);
const SQLITE_HEADER = Buffer.from("SQLite format 3\0");
const STORAGE_PATHS = {
  AI_OS_DATA_DIR: "data", AI_OS_OUTPUT_DIR: "output", AI_OS_WORKFLOW_DIR: "workflows",
  AI_OS_SYSTEM_DB_FILE: "data/system.sqlite", AI_OS_BACKUP_DIR: "data/backups",
  OUTBOUND_ROUTE_STATE_FILE: "data/outbound-route-state.json", CANVAS_LEGACY_FILE: "data/canvas-boards.json",
  CANVAS_DB_FILE: "data/canvas.db", CANVAS_BACKUP_DIR: "data/canvas-legacy-backups",
  SETTINGS_FILE: "data/settings.json", IMAGE_JOBS_FILE: "data/image-jobs.json",
  CANVAS_AGENT_ROUTE_HISTORY_FILE: "data/canvas-agent-route-history.json",
  CANVAS_AGENT_CONVERSATIONS_FILE: "data/canvas-agent-conversations.json", AI_OS_ENV_FILE: ".env",
};

function migrationError(code, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

function inside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return !relative || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function statOrNull(file) {
  try { return await fsp.lstat(file); } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function assertSafePath(file) {
  const resolved = path.resolve(file);
  const root = path.parse(resolved).root;
  let current = root;
  for (const part of resolved.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = await statOrNull(current);
    if (stat?.isSymbolicLink()) throw migrationError("unsafe_path", "Migration paths cannot contain symbolic links or junctions.");
    if (!stat) break;
  }
  return resolved;
}

function signature(stat) {
  return [stat.size, stat.mtimeMs, stat.ctimeMs, stat.ino, stat.dev, stat.mode].join(":");
}

async function assertStable(file) {
  await assertSafePath(file.source);
  const stat = await statOrNull(file.source);
  if (!stat?.isFile() || signature(stat) !== file.signature) {
    throw migrationError("source_changed", "The source changed during migration. Close the old app completely and retry.");
  }
}

async function readHeader(file) {
  const handle = await fsp.open(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const header = Buffer.alloc(16);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    return bytesRead === 16 && header.equals(SQLITE_HEADER);
  } finally { await handle.close(); }
}

async function validateEnv(file, sourceRoot) {
  const stream = fs.createReadStream(file, { encoding: "utf8" });
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  const seen = new Set();
  try {
    for await (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator < 0) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
      if (seen.has(key) || !value) continue;
      seen.add(key);
      if (Object.hasOwn(STORAGE_PATHS, key) && path.resolve(sourceRoot, value) !== path.resolve(sourceRoot, STORAGE_PATHS[key])) {
        throw migrationError("unsupported_source_layout", `The .env setting ${key} uses a custom storage path. Move its data into the standard old-project layout before importing.`);
      }
    }
  } finally {
    lines.close();
    stream.destroy();
  }
}

async function scanSource(sourceRoot) {
  if (typeof sourceRoot !== "string" || !sourceRoot.trim()) throw migrationError("invalid_source", "Choose the old project directory containing data and .env.");
  sourceRoot = await assertSafePath(sourceRoot);
  const dataRoot = path.join(sourceRoot, "data");
  const dataStat = await statOrNull(dataRoot);
  if (dataStat?.isSymbolicLink()) throw migrationError("unsafe_path", "The source data directory cannot be a link.");
  if (!dataStat?.isDirectory()) throw migrationError("invalid_source", "The selected project must contain a data directory.");
  const files = [];
  const directories = new Set();
  const observations = [];
  const destinations = new Map();
  let excludedCount = 0;
  const portableMarker = await statOrNull(path.join(sourceRoot, "ai-os-portable.json"));
  if (portableMarker?.isSymbolicLink()) throw migrationError("unsafe_path", "The portable manifest cannot be a link.");
  // The portable launcher overrides stored .env paths, which can still name the
  // project from which this portable installation was originally imported.
  const sourceKind = portableMarker?.isFile() ? "portable" : "project";
  if (sourceKind === "portable") {
    let marker;
    try { marker = JSON.parse(await fsp.readFile(path.join(sourceRoot, "ai-os-portable.json"), "utf8")); } catch {}
    if (marker?.product !== "AI OS" || marker.portable !== true || marker.dataDirectory !== "data") {
      throw migrationError("invalid_source", "The selected directory has an invalid AI OS portable manifest.");
    }
  }

  async function visit(source, relative, optional = false) {
    const stat = await statOrNull(source);
    if (!stat) {
      if (optional) return;
      throw migrationError("source_changed", "A source file disappeared. Close the old app and retry.");
    }
    if (stat.isSymbolicLink()) throw migrationError("unsafe_path", "The source contains a symbolic link or junction; migration was stopped.");
    observations.push([path.relative(sourceRoot, source), signature(stat)]);
    if (relative && (GENERATED_DIRECTORIES.has(relative.split("/")[0]) || relative === "outbound-route-state.json" || /(?:-shm|\.lock|\.lck)$/i.test(relative))) {
      excludedCount += 1;
      return;
    }
    if (!inside(sourceRoot, source)) throw migrationError("unsafe_path", "A source path escapes the project directory.");
    if (stat.isDirectory()) {
      if (relative) directories.add(relative);
      const entries = (await fsp.readdir(source)).sort();
      for (const entry of entries) await visit(path.join(source, entry), relative ? `${relative}/${entry}` : entry);
      return;
    }
    if (!stat.isFile()) throw migrationError("unsafe_path", "Only regular files and directories can be imported.");
    const collisionKey = process.platform === "win32" ? relative.toLowerCase() : relative;
    if (destinations.has(collisionKey)) throw migrationError("source_collision", "Two source files map to the same destination. Resolve duplicate data/output, workflows or .env files before importing.");
    destinations.set(collisionKey, source);
    const database = /\.(?:sqlite3?|db3?)$/i.test(relative) || await readHeader(source);
    files.push({ source, relative, bytes: stat.size, signature: signature(stat), database });
  }

  await visit(dataRoot, "");
  if (sourceKind === "project") {
    await visit(path.join(sourceRoot, "output"), "output", true);
    await visit(path.join(sourceRoot, "workflows"), "workflows", true);
    await visit(path.join(sourceRoot, ".env"), ".env", true);
    const env = files.find((file) => file.relative === ".env");
    if (env) await validateEnv(env.source, sourceRoot);
  }
  if (!files.length) throw migrationError("invalid_source", "The selected old project has no data files to import.");
  for (const file of files) {
    for (let parent = path.posix.dirname(file.relative); parent !== "."; parent = path.posix.dirname(parent)) directories.add(parent);
  }
  const fileNames = new Set(files.map((file) => process.platform === "win32" ? file.relative.toLowerCase() : file.relative));
  if ([...directories].some((directory) => fileNames.has(process.platform === "win32" ? directory.toLowerCase() : directory))) {
    throw migrationError("source_collision", "A source file and directory map to the same destination.");
  }
  files.sort((a, b) => a.relative.localeCompare(b.relative, "en"));
  observations.sort((a, b) => a[0].localeCompare(b[0], "en"));
  const summary = {
    sourceRoot, sourceKind, fileCount: files.length,
    totalBytes: files.reduce((total, file) => total + file.bytes, 0),
    databaseCount: files.filter((file) => file.database).length, excludedCount,
    hasEnv: files.some((file) => file.relative === ".env"),
    hasOutput: directories.has("output"), hasWorkflows: directories.has("workflows"),
  };
  return { ...summary, files, directories: [...directories], observations: JSON.stringify(observations) };
}

function publicSummary(scan) {
  const { files, directories, observations, ...summary } = scan;
  return summary;
}

async function inspectLegacyProject(sourceRoot) {
  return publicSummary(await scanSource(sourceRoot));
}

async function isTargetDataEmpty(targetDataDir) {
  if (typeof targetDataDir !== "string" || !targetDataDir.trim()) throw migrationError("unsafe_path", "A target data directory is required.");
  const target = await assertSafePath(targetDataDir);
  const stat = await statOrNull(target);
  if (!stat) return true;
  if (!stat.isDirectory()) return false;
  for (const name of await fsp.readdir(target)) {
    const entry = await fsp.lstat(path.join(target, name));
    if (entry.isSymbolicLink()) throw migrationError("unsafe_path", "The target contains a symbolic link or junction.");
    if (!GENERATED_DIRECTORIES.has(name) || !entry.isDirectory()) return false;
  }
  for (const name of GENERATED_DIRECTORIES) await assertSafePath(path.join(target, name));
  return true;
}

// Media is streamed in bounded chunks both while copying and while hashing.
async function hashOrCopy(file, destination) {
  await assertStable(file);
  const input = await fsp.open(file.source, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  let output;
  try {
    if (signature(await input.stat()) !== file.signature) throw migrationError("source_changed", "The source changed while opening a file. Close the old app and retry.");
    if (destination) output = await fsp.open(destination, "wx", 0o600);
    const hash = crypto.createHash("sha256");
    for await (const chunk of input.createReadStream({ autoClose: false })) {
      hash.update(chunk);
      if (output) {
        let offset = 0;
        while (offset < chunk.length) offset += (await output.write(chunk, offset, chunk.length - offset)).bytesWritten;
      }
    }
    if (output) await output.sync();
    await assertStable(file);
    return hash.digest("hex");
  } finally {
    await output?.close();
    await input.close();
  }
}

async function stagedHash(file) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

function verifyProviderKey(db, stage) {
  if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='providers'").get()) return;
  const columns = new Set(db.prepare("PRAGMA table_info(providers)").all().map((row) => row.name));
  const secretColumns = ["encrypted_api_key", "encrypted_wallet_key"].filter((column) => columns.has(column));
  if (!secretColumns.length) return;
  const vault = createProviderSecretVault({ dataDir: stage });
  for (const row of db.prepare(`SELECT ${secretColumns.join(", ")} FROM providers`).iterate()) {
    for (const column of secretColumns) {
      if (!row[column]) continue;
      try { vault.decrypt(row[column]); } catch (error) {
        const missing = error.code === "PROVIDER_VAULT_KEY_MISSING";
        throw migrationError(missing ? "missing_provider_key" : "invalid_provider_key", missing
          ? "Encrypted provider credentials require data/security/provider-master.key from the same old project."
          : "The provider master key does not match the encrypted credentials. Restore the matching database and key together.");
      }
    }
  }
}

async function verifyDatabases(scan, stage) {
  const names = new Set(scan.files.filter((file) => file.database).map((file) => file.relative));
  for (const file of scan.files) {
    const sidecar = file.relative.match(/^(.*)-(wal|journal)$/i);
    if (sidecar && !names.has(sidecar[1])) throw migrationError("invalid_database", "A SQLite WAL or journal has no matching database. Restore the complete database files together.");
  }
  for (const relative of names) {
    const dbPath = path.join(stage, relative);
    if (!await readHeader(dbPath)) throw migrationError("invalid_database", "A database has an invalid SQLite header. Repair the old project before importing.");
    const hasJournal = await statOrNull(`${dbPath}-journal`);
    const hasWal = await statOrNull(`${dbPath}-wal`);
    let db;
    try {
      // Only the copied database is opened. A committed source WAL is recovered
      // here; opening the original, even read-only, may create source SHM files.
      db = new DatabaseSync(dbPath, { readOnly: !hasJournal && !hasWal, timeout: 5000 });
      const check = () => {
        const rows = db.prepare("PRAGMA integrity_check").all();
        if (rows.length !== 1 || Object.values(rows[0])[0] !== "ok") throw new Error("SQLite integrity check failed");
      };
      check();
      if (hasWal) {
        const checkpoint = db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
        if (Number(checkpoint.busy) !== 0) throw new Error("SQLite checkpoint is busy");
        check();
      }
      if (relative === "system.sqlite") verifyProviderKey(db, stage);
    } catch (error) {
      if (["missing_provider_key", "invalid_provider_key"].includes(error.code)) throw error;
      throw migrationError("invalid_database", "A copied SQLite database failed integrity or WAL recovery checks. Close the old app and repair its database before retrying.", error);
    } finally { db?.close(); }
    // A successful checkpoint/recovery makes these copied transient files
    // unnecessary. Existing snapshot databases with no WAL retain their bytes.
    for (const suffix of ["-wal", "-shm", "-journal"]) await fsp.rm(`${dbPath}${suffix}`, { force: true });
  }
}

async function assertSourceUnchanged(scan) {
  let current;
  try { current = await scanSource(scan.sourceRoot); } catch (error) {
    throw migrationError("source_changed", "The source changed during migration. Close the old app completely and retry.", error);
  }
  if (current.observations !== scan.observations) throw migrationError("source_changed", "The source changed during migration. Close the old app completely and retry.");
  for (const file of scan.files) {
    if (await hashOrCopy(file) !== file.sha256) throw migrationError("source_changed", "Source file contents changed during migration. Close the old app and retry.");
  }
  current = await scanSource(scan.sourceRoot);
  if (current.observations !== scan.observations) throw migrationError("source_changed", "The source changed during verification. Close the old app and retry.");
}

async function publishFile(source, destination, ownedFiles) {
  await assertSafePath(destination);
  try {
    // Hard links publish an already verified file without replacing anything;
    // the exclusive-copy fallback also supports portable drives without links.
    await fsp.link(source, destination);
    ownedFiles.push(destination);
  } catch (error) {
    if (error.code === "EEXIST") throw migrationError("target_not_empty", "A destination file appeared during migration; it was left unchanged.");
    if (!["EPERM", "EACCES", "ENOTSUP", "ENOSYS", "EXDEV"].includes(error.code)) throw error;
    let output;
    try {
      output = await fsp.open(destination, "wx", 0o600);
      ownedFiles.push(destination);
      for await (const chunk of fs.createReadStream(source)) {
        let offset = 0;
        while (offset < chunk.length) offset += (await output.write(chunk, offset, chunk.length - offset)).bytesWritten;
      }
      await output.sync();
    } catch (copyError) {
      if (copyError.code === "EEXIST") throw migrationError("target_not_empty", "A destination file appeared during migration; it was left unchanged.");
      throw copyError;
    } finally { await output?.close(); }
  }
}

/** Import only before starting either app. No source file is ever written.
 * onProgress may be asynchronous; a rejected callback aborts and rolls back.
 * fileCount/totalBytes describe copied source files, including recovered WAL.
 * publishedFileCount excludes the SQLite sidecars consumed during recovery.
 */
async function importLegacyProject({ sourceRoot, targetDataDir, onProgress } = {}) {
  const source = await assertSafePath(sourceRoot || "");
  const target = await assertSafePath(targetDataDir || "");
  if (!sourceRoot || !targetDataDir || inside(source, target) || inside(target, source)) throw migrationError("unsafe_path", "Source and destination must be separate, non-overlapping directories.");
  if (!await isTargetDataEmpty(target)) throw migrationError("target_not_empty", "Import is available only before this installation contains business data. Use a new portable folder.");
  const scan = await scanSource(source);
  const summary = publicSummary(scan);
  let filesCopied = 0;
  let bytesCopied = 0;
  let filesPublished = 0;
  const notify = async (phase) => {
    if (onProgress) await onProgress({ phase, filesCopied, fileCount: scan.fileCount, bytesCopied, totalBytes: scan.totalBytes, filesPublished });
  };
  const ownedFiles = [];
  const ownedDirs = [];
  let stageRoot;
  let lock;
  let reportPath;
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID()}`;
  const lockPath = path.join(target, ".tmp", "legacy-migration.lock");
  try {
    await fsp.mkdir(target, { recursive: true });
    for (const name of [".tmp", ".logs"]) {
      await assertSafePath(path.join(target, name));
      await fsp.mkdir(path.join(target, name), { recursive: true });
    }
    try { lock = await fsp.open(lockPath, "wx", 0o600); } catch (error) {
      if (error.code === "EEXIST") throw migrationError("migration_busy", "Another import is active or was interrupted. Close AI OS before removing data/.tmp/legacy-migration.lock and retrying.");
      throw error;
    }
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    stageRoot = await fsp.mkdtemp(path.join(target, ".tmp", "legacy-migration-"));
    const stage = path.join(stageRoot, "data");
    await fsp.mkdir(stage);
    await notify("inspect");
    for (const directory of scan.directories) await fsp.mkdir(path.join(stage, directory), { recursive: true });
    for (const file of scan.files) {
      file.sha256 = await hashOrCopy(file, path.join(stage, file.relative));
      filesCopied += 1;
      bytesCopied += file.bytes;
      await notify("copy");
    }
    await notify("verify");
    for (const file of scan.files) {
      if (await stagedHash(path.join(stage, file.relative)) !== file.sha256) throw migrationError("verification_failed", "A staged file failed checksum verification. Check the destination drive and retry.");
    }
    await verifyDatabases(scan, stage);
    await assertSourceUnchanged(scan);
    if (!await isTargetDataEmpty(target)) throw migrationError("target_not_empty", "The target acquired business data during migration; it was left unchanged.");
    await notify("publish");
    for (const directory of scan.directories.sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b))) {
      const destination = path.join(target, directory);
      await assertSafePath(destination);
      try { await fsp.mkdir(destination); } catch (error) {
        if (error.code === "EEXIST") throw migrationError("target_not_empty", "A destination directory appeared during migration; it was left unchanged.");
        throw error;
      }
      ownedDirs.push(destination);
    }
    for (const file of scan.files) {
      const staged = path.join(stage, file.relative);
      if (!await statOrNull(staged)) continue; // consumed WAL or journal
      await publishFile(staged, path.join(target, file.relative), ownedFiles);
      filesPublished += 1;
      await notify("publish");
    }
    reportPath = path.join(target, ".logs", `migration-${id}.json`);
    const result = { ok: true, ...summary, targetDataDir: target, publishedFileCount: filesPublished, reportPath };
    await assertSafePath(reportPath);
    await fsp.writeFile(reportPath, `${JSON.stringify({ ...result, completedAt: new Date().toISOString() }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    ownedFiles.push(reportPath);
    await notify("complete");
    return result;
  } catch (error) {
    const cleanupErrors = [];
    for (const file of ownedFiles.reverse()) {
      try { await assertSafePath(file); await fsp.unlink(file); } catch (cleanupError) { if (cleanupError.code !== "ENOENT") cleanupErrors.push(cleanupError); }
    }
    for (const directory of ownedDirs.reverse()) {
      try { await assertSafePath(directory); await fsp.rmdir(directory); } catch (cleanupError) { if (!["ENOENT", "ENOTEMPTY"].includes(cleanupError.code)) cleanupErrors.push(cleanupError); }
    }
    if (lock) {
      try {
        const failureReport = path.join(target, ".logs", `migration-${id}-failed.json`);
        await assertSafePath(failureReport);
        await fsp.writeFile(failureReport, `${JSON.stringify({ ok: false, errorCode: error.code || "migration_failed", rollbackOk: cleanupErrors.length === 0, createdAt: new Date().toISOString() }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
      } catch { /* Preserve the original error if the drive cannot write logs. */ }
    }
    if (cleanupErrors.length) throw migrationError("migration_rollback_failed", "Migration stopped, but some newly copied files could not be removed. Keep the old project and use a new portable folder.", error);
    throw error;
  } finally {
    try {
      if (stageRoot) {
        await assertSafePath(stageRoot);
        if (!inside(path.join(target, ".tmp"), stageRoot) || path.dirname(stageRoot) !== path.join(target, ".tmp")) throw migrationError("unsafe_path", "Unsafe migration staging path.");
        await fsp.rm(stageRoot, { recursive: true, force: true });
      }
    } finally {
      if (lock) {
        await lock.close();
        await assertSafePath(lockPath);
        await fsp.unlink(lockPath);
      }
    }
  }
}

module.exports = { inspectLegacyProject, importLegacyProject, isTargetDataEmpty };
