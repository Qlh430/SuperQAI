import { useEffect, useRef, useState } from "react"
import { Folder, Globe2, MoreHorizontal, Plus, UserRound, UsersRound } from "lucide-react"
import { SidebarItem } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Heading, Empty, Busy, ErrorPanel, SearchBox, Modal } from "@/components/workbench"
import { MediaCard } from "@/components/media-card"
import { AssetPreview } from "@/components/asset-preview"
import { request } from "@/lib/api"
import type { LibraryData, Resource } from "@/lib/api"
import { openAssetRegistration } from "@/lib/asset-library"

type DirectoryEdit = { kind: "categories" | "folders"; id?: string; name: string }
export function Assets({ reloadKey, refresh, notify }: { reloadKey: number; refresh: () => Promise<void>; notify: (s: string) => void }) {
  const [data, setData] = useState<LibraryData>({ entries: [], categories: [], folders: [] })
  const [scopes, setScopes] = useState<Record<string, Resource[]>>({})
  const [scope, setScope] = useState("mine")
  const [category, setCategory] = useState("")
  const [folder, setFolder] = useState("")
  const [query, setQuery] = useState("")
  const [previewId, setPreviewId] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [edit, setEdit] = useState<DirectoryEdit | null>(null)
  const [saving, setSaving] = useState(false)
  const [dialogError, setDialogError] = useState("")
  const [confirm, setConfirm] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const load = async (signal?: AbortSignal) => {
    setLoading(true); setError("")
    try {
      const [mine, publicData, shared] = await Promise.all(["mine", "public", "shared"].map(scope => request<LibraryData>(`/api/asset-library?scope=${scope}`, "GET", undefined, signal)))
      if (!signal?.aborted) { setData(mine); setScopes({ mine: mine.entries || [], public: publicData.entries || [], shared: shared.entries || [] }) }
    } catch (e) { if (!signal?.aborted) setError((e as Error).message) } finally { if (!signal?.aborted) setLoading(false) }
  }
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort() }, [reloadKey])
  const scoped = scopes[scope] || []
  const visible = scoped.filter(entry => (scope !== "mine" || ((!category || entry.asset?.categoryId === category) && (!folder || entry.asset?.folderId === folder))) && entry.resource.title.toLowerCase().includes(query.toLowerCase()))
  const preview = scoped.find(entry => entry.asset?.id === previewId) || null
  const upload = async (file: File) => {
    setSaving(true)
    try {
      const response = await fetch("/api/assets/import", { method: "POST", credentials: "same-origin", headers: { "Content-Type": file.type || "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) }, body: file })
      const result = await response.json()
      if (!response.ok) throw new Error(typeof result.error === "string" && /[\u4e00-\u9fff]/.test(result.error) ? result.error : "素材上传失败，请重试。")
      const resourceId = result.asset?.id || result.asset?.resourceId
      if (!resourceId) throw new Error("上传结果缺少媒体引用，请刷新历史记录后重试入库。")
      await refresh()
      openAssetRegistration([{ resourceId, ...(result.url ? { media: { url: result.url, kind: file.type.split("/")[0], title: file.name } } : {}), name: file.name, categoryId: category || undefined, folderId: folder || undefined }])
    } catch (e) { notify((e as Error).message) } finally { setSaving(false); if (fileInput.current) fileInput.current.value = "" }
  }
  const updateDirectory = async (event: React.FormEvent) => {
    event.preventDefault(); if (!edit) return; setSaving(true); setDialogError("")
    try { await request(`/api/asset-library/${edit.kind}${edit.id ? `/${encodeURIComponent(edit.id)}` : ""}`, edit.id ? "PATCH" : "POST", { name: edit.name.trim(), ...(edit.kind === "folders" ? { categoryId: category } : {}) }); setEdit(null); await load(); notify("资产目录已保存。") } catch (e) { setDialogError((e as Error).message) } finally { setSaving(false) }
  }
  const removeDirectory = async () => {
    if (!edit?.id) return; setSaving(true); setDialogError("")
    try { await request(`/api/asset-library/${edit.kind}/${encodeURIComponent(edit.id)}`, "DELETE"); setEdit(null); setCategory(""); setFolder(""); await load(); notify("已移除目录，媒体文件仍保留。") } catch (e) { setDialogError((e as Error).message) } finally { setSaving(false) }
  }
  const editDirectory = (value: DirectoryEdit) => { setEdit(value); setConfirm(false); setDialogError("") }
  return <><Heading title="资产库" description="主动收藏并分类的图片、视频和音频，可在创作中反复使用。" action={<Button size="lg" disabled={saving} onClick={() => fileInput.current?.click()}><Plus className="size-4" />{saving ? "上传中…" : "导入资产"}</Button>} /><input ref={fileInput} type="file" accept="image/*,video/*,audio/*" hidden onChange={e => { if (e.target.files?.[0]) void upload(e.target.files[0]) }} />
    <div className="neon-asset-library-layout"><aside className="neon-asset-directory"><div className="mb-3 text-xs font-semibold text-primary">资产目录</div><div className="grid gap-1">{[{ id: "mine", label: "我的资产", icon: UserRound }, { id: "public", label: "共享精选", icon: Globe2 }, { id: "shared", label: "共享给我", icon: UsersRound }].map(item => <SidebarItem key={item.id} icon={<item.icon />} label={item.label} aria-label={item.label} active={scope === item.id} aria-pressed={scope === item.id} count={(scopes[item.id] || []).length} className="min-h-11" onClick={() => { setScope(item.id); setCategory(""); setFolder("") }} />)}</div>
      {scope === "mine" && <><div className="my-5 h-px bg-border" /><div className="mb-2 flex items-center justify-between"><span className="text-xs text-muted-foreground">分类与文件夹</span><Button variant="ghost" size="icon" aria-label="新建分类" title="新建分类" onClick={() => editDirectory({ kind: "categories", name: "" })}><Plus className="size-4" /></Button></div><SidebarItem label="全部资产" icon={<Folder />} active={!category} className="min-h-11" onClick={() => { setCategory(""); setFolder("") }} />{data.categories.map(item => <div key={item.id}><div className="flex min-w-0 items-center"><SidebarItem className="min-h-11 min-w-0 flex-1" label={item.name} icon={<Folder />} active={category === item.id && !folder} onClick={() => { setCategory(item.id); setFolder("") }} /><Button variant="ghost" size="icon" title={`管理分类 ${item.name}`} aria-label={`管理分类 ${item.name}`} onClick={() => editDirectory({ kind: "categories", id: item.id, name: item.name })}><MoreHorizontal className="size-4" /></Button></div>{category === item.id && <div className="pl-4">{data.folders.filter(f => f.categoryId === item.id).map(f => <div key={f.id} className="flex min-w-0 items-center"><SidebarItem className="min-h-11 min-w-0 flex-1" label={f.name} icon={<Folder />} active={folder === f.id} onClick={() => setFolder(f.id)} /><Button variant="ghost" size="icon" title={`管理文件夹 ${f.name}`} aria-label={`管理文件夹 ${f.name}`} onClick={() => editDirectory({ kind: "folders", id: f.id, name: f.name })}><MoreHorizontal className="size-4" /></Button></div>)}<Button variant="ghost" className="min-h-11" onClick={() => editDirectory({ kind: "folders", name: "" })}><Plus className="size-4" />新建文件夹</Button></div>}</div>)}</>}
    </aside><section className="min-w-0"><div className="mb-5 flex flex-wrap items-center gap-3"><SearchBox value={query} onChange={setQuery} placeholder="搜索资产名称" /><p className="text-xs text-muted-foreground">{visible.length} 个资产</p></div>{loading ? <Busy /> : error ? <ErrorPanel message={error} onRetry={() => void load()} /> : visible.length ? <div className="neon-asset-masonry">{visible.map(entry => <MediaCard key={entry.asset!.id} entry={entry} description={scope === "mine" ? data.categories.find(c => c.id === entry.asset?.categoryId)?.name || "未分类" : `来自 ${entry.asset?.ownerDisplayName || "其他账户"}`} onClick={() => setPreviewId(entry.asset!.id)} />)}</div> : <Empty icon={<Folder />} title={query ? "没有匹配的资产" : "这里还没有资产"} description={scope === "mine" ? "从画布或历史记录选择成品加入资产库，也可以直接导入。" : scope === "public" ? "所有账户主动发布的精选资产会出现在这里。" : "别人单独分享给你的资产会出现在这里。"} />}</section></div>
    <AssetPreview entry={preview} fullscreen refresh={async () => { await refresh(); await load() }} notify={notify} onClose={() => setPreviewId("")} />
    <Modal open={Boolean(edit)} title={`${edit?.id ? "管理" : "新建"}${edit?.kind === "folders" ? "文件夹" : "分类"}`} description="调整目录名称和位置，已保存的素材仍保留。" onClose={() => { if (!saving) setEdit(null) }}><form className="space-y-4" onSubmit={updateDirectory}><label className="block text-sm">名称<Input aria-label="目录名称" autoFocus required maxLength={120} className="mt-2" value={edit?.name || ""} onChange={e => setEdit(old => old ? { ...old, name: e.target.value } : old)} /></label>{dialogError && <p role="alert" className="text-sm text-destructive">{dialogError}</p>}{confirm && <p className="text-sm text-destructive">确认移除此目录？资产与媒体文件将保留。</p>}<div className="flex flex-wrap justify-end gap-3">{edit?.id && <Button variant={confirm ? "destructive" : "outline"} disabled={saving} onClick={() => confirm ? void removeDirectory() : setConfirm(true)}>{confirm ? "确认移除目录" : "移除目录"}</Button>}<Button type="submit" disabled={saving || !edit?.name.trim()}>保存目录</Button></div></form></Modal>
  </>
}
