"use strict";

// Removes stale test fixture directories from the OS temp directory.
//
// The canvas/server test suites create short-lived fixtures with mkdtempSync and
// delete them in a finally block. A killed or timed-out run leaves its fixture
// behind, so repeated runs slowly accumulate gigabytes in %TEMP%. This sweeper
// only touches directories whose names start with a known fixture prefix and
// that are older than the age threshold.
//
// Usage:
//   node tools/clean-test-temp.js              # report fixtures older than 6h
//   node tools/clean-test-temp.js --apply      # delete them
//   node tools/clean-test-temp.js --hours=1    # lower the age threshold

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const FIXTURE_PREFIXES = Object.freeze([
  "ai-os-",
  "canvas-",
  "media-http-api-",
  "component-isolation-",
  "ai-os-component-isolation-",
]);

const DEFAULT_MAX_AGE_HOURS = 6;

function parseArgs(argv) {
  const options = { dryRun: true, maxAgeHours: DEFAULT_MAX_AGE_HOURS };
  for (const arg of argv) {
    if (arg === "--apply") options.dryRun = false;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg.startsWith("--hours=")) {
      const value = Number(arg.slice("--hours=".length));
      if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid --hours value: ${arg}`);
      options.maxAgeHours = value;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function directorySize(directory) {
  let total = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) total += directorySize(target);
    else if (entry.isFile()) total += fs.statSync(target).size;
  }
  return total;
}

function sweep(options) {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const cutoff = Date.now() - options.maxAgeHours * 60 * 60 * 1000;
  const removed = [];
  let freedBytes = 0;

  for (const entry of fs.readdirSync(tempRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!FIXTURE_PREFIXES.some((prefix) => entry.name.startsWith(prefix))) continue;

    const candidate = path.join(tempRoot, entry.name);
    const resolved = fs.realpathSync(candidate);
    // A resolved path must stay inside the temp root: no links, no symlinked
    // fixtures that would point somewhere else.
    if (path.dirname(resolved) !== tempRoot) continue;
    if (fs.statSync(resolved).mtimeMs > cutoff) continue;

    let size = 0;
    try {
      size = directorySize(resolved);
    } catch {
      continue;
    }
    if (!options.dryRun) {
      try {
        fs.rmSync(resolved, { recursive: true, force: true });
      } catch {
        continue;
      }
      if (fs.existsSync(resolved)) continue;
    }
    removed.push({ name: entry.name, size });
    freedBytes += size;
  }

  return { tempRoot, removed, freedBytes };
}

const options = parseArgs(process.argv.slice(2));
const { tempRoot, removed, freedBytes } = sweep(options);
const verb = options.dryRun ? "would remove" : "removed";
console.log(
  `${verb} ${removed.length} stale test fixture ${removed.length === 1 ? "directory" : "directories"} `
  + `(${(freedBytes / 1024 / 1024).toFixed(1)} MB) from ${tempRoot} `
  + `[older than ${options.maxAgeHours}h]`,
);
for (const entry of removed.slice(0, 20)) {
  console.log(`  ${entry.name}  ${(entry.size / 1024 / 1024).toFixed(1)} MB`);
}
if (removed.length > 20) console.log(`  ... and ${removed.length - 20} more`);
