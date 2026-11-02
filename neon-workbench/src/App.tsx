import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowLeft, ArrowUpRight, Boxes, CircleAlert, Clock3, Folder, ImagePlus, LayoutDashboard, Menu, MessageSquare, PanelLeftClose, Pencil, Plus, RefreshCw, Settings2, Users, Workflow, X } from "lucide-react"
import { Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarItem, SidebarGroup, SidebarGroupLabel } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Heading, Busy, ErrorPanel, Modal, Notice } from "@/components/workbench"
import { PageBoundary } from "@/components/page-boundary"
import { dateLabel, hostAction, request } from "@/lib/api"
import type { AssetCandidate, Board, Project, Resource, RecordItem, User } from "@/lib/api"
import { textFields, textList, textOf } from "@/lib/text"
import { SettingsPage, AccountsPage, PasswordDialog } from "@/pages/management"
import { ImageWorkspace, ChatWorkspace } from "@/pages/creative"
import { AssetPreview } from "@/components/asset-preview"
import { CanvasNameDialog } from "@/components/canvas-name-dialog"
import { canvasName } from "@/lib/canvas-naming"
import { candidateFromCanvasMedia } from "@/lib/asset-library"
import { Projects } from "@/pages/projects"
import { Assets } from "@/pages/asset-library"
import { History } from "@/pages/history"
import { AddToAssetDialog } from "@/components/add-to-asset-dialog"
import { MediaCard as ResourceCard } from "@/components/media-card"

type Page = "home" | "projects" | "assets" | "history" | "settings" | "account" | "image" | "chat"
const pages = new Set<Page>(["home", "projects", "assets", "history", "settings", "account", "image", "chat"])
const navigation = [
  { title: "工作空间", items: [{ id: "home", label: "概览", icon: LayoutDashboard }, { id: "projects", label: "项目", icon: Boxes }, { id: "assets", label: "资产库", icon: Folder }, { id: "history", label: "历史记录", icon: Clock3 }] },
  { title: "创作工具", items: [{ id: "image", label: "在线生图", icon: ImagePlus }, { id: "chat", label: "AI 对话", icon: MessageSquare }] },
  { title: "管理", items: [{ id: "settings", label: "设置", icon: Settings2 }, { id: "account", label: "账户管理", icon: Users }] },
] as const
const labels: Record<Page, string> = { home: "概览", projects: "项目", assets: "资产库", history: "历史记录", settings: "设置", account: "账户管理", image: "在线生图", chat: "AI 对话" }
function hashPage() { const value = location.hash.slice(1) as Page; return pages.has(value) ? value : "home" }

export default function App() {
  const [page, setPage] = useState<Page>(hashPage)
  const [user, setUser] = useState<User | null>(null)
  const [boards, setBoards] = useState<Board[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [reloadKey, setReloadKey] = useState(0)
  const [projectsResetVersion, setProjectsResetVersion] = useState(0)
  const [assetRequest, setAssetRequest] = useState<{ items: AssetCandidate[]; requestId?: string; host?: boolean } | null>(null)
  const [records, setRecords] = useState<RecordItem[]>([])
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [pageErrors, setPageErrors] = useState<Partial<Record<Page, string>>>({})
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [mobileMenu, setMobileMenu] = useState(false)
  const [collapsed, setCollapsed] = useState(() => sessionStorage.getItem("neon-nav-collapsed") === "true")
  const [createOpen, setCreateOpen] = useState(false)
  const [canvasNaming, setCanvasNaming] = useState<{ board?: Board; projectId?: string } | null>(null)
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
  const assetRequestRef = useRef(assetRequest)
  assetRequestRef.current = assetRequest
  const closeAssetRequest = useCallback(() => {
    const current = assetRequestRef.current
    assetRequestRef.current = null
    setAssetRequest(null)
    if (current?.host) hostAction("assetDialogClosed", { requestId: current.requestId })
  }, [])
  useEffect(() => {
    document.documentElement.classList.toggle("neon-canvas-asset-overlay", Boolean(assetRequest?.host))
    return () => document.documentElement.classList.remove("neon-canvas-asset-overlay")
  }, [assetRequest?.host])
  const refresh = useCallback(async () => {
    setLoading(true); setError("")
    try {
      const session = await request<{ user: User }>("/api/auth/session")
      // 会话里的账户字段也按纯文本处理：工作台会用它取首字母，拿到对象会直接抛错。
      setUser(textFields<User>(session.user, ["displayName", "username", "role", "status"]))
      if (!session.user) throw new Error("请先登录工作台。")
      if (session.user.mustChangePassword) {
        setPasswordGate(true); setPasswordOpen(true); setPageErrors({}); setReady(true)
        return
      }
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
        if (needsPasswordChange) setPasswordOpen(true)
      const nextErrors: Partial<Record<Page, string>> = {}
      if (projectData.status === "fulfilled") setProjects(textList<Project>(projectData.value.projects, ["name"]))
      else nextErrors.projects = projectData.reason.message
      if (boardData.status === "fulfilled") setBoards([...textList<Board>(boardData.value.boards, ["name", "title"]), ...textList<Board>(boardData.value.trash, ["name", "title"]).map(board => ({ ...board, deletedAt: board.deletedAt || "已删除" }))])
      else nextErrors.projects = boardData.reason.message
      if (resourceData.status === "fulfilled") setResources((resourceData.value.resources || []).map(item => item?.resource
        ? { ...item, resource: { ...item.resource, title: textOf(item.resource.title) } }
        : item))
      else nextErrors.history = resourceData.reason.message
      if (imageData.status === "fulfilled" && chatData.status === "fulfilled") {
        const images = textList<RecordItem>(imageData.value.records, ["title", "prompt", "model"]).map(record => ({ ...record, type: "image" }))
        const chats = textList<RecordItem>(chatData.value.records, ["title", "prompt", "model"]).map(record => ({ ...record, type: "chat" }))
        setRecords([...images, ...chats].sort((a, b) => new Date(b.updatedAt || b.createdAt || b.timestamp || 0).getTime() - new Date(a.updatedAt || a.createdAt || a.timestamp || 0).getTime()))
      } else nextErrors.history = imageData.status === "rejected" ? imageData.reason.message : chatData.status === "rejected" ? chatData.reason.message : ""
      if (preferenceData.status === "fulfilled") {
        document.documentElement.style.fontSize = `${16 * (preferenceData.value.preferences?.appearance?.scale || 1)}px`
        document.documentElement.dataset.motion = preferenceData.value.preferences?.appearance?.animations || "full"
        } else if (!needsPasswordChange) setNotice("外观偏好读取失败，暂时使用默认外观。")
        if (Object.values(nextErrors).length && !needsPasswordChange) nextErrors.home = "部分工作空间数据加载失败，可以进入其他页面操作，或重试加载。"
      setPageErrors(nextErrors); setReady(true); setReloadKey(key => key + 1)
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => {
    void refresh()
    const onHash = () => { const next = hashPage(); visitedPages.current.add(next); if (next === "image" || next === "chat") visitedCreative.current[next] = true; setPage(next); setMobileMenu(false) }
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== window.parent) return
      if (event.data?.type === "neon:refresh") void refresh()
      if (event.data?.type === "neon:add-assets" && typeof event.data.requestId === "string" && Array.isArray(event.data.items) && event.data.items.length) {
        const items = event.data.items.map(candidateFromCanvasMedia).filter((item: AssetCandidate | null): item is AssetCandidate => item !== null)
        if (items.length) setAssetRequest({ items, requestId: event.data.requestId, host: true })
      }
      if (event.data?.type === "neon:cancel-add-assets" && assetRequestRef.current?.requestId === event.data.requestId) { assetRequestRef.current = null; setAssetRequest(null) }
      if (event.data?.type === "neon:return") {  location.hash = sessionStorage.getItem("neon-canvas-source") || hashPage(); void refresh() }
      if (event.data?.type === "neon:error") setNotice(event.data.message || "工具打开失败。")
    }
    const onAddAssets = (event: Event) => { const items = (event as CustomEvent<{ items: AssetCandidate[] }>).detail?.items; if (Array.isArray(items) && items.length) setAssetRequest({ items }) }
    window.addEventListener("hashchange", onHash); window.addEventListener("message", onMessage); window.addEventListener("neon:open-add-assets", onAddAssets)
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
    return () => { window.removeEventListener("hashchange", onHash); window.removeEventListener("message", onMessage); window.removeEventListener("neon:open-add-assets", onAddAssets) }
  }, [refresh])
  useEffect(() => { document.title = `${labels[page]}，BenDo`; if (ready && content.current) content.current.scrollTop = scrollPositions.current[page] || 0 }, [page, ready])
  useEffect(() => { sessionStorage.setItem("neon-nav-collapsed", String(collapsed)) }, [collapsed])
  const go = (next: Page) => {
    if (content.current) scrollPositions.current[page] = content.current.scrollTop
    if (next === "projects") { setProjectsResetVersion(version => version + 1); scrollPositions.current.projects = 0; if (content.current) content.current.scrollTop = 0 }
    if ((next === "image" || next === "chat") && page !== "settings") originPage.current = page
    if (next === "image" || next === "chat") visitedCreative.current[next] = true
    if ((next === "image" || next === "chat") && sessionStorage.getItem("neon-reuse")) setReuseVersion(previous => ({ ...previous, [next]: previous[next] + 1 }))
    if (next === settingsSource) setSettingsSource(null)
    visitedPages.current.add(next)
    setPage(next); location.hash = next; setMobileMenu(false)
  }
  const configure = () => { setSettingsSource(page); go("settings") }
  const openCanvas = (id?: string) => {
    if (!id) { setCanvasNaming({}); return }
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
      <div className="flex items-center gap-2"><span className="size-5 shrink-0 text-primary" aria-hidden="true" style={{ backgroundColor: "currentColor", mask: "url('/assets/branding/bendo-logo.svg') center / contain no-repeat", WebkitMask: "url('/assets/branding/bendo-logo.svg') center / contain no-repeat" }} />{(!collapsed || mobileMenu) && <strong className="whitespace-nowrap text-sm">BenDo</strong>}</div>
      {mobileMenu && <Button variant="ghost" size="icon" onClick={() => setMobileMenu(false)} title="关闭导航" aria-label="关闭导航"><X className="size-4" /></Button>}
    </SidebarHeader>
      <Button size="lg" className="w-full shrink-0 px-3" title="新建项目" aria-label="新建项目" onClick={openCreate}><Plus className="size-4 shrink-0" />{(!collapsed || mobileMenu) && "新建项目"}</Button>
      {navigation.map(group => <SidebarGroup key={group.title}>{(!collapsed || mobileMenu) && <SidebarGroupLabel className="pb-2 text-xs">{group.title}</SidebarGroupLabel>}{group.items.map(item => <SidebarItem key={item.id} collapsed={collapsed && !mobileMenu} icon={<item.icon />} label={item.label} title={item.label} aria-label={item.label} aria-current={page === item.id ? "page" : undefined} active={page === item.id} className="min-h-11" onClick={() => go(item.id)} />)}</SidebarGroup>)}
      <SidebarFooter className="mt-auto border-0 p-0"><SidebarItem collapsed={collapsed && !mobileMenu} icon={<span className="grid size-6 place-items-center rounded-full bg-secondary text-xs">{textOf(user?.displayName).slice(0, 1) || "我"}</span>} label={textOf(user?.displayName) || "当前账户"} title="查看账户" onClick={() => go("account")} /><SidebarItem collapsed={collapsed && !mobileMenu} icon={<PanelLeftClose />} label={collapsed ? "展开导航" : "收起导航"} title={collapsed ? "展开导航" : "收起导航"} aria-label={collapsed ? "展开导航" : "收起导航"} onClick={() => setCollapsed(!collapsed)} className="hidden md:flex" /></SidebarFooter>
    </SidebarContent>
  </Sidebar>
  const toolbar = <header className="mb-6 flex shrink-0 items-center justify-between gap-3" aria-label="工作台工具栏">
    <div className="flex min-w-0 items-center gap-3"><Button variant="ghost" size="icon" className="md:hidden" aria-label="打开导航" title="打开导航" onClick={() => setMobileMenu(true)}><Menu className="size-5" /></Button><span className="truncate text-sm font-medium text-muted-foreground">{page === "home" ? "我的工作空间" : labels[page]}</span></div>
    <div className="flex items-center gap-2"><Badge variant="secondary" className="hidden sm:flex">本地工作台</Badge><Button variant="ghost" size="icon" onClick={() => void refresh()} disabled={loading} aria-label="刷新数据" title="刷新数据"><RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /></Button></div>
  </header>
  // 最外层再兜一次：任何一处渲染出错都只显示一个错误卡片，不会让 React 卸载
  // 整棵工作台、把页面交给启动兜底页（"工作台没有正常显示"）。
  return <div className={`neon-workbench-shell flex h-svh min-w-0 ${assetRequest?.host ? "bg-transparent" : "bg-background"}`}>
    <PageBoundary onRetry={() => void refresh()}>
    <div className="hidden h-full md:block">{sidebar}</div>
    <Dialog open={mobileMenu} onOpenChange={setMobileMenu}><DialogContent showCloseButton={false} className="left-0 top-0 flex h-svh w-60 max-w-full translate-x-0 translate-y-0 gap-0 rounded-none border-0 p-0 data-starting-style:translate-y-0 data-ending-style:translate-y-0 data-starting-style:scale-100 data-ending-style:scale-100"><DialogTitle className="sr-only">工作空间导航</DialogTitle><DialogDescription className="sr-only">选择页面或创建项目，按 Escape 关闭导航。</DialogDescription>{sidebar}</DialogContent></Dialog>
    <div className="flex min-w-0 flex-1 flex-col">
      {(page === "image" || page === "chat") && <div className="px-4 pt-4 sm:px-8 [&>header]:mb-4">{toolbar}</div>}
      {ready && !passwordGate && visitedCreative.current.image && <div className={page === "image" ? "flex min-h-0 flex-1 flex-col" : "hidden"}><PageBoundary onRetry={() => void refresh()}><ImageWorkspace key={reuseVersion.image} onSettings={configure} notify={setNotice} onComplete={() => void refresh()} /></PageBoundary></div>}
      {ready && !passwordGate && visitedCreative.current.chat && <div className={page === "chat" ? "flex min-h-0 flex-1 flex-col" : "hidden"}><PageBoundary onRetry={() => void refresh()}><ChatWorkspace key={reuseVersion.chat} records={records.filter(r => r.type === "chat")} onSettings={configure} notify={setNotice} onComplete={() => void refresh()} /></PageBoundary></div>}
      <main ref={content} hidden={ready && !passwordGate && (page === "image" || page === "chat")} className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-8 xl:px-12">
        <div className="w-full">{toolbar}{page === "settings" && settingsSource && <Button variant="ghost" className="mb-4" onClick={() => go(settingsSource)}><ArrowLeft className="size-4" />返回{labels[settingsSource]}</Button>}
          {!ready && loading ? <Busy /> : error ? <ErrorPanel message={error} onRetry={() => void refresh()} /> : passwordGate ? <Card><CardContent className="flex flex-wrap items-center gap-4 p-6" role="alert"><CircleAlert className="size-5 shrink-0 text-destructive" /><p className="min-w-0 flex-1 text-sm">首次登录需要先设置自己的密码，设置成功后即可使用工作台。</p><Button className="min-h-11" onClick={() => setPasswordOpen(true)}>设置登录密码</Button></CardContent></Card> : [...visitedPages.current].filter(id => id !== "image" && id !== "chat").map(id => <section key={id} hidden={id !== page} aria-label={labels[id]}>
              {pageErrors[id] ? <ErrorPanel message={pageErrors[id]!} onRetry={() => void refresh()} /> :
              <PageBoundary onRetry={() => void refresh()}>
                {id === "home" ? <Home boards={boards.filter(b => !b.deletedAt)} resources={resources} go={go} openCanvas={openCanvas} renameCanvas={board => setCanvasNaming({ board })} create={openCreate} user={user} refresh={refresh} notify={setNotice} /> :
                id === "projects" ? <Projects key={projectsResetVersion} projects={projects} boards={boards} refresh={refresh} notify={setNotice} openCanvas={openCanvas} createCanvas={projectId => setCanvasNaming({ projectId })} create={openCreate} /> :
                id === "assets" ? <Assets reloadKey={reloadKey} refresh={refresh} notify={setNotice} /> :
                id === "history" ? <History resources={resources} userId={user.id} records={records} refresh={refresh} notify={setNotice} go={go} /> :
                id === "settings" ? <SettingsPage user={user} notify={setNotice} /> :
                <AccountsPage user={user} notify={setNotice} onUpdate={() => void refresh()} />}
              </PageBoundary>}
          </section>)}

        </div>
      </main>
    </div>
    <Modal open={createOpen} title="新建项目" description="项目可以包含多个画布，帮助你整理同一个创作方向。" onClose={() => { if (!saving) setCreateOpen(false) }}>
      <form onSubmit={create} className="space-y-5"><label className="block text-sm">项目名称<Input autoFocus required maxLength={120} value={name} onChange={e => setName(e.target.value)} className="mt-2" placeholder="例如：新品视觉方案" /></label>{dialogError && <p className="text-sm text-destructive" role="alert">{dialogError}</p>}<div className="flex justify-end gap-3"><Button variant="outline" disabled={saving} onClick={() => setCreateOpen(false)}>取消</Button><Button type="submit" disabled={saving || !name.trim()}>{saving ? "正在创建…" : "创建项目"}</Button></div></form>
    </Modal>
    {canvasNaming && <CanvasNameDialog key={canvasNaming.board?.id || "new-canvas"} board={canvasNaming.board} projectId={canvasNaming.projectId} onClose={() => setCanvasNaming(null)} onComplete={async id => { await refresh(); setCanvasNaming(null); if (canvasNaming.board) setNotice("画布已重命名。"); else openCanvas(id) }} />}
    {assetRequest && <AddToAssetDialog key={assetRequest.requestId || "local-asset-add"} items={assetRequest.items} onClose={closeAssetRequest} onSaved={async message => { await refresh(); setNotice(message) }} />}
    <Notice message={notice} onClose={() => setNotice("")} />
      <PasswordDialog open={passwordOpen} forced={passwordGate} onClose={() => setPasswordOpen(false)} notify={setNotice} onDone={() => { setPasswordOpen(false); void refresh() }} />
    </PageBoundary>
  </div>
}

function Home({ boards, resources, go, openCanvas, renameCanvas, create, user, refresh, notify }: { boards: Board[]; resources: Resource[]; go: (page: Page) => void; openCanvas: (id?: string) => void; renameCanvas: (board: Board) => void; create: () => void; user: User | null; refresh: () => Promise<void>; notify: (message: string) => void }) {
  const gridRef = useRef<HTMLDivElement>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const preview = resources.find(entry => entry.resource.id === previewId) || null
  const [recentCount, setRecentCount] = useState(4)
  const recentMedia = resources.filter(entry =>
    (entry.resource.type === "image" || entry.resource.type === "video") &&
    entry.resource.refType === "output_media" && entry.resource.metadata?.source === "generated" && entry.resource.ownerUserId === user?.id && !entry.resource.metadata?.historyHiddenFor?.includes(user?.id || "") &&
    !entry.resource.deletedAt && !entry.access.locked && Boolean(entry.preview?.url?.trim()) &&
    (entry.preview?.kind === "image" || entry.preview?.kind === "video"))
  const hasRecentMedia = recentMedia.length > 0
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
  }, [hasRecentMedia])
  // 瀑布流：列宽相同、每列各自堆叠，卡片高度跟着素材自身比例，不统一高度。
  const recentColumns = (() => {
    const buckets: Resource[][] = Array.from({ length: recentCount }, () => [])
    recentMedia.slice(0, recentCount * 2).forEach((entry, index) => { buckets[index % recentCount].push(entry) })
    return buckets
  })()
  return <><Heading title="今天想创作什么？" description={`${textOf(user?.displayName) || "欢迎回来"}，从最近的画布继续，或开始一次新的探索。`} />
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(17.5rem,1fr)]">
      <Card><CardHeader><CardTitle>继续创作</CardTitle><CardDescription>最近编辑的画布</CardDescription></CardHeader><CardContent>{boards.length ? <div className="space-y-2">{boards.slice(0, 4).map(board => <div key={board.id} className="flex min-w-0 items-center gap-2"><Button variant="ghost" aria-label={`打开画布 ${canvasName(board) || "未命名画布"}`} className="flex h-auto min-w-0 flex-1 justify-between gap-3 whitespace-normal py-4 text-left" onClick={() => openCanvas(board.id)}><span className="flex min-w-0 items-center gap-3"><Workflow className="size-5 shrink-0 text-primary" /><span className="min-w-0"><span className="block truncate text-sm text-foreground">{canvasName(board) || "未命名画布"}</span><span className="mt-1 block text-xs font-normal text-muted-foreground">{board.nodeCount || 0} 个节点，{dateLabel(board.updatedAt)}</span></span></span><ArrowUpRight className="size-4 shrink-0" /></Button>{board.isOwner !== false && <Button variant="ghost" size="icon" className="min-h-11 min-w-11 shrink-0" title={`重命名画布 ${canvasName(board) || "未命名画布"}`} aria-label={`重命名画布 ${canvasName(board) || "未命名画布"}`} onClick={() => renameCanvas(board)}><Pencil className="size-4" /></Button>}</div>)}</div> : <div className="flex min-h-48 flex-col items-center justify-center gap-4 text-center"><Workflow className="size-6 text-muted-foreground" /><p className="text-sm text-muted-foreground">创建项目，组织你的第一个创作方案。</p><Button onClick={create}><Plus className="size-4" /> 创建项目</Button></div>}</CardContent></Card>
      <Card><CardHeader><CardTitle>选择创作方式</CardTitle><CardDescription>按目标直接进入工具</CardDescription></CardHeader><CardContent className="space-y-3"><Tool icon={<ImagePlus />} title="生成图片" text="输入提示词，添加参考图" onClick={() => go("image")} /><Tool icon={<MessageSquare />} title="讨论想法" text="从一个问题开始，逐步完善内容" onClick={() => go("chat")} /><Tool icon={<Workflow />} title="进入无限画布" text="组织节点，连接创作关系" onClick={() => openCanvas()} /></CardContent></Card>
    </div><section className="mt-8"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold">最近素材</h2><Button variant="ghost" onClick={() => go("history")}>打开历史记录 <ArrowUpRight className="size-4" /></Button></div>{hasRecentMedia ? <div ref={gridRef} className="neon-recent-grid grid items-start gap-4" style={{ gridTemplateColumns: `repeat(${recentCount}, minmax(0, 1fr))` }}>{recentColumns.map((bucket, index) => <div key={index} className="flex min-w-0 flex-col gap-4">{bucket.map(entry => <ResourceCard key={entry.resource.id} entry={entry} onClick={() => setPreviewId(entry.resource.id)} />)}</div>)}</div> : <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">生成的图片和视频将在这里展示。</p>}</section>
    <AssetPreview entry={preview} fullscreen refresh={refresh} notify={notify} onClose={() => setPreviewId(null)} /></>
}
function Tool({ icon, title, text, onClick }: { icon: React.ReactNode; title: string; text: string; onClick: () => void }) { return <Button variant="outline" onClick={onClick} className="h-auto w-full justify-start gap-4 whitespace-normal py-4 text-left"><span className="text-primary [&>svg]:size-5">{icon}</span><span><span className="block text-sm">{title}</span><span className="mt-1 block text-xs font-normal leading-5 text-muted-foreground">{text}</span></span></Button> }
