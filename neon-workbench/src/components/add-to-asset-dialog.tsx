import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { Busy, Modal } from "@/components/workbench"
import { request } from "@/lib/api"
import type { AssetCandidate, LibraryData } from "@/lib/api"
import { resolveAssetCandidate } from "@/lib/asset-library"

export function AddToAssetDialog({ items, onClose, onSaved }: { items: AssetCandidate[]; onClose: () => void; onSaved: (message: string) => Promise<void> | void }) {
  const [data, setData] = useState<LibraryData | null>(null)
  const [category, setCategory] = useState(items[0]?.categoryId || "other")
  const [folder, setFolder] = useState(items[0]?.folderId || "")
  const [names, setNames] = useState(items.map(item => item.name || item.media?.title || "未命名素材"))
  const [resolvedItems, setResolvedItems] = useState(items)
  const [newFolder, setNewFolder] = useState("")
  const [createFolder, setCreateFolder] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const load = async (signal?: AbortSignal) => {
    setLoading(true); setError("")
    try {
      const [result, resolved] = await Promise.all([
        request<LibraryData>("/api/asset-library?scope=mine", "GET", undefined, signal),
        Promise.all(items.map(item => resolveAssetCandidate(item, signal))),
      ])
      if (signal?.aborted) return
      setResolvedItems(resolved); setNames(resolved.map(item => item.name || item.media?.title || "未命名素材")); setData(result)
      if (!result.categories.some(c => c.id === category)) setCategory(result.categories[0]?.id || "")
    }
    catch (e) { if (!signal?.aborted) setError((e as Error).message) } finally { if (!signal?.aborted) setLoading(false) }
  }
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort() }, [])
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (saving || !data) return
    setSaving(true); setError("")
    try {
      const result = await request<{ duplicate?: boolean; duplicateCount?: number }>("/api/asset-library", "POST", { items: resolvedItems.map((item, index) => ({ ...item, name: names[index].trim(), categoryId: category, folderId: folder || null })) })
      await onSaved(result.duplicate || result.duplicateCount ? "已更新资产归类，重复素材已合并。" : items.length > 1 ? `已将 ${items.length} 个素材加入资产库。` : "已加入资产库。")
      onClose()
    } catch (e) { setError((e as Error).message) } finally { setSaving(false) }
  }
  const addFolder = async () => {
    setSaving(true); setError("")
    try { const result = await request<{ folder: LibraryData["folders"][number] }>("/api/asset-library/folders", "POST", { name: newFolder.trim(), categoryId: category }); setData(old => old ? { ...old, folders: [...old.folders, result.folder] } : old); setFolder(result.folder.id); setCreateFolder(false); setNewFolder("") } catch (e) { setError((e as Error).message) } finally { setSaving(false) }
  }
  return <Modal open title={items.length > 1 ? `加入资产库 · ${items.length} 个素材` : "加入资产库"} description="为当前成品设置名称和目录，默认仅自己可见。" onClose={() => { if (!saving) onClose() }}>
    {loading ? <Busy /> : !data ? <div className="space-y-3"><p role="alert" className="text-sm text-destructive">{error}</p><Button variant="outline" onClick={() => void load()}>重新加载</Button></div> : <form className="space-y-4" onSubmit={save}>
      <div className="max-h-60 space-y-3 overflow-auto">{items.map((item, index) => <div key={`${item.resourceId || item.media?.url}-${index}`} className="flex items-center gap-3">{item.media?.kind === "image" && <img src={item.media.url} alt="" className="size-16 rounded-lg object-cover" />}<label className="min-w-0 flex-1 text-sm">{items.length > 1 ? `素材 ${index + 1} 名称` : "资产名称"}<Input className="mt-2" aria-label={items.length > 1 ? `素材 ${index + 1} 名称` : "资产名称"} required maxLength={120} value={names[index]} onChange={e => setNames(old => old.map((name, i) => i === index ? e.target.value : name))} /></label></div>)}</div>
      <label className="block text-sm">分类<NativeSelect className="mt-2 w-full" aria-label="资产分类" value={category} onChange={e => { setCategory(e.target.value); setFolder("") }}>{data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></label>
      <label className="block text-sm">文件夹<NativeSelect className="mt-2 w-full" aria-label="资产文件夹" value={folder} onChange={e => setFolder(e.target.value)}><option value="">分类根目录</option>{data.folders.filter(f => f.categoryId === category).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</NativeSelect></label>
      {createFolder ? <div className="flex flex-wrap gap-3"><Input className="min-w-0 flex-1" aria-label="新文件夹名称" maxLength={120} value={newFolder} onChange={e => setNewFolder(e.target.value)} placeholder="文件夹名称" /><Button variant="outline" disabled={saving || !newFolder.trim()} onClick={() => void addFolder()}>创建文件夹</Button></div> : <Button variant="ghost" disabled={saving} onClick={() => setCreateFolder(true)}>新建文件夹</Button>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-3"><Button variant="outline" disabled={saving} onClick={onClose}>取消</Button><Button type="submit" disabled={saving || !category || names.some(name => !name.trim())}>{saving ? "保存中…" : "保存到资产库"}</Button></div>
    </form>}
  </Modal>
}
