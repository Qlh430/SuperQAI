const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

const videoFixture = path.join(__dirname, '../AI-OS-Portable-1.0.5-win-x64/data/output/minimax_h3_1791456128166_2ef47959.mp4')
const detail = {
  id: 'qa-video-skill',
  label: '视频案例 Skill',
  description: '隔离预览验收',
  category: 'creative',
  categoryLabel: '创作',
  scope: 'personal',
  enabled: true,
  featured: false,
  coverId: 'saved-clip',
  instructions: '隔离测试说明',
  references: [],
  canManagePresentation: true,
  categoryOptions: [],
  presentation: {
    displayName: '',
    categories: [],
    summary: '隔离视频案例预览',
    capabilities: '',
    inputs: '',
    outputs: '',
    coverId: 'saved-clip',
    media: [{ id: 'saved-clip', type: 'video/mp4', title: '已保存视频案例' }],
  },
  media: [{ id: 'saved-clip', type: 'video/mp4', title: '已保存视频案例' }],
}

async function main() {
  assert.ok(fs.existsSync(videoFixture), 'uses the existing playable MP4 without generating a new one')
  const { createServer } = await import('vite')
  const server = await createServer({
    configFile: path.join(__dirname, 'vite.config.ts'),
    root: __dirname,
    server: { host: '127.0.0.1', port: 33198, strictPort: true, open: false },
    logLevel: 'error',
  })
  await server.listen()
  const browser = await chromium.launch({
    headless: true,
    executablePath: fs.existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')
      ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' : undefined,
  })
  const context = await browser.newContext({ acceptDownloads: true })
  const page = await context.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  let savedPresentation = null
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.route('**/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname === '/api/skills/detail') {
      return route.fulfill({ json: { ...detail, ...(savedPresentation ? { media: savedPresentation.media, presentation: savedPresentation, coverId: savedPresentation.coverId } : {}) } })
    }
    if (url.pathname === '/api/asset-library') {
      return route.fulfill({ json: { entries: [{
        resource: { id: 'qa-video-asset', type: 'video', title: '视频素材', ownerUserId: 'qa', metadata: { url: '/output/qa-existing-video.mp4', mimeType: 'video/mp4' } },
        asset: { id: 'qa-video-asset', ownerUserId: 'qa' },
        access: { locked: false },
      }], categories: [], folders: [] } })
    }
    if (url.pathname === '/api/skills/presentation' && request.method() === 'POST') {
      savedPresentation = request.postDataJSON()
      return route.fulfill({ json: { ok: true } })
    }
    if (url.pathname === '/api/skills/media') {
      return route.fulfill({
        status: 200,
        contentType: 'video/mp4',
        body: fs.readFileSync(videoFixture),
      })
    }
    return route.fulfill({ json: {} })
  })
  await page.route('**/output/qa-existing-video.mp4', route => route.fulfill({
    status: 200,
    contentType: 'video/mp4',
    body: fs.readFileSync(videoFixture),
  }))
  try {
    await page.goto('http://127.0.0.1:33198/test-fixtures/video-preview-harness.html', { waitUntil: 'networkidle' })
    await page.evaluate(() => window.mountVideoPreviewCases())
    await page.waitForFunction(() => {
      const videos = Array.from(document.querySelectorAll('video'))
      return videos.length >= 3 && videos.every(video => video.readyState >= 2 && video.paused && (!video.controls ? video.muted : !video.autoplay))
    }, undefined, { timeout: 15000 })
    const firstFrameCount = await page.locator('video').count()
    assert.ok(firstFrameCount >= 3, 'history, Skill square and Skill detail contain static video frames')
    assert.equal(await page.locator('video[autoplay]').count(), 0, 'static previews do not autoplay')
    const detailVideo = page.locator('section[aria-label="Skill 效果案例"] video[aria-label="已保存视频案例"]')
    await detailVideo.waitFor()
    assert.equal(await detailVideo.evaluate(video => video.controls), true, 'Skill detail opens directly with native playback controls')
    assert.equal(await detailVideo.evaluate(video => video.paused), true, 'Skill detail video starts paused')
    assert.equal(await detailVideo.evaluate(video => video.autoplay), false, 'Skill detail video does not autoplay')
    assert.equal(await detailVideo.evaluate(video => video.preload), 'metadata', 'Skill detail loads metadata without eagerly downloading the whole video')
    assert.equal(await detailVideo.evaluate(video => getComputedStyle(video).objectFit), 'contain', 'portrait video is fully visible without cropping')
    assert.equal(await page.getByRole('button', { name: /播放案例/ }).count(), 0, 'no separate play-to-switch button is required')
    assert.equal(await page.getByText('播放视频', { exact: true }).count(), 0, 'detail does not show a separate play CTA')
    const detailBounds = await detailVideo.boundingBox()
    assert.ok(detailBounds && detailBounds.width > 0 && detailBounds.height > 0, 'native player occupies the case preview surface')
    await detailVideo.click({ position: { x: detailBounds.width / 2, y: detailBounds.height / 2 } })
    await page.waitForFunction(() => !document.querySelector('section[aria-label="Skill 效果案例"] video')?.paused, undefined, { timeout: 5000 })
    await detailVideo.evaluate(video => video.pause())

    await page.getByRole('button', { name: '重新打开案例编辑' }).click()
    const pickerButton = page.getByRole('button', { name: '从素材库选择' })
    await pickerButton.click()
    const assetPicker = page.getByRole('dialog').last()
    await assetPicker.getByRole('button', { name: /视频素材/ }).waitFor()
    await assetPicker.locator('video').waitFor()
    await assetPicker.getByRole('button', { name: /视频素材/ }).click()
    const draftPreview = page.getByRole('dialog').first().locator('video[src="/output/qa-existing-video.mp4"]')
    await draftPreview.waitFor()
    await page.getByRole('button', { name: '保存展示资料' }).click()
    await page.getByRole('button', { name: '重新打开案例编辑' }).click()
    const reopened = page.getByRole('dialog').first().locator('video[src="/output/qa-existing-video.mp4"]')
    await reopened.waitFor()
    await page.waitForFunction(() => Array.from(document.querySelectorAll('video[src="/output/qa-existing-video.mp4"]')).some(video => video.readyState >= 2 && video.paused))
    assert.ok(savedPresentation?.media?.some(item => item.type === 'video/mp4' && item.url === '/output/qa-existing-video.mp4'), 'video case is persisted through the editor save path')
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ ok: true, previews: firstFrameCount, savedAndReopened: true, autoplay: false, errors }))
  } finally {
    await context.close()
    await browser.close()
    await server.close()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
