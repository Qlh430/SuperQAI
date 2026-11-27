const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { chromium } = require("playwright");

const origin = "http://127.0.0.1:33200";
const boardId = "qa-agent-composer";
const title = "Agent 操作区隔离验收";
const skillPositionOnly = process.argv.includes("--skill-position");
const footerPositionOnly = process.argv.includes("--footer-position");
const attachmentsOnly = process.argv.includes("--attachments");
const selectedPromptOnly = process.argv.includes("--selected-prompt");
const intentOnly = process.argv.includes("--intent");
const sidePanelsOnly = process.argv.includes("--side-panels");
const skillCoversOnly = process.argv.includes("--skill-covers");
const posterOnly = process.argv.includes("--poster");
const creativeBatchOnly = process.argv.includes("--creative-batch");
const governanceOnly = process.argv.includes("--governance");
const skillSubmissionOnly = process.argv.includes("--skill-submission");
const fashionSkillId = "fashion-ecommerce-ai-model-video";
const fashionSkillLabel = "服装电商 · AI 模特动态展示";
const referenceRecovery = process.argv.includes("--reference-recovery");
const intentCases = [
  ["你好，请用一句话解释焦距。", "焦距影响视角。"],
  ["我只是让修改一下我上传的提示词。只把背景改成森林。", "手机壳置于森林背景，保留正面构图与柔和侧光。"],
  ["帮我优化这段摄影提示词", "手机壳正面展示，柔和侧光保留清晰轮廓。"],
  ["参考自然美学摄影 Skill 改写提示词", "以自然漫射光拍摄手机壳，保留真实材质与正面构图。"],
  ["分析这张产品图片", "这张测试产品图可以用于展示主体轮廓。"],
  ["这张图片的光影应该怎么调整", "建议保留柔和侧光，再用反光板补暗部。"],
  ["不要执行图片生成，只修改文字", "手机壳正面展示，保留森林背景与柔和侧光。"],
  ["先讨论如何创建图片生成工作流，等我确认再执行。", "可以先比较单节点和多节点方案。"],
];
const selectedPromptRequest = "把这个提示词改一下，手机壳上的镜盖不要打开，保持闭合状态";
const updatedPrompt = "镜头保护盖保持关闭，保留背景和构图。产品上的 2K 字样保持清晰。";
const output = path.resolve(__dirname, creativeBatchOnly ? "../.design/agent-creative-batch-20261123" : governanceOnly ? "../.design/agent-governance-20261123" : posterOnly ? "../.design/agent-poster-20261123" : skillCoversOnly ? "../.design/agent-skill-covers-20261123" : sidePanelsOnly ? "../.design/canvas-side-panels-20261123" : intentOnly ? "../.planning/agent-intent-routing-20261121/browser" : attachmentsOnly ? "../.planning/agent-attachment-20261121/browser" : skillPositionOnly
  ? "../.design/agent-skill-position-20261120" : "../.design/agent-preferences-20261120");
const widths = [390, 768, 1280, 1440, 1728];
const before = process.argv.includes("--before");
const screenshotPrefix = before ? "before" : "after";
const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jI1sAAAAASUVORK5CYII=", "base64");
const video = fs.readFileSync(path.join(__dirname, "test-fixtures/video-seek-fixture.mp4"));
const thumb = '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72"><rect width="72" height="72" fill="#395969"/><rect x="22" y="13" width="28" height="46" rx="8" fill="#a9cfc7"/><circle cx="36" cy="28" r="6" fill="#354d55"/></svg>';
const creativeProductImage = creativeBatchOnly && process.env.QA_CREATIVE_PRODUCT_JPEG
  ? fs.readFileSync(process.env.QA_CREATIVE_PRODUCT_JPEG) : null;
const assets = [
  { id: "library-img", kind: "image", name: "库内图片", url: "/qa-material/library.svg" },
  { id: "library-video", kind: "video", name: "库内视频", url: "/qa-material/library.mp4" },
  { id: "library-audio", kind: "audio", name: "库内音频", url: "/qa-material/library.wav" },
];
const extraSkills = [
  { id: "h3-commerce-video", label: "H3 带货视频", origin: "custom" },
  { id: "natural-aesthetic-product-photography", label: "自然美学产品摄影", origin: "custom" },
  ...Array.from({ length: 14 }, (_, index) => ({
    id: `qa-private-${index}`, label: `私人 Skill ${index + 1}`, origin: "custom", scope: "personal",
  })),
];

function createIntentFixture() {
  const Module = require("node:module");
  const resolve = Module._resolveFilename;
  Module._resolveFilename = function (name, parent, ...args) {
    if (name === "./canvas-feature-registry.js" && parent?.filename.startsWith(path.resolve(__dirname, "../host-sources/app") + path.sep)) {
      return path.resolve(__dirname, "design-sources/canvas-feature-registry.js");
    }
    return resolve.call(this, name, parent, ...args);
  };
  try {
    const CanvasAgentRuntime = require("../host-sources/app/canvas-agent-runtime");
    const CanvasAgentConversation = require("../host-sources/app/canvas-agent-conversation");
    const { createCanvasAgentHttpApi } = require("../host-sources/app/canvas-agent-http-api");
    const photography = CanvasAgentRuntime.parseSkillDocument(`---
name: natural-aesthetic-product-photography
description: 自然美学产品摄影
---

摄影知识：用漫射光保留真实材质。`);
    return createCanvasAgentHttpApi({
      CanvasAgentConversation, CanvasAgentRuntime, conversationStore: { get() {} }, normalizeBoardId: String,
      skillRegistry: { loadAgentCatalog: () => ({ business: [photography] }) },
      agentModelSettings: { getRoute: () => ({ candidateOrder: [], autoFallback: false }) },
      ensureReferencedResource: async () => ({ id: boardId }),
      resourceAccess: { async assertRead() {}, async assertWrite() {} },
      maxSessions: 32, sessionTtlMs: 60000,
      readJson: async req => req.body,
      sendJson: (res, status, body) => Object.assign(res, { status, body }),
      canvasAgentProviderBridge: {
        async runTurn(input) {
          assert.deepEqual(input.tools, [], "the real HTTP/runtime route must expose no tools");
          const message = input.messages.find(item => item.role === "user" && Array.isArray(item.content));
          const [request, answer] = intentCases.find(([text]) => message?.content[0].text.startsWith(text)) || [];
          assert.ok(answer, `unexpected model request: ${message?.content[0].text}`);
          if (/^(?:分析这张|这张图片的光影)/u.test(request)) {
            assert.equal(input.needsVision, true);
            assert.ok(message.content.some(part => part.type === "image_url"));
          }
          return { selection: {}, attempts: [], turn: { response_id: "qa-intent", message: answer, tool_calls: [] } };
        },
      },
    });
  } finally {
    Module._resolveFilename = resolve;
  }
}

async function run() {
  fs.mkdirSync(output, { recursive: true });
  const intentFixture = intentOnly ? createIntentFixture() : null;
  const browser = await chromium.launch({ executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(7000);
  const errors = [];
  const uploads = [];
  const promptTurns = [];
  let semanticCase;
  let initialPromptWrites = 0;
  const boardOperations = [];
  const generationRequests = [];
  let posterImageVersion = 0;
  let posterJob;
  let readbackFailureSlot = 0;
  let readbackFailureCount = 0;
  let productNodeId = "";
  let loseCreativeSave = false;
  let lostCreativeSaves = 0;
  let interruptReadback = null;
  let skillCatalogLoads = 0;
  let coverRevision = 1;
  let assetLoads = 0;
  let finishTurn;
  let rejectImageTurn = attachmentsOnly;
  let deferAssistantSave;
  let boardNodes = [];
  const referenceApprovals = new Map();
  let pauseReferenceContinuation = false;
  let conversation = {
    boardId, conversationId: "qa-agent-session", revision: 1, activeSkillId: "",
    generationSettings: { mode: "agent" },
    items: [{ id: "qa-message", role: "assistant", text: "隔离历史消息已恢复。", status: "completed" }],
  };
  if (sidePanelsOnly) {
    conversation.activeSkillId = "qa-skill";
    conversation.generationSettings = { mode: "agent", automatic: false, type: "image", model: "gpt-image-2-ainb" };
    conversation.items.push(...Array.from({ length: 30 }, (_, index) => ({
      id: `qa-history-${index}`, role: "assistant", text: `验收历史消息 ${index + 1}`, status: "completed",
    })));
    assets.push(...Array.from({ length: 30 }, (_, index) => ({
      id: `qa-asset-${index}`, kind: "image", name: `库内图片 ${index + 1}`, url: "/qa-material/library.svg",
    })));
    await page.addInitScript(() => localStorage.setItem("canvas-agent-panel-open-v1", "true"));
  }
  if (intentOnly) {
    conversation.activeSkillId = "natural-aesthetic-product-photography";
    conversation.items.push(
      { id: "previous-generation", role: "user", text: "请生成一张产品图。", status: "completed" },
      { id: "previous-result", role: "assistant", text: "上一项生图任务已经完成。", status: "completed" },
    );
  }
  if (creativeBatchOnly) {
    conversation.activeSkillId = "commercial-product-photography-10";
    conversation.generationSettings = { mode: "agent", automatic: true, type: "image", model: "", size: "auto", resolution: "" };
  }
  if (posterOnly) conversation.activeSkillId = "poster-design";
  page.on("pageerror", error => errors.push(error.message));
  let saveFault = "";
  let saveAttempts = [];
  await page.routeWebSocket("**/*", socket => socket.close());
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (skillSubmissionOnly && url.pathname === "/output/qa-skill-submission.png") {
      return route.fulfill({ body: image, contentType: "image/png" });
    }
    if (posterOnly && url.pathname === "/output/qa-poster-result.png") return route.fulfill({ body: image, contentType: "image/png" });
    if ((selectedPromptOnly || governanceOnly || skillSubmissionOnly) && process.argv.includes("--source")
      && ["/canvas-agent-ui.js", "/canvas-agent-conversation.js", "/canvas-agent.css"].includes(url.pathname)) {
      return route.fulfill({ path: path.join(__dirname, "../host-sources/app", url.pathname.slice(1)),
        contentType: url.pathname.endsWith(".css") ? "text/css" : "text/javascript" });
    }
    if (url.pathname.startsWith("/qa-material/")) {
      if (url.pathname === "/qa-material/creative-product.jpg" && creativeProductImage) {
        return route.fulfill({ body: creativeProductImage, contentType: "image/jpeg" });
      }
      if (url.pathname.endsWith(".mp4")) return route.fulfill({ body: video, contentType: "video/mp4" });
      if (!url.pathname.endsWith(".svg")) return route.fulfill({ status: 204 });
      return route.fulfill({ body: posterImageVersion ? thumb.replace("#395969", "#614045") : thumb, contentType: "image/svg+xml" });
    }
    if (governanceOnly && url.pathname.startsWith("/output/qa-h3-material-")) {
      return route.fulfill({ contentType: "image/png", body: image });
    }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/auth/session") return route.fulfill({ json: {
      authenticated: true, user: { id: "qa-composer", username: "qa-composer", displayName: "验收账户", role: "superadmin", status: "active" },
    } });
    if (url.pathname === "/api/canvas/boards") return route.fulfill({ json: {
      boards: [{ id: boardId, title, resourceId: "qa-composer-resource", nodeCount: boardNodes.length }],
    } });
    if ((selectedPromptOnly || intentOnly || posterOnly || governanceOnly || creativeBatchOnly) && request.method() === "POST" && url.pathname === `/api/canvas/boards/${boardId}/operations`) {
      const { operations, baseRevision } = request.postDataJSON();
      if (saveFault) {
        saveAttempts.push(...operations);
        if (saveFault === "conflict" || saveFault === "unrelated") {
          const changed = saveFault === "conflict" ? operations[0].entityId : "qa-upper";
          const previous = boardOperations.findLast(item => item.entityId === changed)?.after || boardNodes.find(item => item.id === changed);
          boardOperations.push({ operationId: "qa-other-client", entityId: changed, after: { ...previous, prompt: "协作者的较新内容。" } });
          saveFault = "observing";
          return route.fulfill({ status: 409, json: { code: "revision_conflict" } });
        }
        if (saveFault === "unavailable" || saveFault === "always" || saveFault === "invalid") {
          const status = saveFault === "invalid" ? 422 : 503;
          if (saveFault === "unavailable") saveFault = "observing";
          return route.fulfill({ status, json: { code: "qa_save_fault" } });
        }
        assert.equal(baseRevision, boardOperations.length);
        if (saveFault === "lost") {
          boardOperations.push(...operations);
          saveFault = "observing";
          return route.abort("timedout");
        }
      }
      const previousIds = new Set(creativeBatchOnly ? boardOperations.map(op => op.operationId) : []);
      boardOperations.push(...operations.filter(op => !previousIds.has(op.operationId)));
      if (posterOnly || creativeBatchOnly || referenceRecovery) for (const operation of operations) {
        if (operation.type === "node.upsert" && operation.after) {
          boardNodes = [...boardNodes.filter(node => node.id !== operation.entityId), operation.after];
        }
        if (operation.type === "node.delete") boardNodes = boardNodes.filter(node => node.id !== operation.entityId);
      }
      if (creativeBatchOnly && loseCreativeSave && operations.some(op => op.after?.agentNodeIdentityKey?.includes("-slot-"))) {
        loseCreativeSave = false;
        lostCreativeSaves++;
        return route.abort("timedout");
      }
      return route.fulfill({ json: {
        success: true, boardRevision: boardOperations.length,
        results: operations.map(({ operationId, entityId }) => ({
          operationId, entityId, status: previousIds.has(operationId) ? "duplicate" : "applied", entityRevision: boardOperations.length,
        })),
      } });
    }
    if (creativeBatchOnly && url.pathname === `/api/canvas/boards/${boardId}/nodes`) {
      const id = url.searchParams.get("nodeId");
      const node = boardOperations.findLast(item => item.entityId === id)?.after || boardNodes.find(item => item.id === id);
      if (!node) return route.fulfill({ status: 404, json: { error: "节点不存在" } });
      if (interruptReadback && node.nodeTitle?.startsWith("10 ")) {
        const { started, release } = interruptReadback;
        interruptReadback = null;
        started();
        await release;
        return route.abort().catch(() => {});
      }
      if (readbackFailureCount > 0 && String(node.nodeTitle || "").startsWith(String(readbackFailureSlot).padStart(2, "0"))) {
        readbackFailureCount--;
        return route.fulfill({ status: 503, json: { error: "隔离核验暂时失败" } });
      }
      return route.fulfill({ json: { nodes: [node], connections: boardOperations
        .filter(op => op.type === "connection.upsert" && op.after?.to === id).map(op => op.after) } });
    }
    if ((selectedPromptOnly || governanceOnly) && url.pathname === `/api/canvas/boards/${boardId}/node`) {
      const id = url.searchParams.get("nodeId");
      if (saveFault === "deleted") return route.fulfill({ status: 404, json: { code: "node_not_found" } });
      const node = boardOperations.findLast(item => item.entityId === id)?.after || boardNodes.find(item => item.id === id);
      return route.fulfill({ json: { node } });
    }
    if ((selectedPromptOnly || governanceOnly) && url.pathname === `/api/canvas/boards/${boardId}/meta`) {
      return route.fulfill({ json: { revision: boardOperations.length } });
    }
    if (url.pathname.startsWith(`/api/canvas/boards/${boardId}/`)) return route.fulfill({ json: {
      title, revision: posterOnly || creativeBatchOnly ? boardOperations.length : 0, boardRevision: posterOnly || creativeBatchOnly ? boardOperations.length : 0,
      nodes: selectedPromptOnly || governanceOnly
        ? boardNodes.map(node => boardOperations.findLast(item => item.entityId === node.id)?.after || node) : boardNodes,
      connections: posterOnly || creativeBatchOnly ? boardOperations.filter(item => item.type === "connection.upsert").map(item => item.after) : [],
      mode: "detail", engineVersion: "canvas-visual-fidelity-v2", complete: true,
    } });
    if (url.pathname === "/api/canvas-agent/conversation") {
      if (url.searchParams.get("action") === "list") return route.fulfill({ json: {
        sessions: [{ conversationId: conversation.conversationId, title: "隔离会话", itemCount: conversation.items.length, updatedAt: new Date().toISOString() }],
      } });
      if (request.method() === "POST") {
        const snapshot = request.postDataJSON().conversation;
        if (snapshot) conversation = { ...snapshot, revision: conversation.revision + 1 };
        const pendingSave = deferAssistantSave;
        const latestUser = snapshot?.items.findLast(item => item.role === "user");
        if (pendingSave && latestUser?.executionStatus === "running"
          && snapshot.items.some(item => item.role === "assistant" && item.text === "验收模拟回复。")) {
          deferAssistantSave = null;
          const saved = conversation;
          await pendingSave;
          return route.fulfill({ json: saved });
        }
      }
      const reference = referenceApprovals.get(conversation.taskContext?.taskId);
      return route.fulfill({ json: reference ? { ...conversation, skillReferenceApproval: reference } : conversation });
    }
    if (url.pathname === "/api/canvas-agent/turn") {
      assert.equal(skillPositionOnly, false, "定位专项不提交生成请求");
      if (finishTurn) await finishTurn.promise;
      const body = request.postDataJSON();
      const images = body.vision_images || [];
      if (skillSubmissionOnly) {
        promptTurns.push(body);
        if (body.prompt.includes("隔离模型失败")) return route.fulfill({ status: 400, json: { error: "隔离模型请求失败。" } });
        const intake = body.prompt.startsWith("任务阶段：先理解");
        const h3 = body.skill_id === "h3-commerce-video";
        const outfitReply = body.skill_id === fashionSkillId && body.prompt.includes("用户本轮回复：整套搭配");
        if (outfitReply && body.tool_outputs?.length) {
          assert.equal(body.vision_images, undefined);
          assert.equal(body.canvas.agent_image_attachments, undefined);
        }
        if (outfitReply && body.skill_contract_retry) {
          const firstReply = promptTurns.find(turn => turn.run_id === body.run_id && turn.step === 0);
          assert.deepEqual(body.vision_images, firstReply.vision_images);
          assert.deepEqual(body.canvas.agent_image_attachments, firstReply.canvas.agent_image_attachments);
        }
        const requiredImage = [fashionSkillId, "commercial-product-photography-10"].includes(body.skill_id);
        const missingImage = requiredImage && !images.length;
        const dynamic = {
          collection: { title: "任务信息收集", steps: missingImage ? [{
            id: "product_reference", kind: "image", title: body.skill_id === fashionSkillId ? "服装参考图" : "商品原图",
            required: true, max_items: body.skill_id === fashionSkillId ? 8 : 1,
            sources: ["canvas", "library", "selected", "upload"],
          }] : [] },
          knownValues: {}, collectFields: [], missingImageSteps: missingImage ? ["product_reference"] : [],
        };
        if (body.skill_id === "qa-media-intake") {
          dynamic.collection.steps = [{
            id: "facts", title: "核对商品资料", fields: [
              { id: "product", type: "text", label: "商品名称", required: true },
              { id: "audience", type: "text", label: "目标受众", required: true },
            ],
          }, {
            id: "voice", title: "参考配音", kind: "image", media_type: "audio", required: true, max_items: 1,
            sources: ["canvas", "selected", "upload"],
          }];
          dynamic.knownValues = { product: "茶叶礼盒" };
          dynamic.collectFields = ["audience"];
          dynamic.missingImageSteps = ["voice"];
        }
        return route.fulfill({ json: {
          request_id: body.request_id, message_id: body.message_id, response_id: "qa-submission",
          message: intake ? JSON.stringify(h3 ? { knownValues: {}, missingImageSteps: [], imageMatches: [],
            collectFields: ["product_name"], analysis: "请补充商品信息。", directions: [] } : dynamic)
            : body.skill_id === fashionSkillId
              ? outfitReply
                ? "已确认按整套搭配处理。" : "请确认处理整套搭配还是单件服装？"
              : "请补充目标受众是谁？",
          tool_calls: outfitReply && body.step === 0 ? [{
            call_id: "qa-fashion-reference",
            name: "read_skill_reference",
            arguments: { skill_id: fashionSkillId, path: "references/workflow.md" },
          }] : [],
          vision_receipt: { count: images.length, mime_type: "image/jpeg" },
        } });
      }
      if (governanceOnly && body.action === "skill_approval") {
        const approved = body.decision === "approve";
        assert.match(body.operation_id, /^qa-skill-approval-/);
        const event = { eventId: `${body.decision}:${body.operation_id}`, taskId: body.task_id,
          type: approved ? "cross_skill_grant" : "cross_skill_denial", skillId: "qa-skill",
          relatedSkillId: "poster-design", source: "user", at: new Date().toISOString() };
        const reference = referenceApprovals.get(body.task_id);
        assert.equal(reference.pending.operationId, body.operation_id);
        const approvedSkill = approved ? reference.pending : null;
        reference.pending = null;
        reference.approved = approved ? [approvedSkill] : [];
        reference.event = event;
        reference.resume.decision = body.decision;
        return route.fulfill({ json: { skill_event: event, approved: approvedSkill, resume: reference.resume } });
      }
      if (governanceOnly && (body.skill_approval_resume || /跨 Skill 授权验收/u.test(body.user_intent_prompt || ""))) {
        assert.equal(body.skill_id, "qa-skill");
        assert.equal(body.conversation_id, conversation.conversationId);
        const primary = { id: "qa-skill", name: "版式策划" };
        const operationId = `qa-skill-approval-${body.task_id}`;
        const pending = { id: "poster-design", name: "海报设计", operationId };
        const resume = { operationId, name: pending.name, runId: body.run_id, requestId: body.request_id, messageId: body.message_id };
        if (body.skill_approval_resume) {
          const reference = referenceApprovals.get(body.task_id);
          assert.equal(body.skill_approval_resume, reference.resume.operationId);
          if (pauseReferenceContinuation) return route.abort();
          reference.resume = null;
        } else referenceApprovals.set(body.task_id, { taskId: body.task_id, primary, pending, resume, approved: [] });
        return route.fulfill({ json: {
          request_id: body.request_id, message_id: body.message_id, task_id: body.task_id, tool_calls: [],
          primary_skill: primary,
          ...(body.skill_approval_resume ? { message: "已沿用主 Skill 完成验收。", vision_receipt: { count: images.length, mime_type: "image/jpeg" } }
            : { skill_approval: pending, skill_reference_resume: resume }),
        } });
      }
      if (creativeBatchOnly) {
        promptTurns.push(body);
        assert.equal(body.skill_mode, "manual");
        assert.equal(body.skill_id, "commercial-product-photography-10");
        assert.equal(body.skill_workflow, true);
        assert.equal(images.length, 1, "product image is supplied as actual image bytes");
        assert.match(images[0], /^data:image\/jpeg;base64,/u);
        assert.deepEqual(body.canvas.agent_selection_node_ids, [productNodeId]);
        const source = body.canvas.agent_image_attachments?.[0];
        assert.equal(source.node_id, productNodeId);
        assert.equal(source.readable, true);
        return route.fulfill({ json: {
          request_id: body.request_id, message_id: body.message_id, response_id: `qa-creative-${promptTurns.length}`,
          vision_receipt: { count: 1, mime_type: "image/jpeg" },
          tool_calls: [{
            call_id: `creative-batch-${promptTurns.length}`,
            name: "request_creative_batch_confirmation",
            arguments: {
              product_name: "手机壳与手机组合",
              product_analysis: "黑色手机壳，保留手机本体、镜头区域、现有卡扣和侧边开孔；不可读品牌文字不推断。",
              source_node_ids: [productNodeId],
              items: Array.from({ length: 10 }, (_, index) => ({
                slot: index + 1,
                direction: [
                  "极简雕塑主视觉", "成分与材料故事", "沉浸式生活视角", "几何光影世界", "物件内部视角",
                  "质感色彩世界", "地面随性生活场景", "自然光互动", "时尚编辑静物", "S 形产品阵列",
                ][index],
                summary: `方向 ${index + 1} 的独立构图和布光方案。`,
                prompt: `方向 ${index + 1}：商业产品摄影，保留手机壳与手机组合、黑色、镜头区域和侧边开孔；${index + 1} 号专属机位、场景、布光及真实材质表现。产品不变形、不增减配件、不臆造标识，不生成文字。参考 @图1。`
                  + (index === 9 ? "\n保留镜头开孔、卡扣和真实材质。".repeat(410) + " 完整稿末尾核对。" : ""),
              })),
            },
          }],
        } });
      }
      if (governanceOnly && body.user_intent_prompt === "只识别这些图片并返回分类建议，不执行，不调用工具。") {
        assert.equal(body.skill_mode, "auto");
        const slots = images.length === 3 ? ["opening", "main", "evidence"] : ["detail"];
        return route.fulfill({ json: {
          request_id: body.request_id, message_id: body.message_id, tool_calls: [],
          message: JSON.stringify(slots.map((slot, index) => ({ slot, index: index + 1, certain: true }))),
          vision_receipt: { count: images.length, mime_type: "image/jpeg" },
        } });
      }
      if (governanceOnly && (body.prompt.startsWith("审核节点提示词编辑") || /当前节点提示词/.test(body.prompt))) {
        const review = body.prompt.startsWith("审核节点提示词编辑");
        return route.fulfill({ json: {
          request_id: body.request_id, message_id: body.message_id, response_id: "qa-node-edit",
          message: review ? JSON.stringify({ approved: true, reason: "", evidence: [updatedPrompt] }) : "",
          tool_calls: review ? [] : [{ name: "update_node", call_id: "qa-edit", arguments: {
            node_id: "qa-lower", changes: { prompt: updatedPrompt },
          } }],
          ...(images.length ? { vision_receipt: { count: images.length, mime_type: "image/jpeg" } } : {}),
        } });
      }
      if (posterOnly) {
        promptTurns.push(body);
        assert.equal(body.skill_workflow, true);
        assert.equal(body.skill_id, "poster-design");
        assert.match(body.prompt, /creative-brief\.md[\s\S]+poster-playbook\.md[\s\S]+festival-poster\.md/u);
        const attachments = body.canvas.agent_image_attachments;
        assert.equal(images.length, attachments.length);
        assert.ok(images.every(pixel => /^data:image\/jpeg;base64,/.test(pixel)));
        assert.ok(attachments.every(item => /^[a-f0-9]{64}$/.test(item.fingerprint) && item.readable));
        const revised = body.prompt.includes("改用青色窗影");
        return route.fulfill({ json: {
          request_id: body.request_id, message_id: body.message_id, response_id: "qa-poster",
          vision_receipt: { count: images.length, mime_type: "image/jpeg" },
          tool_calls: [{ call_id: "brief", name: "request_design_brief", arguments: {
            workflow: "poster", poster_type: "product", source_node_ids: [], questions: [],
            known_context: "产品原图为手机壳，保留镜头开孔和组件。风格图只作为布光参考。标题：新春好礼。",
            summary: revised ? "青色窗影，4:5 竖版，上部标题安全区。" : "春节窗影，4:5 竖版，上部标题安全区。",
            image_prompt: revised ? "青色窗影，4:5，保留 @图1 商品真实造型，留白，不生成文字。"
              : `深红窗影，4:5，保留 @图1 商品真实造型，留白，不生成文字。${images.length > 1 ? "@图2 只参考窗影，不使用其中的商品。" : ""}`,
          } }],
        } });
      }
      if (intentOnly) {
        promptTurns.push(body);
        const fixtureRequest = Object.assign(new EventEmitter(), {
          method: "POST", headers: {}, url: url.pathname, body, auth: { user: { id: "qa-composer" } },
        });
        const response = new EventEmitter();
        await intentFixture.handle(fixtureRequest, response);
        if (response.status !== 200) console.error("isolated Agent response", response.status, response.body?.error);
        return route.fulfill({ status: response.status, json: response.body });
      }
      if (selectedPromptOnly) {
        if (body.prompt.startsWith("审核节点提示词编辑")) {
          const inputs = JSON.parse(body.prompt.split("\n").at(-1));
          assert.match(body.prompt, /明确写出修改后的状态/);
          assert.equal(body.canvas?.agent_image_attachments?.length || 0, images.length);
          const approved = semanticCase ? inputs.完整待审核稿 === semanticCase.correct
            : inputs.完整待审核稿 !== "冲突候选：镜盖向外展开，同时要求完全闭合";
          assert.equal(boardOperations.filter(item => item.entityId === (semanticCase?.nodeId || "qa-lower")).length, semanticCase?.priorWrites ?? initialPromptWrites);
          if (semanticCase) {
            assert.equal(inputs.用户本轮要求, semanticCase.request);
            assert.equal(inputs.目标节点完整原文, semanticCase.original);
          }
          return route.fulfill({ json: {
            request_id: body.request_id, message_id: body.message_id, tool_calls: [],
            message: JSON.stringify({
              approved,
              reason: approved ? "" : semanticCase?.reason || "镜盖向外展开与闭合冲突，须删除旧描述",
              evidence: approved ? [inputs.完整待审核稿] : [],
            }),
            ...(images.length ? { vision_receipt: { count: images.length, mime_type: "image/jpeg" } } : {}),
          } });
        }
        promptTurns.push(body);
        const functionCall = (call_id, name, args) => ({ call_id, name, arguments: args });
        const tools = semanticCase ? !body.previous_response_id || body.tool_outputs?.[0]?.output?.code === "prompt_edit_review_rejected"
          ? [functionCall(`semantic-${promptTurns.length}`, "update_node", { node_id: semanticCase.nodeId || "qa-lower", changes: {
            prompt: body.previous_response_id || semanticCase.clean ? semanticCase.correct : `${semanticCase.original} ${semanticCase.correct}`,
          } })] : [] : promptTurns.length === 1 ? [
          functionCall("wrong-focus", "focus_canvas_nodes", { node_ids: ["qa-upper"] }),
          functionCall("wrong-edit", "update_node", { node_id: "qa-upper", changes: { prompt: "错误修改" } }),
        ] : promptTurns.length === 2 ? [
          functionCall("conflicting-edit", "update_node", { node_id: "qa-lower", changes: { prompt: "冲突候选：镜盖向外展开，同时要求完全闭合" } }),
        ] : promptTurns.length === 3 ? [
          functionCall("right-edit", "update_node", { node_id: "qa-lower", changes: { prompt: updatedPrompt } }),
        ] : [];
        return route.fulfill({ json: {
          response_id: `qa-turn-${promptTurns.length}`, request_id: body.request_id, message_id: body.message_id,
          message: tools.length ? "" : "隔离验收修改完成。", tool_calls: tools,
          ...(images.length ? { vision_receipt: { count: images.length, mime_type: "image/jpeg" } } : {}),
        } });
      }
      if (rejectImageTurn && images.length) {
        rejectImageTurn = false;
        return route.fulfill({ status: 400, json: { code: "vision_input_unavailable", error: "模拟素材传递失败" } });
      }
      return route.fulfill({ json: { response_id: "qa-turn", request_id: body.request_id, message_id: body.message_id, message: "验收模拟回复。", tool_calls: [],
        ...(images.length ? { vision_receipt: { count: images.length, mime_type: "image/jpeg" } } : {}),
      } });
    }
    if (posterOnly && url.pathname === "/api/skills/reference") {
      const reference = url.searchParams.get("path");
      const skill_id = url.searchParams.get("skill_id");
      assert.equal(skill_id, "poster-design");
      assert.match(reference, /^references\/(creative-brief|poster-playbook|festival-poster)\.md$/u);
      const content = fs.readFileSync(path.join(__dirname, "../host-sources/app/skills/poster-design", reference), "utf8");
      return route.fulfill({ json: { skill_id, path: reference, content, bytes: Buffer.byteLength(content) } });
    }
    if (posterOnly && url.pathname === "/api/image-jobs" && request.method() === "POST") {
      const body = request.postDataJSON();
      generationRequests.push(body);
      if (generationRequests.length === 1) return route.fulfill({ status: 422, json: { error: "隔离生成模拟失败" } });
      posterJob = {
        id: "qa-poster-job", boardId: body.board_id, nodeId: body.node_id, model: body.model, state: "completed",
        result: { data: [{ url: "/output/qa-poster-result.png", width: 72, height: 72 }] },
      };
      return route.fulfill({ json: { job: posterJob } });
    }
    if (posterOnly && url.pathname === "/api/image-jobs/qa-poster-job") return route.fulfill({ json: { job: posterJob } });
    if ((posterOnly || creativeBatchOnly) && url.pathname === "/api/image-models") {
      const candidate = { id: "gpt-image-2", modelId: "gpt-image-2", model: "gpt-image-2",
        providerId: posterOnly ? "qa-poster" : "qa-creative-batch", providerName: "隔离模型",
        family: "gpt-image-2", platform: "openai",
        enabled: true, hasApiKey: true, hasBaseUrl: true, state: "online",
        capabilities: ["image.generate", "image.edit"], resolutions: ["1", "2"], ratios: ["1:1", "4:5", "3:4"] };
      return route.fulfill({ json: { candidates: [candidate], models: [candidate], defaultModel: candidate.id, revision: 1 } });
    }
    if (creativeBatchOnly && url.pathname === "/api/image-jobs" && request.method() === "POST") {
      generationRequests.push(request.postDataJSON());
      return route.fulfill({ status: 402, json: { code: "qa_paid_generation_blocked", error: "专项回归禁止生图" } });
    }
    if ((intentOnly || selectedPromptOnly) && request.method() === "POST" && /image|generate|comfy|video/u.test(url.pathname)
      && !/upload/u.test(url.pathname)) generationRequests.push(url.pathname);
    if (url.pathname === "/api/image-models") return route.fulfill({ json: {
      defaultModel: "gpt-image-2",
      models: [
        { id: "gpt-image-2", displayName: "图片默认模型", platform: "openai", family: "gpt-image-2", resolutions: ["1", "2"] },
        { id: "gpt-image-2-ainb", displayName: "图片备用模型", platform: "openai", family: "gpt-image-2", resolutions: ["1", "2"] },
      ],
    } });
    if (url.pathname === "/api/video-models") return route.fulfill({ json: {
      models: [{ id: "qa-video", displayName: "视频验收模型", ratios: ["16:9", "9:16"], resolutions: ["720p", "1080p"] }],
    } });
    if (["/api/upload-image", "/api/upload-media"].includes(url.pathname)) {
      const filename = decodeURIComponent(request.headers()["x-file-name"] || "");
      const mimeType = request.headers()["content-type"];
      const extension = mimeType.startsWith("image/") ? "svg" : filename.split(".").at(-1);
      uploads.push({ path: url.pathname, filename, mimeType });
      if (attachmentsOnly && filename === "批量失败.png") return route.fulfill({
        status: 422, json: { error: "模拟单文件上传失败" },
      });
      return route.fulfill({ json: { url: `/qa-material/uploaded.${extension}`, asset: { id: `upload-${uploads.length}`, name: filename }, mimeType } });
    }
    if (url.pathname === "/api/image-thumbnails") return route.fulfill({ json: {
      item: { thumbnailUrl: creativeProductImage ? "/qa-material/creative-product.jpg" : "/qa-material/preview.svg", width: 72, height: 72 },
    } });
    if (url.pathname === "/api/asset-library") {
      assetLoads++;
      return route.fulfill({ json: {
      entries: assets.filter(asset => [undefined, null, "all", asset.kind].includes(url.searchParams.get("kind"))).map(asset => ({
        resource: { id: asset.id, title: asset.name, type: asset.kind, metadata: { url: asset.url } },
        preview: { kind: asset.kind, url: asset.url }, asset: { id: asset.id, name: asset.name, permission: "owner" },
      })),
      } });
    }
    if (skillCoversOnly) {
      const h3 = { id: "h3-commerce-video", label: "H3 带货视频", origin: "system" };
      const personal = { id: "qa-personal", label: "个人商品摄影", scope: "personal", origin: "custom",
        cover: "assets/商品摄影.png" };
      const empty = { id: "qa-empty", label: "无封面 Skill", scope: "personal", origin: "custom" };
      if (url.pathname === "/api/canvas-agent/skills") {
        return route.fulfill({ json: { configured: true, skills: [h3, personal, empty], pickerSkills: [personal, empty] } });
      }
      if (url.pathname === "/api/skills/detail") {
        if (url.searchParams.get("skill_id") === personal.id) {
          assert.equal(url.searchParams.has("scope"), false);
          return route.fulfill({ json: { ...personal, instructions: "## 所需输入\n- 商品照片\n## 预期产出\n- 摄影方案",
            presentation: { media: [{ id: "single", type: "image/png" }] },
          } });
        }
        if (url.searchParams.get("skill_id") === empty.id) return route.fulfill({ status: 503 });
        assert.equal(url.searchParams.get("skill_id"), h3.id);
        assert.equal(url.searchParams.get("scope"), "public");
        return route.fulfill({ json: { ...h3, scope: "system", coverId: "cover", presentation: {
          updatedAt: `2026-11-23T06:00:0${coverRevision}.000Z`,
          summary: "结合商品信息和参考图，准备带货视频方案。",
          capabilities: "规划带货文案、分镜与 H3 双段提示词。",
          inputs: "商品资料、参考图",
          outputs: "带货视频方案",
          media: [
            { id: "cover", type: "image/png", title: "视频方案封面" },
            { id: "second", type: "image/png", title: "补充案例" },
            { id: "video", type: "video/mp4", title: "带货视频案例" },
          ],
        } } });
      }
      if (url.pathname === "/api/skills/media") {
        if (url.searchParams.get("media_id") === "video") return route.fulfill({ body: video, contentType: "video/mp4" });
        return route.fulfill({ body: thumb, contentType: "image/svg+xml" });
      }
    }
    const testSkill = url.searchParams.get("skill_id");
    if (skillSubmissionOnly && testSkill) {
      if (url.pathname === "/api/skills/detail") return route.fulfill({ json: {
        id: testSkill, instructions: testSkill === fashionSkillId ? "需要至少一张服装商品图。" : "先核对本任务所需资料，然后继续原流程。",
        references: testSkill === fashionSkillId ? [{ path: "references/workflow.md" }] : [],
      } });
      if (url.pathname === "/api/skills/reference") return route.fulfill({ json: {
        skill_id: testSkill, path: url.searchParams.get("path"), content: "请收集真实参考资料，等待用户确认。",
      } });
    }
    if (url.pathname === "/api/canvas-agent/skills") skillCatalogLoads++;
    return route.fulfill({ json: {
      boards: [], projects: [], models: [], providers: [], settings: {}, preferences: {}, resources: [],
      skills: [{ id: "qa-skill", label: "版式策划", origin: "custom", validation_status: "verified" }, ...(skillPositionOnly || intentOnly || governanceOnly ? extraSkills : []),
        ...(skillSubmissionOnly ? [{ id: fashionSkillId, label: fashionSkillLabel, origin: "custom", category: "general", required_selection: "image",
          references: [{ path: "references/workflow.md" }] },
          { id: "qa-media-intake", label: "商品配音", origin: "custom", category: "general" }, ...extraSkills.slice(0, 2)] : []),
        ...(posterOnly || governanceOnly ? [{ id: "poster-design", label: "海报设计", origin: "system" }] : []),
        ...(creativeBatchOnly || skillSubmissionOnly ? [{
          id: "commercial-product-photography-10", name: "commercial-product-photography-10",
          label: "商业产品摄影 · 十种创意方案", description: "规划十种商业产品摄影创意。",
          category: "image", origin: "custom", enabled: true, validation_status: "verified",
          canvas: { id: "commercial-product-photography-10", label: "商业产品摄影 · 十种创意方案",
            category: "image", required_context: "image", toolBindingDeclared: false, capabilities: [], triggers: [] },
          capabilities: [], triggers: [], tools: [], tool_binding_declared: false,
        }] : [])],
      configured: true, agentSettings: { configured: true },
    } });
  });

  async function openBoard() {
    const result = await page.goto(origin, { waitUntil: "domcontentloaded" });
    assert.equal(result.headers()["x-ai-os-frontend"], "fixed-stage");
    await page.frameLocator("#aiOsNeonFrame").getByRole("button", { name: `打开画布 ${title}` }).click();
    await page.locator("#neonEngineSurface").waitFor();
    const panel = page.locator("#canvasAgentPanel");
    if (!sidePanelsOnly && await panel.getAttribute("aria-hidden") === "true") await page.locator("#canvasAgentToggle").click();
    await panel.waitFor();
    await page.getByText("隔离历史消息已恢复。", { exact: true }).waitFor();
  }

  const form = page.locator("#canvasAgentForm");
  const prompt = page.locator("#canvasAgentPrompt");
  const media = page.locator("#canvasAgentContext");
  const preference = page.locator("#canvasAgentGenerationPopover");
  const preferenceTrigger = page.locator("#canvasAgentGenerationButton");
  const skillTrigger = page.locator("#canvasAgentSkillBook");
  const skillPopover = page.locator("#canvasAgentSkillPopover");
  const skillDetail = page.locator("#canvasAgentSkillDetail");
  const detailButton = id => skillPopover.locator(`[data-agent-skill-detail="${id}"]`);
  const automatic = page.locator("#canvasAgentGenerationAutomatic");
  const setting = (field, value) => preference.locator(`[data-agent-generation="${field}"][data-value="${value}"]`);
  const model = page.locator("#canvasAgentGenerationModel");
  const waitSaved = expected => page.waitForFunction(async expectedSettings => {
    const response = await fetch("/api/canvas-agent/conversation?board_id=qa-agent-composer");
    const current = (await response.json()).generationSettings;
    return Object.entries(expectedSettings).every(([key, value]) => current[key] === value);
  }, expected);
  const tile = name => media.locator(`[data-agent-node-id][title="${name}"]`);
  const capture = suffix => form.screenshot({ path: path.join(output, `${screenshotPrefix}-${suffix}.png`) });
  const addCanvasMedia = () => page.evaluate(() => {
    const types = [["image", "画布参考图", "svg"], ["video", "产品视频", "mp4"], ["audio", "配音音频", "wav"]];
    return types.map(([kind, name, ext], index) => {
      const node = addCanvasAssetCollection({ x: 140 + 220 * index, y: 180 }, {
        title: name, mode: "single", deferSave: true,
        members: [{ id: `composer-${kind}`, kind, src: `/qa-material/canvas.${ext}`, name }],
      });
      node.dataset.nodeTitle = name;
      pinCanvasNode(node.dataset.id);
      return { id: node.dataset.id, name, kind };
    });
  });
  async function mention(id) {
    await prompt.press("End");
    await prompt.press("@");
    await page.locator(`[data-agent-mention-id="${id}"]`).click();
  }
  async function checkPopover(trigger, popover, width) {
    await trigger.click();
    await popover.waitFor();
    const bounds = await popover.boundingBox();
    const anchor = await trigger.boundingBox();
    const panel = await page.locator("#canvasAgentPanel").boundingBox();
    const side = await popover.getAttribute("data-placement");
    assert.ok(bounds.x >= 7 && bounds.y >= 7 && bounds.x + bounds.width <= width - 7 && bounds.y + bounds.height <= 893,
      `${width} ${side}: popup outside viewport`);
    assert.equal(side, "above");
    assert.ok(Math.abs(anchor.y - bounds.y - bounds.height - 8) < 2, `${width}: gap`);
    assert.ok(bounds.x >= panel.x && bounds.x + bounds.width <= panel.x + panel.width && bounds.y >= panel.y);
    assert.ok(bounds.x <= anchor.x + anchor.width / 2 && bounds.x + bounds.width >= anchor.x + anchor.width / 2);
    return side;
  }

  const skillGeometry = () => page.evaluate(() => {
    const panel = document.querySelector("#canvasAgentPanel").getBoundingClientRect();
    const button = document.querySelector("#canvasAgentSkillBook").getBoundingClientRect();
    const popup = document.querySelector("#canvasAgentSkillPopover").getBoundingClientRect();
    return {
      gap: button.top - popup.bottom,
      panelOverflow: Math.max(panel.left - popup.left, popup.right - panel.right, panel.top - popup.top, popup.bottom - panel.bottom),
      viewportOverflow: Math.max(-popup.left, -popup.top, popup.right - innerWidth, popup.bottom - innerHeight),
      aligned: popup.left <= button.left + button.width / 2 && popup.right >= button.left + button.width / 2,
    };
  });
  const isAnchored = geometry => geometry.gap >= 6 && geometry.gap <= 8.5
    && geometry.panelOverflow <= 0.5 && geometry.viewportOverflow <= 0.5 && geometry.aligned;
  async function assertSkillPosition() {
    await skillPopover.waitFor();
    for (let frame = 0; frame < 30; frame++) {
      const geometry = await skillGeometry();
      if (isAnchored(geometry)) return geometry;
      await page.evaluate(() => new Promise(requestAnimationFrame));
    }
    const geometry = await skillGeometry();
    assert.ok(isAnchored(geometry), JSON.stringify(geometry));
  }

  async function checkSkillPositionOnly() {
    const row = skillPopover.locator('[data-agent-skill="qa-skill"]');
    const search = page.locator("#canvasAgentSkillSearch");
    const list = page.locator("#canvasAgentSkills");
    await skillTrigger.click();
    await row.waitFor();
    if (before) {
      await page.screenshot({ path: path.join(output, "before.png") });
      await assertSkillPosition();
      return;
    }
    await assertSkillPosition();
    await page.screenshot({ path: path.join(output, "after.png") });
    const catalogLoads = skillCatalogLoads;
    const popupElement = await skillPopover.elementHandle();
    const results = [];
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      results.push({ width, ...await assertSkillPosition() });
    }
    const handle = page.locator("#canvasAgentResizeHandle");
    await handle.press("End");
    await assertSkillPosition();
    await handle.press("Home");
    await assertSkillPosition();
    const divider = await handle.boundingBox();
    await page.mouse.move(divider.x + divider.width / 2, divider.y + divider.height / 2);
    await page.mouse.down();
    await page.mouse.move(divider.x - 145, divider.y + divider.height / 2, { steps: 6 });
    await assertSkillPosition();
    await page.mouse.up();
    await assertSkillPosition();
    await page.setViewportSize({ width: 768, height: 420 });
    await assertSkillPosition();
    await list.evaluate(element => { element.scrollTop = element.scrollHeight; });
    assert.ok(await list.evaluate(element => element.scrollTop > 0));
    await assertSkillPosition();
    assert.equal(await popupElement.evaluate(element => element === document.querySelector("#canvasAgentSkillPopover")), true);
    assert.equal(skillCatalogLoads, catalogLoads);
    await popupElement.dispose();
    assert.equal(await skillPopover.getByRole("button", { name: "更多", exact: true }).isVisible(), true);
    await search.fill("版式策划");
    assert.equal(await list.locator("[data-agent-skill]").count(), 1);
    await row.click();
    await skillPopover.waitFor({ state: "hidden" });
    await page.waitForFunction(() => window.CanvasAgentUi?.getActiveSkillId() === "qa-skill");
    await skillTrigger.click();
    assert.equal(await row.getAttribute("aria-pressed"), "true");
    await detailButton("qa-skill").click();
    await skillDetail.getByRole("button", { name: "喜欢", exact: true }).click();
    await skillDetail.getByRole("button", { name: "关闭 Skill 详情" }).click();
    await search.fill("");
    await skillPopover.getByRole("tab", { name: "喜欢" }).click();
    assert.equal(await list.locator("[data-agent-skill]").count(), 1);
    await skillPopover.getByRole("tab", { name: "我的" }).click();
    assert.ok(await list.locator("[data-agent-skill]").count() > 1);
    await skillPopover.getByRole("tab", { name: "综合" }).click();
    assert.equal(await list.locator('[data-agent-skill="h3-commerce-video"], [data-agent-skill="natural-aesthetic-product-photography"]').count(), 2);
    await skillTrigger.click();
    await skillPopover.waitFor({ state: "hidden" });
    await skillTrigger.click();
    await page.mouse.click(40, 120);
    await skillPopover.waitFor({ state: "hidden" });
    await openBoard();
    await skillTrigger.click();
    await assertSkillPosition();
    assert.equal(await row.getAttribute("aria-pressed"), "true");
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ origin, results, errors, output }, null, 2));
  }

  async function checkCreativeBatchOnly() {
    await openBoard();
    productNodeId = await page.evaluate(src => {
      const node = addCanvasImage(src, "手机壳产品原图", { x: 420, y: 300 });
      selectCanvasNode(node);
      return node.dataset.id;
    }, creativeProductImage ? "/qa-material/creative-product.jpg" : "/qa-material/phone.svg");
    await page.waitForFunction(id => serializeCanvasBoard().nodes.some(node => node.id === id && node.width > 0), productNodeId);
    await page.evaluate(() => saveCanvasBoardNow({ recordUndo: false }));
    await page.waitForFunction(() => window.CanvasAgentUi?.getActiveSkillId() === "commercial-product-photography-10");
    const sourceCount = boardOperations.length;
    const send = async text => {
      await prompt.fill(text);
      await prompt.press("Enter");
    };
    const request = "帮我按当前 Skill 为手机壳生成十种商业摄影创意方案。";
    await send(request);
    const card = page.locator(".canvas-agent-creative-batch");
    await card.getByText("十种创意方案已准备完成", { exact: true }).waitFor().catch(async error => {
      throw new Error(JSON.stringify({
        status: await page.locator("#canvasAgentStatus").textContent(),
        messages: (await page.locator("#canvasAgentMessages").innerText()).slice(-1200),
        selectedSkill: await page.evaluate(() => CanvasAgentUi.getActiveSkillId()),
        operations: boardOperations.length - sourceCount,
      }), { cause: error });
    });
    assert.deepEqual(boardOperations.slice(sourceCount), [], "planning only creates no nodes");
    assert.equal(promptTurns.length, 1);
    assert.equal(await card.getByRole("button", { name: "确认创建十个节点" }).count(), 1);
    assert.equal(await card.locator("details").count(), 10);
    assert.equal(await card.getByRole("img", { name: "手机壳产品原图" }).count(), 1);
    assert.equal(generationRequests.length, 0);
    const planned = conversation.pendingWorkflow;
    assert.equal(planned.workflowId, await card.getAttribute("data-workflow-id"));
    assert.equal(planned.items.length, 10);
    assert.deepEqual(planned.sourceNodeIds, [productNodeId]);
    await card.screenshot({ path: path.join(output, "creative-batch-confirmation.png") });

    readbackFailureSlot = 5;
    readbackFailureCount = 1;
    loseCreativeSave = true;
    const confirmButton = card.getByRole("button", { name: "确认创建十个节点" });
    await confirmButton.evaluate(button => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await card.getByText(/节点状态 9\/10 已保存/).waitFor().catch(async error => {
      throw new Error(JSON.stringify({
        status: await page.locator("#canvasAgentStatus").textContent(),
        batchState: conversation.pendingWorkflow?.batchState,
        errors: conversation.pendingWorkflow?.items.map(({ slot, error }) => [slot, error]),
        parameters: conversation.pendingWorkflow?.parameters,
        nodes: boardNodes.slice(0, 3).map(({ nodeTitle, model, size, resolution, x, y, prompt }) => ({ nodeTitle, model, size, resolution, x, y, prompt })),
      }), { cause: error });
    });
    let batchNodes = boardNodes.filter(node => node.kind === "image" && node.nodeTitle?.match(/^\d{2} /u));
    assert.equal(batchNodes.length, 10);
    assert.equal(lostCreativeSaves, 1, "a committed write lost its response");
    assert.equal(generationRequests.length, 0);
    await card.screenshot({ path: path.join(output, "creative-batch-partial.png") });
    const nodeOperationsBeforeRetry = boardOperations.filter(operation => operation.after?.nodeTitle?.match(/^\d{2} /u)).length;
    await card.getByRole("button", { name: /重试未完成项/ }).click();
    await page.getByText(/十种创意方案的图片生成节点已全部保存并核验（10\/10）/).waitFor();
    batchNodes = boardNodes.filter(node => node.kind === "image" && node.nodeTitle?.match(/^\d{2} /u));
    assert.equal(batchNodes.length, 10, "retry reused the persisted node with the same stable identity");
    assert.equal(boardOperations.filter(operation => operation.after?.nodeTitle?.match(/^\d{2} /u)).length, nodeOperationsBeforeRetry);
    for (let slot = 1; slot <= 10; slot += 1) {
      const node = batchNodes.find(item => item.nodeTitle.startsWith(String(slot).padStart(2, "0")));
      assert.ok(node, `slot ${slot}`);
      assert.ok(node.prompt.includes(`方向 ${slot}：`), `prompt slot ${slot}`);
      assert.equal(node.prompt, planned.items[slot - 1].prompt);
      assert.equal(node.canvasModel || node.model, planned.parameters.model);
      assert.equal(node.canvasSize || node.size, planned.parameters.size);
      assert.equal(node.resolution, planned.parameters.resolution);
      assert.ok(boardOperations.some(operation => operation.type === "connection.upsert"
        && operation.after?.from === productNodeId && operation.after?.to === node.id), `source connection slot ${slot}`);
    }
    assert.equal(new Set(batchNodes.map(node => node.prompt)).size, 10);
    const orderedNodes = [...batchNodes].sort((a, b) => a.nodeTitle.localeCompare(b.nodeTitle));
    const layout = orderedNodes.map(node => [node.x, node.y]);
    assert.equal(new Set(layout.map(point => point.join(","))).size, 10);
    assert.deepEqual(layout, conversation.pendingWorkflow.layout.map(point => [point.x, point.y]));
    assert.equal(new Set(batchNodes.map(node => node.x)).size, 5, "ten concepts must use five aligned columns");
    assert.equal(new Set(batchNodes.map(node => node.y)).size, 2, "ten concepts must use two aligned rows");
    const [first, second] = [orderedNodes.slice(0, 5), orderedNodes.slice(5)];
    assert.deepEqual(second.map(node => node.x), first.map(node => node.x));
    assert.ok(first[0].y < second[0].y);
    const gaps = first.slice(1).map((node, index) => node.x - first[index].x - first[index].width);
    assert.ok(gaps.every(gap => gap === gaps[0] && gap > 0), "columns need uniform positive spacing");
    const rowGaps = second.map((node, index) => node.y - first[index].y - first[index].height);
    assert.ok(rowGaps.every(gap => gap === rowGaps[0] && gap > 0), "rows need uniform positive spacing");
    const original = boardNodes.find(node => node.id === productNodeId);
    assert.deepEqual([original.x, original.y], [420, 300]);
    assert.ok(first[0].x >= original.x + original.width, "the grid must stay to the right of the product");
    for (const [index, a] of batchNodes.entries()) {
      assert.ok(batchNodes.slice(index + 1).every(b => a.x + a.width <= b.x || b.x + b.width <= a.x
        || a.y + a.height <= b.y || b.y + b.height <= a.y), `node overlaps: ${a.nodeTitle}`);
    }
    assert.deepEqual(generationRequests, []);
    await openBoard();
    const refreshed = await page.evaluate(() => serializeCanvasBoard().nodes);
    assert.equal(refreshed.filter(node => node.nodeTitle?.match(/^\d{2} /u)).length, 10, "refresh restores all ten nodes");
    assert.deepEqual(orderedNodes.map(node => {
      const restored = refreshed.find(item => item.id === node.id);
      return [restored.x, restored.y, restored.prompt, restored.model, restored.size, restored.resolution];
    }), orderedNodes.map(node => [node.x, node.y, node.prompt, node.model, node.size, node.resolution]));
    await card.getByText("十个图片节点已保存", { exact: true }).waitFor();
    assert.equal(await card.getByRole("button", { name: "确认创建十个节点" }).count(), 0);
    await page.evaluate(ids => {
      clearCanvasSelection();
      const boxes = ids.map(id => resolveNodeVisualGeometry(id).outerBounds);
      const bounds = CanvasGeometryRules.unionRects(boxes);
      const view = document.querySelector("#infiniteCanvas").getBoundingClientRect();
      const panel = document.querySelector("#canvasAgentPanel").getBoundingClientRect();
      const width = Math.min(view.width, panel.left - view.left);
      canvasState.scale = Math.min((width - 110) / (bounds.right - bounds.left), (view.height - 200) / (bounds.bottom - bounds.top));
      canvasState.x = width / 2 - (bounds.right + bounds.left) * canvasState.scale / 2;
      canvasState.y = view.height / 2 - (bounds.top + bounds.bottom) * canvasState.scale / 2;
      applyCanvasTransformNow();
    }, [productNodeId, ...orderedNodes.map(node => node.id)]);
    await page.waitForFunction(ids => ids.every(id => {
      const box = resolveNodeVisualGeometry(id).outerBounds;
      const viewport = getCanvasAppliedViewport();
      return box.left * viewport.scale + viewport.x >= 0;
    }), [productNodeId, ...orderedNodes.map(node => node.id)]);
    await page.screenshot({ path: path.join(output, "creative-batch-created.png") });
    if (creativeProductImage) await page.screenshot({ path: path.join(output, "creative-batch-layout-33200.png") });

    const nodeCountBeforeTextOnly = boardOperations.length;
    await page.evaluate(id => selectCanvasNode(ensureCanvasNodeMounted(id)), productNodeId);
    await send(request);
    await card.getByText("十种创意方案已准备完成", { exact: true }).waitFor().catch(async error => {
      throw new Error(JSON.stringify({ status: await page.locator("#canvasAgentStatus").textContent(),
        selected: await page.evaluate(() => [...canvasState.selectedIds]), activeSkill: conversation.activeSkillId,
        messages: (await page.locator("#canvasAgentMessages").innerText()).slice(-1000), errors }), { cause: error });
    });
    const beforeOutputCount = boardOperations.length;
    await card.getByRole("button", { name: "仅输出提示词" }).click();
    await page.locator("#canvasAgentStatus").filter({ hasText: "十组完整提示词已输出；未创建节点，也未生成图片。" }).waitFor({ state: "attached" });
    assert.equal(boardOperations.length, beforeOutputCount);
    assert.equal(boardNodes.filter(node => node.nodeTitle?.match(/^\d{2} /u)).length, 10);
    assert.equal(generationRequests.length, 0);
    await page.waitForFunction(async () => {
      const response = await fetch("/api/canvas-agent/conversation?board_id=qa-agent-composer");
      const data = await response.json();
      return data.items.filter(item => item.role === "assistant" && /^(?:0[1-9]|10) /u.test(item.text)).length >= 10;
    });
    const lastTenPrompts = conversation.items.filter(item => item.role === "assistant" && /^(?:0[1-9]|10) /u.test(item.text)).slice(-10);
    assert.equal(lastTenPrompts.length, 10);
    for (const item of planned.items) assert.ok(lastTenPrompts.some(message => message.text.endsWith(item.prompt)));

    await send(request);
    await card.getByText("十种创意方案已准备完成", { exact: true }).waitFor();
    await card.getByRole("button", { name: "调整方案" }).click();
    const fourth = card.locator('[data-creative-batch-prompt="4"]');
    await fourth.fill("新方向4：几何光影世界改用玻璃折射布光，产品开孔和配件原样保留。");
    await card.locator('[data-creative-batch-direction="4"]').fill("玻璃折射的几何光影");
    await card.getByRole("button", { name: "保存调整" }).click();
    let started, release;
    const reading = new Promise(resolve => { started = resolve; });
    interruptReadback = { started, release: new Promise(resolve => { release = resolve; }) };
    await card.getByRole("button", { name: "确认创建十个节点" }).click();
    await Promise.race([reading, page.waitForTimeout(7000).then(() => { throw new Error("批次未到达可中断的保存回读阶段"); })]);
    assert.equal(conversation.pendingWorkflow?.batchState, "creating");
    const beforeReloadIds = boardNodes.filter(node => /^\d{2} /u.test(node.nodeTitle || "")).map(node => node.id).sort();
    try { await openBoard(); } finally { release(); }
    await card.getByRole("button", { name: /重试未完成项/ }).click();
    await card.getByText("十个图片节点已保存", { exact: true }).waitFor();
    const all = boardNodes.filter(node => node.kind === "image" && node.nodeTitle?.match(/^\d{2} /u));
    assert.deepEqual(all.map(node => node.id).sort(), beforeReloadIds, "interruption and reload reuse the original node IDs");
    assert.equal(all.length, 20, "the adjusted second batch creates ten separate nodes");
    const adjusted = all.filter(node => node.prompt.includes("新方向4"));
    assert.equal(adjusted.length, 1);
    assert.match(adjusted[0].nodeTitle, /玻璃折射的几何光影/u);
    const secondBatchId = conversation.pendingWorkflow?.workflowId;
    const nextBatch = all.filter(node => node.agentNodeIdentityKey?.startsWith(`key:workflow:${secondBatchId}-slot-`))
      .sort((a, b) => a.nodeTitle.localeCompare(b.nodeTitle));
    assert.equal(nextBatch.length, 10);
    assert.deepEqual(nextBatch.map((node, index) => [node.x - nextBatch[0].x, node.y - nextBatch[0].y]),
      orderedNodes.map(node => [node.x - orderedNodes[0].x, node.y - orderedNodes[0].y]), "avoidance translates the whole grid");
    assert.deepEqual(orderedNodes.map(node => {
      const current = all.find(item => item.id === node.id);
      return [current.x, current.y];
    }), layout, "avoidance never moves the existing batch");
    assert.ok(nextBatch.every(a => orderedNodes.every(b => a.x + a.width <= b.x || b.x + b.width <= a.x
      || a.y + a.height <= b.y || b.y + b.height <= a.y)), "the new batch must avoid the existing batch");
    assert.deepEqual(generationRequests, []);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(output, "creative-batch-adjusted.png") });
    console.log(JSON.stringify({
      origin, output,
      cases: ["原图视觉输入", "结构化确认卡", "双击防重", "部分失败", "失败项恢复", "保存回包丢失", "中断刷新续作", "两行五列十节点",
        "同一原图连线", "保存回读", "刷新恢复", "仅输出提示词", "单方向修订", "无生图请求"],
      imageGenerationRequests: generationRequests.length,
      nodes: all.map(node => ({ id: node.id, title: node.nodeTitle, promptLength: node.prompt.length })),
      operations: boardOperations.length - nodeCountBeforeTextOnly,
      errors,
    }, null, 2));
  }

  async function checkPosterOnly() {
      await page.evaluate(() => window.CanvasAgentUi.useSkill("poster-design"));
      const fixtures = await page.evaluate(() => {
        const phone = addCanvasImage("/qa-material/phone.svg", "手机壳产品原图", { x: 420, y: 300 });
        const style = addCanvasImage("/qa-material/style.svg", "窗影风格参考", { x: 690, y: 340 });
        CanvasAgentCanvasApi.selectNodeForAgentPicker(phone.dataset.id);
        return { phone: phone.dataset.id, style: style.dataset.id };
      });
      const send = async text => {
        await prompt.fill(text);
        await prompt.press("Enter");
      };
      const card = page.locator(".canvas-agent-brief");
      await send("以此产品生成一张春节海报。");
      await card.getByText("确认海报方案").waitFor();
      assert.equal(await card.getByRole("img", { name: "手机壳产品原图" }).count(), 1);
      assert.deepEqual(promptTurns.at(-1).canvas.agent_image_attachments.map(ref => ref.node_id), [fixtures.phone]);
      assert.equal(generationRequests.length, 0);
      await card.screenshot({ path: path.join(output, "poster-brief.png") });
      await openBoard();
      await card.getByText("确认海报方案").waitFor();
      assert.equal(await card.getByRole("img", { name: "手机壳产品原图" }).count(), 1);
      await card.getByRole("button", { name: "调整后再创建" }).click();
      await card.locator("[data-agent-brief-revision]").fill("改用青色窗影");
      await card.getByRole("button", { name: "更新方案" }).click();
      await card.getByText("青色窗影，4:5 竖版，上部标题安全区。", { exact: true }).waitFor();
      posterImageVersion = 1;
      await card.getByRole("button", { name: "确认并创建节点" }).click();
      await page.getByText(/原图版本已变化/).waitFor();
      assert.equal(boardOperations.filter(operation => operation.after?.nodeTitle === "海报主视觉").length, 0);
      posterImageVersion = 0;
      await card.getByRole("button", { name: "确认创建并生成 1 张（付费）" }).click();
      await page.getByText(/生成失败，已创建的节点和参数仍保留/).waitFor().catch(async error => {
        throw new Error(JSON.stringify({ status: await page.locator("#canvasAgentStatus").textContent(),
          messages: (await page.locator("#canvasAgentMessages").innerText()).slice(-1000),
          operations: boardOperations.map(op => [op.type, op.after?.nodeTitle]), paid: generationRequests.length, errors }), { cause: error });
      });
      const board = await page.evaluate(() => serializeCanvasBoard());
      const poster = board.nodes.find(node => node.nodeTitle === "海报主视觉");
      assert.ok(poster && /青色窗影/u.test(poster.prompt) && !/深红/u.test(poster.prompt), JSON.stringify(board.nodes));
      assert.ok(board.nodes.some(node => node.textName === "海报 Brief 与排版文案" && /新春好礼/u.test(node.text)));
      assert.ok(board.connections.some(link => link.from === fixtures.phone && link.to === poster.id));
      assert.ok(!board.connections.some(link => link.from === fixtures.style && link.to === poster.id));
      assert.equal(generationRequests.length, 1);
      assert.match(JSON.stringify(generationRequests[0]), /phone\.svg/u, "generation receives the actual original reference");
      assert.doesNotMatch(JSON.stringify(generationRequests[0]), /style\.svg/u);
      await page.screenshot({ path: path.join(output, "poster-saved.png") });
      await card.getByRole("button", { name: "重试生成" }).click();
      await page.getByText("图片已生成并保存到画布", { exact: true }).first().waitFor();
      assert.equal(generationRequests.length, 2);
      assert.equal(generationRequests[1].node_id, poster.id);
      const saved = await page.evaluate(() => serializeCanvasBoard());
      assert.equal(saved.nodes.filter(node => node.nodeTitle === "海报主视觉").length, 1);
      assert.match(JSON.stringify(saved.nodes.find(node => node.id === poster.id)), /qa-poster-result\.png/u);
      assert.ok(!saved.nodes.some(node => node.kind === "gallery"));
      await page.waitForFunction(async ({ boardId, nodeId }) => {
        const response = await fetch(`/api/canvas/boards/${boardId}/snapshot`);
        const record = (await response.json()).nodes?.find(node => node.id === nodeId);
        return Boolean(record && JSON.stringify(record).includes("qa-poster-result.png"));
      }, { boardId, nodeId: poster.id });
      await openBoard();
      assert.ok(await page.evaluate(id => serializeCanvasBoard().nodes.some(node => node.id === id
        && node.prompt.includes("青色窗影") && JSON.stringify(node).includes("qa-poster-result.png")), poster.id));
      assert.equal(generationRequests.length, 2, "refresh does not resubmit the paid job");
      await page.evaluate(() => clearCanvasSelection());
      const turnCount = promptTurns.length;
      await send("以此产品生成一张春节海报。");
      await page.getByText(/本轮没有有效产品图/).first().waitFor();
      assert.equal(promptTurns.length, turnCount);
      await page.evaluate(({ phone, style }) => {
        const nodes = [phone, style].map(id => {
          const node = ensureCanvasNodeMounted(id);
          if (!node) throw new Error(`fixture node unavailable: ${id}`);
          return node;
        });
        selectCanvasNode(nodes[0]);
        addCanvasNodeToSelection(nodes[1]);
      }, fixtures);
      assert.deepEqual(await page.evaluate(() => [...canvasState.selectedIds]), [fixtures.phone, fixtures.style]);
      await send("用这两张图片设计春节海报，手机壳是产品，窗影图只作风格参考。");
      await card.getByText("确认海报方案").waitFor();
      assert.deepEqual(promptTurns.at(-1).canvas.agent_image_attachments.map(ref => ref.node_id), [fixtures.phone, fixtures.style],
        JSON.stringify({ selection: promptTurns.at(-1).canvas.agent_selection_node_ids,
          attachments: promptTurns.at(-1).canvas.agent_image_attachments, fixtures }));
      assert.equal(await card.getByRole("img").count(), 2);
      assert.equal(await card.getByRole("button", { name: /付费/u }).count(), 0);
      await card.getByRole("button", { name: "确认并创建节点" }).click();
      await card.waitFor({ state: "hidden" });
      const combined = await page.evaluate(() => serializeCanvasBoard());
      const multi = combined.nodes.find(node => node.nodeTitle === "海报主视觉" && node.id !== poster.id);
      assert.match(multi?.prompt || "", /@图2 只参考窗影/u);
      assert.ok([fixtures.phone, fixtures.style].every(id => combined.connections.some(link => link.from === id && link.to === multi.id)));
      assert.equal(generationRequests.length, 2, "creating a design alone must not submit generation");
      await page.evaluate(style => selectCanvasNode(ensureCanvasNodeMounted(style)), fixtures.style);
      await prompt.fill("以 @图1 为产品原图设计春节海报。");
      await mention(fixtures.phone);
      const mentionRequest = page.waitForRequest(request => request.url().endsWith("/api/canvas-agent/turn"));
      await prompt.press("Enter");
      const mentionPayload = (await mentionRequest).postDataJSON();
      await card.getByText("确认海报方案").waitFor();
      assert.deepEqual(mentionPayload.canvas.agent_image_attachments.map(ref => ref.node_id), [fixtures.phone]);
      await page.evaluate(phone => deleteCanvasNodes([ensureCanvasNodeMounted(phone)]), fixtures.phone);
      await card.getByRole("button", { name: "确认并创建节点" }).click();
      await page.getByText(/参考图片节点已删除或不可访问/).waitFor();
      await card.getByRole("button", { name: "取消" }).click();
      await page.evaluate(() => clearCanvasSelection());
      await page.locator("#canvasAgentContextAdd").click();
      const [chooser] = await Promise.all([
        page.waitForEvent("filechooser"), page.locator('[data-agent-attachment="upload"]').click(),
      ]);
      await chooser.setFiles([{ name: "聊天上传产品.png", mimeType: "image/png", buffer: image }]);
      await tile("聊天上传产品.png").waitFor();
      await send("帮我用上传的图片设计一张春节海报。");
      await card.getByText("确认海报方案").waitFor();
      assert.equal(promptTurns.at(-1).canvas.agent_image_attachments[0].source, "upload");
      assert.equal(uploads.length, 1, "uploaded media is reused without re-uploading");
      assert.equal(generationRequests.length, 2);
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ origin, output, cases: ["原图核对", "刷新", "修订", "换图拦截", "节点保存和连线", "隔离生成失败和重试回写", "缺图", "多选", "@图", "删除拒绝", "聊天上传"], mockGenerationRequests: generationRequests.length }, null, 2));
  }

  async function checkIntentOnly() {
      const [selected] = await addCanvasMedia();
      await page.waitForFunction(id => {
        const entry = serializeCanvasBoard().nodes.find(node => node.id === id);
        return entry?.width > 0 && entry?.height > 0;
      }, selected.id);
      await page.evaluate(() => saveCanvasBoardNow({ recordUndo: false }));
      await page.evaluate(id => selectCanvasNode(ensureCanvasNodeMounted(id)), selected.id);
      if (await page.evaluate(() => CanvasAgentUi.getActiveSkillId()) !== "natural-aesthetic-product-photography") {
        await skillTrigger.click();
        await page.locator('[data-agent-skill="natural-aesthetic-product-photography"]').click();
      }
      await page.waitForFunction(() => window.CanvasAgentUi?.getActiveSkillId() === "natural-aesthetic-product-photography");
      const boardBefore = await page.evaluate(() => JSON.stringify(serializeCanvasBoard().nodes));
      const operationCount = boardOperations.length;
      const results = [];
      assert.equal(promptTurns.length, 0);
      for (const [index, [input, answer]] of intentCases.entries()) {
        const width = [390, 768, 1440, 1728][index % 4];
        await page.setViewportSize({ width, height: 900 });
        await prompt.fill(input);
        if (index === 4 || index === 5) {
          await mention(selected.id);
        }
        await page.locator("#canvasAgentSend").click();
        await page.getByText(answer, { exact: true }).waitFor().catch(async error => {
          throw new Error(`${input}: ${await page.locator("#canvasAgentStatus").textContent()} (${promptTurns.at(-1)?.vision_images?.length || 0} images)`, { cause: error });
        });
        const sent = promptTurns.at(-1);
        assert.ok(sent.user_intent_prompt.startsWith(input));
        assert.equal(sent.skill_mode, "auto");
        assert.equal(sent.skill_id, "");
        assert.notEqual(sent.skill_workflow, true);
        assert.ok(sent.canvas.nodes.some(node => node.id === selected.id));
        if (index === 4 || index === 5) assert.ok(sent.vision_images.length > 0, "vision receives actual image content");
        assert.equal(await page.locator(".canvas-agent-brief:visible, .canvas-agent-wizard:visible").count(), 0);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        results.push({ width, input, vision: sent.vision_images.length });
      }
      assert.equal(new Set(promptTurns.map(turn => turn.run_id)).size, intentCases.length);
      assert.equal(boardOperations.length, operationCount, JSON.stringify(boardOperations.slice(operationCount)));
      assert.deepEqual(generationRequests, []);
      assert.equal(await page.evaluate(() => JSON.stringify(serializeCanvasBoard().nodes)), boardBefore);
      assert.deepEqual(errors, []);
      await capture("intent-routing");
      console.log(JSON.stringify({ origin, results, errors, generationRequests, canvasWrites: boardOperations.length - operationCount }, null, 2));
  }

  try {
    if (skillCoversOnly) {
      await openBoard();
      const draft = "保留当前对话草稿";
      await prompt.fill(draft);
      await skillTrigger.click();
      const h3 = page.locator('[data-agent-skill="h3-commerce-video"]');
      const image = h3.locator("img");
      const personal = page.locator('[data-agent-skill="qa-personal"]');
      const search = page.locator("#canvasAgentSkillSearch");
      const tab = name => skillPopover.getByRole("tab", { name, exact: true });
      await image.waitFor();
      await h3.locator(".canvas-agent-skill-thumb.is-loaded").waitFor();
      const initial = new URL(await image.getAttribute("src"), origin);
      assert.equal(initial.searchParams.get("media_id"), "cover");
      assert.equal(initial.searchParams.get("scope"), "public");
      assert.equal(new URL(await personal.locator("img").getAttribute("src"), origin).searchParams.get("path"), "assets/商品摄影.png");
      assert.equal(await page.locator('[data-agent-skill="qa-empty"] .canvas-agent-skill-thumb img').count(), 0);
      await page.locator('[data-agent-skill="qa-empty"] .canvas-agent-skill-thumb').waitFor();
      assert.equal(await skillPopover.locator("[data-agent-skill-favorite]").count(), 0);
      await detailButton("h3-commerce-video").waitFor();
      const activeBefore = await page.evaluate(() => window.CanvasAgentUi.getActiveSkillId());
      await h3.hover();
      const preview = page.locator("#canvasAgentSkillPreview");
      await preview.locator("img").waitFor();
      await page.screenshot({ path: path.join(output, "skill-list-hover-1440.png") });
      const listWidth = (await skillPopover.boundingBox()).width;
      await detailButton("h3-commerce-video").click();
      await skillDetail.waitFor();
      await preview.waitFor({ state: "detached" });
      await skillDetail.getByText("结合商品信息和参考图，准备带货视频方案。").waitFor();
      assert.equal(await page.evaluate(() => window.CanvasAgentUi.getActiveSkillId()), activeBefore);
      assert.equal(await prompt.inputValue(), draft);
      assert.equal((await skillPopover.boundingBox()).width, listWidth);
      await skillDetail.getByText("1 / 3").waitFor();
      await skillDetail.getByRole("button", { name: "下一个预览" }).click();
      await skillDetail.getByAltText("补充案例").waitFor();
      await skillDetail.getByText("2 / 3").waitFor();
      await skillDetail.getByRole("button", { name: "下一个预览" }).click();
      const videoPanel = skillDetail.locator("video[controls]");
      await videoPanel.waitFor();
      await videoPanel.evaluate(async node => { node.muted = true; await node.play(); });
      await page.waitForFunction(() => document.querySelector("#canvasAgentSkillDetail video")?.currentTime > 0);
      await skillDetail.getByRole("button", { name: "下一个预览" }).click();
      await page.waitForFunction(() => document.querySelector("#canvasAgentSkillDetail img")?.naturalWidth > 0);
      const results = [];
      for (const width of [390, 768, 1440, 1728]) {
        const height = width === 390 ? 640 : 900;
        await page.setViewportSize({ width, height });
        const bounds = await skillDetail.boundingBox();
        assert.ok(bounds.x >= 8 && bounds.y >= 8 && bounds.x + bounds.width <= width - 8 && bounds.y + bounds.height <= height - 8);
        assert.ok(Math.abs(bounds.x + bounds.width / 2 - width / 2) < 2);
        assert.ok(Math.abs(bounds.y + bounds.height / 2 - height / 2) < 2);
        const viewportControls = {
          header: await skillDetail.locator(".canvas-agent-skill-detail-header").isVisible(),
          footer: await skillDetail.locator(".canvas-agent-skill-detail-footer").isVisible(),
        };
        assert.deepEqual(viewportControls, { header: true, footer: true });
        if (width === 390) {
          const body = skillDetail.locator(".canvas-agent-skill-detail-body");
          assert.ok(await body.evaluate(element => element.scrollHeight > element.clientHeight));
          await body.evaluate(element => { element.scrollTop = element.scrollHeight; });
          assert.equal(await skillDetail.locator(".canvas-agent-skill-detail-footer").isVisible(), true);
          await body.evaluate(element => { element.scrollTop = 0; });
        }
        await skillDetail.getByRole("button", { name: "关闭 Skill 详情" }).click({ trial: true });
        await skillDetail.getByRole("button", { name: "添加到对话" }).click({ trial: true });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        if (width === 390 || width === 1440) await page.screenshot({ path: path.join(output, `skill-detail-${width}.png`) });
        results.push({ width, height, bounds });
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      await skillDetail.getByRole("button", { name: "喜欢", exact: true }).click();
      assert.equal(await skillDetail.getByRole("button", { name: "取消喜欢" }).getAttribute("aria-pressed"), "true");
      await page.keyboard.press("Escape");
      await skillDetail.waitFor({ state: "detached" });
      assert.equal(await detailButton("h3-commerce-video").evaluate(button => document.activeElement === button), true);
      assert.equal(await page.evaluate(() => window.CanvasAgentUi.getActiveSkillId()), activeBefore);
      await tab("喜欢").click();
      assert.equal(await image.count(), 1);
      await detailButton("h3-commerce-video").click();
      await skillDetail.getByRole("button", { name: "取消喜欢" }).click();
      await page.mouse.click(14, 14);
      await skillDetail.waitFor({ state: "detached" });
      await skillPopover.getByText("还没有喜欢的 Skill。").waitFor();
      await tab("我的").click();
      assert.equal(await personal.locator("img").count(), 1);
      await detailButton("qa-personal").click();
      await skillDetail.getByText("商品照片").waitFor();
      await skillDetail.getByText("摄影方案", { exact: true }).waitFor();
      assert.equal(await skillDetail.getByRole("button", { name: "下一个预览" }).count(), 0);
      await skillDetail.getByRole("button", { name: "关闭 Skill 详情" }).click();
      await detailButton("qa-empty").click();
      await skillDetail.getByText("暂无效果预览").waitFor();
      await skillDetail.getByRole("button", { name: "关闭 Skill 详情" }).click();
      await tab("综合").click();
      await search.fill("带货");
      assert.equal(await skillPopover.locator("[data-agent-skill]").count(), 1);
      await h3.hover();
      await preview.locator("img").waitFor();
      assert.equal(await preview.locator("img").getAttribute("src"), await image.getAttribute("src"));
      assert.equal(await preview.getByText("暂无效果预览").count(), 0);
      await page.screenshot({ path: path.join(output, "cover-preview-1440.png") });
      await skillTrigger.click();
      coverRevision++;
      await skillTrigger.click();
      await page.waitForFunction(initial => {
        const image = document.querySelector('[data-agent-skill="h3-commerce-video"] img');
        return image?.naturalWidth > 0 && image.src !== initial;
      }, initial.href);
      const refreshed = new URL(await image.getAttribute("src"), origin);
      assert.equal(refreshed.searchParams.get("v"), "2026-11-23T06:00:02.000Z");
      for (const width of [390, 768, 1440, 1728]) {
        await page.setViewportSize({ width, height: 900 });
        await h3.waitFor();
        const thumb = await image.boundingBox();
        assert.equal(thumb.width, 36);
        assert.equal(thumb.height, 36);
        assert.ok(thumb.x >= 0 && thumb.x + thumb.width <= width);
        if (width === 390) await page.screenshot({ path: path.join(output, "cover-list-390.png") });
      }
      await detailButton("h3-commerce-video").click();
      await skillDetail.getByRole("button", { name: "添加到对话" }).click();
      await skillDetail.waitFor({ state: "detached" });
      await skillPopover.waitFor({ state: "hidden" });
      await page.waitForFunction(() => window.CanvasAgentUi?.getActiveSkillId() === "h3-commerce-video");
      assert.equal(await prompt.inputValue(), draft);
      await skillTrigger.click();
      assert.equal(await h3.getAttribute("aria-pressed"), "true");
      await detailButton("h3-commerce-video").click();
      assert.equal(await skillDetail.getByRole("button", { name: "已添加到对话" }).isDisabled(), true);
      await page.keyboard.press("Escape");
      assert.equal(await h3.getAttribute("aria-pressed"), "true");
      assert.deepEqual(promptTurns, []);
      assert.deepEqual(generationRequests, []);
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ origin, output, results, errors }, null, 2));
      return;
    }
    if (sidePanelsOnly) {
      await openBoard();
      const buttons = { agent: "#canvasAgentToggle", assets: "#canvasAssetLibraryButton" };
      const panels = { agent: "#canvasAgentPanel", assets: "#canvasAssetLibraryPanel" };
      const switchTo = name => page.locator(buttons[name]).click();
      async function check(active) {
        const actual = await page.evaluate(({ buttons, panels }) => {
          const visible = el => !el.hidden && getComputedStyle(el).visibility === "visible" && el.getClientRects().length > 0;
          return Object.keys(buttons).map(key => {
            const button = document.querySelector(buttons[key]);
            const panel = document.querySelector(panels[key]);
            const probe = panel.querySelector(key === "agent" ? "#canvasAgentPrompt" : "#canvasAssetSearch").getBoundingClientRect();
            const bounds = panel.getBoundingClientRect();
            const bar = button.closest(".canvas-actions").getBoundingClientRect();
            const onScreen = bounds.left >= 0 && bounds.right <= innerWidth + 1 && bounds.top >= bar.bottom - 1 && bounds.bottom <= innerHeight + 1;
            const hit = panel.contains(document.elementFromPoint(probe.x + probe.width / 2, probe.y + probe.height / 2));
            return { visible: visible(panel), expanded: button.getAttribute("aria-expanded") === "true", inert: panel.inert, onScreen, hit,
              viewport: [innerWidth, innerHeight], bounds: bounds.toJSON(), toolbarBottom: bar.bottom };
          });
        }, { buttons, panels });
        Object.keys(buttons).forEach((name, i) => {
          const expected = active === name;
          assert.equal(actual[i].visible, expected, `${name} visibility while ${active} active`);
          assert.equal(actual[i].expanded, expected, `${name} expanded state`);
          assert.equal(actual[i].inert, !expected, `${name} inert state`);
          if (expected) assert.ok(actual[i].hit && actual[i].onScreen, `${name}: ${JSON.stringify(actual[i])}`);
        });
      }
      await check("agent");
      const messages = page.locator("#canvasAgentMessages");
      await page.getByText("验收历史消息 30", { exact: true }).waitFor({ state: "attached" });
      await page.waitForFunction(() => window.CanvasAgentUi?.getActiveSkillId() === "qa-skill");
      await prompt.fill("尚未发送的验收草稿");
      const chatScroll = await messages.evaluate(el => { el.scrollTop = 130; return el.scrollTop; });
      assert.ok(chatScroll > 0);
      await switchTo("assets");
      await check("assets");
      const search = page.locator("#canvasAssetSearch");
      await page.locator('[data-asset-kind="image"]').click();
      const searched = page.waitForResponse(response => response.url().includes("/api/asset-library?") && new URL(response.url()).searchParams.has("search"));
      await search.fill("库内图片");
      await searched;
      await page.waitForFunction(() => !window.CanvasAssetLibrary.state.loading);
      const grid = page.locator("#canvasAssetGrid");
      await grid.locator(".canvas-asset-card").first().waitFor();
      await grid.locator(".canvas-asset-card").first().click();
      const assetScroll = await grid.evaluate(el => { el.scrollTop = 160; return el.scrollTop; });
      assert.ok(assetScroll > 0);
      const loadsBefore = assetLoads;
      for (let i = 0; i < 5; i++) {
        await switchTo("agent");
        await check("agent");
        await switchTo("assets");
        await check("assets");
      }
      assert.equal(assetLoads, loadsBefore);
      assert.equal(await search.inputValue(), "库内图片");
      assert.equal(await page.locator('[data-asset-kind="image"].is-active').count(), 1);
      assert.equal(await grid.locator(".canvas-asset-card.is-selected").count(), 1);
      assert.equal(await grid.evaluate(el => el.scrollTop), assetScroll);
      await switchTo("assets");
      await check(null);
      await switchTo("agent");
      await check("agent");
      assert.equal(await prompt.inputValue(), "尚未发送的验收草稿");
      assert.equal(await page.evaluate(() => window.CanvasAgentUi.getActiveSkillId()), "qa-skill");
      assert.equal(await messages.evaluate(el => el.scrollTop), chatScroll);
      await preferenceTrigger.click();
      assert.equal(await model.inputValue(), "gpt-image-2-ainb");
      await preferenceTrigger.click();
      await switchTo("agent");
      await check(null);
      await page.evaluate(({ agent, assets }) => {
        for (const selector of [agent, assets, agent, assets, agent]) document.querySelector(selector).click();
      }, buttons);
      await check("agent");
      const widthChecks = [390, 768, 1440, 1728];
      for (const width of widthChecks) {
        await page.setViewportSize({ width, height: 900 });
        for (const name of ["assets", "agent"]) {
          await switchTo(name);
          await check(name);
          if (width === 390 || width === 1440) {
            await page.screenshot({ path: path.join(output, `${name}-${width}.png`) });
          }
        }
      }
      assert.deepEqual(generationRequests, []);
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ origin, widthChecks, output, errors }, null, 2));
      return;
    }
    if (selectedPromptOnly || governanceOnly) {
      boardNodes = [
        { id: "qa-upper", kind: "image", nodeTitle: "自然美学产品摄影", prompt: "上方提示词，保持原样。", x: 450, y: 130, w: 200, h: 140 },
        { id: "qa-lower", kind: "image", nodeTitle: "自然美学产品摄影", model: "gpt-image-2", resolution: "1", prompt: "下方提示词，展开镜盖，保留背景和构图。", x: 450, y: 390, w: 200, h: 200 },
      ];
    }
    await openBoard();
    if (skillSubmissionOnly) {
      const useSkill = async id => {
        await skillTrigger.click();
        await skillPopover.locator(`[data-agent-skill="${id}"]`).click();
        await page.waitForFunction(id => window.CanvasAgentUi.getActiveSkillId() === id, id);
      };
      const messages = page.locator("#canvasAgentMessages");
      const userMessages = messages.locator(".is-user");
      const send = page.locator("#canvasAgentSend");
      const settled = () => page.waitForFunction(() => {
        const button = document.querySelector("#canvasAgentSend");
        return button && !button.hidden && !button.disabled
          && !document.querySelector("#canvasAgentMessages .canvas-agent-waiting");
      });
      await useSkill(fashionSkillId);
      await send.click();
      const wizard = messages.locator(".canvas-agent-wizard");
      await wizard.getByText("服装参考图").waitFor({ timeout: 3500 }).catch(async error => {
        throw new Error(JSON.stringify({ messages: await messages.innerText(), draft: conversation.wizardDraft, errors }), { cause: error });
      });
      assert.equal(await userMessages.count(), 1);
      assert.equal((await userMessages.last().innerText()).trim(), fashionSkillLabel);
      assert.equal(promptTurns.length, 0, "缺图时直接显示收集卡");
      assert.ok(conversation.wizardDraft.values.adaptive_config);
      await openBoard();
      await wizard.getByText("服装参考图").waitFor();
      const garment = await page.evaluate(() => {
        const node = addCanvasImage("/output/qa-skill-submission.png", "已保存的服装商品图", { x: 420, y: 300 });
        pinCanvasNode(node.dataset.id);
        selectCanvasNode(node);
        return node.dataset.id;
      });
      const beforeNodes = await page.evaluate(() => serializeCanvasBoard().nodes.length);
      await wizard.getByRole("button", { name: /使用当前已选图片/ }).click();
      await wizard.getByRole("button", { name: "查看图片 已保存的服装商品图" }).waitFor();
      assert.equal(await page.evaluate(() => serializeCanvasBoard().nodes.length), beforeNodes);
      assert.equal(await media.locator(`[data-agent-node-id="${garment}"]`).count(), 0);
      const taskId = conversation.wizardDraft.taskId;
      await wizard.getByRole("button", { name: "继续任务" }).click();
      await messages.getByText("请确认处理整套搭配还是单件服装？").waitFor();
      await settled();
      const fashionExecution = promptTurns.find(turn => turn.skill_id === fashionSkillId && turn.step === 0
        && !turn.prompt.startsWith("任务阶段：先理解"));
      assert.match(fashionExecution?.prompt || "", /在画布搭建/);
      assert.doesNotMatch(fashionExecution.prompt, /在对话中交付文字结果/);
      assert.equal(promptTurns.at(-1).task_id, taskId);
      assert.equal(promptTurns.at(-1).skill_id, fashionSkillId);
      assert.equal(promptTurns.at(-1).vision_images?.length, 1);
      assert.equal(conversation.wizardDraft.status, "collecting");
      assert.deepEqual(conversation.wizardDraft.sourceNodeIds, [garment]);
      assert.equal(await userMessages.count(), 2);
      await userMessages.last().getByRole("img", { name: "已保存的服装商品图" }).waitFor();
      assert.equal(conversation.items.find(item => item.id === `adaptive-submit-${taskId}`).attachments[0].nodeId, garment);
      boardNodes = await page.evaluate(() => serializeCanvasBoard().nodes);
      await openBoard();
      await userMessages.last().getByRole("img", { name: "已保存的服装商品图" }).waitFor();
      await wizard.waitFor({ state: "hidden" });
      await prompt.fill("整套搭配");
      await send.click();
      await messages.getByText("已确认按整套搭配处理。").first().waitFor();
      await settled();
      assert.equal(promptTurns.filter(turn => turn.prompt.startsWith("任务阶段：先理解")).length, 0,
        JSON.stringify(promptTurns.map(turn => [turn.task_id, turn.step, turn.prompt.slice(0, 90)])));
      const replies = promptTurns.filter(turn => turn.prompt.includes("用户本轮回复：整套搭配") && turn.step === 0);
      assert.equal(replies.length, 1);
      assert.equal(replies[0].task_id, taskId);
      assert.equal(replies[0].canvas.agent_image_attachments[0].node_id, garment);
      assert.equal(replies[0].vision_images.length, 1);
      assert.equal(promptTurns.filter(turn => turn.run_id === replies[0].run_id && turn.tool_outputs?.length).length, 1);
      assert.equal(await userMessages.last().locator("img").count(), 0);
      assert.equal(await messages.locator(".is-error").count(), 0);
      assert.equal(await page.evaluate(() => serializeCanvasBoard().nodes.length), beforeNodes);
      await wizard.waitFor({ state: "hidden" });
      boardNodes = [];
      await openBoard();
      await useSkill("commercial-product-photography-10");
      await send.click();
      await wizard.getByText("商品原图").waitFor().catch(async error => {
        throw new Error(JSON.stringify({ chat: (await messages.innerText()).slice(-1800),
          status: await page.locator("#canvasAgentStatus").textContent(),
          latestTurns: promptTurns.slice(-3).map(turn => [turn.skill_id, turn.step, turn.prompt?.slice(0, 70)]),
          draft: conversation.wizardDraft?.status, errors }), { cause: error });
      });
      assert.equal(await userMessages.count(), 4);
      await settled();
      await useSkill("qa-skill");
      let release;
      finishTurn = { promise: new Promise(resolve => { release = resolve; }) };
      const modelRequest = page.waitForRequest(request => request.url().endsWith("/api/canvas-agent/turn"));
      await send.click();
      await messages.locator(".canvas-agent-waiting").waitFor();
      assert.equal(await userMessages.count(), 5);
      assert.equal((await userMessages.last().innerText()).trim(), "版式策划");
      await modelRequest;
      await form.evaluate(element => element.requestSubmit());
      release();
      finishTurn = null;
      await messages.getByText("请补充目标受众是谁？", { exact: true }).waitFor();
      await settled();
      assert.equal(promptTurns.filter(turn => turn.skill_id === "qa-skill").length, 2);
      assert.equal(await userMessages.count(), 5);
      assert.equal(await messages.locator(".is-error").count(), 0);
      await prompt.fill("隔离模型失败");
      await send.click();
      await messages.getByText(/隔离模型请求失败/).waitFor();
      await settled();
      await useSkill(fashionSkillId);
      await prompt.fill("");
      const selectReference = name => page.evaluate(name => {
        const node = addCanvasImage("/output/qa-skill-submission.png", name, { x: 420, y: 300 });
        pinCanvasNode(node.dataset.id);
        selectCanvasNode(node);
      }, name);
      await selectReference("服装参考图");
      await send.click();
      await settled();
      assert.equal(await userMessages.count(), 7);
      await userMessages.last().getByRole("img", { name: "服装参考图" }).waitFor();
      assert.ok(promptTurns.at(-1).vision_images?.length, await messages.innerText());
      assert.equal(promptTurns.at(-1).skill_id, fashionSkillId);
      await useSkill("qa-skill");
      await prompt.fill("请分析这次的版式，供团队讨论。");
      await selectReference("版式参考图");
      await send.click();
      await settled();
      assert.equal(await userMessages.count(), 8);
      await userMessages.last().getByRole("img", { name: "版式参考图" }).waitFor();
      await skillTrigger.click();
      await page.locator("#canvasAgentUseAuto").click();
      await prompt.fill("普通对话验收");
      await send.click();
      await settled();
      assert.equal(promptTurns.filter(turn => turn.skill_id === fashionSkillId && turn.prompt.startsWith("任务阶段：先理解")).length, 0);
      await page.waitForFunction(async () => {
        const current = await (await fetch("/api/canvas-agent/conversation?board_id=qa-agent-composer")).json();
        return current.items.filter(item => item.role === "user").length === 9;
      });
      await openBoard();
      assert.deepEqual((await userMessages.allInnerTexts()).map(text => text.trim().split("\n")[0]), [
        fashionSkillLabel, "服装参考图：已保存的服装商品图", "整套搭配", "商业产品摄影 · 十种创意方案", "版式策划", "隔离模型失败", fashionSkillLabel,
        "请分析这次的版式，供团队讨论。", "普通对话验收",
      ]);
      assert.equal(await userMessages.locator("img").count(), 3);
      assert.equal(await userMessages.locator(".canvas-agent-message-status").count(), 0);
      await useSkill("h3-commerce-video");
      let releaseIntake;
      finishTurn = { promise: new Promise(resolve => { releaseIntake = resolve; }) };
      const intakeRequest = page.waitForRequest(request => request.url().endsWith("/api/canvas-agent/turn"));
      await send.click();
      await messages.locator(".canvas-agent-waiting").waitFor();
      await userMessages.last().getByText("H3 带货视频", { exact: true }).waitFor();
      await intakeRequest;
      await form.evaluate(element => element.requestSubmit());
      releaseIntake();
      finishTurn = null;
      await messages.locator(".canvas-agent-wizard").waitFor();
      assert.equal(await messages.locator(".canvas-agent-wizard").count(), 1);
      assert.equal(await userMessages.count(), 10);
      assert.equal(promptTurns.filter(turn => turn.skill_id === "h3-commerce-video").length, 1);
      await useSkill("qa-media-intake");
      await prompt.fill("");
      await page.evaluate(() => clearCanvasSelection());
      await send.click();
      await wizard.locator('[data-agent-wizard-field="audience"]').fill("商务通勤人群");
      assert.equal(await wizard.locator('[data-agent-wizard-field="product"]').count(), 0);
      await wizard.getByRole("button", { name: "下一步" }).click();
      await wizard.getByText("参考配音").waitFor();
      await wizard.getByRole("button", { name: "上一步" }).click();
      assert.equal(await wizard.locator('[data-agent-wizard-field="audience"]').inputValue(), "商务通勤人群");
      await wizard.getByRole("button", { name: "下一步" }).click();
      const referenceNodes = await addCanvasMedia();
      const audio = referenceNodes.find(ref => ref.kind === "audio");
      await page.evaluate(id => selectCanvasNode(ensureCanvasNodeMounted(id)), audio.id);
      await wizard.getByRole("button", { name: /使用当前已选音频/ }).click();
      await wizard.getByText(audio.name, { exact: true }).waitFor({ state: "attached" });
      const continuing = page.waitForRequest(request => request.url().endsWith("/api/canvas-agent/turn")
        && request.postDataJSON()?.prompt?.includes("用户在信息收集卡确认的输入"), { timeout: 5000 });
      await wizard.getByRole("button", { name: "继续任务" }).click();
      const resumed = (await continuing).postDataJSON();
      await settled();
      assert.equal(resumed.skill_id, "qa-media-intake");
      assert.match(resumed.prompt, /茶叶礼盒[\s\S]+商务通勤人群/);
      assert.ok(resumed.canvas.agent_materials.some(ref => ref.node_id === audio.id && ref.type === "audio"));
      assert.deepEqual(errors, []);
      console.log("普通对话、Skill 空文本、有图与混合输入、即时反馈、防重复、缺图追问、模型失败和历史恢复通过。");
      return;
    }
    if (governanceOnly) {
      const [reference] = await addCanvasMedia();
      if (referenceRecovery) await page.evaluate(() => saveCanvasBoardNow());
      const failures = [];
      const nativeClick = async (locator, refresh = true) => {
        await locator.hover();
        const box = await locator.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        if (refresh) await page.evaluate(id => window.dispatchEvent(new CustomEvent("canvas:selectionchange", {
          detail: { selectedIds: [id] },
        })), reference.id);
        await page.mouse.up();
      };
      const selectSkill = async id => {
        if (!await skillPopover.isVisible()) await nativeClick(skillTrigger);
        await skillPopover.locator(`[data-agent-skill="${id}"]`).click();
        await page.waitForFunction(value => window.CanvasAgentUi.getActiveSkillId() === value, id);
      };
      await page.evaluate(id => window.selectCanvasNode(window.ensureCanvasNodeMounted(id)), reference.id);
      await tile(reference.name).waitFor();
      await selectSkill("natural-aesthetic-product-photography");
      if (await tile(reference.name).count() !== 1) failures.push("切换到摄影 Skill 后，画布已选图片未唯一显示");
      await prompt.fill("用这个产品设计高端商业摄影方案，素材也用作春节海报");
      await page.locator("#canvasAgentSend").click();
      await page.locator(".canvas-agent-wizard").waitFor();
      assert.equal(conversation.wizardDraft.skillId, "natural-aesthetic-product-photography");
      await selectSkill("qa-skill");
      await prompt.fill("");
      const response = page.waitForRequest(request => request.url().endsWith("/api/canvas-agent/turn"), { timeout: 2500 })
        .then(request => request.postDataJSON(), () => null);
      await nativeClick(page.locator("#canvasAgentSend"));
      const payload = await response;
      if (!payload) failures.push(`空输入发送已选 Skill 时未进入工作流（${await page.locator("#canvasAgentStatus").textContent()}，错误 ${errors.join("、")}）`);
      else assert.equal(payload.skill_id, "qa-skill");
      assert.deepEqual(failures, []);
      await page.locator("#canvasAgentSend").waitFor({ state: "visible" });
      for (const action of ["Decline", "Approve"]) {
        await prompt.fill(`使用海报设计 Skill 制作春节海报，跨 Skill 授权验收 ${action}`);
        await page.locator("#canvasAgentSend").click();
        const approval = page.locator("#canvasAgentApproval");
        await approval.getByText(/海报设计/).waitFor();
        if (referenceRecovery && action === "Decline") {
          await openBoard();
          await approval.getByRole("button", { name: "仅使用当前 Skill" }).waitFor();
        }
        if (action === "Approve") await approval.screenshot({ path: path.join(output, "skill-approval-restart-1440.png") });
        if (referenceRecovery && action === "Approve") pauseReferenceContinuation = true;
        await page.locator(`#canvasAgent${action}`).click();
        if (referenceRecovery && action === "Approve") {
          await approval.getByRole("button", { name: "继续当前任务" }).waitFor();
          pauseReferenceContinuation = false;
          await openBoard();
          await approval.getByRole("button", { name: "继续当前任务" }).click();
        }
        const final = page.getByText("已沿用主 Skill 完成验收。", { exact: true }).last();
        await final.waitFor().catch(async error => {
          const messages = (await page.locator("#canvasAgentMessages").innerText()).slice(-1200);
          const task = { id: conversation.taskContext?.taskId, messages: conversation.items.map(item => [item.id, item.role]) };
          throw new Error(`${action}：${await page.locator("#canvasAgentStatus").textContent()}；${JSON.stringify({ task, decisions: [...referenceApprovals.values()].map(item => item.resume?.decision || "completed"), errors })}；${messages}；${error.message}`);
        });
        await approval.waitFor({ state: "hidden" });
        await page.locator("#canvasAgentSend").waitFor({ state: "visible" });
      }
      const audit = page.locator("#canvasAgentSkillActivity");
      assert.equal(await audit.count(), 0, "调用审计保存在后台，不在聊天界面展示");
      if (referenceRecovery) {
        assert.deepEqual([...referenceApprovals.values()].map(item => [item.event.type, item.resume]),
          [["cross_skill_denial", null], ["cross_skill_grant", null]]);
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ origin, cases: ["待确认后刷新并拒绝", "批准后续跑中断并刷新恢复", "同一主 Skill 继续", "授权审计读回"], errors, output }));
        return;
      }
      await page.evaluate(id => window.selectCanvasNode(window.ensureCanvasNodeMounted(id)), reference.id);
      await prompt.fill("@画布参考图");
      await prompt.press("Enter");
      assert.equal(await prompt.inputValue(), "@图1 ");
      await capture("materials-1440");
      await nativeClick(tile(reference.name).getByRole("button", { name: `移除 ${reference.name}` }));
      await tile(reference.name).waitFor({ state: "detached" });
      assert.equal(await prompt.inputValue(), "");
      assert.ok(await page.evaluate(id => Boolean(window.ensureCanvasNodeMounted(id)), reference.id));

      const old = boardNodes.find(node => node.id === "qa-lower").prompt;
      await page.evaluate(() => selectCanvasNode(ensureCanvasNodeMounted("qa-lower")));
      await prompt.fill("请修改当前节点提示词，把镜盖改成保持关闭。");
      await page.locator("#canvasAgentSend").click();
      const card = page.locator("[data-agent-node-edit-card]");
      await card.waitFor();
      assert.equal(await card.locator("pre").innerText(), updatedPrompt);
      assert.equal(boardOperations.filter(item => item.entityId === "qa-lower").length, 0);
      assert.equal(conversation.pendingWorkflow?.candidate, updatedPrompt);
      await card.screenshot({ path: path.join(output, "node-edit-confirmation-1440.png") });
      await openBoard();
      await card.waitFor();
      const restoredNode = await page.evaluate(() => {
        const mounted = getCanvasNode("qa-lower");
        const model = getCanvasNodeModel("qa-lower");
        return { mounted: mounted?.dataset.virtualLevel, prompt: model?.prompt, serializedPrompt: mounted && serializeCanvasNode(mounted).prompt };
      });
      await card.getByRole("button", { name: "确认并更新节点" }).click();
      await page.locator("#canvasAgentMessages").getByText("已更新当前选中节点提示词，并完成内容核验。", { exact: true }).waitFor().catch(async error => {
        throw new Error(`${await page.locator("#canvasAgentMessages").innerText()}\n${await page.locator("#canvasAgentStatus").innerText()}\n${errors.join("\n")}\n${JSON.stringify(restoredNode)}`, { cause: error });
      });
      const writes = boardOperations.filter(item => item.entityId === "qa-lower");
      assert.equal(writes.length, 1);
      assert.equal(writes[0].before.prompt, old);
      assert.equal(writes[0].after.prompt, updatedPrompt);
      assert.equal(writes[0].after.model, writes[0].before.model);
      assert.equal(writes[0].after.resolution, writes[0].before.resolution);
      await page.evaluate(() => selectCanvasNode(ensureCanvasNodeMounted("qa-lower")));
      await page.evaluate(() => saveCanvasBoardNow());
      await prompt.fill("再次修改当前节点提示词，核对镜盖状态。");
      await page.locator("#canvasAgentSend").click();
      await card.waitFor();
      const confirmationOperationId = conversation.pendingWorkflow.operationId;
      boardOperations.push({ entityId: "qa-lower", operationId: "qa-concurrent-edit",
        after: { ...writes[0].after, prompt: "协作者已在确认前修改该节点。" } });
      await card.getByRole("button", { name: "确认并更新节点" }).click();
      await page.locator("#canvasAgentMessages .is-error").getByText(/目标节点已变化|目标节点还有本地编辑/).waitFor().catch(async error => {
        throw new Error(`${await page.locator("#canvasAgentMessages").innerText()}\n${await page.locator("#canvasAgentStatus").textContent()}`, { cause: error });
      });
      assert.equal(boardOperations.filter(item => item.operationId === confirmationOperationId).length, 0);
      await card.getByRole("button", { name: "取消", exact: true }).click();
      await card.waitFor({ state: "detached" });
      assert.equal(conversation.pendingWorkflow, null);
      const file = page.locator("#canvasAgentFileInput");
      await file.setInputFiles({ name: "产品资料.txt", mimeType: "text/plain", buffer: Buffer.from("商品：手机壳。") });
      const documentTile = tile("产品资料.txt");
      await documentTile.waitFor().catch(async error => {
        throw new Error(`${await page.locator("#canvasAgentStatus").textContent()} · ${await media.innerText()}`, { cause: error });
      });
      assert.equal(await documentTile.getAttribute("data-agent-material-origin"), "conversation_upload");
      await prompt.fill("@产品资料");
      await prompt.press("Enter");
      assert.equal(await prompt.inputValue(), "@文档1 ");
      await documentTile.getByRole("button", { name: "查看素材 产品资料.txt" }).click();
      await page.getByRole("dialog", { name: "产品资料.txt" }).getByText("商品：手机壳。").waitFor();
      await page.getByRole("dialog", { name: "产品资料.txt" }).getByRole("button", { name: "关闭" }).click();

      const h3Ids = await page.evaluate(() => Array.from({ length: 4 }, (_, index) => {
        const name = `素材样本${index + 1}`;
        const node = addCanvasImage(`/output/qa-h3-material-${index + 1}.png`, name, { x: index * 180, y: 100 });
        return node.dataset.id;
      }));
      await page.evaluate(ids => {
        clearCanvasSelection();
        for (const id of ids) toggleCanvasNodeSelection(ensureCanvasNodeMounted(id));
      }, h3Ids);
      await selectSkill("h3-commerce-video");
      for (const [index, id] of h3Ids.entries()) {
        await prompt.fill(`@素材样本${index + 1}`);
        await page.locator(`[data-agent-mention-id="${id}"]`).click();
      }
      await prompt.fill("商品：手机壳，受众：通勤用户，卖点：边角保护。");
      await page.locator("#canvasAgentSend").click();
      const wizard = page.locator(".canvas-agent-wizard");
      await wizard.waitFor().catch(async error => {
        throw new Error(`${await page.locator("#canvasAgentStatus").textContent()} · ${JSON.stringify(conversation.wizardDraft)} · ${errors.join("、")}`, { cause: error });
      });
      await page.locator("#canvasAgentStatus").filter({ hasText: "已给出图位建议" }).waitFor().catch(async error => {
        throw new Error(`${await page.locator("#canvasAgentStatus").textContent()} · ${JSON.stringify(conversation.wizardDraft)}`, { cause: error });
      });
      assert.deepEqual(conversation.wizardDraft.sourceNodeIds, h3Ids);
      assert.equal(conversation.wizardDraft.values.product_name, "手机壳");
      for (const width of [390, 768, 1440, 1728]) {
        await page.setViewportSize({ width, height: 900 });
        await wizard.screenshot({ path: path.join(output, `h3-information-${width}.png`) });
        const bounds = await page.locator("#canvasAgentSend").boundingBox();
        assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= 900);
      }
      assert.deepEqual(generationRequests, []);
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ origin, cases: ["摄影素材联动", "Skill 空输入启动", "@ 键盘引用",
        "原生鼠标点击与选区刷新", "确认前零写入", "刷新恢复确认卡", "确认后保存与回读", "并发保护与取消", "文档素材引用",
        "H3 信息收集与四图建议"], errors, output }));
      return;
    }
    if (creativeBatchOnly) return await checkCreativeBatchOnly();
    if (posterOnly) return await checkPosterOnly();
    if (intentOnly) return await checkIntentOnly();
    if (selectedPromptOnly) {
      await page.locator("#canvasAgentContextAdd").click();
      const [chooser] = await Promise.all([
        page.waitForEvent("filechooser"), page.locator('[data-agent-attachment="upload"]').click(),
      ]);
      await chooser.setFiles({ name: "产品附件.png", mimeType: "image/png", buffer: image });
      await tile("产品附件.png").waitFor();
      await page.evaluate(() => selectCanvasNode(ensureCanvasNodeMounted("qa-lower")));
      boardNodes = await page.evaluate(() => serializeCanvasBoard().nodes);
      await page.evaluate(() => saveCanvasBoardNow());
      initialPromptWrites = boardOperations.filter(item => item.entityId === "qa-lower").length;
      const initialOperations = boardOperations.length;
      await prompt.fill(selectedPromptRequest);
      const [firstTurn] = await Promise.all([
        page.waitForRequest(request => request.url().endsWith("/api/canvas-agent/turn")),
        page.locator("#canvasAgentSend").click(),
      ]);
      const sent = firstTurn.postDataJSON();
      assert.equal(sent.user_intent_prompt, "把修改后的提示词写入当前节点");
      assert.deepEqual(sent.canvas.selected_node_ids, ["qa-lower"]);
      assert.equal(sent.canvas.agent_image_attachments.length, 1);
      assert.notEqual(sent.canvas.agent_image_attachments[0].node_id, "qa-lower");
      assert.match(sent.prompt, /修改提示词/);
      await page.locator("#canvasAgentMessages").getByText("已更新当前选中节点提示词，并完成内容核验。", { exact: true }).waitFor().catch(async error => {
        throw new Error(`${await page.locator("#canvasAgentMessages").innerText()}\n${JSON.stringify(promptTurns.flatMap(turn => turn.tool_outputs || []))}`, { cause: error });
      });
      assert.deepEqual(promptTurns[1].tool_outputs.map(result => result.output.ok), [false, false]);
      assert.deepEqual(promptTurns[1].canvas.selected_node_ids, ["qa-lower"]);
      assert.match(promptTurns[1].prompt, /修改提示词/);
      assert.equal(promptTurns[2].tool_outputs[0].output.code, "prompt_edit_review_rejected");
      assert.equal(promptTurns[3].tool_outputs[0].output.persisted, true);
      assert.equal(promptTurns[3].tool_outputs[0].output.content_verified, true);
      const snapshot = await page.evaluate(() => ({
        selected: Array.from(document.querySelectorAll("#canvasPlane .canvas-node.is-selected"), el => el.dataset.id),
        prompts: Object.fromEntries(serializeCanvasBoard().nodes.map(node => [node.id, node.prompt])),
      }));
      assert.deepEqual(snapshot.selected, ["qa-lower"]);
      assert.equal(snapshot.prompts["qa-upper"], "上方提示词，保持原样。");
      assert.equal(snapshot.prompts["qa-lower"], updatedPrompt);
      assert.ok(!boardOperations.slice(initialOperations).some(operation => operation.entityId === "qa-upper"));
      const saved = boardOperations.findLast(operation => operation.entityId === "qa-lower");
      assert.equal(saved?.after?.prompt, updatedPrompt);
      assert.equal(saved.after.resolution, "1");
      await prompt.fill("把修改后的提示词先发我看看，不要直接改节点");
      await page.locator("#canvasAgentSend").click();
      await page.getByText("隔离验收修改完成。", { exact: true }).waitFor();
      assert.deepEqual(promptTurns[4].canvas.selected_node_ids, ["qa-lower"]);
      assert.equal(promptTurns[4].canvas.nodes.find(node => node.id === "qa-lower").prompt, updatedPrompt);
      await page.evaluate(() => toggleCanvasNodeSelection(ensureCanvasNodeMounted("qa-upper")));
      await prompt.fill("帮我修改当前节点提示词");
      await page.locator("#canvasAgentSend").click();
      await page.locator("#canvasAgentStatus").filter({ hasText: "已选中多个节点" }).waitFor();
      assert.equal(promptTurns.length, 5);
      await page.evaluate(() => clearCanvasSelection());
      await prompt.fill("帮我把这段提示词改得更简洁高级");
      const next = page.waitForRequest(request => request.url().endsWith("/api/canvas-agent/turn"));
      await page.locator("#canvasAgentSend").click();
      assert.deepEqual((await next).postDataJSON().canvas.selected_node_ids, []);
      await page.getByText("隔离验收修改完成。", { exact: true }).nth(1).waitFor();
      await page.evaluate(() => selectCanvasNode(ensureCanvasNodeMounted("qa-lower")));
      const imageEdit = "帮我修改这张图片内容，把背景换成浅灰色";
      await prompt.fill(imageEdit);
      const imageTurn = page.waitForRequest(request => request.url().endsWith("/api/canvas-agent/turn"));
      await page.locator("#canvasAgentSend").click();
      assert.equal((await imageTurn).postDataJSON().user_intent_prompt, imageEdit);
      await page.getByText("隔离验收修改完成。", { exact: true }).nth(2).waitFor();
      assert.equal(boardOperations.filter(operation => operation.entityId === "qa-lower").length, initialPromptWrites + 1);
      const tests = [
        ["把这个提示词里的商品颜色改成深蓝，只改颜色。", "石墨灰", "深蓝", "候选同时保留石墨灰和深蓝。"],
        ["把这个提示词里的可拆支架数量从两个改为一个。", "两个", "一个", "候选保留了两个支架。"],
        ["把这个提示词里的环形支架改为矩形支架。", "环形", "矩形", "候选同时保留环形和矩形结构。"],
        ["把这个提示词中的支架材质由不锈钢改为铝合金。", "不锈钢", "铝合金", "候选保留旧材质。"],
        ["把这个提示词中的岩石背景改为浅灰无缝背景。", "岩石背景", "浅灰无缝背景", "候选保留旧背景。"],
        ["只修改这个提示词的焦距，将 50mm 改为 85mm。", "50mm", "85mm", "候选保留了原焦距。"],
      ];
      const editor = page.locator('#canvasPlane [data-id="qa-lower"] .canvas-node-prompt');
      await page.evaluate(() => selectCanvasNode(ensureCanvasNodeMounted("qa-lower")));
      for (const [index, [request, from, to, reason]] of tests.entries()) {
        const original = "石墨灰保护壳，两个不锈钢环形可拆支架，岩石背景，50mm 中焦，右侧柔和自然光，左下构图。";
        await editor.evaluate((field, value) => {
          field.value = value;
          field.dispatchEvent(new Event("input", { bubbles: true }));
        }, original);
        await page.evaluate(() => saveCanvasBoardNow());
        const priorWrites = boardOperations.filter(item => item.entityId === "qa-lower").length;
        semanticCase = { request, original, correct: original.replace(from, to), reason, priorWrites };
        const previousTurns = promptTurns.length;
        await prompt.fill(request);
        await page.locator("#canvasAgentSend").click();
        const confirmations = page.locator("#canvasAgentMessages").getByText("已更新当前选中节点提示词，并完成内容核验。", { exact: true });
        await confirmations.nth(index + 1).waitFor();
        assert.deepEqual(promptTurns.slice(previousTurns + 1).map(turn => turn.tool_outputs[0].output.code || turn.tool_outputs[0].output.content_verified),
          ["prompt_edit_review_rejected", true]);
        assert.equal(await editor.inputValue(), semanticCase.correct);
        assert.equal(boardOperations.filter(item => item.entityId === "qa-lower").length, priorWrites + 1);
      }
      assert.equal(await page.locator('.canvas-agent-tool-step.is-error').filter({ hasText: "候选保留旧材质" }).count(), 0);
      const faultCases = [
        ["lost", "qa-lower", 1, true],
        ["unavailable", "qa-lower", 2, true],
        ["always", "qa-lower", 3, false],
        ["invalid", "qa-lower", 1, false],
        ["deleted", "qa-lower", 0, false],
        ["observing", "qa-upper", 1, true],
        ["unrelated", "qa-lower", 2, true],
        ["conflict", "qa-lower", 1, false],
      ];
      for (const [fault, nodeId, attempts, saved] of faultCases) {
        await page.evaluate(id => selectCanvasNode(ensureCanvasNodeMounted(id)), nodeId);
        const field = page.locator(`#canvasPlane [data-id="${nodeId}"] .canvas-node-prompt`);
        const original = await field.inputValue();
        const correct = fault === "observing" ? `岩石背景。${"保留原有构图、颜色、侧光。".repeat(830)}` : `${original} 保留专项编号 ${fault}。`;
        const request = `把当前节点的提示词完整改写，按专项编号 ${fault} 保留构图`;
        const priorWrites = boardOperations.filter(item => item.entityId === nodeId).length;
        semanticCase = { original, correct, request, priorWrites, nodeId, clean: true };
        saveFault = fault;
        saveAttempts = [];
        const results = page.locator("#canvasAgentMessages").locator(saved ? ".canvas-agent-message.is-assistant" : ".canvas-agent-message.is-error")
          .filter({ hasText: saved ? "完成内容核验" : "未确认节点内容已更新" });
        const priorResults = await results.count();
        await prompt.fill(request);
        await page.locator("#canvasAgentSend").click();
        await results.nth(priorResults).waitFor().catch(async error => {
            throw new Error(`${fault}: ${await page.locator("#canvasAgentMessages").innerText()}`, { cause: error });
          });
        await page.waitForFunction(() => !document.querySelector("#canvasAgentStop") || document.querySelector("#canvasAgentStop").hidden
          || document.querySelector("#canvasAgentStop").offsetParent === null);
        assert.equal(saveAttempts.length, attempts, fault);
        assert.equal(new Set(saveAttempts.map(item => item.operationId)).size, attempts ? 1 : 0, fault);
        assert.equal(await field.inputValue(), saved ? correct : original, fault);
        assert.equal(boardOperations.filter(item => item.entityId === nodeId).length, priorWrites + Number(saved || fault === "conflict"), fault);
        if (fault === "lost" || fault === "unavailable" || fault === "unrelated") {
          assert.equal(await page.locator('#canvasAgentMessages [data-tool-name="update_node"]').last()
            .locator('.canvas-agent-tool-status').textContent(), "重试后成功");
        }
        saveFault = "";
      }
      assert.equal(boardOperations.findLast(item => item.entityId === "qa-lower").after.prompt, "协作者的较新内容。");
      await openBoard();
      const afterReload = await page.evaluate(id => fetch(`/api/canvas/boards/${id}/node?nodeId=qa-lower`)
        .then(response => response.json()), boardId);
      assert.equal(afterReload.node.prompt, "协作者的较新内容。");
      const restoredSteps = page.locator('#canvasAgentMessages [data-tool-name="update_node"] .canvas-agent-tool-status')
        .filter({ hasText: "重试后成功" });
      await restoredSteps.first().waitFor();
      assert.deepEqual(generationRequests, []);
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ origin, target: "qa-lower", turns: promptTurns.length, saved: true, errors }, null, 2));
      return;
    }
    if (attachmentsOnly) {
      const shapes = [["方图", 100, 100], ["横图", 240, 100], ["竖图", 100, 160], ["超窄竖图", 35, 240], ["透明图", 100, 100]];
      const imageNodes = await page.evaluate(shapes => shapes.map(([name, width, height], index) => {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${index === 4 ? `<circle cx="50" cy="50" r="27" fill="#498"/>` : `<rect width="100%" height="100%" fill="#498"/>`}</svg>`;
        const src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
        const node = addCanvasImage(src, name, { x: 100 + 140 * index, y: 180 });
        node.dataset.nodeTitle = name;
        return node.dataset.id;
      }), shapes);
      for (const id of imageNodes) await mention(id);
      const imageTiles = media.locator(".canvas-agent-context-chip.is-image");
      const tileRects = () => imageTiles.evaluateAll(chips => chips.map(chip => {
        const { x, y, width, height } = chip.getBoundingClientRect();
        return [x, y, width, height];
      }));
      await page.waitForFunction(() => [...document.querySelectorAll("#canvasAgentContext .is-image img")].filter(img => img.naturalWidth).length === 5);
      await prompt.focus();
      await page.mouse.move(20, 60);
      const beforeHover = await tileRects();
      for (const [index, [name]] of shapes.entries()) {
        const chip = imageTiles.nth(index);
        const preview = chip.locator(".canvas-agent-context-preview");
        const remove = chip.locator(".canvas-agent-context-remove");
        assert.equal(await preview.getAttribute("title"), name);
        assert.equal(await preview.locator("img").evaluate(img => getComputedStyle(img).objectFit), "contain");
        assert.equal(await preview.locator(".canvas-agent-context-placeholder").isVisible(), false, name);
        assert.equal(await chip.locator(".canvas-agent-context-badge").isVisible(), false, name);
        assert.equal(await remove.evaluate(el => getComputedStyle(el).opacity), "0");
        await preview.hover();
        assert.equal(await remove.evaluate(el => getComputedStyle(el).opacity), "1");
        assert.equal(await chip.locator("[data-agent-material-role], select").count(), 0, "no manual role control in the composer");
        assert.deepEqual(await tileRects(), beforeHover);
        await page.mouse.move(20, 60);
        assert.equal(await remove.evaluate(el => getComputedStyle(el).opacity), "0");
      }
      for (const id of imageNodes) {
        const chip = media.locator(`[data-agent-node-id="${id}"]`);
        await chip.hover();
        await chip.locator(".canvas-agent-context-remove").click();
        await chip.waitFor({ state: "detached" });
        assert.ok(await page.evaluate(id => serializeCanvasBoard().nodes.some(node => node.id === id), id));
      }
      await prompt.fill("");
      const points = await page.evaluate(ids => {
        clearCanvasSelection();
        ids.forEach((id, index) => {
          const node = ensureCanvasNodeMounted(id);
          setCanvasNodePoint(node, { x: 100 + index * 900, y: 180 });
          updateCanvasNodePosition(node);
          syncCanvasNodeModel(node);
        });
        canvasState.x = 100;
        canvasState.y = 90;
        canvasState.scale = .25;
        applyCanvasTransformNow();
        const viewport = document.querySelector("#infiniteCanvas").getBoundingClientRect();
        return ids.slice(0, 2).map(id => {
          const box = resolveNodeVisualGeometry(id).outerBounds;
          return [viewport.left + canvasState.x + (box.left + 20) * canvasState.scale,
            viewport.top + canvasState.y + (box.top + 20) * canvasState.scale];
        });
      }, imageNodes);
      await page.mouse.click(...points[0]);
      assert.equal(await imageTiles.count(), 0, "普通选择不添加素材");
      const startPicker = async () => {
        await page.locator("#canvasAgentContextAdd").click();
        await page.locator('[data-agent-attachment="canvas"]').click();
      };
      await startPicker();
      const picker = page.locator("[data-canvas-agent-picker-banner]");
      await picker.getByText("正在从画布选择素材").waitFor();
      for (const point of [...points, points[0]]) await page.mouse.click(...point);
      const picked = () => imageTiles.evaluateAll(chips => chips.map(chip => chip.dataset.agentNodeId));
      assert.deepEqual(await picked(), imageNodes.slice(0, 2));
      await page.keyboard.press("Escape");
      await picker.waitFor({ state: "detached" });
      await startPicker();
      await picker.getByRole("button", { name: "取消" }).click();
      await picker.waitFor({ state: "detached" });
      await page.evaluate(() => clearCanvasSelection());
      assert.deepEqual(await picked(), imageNodes.slice(0, 2));
      async function clearImageTiles() {
        while (await imageTiles.count()) {
          await imageTiles.first().hover();
          await imageTiles.first().locator(".canvas-agent-context-remove").click();
        }
      }
      await clearImageTiles();
      const uploadStart = uploads.length;
      await page.locator("#canvasAgentFileInput").setInputFiles([
        { name: "批量首图.png", mimeType: "image/png", buffer: Buffer.concat([image, Buffer.from([1])]) },
        { name: "批量失败.png", mimeType: "image/png", buffer: Buffer.concat([image, Buffer.from([2])]) },
        { name: "批量末图.png", mimeType: "image/png", buffer: Buffer.concat([image, Buffer.from([3])]) },
      ]);
      await tile("批量末图.png").waitFor();
      assert.deepEqual(await imageTiles.evaluateAll(chips => chips.map(chip => chip.title)), ["批量首图.png", "批量末图.png"]);
      const retry = media.locator("[data-agent-material-retry]");
      await retry.click();
      await retry.waitFor();
      assert.deepEqual(uploads.slice(uploadStart).map(upload => upload.filename),
        ["批量首图.png", "批量失败.png", "批量末图.png", "批量失败.png"]);
      await clearImageTiles();
      await page.locator("#canvasAgentContextAdd").click();
      const [chooser] = await Promise.all([
        page.waitForEvent("filechooser"), page.locator('[data-agent-attachment="upload"]').click(),
      ]);
      await chooser.setFiles({ name: "附件验收.png", mimeType: "image/png", buffer: image });
      await tile("附件验收.png").waitFor();
      await prompt.fill("识别附件中的商品。");
      await prompt.press("Enter");
      await page.locator("#canvasAgentMessages .is-error").getByText(/模拟素材传递失败/).waitFor();
      assert.equal(await tile("附件验收.png").count(), 1);
      assert.equal(await prompt.inputValue(), "识别附件中的商品。");
      let releaseAttachmentTurn;
      finishTurn = { promise: new Promise(resolve => { releaseAttachmentTurn = resolve; }), release: () => releaseAttachmentTurn() };
      const request = page.waitForRequest(request => request.url().endsWith("/api/canvas-agent/turn"));
      await prompt.press("Enter");
      const payload = (await request).postDataJSON();
      assert.equal(payload.vision_images.length, 1);
      assert.match(payload.vision_images[0], /^data:image\/jpeg;base64,\/9j\//);
      assert.equal(payload.canvas.agent_image_attachments[0].source, "upload");
      assert.match(payload.request_id, /^[a-z0-9_-]+$/i);
      const userMessage = page.locator(`#canvasAgentMessages .is-user[data-request-id="${payload.request_id}"]`);
      await userMessage.getByText("识别附件中的商品。", { exact: true }).waitFor();
      const userStatuses = userMessage.locator(".canvas-agent-message-status");
      assert.equal(await userStatuses.count(), 0);
      await page.waitForFunction(async requestId => {
        const response = await fetch("/api/canvas-agent/conversation?board_id=qa-agent-composer");
        const current = await response.json();
        return current.items.some(item => item.requestId === requestId
          && item.deliveryStatus === "sending" && item.attachments?.[0]?.name === "附件验收.png");
      }, payload.request_id);
      let releaseAssistantSave;
      deferAssistantSave = new Promise(resolve => { releaseAssistantSave = resolve; });
      const assistantSave = page.waitForRequest(request => {
        if (!request.url().endsWith("/api/canvas-agent/conversation") || request.method() !== "POST") return false;
        const items = request.postDataJSON().conversation?.items || [];
        return items.some(item => item.requestId === payload.request_id && item.role === "user" && item.executionStatus === "running")
          && items.some(item => item.role === "assistant" && item.text === "验收模拟回复。");
      });
      void assistantSave.catch(() => {});
      finishTurn.release();
      const bubble = userMessage.locator(".canvas-agent-message-attachments");
      await bubble.getByRole("img", { name: "附件验收.png" }).waitFor();
      assert.equal(await bubble.innerText(), "");
      assert.equal(await bubble.locator("li").getAttribute("title"), "附件验收.png");
      await tile("附件验收.png").waitFor({ state: "detached" });
      assert.equal(await prompt.inputValue(), "");
      try {
        await assistantSave;
        assert.equal(await userStatuses.count(), 0);
      } finally {
        releaseAssistantSave();
      }
      await page.waitForFunction(async requestId => {
        const response = await fetch("/api/canvas-agent/conversation?board_id=qa-agent-composer");
        return (await response.json()).items.some(item => item.requestId === requestId
          && item.deliveryStatus === "sent" && item.status === "completed" && !item.executionStatus);
      }, payload.request_id);
      assert.equal((await userMessage.innerText()).trim(), "识别附件中的商品。");
      await openBoard();
      await bubble.getByRole("img", { name: "附件验收.png" }).waitFor();
      assert.equal(await userStatuses.count(), 0);
      assert.equal(await tile("附件验收.png").count(), 0);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: path.join(output, "attachment-reload.png") });
      console.log("附件上传、发送失败保留、JPEG 请求、成功回显与刷新恢复通过。");
      return;
    }
    if (skillPositionOnly) return await checkSkillPositionOnly();
    if (footerPositionOnly) {
      const menus = [
        ["Agent", "#canvasAgentModeButton", "#canvasAgentModePopover"],
        ["Skill", "#canvasAgentSkillBook", "#canvasAgentSkillPopover"],
        ["生成偏好", "#canvasAgentGenerationButton", "#canvasAgentGenerationPopover"],
        ["附件", "#canvasAgentContextAdd", "#canvasAgentAttachmentPopover"],
      ];
      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        for (const [name, trigger, popup] of menus) {
          await checkPopover(page.locator(trigger), page.locator(popup), width);
          if (width === 1440) await page.screenshot({ path: path.join(output, `footer-${name}.png`) });
          await page.keyboard.press("Escape");
          await page.locator(popup).waitFor({ state: "hidden" });
        }
      }
      const handle = page.locator("#canvasAgentResizeHandle");
      await handle.press("Home");
      await checkPopover(preferenceTrigger, preference, widths.at(-1));
      await page.keyboard.press("Escape");
      await handle.press("End");
      await checkPopover(preferenceTrigger, preference, widths.at(-1));
      await page.keyboard.press("Escape");
      await page.setViewportSize({ width: 1280, height: 430 });
      await preferenceTrigger.click();
      const scroll = await preference.evaluate(element => ({
        height: element.clientHeight, content: element.scrollHeight, overflow: getComputedStyle(element).overflowY,
      }));
      assert.ok(scroll.height > 0 && scroll.content > scroll.height && scroll.overflow === "auto", JSON.stringify(scroll));
      await page.keyboard.press("Escape");
      await page.setViewportSize({ width: 1440, height: 900 });
      await openBoard();
      await checkPopover(page.locator("#canvasAgentModeButton"), page.locator("#canvasAgentModePopover"), 1440);
      assert.deepEqual(errors, []);
      console.log("底栏四类浮层通过 5 种视口、调宽、短视口滚动和刷新检查");
      return;
    }
    await capture("empty");
    if (before) {
      await preferenceTrigger.click();
      await preference.screenshot({ path: path.join(output, "before-preferences.png") });
      assert.equal(await form.locator("#canvasAgentAttach").count(), 0);
      return;
    }
    const sources = await addCanvasMedia();
    await mention(sources[0].id);
    if (!before) {
      assert.equal(await media.locator("[data-agent-node-id]:not([data-agent-node-id=''])").count(), 1);
      await page.waitForFunction(name => [...document.querySelectorAll("#canvasAgentContext [title]")].some(element =>
        element.title === name && element.querySelector("img")?.naturalWidth > 0), sources[0].name);
      await capture("single-image");
    }
    for (const { id } of sources.slice(1)) await mention(id);
    await page.waitForFunction(() => document.querySelector("#canvasAgentContext video")?.readyState >= 2);
    await capture("mixed");
    assert.equal(await form.locator("#canvasAgentAttach, #canvasAgentExpandPrompt, #canvasAgentSettingsButton").count(), 0);
    assert.equal(await form.locator("#canvasAgentContextAdd").count(), 1);
    assert.equal(await form.locator(".canvas-agent-prompt-area").evaluate(element => getComputedStyle(element, "::after").content), "none");
    assert.equal(await prompt.evaluate(element => getComputedStyle(element).backgroundColor), "rgba(0, 0, 0, 0)");
    assert.equal(await form.locator(".canvas-agent-form-footer").evaluate(element => getComputedStyle(element).borderTopWidth), "0px");
    assert.equal(await media.evaluate(element => getComputedStyle(element).backgroundColor), "rgba(0, 0, 0, 0)");
    const sourceIds = await media.locator("[data-agent-node-id]:not([data-agent-node-id=''])")
      .evaluateAll(elements => elements.map(element => element.dataset.agentNodeId));
    assert.deepEqual(sourceIds, sources.map(source => source.id));
    assert.doesNotMatch(await media.innerText(), /@(?:图|视频|音频)\d+/u);
    for (const { name, kind } of sources) {
      assert.ok(!(await prompt.inputValue()).includes(`@${name}`));
      await tile(name).locator(kind === "audio" ? "svg" : kind === "video" ? "video" : "img").first().waitFor({ state: "attached" });
    }
    await tile(sources[1].name).hover();
    await tile(sources[1].name).getByRole("button", { name: `移除 ${sources[1].name}` }).click();
    assert.equal(await tile(sources[1].name).count(), 0);
    assert.ok(!(await prompt.inputValue()).includes(`@${sources[1].name}`));
    await page.locator("#canvasAgentContextAdd").click();
    await page.locator('[data-agent-attachment="canvas"]').click();
    const pick = await page.evaluate(id => {
      const node = ensureCanvasNodeMounted(id);
      const view = document.querySelector("#infiniteCanvas");
      const bounds = node?.getBoundingClientRect();
      return { mounted: node?.isConnected, x: bounds?.left + 60, y: bounds?.top + 60,
        matches: node?.closest("#infiniteCanvas") === view,
        nodes: [...view.querySelectorAll(".canvas-node")].map(element => element.dataset.id) };
    }, sources[1].id);
    assert.equal(pick.mounted, true, JSON.stringify(pick));
    assert.equal(pick.matches, true, JSON.stringify(pick));
    await page.mouse.click(pick.x, pick.y);
    await tile(sources[1].name).waitFor();

    await page.locator("#canvasAgentContextAdd").click();
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"), page.locator('[data-agent-attachment="upload"]').click(),
    ]);
    await chooser.setFiles([
      { name: "上传图片.png", mimeType: "image/png", buffer: image },
      { name: "上传视频.mp4", mimeType: "video/mp4", buffer: video },
      { name: "上传音频.wav", mimeType: "audio/wav", buffer: Buffer.from("audio fixture") },
    ]);
    for (const name of ["上传图片.png", "上传视频.mp4", "上传音频.wav"]) await tile(name).waitFor();
    assert.deepEqual(uploads.map(upload => upload.path), ["/api/upload-image", "/api/upload-media", "/api/upload-media"]);
    assert.deepEqual(await media.locator(".canvas-agent-context-chip.is-image").count(), 2);
    await capture("multiple-images");
    await page.locator("#canvasAgentContextAdd").click();
    await page.locator('[data-agent-attachment="library"]').click();
    await page.locator('[data-asset-insert="library-video"]').click();
    await tile("库内视频").waitFor();

    await page.locator("#canvasAgentModeButton").click();
    await page.locator('[data-agent-mode="agent"]').click();
    await page.locator("#canvasAgentSkillBook").click();
    await page.locator('[data-agent-skill="qa-skill"]').click();
    await media.getByText("版式策划", { exact: true }).waitFor();
    await preferenceTrigger.click();
    await preference.waitFor();
    await model.locator('option[value="gpt-image-2"]').waitFor({ state: "attached" });
    assert.equal(await automatic.isChecked(), true);
    assert.equal(await setting("size", "1:1").isDisabled(), true);
    await automatic.uncheck();
    await model.selectOption("gpt-image-2-ainb");
    await setting("size", "1:1").click();
    await setting("resolution", "2").click();
    assert.equal(await setting("resolution", "4").isDisabled(), true);
    const imageSettings = { mode: "agent", automatic: false, type: "image", model: "gpt-image-2-ainb", size: "1:1", resolution: "2" };
    await waitSaved(imageSettings);
    await page.screenshot({ path: path.join(output, "after-image.png") });
    await setting("type", "video").click();
    assert.deepEqual(await preference.locator("[data-agent-generation='size']").evaluateAll(items => items.map(item => item.dataset.value)), ["16:9", "9:16"]);
    await setting("size", "9:16").click();
    await setting("resolution", "1080p").click();
    const videoSettings = { mode: "agent", automatic: false, type: "video", model: "qa-video", size: "9:16", resolution: "1080p" };
    await waitSaved(videoSettings);
    await page.screenshot({ path: path.join(output, "after-video.png") });
    await preferenceTrigger.click();
    boardNodes = await page.evaluate(() => serializeCanvasBoard().nodes);
    const savedDraft = await prompt.inputValue();
    await openBoard();
    assert.equal(await prompt.inputValue(), savedDraft);
    await tile("库内视频").waitFor();
    await tile("上传音频.wav").waitFor();
    await preferenceTrigger.click();
    await model.locator('option[value="qa-video"]').waitFor({ state: "attached" });
    assert.equal(await model.inputValue(), videoSettings.model);
    assert.equal(await setting("size", "9:16").getAttribute("aria-pressed"), "true");
    assert.equal(await setting("resolution", "1080p").getAttribute("aria-pressed"), "true");
    await preferenceTrigger.click();
    await page.locator("#canvasAgentConversationButton").click();
    await page.getByText("隔离会话", { exact: true }).waitFor();
    await page.locator("#canvasAgentHistoryClose").click();

    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await form.evaluate(element => {
        const footer = element.querySelector(".canvas-agent-form-footer");
        const send = element.querySelector("#canvasAgentSend").getBoundingClientRect();
        const bounds = element.getBoundingClientRect();
        return document.documentElement.scrollWidth > innerWidth || footer.scrollWidth > footer.clientWidth + 1 || send.right > bounds.right;
      });
      assert.equal(overflow, false, `viewport ${width}`);
      const flush = await form.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        const panel = element.closest("#canvasAgentPanel");
        const inner = panel.getBoundingClientRect();
        return Math.abs(bounds.left - inner.left - panel.clientLeft) < 2
          && Math.abs(bounds.right - inner.right) < 2 && Math.abs(bounds.bottom - inner.bottom) < 2;
      });
      assert.equal(flush, true, `flush composer at ${width}`);
      await skillTrigger.click();
      await assertSkillPosition();
      if (width === 1440) await page.screenshot({ path: path.join(output, "after-skill.png") });
      await page.locator("#canvasAgentSkillSearch").press("Escape");
      assert.equal(await skillTrigger.evaluate(element => document.activeElement === element), true);
      await checkPopover(preferenceTrigger, preference, width);
      await preferenceTrigger.click();
      if (width === 390) {
        assert.ok(await media.evaluate(element => {
          element.scrollLeft = element.scrollWidth;
          return getComputedStyle(element).overflowX === "auto" && element.scrollLeft > 0;
        }));
        await capture("mobile");
      }
    }
    await prompt.fill(Array(24).fill("验证长提示词可以持续输入并内部滚动").join("\n"));
    assert.ok(await prompt.evaluate(element => element.scrollHeight > element.clientHeight));
    assert.equal(await prompt.evaluate(element => getComputedStyle(element).boxShadow), "none");
    assert.equal(await prompt.evaluate(element => getComputedStyle(element).outlineStyle), "none");
    await page.locator("#canvasAgentSkillBook").click();
    await page.locator("#canvasAgentUseAuto").click();
    await prompt.fill("请简要描述这段内容。");
    let releaseTurn;
    finishTurn = { promise: new Promise(resolve => { releaseTurn = resolve; }), release: () => releaseTurn() };
    const turnRequest = page.waitForRequest(request => request.url().endsWith("/api/canvas-agent/turn"));
    await prompt.press("Enter");
    assert.deepEqual((await turnRequest).postDataJSON().generation_settings, videoSettings);
    const cancelRequest = page.waitForRequest(request => request.url().endsWith("/api/canvas-agent/cancel"));
    await page.locator("#canvasAgentStop").click();
    await cancelRequest;
    finishTurn.release();
    await page.locator("#canvasAgentSend").waitFor();
    await preferenceTrigger.click();
    await automatic.check();
    await waitSaved({ automatic: true });
    assert.equal(await setting("type", "image").isDisabled(), true);
    await preferenceTrigger.click();
    await prompt.fill("请简要描述这段内容。");
    const autoRequest = page.waitForRequest(request => request.url().endsWith("/api/canvas-agent/turn"));
    await prompt.press("Enter");
    assert.equal((await autoRequest).postDataJSON().generation_settings.automatic, true);
    await page.locator("#canvasAgentSend").waitFor();
    await preferenceTrigger.click();
    await automatic.uncheck();
    await setting("type", "image").click();
    await model.selectOption(imageSettings.model);
    await setting("size", imageSettings.size).click();
    await setting("resolution", imageSettings.resolution).click();
    await preferenceTrigger.click();
    await prompt.fill("请简要描述这段内容。");
    const imageRequest = page.waitForRequest(request => request.url().endsWith("/api/canvas-agent/turn"));
    await prompt.press("Enter");
    assert.deepEqual((await imageRequest).postDataJSON().generation_settings, imageSettings);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ origin, checkedWidths: widths, uploads, output, errors }, null, 2));
  } finally {
    finishTurn?.release();
    await browser.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
