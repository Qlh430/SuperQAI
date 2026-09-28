"use strict";

const path = require("node:path");
const {
  copyPortableRuntimeFiles,
} = require("./portable-package-manifest");

const sourceRoot = path.resolve(__dirname, "..");
const targetRoot = process.argv[2] ? path.resolve(process.argv[2]) : "";

if (!targetRoot) {
  console.error("Usage: node tools/copy-portable-runtime.js <target-directory>");
  process.exit(1);
}

try {
  const manifest = copyPortableRuntimeFiles(sourceRoot, targetRoot);
  console.log(`Copied ${manifest.files.length} portable runtime files.`);
} catch (error) {
  console.error(error?.stack || error);
  process.exit(1);
}
