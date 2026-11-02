import { createId } from "@/lib/id"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { Modal } from "@/components/workbench"
import { hostAction, request } from "@/lib/api"
import type { Board, Project, Resource, User } from "@/lib/api"
import { textList, textOf } from "@/lib/text"
import { renameCanvas } from "@/lib/canvas-naming"
import { assetMedia } from "@/lib/asset-media"
import { candidateFromResource, openAssetRegistration } from "@/lib/asset-library"
import { downloadMedia } from "@/lib/media-download"

type SharedProps = { refresh: () => Promise<void>; notify: (s: string) => void }
export function AssetActions({ entry, refresh, notify, onClose, onDelete, onContinue }: SharedProps & { entry: Resource; onClose: () => void; onDelete?: () => Promise<void>; onContinue?: () => void }) {
  const [mode, setMode] = useState("")
  const [password, setPassword] = useState("")
  const [title, setTitle] = useState(() => textOf(entry.resource.title))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const downloadUrl = assetMedia(entry)?.url
  useEffect(() => { setMode(""); setPassword(""); setTitle(textOf(entry.resource.title)); setError("") }, [entry.resource.id, entry.resource.title])
  const action = async (task: () => Promise<unknown>, success: string) => {
    setSaving(true); setError("")
    try { await task(); onClose(); await refresh(); notify(success) } catch (e) { setError((e as Error).message) } finally { setSaving(false) }
  }
  const share = () => { setMode("share"); setError("") }
  const asset = entry.asset
  const candidate = candidateFromResource(entry)
  return <div className="space-y-4">
    {entry.access.locked ? <form className="space-y-3" onSubmit={e => { e.preventDefault(); const id = entry.access.share?.id; if (!id) { setError("共享信息不完整，请刷新后重试。"); return } void action(() => request(`/api/shares/${encodeURIComponent(id)}/unlock`, "POST", { password }), "素材已解锁。") }}><Input type="password" required value={password} aria-label="共享口令" placeholder="输入共享口令" onChange={e => setPassword(e.target.value)} /><Button type="submit" disabled={saving || !password}>解锁素材</Button></form> : <>
      {mode === "rename" && <form className="flex gap-3" onSubmit={e => { e.preventDefault(); void action(() => asset ? request(`/api/asset-library/${encodeURIComponent(asset.id)}`, "PATCH", { name: title.trim() }) : request(`/api/resources/${encodeURIComponent(entry.resource.id)}`, "PATCH", { title: title.trim() }), "名称已保存。") }}><Input required aria-label="素材名称" value={title} onChange={e => setTitle(e.target.value)} /><Button type="submit" disabled={saving || !title.trim()}>保存</Button></form>}
      {mode === "delete" && <div className="space-y-3"><p className="text-sm text-destructive">{asset ? "确认从资产库移除？历史和画布中的原文件仍保留。" : onDelete ? "确认从历史中删除？资产与画布引用仍保留。" : "确认删除此素材记录？已入库和画布引用的媒体文件仍保留。"}</p><Button variant="destructive" disabled={saving} onClick={() => void action(() => asset ? request(`/api/asset-library/${encodeURIComponent(asset.id)}`, "DELETE") : onDelete ? onDelete() : request(`/api/resources/${encodeURIComponent(entry.resource.id)}`, "DELETE"), asset ? "已从资产库移除。" : "记录已删除。")}>{asset ? "确认移除" : "确认删除"}</Button></div>}
        {mode === "share" && (asset ? <LibraryShareEditor entry={entry} notify={notify} onSaved={async () => { onClose(); await refresh() }} /> : <ShareEditor key={entry.resource.id} resourceId={entry.resource.id} resourceType={entry.resource.type} shareId={entry.access.share?.id} visibility={entry.access.share?.visibility || "private"} userIds={entry.access.share?.userIds} notify={notify} onSaved={async () => { onClose(); await refresh() }} />)}
      <div className="flex flex-wrap justify-end gap-3">
        {entry.access.capabilities?.share && <><Button variant="ghost" disabled={saving} onClick={() => { setMode("rename"); setError("") }}>重命名</Button><Button variant="outline" disabled={saving} onClick={() => void share()}>共享设置</Button></>}
        {(entry.access.capabilities?.delete || onDelete) && <Button variant="ghost" disabled={saving} onClick={() => setMode("delete")}>{asset ? "移除资产" : "删除"}</Button>}
        {candidate && (!asset || entry.access.capabilities?.share) && <Button variant="outline" disabled={saving} onClick={() => { onClose(); openAssetRegistration([candidate]) }}>{asset ? "更改归类" : "加入资产库"}</Button>}
        {onContinue && <Button variant="outline" onClick={onContinue}>继续创作</Button>}
        {entry.resource.type === "canvas" && <Button onClick={() => { try { hostAction("canvas", { resourceId: entry.resource.id }); onClose() } catch (e) { notify((e as Error).message) } }}>打开画布</Button>}
        {downloadUrl && <Button variant="outline" disabled={saving} onClick={async () => { setSaving(true); setError(""); try { await downloadMedia(downloadUrl, textOf(entry.resource.title)) } catch (e) { setError((e as Error).message) } finally { setSaving(false) } }}>下载文件</Button>}
      </div>
    </>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>
}

function LibraryShareEditor({ entry, notify, onSaved }: { entry: Resource; notify: (message: string) => void; onSaved: () => Promise<void> }) {
  const [visibility, setVisibility] = useState(entry.asset?.visibility || "private")
  const [selected, setSelected] = useState(entry.asset?.userIds || [])
  const [users, setUsers] = useState<User[]>([])
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  useEffect(() => { const controller = new AbortController(); void request<{ users: User[] }>("/api/users/directory", "GET", undefined, controller.signal).then(data => setUsers(data.users.filter(user => user.id !== entry.asset?.ownerUserId))).catch(e => { if (!controller.signal.aborted) setError(e.message) }); return () => controller.abort() }, [entry.asset?.ownerUserId])
  return <form className="space-y-4" onSubmit={async e => { e.preventDefault(); setSaving(true); setError(""); try { await request(`/api/asset-library/${encodeURIComponent(entry.asset!.id)}/share`, "PATCH", { visibility, userIds: visibility === "users" ? selected : [] }); await onSaved(); notify("资产共享设置已保存。") } catch (e) { setError((e as Error).message) } finally { setSaving(false) } }}>
    <label className="block text-sm">可见范围<NativeSelect aria-label="共享可见范围" className="mt-2 w-full" value={visibility} onChange={e => setVisibility(e.target.value)}><option value="private">仅自己可见</option><option value="all">共享精选 · 全部账户可见</option><option value="users">指定账户</option></NativeSelect></label>
    {visibility === "users" && <fieldset className="max-h-40 space-y-2 overflow-auto"><legend className="mb-2 text-sm">选择账户</legend>{users.map(user => <label key={user.id} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={selected.includes(user.id)} onChange={e => setSelected(old => e.target.checked ? [...old, user.id] : old.filter(id => id !== user.id))} />{textOf(user.displayName) || textOf(user.username)}</label>)}</fieldset>}
    <p className="text-xs text-muted-foreground">其他账户可以查看和使用，不能修改你的资产。撤销共享后，对方此前主动入库保存的引用仍保留。</p><Button disabled={saving || (visibility === "users" && !selected.length)} type="submit">{saving ? "保存中…" : "保存共享设置"}</Button>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </form>
}

export function BoardActions({ board, projects, refresh, notify }: SharedProps & { board: Board; projects: Project[] }) {
  const [open, setOpen] = useState(false)
  const [project, setProject] = useState(board.projectId || "")
  const [title, setTitle] = useState(() => textOf(board.title) || textOf(board.name))
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
    const current = textOf(board.title) || textOf(board.name)
    if (!next) { setError("画布名称不能为空。"); return }
    if (next === current) { setError("名称没有变化。"); return }
    setSaving(true); setError("")
    try {
      await renameCanvas(board, next)
      await refresh(); notify("画布已重命名。")
    } catch (e) { setError((e as Error).message) } finally { setSaving(false) }
  }
  if (board.isOwner === false || board.deletedAt) return null
  return <><Button variant="ghost" size="sm" onClick={() => { setOpen(true); setConfirm(false); setMode(""); setError("") }}>管理画布</Button>
    <Modal open={open} title={textOf(board.title) || textOf(board.name) || "管理画布"} description="重命名、共享和移动画布都不会改变节点与生成关系。" onClose={() => { if (!saving) setOpen(false) }}>
      <form className="space-y-3" onSubmit={rename}><label className="block text-sm">画布名称<Input className="mt-2" required maxLength={120} value={title} onChange={e => setTitle(e.target.value)} /></label><Button type="submit" disabled={saving || !title.trim()}>保存名称</Button></form>
      {board.resourceId && <div className="space-y-3">{mode === "share" ? <ShareEditor key={board.resourceId} resourceId={board.resourceId} resourceType="canvas" shareId={board.share?.id} visibility={board.visibility || board.share?.visibility || "private"} permission={board.share?.permission || (board.permission === "owner" ? "read" : board.permission)} userIds={board.share?.userIds} notify={notify} onSaved={async () => { setMode(""); await refresh() }} /> : <Button variant="outline" disabled={saving} onClick={() => { setMode("share"); setError("") }}>共享设置</Button>}</div>}
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); void action("project", { projectId: project }, "画布已移入项目。") }}><label className="block text-sm">所属项目<NativeSelect aria-label="所属项目" className="mt-2 w-full" value={project} onChange={e => setProject(e.target.value)}>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</NativeSelect></label><Button type="submit" disabled={saving || !project || project === board.projectId}>保存归属</Button></form>
      {confirm && <p className="text-sm text-destructive">画布将移入回收站，可以从回收站恢复。确认移入？</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button variant={confirm ? "destructive" : "outline"} disabled={saving} onClick={() => confirm ? void action("trash", { operationId: createId() }, "画布已移入回收站。") : setConfirm(true)}>{confirm ? "确认移入回收站" : "移入回收站"}</Button>
    </Modal></>
}

// 素材与画布共用一套共享设置：可见范围、口令、指定账户；画布额外可选只读/允许编辑。
export function ShareEditor({ resourceId, resourceType, shareId, visibility: initialVisibility = "private", permission: initialPermission = "read", userIds = [], notify, onSaved }: {
  resourceId: string
  resourceType: string
  shareId?: string
  visibility?: string
  permission?: string
  userIds?: string[]
  notify: (s: string) => void
  onSaved: () => Promise<void> | void
}) {
  const [visibility, setVisibility] = useState(initialVisibility)
  const [permission, setPermission] = useState(initialPermission)
  const [password, setPassword] = useState("")
  const [members, setMembers] = useState<User[]>([])
  const [selected, setSelected] = useState<string[]>(userIds)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const data = await request<{ users: User[] }>("/api/users/directory")
        if (alive) setMembers(textList<User>(data.users, ["displayName", "username", "role", "status"]))
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
    {visibility === "users" && <fieldset className="max-h-36 space-y-2 overflow-auto"><legend className="mb-2 text-sm">选择账户</legend>{members.map(user => <label key={user.id} className="flex items-center gap-3 text-sm"><input type="checkbox" checked={selected.includes(user.id)} onChange={e => setSelected(old => e.target.checked ? [...old, user.id] : old.filter(id => id !== user.id))} />{textOf(user.displayName) || textOf(user.username)}</label>)}</fieldset>}
    {resourceType === "canvas" && visibility !== "private" && <label className="block text-sm">访问权限<NativeSelect className="mt-2 w-full" aria-label="共享访问权限" value={permission} onChange={e => setPermission(e.target.value)}><option value="read">只读</option><option value="edit">允许编辑</option></NativeSelect></label>}
    <Button type="submit" disabled={saving || (visibility === "users" && !selected.length)}>{saving ? "保存中…" : "保存共享设置"}</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </form>
}
