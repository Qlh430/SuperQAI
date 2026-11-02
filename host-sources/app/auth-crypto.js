"use strict";

const crypto = require("node:crypto");
const { promisify } = require("node:util");

const scryptAsync = promisify(crypto.scrypt);
const DEFAULT_SCRYPT_OPTIONS = Object.freeze({
  N: 16_384,
  r: 8,
  p: 1,
  keylen: 64,
});
const MAX_PASSWORD_LENGTH = 4096;

function invalidPassword() {
  return Object.assign(new Error("Password must contain between 1 and 4096 characters."), {
    code: "invalid_password",
  });
}

function normalizePassword(password) {
  if (typeof password !== "string" || !password.length || password.length > MAX_PASSWORD_LENGTH) {
    throw invalidPassword();
  }
  return password;
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new TypeError("Invalid scrypt parameter.");
  return parsed;
}

async function derivePassword(password, salt, options) {
  const maxmem = Math.max(32 * 1024 * 1024, 128 * options.N * options.r + 1024 * 1024);
  return scryptAsync(password, salt, options.keylen, {
    N: options.N,
    r: options.r,
    p: options.p,
    maxmem,
  });
}

async function hashPassword(password, options = {}) {
  const normalizedPassword = normalizePassword(password);
  const params = {
    N: normalizePositiveInteger(options.N, DEFAULT_SCRYPT_OPTIONS.N),
    r: normalizePositiveInteger(options.r, DEFAULT_SCRYPT_OPTIONS.r),
    p: normalizePositiveInteger(options.p, DEFAULT_SCRYPT_OPTIONS.p),
    keylen: normalizePositiveInteger(options.keylen, DEFAULT_SCRYPT_OPTIONS.keylen),
  };
  const salt = options.salt
    ? Buffer.from(options.salt)
    : crypto.randomBytes(normalizePositiveInteger(options.saltLength, 16));
  const derived = await derivePassword(normalizedPassword, salt, params);
  return ["scrypt", params.N, params.r, params.p, salt.toString("base64"), derived.toString("base64")].join("$");
}

async function verifyPassword(password, encoded) {
  if (typeof password !== "string" || !password.length || password.length > MAX_PASSWORD_LENGTH) return false;
  if (typeof encoded !== "string") return false;
  const fields = encoded.split("$");
  if (fields.length !== 6 || fields[0] !== "scrypt") return false;

  try {
    const params = {
      N: normalizePositiveInteger(fields[1]),
      r: normalizePositiveInteger(fields[2]),
      p: normalizePositiveInteger(fields[3]),
      keylen: Buffer.from(fields[5], "base64").length,
    };
    const salt = Buffer.from(fields[4], "base64");
    const expected = Buffer.from(fields[5], "base64");
    if (!salt.length || !expected.length) return false;
    const actual = await derivePassword(password, salt, params);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function createOpaqueToken(byteLength = 32) {
  return crypto.randomBytes(normalizePositiveInteger(byteLength, 32)).toString("base64url");
}

module.exports = {
  DEFAULT_SCRYPT_OPTIONS,
  MAX_PASSWORD_LENGTH,
  hashPassword,
  verifyPassword,
  createOpaqueToken,
};
