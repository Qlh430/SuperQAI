import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { Modal } from "@/components/workbench"
import { hostAction, request } from "@/lib/api"
import type { Board, Project, Resource, User } from "@/lib/api"

type SharedProps = { refresh: () => Promise<void>; notify: (s: string) => void }
export function AssetActions({ entry, refresh, notify, onClose }: SharedProps & { entry: Resource; onClose: () => void }) {
  const [mode, setMode] = useState("")
  const [password, setPassword] = useState("")
  const [title, setTitle] = useState(entry.resource.title)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => { setMode(""); setPassword(""); setTitle(entry.resource.title); setError("") }, [entry.resource.id, entry.resource.title])
  const action = async (task: () => Promise<unknown>, success: string) => {
    setSaving(true); setError("")
    try { await task(); onClose(); await refresh(); notify(success) } catch (e) { setError((e as Error).message) } finally { setSaving(false) }
  }
  const share = () => { setMode("share"); setError("") }
  return <div className="space-y-4">
    {entry.access.locked ? <form className="space-y-3" onSubmit={e => { e.preventDefault(); const id = entry.access.share?.id; if (!id) { setError("共享信息不完整，请刷新后重试。"); return } void action(() => request(`/api/shares/${encodeURIComponent(id)}/unlock`, "POST", { password }), "素材已解锁。") }}><Input type="password" required value={password} aria-label="共享口令" placeholder="输入共享口令" onChange={e => setPassword(e.target.value)} /><Button type="submit" disabled={saving || !password}>解锁素材</Button></form> : <>
      {mode === "rename" && <form className="flex gap-3" onSubmit={e => { e.preventDefault(); void action(() => request(`/api/resources/${encodeURIComponent(entry.resource.id)}`, "PATCH", { title: title.trim() }), "素材名称已保存。") }}><Input required aria-label="素材名称" value={title} onChange={e => setTitle(e.target.value)} /><Button type="submit" disabled={saving || !title.trim()}>保存</Button></form>}
      {mode === "delete" && <div className="space-y-3"><p className="text-sm text-destructive">删除此素材后，共享访问也会失效。确认删除？</p><Button variant="destructive" disabled={saving} onClick={() => void action(() => request(`/api/resources/${encodeURIComponent(entry.resource.id)}`, "DELETE"), "素材已删除。")}>确认删除</Button></div>}
        {mode === "share" && <ShareEditor key={entry.resource.id} resourceId={entry.resource.id} resourceType={entry.resource.type} shareId={entry.access.share?.id} visibility={entry.access.share?.visibility || "private"} notify={notify} onSaved={async () => { onClose(); await refresh() }} />}
      <div className="flex flex-wrap justify-end gap-3">
        {entry.access.capabilities?.share && <><Button variant="ghost" disabled={saving} onClick={() => { setMode("rename"); setError("") }}>重命名</Button><Button variant="outline" disabled={saving} onClick={() => void share()}>共享设置</Button></>}
        {entry.access.capabilities?.delete && <Button variant="ghost" disabled={saving} onClick={() => setMode("delete")}>删除</Button>}
        {entry.resource.type === "canvas" && <Button onClick={() => { try { hostAction("canvas", { resourceId: entry.resource.id }); onClose() } catch (e) { notify((e as Error).message) } }}>打开画布</Button>}
        {entry.preview?.url && <Button variant="outline" render={<a href={entry.preview.url} download target="_blank" rel="noreferrer" />}>下载文件</Button>}
      </div>
    </>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>
}

export function BoardActions({ board, projects, refresh, notify }: SharedProps & { board: Board; projects: Project[] }) {
  const [open, setOpen] = useState(false)
  const [project, setProject] = useState(board.projectId || "")
  const [title, setTitle] = useState(board.title || board.name || "")
  const [mode, setMode] = useState("")
  const [confirm, setConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const action = async (suffix: string, body: unknown, label: string) => {
    setSaving(true); setError("")
    try { await request(`/api/canvas/boards/${encodeURIComponent(board.id)}/${suffix}`, "POST", body); setOpen(false); await refresh(); notify(label) } catch (e) { setError((e as Error).message) } finally { setSaving(false) }
  }
  // 画布改名走画布自己的 board.patch 操作，服务端会同步素材里的标题。
  const rename = async (event: React.FormEvent) => {
    event.preventDefault()
    const next = title.trim()
    const current = board.title || board.name || ""
    if (!next) { setError("画布名称不能为空。"); return }
    if (next === current) { setError("名称没有变化。"); return }
    setSaving(true); setError("")
    try {
      await request(`/api/canvas/boards/${encodeURIComponent(board.id)}/operations`, "POST", {
        baseRevision: Number(board.revision || 0),
        operations: [{ operationId: crypto.randomUUID(), type: "board.patch", entityId: board.id, before: { title: current }, after: { title: next } }],
      })
      await refresh(); notify("画布已重命名。")
    } catch (e) { setError((e as Error).message) } finally { setSaving(false) }
  }
  if (board.isOwner === false || board.deletedAt) return null
  return <><Button variant="ghost" size="sm" onClick={() => { setOpen(true); setConfirm(false); setMode(""); setError("") }}>管理画布</Button>
    <Modal open={open} title={board.title || "管理画布"} description="重命名、共享和移动画布都不会改变节点与生成关系。" onClose={() => { if (!saving) setOpen(false) }}>
      <form className="space-y-3" onSubmit={rename}><label className="block text-sm">画布名称<Input className="mt-2" required maxLength={120} value={title} onChange={e => setTitle(e.target.value)} /></label><Button type="submit" disabled={saving || !title.trim()}>保存名称</Button></form>
      {board.resourceId && <div className="space-y-3">{mode === "share" ? <ShareEditor key={board.resourceId} resourceId={board.resourceId} resourceType="canvas" shareId={board.share?.id} visibility={board.visibility || board.share?.visibility || "private"} permission={board.permission} notify={notify} onSaved={async () => { setMode(""); await refresh() }} /> : <Button variant="outline" disabled={saving} onClick={() => { setMode("share"); setError("") }}>共享设置</Button>}</div>}
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); void action("project", { projectId: project }, "画布已移入项目。") }}><label className="block text-sm">所属项目<NativeSelect aria-label="所属项目" className="mt-2 w-full" value={project} onChange={e => setProject(e.target.value)}>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect></label><Button type="submit" disabled={saving || !project || project === board.projectId}>保存归属</Button></form>
      {confirm && <p className="text-sm text-destructive">画布将移入回收站，可以从回收站恢复。确认移入？</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button variant={confirm ? "destructive" : "outline"} disabled={saving} onClick={() => confirm ? void action("trash", { operationId: crypto.randomUUID() }, "画布已移入回收站。") : setConfirm(true)}>{confirm ? "确认移入回收站" : "移入回收站"}</Button>
    </Modal></>
}

// 素材与画布共用一套共享设置：可见范围、口令、指定账户；画布额外可选只读/允许编辑。
export function ShareEditor({ resourceId, resourceType, shareId, visibility: initialVisibility = "private", permission: initialPermission = "read", notify, onSaved }: {
  resourceId: string
  resourceType: string
  shareId?: string
  visibility?: string
  permission?: string
  notify: (s: string) => void
  onSaved: () => Promise<void> | void
}) {
  const [visibility, setVisibility] = useState(initialVisibility)
  const [permission, setPermission] = useState(initialPermission)
  const [password, setPassword] = useState("")
  const [members, setMembers] = useState<User[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const data = await request<{ users: User[] }>("/api/users/directory")
        if (alive) setMembers(data.users || [])
      } catch (e) { if (alive) setError((e as Error).message) }
    })()
    return () => { alive = false }
  }, [])
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError("")
    try {
      const payload = { visibility, permission, ...(visibility === "password" ? { password } : {}), ...(visibility === "users" ? { userIds: selected } : {}) }
      await (shareId ? request(`/api/shares/${encodeURIComponent(shareId)}`, "PATCH", payload) : request(`/api/resources/${encodeURIComponent(resourceId)}/shares`, "POST", payload))
      notify("共享权限已保存。")
      await onSaved()
    } catch (e) { setError((e as Error).message) } finally { setSaving(false) }
  }
  return <form className="space-y-4" onSubmit={submit}>
    <label className="block text-sm">可见范围<NativeSelect className="mt-2 w-full" aria-label="共享可见范围" value={visibility} onChange={e => setVisibility(e.target.value)}><option value="private">仅自己可见</option><option value="all">全部账户可见</option><option value="users">指定账户</option><option value="password">使用口令访问</option></NativeSelect></label>
    {visibility === "password" && <Input type="password" aria-label="设置共享口令" value={password} required minLength={8} placeholder="设置至少 8 位共享口令" onChange={e => setPassword(e.target.value)} />}
    {visibility === "users" && <fieldset className="max-h-36 space-y-2 overflow-auto"><legend className="mb-2 text-sm">选择账户</legend>{members.map(user => <label key={user.id} className="flex items-center gap-3 text-sm"><input type="checkbox" checked={selected.includes(user.id)} onChange={e => setSelected(old => e.target.checked ? [...old, user.id] : old.filter(id => id !== user.id))} />{user.displayName || user.username}</label>)}</fieldset>}
    {resourceType === "canvas" && visibility !== "private" && <label className="block text-sm">访问权限<NativeSelect className="mt-2 w-full" aria-label="共享访问权限" value={permission} onChange={e => setPermission(e.target.value)}><option value="read">只读</option><option value="edit">允许编辑</option></NativeSelect></label>}
    <Button type="submit" disabled={saving || (visibility === "users" && !selected.length)}>{saving ? "保存中…" : "保存共享设置"}</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </form>
}
