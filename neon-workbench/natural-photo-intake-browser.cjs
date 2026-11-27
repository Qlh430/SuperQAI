"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const origin = "http://127.0.0.1:33200";
const boardId = "qa-photo-intake";
const title = "摄影信息收集隔离验收";
const skillId = "natural-aesthetic-product-photography";
const skill = { id: skillId, label: "自然美学产品摄影", category: "image", scope: "personal", origin: "custom" };
const host = path.resolve(__dirname, "../host-sources/app");
const pack = path.join(host, "skill-packages", skillId);
const config = fs.readFileSync(path.join(pack, "interaction.json"), "utf8");
const imageFile = process.env.AI_OS_PHOTO_FIXTURE || path.resolve(__dirname,
  "../AI-OS-Portable-1.0.5-win-x64/data/output/1600_04_1795418544212_bb3082d5.jpg");
const imageUrl = "/output/qa-photo-intake.jpg";
const output = path.resolve(__dirname, "../.planning/natural-photo-regression-20261124/browser");
const sourceMode = process.argv.includes("--source");
const model = { id: "gpt-image-2", modelId: "gpt-image-2", displayName: "GPT Image 2 · 模拟",
  providerId: "qa-photo-provider", providerName: "摄影验收模拟接口",
  platform: "openai", family: "gpt-image-2", enabled: true, hasApiKey: true, hasBaseUrl: true,
  capabilities: ["image.generate", "image.edit"], ratios: ["3:4", "9:16", "16:9"], resolutions: ["1", "2", "4"] };
const audience = "面向商务通勤人群，用作品牌主视觉的摄影底图。";
const marks = "保留壳缘实物标识与背部圆环。";
const product = "中性灰透明手机壳，背部磁吸圆环和短竖条，深灰镜头区。";
const suggested = [
  { label: "斜光透明边", description: "侧后窗光描亮透明壳边，哑光石面衬托轮廓和镜头组件。" },
  { label: "窄窗灰廊", description: "用窄窗横向掠光照亮镜头区域，背景明暗分区留出空间。" },
  { label: "浅砂软影", description: "暖浅砂石平面与自然柔影表现透明外壳的厚薄和细节。" },
  { label: "暗底亮沿", description: "以暗色哑光背景压低反射，从左后方勾出产品透明外缘。" },
];
const refs = ["references/photography-methods.md", "references/visual-method-catalog.md"];
const reference = file => ({ skill_id: skillId, path: file, content: fs.readFileSync(path.join(pack, file), "utf8") });
const deferred = () => {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
};

function knownContext(nodeId) {
  const { options } = require("./test-fixtures/natural-photo-art-directions.json");
  return JSON.stringify({
    version: 2, analysis: product,
    images: [{ nodeId, subjectInventory: { targetObjects: [{
      id: "case", name: "透明手机壳", count: 1, appearance: product,
      structure: "保持镜头开孔和手机与壳体原有结构", markings: "保留壳缘实物标识",
    }] } }],
    visualFeatures: [["中性灰透明壳边", "侧逆光表现厚薄"], ["背部圆环及短竖条", "保留背板图形及间距"],
      ["镜头开孔和实物标识", "使焦平面覆盖该区域"]]
      .map(([observation, importance]) => ({ nodeId, targetId: "case", observation, importance })),
    creativeDirections: {
      recommendedId: options[0].id, reason: "侧后光保留透明边缘和镜头组，连续石面承托商品。",
      options: options.map((option, index) => ({
        ...option, name: suggested[index].label, concept: suggested[index].description,
        placement: "保持镜头装配与可见面，背面朝上平放于连续表面。",
        composition: `16:9，主体在画面${["左下", "右侧", "中部"][index]}，周边保持自然明暗过渡，不添加排版。`,
        color: ["低饱和冷灰", "浅暖赭色", "深灰冷调"][index] + "衬托透明手机壳原色",
        use: audience, reason: suggested[index].description, featureIndices: [[1, 2], [2, 3], [1, 3]][index],
      })),
    },
  });
}

async function check() {
  const browser = await chromium.launch({ executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" });
  const intake = deferred(), direction = deferred();
  const errors = [], routeErrors = [], writes = [], paid = [], turns = [], screenshots = [], uploads = [];
  const nodes = new Map(), edges = new Map();
  let revision = 0;
  let conversation = { boardId, conversationId: "qa-photo-conversation", revision: 1, activeSkillId: "", items: [],
    generationSettings: { mode: "agent", automatic: false, type: "image", model: model.id, size: "3:4", resolution: "1" } };
  const page = await browser.newPage({ viewport: { width: 1440, height: 970 } });
  try {
    page.setDefaultTimeout(12000);
    page.on("pageerror", error => errors.push(error.message));
    await page.routeWebSocket("**/*", socket => socket.close());
    await page.route("**/*", async route => {
      try {
        const request = route.request(), url = new URL(request.url());
        const key = url.pathname, method = request.method(), body = () => request.postDataJSON();
        const json = data => route.fulfill({ json: data });
        if (url.origin !== origin) return route.abort();
        if (sourceMode && ["/canvas-agent-ui.js", "/canvas-agent-conversation.js"].includes(key)) {
          return route.fulfill({ path: path.join(host, key.slice(1)), contentType: "text/javascript" });
        }
        if (key === imageUrl) return route.fulfill({ path: imageFile, contentType: "image/jpeg" });
        if (key === `/skill-interactions/${skillId}.json`) return route.fulfill({ body: config, contentType: "application/json" });
        if (!key.startsWith("/api/")) return route.continue();
        if (key === "/api/auth/session") return json({
          authenticated: true, user: { id: "qa-photo-user", username: "qa", displayName: "验收账户", role: "superadmin", status: "active" },
        });
        if (key === "/api/canvas/boards") return json({ boards: [{ id: boardId, title, resourceId: boardId, nodeCount: nodes.size }] });
        if (key.startsWith(`/api/canvas/boards/${boardId}/`)) {
          if (key.endsWith("/operations") && method === "POST") {
            const operations = body().operations;
            writes.push(...operations);
            for (const item of operations) {
              if (item.type === "node.upsert") nodes.set(item.entityId, item.after);
              if (item.type === "connection.upsert") edges.set(item.entityId, item.after);
            }
            revision++;
            return json({ success: true, boardRevision: revision, results: operations.map(
              ({ operationId, entityId }) => ({ operationId, entityId, status: "applied", entityRevision: revision }),
            ) });
          }
          const id = url.searchParams.get("nodeId"), selected = id ? [nodes.get(id)].filter(Boolean) : [...nodes.values()];
          return json({ node: selected[0], nodes: selected, connections: [...edges.values()], revision, boardRevision: revision,
            mode: "detail", engineVersion: "canvas-visual-fidelity-v2", complete: true, title });
        }
        if (key === "/api/canvas-agent/conversation") {
          if (method === "POST" && body().conversation) conversation = { ...body().conversation, revision: conversation.revision + 1 };
          return json({ ...conversation, activeConversationId: conversation.conversationId, sessions: [] });
        }
        if (key === "/api/canvas-agent/skills") return json({ skills: [skill], pickerSkills: [skill], configured: true });
        if (key === "/api/skills/detail") return json({ ...skill, instructions: fs.readFileSync(path.join(pack, "SKILL.md"), "utf8"),
          references: refs.map(path => ({ path })) });
        if (key === "/api/skills/reference") return json(reference(url.searchParams.get("path")));
        if (key === "/api/image-models") return json({ models: [model], candidates: [model], defaultModel: model.id });
        if (key === "/api/upload-image") {
          uploads.push(request.headers()["x-file-name"]);
          return json({ url: imageUrl, asset: { id: "qa-photo-image", name: "1600_04.jpg" }, mimeType: "image/jpeg" });
        }
        if (key === "/api/image-thumbnails") return json({ item: { thumbnailUrl: imageUrl, width: 1600, height: 1600 } });
        if (key === "/api/canvas-agent/turn") {
          const input = body();
          turns.push(input);
          const reply = { request_id: input.request_id, message_id: input.message_id,
            response_id: `qa-${turns.length}`, tool_calls: [],
            vision_receipt: { count: input.vision_images?.length || 0, mime_type: "image/jpeg" } };
          if (input.prompt.startsWith("任务阶段：先理解")) {
            await intake.promise;
            reply.message = JSON.stringify({ knownValues: { product_positioning: product, size: "3:4", resolution: "1" },
              collectFields: ["audience_usage", "creative_direction"], missingImageSteps: ["image"], analysis: product, directions: suggested });
          } else if (input.prompt.startsWith("为当前商品推荐")) {
            await direction.promise;
            reply.message = JSON.stringify({ directions: suggested });
          } else if (input.tool_outputs?.length) {
            reply.tool_calls = [{ name: "request_design_brief", call_id: "qa-brief", arguments: {
              workflow: skillId, poster_type: null, source_node_ids: conversation.wizardDraft.sourceNodeIds,
              known_context: knownContext(conversation.wizardDraft.sourceNodeIds[0]),
              summary: "斜光透明边的摄影方案", image_prompt: suggested[0].description, questions: [],
            } }];
          } else {
            reply.tool_calls = refs.map((file, index) => ({
              name: "read_skill_reference", call_id: `qa-ref-${index}`, arguments: { skill_id: skillId, path: file },
            }));
          }
          return json(reply);
        }
        if (method === "POST" && /image-jobs|generat|comfy/u.test(key)) {
          paid.push(key);
          return route.fulfill({ status: 403, json: { error: "专项禁止提交真实任务" } });
        }
        return json({ boards: [], projects: [], models: [], providers: [], assets: [], settings: {}, success: true });
      } catch (error) {
        routeErrors.push(error.message);
        await route.abort().catch(() => {});
      }
    });
    const response = await page.goto(origin, { waitUntil: "domcontentloaded" });
    assert.equal(response.headers()["x-ai-os-frontend"], "fixed-stage");
    await page.frameLocator("#aiOsNeonFrame").getByRole("button", { name: `打开画布 ${title}` }).click();
    await page.locator("#neonEngineSurface").waitFor();
    if (await page.locator("#canvasAgentPanel").getAttribute("aria-hidden") === "true") await page.locator("#canvasAgentToggle").click();
    const messages = page.locator("#canvasAgentMessages");
    await messages.locator("#canvasAgentWelcome").waitFor();
    const capture = async name => {
      if (sourceMode) return;
      fs.mkdirSync(output, { recursive: true });
      const file = path.join(output, `${name}.png`);
      await page.screenshot({ path: file });
      screenshots.push(file);
    };
    await page.locator("#canvasAgentContextAdd").click();
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"),
      page.locator('[data-agent-attachment="upload"]').click()]);
    await chooser.setFiles([{ name: "1600_04.jpg", mimeType: "image/jpeg", buffer: fs.readFileSync(imageFile) }]);
    const material = page.locator('#canvasAgentContext [data-agent-node-id][title="1600_04.jpg"]');
    await material.waitFor();
    await page.locator("#canvasAgentSkillBook").click();
    await page.locator(`[data-agent-skill="${skillId}"]`).click();
    const prompt = page.locator("#canvasAgentPrompt");
    assert.equal(await prompt.inputValue(), "");
    await page.locator("#canvasAgentSend").click();
    const bubble = messages.locator(".canvas-agent-message.is-user");
    await bubble.getByText(skill.label, { exact: true }).waitFor();
    await bubble.getByRole("img", { name: "1600_04.jpg" }).waitFor();
    const waiting = messages.locator(".canvas-agent-waiting");
    await waiting.waitFor();
    assert.equal(await messages.locator("#canvasAgentWelcome").count(), 0);
    const wizard = messages.locator(".canvas-agent-wizard");
    assert.equal(await wizard.count(), 0);
    await capture("01-request-and-analysis");
    intake.release();
    await wizard.locator('[data-agent-wizard-field="audience_usage"]').fill(audience);
    await wizard.getByRole("button", { name: "下一步" }).click();
    await waiting.waitFor();
    assert.equal(await messages.locator("#canvasAgentWelcome").count(), 0);
    assert.equal(await wizard.locator('[data-agent-wizard-field="audience_usage"]').inputValue(), audience);
    await capture("02-awaiting-directions");
    direction.release();
    await wizard.getByRole("button", { name: /斜光透明边/ }).click();
    await capture("03-dynamic-directions");
    await wizard.getByRole("button", { name: "下一步" }).click();
    const outputStep = wizard.and(page.locator('[data-agent-wizard-step="output"]'));
    await outputStep.locator('[data-agent-wizard-field="size"][data-value="16:9"]').click();
    await outputStep.locator('[data-agent-wizard-field="resolution"][data-value="2"]').click();
    for (const width of [390, 768, 1440, 1728]) {
      await page.setViewportSize({ width, height: 970 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `width ${width}`);
      assert.ok(await outputStep.isVisible(), `output step ${width}`);
      await capture(`04-output-${width}`);
    }
    await page.setViewportSize({ width: 1440, height: 970 });
    await wizard.getByRole("button", { name: "下一步" }).click();
    await wizard.locator('[data-agent-wizard-field="brand_limits"]').fill(marks);
    await wizard.getByRole("button", { name: "提交创作信息" }).click();
    const card = messages.locator(".canvas-agent-brief").filter({ hasText: "确认生成方案" });
    await card.waitFor();
    const planning = turns.find(input => input.prompt.startsWith("请依据当前已选择的"));
    assert.ok(planning);
    for (const value of [product, audience, suggested[0].description, marks, "16:9", "分辨率　2"]) assert.ok(planning.prompt.includes(value), value);
    assert.equal(planning.vision_images.length, 1);
    assert.equal(planning.generation_settings.size, "16:9");
    assert.equal(planning.generation_settings.resolution, "2");
    assert.equal(conversation.pendingWorkflow.parameters.size, "16:9");
    assert.equal(conversation.pendingWorkflow.parameters.resolution, "2");
    await capture("05-plan");
    await card.getByRole("button", { name: /仅创建节点|确认并创建节点/ }).click();
    await messages.getByText(/摄影方案已确认，图片生成节点已创建/).waitFor();
    const created = nodes.get(conversation.pendingWorkflow.outputNodeId);
    assert.equal(created.size, "16:9");
    assert.equal(created.resolution, "2");
    assert.equal(created.model, model.id);
    assert.ok([...edges.values()].some(edge => edge.from === conversation.wizardDraft.sourceNodeIds[0] && edge.to === created.id));
    assert.match(created.prompt, /斜光透明边/u);
    assert.equal(conversation.items.filter(item => item.role === "user").length, 1);
    assert.equal(conversation.items.find(item => item.role === "user").attachments[0].url, imageUrl);
    assert.equal(uploads.length, 1);
    assert.deepEqual(paid, []);
    assert.deepEqual(errors, []);
    assert.deepEqual(routeErrors, []);
    await page.evaluate(ids => {
      focusAgentCanvasNodesInViewport(ids.map(id => ensureCanvasNodeMounted(id)));
    }, [conversation.wizardDraft.sourceNodeIds[0], created.id]);
    await page.waitForFunction(id => {
      const node = document.querySelector(`#canvasPlane [data-id="${CSS.escape(id)}"]`);
      const bounds = node?.getBoundingClientRect();
      const panel = document.querySelector("#canvasAgentPanel").getBoundingClientRect();
      return bounds && bounds.x + bounds.width / 2 > 0 && bounds.x + bounds.width / 2 < panel.left
        && bounds.y + bounds.height / 2 > 0 && bounds.y + bounds.height / 2 < innerHeight;
    }, created.id);
    await capture("06-configured-node");
    const result = { origin, sourceMode, steps: ["audience", "creative", "output", "brand"], uploads: uploads.length,
      model: created.model, size: created.size, resolution: created.resolution, paid, writes: writes.length, errors, screenshots };
    if (!sourceMode) fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ status: await page.locator("#canvasAgentStatus").textContent({ timeout: 700 }).catch(() => ""),
      messages: await page.locator("#canvasAgentMessages").innerText({ timeout: 700 }).catch(() => ""),
      draft: conversation.wizardDraft, turns: turns.map(turn => turn.prompt?.slice(0, 90)),
      writes: writes.map(item => item.type), paid, errors, routeErrors }, null, 2));
    throw error;
  } finally {
    await browser.close();
  }
}

check().catch(error => { console.error(error); process.exitCode = 1; });
