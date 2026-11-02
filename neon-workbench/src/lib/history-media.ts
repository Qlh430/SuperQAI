import type { RecordItem, Resource } from "@/lib/api"
import { assetMedia } from "@/lib/asset-media"

export type HistoryMedia = { entry: Resource; record?: RecordItem; source: string; time: string | number; key: string }
export function historyTime(value?: string | number) { const time = new Date(value || 0).getTime(); return Number.isFinite(time) ? time : 0 }
export function compareHistory(a: { time: string | number; key: string }, b: { time: string | number; key: string }) { return historyTime(b.time) - historyTime(a.time) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) }
export function collectHistoryJobs(resources: Resource[], userId: string): RecordItem[] {
  return resources.filter(entry => entry.resource.ownerUserId === userId && entry.resource.refType === "image_job" && !entry.resource.deletedAt && !entry.resource.metadata?.historyHiddenFor?.includes(userId))
    .map(entry => ({ id: entry.resource.refId || entry.resource.id, resourceId: entry.resource.id, type: "job", title: entry.resource.title, prompt: entry.resource.title, model: entry.resource.metadata?.model, status: entry.resource.metadata?.status, error: entry.resource.metadata?.error, boardId: entry.resource.metadata?.boardId, createdAt: entry.resource.createdAt, images: entry.resource.metadata?.resultImages || [] }))
}
export function mediaKey(url: string) {
  try { const parsed = new URL(url, location.origin); return parsed.origin === location.origin ? decodeURIComponent(parsed.pathname) : parsed.href } catch { return url }
}
// Old storage names remain untouched; only obvious internal labels get a safe display fallback.
function legacyMediaTitle(record: RecordItem, image: NonNullable<RecordItem["images"]>[number], index: number) {
  const title = (typeof image === "object" && image.name || record.title || "").trim()
  const internal = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{13,})(?:\.[a-z0-9]+)?$/i.test(title) || /^(?:[a-z]:[\\/]|\/?output\/)/i.test(title)
  return title && !internal ? title : `历史图片 ${index + 1}`
}
export function collectHistoryMedia(resources: Resource[], records: RecordItem[], userId: string): HistoryMedia[] {
  const result = new Map<string, HistoryMedia>()
  const hidden = new Set<string>()
  for (const entry of resources) {
    if (entry.resource.ownerUserId !== userId) continue
    if (!["image", "video", "audio"].includes(entry.resource.type)) continue
    const media = assetMedia(entry)
    if (!media || !["image", "video", "audio"].includes(media.kind)) continue
    if (entry.resource.metadata?.historyHiddenFor?.includes(userId)) { hidden.add(mediaKey(media.url)); continue }
    if (entry.resource.refType?.startsWith("history_")) continue
    const key = mediaKey(media.url)
    const item = { entry, source: entry.resource.metadata?.source === "upload" ? "upload" : "generated", time: entry.resource.createdAt || entry.resource.updatedAt || "", key }
    const previous = result.get(key)
    if (!previous || compareHistory(item, previous) < 0 || compareHistory(item, previous) === 0 && entry.resource.id < previous.entry.resource.id) result.set(key, item)
  }
  for (const record of [...records.filter(record => record.type === "image"), ...collectHistoryJobs(resources, userId)].sort((a,b) => compareHistory({time:a.createdAt || a.timestamp || a.updatedAt || "",key:a.id},{time:b.createdAt || b.timestamp || b.updatedAt || "",key:b.id}))) {
    for (const [index, image] of (record.images || []).entries()) {
      const url = typeof image === "string" ? image : image.savedUrl || image.src
      if (!url) continue
      const key = mediaKey(url)
      if (hidden.has(key)) continue
      const existing = result.get(key)
      if (existing) { existing.record ||= record; if (!existing.time) existing.time = record.createdAt || record.timestamp || record.updatedAt || ""; continue }
      const registry = resources.find(entry => entry.resource.ownerUserId === userId && entry.resource.refType === "history_image" && entry.resource.refId === record.id)
      if (registry?.resource.deletedAt || registry?.resource.metadata?.historyHiddenFor?.includes(userId)) continue
      const entry: Resource = { resource: { id: `history-result:${record.id}:${index}`, title: legacyMediaTitle(record, image, index), ownerUserId: userId, type: "image", refType: "history_result", metadata: { url, source: "generated", prompt: record.prompt || "", ...(typeof image === "object" ? {width:image.width,height:image.height} : {}) } }, preview: { kind: "image", url }, access: { capabilities: {} } }
      result.set(key, { entry, record, source: "generated", time: record.createdAt || record.timestamp || record.updatedAt || "", key })
    }
  }
  return [...result.values()].sort(compareHistory)
}
