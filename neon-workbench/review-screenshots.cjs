const { chromium } = require("playwright")
const fs = require("node:fs")
const path = require("node:path")

async function main() {
  const source = path.join(__dirname, "acceptance")
  const target = path.join(__dirname, "..", ".design", "neon-workbench", "screenshots")
  fs.mkdirSync(target, { recursive: true })
  for (const file of fs.readdirSync(source).filter(file => file.endsWith(".png"))) {
    fs.copyFileSync(path.join(source, file), path.join(target, file))
  }
  const browser = await chromium.launch({ headless: true, executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" })
  try {
    for (const width of [375, 1280]) {
      const cellWidth = width === 375 ? 300 : 480
      const cellHeight = width === 375 ? 768 : 360
      const page = await browser.newPage({ viewport: { width: cellWidth * 4, height: (cellHeight + 32) * 2 } })
      const images = ["home", "projects", "assets", "history", "settings", "account", "image", "chat"].map(route => {
        const data = fs.readFileSync(path.join(source, `${width}-${route}.png`)).toString("base64")
        return `<figure><figcaption>${width} · ${route}</figcaption><img src="data:image/png;base64,${data}"></figure>`
      }).join("")
      await page.setContent(`<html><style>body{margin:0;background:#222;color:white;font:14px system-ui;display:grid;grid-template-columns:repeat(4,${cellWidth}px)}figure{margin:0}figcaption{height:32px;padding-left:8px;line-height:32px}img{display:block;width:${cellWidth}px;height:${cellHeight}px;object-fit:contain;object-position:top;background:#080a0d}</style>${images}</html>`)
      await page.screenshot({ path: path.join(target, `review-${width}-all-pages.png`), fullPage: true })
      await page.close()
    }
    console.log(target)
  } finally {
    await browser.close()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
