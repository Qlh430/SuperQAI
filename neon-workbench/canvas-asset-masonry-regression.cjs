const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const { chromium } = require('playwright');

const read = name => fs.readFileSync(`${__dirname}/design-sources/${name}`, 'utf8');

(async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end('<main id="neonEngineSurface"><div class="canvas-workspace" style="height:700px"><div class="canvas-actions"></div></div></main>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const page = await browser.newPage({ viewport: { width: 520, height: 760 } });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.addStyleTag({ content: read('neon-page-rebuild.css') });
    await page.addStyleTag({ content: `
      #neonEngineSurface #canvasAssetGrid { height: 560px !important; }
      #neonEngineSurface .canvas-asset-card:nth-child(1) .canvas-asset-preview { height: 230px !important; }
      #neonEngineSurface .canvas-asset-card:nth-child(2) .canvas-asset-preview { height: 54px !important; }
      #neonEngineSurface .canvas-asset-card:nth-child(3) .canvas-asset-preview { height: 116px !important; }
      #neonEngineSurface .canvas-asset-card:nth-child(4) .canvas-asset-preview { height: 72px !important; }
    ` });
    await page.route('**/api/asset-library?**', route => route.fulfill({ json: {
      entries: [1, 2, 3, 4].map(index => ({
        resource: { id: `media-${index}`, type: 'image', title: `素材 ${index}`, metadata: { url: `/media-${index}.png` } },
        preview: { kind: 'image', url: `/media-${index}.png` },
        access: { locked: false },
        asset: { id: `asset-${index}`, name: `素材 ${index}`, permission: 'owner' },
      })),
      categories: [], folders: [],
    } }));
    await page.addScriptTag({ content: read('canvas-asset-library.js') });
    await page.locator('#canvasAssetLibraryButton').click();
    await page.locator('.canvas-asset-card').nth(3).waitFor();

    const layout = await page.locator('#canvasAssetGrid').evaluate(grid => ({
      display: getComputedStyle(grid).display,
      autoRows: getComputedStyle(grid).gridAutoRows,
      rowGap: parseFloat(getComputedStyle(grid).rowGap),
      cardGap: parseFloat(getComputedStyle(grid).getPropertyValue('--canvas-asset-card-gap')),
      cards: [...grid.querySelectorAll('.canvas-asset-card')].map(card => ({
        height: card.getBoundingClientRect().height,
        span: Number(card.style.gridRowEnd.match(/\d+/)?.[0]),
      })),
    }));
    assert.equal(layout.display, 'grid', '资产卡片应使用可测量行跨度的网格瀑布流');
    assert.equal(layout.autoRows, '1px', '瀑布流行基准应为 1px，避免整行按高卡片撑开');
    assert.equal(layout.rowGap, 0, '稀疏网格基准行之间不应额外加间距');
    assert.equal(layout.cardGap, 8, '窄屏素材间距应统一为 8px');
    for (const card of layout.cards) {
      assert.ok(card.span > card.height, '每张素材卡片都应按自身实测高度占用网格行');
      assert.ok(Math.abs(card.span - Math.ceil(card.height + layout.cardGap)) <= 1, '行跨度应只增加统一间距，不随相邻卡片高度改变');
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(80);
    const desktop = await page.locator('#canvasAssetGrid').evaluate(grid => ({
      rowGap: parseFloat(getComputedStyle(grid).rowGap),
      cardGap: parseFloat(getComputedStyle(grid).getPropertyValue('--canvas-asset-card-gap')),
      spans: [...grid.querySelectorAll('.canvas-asset-card')].map(card => ({
        height: card.getBoundingClientRect().height,
        span: Number(card.style.gridRowEnd.match(/\d+/)?.[0]),
      })),
    }));
    assert.equal(desktop.rowGap, 0, '桌面稀疏网格基准行之间不应额外加间距');
    assert.equal(desktop.cardGap, 10, '桌面素材间距应统一为 10px');
    assert.ok(desktop.spans.every(card => card.span > 0), '宽屏下所有素材仍应有有效行跨度');

    await page.locator('[data-asset-kind="audio"]').click();
    await page.waitForFunction(() => document.querySelectorAll('.canvas-asset-card').length === 4);
    await page.evaluate(() => {
      CanvasAssetLibrary.state.nextCursor = 'next';
      const button = document.querySelector('#canvasAssetLoadMore');
      button.hidden = false;
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForFunction(() => [...document.querySelectorAll('.canvas-asset-card')].every(card => card.style.gridRowEnd.startsWith('span ')));
    console.log('画布资产瀑布流：异高素材行跨度、响应式统一间距、筛选重绘与追加加载通过');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
