"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

/**
 * server.js is intentionally a bootstrap: configuration, host services, HTTP
 * entry and lifecycle. The component wiring lives in
 * server-components/composition.js. Source-level checks care about "does this
 * wiring exist", so they read the whole entry surface rather than one file.
 */
const SERVER_SOURCE_FILES = Object.freeze([
  "server.js",
  "server-config.js",
  "image-provider-request-rules.js",
  "server-settings-service.js",
  "server-components/composition.js",
]);

function readServerSource() {
  return SERVER_SOURCE_FILES
    .map((relative) => fs.readFileSync(path.join(ROOT, relative), "utf8"))
    .join("\n");
}

module.exports = { readServerSource, SERVER_SOURCE_FILES, ROOT };
