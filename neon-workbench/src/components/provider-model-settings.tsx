import { useState } from "react"
import { ChevronDown, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { NativeSelect } from "@/components/ui/native-select"
import type { ProviderModel, ProviderProtocol } from "./provider-editor"
import { testCapabilities } from "./provider-diagnostics"

function resolutionKey(value: string) { const text = value.trim().toUpperCase(); return /^[124]$/.test(text) ? `${text}K` : text }
export function ModelConfiguration({ model, protocols, protocolLabel, availableResolutions, resolutionError, disabled, onChange, onValidity }: { model: ProviderModel; protocols: ProviderProtocol[]; protocolLabel: string; availableResolutions: string[]; resolutionError?: string; disabled: boolean; onChange: (patch: Partial<ProviderModel>) => void; onValidity: (valid: boolean) => void }) {
  const [advanced, setAdvanced] = useState(false)
  const [custom, setCustom] = useState("")
  const [customError, setCustomError] = useState("")
  const selected: string[] = Array.isArray(model.metadata?.resolutions) ? model.metadata.resolutions.map(String) : []
  const values = new Map<string, string>()
  for (const value of [...availableResolutions, ...selected]) { if (value.trim()) values.set(resolutionKey(value), value) }
  const selectedKeys = new Set(selected.map(resolutionKey))
  function resolutions(next: string[]) { onChange({ metadata: { ...model.metadata, resolutions: next } }) }
  function addResolution() {
    const added = custom.split(/[,，]/).map(value => value.trim()).filter(Boolean)
    if (!added.length) return
    if (added.some(value => !/^[a-z0-9:.×x_ -]{1,32}$/i.test(value))) { setCustomError("分辨率请使用如 1K、2K、4K 或 1024x1024 的格式。"); return }
    const next = [...selected], keys = new Set(selectedKeys)
    for (const value of added) { const key = resolutionKey(value); if (!keys.has(key)) { keys.add(key); next.push(value) } }
    resolutions(next); setCustom(""); setCustomError("")
  }
  return <div className="space-y-4"><div><p className="mb-2 text-sm">模型能力</p><div className="flex flex-wrap gap-2">{testCapabilities.map(([capability, label]) => <Button key={capability} type="button" size="sm" variant={model.capabilities?.includes(capability) ? "secondary" : "outline"} className={model.capabilities?.includes(capability) ? "text-primary" : ""} aria-label={`${label} ${model.id}`} aria-pressed={Boolean(model.capabilities?.includes(capability))} disabled={disabled} onClick={() => onChange({ capabilities: model.capabilities?.includes(capability) ? model.capabilities.filter(value => value !== capability) : [...(model.capabilities || []), capability], metadata: { ...model.metadata, capabilitiesExplicit: true } })}>{label}</Button>)}</div></div>
    <div className="space-y-2"><p className="text-sm">支持的分辨率</p><div className="flex flex-wrap gap-2">{[...values].map(([key, value]) => <Button key={key} type="button" size="sm" variant={selectedKeys.has(key) ? "secondary" : "outline"} className={selectedKeys.has(key) ? "text-primary" : ""} aria-label={`分辨率 ${key} ${model.id}`} aria-pressed={selectedKeys.has(key)} disabled={disabled} onClick={() => resolutions(selectedKeys.has(key) ? selected.filter(item => resolutionKey(item) !== key) : [...selected, value])}>{key}</Button>)}</div>
      {!values.size && <p className="text-xs text-muted-foreground">尚未识别此模型支持的分辨率，可按服务商说明补充。</p>}{resolutionError && <p role="alert" className="text-xs text-destructive">{resolutionError}</p>}
      <div className="flex gap-2"><Input className="min-w-0 flex-1" aria-label={`补充分辨率 ${model.id}`} placeholder="补充分辨率，如 2K、4K" value={custom} disabled={disabled} onChange={event => setCustom(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addResolution() } }} /><Button type="button" variant="outline" aria-label={`添加分辨率 ${model.id}`} disabled={disabled || !custom.trim()} onClick={addResolution}><Plus className="size-4" />添加</Button></div>
      {customError && <p role="alert" className="text-xs text-destructive">{customError}</p>}<p className="text-xs text-muted-foreground">选项来自现有适配规则或已保存配置，实际支持情况以模型测试为准。</p>
    </div>
    <div className="flex flex-wrap items-center gap-2"><p className="min-w-0 flex-1 break-words text-xs text-muted-foreground">{model.metadata?.protocolOverride ? "手动适配" : "自动适配"}：{protocolLabel}</p><Button type="button" variant="ghost" aria-label={`高级设置 ${model.id}`} aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}><ChevronDown className="size-4" />高级设置</Button></div>
    <div hidden={!advanced} className="space-y-4 border-t border-border pt-4"><label className="block text-sm">协议覆盖（高级）<NativeSelect className="mt-2" aria-label={`模型协议 ${model.id}`} disabled={disabled} value={model.protocol || ""} onChange={event => onChange({ protocol: event.target.value, metadata: { ...model.metadata, protocolOverride: Boolean(event.target.value) } })}><option value="">自动匹配</option>{protocols.filter(item => item.modelVisible !== false).map(item => <option key={item.id} value={item.id}>{item.modelLabel || item.label || item.name || item.id}</option>)}{model.protocol && !protocols.some(item => item.id === model.protocol) && <option value={model.protocol}>{model.protocol}</option>}</NativeSelect></label><p className="text-xs text-muted-foreground">一般无需修改。仅在服务商要求特殊协议时覆盖，已有适配会保留。</p><ModelParameters model={model} disabled={disabled} onValidity={onValidity} onChange={value => onChange({ metadata: { ...model.metadata, parameterOverrides: value } })} /></div>
  </div>
}

function ModelParameters({ model, disabled, onChange, onValidity }: { model: ProviderModel; disabled: boolean; onValidity: (valid: boolean) => void; onChange: (value: Record<string, unknown>) => void }) {
  const [text, setText] = useState(JSON.stringify(model.metadata?.parameterOverrides || {}, null, 2))
  const [error, setError] = useState("")
  return <label className="block text-sm">默认参数（JSON）<Textarea aria-label={`默认参数 ${model.id}`} disabled={disabled} className="mt-2 min-h-24 font-mono" value={text} onChange={event => { setText(event.target.value); try { const value = JSON.parse(event.target.value || "{}"); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(); setError(""); onValidity(true); onChange(value) } catch { onValidity(false); setError("请输入有效的 JSON 对象；修正后才能保存。") } }} /><span className="mt-1 block text-xs text-muted-foreground">使用当前模型支持的参数名称，例如 temperature、size、duration。</span>{error && <span role="alert" className="mt-1 block text-xs text-destructive">{error}</span>}</label>
}
