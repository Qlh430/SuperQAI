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
  const [visibility, setVisibility] = useState("private")
  const [permission, setPermission] = useState("read")
  const [members, setMembers] = useState<User[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => { setMode(""); setPassword(""); setTitle(entry.resource.title); setError("") }, [entry.resource.id, entry.resource.title])
  const action = async (task: () => Promise<unknown>, success: string) => {
    setSaving(true); setError("")
    try { await task(); onClose(); await refresh(); notify(success) } catch (e) { setError((e as Error).message) } finally { setSaving(false) }
  }
  const share = async () => {
    setMode("share"); setVisibility(entry.access.share?.visibility || "private")
    try { setMembers((await request<{ users: User[] }>("/api/users/directory")).users || []) } catch (e) { setError((e as Error).message) }
  }
  return <div className="space-y-4">
    {entry.access.locked ? <form className="space-y-3" onSubmit={e => { e.preventDefault(); const id = entry.access.share?.id; if (!id) { setError("共享信息不完整，请刷新后重试。"); return } void action(() => request(`/api/shares/${encodeURIComponent(id)}/unlock`, "POST", { password }), "素材已解锁。") }}><Input type="password" required value={password} aria-label="共享口令" placeholder="输入共享口令" onChange={e => setPassword(e.target.value)} /><Button type="submit" disabled={saving || !password}>解锁素材</Button></form> : <>
      {mode === "rename" && <form className="flex gap-3" onSubmit={e => { e.preventDefault(); void action(() => request(`/api/resources/${encodeURIComponent(entry.resource.id)}`, "PATCH", { title: title.trim() }), "素材名称已保存。") }}><Input required aria-label="素材名称" value={title} onChange={e => setTitle(e.target.value)} /><Button type="submit" disabled={saving || !title.trim()}>保存</Button></form>}
      {mode === "delete" && <div className="space-y-3"><p className="text-sm text-destructive">删除此素材后，共享访问也会失效。确认删除？</p><Button variant="destructive" disabled={saving} onClick={() => void action(() => request(`/api/resources/${encodeURIComponent(entry.resource.id)}`, "DELETE"), "素材已删除。")}>确认删除</Button></div>}
      {mode === "share" && <form className="space-y-4" onSubmit={e => { e.preventDefault(); const payload = { visibility, permission, ...(visibility === "password" ? { password } : {}), ...(visibility === "users" ? { userIds: selected } : {}) }; void action(() => entry.access.share?.id ? request(`/api/shares/${encodeURIComponent(entry.access.share.id)}`, "PATCH", payload) : request(`/api/resources/${encodeURIComponent(entry.resource.id)}/shares`, "POST", payload), "共享权限已保存。") }}>
        <label className="block text-sm">可见范围<NativeSelect className="mt-2 w-full" aria-label="共享可见范围" value={visibility} onChange={e => setVisibility(e.target.value)}><option value="private">仅自己可见</option><option value="all">全部账户可见</option><option value="users">指定账户</option><option value="password">使用口令访问</option></NativeSelect></label>
        {visibility === "password" && <Input type="password" aria-label="设置共享口令" value={password} required minLength={8} placeholder="设置至少 8 位共享口令" onChange={e => setPassword(e.target.value)} />}
        {visibility === "users" && <fieldset className="max-h-36 space-y-2 overflow-auto"><legend className="mb-2 text-sm">选择账户</legend>{members.map(user => <label key={user.id} className="flex items-center gap-3 text-sm"><input type="checkbox" checked={selected.includes(user.id)} onChange={e => setSelected(old => e.target.checked ? [...old, user.id] : old.filter(id => id !== user.id))} />{user.displayName || user.username}</label>)}</fieldset>}
        {entry.resource.type === "canvas" && visibility !== "private" && <label className="block text-sm">访问权限<NativeSelect className="mt-2 w-full" aria-label="共享访问权限" value={permission} onChange={e => setPermission(e.target.value)}><option value="read">只读</option><option value="edit">允许编辑</option></NativeSelect></label>}
        <Button type="submit" disabled={saving || (visibility === "users" && !selected.length)}>{saving ? "保存中…" : "保存共享设置"}</Button>
      </form>}
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
  const [confirm, setConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const action = async (suffix: string, body: unknown, label: string) => {
    setSaving(true); setError("")
    try { await request(`/api/canvas/boards/${encodeURIComponent(board.id)}/${suffix}`, "POST", body); setOpen(false); await refresh(); notify(label) } catch (e) { setError((e as Error).message) } finally { setSaving(false) }
  }
  if (board.isOwner === false || board.deletedAt) return null
  return <><Button variant="ghost" size="sm" onClick={() => { setOpen(true); setConfirm(false); setError("") }}>管理画布</Button>
    <Modal open={open} title={board.title || "管理画布"} description="移动画布不会改变节点与生成关系。" onClose={() => { if (!saving) setOpen(false) }}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); void action("project", { projectId: project }, "画布已移入项目。") }}><label className="block text-sm">所属项目<NativeSelect aria-label="所属项目" className="mt-2 w-full" value={project} onChange={e => setProject(e.target.value)}>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect></label><Button type="submit" disabled={saving || !project || project === board.projectId}>保存归属</Button></form>
      {confirm && <p className="text-sm text-destructive">画布将移入回收站，可以从回收站恢复。确认移入？</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button variant={confirm ? "destructive" : "outline"} disabled={saving} onClick={() => confirm ? void action("trash", { operationId: crypto.randomUUID() }, "画布已移入回收站。") : setConfirm(true)}>{confirm ? "确认移入回收站" : "移入回收站"}</Button>
    </Modal></>
}
