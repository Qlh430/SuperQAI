// 把 ComfyUI 的 UI 工作流（含「文/图/首尾帧生视频」与「多样参考生视频」两组）
// 转成 API 格式模板。只生成缺失的 frames 模板；reference 模板已有部署版本，
// 这里仅用同一套转换逻辑与它对照，作为转换器的自校验。
//
// 用法：
//   node build-h3-workflow-templates.mjs <ui-workflow.json> <object-info.json>
// 输入文件可从本机或局域网 ComfyUI 读取：
//   GET /api/userdata/workflows/<name>      -> UI 工作流
//   GET /object_info                        -> 节点 schema（可裁剪成用到的类）
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const source = dirname(fileURLToPath(import.meta.url))
const workflowDir = join(source, "design-sources/workflows")
const REFERENCE_FILE = join(workflowDir, "minimax-h3-video.json")
const FRAMES_FILE = join(workflowDir, "minimax-h3-video-frames.json")
const GROUP_TITLES = {
  frames: "文/图/首尾帧生视频（8步）",
  reference: "多样参考生视频（8步）",
}
// 已部署的 reference 模板在这些类上用了 ComfyUI 能接受的键名，
// 新模板沿用同一套键名，避免动态组合控件在不同版本里换名。
const STRUCTURAL_PATCH = {
  CreateVideo: { color_space: "sRGB", codec: "none" },
}

function parseArgs() {
  const [uiPath, objectInfoPath] = process.argv.slice(2)
  if (!uiPath || !objectInfoPath) {
    throw new Error("需要 UI 工作流与 object_info 两个输入文件。")
  }
  return {
    ui: JSON.parse(readFileSync(resolve(uiPath), "utf8")),
    schema: JSON.parse(readFileSync(resolve(objectInfoPath), "utf8")),
  }
}

function schemaInputs(schema, type) {
  const entry = schema[type]
  if (!entry) return null
  return { required: entry.required || {}, optional: entry.optional || {} }
}

function isWidgetSpec(spec) {
  const head = Array.isArray(spec) ? spec[0] : null
  if (Array.isArray(head)) return true
  return ["INT", "FLOAT", "STRING", "BOOLEAN", "COMBO", "COMFY_DYNAMICCOMBO_V3", "COMFY_AUTOGROW_V3"].includes(head)
}

// 动态组合控件在 API 格式里展开成父键与子键，例如 SaveVideo 的
// format / format.codec。
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

function convertGroup(ui, schema, groupTitle) {
  const group = (ui.groups || []).find(item => item.title === groupTitle)
  if (!group) throw new Error(`工作流缺少分组：${groupTitle}`)
  const [x, y, width, height] = group.bounding
  const nodes = (ui.nodes || []).filter((node) => {
    const [px, py] = node.pos || [0, 0]
    return px >= x - 1 && px <= x + width + 1 && py >= y - 1 && py <= y + height + 1
  })
  const links = new Map((ui.links || []).map(link => [link[0], { from: String(link[1]), slot: link[2] }]))
  const api = {}
  for (const node of nodes) {
    const inputs = schemaInputs(schema, node.type)
    if (!inputs) continue // 前端专用节点（Note/MarkdownNote）不进 API 提示词
    const values = Array.isArray(node.widgets_values) ? node.widgets_values : []
    const declared = new Set()
    let cursor = 0
    const result = {}
    for (const input of node.inputs || []) {
      if (input.widget) {
        const value = values[cursor]
        cursor += 1
        if (Object.hasOwn(inputs.required, input.name) || Object.hasOwn(inputs.optional, input.name)) {
          declared.add(input.name)
          if (input.link == null && value !== undefined) result[input.name] = value
        }
      }
      if (input.link != null) {
        const link = links.get(input.link)
        if (link) {
          declared.add(input.name)
          result[input.name] = [link.from, link.slot]
        }
      }
    }
    const defaults = widgetDefaults(node.type, schema)
    for (const [name, value] of Object.entries(STRUCTURAL_PATCH[node.type] || {})) {
      if (!Object.hasOwn(result, name)) result[name] = value
    }
    for (const [name, value] of Object.entries(defaults)) {
      if (result[name] === undefined) result[name] = value
    }
    api[String(node.id)] = { inputs: result, class_type: node.type, _meta: { title: node.title || "" } }
  }
  return api
}

function diffTemplates(deployed, generated) {
  const differences = []
  for (const id of new Set([...Object.keys(deployed), ...Object.keys(generated)])) {
    const left = deployed[id]
    const right = generated[id]
    if (!left) { differences.push(`生成多出节点 ${id} ${right.class_type}`); continue }
    if (!right) { differences.push(`部署模板缺少节点 ${id} ${left.class_type}`); continue }
    if (left.class_type !== right.class_type) {
      differences.push(`节点 ${id} 类不同：${left.class_type} / ${right.class_type}`)
      continue
    }
    for (const key of new Set([...Object.keys(left.inputs || {}), ...Object.keys(right.inputs || {})])) {
      const a = JSON.stringify(left.inputs?.[key])
      const b = JSON.stringify(right.inputs?.[key])
      if (a !== b) differences.push(`节点 ${id} 输入 ${key}：部署 ${a} / 生成 ${b}`)
    }
  }
  return differences
}

function main() {
  const { ui, schema } = parseArgs()
  const deployed = JSON.parse(readFileSync(REFERENCE_FILE, "utf8"))
  const reference = convertGroup(ui, schema, GROUP_TITLES.reference)
  const frames = convertGroup(ui, schema, GROUP_TITLES.frames)
  // 模板只提供结构，提示词与素材由宿主在提交时注入，避免把用户内容写进仓库。
  for (const node of Object.values(reference)) if (node.class_type === "MiniMaxH3ReferenceToVideo") node.inputs.prompt = ""
  for (const node of Object.values(frames)) if (node.class_type === "MiniMaxH3ImageToVideo") node.inputs.prompt = ""
  const allowed = new Set(["prompt", "image", "video", "audio", "filename_prefix", "noise_seed", "value", "aspect_ratio", "megapixels"])
  const differences = diffTemplates(deployed, reference).filter((line) => {
    const key = line.match(/输入 ([^：]+)：/)?.[1]
    return !key || !allowed.has(key)
  })
  writeFileSync(FRAMES_FILE, `${JSON.stringify(frames, null, 2)}\n`, "utf8")
  console.log(JSON.stringify({
    framesNodes: Object.keys(frames).length,
    referenceNodes: Object.keys(reference).length,
    structuralDifferences: differences,
    framesCore: Object.entries(frames)
      .filter(([, node]) => /MiniMaxH3(ImageToVideo|DualClock)|LoadImage|SaveVideo|ResolutionSelector|PrimitiveFloat|RandomNoise/.test(node.class_type))
      .map(([id, node]) => ({ id, class: node.class_type, inputs: node.inputs })),
    referenceCore: Object.entries(reference)
      .filter(([, node]) => /MiniMaxH3(ReferenceToVideo|DualClock)|SaveVideo/.test(node.class_type))
      .map(([id, node]) => ({ id, class: node.class_type, keys: Object.keys(node.inputs) })),
  }, null, 2))
}

main()
