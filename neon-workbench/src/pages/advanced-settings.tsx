import { useCallback, useEffect, useState } from "react"
import { Bot, CheckCircle2, CircleMinus, Cpu, Network, Puzzle, RefreshCw } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { Switch } from "@/components/ui/switch"
import { Busy, Empty, ErrorPanel, SearchBox } from "@/components/workbench"
import { dateLabel, request } from "@/lib/api"

type Props = { notify: (s: string) => void }
type Selection = { providerId: string; modelId: string }
type AgentModel = Selection & { providerName: string; modelName: string }
type AgentData = { settings: { primary: Selection | null; candidates: Selection[] }; models: AgentModel[]; unavailable: Selection[] }
const selectionId = (item?: Selection | null) => item ? `${item.providerId}::${item.modelId}` : ""
export function AgentSettings({ notify }: Props) {
  const [data, setData] = useState<AgentData | null>(null)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [fallback, setFallback] = useState(false)
  const load = useCallback(async () => { setError(""); try { const [agent, fallbackData] = await Promise.all([request<AgentData>("/api/providers/agent-settings"), request<{ enabled: boolean }>("/api/providers/auto-fallback")]); setData(agent); setFallback(fallbackData.enabled) } catch (e) { setError((e as Error).message) } }, [])
  useEffect(() => { void load(); const refresh = () => { void load() }; window.addEventListener("neon:models-changed", refresh); return () => window.removeEventListener("neon:models-changed", refresh) }, [load])
  return error ? <ErrorPanel message={error} onRetry={() => void load()} /> : !data ? <Busy /> : <div className="space-y-6"><Card><CardHeader><CardTitle>智能助手模型</CardTitle><CardDescription>主模型优先使用，候选模型在失败时依次接替。</CardDescription></CardHeader><CardContent className="space-y-5">
    {!data.models?.length ? <Empty icon={<Bot />} title="没有符合要求的模型" description="请先添加同时支持对话、识图与工具调用的模型。" /> : <>
      {data.unavailable?.length > 0 && <p className="text-sm text-destructive" role="alert">有已选模型不可用，请重新选择并保存。</p>}
      <label className="block text-sm">主模型<NativeSelect className="mt-2 w-full" aria-label="智能助手主模型" value={selectionId(data.settings.primary)} onChange={e => { const model = data.models.find(item => selectionId(item) === e.target.value); setData({ ...data, settings: { primary: model ? { providerId: model.providerId, modelId: model.modelId } : null, candidates: data.settings.candidates.filter(item => selectionId(item) !== e.target.value) } }) }}><option value="">请选择主模型</option>{data.models.map(item => <option key={selectionId(item)} value={selectionId(item)}>{item.modelName || item.modelId}，{item.providerName}</option>)}</NativeSelect></label>
      <fieldset className="space-y-3"><legend className="mb-3 text-sm">候选模型</legend>{data.models.filter(item => selectionId(item) !== selectionId(data.settings.primary)).map(model => <label key={selectionId(model)} className="flex items-center gap-3 text-sm"><input type="checkbox" checked={data.settings.candidates.some(item => selectionId(item) === selectionId(model))} onChange={e => setData({ ...data, settings: { ...data.settings, candidates: e.target.checked ? [...data.settings.candidates, { providerId: model.providerId, modelId: model.modelId }] : data.settings.candidates.filter(item => selectionId(item) !== selectionId(model)) } })} /><span>{model.modelName || model.modelId}<span className="ml-2 text-muted-foreground">{model.providerName}</span></span></label>)}</fieldset>
      <Button disabled={saving || !data.settings.primary} onClick={async () => { setSaving(true); try { setData(await request("/api/providers/agent-settings", "POST", data.settings)); notify("智能助手模型已保存。") } catch (e) { notify((e as Error).message) } finally { setSaving(false) } }}>{saving ? "保存中…" : "保存模型策略"}</Button>
    </>}
  </CardContent></Card><Card><CardContent className="flex items-center justify-between gap-5 pt-6"><div><h2 className="text-sm font-medium">模型服务自动切换</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">当前连接失败时，允许使用其他可用服务。</p></div><Switch aria-label="模型服务自动切换" checked={fallback} disabled={saving} onCheckedChange={async enabled => { setSaving(true); try { await request("/api/providers/auto-fallback", "POST", { enabled }); setFallback(enabled); notify("自动切换设置已保存。") } catch (e) { notify((e as Error).message) } finally { setSaving(false) } }} /></CardContent></Card></div>
}

type Skill = { id: string; label: string; description: string; enabled: boolean; origin?: string }
type SkillsData = { groups?: { id: string; label: string; skills: Skill[] }[] }
export function SkillsSettings({ notify }: Props) {
  const [data, setData] = useState<SkillsData | null>(null)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [busy, setBusy] = useState("")
  const load = useCallback(async () => { setError(""); try { setData(await request("/api/skills")) } catch (e) { setError((e as Error).message) } }, [])
  useEffect(() => { void load() }, [load])
  const groups = (data?.groups || []).map(group => ({ ...group, skills: group.skills.filter(skill => `${skill.label}${skill.description}`.includes(query)) })).filter(group => group.skills.length)
  return error ? <ErrorPanel message={error} onRetry={() => void load()} /> : !data ? <Busy /> : <><div className="mb-6"><SearchBox value={query} onChange={setQuery} placeholder="搜索智能助手技能" /></div>{groups.length ? <div className="space-y-8">{groups.map(group => <section key={group.id}><h2 className="mb-4 text-base font-medium">{group.label}</h2><div className="grid gap-4 lg:grid-cols-2">{group.skills.map(skill => <Card key={skill.id}><CardHeader><div className="flex items-center justify-between gap-4"><CardTitle className="text-base">{skill.label}</CardTitle><Switch aria-label={`启用技能 ${skill.label}`} checked={skill.enabled} disabled={Boolean(busy)} onCheckedChange={async enabled => { setBusy(skill.id); try { setData(await request("/api/skills/enabled", "POST", { id: skill.id, enabled })); notify(enabled ? "技能已启用。" : "技能已停用。") } catch (e) { notify((e as Error).message) } finally { setBusy("") } }} /></div><CardDescription className="leading-6">{skill.description}</CardDescription></CardHeader></Card>)}</div></section>)}</div> : <Empty icon={<Puzzle />} title={query ? "没有匹配的技能" : "暂无技能"} description="安装的能力将在这里显示。" />}</>
}

export function BackupSettings({ notify }: Props) {
  const [snapshots, setSnapshots] = useState<{ createdAt: string; path?: string; sizeBytes?: number }[] | null>(null)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const load = useCallback(async () => { setError(""); try { setSnapshots((await request<{ snapshots: { createdAt: string; path?: string; sizeBytes?: number }[] }>("/api/system/backup/status")).snapshots || []) } catch (e) { setError((e as Error).message) } }, [])
  useEffect(() => { void load() }, [load])
  return error ? <ErrorPanel message={error} onRetry={() => void load()} /> : !snapshots ? <Busy /> : <Card><CardHeader><CardTitle>系统备份</CardTitle><CardDescription>备份此主机上的账户数据与媒体文件。</CardDescription></CardHeader><CardContent className="space-y-5"><Button disabled={saving} onClick={async () => { setSaving(true); try { await request("/api/admin/backup", "POST", { includeMedia: true }); await load(); notify("系统备份已完成。") } catch (e) { notify((e as Error).message) } finally { setSaving(false) } }}>{saving ? "正在备份…" : "立即备份"}</Button><ul className="divide-y divide-border">{snapshots.map((snapshot, index) => <li key={`${snapshot.createdAt}-${index}`} className="flex flex-wrap justify-between gap-3 py-4 text-sm"><span>{dateLabel(snapshot.createdAt)}</span><span className="text-muted-foreground">{snapshot.sizeBytes ? `${(snapshot.sizeBytes / 1024 / 1024).toFixed(1)} MB` : "备份快照"}</span></li>)}</ul>{!snapshots.length && <p className="text-sm text-muted-foreground">尚无备份快照。</p>}</CardContent></Card>
}

type ComfyConfig = { mode: string; baseUrl: string; port?: number; listenHost?: string; rootDirectory?: string; pythonPath?: string; mainPath?: string; outputDirectory?: string; [key: string]: unknown }
type ComfyData = { config: ComfyConfig; runtime?: { state?: string; message?: string }; warnings?: string[]; connection?: { ok?: boolean; message?: string } }
export function WorkflowSettings({ notify }: Props) {
  const [data, setData] = useState<ComfyData | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState("")
  const load = useCallback(async () => { setError(""); try { setData(await request("/api/comfyui/settings")) } catch (e) { setError((e as Error).message) } }, [])
  useEffect(() => { void load() }, [load])
  const run = async (action: string) => {
    if (!data) return
    setBusy(action); setError("")
    try {
      const config = { ...data.config }
      if (config.mode === "local") {
        const host = config.listenHost === "0.0.0.0" ? "127.0.0.1" : config.listenHost === "::" ? "::1" : config.listenHost || "127.0.0.1"
        config.baseUrl = `http://${host.includes(":") ? `[${host}]` : host}:${config.port || 8188}`
      }
      if (action === "start") await request("/api/comfyui/settings", "PUT", config)
      const result = await request<ComfyData & { ok?: boolean; message?: string }>(`/api/comfyui/${action}`, action === "settings" ? "PUT" : "POST", action === "start" || action === "stop" ? {} : config)
      setData(old => old && ({ ...old, ...result, config: result.config || old.config }))
      notify(action === "settings" ? "工作流连接已保存。" : action === "test" ? result.message || (result.ok ? "连接正常。" : "连接测试未通过。") : action === "start" ? "启动请求已提交。" : action === "stop" ? "停止请求已提交。" : "安装检测已完成。")
    } catch (e) { setError((e as Error).message) } finally { setBusy("") }
  }
  if (!data) return error ? <ErrorPanel message={error} onRetry={() => void load()} /> : <Busy />
  return <Card><CardHeader><CardTitle>ComfyUI 工作流引擎</CardTitle><CardDescription>连接本机或远程工作流，用于放大、编辑和扩图。</CardDescription></CardHeader><CardContent className="space-y-5">
    <label className="block text-sm">运行方式<NativeSelect className="mt-2 w-full" value={data.config.mode} aria-label="工作流运行方式" disabled={Boolean(busy)} onChange={e => setData({ ...data, config: { ...data.config, mode: e.target.value } })}><option value="remote">连接已有服务</option><option value="local">由本机启动</option></NativeSelect></label>
    {data.config.mode === "remote" ? <label className="block text-sm">服务地址<Input className="mt-2" type="url" value={data.config.baseUrl || ""} onChange={e => setData({ ...data, config: { ...data.config, baseUrl: e.target.value } })} /></label> : <div className="grid gap-5 sm:grid-cols-2">{[["rootDirectory", "安装目录"], ["pythonPath", "Python 路径"], ["mainPath", "启动文件路径"], ["listenHost", "监听地址"], ["port", "服务端口"], ["outputDirectory", "输出目录"]].map(([key, label]) => <label key={key} className="block text-sm">{label}<Input className="mt-2" value={String(data.config[key] || "")} onChange={e => setData({ ...data, config: { ...data.config, [key]: key === "port" ? Number(e.target.value) : e.target.value } })} /></label>)}</div>}
    <p className="text-sm text-muted-foreground">{data.runtime?.message || { running: "运行中", stopped: "已停止", error: "运行异常" }[data.runtime?.state || ""] || "尚未检查运行状态"}</p>
    {data.warnings?.map((warning, index) => <p key={index} className="text-sm text-muted-foreground">{warning}</p>)}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex flex-wrap gap-3"><Button disabled={Boolean(busy)} onClick={() => void run("settings")}>{busy === "settings" ? "保存中…" : "保存连接"}</Button><Button variant="outline" disabled={Boolean(busy)} onClick={() => void run("test")}>测试连接</Button>{data.config.mode === "local" && <><Button variant="outline" disabled={Boolean(busy)} onClick={() => void run("detect")}>检测安装</Button><Button variant="outline" disabled={Boolean(busy)} onClick={() => void run("start")}>启动引擎</Button><Button variant="outline" disabled={Boolean(busy)} onClick={() => void run("stop")}>停止引擎</Button></>}</div>
  </CardContent></Card>
}

type LocalModel = {
  id: string
  name?: string
  description?: string
  installed?: boolean
  source?: string
  size?: number
  sha256?: string
  stored?: boolean
  bundledAvailable?: boolean
  upstreamRepository?: string
  upstreamLicense?: string
  upstream?: { sha256?: string; size?: number; publishedAt?: string; checkedAt?: string }
  error?: string
}
const modelBytes = (value?: number) => {
  const bytes = Number(value || 0)
  if (!bytes) return "—"
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`
  return `${(bytes / 1024).toFixed(1)} KB`
}
const modelHash = (value?: string) => value && /^[a-f0-9]{8,}$/i.test(value) ? value.slice(0, 8).toLowerCase() : "—"

export function LocalModelsSettings({ notify }: Props) {
  const [models, setModels] = useState<LocalModel[]>([])
  const [loaded, setLoaded] = useState(false)
  const [remote, setRemote] = useState<LocalModel["upstream"] | null>(null)
  const [busy, setBusy] = useState("")
  const [error, setError] = useState("")
  const [note, setNote] = useState("")
  const [progress, setProgress] = useState<{ received?: number; total?: number; phase?: string } | null>(null)
  const load = useCallback(async () => {
    setError("")
    try { const data = await request<{ models?: LocalModel[] }>("/api/background-removal/models"); setModels(data.models || []) } catch (e) { setError((e as Error).message) } finally { setLoaded(true) }
  }, [])
  useEffect(() => { void load() }, [load])
  const current = models[0]
  const run = async (action: "check" | "update" | "reset") => {
    if (busy || !current) return
    setBusy(action); setError(""); setNote("")
    let timer: ReturnType<typeof setInterval> | undefined
    if (action === "update") timer = setInterval(() => { void request<{ progress?: typeof progress }>("/api/background-removal/models/update/progress").then(data => setProgress(data.progress || null)).catch(error => setError(`读取下载进度失败：${error.message}`)) }, 800)
    try {
      const path = action === "check" ? "/api/background-removal/models/check" : action === "update" ? "/api/background-removal/models/update" : "/api/background-removal/models/reset"
      const data = await request<{ model?: LocalModel; remote?: LocalModel["upstream"]; updateAvailable?: boolean; removed?: boolean }>(path, "POST", { id: current.id })
      if (data.model) setModels([data.model])
      if (data.remote) setRemote(data.remote)
      setNote(action === "check" ? (data.updateAvailable ? `发现新版本：${modelHash(data.remote?.sha256)}。` : "已是最新版本。") : action === "update" ? "本地模型已更新并生效。" : (data.removed ? "已恢复随应用内置的版本。" : "当前已经使用内置版本。"))
      if (action === "update") notify("本地抠图模型已更新。")
    } catch (e) { setError(action === "check" ? `检查更新失败：${(e as Error).message}` : (e as Error).message) }
    finally { if (timer) clearInterval(timer); setProgress(null); setBusy("") }
  }
  if (error && !current) return <ErrorPanel message={error} onRetry={() => void load()} />
  if (!loaded) return <Busy />
  if (!current) return <Empty icon={<Cpu />} title="暂无本地模型" description="服务端没有注册可管理的本地模型。" />
  const upstream = remote || current.upstream
  const updateAvailable = Boolean(upstream?.sha256 && upstream.sha256 !== current.sha256)
  const status = !current.installed ? "未下载" : updateAvailable ? "可更新" : "已就绪"
  const percent = progress?.total ? Math.min(100, Math.round((Number(progress.received || 0) / Number(progress.total)) * 100)) : 0
  return <div className="space-y-6"><Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-4"><div><CardTitle className="flex items-center gap-2"><Cpu className="size-5 text-primary" />本地模型</CardTitle><CardDescription className="mt-1">管理随应用分发的本地抠图模型，更新只写入数据目录。</CardDescription></div><Badge variant={status === "已就绪" ? "secondary" : "outline"}>{status}</Badge></div></CardHeader><CardContent className="space-y-5"><div className="rounded-xl border border-border bg-secondary/30 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-medium">{current.name || current.id}</h3><p className="mt-1 text-sm text-muted-foreground">{current.description || "通用前景分割模型，纯 CPU 运行，不占 API 额度。"}</p></div><span className="text-xs text-muted-foreground">{!current.installed ? "未下载，需联网获取" : current.source === "external" ? ".env 自定义路径" : current.source === "update" ? "数据目录更新" : "随应用内置"}</span></div></div><dl className="grid gap-3 text-sm sm:grid-cols-2"><div className="flex justify-between gap-4 border-b border-border pb-3"><dt className="text-muted-foreground">权重体积</dt><dd>{modelBytes(current.size)}</dd></div><div className="flex justify-between gap-4 border-b border-border pb-3"><dt className="text-muted-foreground">本地校验值</dt><dd>{modelHash(current.sha256)}</dd></div><div className="flex justify-between gap-4 border-b border-border pb-3"><dt className="text-muted-foreground">上游发布源</dt><dd className="max-w-[60%] truncate text-right">{current.upstreamRepository || "—"}</dd></div><div className="flex justify-between gap-4 border-b border-border pb-3"><dt className="text-muted-foreground">上游版本</dt><dd>{modelHash(upstream?.sha256)}</dd></div></dl>{current.source === "external" && <p className="text-sm text-warning">当前由环境变量指定的权重优先生效，下载更新不会替换它。</p>}{current.error && <p role="alert" className="text-sm text-destructive">{current.error}</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}{note && <p role="status" className="text-sm text-muted-foreground">{note}</p>}{progress && <div className="space-y-2"><div className="flex justify-between text-xs text-muted-foreground"><span>{progress.phase === "connecting" ? "正在连接发布源" : "下载权重"}</span><span>{percent}%</span></div><progress className="h-2 w-full accent-primary" max="100" value={percent}>{percent}%</progress></div>}<div className="flex flex-wrap gap-3"><Button variant="outline" disabled={Boolean(busy)} onClick={() => void run("check")}><RefreshCw className="size-4" />{busy === "check" ? "检查中…" : "检查更新"}</Button>{(!current.installed || updateAvailable) && current.source !== "external" && <Button disabled={Boolean(busy)} onClick={() => void run("update")}>{busy === "update" ? "下载中…" : current.installed ? "下载更新" : `下载模型（${modelBytes(current.size)}）`}</Button>}{current.stored && current.bundledAvailable && <Button variant="ghost" disabled={Boolean(busy)} onClick={() => void run("reset")}>恢复内置版本</Button>}</div></CardContent></Card><p className="text-xs leading-5 text-muted-foreground">{current.installed ? "模型更新会校验来源与文件完整性；真实上游下载需要联网，离线时可继续使用当前已安装版本。" : `这个版本不再随安装包内置权重，第一次用本地抠图前点上面的按钮下载一次（约 ${modelBytes(current.size)}），下载会按出厂校验值验证；离线时也可以在能联网的机器上下好权重再导入。`}</p></div>
}

type ProtocolEntry = { id: string; label?: string; name?: string; summary?: string; description?: string; builtin?: boolean; runtimeProtocol?: string; capabilities?: string[]; operations?: { intent?: string; method?: string; path?: string; mode?: string }[]; displayGroup?: string; compatiblePlatformProtocols?: string[]; usageCount?: number }
type ProtocolCatalog = { protocols?: ProtocolEntry[]; platformProtocols?: ProtocolEntry[]; modelProtocols?: ProtocolEntry[]; capabilities?: { id: string; label: string }[]; editable?: boolean }
type ProviderRoute = { id: string; name?: string; enabled?: boolean; models?: { id: string; displayName?: string }[] }
type ProtocolDraft = { id: string; label: string; summary: string; runtimeProtocol: string; capabilities: string[]; editing?: boolean }
const capabilityNames: Record<string, string> = { "llm.chat": "对话", "llm.chat.vision": "识图", "llm.tools": "工具", "image.generate": "生图", "image.edit": "修图", "video.generate": "视频", "audio.generate": "音频" }

export function ProtocolCenterSettings({ notify }: Props) {
  const [catalog, setCatalog] = useState<ProtocolCatalog | null>(null)
  const [providers, setProviders] = useState<ProviderRoute[]>([])
  const [scope, setScope] = useState<"platform" | "model">("platform")
  const [selected, setSelected] = useState("")
  const [intent, setIntent] = useState("llm.chat")
  const [providerId, setProviderId] = useState("")
  const [modelId, setModelId] = useState("")
  const [route, setRoute] = useState<Record<string, any> | null>(null)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<ProtocolDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const load = useCallback(async () => { setError(""); try { const [next, providerData] = await Promise.all([request<ProtocolCatalog>("/api/protocols"), request<{ providers?: ProviderRoute[] }>("/api/providers")]); setCatalog(next); setProviders(providerData.providers || []); setSelected(current => (next[scope === "platform" ? "platformProtocols" : "modelProtocols"] || next.protocols || []).find(item => item.id === current)?.id || ((next[scope === "platform" ? "platformProtocols" : "modelProtocols"] || next.protocols || [])[0]?.id || "")) } catch (e) { setError((e as Error).message) } }, [scope])
  useEffect(() => { void load() }, [load])
  const entries = (scope === "platform" ? catalog?.platformProtocols : catalog?.modelProtocols) || catalog?.protocols || []
  const active = entries.find(item => item.id === selected) || entries[0]
  const capabilities = catalog?.capabilities?.length ? catalog.capabilities : Object.entries(capabilityNames).map(([id, label]) => ({ id, label }))
  const testRoute = async (event: React.FormEvent) => { event.preventDefault(); if (busy) return; setBusy(true); setError(""); setRoute(null); try { setRoute(await request<Record<string, any>>("/api/protocols/route-test", "POST", { intent, ...(providerId ? { providerId } : {}), ...(modelId ? { modelId } : {}) })); notify("路由检查已完成，未访问上游服务。") } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }
  const runtimeOptions = entries.filter(item => item.builtin !== false && item.runtimeProtocol !== "")
  const newProtocol = () => { const runtime = runtimeOptions[0]; if (!runtime) { setError("当前没有可继承的内置运行协议。"); return } setDraft({ id: "", label: "", summary: "", runtimeProtocol: runtime.id, capabilities: scope === "model" ? [...(runtime.capabilities || [])] : [] }); setError("") }
  const editProtocol = () => { if (!active || active.builtin !== false) return; setDraft({ id: active.id, label: active.label || active.name || active.id, summary: active.summary || active.description || "", runtimeProtocol: active.runtimeProtocol || active.id, capabilities: [...(active.capabilities || [])], editing: true }); setError("") }
  const saveProtocol = async (event: React.FormEvent) => { event.preventDefault(); if (!draft || saving) return; if (!draft.id.trim() || !draft.label.trim()) { setError("请填写协议 ID 和显示名称。"); return } if (scope === "model" && !draft.capabilities.length) { setError("模型协议至少选择一种能力。"); return } setSaving(true); setError(""); try { const result = await request<{ protocol?: ProtocolEntry }>("/api/protocols/custom", "POST", { id: draft.id.trim(), label: draft.label.trim(), summary: draft.summary.trim(), scope, runtimeProtocol: draft.runtimeProtocol, ...(scope === "model" ? { capabilities: draft.capabilities } : {}) }); setDraft(null); setSelected(result.protocol?.id || draft.id); await load(); notify("自定义协议已保存。") } catch (e) { setError((e as Error).message) } finally { setSaving(false) } }
  const deleteProtocol = async () => { if (!active || active.builtin !== false || active.usageCount) return; if (!window.confirm(`删除自定义协议“${active.label || active.id}”？`)) return; setBusy(true); setError(""); try { await request(`/api/protocols/custom/${encodeURIComponent(active.id)}`, "DELETE"); setSelected(""); await load(); notify("自定义协议已删除。") } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }
  if (error && !catalog) return <ErrorPanel message={error} onRetry={() => void load()} />
  if (!catalog) return <Busy />
  return <div className="space-y-6"><div><h2 className="flex items-center gap-2 text-xl font-semibold"><Network className="size-5 text-primary" />协议中心</h2><p className="mt-2 text-sm text-muted-foreground">查看服务连接与模型能力的真实映射，并在保存前检查路由选择。</p></div><div className="flex flex-wrap items-center gap-2"><Button size="sm" variant={scope === "platform" ? "default" : "outline"} onClick={() => { setScope("platform"); setSelected(""); setDraft(null); setRoute(null) }}>平台协议</Button><Button size="sm" variant={scope === "model" ? "default" : "outline"} onClick={() => { setScope("model"); setSelected(""); setDraft(null); setRoute(null) }}>模型协议</Button><Button size="sm" variant="ghost" onClick={() => void load()}><RefreshCw className="size-4" />刷新目录</Button>{catalog.editable !== false && <Button size="sm" onClick={newProtocol}>新建协议</Button>}</div>{draft && <Card><CardHeader><CardTitle>{draft.editing ? "编辑自定义协议" : "新建自定义协议"}</CardTitle><CardDescription>{scope === "platform" ? "平台协议用于连接、鉴权和模型目录。" : "模型协议用于定义能力范围与请求映射。"}</CardDescription></CardHeader><CardContent><form className="grid gap-4 sm:grid-cols-2" onSubmit={saveProtocol}><label className="text-sm">协议 ID<Input className="mt-2" required pattern="[a-z][a-z0-9._-]{1,63}" value={draft.id} disabled={draft.editing} onChange={e => setDraft({ ...draft, id: e.target.value })} /></label><label className="text-sm">显示名称<Input className="mt-2" required value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} /></label><label className="text-sm sm:col-span-2">说明<Input className="mt-2" value={draft.summary} onChange={e => setDraft({ ...draft, summary: e.target.value })} /></label><label className="text-sm">继承运行协议<NativeSelect className="mt-2 w-full" value={draft.runtimeProtocol} disabled={draft.editing} onChange={e => setDraft({ ...draft, runtimeProtocol: e.target.value })}>{runtimeOptions.map(item => <option key={item.id} value={item.id}>{item.label || item.name || item.id}</option>)}</NativeSelect></label>{scope === "model" && <fieldset className="sm:col-span-2"><legend className="mb-2 text-sm">允许的模型能力</legend><div className="flex flex-wrap gap-2">{capabilities.map(cap => <label key={cap.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"><input type="checkbox" checked={draft.capabilities.includes(cap.id)} onChange={e => setDraft({ ...draft, capabilities: e.target.checked ? [...draft.capabilities, cap.id] : draft.capabilities.filter(id => id !== cap.id) })} />{cap.label}</label>)}</div></fieldset>}<div className="flex flex-wrap gap-3 sm:col-span-2"><Button type="submit" disabled={saving}>{saving ? "保存中…" : "保存协议"}</Button><Button type="button" variant="outline" disabled={saving} onClick={() => setDraft(null)}>取消</Button></div></form></CardContent></Card>}<div className="grid gap-6 lg:grid-cols-[minmax(13.75rem,0.72fr)_minmax(0,1.28fr)]"><Card><CardHeader><CardTitle className="text-sm">{scope === "platform" ? "平台协议" : "模型协议"}</CardTitle><CardDescription>{entries.length} 个协议</CardDescription></CardHeader><CardContent className="space-y-1">{entries.length ? entries.map(item => <button key={item.id} type="button" aria-pressed={active?.id === item.id} onClick={() => { setSelected(item.id); setDraft(null); setRoute(null) }} className={`flex w-full items-start justify-between gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${active?.id === item.id ? "border-primary/60 bg-primary/10" : "border-transparent hover:bg-accent"}`}><span className="min-w-0"><strong className="block truncate text-sm">{item.label || item.name || item.id}</strong><small className="mt-1 block truncate text-xs text-muted-foreground">{item.id}，{item.builtin === false ? "自定义" : "内置"}</small></span>{active?.id === item.id && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />}</button>) : <p className="py-6 text-sm text-muted-foreground">暂无协议目录。</p>}</CardContent></Card><Card><CardHeader><CardTitle>{active?.label || active?.name || active?.id || "协议详情"}</CardTitle><CardDescription>{active?.summary || active?.description || "协议负责定义连接方式、请求映射与能力范围。"}</CardDescription></CardHeader><CardContent className="space-y-5">{active ? <><div><h3 className="mb-2 text-sm font-medium">支持能力</h3><div className="flex flex-wrap gap-2">{capabilities.map(cap => <Badge key={cap.id} variant={active.capabilities?.includes(cap.id) ? "secondary" : "outline"}>{active.capabilities?.includes(cap.id) ? <CheckCircle2 className="size-3" aria-hidden="true" /> : <CircleMinus className="size-3" aria-hidden="true" />} {cap.label}<span className="sr-only">{active.capabilities?.includes(cap.id) ? "，支持" : "，不支持"}</span></Badge>)}</div></div><div><h3 className="mb-2 text-sm font-medium">执行映射</h3>{active.operations?.length ? <div className="space-y-2">{active.operations.map((operation, index) => <div key={`${operation.intent}-${index}`} className="rounded-lg border border-border bg-secondary/20 p-3 text-xs"><div className="flex flex-wrap justify-between gap-2"><strong>{capabilityNames[operation.intent || ""] || operation.intent || "通用操作"}</strong><code>{operation.method || ""} {operation.path || "专用适配器"}</code></div><span className="mt-1 block text-muted-foreground">{operation.mode || "request"}</span></div>)}</div> : <p className="text-sm text-muted-foreground">当前协议由专用适配器处理，没有声明式路径。</p>}</div><p className="text-xs leading-5 text-muted-foreground">{scope === "platform" ? "平台协议统一管理 Base URL、鉴权和模型目录。" : `运行协议：${active.runtimeProtocol || active.id}。模型协议只定义请求路径、参数和响应解析。`}</p><div className="flex flex-wrap gap-3">{active.builtin === false && <><Button size="sm" variant="outline" onClick={editProtocol}>编辑协议</Button><Button size="sm" variant="destructive" disabled={Boolean(active.usageCount) || busy} onClick={() => void deleteProtocol()}>删除协议</Button></>}</div></> : <p className="text-sm text-muted-foreground">选择左侧协议查看详情。</p>}</CardContent></Card></div><Card><CardHeader><CardTitle className="text-base">路由检查</CardTitle><CardDescription>只按已保存配置检查能力匹配，不生成内容，也不会访问上游服务。</CardDescription></CardHeader><CardContent><form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={testRoute}><label className="text-sm">请求能力<NativeSelect className="mt-2 w-full" value={intent} onChange={e => setIntent(e.target.value)}>{capabilities.map(cap => <option key={cap.id} value={cap.id}>{cap.label}，{cap.id}</option>)}</NativeSelect></label><label className="text-sm">提供商<NativeSelect className="mt-2 w-full" value={providerId} onChange={e => { setProviderId(e.target.value); setModelId("") }}><option value="">按配置自动选择</option>{providers.map(provider => <option key={provider.id} value={provider.id}>{provider.name || provider.id}</option>)}</NativeSelect></label><label className="text-sm">模型<NativeSelect className="mt-2 w-full" disabled={!providerId} value={modelId} onChange={e => setModelId(e.target.value)}><option value="">按能力自动选择</option>{providers.find(item => item.id === providerId)?.models?.map(model => <option key={model.id} value={model.id}>{model.displayName || model.id}</option>)}</NativeSelect></label><div className="flex items-end"><Button type="submit" disabled={busy || catalog.editable === false} className="w-full">{busy ? "检查中…" : "检查路由"}</Button></div></form>{error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}{route && <div className="mt-5 rounded-xl border border-border bg-secondary/20 p-4 text-sm" role="status"><strong className={route.ok ? "text-primary" : "text-warning"}>{route.ok ? "配置检查通过" : "配置检查未通过"}</strong><p className="mt-2 text-muted-foreground">本次检查未向上游发送请求；自动回退：{route.autoFallback ? "已启用" : "已关闭"}。</p>{route.selected ? <p className="mt-2">已选路由：{route.selected.providerName || route.selected.providerId} / {route.selected.modelName || route.selected.modelId}</p> : <p className="mt-2">没有符合条件的可用路由。</p>}{route.issues?.length ? <details className="mt-3"><summary>配置问题（{route.issues.length}）</summary><ul className="mt-2 list-disc space-y-1 pl-5">{route.issues.map((issue: any, index: number) => <li key={index}>{issue.providerName || issue.providerId}：{issue.reason || "配置不完整"}</li>)}</ul></details> : null}</div>}</CardContent></Card></div>
}
