"use strict";

const assert = require("node:assert/strict");
const {
  hashPassword,
  verifyPassword,
  createOpaqueToken,
} = require("../auth-crypto");

(async () => {
  const first = await hashPassword("correct horse battery staple");
  const second = await hashPassword("correct horse battery staple");

  assert.match(first, /^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.notEqual(first, second, "password hashes must use independent salts");
  assert.equal(await verifyPassword("correct horse battery staple", first), true);
  assert.equal(await verifyPassword("wrong password", first), false);
  assert.equal(await verifyPassword("correct horse battery staple", "not-a-password-hash"), false);

  await assert.rejects(
    () => hashPassword(""),
    (error) => error.code === "invalid_password",
  );
  await assert.rejects(
    () => hashPassword("x".repeat(4097)),
    (error) => error.code === "invalid_password",
  );

  const tokenA = createOpaqueToken(32);
  const tokenB = createOpaqueToken(32);
  assert.match(tokenA, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(tokenA, tokenB, "opaque tokens must be random");

  console.log("Auth crypto checks passed.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
