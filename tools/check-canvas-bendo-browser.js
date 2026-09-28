"use strict";

/**
 * Verifies the BENDO canvas contract on a real render:
 *   - the editor carries its own theme attribute, and "auto" follows the OS
 *   - the board library and the project manager stay on the AI OS palette
 *   - the three palettes repaint the canvas surface, nodes and dock
 *   - the classic palette restores the pre-migration canvas
 *   - the previously dangling --paper token now resolves
 *   - the shell HUD geometry (top controls, floor status) is stable
 *   - the HUD offers the theme menu and it switches palettes
 *   - nodes keep the shared skeleton: 56px title band, 8px content line,
 *     32px controls, four-column parameter grid, 16px outer radius
 *   - loaded media owns no backing plate, so a transparent PNG cannot render
 *     against a black well, while an empty upload well keeps a themed surface
 */

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
    child.once("exit", () => { clearTimeout(timer); resolve(); });
    child.kill("SIGTERM");
  });
}

const BOARD_TITLE = "BENDO 画布规范验证";
const ARTIFACT_DIR = path.join(__dirname, "..", "artifacts", "canvas-bendo");

const PALETTES = {
  midnight: { canvas: "rgb(12, 12, 11)", surface: "rgb(23, 24, 23)", text: "rgb(240, 242, 235)" },
  paper: { canvas: "rgb(241, 239, 245)", surface: "rgb(255, 255, 255)", text: "rgb(36, 33, 43)" },
  warm: { canvas: "rgb(236, 233, 229)", surface: "rgb(247, 244, 240)", text: "rgb(57, 51, 47)" },
};

(async () => {
  const root = path.resolve(__dirname, "..");
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-bendo-"));
  let serverOutput = "";
  const server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: root,
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
        if (response.ok && (await response.json()).ok) { ready = true; break; }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, `isolated server did not become ready: ${serverOutput}`);

    // A CLI-backed video provider is what makes the API video node meaningful:
    // its models come from the CLI, not from an HTTP catalog.
    const seeded = await fetch(`${baseUrl}/api/providers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "provider-jimeng-video",
        name: "即梦（本地 CLI）",
        protocol: "cli:jimeng",
        baseUrl: "",
        enabled: true,
        models: [
          { id: "seedance2.5", capabilities: ["video.generate"] },
          { id: "seedance2.0", capabilities: ["video.generate"] },
        ],
      }),
    });
    assert.equal(seeded.status, 201, `seed provider failed: ${await seeded.text()}`);
    const seededCatalog = await (await fetch(`${baseUrl}/api/video-models`)).json();
    const seedance25 = seededCatalog.models.find((model) => model.id === "seedance2.5");
    assert.ok(seedance25, "the CLI provider contributes its seedance video models");
    assert.deepEqual(seedance25.resolutions, ["480p", "720p", "1080p"]);
    assert.deepEqual(seedance25.duration, { min: 4, max: 30 });
    assert.equal(seedance25.platform, "jimeng");
    // The listed model id stays exactly as the provider reported it.
    assert.equal(seedance25.modelId, "seedance2.5");
    assert.equal(seedance25.displayName, "seedance2.5 · 即梦（本地 CLI）");

    const executablePath = [
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    ].find((candidate) => candidate && fs.existsSync(candidate));
    browser = await playwright.chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const browserErrors = [];
    page.on("pageerror", (error) => browserErrors.push(error.message));
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.locator('[data-ai-app="canvas"]').click();
    await page.locator("#canvasBoardNew").click();
    await page.locator("#canvasNameInput").fill(BOARD_TITLE);
    await page.locator("#canvasNameForm button[type=submit]").click();
    await page.locator("#canvasEditorScreen").waitFor();
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

    // --- The editor owns its palette, and the dock follows the same theme ---
    await page.waitForFunction(() => Boolean(window.CanvasTheme), null, { timeout: 5_000 });
    const themed = await page.evaluate(() => ({
      canvasTheme: document.getElementById("canvasEditorScreen")?.getAttribute("data-canvas-theme") || "",
      canvasMode: document.getElementById("canvasEditorScreen")?.getAttribute("data-canvas-theme-mode") || "",
      railTheme: document.querySelector(".rail")?.getAttribute("data-canvas-theme") || "",
      osTheme: document.documentElement.dataset.theme || "",
      libraryTheme: document.getElementById("canvasLibraryScreen")?.getAttribute("data-canvas-theme") || "",
      canvasViewTheme: document.getElementById("canvasView")?.getAttribute("data-canvas-theme") || "",
      canvasTokens: ["--color-canvas", "--color-surface", "--color-text", "--paper", "--z-overlay-menu"]
        .map((token) => ({ token, value: getComputedStyle(document.getElementById("canvasEditorScreen")).getPropertyValue(token).trim() })),
    }));
    assert.equal(themed.canvasMode, "auto", "a fresh install follows the OS appearance");
    assert.equal(
      themed.canvasTheme,
      themed.osTheme === "dark" ? "midnight" : "paper",
      "auto must resolve to the palette matching the OS light/dark mode",
    );
    assert.equal(themed.railTheme, themed.canvasTheme, "the canvas dock shares the canvas palette");
    assert.equal(themed.libraryTheme, "", "the board library must stay on the AI OS palette");
    assert.equal(themed.canvasViewTheme, "", "only the editor root is themed, not the whole canvas app");
    for (const entry of themed.canvasTokens) {
      assert.ok(entry.value.length > 0, `${entry.token} must resolve on the canvas root`);
    }

    // --- The HUD exposes the theme menu and it switches palettes ------------
    await page.locator("#canvasThemeToggle").waitFor({ state: "visible", timeout: 3_000 });
    await page.locator("#canvasThemeToggle").click();
    const themeMenu = page.locator(".canvas-theme-menu");
    await themeMenu.waitFor({ state: "visible", timeout: 3_000 });
    const themeOptions = await themeMenu.locator("[data-canvas-theme-option]").evaluateAll((options) =>
      options.map((option) => option.dataset.canvasThemeOption));
    assert.deepEqual(
      themeOptions,
      ["auto", "midnight", "paper", "warm", "legacy"],
      "the theme menu lists the system mode, the three palettes and the classic canvas",
    );
    await themeMenu.locator('[data-canvas-theme-option="legacy"]').click();
    await page.waitForTimeout(400);
    const legacy = await page.evaluate(() => {
      const root = document.getElementById("canvasEditorScreen");
      // Resolve what the AI OS palette would paint, so the classic canvas can
      // be compared against the OS surface instead of a hard-coded colour.
      const probe = document.createElement("div");
      probe.style.cssText = "position:absolute;visibility:hidden;background:var(--stage)";
      document.body.append(probe);
      const osStage = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return {
        mode: root.getAttribute("data-canvas-theme-mode"),
        theme: root.getAttribute("data-canvas-theme"),
        canvas: getComputedStyle(root).backgroundColor,
        osStage,
        stored: localStorage.getItem(window.CanvasTheme.STORAGE_KEY),
      };
    });
    assert.equal(legacy.mode, "legacy", "the classic canvas is selectable from the HUD");
    assert.equal(legacy.theme, "legacy");
    assert.equal(legacy.stored, "legacy");
    assert.notEqual(legacy.canvas, PALETTES.paper.canvas, "the classic canvas must not paint the BENDO palette");
    assert.equal(legacy.canvas, legacy.osStage, "the classic canvas falls back to the AI OS surface colour");
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "board-legacy.png") });

    // Back onto a BENDO palette: the classic canvas resolves --panel from the
    // OS theme, so node colours can only be compared against the palette that
    // is actually applied while the skeleton is measured.
    await page.evaluate(() => window.CanvasTheme.set("paper"));
    await page.waitForTimeout(450);

    // --- Create a node and measure the shared skeleton ----------------------
    const menu = page.locator("#canvasNodeMenu");
    const blankPoint = () => page.evaluate(() => {
      const viewport = document.querySelector("#infiniteCanvas").getBoundingClientRect();
      const nodes = [...document.querySelectorAll("#canvasPlane .canvas-node")]
        .map((node) => node.getBoundingClientRect());
      for (let y = viewport.top + 150; y < viewport.bottom - 120; y += 45) {
        for (let x = viewport.left + 130; x < viewport.right - 90; x += 45) {
          const occupied = nodes.some((rect) =>
            x >= rect.left - 14 && x <= rect.right + 14 && y >= rect.top - 14 && y <= rect.bottom + 14);
          if (!occupied) return { x, y };
        }
      }
      return { x: viewport.left + 260, y: viewport.top + 260 };
    });
    const point = await blankPoint();
    await page.mouse.dblclick(point.x, point.y);
    await menu.waitFor({ state: "visible", timeout: 3_000 });
    await menu.locator('[data-canvas-node="text"]').click();
    const node = page.locator("#canvasPlane .canvas-node").first();
    await node.waitFor({ state: "visible", timeout: 3_000 });
    // Park the pointer away from the node so the hover surface cannot be
    // mistaken for the resting title band.
    await page.mouse.move(8, 8);
    await page.waitForTimeout(250);

    const skeleton = await page.evaluate(() => {
      const target = [...document.querySelectorAll("#canvasPlane .canvas-node")]
        .find((candidate) => candidate.querySelector(":scope > .canvas-node-bar"));
      const style = getComputedStyle(target);
      const bar = target.querySelector(":scope > .canvas-node-bar");
      const body = target.querySelector(":scope > .canvas-text");
      const nodeRect = target.getBoundingClientRect();
      const border = Number.parseFloat(style.borderLeftWidth) || 0;
      const badge = bar.querySelector(":scope > .canvas-node-icon");
      // The engine normalises transparent to different notations across
      // versions, so compare against a probe instead of a literal.
      const probe = document.createElement("div");
      probe.style.cssText = "position:absolute;visibility:hidden;background:transparent";
      document.body.append(probe);
      const transparent = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return {
        radius: style.borderTopLeftRadius,
        background: style.backgroundColor,
        color: style.color,
        borderColor: style.borderTopColor,
        barHeight: Math.round(bar.getBoundingClientRect().height),
        barPadding: getComputedStyle(bar).padding,
        barBorderWidth: getComputedStyle(bar).borderBottomWidth,
        barTransparent: getComputedStyle(bar).backgroundColor === transparent,
        badgeInset: Math.round(badge.getBoundingClientRect().left - nodeRect.left - border),
        titleInset: Math.round(bar.querySelector(".canvas-node-title").getBoundingClientRect().left - nodeRect.left - border),
        contentInset: Math.round(body.getBoundingClientRect().left - nodeRect.left - border),
      };
    });
    const paper = PALETTES.paper;
    assert.equal(skeleton.barHeight, 56, "every node opens with the 56px title band (16 + 32 + 8)");
    assert.equal(skeleton.barPadding, "16px 16px 8px", "the title band reads its inset from the shell tokens");
    assert.equal(skeleton.barBorderWidth, "0px", "the legacy divider line is gone");
    assert.ok(skeleton.barTransparent, "the title band is not a nested card");
    // The reference board opens the title band with a 32px identity badge, so
    // the 16px inset belongs to the badge and the title follows it after the
    // registered 8px badge gap.
    assert.equal(skeleton.badgeInset, 16, "the identity badge opens on the 16px title inset");
    assert.equal(skeleton.titleInset, 16 + 32 + 8, "the title follows the 32px badge and its 8px gap");
    assert.equal(skeleton.contentInset, 8, "node content sits on the 8px shell line");
    assert.equal(skeleton.radius, "16px", "nodes use the 16px outer radius");
    assert.equal(skeleton.background, paper.surface, "node surface comes from the canvas palette");

    // --- A parameter node uses the shared four-column grid ------------------
    const parameterPoint = await blankPoint();
    await page.mouse.dblclick(parameterPoint.x, parameterPoint.y);
    await menu.waitFor({ state: "visible", timeout: 3_000 });
    await menu.locator('[data-canvas-node="image-generator"]').click();
    await page.waitForTimeout(250);
    const parameters = await page.evaluate(() => {
      const node = [...document.querySelectorAll("#canvasPlane .canvas-node")]
        .find((candidate) => candidate.querySelector(":scope > .canvas-node-controls"));
      const nodeRect = node.getBoundingClientRect();
      const controls = node.querySelector(":scope > .canvas-node-controls");
      const controlsStyle = getComputedStyle(controls);
      const columns = controlsStyle.gridTemplateColumns.split(" ").map((value) => Math.round(Number.parseFloat(value)));
      const run = controls.querySelector(".canvas-node-run");
      const controlsRect = controls.getBoundingClientRect();
      const footer = node.querySelector(":scope > .canvas-node-footer");
      const footerVisible = Boolean(footer && !footer.hidden);
      const footerRect = footer?.getBoundingClientRect();
      const wasSelected = node.classList.contains("is-selected");
      node.classList.remove("is-selected");
      const nodeShadow = getComputedStyle(node).boxShadow;
      const barShadow = getComputedStyle(node.querySelector(":scope > .canvas-node-bar")).boxShadow;
      if (wasSelected) node.classList.add("is-selected");
      // The hidden source select and the collapsed custom-size/midjourney
      // groups have no box, so the contract only covers the controls the user
      // can actually see.
      const visibleFields = [...controls.children]
        .filter((child) => child.getBoundingClientRect().height > 4)
        .map((child) => ({
          cls: child.className,
          height: Math.round(child.getBoundingClientRect().height),
          bottom: child.getBoundingClientRect().bottom,
        }));
      return {
        columnCount: columns.length,
        columnSpread: Math.max(...columns) - Math.min(...columns),
        gap: controlsStyle.gap,
        visibleFields,
        runHeight: Math.round(run.getBoundingClientRect().height),
        runRadius: getComputedStyle(run).borderRadius,
        controlsInset: Math.round(controlsRect.left - nodeRect.left - 1),
        // The 16px gap before the status band lives in the grid's own bottom
        // padding. With an empty status band removed, that padding is also the
        // final gap to the node floor.
        floorGap: Math.round(
          (footerVisible ? footerRect.top : nodeRect.bottom) - Math.max(...visibleFields.map((field) => field.bottom)),
        ),
        footerHidden: footer?.hidden === true,
        statusBandHeight: footerVisible ? Math.round(footerRect.height) : 0,
        nodeShadow,
        barShadow,
        promptWidth: Math.round(node.querySelector(":scope > .canvas-node-prompt").getBoundingClientRect().width),
        controlsWidth: Math.round(controlsRect.width),
        nodeWidth: Math.round(nodeRect.width),
        nodeHeight: Math.round(nodeRect.height),
      };
    });
    assert.equal(parameters.columnCount, 4, "the parameter area is a four-column grid");
    assert.ok(parameters.columnSpread <= 1, "the four parameter columns are equal width");
    assert.equal(parameters.gap, "8px", "parameter columns are 8px apart");
    assert.ok(parameters.visibleFields.length >= 3, "the model picker, size and run controls are on screen");
    for (const field of parameters.visibleFields) {
      assert.equal(field.height, 32, `${field.cls || "parameter control"} is 32px tall`);
    }
    assert.equal(parameters.runHeight, 32, "the primary action is the same 32px tall");
    assert.equal(parameters.runRadius, "8px", "the primary action uses the control radius");
    assert.equal(parameters.controlsInset, 8, "the parameter container sits on the 8px shell line");
    assert.ok(Math.abs(parameters.floorGap - 16) <= 1, "the idle parameter node keeps its normal 16px bottom padding");
    assert.equal(parameters.footerHidden, true, "the idle parameter node hides the empty status band");
    assert.equal(parameters.statusBandHeight, 0, "the hidden status band reserves no node floor");
    assert.equal(parameters.nodeShadow, "none", "an unselected node is a flat card without a drop shadow");
    assert.equal(parameters.barShadow, "none", "the node title band has no shadow");
    assert.equal(parameters.promptWidth, parameters.controlsWidth, "the prompt field spans the parameter container");
    assert.ok(
      parameters.promptWidth > 0 && parameters.promptWidth < parameters.nodeWidth,
      "the prompt field stays inside the node",
    );

    // --- Every node kind shares the same skeleton ---------------------------
    for (const entry of [
      { opener: "image-generator", current: "canvas-node-generator", engine: "comfyui", result: "canvas-node-comfy" },
      { opener: "llm", current: "canvas-node-llm", engine: "", result: "canvas-node-llm" },
      { opener: "video-generator", current: "canvas-node-video-api", engine: "comfyui", result: "canvas-node-minimax-h3" },
    ]) {
      const spot = await blankPoint();
      await page.mouse.dblclick(spot.x, spot.y);
      await menu.waitFor({ state: "visible", timeout: 3_000 });
      await menu.locator(`[data-canvas-node="${entry.opener}"]`).click();
      const created = page.locator(`#canvasPlane .${entry.current}`).last();
      await created.waitFor({ state: "visible", timeout: 3_000 });
      if (entry.engine) {
        await created.locator(`.canvas-engine-switch [data-engine="${entry.engine}"]`).click();
        await page.waitForFunction(
          (className) => document.querySelector(`#canvasPlane .${className}`),
          entry.result,
          { timeout: 3_000 },
        );
      }
      await page.waitForTimeout(250);
    }
    await page.mouse.move(8, 8);
    await page.waitForTimeout(250);
    const skeletons = await page.evaluate(() =>
      [...document.querySelectorAll("#canvasPlane .canvas-node")].map((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        const border = Number.parseFloat(style.borderLeftWidth) || 0;
        const bar = node.querySelector(":scope > .canvas-node-bar");
        const body = [...node.children].find((child) =>
          child !== bar && !child.classList.contains("canvas-port") && child.getBoundingClientRect().width > 0);
        return {
          kind: node.className.replace("canvas-node ", ""),
          width: Math.round(rect.width),
          barHeight: bar ? Math.round(bar.getBoundingClientRect().height) : null,
          radius: style.borderTopLeftRadius,
          background: style.backgroundColor,
          contentInset: body ? Math.round(body.getBoundingClientRect().left - rect.left - border) : null,
          // Ports and the resize grabber straddle the shell edge on purpose,
          // so they are not part of the content contract.
          overflow: Math.round(
            Math.max(...[...node.children]
              .filter((child) => !child.classList.contains("canvas-port")
                && !child.classList.contains("canvas-resize-handle"))
              .map((child) => child.getBoundingClientRect().right)) - rect.right,
          ),
          widestChild: [...node.children]
            .filter((child) => !child.classList.contains("canvas-port")
              && !child.classList.contains("canvas-resize-handle"))
            .map((child) => ({
              cls: child.className || child.tagName.toLowerCase(),
              spill: Math.round(child.getBoundingClientRect().right - rect.right),
            }))
            .sort((a, b) => b.spill - a.spill)[0],
        };
      }));
    assert.ok(skeletons.length >= 5, "the board holds every node kind under test");
    for (const entry of skeletons) {
      assert.equal(entry.barHeight, 56, `${entry.kind} shares the 56px title band`);
      assert.equal(entry.radius, "16px", `${entry.kind} shares the 16px outer radius`);
      assert.equal(entry.background, paper.surface, `${entry.kind} shares the canvas surface`);
      assert.equal(entry.contentInset, 8, `${entry.kind} puts its content on the 8px shell line`);
      assert.ok(entry.width <= 420, `${entry.kind} stays inside the widest node token`);
      assert.ok(
        entry.overflow <= 1,
        `${entry.kind} does not spill past its own shell (${entry.overflow}px from ${entry.widestChild.cls})`,
      );
    }
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "board-nodes.png") });

    // --- The shared skeleton, measured across every node kind ---------------
    // One seeded board renders all twelve kinds at once, so the contract is
    // measured against the geometry a real board shows: the same 56px title
    // band, 32px identity badge, 32px title group, an optional 24px status
    // band with an 8px state dot, the same 8px content line and one standard
    // node width.
    const SKELETON_ORDER = [
      "text", "generator", "upload", "video", "audio", "comfy",
      "llm", "minimax-h3", "video-api", "loop", "gallery", "video-output", "note",
    ];
    const cameraBeforeSkeleton = await page.evaluate(() => ({
      scale: canvasState.scale,
      x: canvasState.x,
      y: canvasState.y,
    }));
    // The thirteen slots start below everything already on the board, so the
    // click point of a slot can never land inside an earlier node (the
    // video-generation shell alone is 666px tall).
    const skeletonOriginY = await page.evaluate(() => Math.max(
      0,
      ...[...document.querySelectorAll("#canvasPlane .canvas-node")]
        .map((node) => Number(node.dataset.y || 0) + node.offsetHeight),
    ) + 160);
    const skeletonKinds = [];
    for (const [index, kind] of SKELETON_ORDER.entries()) {
      // One world slot per kind: 360px columns and 900px rows keep the next
      // node clear of every node already placed. The five retired menu entries
      // are still part of the rendering contract, so create them directly.
      const createdId = await page.evaluate(({ slot, originY, kind }) => {
        const world = { x: 40 + (slot % 4) * 360, y: originY + Math.floor(slot / 4) * 900 };
        const viewport = document.querySelector("#infiniteCanvas").getBoundingClientRect();
        canvasState.scale = 1;
        canvasState.x = viewport.left + 260 - world.x;
        canvasState.y = viewport.top + 220 - world.y;
        applyCanvasTransformNow();
        canvasVirtualizer.flushNow();
        const point = { x: world.x, y: world.y };
        const factories = {
          text: () => addCanvasText(point, { focus: false }),
          generator: () => addCanvasImageGeneratorNode(point),
          upload: () => addCanvasUploadPlaceholder(point),
          video: () => addCanvasVideoNode(point, { src: "", name: "视频素材" }),
          audio: () => addCanvasAudioNode(point, { src: "", name: "音频素材" }),
          comfy: () => addCanvasComfyNode(point),
          llm: () => addCanvasLlmNode(point),
          "minimax-h3": () => addCanvasMinimaxH3Node(point),
          "video-api": () => addCanvasApiVideoNode(point),
          loop: () => addCanvasLoopNode(point),
          gallery: () => addCanvasGallery(point),
          "video-output": () => addCanvasVideoOutputNode(point),
          note: () => addCanvasNote(point, { focus: false }),
        };
        return factories[kind]().dataset.id;
      }, { slot: index, originY: skeletonOriginY, kind });
      await page.waitForTimeout(220);
      const measured = await page.evaluate((nodeId) => {
        const px = (value) => Math.round(Number.parseFloat(value) || 0);
        const node = document.querySelector(`#canvasPlane .canvas-node[data-id="${nodeId}"]`);
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        const border = Number.parseFloat(getComputedStyle(node).borderLeftWidth) || 0;
        const bar = node.querySelector(":scope > .canvas-node-bar");
        const badge = node.querySelector(":scope > .canvas-node-bar > .canvas-node-icon");
        const heading = node.querySelector(":scope > .canvas-node-bar > .canvas-node-heading");
        const title = heading?.querySelector(".canvas-node-title");
        const subtitle = heading?.querySelector(".canvas-node-subtitle");
        const footer = node.querySelector(
          ":scope > .canvas-node-footer, :scope > .canvas-gallery-container-footer, :scope > .canvas-h3-footer",
        );
        const status = footer?.querySelector(".canvas-node-status, .canvas-h3-status");
        const footerVisible = Boolean(footer && !footer.hidden);
        const wasSelected = node.classList.contains("is-selected");
        node.classList.remove("is-selected");
        const nodeShadow = getComputedStyle(node).boxShadow;
        const barShadow = bar ? getComputedStyle(bar).boxShadow : null;
        if (wasSelected) node.classList.add("is-selected");
        // Every empty media preview owes the same primary zone.
        const emptyPreview = node.querySelector(
          ":scope > .canvas-media-shell:not(.has-media),"
          + " :scope > .canvas-video-output-stage,"
          + " :scope > .canvas-image-upload:not(.has-image)",
        );
        // Ports, the resize grabber and the video-history overlay sit on the
        // content line by exception; everything else is a content block.
        const contentBlocks = [...node.children].filter((child) =>
          child !== bar
          && child !== footer
          && !child.classList.contains("canvas-port")
          && !child.classList.contains("canvas-resize-handle")
          && !child.classList.contains("canvas-video-history-toggle")
          && !child.classList.contains("canvas-video-history-panel")
          && child.getBoundingClientRect().height > 4);
        return {
          kind: node.className.replace("canvas-node ", ""),
          width: px(rect.width),
          barHeight: bar ? px(bar.getBoundingClientRect().height) : null,
          badge: badge
            ? {
                width: px(badge.getBoundingClientRect().width),
                height: px(badge.getBoundingClientRect().height),
                tone: badge.dataset.tone || "",
                icon: Boolean(badge.querySelector("svg")),
              }
            : null,
          headingHeight: heading ? px(heading.getBoundingClientRect().height) : null,
          titleFont: title ? getComputedStyle(title).fontSize : "",
          titleWeight: title ? getComputedStyle(title).fontWeight : "",
          subtitleFont: subtitle ? getComputedStyle(subtitle).fontSize : "",
          subtitleGap: title && subtitle
            ? px(subtitle.getBoundingClientRect().top - title.getBoundingClientRect().bottom)
            : null,
          footerHidden: footer ? footer.hidden : true,
          footerHeight: footerVisible ? px(footer.getBoundingClientRect().height) : 0,
          statusInset: footerVisible && status ? px(status.getBoundingClientRect().left - rect.left - border) : null,
          statusFont: footerVisible && status ? getComputedStyle(status).fontSize : "",
          // The state dot is a ::before, so it can only be read from the
          // computed style of the status line itself.
          statusDot: footerVisible && status
            ? {
                width: getComputedStyle(status, "::before").width,
                height: getComputedStyle(status, "::before").height,
              }
            : null,
          nodeShadow,
          barShadow,
          emptyPreview: emptyPreview
            ? {
                cls: String(emptyPreview.className || emptyPreview.tagName).slice(0, 40),
                height: px(emptyPreview.getBoundingClientRect().height),
              }
            : null,
          firstBlockGap: contentBlocks.length && bar
            ? px(contentBlocks[0].getBoundingClientRect().top - bar.getBoundingClientRect().bottom)
            : null,
          insets: contentBlocks.map((child) => ({
            cls: String(child.className || child.tagName).slice(0, 44),
            left: px(child.getBoundingClientRect().left - rect.left - border),
            right: px(rect.right - child.getBoundingClientRect().right - border),
          })),
        };
      }, createdId);
      assert.ok(measured, `the ${kind} node is created from the add-node menu`);
      skeletonKinds.push(measured);
    }
    assert.equal(skeletonKinds.length, 13, "all thirteen node kinds render on the board");
    const noteSkeleton = skeletonKinds.find((entry) => entry.kind.includes("canvas-node-note"));
    assert.ok(noteSkeleton, "the sticky note renders on the skeleton board");
    assert.equal(noteSkeleton.barHeight, null, "the sticky note is the registered exception to the title band");
    assert.equal(noteSkeleton.width, 292, "the sticky note still starts on the shared node width");
    for (const entry of skeletonKinds.filter((candidate) => !candidate.kind.includes("canvas-node-note"))) {
      const expectedWidth = entry.kind.includes("minimax-h3") ? 420 : 292;
      assert.equal(entry.width, expectedWidth, `${entry.kind} uses the shared node width`);
      assert.equal(entry.barHeight, 56, `${entry.kind} opens with the 56px title band (16 + 32 + 8)`);
      assert.ok(entry.badge, `${entry.kind} carries the shared identity badge`);
      assert.equal(entry.badge.width, 32, `${entry.kind} badge is 32px wide`);
      assert.equal(entry.badge.height, 32, `${entry.kind} badge is 32px tall`);
      assert.equal(entry.badge.icon, true, `${entry.kind} badge renders its Lucide glyph`);
      assert.ok(
        ["accent", "neutral"].includes(entry.badge.tone),
        `${entry.kind} badge declares one of the two registered tones`,
      );
      assert.equal(entry.headingHeight, 32, `${entry.kind} keeps the title group inside the 32px title row`);
      assert.equal(entry.titleFont, "14px", `${entry.kind} title is 14px`);
      assert.equal(entry.titleWeight, "600", `${entry.kind} title is semibold`);
      assert.equal(entry.subtitleFont, "10px", `${entry.kind} purpose line is 10px`);
      assert.equal(entry.subtitleGap, 3, `${entry.kind} keeps the 3px gap under the title`);
      assert.equal(entry.footerHidden, true, `${entry.kind} hides the idle placeholder status`);
      assert.equal(entry.footerHeight, 0, `${entry.kind} reserves no floor while the status is empty`);
      assert.equal(entry.statusInset, null, `${entry.kind} does not lay out an empty status line`);
      assert.equal(entry.statusFont, "", `${entry.kind} does not lay out empty status text`);
      assert.equal(entry.statusDot, null, `${entry.kind} does not paint an empty status dot`);
      assert.equal(entry.nodeShadow, "none", `${entry.kind} is a flat card without a drop shadow`);
      assert.equal(entry.barShadow, "none", `${entry.kind} title band has no shadow`);
      assert.equal(entry.firstBlockGap, 0, `${entry.kind} does not double the gap under the title band`);
      for (const inset of entry.insets) {
        assert.equal(inset.left, 8, `${entry.kind} · ${inset.cls} sits on the 8px content line`);
        if (!String(inset.cls).includes("canvas-engine-switch")) {
          assert.equal(inset.right, 8, `${entry.kind} · ${inset.cls} shares the same right inset`);
        }
      }
    }
    const tones = new Set(skeletonKinds.map((entry) => entry.badge?.tone).filter(Boolean));
    assert.deepEqual([...tones].sort(), ["accent", "neutral"], "identity badges use both registered tones");

    // --- The API video node follows the provider ladder ---------------------
    await page.waitForFunction(
      () => {
        const select = document.querySelector("#canvasPlane .canvas-node-video-api .canvas-api-video-model");
        return Boolean(select) && !select.disabled;
      },
      null,
      { timeout: 10_000 },
    );
    const apiVideoOptions = await page.evaluate(() => {
      const select = document.querySelector("#canvasPlane .canvas-node-video-api .canvas-api-video-model");
      return {
        labels: [...select.options].map((option) => option.textContent),
        values: [...select.options].map((option) => option.value),
      };
    });
    assert.equal(apiVideoOptions.values.includes("seedance2.5"), true, "the picker offers the CLI model id");
    assert.equal(
      apiVideoOptions.labels.includes("seedance2.5 · 即梦（本地 CLI）"),
      true,
      "the picker labels the model with its platform",
    );
    // The catalog also holds the local ComfyUI video model, so the ladder is
    // asserted after choosing the CLI model explicitly.
    await page.evaluate(() => {
      const select = document.querySelector("#canvasPlane .canvas-node-video-api .canvas-api-video-model");
      select.value = "seedance2.5";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForTimeout(250);
    const apiVideoPicker = await page.evaluate(() => {
      const node = document.querySelector("#canvasPlane .canvas-node-video-api");
      const select = node.querySelector(".canvas-api-video-model");
      const resolution = node.querySelector(".canvas-api-video-resolution");
      const duration = node.querySelector(".canvas-api-video-duration-field input");
      return {
        platform: select.dataset.platform || "",
        resolutions: [...resolution.options].map((option) => option.value),
        durationMin: duration.min,
        durationMax: duration.max,
        hint: node.querySelector(".canvas-api-video-duration-hint").textContent,
        reference: node.querySelector(".canvas-api-video-reference").textContent,
        ratioHidden: node.querySelector(".canvas-api-video-ratio-field").hidden,
        runHeight: Math.round(node.querySelector(".canvas-api-video-run").getBoundingClientRect().height),
      };
    });
    assert.equal(apiVideoPicker.platform, "jimeng", "the picker records the model platform");
    assert.deepEqual(apiVideoPicker.resolutions, ["480p", "720p", "1080p"], "seedance2.5 offers its own resolutions");
    assert.equal(apiVideoPicker.durationMin, "4");
    assert.equal(apiVideoPicker.durationMax, "30");
    assert.equal(apiVideoPicker.hint, "4-30 秒");
    assert.equal(apiVideoPicker.ratioHidden, false, "a text-to-video request keeps the ratio control");
    assert.match(apiVideoPicker.reference, /连接图片节点/, "an unconnected node invites a first frame");
    assert.equal(apiVideoPicker.runHeight, 32, "the run control keeps the 32px canvas control height");

    // Switching models has to move the whole ladder with it.
    await page.evaluate(() => {
      const select = document.querySelector("#canvasPlane .canvas-node-video-api .canvas-api-video-model");
      select.value = "seedance2.0";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForTimeout(200);
    const apiVideoSwitched = await page.evaluate(() => {
      const node = document.querySelector("#canvasPlane .canvas-node-video-api");
      return {
        resolutions: [...node.querySelector(".canvas-api-video-resolution").options].map((option) => option.value),
        hint: node.querySelector(".canvas-api-video-duration-hint").textContent,
      };
    });
    assert.deepEqual(apiVideoSwitched.resolutions, ["720p"], "seedance2.0 only supports 720p");
    assert.equal(apiVideoSwitched.hint, "4-15 秒", "the earlier model stops at 15 seconds");
    await page.evaluate(() => {
      const select = document.querySelector("#canvasPlane .canvas-node-video-api .canvas-api-video-model");
      select.value = "seedance2.5";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.waitForTimeout(200);

    // --- Wiring: text in, one frame in, video output out --------------------
    const apiVideoWiring = await page.evaluate(() => {
      const node = document.querySelector("#canvasPlane .canvas-node-video-api");
      // Detached probes: the wiring helpers only read classes and datasets, so
      // these never join the plane and cannot disturb the board under test.
      const probe = (kind, id, text) => {
        const element = document.createElement("article");
        element.className = `canvas-node canvas-node-${kind}`;
        element.dataset.id = id;
        if (text !== undefined) {
          const body = document.createElement("div");
          body.className = "canvas-text";
          body.textContent = text;
          element.append(body);
        }
        canvasVirtualStore.setMounted(id, element);
        return element;
      };
      const text = probe("text", "probe-video-text", "一段视频描述");
      const first = probe("image", "probe-video-frame-1");
      first.dataset.imageSrc = "/output/frame-1.png";
      const second = probe("image", "probe-video-frame-2");
      second.dataset.imageSrc = "/output/frame-2.png";
      const output = probe("video-output", "probe-video-out");
      const llm = probe("llm", "probe-video-llm");
      const results = {
        textToVideo: getCanvasConnectionCompatibility(text, node, getCanvasNodeOutput(text)),
        frameToVideo: getCanvasConnectionCompatibility(first, node, getCanvasNodeOutput(first)),
        videoToOutput: getCanvasConnectionCompatibility(node, output, getCanvasNodeOutput(node)),
        videoToLlm: getCanvasConnectionCompatibility(node, llm, getCanvasNodeOutput(node)),
        outputType: getCanvasNodeOutput(node)?.type || "",
      };
      // With the first frame already wired in, a second one has to be refused
      // instead of silently displacing the reference.
      const previous = canvasState.connections;
      canvasState.connections = [...previous, { id: "probe-video-conn", from: first.dataset.id, to: node.dataset.id }];
      results.secondFrame = getCanvasApiVideoConnectionCapacity(second, node, getCanvasNodeOutput(second));
      canvasState.connections = previous;
      [text, first, second, output, llm].forEach((created) => canvasVirtualStore.setMounted(created.dataset.id, null));
      return results;
    });
    assert.equal(apiVideoWiring.textToVideo.ok, true, "a prompt node feeds the video description");
    assert.match(apiVideoWiring.textToVideo.message, /视频描述/);
    assert.equal(apiVideoWiring.frameToVideo.ok, true, "an image node supplies the first frame");
    assert.match(apiVideoWiring.frameToVideo.message, /首帧参考/);
    assert.equal(apiVideoWiring.videoToOutput.ok, true, "the node feeds a video output node");
    assert.equal(apiVideoWiring.videoToLlm.ok, false, "the node cannot feed an unrelated node");
    assert.match(apiVideoWiring.videoToLlm.message, /视频生成端只能连接到素材合集或旧视频输出节点/);
    assert.equal(apiVideoWiring.outputType, "video-generator");
    assert.equal(apiVideoWiring.secondFrame.ok, false, "a second frame is refused");
    assert.match(apiVideoWiring.secondFrame.message, /首帧参考最多 1 张/);

    // An empty media preview is the same 192px primary zone whatever the kind:
    // the picture well, both media shells and the video stage.
    const emptyPreviews = skeletonKinds.map((entry) => entry.emptyPreview).filter(Boolean);
    assert.equal(emptyPreviews.length, 4, "the four empty previews are all measured");
    for (const preview of emptyPreviews) {
      assert.equal(preview.height, 192, `the empty ${preview.cls} preview uses the 192px primary zone`);
    }
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "skeleton-board.png") });
    // Back to the camera the later sections measure, so the order stays stable.
    await page.evaluate((camera) => {
      canvasState.scale = camera.scale;
      canvasState.x = camera.x;
      canvasState.y = camera.y;
      applyCanvasTransformNow();
      canvasVirtualizer.flushNow();
    }, cameraBeforeSkeleton);
    await page.waitForFunction(
      () => document.querySelector("#canvasPlane .canvas-node-minimax-h3 .canvas-h3-controls"),
      null,
      { timeout: 10_000 },
    );
    await page.mouse.move(8, 8);
    await page.waitForTimeout(300);

    // --- The video node's parameter fields share one line -------------------
    const h3Fields = await page.evaluate(() => {
      const controls = document.querySelector("#canvasPlane .canvas-node-minimax-h3 .canvas-h3-controls");
      if (!controls) return null;
      return [...controls.children].map((field) => {
        const fieldRect = field.getBoundingClientRect();
        const control = field.querySelector("select, input");
        const controlRect = control.getBoundingClientRect();
        return {
          gap: Math.round(controlRect.top - fieldRect.top),
          height: Math.round(controlRect.height),
        };
      });
    });
    assert.ok(h3Fields && h3Fields.length >= 4, "the video node renders its parameter fields");
    for (const field of h3Fields) {
      assert.equal(field.gap, h3Fields[0].gap, "every video-node control sits at the same offset from its label");
      assert.equal(field.height, 32, "every video-node control is 32px tall");
    }

    // BENDO: a text container that hides its overflow may not hide a line.
    const clipped = await page.evaluate(() =>
      [...document.querySelectorAll(
        "#canvasPlane .canvas-node select, #canvasPlane .canvas-node input, #canvasPlane .canvas-node .canvas-node-run",
      )]
        // The picker keeps a 1px source select for its data; it renders
        // nothing, so it is not a text container.
        .filter((element) => element.clientWidth > 4 && element.clientHeight > 4)
        .filter((element) => getComputedStyle(element).overflow !== "visible")
        .filter((element) => element.scrollHeight > element.clientHeight + 1)
        .map((element) => ({
          cls: element.className,
          scroll: element.scrollHeight,
          client: element.clientHeight,
          text: (element.textContent || "").trim().slice(0, 12),
        })));
    assert.deepEqual(clipped, [], "no node control hides a wrapped line");

    // --- One colour per role: actions are lime, accents stay purple --------
    const roles = await page.evaluate(() => {
      const root = document.getElementById("canvasEditorScreen");
      const resolve = (token) => {
        const probe = document.createElement("div");
        probe.style.cssText = `position:absolute;visibility:hidden;background:var(${token})`;
        // The palette lives on the editor root, so the probe has to resolve
        // inside that scope rather than on the document.
        root.append(probe);
        const value = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return value;
      };
      const action = resolve("--color-action");
      const accent = resolve("--color-accent");
      const submits = [
        ".canvas-node-run",
        ".canvas-comfy-run",
        ".canvas-llm-run",
        ".canvas-h3-run",
        ".canvas-llm-preset-add",
        ".canvas-llm-preset-save",
        ".canvas-actions .text-action.primary-dark",
      ];
      return {
        action,
        accent,
        buttons: submits
          .map((selector) => ({ selector, element: root.querySelector(selector) }))
          .filter((entry) => entry.element)
          .map((entry) => ({ selector: entry.selector, background: getComputedStyle(entry.element).backgroundColor })),
        ports: [...root.querySelectorAll(".canvas-port")]
          .map((port) => getComputedStyle(port).backgroundColor),
      };
    });
    assert.notEqual(roles.action, roles.accent, "the action and accent roles are different colours");
    assert.ok(roles.buttons.length >= 4, "the board renders the whole submit family");
    for (const button of roles.buttons) {
      assert.equal(button.background, roles.action, `${button.selector} submits in the action colour`);
    }
    assert.ok(roles.ports.length > 0, "the board has connection ports");
    for (const port of roles.ports) {
      assert.equal(port, roles.accent, "connection ports stay on the accent colour");
    }

    // --- Transparent media may never be given a backing plate ---------------
    // A loaded well owns no fill: BENDO forbids painting behind contained media
    // ("图片使用 contain，禁止裁切、拉伸、补背景"), and this layer used to put the
    // dark "image well" under loaded pixels, which turned every transparent PNG
    // into a black block. An empty well still owes the user a themed plate the
    // hint text stays legible on.
    const mediaBoard = await page.evaluate(async () => {
      // A real transparent PNG: an opaque disc on a fully cleared 320px mat.
      const bitmap = document.createElement("canvas");
      bitmap.width = 320;
      bitmap.height = 320;
      const context = bitmap.getContext("2d");
      context.clearRect(0, 0, 320, 320);
      context.fillStyle = "#c8452f";
      context.beginPath();
      context.arc(160, 160, 96, 0, Math.PI * 2);
      context.fill();
      const blob = await new Promise((resolve) => bitmap.toBlob(resolve));
      const uploaded = await (await fetch("/api/upload-image", {
        method: "POST",
        headers: { "content-type": "image/png", "x-file-name": "transparent-media.png" },
        body: blob,
      })).json();
      if (!uploaded.url) throw new Error(JSON.stringify(uploaded));
      const post = async (url, body) => {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(JSON.stringify(result));
        return result;
      };
      await saveCanvasBoardNow();
      const previous = { id: canvasState.activeBoardId, title: canvasState.activeBoardTitle };
      const id = "bendo-transparent-media";
      await post("/api/canvas/boards", { id, title: "BENDO 透明媒体验证", viewport: { x: 40, y: 40, scale: 0.8 } });
      const seeded = [
        // A dropped picture becomes a frameless image node.
        { id: "transparent-picture", kind: "image", x: 40, y: 40, width: 320, height: 320,
          imageSrc: uploaded.url, imageName: "透明图片.png" },
        // The same pixels as a gallery member.
        { id: "transparent-gallery", kind: "gallery-container", x: 420, y: 40, width: 320, height: 380,
          galleryContainer: { title: "透明图集", members: [
            { id: "transparent-member", src: uploaded.url, name: "透明成员", width: 320, height: 320 },
          ] } },
        // An untouched 导入图片 node: this one still owes an empty well.
        { id: "empty-well", kind: "upload", uploadOnly: true, x: 800, y: 40, width: 292, height: 380,
          imageSrc: "", imageName: "图片节点" },
      ];
      await post(`/api/canvas/boards/${id}/operations`, {
        baseRevision: 0,
        operations: seeded.map((node) => ({
          operationId: `node-${node.id}`,
          entityId: node.id,
          type: "node.upsert",
          after: node,
        })),
      });
      await openCanvasBoardFromHistory({ id, title: "BENDO 透明媒体验证" });
      return { previous, source: uploaded.url };
    });
    await page.waitForFunction(
      () => document.querySelectorAll("#canvasPlane .canvas-node").length >= 3,
      null,
      { timeout: 10_000 },
    );
    await page.waitForFunction(
      () => document.querySelector("#canvasPlane .canvas-node-frameless .canvas-image-upload.has-image img")?.naturalWidth > 0,
      null,
      { timeout: 10_000 },
    );
    await page.mouse.move(8, 8);
    await page.waitForTimeout(400);

    const media = await page.evaluate(() => {
      const root = document.getElementById("canvasEditorScreen");
      const resolve = (token) => {
        const probe = document.createElement("div");
        probe.style.cssText = `position:absolute;visibility:hidden;background:var(${token})`;
        root.append(probe);
        const value = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return value;
      };
      const read = (label, selector) => {
        const element = document.querySelector(selector);
        return {
          label,
          found: Boolean(element),
          background: element ? getComputedStyle(element).backgroundColor : "",
        };
      };
      const well = resolve("--color-image-well");
      return {
        transparent: resolve("transparent"),
        well,
        soft: resolve("--color-surface-soft"),
        nodeSurface: getComputedStyle(document.querySelector("#canvasPlane .canvas-node:not(.canvas-node-frameless)")).backgroundColor,
        loaded: [
          read("a loaded picture well", "#canvasPlane .canvas-node-frameless .canvas-image-upload.has-image"),
          read("a gallery member preview", "#canvasPlane .canvas-gallery-member-preview"),
        ],
        empty: read("the empty upload well", "#canvasPlane .canvas-image-upload:not(.has-image)"),
        // Anything inside a node that still paints the media mat would put a
        // plate behind pixels again.
        darkPlates: [...document.querySelectorAll("#canvasPlane .canvas-node *")]
          .filter((element) => getComputedStyle(element).backgroundColor === well)
          .map((element) => (typeof element.className === "string" ? element.className : element.tagName.toLowerCase())),
      };
    });
    assert.equal(media.transparent, "rgba(0, 0, 0, 0)");
    for (const entry of media.loaded) {
      assert.ok(entry.found, `${entry.label} must be rendered on the transparent board`);
      assert.equal(entry.background, media.transparent, `${entry.label} must not be given a backing plate`);
    }
    assert.ok(media.empty.found, "the empty upload well must be rendered on the transparent board");
    assert.notEqual(media.empty.background, media.transparent, "an empty well still shows a placeholder surface");
    assert.equal(media.empty.background, media.soft, "the empty well uses the themed inset the hint text is legible on");
    assert.notEqual(media.empty.background, media.nodeSurface, "the empty well stays visible against the node surface");
    assert.deepEqual(media.darkPlates, [], "no node paints the dark media mat behind its pixels");
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "media-transparent.png") });

    // Back to the board under test before the shell and palette checks.
    await page.evaluate(async (previous) => {
      await openCanvasBoardFromHistory(previous);
    }, mediaBoard.previous);
    await page.waitForFunction(
      () => document.querySelector("#canvasPlane .canvas-node .canvas-node-model"),
      null,
      { timeout: 10_000 },
    );
    await page.mouse.move(8, 8);
    await page.waitForTimeout(300);

    // --- Shell geometry: controls on top, status on the floor ---------------
    const layout = await page.evaluate(() => {
      const viewport = document.querySelector("#infiniteCanvas").getBoundingClientRect();
      const actions = document.querySelector(".canvas-actions").getBoundingClientRect();
      const nav = document.querySelector(".canvas-editor-navigation").getBoundingClientRect();
      const status = document.querySelector(".canvas-status").getBoundingClientRect();
      return {
        actionsTop: Math.round(actions.top - viewport.top),
        actionsRight: Math.round(viewport.right - actions.right),
        navTop: Math.round(nav.top - viewport.top),
        navLeft: Math.round(nav.left - viewport.left),
        statusBottom: Math.round(viewport.bottom - status.bottom),
        statusCenterOffset: Math.round(status.left + status.width / 2 - (viewport.left + viewport.width / 2)),
        statusTop: Math.round(status.top),
      };
    });
    assert.equal(layout.actionsTop, 16, "the action group sits on the 16px HUD gutter");
    assert.equal(layout.actionsRight, 16);
    assert.equal(layout.navTop, 16, "the navigation group shares the same top row");
    assert.equal(layout.navLeft, 16);
    assert.equal(layout.statusBottom, 16, "the status HUD anchors to the floor");
    assert.ok(Math.abs(layout.statusCenterOffset) <= 2, "the status HUD is centred on the viewport");
    assert.ok(layout.statusTop > 300, "the status HUD no longer sits under the top toolbar");
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "canvas-paper.png") });

    // --- Every palette repaints the canvas, the node and the dock ----------
    for (const [theme, palette] of Object.entries(PALETTES)) {
      // Surfaces cross-fade on transition, so let the theme settle before
      // sampling colours or the assertion reads the outgoing palette.
      await page.evaluate((next) => window.CanvasTheme.set(next), theme);
      await page.waitForTimeout(450);
      const applied = await page.evaluate(() => {
        const root = document.getElementById("canvasEditorScreen");
        const target = [...document.querySelectorAll("#canvasPlane .canvas-node")]
          .find((candidate) => candidate.querySelector(":scope > .canvas-node-bar"));
        return {
          theme: root.getAttribute("data-canvas-theme"),
          mode: root.getAttribute("data-canvas-theme-mode"),
          stored: localStorage.getItem(window.CanvasTheme.STORAGE_KEY),
          rail: document.querySelector(".rail").getAttribute("data-canvas-theme"),
          canvas: getComputedStyle(root).backgroundColor,
          nodeSurface: getComputedStyle(target).backgroundColor,
          nodeText: getComputedStyle(target).color,
          dockSurface: getComputedStyle(document.querySelector(".rail")).backgroundColor,
        };
      });
      assert.equal(applied.theme, theme, `${theme} must apply to the canvas root`);
      assert.equal(applied.mode, theme, "the requested mode is recorded on the root");
      assert.equal(applied.stored, theme, "the chosen theme survives a reload");
      assert.equal(applied.rail, theme, "the dock follows the canvas theme");
      assert.equal(applied.canvas, palette.canvas, `${theme} canvas background`);
      assert.equal(applied.nodeSurface, palette.surface, `${theme} node surface`);
      assert.equal(applied.nodeText, palette.text, `${theme} node text`);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, `canvas-${theme}.png`) });
    }

    // --- The choice sticks across a reload ---------------------------------
    await page.reload({ waitUntil: "networkidle" });
    await page.locator('[data-ai-app="canvas"]').click();
    await page.locator(".canvas-board-item").filter({ hasText: BOARD_TITLE }).first().click();
    await page.locator("#canvasEditorScreen").waitFor();
    const restored = await page.evaluate(() => ({
      theme: document.getElementById("canvasEditorScreen").getAttribute("data-canvas-theme"),
      mode: document.getElementById("canvasEditorScreen").getAttribute("data-canvas-theme-mode"),
    }));
    assert.equal(restored.mode, "warm");
    assert.equal(restored.theme, "warm");

    // --- Back to auto so the OS preference keeps driving --------------------
    const auto = await page.evaluate(() => ({
      theme: window.CanvasTheme.set("auto"),
      resolved: document.getElementById("canvasEditorScreen").getAttribute("data-canvas-theme"),
      scheme: document.documentElement.dataset.theme,
    }));
    assert.equal(auto.theme, "auto");
    assert.equal(auto.resolved, auto.scheme === "dark" ? "midnight" : "paper");

    assert.deepEqual(browserErrors, []);
    console.log("Canvas BENDO contract browser checks passed.");
  } finally {
    await browser?.close();
    await stopChild(server);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
