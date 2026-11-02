"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function inside(root, relative) {
  if (typeof relative !== "string" || !relative || /[\\:]/.test(relative) || path.isAbsolute(relative)) throw Error("Invalid relative update path");
  const parts = relative.split("/");
  if (parts.some(part => !part || part === "." || part === ".." || /[. ]$/.test(part))) throw Error("Update path escapes portable folder");
  let result = path.resolve(root);
  if (fs.lstatSync(result).isSymbolicLink()) throw Error("Portable folder must not be a link");
  for (const part of parts) {
    result = path.join(result, part);
    if (fs.existsSync(result) && fs.lstatSync(result).isSymbolicLink()) throw Error("Update path must not contain links");
  }
  return result;
}
function atomicWrite(file, value) {
  const temp = `${file}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const fd = fs.openSync(temp, "wx");
  try { fs.writeFileSync(fd, typeof value === "string" ? value : JSON.stringify(value, null, 2)); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  try { fs.renameSync(temp, file); } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function copyTree(source, destination) {
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) throw Error("Data snapshot does not follow symbolic links or junctions");
  if (stat.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true });
    for (const name of fs.readdirSync(source)) copyTree(path.join(source, name), path.join(destination, name));
  } else if (stat.isFile()) fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
  else throw Error("Unsupported data file");
}
function hashFile(file) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(file, "r");
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    for (;;) {
      const bytes = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (!bytes) break;
      hash.update(buffer.subarray(0, bytes));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}
function copyFileVerified(source, destination, expected = {}) {
  const sourceStat = fs.lstatSync(source);
  if (!sourceStat.isFile()) throw Error("Update source must be a regular file");
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  const destinationStat = fs.statSync(destination);
  if (!destinationStat.isFile() || destinationStat.size !== sourceStat.size) {
    throw Error(`Copied file size mismatch: ${destination}`);
  }
  if (Number.isSafeInteger(expected.size) && destinationStat.size !== expected.size) {
    throw Error(`Copied file size does not match manifest: ${destination}`);
  }
  if (typeof expected.sha256 === "string" && /^[a-f0-9]{64}$/i.test(expected.sha256)) {
    const actual = hashFile(destination);
    if (actual !== expected.sha256.toLowerCase()) throw Error(`Copied file hash does not match manifest: ${destination}`);
  }
  return { size: destinationStat.size, sha256: hashFile(destination) };
}
function removePathStrict(target) {
  const remove = file => {
    let stat;
    try { stat = fs.lstatSync(file); } catch (error) { if (error.code === "ENOENT") return; throw error; }
    if (stat.isSymbolicLink()) throw Error("Update cleanup must not follow links");
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(file)) remove(path.join(file, name));
      fs.rmdirSync(file);
    } else {
      fs.unlinkSync(file);
    }
  };
  for (let attempt = 0;; attempt += 1) {
    try {
      remove(target);
      if (fs.existsSync(target)) throw Error(`Update cleanup left a file behind: ${target}`);
      return;
    } catch (error) {
      if (attempt >= 4 || !["EPERM", "EACCES", "EBUSY", "ENOTEMPTY"].includes(error.code)) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
    }
  }
}
function removeInside(root, relative) {
  const target = inside(fs.realpathSync(root), relative);
  removePathStrict(target);
}
function runtimeName(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/.test(value) || /[. ]$/.test(value)) throw Error("Invalid runtime name");
  return value;
}
function transaction(root) {
  const tx = readJson(inside(root, ".ai-runtime/updates/install.json"));
  runtimeName(tx.previous); runtimeName(tx.candidate);
  if (!/^[a-f0-9]{24}$/.test(tx.id) || tx.previous === tx.candidate || tx.format !== 1) throw Error("Invalid update transaction");
  if (!["waiting", "snapshotting", "snapshotted", "switching", "starting", "confirmed", "restoring"].includes(tx.phase)) throw Error("Invalid update transaction phase");
  return tx;
}
module.exports = { inside, atomicWrite, readJson, copyTree, hashFile, copyFileVerified, removePathStrict, removeInside, runtimeName, transaction };
