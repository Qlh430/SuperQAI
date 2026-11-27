import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowDown, ArrowUp, Check, FolderOpen, Image, Trash2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Busy, ErrorPanel, Modal } from "@/components/workbench"
import { request } from "@/lib/api"
import { emptyPresentation, skillQuery, type SkillCase, type SkillDetail, type SkillPresentation } from "@/lib/skill-showcase"
import { SkillCaseThumbnail } from "@/components/skill-case-preview"
import { caseMediaType as mediaType, SkillCaseAssetPicker, type CaseAsset } from "@/components/skill-case-asset-picker"
import { VideoThumbnail } from "@/components/video-thumbnail"

type Target = { id?: string; poster?: boolean }
type Uploaded = { url: string; mimeType?: string; asset?: { id?: string; resourceId?: string } }
function LocalThumbnail({ url, thumbnailUrl = "" }: { url: string; thumbnailUrl?: string }) {
  const [source, setSource] = useState(thumbnailUrl)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (source || failed) return
    const controller = new AbortController()
    void request<{ item?: { thumbnailUrl?: string; lightweight?: boolean } }>(`/api/image-thumbnails?source=${encodeURIComponent(url)}`, "GET", undefined, controller.signal)
      .then(data => { if (data.item) setSource(data.item.lightweight ? url : data.item.thumbnailUrl || "") }).catch(() => {})
    return () => controller.abort()
  }, [url, source, failed])
  return source && !failed ? <img src={source} alt="" loading="lazy" className="aspect-video w-full bg-secondary object-cover" onError={() => setFailed(true)} />
    : <div className="flex aspect-video items-center justify-center bg-secondary"><Image className="size-5 text-muted-foreground" /></div>
}

async function uploadCase(file: File, progress: (text: string) => void) {
  if (!/\.(png|jpe?g|gif|webp|avif|mp4|webm)$/i.test(file.name)) throw new Error("请选择 PNG、JPG、WebP、GIF、AVIF、MP4 或 WebM 文件。")
  const chunkSize = 4 * 1024 * 1024
  const total = Math.ceil(file.size / chunkSize)
  if (!file.size || file.size > 200 * 1024 * 1024) throw new Error("案例文件不能为空，单个文件不能超过 200 MiB。")
  const id = crypto.randomUUID()
  let result: Uploaded | undefined
  for (let index = 0; index < total; index++) {
    progress(`正在上传 ${Math.round(index / total * 100)}%`)
    const chunked = total > 1
    const response = await fetch(chunked ? "/api/upload-media/chunk" : "/api/upload-media", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": chunked ? "application/octet-stream" : file.type || "application/octet-stream",
        "X-File-Name": encodeURIComponent(file.name),
        ...(chunked ? { "X-Upload-Id": id, "X-Chunk-Index": String(index), "X-Chunk-Total": String(total), "X-File-Type": file.type || "application/octet-stream" } : {}) },
      body: chunked ? file.slice(index * chunkSize, (index + 1) * chunkSize) : file,
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(typeof data.error === "string" && /[\u4e00-\u9fff]/.test(data.error) ? data.error : "案例上传失败，请检查文件或本机服务后重试。")
    if (index === total - 1) result = data
  }
  if (!result?.url?.startsWith("/output/")) throw new Error("上传结果缺少本机素材地址，请稍后重试。")
  const resourceId = result.asset?.id || result.asset?.resourceId
  if (!resourceId) throw new Error("素材已上传，但未取得资源登记结果，请从素材库确认后再添加。")
  progress("正在保存到素材库…")
  await request("/api/asset-library", "POST", { items: [{ resourceId, name: file.name,
    media: { url: result.url, kind: mediaType(result.url), title: file.name } }] })
  return result
}

export function SkillShowcaseEditor({ skillId, scope, onClose, onSaved }: {
  skillId: string; scope?: string; onClose: () => void; onSaved: () => void
}) {
  const [detail, setDetail] = useState<SkillDetail | null>(null)
  const [draft, setDraft] = useState<SkillPresentation>(emptyPresentation)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState("")
  const [notice, setNotice] = useState("")
  const [picker, setPicker] = useState<Target | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const uploadTarget = useRef<Target>({})
  const queryString = skillQuery({ id: skillId, scope })
  const load = useCallback(async () => {
    setError("")
    try {
      const data = await request<SkillDetail>(`/api/skills/detail?${queryString}`)
      if (!data.canManagePresentation) throw new Error("当前服务尚未启用展示资料管理，或此账户没有编辑权限。请确认后端已更新。")
      setDetail(data)
      setDraft({ ...emptyPresentation(), ...data.presentation, media: data.media.map((item, index) => ({ ...item, id: item.id || `package-${index}` })) })
    } catch (e) { setError((e as Error).message) }
  }, [queryString])
  useEffect(() => { void load() }, [load])
  const openPicker = (target: Target = {}) => setPicker(target)
  const apply = (url: string, title: string, target: Target) => {
    setDraft(current => {
      if (target.id) return { ...current, media: current.media.map(item => item.id !== target.id ? item : target.poster
        ? { ...item, posterUrl: url }
        : item.url === url ? item
        : { id: item.id, title: item.title || title, url, type: mediaType(url) === "video" ? `video/${url.endsWith(".webm") ? "webm" : "mp4"}` : `image/${url.split(".").at(-1)}` }) }
      const item = { id: crypto.randomUUID(), url, title, type: mediaType(url) === "video" ? "video/mp4" : "image/unknown" }
      return { ...current, media: [...current.media, item], coverId: current.coverId || item.id }
    })
    setPicker(null)
  }
  const applyLibrarySelection = (selected: CaseAsset[], availableUrls: ReadonlySet<string>, target: Target) => {
    if (target.id) {
      const asset = selected[0]
      if (asset) apply(asset.url, asset.title.slice(0, 120), target)
      return
    }
    const chosenUrls = new Set(selected.map(asset => asset.url))
    setDraft(current => {
      const media = current.media.filter(item => !item.url || !availableUrls.has(item.url) || chosenUrls.has(item.url))
      const retainedCount = media.length
      const urls = new Set(media.map(item => item.url))
      const ids = new Set(current.media.map(item => item.id))
      for (const asset of selected) {
        if (urls.has(asset.url)) continue
        const id = /^[a-zA-Z0-9_-]{1,64}$/.test(asset.id) && !ids.has(asset.id) ? asset.id : crypto.randomUUID()
        media.push({ id, url: asset.url, title: asset.title.slice(0, 120),
          type: asset.kind === "video" ? (asset.url.toLowerCase().endsWith(".webm") ? "video/webm" : "video/mp4") : "image/unknown" })
        ids.add(id)
      }
      const coverId = current.coverId
        ? (media.some(item => item.id === current.coverId) ? current.coverId : media[0]?.id || "")
        : media[retainedCount]?.id || ""
      return { ...current, media, coverId }
    })
    setPicker(null)
  }
  const chooseUpload = (target: Target = {}) => { uploadTarget.current = target; fileInput.current?.click() }
  const upload = async (file?: File) => {
    if (!file || busy) return
    setError(""); setNotice(""); setBusy("正在上传…")
    const target = uploadTarget.current
    try {
      if (target.poster && mediaType(file.name) !== "image") throw new Error("视频封面请选择图片。")
      const result = await uploadCase(file, setBusy)
      apply(result.url, file.name.replace(/\.[^.]+$/, ""), target)
      setNotice("文件已保存到素材库。点击「保存展示资料」后会用于 Skill；取消编辑也会保留素材库中的文件。")
    } catch (e) { setError((e as Error).message || "上传失败，请检查本机服务后重试。") }
    finally { setBusy(""); if (fileInput.current) fileInput.current.value = "" }
  }
  const save = async () => {
    if (busy) return
    setBusy("正在保存…"); setError("")
    try { await request(`/api/skills/presentation?${queryString}`, "POST", draft); onSaved(); onClose() }
    catch (e) { setError((e as Error).message) }
    finally { setBusy("") }
  }
  const changeText = (key: "displayName" | "summary" | "capabilities" | "inputs" | "outputs", value: string) => setDraft(current => ({ ...current, [key]: value }))
  const reorder = (index: number, offset: number) => setDraft(current => {
    const media = [...current.media]; [media[index], media[index + offset]] = [media[index + offset], media[index]]
    return { ...current, media }
  })
  const remove = (item: SkillCase) => setDraft(current => {
    const media = current.media.filter(row => row.id !== item.id)
    return { ...current, media, coverId: current.coverId === item.id ? media[0]?.id || "" : current.coverId }
  })
  return <Modal open title="Skill 展示资料" description={detail ? `${detail.label} · ${detail.scope === "personal" ? "仅当前账户可见" : "保存后供本实例账户查看"}` : "编辑简介、输入输出和真实效果案例。"} onClose={() => { if (!busy) onClose() }} className="sm:max-w-3xl">
    {!detail ? error ? <ErrorPanel message={error} onRetry={() => void load()} /> : <Busy /> : <>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm sm:col-span-2">显示名称<Input aria-label="显示名称" maxLength={100} value={draft.displayName || ""} placeholder={detail.label} onChange={e => changeText("displayName", e.target.value)} disabled={Boolean(busy) || !detail.categoryOptions?.length} /><span className="text-xs leading-5 text-muted-foreground">{detail.categoryOptions?.length ? "留空使用原名称。改名不会影响 Skill 引用和执行。" : "名称与分类编辑需要新版后端生效，请完成后端更新并正常重启 BenDo。"}</span></label>
        {!!detail.categoryOptions?.length && <fieldset className="space-y-2 sm:col-span-2"><legend className="mb-2 text-sm">分类 <span className="text-xs text-muted-foreground">最多选择 4 项</span></legend><div className="flex flex-wrap gap-2">{detail.categoryOptions.map(item => {
          const selected = draft.categories?.includes(item.id) || false
          return <Button key={item.id} type="button" size="sm" className="h-8 rounded-full" variant={selected ? "secondary" : "outline"} aria-pressed={selected} disabled={Boolean(busy) || (!selected && (draft.categories?.length || 0) >= 4)} onClick={() => setDraft(current => ({ ...current, categories: selected ? current.categories?.filter(id => id !== item.id) : [...(current.categories || []), item.id] }))}>{selected && <Check className="size-3" />}{item.label}</Button>
        })}</div><p className="text-xs text-muted-foreground">用于广场筛选与预览；不改变执行能力。留空使用原分类。</p></fieldset>}
        <label className="grid gap-2 text-sm sm:col-span-2">一句话介绍<Input aria-label="一句话介绍" maxLength={240} value={draft.summary} placeholder="用一句话说明这个 Skill 能带来什么" onChange={e => changeText("summary", e.target.value)} disabled={Boolean(busy)} /></label>
        {([["capabilities", "主要能力与适用场景"], ["inputs", "所需输入"], ["outputs", "预期输出"]] as const).map(([key, label]) => <label key={key} className={`grid gap-2 text-sm ${key === "capabilities" ? "sm:col-span-2" : ""}`}>{label}<Textarea aria-label={label} rows={3} maxLength={1200} value={draft[key]} onChange={e => changeText(key, e.target.value)} disabled={Boolean(busy)} placeholder={key === "inputs" ? "需要提供的图片、描述或品牌资料" : key === "outputs" ? "用户将获得的实际成果" : "适合解决什么问题"} /></label>)}
      </div>
      <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-medium">效果案例 <span className="ml-1 text-muted-foreground">{draft.media.length} / 16</span></h2><p className="mt-1 text-xs leading-5 text-muted-foreground">仅添加真实案例。移除展示引用不会删除素材文件。</p></div><div className="flex gap-2"><Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => openPicker()}><FolderOpen className="size-4" />从素材库选择</Button><Button size="sm" variant="outline" disabled={Boolean(busy) || draft.media.length >= 16} onClick={() => chooseUpload()}><Upload className="size-4" />上传案例</Button></div></div>
        {!draft.media.length && <div className="rounded-lg border border-dashed border-border px-4 py-7 text-center text-sm text-muted-foreground">暂无真实案例，广场将显示默认占位。</div>}
        {draft.media.map((item, index) => <div key={item.id} className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row"><div className="w-full shrink-0 sm:w-32">{item.url ? item.type.startsWith("image/") ? <LocalThumbnail key={item.url + item.posterUrl} url={item.url} /> : <VideoThumbnail key={item.url + item.posterUrl} src={item.url} posterUrl={item.posterUrl} label={item.title || `案例 ${index + 1}`} className="rounded-md" /> : <SkillCaseThumbnail skill={detail} media={item} className="rounded-md" />}</div><div className="min-w-0 flex-1 space-y-2"><Input aria-label={`案例 ${index + 1} 标题`} value={item.title || ""} placeholder={`案例 ${index + 1}`} maxLength={120} disabled={Boolean(busy)} onChange={e => setDraft(current => ({ ...current, media: current.media.map(row => row.id === item.id ? { ...row, title: e.target.value } : row) }))} /><div className="flex flex-wrap items-center gap-1"><Button size="sm" variant={draft.coverId === item.id ? "secondary" : "ghost"} aria-pressed={draft.coverId === item.id} disabled={Boolean(busy)} onClick={() => setDraft(current => ({ ...current, coverId: item.id || "" }))}>{draft.coverId === item.id && <Check className="size-3.5" />}{draft.coverId === item.id ? "当前封面" : "设为封面"}</Button><Button size="sm" variant="ghost" disabled={Boolean(busy)} onClick={() => openPicker({ id: item.id })}>替换</Button>{item.type.startsWith("video/") && <Button size="sm" variant="ghost" disabled={Boolean(busy)} onClick={() => openPicker({ id: item.id, poster: true })}><Image className="size-3.5" />{item.posterUrl ? "更换视频封面" : "添加视频封面"}</Button>}<Button size="icon" variant="ghost" aria-label={`前移案例 ${index + 1}`} disabled={Boolean(busy) || index === 0} onClick={() => reorder(index, -1)}><ArrowUp className="size-3.5" /></Button><Button size="icon" variant="ghost" aria-label={`后移案例 ${index + 1}`} disabled={Boolean(busy) || index === draft.media.length - 1} onClick={() => reorder(index, 1)}><ArrowDown className="size-3.5" /></Button><Button size="icon" variant="ghost" aria-label={`移除案例 ${index + 1}`} disabled={Boolean(busy)} onClick={() => remove(item)}><Trash2 className="size-3.5" /></Button></div></div></div>)}
      </section>
      {notice && <p role="status" className="text-xs leading-6 text-muted-foreground">{notice}</p>}
      {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">{error}</p>}
      <div className="sticky -bottom-6 flex flex-wrap justify-end gap-2 border-t border-border bg-card py-4"><Button variant="outline" disabled={Boolean(busy)} onClick={onClose}>取消</Button><Button disabled={Boolean(busy)} onClick={() => void save()}>{busy || "保存展示资料"}</Button></div>
      {picker && <SkillCaseAssetPicker media={draft.media} target={picker}
        onApply={(selected, availableUrls) => applyLibrarySelection(selected, availableUrls, picker)}
        onClose={() => setPicker(null)} onUpload={() => { chooseUpload(picker); setPicker(null) }} />}
    </>}
    <input ref={fileInput} type="file" accept=".png,.jpg,.jpeg,.webp,.gif,.avif,.mp4,.webm" hidden aria-label="上传案例文件" onChange={e => void upload(e.currentTarget.files?.[0])} />
  </Modal>
}
