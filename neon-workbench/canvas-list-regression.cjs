const assert = require('node:assert/strict')
const { createCanvasStorageHttpApi } = require('../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app/canvas-storage-http-api')

async function run(fail = false) {
  let response
  const api = createCanvasStorageHttpApi({
    getCanvasStorage: () => ({
      repository: { setBoardProject: async () => {} },
      queryService: { listBoards: async () => ({ boards: [{ id: 'active', projectId: 'p' }, { id: 'deleted', projectId: 'p' }, { id: 'private', projectId: 'p' }, { id: 'race', projectId: 'p' }], trash: [{ id: 'trash', projectId: 'p', deletedAt: 'yesterday' }, { id: 'deleted-trash', projectId: 'p', deletedAt: 'yesterday' }] }) },
    }),
    projectService: { ensureUnclassifiedProject: () => ({ id: 'p' }) },
    db: { listCanvasProjects: () => [{ id: 'p' }], getUserById: () => ({ displayName: '测试账户' }) },
    ensureReferencedResource: async (_, input) => ({ id: input.refId, ownerUserId: 'u', workspaceId: 'p', deletedAt: input.refId.startsWith('deleted') ? 'yesterday' : null }),
    resourceAccess: { assertRead: async (_, id) => {
      if (fail) throw Object.assign(new Error('数据库读取失败'), { statusCode: 500 })
      if (id.startsWith('deleted')) throw new Error('已删除资源不应进行权限读取')
      if (id === 'private' || id === 'race') throw Object.assign(new Error('不可见'), { code: id === 'private' ? 'forbidden' : 'resource_not_found', statusCode: id === 'private' ? 403 : 404 })
      return { permission: 'owner', capabilities: { delete: true } }
    } },
    validateCanvasMediaReferences: async () => {}, getCanvasCollabHub: () => ({}), readJson: async () => ({}),
    sendJson: (_, status, data) => { response = { status, data } }, publicUser: value => value,
  })
  assert.equal(await api.handle({ method: 'GET', url: '/api/canvas/boards?scope=all', headers: { host: 'localhost' }, auth: { user: { id: 'u' } } }, {}), true)
  return response
}
;(async () => {
  const result = await run()
  assert.equal(result.status, 200)
  assert.deepEqual(result.data.boards.map(b => b.id), ['active'])
  assert.deepEqual(result.data.trash.map(b => b.id), ['trash'])
  assert.deepEqual(result.data.counts, { all: 1, mine: 1, shared: 0, trash: 1 })
  assert.equal(result.data.projects[0].canvasCount, 1)
  assert.equal((await run(true)).status, 500)
  console.log('画布列表回归通过：删除状态、权限隔离、并发删除及真实失败均正确处理。')
})().catch(error => { console.error(error); process.exitCode = 1 })
