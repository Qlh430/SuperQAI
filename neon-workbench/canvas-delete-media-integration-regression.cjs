const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

async function main() {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'canvas-delete-media-'));
  const sources = [
    'canvas-storage-http-api',
    'canvas-media-gc-service',
    'canvas-media-lifecycle',
    'canvas-media-references',
    'project-share-access',
    'resource-access',
  ];
  const moduleDir = path.join(outputDir, 'modules');
  await fs.mkdir(moduleDir);
  for (const name of sources) {
    await fs.copyFile(path.join(__dirname, 'design-sources', `${name}.js`), path.join(moduleDir, `${name}.js`));
  }
  const runtimeDir = path.resolve(__dirname, '..', 'AI-OS-Portable-1.0.5-win-x64', '.ai-runtime', 'versions', '1.0.5-win-x64', 'resources', 'app');
  await fs.copyFile(path.join(runtimeDir, 'auth-crypto.js'), path.join(moduleDir, 'auth-crypto.js'));

  try {
    const { createCanvasStorageHttpApi } = require(path.join(moduleDir, 'canvas-storage-http-api.js'));
    const { createCanvasMediaGcService } = require(path.join(moduleDir, 'canvas-media-gc-service.js'));
    const boards = new Map([
      ['trash-shared', { id: 'trash-shared', deletedAt: null, nodes: [{ image: '/output/shared.png' }] }],
      ['active-shared', { id: 'active-shared', deletedAt: null, nodes: [{ image: '/output/shared.png' }] }],
      ['trash-asset', { id: 'trash-asset', deletedAt: null, nodes: [{ image: '/output/asset.png' }] }],
      ['trash-orphan', { id: 'trash-orphan', deletedAt: null, nodes: [{ image: '/output/orphan.png' }] }],
    ]);
    const resources = [];
    for (const [id, board] of boards) resources.push({ id: `board-${id}`, type: 'canvas', refType: 'canvas', refId: id, ownerUserId: 'owner', metadata: {} });
    for (const [id, refId] of [['media-shared', '/output/shared.png'], ['media-asset', '/output/asset.png'], ['media-orphan', '/output/orphan.png']]) {
      resources.push({ id, type: 'output_media', refType: 'output_media', refId, ownerUserId: 'owner' });
      await fs.writeFile(path.join(outputDir, refId.slice('/output/'.length)), id);
    }
    const assetResourceId = 'media-asset';
    const settings = new Map();
    const db = {
      listCanvasProjects: () => [],
      getResource: id => resources.find(resource => resource.id === id) || null,
      listAllResources: () => resources,
      updateResource: (id, patch) => {
        const resource = resources.find(item => item.id === id);
        if (!resource) return null;
        Object.assign(resource, patch);
        return resource;
      },
      deleteResource: id => {
        const resource = resources.find(item => item.id === id);
        if (!resource) return null;
        resource.deletedAt = 'deleted';
        return resource;
      },
      listCuratedAssets: () => [{ resourceId: assetResourceId, ownerUserId: 'owner' }],
      getSetting: key => settings.get(key),
      setSetting: (key, value) => settings.set(key, value),
    };
    const repository = {
      invoke: async (method, { boardId } = {}) => {
        if (method === 'gcBoardMediaReferences') return boards.get(boardId)?.nodes || [];
        if (method === 'gcAllBoardMediaReferences') return [...boards.values()].map(board => board.nodes);
        throw new Error(`Unexpected repository operation: ${method}`);
      },
      getBoardMeta: async boardId => boards.get(boardId) || null,
    };
    const mediaGc = createCanvasMediaGcService({ outputDir, db, getCanvasStorage: () => ({ repository }) });
    const storage = createCanvasStorageHttpApi({
      getCanvasStorage: () => ({
        repository,
        queryService: {},
        commandService: {
          trash: async boardId => { boards.get(boardId).deletedAt = 'trashed'; return { id: boardId }; },
          deletePermanently: async boardId => { boards.delete(boardId); return { id: boardId }; },
        },
      }),
      projectService: { ensureUnclassifiedProject: () => ({ id: 'default' }) },
      db,
      resourceAccess: {
        assertRead: async (_userId, id) => ({ resource: db.getResource(id), capabilities: { delete: true } }),
        assertWrite: async (_userId, id) => ({ resource: db.getResource(id), capabilities: { delete: true } }),
        deleteResource: async (_userId, id) => { const resource = db.getResource(id); if (resource) resource.deletedAt = 'deleted'; },
      },
      ensureReferencedResource: async (_userId, input) => db.getResource(`board-${input.refId}`),
      validateCanvasMediaReferences: async () => {},
      getCanvasCollabHub: () => ({ broadcastBoardState() {} }),
      readJson: async req => req.body || {},
      sendJson: (res, status, body) => { res.status = status; res.body = body; },
      publicUser: user => user,
      mediaGc,
    });

    async function request(method, url, body = {}) {
      const res = {};
      await storage.handle({ method, url, headers: { host: 'localhost' }, auth: { user: { id: 'owner' } }, body }, res);
      assert.equal(res.status, 200, `${method} ${url}: ${JSON.stringify(res.body)}`);
      return res.body;
    }
    async function exists(name) {
      await fs.access(path.join(outputDir, name));
    }
    async function missing(name) {
      await assert.rejects(fs.access(path.join(outputDir, name)), { code: 'ENOENT' });
    }

    await request('POST', '/api/canvas/boards/trash-shared/trash', { operationId: 'trash-1' });
    await exists('shared.png');
    assert.equal(boards.get('trash-shared').deletedAt, 'trashed');

    await request('DELETE', '/api/canvas/boards/trash-shared/permanent');
    await exists('shared.png');

    await request('POST', '/api/canvas/boards/trash-asset/trash', { operationId: 'trash-2' });
    await request('DELETE', '/api/canvas/boards/trash-asset/permanent');
    await exists('asset.png');

    await request('POST', '/api/canvas/boards/trash-orphan/trash', { operationId: 'trash-3' });
    await exists('orphan.png');
    const deletion = await request('DELETE', '/api/canvas/boards/trash-orphan/permanent');
    await missing('orphan.png');
    assert.deepEqual(deletion.cleanup.deleted, ['/output/orphan.png']);
    assert.ok(resources.find(resource => resource.id === 'media-orphan').deletedAt, 'orphan registry entry must be tombstoned');
    console.log('PASS canvas soft delete preserves media; permanent delete cleans only orphan files and preserves canvas/asset references');
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
