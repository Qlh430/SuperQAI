import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowLeft, ArrowUpRight, Boxes, CircleAlert, Clock3, FileImage, Folder, ImagePlus, LayoutDashboard, Menu, MessageSquare, MoreHorizontal, PanelLeftClose, Plus, RefreshCw, Settings2, Users, Workflow, X, Image as ImageIcon, Video, Music2, Globe2, UserRound, UsersRound } from "lucide-react"
import { Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarItem, SidebarGroup, SidebarGroupLabel } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { NativeSelect } from "@/components/ui/native-select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Heading, Empty, Busy, ErrorPanel, SearchBox, Modal, Notice } from "@/components/workbench"
import { dateLabel, hostAction, request } from "@/lib/api"
import type { Board, Project, Resource, RecordItem, User } from "@/lib/api"
import { SettingsPage, AccountsPage, PasswordDialog } from "@/pages/management"
import { ImageWorkspace, ChatWorkspace } from "@/pages/creative"
import { AssetActions, BoardActions } from "@/components/resource-actions"
import { uploadImage } from "@/pages/creative"

type Page = "home" | "projects" | "assets" | "history" | "settings" | "account" | "image" | "chat"
const pages = new Set<Page>(["home", "projects", "assets", "history", "settings", "account", "image", "chat"])
const navigation = [
  { title: "工作空间", items: [{ id: "home", label: "概览", icon: LayoutDashboard }, { id: "projects", label: "项目", icon: Boxes }, { id: "assets", label: "素材库", icon: Folder }, { id: "history", label: "历史记录", icon: Clock3 }] },
  { title: "创作工具", items: [{ id: "image", label: "在线生图", icon: ImagePlus }, { id: "chat", label: "AI 对话", icon: MessageSquare }] },
  { title: "管理", items: [{ id: "settings", label: "设置", icon: Settings2 }, { id: "account", label: "账户管理", icon: Users }] },
] as const
const labels: Record<Page, string> = { home: "概览", projects: "项目", assets: "素材库", history: "历史记录", settings: "设置", account: "账户管理", image: "在线生图", chat: "AI 对话" }
function hashPage() { const value = location.hash.slice(1) as Page; return pages.has(value) ? value : "home" }

export default function App() {
  const [page, setPage] = useState<Page>(hashPage)
  const [user, setUser] = useState<User | null>(null)
  const [boards, setBoards] = useState<Board[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [records, setRecords] = useState<RecordItem[]>([])
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [pageErrors, setPageErrors] = useState<Partial<Record<Page, string>>>({})
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [mobileMenu, setMobileMenu] = useState(false)
  const [collapsed, setCollapsed] = useState(() => sessionStorage.getItem("neon-nav-collapsed") === "true")
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)
  const [dialogError, setDialogError] = useState("")
  const [passwordGate, setPasswordGate] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [settingsSource, setSettingsSource] = useState<Page | null>(null)
  const [reuseVersion, setReuseVersion] = useState({ image: 0, chat: 0 })
  const visitedCreative = useRef({ image: page === "image", chat: page === "chat" })
  const visitedPages = useRef(new Set<Page>([page]))
  const originPage = useRef<Page>("home")
  const scrollPositions = useRef<Partial<Record<Page, number>>>({})
  const content = useRef<HTMLElement>(null)
  const refresh = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const session = await request<{ user: User }>("/api/auth/session")
      setUser(session.user)
      if (!session.user) throw new Error("请先登录工作台。")
      const [projectData, boardData, resourceData, imageData, chatData, preferenceData] = await Promise.allSettled([
        request<{ projects: Project[] }>("/api/canvas/projects"),
        request<{ boards: Board[]; trash?: Board[] }>("/api/canvas/boards?scope=all"),
        request<{ resources: Resource[] }>("/api/resources"),
        request<{ records: RecordItem[] }>("/api/history/images"),
        request<{ records: RecordItem[] }>("/api/history/chat"),
        request<{ preferences?: { appearance?: { scale?: number; animations?: string } } }>("/api/preferences"),
      ])
        // 未改临时密码时服务端会拦住所有业务接口；这时候不能只说“加载失败”，
        // 要直接告诉用户去改密码，并在这里给出改密入口。
        const needsPasswordChange = [projectData, boardData, resourceData, imageData, chatData, preferenceData]
          .some(result => result.status === "rejected" && (result.reason as { code?: string })?.code === "password_change_required")
        setPasswordGate(needsPasswordChange)
      const nextErrors: Partial<Record<Page, string>> = {}
      if (projectData.status === "fulfilled") setProjects(projectData.value.projects || [])
      else nextErrors.projects = projectData.reason.message
      if (boardData.status === "fulfilled") setBoards([...(boardData.value.boards || []), ...(boardData.value.trash || []).map(board => ({ ...board, deletedAt: board.deletedAt || "已删除" }))])
      else nextErrors.projects = boardData.reason.message
      if (resourceData.status === "fulfilled") setResources(resourceData.value.resources || [])
      else nextErrors.assets = resourceData.reason.message
      if (imageData.status === "fulfilled" && chatData.status === "fulfilled") {
        setRecords([...(imageData.value.records || []).map(r => ({ ...r, type: "image" })), ...(chatData.value.records || []).map(r => ({ ...r, type: "chat" }))].sort((a, b) => new Date(b.updatedAt || b.createdAt || b.timestamp || 0).getTime() - new Date(a.updatedAt || a.createdAt || a.timestamp || 0).getTime()))
      } else nextErrors.history = imageData.status === "rejected" ? imageData.reason.message : chatData.status === "rejected" ? chatData.reason.message : ""
      if (preferenceData.status === "fulfilled") {
        document.documentElement.style.fontSize = `${16 * (preferenceData.value.preferences?.appearance?.scale || 1)}px`
        document.documentElement.dataset.motion = preferenceData.value.preferences?.appearance?.animations || "full"
        } else if (!needsPasswordChange) setNotice("外观偏好读取失败，暂时使用默认外观。")
        if (Object.values(nextErrors).length && !needsPasswordChange) nextErrors.home = "部分工作空间数据加载失败，可以进入其他页面操作，或重试加载。"
      setPageErrors(nextErrors); setReady(true)
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => {
    void refresh()
    const onHash = () => { const next = hashPage(); visitedPages.current.add(next); if (next === "image" || next === "chat") visitedCreative.current[next] = true; setPage(next); setMobileMenu(false) }
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== window.parent) return
      if (event.data?.type === "neon:refresh") void refresh()
      if (event.data?.type === "neon:return") {  location.hash = sessionStorage.getItem("neon-canvas-source") || hashPage(); void refresh() }
      if (event.data?.type === "neon:error") setNotice(event.data.message || "工具打开失败。")
    }
    window.addEventListener("hashchange", onHash); window.addEventListener("message", onMessage)
    const pendingHostAction = sessionStorage.getItem("neon-pending-host-action")
    if (pendingHostAction && window.parent !== window) {
      sessionStorage.removeItem("neon-pending-host-action")
      try {
        const intent = JSON.parse(pendingHostAction) as { action?: string; params?: unknown }
        if (intent.action === "canvas") hostAction("canvas", intent.params)
      } catch {
        setNotice("画布入口状态无效，请从概览页重新打开。")
      }
    }
    return () => { window.removeEventListener("hashchange", onHash); window.removeEventListener("message", onMessage) }
  }, [refresh])
  useEffect(() => { document.title = `${labels[page]}，AI OS`; if (ready && content.current) content.current.scrollTop = scrollPositions.current[page] || 0 }, [page, ready])
  useEffect(() => { sessionStorage.setItem("neon-nav-collapsed", String(collapsed)) }, [collapsed])
  const go = (next: Page) => {
    if (content.current) scrollPositions.current[page] = content.current.scrollTop
    if ((next === "image" || next === "chat") && page !== "settings") originPage.current = page
    if (next === "image" || next === "chat") visitedCreative.current[next] = true
    if ((next === "image" || next === "chat") && sessionStorage.getItem("neon-reuse")) setReuseVersion(previous => ({ ...previous, [next]: previous[next] + 1 }))
    if (next === settingsSource) setSettingsSource(null)
    visitedPages.current.add(next)
    setPage(next); location.hash = next; setMobileMenu(false)
  }
  const configure = () => { setSettingsSource(page); go("settings") }
  const openCanvas = (id?: string) => {
    originPage.current = page
    sessionStorage.setItem("neon-canvas-source", page)
    try { hostAction("canvas", id ? { boardId: id } : undefined) } catch (e) { setNotice((e as Error).message) }
  }
  const create = async (event: React.FormEvent) => {
    event.preventDefault(); if (!name.trim() || saving) return
    setSaving(true); setDialogError("")
    try { await request("/api/canvas/projects", "POST", { name: name.trim() }); setCreateOpen(false); setName(""); await refresh(); go("projects"); setNotice("项目已创建，可以在项目中添加画布。") }
    catch (e) { setDialogError((e as Error).message) } finally { setSaving(false) }
  }
  const openCreate = () => { setMobileMenu(false); setDialogError(""); setName(""); setCreateOpen(true) }
  if (!user) return <div className="h-svh bg-background p-8">{loading ? <Busy /> : <ErrorPanel message={error || "请先登录工作台。"} onRetry={() => window.parent === window ? location.assign("/") : hostAction("sessionExpired")} />}</div>
  const sidebar = <Sidebar collapsed={collapsed} className={`h-full shrink-0 ${mobileMenu ? "w-60" : ""}`}>
    <SidebarContent className="gap-6 px-3 py-6">
    <SidebarHeader className="h-auto justify-between border-0 px-2 py-1">
      <div className="flex items-center gap-2"><Workflow className="size-5 shrink-0 text-primary" aria-hidden="true" />{(!collapsed || mobileMenu) && <strong className="whitespace-nowrap text-sm">AI OS</strong>}</div>
      {mobileMenu && <Button variant="ghost" size="icon" onClick={() => setMobileMenu(false)} title="关闭导航" aria-label="关闭导航"><X className="size-4" /></Button>}
    </SidebarHeader>
      <Button size="lg" className="w-full shrink-0 px-3" title="新建项目" aria-label="新建项目" onClick={openCreate}><Plus className="size-4 shrink-0" />{(!collapsed || mobileMenu) && "新建项目"}</Button>
      {navigation.map(group => <SidebarGroup key={group.title}>{(!collapsed || mobileMenu) && <SidebarGroupLabel className="pb-2 text-xs">{group.title}</SidebarGroupLabel>}{group.items.map(item => <SidebarItem key={item.id} collapsed={collapsed && !mobileMenu} icon={<item.icon />} label={item.label} title={item.label} aria-label={item.label} aria-current={page === item.id ? "page" : undefined} active={page === item.id} className="min-h-11" onClick={() => go(item.id)} />)}</SidebarGroup>)}
      <SidebarFooter className="mt-auto border-0 p-0"><SidebarItem collapsed={collapsed && !mobileMenu} icon={<span className="grid size-6 place-items-center rounded-full bg-secondary text-xs">{user?.displayName?.slice(0, 1) || "我"}</span>} label={user?.displayName || "当前账户"} title="查看账户" onClick={() => go("account")} /><SidebarItem collapsed={collapsed && !mobileMenu} icon={<PanelLeftClose />} label={collapsed ? "展开导航" : "收起导航"} title={collapsed ? "展开导航" : "收起导航"} aria-label={collapsed ? "展开导航" : "收起导航"} onClick={() => setCollapsed(!collapsed)} className="hidden md:flex" /></SidebarFooter>
    </SidebarContent>
  </Sidebar>
  const toolbar = <header className="mb-6 flex shrink-0 items-center justify-between gap-3" aria-label="工作台工具栏">
    <div className="flex min-w-0 items-center gap-3"><Button variant="ghost" size="icon" className="md:hidden" aria-label="打开导航" title="打开导航" onClick={() => setMobileMenu(true)}><Menu className="size-5" /></Button><span className="truncate text-sm font-medium text-muted-foreground">{page === "home" ? "我的工作空间" : labels[page]}</span></div>
    <div className="flex items-center gap-2"><Badge variant="secondary" className="hidden sm:flex">本地工作台</Badge><Button variant="ghost" size="icon" onClick={() => void refresh()} disabled={loading} aria-label="刷新数据" title="刷新数据"><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /></Button></div>
  </header>
  return <div className="flex h-svh min-w-0 bg-background">
    <div className="hidden h-full md:block">{sidebar}</div>
    <Dialog open={mobileMenu} onOpenChange={setMobileMenu}><DialogContent showCloseButton={false} className="left-0 top-0 flex h-svh w-60 max-w-full translate-x-0 translate-y-0 gap-0 rounded-none border-0 p-0 data-starting-style:translate-y-0 data-ending-style:translate-y-0 data-starting-style:scale-100 data-ending-style:scale-100"><DialogTitle className="sr-only">工作空间导航</DialogTitle><DialogDescription className="sr-only">选择页面或创建项目，按 Escape 关闭导航。</DialogDescription>{sidebar}</DialogContent></Dialog>
    <div className="flex min-w-0 flex-1 flex-col">
      {(page === "image" || page === "chat") && <div className="px-4 pt-4 sm:px-8 [&>header]:mb-4">{toolbar}</div>}
      {visitedCreative.current.image && <div className={page === "image" ? "flex min-h-0 flex-1 flex-col" : "hidden"}><ImageWorkspace key={reuseVersion.image} onSettings={configure} notify={setNotice} onComplete={() => void refresh()} /></div>}
      {visitedCreative.current.chat && <div className={page === "chat" ? "flex min-h-0 flex-1 flex-col" : "hidden"}><ChatWorkspace key={reuseVersion.chat} records={records.filter(r => r.type === "chat")} onSettings={configure} notify={setNotice} onComplete={() => void refresh()} /></div>}
      <main ref={content} hidden={page === "image" || page === "chat"} className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-8 xl:px-12">
        <div className="w-full">{toolbar}{page === "settings" && settingsSource && <Button variant="ghost" className="mb-4" onClick={() => go(settingsSource)}><ArrowLeft className="size-4" />返回{labels[settingsSource]}</Button>}
          {!ready && loading ? <Busy /> : error ? <ErrorPanel message={error} onRetry={() => void refresh()} /> : [...visitedPages.current].filter(id => id !== "image" && id !== "chat").map(id => <section key={id} hidden={id !== page} aria-label={labels[id]}>
              {passwordGate ? <Card><CardContent className="flex flex-wrap items-center gap-4 p-6" role="alert"><CircleAlert className="size-5 shrink-0 text-destructive" /><p className="min-w-0 flex-1 text-sm">首次登录需要先修改临时密码，改完密码后这里的数据会自动加载。</p><Button className="min-h-11" onClick={() => setPasswordOpen(true)}>修改密码</Button></CardContent></Card> : pageErrors[id] ? <ErrorPanel message={pageErrors[id]!} onRetry={() => void refresh()} /> :
              id === "home" ? <Home boards={boards.filter(b => !b.deletedAt)} resources={resources} go={go} openCanvas={openCanvas} create={openCreate} user={user} /> :
              id === "projects" ? <Projects projects={projects} boards={boards} refresh={refresh} notify={setNotice} openCanvas={openCanvas} create={openCreate} /> :
              id === "assets" ? <Assets resources={resources} userId={user?.id || ""} refresh={refresh} notify={setNotice} /> :
              id === "history" ? <History records={records} refresh={refresh} notify={setNotice} go={go} /> :
              id === "settings" ? <SettingsPage user={user} notify={setNotice} /> :
              <AccountsPage user={user} notify={setNotice} onUpdate={() => void refresh()} />}
          </section>)}

        </div>
      </main>
    </div>
    <Modal open={createOpen} title="新建项目" description="项目可以包含多个画布，帮助你整理同一个创作方向。" onClose={() => { if (!saving) setCreateOpen(false) }}>
      <form onSubmit={create} className="space-y-5"><label className="block text-sm">项目名称<Input autoFocus required maxLength={120} value={name} onChange={e => setName(e.target.value)} className="mt-2" placeholder="例如：新品视觉方案" /></label>{dialogError && <p className="text-sm text-destructive" role="alert">{dialogError}</p>}<div className="flex justify-end gap-3"><Button variant="outline" disabled={saving} onClick={() => setCreateOpen(false)}>取消</Button><Button type="submit" disabled={saving || !name.trim()}>{saving ? "正在创建…" : "创建项目"}</Button></div></form>
    </Modal>
    <Notice message={notice} onClose={() => setNotice("")} />
      <PasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} notify={setNotice} onDone={() => { setPasswordOpen(false); void refresh() }} />
  </div>
}

function Home({ boards, resources, go, openCanvas, create, user }: { boards: Board[]; resources: Resource[]; go: (page: Page) => void; openCanvas: (id?: string) => void; create: () => void; user: User | null }) {
  const gridRef = useRef<HTMLDivElement>(null)
  const [recentCount, setRecentCount] = useState(4)
  // 最近素材按容器实际宽度决定放几张：能铺满一行就铺满，不固定张数。
  useEffect(() => {
    const node = gridRef.current
    if (!node) return
    const measure = () => {
      const gap = 16, minTile = 190, maxColumns = 12
      const width = node.clientWidth || 0
      setRecentCount(Math.min(maxColumns, Math.max(2, Math.floor((width + gap) / (minTile + gap)))))
    }
    measure()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return <><Heading title="今天想创作什么？" description={`${user?.displayName || "欢迎回来"}，从最近的画布继续，或开始一次新的探索。`} />
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(17.5rem,1fr)]">
      <Card><CardHeader><CardTitle>继续创作</CardTitle><CardDescription>最近编辑的画布</CardDescription></CardHeader><CardContent>{boards.length ? <div className="space-y-2">{boards.slice(0, 4).map(board => <Button key={board.id} variant="ghost" className="flex h-auto w-full justify-between gap-4 whitespace-normal py-4 text-left" onClick={() => openCanvas(board.id)}><span className="flex min-w-0 items-center gap-3"><Workflow className="size-5 shrink-0 text-primary" /><span className="min-w-0"><span className="block truncate text-sm text-foreground">{board.name || board.title || "未命名画布"}</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{board.nodeCount || 0} 个节点，{dateLabel(board.updatedAt)}</span></span></span><ArrowUpRight className="size-4 shrink-0" /></Button>)}</div> : <div className="flex min-h-48 flex-col items-center justify-center gap-4 text-center"><Workflow className="size-6 text-muted-foreground" /><p className="text-sm text-muted-foreground">创建项目，组织你的第一个创作方案。</p><Button onClick={create}><Plus className="size-4" /> 创建项目</Button></div>}</CardContent></Card>
      <Card><CardHeader><CardTitle>选择创作方式</CardTitle><CardDescription>按目标直接进入工具</CardDescription></CardHeader><CardContent className="space-y-3"><Tool icon={<ImagePlus />} title="生成图片" text="输入提示词，添加参考图" onClick={() => go("image")} /><Tool icon={<MessageSquare />} title="讨论想法" text="从一个问题开始，逐步完善内容" onClick={() => go("chat")} /><Tool icon={<Workflow />} title="进入无限画布" text="组织节点，连接创作关系" onClick={() => openCanvas()} /></CardContent></Card>
    </div><section className="mt-8"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold">最近素材</h2><Button variant="ghost" onClick={() => go("assets")}>打开素材库 <ArrowUpRight className="size-4" /></Button></div>{resources.length ? <div ref={gridRef} className="neon-recent-grid grid gap-4" style={{ gridTemplateColumns: `repeat(${recentCount}, minmax(0, 1fr))` }}>{resources.slice(0, recentCount * 2).map(entry => <ResourceCard key={entry.resource.id} entry={entry} onClick={() => go("assets")} />)}</div> : <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">生成结果和导入的参考图将在素材库中集中保存。</p>}</section></>
}
function Tool({ icon, title, text, onClick }: { icon: React.ReactNode; title: string; text: string; onClick: () => void }) { return <Button variant="outline" onClick={onClick} className="h-auto w-full justify-start gap-4 whitespace-normal py-4 text-left"><span className="text-primary [&>svg]:size-5">{icon}</span><span><span className="block text-sm">{title}</span><span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">{text}</span></span></Button> }

function Projects({ projects, boards, refresh, notify, openCanvas, create }: { projects: Project[]; boards: Board[]; refresh: () => Promise<void>; notify: (s: string) => void; openCanvas: (id?: string) => void; create: () => void }) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("all")
  const [scope, setScope] = useState("active")
  const [renaming, setRenaming] = useState<Project | null>(null)
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)
  const filtered = boards.filter(b => (scope === "trash" ? Boolean(b.deletedAt) : !b.deletedAt) && (filter === "all" || (filter === "none" ? !b.projectId : b.projectId === filter)) && (b.name || b.title || "").toLowerCase().includes(query.toLowerCase()))
  const rename = async (event: React.FormEvent) => {
    event.preventDefault(); if (!renaming) return; setSaving(true)
    try { await request(`/api/canvas/projects/${encodeURIComponent(renaming.id)}`, "PATCH", { name: name.trim() }); setRenaming(null); await refresh(); notify("项目名称已更新。") } catch (e) { notify((e as Error).message) } finally { setSaving(false) }
  }
  return <><Heading title="项目与画布" description="项目归档创作方向，画布保留每一次编辑和生成关系。" action={<Button size="lg" onClick={create}><Plus className="size-4" /> 新建项目</Button>} />
    <div className="mb-6 flex flex-wrap items-center gap-3"><SearchBox value={query} onChange={setQuery} placeholder="搜索画布名称" /><NativeSelect aria-label="项目筛选" value={filter} onChange={e => setFilter(e.target.value)} className="w-full sm:w-48"><option value="all">全部项目</option><option value="none">未归类画布</option>{projects.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</NativeSelect><Tabs value={scope} onValueChange={value => setScope(String(value))} className="sm:ml-auto"><TabsList><TabsTrigger value="active">画布</TabsTrigger><TabsTrigger value="trash">回收站</TabsTrigger></TabsList></Tabs></div>
    {!query && scope === "active" && projects.length > 0 && <section className="mb-8"><h2 className="mb-4 text-base font-medium">项目目录</h2><div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{projects.map(p => <Card key={p.id}><CardContent className="flex items-center justify-between gap-3 pt-5"><Button variant="ghost" className="h-auto min-h-11 min-w-0 flex-1 justify-start gap-3 whitespace-normal py-2" onClick={() => setFilter(p.id)}><Folder className="size-5 shrink-0 text-primary" /><span className="min-w-0 flex-1 break-words text-left">{p.name}</span><Badge variant="secondary" className="ml-auto">{p.canvasCount || 0}</Badge></Button><Button variant="ghost" size="icon" title={`重命名项目 ${p.name}`} aria-label={`重命名项目 ${p.name}`} onClick={() => { setRenaming(p); setName(p.name) }}><MoreHorizontal className="size-4" /></Button></CardContent></Card>)}</div></section>}
    <section><div className="mb-4 flex items-center justify-between"><h2 className="text-base font-medium">{scope === "trash" ? "已删除画布" : filter === "all" ? "全部画布" : "项目中的画布"} <span className="ml-2 text-sm text-muted-foreground">{filtered.length}</span></h2>{scope === "active" && <Button variant="outline" onClick={() => { try { hostAction("canvas", filter !== "all" && filter !== "none" ? { projectId: filter } : undefined) } catch (e) { notify((e as Error).message) } }}><Plus className="size-4" /> 新建画布</Button>}</div>{filtered.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{filtered.map(b => <Card key={b.id}><Button variant="ghost" aria-label={`打开画布 ${b.name || b.title || "未命名画布"}`} className="aspect-[16/9] h-auto w-full rounded-b-none bg-secondary/40" onClick={() => openCanvas(b.id)} disabled={scope === "trash"}>{b.thumbnail ? <img src={b.thumbnail} alt="" className="size-full object-cover" /> : <Workflow className="size-8 text-muted-foreground" />}</Button><CardHeader><CardTitle className="break-words text-base">{b.name || b.title || "未命名画布"}</CardTitle><CardDescription>{b.nodeCount || 0} 个节点，{dateLabel(b.updatedAt)}</CardDescription></CardHeader>{scope === "active" && <CardContent><BoardActions board={b} projects={projects} refresh={refresh} notify={notify} /></CardContent>}{scope === "trash" && <CardContent><Button variant="outline" onClick={async () => { try { await request(`/api/canvas/boards/${encodeURIComponent(b.id)}/restore`, "POST", { operationId: crypto.randomUUID() }); await refresh(); notify("画布已恢复。") } catch (e) { notify((e as Error).message) } }}>恢复画布</Button></CardContent>}</Card>)}</div> : <Empty icon={<Boxes />} title={query ? "没有匹配的画布" : scope === "trash" ? "回收站为空" : "还没有画布"} description={query ? "试试另一个名称，或清除项目筛选。" : "打开无限画布，开始组织提示词、参考图和生成结果。"} />}</section>
    <Modal open={Boolean(renaming)} title="重命名项目" description="项目内的画布和资源不受影响。" onClose={() => { if (!saving) setRenaming(null) }}><form onSubmit={rename} className="space-y-4"><Input aria-label="项目名称" autoFocus required value={name} onChange={e => setName(e.target.value)} /><Button type="submit" disabled={saving || !name.trim()}>{saving ? "保存中…" : "保存名称"}</Button></form></Modal></>
}
const typeLabels: Record<string, string> = { canvas: "画布", image: "图片", video: "视频", audio: "音频", chat: "对话", file: "文件", job: "任务" }
function ResourceCard({ entry, onClick }: { entry: Resource; onClick: () => void }) {
  const kind = entry.resource.type
  return <Card className="neon-resource-card group overflow-hidden">
    <Button variant="ghost" aria-label={`预览素材 ${entry.resource.title}`} className="neon-resource-preview h-auto w-full rounded-none bg-secondary/40 p-0" data-kind={kind} onClick={onClick}>
      {entry.preview?.url && entry.preview.kind === "image" ? <img loading="lazy" src={entry.preview.url} alt="" /> : kind === "video" ? <Video className="size-8 text-muted-foreground" /> : kind === "audio" ? <Music2 className="size-8 text-muted-foreground" /> : <FileImage className="size-8 text-muted-foreground" />}
    </Button>
    <CardHeader className="gap-1 p-4"><CardTitle className="break-words text-sm">{entry.resource.title}</CardTitle><CardDescription>{typeLabels[kind] || "文件"}{entry.access.locked ? "，需要共享口令" : ""}</CardDescription></CardHeader>
  </Card>
}
function Assets({ resources, userId, refresh, notify }: { resources: Resource[]; userId: string; refresh: () => Promise<void>; notify: (s: string) => void }) {
  const [query, setQuery] = useState("")
  const [type, setType] = useState("all")
  const [scope, setScope] = useState("mine")
  const [preview, setPreview] = useState<Resource | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  // The current resource API exposes visible resources and public shares only.
  // Do not render zero-count directory items that look like implemented filters.
  const scopeItems = [
    { id: "mine", label: "我的资产", icon: UserRound, count: resources.filter(r => r.resource.ownerUserId === userId).length },
    { id: "public", label: "共享精选", icon: Globe2, count: resources.filter(r => r.access.share?.visibility === "all").length },
    { id: "shared", label: "共享给我", icon: UsersRound, count: resources.filter(r => r.resource.ownerUserId !== userId && r.access.share?.visibility !== "all").length },
  ]
  const scoped = resources.filter(r => scope === "public" ? r.access.share?.visibility === "all" : scope === "shared" ? r.resource.ownerUserId !== userId && r.access.share?.visibility !== "all" : r.resource.ownerUserId === userId)
  const typeCounts = Object.fromEntries(Object.keys(typeLabels).map(key => [key, scoped.filter(r => r.resource.type === key).length]))
  const visible = scoped.filter(r => (type === "all" || r.resource.type === type) && r.resource.title.toLowerCase().includes(query.toLowerCase()))
  const upload = async (file: File) => {
    setUploading(true)
    try {
      const url = await uploadImage(file)
      await request("/api/resources", "POST", { type: "image", title: file.name, storagePath: url, metadata: { source: "upload" } }); await refresh(); notify("素材已上传。")
    } catch (e) { notify((e as Error).message) } finally { setUploading(false); if (fileInput.current) fileInput.current.value = "" }
  }
  return <><Heading title="素材库" description="统一查看参考素材和创作产物，打开、复用和共享。" action={<Button size="lg" disabled={uploading} onClick={() => fileInput.current?.click()}><Plus className="size-4" />{uploading ? "上传中…" : "导入图片"}</Button>} /><input ref={fileInput} type="file" accept="image/*" hidden onChange={e => { if (e.target.files?.[0]) void upload(e.target.files[0]) }} />
    <div className="neon-asset-library-layout">
      <aside className="neon-asset-directory">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[.14em] text-primary">资产目录</div>
        <div className="grid gap-1">{scopeItems.map(item => <SidebarItem key={item.id} icon={<item.icon />} label={item.label} title={item.label} aria-label={item.label} aria-pressed={scope === item.id} active={scope === item.id} count={item.count} className="min-h-11" onClick={() => setScope(item.id)} />)}</div>
        <div className="my-5 h-px bg-border" />
        <div className="mb-2 text-xs font-medium text-muted-foreground">素材类型</div>
        <div className="grid gap-1">{[["all", "全部", FileImage], ["image", "图片", ImageIcon], ["video", "视频", Video], ["audio", "音频", Music2]].map(([id, label, Icon]) => <SidebarItem key={id as string} icon={<Icon />} label={label as string} title={label as string} aria-label={label as string} aria-pressed={type === id} active={type === id} count={id === "all" ? scoped.length : typeCounts[id as string] || 0} className="min-h-11" onClick={() => setType(id as string)} />)}</div>
      </aside>
      <section className="min-w-0">
        <div className="mb-5 flex flex-wrap items-center gap-3"><SearchBox value={query} onChange={setQuery} placeholder="搜索素材名称" className="min-w-0 flex-1" /><p className="text-xs text-muted-foreground">{visible.length} 个素材</p></div>
        {visible.length ? <div className="neon-asset-masonry">{visible.map(entry => <ResourceCard key={entry.resource.id} entry={entry} onClick={() => setPreview(entry)} />)}</div> : <Empty icon={<Folder />} title={query ? "没有匹配的素材" : "这里还没有素材"} description="导入参考图，或在创作工具中生成内容。" />}
      </section>
    </div>
    <Modal open={Boolean(preview)} title={preview?.resource.title || "素材预览"} description={`${typeLabels[preview?.resource.type || ""] || "文件"}，${preview?.access.share?.visibility === "all" ? "共享给全部账户" : preview?.access.share?.visibility === "password" ? "口令共享" : preview?.access.share?.visibility === "users" ? "指定账户可见" : "仅自己可见"}`} onClose={() => setPreview(null)}>
      {preview?.access.locked ? <p className="text-sm text-muted-foreground">此素材需要共享口令，暂未解锁。</p> : preview?.preview?.kind === "image" ? <img src={preview.preview.url} alt={preview.resource.title} className="max-h-96 w-full rounded-lg object-contain" /> : <div className="flex min-h-32 items-center justify-center text-muted-foreground"><FileImage className="size-8" /></div>}
      {preview && <AssetActions entry={preview} refresh={refresh} notify={notify} onClose={() => setPreview(null)} />}
    </Modal></>
}
function History({ records, refresh, notify, go }: { records: RecordItem[]; refresh: () => Promise<void>; notify: (s: string) => void; go: (page: Page) => void }) {
  const [type, setType] = useState("all")
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<RecordItem | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const list = records.filter(r => (type === "all" || r.type === type) && `${r.title || ""}${r.prompt || ""}`.includes(query))
  const remove = async () => {
    if (!selected) return; setSaving(true)
    try { await request(`/api/history/${selected.type === "chat" ? "chat" : "images"}?id=${encodeURIComponent(selected.id)}`, "DELETE"); setSelected(null); setConfirm(false); await refresh(); notify("记录已删除。") } catch (e) { notify((e as Error).message) } finally { setSaving(false) }
  }
  return <><Heading title="历史记录" description="回看提示词、模型和生成结果，从已有任务继续创作。" /><div className="mb-6 flex flex-wrap gap-4"><SearchBox value={query} onChange={setQuery} placeholder="搜索标题或提示词" /><Tabs value={type} onValueChange={value => setType(String(value))}><TabsList><TabsTrigger value="all">全部</TabsTrigger><TabsTrigger value="image">生图</TabsTrigger><TabsTrigger value="chat">对话</TabsTrigger></TabsList></Tabs></div>
    {list.length ? <Card><CardContent className="p-0">{list.map(r => <Button key={`${r.type}-${r.id}`} variant="ghost" className="flex h-auto w-full justify-between gap-4 whitespace-normal rounded-none border-b border-border px-5 py-5 text-left last:border-b-0" onClick={() => { setSelected(r); setConfirm(false) }}><span className="flex min-w-0 items-center gap-4">{r.type === "chat" ? <MessageSquare className="size-5 shrink-0" /> : <ImagePlus className="size-5 shrink-0" />}<span className="min-w-0"><span className="block truncate text-sm text-foreground">{r.title || r.prompt || "创作记录"}</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{r.model || "模型未记录"}，{dateLabel(r.createdAt || r.timestamp)}</span></span></span><ArrowUpRight className="size-4 shrink-0" /></Button>)}</CardContent></Card> : <Empty icon={<Clock3 />} title="暂无记录" description="生成或发送对话后，记录会保存在这里。" />}
    <Modal open={Boolean(selected)} title="创作记录" description={`${selected?.model || "模型未记录"}，${dateLabel(selected?.createdAt || selected?.timestamp || selected?.updatedAt)}`} onClose={() => { if (!saving) setSelected(null) }}><div className="max-h-80 space-y-4 overflow-auto rounded-lg bg-secondary/30 p-4 text-sm leading-6">
      {selected?.type === "chat" && selected.messages?.length ? selected.messages.map((message, index) => <div key={index}><p className="mb-1 text-xs text-muted-foreground">{message.role === "user" ? "你" : message.role === "assistant" ? "助手" : "系统"}</p><p className="whitespace-pre-wrap break-words">{message.content}</p></div>) : <p className="whitespace-pre-wrap break-words">{selected?.prompt || selected?.title || "未记录内容"}</p>}
      {selected?.type === "image" && selected.images?.map((image, index) => <img key={index} src={typeof image === "string" ? image : image.savedUrl || image.src} alt={`生成结果 ${index + 1}`} className="h-auto w-full rounded-lg object-contain" />)}
    </div>{confirm && <p className="text-sm text-destructive" role="alert">删除后将不能通过历史记录恢复。确认删除这条记录？</p>}<div className="flex flex-wrap justify-end gap-3"><Button variant={confirm ? "destructive" : "outline"} disabled={saving} onClick={() => confirm ? void remove() : setConfirm(true)}>{saving ? "删除中…" : confirm ? "确认删除" : "删除记录"}</Button><Button onClick={() => { const target = selected?.type === "chat" ? "chat" : "image"; if (selected) sessionStorage.setItem("neon-reuse", JSON.stringify(selected)); setSelected(null); go(target) }}>继续创作</Button></div></Modal></>
}
