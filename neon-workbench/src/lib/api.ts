export type User = { id: string; username: string; displayName: string; role: string; status: string; lastLoginAt?: string; mustChangePassword?: boolean }
export type Project = { id: string; name: string; canvasCount: number; updatedAt?: string; isOwner?: boolean; ownerUserId?: string; ownerDisplayName?: string; permission?: string; visibility?: string; userIds?: string[]; canDelete?: boolean }
export type Board = { id: string; name?: string; title?: string; projectId?: string; resourceId?: string; isOwner?: boolean; ownerUserId?: string; ownerDisplayName?: string; sharedViaProject?: boolean; projectOwnerDisplayName?: string; nodeCount: number; updatedAt?: string; thumbnail?: string; deletedAt?: string; revision?: number; previewImages?: string[]; visibility?: string; permission?: string; share?: { id?: string; visibility?: string; userIds?: string[]; permission?: string } }
export type AssetRegistration = { id: string; resourceId: string; name: string; categoryId: string; folderId?: string; ownerUserId: string; ownerDisplayName?: string; visibility: string; userIds?: string[]; permission?: string }
export type AssetCategory = { id: string; name: string }
export type AssetFolder = { id: string; name: string; categoryId: string; parentId?: string }
export type LibraryData = { entries: Resource[]; categories: AssetCategory[]; folders: AssetFolder[] }
export type AssetCandidate = { resourceId?: string; media?: { url: string; kind: string; title: string; mimeType?: string }; name?: string; categoryId?: string; folderId?: string }
export type Resource = { asset?: AssetRegistration; resource: { id: string; type: string; title: string; ownerUserId: string; refType?: string; refId?: string; storagePath?: string; deletedAt?: string; createdAt?: string; updatedAt?: string; metadata?: { width?: number; height?: number; imageWidth?: number; imageHeight?: number; source?: string; url?: string; localUrl?: string; thumbnailUrl?: string; mimeType?: string; historyHiddenFor?: string[]; boardId?: string; nodeId?: string; resultImages?: string[]; status?: string; error?: string; prompt?: string; model?: string } }; preview?: { kind: string; url: string }; access: { locked?: boolean; permission?: string; capabilities?: { share?: boolean; delete?: boolean }; share?: { id: string; visibility: string; userIds?: string[] } }; stats?: { nodeCount: number } }
export type RecordItem = { id: string; resourceId?: string; boardId?: string; title?: string; prompt?: string; model?: string; status?: string; error?: string; createdAt?: string | number; updatedAt?: number; timestamp?: number; images?: (string | { src: string; savedUrl?: string; assetId?: string; name?: string; width?: number; height?: number })[]; messages?: { role: string; content: string; warning?: string }[]; type?: string }
export type Preferences = { appearance: { theme: string; scale: number; animations: string } }
export type Provider = { id: string; name: string; baseUrl?: string; enabled?: boolean; models?: unknown[] }

// A successful provider transaction invalidates both the React catalog and
// the same-origin canvas host. Never send provider data or secrets here.
export function publishModelsChanged(catalogRevision = 0) {
  const detail = { catalogRevision: Math.max(0, Number(catalogRevision) || 0) }
  window.dispatchEvent(new CustomEvent("neon:models-changed", { detail }))
  if (window.parent !== window) window.parent.postMessage({ type: "neon:models-changed", ...detail }, location.origin)
}

export async function request<T>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { method, credentials: "same-origin", cache: "no-store", signal,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body) })
  } catch (error) {
    if (signal?.aborted || (error as Error).name === "AbortError") throw error
    throw new Error("连接本机服务失败，请确认服务正在运行后重试。")
  }
  const data = await response.json().catch(() => {
    if (response.ok) throw new Error("服务返回的数据无法读取，请重新加载或检查服务状态。")
    return {}
  })
  if (!response.ok) {
    if (response.status === 401 && window.parent !== window) window.parent.postMessage({ type: "neon:action", action: "sessionExpired" }, location.origin)
    const code = data.code
      const message = response.status === 401 ? "登录已过期，请返回登录页重新登录。" : code === "password_change_required" ? "首次登录需要先修改临时密码，改密后即可使用。" : response.status === 403 ? "当前账户没有操作权限。" : code === "host_setup_required" ? "此操作需要在主机上完成。" : code === "canvas_route_not_found" ? `画布接口未匹配：${path}。请检查服务版本后重试。` : typeof data.error === "string" && /[\u4e00-\u9fff]/.test(data.error) ? data.error : `请求 ${path} 失败（${response.status}），请检查服务配置后重试。`
    throw Object.assign(new Error(message), { code: typeof code === "string" ? code : "", status: response.status, guidance: typeof data.guidance === "string" ? data.guidance : "" })
  }
  return data as T
}
export function hostAction(action: string, params?: unknown) {
  if (window.parent === window) {
    if (action === "canvas") {
      sessionStorage.setItem("neon-pending-host-action", JSON.stringify({ action, params }))
      location.assign("/")
      return
    }
    throw new Error("此操作需要从正式工作台入口打开。")
  }
  if (action === "canvas") sessionStorage.setItem("neon-canvas-source", location.hash.slice(1) || "home")
  window.parent.postMessage({ type: "neon:action", action, params }, window.location.origin)
}
export function dateLabel(value?: string | number) {
  if (!value) return "时间未记录"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "时间未记录" : date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}
