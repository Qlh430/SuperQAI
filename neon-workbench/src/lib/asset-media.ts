import type { Resource } from "@/lib/api"

// Cards can use thumbnails; playback and downloads need the original media.
export function assetMedia(entry: Resource) {
  if (entry.access.locked || entry.resource.deletedAt) return null
  const { type, metadata, refType, refId } = entry.resource
  if (["image", "video", "audio"].includes(type)) {
    const refUrl = refType === "output_media" && refId
      ? refId.startsWith("/output/") ? refId.split("/").map(encodeURIComponent).join("/") : refId
      : ""
    const url = metadata?.url?.trim() || metadata?.localUrl?.trim() || entry.resource.storagePath?.trim() || refUrl || entry.preview?.url
    return url ? { kind: type, url } : null
  }
  return entry.preview || null
}
