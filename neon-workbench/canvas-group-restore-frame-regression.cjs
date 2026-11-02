const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const RUNTIME = process.env.QA_RUNTIME_ROOT
  ? path.resolve(process.env.QA_RUNTIME_ROOT)
  : path.join(ROOT, 'AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app');

(async () => {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(RUNTIME, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(RUNTIME + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, body) => {
      if (error) { res.writeHead(404).end(); return; }
      const type = path.extname(file) === '.css' ? 'text/css' : path.extname(file) === '.js' ? 'application/javascript' : 'text/html';
      res.writeHead(200, { 'Content-Type': type }).end(body);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  process.env.AI_OS_TEST_URL = `http://127.0.0.1:${server.address().port}`;
  const S = require('./dom-scaling-test-support.cjs');
  const fixture = await S.openFixture();
  try {
    const result = await fixture.page.evaluate(async () => {
      const seed = JSON.parse(JSON.stringify(__domScalingSeeds[0]));
      restoreCanvasBoard({
        id: 'group-restore-frame-board',
        nodes: [
          { ...seed, id: '1', x: 100, y: 100, width: 400, height: 400 },
          { ...seed, id: '2', x: 650, y: 100, width: 400, height: 400 },
          { kind: 'group', id: 'g', x: 84, y: 84, width: 450, height: 480, groupMembers: ['1', '2'], groupTitle: '图片组', zOrder: 0 },
        ],
        connections: [],
        viewport: { x: 30, y: 60, scale: 0.5 },
      });
      canvasState.isRestoring = false;
      canvasState.activeBoardPersisted = false;
      clearCanvasSelection();
      CanvasNodeRepresentation.reconcile();
      await new Promise(resolve => setTimeout(resolve, 900));
      const group = toCanvasOperationNode(canvasVirtualStore.get('g'));
      const members = ['1', '2'].map(id => getCanvasGroupSubjectBounds(id));
      const bounds = CanvasGeometryRules.unionRects(members);
      return { group, bounds };
    });
    assert.ok(result.group.x <= result.bounds.left, '恢复后的组左边界必须覆盖成员');
    assert.ok(result.group.y <= result.bounds.top, '恢复后的组上边界必须覆盖成员');
    assert.ok(result.group.x + result.group.width >= result.bounds.right, '恢复后的组右边界必须覆盖成员');
    assert.ok(result.group.y + result.group.height >= result.bounds.bottom, '恢复后的组下边界必须覆盖成员');
    assert.deepEqual(fixture.errors, []);
    console.log('canvas-group-restore-frame-regression: ok');
  } finally {
    await fixture.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
