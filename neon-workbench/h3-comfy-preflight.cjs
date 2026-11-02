const fs = require('node:fs')
const workflow = JSON.parse(fs.readFileSync('AI-OS-Portable-1.0.5-win-x64/data/workflows/minimax-h3-video.json', 'utf8'))
const needed = [...new Set(Object.values(workflow).map(n => n.class_type))].sort()
;(async () => {
  const bases = ['http://127.0.0.1:8188', 'http://127.0.0.1:8000', 'http://127.0.0.1:8288']
  for (const base of bases) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 4000)
      const response = await fetch(`${base}/object_info`, { signal: controller.signal })
      clearTimeout(timer)
      if (!response.ok) { console.log(`${base} -> HTTP ${response.status}`); continue }
      const info = await response.json()
      const have = new Set(Object.keys(info || {}))
      const missing = needed.filter(name => !have.has(name))
      console.log(`${base} -> 可达，已注册节点 ${have.size} 个`)
      console.log(missing.length ? `缺少节点: ${missing.join(', ')}` : '该工作流需要的节点全部存在')
      return
    } catch (error) {
      console.log(`${base} -> 不可达（${error.message}）`)
    }
  }
})()
