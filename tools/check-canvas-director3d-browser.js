"use strict";

/**
 * 3D director stage browser checks.
 *
 * The feature ships a full screen stage inside the canvas, so the only honest
 * way to verify it is to drive a real Chrome: open a board, create the node
 * from the canvas menu, build a scene with a character and a camera, render the
 * camera preview, export a frame back onto the canvas, save the scene, and then
 * reload the page to confirm the project and its preview survived.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const BOARD_ID = "director3d-browser-board";
const BOARD_TITLE = "3D 导演台验证";

function loadPlaywright() {
  try {
    return require("playwright");
  } catch {
    return require(path.join(process.env.USERPROFILE, ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"));
  }
}

async function run() {
  const probe = http.createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "aios-director3d-browser-"));
  const child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "server.js"], {
    cwd: ROOT,
    stdio: "ignore",
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      AI_OS_SKIP_ENV_FILE: "1",
      AI_OS_AUTH_DISABLED: "0",
      AI_OS_DATA_DIR: dataDir,
      AI_OS_SYSTEM_DB_FILE: path.join(dataDir, "system.sqlite"),
      AI_OS_OUTPUT_DIR: path.join(dataDir, "output"),
      OUTBOUND_NO_PROXY: "127.0.0.1,localhost",
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
    const bytes = Buffer.from(await response.arrayBuffer());
    let data;
    try {
      data = JSON.parse(bytes.toString());
    } catch {
      data = null;
    }
    return { status: response.status, data, cookie: response.headers.get("set-cookie")?.split(";", 1)[0] };
  }

  const failures = [];
  async function check(name, fn) {
    try {
      await fn();
      console.log(`PASS ${name}`);
    } catch (error) {
      failures.push(name);
      console.error(`FAIL ${name}: ${error.message}`);
    }
  }

  let browser = null;
  try {
    let ready = false;
    for (let index = 0; index < 200; index += 1) {
      try {
        if ((await request("/api/auth/session")).status === 401) {
          ready = true;
          break;
        }
      } catch {
        /* the server is still starting */
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(ready, "isolated server starts");
    assert.equal((await request("/api/auth/bootstrap", "", { username: "director-host", password: "director-host-password" })).status, 201);
    const host = (await request("/api/auth/login", "", { username: "director-host", password: "director-host-password" })).cookie;
    assert.ok(host, "the host session is available");
    assert.equal((await request("/api/canvas/boards", host, { id: BOARD_ID, title: BOARD_TITLE })).status, 201);

    const playwright = loadPlaywright();
    browser = await playwright.chromium.launch({
      headless: true,
      executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      args: ["--host-resolver-rules=MAP ai-os-director3d.test 127.0.0.1", "--no-proxy-server"],
    });
    const browserOrigin = `http://ai-os-director3d.test:${port}`;
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addCookies([{ name: host.split("=", 1)[0], value: host.slice(host.indexOf("=") + 1), url: browserOrigin }]);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400 && /\/api\/canvas|\/api\/image-thumbnails|\/output\//.test(response.url())) {
        errors.push(`${response.status()} ${new URL(response.url()).pathname}`);
      }
    });

    await page.goto(browserOrigin);
    await page.locator("#aiOsDesktop:not([hidden])").waitFor();
    await page.locator('[data-ai-app="canvas"]').click();
    await page.locator(".canvas-board-item").filter({ hasText: BOARD_TITLE }).first().click();
    await page.locator("#canvasEditorScreen").waitFor();
    await page.waitForFunction(() => Boolean(document.querySelector("#infiniteCanvas") && document.querySelector("#canvasPlane")));
    await page.waitForFunction(() => typeof canvasState === "object" && Boolean(canvasState.activeBoardId));

    /**
     * Double-clicks empty canvas space and returns the node menu. The editor
     * fades in over the board list, so the point is hit-tested first and the
     * gesture is retried until the canvas actually owns it.
     */
    async function openNodeMenu() {
      const box = await page.locator("#infiniteCanvas").boundingBox();
      assert.ok(box, "the canvas viewport has a layout box");
      let lastHit = null;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const probe = await page.evaluate(() => {
          const viewport = document.querySelector("#infiniteCanvas");
          const rect = viewport.getBoundingClientRect();
          const x = rect.left + rect.width * 0.42;
          const y = rect.top + rect.height * 0.42;
          const hit = document.elementFromPoint(x, y);
          return {
            x,
            y,
            hit: hit ? `${hit.tagName.toLowerCase()}.${String(hit.className || "").split(" ").filter(Boolean).join(".")}` : "none",
            ready: hit === viewport || Boolean(hit?.closest?.("#canvasPlane")) || Boolean(hit?.closest?.("#infiniteCanvas")),
          };
        });
        lastHit = probe.hit;
        if (probe.ready) {
          await page.mouse.dblclick(probe.x, probe.y);
          try {
            await page.locator("#canvasNodeMenu:not([hidden])").waitFor({ timeout: 4000 });
            return;
          } catch {
            /* the gesture landed before the canvas owned the point */
          }
        }
        await page.waitForTimeout(400);
      }
      assert.fail(`the canvas node menu never opened; last hit target was ${lastHit}`);
    }

    await check("double-clicking blank canvas still opens the node menu with the 3D stage entry", async () => {
      await openNodeMenu();
      const entry = page.locator('#canvasNodeMenu button[data-canvas-node="director3d"]');
      assert.equal(await entry.count(), 1, "the menu exposes exactly one 3D stage entry");
      assert.match((await entry.innerText()).trim(), /3D 导演台/);
    });

    await check("right-clicking blank canvas still opens the canvas action menu", async () => {
      await page.keyboard.press("Escape");
      const box = await page.locator("#infiniteCanvas").boundingBox();
      await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.7, { button: "right" });
      await page.locator("#canvasContextMenu:not([hidden])").waitFor();
      assert.equal(await page.locator('#canvasContextMenu [data-canvas-action="upload"]').count(), 1);
      assert.equal(await page.locator('#canvasContextMenu [data-canvas-action="add-node"]').count(), 1);
      await page.mouse.click(box.x + box.width * 0.18, box.y + box.height * 0.85);
      await page.waitForFunction(() => Boolean(document.querySelector("#canvasContextMenu")?.hidden));
    });

    await check("the menu entry creates a 3D stage card in the empty state", async () => {
      await openNodeMenu();
      await page.locator('#canvasNodeMenu button[data-canvas-node="director3d"]').click();
      await page.locator("#canvasPlane .canvas-node-director3d").waitFor();
      const card = page.locator("#canvasPlane .canvas-node-director3d").first();
      assert.equal(await card.locator(".canvas-director-empty").count(), 1);
      assert.equal((await card.locator(".canvas-director-open").first().innerText()).trim(), "打开导演台");
      assert.equal(await card.locator(".canvas-director-cover-img").count(), 0, "a fresh scene has no preview yet");
    });

    await check("opening the card shows the stage with the full preset catalog", async () => {
      await page.locator("#canvasPlane .canvas-node-director3d").first().locator(".canvas-director-open").first().click();
      const overlay = page.locator("#canvasDirector3dOverlay");
      await overlay.waitFor();
      assert.equal(await overlay.locator(".director-preview-canvas").count(), 1);
      assert.equal(await overlay.locator(".director-stage-canvas").count(), 1);
      assert.equal(await overlay.locator(".director-object-empty").count(), 1, "the stage starts empty");
      const counts = await page.evaluate(() => ({
        shots: document.querySelectorAll("#canvasDirector3dOverlay select.director-shot option").length,
        motions: document.querySelectorAll("#canvasDirector3dOverlay select.director-motion option").length,
        aspects: document.querySelectorAll("#canvasDirector3dOverlay select.director-aspect option").length,
        adds: document.querySelectorAll("#canvasDirector3dOverlay .director-add[data-add-kind]").length,
        models: document.querySelectorAll("#canvasDirector3dOverlay .director-model-tile[data-model-kind]").length,
        joints: document.querySelectorAll("#canvasDirector3dOverlay .director-add[data-add-kind]").length,
      }));
      // The primitives stay on plain buttons; the rigged catalogue moved to its
      // own thumbnail tiles, so the two counts are asserted separately.
      assert.deepEqual(counts, { shots: 15, motions: 9, aspects: 7, adds: 4, models: 8, joints: 4 });
    });

    await check("adding a character and a camera fills the object list", async () => {
      await page.locator('#canvasDirector3dOverlay .director-model-tile[data-model-kind="human-male"]').click();
      await page.locator('#canvasDirector3dOverlay .director-add[data-add-kind="camera"]').click();
      await page.waitForFunction(() => document.querySelectorAll("#canvasDirector3dOverlay .director-object").length === 2);
      const rows = await page.evaluate(() =>
        [...document.querySelectorAll("#canvasDirector3dOverlay .director-object")].map((row) => row.textContent.trim()),
      );
      assert.equal(rows.length, 2, "the character and the camera are both listed");
      assert.ok(rows.some((row) => /机位/.test(row)), `the camera row is labelled; rows: ${JSON.stringify(rows)}`);
    });

    await check("the character inspector exposes clips, stances and joints", async () => {
      // The whole point of the rigged catalogue is that a user can pick a clip
      // and grab a bone, so the panel has to actually offer them for the model
      // that was just added.
      await page.locator('#canvasDirector3dOverlay .director-object').first().click();
      const panel = await page.evaluate(() => {
        const overlay = document.querySelector("#canvasDirector3dOverlay");
        return {
          clips: overlay.querySelectorAll("select.director-clip option").length,
          stances: overlay.querySelectorAll(".director-stance").length,
          joints: overlay.querySelectorAll(".director-joint-row").length,
          groups: overlay.querySelectorAll(".director-joint-group").length,
        };
      });
      assert.ok(panel.clips >= 5, `the clip dropdown lists the model clips; got ${panel.clips}`);
      assert.equal(panel.stances, 8, "every stance preset is offered");
      assert.equal(panel.joints, 20, "every mapped joint gets a slider");
      assert.ok(panel.groups >= 6, `joints are grouped by body part; got ${panel.groups} groups`);
    });

    await check("a stance preset writes joint overrides onto the project", async () => {
      await page.locator('#canvasDirector3dOverlay .director-stance', { hasText: "叉腰" }).click();
      const posed = await page.evaluate(() => {
        const project = canvasDirector3dApp?.project;
        const subject = (project?.items || []).find((item) => item.kind === "human-male");
        return {
          bones: Object.keys(subject?.joints || {}).length,
          leftArm: subject?.joints?.LeftArm || null,
        };
      });
      assert.ok(posed.bones >= 5, `the preset posed several bones; got ${posed.bones}`);
      assert.ok(posed.leftArm && posed.leftArm.z, `the left arm was posed; got ${JSON.stringify(posed.leftArm)}`);
    });

    await check("the hands-on-hips pose reaches each rig's own numbers and lands on the hip", async () => {
      // The preset's angles are local to the bone, so a second rig needs its own
      // table: the male numbers put the female rig's hand in the air. Both arms
      // are checked against real bone positions, because "the slider moved" is
      // not the same as "the hand is on the hip".
      for (const kind of ["human-xbot", "human-female", "human-soldier", "human-male"]) {
        await page.locator(`#canvasDirector3dOverlay .director-model-tile[data-model-kind="${kind}"]`).click();
        await page.waitForFunction(
          (want) => (canvasDirector3dApp?.project?.items || []).some((item) => item.kind === want),
          kind,
          { timeout: 20000 },
        );
        const subjectId = await page.evaluate((want) => {
          const item = [...canvasDirector3dApp.project.items].reverse().find((entry) => entry.kind === want);
          document.querySelector(`#canvasDirector3dOverlay .director-object[data-object-id="${item.id}"]`).click();
          return item.id;
        }, kind);
        await page.waitForTimeout(1800);
        await page.locator('#canvasDirector3dOverlay .director-stance', { hasText: "叉腰" }).click();
        await page.waitForTimeout(900);
        const posed = await page.evaluate((id) => {
          const app = canvasDirector3dApp;
          const stage = app.stage3d;
          const item = app.project.items.find((entry) => entry.id === id);
          const hips = stage.boneWorldPosition(id, "Hips");
          const read = (bone) => {
            const point = stage.boneWorldPosition(id, bone);
            return point ? [point[0] - hips[0], point[1] - hips[1], point[2] - hips[2]] : null;
          };
          return {
            joints: item.joints,
            leftHand: read("LeftHand"), leftElbow: read("LeftForeArm"),
            rightHand: read("RightHand"), rightElbow: read("RightForeArm"),
          };
        }, subjectId);
        assert.ok(posed.joints?.LeftArm, `${kind} 的叉腰写出了左臂角度`);
        for (const side of ["left", "right"]) {
          const hand = posed[`${side}Hand`];
          const elbow = posed[`${side}Elbow`];
          assert.ok(hand && elbow, `${kind} 的 ${side} 手臂骨骼可读`);
          assert.ok(
            Math.abs(hand[1] - 0.055) < 0.1,
            `${kind} 的 ${side} 手落在髋部高度；实际 ${JSON.stringify(hand)}`,
          );
          assert.ok(
            Math.abs(hand[0]) > 0.06 && Math.abs(hand[0]) < 0.32,
            `${kind} 的 ${side} 手落在髋侧而不是举在身前；实际 ${JSON.stringify(hand)}`,
          );
          assert.ok(
            Math.abs(elbow[0]) > Math.abs(hand[0]),
            `${kind} 的 ${side} 肘部外翻；手 ${JSON.stringify(hand)} 肘 ${JSON.stringify(elbow)}`,
          );
          assert.ok(elbow[1] > hand[1], `${kind} 的 ${side} 肘部高于手腕`);
        }
        // Clear the stage again so the next rig is the only figure on it.
        await page.evaluate((id) => {
          document.querySelector(`#canvasDirector3dOverlay .director-object[data-object-id="${id}"] .director-object-remove`)?.click();
        }, subjectId);
        await page.waitForTimeout(500);
      }
      // Every rig that was added for this check has been removed again, so the
      // project is back to the original character and camera. The selection has
      // to be handed back to that character: the checks that follow read the
      // inspector, and a removed selection leaves the panel empty.
      const restored = await page.evaluate(async () => {
        const app = canvasDirector3dApp;
        const subject = app.project.items.find((item) => item.kind === "human-male");
        if (!subject) return { error: "the original character is gone" };
        document.querySelector(`#canvasDirector3dOverlay .director-object[data-object-id="${subject.id}"]`).click();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return {
          selected: app.selectedId,
          id: subject.id,
          kinds: app.project.items.map((item) => item.kind),
        };
      });
      assert.ok(!restored.error, String(restored.error || ""));
      assert.equal(restored.selected, restored.id, "the original character is selected again");
      assert.deepEqual(
        restored.kinds.filter((kind) => kind === "human-male").length,
        1,
        `exactly one character is left on the stage; got ${JSON.stringify(restored.kinds)}`,
      );
    });

    await check("changing the clip is stored on the project", async () => {
      await page.locator("#canvasDirector3dOverlay select.director-clip").selectOption("run");
      const clip = await page.evaluate(() => {
        const project = canvasDirector3dApp?.project;
        const subject = (project?.items || []).find((item) => item.kind === "human-male");
        return subject?.clip || "";
      });
      assert.equal(clip, "run", `the chosen clip is kept; got ${clip}`);
      await page.locator("#canvasDirector3dOverlay select.director-clip").selectOption("idle");
    });

    await check("selecting an object shows the transform handles without leaving select mode", async () => {
      // The arrows are what tells an operator the object is grabbable. They used
      // to be attached only after switching into a transform mode, so a plain
      // click looked like it had done nothing.
      await page.locator('#canvasDirector3dOverlay [data-mode="select"]').click();
      const bound = await page.evaluate(async () => {
        const app = typeof canvasDirector3dApp !== "undefined" ? canvasDirector3dApp : null;
        const row = document.querySelector("#canvasDirector3dOverlay .director-object[data-object-id]");
        if (!row || !app) return { error: "no object row" };
        row.click();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const stage = app.stage3d;
        return {
          selectedId: app.selectedId,
          hitched: stage && typeof stage.gizmoAttachedTo === "function" ? stage.gizmoAttachedTo() : "",
          mode: document.querySelector("#canvasDirector3dOverlay [data-mode].is-active")?.dataset.mode || "",
        };
      });
      assert.ok(!bound.error, String(bound.error || ""));
      assert.equal(bound.mode, "select", "the check runs in the default select mode");
      assert.ok(bound.selectedId, "an object is selected");
      assert.equal(bound.hitched, bound.selectedId, "the handles are bound to the selection");
    });

    await check("selecting the camera shows its handles too, without a scale handle", async () => {
      // A camera used to be excluded from the transform handles, because the two
      // layers disagreed about what a rotation triple meant: a dragged camera
      // would have ended up aimed somewhere the pane did not show. The stage now
      // hands the marker orientation across as a matrix in both directions, so
      // an operator can aim the shot with the same ring the other objects use.
      await page.locator("#canvasDirector3dOverlay .director-object:has-text('机位')").first().click();
      const aimed = await page.evaluate(async () => {
        const app = typeof canvasDirector3dApp !== "undefined" ? canvasDirector3dApp : null;
        const stage = app?.stage3d;
        const camera = app?.project?.items?.find((item) => item.kind === "camera");
        if (!app || !stage || !camera) return { error: "no camera on the stage" };
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        document.querySelector('#canvasDirector3dOverlay [data-mode="scale"]').click();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const labels = [...document.querySelectorAll("#canvasDirector3dOverlay .director-field-label")].map((node) => node.textContent.trim());
        return {
          id: camera.id,
          hitched: stage.gizmoAttachedTo(),
          labels,
        };
      });
      assert.ok(!aimed.error, String(aimed.error || ""));
      assert.equal(aimed.hitched, aimed.id, "the camera handles are bound even in scale mode");
      assert.ok(!aimed.labels.includes("缩放"), `the camera panel offers no scale; saw ${JSON.stringify(aimed.labels)}`);
      assert.ok(
        aimed.labels.includes("俯仰") && aimed.labels.includes("倾斜"),
        `the camera panel exposes all three aim angles; saw ${JSON.stringify(aimed.labels)}`,
      );
      // A drag on the ring has to land on the project as an aim the renderer
      // agrees with, which is the whole point of carrying the orientation as a
      // matrix rather than as a Euler.
      await page.locator('#canvasDirector3dOverlay [data-mode="rotate"]').click();
      // Framing the marker first is what an operator does before reaching for a
      // handle: the shot can leave a camera sitting off the edge of the stage,
      // and a handle that is not on screen cannot be grabbed. Focus brings it to
      // the middle, and zooming out is the fallback when it does not.
      await page.locator("#canvasDirector3dOverlay .director-object:has-text('机位')").first().dblclick();
      await page.waitForTimeout(600);
      const readSpot = (id) => page.evaluate((wanted) => {
        const app = canvasDirector3dApp;
        const core = window.CanvasDirector3d;
        const item = app.project.items.find((entry) => entry.id === wanted);
        const canvas = document.querySelector("#canvasDirector3dOverlay .director-stage-canvas");
        const rect = canvas.getBoundingClientRect();
        const view = { ...app.stageView(), width: rect.width, height: rect.height };
        const point = core.screenPoint(view, { x: item.position[0], y: item.position[1], z: item.position[2] });
        return point
          ? {
            x: rect.left + point.x,
            y: rect.top + point.y,
            rotation: [...item.rotation],
            hitched: app.stage3d.gizmoAttachedTo(),
            bounds: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
          }
          : { error: "the camera marker is behind the stage camera" };
      }, id);
      let spot = await readSpot(aimed.id);
      assert.ok(!spot.error, String(spot.error || ""));
      assert.equal(spot.hitched, aimed.id, "the handles are on the camera before the ring is grabbed");
      const stageBox = await page.locator("#canvasDirector3dOverlay .director-stage-canvas").boundingBox();
      for (let step = 0; step < 10; step += 1) {
        const centre = { x: (spot.bounds.left + spot.bounds.right) / 2, y: (spot.bounds.top + spot.bounds.bottom) / 2 };
        const inside = spot.x > spot.bounds.left + 8 && spot.x < spot.bounds.right - 8
          && spot.y > spot.bounds.top + 8 && spot.y < spot.bounds.bottom - 8;
        if (inside) break;
        await page.mouse.move(centre.x, centre.y);
        await page.mouse.wheel(0, 120);
        await page.waitForTimeout(250);
        spot = await readSpot(aimed.id);
        assert.ok(!spot.error, String(spot.error || ""));
      }
      assert.ok(stageBox, "the stage has a layout box");
      assert.ok(
        spot.x > spot.bounds.left && spot.x < spot.bounds.right && spot.y > spot.bounds.top && spot.y < spot.bounds.bottom,
        `zooming out brought the camera marker on screen; centre ${JSON.stringify({ x: Math.round(spot.x), y: Math.round(spot.y) })}`,
      );
      // The ring has a constant on-screen size, so the offset from the projected
      // centre is swept until TransformControls reports a hover on a handle. The
      // marker can sit just off the edge of the stage even after framing it, so
      // an offset whose point lands outside the canvas is skipped rather than
      // moved to - it would not hover anything.
      const bounds = await page.evaluate(() => {
        const rect = document.querySelector("#canvasDirector3dOverlay .director-stage-canvas").getBoundingClientRect();
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
      });
      const inside = (x, y) => x > bounds.left + 2 && x < bounds.right - 2 && y > bounds.top + 2 && y < bounds.bottom - 2;
      let grab = null;
      for (const radius of [24, 30, 36, 42, 50, 60, 70, 80, 95, 110, 130, 150]) {
        for (let deg = 0; deg < 360 && !grab; deg += 15) {
          const x = spot.x + radius * Math.cos((deg * Math.PI) / 180);
          const y = spot.y + radius * Math.sin((deg * Math.PI) / 180);
          if (!inside(x, y)) continue;
          await page.mouse.move(x, y);
          const axis = await page.evaluate(() => canvasDirector3dApp.stage3d.gizmoAxis());
          if (axis) grab = { x, y };
        }
        if (grab) break;
      }
      assert.ok(
        grab,
        `a rotation ring is grabbable on the camera marker; centre was ${JSON.stringify(spot)}, attached ${await page.evaluate(() => canvasDirector3dApp.stage3d.gizmoAttachedTo())}`,
      );
      await page.mouse.down();
      await page.mouse.move(grab.x + 60, grab.y + 40, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(500);
      const turned = await page.evaluate((id) => {
        const app = canvasDirector3dApp;
        const core = window.CanvasDirector3d;
        const item = app.project.items.find((entry) => entry.id === id);
        const view = core.cameraViewFor(app.project, item, 0);
        const raw = [view.target.x - view.eye.x, view.target.y - view.eye.y, view.target.z - view.eye.z];
        const length = Math.hypot(raw[0], raw[1], raw[2]) || 1;
        const triple = core.rotationMatrix(item.rotation);
        return {
          rotation: [...item.rotation],
          scale: [...item.scale],
          forward: raw.map((value) => value / length),
          basis: [-triple[2], -triple[6], -triple[10]],
        };
      }, aimed.id);
      assert.deepEqual(turned.scale, [1, 1, 1], "the camera kept a unit scale after the drag");
      assert.ok(
        turned.rotation.some((value, index) => Math.abs(value - spot.rotation[index]) > 1e-3),
        `the drag moved the camera; before ${JSON.stringify(spot.rotation)} after ${JSON.stringify(turned.rotation)}`,
      );
      for (let index = 0; index < 3; index += 1) {
        const delta = Math.abs(turned.forward[index] - turned.basis[index]);
        assert.ok(delta < 1e-6, `the rendered aim matches the stored basis on axis ${index}; delta ${delta}`);
      }
      await page.locator('#canvasDirector3dOverlay [data-mode="select"]').click();
    });

    await check("clicking the subject on the stage selects it", async () => {
      // The stage picks objects with the very same projection it paints with,
      // so a refactor of the near plane clip or the gizmo filter can silently
      // break selection. Click the character and watch the object list react.
      const aim = await page.evaluate(() => {
        const core = window.CanvasDirector3d;
        const app = canvasDirector3dApp;
        const canvas = document.querySelector("#canvasDirector3dOverlay .director-stage-canvas");
        if (!canvas || !app?.project) return { error: "stage canvas or project missing" };
        const rect = canvas.getBoundingClientRect();
        const subject = app.project.items.find((item) => item.kind === "human-male");
        const view = { ...app.stageView(), width: rect.width, height: rect.height };
        const transform = core.resolveItemTransform(app.project, subject, 0);
        const chest = core.screenPoint(view, {
          x: transform.position[0],
          y: transform.position[1] + 0.9,
          z: transform.position[2],
        });
        if (!chest) return { error: "the subject is behind the stage camera" };
        return {
          subjectId: subject.id,
          selectedBefore: app.selectedId,
          x: rect.left + chest.x,
          y: rect.top + chest.y,
        };
      });
      assert.ok(!aim.error, String(aim.error || ""));
      // Adding an object focuses it, so the camera is selected at this point and
      // clicking the character has to move the selection off the camera.
      await page.locator("#canvasDirector3dOverlay .director-object:has-text('机位')").first().click();
      const beforeClick = await page.evaluate(() => {
        const app = typeof canvasDirector3dApp !== "undefined" ? canvasDirector3dApp : null;
        return app?.selectedId || "";
      });
      assert.notEqual(beforeClick, aim.subjectId, "the camera is selected so the click proves something");
      await page.mouse.click(aim.x, aim.y);
      const selected = await page.evaluate(() => ({
        id: document.querySelector("#canvasDirector3dOverlay .director-object.is-selected")?.dataset.objectId || "",
        name: document.querySelector("#canvasDirector3dOverlay .director-object.is-selected strong")?.textContent?.trim() || "",
      }));
      assert.equal(selected.id, aim.subjectId, `clicking the body selects the character; row says ${selected.name || "(nothing)"}`);
    });

    await check("dragging a joint dot on the stage poses the bone", async () => {
      // The joint dots are the headline interaction of the rigged stage, so
      // this drives a real pointer drag across one and asserts the bone moved.
      await page.locator('#canvasDirector3dOverlay .director-object').first().click();
      await page.locator("#canvasDirector3dOverlay select.director-shot").selectOption("front-full");
      await page.locator('#canvasDirector3dOverlay [data-action="apply-shot"]').click();
      await page.waitForTimeout(2500);
      const target = await page.evaluate(() => {
        const core = window.CanvasDirector3d;
        // The app is published as a bare global by the canvas script, not hung
        // off window, so it is read with a typeof guard.
        const app = typeof canvasDirector3dApp !== "undefined" ? canvasDirector3dApp : null;
        const canvas = document.querySelector("#canvasDirector3dOverlay .director-joint-layer");
        const stage = document.querySelector("#canvasDirector3dOverlay .director-stage-canvas");
        if (!canvas || !stage || !app?.project) return { error: "the stage is not up" };
        const rect = stage.getBoundingClientRect();
        const subject = app.project.items.find((item) => item.kind === "human-male");
        if (!subject) return { error: "no character in the scene" };
        const view = { ...app.stageView(), width: rect.width, height: rect.height };
        // Reuse the overlay's own last painted handles, which is the exact list
        // the pointer hit-test walks.
        const handles = document.querySelector("#canvasDirector3dOverlay")?.__jointHandles || [];
        const pick = handles.find((h) => h.id === "LeftArm") || handles[0];
        if (!pick) return { error: "no joint handles were painted" };
        return {
          subjectId: subject.id,
          bone: pick.id,
          x: rect.left + pick.x,
          y: rect.top + pick.y,
          before: Number(subject.joints?.[pick.id]?.[pick.axis || "x"]) || 0,
          axis: pick.axis || "x",
        };
      });
      assert.ok(!target.error, String(target.error || ""));
      await page.mouse.move(target.x, target.y);
      await page.mouse.down();
      await page.mouse.move(target.x + 45, target.y, { steps: 6 });
      await page.mouse.up();
      const after = await page.evaluate((bone) => {
        const app = typeof canvasDirector3dApp !== "undefined" ? canvasDirector3dApp : null;
        const subject = app?.project?.items?.find((item) => item.kind === "human-male");
        const entry = subject?.joints?.[bone] || {};
        return { x: Number(entry.x || 0), y: Number(entry.y || 0), z: Number(entry.z || 0) };
      }, target.bone);
      const moved = Math.abs(after.x) + Math.abs(after.y) + Math.abs(after.z);
      assert.ok(moved > 1, `dragging the ${target.bone} dot wrote a joint angle; got ${JSON.stringify(after)}`);
    });

    await check("the shot preset renders a non-empty camera preview", async () => {
      await page.locator("#canvasDirector3dOverlay select.director-shot").selectOption("front-full");
      await page.locator('#canvasDirector3dOverlay [data-action="apply-shot"]').click();
      // Opaque pixels alone are worthless here: the stage always paints a sky
      // gradient, so an empty shot still counts. What matters is that lit
      // subject pixels reach the frame, which is exactly what a camera gizmo
      // sitting on the lens used to hide.
      const preview = await page.evaluate(() => {
        const canvas = document.querySelector("#canvasDirector3dOverlay .director-preview-canvas");
        if (!canvas) return -1;
        const context = canvas.getContext("2d");
        if (!context) return -1;
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        let brightPixels = 0;
        for (let index = 0; index < data.length; index += 4) {
          if (data[index + 3] > 8 && (data[index] + data[index + 1] + data[index + 2]) / 3 > 80) brightPixels += 1;
        }
        return brightPixels;
      });
      assert.ok(preview > 1200, `the preview shows lit geometry, got ${preview} bright pixels`);
      const framed = await page.evaluate(() => {
        const core = window.CanvasDirector3d;
        const canvas = document.querySelector("#canvasDirector3dOverlay .director-preview-canvas");
        const project = canvasDirector3dApp?.project;
        if (!project) return { error: "the open stage did not expose its live project" };
        const camera = (project?.items || []).find((item) => item.kind === "camera");
        const view = { ...core.cameraViewFor(project, camera, 0), width: canvas.width, height: canvas.height };
        const subject = (project?.items || []).find((item) => item.kind === "human-male");
        const transform = core.resolveItemTransform(project, subject, 0);
        const chest = core.screenPoint(view, { x: transform.position[0], y: transform.position[1] + 0.9, z: transform.position[2] });
        const feet = core.screenPoint(view, { x: transform.position[0], y: 0, z: transform.position[2] });
        const context = canvas.getContext("2d");
        // A single pixel is too brittle to prove "the subject is visible": the
        // chest point of a real character can land on a dark strap. The sample
        // takes the brightest pixel in a small patch, which is what "lit
        // geometry is here" actually means.
        const sample = (point, radius = 6) => {
          if (!point) return null;
          const x = Math.min(canvas.width - 1, Math.max(0, Math.round(point.x)));
          const y = Math.min(canvas.height - 1, Math.max(0, Math.round(point.y)));
          const x0 = Math.max(0, x - radius);
          const y0 = Math.max(0, y - radius);
          const w = Math.min(canvas.width - x0, radius * 2 + 1);
          const h = Math.min(canvas.height - y0, radius * 2 + 1);
          const { data } = context.getImageData(x0, y0, w, h);
          let best = null;
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 9) continue;
            const luminance = (data[i] + data[i + 1] + data[i + 2]) / 3;
            if (!best || luminance > best.luminance) best = { rgb: [data[i], data[i + 1], data[i + 2]], luminance };
          }
          return best ? { x, y, rgb: best.rgb, luminance: best.luminance } : { x, y, rgb: [0, 0, 0], luminance: 0 };
        };
        return { width: canvas.width, height: canvas.height, chest, feet, chestPixel: sample(chest) };
      });
      assert.ok(
        framed.chestPixel && framed.chestPixel.luminance > 80,
        `the subject is visible at its chest point; sampled ${JSON.stringify(framed.chestPixel)}`,
      );
      assert.ok(framed.chest, "the subject chest is in front of the camera after the preset");
      assert.ok(
        framed.chest.x > framed.width * 0.3 && framed.chest.x < framed.width * 0.7,
        `the preset centres the subject horizontally; chest x = ${Math.round(framed.chest.x)} of ${framed.width}`,
      );
      assert.ok(
        framed.chest.y > framed.height * 0.2 && framed.feet.y <= framed.height + 1,
        `the preset keeps the subject in frame; chest y = ${Math.round(framed.chest.y)}, feet y = ${Math.round(framed.feet.y)} of ${framed.height}`,
      );
    });

    await check("exporting a frame adds a connected image node to the canvas", async () => {
      const before = await page.evaluate(() => ({
        nodes: document.querySelectorAll("#canvasPlane .canvas-node-image").length,
        edges: document.querySelectorAll("#canvasConnections .canvas-connection-hit").length,
        directorId: document.querySelector("#canvasPlane .canvas-node-director3d")?.dataset.id || "",
      }));
      await page.locator('#canvasDirector3dOverlay [data-action="export"]').click();
      await page.waitForFunction((count) => document.querySelectorAll("#canvasPlane .canvas-node-image").length > count, before.nodes, { timeout: 20000 });
      await page.waitForFunction((count) => document.querySelectorAll("#canvasConnections .canvas-connection-hit").length > count, before.edges, { timeout: 20000 });
      await page.waitForFunction(
        () => [...document.querySelectorAll("#canvasPlane .canvas-node-image img")].some((img) => img.complete && img.naturalWidth > 0),
        null,
        { timeout: 30000 },
      );
      const after = await page.evaluate((directorId) => {
        const hits = [...document.querySelectorAll("#canvasConnections .canvas-connection-hit")];
        return {
          nodes: document.querySelectorAll("#canvasPlane .canvas-node-image").length,
          edges: hits.length,
          linked: hits.some((hit) => hit.dataset.connectionFrom === directorId),
          images: [...document.querySelectorAll("#canvasPlane .canvas-node-image img")].filter((img) => img.complete && img.naturalWidth > 0).length,
        };
      }, before.directorId);
      assert.equal(after.nodes, before.nodes + 1, "exactly one image node was added");
      assert.equal(after.edges, before.edges + 1, "the exported frame is wired to the stage");
      assert.ok(after.linked, "the new edge starts at the 3D stage node");
      assert.ok(after.images >= 1, "the exported image actually decoded");
      // The frame has to be a real shot, not a flat dark card: the export used
      // to paint the camera gizmo over everything and look almost black.
      const exported = await page.evaluate(() => {
        const image = [...document.querySelectorAll("#canvasPlane .canvas-node-image img")].find((node) => node.complete && node.naturalWidth > 0);
        if (!image) return { error: "no decoded frame image" };
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
        const colors = new Set();
        let bright = 0;
        for (let index = 0; index < data.length; index += 4) {
          if ((data[index] + data[index + 1] + data[index + 2]) / 3 > 80) bright += 1;
          if (colors.size < 32) colors.add(`${data[index]},${data[index + 1]},${data[index + 2]}`);
        }
        return { width: canvas.width, height: canvas.height, bright, colors: colors.size };
      });
      assert.ok(exported.bright > 1000, `the exported frame shows lit geometry; got ${exported.bright} bright pixels of ${exported.width}x${exported.height}`);
      assert.ok(exported.colors > 3, `the exported frame is not flat; sampled ${exported.colors} distinct colours`);
    });

    await check("saving the scene stores a preview on the canvas card", async () => {
      await page.locator('#canvasDirector3dOverlay [data-action="save"]').click();
      await page.waitForFunction(() => Boolean(document.querySelector("#canvasPlane .canvas-node-director3d .canvas-director-cover-img")), null, { timeout: 30000 });
      // The card can re-render while the preview uploads, which swaps in a fresh
      // lazy image element, so the decode is polled instead of sampled once.
      let cover = null;
      for (let index = 0; index < 60; index += 1) {
        cover = await page.evaluate(() => {
          const image = document.querySelector("#canvasPlane .canvas-node-director3d .canvas-director-cover-img");
          return {
            complete: Boolean(image?.complete),
            width: image?.naturalWidth || 0,
            src: image?.getAttribute("src") || "",
            stored: String(document.querySelector("#canvasPlane .canvas-node-director3d")?.dataset.directorPreviewSrc || ""),
          };
        });
        if (cover.width > 0) break;
        await page.waitForTimeout(500);
      }
      assert.ok(cover.width > 0, `the cover image decoded; complete=${cover.complete} src=${cover.src.slice(0, 60)} stored=${cover.stored.slice(0, 60)}`);
      assert.ok(cover.src.length > 0, "the card preview points at somewhere");
    });

    await check("closing the stage returns to the canvas and persists the project", async () => {
      await page.locator('#canvasDirector3dOverlay [data-action="close"]').click();
      await page.locator("#canvasDirector3dOverlay").waitFor({ state: "detached", timeout: 20000 });
      let saved = null;
      let lastSeen = null;
      for (let index = 0; index < 60; index += 1) {
        const exported = await request(`/api/canvas/boards/${BOARD_ID}/export`, host);
        assert.equal(exported.status, 200, "the board export is readable");
        const candidate = (exported.data?.nodes || []).find((node) => node?.kind === "director-3d");
        lastSeen = candidate || lastSeen;
        if (candidate && (candidate.directorProject?.items || []).length >= 2) {
          saved = candidate;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      assert.ok(saved, `the saved stage reached the board snapshot; last seen: ${JSON.stringify({ found: Boolean(lastSeen), items: lastSeen?.directorProject?.items?.length ?? null })}`);
      assert.ok(saved.directorProject, "the node carries its director project");
      assert.equal(saved.directorProject.version, 1);
      assert.ok(Array.isArray(saved.directorProject.items) && saved.directorProject.items.length >= 2, "the scene kept its objects");
      assert.ok(saved.directorPreviewSrc, "the node carries a preview reference");
    });

    await check("reopening the board restores the scene and its preview", async () => {
      await page.reload();
      await page.locator("#aiOsDesktop:not([hidden])").waitFor();
      await page.locator('[data-ai-app="canvas"]').click();
      await page.locator(".canvas-board-item").filter({ hasText: BOARD_TITLE }).first().click();
      await page.locator("#canvasEditorScreen").waitFor();
      await page.waitForFunction(() => Boolean(document.querySelector("#canvasPlane .canvas-node-director3d .canvas-director-cover-img")));
      let restored = null;
      for (let index = 0; index < 60; index += 1) {
        restored = await page.evaluate(() => {
          const node = document.querySelector("#canvasPlane .canvas-node-director3d");
          const image = node?.querySelector(".canvas-director-cover-img");
          return {
            name: node?.dataset.directorSceneName || "",
            hasPreview: Boolean(node?.dataset.directorPreviewSrc),
            coverWidth: image?.naturalWidth || 0,
          };
        });
        if (restored.coverWidth > 0) break;
        await page.waitForTimeout(500);
      }
      assert.ok(restored.name.length > 0, "the scene name survived the reload");
      assert.ok(restored.hasPreview, "the stored preview survived the reload");
      assert.ok(restored.coverWidth > 0, "the restored cover still decodes");
      await page.locator("#canvasPlane .canvas-node-director3d").first().locator(".canvas-director-open").first().click();
      await page.locator("#canvasDirector3dOverlay").waitFor();
      await page.waitForFunction(() => document.querySelectorAll("#canvasDirector3dOverlay .director-object").length === 2);
      const stage = await page.evaluate(() => ({
        objects: document.querySelectorAll("#canvasDirector3dOverlay .director-object").length,
        name: document.querySelector("#canvasDirector3dOverlay .director-name")?.value || "",
      }));
      assert.equal(stage.objects, 2, "the character and the camera came back");
      assert.equal(stage.name, restored.name, "the stage reopened with the saved name");
    });

    await check("the agent tool drives the stage through the capability adapter", async () => {
      const outcome = await page.evaluate(async () => {
        const adapters = window.CanvasAgentToolAdapters.create({ canvasApi: window.CanvasAgentCanvasApi });
        const result = await adapters.canvas_director3d_apply_animation(
          { node_id: null, shot_preset: "side-medium", camera_motion: "dolly-in", x: null, y: null },
          { scope: { boardId: canvasState.activeBoardId }, assertActive: () => true },
        );
        const node = document.querySelector("#canvasPlane .canvas-node-director3d");
        const project = readCanvasDirector3dProject(node);
        const camera = (project?.items || []).find((item) => item.kind === "camera");
        return {
          result,
          nodeId: String(node?.dataset.id || ""),
          itemCount: (project?.items || []).length,
          keyframes: (project?.keyframes || []).filter((key) => key.itemId === camera?.id).length,
          overlayObjects: document.querySelectorAll("#canvasDirector3dOverlay .director-object").length,
        };
      });
      assert.equal(outcome.result.node_id, outcome.nodeId, "the tool reported the stage it编排");
      assert.equal(outcome.result.camera_motion, "dolly-in");
      assert.equal(outcome.result.shot_preset, "side-medium");
      assert.ok(outcome.result.keyframes > 0, "the camera motion recorded keyframes");
      assert.equal(outcome.result.camera_count, 1, "the stage still has exactly one camera");
      assert.ok(outcome.itemCount >= 2, "the scene kept its objects");
      assert.ok(outcome.result.objects.length >= 2, "the tool described the scene objects");
      assert.equal(outcome.result.camera_motion_presets.length, 9, "the tool hands back the motion catalog");
      assert.ok(outcome.result.message.includes("推进镜头"), `the summary names the motion in Chinese; got ${outcome.result.message}`);
      assert.equal(outcome.overlayObjects, 2, "the open stage refreshed in place");
      assert.ok(outcome.keyframes > 0, "the keyframes were written to the node project");
      await page.locator('#canvasDirector3dOverlay [data-action="close"]').click();
      await page.locator("#canvasDirector3dOverlay").waitFor({ state: "detached", timeout: 20000 });
    });

    assert.deepEqual(errors, [], `the canvas page stayed free of errors; saw: ${JSON.stringify(errors)}`);
    await context.close();
  } finally {
    if (browser) await browser.close().catch(() => {});
    child.kill();
    await new Promise((resolve) => setTimeout(resolve, 200));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }

  if (failures.length) {
    console.error(`\ncanvas-director3d-browser: ${failures.length} check(s) failed`);
    process.exitCode = 1;
    return;
  }
  console.log("\ncanvas-director3d-browser: all checks passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
