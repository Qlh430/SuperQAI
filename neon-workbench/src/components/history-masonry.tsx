import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import type { Resource } from "@/lib/api"

type Row = { key: string; entry?: Resource; render: (ratio?: number) => ReactNode }
const dimensions = new Map<string, Promise<number>>()
function ratioOf(width: unknown, height: unknown) { const w = Number(width), h = Number(height); return w > 0 && h > 0 ? w / h : undefined }
function readRatio(entry: Resource) {
  const meta = entry.resource.metadata || {}, known = ratioOf(meta.width || meta.imageWidth, meta.height || meta.imageHeight)
  if (known) return Promise.resolve(known)
  const url = entry.preview?.url || meta.url || ""
  if (!dimensions.has(url)) {
    if (dimensions.size >= 512) dimensions.delete(dimensions.keys().next().value!)
    dimensions.set(url, (async () => {
      if (url.startsWith("/output/")) {
        try {
          const response = await fetch(`/api/image-thumbnails?source=${encodeURIComponent(url)}`, { credentials: "same-origin", signal: AbortSignal.timeout(10000) })
          if (response.ok) { const data = await response.json(); const ratio = ratioOf(data.item?.width, data.item?.height); if (ratio) return ratio }
        } catch { /* The original image is still an independent dimension source. */ }
      }
      return await new Promise<number>((resolve, reject) => {
        const image = new Image(), timer = setTimeout(() => { image.onload = image.onerror = null; reject(new Error("图片尺寸读取超时")) }, 10000)
        image.onload = () => { clearTimeout(timer); resolve(image.naturalWidth / image.naturalHeight) }
        image.onerror = () => { clearTimeout(timer); reject(new Error("图片尺寸读取失败")) }
        image.src = url
      })
    })())
  }
  return dimensions.get(url)!
}

// Sparse grid placement preserves chronological reading order across columns.
// Observe intrinsic content only: changing the grid span cannot resize it and
// trigger a measurement loop. Image decoding and responsive width changes both
// update the occupied height without cropping the original media.
function HistoryMasonryItem({ children }: { children: ReactNode }) {
  const content = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = content.current!
    const item = element.parentElement!
    const measure = () => {
      const gap = parseFloat(getComputedStyle(item.parentElement!).columnGap) || 0
      const span = `span ${Math.max(1, Math.ceil(element.getBoundingClientRect().height + gap))}`
      if (item.style.gridRowEnd !== span) item.style.gridRowEnd = span
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return <div className="neon-history-masonry-item"><div ref={content} className="neon-history-masonry-content">{children}</div></div>
}

export function HistoryMasonry({ rows }: { rows: Row[] }) {
  const [ratios, setRatios] = useState<Map<string, number>>(() => new Map(rows.flatMap(row => {
    if (row.entry?.resource.type !== "image") return []
    const meta = row.entry.resource.metadata || {}
    const ratio = ratioOf(meta.width || meta.imageWidth, meta.height || meta.imageHeight)
    return ratio ? [[row.key, ratio]] : []
  })))
  const [failed, setFailed] = useState<string[]>([])
  const signature = rows.map(row => row.key + ':' + (row.entry?.preview?.url || "")).join("|")
  useEffect(() => {
    let disposed = false
    const pending = rows.filter(row => row.entry?.resource.type === "image" && !ratios.has(row.key))
    if (!pending.length) return
    const values: [string, number][] = [], errors: string[] = []
    let cursor = 0
    const worker = async () => { while (cursor < pending.length) { const row = pending[cursor++]; try { values.push([row.key, await readRatio(row.entry!)]) } catch { errors.push(row.key); values.push([row.key, 1]) } } }
    void Promise.all(Array.from({ length: Math.min(6, pending.length) }, worker)).then(() => { if (!disposed) { setRatios(previous => new Map([...previous, ...values])); setFailed(errors) } })
    return () => { disposed = true }
    // Source identities, rather than render callbacks, own the metadata work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])
  return <div>
    {failed.length > 0 && <p role="alert" className="mb-4 text-sm text-destructive">部分图片无法读取尺寸，可打开详情检查原文件。</p>}
    <div className="neon-history-masonry">{rows.map(row => <HistoryMasonryItem key={row.key}>{row.render(ratios.get(row.key))}</HistoryMasonryItem>)}</div>
  </div>
}
