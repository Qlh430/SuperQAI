"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

let playwright;
try {
  playwright = require(process.env.AI_OS_TEST_PLAYWRIGHT_MODULE || "playwright");
} catch {
  playwright = require(path.join(
    process.env.USERPROFILE || "",
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  ));
}

const ROOT = path.join(__dirname, "..");
const ARTIFACT_DIR = path.join(ROOT, "artifacts", "canvas-text-markdown");
const RAW_MARKDOWN = [
  "### Heading",
  "",
  "**Bold** and `code`",
  "",
  "- first",
  "- second",
  "",
  "<img src=x onerror=\"window.__canvasTextXss = true\">",
].join("\n");
const UPDATED_MARKDOWN = [
  "## Updated",
  "",
  "1. one",
  "2. two",
  "",
  "~~removed~~",
  "",
  "[unsafe](javascript:alert(1))",
].join("\n");

async function reservePort() {
  const probe = http.createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 5_000);
    timer.unref?.();
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

(async () => {
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-text-markdown-"));
  let serverOutput = "";
  const server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: ROOT,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      AI_OS_DATA_DIR: dataDir,
      AI_OS_AUTH_DISABLED: "true",
      CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false",
      CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false",
    },
  });
  server.stdout.on("data", (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-5_000); });
  server.stderr.on("data", (chunk) => { serverOutput = `${serverOutput}${chunk}`.slice(-5_000); });

  let browser;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (server.exitCode !== null) break;
      try {
        const response = await fetch(`${baseUrl}/api/system/ready`);
        if (response.ok && (await response.json()).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, `isolated server did not become ready: ${serverOutput}`);

    const executablePath = [
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    ].find((candidate) => candidate && fs.existsSync(candidate));
    browser = await playwright.chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const location = message.location();
      if (String(location.url || "").endsWith("/favicon.ico")) return;
      pageErrors.push(`console: ${message.text()} @ ${location.url || "unknown"}:${location.lineNumber || 0}`);
    });

    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.locator("#aiOsDesktop:not([hidden])").waitFor({ state: "visible", timeout: 30_000 });
    await page.locator('[data-ai-app="canvas"]').click();
    await page.locator("#canvasLibraryScreen").waitFor({ state: "visible", timeout: 30_000 });
    await page.locator("#canvasBoardNew").click();
    await page.locator("#canvasNameInput").fill("Text Markdown");
    await page.locator("#canvasNameForm button[type=submit]").click();
    await page.locator("#canvasEditorScreen").waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForFunction(() => Boolean(window.CanvasAgentMarkdown?.renderMarkdown), null, { timeout: 30_000 });

    const created = await page.evaluate(async (raw) => {
      const node = addCanvasText({ x: 240, y: 180 }, { text: raw, focus: false });
      scheduleCanvasSave();
      await flushCanvasOperations();
      return { boardId: canvasState.activeBoardId, nodeId: node.dataset.id };
    }, RAW_MARKDOWN);
    const { boardId, nodeId } = created;
    const node = page.locator(`#canvasPlane .canvas-node-text[data-id="${nodeId}"]`).first();
    await node.waitFor({ state: "visible", timeout: 10_000 });

    const initialTextIdentity = await node.evaluate((element) => ({
      textName: element.dataset.textName,
      title: element.querySelector(":scope > .canvas-node-bar .canvas-node-title")?.textContent,
      handleWidth: Math.round(element.querySelector(":scope > .canvas-resize-handle")?.getBoundingClientRect().width || 0),
      handleHeight: Math.round(element.querySelector(":scope > .canvas-resize-handle")?.getBoundingClientRect().height || 0),
    }));
    assert.equal(initialTextIdentity.textName, "文字", "a new text node keeps the default 文字 name");
    assert.equal(initialTextIdentity.title, "文字", "the text node title starts as 文字");
    assert.ok(initialTextIdentity.handleWidth >= 40, "the text resize hit area is wider than the generic handle");
    assert.ok(initialTextIdentity.handleHeight >= 40, "the text resize hit area is taller than the generic handle");
    const titleHitArea = await node.evaluate((element) => {
      const title = element.querySelector(":scope > .canvas-node-bar .canvas-node-title");
      const heading = element.querySelector(":scope > .canvas-node-bar .canvas-node-heading");
      return {
        titleWidth: title?.getBoundingClientRect().width || 0,
        headingWidth: heading?.getBoundingClientRect().width || 0,
      };
    });
    assert.ok(
      titleHitArea.titleWidth < titleHitArea.headingWidth * 0.8,
      "the editable title hit area is limited to the visible name instead of the whole title column",
    );
    const titleBlankPoint = await node.evaluate((element) => {
      const title = element.querySelector(":scope > .canvas-node-bar .canvas-node-title");
      const heading = element.querySelector(":scope > .canvas-node-bar .canvas-node-heading");
      const titleRect = title.getBoundingClientRect();
      const headingRect = heading.getBoundingClientRect();
      return {
        x: titleRect.right + Math.max(8, (headingRect.right - titleRect.right) / 2),
        y: titleRect.top + titleRect.height / 2,
      };
    });
    await page.mouse.click(titleBlankPoint.x, titleBlankPoint.y);
    assert.equal(
      await node.locator(":scope > .canvas-node-bar > .canvas-node-title-input").evaluate((input) => input.hidden),
      true,
      "clicking blank title-band space does not open the name editor",
    );
    await node.hover();
    const hoveredHandleOpacity = await node.locator(":scope > .canvas-resize-handle").evaluate(
      (handle) => Number.parseFloat(getComputedStyle(handle).opacity),
    );
    assert.ok(hoveredHandleOpacity >= 0.5, "the text resize handle becomes visible on hover");

    await node.locator(":scope > .canvas-node-bar span.canvas-node-title").click();
    const titleInput = node.locator(":scope > .canvas-node-bar > .canvas-node-title-input");
    await titleInput.fill("剧本草案");
    await page.mouse.click(1200, 800);
    await page.waitForFunction((id) => {
      const element = document.querySelector(`#canvasPlane .canvas-node-text[data-id="${id}"]`);
      return element?.dataset.textName === "剧本草案"
        && element.querySelector(":scope > .canvas-node-bar .canvas-node-title")?.textContent === "剧本草案"
        && element.querySelector(":scope > .canvas-node-bar > .canvas-node-title-input")?.hidden === true;
    }, nodeId);

    await page.evaluate(() => {
      canvasState.scale = 0.5;
      applyCanvasTransformNow();
    });
    const resizeHandle = node.locator(":scope > .canvas-resize-handle");
    const resizeBox = await resizeHandle.boundingBox();
    assert.ok(resizeBox, "the text node resize handle is available for pointer input");
    await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(resizeBox.x + resizeBox.width / 2 + 380, resizeBox.y + resizeBox.height / 2 + 380, { steps: 12 });
    await page.mouse.up();
    await page.waitForFunction((id) => {
      const element = document.querySelector(`#canvasPlane .canvas-node-text[data-id="${id}"]`);
      return Number(element?.dataset.width || 0) > 820 && Number(element?.dataset.height || 0) > 760;
    }, nodeId);
    const expandedSize = await node.evaluate((element) => ({
      width: Number(element.dataset.width || 0),
      height: Number(element.dataset.height || 0),
    }));
    assert.ok(expandedSize.width > 820, "text node width can extend past the former 820px limit");
    assert.ok(expandedSize.height > 760, "text node height can extend past the former 760px limit");
    await page.evaluate(() => {
      canvasState.scale = 1;
      applyCanvasTransformNow();
    });

    const flatNode = await page.evaluate((id) => {
      const element = document.querySelector(`#canvasPlane .canvas-node[data-id="${id}"]`);
      element.classList.remove("is-selected");
      const footer = element.querySelector(":scope > .canvas-node-footer");
      return {
        nodeShadow: getComputedStyle(element).boxShadow,
        barShadow: getComputedStyle(element.querySelector(":scope > .canvas-node-bar")).boxShadow,
        footerHidden: footer?.hidden,
        footerHeight: Math.round(footer?.getBoundingClientRect().height || 0),
      };
    }, nodeId);
    assert.equal(flatNode.nodeShadow, "none", "an idle node uses a flat card surface without a drop shadow");
    assert.equal(flatNode.barShadow, "none", "the node title band has no shadow");
    assert.equal(flatNode.footerHidden, true, "the default 待完成 status is treated as empty");
    assert.equal(flatNode.footerHeight, 0, "an empty status band must not reserve the node floor");

    await page.evaluate((id) => {
      const element = document.querySelector(`#canvasPlane .canvas-node[data-id="${id}"]`);
      setCanvasNodeStatus(element, "生成中...");
    }, nodeId);
    const visibleStatus = await page.evaluate((id) => {
      const footer = document.querySelector(`#canvasPlane .canvas-node[data-id="${id}"] > .canvas-node-footer`);
      return { hidden: footer.hidden, height: Math.round(footer.getBoundingClientRect().height) };
    }, nodeId);
    assert.equal(visibleStatus.hidden, false, "a running status expands the node floor");
    assert.equal(visibleStatus.height, 24, "the visible status band stays compact at 24px");
    await page.evaluate((id) => {
      const element = document.querySelector(`#canvasPlane .canvas-node[data-id="${id}"]`);
      setCanvasNodeStatus(element, "待完成");
    }, nodeId);
    assert.equal(
      await page.locator(`#canvasPlane .canvas-node[data-id="${nodeId}"] > .canvas-node-footer`).evaluate((footer) => footer.hidden),
      true,
      "returning to an idle status collapses the floor again",
    );

    const rendered = await page.evaluate(() => {
      const text = document.querySelector("#canvasPlane .canvas-node-text .canvas-text");
      return {
        editable: text?.contentEditable,
        source: text?.dataset.markdownSource,
        heading: text?.querySelector(".canvas-agent-markdown h3")?.textContent,
        bold: text?.querySelector(".canvas-agent-markdown strong")?.textContent,
        code: text?.querySelector(".canvas-agent-markdown code")?.textContent,
        listCount: text?.querySelectorAll(".canvas-agent-markdown li").length,
        hasImageElement: Boolean(text?.querySelector("img")),
        xssRan: Boolean(window.__canvasTextXss),
      };
    });
    assert.equal(rendered.editable, "false");
    assert.equal(rendered.source, RAW_MARKDOWN);
    assert.equal(rendered.heading, "Heading");
    assert.equal(rendered.bold, "Bold");
    assert.equal(rendered.code, "code");
    assert.equal(rendered.listCount, 2);
    assert.equal(rendered.hasImageElement, false, "raw HTML must stay escaped");
    assert.equal(rendered.xssRan, false, "raw HTML must not execute");

    const textEditor = node.locator(".canvas-text");
    await textEditor.click();
    await page.waitForFunction(() => {
      const text = document.querySelector("#canvasPlane .canvas-node-text .canvas-text");
      return text?.contentEditable === "true" && text?.dataset.editing === "true";
    });
    assert.equal(await textEditor.textContent(), RAW_MARKDOWN, "editing must expose the original Markdown source");

    await textEditor.evaluate((element, value) => {
      element.textContent = value;
      element.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: value,
      }));
      element.blur();
    }, UPDATED_MARKDOWN);
    await page.waitForFunction((value) => {
      const text = document.querySelector("#canvasPlane .canvas-node-text .canvas-text");
      return text?.dataset.editing === "false" && text?.dataset.markdownSource === value;
    }, UPDATED_MARKDOWN);

    const updated = await page.evaluate(() => {
      const text = document.querySelector("#canvasPlane .canvas-node-text .canvas-text");
      return {
        heading: text?.querySelector(".canvas-agent-markdown h2")?.textContent,
        orderedItems: text?.querySelectorAll(".canvas-agent-markdown ol li").length,
        strike: text?.querySelector(".canvas-agent-markdown s")?.textContent,
        links: text?.querySelectorAll(".canvas-agent-markdown a").length,
      };
    });
    assert.equal(updated.heading, "Updated");
    assert.equal(updated.orderedItems, 2);
    assert.equal(updated.strike, "removed");
    assert.equal(updated.links, 0, "unsafe URL must not become a link");
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "rendered-markdown.png") });

    await page.evaluate(async () => {
      scheduleCanvasSave();
      await flushCanvasOperations();
    });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.locator("#aiOsDesktop:not([hidden])").waitFor({ state: "visible", timeout: 30_000 });
    await page.locator('[data-ai-app="canvas"]').click();
    await page.locator("#canvasLibraryScreen").waitFor({ state: "visible", timeout: 30_000 });
    await page.locator(`[data-board-id="${boardId}"]`).click({ timeout: 10_000 });
    await page.locator("#canvasBoardLoading").waitFor({ state: "hidden", timeout: 30_000 });
    await page.waitForFunction(() => Boolean(document.querySelector("#canvasPlane .canvas-node-text .canvas-text")));

    const reloaded = await page.evaluate(() => {
      const text = document.querySelector("#canvasPlane .canvas-node-text .canvas-text");
      return {
        textName: text?.closest(".canvas-node-text")?.dataset.textName,
        title: text?.closest(".canvas-node-text")?.querySelector(":scope > .canvas-node-bar .canvas-node-title")?.textContent,
        width: Number(text?.closest(".canvas-node-text")?.dataset.width || 0),
        height: Number(text?.closest(".canvas-node-text")?.dataset.height || 0),
        source: text?.dataset.markdownSource,
        heading: text?.querySelector(".canvas-agent-markdown h2")?.textContent,
        orderedItems: text?.querySelectorAll(".canvas-agent-markdown ol li").length,
      };
    });
    assert.equal(reloaded.textName, "剧本草案", "the custom text node name survives a reload");
    assert.equal(reloaded.title, "剧本草案", "the restored title uses the persisted custom name");
    assert.ok(reloaded.width > 820, "the expanded text node width survives a reload");
    assert.ok(reloaded.height > 760, "the expanded text node height survives a reload");
    assert.equal(reloaded.source, UPDATED_MARKDOWN, "the board must persist raw Markdown, not rendered HTML");
    assert.equal(reloaded.heading, "Updated");
    assert.equal(reloaded.orderedItems, 2);
    assert.deepEqual(pageErrors, []);

    console.log("Canvas text Markdown browser checks passed.");
  } finally {
    await browser?.close().catch(() => {});
    await stopChild(server);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
