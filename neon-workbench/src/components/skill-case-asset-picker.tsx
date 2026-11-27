import { useEffect, useMemo, useState } from "react"
import { Check, ChevronLeft, ChevronRight, Expand, Image, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { NativeSelect } from "@/components/ui/native-select"
import { Busy, ErrorPanel, Modal, SearchBox } from "@/components/workbench"
import { VideoThumbnail } from "@/components/video-thumbnail"
import { request, type LibraryData } from "@/lib/api"
import { assetMedia } from "@/lib/asset-media"
import type { SkillCase } from "@/lib/skill-showcase"
import { cn } from "@/lib/utils"

export const caseMediaType = (url: string) => /\.(mp4|webm)$/i.test(url) ? "video" : /\.(png|jpe?g|gif|webp|avif)$/i.test(url) ? "image" : ""

export type CaseAsset = {
  id: string
  url: string
  title: string
  kind: "image" | "video"
  thumbnailUrl?: string
  categoryId?: string
  dimensions?: string
}

function CaseAssetImage({ asset, original = false }: { asset: CaseAsset; original?: boolean }) {
  const [originalFallback, setOriginalFallback] = useState(false)
  const [failed, setFailed] = useState(false)
  const src = original || originalFallback ? asset.url : asset.thumbnailUrl || asset.url
  return failed
    ? <div className="flex size-full flex-col items-center justify-center gap-2 p-2 text-center text-xs text-muted-foreground">
        <Image aria-hidden="true" className="size-5" />图片暂时无法读取
      </div>
    : <img src={src} alt={original ? asset.title : ""} loading={original ? "eager" : "lazy"} decoding="async"
        className="block size-full object-contain"
        onError={() => { if (src !== asset.url) setOriginalFallback(true); else setFailed(true) }} />
}

export function SkillCaseAssetPicker({ media, target, onApply, onClose, onUpload }: {
  media: SkillCase[]
  target: { id?: string; poster?: boolean }
  onApply: (selected: CaseAsset[], availableUrls: ReadonlySet<string>) => void
  onClose: () => void
  onUpload: () => void
}) {
  const single = Boolean(target.id)
  const [data, setData] = useState<LibraryData | null>(null)
  const [error, setError] = useState("")
  const [attempt, setAttempt] = useState(0)
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState("")
  const [previewUrl, setPreviewUrl] = useState("")
  const [selectedUrls, setSelectedUrls] = useState(() => {
    const current = single ? media.filter(item => item.id === target.id) : media
    return new Set(current.flatMap(item => {
      const url = target.poster ? item.posterUrl : item.url
      return url ? [url] : []
    }))
  })

  useEffect(() => {
    const controller = new AbortController()
    void request<LibraryData>("/api/asset-library?scope=mine", "GET", undefined, controller.signal)
      .then(setData)
      .catch(error => { if (!controller.signal.aborted) setError((error as Error).message) })
    return () => controller.abort()
  }, [attempt])

  const assets = useMemo(() => {
    const eligible = new Map<string, CaseAsset>()
    for (const entry of data?.entries || []) {
      const url = assetMedia(entry)?.url || ""
      const kind = caseMediaType(url)
      if (!url.startsWith("/output/") || !kind || (target.poster && kind !== "image") ||
        !entry.asset || entry.resource.ownerUserId !== entry.asset.ownerUserId || eligible.has(url)) continue
      const metadata = entry.resource.metadata
      const width = Number(metadata?.imageWidth || metadata?.width)
      const height = Number(metadata?.imageHeight || metadata?.height)
      eligible.set(url, {
        id: entry.asset.id || entry.resource.id, url, kind, categoryId: entry.asset.categoryId,
        title: entry.resource.title || entry.asset.name || "未命名素材", thumbnailUrl: metadata?.thumbnailUrl,
        dimensions: width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height) ? `${width} × ${height}` : undefined,
      })
    }
    return eligible
  }, [data, target.poster])
  const categoryNames = new Map(data?.categories?.map(item => [item.id, item.name]))
  const term = query.trim().toLocaleLowerCase("zh-CN")
  const visible = [...assets.values()].filter(asset =>
    (!category || asset.categoryId === category) && asset.title.toLocaleLowerCase("zh-CN").includes(term))
  const selected = [...selectedUrls].flatMap(url => assets.get(url) || [])
  const existingUrls = new Set(media.map(item => item.url))
  const keptCount = media.filter(item => !item.url || !assets.has(item.url) || selectedUrls.has(item.url)).length
  const total = keptCount + selected.filter(asset => !existingUrls.has(asset.url)).length
  const previewIndex = visible.findIndex(asset => asset.url === previewUrl)
  const preview = visible[previewIndex]
  const toggle = (url: string) => setSelectedUrls(current => {
    const next = single ? new Set<string>() : new Set(current)
    if (current.has(url)) next.delete(url)
    else next.add(url)
    return next
  })

  return <Modal open title={target.poster ? "选择视频封面" : "选择案例素材"}
    description="点击图片查看原图，点击名称选择素材。"
    onClose={onClose}
    className="flex max-w-5xl flex-col gap-3 overflow-hidden p-4 sm:p-6 md:w-[calc(100%-3rem)]">
    <div className="flex shrink-0 flex-wrap gap-2">
      <SearchBox value={query} onChange={setQuery} placeholder="搜索我的素材" className="w-auto min-w-32 flex-1" />
      {categoryNames.size > 0 && <NativeSelect aria-label="素材分类" value={category} onChange={event => setCategory(event.target.value)}
        className="w-auto min-w-32 flex-1 sm:max-w-44">
        <option value="">全部分类</option>
        {Array.from(categoryNames, ([id, name]) => <option key={id} value={id}>{name}</option>)}
      </NativeSelect>}
      <Button variant="outline" onClick={onUpload} disabled={!single && media.length >= 16}><Plus className="size-4" />上传</Button>
    </div>
    <div aria-label="案例素材列表" className="min-h-0 flex-auto overflow-y-auto overscroll-contain p-1 [scrollbar-gutter:stable]">
      {error ? <ErrorPanel message={error} onRetry={() => { setError(""); setAttempt(value => value + 1) }} />
        : !data ? <Busy />
        : !visible.length ? <p className="py-10 text-center text-sm text-muted-foreground">
          {term || category ? "没有匹配的案例素材。" : "素材库中没有可用案例，可上传本地图片或视频。"}
        </p>
        : <div className="grid auto-rows-max grid-cols-2 items-start gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {visible.map(asset => {
            const checked = selectedUrls.has(asset.url)
            const details = [asset.dimensions, categoryNames.get(asset.categoryId || "")].filter(Boolean).join(" · ")
            return <Card key={asset.url} data-case-asset={asset.id} className={cn("min-w-0 shadow-none", checked ? "border-primary" : "hover:border-primary/50")}>
              <Button type="button" variant="ghost" aria-label={`预览 ${asset.title}`} title="查看大图"
                onClick={() => setPreviewUrl(asset.url)}
                className="group relative block h-36 w-full overflow-hidden rounded-none bg-secondary/50 p-0 focus-visible:ring-inset sm:h-40 lg:h-44">
                {asset.kind === "image" ? <CaseAssetImage asset={asset} />
                  : <VideoThumbnail src={asset.url} posterUrl={asset.thumbnailUrl} label={asset.title} compact className="aspect-auto size-full [&_img]:object-contain [&_video]:object-contain" />}
                <span className="absolute right-2 top-2 rounded-md bg-background/80 p-1.5 text-foreground group-hover:bg-background">
                  <Expand className="size-3.5" aria-hidden="true" />
                </span>
              </Button>
              <Button type="button" variant="ghost" aria-label={asset.title} aria-pressed={checked}
                disabled={!checked && !single && total >= 16} onClick={() => toggle(asset.url)}
                className="flex h-auto min-h-12 w-full justify-between gap-2 rounded-none px-3 py-2 text-left focus-visible:ring-inset">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground" title={asset.title}>{asset.title}</span>
                  {details && <span title={details} className="mt-1 block truncate text-xs font-normal text-muted-foreground">{details}</span>}
                </span>
                <span aria-hidden="true" className={cn("grid size-5 shrink-0 place-items-center rounded-full border border-border", checked && "border-primary bg-primary text-primary-foreground")}>
                  {checked && <Check className="size-3.5" />}
                </span>
              </Button>
            </Card>
          })}
        </div>}
    </div>
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
      <p className="text-sm text-muted-foreground" role="status">
        {single ? `已选 ${selected.length} 项` : `已选 ${selected.length} 项 · 案例 ${total} / 16`}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onClose}>取消</Button>
        <Button disabled={!data || Boolean(error) || (single && !selected.length)}
          onClick={() => onApply(selected, new Set(assets.keys()))}>应用选择</Button>
      </div>
    </div>
    <Modal open={Boolean(preview)} title={preview?.title || "案例预览"} description={preview?.kind === "video" ? "视频预览" : "原图预览"}
      onClose={() => setPreviewUrl("")}
      className="flex max-w-5xl flex-col overflow-hidden p-4 sm:p-6 md:w-[calc(100%-3rem)]">
      {preview && <>
        <div className="h-[min(64svh,44rem)] min-h-0 shrink overflow-hidden rounded-lg bg-secondary/50">
          {preview.kind === "video"
            ? <video key={preview.url} src={preview.url} controls playsInline preload="metadata" className="block size-full object-contain" aria-label={preview.title} />
            : <CaseAssetImage key={preview.url} asset={preview} original />}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3">
          <Button variant="outline" size="icon" aria-label="上一张" title="上一张" disabled={previewIndex === 0}
            onClick={() => setPreviewUrl(visible[previewIndex - 1].url)}><ChevronLeft className="size-4" /></Button>
          <span className="text-sm tabular-nums text-muted-foreground">{previewIndex + 1} / {visible.length}</span>
          <Button variant="outline" size="icon" aria-label="下一张" title="下一张" disabled={previewIndex === visible.length - 1}
            onClick={() => setPreviewUrl(visible[previewIndex + 1].url)}><ChevronRight className="size-4" /></Button>
        </div>
      </>}
    </Modal>
  </Modal>
}
