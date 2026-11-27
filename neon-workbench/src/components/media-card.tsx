import { FileImage, Music2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { Resource } from "@/lib/api"
import { textOf } from "@/lib/text"
import { assetMedia } from "@/lib/asset-media"
import { VideoThumbnail } from "@/components/video-thumbnail"

const labels: Record<string, string> = { image: "图片", video: "视频", audio: "音频" }
export function MediaCard({ entry, onClick, selected, onSelect, description, stable = false, ratio }: { entry: Resource; onClick: () => void; selected?: boolean; onSelect?: (value: boolean) => void; description?: string; stable?: boolean; ratio?: number }) {
  const media = assetMedia(entry)
  const video = entry.resource.type === "video" && media?.kind === "video" ? media.url : ""
  const poster = entry.preview?.kind === "image" ? entry.preview.url : ""
  return <Card className={`neon-resource-card group relative overflow-hidden ${stable ? "neon-history-card" : ""} ${selected ? "border-primary" : ""}`}>
    {onSelect && <label className="absolute left-3 top-3 z-10 flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border bg-card"><input type="checkbox" aria-label={`选择素材 ${entry.resource.title}`} checked={Boolean(selected)} onChange={e => onSelect(e.target.checked)} /></label>}
    <Button variant="ghost" aria-label={`预览素材 ${textOf(entry.resource.title)}`} className="neon-resource-preview h-auto w-full rounded-none bg-secondary/40 p-0" style={stable && entry.resource.type === "image" ? { aspectRatio: String(ratio || 1) } : stable && entry.resource.type === "video" ? { aspectRatio: "16 / 9" } : undefined} data-kind={entry.resource.type} onClick={onClick}>
      {entry.preview?.url && entry.preview.kind === "image" ? <img loading="lazy" src={entry.preview.url} alt="" /> : entry.resource.type === "video" ? <VideoThumbnail src={video || undefined} posterUrl={poster} label={textOf(entry.resource.title)} className="w-full" compact showPlay /> : entry.resource.type === "audio" ? <Music2 className="size-8 text-muted-foreground" /> : <FileImage className="size-8 text-muted-foreground" />}
    </Button>
    <CardHeader className="min-w-0 gap-1 p-4"><CardTitle className="truncate text-sm" title={textOf(entry.resource.title)}>{textOf(entry.resource.title)}</CardTitle><CardDescription>{description || labels[entry.resource.type] || "文件"}</CardDescription></CardHeader>
  </Card>
}
