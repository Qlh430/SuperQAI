const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

const root = path.resolve(__dirname, '..');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(request, parent, ...rest) {
  if (request === './canvas-feature-registry.js' && parent?.filename?.includes('host-sources')) {
    return path.join(__dirname, 'design-sources/canvas-feature-registry.js');
  }
  return originalResolve.call(this, request, parent, ...rest);
};
const runtime = require('../host-sources/app/canvas-agent-runtime');
const contract = require('../host-sources/app/canvas-agent-skill-contract');
const conversation = require('../host-sources/app/canvas-agent-conversation');

test('H3 registers a reusable interaction with four stable image roles', () => {
  const { business } = runtime.loadCanvasSkillCatalog([{ directory: path.join(root, 'host-sources/app/skills'), origin: 'system' }]);
  const wizard = conversation.parseInteraction(business.find(item => item.id === 'h3-commerce-video').metadata.canvas_agent_wizard);
  assert.ok(wizard);
  const values = conversation.prefillInteraction(wizard, '商品：伸缩线充电宝，面向通勤人群，只拍产品。卖点：自带伸缩充电线；适用接口以包装说明为准。');
  assert.equal(values.product_name, '伸缩线充电宝');
  assert.equal(values.audience_usage, '通勤人群');
  assert.equal(values.presentation_mode, 'product_voiceover');
  const images = conversation.getInteractionSteps(wizard, values).filter(step => step.kind === 'image');
  assert.deepEqual(images.map(step => step.image_slot), ['opening', 'main', 'evidence', 'detail']);
  assert.ok(images.every(step => step.required && step.sources.includes('library') && step.sources.includes('upload') && step.sources.includes('canvas')));
  const draft = { values, sourceNodeIds: [] };
  Object.assign(draft, conversation.updateInteractionImages(wizard, images[2], draft, ['evidence-node']));
  Object.assign(draft, conversation.updateInteractionImages(wizard, images[0], draft, ['opening-node']));
  assert.deepEqual(draft.sourceNodeIds, ['opening-node', 'evidence-node']);
  const reused = conversation.updateInteractionImages(wizard, images[1], draft, ['opening-node']);
  assert.deepEqual(conversation.getInteractionImageIds(images[1], reused), ['opening-node']);
  assert.deepEqual(reused.sourceNodeIds, ['opening-node', 'evidence-node']);
  const restored = conversation.normalize({ wizardDraft: { ...draft, boardId: 'board', taskId: 'task', skillId: 'h3-commerce-video', status: 'collecting' } }, 'board');
  assert.deepEqual(conversation.getInteractionImageIds(images[2], restored.wizardDraft), ['evidence-node']);
});

test('h3-commerce-video is discoverable with full references and bounded tools', () => {
  const catalog = runtime.loadCanvasSkillCatalog([
    { directory: path.join(root, 'host-sources/app/skills'), origin: 'system' },
  ]);
  const skill = catalog.business.find(item => item.id === 'h3-commerce-video');
  assert.ok(skill);
  assert.equal(skill.metadata.version, '0.2.11');
  assert.deepEqual(skill.canvas.tools, ['read_skill_reference', 'save_h3_commerce_package', 'fill_h3_commerce_node']);
  assert.deepEqual(skill.references.map(item => item.path), [
    'references/assets.md',
    'references/onboarding.md',
    'references/production.md',
    'references/prompts.md',
    'references/selling-copy.md',
    'references/workflow-contract.md',
  ]);
  assert.equal(skill.execution.exposure, 'agent');
  assert.equal(skill.execution.allowImplicitInvocation, true);
  assert.ok(skill.execution.stages.some(stage => stage.mustRead.includes('references/production.md')));
});

test('H3 intent reaches production and the model receives bounded tools and all four visual inputs', () => {
  const skills = runtime.loadCanvasSkillCatalog([{ directory: path.join(root, 'host-sources/app/skills'), origin: 'system' }]);
  const skill = skills.business.find(item => item.id === 'h3-commerce-video');
  const prompt = '根据商品图片、商品主图和商品细节图生成 H3 带货视频';
  assert.equal(contract.classifySkillStage(skill, prompt), 'production');
  assert.equal(runtime.inferCanvasAgentBusinessSkill(prompt, skills.business), null);
  const verified = { ...skill, enabled: true, validation_status: 'verified' };
  assert.equal(runtime.inferCanvasAgentBusinessSkill(prompt, [verified]), verified);
  assert.equal(runtime.inferCanvasAgentBusinessSkill(prompt, [{ ...verified, enabled: false }]), null);
  assert.equal(runtime.inferCanvasAgentBusinessSkill(prompt, [{ ...verified, execution: null }]), null);
  assert.equal(runtime.inferCanvasAgentBusinessSkill(prompt, [verified, { ...verified, id: 'other-workflow' }]), null);
  assert.equal(runtime.inferCanvasAgentBusinessSkill('请重命名选中的 H3 带货视频节点', [verified]), null);
  for (const mode of ['manual', 'auto']) {
    const request = runtime.buildChatCompletionsRequest({
      prompt, skill_mode: mode, skill_id: mode === 'manual' ? skill.id : '',
      skill_workflow: mode === 'manual',
      vision_images: Array(4).fill('data:image/png;base64,YQ=='),
    }, { skills: mode === 'manual' ? skills : { ...skills, business: [verified] } });
    const tools = request.tools.map(item => item.function.name);
    for (const name of ['read_skill_reference', 'save_h3_commerce_package', 'fill_h3_commerce_node']) assert.ok(tools.includes(name), name);
    assert.ok(!tools.includes('run_canvas_node'));
    assert.equal(request.messages.find(item => item.role === 'user').content.filter(item => item.type === 'image_url').length, 4);
  }
});
test('H3 review accepts the no-missing text returned by the real model and preserves actual blockers', () => {
  const conversation = require('../host-sources/app/canvas-agent-conversation');
  const analysis = '逐图核验已完成';
  const proposal = '两段方案';
  assert.deepEqual(conversation.parseInteractionReview(JSON.stringify({ analysis, proposal, missing: '无。' })), { analysis, proposal, missing: '' });
  assert.equal(conversation.parseInteractionReview(JSON.stringify({ analysis, proposal, missing: '缺少商品主图。' })).missing, '缺少商品主图。');
  assert.equal(conversation.parseInteractionReview(JSON.stringify({ analysis: '', proposal: '', missing: '无。' })), null);
  assert.deepEqual(conversation.parseInteractionReview(JSON.stringify({
    analysis, proposal, missing_fact: { field: 'selling_facts', question: '请确认包装净含量。' }, invalid_image: null,
  })).missingFact, { field: 'selling_facts', question: '请确认包装净含量。' });
  assert.deepEqual(conversation.parseInteractionReview(JSON.stringify({
    analysis, proposal, missing_fact: null, invalid_image: { slot: 'main', reason: '包装属于另一个规格。' },
  })).invalidImage, { slot: 'main', reason: '包装属于另一个规格。' });
  assert.equal(conversation.parseInteractionReview(JSON.stringify({
    analysis, proposal, invalid_image: { slot: 'extra', reason: '地址无效。' },
  })), null);
});

test('H3 restores a saved plan when the legacy host omits the execution target and conversation ID', () => {
  const { normalize } = require('../host-sources/app/canvas-agent-conversation');
  const boardId = 'h3-qa-board';
  const conversationId = 'h3-qa-conversation';
  const pendingWorkflow = {
    workflow: 'skill', skillId: 'h3-commerce-video', boardId, status: 'awaiting-confirmation',
    analysis: '核对四图', proposal: '双段方案', workflowId: 'h3-qa-plan', updatedAt: '2026-11-20T00:00:00.000Z',
    sourceNodeIds: ['source'], sourceFingerprint: 'a'.repeat(64),
  };
  const fromOldHost = normalize({ boardId, conversationId, pendingWorkflow }).pendingWorkflow;
  const fromClient = normalize({
    boardId, conversationId, pendingWorkflow: { ...pendingWorkflow, conversationId, executionTarget: 'skill' },
  }).pendingWorkflow;
  assert.deepEqual(fromOldHost, fromClient);
});
