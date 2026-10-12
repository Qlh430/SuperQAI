import { useEffect, useRef, type ReactNode } from "react"
import { CircleAlert, LoaderCircle, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export function Heading({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <header className="mb-8 flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><h1 className="text-[2rem] font-semibold leading-tight tracking-tight">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p></div>{action}</header>
}
export function Empty({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <Card className="col-span-full"><CardContent className="flex min-h-60 flex-col items-center justify-center gap-3 py-10 text-center"><span className="text-muted-foreground [&>svg]:size-6">{icon}</span><h2 className="text-base font-medium">{title}</h2><p className="max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>{action}</CardContent></Card>
}
export function Busy() { return <div className="flex items-center gap-3 py-12 text-sm text-muted-foreground" role="status"><LoaderCircle className="size-4 animate-spin" />正在加载…</div> }
export function ErrorPanel({ message, onRetry, retryLabel = "重新加载" }: { message: string; onRetry: () => void; retryLabel?: string }) { return <Card><CardContent className="flex flex-wrap items-center gap-4 p-6" role="alert"><CircleAlert className="size-5 text-destructive" /><p className="min-w-0 flex-1 break-words text-sm">{message}</p><Button variant="outline" className="min-h-11" onClick={onRetry}>{retryLabel}</Button></CardContent></Card> }
export function SearchBox({ value, onChange, placeholder, className = "" }: { value: string; onChange: (value: string) => void; placeholder: string; className?: string }) { return <div className={`relative w-full max-w-sm ${className}`}><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input aria-label={placeholder} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} className="h-11 pl-10" /></div> }
export function Modal({ open, title, description, onClose, children }: { open: boolean; title: string; description: string; onClose: () => void; children: ReactNode }) {
  const openedRoute = useRef(location.hash)
  const wasOpen = useRef(false)
  if (open && !wasOpen.current) openedRoute.current = location.hash
  wasOpen.current = open
  const sameRoute = openedRoute.current === location.hash
  useEffect(() => { if (open && !sameRoute) onClose() }, [open, sameRoute, onClose])
  useEffect(() => { if (!open) return; const close = () => onClose(); window.addEventListener("hashchange", close, true); return () => window.removeEventListener("hashchange", close, true) }, [open, onClose])
  return <Dialog open={open && sameRoute} onOpenChange={value => { if (!value) onClose() }}><DialogContent className="max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] overflow-y-auto"><DialogHeader className="pr-6"><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>{children}</DialogContent></Dialog>
}
export function Notice({ message, onClose }: { message: string; onClose: () => void }) { if (!message) return null; return <div role="status" className="pointer-events-none fixed bottom-6 right-6 z-50 flex max-w-[calc(100vw-3rem)] items-center gap-4 rounded-xl border border-border bg-popover px-5 py-4 shadow-lg"><span className="text-sm">{message}</span><Button className="pointer-events-auto" size="icon" variant="ghost" title="关闭提示" aria-label="关闭提示" onClick={onClose}><X className="size-4" /></Button></div> }
