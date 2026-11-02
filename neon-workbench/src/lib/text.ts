// 历史记录里的文字字段不一定都是字符串：带图片的画布对话会把消息保存成
// [{ type: "text", text }, { type: "image_url", … }] 这样的内容片段。
// 这些片段一旦直接交给 React 当子节点，整页会抛错（React error #31），
// 所以渲染前统一取纯文本。
const TEXT_KEYS = ["text", "content", "title", "prompt", "name", "value", "message"]

export function textOf(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join("\n")
  if (typeof value !== "object") return ""
  const record = value as Record<string, unknown>
  for (const key of TEXT_KEYS) {
    if (!(key in record)) continue
    const text = textOf(record[key])
    if (text.trim()) return text
  }
  return ""
}

// 接口返回的列表在渲染前把展示字段收成字符串：任何 JSON 里出现的对象或内容
// 片段都不会再被当成 React 子节点，也不会流到别的页面。
export function textList<T extends Record<string, unknown>>(items: unknown, fields: string[], extra?: (item: T) => T): T[] {
  if (!Array.isArray(items)) return []
  return items.filter(item => item && typeof item === "object").map(item => {
    const next = { ...(item as T) }
    for (const field of fields) {
      const value = (item as Record<string, unknown>)[field]
      if (value == null || typeof value === "string") continue
      ;(next as Record<string, unknown>)[field] = textOf(value)
    }
    return extra ? extra(next) : next
  })
}

// 单个对象的文字字段同样收成字符串。调用方常对这些字段做 slice / toLowerCase，
// 一旦拿到对象就是运行时崩溃，不只是渲染报错。
export function textFields<T extends Record<string, unknown>>(item: unknown, fields: string[]): T | null {
  if (!item || typeof item !== "object") return null
  const next = { ...(item as T) } as Record<string, unknown>
  for (const field of fields) {
    const value = next[field]
    if (value == null || typeof value === "string") continue
    next[field] = textOf(value)
  }
  return next as T
}
