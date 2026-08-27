const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const contract = require("../canvas-engine-contract");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const portable = fs.readFileSync(path.join(root, "build-portable.bat"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

assert.equal(contract.ENGINE_VERSION, "canvas-visual-fidelity-v2");
assert.equal(contract.assertCompatible(contract.ENGINE_VERSION), true);
assert.throws(
  () => contract.assertCompatible(""),
  (error) => error?.code === "canvas_engine_version_mismatch"
    && /请重启本地服务/.test(error.message),
);

assert.match(
  html,
  /canvas-engine-contract\.js[^>]*><\/script>[\s\S]*canvas-viewport-data-source\.js[^>]*><\/script>/,
  "the engine contract must load before the viewport data source",
);
assert.match(portable, /\bcanvas-engine-contract\.js\b/);
assert.match(packageJson.scripts["check:canvas-engine-contract"], /node --check canvas-engine-contract\.js/);
assert.throws(
  () => contract.assertCompatible("canvas-semantic-zoom-v1"),
  (error) => error?.code === "canvas_engine_version_mismatch",
);

console.log("Canvas engine contract checks passed.");
