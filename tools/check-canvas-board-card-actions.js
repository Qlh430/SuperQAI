"use strict";

/**
 * 画布管理卡片右上角的操作按钮（共享 / 移入回收站 / 回收站里的恢复）：
 *   - 用 lucide 图标而不是 "×" "↗" 这类看不清的文字符号
 *   - 按钮够大够清晰（尺寸 + 对比度），[hidden] 真的隐藏
 *   - 点共享出共享面板、点删除进回收站、点恢复回到列表
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
let playwright;
try { playwright = require(process.env.AI_OS_TEST_PLAYWRIGHT_MODULE || "playwright"); } catch {
  playwright = require(path.join(process.env.USERPROFILE || "", ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"));
}
const { chromium } = playwright;
const { createCanvasRepository } = require("../canvas-repository");

const ROOT = path.resolve(__dirname, "..");
const ARTIFACTS = path.join(ROOT, "artifacts", "canvas-board-actions");
const BOARDS = ["产品展示视频", "海报 brief", "画布 41"];

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function requestJson(port, pathname) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: "127.0.0.1", port, path: pathname }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, data: JSON.parse(body || "{}") }));
    }).once("error", reject);
  });
}

async function waitForServer(port) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      if ((await requestJson(port, "/api/models")).status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Canvas board actions server did not start.");
}

function parseColor(value) {
  const text = String(value || "");
  const parts = text.match(/[\d.]+/g)?.map(Number) || [];
  // color-mix() 在 Chromium 里会算成 color(srgb 0.37 0.42 0.5)，通道是 0–1 的小数，
  // 直接当成 0–255 用会把浅色误判成近黑，所以这里单独换算一次。
  if (text.startsWith("color(")) {
    const [, r = 0, g = 0, b = 0] = parts;
    return { r: r * 255, g: g * 255, b: b * 255, a: 1 };
  }
  return { r: parts[0] || 0, g: parts[1] || 0, b: parts[2] || 0, a: parts.length > 3 ? parts[3] : 1 };
}

function relativeLuminance(color) {
  const channel = (value) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return channel(color.r) * 0.2126 + channel(color.g) * 0.7152 + channel(color.b) * 0.0722;
}

function contrastRatio(foreground, background) {
  const light = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const dark = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (light + 0.05) / (dark + 0.05);
}

async function main() {
  // ---- 静态契约：不再用文字符号，按钮有独立样式，[hidden] 真的隐藏 ----
  const script = fs.readFileSync(path.join(ROOT, "script.js"), "utf8").replace(/\r\n/g, "\n");
  const styles = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8").replace(/\r\n/g, "\n");
  const renderList = script.slice(script.indexOf("function renderCanvasBoardList("));
  assert.match(renderList, /canvasBoardActionIcon\("Trash2"\)/, "删除按钮用 Trash2 图标");
  assert.match(renderList, /canvasBoardActionIcon\("Share2"\)/, "共享按钮用 Share2 图标");
  assert.match(renderList, /canvasBoardActionIcon\("RotateCcw"/, "恢复按钮也有图标");
  assert.doesNotMatch(renderList, /textContent = isTrash \? "删" : "×"/, "不再用 × 文字符号");
  assert.doesNotMatch(renderList, /share\.textContent = "↗"/, "不再用 ↗ 文字符号");
  assert.match(styles, /\.canvas-board-item \.canvas-board-action\[hidden\]/, "隐藏态要显式 display:none");
  assert.match(styles, /\.canvas-board-item \.canvas-board-action,/, "操作按钮有统一样式");
  assert.match(styles, /\.canvas-board-item i:not\(\.canvas-board-action\)/, "旧的字形样式不再套到新按钮上");
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(html, /styles\.css\?[^"]*boardactions=20260921-card-actions/);
  assert.match(html, /script\.js\?[^"]*boardactions=20260921-card-actions/);
  // 共享权限只留后端真的有判定点的两个值：可评论 / 可复制今天与只读完全等价。
  const permissionSelect = html.match(/<select name="permission">[\s\S]*?<\/select>/)?.[0] || "";
  const permissionValues = [...permissionSelect.matchAll(/value="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(permissionValues, ["read", "edit"], `共享权限下拉只该留只读和可编辑 — ${JSON.stringify(permissionValues)}`);
  assert.match(html, /account-management-ui\.js\?v=20260921-share-permission/);
  const accountUi = fs.readFileSync(path.join(ROOT, "account-management-ui.js"), "utf8").replace(/\r\n/g, "\n");
  assert.match(accountUi, /function normalizeSharePermission\(/, "要有历史权限值的归一化函数");
  assert.match(accountUi, /comment: "可评论"/, "历史 comment 权限在列表里要有中文文案");

  // ---- 真浏览器 ----
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "canvas-board-actions-"));
  const dbPath = path.join(directory, "canvas.db");
  const legacyFile = path.join(directory, "canvas-boards.json");
  fs.writeFileSync(legacyFile, "[]");
  const repository = createCanvasRepository({ dbPath, requestTimeoutMs: 10_000 });
  try {
    await repository.ready();
    for (const [index, title] of BOARDS.entries()) {
      const boardId = `board-actions-${index}`;
      await repository.createBoard({ id: boardId, title });
      await repository.applyOperations({
        boardId,
        baseRevision: 0,
        operations: [{
          operationId: `board-actions-node-${index}`,
          type: "node.upsert",
          entityId: `text-${index}`,
          after: { id: `text-${index}`, kind: "text", x: 0, y: 0, width: 260, height: 120, text: title },
        }],
      });
    }
  } finally {
    await repository.close();
  }

  const probe = http.createServer();
  const port = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  const diagnostics = [];
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      AI_OS_AUTH_DISABLED: "1",
      AI_OS_DATA_DIR: directory,
      CANVAS_DB_FILE: dbPath,
      CANVAS_LEGACY_FILE: legacyFile,
      CANVAS_BACKUP_DIR: path.join(directory, "backups"),
      CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false",
      CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.on("data", (chunk) => diagnostics.push(String(chunk)));
  child.stderr.on("data", (chunk) => diagnostics.push(String(chunk)));

  let browser = null;
  try {
    await waitForServer(port);
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector("#aiOsDesktop") && !document.querySelector("#aiOsDesktop").hidden, null, { timeout: 30_000 });
    await page.locator('[data-ai-app="canvas"]').evaluate((element) => element.click());
    await page.locator("#canvasLibraryScreen").waitFor({ state: "visible", timeout: 30_000 });
    fs.mkdirSync(ARTIFACTS, { recursive: true });

    const firstCard = page.locator(".canvas-board-item", { hasText: BOARDS[0] }).first();
    await firstCard.waitFor({ state: "visible", timeout: 15_000 });
    const share = firstCard.locator(".canvas-board-share");
    const remove = firstCard.locator(".canvas-board-delete");
    await share.waitFor({ state: "visible" });
    await remove.waitFor({ state: "visible" });

    // 图标而不是文字符号
    assert.equal((await share.locator("svg").count()) > 0, true, "共享按钮里应该是图标");
    assert.equal((await remove.locator("svg").count()) > 0, true, "删除按钮里应该是图标");
    assert.equal((await share.textContent()).trim(), "", "共享按钮不该再显示文字符号");
    assert.equal((await remove.textContent()).trim(), "", "删除按钮不该再显示文字符号");

    // 尺寸 + 对比度：图标要看得清（浅色 / 深色主题都要成立）
    const measure = async (label, locator) => {
      const box = await locator.boundingBox();
      assert.ok(box.width >= 24 && box.height >= 24, `${label}按钮不能小于 24px，实际 ${box.width}×${box.height}`);
      const style = await locator.evaluate((element) => {
        const computed = getComputedStyle(element);
        return { color: computed.color, background: computed.backgroundColor, opacity: computed.opacity };
      });
      assert.match(style.color, /^(rgb|color)\(/, `${label}按钮要解析出真实颜色，实际 ${style.color}`);
      const ratio = contrastRatio(parseColor(style.color), parseColor(style.background));
      assert.ok(ratio >= 3, `${label}按钮图标与底色对比度要 ≥ 3，实际 ${ratio.toFixed(2)}`);
      assert.ok(ratio <= 14, `${label}按钮对比度异常（${ratio.toFixed(2)}），说明颜色没解析对`);
    };
    for (const [label, locator] of [["共享", share], ["删除", remove]]) await measure(label, locator);
    await page.screenshot({ path: path.join(ARTIFACTS, "library-card-actions.png") });

    const originalTheme = await page.locator("html").getAttribute("data-theme");
    await page.locator("html").evaluate((element) => { element.dataset.theme = "dark"; });
    await page.waitForTimeout(350);
    for (const [label, locator] of [["深色主题共享", share], ["深色主题删除", remove]]) await measure(label, locator);
    await page.screenshot({ path: path.join(ARTIFACTS, "library-card-actions-dark.png") });
    await page.locator("html").evaluate((element, theme) => { element.dataset.theme = theme || "light"; }, originalTheme);
    await page.waitForTimeout(350);

    // 悬停有反馈
    const restingBackground = await remove.evaluate((element) => getComputedStyle(element).backgroundColor);
    await remove.hover();
    await page.waitForTimeout(250);
    const hoverBackground = await remove.evaluate((element) => getComputedStyle(element).backgroundColor);
    assert.notEqual(hoverBackground, restingBackground, "悬停要有可见反馈");
    await page.mouse.move(5, 5);

    // 点共享 → 共享面板
    await share.click();
    await page.locator("#aiOsShareDialog").waitFor({ state: "visible", timeout: 10_000 });
    // 标题只写“共享设置”，画布名字放到副标题里——不和 UUID 挤在同一行。
    assert.equal((await page.locator("#aiOsShareTitle").textContent()).trim(), "共享设置");
    const subject = await page.locator("#aiOsShareSubject").textContent();
    assert.match(subject, new RegExp(BOARDS[0]), `共享面板要指向这张画布，副标题实际是 ${JSON.stringify(subject)}`);
    // 弹窗不要再出现横向滚动条：以前那串 UUID 会把内容顶宽，后来是隐藏的单选框
    // （position:absolute + width:100%，样式写在了弹窗自己身上）把滚动宽度撑出去。
    const readShareOverflow = async () => page.locator("#aiOsShareDialog").evaluate((element) => {
      const box = element.getBoundingClientRect();
      return {
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        formScrollWidth: element.querySelector("form")?.scrollWidth || 0,
        formClientWidth: element.querySelector("form")?.clientWidth || 0,
        // 直接量每个元素盒子有没有伸出弹窗内容区，absolute 的隐藏控件也跑不掉。
        outside: [...element.querySelectorAll("*")]
          .map((node) => {
            const rect = node.getBoundingClientRect();
            return {
              name: `${node.tagName}${node.className ? `.${String(node.className).split(/\s+/)[0]}` : ""}${node.hidden ? "[hidden]" : ""}`,
              right: Math.round(rect.right - box.right),
              left: Math.round(box.left - rect.left),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            };
          })
          // display:none 的节点在 Chrome 里量出来是 (0,0) 的零面积盒子，别把它们当成越界。
          .filter((item) => (item.width > 0 || item.height > 0) && (item.right > 1 || item.left > 1))
          .map((item) => `${item.name}:${item.width}(左 ${item.left} / 右 ${item.right})`),
        wide: [...element.querySelectorAll("*")]
          .filter((node) => node.scrollWidth > node.clientWidth + 1 || node.getBoundingClientRect().width > element.clientWidth + 1)
          .map((node) => `${node.tagName}.${node.className || "-"}:${Math.round(node.getBoundingClientRect().width)}/${node.scrollWidth}`),
      };
    });
    const dialogOverflow = await readShareOverflow();
    assert.ok(
      dialogOverflow.scrollWidth <= dialogOverflow.clientWidth + 1,
      `共享面板自己不该有横向滚动条 — ${JSON.stringify(dialogOverflow)}`,
    );
    assert.ok(
      dialogOverflow.formScrollWidth <= dialogOverflow.formClientWidth + 1
        && dialogOverflow.wide.length === 0
        && dialogOverflow.outside.length === 0,
      `共享面板不该有横向溢出 — ${JSON.stringify(dialogOverflow)}`,
    );
    // 画布的可见范围是 4 项，正好两行两列：同一行的两项等宽，两列加间距铺满整行。
    const choiceLayout = await page.locator("#aiOsShareDialog .ai-os-choice-grid").evaluate((grid) => {
      const visible = [...grid.querySelectorAll(":scope > label")].filter((label) => !label.hidden);
      return {
        count: visible.length,
        widths: visible.map((label) => Math.round(label.getBoundingClientRect().width)),
        gridWidth: Math.round(grid.getBoundingClientRect().width),
      };
    });
    assert.equal(choiceLayout.count, 4, "画布共享应该是仅自己 / 所有账号 / 指定账号 / 口令访问 4 项");
    assert.equal(choiceLayout.widths[0], choiceLayout.widths[1], `同一行两项要等宽 — ${JSON.stringify(choiceLayout)}`);
    assert.equal(choiceLayout.widths[2], choiceLayout.widths[3], `第二行两项也要等宽 — ${JSON.stringify(choiceLayout)}`);
    // 两列 + 8px 间距要正好铺满整行，右边不留豁口。
    const pairWidth = choiceLayout.widths[0] + choiceLayout.widths[1] + 8;
    assert.ok(
      Math.abs(pairWidth - choiceLayout.gridWidth) <= 4,
      `两列加间距要铺满整行 — ${JSON.stringify({ ...choiceLayout, pairWidth })}`,
    );
    // 主按钮必须是强调色，不能被主题层的通用按钮规则盖成一块白板。
    const primary = await page.locator("#aiOsShareDialog footer button:last-child").evaluate((element) => {
      const computed = getComputedStyle(element);
      return { color: computed.color, background: computed.backgroundColor };
    });
    const primaryRatio = contrastRatio(parseColor(primary.color), parseColor(primary.background));
    assert.ok(primaryRatio >= 3, `主按钮文字与底色对比度要 ≥ 3，实际 ${primaryRatio.toFixed(2)}（${JSON.stringify(primary)}）`);
    assert.notEqual(primary.background, "rgba(0, 0, 0, 0)", "主按钮要有实心底色");
    // 选中的那项在深色主题上曾经是深蓝字压深底，两种主题都量一次。
    const readCheckedContrast = async () => page.locator("#aiOsShareDialog").evaluate((dialog) => {
      const span = dialog.querySelector(".ai-os-choice-grid input:checked + span");
      if (!span) return null;
      const parse = (value) => {
        const text = String(value || "").trim();
        const hex = text.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
        if (hex) {
          const digits = hex[1].length === 3 ? hex[1].split("").map((ch) => ch + ch).join("") : hex[1];
          return { r: parseInt(digits.slice(0, 2), 16), g: parseInt(digits.slice(2, 4), 16), b: parseInt(digits.slice(4, 6), 16), a: 1 };
        }
        const parts = text.match(/[\d.]+/g)?.map(Number) || [];
        return { r: parts[0] || 0, g: parts[1] || 0, b: parts[2] || 0, a: parts.length > 3 ? parts[3] : 1 };
      };
      const layer = (top, bottom) => ({
        r: top.a * top.r + (1 - top.a) * bottom.r,
        g: top.a * top.g + (1 - top.a) * bottom.g,
        b: top.a * top.b + (1 - top.a) * bottom.b,
        a: 1,
      });
      // 弹窗底色本身是半透明的玻璃色，一路合成到主题的“窗口不透明垫底色”上，
      // 不然量出来的深色主题底色会偏亮，结论正好反了。
      const solid = parse(getComputedStyle(document.documentElement).getPropertyValue("--os-window-solid")) || { r: 255, g: 255, b: 255, a: 1 };
      const dialogBg = layer(parse(getComputedStyle(dialog).backgroundColor), solid.a === 1 ? solid : { r: 255, g: 255, b: 255, a: 1 });
      const spanStyle = getComputedStyle(span);
      const background = layer(parse(spanStyle.backgroundColor), dialogBg);
      return {
        color: spanStyle.color,
        background: `rgb(${Math.round(background.r)}, ${Math.round(background.g)}, ${Math.round(background.b)})`,
      };
    });
    const lightChecked = await readCheckedContrast();
    if (lightChecked) {
      const ratio = contrastRatio(parseColor(lightChecked.color), parseColor(lightChecked.background));
      assert.ok(ratio >= 3, `选中项文字与底色对比度要 ≥ 3（浅色），实际 ${ratio.toFixed(2)}（${JSON.stringify(lightChecked)}）`);
    }
    // 单选框被压成 1px 隐藏控件之后，点标签仍然要能选中、能带出对应的附加字段
    // （并且多出来的字段不能又把弹窗顶出横向滚动条）。
    await page.locator('#aiOsShareDialog .ai-os-choice-grid label:has(input[value="all"]) span').click();
    await page.waitForTimeout(120);
    assert.ok(
      await page.locator('#aiOsShareDialog input[name="visibility"][value="all"]').first().isChecked(),
      "点「所有账号」要能选中",
    );
    assert.ok(
      await page.locator("#aiOsShareDialog [data-share-users]").first().isHidden(),
      "「所有账号」不该带出指定账号选择框",
    );
    await page.locator('#aiOsShareDialog .ai-os-choice-grid label:has(input[value="users"]) span').click();
    await page.waitForTimeout(120);
    assert.ok(
      await page.locator('#aiOsShareDialog input[name="visibility"][value="users"]').first().isChecked(),
      "点「指定账号」要能选中",
    );
    assert.ok(
      await page.locator("#aiOsShareDialog [data-share-users]").first().isVisible(),
      "「指定账号」要带出账号选择框",
    );
    const withExtraField = await readShareOverflow();
    assert.ok(
      withExtraField.scrollWidth <= withExtraField.clientWidth + 1 && withExtraField.outside.length === 0,
      `带出附加字段后也不该横向溢出 — ${JSON.stringify(withExtraField)}`,
    );
    // 共享权限只剩“只读 / 可编辑”：另外两个值后端没有判定点，留着会点了没反应。
    const permissionOptions = await page.locator('#aiOsShareDialog select[name="permission"] option').evaluateAll(
      (options) => options.map((option) => option.value),
    );
    assert.deepEqual(permissionOptions, ["read", "edit"], `共享权限只该留只读和可编辑 — ${JSON.stringify(permissionOptions)}`);
    // “指定账号”是有人进得来的，权限该在；“仅自己”时谁都被挡在门外，权限没有意义。
    assert.ok(
      await page.locator("#aiOsShareDialog [data-share-permission]").first().isVisible(),
      "「指定账号」时要显示共享权限",
    );
    // 留一张「所有账号 + 共享权限可见」的图，方便对着看权限这一行长什么样。
    await page.locator('#aiOsShareDialog .ai-os-choice-grid label:has(input[value="all"]) span').click();
    await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(ARTIFACTS, "share-dialog-permission.png") });
    // 口令访问：画布要能选（共享素材不行，资产接口没有这一档），选了要出「访问口令」输入框，
    // 而且这时权限行仍在（口令只是进门方式，进来之后是只读还是可编辑由权限决定）。
    assert.ok(
      await page.locator("#aiOsShareDialog [data-share-password-choice]").first().isVisible(),
      "画布共享要能选口令访问",
    );
    await page.locator('#aiOsShareDialog .ai-os-choice-grid label:has(input[value="password"]) span').click();
    await page.waitForTimeout(120);
    assert.ok(
      await page.locator("#aiOsShareDialog [data-share-password]").first().isVisible(),
      "选了口令访问要出现访问口令输入框",
    );
    assert.ok(
      await page.locator("#aiOsShareDialog [data-share-permission]").first().isVisible(),
      "口令访问时共享权限仍要可见",
    );
    await page.screenshot({ path: path.join(ARTIFACTS, "share-dialog-password.png") });
    await page.locator('#aiOsShareDialog .ai-os-choice-grid label:has(input[value="private"]) span').click();
    await page.waitForTimeout(120);
    assert.ok(
      await page.locator("#aiOsShareDialog [data-share-permission]").first().isHidden(),
      "「仅自己」时共享权限该收起来",
    );
    // 上面已经点回「仅自己」了，截图拍的就是默认状态，别把附加字段拍进去。
    await page.screenshot({ path: path.join(ARTIFACTS, "share-dialog-from-card.png") });
    const dialogTheme = await page.locator("html").getAttribute("data-theme");
    await page.locator("html").evaluate((element) => { element.dataset.theme = "dark"; });
    await page.waitForTimeout(300);
    const darkChecked = await readCheckedContrast();
    if (darkChecked) {
      const ratio = contrastRatio(parseColor(darkChecked.color), parseColor(darkChecked.background));
      assert.ok(ratio >= 3, `选中项文字与底色对比度要 ≥ 3（深色），实际 ${ratio.toFixed(2)}（${JSON.stringify(darkChecked)}）`);
    }
    await page.screenshot({ path: path.join(ARTIFACTS, "share-dialog-dark.png") });
    await page.locator("html").evaluate((element, theme) => { element.dataset.theme = theme || "light"; }, dialogTheme);
    await page.waitForTimeout(200);
    await page.locator('#aiOsShareDialog button[value="cancel"]').first().click();
    await page.locator("#aiOsShareDialog").waitFor({ state: "hidden", timeout: 10_000 });
    await page.waitForTimeout(300);

    // 点删除 → 进回收站；回收站里点恢复 → 回到列表
    await remove.click();
    await page.waitForTimeout(1_200);
    assert.equal(await page.locator(".canvas-board-item", { hasText: BOARDS[0] }).count(), 0, "移入回收站后列表里不该还有它");
    assert.equal((await page.locator("#canvasScopeTrashCount").textContent()).trim(), "1");
    await page.locator('[data-canvas-scope="trash"]').click();
    await page.waitForTimeout(800);
    const trashedCard = page.locator(".canvas-board-item", { hasText: BOARDS[0] }).first();
    await trashedCard.waitFor({ state: "visible", timeout: 10_000 });
    const restore = trashedCard.locator(".canvas-board-restore");
    await restore.waitFor({ state: "visible" });
    assert.equal((await restore.textContent()).trim(), "恢复", "回收站里要有恢复按钮");
    await page.screenshot({ path: path.join(ARTIFACTS, "trash-card-restore.png") });
    await restore.click();
    await page.waitForTimeout(1_200);
    assert.equal(await page.locator(".canvas-board-item", { hasText: BOARDS[0] }).count(), 0, "恢复后它不该还留在回收站里");
    assert.equal((await page.locator("#canvasScopeTrashCount").textContent()).trim(), "0", "恢复后回收站计数应该归零");
    await page.locator('[data-canvas-scope="all"]').click();
    await page.waitForTimeout(800);
    const restoredCard = page.locator(".canvas-board-item", { hasText: BOARDS[0] }).first();
    await restoredCard.waitFor({ state: "visible", timeout: 10_000 });
    assert.equal(await restoredCard.locator(".canvas-board-action").count(), 2, "恢复后的卡片要重新有共享和删除按钮");

    // 长名字 + 名字同步：先把资源名打回最初登记的“画布 <boardId>”（用户截图里那串 UUID），
    // 再把画布改名成一个很长的名字，看看资源名会不会跟上、弹窗会不会被顶出横向滚动条。
    const longTitle = "产品展示视频 c2f2fb3b-66f9-421f-84ad-8349ab1de733 交付版";
    const boardId = "board-actions-0";
    const syncResult = await page.evaluate(async ({ boardId, longTitle }) => {
      const list = await (await fetch("/api/resources")).json();
      const entry = (list.resources || []).find((item) => item.resource.refId === boardId);
      await fetch(`/api/resources/${encodeURIComponent(entry.resource.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: `画布 ${boardId}` }),
      });
      const boards = await (await fetch("/api/canvas/boards")).json();
      const target = (boards.boards || []).find((item) => item.id === boardId);
      const rename = await fetch(`/api/canvas/boards/${encodeURIComponent(boardId)}/operations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          baseRevision: Number(target?.revision || 0),
          operations: [{ operationId: "rename-long", type: "board.patch", entityId: boardId, before: { title: target?.title || "" }, after: { title: longTitle } }],
        }),
      });
      const after = await (await fetch("/api/resources")).json();
      const renamed = (after.resources || []).find((item) => item.resource.refId === boardId);
      // 再把资源名打回旧的“画布 <boardId>”，只靠列一次画布列表就该被纠正回来
      // （用户那台机器上的旧画布就是这么攒下来的）。
      await fetch(`/api/resources/${encodeURIComponent(entry.resource.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: `画布 ${boardId}` }),
      });
      await fetch("/api/canvas/boards?scope=all");
      const listed = await (await fetch("/api/resources")).json();
      const relisted = (listed.resources || []).find((item) => item.resource.refId === boardId);
      return {
        resourceId: entry.resource.id,
        renameStatus: rename.status,
        resourceTitle: renamed.resource.title,
        listSyncTitle: relisted.resource.title,
        staleTitle: entry.resource.title,
      };
    }, { boardId, longTitle });
    assert.equal(syncResult.renameStatus, 200, "改名要成功");
    assert.equal(syncResult.resourceTitle, longTitle, `画布改名后资源名要跟着走，实际是 ${JSON.stringify(syncResult.resourceTitle)}`);
    assert.equal(syncResult.listSyncTitle, longTitle, `列一次画布列表就该把旧资源名纠正回来，实际是 ${JSON.stringify(syncResult.listSyncTitle)}`);

    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelector("#aiOsDesktop") && !document.querySelector("#aiOsDesktop").hidden, null, { timeout: 30_000 });
    await page.locator('[data-ai-app="canvas"]').evaluate((element) => element.click());
    await page.locator("#canvasLibraryScreen").waitFor({ state: "visible", timeout: 30_000 });
    const longCard = page.locator(".canvas-board-item", { hasText: "产品展示视频" }).first();
    await longCard.waitFor({ state: "visible", timeout: 15_000 });
    await longCard.locator(".canvas-board-share").click();
    await page.locator("#aiOsShareDialog").waitFor({ state: "visible", timeout: 10_000 });
    assert.equal((await page.locator("#aiOsShareSubject").textContent()).trim(), longTitle, "副标题要显示画布的真实名字");
    const longOverflow = await page.locator("#aiOsShareDialog").evaluate((element) => {
      const form = element.querySelector("form");
      const subject = element.querySelector("#aiOsShareSubject");
      const choiceRects = [...element.querySelectorAll(".ai-os-choice-grid > label:not([hidden]) span")].map((span) => Math.round(span.getBoundingClientRect().width));
      return {
        formScrollWidth: form.scrollWidth,
        formClientWidth: form.clientWidth,
        subjectScrollWidth: subject.scrollWidth,
        subjectClientWidth: subject.clientWidth,
        choiceRects,
      };
    });
    assert.ok(longOverflow.subjectScrollWidth <= longOverflow.subjectClientWidth + 1, `长名字要换行，不该横向溢出 — ${JSON.stringify(longOverflow)}`);
    assert.ok(longOverflow.formScrollWidth <= longOverflow.formClientWidth + 1, `长名字不该把弹窗顶宽 — ${JSON.stringify(longOverflow)}`);
    await page.screenshot({ path: path.join(ARTIFACTS, "share-dialog-long-name.png") });
    await page.locator('#aiOsShareDialog button[value="cancel"]').first().click();
    await page.locator("#aiOsShareDialog").waitFor({ state: "hidden", timeout: 10_000 });

    // 老数据里可能还留着已经下架的 permission（comment / copy）：面板要能安全回显成只读，
    // 而不是把一个选不出任何 option 的空下拉摆给用户，也不是把 comment 这种英文丢出来。
    const legacyResourceId = await page.evaluate(async () => {
      const list = await (await fetch("/api/resources")).json();
      return (list.resources || []).find((item) => item.resource.refId === "board-actions-0")?.resource?.id || "";
    });
    assert.ok(legacyResourceId, "要拿得到画布资源 id");
    await page.evaluate(async ({ resourceId }) => {
      await fetch(`/api/resources/${encodeURIComponent(resourceId)}/shares`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ visibility: "all", permission: "comment", userIds: [] }),
      });
      await window.AiOsManagement.loadResources();
    }, { resourceId: legacyResourceId });
    await longCard.locator(".canvas-board-share").click();
    await page.locator("#aiOsShareDialog").waitFor({ state: "visible", timeout: 10_000 });
    assert.equal(
      await page.locator('#aiOsShareDialog select[name="permission"]').inputValue(),
      "read",
      "历史 comment 权限要回显成只读，不能空着",
    );
    assert.equal(
      await page.locator('#aiOsShareDialog input[name="visibility"][value="all"]').first().isChecked(),
      true,
      "历史共享是「所有账号」就该回显「所有账号」",
    );
    assert.ok(
      await page.locator("#aiOsShareDialog [data-share-permission]").first().isVisible(),
      "「所有账号」时要显示共享权限",
    );
    await page.locator('#aiOsShareDialog button[value="cancel"]').first().click();
    await page.locator("#aiOsShareDialog").waitFor({ state: "hidden", timeout: 10_000 });

    assert.deepEqual(pageErrors, [], "卡片操作不应该有前端报错");
    console.log("Canvas board card action checks passed.");
  } catch (error) {
    throw new Error(`${error.stack || error}\n${diagnostics.join("")}`);
  } finally {
    await browser?.close().catch(() => {});
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
