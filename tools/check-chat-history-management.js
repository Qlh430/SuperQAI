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

assert.match(html, /id="clearChatHistory"[^>]*aria-pressed="false"[^>]*>管理<\/button>/);
assert.match(html, /id="chatHistorySelectionBar"[^>]*hidden/);
assert.match(html, /id="chatHistorySelectionCount"/);
assert.match(html, /id="selectAllChatHistory"/);
assert.match(html, /id="chatHistoryDeleteBar"[^>]*hidden/);
assert.match(html, /id="deleteSelectedChatHistory"[^>]*disabled/);
assert.match(html, /id="chatHistoryDeleteConfirm"[^>]*hidden/);
assert.match(html, /id="confirmDeleteSelectedChatHistory"/);
assert.match(html, /styles\.css\?v=[^"]+/);

assert.match(script, /let chatHistoryManaging = false;/);
assert.match(script, /const selectedChatHistoryIds = new Set\(\);/);
assert.match(script, /function resetChatHistoryDeleteConfirmation\(\)/);
assert.match(script, /function updateChatHistoryManagementUi\(\)/);
assert.match(script, /function setChatHistoryManaging\(nextValue\)/);
assert.doesNotMatch(
  script,
  /clearServerHistory\(CHAT_HISTORY_API_URL\)/,
  "Chat history management must not retain a clear-all path",
);
assert.match(script, /for \(const id of ids\) \{\s*await deleteServerHistoryRecord\(CHAT_HISTORY_API_URL, id\);/);
assert.match(script, /row\.dataset\.historyId = recordId;/);
assert.match(script, /button\.setAttribute\("aria-pressed", String\(selected\)\);/);
assert.match(script, /row\.classList\.toggle\("selected", selected\);/);
assert.match(script, /await deleteServerHistoryRecord\(CHAT_HISTORY_API_URL, record\.id\);/);

const openRowRule = extractLastRule("#chatView .history-chat-row:has(.history-chat-menu:not([hidden]))");
assert.match(openRowRule, /z-index:\s*20\s*;/);
const lastMenuRule = extractLastRule("#chatView .history-chat-row:last-child .history-chat-menu");
assert.match(lastMenuRule, /top:\s*auto\s*;/);
assert.match(lastMenuRule, /bottom:\s*calc\(50% \+ 17px\)\s*;/);
const onlyMenuRule = extractLastRule("#chatView .history-chat-row:only-child .history-chat-menu");
assert.match(onlyMenuRule, /top:\s*calc\(50% \+ 17px\)\s*;/);
assert.match(onlyMenuRule, /bottom:\s*auto\s*;/);
const managingPanelRule = extractLastRule("#chatView .chat-history-panel.is-managing");
assert.match(managingPanelRule, /grid-template-rows:\s*34px 50px minmax\(0, 1fr\) auto\s*;/);
const canvasManagingPanelRule = extractLastRule(".canvas-first-shell #chatView.canvas-tool-overlay .chat-history-panel.is-managing");
assert.match(canvasManagingPanelRule, /grid-template-rows:\s*34px 50px minmax\(0, 1fr\) auto\s*;/);

for (const selector of [
  "#chatView .chat-history-selection-bar",
  "#chatView .chat-history-delete-bar",
  "#chatView .chat-history-check",
  "#chatView .history-chat-row.selected",
]) {
  extractLastRule(selector);
}

console.log("Chat history management checks passed.");
