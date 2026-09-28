"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");
const { createProviderSecretVault } = require("../provider-secret-vault");

const modulePath = path.join(__dirname, "../desktop/portable-migration.js");
assert.ok(fs.existsSync(modulePath), "The legacy migration module must exist before data can be imported.");
const { inspectLegacyProject, importLegacyProject, isTargetDataEmpty } = require(modulePath);
const root = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-portable-migration-"));
let checks = 0;

function put(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function fixture(name) {
  const sourceRoot = path.join(root, name, "old project 中文");
  const targetDataDir = path.join(root, name, "portable", "data");
  fs.mkdirSync(path.join(sourceRoot, "data"), { recursive: true });
  put(path.join(sourceRoot, "data", "image-history.json"), '[{"url":"/output/猫.png"}]');
  return { sourceRoot, targetDataDir };
}

function tree(directory) {
  const result = {};
  if (!fs.existsSync(directory)) return result;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [name, hash] of Object.entries(tree(file))) result[`${entry.name}/${name}`] = hash;
    } else if (entry.isFile()) {
      result[entry.name] = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    } else result[entry.name] = "link";
  }
  return result;
}

function assertNoBusinessData(target) {
  if (!fs.existsSync(target)) return;
  assert.deepEqual(fs.readdirSync(target).filter((name) => ![".logs", ".desktop", ".tmp"].includes(name)), []);
  if (fs.existsSync(path.join(target, ".tmp"))) assert.deepEqual(fs.readdirSync(path.join(target, ".tmp")), []);
}

async function check(name, run) {
  await run();
  checks += 1;
  console.log(`PASS ${name}`);
}

// This creates an abandoned, committed WAL using synthetic databases only.
// The original connection is closed after copying so the import source is quiescent.
function seedWal(f) {
  const scratch = path.join(root, "wal-authoring.sqlite");
  const db = new DatabaseSync(scratch);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE notes (body TEXT); PRAGMA wal_checkpoint(TRUNCATE)");
  db.prepare("INSERT INTO notes VALUES (?)").run("committed only in WAL");
  const destination = path.join(f.sourceRoot, "data", "canvas.db");
  fs.copyFileSync(scratch, destination);
  fs.copyFileSync(`${scratch}-wal`, `${destination}-wal`);
  fs.copyFileSync(`${scratch}-shm`, `${destination}-shm`);
  db.close();
  fs.unlinkSync(scratch);
}

function seedProvider(f) {
  const dataDir = path.join(f.sourceRoot, "data");
  const vault = createProviderSecretVault({ dataDir });
  const encrypted = vault.encrypt("sk-synthetic-migration-secret");
  const db = new DatabaseSync(path.join(dataDir, "system.sqlite"));
  db.exec("CREATE TABLE providers (encrypted_api_key TEXT, encrypted_wallet_key TEXT)");
  db.prepare("INSERT INTO providers VALUES (?, '')").run(encrypted);
  db.close();
  return encrypted;
}

async function main() {
  await check("upgrades copy prior portable business data and preserve a fresh desktop profile", async () => {
    const f = fixture("portable-upgrade");
    put(path.join(f.sourceRoot, "ai-os-portable.json"), JSON.stringify({ product: "AI OS", portable: true, dataDirectory: "data" }));
    put(path.join(f.sourceRoot, "data", ".env"), "CANVAS_DB_FILE=Z:/previous-computer/canvas.db\n");
    put(path.join(f.sourceRoot, "data", "output", "saved.png"), "image bytes");
    put(path.join(f.sourceRoot, "data", ".desktop", "Preferences"), "old machine");
    put(path.join(f.targetDataDir, ".desktop", "Preferences"), "current machine");
    const before = tree(f.sourceRoot);
    const result = await importLegacyProject(f);
    assert.equal(result.sourceKind, "portable");
    assert.equal(fs.readFileSync(path.join(f.targetDataDir, "output", "saved.png"), "utf8"), "image bytes");
    assert.equal(fs.readFileSync(path.join(f.targetDataDir, ".desktop", "Preferences"), "utf8"), "current machine");
    assert.deepEqual(tree(f.sourceRoot), before);
    const bad = fixture("invalid-portable-marker");
    put(path.join(bad.sourceRoot, "ai-os-portable.json"), '{"product":"different"}');
    await assert.rejects(inspectLegacyProject(bad.sourceRoot), { code: "invalid_source" });
  });
  await check("inspection and complete first-run migration preserve relative paths, credentials, media, workflows and source bytes", async () => {
    const f = fixture("complete");
    seedWal(f);
    const encrypted = seedProvider(f);
    put(path.join(f.sourceRoot, ".env"), "AI_API_KEY=sk-env-synthetic\nAI_OS_DATA_DIR=./data\n");
    put(path.join(f.sourceRoot, "output", "猫.png"), Buffer.alloc(1024 * 1024, 0x6a));
    put(path.join(f.sourceRoot, "workflows", "custom.json"), '{"custom":true}');
    put(path.join(f.sourceRoot, "data", "users", "owner", "notes.md"), "owner notes");
    put(path.join(f.sourceRoot, "data", "outbound-route-state.json"), '{"machine":"old"}');
    put(path.join(f.sourceRoot, "data", "canvas.db.lock"), "transient lock");
    put(path.join(f.targetDataDir, ".desktop", "profile", "Preferences"), "keep profile");
    put(path.join(f.targetDataDir, ".logs", "previous.log"), "keep log");
    const before = tree(f.sourceRoot);
    const inspection = await inspectLegacyProject(f.sourceRoot);
    assert.equal(inspection.hasEnv, true);
    assert.equal(inspection.hasOutput, true);
    assert.equal(inspection.hasWorkflows, true);
    assert.equal(inspection.databaseCount, 2);
    assert.equal(inspection.excludedCount, 3);
    assert.equal(await isTargetDataEmpty(f.targetDataDir), true);
    const progress = [];
    const result = await importLegacyProject({ ...f, onProgress: async (event) => { progress.push(event); } });
    assert.equal(result.ok, true);
    assert.equal(result.fileCount, inspection.fileCount);
    assert.equal(result.totalBytes, inspection.totalBytes);
    assert.equal(result.databaseCount, 2);
    assert.ok(result.publishedFileCount < result.fileCount, "WAL is folded into the main database");
    assert.equal(fs.readFileSync(path.join(f.targetDataDir, "image-history.json"), "utf8"), '[{"url":"/output/猫.png"}]');
    assert.equal(fs.readFileSync(path.join(f.targetDataDir, ".env"), "utf8"), fs.readFileSync(path.join(f.sourceRoot, ".env"), "utf8"));
    assert.equal(fs.readFileSync(path.join(f.targetDataDir, "workflows", "custom.json"), "utf8"), '{"custom":true}');
    assert.equal(fs.existsSync(path.join(f.targetDataDir, "output", "猫.png")), true);
    assert.equal(fs.existsSync(path.join(f.targetDataDir, "outbound-route-state.json")), false);
    assert.equal(fs.existsSync(path.join(f.targetDataDir, "canvas.db-shm")), false);
    assert.equal(fs.existsSync(path.join(f.targetDataDir, "canvas.db.lock")), false);
    const db = new DatabaseSync(path.join(f.targetDataDir, "canvas.db"), { readOnly: true });
    assert.equal(db.prepare("SELECT body FROM notes").get().body, "committed only in WAL");
    db.close();
    assert.equal(createProviderSecretVault({ dataDir: f.targetDataDir }).decrypt(encrypted), "sk-synthetic-migration-secret");
    assert.deepEqual(tree(f.sourceRoot), before);
    assert.equal(fs.readFileSync(path.join(f.targetDataDir, ".desktop", "profile", "Preferences"), "utf8"), "keep profile");
    const report = fs.readFileSync(result.reportPath, "utf8");
    assert.equal(JSON.parse(report).ok, true);
    assert.doesNotMatch(report, /sk-env-synthetic|sk-synthetic-migration-secret|aiosenc:v1:/);
    assert.deepEqual([...new Set(progress.map((item) => item.phase))], ["inspect", "copy", "verify", "publish", "complete"]);
    await assert.rejects(importLegacyProject(f), { code: "target_not_empty" });
  });

  await check("existing business files are never overwritten", async () => {
    const f = fixture("occupied");
    put(path.join(f.targetDataDir, "settings.json"), "existing business data");
    const before = tree(f.targetDataDir);
    assert.equal(await isTargetDataEmpty(f.targetDataDir), false);
    await assert.rejects(importLegacyProject(f), { code: "target_not_empty" });
    assert.deepEqual(tree(f.targetDataDir), before);
  });

  await check("rejects same paths, nested paths and symbolic links without touching source", async () => {
    const f = fixture("unsafe");
    await assert.rejects(importLegacyProject({ ...f, targetDataDir: path.join(f.sourceRoot, "new-data") }), { code: "unsafe_path" });
    await assert.rejects(importLegacyProject({ ...f, targetDataDir: f.sourceRoot }), { code: "unsafe_path" });
    await assert.rejects(importLegacyProject({ ...f, targetDataDir: path.dirname(f.sourceRoot) }), { code: "unsafe_path" });
    const outside = path.join(root, "link-target");
    put(path.join(outside, "secret.txt"), "not imported");
    fs.symlinkSync(outside, path.join(f.sourceRoot, "data", "escape"), process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(importLegacyProject(f), { code: "unsafe_path" });
    assertNoBusinessData(f.targetDataDir);
    assert.equal(fs.readFileSync(path.join(outside, "secret.txt"), "utf8"), "not imported");
    fs.unlinkSync(path.join(f.sourceRoot, "data", "escape"));
    fs.mkdirSync(f.targetDataDir, { recursive: true });
    fs.symlinkSync(outside, path.join(f.targetDataDir, ".tmp"), process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(importLegacyProject(f), { code: "unsafe_path" });
  });

  await check("source mutation during copy aborts and rolls back", async () => {
    const f = fixture("mutation");
    let changed = false;
    await assert.rejects(importLegacyProject({ ...f, onProgress(event) {
      if (event.phase === "copy" && !changed) {
        changed = true;
        put(path.join(f.sourceRoot, "data", "image-history.json"), '[{"new":true}]');
      }
    } }), { code: "source_changed" });
    assertNoBusinessData(f.targetDataDir);
  });

  await check("new source files during verification abort import", async () => {
    const f = fixture("new-file");
    await assert.rejects(importLegacyProject({ ...f, onProgress(event) {
      if (event.phase === "verify") put(path.join(f.sourceRoot, "data", "late.json"), "{}");
    } }), { code: "source_changed" });
    assertNoBusinessData(f.targetDataDir);
  });

  await check("corrupt SQLite and orphan WAL are rejected before publishing", async () => {
    for (const name of ["system.sqlite", "canvas.db-wal"]) {
      const f = fixture(`corrupt-${name}`);
      put(path.join(f.sourceRoot, "data", name), "invalid sqlite bytes");
      await assert.rejects(importLegacyProject(f), { code: "invalid_database" });
      assertNoBusinessData(f.targetDataDir);
    }
  });

  await check("missing and wrong provider keys block migration", async () => {
    for (const mode of ["missing", "wrong"]) {
      const f = fixture(`key-${mode}`);
      seedProvider(f);
      const key = path.join(f.sourceRoot, "data", "security", "provider-master.key");
      if (mode === "missing") fs.unlinkSync(key);
      else fs.writeFileSync(key, Buffer.alloc(32, 0x33));
      await assert.rejects(importLegacyProject(f), { code: mode === "missing" ? "missing_provider_key" : "invalid_provider_key" });
      assertNoBusinessData(f.targetDataDir);
    }
  });

  await check("callback failures after publishing starts roll back only newly published data", async () => {
    const f = fixture("rollback");
    put(path.join(f.sourceRoot, "data", "nested", "history.json"), "{}");
    put(path.join(f.targetDataDir, ".logs", "keep.log"), "keep");
    let sawPublished = false;
    await assert.rejects(importLegacyProject({ ...f, onProgress(event) {
      if (event.phase === "publish" && event.filesPublished > 0) {
        sawPublished = true;
        throw new Error("synthetic callback failure");
      }
    } }), /synthetic callback failure/);
    assert.equal(sawPublished, true);
    assertNoBusinessData(f.targetDataDir);
    assert.equal(fs.readFileSync(path.join(f.targetDataDir, ".logs", "keep.log"), "utf8"), "keep");
  });

  await check("conflicting target created during publishing is retained", async () => {
    const f = fixture("race");
    put(path.join(f.sourceRoot, "data", "z-history.json"), "new source");
    let injected = false;
    await assert.rejects(importLegacyProject({ ...f, onProgress(event) {
      if (event.phase === "publish" && event.filesPublished > 0 && !injected) {
        injected = true;
        put(path.join(f.targetDataDir, "z-history.json"), "concurrent target business data");
      }
    } }), { code: "target_not_empty" });
    assert.equal(fs.readFileSync(path.join(f.targetDataDir, "z-history.json"), "utf8"), "concurrent target business data");
    assert.equal(fs.existsSync(path.join(f.targetDataDir, "image-history.json")), false);
  });

  await check("source file collisions and noncanonical storage overrides fail explicitly", async () => {
    const f = fixture("layout");
    put(path.join(f.sourceRoot, ".env"), "AI_API_KEY=do-not-print\nCANVAS_DB_FILE=../private/canvas.db\n");
    await assert.rejects(inspectLegacyProject(f.sourceRoot), (error) => {
      assert.equal(error.code, "unsupported_source_layout");
      assert.match(error.message, /CANVAS_DB_FILE/);
      assert.doesNotMatch(error.message, /do-not-print|private/);
      return true;
    });
    fs.unlinkSync(path.join(f.sourceRoot, ".env"));
    put(path.join(f.sourceRoot, "output", "same.png"), "old output");
    put(path.join(f.sourceRoot, "data", "output", "same.png"), "different output");
    await assert.rejects(inspectLegacyProject(f.sourceRoot), { code: "source_collision" });
    assertNoBusinessData(f.targetDataDir);
  });

  await check("concurrent import is refused and the original import can finish", async () => {
    const f = fixture("concurrent");
    let tested = false;
    await importLegacyProject({ ...f, async onProgress(event) {
      if (event.phase === "copy" && !tested) {
        tested = true;
        await assert.rejects(importLegacyProject(f), { code: "migration_busy" });
      }
    } });
    assert.equal(tested, true);
  });

  await check("CLI emits machine-readable progress, completion and safe errors", async () => {
    const f = fixture("cli");
    const cli = path.join(__dirname, "../desktop/migrate-data-cli.js");
    const good = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", cli, f.sourceRoot, f.targetDataDir], { encoding: "utf8", windowsHide: true });
    assert.equal(good.status, 0, good.stderr || good.stdout);
    const messages = good.stdout.trim().split(/\r?\n/).map(JSON.parse);
    assert.equal(messages.at(-1).type, "complete");
    assert.equal(messages.at(-1).ok, true);
    assert.ok(messages.some((item) => item.type === "progress"));
    const bad = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", cli, f.sourceRoot, f.targetDataDir], { encoding: "utf8", windowsHide: true });
    assert.equal(bad.status, 1);
    const error = bad.stdout.trim().split(/\r?\n/).map(JSON.parse).at(-1);
    assert.equal(error.type, "error");
    assert.equal(error.code, "target_not_empty");
  });
}

main().then(() => console.log(`Portable migration checks passed (${checks}).`)).catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  // Only this freshly created synthetic fixture tree is ever removed.
  assert.equal(path.dirname(root), os.tmpdir());
  fs.rmSync(root, { recursive: true, force: true });
});
