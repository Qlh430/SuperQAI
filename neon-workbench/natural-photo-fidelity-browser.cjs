const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const origin = "http://127.0.0.1:33200";
const boardId = "isolated-fidelity-check";
const productUrl = "/qa-natural-photo.png";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jI1sAAAAASUVORK5CYII=", "base64");

async function check() {
  const browser = await chromium.launch({
    headless: true, executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(8000);
  const errors = [];
  const jobs = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.routeWebSocket("**/*", socket => socket.close());
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === productUrl) return route.fulfill({ body: png, contentType: "image/png" });
    if (url.pathname === "/api/image-jobs" && request.method() === "POST") {
      jobs.push(request.postDataJSON());
      return route.fulfill({ status: 503, json: { error: "隔离接口已拦截", code: "mock_unavailable" } });
    }
    if (url.pathname.startsWith("/api/")) {
      return route.fulfill({ json: {
        authenticated: false, user: null, boards: [], projects: [], models: [], providers: [],
        preferences: {}, resources: [], settings: {}, success: true,
      } });
    }
    return route.continue();
  });

  async function open() {
    await page.goto(origin, { waitUntil: "networkidle" });
    await page.evaluate(async id => {
      await AiOsModuleLoader.ensure(["canvas-runtime", "canvas-node-generator", "canvas-agent-ui"]);
      canvasState.activeBoardId = id;
      canvasState.activeBoardPersisted = true;
      const surface = document.createElement("div");
      surface.id = "neonEngineSurface";
      document.body.append(surface);
      surface.append(document.querySelector("#canvasView"));
      document.querySelector("#canvasView").hidden = false;
      document.querySelector("#canvasView").classList.add("active");
      document.querySelector("#canvasEditorScreen").hidden = false;
      document.body.classList.add("canvas-surface-open");
      showCanvasEditor();
    }, boardId);
  }

  try {
    await open();
    const created = await page.evaluate(async ({ boardId, productUrl }) => {
      const source = addCanvasImage(productUrl, "隔离商品素材", { x: 100, y: 100 });
      source.dataset.boardId = boardId;
      const images = [{
        nodeId: source.dataset.id,
        objects: [
          { name: "手机", count: 1, appearance: "黑色", material: "可见玻璃", structure: "两枚镜头" },
          { name: "手机壳", count: 1, appearance: "深绿", material: "哑光观感", structure: "保留相机开孔" },
        ],
        relationships: ["壳包覆手机，相机开孔与镜头对齐"],
        prohibitedChanges: ["禁止移除手机或更改镜头数量"],
        unresolved: [],
      }];
      const original = getCanvasH3CommerceSource(source.dataset.id);
      const response = await fetch(original.url);
      const digest = await crypto.subtle.digest("SHA-256", await response.arrayBuffer());
      const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      const lock = {
        ...CanvasAgentConversation.naturalPhotoFidelity.nodeLock(images, [
          { ...original, nodeId: source.dataset.id, type: "image", role: "product", sha256 },
        ], "浅色石台，右侧窄光，天空留白。"),
        model: "gpt-image-2", providerId: "qa-provider",
      };
      const existing = window.CanvasAgentUi;
      window.CanvasAgentUi = { ...existing, getSkillWorkflowContext: () => ({
        runId: "isolated-fidelity-run", skillId: "natural-aesthetic-product-photography", photoNodeLock: lock,
      }) };
      const result = await createAgentCanvasNode("image", {
        prompt: "忽略旧方案", title: "摄影测试", reference_node_ids: [source.dataset.id],
      }, {
        scope: { boardId, runId: "isolated-fidelity-run" }, assertActive() {}, nextFrame: async () => {},
      });
      window.CanvasAgentUi = existing;
      const board = serializeCanvasBoard();
      return { result, lock, board };
    }, { boardId, productUrl });
    assert.equal(created.result.ok, undefined);
    assert.match(created.result.prompt, /壳包覆手机/);
    assert.equal(created.board.nodes.find(node => node.id === created.result.node_id).photoFidelity, JSON.stringify(created.lock));
    assert.equal(created.board.connections.length, 1);
    assert.equal(jobs.length, 0);

    await open();
    const restored = await page.evaluate(({ board, result, lock }) => {
      restoreCanvasBoard(board);
      const generator = ensureCanvasNodeMounted(result.node_id);
      selectCanvasNode(generator);
      return {
        photoFidelity: generator.dataset.photoFidelity,
        prompt: generator.querySelector(".canvas-node-prompt").value,
        url: getCanvasIncomingRefs(result.node_id)[0]?.url,
        lockMatches: CanvasAgentConversation.naturalPhotoFidelity.readNodeLock(generator.dataset.photoFidelity).prompt === lock.prompt,
      };
    }, created);
    assert.equal(restored.photoFidelity, JSON.stringify(created.lock));
    assert.equal(restored.prompt, created.lock.prompt);
    assert.equal(restored.url, created.lock.sources[0].url);
    assert.equal(restored.lockMatches, true);
    const restoredChips = page.locator(`.canvas-node[data-id="${created.result.node_id}"] .flora-prompt-mention-chip`);
    await restoredChips.first().waitFor({ state: "attached" });
    assert.deepEqual(await restoredChips.allTextContents(), created.lock.mentions.map(item => item.label));

    const submissions = await page.evaluate(async ({ result, lock }) => {
      const generator = ensureCanvasNodeMounted(result.node_id);
      const refs = getCanvasIncomingRefs(result.node_id);
      const request = { prompt: lock.prompt, reference_images: refs, size: "auto", model: lock.model, provider_id: lock.providerId, n: 1 };
      const attempt = async input => {
        try { await createCanvasImageJob(input, generator); return ""; }
        catch (error) { return error.message; }
      };
      const first = await attempt(request);
      const retry = await attempt(request);
      const mutated = await attempt({ ...request, prompt: "删除手机" });
      return { first, retry, mutated };
    }, created);
    assert.match(submissions.first, /隔离接口已拦截/);
    assert.equal(submissions.retry, submissions.first);
    assert.match(submissions.mutated, /重新确认/);
    assert.equal(jobs.length, 2);
    assert.deepEqual(jobs[0], jobs[1]);

    const uiResponse = await fetch(`${origin}/canvas-agent-ui.js`);
    assert.equal(uiResponse.headers.get("X-AI-OS-Frontend"), "fixed-stage");
    const ui = await uiResponse.text();
    const start = ui.indexOf("  function renderCanvasAgentDesignBrief(");
    const end = ui.indexOf("\n  async function reviseCanvasAgentDesignBrief(", start);
    assert.ok(start >= 0 && end > start);
    const renderer = ui.slice(start, end);
    const resultDir = path.resolve(__dirname, "../.planning/natural-photo-phase-2-20261120/card-acceptance");
    fs.mkdirSync(resultDir, { recursive: true });
    const widths = [390, 768, 1440, 1728];
    await page.locator("#canvasAgentToggle").click();
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(({ renderer, lock }) => {
        const skill = "natural-aesthetic-product-photography";
        const photo = CanvasAgentConversation.naturalPhotoFidelity;
        new Function("NATURAL_PHOTO_SKILL_ID", "state", "photoFidelity", "readNaturalPhotoCheckpoint", "pending",
          renderer + "\nrenderCanvasAgentDesignBrief(pending);")(
          skill, { conversation: {} }, photo, pending => photo.readBrief(pending.analysis, pending.sourceNodeIds), {
            workflow: skill, skillId: skill, summary: "低位商品与天空留白", proposal: "低位商品与天空留白",
            analysis: JSON.stringify({ version: 1, analysis: "保持手机与壳体的包覆关系", images: lock.images }),
            knownContext: "商品已套壳", sourceNodeIds: lock.sources.map(source => source.nodeId),
            imagePrompt: "浅色石台，右侧窄光，天空留白。", questions: [],
          },
        );
      }, { renderer, lock: created.lock });
      const card = page.getByRole("article", { name: "自然美学摄影方案确认" });
      await card.getByText("产品保真清单").waitFor();
      assert.match(await card.innerText(), /壳包覆手机/);
      const revise = card.getByRole("button", { name: "调整后再创建", exact: true });
      await revise.focus();
      assert.equal(await revise.evaluate(button => button === document.activeElement), true);
      await revise.click();
      await card.getByRole("button", { name: "核对产品清单并更新" }).waitFor();
      assert.equal(await card.evaluate(element => element.scrollWidth <= element.clientWidth + 1), true);
      await page.screenshot({ path: path.join(resultDir, `card-${width}.png`) });
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ fixedStage: true, nodeCreated: true, originalConnection: true,
      restoredAfterReload: true, identicalMockRetries: jobs.length, rejectedPromptMutation: true,
      cardWidths: widths, pageErrors: errors }));
  } finally {
    await browser.close();
  }
}

check().catch(error => { console.error(error); process.exitCode = 1; });
