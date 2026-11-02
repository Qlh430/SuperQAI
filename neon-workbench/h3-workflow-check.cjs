// Node contract check for the MiniMax H3 workflow.
//
// minimax-h3-workflow.js injects the prompt, duration, steps, resolution, seed
// and output prefix by locating nodes through their class and inputs, with the
// historical node ids tried first. Run this before swapping a workflow file in.
//
// Usage: node h3-workflow-check.cjs <workflow.json>
const fs = require('node:fs')

const ROLES = [
  { role: 'H3 节点', preferred: ['222'], classTypes: ['MiniMaxH3ReferenceToVideo'], inputs: ['prompt'], required: true },
  { role: '步数', preferred: ['219'], classTypes: [], inputs: ['steps'], required: true },
  { role: '时长', preferred: ['225'], classTypes: ['PrimitiveFloat'], inputs: ['value'], required: true },
  { role: '画幅/像素', preferred: ['229'], classTypes: ['ResolutionSelector'], inputs: ['aspect_ratio', 'megapixels'], required: true },
  { role: '提示词文本', preferred: ['238'], classTypes: ['CR Text'], inputs: ['text'], required: false, fallback: '写入 H3 节点自带的 prompt 输入' },
  { role: '输出前缀', preferred: ['230'], classTypes: ['SaveVideo'], inputs: ['filename_prefix'], required: true },
  { role: '随机种子', preferred: ['210'], classTypes: ['RandomNoise'], inputs: ['noise_seed'], required: true },
]

function matches(node, role) {
  if (!node?.inputs || typeof node.inputs !== 'object') return false
  if (role.classTypes.length && !role.classTypes.includes(String(node.class_type || ''))) return false
  return role.inputs.every((key) => Object.hasOwn(node.inputs, key))
}

function locate(workflow, role) {
  const preferred = role.preferred.find((id) => matches(workflow[id], role))
  if (preferred) return { id: preferred, historical: true }
  const fallback = Object.keys(workflow).find((id) => matches(workflow[id], role))
  return fallback ? { id: fallback, historical: false } : null
}

function main() {
  const target = process.argv[2]
  if (!target) {
    console.error('用法: node h3-workflow-check.cjs <workflow.json>')
    process.exitCode = 2
    return
  }
  const workflow = JSON.parse(fs.readFileSync(target, 'utf8'))
  console.log(`文件: ${target}`)
  console.log(`节点数: ${Object.keys(workflow).length}`)
  console.log('')
  let missing = 0
  for (const role of ROLES) {
    const found = locate(workflow, role)
    if (!found) {
      if (!role.required) {
        console.log(`– ${role.role.padEnd(10)} 本工作流没有此节点，${role.fallback}`)
        continue
      }
      missing += 1
      console.log(`✗ ${role.role.padEnd(10)} 找不到（需要 ${role.classTypes.join('/') || '任意类型'} 且包含 ${role.inputs.join('+')}）`)
      continue
    }
    const via = found.historical ? '命中历史节点号' : '按类型定位'
    const type = workflow[found.id].class_type
    console.log(`✓ ${role.role.padEnd(10)} node ${String(found.id).padEnd(6)} ${String(type).padEnd(30)} ${via}`)
  }
  console.log('')
  console.log(missing
    ? `结论: 缺少 ${missing} 个必需角色，H3 运行时无法注入参数。`
    : '结论: 注入所需的角色齐全，可以安全替换。')
  process.exitCode = missing ? 1 : 0
}

main()
