// 组框必须画在成员下面（组框是成员的地板）：组排在成员之后创建、上板顺序更高，
// 半透明的组框底色一旦画在成员之上，组里的图片就会整体变暗。
// 断言方式：组里那张纯色图渲染出来的像素必须还是它自己的颜色（被压暗就会明显偏色），
// 并且成员的显示层级必须高于组框；组框自己的底色仍然要画出来。
const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const SOURCE_URL = '/qa-assets/qa-group-source.png'
const SOLID_COLOR = [120, 180, 240]
const API_STUB = JSON.stringify({ authenticated: false, boards: [], projects: [], resources: [], records: [], models: [], providers: [], preferences: {}, settings: {} })
const SOURCE_FILES = [
  ['script.js', 'script-before-save-bridge.js', 'application/javascript'],
  ['flora-node-shell.js', 'flora-node-shell.js', 'application/javascript'],
  ['neon-canvas-surface.css', 'neon-canvas-surface.css', 'text/css'],
]

function pngChunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(zlib.crc32(body) >>> 0)
  return Buffer.concat([length, body, crc])
}

// 纯色不透明 PNG（8 位真彩、非隔行），用来看组框是否给图片叠了一层暗色。
function solidPng(width, height, [red, green, blue]) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.writeUInt8(8, 8)
  ihdr.writeUInt8(2, 9)
  const raw = Buffer.alloc(height * (1 + width * 3))
  for (let y = 0; y < height; y += 1) {
    const offset = y * (1 + width * 3)
    for (let x = 0; x < width; x += 1) {
      raw[offset + 1 + x * 3] = red
      raw[offset + 2 + x * 3] = green
      raw[offset + 3 + x * 3] = blue
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// 8 位非隔行 PNG 解码（灰度 / 灰度+alpha / 真彩 / 真彩+alpha）。
function decodePng(buffer) {
  assert.equal(buffer.readUInt32BE(0), 0x89504e47, '应是 PNG')
  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const parts = []
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data.readUInt8(8)
      colorType = data.readUInt8(9)
      assert.equal(data.readUInt8(12), 0, '不支持隔行 PNG')
    } else if (type === 'IDAT') {
      parts.push(Buffer.from(data))
    } else if (type === 'IEND') {
      break
    }
    offset += 12 + length
  }
  assert.equal(bitDepth, 8, `不支持的位深：${bitDepth}`)
  assert.ok([0, 2, 4, 6].includes(colorType), `不支持的颜色类型：${colorType}`)
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1
  const raw = zlib.inflateSync(Buffer.concat(parts))
  const stride = width * channels
  const pixels = Buffer.alloc(width * height * 4)
  let previous = Buffer.alloc(stride)
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride))
    for (let index = 0; index < stride; index += 1) {
      const left = index >= channels ? line[index - channels] : 0
      const up = previous[index]
      const upLeft = index >= channels ? previous[index - channels] : 0
      if (filter === 1) line[index] = (line[index] + left) & 0xff
      else if (filter === 2) line[index] = (line[index] + up) & 0xff
      else if (filter === 3) line[index] = (line[index] + ((left + up) >> 1)) & 0xff
      else if (filter === 4) {
        const estimate = left + up - upLeft
        const toLeft = Math.abs(estimate - left)
        const toUp = Math.abs(estimate - up)
        const toUpLeft = Math.abs(estimate - upLeft)
        const prediction = toLeft <= toUp && toLeft <= toUpLeft ? left : toUp <= toUpLeft ? up : upLeft
        line[index] = (line[index] + prediction) & 0xff
      } else if (filter !== 0) throw new Error(`未知 PNG 过滤器：${filter}`)
    }
    previous = line
    for (let x = 0; x < width; x += 1) {
      const from = x * channels
      const to = (y * width + x) * 4
      if (channels === 1) { pixels[to] = line[from]; pixels[to + 1] = line[from]; pixels[to + 2] = line[from]; pixels[to + 3] = 255 }
      else if (channels === 2) { pixels[to] = line[from]; pixels[to + 1] = line[from]; pixels[to + 2] = line[from]; pixels[to + 3] = line[from + 1] }
      else if (channels === 3) { pixels[to] = line[from]; pixels[to + 1] = line[from + 1]; pixels[to + 2] = line[from + 2]; pixels[to + 3] = 255 }
      else { pixels[to] = line[from]; pixels[to + 1] = line[from + 1]; pixels[to + 2] = line[from + 2]; pixels[to + 3] = line[from + 3] }
    }
  }
  return { width, height, pixels }
}

function averageColor(buffer) {
  const image = decodePng(buffer)
  const total = [0, 0, 0]
  const count = image.width * image.height
  for (let index = 0; index < count; index += 1) {
    total[0] += image.pixels[index * 4]
    total[1] += image.pixels[index * 4 + 1]
    total[2] += image.pixels[index * 4 + 2]
  }
  return total.map((value) => Math.round(value / count))
}

function centerClip(box, size = 24) {
  return {
    x: Math.round(box.x + box.width / 2 - size / 2),
    y: Math.round(box.y + box.height / 2 - size / 2),
    width: size,
    height: size,
  }
}

function channelDelta(a, b) {
  return Math.max(...a.map((value, index) => Math.abs(value - b[index])))
}

;(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: fs.existsSync(EDGE) ? EDGE : undefined })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: API_STUB }))
    await page.route(`**${SOURCE_URL}`, route => route.fulfill({ contentType: 'image/png', body: solidPng(48, 48, SOLID_COLOR) }))
    // GENERATOR_SOURCE 指向 neon-workbench/design-sources：改源码后、部署前先在这里验证。
    if (process.env.GENERATOR_SOURCE) {
      for (const [served, source, type] of SOURCE_FILES) {
        await page.route(`**/${served}*`, route => route.fulfill({
          contentType: type,
          body: fs.readFileSync(path.join(process.env.GENERATOR_SOURCE, source), 'utf8'),
        }))
      }
    }
    await page.goto(`${process.env.AI_OS_TEST_URL || 'http://127.0.0.1:3199'}/`, { waitUntil: 'domcontentloaded' })
    await page.evaluate(async ({ sourceUrl }) => {
      const modules = await AiOsModuleLoader.ensure(['canvas-runtime', 'canvas-node-generator'])
      if (modules?.ok === false) throw new Error(JSON.stringify(modules))
      await loadCanvasBoards()
      canvasState.activeBoardId = 'qa-group-stacking-board'
      const surface = document.createElement('div')
      surface.id = 'neonEngineSurface'
      surface.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#0c0c0b'
      document.body.append(surface)
      const view = document.querySelector('#canvasView')
      surface.append(view)
      view.style.flex = '1'
      view.style.minHeight = '0'
      view.style.width = '100%'
      view.hidden = false
      view.classList.add('active')
      document.querySelector('#canvasEditorScreen').hidden = false
      document.body.classList.add('canvas-surface-open')
      showCanvasEditor()
      const first = window.qaGroupFirst = addCanvasImage(sourceUrl, '组内 A.png', { x: 160, y: 120 })
      first.dataset.qaGroupNode = 'inside-a'
      const second = window.qaGroupSecond = addCanvasImage(sourceUrl, '组内 B.png', { x: 660, y: 120 })
      second.dataset.qaGroupNode = 'inside-b'
      canvasState.scale = 1
      canvasState.x = 60
      canvasState.y = 60
      applyCanvasTransformNow()
      clearCanvasSelection()
      addCanvasNodeToSelection(first)
      addCanvasNodeToSelection(second)
      const group = window.qaGroupNode = createCanvasGroupFromSelection()
      group.dataset.qaGroupNode = 'group'
      syncCanvasNodeStacking()
    }, { sourceUrl: SOURCE_URL })
    await page.waitForFunction(() => ['inside-a', 'inside-b']
      .every((name) => document.querySelector(`[data-qa-group-node="${name}"] img`)?.naturalWidth > 0), null, { timeout: 20000 })
    await page.waitForTimeout(600)

    const measure = async (label) => {
      const geometry = await page.evaluate(() => {
        const member = window.qaGroupFirst
        const group = window.qaGroupNode
        const imageBox = member.querySelector('img').getBoundingClientRect()
        const groupBox = group.getBoundingClientRect()
        return {
          imageBox: { x: imageBox.x, y: imageBox.y, width: imageBox.width, height: imageBox.height },
          memberZ: Number(getComputedStyle(member).zIndex),
          groupZ: Number(getComputedStyle(group).zIndex),
          memberSelected: member.classList.contains('is-selected'),
          groupSelected: group.classList.contains('is-selected'),
          memberIds: getCanvasGroupMemberIds(group),
          groupFrameBackground: getComputedStyle(group, '::before').backgroundColor,
          countRect: (() => {
            const count = group.querySelector('.canvas-group-count')
            const rect = count?.getBoundingClientRect()
            if (!rect) return null
            const style = getComputedStyle(count)
            return {
              x: rect.x, y: rect.y, width: rect.width, height: rect.height,
              position: style.position, top: style.top, left: style.left, right: style.right,
              parent: count.parentElement ? `${count.parentElement.tagName}.${String(count.parentElement.className).slice(0, 40)}` : null,
              groupTop: group.getBoundingClientRect().y,
              barChildren: Array.from(group.querySelector(':scope > .canvas-node-bar')?.children || []).map((child) => {
                const childRect = child.getBoundingClientRect()
                const childStyle = getComputedStyle(child)
                return `${child.tagName}.${String(child.className).slice(0, 30)}@${Math.round(childRect.x - group.getBoundingClientRect().x)}+${Math.round(childRect.y - group.getBoundingClientRect().y)} ${Math.round(childRect.width)}x${Math.round(childRect.height)} ${childStyle.display}`
              }),
            }
          })(),
          countCoveredByMember: (() => {
            const count = group.querySelector('.canvas-group-count')
            const rect = count?.getBoundingClientRect()
            if (!rect) return null
            return getCanvasGroupMemberIds(group).map((id) => getCanvasNode(id)).filter(Boolean).some((node) => {
              const box = node.getBoundingClientRect()
              return rect.x < box.right && rect.right > box.x && rect.y < box.bottom && rect.bottom > box.y
            })
          })(),
          memberTop: Math.min(...getCanvasGroupMemberIds(group)
            .map((id) => getCanvasNode(id))
            .filter(Boolean)
            .map((node) => node.getBoundingClientRect().y)),
          memberInsideGroup: imageBox.x > groupBox.x && imageBox.y > groupBox.y
            && imageBox.right < groupBox.right && imageBox.bottom < groupBox.bottom,
        }
      })
      const renderedColor = averageColor(await page.screenshot({ clip: centerClip(geometry.imageBox) }))
      const evidence = {
        label,
        sourceColor: SOLID_COLOR,
        renderedColor,
        delta: channelDelta(renderedColor, SOLID_COLOR),
        memberZ: geometry.memberZ,
        groupZ: geometry.groupZ,
        memberSelected: geometry.memberSelected,
        groupSelected: geometry.groupSelected,
        groupFrameBackground: geometry.groupFrameBackground,
        countRect: geometry.countRect,
        countCoveredByMember: geometry.countCoveredByMember,
        memberInsideGroup: geometry.memberInsideGroup,
        memberIds: geometry.memberIds,
      }
      assert.equal(geometry.memberInsideGroup, true, `成员应落在组框内部（用例前提）：${JSON.stringify(evidence)}`)
      assert.equal(geometry.memberIds.length, 2, `组应有两个成员：${JSON.stringify(geometry.memberIds)}`)
      assert.ok(geometry.groupFrameBackground !== 'rgba(0, 0, 0, 0)', `组框仍要画自己的底色：${geometry.groupFrameBackground}`)
      assert.ok(evidence.delta <= 3, `组里的图被压暗了（${label}）：源色 ${SOLID_COLOR} / 实际渲染 ${renderedColor}（通道差 ${evidence.delta}）`)
    assert.ok(geometry.memberZ > geometry.groupZ, `成员的显示层级必须高于组框：成员 ${geometry.memberZ} vs 组 ${geometry.groupZ}`)
    assert.equal(geometry.countCoveredByMember, false, `组的「N 张图」标签不能被成员图片盖住：${JSON.stringify(geometry.countRect)}`)
    assert.ok(geometry.countRect && geometry.countRect.y + geometry.countRect.height <= geometry.memberTop,
      `「N 张图」标签应留在标题栏里：标签底部 ${geometry.countRect ? Math.round(geometry.countRect.y + geometry.countRect.height) : 'null'} / 成员顶部 ${geometry.memberTop}`)
      return { geometry, evidence }
    }

    // 场景一：什么都没选中（用户截图里的正常浏览状态）。
    await page.evaluate(() => { clearCanvasSelection(); syncCanvasNodeStacking() })
    await page.waitForTimeout(300)
    const idle = await measure('未选中任何节点')

    // 场景二：组自己被选中（组会走到「选中节点提到最上层」这条路径），组框同样不能盖住成员。
    await page.evaluate(() => { selectCanvasNode(window.qaGroupNode) })
    await page.waitForTimeout(300)
    const groupSelected = await measure('组被选中')
    assert.equal(groupSelected.geometry.groupSelected, true, '点组框边距应选中组本身')

    const geometry = idle.geometry

    // 命中测试不受影响：点成员中心仍然选中成员本身，而不是组框。
    await page.mouse.click(geometry.imageBox.x + geometry.imageBox.width / 2, geometry.imageBox.y + geometry.imageBox.height / 2)
    await page.waitForTimeout(200)
    const selection = await page.evaluate(() => ({
      ids: Array.from(canvasState.selectedIds),
      memberId: window.qaGroupFirst.dataset.id,
      groupId: window.qaGroupNode.dataset.id,
    }))
    assert.ok(selection.ids.includes(selection.memberId), `点击组内图片应选中该图片：${JSON.stringify(selection)}`)
    assert.ok(!selection.ids.includes(selection.groupId), `点击组内图片不应选中组框：${JSON.stringify(selection)}`)
    assert.deepEqual(errors, [], `页面错误：${errors.join(' | ')}`)

    fs.mkdirSync(path.join(__dirname, 'acceptance'), { recursive: true })
    await page.screenshot({ path: path.join(__dirname, 'acceptance/group-frame-stacking-1440.png') })
    console.log(JSON.stringify({ ok: true, idle: idle.evidence, groupSelected: groupSelected.evidence, selection }, null, 2))
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error.message || error); process.exit(1) })
