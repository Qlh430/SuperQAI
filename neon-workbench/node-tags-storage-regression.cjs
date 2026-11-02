const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const runtime = path.resolve(__dirname, '../AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app');
const source = path.join(__dirname, 'design-sources');
const { createCanvasRepository } = require(path.join(runtime, 'canvas-repository'));
(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-os-tag-test-'));
  // An isolated database and worker; never open the user's database or stop its worker.
  for (const file of fs.readdirSync(runtime).filter(f => f.endsWith('.js'))) fs.copyFileSync(path.join(runtime, file), path.join(temp, file));
  for (const file of ['canvas-db-worker.js', 'canvas-schema.js', 'canvas-node-tag-rules.js', 'canvas-scene-rules.js']) if (fs.existsSync(path.join(source, file))) fs.copyFileSync(path.join(source, file), path.join(temp, file));
  const dbPath = path.join(temp, 'test.sqlite');
  const { DatabaseSync } = require('node:sqlite');
  const legacy = new DatabaseSync(dbPath);
  const oldSchema = require(path.join(runtime, 'canvas-schema'));
  oldSchema.configureDatabase(legacy);
  legacy.exec(oldSchema.SCHEMA_SQL.replace(/    label_definitions_json TEXT,\r?\n/g, '').replace(/    label_id TEXT NOT NULL DEFAULT '',\r?\n/g, ''));
  legacy.exec('PRAGMA user_version = 5');
  legacy.prepare('INSERT INTO boards(external_id, title, viewport_json, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('legacy-board', '原画布', '{}', 5, '2026-10-08', '2026-10-08'); legacy.close();
  let repo = createCanvasRepository({ dbPath, workerPath: path.join(temp, 'canvas-db-worker.js') });
  try {
    await repo.ready(); const migrated = await repo.getBoardMeta('legacy-board'); assert.equal(migrated.title, '原画布'); assert.equal(migrated.schemaVersion, 6); assert.equal(migrated.labelDefinitions, null);
    await repo.createBoard({ id: 'tags-test', title: '标签测试' });
    assert.equal((await repo.getBoardMeta('tags-test')).labelDefinitions, null, '旧画布返回空定义，由前端初始化默认库');
    const defs = [{ id: 'scene', name: '场景', color: '#44CC66' }];
    await repo.applyOperations({ boardId: 'tags-test', baseRevision: 0, operations: [
      { operationId: 'labels', type: 'board.patch', after: { labelDefinitions: defs } },
      { operationId: 'node', type: 'node.upsert', entityId: 'a', after: { id: 'a', kind: 'text', x: 0, y: 0, width: 400, height: 400, text: '示例', nodeLabelId: 'scene' } },
    ] });
    assert.deepEqual((await repo.getBoardMeta('tags-test')).labelDefinitions, defs);
    let meta = await repo.getBoardMeta('tags-test');
    await repo.applyOperations({ boardId: 'tags-test', baseRevision: meta.revision, operations: [{ operationId: 'view', type: 'board.patch', after: { viewport: { x: 10, y: 0, scale: 1 } } }] });
    assert.deepEqual((await repo.getBoardMeta('tags-test')).labelDefinitions, defs, '视口保存不能覆盖标签库');
    await repo.close(); repo = createCanvasRepository({ dbPath, workerPath: path.join(temp, 'canvas-db-worker.js') }); await repo.ready();
    assert.deepEqual((await repo.getBoardMeta('tags-test')).labelDefinitions, defs, '重启后保留标签库');
    assert.equal((await repo.exportBoardPage({ boardId: 'tags-test', entity: 'nodes' })).items[0].nodeLabelId, 'scene');
    meta = await repo.getBoardMeta('tags-test');
    await assert.rejects(repo.applyOperations({ boardId: 'tags-test', baseRevision: meta.revision, operations: [{ operationId: 'invalid', type: 'board.patch', after: { labelDefinitions: [{ id: 'bad', name: '', color: 'red' }] } }] }), /标签/);
    assert.deepEqual((await repo.getBoardMeta('tags-test')).labelDefinitions, defs, '无效数据回滚');
    await repo.applyOperations({ boardId: 'tags-test', baseRevision: meta.revision, operations: [{ operationId: 'empty', type: 'board.patch', after: { labelDefinitions: [] } }] });
    assert.deepEqual((await repo.getBoardMeta('tags-test')).labelDefinitions, [], '空标签库不能恢复默认标签');
    await repo.createBoard({ id: 'scene-tags', title: '密集节点标签' });
    await repo.applyOperations({ boardId: 'scene-tags', baseRevision: 0, operations: Array.from({ length: 81 }, (_, i) => ({ operationId: `scene-${i}`, type: 'node.upsert', entityId: `n${i}`, after: { id: `n${i}`, kind: 'text', x: i * 10, y: 0, width: 400, height: 400, nodeLabelId: 'scene' } })) });
    const scene = await repo.queryViewport({ boardId: 'scene-tags', left: 0, top: 0, right: 1400, bottom: 800, scale: .5 });
    assert.equal(scene.mode, 'scene'); assert.ok(scene.visualNodes.length); assert.ok(scene.visualNodes.every(tuple => tuple[9] === 'scene'), '虚拟画布场景保留标签引用');
    const apiPath = fs.existsSync(path.join(source, 'canvas-storage-http-api.js')) ? path.join(source, 'canvas-storage-http-api.js') : path.join(runtime, 'canvas-storage-http-api.js');
    // Source module uses the runtime's existing resource access helper.
    fs.copyFileSync(apiPath, path.join(temp, 'canvas-storage-http-api.js'));
    const { collaborationOperations } = require(path.join(temp, 'canvas-storage-http-api'));
    assert.deepEqual(collaborationOperations([{ type: 'board.patch', after: { labelDefinitions: defs, viewport: {} } }])[0].after, { labelDefinitions: defs });
    console.log(JSON.stringify({ ok: true, isolatedDatabase: true, persistence: true, collaboration: true }));
  } finally { await repo.close(); fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1 });
