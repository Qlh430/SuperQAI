const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const source = path.join(__dirname, 'design-sources');
const canvasCss = fs.readFileSync(path.join(source, 'neon-canvas-surface.css'), 'utf8');
const floraCss = fs.readFileSync(path.join(source, 'flora-node-shell.css'), 'utf8');

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' });
  try {
    const page = await browser.newPage();
    await page.setContent('<main id="neonEngineSurface"><div id="canvasEditorScreen"><div id="canvasPlane"><div class="canvas-node" data-flora-node="true"><div class="flora-node-port-layer"><button class="canvas-port canvas-port-output" data-canvas-port-kind="output"></button></div></div><div class="canvas-hover-port-proxy"><button class="canvas-port canvas-port-output" data-canvas-port-kind="output"></button></div></div></div></main>');
    await page.addStyleTag({ content: '#canvasEditorScreen{--canvas-neon-bg:#101114!important;--canvas-neon-card:#17191d!important;--canvas-neon-muted:#888b91!important;--canvas-neon-primary:#42ff64!important;--canvas-neon-text:#f4f4f5!important}' });
    await page.addStyleTag({ content: canvasCss });
    await page.addStyleTag({ content: floraCss });

    const ports = page.locator('.canvas-port');
    const visual = async element => element.evaluate(element => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, border: style.borderTopColor, color: style.color, shadow: style.boxShadow, outline: style.outlineStyle, icon: getComputedStyle(element, '::after').color };
    });
    const ordinary=ports.nth(0),proxy=ports.nth(1);
    const baseline=await visual(ordinary);
    for(const [port,state] of [[ordinary,'hover'],[ordinary,'selected'],[ordinary,'magnetized'],[proxy,'hover'],[proxy,'magnetized']]) {
      if(state==='hover') await port.hover();
      else await port.evaluate((element,state)=>{if(state==='selected')element.closest('.canvas-node').classList.add('is-selected');else element.classList.add('is-magnetized');},state);
      const actual=await visual(port);
      assert.equal(actual.background,baseline.background,`${state} keeps the dark port center`);
      assert.equal(actual.border,baseline.border,`${state} keeps the thin gray ring`);
      assert.equal(actual.color,baseline.color,`${state} keeps the muted plus color`);
      assert.equal(actual.icon,baseline.icon,`${state} keeps the same plus glyph`);
      assert.equal(actual.shadow,'none',`${state} has no glow`);
      assert.equal(actual.outline,'none',`${state} adds no alternate outline`);
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
