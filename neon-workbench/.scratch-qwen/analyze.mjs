// 只读分析：把 Qwen-image2.1 整合工作流按分组拆开，打印节点、连线与分组边界。
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const ui = JSON.parse(readFileSync(join(here, "../.design/qwen-workflow-ui-20261010.json"), "utf8").replace(/^\uFEFF/, ""))
const lines = []
const log = (...parts) => lines.push(parts.join(""))
const nodes = new Map((ui.nodes || []).map(node => [node.id, node]))
const links = new Map((ui.links || []).map(link => [link[0], link]))

function nodeLabel(node) {
  return `${node.id} ${node.type}${node.title ? ` "${node.title}"` : ""}${node.mode === 4 ? " [BYPASS]" : node.mode === 2 ? " [MUTE]" : ""}`
}

function inGroup(node, group) {
  const [x, y, width, height] = group.bounding
  const [px, py] = node.pos || [0, 0]
  return px >= x - 1 && px <= x + width + 1 && py >= y - 1 && py <= y + height + 1
}

function inputSlots(node) {
  return (node.inputs || []).map(input => `${input.name}${input.link != null ? `<-${input.link}` : ""}`)
}

function outputLinks(node) {
  return (node.outputs || []).flatMap(output => (output.links || []).map(id => `${output.name}->${id}`))
}

for (const group of ui.groups || []) {
  const inside = (ui.nodes || []).filter(node => inGroup(node, group))
  log(`\n=== GROUP ${group.id} ${group.title} bounding=${JSON.stringify(group.bounding)} nodes=${inside.length}`)
  for (const node of inside) {
    const values = Array.isArray(node.widgets_values) ? JSON.stringify(node.widgets_values).slice(0, 160) : String(node.widgets_values ?? "")
    log(`  ${nodeLabel(node)}`)
    log(`     in:  ${inputSlots(node).join(", ")}`)
    log(`     out: ${outputLinks(node).join(", ")}`)
    if (values) log(`     wv:  ${values}`)
  }
}

// 全量连线索引，便于按 link id 反查
const linkIndex = {}
for (const [id, link] of links) linkIndex[id] = { from: link[1], fromSlot: link[2], to: link[3], toSlot: link[4] }
writeFileSync(join(here, "links.json"), `${JSON.stringify(linkIndex, null, 2)}\n`, "utf8")

// 未被任何分组包含的节点
const orphan = (ui.nodes || []).filter(node => !(ui.groups || []).some(group => inGroup(node, group)))
log(`\n=== 分组外节点 ${orphan.length}`)
for (const node of orphan) log(`  ${nodeLabel(node)} pos=${JSON.stringify(node.pos)}`)

writeFileSync(join(here, "report.txt"), `${lines.join("\n")}\n`, "utf8")
