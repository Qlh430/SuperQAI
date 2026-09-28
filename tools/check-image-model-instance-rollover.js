const assert = require("node:assert/strict");
const { chromium } = require("C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright");

const BASE_URL = process.env.CANVAS_AGENT_TEST_URL || "http://127.0.0.1:3099";
const CHROME = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || "C:/Program Files/Google/Chrome/Application/chrome.exe";

function imageModelResponse({ instanceId, revision, candidates = [] }) {
  return {
    instanceId,
    revision,
    defaultModel: candidates[0]?.id || "",
    models: candidates.map((candidate) => candidate.id),
    labels: {},
    resolutions: Object.fromEntries(candidates.map((candidate) => [candidate.id, candidate.resolutions || ["1", "2", "4"]])),
    platforms: Object.fromEntries(candidates.map((candidate) => [candidate.id, candidate.platform || "openai"])),
    families: Object.fromEntries(candidates.map((candidate) => [candidate.id, candidate.family || "gpt-image-2"])),
    prices: {},
    candidates,
  };
}

(async () => {
  let response = imageModelResponse({
    instanceId: "server-before-restart",
    revision: 8,
  });
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await page.route("**/api/image-models", (route) => route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify(response),
    }));
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    assert.equal(await page.evaluate(() => resolveCanvasAgentImageModel()?.id || ""), "");

    response = imageModelResponse({
      instanceId: "server-after-restart",
      revision: 1,
      candidates: [{
        id: "restart-image2",
        providerId: "restart-provider",
        providerName: "重启后可用接口",
        providerBaseUrl: "https://api.hyhawang.com",
        model: "gpt-image-2",
        enabled: true,
        hasApiKey: true,
        hasBaseUrl: true,
        capabilities: ["generation", "edit"],
        state: "online",
        platform: "openai",
        family: "gpt-image-2",
        resolutions: ["1", "2", "4"],
      }],
    });

    const resolvedAfterRestart = await page.evaluate(async () => {
      await loadImageModels({ preserveOnError: true });
      return resolveCanvasAgentImageModel()?.id || "";
    });
    assert.equal(
      resolvedAfterRestart,
      "restart-image2",
      "a lower revision from a new server instance must replace the stale empty model snapshot",
    );
    console.log("Image model instance rollover check passed.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
