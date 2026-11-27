const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { chromium } = require("playwright");
const { createImageGenerationService } = require("../host-sources/app/image-generation-service");

const origin = "http://127.0.0.1:33200";
const boardId = "photo-inventory-isolated";
const skillId = "natural-aesthetic-product-photography";
const conversationId = "photo-inventory-isolated-session";
const autoConfirm = process.argv.includes("--auto-confirm");
const photoOnly = autoConfirm || process.argv.includes("--photo-only");
const replaceProductMember = process.argv.includes("--replace-product-member");
const replaceProduct = replaceProductMember || process.argv.includes("--replace-product");
const confirmPhotography = photoOnly || replaceProduct || process.argv.includes("--confirm");
const artDirection = confirmPhotography || process.argv.includes("--art-direction");
const retryPhotography = artDirection && process.argv.includes("--retry");
const retryRejection = "隔离验收：图片请求已明确拒绝";
const creativeFixture = process.argv.includes("--creative") || artDirection ? require("./test-fixtures/natural-photo-t16-directions.json") : null;
const oldDirections = artDirection ? require("./test-fixtures/natural-photo-art-directions.json") : creativeFixture?.creativeDirections;
const directions = photoOnly ? {
  ...oldDirections, reason: "斜向布光同时保留透明壳边、背部圆环和镜头组。",
  options: oldDirections.options.map((option, index) => ({
    ...option, color: ["低饱和蓝灰，保留透明壳原色", "浅暖赭色与原壳中性灰分开", "墨灰背景衬托透明壳边"][index],
    use: "商务人群的产品传播", reason: ["让侧逆光描清透明壳缘", "用窄光引向镜头区域", "用暗背景分离背部圆环边界"][index],
    featureIndices: [[1, 3], [2, 3], [1, 2]][index],
    placement: "保持原图镜头装配与可见面，背面向上放在连续表面。",
  })),
} : oldDirections;
const productUrl = creativeFixture ? "/output/qa-t16-original.jpg" : "/output/qa-inventory-perfume.svg";
const svg = shapes => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="430"><rect width="640" height="430" fill="#e6e0d7"/>${shapes}</svg>`);
const perfumeImage = svg('<rect x="170" y="122" width="147" height="205" rx="12" fill="#c08d48" stroke="#8f6534" stroke-width="6"/><rect x="213" y="74" width="62" height="54" rx="6" fill="#32353b"/><rect x="208" y="198" width="70" height="66" rx="2" fill="#eddfc2"/><rect x="360" y="86" width="130" height="243" fill="#545755"/><text x="382" y="232" fill="#eee6cd" font-family="sans-serif" font-size="21">CEDAR</text>');
const t16Image = creativeFixture && fs.readFileSync(path.resolve(__dirname, "../AI-OS-Portable-1.0.5-win-x64/data/output",
  photoOnly ? "1600_04_1795418544212_bb3082d5.jpg" : "1600_09_1795172533250_5a0b1914.jpg"));
const media = new Map([[productUrl, t16Image || perfumeImage]]);
const replacementUrl = "/output/qa-replacement-product.svg";
const alternateUrl = "/output/qa-alternate-product.svg";
if (replaceProduct) {
  media.set(replacementUrl, perfumeImage);
  media.set(alternateUrl, svg('<circle cx="320" cy="215" r="128" fill="#4c6875"/>'));
}
const sha = value => createHash("sha256").update(value).digest("hex");

function inventory(nodeId) {
  return [{
    nodeId,
    subjectInventory: {
      targetObjects: [{ id: "bottle", name: "香水瓶", count: 1, appearance: "可见琥珀色液体", color: "琥珀色",
        material: null, structure: "矩形瓶身", markings: "" }],
      components: [{ id: "cap", name: "原装瓶盖", count: 1, appearance: "深色盖顶", color: "黑灰",
        material: null, structure: "短矩形盖", markings: "" }],
      accessories: [],
      packaging: [{ id: "box", name: "原包装盒", count: 1, appearance: "深灰外盒", color: "深灰",
        material: null, structure: "纵向长方体", markings: "CEDAR" }],
      props: [],
      relationships: [
        { id: "fit", from: "cap", to: "bottle", kind: "attached", detail: "盖扣合在瓶颈上" },
        { id: "pair", from: "box", to: "bottle", kind: "paired-with", detail: "原盒作为配套包装" },
      ],
      unknowns: [{ targetId: "bottle", field: "internal", detail: "瓶盖内部和喷头不可见", required: false }],
    },
    mustPreserve: [{ targetId: "box", aspect: "markings" }],
    allowedTransformations: ["placement", "camera", "arrangement", "scale", "lighting"],
    prohibitedChanges: [{ targetId: "fit", action: "detach" }, { targetId: "box", action: "relabel" }],
  }];
}

async function check() {
  const browser = await chromium.launch({
    headless: true, executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    const packets = [];
    const operations = [];
    const failedJobs = new Map();
    const errors = [];
    let savedConversation;
    page.on("pageerror", error => errors.push(error.message));
    await page.routeWebSocket("**/*", socket => socket.close());
    await page.route("**/*", async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin) return route.abort();
      if (media.has(url.pathname)) return route.fulfill({ body: media.get(url.pathname),
        contentType: creativeFixture && url.pathname === productUrl ? "image/jpeg" : "image/svg+xml" });
      if (url.pathname === "/canvas-agent-ui.js") {
        const response = await route.fetch();
        assert.equal(response.headers()["x-ai-os-frontend"], "fixed-stage");
        const script = process.env.QA_PHOTO_AGENT_SOURCE
          ? fs.readFileSync(path.resolve(__dirname, "../host-sources/app/canvas-agent-ui.js"), "utf8")
          : await response.text();
        const end = script.lastIndexOf("})();");
        const exposed = `
          window.qaPhoto = {
            activate(boardId, conversationId) {
              state.activeBoardId = boardId;
              state.conversation = { ...CanvasAgentConversation.create(boardId), conversationId, activeSkillId: NATURAL_PHOTO_SKILL_ID };
              state.activeSkillId = NATURAL_PHOTO_SKILL_ID;
              state.skills = [{ id: NATURAL_PHOTO_SKILL_ID, label: "自然美学产品摄影" }];
              state.skillCatalogLoaded = true;
              setCanvasAgentOpen(true, false);
            },
            addPhotoMention, getPhotoMentions, setPhotoMentions, readLivePhotoMentions, collectCanvasAgentVisionImages, renderCanvasAgentDesignBrief,
            getActiveSkill, renderCanvasAgentWizard,
            showCandidateBrief(pending) {
              setCanvasAgentSessionConversation({ ...state.conversation, pendingWorkflow: pending }, { active: true });
              state.pendingDesignBrief = pending;
              renderCanvasAgentDesignBrief(pending);
            },
            fingerprint: getPhotoFingerprint,
            getPendingBriefForTest: () => state.pendingDesignBrief,
            async checkBriefRepairStatus(pending, references, scenario) {
              const run = { id: "canvas_agent_1_test", boardId: state.activeBoardId, conversationId: state.conversation.conversationId,
                status: "running", wizardTaskId: "qa-detached", step: 1, maxSteps: 4, toolCallsUsed: 1, maxToolCalls: 4,
                photoSources: references, workflowSourceNodeIds: pending.sourceNodeIds, workflowSourceFingerprint: pending.sourceFingerprint };
              state.currentRun = run;
              const initial = state.conversation;
              const call = { name: "request_design_brief", call_id: "first-brief", arguments: {} };
              const failure = { ok: false, tool: call.name, code: "photo_brief_schema",
                field: "known_context.creativeDirections.options[0].featureIndices",
                error: "known_context.creativeDirections.options[0].featureIndices：请关联 1–3 项实际用于本方向的产品视觉特征。" };
              const original = continueCanvasAgentWithToolOutputs;
              const originalParameters = resolveCanvasAgentGenerationParameters;
              const originalGate = gateNaturalPhotographyToolCall;
              const statuses = () => Array.from(document.querySelectorAll("#canvasAgentMessages [data-tool-name='request_design_brief'] .canvas-agent-tool-status"), label => label.textContent);
              const submitBrief = async call => {
                addCanvasAgentToolStep(call);
                const output = { ok: true, tool: call.name, kind: "design_brief", decision_required: true, workflow: pending.workflow,
                  skill_id: pending.skillId, known_context: pending.analysis, summary: pending.proposal, image_prompt: pending.imagePrompt,
                  source_node_ids: pending.sourceNodeIds, source_fingerprint: pending.sourceFingerprint };
                persistCanvasAgentToolResult(call, output, run.id);
                await showCanvasAgentDesignBrief(output, run.id, call.call_id);
              };
              let retryStatus, retryDetail, afterRender, duplicateCode, calls = 0, validations = 0;
              resolveCanvasAgentGenerationParameters = async () => pending.parameters;
              continueCanvasAgentWithToolOutputs = async () => {
                calls++;
                retryStatus = statuses()[0];
                retryDetail = document.querySelector("#canvasAgentMessages [data-tool-name='request_design_brief'] .canvas-agent-tool-detail").textContent;
                renderCanvasAgentConversation();
                afterRender = statuses()[0];
                if (scenario === "failure") await failNaturalPhotoBriefRepair(run, failure.error);
                else await submitBrief({ ...call, call_id: "repaired-brief" });
              };
              try {
                if (scenario === "normal") {
                  await submitBrief(call);
                } else {
                  gateNaturalPhotographyToolCall = async () => {
                    validations++;
                    throw Object.assign(new Error(failure.error), { code: failure.code, field: failure.field });
                  };
                  const outputs = await executeCanvasAgentCallBatch([call, call, { ...call, call_id: "duplicate-brief" }], run.id);
                  duplicateCode = outputs[1]?.output.code;
                  await repairNaturalPhotoBrief(run, outputs[0].output, outputs, "response-1");
                }
                const live = statuses();
                const cards = document.querySelectorAll("#canvasAgentMessages .canvas-agent-brief").length;
                const persisted = await fetch("/api/canvas-agent/conversation").then(response => response.json());
                setCanvasAgentSessionConversation(persisted, { active: true, fromServer: true });
                renderCanvasAgentConversation();
                const restored = statuses();
                if (scenario !== "failure") await persistCanvasAgentPendingWorkflow({ ...persisted.pendingWorkflow, status: "confirmed" }, run.conversationId);
                return { retryStatus, retryDetail, afterRender, calls, validations, duplicateCode, cards, live, restored, afterConfirm: statuses() };
              } finally {
                continueCanvasAgentWithToolOutputs = original;
                resolveCanvasAgentGenerationParameters = originalParameters;
                gateNaturalPhotographyToolCall = originalGate;
                state.completedToolOutputs.clear();
                state.currentRun = null;
                state.pendingDesignBrief = null;
                await state.conversationSaveChain;
                setCanvasAgentSessionConversation({ ...initial, revision: state.conversation.revision }, { active: true });
                await saveCanvasAgentConversation();
                renderCanvasAgentConversation();
              }
            },
            setFixtureWizard(ids) {
              state.wizardOverrides.set(NATURAL_PHOTO_SKILL_ID, {
                title: "测试素材", version: 1, steps: [{ id: "materials", kind: "image", title: "产品参考图" },
                  { id: "proposal", kind: "proposal", title: "确认生成方案" }],
              });
              state.conversation.wizardDraft = { boardId: state.activeBoardId, skillId: NATURAL_PHOTO_SKILL_ID,
                taskId: "photo-qa-layout", step: 0, status: "collecting", sourceNodeIds: ids, values: {}, parameters: {} };
              renderCanvasAgentWizard();
            },
          };
        `;
        return route.fulfill({ response, body: script.slice(0, end) + exposed + script.slice(end) });
      }
      if (url.pathname === "/api/canvas-agent/skills") {
        return route.fulfill({ json: { skills: [{ id: skillId, label: "自然美学产品摄影" }], configured: true } });
      }
      if (url.pathname === "/api/canvas-agent/conversation") {
        if (creativeFixture && request.method() === "POST") {
          const { conversation } = request.postDataJSON();
          savedConversation = { ...conversation, revision: (savedConversation?.revision || 0) + 1 };
        }
        if (creativeFixture && savedConversation) return route.fulfill({ json: savedConversation });
        return route.fulfill({ json: { boardId, conversationId, activeSkillId: skillId, items: [],
          activeConversationId: conversationId, sessions: [] } });
      }
      if (url.pathname === "/api/image-jobs" && request.method() === "POST") {
        const packet = request.postDataJSON();
        packets.push(packet);
        if (retryPhotography) {
          const id = `qa-photo-failed-${packets.length}`;
          failedJobs.set(id, { boardId: packet.board_id, nodeId: packet.node_id });
          return route.fulfill({ status: 202, json: { job: { id, state: "running", ...failedJobs.get(id) } } });
        }
        if (replaceProduct) return route.fulfill({ status: 422, json: { error: "隔离接口已拒绝生图任务" } });
        return route.fulfill({ status: 503, json: { error: "隔离接口拦截" } });
      }
      if (confirmPhotography && url.pathname.endsWith("/operations") && request.method() === "POST") {
        const batch = request.postDataJSON().operations;
        operations.push(...batch);
        return route.fulfill({ json: { success: true, boardRevision: operations.length,
          results: batch.map(({ operationId, entityId }) => ({
            operationId, entityId, status: "applied", entityRevision: operations.length,
          })),
        } });
      }
      if (retryPhotography && request.method() === "GET" && /^\/api\/image-jobs\/qa-photo-failed-\d+$/.test(url.pathname)) {
        const id = url.pathname.split("/").at(-1);
        return route.fulfill({ json: { job: { id, state: "failed", error: retryRejection, code: "generation_failed", ...failedJobs.get(id) } } });
      }
      if (url.pathname.startsWith("/api/")) return route.fulfill({ json: {
        authenticated: false, boards: [], projects: [], models: [], providers: [], settings: {}, success: true,
      } });
      return route.continue();
    });
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    page.setDefaultTimeout(10000);
    await page.evaluate(async ({ boardId, conversationId, productUrl, creative }) => {
      await AiOsModuleLoader.ensure(["canvas-runtime", "canvas-node-generator", "canvas-agent-ui", "canvas-assets"]);
      canvasState.activeBoardId = boardId;
      canvasState.activeBoardPersisted = true;
      canvasState.isRestoring = true;
      const surface = document.createElement("div");
      surface.id = "neonEngineSurface";
      surface.style.cssText = "position:fixed;inset:0;z-index:2147483000";
      document.body.append(surface);
      const view = document.querySelector("#canvasView");
      surface.append(view);
      view.hidden = false;
      view.classList.add("active");
      document.querySelector("#canvasEditorScreen").hidden = false;
      document.body.classList.add("canvas-surface-open");
      showCanvasEditor();
      qaPhoto.activate(boardId, conversationId);
      const product = addCanvasImage(productUrl, creative ? "1600_09.jpg · 隔离原图" : "香水与包装 · 隔离样例", { x: 100, y: 130 });
      if (!qaPhoto.addPhotoMention(product)) throw new Error("样例原图未绑定");
    }, { boardId, conversationId, productUrl, creative: Boolean(creativeFixture) });
    await page.locator("#canvasAgentContextAdd").click();
    assert.equal(await page.locator('[data-agent-attachment="photo-style"], [data-agent-attachment="photo-canvas-style"]').count(), 0);
    await page.locator("#canvasAgentContextAdd").click();
    const attachments = page.locator("#canvasAgentContext");
    assert.equal(await attachments.locator(".canvas-agent-context-preview img").count(), 1);
    await attachments.locator(".canvas-agent-context-preview").first().waitFor({ state: "visible" });
    const thumbnailLayout = await attachments.locator(".canvas-agent-context-preview img").evaluateAll(images => images.map(img => {
      const box = img.parentElement.getBoundingClientRect(), image = img.getBoundingClientRect();
      const css = getComputedStyle(img);
      return { box: [box.width, box.height], image: [image.width, image.height],
        offset: [image.x - box.x, image.y - box.y], fit: css.objectFit, position: css.objectPosition };
    }));
    assert.ok(thumbnailLayout.every(({ box, image, offset, fit, position }) => box[0] > 0 && fit === "contain"
      && position === "50% 50%" && image.every((size, i) => Math.abs(size + 2 * offset[i] - box[i]) < 1)), JSON.stringify(thumbnailLayout));
    assert.equal(await attachments.getByRole("combobox", { name: /素材角色/ }).inputValue(), "");
    assert.doesNotMatch(await page.locator("#canvasAgentPrompt").inputValue(), /@图/);
    const material = await page.evaluate(async () => {
      const { references, materials } = await qaPhoto.readLivePhotoMentions();
      const attachments = await qaPhoto.collectCanvasAgentVisionImages([], null, { photoSources: references }, materials);
      return { references, attachments };
    });
    assert.deepEqual(material.references.map(item => [item.url, item.role, item.sha256]), [
      [productUrl, "product", sha(media.get(productUrl))],
    ]);
    assert.equal(material.attachments.length, 1);
    assert.match(material.attachments[0], /^data:image\//);
    if (creativeFixture) {
      const shown = await page.evaluate(async ({ fixture, directions, artDirection, photoOnly, references, boardId, conversationId, skillId }) => {
        const photo = CanvasAgentConversation.naturalPhotoFidelity;
        const nodeId = references[0].nodeId;
        const raw = { version: 2, analysis: "使用同一 T16 原图、对象清单和固定参数。", references,
          images: [{ nodeId, subjectInventory: fixture.subjectInventory }], creativeDirections: directions };
        if (photoOnly) {
          raw.analysis = "浅灰透明壳边、背部圆环与短竖条、镜头区及实物标识构成此款的视觉特征。";
          raw.images[0].subjectInventory = { targetObjects: [{
            id: "case", name: "透明手机壳", count: 1, appearance: "中性灰透明壳边，背部灰色圆环与短竖条",
            structure: "保持原图中手机与壳体组合、镜头开孔及可见状态", markings: "壳边原有 NILLKIN 标识",
          }] };
          raw.visualFeatures = [["中性灰透明壳边", "用侧逆光表现厚薄"], ["背部圆环及短竖条", "保持背板图形及间距"],
            ["镜头开孔与实物标识", "焦平面覆盖该区域"]].map(([observation, importance]) => ({ nodeId, targetId: "case", observation, importance }));
        }
        const brief = photo.readBrief(JSON.stringify(raw), [nodeId], null, references, { modelSubmission: true, requireCreativeComparison: true, artDirection, photoOnly });
        const selected = photo.selectCreativeDirection(brief, directions.recommendedId);
        const pending = { boardId, conversationId, workflow: skillId, skillId, workflowId: "t16-isolated-photo", status: "awaiting-confirmation",
          executionTarget: "image", executionChoice: "create_manually", sourceNodeIds: [nodeId],
          sourceFingerprint: await qaPhoto.fingerprint(references), questions: [], analysis: JSON.stringify(brief),
          imagePrompt: selected.creative, proposal: selected.summary, parameters: { model: "gpt-image-2", size: "16:9", resolution: "1" } };
        qaPhoto.showCandidateBrief(pending);
        return { fingerprint: pending.sourceFingerprint, images: brief.images };
      }, { fixture: creativeFixture, directions, artDirection, photoOnly, references: material.references, boardId, conversationId, skillId });
      assert.match(shown.fingerprint, /^[a-f0-9]{64}$/);
      if (photoOnly && !autoConfirm) {
        const statusResults = await page.evaluate(async references => {
          const pending = qaPhoto.getPendingBriefForTest();
          const results = {};
          for (const scenario of ["normal", "recovered", "failure"]) {
            results[scenario] = await qaPhoto.checkBriefRepairStatus(pending, references, scenario);
          }
          qaPhoto.showCandidateBrief(pending);
          return results;
        }, material.references);
        const { normal, recovered, failure } = statusResults;
        assert.deepEqual(normal.live, ["等待确认"]);
        assert.deepEqual(normal.restored, normal.live);
        assert.deepEqual(normal.afterConfirm, ["已完成"]);
        assert.equal(normal.cards, 1);
        assert.equal(normal.calls, 0);
        assert.equal(recovered.retryStatus, "正在重试");
        assert.equal(recovered.afterRender, "正在重试");
        assert.match(recovered.retryDetail, /featureIndices/u);
        assert.deepEqual(recovered.live, ["已恢复", "等待确认"]);
        assert.deepEqual(recovered.restored, recovered.live);
        assert.equal(recovered.calls, 1);
        assert.equal(recovered.validations, 1);
        assert.equal(recovered.duplicateCode, "photo_brief_duplicate");
        assert.equal(recovered.cards, 1);
        assert.deepEqual(failure.live, ["失败"]);
        assert.deepEqual(failure.restored, failure.live);
        assert.equal(failure.calls, 1);
        assert.equal(failure.cards, 0);
        assert.equal(operations.length, 0);
        assert.equal(packets.length, 0);
      }
      const card = page.getByRole("article", { name: "自然美学摄影方案确认" });
      await card.getByText(`${directions.options.find(item => item.id === directions.recommendedId).name} · 已选`, { exact: true }).waitFor();
      for (const option of directions.options.filter(item => item.id !== directions.recommendedId)) {
        const { id } = option;
        const choose = card.locator(`[data-agent-photo-direction="${id}"]`);
        await choose.locator("..").locator("summary").click();
        if (artDirection) await card.getByText(`${option.references[0].id} · ${option.references[0].borrow}（作品文字观察）`, { exact: false }).waitFor();
        await choose.click();
        await card.getByText(`${option.name} · 已选`, { exact: true }).waitFor();
        const snapshot = savedConversation.pendingWorkflow;
        assert.equal(JSON.parse(snapshot.analysis).creativeDirections.selectedId, id);
        assert.deepEqual(JSON.parse(snapshot.analysis).images, shown.images);
        assert.equal(snapshot.sourceFingerprint, shown.fingerprint);
        assert.equal(snapshot.parameters.size, "16:9");
        assert.ok(snapshot.imagePrompt.includes(option.scene) && snapshot.imagePrompt.includes(option.light));
      }
      const locked = await page.evaluate(snapshot => {
        const photo = CanvasAgentConversation.naturalPhotoFidelity;
        const recovered = CanvasAgentConversation.normalize({ boardId: snapshot.boardId, conversationId: snapshot.conversationId, pendingWorkflow: snapshot }, snapshot.boardId).pendingWorkflow;
        qaPhoto.showCandidateBrief(recovered);
        const brief = photo.readBrief(recovered.analysis, recovered.sourceNodeIds);
        return photo.readNodeLock(JSON.stringify(photo.nodeLock(brief.images, brief.references, recovered.imagePrompt, { compact: true })));
      }, savedConversation.pendingWorkflow);
      assert.equal(locked.mentions[0].sha256, sha(t16Image));
      if (photoOnly) {
        assert.match(locked.prompt, /【产品视觉特征】[\s\S]+【纯摄影交付】[\s\S]+No typography/u);
        assert.doesNotMatch(locked.prompt, /产品海报|标题安全区|REF-\d/u);
        await card.getByText("产品视觉特征", { exact: true }).waitFor();
        const output = path.resolve(__dirname, "../.design/natural-photo-output-20261123");
        fs.mkdirSync(output, { recursive: true });
        for (const width of [390, 768, 1440, 1728]) {
          await page.setViewportSize({ width, height: 1050 });
          await card.screenshot({ path: path.join(output, `photo-confirmation-${width}.png`) });
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        }
        await page.setViewportSize({ width: 1440, height: 1050 });
      } else if (artDirection) {
        assert.match(locked.prompt, /^【产品依据】\n@图1[^\n]*\n\n【艺术指导】[\s\S]+【构图与空间】[\s\S]+【光色与镜头】/);
        assert.doesNotMatch(locked.prompt, /产品保护|侧边长圆孔|REF-\d/u);
      } else {
        assert.match(locked.prompt, /【创意设计】[\s\S]+【摄影执行】[\s\S]+【产品保护】/);
      }
      assert.equal(packets.length, 0);
      assert.deepEqual(errors, []);
      if (confirmPhotography) {
        const sourceId = material.references[0].nodeId;
        assert.equal(material.references[0].assetId, "");
        const checkpoint = savedConversation.pendingWorkflow;
        await page.evaluate(({ sourceId, checkpoint }) => {
          const source = ensureCanvasNodeMounted(sourceId);
          source.dataset.assetId = "registered-after-plan";
          syncCanvasNodeModel(source);
          canvasState.isRestoring = false;
          const candidate = { id: "gpt-image-2", modelId: "gpt-image-2", providerId: "qa-apimart",
            displayName: "gpt-image-2", platform: "openai", family: "gpt-image-2", enabled: true,
            hasApiKey: true, hasBaseUrl: true, capabilities: ["image.generate", "image.edit"], resolutions: ["1", "2", "4"] };
          canvasImageModelCandidates = [candidate];
          imageModelCatalog = [candidate];
          imageModelInput.add(new Option(candidate.displayName, candidate.id));
          imageModelInput.value = candidate.id;
          imageModelInput.dataset.modelSelection = "exact";
          canvasImageModelsSettingsDirty = false;
          IMAGE_MODEL_PLATFORMS[candidate.id] = "openai";
          IMAGE_MODEL_FAMILIES[candidate.id] = "gpt-image-2";
          IMAGE_MODEL_RESOLUTIONS[candidate.id] = ["1", "2", "4"];
          qaPhoto.showCandidateBrief(checkpoint);
        }, { sourceId, checkpoint });
        await page.evaluate(async references => {
          const fingerprint = await qaPhoto.fingerprint(references);
          const mismatchedAssetId = references.map(ref => ({ ...ref, assetId: "another-registered-asset" }));
          if (!fingerprint || await qaPhoto.fingerprint(mismatchedAssetId)) {
            throw new Error("摄影素材应兼容后登记，同时拒绝已登记 ID 不匹配的清单");
          }
        }, material.references);
        media.set(productUrl, Buffer.concat([t16Image, Buffer.from("changed")]));
        try {
          assert.equal(await page.evaluate(refs => qaPhoto.fingerprint(refs), material.references), "",
            "同一 URL 返回不同文件内容时必须拒绝确认");
        } finally {
          media.set(productUrl, t16Image);
        }
        if (autoConfirm) {
          const request = page.waitForRequest(candidate => new URL(candidate.url()).pathname === "/api/image-jobs"
            && candidate.method() === "POST", { timeout: 8000 });
          await card.getByRole("button", { name: "创建并生成 1 张（付费）", exact: true }).click();
          await request.catch(async error => {
            throw new Error(`摄影确认后未发起拦截测试请求：${await page.locator("#canvasAgentStatus").textContent()}`, { cause: error });
          });
          await page.getByText(/生成失败|生成状态待确认/).first().waitFor();
          assert.equal(packets.length, 1);
          assert.match(packets[0].prompt, /No typography, no text overlay/u);
          assert.equal(packets[0].reference_images[0].sha256, sha(t16Image));
          assert.ok(savedConversation.pendingWorkflow.outputNodeId);
          assert.equal(savedConversation.pendingWorkflow.executionChoice, "create_and_generate");
          assert.deepEqual(errors, []);
          console.log("固定 33200：摄影确认后只提交一次生成请求，真实原图指纹一致。该请求由隔离接口拦截。");
          return;
        }
        await card.getByRole("button", { name: "仅创建节点", exact: true }).click();
        await page.waitForFunction(() => /待手动生成|当前 @ 素材已变化|未能保存|未创建生成节点/
          .test(document.querySelector("#canvasAgentStatus").textContent));
        const status = await page.locator("#canvasAgentStatus").textContent();
        assert.equal(status, "待手动生成");
        assert.equal(await card.count(), 0);
        const nodeId = savedConversation.pendingWorkflow.outputNodeId;
        assert.equal(savedConversation.pendingWorkflow.status, "workflow-created");
        const creation = await page.evaluate(({ sourceId, nodeId }) => {
          const node = ensureCanvasNodeMounted(nodeId);
          const lock = CanvasAgentConversation.naturalPhotoFidelity.readNodeLock(node.dataset.photoFidelity);
          return {
            links: canvasState.connections.filter(edge => edge.from === sourceId && edge.to === nodeId).length,
            model: lock.model,
            providerId: lock.providerId,
            sha256: lock.sources[0].sha256,
            prompt: node.querySelector(".canvas-node-prompt").value === lock.prompt,
            generated: Boolean(getCanvasNodeOutput(node)?.url),
          };
        }, { sourceId, nodeId });
        assert.deepEqual(creation, { links: 1, model: "gpt-image-2", providerId: "qa-apimart",
          sha256: sha(t16Image), prompt: true, generated: false });
        assert.ok(operations.some(operation => operation.type === "node.upsert" && operation.entityId === nodeId));
        assert.ok(operations.some(operation => operation.type === "connection.upsert"
          && operation.after?.from === sourceId && operation.after?.to === nodeId));
        assert.equal(packets.length, 0);
        assert.deepEqual(errors, []);
        if (photoOnly) {
          const restored = await page.evaluate(async ({ nodeId }) => {
            const board = JSON.parse(JSON.stringify(serializeCanvasBoard()));
            restoreCanvasBoard(board);
            const node = ensureCanvasNodeMounted(nodeId);
            const lock = CanvasAgentConversation.naturalPhotoFidelity.readNodeLock(node.dataset.photoFidelity);
            const ownPrompt = node.querySelector(".canvas-node-prompt").value;
            const incoming = getCanvasIncomingRefs(nodeId);
            const refs = getCanvasPromptImageRequest(node, ownPrompt, incoming).refs;
            try {
              await createCanvasImageJob({
                n: 1, model: lock.model, provider_id: lock.providerId, prompt: ownPrompt, reference_images: refs,
              }, node);
            } catch (error) {
              if (!error.message.includes("隔离接口拦截")) throw error;
            }
            const record = serializeCanvasBoard().nodes.find(item => item.id === nodeId);
            return { prompt: ownPrompt, model: record.model, size: record.size, resolution: record.resolution };
          }, { nodeId });
          assert.equal(packets.length, 1);
          assert.match(packets[0].prompt, /No typography, no text overlay/u);
          assert.equal(packets[0].prompt, restored.prompt);
          assert.equal(packets[0].reference_images[0].sha256, sha(t16Image));
          assert.equal(packets[0].model, restored.model);
          assert.equal(restored.resolution, "1");
          assert.deepEqual(errors, []);
          console.log("固定 33200：白色透明手机壳，三案比较、产品特征、原图和参数回读、纯摄影请求封包通过。生成请求全部拦截。");
          return;
        }
        if (replaceProduct) {
          await page.locator("#canvasAgentClose").click();
          const generator = page.locator(`.canvas-node[data-id="${nodeId}"]`);
          const selectGenerator = id => {
            const node = ensureCanvasNodeMounted(id);
            applyAgentCanvasFocusTransform({
              scale: 0.75,
              x: innerWidth / 2 - (Number(node.dataset.x) + node.offsetWidth / 2) * 0.75,
              y: 100 - Number(node.dataset.y) * 0.75,
            });
            selectCanvasNode(node);
          };
          await page.evaluate(selectGenerator, nodeId);
          const composer = generator.locator(".flora-generator-composer:visible");
          const chip = composer.locator(".flora-prompt-mention-chip").first();
          const run = composer.getByRole("button", { name: "生成图片", exact: true });
          await chip.locator("img").waitFor();
          assert.equal(await chip.locator("img").getAttribute("src"), productUrl);
          const assertImageRequest = async (button, sourceUrl, bytes) => {
            const request = page.waitForRequest(request => new URL(request.url()).pathname === "/api/image-jobs"
              && request.method() === "POST", { timeout: 7000 });
            await button.click();
            const response = await request.catch(async error => {
              const status = await button.evaluate((control) => control.closest(".canvas-node")
                .querySelector(".canvas-node-status")?.textContent);
              throw new Error(`Missing image request for ${sourceUrl}: ${status || error.message}`);
            });
            const packet = response.postDataJSON();
            assert.deepEqual(packet.reference_images.map(item => [item.url, item.sha256]), [[sourceUrl, sha(bytes)]]);
            await page.waitForFunction(nodeId => ensureCanvasNodeMounted(nodeId)?.dataset.photoSubmissionInFlight !== "true",
              packet.node_id);
            return packet;
          };
          const originalPacket = await assertImageRequest(run, productUrl, t16Image);
          const { replacementId, alternateId } = await page.evaluate(({ nodeId, replacementUrl, alternateUrl, replaceProductMember }) => {
            const point = { x: 120, y: 450 };
            const source = replaceProductMember ? addCanvasAssetCollection(point, {
              mode: "single",
              members: [{ id: "qa-member", kind: "image", src: replacementUrl, savedUrl: replacementUrl, name: "更换后的商品图" }],
            }) : addCanvasImage(replacementUrl, "更换后的商品图", point);
            const alternate = addCanvasImage(alternateUrl, "额外参考图", { x: 120, y: 750 });
            connectCanvasNodes(source.dataset.id, nodeId);
            connectCanvasNodes(alternate.dataset.id, nodeId);
            selectCanvasNode(ensureCanvasNodeMounted(nodeId));
            return { replacementId: source.dataset.id, alternateId: alternate.dataset.id };
          }, { nodeId, replacementUrl, alternateUrl, replaceProductMember });
          await composer.locator(".flora-reference-remove").first().click();
          const warning = composer.locator(".flora-prompt-mention-warning:visible");
          await warning.waitFor();
          assert.match(await warning.innerText(), /@图1.*替换素材不明确/);
          await run.click();
          assert.equal(await composer.locator(".flora-generator-status:visible").count(), 0);
          assert.equal(packets.length, 1);
          await page.evaluate(({ alternateId, nodeId }) => disconnectCanvasNodes(alternateId, nodeId), { alternateId, nodeId });
          if (replaceProductMember) {
            await page.evaluate(({ nodeId, replacementId, replacementUrl }) => {
              const node = ensureCanvasNodeMounted(nodeId);
              const selected = resolveCanvasPromptImage(node, { sourceNodeId: replacementId, sourcePort: "member-output:qa-member", url: replacementUrl });
              if (!selected) throw new Error("未能恢复成员引用");
              setCanvasPromptMentions(node, readCanvasPromptMentions(node).map(({ label, offset }) => ({
                ...selected, type: "image", label, offset, requiresConnection: true,
              })));
              updateCanvasNodeRefs(node);
            }, { nodeId, replacementId, replacementUrl });
          }
          assert.equal(await chip.locator("img").getAttribute("src"), replacementUrl, "@图1 应跟随替换后的原图");
          assert.equal(await warning.count(), 0);
          const replacementPacket = await assertImageRequest(run, replacementUrl, perfumeImage);
          assert.deepEqual(replacementPacket, { ...originalPacket, reference_images: replacementPacket.reference_images });
          assert.equal(replacementPacket.node_id, nodeId);
          assert.equal(packets.length, 2);
          await page.evaluate(id => {
            const saved = JSON.parse(JSON.stringify(serializeCanvasBoard()));
            restoreCanvasBoard(saved);
            selectCanvasNode(ensureCanvasNodeMounted(id));
          }, nodeId);
          await page.evaluate(selectGenerator, nodeId);
          await chip.locator("img").waitFor();
          assert.equal(await chip.locator("img").getAttribute("src"), replacementUrl);
          assert.equal(await page.evaluate(id => readCanvasPromptMentions(ensureCanvasNodeMounted(id))[0].sourceNodeId, nodeId), replacementId);
          if (replaceProductMember) {
            assert.equal(await page.evaluate(id => readCanvasPromptMentions(ensureCanvasNodeMounted(id))[0].sourcePort, nodeId),
              "member-output:qa-member");
          }
          const restoredPacket = await assertImageRequest(run, replacementUrl, perfumeImage);
          assert.deepEqual(restoredPacket, replacementPacket);
          await page.evaluate(({ replacementId, nodeId }) => disconnectCanvasNodes(replacementId, nodeId), { replacementId, nodeId });
          await warning.waitFor();
          assert.equal(await chip.locator("img").count(), 0);
          await run.click();
          assert.match(await warning.innerText(), /@图1.*缺少|@图1.*未连接/);
          assert.equal(await composer.locator(".flora-generator-status:visible").count(), 0);
          assert.equal(packets.length, 3);
          assert.deepEqual(errors, []);
          console.log("固定 33200：同一图片节点换图后直接封包，原图指纹、生成参数、画布恢复及缺图反馈均通过。");
        }
        console.log("固定 33200：原图后补登记资产 ID 后，点击确认可保存待生成节点和原图连线。");
        return;
      }
      if (retryPhotography) {
        await page.locator("#canvasAgentClose").click();
        const generatorId = await page.evaluate(({ initial, optionId }) => {
          const photo = CanvasAgentConversation.naturalPhotoFidelity;
          const brief = photo.readBrief(initial.analysis, initial.sourceNodeIds);
          const direction = photo.selectCreativeDirection(brief, optionId);
          const candidate = { id: "gpt-image-2", modelId: "gpt-image-2", providerId: "qa-apimart",
            displayName: "gpt-image-2", platform: "openai", capabilities: ["image.edit"] };
          canvasImageModelCandidates = [candidate];
          imageModelCatalog = [candidate];
          IMAGE_MODEL_PLATFORMS[candidate.id] = "openai";
          IMAGE_MODEL_FAMILIES[candidate.id] = "gpt-image-2";
          IMAGE_MODEL_RESOLUTIONS[candidate.id] = ["1", "2", "4"];
          const lock = { ...photo.nodeLock(brief.images, brief.references, direction.creative, { compact: true }),
            model: candidate.id, providerId: candidate.providerId };
          const node = addCanvasImageGeneratorNode({ x: 460, y: 130 }, { focus: false, prompt: lock.prompt });
          node.dataset.boardId = canvasState.activeBoardId;
          applyAgentCanvasNodeChanges(node, { prompt: lock.prompt, model: candidate.id, size: "2048x1152", resolution: "1" });
          const size = node.querySelector(".canvas-node-size");
          if (size) size.value = "2048x1152";
          const resolution = node.querySelector(".canvas-node-resolution");
          if (resolution) resolution.value = "1";
          const model = node.querySelector(".canvas-node-model");
          model.add(new Option(candidate.displayName, candidate.id));
          model.value = candidate.id;
          model.dataset.modelSelection = node.dataset.modelSelection = "exact";
          delete model.dataset.catalogUnavailable;
          node.dataset.photoFidelity = JSON.stringify(lock);
          node.dataset.promptMentions = JSON.stringify(lock.mentions);
          const source = ensureCanvasNodeMounted(lock.sources[0].nodeId);
          source.dataset.assetId = "registered-after-plan";
          syncCanvasNodeModel(source);
          connectCanvasNodes(source.dataset.id, node.dataset.id, "input");
          CanvasFloraNodeShell.mount(node);
          selectCanvasNode(node);
          FloraGeneratorComposer.mount(node, node.querySelector(".flora-node-shell"));
          return node.dataset.id;
        }, { initial: savedConversation.pendingWorkflow, optionId: directions.recommendedId });
        const generator = page.locator(`.canvas-node[data-id="${generatorId}"]`);
        const submit = generator.locator(".canvas-node-run:visible");
        await submit.click();
        await page.waitForFunction(({ id, text }) => {
          const node = document.querySelector(`.canvas-node[data-id="${id}"]`);
          return node?.querySelector(".canvas-node-status")?.textContent.includes(text);
        }, { id: generatorId, text: retryRejection }).catch(async error => {
          const controls = await generator.evaluate(node => Object.fromEntries([".canvas-node-model", ".canvas-node-size", ".canvas-node-resolution"].map(selector => {
            const control = node.querySelector(selector);
            return [selector, { value: control?.value, options: Array.from(control?.options || []).map(option => ({ value: option.value, disabled: option.disabled })) }];
          })));
          throw new Error(`摄影节点状态未出现。请求 ${packets.length}，控件 ${JSON.stringify(controls)}，页面错误 ${JSON.stringify(errors)}，节点状态 ${await generator.locator(".canvas-node-status").textContent()}`, { cause: error });
        });
        assert.equal(packets.length, 1);
        assert.equal(await submit.isEnabled(), true);
        const retry = page.waitForRequest(request => new URL(request.url()).pathname === "/api/image-jobs" && request.method() === "POST");
        await submit.click();
        await retry;
        await page.waitForFunction(({ id, text }) => {
          const node = document.querySelector(`.canvas-node[data-id="${id}"]`);
          return node?.querySelector(".canvas-node-status")?.textContent.includes(text);
        }, { id: generatorId, text: retryRejection });
        assert.equal(packets.length, 2);
        assert.deepEqual(packets[1], packets[0]);
        assert.equal(packets[1].provider_id, "qa-apimart");
        assert.equal(packets[1].reference_images[0].sha256, sha(t16Image));
        assert.deepEqual(errors, []);
        console.log("固定 33200：旧摄影快照兼容，真实生成按钮保留明确错误并允许再次提交。两次请求均拦截，外部调用 0。");
        return;
      }
      const output = path.resolve(__dirname, artDirection ? "../.planning/natural-photo-art-20261121" : "../.planning/natural-photo-creative-20261121");
      await card.screenshot({ path: path.join(output, "T16-创意方案-隔离确认卡.png") });
      console.log("固定 33200：T16 三方向、两次切换、同指纹与参数、快照回读和四段提示词通过。生图请求 0。");
      return;
    }
    const raw = {
      version: 2, analysis: "瓶盖连接瓶体，外盒有可辨标记，选择高低错落陈列以保留标签。",
      images: inventory(material.references[0].nodeId), references: material.references,
    };
    const creative = "低位侧上机位。瓶体在左下近景、外盒在右上中景，保留标签可读；借右侧窄窗掠光拉开琥珀瓶面与灰盒反差。";
    const saved = await page.evaluate(({ raw, creative, boardId, skillId }) => {
      const fidelity = CanvasAgentConversation.naturalPhotoFidelity;
      const ids = raw.references.map(ref => ref.nodeId);
      const brief = fidelity.readBrief(JSON.stringify(raw), ids);
      const pending = {
        boardId, workflow: skillId, skillId, status: "awaiting-confirmation", sourceNodeIds: ids,
        analysis: JSON.stringify(brief), knownContext: JSON.stringify(brief), imagePrompt: creative, proposal: creative, summary: creative,
        parameters: { model: "gpt-image-2", size: "1024x1024" }, questions: [],
      };
      qaPhoto.renderCanvasAgentDesignBrief(pending);
      return { pending, lock: { ...fidelity.nodeLock(brief.images, brief.references, creative), model: "gpt-image-2", providerId: "qa-apimart" } };
    }, { raw, creative, boardId, skillId });
    const card = page.getByRole("article", { name: "自然美学摄影方案确认" });
    const cardText = await card.innerText();
    for (const term of ["香水瓶 × 1", "原装瓶盖 × 1", "原包装盒 × 1", "产品保真", "产品依据 · @图1"]) {
      assert.ok(cardText.includes(term), term);
    }
    assert.match(cardText, /生图附件为产品原图/);
    assert.doesNotMatch(cardText, /【允许调整】|【禁止改变】|【未知信息】/);
    assert.equal(await card.getByRole("button", { name: "仅创建节点", exact: true }).count(), 1);
    assert.equal(await card.getByRole("button", { name: /创建并自动生成|创建后手动生成/u }).count(), 0);
    assert.deepEqual(saved.lock.mentions.map(({ label, sourceNodeId }) => [label, sourceNodeId]),
      raw.references.map((ref, index) => [`@图${index + 1}`, ref.nodeId]));
    assert.ok(!cardText.includes("禁止保留"));
    const output = path.resolve(__dirname, "../.planning/natural-photo-text-20261121");
    fs.mkdirSync(output, { recursive: true });
    await card.screenshot({ path: path.join(output, "香水与包装-隔离确认卡.png") });
    assert.equal(packets.length, 0, "确认卡不能自动生图");
    const after = await page.evaluate(async ({ lock }) => {
      const node = addCanvasImageGeneratorNode({ x: 400, y: 110 }, { focus: false, prompt: lock.prompt });
      node.querySelector(".canvas-node-prompt").value = lock.prompt;
      node.dataset.photoFidelity = JSON.stringify(lock);
      node.dataset.promptMentions = JSON.stringify(lock.mentions);
      for (const source of lock.sources) {
        ensureCanvasNodeMounted(source.nodeId);
        connectCanvasNodes(source.nodeId, node.dataset.id, "input");
        if (!canvasState.connections.some(edge => edge.from === source.nodeId && edge.to === node.dataset.id)) {
          throw new Error(document.querySelector("#canvasStatus")?.textContent || "隔离画布未建立参考连线");
        }
      }
      const original = JSON.parse(JSON.stringify(serializeCanvasBoard()));
      restoreCanvasBoard(original);
      const restored = ensureCanvasNodeMounted(node.dataset.id);
      const refs = getCanvasPromptImageRequest(restored, lock.prompt, getCanvasIncomingRefs(restored.dataset.id)).refs;
      const request = { model: lock.model, provider_id: lock.providerId, n: 1, prompt: lock.prompt, reference_images: refs };
      try { await createCanvasImageJob(request, restored); }
      catch (error) {
        return { nodeId: restored.dataset.id, error: error.message, mentions: readCanvasPromptMentions(restored, lock.prompt),
          incoming: getCanvasIncomingRefs(restored.dataset.id), connections: original.connections };
      }
      throw new Error("隔离接口应拒绝该请求");
    }, saved);
    assert.match(after.error, /隔离接口拦截/, JSON.stringify(after));
    assert.deepEqual(after.mentions, saved.lock.mentions);
    assert.equal(packets.length, 1);
    await page.evaluate(async ({ refs }) => {
      qaPhoto.setFixtureWizard(refs.map(ref => ref.nodeId));
      const frames = document.querySelectorAll(".canvas-agent-wizard-image-open, .canvas-agent-context-preview");
      if (frames.length !== 2) throw new Error("产品参考图与底栏都应有一个缩略图");
      const results = [];
      for (const [width, height] of [[120, 60], [60, 120], [80, 80]]) {
        for (const frame of frames) {
          const image = frame.querySelector("img");
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="green"/></svg>`;
          image.src = "data:" + "image/svg+xml," + encodeURIComponent(svg);
          await image.decode();
          const a = frame.getBoundingClientRect(), b = image.getBoundingClientRect();
          const css = getComputedStyle(image);
          if (Math.abs(a.x + a.width / 2 - b.x - b.width / 2) > 0.5
            || Math.abs(a.y + a.height / 2 - b.y - b.height / 2) > 0.5
            || b.x < a.x || b.y < a.y || b.right > a.right || b.bottom > a.bottom
            || css.objectFit !== "contain" || css.objectPosition !== "50% 50%"
            || image.naturalWidth !== width || image.naturalHeight !== height) {
            throw new Error(`缩略图边界异常：${frame.className} ${width}x${height}`);
          }
          results.push([a.width, a.height]);
        }
      }
      const plane = document.querySelector("#canvasPlane");
      const transform = plane.style.transform;
      plane.style.transform = "scale(0.5)";
      try {
        for (const [index, frame] of [...frames].entries()) {
          const bounds = frame.getBoundingClientRect();
          if (bounds.width !== results[index][0] || bounds.height !== results[index][1]) throw new Error("缩略图受画布缩放影响");
        }
      } finally { plane.style.transform = transform; }
    }, { refs: raw.references });
    assert.deepEqual(packets[0].reference_images.map(item => [item.role, item.sha256, item.refId]), [
      ["product", sha(perfumeImage), undefined],
    ]);
    const upstream = [];
    const catalogModel = { id: "gpt-image-2", modelId: "gpt-image-2", providerId: "qa-apimart" };
    const service = createImageGenerationService({
      routing: { getProviderTaskRequirements: () => ({ intent: "image.edit" }) },
      getPublicProviderModelCatalog: () => ({ models: [catalogModel] }), findPublicProviderCatalogModel: () => catalogModel,
      isMidjourneyImageModel: () => false, validateImageOutputRequest: () => ({ supported: true }),
      mediaProviderBridge: { editImage: async input => { upstream.push(input); return { data: [] }; } },
      getNanoBananaImageOptions() {}, imageReferenceToFile: async url => ({ blob: new Blob([media.get(url)], { type: "image/svg+xml" }) }),
      getOpenAIEditMaskRef: () => null, ensurePngFilename() {}, saveGeneratedImages: async () => [],
      providerExecutionHttpStatus: () => 500, isAmbiguousSubmissionError: () => false,
    });
    const response = await service.execute(packets[0]);
    assert.equal(response.status, 200);
    assert.deepEqual(upstream[0].inputImages, [...media.values()].map(bytes => `data:image/svg+xml;base64,${bytes.toString("base64")}`));
    assert.equal(upstream[0].prompt, saved.lock.prompt);
    const removed = await page.evaluate(async ({ lock, nodeId }) => {
      const node = ensureCanvasNodeMounted(nodeId);
      const deletedId = lock.sources[0].nodeId;
      canvasState.connections = canvasState.connections.filter(edge => edge.from !== deletedId || edge.to !== node.dataset.id);
      const incoming = getCanvasIncomingRefs(node.dataset.id);
      try {
        await createCanvasImageJob({ model: lock.model, provider_id: lock.providerId, n: 1, prompt: lock.prompt,
          reference_images: incoming }, node);
      } catch (error) {
        return { error: error.message, refIds: incoming.map(ref => ref.sourceNodeId) };
      }
      throw new Error("断开的原图不应进入生图请求");
    }, { lock: saved.lock, nodeId: after.nodeId });
    assert.match(removed.error, /重新确认/);
    assert.deepEqual(removed.refIds, []);
    assert.equal(packets.length, 1);
    assert.deepEqual(errors, []);
    console.log("香水确认卡、产品原图视觉输入、节点恢复和编辑服务模拟封包通过。外部生图请求 0。");
  } finally {
    await browser.close();
  }
}

check().catch(error => { console.error(error); process.exitCode = 1; });
