import { useCallback, useEffect, useState } from "react"
import { Download, KeyRound, LogOut, Plus, RefreshCw, RotateCcw, Server, ShieldCheck, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Heading, Busy, Empty, ErrorPanel, Modal } from "@/components/workbench"
import { request, hostAction, publishModelsChanged } from "@/lib/api"
import type { Preferences, User } from "@/lib/api"
import { AgentSettings, SkillsSettings, BackupSettings, LocalModelsSettings, ProtocolCenterSettings, WorkflowSettings } from "@/pages/advanced-settings"

type Props = { user: User | null; notify: (text: string) => void }
import { ProviderEditor } from "@/components/provider-editor"
import type { ProviderConnection, ProviderProtocol } from "@/components/provider-editor"
type Connection = ProviderConnection
type Protocol = ProviderProtocol
export function SettingsPage({ user, notify }: Props) {
  const [tab, setTab] = useState("appearance")
  const [preferences, setPreferences] = useState<Preferences | null>(null)
  const [providers, setProviders] = useState<Connection[]>([])
  const [protocols, setProtocols] = useState<Protocol[]>([])
  const [modelProtocols, setModelProtocols] = useState<Protocol[]>([])
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editor, setEditor] = useState<Connection | null>(null)
  const admin = user?.role === "superadmin"
  const load = useCallback(async () => {
    setBusy(true); setError("")
    try {
      const preferenceData = await request<{ preferences: Preferences }>("/api/preferences")
      setPreferences(preferenceData.preferences)
      if (admin) {
        const [providerData, protocolData] = await Promise.all([request<{ providers: Connection[] }>("/api/providers"), request<{ protocols?: Protocol[]; platformProtocols?: Protocol[]; modelProtocols?: Protocol[] }>("/api/protocols")])
        setProviders(providerData.providers || [])
        setProtocols(protocolData.platformProtocols || protocolData.protocols || [])
        setModelProtocols(protocolData.modelProtocols || (protocolData.protocols || []).filter(item => item.modelVisible !== false))
      }
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }, [admin])
  const refreshModels = () => publishModelsChanged()
  useEffect(() => { void load() }, [load])
  const updateAppearance = async (patch: Partial<Preferences["appearance"]>) => {
    if (!preferences) return
    setSaving(true)
    try {
      const appearance = { ...preferences.appearance, ...patch, theme: "neon" }
      await request("/api/preferences", "PATCH", { appearance })
      setPreferences({ appearance })
      document.documentElement.dataset.motion = appearance.animations
      // Scale preserves layout viewport and uses rem-based component sizing.
      document.documentElement.style.fontSize = `${16 * appearance.scale}px`
      notify("外观设置已保存。")
    } catch (e) { notify((e as Error).message) } finally { setSaving(false) }
  }
  const edit = (provider?: Connection) => {
    setEditor(provider ? { ...provider, protocol: provider.protocol || (provider as Connection & { providerProtocol?: string }).providerProtocol || "openai" } : { id: "", name: "", baseUrl: "", protocol: "openai", enabled: true, models: [] })
  }
  return <><Heading title="设置" description="把外观、服务连接和运行状态放在同一处管理。" />
    <Tabs value={tab} onValueChange={value => setTab(String(value))} className="mb-6"><TabsList className="h-auto max-w-full flex-wrap justify-start gap-1"><TabsTrigger value="appearance">外观</TabsTrigger>{admin && <><TabsTrigger value="providers">模型服务</TabsTrigger><TabsTrigger value="protocols">协议中心</TabsTrigger><TabsTrigger value="models">本地模型</TabsTrigger><TabsTrigger value="agent">智能助手</TabsTrigger><TabsTrigger value="skills">技能</TabsTrigger><TabsTrigger value="workflow">工作流</TabsTrigger><TabsTrigger value="backup">备份</TabsTrigger></>}<TabsTrigger value="system">系统</TabsTrigger></TabsList></Tabs>
    {busy ? <Busy /> : error ? <ErrorPanel message={error} onRetry={() => void load()} /> : tab === "appearance" ? <Card className="max-w-3xl"><CardHeader><CardTitle>工作台外观</CardTitle><CardDescription>按你的阅读习惯调整界面大小与动效。</CardDescription></CardHeader><CardContent className="space-y-6">
      <div className="flex items-center justify-between gap-4 border-b border-border pb-5"><div><h2 className="text-sm font-medium">界面主题</h2><p className="mt-1 text-xs text-muted-foreground">近黑表面、绿色主行动、低干扰信息层级</p></div><Badge>Neon</Badge></div>
      <label className="flex items-center justify-between gap-4"><span className="text-sm">界面缩放</span><NativeSelect aria-label="界面缩放" className="w-32" value={preferences?.appearance.scale || 1} disabled={saving} onChange={e => void updateAppearance({ scale: Number(e.target.value) })}>{[0.75, 1, 1.25, 1.5, 1.75].map(v => <option key={v} value={v}>{v * 100}%</option>)}</NativeSelect></label>
      <div className="flex items-center justify-between gap-4"><div><h2 className="text-sm">减少动效</h2><p className="mt-1 text-xs text-muted-foreground">减少非必要的过渡与动画</p></div><Switch aria-label="减少动效" disabled={saving} checked={preferences?.appearance.animations === "reduced"} onCheckedChange={value => void updateAppearance({ animations: value ? "reduced" : "full" })} /></div>
    </CardContent></Card> : tab === "providers" ? <><div className="mb-4 flex justify-end"><Button onClick={() => edit()}><Plus className="size-4" />添加服务</Button></div>{providers.length ? <div className="grid gap-4 lg:grid-cols-2">{providers.map(provider => <Card key={provider.id}><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle className="truncate text-base">{provider.name}</CardTitle><Switch aria-label={`启用 ${provider.name}`} checked={provider.enabled !== false} disabled={saving} onCheckedChange={async value => { setSaving(true); try { await request(`/api/providers/${encodeURIComponent(provider.id)}/enabled`, "POST", { enabled: value }); refreshModels(); await load() } catch (e) { notify((e as Error).message) } finally { setSaving(false) } }} /></div><CardDescription className="break-all">{provider.baseUrl || "本地服务"}，{provider.models?.length || 0} 个模型</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => edit(provider)}>管理连接与模型</Button></CardContent></Card>)}</div> : <Empty icon={<Server />} title="尚未配置模型服务" description="添加兼容接口和模型后，可以开始生图与对话。" action={<Button onClick={() => edit()}>添加服务</Button>} />}</> : tab === "protocols" ? <ProtocolCenterSettings notify={notify} /> : tab === "models" ? <LocalModelsSettings notify={notify} /> : tab === "agent" ? <AgentSettings notify={notify} /> : tab === "skills" ? <SkillsSettings notify={notify} /> : tab === "workflow" ? <WorkflowSettings notify={notify} /> : tab === "backup" ? <BackupSettings notify={notify} /> : <SystemPage /> }
    {editor && <ProviderEditor key={editor.id || "new"} provider={editor} protocols={protocols} modelProtocols={modelProtocols} onClose={() => setEditor(null)} onSaved={load} notify={notify} />}</>
}

type HostBridge = {
  getAutostart?: () => Promise<{ enabled?: boolean }>
  setAutostart?: (enabled: boolean) => Promise<{ enabled?: boolean }>
  getUpdateStatus?: () => Promise<Record<string, unknown>>
  checkForUpdates?: () => Promise<Record<string, unknown>>
  downloadUpdate?: () => Promise<Record<string, unknown>>
  restartToUpdate?: () => Promise<Record<string, unknown>>
  onUpdateStatus?: (callback: (status: UpdateState) => void) => () => void
}
type UpdateState = Record<string, any> & { status?: string; currentVersion?: string; availableVersion?: string; progress?: number; error?: string; notes?: string }
const updateLabels: Record<string, string> = { idle: "尚未检查", checking: "检查中", available: "发现更新", downloading: "下载中", downloaded: "已准备更新", preparing: "准备中", ready: "可以重启", restarting: "正在重启", error: "更新异常", development: "开发环境", unavailable: "当前不可用", unpublished: "尚无可用更新", "up-to-date": "已是最新", up_to_date: "已是最新" }
function hostError(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : ""
  return /[\u4e00-\u9fff]/.test(message) ? message : "主机操作失败，请检查服务状态后重试。"
}
function getHostBridge(): HostBridge | null {
  try {
    const hostWindow = (window.parent === window ? window : window.parent) as Window & { aiOsHost?: HostBridge }
    return hostWindow.aiOsHost || null
  } catch { return null /* Browser-only or cross-origin embedding has no desktop bridge. */ }
}
function SystemPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [autostart, setAutostart] = useState(false)
  const [update, setUpdate] = useState<UpdateState | null>(null)
  const [error, setError] = useState("")
  const [action, setAction] = useState("")
  const load = useCallback(async () => { setError(""); try { setData(await request("/api/system/health")) } catch (e) { setError(hostError(e)) } }, [])
  useEffect(() => {
    void load()
    const bridge = getHostBridge()
    if (!bridge) return
    void Promise.allSettled([bridge.getAutostart?.(), bridge.getUpdateStatus?.()]).then(([auto, current]) => {
      if (auto.status === "fulfilled") setAutostart(Boolean(auto.value?.enabled))
      else setError("读取自动启动状态失败，请重新打开系统设置。")
      if (current.status === "fulfilled") setUpdate(current.value as UpdateState)
      else setError("读取应用更新状态失败，请重新打开系统设置。")
    })
    return bridge.onUpdateStatus?.(status => setUpdate(status))
  }, [load])
  const runHostAction = async (name: string, fn?: () => Promise<Record<string, unknown>>) => {
    if (!fn) return
    setAction(name); setError("")
    try { setUpdate((await fn()) as UpdateState) } catch (e) { setError(hostError(e)) } finally { setAction("") }
  }
  const bridge = getHostBridge()
  const status = update?.status || "idle"
  const progress = Math.max(0, Math.min(100, Math.round(Number(update?.progress || 0) * 100)))
  return error && !data ? <ErrorPanel message={error} onRetry={() => void load()} /> : !data ? <Busy /> : <div className="grid gap-6 lg:grid-cols-2">
    <Card><CardHeader><CardTitle>运行状态</CardTitle><CardDescription>来自当前本机服务的状态信息</CardDescription></CardHeader><CardContent><dl className="space-y-3">{Object.entries(data).filter(([, v]) => typeof v !== "object").map(([key, value]) => <div key={key} className="flex justify-between gap-4 border-b border-border pb-3 text-sm"><dt className="text-muted-foreground">{{ status: "服务状态", version: "版本", uptime: "运行时长", ok: "服务可用", platform: "系统平台", port: "服务端口" }[key] || "运行信息"}</dt><dd className="break-all">{typeof value === "boolean" ? value ? "正常" : "异常" : String(value)}</dd></div>)}</dl><Button className="mt-5" variant="outline" onClick={() => void load()}><RefreshCw className="size-4" />刷新状态</Button></CardContent></Card>
    <Card><CardHeader><CardTitle>主机管理</CardTitle><CardDescription>仅影响运行 AI OS 的这台 Windows 主机。</CardDescription></CardHeader><CardContent className="space-y-5">
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center justify-between gap-4"><div><h3 className="text-sm font-medium">开机自动启动</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">登录 Windows 后自动运行主机服务，关闭不会停止当前服务。</p></div><Switch aria-label="开机自动启动" checked={autostart} disabled={!bridge?.setAutostart || action === "autostart"} onCheckedChange={async enabled => { if (!bridge?.setAutostart) return; setAction("autostart"); try { const next = await bridge.setAutostart(enabled); setAutostart(Boolean(next.enabled)); } catch (e) { setError(hostError(e)) } finally { setAction("") } }} /></div>
      <div className="border-t border-border pt-5"><div className="flex items-start justify-between gap-4"><div><h3 className="text-sm font-medium">在线更新</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{bridge ? "下载完成后可在空闲时重启应用完成更新。" : "当前运行环境不提供桌面更新桥接。"}</p></div><span className="rounded-full bg-secondary px-2 py-1 text-xs text-muted-foreground">{updateLabels[status] || "状态待确认"}</span></div>{update && <div className="mt-4 grid gap-2 text-xs text-muted-foreground"><div className="flex justify-between gap-4"><span>当前版本</span><strong className="text-foreground">{update.currentVersion || "—"}</strong></div>{update.availableVersion && <div className="flex justify-between gap-4"><span>可用版本</span><strong className="text-primary">{update.availableVersion}</strong></div>}{["downloading", "downloaded", "preparing", "ready"].includes(status) && <progress className="h-2 w-full accent-primary" max="100" value={progress} aria-label="更新进度">{progress}%</progress>}{update.error && <p className="text-destructive" role="alert">{hostError(update.error)}</p>}{update.notes && <p>{update.notes}</p>}</div>}<div className="mt-4 flex flex-wrap gap-3">{bridge?.checkForUpdates && !["checking", "downloading", "preparing", "restarting"].includes(status) && <Button variant="outline" disabled={Boolean(action)} onClick={() => void runHostAction("check", bridge.checkForUpdates)}><RefreshCw className="size-4" />检查更新</Button>}{bridge?.downloadUpdate && status === "available" && <Button disabled={Boolean(action)} onClick={() => void runHostAction("download", bridge.downloadUpdate)}><Download className="size-4" />下载并准备更新</Button>}{bridge?.restartToUpdate && ["downloaded", "ready"].includes(status) && <Button disabled={Boolean(action)} onClick={() => void runHostAction("restart", bridge.restartToUpdate)}><RotateCcw className="size-4" />重启并完成更新</Button>}</div></div>
    </CardContent></Card>
  </div>
}

export function AccountsPage({ user, notify, onUpdate }: Props & { onUpdate: () => void }) {
  const [users, setUsers] = useState<User[]>([])
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialog, setDialog] = useState<"create" | "password" | "logout" | "manage" | null>(null)
  const [selected, setSelected] = useState<User | null>(null)
  const [name, setName] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [temporary, setTemporary] = useState("")
  const [dialogError, setDialogError] = useState("")
  const admin = user?.role === "superadmin"
  const load = useCallback(async () => { setBusy(true); setError(""); try { setUsers((await request<{ users: User[] }>(admin ? "/api/admin/users" : "/api/users/directory")).users || []) } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }, [admin])
  useEffect(() => { void load() }, [load])
  const open = (kind: typeof dialog, target?: User) => { setDialog(kind); setSelected(target || null); setName(""); setDisplayName(target?.displayName || ""); setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setTemporary(""); setDialogError("") }
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setDialogError("")
    try {
      if (dialog === "create") { const result = await request<{ temporaryPassword: string }>("/api/admin/users", "POST", { username: name, displayName }); setTemporary(result.temporaryPassword); await load() }
      else if (dialog === "password") { if (newPassword !== confirmPassword) throw new Error("两次输入的新密码不一致。"); await request("/api/auth/change-password", "POST", { currentPassword, newPassword }); setDialog(null); notify("密码已更新。"); onUpdate() }
      else if (dialog === "manage" && selected) { await request(`/api/admin/users/${encodeURIComponent(selected.id)}`, "PATCH", { displayName }); setDialog(null); await load(); onUpdate(); notify("账户资料已保存。") }
    } catch (e) { setDialogError((e as Error).message) } finally { setSaving(false) }
  }
  return <><Heading title="账户管理" description="查看当前身份、维护登录安全与团队账户。" action={admin ? <Button onClick={() => open("create")}><Plus className="size-4" />新增账户</Button> : undefined} />
    <Card className="mb-8"><CardContent className="flex flex-wrap items-center justify-between gap-6 pt-6"><div className="flex items-center gap-4"><ShieldCheck className="size-6 text-primary" /><div><h2 className="text-base font-medium">{user?.displayName}</h2><p className="mt-1 text-sm text-muted-foreground">{user?.username}，{admin ? "超级管理员" : "普通账户"}</p></div></div><div className="flex flex-wrap gap-3"><Button variant="outline" onClick={() => open("password")}><KeyRound className="size-4" />修改密码</Button><Button variant="ghost" onClick={() => open("logout")}><LogOut className="size-4" />退出登录</Button></div></CardContent></Card>
    <h2 className="mb-4 text-xl font-semibold">{admin ? "全部账户" : "账户目录"}</h2>
    {busy ? <Busy /> : error ? <ErrorPanel message={error} onRetry={() => void load()} /> : !users.length ? <Empty icon={<Users />} title="暂无账户" description="管理员可以添加账户。" /> : <Card><CardContent className="divide-y divide-border p-0">{users.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-5"><div className="min-w-0"><p className="text-sm font-medium">{item.displayName || item.username}</p><p className="mt-1 text-xs text-muted-foreground">{item.username}，{item.role === "superadmin" ? "管理员" : "普通账户"}</p></div><div className="flex items-center gap-3"><Badge variant="secondary">{item.status === "disabled" ? "已停用" : "正常"}</Badge>{admin && <Button variant="outline" size="sm" onClick={() => open("manage", item)}>管理</Button>}</div></div>)}</CardContent></Card>}
    <Modal open={Boolean(dialog)} title={dialog === "create" ? "新增账户" : dialog === "password" ? "修改密码" : dialog === "logout" ? "退出登录" : "管理账户"} description={dialog === "logout" ? "退出前请确认创作内容已保存。" : dialog === "create" ? "新账户首次登录必须修改临时密码。" : "账户权限由本机服务进行校验。"} onClose={() => { if (!saving) { setDialog(null); setTemporary("") } }}>
      {dialog === "logout" ? <Button disabled={saving} onClick={async () => { setSaving(true); try { await request("/api/auth/logout", "POST", {}); hostAction("logout") } catch (e) { setDialogError((e as Error).message) } finally { setSaving(false) } }}>确认退出</Button> :
      temporary ? <div className="space-y-3"><p className="text-sm">临时密码仅在本次操作中显示，请安全交给账户本人。</p><Input readOnly aria-label="临时密码" value={temporary} /><Button onClick={() => { setTemporary(""); setDialog(null) }}>已记录，关闭</Button></div> :
      <form onSubmit={submit} className="space-y-4">{dialog === "create" && <label className="block text-sm">登录名<Input required className="mt-2" value={name} onChange={e => setName(e.target.value)} /></label>}
        {(dialog === "create" || dialog === "manage") && <label className="block text-sm">显示名称<Input required className="mt-2" value={displayName} onChange={e => setDisplayName(e.target.value)} /></label>}
        {dialog === "password" && <>{[["当前密码", currentPassword, setCurrentPassword], ["新密码", newPassword, setNewPassword], ["确认新密码", confirmPassword, setConfirmPassword]].map(([label, value, setter], index) => <label key={String(label)} className="block text-sm">{String(label)}<Input type="password" required minLength={index ? 8 : undefined} autoComplete={index ? "new-password" : "current-password"} className="mt-2" value={String(value)} onChange={e => (setter as (s: string) => void)(e.target.value)} /></label>)}</>}
        {dialogError && <p className="text-sm text-destructive" role="alert">{dialogError}</p>}
        <div className="flex flex-wrap gap-3">{dialog === "manage" && selected && selected.id !== user?.id && <><Button variant="outline" disabled={saving} onClick={async () => { setSaving(true); try { const data = await request<{ temporaryPassword: string }>(`/api/admin/users/${encodeURIComponent(selected.id)}/reset-password`, "POST", {}); setTemporary(data.temporaryPassword) } catch (e) { setDialogError((e as Error).message) } finally { setSaving(false) } }}>重置登录密码</Button><Button variant="outline" disabled={saving} onClick={async () => { setSaving(true); try { await request(`/api/admin/users/${encodeURIComponent(selected.id)}`, "PATCH", { status: selected.status === "disabled" ? "active" : "disabled" }); setDialog(null); await load() } catch (e) { setDialogError((e as Error).message) } finally { setSaving(false) } }}>{selected.status === "disabled" ? "启用账户" : "停用账户"}</Button></>}<Button type="submit" disabled={saving}>{saving ? "保存中…" : dialog === "create" ? "创建账户" : "保存"}</Button></div>
      </form>}
      {dialog === "logout" && dialogError && <p role="alert" className="text-sm text-destructive">{dialogError}</p>}
    </Modal></>
}
