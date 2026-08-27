const assert = require("assert");
const fs = require("fs");
const path = require("path");

const INDEX_SOURCE = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

assert.strictEqual(
  (INDEX_SOURCE.match(/\uFFFD/g) || []).length,
  0,
  "Public UI text must not contain Unicode replacement characters",
);
assert.match(INDEX_SOURCE, />参考 A<\/strong>/, "Reference image A label should be intact");
assert.match(INDEX_SOURCE, />参考 B<\/strong>/, "Reference image B label should be intact");
assert.match(
  INDEX_SOURCE,
  />\u56fe\u7247\u9884\u89c8<\/span>/,
  "Image preview title should be intact",
);

console.log("UI text encoding checks passed.");
