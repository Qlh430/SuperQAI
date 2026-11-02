import { request, type Board } from "@/lib/api"
import { createId } from "@/lib/id"
import { textOf } from "@/lib/text"

export function canvasName(board: Board) {
  return textOf(board.title) || textOf(board.name)
}

export async function renameCanvas(board: Board, title: string) {
  const next = title.trim()
  if (!next) throw new Error("画布名称不能为空。")
  if (next.length > 120) throw new Error("画布名称不能超过 120 个字。")
  const current = canvasName(board)
  if (next === current) return
  await request(`/api/canvas/boards/${encodeURIComponent(board.id)}/operations`, "POST", {
    baseRevision: Number(board.revision || 0),
    operations: [{ operationId: createId(), type: "board.patch", entityId: board.id, before: { title: current }, after: { title: next } }],
  })
}
