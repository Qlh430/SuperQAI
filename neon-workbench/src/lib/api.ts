export type User = { id: string; username: string; displayName: string; role: string; status: string; lastLoginAt?: string; mustChangePassword?: boolean }
export type Project = { id: string; name: string; canvasCount: number; updatedAt?: string }
export type Board = { id: string; name?: string; title?: string; projectId?: string; resourceId?: string; isOwner?: boolean; nodeCount: number; updatedAt?: string; thumbnail?: string; deletedAt?: string }
export type Resource = { resource: { id: string; type: string; title: string; ownerUserId: string; refId?: string; storagePath?: string }; preview?: { kind: string; url: string }; access: { locked?: boolean; capabilities?: { share?: boolean; delete?: boolean }; share?: { id: string; visibility: string } }; stats?: { nodeCount: number } }
export type RecordItem = { id: string; title?: string; prompt?: string; model?: string; createdAt?: string | number; updatedAt?: number; timestamp?: number; images?: (string | { src: string; savedUrl?: string })[]; messages?: { role: string; content: string }[]; type?: string }
export type Preferences = { appearance: { theme: string; scale: number; animations: string } }
export type Provider = { id: string; name: string; baseUrl?: string; enabled?: boolean; models?: unknown[] }

export async function request<T>(path: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { method, credentials: "same-origin", cache: "no-store", signal,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (response.status === 401 && window.parent !== window) window.parent.postMessage({ type: "neon:action", action: "sessionExpired" }, location.origin)
    const code = data.code
    const message = response.status === 401 ? "登录已过期，请返回登录页重新登录。" : response.status === 403 ? "当前账户没有操作权限。" : code === "host_setup_required" ? "此操作需要在主机上完成。" : typeof data.error === "string" && /[\u4e00-\u9fff]/.test(data.error) ? data.error : `操作失败（${response.status}），请检查服务配置后重试。`
    throw new Error(message)
  }
  return data as T
}
export function hostAction(action: string, params?: unknown) {
  if (window.parent === window) throw new Error("此操作需要从正式工作台入口打开。")
  if (action === "canvas") sessionStorage.setItem("neon-canvas-source", location.hash.slice(1) || "home")
  window.parent.postMessage({ type: "neon:action", action, params }, window.location.origin)
}
export function dateLabel(value?: string | number) {
  if (!value) return "时间未记录"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "时间未记录" : date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}
