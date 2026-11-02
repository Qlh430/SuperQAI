import assert from 'node:assert/strict'
import { componentTargets } from './component-deploy.mjs'
import { dailyComponents } from './daily-workbench.mjs'

assert.deepEqual(componentTargets(['minimax-h3-quality-backend']), ['minimax-h3-workflow.js'], 'H3 质量修复只部署单一后端工作流模块')
assert.throws(() => dailyComponents('minimax-h3-quality-backend'), /后端/, '不能混入前端日常部署')
console.log('H3 质量后端组件部署边界通过')
