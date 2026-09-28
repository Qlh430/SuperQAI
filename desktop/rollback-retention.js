"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { inside, readJson, removeInside } = require("./update-files");

const TRANSACTION_ID_RE = /^[a-f0-9]{24}$/;
const DEFAULT_KEEP_SUCCESSFUL = 1;
const DEFAULT_KEEP_FAILED = 1;
const DEFAULT_MINIMUM_AGE_MS = 10 * 60_000;

function readLatestResult(root) {
  try {
    const result = readJson(inside(root, ".ai-runtime/updates/result.json"));
    return result && typeof result === "object" ? result : null;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw Object.assign(new Error(`回滚保留状态无效：${error.message}`), { code: "rollback_retention_state_invalid" });
  }
}

function hasFailedData(directory) {
  const failed = path.join(directory, "failed-data");
  let stat;
  try {
    stat = fs.lstatSync(failed);
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
  if (stat.isSymbolicLink()) throw Error("回滚快照不能包含符号链接或目录联接");
  return true;
}

function listTransactions(root) {
  const rollbackRoot = inside(root, ".ai-runtime/rollback");
  let entries;
  try {
    entries = fs.readdirSync(rollbackRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const transactions = [];
  for (const entry of entries) {
    if (!TRANSACTION_ID_RE.test(entry.name) || entry.isSymbolicLink()) continue;
    const directory = path.join(rollbackRoot, entry.name);
    const stat = fs.lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) continue;
    transactions.push({
      id: entry.name,
      kind: hasFailedData(directory) ? "failed" : "successful",
      mtimeMs: stat.mtimeMs,
    });
  }
  return transactions;
}

function retentionCount(value, fallback, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) return fallback;
  return Math.min(number, maximum);
}

function pruneRollbackSnapshots(root, options = {}) {
  const portableRoot = path.resolve(root);
  if (fs.existsSync(inside(portableRoot, ".ai-runtime/updates/install.json"))) {
    return { skipped: "update-in-progress", protected: [], kept: [], removed: [], errors: [] };
  }

  const latest = readLatestResult(portableRoot);
  const transactions = listTransactions(portableRoot);
  if (latest && TRANSACTION_ID_RE.test(String(latest.id || ""))) {
    const current = transactions.find((transaction) => transaction.id === latest.id);
    if (current && ["rolled-back", "error"].includes(String(latest.status || ""))) current.kind = "failed";
  }

  const keepSuccessful = retentionCount(options.keepSuccessful, DEFAULT_KEEP_SUCCESSFUL, 100);
  const keepFailed = retentionCount(options.keepFailed, DEFAULT_KEEP_FAILED, 100);
  const minimumAgeMs = retentionCount(options.minimumAgeMs, DEFAULT_MINIMUM_AGE_MS, 365 * 24 * 60 * 60_000);
  const now = Number.isFinite(Number(options.now)) ? Number(options.now) : Date.now();
  const protectedIds = new Set(
    latest && TRANSACTION_ID_RE.test(String(latest.id || "")) ? [String(latest.id)] : [],
  );
  const keepIds = new Set(protectedIds);

  for (const [kind, count] of [["successful", keepSuccessful], ["failed", keepFailed]]) {
    transactions
      .filter((transaction) => transaction.kind === kind && !keepIds.has(transaction.id))
      .sort((left, right) => right.mtimeMs - left.mtimeMs)
      .slice(0, count)
      .forEach((transaction) => keepIds.add(transaction.id));
  }
  for (const transaction of transactions) {
    if (now - transaction.mtimeMs < minimumAgeMs) keepIds.add(transaction.id);
  }

  const removed = [];
  const errors = [];
  const candidates = transactions
    .filter((transaction) => !keepIds.has(transaction.id))
    .sort((left, right) => left.mtimeMs - right.mtimeMs);
  for (const transaction of candidates) {
    if (options.dryRun) {
      removed.push(transaction.id);
      continue;
    }
    try {
      removeInside(portableRoot, `.ai-runtime/rollback/${transaction.id}`);
      removed.push(transaction.id);
    } catch (error) {
      errors.push({ id: transaction.id, message: String(error.message || error) });
    }
  }

  return {
    skipped: "",
    protected: [...protectedIds].sort(),
    kept: [...keepIds].sort(),
    removed,
    errors,
  };
}

module.exports = {
  TRANSACTION_ID_RE,
  DEFAULT_KEEP_SUCCESSFUL,
  DEFAULT_KEEP_FAILED,
  DEFAULT_MINIMUM_AGE_MS,
  pruneRollbackSnapshots,
};
