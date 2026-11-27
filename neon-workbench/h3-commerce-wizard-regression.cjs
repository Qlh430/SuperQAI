const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const portable = path.resolve(__dirname, "../AI-OS-Portable-1.0.5-win-x64");
const { appRoot } = JSON.parse(fs.readFileSync(path.join(portable, "data/.logs/runtime-diagnostics.json"), "utf8"));
const { createSkillRegistry } = require(path.join(appRoot, "skill-registry"));
const { getPublicSkillMetadata } = require(path.join(appRoot, "canvas-agent-runtime"));
const { createCanvasAgentConversationStore } = require("../host-sources/app/canvas-agent-conversation-store");
const { createH3CommercePackageService, resolveH3CommerceImageSnapshot } = require("../host-sources/app/h3-commerce-package-service");

const base = "http://127.0.0.1:33200";
const skillId = "h3-commerce-video";
const boardId = "qa-h3-wizard";
const userId = "qa-user";
const sample = process.argv[2] || process.env.AI_OS_H3_QA_CASE;
const reuseTarget = process.argv.includes("--reuse");
const historySlot = process.argv.includes("--history");
const explicitAttachment = process.argv.includes("--attachment");
const timeoutIntake = process.argv.includes("--intake-timeout");
const repairReview = process.argv.includes("--repair-review");
const missingFact = process.argv.includes("--missing-fact");
const invalidImage = process.argv.includes("--invalid-image");
const presenter = process.argv.includes("--presenter");
const presentationMode = presenter ? "presenter" : "product_voiceover";
const repeatedSlot = historySlot || process.argv.includes("--repeat");
assert.ok(sample, "AI_OS_H3_QA_CASE must point to a local four-image QA case directory");
const samplePlan = path.join(sample, presenter ? "人物出镜" : "纯商品旁白", "Codex_v0.2.11");
const readPlan = name => fs.readFileSync(path.join(samplePlan, name), "utf8").replaceAll("\r\n", "\n").trim();
const sampleImages = JSON.parse(readPlan("图片映射.json")).map(entry => path.resolve(samplePlan, entry.file));
const imageUrls = sampleImages.map((_, index) => "/output/h3-qa-" + (index + 1) + ".jpg");
const [promptA, promptB] = ["prompt-a.txt", "prompt-b.txt"].map(readPlan);
const packageMd = readPlan("台词与分镜.md");
const facts = fs.readFileSync(path.join(sample, "商品资料.txt"), "utf8").trim();
const storyboard = packageMd.replaceAll("\r", "").split(/(?=^### [AB]\d)/m).slice(1).map(block => {
  const [, segment, shot, start, end] = block.match(/^### ([AB])(\d+) · ([\d.]+)[–-]([\d.]+)秒/);
  const field = name => block.match(new RegExp("^" + name + "：(.+)$", "m"))?.[1];
  const narration = (segment === "A" ? promptA : promptB).split(/\[Shot \d+\]/)[Number(shot)];
  const [, speech_start, speech_end] = narration.match(/Beginning around ([\d.]+) seconds and completing this sentence by ([\d.]+) seconds/);
  return {
    segment, shot: Number(shot), start: Number(start), end: Number(end),
    visual: field("画面"), dialogue: field("台词"),
    pictures: JSON.parse(field("参考图").split("；")[0]), speaker: "S1", mouth_visible: false,
    image_status: "已查看测试图片", speech_start: Number(speech_start), speech_end: Number(speech_end),
    state_in: field("开始状态"), state_out: field("结束状态"), transition: field("进入方式"),
  };
});
const fullScript = storyboard.map(row => row.dialogue).join("");
const hanzi = value => [...value.matchAll(/\p{Script=Han}/gu)].length;
const resultJson = {
  skill_version: "0.2.11", presentation_mode: presentationMode,
  status: "test_fixture", input_mapping: JSON.parse(readPlan("图片映射.json")), facts,
  limitations: ["图1是供场景参考的生成摆景，商品结构以官方图2–4为准。"],
  immutable_identity_block: promptA.split(/summary:\r?\n/)[0].replace(/^subject_definitions:\s*/, "").trim().replaceAll("\r", ""),
  storyboard, dialogue_hanzi_counts: {
    A: hanzi(storyboard.filter(row => row.segment === "A").map(row => row.dialogue).join("")),
    B: hanzi(storyboard.filter(row => row.segment === "B").map(row => row.dialogue).join("")),
  },
  selling_plan: {
    core_reasons: [{ source: "用户样例商品资料中的锅体蓄热介绍", dialogue_quote: storyboard[0].dialogue }],
    purchase_conditions: [{ source: "用户样例商品资料中的兼容热源", dialogue_quote: storyboard[3].dialogue }],
    condition_review: { selection: [], effect: [], operation: [] },
  },
  full_script: fullScript, script_hanzi_count: hanzi(fullScript),
  prompt_a: promptA.replaceAll("\r", ""), prompt_b: promptB.replaceAll("\r", ""),
};

async function run() {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-h3-wizard-"));
  const registry = createSkillRegistry({ dataDir: scratch, systemDir: path.join(appRoot, "skills") });
  const catalog = registry.loadAgentCatalog(userId);
  const skills = getPublicSkillMetadata(catalog).map(skill => skill.id === skillId
    ? { ...skill, enabled: true, validation_status: "verified" } : skill);
  const h3 = catalog.business.find(skill => skill.id === skillId);
  assert.equal(h3.metadata.version, "0.2.11");
  const references = h3.references.map(reference => reference.path);
  const store = createCanvasAgentConversationStore({ filePath: path.join(scratch, "conversations.json") });
  const nodes = new Map();
  const edges = new Map();
  let boardRevision = 0;
  let packageResponse;
  let uploadCount = 0;
  let paidCalls = 0;
  let packageSaveAttempts = 0;
  let planningTurns = 0;
  let repairTurns = 0;
  let confirmedTurns = 0;
  let expectedIds = [];
  let targetId;
  let expectedUrls = imageUrls;
  const errors = [];
  const turnEvents = [];
  const readReferences = new Set();
  const packageService = createH3CommercePackageService({
    outputDir: scratch,
    ensureReferencedResource: async (_, { refId }) => ({ id: refId }),
    resourceAccess: { assertRead() {}, assertWrite() {} },
    resolveTarget: async (_, board, target, ids, urls) => {
      assert.equal(board, boardId);
      assert.equal(target, targetId);
      assert.deepEqual(ids, expectedIds);
      assert.deepEqual(urls, expectedUrls);
      return ids.map((id, index) => {
        const snapshot = resolveH3CommerceImageSnapshot(nodes.get(id), urls[index]);
        assert.ok(snapshot, `未找到素材快照 ${id} ${urls[index]}`);
        return { node_id: id, slot: index + 1, ...snapshot };
      });
    },
  });
  const browser = await chromium.launch({
    headless: true, executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
  const intakeRequests = [];
  page.setDefaultTimeout(13000);
  page.on("pageerror", error => errors.push(error.message));
  page.on("requestfailed", request => {
    if (request.url().includes("/api/canvas-agent/turn")) turnEvents.push({ failed: request.failure()?.errorText });
  });
  const snapshot = () => ({ id: boardId, title: "H3 验收画布", nodes: [...nodes.values()], connections: [...edges.values()], revision: boardRevision });
  try {
    await page.routeWebSocket("**/*", socket => socket.close());
    await page.route("**/output/h3-qa-*", route => {
      const index = imageUrls.indexOf(new URL(route.request().url()).pathname);
      if (index === -1) return route.fulfill({ path: path.join(__dirname, "test-fixtures/video-seek-fixture.mp4") });
      return route.fulfill({ path: sampleImages[index] });
    });
    await page.route("**/api/**", async route => {
      const request = route.request();
      const url = new URL(request.url());
      const body = request.method() === "POST" && request.headers()["content-type"]?.includes("json") ? request.postDataJSON() : {};
      const json = value => route.fulfill({ json: value });
      if (url.pathname === "/api/canvas-agent/skills") return json({ skills, pickerSkills: [], configured: true, agentSettings: { configured: true } });
      if (url.pathname === "/api/canvas-agent/conversation") {
        if (request.method() === "POST") return json(store.upsert(body.conversation));
        if (url.searchParams.get("action") === "list") return json(store.list(boardId));
        return json(store.get(boardId));
      }
      if (url.pathname === "/api/skills/detail") return json({ id: skillId, scope: "system", version: "0.2.11",
        instructions: fs.readFileSync(path.join(appRoot, "skills", skillId, "SKILL.md"), "utf8"),
        references: references.map(path => ({ path })) });
      if (url.pathname === "/api/skills/reference") {
        const reference = url.searchParams.get("path");
        assert.ok(references.includes(reference));
        assert.equal(url.searchParams.get("skill_id"), skillId);
        readReferences.add(reference);
        const content = fs.readFileSync(path.join(appRoot, "skills", skillId, reference), "utf8");
        return json({ skill_id: skillId, path: reference, content, bytes: Buffer.byteLength(content) });
      }
      if (url.pathname === "/api/upload-image") {
        uploadCount++;
        return json({ url: imageUrls[3] });
      }
      if (url.pathname === "/api/asset-library") return json({
        entries: [{ asset: { id: "qa-h3-asset", name: "验收同款图片", permission: "owner" },
          resource: { id: "qa-h3-resource", type: "image" }, preview: { kind: "image", url: imageUrls[2] }, access: {} }],
        categories: [], folders: [],
      });
      if (url.pathname === "/api/canvas-agent/turn") {
        turnEvents.push({ previous: body.previous_response_id, step: body.step,
          outputs: (body.tool_outputs || []).map(({ call_id, output }) => [call_id, output?.ok, output?.state,
            output?.prompt_a_filled, output?.prompt_b_filled, output?.image_slots_filled]) });
        const reply = (id, toolCalls, message = "") => {
          turnEvents.push({ reply: id });
          return json({ response_id: id, tool_calls: toolCalls, message,
            request_id: body.request_id, message_id: body.message_id,
            ...(body.vision_images?.length ? { vision_receipt: { count: body.vision_images.length, mime_type: "image/jpeg" } } : {}),
          });
        };
        const tool = (id, name, args) => ({ call_id: id, name, arguments: args });
        if (body.prompt?.startsWith("任务阶段：先理解")) {
          assert.equal(body.skill_id, skillId);
          assert.ok(body.prompt.includes("references/assets.md"));
          intakeRequests.push({ taskId: body.task_id, skillId: body.skill_id,
            prompt: body.prompt, materials: body.canvas.agent_image_attachments || [] });
          if (timeoutIntake && intakeRequests.length === 1) {
            return route.fulfill({ status: 504, json: { error: "模型请求超时，候选均未返回。", code: "UPSTREAM_TIMEOUT" } });
          }
          return reply("intake", [], JSON.stringify({
            knownValues: {}, collectFields: [], missingImageSteps: [],
            imageMatches: explicitAttachment
              ? [{ stepId: presenter ? "opening_presenter" : "opening_product", candidateIndex: 1, certain: true }] : [],
          }));
        }
        const review = () => reply("review", [], JSON.stringify({
          analysis: (presenter ? "图1为人物和商品同场。" : "图1为厨房摆景。") + "图2–4核对黑色L8SK3锅身、长柄、辅助手柄及锅沿。蓄热和热源兼容来自商品资料。",
          proposal: "面向家庭煎烤。A段以整锅开场、切到上桌肉排，B段承接并展示锅柄与锅沿细节。旁白讲蓄热与多热源适用。",
          missing: "无。",
          ...(missingFact ? { missing_fact: { field: "selling_facts", question: "请确认锅体是否适用烤箱及其条件。" } } : {}),
          ...(invalidImage ? { invalid_image: { slot: "evidence", reason: "图片显示了另一个款式。" } } : {}),
        }));
        if (!body.tool_outputs?.length) {
          assert.equal(body.skill_id, skillId);
          assert.deepEqual(body.canvas.h3_commerce_visual_inputs.map(item => item.node_id), expectedIds);
          assert.equal(new Set(body.vision_images).size, repeatedSlot && !historySlot ? 3 : 4);
          assert.ok(body.vision_images.every(image => /^data:image\/jpeg;base64,/.test(image)));
          if (body.prompt.includes("修复上次方案响应")) {
            repairTurns++;
            assert.equal(references.filter(reference => body.prompt.includes(`参考资料 ${reference}\n`)).length, 6);
            return review();
          }
          const confirmed = body.prompt.startsWith("继续配置 H3 带货视频方案");
          if (confirmed) {
            confirmedTurns++;
            if (!reuseTarget) targetId = "h3-commerce-" + store.get(boardId).wizardDraft.taskId;
            assert.equal(body.canvas.h3_commerce_target_node_id, targetId);
            assert.notEqual(String(body.canvas.h3_commerce_target_node_id), "null");
          } else {
            planningTurns++;
            if (!reuseTarget) assert.equal(body.canvas.h3_commerce_target_node_id, undefined);
          }
          const phase = confirmed ? "confirmed" : "planning";
          return reply(phase + "-refs", references.map((reference, index) =>
            tool(phase + "-" + index, "read_skill_reference", { skill_id: skillId, path: reference })));
        }
        if (body.tool_outputs.some(item => item.call_id === "planning-0")) {
          assert.equal(body.tool_outputs.filter(item => item.output?.ok).length, 6, JSON.stringify(turnEvents));
          for (const { output } of body.tool_outputs) {
            assert.equal(output.content, fs.readFileSync(path.join(appRoot, "skills", skillId, output.path), "utf8"));
          }
          return repairReview ? reply("review-empty", [], "") : review();
        }
        if (body.tool_outputs.some(item => item.call_id === "confirmed-0")
          || body.tool_outputs[0]?.call_id === "save-package" && body.tool_outputs[0]?.output?.ok === false) {
          const retry = body.tool_outputs[0]?.call_id === "save-package";
          return reply("package", [tool(retry ? "retry-package" : "save-package", "save_h3_commerce_package", {
            node_id: targetId, image_node_ids: expectedIds,
            prompt_a: promptA.replaceAll("\n", "\r\n"), prompt_b: promptB.replaceAll("\n", "\r\n"),
            package_md: packageMd, result_json: JSON.stringify(resultJson),
          })]);
        }
        if (body.tool_outputs[0].call_id === "save-package") {
          assert.equal(body.tool_outputs[0].output.state, "package_saved");
          return reply("fill", [tool("fill-node", "fill_h3_commerce_node", {
            node_id: targetId, package_id: packageResponse.package_id,
          })]);
        }
        assert.equal(body.tool_outputs[0].output.state, "node_inputs_filled");
        assert.equal(body.tool_outputs[0].output.persisted, true);
        return reply("done", [], "方案文件已保存，节点已配置。");
      }
      if (url.pathname === "/api/canvas-agent/h3-commerce-package") {
        if (request.method() === "GET") return json(await packageService.read(userId, boardId, url.searchParams.get("package_id")));
        packageSaveAttempts++;
        if (!reuseTarget && packageSaveAttempts === 1) {
          return route.fulfill({ status: 400, json: { error: "验收覆盖方案保存重试" } });
        }
        packageResponse = await packageService.save(userId, boardId, body.files, JSON.parse(body.files["result.json"]).canvas);
        return json(packageResponse);
      }
      if (url.pathname.startsWith("/api/minimax-h3-video")) {
        paidCalls++;
        return route.fulfill({ status: 400, json: { error: "验收不提交视频生成" } });
      }
      if (url.pathname.endsWith("/operations") && request.method() === "POST") {
        for (const op of body.operations) {
          const collection = op.type.startsWith("node.") ? nodes : edges;
          if (op.type.endsWith(".upsert")) collection.set(op.entityId, op.after);
          else if (op.type.endsWith(".delete")) collection.delete(op.entityId);
        }
        boardRevision++;
        return json({ boardRevision, results: body.operations.map(op => ({
          operationId: op.operationId, status: "applied", entityRevision: boardRevision,
        })) });
      }
      if (url.pathname === "/api/canvas/boards/" + boardId) return json(snapshot());
      return json({ authenticated: false, boards: [], projects: [], resources: [], records: [], models: [], providers: [], preferences: {}, settings: {} });
    });

    const openBoard = saved => page.evaluate(async ({ boardId, saved }) => {
      const modules = await AiOsModuleLoader.ensure(["canvas-runtime", "canvas-node-minimax-h3", "canvas-agent-ui"]);
      if (modules?.ok === false) throw new Error(JSON.stringify(modules));
      await loadCanvasBoards();
      const surface = document.createElement("div");
      surface.id = "neonEngineSurface";
      surface.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#0c0c0b";
      const view = document.querySelector("#canvasView");
      surface.append(view);
      document.body.append(surface);
      view.hidden = false;
      view.classList.add("active");
      view.style.cssText = "flex:1;min-height:0;width:100%";
      document.querySelector("#canvasEditorScreen").hidden = false;
      document.body.classList.add("canvas-surface-open");
      canvasState.activeBoardId = boardId;
      canvasState.activeBoardPersisted = true;
      showCanvasEditor();
      if (saved) restoreCanvasBoard(saved);
    }, { boardId, saved });
    const submit = async prompt => {
      await page.locator("#canvasAgentPrompt").fill(prompt);
      await page.locator('#canvasAgentForm button[type="submit"]').click();
    };
    const action = name => page.locator('[data-agent-wizard-action="' + name + '"]');
    const wizard = page.locator(".canvas-agent-wizard");
    const step = id => page.locator('[data-agent-wizard-step="' + id + '"]').waitFor();
    const openingStep = presenter ? "opening_presenter" : "opening_product";
    const imageStepCount = explicitAttachment ? 3 : 4;
    const positionOf = raw => raw - Number(explicitAttachment);
    const checkStep = async (position, label = "下一步") => {
      assert.match(await wizard.locator("[data-agent-wizard-progress]").innerText(), new RegExp(`${position} / ${imageStepCount}$`));
      assert.equal(await action("next").innerText(), label);
    };
    const composerImages = () => page.locator("#canvasAgentContext .canvas-agent-context-chip.is-image").evaluateAll(elements => elements.map(chip => chip.dataset.agentNodeId));
    const pickPoint = id => page.evaluate(id => {
      const model = getCanvasNodeModel(id);
      const viewport = document.querySelector("#infiniteCanvas").getBoundingClientRect();
      const transform = getCanvasAppliedViewport();
      return { x: viewport.left + transform.x + (Number(model.x) + 55) * transform.scale,
        y: viewport.top + transform.y + (Number(model.y) + 80) * transform.scale };
    }, id);
    const selectNode = id => page.evaluate(id => selectCanvasNode(ensureCanvasNodeMounted(id)), id);
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await openBoard();
    const prepared = await page.evaluate(({ urls, reuseTarget }) => ({
      target: addCanvasMinimaxH3Node({ x: 60, y: 70 }, { modelId: reuseTarget ? "h3-commerce" : "minimax-h3", prompt: "原节点参数" }).dataset.id,
      sources: urls.slice(0, 2).map((url, index) => addCanvasImage(url, "验收素材 " + (index + 1), { x: 100 + index * 240, y: 500 }).dataset.id),
    }), { urls: imageUrls, reuseTarget });
    await page.evaluate(() => {
      Object.assign(canvasState, { x: 50, y: 40, scale: 0.55 });
      applyCanvasTransformNow();
    });
    targetId = prepared.target;
    await page.locator("#canvasAgentToggle").click();
    await page.waitForFunction(() => document.querySelector('[data-agent-skill="h3-commerce-video"]'));
    const attachmentIds = explicitAttachment ? [prepared.sources[0]] : [];
    if (explicitAttachment) {
      await page.locator("#canvasAgentContextAdd").click();
      await page.locator('[data-agent-attachment="canvas"]').click();
      const point = await pickPoint(attachmentIds[0]);
      await page.mouse.click(point.x, point.y);
      await page.waitForFunction(() => document.querySelector('#canvasAgentStatus')?.textContent.includes('已引用素材'));
    }
    await submit("帮我制作这款商品的 H3 带货视频。商品：Lodge L8SK3 黑色铸铁煎锅。面向家庭煎烤用户。卖点：铸铁蓄热，适用电磁炉与烤箱。" + (presenter ? "人物讲解。" : "纯商品旁白。"));
    if (timeoutIntake) {
      await wizard.getByText(/模型请求超时/).waitFor();
      const failed = store.get(boardId).wizardDraft;
      assert.equal(failed.values.intake_state, "failed");
      assert.equal(failed.skillId, skillId);
      assert.equal(await page.locator("#canvasAgentPrompt").inputValue(), "");
      await action("retry-intake").click();
      await step(explicitAttachment ? "main" : openingStep);
      assert.equal(intakeRequests.length, 2);
      assert.deepEqual(intakeRequests[1], intakeRequests[0]);
      assert.equal(store.get(boardId).wizardDraft.taskId, failed.taskId);
    }
    await step(explicitAttachment ? "main" : openingStep);
    await checkStep(1);
    assert.deepEqual(store.get(boardId).skillEvents.filter(event => event.eventId.startsWith("intake-reference:"))
      .map(event => event.path), ["references/onboarding.md", "references/assets.md", "references/selling-copy.md"]);
    if (explicitAttachment) {
      assert.deepEqual(intakeRequests[0].materials.map(ref => ref.node_id), attachmentIds);
      assert.equal(store.get(boardId).wizardDraft.values.image_opening, attachmentIds[0]);
      assert.ok(!store.get(boardId).wizardDraft.values.intake_images.includes(openingStep));
    } else assert.deepEqual(await composerImages(), []);
    assert.match(await page.locator("#canvasAgentMessages").innerText(), /已匹配专业流程：H3 带货视频/);
    const understood = store.get(boardId).wizardDraft.values;
    assert.match(understood.product_name, /L8SK3/);
    assert.equal(understood.audience_usage, "家庭煎烤用户");
    assert.match(understood.selling_facts, /适用电磁炉与烤箱/);
    assert.equal(understood.presentation_mode, presentationMode);
    assert.equal(await page.locator("#agentWizard_product_name, #agentWizard_audience_usage, #agentWizard_selling_facts").count(), 0);
    const imageCount = () => page.evaluate(() => serializeCanvasBoard().nodes.filter(node => node.kind === "image").length);
    const checkPreview = () => wizard.locator("[data-agent-wizard-source] img").evaluate(async image => {
      await image.decode();
      const frame = image.parentElement;
      const styles = getComputedStyle(image);
      const content = image.getBoundingClientRect();
      const bounds = frame.getBoundingClientRect();
      if (frame.clientWidth < 86 || frame.clientHeight < 86 || styles.objectFit !== "contain"
        || styles.objectPosition !== "50% 50%" || getComputedStyle(frame).overflow !== "hidden"
        || getComputedStyle(frame).borderTopWidth !== "0px" || styles.borderTopWidth !== "0px"
        || Math.abs(content.left + content.width / 2 - bounds.left - bounds.width / 2) > 1
        || Math.abs(content.top + content.height / 2 - bounds.top - bounds.height / 2) > 1) throw new Error("H3 原图预览尺寸或居中不正确");
      return image.naturalWidth / image.naturalHeight;
    });
    if (!explicitAttachment) {
      await action("next").click();
      assert.match(await page.locator("#canvasAgentStatus").innerText(), /真实图片/);
      const beforePick = await imageCount();
      const composeReferenceCount = await page.locator("#canvasAgentContext img").count();
      await action("canvas").click();
      const point = await pickPoint(prepared.sources[0]);
      await page.mouse.click(point.x, point.y);
      await wizard.locator('[data-agent-wizard-source="' + prepared.sources[0] + '"]').waitFor();
      assert.equal(await imageCount(), beforePick);
      assert.equal(await page.locator("#canvasAgentContext img").count(), composeReferenceCount);
      assert.equal(await page.locator("#canvasEditorScreen").evaluate(element => element.classList.contains("is-agent-canvas-picking")), false);
      assert.ok(await checkPreview() < 1);
      const preview = wizard.locator("[data-agent-wizard-source] img");
      const originalPreview = await preview.getAttribute("src");
      await preview.evaluate(image => {
        const landscape = document.createElement("canvas");
        landscape.width = 160; landscape.height = 64;
        landscape.getContext("2d").drawImage(image, 48, 0, 64, 64);
        image.src = landscape.toDataURL("image/png");
      });
      assert.equal(await checkPreview(), 2.5);
      await preview.evaluate((image, source) => { image.src = source; }, originalPreview);
      await action("next").click();
    }
    await step("main");
    await checkStep(positionOf(2));
    await selectNode(prepared.sources[1]);
    await action("selected").click();
    assert.equal(await checkPreview(), 1);
    if (!explicitAttachment) assert.deepEqual((await composerImages()).filter(id => id !== prepared.sources[1]), []);
    await action("next").click();
    await step("evidence");
    await checkStep(positionOf(3));
    if (!explicitAttachment) {
      const saved = await page.evaluate(() => serializeCanvasBoard());
      await page.reload({ waitUntil: "domcontentloaded" });
      await openBoard(saved);
      await page.evaluate(() => CanvasAgentUi.useSkill("h3-commerce-video"));
      await step("evidence");
    }
    assert.deepEqual(store.get(boardId).wizardDraft.sourceNodeIds, prepared.sources.slice(0, 2));
    await action("back").click();
    await wizard.locator('[data-agent-wizard-source="' + prepared.sources[1] + '"]').waitFor();
    await action("next").click();
    if (!reuseTarget && !repeatedSlot) {
      const broken = await page.evaluate(() => addCanvasImage("/output/h3-qa-broken.jpg", "无法解码的验收图", { x: -500, y: 500 }).dataset.id);
      await selectNode(broken);
      await action("selected").click();
      await wizard.getByText(/原图“无法解码的验收图”读取或解码失败/).waitFor();
      assert.deepEqual(store.get(boardId).wizardDraft.sourceNodeIds, prepared.sources);
    }
    if (repeatedSlot) {
      if (historySlot) {
        await page.evaluate(({ id, urls }) => {
          const source = ensureCanvasNodeMounted(id);
          const versions = urls.slice(1, 3).map((url, index) => ({ kind: "image", id: `h3-historical-${index}`, src: url, savedUrl: url }));
          FloraGenerationHistory.hydrate(source, versions, versions[1].id);
          applyCanvasGenerationHistoryItem(source, versions[1]);
          syncCanvasNodeModel(source);
          scheduleCanvasSave();
        }, { id: prepared.sources[1], urls: imageUrls });
      }
      await selectNode(prepared.sources[1]);
      await action("selected").click();
      if (!historySlot) expectedUrls = [imageUrls[0], imageUrls[1], imageUrls[1], imageUrls[3]];
    } else {
      await action("library").click();
      await page.getByRole("button", { name: "选用 验收同款图片" }).click();
      await page.locator("#canvasAssetLibraryPanel").waitFor({ state: "hidden" });
    }
    await wizard.locator("[data-agent-wizard-source]").waitFor();
    await checkPreview();
    await checkStep(positionOf(3));
    await action("next").click();
    await step("detail");
    await checkStep(positionOf(4), "生成方案");
    assert.equal(await action("next").isDisabled(), true);
    await page.locator("#canvasAgentH3SlotFileInput").setInputFiles(sampleImages[3]);
    await page.waitForFunction(() => document.querySelectorAll(".canvas-agent-wizard-images figure").length === 1);
    assert.equal(uploadCount, 1);
    await checkPreview();
    if (!explicitAttachment) assert.deepEqual(await composerImages(), []);
    const { values } = store.get(boardId).wizardDraft;
    expectedIds = [values.image_opening, values.image_main, values.image_evidence, values.image_detail];
    assert.deepEqual(expectedIds.slice(0, 2), prepared.sources.slice(0, 2));
    if (repeatedSlot) assert.equal(expectedIds[2], prepared.sources[1]);
    assert.equal(expectedIds.length, 4);
    for (const width of [390, 768, 1440, 1728]) {
      await page.setViewportSize({ width, height: 920 });
      assert.equal(await wizard.evaluate(element => element.scrollWidth <= element.clientWidth + 1), true, width + " px");
    }
    await page.setViewportSize({ width: 1440, height: 920 });
    if (repeatedSlot) await page.evaluate(() => clearCanvasSelection());
    else await selectNode(prepared.target);
    await action("next").evaluate(button => { button.click(); button.click(); });
    await page.waitForFunction(() => /已提交的商品资料与四图|已配置并保存/.test(document.querySelector("#canvasAgentMessages")?.textContent));
    if (!explicitAttachment) assert.deepEqual(await composerImages(), []);
    if (missingFact || invalidImage) {
      const expectedStep = missingFact ? "product" : "evidence";
      await step(expectedStep);
      await wizard.getByText(missingFact ? /请确认锅体是否适用烤箱/ : /图片显示了另一个款式/).waitFor();
      assert.equal(readReferences.size, 6);
      assert.equal(confirmedTurns, 0);
      const edited = store.get(boardId).wizardDraft;
      assert.equal(edited.status, "editing");
      for (const [key, value] of Object.entries(values)) {
        const expected = missingFact && key === "intake_fields" ? [...new Set([...value, "selling_facts"])]
          : invalidImage && ["image_evidence", "image_url_evidence"].includes(key) ? "" : value;
        assert.deepEqual(edited.values[key], expected, key);
      }
      assert.equal(paidCalls, 0);
      console.log(JSON.stringify({ ok: true, returnedTo: expectedStep, references: readReferences.size, paidCalls }));
      return;
    }
    await page.getByRole("button", { name: "确认方案并填入 H3 节点" }).click();
    await page.waitForFunction(() => /节点已配置并保存/.test(document.querySelector(".canvas-agent-wizard")?.textContent));
    if (!explicitAttachment) assert.deepEqual(await composerImages(), []);
    assert.equal(planningTurns, 1);
    assert.equal(repairTurns, repairReview ? 1 : 0);
    assert.equal(readReferences.size, 6);
    assert.equal(confirmedTurns, 1);
    assert.equal(packageSaveAttempts, reuseTarget ? 1 : 2);
    assert.equal(packageResponse.files.length, 4);
    if (historySlot) assert.deepEqual(packageResponse.image_references.slice(1, 3).map(ref => ref.result_id), ["h3-historical-0", "h3-historical-1"]);
    assert.equal(await page.locator('#canvasAgentMessages a[href*="h3-commerce-package"]').count(), 4);
    const result = nodes.get(targetId);
    assert.equal(result.h3CommercePromptA, promptA);
    assert.equal(result.h3CommercePromptB, promptB);
    assert.deepEqual(result.h3CommerceImages.map(image => image.url || image.savedUrl), expectedUrls);
    assert.deepEqual([...edges.values()].filter(edge => edge.to === targetId).sort((a, b) => a.toPort.localeCompare(b.toPort))
      .map(edge => [edge.toPort, edge.from]), expectedIds.map((id, index) => ["h3-commerce:" + index, id]));
    assert.equal([...nodes.values()].filter(node => node.kind === "minimax-h3" && node.minimaxH3Model === "h3-commerce").length, 1);
    if (!reuseTarget) {
      assert.equal(nodes.get(prepared.target).minimaxH3Model, "minimax-h3");
      assert.equal(nodes.get(prepared.target).minimaxH3Prompt, "原节点参数");
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await openBoard(snapshot());
    await selectNode(targetId);
    const restored = await page.evaluate(id => serializeCanvasNode(ensureCanvasNodeMounted(id)), targetId);
    assert.equal(restored.h3CommercePromptA, promptA);
    assert.deepEqual(restored.h3CommerceImages, result.h3CommerceImages);
    assert.deepEqual(await page.evaluate(id => serializeCanvasBoard().connections.filter(edge => edge.to === id)
      .sort((a, b) => a.toPort.localeCompare(b.toPort)).map(edge => [edge.toPort, edge.from]), targetId),
    expectedIds.map((id, index) => ["h3-commerce:" + index, id]));
    const inputAnchors = await page.evaluate(id => [0, 1, 2, 3].map(slot => getCanvasConnectionPortPoint(id, "h3-commerce:" + slot)), targetId);
    assert.ok(inputAnchors[0]);
    assert.ok(inputAnchors.every(anchor => JSON.stringify(anchor) === JSON.stringify(inputAnchors[0])));
    assert.equal(paidCalls, 0);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, reuseTarget, repeatedSlot, historySlot, presentationMode, explicitAttachment, repairTurns, packageSaveAttempts, planningTurns, confirmedTurns, references: readReferences.size, files: packageResponse.files.map(file => file.name), restored: expectedIds.length, paidCalls, scratch }));
  } catch (error) {
    console.error(await page.locator("#canvasAgentMessages").innerText({ timeout: 1000 }).catch(() => ""), errors);
    console.error(await page.locator(".canvas-agent-tool-step.is-error .canvas-agent-tool-detail").allTextContents());
    console.error(await page.locator("#canvasAgentStatus").textContent(), store.get(boardId).wizardDraft, JSON.stringify(turnEvents));
    throw error;
  } finally {
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
