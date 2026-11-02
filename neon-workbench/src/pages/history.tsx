import { useState } from "react"
import { Check, Clock3, FileImage, Image, MessageSquare, Music2, Pencil, Trash2, Video, X } from "lucide-react"
import { SidebarItem } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { NativeSelect } from "@/components/ui/native-select"
import { Heading, Empty, SearchBox, Modal } from "@/components/workbench"
import { HistoryMasonry } from "@/components/history-masonry"
import { MediaCard } from "@/components/media-card"
import { AssetPreview } from "@/components/asset-preview"
import { dateLabel, hostAction, request } from "@/lib/api"
import type { RecordItem, Resource } from "@/lib/api"
import { textOf } from "@/lib/text"
import { collectHistoryJobs, collectHistoryMedia, compareHistory } from "@/lib/history-media"
import type { HistoryMedia } from "@/lib/history-media"
import { candidateFromResource, openAssetRegistration } from "@/lib/asset-library"

export function History({ resources, records, userId, refresh, notify, go }: { resources: Resource[]; records: RecordItem[]; userId: string; refresh: () => Promise<void>; notify: (s: string) => void; go: (page: "image" | "chat") => void }) {
  const [type, setType] = useState("all")
  const [query, setQuery] = useState("")
  const [source, setSource] = useState("all")
  const [days, setDays] = useState("all")
  const [previewKey, setPreviewKey] = useState("")
  const [editing, setEditing] = useState(false)
  const [selected, setSelected] = useState<RecordItem | null>(null)
  const [batch, setBatch] = useState<string[]>([])
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false)
  const [deletingBatch, setDeletingBatch] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const media = collectHistoryMedia(resources, records, userId)
  const current = media.find(item => item.key === previewKey) || null
  const previewEntry = current ? { ...current.entry, resource: { ...current.entry.resource, metadata: { ...current.entry.resource.metadata, prompt: current.record?.prompt || current.entry.resource.metadata?.prompt || "" } } } : null
  const inTime = (time: string | number) => days === "all" || new Date(time || 0).getTime() >= Date.now() - Number(days) * 86400000
  const list = media.filter(item => (type === "all" || item.entry.resource.type === type) && (source === "all" || item.source === source) && inTime(item.time) && `${item.entry.resource.title}${item.record?.prompt || ""}`.toLowerCase().includes(query.toLowerCase()))
  const tasks = [...records, ...collectHistoryJobs(resources, userId)].filter(record => record.type === "chat" || !(record.images?.length))
    .filter(record => (type === "all" || (type === "chat" ? record.type === "chat" : type === "job" ? record.type !== "chat" : false)) && source !== "upload" && inTime(record.createdAt || record.timestamp || record.updatedAt || "") && `${record.title || ""}${record.prompt || ""}`.toLowerCase().includes(query.toLowerCase()))
  const rows = [...list.map(item => ({ key: 'media:' + item.key, time: item.time, item, record: null as RecordItem | null })), ...tasks.map(record => ({key: 'record:' + record.type + ':' + record.id, time: record.createdAt || record.timestamp || record.updatedAt || '', item: null as HistoryMedia | null, record}))].sort(compareHistory)
  const allKeys = [...media.map(item => ({key: 'media:' + item.key,time:item.time})), ...[...records, ...collectHistoryJobs(resources,userId)].filter(record => record.type === 'chat' || !record.images?.length).map(record => ({key:'record:' + record.type + ':' + record.id,time:record.createdAt || record.timestamp || record.updatedAt || ''}))].sort(compareHistory).map(item => item.key)
  const positions = new Map(allKeys.map((key,index) => [key,index]))
  const visibleRows = rows.filter(row => positions.has(row.key)).sort((a,b) => positions.get(a.key)! - positions.get(b.key)!)
  const visibleMedia = visibleRows.flatMap(row => row.item ? [row.item] : [])
  const selectedMedia = media.filter(item => batch.includes(item.key))
  const allVisibleSelected = visibleMedia.length > 0 && visibleMedia.every(item => batch.includes(item.key))
  const continueRecord = (record: RecordItem) => {
    if (record.boardId) { try { hostAction("canvas", { boardId: record.boardId }); setSelected(null); setPreviewKey("") } catch (e) { notify((e as Error).message) }; return }
    sessionStorage.setItem("neon-reuse", JSON.stringify(record)); setSelected(null); setPreviewKey(""); go(record.type === "chat" ? "chat" : "image")
  }
  const removeRecord = async (record: RecordItem) => { await request(record.resourceId ? `/api/asset-library/history/${encodeURIComponent(record.resourceId)}` : `/api/history/${record.type === "chat" ? "chat" : "images"}?id=${encodeURIComponent(record.id)}`, "DELETE"); setSelected(null); setConfirm(false); await refresh(); notify("历史记录已删除，已入库的资产仍保留。") }
  const removeHistoryMedia = async (item: HistoryMedia) => {
    if (item.entry.resource.id.startsWith("history-result:")) await request("/api/asset-library/history/hide", "POST", candidateFromResource(item.entry))
    else await request(`/api/asset-library/history/${encodeURIComponent(item.entry.resource.id)}`, "DELETE")
  }
  const removeMedia = async (item: HistoryMedia) => {
    await removeHistoryMedia(item); await refresh(); notify("已从历史记录移除，其他引用仍保留。")
    setPreviewKey("")
  }
  const deleteSelectedMedia = async () => {
    if (!selectedMedia.length || deletingBatch) return
    setDeletingBatch(true)
    const results = await Promise.allSettled(selectedMedia.map(removeHistoryMedia))
    try { await refresh() } catch (error) { notify((error as Error).message) }
    const failed = results.filter(result => result.status === "rejected")
    setDeletingBatch(false); setConfirmBatchDelete(false); setBatch([])
    if (failed.length) notify(`已移除 ${results.length - failed.length} 条，${failed.length} 条失败：${(failed[0] as PromiseRejectedResult).reason instanceof Error ? (failed[0] as PromiseRejectedResult).reason.message : "请重试。"}`)
    else notify(`已从历史记录移除 ${results.length} 条，已入库的资产仍保留。`)
  }
  const headingAction = editing ? <div className="flex flex-wrap items-center justify-end gap-2">
    <Button variant="outline" onClick={() => setBatch(allVisibleSelected ? [] : [...new Set([...batch.filter(key => !visibleMedia.some(item => item.key === key)), ...visibleMedia.map(item => item.key)])])}><Check className="size-4" />{allVisibleSelected ? "取消全选" : "全选"}</Button>
    <Button variant="outline" disabled={!selectedMedia.length} onClick={() => { openAssetRegistration(selectedMedia.map(item => candidateFromResource(item.entry)).filter(item => item !== null)); setBatch([]) }}>批量加入资产库</Button>
    <Button variant="ghost" onClick={() => setBatch([])}>取消选择</Button>
    <Button variant="destructive" disabled={!selectedMedia.length || deletingBatch} onClick={() => setConfirmBatchDelete(true)}><Trash2 className="size-4" />删除</Button>
    <Button variant="ghost" onClick={() => { setBatch([]); setEditing(false) }}><X className="size-4" />退出编辑</Button>
  </div> : <Button variant="outline" onClick={() => setEditing(true)}><Pencil className="size-4" />编辑</Button>
  return <><Heading title="历史记录" description="查看自己的生成、上传和对话记录，选择成品加入资产库。" action={headingAction} />
    <div className="neon-asset-library-layout">
      <aside className="neon-asset-directory"><div className="mb-3 text-xs font-medium text-muted-foreground">素材类型</div><div className="grid gap-1">{[{ id: "all", label: "全部", icon: FileImage }, { id: "image", label: "图片", icon: Image }, { id: "video", label: "视频", icon: Video }, { id: "audio", label: "音频", icon: Music2 }, { id: "chat", label: "对话", icon: MessageSquare }, { id: "job", label: "任务", icon: Clock3 }].map(item => <SidebarItem key={item.id} icon={<item.icon />} label={item.label} aria-label={item.label} active={type === item.id} aria-pressed={type === item.id} className="min-h-11" onClick={() => { setType(item.id); setBatch([]) }} />)}</div></aside>
      <section className="min-w-0"><div className="mb-5 flex flex-wrap items-center gap-3"><SearchBox value={query} onChange={setQuery} placeholder="搜索标题或提示词" /><NativeSelect aria-label="历史来源" value={source} onChange={e => setSource(e.target.value)}><option value="all">全部来源</option><option value="generated">生成</option><option value="upload">上传</option></NativeSelect><NativeSelect aria-label="历史时间" value={days} onChange={e => setDays(e.target.value)}><option value="all">全部时间</option><option value="1">最近一天</option><option value="7">最近七天</option><option value="30">最近三十天</option></NativeSelect></div>
        {editing && <div className="mb-4 text-sm text-muted-foreground" aria-live="polite">已选择 {batch.length} 个素材</div>}
        {visibleRows.length ? <HistoryMasonry rows={visibleRows.map(row => ({ key: row.key, entry: row.item?.entry, render: (ratio?: number) => row.item ? <MediaCard stable ratio={ratio} key={row.key} entry={row.item.entry} description={`${row.item.source === "upload" ? "上传" : "生成"}，${dateLabel(row.item.time)}`} selected={editing && batch.includes(row.item!.key)} onSelect={editing ? checked => setBatch(old => checked ? [...old, row.item!.key] : old.filter(key => key !== row.item!.key)) : undefined} onClick={() => setPreviewKey(row.item!.key)} /> : (() => { const record = row.record!; return <Card className="neon-resource-card neon-history-card" key={row.key}><Button variant="ghost" className="h-auto w-full justify-start whitespace-normal p-0 text-left" onClick={() => { setSelected(record); setConfirm(false) }}><CardHeader className="w-full"><CardTitle className="flex items-start gap-3 text-sm">{record.type === "chat" ? <MessageSquare className="size-4 shrink-0" /> : <Clock3 className="size-4 shrink-0" />}<span className="neon-history-summary min-w-0 break-words">{textOf(record.title) || textOf(record.prompt) || "创作记录"}</span></CardTitle><CardDescription className="line-clamp-3 break-words">{record.type === "chat" ? textOf(record.messages?.findLast(message => message.role === "assistant")?.content) || "暂无回复" : record.status === "failed" || record.error ? "生成失败" : ["pending", "queued", "submitting", "running", "syncing", "task_pending"].includes(record.status || "") ? "生成中" : record.status === "unknown" ? "结果待确认" : record.status === "sync_failed" ? "成品同步失败" : "暂无成品"}</CardDescription><CardDescription>{dateLabel(record.createdAt || record.timestamp)}</CardDescription></CardHeader></Button></Card> })() }))} /> : <Empty icon={<Clock3 />} title={query ? "没有匹配的记录" : "暂无记录"} description="生成、上传或发送对话后，记录会出现在这里。" action={editing ? <Button variant="outline" onClick={() => { setBatch([]); setEditing(false) }}>退出编辑</Button> : undefined} />}
      </section>
    </div>
    <AssetPreview entry={previewEntry} fullscreen refresh={refresh} notify={notify} onClose={() => setPreviewKey("")} onDelete={current ? () => removeMedia(current) : undefined} onContinue={current?.record ? () => continueRecord(current.record!) : current?.source === "generated" && current.entry.resource.type === "image" ? () => continueRecord({ id: current.entry.resource.id, type: "image", prompt: current.entry.resource.metadata?.prompt || "", model: current.entry.resource.metadata?.model, boardId: current.entry.resource.metadata?.boardId }) : undefined} />
    <Modal open={confirmBatchDelete} title="删除所选历史记录" description={`确定从历史记录移除所选的 ${selectedMedia.length} 项？已加入资产库或被画布引用的素材会保留。`} onClose={() => { if (!deletingBatch) setConfirmBatchDelete(false) }}><div className="flex flex-wrap justify-end gap-3"><Button variant="outline" disabled={deletingBatch} onClick={() => setConfirmBatchDelete(false)}>返回</Button><Button variant="destructive" disabled={deletingBatch} onClick={() => void deleteSelectedMedia()}>{deletingBatch ? "正在删除…" : "确认删除"}</Button></div></Modal>
    <Modal open={Boolean(selected)} title="创作记录" description={`${textOf(selected?.model) || "模型未记录"}，${dateLabel(selected?.createdAt || selected?.timestamp)}`} onClose={() => { if (!saving) setSelected(null) }}><div className="max-h-80 space-y-4 overflow-auto rounded-lg bg-secondary/30 p-4 text-sm leading-6">{selected?.type === "chat" ? selected.messages?.map((message, index) => <div key={index}><p className="text-xs text-muted-foreground">{message.role === "user" ? "你" : "助手"}</p><p className="whitespace-pre-wrap break-words">{textOf(message.content)}</p></div>) : <><p className="whitespace-pre-wrap break-words">{textOf(selected?.prompt) || "未记录提示词"}</p>{selected?.error && <p role="alert" className="text-destructive">{selected.error}</p>}</>}</div>{confirm && <p className="text-sm text-destructive">确认从历史中删除此记录？已入库的资产仍保留。</p>}<div className="flex flex-wrap justify-end gap-3"><Button variant={confirm ? "destructive" : "outline"} disabled={saving} onClick={async () => { if (!confirm) { setConfirm(true); return } if (!selected) return; setSaving(true); try { await removeRecord(selected) } catch (e) { notify((e as Error).message) } finally { setSaving(false) } }}>{confirm ? "确认删除" : "删除记录"}</Button><Button onClick={() => { if (selected) continueRecord(selected) }}>继续创作</Button></div></Modal>
  </>
}
