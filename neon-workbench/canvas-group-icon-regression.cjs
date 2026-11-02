const assert = require('node:assert/strict');
const { openFixture, settle } = require('./dom-scaling-test-support.cjs');

async function main() {
  const fixture = await openFixture({ width: 1440, height: 1000 });
  try {
    await fixture.page.evaluate(() => {
      const first = addCanvasImage('data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="160" height="120" fill="#d34"/></svg>'), '苹果.png', { x: 100, y: 140 });
      const second = addCanvasImage('data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><rect width="160" height="120" fill="#ed3"/></svg>'), '香蕉.png', { x: 320, y: 140 });
      clearCanvasSelection();
      addCanvasNodeToSelection(first);
      addCanvasNodeToSelection(second);
      const createIcons = window.lucide.createIcons;
      window.__groupIconRefreshes = [];
      window.lucide.createIcons = options => {
        const root = options?.root || document;
        window.__groupIconRefreshes.push({ connected: root.isConnected, scope: root.className || root.id || root.localName });
        return root.isConnected ? createIcons(options) : undefined;
      };
      window.qaGroup = createCanvasGroupFromSelection();
      window.lucide.createIcons = createIcons;
    });
    await settle(fixture.page, 120);
    const icons = await fixture.page.locator('.canvas-node-group .canvas-group-tools svg[data-lucide]').evaluateAll(nodes => nodes.map(node => ({name:node.dataset.lucide,box:node.getBoundingClientRect().toJSON(),display:getComputedStyle(node).display,visibility:getComputedStyle(node).visibility,opacity:getComputedStyle(node).opacity,stroke:getComputedStyle(node).stroke,html:node.outerHTML.slice(0,180)})));
    assert.deepEqual(icons.map(icon => icon.name), ['layout-grid', 'chevron-down', 'ungroup'], '新建组后布局、下拉和解组图标应已渲染');
    assert.ok(icons.every(icon => icon.box.width >= 12 && icon.box.height >= 12 && icon.display !== 'none' && icon.visibility === 'visible' && icon.opacity !== '0'), `组工具图标必须可见：${JSON.stringify(icons)}`);
    const refreshes = await fixture.page.evaluate(() => window.__groupIconRefreshes);
    assert.ok(refreshes.some(item => item.scope === 'canvas-group-tools' && item.connected), `工具栏挂载后应单独刷新图标：${JSON.stringify(refreshes)}`);
    assert.deepEqual(fixture.errors, []);
    console.log(JSON.stringify({ passed: true, icons }));
  } finally {
    await fixture.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
