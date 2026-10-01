import { useCallback, useEffect, useState } from "react"
import { Bot, Puzzle } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
  useEffect(() => { void load() }, [load])
  return error ? <ErrorPanel message={error} onRetry={() => void load()} /> : !data ? <Busy /> : <div className="space-y-6"><Card><CardHeader><CardTitle>智能助手模型</CardTitle><CardDescription>主模型优先使用，候选模型在失败时依次接替。</CardDescription></CardHeader><CardContent className="space-y-5">
    {!data.models?.length ? <Empty icon={<Bot />} title="没有符合要求的模型" description="请先添加同时支持对话、识图与工具调用的模型。" /> : <>
      {data.unavailable?.length > 0 && <p className="text-sm text-destructive" role="alert">有已选模型不可用，请重新选择并保存。</p>}
      <label className="block text-sm">主模型<NativeSelect className="mt-2 w-full" aria-label="智能助手主模型" value={selectionId(data.settings.primary)} onChange={e => { const model = data.models.find(item => selectionId(item) === e.target.value); setData({ ...data, settings: { primary: model ? { providerId: model.providerId, modelId: model.modelId } : null, candidates: data.settings.candidates.filter(item => selectionId(item) !== e.target.value) } }) }}><option value="">请选择主模型</option>{data.models.map(item => <option key={selectionId(item)} value={selectionId(item)}>{item.modelName || item.modelId} · {item.providerName}</option>)}</NativeSelect></label>
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
