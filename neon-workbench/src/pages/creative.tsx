import { useEffect, useRef, useState } from "react"
import { Download, ImagePlus, MessageSquare, Plus, Send, Settings2, Square, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { NativeSelect } from "@/components/ui/native-select"
import { Empty, ErrorPanel, Modal } from "@/components/workbench"
import { request } from "@/lib/api"
import type { RecordItem } from "@/lib/api"

type Props = { onSettings: () => void; notify: (s: string) => void; onComplete: () => void }
type Model = { id: string; displayName?: string }
type Output = { src: string; savedUrl: string; width?: number; height?: number }
type Message = { role: string; content: string }
function useModels(path: string) {
  const [models, setModels] = useState<Model[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let abort: AbortController
    const load = () => {
      abort?.abort(); abort = new AbortController(); const current = abort
      setLoading(true); setError("")
      request<{ models: (Model | string)[] }>(path, "GET", undefined, current.signal).then(data => { if (!current.signal.aborted) setModels((data.models || []).map(m => typeof m === "string" ? { id: m, displayName: m } : m)) }).catch(e => { if (!current.signal.aborted) setError(e.message) }).finally(() => { if (!current.signal.aborted) setLoading(false) })
    }
    load(); window.addEventListener("neon:models-changed", load)
    return () => { abort.abort(); window.removeEventListener("neon:models-changed", load) }
  }, [path])
  return { models, error, loading }
}
function takeReuse() {
  const stored = sessionStorage.getItem("neon-reuse")
  if (!stored) return null
  try { return JSON.parse(stored) as RecordItem } catch { return null }
}
export async function uploadImage(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("请选择图片文件。")
  if (file.size > 6 * 1024 * 1024) throw new Error("当前导入支持 6 兆字节 以内图片，请压缩后再试。")
  const response = await fetch("/api/upload-image", { method: "POST", credentials: "same-origin", headers: { "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name) }, body: file })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error("图片上传失败，请重试。")
  const url = data.url || data.local_url || data.path
  if (!url) throw new Error("上传服务没有返回图片地址。")
  return String(url)
}
export function ImageWorkspace({ onSettings, notify, onComplete }: Props) {
  const [reuse] = useState(takeReuse)
  useEffect(() => { sessionStorage.removeItem("neon-reuse") }, [])
  const [prompt, setPrompt] = useState(reuse?.prompt || "")
  const [model, setModel] = useState("")
  const [size, setSize] = useState("1024x1024")
  const [count, setCount] = useState("1")
  const [refs, setRefs] = useState<string[]>([])
  const [images, setImages] = useState<Output[]>([])
  const [pending, setPending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState("")
  const [preview, setPreview] = useState<Output | null>(null)
  const [runPrompt, setRunPrompt] = useState("")
  const controller = useRef<AbortController | null>(null)
  const files = useRef<HTMLInputElement>(null)
  const { models, error: modelError, loading } = useModels("/api/image-models")
  const modelUnavailable = !loading && !modelError && Boolean(model) && !models.some(item => item.id === model)
  useEffect(() => () => controller.current?.abort(), [])
  const generate = async (event: React.FormEvent) => {
    event.preventDefault(); if (!prompt.trim() || pending) return
    if (modelUnavailable || loading || modelError) { setError(modelError || (loading ? "模型目录正在更新，请稍后再试。" : "所选模型已移除或不支持生图，请重新选择。")); return }
    const input = prompt.trim(); setError(""); setPending(true); setRunPrompt(input)
    const abort = new AbortController(); controller.current = abort
    try {
      const result = await request<{ model?: string; data?: { url?: string; local_url?: string; b64_json?: string; width?: number; height?: number }[]; saved_images?: { url?: string }[] }>("/api/images", "POST", { ...(model ? { model } : {}), prompt: input, size, n: Number(count), reference_images: refs, quality: "auto" }, abort.signal)
      const outputs = (result.data || []).map((item, i) => {
        const savedUrl = item.local_url || result.saved_images?.[i]?.url || item.url || ""
        return { src: savedUrl || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : ""), savedUrl, width: item.width, height: item.height }
      }).filter(item => item.src)
      if (!outputs.length) throw new Error("服务未返回可显示的图片，请检查模型能力和接口配置。")
      setImages(outputs)
      // Keep the result on screen even if history persistence fails.
      try {
        if (outputs.some(image => !image.savedUrl)) throw new Error("图片仅返回临时数据，请先下载。")
        await request("/api/history/images", "POST", { record: { id: crypto.randomUUID(), prompt: input, model: result.model || model || "自动选择", images: outputs, category: "image", createdAt: Date.now(), parameters: { size, n: Number(count), reference_images: refs } } })
        notify("生成完成，结果已保存到历史记录。"); onComplete()
      } catch (e) { notify(`生成完成，但记录保存未完成：${(e as Error).message}`) }
    } catch (e) { if (!abort.signal.aborted) setError((e as Error).message) }
    finally { setPending(false); controller.current = null }
  }
  return <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(18.75rem,23.75rem)_minmax(0,1fr)] lg:overflow-hidden">
    <form onSubmit={generate} className="flex min-w-0 flex-col gap-6 border-b border-border p-5 sm:p-8 lg:overflow-y-auto lg:border-b-0 lg:border-r">
      <div><h1 className="text-2xl font-semibold">把想法变成图片</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">填写画面描述并添加参考图，生成结果会保存到历史记录。</p></div>
      <label className="block text-sm font-medium">画面描述<Textarea className="mt-3 min-h-44 text-sm leading-6" placeholder="描述主体、场景、光线和你想要的风格…" value={prompt} onChange={e => setPrompt(e.target.value)} required disabled={pending} /></label>
      <div><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-medium">参考图片 <span className="font-normal text-muted-foreground">可选</span></h2><Button type="button" variant="ghost" size="sm" disabled={pending || uploading || refs.length >= 4} onClick={() => files.current?.click()}><Plus className="size-4" />添加</Button></div><input hidden ref={files} type="file" accept="image/*" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; setUploading(true); try { const url = await uploadImage(file); setRefs(old => [...old, url]) } catch (err) { notify((err as Error).message) } finally { setUploading(false); if (files.current) files.current.value = "" } }} />
        {refs.length ? <div className="grid grid-cols-4 gap-2">{refs.map((url, i) => <div key={`${url}-${i}`} className="relative"><img src={url} alt={`参考图 ${i + 1}`} className="aspect-square w-full rounded-lg object-cover" /><Button type="button" size="icon" variant="secondary" className="absolute right-0 top-0 size-11" title={`移除参考图 ${i + 1}`} aria-label={`移除参考图 ${i + 1}`} disabled={pending} onClick={() => setRefs(old => old.filter((_, index) => index !== i))}><X className="size-3" /></Button></div>)}</div> : <p className="rounded-lg border border-dashed border-border px-4 py-5 text-xs leading-5 text-muted-foreground">{uploading ? "上传中…" : "最多 4 张，每张不超过 6 兆字节。是否支持参考图取决于所选模型。"}</p>}
      </div>
      <label className="block text-sm font-medium">生成模型<NativeSelect className="mt-3 w-full" aria-label="生成模型" value={model} disabled={pending || loading} onChange={e => setModel(e.target.value)}><option value="">{loading ? "正在加载模型…" : "自动选择可用模型"}</option>{modelUnavailable && <option value={model} disabled>原模型不可用，请重新选择</option>}{models.map(m => <option key={m.id} value={m.id}>{m.displayName || m.id}</option>)}</NativeSelect></label>
      {modelUnavailable && <p role="alert" className="text-sm text-destructive">所选模型已移除或不支持生图，请重新选择。</p>}
      {modelError && <p role="alert" className="text-sm text-destructive">{modelError}</p>}
      <div className="grid grid-cols-2 gap-4"><label className="text-sm">输出比例<NativeSelect className="mt-3 w-full" aria-label="输出比例" value={size} disabled={pending} onChange={e => setSize(e.target.value)}><option value="1024x1024">方形 1:1</option><option value="1536x1024">横版 3:2</option><option value="1024x1536">竖版 2:3</option><option value="auto">模型默认</option></NativeSelect></label><label className="text-sm">生成数量<NativeSelect className="mt-3 w-full" aria-label="生成数量" value={count} disabled={pending} onChange={e => setCount(e.target.value)}>{[1, 2, 3, 4].map(n => <option key={n} value={n}>{n} 张</option>)}</NativeSelect></label></div>
      <p className="text-xs leading-5 text-muted-foreground">模型支持的尺寸和数量可能不同；计费以服务商规则为准。</p>
      <div className="mt-auto space-y-3"><Button type="submit" size="lg" className="w-full" disabled={pending || uploading || !prompt.trim()}><ImagePlus className="size-4" />{pending ? "正在生成…" : "生成图片"}</Button>{pending && <Button type="button" variant="outline" className="w-full" onClick={() => { controller.current?.abort(); notify("已停止等待；服务商任务可能继续执行。") }}>停止等待</Button>}<Button type="button" variant="ghost" className="w-full" onClick={onSettings}><Settings2 className="size-4" />配置模型服务</Button></div>
    </form>
    <section aria-label="生成结果" className="min-w-0 p-5 sm:p-8 lg:overflow-y-auto"><div className="mb-6 flex items-center justify-between"><h2 className="text-base font-medium">AI 生成结果</h2><span className="text-xs text-muted-foreground">{pending ? "等待模型返回" : images.length ? `${images.length} 张图片` : "尚未生成"}</span></div>{error && <div className="mb-6"><ErrorPanel message={error} onRetry={() => { setError(""); notify("请确认提示词和模型后，重新点击生成。") }} /></div>}
      {images.length ? <><p className="mb-5 text-sm leading-6 text-muted-foreground">{runPrompt}</p><div className="grid gap-5 xl:grid-cols-2">{images.map((image, i) => <Card key={`${image.src}-${i}`}><CardContent className="p-3"><Button variant="ghost" className="h-auto w-full overflow-hidden p-0" aria-label={`预览生成图片 ${i + 1}`} onClick={() => setPreview(image)}><img src={image.src} alt={`生成图片 ${i + 1}`} className="h-auto w-full object-contain" /></Button><div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">{image.width && image.height ? `${image.width} × ${image.height}` : "尺寸由模型返回"}</span><Button variant="outline" size="sm" render={<a download={`生成图片-${i + 1}.png`} href={image.savedUrl || image.src} target="_blank" rel="noreferrer" />}><Download className="size-3" />下载</Button></div></CardContent></Card>)}</div></> : <Empty icon={<ImagePlus />} title={pending ? "正在绘制你的想法" : "结果将在这里呈现"} description={pending ? "可以留在此页等待；不要重复提交同一个任务。" : "输入画面描述，点击生成图片。"} />}
    </section>
    <Modal open={Boolean(preview)} title="图片预览" description="检查生成内容，下载后用于后续创作。" onClose={() => setPreview(null)}>{preview && <img src={preview.src} alt="生成图片预览" className="max-h-[65vh] w-full object-contain" />}</Modal>
  </div>
}

export function ChatWorkspace({ records, onSettings, notify, onComplete }: Props & { records: RecordItem[] }) {
  const [reuse] = useState(takeReuse)
  const [messages, setMessages] = useState<Message[]>(reuse?.messages || [])
  const [conversationId, setConversationId] = useState(reuse?.id || crypto.randomUUID())
  const [prompt, setPrompt] = useState("")
  const [model, setModel] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [historyOpen, setHistoryOpen] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const { models, error: modelError, loading } = useModels("/api/models")
  const modelUnavailable = !loading && !modelError && Boolean(model) && !models.some(item => item.id === model)
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }) }, [messages, pending])
  const send = async (event?: React.FormEvent) => {
    event?.preventDefault(); if (!prompt.trim() || pending) return
    if (modelUnavailable || loading || modelError) { setError(modelError || (loading ? "模型目录正在更新，请稍后再试。" : "所选模型已移除或不支持对话，请重新选择。")); return }
    const previous = messages; const content = prompt.trim()
    const next = [...previous, { role: "user", content }]
    setMessages(next); setPrompt(""); setPending(true); setError("")
    const abort = new AbortController(); controller.current = abort
    try {
      const result = await request<{ model?: string; choices?: { message?: { content?: string | { text?: string }[] } }[]; output_text?: string }>("/api/chat", "POST", { ...(model ? { model } : {}), messages: next, web_search: false }, abort.signal)
      const value = result.choices?.[0]?.message?.content || result.output_text
      const reply = Array.isArray(value) ? value.map(item => item.text || "").join("\n") : value
      if (!reply) throw new Error("模型未返回对话内容，请检查接口配置。")
      const completed = [...next, { role: "assistant", content: reply }]
      setMessages(completed)
      try { await request("/api/history/chat", "POST", { record: { id: conversationId, title: completed.find(m => m.role === "user")?.content.slice(0, 100) || "新对话", model: result.model || model || "自动选择", messages: completed, updatedAt: Date.now(), createdAt: reuse?.createdAt || Date.now() } }); onComplete() }
      catch (e) { notify(`回复已收到，但历史保存失败：${(e as Error).message}`) }
    } catch (e) {
      setMessages(previous); setPrompt(draft => draft ? `${content}\n\n${draft}` : content)
      if (!abort.signal.aborted) setError((e as Error).message)
    } finally { setPending(false); controller.current = null }
  }
  return <div className="flex min-h-0 flex-1 flex-col">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-8"><NativeSelect aria-label="对话模型" className="w-full max-w-72" value={model} disabled={pending || loading} onChange={e => setModel(e.target.value)}><option value="">{loading ? "加载模型…" : "自动选择对话模型"}</option>{modelUnavailable && <option value={model} disabled>原模型不可用，请重新选择</option>}{models.map(m => <option key={m.id} value={m.id}>{m.displayName || m.id}</option>)}</NativeSelect><div className="flex min-w-0 flex-wrap gap-2"><Button variant="outline" disabled={pending} onClick={() => setHistoryOpen(true)}>最近对话</Button><Button variant="outline" disabled={pending} onClick={() => { setMessages([]); setConversationId(crypto.randomUUID()); setPrompt(""); setError("") }}><Plus className="size-4" />新对话</Button><Button variant="ghost" size="icon" title="配置模型服务" aria-label="配置模型服务" onClick={onSettings}><Settings2 className="size-4" /></Button></div></div>
    <section className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-8" aria-label="对话内容"><div className="mx-auto max-w-3xl">{messages.length ? messages.map((message, index) => <article key={index} className={`mb-6 rounded-xl border border-border p-5 ${message.role === "user" ? "ml-6 bg-secondary/50 sm:ml-16" : "mr-6 bg-card sm:mr-16"}`}><h2 className="mb-3 text-xs font-medium text-muted-foreground">{message.role === "user" ? "你" : "AI 助手"}</h2><p className="whitespace-pre-wrap break-words text-sm leading-7">{message.content}</p></article>) : <div className="mx-auto max-w-lg py-12 text-center"><MessageSquare className="mx-auto mb-5 size-7 text-primary" /><h1 className="text-[2rem] font-semibold">从一个想法开始</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">讨论方案或完善提示词；发送的消息与回复会保存到历史记录。</p><div className="mt-8 grid gap-3 sm:grid-cols-2">{["帮我梳理一个产品视觉方案", "帮我完善图片生成提示词"].map(text => <Button variant="outline" className="h-auto whitespace-normal py-4 text-sm" key={text} onClick={() => setPrompt(text)}>{text}</Button>)}</div></div>}{pending && <p role="status" className="mb-5 text-sm text-muted-foreground">正在等待回复…</p>}{modelUnavailable && <p role="alert" className="mb-5 text-sm text-destructive">所选模型已移除或不支持对话，请重新选择。</p>}{(error || modelError) && <p role="alert" className="mb-5 text-sm text-destructive">{error || modelError}</p>}<div ref={bottom} /></div></section>
    <form onSubmit={send} className="border-t border-border px-4 py-4 sm:px-8"><div className="mx-auto max-w-3xl"><Textarea aria-label="对话消息" className="min-h-24 text-sm leading-6" placeholder="输入消息，Ctrl + Enter 发送…" value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); void send() } }} /><div className="mt-3 flex items-center justify-between gap-4"><p className="text-xs text-muted-foreground">AI 内容请核实后使用{pending ? "；可先输入下一条消息" : ""}</p>{pending ? <Button type="button" variant="outline" onClick={event => { event.preventDefault(); controller.current?.abort(); notify("已停止等待，输入内容已保留。") }}><Square className="size-3" />停止等待</Button> : <Button type="submit" disabled={!prompt.trim()}><Send className="size-4" />发送消息</Button>}</div></div></form>
    <Modal open={historyOpen} title="最近对话" description="选择一条对话，继续原有上下文。" onClose={() => setHistoryOpen(false)}><div className="max-h-80 space-y-2 overflow-auto">{records.length ? records.map(record => <Button variant="ghost" key={record.id} className="h-auto w-full justify-start whitespace-normal py-3 text-left" onClick={() => { setMessages(record.messages || []); setConversationId(record.id); setHistoryOpen(false); setError("") }}>{record.title || "未命名对话"}</Button>) : <p className="text-sm text-muted-foreground">还没有保存的对话。</p>}</div></Modal>
  </div>
}
