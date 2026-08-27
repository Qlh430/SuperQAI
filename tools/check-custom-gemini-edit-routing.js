const fs = require("fs");
const path = require("path");

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const start = source.indexOf("async function executeImageGenerationPayload");
const end = source.indexOf("function compactImageJobResponse", start);
if (start === -1 || end === -1) {
  console.error("Could not find shared image generation executor block.");
  process.exit(1);
}

const block = source.slice(start, end);
const expectations = [
  {
    ok: /requestGeminiNativeImageGeneration/.test(block),
    message: "Custom Gemini providers that require native image APIs should be routed explicitly.",
  },
  {
    ok: /shouldUseGeminiNativeImageApi\(customModel\)/.test(block),
    message: "The shared image executor should detect custom Gemini providers that need the native generateContent API.",
  },
  {
    ok: /return\s*\{\s*status:\s*upstream\.status,\s*body:\s*\{\s*error:\s*upstreamError/.test(block) && /extractUpstreamErrorMessage/.test(block),
    message: "Image upstream failures should be returned as JSON with an extracted error message.",
  },
  {
    ok: !/res\.writeHead\(upstream\.status/.test(block),
    message: "Image upstream failures should not be passed through as raw non-JSON responses.",
  },
];

const nativeFunctionStart = source.indexOf("async function requestGeminiNativeImageGeneration");
const nativeFunctionEnd = source.indexOf("async function requestImageChat", nativeFunctionStart);
const nativeBlock = nativeFunctionStart >= 0 && nativeFunctionEnd > nativeFunctionStart
  ? source.slice(nativeFunctionStart, nativeFunctionEnd)
  : "";

expectations.push(
  {
    ok: /\/v1beta\/models\/\$\{encodeURIComponent\(upstreamModel\)\}:generateContent/.test(nativeBlock),
    message: "Gemini native image requests should call /v1beta/models/{model}:generateContent.",
  },
  {
    ok: /responseModalities:\s*\[\s*"TEXT"\s*,\s*"IMAGE"\s*\]/.test(nativeBlock),
    message: "Gemini native image requests should ask for both text and image response modalities.",
  },
  {
    ok: /inline_data/.test(nativeBlock) && /mime_type/.test(nativeBlock) && /data/.test(nativeBlock),
    message: "Gemini native reference images should be sent as inline base64 image parts.",
  },
);

const normalizeStart = source.indexOf("function normalizeChatImageResponse");
const normalizeEnd = source.indexOf("function collectImagesFromValue", normalizeStart);
const normalizeBlock = normalizeStart >= 0 && normalizeEnd > normalizeStart ? source.slice(normalizeStart, normalizeEnd) : "";
expectations.push({
  ok: /collectImagesFromValue\(data\.candidates/.test(normalizeBlock) && /collectImagesFromValue\(data\.output_image/.test(normalizeBlock),
  message: "Image response normalization should parse Gemini candidates and output_image fields.",
});

const failures = expectations.filter((item) => !item.ok);
if (failures.length) {
  for (const failure of failures) console.error(failure.message);
  process.exit(1);
}
