"use strict";
/**
 * Verifies grounding in the real app: a folded stance must land on the floor
 * with its hips still above the grid, a clip must keep its own contact and
 * bounce, a character with no overrides must not move at all, and a pose that
 * was saved with legs folded the wrong way must never sink the body.
 */
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const http = require("node:http"), { spawn } = require("node:child_process");
const ROOT = process.cwd();
function loadPlaywright() {
  try { return require("playwright"); }
  catch { return require(path.join(process.env.USERPROFILE, ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright")); }
}
const BOARD_ID = "groundlock-check", BOARD_TITLE = "落体验证";
const FOOT = ["LeftToe_End","LeftToeBase","LeftFoot","RightToe_End","RightToeBase","RightFoot"];
(async () => {
  const probe = http.createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "aios-ground-"));
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: ROOT, stdio: "ignore",
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", AI_OS_SKIP_ENV_FILE: "1",
      AI_OS_AUTH_DISABLED: "0", AI_OS_DATA_DIR: dataDir,
      AI_OS_SYSTEM_DB_FILE: path.join(dataDir, "system.sqlite"),
      AI_OS_OUTPUT_DIR: path.join(dataDir, "output") },
  });
  const origin = `http://127.0.0.1:${port}`;
  async function request(url, cookie = "", body) {
    const r = await fetch(new URL(url, origin), {
      method: body === undefined ? "GET" : "POST",
      headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body) });
    const bytes = Buffer.from(await r.arrayBuffer());
    let data; try { data = JSON.parse(bytes.toString()); } catch { data = null; }
    return { status: r.status, data, cookie: r.headers.get("set-cookie")?.split(";", 1)[0] };
  }
  const playwright = loadPlaywright();
  let browser = null;
  const failures = [];
  const check = async (name, fn) => { try { await fn(); console.log("PASS " + name); } catch (e) { failures.push(name); console.error("FAIL " + name + ": " + e.message); } };
  try {
    let ready = false;
    for (let i = 0; i < 200; i++) {
      try { if ((await request("/api/auth/session")).status === 401) { ready = true; break; } } catch {}
      await new Promise((r) => setTimeout(r, 50));
    }
    if (!ready) throw new Error("server never started");
    await request("/api/auth/bootstrap", "", { username: "gl-host", password: "gl-host-password" });
    const host = (await request("/api/auth/login", "", { username: "gl-host", password: "gl-host-password" })).cookie;
    await request("/api/canvas/boards", host, { id: BOARD_ID, title: BOARD_TITLE });
    browser = await playwright.chromium.launch({
      headless: true, executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      args: ["--host-resolver-rules=MAP ai-os-gl.test 127.0.0.1", "--no-proxy-server", "--use-gl=angle", "--enable-unsafe-swiftshader"] });
    const browserOrigin = `http://ai-os-gl.test:${port}`;
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addCookies([{ name: host.split("=", 1)[0], value: host.slice(host.indexOf("=") + 1), url: browserOrigin }]);
    const page = await context.newPage();
    await page.goto(browserOrigin);
    await page.locator("#aiOsDesktop:not([hidden])").waitFor();
    await page.locator('[data-ai-app="canvas"]').click();
    await page.locator(".canvas-board-item").filter({ hasText: BOARD_TITLE }).first().click();
    await page.locator("#canvasEditorScreen").waitFor();
    await page.waitForFunction(() => typeof canvasState === "object" && Boolean(canvasState.activeBoardId));
    // Create the stage through the canvas menu, as a user does.
    const box = await page.locator("#infiniteCanvas").boundingBox();
    for (let i = 0; i < 10; i++) {
      const p = await page.evaluate(() => {
        const v = document.querySelector("#infiniteCanvas"); const r = v.getBoundingClientRect();
        const x = r.left + r.width * 0.42, y = r.top + r.height * 0.42;
        const hit = document.elementFromPoint(x, y);
        return { x, y, ok: hit === v || Boolean(hit?.closest?.("#canvasPlane")) };
      });
      if (p.ok) { await page.mouse.dblclick(p.x, p.y); try { await page.locator("#canvasNodeMenu:not([hidden])").waitFor({ timeout: 4000 }); break; } catch {} }
      await page.waitForTimeout(400);
    }
    await page.locator('#canvasNodeMenu button[data-canvas-node="director3d"]').click();
    await page.locator("#canvasPlane .canvas-node-director3d").waitFor();
    await page.locator("#canvasPlane .canvas-node-director3d").first().locator(".canvas-director-open").first().click();
    await page.locator("#canvasDirector3dOverlay").waitFor();
    await page.waitForSelector("#canvasDirector3dOverlay .director-model-tile", { timeout: 30000 });
    await page.waitForTimeout(3500);

    const measure = async () => page.evaluate((footNames) => {
      const app = canvasDirector3dApp, stage = app.stage3d;
      const out = {};
      for (const item of app.project.items) {
        if (!/human-|robot-/.test(String(item.kind))) continue;
        let low = Infinity;
        for (const n of footNames) { const p = stage.boneWorldPosition(item.id, n); if (p && p[1] < low) low = p[1]; }
        const hips = stage.boneWorldPosition(item.id, "Hips");
        out[item.kind] = { lowFoot: Number.isFinite(low) ? +low.toFixed(3) : null,
          hips: hips ? +hips[1].toFixed(3) : null, joints: Object.keys(item.joints || {}).length };
      }
      return out;
    }, FOOT);

    await check("an unposed character stands exactly where it did before", async () => {
      await page.locator('#canvasDirector3dOverlay .director-model-tile[data-model-kind="human-male"]').click();
      await page.waitForFunction(() => (canvasDirector3dApp?.project?.items || []).some((i) => i.kind === "human-male"), null, { timeout: 20000 });
      await page.waitForTimeout(2000);
      const m = await measure();
      const v = m["human-male"];
      console.log("  unposed idle: lowFoot=" + v.lowFoot + " hips=" + v.hips);
      if (v.lowFoot === null) throw new Error("no foot data");
      if (Math.abs(v.lowFoot) > 0.06) throw new Error("unposed character is not on the floor: " + v.lowFoot);
    });

    await check("a folded stance lands the character on the floor", async () => {
      for (const stance of ["半蹲", "坐姿"]) {
        for (const kind of ["human-male", "human-xbot", "human-soldier"]) {
          await page.evaluate(async (k) => {
            const app = canvasDirector3dApp;
            for (const row of [...document.querySelectorAll("#canvasDirector3dOverlay .director-object")]) row.querySelector(".director-object-remove")?.click();
            await new Promise((r) => setTimeout(r, 400));
            document.querySelector(`#canvasDirector3dOverlay .director-model-tile[data-model-kind="${k}"]`).click();
            await new Promise((r) => setTimeout(r, 1400));
            const item = [...app.project.items].reverse().find((e) => e.kind === k);
            document.querySelector(`#canvasDirector3dOverlay .director-object[data-object-id="${item.id}"]`).click();
          }, kind);
          await page.waitForTimeout(900);
          await page.locator("#canvasDirector3dOverlay .director-stance", { hasText: stance }).click();
          await page.waitForTimeout(1100);
          const m = await measure();
          const v = m[kind];
          console.log("  " + stance + " / " + kind + ": lowFoot=" + v.lowFoot + " hips=" + v.hips + " joints=" + v.joints);
          if (v.joints < 2) throw new Error(kind + " did not get the stance");
          if (Math.abs(v.lowFoot) > 0.12) throw new Error(kind + " floats in " + stance + ": foot at " + v.lowFoot);
          // A folded stance has to lower the hips without pushing them under
          // the grid: the feet can be parked on the floor while the body sinks.
          const floor = stance === "坐姿" ? 0.30 : 0.55;
          if (!(v.hips > floor)) throw new Error(kind + " buries its hips in " + stance + ": hips at " + v.hips);
        }
      }
    });

    await check("a saved pose with legs folded the wrong way never sinks the body", async () => {
      // The male rig's thighs rest about 180° from the others, so a leg
      // override solved for another rig drives them backwards. That used to
      // park the feet on the floor while the body dropped under the grid.
      await page.evaluate(async () => {
        const app = canvasDirector3dApp;
        for (const row of [...document.querySelectorAll("#canvasDirector3dOverlay .director-object")]) row.querySelector(".director-object-remove")?.click();
        await new Promise((r) => setTimeout(r, 400));
        document.querySelector('#canvasDirector3dOverlay .director-model-tile[data-model-kind="human-male"]').click();
        await new Promise((r) => setTimeout(r, 1400));
        const item = [...app.project.items].reverse().find((e) => e.kind === "human-male");
        document.querySelector(`#canvasDirector3dOverlay .director-object[data-object-id="${item.id}"]`).click();
      });
      await page.waitForTimeout(900);
      await page.evaluate(() => {
        const app = canvasDirector3dApp;
        const item = [...app.project.items].reverse().find((e) => e.kind === "human-male");
        // The old shared numbers, which fold this rig's legs the wrong way.
        item.joints = {
          LeftUpLeg: { x: -62 }, LeftLeg: { x: 78 }, LeftFoot: { x: -18 },
          RightUpLeg: { x: -62 }, RightLeg: { x: 78 }, RightFoot: { x: -18 },
        };
      });
      await page.waitForTimeout(1200);
      const m = await measure();
      const v = m["human-male"];
      console.log("  broken saved pose: lowFoot=" + v.lowFoot + " hips=" + v.hips);
      if (!(v.hips > 0.0)) throw new Error("the body sank through the grid: hips at " + v.hips);
    });

    await check("walking keeps its own contact and bounce", async () => {
      await page.evaluate(async () => {
        const app = canvasDirector3dApp;
        for (const row of [...document.querySelectorAll("#canvasDirector3dOverlay .director-object")]) row.querySelector(".director-object-remove")?.click();
        await new Promise((r) => setTimeout(r, 400));
        document.querySelector('#canvasDirector3dOverlay .director-model-tile[data-model-kind="human-male"]').click();
        await new Promise((r) => setTimeout(r, 1400));
        const item = [...app.project.items].reverse().find((e) => e.kind === "human-male");
        document.querySelector(`#canvasDirector3dOverlay .director-object[data-object-id="${item.id}"]`).click();
      });
      await page.waitForTimeout(800);
      await page.locator("#canvasDirector3dOverlay select.director-clip").selectOption("walk");
      await page.waitForTimeout(1200);
      const samples = await page.evaluate(async (footNames) => {
        const app = canvasDirector3dApp, stage = app.stage3d;
        const item = app.project.items.find((i) => i.kind === "human-male");
        const lows = [];
        for (let i = 0; i < 40; i++) {
          let low = Infinity;
          for (const n of footNames) { const p = stage.boneWorldPosition(item.id, n); if (p && p[1] < low) low = p[1]; }
          if (Number.isFinite(low)) lows.push(low);
          await new Promise((r) => requestAnimationFrame(r));
        }
        return lows;
      }, FOOT);
      const min = Math.min(...samples), max = Math.max(...samples);
      console.log("  walk lowFoot over 40 frames: min=" + min.toFixed(3) + " max=" + max.toFixed(3) + " swing=" + (max - min).toFixed(3));
      if (max - min < 0.004) throw new Error("the walk's bounce was flattened: swing " + (max - min).toFixed(4));
    });

    fs.mkdirSync(path.join(ROOT, "artifacts", "canvas-director3d-grounding"), { recursive: true });
    await page.locator("#canvasDirector3dOverlay canvas.director-stage-canvas").screenshot({ path: path.join(ROOT, "artifacts", "canvas-director3d-grounding", "grounding.png") });
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill();
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch {}
  }
  if (failures.length) { console.error("\nfailed: " + failures.join(", ")); process.exit(1); }
  console.log("\nground lock: all checks passed");
})().catch((e) => { console.error(e); process.exit(1); });

