const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const script = fs.readFileSync(path.join(ROOT, "script.js"), "utf8");
const styles = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

function extractLastRule(selector) {
  const start = styles.lastIndexOf(`${selector} {`);
  assert.notStrictEqual(start, -1, `Missing CSS rule for ${selector}`);
  const bodyStart = styles.indexOf("{", start) + 1;
  const bodyEnd = styles.indexOf("}", bodyStart);
  return styles.slice(bodyStart, bodyEnd);
}

assert.match(html, /id="clearImageHistory"[^>]*aria-pressed="false"[^>]*>管理<\/button>/);
assert.match(html, /id="imageHistorySelectionBar"[^>]*hidden/);
assert.match(html, /id="imageHistorySelectionCount"/);
assert.match(html, /id="selectAllImageHistory"/);
assert.match(html, /id="imageHistoryDeleteBar"[^>]*hidden/);
assert.match(html, /id="deleteSelectedImageHistory"[^>]*disabled/);
assert.match(html, /id="imageHistoryDeleteConfirm"[^>]*hidden/);
assert.match(html, /id="confirmDeleteSelectedImageHistory"/);

assert.match(script, /let imageHistoryManaging = false;/);
assert.match(script, /const selectedImageHistoryIds = new Set\(\);/);
assert.match(script, /function resetImageHistoryDeleteConfirmation\(\)/);
assert.match(script, /function updateImageHistoryManagementUi\(\)/);
assert.match(script, /function setImageHistoryManaging\(nextValue\)/);
assert.doesNotMatch(
  script,
  /clearServerHistory\(`\$\{IMAGE_HISTORY_API_URL\}\?category=image`\)/,
  "Image history management must not retain a one-click clear-all path",
);
assert.match(script, /for \(const id of ids\) \{\s*await deleteServerHistoryRecord\(IMAGE_HISTORY_API_URL, id\);\s*\}/);
assert.match(script, /button\.dataset\.historyId = recordId;/);
assert.match(script, /button\.setAttribute\("aria-pressed", String\(selected\)\);/);
assert.match(script, /button\.classList\.toggle\("selected", selected\);/);

const sizeRowRule = extractLastRule("#imageView .size-row");
assert.match(sizeRowRule, /grid-template-columns:\s*42px minmax\(0, 1fr\) minmax\(116px, 128px\)\s*;/);
const sizeControlRule = extractLastRule("#imageView .size-row > select");
assert.match(sizeControlRule, /min-width:\s*0\s*;/);
assert.match(sizeControlRule, /width:\s*100%\s*;/);

const darkPromptRule = extractLastRule(':root[data-theme="dark"] #imageView #imagePrompt');
assert.match(darkPromptRule, /box-shadow:\s*none\s*;/);

for (const selector of [
  "#imageView .image-history-selection-bar",
  "#imageView .image-history-delete-bar",
  "#imageView .history-thumb-check",
  "#imageView .history-thumb.selected",
]) {
  extractLastRule(selector);
}

console.log("Image history management checks passed.");
