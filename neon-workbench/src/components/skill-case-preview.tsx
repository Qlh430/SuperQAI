import { useState } from "react"
import { ChevronLeft, ChevronRight, Expand, Image as ImageIcon, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/workbench"
import { skillMediaUrl, type SkillCase, type SquareSkill } from "@/lib/skill-showcase"
import { VideoThumbnail } from "@/components/video-thumbnail"

export function SkillCaseThumbnail({ skill, media, className = "", compact = false }: { skill: SquareSkill; media?: SkillCase; className?: string; compact?: boolean }) {
  const [failed, setFailed] = useState(false)
  const video = media?.type.startsWith("video/")
  const hasImage = media && !video
  const mediaUrl = media ? (skill.scope === "public" ? skillMediaUrl(skill, media) : media.url || skillMediaUrl(skill, media)) : ""
  const posterUrl = video && media?.posterUrl
    ? skillMediaUrl(skill, media, { thumbnail: true, poster: true })
    : ""
  return <div className={`relative flex aspect-video items-center justify-center overflow-hidden bg-secondary/40 ${className}`}>
    {video && media
      ? <VideoThumbnail src={mediaUrl} posterUrl={posterUrl} label={media.title || `${skill.label}视频案例`} className="absolute inset-0 size-full" compact={compact} showPlay />
      : hasImage && !failed
      ? <img src={skillMediaUrl(skill, media, { thumbnail: true, poster: video })} alt={media.title || `${skill.label}案例封面`} loading="lazy" decoding="async" onError={() => setFailed(true)} className="absolute inset-0 size-full object-cover transition-transform duration-200 group-hover:scale-[1.025] motion-reduce:transition-none" />
      : <div className="flex flex-col items-center gap-2 text-muted-foreground"><ImageIcon className="size-5" />{!compact && <span className="text-xs">{failed ? "预览暂不可用" : "暂无效果预览"}</span>}</div>}
  </div>
}

export function SkillCasePreview({ skill, media, coverId }: { skill: SquareSkill; media: SkillCase[]; coverId?: string }) {
  const initial = Math.max(0, media.findIndex(item => item.id === coverId))
  const [index, setIndex] = useState(initial)
  const [fullscreen, setFullscreen] = useState(false)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  const active = media[index] || media[0]
  const select = (next: number) => { setIndex(next); setFailed(false); setRetry(0) }
  const video = active?.type.startsWith("video/")
  const player = (full = false) => !active ? null : failed
    ? <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"><p className="text-sm">案例暂时无法读取，请重试或联系 Skill 管理者。</p><Button variant="outline" size="sm" onClick={() => { setFailed(false); setRetry(value => value + 1) }}><RotateCw className="size-4" />重试预览</Button></div>
    : video ? <video
      key={`${active.id || active.path}-${retry}-${full}`}
      controls
      playsInline
      preload="metadata"
      src={`${skillMediaUrl(skill, active)}&v=${retry}`}
      poster={active.posterUrl ? skillMediaUrl(skill, active, { thumbnail: true, poster: true }) : undefined}
      className="size-full object-contain"
      aria-label={active.title || "Skill 视频案例"}
      onError={() => setFailed(true)}
    />
      : <img key={`${active.id || active.path}-${retry}-${full}`} src={`${skillMediaUrl(skill, active, { thumbnail: !full })}&v=${retry}`} alt={active.title || `${skill.label}案例 ${index + 1}`} className="size-full object-contain" decoding="async" onError={() => setFailed(true)} />
  return <section aria-label="Skill 效果案例" className="space-y-3">
    <div className={`relative overflow-hidden rounded-xl border border-border bg-secondary/30 ${active ? "h-[clamp(11rem,26svh,17rem)]" : ""}`}>
      {active ? <>
        {player()}
        {!failed && !video && <Button variant="secondary" size="icon" className="absolute right-3 top-3" aria-label="查看案例原图" title="查看案例原图" onClick={() => setFullscreen(true)}><Expand className="size-4" /></Button>}
      </> : <div className="flex min-h-40 flex-col items-center justify-center gap-2 px-6 py-8 text-center"><ImageIcon className="mb-1 size-6 text-muted-foreground" /><p className="text-sm font-medium">暂无案例素材</p><p className="text-xs leading-6 text-muted-foreground">尚未添加真实效果图片或视频，Skill 仍可正常使用。</p></div>}
    </div>
    {active && <div className="flex min-w-0 items-center justify-between gap-3"><p className="min-w-0 truncate text-sm text-muted-foreground">{active.title || `效果案例 ${index + 1}`}</p><div className="flex shrink-0 items-center gap-1"><span className="mr-1 text-xs tabular-nums text-muted-foreground">{index + 1} / {media.length}</span>{media.length > 1 && <><Button size="icon" variant="ghost" aria-label="上一个案例" onClick={() => select((index - 1 + media.length) % media.length)}><ChevronLeft className="size-4" /></Button><Button size="icon" variant="ghost" aria-label="下一个案例" onClick={() => select((index + 1) % media.length)}><ChevronRight className="size-4" /></Button></>}</div></div>}
    {media.length > 1 && <div className="flex gap-2 overflow-x-auto pb-1" aria-label="选择效果案例">{media.map((item, itemIndex) => <button type="button" key={item.id || item.path} className={`group w-16 shrink-0 overflow-hidden rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${itemIndex === index ? "border-primary" : "border-border hover:border-primary/50"}`} aria-pressed={itemIndex === index} aria-label={`查看案例 ${item.title || itemIndex + 1}`} onClick={() => select(itemIndex)}><SkillCaseThumbnail skill={skill} media={item} compact /></button>)}</div>}
    <Modal open={fullscreen} title={active?.title || "案例原图"} description="原始案例图片，仅在打开预览时加载。" onClose={() => setFullscreen(false)} className="sm:max-w-5xl"><div className="h-[min(65svh,48rem)] overflow-hidden rounded-lg bg-secondary/30">{fullscreen ? player(true) : null}</div></Modal>
  </section>
}
