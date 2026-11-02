import { useEffect, useState } from "react"
import { ArrowLeft, Boxes, Folder, Pencil, Plus, Share2, Trash2, UsersRound, Workflow } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { NativeSelect } from "@/components/ui/native-select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Empty, Heading, Modal, SearchBox } from "@/components/workbench"
import { BoardActions } from "@/components/resource-actions"
import { ProjectRenameForm, ProjectShareEditor } from "@/components/project-share-editor"
import { dateLabel, request, type Board, type Project } from "@/lib/api"
import { createId } from "@/lib/id"
import { textOf } from "@/lib/text"

const SHARED_DIRECTORY = "shared-canvases"
type ProjectDetails = Project & { isOwner?: boolean; ownerDisplayName?: string; permission?: string; visibility?: string; userIds?: string[] }
type BoardDetails = Board & { sharedViaProject?: boolean; projectOwnerDisplayName?: string; ownerDisplayName?: string }
type Props = { projects: ProjectDetails[]; boards: BoardDetails[]; refresh: () => Promise<void>; notify: (message: string) => void; openCanvas: (id?: string) => void; createCanvas: (projectId?: string) => void; create: () => void }

export function Projects({ projects, boards, refresh, notify, openCanvas, createCanvas, create }: Props) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("all")
  const [scope, setScope] = useState("active")
  const [editing, setEditing] = useState<{ project: ProjectDetails; mode: "rename" | "share" } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [deleting, setDeleting] = useState<BoardDetails | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState("")
  const [deletingProject, setDeletingProject] = useState<ProjectDetails | null>(null)
  const [projectDeleteBusy, setProjectDeleteBusy] = useState(false)
  const [projectDeleteError, setProjectDeleteError] = useState("")
  const [cleanupWarning, setCleanupWarning] = useState("")
  const [cleanupBusy, setCleanupBusy] = useState(false)
  const retryCleanup = async () => {
    setCleanupBusy(true)
    try { await request("/api/canvas/boards/cleanup-media", "POST"); setCleanupWarning(""); notify("待清理素材已按画布和资产引用检查完成。") }
    catch (e) { setCleanupWarning((e as Error).message) } finally { setCleanupBusy(false) }
  }
  const returnAll = () => { setFilter("all"); setQuery(""); setScope("active") }
  const deleteProject = async () => {
    if (!deletingProject || projectDeleteBusy) return
    setProjectDeleteBusy(true); setProjectDeleteError("")
    try {
      await request(`/api/canvas/projects/${encodeURIComponent(deletingProject.id)}`, "DELETE")
      setDeletingProject(null); returnAll(); await refresh(); notify("项目已删除，其中全部画布已移入回收站。")
    } catch (e) { setProjectDeleteError((e as Error).message) } finally { setProjectDeleteBusy(false) }
  }
  const deletePermanently = async () => {
    if (!deleting || deleteBusy) return
    setDeleteBusy(true); setDeleteError("")
    try { const result = await request<{ cleanup?: { error?: string } }>(`/api/canvas/boards/${encodeURIComponent(deleting.id)}/permanent`, "DELETE"); setDeleting(null); await refresh(); setCleanupWarning(result.cleanup?.error || ""); notify(result.cleanup?.error ? result.cleanup.error : result.cleanup ? "画布已永久删除，未被其他画布引用且未入库的素材已清理。" : "画布已永久删除。") }
    catch (e) { setDeleteError((e as Error).message) } finally { setDeleteBusy(false) }
  }
  const ownProjects = projects.filter(project => project.isOwner !== false)
  const standaloneShared = boards.filter(board => !board.deletedAt && board.isOwner === false && !board.sharedViaProject)
  const selectedProject = projects.find(project => project.id === filter)
  const canCreate = scope === "active" && filter !== SHARED_DIRECTORY && selectedProject?.isOwner !== false
  useEffect(() => { if (!["all", "none", SHARED_DIRECTORY].includes(filter) && !projects.some(project => project.id === filter)) setFilter("all") }, [projects, filter])
  const filtered = boards.filter(board => {
    if (scope === "trash" ? !board.deletedAt || board.isOwner === false : Boolean(board.deletedAt)) return false
    if (filter === SHARED_DIRECTORY && (board.isOwner !== false || board.sharedViaProject)) return false
    if (!["all", SHARED_DIRECTORY].includes(filter) && (filter === "none" ? Boolean(board.projectId) : board.projectId !== filter)) return false
    return (textOf(board.title) || textOf(board.name)).toLowerCase().includes(query.toLowerCase())
  })
  const rename = async (name: string) => {
    if (!editing) return
    setSaving(true); setError("")
    try { await request(`/api/canvas/projects/${encodeURIComponent(editing.project.id)}`, "PATCH", { name }); setEditing(null); await refresh(); notify("项目名称已更新。") } catch (e) { setError((e as Error).message) } finally { setSaving(false) }
  }
  const select = (id: string) => { setFilter(id); setScope("active") }
  const title = scope === "trash" ? "已删除画布" : filter === SHARED_DIRECTORY ? "共享给我的画布" : selectedProject?.name || (filter === "all" ? "全部画布" : "未归类画布")
  return <>
    <Heading title="项目与画布" description="项目归档创作方向，画布保留每一次编辑和生成关系。" action={<Button size="lg" onClick={create}><Plus className="size-4" />新建项目</Button>} />
    <div className="mb-6 flex flex-wrap items-center gap-3"><SearchBox value={query} onChange={setQuery} placeholder="搜索画布名称" /><NativeSelect aria-label="项目筛选" value={filter} onChange={e => setFilter(e.target.value)} className="w-full sm:w-48"><option value="all">全部项目</option><option value={SHARED_DIRECTORY}>共享给我的画布</option><option value="none">未归类画布</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}{project.isOwner === false ? "（共享项目）" : ""}</option>)}</NativeSelect><Tabs value={scope} onValueChange={value => setScope(String(value))} className="sm:ml-auto"><TabsList><TabsTrigger value="active">画布</TabsTrigger><TabsTrigger value="trash">回收站</TabsTrigger></TabsList></Tabs></div>
    {!query && scope === "active" && <section className="mb-8" aria-label="项目目录"><h2 className="mb-4 text-base font-medium">项目目录</h2><div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      <Card><CardContent className="pt-5"><Button variant={filter === SHARED_DIRECTORY ? "secondary" : "ghost"} aria-pressed={filter === SHARED_DIRECTORY} className="h-auto min-h-11 w-full justify-start gap-3 whitespace-normal py-2" onClick={() => select(SHARED_DIRECTORY)}><UsersRound className="size-5 shrink-0 text-primary" /><span className="min-w-0 flex-1 text-left"><span className="block">共享给我的画布</span><span className="mt-1 block text-xs font-normal text-muted-foreground">单独共享的画布</span></span><Badge variant="secondary">{standaloneShared.length}</Badge></Button></CardContent></Card>
      {projects.map(project => <Card key={project.id}><CardContent className="flex items-center justify-between gap-3 pt-5"><Button variant={filter === project.id ? "secondary" : "ghost"} aria-pressed={filter === project.id} className="h-auto min-h-11 min-w-0 flex-1 justify-start gap-3 whitespace-normal py-2" onClick={() => select(project.id)}><Folder className="size-5 shrink-0 text-primary" /><span className="min-w-0 flex-1 break-words text-left"><span className="block">{project.name}</span>{project.isOwner === false && <span className="mt-1 block text-xs font-normal text-muted-foreground">分享者：{project.ownerDisplayName || "项目所有者"}</span>}</span><Badge variant="secondary">{project.canvasCount || 0}</Badge></Button>{project.isOwner !== false && <div className="flex shrink-0"><Button variant="ghost" size="icon" title={`重命名项目 ${project.name}`} aria-label={`重命名项目 ${project.name}`} onClick={() => { setEditing({ project, mode: "rename" }); setError("") }}><Pencil className="size-4" /></Button><Button variant="ghost" size="icon" title={`共享项目 ${project.name}`} aria-label={`共享项目 ${project.name}`} onClick={() => { setEditing({ project, mode: "share" }); setError("") }}><Share2 className="size-4" /></Button>{project.canDelete === true && <Button variant="ghost" size="icon" title={`删除项目 ${project.name}`} aria-label={`删除项目 ${project.name}`} onClick={() => { setDeletingProject(project); setProjectDeleteError("") }}><Trash2 className="size-4 text-destructive" /></Button>}</div>}</CardContent></Card>)}
    </div></section>}
    {cleanupWarning && <Card className="mb-4"><CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5"><p role="alert" className="min-w-0 flex-1 text-sm text-destructive">{cleanupWarning}</p><Button variant="outline" disabled={cleanupBusy} onClick={() => void retryCleanup()}>{cleanupBusy ? "清理中…" : "重试素材清理"}</Button></CardContent></Card>}
    <section><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 flex-1 items-center gap-3">{(filter !== "all" || scope !== "active") && <Button size="sm" className="shrink-0" aria-label="返回全部画布" title="返回全部画布" onClick={returnAll}><ArrowLeft className="size-4" aria-hidden="true" />返回</Button>}<h2 className="min-w-0 break-words text-base font-medium">{title}<span className="ml-2 text-sm text-muted-foreground">{filtered.length}</span></h2></div>{canCreate && <Button variant="outline" onClick={() => createCanvas(selectedProject?.id)}><Plus className="size-4" />新建画布</Button>}</div>
      {selectedProject?.isOwner === false && <p className="mb-4 text-sm text-muted-foreground">分享者：{selectedProject.ownerDisplayName || "项目所有者"} · {selectedProject.permission === "edit" ? "允许编辑画布" : "只读"}</p>}
      {filtered.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{filtered.map(board => <Card key={board.id}><Button variant="ghost" aria-label={`打开画布 ${textOf(board.title) || textOf(board.name) || "未命名画布"}`} className="aspect-[16/9] h-auto w-full rounded-b-none bg-secondary/40" onClick={() => openCanvas(board.id)} disabled={scope === "trash"}>{(board.previewImages?.[0] || board.thumbnail) ? <img src={board.previewImages?.[0] || board.thumbnail} alt="" loading="lazy" className="size-full object-cover" /> : <Workflow className="size-8 text-muted-foreground" />}</Button><CardHeader><CardTitle className="break-words text-base">{textOf(board.title) || textOf(board.name) || "未命名画布"}</CardTitle><CardDescription>{board.nodeCount || 0} 个节点，{dateLabel(board.updatedAt)}</CardDescription>{board.isOwner === false && <p className="text-xs text-muted-foreground">分享者：{board.projectOwnerDisplayName || board.ownerDisplayName || "画布所有者"} · {board.permission === "edit" ? "允许编辑" : "只读"}</p>}</CardHeader>{scope === "active" && board.isOwner !== false && <CardContent><BoardActions board={board} projects={ownProjects} refresh={refresh} notify={notify} /></CardContent>}{scope === "trash" && board.isOwner !== false && <CardContent className="flex flex-wrap gap-3"><Button disabled={deleteBusy} variant="outline" onClick={async () => { try { await request(`/api/canvas/boards/${encodeURIComponent(board.id)}/restore`, "POST", { operationId: createId() }); await refresh(); notify("画布已恢复。") } catch (e) { notify((e as Error).message) } }}>恢复画布</Button><Button variant="destructive" disabled={deleteBusy} aria-label={`永久删除画布 ${textOf(board.title) || textOf(board.name) || "未命名画布"}`} onClick={() => { setDeleting(board); setDeleteError("") }}><Trash2 className="size-4" />永久删除</Button></CardContent>}</Card>)}</div> : <Empty icon={<Boxes />} title={query ? "没有匹配的画布" : scope === "trash" ? "回收站为空" : filter === SHARED_DIRECTORY ? "还没有单独共享给你的画布" : "还没有画布"} description={query ? "试试另一个名称，或清除项目筛选。" : filter === SHARED_DIRECTORY ? "共享项目中的画布可以从上方对应项目中打开。" : "打开无限画布，开始组织提示词、参考图和生成结果。"} />}
    </section>
    <Modal open={Boolean(deleting)} title="永久删除画布" description={`确认永久删除“${textOf(deleting?.title) || textOf(deleting?.name) || "未命名画布"}”？删除后无法恢复。`} onClose={() => { if (!deleteBusy) setDeleting(null) }}><p className="text-sm leading-6 text-muted-foreground">画布中的节点和连接将永久删除。未被其他画布引用且未加入资产库的素材一并清理，其他素材继续保留。</p>{deleteError && <p role="alert" className="text-sm text-destructive">{deleteError}</p>}<div className="flex flex-wrap justify-end gap-3"><Button variant="outline" disabled={deleteBusy} onClick={() => setDeleting(null)}>取消</Button><Button variant="destructive" disabled={deleteBusy} onClick={() => void deletePermanently()}>{deleteBusy ? "删除中…" : "确认永久删除"}</Button></div></Modal>
    <Modal open={Boolean(deletingProject)} title="删除项目" description={`确认删除“${deletingProject?.name || "此项目"}”及其中全部画布？`} onClose={() => { if (!projectDeleteBusy) setDeletingProject(null) }}><p className="text-sm leading-6 text-muted-foreground">项目目录将删除，其中全部画布进入回收站。需要保留的画布，请先移到其他项目。恢复画布后会归入未分类；素材在画布永久删除时按引用情况清理。</p>{projectDeleteError && <p role="alert" className="text-sm text-destructive">{projectDeleteError}</p>}<div className="flex flex-wrap justify-end gap-3"><Button variant="outline" disabled={projectDeleteBusy} onClick={() => setDeletingProject(null)}>取消</Button><Button variant="destructive" disabled={projectDeleteBusy} onClick={() => void deleteProject()}>{projectDeleteBusy ? "删除中…" : "确认删除项目"}</Button></div></Modal>
    <Modal open={Boolean(editing)} title={editing?.mode === "share" ? "项目共享设置" : "重命名项目"} description={editing?.mode === "share" ? "共享当前项目中的全部画布，新画布也会自动继承。" : "项目内的画布和资源不受影响。"} onClose={() => { if (!saving) setEditing(null) }}>{editing && (editing.mode === "share" ? <ProjectShareEditor key={editing.project.id} projectId={editing.project.id} share={editing.project} notify={notify} onSaved={async () => { setEditing(null); await refresh() }} /> : <ProjectRenameForm key={editing.project.id} initialName={editing.project.name} saving={saving} onSave={rename} />)}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</Modal>
  </>
}
