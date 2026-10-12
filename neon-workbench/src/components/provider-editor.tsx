import { useEffect, useRef, useState } from "react"
import { ArrowDown, ArrowUp, Check, ChevronDown, Copy, Eye, EyeOff, Plus, Square, SquareCheck, SquareMinus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { request, publishModelsChanged } from "@/lib/api"
import type { Provider } from "@/lib/api"
import { ModelConfiguration } from "./provider-model-settings"
import { ModelTest, ProviderVerification } from "./provider-diagnostics"
export type ProviderModel = { id: string; displayName?: string; alias?: string; protocol?: string; capabilities?: string[]; metadata?: Record<string, any>; sortOrder?: number; [key: string]: unknown }
export type ProviderConnection = Omit<Provider, "models"> & { protocol?: string; providerProtocol?: string; metadata?: Record<string, any>; hasApiKey?: boolean; models?: ProviderModel[] }
export type ProviderProtocol = { id: string; label?: string; name?: string; scope?: string; scopes?: string[]; platformVisible?: boolean; modelVisible?: boolean; modelLabel?: string }
const categories = [["all", "全部"], ["chat", "对话"], ["image", "图片"], ["video", "视频"], ["audio", "音频"], ["other", "其他"]]
function inCategory(model: ProviderModel, category: string) {
  const caps = model.capabilities || []
  const matches = (type: string) => caps.some(value => type === "chat" ? value.startsWith("llm.") : value.startsWith(`${type}.`))
  return category === "all" || (category === "other" ? !["chat", "image", "video", "audio"].some(matches) : matches(category))
}
function normalize(models: unknown[]): ProviderModel[] {
  const unique = new Map<string, ProviderModel>()
  for (const value of models) { const model = typeof value === "string" ? { id: value } : value as ProviderModel; const id = String(model?.id || "").trim(); if (id && !unique.has(id)) unique.set(id, { ...model, id }) }
  return [...unique.values()]
}
function chineseError(error: unknown) { const message = (error as Error).message; return /[\u4e00-\u9fff]/.test(message) ? message : "操作失败，请检查服务配置后重试。" }
export function ProviderEditor({ provider, protocols, modelProtocols, onClose, onSaved, notify }: { provider: ProviderConnection; protocols: ProviderProtocol[]; modelProtocols?: ProviderProtocol[]; onClose: () => void; onSaved: () => void | Promise<void>; notify: (text: string) => void }) {
  const [draft, setDraft] = useState<ProviderConnection>(() => structuredClone(provider))
  const [apiKey, setApiKey] = useState("")
  const [secretState, setSecretState] = useState(provider.id ? "loading" : "ready")
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState("")
  const [feedback, setFeedback] = useState("")
  const [action, setAction] = useState("")
  const [remove, setRemove] = useState(false)
  const [manual, setManual] = useState("")
  const [invalidParameters, setInvalidParameters] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<ProviderModel[] | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [markedModels, setMarkedModels] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("all")
  const [jimeng, setJimeng] = useState<Record<string, any> | null>(null)
  const [busyDiagnostics, setBusyDiagnostics] = useState<Record<string, boolean>>({})
  const [matching, setMatching] = useState(false)
  const [resolutionCatalog, setResolutionCatalog] = useState<Record<string, any>[]>([])
  const [resolutionError, setResolutionError] = useState("")
  const inferenceSerial = useRef(0)
  const draftRef = useRef(draft); draftRef.current = draft
  const controller = useRef(new AbortController())
  const alive = useRef(true)
  const models = draft.models || []
  const markedSet = new Set(markedModels)
  const markedIds = models.filter(model => markedSet.has(model.id)).map(model => model.id)
  const allMarked = models.length > 0 && markedIds.length === models.length
  const saving = action === "save" || action === "delete"
  const ready = secretState === "ready"
  const diagnosing = Object.values(busyDiagnostics).some(Boolean)
  function diagnosticBusy(id: string, busy: boolean) { setBusyDiagnostics(previous => previous[id] === busy ? previous : { ...previous, [id]: busy }) }
  function resolutionOptions(model: ProviderModel): string[] { const entry = resolutionCatalog.find(item => (item.modelId || String(item.id || "").split("::").pop()) === model.id && (!item.providerId || item.providerId === draft.id)); return Array.isArray(entry?.resolutions) ? entry.resolutions.map(String) : [] }
  function modelProtocolLabel(model: ProviderModel) { const value = model.protocol || draft.protocol || "openai"; const entry = [...(modelProtocols || []), ...protocols].find(item => item.id === value); return entry?.modelLabel || entry?.label || entry?.name || (value === "openai" ? "OpenAI 兼容" : value) }
  function modelCategory(model: ProviderModel) { return [["image", "图像"], ["chat", "对话"], ["video", "视频"], ["audio", "音频"]].find(([id]) => inCategory(model, id))?.[1] || "其他" }
  useEffect(() => {
    alive.current = true
    controller.current = new AbortController()
    void readSecret()
    const signal = controller.current.signal
    void request<{ models: Record<string, any>[] }>("/api/image-models", "GET", undefined, signal).then(data => { if (alive.current && !signal.aborted) { if (!Array.isArray(data.models)) throw new Error("分辨率目录未返回有效数据，请重新打开设置后重试。"); setResolutionCatalog(data.models) } }).catch(error => { if (alive.current && !signal.aborted) setResolutionError(`读取分辨率选项失败。${chineseError(error)}`) })
    return () => { alive.current = false; controller.current.abort() }
  }, [])
  async function readSecret() {
    if (!provider.id || provider.hasApiKey === false) { setSecretState("ready"); return }
    const signal = controller.current.signal
    setSecretState("loading"); setError("")
    try { const result = await request<{ apiKey: string }>(`/api/providers/${encodeURIComponent(provider.id)}/secret`, "POST", {}, signal); if (alive.current && !signal.aborted) { setApiKey(result.apiKey || ""); setSecretState("ready") } }
    catch (e) { if (alive.current && !signal.aborted) { setSecretState("error"); setError(`读取已保存密钥失败。${chineseError(e)}`) } }
  }
  function close() { if (saving) return; alive.current = false; controller.current.abort(); setApiKey(""); onClose() }
  function payload() { return { ...draft, protocol: draft.protocol || "openai", apiKey, clearApiKey: apiKey === "", networkMode: draft.metadata?.networkMode || "auto", models: models.map((model, index) => ({ ...model, sortOrder: index })) } }
  async function matchProtocols(snapshot: ProviderConnection, ids?: string[]) {
    const current = ++inferenceSerial.current
    const candidates = (snapshot.models || []).filter(model => !ids || ids.includes(model.id))
    if (!candidates.length) { setMatching(false); return }
    setMatching(true)
    try {
      const data = await request<{ models: ProviderModel[] }>("/api/providers/infer-protocols", "POST", { baseUrl: snapshot.baseUrl, protocol: snapshot.protocol, models: candidates.map(model => ({ ...model, protocol: model.metadata?.protocolOverride ? model.protocol : "" })) }, controller.current.signal)
      if (!alive.current || current !== inferenceSerial.current || snapshot.baseUrl !== draftRef.current.baseUrl || snapshot.protocol !== draftRef.current.protocol) return
      if (!Array.isArray(data.models)) throw new Error("自动匹配模型协议失败，请检查平台协议后重试。")
      setDraft(previous => ({ ...previous, models: previous.models?.map(model => { const source = candidates.find(item => item.id === model.id); const inferred = data.models.find(item => item.id === model.id); return source && inferred && !model.metadata?.protocolOverride && JSON.stringify(source.capabilities) === JSON.stringify(model.capabilities) ? { ...model, protocol: inferred.protocol } : model }) }))
    } catch (error) { if (alive.current && current === inferenceSerial.current) setError(chineseError(error)) }
    finally { if (alive.current && current === inferenceSerial.current) setMatching(false) }
  }
  function updateModel(id: string, patch: Partial<ProviderModel>) { const snapshot = { ...draftRef.current, models: draftRef.current.models?.map(model => model.id === id ? { ...model, ...patch } : model) }; setDraft(snapshot); if (patch.capabilities || patch.protocol === "") void matchProtocols(snapshot, [id]) }
  function addModels(found: ProviderModel[]) { setDraft(previous => { const existing = previous.models || []; const ids = new Set(existing.map(model => model.id)); return { ...previous, models: [...existing, ...found.filter(model => !ids.has(model.id) && Boolean(ids.add(model.id)))] } }) }
  function removeModels(ids: string[]) {
    const removed = new Set(ids)
    setDraft(previous => ({ ...previous, models: previous.models?.filter(model => !removed.has(model.id)) }))
    setMarkedModels(previous => previous.filter(id => !removed.has(id)))
    setExpanded(previous => previous && removed.has(previous) ? null : previous)
    setInvalidParameters(previous => Object.fromEntries(Object.entries(previous).filter(([id]) => !removed.has(id))))
  }
  async function run(name: string, operation: () => Promise<void>) {
    if (action) return
    setAction(name); setError(""); setFeedback("")
    try { await operation() } catch (e) { if (alive.current) setError(chineseError(e)) } finally { if (alive.current) setAction("") }
  }
  async function discover() {
    await run("discover", async () => {
      const data = await request<{ modelConfigurations?: ProviderModel[]; models?: unknown[] }>("/api/providers/models", "POST", { provider: payload() }, controller.current.signal)
      if (alive.current) { setCandidates(normalize(data.modelConfigurations || data.models || [])); setSelected([]); setQuery(""); setCategory("all") }
    })
  }
  async function cli(name: string) {
    await run(`jimeng-${name}`, async () => {
      const data = await request<Record<string, any>>(`/api/jimeng-cli/${name}`, name === "status" ? "GET" : "POST", name === "status" ? undefined : {}, controller.current.signal)
      if (!alive.current) return
      setJimeng(data.status || data.cli || data)
      if (name === "models") { setCandidates(normalize(data.models || [])); setSelected([]); setQuery(""); setCategory("all") }
      else setFeedback(data.status?.message || data.message || "即梦状态已刷新。")
    })
  }
  const protocolOptions = protocols.filter(item => item.id !== "comfyui" && item.platformVisible !== false)
  function protocolSelect(value: string, onChange: (value: string) => void, label: string, modelScope = false) { const options = modelScope ? (modelProtocols || protocols.filter(item => item.modelVisible !== false)) : protocolOptions; return <NativeSelect aria-label={label} className="mt-2" value={value} onChange={e => onChange(e.target.value)}>{modelScope && <option value="">跟随平台协议</option>}<option value="openai">OpenAI 兼容</option>{options.filter(item => item.id !== "openai").map(item => <option key={item.id} value={item.id}>{(modelScope ? item.modelLabel : item.label) || item.label || item.name || item.id}</option>)}{value && value !== "openai" && !options.some(item => item.id === value) && <option value={value}>{value}</option>}</NativeSelect> }
  return <Dialog open onOpenChange={open => { if (!open) close() }}><DialogContent showCloseButton={!saving} className="max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-4xl overflow-y-auto p-4 sm:p-6"><DialogHeader className="pr-8"><DialogTitle>{provider.id ? "管理模型服务" : "添加模型服务"}</DialogTitle><DialogDescription>所有修改在保存后生效。密钥仅在当前编辑窗口内存中保留。</DialogDescription></DialogHeader>
    <form className="min-w-0 space-y-5" onSubmit={event => { event.preventDefault(); if (!ready || diagnosing || matching || models.some(model => invalidParameters[model.id])) return; void run("save", async () => { const data = await request<{ catalogRevision?: number }>("/api/providers", "POST", { ...payload(), id: draft.id || crypto.randomUUID() }, controller.current.signal); if (!alive.current) return; publishModelsChanged(data.catalogRevision); setApiKey(""); notify("服务设置已保存。"); onClose(); await onSaved() }) }}>
      <label className="block text-sm">服务名称<Input className="mt-2" required value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm">平台协议{protocolSelect(draft.protocol || "openai", protocol => { const snapshot = { ...draft, protocol }; setDraft(snapshot); setJimeng(null); void matchProtocols(snapshot) }, "平台协议")}</label><label className="block text-sm">网络线路<NativeSelect className="mt-2" aria-label="网络线路" value={draft.metadata?.networkMode || "auto"} onChange={e => setDraft({ ...draft, metadata: { ...draft.metadata, networkMode: e.target.value } })}><option value="auto">自动</option><option value="direct">直连</option><option value="proxy">代理</option></NativeSelect></label></div>
      <label className="block text-sm">接口地址<Input className="mt-2" type="url" value={draft.baseUrl || ""} placeholder="https://服务地址/v1" onBlur={() => { if (draft.baseUrl !== provider.baseUrl) void matchProtocols(draft) }} onChange={e => setDraft({ ...draft, baseUrl: e.target.value })} /></label>
      <div><label className="block text-sm" htmlFor="provider-api-key">API 密钥</label><div className="mt-2 flex min-w-0 gap-2"><Input id="provider-api-key" className="min-w-0 flex-1" autoComplete="new-password" type={visible ? "text" : "password"} disabled={!ready} value={apiKey} placeholder={secretState === "loading" ? "正在读取密钥…" : "输入服务密钥"} onChange={e => setApiKey(e.target.value)} /><Button type="button" variant="outline" size="icon" title={visible ? "隐藏密钥" : "显示密钥"} aria-label={visible ? "隐藏密钥" : "显示密钥"} disabled={!ready} onClick={() => setVisible(!visible)}>{visible ? <EyeOff /> : <Eye />}</Button><Button type="button" variant="outline" size="icon" title="复制完整密钥" aria-label="复制完整密钥" disabled={!ready || !apiKey} onClick={() => void run("copy", async () => { await navigator.clipboard.writeText(apiKey); if (alive.current) setFeedback("完整密钥已复制。") })}><Copy /></Button></div><p className="mt-2 text-xs text-muted-foreground">清空后保存会删除已保存密钥。</p>{secretState === "error" && <Button className="mt-2" type="button" variant="outline" onClick={() => void readSecret()}>重试读取密钥</Button>}</div>
      <ProviderVerification provider={payload()} protocols={protocols} disabled={!ready || Boolean(action)} discovering={action === "discover"} onDiscover={() => void discover()} onBusy={busy => diagnosticBusy("connection", busy)} />
      {draft.protocol === "cli:jimeng" && <Card><CardHeader><CardTitle className="text-sm">即梦 CLI</CardTitle><CardDescription>复用本机官方客户端登录状态。</CardDescription></CardHeader><CardContent className="space-y-3"><Badge variant="secondary">{jimeng?.signedIn ? "已登录" : jimeng?.state === "error" ? "状态异常" : "未检测"}</Badge>{jimeng?.account && <p className="text-sm">{jimeng.account}</p>}{jimeng?.credits != null && <p className="text-sm">积分 {jimeng.credits}</p>}<div className="flex flex-wrap gap-2">{[["login", jimeng?.signedIn ? "切换账号" : "登录即梦"], ["status", "刷新状态"], ["models", "拉取即梦模型"], ...(jimeng?.signedIn ? [["logout", "退出登录"]] : [])].map(([name, label]) => <Button key={name} type="button" variant="outline" disabled={Boolean(action)} onClick={() => void cli(name)}>{label}</Button>)}</div></CardContent></Card>}
      {candidates !== null && <Card><CardHeader><CardTitle className="text-base">发现的模型（{candidates.length}）</CardTitle><CardDescription>选择后加入当前草稿，已有模型配置会保留。</CardDescription></CardHeader><CardContent className="space-y-3"><Input aria-label="搜索发现的模型" placeholder="搜索模型名称或 ID" value={query} onChange={e => setQuery(e.target.value)} /><div className="flex flex-wrap gap-2">{categories.map(([id, label]) => <Button type="button" size="sm" variant={category === id ? "secondary" : "ghost"} key={id} onClick={() => setCategory(id)}>{label}（{candidates.filter(model => inCategory(model, id)).length}）</Button>)}</div><div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">{candidates.filter(model => inCategory(model, category) && `${model.id} ${model.displayName || ""}`.toLowerCase().includes(query.toLowerCase())).map(model => <Button className="h-auto min-h-11 w-full justify-start whitespace-normal text-left" type="button" variant={selected.includes(model.id) ? "secondary" : "outline"} key={model.id} aria-pressed={selected.includes(model.id)} onClick={() => setSelected(previous => previous.includes(model.id) ? previous.filter(id => id !== model.id) : [...previous, model.id])}><Check className={selected.includes(model.id) ? "size-4 shrink-0" : "size-4 shrink-0 opacity-0"} /><span className="min-w-0 break-all">{model.displayName || model.id}{model.displayName && model.displayName !== model.id && <span className="block text-xs text-muted-foreground">{model.id}</span>}</span></Button>)}{candidates.length > 0 && !candidates.some(model => inCategory(model, category) && `${model.id} ${model.displayName || ""}`.toLowerCase().includes(query.toLowerCase())) && <p className="text-sm text-muted-foreground">没有符合搜索或分类条件的模型。</p>}{!candidates.length && <p className="text-sm text-muted-foreground">服务没有返回可用模型，可手动添加模型 ID。</p>}</div><div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={() => { setCandidates(null); setSelected([]) }}>取消选择</Button><Button type="button" disabled={!selected.length} onClick={() => { addModels(candidates.filter(model => selected.includes(model.id))); setCandidates(null); setSelected([]) }}>加入所选（{selected.length}）</Button></div></CardContent></Card>}
      <section className="space-y-3"><h3 className="text-sm font-medium">可用模型（{models.length}）</h3><div className="flex gap-2"><Input className="min-w-0" aria-label="手动添加模型 ID" placeholder="输入模型 ID" value={manual} onChange={e => setManual(e.target.value)} /><Button type="button" variant="outline" disabled={!manual.trim()} onClick={() => { const id = manual.trim(); addModels([{ id }]); void matchProtocols({ ...draft, models: [...models, { id }] }, [id]); setManual("") }}><Plus className="size-4" />添加</Button></div><p className="text-xs text-muted-foreground">模型测试会调用上游服务，可能产生费用。只有点击测试才会执行。</p>
      <div className="flex flex-wrap items-center gap-2"><Button type="button" variant={allMarked ? "secondary" : "ghost"} role="checkbox" aria-label="全选可用模型" title="全选可用模型" aria-checked={allMarked ? true : markedIds.length ? "mixed" : false} disabled={saving || !models.length} onClick={() => setMarkedModels(allMarked ? [] : models.map(model => model.id))}>{allMarked ? <SquareCheck className="text-primary" /> : markedIds.length ? <SquareMinus /> : <Square />}全选</Button><span role="status" className="text-xs text-muted-foreground">已选 {markedIds.length} 个</span><Button className="ml-auto" type="button" variant={markedIds.length ? "destructive" : "outline"} disabled={saving || !markedIds.length} onClick={() => removeModels(markedIds)}><Trash2 />移除所选（{markedIds.length}）</Button></div>
      {models.map((model, index) => <Card key={model.id}><CardContent className="space-y-3 p-4"><div className="flex flex-wrap items-center gap-2"><div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1"><Button type="button" size="icon" variant={markedSet.has(model.id) ? "secondary" : "ghost"} className="shrink-0" role="checkbox" title={`选择模型 ${model.id}`} aria-label={`选择模型 ${model.id}`} aria-checked={markedSet.has(model.id)} disabled={saving} onClick={() => setMarkedModels(previous => previous.includes(model.id) ? previous.filter(id => id !== model.id) : [...previous, model.id])}>{markedSet.has(model.id) ? <SquareCheck className="text-primary" /> : <Square />}</Button><Button type="button" variant="ghost" className="h-auto min-h-11 min-w-0 flex-1 justify-start whitespace-normal text-left" aria-label={`配置 ${model.id}`} aria-expanded={expanded === model.id} onClick={() => setExpanded(expanded === model.id ? null : model.id)}><ChevronDown className="size-4 shrink-0" /><span className="min-w-0 break-all">{model.id}<span className="mt-1 block text-xs text-muted-foreground">{modelProtocolLabel(model)}</span></span></Button></div><div className="ml-auto flex items-center gap-2"><Badge variant="secondary">{modelCategory(model)}</Badge>{[-1, 1].map(direction => <Button key={direction} type="button" variant="ghost" size="icon" title={direction < 0 ? "上移模型" : "下移模型"} aria-label={`${direction < 0 ? "上移" : "下移"} ${model.id}`} disabled={direction < 0 ? index === 0 : index === models.length - 1} onClick={() => { const next = [...models]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; setDraft({ ...draft, models: next }) }}>{direction < 0 ? <ArrowUp /> : <ArrowDown />}</Button>)}<Button type="button" variant="ghost" size="icon" title="移除模型" aria-label={`移除 ${model.id}`} disabled={saving} onClick={() => removeModels([model.id])}><Trash2 /></Button></div></div>
      <div hidden={expanded !== model.id} className="space-y-4 border-t border-border pt-4"><ModelConfiguration model={model} protocols={modelProtocols || protocols} protocolLabel={modelProtocolLabel(model)} availableResolutions={resolutionOptions(model)} resolutionError={resolutionError} disabled={saving} onChange={patch => updateModel(model.id, patch)} onValidity={valid => setInvalidParameters(previous => ({ ...previous, [model.id]: !valid }))} /><ModelTest provider={payload()} model={model} disabled={!ready || saving || Boolean(invalidParameters[model.id])} onBusy={busy => diagnosticBusy(model.id, busy)} /></div></CardContent></Card>)}{!models.length && <p className="text-sm text-muted-foreground">还没有模型。发现模型或手动输入 ID 后添加。</p>}</section>
      {feedback && <p role="status" className="break-all text-sm text-muted-foreground">{feedback}</p>}{error && <p role="alert" className="break-all text-sm text-destructive">{error}</p>}{remove && <p role="alert" className="text-sm text-destructive">删除后，使用此连接的模型将不可用。再次点击确认删除。</p>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">{draft.id && <Button type="button" variant={remove ? "destructive" : "outline"} disabled={Boolean(action)} onClick={() => { if (!remove) { setRemove(true); return } void run("delete", async () => { const data = await request<{ catalogRevision?: number }>(`/api/providers/${encodeURIComponent(draft.id)}`, "DELETE", undefined, controller.current.signal); if (!alive.current) return; publishModelsChanged(data.catalogRevision); setApiKey(""); notify("服务已删除。"); onClose(); await onSaved() }) }}>{remove ? "确认删除" : "删除服务"}</Button>}<Button type="button" variant="outline" disabled={saving} onClick={close}>取消</Button><Button type="submit" disabled={!ready || Boolean(action) || diagnosing || matching || !draft.name.trim() || models.some(model => invalidParameters[model.id])}>{saving ? "保存中…" : "保存设置"}</Button></div>
    </form></DialogContent></Dialog>
}
