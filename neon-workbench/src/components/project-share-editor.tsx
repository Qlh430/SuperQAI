import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { request, type User } from "@/lib/api"
import { textList, textOf } from "@/lib/text"

type ProjectShare = { visibility?: string; permission?: string; userIds?: string[]; ownerDisplayName?: string; independentlySharedCanvasCount?: number }

export function ProjectShareEditor({ projectId, share, notify, onSaved }: { projectId: string; share: ProjectShare; notify: (message: string) => void; onSaved: () => Promise<void> | void }) {
  const [visibility, setVisibility] = useState(share.visibility || "private")
  const [permission, setPermission] = useState(share.permission || "read")
  const [members, setMembers] = useState<User[]>([])
  const [selected, setSelected] = useState<string[]>(share.userIds || [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  useEffect(() => {
    let alive = true
    void request<{ users: User[] }>("/api/users/directory").then(data => { if (alive) setMembers(textList<User>(data.users, ["displayName", "username", "role", "status"])) }).catch(e => { if (alive) setError((e as Error).message) })
    return () => { alive = false }
  }, [])
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError("")
    try {
      const result = await request<{ project: ProjectShare; independentlySharedCanvasCount?: number }>(`/api/canvas/projects/${encodeURIComponent(projectId)}/share`, "PATCH", { visibility, permission, userIds: visibility === "users" ? selected : [] })
      if (visibility === "private" && result.independentlySharedCanvasCount) notify(`项目共享已关闭；${result.independentlySharedCanvasCount} 个画布仍保留独立共享。`)
      else notify("项目共享设置已保存。")
      await onSaved()
    } catch (e) { setError((e as Error).message) } finally { setSaving(false) }
  }
  return <form className="space-y-4" onSubmit={submit}>
    <label className="block text-sm">项目范围<NativeSelect aria-label="项目共享范围" className="mt-2 w-full" value={visibility} onChange={e => setVisibility(e.target.value)}><option value="private">仅自己可见</option><option value="all">全部账户可见</option><option value="users">指定账户</option></NativeSelect></label>
    {visibility === "users" && <fieldset className="max-h-40 space-y-2 overflow-y-auto"><legend className="mb-2 text-sm">选择账户</legend>{members.map(user => <label key={user.id} className="flex items-center gap-3 text-sm"><input type="checkbox" checked={selected.includes(user.id)} onChange={e => setSelected(current => e.target.checked ? [...current, user.id] : current.filter(id => id !== user.id))} />{textOf(user.displayName) || textOf(user.username)}</label>)}</fieldset>}
    {visibility !== "private" && <><label className="block text-sm">访问权限<NativeSelect aria-label="项目画布访问权限" className="mt-2 w-full" value={permission} onChange={e => setPermission(e.target.value)}><option value="read">只读</option><option value="edit">允许编辑</option></NativeSelect></label><p className="text-xs leading-5 text-muted-foreground">项目权限会应用于项目中的现有和新画布。项目共享撤销后，单独共享的画布仍保留原设置。</p></>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="submit" disabled={saving || (visibility === "users" && !selected.length)}>{saving ? "保存中…" : "保存共享设置"}</Button>
  </form>
}

export function ProjectRenameForm({ initialName, saving, onSave }: { initialName: string; saving: boolean; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState(initialName)
  return <form className="space-y-4" onSubmit={event => { event.preventDefault(); void onSave(name.trim()) }}><label className="block text-sm">项目名称<Input className="mt-2" aria-label="项目名称" autoFocus maxLength={80} required value={name} onChange={event => setName(event.target.value)} /></label><Button type="submit" disabled={saving || !name.trim()}>{saving ? "保存中…" : "保存名称"}</Button></form>
}
