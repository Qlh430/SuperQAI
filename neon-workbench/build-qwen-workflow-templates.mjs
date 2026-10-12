// 把 ComfyUI 的「Qwen-image2.1-图像编辑+生图流（整合）」UI 工作流转成两份 API 模板：
//   qwen-image21-edit.json      —— 图像编辑（最多 8 张参考图）
//   qwen-image21-generate.json  —— 文生图（无参考图）
//
// 用法：
//   node build-qwen-workflow-templates.mjs <ui-workflow.json> <object-info.json> [--check]
//   --check 只打印结构与校验结果，不写文件。
//
// 转换规则（与 build-h3-workflow-templates.mjs 保持同一套键名约定）：
// 1. 以分组矩形内的节点为种子，沿输入连线做传递闭包；跨分组的辅助节点（8 张参考图、
//    提示词增强）会被闭包自动拉进来。
// 2. 分组当前的 bypass 状态是「可选开关」而不是图结构。核心节点一律按启用处理；
//    只有明确标注「(可选)」的加速/LoRA/缓存节点保持旁路，等价于从图里删掉并把连线接回。
// 3. 前端专用节点（Note / Label / Image Comparer）不在 object_info 里，自动跳过。
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const source = dirname(fileURLToPath(import.meta.url))
const workflowDir = join(source, "design-sources/workflows")

const EDIT_GROUP = "Qwen-image21-图像编辑"
const GENERATE_GROUP = "Qwen-image21-生图"

// 「▼加速节点(可选)」「▼4步lora(可选)」和 QwenImage21Cache 当前是旁路状态，
// 代表用户选择不启用。转换时按旁路处理：删掉节点，把连线接到它的输入来源。
const OPTIONAL_BYPASS = new Set(["483", "649", "653", "661", "663"])

// 只做前端预览、不参与出图的节点（例如 rgthree 的图片对比器）不进模板。
const FRONTEND_ONLY_TYPES = new Set(["Image Comparer (rgthree)", "PreviewImage", "Note", "MarkdownNote", "Label (rgthree)"])

function parseArgs() {
  const args = process.argv.slice(2)
  const check = args.includes("--check")
  const [uiPath, objectInfoPath] = args.filter((item) => !item.startsWith("--"))
  if (!uiPath || !objectInfoPath) throw new Error("需要 UI 工作流与 object_info 两个输入文件。")
  return {
    check,
    ui: JSON.parse(readFileSync(resolve(uiPath), "utf8").replace(/^\uFEFF/, "")),
    schema: JSON.parse(readFileSync(resolve(objectInfoPath), "utf8").replace(/^\uFEFF/, "")),
  }
}

function schemaInputs(schema, type) {
  const entry = schema[type]
  if (!entry) return null
  // ComfyUI 的 /object_info 把输入放在 entry.input 下；旧模板里也出现过扁平结构。
  const bag = entry.input || entry
  return { required: bag.required || {}, optional: bag.optional || {} }
}

function schemaOutputs(schema, type) {
  const entry = schema[type]
  if (!entry) return []
  return Array.isArray(entry.output) ? entry.output : []
}

function isWidgetSpec(spec) {
  const head = Array.isArray(spec) ? spec[0] : null
  if (Array.isArray(head)) return true
  return ["INT", "FLOAT", "STRING", "BOOLEAN", "COMBO", "COMFY_DYNAMICCOMBO_V3", "COMFY_AUTOGROW_V3"].includes(head)
}

function dynamicComboKeys(name, spec) {
  const first = spec?.[1]?.options?.[0]
  if (!first) return []
  const keys = [[name, first.key]]
  for (const [childName, childSpec] of Object.entries(first.inputs?.required || {})) {
    keys.push(...dynamicComboKeys(`${name}.${childName}`, childSpec))
  }
  return keys
}

function widgetDefaults(type, schema) {
  const inputs = schemaInputs(schema, type)
  if (!inputs) return {}
  const defaults = {}
  for (const [name, spec] of [...Object.entries(inputs.required), ...Object.entries(inputs.optional)]) {
    if (!isWidgetSpec(spec)) continue
    if (Array.isArray(spec[0]) || spec[0] === "COMBO") {
      const options = Array.isArray(spec[0]) ? spec[0] : spec[1]?.options
      defaults[name] = spec[1]?.default ?? (Array.isArray(options) ? options[0] : "")
      continue
    }
    if (spec[0] === "COMFY_DYNAMICCOMBO_V3") {
      for (const [key, value] of dynamicComboKeys(name, spec)) defaults[key] = value
      continue
    }
    if ("default" in (spec[1] || {})) defaults[name] = spec[1].default
  }
  return defaults
}

function groupNodes(ui, title) {
  const group = (ui.groups || []).find((item) => item.title === title)
  if (!group) throw new Error(`工作流缺少分组：${title}`)
  const [x, y, width, height] = group.bounding
  return (ui.nodes || []).filter((node) => {
    const [px, py] = node.pos || [0, 0]
    return px >= x - 1 && px <= x + width + 1 && py >= y - 1 && py <= y + height + 1
  })
}

// 把 UI 里的一条 link 转成 [来源节点, 来源槽位]；来源被旁路时沿它的输入继续回溯。
function resolveSource(linkId, links, nodesById, bypassed, seen = new Set()) {
  const link = links.get(linkId)
  if (!link) return null
  const fromId = String(link.from)
  if (!bypassed.has(fromId)) return [fromId, link.fromSlot]
  if (seen.has(fromId)) return null
  seen.add(fromId)
  const node = nodesById.get(Number(fromId))
  const produced = node?.outputs?.[link.fromSlot]
  if (!node || !produced) return null
  for (const input of node.inputs || []) {
    if (input.type !== produced.type || input.link == null) continue
    return resolveSource(input.link, links, nodesById, bypassed, seen)
  }
  return null
}

function convertGroup(ui, schema, title) {
  const nodesById = new Map((ui.nodes || []).map((node) => [node.id, node]))
  const links = new Map((ui.links || []).map((link) => [link[0], { from: String(link[1]), fromSlot: link[2] }]))
  const seeds = groupNodes(ui, title)
  const bypassed = new Set([...OPTIONAL_BYPASS].filter((id) => nodesById.has(Number(id))))

  const included = new Set()
  const queue = seeds.map((node) => node.id)
  while (queue.length) {
    const id = queue.pop()
    if (included.has(id)) continue
    included.add(id)
    const node = nodesById.get(id)
    for (const input of node?.inputs || []) {
      if (input.link == null) continue
      const link = links.get(input.link)
      if (link) queue.push(Number(link.from))
    }
  }

  const api = {}
  for (const id of included) {
    const node = nodesById.get(id)
    if (!node || bypassed.has(String(id))) continue
    if (FRONTEND_ONLY_TYPES.has(node.type)) continue
    const inputs = schemaInputs(schema, node.type)
    if (!inputs) continue // Note / Label / Image Comparer 等前端专用节点不进 API 提示词
    const values = Array.isArray(node.widgets_values) ? node.widgets_values : []
    const named = node.widgets_values_named && typeof node.widgets_values_named === "object"
      ? node.widgets_values_named
      : null
    const declared = new Set()
    let cursor = 0
    const result = {}
    for (const input of node.inputs || []) {
      if (input.widget) {
        const value = named && Object.hasOwn(named, input.name) ? named[input.name] : values[cursor]
        cursor += 1
        if (Object.hasOwn(inputs.required, input.name) || Object.hasOwn(inputs.optional, input.name)) {
          declared.add(input.name)
          if (input.link == null && value !== undefined) result[input.name] = value
        }
      }
      if (input.link != null) {
        const sourceRef = resolveSource(input.link, links, nodesById, bypassed)
        if (sourceRef) {
          declared.add(input.name)
          result[input.name] = sourceRef
        }
      }
    }
    for (const [name, value] of Object.entries(widgetDefaults(node.type, schema))) {
      if (result[name] === undefined) result[name] = value
    }
    api[String(node.id)] = { inputs: result, class_type: node.type, _meta: { title: node.title || "" } }
  }
  return api
}

// 校验：每个引用的节点/槽位都存在，且连线两侧类型一致。
function validate(api, schema) {
  const problems = []
  for (const [id, node] of Object.entries(api)) {
    const inputs = schemaInputs(schema, node.class_type)
    if (!inputs) {
      problems.push(`节点 ${id} 的类 ${node.class_type} 不在 object_info 中`)
      continue
    }
    for (const [name, value] of Object.entries(node.inputs)) {
      const spec = inputs.required[name] || inputs.optional[name]
      if (!spec && !name.includes(".")) {
        problems.push(`节点 ${id} ${node.class_type} 的输入 ${name} 不在 schema 中`)
      }
      if (!Array.isArray(value)) continue
      const [target, slot] = value
      const upstream = api[target]
      if (!upstream) {
        problems.push(`节点 ${id}.${name} 指向不存在的节点 ${target}`)
        continue
      }
      const upstreamOutputs = schemaOutputs(schema, upstream.class_type).length
      if (typeof slot !== "number" || slot < 0) problems.push(`节点 ${id}.${name} 的槽位非法：${slot}`)
      if (upstreamOutputs && slot >= upstreamOutputs) problems.push(`节点 ${id}.${name} 的槽位 ${slot} 超出 ${upstream.class_type} 的 ${upstreamOutputs} 个输出`)
      if (upstreamOutputs === 0) problems.push(`节点 ${id}.${name} 指向没有输出的节点 ${target}`)
    }
  }
  for (const [id, node] of Object.entries(api)) {
    for (const [name, value] of Object.entries(node.inputs)) {
      if (Array.isArray(value) && !api[value[0]]) problems.push(`节点 ${id}.${name} 悬空引用 ${value[0]}`)
    }
  }
  return problems
}

function main() {
  const { check, ui, schema } = parseArgs()
  const edit = convertGroup(ui, schema, EDIT_GROUP)
  const generate = convertGroup(ui, schema, GENERATE_GROUP)

  // 提示词与素材由宿主在提交时注入，模板里只留空值，避免把用户内容写进仓库。
  for (const node of Object.values(edit)) {
    if (node.class_type === "PrimitiveStringMultiline") node.inputs.value = ""
    if (node.class_type === "LoadImage") node.inputs.image = ""
    if (node.class_type === "Seed (rgthree)") node.inputs.seed = -1
    if (node.class_type === "TE_text_display") {
      node.inputs.use_edited_text = false
      node.inputs.text = ""
      node.inputs.edited_from_text = ""
    }
  }
  for (const node of Object.values(generate)) {
    if (node.class_type === "PrimitiveStringMultiline") node.inputs.value = ""
    if (node.class_type === "Seed (rgthree)") node.inputs.seed = -1
    if (node.class_type === "TE_text_display") {
      node.inputs.use_edited_text = false
      node.inputs.text = ""
      node.inputs.edited_from_text = ""
    }
  }

  const report = {
    editNodes: Object.keys(edit).length,
    generateNodes: Object.keys(generate).length,
    editProblems: validate(edit, schema),
    generateProblems: validate(generate, schema),
    editCore: Object.entries(edit)
      .filter(([, node]) => /TextEncodeQwenImage21|KSampler|SaveImage|LoadImage|Prompt_Enhancer|TE_text_display|ResolutionSelector|ImageScaleToTotalPixels/.test(node.class_type))
      .map(([id, node]) => ({ id, class: node.class_type, keys: Object.keys(node.inputs) })),
    generateCore: Object.entries(generate)
      .filter(([, node]) => /TextEncodeQwenImage21|KSampler|SaveImage|Prompt_Enhancer|TE_text_display|ResolutionSelector/.test(node.class_type))
      .map(([id, node]) => ({ id, class: node.class_type, keys: Object.keys(node.inputs) })),
  }
  if (!check) {
    mkdirSync(workflowDir, { recursive: true })
    writeFileSync(join(workflowDir, "qwen-image21-edit.json"), `${JSON.stringify(edit, null, 2)}\n`, "utf8")
    writeFileSync(join(workflowDir, "qwen-image21-generate.json"), `${JSON.stringify(generate, null, 2)}\n`, "utf8")
  }
  console.log(JSON.stringify(report, null, 2))
}

main()
