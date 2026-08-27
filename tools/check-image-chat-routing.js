const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const match = source.match(/async function requestImageChat\([\s\S]*?\r?\n}\r?\n\r?\nfunction buildGeminiImageChatContent/);

if (!match) {
  console.error("Could not find requestImageChat block in server.js");
  process.exit(1);
}

const block = match[0];
const expectations = [
  {
    ok: /resolveCustomModel\(\s*model,\s*"generation"\s*\)/.test(block),
    message: "requestImageChat should resolve custom image generation models.",
  },
  {
    ok: /getUpstreamImageModel\(\s*model,\s*size\s*\)/.test(block),
    message: "requestImageChat should send the upstream model id, not the custom client id.",
  },
  {
    ok: /fetch\(\s*provider\.url\s*,/.test(block),
    message: "requestImageChat should fetch through the resolved provider url.",
  },
  {
    ok: /Authorization:\s*`Bearer \$\{provider\.key\}`/.test(block),
    message: "requestImageChat should use the resolved provider API key.",
  },
  {
    ok: !/fetch\(\s*IMAGE_CHAT_API_URL\s*,/.test(block),
    message: "requestImageChat should not hard-code IMAGE_CHAT_API_URL for every model.",
  },
];

const failures = expectations.filter((item) => !item.ok);
if (failures.length) {
  for (const failure of failures) console.error(failure.message);
  process.exit(1);
}
