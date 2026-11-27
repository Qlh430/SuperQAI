import { useEffect, useState } from "react"
import { Play, Video } from "lucide-react"

export function VideoThumbnail({ src, posterUrl, label = "视频案例", className = "", compact = false, showPlay = false }: {
  src?: string
  posterUrl?: string
  label?: string
  className?: string
  compact?: boolean
  showPlay?: boolean
}) {
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [posterFailed, setPosterFailed] = useState(false)
  useEffect(() => {
    setReady(false)
    setFailed(false)
    setPosterFailed(false)
  }, [src, posterUrl])
  const hasPoster = Boolean(posterUrl && !posterFailed)
  return <div className={`relative flex aspect-video items-center justify-center overflow-hidden bg-secondary/40 ${className}`} role="img" aria-label={`${label}封面预览`}>
    {src && <video
      src={src}
      poster={hasPoster ? posterUrl : undefined}
      muted
      playsInline
      preload="metadata"
      tabIndex={-1}
      aria-hidden="true"
      className="absolute inset-0 size-full object-cover"
      onLoadedMetadata={event => {
        const video = event.currentTarget
        if (Number.isFinite(video.duration) && video.duration > 0.05) {
          try { video.currentTime = Math.min(0.1, video.duration / 2) } catch { /* Browser may not support seeking this source. */ }
        }
      }}
      onLoadedData={event => { event.currentTarget.pause(); setReady(true); setFailed(false) }}
      onError={() => setFailed(true)}
    />}
    {hasPoster && <img
      src={posterUrl}
      alt=""
      loading="lazy"
      decoding="async"
      className={`absolute inset-0 size-full object-cover transition-opacity ${ready ? "opacity-0" : "opacity-100"}`}
      onError={() => setPosterFailed(true)}
    />}
    {(!src || (failed && !hasPoster) || (!ready && !hasPoster)) && <span className="relative z-[1] flex flex-col items-center gap-2 text-xs text-muted-foreground">
      <Video className="size-5" aria-hidden="true" />
      {!compact && <span>{failed ? "视频封面暂不可用" : src ? "正在读取视频封面…" : "暂无视频预览"}</span>}
    </span>}
    {showPlay && <span className="absolute bottom-2 right-2 z-[2] rounded-md bg-background/90 p-1.5 text-foreground">
      <Play className="size-3.5" aria-hidden="true" />
    </span>}
  </div>
}
