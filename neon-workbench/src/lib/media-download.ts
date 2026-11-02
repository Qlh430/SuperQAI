import { request } from "@/lib/api"

// Name lookup happens at download time so edits in another view are respected.
export async function downloadMedia(source: string, fallback: string) {
  const url = new URL(source, location.href)
  let filename = fallback.replace(/[\\/:*?"<>|]/g, "_") || "素材"
  if (url.origin === location.origin && url.pathname.startsWith("/output/")) {
    try {
      const { asset } = await request<{ asset: { downloadName: string } }>(`/api/assets/resolve?url=${encodeURIComponent(url.pathname)}`)
      filename = asset.downloadName
    } catch (error) {
      if ((error as Error & { status?: number }).status !== 404) throw error
    }
  }
  const response = await fetch(url.href, { credentials: url.origin === location.origin ? "same-origin" : "omit" })
  if (!response.ok) throw new Error("下载失败，请确认素材文件和访问权限。")
  const blob = await response.blob()
  if (!/\.[a-z0-9]{2,5}$/i.test(filename)) {
    const extension = url.pathname.match(/\.[a-z0-9]{2,5}$/i)?.[0]
    if (extension) filename += extension
  }
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = objectUrl; anchor.download = filename
  document.body.append(anchor); anchor.click(); anchor.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1500)
}
