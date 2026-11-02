const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const runtime = path.join(root, 'AI-OS-Portable-1.0.5-win-x64/.ai-runtime/versions/1.0.5-win-x64/resources/app');
const out = path.resolve(process.env.CANVAS_EVIDENCE_DIR || path.join(root, '.planning/canvas-empty-selection-20261016'));
fs.mkdirSync(out, { recursive: true });
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname.startsWith('/api/')) return res.writeHead(403).end();
  const file = path.resolve(runtime, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(runtime + path.sep)) return res.writeHead(403).end();
  fs.readFile(file, (err, bytes) => {
    if (err) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': ({ '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png' })[path.extname(file)] || 'application/octet-stream' }).end(bytes);
  });
});
(async () => {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  process.env.AI_OS_TEST_URL = `http://127.0.0.1:${server.address().port}`;
  const S = require('./dom-scaling-test-support.cjs');
  const results = { cases: [], failures: [] };
  try {
    for (const width of [390, 768, 1440, 1728]) {
      const f = await S.openFixture({ width, height: 1050 });
      try {
        const checks = [];
        const capture = async (name, expected) => {
          const state = await f.page.evaluate(() => {
            const box = document.querySelector('#canvasSelectionBox'), tools = box.querySelector('.canvas-selection-tools');
            const visible = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return !el.hidden && s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 && el.getClientRects().length > 0; };
            return { box: visible(box), tools: visible(tools) && visible(box), marquee: box.classList.contains('is-marquee'), selected: canvasState.selectedIds.size };
          });
          checks.push({ name, state, expected });
          await f.page.screenshot({ path: path.join(out, `${width}-${name}.png`) });
          for (const [key, value] of Object.entries(expected)) {
            if (state[key] !== value) results.failures.push(`${width}/${name}: ${key} expected ${value}, got ${state[key]}`);
          }
        };
        const rect = await f.page.locator('#infiniteCanvas').boundingBox();
        const x = rect.x + 50, y = rect.y + 180;
        await f.page.mouse.move(x, y); await f.page.mouse.down();
        await capture('blank-down', { tools:false, selected:0 });
        await f.page.mouse.up();
        await capture('blank-click', { tools:false, box:false, selected:0 });
        await f.page.mouse.move(x, y); await f.page.mouse.down();
        await f.page.mouse.move(x + 170, y + 130, { steps:8 });
        await capture('empty-drag', { tools:false, box:true, selected:0, marquee:true });
        await f.page.mouse.up();
        await capture('empty-release', { tools:false, box:false, selected:0, marquee:false });
        await f.page.evaluate(() => {
          const seed = __domScalingSeeds[0];
          const nodes = ['1','2'].map((id, i) => ({ ...seed, id, x:60+i*300, y:180, width:220, height:220, resultSrc:__domScalingPNG }));
          restoreCanvasBoard({ id:'dom-scaling-mock-board', nodes, connections:[], viewport:{ x:0, y:0, scale:.4 } });
          canvasState.isRestoring=false; canvasState.activeBoardPersisted=false; clearCanvasSelection(); CanvasNodeRepresentation.reconcile();
        });
        await S.settle(f.page, 850);
        const v = await f.page.locator('#infiniteCanvas').boundingBox();
        await f.page.mouse.move(v.x+8, v.y+10); await f.page.mouse.down();
        await f.page.mouse.move(v.x+250, v.y+210, { steps:10 });
        await capture('members-drag', { tools:false, selected:2, marquee:true });
        await f.page.mouse.up();
        await capture('members-release', { tools:true, box:true, selected:2, marquee:false });
        await f.page.mouse.click(v.x+v.width-35, v.y+700);
        await capture('clear-multi', { tools:false, box:false, selected:0 });
        assert.deepEqual(f.errors, []);
        results.cases.push({ width, checks, errors:f.errors });
      } finally { await f.close(); }
    }
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify({ cases:results.cases.length, checks:results.cases.reduce((n,c)=>n+c.checks.length,0), failures:results.failures }));
    assert.deepEqual(results.failures, []);
  } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode=1; });
