import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Modal } from "@/components/workbench"
import { request, type Board } from "@/lib/api"
import { canvasName, renameCanvas } from "@/lib/canvas-naming"

export function CanvasNameDialog({ board, projectId, onClose, onComplete }: {
  board?: Board
  projectId?: string
  onClose: () => void
  onComplete: (boardId: string) => Promise<void>
}) {
  const [name, setName] = useState(board ? canvasName(board) : "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const pending = useRef(false)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (pending.current) return
    const title = name.trim()
    if (!title) { setError("画布名称不能为空。"); return }
    if (title.length > 120) { setError("画布名称不能超过 120 个字。"); return }
    pending.current = true; setSaving(true); setError("")
    try {
      let id = board?.id
      if (board) await renameCanvas(board, title)
      else {
        const created = await request<Board>("/api/canvas/boards", "POST", { title, ...(projectId ? { projectId } : {}) })
        id = created.id
        if (!id) throw new Error("画布已提交，但服务未返回画布编号，请刷新项目列表。")
      }
      await onComplete(id!)
    } catch (e) { setError((e as Error).message) }
    finally { pending.current = false; setSaving(false) }
  }
  const close = () => { if (!pending.current) onClose() }
  return <Modal open title={board ? "重命名画布" : "新建画布"} description={board ? "修改名称不会改变画布中的节点与生成关系。" : "先为画布命名，创建后即可开始创作。"} onClose={close}>
    <form noValidate onSubmit={submit} className="space-y-5">
      <label className="block text-sm">画布名称<Input autoFocus required maxLength={120} disabled={saving} value={name} onChange={e => { setName(e.target.value); setError("") }} className="mt-2" placeholder="例如：新品视觉探索" aria-invalid={Boolean(error)} /></label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-3"><Button variant="outline" disabled={saving} onClick={close}>取消</Button><Button type="submit" disabled={saving || !name.trim()}>{saving ? board ? "保存中…" : "正在创建…" : board ? "保存名称" : "创建画布"}</Button></div>
    </form>
  </Modal>
}
