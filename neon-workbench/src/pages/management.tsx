import { useCallback, useEffect, useState } from "react"
import { KeyRound, LogOut, Plus, Server, ShieldCheck, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Heading, Busy, Empty, ErrorPanel, Modal } from "@/components/workbench"
import { request, hostAction } from "@/lib/api"
import type { Preferences, Provider, User } from "@/lib/api"
import { AgentSettings, SkillsSettings, BackupSettings, WorkflowSettings } from "@/pages/advanced-settings"

type Props = { user: User | null; notify: (text: string) => void }
type Model = { id: string; alias?: string; capabilities?: string[]; [key: string]: unknown }
type Connection = Omit<Provider, "models"> & { protocol?: string; models?: Model[] }
export function SettingsPage({ user, notify }: Props) {
  const [tab, setTab] = useState("appearance")
  const [preferences, setPreferences] = useState<Preferences | null>(null)
  const [providers, setProviders] = useState<Connection[]>([])
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editor, setEditor] = useState<Connection | null>(null)
  const [key, setKey] = useState("")
  const [models, setModels] = useState("")
  const [dialogError, setDialogError] = useState("")
  const [remove, setRemove] = useState(false)
  const admin = user?.role === "superadmin"
  const load = useCallback(async () => {
    setBusy(true); setError("")
    try {
      const preferenceData = await request<{ preferences: Preferences }>("/api/preferences")
      setPreferences(preferenceData.preferences)
      if (admin) setProviders((await request<{ providers: Connection[] }>("/api/providers")).providers || [])
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }, [admin])
  const refreshModels = () => window.dispatchEvent(new Event("neon:models-changed"))
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
    setEditor(provider || { id: "", name: "", baseUrl: "", protocol: "openai", enabled: true, models: [] })
    setKey(""); setModels((provider?.models || []).map(m => m.id).join("\n")); setRemove(false); setDialogError("")
  }
  const saveProvider = async (event: React.FormEvent) => {
    event.preventDefault(); if (!editor) return; setSaving(true); setDialogError("")
    try {
      const ids = models.split(/[\n,，]/).map(s => s.trim()).filter(Boolean)
      await request("/api/providers", "POST", { ...editor, ...(editor.id ? {} : { id: crypto.randomUUID() }),
        ...(key ? { apiKey: key } : {}), models: ids.map(id => editor.models?.find(m => m.id === id) || { id }) })
      setKey(""); setEditor(null); refreshModels(); await load(); notify("服务连接已保存。")
    } catch (e) { setDialogError((e as Error).message) } finally { setSaving(false) }
  }
  return <><Heading title="设置" description="把外观、服务连接和运行状态放在同一处管理。" />
    <Tabs value={tab} onValueChange={value => setTab(String(value))} className="mb-6"><TabsList className="h-auto max-w-full flex-wrap justify-start gap-1"><TabsTrigger value="appearance">外观</TabsTrigger>{admin && <><TabsTrigger value="providers">模型服务</TabsTrigger><TabsTrigger value="agent">智能助手</TabsTrigger><TabsTrigger value="skills">技能</TabsTrigger><TabsTrigger value="workflow">工作流</TabsTrigger><TabsTrigger value="backup">备份</TabsTrigger></>}<TabsTrigger value="system">系统</TabsTrigger></TabsList></Tabs>
    {busy ? <Busy /> : error ? <ErrorPanel message={error} onRetry={() => void load()} /> : tab === "appearance" ? <Card className="max-w-3xl"><CardHeader><CardTitle>工作台外观</CardTitle><CardDescription>统一使用 Neon 组件与语义令牌。</CardDescription></CardHeader><CardContent className="space-y-6">
      <div className="flex items-center justify-between gap-4 border-b border-border pb-5"><div><h2 className="text-sm font-medium">界面主题</h2><p className="mt-1 text-xs text-muted-foreground">近黑表面、绿色主行动、低干扰信息层级</p></div><Badge>Neon</Badge></div>
      <label className="flex items-center justify-between gap-4"><span className="text-sm">界面缩放</span><NativeSelect aria-label="界面缩放" className="w-32" value={preferences?.appearance.scale || 1} disabled={saving} onChange={e => void updateAppearance({ scale: Number(e.target.value) })}>{[0.75, 1, 1.25, 1.5, 1.75].map(v => <option key={v} value={v}>{v * 100}%</option>)}</NativeSelect></label>
      <div className="flex items-center justify-between gap-4"><div><h2 className="text-sm">减少动效</h2><p className="mt-1 text-xs text-muted-foreground">减少非必要的过渡与动画</p></div><Switch aria-label="减少动效" disabled={saving} checked={preferences?.appearance.animations === "reduced"} onCheckedChange={value => void updateAppearance({ animations: value ? "reduced" : "full" })} /></div>
    </CardContent></Card> : tab === "providers" ? <><div className="mb-4 flex justify-end"><Button onClick={() => edit()}><Plus className="size-4" />添加服务</Button></div>{providers.length ? <div className="grid gap-4 lg:grid-cols-2">{providers.map(provider => <Card key={provider.id}><CardHeader><div className="flex items-center justify-between gap-3"><CardTitle className="truncate text-base">{provider.name}</CardTitle><Switch aria-label={`启用 ${provider.name}`} checked={provider.enabled !== false} disabled={saving} onCheckedChange={async value => { setSaving(true); try { await request(`/api/providers/${encodeURIComponent(provider.id)}/enabled`, "POST", { enabled: value }); refreshModels(); await load() } catch (e) { notify((e as Error).message) } finally { setSaving(false) } }} /></div><CardDescription className="break-all">{provider.baseUrl || "本地服务"} · {provider.models?.length || 0} 个模型</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => edit(provider)}>管理连接与模型</Button></CardContent></Card>)}</div> : <Empty icon={<Server />} title="尚未配置模型服务" description="添加兼容接口和模型后，可以开始生图与对话。" action={<Button onClick={() => edit()}>添加服务</Button>} />}</> : tab === "agent" ? <AgentSettings notify={notify} /> : tab === "skills" ? <SkillsSettings notify={notify} /> : tab === "workflow" ? <WorkflowSettings notify={notify} /> : tab === "backup" ? <BackupSettings notify={notify} /> : <SystemPage /> }
    <Modal open={Boolean(editor)} title={editor?.id ? "管理模型服务" : "添加模型服务"} description="密钥仅发送到本机服务，不会写入前端代码或浏览器存储。" onClose={() => { if (!saving) { setEditor(null); setKey("") } }}>
      <form onSubmit={saveProvider} className="space-y-4">
        <label className="block text-sm">服务名称<Input required className="mt-2" value={editor?.name || ""} onChange={e => setEditor(p => p && ({ ...p, name: e.target.value }))} /></label>
        <label className="block text-sm">接口地址<Input type="url" className="mt-2" value={editor?.baseUrl || ""} placeholder="https://服务地址/v1" onChange={e => setEditor(p => p && ({ ...p, baseUrl: e.target.value }))} /></label>
        <label className="block text-sm">接口协议<Input className="mt-2" value={editor?.protocol || ""} onChange={e => setEditor(p => p && ({ ...p, protocol: e.target.value }))} /><span className="mt-1 block text-xs text-muted-foreground">已有连接会保留原协议；兼容服务使用 openai。</span></label>
        <label className="block text-sm">API 密钥<Input autoComplete="new-password" type="password" className="mt-2" value={key} placeholder={editor?.id ? "留空保留已保存密钥" : "输入服务密钥"} onChange={e => setKey(e.target.value)} /></label>
        <label className="block text-sm">模型 ID<textarea aria-label="模型 ID" className="mt-2 min-h-24 w-full rounded-lg border border-input bg-background p-3 text-sm focus-visible:outline-2 focus-visible:outline-ring" value={models} onChange={e => setModels(e.target.value)} /><span className="mt-1 block text-xs text-muted-foreground">每行一个 ID。已有模型的能力和协议配置会保留。</span></label>
        {dialogError && <p role="alert" className="text-sm text-destructive">{dialogError}</p>}
        {remove && <p className="text-sm text-destructive">删除后，使用此连接的模型将不可用。确认删除？</p>}
        <div className="flex flex-wrap justify-end gap-3">{editor?.id && <Button variant={remove ? "destructive" : "outline"} disabled={saving} onClick={async () => { if (!remove) { setRemove(true); return } setSaving(true); try { await request(`/api/providers/${encodeURIComponent(editor.id)}`, "DELETE"); setEditor(null); refreshModels(); await load(); notify("连接已删除。") } catch (e) { setDialogError((e as Error).message) } finally { setSaving(false) } }}>{remove ? "确认删除" : "删除连接"}</Button>}<Button type="submit" disabled={saving || !editor?.name.trim()}>{saving ? "保存中…" : "保存连接"}</Button></div>
      </form>
    </Modal></>
}

function SystemPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState("")
  const load = useCallback(async () => { setError(""); try { setData(await request("/api/system/health")) } catch (e) { setError((e as Error).message) } }, [])
  useEffect(() => { void load() }, [load])
  return error ? <ErrorPanel message={error} onRetry={() => void load()} /> : !data ? <Busy /> : <div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle>运行状态</CardTitle><CardDescription>来自当前本机服务的状态信息</CardDescription></CardHeader><CardContent><dl className="space-y-3">{Object.entries(data).filter(([, v]) => typeof v !== "object").map(([key, value]) => <div key={key} className="flex justify-between gap-4 border-b border-border pb-3 text-sm"><dt className="text-muted-foreground">{{ status: "服务状态", version: "版本", uptime: "运行时长", ok: "服务可用", platform: "系统平台", port: "服务端口" }[key] || "运行信息"}</dt><dd className="break-all">{typeof value === "boolean" ? value ? "正常" : "异常" : String(value)}</dd></div>)}</dl><Button className="mt-5" variant="outline" onClick={() => void load()}>刷新状态</Button></CardContent></Card></div>
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
    <Card className="mb-8"><CardContent className="flex flex-wrap items-center justify-between gap-6 pt-6"><div className="flex items-center gap-4"><ShieldCheck className="size-6 text-primary" /><div><h2 className="text-base font-medium">{user?.displayName}</h2><p className="mt-1 text-sm text-muted-foreground">{user?.username} · {admin ? "超级管理员" : "普通账户"}</p></div></div><div className="flex flex-wrap gap-3"><Button variant="outline" onClick={() => open("password")}><KeyRound className="size-4" />修改密码</Button><Button variant="ghost" onClick={() => open("logout")}><LogOut className="size-4" />退出登录</Button></div></CardContent></Card>
    <h2 className="mb-4 text-xl font-semibold">{admin ? "全部账户" : "账户目录"}</h2>
    {busy ? <Busy /> : error ? <ErrorPanel message={error} onRetry={() => void load()} /> : !users.length ? <Empty icon={<Users />} title="暂无账户" description="管理员可以添加账户。" /> : <Card><CardContent className="divide-y divide-border p-0">{users.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-5"><div className="min-w-0"><p className="text-sm font-medium">{item.displayName || item.username}</p><p className="mt-1 text-xs text-muted-foreground">{item.username} · {item.role === "superadmin" ? "管理员" : "普通账户"}</p></div><div className="flex items-center gap-3"><Badge variant="secondary">{item.status === "disabled" ? "已停用" : "正常"}</Badge>{admin && <Button variant="outline" size="sm" onClick={() => open("manage", item)}>管理</Button>}</div></div>)}</CardContent></Card>}
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
