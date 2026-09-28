"use strict";

/**
 * 账户管理「显示名称」就地改名的真浏览器验证（隔离数据目录 + 真实 Chrome）：
 *   - 点"修改"出现输入框，Esc 取消不落库
 *   - 空白名称被拦下，留在编辑态，库里不动
 *   - 正常改名后详情页、左侧列表、接口三处一致
 *   - 改自己的名字：顶栏与用户菜单同步，且账户管理窗口不会被重建关掉
 */

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

let playwright;
try {
  playwright = require(process.env.AI_OS_TEST_PLAYWRIGHT_MODULE || "playwright");
} catch {
  playwright = require(path.join(
    process.env.USERPROFILE || "",
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  ));
}

const ROOT = path.resolve(__dirname, "..");
const ARTIFACTS = path.join(ROOT, "artifacts", "account-management");
const ADMIN = { username: "SuperQ", displayName: "超级管理员", password: "browser administrator password" };
const MEMBER = { username: "321", displayName: "321" };

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function stopChild(child) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.kill();
      resolve();
    }, 5_000);
    timeout.unref?.();
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

async function main() {
  const portProbe = http.createServer();
  const port = await listen(portProbe);
  await new Promise((resolve) => portProbe.close(resolve));
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-account-browser-"));
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: ROOT,
    stdio: "ignore",
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      AI_OS_DATA_DIR: dataDirectory,
      CANVAS_AGENT_USE_SETTINGS_PROVIDERS: "false",
      CANVAS_AGENT_ROUTE_HISTORY_ENABLED: "false",
    },
  });
  const origin = `http://127.0.0.1:${port}`;

  async function request(url, cookie = "", body) {
    const response = await fetch(new URL(url, origin), {
      method: body === undefined ? "GET" : "POST",
      headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: response.status, data, cookie: response.headers.get("set-cookie")?.split(";", 1)[0] || "" };
  }

  let browser = null;
  try {
    let ready = false;
    for (let index = 0; index < 400; index += 1) {
      try {
        if ((await request("/api/auth/session")).status === 401) {
          ready = true;
          break;
        }
      } catch {
        /* booting */
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(ready, "隔离的服务端要在 20 秒内起来");

    const bootstrap = await request("/api/auth/bootstrap", "", ADMIN);
    assert.equal(bootstrap.status, 201, "首次运行要先建超级管理员");
    const adminLogin = await request("/api/auth/login", "", { username: ADMIN.username, password: ADMIN.password });
    assert.equal(adminLogin.status, 200, "管理员要能登录");
    const adminCookie = adminLogin.cookie;
    const created = await request("/api/admin/users", adminCookie, { ...MEMBER, password: "member temporary password" });
    assert.equal(created.status, 201, "先准备一个普通账号");
    const memberId = created.data.user.id;
    const memberName = async () => (await request("/api/admin/users", adminCookie)).data.users
      .find((user) => user.id === memberId).displayName;

    browser = await playwright.chromium.launch({
      headless: true,
      executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      args: ["--host-resolver-rules=MAP ai-os-account.test 127.0.0.1", "--no-proxy-server"],
    });
    const browserOrigin = `http://ai-os-account.test:${port}`;
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addCookies([{
      name: adminCookie.split("=", 1)[0],
      value: adminCookie.slice(adminCookie.indexOf("=") + 1),
      url: browserOrigin,
    }]);
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    await page.goto(browserOrigin);
    await page.locator("#aiOsDesktop:not([hidden])").waitFor();

    await page.locator('[data-ai-app="accounts"]').click();
    await page.locator("#aiOsAccountsWindow:not([hidden])").waitFor();
    await page.waitForTimeout(600);
    fs.mkdirSync(ARTIFACTS, { recursive: true });

    await page.locator('.ai-os-account-item:has-text("321")').first().click();
    await page.locator('[data-account-action="edit-name"]').waitFor();
    assert.equal(await page.locator(".ai-os-account-name-form").count(), 0, "平时不显示名称输入框");

    const nameInput = page.locator('[data-account-name-form] input[name="displayName"]');
    await page.locator('[data-account-action="edit-name"]').click();
    await nameInput.waitFor();
    assert.equal(await nameInput.inputValue(), "321", "编辑框带出当前显示名称");
    await page.screenshot({ path: path.join(ARTIFACTS, "editing-name.png") });

    // 空白名称：拦下、留在编辑态、库里不动
    await nameInput.fill("   ");
    await page.locator('[data-account-action="save-name"]').click();
    await page.waitForTimeout(400);
    assert.match(await page.locator(".ai-os-toast").last().textContent(), /显示名称不能为空/);
    assert.equal(await nameInput.isVisible(), true, "校验失败要留在编辑态");
    assert.equal(await memberName(), "321", "校验失败不能落库");

    // Esc 取消
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    assert.equal(await page.locator(".ai-os-account-name-form").count(), 0, "Esc 要退出编辑态");
    assert.equal(await memberName(), "321");

    // 正常改名
    await page.locator('[data-account-action="edit-name"]').click();
    await page.locator('[data-account-name-form] input[name="displayName"]').fill("张三");
    await page.locator('[data-account-action="save-name"]').click();
    await page.waitForTimeout(900);
    assert.match(await page.locator("#aiOsAccountDetail").textContent(), /张三/, "详情页要显示新名字");
    assert.match(await page.locator("#aiOsAccountList").textContent(), /张三/, "左侧列表要显示新名字");
    assert.equal(await memberName(), "张三", "服务端要存下新名字");
    await page.screenshot({ path: path.join(ARTIFACTS, "renamed-member.png") });

    // 改自己的名字：顶栏同步、窗口不重建
    await page.locator('.ai-os-account-item:has-text("超级管理员")').first().click();
    await page.locator('[data-account-action="edit-name"]').click();
    await page.locator('[data-account-name-form] input[name="displayName"]').fill("超管A");
    await page.locator('[data-account-action="save-name"]').click();
    await page.waitForTimeout(900);
    assert.equal(await page.locator("#aiOsUserName").textContent(), "超管A", "顶栏账号名要跟着改");
    assert.equal(await page.locator("#aiOsPopoverName").textContent(), "超管A", "用户菜单里的名字要跟着改");
    assert.equal(await page.locator("#aiOsAccountsWindow").isVisible(), true, "改自己的名字不能把正在用的窗口关掉");
    await page.screenshot({ path: path.join(ARTIFACTS, "renamed-self-topbar.png") });

    assert.deepEqual(pageErrors, [], "改名流程不应该有前端报错");
    console.log("Account management browser checks passed.");
    await context.close();
  } finally {
    await browser?.close().catch(() => {});
    await stopChild(child);
    fs.rmSync(dataDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
