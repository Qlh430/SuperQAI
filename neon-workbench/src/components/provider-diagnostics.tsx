import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { request } from "@/lib/api"
import type { ProviderConnection, ProviderModel, ProviderProtocol } from "./provider-editor"

type Draft = ProviderConnection & { apiKey: string; networkMode: string }
type TestResult = { status: string; text?: string; images?: string[]; videos?: string[]; audios?: string[]; taskId?: string; toolCallCount?: number; elapsedMs?: number; message?: string; code?: string; guidance?: string }
type Verification = { available?: boolean; selectedProtocol?: string; models?: unknown[]; code?: string; guidance?: string; recommendedProtocol?: string; attempts?: { message?: string; code?: string }[] }
export const testCapabilities = [["llm.chat", "对话"], ["llm.chat.vision", "视觉理解"], ["llm.tools", "工具调用"], ["image.generate", "图片生成"], ["image.edit", "图片编辑"], ["video.generate", "视频生成"], ["audio.generate", "音频生成"]]

function connectionSignature(provider: Draft) {
  return JSON.stringify([provider.baseUrl, provider.protocol, provider.apiKey, provider.networkMode])
}
function explainFailure(value: { code?: string; message?: string; guidance?: string }, secret = "") {
  const causes: Record<string, [string, string]> = {
    UPSTREAM_AUTH: ["密钥无效或没有调用权限。", "请检查密钥是否正确、过期，以及该模型是否已授权。"],
    UPSTREAM_QUOTA_EXHAUSTED: ["服务商余额或调用额度不足。", "请在服务商后台检查余额和模型额度。"],
    UPSTREAM_RATE_LIMIT: ["请求过于频繁，服务商限制了调用。", "请稍后重试，或检查服务商的并发限制。"],
    UPSTREAM_TIMEOUT: ["等待服务商响应超时。", "请检查接口地址与网络线路，稍后重试。"],
    UPSTREAM_PROTOCOL: ["返回内容与当前协议不匹配。", "请核对接口地址和平台协议；未提供模型目录的服务可手动添加模型后测试。"],
    UPSTREAM_UNAVAILABLE: ["服务商暂时不可用或网络连接失败。", "请检查接口地址、网络线路和服务商状态。"],
    provider_model_capability_missing: ["当前模型未启用这项能力。", "请核对模型能力与服务商说明后重新测试。"],
    provider_test_invalid_response: ["上游响应没有可用的测试结果。", "请检查模型协议、参数和服务商的任务记录。"],
  }
  const pair = causes[value.code || ""]
  const clean = (text: string) => secret ? text.split(secret).join("[已隐藏]") : text
  const reason = (value.message && /[\u4e00-\u9fff]/.test(value.message) ? value.message : pair?.[0]) || "测试未通过，服务没有返回有效结果。"
  const guidance = (value.guidance && /[\u4e00-\u9fff]/.test(value.guidance) ? value.guidance : pair?.[1]) || "请检查服务配置和模型参数后重试。"
  return { reason: clean(reason), guidance: clean(guidance) }
}
function mediaSource(value: string, kind: string) {
  if (typeof value !== "string") return ""
  if (value.startsWith(`data:${kind}/`) && /^data:(?:image|audio|video)\/[a-z0-9.+-]+;base64,[a-z0-9+/]+=*$/i.test(value)) return value
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? value : "" } catch { return "" }
}

export function ProviderVerification({ provider, protocols, disabled, discovering, onDiscover, onBusy }: { provider: Draft; protocols: ProviderProtocol[]; disabled: boolean; discovering: boolean; onDiscover: () => void; onBusy: (busy: boolean) => void }) {
  const signature = connectionSignature(provider)
  const latest = useRef(signature); latest.current = signature
  const busyCallback = useRef(onBusy); busyCallback.current = onBusy
  const serial = useRef(0), controller = useRef<AbortController | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ value: Verification; signature: string; elapsedMs: number; error?: string } | null>(null)
  useEffect(() => { serial.current++; controller.current?.abort(); setLoading(false); busyCallback.current(false); return () => { serial.current++; controller.current?.abort(); busyCallback.current(false) } }, [signature])
  const label = (id?: string) => protocols.find(item => item.id === id)?.label || protocols.find(item => item.id === id)?.name || id || "当前协议"
  async function verify() {
    if (loading || disabled) return
    const current = ++serial.current, snapshot = signature, started = performance.now()
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort
    setLoading(true); busyCallback.current(true)
    try {
      const value = await request<Verification>("/api/providers/verify-protocol", "POST", { provider, options: { suggestAlternatives: true } }, abort.signal)
      if (!abort.signal.aborted && current === serial.current && latest.current === snapshot) setResult({ value, signature: snapshot, elapsedMs: performance.now() - started })
    } catch (error) {
      if (!abort.signal.aborted && current === serial.current && latest.current === snapshot) setResult({ value: { available: false, code: (error as { code?: string }).code, guidance: (error as { guidance?: string }).guidance }, error: (error as Error).message, signature: snapshot, elapsedMs: performance.now() - started })
    } finally { if (current === serial.current) { setLoading(false); busyCallback.current(false) } }
  }
  const stale = Boolean(result && result.signature !== signature)
  const failed = result && explainFailure({ ...result.value, message: result.error || result.value.attempts?.find(item => item.message)?.message }, provider.apiKey)
  return <div className="flex flex-wrap items-start gap-2"><Button type="button" variant="outline" disabled={disabled || loading} onClick={() => void verify()}>{loading ? "验证中…" : "验证协议"}</Button><Button type="button" variant="outline" disabled={disabled || loading} onClick={onDiscover}>{discovering ? "拉取中…" : "拉取模型"}</Button>
    {(loading || result) && <div className="min-w-0 basis-full space-y-1 text-sm sm:basis-0 sm:flex-1" role={loading || stale || result?.value.available === true ? "status" : "alert"}>
      {loading ? <p className="text-muted-foreground">正在验证服务连接和模型目录…</p> : stale ? <p className="text-muted-foreground">配置已修改，请重新验证协议。</p> : result?.value.available === true ? <><p className="text-primary">协议验证通过 · {label(result.value.selectedProtocol)} · 耗时 {(result.elapsedMs / 1000).toFixed(1)} 秒</p><p className="text-xs text-muted-foreground">已能读取模型目录（{result.value.models?.length || 0} 个模型）。具体模型能否调用，请逐项测试。</p></> : <><p className="text-destructive">协议验证未通过：{failed?.reason}</p><p className="text-xs text-muted-foreground">{failed?.guidance}</p>{result?.value.code && <p className="break-all text-xs text-muted-foreground">错误代码：{result.value.code}</p>}{result?.value.recommendedProtocol && <p className="text-xs text-muted-foreground">建议平台协议：{label(result.value.recommendedProtocol)}。切换后请重新验证。</p>}</>}
    </div>}
  </div>
}

export function ModelTest({ provider, model, disabled, onBusy }: { provider: Draft; model: ProviderModel; disabled: boolean; onBusy: (busy: boolean) => void }) {
  const [prompt, setPrompt] = useState("请生成一个简洁的测试结果。")
  const [reference, setReference] = useState("")
  const [fileError, setFileError] = useState("")
  const [testing, setTesting] = useState("")
  const [previewError, setPreviewError] = useState("")
  const [result, setResult] = useState<{ value: TestResult; signature: string; capability: string; requestId: number } | null>(null)
  const signature = JSON.stringify([connectionSignature(provider), model.id, model.protocol, model.capabilities, model.metadata, prompt, reference])
  const latest = useRef(signature); latest.current = signature
  const busyCallback = useRef(onBusy); busyCallback.current = onBusy
  const serial = useRef(0), controller = useRef<AbortController | null>(null), fileSerial = useRef(0)
  useEffect(() => { serial.current++; controller.current?.abort(); setTesting(""); busyCallback.current(false); return () => { serial.current++; controller.current?.abort(); busyCallback.current(false) } }, [signature])
  useEffect(() => () => { fileSerial.current++ }, [])
  const needsImage = model.capabilities?.some(value => ["image.edit", "llm.chat.vision"].includes(value))
  async function readImage(file?: File) {
    const current = ++fileSerial.current; setFileError("")
    if (!file) { setReference(""); return }
    if (!["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"].includes(file.type) || file.size > 8 * 1024 * 1024) { setReference(""); setFileError("请选择不超过 8MB 的 PNG、JPEG、WebP、GIF 或 AVIF 图片。"); return }
    const reader = new FileReader()
    reader.onload = () => { if (current === fileSerial.current) setReference(typeof reader.result === "string" ? reader.result : "") }
    reader.onerror = () => { if (current === fileSerial.current) { setReference(""); setFileError("读取测试图片失败，请重新选择。") } }
    reader.readAsDataURL(file)
  }
  async function test(capability: string) {
    if (testing || disabled || !prompt.trim()) return
    if (["image.edit", "llm.chat.vision"].includes(capability) && !reference) { setFileError("请先选择测试参考图，再测试这项能力。"); return }
    const current = ++serial.current, snapshot = signature, started = performance.now()
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort
    setTesting(capability); busyCallback.current(true); setFileError(""); setPreviewError("")
    const routes: Record<string, string> = { "llm.chat": "test", "llm.chat.vision": "test-vision", "llm.tools": "test-tools", "image.generate": "test-image", "image.edit": "test-image-edit", "video.generate": "test-video", "audio.generate": "test-audio" }
    const input: Record<string, unknown> = { prompt: prompt.trim() }
    if (["image.edit", "llm.chat.vision"].includes(capability)) input.inputImages = [reference]
    if (capability === "llm.tools") { input.tools = [{ type: "function", function: { name: "ping", description: "测试工具调用，请调用此工具。", parameters: { type: "object", properties: {}, additionalProperties: false } } }]; input.toolChoice = { type: "function", function: { name: "ping" } } }
    try {
      const data = await request<{ test?: TestResult }>(`/api/providers/${routes[capability]}`, "POST", { provider, modelId: model.id, input, params: model.metadata?.parameterOverrides || {} }, abort.signal)
      if (!abort.signal.aborted && current === serial.current && latest.current === snapshot) {
        const value = data.test || { status: "invalid", message: "服务没有返回可用的测试结果。" }
        const content = capability === "llm.tools" ? Number(value.toolCallCount) > 0 : capability.startsWith("image.") ? value.images?.some(source => mediaSource(source, "image")) : capability === "video.generate" ? value.videos?.some(source => mediaSource(source, "video")) : capability === "audio.generate" ? value.audios?.some(source => mediaSource(source, "audio")) : Boolean(value.text?.trim())
        setResult({ value: { ...value, status: value.status === "succeeded" && !content ? "invalid" : value.status, elapsedMs: value.elapsedMs ?? performance.now() - started }, signature: snapshot, capability, requestId: current })
      }
    } catch (error) { if (!abort.signal.aborted && current === serial.current && latest.current === snapshot) setResult({ value: { status: "failed", message: (error as Error).message, code: (error as { code?: string }).code, guidance: (error as { guidance?: string }).guidance, elapsedMs: performance.now() - started }, signature: snapshot, capability, requestId: current }) }
    finally { if (current === serial.current) { setTesting(""); busyCallback.current(false) } }
  }
  const stale = Boolean(result && result.signature !== signature)
  const value = result?.value, failure = value && explainFailure(value, provider.apiKey)
  function previewFailed() { if (result?.signature === latest.current && result.requestId === serial.current) setPreviewError("测试结果预览加载失败，请检查资源链接或网络后重试。") }
  return <div className="space-y-3 border-t border-border pt-4"><p className="text-sm font-medium">模型测试</p><label className="block text-sm">测试提示词<Textarea className="mt-2 min-h-20" aria-label={`测试提示词 ${model.id}`} value={prompt} onChange={event => setPrompt(event.target.value)} /></label>
    {needsImage && <div className="space-y-2"><label className="block text-sm">测试参考图<Input className="mt-2" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" aria-label={`测试参考图 ${model.id}`} onChange={event => void readImage(event.target.files?.[0])} /></label>{reference && <div className="flex items-center gap-2"><img className="size-16 rounded-md border border-border object-contain" src={reference} alt="测试参考图预览" /><Button type="button" variant="ghost" onClick={() => { fileSerial.current++; setReference(""); setFileError("") }}>移除参考图</Button></div>}</div>}
    <div className="flex flex-wrap gap-2">{testCapabilities.filter(([capability]) => model.capabilities?.includes(capability)).map(([capability, label]) => <Button key={capability} type="button" size="sm" variant="outline" disabled={disabled || Boolean(testing) || !prompt.trim()} onClick={() => void test(capability)}>{testing === capability ? "测试中…" : `测试${label}`}</Button>)}</div>
    {!model.capabilities?.length && <p className="text-xs text-muted-foreground">选择模型能力后可测试。</p>}<p className="text-xs text-muted-foreground">测试会实际调用服务商，可能产生费用；仅在点击测试时发起。</p>
    {fileError && <p role="alert" className="text-sm text-destructive">{fileError}</p>}
    {testing ? <p role="status" className="text-sm text-muted-foreground">正在测试，等待上游返回真实结果…</p> : value && <div className="min-w-0 space-y-2 break-words" role={stale || ["succeeded", "pending"].includes(value.status) ? "status" : "alert"}>
      {stale ? <p className="text-sm text-muted-foreground">配置或测试内容已修改，请重新测试。</p> : <><p className={value.status === "succeeded" && !previewError ? "text-sm text-primary" : value.status === "pending" ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>{value.status === "succeeded" ? previewError ? "结果预览失败" : "测试成功" : value.status === "pending" ? "等待结果" : "测试未通过"} · 耗时 {((value.elapsedMs || 0) / 1000).toFixed(1)} 秒</p>
      {value.status === "pending" ? <p className="text-xs text-muted-foreground">上游仅返回任务编号，尚未确认完成。请在服务商任务页查看结果。{value.taskId && <span className="block break-all">任务编号：{value.taskId}</span>}</p> : value.status !== "succeeded" ? <><p className="text-sm">{failure?.reason}</p><p className="text-xs text-muted-foreground">{failure?.guidance}</p>{value.code && <p className="break-all text-xs text-muted-foreground">错误代码：{value.code}</p>}</> : <>
        {value.text && <p className="whitespace-pre-wrap break-words text-sm">{value.text}</p>}{Boolean(value.toolCallCount) && <p className="text-sm">已收到 {value.toolCallCount} 次真实工具调用。</p>}
        {value.images?.filter(source => mediaSource(source, "image")).map((source, index) => <img key={`${index}-${source.slice(0, 100)}`} className="max-h-64 max-w-full rounded-md border border-border object-contain" src={source} onError={previewFailed} alt={`模型测试生成图片 ${index + 1}`} />)}
        {value.videos?.filter(source => mediaSource(source, "video")).map((source, index) => <video key={index} className="max-h-64 w-full rounded-md border border-border" src={source} onError={previewFailed} controls preload="metadata" aria-label={`模型测试视频 ${index + 1}`} />)}
        {value.audios?.filter(source => mediaSource(source, "audio")).map((source, index) => <audio key={index} className="w-full" src={source} onError={previewFailed} controls preload="metadata" aria-label={`模型测试音频 ${index + 1}`} />)}
      </>}{previewError && <p role="alert" className="text-sm text-destructive">{previewError}</p>}</>}
    </div>}
  </div>
}
