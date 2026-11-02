import { createId } from './id'

export type AssetType = 'character' | 'scene' | 'prop'
export type CharacterLayout = 'four-views' | 'character-sheet'
export type ProductionStage = 'assets' | 'storyboards' | 'videos'
export type ReferenceMode = 'first-frame' | 'first-last-frame' | 'reference'
export type ProductionReference = { assetId?: string; nodeId?: string; src: string; shotId?: string }
export type ProductionShot = { id: string; number: number; duration: number; assetIds: string[]; description: string; framing: string; blocking: string; camera: string; lighting: string; dialogue: string; sound: string; imagePrompt: string; videoPrompt: string }
export type ProductionAsset = { id: string; type: AssetType; name: string; description: string; prompt: string; nodeId?: string; selectedSrc?: string; manualSelectedSrc?: boolean; references: string[]; shotIds: string[]; layout?: CharacterLayout }
export type ProductionStoryboard = { id: string; shotIds: string[]; assetIds: string[]; prompt: string; nodeId?: string; references: ProductionReference[]; groupMode: string; derivedSource?: string; manualPrompt?: boolean }
export type ProductionVideo = { id: string; shotIds: string[]; storyboardId: string; prompt: string; nodeId?: string; referenceMode: ReferenceMode; references: ProductionReference[]; duration?: number; derivedSource?: string; manualPrompt?: boolean; manualReferences?: boolean; needsUpdate?: boolean }
export type ProductionWorkflow = { version: 1; title: string; source: string; settings: { textModel: string; imageModel: string; videoModel: string; ratio: string; style: string; targetDuration: number; characterLayout?: CharacterLayout; resolution?: string; videoResolution?: string; imageQuality?: string }; shots: ProductionShot[]; assets: ProductionAsset[]; storyboards: ProductionStoryboard[]; videos: ProductionVideo[]; warnings: string[] }
export type ProductionModel = { id: string; displayName?: string; referenceModes?: ReferenceMode[]; durations?: number[]; ratios?: string[]; resolutions?: string[]; qualities?: string[] }
export type ProductionNode = { id: string; prompt?: string; model?: string; src?: string; status?: string; error?: string }
export type ProductionSnapshot = { workflow: ProductionWorkflow; nodes: Record<string, ProductionNode>; models: { text: ProductionModel[]; image: ProductionModel[]; video: ProductionModel[] }; readOnly: boolean }
export type ProductionAction = 'snapshot' | 'save' | 'prepare-assets' | 'prepare-storyboards' | 'prepare-videos' | 'run' | 'focus' | 'close'

export const STAGE_RULES = {
  script: '你是剧本拆解与分镜助手。保留原文剧情、对白、消息和字幕。区分原文事实与补充设定，冲突放入 warnings。实体只识别实际可见人物、场景、道具；服装或状态变化以版本表达。引用使用实体 ID，不把每次出现识别为新资产。只返回结构化内容，不运行图片或视频任务。',
  assets: '资产设定与提示词：建立一致的人物外观、服装、场景布局与道具状态。人物四视图为正面、侧面、背面、脸部特写；人设图展示整体、服装、配饰、细节。准确文字保留为原文记录，不承诺随机生图文字准确。仅准备提示词，生成必须由用户发送。',
  storyboards: '故事板提示词与参考编排：逐镜保留构图、人物调度、光线和剧情事实。多镜按镜头顺序分格，不合并剧情；参考必须是相关资产当前采用的真实图片。缺失图片列出名称。只准备图片节点，不运行图片任务。',
  videos: '视频提示词与模型适配：保留原镜头顺序，明确动作时间顺序和运镜。计划时长与实际生成时长分别保存。默认每镜一个视频，多格故事板必须明确选择对应单帧，不默认整张拼版为首帧。按所选模型支持的参考方式准备；不自动运行、配音、字幕或合并。',
}

export function emptyWorkflow(): ProductionWorkflow {
  return { version: 1, title: '脚本制作', source: '', settings: { textModel: '', imageModel: '', videoModel: '', ratio: '16:9', style: '', targetDuration: 60 }, shots: [], assets: [], storyboards: [], videos: [], warnings: [] }
}
export function productionSaveWorkflow(workflow: ProductionWorkflow, selectedAssets: ReadonlySet<string>): ProductionWorkflow {
  return { ...workflow, assets: workflow.assets.map(asset => selectedAssets.has(asset.id) ? { ...asset, manualSelectedSrc: true } : { ...asset, selectedSrc: undefined, manualSelectedSrc: false }) }
}
export function consumeAnalysisQuery(): boolean {
  const params = new URLSearchParams(location.search)
  if (params.get('analyze') !== '1') return false
  params.delete('analyze')
  window.history.replaceState(window.history.state, '', `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`)
  return true
}
const safeId = (value: unknown) => typeof value === 'string' && /^[\w-]{1,120}$/.test(value)
const string = (value: unknown, max = 16000) => typeof value === 'string' ? value.slice(0, max) : ''
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
export function mediaSource(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 20000000) return ''
  try { const url = new URL(value, location.origin); return ['http:', 'https:'].includes(url.protocol) || /^data:image\/(png|jpeg|webp);base64,/.test(value) ? value : '' } catch { return '' }
}

/** Validate the complete model response before assigning business IDs or touching canvas. */
export function parseScriptReply(reply: string, previous: ProductionWorkflow): ProductionWorkflow {
  const clean = reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  let raw: Record<string, unknown>
  try { raw = record(JSON.parse(clean)) } catch { throw new Error('文本模型返回的内容不是完整 JSON。请重新分析，原分镜未修改。') }
  if (!Array.isArray(raw.shots) || !raw.shots.length || raw.shots.length > 200 || !Array.isArray(raw.assets) || raw.assets.length > 300) throw new Error('分镜或资产清单缺失，或数量超过限制（200 镜 / 300 项资产）。请重新分析。')
  const seen = new Set<string>(); const mapping = new Map<string, string>()
  const assets = raw.assets.map(value => {
    const item = record(value)
    if (!safeId(item.id) || seen.has(String(item.id)) || !['character', 'scene', 'prop'].includes(String(item.type)) || !string(item.name).trim() || !string(item.prompt).trim()) throw new Error('资产 ID、名称、类型或提示词无效。请重新分析。')
    seen.add(String(item.id))
    const old = previous.assets.find(a => a.type === item.type && a.name === item.name)
    const id = old?.id || createId(); mapping.set(String(item.id), id)
    return { ...old, id, type: item.type as AssetType, name: string(item.name, 120), description: string(item.description), prompt: string(item.prompt), references: old?.references || [], shotIds: [] } as ProductionAsset
  })
  const shotSeen = new Set<string>(); const matchedShots = new Set<string>()
  const shots = raw.shots.map((value, index) => {
    const item = record(value)
    if (['description', 'framing', 'blocking', 'camera', 'lighting', 'dialogue', 'sound', 'imagePrompt', 'videoPrompt'].some(field => typeof item[field] !== 'string')) throw new Error(`第 ${index + 1} 镜缺少必要字段或字段类型错误。请重新分析。`)
    if (!safeId(item.id) || shotSeen.has(String(item.id)) || !Array.isArray(item.assetIds) || item.assetIds.some(id => !mapping.has(String(id))) || !string(item.description).trim() || typeof item.duration !== 'number' || !Number.isFinite(item.duration) || item.duration <= 0 || item.duration > 600) throw new Error(`第 ${index + 1} 镜的 ID、时长、画面或资产引用无效。请重新分析。`)
    shotSeen.add(String(item.id))
    const assetIds = [...new Set(item.assetIds.map(ref => mapping.get(String(ref))!))]
    const old = previous.shots.find(shot => !matchedShots.has(shot.id) && shot.description.trim() === string(item.description).trim() && shot.dialogue.trim() === string(item.dialogue).trim() && [...shot.assetIds].sort().join('|') === [...assetIds].sort().join('|'))
    const id = old?.id || createId()
    if (old) matchedShots.add(old.id)
    for (const asset of assets) if (assetIds.includes(asset.id)) asset.shotIds.push(id)
    return { id, number: index + 1, duration: item.duration, assetIds, description: string(item.description), framing: string(item.framing), blocking: string(item.blocking), camera: string(item.camera), lighting: string(item.lighting), dialogue: string(item.dialogue), sound: string(item.sound), imagePrompt: string(item.imagePrompt), videoPrompt: string(item.videoPrompt) }
  })
  const storyboards = previous.storyboards.filter(item => item.shotIds.every(id => shots.some(shot => shot.id === id)))
  return { ...previous, title: string(raw.title, 120) || previous.title, shots, assets, warnings: Array.isArray(raw.warnings) ? raw.warnings.filter(x => typeof x === 'string').map(x => string(x, 1000)) : [], storyboards, videos: previous.videos.filter(item => item.shotIds.every(id => shots.some(shot => shot.id === id)) && storyboards.some(board => board.id === item.storyboardId)) }
}

/** Model content can only update prompts for exactly the requested entity set. */
export function parsePreparationReply(reply: string, expectedIds: string[]): Map<string, string> {
  let raw: Record<string, unknown>
  try { raw = record(JSON.parse(reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''))) } catch { throw new Error('提示词整理结果不是完整 JSON。原内容已保留，请重试。') }
  if (!Array.isArray(raw.items) || raw.items.length !== expectedIds.length || Object.keys(raw).some(key => key !== 'items')) throw new Error('提示词整理结果数量或结构不匹配。请重试。')
  const prompts = new Map<string, string>()
  for (const value of raw.items) {
    const item = record(value)
    if (typeof item.id !== 'string' || !expectedIds.includes(item.id) || prompts.has(item.id) || typeof item.prompt !== 'string' || !item.prompt.trim() || item.prompt.length > 16000 || Object.keys(item).some(key => !['id', 'prompt'].includes(key))) throw new Error('提示词整理结果的实体 ID、内容或字段无效。请重试。')
    prompts.set(item.id, item.prompt.trim())
  }
  return prompts
}

export function assetSource(asset: ProductionAsset, nodes: ProductionSnapshot['nodes']) { return mediaSource(asset.selectedSrc || (asset.nodeId && nodes[asset.nodeId]?.src) || '') }
export function prepareStoryboards(workflow: ProductionWorkflow, nodes: ProductionSnapshot['nodes'], mode: string): ProductionWorkflow {
  const size = mode === '2' ? 2 : mode === '3' ? 3 : mode === 'auto' ? 2 : 1
  const groups: ProductionShot[][] = []
  for (const shot of workflow.shots) {
    const last = groups[groups.length - 1]
    const currentScene = shot.assetIds.filter(id => workflow.assets.find(a => a.id === id)?.type === 'scene').join('|')
    const lastScene = last?.[0].assetIds.filter(id => workflow.assets.find(a => a.id === id)?.type === 'scene').join('|')
    if (!last || last.length >= size || (mode === 'auto' && currentScene !== lastScene)) groups.push([shot]); else last.push(shot)
  }
  const storyboards = groups.map(shots => {
    const shotIds = shots.map(s => s.id); const assetIds = [...new Set(shots.flatMap(s => s.assetIds))]
    const old = workflow.storyboards.find(s => s.shotIds.join('|') === shotIds.join('|'))
    const references = assetIds.flatMap(id => { const asset = workflow.assets.find(a => a.id === id)!; const src = assetSource(asset, nodes); return src ? [{ assetId: id, nodeId: asset.nodeId, src }] : [] })
    const prompt = `画幅：${workflow.settings.ratio}；风格：${workflow.settings.style || '沿用资产风格'}。${shots.length > 1 ? `按镜头顺序制作 ${shots.length} 格故事板，各格清晰分隔。` : '制作单镜静态画面。'}\n${shots.map(s => `第${s.number}镜：${s.imagePrompt || s.description}\n构图：${s.framing}；调度：${s.blocking}；光线：${s.lighting}`).join('\n')}`
    const derivedSource = JSON.stringify({ shots, ratio: workflow.settings.ratio, style: workflow.settings.style, references, mode })
    return { ...old, id: old?.id || createId(), shotIds, assetIds, references, prompt: old?.manualPrompt || old?.derivedSource === derivedSource ? old.prompt : prompt, derivedSource, groupMode: mode }
  })
  const videos = workflow.videos.flatMap(video => {
    const storyboard = storyboards.find(board => video.shotIds.every(id => board.shotIds.includes(id)))
    if (!storyboard) return []
    return [{ ...video, storyboardId: storyboard.id, ...(video.storyboardId !== storyboard.id ? { references: [], manualReferences: false, needsUpdate: true } : {}) }]
  })
  return { ...workflow, storyboards, videos }
}
export function prepareVideos(workflow: ProductionWorkflow, nodes: ProductionSnapshot['nodes']): ProductionWorkflow {
  const videos = workflow.shots.map(shot => {
    const storyboard = workflow.storyboards.find(s => s.shotIds.includes(shot.id))
    const old = workflow.videos.find(v => v.shotIds.length === 1 && v.shotIds[0] === shot.id)
    const src = storyboard?.nodeId ? mediaSource(nodes[storyboard.nodeId]?.src) : ''
    const sameStoryboard = old?.storyboardId === storyboard?.id
    const manualReferences = Boolean(old?.manualReferences && sameStoryboard)
    const references = manualReferences ? old!.references : (src && storyboard?.shotIds.length === 1 ? [{ nodeId: storyboard.nodeId, src, shotId: shot.id }] : [])
    const derivedSource = JSON.stringify({ shot, style: workflow.settings.style, ratio: workflow.settings.ratio, storyboardId: storyboard?.id, references })
    const prompt = `第${shot.number}镜（计划${shot.duration}秒）：${shot.videoPrompt || shot.description}\n动作：${shot.blocking}；运镜：${shot.camera}；风格：${workflow.settings.style}`
    return { ...old, id: old?.id || createId(), shotIds: [shot.id], storyboardId: storyboard?.id || '', prompt: old?.manualPrompt || old?.derivedSource === derivedSource ? old.prompt : prompt, derivedSource, referenceMode: old?.referenceMode || 'first-frame' as ReferenceMode, references, manualReferences, needsUpdate: !references.length, duration: old?.duration }
  })
  return { ...workflow, videos }
}
export function storyboardMissing(item: ProductionStoryboard, workflow: ProductionWorkflow, nodes: ProductionSnapshot['nodes']) { return item.assetIds.filter(id => { const asset = workflow.assets.find(a => a.id === id); return !asset || !assetSource(asset, nodes) }).map(id => workflow.assets.find(a => a.id === id)?.name || '已删除资产') }
export function referenceChanged(item: ProductionStoryboard, workflow: ProductionWorkflow, nodes: ProductionSnapshot['nodes']) { return item.references.some(ref => { const asset = workflow.assets.find(a => a.id === ref.assetId); return asset && assetSource(asset, nodes) !== ref.src }) }

export function productionRequest(action: ProductionAction, payload: unknown = {}, timeout = 30000): Promise<ProductionSnapshot> {
  if (window.parent === window) return Promise.reject(new Error('制作工作台需要从画布中的脚本节点打开。请返回画布后重试。'))
  const params = new URLSearchParams(location.search); const boardId = params.get('boardId'); const nodeId = params.get('nodeId')
  if (!boardId || !nodeId) return Promise.reject(new Error('脚本节点或画布信息缺失。请关闭工作台并重新打开。'))
  return new Promise((resolve, reject) => {
    const requestId = createId()
    const cleanup = () => { clearTimeout(timer); window.removeEventListener('message', receive) }
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== window.parent || event.data?.type !== 'neon:production-response' || event.data?.requestId !== requestId) return
      cleanup()
      if (event.data.error) reject(new Error(typeof event.data.error === 'string' ? event.data.error : '画布操作失败，请重试。'))
      else resolve(event.data.data as ProductionSnapshot)
    }
    const timer = setTimeout(() => { cleanup(); reject(new Error('画布响应超时，输入已保留。请重试或重新打开工作台。')) }, timeout)
    window.addEventListener('message', receive)
    window.parent.postMessage({ type: 'neon:production-request', requestId, boardId, nodeId, action, payload }, location.origin)
  })
}
