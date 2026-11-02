import { request } from "@/lib/api"
import type { AssetCandidate, Resource } from "@/lib/api"
import { assetMedia } from "@/lib/asset-media"

// The canvas bridge sends flat media snapshots; registration expects media nested in a candidate.
export function candidateFromCanvasMedia(value: unknown): AssetCandidate | null {
  if (!value || typeof value !== "object") return null
  const { url, kind, title, mimeType } = value as Record<string, unknown>
  if (typeof url !== "string" || !url.trim() || typeof kind !== "string" || !["image", "video", "audio"].includes(kind)) return null
  const name = typeof title === "string" && title.trim() ? title : ({ image: "图片", video: "视频", audio: "音频" })[kind]!
  return { name, media: { url: url.trim(), kind, title: name, ...(typeof mimeType === "string" ? { mimeType } : {}) } }
}

export function candidateFromResource(entry: Resource): AssetCandidate | null {
  const media = assetMedia(entry)
  if (!media || !["image", "video", "audio"].includes(media.kind)) return null
  return { media: { ...media, title: entry.resource.title }, ...(!entry.resource.id.startsWith("history-result:") ? { resourceId: entry.resource.id } : {}), name: entry.resource.title, categoryId: entry.asset?.categoryId, folderId: entry.asset?.folderId }
}

export function openAssetRegistration(items: AssetCandidate[]) {
  if (items.length) window.dispatchEvent(new CustomEvent("neon:open-add-assets", { detail: { items } }))
}

// Resolve the captured output, never its independently editable node title.
export async function resolveAssetCandidate(item: AssetCandidate, signal?: AbortSignal): Promise<AssetCandidate> {
  if (!item.media?.url) return item
  const url = new URL(item.media.url, location.href)
  if (url.origin !== location.origin || !url.pathname.startsWith("/output/")) return item
  try {
    const { asset } = await request<{ asset: { id: string; name: string } }>(`/api/assets/resolve?url=${encodeURIComponent(url.pathname)}`, "GET", undefined, signal)
    return { ...item, resourceId: asset.id, name: asset.name, media: { ...item.media, title: asset.name } }
  } catch (error) {
    if ((error as Error & { status?: number }).status === 404) return item
    throw error
  }
}
