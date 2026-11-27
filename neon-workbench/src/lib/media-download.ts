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
  if (!response.ok) {
    const message = response.status === 401 ? "登录已过期，请重新登录后下载。"
      : response.status === 403 ? "当前账户没有读取此素材的权限。"
        : response.status === 404 ? "素材文件不存在或已被移除。"
          : `下载失败（${response.status}），请确认素材文件和访问权限。`
    throw new Error(message)
  }
  const contentType = response.headers.get("content-type") || ""
  if (/^(text\/html|text\/plain|application\/json)\b/i.test(contentType)) {
    throw new Error("服务返回了错误页面而不是素材文件，请检查素材地址和账户权限。")
  }
  const blob = await response.blob()
  if (!blob.size) throw new Error("下载失败：服务返回了空文件。")
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
