import { useState } from "react"
import { FileImage, LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/workbench"
import { AssetActions } from "@/components/resource-actions"
import type { Resource } from "@/lib/api"
import { textOf } from "@/lib/text"
import { assetMedia } from "@/lib/asset-media"

const labels: Record<string, string> = { canvas: "画布", image: "图片", video: "视频", audio: "音频", chat: "对话", file: "文件", job: "任务" }

function PreviewMedia({ entry, fullscreen }: { entry: Resource; fullscreen: boolean }) {
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  if (entry.access.locked) return <p className="text-sm text-muted-foreground">此素材需要共享口令，暂未解锁。</p>
  const media = assetMedia(entry)
  if (!media?.url || !["image", "video", "audio"].includes(media.kind)) return <FileImage className="size-8 text-muted-foreground" />
  const loaded = () => { setLoading(false); setFailed(false) }
  const error = () => { setLoading(false); setFailed(true) }
  const size = fullscreen ? "h-full w-full object-contain" : "max-h-96 w-full rounded-lg object-contain"
  return <>
    {failed ? <div role="alert" className="flex flex-col items-center gap-4 text-center"><p className="text-sm text-destructive">{labels[media.kind]}加载失败，请重试。</p><Button variant="outline" onClick={() => { setLoading(true); setFailed(false); setAttempt(old => old + 1) }}>重新加载</Button></div> : <>
      {media.kind === "image" ? <img key={attempt} src={media.url} alt={textOf(entry.resource.title)} className={size} onLoad={loaded} onError={error} /> : media.kind === "video" ? <video key={attempt} src={media.url} aria-label={textOf(entry.resource.title)} controls playsInline preload="metadata" className={size} onLoadedData={loaded} onError={error} /> : <audio key={attempt} src={media.url} aria-label={textOf(entry.resource.title)} controls preload="metadata" className="w-full" onLoadedData={loaded} onError={error} />}
      {loading && <div role="status" className="pointer-events-none absolute inset-0 flex items-center justify-center gap-3 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />正在加载{labels[media.kind]}…</div>}
    </>}
  </>
}

export function AssetPreview({ entry, fullscreen = false, refresh, notify, onClose, onDelete, onContinue }: {
  entry: Resource | null
  fullscreen?: boolean
  refresh: () => Promise<void>
  notify: (message: string) => void
  onClose: () => void
  onDelete?: () => Promise<void>
  onContinue?: () => void
}) {
  const visibility = entry?.asset?.visibility || entry?.access.share?.visibility
  const description = `${labels[entry?.resource.type || ""] || "文件"}，${visibility === "all" ? "共享给全部账户" : visibility === "password" ? "口令共享" : visibility === "users" ? "指定账户可见" : "仅自己可见"}`
  return <Modal open={Boolean(entry)} title={textOf(entry?.resource.title).length > 160 ? "素材预览" : textOf(entry?.resource.title) || "素材预览"} description={description} onClose={onClose}
    className={fullscreen ? "left-0 top-0 flex h-[100svh] max-h-[100svh] w-screen max-w-none translate-x-0 translate-y-0 flex-col overflow-hidden rounded-none border-0 bg-background p-4 shadow-none sm:p-6 md:w-screen data-starting-style:scale-100 data-starting-style:translate-y-0 data-ending-style:scale-100 data-ending-style:translate-y-0" : undefined}>
    {entry && <>
      <div className={fullscreen ? "relative flex min-h-0 flex-1 items-center justify-center overflow-hidden" : "relative flex min-h-32 items-center justify-center"}>
        <PreviewMedia key={`${entry.resource.id}:${assetMedia(entry)?.url}`} entry={entry} fullscreen={fullscreen} />
      </div>
      <div className={fullscreen ? "max-h-[45svh] shrink-0 overflow-y-auto border-t border-border pt-4" : undefined}>
        {entry.resource.metadata?.prompt && <div className="mb-4 space-y-2"><p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{textOf(entry.resource.metadata.prompt)}</p><Button variant="outline" onClick={() => { void navigator.clipboard.writeText(textOf(entry.resource.metadata?.prompt)).then(() => notify("提示词已复制。"), () => notify("复制失败，请选中文本复制。")) }}>复制完整提示词</Button></div>}
        <AssetActions entry={entry} refresh={refresh} notify={notify} onClose={onClose} onDelete={onDelete} onContinue={onContinue} />
      </div>
    </>}
  </Modal>
}
