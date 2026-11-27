import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowLeft, ArrowUpRight, Check, FileText, Image, Plus, RefreshCw, Sparkles, Star, Workflow } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Busy, Empty, ErrorPanel, Heading, Modal, SearchBox } from "@/components/workbench"
import { request, type Board, type User } from "@/lib/api"
import { canvasName } from "@/lib/canvas-naming"
import { SkillsSettings } from "@/pages/advanced-settings"
import { SkillCasePreview, SkillCaseThumbnail } from "@/components/skill-case-preview"
import { SkillShowcaseEditor } from "@/components/skill-showcase-editor"
import { compareSkills, skillCover, skillQuery, skillCategories, type SquareSkill as Skill, type SkillDetail as Detail } from "@/lib/skill-showcase"
const scopeLabel = (skill: Skill) => skill.scope === "personal" ? "私人" : skill.scope === "system" ? "内置" : "本机公共"
const h3CommerceSkillId = "h3-commerce-video"
const plainLine = (text: string) => text.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/(\*\*|__|`)/g, "")
function SkillDocument({ source }: { source: string }) {
  // Skill documents are untrusted text: no HTML, embedded remote resources or
  // executable links. Local reference/media access remains authenticated.
  return <div className="min-w-0 space-y-3 break-words text-sm leading-7">
    {source.split(/\r?\n/).map((line, index) => {
      if (!line.trim()) return null
      const heading = line.match(/^(#{1,6})\s+(.+)$/)
      if (heading) return <h3 key={index} className="pt-4 text-base font-semibold tracking-tight">{plainLine(heading[2])}</h3>
      return <p key={index} className={`whitespace-pre-wrap ${/^\s*(?:[-*]|\d+\.)\s/.test(line) ? "pl-3" : ""}`}>{plainLine(line)}</p>
    })}
  </div>
}
function summarySection(source: string, pattern: RegExp) {
  const sections = source.split(/^#{1,6}\s+/m).slice(1)
  return sections.filter(section => {
    const heading = section.split("\n")[0].trim()
    return !/^\d+[.\s、]/.test(heading) && pattern.test(heading)
  }).map(section => section.slice(section.indexOf("\n") + 1).trim()).filter(Boolean).join("\n\n")
    .split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, 3).map(line => {
      const text = plainLine(line).replace(/^(?:[-*]|\d+[.、])\s*/, "")
      // Display a short input/output label when the document follows it with a
      // detailed explanation. The full, unchanged text remains in the disclosure.
      const label = text.match(/^([^：:]{1,60})[：:]/)?.[1] || text
      return label.length > 100 ? `${label.slice(0, 100)}…` : label
    }).join("\n")
}

export function SkillSquare({ user, boards, reloadKey, notify, openCanvas, onSelectSkill, onManage, selectionPending = false }: {
  user: User; boards: Board[]; reloadKey: number; notify: (text: string) => void
  openCanvas: (boardId?: string, skillId?: string) => void
  onSelectSkill?: (skillId: string) => void
  onManage?: () => void
  selectionPending?: boolean
}) {
  const [skills, setSkills] = useState<Skill[] | null>(null)
  const [error, setError] = useState("")
  const [catalogNotice, setCatalogNotice] = useState("")
  const loadRevision = useRef(0)
  const [tab, setTab] = useState("all")
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("")
  const [detailId, setDetailId] = useState("")
  const [detailScope, setDetailScope] = useState("")
  const [detail, setDetail] = useState<Detail | null>(null)
  const [detailError, setDetailError] = useState("")
  const [chooseBoard, setChooseBoard] = useState(false)
  const [manageOpen, setManageOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [reference, setReference] = useState<{ path: string; content: string } | null>(null)
  const admin = user.role === "superadmin"
  const load = useCallback(async () => {
    const revision = ++loadRevision.current
    setError("")
    setCatalogNotice("")
    try {
      const { skills: library } = await request<{ skills: Skill[] }>("/api/skills/library")
      if (revision !== loadRevision.current) return
      setSkills(library)
      // The installed commerce Skill is built-in. Older library endpoints only
      // list published and personal Skills, but expose the same entry by ID.
      if (library.some(skill => skill.id === h3CommerceSkillId)) return
      try {
        const skill = await request<Detail>(`/api/skills/detail?${skillQuery({ id: h3CommerceSkillId, scope: "system" })}`)
        if (revision === loadRevision.current && skill.id === h3CommerceSkillId && skill.scope === "system") setSkills([...library, skill])
      } catch (e) {
        if (revision === loadRevision.current && (e as { status?: number }).status !== 404) {
          setCatalogNotice(`H3 带货视频的展示资料暂时无法读取。${(e as Error).message}`)
        }
      }
    }
    catch (e) { if (revision === loadRevision.current) setError((e as Error).message) }
  }, [])
  useEffect(() => { void load() }, [load, reloadKey, tab])
  useEffect(() => {
    if (!detailId) { setDetail(null); return }
    const controller = new AbortController()
    setDetail(null); setDetailError(""); setReference(null)
    void request<Detail>(`/api/skills/detail?${skillQuery({ id: detailId, scope: detailScope })}`, "GET", undefined, controller.signal)
      .then(setDetail).catch(e => { if (!controller.signal.aborted) setDetailError((e as Error).message) })
    return () => controller.abort()
  }, [detailId, detailScope])
  const reloadDetail = async () => {
    if (!detail) return
    setBusy(true)
    try {
      const result = await request<{ featured: boolean }>("/api/skills/featured", "POST", { id: detail.id, featured: !detail.featured })
      setDetail({ ...detail, featured: result.featured }); await load()
      setNotice(result.featured ? "已设为本机精选 Skill。" : "已取消精选。")
    } catch (e) { notify((e as Error).message) }
    finally { setBusy(false) }
  }
  const useSkill = (boardId?: string) => {
    if (!detail?.enabled) return
    setChooseBoard(false)
    openCanvas(boardId, detail.id)
  }
  const availableBoards = boards.filter(board => !board.deletedAt && board.permission !== "read")
  const readReference = async (path: string) => {
    if (!detail || busy) return
    setBusy(true)
    try { setReference(await request<{ path: string; content: string }>(`/api/skills/reference?skill_id=${encodeURIComponent(detail.id)}&path=${encodeURIComponent(path)}`)) }
    catch (e) { notify((e as Error).message) }
    finally { setBusy(false) }
  }
  const refreshPresentation = async () => {
    await load()
    if (detail) {
      try { setDetail(await request<Detail>(`/api/skills/detail?${skillQuery(detail)}`)); setNotice("展示资料已保存。") }
      catch (e) { setDetailError((e as Error).message) }
    }
  }
  const tile = (skill: Skill) => <Card key={skill.id} className="group min-w-0 overflow-hidden transition-colors hover:border-primary/40 focus-within:border-primary/60">
    <button type="button" className="flex h-full w-full min-w-0 flex-col text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" aria-label={`查看 Skill ${skill.label}`} onClick={() => { setDetailScope(skill.scope); setDetailId(skill.id) }}>
      <SkillCaseThumbnail key={`${skill.id}:${skill.coverId}:${skill.presentation?.updatedAt || ""}`} skill={skill} media={skillCover(skill)} className="w-full" />
      <div className="w-full space-y-1.5 p-3.5">
        <div className="flex items-start gap-2"><h2 className="min-w-0 flex-1 text-sm font-semibold leading-6">{skill.label}</h2>{skill.featured && <Star className="mt-1 size-3.5 shrink-0 text-primary" aria-label="精选" />}</div>
        <p className="line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">{skill.presentation?.summary || skill.description}</p>
        <div className="flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground"><span>{skillCategories(skill).map(item => item.label).join(" · ")}</span>{!skill.enabled && <span>已停用</span>}</div>
      </div>
    </button>
  </Card>

  if (detailId) return <div className="mx-auto max-w-4xl space-y-5">
    <Button variant="ghost" onClick={() => { setDetailId(""); setNotice("") }}><ArrowLeft className="size-4" />返回 Skill 广场</Button>
    {detailError ? <ErrorPanel message={detailError} onRetry={() => { setDetailId(""); notify("请重新打开 Skill 详情。") }} /> : !detail ? <Busy /> : <>
      <SkillCasePreview key={`${detail.id}:${detail.presentation?.updatedAt || ""}`} skill={detail} media={detail.media} coverId={detail.coverId} />
      <div className="space-y-2"><div className="flex flex-wrap items-center gap-2"><h1 className="min-w-0 break-words text-xl font-semibold tracking-tight sm:text-2xl">{detail.label}</h1>{detail.featured && <Badge variant="secondary"><Star className="mr-1 size-3" />精选</Badge>}</div><p className="text-sm leading-7 text-muted-foreground">{detail.presentation?.summary || detail.description}</p></div>
      <div className="flex flex-wrap gap-2">{skillCategories(detail).map(item => <Badge key={item.id} variant="secondary">{item.label}</Badge>)}</div>
      <div className="grid gap-3 sm:grid-cols-3">{[
        ["主要能力与适用场景", detail.presentation?.capabilities || summarySection(detail.instructions, /适用|场景|用途|能力|何时使用/) || "尚未单独补充场景说明，可查看下方完整技能说明。"],
        ["所需输入", detail.presentation?.inputs || summarySection(detail.instructions, /输入|素材|准备|前提/) || "在 Agent 中描述任务，按需上传图片或引用当前画布素材。"],
        ["预期输出", detail.presentation?.outputs || summarySection(detail.instructions, /输出|交付|成果/) || "Agent 将结合任务和可用能力，按 Skill 的专业流程完成创作。"],
      ].map(([title, text]) => <div key={title} className="min-w-0 rounded-lg bg-secondary/50 p-4"><h2 className="mb-2 text-xs font-medium text-muted-foreground">{title}</h2><p className="whitespace-pre-wrap break-words text-sm leading-6">{plainLine(text)}</p></div>)}</div>
      <div className="space-y-3 border-t border-border pt-3">
        <details className="group"><summary className="w-fit cursor-pointer rounded-md py-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">查看技能说明</summary><div className="space-y-4 pb-3 pt-2"><SkillDocument source={detail.instructions} />{!!detail.references.length && <div className="space-y-1 border-t border-border pt-4"><h2 className="mb-2 text-sm font-medium">配套参考文档</h2>{detail.references.map(item => <Button key={item.path} variant="ghost" className="h-auto w-full justify-start whitespace-normal break-all py-3 text-left" disabled={busy} onClick={() => void readReference(item.path)}><FileText className="size-4 shrink-0" />{item.path}</Button>)}</div>}{reference && <Card><CardHeader><CardTitle className="break-all text-base">{reference.path}</CardTitle></CardHeader><CardContent><SkillDocument source={reference.content} /></CardContent></Card>}</div></details>
        <details><summary className="w-fit cursor-pointer rounded-md py-2 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">来源与兼容性</summary><div className="space-y-2 pb-3 pt-2 text-xs leading-6 text-muted-foreground"><p>{scopeLabel(detail)} · {detail.install?.source || "本地部署"} · {detail.install?.version || detail.metadata?.version || "未声明版本"} · {detail.license || "未声明许可"}</p><p>{detail.install?.compatibility?.detail || "实际执行取决于当前可用工具和模型服务。"}</p><p>外部依赖：{(detail.install?.dependencies || detail.install?.compatibility?.dependencies || []).join("、") || "未检测到额外依赖"}</p><p>包内脚本不会自动运行，账户权限与费用确认保持不变。</p></div></details>
      </div>
      {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background py-4"><p className="max-w-md text-xs leading-6 text-muted-foreground">{onSelectSkill ? "返回当前 Agent，上传素材或描述任务后发送。" : "载入画布 Agent，描述任务后发送。"}默认不执行付费生成。</p><div className="flex flex-wrap gap-2">{detail.canManagePresentation && <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)}>编辑展示资料</Button>}{admin && detail.scope !== "personal" && <Button variant="ghost" size="icon" title={detail.featured ? "取消精选" : "设为精选"} aria-label={detail.featured ? "取消精选" : "设为精选"} disabled={busy} onClick={() => void reloadDetail()}><Star className={`size-4 ${detail.featured ? "text-primary" : ""}`} /></Button>}<Button disabled={!detail.enabled || selectionPending} onClick={() => onSelectSkill ? onSelectSkill(detail.id) : setChooseBoard(true)}><Sparkles className="size-4" />{selectionPending ? "正在载入…" : detail.enabled ? "使用此 Skill" : "Skill 已停用"}</Button></div></div>
      {editOpen && <SkillShowcaseEditor skillId={detail.id} scope={detail.scope} onClose={() => setEditOpen(false)} onSaved={() => void refreshPresentation()} />}
      <Modal open={chooseBoard} title="选择使用 Skill 的画布" description="仅载入 Skill，不会自动生成图片。你可以使用已有素材，或在新画布上传产品图。" onClose={() => setChooseBoard(false)} className="sm:max-w-xl">
        <Button className="w-full" variant="outline" onClick={() => useSkill()}><Plus className="size-4" />新建独立画布</Button>
        <div className="max-h-80 space-y-2 overflow-y-auto">{availableBoards.length ? availableBoards.map(board => <Button key={board.id} variant="ghost" className="h-auto min-h-14 w-full justify-between gap-3 py-3 text-left" onClick={() => useSkill(board.id)}><span className="flex min-w-0 items-center gap-3"><Workflow className="size-4 shrink-0" /><span className="truncate">{canvasName(board) || "未命名画布"}</span></span><ArrowUpRight className="size-4 shrink-0" /></Button>) : <p className="py-4 text-sm text-muted-foreground">还没有可编辑画布，可先新建独立画布。</p>}</div>
      </Modal>
    </>}
  </div>

  const visible = (skills || []).filter(skill => tab === "mine" ? skill.scope === "personal"
    : (skill.scope === "public" || (skill.id === h3CommerceSkillId && skill.scope === "system")) && (tab !== "featured" || skill.featured))
    .sort((a, b) => Number(b.featured) - Number(a.featured) || compareSkills(a, b))
  const categories = [...new Map(visible.flatMap(skill => skillCategories(skill).map(item => [item.id, item.label] as const))).entries()]
  const filtered = visible.filter(skill => (!category || skillCategories(skill).some(item => item.id === category)) && `${skill.label} ${skill.presentation?.summary || ""} ${skill.description} ${skillCategories(skill).map(item => item.label).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()))
  return <div className="mx-auto max-w-7xl space-y-4">
    {!onSelectSkill && <Heading title="Skill 广场" description="这台 BenDo 的专业知识与创作流程。选择 Skill，让 Agent 在你的画布中完成实际工作。" />}
    <div className="flex flex-wrap items-center justify-between gap-3"><Tabs value={tab} onValueChange={value => { setTab(String(value)); setCategory("") }}><TabsList><TabsTrigger value="all">全部 Skill</TabsTrigger><TabsTrigger value="featured"><Star className="mr-1 size-4" />精选</TabsTrigger><TabsTrigger value="mine">我的 Skill</TabsTrigger></TabsList></Tabs><div className="flex w-full items-center gap-2 sm:w-auto"><SearchBox value={query} onChange={setQuery} placeholder="搜索名称或专业方向" /><Button variant="ghost" size="icon" title="刷新 Skill" aria-label="刷新 Skill" onClick={() => void load()}><RefreshCw className="size-4" /></Button></div></div>
    {error ? <ErrorPanel message={error} onRetry={() => void load()} /> : !skills ? <Busy /> : <>
      {catalogNotice && <ErrorPanel message={catalogNotice} onRetry={() => void load()} />}
      <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1" aria-label="Skill 分类"><Button size="sm" className="h-8 shrink-0 rounded-full" variant={!category ? "secondary" : "ghost"} aria-pressed={!category} onClick={() => setCategory("")}>全部</Button>{categories.map(([id, label]) => <Button key={id} size="sm" className="h-8 shrink-0 rounded-full" variant={category === id ? "secondary" : "ghost"} aria-pressed={category === id} onClick={() => setCategory(id)}>{label}{category === id && <Check className="ml-1 size-3" />}</Button>)}</div>
      {!!filtered.length && <section className="space-y-3"><p className="text-xs text-muted-foreground">{filtered.length} 个 Skill{tab === "mine" ? " · 仅自己可见" : ""}</p><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{filtered.map(tile)}</div></section>}
      {!filtered.length && <Empty icon={<Image />} title={query || category ? "没有匹配的 Skill" : tab === "mine" ? "还没有私人 Skill" : "公共 Skill 库暂时为空"} description={tab === "mine" ? "使用下方本地导入，预检并确认后安装到当前账户。" : "管理员发布的 Skill 将在这里供本实例账户使用。"} />}
      {tab === "mine" && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5"><p className="text-sm text-muted-foreground">私人 Skill 仅自己可见。管理操作与设置中的 Skill 管理一致。</p><Button variant="outline" onClick={() => onManage ? onManage() : setManageOpen(true)}>管理我的 Skill</Button></div>}
    </>}
    <Modal open={manageOpen} title="我的 Skill 管理" description="本地导入、启用与公共发布沿用现有账户权限。" onClose={() => { setManageOpen(false); void load() }} className="max-w-4xl sm:max-w-4xl">
      <SkillsSettings admin={admin} notify={text => { notify(text); void load() }} />
    </Modal>
  </div>
}
