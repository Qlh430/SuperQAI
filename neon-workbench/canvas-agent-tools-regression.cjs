const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { installFixedStageRouting } = require('./test-fixtures/fixed-stage-routing.cjs')

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const isolatedVisualDir = process.env.AGENT_SCREENSHOT_DIR
  ? path.resolve(process.env.AGENT_SCREENSHOT_DIR)
  : fs.mkdtempSync(path.join(os.tmpdir(), 'aios-agent-regression-'))
fs.mkdirSync(isolatedVisualDir, { recursive: true })
const referenceFiles = [
  'references/case-library.md',
  'references/photography-methods.md',
  'references/source-notes.md',
  ...['NA-01', 'NA-02', 'NA-03', 'NA-04', 'NA-05', 'NA-06', 'NA-07']
    .map(id => `references/cases/${id}.md`),
]
const board = { nodes: new Map(), connections: new Map(), revision: 0 }
let failSaves = false
let mockAgentTurn = false
let mockAgentError = false
let mockAgentTimeout = false
let mockLongAgentRun = false
let mockNoProgressRun = false
let mockNaturalPhotoRun = false
let mockPlainReply = false
let mockSlowPlainReply = false
let dropPendingWorkflow = false
let failNaturalConfirmOnce = false
let denyNaturalNodeCreation = false
let mockGenericWizard = false
const agentRequests = []
const timeoutAgentRequests = []
const plainRequests = []
const naturalPhotoRequests = []
const paidJobRequests = []
const skillReferenceRequests = []
const savedConversations = new Map()
const conversationSessions = new Map()
const activeConversationIds = new Map()

function getConversationSessionMap(boardId) {
  if (!conversationSessions.has(boardId)) conversationSessions.set(boardId, new Map())
  return conversationSessions.get(boardId)
}

function getConversationSessionTitle(conversation) {
  const firstPrompt = conversation?.items?.find(item => item.role === 'user' && item.text.trim())?.text.trim()
  return String(firstPrompt || '新建对话').replace(/\s+/g, ' ').slice(0, 96)
}
const naturalPhotoModel = {
  id: 'qa-natural-photo-image', modelId: 'gpt-image-2', model: 'gpt-image-2',
  displayName: '隔离摄影模型', providerId: 'qa-photo', providerName: '隔离测试接口',
  family: 'gpt-image-2', platform: 'openai', state: 'online',
  enabled: true, hasApiKey: true, hasBaseUrl: true,
  capabilities: ['image.generate', 'image.edit'], resolutions: ['1', '2', '4'],
  ratios: ['1:1', '3:4', '3:2', '4:5', '9:16', '16:9'],
}
const naturalPhotoWizard = fs.readFileSync(path.join(__dirname,
  '../host-sources/app/skill-packages/natural-aesthetic-product-photography/interaction.json'), 'utf8')
const genericWizard = {
  version: 1, title: '通用创作向导', execution: { target: 'image', instructions: '创建一个可编辑图片节点' },
  steps: [
    { id: 'request', title: '创作要求', fields: [
      { id: 'request_text', type: 'text', label: '要求', prefill: 'prompt', required: true },
      { id: 'channels', type: 'choice', label: '传播渠道', multiple: true, default: ['web'], max_items: 2,
        options: [{ value: 'web', label: '官网' }, { value: 'social', label: '社交媒体' }, { value: 'poster', label: '海报' }] },
      { id: 'copy', type: 'choice', label: '文案需求', default: 'no',
        options: [{ value: 'no', label: '无需文案' }, { value: 'yes', label: '需要文案' }] },
      { id: 'copy_text', type: 'textarea', label: '准确文案', visible_when: { field: 'copy', equals: 'yes' },
        required: { field: 'copy', equals: 'yes' }, max_length: 100 },
      { id: 'audience', type: 'text', label: '受众建议', prefill: 'ai' },
    ] },
    { id: 'social', title: '社交补充', visible_when: { field: 'channels', includes: 'social' },
      fields: [{ id: 'social_notes', type: 'textarea', label: '社交要求', required: true }] },
    { id: 'material', title: '参考素材', kind: 'image', required: false },
    { id: 'output', title: '输出参数', fields: [
      { id: 'size', type: 'choice', label: '画面比例', capability: 'image_output_size', required: true,
        options: [{ value: '1:1', label: '1:1' }, { value: '16:9', label: '16:9' }] },
      { id: 'resolution', type: 'choice', label: '分辨率', capability: 'image_resolution', required: true,
        options: [{ value: '1', label: '标准' }, { value: '2', label: '高' }] },
    ] },
    { id: 'proposal', title: '确认通用方案', kind: 'proposal', description: '默认应折叠的测试说明：这段较长的解释不应占据确认卡。' },
  ],
}
let naturalPhotoSourceId = ''
let pickerSourceNodeId = ''
let canvasPickerChecked = false
const naturalPhotoScenarios = {
  keyboard: {
    choices: ['A 移动工作站（NA-04）', 'B 建筑光廊（NA-06）', 'C 色面舞台（NA-07）'],
    preview: {
      summary: 'A 移动工作站（NA-04，原创）推荐，以便携办公用途和完整展开结构匹配。键盘在下部稳定工作面占宽65%，16:9上方留白，一册独立笔记本与后景窗墙形成办公纵深，侧前柔光突出键帽，保留红色、三段两铰链和右侧触控区。B 建筑光廊（NA-06，原创）以长边和三段几何匹配，在下部石台占宽60%，上方墙面留白，前景台缘、中景键盘、后景建筑光廊形成遮挡层次，窗影与红框形成节奏，注意阴影不能吞没键位。C 色面舞台（NA-07，原创）以红色和长轮廓匹配，斜向偏心占宽65%，中性补光与错位色面形成图形广告，保留完整键区，防止色面染色。三方案分别表达办公用途、建筑空间和图形节奏，均改变原灰桌斜放的构图及光线。方向尚待选择，当前提示词为A预览。',
      image_prompt: '方向待选择。推荐移动工作站商业摄影，结合键盘的便携办公定位与完整展开结构。',
    },
    image_prompt: [
      '参考产品为完全展开的红色三段折叠键盘，保留两处铰链、米白键帽布局、右侧深灰触控区及红框的反光观感。',
      '创作建筑光廊商业主视觉，16:9横幅中键盘长边接近水平置于下部偏右，占宽60%，左上墙面留白。前景为浅色石台边缘，中景完整键盘与错位墙面，远景连续光廊形成建筑纵深，以红框和几何投影构成节奏。',
      '采用参考可支持的高位斜俯机位，左侧大面积窗光控制红框宽高光，画外弱补光分离触控区，背景墙面承接几何投影并避开键区，保持红、米白与深灰原色及自然接触阴影。',
      '检查三段结构与触控区位置，避免新增接口、配件和屏幕。细小键字符与复杂键位需出图后人工比对，不猜写模糊字符。',
    ].join('\n\n'),
    known_context: '事实为红框三段展开键盘。已选择B建筑光廊 NA-06（AI OS原创方法），长边与几何分段适配建筑投影。NA-04办公用途适配但叙事不同，NA-07可作图形广告，NA-05草坡承托不适合展开键盘。硬约束为分段、铰链和右侧触控区，创意空间为场景、位置和布光。材质成分未知。采用支持的16:9、分辨率2，当前可用模型由节点选择。风险为键字符和铰链，出图后核验。',
    summary: '已选择B建筑光廊（NA-06，原创）。长边与几何分段适配建筑投影。浅色承托面上水平偏下占宽60%，16:9左上留白，前景台缘、中景键盘、后景光廊形成纵深。左侧窗光与红框形成节奏，相比灰桌斜置原图改变场景和构图。保留三段、两处铰链与右侧触控区，注意细小键位风险。',
    parameters: { model: null, size: '16:9', resolution: '2' },
  },
  phoneCase: {
    choices: ['A 草丘与天空（NA-05）', 'B 建筑光廊（NA-06）', 'C 透光层幕（NA-01）'],
    recommended: 'B 建筑光廊（NA-06）',
    preview: {
      summary: 'A 草丘与天空（NA-05，原创）以青绿色透光边缘和轻薄轮廓匹配。低位手机壳占高35%，9:16上半部天空留白，前景虚草、中景草丘稳定承托、远景天空，黄金时段侧后柔光突出透光边，注意空壳稳定与开孔完整。B 建筑光廊（NA-06，原创）推荐，以圆角长方轮廓和开孔匹配，下部平台占高40%，墙面留白，前景台缘、中景产品、后景连续墙面，冷灰窗影突出青绿色，防止环境改色。C 透光层幕（NA-01，原创）借用透光方法，以边缘和半透明观感匹配，主体偏右占高50%，错位半透明片形成光学空间，侧后柔光分离边缘，控制高光不吞孔。三方向分别形成自然叙事、建筑纵深和光学空间。保留圆角空壳、左上相机孔与侧按钮孔，不新增手机磁环。方向尚待选择，当前提示词为B预览。',
      image_prompt: '方向待选择。推荐草丘与天空自然广告，用低位构图和侧后柔光表现手机壳的透光边缘。',
    },
    image_prompt: [
      '参考产品为青绿色半透明空手机壳，保留圆角背板、左上相机开孔、侧按钮开口及边缘透光与壳体比例。',
      '创作草丘与天空自然场景商业海报，9:16竖幅中低位主体位于下三分之一、占高35%，背板在可见面内朝向镜头，平稳斜卧在草丘内干燥平整石面。弧形坡线导向产品，前景少量虚化草叶，中景草丘承托产品，远景低地平线与天空，天空占上半部留白。',
      '黄金时段柔和侧后光描出透光边缘，前侧中性天空补光维持青绿色及开孔，浅蓝天空与草色建立环境关系，抑制绿反射，接触阴影与承托一致，保持参考可见面和自然透视。',
      '不新增手机、镜头或磁环，不以草丘暗示防水环保。核验开孔、空壳和透光程度，避免草叶遮孔、悬浮或为直立改变结构。',
    ].join('\n\n'),
    known_context: '事实为青绿色半透明空手机壳，圆角、左上相机孔、侧按钮孔与透光边可辨，成分和性能未知。已选择A草丘与天空 NA-05（AI OS原创方法，RunningHub原作品未核实），匹配轻薄轮廓、青绿色和透光边缘，借用低主体、大天空与地形层次。比较NA-06建筑和NA-01层幕后选择自然广告。硬约束为结构与原色，创意空间为低位构图、天空留白、草丘及光线。采用已支持9:16与分辨率1，模型由当前节点选择，保真风险为开孔与稳定承托。',
    summary: '已选择A草丘与天空（NA-05，原创）。青绿色透光边缘和轻薄轮廓适配自然广告。9:16低位主体占高35%，在草丘平稳石面上斜卧，天空上半部留白。前景虚草、中景草丘与产品、远景天空形成叙事，黄金时段侧后柔光勾边，中性补光保原色。相较灰桌居中改变场景、构图与光线。保留空壳及原开孔，注意支撑和环境染色。',
    parameters: { model: null, size: '9:16', resolution: '1' },
  },
}
let naturalPhotoScenario = naturalPhotoScenarios.keyboard

async function waitForPaidJobRequests(count, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs
  while (paidJobRequests.length < count && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  assert.equal(paidJobRequests.length, count, `expected ${count} isolated image job requests`)
}

;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(edge) ? edge : undefined })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await installFixedStageRouting(page)
  const errors = []
  page.on('pageerror', error => errors.push(error.stack || error.message))
  await page.routeWebSocket('**/*', ws => ws.close())
  await page.route('**/output/agent-context-fixture.mp4', route => route.fulfill({
    status: 200,
    contentType: 'video/mp4',
    body: fs.readFileSync(path.join(__dirname, 'test-fixtures/video-seek-fixture.mp4')),
  }))
  await page.route('**/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname === '/api/canvas-agent/conversation') {
      if (request.method() === 'GET') {
        const boardId = url.searchParams.get('board_id') || ''
        const action = url.searchParams.get('action') || ''
        const sessionMap = getConversationSessionMap(boardId)
        const current = savedConversations.get(boardId)
        if (current && !sessionMap.has(current.conversationId)) sessionMap.set(current.conversationId, current)
        if (action === 'list') {
          return route.fulfill({ json: {
            boardId,
            activeConversationId: activeConversationIds.get(boardId) || current?.conversationId || '',
            sessions: [...sessionMap.values()].map(conversation => ({
              conversationId: conversation.conversationId,
              title: getConversationSessionTitle(conversation),
              updatedAt: conversation.updatedAt || new Date().toISOString(),
              itemCount: conversation.items?.length || 0,
            })),
          } })
        }
        const requestedSessionId = url.searchParams.get('conversation_id') || ''
        const loadedSession = requestedSessionId
          ? sessionMap.get(requestedSessionId)
          : sessionMap.get(activeConversationIds.get(boardId) || '') || current
        return route.fulfill({ json: loadedSession || {
          boardId: url.searchParams.get('board_id') || '',
          conversationId: 'natural-photo-isolated-conversation',
          revision: 0,
          items: [],
          generationSettings: { mode: 'agent', automatic: true, type: 'image', model: '', size: 'auto', resolution: '' },
          pendingWorkflow: null,
        } })
      }
      const payload = request.postDataJSON()
      const boardId = String(payload.board_id || '')
      const sessionMap = getConversationSessionMap(boardId)
      if (payload.action === 'create') {
        const previous = savedConversations.get(boardId)
        if (previous) sessionMap.set(previous.conversationId, previous)
        const conversation = {
          boardId,
          conversationId: `isolated-session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          revision: 0,
          items: [],
          pendingWorkflow: null,
          wizardDraft: null,
          generationSettings: { mode: 'agent', automatic: true, type: 'image', model: '', size: 'auto', resolution: '' },
          updatedAt: new Date().toISOString(),
        }
        sessionMap.set(conversation.conversationId, conversation)
        activeConversationIds.set(boardId, conversation.conversationId)
        savedConversations.set(boardId, conversation)
        return route.fulfill({ status: 201, json: conversation })
      }
      if (payload.action === 'activate') {
        const conversation = sessionMap.get(String(payload.conversation_id || ''))
        if (!conversation) return route.fulfill({ status: 404, json: { error: '会话不存在' } })
        activeConversationIds.set(boardId, conversation.conversationId)
        savedConversations.set(boardId, conversation)
        return route.fulfill({ json: { ok: true, conversation_id: conversation.conversationId } })
      }
      const previous = savedConversations.get(boardId)
      const target = payload.conversation?.conversationId
        ? sessionMap.get(payload.conversation.conversationId) || previous
        : previous
      const conversation = {
        ...payload.conversation,
        boardId,
        revision: Number(target?.revision || 0) + 1,
        ...(dropPendingWorkflow ? { pendingWorkflow: null } : {}),
      }
      sessionMap.set(conversation.conversationId, conversation)
      activeConversationIds.set(boardId, conversation.conversationId)
      savedConversations.set(boardId, conversation)
      return route.fulfill({ json: conversation })
    }
    if (url.pathname === '/api/skills/reference') {
      const referencePath = url.searchParams.get('path') || ''
      if (url.searchParams.get('skill_id') !== 'natural-aesthetic-product-photography'
        || !referenceFiles.includes(referencePath)) {
        return route.fulfill({ status: 404, json: { error: '隔离参考资料不存在' } })
      }
      skillReferenceRequests.push({
        skillId: url.searchParams.get('skill_id') || '',
        path: referencePath,
      })
      return route.fulfill({ json: {
        skill_id: url.searchParams.get('skill_id') || '',
        path: referencePath,
        bytes: fs.statSync(path.resolve(__dirname, '../host-sources/app/skill-packages/natural-aesthetic-product-photography', referencePath)).size,
        content: fs.readFileSync(path.resolve(__dirname, '../host-sources/app/skill-packages/natural-aesthetic-product-photography', referencePath), 'utf8'),
      } })
    }
    if (url.pathname === '/api/image-jobs' && request.method() === 'POST') {
      paidJobRequests.push(request.postDataJSON())
      return route.fulfill({ status: 400, json: { error: '隔离安全回归不执行图片生成' } })
    }
    if (url.pathname === '/api/image-models') return route.fulfill({ json: {
      models: [naturalPhotoModel], candidates: [naturalPhotoModel],
      families: { [naturalPhotoModel.id]: naturalPhotoModel.family },
      platforms: { [naturalPhotoModel.id]: naturalPhotoModel.platform },
      resolutions: { [naturalPhotoModel.id]: naturalPhotoModel.resolutions },
      defaultModel: naturalPhotoModel.id, revision: 1, instanceId: 'qa-natural-photo-models',
    } })
    if (url.pathname === '/api/video-models') return route.fulfill({ json: { models: [] } })
    if (url.pathname === '/api/canvas-agent/skills') return route.fulfill({ json: {
      configured: true,
      agentSettings: { configured: true, candidateCount: 1, unavailableCount: 0 },
      skills: [
        { id: 'qa-skill', label: '隔离验收 Skill', description: '本地测试流程',
          ...(mockGenericWizard ? { metadata: { canvas_agent_wizard: JSON.stringify(genericWizard) } } : {}),
        },
        { id: 'fashion-ecommerce-ai-model-video', label: '服装电商 · AI 模特动态展示', description: '隔离节点幂等流程' },
        {
          id: 'natural-aesthetic-product-photography',
          label: '自然美学产品摄影',
          description: '隔离产品摄影策划流程',
          metadata: { canvas_agent_wizard: naturalPhotoWizard },
          required_selection: 'image',
          execution: {
            mode: 'guided',
            exposure: 'manual',
            limits: { maxRounds: 16, maxToolCalls: 12 },
            stages: [
              {
                id: 'planning',
                whenAny: ['产品摄影', '摄影策划', '自然美学'],
                mustRead: ['references/case-library.md'],
                tools: ['activate_canvas_skill', 'read_skill_reference', 'request_design_brief'],
                toolsDeclared: true,
              },
              {
                id: 'confirmed-execution',
                whenAny: ['用户已确认策划'],
                tools: ['activate_canvas_skill', 'read_skill_reference',
                  ...(denyNaturalNodeCreation ? [] : ['create_image_node'])],
                toolsDeclared: true,
              },
            ],
          },
          references: referenceFiles.map(referencePath => ({
            path: referencePath,
            bytes: fs.statSync(path.resolve(__dirname, '../host-sources/app/skill-packages/natural-aesthetic-product-photography', referencePath)).size,
          })),
        },
      ],
      pickerSkills: [
        { id: 'qa-skill', label: '隔离验收 Skill', description: '本地测试流程', scope: 'personal' },
        { id: 'fashion-ecommerce-ai-model-video', label: '服装电商 · AI 模特动态展示', description: '隔离节点幂等流程', scope: 'public' },
        { id: 'natural-aesthetic-product-photography', label: '自然美学产品摄影', description: '隔离产品摄影策划流程', scope: 'personal' },
      ],
    } })
    if (url.pathname === '/api/canvas-agent/turn' && mockGenericWizard) {
      const payload = request.postDataJSON()
      if (payload.tool_outputs) return route.fulfill({ json: { response_id: 'generic-done', message: '节点操作已完成。', tool_calls: [] } })
      const confirmed = String(payload.prompt).includes('用户已通过方案确认卡')
      return route.fulfill({ json: {
        response_id: 'generic-proposal',
        tool_calls: confirmed ? [{
          call_id: 'generic-create', name: 'create_image_node',
          arguments: { title: '通用向导产物', prompt: '通用向导确认的创作方案', reference_node_ids: payload.canvas.selected_node_ids, model: naturalPhotoModel.id, size: '1:1', resolution: '1' },
        }] : [{
          call_id: 'generic-brief', name: 'request_design_brief',
          arguments: { workflow: 'skill', source_node_ids: payload.canvas.selected_node_ids, image_prompt: '根据用户确认的要求创作产品广告画面。', known_context: '用户填写了创作要求，使用当前素材。', summary: '根据通用表单内容创建一个可编辑节点。',
            questions: [{ id: 'audience', label: '受众建议', kind: 'text', recommended: '城市通勤人群', required: false, options: [] }] },
        }, {
          call_id: 'generic-premature', name: 'create_image_node',
          arguments: { title: '通用流程不得提前创建', prompt: '未确认内容', reference_node_ids: [] },
        }],
      } })
    }
    if (url.pathname === '/api/canvas-agent/turn' && mockPlainReply) {
      plainRequests.push(request.postDataJSON())
      if (mockSlowPlainReply) await new Promise(resolve => setTimeout(resolve, 1000))
      return route.fulfill({ json: { response_id: 'mock-plain-reply', message: '隔离回复已收到请求。', tool_calls: [] } })
    }
    if (url.pathname === '/api/canvas-agent/turn' && (mockAgentTurn || mockLongAgentRun || mockNoProgressRun || mockNaturalPhotoRun)) {
      const payload = request.postDataJSON()
      agentRequests.push(payload)
      if (mockNaturalPhotoRun) {
        naturalPhotoRequests.push(payload)
        if (!payload.tool_outputs && String(payload.prompt || '').includes('用户已确认策划')) {
          if (failNaturalConfirmOnce) {
            failNaturalConfirmOnce = false
            return route.abort('failed')
          }
          return route.fulfill({ json: {
            response_id: 'mock-natural-photo-create',
            message: '',
            tool_calls: [{
              call_id: 'mock-natural-photo-confirmed-create',
              name: 'create_image_node',
              arguments: {
                title: '不应覆盖的标题',
                prompt: '不应覆盖的模型侧提示词',
                reference_node_ids: payload.canvas?.selected_node_ids || [],
                ...naturalPhotoScenario.parameters,
                x: 1234,
                y: 4321,
              },
            }],
          } })
        }
        const isRevision = /这些回答是新的约束|用户接受了卡片内|请依据以下原方案/.test(String(payload.prompt || ''))
        const completedPaths = new Set((Array.isArray(payload.tool_outputs) ? payload.tool_outputs : [])
          .map(item => String(item?.output?.path || '')))
        const hasCaseRead = [...completedPaths].some(referencePath => /^references\/cases\/NA-\d{2}\.md$/.test(referencePath))
        if (isRevision && !completedPaths.has('references/case-library.md')) {
          return route.fulfill({ json: {
            response_id: 'mock-natural-photo-cached-index',
            message: '',
            tool_calls: [{
              call_id: 'mock-natural-photo-revision-read-index',
              name: 'read_skill_reference',
              arguments: { skill_id: 'natural-aesthetic-product-photography', path: 'references/case-library.md' },
            }],
          } })
        }
        if (!isRevision && !payload.tool_outputs) {
          naturalPhotoSourceId = payload.canvas?.selected_node_ids?.[0] || ''
          return route.fulfill({ json: {
            response_id: 'mock-natural-photo-index',
            message: '',
            tool_calls: [
              {
                call_id: 'mock-natural-photo-activate',
                name: 'activate_canvas_skill',
                arguments: { skill_id: 'natural-aesthetic-product-photography', reason: '用户已选择产品摄影 Skill' },
              },
              {
                call_id: 'mock-natural-photo-read-index',
                name: 'read_skill_reference',
                arguments: { skill_id: 'natural-aesthetic-product-photography', path: 'references/case-library.md' },
              },
            ],
          } })
        }
        if (!isRevision && !hasCaseRead) {
          const casePaths = naturalPhotoScenario === naturalPhotoScenarios.phoneCase
            ? ['references/cases/NA-05.md', 'references/cases/NA-06.md', 'references/cases/NA-01.md']
            : ['references/cases/NA-04.md', 'references/cases/NA-06.md', 'references/cases/NA-07.md']
          return route.fulfill({ json: {
            response_id: 'mock-natural-photo-candidates',
            message: '',
            tool_calls: casePaths.map((referencePath, index) => ({
              call_id: `mock-natural-photo-read-case-${index + 1}`,
              name: 'read_skill_reference',
              arguments: { skill_id: 'natural-aesthetic-product-photography', path: referencePath },
            })),
          } })
        }
        const proposal = isRevision ? naturalPhotoScenario : naturalPhotoScenario.preview
        naturalPhotoSourceId ||= payload.canvas?.selected_node_ids?.[0] || ''
        return route.fulfill({ json: {
          response_id: 'mock-natural-photo-plan',
          message: '',
          tool_calls: [
            {
              call_id: 'mock-natural-photo-brief',
              name: 'request_design_brief',
              arguments: {
                workflow: 'natural-aesthetic-product-photography',
                poster_type: null,
                source_node_ids: payload.canvas?.selected_node_ids || [],
                image_prompt: proposal.image_prompt,
                known_context: isRevision
                  ? naturalPhotoScenario.known_context
                  : `方向尚待选择，当前提示词为一句预览。${proposal.summary}`,
                questions: isRevision ? [] : [{
                  id: 'creative_direction', label: '请选择摄影方向', kind: 'single',
                  options: naturalPhotoScenario.choices, required: true,
                  recommended: naturalPhotoScenario.recommended || naturalPhotoScenario.choices[0],
                }],
                summary: proposal.summary,
              },
            },
            {
              call_id: 'mock-natural-photo-premature-create',
              name: 'create_image_node',
              arguments: {
                title: '过早创建',
                prompt: '不得使用的未确认提示词',
                reference_node_ids: [naturalPhotoSourceId],
                x: 1000,
                y: 100,
              },
            },
          ],
        } })
      }
      if (mockNoProgressRun) {
        const attempt = Number(payload.step || 0) + 1
        return route.fulfill({ json: {
          response_id: `mock-no-progress-${attempt}`,
          message: '',
          tool_calls: [0, 1].map(index => ({
            call_id: `mock-no-progress-call-${attempt}-${index}`,
            name: 'connect_nodes',
            arguments: { from_id: 'missing-isolated-source', to_id: 'missing-isolated-target', to_port: 'input' },
          })),
        } })
      }
      if (mockLongAgentRun) {
        const completed = (payload.canvas?.nodes || []).filter(node => /^长任务阶段 \d+$/.test(String(node.title || node.nodeTitle || node.textName || ''))).length
        return route.fulfill({ json: payload.tool_outputs && completed >= 28
          ? { response_id: 'mock-long-finished', message: '28 个隔离阶段均已完成。', tool_calls: [] }
          : {
              response_id: `mock-long-${completed}`,
              message: '',
              tool_calls: [{
                call_id: `mock-long-call-${completed}`,
                name: 'create_text_node',
                arguments: { title: `长任务阶段 ${completed + 1}`, content: `隔离阶段 ${completed + 1} 已写入。` },
              }],
            } })
      }
      return route.fulfill({ json: payload.tool_outputs
        ? { response_id: 'mock-finished', message: '操作结果已收到。', tool_calls: [] }
        : payload.prompt.includes('改名')
          ? { response_id: 'mock-update', message: '', tool_calls: [{ call_id: 'mock-update-call', name: 'update_node', arguments: { node_id: payload.canvas.selected_node_ids[0], changes: { title: '产品广告图', prompt: '白色背景的商业产品摄影' } } }] }
          : { response_id: 'mock-create', message: '', tool_calls: [{ call_id: 'mock-create-call', name: 'create_image_node', arguments: { prompt: '商业产品摄影，保留产品外观，使用柔和侧光与真实接触阴影。', reference_node_ids: [], x: 1800, y: 100 } }] } })
    }
    if (url.pathname === '/api/canvas-agent/turn' && mockAgentError) {
      return route.fulfill({
        status: 200,
        contentType: 'application/x-ndjson; charset=utf-8',
        body: `${JSON.stringify({ type: 'error', error: '模型请求未完成', detail: 'HTTP 400：模型不支持当前工具参数', code: 'INVALID_AGENT_RESPONSE', recoverable: false })}\n`,
      })
    }
    if (url.pathname === '/api/canvas-agent/turn' && mockAgentTimeout) {
      timeoutAgentRequests.push(request.postDataJSON())
      return route.fulfill({
        status: 200,
        contentType: 'application/x-ndjson; charset=utf-8',
        body: `${JSON.stringify({
          type: 'error',
          error: '模型请求失败',
          detail: '等待模型生成超时。',
          code: 'UPSTREAM_TIMEOUT',
          category: 'timeout',
          stage: 'total',
          recoverable: true,
        })}\n`,
      })
    }
    if (url.pathname.endsWith('/operations') && request.method() === 'POST') {
      if (failSaves) return route.fulfill({ status: 503, json: { error: '模拟保存失败' } })
      const { operations } = request.postDataJSON()
      for (const op of operations) {
        const collection = op.type.startsWith('node.') ? board.nodes : board.connections
        if (op.type.endsWith('.delete')) collection.delete(op.entityId)
        else if (op.type.endsWith('.upsert')) collection.set(op.entityId, op.after)
      }
      board.revision += 1
      return route.fulfill({ json: { boardRevision: board.revision, results: operations.map(op => ({ operationId: op.operationId, status: 'applied', entityRevision: board.revision })) } })
    }
    return route.fulfill({ json: { authenticated: false, boards: [], projects: [], resources: [], records: [], models: [], providers: [], preferences: {}, settings: {} } })
  })
  if (process.env.AGENT_SOURCE === '1') {
    await page.route('**/script.js*', route => route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(__dirname, 'design-sources/script-before-save-bridge.js'), 'utf8') }))
    await page.route('**/canvas-agent-core.js*', route => route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(__dirname, '../host-sources/app/canvas-agent-core.js'), 'utf8') }))
    await page.route('**/canvas-agent-capabilities.js*', route => route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(__dirname, '../host-sources/app/canvas-agent-capabilities.js'), 'utf8') }))
    await page.route('**/canvas-agent-conversation.js*', route => route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(__dirname, '../host-sources/app/canvas-agent-conversation.js'), 'utf8') }))
    await page.route('**/canvas-agent-skill-contract.js*', route => route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(__dirname, '../host-sources/app/canvas-agent-skill-contract.js'), 'utf8') }))
    await page.route('**/canvas-agent-ui.js*', route => route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(__dirname, '../host-sources/app/canvas-agent-ui.js'), 'utf8') }))
    await page.route('**/canvas-agent.css*', route => route.fulfill({ contentType: 'text/css', body: fs.readFileSync(path.join(__dirname, '../host-sources/app/canvas-agent.css'), 'utf8') }))
  }
  try {
    await page.goto('http://127.0.0.1:33200/', { waitUntil: 'domcontentloaded' })
    const result = await page.evaluate(async () => {
      await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-agent-tool-adapters'])
      const prompts = [
        '在当前画布中新建一个图片生成节点。',
        '把当前选中的图片生成节点改名为产品广告图，并将提示词修改为白色背景的商业产品摄影。',
        '复制当前选中的图片节点，并将副本放到原节点右侧。',
        '创建一个图片生成节点，并把当前选中的图片连接到它的参考输入。',
        '创建十个图片生成节点，写入不同的中文摄影提示词。只完成策划、节点创建、命名、素材引用、布局与保存，不执行任何图片生成，不调用付费生图。',
        '创建图片生成节点，禁止自动执行图片生成。',
        '给选中的图片创建方案节点，暂不运行付费生图。',
        '只搭建画布，禁止调用图像生成接口。',
        '创建图片生成节点，无需实际出图。',
      ]
      for (const prompt of prompts) {
        if (CanvasAgentCore.getDirectImageGenerationAllowance(prompt) !== 0 || CanvasAgentCore.getSelectedImageEditGenerationAllowance(prompt, true) !== 0) {
          throw new Error(`基础画布操作误触发生图: ${prompt}`)
        }
      }
      if (CanvasAgentCore.getDirectImageGenerationAllowance('生成一张白色背景的商业产品图片') !== 1) throw new Error('明确生图意图丢失')
      if (CanvasAgentCore.getSelectedImageEditGenerationAllowance('把选中的图片放到森林里', true) !== 1) throw new Error('明确图片编辑意图丢失')
      if (CanvasAgentCore.getDirectImageGenerationAllowance('创建图片生成节点，然后生成一张图片') !== 1) throw new Error('创建节点并明确生图的意图丢失')
      await loadCanvasBoards()
      canvasState.activeBoardId = 'qa-agent-isolated'
      canvasState.activeBoardPersisted = true
      const surface = document.createElement('div')
      surface.id = 'neonEngineSurface'
      surface.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column'
      document.body.append(surface)
      const view = document.querySelector('#canvasView')
      surface.append(view)
      view.hidden = false
      view.classList.add('active')
      document.querySelector('#canvasEditorScreen').hidden = false
      document.body.classList.add('canvas-surface-open')
      showCanvasEditor()
      const broker = CanvasAgentBroker.createBroker({ getCurrentBoardId: () => canvasState.activeBoardId, adapters: CanvasAgentToolAdapters.create({ canvasApi: CanvasAgentCanvasApi }) })
      const scope = broker.beginRun({ boardId: canvasState.activeBoardId, runId: 'qa' })
      let seq = 0
      const call = (name, args) => broker.execute(scope, { name, call_id: String(++seq), arguments: args })
      const create = await call('create_image_node', { prompt: '', reference_node_ids: [], x: 100, y: 100 })
      const update = await call('update_node', { node_id: create.node_id, changes: { title: '产品广告图', prompt: '白色背景的商业产品摄影' } })
      const node = ensureCanvasNodeMounted(create.node_id)
      const updated = { title: node?.dataset.nodeTitle, prompt: node?.querySelector('.canvas-node-prompt')?.value }
      const duplicate = await call('duplicate_nodes', { node_ids: [create.node_id], offset_x: 500, offset_y: 0 })
      const copy = ensureCanvasNodeMounted(duplicate.node_ids?.[0])
      const original = { x: Number(node?.dataset.x), y: Number(node?.dataset.y) }
      const copied = { x: Number(copy?.dataset.x), y: Number(copy?.dataset.y) }
      const move = await call('move_nodes', { node_ids: duplicate.node_ids, delta_x: 20, delta_y: 0 })
      const invalid = await call('connect_nodes', { from_id: create.node_id, to_id: duplicate.node_ids[0], to_port: 'input' })
      const source = addCanvasImage('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/vX8AAAAASUVORK5CYII=', '测试素材', { x: 0, y: 0 })
      source.dataset.boardId = canvasState.activeBoardId
      const sourceId = source.dataset.id
      const withReference = await call('create_image_node', { title: '创意一 · 材质特写', prompt: '不同的完整中文提示词', reference_node_ids: [sourceId], x: 900, y: 100 })
      const connected = canvasState.connections.some(item => item.from === sourceId && item.to === withReference.node_id && (item.toPort || 'input') === 'input')
      const disconnected = await call('disconnect_nodes', { from_id: sourceId, to_id: withReference.node_id })
      const absentConnection = await call('disconnect_nodes', { from_id: sourceId, to_id: withReference.node_id })
      const reconnected = await call('connect_nodes', { from_id: sourceId, to_id: withReference.node_id, to_port: 'input' })
      const partial = await call('create_image_node', { prompt: '', reference_node_ids: [create.node_id], x: 1400, y: 100 })
      const materialCopy = await call('duplicate_nodes', { node_ids: [sourceId], offset_x: 500, offset_y: 0 })
      const unsupportedUpdate = await call('update_node', { node_id: sourceId, changes: { duration: 8 } })
      const xOnly = await call('update_node', { node_id: materialCopy.node_ids[0], changes: { x: 610 } })
      const material = serializeCanvasNode(ensureCanvasNodeMounted(sourceId))
      const copiedMaterial = serializeCanvasNode(ensureCanvasNodeMounted(materialCopy.node_ids[0]))
      const otherBoard = await broker.execute(scope, { name: 'move_nodes', call_id: 'wrong-board', board_id: 'other-board', arguments: { node_ids: [sourceId], delta_x: 10, delta_y: 0 } })
      await saveCanvasBoardNow()
      return { create, update, updated, duplicate, original, copied, move, invalid, sourceId, withReference, connected, disconnected, absentConnection, reconnected, partial, materialCopy, unsupportedUpdate, xOnly, copyX: copiedMaterial.x, originalImage: material.imageSrc, copiedImage: copiedMaterial.imageSrc, otherBoard, pending: canvasPagedStore.getPendingOperations().length }
    })
    console.log(JSON.stringify({ result, persistedNodeCount: board.nodes.size, persistedConnections: [...board.connections.values()], errors }, null, 2))
    assert.equal(result.create.ok, true, 'create')
    assert.equal(result.create.persisted, true, 'creation reports acknowledged persistence')
    assert.equal(result.withReference.title, '创意一 · 材质特写', 'creation reports actual title')
    assert.equal(result.withReference.prompt, '不同的完整中文提示词', 'creation reports actual prompt')
    assert.deepEqual(result.withReference.reference_node_ids, [result.sourceId], 'creation reports actual connected references')
    assert.ok(result.withReference.width > 0 && result.withReference.height > 0, 'creation reports measured node bounds')
    assert.equal(result.updated.title, '产品广告图', 'rename')
    assert.equal(result.updated.prompt, '白色背景的商业产品摄影', 'prompt')
    assert.equal(result.copied.x, result.original.x + 500, 'duplicate x')
    assert.equal(result.copied.y, result.original.y, 'duplicate y')
    assert.equal(result.invalid.ok, true, 'empty image generators support a saved upstream dependency')
    assert.equal(result.withReference.ok, true, 'create with reference')
    assert.equal(result.connected, true, 'reference connected')
    assert.equal(result.disconnected.ok, true, 'disconnect')
    assert.equal(result.absentConnection.ok, false, 'missing connection is reported')
    assert.equal(result.reconnected.ok, true, 'reconnect')
    assert.equal(result.materialCopy.ok, true, 'copy material')
    assert.equal(result.unsupportedUpdate.ok, false, 'unsupported parameter rejected')
    assert.equal(result.xOnly.ok, true, 'single coordinate update')
    assert.equal(result.copyX, 610, 'single coordinate applied')
    assert.ok(result.originalImage, 'original material preserved')
    assert.equal(result.copiedImage, result.originalImage, 'copy retains material')
    assert.equal(result.otherBoard.code, 'scope_mismatch', 'cross-board call rejected')
    assert.equal(result.partial.ok, true, 'creation accepts an ungenerated upstream reference')
    assert.deepEqual(result.partial.pending_reference_node_ids, [result.create.node_id])
    assert.ok(board.nodes.has(result.partial.node_id), 'waiting generator node persisted')
    assert.equal(result.pending, 0, 'all operations acknowledged')
    assert.ok(board.nodes.has(result.create.node_id), 'created node persisted')
    assert.ok(board.nodes.has(result.duplicate.node_ids[0]), 'copy persisted')
    assert.equal(board.nodes.get(result.create.node_id).nodeTitle, '产品广告图', 'renamed title persisted')
    assert.equal(board.nodes.get(result.withReference.node_id).nodeTitle, '创意一 · 材质特写', 'creation title persists without another rename call')
    assert.equal(board.nodes.get(result.duplicate.node_ids[0]).x, result.original.x + 520, 'move persisted')
    assert.ok([...board.connections.values()].some(item => item.from === result.sourceId && item.to === result.withReference.node_id && item.toPort === 'input'), 'reference persisted')
    const saved = { id: 'qa-agent-isolated', title: '隔离测试', nodes: [...board.nodes.values()], connections: [...board.connections.values()], viewport: { x: 80, y: 60, scale: 1 } }
    await page.reload({ waitUntil: 'domcontentloaded' })
    const restored = await page.evaluate(async savedBoard => {
      await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-agent-tool-adapters'])
      const surface = document.createElement('div')
      surface.id = 'neonEngineSurface'
      document.body.append(surface)
      surface.append(document.querySelector('#canvasView'))
      const opened = await openCanvasBoardFromHistory(savedBoard)
      return { opened, snapshot: serializeCanvasBoard() }
    }, saved)
    assert.equal(restored.opened, true, 'reopen saved board')
    assert.equal(restored.snapshot.nodes.find(node => node.id === result.create.node_id)?.nodeTitle, '产品广告图', 'title restored')
    assert.equal(restored.snapshot.nodes.find(node => node.id === result.duplicate.node_ids[0])?.x, result.original.x + 520, 'position restored')
    assert.ok(restored.snapshot.connections.some(item => item.from === result.sourceId && item.to === result.withReference.node_id), 'connection restored')
    if (process.env.AGENT_WIZARD_ONLY !== '1') {
    mockAgentTurn = true
    await page.evaluate(async () => { await AiOsModuleLoader.ensure(['canvas-agent-ui']) })
    await page.waitForSelector('#canvasAgentPrompt', { state: 'attached' })
    await page.evaluate(async () => { await CanvasAgentUi.useSkill('qa-skill') })
    assert.match(await page.locator('#canvasAgentContext').innerText(), /隔离验收 Skill/, 'square selection loads the registered Skill into Agent')
    assert.equal(agentRequests.length, 0, 'selecting a Skill does not start model or tools')
    mockPlainReply = true
    await page.evaluate(() => {
      document.querySelector('[data-agent-skill="qa-skill"]').click()
      clearCanvasSelection()
      document.querySelectorAll('#canvasAgentContext [data-remove-agent-context]').forEach(button => button.click())
    })
    await page.locator('#canvasAgentPrompt').fill('你好，请回复一句普通文字。')
    await page.locator('#canvasAgentSend').click()
    await page.waitForFunction(() => !document.querySelector('#canvasAgentSend').disabled)
    assert.equal(plainRequests.length, 1, 'ordinary text submits without a Skill or selected material')
    assert.equal(plainRequests[0].skill_id || '', '', 'ordinary conversation has no forced Skill')
    assert.equal(plainRequests[0].vision_images.length, 0, 'ordinary text does not fabricate visual input')
    await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 64
      canvas.height = 64
      const context = canvas.getContext('2d')
      context.fillStyle = '#74c9ad'
      context.fillRect(0, 0, 64, 64)
      context.fillStyle = '#247b68'
      context.fillRect(16, 16, 32, 32)
      const node = addCanvasImage(canvas.toDataURL('image/png'), '普通图片引用.png', { x: 160, y: 120 })
      node.dataset.boardId = canvasState.activeBoardId
      selectCanvasNode(node)
    })
    await page.locator('#canvasAgentPrompt').fill('这张图片里是什么产品？')
    await page.locator('#canvasAgentSend').click()
    await page.waitForFunction(() => !document.querySelector('#canvasAgentSend').disabled)
    assert.equal(plainRequests.length, 2, 'a subsequent image question submits after the previous reply')
    assert.match(plainRequests[1].vision_images[0], /^data:image\/jpeg;base64,/, 'ordinary image questions transmit actual image bytes')
    assert.match(await page.locator('#canvasAgentMessages').innerText(), /隔离回复已收到请求/, 'the reply is displayed in the Agent UI')
    mockPlainReply = false
    await page.evaluate(async () => { await CanvasAgentUi.useSkill('qa-skill') })
    await page.locator('#canvasAgentToggle').click()
    await page.evaluate(() => {
      document.querySelector('#canvasAgentPrompt').value = '在当前画布中新建一个图片生成节点。'
      document.querySelector('#canvasAgentForm').requestSubmit()
    })
    await page.waitForFunction(() => document.querySelector('#canvasAgentStatus')?.textContent.includes('任务完成'), null, { timeout: 10000 })
    assert.equal(agentRequests.length, 2, 'Agent sends tool result in a follow-up turn')
    assert.equal(agentRequests[1].tool_outputs[0].call_id, 'mock-create-call')
    assert.equal(agentRequests[1].tool_outputs[0].output.ok, true, 'Agent receives successful tool result')
    assert.ok(board.nodes.has(agentRequests[1].tool_outputs[0].output.node_id), 'Agent tool result refers to persisted node')
    const selectedNodeId = agentRequests[1].tool_outputs[0].output.node_id
    agentRequests.length = 0
    const updateResponse = page.waitForResponse(response => response.url().includes('/api/canvas-agent/turn') && Boolean(response.request().postDataJSON().tool_outputs))
    await page.evaluate(nodeId => {
      selectCanvasNode(ensureCanvasNodeMounted(nodeId))
      return new Promise(resolve => setTimeout(resolve, 0)).then(() => {
      document.querySelector('#canvasAgentPrompt').value = '把当前选中的图片生成节点改名为产品广告图，并将提示词修改为白色背景的商业产品摄影。'
      document.querySelector('#canvasAgentForm').requestSubmit()
      })
    }, selectedNodeId)
    await updateResponse
    assert.deepEqual(agentRequests[0].canvas.selected_node_ids, [selectedNodeId], 'selected node reaches Agent context')
    assert.equal(agentRequests[1].tool_outputs[0].output.ok, true, 'selected node update succeeds')
    assert.equal(board.nodes.get(selectedNodeId).nodeTitle, '产品广告图', 'selected node update is persisted')
    await page.locator('#canvasAgentToggle').click()
    await page.locator('#canvasAgentPrompt').fill('@产品')
    await page.waitForFunction(
      () => document.querySelector('#canvasAgentMentions [data-agent-mention-id]'),
      null,
      { timeout: 5000 },
    )
    const mentionText = await page.locator('#canvasAgentMentions').innerText()
    assert.match(mentionText, /产品广告图/, 'node mention searches serialized nodes outside the mounted DOM')
    await page.locator('#canvasAgentMentions [data-agent-mention-id]').filter({ hasText: '产品广告图' }).first().click()
    const mentionedPrompt = await page.locator('#canvasAgentPrompt').evaluate(element => element.value)
    const mentionedContext = await page.locator('#canvasAgentContext').textContent()
    assert.match(mentionedPrompt || '', /@产品广告图/, 'node mention uses the persisted node name')
    assert.match(mentionedContext || '', /产品广告图/, 'selected node enters the Agent context by reference')
    await page.locator('#canvasAgentPrompt').fill('')
    agentRequests.length = 0
    await page.evaluate(() => {
      document.querySelector('#canvasAgentPrompt').value = '创建图片生成节点，写入完整中文摄影提示词，合理排列并保存。不执行任何图片生成，不调用付费生图。'
      document.querySelector('#canvasAgentForm').requestSubmit()
    })
    await page.waitForFunction(() => document.querySelector('#canvasAgentStatus')?.textContent.includes('任务完成'), null, { timeout: 10000 })
    assert.equal(agentRequests.length, 2, 'node-only task completes its model/tool result loop')
    assert.equal(paidJobRequests.length, 0, 'node-only task cannot submit an image job')
    assert.doesNotMatch(await page.locator('#canvasAgentMessages').innerText(), /自动补一次生成/, 'node-only task cannot enter generation compensation')
    mockAgentTurn = false
    mockLongAgentRun = true
    agentRequests.length = 0
    await page.evaluate(() => {
      document.querySelector('#canvasAgentPrompt').value = '隔离回归：依次创建28个不同标题的文字阶段节点，连续完成，不执行任何生成。'
      document.querySelector('#canvasAgentForm').requestSubmit()
    })
    await page.waitForFunction(() => document.querySelector('#canvasAgentStatus')?.textContent.includes('任务完成'), null, { timeout: 45000 })
    const longStageNodes = [...board.nodes.values()].filter(node => /^长任务阶段 \d+$/.test(String(node.nodeTitle || node.textName || '')))
    assert.equal(longStageNodes.length, 28, 'the same task resumes and completes the remaining four stages')
    assert.equal(new Set(longStageNodes.map(node => node.nodeTitle || node.textName)).size, 28, 'continued rounds do not duplicate prior stage nodes')
    assert.equal(agentRequests.length, 29, '28 tool responses are followed by one final completion response')
    assert.ok(agentRequests.every(item => item.skill_id === 'qa-skill'), 'the selected Skill is inherited on every continued request')
    assert.equal(new Set(agentRequests.map(item => item.run_id)).size, 1, 'automatic segments retain one logical task id')
    for (let index = 1; index < agentRequests.length; index += 1) {
      const createdId = agentRequests[index].tool_outputs?.[0]?.output?.node_id
      assert.ok(createdId, `round ${index} includes its completed tool result`)
      assert.ok(agentRequests[index].canvas?.nodes?.some(node => node.id === createdId), `round ${index} sees the latest persisted canvas node`)
    }
    const lastFirstSegmentId = longStageNodes.find(node => (node.nodeTitle || node.textName) === '长任务阶段 24').id
    assert.equal(agentRequests[24].tool_outputs[0].output.node_id, lastFirstSegmentId, 'automatic continuation inherits the pending last tool output')
    assert.ok(agentRequests[24].canvas.nodes.some(node => node.id === lastFirstSegmentId), 'automatic continuation sees the latest saved canvas before creating more nodes')
    assert.equal(paidJobRequests.length, 0, 'continuation cannot trigger paid generation')
    mockLongAgentRun = false
    mockNoProgressRun = true
    agentRequests.length = 0
    await page.evaluate(() => {
      document.querySelector('#canvasAgentPrompt').value = '隔离回归：验证相同失败操作会暂停而不无限重试。'
      document.querySelector('#canvasAgentForm').requestSubmit()
    })
    await page.waitForFunction(() => /任务暂停|工具失败/.test(document.querySelector('#canvasAgentStatus')?.textContent || ''), null, { timeout: 15000 })
    assert.match(await page.locator('#canvasAgentStatus').innerText(), /任务暂停/, 'repeated identical failures are presented as a pause, not completion')
    assert.equal(agentRequests.length, 3, 'three identical failures pause before a fourth provider request')
    assert.ok(await page.locator('#canvasAgentMessages [data-agent-continue]').count(), 'paused task offers explicit user-controlled continuation')
    assert.equal(paidJobRequests.length, 0, 'failed-call protection never submits paid generation')
    mockNoProgressRun = false
    const fashionDedupe = await page.evaluate(async () => {
      await CanvasAgentUi.useSkill('fashion-ecommerce-ai-model-video');
      const broker = CanvasAgentBroker.createBroker({
        getCurrentBoardId: () => canvasState.activeBoardId,
        adapters: CanvasAgentToolAdapters.create({ canvasApi: CanvasAgentCanvasApi }),
      });
      const scope = broker.beginRun({ boardId: canvasState.activeBoardId, runId: 'fashion-dedupe' });
      const args = { title: '视频生成提示词', content: '固定机位，白色摄影棚，模特自然转身后回到起点，服装细节保持一致。' };
      const first = await broker.execute(scope, { name: 'create_text_node', call_id: 'fashion-text-1', arguments: args });
      const second = await broker.execute(scope, { name: 'create_text_node', call_id: 'fashion-text-2', arguments: args });
      const matching = [...document.querySelectorAll('#canvasPlane .canvas-node-text')]
        .filter(node => node.dataset.agentCreatedRunId === 'fashion-dedupe'
          && node.querySelector('.canvas-text')?.textContent.includes('固定机位'));
      return { first, second, matching: matching.map(node => node.dataset.id) };
    });
    assert.equal(fashionDedupe.first.ok, true, 'fashion text node creation succeeds');
    assert.equal(fashionDedupe.second.reused, true, 'same fashion plan node is reused across different call ids');
    assert.deepEqual(fashionDedupe.matching, [fashionDedupe.first.node_id], 'semantic retry leaves one canvas entity');
    await page.evaluate(() => CanvasAgentUi.useSkill('qa-skill'));
    failSaves = true
    const failure = await page.evaluate(async nodeId => {
      const broker = CanvasAgentBroker.createBroker({ getCurrentBoardId: () => canvasState.activeBoardId, adapters: CanvasAgentToolAdapters.create({ canvasApi: CanvasAgentCanvasApi }) })
      const scope = broker.beginRun({ boardId: canvasState.activeBoardId, runId: 'save-failure' })
      const request = { name: 'duplicate_nodes', call_id: 'same-call', arguments: { node_ids: [nodeId], offset_x: 500, offset_y: 0 } }
      const first = await broker.execute(scope, request)
      const second = await broker.execute(scope, request)
      return { first, second, pending: canvasPagedStore.getPendingOperations().length }
    }, result.create.node_id)
    assert.equal(failure.first.ok, false, 'save failure reported')
    assert.equal(failure.first.code, 'canvas_save_failed')
    assert.equal(failure.first.persisted, false, 'failed save cannot claim persistence')
    assert.deepEqual(failure.second, failure.first, 'same call not repeated')
    assert.ok(failure.pending > 0, 'failed operation remains pending for recovery')
    mockAgentTurn = true
    agentRequests.length = 0
    await page.evaluate(() => {
      document.querySelector('#canvasAgentPrompt').value = '在当前画布中新建一个图片生成节点。'
      document.querySelector('#canvasAgentForm').requestSubmit()
    })
    await page.waitForFunction(() => document.querySelector('#canvasAgentMessages .canvas-agent-tool-step.is-error'), null, { timeout: 10000 })
    await page.waitForFunction(() => document.querySelector('#canvasAgentStatus')?.textContent.includes('工具失败'), null, { timeout: 10000 })
    assert.equal(agentRequests[1].tool_outputs[0].output.ok, false, 'Agent receives failed tool result')
    assert.equal(agentRequests[1].tool_outputs[0].output.code, 'canvas_save_failed', 'Agent receives save failure details')
    mockAgentTurn = false
    mockAgentError = true
    const errorResponsePromise = page.waitForResponse(
      response => response.url().includes('/api/canvas-agent/turn'),
      { timeout: 10000 },
    )
    await page.evaluate(() => {
      document.querySelector('#canvasAgentPrompt').value = '在当前画布新建一个文字节点。'
      document.querySelector('#canvasAgentForm').requestSubmit()
    })
    const errorResponse = await errorResponsePromise
    const errorBody = await errorResponse.text()
    await page.waitForTimeout(250)
    const agentErrorFrames = await Promise.all(page.frames().map(frame => frame.evaluate(() => ({
      url: location.href,
      status: document.querySelector('#canvasAgentStatus')?.textContent || '',
      messages: [...document.querySelectorAll('#canvasAgentMessages article')].map(item => item.textContent || ''),
    })).catch(() => null)))
    const agentError = JSON.stringify(agentErrorFrames)
    console.log(`simulatedAgentErrorResponse=${errorBody}`)
    console.log(`simulatedAgentErrorUi=${agentError.slice(-800)}`)
    assert.match(agentError, /模型不支持当前工具参数/, 'specific model error is shown to the user')
    assert.equal(await page.locator('#canvasAgentSend').isDisabled(), false,
      'model request failure releases the send control')
    const copiedReply = await page.evaluate(async () => {
      let copied = "";
      try {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: { writeText: async value => { copied = String(value); } },
        });
      } catch {
        // The DOM assertion below still verifies the copy affordance when the
        // browser exposes a non-configurable clipboard object.
      }
      const message = [...document.querySelectorAll("#canvasAgentMessages .canvas-agent-message.is-assistant")]
        .find(item => item.dataset.agentRawText);
      const button = message?.querySelector("[data-agent-copy-message]");
      button?.click();
      await new Promise(resolve => setTimeout(resolve, 20));
      return {
        copied,
        raw: message?.dataset.agentRawText || "",
        hasButton: Boolean(button),
      };
    });
    assert.equal(copiedReply.hasButton, true, 'assistant replies expose a copy action')
    assert.equal(copiedReply.copied, copiedReply.raw, 'copy action uses the reply plain text, not rendered HTML')
    mockAgentError = false
    const nodesBeforeTimeout = (await page.evaluate(() => serializeCanvasBoard())).nodes.length
    const requestsBeforeTimeout = timeoutAgentRequests.length
    mockAgentTimeout = true
    await page.evaluate(() => {
      document.querySelector('#canvasAgentPrompt').value = '请根据当前选择的 Skill 策划产品摄影方向。'
      document.querySelector('#canvasAgentForm').requestSubmit()
    })
    await page.waitForFunction(() => document.querySelector('#canvasAgentStatus')?.textContent.includes('模型响应超时，正在安全恢复 1/3'),
      null, { timeout: 10000 })
    await page.waitForFunction(() => document.querySelector('#canvasAgentStatus')?.textContent.includes('模型响应超时，方案和素材已保留'),
      null, { timeout: 30000 })
    const timeoutMessages = await page.locator('#canvasAgentMessages article').allTextContents()
    assert.ok(timeoutMessages.some(message => message.includes('模型请求超时（模型总响应期限）')),
      'model deadline timeout is identified by category and stage after safe retries')
    assert.equal((await page.evaluate(() => serializeCanvasBoard())).nodes.length, nodesBeforeTimeout,
      'model timeout retries do not create canvas nodes')
    assert.equal(timeoutAgentRequests.length, requestsBeforeTimeout + 4,
      'timeout recovery makes bounded retries and then leaves an explicit retry action')
    mockAgentTimeout = false
    await page.evaluate(() => {
      const originalFetch = window.fetch
      window.fetch = (...args) => {
        if (String(args[0]).includes('/api/canvas-agent/turn')) {
          window.fetch = originalFetch
          return Promise.reject(new DOMException('隔离请求中断', 'AbortError'))
        }
        return originalFetch(...args)
      }
      document.querySelector('#canvasAgentPrompt').value = '你好，请回复一句普通文字。'
      document.querySelector('#canvasAgentForm').requestSubmit()
    })
    await page.waitForFunction(() => !document.querySelector('#canvasAgentSend').disabled,
      null, { timeout: 5000 })
    assert.match(await page.locator('#canvasAgentStatus').innerText(), /中断|重新发送/,
      'an interrupted active request has an explicit terminal status')
    }
    await page.evaluate(async () => { await AiOsModuleLoader.ensure(['canvas-agent-ui']) })
    if (process.env.AGENT_WIZARD_ONLY === '1') {
      await page.locator('#canvasAgentToggle').click()
      assert.equal(await page.locator('#canvasAgentWelcome').isVisible(), true, 'an empty conversation shows its welcome state')
      await page.screenshot({ path: path.join(isolatedVisualDir, 'composer-empty.png') })
      assert.equal(await page.locator('.canvas-agent-welcome-suggestions button').count(), 3,
        'welcome suggestions are interactive choices')
      await page.locator('.canvas-agent-welcome-suggestions button').first().click()
      assert.equal(await page.locator('#canvasAgentPrompt').inputValue(), '为产品图策划商业摄影方向',
        'a welcome suggestion fills the composer without sending it')
      await page.locator('#canvasAgentPrompt').fill('')
      const panelGeometry = await page.evaluate(() => {
        const messages = document.querySelector('#canvasAgentMessages').getBoundingClientRect()
        const composer = document.querySelector('#canvasAgentForm').getBoundingClientRect()
        const panel = document.querySelector('#canvasAgentPanel').getBoundingClientRect()
        return { messagesBottom: messages.bottom, composerTop: composer.top, composerBottom: composer.bottom, panelBottom: panel.bottom }
      })
      assert.ok(panelGeometry.messagesBottom <= panelGeometry.composerTop
        && panelGeometry.panelBottom - panelGeometry.composerBottom <= 14,
      `the message list scrolls above the composer anchored to the Agent panel: ${JSON.stringify(panelGeometry)}`)
      await page.locator('#canvasAgentContextAdd').click()
      assert.equal(await page.locator('#canvasAgentAttachmentPopover').isVisible(), true,
        'the plus button opens real canvas and upload actions')
      assert.equal(await page.locator('#canvasAgentAttachmentPopover [data-agent-attachment]:visible').count(), 3)
      await page.locator('#canvasAgentAttachmentPopover [data-agent-attachment="canvas"]').click()
      assert.equal(await page.locator('#canvasEditorScreen').evaluate(element => element.classList.contains('is-agent-canvas-picking')),
        true, 'composer canvas selection enters the shared picker mode')
      await page.keyboard.press('Escape')
      assert.equal(await page.locator('#canvasEditorScreen').evaluate(element => element.classList.contains('is-agent-canvas-picking')),
        false, 'Escape exits composer canvas selection')
      const chooserPromise = page.waitForEvent('filechooser')
      await page.locator('#canvasAgentContextAdd').click()
      await page.locator('#canvasAgentAttachmentPopover [data-agent-attachment="upload"]').click()
      assert.equal((await chooserPromise).isMultiple(), true, 'the existing file input supports multiple images')
      await page.locator('#canvasAgentModeButton').click()
      assert.equal(await page.locator('#canvasAgentModePopover').isVisible(), true,
        'the mode selector opens a dedicated mode menu')
      await page.waitForSelector('#canvasAgentModePopover [data-agent-mode="image"]')
      assert.equal(await page.locator('#canvasAgentModePopover [data-agent-mode]').count(), 2,
        'only Agent and model-backed image generation modes are listed')
      await page.screenshot({ path: path.join(isolatedVisualDir, 'agent-mode-choices.png') })
      assert.equal(await page.locator('#canvasAgentModePopover [data-agent-mode="video"]').count(), 0,
        'video mode is omitted when the account has no available video model')
      assert.equal(await page.locator('#canvasAgentModePopover #canvasAgentSkills').count(), 0,
        'Skill entries never appear inside the mode menu')
      await page.locator('#canvasAgentModePopover [data-agent-mode="image"]').click()
      assert.equal(await page.locator('#canvasAgentModeButton').innerText(), '图片生成', 'image mode updates its entry label')
      assert.equal(savedConversations.get('qa-agent-isolated')?.generationSettings?.mode, 'image',
        'the selected generation mode is persisted to the active conversation')
      await page.locator('#canvasAgentModeButton').click()
      await page.locator('#canvasAgentModePopover [data-agent-mode="agent"]').click()
      await page.locator('#canvasAgentGenerationButton').click()
      await page.waitForFunction(() => document.querySelector('#canvasAgentGenerationModel')?.options.length > 0)
      await page.screenshot({ path: path.join(isolatedVisualDir, 'generation-settings-auto.png') })
      await page.locator('#canvasAgentGenerationAutomatic').uncheck()
      await page.waitForFunction(() => document.querySelector('#canvasAgentGenerationFields')?.hidden === false)
      await page.screenshot({ path: path.join(isolatedVisualDir, 'generation-settings-manual.png') })
      await page.locator('#canvasAgentGenerationAutomatic').check()
      await page.locator('#canvasAgentGenerationButton').click()
      await page.locator('#canvasAgentSkillBook').click()
      assert.equal(await page.locator('#canvasAgentSkillPopover').isVisible(), true,
        'the Skill selector opens its independent picker')
      assert.equal(await page.locator('#canvasAgentModePopover').isHidden(), true,
        'only one selector popover is open at a time')
      assert.equal(await page.locator('#canvasAgentSkillPopover [data-agent-mode]').count(), 0,
        'mode choices never appear inside the Skill picker')
      assert.equal(await page.locator('#canvasAgentUseAuto').isVisible(), true,
        'the Skill picker preserves automatic Skill routing')
      await page.locator('[data-skill-tab="mine"]').click()
      assert.deepEqual(await page.locator('#canvasAgentSkills [data-agent-skill]').evaluateAll(items =>
        items.map(item => item.dataset.agentSkill)), ['qa-skill', 'natural-aesthetic-product-photography'],
      'the personal tab filters Registry picker results without adding system Skills')
      await page.locator('[data-skill-tab="all"]').click()
      await page.locator('#canvasAgentSkills [data-agent-skill-detail="qa-skill"]').click()
      await page.locator('#canvasAgentSkillDetail [data-agent-skill-detail-favorite]').click()
      await page.keyboard.press('Escape')
      await page.locator('[data-skill-tab="favorites"]').click()
      assert.deepEqual(await page.locator('#canvasAgentSkills [data-agent-skill]').evaluateAll(items =>
        items.map(item => item.dataset.agentSkill)), ['qa-skill'],
      'the favorites tab contains only explicitly favorited Skills')
      await page.locator('[data-skill-tab="all"]').click()
      await page.locator('#canvasAgentUseAuto').click()
      assert.equal(await page.locator('#canvasAgentSettingsButton').count(), 0)

      mockAgentTurn = true
      mockPlainReply = true
      await page.evaluate(async () => {
        await CanvasAgentUi.useSkill('qa-skill')
      })
      const contextFixture = await page.evaluate(() => {
        const canvas = document.createElement('canvas')
        canvas.width = 64
        canvas.height = 64
        const context = canvas.getContext('2d')
        context.fillStyle = '#74c9ad'
        context.fillRect(0, 0, 64, 64)
        context.fillStyle = '#247b68'
        context.fillRect(16, 16, 32, 32)
        const imageData = canvas.toDataURL('image/png')
        const longName = '自然美学SKU产品包装视觉拍摄参考图片与修订版本'.repeat(3)
        const images = Array.from({ length: 3 }, (_, index) => {
          const node = addCanvasImage(imageData, `${longName}-${index + 1}.png`, { x: 120 + index * 240, y: 520 })
          node.dataset.boardId = canvasState.activeBoardId
          return node
        })
        const video = addCanvasVideoNode({ x: 840, y: 520 }, {
          src: `${location.origin}/output/agent-context-fixture.mp4`,
          name: `${longName}-视频.mp4`,
          mimeType: 'video/mp4',
        })
        video.dataset.boardId = canvasState.activeBoardId
        const text = addCanvasText({ x: 1080, y: 520 }, {
          name: `${longName}-文字说明.txt`,
          text: `${longName}的完整说明内容`,
          focus: false,
        })
        text.dataset.boardId = canvasState.activeBoardId
        clearCanvasSelection()
        for (const node of [...images, video, text]) toggleCanvasNodeSelection(node)
        return { ids: [...images, video, text].map(node => node.dataset.id) }
      })
      const contextDisplay = await page.locator('#canvasAgentContext').evaluate(element => {
        const chips = [...element.querySelectorAll('.canvas-agent-context-chip')]
        const skill = chips.find(chip => chip.classList.contains('is-skill'))
        const overflow = element.querySelector('[data-agent-context-overflow]')
        const rect = element.getBoundingClientRect()
        return {
          visible: !element.hidden,
          skillText: skill?.textContent || '',
          materialText: chips.filter(chip => !chip.classList.contains('is-skill'))
            .map(chip => chip.textContent || ''),
          materialCount: chips.filter(chip => !chip.classList.contains('is-skill')).length,
          imagePreviews: element.querySelectorAll('.canvas-agent-context-preview img').length,
          videoPreviews: element.querySelectorAll('.canvas-agent-context-video').length,
          videoCoverImages: element.querySelectorAll('.canvas-agent-context-video img').length,
          videoCoverMedia: element.querySelectorAll('.canvas-agent-context-video :is(img, video)').length,
          textPlaceholders: element.querySelectorAll('.canvas-agent-context-placeholder [data-lucide="type"]').length,
          overflowLabel: overflow?.textContent || '',
          overflowTitle: overflow?.title || '',
          overflows: element.scrollWidth > element.clientWidth + 1,
          right: rect.right,
          parentRight: element.parentElement.getBoundingClientRect().right,
        }
      })
      assert.equal(contextDisplay.visible, true, 'selected references remain visible in the Agent composer')
      assert.match(contextDisplay.skillText, /隔离验收 Skill/, 'the selected Skill name remains visible')
      assert.ok(contextDisplay.materialText.every(text => !text.trim()),
        'asset reference chips do not render node or file names')
      assert.ok(contextDisplay.imagePreviews > 0, 'image references use compact thumbnails')
      assert.match(contextDisplay.overflowLabel, /^\+\d+$/, 'excess references are summarized by a count')
      assert.match(contextDisplay.overflowTitle, /自然美学SKU产品包装/, 'the overflow count exposes hidden asset names on hover')
      assert.equal(contextDisplay.overflows, false, 'reference previews stay inside the composer width')
      assert.ok(contextDisplay.right <= contextDisplay.parentRight + 1, 'reference row does not escape its parent')
      await page.screenshot({ path: path.join(isolatedVisualDir, 'context-assets-compact.png') })
      await page.locator('#canvasAgentContext [data-agent-context-overflow]').click()
      await page.waitForFunction(() => {
        const preview = document.querySelector('.canvas-agent-context-video')
        const image = preview?.querySelector('img')
        return Boolean(image?.complete && image.naturalWidth)
          || Number(preview?.querySelector('video')?.readyState || 0) >= 2
      }, null, { timeout: 5000 })
      const expandedContext = await page.locator('#canvasAgentContext').evaluate(element => ({
        visibleMaterials: element.querySelectorAll('.canvas-agent-context-chip:not(.is-skill)').length,
        imagePreviews: element.querySelectorAll('.canvas-agent-context-preview img').length,
        videoPreviews: element.querySelectorAll('.canvas-agent-context-video').length,
        videoCoverImages: element.querySelectorAll('.canvas-agent-context-video img').length,
        videoCoverMedia: element.querySelectorAll('.canvas-agent-context-video :is(img, video)').length,
        textPlaceholders: element.querySelectorAll('.canvas-agent-context-placeholder [data-lucide="type"]').length,
        namesHidden: [...element.querySelectorAll('.canvas-agent-context-chip:not(.is-skill)')]
          .every(chip => !chip.textContent.trim()),
        scrollable: getComputedStyle(element).overflowY === 'auto',
        maxHeight: element.clientHeight,
        contextBottom: element.getBoundingClientRect().bottom,
        promptTop: document.querySelector('#canvasAgentPrompt').getBoundingClientRect().top,
        placeholdersContained: [...element.querySelectorAll('.canvas-agent-context-placeholder')].every(placeholder => {
          const rect = placeholder.getBoundingClientRect()
          return rect.width === 36 && rect.height === 36
        }),
        sendAtRight: Math.abs(document.querySelector('#canvasAgentSend').getBoundingClientRect().right
          - document.querySelector('.canvas-agent-form-footer').getBoundingClientRect().right) < 3,
      }))
      assert.equal(expandedContext.visibleMaterials, 5, 'the expanded row exposes every selected reference')
      assert.equal(expandedContext.imagePreviews, 3, 'all images remain compact thumbnails')
      assert.equal(expandedContext.videoPreviews, 1, 'video references use their poster thumbnail')
      assert.equal(expandedContext.videoCoverMedia, 1, 'the video thumbnail remains visible after expansion')
      assert.equal(expandedContext.textPlaceholders, 1, 'text references use the type icon')
      assert.equal(expandedContext.namesHidden, true, 'expanded material previews still hide default names')
      assert.equal(expandedContext.placeholdersContained, true, 'type placeholders stay within their thumbnail slots')
      assert.equal(expandedContext.sendAtRight, true, 'Agent send button keeps its original right edge position')
      assert.equal(expandedContext.scrollable, true, 'expanded references remain accessible through the bounded composer scroll area')
      assert.ok(expandedContext.maxHeight <= 88, 'expanded reference previews do not grow without limit')
      assert.ok(expandedContext.contextBottom + 2 <= expandedContext.promptTop,
        'expanded references keep a visible gap above the prompt input')
      await page.screenshot({ path: path.join(isolatedVisualDir, 'context-assets-expanded.png') })
      const contextGeometry = []
      const viewportSession = await page.context().newCDPSession(page)
      for (const viewport of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
        for (const zoom of [1, 1.25, 1.5]) {
          await viewportSession.send('Emulation.setDeviceMetricsOverride', {
            width: Math.floor(viewport.width / zoom), height: Math.floor(viewport.height / zoom),
            deviceScaleFactor: zoom, mobile: false,
          })
          await page.waitForTimeout(80)
          const geometry = await page.locator('#canvasAgentContext').evaluate(element => {
            const rect = element.getBoundingClientRect()
            const prompt = document.querySelector('#canvasAgentPrompt').getBoundingClientRect()
            const footer = document.querySelector('.canvas-agent-form-footer').getBoundingClientRect()
            const send = document.querySelector('#canvasAgentSend').getBoundingClientRect()
            return {
              contextBottom: rect.bottom, promptTop: prompt.top,
              contextOverflow: element.scrollWidth > element.clientWidth + 1,
              sendRight: send.right, footerRight: footer.right,
              pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
              viewportWidth: innerWidth, viewportHeight: innerHeight, dpr: devicePixelRatio,
              visible: rect.left >= 0 && rect.right <= innerWidth + 1
                && send.bottom <= innerHeight + 1,
            }
          })
          assert.equal(geometry.contextOverflow, false, JSON.stringify({ viewport, zoom, geometry }))
          assert.equal(geometry.pageOverflow, false, JSON.stringify({ viewport, zoom, geometry }))
          assert.equal(geometry.visible, true, JSON.stringify({ viewport, zoom, geometry }))
          assert.equal(geometry.viewportWidth, Math.floor(viewport.width / zoom))
          assert.equal(geometry.viewportHeight, Math.floor(viewport.height / zoom))
          assert.ok(geometry.contextBottom <= geometry.promptTop, JSON.stringify({ viewport, zoom, geometry }))
          assert.ok(Math.abs(geometry.sendRight - geometry.footerRight) < 3)
          contextGeometry.push({ viewport, layoutAndDprZoom: zoom, ...geometry })
          const screenshot = await viewportSession.send('Page.captureScreenshot', {
            format: 'png', captureBeyondViewport: false, fromSurface: true,
          })
          fs.writeFileSync(path.join(isolatedVisualDir, `context-${viewport.width}-${zoom * 100}.png`),
            Buffer.from(screenshot.data, 'base64'))
        }
      }
      await viewportSession.send('Emulation.clearDeviceMetricsOverride')
      await viewportSession.detach()
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.locator('#canvasAgentPrompt').fill('请检查已引用的全部素材。')
      await page.locator('#canvasAgentSend').click()
      await page.waitForFunction(() => !document.querySelector('#canvasAgentSend').disabled)
      assert.deepEqual(plainRequests[0].canvas.selected_node_ids.sort(), [...contextFixture.ids].sort(),
        'compact display preserves every selected asset node id in the request')
      const sentContextNodeIds = [...plainRequests[0].canvas.selected_node_ids]
      assert.equal(await page.locator('#canvasAgentContext [data-agent-context-overflow]').getAttribute('aria-expanded'), 'true',
        'the expanded context exposes a control to return to its compact state')
      await page.locator(`#canvasAgentContext [data-agent-node-id="${contextFixture.ids[3]}"] [data-remove-agent-context]`).click()
      const remainingContextIds = await page.locator('#canvasAgentContext [data-agent-node-id]').evaluateAll(
        chips => chips.map(chip => chip.dataset.agentNodeId).filter(Boolean),
      )
      assert.deepEqual(remainingContextIds.sort(), [...contextFixture.ids.slice(0, 3), contextFixture.ids[4]].sort(),
        'removing one visible asset only excludes that reference')
      await page.evaluate(() => clearCanvasSelection())
      plainRequests.length = 0
      if (process.env.AGENT_CONTEXT_ONLY === '1') {
        fs.writeFileSync(path.join(isolatedVisualDir, 'context-report.json'), JSON.stringify({
          contextDisplay, expandedContext, contextGeometry,
          selectedNodeIds: contextFixture.ids,
          sentNodeIds: sentContextNodeIds,
          remainingContextIds,
          boundary: '实际 33200 程序资源，隔离 API、测试素材和画布，通过逻辑视口与 DPR 模拟页面缩放。',
        }, null, 2))
        console.log('PASS: deployed Agent context thumbnails, overflow, references and removal', isolatedVisualDir)
        return
      }
      const prompt = page.locator('#canvasAgentPrompt')
      await prompt.fill('第一行')
      await prompt.press('Shift+Enter')
      await prompt.type('第二行')
      assert.equal(await prompt.inputValue(), '第一行\n第二行', 'Shift+Enter inserts a newline')
      await prompt.evaluate(input => {
        input.dataset.composing = 'true'
        input.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', keyCode: 229, bubbles: true, cancelable: true, isComposing: true,
        }))
      })
      assert.equal(plainRequests.length, 0, 'an IME composition Enter does not submit the prompt')
      await prompt.evaluate(input => input.dispatchEvent(new CompositionEvent('compositionend', { data: '', bubbles: true })))
      await prompt.fill('你好，请回复一句普通文字。')
      mockSlowPlainReply = true
      const enteredRequest = page.waitForRequest(request => request.url().includes('/api/canvas-agent/turn')
        && request.postDataJSON()?.prompt === '你好，请回复一句普通文字。')
      await prompt.press('Enter')
      await enteredRequest
      await page.waitForFunction(() => document.querySelector('#canvasAgentSend').hidden
        && !document.querySelector('#canvasAgentStop').hidden, null, { timeout: 5000 })
      assert.equal(await page.locator('#canvasAgentStop').isVisible(), true,
        'the sending control switches to stop while a request is active')
      await page.locator('#canvasAgentStop').click()
      await page.waitForFunction(() => !document.querySelector('#canvasAgentSend').hidden
        && document.querySelector('#canvasAgentStop').hidden, null, { timeout: 5000 })
      mockSlowPlainReply = false
      assert.equal(plainRequests.length, 1, 'a Skill without interaction configuration uses the existing Agent request')
      assert.equal(plainRequests[0].prompt, '你好，请回复一句普通文字。',
        'the selected Skill remains metadata instead of being prepended to the prompt')
      assert.equal(await page.locator('#canvasAgentStatus').innerText(), '已停止',
        'the stop action terminates the active request without clearing the panel')
      assert.equal(await page.locator('.canvas-agent-wizard').count(), 0, 'plain Skills have no forced form')
      plainRequests.length = 0
      mockAgentTurn = false
      mockPlainReply = false
    }
    let wizardReloadChecked = false
    async function fillWizard(product, direction = 'recommend', ratio = '16:9', options = {}) {
      const capture = async name => {
        if (options.captureScreenshots) {
          await page.screenshot({ path: path.join(isolatedVisualDir, `${name}.png`) })
        }
      }
      await page.waitForSelector('[data-agent-wizard-step="product"]', { state: 'visible' })
      assert.match(await page.locator('#agentWizard_product_positioning').getAttribute('placeholder'), /^例如：/,
        'the product field shows the configured example')
      assert.equal(await page.locator('.canvas-agent-wizard > strong').innerText(), '产品主体与材质 *',
        'the required product step has a single clear title')
      await capture('wizard-step-1-product')
      const prefilled = product.startsWith('青绿色')
      if (prefilled) assert.match(await page.locator('#agentWizard_product_positioning').inputValue(), /广告海报/)
      await page.locator('#agentWizard_product_positioning').fill(product)
      await page.locator('[data-agent-wizard-action="next"]').click()
      await page.waitForSelector('[data-agent-wizard-step="image"]')
      assert.equal(await page.locator('.canvas-agent-wizard-images [data-agent-wizard-source]').count(), 1,
        'the selected product image is shown only on the image step')
      assert.equal(await page.locator('.canvas-agent-wizard .is-image-sources > button').count(), 2,
        'the image step exposes only canvas selection and upload cards')
      if (pickerSourceNodeId && product.startsWith('红色') && !canvasPickerChecked) {
        canvasPickerChecked = true
        await page.locator('[data-agent-wizard-action="canvas"]').click()
        await page.keyboard.press('Escape')
        assert.equal(await page.locator('#canvasEditorScreen').evaluate(element => element.classList.contains('is-agent-canvas-picking')), false,
          'Escape exits canvas material picking')

        await page.locator('[data-agent-wizard-action="canvas"]').click()
        await page.evaluate(nodeId => window.ensureCanvasNodeMounted?.(nodeId), pickerSourceNodeId)
        const node = page.locator(`#canvasPlane .canvas-node[data-id="${pickerSourceNodeId}"]`)
        const pickerNodeInfo = await page.evaluate(nodeId => ({
          inBoard: serializeCanvasBoard().nodes.some(item => item.id === nodeId),
          inPlane: Boolean(document.querySelector(`#canvasPlane .canvas-node[data-id="${nodeId}"]`)),
          ensured: Boolean(window.ensureCanvasNodeMounted?.(nodeId)),
        }), pickerSourceNodeId)
        assert.equal(pickerNodeInfo.inPlane, true, `the fixture keeps the second reference node mountable: ${JSON.stringify(pickerNodeInfo)}`)
        await node.waitFor({ state: 'attached', timeout: 1500 })
        const cursor = await page.locator('#canvasPlane').evaluate(element => getComputedStyle(element).cursor)
        assert.match(cursor, /canvas-agent-picker-cursor\.svg/, 'canvas picking uses the plus-style cursor asset')
        await node.hover()
        assert.equal(await node.evaluate(element => element.classList.contains('is-agent-picker-hover')), true,
          'hovering an eligible source node marks it as selectable')
        assert.ok(Number.parseFloat(await node.evaluate(element => getComputedStyle(element).outlineWidth)) >= 2,
          'eligible source node receives a visible selection outline')
        await node.click()
        await page.waitForFunction(() => !document.querySelector('#canvasEditorScreen')?.classList.contains('is-agent-canvas-picking'))
        assert.equal(await page.locator(`#canvasAgentMessages [data-agent-wizard-source="${pickerSourceNodeId}"]`).count(), 1,
          'the picked source is shown as a thumbnail in the wizard')
      }
      if (options.testUploadMultiple) {
        await page.evaluate(() => {
          const original = window.uploadCanvasImageFile
          window.__originalCanvasAgentUpload = original
          window.uploadCanvasImageFile = file => new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result)
            reader.onerror = () => reject(reader.error || new Error('隔离图片读取失败'))
            reader.readAsDataURL(file)
          })
        })
        const chooserPromise = page.waitForEvent('filechooser')
        await page.locator('[data-agent-wizard-action="upload"]').click()
        const chooser = await chooserPromise
        assert.equal(chooser.isMultiple(), true, 'wizard upload allows selecting multiple product images')
        const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5Z8AAAAASUVORK5CYII=', 'base64')
        await chooser.setFiles([
          { name: '参考图一.png', mimeType: 'image/png', buffer: png },
          { name: '参考图二.png', mimeType: 'image/png', buffer: png },
        ])
        await page.waitForFunction(() => document.querySelectorAll('.canvas-agent-wizard-images figure').length === 3,
          null, { timeout: 5000 })
        const uploadedSources = savedConversations.get('qa-agent-isolated')?.wizardDraft.sourceNodeIds || []
        assert.equal(uploadedSources.length, 3,
          'uploading several references appends them to the preselected canvas image')
        await page.locator(`[data-agent-wizard-action="remove-source"][data-node-id="${uploadedSources[1]}"]`).click()
        await page.waitForFunction(() => document.querySelectorAll('.canvas-agent-wizard-images figure').length === 2)
        naturalPhotoBoard.workflowSourceNodeIds = savedConversations.get('qa-agent-isolated')?.wizardDraft.sourceNodeIds || []
        assert.equal(naturalPhotoBoard.workflowSourceNodeIds.length, 2,
          'removing one thumbnail removes only that reference from the workflow')
        const boardAfterUpload = await page.evaluate(() => serializeCanvasBoard())
        naturalPhotoBoard.nodeCount = boardAfterUpload.nodes.length
        await page.evaluate(() => {
          if (window.__originalCanvasAgentUpload) window.uploadCanvasImageFile = window.__originalCanvasAgentUpload
          delete window.__originalCanvasAgentUpload
        })
      } else {
      }
      await capture('wizard-step-2-reference')
      await page.locator('[data-agent-wizard-action="next"]').click()
      await page.locator('#agentWizard_audience_usage').fill('面向年轻商务人群，用于品牌官网和广告海报')
      await capture('wizard-step-3-audience')
      await page.locator('[data-agent-wizard-action="back"]').click()
      await page.locator('[data-agent-wizard-action="next"]').click()
      assert.equal(await page.locator('#agentWizard_audience_usage').inputValue(), '面向年轻商务人群，用于品牌官网和广告海报',
        'back navigation retains audience and use details')
      if (!wizardReloadChecked && product.startsWith('红色')) {
        wizardReloadChecked = true
        const draftBeforeReload = savedConversations.get('qa-agent-isolated')?.wizardDraft
        assert.equal(draftBeforeReload?.step, 2)
        const savedBoard = await page.evaluate(() => serializeCanvasBoard())
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.evaluate(async saved => {
          await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-agent-tool-adapters'])
          const surface = document.createElement('div')
          surface.id = 'neonEngineSurface'
          surface.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column'
          document.body.append(surface)
          surface.append(document.querySelector('#canvasView'))
          await openCanvasBoardFromHistory(saved)
          await AiOsModuleLoader.ensure(['canvas-agent-ui'])
          CanvasAgentUi.useSkill('natural-aesthetic-product-photography')
        }, savedBoard)
        await page.waitForSelector('[data-agent-wizard-step="audience"]', { state: 'visible' })
        assert.equal(await page.locator('#agentWizard_audience_usage').inputValue(),
          '面向年轻商务人群，用于品牌官网和广告海报', 'refresh restores the same task fields and step')
        assert.equal(savedConversations.get('qa-agent-isolated')?.wizardDraft.taskId, draftBeforeReload.taskId, 'refresh keeps the task identity')
      }
      await page.locator('[data-agent-wizard-action="next"]').click()
      assert.equal(await page.locator('[data-agent-wizard-field="creative_direction"][data-value="recommend"]').getAttribute('aria-pressed'),
        'true', 'product recommendation is the default visual anchor')
      await page.locator(`[data-agent-wizard-field="creative_direction"][data-value="${direction}"]`).click()
      await capture('wizard-step-4-creative')
      if (product.startsWith('红色')) {
        const selected = page.locator(`[data-agent-wizard-field="creative_direction"][data-value="${direction}"]`)
        await page.mouse.move(0, 0)
        const selectedColor = await selected.evaluate(element => getComputedStyle(element).backgroundColor)
        await selected.hover()
        assert.equal(await selected.evaluate(element => getComputedStyle(element).backgroundColor), selectedColor, 'hover preserves the selected card appearance')
        for (const width of [390, 768, 1440, 1728]) {
          await page.setViewportSize({ width, height: 900 })
          const card = page.locator('.canvas-agent-wizard')
          const fits = await card.evaluate(element => element.scrollWidth <= element.clientWidth + 1
            && element.getBoundingClientRect().left >= 0
            && element.getBoundingClientRect().right <= innerWidth)
          assert.equal(fits, true, `wizard choices fit at ${width}px`)
          if (width === 390 || width === 1440) await page.screenshot({ path: path.join(isolatedVisualDir, `wizard-${width}.png`) })
        }
        await page.setViewportSize({ width: 1440, height: 900 })
      }
      await page.locator('[data-agent-wizard-action="next"]').click()
      await page.waitForSelector('[data-agent-wizard-step="output"]')
      const availableSizes = await page.locator('[data-agent-wizard-field="size"]').evaluateAll(buttons =>
        buttons.map(button => ({ value: button.dataset.value, label: button.innerText })))
      assert.ok(availableSizes.some(option => option.value === '3:4'), '3:4 is shown when the selected model supports it')
      assert.ok(availableSizes.some(option => option.value === ratio),
        `requested ratio ${ratio} is present in the model-filtered size choices: ${JSON.stringify(availableSizes)}`)
      if (options.testCustomSize) {
        await page.locator('[data-agent-wizard-field="size"][data-value="custom"]').click()
        await page.locator('#agentWizard_width').fill('1024')
        await page.locator('#agentWizard_height').fill('1536')
        assert.equal(await page.locator('#agentWizard_width').inputValue(), '1024')
        assert.equal(await page.locator('#agentWizard_height').inputValue(), '1536')
      }
      await page.locator(`[data-agent-wizard-field="size"][data-value="${ratio}"]`).click()
      const resolution = product.startsWith('红色') ? '2' : '1'
      await page.locator(`[data-agent-wizard-field="resolution"][data-value="${resolution}"]`).click()
      await capture('wizard-step-5-ratio')
      await page.locator('[data-agent-wizard-action="next"]').click()
      await page.waitForSelector('[data-agent-wizard-step="brand"]')
      await page.locator('#agentWizard_brand_limits').fill('不生成额外文字，保留可见品牌标识')
      await capture('wizard-step-6-brand')
      await page.locator('[data-agent-wizard-action="back"]').click()
      await page.waitForSelector('[data-agent-wizard-step="output"]')
      await page.locator('[data-agent-wizard-action="next"]').click()
      await page.waitForSelector('[data-agent-wizard-step="brand"]')
      assert.equal(await page.locator('#agentWizard_brand_limits').inputValue(),
        '不生成额外文字，保留可见品牌标识', 'back navigation retains brand text and constraints')
      await page.locator(`[data-agent-wizard-action="${options.skipBrand ? 'skip' : 'next'}"]`).click()
      await page.waitForSelector('.canvas-agent-wizard-summary-card', { state: 'visible' })
      await capture('wizard-summary')
      const summary = page.locator('.canvas-agent-wizard-summary-card').last()
      const summaryText = await summary.innerText()
      assert.match(summaryText, /需求摘要/)
      assert.match(summaryText, /参考素材\s+\d+ 张/)
      if (options.testUploadMultiple) assert.match(summaryText, /参考素材\s+2 张/)
      assert.ok(await summary.locator('.canvas-agent-wizard-summary-image img').isVisible(),
        'the submitted summary includes a compact product thumbnail')
    }
    mockNaturalPhotoRun = true
    failSaves = false
    const unreadableImageRequestCount = naturalPhotoRequests.length
    await page.evaluate(async () => {
      const node = addCanvasImage('data:image/png;base64,not-valid', '不可读取素材.png', { x: 160, y: 120 })
      node.dataset.boardId = canvasState.activeBoardId
      selectCanvasNode(node)
      await CanvasAgentUi.useSkill('natural-aesthetic-product-photography')
      document.querySelector('#canvasAgentPrompt').value = '请基于这张图片分析产品。'
      document.querySelector('#canvasAgentForm').requestSubmit()
    })
    await fillWizard('不可读取的产品素材', 'recommend', '16:9', { skipBrand: true })
    await page.waitForTimeout(800)
    assert.equal(naturalPhotoRequests.length, unreadableImageRequestCount,
      'an unreadable selected image is rejected before a visionless model request')
    const unreadableImageFeedback = await page.locator('#canvasAgentMessages').innerText()
    assert.match(unreadableImageFeedback, /图片.*(?:读取|无法|失败)|(?:读取|无法|失败).*图片/,
      'an unreadable selected image has an explicit diagnostic')
    assert.equal(await page.locator('#canvasAgentSend').isDisabled(), false,
      'image preflight failure releases the send control for a subsequent request')
    const naturalPhotoBoard = await page.evaluate(() => {
      const image = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='
      const node = addCanvasImage(image, '隔离产品素材.gif', { x: 160, y: 120 })
      const previewCanvas = document.createElement('canvas')
      previewCanvas.width = 2
      previewCanvas.height = 2
      const previewContext = previewCanvas.getContext('2d')
      previewContext.fillStyle = '#c8b7a8'
      previewContext.fillRect(0, 0, 2, 2)
      const readableImage = previewCanvas.toDataURL('image/png')
      node.querySelector('img')?.setAttribute('src', readableImage)
      node.dataset.imageSrc = readableImage
      node.dataset.boardId = canvasState.activeBoardId
      const source = addCanvasAssetCollection({ x: 160, y: 520 }, {
        title: '隔离上传产品素材.png',
        mode: 'single',
        members: [{ id: 'isolated-product-image', kind: 'image', src: readableImage, name: '隔离上传产品素材.png', mimeType: 'image/png' }],
      })
      source.dataset.boardId = canvasState.activeBoardId
      selectCanvasNode(source)
      return {
        boardId: canvasState.activeBoardId,
        sourceNodeId: source.dataset.id,
        pickerSourceNodeId: source.dataset.id,
        x: Number(source.dataset.x),
        y: Number(source.dataset.y),
        nodeCount: serializeCanvasBoard().nodes.length,
        output: window.getCanvasNodeOutput?.(source) || null,
      }
    })
    pickerSourceNodeId = naturalPhotoBoard.pickerSourceNodeId
    const requestsBeforeWizard = naturalPhotoRequests.length
    await page.evaluate(async () => {
      await CanvasAgentUi.useSkill('natural-aesthetic-product-photography')
      document.querySelector('#canvasAgentPrompt').value = ''
      document.querySelector('#canvasAgentForm').requestSubmit()
    })
    await page.waitForSelector('#canvasAgentMessages [data-agent-wizard-step="product"]', {
      state: 'visible',
      timeout: 1000,
    })
    assert.equal(naturalPhotoRequests.length, requestsBeforeWizard,
      'wizard collection does not send a model request before the final step')
    assert.equal(await page.locator('#canvasAgentMessages [data-agent-wizard-source]').count(), 0,
      'product thumbnails are reserved for the image-selection step')
    assert.match(await page.locator('#canvasAgentMessages [data-agent-wizard-progress]').innerText(), /1\s*\/\s*6/,
      'the first wizard step exposes progress')
    await fillWizard('红色折叠键盘，便携办公产品', 'recommend', '16:9', {
      captureScreenshots: true,
      testUploadMultiple: true,
    })
    await page.waitForSelector('#canvasAgentMessages .canvas-agent-brief', { state: 'visible', timeout: 15000 })
    const assistantAnalysisText = (await page.locator('#canvasAgentMessages .canvas-agent-message.is-assistant').allInnerTexts()).join('\n')
    assert.doesNotMatch(assistantAnalysisText, /请依据当前已选择的「自然美学产品摄影」Skill/,
      'the analysis card is not duplicated by a chat-style execution instruction')
    assert.equal(await page.locator('#canvasAgentMessages .canvas-agent-brief details[data-agent-brief-full]').getAttribute('open'), null,
      'the full proposal starts collapsed')
    assert.doesNotMatch(await page.locator('#canvasAgentMessages').innerText(), /当前未提供 request_design_brief/,
      'internal tool errors and long proposal text are not shown to the user')
    const visualDir = isolatedVisualDir
    for (const width of [390, 768, 1440, 1728]) {
      await page.setViewportSize({ width, height: 900 })
      const geometry = await page.locator('#canvasAgentMessages .canvas-agent-brief').evaluate(card => ({
        clientWidth: card.clientWidth,
        scrollWidth: card.scrollWidth,
        left: card.getBoundingClientRect().left,
        right: card.getBoundingClientRect().right,
        panelLeft: document.querySelector('#canvasAgentPanel').getBoundingClientRect().left,
        messagesBottom: document.querySelector('#canvasAgentMessages').getBoundingClientRect().bottom,
        formTop: document.querySelector('#canvasAgentForm').getBoundingClientRect().top,
        buttons: [...card.querySelectorAll('.canvas-agent-brief-actions button')].map(button => {
          const rect = button.getBoundingClientRect()
          const parent = card.getBoundingClientRect()
          return rect.left >= parent.left - 1 && rect.right <= parent.right + 1
        }),
      }))
      assert.ok(geometry.scrollWidth <= geometry.clientWidth + 1, `proposal card has no horizontal overflow at ${width}px`)
      assert.ok(geometry.left >= 0 && geometry.right <= width && geometry.panelLeft >= 0,
        `proposal card and panel fit in the ${width}px viewport: ${JSON.stringify(geometry)}`)
      assert.ok(geometry.buttons.every(Boolean), `proposal actions fit at ${width}px`)
      assert.ok(geometry.messagesBottom <= geometry.formTop + 1, `messages do not overlap composer at ${width}px: ${JSON.stringify(geometry)}`)
      if (width === 390 || width === 1440) await page.screenshot({ path: path.join(visualDir, `brief-${width}.png`) })
    }
    await page.setViewportSize({ width: 1440, height: 900 })
    const testImageData = await page.locator('.canvas-agent-wizard-product img').first().evaluate(image => {
      const canvas = document.createElement('canvas')
      canvas.width = 1600
      canvas.height = 1200
      canvas.getContext('2d').fillRect(0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/png')
    })
    await page.locator('.canvas-agent-wizard-product img').first().evaluate((image, src) => { image.src = src }, testImageData)
    await page.waitForFunction(() => document.querySelector('.canvas-agent-wizard-product img')?.naturalWidth === 1600)
    const productPreview = await page.locator('.canvas-agent-wizard-product').evaluate(product => ({
      width: product.getBoundingClientRect().width,
      scrollWidth: product.scrollWidth,
      images: [...product.querySelectorAll('img')].map(image => {
        const rect = image.getBoundingClientRect()
        return { width: rect.width, height: rect.height, naturalWidth: image.naturalWidth }
      }),
    }))
    assert.ok(productPreview.width <= 380 && productPreview.scrollWidth <= productPreview.width + 1,
      `product previews stay within the confirmation card: ${JSON.stringify(productPreview)}`)
    assert.ok(productPreview.images.every(image => image.width <= 88 && image.height <= 88),
      `product images stay as compact thumbnails: ${JSON.stringify(productPreview)}`)
    await page.locator('.canvas-agent-wizard-product img').first().evaluate(image => {
      image.src = 'data:image/png;base64,not-a-valid-image'
    })
    await page.waitForFunction(() => document.querySelector('.canvas-agent-wizard-product figure')?.dataset.imageState === 'error')
    assert.equal(await page.locator('[data-agent-image-fallback]').first().isVisible(), true,
      'a failed product image shows a compact unavailable state')
    assert.equal(await page.locator('.canvas-agent-wizard-product img').first().isVisible(), false,
      'a failed image is replaced by its fallback instead of leaving a broken image box')
    const failedPreviewWidth = await page.locator('.canvas-agent-wizard-product').evaluate(product => product.scrollWidth)
    assert.ok(failedPreviewWidth <= productPreview.width + 1,
      `a failed product image does not expand the card: ${failedPreviewWidth}px`)
    await page.locator('.canvas-agent-wizard-product img').first().evaluate((image, src) => { image.src = src }, testImageData)
    await page.waitForFunction(() => document.querySelector('.canvas-agent-wizard-product figure')?.dataset.imageState === 'loaded')
    await page.locator('.canvas-agent-wizard-product').evaluate(product => {
      for (let index = 1; index < 3; index += 1) {
        const figure = product.querySelector('figure').cloneNode(true)
        figure.querySelector('figcaption').textContent = `很长的参考素材文件名_${'产品图片'.repeat(24)}_${index}.png`
        product.append(figure)
      }
      product.querySelector('p').textContent = `长定位说明_${'自然美学商业摄影定位'.repeat(16)}`
    })

    const resizeHandle = page.locator('#canvasAgentResizeHandle')
    const resizeBounds = await resizeHandle.boundingBox()
    assert.ok(resizeBounds && resizeBounds.width >= 10, 'the panel resize handle has a usable hit area')
    await page.mouse.move(resizeBounds.x + resizeBounds.width / 2, resizeBounds.y + 80)
    assert.equal(await resizeHandle.evaluate(handle => getComputedStyle(handle).cursor), 'ew-resize',
      'the panel edge advertises horizontal resizing')
    for (const targetWidth of [320, 410, 560, 760]) {
      const startBounds = await resizeHandle.boundingBox()
      const currentWidth = await page.locator('#canvasAgentPanel').evaluate(panel => Number.parseFloat(getComputedStyle(panel).width))
      const renderedWidth = await page.locator('#canvasAgentPanel').evaluate(panel => panel.getBoundingClientRect().width)
      const startX = startBounds.x + startBounds.width / 2
      const y = startBounds.y + Math.min(80, startBounds.height / 2)
      await page.mouse.move(startX, y)
      const hitTarget = await page.evaluate(({ x, y }) => {
        const element = document.elementFromPoint(x, y)
        return { id: element?.id, className: String(element?.className || ''), handleHit: Boolean(element?.closest('#canvasAgentResizeHandle')) }
      }, { x: startX, y })
      await page.mouse.down()
      const resizeStarted = await page.locator('#canvasAgentPanel').evaluate(panel => panel.classList.contains('is-resizing'))
      await page.mouse.move(startX + (currentWidth - targetWidth) * renderedWidth / currentWidth, y, { steps: 5 })
      await page.mouse.up()
      const widthState = await page.locator('#canvasAgentPanel').evaluate(panel => ({
        rendered: panel.getBoundingClientRect().width,
        computed: getComputedStyle(panel).width,
        offset: panel.offsetWidth,
        parentVariable: getComputedStyle(panel.parentElement).getPropertyValue('--agent-panel-width').trim(),
        ancestors: (() => {
          const result = []
          for (let element = panel; element && result.length < 5; element = element.parentElement) {
            const style = getComputedStyle(element)
            result.push({ tag: element.tagName, id: element.id, className: String(element.className || ''),
              zoom: style.zoom, transform: style.transform })
          }
          return result
        })(),
      }))
      const actualWidth = Number.parseFloat(widthState.computed)
      assert.ok(Math.abs(actualWidth - targetWidth) <= 1,
        `dragging the panel edge sets ${targetWidth}px, got ${actualWidth}px from ${currentWidth}px; width ${JSON.stringify(widthState)}; resize started ${resizeStarted}; hit ${JSON.stringify(hitTarget)}`)
      assert.ok(await page.evaluate(() => localStorage.getItem('canvas-agent-panel-width-v1')) === String(targetWidth),
        `dragging to ${targetWidth}px persists the panel width`)
      const cardLayout = await page.locator('#canvasAgentMessages .canvas-agent-brief').evaluate(card => ({
        width: card.clientWidth,
        scrollWidth: card.scrollWidth,
        buttons: [...card.querySelectorAll('.canvas-agent-brief-actions button')].map(button => {
          const buttonBounds = button.getBoundingClientRect()
          const cardBounds = card.getBoundingClientRect()
          return buttonBounds.left >= cardBounds.left - 1 && buttonBounds.right <= cardBounds.right + 1
        }),
        productOverflow: card.querySelector('.canvas-agent-wizard-product').scrollWidth
          > card.querySelector('.canvas-agent-wizard-product').clientWidth + 1,
      }))
      assert.ok(cardLayout.scrollWidth <= cardLayout.width + 1 && cardLayout.buttons.every(Boolean)
        && !cardLayout.productOverflow,
      `long copy, three thumbnails and actions fit in a ${targetWidth}px panel: ${JSON.stringify(cardLayout)}`)
      await page.waitForFunction(() => {
        const canvas = document.querySelector('.infinite-canvas').getBoundingClientRect()
        const panel = document.querySelector('#canvasAgentPanel').getBoundingClientRect()
        return Math.abs(canvas.right - panel.left) <= 1
      }, null, { timeout: 1000 })
      await page.screenshot({ path: path.join(visualDir, `panel-${targetWidth}.png`) })
    }
    await resizeHandle.dblclick()
    const defaultWidth = await page.locator('#canvasAgentPanel').evaluate(panel => Number.parseFloat(getComputedStyle(panel).width))
    assert.equal(defaultWidth, 410, 'double-click restores the default width')
    assert.equal(await page.evaluate(() => localStorage.getItem('canvas-agent-panel-width-v1')), '410',
      'double-click persists the default width')
    const defaultHandleBounds = await resizeHandle.boundingBox()
    const defaultRenderedWidth = await page.locator('#canvasAgentPanel').evaluate(panel => panel.getBoundingClientRect().width)
    const defaultStartX = defaultHandleBounds.x + defaultHandleBounds.width / 2
    const defaultY = defaultHandleBounds.y + Math.min(80, defaultHandleBounds.height / 2)
    await page.mouse.move(defaultStartX, defaultY)
    await page.mouse.down()
    await page.mouse.move(defaultStartX - (760 - defaultWidth) * defaultRenderedWidth / defaultWidth, defaultY, { steps: 5 })
    await page.mouse.up()
    const resizeBoardSnapshot = await page.evaluate(() => serializeCanvasBoard())
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.reload({ waitUntil: 'domcontentloaded' })
    const restoredResizeBoard = await page.evaluate(async savedBoard => {
      await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-agent-tool-adapters'])
      let surface = document.querySelector('#neonEngineSurface')
      if (!surface) {
        surface = document.createElement('div')
        surface.id = 'neonEngineSurface'
        surface.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column'
        document.body.append(surface)
      }
      surface.append(document.querySelector('#canvasView'))
      const opened = await openCanvasBoardFromHistory(savedBoard)
      await AiOsModuleLoader.ensure(['canvas-agent-ui'])
      return { opened, boardId: canvasState.activeBoardId }
    }, resizeBoardSnapshot)
    assert.equal(restoredResizeBoard.opened, true, 'the resize test board reopens before checking persisted panel width')
    await page.waitForSelector('#canvasAgentMessages .canvas-agent-brief', { state: 'visible', timeout: 15000 })
    const restoredWidth = await page.locator('#canvasAgentPanel').evaluate(panel => Number.parseFloat(getComputedStyle(panel).width))
    assert.equal(restoredWidth, 760, 'the last panel width is restored after refresh')
    assert.equal(await page.locator('[data-agent-brief-option]').count(), 3,
      'three creative directions use visible choice cards')
    assert.equal(await page.locator('#canvasAgentMessages [data-agent-confirmed-image-prompt]').inputValue(),
      naturalPhotoScenarios.keyboard.preview.image_prompt, 'the first card contains a complete preview')
    await page.locator('[data-agent-brief-option]').filter({ hasText: naturalPhotoScenarios.keyboard.choices[1] }).click()
    await page.locator('#canvasAgentMessages [data-agent-workflow-choice="create_manually"]').click()
    await page.waitForFunction(() => {
      const card = document.querySelector('#canvasAgentMessages .canvas-agent-brief')
      return card && !card.querySelector('[data-agent-brief-question]')
    }, null, { timeout: 15000 })
    assert.ok(naturalPhotoRequests.some(request =>
      String(request.prompt).includes(naturalPhotoScenarios.keyboard.choices[1])
      && String(request.prompt).includes('不代表已确认摄影方案')),
    'direction selection is sent as a revision, separate from final confirmation')
    assert.equal((await page.evaluate(() => serializeCanvasBoard())).nodes.length, naturalPhotoBoard.nodeCount,
      'selecting a direction creates no node')
    assert.equal(savedConversations.get(naturalPhotoBoard.boardId)?.pendingWorkflow?.status, 'awaiting-confirmation',
      'the selected plan still awaits final confirmation')
    assert.equal(await page.locator('#canvasAgentMessages [data-agent-confirmed-image-prompt]').inputValue(),
      naturalPhotoScenarios.keyboard.image_prompt, 'selecting architecture replaces the complete office preview')
    assert.equal(await page.locator('#canvasAgentMessages [data-agent-brief-revise]').count(), 1,
      'the card offers a revision action')
    await page.locator('#canvasAgentMessages [data-agent-brief-revise]').click()
    await page.locator('#canvasAgentMessages [data-agent-brief-revision]').fill('背景改为浅色石质承托面，保留建筑投影')
    await page.locator('#canvasAgentMessages [data-agent-brief-revision-submit]').click()
    await page.waitForFunction(() => document.querySelector('#canvasAgentMessages .canvas-agent-brief [data-agent-brief-revise]'), null, { timeout: 15000 })
    assert.ok(naturalPhotoRequests.some(request => String(request.prompt).includes('背景改为浅色石质承托面')),
      'the revised proposal is sent to the selected Skill')
    assert.equal((await page.evaluate(() => serializeCanvasBoard())).nodes.length, naturalPhotoBoard.nodeCount,
      'revising the proposal does not create a node')
    assert.equal(naturalPhotoBoard.output.type, 'assets', 'uploaded-material collection uses the real asset output shape')
    assert.equal(naturalPhotoSourceId, naturalPhotoBoard.sourceNodeId, 'blank send passes the selected product node into Agent context')
    assert.equal(naturalPhotoRequests[0].prompt.includes('当前已选择的'), true, 'blank send becomes an explicit Skill task')
    assert.deepEqual(naturalPhotoRequests[0].canvas.selected_node_ids, naturalPhotoBoard.workflowSourceNodeIds,
      'visual-analysis includes every chosen canvas and uploaded reference')
    assert.equal(naturalPhotoRequests[0].vision_images.length, naturalPhotoBoard.workflowSourceNodeIds.length,
      'every selected product image is sent through the existing vision input')
    assert.match(naturalPhotoRequests[0].vision_images[0], /^data:image\/jpeg;base64,/, 'the vision input is a readable image payload')
    assert.ok(naturalPhotoRequests[0].vision_images.every(image => /^data:image\/jpeg;base64,/.test(image)),
      'all uploaded image inputs are readable vision payloads')
    const loadedReferencePaths = skillReferenceRequests
      .filter(request => request.skillId === 'natural-aesthetic-product-photography')
      .map(request => request.path)
    assert.ok(loadedReferencePaths.length >= 4 && loadedReferencePaths.length <= 5,
      'same-session revisions reuse cached references while refresh may reload the compact index')
    assert.equal(loadedReferencePaths[0], 'references/case-library.md', 'the compact case index is read before full case records')
    assert.ok(loadedReferencePaths.includes('references/cases/NA-04.md'), 'the selected keyboard workflow reads its matching office case')
    assert.ok(loadedReferencePaths.includes('references/cases/NA-06.md'), 'the selected keyboard workflow reads its matching architecture case')
    assert.ok(loadedReferencePaths.includes('references/cases/NA-07.md'), 'the selected keyboard workflow reads its matching graphic case')
    assert.equal(loadedReferencePaths.includes('references/photography-methods.md'), false,
      'the first planning pass does not load unneeded general methods')
    assert.ok(loadedReferencePaths.indexOf('references/case-library.md')
      < loadedReferencePaths.indexOf('references/cases/NA-06.md'), 'matching cases are loaded after the index')
    assert.equal(await page.locator('#canvasAgentMessages [data-agent-confirmed-image-prompt]').inputValue(),
      naturalPhotoScenarios.keyboard.image_prompt,
      'proposal card exposes the complete editable prompt')
    const awaiting = savedConversations.get(naturalPhotoBoard.boardId)
    assert.equal(awaiting?.pendingWorkflow?.status, 'awaiting-confirmation', 'proposal is saved to the board-scoped conversation')
    assert.match(awaiting?.pendingWorkflow?.sourceFingerprint || '', /^[a-f0-9]{64}$/, 'asset image references participate in source version validation')
    const beforeConfirmation = await page.evaluate(() => serializeCanvasBoard())
    assert.equal(beforeConfirmation.nodes.filter(node => node.id === naturalPhotoBoard.sourceNodeId).length, 1, 'original product node remains unique')
    assert.equal(beforeConfirmation.nodes.length, naturalPhotoBoard.nodeCount, 'premature create_image_node call is blocked before confirmation')
    const savedPlanningBoard = await page.evaluate(() => serializeCanvasBoard())
    denyNaturalNodeCreation = true
    await page.reload({ waitUntil: 'domcontentloaded' })
    const restoredPlanning = await page.evaluate(async savedBoard => {
      await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-agent-tool-adapters'])
      let surface = document.querySelector('#neonEngineSurface')
      if (!surface) {
        surface = document.createElement('div')
        surface.id = 'neonEngineSurface'
        surface.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column'
        document.body.append(surface)
      }
      const view = document.querySelector('#canvasView')
      surface.append(view)
      const opened = await openCanvasBoardFromHistory(savedBoard)
      await AiOsModuleLoader.ensure(['canvas-agent-ui'])
      return { opened, boardId: canvasState.activeBoardId }
    }, savedPlanningBoard)
    assert.equal(restoredPlanning.opened, true, 'planning board reload restores')
    await page.waitForSelector('#canvasAgentMessages .canvas-agent-brief', { state: 'visible', timeout: 15000 })
    const confirmedPrompt = naturalPhotoScenarios.keyboard.image_prompt + '\n用户补充，左上留白适配横向标题。'
    await page.locator('#canvasAgentMessages .canvas-agent-wizard-prompt > summary').click()
    await page.locator('#canvasAgentMessages [data-agent-confirmed-image-prompt]').fill(confirmedPrompt)
    await page.evaluate(() => {
      const original = window.ensureCanvasAgentImageModelCandidate
      window.ensureCanvasAgentImageModelCandidate = async options => {
        if (options?.requestedModel) return original(options)
        return {
          id: 'qa-natural-photo-image',
          model: 'gpt-image-2',
          family: 'gpt-image-2',
          platform: 'openai',
          resolutions: ['1', '2', '4'],
          ratios: ['1:1', '3:4', '3:2', '4:5', '9:16', '16:9'],
          capabilities: ['image.generate', 'image.edit'],
        }
      }
    })
    await page.locator('#canvasAgentMessages .canvas-agent-brief [data-agent-workflow-choice="create_manually"]').click()
    await page.waitForFunction(() => document.querySelector('#canvasAgentStatus')?.textContent.includes('权限拒绝'), null, { timeout: 15000 })
    assert.equal((await page.evaluate(() => serializeCanvasBoard())).nodes.filter(node => node.nodeTitle === '自然美学产品摄影').length, 0,
      'an explicitly restricted execution stage creates no node')
    const deniedCheckpoint = savedConversations.get(naturalPhotoBoard.boardId)?.pendingWorkflow
    assert.equal(deniedCheckpoint?.status, 'confirmed', 'permission denial retains confirmation')
    assert.equal(deniedCheckpoint?.imagePrompt, confirmedPrompt, 'permission denial retains the edited prompt')
    assert.deepEqual(deniedCheckpoint?.sourceNodeIds, naturalPhotoBoard.workflowSourceNodeIds,
      'permission denial retains all selected source images')
    assert.doesNotMatch(await page.locator('#canvasAgentStatus').innerText(), /保存失败/,
      'permission denial is distinguished from persistence failure')
    denyNaturalNodeCreation = false
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.evaluate(async savedBoard => {
      await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-agent-tool-adapters'])
      const surface = document.createElement('div')
      surface.id = 'neonEngineSurface'
      surface.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column'
      document.body.append(surface)
      surface.append(document.querySelector('#canvasView'))
      await openCanvasBoardFromHistory(savedBoard)
      await AiOsModuleLoader.ensure(['canvas-agent-ui'])
    }, savedPlanningBoard)
    await page.waitForSelector('#canvasAgentMessages .canvas-agent-brief [data-agent-workflow-choice="create_manually"]', { state: 'visible', timeout: 15000 })
    assert.equal(await page.locator('#canvasAgentMessages [data-agent-confirmed-image-prompt]').inputValue(), confirmedPrompt,
      'refresh after denial restores the confirmed prompt for retry')
    failSaves = true
    await page.locator('#canvasAgentMessages .canvas-agent-brief [data-agent-workflow-choice="create_manually"]').click()
    await page.waitForFunction(() => document.querySelector('#canvasAgentStatus')?.textContent.includes('画布保存失败'), null, { timeout: 15000 })
    assert.equal((await page.evaluate(() => serializeCanvasBoard())).nodes.filter(node => node.nodeTitle === '自然美学产品摄影').length, 1,
      'a failed save leaves only the original pending node')
    failSaves = false
    await page.waitForSelector('#canvasAgentMessages .canvas-agent-brief [data-agent-workflow-choice="create_manually"]', { state: 'visible' })
    const persistedBeforeCreate = page.waitForRequest(request => {
      if (!request.url().includes('/api/canvas-agent/conversation') || request.method() !== 'POST') return false
      try { return request.postDataJSON()?.conversation?.pendingWorkflow?.status === 'workflow-created' } catch { return false }
    }, { timeout: 15000 }).then(() => true, () => false)
    await page.locator('#canvasAgentMessages .canvas-agent-brief [data-agent-workflow-choice="create_manually"]').click()
    await page.waitForFunction(() => document.querySelector('#canvasAgentStatus')?.textContent.includes('任务完成'), null, { timeout: 15000 })
    const createdCheckpointPersisted = await persistedBeforeCreate
    assert.equal(createdCheckpointPersisted, true, 'completed node checkpoint is persisted after explicit confirmation')
    assert.equal(naturalPhotoRequests.length >= 3, true, 'planning, confirmed creation and final response are separate requests')
    assert.ok(naturalPhotoRequests.some(request => request.prompt.includes('用户已确认策划')),
      'confirmed natural photography continues through the Skill-governed Agent tool path')
    const createdNodes = [...board.nodes.values()].filter(node => node.nodeTitle === '自然美学产品摄影')
    assert.equal(createdNodes.length, 1, 'explicit confirmation creates exactly one image-generation node')
    const created = createdNodes[0]
    assert.equal(created.prompt,
      confirmedPrompt,
      'created node uses the exact prompt the user confirmed')
    assert.equal(created.imageSrc || created.resultSrc || '', '', 'new node has no fabricated image result')
    assert.equal(created.model, naturalPhotoModel.id, 'node uses the available editing-capable model')
    assert.equal(created.size, naturalPhotoScenarios.keyboard.parameters.size, 'keyboard framing reaches the node')
    assert.equal(created.resolution, awaiting.wizardDraft.parameters.resolution, 'the confirmed wizard resolution reaches the node')
    assert.match(await page.locator('#canvasAgentMessages').innerText(), /可以在节点中点击生成/,
      'confirmed Skill reports the saved node without starting generation')
    assert.doesNotMatch(await page.locator('#canvasAgentMessages').innerText(), /自动补一次生成|执行生成节点/,
      'confirmed Skill does not auto-run the newly created node')
    assert.ok([...board.connections.values()].some(edge => edge.from === naturalPhotoBoard.sourceNodeId && edge.to === created.id), 'original product node has a real persisted reference edge')
    assert.equal(savedConversations.get(naturalPhotoBoard.boardId)?.pendingWorkflow?.imagePrompt, confirmedPrompt,
      'edited prompt is persisted with the confirmed workflow checkpoint')
    assert.equal(awaiting.pendingWorkflow.status, 'awaiting-confirmation', 'saved pre-confirmation checkpoint remains unchanged in prior snapshot')
    assert.equal(savedConversations.get(naturalPhotoBoard.boardId)?.pendingWorkflow?.status, 'workflow-created', 'created-node checkpoint is saved')
    assert.equal(paidJobRequests.length, 0, 'planning and node creation do not submit a paid image job')
    const completedBoard = await page.evaluate(() => serializeCanvasBoard())
    await page.reload({ waitUntil: 'domcontentloaded' })
    const restoredCompleted = await page.evaluate(async savedBoard => {
      await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator', 'canvas-agent-tool-adapters'])
      let surface = document.querySelector('#neonEngineSurface')
      if (!surface) {
        surface = document.createElement('div')
        surface.id = 'neonEngineSurface'
        surface.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column'
        document.body.append(surface)
      }
      surface.append(document.querySelector('#canvasView'))
      const opened = await openCanvasBoardFromHistory(savedBoard)
      await AiOsModuleLoader.ensure(['canvas-agent-ui'])
      return { opened, snapshot: serializeCanvasBoard() }
    }, completedBoard)
    assert.equal(restoredCompleted.opened, true, 'completed workflow board reloads')
    assert.equal(restoredCompleted.snapshot.nodes.filter(node => node.id === created.id).length, 1, 'refresh does not duplicate the confirmed node')
    const restoredImage = restoredCompleted.snapshot.nodes.find(node => node.id === created.id)
    assert.equal(restoredImage?.prompt, confirmedPrompt, 'confirmed prompt survives board refresh')
    for (const key of ['kind', 'engine', 'model', 'modelSelection', 'size', 'resolution', 'platform']) {
      assert.equal(restoredImage?.[key], created[key], `${key} survives board refresh`)
    }
    const sourceBeforeReload = completedBoard.nodes.find(node => node.id === naturalPhotoBoard.sourceNodeId)
    const sourceAfterReload = restoredCompleted.snapshot.nodes.find(node => node.id === naturalPhotoBoard.sourceNodeId)
    assert.ok(sourceBeforeReload?.assetCollection?.members?.[0]?.src, 'uploaded source contains image data')
    assert.deepEqual(sourceAfterReload?.assetCollection, sourceBeforeReload?.assetCollection, 'uploaded material survives board refresh')
    assert.ok(await page.evaluate(nodeId => {
      const node = ensureCanvasNodeMounted(nodeId)
      const prompt = node?.querySelector('.canvas-node-prompt')
      return Boolean(prompt && !prompt.disabled && !prompt.readOnly)
    }, created.id), 'the restored image prompt remains editable')
    assert.ok(restoredCompleted.snapshot.connections.some(edge => edge.from === naturalPhotoBoard.sourceNodeId && edge.to === created.id), 'reference survives board refresh')
    assert.equal(await page.locator('#canvasAgentMessages .canvas-agent-brief').count(), 0, 'created checkpoint does not restore an actionable confirmation card')
    assert.equal(savedConversations.get(naturalPhotoBoard.boardId)?.wizardDraft?.status, 'completed', 'successful node persistence completes the existing task')
    const completedSteps = page.locator('.canvas-agent-tool-step.is-success')
    assert.ok(await completedSteps.count() > 0)
    assert.equal(await completedSteps.locator('.canvas-agent-tool-icon').first().evaluate(element => getComputedStyle(element).backgroundColor), 'rgba(0, 0, 0, 0)', 'completion has no colored icon badge')
    assert.equal(await completedSteps.locator('.canvas-agent-tool-icon svg').first().evaluate(element => getComputedStyle(element).opacity), '0', 'completion hides its icon glyph')
    assert.equal(await completedSteps.locator('.canvas-agent-tool-status').first().innerText(), '已完成', 'completion uses concise status text')
    assert.equal(paidJobRequests.length, 0, 'refresh restoration does not execute image generation')
    naturalPhotoScenario = naturalPhotoScenarios.phoneCase
    const phoneCaseSourceId = await page.evaluate(async image => {
      const source = addCanvasAssetCollection({ x: 160, y: 920 }, {
        title: '隔离手机壳视觉输入.png', mode: 'single',
        members: [{ id: 'isolated-case-image', kind: 'image', src: image, name: '隔离手机壳视觉输入.png', mimeType: 'image/png' }],
      })
      source.dataset.boardId = canvasState.activeBoardId
      selectCanvasNode(source)
      await CanvasAgentUi.useSkill('natural-aesthetic-product-photography')
      document.querySelector('#canvasAgentPrompt').value = '青绿色半透明空手机壳，面向年轻商务人群，广告海报，自然户外氛围，9:16，不需要文案。'
      document.querySelector('#canvasAgentForm').requestSubmit()
      return source.dataset.id
    }, sourceBeforeReload.assetCollection.members[0].src)
    await fillWizard('青绿色半透明空手机壳，年轻商务人群', 'recommend', '9:16', { testCustomSize: true })
    await page.waitForSelector('#canvasAgentMessages .canvas-agent-brief', { state: 'visible', timeout: 15000 })
    assert.equal(await page.locator('#canvasAgentMessages [data-agent-confirmed-image-prompt]').inputValue(),
      naturalPhotoScenarios.phoneCase.preview.image_prompt, 'phone case starts with an architecture preview')
    const countBeforePhoneChoice = (await page.evaluate(() => serializeCanvasBoard())).nodes.length
    await page.locator('[data-agent-brief-option]').filter({ hasText: naturalPhotoScenarios.phoneCase.choices[0] }).click()
    await page.locator('#canvasAgentMessages [data-agent-workflow-choice="create_manually"]').click()
    await page.waitForFunction(() => {
      const card = document.querySelector('#canvasAgentMessages .canvas-agent-brief')
      return card && !card.querySelector('[data-agent-brief-question]')
    }, null, { timeout: 15000 })
    assert.equal((await page.evaluate(() => serializeCanvasBoard())).nodes.length, countBeforePhoneChoice,
      'selecting grass hills creates no node before final confirmation')
    assert.equal(await page.locator('#canvasAgentMessages [data-agent-confirmed-image-prompt]').inputValue(), naturalPhotoScenarios.phoneCase.image_prompt)
    assert.doesNotMatch(naturalPhotoScenarios.phoneCase.image_prompt, /建筑光廊|纤维纸|哑光空手机壳/,
      'the selected hill prompt clears the previous direction and preserves translucent product facts')
    assert.notEqual(naturalPhotoScenarios.phoneCase.image_prompt, confirmedPrompt, 'different products retain distinct photography plans')
    failNaturalConfirmOnce = true
    const beforeRecovery = naturalPhotoRequests.length
    await page.locator('#canvasAgentMessages [data-agent-workflow-choice="create_manually"]').click()
    await page.waitForFunction(() => document.querySelector('#canvasAgentStatus')?.textContent.includes('任务完成'), null, { timeout: 30000 })
    assert.ok(naturalPhotoRequests.length >= beforeRecovery + 2, 'failed confirmation request is retried')
    assert.equal([...board.nodes.values()].filter(node => node.nodeTitle === '自然美学产品摄影').length, 2,
      'recovered confirmation creates exactly one node for the new proposal')
    const caseNode = [...board.nodes.values()].find(node => node.prompt === naturalPhotoScenarios.phoneCase.image_prompt)
    assert.ok(caseNode, 'phone case uses its confirmed prompt')
    assert.equal(caseNode.model, naturalPhotoModel.id)
    assert.equal(caseNode.size, naturalPhotoScenarios.phoneCase.parameters.size)
    assert.equal(caseNode.resolution, naturalPhotoScenarios.phoneCase.parameters.resolution)
    assert.ok([...board.connections.values()].some(edge => edge.from === phoneCaseSourceId && edge.to === caseNode.id), 'phone case connects its own source')
    assert.ok(![...board.connections.values()].some(edge => edge.from === naturalPhotoBoard.sourceNodeId && edge.to === caseNode.id), 'phone case does not reference the previous keyboard')
    const twoProductBoard = await page.evaluate(() => serializeCanvasBoard())
    await page.evaluate(async savedBoard => { await openCanvasBoardFromHistory(savedBoard) }, twoProductBoard)
    const reopenedProducts = await page.evaluate(() => serializeCanvasBoard())
    for (const expected of [created, caseNode]) {
      const restored = reopenedProducts.nodes.find(node => node.id === expected.id)
      for (const key of ['prompt', 'model', 'modelSelection', 'size', 'resolution', 'platform']) assert.equal(restored?.[key], expected[key], `${key} survives reopening both products`)
      assert.equal(reopenedProducts.nodes.filter(node => node.id === expected.id).length, 1)
    }
    assert.ok(reopenedProducts.connections.some(edge => edge.from === phoneCaseSourceId && edge.to === caseNode.id))
    const countBeforeCancel = (await page.evaluate(() => serializeCanvasBoard())).nodes.length
    naturalPhotoScenario = naturalPhotoScenarios.keyboard
    await page.evaluate(async sourceId => {
      const source = ensureCanvasNodeMounted(sourceId)
      selectCanvasNode(source)
      await CanvasAgentUi.useSkill('natural-aesthetic-product-photography')
      document.querySelector('#canvasAgentPrompt').value = ''
      document.querySelector('#canvasAgentForm').requestSubmit()
    }, naturalPhotoBoard.sourceNodeId)
    await fillWizard('红色折叠键盘，便携办公产品')
    await page.waitForSelector('#canvasAgentMessages .canvas-agent-brief', { state: 'visible', timeout: 15000 })
    await page.locator('#canvasAgentMessages [data-agent-brief-cancel]').click()
    await page.waitForFunction(() => !document.querySelector('#canvasAgentMessages .canvas-agent-brief'), null, { timeout: 5000 })
    assert.equal((await page.evaluate(() => serializeCanvasBoard())).nodes.length, countBeforeCancel,
      'cancelling a proposal creates no node')
    assert.equal(paidJobRequests.length, 0, 'cancellation does not execute a paid request')
    dropPendingWorkflow = true
    await page.evaluate(() => {
      document.querySelector('#canvasAgentPrompt').value = '请重新分析产品摄影方案'
      document.querySelector('#canvasAgentForm').requestSubmit()
    })
    await fillWizard('红色折叠键盘，便携办公产品')
    await page.waitForFunction(() => document.querySelector('.canvas-agent-wizard')?.textContent.includes('方案保存失败'), null, { timeout: 15000 })
    assert.equal(await page.locator('#canvasAgentMessages .canvas-agent-brief').count(), 0,
      'a server that discards the checkpoint cannot produce a confirmable card')
    assert.equal((await page.evaluate(() => serializeCanvasBoard())).nodes.length, countBeforeCancel,
      'checkpoint failure does not create a node')
    dropPendingWorkflow = false
    mockNaturalPhotoRun = false
    mockGenericWizard = true
    const beforeGeneric = (await page.evaluate(() => serializeCanvasBoard())).nodes.length
    await page.evaluate(async () => {
      await CanvasAgentUi.useSkill('qa-skill')
      document.querySelector('#canvasAgentPrompt').value = '验证通用表单'
      document.querySelector('#canvasAgentForm').requestSubmit()
    })
    await page.waitForSelector('[data-agent-wizard-step="request"]')
    assert.equal(await page.locator('#agentWizard_request_text').inputValue(), '验证通用表单')
    assert.equal(await page.locator('[data-agent-wizard-field="channels"][data-value="web"]').getAttribute('aria-pressed'), 'true', 'schema default selects a card')
    assert.equal(await page.locator('#agentWizard_copy_text').count(), 0, 'a false field condition hides the input')
    await page.locator('[data-agent-wizard-field="channels"][data-value="social"]').click()
    assert.equal(await page.locator('[data-agent-wizard-field="channels"][aria-pressed="true"]').count(), 2, 'one card group supports multiple selected options')
    await page.locator('[data-agent-wizard-field="channels"][data-value="poster"]').click()
    assert.equal(await page.locator('[data-agent-wizard-field="channels"][aria-pressed="true"]').count(), 2, 'max_items prevents an extra selection')
    await page.locator('[data-agent-wizard-field="copy"][data-value="yes"]').click()
    await page.waitForSelector('#agentWizard_copy_text')
    await page.locator('[data-agent-wizard-action="next"]').click()
    assert.match(await page.locator('#canvasAgentStatus').innerText(), /准确文案/, 'conditional required fields block navigation')
    await page.locator('#agentWizard_copy_text').fill('通勤有型')
    await page.locator('[data-agent-wizard-action="next"]').click()
    await page.waitForSelector('[data-agent-wizard-step="social"]')
    await page.locator('#agentWizard_social_notes').fill('社交信息流首图')
    await page.locator('[data-agent-wizard-action="back"]').click()
    assert.equal(await page.locator('#agentWizard_copy_text').inputValue(), '通勤有型', 'back preserves conditional text')
    await page.locator('[data-agent-wizard-field="channels"][data-value="social"]').click()
    await page.locator('[data-agent-wizard-field="copy"][data-value="no"]').click()
    await page.locator('[data-agent-wizard-action="next"]').click()
    await page.waitForSelector('[data-agent-wizard-step="material"]')
    assert.match(await page.locator('[data-agent-wizard-progress]').innerText(), /2\s*\/\s*3/, 'hidden steps and the internal proposal stage do not inflate progress')
    await page.locator('[data-agent-wizard-action="back"]').click()
    await page.waitForSelector('[data-agent-wizard-step="request"]')
    await page.locator('[data-agent-wizard-field="channels"][data-value="social"]').click()
    await page.locator('[data-agent-wizard-action="next"]').click()
    await page.waitForSelector('[data-agent-wizard-step="social"]')
    assert.equal(await page.locator('#agentWizard_social_notes').inputValue(), '社交信息流首图', 'conditional skipping keeps prior answers for editing')
    await page.locator('[data-agent-wizard-action="next"]').click()
    await page.waitForSelector('[data-agent-wizard-step="material"]')
    await page.locator('[data-agent-wizard-action="next"]').click()
    await page.waitForSelector('[data-agent-wizard-step="output"]')
    await page.locator('[data-agent-wizard-field="size"][data-value="1:1"]').click()
    await page.locator('[data-agent-wizard-field="resolution"][data-value="1"]').click()
    await page.locator('[data-agent-wizard-action="next"]').click()
    await page.waitForSelector('[data-agent-brief-submit]', { timeout: 5000 })
    assert.match(await page.locator('.canvas-agent-brief > strong').innerText(), /确认通用方案/, 'the confirmation heading comes from Schema')
    assert.doesNotMatch(await page.locator('.canvas-agent-brief').innerText(), /默认应折叠的测试说明/,
      'Schema descriptions stay hidden unless explicitly enabled')
    assert.equal(await page.locator('[data-agent-workflow-choice="create_and_generate"]').count(), 1,
      'image workflows expose an explicit one-time create-and-generate choice')
    assert.equal(await page.locator('[data-agent-workflow-choice="create_manually"]').count(), 1,
      'image workflows keep a manual-generation choice')
    assert.equal(await page.locator('[data-agent-brief-revise]').innerText(), '调整后再创建',
      'adjust returns to editing without creating a node')
    assert.equal(savedConversations.get(naturalPhotoBoard.boardId).wizardDraft.values.audience, '城市通勤人群', 'Agent recommendations prefill only configured fields')
    assert.equal((await page.evaluate(() => serializeCanvasBoard())).nodes.length, beforeGeneric, 'a different configured Skill also waits for confirmation')
    assert.equal(savedConversations.get(naturalPhotoBoard.boardId)?.pendingWorkflow?.skillId, 'qa-skill', 'the shared confirmation checkpoint is bound to the configured Skill')
    const genericTaskId = savedConversations.get(naturalPhotoBoard.boardId).wizardDraft.taskId
    await page.locator('#canvasAgentSkillBook').click()
    await page.locator('[data-agent-skill="qa-skill"]').click()
    await page.waitForFunction(() => !document.querySelector('.canvas-agent-brief'))
    assert.equal((await page.evaluate(() => serializeCanvasBoard())).nodes.length, beforeGeneric, 'switching Skill clears confirmation without creating a node')
    await page.evaluate(async () => {
      await CanvasAgentUi.useSkill('qa-skill')
      document.querySelector('#canvasAgentPrompt').value = '继续验证通用表单'
      document.querySelector('#canvasAgentForm').requestSubmit()
    })
    await page.waitForSelector('[data-agent-wizard-step="output"]')
    await page.locator('[data-agent-wizard-action="back"]').click()
    await page.waitForSelector('[data-agent-wizard-step="material"]')
    await page.locator('[data-agent-wizard-action="back"]').click()
    await page.waitForSelector('[data-agent-wizard-step="social"]')
    await page.locator('[data-agent-wizard-action="back"]').click()
    await page.waitForSelector('[data-agent-wizard-step="request"]')
    assert.equal(await page.locator('[data-agent-wizard-field="channels"][aria-pressed="true"]').count(), 2, 'resuming keeps the prior multi-selection')
    assert.equal(await page.locator('#agentWizard_audience').inputValue(), '城市通勤人群', 'resuming keeps the saved AI prefill')
    await page.locator('[data-agent-wizard-action="next"]').click()
    await page.waitForSelector('[data-agent-wizard-step="social"]')
    await page.locator('[data-agent-wizard-action="next"]').click()
    await page.waitForSelector('[data-agent-wizard-step="material"]')
    await page.locator('[data-agent-wizard-action="next"]').click()
    await page.waitForSelector('[data-agent-wizard-step="output"]')
    await page.locator('[data-agent-wizard-field="size"][data-value="1:1"]').click()
    await page.locator('[data-agent-wizard-field="resolution"][data-value="1"]').click()
    await page.locator('[data-agent-wizard-action="next"]').click()
    await page.waitForSelector('[data-agent-brief-submit]')
    assert.equal(savedConversations.get(naturalPhotoBoard.boardId).wizardDraft.taskId, genericTaskId, 'returning to the configured Skill reuses its task')
    await page.locator('[data-agent-workflow-choice="create_manually"]').click()
    await page.waitForFunction(() => document.querySelector('#canvasAgentStatus')?.textContent.includes('任务完成'), null, { timeout: 15000 })
    const confirmedGenericBoard = await page.evaluate(() => serializeCanvasBoard())
    assert.equal(confirmedGenericBoard.nodes.length, beforeGeneric + 1, 'a different configured Skill creates one node after confirmation')
    assert.equal(confirmedGenericBoard.nodes.at(-1).agentNodeIdentityKey,
      `key:workflow:${genericTaskId}`, 'the created node persists its workflow idempotency key')
    assert.equal(savedConversations.get(naturalPhotoBoard.boardId)?.wizardDraft.status, 'completed')
    assert.equal(paidJobRequests.length, 0)

    await page.locator('#canvasAgentConversationButton').click()
    await page.locator('#canvasAgentNewConversation').click()
    await page.waitForFunction(() => document.querySelector('#canvasAgentConversationTitle')?.textContent === '当前对话')
    const contextReferenceRemovals = page.locator('#canvasAgentContext [data-agent-node-id] [data-remove-agent-context]')
    while (await contextReferenceRemovals.count()) {
      await contextReferenceRemovals.first().click()
    }
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('canvas:selectionchange', {
      detail: { selectedIds: [] },
    })))
    const beforeAutomatic = (await page.evaluate(() => serializeCanvasBoard())).nodes.length
    const priorGenerationCalls = paidJobRequests.length
    await page.evaluate(async () => {
      await CanvasAgentUi.useSkill('qa-skill')
      document.querySelector('#canvasAgentPrompt').value = '再次验证通用图片方案'
      document.querySelector('#canvasAgentForm').requestSubmit()
    })
    await page.waitForSelector('[data-agent-wizard-step="request"]')
    await page.locator('#agentWizard_request_text').fill('再次验证通用图片方案')
    await page.locator('[data-agent-wizard-action="next"]').click()
    await page.waitForSelector('[data-agent-wizard-step="material"]')
    await page.locator('[data-agent-wizard-action="next"]').click()
    await page.waitForSelector('[data-agent-wizard-step="output"]')
    await page.locator('[data-agent-wizard-field="size"][data-value="1:1"]').click()
    await page.locator('[data-agent-wizard-field="resolution"][data-value="1"]').click()
    await page.locator('[data-agent-wizard-action="next"]').click()
    await page.waitForSelector('[data-agent-brief-submit]')
    await page.locator('[data-agent-workflow-choice="create_and_generate"]').click()
    await page.waitForFunction(() => document.querySelector('#canvasAgentStatus')?.textContent.includes('图片生成失败'), null, { timeout: 15000 })
    await waitForPaidJobRequests(priorGenerationCalls + 1)
    assert.equal((await page.evaluate(() => serializeCanvasBoard())).nodes.length, beforeAutomatic + 1,
      'auto-generation creates exactly one retained node')
    assert.equal(paidJobRequests.length, priorGenerationCalls + 1,
      'the explicit confirmation submits exactly one isolated generation request')
    assert.equal(savedConversations.get(naturalPhotoBoard.boardId)?.pendingWorkflow?.generationState, 'failed',
      'generation failure is stored separately while the node remains available')
    await page.locator('[data-agent-generation-retry]').click()
    await page.waitForFunction(() => document.querySelector('#canvasAgentStatus')?.textContent.includes('图片生成失败'), null, { timeout: 15000 })
    await waitForPaidJobRequests(priorGenerationCalls + 2)
    assert.equal((await page.evaluate(() => serializeCanvasBoard())).nodes.length, beforeAutomatic + 1,
      'retry uses the existing workflow node instead of creating a duplicate')
    assert.equal(paidJobRequests.length, priorGenerationCalls + 2,
      'a failed attempt can only be retried through its explicit retry control')
    const previousSession = savedConversations.get(naturalPhotoBoard.boardId)
    const previousSessionId = previousSession.conversationId
    const previousUserMessage = previousSession.items.find(item => item.role === 'user')?.text
    const beforeSessionSwitch = (await page.evaluate(() => serializeCanvasBoard())).nodes.length
    await page.locator('#canvasAgentConversationButton').click()
    await page.waitForSelector(`#canvasAgentHistoryList [data-agent-conversation="${previousSessionId}"]`)
    await page.screenshot({ path: path.join(isolatedVisualDir, 'conversation-history.png') })
    await page.locator('#canvasAgentNewConversation').click()
    await page.waitForFunction(() => document.querySelector('#canvasAgentConversationTitle')?.textContent === '当前对话')
    assert.equal(savedConversations.get(naturalPhotoBoard.boardId).items.length, 0,
      'a new session starts with an empty message history')
    assert.equal((await page.evaluate(() => serializeCanvasBoard())).nodes.length, beforeSessionSwitch,
      'new sessions do not remove or replace canvas nodes')
    await page.locator('#canvasAgentConversationButton').click()
    await page.locator('#canvasAgentHistorySearch').fill(previousUserMessage.slice(0, 24))
    await page.locator(`#canvasAgentHistoryList [data-agent-conversation="${previousSessionId}"]`).click()
    await page.waitForFunction(expected => (
      document.querySelector('#canvasAgentMessages')?.textContent.includes(expected)
    ), previousUserMessage)
    assert.equal(savedConversations.get(naturalPhotoBoard.boardId).conversationId, previousSessionId,
      'switching back restores the previous session')
    assert.equal((await page.evaluate(() => serializeCanvasBoard())).nodes.length, beforeSessionSwitch,
      'restoring a session does not replay old node creation or generation')
    mockGenericWizard = false
    assert.deepEqual(errors, [])
    console.log('PASS: isolated wizard, two-product confirmation, permission/save retry, restore and ordinary Skill checks', { paidRequests: paidJobRequests.length, screenshots: isolatedVisualDir })
  } catch (error) {
    console.error('Agent failure evidence', JSON.stringify({
      naturalPhotoRequestCount: naturalPhotoRequests.length,
      savedConversations: [...savedConversations.entries()].map(([boardId, conversation]) => ({
        boardId,
        revision: conversation.revision,
        pendingStatus: conversation.pendingWorkflow?.status || null,
        pendingSourceNodeIds: conversation.pendingWorkflow?.sourceNodeIds || [],
        pendingFingerprintLength: conversation.pendingWorkflow?.sourceFingerprint?.length || 0,
      })),
      wizardToolSteps: await page.locator('.canvas-agent-tool-step').evaluateAll(steps => steps.map(step => ({
        tool: step.dataset.toolName,
        status: step.querySelector('.canvas-agent-tool-status')?.dataset.status,
        detail: step.querySelector('.canvas-agent-tool-detail')?.textContent,
      }))).catch(() => []),
      recentRequests: agentRequests.slice(-6).map(request => ({
        step: request.step,
        skillId: request.skill_id,
        prompt: String(request.prompt || '').slice(0, 180),
        toolOutputs: (request.tool_outputs || []).map(item => ({
          tool: item.output?.tool,
          ok: item.output?.ok,
          code: item.output?.code,
          workflow: item.output?.workflow,
          skillId: item.output?.skill_id,
          decisionRequired: item.output?.decision_required,
          error: item.output?.error,
        })),
      })),
      ui: await page.evaluate(() => ({
        status: document.querySelector('#canvasAgentStatus')?.textContent,
        messages: document.querySelector('#canvasAgentMessages')?.innerText?.slice(-4000),
        activeSkillId: window.CanvasAgentUi?.getActiveSkillId?.(),
        selectedNodes: [...document.querySelectorAll('#canvasPlane .canvas-node.is-selected')].map(node => ({
          id: node.dataset.id,
          output: window.getCanvasNodeOutput?.(node) || null,
        })),
        context: document.querySelector('#canvasAgentContext')?.innerText,
        input: document.querySelector('#canvasAgentPrompt')?.value,
        skillRun: window.CanvasAgentUi?.getSkillWorkflowContext?.(),
      })).catch(() => null),
      errors,
    }))
    throw error
  } finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
