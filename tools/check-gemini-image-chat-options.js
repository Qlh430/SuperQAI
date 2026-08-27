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

const requestBlock = getBlock("async function requestImageChat", "function buildGeminiImageChatContent");
const collectBlock = getBlock("function collectImagesFromValue", "function collectImagesFromText");
const normalizeBlock = getBlock("function normalizeChatImageResponse", "function collectImagesFromValue");

const expectations = [
  {
    ok: /body\.modalities\s*=\s*\[\s*"text"\s*,\s*"image"\s*\]/.test(requestBlock),
    message: "Gemini image chat requests should ask for image output via modalities.",
  },
  {
    ok: /collectImagesFromValue\(data\.data,\s*items\)/.test(normalizeBlock)
      && !/Array\.isArray\(data\.data\)\s*&&\s*data\.data\.length\)\s*return data/.test(normalizeBlock),
    message: "Chat image normalization should inspect existing data arrays instead of returning early.",
  },
  {
    ok: /source/.test(collectBlock) && /inline_data/.test(collectBlock) && /inlineData/.test(collectBlock),
    message: "Image extraction should handle Gemini source/inline_data image parts.",
  },
  {
    ok: /file_data/.test(collectBlock) && /fileData/.test(collectBlock),
    message: "Image extraction should handle file_data image parts.",
  },
];

const failures = expectations.filter((item) => !item.ok);
if (failures.length) {
  for (const failure of failures) console.error(failure.message);
  process.exit(1);
}
