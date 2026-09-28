"use strict";

const fs = require("node:fs");
const path = require("node:path");

let sharp;
try {
  sharp = require("sharp");
} catch {
  sharp = require(path.join(
    process.env.USERPROFILE || "",
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp",
  ));
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const outputDirectory = path.join(root, "desktop");
  fs.mkdirSync(outputDirectory, { recursive: true });
  const png = await sharp(path.join(root, "logo.png"))
    .resize(256, 256, { fit: "cover" })
    .png()
    .toBuffer();
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(0, 6);
  header.writeUInt8(0, 7);
  header.writeUInt8(0, 8);
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  fs.writeFileSync(path.join(outputDirectory, "icon.ico"), Buffer.concat([header, png]));
  console.log("Host icon built.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
