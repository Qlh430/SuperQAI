"use strict";

const { importLegacyProject } = require("./portable-migration");

function emit(message) {
  return new Promise((resolve, reject) => {
    process.stdout.write(`${JSON.stringify(message)}\n`, (error) => error ? reject(error) : resolve());
  });
}

async function main() {
  const [sourceRoot, targetDataDir, ...extra] = process.argv.slice(2);
  if (!sourceRoot || !targetDataDir || extra.length) {
    const error = new Error("Usage: node desktop/migrate-data-cli.js <old-project-root> <new-data-directory>");
    error.code = "invalid_arguments";
    throw error;
  }
  const result = await importLegacyProject({ sourceRoot, targetDataDir, onProgress: (event) => emit({ type: "progress", ...event }) });
  await emit({ type: "complete", ...result });
}

main().catch(async (error) => {
  process.exitCode = 1;
  await emit({ type: "error", code: error.code || "migration_failed", message: error.message || "Migration failed." });
});
