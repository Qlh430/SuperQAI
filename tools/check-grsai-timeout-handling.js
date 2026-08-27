const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

function getBlock(start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  if (startIndex === -1 || endIndex === -1) {
    console.error(`Could not find block from ${start} to ${end}`);
    process.exit(1);
  }
  return source.slice(startIndex, endIndex);
}

const transientBlock = getBlock("function isGrsaiTransientError", "function normalizeGrsaiError");
const normalizeBlock = getBlock("function normalizeGrsaiError", "function getModelDisplayNameForError");
const requestBlock = getBlock("async function submitGrsaiImageTask", "function extractGrsaiImageUrls");
const attemptBlock = getBlock("async function runGrsaiImageAttemptWithRetry", "async function submitGrsaiImageTask");

const expectations = [
  {
    ok: !/abort|timeout|timed out/i.test(transientBlock),
    message: "GrsAI must not classify an ambiguous timeout as safe to resubmit.",
  },
  {
    ok: /abort|timeout|timed out/i.test(normalizeBlock) && /GrsAI/.test(normalizeBlock),
    message: "GrsAI normalized errors should turn aborted timeouts into a useful GrsAI message.",
  },
  {
    ok: /GRSAI_IMAGE_FETCH_TIMEOUT_MS/.test(source),
    message: "GrsAI requests should use a dedicated timeout constant.",
  },
  {
    ok: (requestBlock.match(/GRSAI_IMAGE_FETCH_TIMEOUT_MS/g) || []).length >= 2,
    message: "GrsAI submit and result polling should use the dedicated timeout.",
  },
  {
    ok: !/maxAttempts|setTimeout\(resolve, attempt/.test(attemptBlock) && /避免重复扣费|duplicate charges/.test(attemptBlock + normalizeBlock),
    message: "GrsAI image jobs must not auto-resubmit after an ambiguous submission outcome.",
  },
];

const failures = expectations.filter((item) => !item.ok);
if (failures.length) {
  for (const failure of failures) console.error(failure.message);
  process.exit(1);
}
