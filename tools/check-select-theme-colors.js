const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const styles = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8").replace(/\r\n/g, "\n");

function extractLastRule(selector) {
  const start = styles.lastIndexOf(`${selector} {`);
  assert.notStrictEqual(start, -1, `Missing CSS rule for ${selector}`);
  const bodyStart = styles.indexOf("{", start) + 1;
  const bodyEnd = styles.indexOf("}", bodyStart);
  return styles.slice(bodyStart, bodyEnd);
}

function assertThemeTokens(body, background, color) {
  assert.match(body, new RegExp(`background:\\s*${background}\\s*;`));
  assert.match(body, new RegExp(`color:\\s*${color}\\s*;`));
}

const commonOptions = extractLastRule(".upscale-size-select option,\nselect option");
const commonChecked = extractLastRule(".upscale-size-select option:checked,\nselect option:checked");
const darkOptions = extractLastRule(':root[data-theme="dark"] .upscale-size-select option,\n:root[data-theme="dark"] select option');
const darkChecked = extractLastRule(':root[data-theme="dark"] .upscale-size-select option:checked,\n:root[data-theme="dark"] select option:checked');
const darkHover = extractLastRule(':root[data-theme="dark"] .upscale-size-select option:not(:checked):hover,\n:root[data-theme="dark"] .upscale-size-select option:not(:checked):focus-visible,\n:root[data-theme="dark"] select option:not(:checked):hover,\n:root[data-theme="dark"] select option:not(:checked):focus-visible');

assertThemeTokens(commonOptions, "var\\(--field\\)", "var\\(--ink\\)");
assertThemeTokens(commonChecked, "var\\(--accent\\)", "var\\(--accent-contrast, #202020\\)");
assertThemeTokens(darkOptions, "var\\(--field\\)", "var\\(--ink\\)");
assertThemeTokens(darkChecked, "var\\(--accent\\)", "var\\(--accent-contrast, #202020\\)");
assertThemeTokens(darkHover, "var\\(--accent-soft\\)", "var\\(--ink\\)");
assert.doesNotMatch(darkHover, /(?:transition|transform|translate|box-shadow)\s*:/i);

for (const hardCodedColor of ["#60a5fa", "#07111f", "#101827"]) {
  assert.doesNotMatch(`${darkOptions}\n${darkChecked}`, new RegExp(hardCodedColor, "i"));
}

assert.match(html, /styles\.css\?v=[^"']+/);

console.log("Select theme color checks passed.");
